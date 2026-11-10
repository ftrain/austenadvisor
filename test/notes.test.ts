// The WHY notes the engine writes, against three built voices (skipped where a voice is not built), and the
// glossary's handling of aliases and role words.
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { findTerms, Glossary, rolesOf, termOf } from '../src/engine/glossary.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { notesFor, type EngineNote, type NoteRow } from '../src/engine/notes.ts';

/** Fixture rows for each voice: a rewrite that makes moves, and a sentence left as the writer wrote it. */
const FIXTURES: Record<string, NoteRow[]> = {
  austen: [
    {
      yours: [
        { n: 1, text: 'She was happy to go to the party.' },
        { n: 2, text: 'He said he would come too.' },
      ],
      hers: [
        { text: 'She was not unwilling to go; and Mr. Elton, it must be owned, was not a little pleased.', from: [1] },
        { text: 'He replied that he would attend.', from: [2] },
      ],
    },
    {
      yours: [{ n: 3, text: 'It was not a bad evening, and nobody minded the rain.' }],
      hers: [{ text: 'It was not a bad evening, and nobody minded the rain.', from: [3] }],
    },
    {
      yours: [{ n: 4, text: 'Everyone was glad when it ended.' }],
      hers: [{ text: 'The evening was not unpleasant; and the company, it must be said, was no very great trial.', from: [4] }],
      from: [4, 5],
    },
  ],
  obama: [
    {
      yours: [{ n: 1, text: 'We should do this because it is good.' }],
      hers: [{ text: 'We do this not because it is easy, but because it is right. That’s why we have to work together.', from: [1] }],
    },
    {
      yours: [{ n: 2, text: 'We should help because it matters.' }],
      hers: [{ text: 'Not because it is simple, but because it matters. That’s why all of us have a part to play.', from: [2] }],
    },
  ],
  kjv: [
    {
      yours: [{ n: 1, text: 'He went to the city and spoke to the people.' }],
      hers: [{ text: 'And it came to pass, that he went up unto the city; and he spake unto the people, saying, Behold, the day cometh.', from: [1] }],
    },
    {
      yours: [{ n: 2, text: 'And it came to pass that he went home.' }],
      hers: [{ text: 'And it came to pass that he went home.', from: [2] }],
    },
  ],
};

const voices = Object.keys(FIXTURES).filter((v) => existsSync(authorDbPath(v)));

describe.skipIf(!voices.length)('notes written by the engine', () => {
  const pages = new Map<string, { m: AuthorModel; notes: EngineNote[][] }>();
  const page = (v: string) => {
    if (!pages.has(v)) {
      const m = AuthorModel.load(v);
      const notes = notesFor(m, FIXTURES[v]!, {
        sense: v === 'austen' ? [{ before: 'Everyone was glad when it ended.', after: 'The evening was not unpleasant', problem: 'You said everyone was glad, then that the evening was dull.', resolution: 'The rewrite keeps the gladness.' }] : [],
        liberties: [{ after: FIXTURES[v]![0]!.hers![0]!.text, why: 'A name the voice brought in.' }],
      });
      pages.set(v, { m, notes });
    }
    return pages.get(v)!;
  };

  it.each(voices)('%s: every move note has a sentence of the voice’s that makes the move', (v) => {
    const { m, notes } = page(v);
    const moves = notes.flat().filter((n) => n.kind === 'move');
    expect(moves.length).toBeGreaterThan(0);
    for (const n of moves) {
      expect(n.quote, n.technique).not.toBeNull();
      expect(n.verified).toBe(true);
      const mv = m.author.moves?.find((x) => n.id === x.id || termOf(x.id)?.id === n.id) ?? { id: n.id! };
      expect(m.shows(mv, n.quote!.text), `${n.technique}: ${n.quote!.text}`).toBe(true);
      expect(m.cite(n.quote!.id)!.text).toBe(n.quote!.text);
    }
  }, 120_000);

  it.each(voices)('%s: at most two notes a paragraph, and no move twice on the page', (v) => {
    const { notes } = page(v);
    for (const p of notes) expect(p.length).toBeLessThanOrEqual(2);
    const ids = notes.flat().filter((n) => n.kind === 'move').map((n) => n.id);
    expect(ids.length).toBe(new Set(ids).size);
    const quotes = notes.flat().flatMap((n) => (n.quote ? [n.quote.id] : []));
    expect(quotes.length).toBe(new Set(quotes).size);
  }, 120_000);

  it.each(voices)('%s: a sentence left as the writer wrote it gets no move note', (v) => {
    const { notes } = page(v);
    FIXTURES[v]!.forEach((r, k) => {
      const same = r.hers!.every((s) => s.from.length === 1 && r.yours.find((y) => y.n === s.from[0])?.text === s.text);
      if (same) expect(notes[k]!.filter((n) => n.kind === 'move')).toEqual([]);
    });
  }, 120_000);

  it.skipIf(!voices.includes('austen'))('puts a mended sense first, and the structure note last', () => {
    const { notes } = page('austen');
    const third = notes[2]!;
    expect(third[0]!.kind).toBe('sense');
    expect(third[0]!.technique).toBe('Mended');
    // The first paragraph's two moves fill it, so the liberty waits.
    expect(notes[0]!.map((n) => n.kind)).toEqual(['move', 'move']);
    // Litotes, noted in the first paragraph, is not noted again in the third.
    expect(third.filter((n) => n.id === 'litotes')).toEqual([]);
  }, 120_000);

  it.skipIf(!voices.includes('austen'))('names the move as the voice does, and labels a liberty and a structure note', () => {
    const m = page('austen').m;
    const rows: NoteRow[] = [
      { yours: [{ n: 1, text: 'He came.' }], hers: [{ text: 'He came.', from: [1] }] },
      { yours: [{ n: 2, text: 'She left.' }], hers: [{ text: 'She left.', from: [2] }], from: [2, 3] },
    ];
    const notes = notesFor(m, rows, { liberties: [{ after: 'He came.', why: 'Nothing was added.' }] });
    expect(notes[0]).toEqual([expect.objectContaining({ kind: 'liberty', technique: 'Added by Austen' })]);
    expect(notes[1]).toEqual([expect.objectContaining({ kind: 'structure', text: 'Joins your paragraphs 2 and 3.' })]);
    const seen = new Set(['litotes']);
    const again = notesFor(m, [FIXTURES.austen![0]!], { seen });
    expect(again[0]!.some((n) => n.id === 'litotes')).toBe(false);
    expect(again[0]!.find((n) => n.kind === 'move')!.technique).toBe('Clauses balanced in one period');
  }, 120_000);
});

describe('the glossary’s aliases and roles', () => {
  const g = Glossary.load(join(mkdtempSync(join(tmpdir(), 'glossary-')), 'glossary.sqlite'));

  it('resolves litotes and understatement to one term', () => {
    expect(g.define('litotes')!.id).toBe(g.define('understatement')!.id);
    expect(termOf('understatement')!.id).toBe(termOf('litotes')!.id);
    expect(termOf('Understatement and litotes')!.id).toBe('litotes');
    expect(termOf('Building in threes')!.id).toBe('tricolon');
  });

  it('defines role words from roles.json, in any of its shapes', () => {
    const a = rolesOf({ claim: 'What the writer sets out to show.', part: 'A paragraph with no clear role.' });
    expect(a.map((t) => [t.id, t.term, t.kind])).toEqual([['role-claim', 'Claim', 'role']]);
    const b = rolesOf([{ id: 'scene', name: 'scene', definition: 'A moment told as it happens.' }]);
    expect(b[0]!.definition).toBe('A moment told as it happens.');
    const c = rolesOf({ roles: { close: { definition: 'The last words of a letter.' } } });
    expect(c[0]!.id).toBe('role-close');
    // A role the glossary already names is left to its term.
    expect(rolesOf({ refutation: 'Answering the other side.' })).toEqual([]);
  });

  it('defines a role word on lookup but does not mark it in running prose', () => {
    const roles = g.all().filter((t) => t.kind === 'role');
    if (!roles.length) return;
    expect(g.define(roles[0]!.term)!.id).toBe(roles[0]!.id);
    expect(findTerms(roles, roles.map((t) => t.term.toLowerCase()).join(' and '))).toEqual([]);
  });
});
