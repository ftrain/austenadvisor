// Try it: the engine's check of a writer's attempt at a move, for every built voice, on three known sentences: one of
// the voice's own that makes the move, a modern sentence that does not, and nothing at all.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorDbPath, ROOT } from '../src/db.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { drillsFor, practiceCheck, withArticle } from '../src/engine/practice.ts';
import { hintOf } from '../src/corpus/sources.ts';
import { createApp } from '../src/server/app.ts';

const voices = readdirSync(join(ROOT, 'authors'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((id) => existsSync(authorDbPath(id)));

const MODERN = 'I texted my bestie and she was like totally chill about it.';

describe.skipIf(!voices.length).each(voices)('practiceCheck in the voice of %s', (id) => {
  const m = AuthorModel.load(id);
  const moves = (m.author.moves ?? []).map((mv) => ({ mv, example: m.moveExamples(mv.id, '', 1)[0] })).filter((x) => x.example);

  it('has a move with an example of its own', () => {
    expect(moves.length).toBeGreaterThan(0);
  });

  it('finds each move in a sentence of the voice that makes it', () => {
    for (const { mv, example } of moves) {
      const r = practiceCheck(m, example!.text, mv.name);
      expect(r.move?.name, `${id}: ${mv.id}`).toBe(mv.name);
      expect(r.move?.made, `${id}: ${mv.id} in “${example!.text}”`).toBe(true);
      expect(r.verdict.length).toBeGreaterThan(0);
    }
  });

  // A style (plain) limits no words, and a sentence that breaks no rule shows its moves: test/voices.test.ts reads it.
  it.skipIf(!!m.author.style)('finds no move in a modern sentence, and names the words the voice never used', () => {
    const { mv } = moves[0]!;
    const r = practiceCheck(m, MODERN, mv.name);
    expect(r.move?.made).toBe(false);
    expect(r.never.map((w) => w.word)).toContain('texted');
    expect(r.length.sentences).toBe(1);
    expect(r.length.meanWords).toBe(12);
    expect(r.length.authorRange[0]).toBeLessThanOrEqual(r.length.authorMedian);
    expect(r.length.authorMedian).toBeLessThanOrEqual(r.length.authorRange[1]);
    expect(r.verdict).toMatch(/texted/);
  });

  it('writes verdicts with articles, and gives the hint, never the definition, on a miss', () => {
    const bad = /\b(his|her|its|their) (the|a|an)\b|\bthat is (his|her|its|their)\b|“[^”]*“[^”]*””/i;
    for (const { mv, example } of moves) {
      const yes = practiceCheck(m, example!.text, mv.id);
      expect(yes.verdict, `${id}: ${mv.id}`).toMatch(/^Yes, that’s /);
      expect(yes.verdict, `${id}: ${mv.id}`).not.toMatch(bad);
      expect(yes.made).toBe(true);
      expect(yes.shape?.score, `${id}: ${mv.id}`).toBeGreaterThan(0);
      expect(yes.shape!.score).toBeLessThanOrEqual(1);
      if (m.author.style) continue;
      const no = practiceCheck(m, MODERN, mv.id);
      expect(no.verdict, `${id}: ${mv.id}`).not.toMatch(bad);
      expect(no.verdict).toMatch(/^Not yet\. /);
      expect(no.verdict).toContain(hintOf(mv));
      expect(no.hint).toBe(hintOf(mv));
      if (mv.hint && mv.hint !== mv.does) expect(no.verdict).not.toContain(mv.does);
      expect(no.shape === null || (no.shape.score >= 0 && no.shape.score <= 1)).toBe(true);
    }
  });

  it('never offers a salutation as a sentence to practise on', () => {
    const letter = 'Dear Mom and Dad,\nCamp is fun. The food is bad. I miss you. We swim a lot.\nLove, Sam';
    const salute = (d: { sentence: string }) => /^(Dear|Love)\b/.test(d.sentence);
    expect(drillsFor(m, letter).filter(salute)).toEqual([]);
    const notes = [{ kind: 'move', id: 'apostrophe', technique: 'Apostrophe', before: 'Dear Mom and Dad,', after: 'O mother, O father, hear me now!', verified: true }];
    expect(drillsFor(m, letter, notes).filter(salute)).toEqual([]);
  });

  it('answers an empty attempt without failing', () => {
    const r = practiceCheck(m, '', moves[0]!.mv.name);
    expect(r.move?.made).toBe(false);
    expect(r.never).toEqual([]);
    expect(r.length.sentences).toBe(0);
    expect(practiceCheck(m, MODERN).move).toBeNull();
  });
});

const NOT_BUT = 'It was not the money that mattered to us, but the promise that we broke.';
const has = (id: string) => voices.includes(id);

describe('Try it', () => {
  it.each(['lincoln', 'austen', 'twain'].filter(has))('passes a real “not …, but …” as an antithesis for %s', (id) => {
    const r = practiceCheck(AuthorModel.load(id), NOT_BUT, 'antithesis');
    expect(r.made).toBe(true);
    expect(r.verdict).toMatch(/^Yes, that’s an antithesis\. 15 words; (his|her|its|their) usual \d+ to \d+\./);
    expect(r.length.band).not.toBeNull();
  });

  it('puts the right article before a name', () => {
    expect(withArticle('Antithesis')).toBe('an antithesis');
    expect(withArticle('Litotes (understatement)')).toBe('litotes');
    expect(withArticle('The phrase said again')).toBe('the phrase said again');
    expect(withArticle('The man who')).toBe('the move “The man who”');
    expect(withArticle('Thou and thee')).toBe('the move “Thou and thee”');
    expect(withArticle('Speech brought in by “said unto”')).toBe('the move ‘Speech brought in by “said unto”’');
  });

  it.skipIf(!has('austen'))('names each move once, whatever the glossary calls it', () => {
    const m = AuthorModel.load('austen');
    const r = practiceCheck(m, 'She was not unwilling to go, and he was not sorry to see her leave.', 'balance');
    const litotes = r.also.filter((n) => /litotes|understatement/i.test(n));
    expect(litotes.length).toBe(1);
    // Asked for by another of its names, the move is the voice's own.
    expect(practiceCheck(m, 'She was not unwilling.', 'understatement').move?.id).toBe('litotes');
  });

  it.skipIf(!has('austen'))('offers drills only for moves the rewrite made, once each', () => {
    const m = AuthorModel.load('austen');
    const before = 'I was happy to go.';
    const made = { kind: 'move', id: 'litotes', technique: 'Understatement and litotes', before, after: 'She was not unwilling to go.', verified: true };
    const twice = { ...made, id: undefined, technique: 'Understatement' };
    const unmade = { kind: 'move', id: 'balance', technique: 'Balanced clauses in one long sentence', before, after: 'She went.', verified: true };
    const unverified = { ...made, id: 'saidshe', technique: 'Speech tagged after its first clause', verified: false };
    const d = drillsFor(m, before, [made, twice, unmade, unverified, { kind: 'liberty', technique: 'Added by Austen', before, after: 'x' }]);
    expect(d.map((x) => [x.move, x.reason, x.sentence])).toEqual([['litotes', 'rewrite', before]]);
    // A sentence of the writer's that already makes the move is no drill.
    expect(drillsFor(m, '', [{ ...made, before: 'I was not unwilling to go.' }])).toEqual([]);
  });

  it.skipIf(!has('austen'))('finds gaps in a text with no rewrite', () => {
    const m = AuthorModel.load('austen');
    const d = drillsFor(m, 'Camp is fun. The food is bad. I miss you. We swim a lot.');
    expect(d.map((x) => x.reason)).toEqual(['short', 'joins', 'figures']);
    expect(d[0]!.sentence).toBe('Camp is fun. The food is bad.');
    expect(d.length).toBeLessThanOrEqual(3);
    // Each engine drill is checked by practiceCheck.
    expect(practiceCheck(m, 'Camp is fun, but the food is bad, and we swim a great deal more than I had thought.', 'longer').made).toBe(true);
    expect(practiceCheck(m, 'Camp is fun. The food is bad.', 'longer').made).toBe(false);
    expect(practiceCheck(m, 'Camp is fun; the food is bad.', 'join').made).toBe(true);
    expect(practiceCheck(m, 'Camp is fun.', 'join').verdict).toContain('semicolon');
    // A long text that joins its clauses and makes a figure has no gap.
    const full = 'She was not unwilling to stay, for the house was quiet and the company was kind; and she owned, at last, that the visit had been a pleasure to her.';
    expect(drillsFor(m, `${full} ${full} ${full}`)).toEqual([]);
  });

  const packed = voices.filter((id) => AuthorModel.load(id).pack).slice(0, 3);
  it.skipIf(!packed.length).each(packed)('answers in under 250 ms once warm, for %s', (id) => {
    const m = AuthorModel.load(id);
    const mv = m.author.moves![0]!.id;
    practiceCheck(m, MODERN, mv);
    const t = performance.now();
    practiceCheck(m, NOT_BUT, mv);
    expect(performance.now() - t).toBeLessThan(250);
  });

  it.skipIf(!has('austen'))('serves the check and the drills over HTTP', async () => {
    const app = await createApp();
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    const port = (app.address() as { port: number }).port;
    const post = (path: string, b: unknown) =>
      fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    try {
      const r = await post('/api/practice', { author: 'austen', text: NOT_BUT, move: 'antithesis' });
      expect(r.status).toBe(200);
      const c = await r.json();
      expect(Object.keys(c)).toEqual(expect.arrayContaining(['made', 'verdict', 'hint', 'also', 'length', 'shape', 'move', 'never']));
      expect(c.made).toBe(true);
      const d = await (await post('/api/practice/drills', { author: 'austen', text: 'Camp is fun. The food is bad. I miss you.' })).json();
      expect(d.drills[0].reason).toBe('short');
      expect((await post('/api/practice', { author: 'nobody', text: 'x' })).status).toBe(404);
    } finally {
      await new Promise((r) => app.close(r));
    }
  });
});
