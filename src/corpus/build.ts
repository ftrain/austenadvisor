// The author's works into SQLite: works, chapters, paragraphs and sentences, each sentence findable by its words
// (FTS5, ranked by BM25) and citable by work, chapter and paragraph.

import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { DATA, setMeta, tx } from '../db.ts';
import { sentences, tokenize, wordCount } from '../nlp/tokenize.ts';
import { readWork, sourceUrl, type AuthorConfig } from './sources.ts';

export const CORPUS_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS works (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, title TEXT NOT NULL, year INTEGER, source TEXT);
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY, work TEXT NOT NULL REFERENCES works(id), ord INTEGER NOT NULL, title TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS paragraphs (
  id INTEGER PRIMARY KEY, chapter INTEGER NOT NULL REFERENCES chapters(id), ord INTEGER NOT NULL,
  kind TEXT NOT NULL, words INTEGER NOT NULL, sentences INTEGER NOT NULL, dialogue REAL NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sentences (
  id INTEGER PRIMARY KEY, paragraph INTEGER NOT NULL REFERENCES paragraphs(id), ord INTEGER NOT NULL,
  start INTEGER NOT NULL, end INTEGER NOT NULL, words INTEGER NOT NULL, dialogue REAL NOT NULL,
  text TEXT NOT NULL, tags TEXT);
CREATE INDEX IF NOT EXISTS sentences_paragraph ON sentences(paragraph);
CREATE INDEX IF NOT EXISTS paragraphs_chapter ON paragraphs(chapter);
CREATE VIRTUAL TABLE IF NOT EXISTS sentences_fts USING fts5(
  text, content='sentences', content_rowid='id', tokenize="unicode61 remove_diacritics 2 tokenchars '''’'");
`;

export interface CorpusCounts {
  works: number;
  chapters: number;
  paragraphs: number;
  sentences: number;
  words: number;
}

export function buildCorpus(db: DatabaseSync, author: AuthorConfig, log = console.log): CorpusCounts {
  db.exec(CORPUS_SCHEMA);
  const sourcesDir = join(DATA, 'sources');
  const counts: CorpusCounts = { works: 0, chapters: 0, paragraphs: 0, sentences: 0, words: 0 };
  tx(db, () => {
    db.exec('DELETE FROM sentences; DELETE FROM paragraphs; DELETE FROM chapters; DELETE FROM works;');
    const insWork = db.prepare('INSERT INTO works(id, ord, title, year, source) VALUES (?, ?, ?, ?, ?)');
    const insChapter = db.prepare('INSERT INTO chapters(work, ord, title) VALUES (?, ?, ?)');
    const insPara = db.prepare(
      'INSERT INTO paragraphs(chapter, ord, kind, words, sentences, dialogue, text) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insSent = db.prepare(
      'INSERT INTO sentences(paragraph, ord, start, end, words, dialogue, text) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    author.works.forEach((work, wi) => {
      const chapters = readWork(work, sourcesDir);
      insWork.run(work.id, wi, work.title, work.year, sourceUrl(work));
      counts.works++;
      let workWords = 0;
      chapters.forEach((ch, ci) => {
        const chapterId = Number(insChapter.run(work.id, ch.n ?? ci + 1, ch.title || String(ci + 1)).lastInsertRowid);
        counts.chapters++;
        ch.paragraphs.forEach((p, pi) => {
          const toks = tokenize(p.text);
          const sents = sentences(p.text, toks);
          const words = wordCount(toks);
          const spoken = toks.filter((t) => t.kind === 'word' && t.quoted).length;
          const paraId = Number(
            insPara.run(chapterId, p.n ?? pi + 1, p.kind, words, sents.length, words ? spoken / words : 0, p.text).lastInsertRowid,
          );
          counts.paragraphs++;
          sents.forEach((s, si) => {
            const w = wordCount(toks, s.from, s.to);
            if (!w) return;
            let q = 0;
            for (let k = s.from; k < s.to; k++) if (toks[k]!.kind === 'word' && toks[k]!.quoted) q++;
            insSent.run(paraId, si + 1, s.start, s.end, w, q / w, p.text.slice(s.start, s.end));
            counts.sentences++;
          });
          workWords += words;
        });
      });
      counts.words += workWords;
      log(`  ${work.title}: ${chapters.length} chapters, ${workWords.toLocaleString()} words`);
    });
    db.exec("INSERT INTO sentences_fts(sentences_fts) VALUES ('rebuild')");
    setMeta(db, 'author', author);
    setMeta(db, 'corpus', counts);
  });
  return counts;
}
