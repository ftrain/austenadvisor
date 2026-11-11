// The forms and the fitting of a text to one (src/engine/forms.ts), and the form in /api/read and /api/boot. The
// engine tests need no voice; the route tests run where Austen is built.
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorDbPath } from '../src/db.ts';
import { alignToForm, FORM_IDS, formForKind, formLine, formOf, FORMS, MOVE_CONFIDENCE, readForm, slotSentence, type Labelled } from '../src/engine/forms.ts';
import { formTerm, roleTerm, termOf } from '../src/engine/glossary.ts';
import { KINDS, ROLES, ROLES_BY_KIND, type Role } from '../src/engine/structure.ts';

const form = (id: string) => formOf(id)!;
const labelled = (...roles: Role[]): Labelled[] => roles.map((role) => ({ role }));

describe('the forms', () => {
  it('are the seven the page offers, each with a name, a definition and slots', () => {
    expect(FORM_IDS).toEqual(['essay', 'argument', 'anecdote', 'story', 'letter', 'speech', 'review']);
    for (const f of FORMS) {
      expect(f.name, f.id).toMatch(/^[A-Z][a-z]+$/);
      expect(f.definition, f.id).toMatch(/\.$/);
      expect(KINDS, f.id).toContain(f.kind);
      expect(f.slots.length, f.id).toBeGreaterThanOrEqual(3);
      expect(f.slots.some((s) => s.required), f.id).toBe(true);
    }
  });

  it('give each slot a role its kind is read for, once, with a plain line', () => {
    for (const f of FORMS) {
      const roles = f.slots.map((s) => s.role);
      expect(new Set(roles).size, f.id).toBe(roles.length);
      for (const s of f.slots) {
        expect(ROLES_BY_KIND[f.kind], `${f.id}: ${s.role}`).toContain(s.role);
        expect(s.says, `${f.id}: ${s.role}`).toMatch(/^[a-z][^.!]*$/);
        // A slot sits beside an earlier slot only.
        if (s.beside) expect(roles.indexOf(s.beside), `${f.id}: ${s.role}`).toBeLessThan(roles.indexOf(s.role));
      }
    }
  });

  it('make an anecdote of a scene, a turn and a point, and an essay of claim, reasons, the other side and a close', () => {
    expect(form('anecdote').slots.map((s) => s.role)).toEqual(['scene', 'turn', 'verdict']);
    expect(form('anecdote').slots.every((s) => s.required)).toBe(true);
    expect(form('anecdote').short).toBe(true);
    expect(formLine(form('essay'))).toBe('Claim · Reason · Evidence · Objection · Answer · Call');
    expect(form('essay').slots.filter((s) => s.required).map((s) => s.role)).toEqual(['claim', 'reason', 'objection', 'answer', 'call']);
  });

  it('say what a form does with a part as a sentence', () => {
    expect(slotSentence(form('essay'), 'claim')).toBe('An essay opens with its claim.');
    expect(slotSentence(form('letter'), 'close')).toBe('A letter ends with a sign-off.');
    expect(slotSentence(form('letter'), 'claim')).toBe('');
  });

  it('give every kind of writing a form of its own', () => {
    for (const k of KINDS) expect(formForKind(k).id).toBe(k);
  });

  it('do not take a voice’s move for a form', async () => {
    // Emerson and Thoreau have a move called “essays”.
    const { moveKey } = await import('../src/engine/notes.ts');
    expect(moveKey('essays')).toBe('essays');
  });

  it('are glossary terms, and so is every slot role', () => {
    for (const f of FORMS) {
      const t = termOf(formTerm(f.id));
      expect(t?.term, f.id).toBe(f.name);
      expect(t?.kind).toBe('form');
      expect(t?.definition).toBe(f.definition);
      for (const s of f.slots) expect(termOf(roleTerm(s.role))?.term, `${f.id}: ${s.role}`).toBe(ROLES[s.role].name);
    }
  });
});

describe('alignToForm', () => {
  it('leaves a text that fits the form as it is', () => {
    const a = alignToForm(labelled('claim', 'reason', 'evidence', 'reason', 'objection', 'answer', 'call'), form('essay'));
    expect(a.order).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(a.moved).toEqual([]);
    expect(a.missing).toEqual([]);
  });

  it('puts a buried claim first and moves nothing else', () => {
    const a = alignToForm(labelled('reason', 'evidence', 'reason', 'claim', 'call'), form('essay'));
    expect(a.order).toEqual([3, 0, 1, 2, 4]);
    expect(a.moved).toEqual([{ paragraph: 3, from: 3, to: 0, role: 'claim', why: 'An essay opens with its claim.' }]);
    expect(a.missing).toEqual(['objection', 'answer']);
  });

  it('never drops or repeats a paragraph', () => {
    const roles = Object.keys(ROLES) as Role[];
    for (const f of FORMS) {
      // Every run of five roles out of a fixed shuffle.
      for (let k = 0; k < 60; k++) {
        const ps = labelled(...[0, 1, 2, 3, 4, 5, 6].map((i) => roles[(k * 7 + i * (k + 3)) % roles.length]!));
        const a = alignToForm(ps, f);
        expect([...a.order].sort((x, y) => x - y), f.id).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(alignToForm(ps, f)).toEqual(a);
        for (const m of a.moved) expect(a.order[m.to]).toBe(m.paragraph);
        // Every paragraph the form has a slot for is in that slot.
        expect(a.slots.flatMap((s) => s.paragraphs).length).toBe(ps.filter((p) => f.slots.some((s) => s.role === p.role)).length);
      }
    }
  });

  it('keeps the writer’s order among paragraphs that share a place', () => {
    // The body is the writer's to arrange: evidence among the reasons, each answer after its objection.
    const a = alignToForm(labelled('claim', 'evidence', 'reason', 'evidence', 'objection', 'answer', 'objection', 'answer', 'call'), form('essay'));
    expect(a.moved).toEqual([]);
    const s = alignToForm(labelled('scene', 'feeling', 'turn', 'feeling', 'verdict'), form('story'));
    expect(s.moved).toEqual([]);
    // A piece may meet the other side before it gives its own reasons.
    expect(alignToForm(labelled('part', 'objection', 'answer', 'reason', 'stakes', 'reason', 'call'), form('argument')).moved).toEqual([]);
    // The form fixes the two ends: a greeting opens a speech and a call comes before its close.
    expect(alignToForm(labelled('claim', 'greeting', 'call', 'reason', 'close'), form('speech')).order).toEqual([1, 0, 3, 2, 4]);
  });

  it('keeps a paragraph the form has no slot for next to its neighbour', () => {
    // The part after the claim travels with it; the part that opens the text stays with the reason after it.
    const a = alignToForm(labelled('part', 'reason', 'claim', 'part', 'call'), form('essay'));
    expect(a.order).toEqual([2, 3, 0, 1, 4]);
    expect(a.moved.map((m) => [m.paragraph, m.to, m.role])).toEqual([
      [2, 0, 'claim'],
      [3, 1, 'claim'],
    ]);
    // A feeling has no slot in an anecdote, so it stays where it was written.
    expect(alignToForm(labelled('scene', 'feeling', 'turn', 'verdict'), form('anecdote')).order).toEqual([0, 1, 2, 3]);
    // A text with no role the form knows is left alone, and every required slot is missing.
    const none = alignToForm(labelled('part', 'part', 'part'), form('letter'));
    expect(none.order).toEqual([0, 1, 2]);
    expect(none.missing).toEqual(['greeting', 'news', 'close']);
  });

  it('moves a paragraph only where the engine is sure of its role', () => {
    const weak: Labelled[] = [{ role: 'scene' }, { role: 'turn' }, { role: 'scene', confidence: MOVE_CONFIDENCE - 0.15 }, { role: 'verdict' }];
    const a = alignToForm(weak, form('story'));
    expect(a.order).toEqual([0, 1, 2, 3]);
    // It still counts as a scene.
    expect(a.slots[0]!.paragraphs).toEqual([0, 2]);
    const sure = alignToForm([{ role: 'scene' }, { role: 'turn' }, { role: 'scene', confidence: MOVE_CONFIDENCE }, { role: 'verdict' }], form('story'));
    expect(sure.order).toEqual([0, 2, 1, 3]);
  });

  it('counts a role done in passing, and reports the required slots nothing fills', () => {
    const one: Labelled[] = [{ role: 'claim' }, { role: 'reason' }, { role: 'objection', spans: [{ role: 'objection' }, { role: 'answer' }, { role: 'call' }] }];
    const a = alignToForm(one, form('essay'));
    expect(a.missing).toEqual([]);
    const answer = a.slots.find((s) => s.role === 'answer')!;
    expect([answer.paragraphs, answer.within, answer.missing]).toEqual([[], [2], false]);
    const bare = alignToForm(labelled('claim', 'reason'), form('essay'));
    expect(bare.missing).toEqual(['objection', 'answer', 'call']);
    expect(bare.slots.filter((s) => s.missing).map((s) => s.role)).toEqual(bare.missing);
    // An optional slot is empty without being missing.
    expect(bare.slots.find((s) => s.role === 'evidence')).toMatchObject({ paragraphs: [], missing: false });
  });

  it('handles an empty text', () => {
    expect(alignToForm([], form('anecdote'))).toMatchObject({ order: [], moved: [], missing: ['scene', 'turn', 'verdict'] });
  });
});

describe('readForm', () => {
  const buried = [
    'Last year my brother fell asleep at the wheel on the way to first period.',
    'First, teenagers need nine hours of sleep and almost none of them get it.',
    'I believe that school should start an hour later.',
    'Some people say a later start would ruin sports. But practice can move too.',
    'That is why the board should vote for a later start.',
  ].join('\n\n');

  it('picks the form from the kind of writing when asked for none', () => {
    const r = readForm(buried)!;
    expect(r.auto).toBe(true);
    expect(r.form.id).toBe(r.kind);
    expect(readForm(buried, 'auto')!.form.id).toBe(r.kind);
  });

  it('finds a buried claim and puts it first', () => {
    const r = readForm(buried, 'essay')!;
    expect(r.auto).toBe(false);
    expect(r.roles[2]!.role).toBe('claim');
    expect(r.alignment.order[0]).toBe(2);
    expect(r.alignment.moved.map((m) => m.paragraph)).toEqual([2]);
    expect(r.alignment.moved[0]!.why).toBe('An essay opens with its claim.');
    expect(r.alignment.missing).toEqual([]);
  });

  it('reads the text for the form asked, whatever kind it is', () => {
    const r = readForm(buried, 'anecdote')!;
    expect(r.form.kind).toBe('story');
    expect(r.roles.every((p) => ROLES_BY_KIND.story.includes(p.role) || p.role === 'part')).toBe(true);
    expect(r.roles[0]!.role).toBe('scene');
    expect(r.alignment.order.length).toBe(5);
  });

  it('answers null to a form it does not know', () => {
    expect(readForm(buried, 'sonnet')).toBeNull();
  });

  it('leaves a letter that fits whole and in order', () => {
    const letter = readForm(['Dear Mom and Dad,', 'Camp is okay, I guess. We swam in the lake on Tuesday.', 'Can you send more snacks?', 'Love, Jake'].join('\n\n'))!;
    expect(letter.form.id).toBe('letter');
    expect(letter.alignment.order).toEqual([0, 1, 2, 3]);
    expect(letter.alignment.moved).toEqual([]);
    expect(letter.alignment.missing).toEqual([]);
  });
});

// Keyless: no route may reach a model.
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[k];

describe.skipIf(!existsSync(authorDbPath('austen')))('the form in the routes', () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    const { createApp } = await import('../src/server/app.ts');
    server = await createApp();
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  const read = (data: unknown) => fetch(`${base}/api/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const text = [
    'Last year my brother fell asleep at the wheel on the way to first period.',
    'First, teenagers need nine hours of sleep and almost none of them get it.',
    'I believe that school should start an hour later.',
    'That is why the board should vote for a later start.',
  ].join('\n\n');

  it('lists the forms in the boot data', async () => {
    const boot = (await (await fetch(`${base}/api/boot`)).json()) as { forms: { id: string; name: string; definition: string }[]; glossary: { id: string }[] };
    expect(boot.forms).toEqual(FORMS.map(({ id, name, definition }) => ({ id, name, definition })));
    for (const f of FORMS) expect(boot.glossary.some((t) => t.id === formTerm(f.id)), f.id).toBe(true);
  });

  it('reads a text for the form of its kind when asked for none', async () => {
    const r = (await (await read({ voice: 'austen', text })).json()) as { kind: string; form: { id: string; auto: boolean; line: string }; shape: { yours: string; form: string } };
    expect(r.form.auto).toBe(true);
    expect(r.form.id).toBe(r.kind);
    expect(r.shape.form).toBe(r.form.line);
    expect(r.shape.yours).toMatch(/Claim/);
  });

  it('fits a text to the form asked for', async () => {
    const res = await read({ voice: 'austen', text, form: 'essay' });
    expect(res.status).toBe(200);
    const r = (await res.json()) as {
      roles: { role: string }[];
      form: { id: string; name: string; auto: boolean; line: string; order: number[]; slots: { role: string; name: string; paragraphs: number[]; missing: boolean }[]; moved: { paragraph: number; to: number; why: string }[]; missing: string[] };
      shape: { form: string };
    };
    expect(r.form).toMatchObject({ id: 'essay', name: 'Essay', auto: false, line: 'Claim · Reason · Evidence · Objection · Answer · Call' });
    expect(r.roles[2]!.role).toBe('claim');
    expect(r.form.order).toEqual([2, 0, 1, 3]);
    expect(r.form.moved).toEqual([{ paragraph: 2, from: 2, to: 0, role: 'claim', why: 'An essay opens with its claim.' }]);
    expect(r.form.missing).toEqual(['objection', 'answer']);
    expect(r.form.slots[0]).toMatchObject({ role: 'claim', name: 'Claim', paragraphs: [2], missing: false });
    expect(r.shape.form).toBe(r.form.line);
  });

  it('refuses a form it does not know', async () => {
    expect((await read({ voice: 'austen', text, form: 'sonnet' })).status).toBe(400);
  });
});
