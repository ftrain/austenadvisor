// WordNet 3.1 (Miller et al., Princeton, 1985–) from its own dictionary files into SQLite, and the questions an
// advisor asks of it: a word's lemma (Morphy), its senses in order of use, their synonyms, and the words a step away
// (more general, similar, also see, pertaining to).

import type { DatabaseSync } from 'node:sqlite';
import { tx } from '../db.ts';

export type WnPos = 'n' | 'v' | 'a' | 'r';
export const WN_POS: WnPos[] = ['n', 'v', 'a', 'r'];
const FILE: Record<WnPos, string> = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };

export const WORDNET_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wn_synsets (id TEXT PRIMARY KEY, pos TEXT NOT NULL, words TEXT NOT NULL, gloss TEXT NOT NULL, rels TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wn_index (lemma TEXT NOT NULL, pos TEXT NOT NULL, synsets TEXT NOT NULL, PRIMARY KEY (lemma, pos));
CREATE TABLE IF NOT EXISTS wn_exc (form TEXT NOT NULL, pos TEXT NOT NULL, base TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wn_exc_form ON wn_exc(form, pos);
`;

/** The pointers kept, by WordNet's symbols. */
const KEEP = new Set(['@', '@i', '~', '&', '^', '\\', '+', '=', '$', '!']);

/** WordNet's files, by name (data.noun, index.noun, noun.exc, …), as NLTK's wordnet31.zip holds them. */
export function loadWordNet(db: DatabaseSync, files: Map<string, Buffer>): number {
  const file = (name: string) => {
    for (const [k, v] of files) if (k.endsWith(`/${name}`) || k === name) return v.toString('utf8');
    return '';
  };
  db.exec(WORDNET_SCHEMA);
  let n = 0;
  tx(db, () => {
    db.exec('DELETE FROM wn_synsets; DELETE FROM wn_index; DELETE FROM wn_exc;');
    const insS = db.prepare('INSERT INTO wn_synsets(id, pos, words, gloss, rels) VALUES (?, ?, ?, ?, ?)');
    const insI = db.prepare('INSERT OR REPLACE INTO wn_index(lemma, pos, synsets) VALUES (?, ?, ?)');
    const insE = db.prepare('INSERT INTO wn_exc(form, pos, base) VALUES (?, ?, ?)');
    for (const pos of WN_POS) {
      for (const line of file(`data.${FILE[pos]}`).split('\n')) {
        if (!line || line.startsWith('  ')) continue;
        const bar = line.indexOf(' | ');
        const f = (bar >= 0 ? line.slice(0, bar) : line).trim().split(' ');
        const gloss = bar >= 0 ? line.slice(bar + 3).trim() : '';
        const offset = f[0]!;
        const wCnt = parseInt(f[3]!, 16);
        const words: string[] = [];
        let k = 4;
        for (let i = 0; i < wCnt; i++, k += 2) words.push(f[k]!.replace(/\(.*\)$/, '').toLowerCase());
        const pCnt = parseInt(f[k]!, 10);
        k++;
        const rels: Record<string, string[]> = {};
        for (let i = 0; i < pCnt; i++, k += 4) {
          const sym = f[k]!;
          if (!KEEP.has(sym)) continue;
          const tpos = f[k + 2] === 's' ? 'a' : f[k + 2]!;
          (rels[sym] ??= []).push(`${tpos}${f[k + 1]}`);
        }
        insS.run(`${pos}${offset}`, pos, JSON.stringify(words), gloss, JSON.stringify(rels));
        n++;
      }
      for (const line of file(`index.${FILE[pos]}`).split('\n')) {
        if (!line || line.startsWith('  ')) continue;
        const f = line.trim().split(' ');
        const synsetCnt = parseInt(f[2]!, 10);
        const ids = f.slice(f.length - synsetCnt).map((o) => `${pos}${o}`);
        insI.run(f[0]!, pos, JSON.stringify(ids));
      }
      for (const line of file(`${FILE[pos]}.exc`).split('\n')) {
        const f = line.trim().split(' ');
        if (f.length < 2) continue;
        for (const base of f.slice(1)) insE.run(f[0]!, pos, base);
      }
    }
  });
  return n;
}

export interface Synset {
  id: string;
  pos: WnPos;
  words: string[];
  gloss: string;
  rels: Record<string, string[]>;
}

const RULES: Record<WnPos, [string, string][]> = {
  n: [['s', ''], ['ses', 's'], ['xes', 'x'], ['zes', 'z'], ['ches', 'ch'], ['shes', 'sh'], ['men', 'man'], ['ies', 'y']],
  v: [['s', ''], ['ies', 'y'], ['es', 'e'], ['es', ''], ['ed', 'e'], ['ed', ''], ['ing', 'e'], ['ing', '']],
  a: [['er', ''], ['est', ''], ['er', 'e'], ['est', 'e']],
  r: [],
};

export class WordNet {
  private db: DatabaseSync;
  private idx: ReturnType<DatabaseSync['prepare']>;
  private syn: ReturnType<DatabaseSync['prepare']>;
  private exc: ReturnType<DatabaseSync['prepare']>;
  private synCache = new Map<string, Synset | null>();
  private idxCache = new Map<string, string[]>();

  constructor(db: DatabaseSync) {
    this.db = db;
    this.idx = db.prepare('SELECT synsets FROM wn_index WHERE lemma = ? AND pos = ?');
    this.syn = db.prepare('SELECT id, pos, words, gloss, rels FROM wn_synsets WHERE id = ?');
    this.exc = db.prepare('SELECT base FROM wn_exc WHERE form = ? AND pos = ?');
  }

  /** The synset ids of a lemma, most used sense first. */
  senses(lemma: string, pos: WnPos): string[] {
    const key = `${pos}:${lemma}`;
    let ids = this.idxCache.get(key);
    if (!ids) {
      const row = this.idx.get(lemma.replace(/ /g, '_'), pos) as { synsets: string } | undefined;
      ids = row ? (JSON.parse(row.synsets) as string[]) : [];
      if (this.idxCache.size > 50000) this.idxCache.clear();
      this.idxCache.set(key, ids);
    }
    return ids;
  }

  synset(id: string): Synset | null {
    let s = this.synCache.get(id);
    if (s === undefined) {
      const row = this.syn.get(id) as { id: string; pos: WnPos; words: string; gloss: string; rels: string } | undefined;
      s = row ? { id: row.id, pos: row.pos, words: JSON.parse(row.words), gloss: row.gloss, rels: JSON.parse(row.rels) } : null;
      if (this.synCache.size > 50000) this.synCache.clear();
      this.synCache.set(id, s);
    }
    return s;
  }

  /** Morphy: the base forms a word may be of, for a part of speech, the word itself first where it is one. */
  lemmas(word: string, pos: WnPos): string[] {
    const w = word.toLowerCase().replace(/’/g, "'");
    const out: string[] = [];
    const add = (b: string) => {
      if (!out.includes(b) && this.senses(b, pos).length) out.push(b);
    };
    for (const r of this.exc.all(w, pos) as { base: string }[]) add(r.base);
    add(w);
    for (const [suf, rep] of RULES[pos]) if (w.endsWith(suf) && w.length > suf.length + 1) add(w.slice(0, -suf.length) + rep);
    return out;
  }

  /** Every part of speech a word may be, with its lemmas. */
  anyLemmas(word: string): { pos: WnPos; lemma: string }[] {
    return WN_POS.flatMap((pos) => this.lemmas(word, pos).map((lemma) => ({ pos, lemma })));
  }

  close(): void {
    this.db.close();
  }
}
