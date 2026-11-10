// Every voice on every case, through the page's own endpoint, scored two ways: by the engine (the rewrite read
// against the author: score, words the author never used, paragraphs kept, time) and by a judge of another family
// (Claude, through OpenRouter) on a rubric: fidelity, voice, sense, naturalness, notes. Writes docs/eval/voices/<label>.json
// and .md.
//
//   node scripts/eval-voices.ts <label> [--voices austen,kjv] [--cases neighbors,paris | --set diet] [--judge anthropic/claude-sonnet-5.5]
//   node scripts/eval-voices.ts <label> --set diet --from final      an earlier run's rewrites, re-reported, no server
//   node scripts/eval-voices.ts <label> --set diet --compare <base>  and the sense and fidelity means set against a baseline
//
// Needs the server running (BASE, default http://localhost:8080) and OPENROUTER_API_KEY for the judge, except with --from.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const BASE = process.env.BASE ?? 'http://localhost:8080';
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const JUDGE = opt('judge') ?? 'anthropic/claude-sonnet-5.5';
const AT_ONCE = Number(opt('at-once') ?? 8);

/** Named sets of cases. `diet`: the cases written to test sense, and ten more of every kind, for the writer's diet
 * (the reader removed, the schema and the brief trimmed): sense and fidelity are to stay within 0.3 of the baseline. */
const SETS: Record<string, string[]> = {
  diet: ['neighbors', 'paris', 'relieved', 'breakup', 'camp-letter', 'job-interview', 'party', 'store', 'email', 'list', 'oped', 'pitch'],
};
const caseIds = opt('cases')?.split(',') ?? (opt('set') ? SETS[opt('set')!] : undefined);
if (opt('set') && !SETS[opt('set')!]) throw new Error(`No set "${opt('set')}": ${Object.keys(SETS).join(', ')}.`);
/** The largest fall in a judged mean that still counts as level. */
const TOLERANCE = 0.3;

/** What a judge should know of a case that the writer's text alone does not say. */
const KNOWN: Record<string, string> = {
  neighbors: 'The draft contradicts itself: the new family has a mother (“the mom is kind of standoffish”), but the father is then single, divorced. A good rewrite mends this (the woman is someone else in the household) and says so. The situation echoes the opening of Pride and Prejudice.',
  paris: 'The draft contradicts itself: “I’ve never been to Paris. The last time I was there…”. A good rewrite mends this (perhaps it is a joke, or the narrator means they never saw Paris, only the embassy) and says so.',
  relieved: 'The feelings point one way: not upset, relieved, dreading the dinner, not proud of being relieved, doubtful they will reschedule. Any rewrite that turns relief into disappointment, or dread into pleasure, fails fidelity.',
  email: 'A work email: it must stay an email to a team, with its greeting, its two requests (sections by Wednesday noon; say today if blocked), its reason (legal has not signed off on pricing) and its sign-off.',
  oped: 'An argument: claim (close Main Street to cars on weekends), reasons (parking, narrow sidewalks), evidence (other towns), objection (business owners) and a weak answer, a call (try it this summer). A good rewrite keeps every element and may build the argument better (order, concession, answer to the objection), saying so in its notes; it must not add new evidence or claims.',
  pitch: 'An argument to colleagues: claim (four-day week), reasons (burnout, an engineer quit, hiring), evidence (studies), objection (risk, clients), proposal (a three-month trial). A good rewrite keeps every element and may build it better, saying so; it must not invent evidence.',
  list: 'Three tasks in a list (gutters, sink, grandmother who talked an hour about her neighbour’s cat) and one feeling (exhausted but proud). All must survive.',
};

interface Case {
  id: string;
  text: string;
}
const cases: Case[] = [
  ...readdirSync(join(ROOT, 'samples')).filter((f) => f.endsWith('.txt')).map((f) => ({ id: f.replace('.txt', '').replace('-text', ''), text: readFileSync(join(ROOT, 'samples', f), 'utf8') })),
  ...readdirSync(join(ROOT, 'docs/eval/cases')).filter((f) => f.endsWith('.txt')).map((f) => ({ id: f.replace('.txt', ''), text: readFileSync(join(ROOT, 'docs/eval/cases', f), 'utf8') })),
].filter((c) => !caseIds || caseIds.includes(c.id));

const from = opt('from');
const earlier = (name: string) => JSON.parse(readFileSync(join(ROOT, 'docs/eval/voices', `${name}.json`), 'utf8')) as Run[];
// With --from, the voices are the earlier run's, and the server is not asked.
const authors: { id: string; title: string; built: boolean }[] = from
  ? [...new Set(earlier(from).map((r) => r.voice))].map((id) => ({ id, title: id, built: true }))
  : ((await (await fetch(`${BASE}/api/authors`)).json()) as { id: string; title: string; built: boolean }[]);
const voices = authors.filter((a) => a.built && (!opt('voices') || opt('voices')!.split(',').includes(a.id)));

interface Run {
  voice: string;
  case: string;
  ms: number;
  error?: string;
  yours: string;
  rewrite: string;
  rows: { from?: number[]; text: string; notes: { kind: string; technique: string; text?: string; after: string; cite?: string; verified: boolean }[] }[];
  engine?: { score: number; scoreYours: number; never: string[]; paragraphsYours: number; paragraphsHers: number };
  lessons: string[];
  reading?: { kind: string; outline: { role: string; gist: string }[]; plan: { role: string; gist: string; why?: string }[] };
  judge?: Judgement;
}
interface Judgement {
  fidelity: number;
  voice: number;
  sense: number;
  natural: number;
  notes: number;
  teaching: number;
  structure: number;
  faults: { kind: string; quote: string; why: string }[];
  verdict: string;
}

async function rewrite(voice: string, c: Case): Promise<Run> {
  const t0 = Date.now();
  const run: Run = { voice, case: c.id, ms: 0, yours: c.text.replace(/^#\s.*\n+/, '').trim(), rewrite: '', rows: [], lessons: [] };
  try {
    const r = await fetch(`${BASE}/api/rewrite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: voice, text: c.text, fresh: true }) });
    if (!r.ok) throw new Error(await r.text());
    const rows = new Map<number, any>();
    for (const line of (await r.text()).split('\n').filter(Boolean)) {
      const m = JSON.parse(line);
      if (m.type === 'plan') for (const h of m.headings) rows.set(h.index, h);
      if (m.type === 'part') {
        if (m.error) throw new Error(m.error);
        for (const row of m.rows) rows.set(row.index, row);
        if (m.explanation) run.lessons.push(m.explanation);
        if (m.reading && !run.reading) run.reading = m.reading;
      }
    }
    const sorted = [...rows.values()].sort((a, b) => a.index - b.index).filter((x) => x.kind === 'paragraph');
    run.rows = sorted.map((x) => ({ from: x.from, text: (x.hers ?? []).map((s: any) => s.text).join(' '), notes: x.notes.map((n: any) => ({ kind: n.kind, technique: n.technique, text: n.text, after: n.after, cite: n.quote?.cite, verified: n.verified })) }));
    run.rewrite = run.rows.map((x) => x.text).join('\n\n');
  } catch (e) {
    run.error = String((e as Error).message ?? e).slice(0, 300);
  }
  run.ms = Date.now() - t0;
  if (!run.error) {
    const read = async (text: string) => (await (await fetch(`${BASE}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: voice, text }) })).json()) as any;
    const [hers, mine] = await Promise.all([read(run.rewrite), read(run.yours)]);
    run.engine = {
      score: hers.report.score,
      scoreYours: mine.report.score,
      never: hers.words.filter((w: any) => w.kind !== 'name').map((w: any) => w.word),
      paragraphsYours: run.yours.split(/\n\s*\n/).filter((p) => p.trim()).length,
      paragraphsHers: run.rows.length,
    };
  }
  return run;
}

const RUBRIC = `You are judging a rewrite of a writer's passage into the manner of a famous voice. The rewriter is a teaching tool: the writer wants to see their own prose as that voice would have written it, and learn from the notes.

Score each 1 to 5 (5 = excellent, 3 = acceptable with real flaws, 1 = fails):
- fidelity: every fact, person, event and their order kept; each sentence means what the writer's meant, and every feeling points the same way and to the same degree; nothing added beyond (a) the voice's commentary on what is there and (b) a mending of a real fault of sense, reported in a note. Dropping a fact, inverting a feeling, or inventing an incident is a serious fault.
- voice: does it truly read as the voice (its syntax, cadence, vocabulary, moves), not as modern prose in costume? Judge against what you know of the real texts.
- sense: if the draft had a fault of sense (a contradiction, an unclear person), was it caught, mended well (the mending agrees with every other sentence) and reported to the writer? If the draft had no fault, did the rewrite keep it clear and introduce none? 5 = right on both counts.
- natural: does every sentence read as idiomatic for the voice, with no riddles, garble, malapropisms (a word in a sense the voice would not use it), or unintended comedy?
- notes: do the notes (moves with sources, sense mendings, structure) name real changes accurately? Are the cited sources apt?
- teaching: the tool's purpose is to make the writer better: to evolve their style, learn to structure arguments, and grow their own voice by learning from other voices. Taken together (notes, the outline of how the piece is built beside how the voice would build it, and the lesson), does the writer come away with moves they could reuse in their own writing, said concretely, with the reason they work? 5 = several transferable lessons, each clear and grounded in this text; 1 = generic or nothing to take away.
- structure: is the rewrite well built for what it is (an argument's claim, reasons, objection and answer, and close in a persuasive order; a story's telling; a letter's or email's form and requests), and if it changed the writer's order, was that an improvement and explained? For a piece whose structure was already right, 5 if kept.

List every specific fault you find, with the exact words quoted, kind (fidelity, voice, sense, natural, notes, form), and why. Be strict and concrete; do not list virtues.
Answer with JSON only: {"fidelity":n,"voice":n,"sense":n,"natural":n,"notes":n,"teaching":n,"structure":n,"faults":[{"kind":"…","quote":"…","why":"…"}],"verdict":"one or two sentences"}`;

async function judge(run: Run, title: string): Promise<Judgement | undefined> {
  if (run.error) return undefined;
  const notes = run.rows
    .map((r, k) => `Paragraph ${k + 1}${r.from ? ` (renders the writer’s ¶${r.from.join(', ')})` : ''}:\n${r.notes.map((n) => `  - [${n.kind}] ${n.technique}: ${n.text ?? `“${n.after}”`}${n.cite ? ` — cites ${n.cite}` : ''}`).join('\n') || '  (no notes)'}`)
    .join('\n');
  const built = run.reading?.outline?.length
    ? `\n\n<how_it_is_built kind="${run.reading.kind}">\nThe writer's: ${run.reading.outline.map((x) => `${x.role} (${x.gist})`).join(' → ')}\nAs the voice would build it: ${run.reading.plan.map((x) => `${x.role} (${x.gist}${x.why ? `; why: ${x.why}` : ''})`).join(' → ')}\n</how_it_is_built>`
    : '';
  const lesson = run.lessons.length ? `\n\n<lesson>\n${run.lessons.join('\n')}\n</lesson>` : '';
  const user = `Voice: ${title}\n\n<writer>\n${run.yours}\n</writer>\n\n<rewrite>\n${run.rewrite}\n</rewrite>\n\n<notes>\n${notes}\n</notes>${built}${lesson}${KNOWN[run.case] ? `\n\n<known>\n${KNOWN[run.case]}\n</known>` : ''}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: JUDGE, max_tokens: 3000, temperature: 0, messages: [{ role: 'system', content: RUBRIC }, { role: 'user', content: user }] }),
      });
      const j = (await r.json()) as any;
      const text: string = j.choices?.[0]?.message?.content ?? '';
      const m = /\{[\s\S]*\}/.exec(text);
      if (m) return JSON.parse(m[0]) as Judgement;
    } catch {
      /* again */
    }
  }
  return undefined;
}

async function pool<T, R>(items: T[], n: number, f: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i]!, i);
    }
  }));
  return out;
}

// --rejudge <label>: the saved rewrites of an earlier run, scored again (by another judge), without rewriting them.
// --retry <label>: an earlier run's failed rewrites done again, the rest kept.
const again = opt('rejudge');
const retry = opt('retry');
const jobs = voices.flatMap((v) => cases.map((c) => ({ v, c })));
let done = 0;
const runs: Run[] = from
  ? earlier(from).filter((r) => voices.some((v) => v.id === r.voice) && cases.some((c) => c.id === r.case))
  : retry
  ? await pool(JSON.parse(readFileSync(join(ROOT, 'docs/eval/voices', `${retry}.json`), 'utf8')) as Run[], AT_ONCE, async (old) => {
      if (!old.error) return old;
      const v = voices.find((x) => x.id === old.voice)!;
      const run = await rewrite(old.voice, cases.find((c) => c.id === old.case)!);
      run.judge = await judge(run, v.title);
      process.stderr.write(`\rretried ${++done} ${old.voice}/${old.case}${run.error ? ' ERROR' : ''}            `);
      return run;
    })
  : again
  ? await pool(
      (JSON.parse(readFileSync(join(ROOT, 'docs/eval/voices', `${again}.json`), 'utf8')) as Run[]).filter((r) => voices.some((v) => v.id === r.voice) && cases.some((c) => c.id === r.case)),
      AT_ONCE,
      async (run, i, all = []) => {
        run.judge = await judge(run, voices.find((v) => v.id === run.voice)!.title);
        process.stderr.write(`\rrejudged ${++done} ${run.voice}/${run.case}            `);
        void i;
        void all;
        return run;
      },
    )
  : await pool(jobs, AT_ONCE, async ({ v, c }) => {
      const run = await rewrite(v.id, c);
      run.judge = await judge(run, v.title);
      process.stderr.write(`\r${++done}/${jobs.length} ${v.id}/${c.id} ${Math.round(run.ms / 1000)}s${run.error ? ' ERROR' : ''}            `);
      return run;
    });
process.stderr.write('\n');

// The report.
const dims = ['fidelity', 'voice', 'sense', 'natural', 'notes', 'teaching', 'structure'] as const;
const mean = (xs: number[]) => {
  const ys = xs.filter((x) => Number.isFinite(x));
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : NaN;
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const judged = runs.filter((r) => r.judge);
const row = (label: string, rs: Run[]) =>
  `| ${label} | ${dims.map((d) => f1(mean(rs.filter((r) => r.judge).map((r) => r.judge![d])))).join(' | ')} | ${f1(mean(rs.filter((r) => r.judge).map((r) => mean(dims.map((d) => r.judge![d])))))} | ${f1(mean(rs.filter((r) => r.engine).map((r) => r.engine!.score)))} | ${f1(mean(rs.filter((r) => r.engine).map((r) => r.engine!.never.length)))} | ${Math.round(mean(rs.map((r) => r.ms)) / 1000)}s | ${rs.filter((r) => r.error).length} |`;
const head = `| | ${dims.join(' | ')} | mean | engine score | never-used | time | errors |\n|${'---|'.repeat(dims.length + 6)}`;
// --compare <label>: the sense and fidelity means beside a baseline's, on the voices and cases both runs have.
const base = opt('compare');
const comparison: string[] = [];
let level = true;
if (base) {
  const pairs = earlier(base).filter((b) => b.judge && runs.some((r) => r.judge && r.voice === b.voice && r.case === b.case));
  const now = runs.filter((r) => r.judge && pairs.some((b) => b.voice === r.voice && b.case === r.case));
  comparison.push('## Against the baseline', '', `${now.length} rewrites judged in both this run and ${base}. Level means a fall of ${TOLERANCE} or less.`, '', '| | baseline | this run | change | level |', '|---|---|---|---|---|');
  for (const d of ['sense', 'fidelity'] as const) {
    const before = mean(pairs.map((r) => r.judge![d]));
    const after = mean(now.map((r) => r.judge![d]));
    const ok = Number.isFinite(after - before) && after - before >= -TOLERANCE;
    level &&= ok;
    comparison.push(`| ${d} | ${f1(before)} | ${f1(after)} | ${Number.isFinite(after - before) ? (after - before).toFixed(2) : '–'} | ${ok ? 'yes' : 'no'} |`);
  }
  comparison.push('', level ? 'Sense and fidelity are level with the baseline.' : 'Sense or fidelity fell further than the baseline allows.', '');
}
const md = [
  `# Voices evaluation: ${label}`,
  '',
  ...(from ? [`The rewrites of ${from}, re-reported for these cases.`, ''] : []),
  `${runs.length} rewrites (${voices.length} voices × ${cases.length} cases), judged by ${from ? `the judge of ${from}` : JUDGE}. Judge scores 1–5; engine score 0–100 against the voice's corpus; never-used is words left in the rewrite that the voice never used.`,
  '',
  ...comparison,
  '## By voice',
  '',
  head,
  ...voices.map((v) => row(v.title, runs.filter((r) => r.voice === v.id))),
  row('**All**', runs),
  '',
  '## By case',
  '',
  head,
  ...cases.map((c) => row(c.id, runs.filter((r) => r.case === c.id))),
  '',
  '## Faults',
  '',
  ...judged.flatMap((r) => [`### ${r.voice} / ${r.case} (${dims.map((d) => `${d[0]}${r.judge![d]}`).join(' ')})`, '', `_${r.judge!.verdict}_`, '', ...r.judge!.faults.map((f) => `- **${f.kind}**: “${f.quote}”: ${f.why}`), '']),
  ...runs.filter((r) => r.error).map((r) => `- ERROR ${r.voice}/${r.case}: ${r.error}`),
].join('\n');
const dir = join(ROOT, 'docs/eval/voices');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${label}.json`), JSON.stringify(runs, null, 1));
writeFileSync(join(dir, `${label}.md`), md);
console.log(md.split('## Faults')[0]);
if (base && !level) process.exitCode = 1;
