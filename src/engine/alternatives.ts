// Words the author would have used instead: WordNet's senses give what the word means, the author's own forms say
// how to write it, the trigram model says how well it fits where it stands, the vectors say how well it suits the
// passage, and the corpus gives a sentence where the author used it.

import { cosine } from '../nlp/linalg.ts';
import { wnPos } from '../nlp/tagger.ts';
import type { WnPos } from '../nlp/wordnet.ts';
import { CONTRACTIONS } from './profile.ts';
import type { AuthorModel, Citation } from './model.ts';

export type AltSource = 'expansion' | 'synonym' | 'broader' | 'narrower' | 'similar' | 'context' | 'spelling';

export interface Alternative {
  /** As it would be written in place: inflected and capitalized as the word it replaces. */
  text: string;
  lemma: string;
  source: AltSource;
  /** Why: "a synonym, in the sense ‘a mercantile establishment for the retail sale of goods’". */
  relation: string;
  /** Times the author wrote it. */
  count: number;
  /** log2 probability of the word and the two after it, in this place. */
  fit: number;
  /** Cosine between the word and the passage around it, in the author's vectors. */
  suits: number;
  /** How near in meaning, by WordNet: 1 for a synonym in the word's first sense, less further off; 0 for the gap's. */
  weight: number;
  score: number;
  example?: Citation;
}

export interface Slot {
  /** The sentence as the word model reads it (lmKey of each token), and the word's place in it. */
  keys: string[];
  at: number;
  /** The word as written, and the tag the tagger gave it here. */
  word: string;
  tag: string;
  /** The passage's other words, for how well a candidate suits it. */
  context: string[];
  /** The next word's tag: an adjective before an adjective is an intensifier ("super crowded"). */
  nextTag?: string;
}

const RELATIONS: { sym: string; source: AltSource; weight: number; senses: number; limit: number }[] = [
  { sym: '&', source: 'similar', weight: 0.6, senses: 4, limit: 20 },
  { sym: '^', source: 'similar', weight: 0.5, senses: 3, limit: 10 },
  { sym: '@', source: 'broader', weight: 0.5, senses: 4, limit: 10 },
  { sym: '$', source: 'similar', weight: 0.5, senses: 3, limit: 10 },
  { sym: '~', source: 'narrower', weight: 0.35, senses: 2, limit: 40 },
];

function matchCase(word: string, like: string): string {
  if (like.length > 1 && like === like.toUpperCase()) return word.toUpperCase();
  if (/^\p{Lu}/u.test(like)) return word[0]!.toUpperCase() + word.slice(1);
  return word;
}

/** Regular English inflection, tried against the author's vocabulary when the author never inflected the lemma so. */
function regular(lemma: string, tag: string): string[] {
  const t = tag.replace(/\$$/, '');
  const cons = /[^aeiou]y$/.test(lemma);
  if (t === 'NNS' || t === 'VBZ') return cons ? [lemma.slice(0, -1) + 'ies'] : /(s|x|z|ch|sh)$/.test(lemma) ? [lemma + 'es'] : [lemma + 's'];
  if (t === 'VBD' || t === 'VBN')
    return lemma.endsWith('e') ? [lemma + 'd'] : cons ? [lemma.slice(0, -1) + 'ied'] : [lemma + 'ed', lemma + lemma.slice(-1) + 'ed'];
  if (t === 'VBG') return lemma.endsWith('e') && !lemma.endsWith('ee') ? [lemma.slice(0, -1) + 'ing'] : [lemma + 'ing', lemma + lemma.slice(-1) + 'ing'];
  if (t === 'JJR' || t === 'RBR') return [lemma.endsWith('e') ? lemma + 'r' : lemma + 'er', 'more ' + lemma];
  if (t === 'JJT' || t === 'JJS' || t === 'RBT') return [lemma.endsWith('e') ? lemma + 'st' : lemma + 'est', 'most ' + lemma];
  return [lemma];
}

/** The author's way of writing a lemma for the tag the replaced word had. */
function formFor(m: AuthorModel, lemma: string, pos: WnPos, tag: string): string | null {
  if (lemma.includes('_')) {
    // A phrase: its head inflected ("turn out" → "turned out"), kept only where the author wrote it so.
    const parts = lemma.split('_');
    if (parts.length !== 2) return null;
    const head = m.inflect(parts[0]!, pos, tag) ?? (/^(NN|VB|JJ|RB)$/.test(tag) ? parts[0]! : null);
    return head && m.lm.bigram(head, parts[1]!) > 0 ? `${head} ${parts[1]}` : null;
  }
  const own = m.inflect(lemma, pos, tag);
  if (own) return own;
  // Otherwise only a word she used as this part of speech: "roomy" was an adjective of hers, never a roommate.
  const asPos = (w: string) => Object.keys(m.word(w)?.tags ?? {}).some((t) => wnPos(t) === pos || (pos === 'r' && t === 'QL'));
  const t = tag.replace(/\$$/, '');
  if (/^(NN|VB|JJ|RB|QL)$/.test(t) && asPos(lemma)) return lemma;
  for (const f of regular(lemma, tag)) if (f.split(' ').every((x) => m.word(x)) && asPos(f.split(' ').at(-1)!)) return f;
  return null;
}

/** Edits one letter away (Damerau 1964; as Norvig's corrector, 2007). */
function edits1(w: string): string[] {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const out: string[] = [];
  for (let i = 0; i <= w.length; i++) {
    const [a, b] = [w.slice(0, i), w.slice(i)];
    if (b) out.push(a + b.slice(1));
    if (b.length > 1) out.push(a + b[1] + b[0] + b.slice(2));
    for (const c of letters) {
      if (b) out.push(a + c + b.slice(1));
      out.push(a + c + b);
    }
  }
  return out;
}

export interface AltOptions {
  limit?: number;
  /** A sentence of the author's for each alternative (default true). */
  examples?: boolean;
  /** Candidates from the trigram model's gap (default true). */
  gap?: boolean;
  /** Candidates one letter away (default true). */
  spelling?: boolean;
  /** Words a step away in WordNet, not only synonyms (default true). */
  related?: boolean;
}

export { lp as slotLogProb };

export function alternatives(m: AuthorModel, slot: Slot, opts: AltOptions = {}): Alternative[] {
  slot = { ...slot };
  const limit = opts.limit ?? 6;
  const lower = slot.word.toLowerCase().replace(/’/g, "'");
  const found = new Map<string, Omit<Alternative, 'fit' | 'suits' | 'score' | 'count'> & { weight: number }>();
  const add = (form: string, lemma: string, source: AltSource, relation: string, weight: number) => {
    const key = form.toLowerCase();
    if (key === lower) return;
    const had = found.get(key);
    if (!had || had.weight < weight) found.set(key, { text: form, lemma, source, relation, weight });
  };

  const ctxVec = m.contextVector(slot.context);

  // A contraction is written out.
  const expansion = CONTRACTIONS[lower];
  if (expansion) add(expansion, expansion, 'expansion', `written out, as ${m.author.short} wrote it`, 3);

  // WordNet: the word's senses, its synonyms in each, and the words a step away.
  let tag = slot.tag;
  let tagPos = wnPos(tag);
  if (tagPos === 'a' && slot.nextTag && /^(JJ|VBN)/.test(slot.nextTag)) [tag, tagPos] = ['RB', 'r'];
  // A form its tag does not explain is taken as the base form: "super" is no comparative.
  if (tagPos && m.wn.lemmas(lower, tagPos)[0] === lower) tag = baseTag(tagPos);
  slot = { ...slot, tag };
  const poses: WnPos[] = tagPos ? [tagPos, ...(['n', 'v', 'a', 'r'] as WnPos[]).filter((p) => p !== tagPos)] : ['n', 'v', 'a', 'r'];
  let knownToWordNet = false;
  let inTagPos = 0;
  poses.forEach((pos, pi) => {
    // Another part of speech only where the word's own gave nothing ("guy" the noun is not "guy" the verb).
    if (pi > 0 && tagPos && inTagPos > 0) return;
    const posWeight = pi === 0 ? 1 : 0.4;
    for (const lemma of m.wn.lemmas(lower, pos)) {
      knownToWordNet = true;
      const senses = m.wn.senses(lemma, pos);
      senses.slice(0, 6).forEach((id, rank) => {
        const s = m.wn.synset(id);
        if (!s) return;
        const sense = s.gloss.split(';')[0]!.trim();
        // Which sense is meant here: the order of use, and how near its gloss is to the passage (after Lesk, 1986).
        const fitsHere = senseFit(m, s.gloss, s.words, ctxVec);
        const rankWeight = (rank === 0 ? 1 : 0.35 / rank) * (1 + 2 * fitsHere);
        for (const w of s.words) {
          const f = formFor(m, w, pos, pi === 0 ? slot.tag : baseTag(pos));
          if (f) {
            add(f, w, 'synonym', `same sense: ‘${sense}’`, posWeight * rankWeight * (w.includes('_') ? 0.5 : 1));
            if (pi === 0) inTagPos++;
          }
        }
        for (const rel of opts.related === false ? [] : RELATIONS) {
          if (rank >= rel.senses) continue;
          for (const rid of (s.rels[rel.sym] ?? []).slice(0, rel.limit)) {
            const r = m.wn.synset(rid);
            if (!r) continue;
            const rpos = r.pos;
            for (const w of r.words.slice(0, 6)) {
              const f = formFor(m, w, rpos, rpos === tagPos ? slot.tag : baseTag(rpos));
              const what = rel.source === 'broader' ? `more general than ‘${sense}’` : rel.source === 'narrower' ? `a kind of ‘${sense}’` : `near ‘${sense}’`;
              if (f) {
                add(f, w, rel.source, what, posWeight * rel.weight * rankWeight * (w.includes('_') ? 0.5 : 1));
                if (pi === 0) inTagPos++;
              }
            }
          }
        }
      });
    }
  });

  // A slip of the keys, for a word no dictionary knows.
  if (opts.spelling !== false && !knownToWordNet && lower.length >= 4) {
    for (const e of new Set(edits1(lower))) {
      const info = m.word(e);
      if (info && info.count >= 2) add(e, e, 'spelling', 'one letter away: a slip?', 1.2);
    }
  }

  // What the author put in this gap, said by the trigram model alone.
  const before = slot.keys[slot.at - 1] ?? '<s>';
  const after = slot.keys[slot.at + 1] ?? '</s>';
  const gap = opts.gap === false ? [] : m.lm.gapCandidates(before, after);
  const wantPos = tagPos;
  const scored = gap
    .filter((w) => /^\p{L}/u.test(w) && (m.word(w)?.count ?? 0) >= 3)
    .filter((w) => {
      const t = m.usualTag(w);
      return t ? (wantPos ? wnPos(t) === wantPos : t === slot.tag) : false;
    })
    .map((w) => ({ w, s: m.lm.slotScore(slot.keys, slot.at, w) + 4 * (ctxVec && m.vector(w) ? cosine(m.vector(w)!, ctxVec) : 0) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
  for (const { w } of scored) add(w, w, 'context', `what ${m.author.short} wrote between “${before}” and “${after}”`, 0.45);

  // Score each: fit in place, suit to the passage, closeness of meaning, and use.
  const out: Alternative[] = [];
  for (const c of found.values()) {
    const words = c.text.toLowerCase().split(' ');
    const count = Math.min(...words.map((w) => m.word(w)?.count ?? 0));
    if (!count) continue;
    const keys = [...slot.keys.slice(0, slot.at), ...words, ...slot.keys.slice(slot.at + 1)];
    let fit = 0;
    for (let k = slot.at; k < Math.min(keys.length + 1, slot.at + words.length + 2); k++) fit += lp(m, keys, k);
    const v = m.vector(words[words.length - 1]!);
    const suits = v && ctxVec ? cosine(v, ctxVec) : 0;
    const meaning = c.source === 'context' ? 0 : c.weight;
    const score = 0.5 * (fit / words.length) + 12 * Math.log2(1 + meaning) + 6 * suits + 0.6 * Math.log2(1 + count);
    out.push({ text: matchCase(c.text, slot.word), lemma: c.lemma, source: c.source, relation: c.relation, count, fit, suits, weight: meaning, score });
  }
  // Words of the same meaning first; then what the author put in such a gap, which keeps the sentence going but may
  // say something else.
  out.sort((a, b) => b.score - a.score);
  const byMeaning = out.filter((a) => a.source !== 'context');
  const byGap = out.filter((a) => a.source === 'context');
  const top = [...byMeaning.slice(0, byGap.length ? limit - 1 : limit), ...byGap].slice(0, limit);
  if (opts.examples !== false)
    for (const a of top) {
      const ws = a.text.toLowerCase().split(' ');
      a.example = m.search(ws, { phrase: ws.length > 1, prefer: slot.context, limit: 1, minWords: 6, maxWords: 50 })[0];
    }
  return top;
}

/** How near a sense's gloss and words are to the passage, 0–1, in the author's vectors. */
function senseFit(m: AuthorModel, gloss: string, words: string[], ctx: Float32Array | null): number {
  if (!ctx) return 0;
  const g = m.contextVector([...gloss.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 3), ...words.filter((w) => !w.includes('_'))]);
  return g ? Math.max(0, cosine(g, ctx)) : 0;
}

function baseTag(pos: WnPos): string {
  return pos === 'n' ? 'NN' : pos === 'v' ? 'VB' : pos === 'a' ? 'JJ' : 'RB';
}

/** log2 P of keys[k] after the two before it (k may be keys.length: the sentence's end). */
function lp(m: AuthorModel, keys: string[], k: number): number {
  const ids = [0, 0, ...keys.map((w) => m.lm.vocab.id(w)), 1];
  const j = k + 2;
  if (j >= ids.length) return 0;
  return Math.log2(m.lm.p3(ids[j - 2]!, ids[j - 1]!, ids[j]!));
}
