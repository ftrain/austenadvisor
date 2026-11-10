// Try it: inside a row, the writer rewrites one of their own sentences with a move, and the engine checks it in
// about 200 ms. The block has three small columns, like the page: your sentence, your try, and why. A pass goes into
// Your moves.

import { button, fill, h, post, type AuthorInfo, type Definer, type PracticeCheck } from './api.ts';
import type { MovesView } from './moves.ts';

export interface TryItOptions {
  voice: AuthorInfo;
  /** The move's id or name, as /api/practice takes it. */
  move: string;
  name: string;
  /** The writer's sentence to try it on. */
  sentence: string;
  /** A form to fill, when it is known before the first check. */
  hint?: string;
  terms: Definer;
  moves: MovesView;
  onClose: () => void;
}

export function tryIt(o: TryItOptions): HTMLElement {
  const id = `pg-try-${Math.random().toString(36).slice(2, 8)}`;
  const box = h('textarea', { class: 'pg-try-input', rows: 3, id, spellcheck: true }) as HTMLTextAreaElement;
  box.value = o.sentence;
  const why = h('div', { class: 'pg-try-why', 'aria-live': 'polite' }, o.hint ? h('p', { class: 'pg-muted' }, ...o.terms.defined(o.hint)) : null);
  const check = button('Check', () => void run(), { class: 'pg-btn pg-btn-main' });
  const close = button('Close', () => o.onClose());

  async function run() {
    const text = box.value.trim();
    if (!text) return box.focus();
    check.disabled = true;
    why.replaceChildren(h('p', { class: 'pg-muted' }, 'Checking…'));
    try {
      const c = await post<PracticeCheck>('/api/practice', { author: o.voice.id, text, move: o.move });
      const made = c.move ? c.move.made : c.made;
      if (made) o.moves.add({ voice: o.voice.id, move: c.move?.id ?? o.move, name: c.move?.name ?? o.name, sentence: text });
      fill(
        why,
        ...[
          h('p', { class: `pg-verdict ${made ? 'pg-ok' : 'pg-notyet'}` }, ...o.terms.defined(c.verdict || (made ? 'Yes.' : 'Not yet.'))),
          made ? h('p', { class: 'pg-muted' }, 'Kept in Your moves.') : null,
          c.also.length ? h('p', { class: 'pg-try-also' }, ...o.terms.defined(`Also in it: ${c.also.join(', ')}.`)) : null,
          c.never.length
            ? h('p', { class: 'pg-try-also' }, ...c.never.flatMap((w, i) => [i ? ' ' : '', `${o.voice.short} never wrote “${w.word}”${w.theirs.length ? `; try “${w.theirs[0]}”` : ''}.`]))
            : null,
          !made && c.move?.example ? h('blockquote', { class: 'pg-q' }, `“${c.move.example.text}”`, ' ', h('cite', {}, c.move.example.cite)) : null,
        ],
      );
    } catch (e) {
      why.replaceChildren(h('p', { class: 'pg-muted' }, `Could not check it: ${(e as Error).message}`));
    } finally {
      check.disabled = false;
    }
  }
  box.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void run();
    if (e.key === 'Escape') o.onClose();
  });

  return h(
    'div',
    { class: 'pg-tryit', role: 'group', 'aria-label': `Try it: ${o.name}` },
    h('div', { class: 'pg-try-col' }, h('p', { class: 'pg-label' }, 'Yours'), h('p', { class: 'pg-try-yours' }, o.sentence)),
    h('div', { class: 'pg-try-col' }, h('label', { class: 'pg-label', for: id }, `Your try: write it again with ${o.name.toLowerCase()}`), box, h('div', { class: 'pg-try-buttons' }, check, close)),
    h('div', { class: 'pg-try-col' }, h('p', { class: 'pg-label' }, 'Why'), why),
  );
}
