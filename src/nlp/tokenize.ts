// Words, numbers and punctuation with their places, and the sentences they make.
// One tokenizer for the author's corpus and for the writer's text, so a word is the same word on both sides.

export type TokenKind = 'word' | 'num' | 'punct';

export interface Token {
  /** As written. */
  text: string;
  /** Lower case, curly apostrophes made straight: the key every table is looked up by. */
  norm: string;
  start: number;
  end: number;
  kind: TokenKind;
  /** Inside quotation marks: spoken, or quoted. */
  quoted: boolean;
}

export interface Sentence {
  start: number;
  end: number;
  /** Indexes into the paragraph's tokens, [from, to). */
  from: number;
  to: number;
}

const WORD = /[\p{L}][\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*/uy;
const NUM = /\d+(?:[.,:]\d+)*(?:st|nd|rd|th|s)?/uy;
const DASH = /—|–|-{2,}/y;
const ELLIPSIS = /…|\.{3,}/y;
const SPACE = /[\s⁠​﻿]+/uy;

/** Lower case, apostrophes straight, hyphens kept: "Good-Humoured’s" → "good-humoured's". */
export function normWord(w: string): string {
  return w.toLowerCase().replace(/’/g, "'");
}

/** Ordinary typography: what a writer types and what Standard Ebooks sets, read the same way. */
export function cleanText(s: string): string {
  return s
    .replace(/[⁠​﻿]/g, '')
    .replace(/[    ]/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let quoted = false;
  const n = text.length;
  const at = (re: RegExp) => {
    re.lastIndex = i;
    const m = re.exec(text);
    return m ? m[0] : null;
  };
  while (i < n) {
    let m = at(SPACE);
    if (m) {
      i += m.length;
      continue;
    }
    const c = text[i]!;
    // A word, keeping a leading apostrophe of an elision: ’tis, ’em.
    if ((c === '’' || c === "'") && /[\p{L}]/u.test(text[i + 1] ?? '') && /^(?:tis|twas|em|twere|twill)\b/i.test(text.slice(i + 1, i + 7))) {
      const save = i;
      i += 1;
      m = at(WORD);
      if (m) {
        const w = text.slice(save, i + m.length);
        out.push({ text: w, norm: normWord(w), start: save, end: i + m.length, kind: 'word', quoted });
        i += m.length;
        continue;
      }
      i = save;
    }
    m = at(WORD);
    if (m) {
      out.push({ text: m, norm: normWord(m), start: i, end: i + m.length, kind: 'word', quoted });
      i += m.length;
      continue;
    }
    m = at(NUM);
    if (m) {
      out.push({ text: m, norm: m.toLowerCase(), start: i, end: i + m.length, kind: 'num', quoted });
      i += m.length;
      continue;
    }
    m = at(DASH) ?? at(ELLIPSIS);
    if (m) {
      out.push({ text: m, norm: m[0] === '.' || m === '…' ? '…' : '—', start: i, end: i + m.length, kind: 'punct', quoted });
      i += m.length;
      continue;
    }
    // Quotation marks open and close the spoken words; a straight one turns them over.
    if (c === '“') {
      out.push({ text: c, norm: '"', start: i, end: i + 1, kind: 'punct', quoted: true });
      quoted = true;
    } else if (c === '”') {
      out.push({ text: c, norm: '"', start: i, end: i + 1, kind: 'punct', quoted: true });
      quoted = false;
    } else if (c === '"') {
      const opening: boolean = !quoted;
      out.push({ text: c, norm: '"', start: i, end: i + 1, kind: 'punct', quoted: true });
      quoted = opening;
    } else {
      out.push({ text: c, norm: c === '’' ? "'" : c, start: i, end: i + 1, kind: 'punct', quoted });
    }
    i += 1;
  }
  return out;
}

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'messrs', 'dr', 'st', 'col', 'capt', 'gen', 'lieut', 'esq', 'rev', 'sr', 'jr', 'mt', 'ms', 'no', 'vol',
  'ch', 'viz', 'etc', 'vs', 'prof', 'hon', 'sept', 'oct', 'nov', 'dec', 'jan', 'feb', 'aug',
]);
const CLOSERS = new Set(['"', ')', ']', "'", '’', '”']);

/** Sentences: ends at . ! ? where the next word begins a new one, as a reader would hear it. */
export function sentences(text: string, tokens: Token[] = tokenize(text)): Sentence[] {
  const out: Sentence[] = [];
  let from = 0;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!;
    if (t.kind !== 'punct' || !/^[.!?…]$/.test(t.norm)) continue;
    if (t.norm === '.' && k > 0) {
      const prev = tokens[k - 1]!;
      if (prev.end === t.start && prev.kind === 'word' && (ABBREVIATIONS.has(prev.norm) || /^\p{Lu}$/u.test(prev.text))) continue;
    }
    // Take in the closing marks: ?” and !)
    let end = k;
    while (end + 1 < tokens.length && CLOSERS.has(tokens[end + 1]!.text) && tokens[end + 1]!.start === tokens[end]!.end) end++;
    const next = tokens[end + 1];
    if (next) {
      const opensNew = /^[\p{Lu}\d“"‘(]/u.test(next.text);
      if (!opensNew) continue; // “Oh! single, my dear”: an exclamation inside a sentence
      if (t.norm === '…' && !/^[\p{Lu}“"]/u.test(next.text)) continue;
    }
    out.push({ start: tokens[from]!.start, end: tokens[end]!.end, from, to: end + 1 });
    from = end + 1;
    k = end;
  }
  if (from < tokens.length) out.push({ start: tokens[from]!.start, end: tokens[tokens.length - 1]!.end, from, to: tokens.length });
  return out;
}

export const isWord = (t: Token) => t.kind === 'word';

/** Words in a span of tokens. */
export function wordCount(tokens: Token[], from = 0, to = tokens.length): number {
  let n = 0;
  for (let k = from; k < to; k++) if (tokens[k]!.kind === 'word') n++;
  return n;
}

/** A word written with a capital where a sentence does not begin: a name, most likely. */
export function looksProper(tokens: Token[], k: number, sentenceFrom: number): boolean {
  const t = tokens[k]!;
  if (t.kind !== 'word' || !/^\p{Lu}/u.test(t.text)) return false;
  if (t.text === 'I' || /^I'|^I’/.test(t.text)) return false;
  if (k === sentenceFrom) return false;
  // After an opening quotation mark, or after a colon or dash, a capital can begin speech.
  for (let j = k - 1; j >= sentenceFrom; j--) {
    const p = tokens[j]!;
    if (p.kind === 'word' || p.kind === 'num') return true;
    if (p.text === '“' || p.text === '"' || p.text === ':' || p.norm === '—') return false;
  }
  return false;
}
