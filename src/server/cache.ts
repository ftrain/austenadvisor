// What a full rewrite costs, and how seldom it is paid for.
//
// Every part of a text that the writer has rewritten is kept in data/cache.sqlite, keyed by a hash of what shaped the
// answer: the prompt's version and fingerprint, the voice, its writer tier, the part's own text and the paragraphs on
// either side. Change a paragraph and only its part is written again. The table holds hashes as keys, never a text.
//
// Before the cache comes data/precomputed: every sample rewritten ahead of time in every voice. A text that is a
// sample, or within 3% of one, is served from there with no call at all.
//
// After the cache comes the budget: a few full rewrites a day for each address, a cap on the day's tokens, one
// rewrite in flight for each reader, and the first 1,200 words of a long text.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { DATA, open } from '../db.ts';

const num = (v: string | undefined, d: number) => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const sha = (...xs: string[]) => {
  const h = createHash('sha256');
  for (const x of xs) h.update(x).update('\u0000');
  return h.digest('hex');
};
const DAY = 86_400_000;
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** The limits, read from the environment each time they are asked for. A limit of 0 is no limit. */
export function limits() {
  return {
    /** Full rewrites that call the writer, for one address in one day (UTC). */
    perIp: num(process.env.ADVISOR_DAILY_PER_IP, 10),
    /** Tokens, in and out, the writer may spend in one day across every reader. */
    tokens: num(process.env.ADVISOR_DAILY_TOKENS, 2_000_000),
    /** Words of one text given a full rewrite; the rest gets the engine's reading only. */
    words: num(process.env.ADVISOR_FULL_WORDS, 1200),
    /** Days a kept rewrite lives. */
    days: num(process.env.ADVISOR_CACHE_DAYS, 180),
  };
}

/** The hash a page sends to ask which voices a text is ready in: SHA-256 of the text with its line ends made \n and its ends trimmed. */
export function textHash(text: string): string {
  return createHash('sha256').update(normalText(text)).digest('hex');
}
const normalText = (text: string) => text.replace(/\r\n?/g, '\n').trim();

/** What shapes one part's rewrite. */
export interface PartKeyInput {
  voice: string;
  tier: string;
  /** promptFingerprint(m): the prompt's version, its templates and schema, and the voice's system prompt. */
  fingerprint: string;
  promptVersion: string;
  instructions: string;
  /** The part's paragraphs, as the writer wrote them. */
  text: string;
  /** The paragraph before the part and the one after it, which the writer is shown as context. */
  before: string;
  after: string;
}

/**
 * Two keys for a part. `key` is exact: the neighbouring paragraphs are in it. `core` leaves them out, so a part whose
 * own paragraphs are unchanged is still found when a paragraph beside it was edited.
 */
export function partKeys(p: PartKeyInput): { key: string; core: string } {
  const core = sha('part/2', p.promptVersion, p.fingerprint, p.voice, p.tier, p.instructions, normalText(p.text));
  return { core, key: sha(core, sha(normalText(p.before)), sha(normalText(p.after))) };
}

// ---------------------------------------------------------------------------------------------------------------
// The store.

export class RewriteCache {
  readonly db: DatabaseSync;
  private purged = 0;

  /** `file` may be ':memory:'. `legacyDir` names an NDJSON cache of the old kind to retire into this one. */
  constructor(file: string, opts: { legacyDir?: string } = {}) {
    this.db = open(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rewrites (key TEXT PRIMARY KEY, core TEXT NOT NULL, voice TEXT NOT NULL, json TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS rewrites_core ON rewrites(core, created);
      CREATE TABLE IF NOT EXISTS texts (hash TEXT NOT NULL, voice TEXT NOT NULL, version TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (hash, voice));
      CREATE TABLE IF NOT EXISTS spend (day TEXT NOT NULL, who TEXT NOT NULL, rewrites INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, who));
    `);
    if (opts.legacyDir) migrateNdjson(this, opts.legacyDir);
    this.purge();
  }

  /** A kept part: by its exact key, else by its own text alone (the newest such). */
  get(key: string, core: string): { json: string; exact: boolean } | null {
    const exact = this.db.prepare('SELECT json FROM rewrites WHERE key = ?').get(key) as { json: string } | undefined;
    if (exact) return { json: exact.json, exact: true };
    const near = this.db.prepare('SELECT json FROM rewrites WHERE core = ? ORDER BY created DESC LIMIT 1').get(core) as { json: string } | undefined;
    return near ? { json: near.json, exact: false } : null;
  }

  put(key: string, core: string, voice: string, json: string, model: string, now = Date.now()): void {
    this.db.prepare('INSERT OR REPLACE INTO rewrites (key, core, voice, json, model, created) VALUES (?, ?, ?, ?, ?, ?)').run(key, core, voice, json, model, now);
    if (now - this.purged > DAY) this.purge(now);
  }

  /** Marks a whole text as rewritten in a voice, by its hash. */
  markReady(hash: string, voice: string, version: string, now = Date.now()): void {
    this.db.prepare('INSERT OR REPLACE INTO texts (hash, voice, version, created) VALUES (?, ?, ?, ?)').run(hash, voice, version, now);
  }

  /** The voices a text (by its hash) is kept in, for this prompt version. */
  ready(hash: string, version: string): string[] {
    return (this.db.prepare('SELECT voice FROM texts WHERE hash = ? AND version = ? ORDER BY voice').all(hash, version) as { voice: string }[]).map((r) => r.voice);
  }

  /** Removes what is older than the limit in days, and spending older than yesterday. */
  purge(now = Date.now(), days = limits().days): void {
    this.purged = now;
    if (days > 0) {
      const before = now - days * DAY;
      this.db.prepare('DELETE FROM rewrites WHERE created < ?').run(before);
      this.db.prepare('DELETE FROM texts WHERE created < ?').run(before);
    }
    this.db.prepare('DELETE FROM spend WHERE day < ?').run(today(now - DAY));
  }

  /** What one address (hashed), or '*' for everyone, has spent today. */
  spent(who: string, now = Date.now()): { rewrites: number; tokens: number } {
    const r = this.db.prepare('SELECT rewrites, tokens FROM spend WHERE day = ? AND who = ?').get(today(now), who) as { rewrites: number; tokens: number } | undefined;
    return r ?? { rewrites: 0, tokens: 0 };
  }

  spend(who: string, rewrites: number, tokens: number, now = Date.now()): void {
    this.db
      .prepare('INSERT INTO spend (day, who, rewrites, tokens) VALUES (?, ?, ?, ?) ON CONFLICT (day, who) DO UPDATE SET rewrites = rewrites + excluded.rewrites, tokens = tokens + excluded.tokens')
      .run(today(now), who, rewrites, tokens);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * The old cache kept one NDJSON file for each whole text, keyed by the source of four code files. Its answers were
 * written by an older prompt and are never served again; they are moved into the table under their old keys, where
 * the purge retires them, and the folder is renamed so this runs once.
 */
export function migrateNdjson(cache: RewriteCache, dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ndjson'))) {
    try {
      const file = join(dir, f);
      const lines = readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { type: string; model?: string });
      const model = lines.find((l) => l.type === 'part' && l.model)?.model ?? '';
      const key = `ndjson:${f.replace(/\.ndjson$/, '')}`;
      cache.put(key, key, '', JSON.stringify(lines), model, statSync(file).mtimeMs);
      n++;
    } catch {
      // A file cut short by a crash is left behind.
    }
  }
  renameSync(dir, `${dir}.migrated`);
  return n;
}

let shared: RewriteCache | null = null;
/**
 * The server's cache: ADVISOR_CACHE_DB, else data/cache.sqlite, retiring data/cache/rewrites on first open. Under
 * the test runner it is held in memory, so no test writes to the real one.
 */
export function rewriteCache(): RewriteCache {
  if (shared) return shared;
  const file = process.env.ADVISOR_CACHE_DB ?? (process.env.VITEST ? ':memory:' : join(DATA, 'cache.sqlite'));
  shared = new RewriteCache(file, file === ':memory:' ? {} : { legacyDir: join(DATA, 'cache', 'rewrites') });
  return shared;
}

// ---------------------------------------------------------------------------------------------------------------
// Single flight: the same part asked for twice at once is written once.

const flights = new Map<string, Promise<unknown>>();

/** The part being written under this key, if any. */
export const inFlight = <T>(key: string): Promise<T> | undefined => flights.get(key) as Promise<T> | undefined;

/** Runs `fn` for this key unless it is already running; either way, the one answer. Claims the key at once. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = flights.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = Promise.resolve()
    .then(fn)
    .finally(() => flights.delete(key));
  flights.set(key, p);
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Rewrites made ahead of time: data/precomputed/<sample>/<voice>.json.

/** One sample rewritten in one voice, as the page is sent it. scripts/prewarm.ts writes these. */
export interface PrecomputedFile {
  /** PROMPT_VERSION when it was written. */
  version: string;
  sample: string;
  voice: string;
  /** The sample's text, as it was sent. */
  text: string;
  model?: string;
  created?: string;
  /** The lines streamRewrite sends, without its progress lines: plan, each part, done. */
  lines: { type: string; [k: string]: unknown }[];
}

interface Entry {
  sample: string;
  voice: string;
  file: string;
  mtime: number;
  hash: string;
  tokens: string[];
}

export const precomputedRoot = () => process.env.ADVISOR_PRECOMPUTED ?? join(DATA, 'precomputed');

/** Words and marks, lower-cased: what the edit distance counts. */
export const tokensOf = (text: string): string[] => normalText(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').match(/[\p{L}\p{N}']+|[^\s\p{L}\p{N}']/gu) ?? [];

/** The edit distance between two token lists, or `max + 1` once it is sure to pass `max`. */
export function tokenDistance(a: string[], b: string[], max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const lo = Math.max(1, i - max);
    const hi = Math.min(b.length, i + max);
    cur.fill(max + 1);
    cur[0] = i;
    let best = cur[0];
    for (let j = lo; j <= hi; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return Math.min(prev[b.length]!, max + 1);
}

const entries = new Map<string, Entry>();
function entryOf(dir: string, sample: string, voice: string): Entry | null {
  const file = join(dir, sample, `${voice}.json`);
  let mtime: number;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const had = entries.get(file);
  if (had && had.mtime === mtime) return had;
  try {
    const p = JSON.parse(readFileSync(file, 'utf8')) as PrecomputedFile;
    if (typeof p.text !== 'string' || !Array.isArray(p.lines)) return null;
    const e: Entry = { sample, voice, file, mtime, hash: textHash(p.text), tokens: tokensOf(p.text) };
    entries.set(file, e);
    return e;
  } catch {
    return null;
  }
}
const samplesIn = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
};

/** The share of tokens a text may differ from a sample by and still be served the sample's rewrite. */
export const NEAR = 0.03;

/** The sample rewrite a text is, or nearly is, in this voice; null when there is none. */
export function findPrecomputed(voice: string, text: string, dir = precomputedRoot()): (PrecomputedFile & { exact: boolean }) | null {
  const hash = textHash(text);
  const mine = tokensOf(text);
  if (!mine.length) return null;
  let best: { e: Entry; d: number } | null = null;
  for (const sample of samplesIn(dir)) {
    const e = entryOf(dir, sample, voice);
    if (!e) continue;
    if (e.hash === hash) {
      best = { e, d: 0 };
      break;
    }
    const max = Math.floor(NEAR * Math.max(mine.length, e.tokens.length));
    const d = tokenDistance(mine, e.tokens, max);
    if (d <= max && (!best || d < best.d)) best = { e, d };
  }
  if (!best) return null;
  try {
    const p = JSON.parse(readFileSync(best.e.file, 'utf8')) as PrecomputedFile;
    return { ...p, exact: best.d === 0 };
  } catch {
    return null;
  }
}

/** The voices a text (by its hash) has a rewrite made ahead of time in. */
export function precomputedVoices(hash: string, dir = precomputedRoot()): string[] {
  const out = new Set<string>();
  for (const sample of samplesIn(dir)) {
    let files: string[] = [];
    try {
      files = readdirSync(join(dir, sample)).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const f of files) {
      const e = entryOf(dir, sample, f.slice(0, -5));
      if (e?.hash === hash) out.add(e.voice);
    }
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------------------------------------------
// The budget.

/** Who is asking: a hash of their address, and whether the request came from this machine itself. */
export interface Asker {
  /** sha256 of the address: the daily count is kept by this. */
  who: string;
  /** The reader's own id where the page sends one, else the same hash: one uncached rewrite in flight for each. */
  client: string;
  /** From this machine, with no proxy between (the evaluation scripts): no daily count. */
  local: boolean;
}

export const askerHash = (address: string) => sha('advisor/asker', address).slice(0, 32);

/** What a refused rewrite answers. No limit's name or setting is shown to the reader. */
export interface Refusal {
  ok: false;
  status: number;
  body: { budget: 'resting' | 'busy'; error: string };
}
export interface Admission {
  ok: true;
  /** Counts tokens the writer spent. */
  spend(tokens: number): void;
  /** Frees the reader to ask for another. */
  done(): void;
}

const RESTING = 'Rewrites of your own text are off for now. Every sample has a rewrite ready.';
const BUSY = 'Your last rewrite is still running. Start this one when it finishes.';

const busy = new Set<string>();

/**
 * Lets a rewrite that will call the writer go ahead, or refuses it. `available` is whether a writer can be called
 * at all. A rewrite let through counts against the address at once, whether or not it finishes.
 */
export function admit(cache: RewriteCache, asker: Asker, available: boolean, now = Date.now()): Admission | Refusal {
  const L = limits();
  if (!available) return { ok: false, status: 503, body: { budget: 'resting', error: RESTING } };
  if (busy.has(asker.client)) return { ok: false, status: 429, body: { budget: 'busy', error: BUSY } };
  if (L.tokens > 0 && cache.spent('*', now).tokens >= L.tokens) return { ok: false, status: 429, body: { budget: 'resting', error: RESTING } };
  if (!asker.local && L.perIp > 0 && cache.spent(asker.who, now).rewrites >= L.perIp) return { ok: false, status: 429, body: { budget: 'resting', error: RESTING } };
  busy.add(asker.client);
  cache.spend(asker.who, 1, 0, now);
  let open = true;
  return {
    ok: true,
    spend: (tokens: number) => {
      if (tokens > 0) cache.spend('*', 0, tokens);
    },
    done: () => {
      if (open) busy.delete(asker.client);
      open = false;
    },
  };
}
