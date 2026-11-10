// RESULT and WRITING: the student's text and the voice's in three columns, yours, theirs and why, a row to each
// paragraph. Above the rows are one SHAPE line (how the piece is built) and one STYLE line (how its sentences run).
// Until the rewrite of a paragraph arrives, its middle column holds a SKETCH: for each sentence of yours, the voice's
// own sentence built most like it. Nothing here opens over the page: every tap opens a line in place.

import { button, get, h, type AuthorInfo, type Definer, type Drill, type HerSentence, type Note, type Para, type Quote, type Reading, type Row, type SketchRow } from './api.ts';
import { fillVoices, RESTING, type Suggested } from './compose.ts';
import type { GuessView } from './guesscard.ts';
import type { MovesView } from './moves.ts';
import { tryIt } from './tryit.ts';

/** One rewrite of one text in one voice, as it streams in. */
export interface Run {
  voice: string;
  text: string;
  rows: Map<number, Row>;
  /** The writer's role for each paragraph, by part. */
  roles: Map<number, string[]>;
  done: boolean;
  /** Why the rewrite failed. */
  failed?: string;
  /** No rewrite: 'resting' (no writer, or the day's budget is spent) or 'busy' (another is still running). */
  resting?: 'resting' | 'busy';
  started: number;
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
  guess: GuessView;
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
  const guessRow = h('div', { class: 'pg-cols pg-guess-row' }, h('div', {}), h('div', { class: 'pg-guess-slot' }), h('div', {}));
  const rowsEl = h('div', { class: 'pg-rows' });
  const el = h('section', { class: 'pg-result', hidden: true, 'aria-label': 'The rewrite' }, tools, askEl, restingEl, progressEl, shapeEl, styleEl, colHead, guessRow, rowsEl);
  let state: ResultState | null = null;

  function step(d: number) {
    if (!state || state.flip.length < 2) return;
    const i = state.flip.indexOf(state.voice.id);
    const id = state.flip[(i + d + state.flip.length) % state.flip.length]!;
    o.onVoice(id);
  }

  // -----------------------------------------------------------------------------------------------------------
  // The lines above the rows

  function drawShape(s: ResultState) {
    const r = s.reading;
    shapeEl.hidden = !r;
    styleEl.hidden = !r;
    if (!r) return;
    const v = s.voice;
    shapeEl.replaceChildren(
      h('span', { class: 'pg-line-label' }, 'Shape'),
      h(
        'div',
        { class: 'pg-line-body' },
        h('p', {}, h('span', { class: 'pg-who' }, 'Yours: '), ...o.terms.defined(r.shape.yours)),
        r.shape.voice ? h('p', {}, h('span', { class: 'pg-who' }, `${v.short}: `), ...o.terms.defined(r.shape.voice)) : null,
        r.shape.signature ? h('p', { class: 'pg-line-note' }, ...o.terms.defined(r.shape.signature)) : null,
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
    if (!run || (run.done && !run.failed) || run.resting) {
      progressEl.hidden = true;
      return;
    }
    progressEl.hidden = false;
    progressEl.classList.toggle('pg-bad', !!run.failed);
    if (run.failed) progressEl.replaceChildren(h('span', {}, 'The rewrite failed. '), button('Try again', () => o.onRetry()));
    else progressEl.replaceChildren(h('span', { class: 'pg-dotpulse', 'aria-hidden': 'true' }), `${v.short} is writing · about 20 s · ${mmss(Date.now() - run.started)}`);
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
    voiceHead.textContent = v.title;
    const run = s.run;
    restingEl.hidden = !(run?.resting || (s.resting && !run?.rows.size));
    restingEl.textContent = run?.resting === 'busy' ? 'Another rewrite from this page is still running. Try this one when it finishes.' : RESTING;
    drawShape(s);
    progress(s);

    const writing = !!run && !run.done && !run.failed && !run.resting && ![...run.rows.values()].some((r) => r.kind === 'paragraph' && r.hers);
    guessRow.hidden = !writing;
    if (writing) guessRow.querySelector('.pg-guess-slot')!.replaceChildren(o.guess.el);

    const rows = rowsOf(s);
    const seen = new Set<string>();
    const marked = new Set<string>();
    let from = 0;
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
        const idx = paragraphOf(s.reading, r, from);
        if (idx !== null) from = idx + 1;
        return paraRow(s, r, idx, place.get(r) ?? 0, seen, marked);
      }),
    );
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

  function paraRow(s: ResultState, r: Para, idx: number | null, at: number, seen: Set<string>, marked: Set<string>): HTMLElement {
    const v = s.voice;
    const reading = s.reading;
    const roleYours = idx !== null ? reading?.roles[idx]?.name : undefined;
    const roleHers = r.hers ? s.run?.roles.get(r.part)?.[at] : undefined;
    const row = h('div', { class: 'pg-row' });
    const cells = h('div', { class: 'pg-cols' });
    row.append(cells);

    // YOURS: the sentences, with the words the voice never wrote dotted (five at most on the page).
    const opened = h('p', { class: 'pg-open-line', hidden: true, 'aria-live': 'polite' });
    const nevers = (reading?.never ?? []).filter((w) => w.paragraph === idx && !marked.has(w.word.toLowerCase()));
    const text = h('div', { class: 'pg-yours-text' }, ...r.yours.flatMap((y, i) => [i ? ' ' : '', yourSentence(y.n, y.text, nevers, marked, opened)]));
    const more = button('Show all', () => {
      const on = text.classList.toggle('pg-full');
      more.textContent = on ? 'Show less' : 'Show all';
    }, { class: 'pg-link pg-more' });
    cells.append(
      h(
        'div',
        { class: 'pg-cell pg-yours' },
        label('Yours', roleYours, r.from?.length && r.from.length > 1 ? `your paragraphs ${listOf(r.from)}` : undefined),
        text,
        more,
        opened,
      ),
    );

    // THEIRS: the rewrite, else the sketch.
    const theirs = h('div', { class: 'pg-cell pg-hers' }, label(v.title, roleHers));
    if (r.hers) theirs.append(h('div', {}, ...r.hers.flatMap((x, i) => [i ? ' ' : '', herSentence(x, row)])));
    else {
      if (r.resting === 'long') theirs.append(h('p', { class: 'pg-muted' }, 'Only the first 1,200 words are rewritten.'));
      else if (r.error) theirs.append(h('p', { class: 'pg-muted' }, 'This part could not be rewritten.'));
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
  function label(col: string, role?: string, extra?: string): HTMLElement {
    return h('p', { class: 'pg-cell-label' }, h('span', { class: 'pg-colname' }, col), role ? h('span', { class: 'pg-role' }, ...o.terms.defined(role)) : null, extra ? h('span', { class: 'pg-from' }, extra) : null);
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

  function herSentence(x: HerSentence, row: HTMLElement): HTMLElement {
    const el = h('span', { class: 'pg-s pg-her', tabindex: 0 }, x.text);
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
    const rows = [...state.run.rows.values()].sort((a, b) => a.index - b.index);
    const text = rows.map((r) => (r.kind === 'heading' ? r.text : (r.hers ?? []).map((x) => x.text).join(' '))).filter(Boolean).join('\n\n');
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
      askEl.replaceChildren(h('span', {}, `Rewrite as ${v.title}? It takes about 20 seconds.`), yes, button(`Keep ${keepV.short}`, () => o.onVoice(keepV.id)));
      askEl.hidden = false;
      yes.focus();
    },
  };
}
