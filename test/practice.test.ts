// Try it: the engine's check of a writer's attempt at a move, for every built voice, on three known sentences: one of
// the voice's own that makes the move, a modern sentence that does not, and nothing at all.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorDbPath, ROOT } from '../src/db.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { practiceCheck } from '../src/engine/practice.ts';

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

  it('finds no move in a modern sentence, and names the words the voice never used', () => {
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

  it('answers an empty attempt without failing', () => {
    const r = practiceCheck(m, '', moves[0]!.mv.name);
    expect(r.move?.made).toBe(false);
    expect(r.never).toEqual([]);
    expect(r.length.sentences).toBe(0);
    expect(practiceCheck(m, MODERN).move).toBeNull();
  });
});
