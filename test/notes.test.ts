// The WHY notes the engine writes, against the built voices (skipped where a voice is not built): the moves, the
// figures of speech and their glosses, the plain style's rules; and the glossary's handling of aliases and role words.
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { FIGURES, findFigures, periphrasisFor } from '../src/engine/figures.ts';
import { findTerms, Glossary, rolesOf, termOf } from '../src/engine/glossary.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { moveKey, NOTES_PER_PARAGRAPH, notesFor, type EngineNote, type NoteRow } from '../src/engine/notes.ts';

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
    {
      yours: [{ n: 5, text: 'He was already there, scrolling on his phone.' }],
      hers: [{ text: 'He was already there, and much occupied with the instrument in his hand.', from: [5] }],
    },
    {
      yours: [{ n: 6, text: 'Honestly, it was the most awkward ten minutes of my life.' }],
      hers: [{ text: 'It was, to say the truth, the most awkward ten minutes of my life.', from: [6] }],
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
    {
      yours: [{ n: 3, text: 'On Saturday I cleaned the gutters. I fixed the sink. I called my grandmother.' }],
      hers: [{ text: 'And on the sabbath eve I made clean the gutters, and repaired the sink, and called my grandmother, and she spake unto me.', from: [3] }],
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

  it.each(voices)('%s: a figure’s note carries its definition, and its example shows the figure by the figure’s own detector', (v) => {
    const { m, notes } = page(v);
    const figures = notes.flat().filter((n) => n.kind === 'move' && n.term && n.id! in FIGURES);
    expect(figures.length).toBeGreaterThan(0);
    for (const n of figures) {
      expect(n.text, n.technique).toContain(termOf(n.id!)!.definition);
      expect(findFigures(m, n.quote!.text).some((f) => f.term === n.id && !f.loose), `${n.id}: ${n.quote!.text}`).toBe(true);
      // The marked words of the example are the figure.
      expect(n.quote!.mark, n.id).toBeDefined();
    }
  }, 120_000);

  it.each(voices)('%s: at most three notes a paragraph; a figure at most twice on the page, any other move once', (v) => {
    const { notes } = page(v);
    expect(NOTES_PER_PARAGRAPH).toBe(3);
    for (const p of notes) expect(p.length).toBeLessThanOrEqual(3);
    const moves = notes.flat().filter((n) => n.kind === 'move');
    const count = new Map<string, EngineNote[]>();
    for (const n of moves) count.set(n.id!, [...(count.get(n.id!) ?? []), n]);
    for (const [id, ns] of count) {
      expect(ns.length, id).toBeLessThanOrEqual(ns[0]!.term && id in FIGURES ? 2 : 1);
      // The second time is marked, and said in fewer words.
      if (ns.length === 2) {
        expect(ns.map((n) => !!n.again)).toEqual([false, true]);
        expect(ns[1]!.text.length).toBeLessThan(ns[0]!.text.length);
      }
    }
    // No paragraph notes one move twice.
    for (const p of notes) expect(new Set(p.filter((n) => n.kind === 'move').map((n) => n.id)).size).toBe(p.filter((n) => n.kind === 'move').length);
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
    // The first paragraph has room for its two moves and the liberty after them; the figure comes first.
    expect(notes[0]!.map((n) => n.kind)).toEqual(['move', 'move', 'liberty']);
    expect(notes[0]![0]).toMatchObject({ id: 'litotes', term: 'litotes', technique: 'Understatement and litotes' });
    expect(notes[0]![0]!.text).toBe('Saying less than you mean, often by denying the opposite. Here: “not unwilling”. The modest wording leaves the reader to supply the stronger word.');
    // Litotes, noted in the first paragraph, is noted once more two paragraphs on, in fewer words, with another
    // sentence of hers; the paragraph between, which the writer's own litotes fills, is left alone.
    expect(notes[1]).toEqual([]);
    const again = third.find((n) => n.id === 'litotes')!;
    expect(again).toMatchObject({ again: true, text: 'Again: “not unpleasant”. Saying less than you mean, often by denying the opposite.' });
    expect(again.quote!.id).not.toBe(notes[0]![0]!.quote!.id);
    expect(third.at(-1)).toMatchObject({ kind: 'structure' });
  }, 120_000);

  it.skipIf(!voices.includes('austen'))('glosses periphrasis where the rewrite describes what the writer named', () => {
    const { m, notes } = page('austen');
    const n = notes[3]!.find((x) => x.id === 'periphrasis')!;
    expect(n).toMatchObject({ technique: 'Periphrasis', term: 'periphrasis' });
    expect(n.text).toBe('Naming a thing by a description of it instead of by its name. Here “the instrument in his hand” stands for your “phone”. The reader pictures the thing before hearing its name.');
    expect(n.after.slice(...n.span!)).toBe('the instrument in his hand');
    // The example is a periphrasis the form alone proves, in her own words.
    expect(findFigures(m, n.quote!.text).some((f) => f.term === 'periphrasis' && !f.loose)).toBe(true);
    // No name lost, no periphrasis: the writer's own description, and a description after “is”.
    expect(periphrasisFor(m, 'There is a machine that sells soap.', 'Near the wall stands a machine that gives out soap for a coin.')).toBeNull();
    expect(periphrasisFor(m, 'He looked at his phone.', 'A phone is an instrument by which the voice is carried.')).toBeNull();
    expect(periphrasisFor(m, 'I know it’s risky and clients might not like it.', 'I am aware that those whom we serve may not like it.')).toMatchObject({ text: 'those whom we serve', stands: 'clients' });
    expect(periphrasisFor(m, 'And my phone charger, which I forgot.', 'Send also the cord for my little instrument of talking at a distance.')).toMatchObject({ stands: 'phone' });
  }, 120_000);

  it.skipIf(!voices.includes('austen'))('praises a figure the writer made and the rewrite kept', () => {
    const { notes } = page('austen');
    const n = notes[4]!.find((x) => x.id === 'hyperbole')!;
    expect(n).toMatchObject({ yours: true, technique: 'Hyperbole', term: 'hyperbole' });
    expect(n.text).toBe('You wrote hyperbole here, and the rewrite keeps it: “the most awkward ten minutes of my life”. Exaggeration not meant to be taken literally, for emphasis or comedy.');
    expect(n.quote).not.toBeNull();
  }, 120_000);

  it.skipIf(!voices.includes('kjv'))('gives a figure its place before the voice’s habits of diction', () => {
    const { notes } = page('kjv');
    // “And … and … and”: the figure is first, though the sentence is full of “unto” and “spake”.
    expect(notes[2]![0]).toMatchObject({ id: 'polysyndeton', technique: 'Polysyndeton', term: 'polysyndeton' });
    expect(notes[2]!.length).toBeGreaterThan(1);
  }, 120_000);

  it.skipIf(!existsSync(authorDbPath('plain')))('credits a rule of the plain style only where the writer broke it and the rewrite mends it', () => {
    const m = AuthorModel.load('plain');
    const rows: NoteRow[] = [
      {
        yours: [
          { n: 1, text: 'First, I think that school lunches are really bad due to the fact that they are basically frozen food.' },
          { n: 2, text: 'Nobody is helped by this.' },
        ],
        hers: [
          { text: 'First, school lunches are bad because the kitchen freezes them.', from: [1], moves: ['needless', 'active', 'hedge'] },
          { text: 'This helps nobody.', from: [2], moves: ['active'] },
        ],
      },
      {
        yours: [{ n: 3, text: 'Second, kids sort of throw most of it away, which is not good for the budget.' }],
        hers: [
          { text: 'This hurts the budget.', from: [3], moves: ['hedge'] },
          { text: 'Second, kids throw most of it away.', from: [3], moves: ['hedge'] },
        ],
      },
      // A sentence the writer never wrote breaks no rule of theirs, and mends none.
      { yours: [], hers: [{ text: 'Frozen food is cheap and easy to cook.', from: [], moves: ['needless', 'active', 'positive', 'hedge', 'oneidea', 'concrete'] }] },
      // Active before and active after: nothing to credit.
      { yours: [{ n: 4, text: 'The cook makes the soup every day.' }], hers: [{ text: 'The cook makes soup daily.', from: [4], moves: ['active'] }] },
    ];
    const notes = notesFor(m, rows, { seen: new Set() });
    const of = (k: number) => notes[k]!.map((n) => [n.technique, n.after]);
    // The first sentence was active already (“they are frozen food” is no passive); the second was passive.
    expect(of(0)).toEqual([
      ['Needless words cut', 'First, school lunches are bad because the kitchen freezes them.'],
      ['Hedges and intensifiers removed', 'First, school lunches are bad because the kitchen freezes them.'],
      ['Active voice', 'This helps nobody.'],
    ]);
    expect(notes[2]).toEqual([]);
    expect(notes[3]).toEqual([]);
    // The hedge was in “kids sort of throw”: the sentence that holds those words mends it, not its neighbour.
    const fresh = notesFor(m, [rows[1]!]);
    expect(fresh[0]!.map((n) => [n.technique, n.after])).toEqual([['Hedges and intensifiers removed', 'Second, kids throw most of it away.']]);
    m.db.close();
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
    // A figure an earlier part of the page noted is noted once more, as its second; after that, never.
    const seen = new Set(['litotes']);
    const again = notesFor(m, [FIXTURES.austen![0]!], { seen });
    expect(again[0]!.find((n) => n.id === 'litotes')).toMatchObject({ again: true });
    expect(seen.has('litotes#2')).toBe(true);
    const third = notesFor(m, [FIXTURES.austen![0]!], { seen });
    expect(third[0]!.some((n) => n.id === 'litotes')).toBe(false);
    expect(third[0]!.find((n) => n.kind === 'move')).toBeUndefined();
    // Two notes a paragraph, when the caller asks for two.
    expect(notesFor(m, FIXTURES.austen!, { perParagraph: 2 }).every((p) => p.length <= 2)).toBe(true);
  }, 120_000);

  it.skipIf(!voices.includes('austen'))('notes a figure the writer of the rewrite named, where its words stand in the sentence', () => {
    const m = page('austen').m;
    const row = (claims: { term: string; quote: string }[], yours = 'My aunt was old.', hers = 'My aunt had reached the evening of life.'): NoteRow => ({ yours: [{ n: 1, text: yours }], hers: [{ text: hers, from: [1], claims }] });
    const made = notesFor(m, [row([{ term: 'metaphor', quote: 'the evening of life' }])])[0]!.find((n) => n.id === 'metaphor')!;
    expect(made).toMatchObject({ technique: 'Metaphor', quote: null, term: 'metaphor' });
    expect(made.text).toContain(termOf('metaphor')!.definition);
    expect(made.text).toContain('Here: “the evening of life”.');
    // Words that are not in the sentence, and a term with no entry, name nothing.
    expect(notesFor(m, [row([{ term: 'metaphor', quote: 'the autumn of life' }])])[0]!.some((n) => n.id === 'metaphor')).toBe(false);
    expect(notesFor(m, [row([{ term: 'catachresis', quote: 'the evening of life' }])])[0]!.some((n) => n.id === 'catachresis')).toBe(false);
    // The writer's own metaphor, kept, is theirs.
    const kept = notesFor(m, [row([{ term: 'metaphor', quote: 'the evening of life' }], 'She was in the evening of life.', 'She was now in the evening of life.')])[0]!.find((n) => n.id === 'metaphor')!;
    expect(kept).toMatchObject({ yours: true });
    expect(kept.text).toMatch(/^You wrote metaphor here/);
  }, 120_000);

  it.skipIf(!voices.includes('austen'))('notes the figures found by form: the words, what they do, and a sentence of hers that shows the same', () => {
    const m = page('austen').m;
    const one = (yours: string, hers: string) => notesFor(m, [{ yours: [{ n: 1, text: yours }], hers: [{ text: hers, from: [1] }] }])[0]!;
    const simile = one('My bunkmate snores loudly.', 'My bedfellow snores like a whole herd.').find((n) => n.id === 'simile')!;
    expect(simile).toMatchObject({ technique: 'Simile', term: 'simile' });
    expect(simile.text).toBe('A comparison made openly, with “like” or “as”. Here: “like a whole herd”. The comparison gives the reader a picture of the thing.');
    expect(findFigures(m, simile.quote!.text).some((f) => f.term === 'simile')).toBe(true);
    // A build of the whole sentence has no phrase to point at.
    const periodic = one('She sat down after the rain.', 'When the rain had stopped, and the guests had gone, she sat down by the fire.').find((n) => n.id === 'periodic')!;
    expect(periodic.text).toBe('A sentence that holds its main point until the end. The reader waits for the main clause, and it carries the weight of all that came before.');
    const asked = one('Nobody would refuse.', 'Who would not prefer four days of labour to six?').find((n) => n.id === 'rhetoricalquestion')!;
    expect(asked.text).toBe('A question asked for effect, with the answer taken for granted. The reader supplies the answer and so agrees with it.');
    // “Far from wrong” is litotes.
    expect(one('He was right.', 'He was very far from wrong.').find((n) => n.id === 'litotes')!.text).toContain('Here: “far from wrong”.');
    const fixed = one('It was a mistake.', 'It was a mistake, or rather a blunder.').find((n) => n.id === 'epanorthosis')!;
    expect(fixed).toMatchObject({ technique: 'Epanorthosis (correction)', term: 'epanorthosis' });
    // Climax is not taught from, and the series is named for what it surely is.
    const series = one('I am very tired.', 'I am worn, I am wounded, I can bear no more.').map((n) => n.id);
    expect(series).toContain('asyndeton');
    expect(series).not.toContain('climax');
    // A sound that comes back in the writer's own sentence is as often chance: no praise for it.
    expect(one('The counselors keep a close watch on us.', 'The counselors keep a close watch upon us all.').some((n) => n.id === 'alliteration')).toBe(false);
    expect(one('Yesterday we went canoeing and I flipped the canoe.', 'Yesterday we went canoeing, and I overturned the canoe.').some((n) => n.id === 'polyptoton')).toBe(false);
  }, 120_000);
});

describe('the glossary’s aliases and roles', () => {
  it('never gives a move a role’s definition', () => {
    expect(moveKey('turn')).toBe('turn');
    expect(moveKey('objection', 'The objection met')).toBe('objection');
    expect(moveKey('litotes')).toBe(termOf('litotes')!.id);
  });

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
