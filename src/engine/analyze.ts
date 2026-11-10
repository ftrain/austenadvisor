// What Advisor says about a document: every word the author never used, flagged, with the author's own words in its
// place; sentences, paragraphs and chapters measured against the author's; and the whole compared, word habit by
// word habit, so a writer sees not only what to change but how the author wrote. Every suggestion carries the
// numbers it rests on and sentences from the works, cited.

import { createHash } from 'node:crypto';
import { tagName, wnPos, isProperTag } from '../nlp/tagger.ts';
import { looksProper, sentences as splitSentences, tokenize, wordCount, type Token } from '../nlp/tokenize.ts';
import { alternatives, slotLogProb, type Alternative, type Slot } from './alternatives.ts';
import type { DocBlock } from './doc.ts';
import type { AuthorModel, Citation } from './model.ts';
import { cap, pronounsOf } from '../corpus/sources.ts';
import { CONTRACTIONS, lmKey, syllables } from './profile.ts';
import { findFigures } from './figures.ts';

export type FlagKind = 'never' | 'form' | 'name' | 'rare';

export interface WordFlag {
  block: number;
  start: number;
  end: number;
  word: string;
  kind: FlagKind;
  /** "Austen never wrote “okay”." */
  note: string;
  tag: string;
  lemma?: string;
  lemmaCount?: number;
  alternatives: Alternative[];
}

export type Severity = 'fix' | 'consider' | 'note';

export interface Replacement {
  block: number;
  start: number;
  end: number;
  text: string;
}

export interface Advice {
  id: string;
  kind: 'word' | 'sentence' | 'paragraph' | 'chapter' | 'document';
  severity: Severity;
  block: number;
  start: number;
  end: number;
  title: string;
  message: string;
  /** The numbers it rests on, in words. */
  why: string;
  replacements?: Replacement[];
  examples: Citation[];
}

export interface SentenceInfo {
  block: number;
  start: number;
  end: number;
  words: number;
  spoken: boolean;
  /** Where its length falls among the author's sentences of its kind, 0–100. */
  percentile: number;
  /** Bits per word under the author's trigram model: lower is more like the author. */
  bitsPerWord: number;
  tags: string[];
}

export interface Measure {
  label: string;
  yours: number;
  author: number;
  unit: string;
  /** 0–100: how near the author's. */
  score: number;
  explain: string;
}

export interface Report {
  words: number;
  sentences: number;
  paragraphs: number;
  chapters: { title: string; words: number }[];
  /** Share of words the author also used, names aside. */
  authorWords: number;
  flagged: number;
  measures: Measure[];
  /** Burrows's Delta over the most frequent words, where there are words enough. */
  delta: { value: number; authorTypical: [number, number]; enough: boolean } | null;
  overused: { word: string; yours: number; author: number }[];
  underused: { word: string; yours: number; author: number; example?: Citation }[];
  score: number;
}

export interface Analysis {
  author: { id: string; name: string; short: string; advisor: string };
  words: WordFlag[];
  /** Figures of speech in the writer's draft, as recognized by form: what the writer already does, named. */
  figures: { block: number; start: number; end: number; term: string; name: string; gloss: string; text: string }[];
  /** Two nouns together that the author never put together, though each is hers: "ice cream", "coffee shop". */
  compounds: { block: number; start: number; end: number; text: string }[];
  sentences: SentenceInfo[];
  advice: Advice[];
  report: Report;
  ms: number;
}

interface SentenceWork {
  block: number;
  toks: Token[];
  from: number;
  to: number;
  start: number;
  end: number;
  tags: string[];
  keys: string[];
  /** keys index of each token, -1 where the token has no key. */
  keyAt: number[];
  spoken: boolean;
  words: number;
}

const STOP = new Set(
  'the a an and or but of to in on at by for with from as is was were be been being am are it its he she they them his her their this that these those i you we me my our your not no so very too than then there here what which who whom whose when where how all any some such one'.split(
    ' ',
  ),
);

const id = (...parts: (string | number)[]) => createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 12);

/** Flags and alternatives of a sentence, kept by its words and the author: typing elsewhere costs nothing here. */
const sentenceCache = new Map<
  string,
  { flags: Omit<WordFlag, 'block'>[]; advice: Omit<Advice, 'block'>[]; compounds: { start: number; end: number; text: string }[]; tags: string[]; bits: number }
>();

export interface AnalyzeOptions {
  /** Alternatives offered for each flagged word (default 5). */
  alternatives?: number;
  /** Look for better-fitting words for words the author did use (default true). */
  contextual?: boolean;
}

export function analyze(m: AuthorModel, blocks: DocBlock[], opts: AnalyzeOptions = {}): Analysis {
  const t0 = performance.now();
  const short = m.author.short;
  const P = m.profile;
  const words: WordFlag[] = [];
  const compounds: Analysis['compounds'] = [];
  const advice: Advice[] = [];
  const sentenceInfos: SentenceInfo[] = [];
  const work: SentenceWork[] = [];
  const chapters: { title: string; words: number }[] = [];
  let paragraphs = 0;
  const counts = new Map<string, number>();
  let totalWords = 0;
  let knownWords = 0;
  let nameWords = 0;
  let narrWords = 0;
  let spokenWords = 0;
  let syll = 0;
  let lyAdverbs = 0;
  let passives = 0;
  const punct: Record<string, number> = { ';': 0, '—': 0, ',': 0, '!': 0, '?': 0 };
  const narrParagraphWords: number[] = [];

  // 1. Read: tokens, sentences, tags, word-model keys.
  blocks.forEach((b, bi) => {
    if (b.kind === 'title') return;
    if (b.kind === 'heading') {
      chapters.push({ title: b.text, words: 0 });
      return;
    }
    if (b.kind === 'other' || !b.text.trim()) return;
    paragraphs++;
    if (!chapters.length) chapters.push({ title: '', words: 0 });
    const toks = tokenize(b.text);
    let pw = 0;
    let ps = 0;
    for (const s of splitSentences(b.text, toks)) {
      const n = wordCount(toks, s.from, s.to);
      if (!n) continue;
      const tags = m.tagger.tagTokens(toks, s.from, s.to);
      const keys: string[] = [];
      const keyAt: number[] = [];
      let spoken = 0;
      for (let k = s.from; k < s.to; k++) {
        const key = lmKey(toks[k]!);
        keyAt.push(key ? keys.length : -1);
        if (key) keys.push(key);
        if (toks[k]!.kind === 'word' && toks[k]!.quoted) spoken++;
      }
      const sw: SentenceWork = { block: bi, toks, from: s.from, to: s.to, start: s.start, end: s.end, tags, keys, keyAt, spoken: spoken / n >= 0.5, words: n };
      work.push(sw);
      pw += n;
      ps += spoken;
    }
    chapters[chapters.length - 1]!.words += pw;
    if (pw && ps / pw < 0.5) narrParagraphWords.push(pw);
  });

  // 2. Each sentence: its words, flagged or not; its fit; the advice it carries.
  for (const s of work) {
    const text = s.toks[s.from]!.start;
    void text;
    const sentenceText = blocks[s.block]!.text.slice(s.start, s.end);
    const cacheKey = `${m.author.id}\u0000${s.spoken ? 1 : 0}\u0000${opts.contextual === false ? 0 : 1}\u0000${sentenceText}`;
    let cached = sentenceCache.get(cacheKey);
    if (!cached) {
      cached = readSentence(m, s, sentenceText, opts);
      if (sentenceCache.size > 5000) sentenceCache.clear();
      sentenceCache.set(cacheKey, cached);
    }
    for (const f of cached.flags) words.push({ ...f, block: s.block, start: f.start + s.start, end: f.end + s.start });
    // A replacement at block -1 is the sentence's own: it moves to the paragraph with the advice.
    for (const a of cached.advice)
      advice.push({
        ...a,
        block: s.block,
        start: a.start + s.start,
        end: a.end + s.start,
        replacements: a.replacements?.map((r) => (r.block < 0 ? { ...r, start: r.start + s.start, end: r.end + s.start } : r)),
      });
    for (const c of cached.compounds) compounds.push({ ...c, block: s.block, start: c.start + s.start, end: c.end + s.start });
    const dist = s.spoken ? P.sentenceLength.dialogue : P.sentenceLength.narration;
    sentenceInfos.push({
      block: s.block,
      start: s.start,
      end: s.end,
      words: s.words,
      spoken: s.spoken,
      percentile: percentile(dist, s.words),
      bitsPerWord: cached.bits,
      tags: cached.tags,
    });
    // Counts for the report.
    for (let k = s.from; k < s.to; k++) {
      const t = s.toks[k]!;
      const tag = s.tags[k - s.from]!;
      if (t.kind === 'punct' && t.norm in punct) punct[t.norm]!++;
      if (t.kind !== 'word') continue;
      totalWords++;
      if (t.quoted) spokenWords++;
      else narrWords++;
      counts.set(t.norm, (counts.get(t.norm) ?? 0) + 1);
      syll += syllables(t.norm);
      if (m.word(t.norm)) knownWords++;
      else if (isProperTag(tag) || looksProper(s.toks, k, s.from)) nameWords++;
      if (/^RB/.test(tag) && t.norm.endsWith('ly')) lyAdverbs++;
      if (/^BE/.test(tag) && /^VBN/.test(s.tags[k - s.from + 1] ?? '')) passives++;
    }
  }

  // 3. The figures of speech the writer already makes.
  const figures: Analysis['figures'] = [];
  blocks.forEach((b, bi) => {
    if (b.kind === 'title' || b.kind === 'heading' || b.kind === 'other' || !b.text.trim()) return;
    for (const f of findFigures(m, b.text)) figures.push({ block: bi, start: f.start, end: f.end, term: f.term, name: f.name, gloss: f.gloss, text: f.text });
  });

  // 4. Runs of short sentences in narration, which the author would have joined.
  advice.push(...joinShortRuns(m, work, blocks));

  // 4. The document as a whole.
  const report = reportOf(m, {
    totalWords, knownWords, nameWords, narrWords, spokenWords, syll, lyAdverbs, passives, punct, counts,
    sentences: work, paragraphs, chapters, narrParagraphWords, flagged: words.filter((w) => w.kind !== 'name').length,
  });
  advice.push(...documentAdvice(m, report, narrParagraphWords, chapters));

  const order: Record<Severity, number> = { fix: 0, consider: 1, note: 2 };
  advice.sort((a, b) => a.block - b.block || a.start - b.start || order[a.severity] - order[b.severity]);
  return {
    author: { id: m.author.id, name: m.author.name, short, advisor: m.author.advisor },
    words,
    compounds,
    figures,
    sentences: sentenceInfos,
    advice,
    report,
    ms: Math.round(performance.now() - t0),
  };
}

function readSentence(m: AuthorModel, s: SentenceWork, sentenceText: string, opts: AnalyzeOptions) {
  const short = m.author.short;
  const flags: Omit<WordFlag, 'block'>[] = [];
  const advice: Omit<Advice, 'block'>[] = [];
  const base = s.start;
  const content = s.toks
    .slice(s.from, s.to)
    .filter((t) => t.kind === 'word' && !STOP.has(t.norm))
    .map((t) => t.norm);
  const logps = m.lm.logProbs(s.keys);
  const bits = s.keys.length ? -logps.reduce((a, b) => a + b, 0) / (s.keys.length + 1) : 0;

  for (let k = s.from; k < s.to; k++) {
    const t = s.toks[k]!;
    if (t.kind !== 'word') continue;
    const tag = s.tags[k - s.from]!;
    const info = m.word(t.norm);
    const nextWord = s.toks.slice(k + 1, s.to).findIndex((x) => x.kind === 'word');
    const nextTag = nextWord === 0 ? s.tags[k + 1 - s.from] : undefined;
    const slot: Slot = { keys: s.keys, at: s.keyAt[k - s.from]!, word: t.text, tag, context: content.filter((w) => w !== t.norm), nextTag };
    const rel = { start: t.start - base, end: t.end - base };

    // A contraction where the author wrote the words out.
    const expansion = CONTRACTIONS[t.norm];
    if (expansion) {
      const c = m.profile.contractions[t.norm];
      const used = c ? (s.spoken ? c.dial : c.narr) : 0;
      const ex = expansion.toLowerCase().split(' ');
      const exCount = ex.length === 2 ? m.lm.bigram(ex[0]!, ex[1]!) : (m.word(ex[0]!)?.count ?? 0);
      const share = used / Math.max(1, used + exCount);
      if (share < (s.spoken ? 0.15 : 0.25)) {
        const examples = m.search(ex, { phrase: ex.length > 1, prefer: content, limit: 2, minWords: 6, maxWords: 40 });
        advice.push({
          id: id('contraction', sentenceText, t.start),
          kind: 'word',
          severity: s.spoken ? 'consider' : 'fix',
          ...rel,
          title: `“${t.text}” → “${matchCase(expansion, t.text)}”`,
          message: s.spoken
            ? `Even in speech ${short} seldom contracts “${expansion}”.`
            : `In narration ${short} writes the words out.`,
          why: `${short} wrote “${expansion}” ${exCount.toLocaleString()} times; “${t.text.replace(/'/g, '’')}” ${used} times ${s.spoken ? 'in speech' : 'outside speech'}.`,
          replacements: [{ block: -1, start: t.start - base, end: t.end - base, text: matchCase(expansion, t.text) }],
          examples,
        });
        if (!info) flags.push({ ...rel, word: t.text, kind: 'never', tag, note: `${short} never wrote “${t.text}”.`, alternatives: alternatives(m, slot, { limit: 3 }) });
        continue;
      }
    }

    if (info) {
      // A word the author used, where the author would more likely have written another.
      const usual = m.usualTag(t.norm);
      // Nouns, adjectives and adverbs only: a verb's senses are too many to swap one for another by statistics.
      const pos = wnPos(tag);
      if (opts.contextual !== false && slot.at >= 0 && !STOP.has(t.norm) && pos && pos !== 'v' && usual && wnPos(usual) === pos && info.count < 400) {
        const here = [0, 1, 2].reduce((a, d) => a + slotLogProb(m, s.keys, slot.at + d), 0);
        const alts = alternatives(m, slot, { limit: 3, examples: false, gap: false, spelling: false, related: false }).filter(
          (a) => a.source === 'synonym' && a.weight >= 0.99 && a.suits > 0.05 && a.count >= Math.max(10, info.count * 3),
        );
        const best = alts.sort((a, b) => b.fit - a.fit)[0];
        if (best && best.fit - here >= 6 && best.suits >= 0) {
          const ex = m.search(best.text.toLowerCase().split(' '), { prefer: content, limit: 2, minWords: 6, maxWords: 45 });
          advice.push({
            id: id('context', sentenceText, t.start, best.text),
            kind: 'word',
            severity: 'consider',
            ...rel,
            title: `“${t.text}” → “${best.text}”?`,
            message: `${short} used “${t.text}”, but here, between these words, “${best.text}” is what ${pronounsOf(m.author).subject} would more likely have written.`,
            why: `“${best.text}”: ${best.count.toLocaleString()} times in ${short}; “${t.text}”: ${info.count}. In this place it is ${Math.round(2 ** (best.fit - here))}× likelier under ${short}’s trigram model (${best.relation}).`,
            replacements: [{ block: -1, start: rel.start, end: rel.end, text: best.text }],
            examples: ex,
          });
        }
      }
      continue;
    }

    // A word the author never wrote.
    const proper = isProperTag(tag) || looksProper(s.toks, k, s.from);
    if (proper) {
      // "Mom": a capital, but a common noun to WordNet, which has the author's word for it.
      const first = m.wn.lemmas(t.norm, 'n').map((l) => m.wn.synset(m.wn.senses(l, 'n')[0]!))[0];
      const common = !!first && !first.rels['@i']; // not an instance: Ohio is a state, not a word for one
      const alts = common ? alternatives(m, { ...slot, tag: 'NN' }, { limit: 4, gap: false }) : [];
      flags.push({ ...rel, word: t.text, kind: 'name', tag, note: common ? `${short} never wrote “${t.text}”.` : `${short} never wrote the name “${t.text}”.`, alternatives: alts });
      continue;
    }
    const lemmas = m.wn.anyLemmas(t.norm);
    let lemma: string | undefined;
    let lemmaCount = 0;
    for (const l of lemmas) {
      const fs = m.forms(l.lemma, l.pos);
      const c = fs.reduce((a, f) => a + f.count, 0);
      if (c > lemmaCount) [lemma, lemmaCount] = [l.lemma, c];
    }
    const alts = alternatives(m, slot, { limit: 5 });
    const kind: FlagKind = lemmaCount > 0 ? 'form' : 'never';
    flags.push({
      ...rel,
      word: t.text,
      kind,
      tag,
      lemma,
      lemmaCount,
      note:
        kind === 'form'
          ? `${short} never wrote “${t.text}”, though ${pronounsOf(m.author).subject} used “${lemma}” in other forms (${lemmaCount} times).`
          : `${short} never wrote “${t.text}”: not once in ${m.totalWords.toLocaleString()} words.`,
      alternatives: alts,
    });
  }

  // Two of her nouns together that she never put together: a modern compound in old words.
  const compounds: { start: number; end: number; text: string }[] = [];
  for (let k = s.from; k + 1 < s.to; k++) {
    const a = s.toks[k]!;
    const b = s.toks[k + 1]!;
    const ta = s.tags[k - s.from]!;
    const tb = s.tags[k + 1 - s.from]!;
    if (a.kind !== 'word' || b.kind !== 'word' || !/^NNS?$/.test(ta) || !/^NNS?$/.test(tb)) continue;
    if (!m.word(a.norm) || !m.word(b.norm) || looksProper(s.toks, k, s.from) || looksProper(s.toks, k + 1, s.from)) continue;
    // Both words nouns in her usage too, so a tagger's slip ("the request meant") is not taken for one.
    if (!/^NNS?$/.test(m.usualTag(a.norm) ?? '') || !/^NNS?$/.test(m.usualTag(b.norm) ?? '')) continue;
    if (m.lm.bigram(a.norm, b.norm) > 0 || m.word(`${a.norm}-${b.norm}`) || m.word(a.norm + b.norm)) continue;
    compounds.push({ start: a.start - base, end: b.end - base, text: sentenceText.slice(a.start - base, b.end - base) });
    advice.push({
      id: id('compound', sentenceText, a.start),
      kind: 'word',
      severity: 'consider',
      start: a.start - base,
      end: b.end - base,
      title: `“${a.text} ${b.text}”: a compound ${short} never wrote`,
      message: `${short} used “${a.text}” and “${b.text}”, but never together: the thing may be newer than ${short}.`,
      why: `“${a.norm}” ${m.word(a.norm)!.count}×, “${b.norm}” ${m.word(b.norm)!.count}×, “${a.norm} ${b.norm}” never.`,
      examples: [],
    });
  }

  // How the sentence opens, where it is narration.
  if (!s.spoken) {
    const firstK = s.toks.slice(s.from, s.to).findIndex((t) => t.kind === 'word');
    const tag = firstK >= 0 ? s.tags[firstK]! : '';
    const share = m.profile.openers[tag] ?? 0;
    if (firstK >= 0 && share < 0.004 && tag && !isProperTag(tag)) {
      const ex = m.search([s.toks[s.from + firstK]!.norm], { limit: 1, minWords: 8 });
      advice.push({
        id: id('opener', sentenceText),
        kind: 'sentence',
        severity: 'note',
        start: 0,
        end: s.end - s.start,
        title: `An unusual opening`,
        message: `${short} rarely began a sentence of narration with ${aOrAn(tagName(tag))}.`,
        why: `Under ${(share * 100).toFixed(1)}% of ${short}’s narrative sentences open with ${tagName(tag)} (${tag}); ${topOpeners(m)}.`,
        examples: ex,
      });
    }
  }
  return { flags, advice, compounds, tags: s.tags, bits };
}

function topOpeners(m: AuthorModel): string {
  return (
    `${pronounsOf(m.author).possessivePronoun} most often open with ` +
    Object.entries(m.profile.openers)
      .slice(0, 4)
      .map(([t, v]) => `${tagName(t)} (${(v * 100).toFixed(0)}%)`)
      .join(', ')
  );
}

function aOrAn(s: string) {
  return /^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`;
}

function matchCase(word: string, like: string): string {
  return /^\p{Lu}/u.test(like) ? word[0]!.toUpperCase() + word.slice(1) : word;
}

function percentile(d: { p10: number; p25: number; p50: number; p75: number; p90: number }, x: number): number {
  const pts: [number, number][] = [[0, 0], [d.p10, 10], [d.p25, 25], [d.p50, 50], [d.p75, 75], [d.p90, 90], [d.p90 * 2, 100]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if (x <= x1) return Math.round(y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-9, x1 - x0));
  }
  return 100;
}

const CONJ = new Set(['and', 'but', 'yet', 'so', 'for', 'or']);
const SUBJECTS = new Set(['i', 'he', 'she', 'we', 'they', 'it', 'you']);

/** Two sentences made one, joined as the author most often joined clauses. */
export function joinSentences(m: AuthorModel, a: { text: string; toks: Token[]; tags: string[] }, b: { text: string; toks: Token[]; tags: string[] }): string {
  const first = a.text.replace(/\s*[.!]+(["”’)]?)\s*$/, '$1');
  const bWords = b.toks.filter((t) => t.kind === 'word');
  const w0 = bWords[0];
  let rest = b.text;
  let joiner = '; ';
  if (w0 && w0.norm === 'then') {
    joiner = ', and ';
    rest = 'then' + b.text.slice(w0.end);
  } else if (w0 && CONJ.has(w0.norm)) {
    // "But she …": the author's commonest mark before that word.
    const comma = m.profile.joins[`, ${w0.norm}`] ?? 0;
    const semi = m.profile.joins[`; ${w0.norm}`] ?? 0;
    joiner = semi > comma ? '; ' : ', ';
    rest = w0.norm + b.text.slice(w0.end);
  } else {
    const aFirst = a.toks.find((t) => t.kind === 'word');
    const bTag1 = b.tags[b.toks.indexOf(bWords[1] ?? b.toks[0]!)] ?? '';
    if (aFirst && w0 && aFirst.norm === w0.norm && SUBJECTS.has(w0.norm) && /^(VB|BED|HVD|DOD|MD)/.test(bTag1)) {
      // "I went in. I bought bread." → "I went in, and bought bread."
      joiner = ', and ';
      rest = b.text.slice(bWords[1]!.start);
    } else {
      const andComma = m.profile.joins[', and'] ?? 0;
      const semicolon = (m.profile.joins['; …'] ?? 0) + (m.profile.joins['; and'] ?? 0);
      joiner = a.toks.some((t) => t.norm === ',') || semicolon > andComma ? '; ' : ', and ';
      rest = lowerFirst(b, w0);
    }
  }
  return first + joiner + rest;
}

function lowerFirst(b: { text: string; toks: Token[]; tags: string[] }, w0: Token | undefined): string {
  if (!w0) return b.text;
  const tag = b.tags[b.toks.indexOf(w0)] ?? '';
  if (w0.text === 'I' || w0.text.startsWith('I’') || w0.text.startsWith("I'") || isProperTag(tag)) return b.text;
  return b.text.slice(0, w0.start) + w0.text[0]!.toLowerCase() + b.text.slice(w0.start + 1);
}

function joinShortRuns(m: AuthorModel, work: SentenceWork[], blocks: DocBlock[]): Advice[] {
  const out: Advice[] = [];
  const d = m.profile.sentenceLength.narration;
  const short = m.author.short;
  let i = 0;
  while (i < work.length) {
    const s = work[i]!;
    // A question or an exclamation ends where it ends.
    const statement = (x: SentenceWork) => !/[?!]["”’)]*\s*$/.test(blocks[x.block]!.text.slice(x.start, x.end));
    if (s.spoken || s.words >= d.p25 || !statement(s)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < work.length && work[j + 1]!.block === s.block && !work[j + 1]!.spoken && work[j + 1]!.words < d.p25 && statement(work[j]!)) j++;
    if (!statement(work[j]!) && j > i) j--;
    const run = work.slice(i, j + 1);
    if (run.length >= 2) {
      // Join pairwise until a sentence reaches the author's middling length.
      const text = blocks[s.block]!.text;
      const pieces: string[] = [];
      let cur = { text: text.slice(run[0]!.start, run[0]!.end), toks: run[0]!.toks.slice(run[0]!.from, run[0]!.to), tags: run[0]!.tags, words: run[0]!.words };
      const rebase = (x: SentenceWork) => {
        const t = text.slice(x.start, x.end);
        return { text: t, toks: tokenize(t), tags: x.tags, words: x.words };
      };
      cur = rebase(run[0]!);
      let inPiece = 1;
      for (const nx of run.slice(1)) {
        const n = rebase(nx);
        if (cur.words >= d.p50 || inPiece >= 3) {
          inPiece = 1;
          pieces.push(cur.text);
          cur = n;
          continue;
        }
        inPiece++;
        const joined = joinSentences(m, cur, n);
        const jt = tokenize(joined);
        cur = { text: joined, toks: jt, tags: m.tagger.tagTokens(jt), words: cur.words + n.words };
      }
      pieces.push(cur.text);
      const replacement = pieces.join(' ');
      const lengths = run.map((r) => r.words).join(', ');
      const examples = m.similarSentences(replacement, 2, { minWords: Math.round(d.p50) });
      out.push({
        id: id('join', text.slice(run[0]!.start, run[run.length - 1]!.end)),
        kind: 'sentence',
        severity: 'consider',
        block: s.block,
        start: run[0]!.start,
        end: run[run.length - 1]!.end,
        title: `${run.length} short sentences in a row`,
        message: `${cap(short)} would have joined these: ${pronounsOf(m.author).possessive} narration moves in longer sentences, joined most often by ${topJoins(m)}.`,
        why: `Yours run ${lengths} words. Half of ${short}’s narrative sentences are ${Math.round(d.p50)} words or more; a quarter are ${Math.round(d.p75)} or more. ${cap(pronounsOf(m.author).subject)} joins clauses with “, and” ${(m.profile.joins[', and'] ?? 0).toLocaleString()} times and “; and” ${(m.profile.joins['; and'] ?? 0).toLocaleString()} times.`,
        replacements: [{ block: s.block, start: run[0]!.start, end: run[run.length - 1]!.end, text: replacement }],
        examples,
      });
    }
    i = j + 1;
  }
  return out;
}

interface Tally {
  totalWords: number;
  knownWords: number;
  nameWords: number;
  narrWords: number;
  spokenWords: number;
  syll: number;
  lyAdverbs: number;
  passives: number;
  punct: Record<string, number>;
  counts: Map<string, number>;
  sentences: SentenceWork[];
  paragraphs: number;
  chapters: { title: string; words: number }[];
  narrParagraphWords: number[];
  flagged: number;
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

function reportOf(m: AuthorModel, t: Tally): Report {
  const P = m.profile;
  const short = m.author.short;
  const n = Math.max(1, t.totalWords);
  const sents = t.sentences;
  const narr = sents.filter((s) => !s.spoken).map((s) => s.words);
  const nSent = Math.max(1, sents.length);
  const measures: Measure[] = [];
  const authorWords = (t.knownWords + 0) / Math.max(1, t.totalWords - t.nameWords);
  measures.push({
    label: `Words ${short} used`,
    yours: Math.round(authorWords * 1000) / 10,
    author: 100,
    unit: '%',
    score: clamp(((authorWords - 0.85) / 0.15) * 100),
    explain: `Of your words (names aside), the share ${short} also wrote somewhere in ${pronounsOf(m.author).possessive} works.`,
  });
  if (narr.length) {
    const med = median(narr);
    measures.push({
      label: 'Narrative sentence length',
      yours: med,
      author: P.sentenceLength.narration.p50,
      unit: 'words (median)',
      score: clamp((Math.min(med, P.sentenceLength.narration.p50 * 1.6) / P.sentenceLength.narration.p50) * 100),
      explain: `Half of ${short}’s sentences of narration run ${P.sentenceLength.narration.p50} words or more; a tenth run ${P.sentenceLength.narration.p90} or more.`,
    });
  }
  const semis = t.punct[';']! / nSent;
  measures.push({
    label: 'Semicolons per sentence',
    yours: round2(semis),
    author: round2(P.punctuationPerSentence[';']!),
    unit: '',
    score: clamp((Math.min(semis, P.punctuationPerSentence[';']!) / P.punctuationPerSentence[';']!) * 100),
    explain: `${cap(short)} uses ${perSentence(P.punctuationPerSentence[';'] ?? 0, 'semicolon')}.`,
  });
  const commas = t.punct[',']! / nSent;
  measures.push({
    label: 'Commas per sentence',
    yours: round2(commas),
    author: round2(P.punctuationPerSentence[',']!),
    unit: '',
    score: clamp((Math.min(commas, P.punctuationPerSentence[',']!) / P.punctuationPerSentence[',']!) * 100),
    explain: `${cap(pronounsOf(m.author).possessive)} sentences carry their qualifications in commas: ${Object.keys(P.joins).filter((j) => j.startsWith(',')).slice(0, 3).map((j) => `“${j}”`).join(', ')}.`,
  });
  const ly = (t.lyAdverbs / n) * 1000;
  measures.push({
    label: '-ly adverbs per 1,000 words',
    yours: round1(ly),
    author: round1(P.per1000.lyAdverbs),
    unit: '',
    score: clamp(100 - Math.max(0, ly - P.per1000.lyAdverbs) * 6),
    explain: `${cap(short)} writes about ${round1(P.per1000.lyAdverbs)} -ly adverbs (“quickly”, “really”) in every 1,000 words.`,
  });
  const contractedNarr = sents
    .filter((s) => !s.spoken)
    .reduce((a, s) => a + s.toks.slice(s.from, s.to).filter((x) => x.kind === 'word' && !x.quoted && CONTRACTIONS[x.norm]).length, 0);
  measures.push({
    label: 'Contractions in narration per 1,000 words',
    yours: round1((contractedNarr / Math.max(1, t.narrWords)) * 1000),
    author: round1((Object.values(P.contractions).reduce((a, c) => a + c.narr, 0) / P.narrationWords) * 1000),
    unit: '',
    score: clamp(100 - (contractedNarr / Math.max(1, t.narrWords)) * 1000 * 8),
    explain: contractionNote(short, (Object.values(P.contractions).reduce((a, c) => a + c.narr, 0) / Math.max(1, P.narrationWords)) * 1000),
  });
  const spokenShare = t.spokenWords / n;
  measures.push({
    label: 'Words in speech',
    yours: Math.round(spokenShare * 100),
    author: Math.round((P.dialogueWords / P.words) * 100),
    unit: '%',
    score: 100,
    explain: `How much of the text is spoken, inside quotation marks. ${Math.round((P.dialogueWords / P.words) * 100)}% of ${short}’s words are spoken.`,
  });
  if (t.narrParagraphWords.length) {
    const med = median(t.narrParagraphWords);
    measures.push({
      label: 'Narrative paragraph length',
      yours: med,
      author: P.paragraphWords.p50,
      unit: 'words (median)',
      score: clamp((Math.min(med, P.paragraphWords.p50) / P.paragraphWords.p50) * 100),
      explain: `${short}’s paragraphs of narration hold a median of ${P.paragraphWords.p50} words.`,
    });
  }
  const fk = (words: number, sentences: number, syl: number) => 0.39 * (words / sentences) + 11.8 * (syl / words) - 15.59;
  const yoursFk = fk(n, nSent, t.syll);
  const authorFk = fk(P.words, P.sentences, P.syllablesPerWord.mean * P.words);
  measures.push({
    label: 'Flesch–Kincaid grade',
    yours: round1(yoursFk),
    author: round1(authorFk),
    unit: '',
    score: clamp(100 - Math.abs(yoursFk - authorFk) * 10),
    explain: `A readability measure (1975) from sentence length and syllables; ${short}’s sentences put ${pronounsOf(m.author).object} at about grade ${Math.round(authorFk)}.`,
  });

  // Burrows's Delta over the author's most frequent words.
  const mfw = P.mfw;
  const z = mfw.words.map((w, i) => (((t.counts.get(w) ?? 0) / n) * 1000 - mfw.mean[i]!) / mfw.sd[i]!);
  const delta = z.reduce((a, b) => a + Math.abs(b), 0) / z.length;
  const enough = t.totalWords >= 300;
  const deltaScore = clamp(100 - ((delta - mfw.chunkDelta.p50) / (2.2 - mfw.chunkDelta.p50)) * 100);
  if (enough)
    measures.push({
      label: 'Function-word habits (Burrows’s Delta)',
      yours: round2(delta),
      author: round2(mfw.chunkDelta.p50),
      unit: '',
      score: deltaScore,
      explain: `How far your rates of ${short}’s ${mfw.words.length} commonest words (${mfw.words.slice(0, 5).join(', ')}…) are from ${pronounsOf(m.author).possessivePronoun}, in standard deviations; ${pronounsOf(m.author).possessive} own 2,000-word stretches score ${round2(mfw.chunkDelta.p10)}–${round2(mfw.chunkDelta.p90)}.`,
    });
  const rates = mfw.words.map((w, i) => ({ word: w, yours: round1(((t.counts.get(w) ?? 0) / n) * 1000), author: round1(mfw.mean[i]!), z: z[i]! }));
  const overused = [...rates].filter((r) => r.z > 2 && r.yours > 1).sort((a, b) => b.z - a.z).slice(0, 6).map(({ word, yours, author }) => ({ word, yours, author }));
  // Words of yours the author hardly used at all, used often.
  for (const [w, c] of t.counts) {
    const rate = (c / n) * 1000;
    const theirs = (m.rate(w) / 1e6) * 1000;
    if (c >= 3 && rate > 4 && theirs < rate / 8 && !overused.some((o) => o.word === w) && m.word(w)) overused.push({ word: w, yours: round1(rate), author: round1(theirs) });
  }
  const underused = enough
    ? [...rates]
        .filter((r) => r.z < -1.5 && !STOP.has(r.word) && r.author > 1.5)
        .sort((a, b) => a.z - b.z)
        .slice(0, 6)
        .map(({ word, yours, author }) => ({ word, yours, author, example: m.search([word], { limit: 1, minWords: 8, maxWords: 30 })[0] }))
    : [];
  const weights = measures.filter((x) => x.label !== 'Words in speech');
  const score = clamp(weights.reduce((a, b) => a + b.score, 0) / Math.max(1, weights.length));
  return {
    words: t.totalWords,
    sentences: sents.length,
    paragraphs: t.paragraphs,
    chapters: t.chapters,
    authorWords,
    flagged: t.flagged,
    measures,
    delta: enough ? { value: round2(delta), authorTypical: [round2(mfw.chunkDelta.p10), round2(mfw.chunkDelta.p90)], enough } : null,
    overused: overused.slice(0, 8),
    underused,
    score,
  };
}

function documentAdvice(m: AuthorModel, r: Report, narrParagraphWords: number[], chapters: { title: string; words: number }[]): Advice[] {
  const out: Advice[] = [];
  const short = m.author.short;
  const P = m.profile;
  if (narrParagraphWords.length >= 3 && median(narrParagraphWords) < P.paragraphWords.p25) {
    out.push({
      id: id('paragraphs', narrParagraphWords.join(',')),
      kind: 'paragraph',
      severity: 'note',
      block: 0,
      start: 0,
      end: 0,
      title: 'Short paragraphs of narration',
      message: `${cap(short)} gathers narration into fuller paragraphs, so an action and what follows from it stand together.`,
      why: `Your narrative paragraphs run a median ${median(narrParagraphWords)} words; ${short}’s ${P.paragraphWords.p50} (a quarter of ${pronounsOf(m.author).possessivePronoun} are under ${P.paragraphWords.p25}).`,
      examples: [],
    });
  }
  for (const o of r.overused.slice(0, 4)) {
    out.push({
      id: id('over', o.word, Math.round(o.yours)),
      kind: 'document',
      severity: 'note',
      block: 0,
      start: 0,
      end: 0,
      title: `You lean on “${o.word}”`,
      message: `You use “${o.word}” ${o.yours} times in a thousand words; ${short}, ${o.author}.`,
      why: `Rates per 1,000 words over all ${short}’s works.`,
      examples: m.search([o.word], { limit: 1, minWords: 8, maxWords: 35 }),
    });
  }
  for (const u of r.underused.slice(0, 3)) {
    out.push({
      id: id('under', u.word),
      kind: 'document',
      severity: 'note',
      block: 0,
      start: 0,
      end: 0,
      title: `${short} would say “${u.word}” more`,
      message: `“${u.word}” comes ${u.author} times in a thousand of ${short}’s words, ${u.yours} in yours.`,
      why: `One of the ${P.mfw.words.length} words whose rates tell ${pronounsOf(m.author).possessive} style from another’s (Burrows’s Delta).`,
      examples: u.example ? [u.example] : [],
    });
  }
  if (chapters.length > 1) {
    const { mean: typical, count, unit } = chapterLength(m);
    for (const c of chapters)
      if (c.words > typical * 4)
        out.push({
          id: id('chapter', c.title),
          kind: 'chapter',
          severity: 'note',
          block: 0,
          start: 0,
          end: 0,
          title: `A long chapter: ${c.title || 'the first'}`,
          message: `${cap(short)}’s ${unit} average some ${typical.toLocaleString()} words; this one runs ${c.words.toLocaleString()}.`,
          why: `The mean over all ${count.toLocaleString()} of ${short}’s ${unit}.`,
          examples: [],
        });
  }
  return out;
}

/** How often a mark comes, said as a reader counts it: “one semicolon in about 25 sentences”, “about 2 commas a sentence”. */
function perSentence(rate: number, mark: string): string {
  if (rate <= 0) return `no ${mark}s`;
  if (rate >= 0.9) return `about ${round1(rate)} ${mark}s a sentence`;
  const n = Math.round(1 / rate);
  return n <= 1 ? `about one ${mark} a sentence` : `one ${mark} in about ${n} sentences`;
}

/** What the author does with contractions outside speech, from the rate per 1,000 words of narration. */
function contractionNote(short: string, rate: number): string {
  if (rate >= 2) return `Outside speech ${short} contracts freely: about ${round1(rate)} contractions (“don’t”, “it’s”) in every 1,000 words.`;
  return `Outside speech ${short} writes “do not”, “it is”, “I am”${rate >= 0.5 ? `: about ${round1(rate)} contractions in every 1,000 words` : ''}.`;
}

/** The author's two commonest ways of joining clauses, quoted. */
function topJoins(m: AuthorModel): string {
  const top = Object.entries(m.profile.joins).filter(([j]) => !j.includes('…')).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([j]) => `“${j.trim()}”`);
  return top.length ? top.join(' and ') : 'commas';
}

/** The mean length of the author's chapters (a speech, a scene, a book of the Bible), counted once per model. */
const chapterLengths = new WeakMap<AuthorModel, { mean: number; count: number; unit: string }>();
function chapterLength(m: AuthorModel): { mean: number; count: number; unit: string } {
  let c = chapterLengths.get(m);
  if (!c) {
    const r = m.db.prepare('SELECT COUNT(*) AS n FROM chapters').get() as { n: number };
    const count = Math.max(1, r.n);
    const unit = m.author.citeStyle === 'speech' ? 'speeches' : m.author.citeStyle === 'play' ? 'scenes' : 'chapters';
    c = { mean: Math.round(m.profile.words / count / 100) * 100, count, unit };
    chapterLengths.set(m, c);
  }
  return c;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
