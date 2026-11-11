// Figures of speech, recognized: the classical rhetoric's names for constructions a reader can learn to see and a
// writer to make. Each is found by its form (the words, their tags, their order), named with its standard term, and
// glossed in a line. They are any author's; an author's "moves" (authors/<id>.json) are the ones that author favours.
// What is found is what the form shows: irony itself is not a form, and is named only where its usual vehicle is (a
// generalization laid over a particular case), or where the rewriter's note claims it.

import { sentences, tokenize, type Token } from '../nlp/tokenize.ts';
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
  // Figures with no form to find them by. The writer of a rewrite names them in its own sentences (rewrite.ts).
  metaphor: { name: 'Metaphor', gloss: 'One thing called by the name of another: “the evening of life”.' },
  personification: { name: 'Personification', gloss: 'A thing or an idea given the acts or feelings of a person: “the fire sulked”.' },
  metonymy: { name: 'Metonymy', gloss: 'A thing named by something tied to it: “the Crown” for the monarch.' },
  synecdoche: { name: 'Synecdoche', gloss: 'A part named for the whole: “all hands on deck”.' },
  zeugma: { name: 'Zeugma', gloss: 'One word used with two others in two senses: “lost her keys and her temper”.' },
  oxymoron: { name: 'Oxymoron', gloss: 'Two words of opposite meaning joined: “cruel kindness”.' },
  hyperbole: { name: 'Hyperbole', gloss: 'Exaggeration not meant literally: “the most awkward ten minutes of my life”.' },
  asyndeton: { name: 'Asyndeton', gloss: 'A list with the joining words left out: “I came, I saw, I conquered.”' },
  epistrophe: { name: 'Epistrophe', gloss: 'Successive clauses closing on the same word.' },
  anadiplosis: { name: 'Anadiplosis', gloss: 'A clause opening on the word the last one closed on: “He gave them hope, and hope gave them strength.”' },
  chiasmus: { name: 'Chiasmus', gloss: 'Two terms repeated in reverse order: “Fair is foul, and foul is fair.”' },
  isocolon: { name: 'Isocolon', gloss: 'Neighbouring clauses of the same length and build: “Many are called, but few are chosen.”' },
  polyptoton: { name: 'Polyptoton', gloss: 'One root repeated in a different form: “Judge not, that ye be not judged.”' },
  rhetoricalquestion: { name: 'Rhetorical question', gloss: 'A question asked to make a point, with the answer taken for granted: “Who would not want to be happy?”' },
  hypophora: { name: 'Hypophora', gloss: 'A question the writer asks and then answers.' },
  alliteration: { name: 'Alliteration', gloss: 'Neighbouring words that open on the same sound: “Full fathom five thy father lies”.' },
  climax: { name: 'Climax', gloss: 'A series in which each term is longer and weightier than the last.' },
  periodic: { name: 'Periodic sentence', gloss: 'A sentence that holds its main clause until the end.' },
  apostrophe: { name: 'Apostrophe', gloss: 'Speech turned to someone absent, or to a thing, as if it could hear: “O Death, where is thy sting?”' },
  simile: { name: 'Simile', gloss: 'A comparison made openly, with “like” or “as”: “as cold as ice”.' },
  epanorthosis: { name: 'Epanorthosis (correction)', gloss: 'A word taken back and a truer one put in its place: “a mistake, or rather a blunder”.' },
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
    // “He was very far from wrong”: the contrary denied by distance. After a verb of being, before a describing
    // word: never “far from home”, and never “not far from wrong”, which says something else.
    if (neg === 'far' && ws[i + 1]?.norm === 'from') {
      let b = i - 1;
      while (b >= 0 && i - b <= 3 && (/^(?:RB|QL)/.test(tagOf(b)) || ['very', 'so', 'indeed', 'still', 'yet', 'however', 'therefore'].includes(ws[b]!.norm)) && !isNeg(ws[b]!.norm) && ws[b]!.norm !== 'never') b--;
      const j = ws[i + 2]?.norm === 'being' ? i + 3 : i + 2;
      const w = ws[j];
      const stops = !/[.;:!?—()“”]/.test(text.slice(ws[Math.max(0, b)]!.end, w?.start ?? 0));
      if (w && b >= 0 && BE.has(ws[b]!.norm) && stops && /^(?:JJ|VBN)/.test(tagOf(j)) && plainQuality(w.norm) && !/^(?:NN|NP|JJ|VBG)/.test(tagOf(j + 1)) && !isNeg(ws[b - 1]?.norm ?? '') && ws[b - 1]?.norm !== 'never')
        out.push(fig('litotes', ws[i]!.start, w.end, text));
      continue;
    }
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

// Figures found by the build of the clauses, by sound, and by set forms. Each asks for more than its definition does:
// a wrong name teaches worse than none, so a doubtful case is left unnamed.

/** Words with no matter of their own: never the repeated word of an epistrophe, a chiasmus or a polyptoton. */
const EMPTY = new Set(
  (
    'a an the and or but nor for yet so of in on at by to from with without into upon unto over under through between among against after before about above below ' +
    'i me my mine myself we us our ours you your yours ye thou thee thy thine he him his she her hers it its they them their theirs this that these those who whom whose which what when where why how ' +
    'as if than then there here not no be am is are was were been being have has had having hath do does did doing done doth will would shall should can could may might must ought ' +
    'all any some such one ones more most much many very too also only even just still again now ever never always often up down out off away back said say says saying ' +
    'mr mrs miss sir madam lord lady thing things other others same own else himself herself itself themselves yourself ourselves'
  ).split(' '),
);

/** A member of a passage: the words between two stops, with the joining word that leads it taken off. */
interface Colon {
  /** Its word tokens, by index. */
  w: number[];
  /** The joining word that leads it, if one does. */
  led: string;
  /** The stop that closes it: “,”, “;”, “.”, “—”. */
  stop: string;
  /** Which sentence of the passage it is in. */
  sent: number;
}

/** A passage in members, cut at its stops. A full stop after “Mr” or an initial cuts nothing. */
function colons(text: string, toks: Token[]): Colon[] {
  const ends = new Set(sentences(text, toks).map((s) => s.to - 1));
  const out: Colon[] = [];
  let w: number[] = [];
  let sent = 0;
  const close = (stop: string) => {
    if (w.length) {
      const led = w.length > 1 && /^(?:and|or|but|nor|yet)$/.test(toks[w[0]!]!.norm) ? toks[w[0]!]!.norm : '';
      out.push({ w: led ? w.slice(1) : w, led, stop, sent });
    }
    w = [];
  };
  let lastEnd = -1;
  for (const e of ends) lastEnd = Math.max(lastEnd, e);
  // The token that ends each sentence may be a closing quotation mark: the stop is the mark before it.
  const sentenceEnd = new Set<number>();
  for (const e of ends) {
    let k = e;
    while (k > 0 && toks[k]!.kind === 'punct' && !/^[.!?…]$/.test(toks[k]!.norm)) k--;
    sentenceEnd.add(k);
  }
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]!;
    if (t.kind !== 'punct') {
      w.push(k);
      continue;
    }
    if (sentenceEnd.has(k)) {
      close(t.norm);
      sent++;
    } else if (/^[,;:—?!]$/.test(t.norm)) close(t.norm);
  }
  close('');
  return out;
}

/**
 * The consonant sound a word opens on, read from its spelling: “city” opens on s and “cat” on k, “phone” on f,
 * “knee” on n, “who” on h. Empty where the word opens on a vowel sound (“hour”, “apple”).
 */
export function onset(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  if (/^(?:hour|honest|honou?r|heir)/.test(w)) return '';
  if (/^(?:one|once)/.test(w)) return 'w';
  if (/^(?:eu|ewe|u(?:ni(?![nm])|s(?:e|u|ing)|ti|biq))/.test(w)) return 'y';
  if (/^[aeiou]/.test(w)) return '';
  if (/^(?:kn|gn|pn|mn)/.test(w)) return 'n';
  if (/^wr/.test(w)) return 'r';
  if (/^ps/.test(w)) return 's';
  if (/^ph/.test(w)) return 'f';
  if (/^wh/.test(w)) return /^who(?!a)/.test(w) ? 'h' : 'w';
  if (/^(?:sh|sugar|sure)/.test(w)) return 'sh';
  if (/^ch/.test(w)) return /^ch(?:r|l|aos|aracter|asm|em|oir|or(?:us|al|d|eo|ist)|olera|ameleon)/.test(w) ? 'k' : /^ch(?:ef|aise|ampagne|agrin|arade|evalier|ivalr|andelier|aperon|arlatan|ateau)/.test(w) ? 'sh' : 'ch';
  if (/^th/.test(w)) return /^th(?:omas|ames|yme)/.test(w) ? 't' : 'th';
  if (/^c[eiy]/.test(w)) return 's';
  if (/^[ckq]/.test(w)) return 'k';
  if (/^ge/.test(w)) return /^ge(?:t|ar|es|ld|yser|ck)/.test(w) ? 'g' : 'j';
  if (/^gi/.test(w)) return /^gi(?:an|n(?!gham)|ps|be|st|bb|raf)/.test(w) ? 'j' : 'g';
  if (/^gy/.test(w)) return 'j';
  if (/^x/.test(w)) return 'z';
  return w[0]!;
}

const syllables = (w: string) => Math.max(1, (w.toLowerCase().replace(/e\b/, '').match(/[aeiouy]+/g) ?? []).length);

/** Roots too common for their return in another form to be heard. */
const DULL_ROOTS = new Set('go get come make take give see put let use know think look seem keep find tell call want mean live leave feel become begin bring hold turn show hear set ask need like long last first second man good great well right kind sort part way time day end'.split(' '));

/** Whether two words are of one root by their spelling: the shorter, less a final e or y, opens the longer. */
function akin(a: string, b: string): boolean {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  const t = s.replace(/[ey]$/, '');
  return t.length >= 3 && l.startsWith(t.length <= 5 ? t : t.slice(0, Math.max(5, t.length - 3)));
}

const rootsMemo = new WeakMap<AuthorModel, Map<string, Set<string>>>();
/**
 * The roots a word may come from: its base forms as any part of speech, and the words WordNet derives from them
 * that open on the same letters (“alteration”: alter; “judged”: judge, judgment).
 */
function rootsOf(m: AuthorModel, w: string): Set<string> {
  const memo = rootsMemo.get(m) ?? new Map<string, Set<string>>();
  rootsMemo.set(m, memo);
  const had = memo.get(w);
  if (had) return had;
  const out = new Set<string>();
  const stem = w.slice(0, 3);
  for (const pos of ['n', 'v', 'a', 'r'] as const) {
    for (const lemma of m.wn.lemmas(w, pos)) {
      if (!lemma.startsWith(stem.slice(0, 2))) continue;
      out.add(lemma);
      for (const id of m.wn.senses(lemma, pos).slice(0, 6)) {
        const syn = m.wn.synset(id);
        // A relation between synsets holds for their words only loosely: the same opening letters keep it to the root.
        if (!syn?.words.includes(lemma)) continue;
        for (const o of syn.rels['+'] ?? []) for (const x of m.wn.synset(o)?.words ?? []) if (!x.includes('_') && akin(lemma, x)) out.add(x);
      }
    }
  }
  // “Happily”: happy.
  const ly = /^(.{3,})(?:i)ly$/.exec(w) ? w.replace(/ily$/, 'y') : /^(.{4,})ly$/.test(w) ? w.slice(0, -2) : '';
  if (ly && m.wn.senses(ly, 'a').length) out.add(ly);
  if (memo.size > 20000) memo.clear();
  memo.set(w, out);
  return out;
}

/** Questions that are asked to make a point: the form expects no answer, or only one. */
const RHETORICAL = (() => {
  const not = '(?:not|never)';
  const aux = '(?:is|was|are|were|am|do|does|did|have|has|had|hath|doth|can|could|will|would|shall|should|must|may|might|ought)';
  const one = '(?:it|this|that|there|he|she|they|we|i|one|these|those|all|any(?:\\s?one|body)?|every(?:\\s?one|body))';
  const wh = [
    // “Who would not weep?”, “Who does not know it?”
    `who (?:${aux} ${not}|(?:wouldn’t|couldn’t|can’t|cannot|won’t|doesn’t|didn’t|isn’t|wasn’t|hasn’t))\\b`,
    // “Who can doubt it?”, “Who could have thought it?”
    'who (?:can|could|would|shall|will|should) (?:ever |possibly |now |then |say or )?(?:doubt|deny|say|tell|wonder|blame|believe|imagine|suppose|forget|resist|describe|have (?:thought|believed|supposed|guessed|imagined|dreamed|dreamt|foreseen|expected))\\b',
    'who (?:knows|cares|but)\\b',
    'who (?:among|of) (?:us|you|them)\\b',
    'who (?:is|was) there (?:that|who|but|to)\\b',
    'who else (?:would|could|can|but)\\b',
    // “What could be more natural?”, “What is life but a dream?”
    'what (?:could|can|would|will|shall) (?:be|have been) (?:more|less|better|worse|[a-z]+er)\\b',
    'what (?:is|was|are|were) [^?]{1,60}\\bbut\\b',
    'what (?:can|could|shall|should|would|will) (?:i|we|one|he|she|they|a man|any man|anyone|man|men) (?:do|say|think|expect|hope|know)\\b[^?]{0,40}\\bbut\\b',
    'what (?:does|did|do|can|could|would|will) (?:it|that|this|all this|they) (?:matter|signify|avail|profit)\\b',
    'what (?:is|was) the (?:use|good|worth)\\b',
    'what (?:use|good|profit|avail|harm|wonder|hope|right) (?:is|was|are|were|would|could|can|have|has|had)\\b',
    `what [a-z]+ (?:would|could|can|does|did|is|was|has|will) ${not}\\b`,
    'what (?:more|else|other [a-z]+|better [a-z]+) (?:can|could|would|should) (?!you\\b)',
    // “How could it be otherwise?”
    'how (?:could|can|should|shall|would) (?:i|we|he|she|they|one|it|any ?one|a man|any man|man|men) (?:not|ever|possibly|be otherwise|fail|help|but)\\b',
    'how (?:many|long|often|much longer)\\b[^?]*\\b(?:must|shall)\\b',
    // “Why should we wait?”
    'why (?:should|must|need) (?!you\\b)',
    'why else\\b',
    'where (?:is|was|are|were) the (?:man|woman|person|[a-z]+) (?:who|that|which)\\b',
  ];
  const turned = [
    // “Is it not strange?”, “Did he not say so?”, “Is not this the man?”
    `${aux} ${one} not\\b`,
    `${aux} not (?!you\\b|your\\b|thou\\b|ye\\b)[a-z]`,
    '(?:is|was) it any wonder\\b',
    'can it be (?:doubted|supposed|wondered|denied|believed|imagined)\\b',
    '(?:is|was) it to be (?:wondered|supposed|expected|imagined|believed|doubted)\\b',
    '(?:can|could|shall|will|does|did) (?:any ?one|any man|anybody|we|one) (?:doubt|deny|wonder|suppose|believe|imagine|blame|be surprised|forget)\\b',
    'need (?:i|we) (?:say|add|tell|remind|mention)\\b',
  ];
  const joint = '(?:and|but|for|yet|or|so|now|then|besides|indeed|after all|nay|well)';
  // A wh-question may open any clause. A verb before its subject is a question only where a clause begins: after
  // “and”, in the middle, “could not repress” is a statement.
  return new RegExp(`(?:^|[“,;:—(]\\s*|\\b${joint},?\\s+)(?:${wh.join('|')})|(?:^|[“;:—(]\\s*)(?:${joint},?\\s+)?(?:${turned.join('|')})`, 'i');
})();

/** How a writer's own answer opens. */
const ANSWERS = /^(?:because|not|no(?! (?:matter|doubt|wonder|sooner|longer)\b)|nothing|nobody|none|never|yes|(?:certainly|assuredly|surely) (?:not|none|no|never)|verily|by no means|far from it|god forbid|i think not|i (?:say|answer)|we (?:say|answer)|the answer|the reason)\b/i;

/** Heads that a speaker calls on in earnest: a person present, or God in prayer. */
const ADDRESSED = new Set(
  'lord god gods father jesus christ saviour king queen prince princess sir madam master mistress mother brother sister friend friends man men woman women boy girl love dear son daughter child children husband wife cousin uncle aunt nurse captain gentlemen ladies heaven heavens me my yes no dear dearest darling fool wretch villain people brethren priest prophet israel jacob judah ephraim'.split(
    ' ',
  ),
);

const LIKE_NO = new Set('the a an somewhat would should could might will shall to not do did does i we you they really rather always never also quite much more most just something anything nothing what feel feels felt feeling very so too exactly and or that if who'.split(' '));
const AS_NO = new Set('such same much many other well soon long far much many good little often near late early few possible fast far soon bad likely'.split(' '));
/** Heads that say nothing a reader can picture. */
const NO_PICTURE = new Set('one sort kind lot bit deal thing way manner person man woman gentleman lady boy girl child fellow people time case rule matter number'.split(' '));

/** Words that open a member which hangs on another: “when”, “if”, “having”… */
const HANGS = /^(?:when|whenever|if|though|although|as|since|while|whilst|after|before|because|unless|until|till|whether|where|wherever|once|having|being|with|without|in|on|at|by|from|for|to|upon|under|over|through|amid|amidst|among|despite|notwithstanding|during|against)$/;
/** Words that open a phrase and never a clause: a verb after one belongs to the main clause. */
const ONLY_PREP = /^(?:with|without|in|on|at|by|from|for|to|upon|under|over|through|amid|amidst|among|despite|notwithstanding|during|against)$/;
const SAYS = /^(?:said|say|says|saith|cried|replied|answered|asked|thought|added|continued|exclaimed|observed|warrant|suppose|think|believe|know|mean|trust|hope|fear|confess)$/;
const FINITE = /^(?:VBD|VBZ|VB|BEDZ|BED|BEZ|BER|BEM|HVD|HVZ|HV|DOD|DOZ|DO|MD)\*?$/;

function formFigures(m: AuthorModel, text: string, toks: Token[], tags: string[], inSpeech: (i: number) => boolean, opts: { next?: string }): Figure[] {
  const out: Figure[] = [];
  const cs = colons(text, toks);
  const norm = (k: number) => toks[k]?.norm ?? '';
  const tag = (k: number) => tags[k] ?? '';
  const c = (k: number) => cls(tag(k));
  const proper = (k: number) => /^NP/.test(tag(k)) || (/^\p{Lu}/u.test(toks[k]?.text ?? '') && k > 0 && toks[k - 1]!.kind === 'word' && !/^(?:NN|JJ|VB|RB)/.test(tag(k)));
  const isWord = (k: number) => toks[k]?.kind === 'word';
  const content = (k: number) => isWord(k) && c(k) !== '' && 'JNVR'.includes(c(k)) && !EMPTY.has(norm(k)) && norm(k).length > 2;
  const span = (term: string, a: number, b: number) => out.push(fig(term, toks[a]!.start, toks[b]!.end, text));
  const first = (x: Colon) => x.w[0]!;
  const last = (x: Colon) => x.w[x.w.length - 1]!;
  const past = (t: string) => t.replace(/^VBN/, 'VBD');
  const base = (k: number) => {
    const w = norm(k);
    const pos = c(k) === 'N' ? 'n' : c(k) === 'V' ? 'v' : c(k) === 'J' ? (/^VB/.test(tag(k)) ? 'v' : 'a') : 'n';
    return m.wn.lemmas(w, pos)[0] ?? m.wn.lemmas(w, 'v')[0] ?? m.wn.lemmas(w, 'n')[0] ?? w;
  };
  const sentOf = new Map<number, Colon[]>();
  for (const x of cs) sentOf.set(x.sent, [...(sentOf.get(x.sent) ?? []), x]);

  // What a member of a series is built as: a pronoun and its verb, a verb, a single describing word, or whatever
  // word opens it. The first member of a series holds its like part at its end (“He rose, dressed, went out”).
  const shape = (x: Colon): string[] => {
    const o = first(x);
    const keys: string[] = [];
    // “He said” and “I warrant” are tags on a speech, not members of a series.
    if (/^PPSS?$/.test(tag(o)) && c(x.w[1] ?? -1) === 'V' && !SAYS.test(norm(x.w[1]!)) && !SAYS.test(norm(last(x)))) keys.push(`S:${norm(o)}`);
    if (c(o) === 'V' && /^VB[DN]/.test(tag(o)) && x.w.length >= 2) keys.push(`V:${past(tag(o))}`);
    if (x.w.length === 1 && /^(?:JJ|RB|VBG)$/.test(tag(o)) && !EMPTY.has(norm(o)) && !/^(?:perhaps|however|indeed|then|therefore|besides|moreover|likewise|though|well|yes)$/.test(norm(o))) keys.push(`1:${tag(o)}`);
    if (x.w.length >= 2 && !/^(?:and|the|a|an|but|or|that|which|who|as|to|of|in|it|he|she|they|i|we|you|there|this|is|was)$/.test(norm(o))) keys.push(`W:${norm(o)}`);
    return keys;
  };
  /** Where the first member's like part begins, or -1. */
  const tail = (x: Colon, key: string): number => {
    if (key.startsWith('S:')) return shape(x).includes(key) ? first(x) : -1;
    if (key.startsWith('W:')) {
      // The opening word, at the head of the member or of its last few words: “He had no money, no friends, no hope”.
      for (let i = x.w.length - 2; i >= 0 && x.w.length - i <= 5; i--) if (norm(x.w[i]!) === key.slice(2)) return x.w[i]!;
      return shape(x).includes(key) ? first(x) : -1;
    }
    if (key.startsWith('V:')) {
      for (let i = x.w.length - 1; i >= 1; i--) if (c(x.w[i]!) === 'V' && past(tag(x.w[i]!)) === key.slice(2)) return x.w.length - i <= 8 && /^(?:PPSS?|NP|NN|NNS)/.test(tag(x.w[i - 1]!)) ? x.w[i]! : -1;
      return -1;
    }
    return tag(last(x)) === key.slice(2) && !EMPTY.has(norm(last(x))) ? last(x) : -1;
  };

  for (const xs of sentOf.values()) {
    // Asyndeton: three members built alike, none led by a joining word, and the series closed by a full stop.
    for (let a = 0; a + 2 < xs.length; a++) {
      for (const key of shape(xs[a + 1]!)) {
        const from = tail(xs[a]!, key);
        if (from < 0) continue;
        let b = a + 1;
        while (b + 1 < xs.length && shape(xs[b + 1]!).includes(key) && !xs[b + 1]!.led) b++;
        const run = xs.slice(a, b + 1);
        if (run.length < 3 || run.slice(1).some((x) => x.led) || run.slice(0, -1).some((x) => x.stop !== ',' && x.stop !== ';')) continue;
        // The series must close there: after a comma the sentence goes on, and the list may too.
        if (run[run.length - 1]!.stop === ',' || run.some((x) => x.w.length > 9)) continue;
        // “Our moms, our wives, our daughters and our sons”: the last two are joined after all.
        const end = run[run.length - 1]!;
        if (key.startsWith('W:') && end.w.some((k, i) => i > 0 && /^(?:and|or)$/.test(norm(k)) && norm(end.w[i + 1] ?? -1) === key.slice(2))) continue;
        // The same words said again are another figure.
        if (new Set(run.map((x) => x.w.map(norm).join(' '))).size < run.length) continue;
        if (key.startsWith('1:') && new Set(run.map((x) => norm(last(x)))).size < run.length) continue;
        span('asyndeton', from, last(run[run.length - 1]!));
        // Climax: the same series, each member longer than the one before.
        const size = run.map((x, i) => (i ? x.w : x.w.slice(x.w.indexOf(from))).reduce((n, k) => n + syllables(norm(k)), 0));
        if (size.every((n, i) => !i || n > size[i - 1]!) && size[size.length - 1]! >= size[0]! + 2) span('climax', from, last(run[run.length - 1]!));
        a = b;
        break;
      }
    }

    // Chiasmus: two terms, then the same two turned about, with a joint between the halves.
    const ws: number[] = [];
    for (let k = first(xs[0]!); k <= last(xs[xs.length - 1]!); k++) if (isWord(k)) ws.push(k);
    const keyed = ws.map((k, i) => ({ k, i, key: content(k) ? base(k) : '' })).filter((x) => x.key);
    chi: for (let i = 0; i < keyed.length; i++) {
      for (let l = i + 3; l < keyed.length; l++) {
        const A = keyed[i]!;
        const A2 = keyed[l]!;
        if (A.key !== A2.key || A2.i - A.i > 16) continue;
        for (let j = i + 1; j < l - 1; j++) {
          const B = keyed[j]!;
          const B2 = keyed[j + 1]!;
          if (B.key === A.key || B.key !== B2.key || B.i - A.i > 5 || A2.i - B2.i > 5 || B2.i - B.i < 1) continue;
          // The joint: a stop, or a joining word, between the two inner terms.
          const between = toks.slice(B.k + 1, B2.k);
          if (!between.some((t) => (t.kind === 'punct' && /^[,;:—]$/.test(t.norm)) || /^(?:and|but|or|nor|than|not|yet|while)$/.test(t.norm))) continue;
          // “Will explain itself and will explain your other actions”: the same helping verb before both is one clause
          // said twice, not a turn.
          if (/^(?:MD|BE|HV|DO|TO)/.test(tag(B.k - 1)) && norm(B.k - 1) === norm(B2.k - 1)) continue;
          // No stop inside either half.
          const half = (a: number, b: number) => !toks.slice(a + 1, b).some((t) => t.kind === 'punct' && t.norm !== '"');
          if (!half(A.k, B.k) || !half(B2.k, A2.k)) continue;
          // The terms are two things, not one name (“Lady Catherine … Catherine”).
          if (proper(A.k) || proper(B.k) || proper(B2.k) || proper(A2.k)) continue;
          // The second half closes on its term: “and the cakes of my mother went before her” runs on.
          let after = A2.k + 1;
          while (after < toks.length && toks[after]!.kind !== 'punct' && !content(after)) after++;
          if (after < toks.length && toks[after]!.kind !== 'punct') continue;
          span('chiasmus', A.k, A2.k);
          break chi;
        }
      }
    }

    // Polyptoton: one root in two forms within a few words, the forms of different kinds (“judge”, “judged”).
    poly: for (let i = 0; i < keyed.length; i++) {
      const a = keyed[i]!;
      const wa = norm(a.k);
      if (wa.length < 4 || proper(a.k)) continue;
      for (let j = i + 1; j < keyed.length && keyed[j]!.i - a.i <= 7; j++) {
        const b = keyed[j]!;
        const wb = norm(b.k);
        if (wb.length < 4 || wa === wb || wa.slice(0, 3) !== wb.slice(0, 3) || proper(b.k)) continue;
        // A capital inside the sentence is a name or a title: “General Halleck … generally”.
        if ([a.k, b.k].some((k) => k > ws[0]! && /^\p{Lu}/u.test(toks[k]!.text))) continue;
        // Different kinds of word: a noun and a verb, a verb and its participle. A plural or a tense is the same form.
        if (c(a.k) === c(b.k)) continue;
        const ra = rootsOf(m, wa);
        const rb = rootsOf(m, wb);
        const shared = [...ra].filter((r) => rb.has(r));
        if (!shared.length || shared.every((r) => DULL_ROOTS.has(r))) continue;
        // Where one is only the other with an ending (“working … work”), the plain one must be a noun by its place
        // (“that smile”, “the boat”), or the two a verb and its passive.
        const turned = (k: number) => /^VBN/.test(tag(k)) && (/^(?:AT|DT|PP\$)/.test(tag(k - 1)) || [k - 1, k - 2, k - 3].some((p) => /^BE/.test(tag(p)) && !toks.slice(p, k).some((t) => t.kind === 'punct')));
        const [short, long, sk, lk] = wa.length <= wb.length ? [wa, wb, a.k, b.k] : [wb, wa, b.k, a.k];
        const ending = long.startsWith(short) && /^(?:ing|ed|d|s|es|t)$/.test(long.slice(short.length));
        if (ending && !/^(?:AT|DT|PP\$|JJ|CD|AP)/.test(tag(sk - 1)) && !turned(lk)) continue;
        // “Vague … vaguer” is one word compared.
        if (/^JJ[RT]/.test(tag(a.k)) || /^JJ[RT]/.test(tag(b.k)) || (/^(?:JJ|RB)/.test(tag(sk)) && long.startsWith(short) && /^(?:e?r|e?st)$/.test(long.slice(short.length)))) continue;
        // One verb in two tenses (“would happen … had happened”) is the same form. A verb and its passive (“help …
        // be helped”) or its participle used as a name (“expect the expected”) are two.
        if (/^VB/.test(tag(a.k)) && /^VB/.test(tag(b.k))) {
          if (turned(a.k) === turned(b.k) || /^VBG/.test(tag(a.k)) || /^VBG/.test(tag(b.k))) continue;
        }
        span('polyptoton', a.k, b.k);
        break poly;
      }
    }

    // Alliteration: three content words running that open on one consonant sound, with at most a small word between.
    {
      let run: number[] = [];
      let sound = '';
      let gap = 0;
      const flush = () => {
        if (run.length >= 3) span('alliteration', run[0]!, run[run.length - 1]!);
        run = [];
        sound = '';
        gap = 0;
      };
      const a0 = first(xs[0]!) - (xs[0]!.led ? 1 : 0);
      const b0 = last(xs[xs.length - 1]!);
      for (let k = a0; k <= b0; k++) {
        const t = toks[k]!;
        if (t.kind === 'punct') {
          flush();
          continue;
        }
        const heavy = t.kind === 'word' && content(k) && !/n't$/.test(t.norm) && !/^(?:MD|BE|HV|DO)/.test(tag(k)) && (c(k) !== 'R' || /ly$/.test(t.norm)) && !proper(k) && !/^\p{Lu}/u.test(t.text.slice(k === a0 ? 1 : 0));
        if (!heavy) {
          if (++gap > 1 || t.kind !== 'word' || proper(k)) flush();
          continue;
        }
        const s = onset(t.norm);
        if (s && s === sound) {
          // The same word again is repetition, not alliteration.
          if (!run.some((r) => norm(r).slice(0, 4) === t.norm.slice(0, 4))) run.push(k);
        } else {
          flush();
          if (s) {
            run = [k];
            sound = s;
          }
        }
        gap = 0;
      }
      flush();
    }

    // Periodic sentence: two members or more that hang on what follows, and the main clause last.
    if (xs.length >= 3 && xs[xs.length - 1]!.stop === '.' && xs.slice(0, -1).every((x) => x.stop === ',')) {
      const main = xs[xs.length - 1]!;
      const lead = xs.slice(0, -1);
      const o = first(main);
      const subject = /^(?:PPSS?|AT|PP\$|NP|NNS?|DT|EX|CD|PN|ABN|AP)/.test(tag(o)) && !HANGS.test(norm(o));
      const finite = (x: Colon) => x.w.filter((k) => FINITE.test(tag(k)) && !(/^(?:VB|DO|HV)$/.test(tag(k)) && [k - 1, k - 2].some((p) => /^(?:MD|TO|DO)/.test(tag(p)))));
      // A member that opens on “when”, “if”, “in”, “having”, and holds no clause of its own beside: “When she was
      // tired she came out” is a whole sentence, and so is “In a few minutes he reached it”.
      const opens = (x: Colon) => {
        const w = norm(first(x));
        if (!HANGS.test(w) && !/^VB[GN]$/.test(tag(first(x)))) return false;
        const joins = (a: number, b: number) => toks.slice(a + 1, b).some((t, i) => (/^(?:CS|W)/.test(tag(a + 1 + i)) && t.norm !== 'but') || /^(?:and|or|nor|that)$/.test(t.norm));
        const fs = finite(x);
        // A pronoun after a noun, with its verb, begins a new clause: “in the water she came out”.
        if (x.w.some((k, i) => i >= 2 && /^PPSS?$/.test(tag(k)) && /^(?:NN|NP|JJ|RB)/.test(tag(k - 1)) && x.w[i - 1] === k - 1 && FINITE.test(tag(k + 1)))) return false;
        if (ONLY_PREP.test(w) && fs.length && !joins(first(x), fs[0]!)) return false;
        return fs.every((k, i) => i === 0 || joins(fs[i - 1]!, k));
      };
      // After a member that hangs: one led by “and” or “or”, a relative clause, or words with no verb of their own.
      const hangs = (x: Colon, i: number) => opens(x) || (i > 0 && (x.led ? /^(?:and|or|nor)$/.test(x.led) && finite(x).length <= 1 : /^W/.test(tag(first(x))) || !finite(x).length));
      const inner = /^(?:because|when|while|which|who|whom|although|though|if|until|since|where|as|that|than|before|after|but)$/;
      const leadWords = lead.reduce((n, x) => n + x.w.length, 0);
      if (
        subject &&
        !main.led &&
        finite(main).length > 0 &&
        main.w.length >= 3 &&
        main.w.length <= 12 &&
        !main.w.some((k) => inner.test(norm(k))) &&
        opens(lead[0]!) &&
        lead.every(hangs) &&
        !lead.some((x) => /^(?:but|yet)$/.test(norm(first(x)))) &&
        lead.filter((x, i) => x.w.length >= 3 && (opens(x) || (i > 0 && !!x.led))).length >= 2 &&
        leadWords >= 8 &&
        leadWords >= main.w.length &&
        !inSpeech(toks[first(xs[0]!)]!.start)
      )
        span('periodic', first(xs[0]!) - (xs[0]!.led ? 1 : 0), last(main));
    }
  }

  // Across members and sentences: epistrophe, anadiplosis, isocolon.
  for (let a = 0; a < cs.length; a++) {
    const x = cs[a]!;
    const e = last(x);
    // Epistrophe: three members running that close on one word; or two that close on the same three words.
    if (content(e) && x.w.length >= 2) {
      let b = a;
      while (b + 1 < cs.length && norm(last(cs[b + 1]!)) === norm(e) && cs[b + 1]!.w.length >= 2) b++;
      const run = cs.slice(a, b + 1);
      // Not the same words over again: “on a balcony—on a balcony”.
      const said = run.map((y) => y.w.map(norm).join(' '));
      const distinct = new Set(said).size === run.length && !said.some((t, i) => i > 0 && (` ${said[i - 1]!}`.endsWith(` ${t}`) || ` ${t}`.endsWith(` ${said[i - 1]!}`)));
      const back = (y: Colon, i: number) => norm(y.w[y.w.length - i] ?? -1);
      const twoWords = run.length === 2 && run.every((y) => y.w.length >= 4 && y.w.length <= 8) && back(run[0]!, 2) === back(run[1]!, 2) && back(run[0]!, 3) === back(run[1]!, 3);
      // Not a name called twice (“Come, Jane; sit, Jane”), and not the same words over again.
      if (distinct && !proper(e) && (run.length >= 3 || twoWords) && !(a > 0 && norm(last(cs[a - 1]!)) === norm(e))) span('epistrophe', first(run[0]!), last(run[run.length - 1]!));
    }
    const y = cs[a + 1];
    if (!y) continue;
    // Anadiplosis: the member opens on the word the last one closed on.
    if (content(e) && !proper(e) && x.w.length >= 3) {
      let o = 0;
      while (o < y.w.length - 1 && /^(?:the|a|an|this|that|such)$/.test(norm(y.w[o]!))) o++;
      const k = y.w[o]!;
      if (norm(k) === norm(e) && y.w.length - o >= 3 && norm(first(x)) !== norm(e) && (/^[NJ]$/.test(c(k)) || /^[NJ]$/.test(c(e))) && !/^\p{Lu}/u.test(toks[e]!.text)) span('anadiplosis', e, k);
    }
    // Isocolon: two clauses running of the same length and the same build, word for word.
    const n = x.w.length;
    if (n >= 3 && n <= 10 && y.w.length === n && /^[,;:.]$/.test(x.stop)) {
      const build = (k: number) => c(k) || norm(k);
      const same = x.w.every((k, i) => build(k) === build(y.w[i]!));
      const verbs = (z: Colon) => z.w.some((k) => FINITE.test(tag(k)));
      const differ = x.w.filter((k, i) => norm(k) !== norm(y.w[i]!)).length;
      // Clauses, each with its verb; different in two words at least, and alike in one.
      if (same && verbs(x) && verbs(y) && differ >= 2 && differ < n) span('isocolon', first(x), last(y));
    }
  }

  // Questions: the rhetorical question, and the question the writer answers (hypophora).
  const sents = sentences(text, toks);
  sents.forEach((s, i) => {
    let e = s.to - 1;
    while (e > s.from && toks[e]!.kind === 'punct' && toks[e]!.norm !== '?' && !/^[.!…]$/.test(toks[e]!.norm)) e--;
    if (toks[e]?.norm !== '?') return;
    const q = text.slice(s.start, toks[e]!.end);
    const qWords = toks.slice(s.from, e).filter((t) => t.kind === 'word');
    if (qWords.length < 3 && !sents[i + 1] && !opts.next) return;
    // The answer: the next sentence, said by the same voice.
    const nx = sents[i + 1];
    const answer = nx ? text.slice(nx.start, nx.end) : (opts.next ?? '');
    const sameVoice = nx ? inSpeech(s.start) === inSpeech(nx.start) && !/[“”]/.test(text.slice(toks[e]!.end, nx.start + 1)) : !inSpeech(s.start) && !/^\s*[“"]/.test(answer);
    const bare = answer.replace(/^[\s“"]+/, '');
    const you = /\b(?:you|your|ye|thou|thy)\b/i.test(q);
    if (answer && sameVoice && !you && !/\?[”"’]?\s*$/.test(answer) && qWords.length >= 2) {
      const wh = /^(?:(?:and|but|now|so|then|yet|for|well)[,]?\s+)?(?:what|why|who|whom|whose|how|where|when|whence|wherefore|which)\b/i.test(q.replace(/^[\s“"]+/, ''));
      const aToks = tokenize(bare).filter((t) => t.kind === 'word');
      // The question's own clause, up to its first comma: a word from a clause hung on it is no echo.
      const comma = toks.slice(s.from, e).findIndex((t, i) => i > 3 && t.norm === ',');
      const head = comma < 0 ? qWords : toks.slice(s.from, s.from + comma).filter((t) => t.kind === 'word');
      const qKeys = new Set(head.filter((t) => !EMPTY.has(t.norm) && t.norm.length > 3).map((t) => m.wn.lemmas(t.norm, 'v')[0] ?? m.wn.lemmas(t.norm, 'n')[0] ?? t.norm));
      // A word of the question in the first words of an answer that opens on a pronoun (“What did he want? He wanted
      // money.”), or a phrase with no verb that opens as a place or a thing does (“In the forest.”, “A man.”).
      const aTags = m.tagger.tagTokens(tokenize(bare));
      const fragment = qWords.length >= 4 && aToks.length <= 5 && /^(?:a|an|the|in|on|at|by|to|for|from|with)$/.test(aToks[0]?.norm ?? '') && /\.[”"]?\s*$/.test(bare) && !aTags.some((t) => /^(?:VB|BE|HV|DO|MD|PPS)|\+/.test(t)) && !/^\P{Ll}+$/u.test(bare);
      const starts = /^(?:he|she|it|they|we|i)$/.test(aToks[0]?.norm ?? '');
      const echoes = starts && aToks.slice(0, 4).some((t) => !EMPTY.has(t.norm) && t.norm.length > 3 && qKeys.has(m.wn.lemmas(t.norm, 'v')[0] ?? m.wn.lemmas(t.norm, 'n')[0] ?? t.norm));
      if (ANSWERS.test(bare) || (wh && (echoes || fragment))) {
        out.push(fig('hypophora', s.start, nx ? nx.end : toks[e]!.end, text));
        return;
      }
    }
    // A question put to “you” asks the reader, or the person written to, for an answer.
    if (!you && RHETORICAL.test(q.replace(/^[\s“"]+/, ''))) out.push(fig('rhetoricalquestion', s.start, toks[e]!.end, text));
  });

  // Simile: “like a drowned rat”, “as cold as ice”, “pale as death”. The thing likened to is a kind (“a rat”,
  // “ice”), never this one or that (“like her mother”, “as tall as John”).
  const kindAt = (k: number): number => {
    // The end of a noun phrase that names a kind, starting at k; -1 if there is none.
    let j = k;
    const article = norm(j) === 'a' || norm(j) === 'an';
    if (article) j++;
    let mods = 0;
    while (mods < 3 && isWord(j) && /^(?:JJ|VBG|VBN|RB|QL)/.test(tag(j)) && isWord(j + 1)) (j++, mods++);
    if (!isWord(j) || !/^NNS?$/.test(tag(j)) || proper(j)) return -1;
    while (isWord(j + 1) && /^NNS?$/.test(tag(j + 1)) && toks[j + 1]!.start === toks[j]!.end + 1) j++;
    if (!article && (tag(j) === 'NN' ? mods > 1 : false)) return -1;
    if (NO_PICTURE.has(norm(j)) || EMPTY.has(norm(j))) return -1;
    return j;
  };
  for (let k = 1; k < toks.length; k++) {
    if (!isWord(k)) continue;
    const prev = isWord(k - 1) ? norm(k - 1) : '';
    if (norm(k) === 'like' && !/^VB/.test(tag(k)) && !/^(?:MD|TO|PPSS)/.test(tag(k - 1)) && !LIKE_NO.has(prev) && !/(?:'d|n't)$/.test(prev)) {
      const e = kindAt(k + 1);
      // “Looks like a good plan” is a guess and “smells like soap” a report, not a likeness. Without “a”, the noun
      // must follow a verb of doing: “ran like rabbits”, never “things like education”.
      const bare = norm(k + 1) !== 'a' && norm(k + 1) !== 'an';
      const senses = /^(?:look|looks|looked|looking|seem|seems|seemed|sound|sounds|sounded|smell|smells|smelled|smelt|taste|tastes|tasted)$/;
      if (e > 0 && !senses.test(prev) && !senses.test(norm(k - 2)) && !/^(?:that|who|which)$/.test(norm(e + 1)) && (!bare || (/^(?:VB|RB)/.test(tag(k - 1)) && isWord(k - 1) && !/^(?:somewhat|very|much|more|most|so|too|not)$/.test(prev)))) span('simile', k, e);
    } else if (norm(k) === 'as' && isWord(k + 1) && norm(k + 2) === 'as' && /^(?:JJ|RB)$/.test(tag(k + 1)) && !AS_NO.has(norm(k + 1)) && !/^(?:not|twice|half|times|nearly|almost|just|quite)$/.test(prev) && !/n't$/.test(prev)) {
      const e = kindAt(k + 3);
      if (e > 0 && !/^(?:MD|BE|HV|DO|VB)/.test(tag(e + 1))) span('simile', k, e);
    } else if (norm(k) === 'as' && /^JJ$/.test(tag(k - 1)) && !AS_NO.has(prev) && norm(k - 2) !== 'as' && norm(k - 2) !== 'so' && isWord(k + 1) && tag(k + 1) === 'NN' && !proper(k + 1) && !NO_PICTURE.has(norm(k + 1)) && !isWord(k + 2)) {
      span('simile', k - 1, k + 1);
    }
  }

  // Set forms, read from the words alone.
  const each = (r: RegExp, term: string, ok: (x: RegExpExecArray) => boolean = () => true, group = 0) => {
    const g = new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g');
    let x: RegExpExecArray | null;
    while ((x = g.exec(text))) {
      if (x[0].length === 0) g.lastIndex++;
      if (!ok(x)) continue;
      const at = group ? x.index + x[0].indexOf(x[group]!) : x.index;
      out.push(fig(term, at, at + (group ? x[group]!.length : x[0].length), text));
    }
  };
  // Epanorthosis: a word taken back and a better one put in its place.
  each(/[,;—(]\s*(or rather(?!\s+than\b)|nay,? (?:even|more|rather)\b|nay(?=[,;—]\s*(?!then\b|come\b|sir\b|but\b)\p{Ll})|or,? (?:to speak|speaking) more (?:properly|truly|correctly|exactly|justly|accurately|plainly|strictly)|or,? more (?:properly|truly|correctly|exactly|accurately|strictly)(?: speaking)?|I should (?:rather )?say(?=[,;—)]|\s+(?:a|an|the)\b)|or,? (?:let me|I should|shall I|should I) (?:rather )?say|or,? to (?:speak|say) (?:the truth|more truly|more properly))/u, 'epanorthosis', (x) => /\p{L}/u.test(text.slice(0, x.index)) && !/\b(?:nay|yea)\s*$/i.test(text.slice(0, x.index)), 1);
  // Apostrophe: “O Death,”, “Ye hills,”: a thing, an idea or a place called on as if it could hear. The head is a
  // noun that names no person, and the sentence speaks to it (“thy”, “ye”), so “O cursed spite!” is only a cry.
  const thing = (k: number) => {
    const h = norm(k);
    if (!/^N[NP]/.test(tag(k)) || ADDRESSED.has(h) || ADDRESSED.has(h.replace(/s$/, '')) || /^(?:majesty|highness|grace|excellency|lordship|ladyship|worship|honou?r|reverence)$/.test(h)) return false;
    // “O woe!” and “O horror!” are cries.
    if (/^(?:woe|horror|misery|joy|wonder|scorn|spite|mercy|pity|shame|hell|torment|heaven|heavens)$/.test(h)) return false;
    if (EMPTY.has(h)) return false;
    const lemma = m.wn.lemmas(h, 'n')[0];
    const senses = lemma ? m.wn.senses(lemma, 'n') : [];
    if (!senses.length) return false;
    // By its commonest sense: nothing that lives. “Ye serpents” is said to people. A capital brings in every
    // sense: “O Job” is the man, whatever else a job is.
    const cap = /^\p{Lu}\p{Ll}/u.test(toks[k]!.text);
    let at: string[] = cap ? senses : [senses[0]!];
    for (let depth = 0; depth < 14 && at.length; depth++) {
      const next: string[] = [];
      for (const id of at) {
        const syn = m.wn.synset(id);
        if (!syn) continue;
        if (syn.words.some((w) => /^(?:person|animal|organism|living_thing|deity|spiritual_being)$/.test(w))) return false;
        next.push(...(syn.rels['@'] ?? []), ...(syn.rels['@i'] ?? []));
      }
      at = next.slice(0, 24);
    }
    // A name (“O Henry”, “O Job”) is a person unless the dictionary knows it first as a place: “O Zion”.
    return !/^NP/.test(tag(k)) || !!(m.wn.synset(senses[0]!)?.rels['@i'] ?? []).length;
  };
  sents.forEach((s) => {
    const spoken = /\b(?:thou|thee|thy|thine|ye|you|your)\b/i;
    for (let k = s.from; k < s.to; k++) {
      const o = toks[k]!.text === 'O';
      const ye = (k === s.from || (toks[k - 1]!.kind === 'punct' && /^[;!"]$/.test(toks[k - 1]!.norm))) && /^(?:Ye|Thou)$/.test(toks[k]!.text);
      if (!o && !ye) continue;
      let j = k + 1;
      const called = o && /^(?:thou|ye)$/.test(norm(j));
      if (o && /^(?:thou|ye|my|thy)$/.test(norm(j))) j++;
      let mods = 0;
      while (mods < 2 && isWord(j) && /^(?:JJ|VBN|VBG|QL|RB)/.test(tag(j)) && isWord(j + 1)) (j++, mods++);
      // “Thou art…” is a statement: “art” is no noun there.
      if (ye && /^(?:art|hast|shalt|wilt|dost|canst|wast|wert|didst|mayst|must|know|are|have|shall|will|do|see)$/.test(norm(j))) continue;
      if (!isWord(j) || !thing(j) || !(toks[j + 1]?.kind === 'punct' && /^[,!]$/.test(toks[j + 1]!.norm))) continue;
      // The sentence speaks to it: “thy” or “thou” after the name, or before it where the name sits between commas
      // (“Woe to thee, O land, when…”). “O scorn!” after words to someone else is only a cry.
      const set = toks[k - 1]?.norm === ',' && toks[j + 1]!.norm === ',';
      if (ye || called || spoken.test(text.slice(toks[j]!.end, s.end)) || (set && spoken.test(text.slice(s.start, toks[k]!.start)))) span('apostrophe', k, j);
    }
  });
  return out;
}

/** The figures no form finds: named by the writer of a rewrite (rewrite.ts), so no pack looks for their examples. */
export const NAMED_ONLY = new Set(['metaphor', 'personification', 'metonymy', 'synecdoche', 'zeugma', 'oxymoron']);

/** Every figure in a passage, in order, as found by form. */
export function findFigures(m: AuthorModel, raw: string, opts: { letter?: boolean; spoken?: boolean; /** The sentence that follows, where a figure needs it: a question's answer. */ next?: string } = {}): Figure[] {
  const text = curly(raw);
  const toks = tokenize(text);
  const tags = m.tagger.tagTokens(toks);
  const out: Figure[] = [...litotes(m, text, toks, tags)];
  const speech = quotedSpans(text);
  const inSpeech = (i: number) => speech.some(([a, b]) => i >= a && i < b);
  out.push(...formFigures(m, text, toks, tags, inSpeech, opts));
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
  litotes: /\b(?:not|no|cannot)\b|n[’']t\b|\bfar from\b/i,
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
  asyndeton: /[,;][^,;]+[,;]/,
  epistrophe: /([\p{L}’']{3,})[,;:.!?—][^,;:.!?—]*\s\1[,;:.!?—]/iu,
  anadiplosis: /\b([\p{L}’']{3,})[,;:.!?—]+\s+(?:(?:and|but|or|nor|yet|the|a|an|this|that|such)\s+){0,2}\1\b/iu,
  isocolon: /[,;:]/,
  rhetoricalquestion: /\?/,
  hypophora: /\?[”’]?\s+\S/,
  climax: /[,;][^,;]+[,;]/,
  periodic: /^\W*(?:when|whenever|if|though|although|as|since|while|whilst|after|before|because|unless|until|till|whether|where|wherever|once|having|being|with|without|in|on|at|by|from|for|to|upon|under|over|through|amid|amidst|among|despite|notwithstanding|during|against|\p{L}+(?:ing|ed))\b[^,]*,[^,]+,/iu,
  apostrophe: /\bO\s|(?:^|[;!“]\s*)(?:Ye|Thou)\s/,
  simile: /\blike\b|\bas\b/i,
  epanorthosis: /\bor rather\b|\bnay\b|I should (?:rather )?say|more (?:properly|truly|correctly|exactly|justly|accurately|plainly|strictly)|\bor,? (?:let me|I should|shall I|should I|to (?:speak|say))/i,
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
