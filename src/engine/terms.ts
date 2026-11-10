// Finding the glossary's terms in a text, with no store: the page marks them with this, the server and tests too.

export interface GlossaryEntry {
  id: string;
  term: string;
  kind: string;
  definition: string;
  example?: string;
  source?: string;
  unless?: string;
  /** Every name, lowercased, the term is found by. */
  names: string[];
}

/** Where terms of the glossary are used in a text: each first use, longest name first, as [start, end, id]. */
export function findTerms(entries: Pick<GlossaryEntry, 'id' | 'names' | 'unless'>[], text: string, opts: { all?: boolean } = {}): [number, number, string][] {
  const byName = new Map<string, Pick<GlossaryEntry, 'id' | 'unless'>>();
  for (const e of entries) for (const n of e.names) if (!byName.has(n)) byName.set(n, e);
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return [];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']/g, "['’]").replace(/[“”"]/g, '[“”"]').replace(/\s+/g, '\\s+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(esc).join('|')})(?:e?s)?(?![\\p{L}\\p{N}])`, 'giu');
  const out: [number, number, string][] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const e = byName.get(m[1]!.toLowerCase().replace(/'/g, '’').replace(/["“”]/g, (q) => (q === '"' ? '“' : q)).replace(/\s+/g, ' '));
    if (!e) continue;
    if (e.unless && new RegExp(e.unless, 'i').test(text.slice(Math.max(0, m.index! - 24), m.index))) continue;
    if (!opts.all && seen.has(e.id)) continue;
    seen.add(e.id);
    out.push([m.index!, m.index! + m[0].length, e.id]);
  }
  return out;
}
