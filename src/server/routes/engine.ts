// The engine, stateless and with no model call: a text read against a voice, one word's profile, and the
// paragraph around one of the voice's sentences.

import type { ServerResponse } from 'node:http';
import { analyze } from '../../engine/analyze.ts';
import { blocksOfText } from '../../engine/doc.ts';
import type { AuthorModel } from '../../engine/model.ts';
import { withFigures, wordProfile } from '../../engine/tools.ts';
import { body, route, send } from '../http.ts';
import { MAX_CHARS } from '../page.ts';
import { isBuilt, model } from '../voices.ts';

/** The built voice by this id, or null after answering 404. */
export function voiceOr404(res: ServerResponse, id: string | null | undefined): AuthorModel | null {
  const v = String(id ?? 'austen');
  if (isBuilt(v)) return model(v);
  send(res, 404, { error: `No voice “${v}” is built here.` });
  return null;
}

route('POST', '/api/analyze', async (req, res) => {
  const b = await body(req);
  const m = voiceOr404(res, b.author);
  if (!m) return;
  const text = String(b.text ?? '');
  if (text.length > MAX_CHARS) return send(res, 413, { error: `That is ${text.length.toLocaleString()} characters; the most is ${MAX_CHARS.toLocaleString()}. Try a chapter at a time.` });
  const a = analyze(m, blocksOfText(text));
  // Every sentence of the voice's shown names the figures of speech it shows.
  for (const f of a.words) for (const x of f.alternatives) if (x.example) x.example = withFigures(m, x.example);
  for (const ad of a.advice) ad.examples = ad.examples.map((c) => withFigures(m, c));
  for (const u of a.report.underused) if (u.example) u.example = withFigures(m, u.example);
  send(res, 200, a);
});
route('GET', '/api/word', (_q, res, _p, url) => {
  const m = voiceOr404(res, url.searchParams.get('author'));
  if (!m) return;
  send(res, 200, wordProfile(m, url.searchParams.get('word') ?? '', { context: url.searchParams.get('context') ?? undefined, examples: 8 }));
});
route('GET', '/api/context', (_q, res, _p, url) => {
  const m = voiceOr404(res, url.searchParams.get('author'));
  if (!m) return;
  const id = Number(url.searchParams.get('sentence'));
  send(res, 200, { cite: m.cite(id), paragraph: m.paragraphOf(id) });
});
