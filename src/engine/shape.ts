// A sketch of a student's sentence in a voice: the voice's own real sentence that is built most like it. Three
// measures are added. Half the score is the word classes in order (noun, verb, adjective…), compared by edit
// distance; a fifth is the punctuation in order; the rest is meaning, the cosine of the two sentence vectors in the
// voice's own word space. Nothing is generated: every sketch is a sentence the voice wrote, cited.
//
// A salutation ("Dear Mom and Dad,") is matched only to a salutation, and a sign-off only to a sign-off. Where no
// sentence scores SKETCH_THRESHOLD or more, the sketch is null and the page shows nothing.

import { packVector, shapeSimilarity, skeletonsOf, type Pack, type ShapeEntry } from './pack.ts';

/** The weights of the three measures. */
export const WEIGHTS = { tags: 0.5, punct: 0.2, meaning: 0.3 } as const;

/** Below this score no sentence is shown. */
export const SKETCH_THRESHOLD = 0.5;

/** How far a candidate's skeleton may differ in length from the sentence's, as a share of the longer. */
const LENGTH_BAND = 0.5;

/** Lines that open or close a letter rather than say something. */
export type LineClass = 'salutation' | 'signoff' | 'sentence';

const SALUTATION = /^(dear|my dear|dearest|to whom it may concern|hey|hi|hello|greetings)\b[^!?.\n]{0,40}[,:!]?$/i;
const SIGN_OFF = /^(love|lots of love|all my love|yours|yours truly|yours sincerely|sincerely|best|best wishes|all the best|warmly|regards|kind regards|with love|affectionately|cheers|your friend|your son|your daughter|ever yours|your (affectionate|loving|faithful|obedient|humble|devoted)\b)[^.!?]{0,50}[.,]?$/i;

const wordCount = (s: string) => (s.match(/[\p{L}\d][\p{L}\d'’]*/gu) ?? []).length;

/** Whether a line is a salutation, a sign-off, or an ordinary sentence. Quotation marks are ignored. */
export function lineClass(text: string): LineClass {
  const t = text.trim().replace(/^[“"‘']+|[”"’']+$/g, '').trim();
  const n = wordCount(t);
  if (n <= 8 && SALUTATION.test(t) && !/^dear diary/i.test(t)) return 'salutation';
  if (n <= 10 && SIGN_OFF.test(t)) return 'signoff';
  return 'sentence';
}

/** Levenshtein distance between two strings, one row at a time. */
let rowA = new Int32Array(64);
let rowB = new Int32Array(64);

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (rowA.length <= b.length) [rowA, rowB] = [new Int32Array(b.length * 2 + 1), new Int32Array(b.length * 2 + 1)];
  let prev = rowA;
  let cur = rowB;
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/** 1 for the same string, 0 for nothing in common: one minus the edit distance over the longer length. */
export function editSimilarity(a: string, b: string): number {
  const n = Math.max(a.length, b.length);
  return n ? 1 - editDistance(a, b) / n : 1;
}

export interface ShapeMatch {
  entry: ShapeEntry;
  score: number;
  /** Each measure, 0 to 1. */
  parts: { tags: number; punct: number; meaning: number };
}

export interface NearestOptions {
  /** The sentence's skeletons, when the caller has them already. */
  skeleton?: { tags: string; punct: string };
  /** The lowest score shown (default SKETCH_THRESHOLD). */
  threshold?: number;
}

/**
 * The voice's sentence built most like this one, or null where none reaches the threshold. Candidates are taken
 * in order of the best score they could reach, so the edit distance is worked out only for those that could win.
 */
export function nearest(sentence: string, pack: Pack, opts: NearestOptions = {}): ShapeMatch | null {
  const text = sentence.trim();
  if (!text || !/\p{L}/u.test(text)) return null;
  const threshold = opts.threshold ?? SKETCH_THRESHOLD;
  const sk = opts.skeleton ?? skeletonsOf(text);
  const cls = lineClass(text);
  const v = packVector(pack, text);
  const L = sk.tags.length;
  const hist = histogramOf(sk.tags);
  const hists = histogramsOf(pack);

  const cands: { i: number; bound: number; punct: number; meaning: number }[] = [];
  for (let i = 0; i < pack.shape.length; i++) {
    const e = pack.shape[i]!;
    const l = e.tags.length;
    const longer = Math.max(L, l);
    if (longer && Math.abs(L - l) / longer > LENGTH_BAND) continue;
    if (lineClassOf(pack, i) !== cls) continue;
    // Each symbol one string has more of than the other costs an edit at least, so the counts bound the similarity.
    let more = 0;
    let fewer = 0;
    for (let k = 0, o = i * SYMBOLS; k < SYMBOLS; k++) {
      const d = hist[k]! - hists[o + k]!;
      if (d > 0) more += d;
      else fewer -= d;
    }
    const tagBound = longer ? 1 - Math.max(more, fewer) / longer : 1;
    const punct = editSimilarity(sk.punct, e.punct);
    const meaning = v ? Math.max(0, shapeSimilarity(pack, v, i)) : 0;
    const bound = WEIGHTS.tags * tagBound + WEIGHTS.punct * punct + WEIGHTS.meaning * meaning;
    if (bound >= threshold) cands.push({ i, bound, punct, meaning });
  }
  cands.sort((a, b) => b.bound - a.bound);

  let best: ShapeMatch | null = null;
  for (const c of cands) {
    if (best && c.bound <= best.score) break;
    const e = pack.shape[c.i]!;
    const tags = editSimilarity(sk.tags, e.tags);
    const score = WEIGHTS.tags * tags + WEIGHTS.punct * c.punct + WEIGHTS.meaning * c.meaning;
    if (score >= threshold && (!best || score > best.score)) best = { entry: e, score, parts: { tags, punct: c.punct, meaning: c.meaning } };
  }
  return best;
}

// Symbol counts of the tag skeletons: every letter and mark gets a slot, anything else shares the last.
const ALPHABET = 'NVMJRPDICSWTUEX,;:.!?()—…\'"';
const SYMBOLS = ALPHABET.length + 1;
const slot = new Map([...ALPHABET].map((c, i) => [c, i]));

function histogramOf(tags: string): Uint16Array {
  const h = new Uint16Array(SYMBOLS);
  for (const c of tags) h[slot.get(c) ?? SYMBOLS - 1]!++;
  return h;
}

const histograms = new WeakMap<Pack, Uint16Array>();

function histogramsOf(pack: Pack): Uint16Array {
  let h = histograms.get(pack);
  if (!h) {
    h = new Uint16Array(pack.shape.length * SYMBOLS);
    pack.shape.forEach((e, i) => h!.set(histogramOf(e.tags), i * SYMBOLS));
    histograms.set(pack, h);
  }
  return h;
}

const classes = new WeakMap<Pack, LineClass[]>();

/** Each shape entry's line class, worked out once a pack. */
function lineClassOf(pack: Pack, i: number): LineClass {
  let a = classes.get(pack);
  if (!a) {
    a = pack.shape.map((e) => lineClass(e.text));
    classes.set(pack, a);
  }
  return a[i]!;
}
