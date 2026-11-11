// Each voice's shapes: the outline of two to four real pieces it wrote (authors/<id>.json, `shapes`). Every one must
// be well formed, and every quote must stand in the built corpus, exactly, in one work and in the order of the
// parts. A voice not yet built is checked for form only.
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { checkVoice, voiceIds } from '../scripts/check-shapes.ts';
import { readAuthor } from '../src/corpus/sources.ts';
import { authorDbPath, ROOT } from '../src/db.ts';
import { TERMS, roleTerm } from '../src/engine/glossary.ts';
import { outlineOf, shapeFaults, shapesFor, shapesOf, verifyShape, type VoiceShape } from '../src/engine/outline.ts';
import { ROLES } from '../src/engine/structure.ts';

const ids = voiceIds();
const gettysburg: VoiceShape = {
  work: 'the Gettysburg Address',
  cite: 'Address at Gettysburg, 19 November 1863',
  kind: 'speech',
  parts: [
    { role: 'background', says: 'Begins at the founding.', quote: 'Four score and seven years ago' },
    { role: 'turn', says: 'Turns.', quote: 'But, in a larger sense, we can not dedicate' },
    { role: 'call', says: 'Charges the living.', quote: 'It is for us the living, rather, to be dedicated' },
  ],
};

describe('the voices’ shapes', () => {
  it('gives every voice two to four well-formed shapes', () => {
    expect(ids.length).toBeGreaterThanOrEqual(21);
    for (const id of ids) {
      const r = checkVoice(id);
      expect(r.faults, id).toEqual([]);
      expect(shapesOf(readAuthor(ROOT, id) as { shapes?: unknown })).toHaveLength(r.shapes);
    }
  });

  it('finds every quote in the built corpus, in one work and in order', () => {
    const built = ids.filter((id) => existsSync(authorDbPath(id)));
    for (const id of built) {
      const r = checkVoice(id);
      expect(r.faults, id).toEqual([]);
      const parts = shapesOf(readAuthor(ROOT, id) as { shapes?: unknown }).reduce((n, s) => n + s.parts.length, 0);
      expect(r.quotes, id).toBe(parts);
    }
  });

  it('defines every role a shape names', () => {
    const defined = new Set(TERMS.map((t) => t.id));
    for (const id of ids)
      for (const s of shapesOf(readAuthor(ROOT, id) as { shapes?: unknown }))
        for (const p of s.parts) {
          expect(ROLES[p.role], `${id}: ${p.role}`).toBeDefined();
          expect(defined.has(roleTerm(p.role)), `${id}: ${p.role}`).toBe(true);
        }
  });

  it('says what is wrong with a shape that is not well formed', () => {
    expect(shapeFaults(gettysburg)).toEqual([]);
    expect(shapeFaults({ ...gettysburg, kind: 'sermon' })).toEqual(['the Gettysburg Address: “sermon” is not a kind']);
    expect(shapeFaults({ ...gettysburg, parts: gettysburg.parts.slice(0, 2) })[0]).toMatch(/2 parts/);
    expect(shapeFaults({ ...gettysburg, parts: [{ role: 'part', says: 'Goes on.', quote: 'x' }, ...gettysburg.parts] })[0]).toMatch(/“part” is not a role/);
    expect(shapeFaults({ ...gettysburg, parts: [{ ...gettysburg.parts[0]!, says: 'A great opening!' }, ...gettysburg.parts.slice(1)] })[0]).toMatch(/not a plain sentence/);
    expect(shapesOf({ shapes: [gettysburg, { work: 'x' }] })).toEqual([gettysburg]);
  });

  it.skipIf(!existsSync(authorDbPath('lincoln')))('refuses a quote that is not in the corpus, or is out of order', () => {
    const db = new DatabaseSync(authorDbPath('lincoln'), { readOnly: true });
    expect(verifyShape(db, gettysburg)).toEqual([]);
    const wrong = { ...gettysburg, parts: [{ ...gettysburg.parts[0]!, quote: 'Eighty-seven years ago' }, ...gettysburg.parts.slice(1)] };
    expect(verifyShape(db, wrong)).toEqual(['the Gettysburg Address: “Eighty-seven years ago” is not in the corpus']);
    const swapped = { ...gettysburg, parts: [gettysburg.parts[2]!, gettysburg.parts[1]!, gettysburg.parts[0]!] };
    expect(verifyShape(db, swapped)).toEqual(['the Gettysburg Address: its quotes are not in the order of its parts']);
    db.close();
  });

  it('picks the shapes of the kind asked for, then of the nearest kind, then the first', () => {
    const of = (kind: VoiceShape['kind'], work: string): VoiceShape => ({ ...gettysburg, kind, work });
    const shapes = [of('speech', 'a'), of('letter', 'b'), of('speech', 'c')];
    expect(shapesFor(shapes, 'speech').map((s) => s.work)).toEqual(['a', 'c']);
    expect(shapesFor(shapes, 'letter').map((s) => s.work)).toEqual(['b']);
    expect(shapesFor(shapes, 'argument').map((s) => s.work)).toEqual(['a', 'c']);
    expect(shapesFor(shapes, 'story').map((s) => s.work)).toEqual(['a']);
    expect(shapesFor([], 'story')).toEqual([]);
    expect(outlineOf(gettysburg).line).toBe('Background · Turn · Call');
    expect(outlineOf(gettysburg).parts[0]!.name).toBe('Background');
  });
});
