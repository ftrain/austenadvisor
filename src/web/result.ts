// RESULT and WRITING: the student's text and the voice's in three columns, yours, theirs and why, a row to each
// paragraph. Above the rows are one SHAPE line (how the piece is built) and one STYLE line (how its sentences run).
//
// SHAPE has a line for the student's piece, one for the form, and one for the voice. The student's line names what
// each paragraph does; a run of paragraphs the engine could not name is a quiet “…”, and when the rewrite arrives,
// the role its reading gave each such paragraph is shown in its place, lighter, as a reading and not a finding.
// The voice's line is the outline of a real piece the voice wrote, and opens to show what each part does, with a
// phrase quoted from it.
// Until the rewrite of a paragraph arrives, its middle column holds a SKETCH: for each sentence of yours, the voice's
// own sentence built most like it. Nothing here opens over the page: every tap opens a line in place.
//
// Text the rewrite added (a fact, a part the form lacked) is highlighted, and one legend line says so. A sentence
// that states a fact carries a footnote number; the facts are listed under the rows, each quoted from its Wikipedia
// article and linked to it. A text with nothing added and no facts shows neither the legend nor the list.

import { button, get, h, type AuthorInfo, type Definer, type Drill, type FootFact, type HerSentence, type Note, type Para, type Quote, type Reading, type Row, type SketchRow } from './api.ts';
import { fillVoices, RESTING, type Suggested } from './compose.ts';
import type { MovesView } from './moves.ts';
import { tryIt } from './tryit.ts';

/** Where a rewrite is, in a few words: the part count for a long text, and the server's last word on it. */
function where(run: Run): string {
  const at = run.at;
  if (!at) return 'starting';
  const parts = at.parts > 1 ? `${at.done} of ${at.parts} parts done` : '';
  return [parts, at.note].filter(Boolean).join(' · ');
}

/** One rewrite of one text in one voice, as it streams in. */
export interface Run {
  voice: string;
  text: string;
  /** The form it was fitted to ('auto' or a form's id), and whether facts were asked for. */
  form?: string;
  facts?: boolean;
  rows: Map<number, Row>;
  /** The writer's role for each paragraph, by part. */
  roles: Map<number, string[]>;
  /** The writer's reason for each of those, where it gave one. */
  whys?: Map<number, (string | undefined)[]>;
  done: boolean;
  /** Why the rewrite failed. */
  failed?: string;
  /** The failure is final: the same request would fail again (the text is too long). */
  final?: boolean;
  /** Done, but some parts were not rewritten (an error, or the budget ran out partway). */
  partial?: boolean;
  /** No rewrite: 'resting' (no writer, or the day's budget is spent) or 'busy' (another is still running). */
  resting?: 'resting' | 'busy';
  started: number;
  /** Where the writer is: parts done, parts in all, and the server's last word on it. */
  at?: { done: number; parts: number; note: string };
  /** Drills from the engine, for a text with no rewrite. */
  drills?: Drill[];
}

export interface ResultState {
  voice: AuthorInfo;
  run: Run | null;
  reading: Reading | null;
  /** The voices ready for this text, in the select's order: the arrows step through them. */
  flip: string[];
  ready: Set<string>;
  suggested: Suggested | null;
  /** Full rewrites of the student's own text are off. */
  resting: boolean;
}

export interface ResultOptions {
  voices: AuthorInfo[];
  terms: Definer;
  moves: MovesView;
  onEdit(): void;
  /** The select or an arrow chose this voice. */
  onVoice(id: string): void;
  /** Yes to the confirm line. */
  onConfirm(id: string): void;
  onRetry(): void;
}

export interface ResultView {
  el: HTMLElement;
  select: HTMLSelectElement;
  draw(s: ResultState): void;
  /** The confirm line for a voice that costs a rewrite, or null to clear it. */
  ask(v: AuthorInfo | null, keep: AuthorInfo): void;
  progress(s: ResultState): void;
}

/** Notes shown in the WHY column of one row, at most. */
export const NOTES_PER_ROW = 2;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const listOf = (xs: (string | number)[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** A footnote links only to Wikipedia: any other address is shown as its title alone. */
const wikiUrl = (u: string) => (/^https:\/\/[a-z-]+\.wikipedia\.org\//.test(u) ? u : null);

/** The facts a page's rows state, numbered in the order the rows first state them. */
export function numberFacts(rows: Row[]): { n: number; fact: FootFact }[] {
  const out = new Map<string, { n: number; fact: FootFact }>();
  for (const r of rows) if (r.kind === 'paragraph') for (const x of r.hers ?? []) for (const f of x.facts ?? []) if (!out.has(f.id)) out.set(f.id, { n: out.size + 1, fact: f });
  return [...out.values()];
}

/** The rewrite as plain text: its paragraphs, a number in brackets after each sentence that states a fact, and the
 * facts listed under it with their sources. */
export function plainText(rows: Row[]): string {
  const notes = numberFacts(rows);
  const nOf = new Map(notes.map((x) => [x.fact.id, x.n]));
  const body = rows
    .map((r) => (r.kind === 'heading' ? r.text : (r.hers ?? []).map((x) => x.text + (x.facts ?? []).map((f) => ` [${nOf.get(f.id)}]`).join('')).join(' ')))
    .filter(Boolean)
    .join('\n\n');
  if (!notes.length) return body;
  return `${body}\n\nNotes\n${notes.map((x) => `${x.n}. “${x.fact.text}” ${x.fact.title}, Wikipedia${x.fact.url ? `, ${x.fact.url}` : ''}`).join('\n')}`;
}

/** A role the rewrite's reading gives a paragraph the engine could not name, and its reason. */
export interface Borrowed {
  name: string;
  why?: string;
}

/** What the page shows for a run of paragraphs with no role. */
export const GAP = '…';
const GAP_TITLE = 'The engine could not name what these paragraphs do';
const GUESS_TITLE = 'A guess, from where the paragraph stands and how it reads';
/** Below this confidence a role is a guess (GUESS_BELOW in structure.ts). */
const GUESS = 0.6;
const capFirst = (x: string) => (x ? x[0]!.toUpperCase() + x.slice(1) : x);

/**
 * For each paragraph of the student's the engine could not name, the role the writer's reading gave the paragraph
 * that renders it. `at` gives each row's paragraph in the engine's reading; a row that carries `from` names the
 * student's paragraphs itself, counted from 1. A part written to fill the form renders no paragraph of the student's.
 */
export function rolesFromRewrite(reading: Reading | null, run: Run | null, rows: Row[], at: Map<Row, number | null>): Map<number, Borrowed> {
  const out = new Map<number, Borrowed>();
  if (!reading || !run) return out;
  const per = new Map<number, number>();
  for (const r of rows) {
    if (r.kind !== 'paragraph') continue;
    const k = per.get(r.part) ?? 0;
    per.set(r.part, k + 1);
    const name = run.roles.get(r.part)?.[k]?.trim();
    if (!r.hers || r.filled || !name || /^part$/i.test(name)) continue;
    const mine = r.from?.length ? r.from.map((n) => n - 1) : [at.get(r) ?? -1];
    for (const i of mine) {
      if (reading.roles[i]?.role !== 'part' || out.has(i)) continue;
      const why = run.whys?.get(r.part)?.[k];
      out.set(i, { name: capFirst(name), ...(why ? { why } : {}) });
    }
  }
  return out;
}

/** The name over the middle column: a writer's full name; for a style, its short name, since its title is a sentence. */
const headOf = (v: AuthorInfo) => (v.style ? v.short : v.title);
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export function result(o: ResultOptions): ResultView {
  const select = h('select', { class: 'pg-select', id: 'pg-voice-result', 'aria-label': 'Voice' }) as HTMLSelectElement;
  select.addEventListener('change', () => o.onVoice(select.value));
  const prev = button('◂', () => step(-1), { class: 'pg-btn pg-arrow' });
  const next = button('▸', () => step(1), { class: 'pg-btn pg-arrow' });
  const copyBtn = button('Copy', () => void copy());
  const tools = h('div', { class: 'pg-tools' }, button('← Edit', () => o.onEdit()), h('div', { class: 'pg-flip' }, prev, select, next), h('span', { class: 'pg-grow' }), copyBtn);
  const askEl = h('div', { class: 'pg-ask', hidden: true, role: 'status' });
  const restingEl = h('p', { class: 'pg-resting', hidden: true, role: 'status' });
  const progressEl = h('div', { class: 'pg-progress', hidden: true, role: 'status' });
  const shapeEl = h('div', { class: 'pg-line pg-shape', hidden: true });
  const styleEl = h('div', { class: 'pg-line pg-style', hidden: true });
  const voiceHead = h('div', {});
  const colHead = h('div', { class: 'pg-cols pg-cols-head', 'aria-hidden': 'true' }, h('div', {}, 'Yours'), voiceHead, h('div', {}, 'Why'));
  const legendEl = h('p', { class: 'pg-legend', hidden: true });
  const rowsEl = h('div', { class: 'pg-rows' });
  const factsEl = h('section', { class: 'pg-facts', hidden: true, 'aria-label': 'Facts' });
  const el = h('section', { class: 'pg-result', hidden: true, 'aria-label': 'The rewrite' }, tools, askEl, restingEl, progressEl, shapeEl, styleEl, colHead, legendEl, rowsEl, factsEl);
  let state: ResultState | null = null;
  let lastBorrowed = new Map<number, Borrowed>();
  let lastReading: Reading | null = null;

  function step(d: number) {
    if (!state || state.flip.length < 2) return;
    const i = state.flip.indexOf(state.voice.id);
    const id = state.flip[(i + d + state.flip.length) % state.flip.length]!;
    o.onVoice(id);
  }

  // -----------------------------------------------------------------------------------------------------------
  // The lines above the rows

  // The voice's outline on view, and whether it is open: kept across redraws, which come once a second while a
  // rewrite streams in. The block is built again only when what it shows has changed, so an open definition stays.
  let outlineAt = 0;
  let outlineOpen = false;
  let shapeDrawn = '';

  /** A role word, defined on tap. A guess, or a role read from the rewrite, is lighter and says what it is. */
  function roleWord(name: string, title?: string): Node[] {
    const word = o.terms.labelled(name) as Node[];
    return title ? [h('span', { class: 'pg-guess', title }, ...word)] : word.map((x) => (typeof x === 'string' ? document.createTextNode(x) : x));
  }

  /** The student's line: each paragraph's roles in order, and “…” for a run the engine could not name. */
  function yoursLine(r: Reading, borrowed: Map<number, Borrowed>, v: AuthorInfo): { nodes: (Node | string)[]; guessed: boolean; read: boolean } {
    const items: ({ name: string; title?: string } | null)[] = [];
    let guessed = false;
    let read = false;
    r.roles.forEach((p, i) => {
      const named = (p.spans ?? []).filter((x) => x.role !== 'part');
      if (named.length) {
        for (const x of named) {
          const guess = x.confidence < GUESS;
          guessed ||= guess;
          items.push({ name: x.role === p.role ? p.name : capFirst(x.role), ...(guess ? { title: GUESS_TITLE } : {}) });
        }
      } else if (p.role !== 'part') items.push({ name: p.name });
      else if (borrowed.has(i)) {
        read = true;
        items.push({ name: borrowed.get(i)!.name, title: fromRewrite(borrowed.get(i)!, v) });
      } else if (items.at(-1) !== null) items.push(null);
    });
    const nodes = items.flatMap((x, i) => [...(i ? [' · '] : []), ...(x ? roleWord(x.name, x.title) : [h('span', { class: 'pg-gap', title: GAP_TITLE, 'aria-label': GAP_TITLE }, GAP)])]);
    return { nodes, guessed, read };
  }
  const fromRewrite = (b: Borrowed, v: AuthorInfo) => `Read from the rewrite: what ${v.short}’s version of this paragraph does.${b.why ? ` ${b.why}` : ''}`;

  /** The voice's line: a real piece of the voice's, its parts named on one line. It opens to show each part. */
  function voiceLines(r: Reading, v: AuthorInfo): (HTMLElement | null)[] {
    const outs = r.shape.outlines ?? [];
    if (!outs.length) return [];
    const out = outs[outlineAt % outs.length]!;
    const list = h(
      'ol',
      { class: 'pg-outline', id: 'pg-outline', hidden: !outlineOpen },
      ...out.parts.map((x) => h('li', {}, h('span', { class: 'pg-outline-role' }, ...o.terms.labelled(x.name)), h('span', { class: 'pg-outline-says' }, x.says, ' ', h('q', {}, x.quote)))),
      h('li', { class: 'pg-outline-cite' }, h('span', {}), h('cite', {}, out.cite)),
    );
    const open = button(outlineOpen ? 'Hide parts' : 'Show parts', () => {
      outlineOpen = !outlineOpen;
      list.hidden = !outlineOpen;
      open.textContent = outlineOpen ? 'Hide parts' : 'Show parts';
      open.setAttribute('aria-expanded', String(outlineOpen));
    }, { class: 'pg-link pg-outline-open', 'aria-expanded': String(outlineOpen), 'aria-controls': 'pg-outline' });
    const another =
      outs.length > 1
        ? button('Another', () => {
            outlineAt = (outlineAt + 1) % outs.length;
            shapeDrawn = '';
            if (state) drawShape(state);
            shapeEl.querySelector<HTMLButtonElement>('.pg-outline-next')?.focus();
          }, { class: 'pg-link pg-outline-next', title: `${outs.length} pieces of this kind by ${v.short}` })
        : null;
    return [h('p', { class: 'pg-shape-voice' }, h('span', { class: 'pg-who' }, `${capFirst(v.short)}, in ${out.work}: `), ...o.terms.shape(out.line), ' ', open, another ? ' ' : null, another), list];
  }

  function drawShape(s: ResultState, borrowed: Map<number, Borrowed> = lastBorrowed) {
    lastBorrowed = borrowed;
    const r = s.reading;
    shapeEl.hidden = !r;
    styleEl.hidden = !r;
    if (!r) {
      shapeDrawn = '';
      return;
    }
    const v = s.voice;
    const outs = r.shape.outlines ?? [];
    const key = JSON.stringify([v.id, r.voice, r.paragraphs.length, r.shape.yours, r.form?.id, r.form?.auto, outs.map((x) => x.work), outlineAt, [...borrowed]]);
    if (key === shapeDrawn && lastReading === r) return;
    if (lastReading !== r) outlineAt = 0;
    lastReading = r;
    shapeDrawn = key;
    const yours = r.roles?.length ? yoursLine(r, borrowed, v) : { nodes: o.terms.shape(r.shape.yours), guessed: false, read: false };
    const keyLine = yours.read ? 'Lighter words are a guess, or read from the rewrite.' : yours.guessed ? 'Lighter words are a guess.' : '';
    shapeEl.replaceChildren(
      h('span', { class: 'pg-line-label' }, 'Shape'),
      h(
        'div',
        { class: 'pg-line-body' },
        h('p', { class: 'pg-shape-yours' }, h('span', { class: 'pg-who' }, 'Yours: '), ...yours.nodes, keyLine ? h('span', { class: 'pg-shape-key' }, ` ${keyLine}`) : null),
        r.form && r.shape.form ? h('p', { class: 'pg-shape-form' }, h('span', { class: 'pg-who' }, ...o.terms.labelled(r.form.name, 'form'), ': '), ...o.terms.shape(r.shape.form)) : null,
        // Only for a form the student chose: under Auto the form is the engine's reading of what the text already is.
        r.form && !r.form.auto && r.form.missing.length
          ? h('p', { class: 'pg-line-note pg-shape-missing' }, 'Not in yours: ', ...o.terms.shape(r.form.slots.filter((x) => x.missing).map((x) => x.name).join(' · ')))
          : null,
        ...voiceLines(r, v),
      ),
    );
    const st = r.style;
    const top = Math.max(st.voiceBand[1], ...st.lengths, 1);
    const bars = h(
      'span',
      { class: 'pg-bars', 'aria-hidden': 'true', title: `Half of ${v.short}’s sentences run ${st.voiceBand[0]} to ${st.voiceBand[1]} words` },
      h('span', { class: 'pg-band', style: { bottom: `${(st.voiceBand[0] / top) * 100}%`, height: `${((st.voiceBand[1] - st.voiceBand[0]) / top) * 100}%` } }),
      ...st.lengths.slice(0, 24).map((n) => h('span', { class: 'pg-bar', style: { height: `${Math.max(6, (n / top) * 100)}%` } })),
    );
    styleEl.replaceChildren(h('span', { class: 'pg-line-label' }, 'Style'), h('div', { class: 'pg-line-body' }, h('p', {}, bars, ...o.terms.defined(st.line))));
  }

  function progress(s: ResultState) {
    const run = s.run;
    const v = s.voice;
    if (!run || (run.done && !run.failed && !run.partial) || run.resting) {
      progressEl.hidden = true;
      return;
    }
    progressEl.hidden = false;
    progressEl.classList.toggle('pg-bad', !!run.failed || !!run.partial);
    if (run.failed) progressEl.replaceChildren(h('span', {}, `${run.failed} `), ...(run.final ? [] : [button('Try again', () => o.onRetry())]));
    else if (run.partial) progressEl.replaceChildren(h('span', {}, 'Some parts were not rewritten. '), button('Try again', () => o.onRetry()));
    else progressEl.replaceChildren(h('span', { class: 'pg-dotpulse', 'aria-hidden': 'true' }), `${v.short} is writing · ${where(run)} · ${mmss(Date.now() - run.started)}`);
  }

  // -----------------------------------------------------------------------------------------------------------
  // The rows

  /** The rows to draw: the rewrite's, else one to each paragraph the engine read. */
  function rowsOf(s: ResultState): Row[] {
    if (s.run?.rows.size) return [...s.run.rows.values()].sort((a, b) => a.index - b.index);
    const r = s.reading;
    if (!r) return [];
    return r.paragraphs.map((p, i) => {
      const sk = r.sketch.filter((x) => x.paragraph === i);
      return { kind: 'paragraph', index: i, part: 0, yours: sk.length ? sk.map((x) => ({ n: -1, text: x.text, never: [] })) : [{ n: -1, text: p, never: [] }], hers: null, notes: [] } as Para;
    });
  }

  function draw(s: ResultState) {
    state = s;
    const v = s.voice;
    fillVoices(select, o.voices, v.id, s.suggested, s.ready);
    const flip = s.flip.length > 1;
    prev.hidden = next.hidden = !flip;
    prev.setAttribute('aria-label', 'Previous ready voice');
    next.setAttribute('aria-label', 'Next ready voice');
    voiceHead.textContent = headOf(v);
    const run = s.run;
    restingEl.hidden = !(run?.resting || (s.resting && !run?.rows.size));
    restingEl.textContent = run?.resting === 'busy' ? 'Another rewrite from this page is still running. Try this one when it finishes.' : RESTING;
    progress(s);

    const rows = rowsOf(s);
    // Which paragraph of the engine's reading each row is, and the roles the rewrite's reading lends the paragraphs
    // the engine could not name.
    const at = new Map<Row, number | null>();
    let cursor = 0;
    for (const r of rows) {
      if (r.kind !== 'paragraph') continue;
      const idx = paragraphOf(s.reading, r, cursor);
      if (idx !== null) cursor = idx + 1;
      at.set(r, idx);
    }
    const borrowed = rolesFromRewrite(s.reading, s.run, rows, at);
    drawShape(s, borrowed);
    // An open Try it, with what the student typed in it, stays in its row across a redraw.
    const focused = document.activeElement;
    const open = new Map<string, HTMLElement>();
    for (const t of rowsEl.querySelectorAll<HTMLElement>('.pg-row > .pg-tryit')) {
      const at = (t.parentElement as HTMLElement).dataset.index;
      if (at) open.set(at, t);
    }
    const seen = new Set<string>();
    const marked = new Set<string>();
    const notes = numberFacts(rows);
    const noteOf = new Map(notes.map((x) => [x.fact.id, x.n]));
    // Each paragraph's place in its part, for the writer's role of it.
    const place = new Map<Row, number>();
    const per = new Map<number, number>();
    for (const r of rows)
      if (r.kind === 'paragraph') {
        place.set(r, per.get(r.part) ?? 0);
        per.set(r.part, (per.get(r.part) ?? 0) + 1);
      }
    rowsEl.replaceChildren(
      ...rows.map((r) => {
        if (r.kind === 'heading') return h('h2', { class: `pg-heading${r.title ? ' pg-heading-title' : ''}` }, r.text);
        return paraRow(s, r, at.get(r) ?? null, place.get(r) ?? 0, seen, marked, noteOf, borrowed);
      }),
    );
    // One legend line, and only when something was added; the facts under the rows, and only when there are some.
    const added = rows.some((r) => r.kind === 'paragraph' && (r.hers ?? []).some((x) => x.added?.length));
    legendEl.hidden = !added && !notes.length;
    legendEl.replaceChildren(...(added ? [h('mark', { class: 'pg-added' }, 'Highlighted text'), ' was added. It is not in yours.'] : []), notes.length ? `${added ? ' ' : ''}A small number points to a fact under the rewrite.` : '');
    factsEl.hidden = !notes.length;
    factsEl.replaceChildren(
      h('p', { class: 'pg-label' }, 'Facts'),
      h(
        'ol',
        {},
        ...notes.map(({ n, fact }) => {
          const url = wikiUrl(fact.url);
          return h('li', { id: `pg-fact-${n}`, value: n }, `“${fact.text}” `, h('cite', {}, url ? h('a', { href: url, target: '_blank', rel: 'noopener' }, fact.title) : fact.title, ', Wikipedia'));
        }),
      ),
    );
    for (const [at, t] of open) {
      const row = rowsEl.querySelector<HTMLElement>(`.pg-row[data-index="${at}"]`) ?? rowsEl.querySelector<HTMLElement>(`.pg-row[data-index^="${Math.floor(Number(at))}."]`);
      if (!row) continue;
      row.append(t);
      if (focused instanceof HTMLElement && t.contains(focused)) focused.focus();
    }
    copyBtn.disabled = !rows.some((r) => r.kind === 'paragraph' && r.hers);
  }

  /** Which paragraph of the engine's reading a row is, looking forward from the last one found. */
  function paragraphOf(r: Reading | null, row: Para, from: number): number | null {
    if (!r) return null;
    if (row.yours[0]?.n === -1 && !row.hers && Number.isInteger(row.index) && r.paragraphs[row.index] && !state?.run?.rows.size) return row.index;
    const first = norm(row.yours[0]?.text ?? '').slice(0, 60);
    if (!first) return null;
    for (let i = from; i < r.paragraphs.length; i++) if (norm(r.paragraphs[i]!).includes(first)) return i;
    const i = r.paragraphs.findIndex((p) => norm(p).includes(first));
    return i >= 0 ? i : null;
  }

  function paraRow(s: ResultState, r: Para, idx: number | null, at: number, seen: Set<string>, marked: Set<string>, noteOf: Map<string, number>, borrowed: Map<number, Borrowed> = new Map()): HTMLElement {
    const v = s.voice;
    const reading = s.reading;
    // The engine's role for the paragraph; where it has none, the role the rewrite's reading gives it, marked as that.
    const mine = idx !== null ? reading?.roles[idx] : undefined;
    const lent = idx !== null && mine?.role === 'part' ? borrowed.get(idx) : undefined;
    const roleYours = mine && mine.role !== 'part' ? mine.name : lent?.name;
    const roleTitle = lent ? fromRewrite(lent, v) : mine && mine.role !== 'part' && mine.confidence < GUESS ? GUESS_TITLE : undefined;
    const roleHers = r.hers ? s.run?.roles.get(r.part)?.[at] : undefined;
    const row = h('div', { class: 'pg-row', 'data-index': String(r.index) });
    const cells = h('div', { class: 'pg-cols' });
    row.append(cells);

    // YOURS: the sentences, with the words the voice never wrote dotted (five at most on the page). For a style the
    // dotted words are the writer's needless ones, each placed by where the engine found it.
    const opened = h('p', { class: 'pg-open-line', hidden: true, 'aria-live': 'polite' });
    const needless = reading?.marks === 'needless';
    const nevers = (reading?.never ?? []).filter((w) => w.paragraph === idx && (needless || !marked.has(w.word.toLowerCase())));
    const para = idx !== null ? (reading?.paragraphs[idx] ?? '') : '';
    let cursor = 0;
    const text = h(
      'div',
      { class: 'pg-yours-text' },
      ...r.yours.flatMap((y, i) => {
        if (!needless) return [i ? ' ' : '', yourSentence(y.n, y.text, nevers, marked, opened)];
        // Where this sentence stands in its paragraph, looking forward from the last one found.
        let at = para.indexOf(y.text, cursor);
        if (at < 0) at = para.indexOf(y.text);
        if (at >= 0) cursor = at + y.text.length;
        return [i ? ' ' : '', needlessSentence(y.n, y.text, at, nevers, opened)];
      }),
    );
    if (r.filled) {
      text.replaceChildren(h('p', { class: 'pg-filled' }, r.filled));
      text.classList.add('pg-full');
    }
    const more = button('Show all', () => {
      const on = text.classList.toggle('pg-full');
      more.textContent = on ? 'Show less' : 'Show all';
    }, { class: 'pg-link pg-more' });
    cells.append(
      h(
        'div',
        { class: 'pg-cell pg-yours' },
        label('Yours', r.filled ? undefined : roleYours, r.from?.length && r.from.length > 1 ? `your paragraphs ${listOf(r.from)}` : r.moved && r.from?.length ? `your paragraph ${r.from[0]}` : undefined, roleTitle),
        text,
        r.filled ? null : more,
        opened,
      ),
    );

    // THEIRS: the rewrite, else the sketch.
    const theirs = h('div', { class: 'pg-cell pg-hers' }, label(headOf(v), roleHers));
    if (r.hers) theirs.append(h('div', {}, ...r.hers.flatMap((x, i) => [i ? ' ' : '', herSentence(x, row, noteOf)])));
    else {
      if (r.resting === 'long') theirs.append(h('p', { class: 'pg-muted' }, 'Only the first 1,200 words are rewritten.'));
      else if (r.error) theirs.append(h('p', { class: 'pg-muted' }, 'This part could not be rewritten.'));
      else if (r.resting === 'budget') theirs.append(h('p', { class: 'pg-muted' }, 'This part was not rewritten. Rewrites are resting for now.'));
      theirs.append(sketch(v, reading?.sketch.filter((x) => x.paragraph === idx) ?? []));
    }
    cells.append(theirs);

    // WHY: two notes at most, no move twice on the page.
    const why = h('div', { class: 'pg-cell pg-why' }, label('Why'));
    let n = 0;
    for (const note of r.notes) {
      if (n >= NOTES_PER_ROW) break;
      if (note.kind === 'move') {
        const k = note.id ?? note.technique.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
      }
      why.append(noteEl(s, note, r, row));
      n++;
    }
    if (!r.hers && s.run?.drills)
      for (const d of s.run.drills) {
        if (n >= NOTES_PER_ROW || seen.has(`drill:${d.move}`)) continue;
        if (!r.yours.some((y) => norm(y.text).includes(norm(d.sentence).slice(0, 60)))) continue;
        seen.add(`drill:${d.move}`);
        why.append(drillEl(s, d, row));
        n++;
      }
    cells.append(why);
    return row;
  }

  /** A cell's label: the column's name, always read aloud and shown on a phone, and the paragraph's role. */
  function label(col: string, role?: string, extra?: string, guess?: string): HTMLElement {
    return h('p', { class: 'pg-cell-label' }, h('span', { class: 'pg-colname' }, col), role ? h('span', { class: `pg-role${guess ? ' pg-guess' : ''}`, title: guess }, ...o.terms.labelled(role)) : null, extra ? h('span', { class: 'pg-from' }, extra) : null);
  }

  function yourSentence(n: number, text: string, nevers: Reading['never'], marked: Set<string>, opened: HTMLElement): HTMLElement {
    const el = h('span', { class: 'pg-s', 'data-n': String(n) });
    const words = nevers.filter((w) => !marked.has(w.word.toLowerCase()));
    if (!words.length) {
      el.textContent = text;
      return el;
    }
    const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
    const re = new RegExp(`(?<![\\p{L}'’])(${words.map((x) => esc(x.word)).join('|')})(?![\\p{L}'’])`, 'giu');
    let at = 0;
    for (const m of text.matchAll(re)) {
      const w = words.find((x) => x.word.toLowerCase().replace(/’/g, "'") === m[0].toLowerCase().replace(/’/g, "'"));
      if (!w || marked.has(w.word.toLowerCase())) continue;
      marked.add(w.word.toLowerCase());
      el.append(text.slice(at, m.index));
      const b = h('button', { type: 'button', class: 'pg-never', 'aria-expanded': 'false' }, m[0]);
      b.addEventListener('click', () => {
        const on = opened.hidden || opened.dataset.word !== w.word;
        for (const x of opened.parentElement?.querySelectorAll('.pg-never') ?? []) x.setAttribute('aria-expanded', 'false');
        opened.hidden = !on;
        opened.dataset.word = w.word;
        opened.textContent = w.note;
        b.setAttribute('aria-expanded', String(on));
      });
      el.append(b);
      at = m.index! + m[0].length;
    }
    el.append(text.slice(at));
    return el;
  }

  /** A sentence of the writer's with its needless words dotted, each by its offsets in the paragraph. A tap opens
   * the reason in one line, with the word's kind (a hedge, an intensifier) defined in it. */
  function needlessSentence(n: number, text: string, at: number, words: Reading['never'], opened: HTMLElement): HTMLElement {
    const el = h('span', { class: 'pg-s', 'data-n': String(n) });
    const here = at < 0 ? [] : words.filter((w) => w.start >= at && w.end <= at + text.length).sort((a, b) => a.start - b.start);
    let done = 0;
    for (const w of here) {
      const [a, b] = [w.start - at, w.end - at];
      if (a < done) continue;
      el.append(text.slice(done, a));
      const btn = h('button', { type: 'button', class: 'pg-never pg-needless', 'aria-expanded': 'false' }, text.slice(a, b));
      btn.addEventListener('click', () => {
        const key = `${w.paragraph}:${w.start}`;
        const on = opened.hidden || opened.dataset.word !== key;
        for (const x of opened.parentElement?.querySelectorAll('.pg-never') ?? []) x.setAttribute('aria-expanded', 'false');
        opened.hidden = !on;
        opened.dataset.word = key;
        const line = o.terms.defined(w.note);
        // The kind's name may not be in the reason itself: then its definition follows the reason.
        const term = w.term ? o.terms.definition(w.term) : null;
        const named = line.some((x) => x instanceof HTMLElement && x.classList.contains('pg-term'));
        opened.replaceChildren(...line, ...(term && !named ? [' ', ...o.terms.defined(`${term.term}: ${term.definition}`)] : []));
        btn.setAttribute('aria-expanded', String(on));
      });
      el.append(btn);
      done = b;
    }
    el.append(text.slice(done));
    return el;
  }

  function herSentence(x: HerSentence, row: HTMLElement, noteOf: Map<string, number> = new Map()): HTMLElement {
    // Added text is built as nodes, never as HTML: the words may come from an article.
    const el = h('span', { class: 'pg-s pg-her', tabindex: 0 });
    let done = 0;
    for (const [a, b] of [...(x.added ?? [])].sort((p, q) => p[0] - q[0])) {
      const [from, to] = [Math.max(done, a), Math.min(x.text.length, b)];
      if (to <= from) continue;
      el.append(x.text.slice(done, from), h('mark', { class: 'pg-added' }, x.text.slice(from, to)));
      done = to;
    }
    el.append(x.text.slice(done));
    for (const f of x.facts ?? []) {
      const n = noteOf.get(f.id);
      if (!n) continue;
      const a = h('a', { href: `#pg-fact-${n}`, 'aria-label': `Fact ${n}` }, String(n));
      a.addEventListener('click', (e) => e.stopPropagation());
      el.append(h('sup', { class: 'pg-fn' }, a));
    }
    const lit = (on: boolean) => {
      el.classList.toggle('pg-lit', on);
      for (const n of x.from) row.querySelector(`.pg-yours .pg-s[data-n="${n}"]`)?.classList.toggle('pg-lit', on);
    };
    el.addEventListener('mouseenter', () => lit(true));
    el.addEventListener('mouseleave', () => lit(false));
    el.addEventListener('focus', () => lit(true));
    el.addEventListener('blur', () => lit(false));
    el.addEventListener('click', () => lit(!el.classList.contains('pg-lit')));
    return el;
  }

  function sketch(v: AuthorInfo, rows: SketchRow[]): HTMLElement {
    const found = rows.filter((x) => x.match);
    if (!found.length) return h('p', { class: 'pg-muted pg-sketch-none' }, rows.length ? `${v.short} has no sentence built like these.` : '');
    return h(
      'div',
      { class: 'pg-sketch' },
      h('p', { class: 'pg-sketch-label' }, `${v.short}’s own sentences, built like yours`),
      ...found.map((x) => h('p', { class: 'pg-sketch-s' }, `“${x.match!.text.replace(/^[“"]|[”"]$/g, '')}”`, ' ', h('cite', {}, x.match!.cite))),
    );
  }

  // -----------------------------------------------------------------------------------------------------------
  // The notes

  function noteEl(s: ResultState, n: Note, r: Para, row: HTMLElement): HTMLElement {
    if (n.kind === 'liberty')
      return h('div', { class: 'pg-note pg-note-liberty' }, h('p', { class: 'pg-note-head' }, n.technique), h('p', { class: 'pg-note-change' }, `“${n.after.trim().replace(/^[“"]|[”"]$/g, '')}”`), n.text ? h('p', { class: 'pg-note-text' }, ...o.terms.defined(n.text)) : null);
    if (n.kind === 'sense' || n.kind === 'structure') return h('div', { class: `pg-note pg-note-${n.kind}` }, h('p', { class: 'pg-note-head' }, n.kind === 'sense' ? 'Mended' : 'Structure'), h('p', { class: 'pg-note-text' }, ...o.terms.defined(n.text ?? '')));
    const term = n.term ? o.terms.definition(n.term) : null;
    const named = term && [term.term, ...term.names].some((x) => norm(n.technique).includes(norm(x.replace(/\s*\(.*\)$/, ''))));
    const head = term && !named ? `${n.technique} (${term.term.replace(/\s*\(.*\)$/, '').toLowerCase()})` : n.technique;
    const passage = h('div', { class: 'pg-passage', hidden: true });
    const actions = h('div', { class: 'pg-note-actions' });
    if (n.quote?.id) {
      const read = button('Read it', () => void readIt(s.voice, n.quote!, passage, read), { 'aria-expanded': 'false' });
      actions.append(read);
    }
    const mine = r.yours.find((y) => n.before && norm(y.text).includes(norm(n.before).slice(0, 40)))?.text ?? (n.before && n.before.length < 240 ? n.before : r.yours[0]?.text ?? '');
    actions.append(tryButton(s, row, { move: n.id ?? n.technique, name: n.technique, sentence: mine }));
    return h('div', { class: 'pg-note' }, h('p', { class: 'pg-note-head' }, ...o.terms.defined(head)), n.text ? h('p', { class: 'pg-note-text' }, ...o.terms.defined(n.text)) : null, n.quote ? quoteEl(n.quote) : null, actions, passage);
  }

  function drillEl(s: ResultState, d: Drill, row: HTMLElement): HTMLElement {
    return h('div', { class: 'pg-note pg-note-drill' }, h('p', { class: 'pg-note-head' }, ...o.terms.defined(`Try: ${d.name}`)), h('p', { class: 'pg-note-text' }, ...o.terms.defined(d.hint)), h('div', { class: 'pg-note-actions' }, tryButton(s, row, { move: d.move, name: d.name, sentence: d.sentence, hint: d.hint })));
  }

  function tryButton(s: ResultState, row: HTMLElement, t: { move: string; name: string; sentence: string; hint?: string }): HTMLButtonElement {
    const b = button('Try it', () => {
      row.querySelector('.pg-tryit')?.remove();
      const block = tryIt({
        voice: s.voice,
        ...t,
        terms: o.terms,
        moves: o.moves,
        onClose: () => {
          block.remove();
          b.focus();
        },
      });
      row.append(block);
      block.querySelector('textarea')?.focus();
    });
    return b;
  }

  function quoteEl(q: Quote): HTMLElement {
    const [a, b] = q.mark ?? [0, 0];
    const words = b > a && b - a < q.text.length ? [q.text.slice(0, a), h('mark', { class: 'pg-hl' }, q.text.slice(a, b)), q.text.slice(b)] : [q.text];
    return h('blockquote', { class: 'pg-q' }, h('span', {}, '“', ...words, '”'), ' ', h('cite', {}, q.cite));
  }

  async function readIt(v: AuthorInfo, q: Quote, box: HTMLElement, btn: HTMLButtonElement) {
    if (!box.hidden) {
      box.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'Read it';
      return;
    }
    box.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = 'Hide it';
    if (box.childNodes.length) return;
    box.replaceChildren(h('p', { class: 'pg-muted' }, 'Opening…'));
    try {
      const c = await get<{ paragraph: { text: string; start: number; end: number } | null }>(`/api/context?author=${encodeURIComponent(v.id)}&sentence=${q.id}`);
      const p = c.paragraph;
      box.replaceChildren(p ? h('p', {}, p.text.slice(0, p.start), h('mark', {}, p.text.slice(p.start, p.end)), p.text.slice(p.end)) : h('p', {}, q.text), h('p', { class: 'pg-muted' }, q.cite));
    } catch (e) {
      box.replaceChildren(h('p', { class: 'pg-muted' }, (e as Error).message));
    }
  }

  async function copy() {
    if (!state?.run) return;
    const text = plainText([...state.run.rows.values()].sort((a, b) => a.index - b.index));
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Could not copy';
    }
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1600);
  }

  return {
    el,
    select,
    draw,
    progress: (s) => progress(s),
    ask(v, keepV) {
      if (!v) {
        askEl.hidden = true;
        return;
      }
      const yes = button('Rewrite', () => o.onConfirm(v.id), { class: 'pg-btn pg-btn-main' });
      askEl.replaceChildren(h('span', {}, `Rewrite as ${v.title}? A page takes about 20 seconds; a long piece takes longer.`), yes, button(`Keep ${keepV.short}`, () => o.onVoice(keepV.id)));
      askEl.hidden = false;
      yes.focus();
    },
  };
}
