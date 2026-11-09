// A document open: Tiny Little Office's Word Processor in the middle, the margin's threads beside it, and Advisor's
// panel at the side. Every word the author never used is underlined as you write; hover it for the author's words in
// its place, each with a sentence of hers; select any word to read how she used it.

import {
  changesOf,
  colorOf,
  command,
  drawChanges,
  ensureIcons,
  iconNamed,
  initialsOf,
  mount,
  quoteAt,
  register,
  reviewsOf,
  setup,
  toast,
  track,
  wordsOf,
  type Drawing,
  type Mounted,
  type Review,
  type Step,
  type ToText,
} from 'tinylittleoffice/kit';
import type { Op } from 'tinylittleoffice/doc';
import { SHE, get, h, me, post, quoteEl, setMyName, type Advice, type AuthorInfo, type Alternative, type Analysis, type Citation, type WordFlag } from './api.ts';
import { ExplorePanel } from './explore.ts';
import { renderAdvisor, renderStyle } from './panels.ts';
import { Sync, type RoomState } from './sync.ts';

const ADVISOR = 'advisor';

interface Ctx {
  words: () => ToText | null;
  rewrite(): void;
  austenize(): void;
}

function rangeAt(words: ToText, block: number, from: number, to: number): Range | null {
  const s = words.domPoint({ block, offset: from });
  const e = words.domPoint({ block, offset: to });
  if (!s || !e) return null;
  try {
    const r = document.createRange();
    r.setStart(s[0], s[1]);
    r.setEnd(e[0], e[1]);
    if (to > from) {
      const i = words.domPoint({ block, offset: from + 1 });
      if (i && i[0].nodeType === Node.TEXT_NODE && i[1] >= 1) r.setStart(i[0], i[1] - 1);
    }
    return r;
  } catch {
    return null;
  }
}

function posAt(words: ToText, x: number, y: number) {
  const d = document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null };
  const hit =
    d.caretPositionFromPoint?.(x, y) ??
    (() => {
      const r = document.caretRangeFromPoint?.(x, y);
      return r ? { offsetNode: r.startContainer, offset: r.startOffset } : null;
    })();
  const tx = (words as unknown as { tx: HTMLElement }).tx;
  return hit && tx?.contains(hit.offsetNode) ? words.readPos(hit.offsetNode, hit.offset) : null;
}

export async function editorPage(root: HTMLElement, docId: string) {
  const person = me();
  root.replaceChildren();
  root.className = 'aa-page aa-editor-page';
  await setup();
  await ensureIcons(['sparkles', 'feather', 'book-open', 'search', 'share-2', 'users']);

  // The frame.
  const title = h('span', { class: 'aa-doc-title' }, '…');
  const online = h('span', { class: 'aa-online' });
  const score = h('span', { class: 'aa-score-pill', title: 'How near Austen’s habits, 0–100' }, '—');
  const status = h('span', { class: 'aa-status', 'aria-live': 'polite' });
  const nameBtn = h('button', { class: 'aa-btn aa-ghost', title: 'Your name, as others see it', onclick: () => {
    const n = prompt('Your name, as others in this document see it:', me().name);
    if (n?.trim()) {
      setMyName(n.trim());
      location.reload();
    }
  } }, person.name);
  const share = h('button', { class: 'aa-btn', onclick: async () => {
    await navigator.clipboard?.writeText(location.href).catch(() => {});
    toast('Link copied: whoever has it can write here with you.');
  } }, 'Share');
  const header = h('header', { class: 'aa-head' }, h('a', { href: '/', class: 'aa-home', title: 'All documents' }, h('span', { class: 'aa-mark' }, 'A'), h('span', { class: 'aa-brand' }, 'Austen Advisor')), title, status, h('span', { class: 'aa-spacer' }), score, online, nameBtn, share);
  const editorBox = h('div', { class: 'aa-editor' });
  const margin = document.createElement('to-comments') as unknown as HTMLElement & Record<string, unknown>;
  margin.className = 'aa-margin';
  const paper = h('div', { class: 'aa-paper' }, editorBox, margin);
  const tabs = h('nav', { class: 'aa-tabs', role: 'tablist' });
  const panelBody = h('div', { class: 'aa-panel-body' });
  const side = h('aside', { class: 'aa-side' }, tabs, panelBody);
  const main = h('main', { class: 'aa-main' }, paper, side);
  const pop = h('div', { class: 'aa-pop', role: 'dialog', hidden: true });
  root.append(header, main, pop);

  // The state.
  let state: RoomState | null = null;
  let analysis: Analysis | null = null;
  let mounted: Mounted | null = null;
  let words: ToText | null = null;
  let tab: 'advisor' | 'explore' | 'style' = 'advisor';
  let ai = false;
  const people = new Map<string, string>([[ADVISOR, 'Advisor']]);
  const author = { id: 'austen', short: 'Austen', advisor: 'Austen Advisor', name: 'Jane Austen', pronouns: SHE };
  const explore = new ExplorePanel(() => author, openCitation);

  const order = () => [ADVISOR, ...[...people.keys()].filter((p) => p !== ADVISOR)];
  const peopleList = () => [...people].map(([id, name]) => ({ id, name, color: colorOf(id, order()) }));
  const initials = () => initialsOf([...people].map(([email, name]) => ({ email, name })));
  const drawing = (accepted: (ids: string[]) => boolean): Drawing => ({
    color: (who) => colorOf(who, order()),
    initials: (who) => initials().get(who) ?? (who === ADVISOR ? 'AA' : '?'),
    name: (who) => people.get(who) ?? who,
    accepted,
    takenOutBy: (n) => `Taken out by ${n}`,
    cardChanged: 'Changed',
    rejected: 'rejected',
    restored: 'restored',
  });

  // The tabs.
  const tabBtn = (id: typeof tab, label: string) =>
    h('button', { role: 'tab', class: 'aa-tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; renderSide(); } }, label);
  function renderSide() {
    tabs.replaceChildren(tabBtn('advisor', 'Advisor'), tabBtn('explore', `Explore ${author.short}`), tabBtn('style', 'Style'));
    if (tab === 'advisor') panelBody.replaceChildren(advisorPanel());
    else if (tab === 'explore') panelBody.replaceChildren(explore.el);
    else panelBody.replaceChildren(renderStyle(author, analysis));
  }

  function advisorPanel(): HTMLElement {
    const reviewPanel = document.createElement('to-review-panel') as unknown as HTMLElement & Record<string, unknown>;
    const steps = stepsOf();
    if (steps.length && state) {
      const r = reviewsOf(state.reviews as unknown as Review[]);
      const tracked = track(steps, r.rejectedBy, r.reviewedBy);
      const changes = changesOf(tracked).filter((c) => c.author === ADVISOR && !r.settled(c.id) && r.standing(c.id, c.author, person.id) !== 'rejected');
      Object.assign(reviewPanel, { changes, people: peopleList(), reviews: state.reviews, me: person.id, canReview: true });
      reviewPanel.toggleAttribute('can-review', true);
      reviewPanel.hidden = !changes.length;
    }
    return renderAdvisor({
      author,
      analysis,
      ai,
      reviewPanel,
      onApply: applyAdvice,
      onShow: showAdvice,
      onWord: (f) => { showWord(f); },
      onFigure: (f) => showFigure(f),
      onCite: openCitation,
      onAustenize: () => void austenizeHere(),
      onRewrite: (instr) => void rewriteHere(instr),
      target: targetLabel(),
    });
  }

  function targetLabel(): string {
    const t = target();
    if (!t) return 'Place the caret in a paragraph';
    return t.from === t.to ? `Paragraph ${t.from}` : `Paragraphs ${t.from}–${t.to}`;
  }

  /** The paragraphs the selection or caret is in. */
  function target(): { from: number; to: number } | null {
    const s = words?.sel;
    if (!s) return lastTarget;
    const a = Math.min(s.anchor.block, s.focus.block);
    const b = Math.max(s.anchor.block, s.focus.block);
    const blocks = words!.model;
    if (!blocks[a] || blocks[a]!.k === 'h') return lastTarget;
    lastTarget = { from: a, to: b };
    return lastTarget;
  }
  let lastTarget: { from: number; to: number } | null = null;

  // Tracked changes: everyone's versions, the last one being the words as they are now.
  function stepsOf(): Step[] {
    if (!state) return [];
    const vs = state.versions.map((v) => ({ author: v.author, text: v.text, hash: v.hash, seq: v.seq }));
    if (vs.length) vs[vs.length - 1]!.text = sync.text;
    return vs;
  }

  let drawing0: Promise<void> = Promise.resolve();
  function redraw() {
    if (!words || !state) return;
    const r = reviewsOf(state.reviews as unknown as Review[]);
    const settled = (id: string) => !id.startsWith('adv') || r.settled(id);
    const tracked = track(stepsOf(), r.rejectedBy, r.reviewedBy);
    Object.assign(margin, { changes: changesOf(tracked), reviews: state.reviews });
    drawing0 = drawChanges(words, tracked, { settled, drawing: drawing((ids) => ids.every(settled)), order: order() }).then(() => highlight());
  }

  // The engine's reading, as the writer writes.
  let analyzeTimer = 0;
  let analyzing = 0;
  function scheduleAnalysis(delay = 450) {
    clearTimeout(analyzeTimer);
    analyzeTimer = window.setTimeout(async () => {
      const n = ++analyzing;
      try {
        const a = await post<Analysis>('/api/analyze', { author: author.id, tlo: sync.text });
        if (n !== analyzing) return;
        analysis = a;
        score.textContent = `${a.report.score}`;
        score.title = `${a.report.score}/100 like ${author.short}: ${a.words.filter((w) => w.kind !== 'name').length} words ${author.pronouns.subject} never used`;
        await drawing0;
        highlight();
        if (tab !== 'explore') renderSide();
      } catch (e) {
        console.warn(e);
      }
    }, delay);
  }

  const HL = ['advisor-never', 'advisor-form', 'advisor-name', 'advisor-phrase', 'advisor-figure', 'advisor-focus'];
  function highlight(focus?: { block: number; start: number; end: number }) {
    if (!words || !analysis || !('highlights' in CSS)) return;
    const groups: Record<string, Range[]> = { 'advisor-never': [], 'advisor-form': [], 'advisor-name': [], 'advisor-phrase': [], 'advisor-figure': [], 'advisor-focus': [] };
    for (const f of analysis.words) {
      const r = rangeAt(words, f.block, f.start, f.end);
      if (r) groups[`advisor-${f.kind === 'rare' ? 'form' : f.kind}`]!.push(r);
    }
    for (const f of analysis.figures ?? []) {
      const r = rangeAt(words, f.block, f.start, f.end);
      if (r) groups['advisor-figure']!.push(r);
    }
    for (const c of analysis.compounds ?? []) {
      const r = rangeAt(words, c.block, c.start, c.end);
      if (r) groups['advisor-phrase']!.push(r);
    }
    if (focus) {
      const r = rangeAt(words, focus.block, focus.start, focus.end);
      if (r) groups['advisor-focus']!.push(r);
    }
    for (const name of HL) CSS.highlights.set(name, new Highlight(...groups[name]!));
  }

  // Hover: the author's words for a word she never wrote.
  let popFor: WordFlag | null = null;
  let hideTimer = 0;
  function flagAt(x: number, y: number): WordFlag | null {
    if (!words || !analysis) return null;
    const p = posAt(words, x, y);
    if (!p) return null;
    for (const f of analysis.words) {
      if (f.block !== p.block || p.offset < f.start || p.offset > f.end) continue;
      const r = rangeAt(words, f.block, f.start, f.end);
      const rects = r ? [...r.getClientRects()] : [];
      if (rects.some((b) => x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 2 && y <= b.bottom + 2)) return f;
    }
    return null;
  }
  type Fig = Analysis['figures'][number];
  function figureAt(x: number, y: number): Fig | null {
    if (!words || !analysis) return null;
    const p = posAt(words, x, y);
    if (!p) return null;
    return (analysis.figures ?? []).find((f) => f.block === p.block && p.offset >= f.start && p.offset <= f.end) ?? null;
  }
  let figFor: Fig | null = null;
  async function showFigurePop(f: Fig) {
    clearTimeout(hideTimer);
    if (figFor === f && !pop.hidden) return;
    figFor = f;
    popFor = null;
    const r = words && rangeAt(words, f.block, f.start, Math.min(f.end, f.start + 40));
    const rect = r?.getBoundingClientRect();
    const list = h('div', {}, h('p', { class: 'aa-muted aa-small' }, `Finding ${author.short}’s…`));
    pop.replaceChildren(
      h(
        'div',
        { class: 'aa-pop-in' },
        h('div', { class: 'aa-pop-head' }, h('strong', {}, f.name), h('span', { class: 'aa-kind aa-kind-figure' }, 'figure of speech')),
        h('p', { class: 'aa-pop-note' }, f.gloss),
        h('p', { class: 'aa-pop-sub' }, `${author.short}’s own:`),
        list,
      ),
    );
    pop.hidden = false;
    if (rect) {
      const w = Math.min(380, window.innerWidth - 24);
      pop.style.width = `${w}px`;
      pop.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - w - 12))}px`;
      pop.style.top = `${rect.bottom + 8}px`;
    }
    try {
      const info = await get<{ examples: Citation[] }>(`/api/figure?author=${author.id}&term=${f.term}&near=${encodeURIComponent(f.text.slice(0, 300))}&limit=2`);
      if (figFor === f) list.replaceChildren(...info.examples.map((c) => quoteEl(c, openCitation)));
    } catch {
      list.replaceChildren();
    }
  }
  function showFigure(f: Fig) {
    tab = 'explore';
    renderSide();
    showAdvice({ block: f.block, start: f.start, end: f.end } as Advice);
    void explore.showFigure(f.term, f.text);
  }

  function showPop(f: WordFlag) {
    figFor = null;
    clearTimeout(hideTimer);
    if (popFor === f && !pop.hidden) return;
    popFor = f;
    const r = words && rangeAt(words, f.block, f.start, f.end);
    const rect = r?.getBoundingClientRect();
    pop.replaceChildren(wordPop(f));
    pop.hidden = false;
    if (rect) {
      const w = Math.min(380, window.innerWidth - 24);
      pop.style.width = `${w}px`;
      pop.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - w - 12))}px`;
      const below = rect.bottom + 8;
      const ph = pop.offsetHeight;
      pop.style.top = `${below + ph > window.innerHeight - 8 ? Math.max(8, rect.top - ph - 8) : below}px`;
    }
  }
  function hidePop(soon = true) {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { pop.hidden = true; popFor = null; }, soon ? 280 : 0);
  }
  pop.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  pop.addEventListener('mouseleave', () => hidePop());

  function wordPop(f: WordFlag): HTMLElement {
    const alts = f.alternatives;
    return h(
      'div',
      { class: 'aa-pop-in' },
      h('div', { class: 'aa-pop-head' }, h('strong', {}, f.word), h('span', { class: `aa-kind aa-kind-${f.kind}` }, f.kind === 'never' ? 'never in Austen' : f.kind === 'form' ? 'this form never' : 'a name')),
      h('p', { class: 'aa-pop-note' }, f.note),
      alts.length ? h('p', { class: 'aa-pop-sub' }, `Words ${author.short} used instead:`) : null,
      h(
        'ol',
        { class: 'aa-alts' },
        ...alts.map((a: Alternative) =>
          h(
            'li',
            {},
            h('button', { class: 'aa-alt', onclick: () => replaceWord(f, a.text), title: `Put “${a.text}” in place of “${f.word}”` }, a.text),
            h('span', { class: 'aa-alt-why' }, `${a.relation} · ${a.count.toLocaleString()}× in ${author.short}`),
            a.example ? quoteEl(a.example, openCitation) : null,
          ),
        ),
      ),
      h('div', { class: 'aa-pop-foot' }, h('button', { class: 'aa-link', onclick: () => { hidePop(false); showWord(f); } }, `Explore “${f.word}” and its alternatives →`)),
    );
  }

  /** The writer's own edit, made for them from the panel or the popover. */
  function localEdit(ops: Op[]) {
    if (!mounted || !ops.length) return;
    mounted.applyRemote(ops);
    sync.local(ops);
    redraw();
    scheduleAnalysis(100);
  }
  function replaceWord(f: WordFlag, text: string) {
    const b = words?.model[f.block];
    if (!b || !('runs' in b)) return;
    hidePop(false);
    localEdit([{ op: 'text', at: f.block, from: f.start, to: f.end, runs: [{ t: text }] } as Op]);
  }

  async function applyAdvice(a: Advice) {
    if (!a.replacements?.length) return;
    const blockText = (i: number) => {
      const b = words?.model[i];
      return b && 'runs' in b ? b.runs.map((r) => (r.ic || r.fn !== undefined ? '￼' : r.t)).join('') : '';
    };
    const reps = a.replacements.map((r) => {
      const block = r.block < 0 ? a.block : r.block;
      return { block, start: r.start, end: r.end, text: r.text, expect: blockText(block).slice(r.start, r.end) };
    });
    try {
      await post(`/api/docs/${docId}/apply`, { advice: { ...a, examples: a.examples.slice(0, 2) }, replacements: reps });
      toast('Advisor suggested it as a change: accept or reject it in the text or the margin.');
    } catch (e) {
      toast(String((e as Error).message));
    }
  }

  function showAdvice(a: Advice) {
    if (!words) return;
    const els = words.blockEls();
    els[a.block]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    highlight({ block: a.block, start: a.start, end: a.end });
    setTimeout(() => highlight(), 2400);
  }

  function showWord(f: WordFlag | string) {
    tab = 'explore';
    renderSide();
    const w = typeof f === 'string' ? f : f.word;
    let context: string | undefined;
    if (typeof f !== 'string' && words) {
      const b = words.model[f.block];
      context = b && 'runs' in b ? b.runs.map((r) => r.t).join('') : undefined;
    }
    void explore.showWord(w, context);
  }

  async function openCitation(c: Citation) {
    const ctx = await get<{ cite: Citation; paragraph: { text: string; start: number; end: number } | null }>(`/api/context?author=${author.id}&sentence=${c.id}`);
    const p = ctx.paragraph;
    const dlg = h(
      'dialog',
      { class: 'aa-dialog' },
      h('h3', {}, c.cite),
      p ? h('p', { class: 'aa-paragraph' }, p.text.slice(0, p.start), h('mark', {}, p.text.slice(p.start, p.end)), p.text.slice(p.end)) : h('p', {}, c.text),
      h('form', { method: 'dialog' }, h('button', { class: 'aa-btn' }, 'Close')),
    );
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }

  async function austenizeHere() {
    const t = target();
    if (!t) return toast('Put the caret in the paragraph to rewrite.');
    try {
      const r = await post<{ changes?: number }>(`/api/docs/${docId}/austenize`, t);
      toast(r.changes ? `Advisor suggested ${r.changes} change${r.changes === 1 ? '' : 's'}, each from ${author.short}’s own usage.` : 'Advisor found nothing to change here.');
    } catch (e) {
      toast(String((e as Error).message));
    }
  }

  async function rewriteHere(instructions = '') {
    const t = target();
    if (!t) return toast('Put the caret in the paragraph to rewrite, or select several.');
    if (!ai) return toast('Rewrite with AI needs ANTHROPIC_API_KEY where the server runs. Try “Austenize” for the statistical rewrite.');
    try {
      await post(`/api/docs/${docId}/rewrite`, { ...t, instructions });
      toast('Rewritten: see Advisor’s change and its sources in the margin.');
    } catch (e) {
      toast(String((e as Error).message));
    }
  }

  // The bar's own commands.
  const REWRITE = command<Ctx>({
    id: 'advisor.rewrite',
    scope: 'advisor',
    label: () => 'Rewrite with AI',
    hint: () => `Advisor rewrites the paragraph in ${author.short}’s manner with Claude, checking every word against ${author.pronouns.possessive} works`,
    icon: iconNamed('sparkles'),
    keys: 'Mod+Shift+R',
    where: ['bar'],
    does: (c) => c.rewrite(),
  });
  const AUSTENIZE = command<Ctx>({
    id: 'advisor.austenize',
    scope: 'advisor',
    label: () => 'Austenize',
    hint: () => `A statistical rewrite of the paragraph, with no language model: ${author.pronouns.possessive} words for yours, contractions written out, short sentences joined`,
    icon: iconNamed('feather'),
    keys: 'Mod+Shift+A',
    where: ['bar'],
    does: (c) => c.austenize(),
  });
  register([REWRITE, AUSTENIZE] as never);
  const ctx: Ctx = { words: () => words, rewrite: () => void rewriteHere(), austenize: () => void austenizeHere() };

  // Live editing.
  const sync = new Sync(docId, person, {
    async reset(s) {
      state = s;
      for (const p of s.people) people.set(p.id, p.name);
      people.set(person.id, person.name);
      title.textContent = s.title;
      document.title = `${s.title} · Austen Advisor`;
      const a = (await get<AuthorInfo[]>('/api/authors')).find((x) => x.id === s.author);
      if (a) Object.assign(author, a);
      people.set(ADVISOR, author.advisor);
      if (!mounted) {
        mounted = await mount('write', s.text, editorBox, () => {}, { onOps: (ops: Op[]) => sync.local(ops), commands: [REWRITE, AUSTENIZE] as never, context: ctx });
        const ed = mounted.editor;
        words = wordsOf(ed);
        ed.addEventListener('docchange', () => { redraw(); scheduleAnalysis(); });
        ed.addEventListener('docremote', () => { redraw(); scheduleAnalysis(); });
        ed.addEventListener('text-select', () => {
          const q = words && quoteAt(words);
          const one = q?.quote.trim();
          if (one && /^[\p{L}'’-]+$/u.test(one) && one.length > 1) { tab = 'explore'; renderSide(); void explore.showWord(one, words!.model[q!.block] && 'runs' in words!.model[q!.block]! ? (words!.model[q!.block] as { runs: { t: string }[] }).runs.map((r) => r.t).join('') : undefined); }
          else if (one && one.split(/\s+/).length > 1 && one.split(/\s+/).length <= 5) { tab = 'explore'; renderSide(); void explore.search(one); }
          else if (tab === 'advisor') renderSide();
        });
        const tx = (words as unknown as { tx: HTMLElement }).tx;
        let raf = 0;
        tx.addEventListener('mousemove', (e) => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const f = flagAt(e.clientX, e.clientY);
            const g = f ? null : figureAt(e.clientX, e.clientY);
            if (f && f.alternatives.length + (f.kind === 'name' ? 0 : 1) > 0) showPop(f);
            else if (g) showFigurePop(g);
            else if (!pop.matches(':hover')) hidePop();
          });
        });
        tx.addEventListener('mouseleave', () => hidePop());
        Object.assign(margin, { words, ask: { id: ADVISOR, name: author.advisor }, me: person.id, canComment: true, canReview: true });
        margin.toggleAttribute('can-comment', true);
        margin.toggleAttribute('can-review', true);
      } else {
        mounted.editor.value = s.text;
      }
      Object.assign(margin, { comments: s.comments, people: peopleList() });
      renderSide();
      redraw();
      scheduleAnalysis(0);
    },
    remote(ops) {
      // Carried over ours already; applyRemote fires "docremote", which draws and reads again.
      mounted?.applyRemote(ops);
    },
    versions(v) {
      if (state) state.versions = v;
      redraw();
    },
    state(s) {
      if (!state) return;
      Object.assign(state, s);
      for (const p of state.people) if (!people.has(p.id)) people.set(p.id, p.name);
      Object.assign(margin, { comments: state.comments, people: peopleList() });
      redraw();
      if (tab === 'advisor') renderSide();
    },
    status(text) {
      status.textContent = text ?? '';
      status.classList.toggle('on', !!text);
    },
    presence(list) {
      for (const p of list) people.set(p.id, p.name);
      online.replaceChildren(
        ...list.map((p) => {
          const av = document.createElement('to-avatar') as unknown as HTMLElement & Record<string, unknown>;
          Object.assign(av, { name: p.name, color: colorOf(p.id, order()) });
          av.title = p.name;
          return av;
        }),
      );
    },
    connection(up) {
      root.classList.toggle('aa-offline', !up);
    },
  });

  // The margin's asks.
  margin.addEventListener('comment-send', async (e) => {
    const d = (e as CustomEvent).detail as { text: string; ask: boolean; parent_id: string | null; quote: { quote: string; block: number; offset: number } | null; done(ok?: boolean): void };
    try {
      await post(`/api/docs/${docId}/comments`, { by: person.id, text: d.text, ask: d.ask, parent_id: d.parent_id, quote: d.quote?.quote, block: d.quote?.block, offset: d.quote?.offset });
      d.done(true);
    } catch {
      d.done(false);
    }
  });
  margin.addEventListener('comment-resolve', (e) => {
    const d = (e as CustomEvent).detail as { thread_id: string; resolved: boolean };
    void post(`/api/docs/${docId}/comments/${d.thread_id}/resolve`, { resolved: d.resolved });
  });
  margin.addEventListener('comment-delete', (e) => void post(`/api/docs/${docId}/comments/${(e as CustomEvent).detail.id}/delete`, {}));
  const review = (verdict: 'accepted' | 'rejected') => async (e: Event) => {
    const ids = (e as CustomEvent).detail.ids as string[];
    try {
      await post(`/api/docs/${docId}/review`, { ids, verdict, by: person.id });
    } catch (err) {
      toast(String((err as Error).message));
    }
  };
  for (const el of [margin, panelBody]) {
    el.addEventListener('review-accept', review('accepted'));
    el.addEventListener('review-reject', review('rejected'));
  }

  get<{ available: boolean }>('/api/ai').then((r) => { ai = r.available; if (tab === 'advisor') renderSide(); }).catch(() => {});
  renderSide();
  window.addEventListener('resize', () => highlight());
  void drawing0;
}
