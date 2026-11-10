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
    if (!m) continue;
    try {
      return { handler: r.handler, params: m.slice(1).map(decodeURIComponent) };
    } catch {
      // A param that does not decode names nothing here.
      return null;
    }
  }
  return null;
}

/** An error the server answers with its own status and message, not a 500. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The most a request body may hold, in bytes: room for the longest text (24,000 characters) with its notes. */
export const MAX_BODY = 256 * 1024;

export async function body(req: IncomingMessage, limit = MAX_BODY): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, `That request is too large; the most is ${Math.round(limit / 1024)} KB.`);
    chunks.push(c as Buffer);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    throw new HttpError(400, 'The request is not valid JSON.');
  }
}

export function send(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
