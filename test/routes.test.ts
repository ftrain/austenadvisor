import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Keyless: no route may reach a model.
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[k];

let server: Server;
let base = '';

beforeAll(async () => {
  const { createApp } = await import('../src/server/app.ts');
  server = await createApp();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

const post = (path: string, data: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

describe('the routes', () => {
  it('lists the samples in the index shape, each with its text', async () => {
    const r = await fetch(`${base}/api/samples`);
    expect(r.status).toBe(200);
    const samples = (await r.json()) as Record<string, unknown>[];
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      for (const k of ['id', 'file', 'title', 'kind', 'level', 'words', 'teaches', 'bestVoices']) expect(s, `${s.id}: ${k}`).toHaveProperty(k);
      expect(typeof s.text).toBe('string');
    }
  });

  it('lists the voices', async () => {
    const voices = (await (await fetch(`${base}/api/authors`)).json()) as { id: string; built: boolean }[];
    expect(voices.some((v) => v.id === 'austen')).toBe(true);
  });

  it('analyzes a text against a built voice, and refuses one that is not built', async () => {
    const r = await post('/api/analyze', { author: 'austen', text: 'I grabbed my keys. It was super crowded.' });
    expect(r.status).toBe(200);
    const a = (await r.json()) as { words: unknown[]; report: { score: number } };
    expect(Array.isArray(a.words)).toBe(true);
    expect(typeof a.report.score).toBe('number');
    expect((await post('/api/analyze', { author: '../nobody', text: 'Hello.' })).status).toBe(404);
  });

  it('declines a full rewrite without a key', async () => {
    const r = await post('/api/rewrite', { author: 'austen', text: 'A short text.' });
    expect(r.status).toBe(503);
  });

  it('answers a malformed path, a bad Host header and an oversized body without falling over', async () => {
    expect((await fetch(`${base}/api/glossary/%E0%A4%A`)).status).toBe(404);
    const { request } = await import('node:http');
    const status = await new Promise<number>((done, fail) => {
      const q = request(`${base}/api/authors`, { headers: { host: 'a b' } }, (r) => (r.resume(), done(r.statusCode ?? 0)));
      q.on('error', fail);
      q.end();
    });
    expect(status).toBe(400);
    expect((await post('/api/analyze', { author: 'austen', text: 'x'.repeat(300 * 1024) })).status).toBe(413);
    expect((await post('/api/analyze', { author: 'austen', text: 'Word. '.repeat(5000) })).status).toBe(413);
    expect((await post('/api/rewrite', { author: 'austen', text: 'A short text.', instructions: 'x'.repeat(600) })).status).toBe(413);
    const bad = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
    expect(bad.status).toBe(400);
    // Still serving.
    expect((await fetch(`${base}/api/authors`)).status).toBe(200);
  });

  it('reads drills from notes of any shape without failing', async () => {
    const notes = [{ id: 5, before: null, after: ['x'] }, ...Array.from({ length: 500 }, () => ({ kind: 'move', id: 'litotes', before: 'It was big.', after: 'It was not small.' }))];
    const r = await post('/api/practice/drills', { author: 'austen', text: 'It was big. It was big.', notes });
    expect(r.status).toBe(200);
  });

  it('no longer serves the old editor or its routes', async () => {
    expect((await fetch(`${base}/d/x`)).status).toBe(404);
    expect((await fetch(`${base}/api/docs`)).status).toBe(404);
    expect((await post('/api/docs', { title: 'x' })).status).toBe(404);
    for (const p of ['/api/concordance?q=x', '/api/figures', '/api/figure?term=litotes', '/api/style']) expect((await fetch(base + p)).status, p).toBe(404);
    expect((await post('/api/austenize', { text: 'x' })).status).toBe(404);
    expect((await post('/api/similar', { text: 'x' })).status).toBe(404);
  });
});
