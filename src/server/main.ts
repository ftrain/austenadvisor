// The Advisor server: the documents (SQLite), live editing over a WebSocket, the engine's answers over HTTP, and
// the page (Vite in development, dist/ when built).
//
//   npm run dev            # http://localhost:4180, the page rebuilt as it changes
//   npm start              # the built page from dist/

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Op } from 'tinylittleoffice/doc';
import { ROOT, authorDbPath } from '../db.ts';
import { analyze, type Advice } from '../engine/analyze.ts';
import { austenize } from '../engine/austenize.ts';
import { blocksOfText, blocksOfTlo, tloOfBlocks } from '../engine/doc.ts';
import { AuthorModel } from '../engine/model.ts';
import { concordance, styleSummary, wordProfile } from '../engine/tools.ts';
import { pronounsOf, readAuthor } from '../corpus/sources.ts';
import { answerThread, applyAdvice, austenizeBlocks, rewriteBlocks, type AdvisorDeps } from './advisor.ts';
import { aiAvailable, MODEL } from './rewrite.ts';
import { ADVISOR, Room, type Replacement } from './room.ts';
import { newId, Store } from './store.ts';

const PORT = Number(process.env.PORT ?? 4180);
const DEV = process.argv.includes('--dev');
const store = new Store();
const rooms = new Map<string, Room>();

function authors() {
  return readdirSync(join(ROOT, 'authors'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const a = readAuthor(ROOT, f.replace(/\.json$/, ''));
      return { id: a.id, name: a.name, advisor: a.advisor, short: a.short, years: a.years, pronouns: pronounsOf(a), works: a.works.map((w) => w.title), built: existsSync(authorDbPath(a.id)) };
    });
}

const model = (id: string) => AuthorModel.load(id);

function roomOf(id: string): Room | null {
  let r = rooms.get(id);
  if (!r) {
    if (!store.getDoc(id)) return null;
    r = new Room(store, id);
    rooms.set(id, r);
  }
  return r;
}

const deps: AdvisorDeps = {
  model,
  commit(room, ops: Op[], author = ADVISOR) {
    const id = newId();
    const res = room.receive({ id, author, base: room.seq, ops });
    if (!res.ok) return null;
    room.broadcast({ type: 'ops', id, author, ops: res.ops, seq: res.seq });
    if (room.takeNewVersion()) room.broadcast({ type: 'versions', versions: room.versions });
    return room.versions.at(-1)!.hash;
  },
  refresh(room) {
    const s = room.state();
    room.broadcast({ type: 'state', comments: s.comments, reviews: s.reviews, versions: s.versions, people: s.people });
  },
  status(room, text) {
    room.broadcast({ type: 'status', text });
  },
};

// ---------------------------------------------------------------------------------------------------------------
// HTTP

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: string[], url: URL) => Promise<void> | void;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, path: string, h: Handler) => routes.push([method, new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), h]);

route('GET', '/api/health', (_q, res) => send(res, 200, { ok: true }));
route('GET', '/api/authors', (_q, res) => send(res, 200, authors()));
route('GET', '/api/ai', (_q, res) => send(res, 200, { available: aiAvailable(), model: MODEL }));
route('GET', '/api/samples', (_q, res) => {
  const dir = join(ROOT, 'samples');
  send(res, 200, readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    return { id: f.replace(/\.txt$/, ''), title: /^#\s*(.*)$/m.exec(text)?.[1] ?? f, text };
  }));
});

route('GET', '/api/docs', (_q, res) => send(res, 200, store.listDocs()));
route('POST', '/api/docs', async (req, res) => {
  const b = await body(req);
  const author = String(b.author ?? 'austen');
  const title = String(b.title ?? 'Untitled').slice(0, 200);
  let text: string;
  if (typeof b.tlo === 'string') text = b.tlo;
  else {
    const blocks = blocksOfText(String(b.text ?? ''));
    if (!blocks.some((x) => x.kind === 'title')) blocks.unshift({ kind: 'title', text: title });
    if (blocks.length === 1) blocks.push({ kind: 'paragraph', text: '' });
    text = tloOfBlocks(blocks, title);
  }
  const doc = store.createDoc(title, author, text, String(b.by ?? 'writer'));
  send(res, 201, { id: doc.id });
});
route('GET', '/api/docs/:id', (_q, res, [id]) => {
  const r = roomOf(id!);
  return r ? send(res, 200, r.state()) : send(res, 404, { error: 'no such document' });
});

// The engine, stateless.
route('POST', '/api/analyze', async (req, res) => {
  const b = await body(req);
  const m = model(String(b.author ?? 'austen'));
  const blocks = typeof b.tlo === 'string' ? blocksOfTlo(b.tlo) : blocksOfText(String(b.text ?? ''));
  send(res, 200, analyze(m, blocks));
});
route('POST', '/api/austenize', async (req, res) => {
  const b = await body(req);
  const m = model(String(b.author ?? 'austen'));
  const r = austenize(m, typeof b.tlo === 'string' ? blocksOfTlo(b.tlo) : blocksOfText(String(b.text ?? '')));
  send(res, 200, { ...r, analysisAfter: undefined });
});
route('GET', '/api/word', (_q, res, _p, url) => {
  const m = model(url.searchParams.get('author') ?? 'austen');
  send(res, 200, wordProfile(m, url.searchParams.get('word') ?? '', { context: url.searchParams.get('context') ?? undefined, examples: 8 }));
});
route('GET', '/api/concordance', (_q, res, _p, url) => {
  const m = model(url.searchParams.get('author') ?? 'austen');
  send(res, 200, concordance(m, url.searchParams.get('q') ?? '', Math.min(100, Number(url.searchParams.get('limit') ?? 30))));
});
route('POST', '/api/similar', async (req, res) => {
  const b = await body(req);
  const m = model(String(b.author ?? 'austen'));
  send(res, 200, m.similarSentences(String(b.text ?? ''), Math.min(20, Number(b.limit ?? 6)), { minWords: b.minWords }));
});
route('GET', '/api/style', (_q, res, _p, url) => {
  const m = model(url.searchParams.get('author') ?? 'austen');
  send(res, 200, { summary: styleSummary(m), profile: m.profile });
});
route('GET', '/api/context', (_q, res, _p, url) => {
  const m = model(url.searchParams.get('author') ?? 'austen');
  const id = Number(url.searchParams.get('sentence'));
  send(res, 200, { cite: m.cite(id), paragraph: m.paragraphOf(id) });
});

// Advisor in a document.
route('POST', '/api/docs/:id/apply', async (req, res, [id]) => {
  const r = roomOf(id!);
  if (!r) return send(res, 404, { error: 'no such document' });
  const b = (await body(req)) as { advice: Advice; replacements: Replacement[] };
  const out = applyAdvice(deps, r, b.advice, b.replacements);
  send(res, out.ok ? 200 : 409, out);
});
route('POST', '/api/docs/:id/austenize', async (req, res, [id]) => {
  const r = roomOf(id!);
  if (!r) return send(res, 404, { error: 'no such document' });
  const b = await body(req);
  const out = austenizeBlocks(deps, r, Number(b.from), Number(b.to ?? b.from));
  send(res, out.ok ? 200 : 409, out);
});
route('POST', '/api/docs/:id/rewrite', async (req, res, [id]) => {
  const r = roomOf(id!);
  if (!r) return send(res, 404, { error: 'no such document' });
  if (!aiAvailable()) return send(res, 503, { ok: false, error: 'Rewrite with AI needs ANTHROPIC_API_KEY set where the server runs.' });
  const b = await body(req);
  const out = await rewriteBlocks(deps, r, Number(b.from), Number(b.to ?? b.from), String(b.instructions ?? ''));
  send(res, out.ok ? 200 : 409, { ok: out.ok, error: out.error, result: out.result && { ...out.result, toolCalls: out.result.toolCalls.length } });
});
route('POST', '/api/docs/:id/comments', async (req, res, [id]) => {
  const r = roomOf(id!);
  if (!r) return send(res, 404, { error: 'no such document' });
  const b = await body(req);
  const c = {
    id: newId(),
    by: String(b.by),
    text: String(b.text ?? ''),
    quote: b.quote ?? undefined,
    block: b.block ?? undefined,
    offset: b.offset ?? undefined,
    parent_id: b.parent_id ?? null,
    thread_id: b.thread_id ?? undefined,
    to_assistant: !!b.ask,
    created_at: new Date().toISOString(),
  };
  const thread = c.thread_id ?? (c.parent_id ? (store.comments(r.id).find((x: any) => x.id === c.parent_id) as any)?.thread_id ?? c.parent_id : c.id);
  (c as any).thread_id = thread;
  store.putComment(r.id, c);
  deps.refresh(r);
  send(res, 201, c);
  if (c.to_assistant) {
    const first = store.comments(r.id).find((x: any) => x.id === thread) as any;
    void answerThread(deps, r, {
      thread_id: thread,
      parent_id: c.id,
      quote: first?.quote ?? c.quote ?? null,
      block: first?.block ?? c.block ?? null,
      text: c.text,
    }).catch((e) => console.error('advisor', e));
  }
});
route('POST', '/api/docs/:id/comments/:cid/:action', async (req, res, [id, cid, action]) => {
  const r = roomOf(id!);
  if (!r) return send(res, 404, { error: 'no such document' });
  const b = await body(req);
  const c = store.comments(r.id).find((x: any) => x.id === cid) as any;
  if (!c) return send(res, 404, { error: 'no such comment' });
  if (action === 'resolve') {
    for (const x of store.comments(r.id) as any[]) if ((x.thread_id ?? x.id) === (c.thread_id ?? c.id)) store.putComment(r.id, { ...x, resolved_at: b.resolved ? new Date().toISOString() : null });
  } else if (action === 'delete') store.putComment(r.id, { ...c, deleted_at: new Date().toISOString() });
  deps.refresh(r);
  send(res, 200, { ok: true });
});
route('POST', '/api/docs/:id/review', async (req, res, [id]) => {
  const r = roomOf(id!);
  if (!r) return send(res, 404, { error: 'no such document' });
  const b = await body(req);
  const by = String(b.by);
  const out = r.review(b.ids as string[], b.verdict, by);
  if (out.error) return send(res, 409, out);
  if (out.ops?.length) deps.commit(r, out.ops, by);
  deps.refresh(r);
  send(res, 200, { ok: true });
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

async function main() {
  let vite: import('vite').ViteDevServer | null = null;
  if (DEV) {
    const { createServer: createVite } = await import('vite');
    vite = await createVite({ configFile: join(ROOT, 'vite.config.ts'), server: { middlewareMode: true, hmr: { port: PORT + 1 } }, appType: 'spa' });
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      for (const [method, re, h] of routes) {
        const m = re.exec(url.pathname);
        if (m && method === req.method) {
          try {
            await h(req, res, m.slice(1).map(decodeURIComponent), url);
          } catch (e) {
            console.error(e);
            if (!res.headersSent) send(res, 500, { error: String((e as Error).message ?? e) });
          }
          return;
        }
      }
      return send(res, 404, { error: 'no such route' });
    }
    if (vite) return vite.middlewares(req, res, () => send(res, 404, { error: 'not found' }));
    const dist = join(ROOT, 'dist');
    let file = join(dist, url.pathname);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    if (!existsSync(file)) return send(res, 404, { error: 'run npm run build first' });
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });

  // Live editing.
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', 'http://x');
    const room = roomOf(url.searchParams.get('doc') ?? '');
    if (!room) return ws.close(4404, 'no such document');
    const person = { id: (url.searchParams.get('id') ?? newId()).slice(0, 40), name: (url.searchParams.get('name') ?? 'Writer').slice(0, 60) };
    room.clients.set(ws, person);
    store.seePerson(room.id, person.id, person.name);
    ws.send(JSON.stringify({ type: 'hello', state: room.state(), you: person, ai: aiAvailable() }));
    room.broadcast({ type: 'presence', online: [...room.clients.values()] });
    ws.on('message', (data) => {
      let msg: any;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === 'edit') {
        const res = room.receive({ id: String(msg.id), author: person.id, base: Number(msg.base), ops: msg.ops as Op[] });
        if (!res.ok) {
          ws.send(JSON.stringify({ type: 'refused', id: msg.id, reason: res.reason, state: room.state() }));
          return;
        }
        room.broadcast({ type: 'ops', id: msg.id, author: person.id, ops: res.ops, seq: res.seq });
        if (room.takeNewVersion()) room.broadcast({ type: 'versions', versions: room.versions });
      } else if (msg.type === 'cursor') {
        room.broadcast({ type: 'cursor', who: person.id, name: person.name, at: msg.at }, ws);
      }
    });
    ws.on('close', () => {
      room.clients.delete(ws);
      room.broadcast({ type: 'presence', online: [...room.clients.values()] });
    });
  });

  // Each built author's model, read before the first writer arrives.
  for (const a of authors().filter((x) => x.built)) {
    const t = performance.now();
    const m = model(a.id);
    m.similarSentences('a warm start', 1);
    console.log(`${a.advisor}: ${m.totalWords.toLocaleString()} words of ${a.name}, ready in ${Math.round(performance.now() - t)}ms`);
  }
  server.listen(PORT, () => console.log(`Advisor at http://localhost:${PORT}${aiAvailable() ? '' : ' (Rewrite with AI off: no ANTHROPIC_API_KEY)'}`));
}

void main();
