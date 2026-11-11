// The forms a student can ask for (essay, argument, anecdote, story, letter, speech, review) and how a text is
// fitted to one. A form is a list of slots in order, each slot a role from structure.ts. Fitting a text to a form
// is engine work with no model: label each paragraph, then put the paragraphs in the form's order, moving as few as
// the form requires and dropping none. The forms themselves are in forms.json beside this file.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocksOfText, type DocBlock } from './doc.ts';
import { detectKind, GUESS_BELOW, labelRoles, roleSequence, shapeLine, type Kind, type ParagraphRoles, type Role } from './structure.ts';

export type FormId = 'essay' | 'argument' | 'anecdote' | 'story' | 'letter' | 'speech' | 'review';

export interface FormSlot {
  role: Role;
  /** A text with no paragraph for a required slot is missing that part. */
  required: boolean;
  /** What the part does, as words that follow the form's name: "opens with its claim". */
  says: string;
  /** This slot shares its place with an earlier one, and the two keep the writer's order between them. The body of
   * every form is one such place: the form fixes how a piece opens and closes and leaves the middle to the writer. */
  beside?: Role;
}

export interface Form {
  id: FormId;
  name: string;
  /** One sentence a student can read. */
  definition: string;
  /** The kind of writing whose roles the form is read for (structure.ts). An anecdote is read as a story. */
  kind: Kind;
  /** The form is meant to be brief: an anecdote. */
  short?: boolean;
  slots: FormSlot[];
}

/** Every form, in the order the page offers them. */
export const FORMS: Form[] = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'forms.json'), 'utf8'));
export const FORM_IDS: FormId[] = FORMS.map((f) => f.id);

/** A form by its id, or undefined. */
export const formOf = (id: string): Form | undefined => FORMS.find((f) => f.id === id);

/** The form a kind of writing takes when the student asks for none: an argument is fitted to the argument form. */
export const formForKind = (kind: Kind): Form => formOf(kind) ?? FORMS[0]!;

/** A form's slots as the SHAPE line prints them: "Claim · Reason · Evidence · Objection · Answer · Call". */
export const formLine = (form: Form): string => shapeLine(form.slots.map((s) => s.role));

/** What a form does with a role, as a sentence: "An essay opens with its claim." Empty where it has no such slot. */
export function slotSentence(form: Form, role: Role): string {
  const slot = form.slots.find((s) => s.role === role);
  if (!slot) return '';
  const name = form.name.toLowerCase();
  return `${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name} ${slot.says}.`;
}

/** A paragraph is moved only where the engine is this sure of its role. A weaker label stays where it is. */
export const MOVE_CONFIDENCE = 0.7;

export interface AlignedSlot {
  role: Role;
  required: boolean;
  says: string;
  /** The paragraphs whose main role this is, by their index in the list given, in the new order. */
  paragraphs: number[];
  /** Paragraphs that do this job in passing: the role is one of their spans and not their main role. */
  within: number[];
  /** A required slot that no paragraph fills, wholly or in passing. */
  missing: boolean;
}

export interface Move {
  /** The paragraph's index in the list given. */
  paragraph: number;
  /** Where it stood and where it stands now, both counted from 0. `from` equals `paragraph`. */
  from: number;
  to: number;
  /** The slot it was moved to fill, or the slot of the neighbour it moved with. */
  role: Role;
  /** "An essay opens with its claim." */
  why: string;
}

export interface Alignment {
  /** The paragraphs in the form's order: order[k] is the index, in the list given, of the paragraph now at k. */
  order: number[];
  /** The form's slots in order, each with the paragraphs that fill it. */
  slots: AlignedSlot[];
  /** The paragraphs that changed place, in their new order. A paragraph that only shifted to make room is not one. */
  moved: Move[];
  /** The required roles the text has no paragraph for. */
  missing: Role[];
}

/** What alignToForm needs of a paragraph. ParagraphRoles from structure.ts fits. */
export interface Labelled {
  role: Role;
  /** Taken as certain when absent. */
  confidence?: number;
  spans?: { role: Role }[];
}

/** The paragraphs that keep their relative order: the longest rising run of `order`. Of two runs as long, the one
 * later in the new order is kept, so a block the form pulls forward is the block reported as moved. */
function kept(order: number[]): Set<number> {
  const n = order.length;
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  let best = -1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (order[j]! < order[i]! && len[j]! + 1 >= len[i]!) {
        len[i] = len[j]! + 1;
        prev[i] = j;
      }
    }
    if (best < 0 || len[i]! >= len[best]!) best = i;
  }
  const out = new Set<number>();
  for (let i = best; i >= 0; i = prev[i]!) out.add(order[i]!);
  return out;
}

/**
 * Fits labelled paragraphs to a form. Each slot has a place in the form's order; a slot marked `beside` another
 * shares that slot's place. A paragraph the engine is sure of takes its slot's place. Any other paragraph (a role
 * the form has no slot for, a weak label, a "part") takes the place of the paragraph before it, or of the one after
 * it when it opens the text, so it stays next to its neighbour. The paragraphs are then sorted by place, and
 * paragraphs of one place keep the writer's order. Nothing is dropped, and the same input gives the same output.
 */
export function alignToForm(paragraphs: readonly Labelled[], form: Form): Alignment {
  const place = new Map<Role, number>();
  let next = 0;
  for (const s of form.slots) place.set(s.role, s.beside !== undefined && place.has(s.beside) ? place.get(s.beside)! : next++);

  const n = paragraphs.length;
  const at: (number | null)[] = paragraphs.map((p) => (place.has(p.role) && (p.confidence ?? 1) >= MOVE_CONFIDENCE ? place.get(p.role)! : null));
  // The slot each paragraph answers to: its own, or its neighbour's.
  const led: (Role | null)[] = paragraphs.map((p, i) => (at[i] === null ? null : p.role));
  for (let i = 1; i < n; i++) if (at[i] === null && at[i - 1] !== null) [at[i], led[i]] = [at[i - 1]!, led[i - 1]!];
  for (let i = n - 2; i >= 0; i--) if (at[i] === null && at[i + 1] !== null) [at[i], led[i]] = [at[i + 1]!, led[i + 1]!];

  const order = paragraphs.map((_, i) => i).sort((a, b) => (at[a] ?? 0) - (at[b] ?? 0) || a - b);
  const where = new Map(order.map((p, k) => [p, k]));

  const slots: AlignedSlot[] = form.slots.map((s) => {
    const mine = order.filter((p) => paragraphs[p]!.role === s.role);
    const within = order.filter((p) => paragraphs[p]!.role !== s.role && (paragraphs[p]!.spans ?? []).some((sp) => sp.role === s.role));
    return { role: s.role, required: s.required, says: s.says, paragraphs: mine, within, missing: s.required && !mine.length && !within.length };
  });

  const stay = kept(order);
  const moved: Move[] = order
    .filter((p) => !stay.has(p))
    .map((p) => {
      const role = led[p] ?? paragraphs[p]!.role;
      return { paragraph: p, from: p, to: where.get(p)!, role, why: slotSentence(form, role) };
    });

  return { order, slots, moved, missing: slots.filter((s) => s.missing).map((s) => s.role) };
}

const paragraphsOf = (input: string | DocBlock[]): string[] =>
  (typeof input === 'string' ? blocksOfText(input) : input)
    .filter((b) => b.kind === 'paragraph' || b.kind === 'quote' || b.kind === 'item')
    .map((b) => b.text.trim())
    .filter(Boolean);

/**
 * A claim the writer buried. structure.ts names a claim only in the first paragraph, so a text that opens with a
 * story and states its point in the third paragraph has no claim by that reading. Where the form wants a claim and
 * the text shows none, each later paragraph the engine could not name (a "part", or a reason known only by a
 * "because") is read again as if it opened the piece. The first that reads as a claim is the claim.
 */
function buriedClaim(paragraphs: string[], roles: ParagraphRoles[], kind: Kind): number {
  if (roles.some((r) => r.role === 'claim' || r.spans.some((s) => s.role === 'claim'))) return -1;
  for (let i = 1; i < roles.length; i++) {
    const r = roles[i]!;
    if (!(r.role === 'part' || r.confidence < GUESS_BELOW)) continue;
    // A second paragraph keeps the reading from taking the paragraph for the end of the piece.
    const alone = labelRoles([paragraphs[i]!, 'And so on.'], kind)[0];
    if (alone?.spans[0]?.role === 'claim') return i;
  }
  return -1;
}

export interface FormReading {
  form: Form;
  /** True when the form was chosen from the kind of writing the text is. */
  auto: boolean;
  /** The kind of writing the engine takes the text for, whatever form was asked. */
  kind: Kind;
  /** The paragraphs as read; every index in `roles` and `alignment` refers to these. */
  paragraphs: string[];
  /** Each paragraph's role, read for the form's kind, with a buried claim named. */
  roles: ParagraphRoles[];
  sequence: Role[];
  alignment: Alignment;
}

/**
 * Reads a text for a form and fits it. `form` is a form id, or 'auto' (or nothing) for the form of the kind the
 * text is. Returns null for an id that names no form.
 */
export function readForm(input: string | DocBlock[], form: string = 'auto'): FormReading | null {
  const kind = detectKind(input);
  const auto = !form || form === 'auto';
  const f = auto ? formForKind(kind) : formOf(form);
  if (!f) return null;
  const paragraphs = paragraphsOf(input);
  const roles = labelRoles(paragraphs, f.kind);
  if (f.slots.some((s) => s.role === 'claim')) {
    const i = buriedClaim(paragraphs, roles, f.kind);
    if (i >= 0) {
      const first = roles[i]!.spans[0]!;
      first.role = 'claim';
      first.confidence = MOVE_CONFIDENCE;
      roles[i] = { ...roles[i]!, role: 'claim', confidence: MOVE_CONFIDENCE };
    }
  }
  return { form: f, auto, kind, paragraphs, roles, sequence: roleSequence(roles), alignment: alignToForm(roles, f) };
}
