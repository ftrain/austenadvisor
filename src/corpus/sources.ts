// An author's works from where they are kept: Standard Ebooks' repositories (XHTML, a chapter a file, the spine in
// content.opf) and Project Gutenberg's plain text (by way of GITenberg's mirror on GitHub). Each gives chapters of
// paragraphs, with what kind of paragraph each is.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cleanText } from '../nlp/tokenize.ts';
import { KINDS, type Kind } from '../engine/structure.ts';

export type ParagraphKind = 'prose' | 'letter' | 'verse';

export interface SourceParagraph {
  text: string;
  kind: ParagraphKind;
  /** Its own number where the source gives one (a verse); else its place. */
  n?: number;
}
export interface SourceChapter {
  title: string;
  paragraphs: SourceParagraph[];
  /** Its own number where the source gives one; else its place. */
  n?: number;
}
/**
 * A Standard Ebooks book. Without `files`, every chapter-N file of the spine. With `files`, every spine file whose
 * name matches it (an essay, a story, a book's appendix), each essay, story, letter, speech, article or untitled
 * section a chapter.
 */
export interface StandardEbooksSource {
  type: 'standardebooks';
  repo: string;
  /** Spine files to read, by name: “^(preface|chapter-)”, “^(indian-camp|the-doctor)”. */
  files?: string;
  /** Split each chapter at its scene breaks (<hr/>), each part titled “§ 1”, “§ 2”: for a novel with no chapters. */
  breaks?: boolean;
  /** Title each chapter by this word, its number and the byline in its header: “Federalist” gives “Federalist No. 10 (Madison)”. */
  byline?: string;
  /** Paragraphs that are not the author's text, by their whole text: a salutation, a signature. */
  drop?: string;
}

/** A Project Gutenberg plain text: chapters found by their headings, paragraphs separated by blank lines. */
export interface GutenbergSource {
  type: 'gutenberg';
  repo: string;
  file: string;
  /** A chapter's heading, tested on a block of one line, or of up to `wrap` lines joined by spaces. */
  chapter: string;
  from?: string;
  until?: string;
  titleCase?: boolean;
  /** Headings of front and back matter: their paragraphs belong to no chapter. */
  skip?: string;
  /** Lines of one line that are neither heading nor text: a section's numeral. */
  drop?: string;
  /** A heading may run onto this many lines (“THE DECAY OF LYING: / AN OBSERVATION”). */
  wrap?: number;
  /** A heading stands after at least this many blank lines; a block after fewer is never one. */
  gap?: number;
  /** Whole paragraphs that are not the author's text, tested before the marks are made plain: “^\[\d+\] ” for an editor's note. */
  dropPara?: string;
  /** Chapters whose title matches are letters: their paragraphs are of kind 'letter'. */
  letters?: string;
  /** A speaker's name at the head of a paragraph in a dialogue, removed: “^(CYRIL|VIVIAN)\.\s+”. */
  speakers?: string;
}

/** What a piece in Lincoln's papers is, by its heading. */
export type LincolnPiece = 'speech' | 'letter' | 'telegram' | 'message' | 'writing' | 'state' | 'others';

/**
 * A volume of Lapsley's Papers and Writings of Abraham Lincoln (Project Gutenberg 2653–2659): pieces separated by
 * three blank lines, each a heading, a date line and an addressee, then the text. Pieces are kept by kind.
 */
export interface LincolnSource {
  type: 'lincoln';
  repo: string;
  file: string;
  /** Where Lincoln's own writings begin, after an editor's essays. */
  from?: string;
  /** The kinds of piece kept: by default speeches, letters, messages and other writings; never proclamations and orders. */
  keep?: LincolnPiece[];
  /** A piece shorter than this many words is left out (most telegrams). Default 40. */
  minWords?: number;
}

/** One HTML page kept under data/sources/<file>, fetched from `url` when missing: chapters by heading, paragraphs by <p>. */
export interface HtmlSource {
  type: 'html';
  file: string;
  url: string;
  /** A chapter's heading (h1–h4), by its text: “^(ONE|TWO|THREE|FOUR|FIVE|SIX)$”. Any other heading ends the chapter. */
  chapter: string;
  repo?: undefined;
}

export interface WorkConfig {
  id: string;
  title: string;
  year: number;
  source:
    | StandardEbooksSource
    | GutenbergSource
    | LincolnSource
    | HtmlSource
    /** A local corpus of speeches (data/sources/<file>), one speech a chapter: see scripts/fetch-obama.ts. */
    | { type: 'speeches'; file: string; kind: string; repo?: undefined; url: string }
    /** Project Gutenberg's numbered Bible (ebook 30): every verse "BB:CCC:VVV text"; the work is one book of it. */
    | { type: 'bible'; repo: string; file: string; book: number }
    /** Project Gutenberg's Complete Works of Shakespeare (ebook 100): a play by its title (scenes of speeches), or the sonnets. */
    | { type: 'shakespeare'; repo: string; file: string; title: string }
    /** A play from Standard Ebooks: scenes of speeches, in tables, the speaker in one cell and the speech in the next. */
    | { type: 'seplay'; repo: string };
}

/** Where a work's text came from, as a link. */
export function sourceUrl(work: WorkConfig): string {
  const s = work.source;
  return s.type === 'speeches' || s.type === 'html' ? s.url : `https://github.com/${s.repo}`;
}

/** The four families of voices, in the order the picker shows them. */
export type Family = 'storytellers' | 'speakers' | 'arguers' | 'essayists';
export const FAMILIES: Family[] = ['storytellers', 'speakers', 'arguers', 'essayists'];

/** The kinds of writing a voice may suit: the kinds the engine reads a piece as. */
export type { Kind };

/** Where a voice's texts come from, and why they are free to use. */
export interface License {
  /** The editions: “Standard Ebooks (public domain dedication) and Project Gutenberg”. */
  source: string;
  /** Why the texts are public domain in the US: “Published 1811–1818.” */
  note: string;
  /** 'age': published 1930 or earlier (as of 2026); 'government': a work of the US government. */
  basis: 'age' | 'government';
}

/** The latest year of publication that is public domain in the US in a given year: 1930 in 2026. */
export const usPublicDomainYear = (now = new Date().getFullYear()) => now - 96;
export interface AuthorConfig {
  id: string;
  name: string;
  advisor: string;
  short: string;
  years: string;
  /** How the advisor speaks of the author: she / her / her / hers. */
  pronouns?: Pronouns;
  /** Works not to be linked as a model of the author's manner (a burlesque, an unfinished draft). */
  linkExclude?: string[];
  /** Works told in letters, whose sentences are models for a writer's letter. */
  epistolary?: string[];
  persona: string;
  /** What the voice is, in a line, for the picker. */
  tagline?: string;
  /** A line of the author's own, and where it is, for the picker. */
  epigraph?: { text: string; cite: string };
  /** The button's words: “Austen it up”. */
  action?: string;
  /** How the author is named at the head of a sentence and in the voice picker: “Jane Austen”, “The King James Bible”. */
  title?: string;
  /** The whole corpus, named: “Austen’s complete works”, “the whole of the King James Bible”. */
  whole?: string;
  /** How a sentence is cited: by chapter and paragraph (“Emma, ch. 3, ¶ 12”), or by chapter and verse (“Genesis 1:3”). */
  citeStyle?: 'chapter' | 'verse' | 'speech' | 'play';
  /** A modern noun of the writer's may stand in the rewrite (the King James Bible says “phone”, not “lamp”). */
  keepModern?: boolean;
  /** Scenes of the author's that a writer's passage may echo, for the model to recognise and name. */
  echoes?: string[];
  /** What a full rewrite in the author's manner does, line by line, for the model. */
  manner?: string[];
  /** The author's moves: what a rewrite does in the author's manner, each found in a sentence by its pattern. */
  moves?: Move[];
  /** What a rewrite keeps and avoids, beyond the moves. */
  craftNotes?: string[];
  /** The family the picker lists the voice under. Default: storytellers. */
  family?: Family;
  /** The kinds of writing the voice suits best, for the picker's suggestion. Default: none. */
  goodFor?: Kind[];
  /** Where the texts come from and why they are public domain in the US. */
  license?: License;
  works: WorkConfig[];
}
export interface Move {
  id: string;
  name: string;
  does: string;
  /** A sentence that shows the move matches this (case-insensitive). */
  pattern: string;
  register: 'narration' | 'speech' | 'any';
  /** How to try the move, for a student who has not yet made it: a form to fill, not the definition. “Try ‘not because …, but because …’.” */
  hint?: string;
}
export interface Pronouns {
  subject: string;
  object: string;
  possessive: string;
  possessivePronoun: string;
}
export const pronounsOf = (a: { pronouns?: Pronouns }): Pronouns => a.pronouns ?? { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs' };
export const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
export const familyOf = (a: { family?: Family }): Family => a.family ?? 'storytellers';
export const goodForOf = (a: { goodFor?: Kind[] }): Kind[] => (a.goodFor ?? []).filter((k) => KINDS.includes(k));
/** A move's hint, or, where it has none, what it does. */
export const hintOf = (m: Move): string => m.hint ?? m.does;
const UNKNOWN_LICENSE: License = { source: 'Not recorded', note: 'Not recorded', basis: 'age' };
export const licenseOf = (a: { license?: License }): License => a.license ?? UNKNOWN_LICENSE;

/** The works of an author that are not public domain in the US by age, in the given year. A government work always is. */
export function notPublicDomain(a: AuthorConfig, now?: number): WorkConfig[] {
  if (licenseOf(a).basis === 'government') return [];
  return a.works.filter((w) => w.year > usPublicDomainYear(now));
}

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

/** A file kept under data/sources, downloaded once. */
export function fetchFile(url: string, path: string): string {
  if (existsSync(path)) return path;
  mkdirSync(dirname(path), { recursive: true });
  execFileSync('curl', ['-sSfL', '--max-time', '120', '-o', path, url], { stdio: 'inherit' });
  return path;
}

export function readWork(work: WorkConfig, sourcesDir: string): SourceChapter[] {
  if (work.source.type === 'speeches') return readSpeeches(join(sourcesDir, work.source.file), work.source.kind);
  if (work.source.type === 'html') return readHtml(fetchFile(work.source.url, join(sourcesDir, work.source.file)), work.source);
  const dir = fetchRepo(work.source.repo, sourcesDir);
  if (work.source.type === 'standardebooks') return readStandardEbook(dir, work.source);
  if (work.source.type === 'lincoln') return readLincoln(dir, work.source);
  if (work.source.type === 'bible') return readBibleBook(dir, work.source);
  if (work.source.type === 'shakespeare') return readShakespeare(dir, work.source);
  if (work.source.type === 'seplay') return readStandardEbookPlay(dir);
  return readGutenberg(dir, work.source);
}

// ---------------------------------------------------------------------------------------------------------------
// Project Gutenberg's numbered Bible

const bibles = new Map<string, Map<number, Map<number, { n: number; text: string }[]>>>();

/** Every verse of the file, by book and chapter: "01:001:001 In the beginning…", continued on indented lines. */
export function readBibleFile(path: string): Map<number, Map<number, { n: number; text: string }[]>> {
  const had = bibles.get(path);
  if (had) return had;
  const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  let lines = raw.split('\n');
  const startAt = lines.findIndex((l) => /\*\*\* ?START OF/.test(l));
  const endAt = lines.findIndex((l) => /\*\*\* ?END OF/.test(l));
  lines = lines.slice(startAt + 1, endAt > 0 ? endAt : undefined);
  const books = new Map<number, Map<number, { n: number; text: string }[]>>();
  let cur: { n: number; parts: string[] } | null = null;
  let where: { b: number; c: number } | null = null;
  const flush = () => {
    if (!cur || !where) return;
    const text = plainGutenberg(cur.parts.join(' '));
    if (text) {
      const book = books.get(where.b) ?? new Map();
      books.set(where.b, book);
      const ch = book.get(where.c) ?? [];
      book.set(where.c, ch);
      ch.push({ n: cur.n, text });
    }
    cur = null;
  };
  for (const l of lines) {
    const v = /^(\d{2}):(\d{3}):(\d{3})\s+(.*)$/.exec(l);
    if (v) {
      flush();
      where = { b: Number(v[1]), c: Number(v[2]) };
      cur = { n: Number(v[3]), parts: [v[4]!] };
    } else if (cur && /^\s+\S/.test(l)) cur.parts.push(l.trim());
    else flush();
  }
  flush();
  bibles.set(path, books);
  return books;
}

export function readBibleBook(dir: string, src: { file: string; book: number }): SourceChapter[] {
  const book = readBibleFile(join(dir, src.file)).get(src.book);
  if (!book) return [];
  return [...book.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, verses]) => ({ title: String(c), n: c, paragraphs: verses.map((v) => ({ text: v.text, kind: 'prose' as const, n: v.n })) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Standard Ebooks

/** A Roman numeral's value: “LXXXV” → 85; 0 for anything else. */
export function romanNumber(r: string): number {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const t = r.trim().toUpperCase();
  if (!/^[IVXLCDM]+$/.test(t)) return 0;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const a = v[t[i]!]!;
    const b = v[t[i + 1]!] ?? 0;
    n += a < b ? -a : a;
  }
  return n;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', pound: '£', szlig: 'ß', aelig: 'æ', AElig: 'Æ', oelig: 'œ',
};
const ACCENTS: Record<string, string> = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', tilde: '\u0303', cedil: '\u0327', ring: '\u030a' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    const accent = /^([a-z])(acute|grave|circ|uml|tilde|cedil|ring)$/i.exec(e);
    if (accent) return (accent[1]! + ACCENTS[accent[2]!]!).normalize('NFC');
    return ENTITIES[e] ?? m;
  });
}

/** Straight quotation marks and apostrophes made curly: "it's" → “it’s”. */
export function curlQuotes(s: string): string {
  return s.replace(/"([^"]*)"/g, '“$1”').replace(/(\w)'(\w)/g, '$1’$2');
}

function inline(html: string): string {
  return cleanText(
    decodeEntities(
      html
        // A note's number is not the text: “the most severe<a epub:type="noteref">184</a> regulations”.
        .replace(/<a\b[^>]*epub:type="noteref"[^>]*>[\s\S]*?<\/a>/g, '')
        .replace(/<br\s*\/?>/g, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' '),
    ),
  ).trim();
}

/** Spine files that are never the author's text. */
const SE_MATTER = /^(titlepage|imprint|colophon|uncopyright|endnotes|halftitlepage|loi|toc)\b/;

export function readStandardEbook(dir: string, src: Omit<StandardEbooksSource, 'type' | 'repo'> = {}): SourceChapter[] {
  const epub = join(dir, 'src', 'epub');
  const opf = readFileSync(join(epub, 'content.opf'), 'utf8');
  const spine = [...opf.matchAll(/<itemref[^>]*idref="([^"]+)"/g)].map((m) => m[1]!);
  const keep = src.files ? new RegExp(src.files) : null;
  const files = keep ? spine.filter((f) => f.endsWith('.xhtml') && !SE_MATTER.test(f) && keep.test(f)) : spine.filter((f) => /^chapter-[\d-]+\.xhtml$/.test(f));
  const chapters: SourceChapter[] = [];
  const opts: XhtmlOptions = { any: !!keep, breaks: src.breaks, byline: src.byline, drop: src.drop ? new RegExp(src.drop, 'i') : undefined };
  for (const f of files) chapters.push(...readXhtmlChapters(readFileSync(join(epub, 'text', f), 'utf8'), opts));
  return src.breaks ? chapters.map((c, i) => ({ ...c, n: i + 1 })) : chapters;
}

export interface XhtmlOptions {
  /** An essay, a story, a letter, a speech, an article or a section of no type is a chapter, as well as a chapter. */
  any?: boolean;
  /** A scene break (<hr/>) starts a new chapter, titled “§ 2”. */
  breaks?: boolean;
  /** Title a chapter by this word, its number and its header's byline: “Federalist No. 10 (Madison)”. */
  byline?: string;
  /** Paragraphs that are not the author's text, by their whole text. */
  drop?: RegExp;
}

const SE_CHAPTER = /epub:type="[^"]*chapter/;
const SE_ANY = /epub:type="[^"]*(chapter|z3998:essay|se:short-story|se:novella|z3998:letter|z3998:speech|z3998:article|z3998:fiction)/;

/** One file's chapters (a file is usually one chapter). Paragraphs in a blockquote are a letter's; lines a verse's. */
export function readXhtmlChapters(xhtml: string, opts: XhtmlOptions = {}): SourceChapter[] {
  const body = xhtml.slice(xhtml.indexOf('<body'));
  const chapters: SourceChapter[] = [];
  let current: SourceChapter | null = null;
  let quoteDepth = 0;
  let headerDepth = 0;
  let part = 0;
  let depth = 0;
  const re = /<(\/?)(section|article|blockquote|header|h[1-6]|p|hgroup|hr)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, close, tag, attrs] = m;
    if (tag === 'section' || tag === 'article') {
      if (close) {
        depth--;
        continue;
      }
      // With `any`, a file's outermost division is a chapter whatever its type (a preface, an appendix).
      const typed = /epub:type="/.test(attrs!);
      if (SE_CHAPTER.test(attrs!) || (opts.any && (depth === 0 || SE_ANY.test(attrs!) || !typed))) {
        current = { title: '', paragraphs: [] };
        chapters.push(current);
        part = 1;
      }
      depth++;
      continue;
    }
    if (tag === 'hr') {
      if (opts.breaks && current && current.paragraphs.length) {
        current = { title: `§ ${++part}`, paragraphs: [] };
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
      if (!current.title) current.title = opts.breaks ? '§ 1' : inline(inner);
      if (opts.byline) {
        const n = /z3998:roman/.test(attrs!) ? romanNumber(inline(inner)) : Number(inline(inner));
        if (n) current.n = n;
      }
      continue;
    }
    if (headerDepth > 0) {
      if (opts.byline && /se:bridgehead/.test(attrs!)) {
        const who = inline(inner).split(':')[0]!.trim();
        current.title = `${opts.byline} No. ${current.n ?? chapters.length}${who ? ` (${who})` : ''}`;
      }
      continue;
    }
    const text = inline(inner);
    if (!text || opts.drop?.test(text)) continue;
    if (opts.breaks && !current.title) current.title = '§ 1';
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
    curlQuotes(
      s
        .replace(/\^\{([^}]*)\}/g, '$1')
        .replace(/\^(\w+)/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/\[(?:Illustration|Footnote|Sidenote)[^\]]*\]/gi, '')
        .replace(/\[\d+\]/g, '')
        // A page's number in the margin: “{353}”.
        .replace(/\{\d+\}/g, '')
        .replace(/ & /g, ' and ')
        .replace(/-{2,}/g, '—'),
    ).replace(/\s+/g, ' '),
  ).trim();
}

/** A title set in title case on a line of its own: “The Cat’s Elopement.”, “How the Dragon was Tricked”, “_Madschun_”. */
export function isTitleLine(line: string): boolean {
  const t = line.trim().replace(/^_|_\.?$/g, '').replace(/\.$/, '');
  if (!t || t.length > 80 || /[!?;:“”"]|\s{3,}\d+$/.test(line) || !/^[A-Z]/.test(t)) return false;
  const ws = t.split(/\s+/);
  if (ws.length > 12) return false;
  const small = /^(a|an|and|as|at|but|by|for|from|in|into|of|on|or|the|to|was|who|with|is|that|his|her|its|their)$/i;
  return ws.every((w, i) => (i > 0 && small.test(w)) || /^[A-Z0-9(‘'"]/.test(w));
}

/** The lines of a Gutenberg text between its START and END marks, and between `from` and `until`. */
function gutenbergLines(dir: string, src: { file: string; from?: string; until?: string }): string[] {
  const raw = readFileSync(join(dir, src.file), 'utf8').replace(/\r\n/g, '\n');
  let lines = raw.split('\n');
  const startAt = lines.findIndex((l) => /\*\*\* ?START OF/.test(l));
  const endAt = lines.findIndex((l, i) => i > startAt && (/\*\*\* ?END OF/.test(l) || /^End of (the )?Project Gutenberg/i.test(l)));
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
  return lines;
}

/** A chapter's first word set in capitals by the printer made plain: “TO go into solitude” → “To go into solitude”. */
export function plainOpening(s: string): string {
  return s.replace(/^([“"‘']?)([A-Z])([A-Z’']+)(?= [a-z]| [A-Z][a-z])/, (_m, q: string, a: string, rest: string) => q + a + rest.toLowerCase());
}

/** Blocks of lines separated by blank lines, each with the number of blank lines before it. */
function gutenbergBlocks(lines: string[]): { lines: string[]; gap: number }[] {
  const blocks: { lines: string[]; gap: number }[] = [];
  let cur: string[] = [];
  let blank = 99;
  let gap = 99;
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) blocks.push({ lines: cur, gap });
      if (cur.length) blank = 0;
      cur = [];
      blank++;
    } else {
      if (!cur.length) gap = blank;
      cur.push(l);
    }
  }
  if (cur.length) blocks.push({ lines: cur, gap });
  return blocks;
}

export function readGutenberg(dir: string, src: Omit<GutenbergSource, 'type' | 'repo'>): SourceChapter[] {
  const blocks = gutenbergBlocks(gutenbergLines(dir, src));
  const heading = new RegExp(src.chapter);
  const skip = src.skip ? new RegExp(src.skip, 'i') : null;
  // Lines that are neither a heading nor the text: an editor's note of where a tale came from, a section's numeral.
  const drop = src.drop ? new RegExp(src.drop, 'i') : null;
  const dropPara = src.dropPara ? new RegExp(src.dropPara) : null;
  const letters = src.letters ? new RegExp(src.letters, 'i') : null;
  const speakers = src.speakers ? new RegExp(src.speakers) : null;
  const wrap = src.wrap ?? 1;
  const chapters: SourceChapter[] = [];
  let current: SourceChapter | null = null;
  // A dropped line's blank lines count for the block after it: “I” between a gap and its essay's title.
  let carried = 0;
  for (const b of blocks) {
    const gap = Math.max(b.gap, carried);
    carried = 0;
    const tight = b.lines.map((l) => l.trim());
    // A title set beside its source, wide apart (“The Magic Mirror        From the Senna”), is the title.
    const one = b.lines.length === 1 ? b.lines[0]!.trim().replace(/\s{3,}\S.*$/, '') : null;
    const joined = b.lines.length <= wrap ? tight.join(' ') : null;
    if (one && drop?.test(one.replace(/^_|_$/g, ''))) {
      carried = gap;
      continue;
    }
    // Front and back matter named by a heading of its own: its paragraphs are no one's chapter.
    if (one && skip?.test(one.replace(/^_|_$/g, ''))) {
      current = null;
      continue;
    }
    const head = one ?? joined;
    const isHead =
      head !== null &&
      gap >= (src.gap ?? 0) &&
      (heading.test(head) || (joined !== null && heading.test(tight[0]!)) || (!!one && !!src.titleCase && isTitleLine(one)));
    if (isHead) {
      if (skip?.test(head.replace(/^_|_$/g, ''))) {
        current = null;
        continue;
      }
      current = { title: headingTitle(head), paragraphs: [] };
      chapters.push(current);
      continue;
    }
    if (!current) continue;
    if (dropPara?.test(tight.join(' '))) continue;
    let raw = b.lines.join(' ');
    if (speakers) raw = raw.trim().replace(speakers, '');
    const text = plainGutenberg(raw);
    if (!text || /^[\s*.—]+$/.test(text)) continue;
    const indented = b.lines.every((l) => /^\s{2,}/.test(l));
    const kind: ParagraphKind = indented && b.lines.length > 1 ? 'verse' : letters?.test(current.title) ? 'letter' : 'prose';
    current.paragraphs.push({ text: current.paragraphs.length ? text : plainOpening(text), kind });
  }
  return chapters.filter((c) => c.paragraphs.length);
}

/** A heading as a chapter's title: “_The Pastons and Chaucer_[1]” → “The Pastons and Chaucer”. */
function headingTitle(h: string): string {
  return h
    .replace(/\[\d+\]/g, '')
    .replace(/_/g, '')
    .replace(/[.:]$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Lincoln: Lapsley's Papers and Writings

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i;

/** “NOVEMBER 19, 1863.” → “19 November 1863”; null where the text holds no date. */
export function lincolnDate(s: string): string | null {
  const m = DATE.exec(s);
  if (!m) return null;
  const k = MONTH_NAMES.findIndex((n) => n.startsWith(m[1]!.toLowerCase().slice(0, 3)));
  return k < 0 ? null : `${Number(m[2])} ${cap(MONTH_NAMES[k]!)} ${m[3]}`;
}

/** What a piece is, by its heading. */
export function lincolnPiece(heading: string): LincolnPiece {
  const h = heading.toUpperCase();
  if (/^MR\. LINCOLN TO /.test(h)) return 'letter';
  // Others' words printed among his: letters to him, Douglas's and Seward's letters, Campbell's reply, an interview.
  if (/\bTO (MR\.|A\.|ABRAHAM|PRESIDENT) LINCOLN|^MR\. \S+ TO |^(LETTER |MEMORANDUM )?FROM |\bBY (SENATOR )?DOUGLAS\b|^(?!MR\. LINCOLN)[A-Z.]+'S (REPLY|SPEECH|LETTER|ANSWER)|^(INTERROGATORIES|INTERVIEW)/.test(h)) return 'others';
  if (/^TELEGRAM/.test(h)) return 'telegram';
  if (/^(PROCLAMATION|(EXECUTIVE |PRESIDENT'S (GENERAL |SPECIAL )?(WAR )?)?ORDER|INDORSEMENT|ENDORSEMENT|PASS\b|CALL FOR|AN ACT|DRAFT OF|BY THE PRESIDENT)/.test(h)) return 'state';
  if (/^(SPEECH|ADDRESS|REPLY|REMARKS|RESPONSE|FRAGMENT OF (A )?SPEECH|EULOGY|LECTURE|(FIRST |SECOND )?INAUGURAL|FAREWELL|MR\. LINCOLN'S|LAST PUBLIC|.*\bDEBATE\b)/.test(h)) return 'speech';
  if (/^(ANNUAL |SPECIAL )?MESSAGE/.test(h)) return 'message';
  if (/^(TO|LETTER)\b/.test(h)) return 'letter';
  return 'writing';
}

const caps = (s: string, share = 0.75) => {
  const l = s.replace(/[^A-Za-z]/g, '');
  return l.length > 0 && l.replace(/[^A-Z]/g, '').length / l.length >= share;
};
/** A heading's, date line's or addressee's block: mostly in capitals, or a date, or a note in parentheses, and short. */
const lincolnFront = (s: string) => s.length < 220 && (caps(s, 0.6) || (s.length < 110 && DATE.test(s) && !/[a-z]{3,}.*[.!?]\s+\S/.test(s)) || /^\(.*\)\.?$/.test(s));
/** A speech named inside a longer heading: “POLITICAL SPEECHES & DEBATES … SPEECH AT SPRINGFIELD, JUNE 17, 1858”. */
const NAMED_SPEECH = /\b(SPEECH|ADDRESS) (AT|IN|TO|BEFORE|ON)\b/;
/** A letter's closing and signature, a note set in brackets or parentheses, or an editor's line about the piece. */
const LINCOLN_CLOSE = /^(\[[\s\S]*\]\.?|\([^)]*\)\.?|(A\. |ABRAHAM )?LINCOLN\.?|(Yours|Your obt|Your obedient|Your friend|Your sincere|Respectfully|Very respectfully|Most respectfully|Very truly|Truly|As ever|I am,? (sir|very)|I subscribe)[\s\S]{0,90}|A Proclamation\.?|(Done|Given) at the city of[\s\S]*|(Private|Confidential|Private and confidential)\.?|(The following|Mr\. Lincoln|Lincoln[’']s|In the House of Representatives)\b[\s\S]*)$/i;
/** A closing and signature run on at the end of the last paragraph. */
const SIGNED = /(\s+(A\. |ABRAHAM )?LINCOLN\.?|\s+A\. L\.|\s+Sincerely\b[^.!?]{0,40}|\s+((Yours|Your friend|Your obedient|Your obt|Your sincere|As ever|Very truly|Truly|Respectfully|Very respectfully|Most respectfully|I am,? (sir|very))[^.!?]{0,80}|Yours,? etc\.,?))+$/i;
/** A salutation at the head of a letter's first paragraph, in capitals: “MY DEAR SIR:--”, “FELLOW-CITIZENS:--”. */
const SALUTATION = /^([A-Z][A-Za-z.,' -]{0,120}?)(?::\s*-*|—|--)\s*/;

const titleWord = (w: string, i: number) => {
  if (/^([A-Z]\.)+[,;:]?$/.test(w) || /^[IVX]+\.?,?$/.test(w)) return w;
  const l = w.toLowerCase();
  if (i > 0 && /^(a|an|and|as|at|but|by|for|from|in|into|of|on|or|the|to|with|over|upon)$/.test(l)) return l;
  return l.replace(/^(\W*)(\w)/, (_m, p: string, c: string) => p + c.toUpperCase()).replace(/-(\w)/g, (_m, c: string) => '-' + c.toUpperCase());
};

/** “SPEECH AT CHICAGO, JULY 10, 1858.” → “Speech at Chicago, 10 July 1858”. */
export function lincolnTitle(heading: string, date: string | null): string {
  const bare = heading
    .replace(DATE, '')
    .replace(/[\s,.;:—-]+$/, '')
    .replace(/--/g, ': ')
    .trim();
  const t = bare.split(/\s+/).map(titleWord).join(' ');
  return date ? `${t}, ${date}` : t;
}

/** One volume of Lincoln's papers: each piece a chapter, kept by kind. */
export function readLincoln(dir: string, src: Omit<LincolnSource, 'type' | 'repo'>): SourceChapter[] {
  const lines = gutenbergLines(dir, src);
  const keep = new Set<LincolnPiece>(src.keep ?? ['speech', 'letter', 'message', 'writing']);
  const minWords = src.minWords ?? 40;
  const pieces: string[][] = [[]];
  let blank = 0;
  for (const l of lines) {
    if (l.trim() === '') blank++;
    else {
      if (blank >= 3 && pieces.at(-1)!.length) pieces.push([]);
      if (blank >= 1 && pieces.at(-1)!.length) pieces.at(-1)!.push('');
      blank = 0;
      pieces.at(-1)!.push(l);
    }
  }
  const chapters: SourceChapter[] = [];
  for (const piece of pieces) {
    const blocks = piece
      .join('\n')
      .split(/\n\n+/)
      .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean).join(' '))
      .filter(Boolean);
    if (!blocks.length) continue;
    // The heading may wrap onto a second block (“REPLY TO ADDRESS OF WELCOME, INDIANAPOLIS,” / “INDIANA, FEBRUARY 11, 1861”).
    let k = 0;
    const front: string[] = [];
    while (k < blocks.length && lincolnFront(blocks[k]!)) front.push(blocks[k++]!);
    if (!front.length) continue;
    // The heading is the first front block that names a speech, a letter or a message; else the first.
    const at = Math.max(0, front.findIndex((b) => lincolnPiece(b) !== 'writing' || NAMED_SPEECH.test(b)));
    let heading = front[at]!;
    const named = heading.search(NAMED_SPEECH);
    if (named > 0) heading = heading.slice(named);
    if (/,$/.test(heading) && front[at + 1]) heading = `${heading} ${front[at + 1]}`;
    // An editor's caption may stand above the letter's own heading: “ON PROTECTIVE TARIFFS” / “TO EDWARD WALLACE.”
    const kinds = front.slice(0, 3).map(lincolnPiece);
    let kind = lincolnPiece(heading);
    if (kinds.includes('others')) kind = 'others';
    if (!keep.has(kind)) continue;
    const paragraphs: SourceParagraph[] = [];
    for (const b of blocks.slice(k)) {
      if (LINCOLN_CLOSE.test(b) || (b.length < 120 && caps(b)) || (b.length < 80 && DATE.test(b) && !/[a-z]{3,} [a-z]{3,}/.test(b))) continue;
      // An addressee: “A. G. HODGES, ESQ., Frankfort, Kentucky:”, “MRS. BIXBY, Boston, Massachusetts.”
      if (b.length < 100 && caps(b.split(',')[0]!) && /[:.]$/.test(b) && !/[a-z]{2,}[.!?] /.test(b)) continue;
      let t = b.replace(/\s*\[[^\]]*\]/g, '').replace(SIGNED, '');
      const sal = SALUTATION.exec(t);
      if (sal && caps(sal[1]!)) t = t.slice(sal[0].length);
      t = t.replace(/^(My )?dear [^,:—-]{1,40}(?:[,:]\s*-*|—|--)\s*/i, '');
      const text = plainGutenberg(t);
      if (text && /\p{L}/u.test(text)) paragraphs.push({ text, kind: kind === 'letter' || kind === 'telegram' ? 'letter' : 'prose' });
    }
    const words = paragraphs.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
    if (!paragraphs.length || words < minWords) continue;
    const date = lincolnDate(heading) ?? lincolnDate(front.join(' '));
    chapters.push({ title: lincolnTitle(heading, date), paragraphs });
  }
  return chapters;
}

// ---------------------------------------------------------------------------------------------------------------
// One HTML page

/** Chapters of one HTML page: a heading matching `chapter` starts one, any other heading ends it. Notes in brackets go. */
export function readHtml(path: string, src: { chapter: string }): SourceChapter[] {
  const buf = readFileSync(path);
  const head = buf.subarray(0, 4096).toString('latin1');
  const charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase() ?? 'utf-8';
  const html = new TextDecoder(charset === 'utf-8' || charset === 'utf8' ? 'utf-8' : 'windows-1252').decode(buf);
  const body = html.slice(Math.max(0, html.search(/<body/i)));
  const heading = new RegExp(src.chapter);
  const chapters: SourceChapter[] = [];
  let current: SourceChapter | null = null;
  for (const m of body.matchAll(/<(h[1-4]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = curlQuotes(inline(m[2]!.replace(/\[[^\]]*\]/g, ' ')));
    if (/^h/i.test(m[1]!)) {
      current = text && heading.test(text) ? { title: text, paragraphs: [] } : null;
      if (current) chapters.push(current);
      continue;
    }
    if (current && text && /\p{L}/u.test(text)) current.paragraphs.push({ text, kind: 'prose' });
  }
  return chapters.filter((c) => c.paragraphs.length).map((c, i) => ({ ...c, n: i + 1 }));
}

// ---------------------------------------------------------------------------------------------------------------
// Shakespeare: Project Gutenberg's Complete Works

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15 };
const roman = (r: string) => ROMAN[r.toUpperCase()] ?? (Number(r) || 0);

/**
 * A Standard Ebooks play: each scene a chapter (“3.1”; a prologue or epilogue by its name), each speech a paragraph,
 * without the speaker's name or the stage directions.
 */
export function readStandardEbookPlay(dir: string): SourceChapter[] {
  const epub = join(dir, 'src', 'epub');
  const opf = readFileSync(join(epub, 'content.opf'), 'utf8');
  const spine = [...opf.matchAll(/<itemref[^>]*idref="([^"]+)"/g)].map((m) => m[1]!);
  const skip = /^(titlepage|imprint|dramatis-personae|colophon|uncopyright|endnotes|halftitlepage|loi|dedication|epigraph|preface|introduction|note)/;
  const chapters: SourceChapter[] = [];
  for (const f of spine.filter((f) => f.endsWith('.xhtml') && !skip.test(f))) {
    const html = readFileSync(join(epub, 'text', f), 'utf8');
    const starts = [...html.matchAll(/<section id="([^"]+)"[^>]*epub:type="[^"]*z3998:scene[^"]*"/g)].map((m) => ({ id: m[1]!, at: m.index! }));
    const parts = starts.length ? starts.map((s, i) => ({ id: s.id, html: html.slice(s.at, starts[i + 1]?.at ?? html.length) })) : [{ id: f.replace(/\.xhtml$/, ''), html }];
    for (const p of parts) {
      const sc = /scene-(\d+)-(\d+)/.exec(p.id);
      const title = sc ? `${sc[1]}.${sc[2]}` : p.id.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
      const paragraphs: SourceParagraph[] = [];
      for (const row of p.html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row[1]!.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
        const at = cells.findIndex((c) => /z3998:persona/.test(c[1]!));
        const speech = at >= 0 ? cells[at + 1] : undefined;
        if (!speech) continue;
        const text = inline(speech[2]!.replace(/<i[^>]*z3998:stage-direction[^>]*>[\s\S]*?<\/i>/g, ' '));
        if (text && /\p{L}/u.test(text)) paragraphs.push({ text, kind: /z3998:verse/.test(speech[1]!) ? 'verse' : 'prose' });
      }
      if (paragraphs.length) chapters.push({ title, paragraphs });
    }
  }
  return chapters.map((c, i) => ({ ...c, n: i + 1 }));
}

/** One play, as scenes of speeches (the speaker's name and the stage directions left out), or the sonnets, one a chapter. */
export function readShakespeare(dir: string, src: { file: string; title: string }): SourceChapter[] {
  const lines = readFileSync(join(dir, src.file), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const end = lines.findIndex((l) => /\*\*\* ?END OF/.test(l));
  // A work's title stands at the head of its line; in the contents it is indented.
  const titles = new Set(lines.slice(0, 200).filter((l) => /^\s{6,}[A-Z]/.test(l)).map((l) => l.trim()));
  const start = lines.findIndex((l, i) => i > 30 && l.trim() === src.title && !/^\s/.test(l));
  if (start < 0) return [];
  let stop = lines.findIndex((l, i) => i > start && !/^\s/.test(l) && titles.has(l.trim()) && l.trim() !== src.title);
  if (stop < 0) stop = end > 0 ? end : lines.length;
  const body = lines.slice(start + 1, stop);
  const clean = (t: string) => plainGutenberg(t.replace(/\[[^\]]*\]/g, ' ').replace(/_([^_]*)_/g, '$1'));
  const chapters: SourceChapter[] = [];

  if (/SONNETS/.test(src.title)) {
    let cur: { n: number; lines: string[] } | null = null;
    const close = () => {
      if (cur && cur.lines.length) chapters.push({ title: `Sonnet ${cur.n}`, n: cur.n, paragraphs: [{ text: clean(cur.lines.join(' ')), kind: 'verse' }] });
      cur = null;
    };
    for (const l of body) {
      const num = /^\s{8,}(\d+)\s*$/.exec(l);
      if (num) {
        close();
        cur = { n: Number(num[1]), lines: [] };
      } else if (cur && l.trim()) cur.lines.push(l.trim());
    }
    close();
    return chapters;
  }

  let act = 0;
  let scene: SourceChapter | null = null;
  let speech: string[] = [];
  const flush = () => {
    if (scene && speech.length) {
      const text = clean(speech.join(' '));
      if (text && /\p{L}/u.test(text)) scene.paragraphs.push({ text, kind: speech.length > 1 ? 'verse' : 'prose' });
    }
    speech = [];
  };
  for (const raw of body) {
    const l = raw.replace(/\s+$/, '');
    const a = /^ACT ([IVX]+)\b/.exec(l);
    if (a) {
      flush();
      act = roman(a[1]!);
      continue;
    }
    const sc = /^SCENE ([IVX]+)\b/.exec(l);
    const set = /^(PROLOGUE|EPILOGUE|INDUCTION)\.?$/.exec(l);
    if (sc || set) {
      flush();
      scene = { title: sc ? `${act || 1}.${roman(sc[1]!)}` : set![1]![0] + set![1]!.slice(1).toLowerCase(), paragraphs: [] };
      chapters.push(scene);
      continue;
    }
    if (!l.trim()) {
      flush();
      continue;
    }
    // A stage direction: set in from the margin, or in brackets.
    if (/^\s/.test(l) || /^\[/.test(l)) continue;
    // A speaker's name, in capitals, perhaps with the first words of the speech after it.
    const who = /^([A-Z][A-Z0-9 ,’'&\-]{1,40})\.(?:\s+(.*))?$/.exec(l);
    if (who && who[1] === who[1]!.toUpperCase()) {
      flush();
      if (who[2]) speech.push(who[2]);
      continue;
    }
    if (scene) speech.push(l);
  }
  flush();
  return chapters.filter((c) => c.paragraphs.length).map((c, i) => ({ ...c, n: i + 1 }));
}

// ---------------------------------------------------------------------------------------------------------------
// Speeches kept locally

interface Speech {
  kind: string;
  title: string;
  date: string;
  url: string;
  paragraphs: string[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** “Remarks by the President at Howard University Commencement Ceremony” → “Howard University Commencement Ceremony”. */
export function speechTitle(s: { kind: string; title: string; date: string }): string {
  const [y, m, d] = s.date.split('-').map(Number);
  const when = `${d} ${MONTHS[m! - 1]} ${y}`;
  if (s.kind === 'weekly') return `Weekly Address, ${when}`;
  let t = s.title
    .replace(/\s*\|.*$/, '')
    .replace(/\*?As (Prepared for Delivery|Delivered)\*?/gi, '')
    .replace(/^(Remarks|Address)( of| by)?( the)? President( Barack)?( Obama)?( –)?\s*/i, '')
    .replace(/^(at|in|on|to)\s+(the\s+)?/i, '')
    .replace(/^(Barack Obama’s|President Barack Obama’s)\s+/i, '')
    .replace(/\s+(by|of) the President$/i, '')
    .replace(/\s+–\s*$/, '')
    .trim();
  t = t ? t[0]!.toUpperCase() + t.slice(1) : 'Address';
  return `${t}, ${when}`;
}

/** The President's own: not the Vice President's, the First Lady's, Dr. Biden's or an ambassador's, nor an announcement. */
const NOT_HIS = /Vice President|Jill Biden|Joe Biden|Dr\. Biden|Ambassador|First Lady|Susan E\. Rice|Excerpts|Announces|Town Hall|Luncheon|Inaugural Ball|Meeting with|Delegation/i;
/** A press office's summary of an address, not the address. */
const SUMMARY = /In this week[’']s address|The (full )?audio (and video )?of the address|can be viewed online|will be available online|\bthe President (urged|said|discussed|highlighted|called|reflected|vowed|announced|noted|emphasized|praised|outlined|laid out|spoke)\b|^[A-Z][A-Z ,.]+\s[–—-]\s/;

export function readSpeeches(path: string, kind: string): SourceChapter[] {
  if (!existsSync(path)) throw new Error(`No speeches at ${path}: run node scripts/fetch-obama.ts`);
  const all = JSON.parse(readFileSync(path, 'utf8')) as Speech[];
  return all
    .filter((s) => s.kind === kind && !NOT_HIS.test(s.title))
    .map((s) => ({ title: speechTitle(s), paragraphs: s.paragraphs.filter((p) => !SUMMARY.test(p)).map((p) => ({ text: cleanText(p), kind: 'prose' as const })) }))
    .filter((c) => c.paragraphs.length >= 3);
}

export function listSourceDirs(sourcesDir: string): string[] {
  return existsSync(sourcesDir) ? readdirSync(sourcesDir) : [];
}
