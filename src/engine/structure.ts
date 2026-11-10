// How a piece is built, read without a language model: what kind of writing it is (argument, story, letter, speech,
// essay or review), what job each paragraph does in it (claim, reason, scene, close), and, over an author's corpus,
// the order that author usually puts those jobs in. Everything here is cue words and position, so it runs in
// milliseconds and says "part" where it cannot tell.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { sentences as splitSentences, tokenize } from '../nlp/tokenize.ts';
import { blocksOfText, type DocBlock } from './doc.ts';

export type Kind = 'argument' | 'story' | 'letter' | 'speech' | 'essay' | 'review';
export const KINDS: Kind[] = ['argument', 'story', 'letter', 'speech', 'essay', 'review'];

export type Role =
  | 'claim' | 'reason' | 'evidence' | 'objection' | 'answer' | 'call' | 'stakes'
  | 'scene' | 'turn' | 'feeling' | 'verdict'
  | 'greeting' | 'news' | 'request' | 'close'
  | 'part';

/** The roles each kind of writing is read for. A speech, an essay and a review are read as arguments, with a
 * speech's greeting and close. */
export const ROLES_BY_KIND: Record<Kind, Role[]> = {
  argument: ['claim', 'reason', 'evidence', 'objection', 'answer', 'call', 'stakes'],
  story: ['scene', 'turn', 'feeling', 'verdict'],
  letter: ['greeting', 'news', 'request', 'close'],
  speech: ['greeting', 'claim', 'reason', 'evidence', 'objection', 'answer', 'call', 'stakes', 'close'],
  essay: ['claim', 'reason', 'evidence', 'objection', 'answer', 'call', 'stakes'],
  review: ['claim', 'reason', 'evidence', 'objection', 'answer', 'call', 'stakes'],
};

export interface RoleInfo {
  name: string;
  definition: string;
  /** How a signature says a piece begins with this role: "begins from something that happened". */
  opens: string;
  /** How a signature says what follows: "says what it all means". */
  then: string;
}

/** A plain definition of every role, from roles.json beside this file. */
export const ROLES: Record<Role, RoleInfo> = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'roles.json'), 'utf8'));

/** Below this, a label is not shown: the paragraph or span is called "part". */
export const ROLE_THRESHOLD = 0.5;

export interface RoleSpan {
  role: Role;
  confidence: number;
  /** Sentences of the paragraph, [from, to). */
  from: number;
  to: number;
}

export interface ParagraphRoles {
  /** The paragraph's index in the list given. */
  paragraph: number;
  /** The role of the paragraph's surest span. */
  role: Role;
  confidence: number;
  /** The roles inside the paragraph in order: "Some people say… But… That is why…" is objection, answer, call. */
  spans: RoleSpan[];
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the text

interface Piece {
  title: string;
  paragraphs: string[];
}

function pieceOf(input: string | DocBlock[]): Piece {
  const blocks = typeof input === 'string' ? blocksOfText(input) : input;
  const title = blocks.find((b) => b.kind === 'title' || b.kind === 'heading')?.text ?? '';
  const paragraphs = blocks.filter((b) => b.kind === 'paragraph' || b.kind === 'quote' || b.kind === 'item').map((b) => b.text.trim()).filter(Boolean);
  return { title, paragraphs };
}

/** A paragraph's sentences as text. */
export function sentencesOf(paragraph: string): string[] {
  const toks = tokenize(paragraph);
  return splitSentences(paragraph, toks).map((s) => paragraph.slice(s.start, s.end).trim()).filter(Boolean);
}

const words = (s: string) => s.match(/[\p{L}\d][\p{L}\d'’]*/gu) ?? [];
const count = (re: RegExp, s: string) => (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;

// Letters: a salutation on a line of its own, a sign-off at the end. "Dear diary" opens a diary, not a letter.
const SALUTATION = /^(dear|my dear|dearest|to whom it may concern|hey|hi|hello|greetings)\b[^!?\n]{0,40}[,:!]?$/i;
const SIGN_OFF = /^(love|lots of love|all my love|yours|yours truly|yours sincerely|sincerely|best|best wishes|all the best|warmly|regards|kind regards|with love|affectionately|thanks|thank you|cheers|your friend|your son|your daughter|ever yours)\b[^.!?]{0,50}$/i;
const NAME_LINE = /^[\p{Lu}][\p{L}.'’-]*( [\p{Lu}][\p{L}.'’-]*){0,3}(, [^.!?]{1,30})?$/u;
const POSTSCRIPT = /^p\.?\s?s\.?\b/i;

const isSalutation = (p: string) => words(p).length <= 8 && SALUTATION.test(p.trim()) && !/^dear diary/i.test(p.trim());
const isSignOff = (p: string) => words(p).length <= 10 && (SIGN_OFF.test(p.trim()) || NAME_LINE.test(p.trim()));
const isPostscript = (p: string) => POSTSCRIPT.test(p.trim());

/** A letter opens with a salutation on its own ("Dear Mom and Dad,") or closes with a sign-off ("Love, Jake").
 * This extends the test in brief.ts with "To Whom It May Concern", "Hey team," and a bare name at the end. */
export function looksLikeLetter(paragraphs: string[]): boolean {
  const ps = paragraphs.filter(Boolean);
  if (ps.length < 2) return false;
  const tail = ps.slice(-3).filter((p) => !isPostscript(p));
  return isSalutation(ps[0]!) || tail.slice(-2).some(isSignOff);
}

const PAST = new Set(
  'was were had did said went got came saw took made told felt knew thought heard ran sat stood looked walked left found gave began asked called moved tried started turned wanted needed decided realized realised seemed kept stopped laughed cried smiled nodded yelled screamed grabbed threw caught won lost met paid drove woke slept ate drank fell hit opened closed noticed remembered forgot happened lived died wore bought brought sent wrote read'.split(' '),
);
const PRESENT = new Set("is are am has have does do can will should must isn't aren't don't doesn't can't won't it's that's there's they're we're you're i'm he's she's".split(' '));
const NOT_PAST_ED = new Set('need indeed red bed seed speed proceed succeed exceed feed hundred'.split(' '));

/** The share of tense-bearing words that are past: high in a story, low in an essay or an argument. */
function pastShare(text: string): number {
  let past = 0;
  let present = 0;
  for (const t of tokenize(text)) {
    if (t.kind !== 'word' || t.quoted) continue;
    const w = t.norm;
    if (PAST.has(w) || (w.length > 4 && w.endsWith('ed') && !NOT_PAST_ED.has(w))) past++;
    else if (PRESENT.has(w)) present++;
  }
  return past + present ? past / (past + present) : 0;
}

const MODAL = /\b(should|shouldn['’]t|must|ought to|need to|needs to|has to|have to)\b/i;
const ARGUE = /\b(first of all|firstly|secondly|thirdly|in conclusion|for (all )?these reasons|that is why|that['’]s why|this is why|some people (say|think|argue|believe)|others (say|argue)|my opponent|opponents?|bad idea|good idea|is wrong|i believe|i strongly)\b/gi;
const ESSAY = /\b(in conclusion|overall|the purpose|causes?|caused|represents?|symbol(ism|izes)?|the author|in the story|both (places|sides|have|are)|differen(t|ces)|similar(ities)?|summary|lecture|research|according to|experts?|for example|for instance|in addition|another (thing|reason)|in my opinion|the speaker)\b/gi;
const TIME = /\b(yesterday|last (night|week|weekend|year|summer)|that (night|day|morning)|the next (day|morning)|one day|after that|at (halftime|lunch|dinner)|by the time|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|around midnight|suddenly|finally|then)\b/gi;
const SPEECH_OPEN = /^(hi|hello|good (morning|afternoon|evening)),? (everyone|everybody|all|guys)\b|ladies and gentlemen|fellow (students|citizens|classmates|americans)|thank you all for coming/i;
const SPEECH_END = /\b(raise your glass(es)?|cheers!?|vote for|a vote for|thank you!|god bless|together,? we can)\b/i;
const STARS = /\b(\d(\.\d)?|one|two|three|four|five|ten) (out of (\d+|five|ten) )?stars?\b|\b(\d|ten)\/10\b/i;

export interface KindReading {
  kind: Kind;
  scores: Record<Kind, number>;
}

/** What kind of writing a text is, with the score each kind got. */
export function readKind(input: string | DocBlock[]): KindReading {
  const { title, paragraphs } = pieceOf(input);
  const s: Record<Kind, number> = { argument: 0, story: 0, letter: 0, speech: 0, essay: 1.5, review: 0 };
  if (!paragraphs.length) return { kind: 'essay', scores: s };
  const all = paragraphs.join('\n\n');
  const first = paragraphs[0]!;
  const last = paragraphs.filter((p) => !isPostscript(p)).at(-1) ?? first;
  const ends = [first, last].join(' ');

  // Letter: the frame decides it, whatever is inside.
  if (isSalutation(first)) s.letter += 4;
  if (paragraphs.length >= 2 && paragraphs.slice(-3).filter((p) => !isPostscript(p)).slice(-2).some(isSignOff)) s.letter += 4;
  if (paragraphs.some(isPostscript)) s.letter += 1;

  // Review: a title that says so, or stars.
  if (/\breview\b/i.test(title)) s.review += 5;
  if (STARS.test(all)) s.review += 3;
  if (/\bI would (definitely |highly )?recommend\b/i.test(all)) s.review += 1;

  // Speech: it greets a room and ends by asking it for something.
  if (SPEECH_OPEN.test(first)) s.speech += 3;
  if (SPEECH_END.test(last)) s.speech += 2;
  if (/\b(toast|speech|vote)\b/i.test(title)) s.speech += 1.5;

  // Argument: a "should" at the ends, signposts, the other side named.
  s.argument += Math.min(3, 1.5 * count(MODAL, ends));
  s.argument += Math.min(3, count(ARGUE, all));
  if (/\b(should|why|against|bad idea|good idea|rebuttal|ban(ned)?|must)\b/i.test(title)) s.argument += 2;

  // Story: told in the past, with time moving.
  // A history answer or a summary is told in the past too, but seldom by an "I" who was there.
  const past = pastShare(all);
  const witness = count(/\b(i|we|me|my|us|our)\b/i, all) >= 4;
  s.story += Math.max(0, past - 0.5) * (witness ? 10 : 6);
  s.story += Math.min(2, 0.4 * count(TIME, all));
  if (/[“"][^”"]{1,80}[”"],? (she|he|i|they) said|said[,:] [“"]/i.test(all)) s.story += 1;

  // Essay: the words of explaining, comparing and summing up.
  s.essay += Math.min(3, 0.7 * count(ESSAY, all));
  if (/\b(summary|analysis|conclusion|causes|report|statement|recipe)\b/i.test(title)) s.essay += 2.5;
  else if (/\b(life|and)\b/i.test(title)) s.essay += 1.5;
  if (/\([A-Z][a-z]+ \d+\)/.test(all)) s.essay += 1;

  let kind: Kind = 'essay';
  for (const k of KINDS) if (s[k] > s[kind]) kind = k;
  return { kind, scores: s };
}

/** argument, story, letter, speech, essay or review. */
export const detectKind = (input: string | DocBlock[]): Kind => readKind(input).kind;

// ---------------------------------------------------------------------------------------------------------------
// Roles

interface Cue {
  role: Role;
  confidence: number;
}

const ENUMERATOR = /^(first(ly)?|first of all|to begin with|second(ly)?|third(ly)?|fourth|also|another (reason|thing|problem)|in addition|additionally|moreover|furthermore|finally|plus|on top of that|besides)\b/i;
const OBJECTION = /^(some (people|students|parents|teachers|critics|say|might|may|argue|think|believe)|others? (say|argue|think|believe|might)|critics|opponents|my opponent|people (say|think|argue)|it is said|it['’]s true that|you (might|may) (say|think)|one (might|may|could) (say|argue)|of course,? some|many (people|believe|say)|[\p{Lu}][\p{L}]+ (say|says|argue|argues|claim|claims) )/iu;
const OBJECTION_ANY = /\b(my opponent (says|said|claims|argues)|they (say|said|claim|argue)|critics (say|argue))\b/i;
const ANSWER = /^(but|however|yet|still|even so|that is not|that['’]s not|this is not|that doesn['’]t|okay,? but|true,? but|while that|the problem is|in fact|actually)\b/i;
const CALL_LEAD = /^(that is why|that['’]s why|this is why|so|therefore|in conclusion|for (all )?these reasons|it is time|it['’]s time|together|remember|let us|let['’]s|please|vote|join|sign|ask)\b/i;
const CALL_WORD = /\b(should|must|need to|ought to|vote|let['’]s|it is time|it['’]s time|join us|sign up)\b/i;
const EVIDENCE = /\b(for example|for instance|according to|studies|a study|research(ers)? (show|shows|found|says)|scientists|experts|survey|statistics|percent)\b|\d+(\.\d+)?\s?%|\([A-Z][a-z]+,? \d+\)|[“"][^”"]{30,}[”"]/i;
const STAKES = /\b(at stake|matters because|it matters|what happens if|if we (don['’]t|do not|keep)|will (suffer|fall behind|lose|get worse|go down)|dangerous|in danger|the real issue|the cost of)\b/i;
const CLAIM_WORD = /\b(should|shouldn['’]t|must|ought|is wrong|are wrong|is right|bad idea|good idea|i believe|i think|i would give|is (one of )?the best|is (one of )?the worst|deserves?|worth it)\b/i;

const TURN = /^(then|suddenly|but then|all of a sudden|that['’]s when|that is when|one day|finally|until|just then|out of nowhere|without warning|it turns out|it turned out|later)\b|\b(suddenly|all of a sudden|it was just|turned out|that['’]s when)\b/i;
const FEELING = /\b(i|we|he|she|they) (felt|feel|was|were) (so |really |very |kind of |totally |a little |pretty )?(scared|afraid|sad|angry|mad|happy|nervous|embarrassed|relieved|stupid|lonely|excited|out of place|terrible|awful|guilty|proud|hurt|upset|furious|shocked|confused)\b|\b(wanted to cry|it (still )?hurt|my heart|tears|i panicked|basically panicked|cried)\b/i;
const VERDICT = /^(maybe|looking back|in the end|honestly|sometimes|anyway|i realized|i learned|now i know|it just shows|that['’]s when i knew|i will never forget|i['’]ll never forget)\b|\b(i realized|i learned|it just shows|i will never forget|the best day|the worst day|turn out to be|wrong about|was right about|taught me)\b/i;
const SCENE = /^(it was|there (was|were)|the [\p{L}]+ (was|were|is)|on [\p{Lu}]|last [\p{L}]+|when i|my [\p{L}]+ (and i|was|is)|our [\p{L}]+ (was|to)|[\p{Lu}][\p{L}]+ (texted|called|moved))/iu;

const REQUEST = /\b(can you|could you|would you|will you|please|i would like|i['’]d like|i am writing to (apply|ask|request)|i['’]m writing to (apply|ask)|i hope you (will|can|could)|i ask that|i would (love|appreciate)|i would be grateful)\b/i;
const CLOSE_LINE = /\b(thank you (so much |again )?(for your time|for everything|for reading|for listening|and)|i look forward to hearing|have a great|see you soon|miss you|write back|talk soon|thanks again)\b/i;

/** The cue in one sentence for the roles of a kind, judged by its words and its place in the piece. */
function cueOf(
  sentence: string,
  at: { kind: Kind; text: string; paragraph: number; paragraphs: number; tail: number; sentence: number; sentences: number; prev: Role | null },
): Cue | null {
  const s = sentence.trim();
  const firstOfPiece = at.paragraph === 0 && at.sentence === 0;
  const lastOfPiece = at.paragraph === at.paragraphs - 1 && at.sentence === at.sentences - 1;
  const inLast = at.paragraph === at.paragraphs - 1;

  if (at.kind === 'letter' || at.kind === 'speech') {
    if (at.paragraph === 0 && (isSalutation(at.text) || (at.sentence === 0 && SPEECH_OPEN.test(s)))) return { role: 'greeting', confidence: 0.9 };
    if (at.paragraph >= at.tail) return { role: 'close', confidence: 0.95 };
  }
  if (at.kind === 'letter') {
    if (inLast || at.paragraph >= at.paragraphs - 2) if (CLOSE_LINE.test(s)) return { role: 'close', confidence: 0.75 };
    if (REQUEST.test(s)) return { role: 'request', confidence: 0.8 };
    return { role: 'news', confidence: 0.55 };
  }
  if (at.kind === 'story') {
    if (VERDICT.test(s) && at.paragraph >= at.paragraphs - 2) return { role: 'verdict', confidence: 0.75 };
    if (FEELING.test(s)) return { role: 'feeling', confidence: 0.7 };
    if (TURN.test(s) && !firstOfPiece) return { role: 'turn', confidence: 0.7 };
    if (at.paragraph === 0) return { role: 'scene', confidence: SCENE.test(s) ? 0.75 : 0.6 };
    if (SCENE.test(s) && at.sentence === 0) return { role: 'scene', confidence: 0.55 };
    return null;
  }

  // Argument, speech, essay, review.
  if (at.kind === 'speech' && inLast && SPEECH_END.test(s) && /thank you!?$/i.test(s)) return { role: 'close', confidence: 0.8 };
  if (OBJECTION.test(s) || OBJECTION_ANY.test(s)) return { role: 'objection', confidence: 0.8 };
  if (at.prev === 'objection' && ANSWER.test(s)) return { role: 'answer', confidence: 0.8 };
  if (lastOfPiece && (CALL_LEAD.test(s) || CALL_WORD.test(s))) return { role: 'call', confidence: 0.8 };
  if (inLast && CALL_LEAD.test(s) && CALL_WORD.test(s)) return { role: 'call', confidence: 0.75 };
  if (firstOfPiece && CLAIM_WORD.test(s)) return { role: 'claim', confidence: 0.85 };
  if (ENUMERATOR.test(s)) return { role: 'reason', confidence: 0.8 };
  if (EVIDENCE.test(s)) return { role: 'evidence', confidence: 0.7 };
  if (STAKES.test(s)) return { role: 'stakes', confidence: 0.6 };
  if (at.paragraph === 0 && CLAIM_WORD.test(s)) return { role: 'claim', confidence: 0.7 };
  if (/\bbecause\b/i.test(s)) return { role: 'reason', confidence: 0.55 };
  return null;
}

/**
 * The role of each paragraph and of the spans within it. A sentence with a cue of its own begins a span; a sentence
 * with none, or with only a weak one, carries on the span before it. A span, or a paragraph, whose confidence is
 * below ROLE_THRESHOLD is labelled "part".
 */
export function labelRoles(paragraphs: string[], kind: Kind): ParagraphRoles[] {
  const paras = paragraphs.map((p) => p.trim()).filter(Boolean);
  // The sign-off and any postscript after it: "Love, Jake" and "P.S. Please don't let Max use my room."
  let tail = paras.length;
  if (kind === 'letter' || kind === 'speech') {
    while (tail > 1 && isPostscript(paras[tail - 1]!)) tail--;
    if (tail > 1 && isSignOff(paras[tail - 1]!)) tail--;
    else tail = paras.length;
  }
  let prev: Role | null = null;
  return paras.map((text, pi) => {
    const sents = pi === 0 && isSalutation(text) ? [text] : sentencesOf(text);
    const spans: RoleSpan[] = [];
    sents.forEach((s, si) => {
      const cue = cueOf(s, { kind, text, paragraph: pi, paragraphs: paras.length, tail, sentence: si, sentences: sents.length, prev });
      const cur = spans.at(-1);
      if (cue && (!cur || (cue.role !== cur.role && cue.confidence >= 0.6))) {
        spans.push({ role: cue.role, confidence: cue.confidence, from: si, to: si + 1 });
      } else if (cur) {
        cur.to = si + 1;
        if (cue?.role === cur.role) cur.confidence = Math.max(cur.confidence, cue.confidence);
      } else {
        spans.push({ role: 'part', confidence: 0, from: si, to: si + 1 });
      }
      prev = spans.at(-1)!.role;
    });
    for (const sp of spans) if (sp.confidence < ROLE_THRESHOLD) sp.role = 'part';
    // Two neighbouring spans of one role are one span.
    const merged: RoleSpan[] = [];
    for (const sp of spans) {
      const last = merged.at(-1);
      if (last && last.role === sp.role) {
        last.to = sp.to;
        last.confidence = Math.max(last.confidence, sp.confidence);
      } else merged.push({ ...sp });
    }
    if (!merged.length) merged.push({ role: 'part', confidence: 0, from: 0, to: 0 });
    // The paragraph's role is its surest span, the first of equals: a paragraph that opens with the claim is the claim's.
    const main = merged.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    return { paragraph: pi, role: main.role, confidence: main.confidence, spans: merged };
  });
}

/** The roles of a piece in reading order, span by span. */
export const roleSequence = (labels: ParagraphRoles[]): Role[] => labels.flatMap((p) => p.spans.map((s) => s.role));

/** The kind and the roles of a text in one call. */
export function readStructure(input: string | DocBlock[]): { kind: Kind; roles: ParagraphRoles[]; sequence: Role[] } {
  const kind = detectKind(input);
  const roles = labelRoles(pieceOf(input).paragraphs, kind);
  return { kind, roles, sequence: roleSequence(roles) };
}

/** A role sequence as the SHAPE line prints it: "Claim · Reason · Reason · Call". */
export const shapeLine = (seq: Role[]): string => seq.map((r) => ROLES[r].name).join(' · ');

// ---------------------------------------------------------------------------------------------------------------
// An author's usual order

/** What typicalOrder needs of a model: its corpus and the author's short name. AuthorModel has both. */
export interface CorpusModel {
  db: DatabaseSync;
  author: { short: string };
}

export interface TypicalOrder {
  kind: Kind;
  /** The commonest opening run of roles, at most three, repeats folded together. */
  order: Role[];
  /** How many of the passages read had that order. */
  support: number;
  passages: number;
  /** "Lincoln begins from something that happened, then says what it all means." */
  signature: string;
}

/** One sentence from a template: how the author begins, and what comes next. */
export function signatureOf(short: string, order: Role[]): string {
  const named = order.filter((r) => r !== 'part');
  if (!named.length) return `${short} follows no single order from one piece to the next.`;
  const [a, b] = named;
  return b ? `${short} ${ROLES[a!].opens}, then ${ROLES[b].then}.` : `${short} ${ROLES[a!].opens}.`;
}

/**
 * The order an author usually builds in, read over the corpus. Each chapter is a passage: its first `window`
 * paragraphs that are not dialogue are labelled, and repeats and "part" folded away. The commonest opening run
 * is the author's order. The kind is the commonest kind of the passages, unless given.
 */
export function typicalOrder(m: CorpusModel, opts: { kind?: Kind; window?: number; passages?: number } = {}): TypicalOrder {
  const window = opts.window ?? 8;
  const limit = opts.passages ?? 400;
  const chapters = m.db.prepare('SELECT id FROM chapters ORDER BY id').all() as { id: number }[];
  const step = Math.max(1, Math.floor(chapters.length / limit));
  const paraStmt = m.db.prepare('SELECT text FROM paragraphs WHERE chapter = ? AND dialogue < 0.5 AND words >= 3 ORDER BY ord LIMIT ?');
  const passages: string[][] = [];
  for (let i = 0; i < chapters.length && passages.length < limit; i += step) {
    const ps = (paraStmt.all(chapters[i]!.id, window) as { text: string }[]).map((r) => r.text);
    if (ps.length >= 2) passages.push(ps);
  }
  let kind = opts.kind;
  if (!kind) {
    const kinds = new Map<Kind, number>();
    for (const ps of passages) {
      const k = detectKind(ps.map((t) => ({ kind: 'paragraph' as const, text: t })));
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    kind = [...kinds].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'essay';
  }
  // Every opening run of one, two and three roles is counted. The longest run that at least one passage in twenty
  // opens with is the order: "scene, turn" says more than "scene" alone, if enough passages share it.
  const runs = new Map<string, number>();
  for (const ps of passages) {
    const seq: Role[] = [];
    for (const r of roleSequence(labelRoles(ps, kind))) if (r !== 'part' && seq.at(-1) !== r) seq.push(r);
    for (let n = 1; n <= Math.min(3, seq.length); n++) {
      const key = seq.slice(0, n).join(' ');
      runs.set(key, (runs.get(key) ?? 0) + 1);
    }
  }
  const ranked = [...runs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const floor = Math.max(2, passages.length / 20);
  const best = [3, 2, 1].map((n) => ranked.find(([k, c]) => k.split(' ').length === n && c >= floor)).find(Boolean) ?? ranked[0];
  const order = best ? (best[0].split(' ') as Role[]) : [];
  return { kind, order, support: best?.[1] ?? 0, passages: passages.length, signature: signatureOf(m.author.short, order) };
}
