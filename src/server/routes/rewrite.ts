// The page's rewrite: a text in the voice's manner, streamed as NDJSON as each part is written. Also which voices a
// text is ready in, so the page can offer them without spending a call.

import type { IncomingMessage } from 'node:http';
import { admit, askerHash, precomputedVoices, rewriteCache, type Asker } from '../cache.ts';
import { body, route, send } from '../http.ts';
import { MAX_CHARS, streamRewrite } from '../page.ts';
import { aiAvailable, PROMPT_VERSION, writerInjected } from '../rewrite.ts';
import { voiceOr404 } from './engine.ts';

/** The most a caller may add as instructions to the writer. The page sends none; the evaluation sends a line or two. */
const MAX_INSTRUCTIONS = 500;

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

/**
 * Who is asking. Behind the exe.dev proxy the reader's address is the last one in X-Forwarded-For, which the proxy
 * appends. A request from this machine with no proxy between is local (the evaluation scripts) and is not counted.
 * A page may send its own `client` id, so readers behind one school address each have a rewrite in flight.
 */
export function askerOf(req: IncomingMessage, client?: unknown): Asker {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const direct = req.socket.remoteAddress ?? '';
  const address = forwarded.at(-1) ?? direct;
  const who = askerHash(address);
  const own = typeof client === 'string' && /^[\w-]{8,64}$/.test(client) ? askerHash(`client:${client}`) : who;
  return { who, client: own, local: !forwarded.length && LOOPBACK.test(direct) };
}

route('POST', '/api/rewrite', async (req, res) => {
  const b = await body(req);
  const text = String(b.text ?? '');
  const m = voiceOr404(res, b.author);
  if (!m) return;
  if (!text.trim()) return send(res, 400, { error: 'There is nothing to rewrite yet.' });
  if (text.length > MAX_CHARS) return send(res, 413, { error: `That is ${text.length.toLocaleString()} characters; the most is ${MAX_CHARS.toLocaleString()}. Try a chapter at a time.` });
  const instructions = String(b.instructions ?? '');
  if (instructions.length > MAX_INSTRUCTIONS) return send(res, 413, { error: `The instructions run to ${instructions.length.toLocaleString()} characters; the most is ${MAX_INSTRUCTIONS}.` });
  const asker = askerOf(req, b.client);
  // fresh: write it again, not the kept answer (the evaluation asks for this).
  await streamRewrite(res, m, text, instructions, b.fresh === true, {
    admit: () => admit(rewriteCache(), asker, aiAvailable() || writerInjected()),
  });
});

/** GET /api/ready?hash=<sha256 of the text, see textHash>: {hash, voices}, the voices it can be shown in at once. */
route('GET', '/api/ready', (_q, res, _p, url) => {
  const hash = (url.searchParams.get('hash') ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return send(res, 400, { error: 'Send the text’s hash as ?hash=, 64 hex characters.' });
  const voices = [...new Set([...precomputedVoices(hash), ...rewriteCache().ready(hash, PROMPT_VERSION)])].sort();
  send(res, 200, { hash, voices });
});
