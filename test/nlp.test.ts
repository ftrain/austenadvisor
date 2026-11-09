import { describe, expect, it } from 'vitest';
import { KneserNey, Vocab, countTrigrams } from '../src/nlp/kn.ts';
import { csrFrom, jacobiEigen, randomizedSvd } from '../src/nlp/linalg.ts';
import { cleanBrownTag, wnPos } from '../src/nlp/tagger.ts';
import { looksProper, sentences, tokenize } from '../src/nlp/tokenize.ts';

describe('tokenize', () => {
  it('keeps contractions and hyphens in a word, and knows speech', () => {
    const t = tokenize('“I don’t know,” said Mr. Bennet’s good-humoured wife.');
    expect(t.filter((x) => x.kind === 'word').map((x) => x.norm)).toEqual(['i', "don't", 'know', 'said', 'mr', "bennet's", 'good-humoured', 'wife']);
    expect(t.find((x) => x.norm === 'know')!.quoted).toBe(true);
    expect(t.find((x) => x.norm === 'said')!.quoted).toBe(false);
  });
  it('reads straight quotation marks as opening and closing', () => {
    const t = tokenize('"Hey," she said. "Hi."');
    expect(t.find((x) => x.norm === 'hey')!.quoted).toBe(true);
    expect(t.find((x) => x.norm === 'she')!.quoted).toBe(false);
    expect(t.find((x) => x.norm === 'hi')!.quoted).toBe(true);
  });
});

describe('sentences', () => {
  const split = (s: string) => sentences(s).map((x) => s.slice(x.start, x.end));
  it('does not end a sentence at Mr. or at an exclamation inside it', () => {
    expect(split('“Oh! single, my dear, to be sure! A single man.” Mr. Bennet replied that he had not.')).toEqual([
      '“Oh! single, my dear, to be sure!',
      'A single man.”',
      'Mr. Bennet replied that he had not.',
    ]);
  });
  it('keeps a question with its speech tag', () => {
    expect(split('“Is he married or single?” said she. He was single.')).toEqual(['“Is he married or single?” said she.', 'He was single.']);
  });
  it('tells a name by its capital mid-sentence', () => {
    const t = tokenize('Yesterday I met Kayla at the lake.');
    expect(looksProper(t, 0, 0)).toBe(false);
    expect(looksProper(t, 3, 0)).toBe(true);
  });
});

describe('Kneser–Ney', () => {
  const sents = ['the cat sat on the mat', 'the dog sat on the log', 'a cat ate the fish', 'the cat ate'].map((s) => s.split(' '));
  const vocab = new Vocab();
  for (const s of sents) for (const w of s) vocab.add(w);
  const lm = new KneserNey(vocab, countTrigrams(sents, vocab));
  it('gives a distribution that sums to one in every context', () => {
    for (const [u, v] of [['the', 'cat'], ['<s>', 'the'], ['sat', 'on'], ['zebra', 'unseen']]) {
      let sum = 0;
      for (let w = 0; w < vocab.size; w++) sum += lm.p3(vocab.id(u!), vocab.id(v!), w);
      expect(sum).toBeGreaterThan(0.97);
      expect(sum).toBeLessThan(1.03);
    }
  });
  it('prefers what was seen', () => {
    const ws = ['the', 'cat', 'sat'];
    expect(lm.slotScore(ws, 1, 'cat')).toBeGreaterThan(lm.slotScore(ws, 1, 'fish'));
    expect(lm.gapCandidates('the', 'sat')).toContain('cat');
  });
});

describe('linear algebra', () => {
  it('finds eigenvalues of a symmetric matrix', () => {
    const { values } = jacobiEigen(Float64Array.from([2, 1, 0, 1, 2, 0, 0, 0, 5]), 3);
    expect([...values].sort((a, b) => a - b).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([1, 3, 5]);
  });
  it('recovers the leading singular values of a sparse matrix', () => {
    // diag(9, 4, 1) padded into 6×6.
    const e = new Map<number, number>([[0, 9], [1 * 6 + 1, 4], [2 * 6 + 2, 1]]);
    const { s } = randomizedSvd(csrFrom(6, 6, e, 6), 2, 3, 4);
    expect(s[0]).toBeCloseTo(9, 4);
    expect(s[1]).toBeCloseTo(4, 4);
  });
});

describe('tags', () => {
  it('cleans Brown tags and maps them to WordNet', () => {
    expect(cleanBrownTag('np-tl')).toBe('NP');
    expect(cleanBrownTag('``')).toBe('"');
    expect(wnPos('VBD')).toBe('v');
    expect(wnPos('NNS')).toBe('n');
    expect(wnPos('DOD*')).toBe(null);
  });
});
