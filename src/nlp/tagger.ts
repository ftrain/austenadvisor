// Parts of speech by an averaged perceptron (Rosenblatt 1958; Collins 2002; after Honnibal 2013), trained on the
// Brown Corpus (Francis & Kučera, 1961–1979) and its tags. The Brown tagset is kept, cleaned of its title and
// headline marks, since it tells "was" (BEDZ) from "were" (BED) and "didn't" (DOD*), which a style of the past
// turns on.

import { normWord, type Token } from './tokenize.ts';

export interface TaggerModel {
  weights: Record<string, Record<string, number>>;
  tagdict: Record<string, string>;
  classes: string[];
}

export type Tagged = [word: string, tag: string];

const START = ['-START-', '-START2-'];
const END = ['-END-', '-END2-'];

/** A Brown tag as this engine uses it: upper case, no title (-TL), headline (-HL) or cited (-NC) mark, FW- foreign. */
export function cleanBrownTag(t: string): string {
  let tag = t.toUpperCase();
  if (tag.startsWith('FW-')) return 'FW';
  tag = tag.replace(/-(TL|HL|NC)/g, '');
  if (tag === '``' || tag === "''") return '"';
  if (tag === '--') return '—';
  if (tag === '(' || tag === ')' || tag === '.' || tag === ',' || tag === ':' || tag === "'") return tag;
  return tag || 'NIL';
}

/** Brown's words and tags, a sentence a line, from NLTK's brown.zip. */
export function readBrown(files: Map<string, Buffer>): Tagged[][] {
  const out: Tagged[][] = [];
  for (const [name, buf] of files) {
    if (!/brown\/c[a-r]\d\d$/.test(name)) continue;
    for (const line of buf.toString('utf8').split('\n')) {
      const l = line.trim();
      if (!l) continue;
      const sent: Tagged[] = [];
      for (const pair of l.split(/\s+/)) {
        const k = pair.lastIndexOf('/');
        if (k <= 0) continue;
        let w = pair.slice(0, k);
        const tag = cleanBrownTag(pair.slice(k + 1));
        if (w === '``' || w === "''") w = '"';
        if (w === '--') w = '—';
        sent.push([w, tag]);
      }
      if (sent.length) out.push(sent);
    }
  }
  return out;
}

function shape(w: string): string {
  if (/^\d/.test(w)) return 'd';
  if (/^\p{Lu}+$/u.test(w) && w.length > 1) return 'XX';
  if (/^\p{Lu}/u.test(w)) return 'Xx';
  if (/^\p{Ll}/u.test(w)) return 'x';
  return 'p';
}

function normalize(w: string): string {
  if (/^\d{4}$/.test(w)) return '!YEAR';
  if (/^\d/.test(w)) return '!DIGITS';
  return normWord(w);
}

function features(i: number, word: string, raw: string, ctx: string[], raws: string[], prev: string, prev2: string): string[] {
  // ctx is padded: ctx[i + 2] is the word itself.
  const j = i + 2;
  const f = [
    'b',
    `s3 ${word.slice(-3)}`,
    `s2 ${word.slice(-2)}`,
    `p1 ${word[0]}`,
    `w ${word}`,
    `sh ${shape(raw)}`,
    `t ${prev}`,
    `t2 ${prev}|${prev2}`,
    `tw ${prev}|${word}`,
    `w-1 ${ctx[j - 1]}`,
    `s-1 ${ctx[j - 1]!.slice(-3)}`,
    `w-2 ${ctx[j - 2]}`,
    `w+1 ${ctx[j + 1]}`,
    `s+1 ${ctx[j + 1]!.slice(-3)}`,
    `w+2 ${ctx[j + 2]}`,
    `sh+1 ${shape(raws[j + 1] ?? '')}`,
  ];
  if (word.includes('-')) f.push('hy');
  if (word.includes("'")) f.push(`ap ${word.slice(word.indexOf("'"))}`);
  return f;
}

export class Tagger {
  weights: Map<string, Map<string, number>> = new Map();
  tagdict: Map<string, string> = new Map();
  classes: string[] = [];

  static from(m: TaggerModel): Tagger {
    const t = new Tagger();
    for (const [f, ws] of Object.entries(m.weights)) t.weights.set(f, new Map(Object.entries(ws)));
    t.tagdict = new Map(Object.entries(m.tagdict));
    t.classes = m.classes;
    return t;
  }

  toJSON(): TaggerModel {
    const weights: Record<string, Record<string, number>> = {};
    for (const [f, ws] of this.weights) {
      const o: Record<string, number> = {};
      for (const [c, w] of ws) if (Math.abs(w) >= 0.001) o[c] = Math.round(w * 1000) / 1000;
      if (Object.keys(o).length) weights[f] = o;
    }
    return { weights, tagdict: Object.fromEntries(this.tagdict), classes: this.classes };
  }

  private predict(feats: string[]): string {
    const scores = new Map<string, number>();
    for (const f of feats) {
      const ws = this.weights.get(f);
      if (!ws) continue;
      for (const [c, w] of ws) scores.set(c, (scores.get(c) ?? 0) + w);
    }
    let best = this.classes[0] ?? 'NN';
    let bestScore = -Infinity;
    for (const [c, s] of scores) if (s > bestScore || (s === bestScore && c < best)) [best, bestScore] = [c, s];
    return best;
  }

  /** Tags for a sentence's words (as written). */
  tag(words: string[]): string[] {
    const norm = words.map(normalize);
    const ctx = [...START, ...norm, ...END];
    const raws = ['', '', ...words, '', ''];
    let [prev, prev2] = START as [string, string];
    const out: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = norm[i]!;
      const tag = this.tagdict.get(w) ?? this.predict(features(i, w, words[i]!, ctx, raws, prev, prev2));
      out.push(tag);
      prev2 = prev;
      prev = tag;
    }
    return out;
  }

  /** A paragraph's tokens tagged, a sentence at a time. */
  tagTokens(tokens: Token[], from = 0, to = tokens.length): string[] {
    return this.tag(tokens.slice(from, to).map((t) => (t.kind === 'punct' ? t.norm : t.text)));
  }

  /** Averaged perceptron training: iterations over the sentences in a shuffled order. */
  static train(sents: Tagged[][], iterations = 5, log: (s: string) => void = () => {}): Tagger {
    const t = new Tagger();
    const counts = new Map<string, Map<string, number>>();
    const classes = new Set<string>();
    for (const s of sents)
      for (const [w, tag] of s) {
        classes.add(tag);
        const n = normalize(w);
        let m = counts.get(n);
        if (!m) counts.set(n, (m = new Map()));
        m.set(tag, (m.get(tag) ?? 0) + 1);
      }
    t.classes = [...classes].sort();
    // Frequent words that are (nearly) always one tag are looked up, not guessed.
    for (const [w, m] of counts) {
      let n = 0;
      let best = '';
      let bestN = 0;
      for (const [tag, c] of m) {
        n += c;
        if (c > bestN) [best, bestN] = [tag, c];
      }
      if (n >= 20 && bestN / n >= 0.97) t.tagdict.set(w, best);
    }
    const totals = new Map<string, number>();
    const stamps = new Map<string, number>();
    let instance = 0;
    const upd = (f: string, c: string, v: number) => {
      const key = `${f}\u0000${c}`;
      let ws = t.weights.get(f);
      if (!ws) t.weights.set(f, (ws = new Map()));
      const w = ws.get(c) ?? 0;
      totals.set(key, (totals.get(key) ?? 0) + (instance - (stamps.get(key) ?? 0)) * w);
      stamps.set(key, instance);
      ws.set(c, w + v);
    };
    const order = sents.map((_, i) => i);
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let it = 0; it < iterations; it++) {
      let right = 0;
      let all = 0;
      for (const si of order) {
        const s = sents[si]!;
        const words = s.map((x) => x[0]);
        const norm = words.map(normalize);
        const ctx = [...START, ...norm, ...END];
        const raws = ['', '', ...words, '', ''];
        let [prev, prev2] = START as [string, string];
        for (let i = 0; i < s.length; i++) {
          const gold = s[i]![1];
          let guess = t.tagdict.get(norm[i]!);
          if (!guess) {
            const feats = features(i, norm[i]!, words[i]!, ctx, raws, prev, prev2);
            guess = t.predict(feats);
            instance++;
            if (guess !== gold) for (const f of feats) {
              upd(f, gold, 1);
              upd(f, guess, -1);
            }
          }
          prev2 = prev;
          prev = guess;
          if (guess === gold) right++;
          all++;
        }
      }
      log(`  tagger iteration ${it + 1}: ${((100 * right) / all).toFixed(2)}% on training`);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
    }
    // Average.
    for (const [f, ws] of t.weights)
      for (const [c, w] of ws) {
        const key = `${f}\u0000${c}`;
        const total = (totals.get(key) ?? 0) + (instance - (stamps.get(key) ?? 0)) * w;
        ws.set(c, total / Math.max(1, instance));
      }
    return t;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// What the tags mean, for people and for WordNet.

/** The WordNet part of speech a Brown tag belongs to, if any: n, v, a (adjective), r (adverb). */
export function wnPos(tag: string): 'n' | 'v' | 'a' | 'r' | null {
  const t = tag.split('+')[0]!.replace(/\*$/, '');
  if (/^NNS?\$?$/.test(t)) return 'n';
  if (/^VB[DGNZ]?$/.test(t)) return 'v';
  if (/^JJ[RST]?$/.test(t)) return 'a';
  if (/^RB[RT]?$/.test(t)) return 'r';
  return null;
}

export const isProperTag = (tag: string) => /^NPS?\$?$/.test(tag.split('+')[0]!);

const NAMES: Record<string, string> = {
  AT: 'article', AP: 'determiner (many, few, other)', ABN: 'pre-quantifier (all, half)', ABX: 'both', CC: 'conjunction (and, but)',
  CS: 'subordinating conjunction (that, as, if, though)', CD: 'number', DT: 'determiner (this, that)', DTI: 'determiner (any, some)',
  DTS: 'determiner (these, those)', DTX: 'either / neither', EX: 'existential there', IN: 'preposition', JJ: 'adjective',
  JJR: 'comparative adjective', JJS: 'superlative adjective', JJT: 'superlative adjective', MD: 'modal (could, must)',
  NN: 'noun', NNS: 'plural noun', NN$: 'possessive noun', NP: 'proper name', NPS: 'plural proper name', NP$: 'possessive name',
  NR: 'adverbial noun (home, today)', OD: 'ordinal', PN: 'indefinite pronoun (one, anybody)', PP$: 'possessive (her, his)',
  PP$$: 'possessive (hers, his)', PPL: 'reflexive pronoun', PPO: 'object pronoun', PPS: 'he / she / it', PPSS: 'I / we / they / you',
  QL: 'qualifier (very, too, so)', RB: 'adverb', RBR: 'comparative adverb', RP: 'particle (up, out)', TO: 'to',
  UH: 'interjection', VB: 'verb', VBD: 'past-tense verb', VBG: 'present participle', VBN: 'past participle', VBZ: 'verb (-s)',
  WDT: 'wh-determiner (which, what)', WPS: 'who', WPO: 'whom', WP$: 'whose', WRB: 'wh-adverb (when, how)', BE: 'be', BED: 'were',
  BEDZ: 'was', BEZ: 'is', BER: 'are', BEM: 'am', BEN: 'been', BEG: 'being', HV: 'have', HVD: 'had', HVZ: 'has', HVN: 'had (pp)',
  HVG: 'having', DO: 'do', DOD: 'did', DOZ: 'does', 'DO*': "don't", 'DOD*': "didn't", 'DOZ*': "doesn't", '*': 'not', FW: 'foreign word',
};

export function tagName(tag: string): string {
  return tag
    .split('+')
    .map((t) => NAMES[t] ?? NAMES[t.replace(/\*$/, '')] ?? t)
    .join(' + ');
}
