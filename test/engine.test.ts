// The engine against the built Austen model (npm run build:model); skipped where it is not built.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { analyze } from '../src/engine/analyze.ts';
import { austenize } from '../src/engine/austenize.ts';
import { blocksOfText } from '../src/engine/doc.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { concordance, wordProfile } from '../src/engine/tools.ts';
import { buildBrief } from '../src/engine/brief.ts';
import { gate, render, type Submission } from '../src/server/rewrite.ts';
import { explainSentence } from '../src/engine/explain.ts';
import { figureExamples, findFigures } from '../src/engine/figures.ts';

const built = existsSync(authorDbPath('austen'));

describe.skipIf(!built)('the Austen engine', () => {
  const m = built ? AuthorModel.load('austen') : (null as unknown as AuthorModel);

  it('holds her works', () => {
    expect(m.author.works.length).toBeGreaterThanOrEqual(6);
    expect(m.totalWords).toBeGreaterThan(700_000);
    expect(m.word('tolerable')!.count).toBeGreaterThan(40);
  });

  it('flags every word she never wrote, and offers hers', () => {
    const a = analyze(m, blocksOfText('I grabbed my keys. It was super crowded.'));
    const flagged = Object.fromEntries(a.words.map((w) => [w.word, w]));
    expect(Object.keys(flagged)).toEqual(expect.arrayContaining(['grabbed', 'super']));
    expect(flagged.grabbed!.kind).toBe('never');
    expect(flagged.grabbed!.alternatives.map((x) => x.text)).toEqual(expect.arrayContaining(['caught']));
    expect(flagged.super!.alternatives.map((x) => x.text)).toContain('extremely');
    expect(a.words.find((w) => w.word === 'keys')).toBeUndefined();
  });

  it('cites a real sentence for each alternative', () => {
    const a = analyze(m, blocksOfText('He totally ignored me.'));
    const ex = a.words.find((w) => w.word === 'ignored')!.alternatives.find((x) => x.example)!.example!;
    expect(ex.cite).toMatch(/, (ch\. \d+|“.*”), ¶ \d+$/);
    expect(m.cite(ex.id)!.text).toBe(ex.text);
  });

  it('writes out contractions in narration, and says how often she did', () => {
    const a = analyze(m, blocksOfText('I didn’t want to be rude.'));
    const fix = a.advice.find((x) => x.title.includes('did not'))!;
    expect(fix.severity).toBe('fix');
    expect(fix.why).toMatch(/“did not” \d[\d,]* times/);
  });

  it('joins a run of short sentences as she joins clauses', () => {
    const a = analyze(m, blocksOfText('I needed milk. I drove to the shop. It was crowded. I waited.'));
    const join = a.advice.find((x) => x.title.includes('short sentences'))!;
    expect(join.replacements![0]!.text.split(/[.!?](\s|$)/).filter((s) => s.trim()).length).toBeLessThan(4);
  });

  it('rewrites by statistics alone and scores better', () => {
    const r = austenize(m, blocksOfText('I grabbed my keys. It was super crowded. I didn’t want to be rude.'));
    expect(r.scoreAfter).toBeGreaterThan(r.scoreBefore);
    expect(r.after[0]!.text).toContain('did not');
    expect(r.changes.length).toBeGreaterThan(2);
  });

  it('explores a word: by work, neighbours, collocates, sentences', () => {
    const p = wordProfile(m, 'handsome');
    expect(p.works.length).toBeGreaterThan(5);
    expect(p.neighbours).toEqual(expect.arrayContaining(['pretty']));
    expect(p.examples.length).toBeGreaterThan(0);
    expect(concordance(m, 'at last', 5).every((k) => /at last/i.test(k.match))).toBe(true);
  });

  it('briefs a rewrite, gates it, and renders its citations from the corpus', () => {
    const brief = buildBrief(m, blocksOfText('Dear Mom,\n\nI grabbed my keys. It was super crowded.\n\nLove, Jake'));
    expect(brief.register).toBe('letter');
    expect(brief.sentences[1]!.never[0]!.word).toBe('grabbed');
    expect(brief.sentences[1]!.models.length).toBeGreaterThan(0);
    const model = `S${m.moveExamples('judgement', 'keys', 1)[0]!.id}`;
    const bad: Submission = {
      paragraphs: [{ sentences: [{ text: 'Dear Mama,', from: [1], model: 'S1' }] }, { sentences: [{ text: 'I grabbed my keys.', from: [2], model: 'S1' }] }],
      notes: [{ move: 'balance', before: 'a', after: 'b', model: 'S999999999' }],
      explanation: '',
    };
    const problems = gate(m, brief, bad).join(' ');
    expect(problems).toMatch(/never wrote: “grabbed”/);
    expect(problems).toMatch(/Not rendered: sentence 3/);
    expect(problems).toMatch(/Unknown ids: S999999999/);
    const good: Submission = {
      paragraphs: [
        { sentences: [{ text: 'My dear Mama,', from: [1], model }] },
        { sentences: [{ text: 'I caught up my keys with some composure, though the shop was extremely crowded.', from: [2, 3], model: 'S999999999' }] },
        { sentences: [{ text: 'Your affectionate Jake', from: [4], model }] },
      ],
      notes: [1, 2, 3].map(() => ({ move: 'judgement', before: 'b', after: 'with some composure', model })),
      explanation: 'e',
    };
    expect(gate(m, brief, good).join(' ')).toMatch(/inspired it; these do not: “I caught up my keys/);
    good.paragraphs[1]!.sentences[0]!.model = model;
    expect(gate(m, brief, good)).toEqual([]);
    const r = render(m, brief, good);
    expect(r.notes[0]!.austen).toBe(m.cite(Number(model.slice(1)))!.text);
    expect(r.notes[0]!.verified).toBe(true);
    expect(r.aligned[1]!.before).toEqual(['I grabbed my keys.', 'It was super crowded.']);
    // Every rewritten sentence: one sentence of why, from the template, and a real sentence of hers.
    for (const a of r.aligned) {
      expect(a.why.split(/(?<=\.)\s+(?=[A-Z])/).length).toBe(1);
      expect(m.cite(a.model.id)!.text).toBe(a.model.text);
    }
    expect(r.aligned[1]!.why).toMatch(/^This sentence uses her “judgement in abstract nouns”, joins two sentences \(4, 4 words\) into one of 14, and replaces “grabbed” with “caught”, “super” with “extremely” \(never in Austen\), modelled on .+, ¶ \d+\.$/);
  });

  it('explains a rewritten sentence by what changed, and links the move it makes', () => {
    const w = explainSentence(m, ['“I’m not ready,” he said.'], 'He said that he was not ready for anything so serious.', null);
    expect(w.why).toMatch(/^This sentence .*(turns quoted speech into reported speech|“speech reported”).*, modelled on .+, ¶ \d+\.$/);
    expect(w.moves).toContain('reported');
    expect(new RegExp(m.author.moves!.find((x) => x.id === 'reported')!.pattern, 'i').test(w.model.text)).toBe(true);
  });

  it('recognizes figures of speech by their form, in her sentences and in a writer’s', () => {
    const terms = (t: string) => findFigures(m, t).map((f) => f.term);
    expect(terms('It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.')).toContain('gnomic');
    expect(terms('She was not unwilling to go, and it was a matter of no small consequence.')).toEqual(['litotes', 'litotes']);
    expect(terms('“Not they indeed,” cried Thorpe.')).not.toContain('litotes');
    expect(terms('He was busy with the instrument in his hand.')).toContain('periphrasis');
    expect(terms('Small heart had Harriet for visiting.')).toContain('inversion');
    expect(terms('She had been wrong, not in her judgement of him, but in her own.')).toContain('antithesis');
    expect(terms('They had walked, and talked, and laughed, and been happy together.')).toContain('polysyndeton');
    expect(terms('It was, I believe, the most awkward ten minutes of my life.')).toEqual(expect.arrayContaining(['parenthesis', 'hyperbole']));
    expect(terms('How could she have been so blind!')).toContain('fid');
    expect(terms('Will you send me my books?')).toContain('fid');
    expect(findFigures(m, 'Will you send me my books?', { letter: true }).map((f) => f.term)).not.toContain('fid');
    // Every example offered for a figure shows it.
    for (const t of ['litotes', 'antithesis', 'tricolon', 'gnomic']) for (const c of figureExamples(m, t, 'a quiet evening at home', 2)) expect(terms(c.text)).toContain(t);
  });

  it('names what a rewrite did with each word she never wrote: replaced, rendered by periphrasis, or dropped', () => {
    const w = explainSentence(m, ['He talked on his phone and wore a hoodie.'], 'He was busy with the instrument in his hand.', null);
    expect(w.why).toMatch(/renders “phone” \(“the instrument in his hand”\) by periphrasis/);
    expect(w.why).toMatch(/drops “hoodie”/);
    expect(w.dropped).toEqual(['hoodie']);
    const l = explainSentence(m, ['Camp is okay.'], 'Camp is not intolerable.', null);
    expect(l.why).toMatch(/makes a litotes \(“not intolerable”\)/);
  });

  it('reads a page quickly once warm', () => {
    const text = 'It was a bright cold day. The clocks were striking. '.repeat(40);
    analyze(m, blocksOfText(text));
    const t = performance.now();
    analyze(m, blocksOfText(text + ' One more sentence here.'));
    expect(performance.now() - t).toBeLessThan(400);
  });
});
