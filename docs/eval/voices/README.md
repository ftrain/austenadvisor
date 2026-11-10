# Evaluating the voices

`node scripts/eval-voices.ts <label>` runs every built voice on every case (the samples, and the cases in
[docs/eval/cases](../cases/) written to trip a particular fault) through the page's own endpoint. It scores each
rewrite two ways:

- **The engine.** The rewrite read against the voice's corpus: its score, words the voice never used, paragraphs kept, and time.
- **A judge of another family.** Claude Sonnet 5.5, through OpenRouter, scores 1–5 on a rubric. Fidelity, voice, sense,
  naturalness and notes; and, since the goal is a better writer, not a better pastiche, *teaching* (does the writer come
  away with moves to reuse, and why they work) and *structure* (is the argument or the telling well built, and is a
  change of order explained). It lists every fault with the words quoted.

## What the rounds showed (November 2026, DeepSeek v4 writing)

| Run | What changed | Mean | Fidelity | Sense | Time |
|---|---|---|---|---|---|
| baseline | an editor's read beside the draft, a redraft with its findings | 2.6 | 2.5 | 3.1 | 47s |
| round1 | no invented matter; liberties reported; note quotations checked | 2.7 | 2.8 | 3.1 | 95s |
| one-plain | **one transaction**: the model reads, then writes, in one answer; repairs, not redrafts | 2.8 | 3.1 | 3.3 | 24s |
| one-think | the same, DeepSeek thinking on | 3.0 | 3.3 | 3.8 | 213s |
| think-low | thinking on, effort low | 3.0 | 2.8 | 3.4 | 150s |
| read-then-write | a fast reader (deepseek-flash) first, its plan imposed | 2.6 | 2.6 | 3.0 | 27s |
| read-write-proof | and a fast proofreader's edits applied | 2.4 | 2.8 | 2.6 | 28s |
| strict-reader | one transaction, plus a strict fast read for contradictions only | 2.9 | 3.1 | 3.5 | 26s |
| final | that, with words the voice never used mended by the engine; all six voices, twelve cases | 2.8 | 2.9 | 3.4 | 25s |

On the same sixty rewrites as the baseline, the final configuration is faster by half and better on fidelity
(2.53 → 2.88) and sense (3.12 → 3.52), about level on naturalness and notes, and a little weaker on voice (2.87 → 2.70).

What the runs taught:

- **Thinking pays in quality and costs minutes.** DeepSeek's thinking lifted every score but took three to four minutes a
  rewrite, at any effort. Not usable for a page.
- **A fast model reads better than a big one writes.** deepseek-flash, without thinking, caught the New Neighbors
  contradiction five times in five in ten seconds; deepseek-v4-pro, reading in passing as it wrote, two in five.
- **A reader that over-reports does harm.** Given a loose brief it called things faults that were not, and the writer
  "mended" them by adding matter. Strict (contradictions and true echoes only, at most two) it helps.
- **Imposed structure did not help; the writer's own plan did.** Structure scores were best when the model wrote its own
  outline and plan and then followed them.
- **A proofreader's patches broke more than they fixed:** deleted phrases left stray punctuation, and fixes put modern
  words back. Off by default (`ADVISOR_PROOF=on`).
- **Most remaining faults are small infidelities** (a time changed, a word in a misleading sense, a feeling made
  stronger) and **notes that over-claim** a move or cite a loose source. The engine now drops notes whose words do not
  make their move and chooses each note's source itself, with the move's words marked.

Each run's rewrites, scores and every fault are in this directory as `<label>.json` and `<label>.md`.

## Which model should write (judged by GPT-5.6 Terra, a family neither writer belongs to)

The same 24 cases (four voices, six cases), the DeepSeek rewrites re-judged by the new judge so all are scored alike:

| Writer | Mean | Fidelity | Voice | Sense | Natural | Notes | Teaching | Structure | Time | Scored |
|---|---|---|---|---|---|---|---|---|---|---|
| DeepSeek v4 Pro | 2.86 | 2.88 | 2.33 | 3.46 | 3.00 | 1.50 | 2.50 | 4.38 | 25s | 24 |
| Gemini 3.8 Flash | 3.24 | 3.09 | 2.96 | 3.70 | 3.26 | 2.00 | 3.00 | 4.70 | 90s | 23 |
| Claude Sonnet 5.5 | 3.57 | 3.67 | 3.33 | 4.00 | 3.33 | 2.67 | 3.33 | 4.67 | 38s | 3 |
| Claude Opus 5.5 | 3.74 | 3.40 | 3.60 | 4.20 | 4.00 | 2.60 | 3.40 | 5.00 | 37s | 5 |

Claude, through OpenRouter, was refused for most requests ("would exceed your available credits"): its rows rest on
few rewrites, though they agree with an earlier partial run (Opus 3.7, Sonnet 3.6). Claude wants a direct Anthropic key
or more OpenRouter credit; the code takes either (`.env.example`). Claude refuses a forced tool choice, so the adapter
offers the tool to Claude rather than requiring it.
