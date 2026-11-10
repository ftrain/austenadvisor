// A rewrite brief: the passage as the engine reads it, sentence by numbered sentence, for a language model to work
// from. Each sentence carries its register (narration, speech, a letter), its length against the author's, every word
// the author never wrote with the author's own alternatives, and two of the author's sentences nearest it in meaning
// and in the same register, each by its id. The model cites the author only by those ids; the server renders them.

import { cap, pronounsOf } from '../corpus/sources.ts';
import { tokenize } from '../nlp/tokenize.ts';
import { analyze } from './analyze.ts';
import { FIGURES } from './figures.ts';
import type { DocBlock } from './doc.ts';
import type { AuthorModel, Citation, Register } from './model.ts';

export interface BriefSentence {
  n: number;
  paragraph: number;
  text: string;
  register: Register;
  words: number;
  never: { word: string; alternatives: string[]; synonym?: boolean }[];
  models: Citation[];
}

export interface Brief {
  register: 'letter' | 'narrative';
  person: 'first' | 'third';
  sentences: BriefSentence[];
  /** Headings inside the passage: each stands before the paragraph numbered `before`, and nothing may be joined
   * across it. */
  headings: { before: number; text: string }[];
  advice: string[];
  measures: string[];
  score: number;
}

const FIRST = new Set(['i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our']);

/** A letter opens with "Dear …" or closes with a signature line. */
function isLetter(blocks: DocBlock[]): boolean {
  const texts = blocks.filter((b) => b.kind === 'paragraph').map((b) => b.text.trim());
  return /^(dear|my dear|dearest)\b/i.test(texts[0] ?? '') || texts.slice(-3).some((t) => /^(love|yours|your|ever yours|with love|affectionately)\b[^.]{0,40},?\s*\S*$/i.test(t));
}

export function buildBrief(m: AuthorModel, blocks: DocBlock[]): Brief {
  const a = analyze(m, blocks);
  const letter = isLetter(blocks);
  let firstPerson = 0;
  let thirdPerson = 0;
  const sentences: BriefSentence[] = [];
  const headings: Brief['headings'] = [];
  let pendingHeading: string | null = null;
  let paragraph = 0;
  blocks.forEach((b, bi) => {
    if (b.kind === 'heading' || b.kind === 'title') {
      if (paragraph) pendingHeading = b.text;
      return;
    }
    if (b.kind !== 'paragraph' && b.kind !== 'quote' && b.kind !== 'item') return;
    paragraph++;
    if (pendingHeading !== null) {
      headings.push({ before: paragraph, text: pendingHeading });
      pendingHeading = null;
    }
    for (const s of a.sentences.filter((x) => x.block === bi)) {
      const text = b.text.slice(s.start, s.end);
      for (const t of tokenize(text)) if (t.kind === 'word' && !t.quoted) FIRST.has(t.norm) ? firstPerson++ : /^(he|she|they|him|her|them)$/.test(t.norm) && thirdPerson++;
      const register: Register = s.spoken ? 'speech' : letter ? 'letter' : 'narration';
      const never = a.words
        .filter((w) => w.block === bi && w.start >= s.start && w.end <= s.end && w.kind !== 'name')
        // Only words near in meaning: a sense a long way down WordNet's list gives “blue” for “strict”.
        .map((w) => ({
          word: w.word,
          alternatives: w.alternatives.filter((x) => x.source !== 'context' && x.weight >= 0.2).slice(0, 5).map((x) => `${x.text} (${x.relation.replace(/^same sense: /, '')}; ${x.count}×)`),
          // A word of the same sense the author used: “children” for “kids”. Then the writer's word cannot stand as a modern thing.
          synonym: w.alternatives.some((x) => (x.source === 'synonym' || x.source === 'expansion') && x.weight >= 0.7 && x.count >= 5),
        }));
      const models = m.similarSentences(text, 2, { minWords: register === 'speech' ? 5 : 10, maxWords: 70, register });
      sentences.push({ n: sentences.length + 1, paragraph, text, register, words: s.words, never, models });
    }
  });
  return {
    register: letter ? 'letter' : 'narrative',
    person: firstPerson >= thirdPerson ? 'first' : 'third',
    sentences,
    headings,
    advice: a.advice.filter((x) => x.kind !== 'word').map((x) => `${x.title}: ${x.why}`),
    measures: a.report.measures.map((x) => `${x.label}: the writer’s ${x.yours}, ${m.author.short}’s ${x.author}`),
    score: a.report.score,
  };
}

/** How the author contracts, from the author's own counts: “don't” against “do not”, in narration and in speech. */
export function contractionNote(m: AuthorModel): string {
  const { n, d } = contractionRates(m);
  if (n >= 2) return `Contractions freely (${n.toFixed(1)} a thousand words outside quotation, ${d.toFixed(1)} inside).`;
  if (d >= 2) return `Contractions in speech (${d.toFixed(1)} a thousand words), seldom outside it (${n.toFixed(1)}).`;
  return 'Contractions only in speech, and rarely.';
}

/** Whether the author contracts outside quotation as a habit: Twain and Obama do; Austen does not. */
export const contractsFreely = (m: AuthorModel) => contractionRates(m).n >= 2;

function contractionRates(m: AuthorModel): { n: number; d: number } {
  const c = Object.values(m.profile.contractions ?? {});
  const narr = c.reduce((a, x) => a + x.narr, 0);
  const dial = c.reduce((a, x) => a + x.dial, 0);
  const total = m.profile.words ?? 0;
  const per = (n: number) => (total ? (1000 * n) / total : 0);
  return { n: per(narr), d: per(dial) };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The brief as the model reads it: tagged, numbered, every model sentence by its id. */
export function renderBrief(m: AuthorModel, b: Brief, strength: 'full' | 'light' = 'full'): string {
  const short = m.author.short;
  const P = m.profile;
  const out: string[] = [];
  out.push(
    `<brief register="${b.register}" person="${b.person}" sentences="${b.sentences.length}">`,
    `<targets>`,
    `Narration: ${short}’s sentences have a median of ${P.sentenceLength.narration.p50} words; half fall between ${P.sentenceLength.narration.p25} and ${P.sentenceLength.narration.p75}. Speech: median ${P.sentenceLength.dialogue.p50}.`,
    `${(P.punctuationPerSentence[';'] ?? 0).toFixed(2)} semicolons and ${(P.punctuationPerSentence[':'] ?? 0).toFixed(2)} colons a sentence; ${(P.punctuationPerSentence[',']! ).toFixed(1)} commas a sentence. ${contractionNote(m)}`,
    strength === 'full'
      ? `Write within these as ${short} did: most narrative sentences at or above the median, built of balanced clauses, never padded; a short one only for a turn or a verdict.`
      : `These are ranges to write within, not scores to raise: a sentence padded to length is worse than a short one.`,
    `</targets>`,
  );
  let para = 0;
  for (const s of b.sentences) {
    if (s.paragraph !== para) {
      if (para) out.push(`</paragraph>`);
      para = s.paragraph;
      const hd = b.headings.find((x) => x.before === para);
      if (hd) out.push(`<heading>${esc(hd.text)}</heading>`);
      out.push(`<paragraph n="${para}">`);
    }
    out.push(`<sentence n="${s.n}" register="${s.register}" words="${s.words}">`, esc(s.text));
    for (const w of s.never) out.push(`  <never word="${esc(w.word)}">${short} never wrote it. ${w.alternatives.length ? `Hers: ${esc(w.alternatives.join('; '))}` : 'No word of hers is near: rephrase.'}</never>`);
    for (const c of s.models) out.push(`  <model id="S${c.id}">${esc(c.text)} (${esc(c.cite)})</model>`);
    out.push(`</sentence>`);
  }
  if (para) out.push(`</paragraph>`);
  if (b.advice.length) out.push(`<advice>`, ...b.advice.map(esc), `</advice>`);
  out.push(`<measures score="${b.score}">`, ...b.measures.map(esc), `</measures>`, renderMoves(m, b), `</brief>`);
  return out.join('\n');
}

export function craftOf(m: AuthorModel): string {
  const pr = pronounsOf(m.author);
  return [
    `${cap(pr.possessive)} moves (each note you give names one, by its id):`,
    ...(m.author.moves ?? []).map((x) => `- ${x.id}: ${x.name}. ${x.does}`),
    '',
    ...(m.author.craftNotes ?? []).map((x) => `- ${x}`),
    '',
    'Figures of speech the engine recognizes by their form, and names in what it tells the writer (a note may name one by its term):',
    // Irony, and its aside, only for an author who has it.
    ...Object.entries(FIGURES)
      .filter(([k]) => !['irony', 'aside'].includes(k) || (m.author.moves ?? []).some((x) => x.id === 'irony'))
      .map(([k, f]) => `- ${k}: ${f.name}. ${f.gloss}`),
  ].join('\n');
}

/** Two of the author's sentences for each move, nearest the passage: exemplars to learn from and to cite. */
export function renderMoves(m: AuthorModel, b: Brief): string {
  const near = b.sentences.map((x) => x.text).join(' ');
  const out = ['<moves>'];
  const used = new Set<number>();
  for (const mv of m.author.moves ?? []) {
    out.push(`<move id="${mv.id}" name="${esc(mv.name)}">`);
    // Each example shows one move only here, so a note cannot borrow another's.
    for (const c of m.moveExamples(mv.id, near, 6).filter((c) => !used.has(c.id)).slice(0, 2)) {
      used.add(c.id);
      out.push(`  <example id="S${c.id}">${esc(c.text)} (${esc(c.cite)})</example>`);
    }
    out.push('</move>');
  }
  out.push('</moves>');
  return out.join('\n');
}
