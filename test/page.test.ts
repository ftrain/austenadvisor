import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { buildBrief } from '../src/engine/brief.ts';
import { blocksOfText } from '../src/engine/doc.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { plan, rowsOf } from '../src/server/page.ts';
import { applyProof, repairWords, type RewriteResult, type Submission } from '../src/server/rewrite.ts';

describe('the proofreader', () => {
  it('applies its small exact edits within a sentence, and reports what was added and not told', () => {
    const sub = {
      paragraphs: [{ sentences: [{ text: 'Some business owners will say their readers cannot reach them.', from: [1], model: 'S1' }, { text: 'It was a sore travail and a dream.', from: [2], model: 'S1' }] }],
      notes: [],
      liberties: [{ after: 'a sore travail', why: 'the voice' }],
      explanation: '',
    } as unknown as Submission;
    applyProof(sub, {
      fixes: [
        { find: 'their readers', replace: 'their customers', why: 'customers' },
        { find: 'and a dream', replace: 'and a nightmare', why: 'inverted' },
        { find: 'not in the text', replace: 'x', why: 'ignored' },
      ],
      added: [{ after: 'sore travail', why: 'already told' }, { after: 'cannot reach them', why: 'new' }],
    });
    expect(sub.paragraphs[0]!.sentences.map((x) => x.text)).toEqual(['Some business owners will say their customers cannot reach them.', 'It was a sore travail and a nightmare.']);
    expect(sub.liberties!.map((x) => x.after)).toEqual(['a sore travail', 'cannot reach them']);
  });
});

describe('the page', () => {
  it('rewrites paragraphs in parts, and leaves headings as they stand', () => {
    const para = (n: number) => Array.from({ length: n }, () => 'word').join(' ') + '.';
    const { blocks, parts } = plan(`# Title\n\n${para(250)}\n\n${para(250)}\n\n${para(250)}\n\nChapter Two\n\n${para(20)}`);
    expect(blocks.map((b) => b.kind)).toEqual(['title', 'paragraph', 'paragraph', 'paragraph', 'heading', 'paragraph']);
    // Two paragraphs fit a part, the third begins the next, and a heading always ends one.
    expect(parts).toEqual([[1, 2], [3], [5]]);
  });

  it('lays each rewritten sentence and note beside the paragraph it renders', () => {
    const blocks = blocksOfText('He texted me. I knew.\n\nWe met downtown. He looked nervous.');
    const r = {
      source: [
        { n: 1, paragraph: 1, text: 'He texted me.', never: [{ word: 'texted', alternatives: ['wrote (same sense; 9×)'] }] },
        { n: 2, paragraph: 1, text: 'I knew.', never: [] },
        { n: 3, paragraph: 2, text: 'We met downtown.', never: [] },
        { n: 4, paragraph: 2, text: 'He looked nervous.', never: [] },
      ],
      paragraphs: [
        { text: '', source: 1, sentences: [{ text: 'He sent me word, and I knew.', source: 1 }] },
        { text: '', source: 2, sentences: [{ text: 'We met in the town; he was not a little nervous.', source: 2 }] },
      ],
      aligned: [
        { after: 'He sent me word, and I knew.', before: [], from: [1, 2], why: 'joins two', model: null },
        { after: 'We met in the town; he was not a little nervous.', before: [], from: [3, 4], why: 'litotes', model: null },
      ],
      // The model's quotation of itself is not exact: the note still finds its paragraph by the words it shares.
      notes: [{ technique: 'Litotes', before: 'He looked nervous', after: 'he was not a little nervous!', austen: 'Not unwilling.', id: 7, cite: 'Emma, ch. 1, ¶ 1', verified: true }],
    } as unknown as RewriteResult;
    const rows = rowsOf(blocks, [0, 1], 0, r, 0);
    const [a, b] = rows as Extract<(typeof rows)[number], { kind: 'paragraph' }>[];
    expect(a!.yours.map((s) => s.n)).toEqual([1, 2]);
    expect(a!.yours[0]!.never[0]).toEqual({ word: 'texted', alternatives: ['wrote'] });
    expect(a!.hers!.map((s) => s.from)).toEqual([[1, 2]]);
    expect(b!.hers![0]!.text).toMatch(/not a little nervous/);
    expect(a!.notes).toEqual([]);
    expect(b!.notes[0]!.quote).toEqual({ id: 7, text: 'Not unwilling.', cite: 'Emma, ch. 1, ¶ 1' });
    // The paragraphs stood as they were: nothing is said of where they came from.
    expect(rows.every((r) => r.kind === 'paragraph' && !r.from && r.notes.every((n) => n.kind !== 'structure'))).toBe(true);
  });

  it('follows the author where paragraphs move or merge, and puts a mending of sense beside what it mends', () => {
    const blocks = blocksOfText('A family moved in. The mom is standoffish.\n\nMy mother baked cookies.\n\nThe dad is single.');
    const r = {
      source: [
        { n: 1, paragraph: 1, text: 'A family moved in.', never: [] },
        { n: 2, paragraph: 1, text: 'The mom is standoffish.', never: [] },
        { n: 3, paragraph: 2, text: 'My mother baked cookies.', never: [] },
        { n: 4, paragraph: 3, text: 'The dad is single.', never: [] },
      ],
      // The author tells of the single man first, then gathers the rest into one paragraph.
      paragraphs: [
        { text: '', source: 3, sentences: [{ text: 'A single gentleman had taken the house.', source: 3 }] },
        { text: '', source: 1, sentences: [{ text: 'His sister was cold; my mother sent him cakes.', source: 1 }] },
      ],
      aligned: [
        { after: '', before: [], from: [1, 4], why: '', model: null },
        { after: '', before: [], from: [2, 3], why: '', model: null },
      ],
      notes: [],
      sense: [{ problem: 'The family has a mother, yet the father is single.', resolution: 'I made her his sister.', before: 'The mom is standoffish.', after: 'His sister was cold' }],
    } as unknown as RewriteResult;
    const rows = rowsOf(blocks, [0, 1, 2], 0, r, 0, new Map([[0, 1], [1, 2], [2, 3]])) as Extract<ReturnType<typeof rowsOf>[number], { kind: 'paragraph' }>[];
    expect(rows.map((x) => x.yours.map((s) => s.n))).toEqual([[1, 4], [2, 3]]);
    expect(rows.map((x) => x.from)).toEqual([[1, 3], [1, 2]]);
    expect(rows[0]!.notes.find((n) => n.kind === 'structure')?.text).toBe('Brings together your paragraphs 1 and 3.');
    expect(rows[1]!.notes[0]).toMatchObject({ kind: 'sense', text: 'The family has a mother, yet the father is single. I made her his sister.' });
    // Gathered in order is not moved: the second paragraph says only what it gathers.
    expect(rows[1]!.notes.filter((n) => n.kind === 'structure').map((n) => n.text)).toEqual(['Brings together your paragraphs 1 and 2.']);
    // Rows sort after the headings before them and in the author's order.
    expect(rows.map((x) => x.index)).toEqual([0.001, 0.002]);
  });
});

const kjv = existsSync(authorDbPath('kjv'));

const austen = existsSync(authorDbPath('austen'));
describe.skipIf(!austen)('the statistics, mending a rewrite in place', () => {
  const m = austen ? AuthorModel.load('austen') : (null as unknown as AuthorModel);
  it('puts her word for one she never used, where the engine is sure of it, and leaves names and the unsure alone', () => {
    const brief = buildBrief(m, blocksOfText('Ryan said he was super tired.'));
    const sub = { paragraphs: [{ sentences: [{ text: 'Ryan was super tired, and he didn’t hide it.', from: [1], model: 'S1' }] }], notes: [], explanation: '' } as unknown as Submission;
    const swapped = repairWords(m, brief, sub);
    const text = sub.paragraphs[0]!.sentences[0]!.text;
    expect(text).toMatch(/^Ryan was (extremely|exceedingly) tired, and he did not hide it\.$/);
    expect(swapped.length).toBe(2);
  });
});

describe.skipIf(!kjv)('the King James Bible', () => {
  const m = kjv ? AuthorModel.load('kjv') : (null as unknown as AuthorModel);

  it('cites by book, chapter and verse', () => {
    const c = m.similarSentences('Let there be light', 1, { minWords: 6 })[0]!;
    expect(c.cite).toBe('Genesis 1:3');
    expect(c.text).toBe('And God said, Let there be light: and there was light.');
  });

  it('offers the model only words near in meaning for a word it never uses', () => {
    const b = buildBrief(m, blocksOfText('The counselors are kind of strict.'));
    const strict = b.sentences[0]!.never.find((w) => w.word === 'strict');
    expect(strict).toBeDefined();
    expect(strict!.alternatives.join(' ')).not.toMatch(/\bblue\b/);
  });
});

const shakespeare = existsSync(authorDbPath('shakespeare'));

describe.skipIf(!shakespeare)('Shakespeare', () => {
  const m = shakespeare ? AuthorModel.load('shakespeare') : (null as unknown as AuthorModel);

  it('cites a play by act and scene, and a sonnet by its number', () => {
    const id = (text: string) => m.search(text.split(' '), { phrase: true, limit: 1 })[0]!.id;
    expect(m.cite(id('To be, or not to be'))!.cite).toBe('Hamlet 3.1');
    const s = m.cite(id('Shall I compare thee to a summer’s day'))!;
    expect(s.cite).toBe('Sonnet 18');
  });
});
