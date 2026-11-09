// The server's order and two pages' ops, as the page's Sync carries them: every page ends with the server's text.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAll, cross, parse, write, type Doc, type Op } from 'tinylittleoffice/doc';
import { describe, expect, it } from 'vitest';
import { blocksOfText, tloOfBlocks } from '../src/engine/doc.ts';
import { ADVISOR, Room } from '../src/server/room.ts';
import { Store } from '../src/server/store.ts';

class Page {
  doc: Doc;
  seq: number;
  inflight: { id: string; ops: Op[] } | null = null;
  buffer: Op[] = [];
  sent: { id: string; base: number; ops: Op[] }[] = [];
  constructor(text: string, seq: number) {
    this.doc = parse(text);
    this.seq = seq;
  }
  edit(ops: Op[]) {
    this.doc = applyAll(this.doc, ops);
    this.buffer.push(...ops);
    this.flush();
  }
  flush() {
    if (this.inflight || !this.buffer.length) return;
    this.inflight = { id: Math.random().toString(36).slice(2), ops: this.buffer };
    this.buffer = [];
    this.sent.push({ id: this.inflight.id, base: this.seq, ops: this.inflight.ops });
  }
  hear(msg: { id: string; ops: Op[]; seq: number }) {
    if (this.inflight?.id === msg.id) {
      this.inflight = null;
      this.seq = msg.seq;
      this.flush();
      return;
    }
    let theirs = msg.ops;
    if (this.inflight) [this.inflight.ops, theirs] = cross(this.inflight.ops, theirs);
    if (this.buffer.length) [this.buffer, theirs] = cross(this.buffer, theirs);
    this.doc = applyAll(this.doc, theirs);
    this.seq = msg.seq;
  }
}

describe('shared editing', () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'aa-')), 'docs.sqlite'));
  const text = tloOfBlocks(blocksOfText('# T\n\nFirst paragraph here.\n\nSecond paragraph here.'), 'T');
  const id = store.createDoc('T', 'austen', text, 'ann').id;
  const room = new Room(store, id);

  it('brings two writers and Advisor to one text', () => {
    const ann = new Page(room.text, room.seq);
    const bob = new Page(room.text, room.seq);
    const deliver = (who: Page, by: string) => {
      const out = who.sent.shift();
      if (!out) return;
      const res = room.receive({ id: out.id, author: by, base: out.base, ops: out.ops });
      if (!res.ok) throw new Error(res.reason);
      for (const p of [ann, bob]) p.hear({ id: out.id, ops: res.ops, seq: res.seq });
    };
    // Both type at once, in different paragraphs and in the same one.
    ann.edit([{ op: 'text', at: 1, from: 0, to: 5, runs: [{ t: 'The first' }] } as Op]);
    bob.edit([{ op: 'text', at: 2, from: 22, to: 22, runs: [{ t: ' And more.' }] } as Op]);
    bob.edit([{ op: 'text', at: 1, from: 21, to: 21, runs: [{ t: '!' }] } as Op]);
    deliver(bob, 'bob');
    deliver(ann, 'ann');
    deliver(bob, 'bob');
    // Advisor suggests a change, made on the server's text as it is.
    const ops = room.replacementOps([{ block: 2, start: 0, end: 6, text: 'The second', expect: 'Second' }]);
    if ('error' in ops) throw new Error(ops.error);
    const res = room.receive({ id: 'adv', author: ADVISOR, base: room.seq, ops });
    expect(res.ok).toBe(true);
    if (res.ok) for (const p of [ann, bob]) p.hear({ id: 'adv', ops: res.ops, seq: res.seq });
    expect(write(ann.doc)).toBe(room.text);
    expect(write(bob.doc)).toBe(room.text);
    expect(room.text).toContain('The first paragraph here.!');
    expect(room.text).toContain('The second paragraph here. And more.');
    // Who did what: a version each, Advisor's last.
    expect(room.versions.map((v) => v.author)).toEqual(['ann', 'bob', 'ann', 'bob', ADVISOR]);
  });

  it('takes back Advisor’s change on a rejection', () => {
    const adv = room.versions.at(-1)!;
    const { ops, error } = room.review([`${adv.hash}:*`], 'rejected', 'ann');
    expect(error).toBeUndefined();
    const res = room.receive({ id: 'rej', author: 'ann', base: room.seq, ops: ops! });
    expect(res.ok).toBe(true);
    expect(room.text).toContain('Second paragraph here. And more.');
  });

  it('refuses words that changed under a suggestion', () => {
    expect(room.replacementOps([{ block: 1, start: 0, end: 3, text: 'A', expect: 'Xyz' }])).toEqual({ error: 'the words have changed since' });
  });
});
