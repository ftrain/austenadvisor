// Facts for a student's text: whole sentences quoted from Wikipedia, each for the paragraph it supports. No model call.

import { gatherFacts } from '../facts.ts';
import { body, route, send } from '../http.ts';
import { MAX_CHARS } from '../page.ts';

route('POST', '/api/facts', async (req, res) => {
  const b = await body(req);
  const text = String(b.text ?? '');
  if (!text.trim()) return send(res, 400, { error: 'There is nothing to read yet.' });
  if (text.length > MAX_CHARS) return send(res, 413, { error: `That is ${text.length.toLocaleString()} characters; the most is ${MAX_CHARS.toLocaleString()}. Try a chapter at a time.` });
  send(res, 200, { facts: await gatherFacts(text) });
});
