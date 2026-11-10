// Practice: the writer's own attempt at a move, read by the engine at once.

import { practiceCheck } from '../../engine/practice.ts';
import { body, route, send } from '../http.ts';
import { voiceOr404 } from './engine.ts';

route('POST', '/api/practice', async (req, res) => {
  const b = await body(req);
  const m = voiceOr404(res, b.author);
  if (!m) return;
  send(res, 200, practiceCheck(m, String(b.text ?? '').slice(0, 4000), String(b.move ?? '')));
});
