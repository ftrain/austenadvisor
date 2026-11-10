// Which voice a passage sounds like, from the packs alone: no whole model is needed. Two measures are added. The
// first is the words: the mean log-probability of each word under each voice's word counts (pack.ts,
// unigramScores). The second is the build: the mean log-probability of the passage's word classes, three at a
// time, under each voice's sentences in its shape index. Words tell Obama from the King James Bible; the build
// helps tell Austen from Eliot, who share most of their words.
//
// From the scores come the three voices the picker suggests for a piece: the best voice for its kind, the voice it
// sounds like, and a stretch, the voice furthest from it that still suits the kind.

import { skeletonsOf, unigramScores, type Pack } from './pack.ts';
import type { Kind } from './structure.ts';

/** How much the word-class trigrams count beside the words. Tuned on held-out corpus sentences (test/read.test.ts). */
export const TAG_WEIGHT = 1.5;

/** A voice's word-class trigram counts, from its shape index. */
interface TagModel {
  tri: Map<string, number>;
  bi: Map<string, number>;
  uni: Map<string, number>;
  /** Count of each two-letter context, for the trigram's denominator. */
  ctx2: Map<string, number>;
  /** Count of each one-letter context, for the bigram's denominator. */
  ctx1: Map<string, number>;
  n: number;
}

const tagModels = new WeakMap<Pack, TagModel>();

const BOS = '^';
const EOS = '$';

/** The skeleton as a list of symbols, with a start and an end. */
const symbols = (tags: string): string[] => [BOS, BOS, ...tags.replace(/\s+/g, ''), EOS];

function bump(m: Map<string, number>, k: string, by = 1): void {
  m.set(k, (m.get(k) ?? 0) + by);
}

function tagModelOf(p: Pack): TagModel {
  let t = tagModels.get(p);
  if (t) return t;
  t = { tri: new Map(), bi: new Map(), uni: new Map(), ctx2: new Map(), ctx1: new Map(), n: 0 };
  for (const e of p.shape) addSkeleton(t, e.tags, 1);
  tagModels.set(p, t);
  return t;
}

function addSkeleton(t: TagModel, tags: string, by: number): void {
  const s = symbols(tags);
  for (let i = 2; i < s.length; i++) {
    const [a, b, c] = [s[i - 2]!, s[i - 1]!, s[i]!];
    bump(t.tri, a + b + c, by);
    bump(t.ctx2, a + b, by);
    bump(t.bi, b + c, by);
    bump(t.ctx1, b, by);
    bump(t.uni, c, by);
    t.n += by;
  }
}

/** Number of distinct word-class symbols, for the uniform floor. */
const SYMBOLS = 24;

/** Mean log-probability of each symbol of a skeleton, interpolating trigram, bigram and unigram estimates. */
export function tagScore(p: Pack, tags: string): number {
  const t = tagModelOf(p);
  const s = symbols(tags);
  if (s.length <= 3) return 0;
  let sum = 0;
  for (let i = 2; i < s.length; i++) {
    const [a, b, c] = [s[i - 2]!, s[i - 1]!, s[i]!];
    const c2 = t.ctx2.get(a + b) ?? 0;
    const c1 = t.ctx1.get(b) ?? 0;
    const p3 = c2 ? (t.tri.get(a + b + c) ?? 0) / c2 : 0;
    const p2 = c1 ? (t.bi.get(b + c) ?? 0) / c1 : 0;
    const p1 = t.n ? (t.uni.get(c) ?? 0) / t.n : 0;
    sum += Math.log(0.6 * p3 + 0.25 * p2 + 0.1 * p1 + 0.05 / SYMBOLS);
  }
  return sum / (s.length - 2);
}

export interface VoiceScore {
  voice: string;
  /** The two measures added; higher is nearer. */
  score: number;
  words: number;
  build: number;
}

export interface ScoreOptions {
  /** A corpus sentence's own voice: its words are taken off that voice's counts so it is scored fairly. */
  leaveOut?: string;
  /** The passage's word-class skeleton, when the caller has it already. */
  tags?: string;
}

/** Every pack's score for a passage, nearest first. */
export function voiceScores(packs: Pack[], text: string, opts: ScoreOptions = {}): VoiceScore[] {
  if (!packs.length) return [];
  const words = new Map(unigramScores(packs, text, opts.leaveOut).map((s) => [s.voice, s.score]));
  const tags = opts.tags ?? skeletonsOf(text).tags;
  return packs
    .map((p) => {
      const w = words.get(p.id) ?? 0;
      const b = tagScore(p, tags);
      return { voice: p.id, score: w + TAG_WEIGHT * b, words: w, build: b };
    })
    .sort((a, b) => b.score - a.score);
}

/** The voice a passage sounds most like, or null where there are no packs or no words. */
export function soundsLike(packs: Pack[], text: string, opts: ScoreOptions = {}): string | null {
  if (!/[\p{L}]/u.test(text)) return null;
  return voiceScores(packs, text, opts)[0]?.voice ?? null;
}

/** What suggest needs to know of each voice. */
export interface VoiceInfo {
  id: string;
  goodFor: Kind[];
}

/** Kinds near enough that a voice good for one suits the other, nearest first. */
const RELATED: Record<Kind, Kind[]> = {
  argument: ['essay', 'speech', 'review'],
  essay: ['argument', 'review'],
  review: ['essay', 'argument'],
  speech: ['argument', 'essay'],
  story: ['letter'],
  letter: ['story'],
};

export interface Suggestion {
  /** The voice best suited to the piece's kind. */
  kind: string | null;
  /** The voice the piece already sounds like. */
  soundsLike: string | null;
  /** The voice furthest from the piece that still suits its kind. */
  stretch: string | null;
}

/**
 * Three voices for a piece, each different where there are voices enough. The kind's voice is one that names the
 * kind first in its goodFor (else anywhere, else a related kind), nearest the piece among those; the stretch is the
 * furthest voice that names the kind, else a related kind, else the furthest of all.
 */
export function suggest(packs: Pack[], voices: VoiceInfo[], kind: Kind, text: string): Suggestion {
  const ids = new Set(packs.map((p) => p.id));
  const usable = voices.filter((v) => ids.has(v.id));
  const scores = /[\p{L}]/u.test(text) ? voiceScores(packs.filter((p) => usable.some((v) => v.id === p.id)), text) : [];
  // Nearest first; with no text, the order the voices were given.
  const order = scores.length ? scores.map((s) => s.voice) : usable.map((v) => v.id);
  const info = new Map(usable.map((v) => [v.id, v]));
  const like = scores[0]?.voice ?? null;
  const taken = new Set<string>(like ? [like] : []);
  const pick = (cands: string[]) => cands.find((v) => !taken.has(v)) ?? null;

  const suits = (v: string) => info.get(v)!.goodFor.includes(kind);
  const near = (v: string) => RELATED[kind].some((k) => info.get(v)!.goodFor.includes(k));
  const forKind = pick(order.filter((v) => info.get(v)!.goodFor[0] === kind)) ?? pick(order.filter(suits)) ?? pick(order.filter(near)) ?? pick(order);
  if (forKind) taken.add(forKind);

  const far = [...order].reverse();
  const stretch = pick(far.filter(suits)) ?? pick(far.filter(near)) ?? pick(far);
  return { kind: forKind, soundsLike: like, stretch };
}
