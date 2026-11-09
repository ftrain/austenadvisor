// A trigram language model of the author's sentences, smoothed by interpolated Kneser–Ney (1995; Chen & Goodman
// 1998), after Shannon's n-grams (1948). It says how likely a word is where it stands, and which words the author
// put in a gap.

export const BOS = '<s>';
export const EOS = '</s>';
export const UNK = '<unk>';

export class Vocab {
  ids = new Map<string, number>();
  words: string[] = [];
  constructor(words: Iterable<string> = []) {
    for (const w of [BOS, EOS, UNK, ...words]) this.add(w);
  }
  add(w: string): number {
    let id = this.ids.get(w);
    if (id === undefined) {
      if (this.words.length >= KEY_BASE) throw new Error(`more than ${KEY_BASE} word types`);
      id = this.words.length;
      this.ids.set(w, id);
      this.words.push(w);
    }
    return id;
  }
  id(w: string): number {
    return this.ids.get(w) ?? 2;
  }
  get size(): number {
    return this.words.length;
  }
}

/** Trigram counts, keyed by (a·V + b)·V + c, from sentences of word keys. */
export function countTrigrams(sentences: Iterable<string[]>, vocab: Vocab): Map<number, number> {
  const V = KEY_BASE; // three ids of 17 bits: 51 bits, exact in a double
  const c3 = new Map<number, number>();
  for (const s of sentences) {
    const ids = [0, 0, ...s.map((w) => vocab.id(w)), 1];
    for (let i = 2; i < ids.length; i++) {
      const key = (ids[i - 2]! * V + ids[i - 1]!) * V + ids[i]!;
      c3.set(key, (c3.get(key) ?? 0) + 1);
    }
  }
  return c3;
}

export const KEY_BASE = 1 << 17;

export class KneserNey {
  readonly vocab: Vocab;
  private c3 = new Map<number, number>();
  private ctx3 = new Map<number, number>(); // c(u v •)
  private types3 = new Map<number, number>(); // N1+(u v •)
  private cc2 = new Map<number, number>(); // N1+(• v w)
  private ctx2 = new Map<number, number>(); // N1+(• v •)
  private types2 = new Map<number, number>(); // N1+(v •) by continuation
  private cc1: Float64Array; // N1+(• w)
  private cc1Total = 0;
  private cc1Types = 0;
  /** Raw bigram counts c(v w), and who follows and precedes whom. */
  readonly c2 = new Map<number, number>();
  readonly c1: Float64Array;
  readonly next = new Map<number, number[]>();
  readonly prev = new Map<number, number[]>();
  readonly tokens: number;
  private D1 = 0.5;
  private D2 = 0.75;
  private D3 = 0.75;

  constructor(vocab: Vocab, c3: Map<number, number>) {
    this.vocab = vocab;
    this.c3 = c3;
    const V = KEY_BASE;
    const n = vocab.size;
    this.c1 = new Float64Array(n);
    this.cc1 = new Float64Array(n);
    let tokens = 0;
    const nOf = [0, 0, 0, 0, 0];
    const nOf2 = [0, 0, 0, 0, 0];
    for (const [key, c] of c3) {
      const w = key % V;
      const uv = (key - w) / V;
      const v = uv % V;
      this.ctx3.set(uv, (this.ctx3.get(uv) ?? 0) + c);
      this.types3.set(uv, (this.types3.get(uv) ?? 0) + 1);
      const vw = v * V + w;
      this.cc2.set(vw, (this.cc2.get(vw) ?? 0) + 1);
      const had = this.c2.get(vw) ?? 0;
      this.c2.set(vw, had + c);
      this.c1[w]! += c;
      tokens += c;
      if (c <= 4) nOf[c]!++;
    }
    for (const [vw, cc] of this.cc2) {
      const w = vw % V;
      const v = (vw - w) / V;
      this.ctx2.set(v, (this.ctx2.get(v) ?? 0) + cc);
      this.types2.set(v, (this.types2.get(v) ?? 0) + 1);
      if (this.cc1[w] === 0) this.cc1Types++;
      this.cc1[w]! += 1;
      this.cc1Total += 1;
      if (cc <= 4) nOf2[cc]!++;
    }
    for (const vw of this.c2.keys()) {
      const w = vw % V;
      const v = (vw - w) / V;
      let a = this.next.get(v);
      if (!a) this.next.set(v, (a = []));
      a.push(w);
      let b = this.prev.get(w);
      if (!b) this.prev.set(w, (b = []));
      b.push(v);
    }
    this.tokens = tokens;
    // Discounts by Ney's estimate, D = n1 / (n1 + 2 n2).
    const d = (ns: number[]) => (ns[1]! && ns[2]! ? ns[1]! / (ns[1]! + 2 * ns[2]!) : 0.75);
    this.D3 = d(nOf);
    this.D2 = d(nOf2);
  }

  /** P(w) by continuation counts, interpolated with the uniform for what was never seen to continue anything. */
  p1(w: number): number {
    const uniform = 1 / this.vocab.size;
    if (!this.cc1Total) return uniform;
    return Math.max(this.cc1[w]! - this.D1, 0) / this.cc1Total + ((this.D1 * this.cc1Types) / this.cc1Total) * uniform;
  }

  p2(v: number, w: number): number {
    const V = KEY_BASE;
    const denom = this.ctx2.get(v);
    if (!denom) return this.p1(w);
    const cc = this.cc2.get(v * V + w) ?? 0;
    const lambda = (this.D2 * (this.types2.get(v) ?? 0)) / denom;
    return Math.max(cc - this.D2, 0) / denom + lambda * this.p1(w);
  }

  p3(u: number, v: number, w: number): number {
    const V = KEY_BASE;
    const uv = u * V + v;
    const denom = this.ctx3.get(uv);
    if (!denom) return this.p2(v, w);
    const c = this.c3.get(uv * V + w) ?? 0;
    const lambda = (this.D3 * (this.types3.get(uv) ?? 0)) / denom;
    return Math.max(c - this.D3, 0) / denom + lambda * this.p2(v, w);
  }

  /** log2 P of each word of a sentence after the two before it (sentence start padded), and of the end. */
  logProbs(words: string[]): number[] {
    const ids = [0, 0, ...words.map((w) => this.vocab.id(w)), 1];
    const out: number[] = [];
    for (let i = 2; i < ids.length; i++) out.push(Math.log2(this.p3(ids[i - 2]!, ids[i - 1]!, ids[i]!)));
    return out;
  }

  /**
   * How well a word fills position i of a sentence: the log2 probability of it and of the two words after it,
   * which it conditions. The same sum for each candidate makes them comparable.
   */
  slotScore(words: string[], i: number, candidate: string): number {
    const ids = [0, 0, ...words.map((w) => this.vocab.id(w)), 1];
    const j = i + 2;
    ids[j] = this.vocab.id(candidate);
    let s = 0;
    for (let k = j; k <= Math.min(j + 2, ids.length - 1); k++) s += Math.log2(this.p3(ids[k - 2]!, ids[k - 1]!, ids[k]!));
    return s;
  }

  count(w: string): number {
    const id = this.vocab.ids.get(w);
    return id === undefined ? 0 : this.c1[id]!;
  }

  bigram(a: string, b: string): number {
    const x = this.vocab.ids.get(a);
    const y = this.vocab.ids.get(b);
    return x === undefined || y === undefined ? 0 : (this.c2.get(x * KEY_BASE + y) ?? 0);
  }

  trigram(a: string, b: string, c: string): number {
    const [x, y, z] = [a, b, c].map((w) => this.vocab.ids.get(w));
    return x === undefined || y === undefined || z === undefined ? 0 : (this.c3.get((x * KEY_BASE + y) * KEY_BASE + z) ?? 0);
  }

  /** Words the author put after `before` or before `after`: the candidates for a gap. */
  gapCandidates(before: string, after: string): string[] {
    const out = new Set<number>();
    const b = this.vocab.ids.get(before);
    const a = this.vocab.ids.get(after);
    if (b !== undefined) for (const w of this.next.get(b) ?? []) out.add(w);
    if (a !== undefined) for (const w of this.prev.get(a) ?? []) out.add(w);
    return [...out].filter((w) => w > 2).map((w) => this.vocab.words[w]!);
  }

  /** The raw trigram table, to be kept. */
  entries(): IterableIterator<[number, number]> {
    return this.c3.entries();
  }
}
