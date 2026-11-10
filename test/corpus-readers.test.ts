// The readers for the newer voices, each on a small fixture: Standard Ebooks books of essays and stories, a paper's
// byline, a novel split at its scene breaks; Gutenberg headings that wrap, editors' notes, dialogue; Lincoln's papers;
// one HTML page. And the fields every author file carries.

import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FAMILIES,
  fetchFile,
  hintOf,
  lincolnDate,
  lincolnPiece,
  lincolnTitle,
  notPublicDomain,
  plainGutenberg,
  readAuthor,
  readGutenberg,
  readHtml,
  readLincoln,
  readStandardEbook,
  readWork,
  readXhtmlChapters,
  romanNumber,
  sourceUrl,
  usPublicDomainYear,
  type WorkConfig,
} from '../src/corpus/sources.ts';
import { KINDS } from '../src/engine/structure.ts';

const ROOT = join(import.meta.dirname, '..');
const tmp = () => mkdtempSync(join(tmpdir(), 'readers-'));

/** A Standard Ebooks repository: its spine in content.opf, its files under src/epub/text. */
function seRepo(files: Record<string, string>): string {
  const dir = tmp();
  mkdirSync(join(dir, 'src', 'epub', 'text'), { recursive: true });
  const spine = Object.keys(files).map((f) => `<itemref idref="${f}"/>`).join('');
  writeFileSync(join(dir, 'src', 'epub', 'content.opf'), `<package><spine>${spine}</spine></package>`);
  for (const [f, x] of Object.entries(files)) writeFileSync(join(dir, 'src', 'epub', 'text', f), x);
  return dir;
}
const page = (body: string) => `<html><body epub:type="bodymatter">${body}</body></html>`;
const texts = (cs: { paragraphs: { text: string }[] }[]) => cs.map((c) => c.paragraphs.map((p) => p.text));

describe('Standard Ebooks', () => {
  it('leaves out a note’s number', () => {
    const [ch] = readXhtmlChapters(
      page(`<section epub:type="chapter"><h2>II</h2><p>the most severe<a href="endnotes.xhtml#note-1" id="noteref-1" epub:type="noteref">184</a> regulations.</p></section>`),
    );
    expect(ch!.paragraphs[0]!.text).toBe('the most severe regulations.');
  });

  it('reads essays and stories by file name, prefaces too, and never the title page', () => {
    const dir = seRepo({
      'titlepage.xhtml': page(`<section epub:type="titlepage"><h1>Essays</h1><p>By R. W. Emerson</p></section>`),
      'preface.xhtml': page(`<section id="preface" epub:type="preface"><h2>Preface</h2><p>The artist is the creator of beautiful things.</p></section>`),
      'self-reliance.xhtml': page(
        `<article id="self-reliance" epub:type="z3998:essay"><h2>Self-Reliance</h2><p>Trust thyself.</p><section id="s2"><p>A second part.</p></section></article>`,
      ),
      'indian-camp.xhtml': page(`<article id="indian-camp" epub:type="se:short-story"><h3>Indian Camp</h3><p>At the lake shore there was another rowboat.</p></article>`),
      'colophon.xhtml': page(`<section epub:type="colophon"><p>Made by volunteers.</p></section>`),
    });
    expect(readStandardEbook(dir)).toEqual([]);
    const all = readStandardEbook(dir, { files: '.' });
    expect(all.map((c) => c.title)).toEqual(['Preface', 'Self-Reliance', '', 'Indian Camp']);
    expect(texts(all)[1]).toEqual(['Trust thyself.']);
    expect(readStandardEbook(dir, { files: '^indian-camp' }).map((c) => c.title)).toEqual(['Indian Camp']);
  });

  it('titles a paper by its number and byline, and drops its salutation and signature', () => {
    const paper = (n: string, who: string) =>
      page(`<section id="chapter-${n}" epub:type="chapter"><header><hgroup><h2 epub:type="z3998:ordinal z3998:roman">${n}</h2>
        <p epub:type="title">The Same Subject Continued</p></hgroup>
        <p epub:type="se:bridgehead">${who}: From <i>The Daily Advertiser</i>, Thursday, November 22, 1787.</p></header>
        <p>To the People of the State of New York:</p><p>Among the numerous advantages promised by a well-constructed Union…</p>
        <p epub:type="z3998:signature"><b epub:type="z3998:pen-name">Publius</b></p></section>`);
    const dir = seRepo({ 'chapter-10.xhtml': paper('X', 'Madison'), 'chapter-11.xhtml': paper('XI', 'Madison, with Hamilton') });
    const papers = readStandardEbook(dir, { byline: 'Federalist', drop: '^(To the People of the State of New York:|Publius\\.?)$' });
    expect(papers.map((c) => [c.n, c.title])).toEqual([
      [10, 'Federalist No. 10 (Madison)'],
      [11, 'Federalist No. 11 (Madison, with Hamilton)'],
    ]);
    expect(texts(papers)[0]).toEqual(['Among the numerous advantages promised by a well-constructed Union…']);
  });

  it('splits a novel without chapters at its scene breaks', () => {
    const dir = seRepo({
      'mrs-dalloway.xhtml': page(`<section id="mrs-dalloway"><h2>Mrs Dalloway</h2><p>Mrs. Dalloway said she would buy the flowers herself.</p>
        <p>For Lucy had her work cut out for her.</p><hr/><p>The violent explosion made Mrs. Dalloway jump.</p><hr/><p>“What are they looking at?”</p></section>`),
    });
    const parts = readStandardEbook(dir, { files: '^mrs-dalloway', breaks: true });
    expect(parts.map((c) => [c.n, c.title, c.paragraphs.length])).toEqual([
      [1, '§ 1', 2],
      [2, '§ 2', 1],
      [3, '§ 3', 1],
    ]);
  });

  it('reads Roman numerals', () => {
    expect([romanNumber('X'), romanNumber('LXXXV'), romanNumber('xiv'), romanNumber('Preface')]).toEqual([10, 85, 14, 0]);
  });
});

describe('Project Gutenberg', () => {
  const pg = (text: string) => {
    const dir = tmp();
    writeFileSync(join(dir, 'book.txt'), `The Project Gutenberg EBook\r\n\r\n*** START OF THIS PROJECT GUTENBERG EBOOK ***\r\n\r\n${text.replace(/\n/g, '\r\n')}\r\n\r\nEnd of the Project Gutenberg EBook of the Book\r\n\r\n*** END OF THIS PROJECT GUTENBERG EBOOK ***\r\n`);
    return dir;
  };

  it('drops a page’s number in the margin', () => {
    expect(plainGutenberg('what, to the American slave, {353} is your 4th of July?')).toBe('what, to the American slave, is your 4th of July?');
  });

  it('reads a heading that wraps, drops the chapter’s summary, and keeps a letter as a letter', () => {
    const dir = pg(`CHAPTER I. _Childhood_

THE NAME--A TERROR--COLONEL LLOYD--HIS PLANTATION--THE OLD MASTER--MY
GRANDMOTHER--HER CABIN

IN Talbot county, Eastern Shore, Maryland, near Easton, the county town.

LETTER TO HIS OLD MASTER.
To My Old Master, Thomas Auld

SIR--The long and intimate relation which unhappily subsisted between you and myself.`);
    const chapters = readGutenberg(dir, {
      file: 'book.txt',
      chapter: '^(CHAPTER [IVXL]+\\. .*|LETTER TO HIS OLD MASTER.*)$',
      wrap: 2,
      dropPara: '^([A-Z][^a-z]*--){3}',
      letters: '^LETTER',
    });
    expect(chapters.map((c) => c.title)).toEqual(['CHAPTER I. Childhood', 'LETTER TO HIS OLD MASTER. To My Old Master, Thomas Auld']);
    expect(chapters[0]!.paragraphs).toEqual([{ text: 'In Talbot county, Eastern Shore, Maryland, near Easton, the county town.', kind: 'prose' }]);
    expect(chapters[1]!.paragraphs[0]!.kind).toBe('letter');
  });

  it('finds a heading only after a gap, past a numeral, and leaves off the end of the ebook', () => {
    const dir = pg(`_The Lives of the Obscure_


Five shillings, perhaps, will secure a life subscription.

THE LIBRARIAN SPEAKS

He resents the duty.




III

MISS ORMEROD[8]


The trees stood massively in all their summer foliage.`);
    const chapters = readGutenberg(dir, { file: 'book.txt', chapter: '^(_[^_]+_|[A-Z][A-Z ,.]+[A-Z])(\\[\\d+\\])?$', wrap: 2, gap: 2, drop: '^[IVX]+$' });
    expect(chapters.map((c) => c.title)).toEqual(['The Lives of the Obscure', 'MISS ORMEROD']);
    expect(texts(chapters)).toEqual([
      ['Five shillings, perhaps, will secure a life subscription.', 'THE LIBRARIAN SPEAKS', 'He resents the duty.'],
      ['The trees stood massively in all their summer foliage.'],
    ]);
  });

  it('takes the speakers’ names off a dialogue and an editor’s note out of an essay', () => {
    const dir = pg(`THE DECAY OF LYING:
AN OBSERVATION

CYRIL (_coming in through the open window_).  My dear
Vivian, don't coop yourself up all day.

VIVIAN.  Enjoy Nature!  I am glad to say that I have lost that faculty.

[1] This paper is enumerated by Chalmers among those of Johnson.`);
    const [ch] = readGutenberg(dir, {
      file: 'book.txt',
      chapter: '^THE DECAY OF LYING',
      wrap: 3,
      speakers: '^(CYRIL|VIVIAN)(\\s*\\(_[^)]*_\\))?\\.\\s+',
      dropPara: '^\\[\\d+\\] ',
    });
    expect(ch!.title).toBe('THE DECAY OF LYING: AN OBSERVATION');
    expect(texts([ch!])[0]).toEqual(['My dear Vivian, don’t coop yourself up all day.', 'Enjoy Nature! I am glad to say that I have lost that faculty.']);
  });
});

describe('Lincoln’s papers', () => {
  const volume = `THE PAPERS AND WRITINGS OF ABRAHAM LINCOLN

ABRAHAM LINCOLN: AN ESSAY BY CARL SCHURZ

Lincoln was born in poverty, the essayist writes at length about him.




THE WRITINGS OF ABRAHAM LINCOLN, Volume Seven




ADDRESS AT GETTYSBURG

NOVEMBER 19, 1863.

Four score and seven years ago our fathers brought forth on this
continent, a new nation, conceived in Liberty.

But, in a larger sense, we can not dedicate--we can not consecrate--we
can not hallow--this ground.




TO SECRETARY CHASE

EXECUTIVE MANSION, WASHINGTON, November 17, 1863.

HON. SECRETARY OF THE TREASURY.

MY DEAR SIR:--I expected to see you here at Cabinet meeting, and to say
something about going to Gettysburg. There will be a train to take and
return us. The time for starting is not yet fixed, but when it shall be I
will notify you of it at once.

Yours truly,


A. LINCOLN.




TELEGRAM TO GENERAL BURNSIDE.

WAR DEPARTMENT, WASHINGTON CITY, November 16, 1863.

MAJOR-GENERAL BURNSIDE, Knoxville, Tenn.:

What is the news?


A. LINCOLN.




PROCLAMATION OF THANKSGIVING, OCTOBER 3, 1863.

BY THE PRESIDENT OF THE UNITED STATES OF AMERICA:

A Proclamation.

The year that is drawing towards its close has been filled with the
blessings of fruitful fields and healthful skies, and many other things.




Mr. DOUGLAS TO Mr. LINCOLN.

BEMENT, PLATT Co., ILL., July 30, 1858.

Dear Sir,--Your letter dated yesterday, accepting my proposition for a
joint discussion at one prominent point in each Congressional District.




REPLY TO ADDRESS OF WELCOME, INDIANAPOLIS,

INDIANA, FEBRUARY 11, 1861

GOVERNOR MORTON AND FELLOW CITIZENS OF THE STATE OF INDIANA:

Most heartily do I thank you for this magnificent reception, and while I
cannot take to myself any share of the compliment thus paid. [Applause.]`;

  it('keeps speeches and letters, and leaves out telegrams, proclamations and others’ letters', () => {
    const dir = tmp();
    writeFileSync(join(dir, '2659.txt'), `*** START OF THIS PROJECT GUTENBERG EBOOK LINCOLN'S PAPERS ***\n\n${volume}\n\n*** END OF THIS PROJECT GUTENBERG EBOOK ***\n`);
    const pieces = readLincoln(dir, { file: '2659.txt', from: '^THE WRITINGS OF ABRAHAM LINCOLN, (1832-1843|Volume)', minWords: 10 });
    expect(pieces.map((c) => c.title)).toEqual([
      'Address at Gettysburg, 19 November 1863',
      'To Secretary Chase, 17 November 1863',
      'Reply to Address of Welcome, Indianapolis, Indiana, 11 February 1861',
    ]);
    expect(pieces[0]!.paragraphs).toEqual([
      { text: 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty.', kind: 'prose' },
      { text: 'But, in a larger sense, we can not dedicate—we can not consecrate—we can not hallow—this ground.', kind: 'prose' },
    ]);
    expect(pieces[1]!.paragraphs.map((p) => p.kind)).toEqual(['letter']);
    expect(pieces[1]!.paragraphs[0]!.text).toMatch(/^I expected to see you here.*at once\.$/);
    expect(pieces[2]!.paragraphs[0]!.text).toMatch(/compliment thus paid\.$/);
    // With telegrams kept and no floor on length, the telegram comes back.
    const all = readLincoln(dir, { file: '2659.txt', from: '^THE WRITINGS', keep: ['telegram'], minWords: 0 });
    expect(all.map((c) => [c.title, c.paragraphs[0]!.text])).toEqual([['Telegram to General Burnside, 16 November 1863', 'What is the news?']]);
  });

  it('names each piece, and its date', () => {
    expect(lincolnPiece('SPEECH AT CHICAGO, JULY 10, 1858.')).toBe('speech');
    expect(lincolnPiece('Mr. LINCOLN\'S REJOINDER.')).toBe('speech');
    expect(lincolnPiece('TO JOSHUA F. SPEED--ON MARRIAGE')).toBe('letter');
    expect(lincolnPiece('MR. LINCOLN TO MR. DOUGLAS.')).toBe('letter');
    expect(lincolnPiece('ANNUAL MESSAGE TO CONGRESS, DECEMBER 1, 1862')).toBe('message');
    expect(lincolnPiece('EXECUTIVE ORDER RELATING TO COMMERCIAL INTERCOURSE.')).toBe('state');
    expect(lincolnPiece("CAMPBELL'S REPLY")).toBe('others');
    expect(lincolnPiece('LOST TOWNSHIPS')).toBe('writing');
    expect(lincolnDate('SPRINGFIELD, Aug. 5, 1858.')).toBe('5 August 1858');
    expect(lincolnDate('SPRINGFIELD, November, 2, 1859.')).toBe('2 November 1859');
    expect(lincolnTitle('SPEECH AT CHICAGO, JULY 10, 1858.', '10 July 1858')).toBe('Speech at Chicago, 10 July 1858');
    expect(lincolnTitle('TO JOSHUA F. SPEED--ON MARRIAGE', null)).toBe('To Joshua F. Speed: on Marriage');
  });
});

describe('one HTML page', () => {
  it('reads its chapters from Latin-1, with its entities and without its notes', () => {
    const dir = tmp();
    const html = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"></head><body>
<h1>A Room of One's Own</h1><p>Production notes.</p>
<h2><a name="ch1" id="ch1"></a>ONE</h2>
<p>But, you may say, we asked you to speak about women and fiction&mdash;what has that got to do with a room of one's own?</p>
<p>Caf\xe9 society [* a note] and Bront&euml; were "far away".</p>
<h2><a name="ch2" id="ch2"></a>TWO</h2><p>The scene was now changed.</p>
<h2>THE END</h2><p>Back matter.</p></body></html>`;
    writeFileSync(join(dir, 'room.html'), Buffer.from(html, 'latin1'));
    const chapters = readHtml(join(dir, 'room.html'), { chapter: '^(ONE|TWO|THREE|FOUR|FIVE|SIX)$' });
    expect(chapters.map((c) => [c.n, c.title])).toEqual([
      [1, 'ONE'],
      [2, 'TWO'],
    ]);
    expect(texts(chapters)[0]).toEqual([
      'But, you may say, we asked you to speak about women and fiction—what has that got to do with a room of one’s own?',
      'Café society and Brontë were “far away”.',
    ]);
  });

  it('reads a page already kept, without fetching it', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'room.html'), '<html><body><h2>ONE</h2><p>Kept.</p></body></html>');
    const work: WorkConfig = { id: 'room', title: 'A Room of One’s Own', year: 1929, source: { type: 'html', file: 'room.html', url: 'https://example.invalid/room.html', chapter: '^ONE$' } };
    expect(fetchFile(work.source.type === 'html' ? work.source.url : '', join(dir, 'room.html'))).toBe(join(dir, 'room.html'));
    expect(texts(readWork(work, dir))).toEqual([['Kept.']]);
    expect(sourceUrl(work)).toBe('https://example.invalid/room.html');
  });
});

describe('author files', () => {
  const ids = readdirSync(join(ROOT, 'authors'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  it.each(ids)('%s has a family, the kinds it suits, a license and a hint for every move', (id) => {
    const a = readAuthor(ROOT, id);
    expect(FAMILIES).toContain(a.family);
    expect(a.goodFor?.length).toBeGreaterThan(0);
    for (const k of a.goodFor!) expect(KINDS).toContain(k);
    expect(a.license?.source).toBeTruthy();
    expect(a.license?.note).toBeTruthy();
    expect(['age', 'government']).toContain(a.license?.basis);
    for (const m of a.moves ?? []) {
      expect(m.hint, `${id}/${m.id}`).toBeTruthy();
      expect(hintOf(m)).not.toBe(m.does);
    }
  });

  it.each(ids)('%s has no work newer than US public domain allows', (id) => {
    expect(notPublicDomain(readAuthor(ROOT, id), 2026)).toEqual([]);
  });

  it('dates US public domain', () => {
    expect(usPublicDomainYear(2026)).toBe(1930);
    const a = { ...readAuthor(ROOT, 'austen'), works: [{ id: 'x', title: 'The Glass Key', year: 1931, source: { type: 'standardebooks' as const, repo: 'x/y' } }] };
    expect(notPublicDomain(a, 2026).map((w) => w.title)).toEqual(['The Glass Key']);
    expect(notPublicDomain(a, 2027)).toEqual([]);
  });
});
