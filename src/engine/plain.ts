// Plain style: the rules a style's moves are made of, each one a detector the engine can check with no model.
//
// A writer's voice is read from what the writer wrote. A style is read from rules: Strunk's (omit needless words,
// use the active voice, put statements in positive form, prefer the concrete word) and two that follow from them
// (no hedges or intensifiers, one idea a sentence). `plainFaults` finds where a sentence breaks a rule, and says
// why in one line a student can act on. A sentence shows a rule's move when it breaks the rule nowhere, so a
// rewrite makes the move where the student's sentence had the fault and the new one has not.
//
// The page marks the word-level faults (stock phrases, hedges, intensifiers, a negative where one word would do,
// an abstract word) in the YOURS column, where it marks the words a writer's voice never wrote.

import type { Tagger } from '../nlp/tagger.ts';
import { tokenize, type Token } from '../nlp/tokenize.ts';

export type PlainRule = 'needless' | 'active' | 'positive' | 'hedge' | 'oneidea' | 'concrete';
export const PLAIN_RULES: PlainRule[] = ['needless', 'active', 'positive', 'hedge', 'oneidea', 'concrete'];
export const isPlainRule = (x: string | undefined): x is PlainRule => !!x && (PLAIN_RULES as string[]).includes(x);

/** What a fault is: the word a note calls it by. Each is a glossary term (KIND_TERM). */
export type FaultKind = 'stock' | 'hedge' | 'intensifier' | 'negative' | 'abstract' | 'passive' | 'loaded';

export interface Fault {
  /** The rule it breaks, which is the id of the move that mends it. */
  rule: PlainRule;
  kind: FaultKind;
  /** Offsets in the text given. */
  start: number;
  end: number;
  /** The words as written. */
  text: string;
  /** The word to write in their place; null where the words are cut or the sentence is recast. */
  instead: string | null;
  /** One line to the student: what the words are, and what to do. */
  reason: string;
}

/** What the detectors need of a model: the tagger, and (for “not kind” → “unkind”) whether a word is English. */
export interface PlainContext {
  tagger: Tagger;
  known?: (word: string) => boolean;
}

/** The glossary term that defines each kind of fault. */
export const KIND_TERM: Record<FaultKind, string> = {
  stock: 'stockphrase',
  hedge: 'hedge',
  intensifier: 'intensifier',
  negative: 'positiveform',
  abstract: 'abstractword',
  passive: 'passivevoice',
  loaded: 'oneidea',
};

/** The kinds the page marks in the writer's own text: words to cut or trade, not a sentence to recast. */
export const WORD_KINDS: FaultKind[] = ['stock', 'hedge', 'intensifier', 'negative', 'abstract'];

// ---------------------------------------------------------------------------------------------------------------
// Needless words: stock phrases, each with the word that does its work. Null: cut it.

const STOCK: [string, string | null][] = [
  ['due to the fact that', 'because'],
  ['owing to the fact that', 'because'],
  ['on account of the fact that', 'because'],
  ['in light of the fact that', 'because'],
  ['in view of the fact that', 'because'],
  ['in spite of the fact that', 'though'],
  ['despite the fact that', 'though'],
  ['regardless of the fact that', 'though'],
  ['the reason why is that', 'because'],
  ['the reason is because', 'because'],
  ['the reason why is because', 'because'],
  ['for the reason that', 'because'],
  ['the fact that', null],
  ['in order to', 'to'],
  ['in order that', 'so that'],
  ['so as to', 'to'],
  ['for the purpose of', 'to'],
  ['with the intention of', 'to'],
  ['at this point in time', 'now'],
  ['at the present time', 'now'],
  ['at this moment in time', 'now'],
  ['at the present moment', 'now'],
  ['in this day and age', 'now'],
  ['at that point in time', 'then'],
  ['in the near future', 'soon'],
  ['in the not too distant future', 'soon'],
  ['in the event that', 'if'],
  ['in the event of', 'if'],
  ['on the condition that', 'if'],
  ['until such time as', 'until'],
  ['during the course of', 'during'],
  ['in the course of', 'during'],
  ['prior to', 'before'],
  ['subsequent to', 'after'],
  ['in close proximity to', 'near'],
  ['in the vicinity of', 'near'],
  ['with regard to', 'about'],
  ['with regards to', 'about'],
  ['in regard to', 'about'],
  ['in regards to', 'about'],
  ['with respect to', 'about'],
  ['with reference to', 'about'],
  ['in relation to', 'about'],
  ['when it comes to', 'in'],
  ['as to whether', 'whether'],
  ['the question as to whether', 'whether'],
  ['whether or not', 'whether'],
  ['a large number of', 'many'],
  ['a great number of', 'many'],
  ['a number of', 'several'],
  ['a great deal of', 'much'],
  ['a large amount of', 'much'],
  ['the vast majority of', 'most'],
  ['the majority of', 'most'],
  ['a majority of', 'most'],
  ['on a daily basis', 'daily'],
  ['on a weekly basis', 'weekly'],
  ['on a regular basis', 'regularly'],
  ['each and every', 'every'],
  ['first and foremost', 'first'],
  ['one and only', 'only'],
  ['any and all', 'all'],
  ['all of the', 'all the'],
  ['has the ability to', 'can'],
  ['have the ability to', 'can'],
  ['had the ability to', 'could'],
  ['has the capacity to', 'can'],
  ['is able to', 'can'],
  ['are able to', 'can'],
  ['was able to', 'could'],
  ['were able to', 'could'],
  ['is in a position to', 'can'],
  ['make a decision', 'decide'],
  ['made a decision', 'decided'],
  ['makes a decision', 'decides'],
  ['come to a conclusion', 'conclude'],
  ['came to the conclusion', 'concluded'],
  ['take into consideration', 'consider'],
  ['took into consideration', 'considered'],
  ['give consideration to', 'consider'],
  ['is of the opinion that', 'thinks'],
  ['am of the opinion that', 'think'],
  ['along the lines of', 'like'],
  ['in the process of', null],
  ['it is important to note that', null],
  ['it should be noted that', null],
  ['it is worth noting that', null],
  ['it goes without saying that', null],
  ['it goes without saying', null],
  ['needless to say', null],
  ['as a matter of fact', null],
  ['at the end of the day', null],
  ['when all is said and done', null],
  ['for all intents and purposes', null],
  ['there is no doubt but that', 'no doubt'],
  ['there is no doubt that', 'no doubt'],
  ['in today’s society', 'today'],
  ['in today’s world', 'today'],
  ['in our society today', 'today'],
  ['since the dawn of time', null],
  ['throughout history', null],
  ['utilize', 'use'],
  ['utilizes', 'uses'],
  ['utilized', 'used'],
  ['utilizing', 'using'],
];

// Hedges: words that soften a statement. Each is a pattern, since “kind of” hedges only where it names no kind.
const DET = '(?:a|an|the|what|which|this|that|these|those|any|some|every|each|one|no|same|other|another|new|different|right|wrong|best|worst|only|[\\p{L}]+[’\']s|my|your|his|her|its|our|their|all|many|several|two|three)';
const CLAUSE = '(?:the|a|an|it|he|she|they|we|you|this|that|these|those|there|my|our|his|her|their|its|i|most|many|some|all|no|every|people|students|school)';
const HEDGES: RegExp[] = [
  new RegExp(`(?<!\\b${DET}\\s)\\b(?:kind|sort) of\\b(?!\\s+(?:a|an|the)\\b)`, 'giu'),
  new RegExp(`\\bI (?:think|believe|guess|suppose|would say|[’']d say)(?:,|\\s+that\\b|(?=\\s+${CLAUSE}\\b))`, 'giu'),
  /\bI (?:feel|felt) (?:like|that)(?=\s+\p{L})/giu,
  /\bin my (?:own |humble |honest |personal )?opinion\b,?/giu,
  /\b(?:it seems|it seemed|it appears|it would seem)(?: to me)?(?: that| like| as if| as though)\b/giu,
  /\b(?:seems|seemed|seem|appears|appeared|appear) to\b/giu,
  /\bto be honest\b,?/giu,
  /\bif you ask me\b,?/giu,
  /\bas far as I (?:know|can tell|am concerned)\b,?/giu,
  /\b(?:more or less|pretty much|to some extent|to a certain extent|in a way|in some ways|in a sense)\b/giu,
  /\b(?:somewhat|basically|essentially|arguably|fairly|relatively|virtually|practically)\b/giu,
  /\b(?:a little bit|a bit|a tad|a little)(?=\s+(?:too|more|less|\p{L}+(?:ed|ous|ful|ish|ing|y)\b))/giu,
  /\bI mean\b,?/giu,
  /,\s*you know,/giu,
];

// Intensifiers: words that strengthen the word after them. “Pretty” and “rather” only before a describing word.
const INTENSIFIERS = new Set([
  'very', 'really', 'extremely', 'incredibly', 'totally', 'absolutely', 'utterly', 'truly', 'literally', 'actually', 'honestly', 'definitely',
  'quite', 'super', 'obviously', 'clearly', 'certainly', 'undoubtedly',
]);
const BEFORE_DESCRIBING = new Set(['pretty', 'rather', 'so', 'real']);

// Abstract words that stand where a thing could be named.
const ABSTRACT = new Set([
  'situation', 'situations', 'aspect', 'aspects', 'factor', 'factors', 'issue', 'issues', 'thing', 'things', 'stuff', 'area', 'areas', 'nature', 'manner',
  'element', 'elements', 'concept', 'concepts', 'circumstance', 'circumstances', 'phenomenon', 'phenomena', 'utilization', 'implementation', 'functionality',
]);
/** “Nature” and “area” are things in most sentences: abstract only in these frames. */
const ABSTRACT_FRAMES: Record<string, RegExp> = {
  nature: /\b(?:of|in) an? [\p{L}-]+ nature\b/iu,
  area: /\bin (?:the|this|that) area of\b/iu,
  areas: /\bareas? of (?:concern|improvement|interest|focus)\b/iu,
  manner: /\bin an? [\p{L}-]+ manner\b/iu,
  element: /\ban? (?:key |important |major )?element (?:of|in)\b/iu,
  elements: /\belements (?:of|in)\b/iu,
};

// Positive form: a negative and its word, where one word says it.
const NOT = "(?:not|n[’']t)";
const NEGATIVE_PHRASES: [string, string][] = [
  ['not honest', 'dishonest'],
  ['not important', 'unimportant'],
  ['not often', 'seldom'],
  ['not many', 'few'],
  ['not much', 'little'],
  ['not the same', 'different'],
  ['not present', 'absent'],
  ['not possible', 'impossible'],
  ['not able', 'unable'],
  ['not on time', 'late'],
  ['not far from', 'near'],
  ['not old enough', 'too young'],
  ['not strong enough', 'too weak'],
  ['not big enough', 'too small'],
  ['not long enough', 'too short'],
  ['not allowed', 'forbidden'],
  ['not true', 'false'],
  ['not right', 'wrong'],
  ['not easy', 'hard'],
  ['not difficult', 'easy'],
  ['not hard', 'easy'],
  ['not clear', 'unclear'],
  ['not sure', 'unsure'],
  ['not certain', 'uncertain'],
  ['not legal', 'illegal'],
  ['not fair', 'unfair'],
  ['not enough', 'too little'],
  ['not ever', 'never'],
  ['not any', 'no'],
];
/** A verb after “did not”, with the verb that says it: base, he/she form, past. */
const NEGATIVE_VERBS: Record<string, [string, string, string]> = {
  remember: ['forget', 'forgets', 'forgot'],
  succeed: ['fail', 'fails', 'failed'],
  pass: ['fail', 'fails', 'failed'],
  accept: ['reject', 'rejects', 'rejected'],
  like: ['dislike', 'dislikes', 'disliked'],
  trust: ['distrust', 'distrusts', 'distrusted'],
  agree: ['disagree', 'disagrees', 'disagreed'],
  approve: ['disapprove', 'disapproves', 'disapproved'],
  obey: ['disobey', 'disobeys', 'disobeyed'],
  believe: ['doubt', 'doubts', 'doubted'],
  allow: ['forbid', 'forbids', 'forbade'],
  permit: ['forbid', 'forbids', 'forbade'],
  include: ['omit', 'omits', 'omitted'],
  stay: ['leave', 'leaves', 'left'],
  have: ['lack', 'lacks', 'lacked'],
  'pay attention to': ['ignore', 'ignores', 'ignored'],
  'pay any attention to': ['ignore', 'ignores', 'ignored'],
  notice: ['miss', 'misses', 'missed'],
  win: ['lose', 'loses', 'lost'],
  continue: ['stop', 'stops', 'stopped'],
  attend: ['miss', 'misses', 'missed'],
};
const NEGATIVE_PREFIXES = ['un', 'in', 'im', 'dis', 'ir', 'il'];

// Passive voice: a form of “be”, then a past participle. These participles after “be” describe a state.
const BE = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', '’s', "'s", '’re', "'re"]);
const STATES = new Set([
  'born', 'tired', 'interested', 'excited', 'surprised', 'pleased', 'worried', 'scared', 'bored', 'married', 'gone', 'concerned', 'located', 'based', 'related',
  'supposed', 'used', 'finished', 'prepared', 'determined', 'convinced', 'annoyed', 'confused', 'embarrassed', 'amazed', 'shocked', 'disappointed', 'frightened',
  'exhausted', 'satisfied', 'dressed', 'lost', 'done', 'known', 'called', 'named', 'able', 'afraid', 'ashamed', 'crowded', 'closed', 'broken', 'dead', 'stuck',
  'involved', 'devoted', 'inclined', 'obliged', 'accustomed', 'acquainted', 'engaged', 'mistaken', 'delighted', 'relieved', 'thrilled', 'upset', 'depressed',
]);

/** A sentence is loaded when it joins three clauses or more, or joins two and runs past this many words. */
export const ONE_IDEA_WORDS = 28;
const COORD = new Set(['and', 'but', 'or', 'so', 'yet', 'nor', 'for']);
const SUBORD = new Set(['because', 'although', 'though', 'while', 'whereas', 'since', 'unless', 'which', 'who', 'when', 'if', 'that']);

// ---------------------------------------------------------------------------------------------------------------

const curly = (t: string) => t.replace(/'/g, '’');
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']/g, "[’']").replace(/ /g, '\\s+');
const STOCK_RE = new RegExp(`(?<![\\p{L}’'-])(${[...STOCK].sort((a, b) => b[0].length - a[0].length).map(([p]) => esc(p)).join('|')})(?![\\p{L}’'-])`, 'giu');
const STOCK_BY = new Map(STOCK.map(([p, w]) => [p.replace(/’/g, "'"), w]));
const MANNER_RE = /\bin an? ([\p{L}-]+) (?:manner|fashion|way)\b/giu;
const quote = (s: string) => `“${curly(s)}”`;
const key = (s: string) => s.toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ');

const REASON = {
  stock: (text: string, instead: string | null) =>
    instead
      ? `${quote(text)} is a stock phrase: several words where one will do. Write ${quote(instead)}.`
      : `${quote(text)} is a stock phrase: words that add nothing to the sentence. Cut it.`,
  manner: (text: string) => `${quote(text)} is a stock phrase: several words where one will do. Use the one word, such as “hastily” for “in a hasty manner”.`,
  hedge: (text: string) => `${quote(text)} is a hedge: words that soften a statement. Cut it and state the thing.`,
  intensifier: (text: string) => `${quote(text)} is an intensifier: a word that strengthens the word after it. Cut it, or choose a stronger word.`,
  negative: (text: string, instead: string | null) =>
    instead ? `${quote(text)} says what is not so. Positive form says what is: write ${quote(instead)}.` : `${quote(text)} says what is not so. Positive form says what is: state it directly.`,
  abstract: (text: string) => `${quote(text)} is an abstract word: it names no particular thing. Name the thing itself.`,
  passive: (text: string, agent: string | null) =>
    agent
      ? `${quote(text)} is in the passive voice: the subject receives the action. Make ${quote(agent)} the subject.`
      : `${quote(text)} is in the passive voice: the subject receives the action. Say who did it, and make that the subject.`,
  loaded: (words: number, joins: number) => `This sentence has ${words} words and joins ${joins} clauses. Give each idea a sentence of its own.`,
};

function tagged(ctx: PlainContext, text: string): { toks: Token[]; tags: string[] } {
  const toks = tokenize(text);
  return { toks, tags: ctx.tagger.tagTokens(toks) };
}

const isDescribing = (tag: string | undefined) => !!tag && /^(JJ|RB|QL|VBN|VBG)/.test(tag);

function stockFaults(text: string): Fault[] {
  const out: Fault[] = [];
  for (const m of text.matchAll(STOCK_RE)) {
    const instead = STOCK_BY.get(key(m[0])) ?? null;
    out.push({ rule: 'needless', kind: 'stock', start: m.index!, end: m.index! + m[0].length, text: m[0], instead, reason: REASON.stock(m[0], instead) });
  }
  for (const m of text.matchAll(MANNER_RE)) {
    if (/^(?:such|this|that|same|similar|different|certain|good|bad|big|small|new|way)$/i.test(m[1]!)) continue;
    out.push({ rule: 'needless', kind: 'stock', start: m.index!, end: m.index! + m[0].length, text: m[0], instead: null, reason: REASON.manner(m[0]) });
  }
  return out;
}

function hedgeFaults(ctx: PlainContext, text: string): Fault[] {
  const out: Fault[] = [];
  for (const re of HEDGES) {
    for (const m of text.matchAll(re)) {
      const words = m[0].replace(/^[,\s]+|[,\s]+$/g, '');
      const start = m.index! + m[0].indexOf(words);
      out.push({ rule: 'hedge', kind: 'hedge', start, end: start + words.length, text: words, instead: null, reason: REASON.hedge(words) });
    }
  }
  const { toks, tags } = tagged(ctx, text);
  toks.forEach((t, i) => {
    if (t.kind !== 'word') return;
    const next = toks[i + 1];
    const nextIsWord = next?.kind === 'word';
    const prev = toks[i - 1];
    // “The very end” names the end; “very late” only strengthens.
    const sure = INTENSIFIERS.has(t.norm) && nextIsWord && !(t.norm === 'very' && prev?.norm === 'the');
    // “Pretty good”, “rather late”, “so tired.”: only before a describing word, and “so … that” is a real measure.
    const before =
      BEFORE_DESCRIBING.has(t.norm) &&
      nextIsWord &&
      isDescribing(tags[i + 1]) &&
      !(t.norm === 'rather' && next!.norm === 'than') &&
      // “So” after a comma or at the head joins clauses.
      !(t.norm === 'so' && (!prev || prev.kind !== 'word' || /^(that|much|many|far|long)$/.test(next!.norm) || toks.slice(i + 2, i + 8).some((x) => x.norm === 'that')));
    if (!sure && !before) return;
    out.push({ rule: 'hedge', kind: 'intensifier', start: t.start, end: t.end, text: t.text, instead: null, reason: REASON.intensifier(t.text) });
  });
  return out;
}

function negativeFaults(ctx: PlainContext, text: string): Fault[] {
  const out: Fault[] = [];
  const push = (start: number, end: number, instead: string | null) => {
    // “Not honest, but kind” is an antithesis, and “not only” opens a pair: both are forms, not faults.
    if (/^\s*,?\s+but\b/i.test(text.slice(end, end + 8)) || /^\s+only\b/i.test(text.slice(end))) return;
    if (out.some((f) => start < f.end && end > f.start)) return;
    const words = text.slice(start, end);
    out.push({ rule: 'positive', kind: 'negative', start, end, text: words, instead, reason: REASON.negative(words, instead) });
  };
  // “did not remember” → “forgot”
  const verbs = Object.keys(NEGATIVE_VERBS).sort((a, b) => b.length - a.length).map(esc).join('|');
  for (const m of text.matchAll(new RegExp(`\\b(do|does|did)(?:\\s+not|n[’']t)\\s+(?:really\\s+|ever\\s+|even\\s+)?(${verbs})\\b`, 'giu'))) {
    const forms = NEGATIVE_VERBS[key(m[2]!)]!;
    const aux = m[1]!.toLowerCase();
    push(m.index!, m.index! + m[0].length, aux === 'did' ? forms[2] : aux === 'does' ? forms[1] : forms[0]);
  }
  // “not honest” → “dishonest”, from the list
  for (const [phrase, instead] of NEGATIVE_PHRASES) {
    const re = new RegExp(`(?:\\bnot|n[’']t)\\s+${esc(phrase.replace(/^not /, ''))}(?![\\p{L}’'-])`, 'giu');
    for (const m of text.matchAll(re)) {
      const start = /^n[’']t/i.test(m[0]) ? startOfWord(text, m.index!) : m.index!;
      push(start, m.index! + m[0].length, /^n[’']t/i.test(m[0]) ? null : (instead ?? null));
    }
  }
  // “not kind” → “unkind”, where the prefixed word is English
  if (ctx.known) {
    for (const m of text.matchAll(new RegExp(`\\b(not)\\s+(?:very\\s+|really\\s+|so\\s+)?(\\p{L}{4,})\\b`, 'giu'))) {
      const w = m[2]!.toLowerCase();
      if (NEGATIVE_PREFIXES.some((p) => w.startsWith(p)) || /(?:ing|ly)$/.test(w)) continue;
      const tags = ctx.tagger.tag(['it', 'is', 'not', w]);
      if (!/^JJ/.test(tags[3] ?? '')) continue;
      const neg = NEGATIVE_PREFIXES.map((p) => p + w).find((x) => ctx.known!(x));
      if (neg) push(m.index!, m.index! + m[0].length, neg);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Where the word that ends in “n't” begins: “didn't” for the “n't” found inside it. */
function startOfWord(text: string, at: number): number {
  let i = at;
  while (i > 0 && /\p{L}/u.test(text[i - 1]!)) i--;
  return i;
}

function abstractFaults(text: string): Fault[] {
  const out: Fault[] = [];
  for (const t of tokenize(text)) {
    if (t.kind !== 'word' || !ABSTRACT.has(t.norm)) continue;
    const frame = ABSTRACT_FRAMES[t.norm];
    if (frame && !frame.test(text)) continue;
    out.push({ rule: 'concrete', kind: 'abstract', start: t.start, end: t.end, text: t.text, instead: null, reason: REASON.abstract(t.text) });
  }
  return out;
}

function passiveFaults(ctx: PlainContext, text: string): Fault[] {
  const out: Fault[] = [];
  const { toks, tags } = tagged(ctx, text);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.kind !== 'word' || !BE.has(t.norm)) continue;
    // Up to two adverbs between: “was rapidly effected”, “has not yet been told”.
    let j = i + 1;
    while (j < toks.length && j <= i + 2 && toks[j]!.kind === 'word' && (/^(RB|QL|\*)/.test(tags[j] ?? '') || toks[j]!.norm === 'not') && !/^VBN/.test(tags[j] ?? '')) j++;
    const p = toks[j];
    if (!p || p.kind !== 'word' || STATES.has(p.norm) || BE.has(p.norm)) continue;
    const tag = tags[j] ?? '';
    const next = toks[j + 1];
    const byAgent = next?.norm === 'by';
    // The tagger's participle; or, before “by”, a participle it took for a past tense.
    if (!/^VBN/.test(tag) && !(byAgent && /^VBD/.test(tag))) continue;
    // “Is made of”: a state, not an action done to the subject.
    if (next?.norm === 'of') continue;
    let agent: string | null = null;
    let end = p.end;
    if (byAgent) {
      const rest = toks.slice(j + 2, j + 6);
      const stop = rest.findIndex((x) => x.kind !== 'word' || /^(and|who|which|that|in|on|at|when|because|to|for|with)$/.test(x.norm));
      const taken = stop < 0 ? rest : rest.slice(0, stop);
      if (taken.length) {
        agent = text.slice(taken[0]!.start, taken.at(-1)!.end);
        end = taken.at(-1)!.end;
      }
    }
    const words = text.slice(t.start, p.end);
    out.push({ rule: 'active', kind: 'passive', start: t.start, end, text: words, instead: null, reason: REASON.passive(words, agent) });
    i = j;
  }
  return out;
}

/** The clauses a sentence joins: “, and”, “; ”, “because”, “which”, counted once each. */
function joinsOf(toks: Token[]): number {
  let n = 0;
  toks.forEach((t, i) => {
    if (t.kind === 'punct') {
      if (t.norm === ';' || t.norm === ':' || /^(—|–|-{2,})$/.test(t.text)) n++;
      return;
    }
    if (t.kind !== 'word' || i === 0) return;
    const prev = toks[i - 1]!;
    if (COORD.has(t.norm) && prev.kind === 'punct' && prev.norm === ',') n++;
    else if (SUBORD.has(t.norm) && t.norm !== 'that' && t.norm !== 'if' && t.norm !== 'when') n++;
    else if ((t.norm === 'if' || t.norm === 'when') && prev.kind === 'punct') n++;
  });
  return n;
}

function loadedFaults(text: string): Fault[] {
  const toks = tokenize(text);
  const words = toks.filter((t) => t.kind === 'word').length;
  const joins = joinsOf(toks);
  if (joins < 2 || (joins === 2 && words <= ONE_IDEA_WORDS)) return [];
  return [{ rule: 'oneidea', kind: 'loaded', start: 0, end: text.length, text, instead: null, reason: REASON.loaded(words, joins) }];
}

const FINDERS: Record<PlainRule, (ctx: PlainContext, text: string) => Fault[]> = {
  needless: (_c, t) => stockFaults(t),
  hedge: hedgeFaults,
  positive: negativeFaults,
  concrete: (_c, t) => abstractFaults(t),
  active: passiveFaults,
  oneidea: (_c, t) => loadedFaults(t),
};

/**
 * Where a text breaks the rules of plain style, in the order the faults stand. Give one sentence for `oneidea` to
 * mean anything; the other rules read a text of any length. Quoted speech is read like the rest: the page gives the
 * writer's own sentences.
 */
export function plainFaults(ctx: PlainContext, text: string, rules: PlainRule[] = PLAIN_RULES): Fault[] {
  const all = rules.flatMap((r) => FINDERS[r](ctx, text)).sort((a, b) => b.end - b.start - (a.end - a.start));
  // The longest first, and nothing inside it: “due to the fact that” holds “the fact that”. A loaded sentence and
  // a passive are constructions, and hold other faults without hiding them.
  const whole = (f: Fault) => f.kind === 'loaded' || f.kind === 'passive';
  const kept: Fault[] = [];
  for (const f of all) if (whole(f) || !kept.some((g) => !whole(g) && g.start <= f.start && g.end >= f.end)) kept.push(f);
  return kept.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Whether a sentence shows a rule's move: it has words, and it breaks the rule nowhere. A rewrite makes the move
 * where this is true of the new sentence and false of the student's.
 */
export function keepsRule(ctx: PlainContext, rule: PlainRule, text: string): boolean {
  if (!/\p{L}/u.test(text)) return false;
  return FINDERS[rule](ctx, text).length === 0;
}

/** Words that say in one what a negative says in two: the sign of positive form in a model sentence. */
const POSITIVE_WORDS = new Set([
  'dishonest', 'unimportant', 'seldom', 'absent', 'impossible', 'unable', 'forbidden', 'unclear', 'uncertain', 'unfair', 'forgot', 'forgotten', 'failed', 'rejected',
  'disliked', 'distrusted', 'disagreed', 'disapproved', 'disobeyed', 'doubted', 'forbade', 'omitted', 'lacked', 'ignored', 'refused', 'declined', 'neglected',
  'unnecessary', 'useless', 'unknown', 'unfit', 'unwilling', 'insufficient', 'impracticable', 'incomplete', 'unprepared', 'unprotected', 'never', 'none', 'nothing',
]);

/**
 * Whether a sentence of the corpus is a model of a rule's move, to quote beside a note. Breaking the rule nowhere
 * is true of most sentences, and such a sentence teaches nothing. A model breaks no rule at all and shows the move
 * at work: for the active voice, a subject, a verb and its object with no form of “be”; for positive form, a word
 * that says in one what “not” says in two; for one idea, a short sentence with no joining.
 */
export function modelsRule(ctx: PlainContext, rule: PlainRule, text: string): boolean {
  const { toks, tags } = tagged(ctx, text);
  const words = toks.filter((t) => t.kind === 'word');
  const n = words.length;
  // A whole statement: no quotation, no question, no aside in brackets, no fragment of a manual's entry.
  if (n < 5 || n > 22 || /[“”"?!()]/.test(text) || /^(?:not|see|cf)\b/i.test(text) || plainFaults(ctx, text).length) return false;
  const has = (re: RegExp) => tags.some((t, i) => toks[i]!.kind === 'word' && re.test(t));
  const negated = words.some((t) => t.norm === 'not' || /n't$/.test(t.norm));
  switch (rule) {
    case 'needless':
      return n <= 14;
    case 'active': {
      if (words.some((t) => BE.has(t.norm)) || !/^(PPSS?|NP|AT|PP\$)/.test(tags[toks.indexOf(words[0]!)] ?? '')) return false;
      return toks.some((t, i) => t.kind === 'word' && /^VBD/.test(tags[i] ?? '') && /^(AT|PP\$|DT|NP|NNS?|CD|PPO)/.test(tags[i + 1] ?? ''));
    }
    case 'positive':
      return !negated && words.some((t) => POSITIVE_WORDS.has(t.norm));
    case 'hedge':
      return n <= 16 && !negated && !has(/^MD/) && has(/^(BEDZ?|BEZ|BER|VBD)/);
    case 'oneidea':
      return n <= 14 && joinsOf(toks) === 0 && !/[,;:—]/.test(text);
    case 'concrete':
      return has(/^CD/) || tags.filter((t, i) => toks[i]!.kind === 'word' && /^NP/.test(t)).length >= 2;
  }
}

/** A needless word for the page: one entry for each distinct word or phrase, where it first stands. */
export interface NeedlessWord {
  /** The words as the writer wrote them: “very”, “due to the fact that”. */
  word: string;
  /** The paragraph's index, and the words' offsets in that paragraph. */
  paragraph: number;
  start: number;
  end: number;
  /** Times the words appear in the text. */
  times: number;
  /** What the words are: a stock phrase, a hedge, an intensifier, a negative, an abstract word. */
  kind: FaultKind;
  /** The plain move that cuts them: its id in the voice's moves. */
  rule: PlainRule;
  /** The glossary term that defines the kind. */
  term: string;
  /** The word to write in their place; null where they are cut. */
  instead: string | null;
  /** The reason, in one line: what the words are, the term defined, and what to do. */
  note: string;
}

/** The needless words of a text's paragraphs, in the order they stand, each distinct word once. */
export function needlessWords(ctx: PlainContext, paragraphs: string[], limit = Infinity): NeedlessWord[] {
  const found = new Map<string, NeedlessWord>();
  paragraphs.forEach((p, pi) => {
    for (const f of plainFaults(ctx, p, ['needless', 'hedge', 'positive', 'concrete'])) {
      if (!WORD_KINDS.includes(f.kind)) continue;
      const k = key(f.text);
      const had = found.get(k);
      if (had) {
        had.times++;
        continue;
      }
      found.set(k, { word: f.text, paragraph: pi, start: f.start, end: f.end, times: 1, kind: f.kind, rule: f.rule, term: KIND_TERM[f.kind], instead: f.instead, note: f.reason });
    }
  });
  return [...found.values()].slice(0, limit).map((w) => (w.times > 1 ? { ...w, note: `${w.note} It is in your text ${w.times} times.` } : w));
}
