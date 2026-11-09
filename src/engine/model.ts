// An author's model, read from SQLite into memory once: what the engine asks, word by word, in microseconds.

import type { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { ROOT, authorDbPath, englishDbPath, getMeta, open } from '../db.ts';
import { KEY_BASE, KneserNey, Vocab } from '../nlp/kn.ts';
import { cosine } from '../nlp/linalg.ts';
import { Tagger, type TaggerModel } from '../nlp/tagger.ts';
import { normWord, tokenize } from '../nlp/tokenize.ts';
import { WordNet, type WnPos } from '../nlp/wordnet.ts';
import { readAuthor, type AuthorConfig } from '../corpus/sources.ts';
import { FIGURES, figureExamples, findFigures } from './figures.ts';
import type { StyleProfile } from './profile.ts';

/** How a sentence is told: in narration, in speech, or in a letter. */
export type Register = 'narration' | 'speech' | 'letter';
export const REGISTERS: Register[] = ['narration', 'speech', 'letter'];

export interface WordInfo {
  count: number;
  narr: number;
  dial: number;
  caps: number;
  works: Record<string, number>;
  tags: Record<string, number>;
}

export interface Citation {
  id: number;
  work: string;
  title: string;
  year: number;
  chapter: number;
  chapterTitle: string;
  paragraph: number;
  sentence: number;
  text: string;
  /** "Pride and Prejudice, ch. 3, ¶ 12" */
  cite: string;
  /** The figures of speech it shows, named, where they were looked for. */
  figures?: string[];
}

export interface Form {
  tag: string;
  form: string;
  count: number;
}

export class AuthorModel {
  readonly author: AuthorConfig;
  readonly db: DatabaseSync;
  readonly words = new Map<string, WordInfo>();
  readonly lm: KneserNey;
  readonly tagLm: KneserNey;
  readonly tagger: Tagger;
  readonly wn: WordNet;
  readonly profile: StyleProfile;
  readonly vectors = new Map<string, Float32Array>();
  readonly totalWords: number;
  /** lemma\0pos → forms the author used; form → its lemmas. */
  private formsOf = new Map<string, Form[]>();
  private lemmaOfForm = new Map<string, { lemma: string; pos: WnPos }[]>();
  private works = new Map<string, { title: string; year: number }>();
  private citeStmt: ReturnType<DatabaseSync['prepare']>;
  private sentenceCache = new Map<number, Citation>();
  private sif: { ids: Int32Array; vecs: Float32Array; pc: Float32Array; words: Int16Array; register: Uint8Array; texts: string[] } | null = null;

  private constructor(authorId: string) {
    this.db = open(authorDbPath(authorId), { readOnly: true });
    const eng = open(englishDbPath(), { readOnly: true });
    // The author's file as it is now (its words about the author may have changed since the build), else as built.
    let author = getMeta<AuthorConfig>(this.db, 'author')!;
    try {
      author = { ...author, ...readAuthor(ROOT, authorId) };
    } catch {
      /* the build's copy */
    }
    this.author = author;
    this.profile = getMeta<StyleProfile>(this.db, 'profile')!;
    this.tagger = Tagger.from(getMeta<TaggerModel>(eng, 'tagger')!);
    this.wn = new WordNet(eng);
    let total = 0;
    for (const r of this.db.prepare('SELECT word, count, narr, dial, caps, works, tags FROM words').all() as any[]) {
      this.words.set(r.word, { count: r.count, narr: r.narr, dial: r.dial, caps: r.caps, works: JSON.parse(r.works), tags: JSON.parse(r.tags) });
      total += r.count;
    }
    this.totalWords = total;
    for (const r of this.db.prepare('SELECT lemma, pos, tag, form, count FROM forms').all() as any[]) {
      const k = `${r.lemma}\u0000${r.pos}`;
      let a = this.formsOf.get(k);
      if (!a) this.formsOf.set(k, (a = []));
      a.push({ tag: r.tag, form: r.form, count: r.count });
      let b = this.lemmaOfForm.get(r.form);
      if (!b) this.lemmaOfForm.set(r.form, (b = []));
      if (!b.some((x) => x.lemma === r.lemma && x.pos === r.pos)) b.push({ lemma: r.lemma, pos: r.pos });
    }
    this.lm = readLm(this.db, 'lm_vocab', 'word', 'lm_trigrams');
    this.tagLm = readLm(this.db, 'tag_vocab', 'tag', 'tag_trigrams');
    for (const r of this.db.prepare('SELECT word, vec FROM vectors').all() as { word: string; vec: Uint8Array }[]) {
      this.vectors.set(r.word, new Float32Array(r.vec.buffer.slice(r.vec.byteOffset, r.vec.byteOffset + r.vec.byteLength)));
    }
    for (const r of this.db.prepare('SELECT id, title, year FROM works').all() as any[]) this.works.set(r.id, { title: r.title, year: r.year });
    this.citeStmt = this.db.prepare(
      `SELECT s.id, s.ord AS sentence, s.text, p.ord AS paragraph, c.ord AS chapter, c.title AS chapterTitle, c.work
       FROM sentences s JOIN paragraphs p ON p.id = s.paragraph JOIN chapters c ON c.id = p.chapter WHERE s.id = ?`,
    );
  }

  private static cache = new Map<string, AuthorModel>();
  static load(authorId: string): AuthorModel {
    let m = AuthorModel.cache.get(authorId);
    if (!m) {
      if (!existsSync(authorDbPath(authorId))) throw new Error(`No model for "${authorId}": run npm run build:model -- ${authorId}`);
      m = new AuthorModel(authorId);
      AuthorModel.cache.set(authorId, m);
    }
    return m;
  }

  word(w: string): WordInfo | undefined {
    return this.words.get(normWord(w));
  }

  /** Per million words. */
  rate(w: string): number {
    return ((this.word(w)?.count ?? 0) / this.totalWords) * 1e6;
  }

  forms(lemma: string, pos: WnPos): Form[] {
    return this.formsOf.get(`${lemma}\u0000${pos}`) ?? [];
  }

  lemmasOfForm(form: string): { lemma: string; pos: WnPos }[] {
    return this.lemmaOfForm.get(normWord(form)) ?? [];
  }

  /** The author's own form of a lemma for a tag ("walk", VBD → "walked"), if the author ever wrote it. */
  inflect(lemma: string, pos: WnPos, tag: string): string | null {
    const fs = this.forms(lemma, pos);
    const exact = fs.filter((f) => f.tag === tag).sort((a, b) => b.count - a.count)[0];
    if (exact) return exact.form;
    // Near tags: a noun's plural for a plural, a verb's -s for -s …
    const family = tag.replace(/\$$/, '');
    const near = fs.filter((f) => f.tag.replace(/\$$/, '') === family).sort((a, b) => b.count - a.count)[0];
    return near?.form ?? null;
  }

  /** The most likely tag the author gave a word. */
  usualTag(w: string): string | null {
    const info = this.word(w);
    if (!info) return null;
    let best: string | null = null;
    let n = -1;
    for (const [t, c] of Object.entries(info.tags)) if (c > n) [best, n] = [t, c];
    return best;
  }

  vector(w: string): Float32Array | undefined {
    return this.vectors.get(normWord(w));
  }

  similarity(a: string, b: string): number {
    const x = this.vector(a);
    const y = this.vector(b);
    return x && y ? cosine(x, y) : 0;
  }

  /** The words nearest a word in the author's own usage. */
  neighbours(w: string, k = 10): { word: string; sim: number }[] {
    const v = this.vector(w);
    if (!v) return [];
    const out: { word: string; sim: number }[] = [];
    for (const [x, u] of this.vectors) {
      if (x === normWord(w)) continue;
      const sim = cosine(v, u);
      if (out.length < k || sim > out[out.length - 1]!.sim) {
        out.push({ word: x, sim });
        out.sort((a, b) => b.sim - a.sim);
        if (out.length > k) out.pop();
      }
    }
    return out;
  }

  /** A context's vector: the mean of its words' vectors, the rarer weighing more (Arora, Liang & Ma 2017). */
  contextVector(words: string[]): Float32Array | null {
    const dims = this.vectors.values().next().value?.length ?? 100;
    const v = new Float32Array(dims);
    let any = false;
    for (const w of words) {
      const u = this.vector(w);
      if (!u) continue;
      const p = (this.word(w)?.count ?? 1) / this.totalWords;
      const a = 1e-3 / (1e-3 + p);
      for (let i = 0; i < dims; i++) v[i]! += a * u[i]!;
      any = true;
    }
    return any ? v : null;
  }

  cite(id: number): Citation | null {
    let c = this.sentenceCache.get(id);
    if (c) return c;
    const r = this.citeStmt.get(id) as any;
    if (!r) return null;
    const w = this.works.get(r.work)!;
    const isNumbered = /^(chapter\s*)?[\divxlc]+\.?$/i.test(r.chapterTitle.trim());
    const chap = isNumbered ? `ch. ${r.chapter}` : `“${titleCase(r.chapterTitle)}”`;
    c = {
      id: r.id,
      work: r.work,
      title: w.title,
      year: w.year,
      chapter: r.chapter,
      chapterTitle: r.chapterTitle,
      paragraph: r.paragraph,
      sentence: r.sentence,
      text: r.text,
      cite: `${w.title}, ${chap}, ¶ ${r.paragraph}`,
    };
    if (this.sentenceCache.size > 20000) this.sentenceCache.clear();
    this.sentenceCache.set(id, c);
    return c;
  }

  /** The paragraph a sentence stands in, whole, with the sentence's place in it. */
  paragraphOf(sentenceId: number): { text: string; start: number; end: number } | null {
    const r = this.db
      .prepare('SELECT p.text, s.start, s.end FROM sentences s JOIN paragraphs p ON p.id = s.paragraph WHERE s.id = ?')
      .get(sentenceId) as any;
    return r ? { text: r.text, start: r.start, end: r.end } : null;
  }

  /**
   * Sentences that use the words, best first (FTS5's BM25). `words` are all required; `prefer` words rank a
   * sentence higher where it has them.
   */
  search(words: string[], opts: { prefer?: string[]; limit?: number; minWords?: number; maxWords?: number; phrase?: boolean } = {}): Citation[] {
    const term = (w: string) => {
      const n = normWord(w).replace(/"/g, '');
      return n.includes("'") ? `("${n}" OR "${n.replace(/'/g, '’')}")` : `"${n}"`;
    };
    const must = opts.phrase ? `"${words.map((w) => normWord(w).replace(/"/g, '').replace(/'/g, '’')).join(' ')}"` : words.map(term).join(' AND ');
    if (!must) return [];
    const prefer = (opts.prefer ?? []).filter((w) => /^[\p{L}'’-]+$/u.test(w)).slice(0, 12);
    const limit = opts.limit ?? 5;
    const minW = opts.minWords ?? 0;
    const maxW = opts.maxWords ?? 10000;
    const run = (q: string) => {
      try {
        return (
          this.db
            .prepare(
              `SELECT f.rowid AS id FROM sentences_fts f JOIN sentences s ON s.id = f.rowid
               WHERE sentences_fts MATCH ? AND s.words BETWEEN ? AND ? ORDER BY rank LIMIT ?`,
            )
            .all(q, minW, maxW, limit) as { id: number }[]
        ).map((r) => r.id);
      } catch {
        return [];
      }
    };
    let ids: number[] = [];
    if (prefer.length) ids = run(`${must} AND (${prefer.map(term).join(' OR ')})`);
    if (ids.length < limit) for (const id of run(must)) if (!ids.includes(id) && ids.length < limit) ids.push(id);
    return ids.map((id) => this.cite(id)!).filter(Boolean);
  }

  /** Sentences nearest a passage in meaning (SIF sentence vectors, first principal component removed). */
  similarSentences(
    text: string,
    k = 5,
    opts: { minWords?: number; maxWords?: number; register?: Register; test?: (text: string, register: Register) => boolean } = {},
  ): (Citation & { sim: number })[] {
    const idx = this.sifIndex();
    const words = tokenize(text).filter((t) => t.kind === 'word').map((t) => t.norm);
    const v = this.contextVector(words);
    if (!v) return [];
    removePc(v, idx.pc);
    const dims = v.length;
    const best: { i: number; sim: number }[] = [];
    let nv = 0;
    for (let j = 0; j < dims; j++) nv += v[j]! ** 2;
    nv = Math.sqrt(nv) || 1;
    for (let i = 0; i < idx.ids.length; i++) {
      if (opts.minWords && idx.words[i]! < opts.minWords) continue;
      if (opts.maxWords && idx.words[i]! > opts.maxWords) continue;
      if (opts.register && REGISTERS[idx.register[i]!] !== opts.register) continue;
      if (opts.test && !opts.test(idx.texts[i]!, REGISTERS[idx.register[i]!]!)) continue;
      let dot = 0;
      const o = i * dims;
      for (let j = 0; j < dims; j++) dot += v[j]! * idx.vecs[o + j]!;
      const sim = dot / nv;
      if (best.length < k || sim > best[best.length - 1]!.sim) {
        best.push({ i, sim });
        best.sort((a, b) => b.sim - a.sim);
        if (best.length > k) best.pop();
      }
    }
    return best.map(({ i, sim }) => ({ ...this.cite(idx.ids[i]!)!, sim }));
  }

  private sifIndex() {
    if (this.sif) return this.sif;
    const rows = this.db
      .prepare(
        `SELECT s.id, s.text, s.words, s.dialogue, p.kind, c.work FROM sentences s JOIN paragraphs p ON p.id = s.paragraph
         JOIN chapters c ON c.id = p.chapter WHERE s.words >= 4`,
      )
      .all() as { id: number; text: string; words: number; dialogue: number; kind: string; work: string }[];
    const letters = new Set(this.author.epistolary ?? []);
    const register = Uint8Array.from(rows, (r) => REGISTERS.indexOf(r.kind === 'letter' || letters.has(r.work) ? 'letter' : r.dialogue >= 0.5 ? 'speech' : 'narration'));
    const dims = this.vectors.values().next().value!.length;
    const ids = new Int32Array(rows.length);
    const wc = new Int16Array(rows.length);
    const vecs = new Float32Array(rows.length * dims);
    rows.forEach((r, i) => {
      ids[i] = r.id;
      wc[i] = Math.min(32000, r.words);
      const v = this.contextVector(tokenize(r.text).filter((t) => t.kind === 'word').map((t) => t.norm));
      if (v) vecs.set(v, i * dims);
    });
    // The first principal component, by power iteration, is what every sentence shares: take it away.
    let pc = new Float32Array(dims).fill(1 / Math.sqrt(dims));
    for (let it = 0; it < 30; it++) {
      const next = new Float32Array(dims);
      for (let i = 0; i < rows.length; i++) {
        let dot = 0;
        for (let j = 0; j < dims; j++) dot += vecs[i * dims + j]! * pc[j]!;
        for (let j = 0; j < dims; j++) next[j]! += dot * vecs[i * dims + j]!;
      }
      let n = 0;
      for (let j = 0; j < dims; j++) n += next[j]! ** 2;
      n = Math.sqrt(n) || 1;
      for (let j = 0; j < dims; j++) next[j]! /= n;
      pc = next;
    }
    for (let i = 0; i < rows.length; i++) {
      const v = vecs.subarray(i * dims, (i + 1) * dims);
      removePc(v, pc);
      let n = 0;
      for (let j = 0; j < dims; j++) n += v[j]! ** 2;
      n = Math.sqrt(n) || 1;
      for (let j = 0; j < dims; j++) v[j]! /= n;
    }
    this.sif = { ids, vecs, pc, words: wc, register, texts: rows.map((r) => r.text) };
    return this.sif;
  }

  /**
   * Whether words show a move: its pattern, and for understatement the principled test as well, a negative before a
   * word whose negative prefix, taken off, leaves a word of the author's (“not intolerable”: tolerable; “not
   * disagreeable”: agreeable; but not “not understand”).
   */
  shows(move: { id: string; pattern?: string }, text: string): boolean {
    const t = text.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’');
    // A figure of speech is found by its own detector; the author's other moves by their pattern.
    if (move.id in FIGURES) {
      const want = move.id === 'irony' ? ['gnomic', 'aside'] : [move.id];
      if (findFigures(this, t).some((f) => want.includes(f.term))) return true;
    }
    return !!move.pattern && new RegExp(move.pattern, 'i').test(t);
  }

  /** The author's sentences that show a move (its pattern matched, in its register), nearest a passage first. */
  moveExamples(moveId: string, near: string, k = 4): (Citation & { sim: number })[] {
    const move = this.author.moves?.find((x) => x.id === moveId);
    // A figure of speech with no move of the author's by its name: by its detector.
    if (!move && moveId in FIGURES) return figureExamples(this, moveId, near, k).map((c) => ({ ...c, sim: 0 }));
    if (!move) return [];
    const opts = {
      minWords: 6,
      maxWords: 60,
      test: (t: string, reg: Register) => this.shows(move, t) && (move.register === 'any' || reg === move.register || (move.register === 'narration' && reg === 'letter')),
    };
    const near1 = near ? this.similarSentences(near, k, opts) : [];
    // Words the author never used give no meaning to be near: then near the move itself.
    return near1.length ? near1 : this.similarSentences(move.does, k, opts);
  }

  /** Words found near a word more than chance allows: Dunning's log-likelihood (1993) over a window of five. */
  collocates(word: string, k = 15): { word: string; together: number; score: number }[] {
    const w = normWord(word);
    const rows = this.db
      .prepare(`SELECT s.text FROM sentences_fts f JOIN sentences s ON s.id = f.rowid WHERE sentences_fts MATCH ? LIMIT 4000`)
      .all(w.includes("'") ? `"${w}" OR "${w.replace(/'/g, '’')}"` : `"${w}"`) as { text: string }[];
    const near = new Map<string, number>();
    let windowTokens = 0;
    for (const r of rows) {
      const ws = tokenize(r.text).filter((t) => t.kind === 'word').map((t) => t.norm);
      ws.forEach((x, i) => {
        if (x !== w) return;
        for (let j = Math.max(0, i - 5); j <= Math.min(ws.length - 1, i + 5); j++) {
          if (j === i) continue;
          near.set(ws[j]!, (near.get(ws[j]!) ?? 0) + 1);
          windowTokens++;
        }
      });
    }
    const N = this.totalWords;
    const out: { word: string; together: number; score: number }[] = [];
    const FUNCTION_WORDS = new Set(this.profile.mfw.words.slice(0, 60));
    for (const [x, a] of near) {
      if (a < 3 || FUNCTION_WORDS.has(x)) continue;
      const total = this.word(x)?.count ?? a;
      const b = windowTokens - a;
      const c = Math.max(0, total - a);
      const d = Math.max(1, N - windowTokens - c);
      const ll = 2 * [a, b, c, d].reduce((acc, o, i) => {
        const row = i < 2 ? windowTokens : N - windowTokens;
        const col = i % 2 === 0 ? total : N - total;
        const e = (row * col) / N;
        return acc + (o > 0 ? o * Math.log(o / e) : 0);
      }, 0);
      if (a / windowTokens > total / N) out.push({ word: x, together: a, score: ll });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

function removePc(v: Float32Array, pc: Float32Array) {
  let dot = 0;
  for (let j = 0; j < v.length; j++) dot += v[j]! * pc[j]!;
  for (let j = 0; j < v.length; j++) v[j]! -= dot * pc[j]!;
}

function readLm(db: DatabaseSync, vocabTable: string, col: string, triTable: string): KneserNey {
  const vocab = new Vocab();
  const rows = db.prepare(`SELECT id, ${col} AS w FROM ${vocabTable} ORDER BY id`).all() as { id: number; w: string }[];
  for (const r of rows) vocab.add(r.w);
  const c3 = new Map<number, number>();
  for (const r of db.prepare(`SELECT key, n FROM ${triTable}`).all() as { key: number; n: number }[]) c3.set(r.key, r.n);
  void KEY_BASE;
  return new KneserNey(vocab, c3);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(“])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}
