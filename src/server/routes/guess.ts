// The guessing game: a real sentence from one of a few voices, and which voice wrote it. Every round was chosen when
// the packs were built (scripts/build-packs.ts), with the words, figures and length that give it away.

import type { GuessRound } from '../../engine/pack.ts';
import { route, send } from '../http.ts';
import { builtPacks } from '../read.ts';
import { authors } from '../voices.ts';

export interface GuessCard {
  /** "<voice>:<sentence id>", stable across requests. */
  id: string;
  text: string;
  cite: string;
  /** The voice that wrote it. */
  answer: string;
  /** Three voices to choose among, the answer one of them, in no fixed order. */
  choices: string[];
  /** Smaller is harder: how much more the answer's words suit it than the next voice's. */
  margin: number;
  tells: GuessRound['tells'];
}

/** A small seeded generator, so ?seed= gives the same rounds again. */
function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Rounds drawn evenly from the voices asked for (every voice with a pack when none are named). Each round's choices
 * are its voice and two others: the pack's own distractors where they are among the voices asked for, else others
 * of those voices.
 */
export function guessRounds(opts: { voices?: string[]; n?: number; seed?: number } = {}): GuessCard[] {
  const all = builtPacks();
  const asked = opts.voices?.length ? all.filter((p) => opts.voices!.includes(p.id)) : all;
  if (!asked.length) return [];
  const pool = asked.length >= 3 || opts.voices?.length ? asked : all;
  const rnd = random(opts.seed ?? Date.now());
  const n = Math.max(1, Math.min(50, opts.n ?? 10));
  const ids = pool.map((p) => p.id);
  const decks = new Map(asked.map((p) => [p.id, shuffle(p.guess, rnd)]));
  const out: GuessCard[] = [];
  for (let i = 0; out.length < n && i < n * 4; i++) {
    const p = asked[i % asked.length]!;
    const r = decks.get(p.id)!.pop();
    if (!r) continue;
    const others = [...r.distractors.filter((d) => ids.includes(d) && d !== p.id), ...shuffle(ids.filter((d) => d !== p.id && !r.distractors.includes(d)), rnd)];
    const choices = shuffle([p.id, ...others.slice(0, 2)], rnd);
    out.push({ id: `${p.id}:${r.id}`, text: r.text, cite: r.cite, answer: p.id, choices, margin: r.margin, tells: r.tells });
  }
  return shuffle(out, rnd);
}

route('GET', '/api/guess', (_q, res, _p, url) => {
  const voices = (url.searchParams.get('voices') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const n = Number(url.searchParams.get('n')) || undefined;
  const seed = Number(url.searchParams.get('seed')) || undefined;
  const rounds = guessRounds({ voices, n, seed });
  const names = Object.fromEntries(authors().map((a) => [a.id, a.short]));
  send(res, 200, { rounds, names });
});
