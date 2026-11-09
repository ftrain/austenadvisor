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
  never: { word: string; alternatives: string[] }[];
  models: Citation[];
}

export interface Brief {
  register: 'letter' | 'narrative';
  person: 'first' | 'third';
  sentences: BriefSentence[];
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
  let paragraph = 0;
  blocks.forEach((b, bi) => {
    if (b.kind !== 'paragraph' && b.kind !== 'quote' && b.kind !== 'item') return;
    paragraph++;
    for (const s of a.sentences.filter((x) => x.block === bi)) {
      const text = b.text.slice(s.start, s.end);
      for (const t of tokenize(text)) if (t.kind === 'word' && !t.quoted) FIRST.has(t.norm) ? firstPerson++ : /^(he|she|they|him|her|them)$/.test(t.norm) && thirdPerson++;
      const register: Register = s.spoken ? 'speech' : letter ? 'letter' : 'narration';
      const never = a.words
        .filter((w) => w.block === bi && w.start >= s.start && w.end <= s.end && w.kind !== 'name')
        .map((w) => ({ word: w.word, alternatives: w.alternatives.filter((x) => x.source !== 'context').slice(0, 5).map((x) => `${x.text} (${x.relation.replace(/^same sense: /, '')}; ${x.count}×)`) }));
      const models = m.similarSentences(text, 2, { minWords: register === 'speech' ? 5 : 10, maxWords: 70, register });
      sentences.push({ n: sentences.length + 1, paragraph, text, register, words: s.words, never, models });
    }
  });
  return {
    register: letter ? 'letter' : 'narrative',
    person: firstPerson >= thirdPerson ? 'first' : 'third',
    sentences,
    advice: a.advice.filter((x) => x.kind !== 'word').map((x) => `${x.title}: ${x.why}`),
    measures: a.report.measures.map((x) => `${x.label}: the writer’s ${x.yours}, ${m.author.short}’s ${x.author}`),
    score: a.report.score,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The brief as the model reads it: tagged, numbered, every model sentence by its id. */
export function renderBrief(m: AuthorModel, b: Brief): string {
  const short = m.author.short;
  const P = m.profile;
  const out: string[] = [];
  out.push(
    `<brief register="${b.register}" person="${b.person}" sentences="${b.sentences.length}">`,
    `<targets>`,
    `Narration: ${short}’s sentences have a median of ${P.sentenceLength.narration.p50} words; half fall between ${P.sentenceLength.narration.p25} and ${P.sentenceLength.narration.p75}. Speech: median ${P.sentenceLength.dialogue.p50}.`,
    `About one sentence in three has a semicolon; ${(P.punctuationPerSentence[',']! ).toFixed(1)} commas a sentence. Contractions only in speech, and rarely.`,
    `These are ranges to write within, not scores to raise: a sentence padded to length is worse than a short one.`,
    `</targets>`,
  );
  let para = 0;
  for (const s of b.sentences) {
    if (s.paragraph !== para) {
      if (para) out.push(`</paragraph>`);
      para = s.paragraph;
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
    ...Object.entries(FIGURES).map(([k, f]) => `- ${k}: ${f.name}. ${f.gloss}`),
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
