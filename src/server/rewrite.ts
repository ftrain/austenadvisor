// "Rewrite with AI": one model call rewrites a part of the writer's text in the voice's manner, from the engine's
// brief. Everything else the page shows (notes, shape, style) is the engine's work.
//
// The protocol:
// - In: a system prompt that is the same for every rewrite in a voice (its manner, its moves with one example each),
//   and so is cached; then a numbered brief (engine/brief.ts): each sentence with its register, its length, every word
//   the voice never wrote with the voice's own words for it, and the voice's sentence nearest it.
// - Out: submit_rewrite, with the faults of sense mended, the liberties taken, a short explanation, and the paragraphs,
//   each with its role and the writer's sentences each of its sentences renders (`from`), so nothing is lost unseen.
// - Gate: hardGate finds what is worth one redraft (a sentence lost, a heading crossed, the paragraphs run together);
//   softFindings finds the rest, which the engine shows or mends itself.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { cap, pronounsOf } from '../corpus/sources.ts';
import { DATA } from '../db.ts';
import { buildBrief, contractsFreely, renderBrief, renderMoves, type Brief } from '../engine/brief.ts';
import { analyze } from '../engine/analyze.ts';
import { blocksOfText, type DocBlock } from '../engine/doc.ts';
import type { AuthorModel, Citation } from '../engine/model.ts';
import { CONTRACTIONS } from '../engine/profile.ts';
import { explainSentence } from '../engine/explain.ts';
import { FIGURES, findFigures } from '../engine/figures.ts';
import { readStructure, ROLES, type Role } from '../engine/structure.ts';
import { checkPassage, runTool } from '../engine/tools.ts';
import { tokenize } from '../nlp/tokenize.ts';

/** Raised whenever the prompts or the schema change in meaning: every cached rewrite made under another is stale. */
export const PROMPT_VERSION = '2026-11-10.s5';

// The provider: Anthropic when an Anthropic key is set; otherwise DeepSeek, through its Anthropic-compatible endpoint
// (https://api-docs.deepseek.com/guides/anthropic_api), when DEEPSEEK_API_KEY is. The same SDK and protocol serve both;
// DeepSeek ignores cache_control and the beta header.
const anthropicKey = () => process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
export const PROVIDER: 'anthropic' | 'deepseek' = anthropicKey() ? 'anthropic' : process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'anthropic';
export const MODEL = process.env.ADVISOR_MODEL ?? (PROVIDER === 'deepseek' ? 'deepseek-v4-pro' : 'claude-opus-5-5');
/** The writer, where it is not the provider's own model: ADVISOR_WRITER=openrouter:<model> (OPENROUTER_API_KEY), e.g.
 * openrouter:anthropic/claude-opus-5.5. */
export const WRITER = process.env.ADVISOR_WRITER ?? '';
const viaOpenRouter = WRITER.startsWith('openrouter:') && !!process.env.OPENROUTER_API_KEY;
export const WRITER_MODEL = viaOpenRouter ? WRITER.slice('openrouter:'.length) : MODEL;
export const aiAvailable = () => !!(anthropicKey() || process.env.DEEPSEEK_API_KEY);
export const AI_KEYS = 'ANTHROPIC_API_KEY or DEEPSEEK_API_KEY';
/** One writing call, and one redraft at most. Kept for the callers that still read it. */
export const PASSES = 1;
export const EFFORT = process.env.ADVISOR_EFFORT ?? 'high';
export const THINKING = (process.env.ADVISOR_THINKING ?? 'off') === 'on';

/** The reader: a fast model that reads the passage for faults of sense before the rewrite, at the cost of a second
 * call. ADVISOR_READER=off leaves the sense check to the writer's own `sense` field. It stays on by default until
 * eval-voices shows the writer alone keeps sense and fidelity within 0.3 of the baseline (docs/eval/voices/README.md). */
export const READER_ON = (process.env.ADVISOR_READER ?? 'on') !== 'off';
export const READER = process.env.ADVISOR_READER_MODEL ?? (process.env.DEEPSEEK_API_KEY ? 'deepseek-flash' : MODEL);
/** The reader's client: DeepSeek's wherever its key is set, whoever writes. */
function readerClient(main: Anthropic): Anthropic {
  return process.env.DEEPSEEK_API_KEY && PROVIDER !== 'deepseek' && READER.startsWith('deepseek')
    ? new Anthropic({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/anthropic' })
    : main;
}

/** A voice's writer tier: `full` writes with the best model, `fast` with the quicker one where eval-voices found it
 * within 0.3 of the best. Read from data/tiers.json ({"austen": "fast"}); a voice not listed is `full`. */
export type Tier = 'full' | 'fast';
export const FAST_MODEL = process.env.ADVISOR_FAST_MODEL ?? (PROVIDER === 'deepseek' ? 'deepseek-flash' : MODEL);
export function tierOf(voice: string, file = join(DATA, 'tiers.json')): Tier {
  try {
    const tiers = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    return tiers[voice] === 'fast' ? 'fast' : 'full';
  } catch {
    return 'full';
  }
}
/** The model a tier writes with. A writer on OpenRouter is one model for every tier. */
export const modelFor = (tier: Tier): string => (viaOpenRouter ? WRITER_MODEL : tier === 'fast' ? FAST_MODEL : MODEL);

/** Where a rewrite has got to, for the page's progress line. */
export interface RewriteProgress {
  what: string;
  /** Calls to the writer so far. */
  calls: number;
  /** Drafts submitted so far. */
  draft: number;
  /** What the gate found wrong with the last draft. */
  problems: number;
}

function makeClient(): Anthropic {
  if (PROVIDER === 'deepseek') return new Anthropic({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/anthropic' });
  return new Anthropic();
}

/** The model's answer to one writing call: its blocks (the tool call carries the rewrite), why it stopped, the tokens. */
export interface WriterAnswer {
  content: Anthropic.Beta.BetaContentBlock[];
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

/**
 * The writer. The system prompt, the conversation so far (the brief, then any redraft asked for) and the tools go in;
 * the model's answer comes out. `opts.model` names the model for the voice's tier. A test passes a fake.
 */
export interface WriterClient {
  call(system: string, user: Anthropic.Beta.BetaMessageParam[], tools: Anthropic.Beta.BetaTool[], opts?: { model?: string }): Promise<WriterAnswer>;
}

/** The provider's writer. It keeps its Anthropic client for the reader, which only it can run. */
export interface ProviderWriter extends WriterClient {
  anthropic: Anthropic;
}

export function providerWriter(anthropic: Anthropic = makeClient()): ProviderWriter {
  return {
    anthropic,
    call: (system, user, tools, opts = {}) =>
      writerCall(anthropic, {
        model: opts.model ?? MODEL,
        max_tokens: 8000,
        // The system prompt is the voice's own and the same for every rewrite in it: cached.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        thinking: THINKING ? { type: 'adaptive' } : { type: 'disabled' },
        output_config: { effort: EFFORT },
        tools,
        messages: user,
        ...(PROVIDER === 'anthropic' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      }) as Promise<WriterAnswer>,
  };
}

let injectedWriter: WriterClient | null = null;
/** Puts a writer in place of the provider's for every rewrite until it is cleared with null. For tests. */
export function useWriter(client: WriterClient | null): void {
  injectedWriter = client;
}
/** The writer a rewrite uses when none is passed: the injected one, or the provider's. */
export const defaultWriter = (): WriterClient => injectedWriter ?? providerWriter();

/** An answer that submits a rewrite, as a fake writer gives it. */
export function submitted(input: Record<string, unknown>, id = `toolu_${Math.random().toString(36).slice(2, 10)}`): WriterAnswer {
  return { content: [{ type: 'tool_use', id, name: SUBMIT.name, input } as Anthropic.Beta.BetaToolUseBlock], stop_reason: 'tool_use', usage: { input_tokens: 0, output_tokens: 0 } };
}

/** A rewrite goes the whole way. The type stays for callers that still pass it. */
export type Strength = 'full';

export interface SubmittedSentence {
  text: string;
  from: number[];
  /** Older submissions named the author's sentence that inspired this one; the schema no longer asks for it. */
  model?: string;
}
export interface SubmittedParagraph {
  /** The work the paragraph does: claim, reason, scene, greeting… (structure.ts). */
  role?: string;
  /** Why the voice puts it here, in 15 words or fewer. */
  why?: string;
  sentences: SubmittedSentence[];
}
export interface Submission {
  paragraphs: SubmittedParagraph[];
  /** Older submissions carried notes; the engine writes them now (engine/notes.ts). */
  notes?: { move: string; before: string; after: string; model: string }[];
  /** What did not hang together in the writer's draft, and how the rewrite mended it. */
  sense?: Sense[];
  /** What the rewrite adds that the writer did not say, and why the voice takes it. */
  liberties?: { after: string; why: string }[];
  explanation: string;
}
export interface Sense {
  problem: string;
  resolution: string;
  before: string;
  after: string;
}

export interface RewriteNote {
  technique: string;
  before: string;
  after: string;
  /** The author's sentence, rendered from the corpus by its id. */
  austen: string;
  /** Its id in the corpus, where it is one. */
  id?: number;
  /** Where in it the move is made: the words to mark. */
  mark?: [number, number];
  cite: string;
  verified: boolean;
}

export interface RewriteResult {
  text: string;
  /** Each paragraph of the rewrite, its role and why the voice puts it there, and which paragraph of the passage
   * (1-based, counting only paragraphs, quotes and items) its first sentence renders. */
  paragraphs: { text: string; source: number | null; role?: string; why?: string; sentences: { text: string; source: number | null }[] }[];
  /** Each new sentence beside the writer's sentences it renders, and why it was rewritten (from the engine). */
  aligned: { after: string; before: string[]; from: number[]; why: string; model: Citation; moves: string[] }[];
  /** The writer's sentences as the brief numbered them, with the words in each the author never wrote. */
  source: { n: number; paragraph: number; text: string; never: { word: string; alternatives: string[] }[] }[];
  explanation: string;
  notes: RewriteNote[];
  sense: Sense[];
  liberties: { after: string; why: string }[];
  /** How the piece is built: the writer's parts (read by the engine), the voice's (from the rewrite's roles). */
  reading?: Reading;
  /** Tokens the writing calls used: input, input read from the provider's cache, input written to it, output. */
  usage?: { input: number; cached: number; cacheWrite: number; output: number };
  toolCalls: { name: string; input: unknown }[];
  rounds: number;
  problems: string[];
  scoreBefore: number;
  scoreAfter: number;
  model: string;
  tier?: Tier;
  promptVersion?: string;
}

/** The roles a paragraph may take, from the engine's structure reading. */
const ROLE_IDS = Object.keys(ROLES) as Role[];

export const SUBMIT = {
  name: 'submit_rewrite',
  description: 'Submit the rewrite. The engine checks it and answers "Accepted" or names what must be mended.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      sense: {
        type: 'array',
        description: 'Write this first. Each real fault of sense in the writer’s draft (a contradiction, an unclear person or time, a missing step) and how the rewrite mends it; or a scene of the author’s the passage truly echoes. Not style. Usually empty.',
        items: {
          type: 'object',
          properties: {
            problem: { type: 'string', description: 'The fault, said plainly to the writer: “Your first paragraph gives the new family a mother; your last says the father is single.”' },
            resolution: { type: 'string', description: 'How the rewrite mends it: “I made the cold lady his sister.”' },
            before: { type: 'string', description: 'The writer’s words where the fault is, exactly.' },
            after: { type: 'string', description: 'Your words that mend it, exactly.' },
          },
          required: ['problem', 'resolution', 'before', 'after'],
          additionalProperties: false,
        },
      },
      liberties: {
        type: 'array',
        description: 'Each thing in your rewrite the writer did not say or plainly imply (a verdict, a generalization), with why the voice takes it. Usually one or none.',
        items: {
          type: 'object',
          properties: {
            after: { type: 'string', description: 'Your words that take the liberty, exactly as in the rewrite.' },
            why: { type: 'string', description: 'What the voice does here, in one plain sentence to the writer.' },
          },
          required: ['after', 'why'],
          additionalProperties: false,
        },
      },
      explanation: { type: 'string', description: 'Forty words or fewer to the writer: how the voice builds this piece differently from theirs, and why that order works on the reader.' },
      paragraphs: {
        type: 'array',
        description: 'The rewrite, paragraph by paragraph, in the order the author would give it.',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ROLE_IDS, description: 'The work this paragraph does in the piece.' },
            why: { type: 'string', description: 'Fifteen words or fewer: why the voice puts this paragraph here.' },
            sentences: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'One sentence of the rewrite.' },
                  from: { type: 'array', items: { type: 'integer' }, description: 'The numbers of the brief’s sentences it renders: one, or several joined.' },
                },
                required: ['text', 'from'],
                additionalProperties: false,
              },
            },
          },
          required: ['role', 'why', 'sentences'],
          additionalProperties: false,
        },
      },
    },
    required: ['sense', 'liberties', 'explanation', 'paragraphs'],
    additionalProperties: false,
  },
};

export function systemPrompt(m: AuthorModel): string {
  const a = m.author;
  const pr = pronounsOf(a);
  // "of hers", "of his"; a voice that is "it" is named.
  const ofTheirs = pr.possessivePronoun === 'its' ? `${a.short}’s` : pr.possessivePronoun;
  const manner = (a.manner?.length ? a.manner : [`Go the whole way. The writer wants the passage to read as a page of ${a.short}'s, not as their own page tidied. A rewrite that keeps their sentences and swaps a few words has failed them.`]).map((x, i) => (i ? `- ${x}` : x));
  return `You are ${a.advisor}: a teacher of writing who knows every word of ${a.whole ?? `${a.short}'s complete works`}, working beside a living writer. ${a.persona}

The writer has asked how ${a.short} would have written a passage of theirs. They are learning to write; your rewrite is a lesson as much as a text.

<task>
Render the passage as ${a.short} would have written it.
Keep: what happens and in what order; who speaks and what they mean; what each sentence means, and the way each feeling points (embarrassment stays embarrassment); the point of view and person; the form (a letter stays a letter, with its greeting and its close); the writer's names.
Change: the words, the sentences, how they are joined, what is told and what is shown.
You may join sentences, split them, reorder them, and turn quoted speech into reported speech or back. You may move, merge or split paragraphs where the author would order the matter otherwise; keep a paragraph for each turn of the matter, and never run the whole into one. Every sentence of the writer's is rendered somewhere, and each of yours names the brief's sentences it renders. A heading stands where it is: write nothing for it, join nothing across it.
Add no incident, person, detail, motive or degree of feeling the writer did not give: nervous stays nervous. The voice may frame what is there (a verdict on the writer's own matter), sparingly; report every such liberty.
Keep the writer's tenses. Prefer the voice's most usual way of saying a thing to an ornate one.
</task>

<sense>
Read the passage for sense before you write. Where it contradicts itself, mend it with the smallest change the rest of the passage points to, and check the mending against every other sentence. Where it leaves unclear who is meant or when, supply the least that makes it clear. Where it echoes a scene of ${pr.possessive} own, let the rewrite echo it. Report each mending and echo in sense, before the rewrite. Most passages need nothing here.
For example: a draft says a new family moved in with a father, a cold mother and two children, and later that the father is single. The cold woman cannot be his wife; the mending makes her, say, his sister.${a.echoes?.length ? `\nScenes of ${ofTheirs} that a passage may echo:\n${a.echoes.map((e) => `- ${e}`).join('\n')}` : ''}
</sense>

<manner>
${manner.join('\n')}
- Every modern thing becomes what it is in ${pr.possessive} world, named plainly in ${pr.possessive} words.
</manner>
${a.craftNotes?.length ? `\n<craft>\n${a.craftNotes.map((x) => `- ${x}`).join('\n')}\n</craft>\n` : ''}
${cap(pr.possessive)} moves, each with a sentence of ${ofTheirs} that makes it:
${renderMoves(m)}

<the_brief>
The brief comes from a statistical engine built on ${a.whole ?? `${a.short}'s complete works`}: the passage in numbered sentences, each with its register, its length, every word ${a.short} never wrote (with ${pr.possessive} words instead), and the sentence of ${ofTheirs} nearest it.
${cap(pr.subject)} never wrote a word the engine flags: no such word may stand in your rewrite, except the writer's names${a.keepModern ? ', and the writer’s own nouns for modern things, which keep their names' : ''}. ${a.keepModern ? '' : `A modern thing with no word of ${ofTheirs} is rendered by what it does in ${pr.possessive} world, in a short plain phrase.`}
</the_brief>

<answer>
Write the whole rewrite and call submit_rewrite once: the sense first, then the liberties, a short explanation, and the paragraphs. Give each paragraph its role (the work it does: claim, reason, scene, greeting) and, in fifteen words or fewer, why the voice puts it there. The engine checks the rewrite and answers "Accepted" or names what to mend.
</answer>`;
}

export interface EditorNote {
  problem: string;
  resolution: string;
  quote: string;
}
/** A part of a piece, by the work it does: a claim, a reason, an objection; a scene, a turn; a greeting, a request. */
export interface Step {
  role: string;
  gist: string;
  why?: string;
}
/** How a piece is built: its kind, the writer's parts, the voice's parts, and any fault of sense the reader found. */
export interface Reading {
  kind: string;
  outline: Step[];
  plan: Step[];
  sense: EditorNote[];
}

const READ = {
  name: 'report_reading',
  description: 'Report your reading of the passage: who is in it, what does not hang together, and any scene of the author’s it echoes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      people: { type: 'array', description: 'Every person in the passage, and everything it says of each.', items: { type: 'string' } },
      sense: {
        type: 'array',
        description: 'Each real fault of sense and how to mend it with the least change; and any true echo of a scene of the author’s. Not style. Often empty.',
        items: {
          type: 'object',
          properties: {
            problem: { type: 'string', description: 'Said plainly to the writer.' },
            resolution: { type: 'string', description: 'The mending, or the scene echoed.' },
            quote: { type: 'string', description: 'The writer’s words where it is, exactly.' },
          },
          required: ['problem', 'resolution', 'quote'],
        },
      },
    },
    required: ['people', 'sense'],
  },
};

/** The reader (ADVISOR_READER, on by default for now): a fast model reads the passage for sense alone before it is
 * rewritten, and what it finds goes to the writer. */
export async function readForSense(m: AuthorModel, passage: string, client: Anthropic = makeClient()): Promise<EditorNote[]> {
  const a = m.author;
  const pr = pronounsOf(a);
  const system = `You are an editor. A writer's passage is about to be rewritten in the manner of ${a.title ?? a.name}; first you read it for sense, and for nothing else.
List every person in it and everything said of each, then ask whether it all agrees.
Report only a contradiction (two statements that cannot both be true of the same person, thing or time), with the mending that makes everything agree with the least change: a woman who moved in with a single man's household is not his wife; she might be his sister. At most two. Usually none.
${a.echoes?.length ? `Report too any scene of ${pr.possessive} that the passage truly echoes. Among ${pr.possessive} scenes:\n${a.echoes.map((e) => `- ${e}`).join('\n')}\n` : ''}Style is not sense: say nothing of it.`;
  const response = (await client.beta.messages.create({
    model: READER,
    max_tokens: 3000,
    system,
    tools: [READ],
    tool_choice: { type: 'tool', name: READ.name },
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: `<passage>\n${passage}\n</passage>\n\nRead it, then call ${READ.name}.` }],
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)) as Anthropic.Beta.BetaMessage;
  const use = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
  const got = (use?.input ?? {}) as { sense?: EditorNote[] };
  return (got.sense ?? []).filter((x) => x?.problem?.trim() && x?.resolution?.trim());
}

export function userPrompt(m: AuthorModel, brief: Brief, context: { before?: string; after?: string; instructions?: string; editor?: EditorNote[] } = {}): string {
  return [
    context.before ? `<text_before>\n${context.before}\n</text_before>` : '',
    renderBrief(m, brief),
    context.editor?.length
      ? `<editor>\nAn editor has read the passage for sense. Make each mending below, and report each in sense:\n${context.editor.map((e) => `- ${e.problem} ${e.resolution} (at: “${e.quote}”)`).join('\n')}\n</editor>`
      : '',
    context.after ? `<text_after>\n${context.after}\n</text_after>` : '',
    context.instructions ? `<writer_asks>\n${context.instructions}\n</writer_asks>` : '',
    `Rewrite the passage in the brief as ${m.author.short} would have written it (the text before and after is context only). Then call submit_rewrite.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** A stand-in voice and brief for the fingerprint: every template filled with fixed values, so the hash changes when
 * the wording or the schema changes, and with nothing else. */
const STUB_MOVE = { id: 'move', name: 'Move', does: 'Does.', pattern: 'x' };
const STUB = {
  author: { id: 'voice', name: 'Voice', title: 'Voice', short: 'Voice', advisor: 'Advisor', persona: 'Persona.', whole: 'Whole', moves: [STUB_MOVE], craftNotes: ['Craft.'], echoes: ['Echo.'], manner: ['Manner.'] },
  profile: { sentenceLength: { narration: { p25: 1, p50: 2, p75: 3 }, dialogue: { p50: 2 } }, punctuationPerSentence: { ';': 0, ':': 0, ',': 0 }, contractions: {}, words: 0 },
  moveExamples: () => [{ id: 1, text: 'Example.', cite: 'Cite' }],
} as unknown as AuthorModel;
const STUB_BRIEF: Brief = {
  register: 'narrative',
  person: 'third',
  headings: [{ before: 2, text: 'Heading' }],
  score: 0,
  sentences: [1, 2].map((n) => ({ n, paragraph: n, text: 'Text.', register: 'narration' as const, words: 1, never: [{ word: 'word', alternatives: ['alt'] }, { word: 'none', alternatives: [] }], models: [{ id: 1, text: 'Model.', cite: 'Cite' } as Citation] })),
};

/**
 * A hash of what the writer is told: the system prompt, the user prompt's template and the schema, rendered with fixed
 * values (and, given a voice, that voice's system prompt too). A change to a comment leaves it as it is.
 */
export function promptFingerprint(m?: AuthorModel): string {
  const h = createHash('sha256');
  for (const x of [PROMPT_VERSION, systemPrompt(STUB), userPrompt(STUB, STUB_BRIEF, { before: 'B', after: 'A', instructions: 'I', editor: [{ problem: 'P', resolution: 'R', quote: 'Q' }] }), JSON.stringify(SUBMIT), m ? systemPrompt(m) : ''])
    h.update(x).update('\u0000');
  return h.digest('hex').slice(0, 16);
}

export const submissionText = (s: Submission) => s.paragraphs.map((p) => p.sentences.map((x) => x.text.trim()).join(' ')).join('\n\n');

/** Straight quotation marks made curly, as the corpus has them, so a move's pattern reads a typed sentence. */
export const curl = (s: string) =>
  s.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s(—])'/g, '$1‘').replace(/'/g, '’');

const idOf = (s: string) => Number(/^S?(\d+)$/.exec(s.trim())?.[1] ?? NaN);

/** Words of the writer's that may stand in a rewrite though the author never used them: names; and, where the author
 * keeps modern things by their own names, the writer's nouns that have no true synonym of the author's. */
export function wordsThatStand(m: AuthorModel, brief: Brief): Set<string> {
  const names = new Set(brief.sentences.flatMap((x) => tokenize(x.text).filter((t) => t.kind === 'word' && /^\p{Lu}/u.test(t.text)).map((t) => t.norm)));
  if (m.author.keepModern)
    for (const x of brief.sentences) {
      const hasSynonym = new Set(x.never.filter((w) => w.synonym).map((w) => w.word.toLowerCase()));
      const toks = tokenize(x.text);
      const tags = m.tagger.tagTokens(toks);
      toks.forEach((t, k) => t.kind === 'word' && /^NNS?$/.test(tags[k]!) && !hasSynonym.has(t.text.toLowerCase()) && names.add(t.norm));
    }
  return names;
}

/**
 * The statistics mend in place what a second draft would: a word the author never used, where the engine is sure of
 * the author's own word of the same sense (a synonym in WordNet's first senses, used ten times or more, or a
 * contraction written out), is put in its place. Anything less sure stays, and is shown.
 */
export function repairWords(m: AuthorModel, brief: Brief, s: Submission): string[] {
  const stand = wordsThatStand(m, brief);
  const swapped: string[] = [];
  for (const p of s.paragraphs)
    for (const x of p.sentences) {
      const a = analyze(m, blocksOfText(x.text), { contextual: false });
      const edits = a.words
        .filter((w) => w.block === 0 && w.kind !== 'name' && !stand.has(w.word.toLowerCase().replace(/’/g, "'")))
        .map((w) => ({ w, best: w.alternatives.find((alt) => (alt.source === 'synonym' || alt.source === 'expansion') && alt.weight >= 0.7 && alt.count >= 10) }))
        .filter((e) => e.best && x.text.slice(e.w.start, e.w.end) === e.w.word)
        .sort((a, b) => b.w.start - a.w.start);
      for (const { w, best } of edits) {
        x.text = x.text.slice(0, w.start) + best!.text + x.text.slice(w.end);
        swapped.push(`${w.word} → ${best!.text}`);
      }
    }
  return swapped;
}

/** What is worth a redraft: the rewrite is empty, runs the paragraphs together, crosses a heading, or loses a sentence. */
export function hardGate(_m: AuthorModel, brief: Brief, s: Submission): string[] {
  if (!s.paragraphs?.length) return ['The rewrite is empty.'];
  const problems: string[] = [];
  // The author may gather paragraphs, but not run the writer's whole passage into a lump.
  const theirs = new Set(brief.sentences.map((x) => x.paragraph)).size;
  if (theirs >= 2 && s.paragraphs.length < Math.ceil(theirs / 2))
    problems.push(`The writer gave ${theirs} paragraphs and you give ${s.paragraphs.length}: keep a paragraph for each turn of the matter.`);
  // A heading stands: the writer's paragraphs on either side of one stay apart.
  const sectionOf = (paragraph: number) => brief.headings.filter((h) => h.before <= paragraph).length;
  s.paragraphs.forEach((p, k) => {
    const sections = new Set(p.sentences.flatMap((x) => x.from ?? []).map((n) => brief.sentences[n - 1]?.paragraph).filter((x): x is number => !!x).map(sectionOf));
    if (sections.size > 1) {
      const hd = brief.headings[Math.min(...sections)]!;
      problems.push(`Your paragraph ${k + 1} joins the writer's paragraphs from both sides of the heading “${hd.text}”: a heading stands, and nothing is joined across it. Give each side its own paragraphs.`);
    }
  });
  const covered = new Set(s.paragraphs.flatMap((p) => p.sentences.flatMap((x) => x.from ?? [])));
  const missing = brief.sentences.filter((x) => !covered.has(x.n));
  if (missing.length) problems.push(`Not rendered: ${missing.map((x) => `sentence ${x.n} (“${x.text}”)`).join('; ')}. Render each, or name it in the "from" of the sentence that carries its sense.`);
  return problems;
}

/** What the engine finds that is not worth a redraft: shown to the writer as notes, or mended by the engine. */
export function softFindings(m: AuthorModel, brief: Brief, s: Submission): string[] {
  if (!s.paragraphs?.length) return [];
  const problems: string[] = [];
  const short = m.author.short;
  const notes = s.notes ?? [];
  const text = submissionText(s);
  // A liberty's words, and a note's, are the rewrite's own: quoted exactly, not remembered.
  const flat = (t: string) => t.toLowerCase().replace(/[“”"‘’']/g, "'").replace(/[—–-]/g, '-').replace(/\s+/g, ' ').replace(/^[\s'.,;:]+|[\s'.,;:!?]+$/g, '');
  const whole = flat(text);
  const misquoted = [...notes.map((n) => n.after), ...(s.liberties ?? []).map((x) => x.after)].filter((a) => a?.trim() && !whole.includes(flat(a)));
  if (misquoted.length)
    problems.push(`These quotations of your rewrite are not in it: ${misquoted.map((a) => `“${a.slice(0, 80)}”`).join('; ')}. Quote your own words exactly, as they stand in your sentences.`);
  const check = checkPassage(m, text);
  const names = wordsThatStand(m, brief);
  const never = check.neverUsed.filter((w) => !names.has(w.word.toLowerCase()));
  if (never.length)
    problems.push(`${short} never wrote: ${never.map((w) => `“${w.word}”${w.alternatives.length ? ` (${w.alternatives.slice(0, 3).join(', ')})` : ''}`).join('; ')}.`);
  // A name stands; and where the author keeps modern things by their own names, so does the writer's compound.
  const keptCompounds = check.compounds.filter((c) => !brief.sentences.some((x) => x.text.toLowerCase().includes(c.toLowerCase()) && (/^\p{Lu}/u.test(c) || !!m.author.keepModern)));
  if (keptCompounds.length)
    problems.push(`Compounds ${short} never wrote, though each word is ${pronounsOf(m.author).possessivePronoun.replace(/^its$/, `${short}’s`)}: ${keptCompounds.map((c) => `“${c}”`).join(', ')}. Find what the thing would be in ${short}’s world, or describe it.`);
  // A modern adverb on an adjective of the author's (“really cool”): a calque, not the author's idiom.
  for (const para of s.paragraphs)
    for (const x of para.sentences) {
      const toks = tokenize(x.text);
      const tags = m.tagger.tagTokens(toks);
      toks.forEach((t, k) => {
        const nx = toks[k + 1];
        if (!nx || t.kind !== 'word' || nx.kind !== 'word' || t.quoted) return;
        if (!/^(RB|QL)/.test(tags[k]!) || !/^JJ|^VBN/.test(tags[k + 1]!)) return;
        const modern = ['really', 'super', 'totally', 'basically', 'essentially', 'literally', 'absolutely', 'incredibly', 'seriously'].includes(t.norm);
        if (!modern && !(t.norm.endsWith('ly') && (m.word(t.norm)?.count ?? 0) < 30)) return;
        if (m.lm.bigram(t.norm, nx.norm) === 0) problems.push(`“${t.text} ${nx.text}”: ${short} never put these together; a calque of the modern idiom. Choose another word, or “very”, “quite”, “rather”.`);
      });
    }
  // Contractions outside speech.
  for (const para of s.paragraphs)
    for (const x of para.sentences)
      for (const t of tokenize(x.text))
        if (t.kind === 'word' && !t.quoted && CONTRACTIONS[t.norm] && brief.register !== 'letter' && !contractsFreely(m))
          problems.push(`“${t.text}” in narration: ${short} would write “${CONTRACTIONS[t.norm]}”.`);
  // Ids, where an older submission still names them.
  const badModels = s.paragraphs.flatMap((p) => p.sentences).filter((x) => x.model !== undefined && !m.cite(idOf(x.model)));
  if (badModels.length) problems.push(`Each sentence names the id of the sentence of ${short}’s that inspired it; these do not: ${badModels.map((x) => `“${x.text.slice(0, 40)}…” (${x.model || 'none'})`).join('; ')}.`);
  const bad = notes.filter((n) => !m.cite(idOf(n.model)));
  if (bad.length) problems.push(`Unknown ids: ${bad.map((n) => n.model).join(', ')}.`);
  const words = (t: string) => tokenize(t).filter((x) => x.kind === 'word').map((x) => x.norm);
  const moves = new Map<string, { id: string; name: string; does: string; pattern?: string }>([
    ...Object.entries(FIGURES).map(([id, f]): [string, { id: string; name: string; does: string }] => [id, { id, name: f.name, does: f.gloss }]),
    ...(m.author.moves ?? []).map((x): [string, typeof x] => [x.id, x]),
  ]);
  for (const n of notes) {
    const mv = moves.get(n.move);
    const c = m.cite(idOf(n.model));
    if (!mv) problems.push(`No move "${n.move}": use one of ${[...moves.keys()].join(', ')}.`);
    else if (c && !m.shows(mv, c.text)) problems.push(`${n.model} does not show "${mv.id}" (${mv.name}).`);
    // Irony has no form a machine can trust: a note claiming it is let stand, shown unconfirmed.
    else if (mv.id !== 'irony' && n.after && !m.shows(mv, curl(n.after)))
      problems.push(`Your words for the "${mv.id}" note do not show it: “${n.after}”. ${mv.name}: ${mv.does}`);
    if (n.after && !text.includes(n.after.trim())) problems.push(`A note's "after" is not in the rewrite as written: “${n.after}”.`);
  }
  const sourceCompounds = checkPassage(m, brief.sentences.map((x) => x.text).join(' ')).compounds.map((c) => c.toLowerCase());
  // Feeling kept at the writer's degree; the writer's things kept.
  const HEDGE = /\b(basically|kind of|sort of|i guess|maybe|probably|a bit|a little|pretty much|kinda)\b/i;
  const INFLATE = /\b(exceedingly|extremely|extreme|terrified|terror|violence|violent|excessively|dreadfully|horror|agony|despair)\b/i;
  const GENERIC = new Set(['thing', 'things', 'stuff', 'time', 'way', 'lot', 'ton', 'bit', 'day', 'something', 'anything', 'everything', 'nothing', 'one', 'kind', 'sort']);
  for (const p of s.paragraphs)
    for (const x of p.sentences) {
      const from = x.from ?? [];
      const src = from.map((n) => brief.sentences[n - 1]?.text ?? '').join(' ');
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
        // A noun of a compound flagged in the writer's words (“ice cream”) goes with its compound.
        if (sourceCompounds.some((c) => c.split(/\s+/).includes(t.norm)) || check.compounds.some((c) => c.toLowerCase().includes(t.norm))) return;
        if (out.has(t.norm) || synonyms(t.norm).some((w) => w.split('_').every((p) => out.has(p)))) return;
        const lemma = m.wn.lemmas(t.norm, 'n')[0];
        if (lemma && [...out].some((w) => m.wn.lemmas(w, 'n')[0] === lemma)) return;
        problems.push(`“${t.text}” (sentence ${from.join(', ')}) is lost: keep what the writer named, in ${short}’s words if they differ.`);
      });
      // Things the writer named, dropped: neither put in the author's words nor rendered by a periphrasis.
      const before = from.map((n) => brief.sentences[n - 1]?.text ?? '').filter(Boolean);
      const lost = explainSentence(m, before, x.text, null, brief.register === 'letter' ? 'letter' : undefined).dropped;
      if (lost.length) problems.push(`Dropped: ${lost.map((w) => `“${w}”`).join(', ')} (sentence ${from.join(', ')}). Render what the writer named in ${short}’s words, or by a short periphrasis.`);
      // A sentence left as it was is not yet rewritten.
      const a = words(src);
      if (a.length < 6 || (brief.register === 'letter' && from.length === 1 && a.length < 8)) continue;
      const kept = a.filter((w) => out.has(w)).length / a.length;
      if (kept >= 0.85 && words(x.text).length <= a.length + 2) problems.push(`Barely revised: “${x.text}” keeps the writer's sentence almost word for word.`);
    }
  return problems;
}

/** Everything the engine finds: the hard findings first, then the soft. */
export function gate(m: AuthorModel, brief: Brief, s: Submission): string[] {
  const hard = hardGate(m, brief, s);
  if (!s.paragraphs?.length) return hard;
  return [...hard, ...softFindings(m, brief, s)];
}

/** A submission as the writer sees it: aligned and explained, every quotation from the corpus. */
export function render(m: AuthorModel, brief: Brief, s: Submission): Pick<RewriteResult, 'text' | 'paragraphs' | 'aligned' | 'source' | 'sense' | 'liberties' | 'explanation' | 'notes'> {
  const notes = s.notes ?? [];
  return {
    source: brief.sentences.map((x) => ({ n: x.n, paragraph: x.paragraph, text: x.text, never: x.never })),
    sense: (s.sense ?? []).filter((x) => x.problem?.trim()),
    liberties: (s.liberties ?? []).filter((x) => x.after?.trim() && x.why?.trim()),
    text: submissionText(s),
    paragraphs: s.paragraphs.map((p) => {
      const sourceOf = (from: number[]) => brief.sentences[Math.min(...(from ?? []).filter((n) => Number.isFinite(n))) - 1]?.paragraph ?? null;
      return {
        text: p.sentences.map((x) => x.text.trim()).join(' '),
        source: sourceOf(p.sentences.flatMap((x) => x.from ?? [])),
        ...(p.role ? { role: p.role } : {}),
        ...(p.why ? { why: p.why } : {}),
        sentences: p.sentences.map((x) => ({ text: x.text.trim(), source: sourceOf(x.from) })),
      };
    }),
    aligned: s.paragraphs.flatMap((p) =>
      p.sentences.map((x) => {
        const from = x.from ?? [];
        const before = from.map((n) => brief.sentences[n - 1]?.text ?? '').filter(Boolean);
        const reg = brief.sentences[(from[0] ?? 1) - 1]?.register;
        const noted = notes.filter((n) => n.after && x.text.includes(n.after.trim().replace(/[.,;]$/, ''))).map((n) => n.move);
        const w = explainSentence(m, before, x.text, x.model ?? null, reg === 'letter' ? 'letter' : undefined, [], noted);
        return { after: x.text, before, from: from.filter((n) => Number.isFinite(n)), why: w.why, model: w.model, moves: w.moves };
      }),
    ),
    explanation: s.explanation,
    notes: notes.map((n) => {
      const c: Citation | null = m.cite(idOf(n.model));
      const mv = m.author.moves?.find((x) => x.id === n.move) ?? (n.move in FIGURES ? { id: n.move, name: FIGURES[n.move]!.name } : undefined);
      // Confirmed: the cited sentence shows the move, and (for irony, which has no form) the rewrite shows a vehicle of it.
      const holder = s.paragraphs.flatMap((p) => p.sentences).find((x) => x.text.includes(n.after.trim().replace(/[.,;]$/, '')))?.text ?? n.after;
      const ironyOk = n.move !== 'irony' || findFigures(m, holder).some((f) => ['gnomic', 'aside', 'litotes', 'antithesis', 'hyperbole'].includes(f.term));
      const linkable = (x: Citation) => !(m.author.linkExclude ?? []).includes(x.work);
      // The engine chooses the source: of the author's sentences that make the move, the one nearest in meaning to the
      // note's own words; the model's choice only where the engine finds none.
      let shown: Citation | null = mv ? (m.moveExamples(mv.id, n.after || holder, 8).find(linkable) ?? null) : null;
      if (!shown && c && mv && m.shows(mv, c.text) && linkable(c)) shown = c;
      const curlyAfter = n.after.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’');
      const makes = !mv || mv.id === 'irony' || m.shows(mv, curlyAfter) || m.shows(mv, holder);
      return { technique: mv?.name ?? n.move, before: n.before, after: n.after, austen: shown?.text ?? '', id: shown?.id, cite: shown?.cite ?? '', mark: shown && mv ? markOf(m, mv, shown.text) : undefined, verified: !!shown && !!mv && ironyOk && makes };
    }),
  };
}

/** Where in an author's sentence a move is made: its figure, else its pattern's match. */
export function markOf(m: AuthorModel, mv: { id: string }, text: string): [number, number] | undefined {
  const want = mv.id === 'irony' ? ['gnomic', 'aside'] : [mv.id];
  const f = findFigures(m, text).find((x) => want.includes(x.term));
  if (f) return [f.start, f.end];
  const pattern = (m.author.moves ?? []).find((x) => x.id === mv.id)?.pattern;
  if (!pattern) return undefined;
  const hit = new RegExp(pattern, 'i').exec(text);
  return hit && hit[0].length > 1 ? [hit.index, hit.index + hit[0].length] : undefined;
}

/**
 * The writing call. To the provider's own model, as it is; to a writer on OpenRouter, translated into the
 * chat-completions form and back, so the rest of the protocol (the tool call, a redraft) is the same either way.
 */
async function writerCall(client: Anthropic, params: Record<string, any>): Promise<Anthropic.Beta.BetaMessage> {
  if (!viaOpenRouter) return (await client.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)) as Anthropic.Beta.BetaMessage;
  const system = (params.system as { text: string }[]).map((x) => x.text).join('\n\n');
  // The system prompt is the same for every rewrite in a voice: cached. Claude needs the mark; others cache a prefix
  // on their own.
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: WRITER_MODEL.startsWith('anthropic/') ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system },
  ];
  for (const msg of params.messages as Anthropic.Beta.BetaMessageParam[]) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content });
      continue;
    }
    const blocks = msg.content as any[];
    if (msg.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of blocks) {
        if (b.type === 'tool_result') messages.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) });
        else if (b.type === 'text') messages.push({ role: 'user', content: b.text });
      }
    }
  }
  const tools = (params.tools as { name: string; description: string; input_schema: unknown }[]).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  // Claude refuses a forced tool (the prompt asks for it, and it is called); other writers are held to it.
  const only = tools.length === 1 && !WRITER_MODEL.startsWith('anthropic/') ? { type: 'function', function: { name: tools[0]!.function.name } } : 'auto';
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
      // A rewrite is a thousand tokens or so; asking for more only reserves credit that is never spent.
      body: JSON.stringify({ model: WRITER_MODEL, max_tokens: Math.min(params.max_tokens ?? 6000, Number(process.env.ADVISOR_WRITER_MAX_TOKENS ?? 6000)), messages, tools, tool_choice: only }),
    }).catch((e: Error) => ({ ok: false, statusText: e.message, json: async () => ({}) }) as unknown as Response);
    const j = (await r.json().catch(() => ({}))) as any;
    const choice = j.choices?.[0];
    if (!r.ok || !choice) {
      lastError = j.error?.message ?? r.statusText;
      await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
      continue;
    }
    const content: any[] = [];
    if (choice.message?.content) content.push({ type: 'text', text: choice.message.content });
    for (const c of choice.message?.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(c.function?.arguments || '{}');
      } catch {
        input = {};
      }
      content.push({ type: 'tool_use', id: c.id, name: c.function?.name, input });
    }
    const u = j.usage ?? {};
    const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
    const usage = { input_tokens: (u.prompt_tokens ?? 0) - cached, cache_read_input_tokens: cached, cache_creation_input_tokens: u.prompt_tokens_details?.cache_write_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 };
    return { id: j.id, type: 'message', role: 'assistant', model: WRITER_MODEL, content, usage, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' } as unknown as Anthropic.Beta.BetaMessage;
  }
  throw new Error(`The writer (${WRITER_MODEL}) did not answer: ${lastError}`);
}

/** An engine tool's result, as the CLI prints it. */
export function toolResult(m: AuthorModel, name: string, input: Record<string, unknown>): string {
  return JSON.stringify(runTool(m, name, input));
}

/** The first words of a text, for an outline. */
const gistOf = (t: string) => t.split(/\s+/).slice(0, 8).join(' ').replace(/[,;:]$/, '') + (t.split(/\s+/).length > 8 ? '…' : '');

export async function rewriteWithAI(
  m: AuthorModel,
  passage: string | DocBlock[],
  context: { before?: string; after?: string; instructions?: string; strength?: Strength; editor?: EditorNote[] } = {},
  onProgress: (what: string, progress: RewriteProgress) => void = () => {},
  writer: WriterClient = defaultWriter(),
): Promise<RewriteResult> {
  let calls = 0;
  let rounds = 0;
  let problems: string[] = [];
  const tell = (what: string) => onProgress(what, { what, calls, draft: rounds, problems: problems.length });
  const blocks = typeof passage === 'string' ? blocksOfText(passage) : passage;
  const brief = buildBrief(m, blocks);
  const tier = tierOf(m.author.id);
  const model = modelFor(tier);
  // The reader needs the provider's client; with any other writer it is skipped.
  const client = (writer as Partial<ProviderWriter>).anthropic;
  let editor = context.editor ?? [];
  if (client && READER_ON && !context.editor) {
    tell('reading it first');
    editor = await readForSense(m, blocks.map((b) => b.text).join('\n\n'), readerClient(client)).catch(() => []);
  }
  const system = systemPrompt(m);
  const tools = [SUBMIT] as unknown as Anthropic.Beta.BetaTool[];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: userPrompt(m, brief, { ...context, editor }) }];
  const toolCalls: RewriteResult['toolCalls'] = [];
  const usage = { input: 0, cached: 0, cacheWrite: 0, output: 0 };
  let accepted: Submission | null = null;
  let last: Submission | null = null;
  let askedAgain = false;
  // One call, and one more only on a hard failure: a sentence lost, a heading crossed, the paragraphs run together, or
  // no rewrite submitted.
  while (!accepted && calls < 3) {
    tell(rounds ? `drafting again (draft ${rounds + 1})` : 'writing the rewrite');
    const response = await writer.call(system, messages, tools, { model });
    calls++;
    const u = response.usage ?? {};
    usage.input += u.input_tokens ?? 0;
    usage.cached += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    usage.output += u.output_tokens ?? 0;
    if (response.stop_reason === 'refusal') throw new Error('The model declined to rewrite this passage.');
    messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!uses.length) {
      if (askedAgain) break;
      askedAgain = true;
      messages.push({ role: 'user', content: 'Call submit_rewrite with your rewrite.' });
      continue;
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const input = (use.input ?? {}) as Record<string, unknown>;
      toolCalls.push({ name: use.name, input });
      if (use.name !== SUBMIT.name) {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: 'The only tool is submit_rewrite.', is_error: true });
        continue;
      }
      last = input as unknown as Submission;
      rounds++;
      problems = hardGate(m, brief, last);
      if (!problems.length || rounds >= 2) accepted = last;
      tell(accepted ? (problems.length ? `draft ${rounds} taken, ${problems.length} left` : `draft ${rounds} accepted`) : `draft ${rounds}: ${problems.length} to mend`);
      results.push({ type: 'tool_result', tool_use_id: use.id, content: accepted ? 'Accepted.' : `Not yet accepted:\n- ${problems.join('\n- ')}` });
    }
    if (accepted) break;
    messages.push({ role: 'user', content: results });
  }
  const sub = accepted ?? last;
  if (!sub) throw new Error('The model gave no rewrite.');
  repairWords(m, brief, sub);
  const r = render(m, brief, sub);
  problems = [...hardGate(m, brief, sub), ...softFindings(m, brief, sub)];
  // How it is built: the writer's parts as the engine reads them, the voice's as the rewrite gives them.
  const structure = readStructure(blocks);
  const paragraphs = blocks.filter((b) => b.kind === 'paragraph' || b.kind === 'quote' || b.kind === 'item').map((b) => b.text.trim()).filter(Boolean);
  const reading: Reading = {
    kind: structure.kind,
    outline: structure.roles.map((p) => ({ role: ROLES[p.role]?.name ?? p.role, gist: gistOf(paragraphs[p.paragraph] ?? '') })),
    plan: r.paragraphs.filter((p) => p.role).map((p) => ({ role: ROLES[p.role as Role]?.name ?? p.role!, gist: gistOf(p.text), ...(p.why ? { why: p.why } : {}) })),
    sense: editor,
  };
  const flat = (t: string) => t.toLowerCase().replace(/[“”"‘’']/g, "'").replace(/[—–-]/g, '-').replace(/\s+/g, ' ').replace(/^[\s'.,;:]+|[\s'.,;:!?]+$/g, '');
  const whole = flat(r.text);
  r.notes = r.notes.filter((n) => (!n.after?.trim() || whole.includes(flat(n.after))) && n.verified);
  r.liberties = r.liberties.filter((x) => whole.includes(flat(x.after)));
  return {
    ...r,
    reading,
    usage,
    toolCalls,
    rounds,
    problems,
    scoreBefore: brief.score,
    scoreAfter: checkPassage(m, r.text).score,
    model,
    tier,
    promptVersion: PROMPT_VERSION,
  };
}
