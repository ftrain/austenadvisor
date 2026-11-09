// A document as the engine reads it: blocks in order, each a title, a heading (a chapter begins), or a paragraph,
// with its words as the Word Processor counts them, so a place the engine names is a place in the editor.

import { hasClass, isText, parse, write, type Block, type Doc } from 'tinylittleoffice/doc';

export type BlockKind = 'title' | 'heading' | 'paragraph' | 'quote' | 'item' | 'other';

export interface DocBlock {
  kind: BlockKind;
  text: string;
  level?: number;
}

/** The kit's textOf: a text block's runs, an icon or a footnote counted as one character. */
export function blockText(b: Block): string {
  return isText(b) ? b.runs.map((r) => (r.ic || r.fn !== undefined ? '￼' : r.t)).join('') : '';
}

export function blocksOfTlo(tlo: string): DocBlock[] {
  return parse(tlo).blocks.map((b) => {
    const text = blockText(b);
    if (b.k === 'h') return hasClass(b, 'title') ? { kind: 'title', text, level: 1 } : { kind: 'heading', text, level: b.level };
    if (b.k === 'p') return { kind: 'paragraph', text };
    if (b.k === 'quote') return { kind: 'quote', text };
    if (b.k === 'li') return { kind: 'item', text };
    return { kind: 'other', text };
  });
}

/** Plain text: paragraphs by blank lines; "# …" and "Chapter …" lines are headings. */
export function blocksOfText(text: string): DocBlock[] {
  const out: DocBlock[] = [];
  for (const chunk of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const t = chunk.trim();
    if (!t) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) out.push({ kind: h[1]!.length === 1 && !out.length ? 'title' : 'heading', text: h[2]!, level: h[1]!.length });
    else if (/^(chapter|letter|part|book)\b[^.!?\n]{0,40}$/i.test(t)) out.push({ kind: 'heading', text: t, level: 2 });
    else out.push({ kind: 'paragraph', text: t.replace(/\s*\n\s*/g, ' ') });
  }
  return out;
}

/** Plain text and TLO alike back to text, a block a paragraph. */
export function textOfBlocks(blocks: DocBlock[]): string {
  return blocks.map((b) => (b.kind === 'title' ? `# ${b.text}` : b.kind === 'heading' ? `${'#'.repeat(b.level ?? 2)} ${b.text}` : b.text)).join('\n\n');
}

/** A document's text as TLO for the Word Processor, written by the kernel itself. */
export function tloOfBlocks(blocks: DocBlock[], title?: string): string {
  const runs = (t: string) => (t ? [{ t }] : []);
  const out: Block[] = blocks.map((b): Block => {
    if (b.kind === 'title') return { k: 'h', level: 1, runs: runs(b.text), a: { cls: ['title'] } };
    if (b.kind === 'heading') return { k: 'h', level: Math.min(6, Math.max(2, b.level ?? 2)) as 2, runs: runs(b.text) };
    if (b.kind === 'quote') return { k: 'quote', runs: runs(b.text) };
    if (b.kind === 'item') return { k: 'li', depth: 0, runs: runs(b.text) };
    return { k: 'p', runs: runs(b.text) };
  });
  return write({ head: title ? { title } : {}, blocks: out } as Doc);
}
