// The cache, the samples made ahead of time and the budget, with a fake writer: no test reaches a model.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { authorDbPath, ROOT } from '../src/db.ts';

// Keyless, small parts (one paragraph each), and samples made ahead of time in a folder of the test's own. Set before
// the server's modules are read, since they read these once.
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY', 'ADVISOR_DAILY_PER_IP', 'ADVISOR_DAILY_TOKENS', 'ADVISOR_FULL_WORDS', 'ADVISOR_CACHE']) delete process.env[k];
process.env.ADVISOR_PART_WORDS = '40';
const pre = mkdtempSync(join(tmpdir(), 'precomputed-'));
process.env.ADVISOR_PRECOMPUTED = pre;

const { RewriteCache, findPrecomputed, partKeys, textHash, tokenDistance, tokensOf } = await import('../src/server/cache.ts');
const { collectRewrite, streamRewrite } = await import('../src/server/page.ts');
const { submitted, useWriter } = await import('../src/server/rewrite.ts');
type WriterClient = import('../src/server/rewrite.ts').WriterClient;
type WriterAnswer = import('../src/server/rewrite.ts').WriterAnswer;
const { AuthorModel } = await import('../src/engine/model.ts');
type AuthorModel = import('../src/engine/model.ts').AuthorModel;

const built = (() => {
  try {
    return readFileSync(authorDbPath('austen')).length > 0;
  } catch {
    return false;
  }
})();

const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/**
 * A writer that renders every sentence of the brief, each with a balanced clause and an understatement added, so the
 * engine has moves to note. It keeps count of its calls, and may wait before answering.
 */
function echoWriter(wait = 0): WriterClient & { calls: number } {
  const w = {
    calls: 0,
    async call(_system: string, user: { content?: unknown }[]): Promise<WriterAnswer> {
      w.calls++;
      if (wait) await new Promise((ok) => setTimeout(ok, wait));
      const prompt = String(user[0]!.content ?? '');
      const paragraphs = [...prompt.matchAll(/<paragraph n="\d+">([\s\S]*?)<\/paragraph>/g)].map((p) => ({
        role: 'claim',
        why: 'It states the point.',
        sentences: [...p[1]!.matchAll(/<sentence n="(\d+)"[^>]*>\n([^\n]*)/g)].map((s) => ({ text: unesc(s[2]!).replace(/[.!?]?$/, '; and it was not a little strange.'), from: [Number(s[1])] })),
      }));
      return submitted({ paragraphs, sense: [], liberties: [], explanation: 'Each sentence is turned on a semicolon.' });
    },
  };
  return w;
}
const refusing: WriterClient = {
  call() {
    throw new Error('No call should be made.');
  },
};

/** A response that keeps what the page is sent. */
function fakeResponse() {
  const out: string[] = [];
  const res = {
    status: 0,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    write(s: string) {
      out.push(s);
      return true;
    },
    end(s?: string) {
      if (s) out.push(s);
      return res;
    },
    on() {
      return res;
    },
  };
  return { res: res as unknown as ServerResponse, lines: () => out.join('').trim().split('\n').map((l) => JSON.parse(l) as { type: string; [k: string]: unknown }) };
}

const three = [
  'My sister borrowed my car without asking me first. She brought it back late on Sunday night with an empty tank and a dent in the door.',
  'I was angry, so I went to find her in the kitchen. She said she had only gone to the shop and back, which I did not believe.',
  'In the end we agreed that she would pay for the petrol. We did not speak about the dent, and I still think about it.',
];

describe('keys and distances', () => {
  it('keys a part by its own text, and its neighbours only in the exact key', () => {
    const base = { voice: 'austen', tier: 'full', fingerprint: 'f', promptVersion: 'v', instructions: '', text: 'A.', before: 'B.', after: 'C.' };
    const a = partKeys(base);
    expect(a.key).toMatch(/^[0-9a-f]{64}$/);
    const moved = partKeys({ ...base, after: 'D.' });
    expect(moved.core).toBe(a.core);
    expect(moved.key).not.toBe(a.key);
    for (const change of [{ voice: 'twain' }, { tier: 'fast' }, { fingerprint: 'g' }, { promptVersion: 'w' }, { instructions: 'shorter' }, { text: 'A!' }]) expect(partKeys({ ...base, ...change }).core).not.toBe(a.core);
    expect(textHash('a\r\nb  \n')).toBe(textHash('a\nb'));
  });

  it('counts token edits, and stops once past the limit', () => {
    const a = tokensOf('The cat sat on the mat.');
    expect(tokenDistance(a, tokensOf('The cat sat on the mat.'), 3)).toBe(0);
    expect(tokenDistance(a, tokensOf('The dog sat on the mat.'), 3)).toBe(1);
    expect(tokenDistance(a, tokensOf('A dog lay under a rug!'), 2)).toBe(3);
    expect(tokenDistance(a, tokensOf('Cat.'), 2)).toBe(3);
  });

  it('keeps rows, finds them by their own text when a neighbour changed, and purges the old', () => {
    const c = new RewriteCache(':memory:');
    const now = Date.now();
    c.put('k1', 'c1', 'austen', '{"a":1}', 'm', now - 200 * 86_400_000);
    c.put('k2', 'c2', 'austen', '{"a":2}', 'm', now);
    expect(c.get('k2', 'c2')).toEqual({ json: '{"a":2}', exact: true });
    expect(c.get('other', 'c2')).toEqual({ json: '{"a":2}', exact: false });
    c.purge(now, 180);
    expect(c.get('k1', 'c1')).toBeNull();
    c.close();
  });

  it('retires the old NDJSON cache into the table once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'legacy-'));
    try {
      const legacy = join(dir, 'rewrites');
      mkdirSync(legacy);
      writeFileSync(join(legacy, 'abc.ndjson'), '{"type":"plan"}\n{"type":"part","model":"m"}\n{"type":"done"}\n');
      const c = new RewriteCache(':memory:', { legacyDir: legacy });
      expect(c.get('ndjson:abc', 'ndjson:abc')?.json).toContain('"part"');
      expect(readFileSync(join(`${legacy}.migrated`, 'abc.ndjson'), 'utf8')).toContain('plan');
      c.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!built)('the rewrite, part by part', { timeout: 120_000 }, () => {
  const austen = built ? AuthorModel.load('austen') : (null as unknown as AuthorModel);
  afterEach(() => useWriter(null));

  it('writes only the edited paragraph again, and its rows carry the engine’s notes and no boilerplate', async () => {
    const cache = new RewriteCache(':memory:');
    const writer = echoWriter();
    const first = await collectRewrite(austen, three.join('\n\n'), { cache, writer, precomputed: null });
    expect(writer.calls).toBe(3);
    const parts = first.filter((l) => l.type === 'part');
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => !p.error && p.cached === false)).toBe(true);

    // Rows: the engine's notes, at most two a paragraph, and no "why" or "model" on a sentence of the rewrite.
    const rows = parts.flatMap((p) => p.rows as { hers: Record<string, unknown>[]; notes: { kind: string; technique: string; quote: unknown }[] }[]);
    for (const r of rows) {
      expect(r.notes.length).toBeLessThanOrEqual(2);
      for (const h of r.hers) {
        expect(h).not.toHaveProperty('why');
        expect(h).not.toHaveProperty('model');
      }
    }
    const moves = rows.flatMap((r) => r.notes).filter((n) => n.kind === 'move');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((n) => n.quote)).toBe(true);
    // No move twice on the page.
    expect(new Set(moves.map((n) => n.technique)).size).toBe(moves.length);

    const edited = [three[0], 'I was cross, so I went to look for her in the kitchen. She said she had only driven to the shop and back, which I doubted.', three[2]].join('\n\n');
    const second = await collectRewrite(austen, edited, { cache, writer, precomputed: null });
    expect(writer.calls).toBe(4);
    const byPart = second.filter((l) => l.type === 'part').sort((a, b) => Number(a.part) - Number(b.part));
    expect(byPart.map((l) => l.cached)).toEqual([true, false, true]);
    expect(JSON.stringify(second)).toContain('I was cross');

    // The same text again: nothing written.
    await collectRewrite(austen, edited, { cache, writer, precomputed: null });
    expect(writer.calls).toBe(4);
  });

  it('makes one call for two identical requests at once', async () => {
    const cache = new RewriteCache(':memory:');
    const writer = echoWriter(300);
    const text = 'The bus was late again this morning. Everybody at the stop was annoyed about it.';
    const [a, b] = await Promise.all([collectRewrite(austen, text, { cache, writer, precomputed: null }), collectRewrite(austen, text, { cache, writer, precomputed: null })]);
    expect(writer.calls).toBe(1);
    for (const lines of [a, b]) {
      const part = lines.find((l) => l.type === 'part')!;
      expect(part.error).toBeUndefined();
      expect(JSON.stringify(part.rows)).toContain('not a little strange');
    }
  });

  it('serves a sample, or a text within 3% of one, from the rewrites made ahead of time', async () => {
    const text = readFileSync(join(ROOT, 'samples', 'breakup-text.txt'), 'utf8');
    const lines = [{ type: 'plan', parts: 1, headings: [], paragraphs: [] }, { type: 'part', part: 0, rows: [], explanation: 'Made ahead.' }, { type: 'done', elapsed: 0 }];
    mkdirSync(join(pre, 'breakup-text'), { recursive: true });
    writeFileSync(join(pre, 'breakup-text', 'austen.json'), JSON.stringify({ version: 'v', sample: 'breakup-text', voice: 'austen', text, lines }));

    const words = text.split(' ');
    const k = words.findIndex((w) => /^[a-z]{4,}$/.test(w));
    const near = [...words.slice(0, k), 'zebra', ...words.slice(k + 1)].join(' ');
    expect(findPrecomputed('austen', near)?.exact).toBe(false);
    expect(findPrecomputed('austen', text)?.exact).toBe(true);
    expect(findPrecomputed('twain', text)).toBeNull();
    expect(findPrecomputed('austen', 'Something else entirely, which no sample says.')).toBeNull();

    const out = fakeResponse();
    await streamRewrite(out.res, austen, near, '', false, { cache: new RewriteCache(':memory:'), writer: refusing });
    const got = out.lines();
    expect(got[0]).toMatchObject({ type: 'progress', kept: 'sample', sample: 'breakup-text', calls: 0 });
    expect(got.slice(1)).toEqual(lines);
  });
});

describe.skipIf(!built)('the budget, over HTTP', { timeout: 180_000 }, () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    const { createApp } = await import('../src/server/app.ts');
    server = await createApp();
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));
  afterEach(() => useWriter(null));

  const post = (data: unknown, ip: string) => fetch(`${base}/api/rewrite`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(data) });

  it('rests with no writer, naming no setting', async () => {
    const r = await post({ author: 'austen', text: 'A short text of my own.' }, '198.51.100.1');
    expect(r.status).toBe(503);
    const body = (await r.json()) as { budget: string; error: string };
    expect(body.budget).toBe('resting');
    expect(body.error).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });

  it('gives one address ten full rewrites a day, then rests without a call', async () => {
    const writer = echoWriter();
    useWriter(writer);
    const ip = '203.0.113.7';
    for (let i = 0; i < 10; i++) {
      const r = await post({ author: 'austen', text: `On day ${i + 1} the garden gate was left open by somebody.` }, ip);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('"type":"done"');
    }
    expect(writer.calls).toBe(10);
    const r = await post({ author: 'austen', text: 'On the eleventh day the gate was shut.' }, ip);
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ budget: 'resting' });
    expect(writer.calls).toBe(10);

    // A text kept from before costs nothing, and the same address may have it.
    const again = await post({ author: 'austen', text: 'On day 1 the garden gate was left open by somebody.' }, ip);
    expect(again.status).toBe(200);
    expect(writer.calls).toBe(10);

    // Another address has its own ten.
    expect((await post({ author: 'austen', text: 'The gate creaked.' }, '203.0.113.8')).status).toBe(200);
    expect(writer.calls).toBe(11);
  });

  it('lets a reader have one uncached rewrite in flight', async () => {
    const writer = echoWriter(400);
    useWriter(writer);
    const ip = '192.0.2.44';
    const first = post({ author: 'austen', text: 'The kettle boiled over while I was on the phone.', client: 'reader-one-1234' }, ip);
    await new Promise((ok) => setTimeout(ok, 100));
    const second = await post({ author: 'austen', text: 'The toast burned while I was on the phone.', client: 'reader-one-1234' }, ip);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ budget: 'busy' });
    expect((await first).status).toBe(200);
    expect(writer.calls).toBe(1);
  });

  it('says which voices a text is ready in, by its hash', async () => {
    useWriter(echoWriter());
    const text = 'The library closes at six on weekdays.';
    const none = (await (await fetch(`${base}/api/ready?hash=${textHash(text)}`)).json()) as { voices: string[] };
    expect(none.voices).toEqual([]);
    await (await post({ author: 'austen', text }, '198.51.100.9')).text();
    const after = (await (await fetch(`${base}/api/ready?hash=${textHash(text)}`)).json()) as { voices: string[] };
    expect(after.voices).toEqual(['austen']);
    const sample = readFileSync(join(ROOT, 'samples', 'breakup-text.txt'), 'utf8');
    mkdirSync(join(pre, 'breakup-text'), { recursive: true });
    writeFileSync(join(pre, 'breakup-text', 'twain.json'), JSON.stringify({ version: 'v', sample: 'breakup-text', voice: 'twain', text: sample, lines: [] }));
    const ready = (await (await fetch(`${base}/api/ready?hash=${textHash(sample)}`)).json()) as { voices: string[] };
    expect(ready.voices).toContain('twain');
    expect((await fetch(`${base}/api/ready?hash=nope`)).status).toBe(400);
  });
});

afterAll(() => rmSync(pre, { recursive: true, force: true }));
