// Which voices the server holds in memory. Every voice's pack stays resident: it is small, and the engine's quick
// answers (shape sketches, examples of a move) come from it. Whole models are large, so only the six
// used last are kept; another is read from disk when asked for, in 2 to 7 s.
//
// Importing this module puts AuthorModel.load behind the LRU.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, authorDbPath, open } from '../db.ts';
import { AuthorModel } from '../engine/model.ts';
import { fingerprintOf, loadPack, type Pack } from '../engine/pack.ts';

/** How many whole models are kept: ADVISOR_MODELS, else six. */
export const MODEL_LIMIT = Math.max(1, Number(process.env.ADVISOR_MODELS) || 6);

/** A map that keeps its `limit` most recently used entries and drops the oldest. */
export class Lru<V> {
  private map = new Map<string, V>();
  private limit: number;
  private onEvict: (key: string, value: V) => void;

  constructor(limit: number, onEvict: (key: string, value: V) => void = () => {}) {
    this.limit = limit;
    this.onEvict = onEvict;
  }

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // Used now: to the back of the queue.
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V): this {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const [k, v] = this.map.entries().next().value as [string, V];
      this.map.delete(k);
      this.onEvict(k, v);
    }
    return this;
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  /** Oldest first. */
  keys(): string[] {
    return [...this.map.keys()];
  }

  get size(): number {
    return this.map.size;
  }
}

export const models = new Lru<AuthorModel>(MODEL_LIMIT);
AuthorModel.useCache(models);

/** A voice's whole model, from the LRU or read from disk. */
export const model = (id: string): AuthorModel => AuthorModel.load(id);

const checked = new Set<string>();

/** A voice's pack, resident once read; null where it is not built or was built from another build of the model. */
export function pack(id: string): Pack | null {
  if (checked.has(id)) return loadPack(id);
  checked.add(id);
  if (!existsSync(authorDbPath(id))) return null;
  const db = open(authorDbPath(id), { readOnly: true });
  try {
    return loadPack(id, { fingerprint: fingerprintOf(db) });
  } finally {
    db.close();
  }
}

/** Read every pack named, and keep them. Returns those found. */
export function loadPacks(ids: string[]): Pack[] {
  return ids.map(pack).filter((p): p is Pack => !!p);
}

/**
 * The voices most often suggested for the samples (samples/index.json, bestVoices), most suggested first, at most
 * `limit` and only among `built`.
 */
export function suggestedVoices(built: string[], limit = MODEL_LIMIT): string[] {
  const file = join(ROOT, 'samples', 'index.json');
  const tally = new Map<string, number>();
  if (existsSync(file)) {
    try {
      const samples = JSON.parse(readFileSync(file, 'utf8')) as { bestVoices?: string[] }[];
      for (const s of samples) for (const v of s.bestVoices ?? []) if (built.includes(v)) tally.set(v, (tally.get(v) ?? 0) + 1);
    } catch {
      /* no suggestions: fall back to the order given */
    }
  }
  const ranked = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  for (const v of built) if (!ranked.includes(v)) ranked.push(v);
  return ranked.slice(0, limit);
}

/**
 * At startup: every built voice's pack into memory, then the whole models of the suggested voices, each warmed so
 * its first sentence search is fast.
 */
export function bootModels(built: string[], log: (line: string) => void = () => {}): { packs: string[]; warmed: string[] } {
  const t = performance.now();
  const packs = loadPacks(built).map((p) => p.id);
  const missing = built.filter((id) => !packs.includes(id));
  log(`Packs for ${packs.length} voices in ${Math.round(performance.now() - t)}ms${missing.length ? `; none built for ${missing.join(', ')} (node scripts/build-packs.ts)` : ''}`);
  const warmed: string[] = [];
  for (const id of suggestedVoices(built)) {
    const t0 = performance.now();
    const m = model(id);
    m.similarSentences('a warm start', 1);
    warmed.push(id);
    log(`${m.author.advisor}: ${m.totalWords.toLocaleString()} words of ${m.author.name}, ready in ${Math.round(performance.now() - t0)}ms`);
  }
  return { packs, warmed };
}
