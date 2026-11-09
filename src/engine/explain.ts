// Why a sentence was rewritten, said by the system and not by the model: what the engine can see changed between
// the writer's sentence(s) and the new one, in one sentence from a template, and the author's sentence that shows it.
// The rewriter may name the sentence it learned from; where that sentence does not show what was done, or none is
// named, the engine finds one that does. Every rewritten sentence links to one of the author's.

import { pronounsOf } from '../corpus/sources.ts';
import { sentences, tokenize } from '../nlp/tokenize.ts';
import type { AuthorModel, Citation, Register } from './model.ts';
import { CONTRACTIONS } from './profile.ts';
import { FIGURES, figureExamples, findFigures, type Figure } from './figures.ts';

export interface SentenceWhy {
  /** The figures of speech the new sentence makes that the writer's did not, as recognized by form. */
  figures: Figure[];
  /** Things the writer named that the sentence neither puts in words of the author's nor renders by periphrasis. */
  dropped: string[];
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
  /** Moves the rewriter's notes credit to words of this sentence (an ironic verdict has no pattern a machine can trust). */
  noted: string[] = [],
): SentenceWhy {
  const short = m.author.short;
  const pr = pronounsOf(m.author);
  const src = before.join(' ');
  const bw = words(src);
  const aw = words(after);
  const aset = new Set(aw.map((t) => t.norm));
  const exclude = new Set(m.author.linkExclude ?? []);
  const linkable = (c: Citation | null | undefined) => !!c && !exclude.has(c.work);
  const curly = (t: string) => t.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’');
  // Narration alone: what is inside quotation marks is speech, and a narrator's move is not made there.
  const narration = (t: string) => curly(t).replace(/“[^”]*”?/g, ' ');

  // The author's moves made here and not in the writer's words: those the notes credit, then those the patterns find.
  const all = m.author.moves ?? [];
  const found = all.filter((mv) => {
    const look = mv.id === 'saidshe' ? curly : narration;
    return m.shows(mv, look(after)) && !m.shows(mv, look(src));
  });
  // Figures of speech made here and not in the writer's words, by their detectors.
  const had = new Set(findFigures(m, src, { letter: register === 'letter' }).map((f) => f.term));
  const figures = findFigures(m, after, { letter: register === 'letter' }).filter((f) => !had.has(f.term) && !(f.term === 'fid' && register === 'letter'));
  // Irony is credited where a note claims it and a vehicle of it is there (a generalization, litotes, antithesis, hyperbole).
  const vehicle = figures.some((f) => ['gnomic', 'aside', 'litotes', 'antithesis', 'hyperbole'].includes(f.term));
  const notedOk = noted.filter((id) => id !== 'irony' || vehicle);
  const moves = [...notedOk.map((id) => all.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x), ...found]
    .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
    // A move that is a figure is named as the figure.
    .filter((x) => !(x.id in FIGURES) || (x.id === 'irony' && vehicle && !figures.some((f) => f.term === 'gnomic' || f.term === 'aside')));

  const parts: string[] = [];
  // The words the author never wrote: put by one of hers, rendered by a periphrasis, or dropped.
  const gone = [...new Set(bw.filter((t) => !CONTRACTIONS[t.norm] && !m.word(t.norm) && !/^\p{Lu}/u.test(t.text) && !aset.has(t.norm)).map((t) => t.text))];
  const periphrases = figures.filter((f) => f.term === 'periphrasis');
  const rendered: string[] = [];
  const replaced: string[] = [];
  const dropped: string[] = [];
  const rephrased: string[] = [];
  const srcLen = Math.max(1, src.length);
  const aftLen = Math.max(1, after.length);
  const usedPeri = new Set<number>();
  const srcToks = tokenize(src);
  const srcTags = m.tagger.tagTokens(srcToks);
  const srcTag = new Map(srcToks.map((t, k) => [t.norm, srcTags[k]!] as [string, string]));
  const usedBy = new Set<string>();
  for (const g of gone) {
    const rels = ['@', '&', '~'];
    const hers = m.wn
      .anyLemmas(g)
      .flatMap((l) => m.wn.senses(l.lemma, l.pos).slice(0, 4))
      .flatMap((id) => {
        const syn = m.wn.synset(id);
        return syn ? [...syn.words, ...rels.flatMap((r) => (syn.rels[r] ?? []).slice(0, 40).flatMap((h) => m.wn.synset(h)?.words ?? []))] : [];
      })
      .filter((w) => !w.includes('_'));
    const lemmasOf = (w: string) => [w, ...m.wn.lemmas(w, 'n'), ...m.wn.lemmas(w, 'v'), ...m.wn.lemmas(w, 'a'), ...m.wn.lemmas(w, 'r')];
    const by = aw.find((t) => !bw.some((b) => b.norm === t.norm) && lemmasOf(t.norm).some((l) => hers.includes(l)));
    // A periphrasis renders the word nearest it in place (by where each stands in its sentence).
    const at = src.indexOf(g) / srcLen;
    const peri = periphrases
      .map((p, i) => ({ i, d: Math.abs(p.start / aftLen - at) }))
      .filter((x) => !usedPeri.has(x.i))
      .sort((a, b) => a.d - b.d)[0];
    // A noun by its place in the writer's sentence (the tagger), not by the dictionary, which may not know it.
    const isNoun = /^NNS?$/.test(srcTag.get(g.toLowerCase().replace(/’/g, "'")) ?? '');
    // A noun right after a removed noun (“phone charger”) is one thing with it, rendered or dropped together.
    const prevGone = gone.indexOf(g) > 0 && new RegExp(`${gone[gone.indexOf(g) - 1]}\\s+${g}`, 'i').test(src);
    if (by) {
      replaced.push(`${quote(g)} with ${quote(by.text)}`);
      usedBy.add(by.norm);
    } else if (prevGone && (rendered.length || replaced.length)) continue;
    else if (peri && isNoun) {
      usedPeri.add(peri.i);
      rendered.push(`${quote(g)} (${quote(periphrases[peri.i]!.text)})`);
    } else if (isNoun) dropped.push(quote(g));
    else rephrased.push(quote(g));
  }
  // A thing is dropped only where no new noun of hers could be standing for it (“bunkmate”: “companion”).
  // (The nouns of a periphrasis already render what it renders.)
  const inPeri = new Set(periphrases.filter((_, i) => usedPeri.has(i)).flatMap((p) => words(p.text).map((t) => t.norm)));
  const newNouns = new Set(
    aw.filter((t) => !bw.some((b) => b.norm === t.norm) && !usedBy.has(t.norm) && !inPeri.has(t.norm) && m.word(t.norm) && /^NNS?$/.test(m.usualTag(t.norm) ?? '')).map((t) => t.norm),
  ).size;
  for (let i = 0; i < newNouns && dropped.length; i++) rephrased.push(dropped.shift()!);
  const shown = figures.filter((f) => f.term !== 'periphrasis' || !rendered.length);
  if (rendered.length) parts.push(`renders ${rendered.slice(0, 2).join(', ')} by periphrasis`);
  const figName = (t: string) => {
    const f = shown.find((x) => x.term === t)!;
    const n = FIGURES[t]!.name.toLowerCase();
    const art = /^[aeiou]/.test(n) ? 'an' : 'a';
    // A figure of the whole sentence is shown by the sentence; one of a part, by its words.
    return f.text.length >= after.trim().length * 0.8 ? `${art} ${n}` : `${art} ${n} (${quote(f.text.length > 60 ? f.text.slice(0, 57) + '…' : f.text)})`;
  };
  if (shown.length) parts.push(`makes ${list([...new Set(shown.map((f) => f.term))].slice(0, 3).map(figName))}`);
  if (moves.length) parts.push(`uses ${pr.possessive} ${moves.slice(0, 2).map((x) => `“${x.name.toLowerCase()}”`).join(', ')}`);
  // Sentences joined into one period.
  if (before.length > 1) parts.push(`joins ${num(before.length)} sentences (${before.map((b) => words(b).length).join(', ')} words) into one of ${aw.length}`);
  if (replaced.length) parts.push(`replaces ${replaced.slice(0, 3).join(', ')} (never in ${short})`);
  if (rephrased.length) parts.push(`rephrases ${rephrased.slice(0, 3).join(', ')} (never in ${short})`);
  if (dropped.length) parts.push(`drops ${dropped.slice(0, 3).join(', ')}`);
  // Her likelier word for one of the writer's.
  const swapped = swaps.filter(([b, a]) => src.includes(b) && after.includes(a));
  if (swapped.length) parts.push(`prefers ${swapped.slice(0, 2).map(([b, a]) => `${quote(a)} to ${quote(b)}`).join(', ')}, as ${pr.possessive} usage does`);
  // Contractions written out.
  const opened = [...new Set(bw.filter((t) => CONTRACTIONS[t.norm] && !aset.has(t.norm)).map((t) => t.text))];
  if (opened.length) parts.push(`writes out ${opened.slice(0, 2).map(quote).join(', ')}`);
  // Speech brought into the narration.
  const quotedBefore = bw.some((t) => t.quoted);
  const quotedAfter = aw.some((t) => t.quoted);
  if (quotedBefore && !quotedAfter && !moves.some((x) => x.id === 'reported')) parts.push('turns quoted speech into reported speech');

  // Her words the sentence brings in, rarest first: where no move shows, the most telling of them is the link.
  const common = new Set(m.profile.mfw.words.slice(0, 150));
  const brought = [...new Set(aw.filter((t) => !t.quoted && !common.has(t.norm) && m.word(t.norm) && !/^\p{Lu}/u.test(t.text) && !bw.some((b) => b.norm === t.norm)).map((t) => t.norm))]
    .sort((a, b) => (m.word(a)?.count ?? 0) - (m.word(b)?.count ?? 0));

  // The link, in order of what it can show:
  // 1. the rewriter's own sentence, if it shows one of the moves made here (or, with no move, shares a word brought in);
  const id = typeof named === 'number' ? named : Number(/^S?(\d+)$/.exec(String(named ?? '').trim())?.[1] ?? NaN);
  let model: Citation | null = Number.isFinite(id) ? m.cite(id) : null;
  if (!linkable(model)) model = null;
  const shows = (c: Citation, mv: (typeof all)[number]) => m.shows(mv, mv.id === 'saidshe' ? curly(c.text) : narration(c.text));
  if (model && moves.length && !moves.some((mv) => mv.id === 'irony' || shows(model!, mv))) model = null;
  if (model && !moves.length && !figures.length && !brought.some((w) => words(model!.text).some((t) => t.norm === w))) model = null;
  if (model && !moves.length && figures.length && !figures.some((f) => findFigures(m, model!.text).some((g) => g.term === f.term))) model = null;
  // 2. the nearest sentence of hers that shows a figure, or a move, made here;
  for (const f of figures) {
    if (model) break;
    model = figureExamples(m, f.term, after, 1)[0] ?? null;
  }
  for (const mv of moves) {
    if (model) break;
    model = m.moveExamples(mv.id, after, 6).find(linkable) ?? null;
  }
  // 3. a sentence of hers with the most telling word this one brings in;
  let word: string | null = null;
  for (const w of model ? [] : brought.slice(0, 5)) {
    const hit = m.search([w], { prefer: brought.filter((x) => x !== w), limit: 5, minWords: 6, maxWords: 50 }).find(linkable);
    if (hit) {
      [model, word] = [hit, w];
      break;
    }
  }
  // 4. else the sentence of hers nearest in meaning and register.
  if (!model) model = m.similarSentences(after, 6, { minWords: 6, maxWords: 60, register: register ?? (quotedAfter ? 'speech' : 'narration') }).find(linkable) ?? m.similarSentences(after, 6).find(linkable) ?? null;

  const tail = parts.slice(0, word ? 2 : 3);
  if (word) tail.push(`brings in ${pr.possessive} ${quote(word)}`);
  if (!tail.length) tail.push(`puts the writer’s sense into ${pr.possessive} diction`);
  const why = `This sentence ${list(tail)}, modelled on ${model ? model.cite : `${pr.possessive} works`}.`;
  return { why, model: model!, moves: moves.map((x) => x.id), figures, dropped: dropped.map((d) => d.replace(/[“”]/g, '')) };
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
