// The page's rewrite: a writer's text in, three columns out. Their sentences (with the words the author never used),
// the author's rendering sentence by sentence (each with why and the author's sentence it follows), and the notes on
// each paragraph: the moves made, each with a sentence of the author's that shows it.
//
// A text is rewritten in parts of a few paragraphs, all at once, and each part is sent to the page as it is done:
// the engine's brief for each part feeds the model, and the engine checks what comes back.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import { DATA, ROOT } from '../db.ts';
import { blocksOfText, type DocBlock } from '../engine/doc.ts';
import type { AuthorModel, Citation } from '../engine/model.ts';
import { PASSES, READER, rewriteWithAI, WRITER_MODEL, type RewriteProgress, type RewriteResult } from './rewrite.ts';

/** Words in a part: enough for the author's manner to show and for paragraphs to move, few enough to answer in seconds. */
const PART_WORDS = Number(process.env.ADVISOR_PART_WORDS ?? 600);
/** Parts written at once. */
const AT_ONCE = Number(process.env.ADVISOR_AT_ONCE ?? 6);
/** The most a page may send. */
export const MAX_CHARS = 24000;

export interface Quote {
  id: number;
  text: string;
  cite: string;
  /** The words that make the move, to mark. */
  mark?: [number, number];
}
export interface YourSentence {
  n: number;
  text: string;
  /** Words the author never wrote, and the author's words for each. */
  never: { word: string; alternatives: string[] }[];
}
export interface HerSentence {
  text: string;
  /** The writer's sentences (by n) it renders. */
  from: number[];
  why: string;
  model: Quote | null;
  /** The author's moves the engine finds in it that the writer's sentence did not make, by name. */
  moves: string[];
}
export interface Note {
  /** A move of the author's; a mending of the writer's sense; or where the paragraph's matter came from. */
  kind: 'move' | 'sense' | 'structure' | 'liberty';
  technique: string;
  before: string;
  after: string;
  /** For sense and structure: what to tell the writer. */
  text?: string;
  quote: Quote | null;
  verified: boolean;
}
export type Row =
  | { kind: 'heading'; index: number; text: string; title: boolean }
  | {
      kind: 'paragraph';
      index: number;
      part: number;
      yours: YourSentence[];
      hers: HerSentence[] | null;
      notes: Note[];
      /** The writer's paragraphs (numbered through the text) this one renders, where they are not just its own. */
      from?: number[];
      error?: string;
    };

export interface PartResult {
  part: number;
  rows: Row[];
  explanation: string;
  error?: string;
}

const quoteOf = (c: Citation | null | undefined): Quote | null => (c && c.text ? { id: c.id, text: c.text, cite: c.cite } : null);
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** "shop (a mercantile establishment…; 33×)" → "shop". */
const altWord = (a: string) => a.replace(/\s*\(.*$/, '').trim();

/** The text's blocks, numbered, and its paragraphs gathered into parts. */
export function plan(text: string): { blocks: DocBlock[]; parts: number[][] } {
  const blocks = blocksOfText(text);
  const parts: number[][] = [];
  let cur: number[] = [];
  let n = 0;
  const close = () => {
    if (cur.length) parts.push(cur);
    cur = [];
    n = 0;
  };
  blocks.forEach((b, i) => {
    if (b.kind !== 'paragraph' && b.kind !== 'quote' && b.kind !== 'item') return close();
    const w = words(b.text);
    if (cur.length && n + w > PART_WORDS) close();
    cur.push(i);
    n += w;
  });
  close();
  return { blocks, parts };
}

/** “1”, “1 and 2”, “1, 2 and 3”. */
const list = (ns: number[]) => (ns.length < 2 ? String(ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`);

/**
 * One part's rewrite, laid out as rows that follow the author's paragraphs, which may move, merge or split the
 * writer's. Beside each, the writer's sentences it renders; and in its notes, the moves made, any mending of sense,
 * and where its matter came from when that is not simply the writer's paragraph in the same place.
 * `paraNo` numbers the writer's paragraphs through the whole text, by block index.
 */
export function rowsOf(blocks: DocBlock[], idx: number[], part: number, r: RewriteResult, offset: number, paraNo: Map<number, number> = new Map(), m?: AuthorModel): Row[] {
  void blocks;
  type Para = Row & { kind: 'paragraph' };
  const numberOf = (p: number) => paraNo.get(idx[p - 1]!) ?? p;
  const source = new Map(r.source.map((x) => [x.n, x]));
  const yourSentence = (n: number): YourSentence => {
    const x = source.get(n)!;
    return { n: offset + n, text: x.text, never: x.never.map((w) => ({ word: w.word, alternatives: w.alternatives.map(altWord).filter(Boolean).slice(0, 4) })) };
  };
  const rows: Para[] = r.paragraphs.map((_p, k) => ({ kind: 'paragraph', index: idx[0]! + (k + 1) / 1000, part, yours: [], hers: [], notes: [] }));
  const used = new Set<number>();
  const sourcesOf: number[][] = [];
  let k0 = 0;
  r.paragraphs.forEach((p, k) => {
    const ns = new Set<number>();
    for (const x of p.sentences) {
      const a = r.aligned[k0++];
      const from = (a?.from ?? []).filter((n) => source.has(n));
      from.forEach((n) => ns.add(n));
      const names = (a?.moves ?? []).map((id) => (m?.author.moves ?? []).find((mv) => mv.id === id)?.name ?? id);
      rows[k]!.hers!.push({ text: x.text, from: from.map((n) => offset + n), why: a?.why ?? '', model: quoteOf(a?.model), moves: names });
    }
    sourcesOf[k] = [...ns].sort((a, b) => a - b);
    // The writer's sentences beside the first paragraph that renders them, in the writer's order.
    for (const n of sourcesOf[k]!) if (!used.has(n)) (used.add(n), rows[k]!.yours.push(yourSentence(n)));
  });
  // A sentence of the writer's that nothing names stays beside the paragraph that renders the one before it.
  for (const x of r.source) {
    if (used.has(x.n)) continue;
    const k = Math.max(0, sourcesOf.findLastIndex((ns) => ns.some((n) => n < x.n)));
    if (!rows[k]) continue;
    rows[k]!.yours.push(yourSentence(x.n));
    rows[k]!.yours.sort((a, b) => a.n - b.n);
    used.add(x.n);
  }

  // Where each paragraph's matter came from, when the author moved, merged or split the writer's.
  const parasOf = (k: number) => [...new Set((sourcesOf[k] ?? []).map((n) => source.get(n)!.paragraph))].sort((a, b) => a - b);
  const writerCount = new Set(r.source.map((x) => x.paragraph)).size;
  const identity = rows.length === writerCount && rows.every((_r, k) => parasOf(k).length === 1 && parasOf(k)[0] === k + 1);
  if (!identity) {
    const seen = new Map<number, number>();
    let latest = 0;
    rows.forEach((row, k) => {
      const ps = parasOf(k);
      if (!ps.length) return;
      row.from = ps.map(numberOf);
      const split = ps.filter((p) => rows.some((_x, j) => j !== k && parasOf(j).includes(p)));
      let text = '';
      if (ps.length > 1) text = `Brings together your paragraphs ${list(ps.map(numberOf))}.`;
      else if (split.length) text = seen.has(ps[0]!) ? `The rest of your paragraph ${numberOf(ps[0]!)}, given a paragraph of its own.` : `Begins your paragraph ${numberOf(ps[0]!)}, which the next paragraph finishes.`;
      // Moved: told after a paragraph of the writer's that came after it.
      else if (ps[0]! < latest) text = `Your paragraph ${numberOf(ps[0]!)}, told after your paragraph ${numberOf(latest)}: the telling reaches it later.`;
      else if (k === 0 && ps[0]! > 1) text = `Your paragraph ${numberOf(ps[0]!)}, told first.`;
      for (const p of ps) seen.set(p, k);
      latest = Math.max(latest, ...ps);
      if (text) row.notes.push({ kind: 'structure', technique: 'Structure', before: '', after: '', text, quote: null, verified: true });
    });
  }

  // Each note goes with the paragraph its words are most in: the author's words first, then the writer's. (The model
  // does not always quote itself exactly, so by the words shared, not by the string.)
  const wordsOf = (t: string) => new Set(t.toLowerCase().match(/[\p{L}'’]{3,}/gu) ?? []);
  const overlap = (a: Set<string>, t: string) => {
    const b = wordsOf(t);
    let n = 0;
    for (const w of a) if (b.has(w)) n++;
    return n;
  };
  const place = (after: string, before: string) => {
    const aw = wordsOf(after);
    const bw = wordsOf(before);
    let hit = 0;
    let best = -1;
    rows.forEach((row, k) => {
      const score = 2 * overlap(aw, (row.hers ?? []).map((x) => x.text).join(' ')) + overlap(bw, row.yours.map((x) => x.text).join(' '));
      if (score > best) [best, hit] = [score, k];
    });
    return rows[hit];
  };
  // What did not make sense comes first: it is the first thing the writer should hear.
  for (const x of r.sense ?? [])
    place(x.after, x.before)?.notes.unshift({ kind: 'sense', technique: 'Sense', before: x.before, after: x.after, text: `${x.problem.trim()} ${x.resolution.trim()}`, quote: null, verified: true });
  for (const n of r.notes)
    place(n.after, n.before)?.notes.push({ kind: 'move', technique: n.technique, before: n.before, after: n.after, quote: n.austen ? { id: n.id ?? 0, text: n.austen, cite: n.cite, mark: n.mark } : null, verified: n.verified });
  // What the voice added, said plainly: the writer should know which words are not theirs.
  for (const x of r.liberties ?? []) place(x.after, '')?.notes.push({ kind: 'liberty', technique: 'Liberty taken', before: '', after: x.after, text: x.why, quote: null, verified: true });
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// The same text in the same voice is not paid for twice: each finished rewrite is kept, keyed by the text, the voice,
// the writer and the reader, and a fingerprint of everything that shapes the answer (the prompt's code, the engine's
// brief, the voice's settings). Change any of them and the old answers are no longer found.

const CACHE = join(DATA, 'cache', 'rewrites');
const SHAPES = ['src/server/rewrite.ts', 'src/server/page.ts', 'src/engine/brief.ts', 'src/engine/explain.ts'].map((f) => {
  try {
    return readFileSync(join(ROOT, f), 'utf8');
  } catch {
    return f;
  }
});
function cacheKey(m: AuthorModel, text: string, instructions: string): string {
  const h = createHash('sha256');
  for (const x of [...SHAPES, JSON.stringify(m.author), WRITER_MODEL, READER, String(PASSES), process.env.ADVISOR_THINKING ?? '', instructions, text.trim()]) h.update(x).update('\u0000');
  return h.digest('hex').slice(0, 40);
}

/** Writes the rewrite to the page as it goes: progress lines, each part's rows when done, then the end. */
export async function streamRewrite(res: ServerResponse, m: AuthorModel, text: string, instructions = '', fresh = false): Promise<void> {
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
  const t0 = Date.now();
  let closed = false;
  res.on('close', () => (closed = true));
  const key = process.env.ADVISOR_CACHE === 'off' ? '' : cacheKey(m, text, instructions);
  const kept = key ? join(CACHE, `${key}.ndjson`) : '';
  if (kept && !fresh && existsSync(kept)) {
    res.write(JSON.stringify({ type: 'progress', elapsed: 0, done: 0, parts: 1, drafts: 0, calls: 0, log: ['kept from before'] }) + '\n');
    res.end(readFileSync(kept, 'utf8'));
    return;
  }
  const recorded: string[] = [];
  let failed = false;
  const line = (o: { type: string; error?: string; [k: string]: unknown }) => {
    const s = JSON.stringify(o) + '\n';
    if (o.type !== 'progress') recorded.push(s);
    if (o.type === 'part' && o.error) failed = true;
    if (!closed) res.write(s);
  };

  const { blocks, parts } = plan(text);
  const paraNo = new Map(parts.flat().map((i, k) => [i, k + 1]));
  // The headings stand as the writer wrote them, and every paragraph appears at once with its own sentences.
  const headings: Row[] = blocks.flatMap((b, i) => (b.kind === 'title' || b.kind === 'heading' ? [{ kind: 'heading' as const, index: i, text: b.text, title: b.kind === 'title' }] : []));
  line({ type: 'plan', parts: parts.length, headings, paragraphs: parts.flatMap((idx, part) => idx.map((i) => ({ index: i, part, text: blocks[i]!.text }))) });
  if (!parts.length) {
    line({ type: 'done', elapsed: Date.now() - t0 });
    res.end();
    return;
  }

  const state = parts.map(() => ({ what: 'waiting', calls: 0, draft: 0, done: false }));
  const log: string[] = [];
  const tell = () =>
    line({
      type: 'progress',
      elapsed: Date.now() - t0,
      done: state.filter((s) => s.done).length,
      parts: parts.length,
      drafts: state.reduce((a, s) => a + s.draft, 0),
      calls: state.reduce((a, s) => a + s.calls, 0),
      log: log.slice(-4),
    });
  const beat = setInterval(tell, 3000);
  tell();

  let next = 0;
  const offsets: number[] = [];
  const run = async (): Promise<void> => {
    while (next < parts.length && !closed) {
      const part = next++;
      const idx = parts[part]!;
      const sub = idx.map((i) => blocks[i]!);
      const prev = idx[0]! > 0 ? blocks[idx[0]! - 1]!.text : '';
      const after = blocks[idx.at(-1)! + 1]?.text ?? '';
      // The brief is built at once and on this thread: let the page hear what is happening first.
      await new Promise((ok) => setImmediate(ok));
      try {
        const r = await rewriteWithAI(m, sub, { before: prev, after, instructions, strength: 'full' }, (what: string, p: RewriteProgress) => {
          state[part] = { what, calls: p.calls, draft: p.draft, done: false };
          log.push(parts.length > 1 ? `Part ${part + 1}: ${what}` : what);
          tell();
        });
        state[part]!.done = true;
        // Sentence numbers run through the whole text, so a sentence of the author's points at the writer's.
        offsets[part] = 1000 * part;
        line({ type: 'part', part, rows: rowsOf(blocks, idx, part, r, offsets[part]!, paraNo, m), reading: r.reading, usage: r.usage, explanation: r.explanation, model: r.model, scoreBefore: r.scoreBefore, scoreAfter: r.scoreAfter } satisfies PartResult & Record<string, unknown>);
        log.push(parts.length > 1 ? `Part ${part + 1} done` : 'done');
      } catch (e) {
        state[part]!.done = true;
        const error = String((e as Error).message ?? e);
        log.push(`Part ${part + 1}: ${error}`);
        line({ type: 'part', part, error, rows: idx.map((i) => ({ kind: 'paragraph', index: i, part, yours: [{ n: -1, text: blocks[i]!.text, never: [] }], hers: null, notes: [], error })) });
      }
      tell();
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, parts.length) }, run));
  clearInterval(beat);
  line({ type: 'done', elapsed: Date.now() - t0 });
  res.end();
  // Kept only whole: a rewrite with a part that failed is tried again next time.
  if (kept && !failed && !closed) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(kept, recorded.join(''));
  }
}
