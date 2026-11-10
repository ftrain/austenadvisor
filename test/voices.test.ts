// Every built voice through the engine's side of a rewrite, on one sample: the brief, the gate and the render. The
// submission gives back each of the writer's sentences as it stands, so nothing here needs a model.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorDbPath, ROOT } from '../src/db.ts';
import { buildBrief } from '../src/engine/brief.ts';
import { blocksOfText } from '../src/engine/doc.ts';
import { AuthorModel } from '../src/engine/model.ts';
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
