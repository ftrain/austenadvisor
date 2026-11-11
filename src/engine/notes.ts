// The WHY column, written by the engine. For each paragraph of a rewrite, the engine looks at every new sentence
// beside the writer's sentences it renders, finds the moves and figures of speech the new sentence makes that the
// writer's did not, and takes for each a sentence of the voice's own that makes the same move. No note quotes the
// model that wrote the rewrite: every example is a sentence from the corpus, checked by the same test that found the
// move.
//
// A paragraph gets at most three notes. Where the rewrite makes a figure of speech, one note is the figure's: a
// voice's habits of diction (“thou”, “unto”) cannot crowd it out. A figure may be noted twice on a page, the second
// time in fewer words and some way on; any other move once. A figure the writer made and the rewrite kept is noted
// too, as the writer's own. A paragraph the form moved, or one written to fill a part the form lacked, always
// carries its Structure note.

import { FIGURES, figureExamples, findFigures, periphrasisFor } from './figures.ts';
import { termOf } from './glossary.ts';
import type { AuthorModel, Citation, Register } from './model.ts';
import { isPlainRule, keepsRule, plainFaults, type PlainRule } from './plain.ts';

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
  /** For a figure of speech: the words of `after` that make it, as offsets, where they are a phrase. */
  span?: [number, number];
  /** A figure the writer made in their own sentence, which the rewrite kept. */
  yours?: boolean;
  /** A figure's second note on the page, in fewer words. */
  again?: boolean;
}

/** A paragraph of the rewrite: the writer's sentences beside it, and its own sentences with those they render. */
export interface NoteRow {
  yours: { n: number; text: string }[];
  /** `claims` are figures the writer of the rewrite named in the sentence, with the words that make each. */
  hers: { text: string; from: number[]; moves?: string[]; claims?: { term: string; quote: string }[] }[] | null;
  /** The writer's paragraphs (numbered through the text) this one renders, where they are not just its own. */
  from?: number[];
  /** Where the paragraph's matter came from, already said (“Brings together your paragraphs 2 and 3.”). */
  structure?: string;
  /** The structure note is one the writer must see (a paragraph the form moved, a part the form lacked): it comes
   * before the moves, so the other notes cannot crowd it out. */
  structureFirst?: boolean;
}

/** What became of a move or figure the engine found: `shown`, `again` and `kept` are notes; the rest say why not. */
export type NoteFate = 'shown' | 'again' | 'kept' | 'off' | 'yours' | 'seen' | 'room' | 'noquote';

export interface NoteOptions {
  /** Where the writer's sense was mended. */
  sense?: { before: string; after: string; problem: string; resolution: string }[];
  /** Words the voice brought in that the writer did not write, and why. */
  liberties?: { after: string; why: string }[];
  register?: Register;
  /** A pack's table of sentence ids for each move and figure, checked before use. */
  exemplars?: Record<string, number[]>;
  /** Moves already noted on this page (by earlier parts); updated as notes are written. A figure noted twice is
   * there twice, the second time as `<id>#2`. */
  seen?: Set<string>;
  /** The most notes a paragraph may hold. */
  perParagraph?: number;
  /** Told what became of every move and figure found, for measuring. */
  trace?: (e: { paragraph: number; after: string; id: string; figure: boolean; fate: NoteFate }) => void;
}

/** The most notes a paragraph holds, unless the caller says otherwise. */
export const NOTES_PER_PARAGRAPH = 3;

/**
 * Figures the engine will not teach from. Irony has no form: the engine can find a generalization or an aside, and
 * names those. Free indirect discourse is found only as a question or exclamation in the narration, and in the
 * rewrites of students' own pieces every such sentence was the writer's plain question (“Can you send more
 * snacks?”), never a character's thought. Climax is found as a series whose members grow longer, and in the voices'
 * own books only half of those rose in weight as well as in length.
 */
const OFF = new Set(['irony', 'fid', 'climax']);
/**
 * Figures not worth praise in the writer's own sentence: a string of “and”s there is as often a run-on, and a sound
 * or a word that comes back (“went canoeing and flipped the canoe”) is as often chance.
 */
const NO_PRAISE = new Set(['polysyndeton', 'periphrasis', 'alliteration', 'polyptoton', 'anadiplosis', 'epistrophe']);
/** Figures that are a build of the whole sentence, with no phrase to point at. */
const WHOLE = new Set(['polysyndeton', 'anaphora', 'inversion', 'periodic', 'climax', 'rhetoricalquestion', 'hypophora']);

/** What each figure does for a reader, in a line, for its first note on a page. */
const USE: Record<string, string> = {
  litotes: 'The modest wording leaves the reader to supply the stronger word.',
  periphrasis: 'The reader pictures the thing before hearing its name.',
  antithesis: 'The matching shapes make the difference plain.',
  tricolon: 'Three items feel complete, and the last one lands hardest.',
  polysyndeton: 'Each “and” gives the next item its own weight.',
  anaphora: 'The repeated opening ties the clauses together and builds force.',
  hyperbole: 'The reader knows it is too much and hears the feeling in it.',
  inversion: 'The words moved to the front take the stress.',
  parenthesis: 'The writer comments without stopping the sentence.',
  gnomic: 'The one case is made to look like the common rule.',
  aside: 'The afterthought undercuts what came before it.',
  asyndeton: 'With no “and”, the items come quickly, one on top of another.',
  epistrophe: 'The repeated ending drives the word home.',
  anadiplosis: 'The repeated word carries the thought from one clause into the next.',
  chiasmus: 'The second half turns the first around, and the reader weighs the two.',
  isocolon: 'The matching clauses ask to be weighed against each other.',
  polyptoton: 'The reader hears the same root twice and ties the two words together.',
  rhetoricalquestion: 'The reader supplies the answer and so agrees with it.',
  hypophora: 'The question is the one the reader would ask, and the answer settles it.',
  alliteration: 'The repeated sound binds the words and makes them easy to remember.',
  climax: 'Each term outweighs the last, and the reader feels the rise.',
  periodic: 'The reader waits for the main clause, and it carries the weight of all that came before.',
  apostrophe: 'The address gives the thing a presence, and shows the feeling of the speaker.',
  simile: 'The comparison gives the reader a picture of the thing.',
  epanorthosis: 'The reader watches the first word give way to a truer one, and trusts it more.',
  metaphor: 'The reader sees the one thing in the light of the other.',
  personification: 'The thing seems to act of its own will.',
  metonymy: 'The reader takes the thing by the part of it that matters here.',
  synecdoche: 'The part named is the part that does the work.',
  zeugma: 'The one word turns from a plain sense to another, and the turn is the wit.',
  oxymoron: 'The clash makes the reader stop and weigh both words.',
  irony: 'The reader is trusted to hear what is meant.',
  fid: 'The reader hears the character think without leaving the story.',
};
/** A figure's name in the middle of a sentence: “You wrote a tricolon here”. */
const NAMED: Record<string, string> = {
  chiasmus: 'a chiasmus',
  isocolon: 'an isocolon',
  rhetoricalquestion: 'a rhetorical question',
  climax: 'a climax',
  periodic: 'a periodic sentence',
  apostrophe: 'an apostrophe',
  simile: 'a simile',
  tricolon: 'a tricolon',
  gnomic: 'a generalization',
  aside: 'an aside',
  parenthesis: 'a parenthesis',
  inversion: 'an inversion',
};

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
  /** For a move of the voice's: what it does. For a figure the note is written from its definition. */
  text: string;
  term?: string;
  after: string;
  before: string;
  /** A figure of speech, found by its own detector in the new sentence. */
  figure: boolean;
  /** The writer's own figure, kept. */
  kept: boolean;
  /** The words that make the figure, as offsets in the new sentence (with its quotation marks curled). */
  span?: [number, number];
  /** For periphrasis: the writer's word the description stands for. */
  stands?: string;
  /** For a kept figure: the writer's words that made it. */
  theirs?: string;
  /** Named by the writer of the rewrite, not found by form: it needs no sentence of the voice's beside it. */
  claimed?: boolean;
}

/** The sentence's rivals: the other new sentences that render one of the same sentences of the writer's. */
interface Siblings {
  texts: string[];
  self: number;
}

/**
 * Whether a new sentence mends a fault of the writer's against a rule of the plain style. The writer's sentence
 * must break the rule, and where it became several sentences, the fault belongs to the one that holds its words:
 * “kids sort of throw most of it away, which is not good for the budget” loses its hedge in “kids throw most of
 * it away”, and “This hurts the budget” mends nothing. A sentence the writer never wrote mends nothing either.
 */
function mendsRule(m: AuthorModel, rule: PlainRule, after: string, before: string, sib: Siblings): boolean {
  if (!/\p{L}/u.test(before) || !keepsRule(m.plain, rule, curly(after))) return false;
  const text = curly(before);
  const faults = plainFaults(m.plain, text, [rule]);
  if (!faults.length) return false;
  if (sib.texts.length < 2) return true;
  return faults.some((f) => {
    // The fault's neighbourhood: its own words and a few either side.
    const near = wordSet(text.slice(Math.max(0, f.start - 40), Math.min(text.length, f.end + 40)));
    const share = (t: string) => [...wordSet(t)].filter((w) => near.has(w)).length;
    const scores = sib.texts.map(share);
    return scores[sib.self]! > 0 && scores[sib.self]! >= Math.max(...scores);
  });
}

/** The moves and figures a sentence makes: those the sentences it renders do not, and the figures they share. */
function movesIn(m: AuthorModel, after: string, before: string, sib: Siblings, register: Register | undefined, named: string[], off: (id: string, fate: NoteFate) => void, claims: { term: string; quote: string }[] = []): Candidate[] {
  if (!after.trim()) return [];
  const same = norm(after) === norm(before);
  const look = (id: string) => (id === 'saidshe' ? curly : narration);
  const out: Candidate[] = [];
  const moves = m.author.moves ?? [];
  const letter = register === 'letter';
  const mine = findFigures(m, before, { letter });
  const hers = findFigures(m, after, { letter });
  const text = curly(after);
  const fresh = (mv: { id: string; pattern?: string; rule?: string }) =>
    isPlainRule(mv.rule) ? mendsRule(m, mv.rule, after, before, sib) : m.shows(mv, look(mv.id)(after)) && !m.shows(mv, look(mv.id)(before));
  // The voice's own moves, and those another reading credits to the sentence (explainSentence's), where the
  // patterns confirm them.
  const own = same ? [] : [...moves, ...named.map((id) => moves.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x)];
  for (const mv of own) {
    if (mv.id === 'irony' || out.some((c) => c.id === mv.id) || !fresh(mv)) continue;
    const key = moveKey(mv.id, mv.name);
    // A move that goes by a figure's name is the figure only where the figure's detector finds it; where the
    // voice's looser pattern alone matches, the note keeps the voice's words and claims no term.
    const f = key in FIGURES ? hers.find((x) => x.term === key) : undefined;
    if (key in FIGURES && (!f || mine.some((x) => x.term === key))) {
      if (!f) out.push({ id: mv.id, key: `${mv.id}*`, label: mv.name, text: mv.does, after, before, figure: false, kept: false });
      continue;
    }
    out.push({ id: mv.id, key, label: mv.name, text: mv.does, term: moveTerm(mv.id)?.id ?? moveTerm(mv.name)?.id, after, before, figure: !!f, kept: false, ...(f ? { span: [f.start, f.end] as [number, number] } : {}) });
  }
  const push = (f: { term: string; start: number; end: number }, extra: Partial<Candidate>) => {
    const key = moveKey(f.term);
    if (out.some((c) => c.key === key)) return;
    out.push({ id: f.term, key, label: FIGURES[f.term]!.name, text: '', term: termOf(f.term)?.id, after, before, figure: true, kept: false, span: [f.start, f.end], ...extra });
  };
  // Periphrasis is read against the writer's sentence: a description where the writer had the name.
  const around = same ? null : periphrasisFor(m, before, after);
  if (around) push(around, { stands: around.stands });
  for (const f of hers) {
    if (OFF.has(f.term)) {
      off(f.term, 'off');
      continue;
    }
    // A settled periphrasis (“the fair sex”) stands by its form; the looser kind only by the writer's own word.
    if (f.term === 'periphrasis' && (f.loose || around)) continue;
    const theirs = mine.find((x) => x.term === f.term);
    if (!theirs && same) continue;
    if (theirs && NO_PRAISE.has(f.term)) {
      off(f.term, 'yours');
      continue;
    }
    push(f, theirs ? { kept: true, theirs: theirs.text } : {});
  }
  // Figures with no form to find them by (a metaphor, an irony), named by the writer of the rewrite. Each must
  // point at words of the new sentence; where the writer's own sentence has the same words, the figure is theirs.
  for (const c of claims) {
    const at = FIGURES[c.term] ? text.indexOf(curly(c.quote)) : -1;
    if (at < 0) continue;
    // The writer's own figure: the same words, or most of their longer words (“time had by then stolen his hair”
    // keeps “Time had stolen his hair”).
    const long = [...wordSet(c.quote)].filter((w) => w.length > 3);
    const kept = norm(before).includes(norm(c.quote)) || (long.length > 1 && long.filter((w) => wordSet(before).has(w)).length >= Math.max(2, long.length * 0.75));
    if (same && !kept) continue;
    push({ term: c.term, start: at, end: at + curly(c.quote).length }, { claimed: true, ...(kept ? { kept: true, ...(norm(before).includes(norm(c.quote)) ? { theirs: c.quote } : {}) } : {}) });
  }
  return out;
}

/** Where in a sentence its move is made, for the page to mark. */
function markOf(m: AuthorModel, id: string, text: string): [number, number] | undefined {
  if (id in FIGURES) {
    const f = findFigures(m, text).find((x) => x.term === id && !x.loose);
    if (f) return [f.start, f.end];
  }
  const mv = m.author.moves?.find((x) => x.id === id);
  if (mv?.pattern) {
    const hit = new RegExp(mv.pattern, 'i').exec(curly(text));
    if (hit) return [hit.index, hit.index + hit[0].length];
  }
  return undefined;
}

/** A sentence of the voice's that makes the move: from the pack's table first, else the nearest in the corpus. */
function exampleOf(m: AuthorModel, c: Candidate, exemplars?: Record<string, number[]>, used: Set<number> = new Set()): NoteQuote | null {
  const exclude = new Set(m.author.linkExclude ?? []);
  const mv = m.author.moves?.find((x) => x.id === c.id) ?? { id: c.id };
  // A figure's example shows the figure by its detector, whatever looser pattern the voice's move of that name has.
  const shows = (t: string) => (c.figure ? findFigures(m, t).some((f) => f.term === c.key && !f.loose) : m.shows(mv, mv.id === 'saidshe' ? t : narration(t)));
  const ok = (x: Citation | null | undefined): x is Citation => !!x && !!x.text && !used.has(x.id) && !exclude.has(x.work) && norm(x.text) !== norm(c.after) && shows(x.text);
  const fromPack = [...(exemplars?.[c.id] ?? []), ...(c.figure && c.key !== c.id ? (exemplars?.[c.key] ?? []) : [])].map((id) => m.cite(id)).filter(ok);
  const hit = fromPack[0] ?? m.moveExamples(c.id, c.after, 6).find(ok) ?? (c.figure ? figureExamples(m, c.key, c.after, 6).find(ok) : undefined);
  if (!hit) return null;
  used.add(hit.id);
  const q: NoteQuote = { id: hit.id, text: hit.text, cite: hit.cite };
  const mark = markOf(m, c.figure ? c.key : c.id, hit.text);
  if (mark) q.mark = mark;
  return q;
}

/** What a figure's note says: its definition always; the words that make it; and, the first time, what it does. */
function figureText(c: Candidate, again: boolean): string {
  const definition = termOf(c.key)?.definition ?? FIGURES[c.key]?.gloss ?? '';
  const words = c.span && !WHOLE.has(c.key) && c.span[1] - c.span[0] <= 90 ? curly(c.after).slice(c.span[0], c.span[1]).trim().replace(/^[,;—\s]+|[,;—\s]+$/g, '') : '';
  if (c.kept) {
    const name = NAMED[c.key] ?? (termOf(c.key)?.term ?? FIGURES[c.key]!.name).replace(/\s*\(.*\)$/, '').toLowerCase();
    const theirs = c.theirs && !WHOLE.has(c.key) && c.theirs.length <= 90 ? `: “${c.theirs.trim().replace(/^[,;—\s]+|[,;—\s]+$/g, '')}”` : '';
    return `You wrote ${name} here, and the rewrite keeps it${theirs}. ${definition}`;
  }
  if (again) return `${words ? `Again: “${words}”.` : 'Again.'} ${definition}`;
  const here = c.stands && words ? `Here “${words}” stands for your “${c.stands}”.` : words ? `Here: “${words}”.` : '';
  return [definition, here, USE[c.key] ?? ''].filter(Boolean).join(' ');
}

/** “2”, “2 and 3”, “1, 2 and 3”. */
const listOf = (ns: number[]) => (ns.length < 2 ? String(ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`);

/**
 * The WHY notes for each paragraph of a rewrite, in order of what the writer most needs to hear: where their sense
 * was mended, then a figure of speech, then the voice's moves and further figures by turns, then words the voice
 * added, then where the paragraph's matter came from. At most three notes a paragraph; a figure at most twice on the
 * page and any other move once; a move only with a sentence of the voice's that makes it.
 */
export function notesFor(m: AuthorModel, rows: NoteRow[], opts: NoteOptions = {}): EngineNote[][] {
  const limit = opts.perParagraph ?? NOTES_PER_PARAGRAPH;
  const seen = opts.seen ?? new Set<string>();
  const times = (key: string) => (seen.has(`${key}#2`) ? 2 : seen.has(key) ? 1 : 0);
  // The paragraph of a figure's first note: its second waits two paragraphs.
  const firstAt = new Map<string, number>();
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
    const structure = r.structure ?? (r.from && r.from.length > 1 ? `Joins your paragraphs ${listOf(r.from)}.` : '');
    const structureNote: EngineNote | null = structure ? { kind: 'structure', technique: 'Structure', before: '', after: '', text: structure, quote: null, verified: true } : null;
    if (structureNote && r.structureFirst) notes.length < limit ? notes.push(structureNote) : (notes[limit - 1] = structureNote);

    if (r.hers) {
      const byN = new Map(r.yours.map((y) => [y.n, y.text]));
      const hers = r.hers;
      const all = hers.flatMap((s, j) => {
        // The other new sentences that render one of the same sentences of the writer's.
        const group = hers.map((x, i) => ({ x, i })).filter(({ x }) => x.from.some((n) => s.from.includes(n)));
        const sib: Siblings = { texts: group.map(({ x }) => x.text), self: Math.max(0, group.findIndex(({ i }) => i === j)) };
        return movesIn(m, s.text, s.from.map((n) => byN.get(n) ?? '').join(' '), sib, opts.register, s.moves ?? [], (id, fate) => opts.trace?.({ paragraph: k, after: s.text, id, figure: true, fate }), s.claims);
      });
      const tell = (c: Candidate, fate: NoteFate) => opts.trace?.({ paragraph: k, after: c.after, id: c.key, figure: c.figure, fate });
      // A figure the rewrite made comes before one it kept, and a first note before a second.
      // One the engine proved by its form comes before one the writer of the rewrite only named.
      const rank = (c: Candidate) => (times(c.key) ? 4 : 0) + (c.kept ? 2 : 0) + (c.claimed ? 1 : 0);
      const figures = all.filter((c) => c.figure).sort((a, b) => rank(a) - rank(b));
      const others = all.filter((c) => !c.figure);
      // A figure first, then the voice's moves and further figures by turns.
      const order: Candidate[] = [];
      for (let i = 0; i < Math.max(figures.length, others.length); i++) {
        if (figures[i]) order.push(figures[i]!);
        if (others[i]) order.push(others[i]!);
      }
      const here = new Set<string>();
      for (const c of order) {
        const n = times(c.key);
        const first = firstAt.get(c.key);
        const spent = here.has(c.key) || n >= (c.figure ? 2 : 1) || (n === 1 && first !== undefined && k - first < 2);
        if (spent) {
          tell(c, 'seen');
          continue;
        }
        if (!room()) {
          tell(c, 'room');
          continue;
        }
        const quote = c.claimed ? null : exampleOf(m, c, opts.exemplars, quoted);
        if (!quote && !c.claimed) {
          tell(c, 'noquote');
          continue;
        }
        const again = n === 1;
        seen.add(again ? `${c.key}#2` : c.key);
        if (!again) firstAt.set(c.key, k);
        here.add(c.key);
        tell(c, c.kept ? 'kept' : again ? 'again' : 'shown');
        notes.push({
          kind: 'move',
          technique: c.label,
          before: c.before,
          after: c.after,
          text: c.figure ? figureText(c, again) : c.text,
          quote,
          verified: true,
          id: c.key.replace(/\*$/, ''),
          ...(c.term ? { term: c.term } : {}),
          ...(c.figure && c.span ? { span: c.span } : {}),
          ...(c.kept ? { yours: true } : {}),
          ...(again ? { again: true } : {}),
        });
      }
    }

    for (const n of liberties[k]!) if (room()) notes.push(n);

    if (room() && structureNote && !r.structureFirst) notes.push(structureNote);
  });
  return out;
}
