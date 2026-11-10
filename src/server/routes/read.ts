// The engine's reading of a student's text against a voice: kind, roles, words the voice never wrote, style,
// suggested voices and a sketch of each sentence in the voice's own sentences. No model call.

import { body, route, send } from '../http.ts';
import { MAX_CHARS } from '../page.ts';
import { readText } from '../read.ts';
import { isBuilt } from '../voices.ts';

route('POST', '/api/read', async (req, res) => {
  const b = await body(req);
  const voice = String(b.voice ?? b.author ?? 'austen');
  const text = String(b.text ?? '');
  if (!isBuilt(voice)) return send(res, 404, { error: `No voice “${voice}” is built here.` });
  if (!text.trim()) return send(res, 400, { error: 'There is nothing to read yet.' });
  if (text.length > MAX_CHARS) return send(res, 413, { error: `That is ${text.length.toLocaleString()} characters; the most is ${MAX_CHARS.toLocaleString()}. Try a chapter at a time.` });
  send(res, 200, readText(voice, text));
});
