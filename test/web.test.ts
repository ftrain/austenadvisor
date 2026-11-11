// @vitest-environment jsdom
// The page in a browser-like document, with the server's answers taken from fixtures: no server, no model.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { numberFacts, plainText } from '../src/web/result.ts';
import { rewritePage } from '../src/web/rewrite-page.ts';

const FX = join(import.meta.dirname, 'fixtures');
const boot = JSON.parse(readFileSync(join(FX, 'page-boot.json'), 'utf8'));
const reading = JSON.parse(readFileSync(join(FX, 'page-read.json'), 'utf8'));
const ndjson = readFileSync(join(FX, 'page-rewrite.ndjson'), 'utf8');
const essayRead = JSON.parse(readFileSync(join(FX, 'page-read-essay.json'), 'utf8'));
const essayLines = readFileSync(join(FX, 'page-rewrite-essay.ndjson'), 'utf8');
const plainRead = JSON.parse(readFileSync(join(FX, 'page-read-plain.json'), 'utf8'));
const essay = (essayRead.paragraphs as string[]).join('\n\n');
const debate = boot.samples.find((s: { id: string }) => s.id === 'debate-rebuttal').text as string;

type Handler = (path: string, body: unknown) => Response | undefined;
let calls: { path: string; body: unknown }[] = [];
let override: Handler | null = null;
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } });

function answer(path: string, body: unknown): Response {
  const o = override?.(path, body);
  if (o) return o;
  if (path === '/api/boot') return json(boot);
  if (path === '/api/read') return json(reading);
  if (path.startsWith('/api/ready')) return json({ hash: '', voices: [] });
  if (path.startsWith('/api/guess')) return json({ rounds: [], names: {} });
  if (path === '/api/rewrite') return new Response(ndjson, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
  if (path === '/api/practice/drills') return json({ drills: [] });
  return json({ error: 'not found' }, 404);
}

beforeEach(() => {
  calls = [];
  override = null;
  document.body.innerHTML = '<div id="app"></div>';
  window.scrollTo = () => {};
  try {
    localStorage.clear();
  } catch {
    /* a test may have made it throw */
  }
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    return answer(path, body);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const app = () => document.getElementById('app')!;
const rewrites = () => calls.filter((c) => c.path === '/api/rewrite').length;

async function onResult(text = debate) {
  localStorage.setItem('advisor.page', JSON.stringify({ voice: 'austen', text }));
  const page = await rewritePage(app());
  app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
  await vi.waitFor(() => expect(app().querySelectorAll('.pg-hers .pg-her').length).toBeGreaterThan(0));
  return page;
}

describe('the page', () => {
  it('composes with a voice select, a form select, one checkbox and one primary button', async () => {
    await rewritePage(app());
    const compose = app().querySelector('.pg-compose')!;
    expect([...compose.querySelectorAll('select')].map((x) => x.id)).toEqual(['pg-voice', 'pg-form']);
    expect(compose.querySelectorAll('input')).toHaveLength(1);
    expect(compose.querySelector('.pg-check')!.textContent).toBe('Add facts from Wikipedia');
    expect(compose.querySelectorAll('[data-primary]')).toHaveLength(1);
    // The form select: Auto first, then the forms, each with its definition as its title.
    const forms = [...compose.querySelectorAll<HTMLOptionElement>('#pg-form option')];
    expect(forms.map((x) => x.value)).toEqual(['auto', 'essay', 'argument', 'anecdote', 'story', 'letter', 'speech', 'review']);
    expect(forms[1]!.title).toBe(boot.forms[0].definition);
    // A style stands last, under its own heading, and its title stands alone with no colon after it.
    const styles = [...compose.querySelectorAll('optgroup')].at(-1)!;
    expect(styles.label).toBe('Styles');
    expect(styles.querySelector('option')!.textContent).toBe('Plain: formal and declarative, with everything extra removed');
    // The select holds the families as option groups.
    const groups = [...compose.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(expect.arrayContaining(['Storytellers', 'Speakers']));
  });

  it('suggests the sample’s best voices when a kind is tapped', async () => {
    await rewritePage(app());
    app().querySelector<HTMLButtonElement>('[data-kind="argument"]')!.click();
    expect(app().querySelector<HTMLTextAreaElement>('.pg-input')!.value).toBe(debate);
    const first = app().querySelector('.pg-compose optgroup')!;
    expect(first.getAttribute('label')).toBe('Suggested for an argument');
  });

  it('asks before rewriting in a voice that is not ready, and fetches nothing until yes', async () => {
    await onResult();
    expect(rewrites()).toBe(1);
    const sel = app().querySelector<HTMLSelectElement>('.pg-result select')!;
    sel.value = 'lincoln';
    sel.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 30));
    expect(rewrites()).toBe(1);
    const ask = app().querySelector<HTMLElement>('.pg-ask')!;
    expect(ask.hidden).toBe(false);
    expect(ask.textContent).toContain('Rewrite as Abraham Lincoln?');
    expect(sel.value).toBe('austen');
    ask.querySelector<HTMLButtonElement>('.pg-btn-main')!.click();
    await vi.waitFor(() => expect(rewrites()).toBe(2));
    expect(calls.filter((c) => c.path === '/api/rewrite').at(-1)!.body).toMatchObject({ author: 'lincoln' });
  });

  it('flips at once to a ready voice', async () => {
    await onResult();
    const sel = app().querySelector<HTMLSelectElement>('.pg-result select')!;
    expect([...sel.options].find((o) => o.value === 'twain')!.textContent).toContain('· ready');
    sel.value = 'twain';
    sel.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(rewrites()).toBe(2));
    expect(app().querySelector<HTMLElement>('.pg-ask')!.hidden).toBe(true);
  });

  it('keeps Your moves when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const page = await rewritePage(app());
    page.moves.add({ voice: 'austen', move: 'litotes', name: 'Litotes', sentence: 'It was not a small thing.' });
    expect(app().querySelector('.pg-moves-toggle')!.textContent).toBe('Your moves (1)');
    expect(page.moves.entries()[0]!.sentence).toBe('It was not a small thing.');
  });

  it('defines each role word on the SHAPE line and on a row’s label', async () => {
    const role = (id: string, term: string) => ({ id: `role-${id}`, term, kind: 'role', definition: `What ${id} means.`, unless: '^', names: [id] });
    const withRoles = { ...boot, glossary: [...boot.glossary, role('objection', 'Objection'), role('scene', 'Scene')] };
    override = (path) => (path === '/api/boot' ? json(withRoles) : undefined);
    await onResult();
    const shape = [...app().querySelectorAll('.pg-shape .pg-term')].map((b) => b.textContent);
    expect(shape.length).toBeGreaterThan(0);
    expect(app().querySelector('.pg-role .pg-term')).not.toBeNull();
  });

  it('opens no dialog anywhere', async () => {
    await onResult();
    app().querySelector<HTMLButtonElement>('.pg-never')?.click();
    app().querySelector<HTMLButtonElement>('.pg-term')?.click();
    expect(document.querySelectorAll('[role="dialog"], dialog')).toHaveLength(0);
  });

  it('never names an environment variable, even when the server does', async () => {
    override = (path) => (path === '/api/rewrite' ? json({ budget: 'resting', error: 'Set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY.' }, 503) : undefined);
    localStorage.setItem('advisor.page', JSON.stringify({ voice: 'austen', text: 'My own text. It is short.' }));
    await rewritePage(app());
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    await vi.waitFor(() => expect(app().querySelector<HTMLElement>('.pg-result .pg-resting')!.hidden).toBe(false));
    expect(document.body.textContent).not.toMatch(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/);
    // The engine view stays: the sketch of the voice's own sentences.
    expect(app().querySelector('.pg-sketch')).not.toBeNull();
  });

  it('says so when the rewrite does not come back, and offers to try again', async () => {
    override = (path) => (path === '/api/rewrite' ? json({ error: 'upstream' }, 500) : undefined);
    localStorage.setItem('advisor.page', JSON.stringify({ voice: 'austen', text: debate }));
    await rewritePage(app());
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    await vi.waitFor(() => expect(app().querySelector('.pg-progress')!.textContent).toContain('The rewrite failed.'));
  });

  it('says when parts were not rewritten, does not call the voice ready, and offers to try again', async () => {
    const lines = ndjson.trim().split('\n').map((l) => JSON.parse(l));
    const part = lines.find((l) => l.type === 'part');
    const failed = { type: 'part', part: 0, error: 'upstream', rows: part.rows.map((r: { index: number }, i: number) => ({ kind: 'paragraph', index: i + 1, part: 0, yours: [{ n: -1, text: 'x', never: [] }], hers: null, notes: [], error: 'upstream' })) };
    const body = lines.map((l) => JSON.stringify(l.type === 'part' ? failed : l)).join('\n');
    override = (path) => (path === '/api/rewrite' ? new Response(body) : undefined);
    // Not a sample, so no voice is ready for it ahead of time.
    localStorage.setItem('advisor.page', JSON.stringify({ voice: 'austen', text: `${debate} One more.` }));
    await rewritePage(app());
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    await vi.waitFor(() => expect(app().querySelector('.pg-progress')!.textContent).toContain('Some parts were not rewritten.'));
    const sel = app().querySelector<HTMLSelectElement>('.pg-result select')!;
    expect([...sel.options].find((o) => o.value === 'austen')!.textContent).not.toContain('· ready');
    [...app().querySelectorAll<HTMLButtonElement>('.pg-progress button')].find((b) => b.textContent === 'Try again')!.click();
    await vi.waitFor(() => expect(rewrites()).toBe(2));
  });

  it('says a text is too long before asking for anything', async () => {
    localStorage.setItem('advisor.page', JSON.stringify({ voice: 'austen', text: 'Word. '.repeat(5000) }));
    await rewritePage(app());
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(rewrites()).toBe(0);
    expect(app().querySelector<HTMLElement>('.pg-notice')!.textContent).toContain('the most is 24,000');
    expect(app().dataset.state).not.toBe('result');
  });

  it('keeps the guess card in COMPOSE after Edit while a rewrite still streams, and keeps an open Try it across a redraw', async () => {
    const lines = ndjson.trim().split('\n');
    let push: (s: string) => void = () => {};
    let end: () => void = () => {};
    override = (path) =>
      path === '/api/rewrite'
        ? new Response(
            new ReadableStream({
              start(c) {
                push = (x) => c.enqueue(new TextEncoder().encode(x + '\n'));
                end = () => c.close();
              },
            }),
          )
        : undefined;
    localStorage.setItem('advisor.page', JSON.stringify({ voice: 'austen', text: debate }));
    await rewritePage(app());
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    await vi.waitFor(() => expect(rewrites()).toBe(1));
    push(lines[0]!);
    await new Promise((r) => setTimeout(r, 20));
    [...app().querySelectorAll<HTMLButtonElement>('.pg-tools button')].find((b) => b.textContent === '← Edit')!.click();
    // A line that redraws the run (the plan again) arrives while COMPOSE is on view.
    push(lines[0]!);
    await new Promise((r) => setTimeout(r, 20));
    expect(app().querySelector('.pg-compose .pg-guess')).not.toBeNull();

    // Back to the result: the part arrives, a Try it is opened and typed in, then the stream ends and redraws.
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    push(lines.find((l) => l.includes('"type":"part"'))!);
    await vi.waitFor(() => expect(app().querySelectorAll('.pg-hers .pg-her').length).toBeGreaterThan(0));
    [...app().querySelectorAll<HTMLButtonElement>('.pg-note-actions button')].find((b) => b.textContent === 'Try it')!.click();
    const box = app().querySelector<HTMLTextAreaElement>('.pg-tryit textarea')!;
    box.value = 'It was not a little strange.';
    push(lines.at(-1)!);
    end();
    await vi.waitFor(() => expect(app().querySelector('.pg-progress')!.hasAttribute('hidden')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(box.isConnected).toBe(true);
    expect(box.value).toBe('It was not a little strange.');
  });

  it('shows at most two WHY notes a row, and no move twice', async () => {
    const lines = ndjson.trim().split('\n').map((l) => JSON.parse(l));
    const part = lines.find((l) => l.type === 'part');
    const first = part.rows[0];
    const extra = { kind: 'liberty', technique: 'Added by Austen', before: '', after: 'not a little strange', text: 'An understatement.', quote: null, verified: true };
    first.notes = [...first.notes, extra, extra];
    // The second row repeats the first row's move: it must not show again.
    part.rows[1].notes = [first.notes[0], ...part.rows[1].notes];
    override = (path) => (path === '/api/rewrite' ? new Response(lines.map((l) => JSON.stringify(l)).join('\n')) : undefined);
    await onResult();
    const rows = [...app().querySelectorAll('.pg-row')];
    for (const r of rows) expect(r.querySelectorAll('.pg-why .pg-note').length).toBeLessThanOrEqual(2);
    const heads = [...app().querySelectorAll('.pg-why .pg-note:not(.pg-note-liberty) .pg-note-head')].map((x) => x.textContent);
    expect(new Set(heads).size).toBe(heads.length);
  });

  it('marks at most five words the voice never wrote, and says so in a line', async () => {
    await onResult();
    const words = app().querySelectorAll('.pg-never');
    expect(words.length).toBeGreaterThan(0);
    expect(words.length).toBeLessThanOrEqual(5);
    (words[0] as HTMLButtonElement).click();
    const line = app().querySelector<HTMLElement>('.pg-open-line:not([hidden])')!;
    expect(line.textContent).toMatch(/^Austen never wrote/);
  });

  it('opens Try it in the row and keeps a pass in Your moves', async () => {
    override = (path) =>
      path === '/api/practice'
        ? json({ made: true, verdict: 'Yes, that’s litotes.', hint: '', also: [], never: [], length: {}, shape: null, move: { id: 'litotes', name: 'Understatement and litotes', made: true, does: '', hint: '', example: null } })
        : undefined;
    await onResult();
    const btn = [...app().querySelectorAll<HTMLButtonElement>('.pg-note-actions button')].find((b) => b.textContent === 'Try it')!;
    btn.click();
    const row = btn.closest('.pg-row')!;
    const box = row.querySelector<HTMLTextAreaElement>('.pg-tryit textarea')!;
    expect(document.activeElement).toBe(box);
    box.value = 'It was not a little strange.';
    row.querySelector<HTMLButtonElement>('.pg-tryit .pg-btn-main')!.click();
    await vi.waitFor(() => expect(row.querySelector('.pg-verdict')?.textContent).toContain('Yes'));
    expect(app().querySelector('.pg-moves-toggle')!.textContent).toBe('Your moves (1)');
  });

  it('names a word the voice never wrote once, with the voice’s word for it', async () => {
    override = (path) =>
      path === '/api/practice'
        ? json({ made: false, verdict: 'Not yet. Austen never used “opponent”.', hint: '', also: [], never: [{ word: 'opponent', theirs: ['opposition'] }, { word: 'okay', theirs: [] }], length: {}, shape: null, move: { id: 'litotes', name: 'Understatement and litotes', made: false, does: '', hint: '', example: null } })
        : undefined;
    await onResult();
    const btn = [...app().querySelectorAll<HTMLButtonElement>('.pg-note-actions button')].find((b) => b.textContent === 'Try it')!;
    btn.click();
    const row = btn.closest('.pg-row')!;
    row.querySelector<HTMLButtonElement>('.pg-tryit .pg-btn-main')!.click();
    await vi.waitFor(() => expect(row.querySelector('.pg-verdict')?.textContent).toContain('Not yet'));
    expect(row.querySelector('.pg-try-also')!.textContent).toBe('For “opponent”, try “opposition”. Austen never wrote “okay”.');
  });
});

describe('the form, the facts and what was added', () => {
  async function essayResult() {
    override = (path) => (path === '/api/read' ? json(essayRead) : path === '/api/rewrite' ? new Response(essayLines, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }) : undefined);
    localStorage.setItem('advisor.page', JSON.stringify({ voice: 'austen', text: essay, form: 'essay', facts: true }));
    const page = await rewritePage(app());
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    await vi.waitFor(() => expect(app().querySelectorAll('.pg-hers .pg-her').length).toBeGreaterThan(0));
    return page;
  }

  it('sends the form and the facts choice with the reading and the rewrite', async () => {
    await essayResult();
    expect(calls.find((c) => c.path === '/api/read')!.body).toMatchObject({ form: 'essay' });
    expect(calls.find((c) => c.path === '/api/rewrite')!.body).toMatchObject({ author: 'austen', form: 'essay', facts: true });
  });

  it('asks for the form of the kind and no facts until the student chooses otherwise', async () => {
    await onResult();
    expect(calls.find((c) => c.path === '/api/rewrite')!.body).toMatchObject({ form: 'auto', facts: false });
    expect(app().querySelector<HTMLElement>('.pg-legend')!.hidden).toBe(true);
    expect(app().querySelector<HTMLElement>('.pg-facts')!.hidden).toBe(true);
    expect(app().querySelectorAll('.pg-added, .pg-fn')).toHaveLength(0);
  });

  it('shows the form’s line between yours and the voice’s, with the form’s name defined', async () => {
    await essayResult();
    await vi.waitFor(() => expect(app().querySelector('.pg-shape-form')).not.toBeNull());
    const lines = [...app().querySelectorAll('.pg-shape .pg-line-body > p')].map((p) => p.textContent!);
    expect(lines[0]).toMatch(/^Yours: /);
    expect(lines[1]).toMatch(/^Essay/);
    expect([...app().querySelectorAll('.pg-shape-form .pg-term')].map((b) => b.textContent)).toEqual(['Essay', 'Claim', 'Reason', 'Evidence', 'Objection', 'Answer', 'Call']);
    expect(app().querySelector('.pg-shape-missing')!.textContent).toMatch(/^Not in yours: Call/);
    const name = app().querySelector<HTMLButtonElement>('.pg-shape-form .pg-who .pg-term')!;
    name.click();
    expect(app().querySelector('.pg-shape-form .pg-who .pg-def')!.textContent).toContain('short piece that states a claim');
  });

  it('highlights added text, says so in one legend line, and numbers the facts', async () => {
    await essayResult();
    const legend = app().querySelector<HTMLElement>('.pg-legend')!;
    expect(legend.hidden).toBe(false);
    expect(legend.textContent).toBe('Highlighted text was added. It is not in yours. A small number points to a fact under the rewrite.');
    const added = [...app().querySelectorAll('.pg-hers mark.pg-added')].map((x) => x.textContent);
    // A fact in a sentence of its own, two stretches of a fact worked into the writer's sentence, and the part written.
    expect(added).toEqual(['It was a protest of December 16, 1773, in which 342 chests of tea went into Boston harbour.', 'a silversmith', 'in April 1775', 'Let the reader judge the colonists, then, as people who had been refused a hearing.']);
    expect([...app().querySelectorAll('.pg-hers .pg-fn a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['1', '#pg-fact-1'], ['2', '#pg-fact-2']]);
    const facts = app().querySelector<HTMLElement>('.pg-facts')!;
    expect(facts.hidden).toBe(false);
    const items = [...facts.querySelectorAll('li')];
    expect(items.map((li) => li.id)).toEqual(['pg-fact-1', 'pg-fact-2']);
    expect(items[0]!.textContent).toBe('“The Boston Tea Party was a protest on December 16, 1773, in which colonists threw 342 chests of tea into Boston harbor.” Boston Tea Party, Wikipedia');
    expect(items[1]!.querySelector('a')!.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Paul_Revere');
  });

  it('says where a moved paragraph came from, and what a written part is for', async () => {
    await essayResult();
    const rows = [...app().querySelectorAll<HTMLElement>('.pg-row')];
    expect(rows[0]!.querySelector('.pg-yours .pg-from')!.textContent).toBe('your paragraph 3');
    expect(rows[0]!.querySelector('.pg-why .pg-note-structure .pg-note-text')!.textContent).toBe('Moved: this was your paragraph 3. An essay opens with its claim.');
    const filled = rows.at(-1)!;
    expect(filled.querySelector('.pg-yours .pg-filled')!.textContent).toBe('Not in your text. An essay closes by saying what the reader should now believe or do.');
    expect(filled.querySelectorAll('.pg-yours .pg-s, .pg-yours .pg-more')).toHaveLength(0);
    expect(filled.querySelector('.pg-why .pg-note-structure')).not.toBeNull();
  });

  it('never takes a fact’s words for HTML, and links only to Wikipedia', async () => {
    const lines = essayLines.trim().split('\n').map((l) => JSON.parse(l));
    for (const l of lines) for (const r of l.rows ?? []) for (const x of r.hers ?? []) for (const f of x.facts ?? []) (f.text = '<img src=x onerror=alert(1)> <b>bold</b>'), (f.url = 'javascript:alert(1)');
    const bad = lines.map((l) => JSON.stringify(l)).join('\n');
    override = (path) => (path === '/api/read' ? json(essayRead) : path === '/api/rewrite' ? new Response(bad, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }) : undefined);
    localStorage.setItem('advisor.page', JSON.stringify({ voice: 'austen', text: essay, form: 'essay', facts: true }));
    await rewritePage(app());
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    await vi.waitFor(() => expect(app().querySelectorAll('.pg-facts li').length).toBe(2));
    const facts = app().querySelector('.pg-facts')!;
    expect(facts.querySelectorAll('img, b, a')).toHaveLength(0);
    expect(facts.textContent).toContain('<b>bold</b>');
  });

  it('copies the rewrite with its footnotes as plain text', async () => {
    const rows = essayLines.trim().split('\n').map((l) => JSON.parse(l)).flatMap((l) => (l.type === 'part' ? l.rows : []));
    expect(numberFacts(rows).map((x) => [x.n, x.fact.title])).toEqual([[1, 'Boston Tea Party'], [2, 'Paul Revere']]);
    const text = plainText(rows);
    expect(text).toContain('went into Boston harbour. [1] Britain then punished Boston');
    expect(text).toContain('that the soldiers were coming. [2]');
    expect(text).toMatch(/\n\nNotes\n1\. “The Boston Tea Party was a protest[^\n]+” Boston Tea Party, Wikipedia, https:\/\/en\.wikipedia\.org\/wiki\/Boston_Tea_Party\n2\. “Paul Revere/);
    // With no facts the text is the paragraphs and nothing more.
    const none = ndjson.trim().split('\n').map((l) => JSON.parse(l)).flatMap((l) => (l.type === 'part' ? l.rows : []));
    expect(plainText(none)).not.toContain('Notes');
  });

  it('asks before a ready voice when a form or facts were chosen, since that rewrite is not the one kept', async () => {
    await essayResult();
    const sel = app().querySelector<HTMLSelectElement>('.pg-result select')!;
    expect([...sel.options].some((o) => o.textContent!.includes('· ready') && o.value !== 'austen')).toBe(false);
    sel.value = 'twain';
    sel.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 30));
    expect(rewrites()).toBe(1);
    expect(app().querySelector<HTMLElement>('.pg-ask')!.hidden).toBe(false);
  });

  it('for a style, marks the needless words where they stand and defines each kind in the opened line', async () => {
    const text = (plainRead.paragraphs as string[]).join('\n\n');
    override = (path) => (path === '/api/read' ? json(plainRead) : path === '/api/rewrite' ? json({ error: 'Rewrites are resting.', budget: 'resting' }, 503) : undefined);
    localStorage.setItem('advisor.page', JSON.stringify({ voice: 'plain', text }));
    await rewritePage(app());
    app().querySelector<HTMLButtonElement>('.pg-compose [data-primary]')!.click();
    await vi.waitFor(() => expect(app().querySelectorAll('.pg-needless').length).toBeGreaterThan(0));
    const marks = [...app().querySelectorAll<HTMLButtonElement>('.pg-needless')];
    expect(marks.map((b) => b.textContent)).toEqual(plainRead.never.map((w: { word: string }) => w.word));
    const really = marks.find((b) => b.textContent === 'really')!;
    really.click();
    const line = really.closest('.pg-yours')!.querySelector<HTMLElement>('.pg-open-line')!;
    expect(line.hidden).toBe(false);
    expect(line.textContent).toContain('“really” is an intensifier');
    expect(line.querySelector('.pg-term')!.textContent).toBe('intensifier');
    expect(app().textContent).not.toMatch(/never wrote/);
    // The column is headed by the style's short name: its title is a sentence.
    expect(app().querySelector('.pg-cols-head > :nth-child(2)')!.textContent).toBe('Plain style');
  });
});
