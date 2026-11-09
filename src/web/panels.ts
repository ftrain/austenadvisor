// Advisor's panel (what to change and why, with the author's sentences) and the Style panel (the measures, and what
// they mean for a writer learning to think like the author).

import { h, quoteEl, type Pronouns, type Advice, type Analysis, type Citation, type WordFlag } from './api.ts';

interface AuthorRef {
  id: string;
  short: string;
  advisor: string;
  name: string;
  pronouns: Pronouns;
}

export interface AdvisorPanelOpts {
  author: AuthorRef;
  analysis: Analysis | null;
  ai: boolean;
  reviewPanel: HTMLElement;
  target: string;
  onApply(a: Advice): void;
  onShow(a: Advice): void;
  onWord(f: WordFlag): void;
  onCite(c: Citation): void;
  onAustenize(): void;
  onRewrite(instructions: string): void;
  /** A figure of speech in the draft: shown in the text, with the author's examples of it. */
  onFigure(f: Analysis['figures'][number]): void;
}

const SEV: Record<string, string> = { fix: 'Fix', consider: 'Consider', note: 'Note' };

function scoreRing(score: number): HTMLElement {
  const deg = Math.round((score / 100) * 360);
  return h('div', { class: 'aa-ring', style: { background: `conic-gradient(var(--aa-accent) ${deg}deg, var(--to-surface-2, #eee) 0)` }, role: 'img', 'aria-label': `${score} of 100` }, h('span', {}, String(score)));
}

export function renderAdvisor(o: AdvisorPanelOpts): HTMLElement {
  const { author, analysis: a } = o;
  const el = h('div', { class: 'aa-advisor' });
  const instr = h('input', { class: 'aa-input', type: 'text', placeholder: 'Ask for something (optional): “more ironic”, “keep it short”…' }) as HTMLInputElement;
  el.append(
    h(
      'section',
      { class: 'aa-card aa-actions' },
      h('h3', {}, 'Rewrite'),
      h('p', { class: 'aa-muted' }, `${o.target}. Both make Advisor’s suggestions as tracked changes, each explained with ${author.short}’s own sentences.`),
      h(
        'div',
        { class: 'aa-row' },
        h('button', { class: 'aa-btn', onclick: () => o.onAustenize(), title: 'Statistics only: no language model' }, 'Austenize'),
        h('button', { class: 'aa-btn aa-primary', onclick: () => o.onRewrite(instr.value), disabled: !o.ai, title: o.ai ? 'Claude, with the engine as its tools' : 'Needs ANTHROPIC_API_KEY on the server' }, '✦ Rewrite with AI'),
      ),
      instr,
      o.ai ? null : h('p', { class: 'aa-muted aa-small' }, 'Rewrite with AI is off: the server has no ANTHROPIC_API_KEY. Everything else here is statistics, with no language model.'),
    ),
    o.reviewPanel,
  );
  if (!a) {
    el.append(h('p', { class: 'aa-muted' }, `Reading against ${author.name}…`));
    return el;
  }
  const flagged = a.words.filter((w) => w.kind !== 'name');
  const names = a.words.filter((w) => w.kind === 'name');
  el.append(
    h(
      'section',
      { class: 'aa-card aa-scorecard' },
      scoreRing(a.report.score),
      h(
        'div',
        {},
        h('h3', {}, `${a.report.score} of 100 like ${author.short}`),
        h('p', { class: 'aa-muted' }, `${a.report.words.toLocaleString()} words, ${a.report.sentences} sentences, ${a.report.paragraphs} paragraphs. ${Math.round(a.report.authorWords * 100)}% are words ${author.short} used. Read in ${a.ms} ms.`),
      ),
    ),
  );
  el.append(
    h(
      'section',
      { class: 'aa-card' },
      h('h3', {}, `Words ${author.short} never wrote`, h('span', { class: 'aa-count' }, String(flagged.length))),
      flagged.length
        ? h('p', { class: 'aa-muted aa-small' }, `Underlined in red in the text. Hover one for ${author.pronouns.possessive} words in its place; click here to explore.`)
        : h('p', { class: 'aa-muted' }, `Every word here is one ${author.short} used.`),
      h('div', { class: 'aa-chips' }, ...flagged.map((f) => h('button', { class: `aa-chip aa-chip-${f.kind}`, onclick: () => o.onWord(f), title: f.note }, f.word, f.alternatives[0] ? h('span', { class: 'aa-chip-alt' }, ` → ${f.alternatives[0].text}`) : null))),
      names.length ? h('p', { class: 'aa-muted aa-small' }, `Names ${author.pronouns.subject} never used: ${[...new Set(names.map((n) => n.word))].join(', ')}.`) : null,
    ),
  );
  // The figures of speech the writer already makes, named, each with the author's examples a click away.
  const figs = a.figures ?? [];
  el.append(
    h(
      'section',
      { class: 'aa-card aa-figures' },
      h('h3', {}, 'Figures of speech', h('span', { class: 'aa-count' }, String(figs.length))),
      figs.length
        ? h('p', { class: 'aa-muted aa-small' }, `Rhetorical constructions in your draft, recognized by their form and underlined in violet. Click one for ${author.short}’s own.`)
        : h('p', { class: 'aa-muted aa-small' }, `None yet. ${author.short}’s favourites: litotes (“not unwilling”), antithesis (“not X, but Y”), the ironic generalization, the tricolon. Search one in Explore.`),
      ...figs.map((f) =>
        h(
          'button',
          { class: 'aa-figure', onclick: () => o.onFigure(f), title: f.gloss },
          h('strong', {}, f.name),
          h('span', { class: 'aa-figure-text' }, `“${f.text.length > 90 ? f.text.slice(0, 87) + '…' : f.text}”`),
        ),
      ),
    ),
  );
  const items = a.advice;
  el.append(h('h3', { class: 'aa-section' }, 'Advice', h('span', { class: 'aa-count' }, String(items.length))));
  if (!items.length) el.append(h('p', { class: 'aa-muted' }, 'Nothing to say yet: write on.'));
  for (const ad of items) {
    el.append(
      h(
        'article',
        { class: `aa-card aa-advice aa-sev-${ad.severity}` },
        h('header', {}, h('span', { class: 'aa-sev' }, SEV[ad.severity] ?? ad.severity), h('strong', {}, ad.title)),
        h('p', {}, ad.message),
        h('p', { class: 'aa-why' }, ad.why),
        ad.replacements?.length && ad.kind === 'sentence' ? h('p', { class: 'aa-proposal' }, ad.replacements[0]!.text) : null,
        ...ad.examples.slice(0, 2).map((c) => quoteEl(c, o.onCite)),
        h(
          'div',
          { class: 'aa-row' },
          ad.kind !== 'document' && ad.kind !== 'paragraph' ? h('button', { class: 'aa-btn aa-ghost', onclick: () => o.onShow(ad) }, 'Show') : null,
          ad.replacements?.length ? h('button', { class: 'aa-btn', onclick: () => o.onApply(ad) }, 'Suggest it') : null,
        ),
      ),
    );
  }
  return el;
}

export function renderStyle(author: AuthorRef, a: Analysis | null): HTMLElement {
  const el = h('div', { class: 'aa-style' });
  el.append(
    h('p', { class: 'aa-muted' }, `How your writing compares with ${author.name}’s, measure by measure. Each is a habit you can practise: the bar is yours, the mark is hers.`),
  );
  if (!a) return el;
  for (const m of a.report.measures) {
    const max = Math.max(m.yours, m.author) * 1.25 || 1;
    el.append(
      h(
        'section',
        { class: 'aa-card aa-measure' },
        h('header', {}, h('strong', {}, m.label), h('span', { class: 'aa-muted' }, `yours ${m.yours}${m.unit === '%' ? '%' : ''} · ${author.short} ${m.author}${m.unit === '%' ? '%' : ''}`)),
        h(
          'div',
          { class: 'aa-bar', role: 'img', 'aria-label': `yours ${m.yours}, ${author.short}’s ${m.author}` },
          h('span', { class: 'aa-bar-yours', style: { width: `${Math.min(100, (m.yours / max) * 100)}%` } }),
          h('span', { class: 'aa-bar-mark', style: { left: `${Math.min(100, (m.author / max) * 100)}%` }, title: `${author.short}: ${m.author}` }),
        ),
        h('p', { class: 'aa-small' }, m.explain),
      ),
    );
  }
  if (a.report.overused.length)
    el.append(
      h('section', { class: 'aa-card' }, h('h3', {}, 'Words you lean on'), h('table', { class: 'aa-table' }, h('tr', {}, h('th', {}, 'word'), h('th', {}, 'yours /1,000'), h('th', {}, `${author.short} /1,000`)), ...a.report.overused.map((o) => h('tr', {}, h('td', {}, o.word), h('td', {}, String(o.yours)), h('td', {}, String(o.author)))))),
    );
  if (a.report.underused.length)
    el.append(
      h(
        'section',
        { class: 'aa-card' },
        h('h3', {}, `Words ${author.short} uses more`),
        ...a.report.underused.map((u) => h('div', {}, h('p', {}, h('strong', {}, u.word), ` — ${u.author} per 1,000 of ${author.pronouns.possessivePronoun}, ${u.yours} of yours`), u.example ? quoteEl(u.example) : null)),
      ),
    );
  if (a.report.chapters.length > 1)
    el.append(h('section', { class: 'aa-card' }, h('h3', {}, 'Chapters'), h('table', { class: 'aa-table' }, ...a.report.chapters.map((c) => h('tr', {}, h('td', {}, c.title || '(before the first heading)'), h('td', {}, `${c.words.toLocaleString()} words`))))));
  return el;
}
