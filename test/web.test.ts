// @vitest-environment jsdom
// The page in a browser-like document, with the server's answers taken from fixtures: no server, no model.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rewritePage } from '../src/web/rewrite-page.ts';

const FX = join(import.meta.dirname, 'fixtures');
const boot = JSON.parse(readFileSync(join(FX, 'page-boot.json'), 'utf8'));
const reading = JSON.parse(readFileSync(join(FX, 'page-read.json'), 'utf8'));
const ndjson = readFileSync(join(FX, 'page-rewrite.ndjson'), 'utf8');
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
  it('composes with one select and one primary button', async () => {
    await rewritePage(app());
    const compose = app().querySelector('.pg-compose')!;
    expect(compose.querySelectorAll('select')).toHaveLength(1);
    expect(compose.querySelectorAll('[data-primary]')).toHaveLength(1);
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
});
