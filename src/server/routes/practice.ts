// Try it: the writer's own attempt at a move, read by the engine at once, and the drills worth offering.

import { drillsFor, practiceCheck, type DrillNote } from '../../engine/practice.ts';
import { body, route, send } from '../http.ts';
import { voiceOr404 } from './engine.ts';

/** The longest attempt or text read, in characters. */
const MAX_ATTEMPT = 4000;
const MAX_TEXT = 20000;

// POST {author, text, move} -> PracticeCheck: {made, verdict, hint, also, length, shape, move, never}
route('POST', '/api/practice', async (req, res) => {
  const b = await body(req);
  const m = voiceOr404(res, b.author ?? b.voice);
  if (!m) return;
  send(res, 200, practiceCheck(m, String(b.text ?? '').slice(0, MAX_ATTEMPT), String(b.move ?? '')));
});

// POST {author, text, notes?} -> {drills: Drill[]}. With notes, drills only for moves the rewrite made; without, for
// gaps the engine finds in the text.
route('POST', '/api/practice/drills', async (req, res) => {
  const b = await body(req);
  const m = voiceOr404(res, b.author ?? b.voice);
  if (!m) return;
  const notes = Array.isArray(b.notes) ? (b.notes as DrillNote[]).filter((n) => n && typeof n === 'object') : null;
  send(res, 200, { drills: drillsFor(m, String(b.text ?? '').slice(0, MAX_TEXT), notes) });
});
