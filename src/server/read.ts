// The engine's reading of a student's text against one voice, with no model call. It is what the page shows while
// the student types and while a rewrite is on its way:
//
// - kind and roles: what sort of writing it is, and what each paragraph does (structure.ts);
// - form: the form asked for, or the form of the kind, with the text fitted to it (forms.ts);
// - never: up to five words the voice never wrote, the rarest first, each with the voice's own word where the
//   engine is sure of it;
// - style: words a sentence and one joining mark, the student's against the voice's;
// - suggest: the three voices the picker puts first (voiceid.ts);
// - sketch: for each sentence, the voice's own sentence built most like it (shape.ts), or null.

import { ROOT } from '../db.ts';
import { cap, goodForOf, pronounsOf, readAuthor } from '../corpus/sources.ts';
import { alternatives, type Alternative, type Slot } from '../engine/alternatives.ts';
import { blocksOfText } from '../engine/doc.ts';
import { formLine, readForm, type AlignedSlot, type Move } from '../engine/forms.ts';
import type { AuthorModel } from '../engine/model.ts';
import type { Dist } from '../engine/profile.ts';
import { lmKey } from '../engine/profile.ts';
import type { Pack } from '../engine/pack.ts';
import { needlessWords, type FaultKind, type PlainRule } from '../engine/plain.ts';
import { lineClass, nearest } from '../engine/shape.ts';
import { ROLES, shapeLine, type Kind, type ParagraphRoles, type Role } from '../engine/structure.ts';
import { suggest, type Suggestion, type VoiceInfo } from '../engine/voiceid.ts';
import { isProperTag } from '../nlp/tagger.ts';
import { looksProper, sentences as splitSentences, tokenize, type Token } from '../nlp/tokenize.ts';
import { loadPacks, model, pack } from './models.ts';
import { authors } from './voices.ts';

/** At most this many never-used words are shown. */
export const NEVER_LIMIT = 5;
/** An alternative is offered only at this WordNet weight or more, and only from a sense of the word. */
export const ALT_WEIGHT = 0.35;
/** And only where the voice wrote it this often: one use is a slip, not a habit. */
export const ALT_MIN_COUNT = 3;
const SENSE_SOURCES = new Set<Alternative['source']>(['synonym', 'similar', 'broader', 'narrower', 'expansion']);

export interface NeverWord {
  word: string;
  /** Where it first stands: the paragraph's index in `paragraphs`, and its offsets in that paragraph. */
  paragraph: number;
  start: number;
  end: number;
  /** Times it appears in the text. */
  times: number;
  /** The word's dictionary form, where the voice wrote it in another form, and how often. */
  lemma?: string;
  lemmaCount: number;
  /** The voice's own word for it, where the engine is sure of the sense. */
  alternative: { text: string; count: number; relation: string } | null;
  /** "Lincoln never wrote “honestly”; he wrote “in truth” (41 times)." For a needless word, the reason to cut it. */
  note: string;
  /** For a style (plain), the entry is a needless word, and these say what it is: its kind, the move that cuts it,
   * the glossary term that defines the kind, and the word to write in its place (null: cut it). */
  kind?: FaultKind;
  rule?: PlainRule;
  term?: string;
  instead?: string | null;
}

/** At most this many needless words are marked for a style. */
export const NEEDLESS_LIMIT = 12;

/** A style's needless words (plain.ts), in the shape of the words a voice never wrote, so the page marks them alike. */
function needless(m: AuthorModel, paragraphs: string[]): NeverWord[] {
  return needlessWords(m.plain, paragraphs, NEEDLESS_LIMIT).map((w) => ({ ...w, lemmaCount: 0, alternative: null }));
}

export interface StyleLine {
  sentences: number;
  /** Words in each of the student's sentences, in order. */
  lengths: number[];
  yours: number;
  voice: number;
  /** The middle half of the voice's sentence lengths. */
  voiceBand: [number, number];
  /** The joining mark that most sets the two apart, per ten sentences. */
  mark: { mark: string; name: string; yours: number; voice: number } | null;
  /** "Words a sentence: yours 11, Lincoln 24. Semicolons in ten sentences: yours 0, Lincoln 3." */
  line: string;
}

export interface SketchRow {
  paragraph: number;
  /** The sentence's index in its paragraph, and its offsets there. */
  sentence: number;
  start: number;
  end: number;
  text: string;
  /** The voice's sentence built most like it, or null where none comes close enough. */
  match: { id: number; text: string; cite: string; score: number } | null;
}

/** The form the text is read for, and how the text fits it. Paragraph numbers are indexes in `paragraphs`. */
export interface FormView {
  id: string;
  name: string;
  definition: string;
  /** True when the student asked for no form and the engine took the form of the kind. */
  auto: boolean;
  /** The form's parts in order: "Claim · Reason · Evidence · Objection · Answer · Call". */
  line: string;
  /** Each slot with the paragraphs that fill it, and its role's name as a label shows it. */
  slots: (AlignedSlot & { name: string })[];
  /** The paragraphs in the form's order. */
  order: number[];
  /** The paragraphs the form puts elsewhere, each with the reason. */
  moved: Move[];
  /** The required parts the text lacks. */
  missing: Role[];
}

/** Thrown for a form id that names no form. */
export class UnknownForm extends Error {}

export interface Reading {
  voice: string;
  kind: Kind;
  /** The paragraphs as read: the indexes in roles, never and sketch refer to these. */
  paragraphs: string[];
  roles: (ParagraphRoles & { name: string })[];
  form: FormView;
  /** The SHAPE line: the student's parts in order, the form's, and the voice's usual order. */
  shape: { yours: string; form: string; voice: string | null; signature: string | null };
  never: NeverWord[];
  /** What `never` holds: words the voice never wrote, or, for a style, the writer's needless words. */
  marks: 'never' | 'needless';
  style: StyleLine;
  suggest: Suggestion;
  sketch: SketchRow[];
  ms: number;
}

interface Sent {
  paragraph: number;
  index: number;
  start: number;
  end: number;
  text: string;
  toks: Token[];
  from: number;
  to: number;
}

/** The paragraphs as structure.ts reads them, and their sentences. A salutation or sign-off line is one sentence. */
function sentencesOfText(text: string): { paragraphs: string[]; sentences: Sent[] } {
  const paragraphs = blocksOfText(text)
    .filter((b) => b.kind === 'paragraph' || b.kind === 'quote' || b.kind === 'item')
    .map((b) => b.text.trim())
    .filter(Boolean);
  const sentences: Sent[] = [];
  paragraphs.forEach((p, pi) => {
    const toks = tokenize(p);
    if (lineClass(p) !== 'sentence') {
      sentences.push({ paragraph: pi, index: 0, start: 0, end: p.length, text: p, toks, from: 0, to: toks.length });
      return;
    }
    let i = 0;
    for (const s of splitSentences(p, toks)) {
      if (!toks.slice(s.from, s.to).some((t) => t.kind === 'word')) continue;
      sentences.push({ paragraph: pi, index: i++, start: s.start, end: s.end, text: p.slice(s.start, s.end), toks, from: s.from, to: s.to });
    }
  });
  return { paragraphs, sentences };
}

/** The words of the text the voice never wrote: names, numbers and words the voice used left out. */
function neverWords(m: AuthorModel, sents: Sent[]): NeverWord[] {
  const short = m.author.short;
  const found = new Map<string, NeverWord & { slot: Slot; order: number }>();
  for (const s of sents) {
    const tags = m.tagger.tagTokens(s.toks, s.from, s.to);
    const keys: string[] = [];
    const keyAt: number[] = [];
    for (let k = s.from; k < s.to; k++) {
      const key = lmKey(s.toks[k]!);
      keyAt.push(key ? keys.length : -1);
      if (key) keys.push(key);
    }
    const content = s.toks.slice(s.from, s.to).filter((t) => t.kind === 'word').map((t) => t.norm);
    for (let k = s.from; k < s.to; k++) {
      const t = s.toks[k]!;
      if (t.kind !== 'word' || m.word(t.norm)) continue;
      const tag = tags[k - s.from]!;
      if (isProperTag(tag) || looksProper(s.toks, k, s.from)) continue;
      const had = found.get(t.norm);
      if (had) {
        had.times++;
        continue;
      }
      let lemma: string | undefined;
      let lemmaCount = 0;
      for (const l of m.wn.anyLemmas(t.norm)) {
        const c = m.forms(l.lemma, l.pos).reduce((a, f) => a + f.count, 0);
        if (c > lemmaCount) [lemma, lemmaCount] = [l.lemma, c];
      }
      found.set(t.norm, {
        word: t.text,
        paragraph: s.paragraph,
        start: t.start,
        end: t.end,
        times: 1,
        ...(lemma && lemmaCount ? { lemma } : {}),
        lemmaCount,
        alternative: null,
        note: '',
        slot: { keys, at: keyAt[k - s.from]!, word: t.text, tag, context: content.filter((w) => w !== t.norm) },
        order: found.size,
      });
    }
  }
  // The rarest first: words the voice never wrote in any form, then those it wrote only in other forms, fewest first.
  const chosen = [...found.values()].sort((a, b) => a.lemmaCount - b.lemmaCount || a.order - b.order).slice(0, NEVER_LIMIT);
  const they = pronounsOf(m.author).subject;
  return chosen.map(({ slot, order: _order, ...w }) => {
    const alt = alternatives(m, slot, { limit: 5, examples: false, gap: false, spelling: false }).find((a) => a.weight >= ALT_WEIGHT && SENSE_SOURCES.has(a.source) && a.count >= ALT_MIN_COUNT);
    const alternative = alt ? { text: alt.text, count: alt.count, relation: alt.relation } : null;
    const note = alternative
      ? `${cap(short)} never wrote “${w.word}”; ${they} wrote “${alternative.text}” (${alternative.count.toLocaleString()} ${alternative.count === 1 ? 'time' : 'times'}).`
      : `${cap(short)} never wrote “${w.word}”.`;
    return { ...w, alternative, note };
  });
}

const MARKS: { mark: string; name: string; plural: string }[] = [
  { mark: ';', name: 'semicolon', plural: 'Semicolons' },
  { mark: '—', name: 'dash', plural: 'Dashes' },
  { mark: ':', name: 'colon', plural: 'Colons' },
];

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h]! : Math.round((s[h - 1]! + s[h]!) / 2);
};
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Words a sentence and one joining mark, the student's against the voice's. */
function styleOf(short: string, sents: Sent[], lengths: { narration: Dist; dialogue: Dist }, punct: Record<string, number>): StyleLine {
  const counts = sents.map((s) => s.toks.slice(s.from, s.to).filter((t) => t.kind === 'word').length);
  // The voice's narration, as Try it uses: a novelist's dialogue runs far shorter. Dialogue only for a voice with none.
  const dist = lengths.narration.n ? lengths.narration : lengths.dialogue;
  const n = sents.length;
  const marks = MARKS.map((x) => {
    const used = sents.reduce((a, s) => a + s.toks.slice(s.from, s.to).filter((t) => t.kind === 'punct' && (t.norm === x.mark || (x.mark === '—' && /^(—|–|-{2,})$/.test(t.text)))).length, 0);
    return { ...x, yours: n ? round1((used / n) * 10) : 0, voice: round1((punct[x.mark] ?? 0) * 10) };
  });
  const mark = marks.sort((a, b) => Math.abs(b.voice - b.yours) - Math.abs(a.voice - a.yours))[0] ?? null;
  const yours = median(counts);
  const voice = Math.round(dist.p50);
  let line = `Words a sentence: yours ${yours}, ${short} ${voice}.`;
  if (mark && (mark.yours || mark.voice)) line += ` ${mark.plural} in ten sentences: yours ${fmt(mark.yours)}, ${short} ${fmt(mark.voice)}.`;
  return {
    sentences: n,
    lengths: counts,
    yours,
    voice,
    voiceBand: [Math.round(dist.p25), Math.round(dist.p75)],
    mark: mark ? { mark: mark.mark, name: mark.name, yours: mark.yours, voice: mark.voice } : null,
    line,
  };
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

const goodFor = new Map<string, Kind[]>();
/** Each built voice and the kinds it suits, read once a voice. */
function voiceInfos(): VoiceInfo[] {
  return authors()
    .filter((a) => a.built)
    .map((a) => {
      if (!goodFor.has(a.id)) {
        try {
          goodFor.set(a.id, goodForOf(readAuthor(ROOT, a.id)));
        } catch {
          goodFor.set(a.id, []);
        }
      }
      return { id: a.id, goodFor: goodFor.get(a.id)! };
    });
}

/** Every built voice's pack that is in memory or on disk. */
export const builtPacks = (): Pack[] => loadPacks(voiceInfos().map((v) => v.id));

/** A form reading as the page is sent it. */
export function formView(r: NonNullable<ReturnType<typeof readForm>>): FormView {
  const { form, auto, alignment: a } = r;
  return {
    id: form.id,
    name: form.name,
    definition: form.definition,
    auto,
    line: formLine(form),
    slots: a.slots.map((s) => ({ ...s, name: ROLES[s.role].name })),
    order: a.order,
    moved: a.moved,
    missing: a.missing,
  };
}

/** The engine's reading of a text against a built voice, fitted to a form: a form id, or 'auto' for the form of
 * the kind the text is. Throws UnknownForm for any other id. */
export function readText(voice: string, text: string, form = 'auto'): Reading {
  const t0 = performance.now();
  const m = model(voice);
  const p = pack(voice);
  const short = m.author.short;
  const { paragraphs, sentences } = sentencesOfText(text);
  const structure = readForm(text, form);
  if (!structure) throw new UnknownForm(`No form “${form}” is known here.`);
  const roles = structure.roles.map((r) => ({ ...r, name: ROLES[r.role as Role].name }));
  const sketch: SketchRow[] = sentences.map((s) => {
    const hit = p ? nearest(s.text, p) : null;
    return {
      paragraph: s.paragraph,
      sentence: s.index,
      start: s.start,
      end: s.end,
      text: s.text,
      match: hit ? { id: hit.entry.id, text: hit.entry.text, cite: hit.entry.cite, score: Math.round(hit.score * 100) / 100 } : null,
    };
  });
  const profile = p?.profile ?? { sentenceLength: m.profile.sentenceLength, punctuationPerSentence: m.profile.punctuationPerSentence };
  return {
    voice,
    kind: structure.kind,
    paragraphs,
    roles,
    form: formView(structure),
    shape: { yours: shapeLine(structure.sequence), form: formLine(structure.form), voice: p ? shapeLine(p.structure.order) : null, signature: p?.structure.signature ? cap(p.structure.signature) : null },
    never: m.author.style ? needless(m, paragraphs) : neverWords(m, sentences),
    marks: m.author.style ? 'needless' : 'never',
    style: styleOf(short, sentences, profile.sentenceLength, profile.punctuationPerSentence),
    suggest: suggest(builtPacks(), voiceInfos(), structure.kind, text),
    sketch,
    ms: Math.round(performance.now() - t0),
  };
}
