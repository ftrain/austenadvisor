// The author's model, from the corpus in the author's SQLite file: every sentence tagged; the vocabulary with where
// and how each word is used; the forms each lemma takes; the word and tag trigram models; PPMI–SVD word vectors;
// and the style profile, the numbers a writer is measured against.

import type { DatabaseSync } from 'node:sqlite';
import { setMeta, tx } from '../db.ts';
import { countTrigrams, KEY_BASE, Vocab } from '../nlp/kn.ts';
import { csrFrom, randomizedSvd } from '../nlp/linalg.ts';
import { Tagger, wnPos } from '../nlp/tagger.ts';
import { sentences as splitSentences, tokenize, type Token } from '../nlp/tokenize.ts';
import type { WordNet } from '../nlp/wordnet.ts';
import { lmKey, syllables, CONTRACTIONS, type StyleProfile, type Dist } from '../engine/profile.ts';

export const MODEL_SCHEMA = `
CREATE TABLE IF NOT EXISTS words (
  word TEXT PRIMARY KEY, count INTEGER NOT NULL, narr INTEGER NOT NULL, dial INTEGER NOT NULL, caps INTEGER NOT NULL,
  works TEXT NOT NULL, tags TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS forms (lemma TEXT NOT NULL, pos TEXT NOT NULL, tag TEXT NOT NULL, form TEXT NOT NULL, count INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS forms_lemma ON forms(lemma, pos);
CREATE INDEX IF NOT EXISTS forms_form ON forms(form);
CREATE TABLE IF NOT EXISTS lm_vocab (id INTEGER PRIMARY KEY, word TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lm_trigrams (key INTEGER PRIMARY KEY, n INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tag_vocab (id INTEGER PRIMARY KEY, tag TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tag_trigrams (key INTEGER PRIMARY KEY, n INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (word TEXT PRIMARY KEY, vec BLOB NOT NULL);
`;

const DIMS = 100;
const MIN_VEC = 5;
const WINDOW = 5;

interface SentRow {
  id: number;
  text: string;
  dialogue: number;
  work: string;
}

function dist(xs: number[]): Dist {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (s.length || 1));
  return { n: s.length, mean, sd, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) };
}

export function trainModel(db: DatabaseSync, tagger: Tagger, wn: WordNet, log = console.log): void {
  db.exec(MODEL_SCHEMA);
  const rows = db
    .prepare(
      `SELECT s.id, s.text, s.dialogue, c.work FROM sentences s JOIN paragraphs p ON p.id = s.paragraph
       JOIN chapters c ON c.id = p.chapter ORDER BY s.id`,
    )
    .all() as unknown as SentRow[];

  // 1. Tags, and the counts that come with reading every word once.
  log(`  tagging ${rows.length.toLocaleString()} sentences`);
  const wordStats = new Map<string, { count: number; narr: number; dial: number; caps: number; works: Record<string, number>; tags: Record<string, number> }>();
  const formCounts = new Map<string, number>(); // lemma \0 pos \0 tag \0 form
  const lmSentences: string[][] = [];
  const tagSentences: string[][] = [];
  const updateTags = db.prepare('UPDATE sentences SET tags = ? WHERE id = ?');
  const tokensBySentence: { toks: Token[]; tags: string[]; row: SentRow }[] = [];
  tx(db, () => {
    for (const row of rows) {
      const toks = tokenize(row.text);
      const tags = tagger.tagTokens(toks);
      updateTags.run(tags.join(' '), row.id);
      tokensBySentence.push({ toks, tags, row });
      const lm: string[] = [];
      toks.forEach((t, k) => {
        const key = lmKey(t);
        if (key) lm.push(key);
        if (t.kind !== 'word') return;
        let s = wordStats.get(t.norm);
        if (!s) wordStats.set(t.norm, (s = { count: 0, narr: 0, dial: 0, caps: 0, works: {}, tags: {} }));
        s.count++;
        if (t.quoted) s.dial++;
        else s.narr++;
        if (k > 0 && /^\p{Lu}/u.test(t.text) && toks[k - 1]!.kind === 'word') s.caps++;
        s.works[row.work] = (s.works[row.work] ?? 0) + 1;
        s.tags[tags[k]!] = (s.tags[tags[k]!] ?? 0) + 1;
      });
      lmSentences.push(lm);
      tagSentences.push(tags.filter((_, k) => toks[k]!.norm !== '"'));
    }
  });

  // 2. The vocabulary and the forms of each lemma, as the author inflected it.
  log(`  vocabulary: ${wordStats.size.toLocaleString()} words`);
  for (const { toks, tags } of tokensBySentence)
    toks.forEach((t, k) => {
      if (t.kind !== 'word') return;
      const pos = wnPos(tags[k]!);
      if (!pos) return;
      const lemma = wn.lemmas(t.norm, pos)[0];
      if (!lemma) return;
      const key = `${lemma}\u0000${pos}\u0000${tags[k]}\u0000${t.norm}`;
      formCounts.set(key, (formCounts.get(key) ?? 0) + 1);
    });
  tx(db, () => {
    db.exec('DELETE FROM words; DELETE FROM forms;');
    const insW = db.prepare('INSERT INTO words(word, count, narr, dial, caps, works, tags) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const [w, s] of wordStats) insW.run(w, s.count, s.narr, s.dial, s.caps, JSON.stringify(s.works), JSON.stringify(s.tags));
    const insF = db.prepare('INSERT INTO forms(lemma, pos, tag, form, count) VALUES (?, ?, ?, ?, ?)');
    for (const [key, n] of formCounts) {
      const [lemma, pos, tag, form] = key.split('\u0000');
      insF.run(lemma!, pos!, tag!, form!, n);
    }
  });

  // 3. The word and tag trigram models: counts kept, smoothing done when they are read.
  log('  trigram models');
  const vocab = new Vocab();
  for (const s of lmSentences) for (const w of s) vocab.add(w);
  const c3 = countTrigrams(lmSentences, vocab);
  const tagVocab = new Vocab();
  for (const s of tagSentences) for (const t of s) tagVocab.add(t);
  const t3 = countTrigrams(tagSentences, tagVocab);
  tx(db, () => {
    db.exec('DELETE FROM lm_vocab; DELETE FROM lm_trigrams; DELETE FROM tag_vocab; DELETE FROM tag_trigrams;');
    const iv = db.prepare('INSERT INTO lm_vocab(id, word) VALUES (?, ?)');
    vocab.words.forEach((w, i) => iv.run(i, w));
    const it = db.prepare('INSERT INTO lm_trigrams(key, n) VALUES (?, ?)');
    for (const [k, n] of c3) it.run(k, n);
    const tv = db.prepare('INSERT INTO tag_vocab(id, tag) VALUES (?, ?)');
    tagVocab.words.forEach((w, i) => tv.run(i, w));
    const tt = db.prepare('INSERT INTO tag_trigrams(key, n) VALUES (?, ?)');
    for (const [k, n] of t3) tt.run(k, n);
  });
  log(`  ${c3.size.toLocaleString()} word trigrams, ${t3.size.toLocaleString()} tag trigrams`);

  // 4. Word vectors: positive PMI over a weighted window, context distribution smoothed (Levy, Goldberg & Dagan
  //    2015), factored by randomized SVD, U·√Σ, each row made unit length.
  const vecWords = [...wordStats].filter(([w, s]) => s.count >= MIN_VEC && /\p{L}/u.test(w)).map(([w]) => w);
  const vid = new Map(vecWords.map((w, i) => [w, i]));
  const n = vecWords.length;
  log(`  vectors for ${n.toLocaleString()} words`);
  const pair = new Map<number, number>();
  for (const { toks } of tokensBySentence) {
    const ids = toks.filter((t) => t.kind === 'word').map((t) => vid.get(t.norm) ?? -1);
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i]!;
      if (a < 0) continue;
      for (let d = 1; d <= WINDOW && i + d < ids.length; d++) {
        const b = ids[i + d]!;
        if (b < 0) continue;
        const wgt = (WINDOW - d + 1) / WINDOW;
        pair.set(a * n + b, (pair.get(a * n + b) ?? 0) + wgt);
        pair.set(b * n + a, (pair.get(b * n + a) ?? 0) + wgt);
      }
    }
  }
  const rowSum = new Float64Array(n);
  const colSum = new Float64Array(n);
  let total = 0;
  for (const [k, c] of pair) {
    const a = Math.floor(k / n);
    rowSum[a]! += c;
    colSum[k - a * n]! += c;
    total += c;
  }
  let colSmoothTotal = 0;
  for (let i = 0; i < n; i++) colSmoothTotal += colSum[i]! ** 0.75;
  const ppmi = new Map<number, number>();
  for (const [k, c] of pair) {
    const a = Math.floor(k / n);
    const b = k - a * n;
    const pmi = Math.log((c / total) / ((rowSum[a]! / total) * (colSum[b]! ** 0.75 / colSmoothTotal)));
    if (pmi > 0) ppmi.set(k, pmi);
  }
  const { u, s } = randomizedSvd(csrFrom(n, n, ppmi, n), DIMS);
  tx(db, () => {
    db.exec('DELETE FROM vectors;');
    const ins = db.prepare('INSERT INTO vectors(word, vec) VALUES (?, ?)');
    for (let i = 0; i < n; i++) {
      const v = new Float32Array(DIMS);
      let norm = 0;
      for (let j = 0; j < DIMS; j++) {
        v[j] = u.d[i * DIMS + j]! * Math.sqrt(s[j]!);
        norm += v[j]! ** 2;
      }
      norm = Math.sqrt(norm) || 1;
      for (let j = 0; j < DIMS; j++) v[j]! /= norm;
      ins.run(vecWords[i]!, new Uint8Array(v.buffer));
    }
  });

  // 5. The style profile.
  log('  style profile');
  setMeta(db, 'profile', profileOf(db, tokensBySentence, wordStats));
  setMeta(db, 'model', { trained: new Date().toISOString(), dims: DIMS, lmTypes: vocab.size, tagTypes: tagVocab.size, keyBase: KEY_BASE });
}

function profileOf(
  db: DatabaseSync,
  sents: { toks: Token[]; tags: string[]; row: SentRow }[],
  wordStats: Map<string, { count: number; narr: number; dial: number }>,
): StyleProfile {
  const narrLen: number[] = [];
  const dialLen: number[] = [];
  const syll: number[] = [];
  let narrWords = 0;
  let dialWords = 0;
  let words = 0;
  const punct: Record<string, number> = { ';': 0, ':': 0, '—': 0, '!': 0, '?': 0, ',': 0, '(': 0 };
  const openers: Record<string, number> = {};
  const joins: Record<string, number> = {};
  let lyAdverbs = 0;
  let adjectives = 0;
  let nouns = 0;
  let passives = 0;
  for (const { toks, tags, row } of sents) {
    const w = toks.filter((t) => t.kind === 'word');
    if (!w.length) continue;
    words += w.length;
    const narr = row.dialogue < 0.5;
    (narr ? narrLen : dialLen).push(w.length);
    for (const t of w) if (t.quoted) dialWords++;
    else narrWords++;
    syll.push(w.reduce((a, t) => a + syllables(t.norm), 0) / w.length);
    toks.forEach((t, k) => {
      if (t.kind === 'punct' && t.norm in punct) punct[t.norm]!++;
      const tag = tags[k]!;
      if (t.kind === 'word') {
        if (/^RB/.test(tag) && t.norm.endsWith('ly')) lyAdverbs++;
        if (/^JJ/.test(tag)) adjectives++;
        if (/^NNS?$/.test(tag)) nouns++;
        if (/^BE/.test(tag) && /^VBN/.test(tags[k + 1] ?? '')) passives++;
      }
      // How clauses are joined within a sentence: a mark and the word after it.
      if (t.kind === 'punct' && (t.norm === ';' || t.norm === ',' || t.norm === '—') && k > 0 && k < toks.length - 2) {
        const nx = toks[k + 1]!;
        if (nx.kind === 'word' && ['and', 'but', 'for', 'which', 'who', 'though', 'as', 'when', 'while', 'yet', 'or', 'so'].includes(nx.norm))
          joins[`${t.norm} ${nx.norm}`] = (joins[`${t.norm} ${nx.norm}`] ?? 0) + 1;
        else if (t.norm === ';') joins['; …'] = (joins['; …'] ?? 0) + 1;
      }
    });
    if (narr) {
      const first = toks.find((t) => t.kind === 'word');
      if (first) {
        const tag = tags[toks.indexOf(first)]!;
        openers[tag] = (openers[tag] ?? 0) + 1;
      }
    }
  }
  const nSent = narrLen.length + dialLen.length;
  // Most frequent words, their rates in 2,000-word stretches, for Burrows's Delta (2002).
  const mfw = [...wordStats].sort((a, b) => b[1].count - a[1].count).slice(0, 150).map(([w]) => w);
  const chunks: Map<string, number>[] = [];
  let cur = new Map<string, number>();
  let curN = 0;
  for (const { toks } of sents)
    for (const t of toks) {
      if (t.kind !== 'word') continue;
      cur.set(t.norm, (cur.get(t.norm) ?? 0) + 1);
      if (++curN >= 2000) {
        chunks.push(cur);
        cur = new Map();
        curN = 0;
      }
    }
  const rates = mfw.map((w) => chunks.map((c) => ((c.get(w) ?? 0) / 2000) * 1000));
  const mean = rates.map((r) => r.reduce((a, b) => a + b, 0) / r.length);
  const sd = rates.map((r, i) => Math.sqrt(r.reduce((a, b) => a + (b - mean[i]!) ** 2, 0) / r.length) || 1e-6);
  const chunkDelta = chunks.map((_, ci) => mfw.reduce((a, _w, i) => a + Math.abs((rates[i]![ci]! - mean[i]!) / sd[i]!), 0) / mfw.length);
  // Contractions in narration and in speech, per thousand words of each.
  const contractions: StyleProfile['contractions'] = {};
  for (const [form, expansion] of Object.entries(CONTRACTIONS)) {
    const s = wordStats.get(form);
    contractions[form] = { expansion, narr: s?.narr ?? 0, dial: s?.dial ?? 0 };
  }
  const paras = db.prepare("SELECT words, sentences, dialogue FROM paragraphs WHERE kind = 'prose'").all() as {
    words: number;
    sentences: number;
    dialogue: number;
  }[];
  const per1000 = (x: number) => (x / words) * 1000;
  return {
    sentences: nSent,
    words,
    narrationWords: narrWords,
    dialogueWords: dialWords,
    sentenceLength: { narration: dist(narrLen), dialogue: dist(dialLen) },
    paragraphWords: dist(paras.filter((p) => p.dialogue < 0.5).map((p) => p.words)),
    paragraphSentences: dist(paras.filter((p) => p.dialogue < 0.5).map((p) => p.sentences)),
    syllablesPerWord: dist(syll),
    punctuationPerSentence: Object.fromEntries(Object.entries(punct).map(([k, v]) => [k, v / nSent])),
    joins: Object.fromEntries(Object.entries(joins).sort((a, b) => b[1] - a[1])),
    openers: Object.fromEntries(Object.entries(openers).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, v / narrLen.length])),
    per1000: { lyAdverbs: per1000(lyAdverbs), adjectives: per1000(adjectives), nouns: per1000(nouns), passives: per1000(passives) },
    mfw: { words: mfw, mean, sd, chunkDelta: dist(chunkDelta) },
    contractions,
  };
}

export function sentencesOf(text: string): string[] {
  return splitSentences(text).map((s) => text.slice(s.start, s.end));
}
