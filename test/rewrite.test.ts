// The writer's loop with a fake writer: the tool inputs of real rewrites (test/fixtures/rewrites.json, taken from
// data/cache/rewrites) are replayed, so the loop, the gate's one redraft and the page's cache run with no model.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { authorDbPath, DATA, ROOT } from '../src/db.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { streamRewrite } from '../src/server/page.ts';
import { rewriteWithAI, submitted, useWriter, type Submission, type WriterAnswer, type WriterClient } from '../src/server/rewrite.ts';

interface Fixture {
  id: string;
  voice: string;
  text: string;
  submission: Submission;
}
const fixtures = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'rewrites.json'), 'utf8')) as Fixture[];
const fixture = (id: string) => structuredClone(fixtures.find((f) => f.id === id)!);
const built = existsSync(authorDbPath('austen')) && existsSync(authorDbPath('shakespeare'));

/** A writer that gives its answers in order, and keeps what each call was sent. */
function fakeWriter(answers: WriterAnswer[]): WriterClient & { calls: { system: string; user: unknown[]; tools: string[] }[] } {
  const calls: { system: string; user: unknown[]; tools: string[] }[] = [];
  return {
    calls,
    async call(system, user, tools) {
      calls.push({ system, user: structuredClone(user), tools: tools.map((t) => t.name) });
      const next = answers[calls.length - 1];
      if (!next) throw new Error(`The fake writer has no answer for call ${calls.length}.`);
      return next;
    },
  };
}
const noTool: WriterAnswer = { content: [{ type: 'text', text: 'Here is my rewrite.', citations: null }], stop_reason: 'end_turn' };
const lastUser = (call: { user: unknown[] }) => call.user.at(-1) as { role: string; content: unknown };

describe.skipIf(!built)('rewriteWithAI with a fake writer', () => {
  const austen = built ? AuthorModel.load('austen') : (null as unknown as AuthorModel);
  const shakespeare = built ? AuthorModel.load('shakespeare') : (null as unknown as AuthorModel);

  it('takes a clean part in one call', async () => {
    const f = fixture('sister-car');
    const writer = fakeWriter([submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0]!.tools).toEqual(['submit_rewrite']);
    expect(writer.calls[0]!.system).toContain('Jane Austen');
    expect(writer.calls[0]!.user).toHaveLength(1);
    expect(r.rounds).toBe(1);
    expect(r.problems.filter((p) => /^Not rendered/.test(p))).toEqual([]);
    expect(r.text).toContain('My sister had taken my car without asking');
    expect(r.source.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(r.aligned.map((a) => a.from)).toEqual([[1, 2], [3]]);
    expect(r.aligned.every((a) => a.why.length > 0)).toBe(true);
    expect(r.toolCalls).toHaveLength(1);
  });

  it('lays out a rewrite of several paragraphs', async () => {
    const f = fixture('camp-letter');
    const writer = fakeWriter([submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(shakespeare, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(1);
    expect(r.paragraphs).toHaveLength(6);
    expect(r.paragraphs.map((p) => p.source)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.source).toHaveLength(14);
  });

  it('sends a hard gate failure back once, and takes the redraft', async () => {
    const f = fixture('sister-car');
    const lost = structuredClone(f.submission);
    lost.paragraphs[0]!.sentences.pop();
    const writer = fakeWriter([submitted(lost as unknown as Record<string, unknown>, 'toolu_first'), submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(2);
    const back = lastUser(writer.calls[1]!);
    expect(back.role).toBe('user');
    expect(JSON.stringify(back.content)).toMatch(/toolu_first.*Not yet accepted.*Not rendered: sentence 3/);
    expect(r.rounds).toBe(2);
    expect(r.text).toContain('I then went home.');
    expect(r.problems.filter((p) => /^Not rendered/.test(p))).toEqual([]);
  });

  it('redrafts no more than once', async () => {
    const f = fixture('sister-car');
    const lost = structuredClone(f.submission);
    lost.paragraphs[0]!.sentences.pop();
    const writer = fakeWriter([submitted(lost as unknown as Record<string, unknown>), submitted(lost as unknown as Record<string, unknown>), submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(2);
    expect(r.rounds).toBe(2);
    expect(r.problems.some((p) => /^Not rendered: sentence 3/.test(p))).toBe(true);
  });

  it('asks once more when the answer has no tool call', async () => {
    const f = fixture('sister-car-short');
    const writer = fakeWriter([noTool, submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(2);
    expect(lastUser(writer.calls[1]!)).toEqual({ role: 'user', content: 'Call submit_rewrite with your rewrite.' });
    expect(r.rounds).toBe(1);
    expect(r.text).toContain('My sister took the carriage');
  });

  it('fails plainly when the writer never submits', async () => {
    const writer = fakeWriter(Array.from({ length: 18 }, () => noTool));
    await expect(rewriteWithAI(austen, fixture('sister-car').text, {}, () => {}, writer)).rejects.toThrow('The model gave no rewrite.');
    expect(writer.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reports a refusal', async () => {
    const writer = fakeWriter([{ content: [], stop_reason: 'refusal' }]);
    await expect(rewriteWithAI(austen, fixture('sister-car').text, {}, () => {}, writer)).rejects.toThrow(/declined/);
  });
});

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

describe.skipIf(!built)('streamRewrite and its cache', () => {
  const austen = built ? AuthorModel.load('austen') : (null as unknown as AuthorModel);
  const dir = join(DATA, 'cache', 'rewrites');
  const before = new Set(existsSync(dir) ? readdirSync(dir) : []);
  // Instructions of its own give this test a cache key no one else has.
  const instructions = `test ${process.pid} ${Date.now()}`;
  // The files this test wrote: new since it began, and of its own text. A server running beside it may write others.
  const ours = () => (existsSync(dir) ? readdirSync(dir) : []).filter((x) => !before.has(x) && readFileSync(join(dir, x), 'utf8').includes(fixture('sister-car').text));
  afterEach(() => {
    useWriter(null);
    for (const f of ours()) rmSync(join(dir, f));
  });

  it('calls the writer on a miss, keeps the result, and serves it again without a call', async () => {
    const f = fixture('sister-car');
    const writer = fakeWriter([submitted(f.submission as unknown as Record<string, unknown>), submitted(f.submission as unknown as Record<string, unknown>)]);
    useWriter(writer);

    const miss = fakeResponse();
    await streamRewrite(miss.res, austen, f.text, instructions);
    expect(writer.calls).toHaveLength(1);
    const first = miss.lines();
    expect(first.map((l) => l.type)).toContain('plan');
    const part = first.find((l) => l.type === 'part')!;
    expect(part.error).toBeUndefined();
    expect(JSON.stringify(part.rows)).toContain('My sister had taken my car without asking');
    expect(first.at(-1)!.type).toBe('done');
    expect(ours()).toHaveLength(1);

    const hit = fakeResponse();
    await streamRewrite(hit.res, austen, f.text, instructions);
    expect(writer.calls).toHaveLength(1);
    const second = hit.lines();
    expect(second[0]).toMatchObject({ type: 'progress', log: ['kept from before'] });
    expect(second.slice(1)).toEqual(first.filter((l) => l.type !== 'progress'));

    const fresh = fakeResponse();
    await streamRewrite(fresh.res, austen, f.text, instructions, true);
    expect(writer.calls).toHaveLength(2);
  });

  it('keeps nothing when a part fails', async () => {
    useWriter(fakeWriter([]));
    const out = fakeResponse();
    await streamRewrite(out.res, austen, fixture('sister-car').text, `${instructions} failing`);
    const part = out.lines().find((l) => l.type === 'part')!;
    expect(part.error).toMatch(/no answer/);
    expect(ours()).toEqual([]);
  });
});
