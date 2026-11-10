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
import { buildBrief, contractsFreely, craftOf, renderBrief, type Brief } from '../engine/brief.ts';
import { analyze } from '../engine/analyze.ts';
import { blocksOfText, type DocBlock } from '../engine/doc.ts';
import type { AuthorModel, Citation } from '../engine/model.ts';
import { CONTRACTIONS } from '../engine/profile.ts';
import { explainSentence } from '../engine/explain.ts';
import { FIGURES, findFigures } from '../engine/figures.ts';
import { checkPassage, runTool, TOOL_SPECS } from '../engine/tools.ts';
import { tokenize } from '../nlp/tokenize.ts';

// The provider: Anthropic when an Anthropic key is set; otherwise DeepSeek, through its Anthropic-compatible endpoint
// (https://api-docs.deepseek.com/guides/anthropic_api), when DEEPSEEK_API_KEY is. The same SDK, protocol and tools
// serve both; DeepSeek ignores cache_control and the beta header, and knows nothing of fallbacks.
const anthropicKey = () => process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
export const PROVIDER: 'anthropic' | 'deepseek' = anthropicKey() ? 'anthropic' : process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'anthropic';
export const MODEL = process.env.ADVISOR_MODEL ?? (PROVIDER === 'deepseek' ? 'deepseek-v4-pro' : 'claude-opus-5-5');
/** The writer, where it is not the provider's own model: ADVISOR_WRITER=openrouter:<model> (OPENROUTER_API_KEY), e.g.
 * openrouter:anthropic/claude-opus-5.5. The reader stays the provider's fast model. */
export const WRITER = process.env.ADVISOR_WRITER ?? '';
const viaOpenRouter = WRITER.startsWith('openrouter:') && !!process.env.OPENROUTER_API_KEY;
export const WRITER_MODEL = viaOpenRouter ? WRITER.slice('openrouter:'.length) : MODEL;
export const aiAvailable = () => !!(anthropicKey() || process.env.DEEPSEEK_API_KEY);
export const AI_KEYS = 'ANTHROPIC_API_KEY or DEEPSEEK_API_KEY';
// Speed against depth: how many drafts the gate may send back before the last is taken (ADVISOR_DRAFTS), the model's
// effort (ADVISOR_EFFORT: low, medium, high), and whether it thinks before it writes (ADVISOR_THINKING=on: on DeepSeek
// that took three times as long for no better a rewrite).
// One transaction (ADVISOR_PASSES=1, the default): the model reads the passage (its people, its kind, its outline, the
// voice's plan, its faults of sense) and then writes, in one answer; the engine repairs what it can of that answer
// rather than sending it back. ADVISOR_PASSES=2 adds an editor's read beside the draft and a redraft with the engine's
// findings: surer, and twice as slow.
export const PASSES = Number(process.env.ADVISOR_PASSES ?? 1) >= 2 ? 2 : 1;
/** The reader: a fast model reads the passage for sense and plans its structure before the rewrite (ten seconds, and it
 * notices more than the writing model does in passing). */
export const READER = process.env.ADVISOR_READER_MODEL ?? (process.env.DEEPSEEK_API_KEY ? 'deepseek-flash' : MODEL);
/** The reader's client: DeepSeek's wherever its key is set, whoever writes. */
function readerClient(main: Anthropic): Anthropic {
  return process.env.DEEPSEEK_API_KEY && PROVIDER !== 'deepseek' && READER.startsWith('deepseek')
    ? new Anthropic({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/anthropic' })
    : main;
}
export const DRAFTS = Math.max(1, Number(process.env.ADVISOR_DRAFTS ?? (PASSES === 1 ? 1 : 2)));
export const EFFORT = process.env.ADVISOR_EFFORT ?? 'high';
export const THINKING = (process.env.ADVISOR_THINKING ?? 'off') === 'on';
// One prompt, one answer (`oneshot`, the default): the model writes from the brief alone, and the engine checks the
// result. `agentic` gives it the engine as tools to consult as it writes: slower by minutes, a little surer.
export const MODE: 'oneshot' | 'agentic' = process.env.ADVISOR_MODE === 'agentic' ? 'agentic' : 'oneshot';

/** Where a rewrite has got to, for the page's progress line. */
export interface RewriteProgress {
  what: string;
  /** Calls to the engine so far. */
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

/** How far the rewrite goes: `full` renders the passage as a page of the author's; `light` tidies the writer's own. */
export type Strength = 'full' | 'light';

export interface Submission {
  paragraphs: { sentences: { text: string; from: number[]; model: string }[] }[];
  notes: { move: string; before: string; after: string; model: string }[];
  /** The reading written before the rewrite, in one transaction. */
  kind?: string;
  outline?: Step[];
  plan?: Step[];
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
  /** Each paragraph of the rewrite, and which paragraph of the passage (1-based, counting only paragraphs, quotes
   * and items) its first sentence renders: how a rewrite of several paragraphs is laid back into the document. */
  paragraphs: { text: string; source: number | null; sentences: { text: string; source: number | null }[] }[];
  /** Each new sentence beside the writer's sentences it renders, why it was rewritten (one sentence, from the
   * engine's template), and the author's sentence that inspired it. */
  aligned: { after: string; before: string[]; from: number[]; why: string; model: Citation; moves: string[] }[];
  /** The writer's sentences as the brief numbered them, with the words in each the author never wrote. */
  source: { n: number; paragraph: number; text: string; never: { word: string; alternatives: string[] }[] }[];
  explanation: string;
  notes: RewriteNote[];
  sense: Sense[];
  liberties: { after: string; why: string }[];
  /** The editor's read: the kind of piece, the writer's outline, the voice's plan. */
  reading?: Reading;
  /** Tokens the writing calls used: input, input read from the provider's cache, input written to it, output. */
  usage?: { input: number; cached: number; cacheWrite: number; output: number };
  toolCalls: { name: string; input: unknown }[];
  rounds: number;
  problems: string[];
  scoreBefore: number;
  scoreAfter: number;
  model: string;
}

/** The reading the writer gives before its rewrite: what the piece is, how it is built, how the voice would build it. */
const READING_FIELDS = {
  kind: { type: 'string', description: 'Write this first. What the piece is: story, argument, letter, email, description, or other.' },
  outline: {
    type: 'array',
    description: 'How the writer built it, in the writer’s order: each part by the work it does (an argument: claim, reason, evidence, example, objection, answer, proposal, call; a story: setting, event, turn, feeling, verdict; a letter or email: greeting, news, reason, request, close), with its gist in a few words.',
    items: { type: 'object', properties: { role: { type: 'string' }, gist: { type: 'string' } }, required: ['role', 'gist'], additionalProperties: false },
  },
  plan: {
    type: 'array',
    description: 'How the voice would build the same matter, in its order, each part with why the voice puts it there: a lesson in structure for the writer. The same matter only. Keep the writer’s order wherever the voice would. Your rewrite then follows this plan.',
    items: { type: 'object', properties: { role: { type: 'string' }, gist: { type: 'string' }, why: { type: 'string' } }, required: ['role', 'gist', 'why'], additionalProperties: false },
  },
};

export const SUBMIT = {
  name: 'submit_rewrite',
  description:
    'Submit the rewrite. The engine checks it at once and answers either "Accepted" or with what still needs revising; revise and submit again until it is accepted.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      ...(PASSES === 1 ? READING_FIELDS : {}),
      sense: {
        type: 'array',
        description: 'Write this first, before the rewrite: each thing in the writer’s draft that does not hang together (a contradiction, an unclear person or time, a missing step), and how the rewrite will mend it; and any scene of the author’s the passage truly echoes. Not style. Usually empty.',
        items: {
          type: 'object',
          properties: {
            problem: { type: 'string', description: 'What did not make sense, said plainly to the writer: “Your first paragraph gives the new family a mother; your last says the father is single.”' },
            resolution: { type: 'string', description: 'How the rewrite mends it, and why that way: “I made the standoffish lady his sister, as Bingley’s sisters are in Pride and Prejudice.”' },
            before: { type: 'string', description: 'The writer’s words where the problem is, exactly.' },
            after: { type: 'string', description: 'Yours that mend it, exactly.' },
          },
          required: ['problem', 'resolution', 'before', 'after'],
          additionalProperties: false,
        },
      },
      liberties: {
        type: 'array',
        description: 'Everything in your rewrite that the writer did not say or plainly imply (a verdict, a generalization, a framing), each with why the voice takes it. Usually one or two, often none. Say them: a liberty not reported is a fault.',
        items: {
          type: 'object',
          properties: {
            after: { type: 'string', description: 'Your words that take the liberty, exactly as in the rewrite.' },
            why: { type: 'string', description: 'What the voice does here, and why: a lesson for the writer.' },
          },
          required: ['after', 'why'],
          additionalProperties: false,
        },
      },
      paragraphs: {
        type: 'array',
        description: 'The rewritten passage, paragraph by paragraph, in the order the author would give it.',
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
            move: { type: 'string', description: 'The id of the move you made (the brief’s <moves>), or the term of the figure of speech (litotes, periphrasis, antithesis, tricolon…).' },
            before: { type: 'string', description: 'The writer’s words, exactly.' },
            after: { type: 'string', description: 'Yours, exactly.' },
            model: { type: 'string', description: 'The id of a sentence of the author’s that shows this very move (from the brief’s <moves> or find_example): “S12345”.' },
          },
          required: ['move', 'before', 'after', 'model'],
          additionalProperties: false,
        },
      },
      explanation: { type: 'string', description: 'Two or three sentences to the writer: the chief difference between their passage and the author’s manner, and what to practise. Name only moves your rewrite makes, each with its words quoted from your rewrite, and say why it works on the reader: a lesson the writer can use in their own voice.' },
    },
    required: [...(PASSES === 1 ? ['kind', 'outline', 'plan'] : []), 'sense', 'liberties', 'paragraphs', 'notes', 'explanation'],
    additionalProperties: false,
  },
};

export function systemPrompt(m: AuthorModel, strength: Strength = 'full', mode: 'oneshot' | 'agentic' = MODE): string {
  const a = m.author;
  const pr = pronounsOf(a);
  const full = strength === 'full';
  const oneshot = mode === 'oneshot';
  const manner = full
    ? `
<manner>
${(a.manner?.length ? a.manner : [`Go the whole way. The writer wants the passage to read as a page of ${a.short}'s, not as their own page tidied. A rewrite that keeps their sentences and swaps a few words has failed them.`]).map((x, i) => (i ? `- ${x}` : x)).join('\n')}
- Every modern thing becomes what it is in ${pr.possessive} world, named plainly in ${pr.possessive} words; every modern turn of phrase goes. Nothing of the writer's idiom survives unless it is also ${pr.possessive}.
- Keep every fact, in its order, with its speakers, its point of view, its form and its names. The narrator may judge what is there, and may not remember, suppose or add anything that is not: no new incident, motive, history or feeling, however small.
</manner>
`
    : '';
  return `You are ${a.advisor}: a teacher of writing who knows every word of ${a.whole ?? `${a.short}'s complete works`}, working beside a living writer. ${a.persona}

The writer has asked you to show them how ${a.short} would have written a passage of theirs. They are learning to write, and to think like an author; your rewrite is a lesson as much as a text.

<task>
Render the passage as ${a.short} would have written it.
Keep: what happens and in what order; who speaks and what they mean; what each sentence means, and the way each feeling points (embarrassment stays embarrassment, never comfort; a liking stays a liking); the point of view and person (a first-person narrator stays first-person); the form (a letter stays a letter, with its greeting and its close); the writer's names.
Change: the words, the sentences, how they are joined, what is told and what is shown.
You may join sentences, split them, reorder them, turn quoted speech into reported speech or back. You may move, merge or split the writer's paragraphs where the author would have ordered the matter otherwise (the news before the complaint, the setting before the scene, the point where it lands hardest), and only then: keep a paragraph for each turn of the matter, as many as the writer gave unless the matter wants otherwise, and never run the whole into one. Every sentence of theirs must still be rendered somewhere, and each of yours names the writer's sentences it renders. A heading in the brief stands where it is and is not yours to render: write nothing for it, join nothing across it, and give each side its own paragraphs. You may not add incidents, people, opinions or feelings the passage does not imply, nor drop any of its sentences without rendering them somewhere. Add no detail, image, outcome, motive, opinion of the narrator's, or degree of feeling the writer did not give: nervous stays nervous, not afraid; a quip the writer did not make is not yours to make. ${full ? "The voice's manner may frame what is there (a verdict in the voice's words on the writer's own matter, a generalization the matter invites), sparingly; every such liberty, and anything else you add, is reported in liberties." : 'Add no clause the writer did not imply.'}
Keep the writer's tenses consistent (do not slide between past and present). Plain is better than ornate: prefer the voice's most usual way of saying a thing; a phrase the reader would have to puzzle out is wrong.
</task>

<sense>
Read the passage for sense before you write, as an editor would. Ask of each person: who are they, and does everything said of them agree? Ask of the whole: what is the point of it, and does the telling get there?
- Where it contradicts itself, mend it so that it truly hangs together: the mending must remove the contradiction, not restate it. Choose the reading the rest of the passage points to, and the smallest change that gets there, in ${pr.possessive} world; then read your mending against every other sentence, and if anything still disagrees, mend again.
- Where it leaves unclear who is meant or when, or skips a step the reader needs, supply the least that makes it clear.
- Where the passage echoes a scene of ${pr.possessive} own, recognise it, let the rewrite echo it, and tell the writer which scene it is: that is a lesson in itself.
Report every mending and every echo in sense, plainly, to the writer, before you write the rewrite; never mend silently, and invent nothing beyond the mending. Sense is for real faults of sense and true echoes only: a matter of style is not one, and most passages need nothing here.${PASSES === 1 ? `\nGive your reading first, as the answer asks (the kind of piece, its outline, ${pr.possessive} plan), then the rewrite, built to your plan.` : ''}
For example: a draft says a new family moved in with a father, a standoffish mother and two children, and later that the father is single, divorced. The standoffish woman cannot be his wife, nor his former wife, since she came with the household; the mending gives her a place that agrees with everything said of her, such as his sister.${a.echoes?.length ? `\nScenes of ${pr.possessive} that a passage may echo (there are others):\n${a.echoes.map((e) => `- ${e}`).join('\n')}` : ''}
</sense>
${manner}
<craft>
${craftOf(m)}
</craft>

<the_engine>
You are given a brief prepared by a statistical engine built from ${a.whole ?? `${a.short}'s complete works`}: the passage in numbered sentences, each with its register, its length, every word ${a.short} never wrote (and ${pr.possessive} words instead, with how often ${pr.subject} used them), and two of ${pr.possessive} sentences nearest it in meaning and register, each with an id like S12345; then ${pr.possessive} moves, each with two sentences of ${pr.possessive} that show it.
${
  oneshot
    ? `The brief is all you need: write from it, in one go. Prefer the words the brief gives you; where a modern thing has no word of ${pr.possessive}, render it by what it does in ${pr.possessive} world, in a short plain phrase of ${pr.possessive} words. Use only words you are sure ${pr.subject} used: the common vocabulary of ${pr.possessive} novels, and the words the brief shows.`
    : `The engine is also your tools: look a word up (word_profile); confirm a phrase is ${pr.possessive} (concordance); find ${pr.possessive} sentences like yours (similar_sentences, with a register); find ${pr.possessive} sentences that show a move (find_example); check a draft (check_passage). Before submitting, run check_passage on your draft. A compound it lists is a modern thing in old words: find what it would be in ${pr.possessive} world. Its "rare pairs" are only for your judgement: most are fine; change one only if it sounds modern, by choosing another word, never by inverting the phrase. A periphrasis of your own making deserves a concordance check.`
}
${cap(pr.subject)} never wrote a word the engine flags: no such word may stand in your rewrite, except the writer's names${a.keepModern ? ', and the writer’s own nouns for modern things, which stand as they are' : ''}. ${a.keepModern ? `A modern thing keeps its own name, set in ${pr.possessive} sentence; never turn it into another thing.` : `A modern thing with no word of ${pr.possessive} is rendered by what it does in ${pr.possessive} world, or by a phrase in ${pr.possessive} words.`}
</the_engine>

<citing>
Cite ${a.short} only by id (S12345), never by quoting: the writer is shown the sentence from the corpus itself. Each note names one move and cites a sentence of ${pr.possessive} that shows that very move, not one that merely shares a word with yours: take it from the brief's <moves>${oneshot ? '' : ' or from find_example'}. The engine checks that the sentence shows the move.
</citing>

<finishing>
${oneshot ? 'Write the whole rewrite now and call submit_rewrite at once: it is your only tool, and your one answer.' : 'Work fast: make every lookup a draft needs in one turn, calling the tools in parallel, never one word at a time; then write the draft, check it once with check_passage, and submit.'} Call submit_rewrite with the sentences (each naming the brief's sentence numbers it renders, and the id of the sentence of ${pr.possessive} that most inspired it), three to six notes (each a different move, the writer's words and yours exactly as written), and a short explanation. The engine checks the submission and answers "Accepted" or with what remains; revise and submit again until it is accepted.
</finishing>`;
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
/** The editor's read of a passage: what kind of piece it is, how the writer built it, how the voice would. */
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
      people: {
        type: 'array',
        description: 'First: every person in the passage, and everything the passage says of each. Then whether it all agrees.',
        items: { type: 'string' },
      },
      kind: { type: 'string', description: 'What the piece is: story, argument, letter, email, description, or other.' },
      outline: {
        type: 'array',
        description: 'How the writer built it, in the writer’s order: each part by the work it does (for an argument: claim, reason, evidence, example, objection, answer, proposal, call; for a story: setting, event, turn, feeling, verdict; for a letter or email: greeting, news, reason, request, close), with its gist in a few words.',
        items: { type: 'object', properties: { role: { type: 'string' }, gist: { type: 'string' } }, required: ['role', 'gist'] },
      },
      plan: {
        type: 'array',
        description: 'How the voice would build the same matter, in its order: each part, its gist, and why the voice puts it there (what it does for the reader). The same matter only: no new facts, reasons or evidence. Keep the writer’s order where the voice would.',
        items: { type: 'object', properties: { role: { type: 'string' }, gist: { type: 'string' }, why: { type: 'string' } }, required: ['role', 'gist', 'why'] },
      },
      sense: {
        type: 'array',
        description: 'Each real fault of sense (a contradiction, an unclear person or time, a missing step the reader needs) and how to mend it with the least change; and any true echo of a scene of the author’s. Not style. Often empty.',
        items: {
          type: 'object',
          properties: {
            problem: { type: 'string', description: 'Said plainly to the writer: “Your first paragraph gives the new family a mother; your last says the father is single.”' },
            resolution: { type: 'string', description: 'The mending, and why that way, or the scene echoed and what the rewrite may take from it.' },
            quote: { type: 'string', description: 'The writer’s words where it is, exactly.' },
          },
          required: ['problem', 'resolution', 'quote'],
        },
      },
    },
    required: ['people', 'kind', 'outline', 'plan', 'sense'],
  },
};

/** An editor's read of the passage for sense alone, before it is rewritten: a short call that only notices. */
export async function readForSense(m: AuthorModel, passage: string, client: Anthropic = makeClient(), think = process.env.ADVISOR_SENSE_THINKING === 'on', strict = PASSES === 1): Promise<Reading> {
  const a = m.author;
  const pr = pronounsOf(a);
  const system = `You are an editor. A writer's passage is about to be rewritten in the manner of ${a.title ?? a.name}; before it is, you read it for sense, and for nothing else.
List every person in it and everything said of each, then ask whether it all agrees. Ask of the whole what its point is, and whether the telling gets there.
Report each real fault: a contradiction (a family with a mother whose father is then single), a person or time left unclear, a step the reader needs and is not given. For each, the mending with the least change that makes everything agree, chosen as the rest of the passage points: a mending must remove the fault, not restate it, and must agree with every other sentence (a woman who moved in with a single man's household is not his wife nor his former wife; she might be his sister).
${a.echoes?.length ? `Report too any scene of ${pr.possessive} that the passage truly echoes, and what the rewrite may take from it. Among ${pr.possessive} scenes:
${a.echoes.map((e) => `- ${e}`).join('\n')}\n` : ''}Style is not sense: say nothing of it. Most passages have no fault; then report none.${strict ? `
Be strict: report only a contradiction (two statements that cannot both be true of the same person, thing or time) or a true echo; never something merely unclear, unsaid or unusual, which a reader can live with. At most two. Usually none.` : ''}
Then outline the piece as the writer built it, part by part, and plan how ${a.title ?? a.name} would build the same matter: for an argument, how ${pr.subject} would order the claim, the reasons, the evidence, the objection and its answer, and the close, and why; for a story, a letter or an email, the same for its parts. Keep the writer's order wherever ${pr.subject} would; change it only where it serves the reader, and say why. The plan is for a writer learning to build an argument: make each why a lesson.`;
  const response = (await client.beta.messages.create({
    model: READER,
    max_tokens: think ? 8000 : 3000,
    system,
    tools: [READ],
    // Thinking, which this read needs to notice what does not agree, allows no forced tool: it is asked for instead.
    ...(think ? { thinking: { type: 'enabled', budget_tokens: 4000 } } : { tool_choice: { type: 'tool', name: READ.name }, thinking: { type: 'disabled' } }),
    messages: [{ role: 'user', content: `<passage>\n${passage}\n</passage>\n\nRead it, then call ${READ.name}.` }],
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)) as Anthropic.Beta.BetaMessage;
  const use = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
  const got = (use?.input ?? {}) as Partial<Reading>;
  const steps = (xs: unknown) => (Array.isArray(xs) ? (xs as Step[]).filter((x) => x?.role?.trim() && x?.gist?.trim()) : []);
  return {
    kind: String(got.kind ?? 'other').toLowerCase(),
    outline: steps(got.outline),
    plan: steps(got.plan),
    sense: (got.sense ?? []).filter((x) => x?.problem?.trim() && x?.resolution?.trim()),
  };
}

const NO_READING: Reading = { kind: 'other', outline: [], plan: [], sense: [] };

export interface Proof {
  fixes: { find: string; replace: string; why: string }[];
  added: { after: string; why: string }[];
}
const PROOF = {
  name: 'report_proof',
  description: 'Report the exact small edits that make the rewrite faithful, and what it adds unreported.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fixes: {
        type: 'array',
        description: 'Each place the rewrite is unfaithful or garbled, as the smallest edit that mends it in the voice: a fact, detail, time, number or degree changed; a feeling shifted or inverted; a word in a sense that misleads (customers become readers, a nightmare becomes a dream); a phrase repeated; a tense slipped; a sentence whose logic now says something else. Not matters of taste.',
        items: {
          type: 'object',
          properties: {
            find: { type: 'string', description: 'The rewrite’s words to change, exactly as they stand, within one sentence.' },
            replace: { type: 'string', description: 'The words to put in their place, in the voice.' },
            why: { type: 'string' },
          },
          required: ['find', 'replace', 'why'],
        },
      },
      added: {
        type: 'array',
        description: 'Anything the rewrite adds that the writer did not say or imply, and that the rewrite’s own liberties do not already report.',
        items: { type: 'object', properties: { after: { type: 'string', description: 'The rewrite’s words, exactly.' }, why: { type: 'string', description: 'What the voice does there.' } }, required: ['after', 'why'] },
      },
    },
    required: ['fixes', 'added'],
  },
};

/** A fast proofreader: the writer's text beside the rewrite, sentence by sentence; small exact edits, not a redraft. */
export async function proofread(m: AuthorModel, brief: Brief, s: Submission, client: Anthropic = makeClient()): Promise<Proof> {
  const a = m.author;
  const pairs = s.paragraphs
    .flatMap((p) => p.sentences)
    .map((x, i) => `${i + 1}. Rewrite: ${x.text}\n   Writer: ${(x.from ?? []).map((n) => brief.sentences[n - 1]?.text).filter(Boolean).join(' ') || '(none named)'}`)
    .join('\n');
  const system = `You proofread a rewrite of a writer's passage into the manner of ${a.title ?? a.name} against the writer's own sentences. The voice may change every word and the order; it may not change what is said. Find each place where the rewrite says something the writer did not: a fact, detail, time, number or degree changed; a feeling shifted or turned the other way; a word in a sense that misleads; a phrase repeated; a tense slipped; logic that now says something else. For each, give the smallest edit, in the voice, that makes it faithful. Then list anything added that the rewrite does not already report as a liberty. A mending of a contradiction that the rewrite reports is not a fault. Say nothing of taste. Most sentences need nothing.`;
  const user = `<writer>\n${brief.sentences.map((x) => x.text).join(' ')}\n</writer>\n\n<sentences>\n${pairs}\n</sentences>\n\n<reported>\n${[...(s.liberties ?? []).map((x) => `liberty: ${x.after}`), ...(s.sense ?? []).map((x) => `mending: ${x.after} (${x.problem})`)].join('\n') || '(none)'}\n</reported>\n\nCall ${PROOF.name}.`;
  const response = (await client.beta.messages.create({
    model: READER,
    max_tokens: 3000,
    system,
    tools: [PROOF],
    tool_choice: { type: 'tool', name: PROOF.name },
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: user }],
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)) as Anthropic.Beta.BetaMessage;
  const use = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
  const got = (use?.input ?? {}) as Partial<Proof>;
  return {
    fixes: (got.fixes ?? []).filter((x) => x?.find?.trim() && typeof x.replace === 'string' && x.find !== x.replace),
    added: (got.added ?? []).filter((x) => x?.after?.trim()),
  };
}

/** The proofreader's edits applied where their words stand, each within one sentence; what it found added, reported. */
export function applyProof(s: Submission, proof: Proof): { applied: number } {
  let applied = 0;
  for (const f of proof.fixes)
    for (const p of s.paragraphs)
      for (const x of p.sentences)
        if (x.text.includes(f.find)) {
          x.text = x.text.replace(f.find, f.replace).replace(/\s{2,}/g, ' ');
          applied++;
          break;
        }
  const told = (s.liberties ?? []).map((x) => x.after.toLowerCase());
  const text = submissionText(s).toLowerCase();
  s.liberties = [...(s.liberties ?? []), ...proof.added.filter((x) => text.includes(x.after.toLowerCase()) && !told.some((t) => t.includes(x.after.toLowerCase()) || x.after.toLowerCase().includes(t)))];
  return { applied };
}
/** Whether the voice's plan orders the parts otherwise than the writer did. */
export const replans = (r: Reading) => r.plan.length > 1 && r.plan.map((x) => x.role.toLowerCase()).join('|') !== r.outline.map((x) => x.role.toLowerCase()).join('|');

export function userPrompt(m: AuthorModel, brief: Brief, context: { before?: string; after?: string; instructions?: string; strength?: Strength; editor?: EditorNote[]; reading?: Reading } = {}): string {
  return [
    context.before ? `<text_before>\n${context.before}\n</text_before>` : '',
    renderBrief(m, brief, context.strength ?? 'full'),
    context.editor?.length
      ? `<editor>\nAn editor has read the passage for sense. Make each mending (or echo) below in your rewrite, and report each in sense, in your own words to the writer:\n${context.editor.map((e) => `- ${e.problem} ${e.resolution} (at: “${e.quote}”)`).join('\n')}\n</editor>`
      : '',
    context.reading && ['argument', 'letter', 'email'].includes(context.reading.kind) && context.reading.plan.length > 1
      ? `<plan>\nAn editor has planned how ${m.author.title ?? m.author.name} would build this ${context.reading.kind}. Build your rewrite to this plan, with the writer's matter only (no new facts, reasons or evidence), moving their paragraphs and sentences as it says:\n${context.reading.plan.map((x, i) => `${i + 1}. ${x.role}: ${x.gist} (${x.why})`).join('\n')}\n</plan>`
      : '',
    context.after ? `<text_after>\n${context.after}\n</text_after>` : '',
    context.instructions ? `<writer_asks>\n${context.instructions}\n</writer_asks>` : '',
    (context.strength ?? 'full') === 'full'
      ? `Rewrite the passage in the brief as ${m.author.short} would have written it, going the whole way (the text before and after is context only). Then call submit_rewrite.`
      : `Rewrite the passage in the brief (the text before and after is context only). Then call submit_rewrite.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const submissionText = (s: Submission) => s.paragraphs.map((p) => p.sentences.map((x) => x.text.trim()).join(' ')).join('\n\n');

/** Straight quotation marks made curly, as the corpus has them, so a move's pattern reads a typed sentence as hers. */
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

/** What the engine finds still wrong with a submission: nothing, and it is accepted. */
export function gate(m: AuthorModel, brief: Brief, s: Submission): string[] {
  const problems: string[] = [];
  const short = m.author.short;
  if (!s.paragraphs?.length) return ['The rewrite is empty.'];
  const text = submissionText(s);
  // A note's words, and a liberty's, are the rewrite's own: quoted exactly, not remembered.
  const flat = (t: string) => t.toLowerCase().replace(/[“”"‘’']/g, "'").replace(/[—–-]/g, '-').replace(/\s+/g, ' ').replace(/^[\s'.,;:]+|[\s'.,;:!?]+$/g, '');
  const whole = flat(text);
  const misquoted = [...s.notes.map((n) => n.after), ...(s.liberties ?? []).map((x) => x.after)].filter((a) => a?.trim() && !whole.includes(flat(a)));
  if (misquoted.length)
    problems.push(`These quotations of your rewrite are not in it: ${misquoted.map((a) => `“${a.slice(0, 80)}”`).join('; ')}. Quote your own words exactly, as they stand in your sentences.`);
  // The author may gather paragraphs, but not run the writer's whole passage into a lump.
  const theirs = new Set(brief.sentences.map((x) => x.paragraph)).size;
  if (theirs >= 2 && s.paragraphs.length < Math.ceil(theirs / 2))
    problems.push(`The writer gave ${theirs} paragraphs and you give ${s.paragraphs.length}: keep a paragraph for each turn of the matter, as many as the writer’s unless the matter truly wants fewer.`);
  // A heading stands: the writer's paragraphs on either side of one stay apart.
  const sectionOf = (paragraph: number) => brief.headings.filter((h) => h.before <= paragraph).length;
  s.paragraphs.forEach((p, k) => {
    const sections = new Set(p.sentences.flatMap((x) => x.from ?? []).map((n) => brief.sentences[n - 1]?.paragraph).filter((x): x is number => !!x).map(sectionOf));
    if (sections.size > 1) {
      const hd = brief.headings[Math.min(...sections)]!;
      problems.push(`Your paragraph ${k + 1} joins the writer's paragraphs from both sides of the heading “${hd.text}”: a heading stands, and nothing is joined across it. Give each side its own paragraphs.`);
    }
  });
  const check = checkPassage(m, text);
  const names = wordsThatStand(m, brief);
  const never = check.neverUsed.filter((w) => !names.has(w.word.toLowerCase()));
  if (never.length)
    problems.push(`${short} never wrote: ${never.map((w) => `“${w.word}”${w.alternatives.length ? ` (${w.alternatives.slice(0, 3).join(', ')})` : ''}`).join('; ')}.`);
  // A name stands; and where the author keeps modern things by their own names, so does the writer's compound (“ice cream”).
  const keptCompounds = check.compounds.filter((c) => !brief.sentences.some((x) => x.text.toLowerCase().includes(c.toLowerCase()) && (/^\p{Lu}/u.test(c) || !!m.author.keepModern)));
  if (keptCompounds.length)
    problems.push(`Compounds ${short} never wrote, though each word is hers: ${keptCompounds.map((c) => `“${c}”`).join(', ')}. Find what the thing would be in ${short}’s world, or describe it.`);
  // A modern adverb on an adjective of hers (“essentially alarmed”, “really cool”): a calque, not her idiom.
  for (const para of s.paragraphs)
    for (const x of para.sentences) {
      const toks = tokenize(x.text);
      const tags = m.tagger.tagTokens(toks);
      toks.forEach((t, k) => {
        const nx = toks[k + 1];
        if (!nx || t.kind !== 'word' || nx.kind !== 'word' || t.quoted) return;
        if (!/^(RB|QL)/.test(tags[k]!) || !/^JJ|^VBN/.test(tags[k + 1]!)) return;
        // Only the modern intensifiers, or an -ly adverb she seldom used: “extremely” is hers, whatever follows it.
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
  const covered = new Set(s.paragraphs.flatMap((p) => p.sentences.flatMap((x) => x.from)));
  const missing = brief.sentences.filter((x) => !covered.has(x.n));
  if (missing.length) problems.push(`Not rendered: ${missing.map((x) => `sentence ${x.n} (“${x.text}”)`).join('; ')}. Render each, or name it in the "from" of the sentence that carries its sense.`);
  const badModels = s.paragraphs.flatMap((p) => p.sentences).filter((x) => !m.cite(idOf(x.model ?? '')));
  if (badModels.length) problems.push(`Each sentence names the id of the sentence of ${short}’s that inspired it; these do not: ${badModels.map((x) => `“${x.text.slice(0, 40)}…” (${x.model || 'none'})`).join('; ')}.`);
  const bad = s.notes.filter((n) => !m.cite(idOf(n.model)));
  if (bad.length) problems.push(`Unknown ids: ${bad.map((n) => n.model).join(', ')}. Use ids from the brief or a tool result.`);
  const words = (t: string) => tokenize(t).filter((x) => x.kind === 'word').map((x) => x.norm);
  // A note names one of the author's moves, or a figure of speech by its term.
  const moves = new Map<string, { id: string; name: string; does: string; pattern?: string }>([
    ...Object.entries(FIGURES).map(([id, f]): [string, { id: string; name: string; does: string }] => [id, { id, name: f.name, does: f.gloss }]),
    ...(m.author.moves ?? []).map((x): [string, typeof x] => [x.id, x]),
  ]);
  for (const n of s.notes) {
    const mv = moves.get(n.move);
    const c = m.cite(idOf(n.model));
    if (!mv) problems.push(`No move "${n.move}": use one of ${[...moves.keys()].join(', ')}.`);
    else if (c && !m.shows(mv, c.text)) problems.push(`${n.model} does not show "${mv.id}" (${mv.name}): use find_example to find one that does.`);
    // The writer is to see the move in your words too (irony has no pattern a machine can trust).
    else if (mv.id === 'irony' && n.after) {
      // Irony has no form of its own; its usual vehicles do. The sentence that holds the note's words must show one.
      const holder = s.paragraphs.flatMap((p) => p.sentences).find((x) => x.text.includes(n.after.trim().replace(/[.,;]$/, '')))?.text ?? n.after;
      // Irony is open-ended: a note claiming it without a vehicle the engine knows is let stand, shown unconfirmed.
      void holder;
    } else if (n.after && !m.shows(mv, curl(n.after)))
      problems.push(`Your words for the "${mv.id}" note do not show it: “${n.after}”. ${mv.name}: ${mv.does} Quote the part of your rewrite that makes the move, or name the move it does make.`);
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
  // Things the writer named, dropped: neither put in her words nor rendered by a periphrasis.
  for (const p of s.paragraphs)
    for (const x of p.sentences) {
      const before = x.from.map((n) => brief.sentences[n - 1]?.text ?? '').filter(Boolean);
      const lost = explainSentence(m, before, x.text, null, brief.register === 'letter' ? 'letter' : undefined).dropped;
      if (lost.length) problems.push(`Dropped: ${lost.map((w) => `“${w}”`).join(', ')} (sentence ${x.from.join(', ')}). Render what the writer named in ${short}’s words, or by a short periphrasis, rather than leave it out.`);
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
export function render(m: AuthorModel, brief: Brief, s: Submission): Pick<RewriteResult, 'text' | 'paragraphs' | 'aligned' | 'source' | 'sense' | 'liberties' | 'explanation' | 'notes'> {
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
        sentences: p.sentences.map((x) => ({ text: x.text.trim(), source: sourceOf(x.from) })),
      };
    }),
    aligned: s.paragraphs.flatMap((p) =>
      p.sentences.map((x) => {
        const before = x.from.map((n) => brief.sentences[n - 1]?.text ?? '').filter(Boolean);
        const reg = brief.sentences[(x.from[0] ?? 1) - 1]?.register;
        const noted = s.notes.filter((n) => n.after && x.text.includes(n.after.trim().replace(/[.,;]$/, ''))).map((n) => n.move);
        const w = explainSentence(m, before, x.text, x.model, reg === 'letter' ? 'letter' : undefined, [], noted);
        return { after: x.text, before, from: (x.from ?? []).filter((n) => Number.isFinite(n)), why: w.why, model: w.model, moves: w.moves };
      }),
    ),
    explanation: s.explanation,
    notes: s.notes.map((n) => {
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
 * chat-completions form and back, so the rest of the protocol (tool calls, results, a redraft) is the same either way.
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
      // A rewrite is some three thousand tokens; asking for more only reserves credit that is never spent.
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

/** Tool results with ids, as the model is to cite them. */
export function toolResult(m: AuthorModel, name: string, input: Record<string, unknown>): string {
  return JSON.stringify(runTool(m, name, input));
}

export async function rewriteWithAI(
  m: AuthorModel,
  passage: string | DocBlock[],
  context: { before?: string; after?: string; instructions?: string; strength?: Strength; editor?: EditorNote[]; reading?: Reading } = {},
  onProgress: (what: string, progress: RewriteProgress) => void = () => {},
): Promise<RewriteResult> {
  const strength = context.strength ?? 'full';
  const tell = (what: string) => onProgress(what, { what, calls: toolCalls.length, draft: rounds, problems: problems.length });
  const blocks = typeof passage === 'string' ? blocksOfText(passage) : passage;
  const brief = buildBrief(m, blocks);
  const client = makeClient();
  // An editor reads for sense while the first draft is written (one pass that both writes and reads misses what does
  // not agree); what it finds goes back with the engine's check, as a redraft. A passage with no fault costs nothing.
  if (PASSES === 1 && strength === 'full' && !context.editor && !context.reading) {
    onProgress('reading it first', { what: 'reading it first', calls: 0, draft: 0, problems: 0 });
    const read = await readForSense(m, blocks.map((b) => b.text).join('\n\n'), readerClient(client)).catch(() => NO_READING);
    context = { ...context, editor: read.sense };
  }
  const editor: Promise<Reading> =
    context.reading || context.editor || strength !== 'full' || PASSES === 1
      ? Promise.resolve(context.reading ?? { ...NO_READING, sense: context.editor ?? [] })
      : readForSense(m, blocks.map((b) => b.text).join('\n\n'), client).catch(() => NO_READING);
  let editorTold = !!context.editor || PASSES === 1;
  const tools = [...(MODE === 'oneshot' ? [] : TOOL_SPECS.map((t) => ({ ...t, input_schema: { ...t.input_schema } }))), SUBMIT] as unknown as Anthropic.Beta.BetaTool[];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: userPrompt(m, brief, context) }];
  const toolCalls: RewriteResult['toolCalls'] = [];
  let accepted: Submission | null = null;
  let last: Submission | null = null;
  let rounds = 0;
  let problems: string[] = [];
  const usage = { input: 0, cached: 0, cacheWrite: 0, output: 0 };
  for (let turn = 0; turn < 18 && !accepted; turn++) {
    tell(turn === 0 ? (MODE === 'oneshot' ? 'writing the rewrite, in one go' : 'reading the brief') : rounds && problems.length ? `drafting again (draft ${rounds + 1})` : 'consulting the works');
    const params = {
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: systemPrompt(m, strength), cache_control: { type: 'ephemeral' } }],
      thinking: THINKING ? { type: 'adaptive' } : { type: 'disabled' },
      output_config: { effort: EFFORT },
      tools,
      messages,
      ...(PROVIDER === 'anthropic' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    };
    const response = await writerCall(client, params);
    const u = ((response as unknown as { usage?: Record<string, number> }).usage ?? {}) as Record<string, number>;
    usage.input += u.input_tokens ?? 0;
    usage.cached += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    usage.output += u.output_tokens ?? 0;
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
        if (!editorTold) {
          editorTold = true;
          tell('reading for sense');
          const reading = await editor;
          if (reading.sense.length)
            problems.push(
              `An editor has read the passage for sense. Make each mending (or echo) below, keep every other sentence of the writer’s, and report each in sense, in your own words to the writer:\n${reading.sense.map((e) => `  · ${e.problem} ${e.resolution} (at: “${e.quote}”)`).join('\n')}`,
            );
          // An argument, a letter or an email is rebuilt as the voice would build it; a story keeps its telling.
          if (['argument', 'letter', 'email'].includes(reading.kind) && replans(reading))
            problems.push(
              `An editor has planned how ${m.author.title ?? m.author.name} would build this ${reading.kind}. Build your rewrite in this order, with the same matter (no new facts or evidence), moving the writer’s paragraphs and sentences as needed:\n${reading.plan.map((x, i) => `  ${i + 1}. ${x.role}: ${x.gist} (${x.why})`).join('\n')}`,
            );
        }
        // In one transaction only a hard failure is worth a second: anything else the engine repairs or shows.
        const hard = PASSES === 2 ? problems : problems.filter((x) => /^Not rendered|across it|you give \d+:|^The rewrite is empty/.test(x) || /joins the writer's paragraphs from both sides/.test(x));
        if (!hard.length || rounds >= Math.max(DRAFTS, PASSES === 1 ? 2 : DRAFTS)) accepted = last;
        else problems = hard;
        tell(accepted ? (problems.length ? `draft ${rounds} taken, ${problems.length} left for you` : `draft ${rounds} accepted`) : `draft ${rounds}: ${problems.length} to mend`);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: problems.length && !accepted ? `Not yet accepted:\n- ${problems.join('\n- ')}` : 'Accepted.' });
        continue;
      }
      tell(`${u.name.replace(/_/g, ' ')}${input.word ? ` “${input.word}”` : input.query ? ` “${input.query}”` : ''}`);
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
  repairWords(m, brief, sub);
  if (PASSES === 1 && strength === 'full' && process.env.ADVISOR_PROOF === 'on') {
    tell('proofreading against yours');
    const proof = await proofread(m, brief, sub, client).catch(() => null);
    if (proof) applyProof(sub, proof);
  }
  const r = render(m, brief, sub);
  const fromEditor = await editor;
  const own = (xs: unknown) => (Array.isArray(xs) ? (xs as Step[]).filter((x) => x?.role?.trim() && x?.gist?.trim()) : []);
  const reading: Reading = PASSES === 1 ? { kind: String(sub.kind ?? 'other').toLowerCase(), outline: own(sub.outline), plan: own(sub.plan), sense: fromEditor.sense } : fromEditor;
  const flat = (t: string) => t.toLowerCase().replace(/[“”"‘’']/g, "'").replace(/[—–-]/g, '-').replace(/\s+/g, ' ').replace(/^[\s'.,;:]+|[\s'.,;:!?]+$/g, '');
  const whole = flat(r.text);
  r.notes = r.notes.filter((n) => (!n.after?.trim() || whole.includes(flat(n.after))) && (PASSES === 2 || n.verified));
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
    model: WRITER_MODEL,
  };
}
