// Explore the author: any word or phrase, how often and where she used it, the words nearest it in her usage, the
// words found beside it, and her sentences, each cited and opening into its paragraph.

import { cap, get, h, quoteEl, type Citation, type Kwic, type Pronouns, type WordProfile } from './api.ts';

type Who = { id: string; short: string; pronouns: Pronouns };

export class ExplorePanel {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private body: HTMLElement;
  private author: () => Who;
  private onCite: (c: Citation) => void;
  private seq = 0;

  constructor(author: () => Who, onCite: (c: Citation) => void) {
    this.author = author;
    this.onCite = onCite;
    this.input = h('input', { class: 'aa-input', type: 'search', placeholder: 'A word or a phrase: “tolerable”, “at last”…', 'aria-label': 'Search the works' }) as HTMLInputElement;
    const form = h('form', { class: 'aa-search', onsubmit: (e: Event) => { e.preventDefault(); void this.search(this.input.value); } }, this.input, h('button', { class: 'aa-btn' }, 'Search'));
    this.body = h('div', { class: 'aa-explore-body' }, h('p', { class: 'aa-muted' }, `Select a word in your text, or search, to see how ${author().short} used it. Every sentence here is ${author().short}’s, with where to find it.`));
    this.el = h('div', { class: 'aa-explore' }, form, this.body);
  }

  async search(q: string) {
    const text = q.trim();
    if (!text) return;
    this.input.value = text;
    const words = text.split(/\s+/);
    if (words.length === 1) return this.showWord(text);
    const n = ++this.seq;
    this.body.replaceChildren(h('p', { class: 'aa-muted' }, 'Searching…'));
    const hits = await get<Kwic[]>(`/api/concordance?author=${this.author().id}&q=${encodeURIComponent(text)}&limit=40`);
    if (n !== this.seq) return;
    this.body.replaceChildren(
      h('h3', {}, `“${text}”`, h('span', { class: 'aa-count' }, String(hits.length))),
      hits.length ? this.kwic(hits.map((x) => x.cite), text) : h('p', { class: 'aa-muted' }, `${cap(this.author().pronouns.subject)} never wrote it so. Try fewer words.`),
    );
  }

  async showWord(word: string, context?: string) {
    const n = ++this.seq;
    this.input.value = word;
    this.body.replaceChildren(h('p', { class: 'aa-muted' }, `Looking up “${word}”…`));
    const p = await get<WordProfile>(`/api/word?author=${this.author().id}&word=${encodeURIComponent(word)}${context ? `&context=${encodeURIComponent(context.slice(0, 600))}` : ''}`);
    if (n !== this.seq) return;
    const chip = (w: string, title?: string) => h('button', { class: 'aa-chip', onclick: () => void this.showWord(w), title }, w);
    const maxWork = Math.max(1, ...p.works.map((w) => w.count));
    this.body.replaceChildren(
      ...([
      h('h3', { class: 'aa-word-head' }, p.word, h('span', { class: `aa-kind ${p.count ? '' : 'aa-kind-never'}` }, p.count ? `${p.count.toLocaleString()}×` : 'never')),
      h('p', {}, p.note, p.count ? ` In narration ${p.inNarration.toLocaleString()}, in speech ${p.inSpeech.toLocaleString()}.` : ''),
      p.alternatives?.length
        ? h(
            'section',
            { class: 'aa-card' },
            h('h4', {}, `${cap(this.author().pronouns.possessive)} words instead`),
            ...p.alternatives.map((a) => h('div', { class: 'aa-alt-row' }, h('p', {}, chip(a.text), h('span', { class: 'aa-alt-why' }, ` ${a.relation} · ${a.count.toLocaleString()}×`)), a.example ? quoteEl(a.example, this.onCite) : null)),
          )
        : null,
      p.works.length
        ? h('section', { class: 'aa-card' }, h('h4', {}, 'By work'), ...p.works.map((w) => h('div', { class: 'aa-work' }, h('span', {}, w.title), h('span', { class: 'aa-work-bar', style: { width: `${(w.count / maxWork) * 100}%` } }), h('span', { class: 'aa-muted' }, String(w.count)))))
        : null,
      p.tags.length ? h('p', { class: 'aa-small aa-muted' }, `As ${p.tags.map((t) => `${t.name} (${t.count})`).join(', ')}. Forms: ${p.forms.map((f) => `${f.form} ${f.count}`).join(', ')}.`) : null,
      p.neighbours.length ? h('section', { class: 'aa-card' }, h('h4', {}, `Nearest in ${this.author().pronouns.possessive} usage`), h('p', { class: 'aa-small aa-muted' }, `Words used in the same company (PPMI word vectors of ${this.author().pronouns.possessive} works alone).`), h('div', { class: 'aa-chips' }, ...p.neighbours.map((w) => chip(w)))) : null,
      p.collocates.length ? h('section', { class: 'aa-card' }, h('h4', {}, 'Found beside it'), h('p', { class: 'aa-small aa-muted' }, 'Within five words, more than chance (Dunning’s log-likelihood).'), h('div', { class: 'aa-chips' }, ...p.collocates.map((c) => chip(c.word, `${c.together} times together`)))) : null,
      p.examples.length ? h('section', {}, h('h4', {}, `In ${this.author().pronouns.possessive} sentences`), this.kwic(p.examples, p.word)) : null,
      ].filter(Boolean) as HTMLElement[]),
    );
  }

  private kwic(cites: Citation[], q: string): HTMLElement {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]").replace(/\s+/g, '[\\s\\W]+')})`, 'i');
    return h(
      'div',
      { class: 'aa-kwic' },
      ...cites.map((c) => {
        const parts = c.text.split(re);
        const quote = quoteEl(c, this.onCite);
        const textEl = quote.querySelector('.aa-quote-text')!;
        textEl.replaceChildren(...parts.map((s, i) => (i % 2 ? h('mark', {}, s) : s)));
        return quote;
      }),
    );
  }
}
