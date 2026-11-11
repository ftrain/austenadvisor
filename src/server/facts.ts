// Facts for a student's text, gathered from Wikipedia through wikiproxy. No model is called.
//
// 1. Topics. The names in the text (capitalised phrases where no sentence begins) and its strongest noun phrases
//    (the heading's nouns that the text returns to, and noun pairs it repeats). At most eight.
// 2. Articles. Each topic is searched for, and the article is kept only if its title is the topic and its opening
//    shares words with the text. A name that belongs to someone else's article is dropped here.
// 3. Sentences. Each article is split into sentences, and each sentence is scored against the paragraphs that name
//    its topic: shared words, weighted by how rare the word is among the sentences gathered, with shared numbers
//    and dates counted double.
// 4. The best three a paragraph and twelve a text are kept. Each is a whole sentence, quoted exactly.
//
// The whole takes six seconds at most. When time runs out, or Wikipedia fails, what was found is returned. Every
// answer from Wikipedia is cached by wikiproxy in data/cache/wiki.sqlite, and a text's facts are kept by its hash.
//
// Wikipedia allows a client few requests. A text costs at most a search and a summary for each topic and three whole
// articles, and when Wikipedia answers 429 nothing more is asked for a minute.

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { DATA, englishDbPath, getMeta, open } from '../db.ts';
import { blocksOfText } from '../engine/doc.ts';
import { readKind } from '../engine/structure.ts';
import { Tagger, type TaggerModel } from '../nlp/tagger.ts';
import { sentences, tokenize, type Token } from '../nlp/tokenize.ts';
import { textHash } from './cache.ts';

/** One sentence from a Wikipedia article that supports a paragraph of the student's text. */
export interface Fact {
  /** Stable for the same sentence of the same article: "w" and eight hex digits. */
  id: string;
  /** A whole sentence, exactly as the article has it. */
  text: string;
  /** The article's title. */
  title: string;
  /** The article's address on Wikipedia. */
  url: string;
  /** The paragraph it supports: the block's index in blocksOfText(text), headings counted, from 0. */
  paragraph: number;
  /** The words of the student's text that led to the article. */
  topic: string;
  /** Higher is nearer the paragraph. Compare scores within one text only. */
  score: number;
}

/** The part of wikiproxy's WikiClient that gatherFacts uses. A test passes a fake. */
export interface WikiLike {
  search(query: string, opts?: { limit?: number }): Promise<{ hits: { title: string }[] }>;
  summary(title: string): Promise<{ title: string; extract: string; type?: string; content_urls?: { desktop?: { page?: string } } }>;
  sections(title: string): Promise<{ title: string; text: string }[]>;
}

export interface FactOptions {
  /** The client to ask. Default: the server's own (wikiClient()). */
  wiki?: WikiLike | null;
  /** Milliseconds for the whole. Default 6,000. */
  budgetMs?: number;
  /** Where gathered facts are kept by text hash. Default: the server's store when the server's client is used, else none. */
  store?: FactStore | null;
}

export const MAX_TOPICS = 8;
export const MAX_PER_PARAGRAPH = 3;
export const MAX_FACTS = 12;
/** Noun phrases looked up in a text with no names. Each name of two words or more leaves room for one fewer. */
const MAX_NOUNS = 3;
/**
 * A text is personal (a diary, an anecdote, a letter) when it is a letter, when I, me and my are this share of its
 * words, or when it is a story and I, we and the like are the second share. A lab report says "we" and is not.
 */
const PERSONAL = 0.025;
const PERSONAL_STORY = 0.04;
export const BUDGET_MS = 6000;
/** Whole articles read for one text. The other topics give their opening paragraphs only. */
export const MAX_BODIES = 3;
/** The least score at which a sentence is kept for a noun phrase or a single name. */
const LOOSE_FLOOR = 1;
/** Nothing is asked of Wikipedia before this time. Set a minute ahead when it answers 429, too many requests. */
let restUntil = 0;
const REST_MS = 60_000;
/** Raise this when the way facts are chosen changes, so kept facts are gathered again. */
export const FACTS_VERSION = '1';

// ---------------------------------------------------------------------------------------------------------------
// Words.

const STOP = new Set(
  `a about above after again against all also although always am an and any are aren't as at be because been before being below
between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each either else even ever
every few first for from further get gets got had hadn't has hasn't have haven't having he her here hers herself him himself his
how however i if in into is isn't it its itself just know known last later least less like made make makes many may me might more
most much must my myself near never new no nor not now of off often on once one only or other others our ours ourselves out over
own per rather really said same say says second see several she should shouldn't since so some something still such than that the
their theirs them themselves then there these they thing things this those though three through thus to too two under until up
upon us use used using very was wasn't we well were weren't what when where whether which while who whom whose why will with
within without won't would wouldn't yet you your yours yourself`.split(/\s+/),
);
/** Words too common to show that a sentence bears on a paragraph. */
const GENERIC = new Set(
  `called became become becomes began include includes including included part parts time times year years day days people person
lot kind sort way ways thing things really basically another around away back came come comes went goes going put take took taken
give gave given want wanted think thought good bad big small great long high`.split(/\s+/),
);

/** A word's stem, roughly: lower case, the possessive and the commonest endings removed. */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[’']s?$/, '');
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /(?:sses|shes|ches|xes)$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  // A long word is known by its first eight letters: "photosynthesis" and "photosynthetic" are one.
  return w.length > 8 ? w.slice(0, 8) : w;
}

const isNumber = (s: string) => /^\d/.test(s);

/** The stems of a passage's content words, and its numbers as written. */
function contentOf(tokens: Token[]): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    if (t.kind === 'num') out.add(t.norm.replace(/(?:st|nd|rd|th|s)$/, ''));
    else if (t.kind === 'word' && t.norm.length > 2 && !STOP.has(t.norm) && !GENERIC.has(t.norm)) out.add(stem(t.norm));
  }
  return out;
}

const stemsOfPhrase = (s: string) => new Set(tokenize(s).filter((t) => t.kind !== 'punct' && !STOP.has(t.norm)).map((t) => stem(t.norm)));
const subset = (a: Set<string>, b: Set<string>) => a.size > 0 && [...a].every((x) => b.has(x));

// ---------------------------------------------------------------------------------------------------------------
// Topics.

export interface Topic {
  /** As the text has it: "Boston Tea Party", "screen time". */
  phrase: string;
  /** A name, or a noun phrase. */
  kind: 'name' | 'noun';
  /** Block indexes of the paragraphs that mention it. */
  paragraphs: number[];
  /** Whether the heading has it, and how often the body says it. */
  heading: boolean;
  count: number;
  /** Tried if the phrase finds no article: the halves of "Lexington and Concord". */
  parts?: string[];
}

const CALENDAR = new Set('monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december christmas easter thanksgiving halloween'.split(' '));
/** A title before a name marks a private person, whom no article describes. */
const HONORIFIC = new Set('mr mrs ms miss mx dr prof professor coach sir madam aunt auntie uncle grandma grandpa granny principal officer nurse pastor father sister brother captain'.split(' '));
const KIN = new Set('mom mum mommy dad daddy mama papa grandma grandpa nana gran god ok okay tv pe'.split(' '));
/** Capitalised only because a sentence begins. */
const OPENERS = new Set(
  `the a an then but and so when after before in on at it this that these those there some many most also overall first second third
finally however dear my our we he she they if as because people now anyway well maybe sometimes one once another every each all
both since while although though yet or for with by to from what why how who where his her their its your you not no yes still
next later today yesterday tomorrow honestly basically actually instead thanks thank please sincerely love yours best hi hello
hey let even just only here during until without half nobody everyone someone something nothing everything again`.split(/\s+/),
);
const JOINERS = new Set(['of', 'the', 'de', 'for']);
const FIRST_SINGULAR = new Set(['i', "i'm", "i've", "i'd", "i'll", 'me', 'my', 'mine', 'myself']);
const FIRST_PLURAL = new Set(['we', "we're", "we've", "we'd", "we'll", 'us', 'our', 'ours', 'ourselves']);

const capWord = (t: Token) => t.kind === 'word' && /^\p{Lu}/u.test(t.text) && t.text !== 'I' && !/^I['’]/.test(t.text);
const isCap = (t: Token | undefined): t is Token => !!t && capWord(t);
/** Two tokens with nothing but a space between them. */
const adjacent = (text: string, a: Token, b: Token) => /^\s+$/.test(text.slice(a.end, b.start));
const cleanName = (t: Token) => t.text.replace(/['’]s$/, '');
const bare = (t: Token) => t.norm.replace(/\.$/, '');

let tagger: Tagger | null | undefined;
/** The engine's tagger, or null where the English resources are not built. */
function theTagger(): Tagger | null {
  if (tagger !== undefined) return tagger;
  try {
    const eng = open(englishDbPath(), { readOnly: true });
    try {
      const m = getMeta<TaggerModel>(eng, 'tagger');
      tagger = m ? Tagger.from(m) : null;
    } finally {
      eng.close();
    }
  } catch {
    tagger = null;
  }
  return tagger;
}

interface Found {
  phrase: string;
  kind: 'name' | 'noun';
  stems: Set<string>;
  paragraphs: Set<number>;
  count: number;
  words: number;
  heading: boolean;
  first: number;
  parts?: string[];
}

/** The capitalised runs of one paragraph that are names: runs of capitals where no sentence begins. */
function namesIn(text: string): { phrase: string; parts?: string[] }[] {
  const tokens = tokenize(text);
  const out: { phrase: string; parts?: string[] }[] = [];
  for (const s of sentences(text, tokens)) {
    let k = s.from;
    // The words that open a sentence, or follow an opening quotation mark, are capitalised whatever they are.
    while (k < s.to && tokens[k]!.kind === 'punct') k++;
    let atStart = true;
    while (k < s.to) {
      const t = tokens[k]!;
      if (!capWord(t)) {
        if (t.kind !== 'punct' || /^[“"‘:—]$/.test(t.norm)) atStart = t.kind === 'punct';
        k++;
        continue;
      }
      // Gather the run: capitals, joined by "of", "the", "for", and at most one "and".
      const run: Token[] = [t];
      const groups: Token[][] = [[t]];
      let j = k + 1;
      for (;;) {
        const n = tokens[j];
        const last = run[run.length - 1]!;
        if (isCap(n) && adjacent(text, last, n)) {
          run.push(n);
          groups[groups.length - 1]!.push(n);
          j++;
        } else if (n && n.kind === 'word' && JOINERS.has(n.norm) && adjacent(text, last, n)) {
          // "of the": up to two joiners, then a capital.
          let m = j + 1;
          if (tokens[m] && JOINERS.has(tokens[m]!.norm)) m++;
          if (!isCap(tokens[m]) || !adjacent(text, tokens[m - 1]!, tokens[m]!)) break;
          for (let q = j; q <= m; q++) {
            run.push(tokens[q]!);
            groups[groups.length - 1]!.push(tokens[q]!);
          }
          j = m + 1;
        } else if (n && n.norm === 'and' && groups.length === 1 && isCap(tokens[j + 1]) && adjacent(text, last, n) && adjacent(text, n, tokens[j + 1]!)) {
          run.push(n, tokens[j + 1]!);
          groups.push([tokens[j + 1]!]);
          j += 2;
        } else break;
      }
      const startsSentence = atStart;
      atStart = false;
      k = j;
      let from = 0;
      if (startsSentence) {
        // An opening word before a name is dropped ("Then Maya", "The Lighthouse Year"). A lone capital proves nothing.
        if (OPENERS.has(run[0]!.norm)) from = 1;
        else if (run.length < 2) continue;
      }
      const kept = run.slice(from);
      if (!kept.length) continue;
      // "Mr. Kowalski", "Coach": a private person, whom no article describes.
      if (HONORIFIC.has(bare(kept[0]!))) continue;
      const at = tokens.indexOf(kept[0]!);
      const before = tokens[at - 1]?.text === '.' ? tokens[at - 2] : tokens[at - 1];
      if (isCap(before) && HONORIFIC.has(bare(before))) continue;
      const phraseOf = (g: Token[]) => {
        const w = g.filter((x) => kept.includes(x));
        while (w.length && !isCap(w[w.length - 1])) w.pop();
        while (w.length && !isCap(w[0])) w.shift();
        // "Plant B" is "Plant".
        return w.filter((x) => x.text.length > 1).map((x, i, a) => (i === a.length - 1 ? cleanName(x) : x.text)).join(' ');
      };
      const usable = (p: string) => {
        const ws = p.split(' ').map((w) => w.toLowerCase());
        if (ws.length > 1) return ws.some((w) => w.length > 1 && !CALENDAR.has(w) && !JOINERS.has(w));
        const w = ws[0]!;
        return w.length > 2 && !CALENDAR.has(w) && !KIN.has(w) && !OPENERS.has(w) && !HONORIFIC.has(w);
      };
      if (groups.length === 2) {
        const halves = groups.map(phraseOf).filter((p) => p && usable(p));
        if (halves.length === 2) out.push({ phrase: halves.join(' and '), parts: halves });
        else for (const h of halves) out.push({ phrase: h });
      } else {
        const p = phraseOf(groups[0]!);
        if (p && usable(p)) out.push({ phrase: p });
      }
    }
  }
  return out;
}

/** Noun phrases of a passage, lower case: runs of adjectives and nouns that end in a noun. */
function nounPhrases(text: string, tg: Tagger): string[][] {
  const tokens = tokenize(text);
  const out: string[][] = [];
  for (const s of sentences(text, tokens)) {
    const tags = tg.tagTokens(tokens, s.from, s.to);
    let run: { w: string; noun: boolean }[] = [];
    const flush = () => {
      while (run.length && !run[run.length - 1]!.noun) run.pop();
      if (run.length) out.push(run.map((r) => r.w));
      run = [];
    };
    for (let k = s.from; k < s.to; k++) {
      const t = tokens[k]!;
      const tag = (tags[k - s.from] ?? '').split('+')[0]!;
      const noun = /^NNS?$/.test(tag);
      if (t.kind === 'word' && (noun || tag === 'JJ') && !STOP.has(t.norm) && t.norm.length > 2) run.push({ w: t.norm, noun });
      else flush();
    }
    flush();
  }
  return out;
}

/** The heading's words between its small words and its punctuation: "Causes of the American Revolution" gives "causes" and "american revolution". */
function headingPhrases(heading: string): string[][] {
  const out: string[][] = [];
  let run: string[] = [];
  for (const t of tokenize(heading)) {
    const w = t.norm.replace(/'s$/, '');
    if (t.kind === 'word' && w.length > 2 && !STOP.has(w) && !HONORIFIC.has(w) && !KIN.has(w) && !CALENDAR.has(w)) run.push(w);
    else {
      if (run.length) out.push(run);
      run = [];
    }
  }
  if (run.length) out.push(run);
  return out;
}

/**
 * The topics of a text worth looking up, strongest first, at most eight: its names, then up to three noun phrases
 * where the names are few. A text told in the first person (a diary, an anecdote) keeps only names of two words or
 * more and a heading's phrase of two words or more that the text repeats.
 */
export function findTopics(text: string): Topic[] {
  const blocks = blocksOfText(text);
  const paras = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.kind !== 'title' && x.b.kind !== 'heading');
  const headings = blocks.filter((b) => b.kind === 'title' || b.kind === 'heading').map((b) => b.text);
  if (!paras.length) return [];

  let words = 0;
  let mine = 0;
  let ours = 0;
  const paraStems = new Map<number, string[]>();
  for (const { b, i } of paras) {
    const ts = tokenize(b.text).filter((t) => t.kind === 'word');
    words += ts.length;
    mine += ts.filter((t) => FIRST_SINGULAR.has(t.norm)).length;
    ours += ts.filter((t) => FIRST_PLURAL.has(t.norm)).length;
    paraStems.set(i, ts.map((t) => stem(t.norm)));
  }
  const share = (n: number) => (words ? n / words : 0);
  const kind = readKind(blocks).kind;
  const personal = kind === 'letter' || share(mine) >= PERSONAL || (kind === 'story' && share(mine + ours) >= PERSONAL_STORY);
  const headingStems = new Set(headings.flatMap((h) => [...stemsOfPhrase(h)]));

  const found = new Map<string, Found>();
  let order = 0;
  for (const { b, i } of paras) {
    // A line of a few words is a greeting or a signature: "Dear Hiring Manager,", "Olivia Chen".
    if (paraStems.get(i)!.length < 5) continue;
    for (const n of namesIn(b.text)) {
      const stems = stemsOfPhrase(n.phrase);
      if (!stems.size) continue;
      const key = [...stems].sort().join(' ');
      let f = found.get(key);
      if (!f) found.set(key, (f = { phrase: n.phrase, kind: 'name', stems, paragraphs: new Set(), count: 0, words: n.phrase.split(' ').length, heading: subset(stems, headingStems), first: order++, parts: n.parts }));
      f.paragraphs.add(i);
      f.count++;
    }
  }
  let names = [...found.values()];
  // A text in the first person names friends and teachers. A single name there is a person no article describes.
  if (personal) names = names.filter((f) => f.words >= 2 && !(f.parts && f.parts.every((p) => !p.includes(' '))));

  // Where a sequence of stems stands in the body.
  const occurrences = (seq: string[]): { count: number; paragraphs: number[] } => {
    let count = 0;
    const ps: number[] = [];
    for (const [i, st] of paraStems) {
      let here = 0;
      for (let k = 0; k + seq.length <= st.length; k++) if (seq.every((s, d) => st[k + d] === s)) here++;
      if (here) ps.push(i);
      count += here;
    }
    return { count, paragraphs: ps };
  };

  // Noun phrases fill in where the names are few.
  const room = Math.max(0, MAX_NOUNS - names.filter((f) => f.words >= 2).length);
  const nouns: Found[] = [];
  if (room) {
    const seen = new Set(names.map((f) => [...f.stems].sort().join(' ')));
    // `need` is how often the body must hold the phrase.
    const consider = (ws: string[], heading: boolean, need: number) => {
      if (ws.length === 1 && (GENERIC.has(ws[0]!) || personal)) return;
      const seq = ws.map(stem);
      const key = [...new Set(seq)].sort().join(' ');
      if (seen.has(key)) return;
      const occ = occurrences(seq);
      if (occ.count < need) return;
      seen.add(key);
      // The heading's subject is every paragraph's subject.
      nouns.push({ phrase: ws.join(' '), kind: 'noun', stems: new Set(seq), paragraphs: new Set(heading ? paras.map((x) => x.i) : occ.paragraphs), count: occ.count, words: ws.length, heading, first: order++ });
    };
    // The heading says what the text is about, where the text returns to it.
    for (const h of headings)
      for (const ws of headingPhrases(h)) {
        if (ws.length > 1) consider(ws, true, 1);
        if (ws.length > 2) consider(ws.slice(-2), true, 1);
        if (ws.length === 1) consider(ws, true, 2);
      }
    // In the body: a pair of words said twice, or one noun said four times.
    const tg = personal ? null : theTagger();
    if (tg) {
      for (const { b } of paras)
        for (const np of nounPhrases(b.text, tg)) {
          if (np.length >= 2) consider(np.slice(-2), false, 2);
          else if (words >= 60) consider(np, false, 4);
        }
    }
    nouns.sort((a, b) => Number(b.heading) - Number(a.heading) || b.words - a.words || b.count - a.count || a.first - b.first);
    nouns.length = Math.min(nouns.length, room);
  }

  let all = [...names, ...nouns];
  // "Boston" beside "Boston Tea Party", "Revolution" beside "American Revolution": the longer one says more.
  // A name is kept over a heading's phrase that holds it: "Frankenstein" over "read frankenstein".
  all = all.filter((f) => !all.some((g) => g !== f && (g.kind === 'name' || f.kind === 'noun') && g.stems.size > f.stems.size && subset(f.stems, g.stems)));
  all = all.filter((f) => f.kind === 'name' || !all.some((g) => g.kind === 'name' && subset(g.stems, f.stems)));
  const strength = (f: Found) => (f.kind === 'name' ? (f.words >= 2 ? 4 : 1) : 2) + (f.heading ? 2 : 0) + Math.min(2, (f.count - 1) * 0.5);
  all.sort((a, b) => strength(b) - strength(a) || a.first - b.first);

  return all.slice(0, MAX_TOPICS).map((f) => {
    const t: Topic = { phrase: f.phrase, kind: f.kind, paragraphs: [...f.paragraphs].sort((a, b) => a - b), heading: f.heading, count: f.count };
    if (f.parts) t.parts = f.parts;
    return t;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Articles and their sentences.

/** Sections that hold lists and sources, not prose about the subject. */
const SKIP_SECTION = /^(references?|notes?|footnotes?|citations?|sources?|see also|external links?|further reading|bibliography|works cited|gallery|in popular culture|popular culture|discography|filmography|selected works|publications|awards)\b/i;
/** A sentence that opens like this leans on the one before it. */
const LEANS = /^(?:he|she|it|they|this|these|those|his|her|their|its|such|both|however|but|and|also|instead|thus|therefore|moreover|furthermore|nevertheless|meanwhile|afterwards?|later|then|there|here|in addition|as a result|for example|for instance|according|others?|another|some|many|most|several|each|the (?:latter|former|same|first|second|third|fourth|fifth|last|next|following|result|other|others))\b/i;

/** So does one that points back from inside: "in this way", "two years later,". */
const LEANS_WITHIN = /\b(?:in this way|for this reason|in this case|as such|the latter|the former|mentioned above|see below)\b|^[^,]{0,40}\b(?:later|earlier|afterwards?),/i;

/** The whole sentences of an article's prose that can stand alone as a note, each exactly as written. */
export function factSentences(prose: string): string[] {
  const out: string[] = [];
  for (const para of prose.split(/\n+/)) {
    const p = para.trim();
    if (p.length < 40) continue;
    for (const s of sentences(p)) {
      const t = p.slice(s.start, s.end).trim();
      if (t.length < 40 || t.length > 320) continue;
      if (!/^["“]?[\p{Lu}\d]/u.test(t) || !/[.!?]["”’)]*$/.test(t)) continue;
      if (/[[\]{}|^=<>\t]|\.\.\.|…|: *$/.test(t)) continue;
      if (LEANS.test(t) || LEANS_WITHIN.test(t)) continue;
      const count = (re: RegExp) => (t.match(re) ?? []).length;
      if (count(/\(/g) !== count(/\)/g) || count(/“/g) !== count(/”/g) || count(/"/g) % 2) continue;
      if (t.split(/\s+/).length < 7) continue;
      out.push(t);
    }
  }
  return out;
}

interface Candidate {
  text: string;
  title: string;
  url: string;
  topic: Topic;
  /** Stems of the topic and of the article's title: shared with any paragraph that names the topic, so they prove little. */
  own: Set<string>;
  stems: Set<string>;
  /** The article's first sentence, which says what the subject is. */
  first: boolean;
  lead: boolean;
}

/**
 * Whether a search hit's title is the topic: the topic's words all stand in it, with few besides ("Lexington and
 * Concord" fits "Battles of Lexington and Concord"; "Boston Massacre" does not fit "Massacre"). A title with a qualifier,
 * "Lincoln High School (Portland, Oregon)" or "Lexington, Kentucky", is one of several things of that name, and fits
 * only if the text has the qualifier's words.
 */
export function titleFits(title: string, phrase: string, textStems: Set<string> = new Set()): boolean {
  const q = /^(.*?)(?:\s*\(([^)]*)\)|,\s+(.+))$/.exec(title);
  const base = q ? q[1]! : title;
  const p = stemsOfPhrase(phrase);
  if (q && !subset(stemsOfPhrase(q[2] ?? q[3] ?? ''), new Set([...textStems, ...p]))) return false;
  const t = stemsOfPhrase(base);
  if (!t.size || !p.size) return false;
  return subset(p, t) && t.size <= p.size + 3;
}

const urlOf = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const idOf = (title: string, text: string) => `w${createHash('sha256').update(title).update('\u0000').update(text).digest('hex').slice(0, 8)}`;

/**
 * Facts for a text: at most three a paragraph and twelve in all, each a whole sentence quoted exactly from a
 * Wikipedia article, in the order of the paragraphs they support. It returns none for a text with nothing to look
 * up, and whatever it has when the time is spent or a request fails. When Wikipedia answers 429 (too many requests)
 * nothing more is asked for a minute, and texts in that minute get none. It does not throw.
 */
export async function gatherFacts(text: string, opts: FactOptions = {}): Promise<Fact[]> {
  const started = Date.now();
  const budget = Math.max(0, opts.budgetMs ?? BUDGET_MS);
  const own = opts.wiki === undefined || opts.wiki === null;
  const store = opts.store === undefined ? (own ? factStore() : null) : opts.store;
  const hash = textHash(text);
  try {
    const kept = store?.get(hash);
    if (kept) return kept;
  } catch {
    /* gather again */
  }

  let topics: Topic[];
  try {
    topics = findTopics(text);
  } catch {
    return [];
  }
  if (!topics.length) return [];
  const wiki = opts.wiki ?? (await wikiClient());
  if (!wiki || Date.now() < restUntil) return [];

  const blocks = blocksOfText(text);
  const paraStems = new Map<number, Set<string>>();
  for (const [i, b] of blocks.entries()) if (b.kind !== 'title' && b.kind !== 'heading') paraStems.set(i, contentOf(tokenize(b.text)));
  const textStems = new Set([...paraStems.values()].flatMap((s) => [...s]));

  // Leave time to score what was gathered.
  const deadline = started + budget - Math.min(250, budget / 10);
  const inTime = () => Date.now() < deadline;
  const pool: Candidate[] = [];
  const seenText = new Set<string>();
  const articles = new Map<string, { topic: Topic; title: string; url: string; own: Set<string> }>();

  const addProse = (a: { topic: Topic; title: string; url: string; own: Set<string> }, prose: string, lead: boolean) => {
    let first = lead;
    for (const s of factSentences(prose)) {
      const isFirst = first;
      first = false;
      if (seenText.has(s)) continue;
      seenText.add(s);
      pool.push({ text: s, title: a.title, url: a.url, topic: a.topic, own: a.own, stems: contentOf(tokenize(s)), first: isFirst, lead });
    }
  };

  // A request that fails leaves the facts incomplete, so they are returned and not kept.
  let failures = 0;
  const failed = (e: unknown) => {
    failures++;
    if ((e as { status?: number } | null)?.status === 429) restUntil = Date.now() + REST_MS;
  };
  const resting = () => Date.now() < restUntil;

  const findArticle = async (topic: Topic): Promise<void> => {
    const queries = [topic.phrase, ...(topic.parts ?? [])];
    for (const [n, phrase] of queries.entries()) {
      if (!inTime() || resting()) return;
      const res = await wiki.search(phrase, { limit: 3 });
      const hit = res.hits.find((h) => titleFits(h.title, phrase, textStems));
      if (!hit) continue;
      if (!inTime() || resting() || articles.has(hit.title)) return;
      const sum = await wiki.summary(hit.title);
      if (!sum.extract || (sum.type && sum.type !== 'standard')) return;
      const title = sum.title || hit.title;
      const mine = new Set([...stemsOfPhrase(topic.phrase), ...stemsOfPhrase(title)]);
      // The article's opening must share words with the text beyond the topic's own, or it is another subject of the
      // same name: two words, or one where the topic is surely the text's own (a name of two words or more, or the
      // heading's phrase said three times).
      const shared = [...contentOf(tokenize(sum.extract))].filter((s) => !mine.has(s) && s.length > 3 && textStems.has(s));
      const sure = topic.kind === 'name' ? phrase.includes(' ') : topic.heading && topic.count >= 3;
      if (shared.length < (sure ? 1 : 2)) return;
      if (articles.has(title)) return;
      const a = { topic, title, url: sum.content_urls?.desktop?.page ?? urlOf(title), own: mine };
      articles.set(title, a);
      addProse(a, sum.extract, true);
      // The whole phrase found its article, so its halves are not tried.
      if (n === 0) return;
    }
  };

  const gather = async () => {
    await Promise.allSettled(topics.map((t) => findArticle(t).catch(failed)));
    // The bodies of the strongest topics' articles, while there is time. A body is a large request, and Wikipedia
    // allows few of them.
    const ordered = [...articles.values()].sort((a, b) => topics.indexOf(a.topic) - topics.indexOf(b.topic)).slice(0, MAX_BODIES);
    await Promise.allSettled(
      ordered.map(async (a) => {
        if (!inTime() || resting()) return;
        try {
          const secs = await wiki.sections(a.title);
          for (const s of secs) if (!SKIP_SECTION.test(s.title.trim())) addProse(a, s.text, false);
        } catch (e) {
          failed(e);
        }
      }),
    );
  };

  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    gather().then(
      () => (complete = failures === 0 && !resting()),
      () => undefined,
    ),
    new Promise<void>((done) => (timer = setTimeout(done, Math.max(0, deadline - Date.now())))),
  ]);
  clearTimeout(timer);

  const facts = choose([...pool], paraStems);
  if (complete) {
    try {
      store?.set(hash, facts);
    } catch {
      /* not kept */
    }
  }
  return facts;
}

/** Scores every gathered sentence against the paragraphs that name its topic, and keeps the best. */
function choose(pool: Candidate[], paraStems: Map<number, Set<string>>): Fact[] {
  if (!pool.length) return [];
  // A word in few of the gathered sentences is rare, and tells more.
  const df = new Map<string, number>();
  for (const c of pool) for (const s of c.stems) df.set(s, (df.get(s) ?? 0) + 1);
  const top = Math.log(1 + pool.length);
  const weight = (s: string) => Math.log(1 + pool.length / (df.get(s) ?? 1)) / top;

  const scored: (Fact & { key: string })[] = [];
  for (const c of pool) {
    let best: { paragraph: number; score: number } | null = null;
    const loose = c.topic.kind === 'noun' || !c.topic.phrase.includes(' ');
    for (const p of c.topic.paragraphs) {
      const ps = paraStems.get(p);
      if (!ps) continue;
      let sum = 0;
      let proof = 0;
      for (const s of c.stems) {
        if (!ps.has(s)) continue;
        if (c.own.has(s)) sum += 0.2 * weight(s);
        else if (isNumber(s)) {
          sum += 2 * Math.max(0.5, weight(s));
          proof += 2;
        } else if (s.length > 3) {
          sum += weight(s);
          proof++;
        }
      }
      // A noun phrase or a single name is a loose topic, so its sentence must share two words with the paragraph.
      // An article found by a name of two words or more is about that name: one shared word is enough, and its
      // first sentence, which says what the name is, needs none.
      const need = loose ? 2 : c.first ? 0 : 1;
      if (proof < need) continue;
      if (c.first) sum += loose ? 0.4 : 0.9;
      else if (c.lead) sum += 0.15;
      // A sentence that gives a date or a figure is a fact a reader can check.
      if ([...c.stems].some(isNumber)) sum *= 1.15;
      // A long sentence shares words by its length alone.
      sum /= Math.sqrt(Math.max(14, c.stems.size) / 14);
      if (loose && sum < LOOSE_FLOOR) continue;
      if (sum > 0 && (!best || sum > best.score)) best = { paragraph: p, score: sum };
    }
    if (best) scored.push({ id: idOf(c.title, c.text), text: c.text, title: c.title, url: c.url, paragraph: best.paragraph, topic: c.topic.phrase, score: Math.round(best.score * 1000) / 1000, key: c.title });
  }

  // For each paragraph: the best sentence of each article first, then the next best, to three.
  const byPara = new Map<number, typeof scored>();
  for (const f of scored) byPara.set(f.paragraph, [...(byPara.get(f.paragraph) ?? []), f]);
  let kept: typeof scored = [];
  for (const list of byPara.values()) {
    list.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const firsts: typeof scored = [];
    const rest: typeof scored = [];
    const titles = new Set<string>();
    for (const f of list) (titles.has(f.key) ? rest : (titles.add(f.key), firsts)).push(f);
    kept.push(...[...firsts, ...rest].slice(0, MAX_PER_PARAGRAPH));
  }
  if (kept.length > MAX_FACTS) kept = kept.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, MAX_FACTS);
  kept.sort((a, b) => a.paragraph - b.paragraph || b.score - a.score || a.id.localeCompare(b.id));
  return kept.map(({ key: _key, ...f }) => f);
}

// ---------------------------------------------------------------------------------------------------------------
// The facts kept for each text.

/** Days a text's facts are kept before they are gathered again. */
const KEEP_DAYS = 30;

/** Gathered facts by text hash, in a table of their own. The table holds hashes, never a student's text. */
export class FactStore {
  readonly db: DatabaseSync;

  /** `file` may be ':memory:'. */
  constructor(file: string) {
    this.db = open(file);
    this.db.exec('CREATE TABLE IF NOT EXISTS facts (hash TEXT PRIMARY KEY, version TEXT NOT NULL, facts TEXT NOT NULL, at INTEGER NOT NULL)');
  }

  get(hash: string, now = Date.now()): Fact[] | null {
    const row = this.db.prepare('SELECT version, facts, at FROM facts WHERE hash = ?').get(hash) as { version: string; facts: string; at: number } | undefined;
    if (!row || row.version !== FACTS_VERSION || now - row.at > KEEP_DAYS * 86_400_000) return null;
    try {
      return JSON.parse(row.facts) as Fact[];
    } catch {
      return null;
    }
  }

  set(hash: string, facts: Fact[], now = Date.now()): void {
    this.db.prepare('INSERT OR REPLACE INTO facts (hash, version, facts, at) VALUES (?, ?, ?, ?)').run(hash, FACTS_VERSION, JSON.stringify(facts), now);
  }

  close(): void {
    this.db.close();
  }
}

let sharedStore: FactStore | null | undefined;
/** The server's store: the `facts` table in ADVISOR_CACHE_DB, else data/cache.sqlite. In memory under the test runner. */
export function factStore(): FactStore | null {
  if (sharedStore !== undefined) return sharedStore;
  try {
    sharedStore = new FactStore(process.env.ADVISOR_CACHE_DB ?? (process.env.VITEST ? ':memory:' : join(DATA, 'cache.sqlite')));
  } catch {
    sharedStore = null;
  }
  return sharedStore;
}

// ---------------------------------------------------------------------------------------------------------------
// The server's client.

/** The User-Agent sent to Wikipedia: ADVISOR_WIKI_UA, else the program's name, which names no person and no address. */
export const wikiUserAgent = () => process.env.ADVISOR_WIKI_UA?.trim() || 'austenadvisor/1.0 (writing tutor)';

let injected: WikiLike | null | undefined;
let shared: Promise<WikiLike | null> | null = null;

/** Puts a client in place of the server's own, for a test, and ends any rest. `undefined` restores the server's own. */
export function useWiki(wiki: WikiLike | null | undefined): void {
  injected = wiki;
  restUntil = 0;
}

/**
 * The client gatherFacts asks when none is passed: the injected one, else wikiproxy's WikiClient, cached in
 * data/cache/wiki.sqlite and built on first use. Under the test runner nothing is built, so no test reaches
 * Wikipedia. Null when there is no client: wikiproxy refuses a User-Agent with no contact address in it (an email
 * or a URL, which Wikimedia asks of every client), so facts are off until ADVISOR_WIKI_UA holds one.
 */
export function wikiClient(): Promise<WikiLike | null> {
  if (injected !== undefined) return Promise.resolve(injected);
  if (shared) return shared;
  shared = (async () => {
    if (process.env.VITEST) return null;
    try {
      const { WikiClient, SqliteStore } = await import('@pef/wikiproxy');
      const dir = join(DATA, 'cache');
      mkdirSync(dir, { recursive: true });
      const cache = new SqliteStore(join(dir, 'wiki.sqlite'));
      try {
        // One try a request and no waiting: a refusal comes back at once, and gatherFacts returns what it has.
        return new WikiClient({ userAgent: wikiUserAgent(), cache, timeoutMs: 4000, maxRetries: 0 });
      } catch (e) {
        await cache.close();
        throw e;
      }
    } catch (e) {
      console.error(`facts: off, no Wikipedia client: ${(e as Error).message}`);
      return null;
    }
  })();
  return shared;
}
