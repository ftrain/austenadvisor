// "Rewrite with AI": Claude rewrites a passage in the author's manner, from the engine's brief and with the engine as
// its tools.
//
// The protocol, and why:
// - In: a numbered brief (engine/brief.ts), sentence by sentence: register, length, every word the author never wrote
//   with the author's alternatives, and two of the author's sentences nearest it in the same register, by id. The
//   model works from structure, not from a dump.
// - Out: sentences, each naming the writer's sentences it renders (`from`), so the writer sees the passage aligned,
//   and so nothing of theirs is silently dropped; notes naming a technique, the writer's words, the new words, and a
//   model sentence of the author's by id only. The server renders every quotation from the corpus: a quotation cannot
//   be invented, only an id, and an id that is not in the corpus is refused.
// - Gate: the server checks every submission with the engine (words the author never wrote, contractions in
//   narration, sentences left out, ids unknown) and sends back what it found until it is clean, twice at most.

import Anthropic from '@anthropic-ai/sdk';
import { cap, pronounsOf } from '../corpus/sources.ts';
import { buildBrief, craftOf, renderBrief, type Brief } from '../engine/brief.ts';
import { blocksOfText, type DocBlock } from '../engine/doc.ts';
import type { AuthorModel, Citation } from '../engine/model.ts';
import { CONTRACTIONS } from '../engine/profile.ts';
import { explainSentence } from '../engine/explain.ts';
import { checkPassage, runTool, TOOL_SPECS } from '../engine/tools.ts';
import { tokenize } from '../nlp/tokenize.ts';

export const MODEL = process.env.ADVISOR_MODEL ?? 'claude-opus-5-5';
export const aiAvailable = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export interface Submission {
  paragraphs: { sentences: { text: string; from: number[]; model: string }[] }[];
  notes: { move: string; before: string; after: string; model: string }[];
  explanation: string;
}

export interface RewriteNote {
  technique: string;
  before: string;
  after: string;
  /** The author's sentence, rendered from the corpus by its id. */
  austen: string;
  cite: string;
  verified: boolean;
}

export interface RewriteResult {
  text: string;
  /** Each new sentence beside the writer's sentences it renders, why it was rewritten (one sentence, from the
   * engine's template), and the author's sentence that inspired it. */
  aligned: { after: string; before: string[]; why: string; model: Citation }[];
  explanation: string;
  notes: RewriteNote[];
  toolCalls: { name: string; input: unknown }[];
  rounds: number;
  problems: string[];
  scoreBefore: number;
  scoreAfter: number;
  model: string;
}

export const SUBMIT = {
  name: 'submit_rewrite',
  description:
    'Submit the rewrite. The engine checks it at once and answers either "Accepted" or with what still needs revising; revise and submit again until it is accepted.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      paragraphs: {
        type: 'array',
        description: 'The rewritten passage, paragraph by paragraph, in order.',
        items: {
          type: 'object',
          properties: {
            sentences: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'One sentence of the rewrite.' },
                  from: { type: 'array', items: { type: 'integer' }, description: 'The numbers of the brief’s sentences it renders (one, or several joined).' },
                  model: { type: 'string', description: 'The id of the author’s sentence that most inspired this one (from the brief or a tool result): “S12345”.' },
                },
                required: ['text', 'from', 'model'],
                additionalProperties: false,
              },
            },
          },
          required: ['sentences'],
          additionalProperties: false,
        },
      },
      notes: {
        type: 'array',
        description: 'Three to six lessons for the writer, each a move you made.',
        items: {
          type: 'object',
          properties: {
            move: { type: 'string', description: 'The id of the move you made, from the brief’s <moves>.' },
            before: { type: 'string', description: 'The writer’s words, exactly.' },
            after: { type: 'string', description: 'Yours, exactly.' },
            model: { type: 'string', description: 'The id of a sentence of the author’s that shows this very move (from the brief’s <moves> or find_example): “S12345”.' },
          },
          required: ['move', 'before', 'after', 'model'],
          additionalProperties: false,
        },
      },
      explanation: { type: 'string', description: 'Two or three sentences to the writer: the chief difference between their passage and the author’s manner, and what to practise.' },
    },
    required: ['paragraphs', 'notes', 'explanation'],
    additionalProperties: false,
  },
};

export function systemPrompt(m: AuthorModel): string {
  const a = m.author;
  const pr = pronounsOf(a);
  return `You are ${a.advisor}: a teacher of writing who has read every word ${a.name} published, working beside a living writer in a shared document. ${a.persona}

The writer has asked you to show them how ${a.short} would have written a passage of theirs. They are learning to write, and to think like an author; your rewrite is a lesson as much as a text.

<task>
Render the passage as ${a.short} would have written it.
Keep: what happens and in what order; who speaks and what they mean; the point of view and person (a first-person narrator stays first-person); the form (a letter stays a letter, with its greeting and its close); the writer's names.
Change: the words, the sentences, how they are joined, what is told and what is shown.
You may join sentences, split them, reorder within a paragraph, turn quoted speech into reported speech or back. You may not add incidents, people, opinions or feelings the passage does not imply, nor drop any of its sentences without rendering them somewhere.
</task>

<craft>
${craftOf(m)}
</craft>

<the_engine>
You are given a brief prepared by a statistical engine built from ${a.short}'s complete works: the passage in numbered sentences, each with its register, its length, every word ${a.short} never wrote (and ${pr.possessive} words instead, with how often ${pr.subject} used them), and two of ${pr.possessive} sentences nearest it in meaning and register, each with an id like S12345.
The engine is also your tools: look a word up (word_profile); confirm a phrase is ${pr.possessive} (concordance); find ${pr.possessive} sentences like yours (similar_sentences, with a register); find ${pr.possessive} sentences that show a move (find_example); check a draft (check_passage). Before submitting, run check_passage on your draft. A compound it lists is a modern thing in old words: find what it would be in ${pr.possessive} world. Its "rare pairs" are only for your judgement: most are fine; change one only if it sounds modern, by choosing another word, never by inverting the phrase. A periphrasis of your own making deserves a concordance check.
${cap(pr.subject)} never wrote a word the engine flags: no such word may stand in your rewrite, except the writer's names. A modern thing with no word of ${pr.possessive} is rendered by what it does in ${pr.possessive} world, or by a phrase in ${pr.possessive} words.
</the_engine>

<citing>
Cite ${a.short} only by id (S12345), never by quoting: the writer is shown the sentence from the corpus itself. Each note names one move and cites a sentence of ${pr.possessive} that shows that very move, not one that merely shares a word with yours: take it from the brief's <moves> or from find_example. The engine checks that the sentence shows the move.
</citing>

<finishing>
Call submit_rewrite with the sentences (each naming the brief's sentence numbers it renders, and the id of the sentence of ${pr.possessive} that most inspired it), three to six notes (each a different move, the writer's words and yours exactly as written), and a short explanation. The engine checks the submission and answers "Accepted" or with what remains; revise and submit again until it is accepted.
</finishing>`;
}

export function userPrompt(m: AuthorModel, brief: Brief, context: { before?: string; after?: string; instructions?: string } = {}): string {
  return [
    context.before ? `<text_before>\n${context.before}\n</text_before>` : '',
    renderBrief(m, brief),
    context.after ? `<text_after>\n${context.after}\n</text_after>` : '',
    context.instructions ? `<writer_asks>\n${context.instructions}\n</writer_asks>` : '',
    `Rewrite the passage in the brief (the text before and after is context only). Then call submit_rewrite.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const submissionText = (s: Submission) => s.paragraphs.map((p) => p.sentences.map((x) => x.text.trim()).join(' ')).join('\n\n');

/** Straight quotation marks made curly, as the corpus has them, so a move's pattern reads a typed sentence as hers. */
export const curl = (s: string) =>
  s.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s(—])'/g, '$1‘').replace(/'/g, '’');

const idOf = (s: string) => Number(/^S?(\d+)$/.exec(s.trim())?.[1] ?? NaN);

/** What the engine finds still wrong with a submission: nothing, and it is accepted. */
export function gate(m: AuthorModel, brief: Brief, s: Submission): string[] {
  const problems: string[] = [];
  const short = m.author.short;
  if (!s.paragraphs?.length) return ['The rewrite is empty.'];
  const text = submissionText(s);
  const check = checkPassage(m, text);
  const names = new Set(brief.sentences.flatMap((x) => tokenize(x.text).filter((t) => t.kind === 'word' && /^\p{Lu}/u.test(t.text)).map((t) => t.norm)));
  const never = check.neverUsed.filter((w) => !names.has(w.word.toLowerCase()));
  if (never.length)
    problems.push(`${short} never wrote: ${never.map((w) => `“${w.word}”${w.alternatives.length ? ` (${w.alternatives.slice(0, 3).join(', ')})` : ''}`).join('; ')}.`);
  const keptCompounds = check.compounds.filter((c) => !brief.sentences.some((x) => x.text.includes(c) && /^\p{Lu}/u.test(c)));
  if (keptCompounds.length)
    problems.push(`Compounds ${short} never wrote, though each word is hers: ${keptCompounds.map((c) => `“${c}”`).join(', ')}. Find what the thing would be in ${short}’s world, or describe it.`);
  // Contractions outside speech.
  for (const para of s.paragraphs)
    for (const x of para.sentences)
      for (const t of tokenize(x.text))
        if (t.kind === 'word' && !t.quoted && CONTRACTIONS[t.norm] && brief.register !== 'letter')
          problems.push(`“${t.text}” in narration: ${short} would write “${CONTRACTIONS[t.norm]}”.`);
  const covered = new Set(s.paragraphs.flatMap((p) => p.sentences.flatMap((x) => x.from)));
  const missing = brief.sentences.filter((x) => !covered.has(x.n));
  if (missing.length) problems.push(`Not rendered: ${missing.map((x) => `sentence ${x.n} (“${x.text}”)`).join('; ')}. Render each, or name it in the "from" of the sentence that carries its sense.`);
  const badModels = s.paragraphs.flatMap((p) => p.sentences).filter((x) => !m.cite(idOf(x.model ?? '')));
  if (badModels.length) problems.push(`Each sentence names the id of the sentence of ${short}’s that inspired it; these do not: ${badModels.map((x) => `“${x.text.slice(0, 40)}…” (${x.model || 'none'})`).join('; ')}.`);
  const bad = s.notes.filter((n) => !m.cite(idOf(n.model)));
  if (bad.length) problems.push(`Unknown ids: ${bad.map((n) => n.model).join(', ')}. Use ids from the brief or a tool result.`);
  const words = (t: string) => tokenize(t).filter((x) => x.kind === 'word').map((x) => x.norm);
  const moves = new Map((m.author.moves ?? []).map((x) => [x.id, x]));
  for (const n of s.notes) {
    const mv = moves.get(n.move);
    const c = m.cite(idOf(n.model));
    if (!mv) problems.push(`No move "${n.move}": use one of ${[...moves.keys()].join(', ')}.`);
    else if (c && !new RegExp(mv.pattern, 'i').test(c.text)) problems.push(`${n.model} does not show "${mv.id}" (${mv.name}): use find_example to find one that does.`);
    // The writer is to see the move in your words too (irony has no pattern a machine can trust).
    else if (mv.id !== 'irony' && n.after && !new RegExp(mv.pattern, 'i').test(curl(n.after))) problems.push(`Your words for the "${mv.id}" note do not show it: “${n.after}”. Quote the part of your rewrite that makes the move, or name the move it does make.`);
    if (n.after && !text.includes(n.after.trim())) problems.push(`A note's "after" is not in the rewrite as written: “${n.after}”.`);
  }
  if (moves.has('irony') && brief.sentences.length >= 6 && !s.notes.some((n) => n.move === 'irony'))
    problems.push(`Give the passage one ironic verdict in ${short}’s manner where it invites one, and a note for it (move "irony"; find_example "irony" for a model).`);
  const sourceCompounds = checkPassage(m, brief.sentences.map((x) => x.text).join(' ')).compounds.map((c) => c.toLowerCase());
  // Feeling kept at the writer's degree; the writer's things kept.
  const HEDGE = /\b(basically|kind of|sort of|i guess|maybe|probably|a bit|a little|pretty much|kinda)\b/i;
  const INFLATE = /\b(exceedingly|extremely|extreme|terrified|terror|violence|violent|excessively|dreadfully|horror|agony|despair)\b/i;
  const GENERIC = new Set(['thing', 'things', 'stuff', 'time', 'way', 'lot', 'ton', 'bit', 'day', 'something', 'anything', 'everything', 'nothing', 'one', 'kind', 'sort']);
  for (const p of s.paragraphs)
    for (const x of p.sentences) {
      const src = x.from.map((n) => brief.sentences[n - 1]?.text ?? '').join(' ');
      const inflated = x.text.match(INFLATE)?.[0];
      if (HEDGE.test(src) && inflated && !INFLATE.test(src)) problems.push(`“${inflated}” inflates what the writer hedged (“${src.match(HEDGE)![0]}”): keep their degree of feeling.`);
      const out = new Set(words(x.text));
      const synonyms = (w: string) => m.wn.lemmas(w, 'n').flatMap((l) => m.wn.senses(l, 'n').slice(0, 3)).flatMap((id) => {
        const syn = m.wn.synset(id);
        return syn ? [...syn.words, ...(syn.rels['@'] ?? []).flatMap((h) => m.wn.synset(h)?.words ?? [])] : [];
      });
      const toks = tokenize(src);
      const tags = m.tagger.tagTokens(toks);
      toks.forEach((t, k) => {
        if (t.kind !== 'word' || !/^NNS?$/.test(tags[k]!) || GENERIC.has(t.norm) || !m.word(t.norm) || /^\p{Lu}/u.test(t.text)) return;
        // A noun of a compound flagged in the writer's words (“ice cream”) goes with its compound: the thing is
        // rendered whole (“ices”), not word by word.
        if (sourceCompounds.some((c) => c.split(/\s+/).includes(t.norm)) || check.compounds.some((c) => c.toLowerCase().includes(t.norm))) return;
        if (out.has(t.norm) || synonyms(t.norm).some((w) => w.split('_').every((p) => out.has(p)))) return;
        const lemma = m.wn.lemmas(t.norm, 'n')[0];
        if (lemma && [...out].some((w) => m.wn.lemmas(w, 'n')[0] === lemma)) return;
        problems.push(`“${t.text}” (sentence ${x.from.join(', ')}) is lost: keep what the writer named, in ${short}’s words if hers differ.`);
      });
    }
  // A sentence left as it was is not yet rewritten.
  for (const p of s.paragraphs)
    for (const x of p.sentences) {
      const src = x.from.map((n) => brief.sentences[n - 1]?.text ?? '').join(' ');
      const a = words(src);
      if (a.length < 6 || brief.register === 'letter' && x.from.length === 1 && a.length < 8) continue;
      const b = new Set(words(x.text));
      const kept = a.filter((w) => b.has(w)).length / a.length;
      if (kept >= 0.85 && words(x.text).length <= a.length + 2) problems.push(`Barely revised: “${x.text}” keeps the writer's sentence almost word for word.`);
    }
  if (s.notes.length < 3) problems.push('Give at least three notes.');
  return problems;
}

/** A submission as the writer sees it: aligned, explained, every quotation from the corpus. */
export function render(m: AuthorModel, brief: Brief, s: Submission): Pick<RewriteResult, 'text' | 'aligned' | 'explanation' | 'notes'> {
  return {
    text: submissionText(s),
    aligned: s.paragraphs.flatMap((p) =>
      p.sentences.map((x) => {
        const before = x.from.map((n) => brief.sentences[n - 1]?.text ?? '').filter(Boolean);
        const reg = brief.sentences[(x.from[0] ?? 1) - 1]?.register;
        const w = explainSentence(m, before, x.text, x.model, reg === 'letter' ? 'letter' : undefined);
        return { after: x.text, before, why: w.why, model: w.model };
      }),
    ),
    explanation: s.explanation,
    notes: s.notes.map((n) => {
      const c: Citation | null = m.cite(idOf(n.model));
      const mv = m.author.moves?.find((x) => x.id === n.move);
      return { technique: mv?.name ?? n.move, before: n.before, after: n.after, austen: c?.text ?? '', cite: c?.cite ?? n.model, verified: !!c && !!mv && new RegExp(mv.pattern, 'i').test(c.text) };
    }),
  };
}

/** Tool results with ids, as the model is to cite them. */
export function toolResult(m: AuthorModel, name: string, input: Record<string, unknown>): string {
  return JSON.stringify(runTool(m, name, input));
}

export async function rewriteWithAI(
  m: AuthorModel,
  passage: string | DocBlock[],
  context: { before?: string; after?: string; instructions?: string } = {},
  onProgress: (what: string) => void = () => {},
): Promise<RewriteResult> {
  const blocks = typeof passage === 'string' ? blocksOfText(passage) : passage;
  const brief = buildBrief(m, blocks);
  const client = new Anthropic();
  const tools = [...TOOL_SPECS.map((t) => ({ ...t, input_schema: { ...t.input_schema } })), SUBMIT] as unknown as Anthropic.Beta.BetaTool[];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: userPrompt(m, brief, context) }];
  const toolCalls: RewriteResult['toolCalls'] = [];
  let accepted: Submission | null = null;
  let last: Submission | null = null;
  let rounds = 0;
  let problems: string[] = [];
  for (let turn = 0; turn < 14 && !accepted; turn++) {
    onProgress(turn === 0 ? 'reading the brief' : 'consulting the works');
    const params = {
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: systemPrompt(m), cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      tools,
      messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    };
    const response = (await client.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)) as Anthropic.Beta.BetaMessage;
    if (response.stop_reason === 'refusal') throw new Error('The model declined to rewrite this passage.');
    messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
    if (response.stop_reason === 'pause_turn') continue;
    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!uses.length) {
      messages.push({ role: 'user', content: 'Call submit_rewrite with your rewrite.' });
      continue;
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = (u.input ?? {}) as Record<string, unknown>;
      toolCalls.push({ name: u.name, input });
      if (u.name === SUBMIT.name) {
        last = input as unknown as Submission;
        rounds++;
        problems = gate(m, brief, last);
        onProgress(problems.length ? `revising (${problems.length} to mend)` : 'accepted');
        if (!problems.length || rounds >= 3) accepted = last;
        results.push({ type: 'tool_result', tool_use_id: u.id, content: problems.length && !accepted ? `Not yet accepted:\n- ${problems.join('\n- ')}` : 'Accepted.' });
        continue;
      }
      onProgress(`${u.name.replace(/_/g, ' ')}${input.word ? ` “${input.word}”` : input.query ? ` “${input.query}”` : ''}`);
      try {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: toolResult(m, u.name, input) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: String(e), is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  const sub = accepted ?? last;
  if (!sub) throw new Error('The model gave no rewrite.');
  const r = render(m, brief, sub);
  return {
    ...r,
    toolCalls,
    rounds,
    problems,
    scoreBefore: brief.score,
    scoreAfter: checkPassage(m, r.text).score,
    model: MODEL,
  };
}
