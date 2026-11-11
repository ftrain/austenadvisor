// Builds each voice's pack (src/engine/pack.ts) from its built model: data/packs/<id>.json and data/packs/<id>.sif.
// Run it after building or rebuilding a model, and again after adding a voice, since the signature words and the
// guessing game measure each voice against all the others.
//
//   node scripts/build-packs.ts             every built voice
//   node scripts/build-packs.ts kjv obama   these voices (measured against every built voice)

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, authorDbPath, open } from '../src/db.ts';
import { AuthorModel, type Register } from '../src/engine/model.ts';
import { FIGURES, findFigures, mayShow } from '../src/engine/figures.ts';
import {
  PACK_VERSION,
  forgetPack,
  packDir,
  packPaths,
  percentileIn,
  punctSkeleton,
  tagSkeleton,
  unigramScores,
  writeSif,
  type Fingerprint,
  type GuessRound,
  type PackFile,
  type ShapeEntry,
  type SignatureWord,
  type UnigramTable,
} from '../src/engine/pack.ts';
import { typicalOrder, type Kind, KINDS } from '../src/engine/structure.ts';
import { tokenize } from '../src/nlp/tokenize.ts';

/** Sentences kept for each move and figure. */
const EXEMPLARS = 8;
const GUESS_ROUNDS = 500;
const SHAPE_SENTENCES = 8000;
const SIGNATURE_WORDS = 40;

export function builtVoices(): string[] {
  return readdirSync(join(ROOT, 'authors'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((id) => existsSync(authorDbPath(id)))
    .sort();
}

/** A voice's word counts, read straight from its model's table. */
function wordTable(id: string): UnigramTable & { caps: Map<string, number> } {
  const db = open(authorDbPath(id), { readOnly: true });
  const counts = new Map<string, number>();
  const caps = new Map<string, number>();
  let total = 0;
  for (const r of db.prepare('SELECT word, count, caps FROM words').all() as { word: string; count: number; caps: number }[]) {
    counts.set(r.word, r.count);
    caps.set(r.word, r.caps);
    total += r.count;
  }
  db.close();
  return { id, total, counts, caps };
}

/** A small seeded generator, so a pack built twice from one model is the same pack. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: T[], seed: number): T[] {
  const r = rng(seed);
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface Row {
  id: number;
  text: string;
  words: number;
  work: string;
  register: Register;
  spoken: boolean;
  first: boolean;
  tags: string | null;
}

function rowsOf(m: AuthorModel): Row[] {
  const letters = new Set(m.author.epistolary ?? []);
  const rows = m.db
    .prepare(
      `SELECT s.id, s.text, s.words, s.dialogue AS d, s.ord, s.tags, p.dialogue AS pd, p.kind, c.work FROM sentences s
       JOIN paragraphs p ON p.id = s.paragraph JOIN chapters c ON c.id = p.chapter ORDER BY s.id`,
    )
    .all() as { id: number; text: string; words: number; d: number; ord: number; tags: string | null; pd: number; kind: string; work: string }[];
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    words: r.words,
    work: r.work,
    register: r.kind === 'letter' || letters.has(r.work) ? 'letter' : r.d >= 0.5 ? 'speech' : 'narration',
    // As AuthorModel.spoken has it.
    spoken: r.d >= 0.5 || r.pd >= 0.6,
    first: r.ord === 0 || r.ord === 1,
    tags: r.tags,
  }));
}

/**
 * Up to EXEMPLARS sentences for each figure and each move, spread over the works, each re-checked with m.shows. A
 * figure's sentences show it by its own detector. Where a move has a figure's name (Austen's litotes), the figure
 * keeps the name in `exemplars`, and the move's own sentences, found by its pattern too, go in `moveExemplars`.
 */
function exemplarsOf(m: AuthorModel, rows: Row[]): { exemplars: Record<string, number[]>; moveExemplars: Record<string, number[]> } {
  const exclude = new Set(m.author.linkExclude ?? []);
  const moves = m.author.moves ?? [];
  // A key is "figure:<id>" or "move:<id>".
  const keys = [...Object.keys(FIGURES).map((id) => `figure:${id}`), ...moves.map((x) => `move:${x.id}`)];
  const out: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]));
  const perWork: Record<string, Map<string, number>> = Object.fromEntries(keys.map((k) => [k, new Map()]));
  const manyWorks = new Set(rows.map((r) => r.work)).size >= 3;
  const open = new Set(keys);
  const pool = shuffled(
    rows.filter((r) => r.words >= 6 && r.words <= 60 && !exclude.has(r.work)),
    7,
  );
  for (const r of pool) {
    if (!open.size) break;
    let terms: Set<string> | null = null;
    const termsOf = () => (terms ??= new Set(findFigures(m, r.text).map((f) => f.term)));
    for (const key of [...open]) {
      const ws = perWork[key]!;
      if (manyWorks && (ws.get(r.work) ?? 0) >= 3) continue;
      const id = key.slice(key.indexOf(':') + 1);
      if (key.startsWith('move:')) {
        const move = moves.find((x) => x.id === id)!;
        const reg = move.register === 'any' || r.register === move.register || (move.register === 'narration' && r.register === 'letter');
        if (!reg || !m.exemplifies(move, r.text)) continue;
      } else {
        const want = id === 'irony' ? ['gnomic', 'aside'] : [id];
        if (id === 'fid' && r.spoken) continue;
        if (!want.some((w) => mayShow(w, r.text)) || !want.some((w) => termsOf().has(w)) || !m.shows({ id }, r.text)) continue;
      }
      out[key]!.push(r.id);
      ws.set(r.work, (ws.get(r.work) ?? 0) + 1);
      if (out[key]!.length >= EXEMPLARS) open.delete(key);
    }
  }
  const exemplars: Record<string, number[]> = {};
  const moveExemplars: Record<string, number[]> = {};
  for (const id of Object.keys(FIGURES)) exemplars[id] = out[`figure:${id}`]!;
  for (const mv of moves) {
    if (mv.id in FIGURES) moveExemplars[mv.id] = out[`move:${mv.id}`]!;
    else exemplars[mv.id] = out[`move:${mv.id}`]!;
  }
  return { exemplars, moveExemplars };
}

function signatureOf(m: AuthorModel, own: ReturnType<typeof wordTable>, others: UnigramTable[]): { words: SignatureWord[]; ratio: (w: string) => number } {
  const otherTotal = others.reduce((a, t) => a + t.total, 0);
  const pooled = (w: string) => others.reduce((a, t) => a + (t.counts.get(w) ?? 0), 0);
  const ratio = (w: string) => (otherTotal ? ((own.counts.get(w) ?? 0) + 0.5) / own.total / ((pooled(w) + 0.5) / otherTotal) : 1);
  if (!others.length) return { words: [], ratio };
  const exclude = new Set(m.author.linkExclude ?? []);
  const floor = Math.max(10, own.total / 100_000);
  const cands: { word: string; count: number; ratio: number; score: number }[] = [];
  for (const [w, c] of own.counts) {
    if (c < floor || w.length < 3 || !/^[a-z][a-z'’-]*[a-z]$/.test(w)) continue;
    // Names are the matter, not the manner.
    if ((own.caps.get(w) ?? 0) / c > 0.4) continue;
    const r = ratio(w);
    if (r < 3) continue;
    cands.push({ word: w, count: c, ratio: r, score: Math.log(r) * Math.log(c) });
  }
  cands.sort((a, b) => b.score - a.score);
  const words = cands.slice(0, SIGNATURE_WORDS).map(({ word, count, ratio: r }) => {
    const hit = m.search([word], { minWords: 8, maxWords: 30, limit: 6 }).find((c) => !exclude.has(c.work)) ?? null;
    return { word, count, ratio: Math.round(r * 10) / 10, sentence: hit ? { id: hit.id, text: hit.text, cite: hit.cite } : null };
  });
  return { words, ratio };
}

function fingerprintProfile(m: AuthorModel): Fingerprint {
  const p = m.profile;
  const joinTotal = Object.values(p.joins).reduce((a, b) => a + b, 0) || 1;
  const joins = Object.entries(p.joins)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([join, n]) => ({ join, share: Math.round((n / joinTotal) * 1000) / 1000 }));
  const narr = Object.values(p.contractions).reduce((a, c) => a + c.narr, 0);
  const dial = Object.values(p.contractions).reduce((a, c) => a + c.dial, 0);
  const per = (n: number, words: number) => (words ? Math.round((n / words) * 1000 * 100) / 100 : 0);
  return {
    sentenceLength: p.sentenceLength,
    paragraphWords: p.paragraphWords,
    punctuationPerSentence: p.punctuationPerSentence,
    joins,
    per1000: { ...p.per1000, contractionsNarration: per(narr, p.narrationWords), contractionsSpeech: per(dial, p.dialogueWords) },
  };
}

function guessRounds(m: AuthorModel, rows: Row[], tables: UnigramTable[], ratio: (w: string) => number, own: UnigramTable): GuessRound[] {
  const exclude = new Set(m.author.linkExclude ?? []);
  const pool = shuffled(
    rows.filter((r) => r.words >= 10 && r.words <= 35 && !exclude.has(r.work)),
    11,
  ).slice(0, GUESS_ROUNDS * 6);
  const scored: { r: Row; margin: number; distractors: string[] }[] = [];
  for (const r of pool) {
    const s = unigramScores(tables, r.text, m.author.id);
    const rank = s.findIndex((x) => x.voice === m.author.id);
    // A round the classifier ranks the voice no better than third gives the reader no fair chance.
    if (tables.length > 1 && rank > 1) continue;
    const others = s.filter((x) => x.voice !== m.author.id);
    const mine = s[rank]!.score;
    scored.push({ r, margin: others.length ? Math.round((mine - others[0]!.score) * 1000) / 1000 : 0, distractors: others.slice(0, 2).map((x) => x.voice) });
  }
  // Spread over the margins, easy to hard.
  scored.sort((a, b) => b.margin - a.margin);
  const step = Math.max(1, scored.length / GUESS_ROUNDS);
  const picked: typeof scored = [];
  for (let i = 0; i < scored.length && picked.length < GUESS_ROUNDS; i += step) picked.push(scored[Math.floor(i)]!);
  return picked.map(({ r, margin, distractors }) => {
    const seen = new Set<string>();
    const tellWords: { word: string; ratio: number }[] = [];
    for (const t of tokenize(r.text)) {
      const w = t.norm;
      if (t.kind !== 'word') continue;
      if (seen.has(w) || (own.counts.get(w) ?? 0) < 3) continue;
      seen.add(w);
      const x = ratio(w);
      if (x >= 2) tellWords.push({ word: w, ratio: Math.round(x * 10) / 10 });
    }
    tellWords.sort((a, b) => b.ratio - a.ratio);
    const figures = [...new Set(findFigures(m, r.text, { spoken: r.spoken }).map((f) => f.term))];
    const dist = r.spoken ? m.profile.sentenceLength.dialogue : m.profile.sentenceLength.narration;
    return {
      id: r.id,
      text: r.text,
      cite: m.cite(r.id)?.cite ?? '',
      words: r.words,
      margin,
      distractors,
      tells: { words: tellWords.slice(0, 3), figures, lengthPercentile: percentileIn(dist, r.words) },
    };
  });
}

/** About SHAPE_SENTENCES sentences: the openings of letters first, so a salutation has its like, then the rest at random. */
function shapeIndex(m: AuthorModel, rows: Row[]): { entries: ShapeEntry[]; vecs: Float32Array } {
  const exclude = new Set(m.author.linkExclude ?? []);
  const ok = rows.filter((r) => r.words >= 2 && r.words <= 60 && !exclude.has(r.work));
  const openings = ok.filter((r) => r.register === 'letter' && r.first).slice(0, 1000);
  const chosen = new Set(openings.map((r) => r.id));
  const rest = shuffled(ok.filter((r) => !chosen.has(r.id)), 13).slice(0, Math.max(0, SHAPE_SENTENCES - openings.length));
  const picked = [...openings, ...rest].sort((a, b) => a.id - b.id);
  const idx = m.sifIndex();
  const dims = idx.pc.length;
  const vecs = new Float32Array(picked.length * dims);
  const entries = picked.map((r, i) => {
    const toks = tokenize(r.text);
    const v = m.contextVector(toks.filter((t) => t.kind === 'word').map((t) => t.norm));
    if (v) {
      let dot = 0;
      for (let j = 0; j < dims; j++) dot += v[j]! * idx.pc[j]!;
      let n = 0;
      for (let j = 0; j < dims; j++) {
        v[j]! -= dot * idx.pc[j]!;
        n += v[j]! ** 2;
      }
      n = Math.sqrt(n) || 1;
      for (let j = 0; j < dims; j++) v[j]! /= n;
      vecs.set(v, i * dims);
    }
    const tags = r.tags ? r.tags.split(' ') : m.tagger.tagTokens(toks);
    return { id: r.id, text: r.text, cite: m.cite(r.id)?.cite ?? '', words: r.words, register: r.register, first: r.first, tags: tagSkeleton(tags), punct: punctSkeleton(r.text) };
  });
  return { entries, vecs };
}

export function buildPack(id: string, against: string[] = builtVoices(), log: (s: string) => void = console.log): PackFile {
  const t0 = performance.now();
  const lap = (what: string) => log(`  ${id}: ${what} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  forgetPack(id);
  const m = AuthorModel.open(id);
  const rows = rowsOf(m);
  const idx = m.sifIndex();
  lap(`${rows.length.toLocaleString()} sentences, vectors ready`);
  const own = wordTable(id);
  const others = against.filter((x) => x !== id).map(wordTable);
  const tables: UnigramTable[] = [own, ...others];

  const { exemplars, moveExemplars } = exemplarsOf(m, rows);
  const tables_ = [...Object.values(exemplars), ...Object.values(moveExemplars)];
  lap(`exemplars for ${tables_.filter((x) => x.length).length} of ${tables_.length} moves and figures`);
  const sig = signatureOf(m, own, others);
  const goodFor = ((m.author as { goodFor?: Kind[] }).goodFor ?? []).filter((k) => KINDS.includes(k));
  const structure = typicalOrder(m, goodFor[0] ? { kind: goodFor[0] } : {});
  const guess = guessRounds(m, rows, tables, sig.ratio, own);
  lap(`${guess.length} guess rounds`);
  const shape = shapeIndex(m, rows);
  lap(`${shape.entries.length} sentences in the shape index`);

  const vectorWords = [...m.vectors.keys()];
  const dims = idx.pc.length;
  const wordVecs = new Float32Array(vectorWords.length * dims);
  vectorWords.forEach((w, i) => wordVecs.set(m.vectors.get(w)!, i * dims));
  const counts: Record<string, number> = {};
  for (const [w, c] of own.counts) if (c >= 2 || m.vectors.has(w)) counts[w] = c;

  const pack: PackFile = {
    version: PACK_VERSION,
    id,
    builtAt: new Date().toISOString(),
    fingerprint: m.fingerprint,
    against: others.map((t) => t.id),
    total: own.total,
    counts,
    signature: sig.words,
    exemplars,
    moveExemplars,
    profile: fingerprintProfile(m),
    structure: { kind: structure.kind, order: structure.order, support: structure.support, passages: structure.passages, signature: structure.signature },
    guess,
    shape: shape.entries,
    vectorWords,
    dims,
  };
  const paths = packPaths(id);
  mkdirSync(packDir(), { recursive: true });
  writeSif(paths.sif, { fingerprint: m.fingerprint, dims }, {
    'shape.vecs': shape.vecs,
    'word.vecs': wordVecs,
    pc: idx.pc,
    'full.ids': idx.ids,
    'full.words': idx.words,
    'full.register': idx.register,
    'full.vecs': idx.vecs,
  });
  writeFileSync(paths.json, JSON.stringify(pack));
  m.db.close();
  forgetPack(id);
  lap('written');
  return pack;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = builtVoices();
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  for (const id of ids) if (!all.includes(id)) throw new Error(`No built model for "${id}": run npm run build:model -- ${id}`);
  for (const id of ids.length ? ids : all) buildPack(id, all);
}
