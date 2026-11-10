// Everything the page needs to draw itself, in one request: the voices with their families and the kinds they
// suit, the samples with their text, the glossary, whether full rewrites of a student's own text are available, and
// which voices each sample is already rewritten in.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, ROOT } from '../../db.ts';
import { familyOf, goodForOf, readAuthor, type AuthorConfig } from '../../corpus/sources.ts';
import { Glossary } from '../../engine/glossary.ts';
import { route, send } from '../http.ts';
import { aiAvailable } from '../rewrite.ts';
import { authors } from '../voices.ts';
import { listSamples } from './samples.ts';

/** Where the rewrites made ahead of time are kept: <dir>/<sample id>/<voice id>.json. */
export const precomputedDir = () => join(DATA, 'precomputed');

/** For each sample, the voices it has a rewrite for already. Samples with none are left out. */
export function readyMap(sampleIds: string[], voiceIds: string[], dir = precomputedDir()): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!existsSync(dir)) return out;
  for (const s of sampleIds) {
    const d = join(dir, s);
    if (!existsSync(d)) continue;
    const have = new Set(readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
    const ready = voiceIds.filter((v) => have.has(v));
    if (ready.length) out[s] = ready;
  }
  return out;
}

const extra = new Map<string, Pick<AuthorConfig, 'family' | 'goodFor'>>();
function familyAndKinds(id: string) {
  if (!extra.has(id)) {
    try {
      const a = readAuthor(ROOT, id);
      extra.set(id, { family: familyOf(a), goodFor: goodForOf(a) });
    } catch {
      extra.set(id, { family: 'storytellers', goodFor: [] });
    }
  }
  return extra.get(id)!;
}

export function boot() {
  const voices = authors().map((a) => ({ ...a, ...familyAndKinds(a.id) }));
  const samples = listSamples();
  return {
    voices,
    samples,
    glossary: Glossary.load().all(),
    ai: { available: aiAvailable() },
    ready: readyMap(
      samples.map((s) => s.id),
      voices.filter((v) => v.built).map((v) => v.id),
    ),
  };
}

route('GET', '/api/boot', (_q, res) => send(res, 200, boot()));
