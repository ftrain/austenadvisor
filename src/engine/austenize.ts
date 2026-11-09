// The engine's own rewrite, with no language model: every word the author never used given the author's nearest word
// in meaning, contractions written out, words swapped where the author's usage strongly prefers another, and then
// runs of short sentences joined as the author joined clauses. Each change is listed with its reason and a sentence
// of the author's. It is a statistical first draft; the writer, or the AI rewrite, does the rest.

import { analyze, type Advice, type Analysis } from './analyze.ts';
import type { DocBlock } from './doc.ts';
import type { AuthorModel, Citation } from './model.ts';

export interface Change {
  block: number;
  before: string;
  after: string;
  kind: 'word' | 'contraction' | 'usage' | 'join';
  why: string;
  example?: Citation;
}

export interface Austenized {
  before: DocBlock[];
  after: DocBlock[];
  changes: Change[];
  /** Words the engine flagged and could not place a word of the author's for. */
  kept: { block: number; word: string; note: string }[];
  scoreBefore: number;
  scoreAfter: number;
  analysisAfter: Analysis;
}

interface Edit {
  start: number;
  end: number;
  text: string;
  change: Change;
}

function applyEdits(text: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  let lastStart = Infinity;
  for (const e of sorted) {
    if (e.end > lastStart) continue; // overlapping: the earlier-listed wins
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  return out;
}

export function austenize(m: AuthorModel, blocks: DocBlock[]): Austenized {
  const first = analyze(m, blocks);
  const edits = new Map<number, Edit[]>();
  const changes: Change[] = [];
  const kept: Austenized['kept'] = [];
  const push = (block: number, e: Edit) => {
    const list = edits.get(block) ?? [];
    if (list.some((x) => x.start < e.end && e.start < x.end)) return;
    list.push(e);
    edits.set(block, list);
    changes.push(e.change);
  };
  const short = m.author.short;

  // Contractions and the author's preferred word in place: the advice that carries a one-word replacement.
  for (const a of first.advice) {
    if (a.kind !== 'word' || !a.replacements?.length) continue;
    const r = a.replacements[0]!;
    const before = blocks[a.block]!.text.slice(a.start, a.end);
    push(a.block, {
      start: a.start,
      end: a.end,
      text: r.text,
      change: { block: a.block, before, after: r.text, kind: a.id && a.title.includes('?') ? 'usage' : 'contraction', why: a.why, example: a.examples[0] },
    });
  }
  // Words the author never used: the nearest in meaning she did.
  for (const f of first.words) {
    // Only a word of the same main sense, which reads well in place: else the word stays, and is listed.
    const best = f.alternatives.find(
      (x) => x.source !== 'context' && x.weight >= (f.kind === 'name' ? 0.9 : 0.8) && x.fit / (x.text.split(' ').length + 2) > -14,
    );
    const covered = (edits.get(f.block) ?? []).some((e) => e.start < f.end && f.start < e.end);
    if (!best) {
      if (f.kind !== 'name' && !covered) kept.push({ block: f.block, word: f.word, note: f.note });
      continue;
    }
    push(f.block, {
      start: f.start,
      end: f.end,
      text: best.text,
      change: {
        block: f.block,
        before: f.word,
        after: best.text,
        kind: 'word',
        why: `${f.note} “${best.text}”: ${best.relation}; ${best.count.toLocaleString()} times in ${short}.`,
        example: best.example,
      },
    });
  }
  const mid = blocks.map((b, i) => (edits.has(i) ? { ...b, text: applyEdits(b.text, edits.get(i)!) } : b));

  // Then the sentences, read again as they now are.
  const second = analyze(m, mid, { contextual: false });
  const joins = new Map<number, Edit[]>();
  for (const a of second.advice.filter((x: Advice) => x.title.includes('short sentences') && x.replacements?.length)) {
    const r = a.replacements![0]!;
    const list = joins.get(r.block) ?? [];
    list.push({
      start: r.start,
      end: r.end,
      text: r.text,
      change: { block: r.block, before: mid[r.block]!.text.slice(r.start, r.end), after: r.text, kind: 'join', why: a.why, example: a.examples[0] },
    });
    joins.set(r.block, list);
  }
  const after = mid.map((b, i) => (joins.has(i) ? { ...b, text: applyEdits(b.text, joins.get(i)!) } : b));
  for (const list of joins.values()) for (const e of list) changes.push(e.change);
  const analysisAfter = analyze(m, after, { contextual: false });
  return { before: blocks, after, changes, kept, scoreBefore: first.report.score, scoreAfter: analysisAfter.report.score, analysisAfter };
}
