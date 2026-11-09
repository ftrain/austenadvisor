// The page: the documents, and a document open (/d/<id>).

import 'tinylittleoffice/editors.css';
import './styles.css';
import { setup } from 'tinylittleoffice/kit';
import { editorPage } from './editor-page.ts';
import { get, h, post, type AuthorInfo } from './api.ts';

const app = document.getElementById('app')!;

async function home() {
  await setup();
  app.className = 'aa-page aa-home-page';
  const [authors, docs, samples] = await Promise.all([
    get<AuthorInfo[]>('/api/authors'),
    get<{ id: string; title: string; author: string; updated_at: string }[]>('/api/docs'),
    get<{ id: string; title: string; text: string }[]>('/api/samples'),
  ]);
  const built = authors.filter((a) => a.built);
  const pick = h('select', { class: 'aa-input', 'aria-label': 'Advisor' }, ...authors.map((a) => h('option', { value: a.id, disabled: !a.built, selected: a.id === 'austen' }, `${a.advisor}${a.built ? '' : ' (not built)'}`))) as HTMLSelectElement;
  const titleIn = h('input', { class: 'aa-input', placeholder: 'Title', value: 'A new chapter' }) as HTMLInputElement;
  const create = async (title: string, text: string) => {
    const { id } = await post<{ id: string }>('/api/docs', { title, text, author: pick.value });
    location.href = `/d/${id}`;
  };
  const a0 = built[0] ?? authors[0];
  app.replaceChildren(
    h(
      'header',
      { class: 'aa-head' },
      h('a', { href: '/', class: 'aa-home' }, h('span', { class: 'aa-mark' }, 'A'), h('span', { class: 'aa-brand' }, 'Austen Advisor')),
    ),
    h(
      'main',
      { class: 'aa-landing' },
      h(
        'section',
        { class: 'aa-hero' },
        h('h1', {}, 'Write beside Jane Austen.'),
        h(
          'p',
          {},
          `A shared document where Advisor, a statistical model of ${a0 ? a0.works.length : 'all'} of ${a0?.name ?? 'the author'}’s works, reads as you write. Every word ${a0?.pronouns.subject ?? 'the author'} never used is underlined; hover it for the words ${a0?.pronouns.subject ?? 'they'} did use, each with a sentence and where to find it. Advisor measures your sentences against hers and suggests changes you accept or reject, and explains each one. It works by statistics: n-grams, WordNet, word vectors and stylometry. “Rewrite with AI” hands the passage to Claude together with the engine.`,
        ),
      ),
      h(
        'section',
        { class: 'aa-card aa-new' },
        h('h2', {}, 'Start a document'),
        h('div', { class: 'aa-row' }, titleIn, pick, h('button', { class: 'aa-btn aa-primary', onclick: () => void create(titleIn.value || 'Untitled', '') }, 'New document')),
        h('p', { class: 'aa-muted' }, `Or begin from an everyday piece and see how Advisor would bring it to ${a0?.pronouns.possessive ?? 'the author’s'} manner:`),
        h('div', { class: 'aa-samples' }, ...samples.map((s) => h('button', { class: 'aa-sample', onclick: () => void create(s.title, s.text) }, h('strong', {}, s.title), h('span', {}, s.text.replace(/^#.*\n/, '').trim().slice(0, 110) + '…')))),
      ),
      docs.length
        ? h('section', { class: 'aa-card' }, h('h2', {}, 'Documents'), h('ul', { class: 'aa-docs' }, ...docs.map((d) => h('li', {}, h('a', { href: `/d/${d.id}` }, d.title), h('span', { class: 'aa-muted' }, ` ${new Date(d.updated_at).toLocaleString()}`)))))
        : null,
      h('p', { class: 'aa-muted aa-small' }, `Advisors: ${authors.map((a) => `${a.advisor} (${a.works.length} works${a.built ? '' : ', not built: npm run build:model -- ' + a.id})`).join(' · ')}`),
    ),
  );
}

const m = /^\/d\/([\w-]+)/.exec(location.pathname);
if (m) void editorPage(app, m[1]!);
else void home();
