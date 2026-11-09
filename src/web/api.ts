// The server's answers, typed by the engine's own types.

import type { Analysis } from '../engine/analyze.ts';
import type { Citation } from '../engine/model.ts';
import type { WordProfile } from '../engine/tools.ts';

export type { Analysis, Citation, WordProfile };
export type { Advice, WordFlag, Replacement, Report, Measure } from '../engine/analyze.ts';
export type { Alternative } from '../engine/alternatives.ts';

async function json<T>(r: Response): Promise<T> {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? r.statusText);
  return data as T;
}
export const get = <T>(path: string) => fetch(path).then((r) => json<T>(r));
export const post = <T>(path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<T>(r));

export interface AuthorInfo {
  id: string;
  name: string;
  advisor: string;
  short: string;
  years: string;
  pronouns: Pronouns;
  works: string[];
  built: boolean;
}
export interface Pronouns {
  subject: string;
  object: string;
  possessive: string;
  possessivePronoun: string;
}
export const SHE: Pronouns = { subject: 'she', object: 'her', possessive: 'her', possessivePronoun: 'hers' };
export const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export interface Kwic {
  left: string;
  match: string;
  right: string;
  cite: Citation;
}

/** Who this browser is, kept on the device. */
export function me(): { id: string; name: string } {
  try {
    const v = JSON.parse(localStorage.getItem('advisor.me') ?? 'null');
    if (v?.id && v?.name) return v;
  } catch {
    /* none kept */
  }
  const fresh = { id: `p-${Math.random().toString(36).slice(2, 10)}`, name: 'Writer' };
  try {
    localStorage.setItem('advisor.me', JSON.stringify(fresh));
  } catch {
    /* memory only */
  }
  return fresh;
}
export function setMyName(name: string) {
  const m = { ...me(), name };
  try {
    localStorage.setItem('advisor.me', JSON.stringify(m));
  } catch {
    /* memory only */
  }
  return m;
}

/** A tiny element builder. */
type Tag = Exclude<keyof HTMLElementTagNameMap, `to-${string}`>;
export function h<K extends Tag>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag) as HTMLElement as HTMLElementTagNameMap[K] & HTMLElement;
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

/** An author's sentence, cited: the words, then where they are. */
export function quoteEl(c: Citation, onOpen?: (c: Citation) => void): HTMLElement {
  return h(
    'blockquote',
    { class: 'aa-quote' },
    h('span', { class: 'aa-quote-text' }, c.text),
    h('cite', {}, onOpen ? h('button', { class: 'aa-link', onclick: () => onOpen(c), title: 'Read it in its paragraph' }, c.cite) : c.cite),
  );
}
