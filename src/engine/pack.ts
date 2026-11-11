// A voice's pack: what the page needs from a voice without loading its whole model. scripts/build-packs.ts writes
// it at build time as data/packs/<id>.json and data/packs/<id>.sif, and the server keeps every pack in memory.
//
// The .json holds the voice's signature words, its sentences that make each move and figure, its profile in brief,
// its usual order of parts, and a shape index of its sentences. The .sif holds the
// numbers: the shape index's sentence vectors, the voice's word vectors, and the whole corpus's sentence vectors,
// which AuthorModel reads in place of building them (about 3 s a voice).

import { closeSync, existsSync, openSync, readFileSync, readSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DATA, englishDbPath, getMeta, open } from '../db.ts';
import { Tagger, type TaggerModel } from '../nlp/tagger.ts';
import { tokenize } from '../nlp/tokenize.ts';
import type { Dist } from './profile.ts';
import type { Role, Kind } from './structure.ts';

/** Raised when the pack's shape changes; an older pack is ignored until it is built again. */
export const PACK_VERSION = 1;

export const packDir = () => join(DATA, 'packs');
export const packPaths = (id: string) => ({ json: join(packDir(), `${id}.json`), sif: join(packDir(), `${id}.sif`) });

/** A word the voice uses far more than the other voices do, with a sentence of the voice's that uses it. */
export interface SignatureWord {
  word: string;
  count: number;
  /** The voice's rate over the other voices' pooled rate. */
  ratio: number;
  sentence: { id: number; text: string; cite: string } | null;
}

/** A sentence in the shape index: its words, and its shape in tags and punctuation. */
export interface ShapeEntry {
  id: number;
  text: string;
  cite: string;
  words: number;
  register: 'narration' | 'speech' | 'letter';
  /** The first sentence of its paragraph. */
  first: boolean;
  /** One letter a word class (N noun, V verb, J adjective…), punctuation as itself. */
  tags: string;
  /** The sentence's punctuation in order: ",;." */
  punct: string;
}

/** The profile, in brief: what sets the voice's sentences apart. */
export interface Fingerprint {
  sentenceLength: { narration: Dist; dialogue: Dist };
  paragraphWords: Dist;
  punctuationPerSentence: Record<string, number>;
  /** The voice's commonest clause joins, as a share of all its joins. */
  joins: { join: string; share: number }[];
  per1000: { lyAdverbs: number; adjectives: number; nouns: number; passives: number; contractionsNarration: number; contractionsSpeech: number };
}

export interface PackFile {
  version: number;
  id: string;
  builtAt: string;
  /** The model the pack was built from; see fingerprintOf. */
  fingerprint: string;
  /** The voices the signature words were measured against. */
  against: string[];
  /** Word counts for the unigram classifier and SIF weights: every word used twice or more, and every word with a vector. */
  total: number;
  counts: Record<string, number>;
  signature: SignatureWord[];
  /**
   * Up to eight sentence ids for each figure and move, each checked with AuthorModel.shows; a key with [] has none. A
   * figure's sentences show it by its detector, and where a move has a figure's name the figure keeps the key here.
   */
  exemplars: Record<string, number[]>;
  /** The sentences of a move that has a figure's name (Austen's litotes), found by the move's pattern or the detector. */
  moveExemplars: Record<string, number[]>;
  profile: Fingerprint;
  structure: { kind: Kind; order: Role[]; support: number; passages: number; signature: string };
  shape: ShapeEntry[];
  /** The words of the .sif's word vectors, in order. */
  vectorWords: string[];
  dims: number;
}

export interface Pack extends Omit<PackFile, 'counts'> {
  counts: Map<string, number>;
  vectors: Map<string, Float32Array>;
  /** The shape index's sentence vectors, `dims` floats a sentence in `shape` order, unit length. */
  shapeVecs: Float32Array;
  /** The first principal component of the voice's sentence vectors. */
  pc: Float32Array;
}

/** The full corpus's sentence vectors, as AuthorModel holds them. */
export interface SifIndex {
  ids: Int32Array;
  vecs: Float32Array;
  pc: Float32Array;
  words: Int16Array;
  register: Uint8Array;
}

/** What identifies a built model: a rebuilt model gives a new fingerprint, and its old pack is ignored. */
export function fingerprintOf(db: DatabaseSync): string {
  const r = db.prepare('SELECT count(*) AS n, max(id) AS top FROM sentences').get() as { n: number; top: number };
  const trained = getMeta<{ trained?: string }>(db, 'model')?.trained ?? '';
  return `${r.n}:${r.top}:${trained}`;
}

// The .sif file: "SIF1", a u32 header length, a JSON header naming each section's type, offset and length, then the
// sections, each starting on an 8-byte boundary.

type Typed = Float32Array | Int32Array | Int16Array | Uint8Array;
const TYPES = { f32: Float32Array, i32: Int32Array, i16: Int16Array, u8: Uint8Array } as const;
type TypeName = keyof typeof TYPES;
interface SifHeader {
  version: number;
  fingerprint: string;
  dims: number;
  sections: Record<string, { type: TypeName; offset: number; length: number }>;
}

const typeName = (a: Typed): TypeName => (a instanceof Float32Array ? 'f32' : a instanceof Int32Array ? 'i32' : a instanceof Int16Array ? 'i16' : 'u8');

export function writeSif(file: string, meta: { fingerprint: string; dims: number }, sections: Record<string, Typed>): void {
  const names = Object.keys(sections);
  const header: SifHeader = { version: PACK_VERSION, ...meta, sections: {} };
  // The header's length depends on the offsets: lay out once to measure it, leave room for longer numbers, lay out again.
  const layout = (headLen: number) => {
    let at = align(8 + headLen);
    for (const n of names) {
      const a = sections[n]!;
      header.sections[n] = { type: typeName(a), offset: at, length: a.length };
      at = align(at + a.byteLength);
    }
  };
  layout(0);
  const headLen = Buffer.byteLength(JSON.stringify(header)) + 64;
  layout(headLen);
  const head = Buffer.from(JSON.stringify(header).padEnd(headLen, ' '));
  const last = names.length ? header.sections[names.at(-1)!]! : null;
  const size = last ? last.offset + sections[names.at(-1)!]!.byteLength : align(8 + head.length);
  const out = Buffer.alloc(size);
  out.write('SIF1', 0, 'latin1');
  out.writeUInt32LE(head.length, 4);
  head.copy(out, 8);
  for (const n of names) {
    const a = sections[n]!;
    Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(out, header.sections[n]!.offset);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, out);
}

function align(n: number): number {
  return Math.ceil(n / 8) * 8;
}

function readHeader(fd: number): SifHeader | null {
  const pre = Buffer.alloc(8);
  if (readSync(fd, pre, 0, 8, 0) < 8 || pre.toString('latin1', 0, 4) !== 'SIF1') return null;
  const len = pre.readUInt32LE(4);
  const head = Buffer.alloc(len);
  readSync(fd, head, 0, len, 8);
  return JSON.parse(head.toString('utf8')) as SifHeader;
}

/** Only the sections asked for are read: the whole-corpus vectors stay on disk until a model wants them. */
export function readSif(file: string, names: string[]): { header: SifHeader; sections: Record<string, Typed> } | null {
  if (!existsSync(file)) return null;
  const fd = openSync(file, 'r');
  try {
    const header = readHeader(fd);
    if (!header || header.version !== PACK_VERSION) return null;
    const sections: Record<string, Typed> = {};
    for (const n of names) {
      const s = header.sections[n];
      if (!s) return null;
      const T = TYPES[s.type];
      const a = new T(s.length);
      readSync(fd, new Uint8Array(a.buffer), 0, a.byteLength, s.offset);
      sections[n] = a;
    }
    return { header, sections };
  } finally {
    closeSync(fd);
  }
}

/** The whole corpus's sentence vectors for a model, if a pack holds them for this very build. */
export function readFullSif(id: string, fingerprint: string): SifIndex | null {
  const r = readSif(packPaths(id).sif, ['full.ids', 'full.vecs', 'full.words', 'full.register', 'pc']);
  if (!r || r.header.fingerprint !== fingerprint) return null;
  const s = r.sections;
  return { ids: s['full.ids'] as Int32Array, vecs: s['full.vecs'] as Float32Array, words: s['full.words'] as Int16Array, register: s['full.register'] as Uint8Array, pc: s['pc'] as Float32Array };
}

const resident = new Map<string, Pack | null>();

/** A voice's pack, read once and kept; null where none is built, or where it is out of date. */
export function loadPack(id: string, opts: { fingerprint?: string } = {}): Pack | null {
  if (resident.has(id)) {
    const p = resident.get(id)!;
    if (!p || !opts.fingerprint || p.fingerprint === opts.fingerprint) return p;
  }
  const p = readPack(id);
  const ok = p && (!opts.fingerprint || p.fingerprint === opts.fingerprint) ? p : null;
  resident.set(id, ok);
  return ok;
}

/** Forget a pack read before, so the next loadPack reads it again (after a build). */
export function forgetPack(id?: string): void {
  if (id) resident.delete(id);
  else resident.clear();
}

/** The packs in memory now. */
export const residentPacks = (): Pack[] => [...resident.values()].filter((p): p is Pack => !!p);

function readPack(id: string): Pack | null {
  const paths = packPaths(id);
  if (!existsSync(paths.json)) return null;
  let file: PackFile;
  try {
    file = JSON.parse(readFileSync(paths.json, 'utf8')) as PackFile;
  } catch {
    return null;
  }
  if (file.version !== PACK_VERSION) return null;
  const sif = readSif(paths.sif, ['shape.vecs', 'word.vecs', 'pc']);
  if (!sif || sif.header.fingerprint !== file.fingerprint) return null;
  const wv = sif.sections['word.vecs'] as Float32Array;
  const vectors = new Map<string, Float32Array>();
  file.vectorWords.forEach((w, i) => vectors.set(w, wv.subarray(i * file.dims, (i + 1) * file.dims)));
  const { counts, ...rest } = file;
  return { ...rest, counts: new Map(Object.entries(counts)), vectors, shapeVecs: sif.sections['shape.vecs'] as Float32Array, pc: sif.sections['pc'] as Float32Array };
}

/**
 * A passage's sentence vector in the voice's own word space, as AuthorModel.similarSentences makes it: each word's
 * vector weighted by its rarity (Arora, Liang and Ma 2017), the shared component taken away, unit length.
 */
export function packVector(p: Pack, text: string): Float32Array | null {
  const v = new Float32Array(p.dims);
  let any = false;
  for (const t of tokenize(text)) {
    if (t.kind !== 'word') continue;
    const u = p.vectors.get(t.norm);
    if (!u) continue;
    const a = 1e-3 / (1e-3 + (p.counts.get(t.norm) ?? 1) / p.total);
    for (let i = 0; i < p.dims; i++) v[i]! += a * u[i]!;
    any = true;
  }
  if (!any) return null;
  let dot = 0;
  for (let i = 0; i < p.dims; i++) dot += v[i]! * p.pc[i]!;
  let n = 0;
  for (let i = 0; i < p.dims; i++) {
    v[i]! -= dot * p.pc[i]!;
    n += v[i]! ** 2;
  }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < p.dims; i++) v[i]! /= n;
  return v;
}

/** The cosine of a passage's vector with the shape index's sentence i. */
export function shapeSimilarity(p: Pack, v: Float32Array, i: number): number {
  let dot = 0;
  const o = i * p.dims;
  for (let j = 0; j < p.dims; j++) dot += v[j]! * p.shapeVecs[o + j]!;
  return dot;
}

/** A word count table, as a pack or a model's words hold it. */
export interface UnigramTable {
  id: string;
  total: number;
  counts: Map<string, number>;
}

/** Words the classifier never saw get this much of a count. */
const UNSEEN = 0.5;
/** The vocabulary size the smoothing assumes. */
const VOCAB = 100_000;

/**
 * Which voice a passage's words sound most like: the mean log-probability a word under each voice's word counts,
 * best first. `leaveOut` takes a sentence's own words off its voice's counts, so a corpus sentence is scored fairly.
 */
export function unigramScores(tables: UnigramTable[], text: string, leaveOut?: string): { voice: string; score: number }[] {
  const words = tokenize(text).filter((t) => t.kind === 'word').map((t) => t.norm);
  if (!words.length) return tables.map((t) => ({ voice: t.id, score: 0 }));
  const own = new Map<string, number>();
  for (const w of words) own.set(w, (own.get(w) ?? 0) + 1);
  return tables
    .map((t) => {
      const minus = t.id === leaveOut;
      const total = t.total - (minus ? words.length : 0);
      let s = 0;
      for (const w of words) {
        const c = Math.max(0, (t.counts.get(w) ?? 0) - (minus ? own.get(w)! : 0));
        s += Math.log((c + UNSEEN) / (total + UNSEEN * VOCAB));
      }
      return { voice: t.id, score: s / words.length };
    })
    .sort((a, b) => b.score - a.score);
}

/** A tag's word class in one letter: N noun, V verb, M modal, J adjective, R adverb, P pronoun, D determiner… */
export function coarseTag(tag: string): string {
  const t = tag.split('+')[0]!.replace(/[*$]+$/, '').replace(/-\w+$/, '');
  if (/^[,;:.!?()—]$/.test(t)) return t;
  if (t === '--' || t === '–') return '—';
  if (/^N[NPR]/.test(t)) return 'N';
  if (/^(VB|BE|HV|DO)/.test(t)) return 'V';
  if (t === 'MD') return 'M';
  if (/^JJ/.test(t)) return 'J';
  if (/^(RB|QL|RP)/.test(t)) return 'R';
  if (/^(PP|PN)/.test(t)) return 'P';
  if (/^(AT|DT|AP|AB|CD|OD)/.test(t)) return 'D';
  if (t === 'IN') return 'I';
  if (t === 'CC') return 'C';
  if (t === 'CS') return 'S';
  if (/^W/.test(t)) return 'W';
  if (t === 'TO') return 'T';
  if (t === 'UH') return 'U';
  if (t === 'EX') return 'E';
  return /^\w/.test(t) ? 'X' : '';
}

/** A sentence's tags (as the corpus stores them, or as the tagger gives them) as one letter a word. */
export const tagSkeleton = (tags: string[]): string => tags.map(coarseTag).join('');

/** A sentence's punctuation in order, quotation marks left out: "When is it, Lizzy?" gives ",?". */
export const punctSkeleton = (text: string): string =>
  (
    text
      .replace(/\.{3,}|…/g, '…')
      .replace(/–|--+|\s-\s/g, '—')
      .match(/[,;:.!?()—…]/g) ?? []
  ).join('');

let tagger: Tagger | null = null;

/** A passage's tag and punctuation skeletons, tagged as the corpus was. */
export function skeletonsOf(text: string): { tags: string; punct: string } {
  if (!tagger) {
    const eng = open(englishDbPath(), { readOnly: true });
    tagger = Tagger.from(getMeta<TaggerModel>(eng, 'tagger')!);
    eng.close();
  }
  return { tags: tagSkeleton(tagger.tagTokens(tokenize(text))), punct: punctSkeleton(text) };
}
