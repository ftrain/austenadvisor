// The prewarm, against servers of the test's own: one that answers with canned lines, and one that runs the real
// rewrite with a fake writer. No test reaches a model.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorDbPath, ROOT } from '../src/db.ts';

for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY', 'ADVISOR_CACHE']) delete process.env[k];
const scratch = mkdtempSync(join(tmpdir(), 'prewarm-'));
process.env.ADVISOR_PRECOMPUTED = join(scratch, 'unused');

const { builtVoices, check, judged, pairsOf, prewarm, problemOf, samplesOf, stateOf } = await import('../scripts/prewarm.ts');
const { chooseTiers } = await import('../scripts/tiers.ts');
const { PROMPT_VERSION, submitted } = await import('../src/server/rewrite.ts');
const { collectRewrite } = await import('../src/server/page.ts');
const { RewriteCache } = await import('../src/server/cache.ts');
const { AuthorModel } = await import('../src/engine/model.ts');
type WriterClient = import('../src/server/rewrite.ts').WriterClient;
type Line = { type: string; [k: string]: unknown };

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Starts a server on a free port; returns its base URL. */
async function serve(handle: (body: Record<string, unknown>) => Promise<{ status: number; body: string }>): Promise<{ base: string; server: Server }> {
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const out = await handle(JSON.parse(raw || '{}'));
    res.writeHead(out.status, { 'content-type': out.status === 200 ? 'application/x-ndjson' : 'application/json' });
    res.end(out.body);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
const nd = (lines: Line[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
const canned = (voice: string, version = PROMPT_VERSION, extra: Record<string, unknown> = {}): Line[] => [
  { type: 'plan', parts: 1, headings: [], paragraphs: [] },
  { type: 'progress', log: ['writing'] },
  { type: 'part', part: 0, rows: [{ kind: 'paragraph', index: 0, hers: [{ text: `In ${voice}'s manner.`, from: [1], moves: [] }], notes: [] }], explanation: 'Made ahead.', model: 'm', tier: 'full', promptVersion: version, ...extra },
  { type: 'done', elapsed: 1 },
];

describe('the prewarm, with a fake server', () => {
  const samples = [
    { id: 'one', file: 'one-text.txt', text: 'The first sample.' },
    { id: 'two', file: 'two.txt', text: 'The second sample.' },
    { id: 'three', file: 'three.txt', text: 'The third sample.' },
  ];
  const voices = ['austen', 'twain'];
  const dir = join(scratch, 'fake');
  const pairs = pairsOf(samples, voices, dir);
  const asked: { voice: string; text: string; fresh: boolean; client: string }[] = [];
  let failOnce = new Set<string>();
  let fresh503 = false;
  let srv: { base: string; server: Server };

  beforeAll(async () => {
    srv = await serve(async (b) => {
      const voice = String(b.author);
      const text = String(b.text);
      asked.push({ voice, text, fresh: b.fresh === true, client: String(b.client) });
      if (fresh503) return { status: 503, body: JSON.stringify({ budget: 'resting', error: 'No writer is available.' }) };
      const k = `${text}/${voice}`;
      if (failOnce.has(k)) {
        failOnce.delete(k);
        return { status: 200, body: nd([{ type: 'plan', parts: 1 }, { type: 'part', part: 0, error: 'Not rendered: sentence 1', rows: [] }, { type: 'done' }]) };
      }
      // The server's own stale file for this sample: the prewarm must ask again, fresh.
      if (!b.fresh && voice === 'twain' && text === samples[0]!.text) return { status: 200, body: nd([{ type: 'progress', kept: 'sample', sample: 'one', calls: 0 }, ...canned(voice, 'old').filter((l) => l.type !== 'progress')]) };
      return { status: 200, body: nd(canned(voice)) };
    });
  });
  afterAll(() => srv.server.close());

  it('writes every pair once, stamped with the prompt version, and skips them on the next run', async () => {
    failOnce = new Set([`${samples[1]!.text}/austen`]);
    const r = await prewarm({ base: srv.base, dir, version: PROMPT_VERSION, pairs, atOnce: 3, judgeShare: 1, judgeFile: join(scratch, 'judge.json') });
    expect(r.failed).toEqual([]);
    expect(r.written.length).toBe(6);
    expect(check(pairs, PROMPT_VERSION)).toEqual({ missing: [], stale: [], broken: [] });
    const f = JSON.parse(readFileSync(join(dir, 'one', 'twain.json'), 'utf8'));
    expect(f).toMatchObject({ version: PROMPT_VERSION, sample: 'one', voice: 'twain', text: samples[0]!.text, model: 'm', tier: 'full' });
    expect(f.lines.map((l: Line) => l.type)).toEqual(['plan', 'part', 'done']);
    // The server's own made-ahead answer was refused and asked for fresh; the hard failure was tried once more.
    expect(asked.filter((a) => a.voice === 'twain' && a.text === samples[0]!.text).map((a) => a.fresh)).toEqual([false, true]);
    expect(asked.filter((a) => a.voice === 'austen' && a.text === samples[1]!.text).length).toBe(2);
    expect(new Set(asked.map((a) => a.client)).size).toBeGreaterThan(1);
    // Every pair saved for the judge, in eval-voices' form.
    const runs = JSON.parse(readFileSync(join(scratch, 'judge.json'), 'utf8'));
    expect(runs.length).toBe(6);
    expect(runs.find((x: { case: string; voice: string }) => x.case === 'one' && x.voice === 'austen')).toMatchObject({ rewrite: "In austen's manner.", lessons: ['Made ahead.'] });

    asked.length = 0;
    const again = await prewarm({ base: srv.base, dir, version: PROMPT_VERSION, pairs });
    expect(again).toMatchObject({ written: [], skipped: 6, failed: [] });
    expect(asked.length).toBe(0);
  });

  it('with --stale, writes again only the files of an old version', async () => {
    const f = join(dir, 'two', 'twain.json');
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), version: 'old' }));
    rmSync(join(dir, 'three', 'austen.json'));
    expect(check(pairs, PROMPT_VERSION)).toEqual({ missing: ['three/austen'], stale: ['two/twain'], broken: [] });
    asked.length = 0;
    const r = await prewarm({ base: srv.base, dir, version: PROMPT_VERSION, pairs, staleOnly: true });
    expect(r.written).toEqual(['two/twain']);
    expect(stateOf(pairs.find((p) => p.sample === 'three' && p.voice === 'austen')!, PROMPT_VERSION)).toBe('missing');
    const rest = await prewarm({ base: srv.base, dir, version: PROMPT_VERSION, pairs });
    expect(rest.written).toEqual(['three/austen']);
  });

  it('gives up a pair that fails twice, and stops the run when no writer is available', async () => {
    const lost = pairsOf([{ id: 'four', file: 'four.txt', text: 'The fourth.' }], ['austen'], dir);
    failOnce = new Set(['The fourth./austen']);
    const srv2 = await serve(async () => ({ status: 200, body: nd([{ type: 'plan' }, { type: 'part', part: 0, error: 'Not rendered: sentence 1', rows: [] }, { type: 'done' }]) }));
    try {
      const r = await prewarm({ base: srv2.base, dir, version: PROMPT_VERSION, pairs: lost });
      expect(r.failed).toEqual([{ pair: 'four/austen', error: 'Part 1: Not rendered: sentence 1' }]);
    } finally {
      srv2.server.close();
    }
    fresh503 = true;
    const r = await prewarm({ base: srv.base, dir, version: PROMPT_VERSION, pairs: [...lost, ...pairsOf([{ id: 'five', file: 'five.txt', text: 'The fifth.' }], ['austen'], dir)], atOnce: 1 });
    expect(r.stopped).toContain('No writer is available.');
    expect(r.written).toEqual([]);
    fresh503 = false;
  });

  it('refuses a rewrite from an old prompt, a fast tier, a resting part or a missing paragraph', () => {
    expect(problemOf(canned('a', 'old'), PROMPT_VERSION, false)?.message).toContain('Restart the server');
    expect(problemOf(canned('a', PROMPT_VERSION, { tier: 'fast' }), PROMPT_VERSION, false)?.message).toContain('fast tier');
    expect(problemOf(canned('a', PROMPT_VERSION, { tier: 'fast' }), PROMPT_VERSION, true)).toBeNull();
    expect(problemOf(canned('a', PROMPT_VERSION, { resting: 'budget' }), PROMPT_VERSION, false)?.hard).toBe(false);
    expect(problemOf(canned('a', PROMPT_VERSION, { rows: [{ kind: 'paragraph', index: 0, hers: null }] }), PROMPT_VERSION, false)?.hard).toBe(true);
    expect(problemOf([{ type: 'plan' }], PROMPT_VERSION, false)?.hard).toBe(true);
  });

  it('chooses the same tenth of the pairs for the judge each time', () => {
    const all = pairsOf(samplesOf(), builtVoices(), dir);
    const share = all.filter((p) => judged(p, 0.1)).length / all.length;
    expect(share).toBeGreaterThan(0.04);
    expect(share).toBeLessThan(0.18);
    expect(all.filter((p) => judged(p, 0.1))).toEqual(all.filter((p) => judged(p, 0.1)));
  });
});

describe('writer tiers', () => {
  const runs = (voice: string, score: number, n = 3) => Array.from({ length: n }, () => ({ voice, judge: { fidelity: score, voice: score, sense: score, natural: score, notes: score, teaching: score, structure: score } }));
  it('gives a voice the fast model only when its judged mean is within 0.3 of the best', () => {
    const fast = [...runs('austen', 3.8), ...runs('twain', 3.5), ...runs('kjv', 4, 2), ...runs('obama', 4.5)];
    const full = [...runs('austen', 4), ...runs('twain', 4), ...runs('kjv', 4), ...runs('obama', 4)];
    expect(chooseTiers(fast, full)).toEqual({ austen: 'fast', kjv: 'full', obama: 'fast', twain: 'full' });
  });
});

const built = (() => {
  try {
    return readFileSync(authorDbPath('austen')).length > 0;
  } catch {
    return false;
  }
})();

describe.skipIf(!built)('made ahead through the real rewrite, then served with no call', { timeout: 240_000 }, () => {
  const austen = built ? AuthorModel.load('austen') : (null as unknown as ReturnType<typeof AuthorModel.load>);
  const dir = join(scratch, 'real');
  const samples = samplesOf(ROOT).filter((s) => ['breakup-text', 'camp-letter'].includes(s.id));
  const pairs = pairsOf(samples, ['austen'], dir);

  // Renders every sentence of the brief with a clause added.
  const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const writer: WriterClient & { calls: number } = {
    calls: 0,
    async call(_s, user) {
      writer.calls++;
      const prompt = String((user[0] as { content?: unknown }).content ?? '');
      const paragraphs = [...prompt.matchAll(/<paragraph n="\d+">([\s\S]*?)<\/paragraph>/g)].map((p) => ({
        role: 'claim',
        why: 'It states the point.',
        sentences: [...p[1]!.matchAll(/<sentence n="(\d+)"[^>]*>\n([^\n]*)/g)].map((s) => ({ text: unesc(s[2]!).replace(/[.!?]?$/, '; and it was not a little strange.'), from: [Number(s[1])] })),
      }));
      return submitted({ paragraphs, sense: [], liberties: [], explanation: 'Each sentence is turned on a semicolon.' });
    },
  };
  const throwing: WriterClient = {
    call() {
      throw new Error('No call should be made.');
    },
  };

  it('writes each sample through the server, and serves it, or a near copy, with zero writer calls', async () => {
    const srv = await serve(async (b) => {
      const lines = await collectRewrite(austen, String(b.text), { writer, cache: new RewriteCache(':memory:'), precomputed: null, fresh: b.fresh === true });
      return lines[0]?.type === 'refused' ? { status: Number(lines[0].status), body: JSON.stringify(lines[0]) } : { status: 200, body: nd(lines) };
    });
    try {
      const r = await prewarm({ base: srv.base, dir, version: PROMPT_VERSION, pairs });
      expect(r.failed).toEqual([]);
      expect(r.written.length).toBe(samples.length);
    } finally {
      srv.server.close();
    }
    expect(writer.calls).toBeGreaterThan(0);
    expect(check(pairs, PROMPT_VERSION)).toEqual({ missing: [], stale: [], broken: [] });

    for (const s of samples) {
      const got = await collectRewrite(austen, s.text, { writer: throwing, cache: null, precomputed: dir });
      expect(got[0]).toMatchObject({ type: 'progress', kept: 'sample', sample: s.id, exact: true, calls: 0 });
      expect(got.some((l) => l.type === 'part' && Array.isArray(l.rows) && (l.rows as { hers?: unknown }[]).some((row) => Array.isArray(row.hers)))).toBe(true);
    }
    // One word changed: still within 3%, still no call.
    const words = samples[0]!.text.split(' ');
    const k = words.findIndex((w) => /^[a-z]{4,}$/.test(w));
    const near = [...words.slice(0, k), 'zebra', ...words.slice(k + 1)].join(' ');
    const got = await collectRewrite(austen, near, { writer: throwing, cache: null, precomputed: dir });
    expect(got[0]).toMatchObject({ kept: 'sample', sample: samples[0]!.id, exact: false });
  });
});
