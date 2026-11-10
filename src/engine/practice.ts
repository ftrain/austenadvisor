// Try it: the writer makes a move of the voice's in a sentence of their own, and the engine reads the attempt at
// once, with no language model. It says whether the move is there (by the same pattern or figure detector that
// checks the rewrite's notes), how the attempt is built against a sentence of the voice's that makes the move, its
// length against the voice's usual sentences, what other moves it makes, and the words the voice never used.
//
// It also chooses what to practise. After a rewrite, a drill is offered only for a move the rewrite was shown to
// make. With no rewrite, a drill is offered only for a gap the engine finds in the writer's text: sentences much
// shorter than the voice's, no joined clauses where the voice joins them, or no move or figure at all.

import { hintOf, pronounsOf, type Move } from '../corpus/sources.ts';
import { sentences, tokenize, wordCount } from '../nlp/tokenize.ts';
import { analyze } from './analyze.ts';
import { blocksOfText } from './doc.ts';
import { FIGURES, findFigures } from './figures.ts';
import { termOf } from './glossary.ts';
import type { AuthorModel, Citation } from './model.ts';
import { moveKey } from './notes.ts';
import { skeletonsOf } from './pack.ts';
import { editSimilarity, lineClass, WEIGHTS } from './shape.ts';

/** How the attempt is built against the voice's example: word classes and punctuation in order, 0 to 1. */
export interface PracticeShape {
  score: number;
  tags: number;
  punct: number;
  /** The voice's sentence it was measured against. */
  example: { id: number; text: string; cite: string };
}

export interface PracticeLength {
  sentences: number;
  meanWords: number;
  authorMedian: number;
  authorRange: [number, number];
  /** Where the attempt falls against the voice's middle half of sentences. Null for an empty attempt. */
  band: 'shorter' | 'within' | 'longer' | null;
}

export interface PracticeCheck {
  /** Whether the attempt makes the move. False when no move was asked for. */
  made: boolean;
  /** The move practised: whether the attempt makes it, what it is, and one of the voice's sentences that does. */
  move: { id: string; name: string; made: boolean; does: string; hint: string; example: Citation | null } | null;
  /** How to try the move: a form to fill. Empty when no move was asked for. */
  hint: string;
  /** The voice's other moves and the figures of speech the attempt makes, one name for each. */
  also: string[];
  /** Words in the attempt the voice never used, each with the voice's words in its place. */
  never: { word: string; theirs: string[] }[];
  /** The attempt's sentences against the voice's. */
  length: PracticeLength;
  /** How the attempt is built against the example; null when there is no example or no attempt. */
  shape: PracticeShape | null;
  /** One line to the writer: what worked, and what to try next. */
  verdict: string;
}

/** A move to practise, the writer's sentence to try it on, and why it was offered. */
export interface Drill {
  /** The id to send back to practiceCheck as the move. */
  move: string;
  name: string;
  hint: string;
  /** The writer's sentence to say again with the move. */
  sentence: string;
  /** A move the rewrite made, or a gap the engine found. */
  reason: 'rewrite' | 'short' | 'joins' | 'figures';
}

/** A note from the rewrite's WHY column, as the page holds it. */
export interface DrillNote {
  kind?: string;
  id?: string;
  technique?: string;
  before?: string;
  after?: string;
  verified?: boolean;
}

interface Target {
  id: string;
  key: string;
  name: string;
  does: string;
  hint: string;
  /** For the engine's own drills: the test the attempt must pass. */
  test?: (m: AuthorModel, text: string, lens: number[]) => boolean;
  move?: Move;
}

const curly = (t: string) => t.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’');

/** Joins that make one sentence of two clauses. */
const JOIN = /[;:—]|,\s+(and|but|for|so|yet|or|which|who|while|though|although|because|when)\b/i;

/**
 * “Not …, but …” over a longer reach than the figure detector allows, for an attempt written for the purpose: “It was
 * not the money that mattered to us, but the promise.”
 */
const NOT_BUT = /\bnot\s+(?:because\s+)?[^.;:!?]{2,70}?,?\s+but\s+(?:because\s+|rather\s+)?[\p{L}“‘]/iu;

/** Drills the engine offers for gaps in a text with no rewrite; the voice's moves are offered as themselves. */
const ENGINE_DRILLS: Record<string, Omit<Target, 'key'>> = {
  longer: {
    id: 'longer',
    name: 'A longer sentence',
    does: 'One sentence that carries two short ones.',
    hint: 'Join two short sentences into one with “and”, “but” or “which”: “The bus was late, and we missed the start.”',
    test: (m, _t, lens) => lens.length === 1 && lens[0]! >= Math.round(m.profile.sentenceLength.narration.p25),
  },
  join: {
    id: 'join',
    name: 'A joined sentence',
    does: 'Two clauses joined in one sentence.',
    hint: 'Join two clauses with a semicolon: “The rain stopped; we went out.”',
    test: (_m, t) => JOIN.test(curly(t)),
  },
};

/** Figures that are too weak a sign to count as a move made: a question alone is not free indirect discourse. */
const WEAK = new Set(['fid', 'irony']);

/** The move a name or id stands for: one of the voice's, a figure of speech, or one of the engine's drills. */
function targetOf(m: AuthorModel, name: string): Target | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const moves = m.author.moves ?? [];
  const key = moveKey(n);
  const mv = moves.find((x) => x.id === n || x.name.toLowerCase() === n) ?? moves.find((x) => moveKey(x.id, x.name) === key);
  if (mv) return { id: mv.id, key: moveKey(mv.id, mv.name), name: mv.name, does: mv.does, hint: hintOf(mv), move: mv };
  const fig = Object.entries(FIGURES).find(([id, f]) => id === n || f.name.toLowerCase() === n || moveKey(id) === key);
  if (fig) {
    const t = termOf(fig[0]);
    return { id: fig[0], key: moveKey(fig[0]), name: fig[1].name, does: t?.definition ?? fig[1].gloss, hint: figureHint(fig[0], t?.example) };
  }
  const e = ENGINE_DRILLS[n];
  return e ? { ...e, key: e.id } : null;
}

/** For a figure the voice has no move for: its form to fill, from the glossary's example where there is one. */
function figureHint(id: string, example?: string): string {
  const forms: Record<string, string> = {
    antithesis: 'Try “not …, but …”: “It was not the money that hurt, but the silence.”',
    litotes: 'Say less than you mean with a negative: “not unkind”, “no small thing”.',
    tricolon: 'Give three of the same kind in a row: “tired, hungry, and late”.',
    polysyndeton: 'Join four things with “and” between each: “the rain and the wind and the cold and the dark”.',
    anaphora: 'Start three clauses with the same word: “We tried; we waited; we failed.”',
    parenthesis: 'Set a remark inside the sentence with dashes: “The test—I admit it—was fair.”',
    inversion: 'Put the describing word first: “Small comfort was it to us.”',
    hyperbole: 'Exaggerate on purpose: “the longest ten minutes of my life”.',
    gnomic: 'Add a general truth about people: “as is usual in such cases”.',
    aside: 'End with a dry remark: “…, which was at least honest.”',
    periphrasis: 'Name a thing by what it does: “the machine that keeps us awake” for a phone.',
  };
  return forms[id] ?? (example ? `Try a sentence like this one: ${example}` : 'Try it in one sentence of your own.');
}

/** The name with its article, for “Yes, that's …”: “an antithesis”, “the phrase said again”, “litotes”. */
export function withArticle(name: string): string {
  const bare = name.replace(/\s*\(.*\)$/, '').trim();
  const words = bare.split(/\s+/);
  // “The phrase said again” reads as a noun; “The man who” and “The narrator exclaims” do not, and are quoted.
  const clause = /^(who|which|that|whom)$/i.test(words.at(-1)!) || (words.length === 3 && /[^s]s$/.test(words[2]!));
  if (/^(the|a|an)\s/i.test(bare) && !clause) return bare[0]!.toLowerCase() + bare.slice(1);
  const term = termOf(bare);
  const single = term && term.term.replace(/\s*\(.*\)$/, '').toLowerCase() === bare.toLowerCase();
  const lower = /^[A-Z][a-z]/.test(bare) && !/^(I|God|Mr|Mrs|Miss|Dr)\b/.test(bare) ? bare[0]!.toLowerCase() + bare.slice(1) : bare;
  if (single || MASS.has(lower) || COUNT.has(lower)) {
    if (MASS.has(lower)) return lower;
    return `${/^[aeiou]/i.test(lower) ? 'an' : 'a'} ${lower}`;
  }
  return bare.includes('“') ? `the move ‘${bare}’` : `the move “${bare}”`;
}

/** What to call a move in a verdict: the glossary's term where the move is that figure by id, else its own name. */
function nameOf(t: Target): string {
  const term = termOf(t.id);
  return term && term.kind === 'figure' && term.id === t.id ? term.term : t.name;
}

/** Figures named without an article: “that's litotes”, not “a litotes”. */
const MASS = new Set([
  'litotes', 'hyperbole', 'periphrasis', 'polysyndeton', 'asyndeton', 'anaphora', 'epistrophe', 'parallelism', 'isocolon',
  'personification', 'irony', 'inversion', 'free indirect discourse', 'deadpan', 'understatement', 'imagery', 'alliteration',
]);
/** Single-word names of a thing one can make one of. */
const COUNT = new Set(['antithesis', 'chiasmus', 'tricolon', 'metaphor', 'simile', 'conceit', 'image', 'apostrophe', 'zeugma', 'climax', 'anticlimax', 'epigram', 'paradox', 'aphorism', 'generalization', 'ironic verdict', 'ironic aside', 'parenthesis', 'cumulative sentence']);

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The lengths of a text's sentences, in words. */
function lengthsOf(text: string): number[] {
  const toks = tokenize(text);
  return sentences(text, toks)
    .map((s) => wordCount(toks, s.from, s.to))
    .filter((n) => n > 0);
}

/** How a sentence is built against another: word classes and punctuation, weighted as the sketch weighs them. */
function shapeAgainst(text: string, example: Citation): PracticeShape {
  const a = skeletonsOf(text);
  const b = skeletonsOf(example.text);
  const tags = editSimilarity(a.tags, b.tags);
  const punct = editSimilarity(a.punct, b.punct);
  const score = (WEIGHTS.tags * tags + WEIGHTS.punct * punct) / (WEIGHTS.tags + WEIGHTS.punct);
  const r = (x: number) => Math.round(x * 100) / 100;
  return { score: r(score), tags: r(tags), punct: r(punct), example: { id: example.id, text: example.text, cite: example.cite } };
}

export function practiceCheck(m: AuthorModel, attempt: string, moveName = ''): PracticeCheck {
  const short = m.author.short;
  const pr = pronounsOf(m.author);
  const text = attempt.trim();
  const target = targetOf(m, moveName);
  const lens = text ? lengthsOf(text) : [];
  const made =
    !!target && !!text && (target.test ? target.test(m, text, lens) : m.shows({ id: target.id, pattern: target.move?.pattern }, text) || (target.key === 'antithesis' && NOT_BUT.test(curly(text))));

  // Everything else the attempt does, one name for each, the move practised left out.
  const seen = new Set(target ? [target.key] : []);
  const also: string[] = [];
  const add = (key: string, name: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    also.push(name);
  };
  if (text) {
    for (const x of m.author.moves ?? []) if (x.id !== target?.id && m.shows(x, text)) add(moveKey(x.id, x.name), x.name);
    for (const f of findFigures(m, text)) if (!WEAK.has(f.term)) add(moveKey(f.term), FIGURES[f.term]?.name ?? f.name);
  }

  const never = text
    ? analyze(m, blocksOfText(text))
        .words.filter((w) => w.kind !== 'name')
        .map((w) => ({ word: w.word, theirs: w.alternatives.filter((x) => x.source !== 'context' && x.weight >= 0.2).slice(0, 3).map((x) => x.text) }))
    : [];

  const d = m.profile.sentenceLength.narration;
  const lo = Math.round(d.p25);
  const hi = Math.round(d.p75);
  const meanWords = lens.length ? Math.round(lens.reduce((x, y) => x + y, 0) / lens.length) : 0;
  const band = lens.length ? (meanWords < lo ? 'shorter' : meanWords > hi ? 'longer' : 'within') : null;
  const length: PracticeLength = { sentences: lens.length, meanWords, authorMedian: Math.round(d.p50), authorRange: [lo, hi], band };

  const exclude = new Set(m.author.linkExclude ?? []);
  const example = target && !target.test ? (m.moveExamples(target.id, text, 6).find((c) => !exclude.has(c.work)) ?? null) : null;
  const shape = example && text ? shapeAgainst(text, example) : null;

  const lengthLine = lens.length ? `${meanWords} ${meanWords === 1 ? 'word' : 'words'}${lens.length > 1 ? ' a sentence' : ''}; ${pr.possessive} usual ${lo} to ${hi}.` : '';
  const parts: string[] = [];
  if (!text) parts.push('Write a sentence first.');
  else if (target && made) parts.push(`Yes, that’s ${withArticle(nameOf(target))}.`, lengthLine);
  else if (target) parts.push(`Not yet. ${target.hint}`);
  else parts.push(lengthLine);
  if (never.length) parts.push(`${cap(short)} never used ${never.map((w) => `“${w.word}”`).join(', ')}.`);

  return {
    made,
    move: target ? { id: target.id, name: target.name, made, does: target.does, hint: target.hint, example } : null,
    hint: target?.hint ?? '',
    also,
    never,
    length,
    shape,
    verdict: parts.filter(Boolean).join(' '),
  };
}

/** The ordinary sentences of a text: no salutation, no sign-off, nothing without a letter. */
function ordinarySentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const toks = tokenize(line);
    for (const s of sentences(line, toks)) {
      const t = line.slice(s.start, s.end).trim();
      if (t && /\p{L}/u.test(t) && lineClass(t) === 'sentence') out.push(t);
    }
  }
  return out;
}

/** The most drills offered at once. */
export const MAX_DRILLS = 3;

/**
 * What to practise. With a rewrite's notes, a drill for each move the rewrite was shown to make, on the writer's
 * own sentence beside it; a salutation or sign-off is never a sentence to practise on. Without notes, a drill for
 * each gap the engine finds in the text.
 */
export function drillsFor(m: AuthorModel, text: string, notes?: DrillNote[] | null): Drill[] {
  const out: Drill[] = [];
  const keys = new Set<string>();
  const offer = (t: Target, sentence: string, reason: Drill['reason']) => {
    if (keys.has(t.key) || out.length >= MAX_DRILLS) return;
    keys.add(t.key);
    out.push({ move: t.id, name: t.name, hint: t.hint, sentence, reason });
  };

  if (notes) {
    for (const n of notes) {
      if ((n.kind && n.kind !== 'move') || n.verified === false) continue;
      const t = targetOf(m, n.id ?? n.technique ?? '');
      if (!t || t.test || WEAK.has(t.id)) continue;
      // Verified here too: the rewrite's sentence must make the move.
      if (n.after && !m.shows({ id: t.id, pattern: t.move?.pattern }, n.after)) continue;
      const mine = ordinarySentences(n.before ?? '').find((s) => !m.shows({ id: t.id, pattern: t.move?.pattern }, s));
      if (mine) offer(t, mine, 'rewrite');
    }
    return out;
  }

  const ss = ordinarySentences(text);
  if (!ss.length) return out;
  const lens = ss.map((s) => lengthsOf(s).reduce((a, b) => a + b, 0));
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const P = m.profile;
  const longest = ss[lens.indexOf(Math.max(...lens))]!;

  // Short sentences: two in a row the voice would have joined.
  const shortAt = lens.findIndex((n, i) => i + 1 < lens.length && n < P.sentenceLength.narration.p25 && lens[i + 1]! < P.sentenceLength.narration.p25);
  if (ss.length >= 2 && mean < P.sentenceLength.narration.p25 && shortAt >= 0) offer({ ...ENGINE_DRILLS.longer!, key: 'longer' }, `${ss[shortAt]} ${ss[shortAt + 1]}`, 'short');

  // No joins, where the voice joins clauses with semicolons, colons and dashes.
  const joinsPer = (P.punctuationPerSentence[';'] ?? 0) + (P.punctuationPerSentence[':'] ?? 0) + (P.punctuationPerSentence['—'] ?? 0);
  if (ss.length >= 3 && joinsPer >= 0.15 && !ss.some((s) => /[;:—]/.test(s))) offer({ ...ENGINE_DRILLS.join!, key: 'join' }, longest, 'joins');

  // No move and no figure: the voice's first move that has a sentence of its own to show.
  const any = ss.some((s) => (m.author.moves ?? []).some((x) => m.shows(x, s)) || findFigures(m, s).some((f) => !WEAK.has(f.term)));
  if (!any) {
    const mv = (m.author.moves ?? []).find((x) => x.id !== 'irony' && !(x.id in FIGURES && WEAK.has(x.id)));
    if (mv) offer({ id: mv.id, key: moveKey(mv.id, mv.name), name: mv.name, does: mv.does, hint: hintOf(mv), move: mv }, longest, 'figures');
  }
  return out;
}
