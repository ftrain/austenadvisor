// The HTTP plumbing every route module shares: one table of routes, a JSON body reader and a JSON reply.

import type { IncomingMessage, ServerResponse } from 'node:http';

export type Handler = (req: IncomingMessage, res: ServerResponse, params: string[], url: URL) => Promise<void> | void;

export interface Route {
  method: string;
  path: string;
  re: RegExp;
  handler: Handler;
}

/** Every route, in the order the modules in routes/index.ts registered them. */
export const routes: Route[] = [];

/** Registers a handler. A ":name" in the path matches one segment and is passed to the handler in `params`. */
export function route(method: string, path: string, handler: Handler): void {
  routes.push({ method, path, re: new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), handler });
}

/** The route for this method and path, with its decoded params, or null. */
export function match(method: string, pathname: string): { handler: Handler; params: string[] } | null {
  for (const r of routes) {
    const m = r.method === method ? r.re.exec(pathname) : null;
    if (m) return { handler: r.handler, params: m.slice(1).map(decodeURIComponent) };
  }
  return null;
}

export async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

export function send(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
