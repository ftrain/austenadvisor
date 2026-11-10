// A document as the engine reads it: blocks in order, each a title, a heading (a chapter begins), or a paragraph.

export type BlockKind = 'title' | 'heading' | 'paragraph' | 'quote' | 'item' | 'other';

export interface DocBlock {
  kind: BlockKind;
  text: string;
  level?: number;
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

/** Blocks back to plain text, a block a paragraph. */
export function textOfBlocks(blocks: DocBlock[]): string {
  return blocks.map((b) => (b.kind === 'title' ? `# ${b.text}` : b.kind === 'heading' ? `${'#'.repeat(b.level ?? 2)} ${b.text}` : b.text)).join('\n\n');
}
