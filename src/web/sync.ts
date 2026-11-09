// The page's half of shared editing: a group of ops in flight at a time, the rest waiting behind it; the server's
// ops carried over both (the kernel's cross) and applied to the editor; a copy of the document kept here, so the
// engine always reads what the writer sees.

import { applyAll, cross, parse, write, type Doc, type Op } from 'tinylittleoffice/doc';

export interface RoomState {
  id: string;
  title: string;
  author: string;
  seq: number;
  text: string;
  versions: { author: string; text: string; hash: string; seq: number }[];
  comments: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  people: { id: string; name: string }[];
}

export interface SyncEvents {
  /** First contact, or the document taken whole again (a refusal, a reconnect). */
  reset(state: RoomState): void;
  /** Another's ops, ready for the editor. */
  remote(ops: Op[], author: string): void;
  versions(v: RoomState['versions']): void;
  state(s: Partial<RoomState>): void;
  status(text: string | null): void;
  presence(online: { id: string; name: string }[]): void;
  connection(up: boolean): void;
}

const rid = () => Math.random().toString(36).slice(2, 12);

export class Sync {
  private ws: WebSocket | null = null;
  private seq = 0;
  private inflight: { id: string; ops: Op[] } | null = null;
  private buffer: Op[] = [];
  private closed = false;
  doc: Doc = parse('');
  ai = false;
  private ev: SyncEvents;
  private url: string;

  constructor(docId: string, person: { id: string; name: string }, ev: SyncEvents) {
    this.ev = ev;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = `${proto}://${location.host}/ws?doc=${encodeURIComponent(docId)}&id=${encodeURIComponent(person.id)}&name=${encodeURIComponent(person.name)}`;
    this.connect();
  }

  get text(): string {
    return write(this.doc);
  }

  get pending(): boolean {
    return !!this.inflight || this.buffer.length > 0;
  }

  private connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.ev.connection(true);
    ws.onclose = () => {
      this.ev.connection(false);
      if (!this.closed) setTimeout(() => this.connect(), 1200);
    };
    ws.onmessage = (e) => this.receive(JSON.parse(String(e.data)));
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }

  private take(state: RoomState) {
    this.seq = state.seq;
    this.inflight = null;
    this.buffer = [];
    this.doc = parse(state.text);
    this.ev.reset(state);
  }

  private receive(msg: any) {
    switch (msg.type) {
      case 'hello':
        this.ai = !!msg.ai;
        // A reconnect with nothing pending carries on; otherwise the server's document is the document.
        if (this.seq === msg.state.seq && !this.inflight && this.seq > 0) {
          // Nothing of ours was in flight and nothing came since: what was typed meanwhile is sent now.
          this.ev.state(msg.state);
          this.flush();
          return;
        }
        this.take(msg.state);
        return;
      case 'ops': {
        if (this.inflight && msg.id === this.inflight.id) {
          this.inflight = null;
          this.seq = msg.seq;
          this.flush();
          return;
        }
        let theirs: Op[] = msg.ops;
        try {
          if (this.inflight) [this.inflight.ops, theirs] = cross(this.inflight.ops, theirs);
          if (this.buffer.length) [this.buffer, theirs] = cross(this.buffer, theirs);
          this.doc = applyAll(this.doc, theirs);
        } catch {
          // Crossing spans: the server's document wins, taken again on reconnecting.
          this.inflight = { id: 'lost', ops: [] };
          this.ws?.close();
          return;
        }
        this.seq = msg.seq;
        if (theirs.length) this.ev.remote(theirs, msg.author);
        return;
      }
      case 'refused':
        this.take(msg.state);
        return;
      case 'versions':
        this.ev.versions(msg.versions);
        return;
      case 'state':
        this.ev.state(msg);
        return;
      case 'status':
        this.ev.status(msg.text);
        return;
      case 'presence':
        this.ev.presence(msg.online);
        return;
    }
  }

  /** Ops made here (the editor's, or the page's on the writer's behalf), already applied to the editor. */
  local(ops: Op[]) {
    if (!ops.length) return;
    this.doc = applyAll(this.doc, ops);
    this.buffer.push(...ops);
    this.flush();
  }

  private flush() {
    if (this.inflight || !this.buffer.length || this.ws?.readyState !== 1) return;
    this.inflight = { id: rid(), ops: this.buffer };
    this.buffer = [];
    this.ws.send(JSON.stringify({ type: 'edit', id: this.inflight.id, base: this.seq, ops: this.inflight.ops }));
  }
}
