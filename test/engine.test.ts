// The engine against the built Austen model (npm run build:model); skipped where it is not built.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { analyze } from '../src/engine/analyze.ts';
import { austenize } from '../src/engine/austenize.ts';
import { blocksOfText } from '../src/engine/doc.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { concordance, wordProfile } from '../src/engine/tools.ts';
import { verifyQuote } from '../src/server/rewrite.ts';

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
    expect(verifyQuote(m, ex.text)).toBe(true);
    expect(verifyQuote(m, 'He totally ignored me at the checkout counter yesterday.')).toBe(false);
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

  it('reads a page quickly once warm', () => {
    const text = 'It was a bright cold day. The clocks were striking. '.repeat(40);
    analyze(m, blocksOfText(text));
    const t = performance.now();
    analyze(m, blocksOfText(text + ' One more sentence here.'));
    expect(performance.now() - t).toBeLessThan(400);
  });
});
