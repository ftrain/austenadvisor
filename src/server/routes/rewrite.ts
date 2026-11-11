// The page's rewrite: a text in the voice's manner, fitted to a form (`form`: 'auto' or a form id) and, unless
// `facts` is false, given facts from Wikipedia, streamed as NDJSON as each part is written. Also which voices a
// text is ready in, so the page can offer them without spending a call.

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { admit, askerHash, precomputedVoices, rewriteCache, type Asker } from '../cache.ts';
import { body, route, send } from '../http.ts';
import { formOf } from '../../engine/forms.ts';
import { MAX_CHARS, streamRewrite, type Line } from '../page.ts';
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
  const form = String(b.form ?? 'auto') || 'auto';
  if (form !== 'auto' && !formOf(form)) return send(res, 400, { error: `No form “${form}” is known here.` });
  const asker = askerOf(req, b.client);
  const opts = { admit: () => admit(rewriteCache(), asker, aiAvailable() || writerInjected()), form, facts: b.facts !== false };
  // fresh: write it again, not the kept answer (the evaluation asks for this).
  if (b.job !== true) return streamRewrite(res, m, text, instructions, b.fresh === true, opts);
  // job: answer at once with an id, and let the page ask for the lines as they come. A proxy that holds a streamed
  // answer until it ends cannot hold these short ones.
  const job = new Job();
  sweep();
  jobs.set(job.id, job);
  // What the engine does before the answer has a head (fitting the form, gathering facts) reaches the page as lines.
  const early = (l: Line) => void job.write(`${JSON.stringify(l)}\n`);
  void streamRewrite(job as unknown as ServerResponse, m, text, instructions, b.fresh === true, { ...opts, early })
    .catch((e) => job.fail(e))
    .finally(() => job.end());
  send(res, 200, { job: job.id });
});

/** A rewrite under way, written into memory, not to a socket. It runs on if the page goes away: the cache keeps it. */
class Job {
  id = randomUUID();
  status = 0;
  lines: unknown[] = [];
  done = false;
  ended = 0;
  private buf = '';
  private waiting: (() => void)[] = [];
  writeHead(status: number) {
    this.status = status;
    return this;
  }
  write(s: string) {
    this.buf += s;
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const l = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (l) this.lines.push(JSON.parse(l));
    }
    this.wake();
    return true;
  }
  end(s?: string) {
    if (s) this.write(s + '\n');
    if (!this.done) {
      this.done = true;
      this.ended = Date.now();
    }
    this.wake();
    return this;
  }
  fail(e: unknown) {
    console.error(e);
    if (!this.status) this.status = 500;
    this.lines.push({ type: 'failed', error: 'The rewrite failed.' });
  }
  on() {
    return this;
  }
  /** Resolves when a line arrives or the job ends, or after `ms`. */
  next(ms: number): Promise<void> {
    return new Promise((ok) => {
      const t = setTimeout(ok, ms);
      this.waiting.push(() => (clearTimeout(t), ok()));
    });
  }
  private wake() {
    for (const w of this.waiting.splice(0)) w();
  }
}

const jobs = new Map<string, Job>();
const JOB_KEPT = 10 * 60_000;
const JOB_WAIT = 8_000;

/** Forget jobs that ended a while ago. */
function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (j.done && now - j.ended > JOB_KEPT) jobs.delete(id);
}

/**
 * GET /api/rewrite/<job>?after=<n>: {status, lines, next, done}: the job's lines from the n-th on. With nothing new
 * it waits a few seconds for a line, then answers anyway. A status other than 200 is a refusal, and lines[0] says why.
 */
route('GET', '/api/rewrite/:job', async (_q, res, [id], url) => {
  const job = jobs.get(id ?? '');
  if (!job) return send(res, 404, { error: 'That rewrite is not here. Ask for it again.' });
  const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
  if (job.lines.length <= after && !job.done) await job.next(JOB_WAIT);
  // A refusal's reason is the job's last line, whatever progress lines came before it.
  const refused = !!job.status && job.status !== 200;
  send(res, 200, { status: job.status || 200, lines: refused ? job.lines.slice(-1) : job.lines.slice(after), next: job.lines.length, done: job.done });
});

/** GET /api/ready?hash=<sha256 of the text, see textHash>: {hash, voices}, the voices it can be shown in at once. */
route('GET', '/api/ready', (_q, res, _p, url) => {
  const hash = (url.searchParams.get('hash') ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return send(res, 400, { error: 'Send the text’s hash as ?hash=, 64 hex characters.' });
  const voices = [...new Set([...precomputedVoices(hash), ...rewriteCache().ready(hash, PROMPT_VERSION)])].sort();
  send(res, 200, { hash, voices });
});
