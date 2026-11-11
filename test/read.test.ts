// The engine's reading of a student's text (POST /api/read): kind, never-used words, the shape sketch, voice ID and
// suggestions and the page's boot data. The checks that need a voice run where its pack is built
// (node scripts/build-packs.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT, authorDbPath, open } from '../src/db.ts';
import { loadPack, type Pack } from '../src/engine/pack.ts';
import { editDistance, editSimilarity, lineClass, nearest, SKETCH_THRESHOLD } from '../src/engine/shape.ts';
import { soundsLike, suggest, voiceScores } from '../src/engine/voiceid.ts';

// Keyless: no route may reach a model.
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[k];

const ids = readdirSync(join(ROOT, 'authors'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5));
const packs: Pack[] = ids.filter((id) => existsSync(authorDbPath(id))).map((id) => loadPack(id)).filter((p): p is Pack => !!p);
const hasAusten = packs.some((p) => p.id === 'austen');
const sample = (id: string) => readFileSync(join(ROOT, 'samples', `${id}.txt`), 'utf8');

describe('shape', () => {
  it('measures edit distance and similarity', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editSimilarity('NVJ.', 'NVJ.')).toBe(1);
    expect(editSimilarity('NNNN', 'VVVV')).toBe(0);
  });

  it('tells a salutation and a sign-off from a sentence', () => {
    expect(lineClass('Dear Mom and Dad,')).toBe('salutation');
    expect(lineClass('My dear Jane,')).toBe('salutation');
    expect(lineClass('Love, Jake')).toBe('signoff');
    expect(lineClass('O, sir, let it not trouble you.')).toBe('sentence');
    expect(lineClass('Dear diary, today was long.')).toBe('sentence');
  });

  it.skipIf(!packs.length)('sketches a salutation only to a salutation, in every voice', () => {
    for (const p of packs) {
      const m = nearest('Dear Mom and Dad,', p);
      if (m) expect(lineClass(m.entry.text), `${p.id}: ${m.entry.text}`).toBe('salutation');
      expect(m?.entry.text).not.toBe('O, sir, let it not trouble you.');
      // An ordinary sentence is never sketched to a salutation.
      const s = nearest('Camp is okay I guess.', p);
      if (s) expect(lineClass(s.entry.text)).toBe('sentence');
    }
  });
});

describe.skipIf(packs.length < 3)('voice ID', () => {
  // With twenty voices a single sentence is a hard test: about 68% are named right, against 5% by chance. The page
  // reads passages, and three sentences together are named right nearly nine times in ten.
  it('names the voice of a held-out corpus sentence at least 60% of the time', () => {
    const per: Record<string, number> = {};
    let right = 0;
    let n = 0;
    for (const p of packs) {
      const seen = new Set(p.shape.map((e) => e.id));
      const db = open(authorDbPath(p.id), { readOnly: true });
      const pool = (db.prepare('SELECT id, text FROM sentences WHERE words BETWEEN 6 AND 60 ORDER BY id').all() as { id: number; text: string }[]).filter((r) => !seen.has(r.id));
      db.close();
      // A small corpus (Douglass, the Federalist) is wholly in its shape index, so none of it is held out.
      if (pool.length < 100) continue;
      const step = Math.floor(pool.length / 100);
      per[p.id] = 0;
      for (let i = 0; i < 100; i++) {
        n++;
        if (soundsLike(packs, pool[i * step]!.text, { leaveOut: p.id }) === p.id) {
          right++;
          per[p.id]!++;
        }
      }
    }
    expect(right / n, JSON.stringify(per)).toBeGreaterThanOrEqual(packs.length > 10 ? 0.6 : 0.8);
    // Every voice is told apart far above chance; Wilde and Twain, whose works range widest, are the hardest.
    for (const [v, k] of Object.entries(per)) expect(k, `${v}: ${JSON.stringify(per)}`).toBeGreaterThanOrEqual(packs.length > 10 ? 35 : 55);
  });

  it('names the voice of a three-sentence passage at least 80% of the time', () => {
    const per: Record<string, number> = {};
    let right = 0;
    let n = 0;
    for (const p of packs) {
      const db = open(authorDbPath(p.id), { readOnly: true });
      const all = db.prepare('SELECT text FROM sentences WHERE words BETWEEN 6 AND 60 ORDER BY id').all() as { text: string }[];
      db.close();
      const step = Math.floor((all.length - 3) / 30);
      per[p.id] = 0;
      for (let i = 0; i < 30; i++) {
        n++;
        const passage = all.slice(i * step, i * step + 3).map((r) => r.text).join(' ');
        if (soundsLike(packs, passage, { leaveOut: p.id }) === p.id) {
          right++;
          per[p.id]!++;
        }
      }
    }
    expect(right / n, JSON.stringify(per)).toBeGreaterThanOrEqual(0.8);
    for (const [v, k] of Object.entries(per)) expect(k, `${v}: ${JSON.stringify(per)}`).toBeGreaterThanOrEqual(15);
  });

  it('suggests three different voices, the kind’s voice suited to the kind', () => {
    const voices = packs.map((p) => ({ id: p.id, goodFor: JSON.parse(readFileSync(join(ROOT, 'authors', `${p.id}.json`), 'utf8')).goodFor ?? [] }));
    const s = suggest(packs, voices, 'story', 'Once upon a time there lived a poor woodcutter who had three sons.');
    const three = [s.kind, s.soundsLike, s.stretch];
    expect(three.every(Boolean)).toBe(true);
    expect(new Set(three).size).toBe(3);
    expect(s.soundsLike).toBe(voiceScores(packs, 'Once upon a time there lived a poor woodcutter who had three sons.')[0]!.voice);
  });
});

describe.skipIf(!hasAusten)('POST /api/read and GET /api/boot', () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    const { createApp } = await import('../src/server/app.ts');
    server = await createApp();
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));
  const read = (voice: string, text: string) => fetch(`${base}/api/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice, text }) });

  it('reads the homework sample as an argument, with at most five never-words and a sketch row a sentence', async () => {
    const r = await read('austen', sample('homework'));
    expect(r.status).toBe(200);
    const a = await r.json();
    expect(a.kind).toBe('argument');
    expect(a.never.length).toBeGreaterThan(0);
    expect(a.never.length).toBeLessThanOrEqual(5);
    for (const w of a.never) {
      expect(w.note).toMatch(/^Austen never wrote “/);
      const para: string = a.paragraphs[w.paragraph];
      expect(para.slice(w.start, w.end)).toBe(w.word);
    }
    // One row for each of the 12 sentences, each a sketch at or above the threshold or an explicit null.
    expect(a.sketch.length).toBe(12);
    for (const row of a.sketch) {
      expect(row).toHaveProperty('match');
      if (row.match) expect(row.match.score).toBeGreaterThanOrEqual(SKETCH_THRESHOLD - 0.005);
      expect(a.paragraphs[row.paragraph].slice(row.start, row.end)).toBe(row.text);
    }
    expect(a.roles.length).toBe(a.paragraphs.length);
    expect(a.style.line).toMatch(/^Words a sentence: yours \d+, Austen \d+\./);
    // Against her narration, as Try it measures it, though she wrote more sentences of dialogue.
    const austen = packs.find((p) => p.id === 'austen')!;
    expect(a.style.voice).toBe(Math.round(austen.profile.sentenceLength.narration.p50));
    expect(Object.keys(a.suggest).sort()).toEqual(['kind', 'soundsLike', 'stretch']);
  });

  it('sketches the camp letter’s salutation to a salutation or to nothing', async () => {
    const a = await (await read('shakespeare', sample('camp-letter'))).json();
    expect(a.kind).toBe('letter');
    const first = a.sketch[0];
    expect(first.text).toBe('Dear Mom and Dad,');
    if (first.match) expect(lineClass(first.match.text)).toBe('salutation');
    expect(first.match?.text).not.toBe('O, sir, let it not trouble you.');
  });

  it('sends the outline of a real piece by the voice, of the text’s kind, and never the word “Part”', async () => {
    const a = await (await read('austen', sample('camp-letter'))).json();
    expect(a.shape.outlines.map((o: { kind: string }) => o.kind)).toEqual(['letter', 'letter']);
    const first = a.shape.outlines[0];
    expect(first.work).toBe('Darcy’s letter, in Pride and Prejudice');
    expect(first.line).toBe(first.parts.map((p: { name: string }) => p.name).join(' · '));
    for (const p of first.parts) expect(p.says && p.quote && p.name).toBeTruthy();
    const story = await (await read('austen', sample('store'))).json();
    expect(story.shape.outlines[0].work).toBe('the first chapter of Pride and Prejudice');
    expect(story.shape.yours).not.toMatch(/Part/);
    expect(story.shape.yours).toMatch(/…/);
    expect(story.shape).not.toHaveProperty('signature');
  });

  it('refuses a voice that is not built, and an empty text', async () => {
    expect((await read('../nobody', 'Hello there.')).status).toBe(404);
    expect((await read('austen', '   ')).status).toBe(400);
  });

  it('answers in under 300 ms at the 95th percentile once warm', async () => {
    const texts = ['homework', 'camp-letter', 'debate-rebuttal', 'store', 'neighbors'].filter((s) => existsSync(join(ROOT, 'samples', `${s}.txt`))).map(sample);
    const voices = packs.map((p) => p.id).slice(0, 3);
    for (const v of voices) for (const t of texts) await read(v, t);
    const times: number[] = [];
    for (let round = 0; round < 2; round++)
      for (const v of voices)
        for (const t of texts) {
          const t0 = performance.now();
          expect((await read(v, t)).status).toBe(200);
          times.push(performance.now() - t0);
        }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    expect(p95, times.map(Math.round).join(' ')).toBeLessThan(300);
  });

  it('boots the page in one request, naming no key', async () => {
    const r = await fetch(`${base}/api/boot`);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.voices.some((v: { id: string; family: string }) => v.id === 'austen' && v.family)).toBe(true);
    expect(b.samples.length).toBeGreaterThan(0);
    expect(b.glossary.length).toBeGreaterThan(0);
    expect(b.ai).toEqual({ available: false });
    expect(typeof b.ready).toBe('object');
    expect(JSON.stringify(b.ai)).not.toMatch(/API_KEY/);
  });
});
