// The page's rewrite: a writer's text in, three columns out. The writer's sentences (with the words the voice never
// used), the voice's rendering sentence by sentence, and the WHY notes on each paragraph, which the engine writes:
// where the sense was mended, the moves the voice made (each with a sentence of the voice's own that makes it), the
// words the voice added, and where a paragraph's matter came from.
//
// A text is rewritten in parts of whole paragraphs. Each part is looked for first among the samples rewritten ahead
// of time, then in the cache, and only then sent to the writer, within the budget (src/server/cache.ts).

import type { ServerResponse } from 'node:http';
import { blocksOfText, type DocBlock } from '../engine/doc.ts';
import type { AuthorModel, Citation } from '../engine/model.ts';
import { notesFor, type NoteRow } from '../engine/notes.ts';
import {
  findPrecomputed,
  inFlight,
  limits,
  partKeys,
  precomputedRoot,
  rewriteCache,
  singleFlight,
  textHash,
  type Admission,
  type Refusal,
  type RewriteCache,
} from './cache.ts';
import { send } from './http.ts';
import { pack } from './models.ts';
import { PROMPT_VERSION, promptFingerprint, rewriteWithAI, tierOf, type RewriteProgress, type RewriteResult, type WriterClient } from './rewrite.ts';

/** Words in a part: enough for the voice's manner to show and for paragraphs to move, few enough to answer in seconds. */
const PART_WORDS = Number(process.env.ADVISOR_PART_WORDS ?? 600);
/** The most parts one request may send to the writer; the rest rest as `long`. Headings close a part, so a text of
 * many short sections would otherwise make a writer call for each. */
const MAX_WRITES = Number(process.env.ADVISOR_PARTS ?? 3);
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
  /** Words the voice never wrote, and the voice's words for each. */
  never: { word: string; alternatives: string[] }[];
}
export interface HerSentence {
  text: string;
  /** The writer's sentences (by n) it renders. */
  from: number[];
  /** The voice's moves the engine finds in it that the writer's sentence did not make, by name. */
  moves: string[];
  /** No longer sent: the old page reads them until it is rebuilt (S13), and finds them empty. */
  why?: string;
  model?: Quote | null;
}
export interface Note {
  /** A mending of the writer's sense; a move of the voice's; words the voice added; where the paragraph came from. */
  kind: 'move' | 'sense' | 'structure' | 'liberty';
  /** The label: the move's plain name, “Mended”, “Added by Lincoln”, “Structure”. */
  technique: string;
  before: string;
  after: string;
  /** What to tell the writer, in a line. */
  text?: string;
  quote: Quote | null;
  verified: boolean;
  /** For a move: its id, the same for every name it goes by. */
  id?: string;
  /** For a move: the glossary id that defines it. */
  term?: string;
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
      /** No full rewrite: `long` past the word cap, `budget` when rewrites are resting. */
      resting?: 'long' | 'budget';
    };

export interface PartResult {
  part: number;
  rows: Row[];
  explanation: string;
  error?: string;
}

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

/** What the engine's notes need beyond the rewrite: the moves already noted on the page, and the pack's examples. */
export interface RowNoteOptions {
  /** Moves noted by earlier parts of the page; updated. */
  seen?: Set<string>;
  /** The voice's pack table of sentence ids for each move and figure. */
  exemplars?: Record<string, number[]>;
}

/**
 * One part's rewrite, laid out as rows that follow the voice's paragraphs, which may move, merge or split the
 * writer's. Beside each, the writer's sentences it renders; and in its notes, what the engine finds to say of it
 * (notesFor). `paraNo` numbers the writer's paragraphs through the whole text, by block index. Without a model,
 * only the writer's own notes are placed.
 */
export function rowsOf(blocks: DocBlock[], idx: number[], part: number, r: RewriteResult, offset: number, paraNo: Map<number, number> = new Map(), m?: AuthorModel, opts: RowNoteOptions = {}): Row[] {
  void blocks;
  type Para = Row & { kind: 'paragraph' };
  const numberOf = (p: number) => paraNo.get(idx[p - 1]!) ?? p;
  const source = new Map(r.source.map((x) => [x.n, x]));
  const yourSentence = (n: number): YourSentence => {
    const x = source.get(n)!;
    return { n: offset + n, text: x.text, never: x.never.map((w) => ({ word: w.word, alternatives: w.alternatives.map(altWord).filter(Boolean).slice(0, 4) })) };
  };
  const rows: Para[] = r.paragraphs.map((_p, k) => ({ kind: 'paragraph', index: idx[0]! + (k + 1) / 1000, part, yours: [], hers: [], notes: [] }));
  const moveIds: string[][][] = rows.map(() => []);
  const used = new Set<number>();
  const sourcesOf: number[][] = [];
  let k0 = 0;
  r.paragraphs.forEach((p, k) => {
    const ns = new Set<number>();
    for (const x of p.sentences) {
      const a = r.aligned[k0++];
      const from = (a?.from ?? []).filter((n) => source.has(n));
      from.forEach((n) => ns.add(n));
      const ids = a?.moves ?? [];
      const names = ids.map((id) => (m?.author.moves ?? []).find((mv) => mv.id === id)?.name ?? id);
      rows[k]!.hers!.push({ text: x.text, from: from.map((n) => offset + n), moves: names });
      moveIds[k]!.push(ids);
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

  // Where each paragraph's matter came from, when the voice moved, merged or split the writer's.
  const structure: string[] = rows.map(() => '');
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
      // Moved: placed after a paragraph of the writer's that came after it.
      else if (ps[0]! < latest) text = `Your paragraph ${numberOf(ps[0]!)}, moved after your paragraph ${numberOf(latest)}.`;
      else if (k === 0 && ps[0]! > 1) text = `Your paragraph ${numberOf(ps[0]!)}, moved to the front.`;
      for (const p of ps) seen.set(p, k);
      latest = Math.max(latest, ...ps);
      structure[k] = text;
    });
  }

  if (m) {
    const noteRows: NoteRow[] = rows.map((row, k) => ({
      yours: row.yours.map((y) => ({ n: y.n, text: y.text })),
      hers: (row.hers ?? []).map((h, j) => ({ text: h.text, from: h.from, moves: moveIds[k]![j] ?? [] })),
      ...(row.from ? { from: row.from } : {}),
      ...(structure[k] ? { structure: structure[k] } : {}),
    }));
    const notes = notesFor(m, noteRows, { sense: r.sense ?? [], liberties: r.liberties ?? [], seen: opts.seen, exemplars: opts.exemplars });
    rows.forEach((row, k) => (row.notes = notes[k] ?? []));
    return rows;
  }

  // No model to read the rewrite with: the structure, and the notes that came with it, each placed by its words.
  rows.forEach((row, k) => {
    if (structure[k]) row.notes.push({ kind: 'structure', technique: 'Structure', before: '', after: '', text: structure[k], quote: null, verified: true });
  });
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
  for (const x of r.sense ?? []) place(x.after, x.before)?.notes.unshift({ kind: 'sense', technique: 'Sense', before: x.before, after: x.after, text: `${x.problem.trim()} ${x.resolution.trim()}`, quote: null, verified: true });
  for (const n of r.notes ?? [])
    place(n.after, n.before)?.notes.push({ kind: 'move', technique: n.technique, before: n.before, after: n.after, quote: n.austen ? { id: n.id ?? 0, text: n.austen, cite: n.cite, mark: n.mark } : null, verified: n.verified });
  for (const x of r.liberties ?? []) place(x.after, '')?.notes.push({ kind: 'liberty', technique: 'Liberty taken', before: '', after: x.after, text: x.why, quote: null, verified: true });
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// Streaming a rewrite to the page.

/** One part's rewrite as the cache keeps it: the writer's result without its tool calls or per-sentence boilerplate. */
type Kept = RewriteResult;

const keep = (r: RewriteResult): Kept => {
  const { toolCalls: _drop, ...rest } = r;
  void _drop;
  return { ...rest, toolCalls: [], aligned: r.aligned.map((a) => ({ after: a.after, before: a.before, from: a.from, moves: a.moves, why: '', model: null as unknown as Citation })) };
};

const fingerprints = new Map<string, string>();
/** promptFingerprint for a voice, worked out once: its system prompt does not change while the server runs. */
function fingerprintOf(m: AuthorModel): string {
  const id = m.author.id;
  if (!fingerprints.has(id)) fingerprints.set(id, promptFingerprint(m));
  return fingerprints.get(id)!;
}

/** The pack's sentences for each move and figure, a move's own before a figure's of the same name. */
function exemplarsOf(voice: string): Record<string, number[]> | undefined {
  try {
    const p = pack(voice);
    return p ? { ...p.exemplars, ...p.moveExemplars } : undefined;
  } catch {
    return undefined;
  }
}

export interface StreamOptions {
  /** The writer to call; the injected or the provider's when left out. */
  writer?: WriterClient;
  /** The cache; the server's when left out, none when null. */
  cache?: RewriteCache | null;
  /** Where the samples rewritten ahead of time are; data/precomputed when left out, none when null. */
  precomputed?: string | null;
  /** Asked once, before any writer call, with the number of parts to write. A refusal is answered as JSON. */
  admit?: (calls: number) => Admission | Refusal;
}

/** A line of the stream. */
export type Line = { type: string; [k: string]: unknown };

/**
 * Writes the rewrite to the page as it goes: a plan, progress lines, each part's rows when done, then the end. A
 * sample (or nearly one) comes from the rewrites made ahead of time; a part kept from before comes from the cache;
 * the rest are written, at most one call for each part however many ask for it at once.
 */
export async function streamRewrite(res: ServerResponse, m: AuthorModel, text: string, instructions = '', fresh = false, opts: StreamOptions = {}): Promise<void> {
  const t0 = Date.now();
  const voice = m.author.id;
  let closed = false;
  res.on('close', () => (closed = true));
  const head = () => res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
  const line = (o: Line) => {
    if (!closed) res.write(JSON.stringify(o) + '\n');
  };

  // A sample, or within 3% of one: made ahead of time, and served whole.
  const preDir = opts.precomputed === undefined ? precomputedRoot() : opts.precomputed;
  if (preDir && !fresh && !instructions.trim()) {
    const pre = findPrecomputed(voice, text, preDir);
    if (pre) {
      head();
      const parts = pre.lines.filter((l) => l.type === 'part').length;
      line({ type: 'progress', elapsed: 0, done: parts, parts, drafts: 0, calls: 0, log: ['made ahead of time'], kept: 'sample', sample: pre.sample, exact: pre.exact });
      for (const l of pre.lines) if (l.type !== 'progress') line(l);
      res.end();
      return;
    }
  }

  const cache = process.env.ADVISOR_CACHE === 'off' ? null : opts.cache === undefined ? rewriteCache() : opts.cache;
  const { blocks, parts } = plan(text);
  const paraNo = new Map(parts.flat().map((i, k) => [i, k + 1]));
  const tier = tierOf(voice);
  const fingerprint = parts.length ? fingerprintOf(m) : '';
  const cap = limits().words;

  // What each part needs: kept, joined to the same part being written for someone else, written, or not written.
  type How = 'kept' | 'join' | 'write' | 'long' | 'budget';
  const jobs = parts.map((idx, part) => {
    const before = idx[0]! > 0 ? blocks[idx[0]! - 1]!.text : '';
    const after = blocks[idx.at(-1)! + 1]?.text ?? '';
    const own = idx.map((i) => blocks[i]!.text).join('\n\n');
    return { part, idx, before, after, words: words(own), ...partKeys({ voice, tier, fingerprint, promptVersion: PROMPT_VERSION, instructions, text: own, before, after }), how: 'write' as How, kept: null as Kept | null, flight: null as Promise<Kept> | null };
  });
  let total = 0;
  let writing = 0;
  for (const j of jobs) {
    total += j.words;
    const hit = !fresh && cache ? cache.get(j.key, j.core) : null;
    if (hit) {
      try {
        j.kept = JSON.parse(hit.json) as Kept;
        j.how = 'kept';
        continue;
      } catch {
        // A row that does not parse is written again.
      }
    }
    const running = inFlight<Kept>(j.key);
    if (running) [j.how, j.flight] = ['join', running];
    // Past the word cap, or one paragraph longer than the cap by itself, or past the parts one request may write.
    else if (cap > 0 && total > cap && (j.part > 0 || j.words > cap)) j.how = 'long';
    else if (MAX_WRITES > 0 && ++writing > MAX_WRITES) j.how = 'long';
  }

  let admission: Admission | null = null;
  const writes = jobs.filter((j) => j.how === 'write');
  if (writes.length && opts.admit) {
    const a = opts.admit(writes.length);
    if (!a.ok) {
      // Nothing to show but the refusal: say so plainly, and the page keeps the engine's reading.
      if (!jobs.some((j) => j.how === 'kept' || j.how === 'join')) return send(res, a.status, a.body);
      for (const j of writes) j.how = 'budget';
    } else admission = a;
  }

  try {
    head();
    // The headings stand as the writer wrote them, and every paragraph appears at once with its own sentences.
    const headings: Row[] = blocks.flatMap((b, i) => (b.kind === 'title' || b.kind === 'heading' ? [{ kind: 'heading' as const, index: i, text: b.text, title: b.kind === 'title' }] : []));
    line({ type: 'plan', parts: parts.length, headings, paragraphs: parts.flatMap((idx, part) => idx.map((i) => ({ index: i, part, text: blocks[i]!.text }))) });
    if (!parts.length) {
      line({ type: 'done', elapsed: Date.now() - t0 });
      res.end();
      return;
    }

    const state = jobs.map((j) => ({ what: j.how === 'kept' ? 'kept from before' : 'waiting', calls: 0, draft: 0, done: j.how !== 'write' && j.how !== 'join' }));
    const log: string[] = [];
    const say = (part: number, what: string) => log.push(parts.length > 1 ? `Part ${part + 1}: ${what}` : what);
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

    // Moves are noted once on the page, whichever part comes back first.
    const seen = new Set<string>();
    const exemplars = exemplarsOf(voice);
    let whole = true;
    const emit = (j: (typeof jobs)[number], r: Kept, cached: boolean) => {
      try {
        const rows = rowsOf(blocks, j.idx, j.part, r, 1000 * j.part, paraNo, m, { seen, exemplars });
        line({ type: 'part', part: j.part, rows, reading: r.reading, ...(cached ? {} : { usage: r.usage }), explanation: r.explanation, model: r.model, tier: r.tier, promptVersion: r.promptVersion, scoreBefore: r.scoreBefore, scoreAfter: r.scoreAfter, cached });
      } catch (e) {
        fail(j, e);
      }
    };
    const fail = (j: (typeof jobs)[number], e: unknown) => {
      whole = false;
      const error = String((e as Error)?.message ?? e);
      say(j.part, error);
      line({ type: 'part', part: j.part, error, rows: j.idx.map((i) => ({ kind: 'paragraph', index: i, part: j.part, yours: [{ n: -1, text: blocks[i]!.text, never: [] }], hers: null, notes: [], error })) });
    };
    const rest = (j: (typeof jobs)[number], why: 'long' | 'budget') => {
      whole = false;
      line({ type: 'part', part: j.part, resting: why, rows: j.idx.map((i) => ({ kind: 'paragraph', index: i, part: j.part, yours: [{ n: -1, text: blocks[i]!.text, never: [] }], hers: null, notes: [], resting: why })) });
    };

    // The parts kept from before, and those not to be written, at once and in order.
    if (jobs.some((j) => j.how === 'kept')) log.push('kept from before');
    tell();
    for (const j of jobs) {
      if (j.how === 'kept') emit(j, j.kept!, true);
      else if (j.how === 'long' || j.how === 'budget') rest(j, j.how);
    }

    // The rest are written, a few at once; each claimed at once, so a second asker joins the first.
    let free = AT_ONCE;
    const waiting: (() => void)[] = [];
    const slot = () => (free > 0 ? (free--, Promise.resolve()) : new Promise<void>((ok) => waiting.push(ok)));
    const release = () => (waiting.length ? waiting.shift()!() : free++);
    for (const j of jobs) {
      if (j.how !== 'write') continue;
      j.flight = singleFlight(j.key, async () => {
        await slot();
        try {
          // The brief is built at once and on this thread: let the page hear what is happening first.
          await new Promise((ok) => setImmediate(ok));
          const r = await rewriteWithAI(
            m,
            j.idx.map((i) => blocks[i]!),
            { before: j.before, after: j.after, instructions, strength: 'full', spend: (n) => admission?.spend(n) },
            (what: string, p: RewriteProgress) => {
              state[j.part] = { what, calls: p.calls, draft: p.draft, done: false };
              say(j.part, what);
              tell();
            },
            opts.writer,
          );
          const kept = keep(r);
          // A rewrite the page cannot show is not kept: it would fail on every later request.
          rowsOf(blocks, j.idx, j.part, kept, 1000 * j.part, paraNo, m, { exemplars });
          cache?.put(j.key, j.core, voice, JSON.stringify(kept), r.model);
          return kept;
        } finally {
          release();
        }
      });
    }
    const beat = setInterval(tell, 3000);
    await Promise.all(
      jobs
        .filter((j) => j.flight)
        .map(async (j) => {
          try {
            const r = await j.flight!;
            state[j.part]!.done = true;
            emit(j, r, j.how === 'join');
            say(j.part, 'done');
          } catch (e) {
            state[j.part]!.done = true;
            fail(j, e);
          }
          tell();
        }),
    );
    clearInterval(beat);
    line({ type: 'done', elapsed: Date.now() - t0 });
    res.end();
    // A whole text rewritten in a voice is ready in it: the page can show so before anyone asks again.
    if (whole && cache && !instructions.trim()) cache.markReady(textHash(text), voice, PROMPT_VERSION);
  } finally {
    admission?.done();
  }
}

/** A response that keeps what it is sent. */
class Collector {
  status = 0;
  body: unknown = null;
  out: string[] = [];
  writeHead(status: number) {
    this.status = status;
    return this;
  }
  write(s: string) {
    this.out.push(s);
    return true;
  }
  end(s?: string) {
    if (s) this.out.push(s);
    return this;
  }
  on() {
    return this;
  }
}

/**
 * The lines a rewrite streams, collected: for scripts that write rewrites ahead of time (scripts/prewarm.ts). A
 * refusal comes back as one line of type 'refused'.
 */
export async function collectRewrite(m: AuthorModel, text: string, opts: StreamOptions & { instructions?: string; fresh?: boolean } = {}): Promise<Line[]> {
  const c = new Collector();
  await streamRewrite(c as unknown as ServerResponse, m, text, opts.instructions ?? '', opts.fresh ?? false, opts);
  const lines = c.out.join('').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Line);
  if (c.status !== 200) return [{ type: 'refused', status: c.status, ...(lines[0] ?? {}) }];
  return lines;
}
