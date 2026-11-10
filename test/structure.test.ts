// Kind and structure without a model: detectKind against the hand-set kinds of the samples, roles on known pieces,
// and an author's usual order over a corpus.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { blocksOfText } from '../src/engine/doc.ts';
import {
  KINDS,
  ROLE_THRESHOLD,
  ROLES,
  ROLES_BY_KIND,
  detectKind,
  labelRoles,
  looksLikeLetter,
  readStructure,
  roleSequence,
  shapeLine,
  signatureOf,
  typicalOrder,
  type Kind,
} from '../src/engine/structure.ts';

const SAMPLES = join(import.meta.dirname, '..', 'samples');
const sample = (file: string) => readFileSync(join(SAMPLES, file), 'utf8');
const paragraphsOf = (text: string) => blocksOfText(text).filter((b) => b.kind === 'paragraph').map((b) => b.text);
const index: { id: string; file: string; kind: Kind }[] = existsSync(join(SAMPLES, 'index.json')) ? JSON.parse(readFileSync(join(SAMPLES, 'index.json'), 'utf8')) : [];

describe('detectKind', () => {
  it.skipIf(!index.length)('agrees with the kind of at least 80% of the samples', () => {
    const misses = index.filter((e) => detectKind(sample(e.file)) !== e.kind).map((e) => `${e.id}: ${e.kind}, read as ${detectKind(sample(e.file))}`);
    if (misses.length) console.log(`detectKind misses ${misses.length} of ${index.length}:\n  ${misses.join('\n  ')}`);
    expect(index.length - misses.length).toBeGreaterThanOrEqual(Math.ceil(0.8 * index.length));
  });

  it('finds each kind in a sample of its own', () => {
    expect(detectKind(sample('homework.txt'))).toBe('argument');
    expect(detectKind(sample('camp-letter.txt'))).toBe('letter');
    expect(detectKind(sample('party.txt'))).toBe('story');
    expect(detectKind(sample('student-council-speech.txt'))).toBe('speech');
    expect(detectKind(sample('book-review.txt'))).toBe('review');
    expect(detectKind(sample('city-and-country.txt'))).toBe('essay');
  });

  it('takes blocks as well as text, and reads empty text as an essay', () => {
    expect(detectKind(blocksOfText(sample('homework.txt')))).toBe('argument');
    expect(detectKind('')).toBe('essay');
    expect(KINDS).toContain(detectKind('Just a line.'));
  });

  it('tells a letter by its frame, and a diary from a letter', () => {
    expect(looksLikeLetter(['To Whom It May Concern,', 'The blender broke.', 'Sincerely, Dana Whitfield'])).toBe(true);
    expect(looksLikeLetter(['Hey team,', 'I am sorry about Thursday.', 'Jake'])).toBe(true);
    expect(looksLikeLetter(['Dear diary, today was so weird. I woke up late.', 'Anyway, tomorrow will be better.'])).toBe(false);
    expect(detectKind(sample('diary-tuesday.txt'))).not.toBe('letter');
  });
});

describe('labelRoles', () => {
  it('reads the homework argument as claim, reasons, objection, answer and call', () => {
    const roles = labelRoles(paragraphsOf(sample('homework.txt')), 'argument');
    expect(roleSequence(roles)).toEqual(['claim', 'reason', 'reason', 'reason', 'objection', 'answer', 'call']);
    expect(roles.map((r) => r.role)).toEqual(['claim', 'reason', 'reason', 'objection']);
    expect(roles[3]!.spans.map((s) => [s.role, s.from, s.to])).toEqual([
      ['objection', 0, 1],
      ['answer', 1, 2],
      ['call', 2, 3],
    ]);
  });

  it("ends the camp letter with its close, not a story's turn", () => {
    const { kind, roles } = readStructure(sample('camp-letter.txt'));
    expect(kind).toBe('letter');
    expect(roles.map((r) => r.role)).toEqual(['greeting', 'news', 'news', 'request', 'close', 'close']);
    expect(roles.at(-1)!.role).toBe('close');
  });

  it('calls a paragraph with no clear cue "part"', () => {
    const roles = labelRoles(['The walls are yellow. There is a TV in the corner.', 'There are plastic chairs.'], 'essay');
    for (const r of roles) {
      expect(r.role).toBe('part');
      expect(r.confidence).toBeLessThan(ROLE_THRESHOLD);
      for (const s of r.spans) expect(s.role).toBe('part');
    }
  });

  it('gives every named role a confidence at or above the threshold, from the roles of its kind', () => {
    for (const e of index) {
      const { kind, roles } = readStructure(sample(e.file));
      for (const r of roles)
        for (const s of r.spans) {
          if (s.role === 'part') expect(s.confidence).toBeLessThan(ROLE_THRESHOLD);
          else {
            expect(s.confidence).toBeGreaterThanOrEqual(ROLE_THRESHOLD);
            expect(ROLES_BY_KIND[kind]).toContain(s.role);
          }
        }
    }
  });

  it('sets the scene of a story first, and ends on its verdict', () => {
    const seq = readStructure(sample('party.txt')).sequence;
    expect(seq[0]).toBe('scene');
    expect(seq.at(-1)).toBe('verdict');
    expect(seq).toContain('turn');
  });
});

describe('roles.json', () => {
  it('defines every role plainly, with the words a signature needs', () => {
    const all = new Set([...Object.values(ROLES_BY_KIND).flat(), 'part' as const]);
    for (const r of all) {
      const info = ROLES[r];
      expect(info, r).toBeDefined();
      expect(info.name).toMatch(/^[A-Z]/);
      expect(info.definition.length).toBeGreaterThan(20);
      expect(info.definition).not.toMatch(/!/);
      expect(info.opens).toBeTruthy();
      expect(info.then).toBeTruthy();
    }
    expect(shapeLine(['claim', 'reason', 'call'])).toBe('Claim · Reason · Call');
  });
});

describe('typicalOrder', () => {
  /** A corpus of three chapters, each a little story: a scene, a turn, a verdict. */
  function fakeCorpus(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE chapters (id INTEGER PRIMARY KEY, work TEXT, ord INTEGER, title TEXT);
      CREATE TABLE paragraphs (id INTEGER PRIMARY KEY, chapter INTEGER, ord INTEGER, kind TEXT, words INTEGER, sentences INTEGER, dialogue REAL, text TEXT);`);
    const para = db.prepare('INSERT INTO paragraphs (chapter, ord, kind, words, sentences, dialogue, text) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (let c = 1; c <= 3; c++) {
      db.prepare('INSERT INTO chapters (id, work, ord, title) VALUES (?, ?, ?, ?)').run(c, 'w', c, `Chapter ${c}`);
      const ps = [
        'It was a cold night in the village, and the inn was full. The fire burned low and the men talked of the harvest.',
        'Then a stranger came in from the road. He stood at the door and said nothing for a long time.',
        '"Who are you?" said the innkeeper.',
        'Looking back, I learned that night that a stranger is only a friend we have not met. I will never forget it.',
      ];
      ps.forEach((t, i) => para.run(c, i, 'narration', t.split(' ').length, 2, t.startsWith('"') ? 1 : 0, t));
    }
    return db;
  }

  it('finds the order the passages share and says it in one sentence', () => {
    const o = typicalOrder({ db: fakeCorpus(), author: { short: 'Hardy' } });
    expect(o.kind).toBe('story');
    expect(o.order).toEqual(['scene', 'turn', 'verdict']);
    expect(o.support).toBe(3);
    expect(o.passages).toBe(3);
    expect(o.signature).toBe('Hardy begins by setting the scene, then turns the story.');
  });

  it('builds a signature from the template', () => {
    expect(signatureOf('Lincoln', ['scene', 'claim', 'reason', 'call'])).toBe('Lincoln begins by setting the scene, then says what it all means.');
    expect(signatureOf('Austen', ['part'])).toMatch(/^Austen follows no single order/);
  });

  const obama = join(import.meta.dirname, '..', 'data', 'obama.sqlite');
  it.skipIf(!existsSync(obama))('reads a built corpus in well under two seconds', () => {
    const db = new DatabaseSync(obama, { readOnly: true });
    const t = performance.now();
    const o = typicalOrder({ db, author: { short: 'Obama' } });
    expect(performance.now() - t).toBeLessThan(2000);
    expect(o.order.length).toBeGreaterThan(0);
    expect(o.signature.startsWith('Obama ')).toBe(true);
    db.close();
  });
});
