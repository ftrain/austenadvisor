// "Rewrite with AI": Claude rewrites a passage in the author's manner with the engine at hand. It is given the
// engine's reading of the passage (every flagged word and its alternatives, the advice, the measures), the author's
// habits in numbers, and real sentences of the author's nearest the passage; it may ask the engine more (a word's use,
// a concordance, sentences like a draft) and check its own draft before it submits. What it submits names the
// author's sentences it learned from, and each quotation is checked against the corpus before the writer sees it.

import Anthropic from '@anthropic-ai/sdk';
import type { AuthorModel } from '../engine/model.ts';
import { checkPassage, runTool, styleSummary, TOOL_SPECS, wordProfile } from '../engine/tools.ts';
import { tokenize } from '../nlp/tokenize.ts';

export const MODEL = process.env.ADVISOR_MODEL ?? 'claude-opus-5-5';

export interface RewriteNote {
  technique: string;
  before: string;
  after: string;
  austen: string;
  cite: string;
  /** The quotation was found, word for word, in the author's works. */
  verified: boolean;
}

export interface RewriteResult {
  text: string;
  explanation: string;
  notes: RewriteNote[];
  toolCalls: { name: string; input: unknown }[];
  scoreBefore: number;
  scoreAfter: number;
  model: string;
}

export const aiAvailable = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const SUBMIT = {
  name: 'submit_rewrite',
  description: 'Submit the finished rewrite, with an explanation and the techniques used, each tied to a sentence of the author returned by a tool. Call this once, last.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'The rewritten passage, paragraphs separated by blank lines.' },
      explanation: { type: 'string', description: 'Two to four sentences for the writer: what you changed and why, as a teacher of style would say it.' },
      techniques: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            technique: { type: 'string', description: 'The move, named: "joined clauses with a semicolon", "a judging abstract noun", "free indirect speech"…' },
            before: { type: 'string', description: 'The writer’s words.' },
            after: { type: 'string', description: 'Yours.' },
            austen: { type: 'string', description: 'A sentence of the author’s, copied exactly from a tool result, that shows the move.' },
            cite: { type: 'string', description: 'Its citation exactly as the tool gave it, e.g. “Emma, ch. 3, ¶ 12”.' },
          },
          required: ['technique', 'before', 'after', 'austen', 'cite'],
          additionalProperties: false,
        },
      },
    },
    required: ['text', 'explanation', 'techniques'],
    additionalProperties: false,
  },
};

function systemPrompt(m: AuthorModel): string {
  const s = styleSummary(m);
  return [
    `You are ${m.author.advisor}, a writing teacher who has read every word of ${m.author.name} and who works beside a living writer in a shared document.`,
    `Your task: rewrite the passage you are given as ${m.author.short} would have written it, keeping what happens, who says what, and the writer's meaning. Change the words, the sentences and their joining; do not add events, characters or opinions the passage does not have. Modern things (telephones, cars, shops of today) become their nearest ${m.author.short}an equivalents only where the story allows; otherwise describe them in ${m.author.short}'s vocabulary.`,
    `You have a statistical engine built from ${m.author.short}'s complete works (${s.works.join('; ')}): a vocabulary with counts, a trigram language model, word vectors, WordNet, and a full-text index of every sentence with its citation. Use its tools: look up a word before you rely on it, use the concordance to confirm an idiom is ${m.author.short}'s, ask for sentences like the one you are writing, and run check_passage on your draft. Prefer words and constructions the engine shows ${m.author.short} used. Revise until check_passage flags no word ${m.author.short} never wrote (names aside) and the measures are near hers.`,
    `${m.author.short}'s habits, measured: narrative sentences ${s.sentenceLength.narration}; speech ${s.sentenceLength.speech}; paragraphs ${s.paragraphWords}. Punctuation per sentence: ${JSON.stringify(s.punctuationPerSentence)}. She joins clauses: ${s.clauseJoins.join(', ')}. Narration opens with: ${s.sentenceOpeners.join(', ')}. Her commonest words: ${s.commonestWords}.`,
    `The writer is learning. When you finish, call submit_rewrite with the text, a short explanation, and three to six techniques, each with the writer's words, yours, and one sentence of ${m.author.short}'s copied exactly from a tool result with its citation as given. Never invent or paraphrase a quotation.`,
  ].join('\n\n');
}

function userPrompt(m: AuthorModel, passage: string, context: { before?: string; after?: string; instructions?: string }): string {
  const check = checkPassage(m, passage);
  const similar = m.similarSentences(passage, 6, { minWords: 15 }).map((c) => `- ${c.text} — ${c.cite}`);
  const flagged = check.neverUsed.slice(0, 12).map((w) => {
    const p = wordProfile(m, w.word, { context: passage });
    return `- “${w.word}”: ${w.note} Alternatives ${m.author.short} used: ${(p.alternatives ?? []).slice(0, 6).map((a) => `${a.text} (${a.relation}; ${a.count}×)`).join('; ') || 'none found'}`;
  });
  return [
    context.before ? `<before>\n${context.before}\n</before>` : '',
    `<passage>\n${passage}\n</passage>`,
    context.after ? `<after>\n${context.after}\n</after>` : '',
    context.instructions ? `<writer_asks>\n${context.instructions}\n</writer_asks>` : '',
    `<engine_reading>\nScore ${check.score}/100.\nWords ${m.author.short} never wrote:\n${flagged.join('\n') || '- none'}\nAdvice:\n${check.advice.map((a) => `- [${a.severity}] ${a.title}: ${a.why}${a.suggestion ? ` Suggestion: ${a.suggestion}` : ''}`).join('\n') || '- none'}\nMeasures:\n${check.measures.map((x) => `- ${x}`).join('\n')}\n</engine_reading>`,
    `<sentences_of_${m.author.id}_nearest_in_meaning>\n${similar.join('\n')}\n</sentences_of_${m.author.id}_nearest_in_meaning>`,
    `Rewrite only the passage (the text before and after is for context). Use the tools, then call submit_rewrite.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Whether a quotation is the author's own words, found in the full-text index. */
export function verifyQuote(m: AuthorModel, quote: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  const words = tokenize(quote).filter((t) => t.kind === 'word').map((t) => t.norm);
  if (words.length < 3) return false;
  const hits = m.search(words.slice(0, 8), { phrase: true, limit: 5 });
  const q = norm(quote).replace(/[^\p{L}\p{N}' ]/gu, '');
  return hits.some((h) => norm(h.text).replace(/[^\p{L}\p{N}' ]/gu, '').includes(q.slice(0, Math.min(q.length, 120))));
}

export async function rewriteWithAI(
  m: AuthorModel,
  passage: string,
  context: { before?: string; after?: string; instructions?: string } = {},
  onProgress: (what: string) => void = () => {},
): Promise<RewriteResult> {
  const client = new Anthropic();
  const tools = [...TOOL_SPECS.map((t) => ({ ...t, input_schema: { ...t.input_schema } })), SUBMIT] as unknown as Anthropic.Beta.BetaTool[];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: userPrompt(m, passage, context) }];
  const toolCalls: RewriteResult['toolCalls'] = [];
  type Submitted = { text: string; explanation: string; techniques: Omit<RewriteNote, 'verified'>[] };
  let submitted = null as Submitted | null;
  let lastText = '';
  for (let turn = 0; turn < 12 && !submitted; turn++) {
    onProgress(turn === 0 ? 'reading the passage' : 'consulting the works');
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
    for (const b of response.content) if (b.type === 'text') lastText = b.text;
    if (response.stop_reason === 'pause_turn') continue;
    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!uses.length) break;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = (u.input ?? {}) as Record<string, unknown>;
      toolCalls.push({ name: u.name, input });
      if (u.name === SUBMIT.name) {
        submitted = input as unknown as Submitted;
        results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Received.' });
        continue;
      }
      onProgress(`${u.name.replace(/_/g, ' ')}${input.word ? ` “${input.word}”` : input.query ? ` “${input.query}”` : ''}`);
      try {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(runTool(m, u.name, input)) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: String(e), is_error: true });
      }
    }
    if (submitted) break;
    messages.push({ role: 'user', content: results });
  }
  const sub: Submitted = submitted ?? { text: lastText.trim(), explanation: '', techniques: [] };
  if (!sub.text) throw new Error('The model gave no rewrite.');
  return {
    text: sub.text.trim(),
    explanation: sub.explanation,
    notes: (sub.techniques ?? []).map((t) => ({ ...t, verified: verifyQuote(m, t.austen) })),
    toolCalls,
    scoreBefore: checkPassage(m, passage).score,
    scoreAfter: checkPassage(m, sub.text).score,
    model: MODEL,
  };
}
