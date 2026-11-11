// A rewrite brief: the passage as the engine reads it, sentence by numbered sentence, for a language model to work
// from. Each sentence carries its register (narration, speech, a letter), its length against the author's, every word
// the author never wrote with the author's own alternatives, and the author's sentence nearest it in meaning and in
// the same register, by its id. The voice's moves, with an example of each, go in the system prompt (renderMoves),
// which is the same for every rewrite in a voice and so is cached.

import { cap, pronounsOf } from '../corpus/sources.ts';
import { tokenize } from '../nlp/tokenize.ts';
import { analyze } from './analyze.ts';
import { FIGURES } from './figures.ts';
import type { DocBlock } from './doc.ts';
import type { Form } from './forms.ts';
import type { AuthorModel, Citation, Register } from './model.ts';
import { plainFaults } from './plain.ts';

export interface BriefSentence {
  n: number;
  paragraph: number;
  text: string;
  register: Register;
  words: number;
  never: { word: string; alternatives: string[]; synonym?: boolean }[];
  /** For a style: where the sentence breaks a rule of the style, and what to do. A writer's voice has none. */
  faults?: { rule: string; words: string; instead: string | null; reason: string }[];
  models: Citation[];
}

export interface Brief {
  register: 'letter' | 'narrative';
  person: 'first' | 'third';
  sentences: BriefSentence[];
  /** Headings inside the passage: each stands before the paragraph numbered `before`, and nothing may be joined
   * across it. */
  headings: { before: number; text: string }[];
  score: number;
}

/** The form a part is fitted to, as the brief states it. Paragraph numbers are the brief's own, from 1. */
export interface BriefForm {
  form: Form;
  /** The form's parts in order, each with the brief's paragraphs that do its work. */
  slots: { role: string; says: string; paragraphs: number[] }[];
  /** The required parts no paragraph fills, which the writer may write. Empty unless the student chose the form. */
  missing: string[];
}

/** A fact the writer may state: a whole sentence from a Wikipedia article, for one paragraph of the brief. */
export interface BriefFact {
  id: string;
  text: string;
  title: string;
  /** The brief's paragraph it supports, from 1. */
  paragraph: number;
  /** The article's address, for the page's footnote. The writer is not shown it. */
  url?: string;
}

/** What a brief carries beyond the passage: the form it is fitted to, and the facts gathered for it. */
export interface BriefExtras {
  form?: BriefForm | null;
  facts?: BriefFact[];
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
      const models = m.similarSentences(text, 1, { minWords: register === 'speech' ? 5 : 10, maxWords: 70, register });
      const faults = m.author.style ? plainFaults(m.plain, text).map((f) => ({ rule: f.rule, words: f.kind === 'loaded' ? '' : f.text, instead: f.instead, reason: f.reason })) : undefined;
      sentences.push({ n: sentences.length + 1, paragraph, text, register, words: s.words, never, ...(faults ? { faults } : {}), models });
    }
  });
  return {
    register: letter ? 'letter' : 'narrative',
    person: firstPerson >= thirdPerson ? 'first' : 'third',
    sentences,
    headings,
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

/** The brief as the model reads it: tagged and numbered, each sentence with the author's sentence nearest it. */
export function renderBrief(m: AuthorModel, b: Brief, extras: BriefExtras = {}): string {
  const short = m.author.short;
  const pr = pronounsOf(m.author);
  const P = m.profile;
  const out: string[] = [];
  out.push(
    `<brief register="${b.register}" person="${b.person}" sentences="${b.sentences.length}">`,
    `<targets>`,
    `Narration: ${short}’s sentences have a median of ${P.sentenceLength.narration.p50} words; half fall between ${P.sentenceLength.narration.p25} and ${P.sentenceLength.narration.p75}. Speech: median ${P.sentenceLength.dialogue.p50}.`,
    `${(P.punctuationPerSentence[';'] ?? 0).toFixed(2)} semicolons and ${(P.punctuationPerSentence[':'] ?? 0).toFixed(2)} colons a sentence; ${(P.punctuationPerSentence[',']! ).toFixed(1)} commas a sentence. ${contractionNote(m)}`,
    m.author.style
      ? `These are the lengths of the style’s models. Give each sentence one idea, and let its length follow from that.`
      : `Write within these as ${short} did: most narrative sentences at or above the median, never padded; a short one only for a turn or a verdict.`,
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
    for (const w of s.never) out.push(`  <never word="${esc(w.word)}">${short} never wrote it. ${w.alternatives.length ? `${cap(pr.possessive)} words: ${esc(w.alternatives.join('; '))}` : `${short} has no word near it: rephrase.`}</never>`);
    for (const f of s.faults ?? []) out.push(`  <fault rule="${esc(f.rule)}">${esc(f.reason)}</fault>`);
    for (const c of s.models) out.push(`  <nearest>${esc(c.text)} (${esc(c.cite)})</nearest>`);
    out.push(`</sentence>`);
  }
  if (para) out.push(`</paragraph>`);
  out.push(...renderForm(extras.form), ...renderFacts(extras.facts));
  out.push(`</brief>`);
  return out.join('\n');
}

/** The form's parts in order, the paragraphs that fill each, and the parts the writer may write. */
function renderForm(f?: BriefForm | null): string[] {
  if (!f) return [];
  const out = [`<form name="${esc(f.form.name)}">`, esc(f.form.definition), `Its parts in order, with the writer’s paragraphs that do each:`];
  for (const s of f.slots) {
    const missing = f.missing.includes(s.role);
    out.push(`  <part role="${esc(s.role)}"${s.paragraphs.length ? ` paragraphs="${s.paragraphs.join(' ')}"` : ''}${missing ? ' missing="true"' : ''}>${esc(s.says)}</part>`);
  }
  out.push(`The engine has put the paragraphs in the form’s order. Keep that order.`);
  if (f.missing.length)
    out.push(
      `Missing: ${f.missing.join(', ')}. The engine found no paragraph for ${f.missing.length > 1 ? 'these parts' : 'this part'}. Where a paragraph of the writer’s already does the work, give that paragraph the role and add nothing. Otherwise write the part as one new paragraph in its place, in one or two sentences drawn from what the passage already says.${f.form.short ? ` ${/^[aeiou]/i.test(f.form.name) ? 'An' : 'A'} ${f.form.name.toLowerCase()} is short: one sentence will do.` : ''}`,
    );
  out.push(`</form>`);
  return out;
}

/** The facts the writer may state, each with its id and the paragraph it supports. */
function renderFacts(facts?: BriefFact[]): string[] {
  if (!facts?.length) return [];
  return [
    `<facts>`,
    `Sentences from Wikipedia that bear on the passage. State one only where it helps the paragraph it is given for, and leave out any that does not fit.`,
    ...facts.map((f) => `  <fact id="${esc(f.id)}" paragraph="${f.paragraph}" source="${esc(f.title)}">${esc(f.text)}</fact>`),
    `</facts>`,
  ];
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

/** The voice's moves, each with one sentence of the author's that makes it. The example is chosen against the move's
 * own name, never against the passage, so the block is the same for every rewrite in the voice and can be cached. */
export function renderMoves(m: AuthorModel): string {
  const out = ['<moves>'];
  const used = new Set<number>();
  for (const mv of m.author.moves ?? []) {
    // Each example shows one move only, so no move borrows another's.
    const c = m.moveExamples(mv.id, `${mv.name}. ${mv.does}`, 4).find((x) => !used.has(x.id));
    out.push(`<move id="${mv.id}" name="${esc(mv.name)}">${esc(mv.does)}`);
    if (c) {
      used.add(c.id);
      out.push(`  <example>${esc(c.text)} (${esc(c.cite)})</example>`);
    }
    out.push('</move>');
  }
  out.push('</moves>');
  return out.join('\n');
}
