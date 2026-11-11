// Checks every voice's shapes (authors/<id>.json, `shapes`): that each is well formed, and that every quote stands
// in the built corpus (data/<id>.sqlite), exactly, in one work and in the order of the parts. Run it after writing
// or changing a shape, and after rebuilding a corpus. It exits with 1 if any shape fails. A voice not yet built is
// checked for form only, and says so.
//
//   node scripts/check-shapes.ts            every voice
//   node scripts/check-shapes.ts lincoln    one voice

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readAuthor } from '../src/corpus/sources.ts';
import { authorDbPath, ROOT } from '../src/db.ts';
import { SHAPES_PER_VOICE, shapeFaults, verifyShape, type VoiceShape } from '../src/engine/outline.ts';

/** What is wrong with one voice's shapes, and how many quotes were found. */
export function checkVoice(id: string): { shapes: number; quotes: number; built: boolean; faults: string[] } {
  const raw = (readAuthor(ROOT, id) as { shapes?: unknown }).shapes;
  const shapes = Array.isArray(raw) ? raw : [];
  const faults = shapes.flatMap(shapeFaults);
  if (shapes.length < SHAPES_PER_VOICE[0] || shapes.length > SHAPES_PER_VOICE[1]) faults.push(`${shapes.length} shapes, where ${SHAPES_PER_VOICE[0]} to ${SHAPES_PER_VOICE[1]} are wanted`);
  const built = existsSync(authorDbPath(id));
  let quotes = 0;
  if (built) {
    const db = new DatabaseSync(authorDbPath(id), { readOnly: true });
    for (const s of shapes as VoiceShape[]) {
      if (shapeFaults(s).length) continue;
      const bad = verifyShape(db, s);
      faults.push(...bad);
      if (!bad.length) quotes += s.parts.length;
    }
    db.close();
  }
  return { shapes: shapes.length, quotes, built, faults };
}

export const voiceIds = (): string[] =>
  readdirSync(join(ROOT, 'authors'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();

if (import.meta.main) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : voiceIds();
  let bad = 0;
  for (const id of ids) {
    const r = checkVoice(id);
    console.log(`${id}: ${r.shapes} shapes, ${r.built ? `${r.quotes} quotes found in the corpus` : 'corpus not built, quotes not checked'}`);
    for (const f of r.faults) console.log(`  ${f}`);
    bad += r.faults.length;
  }
  console.log(bad ? `${bad} faults.` : 'Every shape is well formed and every quote checked is in its corpus.');
  process.exit(bad ? 1 : 0);
}
