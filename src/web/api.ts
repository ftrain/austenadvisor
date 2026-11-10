// The server's answers, typed by the server's own types, and the few helpers every part of the page uses.

import type { Citation } from '../engine/model.ts';
import { findTerms } from '../engine/terms.ts';
import type { Drill, PracticeCheck } from '../engine/practice.ts';
import type { GlossaryEntry } from '../engine/terms.ts';
import type { HerSentence, Note, Quote, Row, YourSentence } from '../server/page.ts';
import type { NeverWord, Reading, SketchRow, StyleLine } from '../server/read.ts';
import type { GuessCard } from '../server/routes/guess.ts';
import type { Sample } from '../server/routes/samples.ts';

export type { Citation, Drill, GlossaryEntry, GuessCard, HerSentence, NeverWord, Note, PracticeCheck, Quote, Reading, Row, Sample, SketchRow, StyleLine, YourSentence };
export type Para = Extract<Row, { kind: 'paragraph' }>;

async function json<T>(r: Response): Promise<T> {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(plain((data as { error?: string }).error ?? r.statusText));
  return data as T;
}
export const get = <T>(path: string, signal?: AbortSignal) => fetch(path, { signal }).then((r) => json<T>(r));
export const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }).then((r) => json<T>(r));

/** A server message fit to show: never the name of a setting on the server. */
export function plain(message: string): string {
  return /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(message) ? 'The server could not do that. Try again later.' : message;
}

export interface Pronouns {
  subject: string;
  object: string;
  possessive: string;
  possessivePronoun: string;
}
export type Family = 'storytellers' | 'speakers' | 'arguers' | 'essayists';

export interface AuthorInfo {
  id: string;
  name: string;
  /** “Jane Austen”, “The King James Bible”. */
  title: string;
  tagline: string;
  epigraph: { text: string; cite: string } | null;
  short: string;
  years: string;
  pronouns: Pronouns;
  /** The voice's moves, each with what it does. */
  moves: { id: string; name: string; does: string }[];
  built: boolean;
  family?: Family;
  goodFor?: string[];
}

export interface Boot {
  voices: AuthorInfo[];
  samples: Sample[];
  glossary: GlossaryEntry[];
  ai: { available: boolean };
  /** For each sample id, the voices it is already rewritten in. */
  ready: Record<string, string[]>;
}

export const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
/** A title in mid-sentence: “the King James Bible”. */
export const mid = (t: string) => t.replace(/^The /, 'the ');

/** Browser storage that may be missing or may throw: every read and write is guarded, and memory stands in. */
const memory = new Map<string, string>();
export const keep = {
  get<T>(key: string, fallback: T): T {
    let raw: string | null | undefined;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = memory.get(key);
    }
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    const raw = JSON.stringify(value);
    memory.set(key, raw);
    try {
      localStorage.setItem(key, raw);
    } catch {
      /* memory only */
    }
  },
};

/** This page's id for the server's one-rewrite-at-a-time rule. It lasts as long as the tab. */
export const clientId = `pg-${Math.random().toString(36).slice(2, 12)}`;

/** The text's hash as the server makes it: sha256 hex of the text with \r\n made \n, then trimmed. */
export async function textHash(text: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(text.replace(/\r\n/g, '\n').trim());
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** A refusal from the rewrite route: the budget, or no writer. */
export class Refused extends Error {
  status: number;
  budget: string;
  constructor(status: number, budget: string, message: string) {
    super(message);
    this.status = status;
    this.budget = budget;
  }
}

type Each = (line: { type: string; [k: string]: unknown }) => void;

/**
 * POST for a job, then ask for its lines until it ends, one call of `each` a line. Each answer is short and whole, so
 * a proxy that holds a streamed answer until it ends does not hold these. A server that streams the lines in the one
 * answer is read that way.
 */
export async function streamLines(path: string, body: unknown, each: Each, signal?: AbortSignal) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(body as object), job: true }), signal });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { error?: string; budget?: string };
    throw new Refused(r.status, data.budget ?? '', plain(data.error ?? r.statusText));
  }
  if (!(r.headers.get('content-type') ?? '').includes('application/json')) return readLines(r, each);
  const { job } = (await r.json()) as { job: string };
  for (let after = 0, misses = 0; ; ) {
    let a: { status: number; lines: { type: string; error?: string; budget?: string }[]; next: number; done: boolean };
    try {
      const g = await fetch(`${path}/${job}?after=${after}`, { signal });
      if (g.status === 404) throw new Refused(500, '', 'The rewrite failed.');
      if (!g.ok) throw new Error(g.statusText);
      a = await g.json();
      misses = 0;
    } catch (e) {
      // One dropped answer is not the end of the rewrite: the job is still running, so ask again.
      if (e instanceof Refused || (e as Error).name === 'AbortError' || ++misses > 5) throw e;
      await new Promise((ok) => setTimeout(ok, 1000));
      continue;
    }
    if (a.status !== 200) throw new Refused(a.status, a.lines[0]?.budget ?? '', plain(a.lines[0]?.error ?? ''));
    for (const l of a.lines) each(l);
    after = a.next;
    if (a.done) return;
  }
}

/** Read one streamed answer as lines of JSON. */
async function readLines(r: Response, each: Each) {
  const rd = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const flush = (all: boolean) => {
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) each(JSON.parse(line));
    }
    if (all && buf.trim()) each(JSON.parse(buf.trim()));
  };
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    flush(false);
  }
  flush(true);
}

/** A tiny element builder. */
type Tag = keyof HTMLElementTagNameMap;
export function h<K extends Tag>(tag: K, attrs: Record<string, unknown> = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag) as HTMLElementTagNameMap[K] & HTMLElement;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** A button: always a real one, never a link or a span. */
export const button = (label: string | Node, onclick: (e: MouseEvent) => void, attrs: Record<string, unknown> = {}) =>
  h('button', { type: 'button', class: 'pg-btn', ...attrs, onclick }, label);

/** A sentence-case definition in mid-sentence: “Contrary ideas…” becomes “contrary ideas…”. */
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^(I|O)\b/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

/**
 * The glossary at work on the page: `defined(text)` marks each term in a text with a dotted line, and a tap opens its
 * definition in the line, right after it. `definition(name)` finds a term by any of its names.
 */
export function definer(glossary: GlossaryEntry[]) {
  const byId = new Map(glossary.map((t) => [t.id, t]));
  /** A word that opens its definition in place. */
  function term(t: GlossaryEntry, words: string): [HTMLElement, HTMLElement] {
    const def = h('span', { class: 'pg-def', hidden: true }, ` (${lower(t.definition).replace(/\.$/, '')})`);
    const btn = h('button', { type: 'button', class: 'pg-term', 'aria-expanded': 'false' }, words);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      def.hidden = !def.hidden;
      btn.setAttribute('aria-expanded', String(!def.hidden));
    });
    return [btn, def];
  }
  function defined(text: string): (Node | string)[] {
    const out: (Node | string)[] = [];
    let at = 0;
    for (const [a, b, id] of findTerms(glossary, text)) {
      const t = byId.get(id);
      if (!t || a < at) continue;
      out.push(text.slice(at, a));
      out.push(...term(t, text.slice(a, b)));
      at = b;
    }
    out.push(text.slice(at));
    return out;
  }
  /** A paragraph's role shown as a label (“Claim”, “Scene”), defined in place. Running prose never marks a role
   * word, since “close” and “call” are everyday words; a label is known to be one. */
  function labelled(name: string): (Node | string)[] {
    const n = name.trim().toLowerCase();
    const t = glossary.find((x) => x.kind === 'role' && (x.term.toLowerCase() === n || x.names.includes(n)));
    return t ? term(t, name) : defined(name);
  }
  /** A SHAPE line, “Claim · Reason · Call”, each role defined in place. */
  function shape(line: string): (Node | string)[] {
    return line.split(' · ').flatMap((x, i) => [...(i ? [' · '] : []), ...labelled(x)]);
  }
  function definition(name: string): GlossaryEntry | null {
    const n = name.trim().toLowerCase();
    return byId.get(n) ?? glossary.find((x) => x.names.includes(n) || x.names.includes(n.replace(/(es|s)$/, ''))) ?? null;
  }
  return { defined, definition, labelled, shape };
}
export type Definer = ReturnType<typeof definer>;

/** Put children in an element, leaving out the ones that are not there. */
export function fill(el: Element, ...kids: (Node | string | null | undefined | false)[]) {
  el.replaceChildren(...kids.filter((k): k is Node | string => k !== null && k !== undefined && k !== false));
}
