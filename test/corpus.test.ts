import { describe, expect, it } from 'vitest';
import { plainGutenberg, readXhtmlChapters } from '../src/corpus/sources.ts';
import { blocksOfText, blocksOfTlo, tloOfBlocks } from '../src/engine/doc.ts';

describe('Standard Ebooks', () => {
  it('reads a chapter, its letters and its verse', () => {
    const x = `<html><body><section id="chapter-3" epub:type="chapter"><h2 epub:type="ordinal">III</h2>
      <p>It was <abbr epub:type="z3998:name-title">Mr.</abbr> Darcy&#x2019;s.</p>
      <blockquote><p>My dear Lizzy,</p></blockquote>
      <p><span>A line</span><br/><span>Another</span></p></section></body></html>`;
    const [ch] = readXhtmlChapters(x);
    expect(ch!.title).toBe('III');
    expect(ch!.paragraphs).toEqual([
      { text: 'It was Mr. Darcy’s.', kind: 'prose' },
      { text: 'My dear Lizzy,', kind: 'letter' },
      { text: 'A line Another', kind: 'verse' },
    ]);
  });
});

describe('Project Gutenberg', () => {
  it('makes the manuscript’s marks plain', () => {
    expect(plainGutenberg('M^r Parker & _his_ wife--"no," said she')).toBe('Mr Parker and his wife—“no,” said she');
  });
});

describe('documents', () => {
  it('goes from text to TLO and back, chapters and all', () => {
    const blocks = blocksOfText('# A Title\n\nChapter 1\n\nIt was *odd*, she said.\n\nA second paragraph.');
    expect(blocks.map((b) => b.kind)).toEqual(['title', 'heading', 'paragraph', 'paragraph']);
    const tlo = tloOfBlocks(blocks, 'A Title');
    expect(blocksOfTlo(tlo)).toEqual(blocks);
  });
});
