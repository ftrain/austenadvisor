// The voices the server offers: read once at startup from authors/*.json. Only whether each is built is asked
// again, and that is remembered once true.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, authorDbPath, getMeta, open } from '../db.ts';
import { pronounsOf, readAuthor } from '../corpus/sources.ts';
import { AuthorModel } from '../engine/model.ts';

const voiceList = readdirSync(join(ROOT, 'authors'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const a = readAuthor(ROOT, f.replace(/\.json$/, ''));
    return { id: a.id, style: !!a.style, name: a.name, title: a.title ?? a.name, tagline: a.tagline ?? '', epigraph: a.epigraph ?? null, action: a.action ?? `${a.short} it up`, whole: a.whole ?? `${a.short}’s complete works`, advisor: a.advisor, short: a.short, years: a.years, pronouns: pronounsOf(a), works: a.works.map((w) => w.title), moves: (a.moves ?? []).map((m) => ({ id: m.id, name: m.name, does: m.does })) };
  });

export function authors() {
  return voiceList.map((a) => ({ ...a, built: isBuilt(a.id) }));
}

export const model = (id: string) => AuthorModel.load(id);

/** A voice is built when its build has finished (the model is the last thing it writes), not when its file appears. */
const builtOnes = new Set<string>();
export function isBuilt(id: string): boolean {
  if (builtOnes.has(id)) return true;
  if (!voiceList.some((a) => a.id === id) || !existsSync(authorDbPath(id))) return false;
  try {
    const db = open(authorDbPath(id), { readOnly: true });
    const done = !!getMeta(db, 'model');
    db.close();
    if (done) builtOnes.add(id);
    return done;
  } catch {
    return false;
  }
}
