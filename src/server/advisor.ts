// Advisor as a person in the document: it answers when asked in a thread, makes its suggestions as tracked changes
// for the writer to accept or reject, and explains each with the numbers and the author's own sentences.

import type { Op } from 'tinylittleoffice/doc';
import { analyze, type Advice } from '../engine/analyze.ts';
import { austenize } from '../engine/austenize.ts';
import { blockText, blocksOfTlo, type DocBlock } from '../engine/doc.ts';
import type { AuthorModel, Citation } from '../engine/model.ts';
import { aiAvailable, rewriteWithAI, type RewriteResult } from './rewrite.ts';
import { ADVISOR, type Replacement, type Room } from './room.ts';
import { newId } from './store.ts';

export const cite = (c: Citation) => `“${c.text}” — ${c.cite}`;

export interface AdvisorDeps {
  model: (id: string) => AuthorModel;
  /** Ops by Advisor applied and told to everyone; the version's hash back. */
  commit: (room: Room, ops: Op[], author?: string) => string | null;
  /** The room's state told again (comments, versions). */
  refresh: (room: Room) => void;
  status: (room: Room, text: string | null) => void;
}

function comment(room: Room, c: Record<string, unknown>) {
  const full = { id: newId(), by: ADVISOR, created_at: new Date().toISOString(), ...c };
  room.store.putComment(room.id, full as { id: string });
  return full;
}

/** An advice item applied as Advisor's change, with a thread that says why. */
export function applyAdvice(deps: AdvisorDeps, room: Room, advice: Advice, replacements: Replacement[]): { ok: boolean; error?: string } {
  const ops = room.replacementOps(replacements);
  if ('error' in ops) return { ok: false, error: ops.error };
  const hash = deps.commit(room, ops);
  if (!hash) return { ok: false, error: 'The document changed under the suggestion; try again.' };
  const r = replacements[0]!;
  comment(room, {
    quote: r.text.split('\n')[0],
    block: r.block,
    offset: r.start,
    text: [`${advice.title}. ${advice.message}`, advice.why, ...advice.examples.slice(0, 2).map(cite)].join('\n\n'),
    change_ids: [`${hash}:*`],
  });
  deps.refresh(room);
  return { ok: true };
}

/** The paragraphs a quote spans, from its block on. */
function spanOf(blocks: DocBlock[], block: number, quote: string): { from: number; to: number } {
  const lines = quote.split('\n').length;
  return { from: block, to: Math.min(blocks.length - 1, block + lines - 1) };
}

/** Someone asked Advisor in a thread: answer from the statistics, and suggest a change where there is one to make. */
export async function answerThread(
  deps: AdvisorDeps,
  room: Room,
  ask: { thread_id: string; parent_id: string; quote: string | null; block: number | null; text: string },
): Promise<void> {
  const m = deps.model(room.author);
  const short = m.author.short;
  const blocks = blocksOfTlo(room.text);
  const wantsAI = /\b(rewrite|ai|claude|redo|polish)\b/i.test(ask.text);
  if (!ask.quote || ask.block === null || ask.block < 0) {
    // On the whole document: the measures.
    const a = analyze(m, blocks);
    const lines = a.report.measures.map((x) => `${x.label}: yours ${x.yours}, ${short}’s ${x.author}.`);
    comment(room, {
      thread_id: ask.thread_id,
      parent_id: ask.parent_id,
      text: [`Read against all of ${short}, this document scores ${a.report.score} of 100.`, ...lines, a.report.overused.length ? `You lean on: ${a.report.overused.map((o) => `“${o.word}” (${o.yours}/1,000; ${short} ${o.author})`).join(', ')}.` : ''].filter(Boolean).join('\n'),
    });
    deps.refresh(room);
    return;
  }
  const { from, to } = spanOf(blocks, ask.block, ask.quote);
  const passage = blocks.slice(from, to + 1).map((b) => b.text).join('\n\n');
  if (wantsAI && aiAvailable()) {
    await rewriteBlocks(deps, room, from, to, ask.text, { thread_id: ask.thread_id, parent_id: ask.parent_id });
    return;
  }
  const sub = blocks.slice(from, to + 1);
  const a = analyze(m, sub);
  const words = a.words.filter((w) => w.kind !== 'name');
  const parts: string[] = [];
  if (words.length)
    parts.push(
      `${short} never wrote ${words.map((w) => `“${w.word}”`).join(', ')}.`,
      ...words.slice(0, 4).map((w) => {
        const alt = w.alternatives.slice(0, 3);
        return `For “${w.word}”: ${alt.map((x) => `“${x.text}” (${x.count}×)`).join(', ') || `nothing of ${short}’s is near`}${alt[0]?.example ? `, as in ${cite(alt[0].example)}` : ''}.`;
      }),
    );
  for (const ad of a.advice.filter((x) => x.kind !== 'document').slice(0, 3)) parts.push(`${ad.title}: ${ad.why}`);
  // The statistical rewrite of the quoted paragraphs, as a suggestion.
  const st = austenize(m, sub);
  let change_ids: string[] | undefined;
  const changed = st.after.some((b, i) => b.text !== sub[i]!.text);
  if (changed) {
    const reps: Replacement[] = [];
    st.after.forEach((b, i) => {
      if (b.text !== sub[i]!.text) reps.push({ block: from + i, start: 0, end: sub[i]!.text.length, text: b.text, expect: sub[i]!.text });
    });
    const ops = room.replacementOps(reps);
    if (!('error' in ops)) {
      const hash = deps.commit(room, ops);
      if (hash) change_ids = [`${hash}:*`];
    }
    parts.push(`I have suggested ${st.changes.length} change${st.changes.length === 1 ? '' : 's'} (score ${st.scoreBefore} → ${st.scoreAfter}), every one from ${short}’s own usage; accept or reject them below.`);
    for (const c of st.changes.slice(0, 5)) parts.push(`“${c.before}” → “${c.after}”. ${c.why}${c.example ? ` ${cite(c.example)}` : ''}`);
  } else if (!parts.length) parts.push(`I find nothing here ${short} would not have written.`);
  if (wantsAI && !aiAvailable()) parts.push('(A rewrite by AI needs an ANTHROPIC_API_KEY on the server.)');
  comment(room, { thread_id: ask.thread_id, parent_id: ask.parent_id, text: parts.join('\n\n'), change_ids });
  deps.refresh(room);
}

/** The statistical rewrite of paragraphs, as Advisor's change. */
export function austenizeBlocks(deps: AdvisorDeps, room: Room, from: number, to: number): { ok: boolean; error?: string; changes?: number } {
  const m = deps.model(room.author);
  const blocks = blocksOfTlo(room.text);
  const sub = blocks.slice(from, to + 1);
  const st = austenize(m, sub);
  const reps: Replacement[] = [];
  st.after.forEach((b, i) => {
    if (b.text !== sub[i]!.text && (sub[i]!.kind === 'paragraph' || sub[i]!.kind === 'quote' || sub[i]!.kind === 'item'))
      reps.push({ block: from + i, start: 0, end: sub[i]!.text.length, text: b.text, expect: sub[i]!.text });
  });
  if (!reps.length) return { ok: true, changes: 0 };
  const ops = room.replacementOps(reps);
  if ('error' in ops) return { ok: false, error: ops.error };
  const hash = deps.commit(room, ops);
  if (!hash) return { ok: false, error: 'The document changed; try again.' };
  const short = m.author.short;
  comment(room, {
    quote: reps[0]!.text.split(/(?<=[.!?])\s/)[0],
    block: reps[0]!.block,
    offset: 0,
    text: [
      `A statistical rewrite in ${short}’s manner (score ${st.scoreBefore} → ${st.scoreAfter}), made without a language model: every word is one ${short} used.`,
      ...st.changes.slice(0, 8).map((c) => `“${c.before}” → “${c.after}”. ${c.why}${c.example ? ` ${cite(c.example)}` : ''}`),
      st.kept.length ? `I found no word of ${short}’s for ${st.kept.map((k) => `“${k.word}”`).join(', ')}: those are yours to recast.` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    change_ids: [`${hash}:*`],
  });
  deps.refresh(room);
  return { ok: true, changes: st.changes.length };
}

/** Paragraphs rewritten by Claude with the engine's tools, as Advisor's change, with a thread of what it learned from. */
export async function rewriteBlocks(
  deps: AdvisorDeps,
  room: Room,
  from: number,
  to: number,
  instructions = '',
  thread?: { thread_id: string; parent_id: string },
): Promise<{ ok: boolean; error?: string; result?: RewriteResult }> {
  const m = deps.model(room.author);
  const blocks = blocksOfTlo(room.text);
  const sub = blocks.slice(from, to + 1);
  const passage = sub.map((b) => b.text).join('\n\n');
  const before = blocks.slice(Math.max(0, from - 2), from).map((b) => b.text).join('\n\n');
  const after = blocks.slice(to + 1, to + 3).map((b) => b.text).join('\n\n');
  deps.status(room, `${m.author.advisor} is reading the passage…`);
  let result: RewriteResult;
  try {
    result = await rewriteWithAI(m, passage, { before, after, instructions }, (what) => deps.status(room, `${m.author.advisor}: ${what}…`));
  } catch (e) {
    deps.status(room, null);
    return { ok: false, error: String((e as Error).message ?? e) };
  }
  deps.status(room, null);
  // The document may have moved while the model wrote: the passage must still read as it did.
  const now = blocksOfTlo(room.text);
  if (now.slice(from, to + 1).map((b) => b.text).join('\n\n') !== passage) return { ok: false, error: 'The passage changed while it was being rewritten.' };
  const paras = result.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let ops: Op[] | { error: string };
  if (paras.length === sub.length) {
    const reps: Replacement[] = [];
    paras.forEach((p, i) => {
      if (p !== sub[i]!.text) reps.push({ block: from + i, start: 0, end: sub[i]!.text.length, text: p, expect: sub[i]!.text });
    });
    ops = room.replacementOps(reps);
  } else ops = room.spliceOps(from, to, paras);
  if ('error' in ops) return { ok: false, error: ops.error };
  const hash = deps.commit(room, ops);
  if (!hash) return { ok: false, error: 'The document changed; try again.' };
  const short = m.author.short;
  comment(room, {
    ...(thread ?? { quote: paras[0]!.split(/(?<=[.!?])\s/)[0], block: from, offset: 0 }),
    text: [
      `Rewritten with AI (${result.model}), checked against ${short}’s works by the engine: score ${result.scoreBefore} → ${result.scoreAfter}. It consulted the engine ${result.toolCalls.length} times.`,
      result.explanation,
      ...result.notes.map((n) => `${n.technique}: “${n.before}” → “${n.after}”.\n${n.verified ? '✓' : '⚠ not found in the corpus:'} “${n.austen}” — ${n.cite}`),
    ]
      .filter(Boolean)
      .join('\n\n'),
    change_ids: [`${hash}:*`],
  });
  deps.refresh(room);
  return { ok: true, result };
}

export { blockText };
