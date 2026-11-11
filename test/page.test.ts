import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorDbPath, ROOT } from '../src/db.ts';
import { buildBrief } from '../src/engine/brief.ts';
import { blocksOfText } from '../src/engine/doc.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { plan, rowsOf } from '../src/server/page.ts';
import { hardGate, promptFingerprint, PROMPT_VERSION, repairWords, softFindings, SUBMIT, systemPrompt, tierOf, userPrompt, type RewriteResult, type Submission } from '../src/server/rewrite.ts';

describe('the writer on its diet', () => {
  const schema = SUBMIT.input_schema;
  const paragraph = (schema.properties.paragraphs as { items: { required: string[]; properties: Record<string, { items?: { required: string[] } }> } }).items;

  it('asks for the sense, the liberties, a short explanation and the paragraphs, and nothing more', () => {
    expect(Object.keys(schema.properties).sort()).toEqual(['explanation', 'liberties', 'paragraphs', 'sense']);
    expect([...schema.required].sort()).toEqual(['explanation', 'liberties', 'paragraphs', 'sense']);
    expect([...paragraph.required].sort()).toEqual(['role', 'sentences', 'why']);
    expect([...paragraph.properties.sentences!.items!.required].sort()).toEqual(['added', 'facts', 'figures', 'from', 'text']);
  });

  it('keeps the test fixtures in the shape the schema asks for', () => {
    const fixtures = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'rewrites.json'), 'utf8')) as { submission: Record<string, unknown> & Submission }[];
    for (const f of fixtures) {
      expect(Object.keys(f.submission).sort()).toEqual(['explanation', 'liberties', 'paragraphs', 'sense']);
      for (const p of f.submission.paragraphs) {
        expect(Object.keys(p).sort()).toEqual(['role', 'sentences', 'why']);
        expect(p.why!.split(/\s+/).length).toBeLessThanOrEqual(15);
        for (const x of p.sentences) expect(Object.keys(x).sort()).toEqual(['added', 'facts', 'from', 'text']);
      }
    }
  });

  it('fingerprints the prompts and the schema, and not the comments around them', async () => {
    const fp = promptFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(PROMPT_VERSION).toBeTruthy();
    const source = readFileSync(join(ROOT, 'src', 'server', 'rewrite.ts'), 'utf8');
    // A copy beside the original, so its relative imports resolve; removed at once.
    const load = async (text: string) => {
      const copy = join(ROOT, 'src', 'server', `rewrite.fp-${process.pid}-${Math.random().toString(36).slice(2)}.ts`);
      writeFileSync(copy, text);
      try {
        return ((await import(copy)) as { promptFingerprint: () => string }).promptFingerprint();
      } finally {
        rmSync(copy, { force: true });
      }
    };
    const commented = source.replace('// The provider:', '// A comment edited. The provider:').replace('/** The first words of a text, for an outline. */', '/** Edited. */');
    expect(commented).not.toBe(source);
    expect(await load(commented)).toBe(fp);
    const reworded = source.replace("Keep the writer's tenses.", "Keep the writer's tense.");
    expect(reworded).not.toBe(source);
    expect(await load(reworded)).not.toBe(fp);
  });

  it('reads each voice’s writer tier from a file, and writes with the full model by default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiers-'));
    try {
      const file = join(dir, 'tiers.json');
      expect(tierOf('austen', file)).toBe('full');
      writeFileSync(file, JSON.stringify({ austen: 'fast', twain: 'full', kjv: 'odd' }));
      expect(tierOf('austen', file)).toBe('fast');
      expect(tierOf('twain', file)).toBe('full');
      expect(tierOf('kjv', file)).toBe('full');
      expect(tierOf('nobody', file)).toBe('full');
      writeFileSync(file, '{ not json');
      expect(tierOf('austen', file)).toBe('full');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const baseline = JSON.parse(readFileSync(join(ROOT, 'docs', 'eval', 'voices', 's5-prompts-baseline.json'), 'utf8')) as { voices: Record<string, { user: number; system: number }> };
  const voices = Object.keys(baseline.voices).filter((id) => existsSync(authorDbPath(id)));
  const neighbors = readFileSync(join(ROOT, 'samples', 'neighbors.txt'), 'utf8');
  describe.skipIf(!voices.length).each(voices)('the prompts for %s', (id) => {
    const m = AuthorModel.load(id);
    const brief = buildBrief(m, blocksOfText(neighbors));
    const user = userPrompt(m, brief);
    const system = systemPrompt(m);

    it('sends a user prompt at least 30% shorter than before, on the New Neighbors case', () => {
      expect(user.length).toBeLessThanOrEqual(0.7 * baseline.voices[id]!.user);
      expect(user.length + system.length).toBeLessThan(baseline.voices[id]!.user + baseline.voices[id]!.system);
    });

    it('gives one nearest sentence for each of the writer’s, and no advice, measures or moves', () => {
      expect(user.match(/<nearest>/g)?.length ?? 0).toBeLessThanOrEqual(brief.sentences.length);
      expect(brief.sentences.every((s) => s.models.length <= 1)).toBe(true);
      expect(user).not.toMatch(/<advice>|<measures|<moves>|<plan>/);
    });

    it('puts the voice’s moves in the system prompt, each with one example, the same for every passage', () => {
      const moves = m.author.moves ?? [];
      expect(system.match(/<move id=/g)?.length ?? 0).toBe(moves.length);
      expect(system.match(/<example>/g)?.length ?? 0).toBeLessThanOrEqual(moves.length);
      expect(systemPrompt(m)).toBe(system);
      expect(system).not.toMatch(/notes?\b.*\bS12345|find_example|check_passage/);
    });
  });
});

describe('the gate, split', () => {
  const austen = existsSync(authorDbPath('austen'));
  it.skipIf(!austen)('sends back only what is worth a redraft, and keeps the rest for the engine', () => {
    const m = AuthorModel.load('austen');
    const brief = buildBrief(m, blocksOfText('My sister borrowed my car without asking. She brought it back with an empty tank.\n\nThen I went home.'));
    const whole: Submission = {
      paragraphs: [
        { role: 'scene', why: 'The wrong first.', sentences: [{ text: 'My sister took the carriage without asking, and brought it back quite empty.', from: [1, 2] }] },
        { role: 'turn', why: 'Then the end.', sentences: [{ text: 'I then went home, super tired.', from: [3] }] },
      ],
      sense: [],
      liberties: [],
      explanation: '',
    };
    expect(hardGate(m, brief, whole)).toEqual([]);
    expect(softFindings(m, brief, whole).join(' ')).toMatch(/super/);
    const lost = structuredClone(whole);
    lost.paragraphs.pop();
    expect(hardGate(m, brief, lost).join(' ')).toMatch(/^Not rendered: sentence 3/);
    expect(softFindings(m, brief, lost).some((p) => /^Not rendered/.test(p))).toBe(false);
    expect(hardGate(m, brief, { ...whole, paragraphs: [] })).toEqual(['The rewrite is empty.']);
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
