// The WHY column, written by the engine. For each paragraph of a rewrite, the engine looks at every new sentence
// beside the writer's sentences it renders, finds the moves and figures of speech the new sentence makes that the
// writer's did not, and takes for each a sentence of the voice's own that makes the same move. No note quotes the
// model that wrote the rewrite: every example is a sentence from the corpus, checked by the same test that found the
// move. A paragraph gets at most two notes, and no move is noted twice on a page.

import { FIGURES, findFigures } from './figures.ts';
import { termOf } from './glossary.ts';
import type { AuthorModel, Citation, Register } from './model.ts';

/** A sentence of the voice's, with the words that make the move marked. */
export interface NoteQuote {
  id: number;
  text: string;
  cite: string;
  mark?: [number, number];
}

/** One note in the WHY column. Its fields match the page's Note, with the move's id and glossary term added. */
export interface EngineNote {
  /** A mending of the writer's sense; a move of the voice's; words the voice added; where the paragraph came from. */
  kind: 'sense' | 'move' | 'liberty' | 'structure';
  /** The label: the move's plain name (“Not this, but that”), “Mended”, “Added by Lincoln”, “Structure”. */
  technique: string;
  before: string;
  after: string;
  /** What to tell the writer, in a line. */
  text: string;
  /** For a move: a sentence of the voice's that makes it. */
  quote: NoteQuote | null;
  verified: boolean;
  /** For a move: its id, the same for every name it goes by (“understatement” is “litotes”). */
  id?: string;
  /** For a move: the glossary id that defines it, when the glossary has one. */
  term?: string;
}

/** A paragraph of the rewrite: the writer's sentences beside it, and its own sentences with those they render. */
export interface NoteRow {
  yours: { n: number; text: string }[];
  hers: { text: string; from: number[]; moves?: string[] }[] | null;
  /** The writer's paragraphs (numbered through the text) this one renders, where they are not just its own. */
  from?: number[];
  /** Where the paragraph's matter came from, already said (“Brings together your paragraphs 2 and 3.”). */
  structure?: string;
}

export interface NoteOptions {
  /** Where the writer's sense was mended. */
  sense?: { before: string; after: string; problem: string; resolution: string }[];
  /** Words the voice brought in that the writer did not write, and why. */
  liberties?: { after: string; why: string }[];
  register?: Register;
  /** A pack's table of sentence ids for each move and figure, checked before use. */
  exemplars?: Record<string, number[]>;
  /** Moves already noted on this page (by earlier parts); updated as notes are written. */
  seen?: Set<string>;
  /** The most notes a paragraph may hold. */
  perParagraph?: number;
}

/** Figures too weak a sign to teach on their own. Irony is no form; a question alone is not free indirect discourse. */
const SKIP = new Set(['irony', 'fid', 'periphrasis']);

const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
const curly = (t: string) => t.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’');
/** Narration alone: a narrator's move is not made inside quotation marks. */
const narration = (t: string) => curly(t).replace(/“[^”]*”?/g, (q) => ' '.repeat(q.length));
const wordSet = (t: string) => new Set(t.toLowerCase().match(/[\p{L}'’]{3,}/gu) ?? []);

/** The glossary term for a move's id or name. A role (“turn”, “objection”) names a paragraph's work, not a move,
 * and a form (“essay”) names a whole piece. */
const moveTerm = (name: string) => {
  const t = termOf(name);
  return t && t.kind !== 'role' && t.kind !== 'form' ? t : undefined;
};

/** The one id a move goes by, whatever the voice or the glossary calls it. */
export function moveKey(id: string, name?: string): string {
  return moveTerm(id)?.id ?? (name ? moveTerm(name)?.id : undefined) ?? id;
}

interface Candidate {
  id: string;
  key: string;
  label: string;
  text: string;
  term?: string;
  after: string;
  before: string;
  /** A voice's own move ranks before a figure any writer may make. */
  own: boolean;
}

/** The moves and figures a sentence makes that the sentences it renders do not. */
function movesIn(m: AuthorModel, after: string, before: string, register?: Register, named: string[] = []): Candidate[] {
  if (!after.trim() || norm(after) === norm(before)) return [];
  const look = (id: string) => (id === 'saidshe' ? curly : narration);
  const out: Candidate[] = [];
  const moves = m.author.moves ?? [];
  const fresh = (mv: { id: string; pattern?: string }) => m.shows(mv, look(mv.id)(after)) && !m.shows(mv, look(mv.id)(before));
  for (const mv of moves) {
    if (mv.id === 'irony' || !fresh(mv)) continue;
    out.push({ id: mv.id, key: moveKey(mv.id, mv.name), label: mv.name, text: mv.does, term: moveTerm(mv.id)?.id ?? moveTerm(mv.name)?.id, after, before, own: true });
  }
  // Moves another reading credits to the sentence (explainSentence's), where the patterns confirm them.
  for (const id of named) {
    const mv = moves.find((x) => x.id === id);
    if (!mv || mv.id === 'irony' || out.some((c) => c.id === id) || !fresh(mv)) continue;
    out.push({ id: mv.id, key: moveKey(mv.id, mv.name), label: mv.name, text: mv.does, term: moveTerm(mv.id)?.id ?? moveTerm(mv.name)?.id, after, before, own: true });
  }
  const letter = register === 'letter';
  const had = new Set(findFigures(m, before, { letter }).map((f) => f.term));
  for (const f of findFigures(m, after, { letter })) {
    if (SKIP.has(f.term) || had.has(f.term)) continue;
    const key = moveKey(f.term);
    if (out.some((c) => c.key === key)) continue;
    const t = termOf(f.term);
    out.push({ id: f.term, key, label: f.name, text: t?.definition ?? f.gloss, term: t?.id, after, before, own: false });
  }
  return out;
}

/** Where in a sentence its move is made, for the page to mark. */
function markOf(m: AuthorModel, id: string, text: string): [number, number] | undefined {
  const mv = m.author.moves?.find((x) => x.id === id);
  if (mv?.pattern) {
    const hit = new RegExp(mv.pattern, 'i').exec(curly(text));
    if (hit) return [hit.index, hit.index + hit[0].length];
  }
  if (id in FIGURES) {
    const f = findFigures(m, text).find((x) => x.term === id);
    if (f) return [f.start, f.end];
  }
  return undefined;
}

/** A sentence of the voice's that makes the move: from the pack's table first, else the nearest in the corpus. */
function exampleOf(m: AuthorModel, c: Candidate, exemplars?: Record<string, number[]>, used: Set<number> = new Set()): NoteQuote | null {
  const exclude = new Set(m.author.linkExclude ?? []);
  const mv = m.author.moves?.find((x) => x.id === c.id) ?? { id: c.id };
  const ok = (x: Citation | null | undefined): x is Citation =>
    !!x && !!x.text && !used.has(x.id) && !exclude.has(x.work) && norm(x.text) !== norm(c.after) && m.shows(mv, mv.id === 'saidshe' ? x.text : narration(x.text));
  const fromPack = (exemplars?.[c.id] ?? []).map((id) => m.cite(id)).filter(ok);
  const hit = fromPack[0] ?? m.moveExamples(c.id, c.after, 6).find(ok);
  if (!hit) return null;
  used.add(hit.id);
  const q: NoteQuote = { id: hit.id, text: hit.text, cite: hit.cite };
  const mark = markOf(m, c.id, hit.text);
  if (mark) q.mark = mark;
  return q;
}

/** “2”, “2 and 3”, “1, 2 and 3”. */
const listOf = (ns: number[]) => (ns.length < 2 ? String(ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`);

/**
 * The WHY notes for each paragraph of a rewrite, in order of what the writer most needs to hear: where their sense
 * was mended, then a move the voice made, then words the voice added, then where the paragraph's matter came from.
 * At most two notes a paragraph; no move twice on the page; a move only with a sentence of the voice's that makes it.
 */
export function notesFor(m: AuthorModel, rows: NoteRow[], opts: NoteOptions = {}): EngineNote[][] {
  const limit = opts.perParagraph ?? 2;
  const seen = opts.seen ?? new Set<string>();
  // No sentence of the voice's is shown twice on the page.
  const quoted = new Set<number>();
  const short = m.author.short;
  const out: EngineNote[][] = rows.map(() => []);
  const textOf = (r: NoteRow) => (r.hers ?? []).map((x) => x.text).join(' ');
  const yoursOf = (r: NoteRow) => r.yours.map((x) => x.text).join(' ');

  // Each sense note and liberty goes with the paragraph its words are most in: the rewrite's first, then the writer's.
  const place = (after: string, before: string): number => {
    const aw = wordSet(after);
    const bw = wordSet(before);
    const count = (a: Set<string>, t: string) => {
      const b = wordSet(t);
      let n = 0;
      for (const w of a) if (b.has(w)) n++;
      return n;
    };
    let best = -1;
    let at = 0;
    rows.forEach((r, k) => {
      const score = 2 * count(aw, textOf(r)) + count(bw, yoursOf(r));
      if (score > best) [best, at] = [score, k];
    });
    return at;
  };
  const sense: EngineNote[][] = rows.map(() => []);
  for (const x of opts.sense ?? []) {
    const text = `${x.problem.trim()} ${x.resolution.trim()}`.trim();
    if (text) sense[place(x.after, x.before)]?.push({ kind: 'sense', technique: 'Mended', before: x.before, after: x.after, text, quote: null, verified: true });
  }
  const liberties: EngineNote[][] = rows.map(() => []);
  for (const x of opts.liberties ?? []) {
    if (x.why.trim()) liberties[place(x.after, '')]?.push({ kind: 'liberty', technique: `Added by ${short}`, before: '', after: x.after, text: x.why.trim(), quote: null, verified: true });
  }

  rows.forEach((r, k) => {
    const notes = out[k]!;
    const room = () => notes.length < limit;
    for (const n of sense[k]!) if (room()) notes.push(n);

    // Moves: the voice's own first, in the order its sentences come.
    if (room() && r.hers) {
      const byN = new Map(r.yours.map((y) => [y.n, y.text]));
      const all = r.hers.flatMap((s) => movesIn(m, s.text, s.from.map((n) => byN.get(n) ?? '').join(' '), opts.register, s.moves));
      const ranked = [...all.filter((c) => c.own), ...all.filter((c) => !c.own)];
      for (const c of ranked) {
        if (!room()) break;
        if (seen.has(c.key)) continue;
        const quote = exampleOf(m, c, opts.exemplars, quoted);
        if (!quote) continue;
        seen.add(c.key);
        notes.push({ kind: 'move', technique: c.label, before: c.before, after: c.after, text: c.text, quote, verified: true, id: c.key, ...(c.term ? { term: c.term } : {}) });
      }
    }

    for (const n of liberties[k]!) if (room()) notes.push(n);

    if (room()) {
      const text = r.structure ?? (r.from && r.from.length > 1 ? `Joins your paragraphs ${listOf(r.from)}.` : '');
      if (text) notes.push({ kind: 'structure', technique: 'Structure', before: '', after: '', text, quote: null, verified: true });
    }
  });
  return out;
}
