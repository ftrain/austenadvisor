import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIGURES } from '../src/engine/figures.ts';
import { findTerms, Glossary, namesOf, TERMS } from '../src/engine/glossary.ts';

const g = Glossary.load(join(mkdtempSync(join(tmpdir(), 'glossary-')), 'glossary.sqlite'));
const entries = g.all();
const found = (text: string) => findTerms(entries, text).map(([a, b, id]) => [text.slice(a, b), id]);

describe('the glossary', () => {
  it('is built into SQLite and finds a term by any of its names', () => {
    expect(entries.length).toBe(TERMS.length);
    expect(g.define('anastrophe')!.id).toBe('inversion');
    expect(g.define('Inversion (anastrophe)')!.id).toBe('inversion');
    expect(g.define('periods')!.id).toBe('period');
    expect(g.define('blank verse')!.definition).toMatch(/unrhymed iambic pentameter/i);
    expect(g.define('nonsense')).toBeNull();
  });

  it('searches the definitions', () => {
    expect(g.search('three parallel').map((t) => t.id)).toContain('tricolon');
    expect(g.search('objection').map((t) => t.id)).toEqual(expect.arrayContaining(['refutation', 'procatalepsis']));
  });

  it('defines every figure the engine recognizes, and names no term twice', () => {
    const names = new Set(entries.flatMap((e) => e.names));
    for (const [id, f] of Object.entries(FIGURES)) expect(names.has(f.name.toLowerCase()), `${id}: ${f.name}`).toBe(true);
    const all = TERMS.flatMap(namesOf);
    expect(all.filter((n, i) => all.indexOf(n) !== i)).toEqual([]);
  });

  it('marks each term at its first use, the longest name first, plurals too', () => {
    expect(found('Her balanced periods, and an ironic aside; the period closes on its antitheses. Another period.')).toEqual([
      ['balanced periods', 'isocolon'],
      ['ironic aside', 'aside'],
      ['period', 'period'],
      ['antitheses', 'antithesis'],
    ]);
    expect(found('I wrote it in blank verse, with a rhyming couplet to close.')).toEqual([
      ['blank verse', 'blankverse'],
      ['rhyming couplet', 'couplet'],
    ]);
  });

  it('leaves the everyday senses alone', () => {
    expect(found('She set aside her work for a short period.')).toEqual([]);
    expect(found('He put it aside after the trial period.')).toEqual([]);
  });
});
