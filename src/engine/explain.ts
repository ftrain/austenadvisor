// Why a sentence was rewritten, said by the system and not by the model: what the engine can see changed between
// the writer's sentence(s) and the new one, in one sentence from a template, and the author's sentence that shows it.
// The rewriter may name the sentence it learned from; where that sentence does not show what was done, or none is
// named, the engine finds one that does. Every rewritten sentence links to one of the author's.

import { pronounsOf } from '../corpus/sources.ts';
import { sentences, tokenize } from '../nlp/tokenize.ts';
import type { AuthorModel, Citation, Register } from './model.ts';
import { CONTRACTIONS } from './profile.ts';

export interface SentenceWhy {
  /** One sentence, from the template. */
  why: string;
  /** The author's sentence that inspired it, from the corpus. */
  model: Citation;
  /** The author's moves the new sentence makes that the writer's did not. */
  moves: string[];
}

const words = (t: string) => tokenize(t).filter((x) => x.kind === 'word');
const quote = (s: string) => `“${s.replace(/'/g, '’')}”`;

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const num = (n: number) => NUM[n] ?? String(n);

/**
 * What changed, and the sentence of the author's that shows it. `before` are the writer's sentences the new one
 * renders; `named` is the id the rewriter gave, if any.
 */
export function explainSentence(
  m: AuthorModel,
  before: string[],
  after: string,
  named?: string | number | null,
  register?: Register,
  /** Words of hers put for words of the writer's she also used, where the rewriter knows them. */
  swaps: [string, string][] = [],
): SentenceWhy {
  const short = m.author.short;
  const pr = pronounsOf(m.author);
  const src = before.join(' ');
  const bw = words(src);
  const aw = words(after);
  const aset = new Set(aw.map((t) => t.norm));
  const parts: string[] = [];

  // Sentences joined into one period.
  if (before.length > 1) parts.push(`joins ${num(before.length)} sentences (${before.map((b) => words(b).length).join(', ')} words) into one of ${aw.length}`);
  // Words the author never wrote, gone.
  const gone = [...new Set(bw.filter((t) => !CONTRACTIONS[t.norm] && !m.word(t.norm) && !/^\p{Lu}/u.test(t.text) && !aset.has(t.norm)).map((t) => t.text))];
  if (gone.length) parts.push(`replaces ${gone.slice(0, 3).map(quote).join(', ')} (never in ${short})`);
  // Her likelier word for one of the writer's.
  const swapped = swaps.filter(([b, a]) => src.includes(b) && after.includes(a));
  if (swapped.length) parts.push(`prefers ${swapped.slice(0, 2).map(([b, a]) => `${quote(a)} to ${quote(b)}`).join(', ')}, as ${pr.possessive} usage does`);
  // Contractions written out.
  const opened = [...new Set(bw.filter((t) => CONTRACTIONS[t.norm] && !aset.has(t.norm)).map((t) => t.text))];
  if (opened.length) parts.push(`writes out ${opened.slice(0, 2).map(quote).join(', ')}`);
  // Speech brought into the narration.
  const quotedBefore = bw.some((t) => t.quoted);
  const quotedAfter = aw.some((t) => t.quoted);
  // The author's moves made here and not in the writer's words.
  const moves = (m.author.moves ?? []).filter((mv) => {
    const re = new RegExp(mv.pattern, 'i');
    return re.test(after) && !re.test(src);
  });
  if (quotedBefore && !quotedAfter && !moves.some((x) => x.id === 'reported')) parts.push('turns quoted speech into reported speech');
  if (moves.length) parts.push(`uses ${pr.possessive} ${moves.slice(0, 2).map((x) => `“${x.name.toLowerCase()}”`).join(', ')}`);
  // Nothing the engine can name: the diction.
  if (!parts.length) parts.push(`puts the writer’s sense into ${pr.possessive} diction`);

  // The author's sentence: the one named, if it shows a move made here (or no move was made); else the nearest that does.
  const reg: Register = register ?? (quotedAfter ? 'speech' : 'narration');
  const id = typeof named === 'number' ? named : Number(/^S?(\d+)$/.exec(String(named ?? '').trim())?.[1] ?? NaN);
  let model = Number.isFinite(id) ? m.cite(id) : null;
  if (model && moves.length && !moves.some((mv) => new RegExp(mv.pattern, 'i').test(model!.text))) model = null;
  if (!model && moves.length) model = m.moveExamples(moves[0]!.id, after, 1)[0] ?? null;
  if (!model) model = m.similarSentences(after, 1, { minWords: 6, maxWords: 60, register: reg })[0] ?? m.similarSentences(after, 1)[0] ?? null;
  const why = `This sentence ${list(parts.slice(0, 3))}, modelled on ${model ? model.cite : `${pr.possessive} works`}.`;
  return { why, model: model!, moves: moves.map((x) => x.id) };
}


/**
 * A paragraph's sentences before and after a rewrite that kept their order (the statistical rewrite: words swapped,
 * sentences joined): each new sentence with the old sentences it took in, by the words they share.
 */
export function alignSentences(before: string, after: string): { after: string; before: string[] }[] {
  const split = (t: string) => sentences(t).map((s) => t.slice(s.start, s.end));
  const bs = split(before);
  const as = split(after);
  const bag = (t: string) => new Set(words(t).map((x) => x.norm));
  const out = as.map((a) => ({ after: a, before: [] as string[] }));
  for (const b of bs) {
    const bw = bag(b);
    let best = 0;
    let score = -1;
    as.forEach((a, i) => {
      const aw = bag(a);
      const shared = [...bw].filter((w) => aw.has(w)).length / Math.max(1, bw.size);
      if (shared > score) [best, score] = [i, shared];
    });
    out[best]?.before.push(b);
  }
  return out;
}
