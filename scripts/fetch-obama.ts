// President Obama's speeches from the official archive of his White House (obamawhitehouse.archives.gov): every
// weekly address, and the prepared set pieces (State of the Union, inaugurals, addresses to the nation, eulogies,
// commencements, the farewell). As works of the federal government they are in the public domain. Written to
// data/sources/obama/speeches.json, which authors/obama.json reads.
//
//   node scripts/fetch-obama.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA } from '../src/db.ts';

const SITE = 'https://obamawhitehouse.archives.gov';
const WEEKLY = (p: number) => `${SITE}/briefing-room/weekly-address${p ? `/index__q_page=${p}.html` : ''}`;
const ALL = (p: number) => `${SITE}/briefing-room/speeches-and-remarks${p ? `/index__q_term_node_tid_depth=31&page=${p}.html` : ''}`;
/** The set pieces, by their titles in the archive. */
const SET_PIECE =
  /State of the Union|Inaugura|Address to the Nation|Joint Session|Commencement|Eulogy|Memorial Service|Nobel|Farewell|Selma|Cairo|Oval Office|Address to the People|Address on/i;

async function page(url: string, tries = 3): Promise<string> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Advisor corpus builder)' } });
      if (r.status === 404) return '';
      if (r.ok) return await r.text();
    } catch {
      /* again */
    }
    await new Promise((ok) => setTimeout(ok, 1000 * (i + 1)));
  }
  return '';
}

const decode = (s: string) =>
  s
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

/** The links to transcripts on a listing page, with their titles. */
function links(html: string): { url: string; title: string }[] {
  return [...html.matchAll(/href="(\/the-press-office\/\d{4}\/\d{2}\/\d{2}\/[^"]+)"[^>]*>([^<]+)</g)].map((m) => ({ url: SITE + m[1]!, title: decode(m[2]!) }));
}

/** The words the President spoke: the transcript as delivered, without the header, stage directions or others' words. */
function transcript(html: string): string[] {
  const at = html.indexOf('field-name-field-transcript');
  const body = at >= 0 ? html.slice(at) : html.slice(Math.max(0, html.indexOf('field-name-field-forall-body')));
  const end = body.indexOf('panel-col-section-share');
  const paras = [...(end > 0 ? body.slice(0, end) : body).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => decode(m[1]!));
  const out: string[] = [];
  let president = true;
  for (let p of paras) {
    if (/^(Remarks (of|by) (the )?President|As Prepared for Delivery|THE WHITE HOUSE|Office of the Press Secretary|For Immediate Release)/i.test(p)) continue;
    if (/^(###|END|\d{1,2}:\d{2} [AP]\.?M\.?.*)$/i.test(p)) continue;
    // A speaker named: the President's words are kept, anyone else's are not.
    const who = /^([A-Z][A-Z .’'-]{2,40}):\s*/.exec(p);
    if (who) {
      president = /PRESIDENT/.test(who[1]!);
      p = p.slice(who[0].length);
    }
    if (!president) continue;
    p = p.replace(/\((Applause|Laughter|Cheers|Booing|Audience [^)]*|inaudible|Crosstalk)[^)]*\)\.?/gi, '').replace(/\s+/g, ' ').trim();
    if (p.split(' ').length >= 4) out.push(p);
  }
  return out;
}

const dateOf = (url: string) => /\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(url)!.slice(1).join('-');

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await f(items[i]!);
      }
    }),
  );
  return out;
}

async function listing(url: (p: number) => string, keep: (l: { url: string; title: string }) => boolean, label: string) {
  const found = new Map<string, { url: string; title: string }>();
  for (let p = 0; ; p += 8) {
    const pages = await pool([0, 1, 2, 3, 4, 5, 6, 7].map((k) => p + k), 4, (q) => page(url(q)));
    let any = false;
    for (const html of pages)
      for (const l of links(html)) {
        any = true;
        if (keep(l)) found.set(l.url, l);
      }
    process.stderr.write(`\r${label}: ${p + 8} pages, ${found.size} kept`);
    if (!any) break;
  }
  process.stderr.write('\n');
  return [...found.values()];
}

const english = (l: { url: string; title: string }) => !/mensaje|discurso|semanal/i.test(l.url + l.title);
const weekly = await listing(WEEKLY, (l) => english(l) && /weekly-address/.test(l.url), 'weekly addresses');
const pieces = await listing(ALL, (l) => english(l) && !/weekly-address/.test(l.url) && SET_PIECE.test(l.title) && !/Press Conference|Q&A|Interview|Statement|Readout/i.test(l.title), 'set pieces');

const all = [...weekly.map((l) => ({ ...l, kind: 'weekly' as const })), ...pieces.map((l) => ({ ...l, kind: 'speech' as const }))];
let done = 0;
const speeches = (
  await pool(all, 6, async (l) => {
    const paragraphs = transcript(await page(l.url));
    process.stderr.write(`\rtranscripts: ${++done}/${all.length}`);
    return { kind: l.kind, title: l.title, date: dateOf(l.url), url: l.url, paragraphs };
  })
).filter((s) => s.paragraphs.length >= 3);
process.stderr.write('\n');
speeches.sort((a, b) => a.date.localeCompare(b.date));
const dir = join(DATA, 'sources', 'obama');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'speeches.json'), JSON.stringify(speeches));
const words = speeches.reduce((a, s) => a + s.paragraphs.join(' ').split(/\s+/).length, 0);
console.log(`${speeches.filter((s) => s.kind === 'weekly').length} weekly addresses and ${speeches.filter((s) => s.kind === 'speech').length} speeches, ${words.toLocaleString()} words`);
