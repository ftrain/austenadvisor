// Figures of speech, recognized: the classical rhetoric's names for constructions a reader can learn to see and a
// writer to make. Each is found by its form (the words, their tags, their order), named with its standard term, and
// glossed in a line. They are any author's; an author's "moves" (authors/<id>.json) are the ones that author favours.
// What is found is what the form shows: irony itself is not a form, and is named only where its usual vehicle is (a
// generalization laid over a particular case), or where the rewriter's note claims it.

import { tokenize, type Token } from '../nlp/tokenize.ts';
import type { AuthorModel } from './model.ts';

export interface Figure {
  /** The standard term: "litotes", "periphrasis"… */
  term: string;
  /** Its name for a reader. */
  name: string;
  /** In a line: what it is. */
  gloss: string;
  start: number;
  end: number;
  text: string;
  /** Found by a form that needs the context to prove it: fit for a try, never for a model sentence. */
  loose?: boolean;
}

export const FIGURES: Record<string, { name: string; gloss: string }> = {
  litotes: { name: 'Litotes', gloss: 'Affirming by denying the contrary: “not unwilling”, “no small consequence”.' },
  periphrasis: { name: 'Periphrasis', gloss: 'A thing named by a description rather than its name: “the instrument in his hand”.' },
  gnomic: { name: 'Generalization (gnomic statement)', gloss: 'A general truth laid over the particular case: the usual vehicle of irony.' },
  irony: { name: 'Ironic verdict', gloss: 'The narrator’s verdict, saying more (or other) than it says.' },
  aside: { name: 'Ironic aside', gloss: 'A dry clause that deflates what came before: “, which was at least consistent with the occasion”.' },
  fid: { name: 'Free indirect discourse', gloss: 'A character’s thought or exclamation given in the narration, without quotation marks or “she thought”.' },
  antithesis: { name: 'Antithesis', gloss: 'Contrary ideas set against each other in balanced form: “not X, but Y”.' },
  tricolon: { name: 'Tricolon', gloss: 'Three parallel terms in a row: “strange, awkward, and distressing”.' },
  polysyndeton: { name: 'Polysyndeton', gloss: 'Clauses strung on repeated “and”s, so each lands with weight.' },
  anaphora: { name: 'Anaphora', gloss: 'Successive clauses opening on the same word.' },
  parenthesis: { name: 'Parenthesis', gloss: 'A remark set into the sentence that interrupts it: “, I believe,”.' },
  inversion: { name: 'Inversion (anastrophe)', gloss: 'The usual order turned about for emphasis: “Small heart had Harriet for visiting.”' },
  hyperbole: { name: 'Hyperbole', gloss: 'Exaggeration not meant literally: “the most awkward ten minutes of my life”.' },
};

const fig = (term: string, start: number, end: number, text: string): Figure => ({ term, ...FIGURES[term]!, start, end, text: text.slice(start, end) });

/** Words that name a made thing so broadly it must be described to be known: the heads of periphrasis. */
const ARTEFACT = 'instrument|device|contrivance|machine|apparatus|implement|engine|vehicle|conveyance|receptacle|appliance|utensil';
/** Heads that name a place by what is done there. */
const PLACE = 'place|house|shop|room|building|establishment';
/** Periphrases so settled that the form alone shows them: “the fair sex”, “the partner of his life”. */
const SETTLED = [
  'the\\s+(?:fair|fairer|weaker|softer|gentler|sterner)\\s+sex',
  '(?:the|his|her|my|your)\\s+(?:chosen\\s+)?(?:partner|companion)\\s+of\\s+(?:his|her|my|your|their)\\s+(?:future\\s+|whole\\s+)?(?:life|bosom|joys|cares|fortunes|days|toils|fate|youth|existence|childhood)',
  'the\\s+authors?\\s+of\\s+(?:his|her|my|your|their|our)\\s+(?:being|existence|birth|days)',
  'the\\s+object\\s+of\\s+(?:his|her|my|your|their)\\s+(?:tenderest\\s+|warmest\\s+|first\\s+|early\\s+)?(?:affections?|attachment|love|choice|passion|adoration|tenderness|devotion|idolatry|admiration|engagement|addresses|vows)',
  'the\\s+(?:finny|feathered|scaly|fleecy|bleating|plumy)\\s+(?:tribes?|race|creation|people|kind|songsters|choir|flock)',
  '(?:his|her|my|your)\\s+better\\s+half',
  'the\\s+staff\\s+of\\s+life',
  'the\\s+fruit\\s+of\\s+the\\s+vine',
  'the\\s+way\\s+of\\s+all\\s+(?:the\\s+earth|flesh)',
  '(?:his|her|their|man’s)\\s+long\\s+home',
  'the\\s+house\\s+appointed\\s+for\\s+all\\s+living',
  'the\\s+king\\s+of\\s+(?:terrors|beasts|birds|day)',
  'the\\s+father\\s+of\\s+(?:lies|waters|his\\s+country)',
  'the\\s+(?:prince|power)\\s+of\\s+(?:darkness|this\\s+world|the\\s+air)',
  'the\\s+(?:lords?|lord\\s+and\\s+master)\\s+of\\s+(?:the\\s+)?creation',
  'the\\s+(?:great\\s+)?(?:enemy|foe|adversary)\\s+of\\s+(?:mankind|souls|man)',
  'the\\s+(?:devouring|watery|liquid|fiery)\\s+element',
  'the\\s+(?:orb|lamp|eye)\\s+of\\s+(?:day|heaven|night)',
  'the\\s+god\\s+of\\s+day',
  'the\\s+(?:bird|birds)\\s+of\\s+(?:jove|night|dawning|wisdom)',
  'the\\s+(?:briny|vasty|mighty)\\s+deep',
  'the\\s+vale\\s+of\\s+tears',
  'this\\s+mortal\\s+coil',
  'the\\s+undiscovered\\s+country',
  'the\\s+green-eyed\\s+monster',
  'the\\s+peculiar\\s+institution',
  'the\\s+eternal\\s+city',
  'the\\s+mistress\\s+of\\s+the\\s+world',
  'the\\s+(?:successors?\\s+of\\s+st\\.?\\s+peter|vicar\\s+of\\s+christ|commander\\s+of\\s+the\\s+faithful|apostle\\s+of\\s+the\\s+gentiles)',
  'the\\s+disciple\\s+whom\\s+jesus\\s+loved',
  'the\\s+weaker\\s+vessel',
  'the\\s+(?:children|sons)\\s+of\\s+men',
  'the\\s+(?:sons\\s+of\\s+adam|daughters\\s+of\\s+eve)',
  'the\\s+powers\\s+that\\s+be',
  'the\\s+rising\\s+generation',
  'the\\s+fourth\\s+estate',
  'the\\s+great\\s+unwashed',
  'gentlemen\\s+of\\s+the\\s+(?:long\\s+robe|road|press)',
  'the\\s+ship\\s+of\\s+the\\s+desert',
  'the\\s+ancient\\s+of\\s+days',
  // God named by office: “the Author of nature”, “the Giver of all good”, “the Searcher of hearts”.
  'the\\s+(?:[a-z]+\\s+){0,2}(?:author|giver|maker|creator|ruler|governor|disposer|searcher|judge|preserver|architect|arbiter|parent|sovereign)\\s+of\\s+(?:all\\s+things|all\\s+good|all\\s+the\\s+earth|all(?!\\s+[a-z])|nature|the\\s+universe|the\\s+world|events|hearts|mercies|lights?|life|heaven\\s+and\\s+earth|nations|mankind|men|creation|our\\s+being)',
  'the\\s+father\\s+of\\s+(?:mercies|lights|all|spirits)',
]
  .map((x) => `\\b${x}\\b`)
  .join('|');
const DET = 'the|a|an|that|this|his|her|my|their|our|your|some|those|these';
/** What follows the head and says what the thing is for. */
const PURPOSE = '(?:by|with|in|through|on|upon|from|into|at)\\s+which|whereby|wherewith|which|that|for\\s+(?:the\\s+)?[a-z]+ing|of\\s+[a-z]+ing';
/** Describing words before the head: never an article, which would begin another phrase. */
const ADJ = '(?:(?!(?:a|an|the|and|or|of|in|is|was)\\s)[a-z’-]+\\s+){0,2}';
/** A description after “is” or “like” says what a thing is; it does not stand in for its name. */
const PREDICATE = /\b(?:is|was|are|were|be|been|being|am|as|like|called|become|became|becomes|but|than|such|seems?|seemed)\s+(?:not\s+|only\s+|merely\s+|indeed\s+|also\s+)?$/i;

/**
 * Periphrasis the form alone shows: a settled phrase; a place named by what is done there (“a house where coffee is
 * sold”); a made thing named by its use, in the passive (“that instrument by which the voice is carried”); people
 * named by their office (“the persons set over us”).
 */
const SURE_PERIPHRASIS = [
  new RegExp(SETTLED, 'i'),
  new RegExp(
    `\\b(?:${DET}|one\\s+of\\s+those)\\s+${ADJ}(?:${PLACE})s?\\s+(?:where|(?:in|at)\\s+which)\\s+[^,.;:!?—]{2,50}?\\b(?:(?:was|were|is|are|be|been)\\s+(?:served|sold|kept|made|done|given|taught|bought|drunk|eaten|washed|lent)|(?:they|people|men)\\s+(?:sell|sold|serve|served|keep|kept|make|made|wash|washed|drink|drank|eat|ate)\\s+[a-z’-]+)\\b`,
    'i',
  ),
  new RegExp(`\\b(?:${DET})\\s+${ADJ}(?:instrument|vehicle|machine|apparatus|conveyance|receptacle)s?\\s+(?:(?:by|through)\\s+which|whereby)\\s+[^,.;:!?—]{2,50}?\\b(?:is|are|was|were|be|might|may)\\b[^,.;:!?—]{0,40}`, 'i'),
  /\b(?:the|those|some)\s+(?:persons|people|gentlemen|ladies|personages|individuals)\s+(?:set|placed|put|charged|employed|appointed)\s+(?:over|with|to)\b[^,.;:!?—]{1,30}/i,
];

function curly(t: string) {
  return t.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’');
}

/** Spans inside quotation marks (speech), as [start, end) pairs. */
function quotedSpans(t: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /“[^”]*”?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) out.push([m.index, m.index + m[0].length]);
  return out;
}

const BE = new Set(['is', 'was', 'are', 'were', 'be', 'been', 'being', 'am', 'seems', 'seemed', 'seem', 'appeared', 'appears', 'felt', 'looked', 'proved', 'remained', '’s']);
const isNeg = (n: string) => n === 'not' || n === 'no' || n === 'cannot' || /n[’']t$/.test(n);
/** Words that may stand between the negative and the word it denies: “not a little”, “not, I think, an unreasonable”. */
const GAP = new Set('a an so very altogether wholly quite entirely half always be been seem seemed seems appear appeared feel felt look looked exactly particularly absolutely perhaps indeed however therefore i think believe suppose own confess'.split(' '));
/** Phrases that strengthen the negative and pass like one word: “not at all improbable”, “by no means unusual”. */
const GAP_PHRASES = [['at', 'all'], ['in', 'the', 'least'], ['by', 'any', 'means'], ['means']];
/** After “no”, a negative describing word is as often meant literally (“no unclean thing”): these are the ones
 * that understate (“no inconsiderable sum”, “no uncommon sight”). */
const NO_UNDERSTATES = new Set(
  'inconsiderable uncommon unusual unwilling unwelcome unpleasant unpleasing unfrequent infrequent unimportant insignificant unworthy unfavourable unfavorable unhandsome inattentive unapt unskilful unmeaning inelegant unnatural unreasonable uninteresting undistinguished unsuitable unfit unequal dishonest ungrateful ingrateful'.split(' '),
);
/** “No small boy” is a boy; “no small difficulty” is a large one. */
const BODIES = new Set('boy boys girl girls child children man men woman women dog dogs cat house houses room rooms one ones thing things bit town village piece part number'.split(' '));
/** Negatives made with “dis-” whose stem the tagger takes for a verb. */
const DIS = new Set(['displeased', 'dissatisfied', 'disinclined', 'discontented', 'disinterested', 'dishonourable', 'dishonorable', 'disloyal', 'discreditable', 'disagreeable']);

/**
 * Litotes by principle: a negative before a word whose negative prefix, taken off, leaves a quality-word of the
 * author's (“not unwilling”: willing), or before a word of smallness (“no small difficulty”, “not a little”), or
 * one of its set forms (“not without merit”, “no fool”, “not bad”).
 */
function litotes(m: AuthorModel, text: string, toks: Token[], tags: string[]): Figure[] {
  const out: Figure[] = [];
  const at = toks.map((t, k) => (t.kind === 'word' ? k : -1)).filter((k) => k >= 0);
  const ws = at.map((k) => toks[k]!);
  const tagOf = (i: number) => tags[at[i]!] ?? '';
  const quality = (x: string) => /^(JJ|RB|VBN|QL)/.test(m.usualTag(x) ?? '');
  const plainQuality = (x: string) => /^(JJ|RB)/.test(m.usualTag(x) ?? '');
  const antonyms = (w: string, stem: string) =>
    m.wn.senses(w, 'a').some((id) => (m.wn.synset(id)?.rels['!'] ?? []).some((o) => m.wn.synset(o)?.words.some((x) => x.toLowerCase() === stem)));
  for (let i = 0; i < ws.length; i++) {
    const neg = ws[i]!.norm;
    if (!isNeg(neg)) continue;
    const prev = ws[i - 1]?.norm ?? '';
    const prev2 = ws[i - 2]?.norm ?? '';
    if (prev === 'or' || prev === 'whether' || prev === 'why' || prev === 'only') continue;
    // A condition, a command or a question denies in earnest: “if it be not unwise”, “be not impatient”, “do not be
    // uneasy”, “am I not unlucky?”.
    if (ws.slice(Math.max(0, i - 5), i).some((w) => w.norm === 'if' || w.norm === 'unless' || w.norm === 'lest')) continue;
    if (prev === 'be' || (prev === 'ye' && prev2 === 'be') || prev === 'do' || /^don[’']t$/.test(neg)) continue;
    const AUX = /^(?:am|is|are|was|were|will|would|shall|should|can|could|may|might|must|do|does|did|have|has|had)$/;
    if (/^(?:i|he|she|it|we|they|you|ye|thou)$/.test(prev) && AUX.test(prev2)) continue;
    const stop = toks.slice(at[i]!).find((t) => t.kind === 'punct' && /^[.!?]$/.test(t.norm));
    if (stop?.norm === '?') continue;
    // “No, I am not ungrateful”: an answer to a charge, meant as it stands.
    if (/(?:^|[“.!?]\s*)(?:no|nay|oh|indeed),\s+(?:[\p{L}’']+\s+){0,3}$/iu.test(text.slice(0, ws[i]!.start))) continue;
    const next = ws[i + 1];
    if (!next) continue;
    const joined = (a: Token, b: Token) => !/[.;:!?—()“”]/.test(text.slice(a.end, b.start));
    const push = (last: Token) => out.push(fig('litotes', ws[i]!.start, last.end, text));
    // “Was not without merit”: after a verb of being or a pause, never “could not without pain”.
    if (neg === 'not' && next.norm === 'without' && ws[i + 2] && joined(ws[i]!, ws[i + 2]!)) {
      const paused = /[,;—]\s*$/.test(text.slice(0, ws[i]!.start));
      // “Not without its hazard”: to the thing itself.
      const thing = ['a', 'an', 'the', 'some', 'its', 'his', 'her', 'their', 'much', 'great'].includes(ws[i + 2]!.norm) && ws[i + 3] && joined(ws[i + 2]!, ws[i + 3]!) ? ws[i + 3]! : ws[i + 2]!;
      if (BE.has(prev) || paused || ['though', 'but', 'and', 'yet'].includes(prev)) push(thing);
      continue;
    }
    if (neg === 'no' && BE.has(prev) && ['stranger', 'fool', 'novice', 'coward', 'saint'].includes(next.norm)) {
      push(next);
      continue;
    }
    // “Not wanting in humour”: he had some.
    if (neg === 'not' && ['wanting', 'lacking', 'deficient'].includes(next.norm) && ws[i + 2]?.norm === 'in' && ws[i + 3] && joined(ws[i]!, ws[i + 3]!)) {
      push(ws[i + 3]!);
      continue;
    }
    let j0 = i + 1;
    for (const ph of GAP_PHRASES) if ((ph.length > 1 || neg === 'no') && ph.every((w, n) => ws[i + 1 + n]?.norm === w)) j0 = i + 1 + ph.length;
    const phrase = j0 > i + 1;
    let so = false;
    for (let j = j0; j < ws.length && j <= j0 + 4; j++) {
      const w = ws[j]!;
      if (!joined(ws[j - 1]!, w)) break;
      const after = ws[j + 1]?.norm ?? '';
      const before = ws[j - 1]!.norm;
      const abstractNext = /^NN$/.test(tagOf(j + 1)) && !BODIES.has(after);
      // “No” right before the word, or “by no means” before it, which denies like “not”.
      const no = neg === 'no' && !phrase;
      let hit = false;
      if (w.norm === 'bad' || w.norm === 'amiss' || w.norm === 'badly') hit = !no && after !== 'as' && after !== 'than' && after !== 'enough' && before !== 'so' && before !== 'too';
      else if (w.norm === 'little') hit = (!no && (before === 'a' || before === 'so') && !BODIES.has(after)) || (no && j === i + 1 && abstractNext);
      else if (w.norm === 'few') hit = neg === 'not' && before === 'a';
      else if (w.norm === 'mean' || w.norm === 'ordinary' || w.norm === 'common') hit = no && j === i + 1 && abstractNext;
      else if (['small', 'slight', 'trifling'].includes(w.norm)) hit = no && j <= i + 2 && abstractNext;
      else {
        const p = /^(un|in|im|il|ir|dis)(.{3,})$/.exec(w.norm);
        // The word a quality of the author's, or one the author never wrote whose stem is (“unamusing”: amusing).
        if (p && (quality(w.norm) || (p[1] === 'un' && !m.word(w.norm) && /(?:ing|ed|ous|ful|ble|ant|ent|ive|al|ly)$/.test(w.norm))) && (m.word(p[2]!)?.count ?? 0) >= 3) {
          const stem = p[2]!;
          // “Unwilling” and “willing”: both qualities. For “in-” and “dis-” the stem must be a describing word
          // (“insensible”, not “informed”) or the dictionary's own opposite of the word.
          hit = p[1] === 'un' ? (stem.length >= 4 && quality(stem)) || antonyms(w.norm, stem) : (stem.length >= 4 && plainQuality(stem)) || DIS.has(w.norm) || antonyms(w.norm, stem);
          if (hit && no) hit = NO_UNDERSTATES.has(w.norm);
          // “Not so unjust as…” compares; “not uneasy or afraid” lists; “will not be unfairly rewarded” is a
          // manner, not a judgement.
          if (hit && (after === 'or' || after === 'nor' || (so && ws.slice(j + 1).some((x) => x.norm === 'as')))) hit = false;
          if (hit && /ly$/.test(w.norm) && ws.slice(i + 1, j).some((x) => x.norm === 'be' || x.norm === 'been') && /^VB[ND]/.test(tagOf(j + 1))) hit = false;
        }
      }
      if (hit) {
        push(w);
        break;
      }
      if (!GAP.has(w.norm)) break;
      if (w.norm === 'so') so = true;
    }
  }
  return out;
}

type Cls = 'J' | 'N' | 'V' | 'R' | 'P' | 'W' | 'I' | 'D' | '';
/** A word's class, for telling like from unlike: describing word, noun, verb, adverb, pronoun, wh-word, preposition, determiner. */
function cls(tag: string): Cls {
  if (/^(JJ|VBG|VBN)/.test(tag)) return 'J';
  if (/^(NN|NP|NR)/.test(tag)) return 'N';
  if (/^(VB|BE|HV|DO|MD)/.test(tag)) return 'V';
  if (/^RB/.test(tag)) return 'R';
  if (/^(PPS|PPO|PPL|PP\$\$|PN)/.test(tag)) return 'P';
  if (/^W/.test(tag)) return 'W';
  if (/^(IN|TO)/.test(tag)) return 'I';
  if (/^(AT|DT|PP\$|CD|AP|ABN)/.test(tag)) return 'D';
  return '';
}

/** Every figure in a passage, in order, as found by form. */
export function findFigures(m: AuthorModel, raw: string, opts: { letter?: boolean; spoken?: boolean } = {}): Figure[] {
  const text = curly(raw);
  const toks = tokenize(text);
  const tags = m.tagger.tagTokens(toks);
  const out: Figure[] = [...litotes(m, text, toks, tags)];
  const speech = quotedSpans(text);
  const inSpeech = (i: number) => speech.some(([a, b]) => i >= a && i < b);
  const re = (r: RegExp, term: string, o: { narrationOnly?: boolean; ok?: (x: RegExpExecArray) => boolean; loose?: boolean } = {}) => {
    let x: RegExpExecArray | null;
    const g = new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g');
    while ((x = g.exec(text))) {
      if (x[0].length === 0) g.lastIndex++;
      if (o.narrationOnly && inSpeech(x.index)) continue;
      if (o.ok && !o.ok(x)) continue;
      out.push({ ...fig(term, x.index, x.index + x[0].length, text), ...(o.loose ? { loose: true } : {}) });
    }
  };
  // Periphrasis: a made thing named by what it does (“the instrument by which the voice is carried”), a place by
  // what is done there (“a house where coffee is sold”), people by their office, or a settled phrase. A description
  // after “is” says what a thing is and names nothing.
  const names = (x: RegExpExecArray) => !PREDICATE.test(text.slice(0, x.index));
  // A settled phrase is a periphrasis wherever it stands; the other forms name a thing only outside a predicate.
  SURE_PERIPHRASIS.forEach((r, k) => re(r, 'periphrasis', k ? { ok: names } : {}));
  // The looser form: any made thing with what it does (“my little machine for writing”, “the instrument in his
  // hand”). In a book it is as often the plain name of the thing, so it is marked loose.
  const sure = out.filter((f) => f.term === 'periphrasis');
  re(new RegExp(`\\b(?:${DET})\\s+${ADJ}(?:${ARTEFACT})s?\\s+(?:(?:${PURPOSE})\\b[^,.;:!?—]{0,60}|in\\s+(?:his|her|my|their|your|our)\\s+(?:hands?|pocket)\\b)`, 'i'), 'periphrasis', {
    ok: (x) => names(x) && !sure.some((f) => f.start < x.index + x[0].length && f.end > x.index),
    loose: true,
  });
  // Generalization over the particular: the vehicle of an ironic verdict. The general person must be the subject of
  // a clause (“as a man will fidget who…”), never the object of “of” or “like”.
  re(/\b(?:it is a truth[^.;]*|as (?:is|was) (?:usual|often the case|common)[^,.;]*|which is (?:the|a) (?:usual|common|general|ordinary) [^,.;]*)/i, 'gnomic', { narrationOnly: true });
  // “As witnesses always are”: a kind of thing, never this one (“as she always does”, “as your drawings always are”).
  re(/\bas (?!(?:she|he|it|they|you|we|i|your|his|her|my|our|their|its|this|that|these|those|the)\b)[a-z\s]{3,40}? (?:commonly|usually|always|generally|seldom|often) (?:does|do|is|are|will)\b/i, 'gnomic', {
    narrationOnly: true,
    ok: (x) => !/\b(?:she|he|it|they|you|we|i|your|his|her|my|our|their|its|this|that|these|those)\s+(?:[a-z]+\s+){0,2}(?:is\s+and\s+)?(?:commonly|usually|always|generally|seldom|often)\b/i.test(x[0]),
  });
  re(/\b(?:(?:every|no|a) (?:man|woman|young (?:man|lady|woman)|body)|(?:every|a) person|no one is so)\b(?! of\b| in it\b| here\b| there\b| present\b)[^.;,:—]{0,45}?\b(?:is|must|cannot|can never|will|has|ought|always|never|seldom|commonly)\b\s+[a-z’-]+\s+[a-z’-]+[^,.;]*/i, 'gnomic', {
    narrationOnly: true,
    ok: (x) => {
      const lead = text.slice(0, x.index);
      // A law (“no man shall…”) commands; it does not observe. “As a man who…” likens one person to another.
      if (/\bshall\b/i.test(x[0]) || (/\bas\s+$/i.test(lead) && /^a (?:man|woman|body) (?:who|that)\b/i.test(x[0])) || /^a (?:man|woman) (?:that|who) (?:is|was) (?:called|named)\b/i.test(x[0])) return false;
      return /(?:^|[,;:—(“]\s*|\b(?:and|but|for|if|when|as|that|because|unless|where|while|though|since|way|thing|all|what|which|how|why|till|until|whenever|so|yet)\s+)$/i.test(lead);
    },
  });
  // A deflating aside.
  re(/,\s+(?:which|and that|and this)\s+(?:was|is|were|had been)\s+(?:at least|perhaps (?:why|the|as|more|less|no)|no more than|more than|after all|only (?:another|what|fit|natural|fair|right|just|to be expected|[A-Z][a-z]+day)|scarcely to be|hardly to be)\b[^.;,]*/, 'aside', { narrationOnly: true });
  // Parenthesis: an aside set in.
  re(/,\s+(?:I|she|he|we|they)\s+(?:believe|suppose|think|fancy|confess|own|declare|dare say|am sure|must say|grant)\s*,|—[^—.!?]{3,60}—/, 'parenthesis');
  // Hyperbole. The set phrases are sure. A superlative “of my life” is hyperbole where the thing is small (“the
  // most awkward ten minutes of my life”) and plain truth where it is not, so it is marked loose.
  re(/\b(?:never\s+in\s+(?:my|her|his)\s+life|a\s+(?:thousand|hundred|million)\s+times|beyond\s+all\s+(?:reason|measure|bounds|description))/i, 'hyperbole');
  re(
    /\bthe\s+(?:most|very\s+\w+est|(?!rest\b|west\b|forest\b|interest\b|request\b|harvest\b|contest\b|conquest\b|tempest\b|greatest part\b|best part\b)\w{3,}est)\s+[^,.;]{0,40}\b(?:in|of)\s+(?:my|her|his|their|all)\s+(?:life|lives|days|existence|week|world)/i,
    'hyperbole',
    { ok: (x) => !/\bone of\s+$/i.test(text.slice(0, x.index)), loose: true },
  );

  // Antithesis: “not this, but that”, where this and that are of one kind; and “rather this than that”.
  const word = (k: number) => toks[k]?.kind === 'word';
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]!;
    if (t.kind !== 'word') continue;
    if (t.norm === 'not') {
      let a = k + 1;
      if (toks[a]?.norm === 'only' || toks[a]?.norm === 'merely' || toks[a]?.norm === 'just') continue;
      if (toks[a]?.norm === 'so' && toks[a + 1]?.norm === 'much') a += 2;
      if (!word(a)) continue;
      // “But” within six words, with no stop between.
      let b = -1;
      for (let j = a + 1; j < toks.length && j <= a + 9; j++) {
        const x = toks[j]!;
        if (x.kind === 'punct' && x.norm !== ',') break;
        if (x.kind === 'word' && x.norm === 'but') {
          b = j;
          break;
        }
      }
      if (b < 0 || toks.slice(a, b).filter((x) => x.kind === 'word').length > 6) continue;
      // “Not thinking of anything but getting out”: there “but” means “except”.
      if (['anything', 'nothing', 'all', 'none', 'anyone', 'nobody', 'else'].includes(toks[b - 1]!.norm)) continue;
      let y = b + 1;
      while (toks[y] && ['rather', 'only', 'simply', 'instead'].includes(toks[y]!.norm)) y++;
      if (!word(y)) continue;
      const ca = cls(tags[a] ?? '');
      const cy = cls(tags[y] ?? '');
      const mine = (t: string | undefined) => /^PP\$/.test(t ?? '');
      const like = toks[a]!.norm === toks[y]!.norm || (ca !== '' && ca !== 'V' && ca === cy) || (ca === 'D' && cy === 'N') || (ca === 'N' && cy === 'D') || (mine(tags[a]) && mine(tags[y]));
      // A verb denied and another put in its place is a contrast of acts; “did not love it, but I…” is a new clause.
      if (!like) continue;
      let end = y;
      while (end + 1 < toks.length && toks[end + 1]!.kind === 'word' && end - y < 6) end++;
      out.push(fig('antithesis', t.start, toks[end]!.end, text));
    } else if (t.norm === 'rather' || t.norm === 'more' || t.norm === 'less') {
      let a = k + 1;
      if (cls(tags[a] ?? '') === 'D') a++;
      const th = toks[a + 1];
      if (!word(a) || !th || th.norm !== 'than') continue;
      let y = a + 2;
      if (cls(tags[y] ?? '') === 'D' && a > k + 1) y++;
      if (!word(y) || toks[y]!.norm === 'otherwise' || toks[y]!.norm === 'ever' || toks[y]!.norm === 'usual') continue;
      const ca = cls(tags[a] ?? '');
      if (!'JN'.includes(ca) || ca === '' || cls(tags[y] ?? '') !== ca || /^NP/.test(tags[y] ?? '') || /^NP/.test(tags[a] ?? '')) continue;
      // “More vivid than the memory was”, “more questions than Rolly and I did”: a comparison that runs on is no balance.
      if (toks[y + 1]?.kind === 'word' && !['by', 'in', 'to', 'of'].includes(toks[y + 1]!.norm)) continue;
      out.push(fig('antithesis', t.start, toks[y]!.end, text));
    }
  }

  // By sentence: free indirect discourse, polysyndeton, anaphora, tricolon, inversion.
  // Free indirect discourse belongs to prose narration: in a play or in verse a line ending “?” or “!” is speech.
  const prose = m.author.citeStyle !== 'play' && m.author.citeStyle !== 'verse';
  let from = 0;
  const ends = toks.map((t, k) => (t.kind === 'punct' && /^[.!?]$/.test(t.norm) ? k : -1)).filter((k) => k >= 0);
  for (const end of [...ends, toks.length - 1]) {
    if (end < from) continue;
    const seg = toks.slice(from, end + 1);
    const segTags = tags.slice(from, end + 1);
    const words = seg.filter((t) => t.kind === 'word');
    if (words.length) {
      const s0 = seg[0]!.start;
      const s1 = seg[seg.length - 1]!.end;
      const last = seg[seg.length - 1]!;
      // A question or exclamation in the narration.
      // (In a letter the writer addresses the reader: a question there is no character's thought.)
      if (prose && !opts.letter && !opts.spoken && (last.norm === '?' || last.norm === '!') && !inSpeech(last.start) && !seg.some((t) => t.text === '“' || t.text === '”')) out.push(fig('fid', s0, s1, text));

      // Polysyndeton: “and” repeated between the members of a series. Each “and” is read with the class of the
      // word it brings in; a run of them bringing in the same class is the series.
      const ands: { k: number; c: Cls; tight: boolean }[] = [];
      seg.forEach((t, k) => {
        if (t.kind !== 'word' || t.norm !== 'and') return;
        let j = k + 1;
        while (seg[j] && ['then', 'so', 'yet', 'now', 'afterwards', 'again'].includes(seg[j]!.norm)) j++;
        if (seg[j]?.kind !== 'word') return;
        let c = cls(segTags[j] ?? '');
        // A clause's subject and a noun phrase open alike: one class for both.
        if (c === 'D' || c === 'P') c = 'N';
        ands.push({ k, c, tight: k > 0 && seg[k - 1]!.kind === 'word' });
      });
      // “This and that and the other”: three like things, each of a word or two, with no stop among them.
      const like = (x: Cls, y: Cls) => x !== '' && x === y;
      const lead = (k: number) => {
        // The class of the item that ends just before an “and”.
        let c = cls(segTags[k - 1] ?? '');
        if (c === 'D' || c === 'P') c = 'N';
        return c;
      };
      const short = (a: number, b: number) => {
        const between = seg.slice(a + 1, b);
        if (between.some((t) => t.kind !== 'word')) return false;
        return between.length === 1 || (between.length === 2 && /^(AT|PP\$|QL|DT|AP)/.test(segTags[a + 1] ?? ''));
      };
      const tight = ands.find((x, i) => i > 0 && x.tight && ands[i - 1]!.tight && short(ands[i - 1]!.k, x.k) && like(x.c, ands[i - 1]!.c) && like(lead(ands[i - 1]!.k), x.c));
      if (tight) out.push(fig('polysyndeton', seg[Math.max(0, ands[ands.indexOf(tight) - 1]!.k - 1)]!.start, s1, text));
      // After a pause, the “and”s that bring in the members of a series: verbs with one subject (“cleaned the
      // gutters, and mended the sink, and called…”) and wh-clauses, where two make three members; whole clauses,
      // where it takes three, since “this happened, and that followed” is the common way to join two. A “but”
      // between two of them ends the series, and so does a member with a comma inside it, which is a list of its own.
      const loose = ands.filter((x) => !x.tight);
      const whole = (a: number, b: number) => {
        const inner = seg.slice(a + 1, b - 1);
        return !inner.some((t) => t.kind === 'punct' || t.norm === 'but');
      };
      for (let a = 0; a < loose.length && !tight; a++) {
        let b = a;
        const c = loose[a]!.c;
        // A sentence that opens on “And” opens a clause, whatever word comes next.
        if (c !== 'N' && loose[a]!.k === seg.findIndex((t) => t.kind === 'word')) continue;
        const reach = c === 'W' ? 10 : 16;
        while (b + 1 < loose.length && loose[b + 1]!.c === c && loose[b + 1]!.k - loose[b]!.k <= reach && whole(loose[b]!.k, loose[b + 1]!.k)) b++;
        const n = b - a + 1;
        if (((c === 'V' || c === 'W' || c === 'J') && n >= 2) || (c === 'N' && n >= 3)) {
          out.push(fig('polysyndeton', seg[Math.max(0, loose[a]!.k - 1)]!.start, s1, text));
          break;
        }
      }

      // The sentence in members, cut at its commas and semicolons, each with the word that opens it.
      const members: { open: number; close: number; led: boolean }[] = [];
      let open = 0;
      for (let k = 0; k <= seg.length; k++) {
        const t = seg[k];
        if (t && !(t.kind === 'punct' && /^[,;:]$/.test(t.norm))) continue;
        // The member's first word, past any quotation mark or dash.
        let o = open;
        while (o < k && seg[o]!.kind !== 'word') o++;
        const led = seg[o]?.norm === 'and' || seg[o]?.norm === 'or';
        if (led) o++;
        let close = k - 1;
        while (close > o && seg[close]!.kind !== 'word') close--;
        if (o < k && seg[o]?.kind === 'word') members.push({ open: o, close, led });
        open = k + 1;
      }
      // The tagger takes a past tense after a comma for a participle (“cleaned…, fixed…”): one form for both.
      const past = (t: string | undefined) => (t ?? '').replace(/^VBN/, 'VBD');
      const count = (a: number, b: number) => seg.slice(a, b + 1).filter((t) => t.kind === 'word').length;

      // Anaphora: three members running that open on the same word, and that word no mere joint of the sentence.
      const JOINT = new Set('and the a an but or who which that to of in as for with at by on if when so nor not is was it there this sir mr mrs miss lord lady st saint king queen dr'.split(' '));
      for (let a = 0; a + 2 < members.length; a++) {
        const w = seg[members[a]!.open]!.norm;
        if (JOINT.has(w)) continue;
        if (seg[members[a + 1]!.open]!.norm !== w || seg[members[a + 2]!.open]!.norm !== w) continue;
        // Each a clause or phrase of its own: two words at least.
        if ([a, a + 1, a + 2].some((x) => count(members[x]!.open, members[x]!.close) < 2)) continue;
        out.push(fig('anaphora', s0, s1, text));
        break;
      }

      // Tricolon. Three single words of one class: “handsome, clever, and rich”.
      let three = false;
      for (let k = 0; k + 3 < seg.length && !three; k++) {
        const a = seg[k]!;
        const b = seg[k + 2]!;
        if (a.kind !== 'word' || b.kind !== 'word' || seg[k + 1]!.norm !== ',') continue;
        let j = k + 3;
        const serial = seg[j]?.norm === ',';
        if (serial) j++;
        if (!(seg[j]?.norm === 'and' || seg[j]?.norm === 'or')) continue;
        const c = seg[++j];
        if (!c || c.kind !== 'word') continue;
        const ta = cls(segTags[k]!);
        if (!'JVR'.includes(ta) || ta === '' || cls(segTags[k + 2]!) !== ta || cls(segTags[j]!) !== ta) continue;
        // Three different words, none a mere joint (“once, perhaps, and then”) and none the start of quoted speech.
        const trio = [a.norm, b.norm, c.norm];
        // Without the comma before “and” the three must be of one tag: “generally speaking, rational and consistent” is two.
        if (!serial && (segTags[k] !== segTags[k + 2] || segTags[k] !== segTags[j])) continue;
        if (new Set(trio).size < 3 || trio.some((w) => ['perhaps', 'then', 'once', 'now', 'so', 'too', 'however', 'indeed', 'again', 'also', 'yet', 'still'].includes(w))) continue;
        if (ta === 'V' && (/^\p{Lu}/u.test(b.text) || /^\p{Lu}/u.test(c.text) || past(segTags[k]) !== past(segTags[k + 2]) || past(segTags[k]) !== past(segTags[j]))) continue;
        // Four in a row is a list.
        if (seg[k - 1]?.norm === ',' && cls(segTags[k - 2] ?? '') === ta) continue;
        out.push(fig('tricolon', a.start, c.end, text));
        three = true;
      }
      // Three members built alike, the last brought in by “and” or “or”: “whence they came, and what they did, and
      // whether they went to church”; “cleaned the gutters, mended the sink, and called my grandmother”.
      for (let a = 0; a + 2 < members.length && !three; a++) {
        const m1 = members[a]!;
        const m2 = members[a + 1]!;
        const m3 = members[a + 2]!;
        if (!m3.led || members[a + 3]?.led) continue;
        const o2 = seg[m2.open]!;
        const o3 = seg[m3.open]!;
        // What opens a member: a wh-word (“whether” among them), or a verb in one tense.
        const opens = (k: number): Cls => (/^(?:whether|if)$/.test(seg[k]?.norm ?? '') ? 'W' : cls(past(segTags[k])));
        const c2 = opens(m2.open);
        const same = o2.norm === o3.norm;
        const alike = same || (c2 === opens(m3.open) && (c2 === 'W' || (c2 === 'V' && past(segTags[m2.open]) === past(segTags[m3.open]))));
        if (!alike || (same && !['W', 'I', 'V', 'P'].includes(c2) && o2.norm !== 'my' && o2.norm !== 'his' && o2.norm !== 'her' && o2.norm !== 'our' && o2.norm !== 'their')) continue;
        const n2 = count(m2.open, m2.close);
        const n3 = count(m3.open, m3.close);
        if (n2 < 2 || n3 < 2 || n2 > 10 || n3 > 12) continue;
        // The first member's like part: from the last word in it that matches the opener of the second.
        let o1 = -1;
        for (let k = m1.close; k >= m1.open; k--) {
          if (seg[k]!.kind !== 'word') continue;
          if (same ? seg[k]!.norm === o2.norm : c2 === 'W' ? opens(k) === 'W' : past(segTags[k]) === past(segTags[m2.open])) {
            o1 = k;
            break;
          }
        }
        if (o1 < 0 || count(o1, m1.close) < 2 || count(o1, m1.close) > 10) continue;
        // “I paid, I picked up the milk, and I left”: a pronoun that opens each member, the first too.
        if (c2 === 'P' && o1 !== m1.open) continue;
        // Four built alike is a list.
        const m0 = members[a - 1];
        if (o1 === m1.open && m0 && (seg[m0.open]!.norm === o2.norm || (!same && past(segTags[m0.open]) === past(segTags[m2.open])))) continue;
        out.push(fig('tricolon', seg[o1]!.start, seg[m3.close]!.end, text));
        three = true;
      }

      // An adjective, adverb or object put first, then the verb, then its subject.
      const w0 = seg.findIndex((t) => t.kind === 'word');
      // The fronted part: an adjective, adverb or qualifier, with the noun it qualifies if any.
      let k = w0;
      if (/^(JJ|RB|QL)/.test(segTags[k] ?? '') && last.norm !== '?') {
        k++;
        while (/^(JJ|NN)/.test(segTags[k] ?? '') && k < w0 + 3) k++;
        // An auxiliary before its subject (“had Harriet”, “did they”): a lexical verb there is the ordinary order.
        // “Here is” and “there was” point; “so did I” and “nor did he” have no other order.
        // With a noun fronted (“Small heart had Harriet”) the subject after the verb must be a name or pronoun, and
        // the verb no form of “be”: “American leadership is the one constant” is the ordinary order.
        const noun = k > w0 + 1 || /^NN/.test(segTags[k - 1] ?? '');
        const verb = noun ? /^(HVD|HVZ|DOD|DOZ|MD)/ : /^(BEDZ|BED|BEZ|BER|HVD|HVZ|DOD|DOZ|MD)/;
        const subject = noun ? /^(PPS|PPSS|NP)/ : /^(PPS|PPSS|NP|AT|PP\$)/;
        if (verb.test(segTags[k] ?? '') && subject.test(segTags[k + 1] ?? '') && !['so', 'here', 'there', 'neither', 'nor', 'how', 'why', 'where', 'when', 'what'].includes(words[0]!.norm))
          out.push(fig('inversion', s0, s1, text));
      }
    }
    from = end + 1;
  }
  out.sort((a, b) => a.start - b.start || a.term.localeCompare(b.term));
  return out.filter((f, i) => !out.slice(0, i).some((g) => g.term === f.term && g.start <= f.start && g.end >= f.end));
}

/** People named by what they do: “those whom we serve”, “them that keep the booths”. */
const PEOPLE = /\b(?:those|they|them|such|(?:the|some|certain)\s+(persons|people|gentlemen|ladies|men|women|individuals))\s+(?:who|whom|that|as)\s+[^,.;:!?—]{2,50}/gi;
/** Any made thing or place, described: looser than the form findFigures asks, since the student's own word is the proof. */
const DESCRIBED = new RegExp(
  `\\b(?:${DET}|one\\s+of\\s+those)\\s+${ADJ}(?:` +
    `(${ARTEFACT}|thing|object|contrivance|article)s?\\s+(?:(?:(?:by|with|in|through|on|upon|from|into|at|for|of|to)\\s+which|whereby|wherewith|which|that)\\b[^,.;:!?—]{2,60}|(?:for|of)\\s+(?:the\\s+)?[a-z]+ing(?:\\s+(?!and\\b|but\\b)[a-z’-]+){0,4}|in\\s+(?:his|her|my|their|your|our)\\s+(?:hands?|pocket)|to\\s+(?:eat|drink|wear|write|read|ride)\\b(?:\\s+(?:with|between|at|on|in|for)\\s+[a-z’-]+)?)` +
    `|(${PLACE}|quarter)s?\\s+(?:(?:where|(?:in|at)\\s+which|that)\\b[^,.;:!?—]{2,50}|of\\s+(?:the\\s+|their\\s+|his\\s+|her\\s+|our\\s+)?[a-z’-]+))`,
  'gi',
);
type Sort = 'tool' | 'food' | 'person' | 'place';
/** WordNet's broader terms that say what sort of thing a noun names. */
const SORTS: Record<string, Sort> = {
  instrumentality: 'tool',
  device: 'tool',
  equipment: 'tool',
  machine: 'tool',
  implement: 'tool',
  food: 'food',
  foodstuff: 'food',
  nutriment: 'food',
  beverage: 'food',
  person: 'person',
  building: 'place',
  edifice: 'place',
  establishment: 'place',
  'place of business': 'place',
  room: 'place',
  workplace: 'place',
};
const MODAL = /^(?:may|might|will|shall|would|could|should|can|cannot|must|is|are|was|were|have|has|had|do|does|did)$/;

/**
 * What sort of thing a noun names, by WordNet's chain of broader terms: a tool, food, a person, a place. The first
 * of its senses that is one of these decides: a “guy” is a man before he is a rope, and a “charger” that is no
 * horse is a device. Null where WordNet does not know the word at all.
 */
function sortsOf(m: AuthorModel, noun: string): Set<Sort> | null {
  let known = false;
  for (const lemma of m.wn.lemmas(noun, 'n').slice(0, 2)) {
    for (const id of m.wn.senses(lemma, 'n').slice(0, 3)) {
      known = true;
      const out = new Set<Sort>();
      let at: string[] = [id];
      for (let depth = 0; depth < 14 && at.length; depth++) {
        const next: string[] = [];
        for (const x of at) {
          const syn = m.wn.synset(x);
          if (!syn) continue;
          for (const w of syn.words) {
            const sort = SORTS[w.toLowerCase().replace(/_/g, ' ')];
            if (sort) out.add(sort);
          }
          next.push(...(syn.rels['@'] ?? []), ...(syn.rels['@i'] ?? []));
        }
        at = next.slice(0, 6);
      }
      if (out.size) return out;
    }
  }
  return known ? new Set() : null;
}

/**
 * Periphrasis in a rewrite, proved by the student's own sentence: the rewrite describes a thing (“the instrument in
 * his hand”), the student named one of that sort (“phone”), and the name is gone. The description's head must be new
 * too: “a machine that gives out soap” for the student's “a machine that sells soap” is the student's own phrase.
 */
export function periphrasisFor(m: AuthorModel, beforeRaw: string, afterRaw: string): (Figure & { stands: string }) | null {
  const before = curly(beforeRaw);
  const after = curly(afterRaw);
  if (!before.trim()) return null;
  const btoks = tokenize(before);
  const btags = m.tagger.tagTokens(btoks);
  const stem = (w: string) => m.wn.lemmas(w, 'n')[0] ?? w.replace(/s$/, '');
  const afterWords = new Set(tokenize(after).filter((t) => t.kind === 'word').flatMap((t) => [t.norm, stem(t.norm)]));
  const beforeWords = new Set(btoks.filter((t) => t.kind === 'word').flatMap((t) => [t.norm, stem(t.norm)]));
  const noun = (k: number) => btoks[k]?.kind === 'word' && /^NNS?$/.test(btags[k] ?? '');
  const kept = (k: number) => afterWords.has(btoks[k]!.norm) || afterWords.has(stem(btoks[k]!.norm));
  const beside = (a: number, b: number) => btoks[a]!.end + 1 === btoks[b]!.start;
  // The student's nouns the rewrite no longer has. Nouns that stand together are one name (“phone charger”); where
  // the rewrite keeps the last of them (“a charger for the instrument…”), the one it lost is the thing described.
  const gone: { name: string; part: string; sorts: Set<Sort> | null; never: boolean; plural: boolean; at: number }[] = [];
  btoks.forEach((t, k) => {
    if (!noun(k) || kept(k)) return;
    let a = k;
    let b = k;
    while (a > 0 && noun(a - 1) && beside(a - 1, a)) a--;
    while (noun(b + 1) && beside(b, b + 1)) b++;
    if (b !== k && !kept(b)) return;
    const name = b === k ? before.slice(btoks[a]!.start, btoks[b]!.end) : t.text;
    // The nouns before the last: what a “phone charger” charges.
    const part = b === k && a < k ? before.slice(btoks[a]!.start, btoks[k - 1]!.end) : '';
    gone.push({ name, part, sorts: sortsOf(m, t.norm), never: !(m.word(t.norm)?.count ?? 0), plural: btags[k] === 'NNS', at: t.start / before.length });
  });
  if (!gone.length) return null;
  // Of the student's lost names of the right sort, the one that stood where the description now stands.
  const pick = (sort: Sort, head: string, where: number) => {
    let of = gone.filter((g) => g.sorts?.has(sort));
    // People by their office: a plural. “Thing” says so little that only a word the voice never had will do.
    if (sort === 'person') of = of.filter((g) => g.plural);
    if (/^(?:thing|object|article)$/i.test(head) && sort === 'tool') of = of.filter((g) => g.never);
    if (!of.length && sort === 'tool') of = gone.filter((g) => g.sorts === null && g.never);
    return of.sort((x, y) => Math.abs(x.at - where) - Math.abs(y.at - where))[0];
  };
  const hit = (start: number, end: number, sort: Sort, head: string): (Figure & { stands: string }) | null => {
    const lead = after.slice(0, start);
    if (PREDICATE.test(lead) || (head && (beforeWords.has(head.toLowerCase()) || beforeWords.has(stem(head.toLowerCase()))))) return null;
    const g = pick(sort, head, start / after.length);
    if (!g) return null;
    // “The cord for my little instrument of talking”: the cord is the charger, and the instrument the phone.
    const stands = sort === 'tool' && g.part && /\b(?:for|of|to)\s+(?:my|his|her|their|our|your|the|a|an)?\s*$/i.test(lead) ? g.part : g.name;
    return { ...fig('periphrasis', start, end, after), stands };
  };
  // A place by what is done there, in the strict form, whose span is the neatest; then any thing or place
  // described; then people.
  let x: RegExpExecArray | null;
  const place = new RegExp(SURE_PERIPHRASIS[1]!.source, 'gi');
  while ((x = place.exec(after))) {
    const g = hit(x.index, x.index + x[0].length, 'place', new RegExp(`\\b(${PLACE})s?\\b`, 'i').exec(x[0])?.[1] ?? '');
    if (g) return g;
  }
  DESCRIBED.lastIndex = 0;
  while ((x = DESCRIBED.exec(after))) {
    const sort: Sort = x[2] ? 'place' : /\bto\s+(?:eat|drink)\b/i.test(x[0]) ? 'food' : 'tool';
    const g = hit(x.index, x.index + x[0].length, sort, x[1] ?? x[2] ?? '');
    if (g) return g;
  }
  PEOPLE.lastIndex = 0;
  while ((x = PEOPLE.exec(after))) {
    // The description ends where the sentence's own verb begins: “they whom we serve | may not be pleased”.
    const words = x[0].split(/\s+/);
    const rel = words.findIndex((w) => /^(?:who|whom|that|as)$/i.test(w));
    let cut = words.findIndex((w, k) => k >= rel + 3 && MODAL.test(w.toLowerCase()));
    if (cut < 0) cut = Math.min(words.length, rel + 6);
    const g = hit(x.index, x.index + words.slice(0, cut).join(' ').length, 'person', x[1] ?? '');
    if (g) return g;
  }
  return null;
}

/** The terms of the figures in a passage, once each. */
export const figureTerms = (m: AuthorModel, text: string) => [...new Set(findFigures(m, text).map((f) => f.term))];

/** Cheap signs of a figure, to sift the whole corpus before the detector confirms. */
const SIGNS: Record<string, RegExp> = {
  litotes: /\b(?:not|no|cannot)\b|n[’']t\b/i,
  periphrasis: new RegExp(`\\b(?:${ARTEFACT}|${PLACE}|persons|people|gentlemen|ladies|personages|individuals)s?\\s+(?:which|that|where|whereby|wherewith|of|for|in|with|by|at|through|on|upon|from|into|set|placed|put|charged|employed|appointed)\\b|${SETTLED}`, 'i'),
  gnomic: /truth|as is usual|as was usual|commonly|usually|always|generally|seldom|often|which is (the|a) (usual|common|general|ordinary)|\b(every|no|a) (man|woman|young|person|one|body)\b/i,
  antithesis: /\bnot\b[^.]{1,60}\bbut\b|\b(less|more|rather)\s+(\w+\s+){1,2}than\b/i,
  tricolon: /,[^,]+,?\s+(and|or)\s/,
  hyperbole: /\b(most|est|never in|thousand|hundred|million|beyond all)\b|est\b/i,
  anaphora: /(?:^|[,;:])\W*(?:and\s+|or\s+)?([\p{L}’']+)\b[^,;:]*[,;:]\W*(?:and\s+|or\s+)?\1\b[^,;:]*[,;:]\W*(?:and\s+|or\s+)?\1\b/iu,
  inversion: /^\W*[\p{L}’'-]+(?:\s+[\p{L}’'-]+){0,2}\s+(?:was|were|is|are|had|has|did|does|do|may|might|shall|should|will|would|can|could|must)\s/iu,
  parenthesis: /, (I|she|he|we|they) (believe|suppose|think|fancy|confess|own|declare|dare say|am sure|must say|grant)|—[^—.!?]{3,60}—/,
  polysyndeton: /\band\b.*\band\b/i,
  fid: /[!?]$/,
  aside: /, (which|and that|and this) (was|is|were|had been) (at least|perhaps|scarcely|hardly|no more than|only|after all|more than)/i,
};

/** Whether a sentence bears the cheap sign of a figure: false, and the detector need not be run. */
export const mayShow = (term: string, text: string): boolean => !SIGNS[term] || SIGNS[term]!.test(text);

/** Where a figure is found by patterns alone, the patterns are its sign, and the sift tries no other sentence. */
const SURE_SIGNS: Record<string, RegExp[]> = { periphrasis: SURE_PERIPHRASIS };

/** The sentences the corpus was sifted for, once for each model and figure. */
const sifted = new WeakMap<AuthorModel, Map<string, number[]>>();

/** Up to a dozen sentences of the corpus that show a figure, found by walking it in a scattered order (about 1 s). */
function sift(m: AuthorModel, want: string): number[] {
  const memo = sifted.get(m) ?? new Map<string, number[]>();
  sifted.set(m, memo);
  const had = memo.get(want);
  if (had) return had;
  const exclude = new Set(m.author.linkExclude ?? []);
  const rows = m.db.prepare('SELECT id, text FROM sentences WHERE words BETWEEN 6 AND 45 ORDER BY (id * 7919) % 100003 LIMIT 120000').all() as { id: number; text: string }[];
  const out: number[] = [];
  const until = Date.now() + 1500;
  let tried = 0;
  for (const r of rows) {
    if (out.length >= 12 || Date.now() > until) break;
    if (!(SURE_SIGNS[want]?.some((x) => x.test(r.text)) ?? mayShow(want, r.text))) continue;
    // Every figure's rule runs on each sentence tried: a bound on the broad signs (“not”, a comma).
    if (++tried > 6000) break;
    if (!findFigures(m, r.text, { spoken: m.spoken(r.id) }).some((f) => f.term === want && !f.loose)) continue;
    if (exclude.has(m.cite(r.id)?.work ?? '')) continue;
    out.push(r.id);
  }
  memo.set(want, out);
  return out;
}

/**
 * Sentences of the author's that show a figure, nearest in meaning to a passage, each confirmed by the figure's own
 * detector as it stands today (so a link names a sentence that truly shows it). The voice's pack holds them ready;
 * where the pack was built under an older detector and none of its sentences passes, the corpus is sifted once.
 */
export function figureExamples(m: AuthorModel, term: string, near: string, k = 3): import('./model.ts').Citation[] {
  const exclude = new Set(m.author.linkExclude ?? []);
  // An ironic verdict is found by its usual vehicle, the generalization.
  const want = term === 'irony' ? 'gnomic' : term;
  const shows = (id: number) => {
    const c = m.cite(id);
    return !!c && !exclude.has(c.work) && findFigures(m, c.text, { spoken: m.spoken(id) }).some((f) => f.term === want && !f.loose);
  };
  // The pack's sentences nearest first, each checked as it is taken: a few checks, not the whole table's.
  const table = m.pack?.exemplars[want] ?? [];
  const out: import('./model.ts').Citation[] = [];
  for (const c of m.nearestOf(table, near, table.length)) {
    if (out.length >= k) break;
    if (shows(c.id)) out.push(c);
  }
  return out.length ? out : m.nearestOf(sift(m, want), near, k);
}
