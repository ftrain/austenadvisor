// A voice's shape: the outline of one real piece the voice wrote. Each voice's file (authors/<id>.json) lists two
// to four under `shapes`: a well-known passage or a whole short piece, of a named kind, as three to six parts in
// order. A part has a role (structure.ts), one plain line on what the part does, and a short phrase quoted exactly
// from the corpus that opens or typifies it. The page shows the roles on one line under the student's own, so the
// two can be compared, and opens the line to show each part.
//
// Every quote must stand in the built corpus, in one work, in the order of the parts. scripts/check-shapes.ts and
// test/shapes.test.ts check that: a quote that is not in the corpus must not ship.

import type { DatabaseSync } from 'node:sqlite';
import { KINDS, ROLES, type Kind, type Role } from './structure.ts';

export interface ShapePart {
  role: Role;
  /** What the part does, in one plain line: "Begins eighty-seven years back, at the founding." */
  says: string;
  /** A short phrase from the corpus, exact, that opens or typifies the part. */
  quote: string;
}

export interface VoiceShape {
  /** The piece as it reads after "in": "the Gettysburg Address". */
  work: string;
  /** Where it stands: "Address at Gettysburg, 19 November 1863". */
  cite: string;
  kind: Kind;
  parts: ShapePart[];
}

/** A shape as the page is sent it: each part with its role's name, and the names on one line. */
export interface Outline extends VoiceShape {
  parts: (ShapePart & { name: string })[];
  /** "Background · Stakes · Occasion · Turn · Call" */
  line: string;
}

/** A voice has this many shapes, and a shape this many parts. */
export const SHAPES_PER_VOICE = [2, 4] as const;
export const PARTS_PER_SHAPE = [3, 6] as const;

const isText = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

/** What is wrong with one shape as written, with no corpus to hand: an unknown kind or role, too few parts. */
export function shapeFaults(s: unknown): string[] {
  const out: string[] = [];
  const x = (s ?? {}) as Partial<VoiceShape>;
  const name = isText(x.work) ? x.work : 'a shape';
  if (!isText(x.work)) out.push('a shape names no work');
  if (!isText(x.cite)) out.push(`${name}: no cite`);
  if (!KINDS.includes(x.kind as Kind)) out.push(`${name}: “${String(x.kind)}” is not a kind`);
  const parts = Array.isArray(x.parts) ? x.parts : [];
  if (parts.length < PARTS_PER_SHAPE[0] || parts.length > PARTS_PER_SHAPE[1]) out.push(`${name}: ${parts.length} parts, where ${PARTS_PER_SHAPE[0]} to ${PARTS_PER_SHAPE[1]} are wanted`);
  parts.forEach((p, i) => {
    if (!p || !(p.role in ROLES) || p.role === 'part') out.push(`${name}, part ${i + 1}: “${String(p?.role)}” is not a role`);
    if (!isText(p?.says)) out.push(`${name}, part ${i + 1}: nothing on what the part does`);
    else if (/!/.test(p.says) || !/[.?]$/.test(p.says.trim())) out.push(`${name}, part ${i + 1}: “${p.says}” is not a plain sentence`);
    if (!isText(p?.quote)) out.push(`${name}, part ${i + 1}: no quote`);
  });
  return out;
}

/** The well-formed shapes of a voice, in the order its file gives them. */
export function shapesOf(author: { shapes?: unknown }): VoiceShape[] {
  return (Array.isArray(author.shapes) ? author.shapes : []).filter((s): s is VoiceShape => shapeFaults(s).length === 0);
}

// Where a voice has no shape of the kind asked for, the nearest kind stands in: an essay is argued, a review is an
// essay, a speech is an argument said aloud. A story and a letter have no near kind.
const NEAR: Record<Kind, Kind[]> = {
  argument: ['essay', 'speech', 'review'],
  essay: ['argument', 'review', 'speech'],
  review: ['essay', 'argument'],
  speech: ['argument', 'essay'],
  letter: [],
  story: [],
};

/** The shapes to show for a text of this kind: every shape of the kind; else those of the nearest kind the voice
 * has; else the voice's first. */
export function shapesFor(shapes: VoiceShape[], kind: Kind): VoiceShape[] {
  for (const k of [kind, ...NEAR[kind]]) {
    const hit = shapes.filter((s) => s.kind === k);
    if (hit.length) return hit;
  }
  return shapes.slice(0, 1);
}

/** A shape with its roles named. */
export function outlineOf(s: VoiceShape): Outline {
  const parts = s.parts.map((p) => ({ ...p, name: ROLES[p.role].name }));
  return { ...s, parts, line: parts.map((p) => p.name).join(' · ') };
}

/**
 * Checks a shape's quotes against a built corpus. Each must be found exactly, by search, in a paragraph; and all of
 * them in one work, in the order of the parts. Returns what is wrong, or nothing.
 */
export function verifyShape(db: DatabaseSync, s: VoiceShape): string[] {
  const find = db.prepare('SELECT p.id AS id, c.work AS work, p.text AS text FROM paragraphs p JOIN chapters c ON c.id = p.chapter WHERE instr(p.text, ?) > 0 ORDER BY p.id');
  // Every place each quote stands: the paragraph, and the offset in it.
  const places = s.parts.map((p) => {
    const out: { work: string; id: number; at: number }[] = [];
    for (const r of find.all(p.quote) as { id: number; work: string; text: string }[])
      for (let at = r.text.indexOf(p.quote); at >= 0; at = r.text.indexOf(p.quote, at + 1)) out.push({ work: r.work, id: r.id, at });
    return out;
  });
  const faults = s.parts.flatMap((p, i) => (places[i]!.length ? [] : [`${s.work}: “${p.quote}” is not in the corpus`]));
  if (faults.length) return faults;
  const works = [...new Set(places[0]!.map((x) => x.work))].filter((w) => places.every((ps) => ps.some((x) => x.work === w)));
  if (!works.length) return [`${s.work}: its quotes are from different works`];
  const inOrder = works.some((w) => {
    let last = { id: -1, at: -1 };
    for (const ps of places) {
      const next = ps.find((x) => x.work === w && (x.id > last.id || (x.id === last.id && x.at > last.at)));
      if (!next) return false;
      last = next;
    }
    return true;
  });
  return inOrder ? [] : [`${s.work}: its quotes are not in the order of its parts`];
}
