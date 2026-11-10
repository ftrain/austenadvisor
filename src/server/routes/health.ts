// Whether the server is up, and whether it can call a model for full rewrites.

import { route, send } from '../http.ts';
import { aiAvailable, PROVIDER, READER, WRITER_MODEL } from '../rewrite.ts';

route('GET', '/api/health', (_q, res) => send(res, 200, { ok: true }));
route('GET', '/api/ai', (_q, res) => send(res, 200, { available: aiAvailable(), model: WRITER_MODEL, reader: READER, provider: PROVIDER }));
