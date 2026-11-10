import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERMS } from '../src/engine/glossary.ts';
import {
  AUTHORS_DIR, buildIndex, formatIndex, guessKind, INDEX_PATH, KINDS, LEVELS, PENDING_VOICES, readIndex,
  SAMPLES_DIR, splitSample, type SampleEntry,
} from '../scripts/index-samples.ts';

const index = readIndex();
const texts = readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.txt'));
const authors = readdirSync(AUTHORS_DIR).filter((f) => f.endsWith('.json'));
const built = new Set(authors.map((f) => f.replace(/\.json$/, '')));
const moves = new Set(
  authors.flatMap((f) => ((JSON.parse(readFileSync(join(AUTHORS_DIR, f), 'utf8')).moves ?? []) as { id: string }[]).map((m) => m.id)),
);
const glossary = new Set(TERMS.map((t) => t.id));

describe('samples/index.json', () => {
  it('has one entry for every sample and a sample for every entry', () => {
    expect(index.map((e) => e.file).sort()).toEqual([...texts].sort());
    expect(new Set(index.map((e) => e.id)).size).toBe(index.length);
    for (const e of index) expect(e.file).toBe(`${e.id}.txt`);
  });

  it('uses only the allowed kinds and levels', () => {
    for (const e of index) {
      expect(KINDS, e.id).toContain(e.kind);
      expect(LEVELS, e.id).toContain(e.level);
    }
  });

  it('teaches terms the glossary defines or moves some voice makes', () => {
    for (const e of index) {
      expect(e.teaches.length, e.id).toBeGreaterThan(0);
      for (const t of e.teaches) expect(glossary.has(t) || moves.has(t), `${e.id}: ${t}`).toBe(true);
    }
  });

  it('names voices that are built, or planned under pending', () => {
    for (const e of index) {
      expect(e.bestVoices.length + e.pending.length, e.id).toBeGreaterThan(0);
      for (const v of e.bestVoices) expect(built.has(v), `${e.id}: ${v}`).toBe(true);
      for (const v of e.pending) expect(PENDING_VOICES.includes(v) && !built.has(v), `${e.id}: ${v}`).toBe(true);
    }
  });

  it('counts words within 2% of the text', () => {
    for (const e of index) {
      const body = readFileSync(join(SAMPLES_DIR, e.file), 'utf8').split('\n').slice(1).join('\n');
      const actual = body.split(/\s+/).filter(Boolean).length;
      expect(Math.abs(e.words - actual) / actual, e.id).toBeLessThanOrEqual(0.02);
    }
  });

  it('gives every sample its own title, taken from the heading', () => {
    expect(new Set(index.map((e) => e.title)).size).toBe(index.length);
    for (const e of index) expect(e.title, e.id).toBe(splitSample(readFileSync(join(SAMPLES_DIR, e.file), 'utf8')).title);
  });

  it('is what the script writes', () => {
    expect(formatIndex(buildIndex(index))).toBe(readFileSync(INDEX_PATH, 'utf8'));
  });
});

describe('index-samples', () => {
  it('guesses kind from cues', () => {
    expect(guessKind('Review: A Lamp', 'It is bright.')).toBe('review');
    expect(guessKind('Hello', 'Dear Sam,\n\nThe lake is cold.')).toBe('letter');
    expect(guessKind('A Walk', 'I walked to the shop. "Hi," she said. I waved and I left.')).toBe('story');
    expect(guessKind('Bells', 'Schools should ring bells, because bells work, and we must keep them.')).toBe('argument');
    expect(guessKind('Thanks', 'Hello everyone, thank you for coming tonight.')).toBe('speech');
    expect(guessKind('Rain', 'Rain falls on the city. The streets shine.')).toBe('essay');
  });

  it('keeps hand-set fields, guesses the rest, and moves a voice out of pending once it is built', () => {
    const dir = mkdtempSync(join(tmpdir(), 'samples-'));
    writeFileSync(join(dir, 'a.txt'), '# Alpha\n\nOne two three.\n');
    writeFileSync(join(dir, 'b.txt'), '# Beta\n\nDear Jo,\n\nFour five.\n');
    const old: SampleEntry[] = [{
      id: 'a', file: 'a.txt', title: 'Old', kind: 'speech', level: 'college', words: 1,
      teaches: ['tricolon'], bestVoices: ['obama'], pending: ['lincoln'],
    }];
    const [a, b] = buildIndex(old, dir, new Set(['obama', 'lincoln']));
    expect(a).toEqual({
      id: 'a', file: 'a.txt', title: 'Alpha', kind: 'speech', level: 'college', words: 3,
      teaches: ['tricolon'], bestVoices: ['obama', 'lincoln'], pending: [],
    });
    expect(b).toMatchObject({ id: 'b', title: 'Beta', kind: 'letter', words: 4, teaches: [], pending: [] });
  });
});
