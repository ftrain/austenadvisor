// The page's rewrite: a text in the voice's manner, streamed as NDJSON as each part is written.

import { body, route, send } from '../http.ts';
import { MAX_CHARS, streamRewrite } from '../page.ts';
import { AI_KEYS, aiAvailable } from '../rewrite.ts';
import { voiceOr404 } from './engine.ts';

route('POST', '/api/rewrite', async (req, res) => {
  const b = await body(req);
  const text = String(b.text ?? '');
  const m = voiceOr404(res, b.author);
  if (!m) return;
  if (!aiAvailable()) return send(res, 503, { error: `The rewrite needs ${AI_KEYS} set where the server runs.` });
  if (!text.trim()) return send(res, 400, { error: 'There is nothing to rewrite yet.' });
  if (text.length > MAX_CHARS) return send(res, 413, { error: `That is ${text.length.toLocaleString()} characters; the most is ${MAX_CHARS.toLocaleString()}. Try a chapter at a time.` });
  // fresh: write it again, not the kept answer (the evaluation asks for this).
  await streamRewrite(res, m, text, String(b.instructions ?? ''), b.fresh === true);
});
