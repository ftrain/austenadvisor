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
  /** Its own number where the source gives one (a verse); else its place. */
  n?: number;
}
export interface SourceChapter {
  title: string;
  paragraphs: SourceParagraph[];
  /** Its own number where the source gives one; else its place. */
  n?: number;
}
export interface WorkConfig {
  id: string;
  title: string;
  year: number;
  source:
    | { type: 'standardebooks'; repo: string }
    | { type: 'gutenberg'; repo: string; file: string; chapter: string; from?: string; until?: string; titleCase?: boolean; skip?: string; drop?: string }
    /** A local corpus of speeches (data/sources/<file>), one speech a chapter: see scripts/fetch-obama.ts. */
    | { type: 'speeches'; file: string; kind: string; repo?: undefined; url: string }
    /** Project Gutenberg's numbered Bible (ebook 30): every verse "BB:CCC:VVV text"; the work is one book of it. */
    | { type: 'bible'; repo: string; file: string; book: number }
    /** Project Gutenberg's Complete Works of Shakespeare (ebook 100): a play by its title (scenes of speeches), or the sonnets. */
    | { type: 'shakespeare'; repo: string; file: string; title: string }
    /** A play from Standard Ebooks: scenes of speeches, in tables, the speaker in one cell and the speech in the next. */
    | { type: 'seplay'; repo: string };
}
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
  works: WorkConfig[];
}
export interface Move {
  id: string;
  name: string;
  does: string;
  /** A sentence that shows the move matches this (case-insensitive). */
  pattern: string;
  register: 'narration' | 'speech' | 'any';
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
  if (work.source.type === 'speeches') return readSpeeches(join(sourcesDir, work.source.file), work.source.kind);
  const dir = fetchRepo(work.source.repo, sourcesDir);
  if (work.source.type === 'standardebooks') return readStandardEbook(dir);
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

/** A title set in title case on a line of its own: “The Cat’s Elopement.”, “How the Dragon was Tricked”, “_Madschun_”. */
export function isTitleLine(line: string): boolean {
  const t = line.trim().replace(/^_|_\.?$/g, '').replace(/\.$/, '');
  if (!t || t.length > 80 || /[!?;:“”"]|\s{3,}\d+$/.test(line) || !/^[A-Z]/.test(t)) return false;
  const ws = t.split(/\s+/);
  if (ws.length > 12) return false;
  const small = /^(a|an|and|as|at|but|by|for|from|in|into|of|on|or|the|to|was|who|with|is|that|his|her|its|their)$/i;
  return ws.every((w, i) => (i > 0 && small.test(w)) || /^[A-Z0-9(‘'"]/.test(w));
}

export function readGutenberg(
  dir: string,
  src: { file: string; chapter: string; from?: string; until?: string; titleCase?: boolean; skip?: string; drop?: string },
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
  const skip = src.skip ? new RegExp(src.skip, 'i') : null;
  // Lines that are neither a heading nor the text: an editor's note of where a tale came from, a section's numeral.
  const drop = src.drop ? new RegExp(src.drop, 'i') : null;
  const chapters: SourceChapter[] = [];
  let current: SourceChapter | null = null;
  for (const b of blocks) {
    // A title set beside its source, wide apart (“The Magic Mirror        From the Senna”), is the title.
    const one = b.length === 1 ? b[0]!.trim().replace(/\s{3,}\S.*$/, '') : null;
    if (one && drop?.test(one.replace(/^_|_$/g, ''))) continue;
    // Front and back matter named by a heading of its own: its paragraphs are no one's chapter.
    if (one && skip?.test(one.replace(/^_|_$/g, ''))) {
      current = null;
      continue;
    }
    if (one && (heading.test(one) || (src.titleCase && isTitleLine(one)))) {
      current = { title: one.replace(/^_|_\.?$/g, '').replace(/\.$/, ''), paragraphs: [] };
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
