// The essayists and the arguer built from authors/wilde.json, chesterton.json, emerson.json and thoreau.json: each
// model loads, holds a sensible number of words, cites its best-known lines where they stand, and finds every move
// in at least twenty of its own sentences without finding it in most of them.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { AuthorModel } from '../src/engine/model.ts';

interface Case {
  id: string;
  words: [number, number];
  lines: [string, RegExp][];
}

const cases: Case[] = [
  {
    id: 'wilde',
    words: [200_000, 320_000],
    lines: [
      ['The only way to get rid of a temptation is to yield to it', /^The Picture of Dorian Gray, ch\. 2, ¶ \d+$/],
      ['We are all in the gutter', /^Lady Windermere’s Fan, “Act 3”, ¶ \d+$/],
      ['All art is quite useless', /^The Preface to Dorian Gray, “Preface”, ¶ \d+$/],
      ['The truth is rarely pure and never simple', /^The Importance of Being Earnest, “Act 1”, ¶ \d+$/],
      ['Lying, the telling of beautiful untrue things', /^Intentions, “The Decay of Lying/i],
    ],
  },
  {
    id: 'chesterton',
    words: [400_000, 600_000],
    lines: [
      ['Angels can fly because they can take themselves lightly', /^Orthodoxy, ch\. 7, ¶ \d+$/],
      ['The madman is not the man who has lost his reason', /^Orthodoxy, ch\. 2, ¶ \d+$/],
    ],
  },
  {
    id: 'emerson',
    words: [220_000, 330_000],
    lines: [
      ['A foolish consistency is the hobgoblin of little minds', /^Essays, “Self-Reliance”, ¶ \d+$/i],
      ['I become a transparent eye-ball', /^Nature, ch\. 1, ¶ \d+$/],
      ['Our age is retrospective', /^Nature, “Introduction”, ¶ 1$/],
    ],
  },
  {
    id: 'thoreau',
    words: [380_000, 500_000],
    lines: [
      ['The mass of men lead lives of quiet desperation', /^Walden, “Economy”, ¶ \d+$/],
      ['I went to the woods because I wished to live deliberately', /^Walden, “Where I Lived, and What I Lived For”, ¶ \d+$/i],
    ],
  },
];

describe.each(cases)('the voice of $id', ({ id, words, lines }) => {
  const built = existsSync(authorDbPath(id));

  describe.skipIf(!built)('built', () => {
    const m = built ? AuthorModel.load(id) : (null as unknown as AuthorModel);

    it('loads with a sensible number of words, a family and a license', () => {
      expect(m.totalWords).toBeGreaterThan(words[0]);
      expect(m.totalWords).toBeLessThan(words[1]);
      expect(['arguers', 'essayists']).toContain(m.author.family);
      expect(m.author.license?.basis).toBe('age');
      expect(m.author.works.every((w) => w.year <= 1930)).toBe(true);
    });

    it('cites its best-known lines where they stand', () => {
      for (const [text, cite] of lines) {
        const hit = m.search(text.split(' '), { phrase: true, limit: 1 })[0];
        expect(hit, text).toBeDefined();
        expect(m.cite(hit!.id)!.cite, text).toMatch(cite);
      }
    });

    it('finds each move in at least twenty of its sentences, and in fewer than a fifth', () => {
      const rows = m.db.prepare('SELECT text FROM sentences').all() as { text: string }[];
      const moves = m.author.moves ?? [];
      expect(moves.length).toBeGreaterThanOrEqual(5);
      expect(moves.length).toBeLessThanOrEqual(8);
      for (const mv of moves) {
        const n = rows.filter((r) => m.shows(mv, r.text)).length;
        expect(n, mv.id).toBeGreaterThanOrEqual(20);
        expect(n / rows.length, mv.id).toBeLessThan(0.2);
        expect(mv.hint, mv.id).toBeTruthy();
      }
    });
  });
});
