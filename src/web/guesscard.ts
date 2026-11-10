// The guess card: a real sentence from one of three voices, and the student says whose it is. It sits under the text
// while they write, and over the rewrite column while a rewrite is on its way. The answer comes with what gives the
// voice away: its words, its figures and its length.

import { button, fill, get, h, type Definer, type GuessCard } from './api.ts';

export interface GuessView {
  el: HTMLElement;
  /** Deal rounds from these voices. The same list again keeps the rounds already dealt. */
  load(voices: string[]): void;
}

export function guessCard(terms: Definer): GuessView {
  let rounds: GuessCard[] = [];
  let names: Record<string, string> = {};
  let at = 0;
  let dealt = '';
  let asking: AbortController | null = null;
  const body = h('div', { class: 'pg-guess-body', 'aria-live': 'polite' });
  const el = h('section', { class: 'pg-guess', hidden: true, 'aria-label': 'Guess the writer' }, h('p', { class: 'pg-guess-head' }, 'Guess whose sentence this is.'), body);

  const name = (id: string) => names[id] ?? id;
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

  function draw() {
    const r = rounds[at % Math.max(1, rounds.length)];
    if (!r) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const answer = h('div', { class: 'pg-guess-answer' });
    const choices = r.choices.map((c) =>
      button(cap(name(c)), () => {
        for (const b of choices) {
          b.disabled = true;
          b.classList.toggle('pg-right', b.dataset.choice === r.answer);
        }
        const right = c === r.answer;
        const words = r.tells.words.slice(0, 3).map((w) => w.word);
        const next = button('Another', () => {
          at++;
          draw();
          body.querySelector<HTMLButtonElement>('.pg-guess-choices button')?.focus();
        });
        fill(
          answer,
          h('p', { class: right ? 'pg-ok' : 'pg-notyet' }, right ? `Yes, ${name(r.answer)}.` : `No. ${cap(name(r.answer))} wrote it.`, ' ', h('cite', {}, r.cite)),
          words.length || r.tells.figures.length
            ? h(
                'p',
                { class: 'pg-guess-tells' },
                ...terms.defined(
                  [words.length ? `The words that give it away: ${words.join(', ')}.` : '', r.tells.figures.length ? `It uses ${r.tells.figures.join(' and ')}.` : ''].filter(Boolean).join(' '),
                ),
              )
            : null,
          next,
        );
        next.focus();
      }, { 'data-choice': c }),
    );
    body.replaceChildren(h('blockquote', { class: 'pg-guess-text' }, `“${r.text.replace(/^[“"]|[”"]$/g, '')}”`), h('div', { class: 'pg-guess-choices' }, ...choices), answer);
  }

  return {
    el,
    load(voices) {
      const want = [...new Set(voices.filter(Boolean))].slice(0, 3);
      const key = want.join(',');
      if (key === dealt && rounds.length) return;
      dealt = key;
      asking?.abort();
      asking = new AbortController();
      const signal = asking.signal;
      const deal = (voices: string) => get<{ rounds: GuessCard[]; names: Record<string, string> }>(`/api/guess?voices=${encodeURIComponent(voices)}&n=10`, signal);
      // Voices with no rounds yet leave fewer than three to choose among: then deal from every voice that has them.
      deal(key)
        .then((g) => (g.rounds.length && g.rounds.every((r) => r.choices.length >= 3) ? g : deal('')))
        .then((g) => {
          rounds = g.rounds ?? [];
          names = g.names ?? {};
          at = 0;
          draw();
        })
        .catch(() => {
          /* Without rounds the card stays hidden. */
        });
    },
  };
}
