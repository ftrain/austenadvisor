// The page: your text in, the author's rendering out, in three columns. Yours, with the words the author never used
// marked; the author's, sentence by sentence; and why, each move with a sentence of the author's that shows it.
// Everything the engine knows is in the text itself: tap a sentence for why it was written so and the sentence it
// follows, a marked word for the author's words in its place, a word of the author's for how the author used it,
// and any citation to read it in its passage.

import './page.css';
import { get, h, post, type AuthorInfo, type WordProfile } from './api.ts';
import type { PracticeCheck } from '../engine/practice.ts';
import type { Reading } from '../server/rewrite.ts';
import type { HerSentence, Note, Quote, Row, YourSentence } from '../server/page.ts';
import { findTerms, type GlossaryEntry } from '../engine/terms.ts';

type Para = Extract<Row, { kind: 'paragraph' }>;
interface Run {
  voice: string;
  text: string;
  rows: Map<number, Row>;
  lessons: string[];
  /** The editor's read of each part: the writer's outline and the voice's plan. */
  readings: Reading[];
  model: string;
  done: boolean;
  error?: string;
}

const KEEP = 'advisor.page';
const STOP = new Set(
  'the a an and or but of to in on at by for with from as is was were be been being am are it its this that these those he she they we you i me my his her their our your him them us not no so than then there here which who whom whose what when where how all any some such one very more most much many own same too only just also into upon unto shall will would should could may might must have has had do did does'.split(
    ' ',
  ),
);

/** A title in mid-sentence: “the King James Bible”. */
const mid = (t: string) => t.replace(/^The /, 'the ');

export async function rewritePage(app: HTMLElement) {
  const [authors, ai, samples] = await Promise.all([
    get<AuthorInfo[]>('/api/authors'),
    get<{ available: boolean; model: string }>('/api/ai').catch(() => ({ available: false, model: '' })),
    get<{ id: string; title: string; text: string }[]>('/api/samples').catch(() => []),
  ]);
  const glossary = await get<GlossaryEntry[]>('/api/glossary').catch(() => [] as GlossaryEntry[]);
  const termById = new Map(glossary.map((t) => [t.id, t]));
  const voices = authors.filter((a) => a.built);
  const kept = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEEP) ?? 'null') as { voice?: string; text?: string } | null;
    } catch {
      return null;
    }
  })();
  let voice = voices.find((v) => v.id === kept?.voice) ?? voices.find((v) => v.id === 'austen') ?? voices[0]!;
  const runs = new Map<string, Run>();
  let current: Run | null = null;
  let abort: AbortController | null = null;

  // ---------------------------------------------------------------------------------------------------------
  // Terms: each term of rhetoric, poetics or grammar is defined where it is used

  /** A text with its terms marked: tap one, and its definition opens in the line, right after it. */
  function defined(text: string): (Node | string)[] {
    const out: (Node | string)[] = [];
    let at = 0;
    for (const [a, b, id] of findTerms(glossary, text)) {
      const t = termById.get(id)!;
      out.push(text.slice(at, a));
      const def = h('span', { class: 'pg-def', hidden: true }, ` (${lower(t.definition).replace(/\.$/, '')})`);
      const btn = h('button', { class: 'pg-term', title: t.definition, 'aria-expanded': 'false' }, text.slice(a, b));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        def.hidden = !def.hidden;
        btn.setAttribute('aria-expanded', String(!def.hidden));
        place();
      });
      out.push(btn, def);
      at = b;
    }
    out.push(text.slice(at));
    return out;
  }
  const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^(I|O)\b/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

  /** What a move or a figure is: the voice's own account of its move, else the glossary's. */
  function definitionOf(name: string): string | null {
    const n = name.trim().toLowerCase();
    const mv = voice.moves?.find((x) => x.name.toLowerCase() === n);
    if (mv) return mv.does;
    const t = glossary.find((x) => x.names.includes(n) || x.names.includes(n.replace(/(es|s)$/, '')));
    return t?.definition ?? null;
  }

  /** A note's heading, the move it names, and what that is. */
  function moveHead(technique: string): (HTMLElement | null)[] {
    const d = definitionOf(technique);
    return [h('div', { class: 'pg-note-move' }, technique), d ? h('p', { class: 'pg-note-def' }, d) : null];
  }

  // ---------------------------------------------------------------------------------------------------------
  // The frame

  const voiceBtn = h('button', { class: 'pg-voice-btn', 'aria-haspopup': 'listbox', onclick: (e: Event) => openPicker(e.currentTarget as HTMLElement) });
  const head = h('header', { class: 'pg-head' }, h('a', { class: 'pg-brand', href: '/' }, h('span', { class: 'pg-mark' }, 'A'), h('span', {}, 'Advisor')), voiceBtn);
  /** The voices as cards: on the writing page, and in the head's menu. */
  const cards = (onPick: (v: AuthorInfo) => void) =>
    h(
      'div',
      { class: 'pg-cards', role: 'listbox', 'aria-label': 'Voice' },
      ...voices.map((x) =>
        h(
          'button',
          { class: 'pg-card', role: 'option', 'data-voice': x.id, 'aria-selected': String(x.id === voice.id), onclick: () => onPick(x) },
          h('span', { class: 'pg-card-head' }, h('span', { class: 'pg-dot' }), h('strong', {}, x.title), h('span', { class: 'pg-years' }, x.years)),
          x.tagline ? h('span', { class: 'pg-card-tag' }, x.tagline) : null,
          x.epigraph ? h('span', { class: 'pg-card-line' }, `“${x.epigraph.text}”`) : null,
        ),
      ),
    );
  const picker = h('div', { class: 'pg-picker' });
  function openPicker(anchor: HTMLElement) {
    showPop(anchor, h('p', { class: 'pg-pop-label' }, result.hidden ? 'Write it as' : 'Rewrite it as'), cards((x) => (hidePop(), x.id !== voice.id && setVoice(x, !result.hidden))));
    pop.classList.add('pg-pop-wide');
    place();
  }

  const area = h('textarea', {
    class: 'pg-input',
    rows: 12,
    spellcheck: true,
    placeholder: 'Paste or write a passage: a paragraph, a letter, a page.',
    'aria-label': 'Your text',
  }) as HTMLTextAreaElement;
  area.value = kept?.text ?? '';
  const go = h('button', { class: 'pg-go', onclick: () => void start() });
  const hello = h('h1', { class: 'pg-title' });
  const lede = h('p', { class: 'pg-lede' });
  const tries = h(
    'div',
    { class: 'pg-tries' },
    h('span', {}, 'Try one:'),
    ...samples.slice(0, 6).map((s) =>
      h('button', { class: 'pg-try', onclick: () => ((area.value = s.text.replace(/^#\s.*\n+/, '').trim()), save(), area.focus()) }, s.title),
    ),
  );
  const offline = ai.available ? null : h('p', { class: 'pg-warn' }, 'The rewrite needs an ANTHROPIC_API_KEY or DEEPSEEK_API_KEY where the server runs.');
  const compose = h('section', { class: 'pg-compose' }, hello, lede, picker, area, h('div', { class: 'pg-go-row' }, tries, go), offline);

  const progressText = h('span', { class: 'pg-progress-text' });
  const clock = h('span', { class: 'pg-clock' });
  const bar = h('div', { class: 'pg-bar-fill' });
  const progress = h('div', { class: 'pg-progress', hidden: true }, h('div', { class: 'pg-bar' }, bar), h('div', { class: 'pg-progress-line' }, progressText, clock));
  const copyBtn = h('button', { class: 'pg-btn', onclick: () => void copy() }, 'Copy the rewrite');
  const tools = h(
    'div',
    { class: 'pg-tools' },
    h('button', { class: 'pg-btn', onclick: () => edit() }, '← Edit your text'),
    h('span', { class: 'pg-grow' }),
    copyBtn,
  );
  const colHead = h('div', { class: 'pg-cols pg-cols-head', 'aria-hidden': 'true' }, h('div', {}, 'Yours'), h('div', { class: 'pg-voice-name' }), h('div', {}, 'Why'));
  const rowsEl = h('div', { class: 'pg-rows' });
  const built = h('section', { class: 'pg-built', hidden: true });
  const lesson = h('section', { class: 'pg-lesson', hidden: true });
  const foot = h('p', { class: 'pg-foot' });
  const result = h('section', { class: 'pg-result', hidden: true }, tools, progress, built, colHead, rowsEl, lesson, foot);

  const pop = h('div', { class: 'pg-pop', hidden: true, role: 'dialog' });
  const sheet = h('dialog', { class: 'pg-sheet' }) as HTMLDialogElement;
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.close();
  });

  app.className = 'pg';
  app.replaceChildren(head, h('main', { class: 'pg-main' }, compose, result), pop, sheet);

  // ---------------------------------------------------------------------------------------------------------
  // The voice

  function setVoice(v: AuthorInfo, rerun: boolean) {
    voice = v;
    app.dataset.voice = v.id;
    document.title = `${v.action} · Advisor`;
    voiceBtn.replaceChildren(h('span', { class: 'pg-dot' }), h('span', {}, v.title), h('span', { class: 'pg-caret', 'aria-hidden': 'true' }, '▾'));
    picker.replaceChildren(h('p', { class: 'pg-pop-label' }, 'Write it as'), cards((x) => x.id !== voice.id && setVoice(x, false)));
    // On a phone the cards scroll sideways: keep the chosen one in view.
    requestAnimationFrame(() => picker.querySelector<HTMLElement>('.pg-card[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    hello.textContent = `Your prose, as ${mid(v.title)} would have written it.`;
    lede.textContent = `Advisor reads your text against ${v.whole}, rewrites it in that manner, and shows you why: every sentence beside yours, every change with the passage it follows.`;
    go.textContent = v.action;
    (go as HTMLButtonElement).disabled = !ai.available;
    colHead.querySelector('.pg-voice-name')!.textContent = v.title;
    save();
    if (rerun) {
      const had = runs.get(key(v.id, area.value));
      if (had) show(had);
      else void start();
    }
  }
  setVoice(voice, false);

  const key = (v: string, t: string) => `${v}\u0000${t.trim()}`;
  function save() {
    try {
      localStorage.setItem(KEEP, JSON.stringify({ voice: voice.id, text: area.value }));
    } catch {
      /* memory only */
    }
  }
  area.addEventListener('input', save);
  area.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void start();
  });

  function edit() {
    abort?.abort();
    hidePop();
    result.hidden = true;
    compose.hidden = false;
    area.focus();
    window.scrollTo({ top: 0 });
  }

  // ---------------------------------------------------------------------------------------------------------
  // The rewrite

  async function start() {
    const text = area.value.trim();
    if (!text) return area.focus();
    if (!ai.available) return;
    const k = key(voice.id, text);
    const had = runs.get(k);
    if (had?.done && !had.error) return show(had);
    abort?.abort();
    abort = new AbortController();
    const run: Run = { voice: voice.id, text, rows: new Map(), lessons: [], readings: [], model: '', done: false };
    runs.set(k, run);
    show(run);
    progress.hidden = false;
    setProgress(0, `Reading it against ${voice.whole}…`);
    const t0 = Date.now();
    const tick = setInterval(() => (clock.textContent = mmss(Date.now() - t0)), 500);
    try {
      const r = await fetch('/api/rewrite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: voice.id, text }), signal: abort.signal });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? r.statusText);
      const rd = r.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) take(run, JSON.parse(line));
        }
      }
      run.done = true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      run.error = String((e as Error).message ?? e);
      run.done = true;
      runs.delete(k);
    } finally {
      clearInterval(tick);
    }
    if (current === run) {
      progress.hidden = !run.error;
      if (run.error) setProgress(1, `It could not be rewritten: ${run.error}`, true);
      draw(run);
    }
  }

  function take(run: Run, msg: any) {
    if (msg.type === 'plan') {
      for (const hd of msg.headings as Row[]) run.rows.set(hd.index, hd);
      for (const p of msg.paragraphs as { index: number; part: number; text: string }[])
        run.rows.set(p.index, { kind: 'paragraph', index: p.index, part: p.part, yours: [{ n: -1, text: p.text, never: [] }], hers: null, notes: [] });
    } else if (msg.type === 'progress') {
      const parts = msg.parts as number;
      const now = (msg.log as string[]).at(-1) ?? '';
      const what = msg.done === parts ? 'Checking the last words…' : parts > 1 ? `Writing in ${mid(voice.title)}’s manner: ${msg.done} of ${parts} parts done` : `Writing in ${mid(voice.title)}’s manner`;
      setProgress(Math.max(0.06, msg.done / parts), `${what}${now && msg.done < parts ? ` · ${humane(now)}` : ''}`);
    } else if (msg.type === 'part') {
      for (const [k, row] of run.rows) if (row.kind === 'paragraph' && row.part === msg.part) run.rows.delete(k);
      for (const row of msg.rows as Row[]) run.rows.set(row.index, row);
      if (msg.explanation) run.lessons.push(msg.explanation);
      if (msg.reading) run.readings[msg.part] = msg.reading;
      if (msg.model) run.model = msg.model;
    }
    if (current === run && msg.type !== 'progress') draw(run);
  }

  const humane = (s: string) =>
    s
      .replace(/^Part (\d+): /, 'part $1, ')
      .replace('writing the rewrite, in one go', 'drafting')
      .replace(/draft (\d+): (\d+) to mend/, (_m, d, n) => `draft ${d} checked, ${n} to mend`)
      .replace(/drafting again \(draft (\d+)\)/, 'redrafting')
      .replace(/draft (\d+) (accepted|taken.*)/, 'checked');

  function setProgress(f: number, text: string, bad = false) {
    bar.style.width = `${Math.round(f * 100)}%`;
    progressText.textContent = text;
    progress.classList.toggle('pg-bad', bad);
  }
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  function show(run: Run) {
    current = run;
    compose.hidden = true;
    result.hidden = false;
    progress.hidden = run.done;
    draw(run);
    window.scrollTo({ top: 0 });
  }

  // ---------------------------------------------------------------------------------------------------------
  // The three columns

  function draw(run: Run) {
    hidePop();
    const rows = [...run.rows.values()].sort((a, b) => a.index - b.index);
    rowsEl.replaceChildren(...rows.map((r) => (r.kind === 'heading' ? h('div', { class: `pg-heading${r.title ? ' pg-heading-title' : ''}` }, r.text) : paraRow(r))));
    const lessons = [...new Set(run.lessons)];
    drawBuilt(run);
    const drills = run.done ? exercises(run) : [];
    lesson.hidden = !run.done || (!lessons.length && !drills.length);
    lesson.replaceChildren(
      h('h2', {}, 'Practise'),
      ...lessons.map((l) => h('p', { class: 'pg-lesson-text' }, ...defined(l))),
      ...(drills.length ? [h('p', { class: 'pg-drill-lede' }, `Now make the move yourself. Rewrite your own sentence the way ${mid(voice.title)} did, and check it: the engine reads it against ${voice.whole}.`)] : []),
      ...drills,
    );
    foot.textContent = run.done && !run.error ? `Every word checked against ${voice.whole}. Written by ${run.model || 'the model'} from the engine’s reading of your text.` : '';
    (copyBtn as HTMLButtonElement).disabled = !run.done;
  }

  function paraRow(r: Para): HTMLElement {
    const row = h('div', { class: 'pg-cols pg-row' });
    const fromLabel = r.from?.length ? h('span', { class: 'pg-from' }, `Your ¶ ${r.from.join(', ')}`) : null;
    const yours = h('div', { class: 'pg-yours', 'data-label': 'Yours' }, fromLabel, ...r.yours.flatMap((s, i) => [i ? ' ' : '', yourSentence(s)]));
    let hers: HTMLElement;
    if (r.error) hers = h('div', { class: 'pg-hers pg-error', 'data-label': voice.title }, `This part could not be rewritten: ${r.error}`);
    else if (!r.hers) hers = h('div', { class: 'pg-hers pg-wait', 'data-label': voice.title, 'aria-busy': 'true' }, h('span', { class: 'pg-line' }), h('span', { class: 'pg-line' }), h('span', { class: 'pg-line pg-short' }));
    else hers = h('div', { class: 'pg-hers', 'data-label': voice.title }, ...r.hers.flatMap((s, i) => [i ? ' ' : '', herSentence(s, r)]));
    const notes = h('div', { class: 'pg-why', 'data-label': 'Why' }, ...(r.hers ? whyOf(r) : []));
    row.append(yours, hers, notes);
    return row;
  }

  function yourSentence(s: YourSentence): HTMLElement {
    const el = h('span', { class: 'pg-s', 'data-n': String(s.n) });
    if (!s.never.length) {
      el.textContent = s.text;
      return el;
    }
    const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
    const re = new RegExp(`(?<![\\p{L}'’])(${s.never.map((x) => esc(x.word)).join('|')})(?![\\p{L}'’])`, 'giu');
    let at = 0;
    for (const m of s.text.matchAll(re)) {
      el.append(s.text.slice(at, m.index));
      const w = s.never.find((x) => x.word.toLowerCase().replace(/’/g, "'") === m[0].toLowerCase().replace(/’/g, "'"));
      el.append(h('button', { class: 'pg-never', onclick: (e: Event) => w && neverPop(e.currentTarget as HTMLElement, w) }, m[0]));
      at = m.index! + m[0].length;
    }
    el.append(s.text.slice(at));
    return el;
  }

  function herSentence(s: HerSentence, r: Para): HTMLElement {
    const el = h('span', { class: 'pg-s pg-her', tabindex: 0, role: 'button' }, s.text);
    const lit = (on: boolean) => {
      el.classList.toggle('pg-lit', on);
      for (const n of s.from) rowsEl.querySelector(`.pg-yours .pg-s[data-n="${n}"]`)?.classList.toggle('pg-lit', on);
    };
    el.addEventListener('mouseenter', () => lit(true));
    el.addEventListener('mouseleave', () => lit(false));
    el.addEventListener('focus', () => lit(true));
    el.addEventListener('blur', () => lit(false));
    const open = () => sentencePop(el, s, r);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));
    return el;
  }

  /** The notes on a paragraph: each move, and the sentence of the author's that shows it; else why its sentences changed. */
  function whyOf(r: Para): HTMLElement[] {
    if (r.notes.some((n) => n.kind === 'move')) return r.notes.map((n) => noteEl(n, r));
    const told = r.notes.map((n) => noteEl(n, r));
    const s = [...(r.hers ?? [])].sort((a, b) => b.text.length - a.text.length)[0];
    if (!s?.why) return told;
    return [...told, h('div', { class: 'pg-note' }, h('p', { class: 'pg-note-why' }, ...defined(s.why.replace(/,? modelled on [^.]*\.$/, '.'))), s.model ? quoteEl(s.model) : null)];
  }

  function noteEl(n: Note, r: Para): HTMLElement {
    if (n.kind === 'sense' || n.kind === 'structure')
      return h('div', { class: `pg-note pg-note-${n.kind}` }, h('div', { class: 'pg-note-move' }, n.kind === 'sense' ? 'Making sense' : 'Structure'), h('p', { class: 'pg-note-text' }, ...defined(n.text ?? '')));
    if (n.kind === 'liberty')
      return h(
        'div',
        { class: 'pg-note pg-note-liberty' },
        h('div', { class: 'pg-note-move' }, 'Not in yours'),
        h('p', { class: 'pg-note-change' }, `“${n.after.trim().replace(/^[“"]|[”"]$/g, '')}”`),
        h('p', { class: 'pg-note-text' }, ...defined(n.text ?? '')),
      );
    const after = n.after.trim();
    const short = after.length > 90 ? `${after.slice(0, 87).replace(/\s+\S*$/, '')}…` : after;
    const el = h(
      'div',
      { class: 'pg-note' },
      ...moveHead(n.technique),
      h('p', { class: 'pg-note-change' }, `“${short.replace(/^[“"]|[”"]$/g, '')}”`),
      n.quote ? quoteEl(n.quote) : null,
    );
    // Where in the author's rendering the move is made.
    const target = () => {
      const i = (r.hers ?? []).findIndex((s) => s.text.toLowerCase().includes(after.slice(0, 40).toLowerCase().replace(/^[“"]/, '')));
      return i >= 0 ? (el.closest('.pg-row')?.querySelectorAll('.pg-hers .pg-s')[i] as HTMLElement | undefined) : undefined;
    };
    el.addEventListener('mouseenter', () => target()?.classList.add('pg-lit'));
    el.addEventListener('mouseleave', () => target()?.classList.remove('pg-lit'));
    return el;
  }

  function quoteEl(q: Quote): HTMLElement {
    const [a, b] = q.mark ?? [0, 0];
    const words = b > a ? [q.text.slice(0, a), h('mark', { class: 'pg-mark' }, q.text.slice(a, b)), q.text.slice(b)] : [q.text];
    return h(
      'blockquote',
      { class: 'pg-q' },
      h('span', {}, ...words),
      ' ',
      q.id ? h('button', { class: 'pg-cite', onclick: () => void openSource(q) }, q.cite) : h('cite', { class: 'pg-cite' }, q.cite),
    );
  }

  /** How the piece is built: the writer's outline beside the voice's plan, each step of the plan with why. */
  function drawBuilt(run: Run) {
    const rd = run.readings.filter((x) => x && x.outline.length >= 2);
    built.hidden = !rd.length;
    if (!rd.length) return;
    const list = (steps: Reading['plan'], why: boolean) =>
      h('ol', { class: 'pg-steps' }, ...steps.map((x) => h('li', {}, h('span', { class: 'pg-role' }, x.role), ' ', ...defined(x.gist), why && x.why ? h('span', { class: 'pg-step-why' }, ...defined(x.why)) : null)));
    // The kind in one word: the model may describe it at length.
    const kind = /\b(story|argument|letter|email|speech|description|essay|proposal)\b/i.exec(rd[0]!.kind)?.[1]?.toLowerCase() ?? '';
    built.replaceChildren(
      h('h2', {}, kind && kind !== 'other' ? `How your ${kind} is built` : 'How it is built'),
      ...rd.map((x, i) =>
        h(
          'div',
          { class: 'pg-built-cols' },
          rd.length > 1 ? h('p', { class: 'pg-pop-label pg-built-part' }, `Part ${i + 1}`) : null,
          h('div', {}, h('p', { class: 'pg-pop-label' }, 'Yours'), list(x.outline, false)),
          h('div', {}, h('p', { class: 'pg-pop-label' }, `As ${mid(voice.title)} would build it`), list(x.plan.length ? x.plan : x.outline, true)),
        ),
      ),
    );
  }

  /** Up to three exercises: each a move the rewrite made, on a sentence of the writer's own. */
  function exercises(run: Run): HTMLElement[] {
    const seen = new Set<string>();
    const out: HTMLElement[] = [];
    const rows = [...run.rows.values()].sort((a, b) => a.index - b.index);
    for (const r of rows) {
      if (r.kind !== 'paragraph' || !r.hers) continue;
      for (const n of r.notes) {
        if (n.kind !== 'move' || !n.verified || seen.has(n.technique) || out.length >= 3) continue;
        // The writer's sentence the move was made on: the note's own words, else the paragraph's first sentence.
        const mine = r.yours.find((y) => n.before && y.text.includes(n.before.slice(0, 30)))?.text ?? (n.before && n.before.length < 240 ? n.before : r.yours[0]?.text);
        if (!mine) continue;
        seen.add(n.technique);
        out.push(drill(n, mine));
      }
    }
    // Then the moves the engine itself finds in the rewrite's sentences, on the writer's sentences they render.
    for (const r of rows) {
      if (r.kind !== 'paragraph' || !r.hers) continue;
      for (const s of r.hers)
        for (const mv of s.moves ?? []) {
          if (seen.has(mv) || out.length >= 3) continue;
          const mine = r.yours.filter((y) => s.from.includes(y.n)).map((y) => y.text).join(' ');
          if (!mine) continue;
          seen.add(mv);
          out.push(drill({ kind: 'move', technique: mv, before: mine, after: s.text, quote: s.model, verified: true }, mine));
        }
    }
    return out;
  }

  function drill(n: Note, mine: string): HTMLElement {
    const box = h('textarea', { class: 'pg-drill-input', rows: 3, 'aria-label': `Your sentence, with ${n.technique.toLowerCase()}` }) as HTMLTextAreaElement;
    box.value = mine;
    const answer = h('div', { class: 'pg-drill-answer', 'aria-live': 'polite' });
    const check = h('button', { class: 'pg-btn pg-drill-check' }, 'Check') as HTMLButtonElement;
    check.addEventListener('click', async () => {
      check.disabled = true;
      answer.replaceChildren(h('p', { class: 'pg-muted' }, 'Reading it…'));
      try {
        const c = await post<PracticeCheck>('/api/practice', { author: voice.id, text: box.value, move: n.technique });
        answer.replaceChildren(
          ...[
          h('p', { class: `pg-drill-verdict ${c.move?.made ? 'pg-ok' : 'pg-notyet'}` }, h('strong', {}, c.move?.made ? '✓ ' : '· '), ...defined(c.verdict || 'Read.')),
          c.also.length ? h('p', { class: 'pg-drill-also' }, ...defined(`Also in it: ${c.also.join(', ')}.`)) : null,
          c.never.length
            ? h('p', { class: 'pg-drill-also' }, ...c.never.flatMap((w, i) => [i ? '; ' : '', h('s', {}, w.word), w.theirs.length ? ` → ${w.theirs.join(', ')}` : '']))
            : null,
          !c.move?.made && c.move?.example ? quoteEl({ id: c.move.example.id, text: c.move.example.text, cite: c.move.example.cite }) : null,
          ].filter((x): x is HTMLElement => !!x),
        );
      } catch (e) {
        answer.replaceChildren(h('p', { class: 'pg-muted' }, String((e as Error).message)));
      } finally {
        check.disabled = false;
      }
    });
    box.addEventListener('keydown', (e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && check.click());
    return h(
      'div',
      { class: 'pg-drill' },
      ...moveHead(n.technique),
      h('p', { class: 'pg-drill-theirs' }, h('span', { class: 'pg-pop-label' }, `${voice.title} did it so`), `“${n.after.trim().replace(/^[“"]|[”"]$/g, '')}”`),
      n.quote ? quoteEl(n.quote) : null,
      h('span', { class: 'pg-pop-label' }, 'Your turn: say your sentence again, with the move'),
      box,
      h('div', { class: 'pg-drill-row' }, check),
      answer,
    );
  }

  // ---------------------------------------------------------------------------------------------------------
  // In the text: the popover, and the source in its passage

  let popFor: HTMLElement | null = null;
  function showPop(anchor: HTMLElement, ...kids: (Node | string | null)[]) {
    if (popFor === anchor && !pop.hidden) return hidePop();
    popFor = anchor;
    pop.classList.remove('pg-pop-wide');
    pop.replaceChildren(h('button', { class: 'pg-x', 'aria-label': 'Close', onclick: () => hidePop() }, '×'), ...kids.filter((k): k is Node | string => k !== null));
    pop.hidden = false;
    place();
  }
  function place() {
    if (!popFor || pop.hidden) return;
    if (window.innerWidth < 720) {
      pop.classList.add('pg-pop-sheet');
      pop.style.left = pop.style.top = '';
      return;
    }
    pop.classList.remove('pg-pop-sheet');
    const r = popFor.getBoundingClientRect();
    const w = Math.min(pop.classList.contains('pg-pop-wide') ? 640 : 420, window.innerWidth - 24);
    pop.style.width = `${w}px`;
    pop.style.left = `${Math.max(12, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 12))}px`;
    const below = r.bottom + window.scrollY + 8;
    const ph = pop.offsetHeight;
    pop.style.top = `${r.bottom + 8 + ph > window.innerHeight && r.top > ph + 16 ? r.top + window.scrollY - ph - 8 : below}px`;
  }
  function hidePop() {
    pop.hidden = true;
    popFor = null;
  }
  window.addEventListener('resize', place);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hidePop());
  document.addEventListener('click', (e) => {
    const t = e.target as Node;
    if (!pop.hidden && !pop.contains(t) && popFor && !popFor.contains(t)) hidePop();
  });

  /** Why a sentence was written so, the sentence of the author's it follows, and its words of the author's. */
  function sentencePop(el: HTMLElement, s: HerSentence, r: Para) {
    const yoursText = r.yours.filter((y) => s.from.includes(y.n)).map((y) => y.text);
    const mine = new Set((yoursText.join(' ') || r.yours.map((y) => y.text).join(' ')).toLowerCase().match(/[\p{L}'’]+/gu) ?? []);
    const theirs = [...new Set((s.text.match(/[\p{L}'’]+/gu) ?? []).filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()) && !mine.has(w.toLowerCase())))].slice(0, 8);
    const wordBox = h('div', { class: 'pg-word' });
    showPop(
      el,
      yoursText.length ? h('p', { class: 'pg-pop-was' }, h('span', { class: 'pg-pop-label' }, 'You wrote'), yoursText.join(' ')) : null,
      s.why ? h('p', { class: 'pg-pop-why' }, ...defined(s.why.replace(/,? modelled on [^.]*\.$/, '.'))) : null,
      s.model ? h('div', {}, h('span', { class: 'pg-pop-label' }, `The sentence of ${mid(voice.title)}’s it follows`), quoteEl(s.model)) : null,
      theirs.length
        ? h(
            'div',
            { class: 'pg-chips' },
            h('span', { class: 'pg-pop-label' }, 'Words of the rewrite: how the original used them'),
            ...theirs.map((w) => h('button', { class: 'pg-chip', onclick: () => void wordInto(wordBox, w, s.text) }, w)),
          )
        : null,
      wordBox,
    );
  }

  /** A word the author never wrote, and the author's words in its place. */
  function neverPop(el: HTMLElement, w: { word: string; alternatives: string[] }) {
    const wordBox = h('div', { class: 'pg-word' });
    showPop(
      el,
      h('p', { class: 'pg-pop-why' }, `${voice.title} never uses “${w.word}”.`),
      w.alternatives.length
        ? h(
            'div',
            { class: 'pg-chips' },
            h('span', { class: 'pg-pop-label' }, `${voice.pronouns.possessive[0]!.toUpperCase()}${voice.pronouns.possessive.slice(1)} words in that place`),
            ...w.alternatives.map((a) => h('button', { class: 'pg-chip', onclick: () => void wordInto(wordBox, a, '') }, a)),
          )
        : h('p', { class: 'pg-muted' }, `No word of ${mid(voice.title)}’s is near: the rewrite says it another way.`),
      wordBox,
    );
  }

  async function wordInto(box: HTMLElement, word: string, context: string) {
    box.replaceChildren(h('p', { class: 'pg-muted' }, `Looking up “${word}”…`));
    try {
      const p = await get<WordProfile>(`/api/word?author=${voice.id}&word=${encodeURIComponent(word)}&context=${encodeURIComponent(context)}`);
      const top = p.works.slice(0, 4);
      box.replaceChildren(
        h('p', { class: 'pg-word-head' }, h('strong', {}, word), ` ${p.count.toLocaleString()} time${p.count === 1 ? '' : 's'} in ${mid(voice.title)}`, top.length ? `: ${top.map((w) => `${w.title} ${w.count}`).join(', ')}` : ''),
        ...p.examples.slice(0, 2).map((c) => quoteEl({ id: c.id, text: c.text, cite: c.cite })),
      );
      place();
    } catch (e) {
      box.replaceChildren(h('p', { class: 'pg-muted' }, String((e as Error).message)));
    }
  }

  async function openSource(q: Quote) {
    hidePop();
    const body = h('div', { class: 'pg-sheet-body' }, h('p', { class: 'pg-muted' }, 'Opening…'));
    sheet.replaceChildren(h('header', {}, h('strong', {}, q.cite), h('button', { class: 'pg-x', 'aria-label': 'Close', onclick: () => sheet.close() }, '×')), body);
    sheet.showModal();
    try {
      const ctx = await get<{ paragraph: { text: string; start: number; end: number } | null }>(`/api/context?author=${voice.id}&sentence=${q.id}`);
      const p = ctx.paragraph;
      body.replaceChildren(
        p ? h('p', { class: 'pg-passage' }, p.text.slice(0, p.start), h('mark', {}, p.text.slice(p.start, p.end)), p.text.slice(p.end)) : h('p', { class: 'pg-passage' }, q.text),
      );
    } catch (e) {
      body.replaceChildren(h('p', { class: 'pg-muted' }, String((e as Error).message)));
    }
  }

  async function copy() {
    if (!current) return;
    const rows = [...current.rows.values()].sort((a, b) => a.index - b.index);
    const text = rows.map((r) => (r.kind === 'heading' ? r.text : (r.hers ?? []).map((s) => s.text).join(' '))).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy the rewrite'), 1600);
    } catch {
      copyBtn.textContent = 'Could not copy';
    }
  }
}
