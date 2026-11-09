// An author's works from where they are kept: Standard Ebooks' repositories (XHTML, a chapter a file, the spine in
// content.opf) and Project Gutenberg's plain text (by way of GITenberg's mirror on GitHub). Each gives chapters of
// paragraphs, with what kind of paragraph each is.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanText } from '../nlp/tokenize.ts';

export type ParagraphKind = 'prose' | 'letter' | 'verse';

export interface SourceParagraph {
  text: string;
  kind: ParagraphKind;
}
export interface SourceChapter {
  title: string;
  paragraphs: SourceParagraph[];
}
export interface WorkConfig {
  id: string;
  title: string;
  year: number;
  source:
    | { type: 'standardebooks'; repo: string }
    | { type: 'gutenberg'; repo: string; file: string; chapter: string; from?: string; until?: string };
}
export interface AuthorConfig {
  id: string;
  name: string;
  advisor: string;
  short: string;
  years: string;
  /** How the advisor speaks of the author: she / her / her / hers. */
  pronouns?: Pronouns;
  persona: string;
  works: WorkConfig[];
}
export interface Pronouns {
  subject: string;
  object: string;
  possessive: string;
  possessivePronoun: string;
}
export const pronounsOf = (a: { pronouns?: Pronouns }): Pronouns => a.pronouns ?? { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs' };
export const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function readAuthor(root: string, id: string): AuthorConfig {
  return JSON.parse(readFileSync(join(root, 'authors', `${id}.json`), 'utf8')) as AuthorConfig;
}

/** A shallow clone of the work's repository, once. */
export function fetchRepo(repo: string, into: string): string {
  const dir = join(into, repo.replace('/', '__'));
  if (existsSync(join(dir, '.git'))) return dir;
  execFileSync('git', ['clone', '-q', '--depth', '1', `https://github.com/${repo}`, dir], { stdio: 'inherit' });
  return dir;
}

export function readWork(work: WorkConfig, sourcesDir: string): SourceChapter[] {
  const dir = fetchRepo(work.source.repo, sourcesDir);
  return work.source.type === 'standardebooks' ? readStandardEbook(dir) : readGutenberg(dir, work.source);
}

// ---------------------------------------------------------------------------------------------------------------
// Standard Ebooks

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

function inline(html: string): string {
  return cleanText(
    decodeEntities(
      html
        .replace(/<br\s*\/?>/g, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' '),
    ),
  ).trim();
}

export function readStandardEbook(dir: string): SourceChapter[] {
  const epub = join(dir, 'src', 'epub');
  const opf = readFileSync(join(epub, 'content.opf'), 'utf8');
  const spine = [...opf.matchAll(/<itemref[^>]*idref="([^"]+)"/g)].map((m) => m[1]!);
  const files = spine.filter((f) => /^chapter-[\d-]+\.xhtml$/.test(f));
  const chapters: SourceChapter[] = [];
  for (const f of files) chapters.push(...readXhtmlChapters(readFileSync(join(epub, 'text', f), 'utf8')));
  return chapters;
}

/** One file's chapters (a file is usually one chapter). Paragraphs in a blockquote are a letter's; lines a verse's. */
export function readXhtmlChapters(xhtml: string): SourceChapter[] {
  const body = xhtml.slice(xhtml.indexOf('<body'));
  const chapters: SourceChapter[] = [];
  let current: SourceChapter | null = null;
  let quoteDepth = 0;
  let headerDepth = 0;
  const re = /<(\/?)(section|article|blockquote|header|h[1-6]|p|hgroup)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, close, tag, attrs] = m;
    if (tag === 'section' || tag === 'article') {
      if (!close && /epub:type="[^"]*chapter/.test(attrs!)) {
        current = { title: '', paragraphs: [] };
        chapters.push(current);
      }
      continue;
    }
    if (tag === 'blockquote') {
      quoteDepth += close ? -1 : 1;
      continue;
    }
    if (tag === 'header' || tag === 'hgroup') {
      headerDepth += close ? -1 : 1;
      continue;
    }
    if (close) continue;
    const end = body.indexOf(`</${tag}>`, re.lastIndex);
    if (end < 0) continue;
    const inner = body.slice(re.lastIndex, end);
    re.lastIndex = end + tag!.length + 3;
    if (!current) continue;
    if (/^h[1-6]$/.test(tag!)) {
      if (!current.title) current.title = inline(inner);
      continue;
    }
    if (headerDepth > 0) continue;
    const text = inline(inner);
    if (!text) continue;
    const verse = /<span[^>]*>/.test(inner) && /<br\s*\/?>/.test(inner);
    current.paragraphs.push({ text, kind: verse ? 'verse' : quoteDepth > 0 ? 'letter' : 'prose' });
  }
  return chapters.filter((c) => c.paragraphs.length);
}

// ---------------------------------------------------------------------------------------------------------------
// Project Gutenberg plain text

/** The manuscript's and the old printers' marks made plain: M^r → Mr, & → and, _italic_ → italic, -- → —. */
export function plainGutenberg(s: string): string {
  return cleanText(
    s
      .replace(/\^\{([^}]*)\}/g, '$1')
      .replace(/\^(\w+)/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/\[(?:Illustration|Footnote|Sidenote)[^\]]*\]/gi, '')
      .replace(/\[\d+\]/g, '')
      .replace(/ & /g, ' and ')
      .replace(/-{2,}/g, '—')
      .replace(/"([^"]*)"/g, '“$1”')
      .replace(/(\w)'(\w)/g, '$1’$2')
      .replace(/\s+/g, ' '),
  ).trim();
}

export function readGutenberg(
  dir: string,
  src: { file: string; chapter: string; from?: string; until?: string },
): SourceChapter[] {
  const raw = readFileSync(join(dir, src.file), 'utf8').replace(/\r\n/g, '\n');
  let lines = raw.split('\n');
  const startAt = lines.findIndex((l) => /\*\*\* ?START OF/.test(l));
  const endAt = lines.findIndex((l) => /\*\*\* ?END OF/.test(l));
  lines = lines.slice(startAt + 1, endAt > 0 ? endAt : undefined);
  if (src.from) {
    const re = new RegExp(src.from);
    const k = lines.findIndex((l) => re.test(l.trim()));
    if (k >= 0) lines = lines.slice(k);
  }
  if (src.until) {
    const re = new RegExp(src.until);
    const k = lines.findIndex((l) => re.test(l.trim()));
    if (k >= 0) lines = lines.slice(0, k);
  }
  // Paragraphs are separated by blank lines.
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) blocks.push(cur);
  const heading = new RegExp(src.chapter);
  const chapters: SourceChapter[] = [];
  let current: SourceChapter | null = null;
  for (const b of blocks) {
    const one = b.length === 1 ? b[0]!.trim() : null;
    if (one && heading.test(one)) {
      current = { title: one, paragraphs: [] };
      chapters.push(current);
      continue;
    }
    if (!current) continue;
    const text = plainGutenberg(b.join(' '));
    if (!text || /^[\s*.—]+$/.test(text)) continue;
    const indented = b.every((l) => /^\s{2,}/.test(l));
    current.paragraphs.push({ text, kind: indented && b.length > 1 ? 'verse' : 'prose' });
  }
  return chapters.filter((c) => c.paragraphs.length);
}

export function listSourceDirs(sourcesDir: string): string[] {
  return existsSync(sourcesDir) ? readdirSync(sourcesDir) : [];
}
