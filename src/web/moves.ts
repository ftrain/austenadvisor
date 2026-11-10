// Your moves: the sentences in which the writer made a move, kept on this device. It keeps no counts or streaks.
// Each entry is the writer's own sentence and the move it makes, and the list saves as plain text. Moves of the
// voices the writer has used that are not yet in the list are offered under “Try next”.

import { button, fill, h, keep, type AuthorInfo, type Definer } from './api.ts';

export interface MoveEntry {
  voice: string;
  /** The move's id, as /api/practice takes it. */
  move: string;
  name: string;
  sentence: string;
  /** When it was made, as an ISO date. */
  at: string;
}
interface Book {
  entries: MoveEntry[];
  /** Voices the writer has read their text in, most recent first. */
  voices: string[];
}

export const MOVES_KEY = 'advisor.moves';

export interface MovesView {
  el: HTMLElement;
  add(e: Omit<MoveEntry, 'at'>): void;
  useVoice(id: string): void;
  entries(): MoveEntry[];
}

export function movesBook(voices: AuthorInfo[], terms: Definer): MovesView {
  const byId = new Map(voices.map((v) => [v.id, v]));
  const read = (): Book => {
    const b = keep.get<Book | null>(MOVES_KEY, null);
    return { entries: Array.isArray(b?.entries) ? b!.entries.filter((e) => e && typeof e.sentence === 'string') : [], voices: Array.isArray(b?.voices) ? b!.voices : [] };
  };
  let book = read();
  let open = false;

  const toggle = h('button', { type: 'button', class: 'pg-moves-toggle', 'aria-expanded': 'false', 'aria-controls': 'pg-moves-body' });
  const names = h('span', { class: 'pg-moves-names' });
  const body = h('div', { class: 'pg-moves-body', id: 'pg-moves-body', hidden: true });
  const el = h('section', { class: 'pg-moves', 'aria-label': 'Your moves' }, h('div', { class: 'pg-moves-bar' }, toggle, names), body);
  toggle.addEventListener('click', () => {
    open = !open;
    draw();
  });

  function tryNext(): string[] {
    const made = new Set(book.entries.map((e) => `${e.voice}:${e.move}`));
    const out: string[] = [];
    for (const id of book.voices) {
      const v = byId.get(id);
      for (const m of v?.moves ?? []) if (!made.has(`${id}:${m.id}`) && out.length < 4) out.push(`${m.name} (${v!.short})`);
    }
    return out;
  }

  function asText(): string {
    return book.entries.map((e) => `${e.sentence}\n    ${e.name}, after ${byId.get(e.voice)?.title ?? e.voice}, ${e.at.slice(0, 10)}`).join('\n\n') + '\n';
  }

  function save() {
    const blob = new Blob([asText()], { type: 'text/plain' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'my-moves.txt' });
    document.body.append(a);
    a.click();
    a.remove();
  }

  function draw() {
    const n = book.entries.length;
    toggle.textContent = `Your moves (${n})`;
    toggle.setAttribute('aria-expanded', String(open));
    const uniq = [...new Set(book.entries.map((e) => e.name))];
    names.replaceChildren(...(uniq.length ? terms.defined(uniq.slice(0, 4).join(' · ')) : ['Sentences you pass with Try it are kept here.']));
    body.hidden = !open;
    const next = tryNext();
    fill(
      body,
      n
        ? h('ol', { class: 'pg-moves-list' }, ...book.entries.map((e) => h('li', {}, h('p', { class: 'pg-moves-sentence' }, e.sentence), h('p', { class: 'pg-moves-meta' }, ...terms.defined(e.name), `, after ${byId.get(e.voice)?.title ?? e.voice}`))))
        : h('p', { class: 'pg-muted' }, 'No moves yet. Sentences you pass with Try it are kept here, on this device.'),
      next.length ? h('p', { class: 'pg-moves-next' }, h('span', { class: 'pg-label' }, 'Try next '), ...terms.defined(next.join(' · '))) : null,
      n ? button('Save as text', save) : null,
    );
  }

  function store() {
    keep.set(MOVES_KEY, book);
    draw();
  }

  draw();
  return {
    el,
    add(e) {
      if (book.entries.some((x) => x.sentence === e.sentence && x.move === e.move)) return;
      book.entries.unshift({ ...e, at: new Date().toISOString() });
      store();
    },
    useVoice(id) {
      book.voices = [id, ...book.voices.filter((v) => v !== id)].slice(0, 6);
      store();
    },
    entries: () => book.entries,
  };
}
