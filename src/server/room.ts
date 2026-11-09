// A document open for editing: its text as the server orders it, the people in it, and Advisor among them.
// Edits arrive as groups of the kernel's ops made against a version the sender had; the server carries them over
// what came since (the kernel's rebase), applies them, keeps them, and tells everyone (docs/kernel.md §12 in
// Tiny Little Office). Each person's edits make a version of their own, so the redline can say who did what.

import { apply, changesOf, keptDoc, parse, rebase, rejectOps, track, write, type Block, type Doc, type Op } from 'tinylittleoffice/doc';
import type { WebSocket } from 'ws';
import { blockText } from '../engine/doc.ts';
import { newId, type Store, type VersionRow } from './store.ts';

export const ADVISOR = 'advisor';

export interface Person {
  id: string;
  name: string;
}

export interface Group {
  id: string;
  author: string;
  base: number;
  ops: Op[];
}

export interface Review {
  id: string;
  change_id: string;
  by: string;
  verdict: 'accepted' | 'rejected';
  at_seq: number;
  why?: string | null;
  undone_at?: string | null;
}

export interface Replacement {
  block: number;
  start: number;
  end: number;
  text: string;
  /** The words there now, which the replacement was made for. */
  expect?: string;
}

const covers = (reviewed: string, id: string) => reviewed === id || (reviewed.endsWith(':*') && id.startsWith(reviewed.slice(0, -1)));

export class Room {
  readonly id: string;
  readonly store: Store;
  doc: Doc;
  seq: number;
  title: string;
  author: string;
  private log: { seq: number; op: Op }[] = [];
  readonly clients = new Map<WebSocket, Person>();
  versions: VersionRow[];

  constructor(store: Store, id: string) {
    const row = store.getDoc(id);
    if (!row) throw new Error('no such document');
    this.id = id;
    this.store = store;
    this.doc = parse(row.text);
    this.seq = row.seq;
    this.title = row.title;
    this.author = row.author;
    this.versions = store.versions(id);
    this.log = store.opsSince(id, Math.max(0, row.seq - 5000)).map((o) => ({ seq: o.seq, op: o.op as Op }));
  }

  get text(): string {
    return write(this.doc);
  }

  /** Ops the server ordered after `base`, for a client that has fallen behind. */
  since(base: number): { seq: number; op: Op }[] | null {
    if (base === this.seq) return [];
    const first = this.log[0]?.seq ?? this.seq + 1;
    if (base + 1 < first) return null;
    return this.log.filter((o) => o.seq > base);
  }

  /** An edit group in: rebased, applied whole or refused whole. */
  receive(g: Group): { ok: true; ops: Op[]; seq: number } | { ok: false; reason: string } {
    if (g.ops.some((o) => o.op === 'head' && (o as { key?: string }).key === 'lock')) return { ok: false, reason: 'lock' };
    const over = this.since(g.base);
    if (!over) return { ok: false, reason: 'too far behind' };
    let ops: Op[];
    let next = this.doc;
    try {
      ops = rebase(g.ops, over.map((o) => o.op));
      for (const op of ops) next = apply(next, op);
      keptDoc(next);
    } catch (e) {
      return { ok: false, reason: (e as Error).name === 'Conflict' ? 'conflict' : String((e as Error).message ?? e) };
    }
    this.doc = next;
    const stored = ops.map((op) => ({ seq: ++this.seq, id: g.id, author: g.author, op }));
    for (const s of stored) this.log.push({ seq: s.seq, op: s.op });
    if (this.log.length > 6000) this.log.splice(0, this.log.length - 5000);
    const text = this.text;
    const title = this.doc.head.title;
    this.store.db.exec('BEGIN');
    try {
      this.store.appendOps(this.id, stored);
      this.store.saveText(this.id, text, this.seq, title && title !== this.title ? (this.title = title) : undefined);
      this.addVersion(g.author, text);
      this.store.db.exec('COMMIT');
    } catch (e) {
      this.store.db.exec('ROLLBACK');
      throw e;
    }
    return { ok: true, ops, seq: this.seq };
  }

  /** The last version, if the same writer's, goes on; anyone else's edit, or Advisor's, begins a new one. */
  private newVersion = false;
  private addVersion(author: string, text: string): void {
    const last = this.versions.at(-1);
    if (last && last.author === author && author !== ADVISOR) {
      last.text = text;
      last.seq = this.seq;
      this.store.putVersion(this.id, last, true);
      return;
    }
    const v: VersionRow = { author, text, seq: this.seq, hash: `${author === ADVISOR ? 'adv' : 'w'}${this.versions.length}${newId(3)}` };
    this.versions.push(v);
    this.store.putVersion(this.id, v, false);
    this.newVersion = true;
  }

  /** Whether a version began since last asked: then the versions are told again. */
  takeNewVersion(): boolean {
    const n = this.newVersion;
    this.newVersion = false;
    return n;
  }

  /** Advisor's (or a person's) replacements of words, as ops on the document as it is now. */
  replacementOps(reps: Replacement[]): Op[] | { error: string } {
    const sorted = [...reps].sort((a, b) => b.block - a.block || b.start - a.start);
    const ops: Op[] = [];
    for (const r of sorted) {
      const b = this.doc.blocks[r.block] as Block | undefined;
      if (!b || !('runs' in b)) return { error: `block ${r.block} is not text` };
      const words = blockText(b);
      if (r.expect !== undefined && words.slice(r.start, r.end) !== r.expect) return { error: 'the words have changed since' };
      // Keep the marks of the first word replaced: an italic word stays italic.
      let at = 0;
      let marks: Record<string, unknown> = {};
      for (const run of b.runs) {
        const len = run.ic || run.fn !== undefined ? 1 : run.t.length;
        if (r.start < at + len || at + len === words.length) {
          const { t: _t, ic: _ic, fn: _fn, ...rest } = run as unknown as Record<string, unknown>;
          void _t;
          void _ic;
          void _fn;
          marks = rest;
          break;
        }
        at += len;
      }
      ops.push({ op: 'text', at: r.block, from: r.start, to: r.end, runs: r.text ? [{ ...marks, t: r.text }] : [] } as Op);
    }
    return ops;
  }

  /** Blocks from..to replaced by paragraphs (an AI rewrite that changes the number of paragraphs). */
  spliceOps(from: number, to: number, paragraphs: string[]): Op[] {
    return [{ op: 'splice', at: from, n: to - from + 1, blocks: paragraphs.map((t) => ({ k: 'p', runs: t ? [{ t }] : [] })) } as Op];
  }

  reviews(): Review[] {
    return this.store.reviews(this.id) as unknown as Review[];
  }

  private reviewed() {
    const rs = this.reviews().filter((r) => !r.undone_at);
    const all = this.reviews();
    return {
      rejectedBy: (id: string, seq: number) => rs.some((r) => r.verdict === 'rejected' && covers(r.change_id, id) && r.at_seq < seq),
      reviewedBy: (id: string, seq: number) => all.some((r) => covers(r.change_id, id) && r.at_seq < seq),
    };
  }

  /** Accept or reject Advisor's changes: a review kept, and for a rejection the edit that takes them back. */
  review(ids: string[], verdict: 'accepted' | 'rejected', by: string): { ops: Op[] | null; error?: string } {
    let ops: Op[] | null = null;
    if (verdict === 'rejected') {
      const r = this.reviewed();
      const tracked = track(this.versions.map((v) => ({ author: v.author, text: v.text, hash: v.hash, seq: v.seq })), r.rejectedBy, r.reviewedBy);
      // A version's changes whole ("<hash>:*") are its changes, each by its own id.
      const concrete = changesOf(tracked).filter((c) => ids.some((id) => covers(id, c.id))).map((c) => c.id);
      ops = concrete.length ? rejectOps(tracked, this.doc.blocks, concrete) : null;
      if (!ops) return { ops: null, error: 'Those words have changed since; they cannot be put back as they were.' };
    }
    const at = this.versions.at(-1)?.seq ?? this.seq;
    for (const id of ids) this.store.putReview(this.id, { id: newId(), change_id: id, by, verdict, at_seq: at, created_at: new Date().toISOString() });
    return { ops };
  }

  state() {
    return {
      id: this.id,
      title: this.title,
      author: this.author,
      seq: this.seq,
      text: this.text,
      versions: this.versions,
      comments: this.store.comments(this.id),
      reviews: this.reviews(),
      people: this.store.people(this.id),
    };
  }

  broadcast(msg: unknown, except?: WebSocket): void {
    const s = JSON.stringify(msg);
    for (const ws of this.clients.keys()) if (ws !== except && ws.readyState === 1) ws.send(s);
  }
}
