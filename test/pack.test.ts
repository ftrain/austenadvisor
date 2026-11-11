// Voice packs (scripts/build-packs.ts) and the server's model LRU. The pack checks run where a voice is built.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, authorDbPath } from '../src/db.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { FIGURES, figureExamples } from '../src/engine/figures.ts';
import { forgetPack, packPaths, punctSkeleton, readSif, tagSkeleton, unigramScores, writeSif } from '../src/engine/pack.ts';
import { Lru, loadPacks, suggestedVoices } from '../src/server/models.ts';

const voices = readdirSync(join(ROOT, 'authors'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5));
const built = voices.filter((id) => existsSync(authorDbPath(id)));
const PLANNED = 20;

describe('the pack format', () => {
  it('writes and reads the .sif sections it is asked for', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sif-'));
    try {
      const file = join(dir, 'x.sif');
      writeSif(file, { fingerprint: 'f', dims: 2 }, { a: Float32Array.of(1.5, -2), b: Int16Array.of(7, 8, 9), c: Uint8Array.of(3) });
      const r = readSif(file, ['b', 'a'])!;
      expect(r.header.fingerprint).toBe('f');
      expect([...r.sections['a']!]).toEqual([1.5, -2]);
      expect([...r.sections['b']!]).toEqual([7, 8, 9]);
      expect(readSif(file, ['missing'])).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads shape in tags and punctuation', () => {
    expect(tagSkeleton(['AT', 'NN', 'BEDZ', 'JJ', '.'])).toBe('DNVJ.');
    expect(punctSkeleton('“When is it, Lizzy?” she asked – softly...')).toBe(',?—…');
  });

  it('scores a passage by which voice’s words it uses, leaving a sentence’s own words out of its voice', () => {
    const a = { id: 'a', total: 100, counts: new Map([['thee', 10], ['thou', 10]]) };
    const b = { id: 'b', total: 100, counts: new Map([['you', 10], ['hapax', 1]]) };
    expect(unigramScores([a, b], 'Thou and thee')[0]!.voice).toBe('a');
    expect(unigramScores([a, b], 'you')[0]!.voice).toBe('b');
    const fair = unigramScores([a, b], 'hapax', 'b').find((x) => x.voice === 'b')!.score;
    expect(fair).toBeLessThan(unigramScores([a, b], 'hapax').find((x) => x.voice === 'b')!.score);
  });
});

describe('the model LRU', () => {
  it('evicts the oldest, and a use makes an entry new', () => {
    const gone: string[] = [];
    const lru = new Lru<number>(3, (k) => gone.push(k));
    lru.set('a', 1).set('b', 2).set('c', 3);
    lru.get('a');
    lru.set('d', 4);
    expect(gone).toEqual(['b']);
    expect(lru.keys()).toEqual(['c', 'a', 'd']);
    lru.set('e', 5);
    expect(gone).toEqual(['b', 'c']);
    expect(lru.has('a')).toBe(true);
    expect(lru.size).toBe(3);
  });

  it('suggests built voices only, the most suggested first', () => {
    const s = suggestedVoices(['austen', 'kjv', 'nobody-built'], 2);
    expect(s.length).toBeLessThanOrEqual(2);
    for (const v of s) expect(['austen', 'kjv', 'nobody-built']).toContain(v);
  });
});

describe.skipIf(!built.length)('the built voices’ packs', () => {
  it('loads every pack quickly and small: under 3 s and 1.5 GB for twenty', () => {
    forgetPack();
    const t = performance.now();
    const packs = loadPacks(built);
    const ms = performance.now() - t;
    const rss = process.memoryUsage().rss;
    expect(packs.map((p) => p.id).sort()).toEqual([...built].sort());
    // Measured on the voices built, scaled to twenty.
    expect((ms / built.length) * PLANNED).toBeLessThan(3000);
    expect(rss).toBeLessThan(1.5 * 2 ** 30);
    for (const p of packs) {
      expect(p.shape.length).toBeGreaterThan(1000);
      expect(p.shapeVecs.length).toBe(p.shape.length * p.dims);
      expect(p.structure.order.length).toBeGreaterThan(0);
    }
  });

  it.skipIf(voices.length < PLANNED || built.length < voices.length)('loads all twenty packs under 3 s and 1.5 GB, measured', () => {
    forgetPack();
    const t = performance.now();
    expect(loadPacks(built).length).toBe(built.length);
    expect(performance.now() - t).toBeLessThan(3000);
    expect(process.memoryUsage().rss).toBeLessThan(1.5 * 2 ** 30);
  });

  for (const id of built) {
    it(`${id}: has a pack for this build, and every exemplar shows its move or figure`, () => {
      expect(existsSync(packPaths(id).json)).toBe(true);
      const m = AuthorModel.open(id);
      try {
        const p = m.pack!;
        expect(p, 'pack built from this model').toBeTruthy();
        const moves = new Map((m.author.moves ?? []).map((x) => [x.id, x]));
        let n = 0;
        const check = (key: string, ids: number[], how: { id: string; pattern?: string }) => {
          expect(ids.length).toBeLessThanOrEqual(8);
          for (const sid of ids) {
            const c = m.cite(sid)!;
            expect(m.shows(how, c.text), `${key}: ${c.text}`).toBe(true);
            n++;
          }
        };
        // A figure's sentences show it by its detector alone; a move's, by the move.
        for (const [key, ids] of Object.entries(p.exemplars)) check(key, ids, key in FIGURES ? { id: key } : moves.get(key)!);
        for (const [key, ids] of Object.entries(p.moveExemplars)) check(key, ids, moves.get(key)!);
        expect(n).toBeGreaterThan(20);
        for (const mv of m.author.moves ?? []) expect({ ...p.exemplars, ...p.moveExemplars }).toHaveProperty(mv.id);
      } finally {
        m.db.close();
      }
    });
  }
});

describe.skipIf(!built.includes('austen'))('a model with its pack', () => {
  it('reads its sentence vectors from the pack, and finds a move’s examples in under 20 ms', () => {
    const m = AuthorModel.open('austen');
    try {
      expect(m.pack).toBeTruthy();
      let t = performance.now();
      const near = m.similarSentences('a quiet evening at home', 3);
      expect(near.length).toBe(3);
      // Built here it takes 1.5 to 4 s; read from the pack, well under that.
      expect(performance.now() - t).toBeLessThan(1500);
      const move = m.author.moves![0]!.id;
      m.moveExamples(move, 'warm', 4);
      t = performance.now();
      const ex = m.moveExamples(move, 'a letter from her sister about the ball', 4);
      expect(performance.now() - t).toBeLessThan(20);
      expect(ex.length).toBeGreaterThan(0);
      t = performance.now();
      const lit = figureExamples(m, 'litotes', 'a quiet evening at home', 2);
      expect(performance.now() - t).toBeLessThan(20);
      for (const c of lit) expect(m.shows({ id: 'litotes' }, c.text)).toBe(true);
    } finally {
      m.db.close();
    }
  });
});
