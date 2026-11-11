// A text fitted to a form before it is rewritten: the paragraphs put in the form's order, a note for each one that
// moved, and, for each part of the text sent to the writer, the form as the brief states it. Engine work, no model.

import type { BriefFact, BriefForm } from '../engine/brief.ts';
import type { DocBlock } from '../engine/doc.ts';
import { readForm, type FormReading } from '../engine/forms.ts';
import type { Role } from '../engine/structure.ts';
import type { Fact } from './facts.ts';

const isPara = (b: DocBlock) => (b.kind === 'paragraph' || b.kind === 'quote' || b.kind === 'item') && !!b.text.trim();

export interface Fit {
  reading: FormReading;
  /** The text's blocks with its paragraphs in the form's order. Headings stand where they were. */
  blocks: DocBlock[];
  /** For each block of `blocks`, its index in the blocks as the student wrote them. */
  orig: number[];
  /** For each paragraph block of `blocks`, by its index there: its index in reading.paragraphs (the student's order). */
  paragraph: Map<number, number>;
  /** For each paragraph the form moved, by its index in `blocks`: the note the row carries. */
  moved: Map<number, string>;
}

/**
 * Reads a text for a form ('auto' or a form id) and puts its paragraphs in the form's order. A text with a heading
 * between two of its paragraphs is left in the student's order: a heading stands, and nothing moves across one.
 * Null for an id that names no form.
 */
export function fitText(blocks: DocBlock[], form = 'auto'): Fit | null {
  const reading = readForm(blocks, form);
  if (!reading) return null;
  const at = blocks.flatMap((b, i) => (isPara(b) ? [i] : []));
  const order = reading.alignment.order;
  const inner = blocks.some((b, i) => !isPara(b) && i > at[0]! && i < at.at(-1)!);
  const reorder = !inner && order.length === at.length && order.some((p, k) => p !== k);
  const orig = blocks.map((_, i) => i);
  if (reorder) order.forEach((p, k) => (orig[at[k]!] = at[p]!));
  const paragraph = new Map<number, number>();
  at.forEach((i, k) => paragraph.set(i, reorder ? order[k]! : k));
  const moved = new Map<number, string>();
  if (reorder) for (const mv of reading.alignment.moved) moved.set(at[mv.to]!, `Moved: this was your paragraph ${mv.from + 1}. ${mv.why}`.trim());
  return { reading, blocks: orig.map((i) => blocks[i]!), orig, paragraph, moved };
}

/**
 * The parts of the form the text lacks, each given to one part of the text: the part that holds the last paragraph
 * of an earlier slot, or the first part. None unless the student chose the form: under 'auto' the form is only the
 * engine's reading of what the text already is.
 */
export function missingByPart(fit: Fit, parts: number[][]): Role[][] {
  const out: Role[][] = parts.map(() => []);
  if (fit.reading.auto || !parts.length) return out;
  const partOf = new Map<number, number>();
  parts.forEach((idx, part) => idx.forEach((i) => partOf.set(fit.paragraph.get(i) ?? -1, part)));
  const place = new Map<number, number>([...fit.paragraph].map(([block, p]) => [p, block]));
  const slots = fit.reading.alignment.slots;
  slots.forEach((s, si) => {
    if (!s.missing) return;
    const earlier = slots.slice(0, si).flatMap((x) => [...x.paragraphs, ...x.within]);
    const last = earlier.sort((a, b) => (place.get(a) ?? 0) - (place.get(b) ?? 0)).at(-1);
    out[last === undefined ? 0 : (partOf.get(last) ?? 0)]!.push(s.role);
  });
  return out;
}

/** The form as one part's brief states it: each slot with the part's paragraphs (numbered from 1) that fill it. */
export function briefForm(fit: Fit, idx: number[], missing: Role[] = []): BriefForm {
  const number = new Map(idx.map((i, k) => [fit.paragraph.get(i), k + 1]));
  const here = (ps: number[]) => ps.map((p) => number.get(p)).filter((n): n is number => !!n).sort((a, b) => a - b);
  return {
    form: fit.reading.form,
    slots: fit.reading.alignment.slots.map((s) => ({ role: s.role, says: s.says, paragraphs: here([...s.paragraphs, ...s.within]) })),
    missing,
  };
}

/** The facts for one part, as its brief states them: those gathered for its paragraphs, numbered as the brief does. */
export function briefFacts(fit: Fit | null, idx: number[], facts: Fact[]): BriefFact[] {
  const number = new Map(idx.map((i, k) => [fit ? fit.orig[i]! : i, k + 1]));
  return facts.flatMap((f) => (number.has(f.paragraph) ? [{ id: f.id, text: f.text, title: f.title, paragraph: number.get(f.paragraph)!, url: f.url }] : []));
}
