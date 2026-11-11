// COMPOSE: the voice, the form, the text, and the engine's first reading of it as the student types. One native
// select holds every voice: three suggested for this piece first, then the families, the styles last. Beside it a
// second select holds the forms, "Auto" first; under them is one checkbox, "Add facts from Wikipedia". Under the box are the voice the text
// already sounds like and the samples by kind. On a phone the select and the Rewrite button sit in
// a bar at the foot of the screen.

import { button, cap, fill, h, type AuthorInfo, type Boot, type Definer, type Family, type Reading, type Sample } from './api.ts';

export const FAMILY_NAMES: Record<Family, string> = { storytellers: 'Storytellers', speakers: 'Speakers', arguers: 'Arguers', essayists: 'Essayists', styles: 'Styles' };
const FAMILY_ORDER: Family[] = ['storytellers', 'speakers', 'arguers', 'essayists', 'styles'];
/** The voices in the order the select lists them: within each family, the order a reader meets them. */
const VOICE_ORDER = ['austen', 'eliot', 'dickens', 'twain', 'hemingway', 'hammett', 'woolf', 'fairy', 'lincoln', 'douglass', 'obama', 'kjv', 'shakespeare', 'federalist', 'johnson', 'gibbon', 'chesterton', 'emerson', 'thoreau', 'wilde', 'plain'];
export const KINDS = ['argument', 'story', 'letter', 'speech', 'essay', 'review'];
export const RESTING = 'Rewrites of your own text are off for now. Every sample has a rewrite ready.';

const lowerFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t);
export const article = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
export const sortVoices = (vs: AuthorInfo[]) => [...vs].sort((a, b) => rank(a.id) - rank(b.id) || a.title.localeCompare(b.title));
const rank = (id: string) => (VOICE_ORDER.includes(id) ? VOICE_ORDER.indexOf(id) : 99);

export interface Suggested {
  label: string;
  ids: string[];
}

/** Fill a select with the voices: the suggested ones first, then each family. A voice ready for this text says so. */
export function fillVoices(sel: HTMLSelectElement, voices: AuthorInfo[], current: string, suggested: Suggested | null, ready: Set<string>) {
  const opt = (v: AuthorInfo) => h('option', { value: v.id }, `${v.title}${v.tagline ? `: ${lowerFirst(v.tagline.replace(/\.$/, ''))}` : ''}${ready.has(v.id) ? ' · ready' : ''}`);
  const byId = new Map(voices.map((v) => [v.id, v]));
  const groups: HTMLOptGroupElement[] = [];
  const sugg = (suggested?.ids ?? []).map((id) => byId.get(id)).filter((v): v is AuthorInfo => !!v);
  if (sugg.length) groups.push(h('optgroup', { label: suggested!.label }, ...sugg.map(opt)));
  for (const f of FAMILY_ORDER) {
    const vs = sortVoices(voices.filter((v) => (v.family ?? 'storytellers') === f));
    if (vs.length) groups.push(h('optgroup', { label: FAMILY_NAMES[f] }, ...vs.map(opt)));
  }
  sel.replaceChildren(...groups);
  sel.value = current;
}

export interface ComposeView {
  el: HTMLElement;
  area: HTMLTextAreaElement;
  select: HTMLSelectElement;
  /** The form asked for: 'auto' or a form's id. */
  form(): string;
  /** Whether facts from Wikipedia are asked for. */
  facts(): boolean;
  /** The sample in the box, while its text is unchanged. */
  sample(): Sample | null;
  setVoice(v: AuthorInfo): void;
  setReading(r: Reading | null): void;
  setReady(ready: Set<string>): void;
  setResting(on: boolean): void;
  /** A plain line under the box, such as why a text cannot be rewritten; null clears it. */
  setNotice(text: string | null): void;
  suggested(): Suggested | null;
}

export interface ComposeOptions {
  boot: Boot;
  voices: AuthorInfo[];
  terms: Definer;
  text: string;
  voice: AuthorInfo;
  onVoice(id: string): void;
  /** The form and the facts as they were left last time. */
  form?: string;
  facts?: boolean;
  /** The form or the facts checkbox changed. */
  onOptions?(): void;
  /** The text changed and has rested 400 ms. */
  onText(text: string): void;
  onGo(): void;
}

export function compose(o: ComposeOptions): ComposeView {
  const byId = new Map(o.voices.map((v) => [v.id, v]));
  let voice = o.voice;
  let sample: Sample | null = null;
  let suggested: Suggested | null = null;
  let ready = new Set<string>();
  let wait: ReturnType<typeof setTimeout> | undefined;

  const select = h('select', { id: 'pg-voice', class: 'pg-select' }) as HTMLSelectElement;
  select.addEventListener('change', () => o.onVoice(select.value));
  const go = h('button', { type: 'button', class: 'pg-btn pg-primary', 'data-primary': '' }, 'Rewrite');
  go.addEventListener('click', () => o.onGo());
  // The form: "Auto" takes the form of the kind of writing the text is; each form's definition is its title.
  const forms = o.boot.forms ?? [];
  const auto = h('option', { value: 'auto', title: 'The form of the kind of writing your text already is.' }, 'Auto');
  const formSelect = h('select', { id: 'pg-form', class: 'pg-select pg-form', 'aria-label': 'Form' }, auto, ...forms.map((f) => h('option', { value: f.id, title: f.definition }, f.name))) as HTMLSelectElement;
  formSelect.value = forms.some((f) => f.id === o.form) ? o.form! : 'auto';
  formSelect.addEventListener('change', () => o.onOptions?.());
  const factsBox = h('input', { type: 'checkbox', id: 'pg-facts' }) as HTMLInputElement;
  factsBox.checked = !!o.facts;
  factsBox.addEventListener('change', () => o.onOptions?.());
  const options = h('div', { class: 'pg-options' }, h('label', { class: 'pg-check', for: 'pg-facts' }, factsBox, 'Add facts from Wikipedia'));
  const dock = h(
    'div',
    { class: 'pg-dock' },
    h('div', { class: 'pg-pick' }, h('label', { for: 'pg-voice', class: 'pg-pick-label' }, 'Rewrite it as'), select, forms.length ? h('label', { for: 'pg-form', class: 'pg-pick-label' }, 'Form') : null, forms.length ? formSelect : null),
    go,
  );

  const epigraph = h('p', { class: 'pg-epigraph' });
  const area = h('textarea', { class: 'pg-input', rows: 12, spellcheck: true, placeholder: 'Paste or write a paragraph or a page.', 'aria-label': 'Your text' }) as HTMLTextAreaElement;
  area.value = o.text;
  const sounds = h('p', { class: 'pg-sounds', 'aria-live': 'polite' });
  const sampleLine = h('p', { class: 'pg-sample-line', 'aria-live': 'polite' });
  const resting = h('p', { class: 'pg-resting', hidden: true }, RESTING);
  const notice = h('p', { class: 'pg-resting pg-notice', hidden: true, role: 'status' });

  // The samples by kind: a tap fills the box with one, and a second tap with the next of that kind.
  const kinds = KINDS.filter((k) => o.boot.samples.some((s) => s.kind === k));
  const turn = new Map<string, number>();
  const pickKind = (k: string) => {
    const of = o.boot.samples.filter((s) => s.kind === k);
    if (!of.length) return;
    const i = turn.has(k) ? turn.get(k)! + 1 : Math.floor(Math.random() * of.length);
    turn.set(k, i);
    useSample(of[i % of.length]!);
  };
  const shuffle = () => {
    const pool = o.boot.samples.filter((s) => s !== sample);
    if (pool.length) useSample(pool[Math.floor(Math.random() * pool.length)]!);
  };
  const chips = h(
    'div',
    { class: 'pg-kinds' },
    h('span', { class: 'pg-kinds-label' }, o.boot.samples.length ? 'Or try a sample:' : ''),
    ...kinds.map((k) => button(cap(k), () => pickKind(k), { class: 'pg-chip', 'data-kind': k })),
    o.boot.samples.length ? button('Shuffle', shuffle, { class: 'pg-chip pg-chip-quiet' }) : null,
  );

  const el = h('section', { class: 'pg-compose', 'aria-label': 'Your text' }, dock, options, epigraph, area, sounds, chips, sampleLine, notice, resting);

  function teachName(id: string): string {
    const t = o.terms.definition(id);
    if (t) return t.term.toLowerCase();
    for (const v of o.voices) {
      const m = v.moves.find((x) => x.id === id);
      if (m) return m.name.toLowerCase();
    }
    return id.replace(/-/g, ' ');
  }

  function useSample(s: Sample) {
    area.value = s.text;
    sample = s;
    const level = s.level ? (s.level === 'college' ? 'college' : `grades ${s.level}`) : '';
    const teaches = (s.teaches ?? []).slice(0, 3).map(teachName);
    sampleLine.replaceChildren(h('strong', {}, s.title), ...o.terms.defined([s.kind ?? '', level, teaches.length ? `teaches ${teaches.join(', ')}` : ''].filter(Boolean).map((x) => ` · ${x}`).join('')));
    const best = [...(s.bestVoices ?? [])].filter((id) => byId.get(id)?.built);
    setSuggested(best.length ? { label: `Suggested for ${s.kind ? article(s.kind) : 'this piece'}`, ids: best.slice(0, 3) } : suggested);
    sounds.textContent = '';
    o.onText(area.value);
  }

  function setSuggested(s: Suggested | null) {
    suggested = s;
    fillVoices(select, o.voices, voice.id, suggested, ready);
  }

  area.addEventListener('input', () => {
    if (sample && area.value !== sample.text) {
      sample = null;
      sampleLine.textContent = '';
    }
    clearTimeout(wait);
    wait = setTimeout(() => o.onText(area.value), 400);
  });
  area.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') o.onGo();
  });

  function setVoice(v: AuthorInfo) {
    voice = v;
    fillVoices(select, o.voices, v.id, suggested, ready);
    fill(epigraph, h('span', { class: 'pg-epi-voice' }, `Rewrite it as ${v.title}`), v.epigraph ? h('q', {}, v.epigraph.text) : null, v.epigraph ? h('cite', {}, ` ${v.epigraph.cite}`) : null);
  }
  setVoice(voice);
  // A text kept from last time that is a sample is that sample again.
  sample = o.boot.samples.find((s) => s.text === o.text) ?? null;

  return {
    el,
    area,
    select,
    form: () => formSelect.value || 'auto',
    facts: () => factsBox.checked,
    sample: () => sample,
    setVoice,
    setReading(r) {
      // Under Auto the option names the form the engine took the text for.
      auto.textContent = r?.form?.auto ? `Auto: ${r.form.name.toLowerCase()}` : 'Auto';
      if (!r) {
        sounds.textContent = '';
        return;
      }
      const name = (id: string | null) => (id ? byId.get(id)?.title ?? id : null);
      const like = name(r.suggest.soundsLike);
      const stretch = name(r.suggest.stretch);
      sounds.replaceChildren(...[like ? `You sound like ${like}` : '', stretch && stretch !== like ? `For a stretch, try ${stretch}` : ''].filter(Boolean).join(' · '));
      if (!sample) {
        const ids = [r.suggest.kind, r.suggest.soundsLike, r.suggest.stretch].filter((x, i, a): x is string => !!x && a.indexOf(x) === i && !!byId.get(x)?.built);
        setSuggested(ids.length ? { label: `Suggested for this ${r.kind}`, ids } : null);
      }
    },
    setReady(r) {
      ready = r;
      fillVoices(select, o.voices, voice.id, suggested, ready);
    },
    setResting(on) {
      resting.hidden = !on;
    },
    setNotice(text) {
      notice.hidden = !text;
      notice.textContent = text ?? '';
    },
    suggested: () => suggested,
  };
}
