// The Advisor server without its port: the API routes, and the page (Vite in development, dist/ when built).

import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { ROOT } from '../db.ts';
import { HttpError, match, send } from './http.ts';
import './routes/index.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

/** Pages the site no longer has. They answer 404 instead of the page. */
const GONE = /^\/d(\/|$)/;

export async function createApp(opts: { dev?: boolean; hmrPort?: number } = {}): Promise<Server> {
  let vite: import('vite').ViteDevServer | null = null;
  if (opts.dev) {
    const { createServer: createVite } = await import('vite');
    vite = await createVite({ configFile: join(ROOT, 'vite.config.ts'), server: { middlewareMode: true, host: true, hmr: { port: opts.hmrPort } }, appType: 'spa' });
  }
  return createServer(async (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      // A Host header or path that makes no URL.
      return send(res, 400, { error: 'bad request' });
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        const found = match(req.method ?? 'GET', url.pathname);
        if (!found) return send(res, 404, { error: 'no such route' });
        await found.handler(req, res, found.params, url);
      } catch (e) {
        if (e instanceof HttpError) {
          if (!res.headersSent) send(res, e.status, { error: e.message });
          else res.end();
          return;
        }
        console.error(e);
        if (!res.headersSent) send(res, 500, { error: String((e as Error).message ?? e) });
        else res.end();
      }
      return;
    }
    if (GONE.test(url.pathname)) return send(res, 404, { error: 'not found' });
    if (vite) return vite.middlewares(req, res, () => send(res, 404, { error: 'not found' }));
    const dist = join(ROOT, 'dist');
    let file = join(dist, url.pathname);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    if (!existsSync(file)) return send(res, 404, { error: 'run npm run build first' });
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
}
