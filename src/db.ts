// SQLite, Node's own (node:sqlite): the author's corpus and model, the English resources and the documents.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.ADVISOR_DATA ? resolve(process.env.ADVISOR_DATA) : join(ROOT, 'data');

export function open(file: string, opts: { readOnly?: boolean } = {}): DatabaseSync {
  if (!opts.readOnly) mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { readOnly: opts.readOnly ?? false });
  if (!opts.readOnly) {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  }
  return db;
}

export const authorDbPath = (id: string) => join(DATA, `${id}.sqlite`);
export const englishDbPath = () => join(DATA, 'english.sqlite');
export const docsDbPath = () => join(DATA, 'documents.sqlite');

/** Many writes at once. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getMeta<T>(db: DatabaseSync, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}
export function setMeta(db: DatabaseSync, key: string, value: unknown): void {
  db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}
