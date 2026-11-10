// Try it: the writer's own attempt at a move, read by the engine at once, and the drills worth offering.

import { drillsFor, practiceCheck, type DrillNote } from '../../engine/practice.ts';
import { body, route, send } from '../http.ts';
import { voiceOr404 } from './engine.ts';

/** The longest attempt or text read, in characters. */
const MAX_ATTEMPT = 4000;
const MAX_TEXT = 20000;
/** The most notes read for drills, and the longest field of each. */
const MAX_NOTES = 50;
const MAX_FIELD = 1000;

/** The notes a page sent, kept to the fields drills read, each a string or a boolean and none too long. */
function notesOf(x: unknown): DrillNote[] | null {
  if (!Array.isArray(x)) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, MAX_FIELD) : undefined);
  return x
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .slice(0, MAX_NOTES)
    .map((n) => ({ kind: str(n.kind), id: str(n.id), technique: str(n.technique), before: str(n.before), after: str(n.after), verified: typeof n.verified === 'boolean' ? n.verified : undefined }));
}

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
  const notes = notesOf(b.notes);
  send(res, 200, { drills: drillsFor(m, String(b.text ?? '').slice(0, MAX_TEXT), notes) });
});
