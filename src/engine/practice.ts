// Practice: the writer tries a move of the author's on a sentence of their own, and the engine reads the attempt at
// once, with no language model: whether the move is there (by the same pattern or figure detector that checks the
// rewrite's notes), what other moves and figures it makes, the words the author never used with the author's own,
// and its length against the author's sentences.

import { pronounsOf } from '../corpus/sources.ts';
import { sentences, tokenize, wordCount } from '../nlp/tokenize.ts';
import { analyze } from './analyze.ts';
import { blocksOfText } from './doc.ts';
import { FIGURES, findFigures } from './figures.ts';
import type { AuthorModel, Citation } from './model.ts';

export interface PracticeCheck {
  /** The move practised: whether the attempt makes it, what it is, and one of the author's sentences that does. */
  move: { name: string; made: boolean; does: string; example: Citation | null } | null;
  /** The author's other moves and the figures of speech the attempt makes. */
  also: string[];
  /** Words in the attempt the author never used, each with the author's words in its place. */
  never: { word: string; theirs: string[] }[];
  /** The attempt's sentences against the author's. */
  length: { sentences: number; meanWords: number; authorMedian: number; authorRange: [number, number] };
  /** One line to the writer: what worked, and what to try next. */
  verdict: string;
}

/** The move a note named, by its name or id: one of the author's, or a figure of speech. */
function moveOf(m: AuthorModel, name: string): { id: string; name: string; does: string } | null {
  const n = name.trim().toLowerCase();
  const mv = (m.author.moves ?? []).find((x) => x.id === n || x.name.toLowerCase() === n);
  if (mv) return { id: mv.id, name: mv.name, does: mv.does };
  const fig = Object.entries(FIGURES).find(([id, f]) => id === n || f.name.toLowerCase() === n);
  return fig ? { id: fig[0], name: fig[1].name, does: fig[1].gloss } : null;
}

export function practiceCheck(m: AuthorModel, attempt: string, moveName = ''): PracticeCheck {
  const short = m.author.short;
  const pr = pronounsOf(m.author);
  const text = attempt.trim();
  const target = moveName ? moveOf(m, moveName) : null;
  const made = !!target && m.shows({ id: target.id, pattern: (m.author.moves ?? []).find((x) => x.id === target.id)?.pattern }, text);
  const others = (m.author.moves ?? []).filter((x) => x.id !== target?.id && m.shows(x, text)).map((x) => x.name);
  const figures = [...new Set(findFigures(m, text).map((f) => FIGURES[f.term]?.name ?? f.term))].filter((f) => f !== target?.name);
  const a = analyze(m, blocksOfText(text));
  const never = a.words
    .filter((w) => w.kind !== 'name')
    .map((w) => ({ word: w.word, theirs: w.alternatives.filter((x) => x.source !== 'context' && x.weight >= 0.2).slice(0, 3).map((x) => x.text) }));
  const toks = tokenize(text);
  const ss = sentences(text, toks);
  const lens = ss.map((s) => wordCount(toks, s.from, s.to)).filter((n) => n > 0);
  const d = m.profile.sentenceLength.narration;
  const meanWords = lens.length ? Math.round(lens.reduce((x, y) => x + y, 0) / lens.length) : 0;
  const example = target ? (m.moveExamples(target.id, text, 6).find((c) => !(m.author.linkExclude ?? []).includes(c.work)) ?? null) : null;

  const parts: string[] = [];
  if (target) parts.push(made ? `Yes: that is ${pr.possessive} ${target.name.toLowerCase()}.` : `Not yet: ${target.does}`);
  if (never.length) parts.push(`${cap(short)} never used ${never.map((w) => `“${w.word}”`).join(', ')}.`);
  if (lens.length && meanWords < d.p25) parts.push(`Your sentences run ${meanWords} words; half of ${short}’s run ${Math.round(d.p50)} or more.`);
  if (target && made && !never.length) parts.push('Now try it on another sentence of yours.');
  return {
    move: target ? { name: target.name, made, does: target.does, example } : null,
    also: [...others, ...figures],
    never,
    length: { sentences: lens.length, meanWords, authorMedian: Math.round(d.p50), authorRange: [Math.round(d.p25), Math.round(d.p75)] },
    verdict: parts.join(' '),
  };
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
