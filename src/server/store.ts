// The documents, in SQLite: each document's text now, its ordered ops, its versions by author (for who did what),
// its comments in threads, and the reviews of Advisor's changes.

import type { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { docsDbPath, open } from '../db.ts';

export const DOCS_SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ops (doc TEXT NOT NULL, seq INTEGER NOT NULL, id TEXT NOT NULL, author TEXT NOT NULL, op TEXT NOT NULL,
  PRIMARY KEY (doc, seq));
CREATE TABLE IF NOT EXISTS versions (doc TEXT NOT NULL, ord INTEGER NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL,
  hash TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (doc, ord));
CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, doc TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS comments_doc ON comments(doc, created_at);
CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, doc TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_doc ON reviews(doc, created_at);
CREATE TABLE IF NOT EXISTS people (doc TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY (doc, id));
`;

export interface DocRow {
  id: string;
  title: string;
  author: string;
  text: string;
  seq: number;
  created_at: string;
  updated_at: string;
}
export interface VersionRow {
  author: string;
  text: string;
  hash: string;
  seq: number;
}

export const newId = (n = 10) => randomBytes(n).toString('base64url').slice(0, n);
const now = () => new Date().toISOString();

export class Store {
  readonly db: DatabaseSync;
  constructor(file = docsDbPath()) {
    this.db = open(file);
    this.db.exec(DOCS_SCHEMA);
  }

  createDoc(title: string, author: string, text: string, by: string): DocRow {
    const id = newId(12);
    const t = now();
    this.db.prepare('INSERT INTO docs(id, title, author, text, seq, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)').run(id, title, author, text, t, t);
    this.db.prepare('INSERT INTO versions(doc, ord, author, text, hash, seq) VALUES (?, 0, ?, ?, ?, 0)').run(id, by, text, `w0-${id.slice(0, 4)}`);
    return this.getDoc(id)!;
  }
  getDoc(id: string): DocRow | undefined {
    return this.db.prepare('SELECT * FROM docs WHERE id = ?').get(id) as unknown as DocRow | undefined;
  }
  listDocs(limit = 50): Pick<DocRow, 'id' | 'title' | 'author' | 'updated_at'>[] {
    return this.db.prepare('SELECT id, title, author, updated_at FROM docs ORDER BY updated_at DESC LIMIT ?').all(limit) as any;
  }
  saveText(id: string, text: string, seq: number, title?: string): void {
    if (title !== undefined) this.db.prepare('UPDATE docs SET text = ?, seq = ?, title = ?, updated_at = ? WHERE id = ?').run(text, seq, title, now(), id);
    else this.db.prepare('UPDATE docs SET text = ?, seq = ?, updated_at = ? WHERE id = ?').run(text, seq, now(), id);
  }
  appendOps(doc: string, ops: { seq: number; id: string; author: string; op: unknown }[]): void {
    const ins = this.db.prepare('INSERT INTO ops(doc, seq, id, author, op) VALUES (?, ?, ?, ?, ?)');
    for (const o of ops) ins.run(doc, o.seq, o.id, o.author, JSON.stringify(o.op));
  }
  opsSince(doc: string, seq: number): { seq: number; id: string; author: string; op: unknown }[] {
    return (this.db.prepare('SELECT seq, id, author, op FROM ops WHERE doc = ? AND seq > ? ORDER BY seq').all(doc, seq) as any[]).map((r) => ({ ...r, op: JSON.parse(r.op) }));
  }
  versions(doc: string): VersionRow[] {
    return this.db.prepare('SELECT author, text, hash, seq FROM versions WHERE doc = ? ORDER BY ord').all(doc) as unknown as VersionRow[];
  }
  /** The last version taken further by the same person, or a new version by another. */
  putVersion(doc: string, v: VersionRow, replaceLast: boolean): void {
    const last = this.db.prepare('SELECT MAX(ord) AS ord FROM versions WHERE doc = ?').get(doc) as { ord: number | null };
    if (replaceLast && last.ord !== null) this.db.prepare('UPDATE versions SET text = ?, seq = ? WHERE doc = ? AND ord = ?').run(v.text, v.seq, doc, last.ord);
    else this.db.prepare('INSERT INTO versions(doc, ord, author, text, hash, seq) VALUES (?, ?, ?, ?, ?, ?)').run(doc, (last.ord ?? -1) + 1, v.author, v.text, v.hash, v.seq);
  }
  comments(doc: string): Record<string, unknown>[] {
    return (this.db.prepare('SELECT data FROM comments WHERE doc = ? ORDER BY created_at, rowid').all(doc) as { data: string }[]).map((r) => JSON.parse(r.data));
  }
  putComment(doc: string, c: { id: string; created_at?: string } & Record<string, unknown>): void {
    this.db
      .prepare('INSERT INTO comments(id, doc, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(c.id, doc, JSON.stringify(c), c.created_at ?? now());
  }
  reviews(doc: string): Record<string, unknown>[] {
    return (this.db.prepare('SELECT data FROM reviews WHERE doc = ? ORDER BY created_at, rowid').all(doc) as { data: string }[]).map((r) => JSON.parse(r.data));
  }
  putReview(doc: string, r: { id: string } & Record<string, unknown>): void {
    this.db.prepare('INSERT INTO reviews(id, doc, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(r.id, doc, JSON.stringify(r), now());
  }
  people(doc: string): { id: string; name: string }[] {
    return this.db.prepare('SELECT id, name FROM people WHERE doc = ? ORDER BY seen_at').all(doc) as any;
  }
  seePerson(doc: string, id: string, name: string): void {
    this.db.prepare('INSERT INTO people(doc, id, name, seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(doc, id) DO UPDATE SET name = excluded.name').run(doc, id, name, now());
  }
}
