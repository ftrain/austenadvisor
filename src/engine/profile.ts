// The style profile's shape, and the small rules both training and analysis share.

import type { Token } from '../nlp/tokenize.ts';

export interface Dist {
  n: number;
  mean: number;
  sd: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface StyleProfile {
  sentences: number;
  words: number;
  narrationWords: number;
  dialogueWords: number;
  sentenceLength: { narration: Dist; dialogue: Dist };
  paragraphWords: Dist;
  paragraphSentences: Dist;
  syllablesPerWord: Dist;
  punctuationPerSentence: Record<string, number>;
  /** "; and", ", but", "; …": how the author joins clauses within a sentence, by count. */
  joins: Record<string, number>;
  /** The first word's tag of a sentence of narration, as a share. */
  openers: Record<string, number>;
  per1000: { lyAdverbs: number; adjectives: number; nouns: number; passives: number };
  mfw: { words: string[]; mean: number[]; sd: number[]; chunkDelta: Dist };
  contractions: Record<string, { expansion: string; narr: number; dial: number }>;
}

/** The key a token has in the word model: a word in lower case, a number as <num>, punctuation that shapes a sentence. */
export function lmKey(t: Token): string | null {
  if (t.kind === 'word') return t.norm;
  if (t.kind === 'num') return '<num>';
  if (t.norm === '"' || t.norm === "'") return null;
  return t.norm;
}

/** Syllables by vowel groups, the old printer's count (as Flesch's formula assumes). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Contractions and what they stand for. */
export const CONTRACTIONS: Record<string, string> = {
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot', "couldn't": 'could not',
  "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not', "isn't": 'is not', "aren't": 'are not',
  "wasn't": 'was not', "weren't": 'were not', "hasn't": 'has not', "haven't": 'have not', "hadn't": 'had not',
  "mustn't": 'must not', "needn't": 'need not', "shan't": 'shall not', "i'm": 'I am', "i've": 'I have', "i'll": 'I shall',
  "i'd": 'I should', "you're": 'you are', "you've": 'you have', "you'll": 'you will', "you'd": 'you would',
  "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is', "there's": 'there is', "what's": 'what is',
  "we're": 'we are', "we've": 'we have', "we'll": 'we shall', "they're": 'they are', "they've": 'they have',
  "they'll": 'they will', "let's": 'let us', "who's": 'who is', "here's": 'here is', "he'll": 'he will', "she'll": 'she will',
  "it'll": 'it will', "he'd": 'he would', "she'd": 'she would', "they'd": 'they would', "we'd": 'we should',
};
