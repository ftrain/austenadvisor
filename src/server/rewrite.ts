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
import { checkPassage, runTool, TOOL_SPECS } from '../engine/tools.ts';
import { tokenize } from '../nlp/tokenize.ts';

export const MODEL = process.env.ADVISOR_MODEL ?? 'claude-opus-5-5';
export const aiAvailable = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export interface Submission {
  paragraphs: { sentences: { text: string; from: number[] }[] }[];
  notes: { technique: string; before: string; after: string; model: string }[];
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
  /** Each new sentence beside the writer's sentences it renders. */
  aligned: { after: string; before: string[] }[];
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
                },
                required: ['text', 'from'],
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
            technique: { type: 'string', description: 'The move, named plainly: “two sentences balanced on a semicolon”, “feeling shown by conduct”.' },
            before: { type: 'string', description: 'The writer’s words, exactly.' },
            after: { type: 'string', description: 'Yours, exactly.' },
            model: { type: 'string', description: 'The id of the author’s sentence that shows the move, as given in the brief or a tool result: “S12345”.' },
          },
          required: ['technique', 'before', 'after', 'model'],
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
The engine is also your tools: look a word up before you rely on it (word_profile), confirm an idiom is ${pr.possessive} (concordance), find ${pr.possessive} sentences like the one you are writing (similar_sentences, with a register), and check a draft (check_passage). Use them where you are unsure; you do not need them for what the brief already answers.
${cap(pr.subject)} never wrote a word the engine flags: no such word may stand in your rewrite, except the writer's names. A modern thing with no word of ${pr.possessive} is rendered by what it does in ${pr.possessive} world, or by a phrase in ${pr.possessive} words.
</the_engine>

<citing>
Cite ${a.short} only by id (S12345), never by quoting: the writer is shown the sentence from the corpus itself. Use only ids from the brief or from tool results.
</citing>

<finishing>
Call submit_rewrite with the sentences (each naming the brief's sentence numbers it renders), three to six notes, and a short explanation. The engine checks the submission and answers "Accepted" or with what remains; revise and submit again until it is accepted.
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
  // Contractions outside speech.
  for (const para of s.paragraphs)
    for (const x of para.sentences)
      for (const t of tokenize(x.text))
        if (t.kind === 'word' && !t.quoted && CONTRACTIONS[t.norm] && brief.register !== 'letter')
          problems.push(`“${t.text}” in narration: ${short} would write “${CONTRACTIONS[t.norm]}”.`);
  const covered = new Set(s.paragraphs.flatMap((p) => p.sentences.flatMap((x) => x.from)));
  const missing = brief.sentences.filter((x) => !covered.has(x.n));
  if (missing.length) problems.push(`Not rendered: ${missing.map((x) => `sentence ${x.n} (“${x.text}”)`).join('; ')}. Render each, or name it in the "from" of the sentence that carries its sense.`);
  const bad = s.notes.filter((n) => !m.cite(idOf(n.model)));
  if (bad.length) problems.push(`Unknown ids: ${bad.map((n) => n.model).join(', ')}. Use ids from the brief or a tool result.`);
  if (s.notes.length < 3) problems.push('Give at least three notes.');
  return problems;
}

/** A submission as the writer sees it: aligned, explained, every quotation from the corpus. */
export function render(m: AuthorModel, brief: Brief, s: Submission): Pick<RewriteResult, 'text' | 'aligned' | 'explanation' | 'notes'> {
  return {
    text: submissionText(s),
    aligned: s.paragraphs.flatMap((p) => p.sentences.map((x) => ({ after: x.text, before: x.from.map((n) => brief.sentences[n - 1]?.text ?? '') }))),
    explanation: s.explanation,
    notes: s.notes.map((n) => {
      const c: Citation | null = m.cite(idOf(n.model));
      return { technique: n.technique, before: n.before, after: n.after, austen: c?.text ?? '', cite: c?.cite ?? n.model, verified: !!c };
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
