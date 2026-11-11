// Every built voice through the engine's side of a rewrite, on one sample: the brief, the gate and the render. The
// submission gives back each of the writer's sentences as it stands, so nothing here needs a model.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAMILIES, readGutenberg } from '../src/corpus/sources.ts';
import { authorDbPath, ROOT } from '../src/db.ts';
import { analyze } from '../src/engine/analyze.ts';
import { buildBrief } from '../src/engine/brief.ts';
import { blocksOfText } from '../src/engine/doc.ts';
import { termOf } from '../src/engine/glossary.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { keepsRule, KIND_TERM, modelsRule, needlessWords, PLAIN_RULES, plainFaults, type PlainRule } from '../src/engine/plain.ts';
import { drillsFor, practiceCheck } from '../src/engine/practice.ts';
import { NEEDLESS_LIMIT, readText } from '../src/server/read.ts';
import { gate, render, systemPrompt, userPrompt, type Submission } from '../src/server/rewrite.ts';
import { splitSample } from '../scripts/index-samples.ts';

const voices = readdirSync(join(ROOT, 'authors'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((id) => existsSync(authorDbPath(id)));
const sample = splitSample(readFileSync(join(ROOT, 'samples', 'camp-letter.txt'), 'utf8')).body;

describe.skipIf(!voices.length).each(voices)('the voice of %s', (id) => {
  const m = AuthorModel.load(id);
  const brief = buildBrief(m, blocksOfText(sample));
  const paragraphs = [...new Set(brief.sentences.map((s) => s.paragraph))];
  const echo: Submission = {
    paragraphs: paragraphs.map((p) => ({ sentences: brief.sentences.filter((s) => s.paragraph === p).map((s) => ({ text: s.text, from: [s.n], model: '' })) })),
    notes: [],
    liberties: [],
    sense: [],
    explanation: 'The writer’s sentences, as they stand.',
  };

  it('builds a brief and the prompts', () => {
    expect(brief.sentences.length).toBeGreaterThan(10);
    expect(paragraphs.length).toBeGreaterThanOrEqual(5);
    expect(systemPrompt(m)).toContain(m.author.name);
    expect(userPrompt(m, brief)).toContain(brief.sentences[0]!.text);
  });

  it('gates a submission that renders every sentence without a hard failure', () => {
    const problems = gate(m, brief, echo);
    expect(Array.isArray(problems)).toBe(true);
    const hard = problems.filter((x) => /^Not rendered|across it|you give \d+:|^The rewrite is empty/.test(x));
    expect(hard).toEqual([]);
  });

  it('finds the sentence a submission leaves out', () => {
    const lost = structuredClone(echo);
    lost.paragraphs[1]!.sentences.pop();
    const n = brief.sentences.filter((s) => s.paragraph === paragraphs[1]).at(-1)!.n;
    expect(gate(m, brief, lost).some((x) => x.startsWith(`Not rendered: sentence ${n} `))).toBe(true);
    expect(gate(m, brief, { ...echo, paragraphs: [] })).toEqual(['The rewrite is empty.']);
  });

  it('renders the submission aligned to the writer’s sentences', () => {
    const r = render(m, brief, echo);
    expect(r.source).toHaveLength(brief.sentences.length);
    expect(r.paragraphs).toHaveLength(paragraphs.length);
    expect(r.paragraphs.map((p) => p.source)).toEqual(paragraphs);
    expect(r.aligned.map((a) => a.from)).toEqual(brief.sentences.map((s) => [s.n]));
    expect(r.aligned.every((a) => typeof a.why === 'string')).toBe(true);
    expect(r.text.split('\n\n')).toHaveLength(paragraphs.length);
    expect(r.notes).toEqual([]);
  });
});

// Plain is a style, not a writer: its moves are rules the engine checks, and the page marks the writer's needless
// words where it marks, for a writer's voice, the words the voice never wrote.
describe.skipIf(!voices.includes('plain'))('plain style', () => {
  const m = AuthorModel.load('plain');
  const faults = (text: string, rules?: PlainRule[]) => plainFaults(m.plain, text, rules).map((f) => [f.kind, text.slice(f.start, f.end), f.instead]);

  it('is a style with a rule for every move, and a family of its own', () => {
    expect(m.author.style).toBe(true);
    expect(m.author.family).toBe('styles');
    expect(FAMILIES).toContain('styles');
    expect(m.author.title).toBe('Plain: formal and declarative, with everything extra removed');
    expect(m.author.moves!.map((x) => x.rule)).toEqual(PLAIN_RULES);
    expect(m.author.works.map((w) => w.title)).toEqual(['Personal Memoirs of Ulysses S. Grant', 'The Elements of Style']);
    expect(m.totalWords).toBeGreaterThan(200_000);
  });

  it('finds stock phrases, hedges and intensifiers, each with what to do', () => {
    expect(faults('I think the plan was really very good, due to the fact that it was sort of simple.')).toEqual([
      ['hedge', 'I think', null],
      ['intensifier', 'really', null],
      ['intensifier', 'very', null],
      ['stock', 'due to the fact that', 'because'],
      ['hedge', 'sort of', null],
    ]);
    expect(faults('In order to win, we trained on a daily basis.')).toEqual([
      ['stock', 'In order to', 'to'],
      ['stock', 'on a daily basis', 'daily'],
    ]);
    const [f] = plainFaults(m.plain, 'It was very late.');
    expect(f!.reason).toBe('“very” is an intensifier: a word that strengthens the word after it. Cut it, or choose a stronger word.');
  });

  it('leaves alone the words that only look like a fault', () => {
    expect(faults('What kind of dog is that? I think about it often. I feel sick.')).toEqual([]);
    expect(faults('I was tired, so we went home. It was so cold that we left. She is a pretty girl.')).toEqual([]);
    expect(faults('The house is not happy, but calm. It is not only cheap but good.')).toEqual([]);
    expect(faults('I am interested in the nature of the forest. I was born in Ohio.')).toEqual([]);
  });

  it('finds a negative where one word would do', () => {
    expect(faults('He was not honest, and he did not remember the meeting.')).toEqual([
      ['negative', 'not honest', 'dishonest'],
      ['negative', 'did not remember', 'forgot'],
    ]);
    expect(faults('She was not kind.')).toEqual([['negative', 'not kind', 'unkind']]);
    expect(faults("She doesn't have a car.")).toEqual([['negative', "doesn't have", 'lacks']]);
  });

  it('finds the passive voice and names who acts', () => {
    const [f] = plainFaults(m.plain, 'The plan was rejected by the committee.', ['active']);
    expect(f).toMatchObject({ kind: 'passive', rule: 'active', text: 'was rejected' });
    expect(f!.reason).toContain('Make “the committee” the subject.');
    expect(faults('The committee rejected the plan.', ['active'])).toEqual([]);
    expect(faults('The army was rapidly mobilized.', ['active']).map((x) => x[0])).toEqual(['passive']);
  });

  it('finds an abstract word and a sentence that carries too much', () => {
    expect(faults('The weather situation was a factor in the delay.')).toEqual([
      ['abstract', 'situation', null],
      ['abstract', 'factor', null],
    ]);
    const long = 'The bus was late, and we missed the start, but the coach waited because he knew the roads were bad, which was lucky.';
    expect(plainFaults(m.plain, long, ['oneidea']).map((f) => f.kind)).toEqual(['loaded']);
    expect(plainFaults(m.plain, 'The bus was late, and we missed the start.', ['oneidea'])).toEqual([]);
  });

  it('shows a move where the sentence keeps the rule, so a rewrite is credited with the fault it mends', () => {
    const before = 'I think the lake was really cold.';
    const after = 'The lake was cold.';
    const hedge = { id: 'hedge' };
    expect(m.shows(hedge, before)).toBe(false);
    expect(m.shows(hedge, after)).toBe(true);
    expect(keepsRule(m.plain, 'needless', 'We trained daily to win.')).toBe(true);
    expect(keepsRule(m.plain, 'needless', 'We trained daily in order to win.')).toBe(false);
    expect(keepsRule(m.plain, 'hedge', '…')).toBe(false);
  });

  it('quotes as a model only a sentence that shows the rule at work', () => {
    expect(modelsRule(m.plain, 'active', 'He then gave the order to charge.')).toBe(true);
    expect(modelsRule(m.plain, 'active', 'The order was then given.')).toBe(false);
    expect(modelsRule(m.plain, 'positive', 'A crossing would have been impossible in the presence of an enemy.')).toBe(true);
    for (const mv of m.author.moves!) {
      const ex = m.moveExamples(mv.id, 'The committee rejected the plan because it cost too much.', 2);
      expect(ex.length, mv.id).toBeGreaterThan(0);
      for (const c of ex) expect(plainFaults(m.plain, c.text), c.text).toEqual([]);
    }
  });

  it('lists the needless words of a text for the page, each distinct word once', () => {
    const ws = needlessWords(m.plain, ['I think it was very late.', 'It was very cold, due to the fact that the door was open.']);
    expect(ws.map((w) => [w.word, w.paragraph, w.times, w.kind, w.rule, w.term, w.instead])).toEqual([
      ['I think', 0, 1, 'hedge', 'hedge', 'hedge', null],
      ['very', 0, 2, 'intensifier', 'hedge', 'intensifier', null],
      ['due to the fact that', 1, 1, 'stock', 'needless', 'stockphrase', 'because'],
    ]);
    expect(ws[1]).toMatchObject({ start: 15, end: 19 });
    expect(ws[1]!.note).toMatch(/It is in your text 2 times\.$/);
    for (const w of ws) expect(termOf(w.term), w.term).toBeTruthy();
    expect(needlessWords(m.plain, ['I think it was very late.'], 1)).toHaveLength(1);
  });

  it('defines every kind of fault and names every move by a glossary term', () => {
    for (const id of Object.values(KIND_TERM)) expect(termOf(id), id).toBeTruthy();
    for (const mv of m.author.moves!) expect(termOf(mv.name) ?? termOf(mv.id), mv.name).toBeTruthy();
  });

  it('flags no word of the writer’s as one the style never wrote, and gives the brief the faults instead', () => {
    const blocks = blocksOfText('I think my phone is really great. The internet was invented by scientists.');
    expect(analyze(m, blocks).words).toEqual([]);
    const brief = buildBrief(m, blocks);
    expect(brief.sentences.every((s) => s.never.length === 0)).toBe(true);
    expect(brief.sentences[0]!.faults!.map((f) => f.words)).toEqual(['I think', 'really']);
    expect(brief.sentences[1]!.faults!.map((f) => f.rule)).toEqual(['active']);
    expect(userPrompt(m, brief)).toContain('<fault rule="hedge">“I think” is a hedge');
  });

  it('marks needless words in the reading, and a writer’s voice keeps its never-words', () => {
    const r = readText('plain', sample);
    expect(r.marks).toBe('needless');
    expect(r.never.length).toBeGreaterThan(0);
    expect(r.never.length).toBeLessThanOrEqual(NEEDLESS_LIMIT);
    for (const w of r.never) {
      expect(r.paragraphs[w.paragraph]!.slice(w.start, w.end)).toBe(w.word);
      expect(w.kind && w.rule && w.term && w.note).toBeTruthy();
      expect(w.note).not.toMatch(/never wrote/);
    }
    if (voices.includes('austen')) {
      const a = readText('austen', sample);
      expect(a.marks).toBe('never');
      expect(a.never.every((w) => w.kind === undefined && /never wrote/.test(w.note))).toBe(true);
    }
  });

  it('offers a drill on the writer’s own faulty sentence, and reads the attempt by the rule', () => {
    const drills = drillsFor(m, 'The lake was cold. I think she likes me but I am really tired.');
    expect(drills).toEqual([expect.objectContaining({ move: 'hedge', reason: 'fault', sentence: 'I think she likes me but I am really tired.' })]);
    expect(practiceCheck(m, 'I think the lake was really cold.', 'hedge')).toMatchObject({ made: false, verdict: expect.stringMatching(/^Not yet\. “I think” is a hedge/) });
    expect(practiceCheck(m, 'The lake was cold.', 'hedge').made).toBe(true);
    expect(practiceCheck(m, 'The dog ate my lunch.', 'Active voice').verdict).toMatch(/^Yes, that’s active voice\./);
    expect(practiceCheck(m, 'My phone broke.').never).toEqual([]);
  });
});

describe('a manual read from Project Gutenberg', () => {
  it('leaves out the examples set in from the margin, and the marks for bold', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plain-'));
    writeFileSync(
      join(dir, 'book.txt'),
      ['*** START OF THE PROJECT GUTENBERG EBOOK ***', '', 'III. PRINCIPLES', '', '', '13. Omit needless words.', '', 'Many expressions violate this principle:', '', '  the question as to whether', '', '    whether', '', '=Bid.= Takes the infinitive without _to_.', '', '*** END OF THE PROJECT GUTENBERG EBOOK ***'].join('\n'),
    );
    const chapters = readGutenberg(dir, { file: 'book.txt', chapter: '^[IVX]+\\. [A-Z ,]+$', speakers: '^\\d+\\.\\s+', dropIndented: true, strip: '=' });
    expect(chapters.map((c) => c.paragraphs.map((p) => p.text))).toEqual([['Omit needless words.', 'Many expressions violate this principle:', 'Bid. Takes the infinitive without to.']]);
  });
});
