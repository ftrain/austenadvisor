// Every sample rewritten ahead of time in every built voice, so a reader who picks a sample is served at once and no
// call is made. Each rewrite goes through a running server's own /api/rewrite, so it passes the same writer, gate,
// cache and engine notes as a reader's, and is kept as the lines the page is sent: data/precomputed/<sample>/<voice>.json.
//
//   node scripts/prewarm.ts                      write every pair that is missing or out of date
//   node scripts/prewarm.ts --stale              write again only the files whose prompt version is out of date
//   node scripts/prewarm.ts --check              list what is missing or out of date, and exit 1 if anything is
//   options: --at-once 4   --voices austen,twain   --samples breakup-text   --judge-share 0.1   --judge-label prewarm
//
// Needs the server running (BASE, default http://localhost:8080). A request from this machine is not counted against
// the daily budget. The run can be stopped and started again: a pair whose file has the current version is skipped.
//
// The writer tier. A voice marked 'fast' in data/tiers.json is written with the faster model, and samples should
// have the best. A part written on the fast tier is refused unless --allow-fast is given; move data/tiers.json aside
// while the prewarm runs, then put it back.
//
// The judge. A share of the pairs (10% by default, chosen by a hash of the pair, so the same ones each time) is
// saved in eval-voices' form to docs/eval/voices/<judge-label>.json. Judge them with
//   node scripts/eval-voices.ts <judge-label>-judged --rejudge <judge-label>
//
// Deploy. data/ is not in Git, so the deploy target names data/precomputed in SHIP, which copies it from this
// checkout to the box when it differs.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');

/** A line of the rewrite stream. */
export type Line = { type: string; [k: string]: unknown };

/** One sample in one voice, and where its rewrite is kept. */
export interface Pair {
  sample: string;
  /** The sample's case id in eval-voices: its file name without .txt and -text. */
  caseId: string;
  voice: string;
  text: string;
  file: string;
}

export type State = 'missing' | 'stale' | 'current' | 'broken';

/** The samples in samples/index.json (or every .txt when there is no index), with their text. */
export function samplesOf(root = ROOT): { id: string; file: string; text: string }[] {
  const dir = join(root, 'samples');
  const index = join(dir, 'index.json');
  const entries: { id: string; file: string }[] = existsSync(index)
    ? (JSON.parse(readFileSync(index, 'utf8')) as { id: string; file: string }[])
    : readdirSync(dir)
        .filter((f) => f.endsWith('.txt'))
        .map((f) => ({ id: f.slice(0, -4), file: f }));
  return entries.filter((e) => existsSync(join(dir, e.file))).map((e) => ({ id: e.id, file: e.file, text: readFileSync(join(dir, e.file), 'utf8') }));
}

/** The voices with a built model: authors/<id>.json beside data/<id>.sqlite. */
export function builtVoices(root = ROOT, data = process.env.ADVISOR_DATA ? resolve(process.env.ADVISOR_DATA) : join(root, 'data')): string[] {
  return readdirSync(join(root, 'authors'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((id) => existsSync(join(data, `${id}.sqlite`)))
    .sort();
}

/** Every sample in every voice. */
export function pairsOf(samples: { id: string; file: string; text: string }[], voices: string[], dir: string): Pair[] {
  return samples.flatMap((s) =>
    voices.map((voice) => ({ sample: s.id, caseId: s.file.replace(/\.txt$/, '').replace('-text', ''), voice, text: s.text, file: join(dir, s.id, `${voice}.json`) })),
  );
}

/** Whether a pair's file is there, and written by the current prompt. */
export function stateOf(p: Pair, version: string): State {
  if (!existsSync(p.file)) return 'missing';
  try {
    const f = JSON.parse(readFileSync(p.file, 'utf8')) as { version?: unknown; lines?: unknown; text?: unknown };
    if (!Array.isArray(f.lines) || typeof f.text !== 'string') return 'broken';
    return f.version === version ? 'current' : 'stale';
  } catch {
    return 'broken';
  }
}

/** A refusal or a failure from the server; `fatal` stops the whole run. */
export class Failed extends Error {
  hard: boolean;
  fatal: boolean;
  constructor(message: string, opts: { hard?: boolean; fatal?: boolean } = {}) {
    super(message);
    this.hard = opts.hard ?? false;
    this.fatal = opts.fatal ?? false;
  }
}

/** POST /api/rewrite and read the whole stream. A sample served from the server's own made-ahead files is asked for again, fresh. */
export async function fetchRewrite(base: string, voice: string, text: string, client: string, fresh = false): Promise<Line[]> {
  let r: Response;
  try {
    r = await fetch(`${base}/api/rewrite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: voice, text, fresh, client }) });
  } catch (e) {
    throw new Failed(`The server at ${base} did not answer: ${(e as Error).message}`, { fatal: true });
  }
  const body = await r.text();
  if (!r.ok) {
    let msg = body.slice(0, 300);
    try {
      msg = String((JSON.parse(body) as { error?: string }).error ?? msg);
    } catch {
      // The body was not JSON; keep its first characters.
    }
    // No writer at all, or the day's tokens spent: nothing more can be written.
    throw new Failed(`${r.status}: ${msg}`, { fatal: r.status === 503 || r.status === 404, hard: r.status >= 500 });
  }
  const lines = body
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line);
  if (!fresh && lines.some((l) => l.type === 'progress' && l.kept === 'sample')) return fetchRewrite(base, voice, text, client, true);
  return lines;
}

/** What is wrong with a rewrite, or null when it can be kept. */
export function problemOf(lines: Line[], version: string, allowFast: boolean): { message: string; hard: boolean } | null {
  const parts = lines.filter((l) => l.type === 'part');
  if (!parts.length) return { message: 'The server sent no parts.', hard: true };
  if (!lines.some((l) => l.type === 'done')) return { message: 'The stream ended before its last line.', hard: true };
  for (const p of parts) {
    if (p.error) return { message: `Part ${Number(p.part) + 1}: ${String(p.error)}`, hard: true };
    if (p.resting) return { message: `Part ${Number(p.part) + 1} was not written (${String(p.resting)}).`, hard: false };
    if (p.promptVersion !== version) return { message: `The server writes prompt version ${String(p.promptVersion)}, and this checkout is at ${version}. Restart the server on this checkout.`, hard: false };
    if (p.tier === 'fast' && !allowFast) return { message: 'The voice is on the fast tier. Move data/tiers.json aside while the prewarm runs.', hard: false };
    const rows = (p.rows ?? []) as { kind?: string; hers?: unknown }[];
    if (rows.some((r) => r.kind === 'paragraph' && !Array.isArray(r.hers))) return { message: `Part ${Number(p.part) + 1} has a paragraph with no rewrite.`, hard: true };
  }
  return null;
}

/** Writes a file whole or not at all. */
function writeAtomic(file: string, data: string) {
  mkdirSync(join(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

/** Whether a pair is in the judge's share: a hash of the pair, read as a fraction, below the share. */
export function judged(p: Pick<Pair, 'sample' | 'voice'>, share: number): boolean {
  const h = createHash('sha256').update(`judge/${p.sample}/${p.voice}`).digest();
  return h.readUInt32BE(0) / 2 ** 32 < share;
}

/** A rewrite as eval-voices keeps one, so its --rejudge can score it. */
export function asRun(p: Pair, lines: Line[]) {
  const rows = new Map<number, Record<string, any>>();
  const lessons: string[] = [];
  let reading: unknown;
  for (const l of lines) {
    if (l.type !== 'part') continue;
    for (const row of (l.rows ?? []) as Record<string, any>[]) rows.set(Number(row.index), row);
    if (l.explanation) lessons.push(String(l.explanation));
    if (l.reading && !reading) reading = l.reading;
  }
  const out = [...rows.values()]
    .filter((x) => x.kind === 'paragraph')
    .sort((a, b) => a.index - b.index)
    .map((x) => ({
      from: x.from,
      text: ((x.hers ?? []) as { text: string }[]).map((s) => s.text).join(' '),
      notes: ((x.notes ?? []) as Record<string, any>[]).map((n) => ({ kind: n.kind, technique: n.technique, text: n.text, after: n.after, cite: n.quote?.cite, verified: n.verified })),
    }));
  return { voice: p.voice, case: p.caseId, ms: 0, yours: p.text.replace(/^#\s.*\n+/, '').trim(), rewrite: out.map((x) => x.text).join('\n\n'), rows: out, lessons, reading };
}

export interface PrewarmOptions {
  base: string;
  dir: string;
  version: string;
  pairs: Pair[];
  /** Only files that are there with an old version; otherwise those and the missing and broken ones. */
  staleOnly?: boolean;
  atOnce?: number;
  allowFast?: boolean;
  /** The share of pairs saved for the judge, and where. */
  judgeShare?: number;
  judgeFile?: string | null;
  log?: (s: string) => void;
}

export interface PrewarmResult {
  written: string[];
  skipped: number;
  failed: { pair: string; error: string }[];
  stopped?: string;
}

/** Writes each pair that needs it, a few at once. A hard failure (an error, a lost paragraph) is tried once more. */
export async function prewarm(o: PrewarmOptions): Promise<PrewarmResult> {
  const log = o.log ?? (() => {});
  const todo = o.pairs.filter((p) => {
    const s = stateOf(p, o.version);
    return o.staleOnly ? s === 'stale' : s !== 'current';
  });
  const result: PrewarmResult = { written: [], skipped: o.pairs.length - todo.length, failed: [] };
  const runs: ReturnType<typeof asRun>[] = [];
  let next = 0;
  const run = Date.now().toString(36);

  const one = async (p: Pair, worker: number) => {
    const name = `${p.sample}/${p.voice}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const lines = await fetchRewrite(o.base, p.voice, p.text, `prewarm-${run}-${worker}`);
        const bad = problemOf(lines, o.version, o.allowFast ?? false);
        if (bad) throw new Failed(bad.message, { hard: bad.hard });
        const kept = lines.filter((l) => l.type !== 'progress');
        const part = kept.find((l) => l.type === 'part');
        writeAtomic(p.file, JSON.stringify({ version: o.version, sample: p.sample, voice: p.voice, text: p.text, model: part?.model, tier: part?.tier, created: new Date().toISOString(), lines: kept }));
        result.written.push(name);
        if (o.judgeShare && judged(p, o.judgeShare)) runs.push(asRun(p, kept));
        log(`${name}: written`);
        return;
      } catch (e) {
        const f = e instanceof Failed ? e : new Failed(String((e as Error)?.message ?? e), { hard: true });
        if (f.fatal) throw f;
        if (f.hard && attempt === 1) {
          log(`${name}: ${f.message}; trying once more`);
          continue;
        }
        result.failed.push({ pair: name, error: f.message });
        log(`${name}: failed: ${f.message}`);
        return;
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(o.atOnce ?? 4, todo.length)) }, async (_, w) => {
    while (next < todo.length && !result.stopped) {
      const p = todo[next++]!;
      try {
        await one(p, w);
      } catch (e) {
        result.stopped = (e as Error).message;
      }
    }
  });
  await Promise.all(workers);

  if (o.judgeFile && runs.length) {
    // Added to what an earlier, stopped run saved, one entry per pair.
    let had: ReturnType<typeof asRun>[] = [];
    try {
      had = JSON.parse(readFileSync(o.judgeFile, 'utf8'));
    } catch {
      // None yet.
    }
    const fresh = new Set(runs.map((r) => `${r.voice}/${r.case}`));
    writeAtomic(o.judgeFile, JSON.stringify([...had.filter((r) => !fresh.has(`${r.voice}/${r.case}`)), ...runs], null, 1));
  }
  return result;
}

/** The pairs that are not current, by state. */
export function check(pairs: Pair[], version: string): Record<Exclude<State, 'current'>, string[]> {
  const out = { missing: [] as string[], stale: [] as string[], broken: [] as string[] };
  for (const p of pairs) {
    const s = stateOf(p, version);
    if (s !== 'current') out[s].push(`${p.sample}/${p.voice}`);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const { PROMPT_VERSION } = await import('../src/server/rewrite.ts');
  const dir = process.env.ADVISOR_PRECOMPUTED ?? join(ROOT, 'data', 'precomputed');
  const only = (k: string) => opt(k)?.split(',');
  const samples = samplesOf().filter((s) => !only('samples') || only('samples')!.includes(s.id));
  const voices = builtVoices().filter((v) => !only('voices') || only('voices')!.includes(v));
  const pairs = pairsOf(samples, voices, dir);

  if (args.includes('--check')) {
    const c = check(pairs, PROMPT_VERSION);
    const n = c.missing.length + c.stale.length + c.broken.length;
    console.log(`${pairs.length - n} of ${pairs.length} pairs (${samples.length} samples × ${voices.length} voices) are current at ${PROMPT_VERSION}.`);
    for (const [k, xs] of Object.entries(c)) if (xs.length) console.log(`${k} (${xs.length}): ${xs.slice(0, 20).join(', ')}${xs.length > 20 ? ', …' : ''}`);
    process.exit(n ? 1 : 0);
  }

  const label = opt('judge-label') ?? `prewarm-${new Date().toISOString().slice(0, 10)}`;
  const base = process.env.BASE ?? 'http://localhost:8080';
  const r = await prewarm({
    base,
    dir,
    version: PROMPT_VERSION,
    pairs,
    staleOnly: args.includes('--stale'),
    atOnce: Number(opt('at-once') ?? 4),
    allowFast: args.includes('--allow-fast'),
    judgeShare: Number(opt('judge-share') ?? 0.1),
    judgeFile: join(ROOT, 'docs', 'eval', 'voices', `${label}.json`),
    log: (s) => console.log(s),
  });
  console.log(`Written ${r.written.length}, already current ${r.skipped}, failed ${r.failed.length}.`);
  if (r.stopped) console.log(`Stopped: ${r.stopped}`);
  if (r.written.length && existsSync(join(ROOT, 'docs', 'eval', 'voices', `${label}.json`))) console.log(`Judge the share kept aside with: node scripts/eval-voices.ts ${label}-judged --rejudge ${label}`);
  process.exit(r.failed.length || r.stopped ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
