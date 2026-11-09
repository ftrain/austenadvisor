// The engine's questions, as plain functions of JSON: what the page's explorer asks, what the HTTP API answers, and
// what the AI rewrite calls as tools. One set, so the language model sees exactly what the writer sees.

import { tokenize } from '../nlp/tokenize.ts';
import { tagName } from '../nlp/tagger.ts';
import { alternatives } from './alternatives.ts';
import { analyze } from './analyze.ts';
import { blocksOfText } from './doc.ts';
import type { AuthorModel, Citation, Register } from './model.ts';

/** One of the author's sentences as a tool gives it: its id first, to cite it by. */
const line = (c: Citation) => `S${c.id}: ${c.text} (${c.cite})`;
import { lmKey } from './profile.ts';

export interface WordProfile {
  word: string;
  count: number;
  perMillion: number;
  inNarration: number;
  inSpeech: number;
  works: { title: string; count: number }[];
  tags: { tag: string; name: string; count: number }[];
  forms: { form: string; tag: string; count: number }[];
  neighbours: string[];
  collocates: { word: string; together: number }[];
  examples: Citation[];
  alternatives?: ReturnType<typeof alternatives>;
  note: string;
}

export function wordProfile(m: AuthorModel, word: string, opts: { context?: string; examples?: number } = {}): WordProfile {
  const w = word.toLowerCase().replace(/’/g, "'").trim();
  const info = m.word(w);
  const short = m.author.short;
  const titles = new Map(m.author.works.map((x) => [x.id, x.title]));
  const forms = new Map<string, { form: string; tag: string; count: number }>();
  for (const { lemma, pos } of [...m.lemmasOfForm(w), ...m.wn.anyLemmas(w).map((l) => ({ lemma: l.lemma, pos: l.pos }))])
    for (const f of m.forms(lemma, pos)) forms.set(`${f.form}|${f.tag}`, f);
  const ctxWords = opts.context ? tokenize(opts.context).filter((t) => t.kind === 'word').map((t) => t.norm) : [];
  let alts: WordProfile['alternatives'];
  if (!info) {
    const toks = tokenize(opts.context && opts.context.toLowerCase().includes(w) ? opts.context : w);
    const keys = toks.map(lmKey).filter((k): k is string => !!k);
    const at = Math.max(0, keys.indexOf(w));
    const tags = m.tagger.tagTokens(toks);
    const k = toks.findIndex((t) => t.norm === w);
    alts = alternatives(m, { keys, at, word, tag: tags[Math.max(0, k)] ?? 'NN', context: ctxWords.filter((x) => x !== w) }, { limit: 8 });
  }
  return {
    word: w,
    count: info?.count ?? 0,
    perMillion: Math.round(m.rate(w) * 10) / 10,
    inNarration: info?.narr ?? 0,
    inSpeech: info?.dial ?? 0,
    works: Object.entries(info?.works ?? {})
      .map(([id, count]) => ({ title: titles.get(id) ?? id, count }))
      .sort((a, b) => b.count - a.count),
    tags: Object.entries(info?.tags ?? {})
      .map(([tag, count]) => ({ tag, name: tagName(tag), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    forms: [...forms.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    neighbours: m.neighbours(w, 12).map((n) => n.word),
    collocates: info ? m.collocates(w, 12).map(({ word, together }) => ({ word, together })) : [],
    examples: info ? m.search([w], { prefer: ctxWords, limit: opts.examples ?? 6, minWords: 5, maxWords: 60 }) : [],
    alternatives: alts,
    note: info
      ? `${short} wrote “${w}” ${info.count.toLocaleString()} times (${Math.round(m.rate(w))} per million words).`
      : `${short} never wrote “${w}”.`,
  };
}

/** Sentences with a word or phrase, KWIC-style: the words before, the match, the words after. */
export function concordance(m: AuthorModel, query: string, limit = 20): { left: string; match: string; right: string; cite: Citation }[] {
  const words = tokenize(query).filter((t) => t.kind === 'word').map((t) => t.norm);
  if (!words.length) return [];
  const hits = m.search(words, { phrase: words.length > 1, limit, minWords: 4, maxWords: 80 });
  return hits.map((c) => {
    const lower = c.text.toLowerCase().replace(/’/g, "'");
    const q = words.join(' ');
    let i = lower.search(new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s\\W]+')}\\b`));
    if (i < 0) i = lower.indexOf(words[0]!);
    const end = i < 0 ? 0 : i + (lower.slice(i).match(new RegExp(`^${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\W]+')}`))?.[0].length ?? words[0]!.length);
    return { left: c.text.slice(0, Math.max(0, i)), match: c.text.slice(Math.max(0, i), end), right: c.text.slice(end), cite: c };
  });
}

/** A passage checked against the author: flagged words with alternatives, advice, and the measures. Compact, for a model. */
export function checkPassage(m: AuthorModel, text: string) {
  const a = analyze(m, blocksOfText(text));
  return {
    score: a.report.score,
    neverUsed: a.words
      .filter((w) => w.kind !== 'name')
      .map((w) => ({ word: w.word, note: w.note, alternatives: w.alternatives.slice(0, 5).map((x) => `${x.text} (${x.source}, ${x.count}×)`) })),
    names: a.words.filter((w) => w.kind === 'name').map((w) => w.word),
    compounds: a.compounds.map((c) => c.text),
    unattested: unattestedPairs(m, text),
    advice: a.advice.map((x) => ({ severity: x.severity, title: x.title, message: x.message, why: x.why, suggestion: x.replacements?.[0]?.text })),
    measures: a.report.measures.map((x) => `${x.label}: yours ${x.yours}${x.unit === '%' ? '%' : ''}, ${m.author.short} ${x.author}${x.unit === '%' ? '%' : ''}`),
    overused: a.report.overused,
  };
}

/** Pairs of content words, each the author's, never found together in the author's works: phrases to look up. */
export function unattestedPairs(m: AuthorModel, text: string): string[] {
  const common = new Set(m.profile.mfw.words.slice(0, 120));
  const out: string[] = [];
  const toks = tokenize(text);
  for (let i = 0; i + 1 < toks.length; i++) {
    const a = toks[i]!;
    const b = toks[i + 1]!;
    if (a.kind !== 'word' || b.kind !== 'word' || common.has(a.norm) || common.has(b.norm)) continue;
    if (!m.word(a.norm) || !m.word(b.norm) || /^\p{Lu}/u.test(a.text) || /^\p{Lu}/u.test(b.text)) continue;
    if (m.lm.bigram(a.norm, b.norm) === 0) out.push(`${a.text} ${b.text}`);
  }
  return [...new Set(out)].slice(0, 15);
}

/** The author's habits in numbers, for a writer or a model to aim at. */
export function styleSummary(m: AuthorModel) {
  const P = m.profile;
  return {
    author: m.author.name,
    persona: m.author.persona,
    works: m.author.works.map((w) => `${w.title} (${w.year})`),
    words: P.words,
    sentenceLength: {
      narration: `median ${P.sentenceLength.narration.p50} words; a quarter over ${P.sentenceLength.narration.p75}; a tenth over ${P.sentenceLength.narration.p90}`,
      speech: `median ${P.sentenceLength.dialogue.p50} words`,
    },
    paragraphWords: `median ${P.paragraphWords.p50} words in narration`,
    punctuationPerSentence: Object.fromEntries(Object.entries(P.punctuationPerSentence).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    clauseJoins: Object.entries(P.joins).slice(0, 10).map(([k, v]) => `“${k}” ${v}×`),
    sentenceOpeners: Object.entries(P.openers).slice(0, 8).map(([t, v]) => `${tagName(t)} ${(v * 100).toFixed(0)}%`),
    commonestWords: P.mfw.words.slice(0, 60).join(', '),
    per1000Words: P.per1000,
  };
}

export const TOOL_SPECS = [
  {
    name: 'check_passage',
    description:
      "Check a draft against the author's works: every word the author never used (with the author's alternatives), compounds of hers she never wrote together, pairs of content words never found together in her works (look them up in the concordance), contractions, short-sentence runs, and measures against hers.",
    input_schema: {
      type: 'object' as const,
      properties: { text: { type: 'string', description: 'The passage, paragraphs separated by blank lines.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'word_profile',
    description:
      "How the author used a word: count, per million, narration vs speech, by work, parts of speech, the forms used, nearest words in the author's own usage (vectors), collocates, and cited example sentences. For a word the author never used, alternatives the author did use. Pass the sentence it stands in as context to rank by fit.",
    input_schema: {
      type: 'object' as const,
      properties: { word: { type: 'string' }, context: { type: 'string', description: 'The sentence the word stands in, if any.' } },
      required: ['word'],
      additionalProperties: false,
    },
  },
  {
    name: 'concordance',
    description: "Real sentences from the author's works containing a word or exact phrase, each with its id and citation. Use it to confirm an idiom or construction is the author's before you use it.",
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'A word or an exact phrase.' }, limit: { type: 'integer', description: 'At most this many (default 10).' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'similar_sentences',
    description: "Sentences from the author's works nearest in meaning to a passage (SIF sentence vectors over the author's own word vectors), with citations: models of how the author said something like it.",
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string' },
        register: { type: 'string', enum: ['narration', 'speech', 'letter'], description: 'Only sentences told so: in narration, in speech, or in a letter.' },
        limit: { type: 'integer' },
        min_words: { type: 'integer', description: 'Only sentences at least this long.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_example',
    description:
      "Sentences of the author's that show a named move (balance, litotes, reported speech…), nearest in meaning to the text you give, each with its id. Use it to choose the model sentence for a note: a note's model must show its move.",
    input_schema: {
      type: 'object' as const,
      properties: {
        move: { type: 'string', description: 'The move’s id, as listed in the brief’s <moves>.' },
        near: { type: 'string', description: 'Your sentence, or the writer’s, to find examples near it.' },
        limit: { type: 'integer' },
      },
      required: ['move', 'near'],
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOL_SPECS)[number]['name'];

export function runTool(m: AuthorModel, name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case 'check_passage':
      return checkPassage(m, String(input.text ?? ''));
    case 'word_profile': {
      const p = wordProfile(m, String(input.word ?? ''), { context: input.context ? String(input.context) : undefined, examples: 4 });
      return { ...p, examples: p.examples.map(line), alternatives: p.alternatives?.map((a) => ({ word: a.text, why: a.relation, count: a.count, example: a.example ? line(a.example) : undefined })) };
    }
    case 'concordance':
      return concordance(m, String(input.query ?? ''), Math.min(25, Number(input.limit ?? 10))).map((k) => line(k.cite));
    case 'similar_sentences':
      return m
        .similarSentences(String(input.text ?? ''), Math.min(10, Number(input.limit ?? 5)), {
          minWords: input.min_words ? Number(input.min_words) : undefined,
          register: ['narration', 'speech', 'letter'].includes(String(input.register)) ? (input.register as Register) : undefined,
        })
        .map(line);
    case 'find_example': {
      const ex = m.moveExamples(String(input.move ?? ''), String(input.near ?? ''), Math.min(8, Number(input.limit ?? 4)));
      if (!ex.length) return `No move "${input.move}". Moves: ${(m.author.moves ?? []).map((x) => x.id).join(', ')}.`;
      return ex.map(line);
    }
    default:
      throw new Error(`no tool ${name}`);
  }
}
