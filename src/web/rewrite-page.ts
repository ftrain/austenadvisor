// The page: one route and four states. COMPOSE takes the text and the voice. WRITING shows at once what the engine
// reads in the text, with no model call, while the rewrite streams in. RESULT shows yours, theirs and why, a row to
// each paragraph. TRY-IT opens inside a row. A rewrite is spent only on Rewrite, or on a yes to the confirm line.

import './page.css';
import { clientId, definer, get, h, keep, post, Refused, streamLines, textHash, type AuthorInfo, type Boot, type Drill, type Reading, type Row } from './api.ts';
import { compose, RESTING, sortVoices } from './compose.ts';

/** The most a text may hold, as the server counts it. */
const MAX_CHARS = 24000;
import { movesBook } from './moves.ts';
import { result, type ResultState, type Run } from './result.ts';

export const PAGE_KEY = 'advisor.page';

export async function rewritePage(app: HTMLElement) {
  const boot = await get<Boot>('/api/boot');
  const voices = sortVoices(boot.voices.filter((v) => v.built));
  const byId = new Map(voices.map((v) => [v.id, v]));
  const kept = keep.get<{ voice?: string; text?: string; form?: string; facts?: boolean } | null>(PAGE_KEY, null);
  let voice: AuthorInfo = byId.get(kept?.voice ?? '') ?? byId.get('austen') ?? voices[0]!;
  const terms = definer(boot.glossary);
  const moves = movesBook(voices, terms);

  const readings = new Map<string, Promise<Reading | null>>();
  const runs = new Map<string, Run>();
  const readyServer = new Map<string, Promise<string[]>>();
  let ready = new Set<string>();
  let shown: { run: Run; reading: Reading | null } | null = null;
  /** The rewrites streaming, each with its own controller: showing another voice does not stop one. */
  const streaming = new Set<AbortController>();
  let tick: ReturnType<typeof setInterval> | undefined;
  addEventListener('pagehide', () => {
    for (const ctl of streaming) ctl.abort();
  });
  /** A run that finished with every part it could rewrite rewritten. */
  const whole = (r: Run) => r.done && !r.failed && !r.resting && !r.partial;

  // A rewrite is of one text in one voice, fitted to one form, with facts or without.
  const key = (v: string, t: string) => `${v}\u0000${c.form()}\u0000${c.facts() ? 'facts' : ''}\u0000${t.trim()}`;
  const save = () => keep.set(PAGE_KEY, { voice: voice.id, text: c.area.value, form: c.form(), facts: c.facts() });
  /** The request the samples and the server's "ready" answer: the form of the text's kind, and no facts. */
  const plainAsk = () => c.form() === 'auto' && !c.facts();

  // -----------------------------------------------------------------------------------------------------------
  // What the engine reads in the text, and which voices are ready for it

  function readingFor(v: string, text: string): Promise<Reading | null> {
    const form = c.form();
    const k = `${v}\u0000${form}\u0000${text.trim()}`;
    if (!readings.has(k)) {
      const p = post<Reading>('/api/read', { voice: v, text, form }).catch(() => null);
      readings.set(k, p);
      void p.then((r) => r || readings.delete(k));
    }
    return readings.get(k)!;
  }

  const sampleOf = (text: string) => boot.samples.find((s) => s.text.trim() === text.trim()) ?? null;

  /** The voices this text is rewritten in already: a sample's made ahead of time, the server's cache, this page's own. */
  async function readyFor(text: string): Promise<Set<string>> {
    const t = text.trim();
    const out = new Set<string>();
    // With a form chosen or facts asked for, only this page's own rewrites are ready: any other costs a rewrite.
    if (!plainAsk()) {
      for (const [k, r] of runs) if (r.text === t && whole(r) && k === key(r.voice, t)) out.add(r.voice);
      return out;
    }
    for (const v of sampleOf(t) ? boot.ready[sampleOf(t)!.id] ?? [] : []) out.add(v);
    if (!readyServer.has(t))
      readyServer.set(
        t,
        textHash(t).then((hash) => (hash ? get<{ voices: string[] }>(`/api/ready?hash=${hash}`).then((r) => r.voices ?? []).catch(() => []) : [])),
      );
    for (const v of await readyServer.get(t)!) out.add(v);
    for (const [k, r] of runs) if (r.text === t && whole(r) && k === key(r.voice, t)) out.add(r.voice);
    return out;
  }
  const isReady = (v: string, text: string) => {
    const r = runs.get(key(v, text));
    if (r?.done && !whole(r)) return false;
    return ready.has(v) || (!!r && whole(r));
  };

  function noticeText(text: string) {
    save();
    if (!text.trim()) return c.setReading(null);
    void readingFor(voice.id, text).then((r) => c.area.value === text && c.setReading(r));
    void readyFor(text).then((s) => {
      if (c.area.value !== text) return;
      ready = s;
      c.setReady(s);
    });
  }

  // -----------------------------------------------------------------------------------------------------------
  // The frame

  const c = compose({
    boot,
    voices,
    terms,
    text: kept?.text ?? '',
    voice,
    onVoice: (id) => setVoice(id),
    form: kept?.form,
    facts: kept?.facts,
    onOptions: () => noticeText(c.area.value),
    onText: noticeText,
    onGo: () => void go(),
  });
  const r = result({
    voices,
    terms,
    moves,
    onEdit: edit,
    onVoice: (id) => pickOnResult(id),
    onConfirm: (id) => {
      setVoice(id);
      void start();
    },
    onRetry: () => {
      runs.delete(key(voice.id, c.area.value));
      void start();
    },
  });
  const head = h('header', { class: 'pg-head' }, h('a', { class: 'pg-brand', href: '/' }, h('span', { class: 'pg-mark', 'aria-hidden': 'true' }, 'A'), h('span', {}, 'Advisor')));
  app.className = 'pg';
  app.replaceChildren(head, h('main', { class: 'pg-main' }, c.el, r.el, moves.el));
  setVoice(voice.id);
  c.setResting(!boot.ai.available);
  if (c.area.value.trim()) noticeText(c.area.value);

  function setVoice(id: string) {
    const v = byId.get(id);
    if (!v) return;
    voice = v;
    app.dataset.voice = v.id;
    document.title = `${v.short} · Advisor`;
    c.setVoice(v);
    save();
  }

  function state(): ResultState {
    const run = shown?.run ?? null;
    const flipOk = (plainAsk() && !!sampleOf(c.area.value)) || ready.size > 0;
    const flip = flipOk ? voices.filter((v) => isReady(v.id, c.area.value) || v.id === voice.id).map((v) => v.id) : [];
    return { voice, run, reading: shown?.reading ?? null, flip, ready, suggested: c.suggested(), resting: !boot.ai.available && !sampleOf(c.area.value) };
  }
  // Only while the result is on view; start() draws it again when it comes back.
  const redraw = () => shown && app.dataset.state === 'result' && r.draw(state());

  function edit() {
    r.ask(null, voice);
    r.el.hidden = true;
    c.el.hidden = false;
    app.dataset.state = 'compose';
    c.area.focus();
    window.scrollTo?.({ top: 0 });
  }

  // -----------------------------------------------------------------------------------------------------------
  // The voice on the result page: a ready voice shows at once; any other asks first

  function pickOnResult(id: string) {
    if (id === voice.id) {
      r.ask(null, voice);
      r.select.value = voice.id;
      return;
    }
    if (isReady(id, c.area.value)) {
      r.ask(null, voice);
      setVoice(id);
      void start();
      return;
    }
    const v = byId.get(id);
    if (!v) return;
    // The select keeps showing the voice on the page until the student says yes.
    r.select.value = voice.id;
    r.ask(v, voice);
  }

  // -----------------------------------------------------------------------------------------------------------
  // The rewrite

  async function go() {
    const text = c.area.value.trim();
    if (!text) return c.area.focus();
    if (text.length > MAX_CHARS) {
      c.setNotice(`That is ${text.length.toLocaleString()} characters; the most is ${MAX_CHARS.toLocaleString()}. Try a chapter at a time.`);
      return c.area.focus();
    }
    c.setNotice(null);
    ready = await readyFor(text).catch(() => ready);
    await start();
  }

  async function start() {
    const text = c.area.value.trim();
    if (!text) return;
    const v = voice;
    const k = key(v.id, text);
    moves.useVoice(v.id);
    r.ask(null, v);
    let run = runs.get(k);
    const fresh = !run || (run.done && (!!run.failed || !!run.partial || run.resting === 'busy'));
    if (fresh) {
      run = { voice: v.id, text, form: c.form(), facts: c.facts(), rows: new Map(), roles: new Map(), whys: new Map(), done: false, started: Date.now() };
      runs.set(k, run);
    }
    shown = { run: run!, reading: null };
    c.el.hidden = true;
    r.el.hidden = false;
    app.dataset.state = 'result';
    redraw();
    window.scrollTo?.({ top: 0 });
    const reading = readingFor(v.id, text).then((rd) => {
      if (shown && shown.run === run) {
        shown.reading = rd;
        redraw();
      }
      return rd;
    });
    if (!fresh) return;
    await stream(run!, v, text);
    await reading;
  }

  async function stream(run: Run, v: AuthorInfo, text: string) {
    const ctl = new AbortController();
    streaming.add(ctl);
    tick ??= setInterval(() => shown && !shown.run.done && app.dataset.state === 'result' && r.progress(state()), 1000);
    try {
      await streamLines('/api/rewrite', { author: v.id, text, client: clientId, form: run.form ?? 'auto', facts: !!run.facts }, (line) => take(run, line), ctl.signal);
      run.done = true;
      const rows = [...run.rows.values()].filter((x) => x.kind === 'paragraph');
      if (rows.length && rows.every((x) => x.kind === 'paragraph' && !x.hers && x.resting === 'budget')) run.resting = 'resting';
      else if (rows.some((x) => x.kind === 'paragraph' && (x.error || x.resting === 'budget'))) run.partial = true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        for (const [k, x] of runs) if (x === run) runs.delete(k);
        return;
      }
      run.done = true;
      if (e instanceof Refused && (e.status === 503 || e.status === 429)) run.resting = e.budget === 'busy' ? 'busy' : 'resting';
      else {
        // The server's own reason for a request it refused (it is written for the student); otherwise a plain line.
        run.failed = e instanceof Refused && e.status >= 400 && e.status < 500 && e.message ? e.message : 'The rewrite failed.';
        // Too long: the same request would be refused again.
        run.final = e instanceof Refused && e.status === 413;
      }
    } finally {
      streaming.delete(ctl);
      if (!streaming.size) {
        clearInterval(tick);
        tick = undefined;
      }
    }
    if (run.resting || ![...run.rows.values()].some((x) => x.kind === 'paragraph' && x.hers)) void drills(run, v);
    // Ready for the text on the page only if this run was of that text.
    if (whole(run) && run.text === c.area.value.trim() && runs.get(key(v.id, text)) === run) {
      ready.add(v.id);
      c.setReady(ready);
    }
    if (shown?.run === run) redraw();
  }

  function take(run: Run, msg: { type: string; [k: string]: unknown }) {
    if (msg.type === 'plan') {
      for (const hd of (msg.headings as Row[]) ?? []) run.rows.set(hd.index, hd);
      for (const p of (msg.paragraphs as { index: number; part: number; text: string }[]) ?? [])
        run.rows.set(p.index, { kind: 'paragraph', index: p.index, part: p.part, yours: [{ n: -1, text: p.text, never: [] }], hers: null, notes: [] });
    } else if (msg.type === 'part') {
      const part = msg.part as number;
      for (const [k, row] of run.rows) if (row.kind === 'paragraph' && row.part === part) run.rows.delete(k);
      for (const row of (msg.rows as Row[]) ?? []) run.rows.set(row.index, row);
      const plan = (msg.reading as { plan?: { role: string; why?: string }[] } | undefined)?.plan;
      if (plan?.length) {
        run.roles.set(part, plan.map((x) => x.role));
        run.whys?.set(part, plan.map((x) => x.why));
      }
    } else if (msg.type === 'progress') {
      const log = (msg.log as string[]) ?? [];
      run.at = { done: Number(msg.done) || 0, parts: Number(msg.parts) || 1, note: log.at(-1) ?? '' };
      if (shown?.run === run) r.progress(state());
      return;
    } else return;
    if (shown?.run === run) redraw();
  }

  /** For a text with no rewrite: moves to try, found by the engine in what the writer did not do. */
  async function drills(run: Run, v: AuthorInfo) {
    try {
      const d = await post<{ drills: Drill[] }>('/api/practice/drills', { author: v.id, text: run.text });
      run.drills = d.drills ?? [];
      if (shown?.run === run) redraw();
    } catch {
      /* the engine view stands without them */
    }
  }

  // Exposed for tests: nothing on the page reads these.
  return { compose: c, result: r, moves, resting: RESTING };
}
