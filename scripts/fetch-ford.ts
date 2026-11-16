// Paul Ford's prose, from two places: the database behind ftrain.com (Ftrain from 1997, The Morning News, Medium,
// Postlight, the Aboard newsletter, the journals) and “What Is Code?” (Bloomberg Businessweek, 2015), whose text is
// kept on GitHub by Bloomberg Graphics. Written to data/sources/ford/pieces.json, which authors/ford.json reads, one
// piece a chapter. Used with the author's permission; not public domain.
//
// Kept: essays, posts, articles, stories, letters, journal entries and LinkedIn posts that carry no byline but his.
// Left out: tweets and Bluesky posts (too short to show a paragraph), podcast notes, Harper's Weekly Review (news in
// the magazine's house form), podcasts, their transcripts and liveblogs, the SXSW review tables, the texts of others Ftrain reprinted, a thread of comments on Kinja, and inside a piece every quotation set off as a block, table,
// code listing, caption and heading, and in a conversation every turn but his. A paragraph printed in more than one place is kept once, where it came first.
//
//   node scripts/fetch-ford.ts --ssh ftrain.exe.xyz     # psql on that box, against the CMS's own .env
//   FTRAIN_DATABASE_URL=postgres://… node scripts/fetch-ford.ts

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA } from '../src/db.ts';
import { fetchRepo } from '../src/corpus/sources.ts';

export interface Piece {
  /** The work it belongs to in authors/ford.json. */
  kind: string;
  title: string;
  /** YYYY-MM-DD, or '' where the source gives none. */
  date: string;
  url: string;
  paragraphs: string[];
}

const QUERY = () => `
SELECT coalesce(json_agg(json_build_object('id', p.id, 'type', p.type, 'title', p.title, 'date', to_char(p.publish_date, 'YYYY-MM-DD'),
  'parent', par.title, 'content', p.content) ORDER BY p.publish_date NULLS LAST, p.id), '[]')
FROM posts p LEFT JOIN posts par ON par.id = p.parent_id
WHERE p.effectively_published AND p.content IS NOT NULL
  AND (p.type IN ('Article', 'Post', 'Story', 'Journal Entry', 'Letter', 'LinkedIn Post') OR coalesce(p.type, '') = '')
  AND p.id <> 'index' AND p.id NOT IN (${REPRINTS.map((r) => `'${r}'`).join(', ')}) AND coalesce(par.title, '') <> 'Kinja' AND p.id NOT LIKE 'harpers-%' AND p.id NOT LIKE 'tmn-six-word-%'
  AND NOT EXISTS (SELECT 1 FROM post_taxonomy t WHERE t.post_id = p.id AND t.predicate = 'by' AND t.term_id NOT IN ('PaulFord', 'paul-ford'))`;

/**
 * Other writers' texts Ftrain reprinted under its own byline: its two anthologies (FtrainAnthology.xml and
 * FtrainAnthologyStranger.xml in the legacy source), whose entries carry an `originally` date or a #Source.
 */
export const REPRINTS = [
  'PilgrimageToTheHolyLand', 'Pyrophone', 'GiveTheCountryTheFacts', 'LetterFacts', 'JohnJonesMonument',
  'AVisitToTheAsylumForAgedAndDecayedPunsters', 'IHaveADream', 'TheMoralCharacterOfTheMonkey', 'HowTheyTelegraphChinese',
  'AChineseViewOfTheStatueOfLiberty', 'OnesSelfISing', 'ChineseRoom', 'FrankOHaraSteps', 'Israel',
  'artifact_woolworth', 'artifact_boston_', 'face_mouth_ford', 'face_galbraith_defines_conservative', 'universal_self_instructor',
  'montaigne_business_plan', 'ben_franklin_business_ethics', 'franklin_improving_self', 'gibson_on_terrorism',
];

interface Row {
  id: string;
  type: string | null;
  title: string | null;
  date: string | null;
  parent: string | null;
  content: string;
}

function rows(): Row[] {
  const ssh = process.argv.indexOf('--ssh');
  const sql = QUERY().replace(/\s+/g, ' ');
  const out =
    ssh > 0
      ? execFileSync('ssh', ['-o', 'BatchMode=yes', process.argv[ssh + 1]!, 'cd ~/ftrain && set -a && . ./.env >/dev/null 2>&1; set +a; psql -qAt "$DATABASE_URL"'], {
          input: sql,
          maxBuffer: 1 << 30,
        })
      : execFileSync('psql', ['-qAt', process.env.FTRAIN_DATABASE_URL ?? '', '-c', sql], { maxBuffer: 1 << 30 });
  return JSON.parse(out.toString('utf8')) as Row[];
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: '’', lt: '<', gt: '>', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', eacute: 'é', shy: '' };
export const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/­/g, '');

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The paragraphs of a piece of HTML that are the writer's own prose. */
export function paragraphsOf(html: string): string[] {
  let h = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|pre|table|figure|figcaption|code|h[1-6]|svg|iframe)\b[\s\S]*?<\/\1>/gi, '\n\n');
  // A block quotation is someone else's, unless (as in some of the early Ftrain pages) the whole piece is set in one.
  const outside = words(h.replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, ' ').replace(/<[^>]+>/g, ' '));
  if (outside >= 0.5 * words(h.replace(/<[^>]+>/g, ' '))) h = h.replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, '\n\n');
  h = h
    .replace(/<br\s*\/?>\s*(<br\s*\/?>)+/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(p|div|li|ol|ul|blockquote|section|article|dd|dt|dl|hr)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  return decode(h)
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/\bhttps?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim(),
    )
    .filter(
      (p) =>
        words(p) >= 8 &&
        /[a-z]/.test(p) &&
        /[.?!…:”"’)]$/.test(p) &&
        !/^(by paul ford|illustration|photo(graph)? by|image:|source:|update:|this (post|piece|essay|story) (originally|first) appeared)/i.test(p),
    );
}

/** Paul's own turns, where he is one of several speakers named at the head of their paragraphs. */
const HIS_TURN = /^(Paul Ford|Paul|PF|Ford):\s+/;
/** A podcast, its transcript, or a liveblog: mostly other people talking. */
const NOT_PROSE = /\b(transcript|podcast|liveblog|live ?blog)\b/i;

/** In a conversation (three or more turns of his, named), only his turns, without his name; else every paragraph. */
export function hisTurns(paragraphs: string[]): string[] {
  const his = paragraphs.filter((p) => HIS_TURN.test(p));
  return his.length >= 3 ? his.map((p) => p.replace(HIS_TURN, '')).filter((p) => words(p) >= 8) : paragraphs;
}

/** The work a row of the database belongs to. */
export function kindOf(r: { id: string; type: string | null; parent: string | null }): string {
  if (r.type === 'Journal Entry') return 'journal';
  if (r.type === 'Letter') return 'letters';
  if (r.id.startsWith('medium-')) return 'medium';
  if (r.id.startsWith('tmn-')) return 'tmn';
  if (r.id.startsWith('postlight-')) return 'postlight';
  if (r.id.startsWith('aboard-') || r.id.startsWith('linkedin-') || r.type === 'LinkedIn Post') return 'aboard';
  if (r.type === 'Story') return 'stories';
  return 'ftrain';
}

/** “What Is Code?”: each numbered section a piece, its paragraphs from the plain <p>s, without the graphics' labels, the editor's note or the code. */
export function whatIsCode(html: string): Piece[] {
  const start = html.indexOf('<h2 id="the-man-in-the-taupe-blazer"');
  const body = html.slice(start >= 0 ? start : 0).replace(/<(pre|script|style|code)\b[\s\S]*?<\/\1>/gi, ' ');
  const pieces: Piece[] = [];
  for (const sec of body.split(/(?=<h2 id=")/)) {
    const head = /^<h2 id="([^"]+)">([\s\S]*?)<\/h2>/.exec(sec);
    if (!head) continue;
    const title = decode(head[2]!.replace(/<a [^>]*>\d+<\/a>/, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const paragraphs = [...sec.matchAll(/<p(?:\s+class="introText")?>([\s\S]*?)<\/p>/g)].flatMap((m) => paragraphsOf(`<p>${m[1]}</p>`));
    if (paragraphs.length >= 3) pieces.push({ kind: 'whatiscode', title, date: '2015-06-11', url: `https://www.bloomberg.com/graphics/2015-paul-ford-what-is-code/#${head[1]}`, paragraphs });
  }
  return pieces;
}

if (import.meta.main) {
  const sources = join(DATA, 'sources');
  const repo = fetchRepo('BloombergGraphics/whatiscode', sources);
  const code = whatIsCode(readFileSync(join(repo, 'index.html'), 'utf8'));

  const seen = new Set<string>();
  const key = (p: string) => p.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const fresh = (ps: string[]) =>
    ps.filter((p) => {
      const k = key(p);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  for (const c of code) c.paragraphs = fresh(c.paragraphs);

  const db = rows()
    .map((r) => ({ kind: kindOf(r), title: decode(r.title ?? '').replace(/\s+/g, ' ').trim() || r.id, date: r.date ?? '', url: `https://ftrain.com/${r.id}`, paragraphs: NOT_PROSE.test(r.title ?? '') ? [] : fresh(hisTurns(paragraphsOf(r.content))) }))
    .filter((p) => p.paragraphs.length >= (p.kind === 'journal' || p.kind === 'aboard' ? 1 : 2));

  const pieces = [...db, ...code];
  const dir = join(sources, 'ford');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pieces.json'), JSON.stringify(pieces));
  const by = new Map<string, { n: number; w: number }>();
  for (const p of pieces) {
    const b = by.get(p.kind) ?? { n: 0, w: 0 };
    b.n++;
    b.w += p.paragraphs.reduce((a, x) => a + words(x), 0);
    by.set(p.kind, b);
  }
  for (const [k, b] of by) console.log(`${k}: ${b.n} pieces, ${b.w.toLocaleString()} words`);
  console.log(`${pieces.length} pieces, ${[...by.values()].reduce((a, b) => a + b.w, 0).toLocaleString()} words`);
}
