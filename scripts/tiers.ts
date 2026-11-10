// Which voices the faster model can write: those whose judged mean on the fast model is within 0.3 of the best
// model's. Reads two eval-voices runs and writes data/tiers.json, which tierOf in src/server/rewrite.ts reads. A voice
// not listed, or with no file at all, is written with the best model.
//
//   PORT=8181 ADVISOR_MODEL=deepseek-flash node src/server/main.ts           a second server that writes with the fast model
//   BASE=http://localhost:8181 node scripts/eval-voices.ts flash --set diet  the same cases as the best model's run
//   node scripts/tiers.ts flash final                 print the table and write data/tiers.json
//   node scripts/tiers.ts flash final --dry-run        print the table only
//
// data/ is not in Git: the deploy target names data/tiers.json in SHIP once the file exists.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');

/** The largest fall in the judged mean that still lets a voice use the fast model. */
export const TOLERANCE = 0.3;
/** The fewest judged rewrites in each run before a voice can be moved to the fast model. */
export const MIN_JUDGED = 3;
const DIMS = ['fidelity', 'voice', 'sense', 'natural', 'notes', 'teaching', 'structure'] as const;

interface Run {
  voice: string;
  judge?: Partial<Record<(typeof DIMS)[number], number>>;
}

const mean = (xs: number[]) => {
  const ys = xs.filter((x) => Number.isFinite(x));
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : NaN;
};

/** Each voice's judged mean (the mean of its rewrites' mean scores) and how many rewrites were judged. */
export function judgedMeans(runs: Run[]): Map<string, { mean: number; n: number }> {
  const by = new Map<string, number[]>();
  for (const r of runs) {
    if (!r.judge) continue;
    const m = mean(DIMS.map((d) => Number(r.judge![d])));
    if (!Number.isFinite(m)) continue;
    by.set(r.voice, [...(by.get(r.voice) ?? []), m]);
  }
  return new Map([...by].map(([v, xs]) => [v, { mean: mean(xs), n: xs.length }]));
}

/** 'fast' for each voice whose fast mean is within the tolerance of its best mean, with enough judged in both; else 'full'. */
export function chooseTiers(fast: Run[], full: Run[], tolerance = TOLERANCE, minJudged = MIN_JUDGED): Record<string, 'fast' | 'full'> {
  const f = judgedMeans(fast);
  const b = judgedMeans(full);
  const out: Record<string, 'fast' | 'full'> = {};
  for (const voice of [...new Set([...f.keys(), ...b.keys()])].sort()) {
    const x = f.get(voice);
    const y = b.get(voice);
    out[voice] = x && y && x.n >= minJudged && y.n >= minJudged && x.mean >= y.mean - tolerance ? 'fast' : 'full';
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const [fastLabel, fullLabel] = args.filter((a) => !a.startsWith('--'));
  if (!fastLabel || !fullLabel) {
    console.error('Name two eval-voices runs: node scripts/tiers.ts <fast run> <best run> [--dry-run]');
    process.exit(2);
  }
  const read = (label: string) => JSON.parse(readFileSync(join(ROOT, 'docs', 'eval', 'voices', `${label}.json`), 'utf8')) as Run[];
  const fast = read(fastLabel);
  const full = read(fullLabel);
  const tiers = chooseTiers(fast, full);
  const f = judgedMeans(fast);
  const b = judgedMeans(full);
  const f2 = (x?: number) => (x !== undefined && Number.isFinite(x) ? x.toFixed(2) : '–');
  console.log(`| voice | ${fastLabel} | ${fullLabel} | tier |\n|---|---|---|---|`);
  for (const [v, t] of Object.entries(tiers)) console.log(`| ${v} | ${f2(f.get(v)?.mean)} (${f.get(v)?.n ?? 0}) | ${f2(b.get(v)?.mean)} (${b.get(v)?.n ?? 0}) | ${t} |`);
  if (args.includes('--dry-run')) return;
  const data = process.env.ADVISOR_DATA ? resolve(process.env.ADVISOR_DATA) : join(ROOT, 'data');
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, 'tiers.json'), JSON.stringify(tiers, null, 2) + '\n');
  console.log(`Wrote ${join(data, 'tiers.json')}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
