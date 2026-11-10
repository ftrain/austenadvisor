// Four voices built from their sources: Hammett, Woolf, Gibbon and Dickens. Each must load, hold about the words its
// sources give, cite a famous line where it stands, and find every move it names in at least twenty of its own
// sentences. A voice not yet built is skipped.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { AuthorModel } from '../src/engine/model.ts';

interface Case {
  id: string;
  /** The corpus's words, at least and at most. */
  words: [number, number];
  works: string[];
  /** A famous line: words to find it by, the citation it must have, and how its text reads. */
  lines: { find: string; cite: string; text: RegExp }[];
}

const CASES: Case[] = [
  {
    id: 'hammett',
    words: [450_000, 560_000],
    works: [
      'redharvest', 'daincurse', 'falcon', 'opstories', 'arsonplus', 'slipperyfingers', 'thetenthclue', 'nightshots',
      'zigzagsoftreachery', 'onehour', 'thegirlwiththesilvereyes', 'womenpoliticsmurder', 'thegoldenhorseshoe',
      'thewhosiskid', 'thescorchedface', 'corkscrew', 'deadyellowwomen', 'theguttingofcouffignal', 'creepingsiamese',
      'thebigknockover', 'bloodmoney', 'thiskingbusiness', 'flypaper', 'thefarewellmurder',
    ],
    lines: [
      { find: 'I first heard Personville called', cite: 'Red Harvest, ch. 1, ¶ 1', text: /^I first heard Personville called “Poisonville”/ },
      { find: 'I won’t play the sap for you', cite: 'The Maltese Falcon, ch. 20, ¶ 65', text: /^I won’t play the sap for you\.”$/ },
      { find: 'A beam or something fell eight or ten stories', cite: 'The Maltese Falcon, ch. 7, ¶ 13', text: /^A beam or something fell/ },
      { find: 'Mr. Leopold Gantvoort is not at home', cite: 'The Tenth Clue, ch. 1, ¶ 1', text: /^“Mr\. Leopold Gantvoort is not at home,”/ },
      { find: 'Jim Tarr picked up the cigar', cite: 'Arson Plus, “§ 1”, ¶ 1', text: /^Jim Tarr picked up the cigar/ },
    ],
  },
  {
    id: 'woolf',
    words: [300_000, 370_000],
    works: ['dalloway', 'commonreader', 'lighthouse1', 'lighthouse2', 'lighthouse3', 'orlando', 'room'],
    lines: [
      { find: 'Mrs. Dalloway said she would buy the flowers herself', cite: 'Mrs. Dalloway, “§ 1”, ¶ 1', text: /^Mrs\. Dalloway said she would buy the flowers herself\.$/ },
      { find: 'I have had my vision', cite: 'To the Lighthouse, part 3, ch. 13, ¶ 3', text: /I have had my vision\.$/ },
      { find: 'Lily Briscoe went on putting away her brushes', cite: 'To the Lighthouse, part 1, ch. 9, ¶ 3', text: /looking up, looking down\.$/ },
      { find: 'a woman must have money and a room of her own', cite: 'A Room of One’s Own, “One”, ¶ 1', text: /a woman must have money and a room of her own/ },
      { find: 'He—for there could be no doubt of his sex', cite: 'Orlando, ch. 1, ¶ 1', text: /^He—for there could be no doubt of his sex/ },
    ],
  },
  {
    id: 'gibbon',
    words: [1_000_000, 1_120_000],
    works: ['decline'],
    lines: [
      { find: 'register of the crimes, follies, and misfortunes', cite: 'The Decline and Fall of the Roman Empire, ch. 3, ¶ 30', text: /little more than the register of the crimes, follies, and misfortunes of mankind\.$/ },
      { find: 'The various modes of worship', cite: 'The Decline and Fall of the Roman Empire, ch. 2, ¶ 2', text: /equally true; by the philosopher as equally false; and by the magistrate as equally useful\.$/ },
      // The last chapter keeps its number: the subchapters of ch. 38 and ch. 61 are not counted as chapters.
      { find: 'In the last days of Pope Eugenius', cite: 'The Decline and Fall of the Roman Empire, ch. 71, ¶ 1', text: /In the last days of Pope Eugenius the Fourth/ },
    ],
  },
  {
    id: 'dickens',
    words: [1_100_000, 1_220_000],
    works: ['carol', 'copperfield', 'bleakhouse', 'hardtimes1', 'hardtimes2', 'hardtimes3', 'twocities1', 'twocities2', 'twocities3', 'expectations'],
    lines: [
      { find: 'It was the best of times', cite: 'A Tale of Two Cities, book 1, ch. 1, ¶ 1', text: /^It was the best of times, it was the worst of times/ },
      { find: 'It is a far, far better thing', cite: 'A Tale of Two Cities, book 3, ch. 15, ¶ 50', text: /^“It is a far, far better thing that I do/ },
      { find: 'Marley was dead', cite: 'A Christmas Carol, “Stave I”, ¶ 1', text: /^Marley was dead, to begin with\.$/ },
      { find: 'Fog everywhere', cite: 'Bleak House, ch. 1, ¶ 2', text: /^Fog everywhere\.$/ },
      { find: 'My father’s family name being Pirrip', cite: 'Great Expectations, ch. 1, ¶ 1', text: /^My father’s family name being Pirrip/ },
      { find: 'Now, what I want is, Facts', cite: 'Hard Times, book 1, ch. 1, ¶ 1', text: /^“Now, what I want is, Facts\.$/ },
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

    it('names its family, the kinds it suits, its license and an epigraph of its own', () => {
      expect(m.author.family).toBeTruthy();
      expect(m.author.goodFor?.length).toBeGreaterThan(0);
      expect(m.author.license?.basis).toBe('age');
      const epi = m.author.epigraph!.text.replace(/…$/, '');
      const hit = m.search(epi.split(' ').slice(0, 6), { phrase: true, limit: 1 })[0];
      expect(hit, epi).toBeDefined();
      expect(m.cite(hit!.id)!.text).toContain(epi.split(' ').slice(0, 6).join(' '));
    });
  });
}
