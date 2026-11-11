// The writer's loop with a fake writer: the tool inputs of real rewrites (test/fixtures/rewrites.json, taken from
// data/cache/rewrites) are replayed, so the loop, the gate's one redraft and the page's cache run with no model.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { authorDbPath, DATA, ROOT } from '../src/db.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { buildBrief } from '../src/engine/brief.ts';
import { blocksOfText } from '../src/engine/doc.ts';
import { RewriteCache } from '../src/server/cache.ts';
import { gatherFacts, type Fact } from '../src/server/facts.ts';
import { fitText, missingByPart } from '../src/server/fit.ts';
import { streamRewrite, type Row } from '../src/server/page.ts';
import { factGate, rewriteWithAI, submitted, systemPrompt, unsupported, useWriter, type Submission, type WriterAnswer, type WriterClient } from '../src/server/rewrite.ts';
import { ESSAY, essaySubmission, essayWiki } from './fixtures/essay-scenario.ts';

interface Fixture {
  id: string;
  voice: string;
  text: string;
  submission: Submission;
}
const fixtures = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'rewrites.json'), 'utf8')) as Fixture[];
const fixture = (id: string) => structuredClone(fixtures.find((f) => f.id === id)!);
const textHashOf = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex');
const built = existsSync(authorDbPath('austen')) && existsSync(authorDbPath('shakespeare'));

/** A writer that gives its answers in order, and keeps what each call was sent. */
function fakeWriter(answers: WriterAnswer[]): WriterClient & { calls: { system: string; user: unknown[]; tools: string[] }[] } {
  const calls: { system: string; user: unknown[]; tools: string[] }[] = [];
  return {
    calls,
    async call(system, user, tools) {
      calls.push({ system, user: structuredClone(user), tools: tools.map((t) => t.name) });
      const next = answers[calls.length - 1];
      if (!next) throw new Error(`The fake writer has no answer for call ${calls.length}.`);
      return next;
    },
  };
}
const noTool: WriterAnswer = { content: [{ type: 'text', text: 'Here is my rewrite.', citations: null }], stop_reason: 'end_turn' };
const lastUser = (call: { user: unknown[] }) => call.user.at(-1) as { role: string; content: unknown };

describe.skipIf(!built)('rewriteWithAI with a fake writer', () => {
  const austen = built ? AuthorModel.load('austen') : (null as unknown as AuthorModel);
  const shakespeare = built ? AuthorModel.load('shakespeare') : (null as unknown as AuthorModel);

  it('takes a clean part in one call', async () => {
    const f = fixture('sister-car');
    const writer = fakeWriter([submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0]!.tools).toEqual(['submit_rewrite']);
    expect(writer.calls[0]!.system).toContain('Jane Austen');
    expect(writer.calls[0]!.user).toHaveLength(1);
    expect(r.rounds).toBe(1);
    expect(r.problems.filter((p) => /^Not rendered/.test(p))).toEqual([]);
    expect(r.text).toContain('My sister had taken my car without asking');
    expect(r.source.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(r.aligned.map((a) => a.from)).toEqual([[1, 2], [3]]);
    expect(r.aligned.every((a) => a.why.length > 0)).toBe(true);
    expect(r.toolCalls).toHaveLength(1);
  });

  it('lays out a rewrite of several paragraphs', async () => {
    const f = fixture('camp-letter');
    const writer = fakeWriter([submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(shakespeare, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(1);
    expect(r.paragraphs).toHaveLength(6);
    expect(r.paragraphs.map((p) => p.source)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.source).toHaveLength(14);
  });

  it('sends a hard gate failure back once, and takes the redraft', async () => {
    const f = fixture('sister-car');
    const lost = structuredClone(f.submission);
    lost.paragraphs[0]!.sentences.pop();
    const writer = fakeWriter([submitted(lost as unknown as Record<string, unknown>, 'toolu_first'), submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(2);
    const back = lastUser(writer.calls[1]!);
    expect(back.role).toBe('user');
    expect(JSON.stringify(back.content)).toMatch(/toolu_first.*Not yet accepted.*Not rendered: sentence 3/);
    expect(r.rounds).toBe(2);
    expect(r.text).toContain('I then went home.');
    expect(r.problems.filter((p) => /^Not rendered/.test(p))).toEqual([]);
  });

  it('redrafts no more than once', async () => {
    const f = fixture('sister-car');
    const lost = structuredClone(f.submission);
    lost.paragraphs[0]!.sentences.pop();
    const writer = fakeWriter([submitted(lost as unknown as Record<string, unknown>), submitted(lost as unknown as Record<string, unknown>), submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(2);
    expect(r.rounds).toBe(2);
    expect(r.problems.some((p) => /^Not rendered: sentence 3/.test(p))).toBe(true);
  });

  it('asks once more when the answer has no tool call', async () => {
    const f = fixture('sister-car-short');
    const writer = fakeWriter([noTool, submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(2);
    expect(lastUser(writer.calls[1]!)).toEqual({ role: 'user', content: 'Call submit_rewrite with your rewrite.' });
    expect(r.rounds).toBe(1);
    expect(r.text).toContain('My sister took the carriage');
  });

  it('takes an answer with no paragraphs as no draft: asks again, and fails plainly if the next is empty too', async () => {
    const f = fixture('sister-car-short');
    const writer = fakeWriter([submitted({}), submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(2);
    expect(r.text).toContain('My sister took the carriage');
    await expect(rewriteWithAI(austen, f.text, {}, () => {}, fakeWriter([submitted({}), submitted({ paragraphs: 'none' })]))).rejects.toThrow('The model gave no rewrite.');
  });

  it('fails plainly when the writer never submits', async () => {
    const writer = fakeWriter(Array.from({ length: 18 }, () => noTool));
    await expect(rewriteWithAI(austen, fixture('sister-car').text, {}, () => {}, writer)).rejects.toThrow('The model gave no rewrite.');
    expect(writer.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reports a refusal', async () => {
    const writer = fakeWriter([{ content: [], stop_reason: 'refusal' }]);
    await expect(rewriteWithAI(austen, fixture('sister-car').text, {}, () => {}, writer)).rejects.toThrow(/declined/);
  });

  it('counts the tokens of every call as it returns, even when the rewrite fails', async () => {
    const paid = (a: WriterAnswer): WriterAnswer => ({ ...a, usage: { input_tokens: 100, output_tokens: 10 } });
    let spent = 0;
    const spend = (n: number) => (spent += n);
    await expect(rewriteWithAI(austen, fixture('sister-car').text, { spend }, () => {}, fakeWriter([paid({ content: [], stop_reason: 'refusal' })]))).rejects.toThrow(/declined/);
    expect(spent).toBe(110);
    spent = 0;
    await expect(rewriteWithAI(austen, fixture('sister-car').text, { spend }, () => {}, fakeWriter([paid(noTool), paid(noTool)]))).rejects.toThrow('The model gave no rewrite.');
    expect(spent).toBe(220);
  });

  it('makes two writer calls at most, taking the draft it has after a nudge', async () => {
    const f = fixture('sister-car');
    const lost = structuredClone(f.submission);
    lost.paragraphs[0]!.sentences.pop();
    const writer = fakeWriter([noTool, submitted(lost as unknown as Record<string, unknown>), submitted(f.submission as unknown as Record<string, unknown>)]);
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, writer);
    expect(writer.calls).toHaveLength(2);
    expect(r.rounds).toBe(1);
  });

  it('drops a sense note or liberty with a field missing, as a writer without a strict schema may send', async () => {
    const f = fixture('sister-car');
    const sub = structuredClone(f.submission) as Submission & Record<string, unknown>;
    sub.sense = [{ problem: 'Unclear who.' } as never, { problem: 'Whose car?', resolution: 'The sister’s.', before: 'my car', after: 'my car' }];
    sub.liberties = [{ after: 'without asking' } as never];
    const r = await rewriteWithAI(austen, f.text, {}, () => {}, fakeWriter([submitted(sub as unknown as Record<string, unknown>)]));
    expect(r.sense.map((x) => x.problem)).toEqual(['Whose car?']);
    expect(r.liberties).toEqual([]);
  });
});

/** A response that keeps what the page is sent. */
function fakeResponse() {
  const out: string[] = [];
  const res = {
    status: 0,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    write(s: string) {
      out.push(s);
      return true;
    },
    end(s?: string) {
      if (s) out.push(s);
      return res;
    },
    on() {
      return res;
    },
  };
  return { res: res as unknown as ServerResponse, lines: () => out.join('').trim().split('\n').map((l) => JSON.parse(l) as { type: string; [k: string]: unknown }) };
}

describe.skipIf(!built)('streamRewrite and its cache', () => {
  const austen = built ? AuthorModel.load('austen') : (null as unknown as AuthorModel);
  // A cache of the test's own, in memory, and no samples made ahead of time.
  const cache = new RewriteCache(':memory:');
  const opts = { cache, precomputed: null };
  afterEach(() => useWriter(null));

  it('rewrites no more than the word cap and the part limit allow', async () => {
    const f = fixture('sister-car');
    const writer = fakeWriter(Array.from({ length: 20 }, () => submitted(f.submission as unknown as Record<string, unknown>)));
    useWriter(writer);
    // One paragraph longer than the cap by itself is not sent.
    const long = fakeResponse();
    await streamRewrite(long.res, austen, Array.from({ length: 1300 }, () => 'word').join(' ') + '.', '', false, opts);
    expect(writer.calls).toHaveLength(0);
    expect(long.lines().find((l) => l.type === 'part')).toMatchObject({ resting: 'long' });
    // Headings make a part of every short paragraph; only the first three are sent.
    const many = fakeResponse();
    await streamRewrite(many.res, austen, Array.from({ length: 8 }, (_x, i) => `# Section ${i + 1}\n\nWe went home at ${i + 1}.`).join('\n\n'), '', false, opts);
    const parts = many.lines().filter((l) => l.type === 'part');
    expect(parts.filter((l) => l.resting === 'long')).toHaveLength(5);
    expect(writer.calls.length).toBeLessThanOrEqual(3 * 2);
  });

  it('calls the writer on a miss, keeps the result, and serves it again without a call', async () => {
    const f = fixture('sister-car');
    const writer = fakeWriter([submitted(f.submission as unknown as Record<string, unknown>), submitted(f.submission as unknown as Record<string, unknown>)]);
    useWriter(writer);

    const miss = fakeResponse();
    await streamRewrite(miss.res, austen, f.text, '', false, opts);
    expect(writer.calls).toHaveLength(1);
    const first = miss.lines();
    expect(first.map((l) => l.type)).toContain('plan');
    const part = first.find((l) => l.type === 'part')!;
    expect(part.error).toBeUndefined();
    expect(JSON.stringify(part.rows)).toContain('My sister had taken my car without asking');
    expect(first.at(-1)!.type).toBe('done');

    const hit = fakeResponse();
    await streamRewrite(hit.res, austen, f.text, '', false, opts);
    expect(writer.calls).toHaveLength(1);
    const second = hit.lines();
    expect((second.find((l) => l.type === 'progress')!.log as string[]).at(-1)).toBe('kept from before');
    expect(second.find((l) => l.type === 'part')).toMatchObject({ rows: part.rows, cached: true });

    const fresh = fakeResponse();
    await streamRewrite(fresh.res, austen, f.text, '', true, opts);
    expect(writer.calls).toHaveLength(2);
  });

  it('keeps nothing when a part fails', async () => {
    useWriter(fakeWriter([]));
    const text = `${fixture('sister-car').text} It failed.`;
    const out = fakeResponse();
    await streamRewrite(out.res, austen, text, '', false, opts);
    const part = out.lines().find((l) => l.type === 'part')!;
    expect(part.error).toMatch(/no answer/);
    expect((cache.db.prepare('SELECT COUNT(*) AS n FROM rewrites WHERE json LIKE ?').get('%It failed.%') as { n: number }).n).toBe(0);
  });
});

describe('fitting a text to a form before it is written', () => {
  it('puts the paragraphs in the form’s order, and says which moved and why', () => {
    const fit = fitText(blocksOfText(ESSAY), 'essay')!;
    expect(fit.blocks[0]!.text).toBe('I believe that the colonists were right to protest.');
    expect(fit.orig).toEqual([2, 0, 1, 3, 4]);
    expect([...fit.moved]).toEqual([[0, 'Moved: this was your paragraph 3. An essay opens with its claim.']]);
    expect(missingByPart(fit, [[0, 1, 2, 3, 4]])).toEqual([['call']]);
    // The missing part goes to the part of the text that holds what comes before it.
    expect(missingByPart(fit, [[0, 1], [2, 3, 4]])).toEqual([[], ['call']]);
  });

  it('asks for no new part under Auto, where the form is only the engine’s reading', () => {
    const fit = fitText(blocksOfText(ESSAY), 'auto')!;
    expect(fit.reading.auto).toBe(true);
    expect(missingByPart(fit, [[0, 1, 2, 3, 4]])).toEqual([[]]);
  });

  it('moves nothing across a heading', () => {
    const paras = ESSAY.split('\n\n');
    const fit = fitText(blocksOfText([paras[0], paras[1], '# The other side', ...paras.slice(2)].join('\n\n')), 'essay')!;
    expect(fit.orig).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fit.moved.size).toBe(0);
  });

  it('answers null to a form it does not know', () => {
    expect(fitText(blocksOfText(ESSAY), 'sonnet')).toBeNull();
  });
});

describe('the names and numbers an added sentence may state', () => {
  const allowed = new Set(['boston', '1773', 'revere', 'paul']);
  it('finds a number or a name that is in neither the text nor a fact', () => {
    expect(unsupported('It happened in 1790, on a Thursday.', allowed)).toEqual(['1790', 'Thursday']);
    expect(unsupported('Paul Revere left Boston in 1773.', allowed)).toEqual([]);
  });
  it('does not take the capital that opens a sentence or a quotation for a name', () => {
    expect(unsupported('Nobody listened. “Never,” they said.', allowed)).toEqual([]);
  });
});

describe.skipIf(!built)('the form and the facts in a rewrite', () => {
  const austen = built ? AuthorModel.load('austen') : (null as unknown as AuthorModel);
  const opts = (cache: RewriteCache | null, facts: Fact[]) => ({ cache, precomputed: null, form: 'essay', facts: true, gather: async () => facts });
  const gathered = () => gatherFacts(ESSAY, { wiki: essayWiki(), store: null });
  afterEach(() => useWriter(null));

  it('gives the writer the form’s parts, the missing part and the facts, in the form’s order', async () => {
    const facts = await gathered();
    expect(facts.map((f) => f.paragraph)).toEqual([1, 1, 4]);
    const writer = fakeWriter([submitted(essaySubmission(facts) as unknown as Record<string, unknown>)]);
    useWriter(writer);
    const out = fakeResponse();
    await streamRewrite(out.res, austen, ESSAY, '', false, opts(null, facts));
    expect(writer.calls).toHaveLength(1);
    const user = String((writer.calls[0]!.user[0] as { content: string }).content);
    // The claim, third as written, is the brief's first paragraph.
    expect(user).toMatch(/<paragraph n="1">\n<sentence n="1"[^>]*>\nI believe that the colonists were right to protest\./);
    expect(user).toContain('<form name="Essay">');
    expect(user).toContain('<part role="claim" paragraphs="1">opens with its claim</part>');
    expect(user).toContain('<part role="call" missing="true">closes by saying what the reader should now believe or do</part>');
    expect(user).toContain('Missing: call.');
    // Each fact is given for the paragraph it supports, as the brief numbers it now.
    expect(user).toContain(`<fact id="${facts[0]!.id}" paragraph="3" source="Boston Tea Party">`);
    expect(user).toContain(`<fact id="${facts[2]!.id}" paragraph="5" source="Paul Revere">`);
    expect(writer.calls[0]!.system).toContain('<form_and_facts>');
  });

  it('lays out a moved paragraph, a written part, added text and footnotes', async () => {
    const facts = await gathered();
    useWriter(fakeWriter([submitted(essaySubmission(facts) as unknown as Record<string, unknown>)]));
    const out = fakeResponse();
    await streamRewrite(out.res, austen, ESSAY, '', false, opts(null, facts));
    const lines = out.lines();
    // The plan already shows the paragraphs in the form's order.
    expect((lines.find((l) => l.type === 'plan')!.paragraphs as { text: string }[])[0]!.text).toMatch(/^I believe/);
    const rows = (lines.find((l) => l.type === 'part')!.rows as Row[]).filter((r) => r.kind === 'paragraph');
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ moved: true, from: [3] });
    expect(rows[0]!.notes.map((n) => [n.kind, n.text])).toContainEqual(['structure', 'Moved: this was your paragraph 3. An essay opens with its claim.']);
    expect(rows.slice(1, 5).some((r) => r.moved || r.filled)).toBe(false);
    // The fact in a sentence of its own is added whole, and carries the fact quoted exactly.
    const fact = rows[2]!.hers![1]!;
    expect(fact.added).toEqual([[0, fact.text.length]]);
    expect(fact.facts).toEqual([{ id: facts[0]!.id, text: facts[0]!.text, title: 'Boston Tea Party', url: 'https://en.wikipedia.org/wiki/Boston_Tea_Party' }]);
    expect(rows[2]!.hers![0]!.added).toBeUndefined();
    // A fact worked into the writer's sentence: only the fact's words are marked.
    const revere = rows[4]!.hers![0]!;
    expect(revere.added!.map(([a, b]) => revere.text.slice(a, b))).toEqual(['a silversmith', 'in April 1775']);
    expect(revere.facts!.map((f) => f.title)).toEqual(['Paul Revere']);
    // The part the form lacked: nothing of the writer's beside it, and a note that says so.
    expect(rows[5]).toMatchObject({ yours: [], filled: 'Not in your text. An essay closes by saying what the reader should now believe or do.' });
    expect(rows[5]!.hers![0]!.added).toEqual([[0, rows[5]!.hers![0]!.text.length]]);
    expect(rows[5]!.notes[0]).toMatchObject({ kind: 'structure' });
    // A footnoted sentence gets no note of its own.
    expect(rows[2]!.notes.filter((n) => n.kind === 'liberty')).toEqual([]);
  });

  it('keeps a rewrite under its form and its facts, and writes again for another form or other facts', async () => {
    const facts = await gathered();
    const cache = new RewriteCache(':memory:');
    const answer = () => submitted(essaySubmission(facts) as unknown as Record<string, unknown>);
    const writer = fakeWriter([answer(), answer(), answer()]);
    useWriter(writer);
    await streamRewrite(fakeResponse().res, austen, ESSAY, '', false, opts(cache, facts));
    const again = fakeResponse();
    await streamRewrite(again.res, austen, ESSAY, '', false, opts(cache, facts));
    expect(writer.calls).toHaveLength(1);
    expect(JSON.stringify(again.lines().find((l) => l.type === 'part')!.rows)).toContain('Boston_Tea_Party');
    await streamRewrite(fakeResponse().res, austen, ESSAY, '', false, opts(cache, facts.slice(0, 1)));
    expect(writer.calls).toHaveLength(2);
    await streamRewrite(fakeResponse().res, austen, ESSAY, '', false, { ...opts(cache, facts), form: 'argument' });
    expect(writer.calls).toHaveLength(3);
    // A form or facts is not the plain request that "ready" promises.
    expect(cache.ready(textHashOf(ESSAY), 'x')).toEqual([]);
  });

  it('says what it is doing before the writer is called, and never waits on facts past their budget', async () => {
    const facts = await gathered();
    useWriter(fakeWriter([submitted(essaySubmission([]) as unknown as Record<string, unknown>)]));
    const early: string[][] = [];
    const out = fakeResponse();
    await streamRewrite(out.res, austen, ESSAY, '', false, { ...opts(null, facts), gather: () => Promise.reject(new Error('down')), early: (l) => early.push(l.log as string[]) });
    expect(early.at(-1)).toEqual(['gathering facts', 'fitting it to the form']);
    const rows = out.lines().find((l) => l.type === 'part')!.rows as Row[];
    expect(JSON.stringify(rows)).not.toContain('"facts"');
  });

  it('with no facts and the form of its kind, asks the writer as it did before there were either', async () => {
    const f = fixture('sister-car');
    const writer = fakeWriter([submitted(f.submission as unknown as Record<string, unknown>)]);
    useWriter(writer);
    const out = fakeResponse();
    await streamRewrite(out.res, austen, f.text, '', false, { cache: null, precomputed: null, facts: true, gather: async () => [] });
    const user = String((writer.calls[0]!.user[0] as { content: string }).content);
    expect(user).not.toContain('<facts>');
    expect(user).not.toContain('Missing:');
    const rows = out.lines().find((l) => l.type === 'part')!.rows as Row[];
    expect(JSON.stringify(rows)).not.toMatch(/"added"|"facts"|"filled"|"moved"/);
  });

  it('drops a fact that was not supplied, and cuts an added sentence that states what no fact does', async () => {
    const facts = await gathered();
    const brief = buildBrief(austen, fitText(blocksOfText(ESSAY), 'essay')!.blocks);
    const supplied = facts.map((f) => ({ id: f.id, text: f.text, title: f.title, paragraph: 3 }));
    const sub = essaySubmission(facts);
    sub.paragraphs[1]!.sentences[0]!.facts = ['wdeadbeef'];
    sub.paragraphs[2]!.sentences.push({ text: 'The king signed the answer in 1790, at Windsor.', from: [], facts: [], added: true });
    sub.paragraphs.push({ role: 'stakes', why: 'More.', sentences: [{ text: 'Much was at stake for everyone.', from: [], facts: [], added: true }] });
    const cut = factGate(austen, brief, sub, { facts: supplied, missing: ['call'] });
    expect(sub.paragraphs[1]!.sentences[0]!.facts).toEqual([]);
    expect(sub.paragraphs[2]!.sentences.map((x) => x.text)).not.toContain('The king signed the answer in 1790, at Windsor.');
    expect(cut.join(' ')).toMatch(/1790.*Windsor/);
    // A new paragraph stands only as a part the form lacked.
    expect(sub.paragraphs.map((p) => p.role)).toEqual(['claim', 'reason', 'reason', 'objection', 'evidence', 'call']);
    expect(cut.join(' ')).toContain('the form did not ask for');
  });

  it('marks as added a sentence that says it renders the writer’s words and shares none of them', () => {
    const brief = buildBrief(austen, blocksOfText('We went to the shop. It was closed.'));
    const sub: Submission = {
      explanation: '',
      paragraphs: [
        {
          role: 'scene',
          sentences: [
            { text: 'We walked to the shop, and found it shut.', from: [1, 2], facts: [], added: false },
            { text: 'Every merchant in the county keeps irregular hours during the harvest season, as travellers frequently observe.', from: [2], facts: [], added: false },
          ],
        },
      ],
    };
    factGate(austen, brief, sub);
    expect(sub.paragraphs[0]!.sentences.map((x) => !!x.added)).toEqual([false, true]);
  });
});

describe.skipIf(!existsSync(authorDbPath('plain')))('a style’s writer', () => {
  it('is told to mend faults and keep modern words, and nothing of a world or of words never written', () => {
    const system = systemPrompt(AuthorModel.load('plain'));
    expect(system).toContain('Rewrite the passage in the plain style.');
    expect(system).toContain('Mend every fault the brief marks.');
    expect(system).toContain('Modern words stay');
    expect(system).toContain('<form_and_facts>');
    expect(system).not.toMatch(/would have written|never wrote|in its world/);
  });
});
