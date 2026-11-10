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

/** Words that name a kind of thing so broadly they must be described to be known: the heads of periphrasis. */
const GENERIC = 'instrument|device|contrivance|machine|apparatus|article|implement|engine|vehicle|conveyance|establishment|receptacle|cord|line|band|object|thing';
/** Heads so common they make a periphrasis only with a clause that says what they are for. */
const COMMON = 'place|house|building|shop|room|person|personage|individual|creature|vessel|piece|means';

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

/** Litotes by principle: a negative before a word whose negative prefix, taken off, leaves a word of the author's. */
function litotes(m: AuthorModel, text: string, toks: Token[]): Figure[] {
  const out: Figure[] = [];
  const ws = toks.filter((t) => t.kind === 'word');
  for (let i = 0; i < ws.length; i++) {
    const neg = ws[i]!.norm;
    if (!['not', 'no', 'never', 'nor'].includes(neg)) continue;
    for (const w of ws.slice(i + 1, i + 4)) {
      const p = /^(un|in|im|il|ir|dis)(.{4,})$/.exec(w.norm);
      const small = ['small', 'little', 'slight', 'trifling', 'inconsiderable', 'mean'].includes(w.norm) && (neg === 'no' || neg === 'not');
      // The word and what is left of it both qualities in her usage (adjective, adverb, participle): “unwilling” and
      // “willing”, not “indeed” and “deed”.
      const quality = (x: string) => /^(JJ|RB|VBN|QL)/.test(m.usualTag(x) ?? '');
      if ((p && (m.word(p[2]!)?.count ?? 0) >= 3 && quality(w.norm) && quality(p[2]!)) || small) {
        out.push(fig('litotes', ws[i]!.start, w.end, text));
        break;
      }
    }
  }
  return out;
}

/** Every figure in a passage, in order, as found by form. */
export function findFigures(m: AuthorModel, raw: string, opts: { letter?: boolean; spoken?: boolean } = {}): Figure[] {
  const text = curly(raw);
  const toks = tokenize(text);
  const out: Figure[] = [...litotes(m, text, toks)];
  const speech = quotedSpans(text);
  const inSpeech = (i: number) => speech.some(([a, b]) => i >= a && i < b);
  const re = (r: RegExp, term: string, narrationOnly = false) => {
    let x: RegExpExecArray | null;
    const g = new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g');
    while ((x = g.exec(text))) {
      if (narrationOnly && inSpeech(x.index)) continue;
      out.push(fig(term, x.index, x.index + x[0].length, text));
      if (x[0].length === 0) g.lastIndex++;
    }
  };
  // Periphrasis: a generic head with what it does or holds.
  re(new RegExp(`\\b(?:the|a|an|some|this|that|his|her|my|their|our|your)\\s+(?:[a-z’-]+\\s+){0,2}(?:${GENERIC})s?\\s+(?:which|that|where|whereby|of|for|in|with|by|without|to)\\b[^,.;:!?—]{2,60}`, 'i'), 'periphrasis');
  // People named by what they do: “the persons set over us”.
  re(/\b(?:the|those|some)\s+(?:persons|people|gentlemen|ladies|personages|individuals)\s+(?:set|placed|put|charged|employed|appointed)\s+(?:over|with|to)\b[^,.;:!?—]{1,30}/i, 'periphrasis');
  re(new RegExp(`\\b(?:a|an|some|the)\\s+(?:[a-z’-]+\\s+){0,2}(?:${COMMON})\\s+(?:where|which|that|whereby)\\s+[^,.;:!?—]{2,50}?\\b(?:was|were|is|are|be|been)\\s+(?:served|sold|kept|made|done|given|used|held|taught|bought)\\b`, 'i'), 'periphrasis');
  // Generalization over the particular: the vehicle of an ironic verdict.
  re(/\b(?:it is a truth[^.;]*|as (?:is|was) (?:usual|often the case|common)[^,.;]*|as [a-z\s]{3,40}? (?:commonly|usually|always|generally|seldom|often) (?:does|do|is|are|will)\b|which is (?:the|a) (?:usual|common|general|ordinary) [^,.;]*|(?:every|no|a) (?:man|woman|young (?:man|lady|woman)|person|one|body)\b[^.;]{0,40}\b(?:is|must|cannot|can never|will|has|ought)\b[^,.;]*)/i, 'gnomic', true);
  // A deflating aside.
  re(/,\s+(?:which|and that|and this)\s+(?:was|is|were|had been)\s+(?:at least|perhaps|scarcely|hardly|no more than|only|after all|not quite|less|more)\b[^.;,]*/i, 'aside', true);
  // Antithesis.
  re(/\bnot\s+(?:[a-z’-]+\s+){0,4}[a-z’-]+,?\s+but\s+[^,.;]{2,40}|\b(?:less|more)\s+[a-z’-]+\s+than\s+[a-z’-]+|\brather\s+[a-z’-]+\s+than\s+[a-z’-]+/i, 'antithesis');
  // Parenthesis: an aside set in.
  re(/,\s+(?:I|she|he|we|they)\s+(?:believe|suppose|think|fancy|confess|own|declare|dare say|am sure|must say|grant)\s*,|—[^—]{3,60}—/, 'parenthesis');
  // Hyperbole.
  re(/\b(?:the\s+(?:most|very\s+\w+est|\w+est)\s+[^,.;]{0,40}\b(?:in|of)\s+(?:my|her|his|their|all)\s+(?:life|lives|days|existence|week|world)|never\s+in\s+(?:my|her|his)\s+life|a\s+(?:thousand|hundred|million)\s+times|beyond\s+all\s+(?:reason|measure|bounds|description))/i, 'hyperbole');

  // By sentence: free indirect discourse, polysyndeton, anaphora, tricolon, inversion.
  // Free indirect discourse belongs to prose narration: in a play or in verse a line ending “?” or “!” is speech.
  const prose = m.author.citeStyle !== 'play' && m.author.citeStyle !== 'verse';
  const tags = m.tagger.tagTokens(toks);
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
      // Three or more “and”s joining.
      const ands = words.filter((t) => t.norm === 'and').length;
      if (ands >= 3) out.push(fig('polysyndeton', s0, s1, text));
      // Clauses opening on the same word after a semicolon or a comma.
      const openers: string[] = [];
      seg.forEach((t, k) => {
        if (t.kind === 'punct' && (t.norm === ';' || t.norm === ',') && seg[k + 1]?.kind === 'word') openers.push(seg[k + 1]!.norm);
      });
      const first = words[0]!.norm;
      const counts = new Map<string, number>();
      for (const o of [first, ...openers]) counts.set(o, (counts.get(o) ?? 0) + 1);
      const rep = [...counts].find(([w, c]) => c >= 3 && !['and', 'the', 'a', 'but'].includes(w));
      if (rep) out.push(fig('anaphora', s0, s1, text));
      // Three like terms in a row: X, Y, and Z.
      for (let k = 0; k + 4 < seg.length; k++) {
        const a = seg[k]!;
        const c1 = seg[k + 1]!;
        const b = seg[k + 2]!;
        const c2 = seg[k + 3]!;
        let c = seg[k + 4]!;
        let j = k + 4;
        if (c.norm === 'and' || c.norm === 'or') c = seg[++j] ?? c;
        if (a.kind !== 'word' || b.kind !== 'word' || c.kind !== 'word' || c1.norm !== ',' || c2.norm !== ',') continue;
        if (!(seg[k + 4]!.norm === 'and' || seg[k + 4]!.norm === 'or')) continue;
        const cls = (t: string) => (t.startsWith('JJ') ? 'J' : t.startsWith('NN') ? 'N' : t.startsWith('VB') ? 'V' : t.startsWith('RB') ? 'R' : t);
        const ta = cls(segTags[k]!);
        if (cls(segTags[k + 2]!) === ta && cls(segTags[j]!) === ta && 'JNVR'.includes(ta)) {
          out.push(fig('tricolon', a.start, c.end, text));
          break;
        }
      }
      // An adjective, adverb or object put first, then the verb, then its subject.
      const w0 = seg.findIndex((t) => t.kind === 'word');
      // The fronted part: an adjective, adverb or qualifier, with the noun it qualifies if any.
      let k = w0;
      if (/^(JJ|RB|QL)/.test(segTags[k] ?? '')) {
        k++;
        while (/^(JJ|NN)/.test(segTags[k] ?? '') && k < w0 + 3) k++;
        // An auxiliary before its subject (“had Harriet”, “did they”): a lexical verb there is the ordinary order.
        if (/^(BEDZ|BED|BEZ|HVD|HVZ|DOD|DOZ|MD)/.test(segTags[k] ?? '') && /^(PPS|PPSS|NP|AT|PP\$)/.test(segTags[k + 1] ?? '') && words[0]!.norm !== 'so')
          out.push(fig('inversion', s0, s1, text));
      }
    }
    from = end + 1;
  }
  out.sort((a, b) => a.start - b.start || a.term.localeCompare(b.term));
  return out.filter((f, i) => !out.slice(0, i).some((g) => g.term === f.term && g.start <= f.start && g.end >= f.end));
}

/** The terms of the figures in a passage, once each. */
export const figureTerms = (m: AuthorModel, text: string) => [...new Set(findFigures(m, text).map((f) => f.term))];

/** Cheap signs of a figure, to sift the whole corpus before the detector confirms. */
const SIGNS: Record<string, RegExp> = {
  litotes: /\b(not|no|never)\s+(\w+\s+){0,2}(un|in|im|il|ir|dis)\w{4,}|\bno\s+(small|little|slight)/i,
  periphrasis: new RegExp(`\\b(${GENERIC}|${COMMON})\\s+(which|that|where|of|for|in|with|by)\\b`, 'i'),
  gnomic: /truth|as is usual|commonly|usually|always|generally|which is the (usual|common)|\b(every|no) (man|woman|young|person|one|body)\b/i,
  antithesis: /\bnot\b[^.]{1,30}\bbut\b|\b(less|more|rather)\s+\w+\s+than\b/i,
  tricolon: /\w+, \w+, (and|or) \w+/,
  hyperbole: /\b(most|never in|thousand|hundred times|beyond all)\b/i,
  inversion: /^\W*(scarcely|seldom|never|little|small|long|well|much)\s+\w+/i,
  anaphora: /;[^;]+;/,
  parenthesis: /, (I|she|he) (believe|suppose|think|fancy|confess|own|declare|dare say)|—[^—]{3,60}—/,
  polysyndeton: /\band\b.*\band\b.*\band\b/i,
  fid: /[!?]$/,
  aside: /, (which|and that|and this) (was|is|were|had been) (at least|perhaps|scarcely|hardly|no more than|only|after all)/i,
};

/** Whether a sentence bears the cheap sign of a figure: false, and the detector need not be run. */
export const mayShow = (term: string, text: string): boolean => !SIGNS[term] || SIGNS[term]!.test(text);

/**
 * Sentences of the author's that show a figure, nearest in meaning to a passage: the candidates nearest first, each
 * confirmed by the figure's own detector (so a link names a sentence that truly shows it). The voice's pack holds
 * them ready; without a pack the corpus is sifted (up to 3 s).
 */
export function figureExamples(m: AuthorModel, term: string, near: string, k = 3): import('./model.ts').Citation[] {
  const exclude = new Set(m.author.linkExclude ?? []);
  // An ironic verdict is found by its usual vehicle, the generalization.
  const want = term === 'irony' ? 'gnomic' : term;
  // The pack's table, checked at build time, answers in milliseconds; an empty entry means the corpus has none.
  const table = m.pack?.exemplars[want];
  if (table) return m.nearestOf(table.filter((id) => !exclude.has(m.cite(id)?.work ?? '')), near, k);
  const out: import('./model.ts').Citation[] = [];
  const take = (cands: import('./model.ts').Citation[]) => {
    for (const c of cands) {
      if (out.length >= k) return;
      if (exclude.has(c.work) || out.some((o) => o.id === c.id)) continue;
      if (findFigures(m, c.text, { spoken: m.spoken(c.id) }).some((f) => f.term === want)) out.push(c);
    }
  };
  // The nearest first; then, for a rarer figure, the whole corpus sifted by a cheap sign of it, nearest first.
  take(m.similarSentences(near || FIGURES[term]?.gloss || term, 400, { minWords: 6, maxWords: 70 }));
  const sign = SIGNS[want];
  if (out.length < k && sign) take(m.similarSentences(near || FIGURES[term]?.gloss || term, 300, { minWords: 6, maxWords: 70, test: (t) => sign.test(t) }));
  return out;
}
