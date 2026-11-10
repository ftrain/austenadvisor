// Five voices built from their sources: Lincoln, the Federalist, Douglass, Johnson and Hemingway. Each must load,
// hold about the words its sources give, cite a famous line where it stands, and find every move it names in at
// least twenty of its own sentences. A voice not yet built is skipped.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { AuthorModel } from '../src/engine/model.ts';

interface Case {
  id: string;
  /** The corpus's words, at least and at most. */
  words: [number, number];
  works: string[];
  /** A famous line: words to find it by, the citation it must have, and how its text begins. */
  lines: { find: string; cite: string; text: RegExp }[];
}

const CASES: Case[] = [
  {
    id: 'lincoln',
    words: [350_000, 450_000],
    works: ['papers1', 'papers2', 'debates1', 'debates2', 'papers5', 'papers6', 'papers7'],
    lines: [
      { find: 'Four score and seven years ago', cite: 'Address at Gettysburg, 19 November 1863, ¶ 1', text: /^Four score and seven years ago our fathers/ },
      { find: 'With malice toward none', cite: 'Second Inaugural Address, 4 March 1865, ¶ 4', text: /^With malice toward none, with charity for all/ },
      { find: 'If slavery is not wrong', cite: 'To A. G. Hodges, 4 April 1864, ¶ 2', text: /^If slavery is not wrong, nothing is wrong\.$/ },
      { find: 'My paramount object in this struggle', cite: 'To Horace Greeley, 22 August 1862, ¶ 3', text: /^My paramount object/ },
    ],
  },
  {
    id: 'federalist',
    words: [170_000, 200_000],
    works: ['federalist'],
    lines: [
      { find: 'If men were angels', cite: 'Federalist No. 51 (Madison), ¶ 4', text: /^If men were angels, no government would be necessary\.$/ },
      { find: 'The inference to which we are brought', cite: 'Federalist No. 10 (Madison), ¶ 10', text: /^The inference to which we are brought is/ },
    ],
  },
  {
    id: 'douglass',
    words: [150_000, 175_000],
    works: ['narrative', 'bondage'],
    lines: [
      {
        find: 'You have seen how a man was made a slave',
        cite: 'Narrative of the Life of Frederick Douglass, ch. 10, ¶ 10',
        text: /you shall see how a slave was made a man\.$/,
      },
      { find: 'It was a new and special revelation', cite: 'Narrative of the Life of Frederick Douglass, ch. 6, ¶ 3', text: /^It was a new and special revelation/ },
      { find: 'This Fourth of July is yours', cite: 'My Bondage and My Freedom, “What To The Slave Is The Fourth Of July?. Extract From An Oration, At Rochester, July 5, 1852”, ¶ 3', text: /^This Fourth of July is yours, not mine\.$/ },
    ],
  },
  {
    id: 'johnson',
    words: [450_000, 520_000],
    works: ['rasselas', 'rambler1', 'rambler2', 'adventurer', 'idler'],
    lines: [
      { find: 'Marriage has many pains', cite: 'Rasselas, ch. 26, ¶ 9', text: /^Marriage has many pains, but celibacy has no pleasures/ },
      { find: 'Hope is necessary in every condition', cite: 'The Rambler, “No. 67. Tuesday, November 6, 1750”, ¶ 4', text: /^Hope is necessary in every condition\.$/ },
    ],
  },
  {
    id: 'hemingway',
    words: [220_000, 245_000],
    works: ['inourtime', 'sun', 'menwithoutwomen', 'farewell'],
    lines: [
      { find: 'Isn’t it pretty to think so', cite: 'The Sun Also Rises, ch. 19, ¶ 265', text: /^“Isn’t it pretty to think so\?”$/ },
      { find: 'The hills across the valley of the Ebro', cite: 'Men Without Women, “Hills Like White Elephants”, ¶ 1', text: /were long and white\.$/ },
      { find: 'In the late summer of that year', cite: 'A Farewell to Arms, ch. 1, ¶ 1', text: /^In the late summer of that year we lived in a house/ },
    ],
  },
];

for (const c of CASES) {
  const built = existsSync(authorDbPath(c.id));

  describe.skipIf(!built)(`the voice of ${c.id}`, () => {
    const m = built ? AuthorModel.load(c.id) : (null as unknown as AuthorModel);

    it('loads with every work and about the words its sources give', () => {
      expect(m.totalWords).toBeGreaterThan(c.words[0]);
      expect(m.totalWords).toBeLessThan(c.words[1]);
      const works = (m as any).db.prepare('SELECT id FROM works ORDER BY ord').all() as { id: string }[];
      expect(works.map((w) => w.id)).toEqual(c.works);
    });

    it('cites a famous line where it stands', () => {
      for (const l of c.lines) {
        const hit = m.search(l.find.split(' '), { phrase: true, limit: 1 })[0];
        expect(hit, l.find).toBeDefined();
        const cite = m.cite(hit!.id)!;
        expect(cite.cite).toBe(l.cite);
        expect(cite.text).toMatch(l.text);
      }
    });

    it('finds every move in at least twenty of its sentences, and no move in most of them', () => {
      const rows = (m as any).db.prepare('SELECT text FROM sentences WHERE words >= 4').all() as { text: string }[];
      const moves = m.author.moves ?? [];
      expect(moves.length).toBeGreaterThanOrEqual(5);
      expect(moves.length).toBeLessThanOrEqual(8);
      for (const mv of moves) {
        expect(mv.hint, mv.id).toBeTruthy();
        const n = rows.filter((r) => m.shows(mv, r.text)).length;
        expect(n, mv.id).toBeGreaterThanOrEqual(20);
        expect(n / rows.length, mv.id).toBeLessThan(0.35);
      }
    });
  });
}
