// Facts from Wikipedia, with a fake client: no test reaches the network.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FactStore, MAX_FACTS, MAX_PER_PARAGRAPH, factSentences, findTopics, gatherFacts, titleFits, useWiki, wikiClient, wikiUserAgent, type WikiLike } from '../src/server/facts.ts';

const HISTORY = `# Causes of the Revolution

Britain taxed the colonies after a long war, and the colonists were angry because nobody spoke for them in Parliament. Then the Boston Tea Party happened in 1773 and they threw the tea in the harbor.

After that Britain punished Boston and closed the port. Paul Revere rode at night to warn the militia that the soldiers were coming.`;

const DIARY = `# Diary, Tuesday

Dear diary, today was so weird. I woke up late and missed breakfast. Then in math Mr. Kowalski gave us a pop quiz and I'm pretty sure I failed it. Then at lunch Maya told me that Jordan said something about me but she wouldn't tell me what.

I keep thinking about what Jordan said. Anyway, tomorrow will be better. Goodnight.`;

interface Article {
  extract: string;
  body?: string;
  type?: string;
}

const ARTICLES: Record<string, Article> = {
  'Boston Tea Party': {
    extract:
      'The Boston Tea Party was a protest on December 16, 1773, in which colonists threw 342 chests of tea into Boston harbor. It was organised by the Sons of Liberty. The protest answered the Tea Act, which Parliament had passed that year.',
    body:
      'The colonists objected to the Tea Act because they believed it violated their rights, since nobody represented them in Parliament. He was one of the leaders.\n\nParliament answered in 1774 with laws that closed the port of Boston until the tea was paid for. The harbor smelled of tea for weeks afterwards, as several colonists later wrote in their letters.',
  },
  'Paul Revere': {
    extract:
      'Paul Revere was an American silversmith who rode at night in April 1775 to warn the militia that British soldiers were coming. He later made engravings.',
    body: 'Revere worked as a silversmith in Boston for forty years and trained a number of apprentices in the trade there.',
  },
  // Another subject of the same name: its opening shares nothing with the text.
  'Paul Revere & the Raiders': { extract: 'Paul Revere & the Raiders were an American rock band formed in Idaho in 1958. The band had several hit records in the 1960s.' },
  'Tea Party (disambiguation)': { extract: 'Tea Party may refer to several things.', type: 'disambiguation' },
};

/** A client over the articles above. `calls` counts every request. */
function fake(search: Record<string, string[]>, opts: { hang?: boolean; fail?: boolean } = {}): WikiLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async search(q) {
      calls.push(`search ${q}`);
      if (opts.fail) throw new Error('down');
      return { hits: (search[q] ?? []).map((title) => ({ title })) };
    },
    async summary(title) {
      calls.push(`summary ${title}`);
      if (opts.hang) await new Promise(() => undefined);
      const a = ARTICLES[title]!;
      return { title, extract: a.extract, type: a.type ?? 'standard', content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}` } } };
    },
    async sections(title) {
      calls.push(`sections ${title}`);
      const a = ARTICLES[title]!;
      return [
        { title: '', text: a.extract },
        { title: 'History', text: a.body ?? '' },
        { title: 'References', text: 'Smith, John. The Boston Tea Party and the colonists of the harbor in 1773. Parliament Press, 1999, a long reference line.' },
      ];
    },
  };
}

const FOUND = { 'Boston Tea Party': ['Boston Tea Party'], 'Paul Revere': ['Paul Revere'] };
const proseOf = (title: string) => `${ARTICLES[title]!.extract}\n${ARTICLES[title]!.body ?? ''}`;

describe('topics', () => {
  it('finds the names in a text and where they stand', () => {
    const t = findTopics(HISTORY);
    expect(t.map((x) => x.phrase)).toEqual(expect.arrayContaining(['Boston Tea Party', 'Paul Revere']));
    expect(t.find((x) => x.phrase === 'Boston Tea Party')!.paragraphs).toEqual([1]);
    expect(t.find((x) => x.phrase === 'Paul Revere')!.paragraphs).toEqual([2]);
    // "Boston" alone is part of the longer name.
    expect(t.some((x) => x.phrase === 'Boston')).toBe(false);
    expect(t.length).toBeLessThanOrEqual(8);
  });

  it('joins two names by "and" and keeps the halves to fall back on', () => {
    const t = findTopics('The war began with fighting at Lexington and Concord in the spring. The French and Indian War had ended years before that.');
    expect(t.find((x) => x.phrase === 'Lexington and Concord')!.parts).toEqual(['Lexington', 'Concord']);
    expect(t.some((x) => x.phrase === 'French and Indian War')).toBe(true);
  });

  it('finds nothing to look up in a diary: a teacher and two friends are private people', () => {
    expect(findTopics(DIARY)).toEqual([]);
  });

  it('takes a heading’s phrase the text returns to when there are no names', () => {
    const t = findTopics('# Teenagers and Screen Time\n\nMany teenagers spend hours on screens. Too much screen time can affect sleep and mood, and experts disagree about how much it matters.');
    expect(t.map((x) => x.phrase)).toContain('screen time');
    expect(t.every((x) => x.kind === 'noun')).toBe(true);
  });
});

describe('titles and sentences', () => {
  it('fits a title to a topic, and refuses a qualified title the text does not support', () => {
    expect(titleFits('Boston Tea Party', 'Boston Tea Party')).toBe(true);
    expect(titleFits('Battles of Lexington and Concord', 'Lexington and Concord')).toBe(true);
    expect(titleFits('Stamp Act 1765', 'Stamp Act')).toBe(true);
    expect(titleFits('Massacre', 'Boston Massacre')).toBe(false);
    expect(titleFits('Lincoln High School (Portland, Oregon)', 'Lincoln High School')).toBe(false);
    expect(titleFits('Lexington, Kentucky', 'Lexington')).toBe(false);
    expect(titleFits('Lexington, Kentucky', 'Lexington', new Set(['kentucky']))).toBe(true);
  });

  it('keeps whole sentences that stand alone, exactly as written', () => {
    const prose = ARTICLES['Boston Tea Party']!.body!;
    const s = factSentences(prose);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) expect(prose).toContain(x);
    // "He was one of the leaders." leans on the sentence before it.
    expect(s.some((x) => x.startsWith('He '))).toBe(false);
    expect(factSentences('See [1] for the list of every ship that was in the harbor on that day in 1773.')).toEqual([]);
  });
});

describe('gatherFacts', () => {
  it('returns sentences quoted exactly, each for a paragraph that names its topic', async () => {
    const wiki = fake(FOUND);
    const facts = await gatherFacts(HISTORY, { wiki });
    expect(facts.length).toBeGreaterThanOrEqual(3);
    expect(facts.length).toBeLessThanOrEqual(MAX_FACTS);
    for (const f of facts) {
      expect(proseOf(f.title), f.text).toContain(f.text);
      expect(f.text).toMatch(/^[A-Z].*[.!?]$/);
      expect(f.id).toMatch(/^w[0-9a-f]{8}$/);
      expect(f.url).toBe(`https://en.wikipedia.org/wiki/${f.title.replace(/ /g, '_')}`);
      expect(f.score).toBeGreaterThan(0);
      expect(f.paragraph).toBe(f.title === 'Paul Revere' ? 2 : 1);
      expect(f.topic).toBe(f.title);
    }
    for (const p of [1, 2]) expect(facts.filter((f) => f.paragraph === p).length).toBeLessThanOrEqual(MAX_PER_PARAGRAPH);
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
    // In the order of the paragraphs, the nearest first.
    expect(facts.map((f) => f.paragraph)).toEqual([...facts.map((f) => f.paragraph)].sort((a, b) => a - b));
    // The reference list and the leaning sentence are never quoted.
    expect(facts.some((f) => /Smith, John|^He /.test(f.text))).toBe(false);
  });

  it('counts a shared date for more than a shared word', async () => {
    const facts = await gatherFacts(HISTORY, { wiki: fake(FOUND) });
    const first = facts.find((f) => f.paragraph === 1)!;
    expect(first.text).toContain('1773');
  });

  it('gives the same facts, with the same ids, each time', async () => {
    const a = await gatherFacts(HISTORY, { wiki: fake(FOUND) });
    const b = await gatherFacts(HISTORY, { wiki: fake(FOUND) });
    expect(b).toEqual(a);
  });

  it('asks nothing and returns none for a diary', async () => {
    const wiki = fake(FOUND);
    const t = Date.now();
    expect(await gatherFacts(DIARY, { wiki })).toEqual([]);
    expect(wiki.calls).toEqual([]);
    expect(Date.now() - t).toBeLessThan(1500);
  });

  it('drops an article that is another subject of the same name', async () => {
    const wiki = fake({ 'Paul Revere': ['Paul Revere & the Raiders'], 'Boston Tea Party': ['Tea Party (disambiguation)'] });
    expect(await gatherFacts(HISTORY, { wiki })).toEqual([]);
    expect(wiki.calls.some((c) => c.startsWith('sections'))).toBe(false);
  });

  it('returns what it has when the time is spent', async () => {
    const wiki = fake(FOUND, { hang: true });
    const t = Date.now();
    expect(await gatherFacts(HISTORY, { wiki, budgetMs: 300 })).toEqual([]);
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('returns none when the client fails', async () => {
    expect(await gatherFacts(HISTORY, { wiki: fake(FOUND, { fail: true }) })).toEqual([]);
  });

  it('asks nothing for a while after Wikipedia says there were too many requests, and keeps no empty answer', async () => {
    const store = new FactStore(':memory:');
    const refused = fake(FOUND);
    refused.search = async (q) => {
      refused.calls.push(`search ${q}`);
      throw Object.assign(new Error('HTTP 429'), { status: 429 });
    };
    expect(await gatherFacts(HISTORY, { wiki: refused, store })).toEqual([]);
    const next = fake(FOUND);
    expect(await gatherFacts(HISTORY, { wiki: next, store })).toEqual([]);
    expect(next.calls).toEqual([]);
    // useWiki ends the rest. The refused run was not kept, so the text is gathered now.
    useWiki(undefined);
    expect((await gatherFacts(HISTORY, { wiki: fake(FOUND), store })).length).toBeGreaterThan(0);
    store.close();
  });

  it('keeps a text’s facts by its hash and asks nothing the second time', async () => {
    const store = new FactStore(':memory:');
    const first = fake(FOUND);
    const a = await gatherFacts(HISTORY, { wiki: first, store });
    const second = fake(FOUND);
    expect(await gatherFacts(HISTORY, { wiki: second, store })).toEqual(a);
    expect(second.calls).toEqual([]);
    // A run cut short is not kept.
    const other = `${HISTORY}\n\nOne more paragraph, so the hash differs.`;
    await gatherFacts(other, { wiki: fake(FOUND, { hang: true }), store, budgetMs: 200 });
    const third = fake(FOUND);
    await gatherFacts(other, { wiki: third, store });
    expect(third.calls.length).toBeGreaterThan(0);
    store.close();
  });
});

describe('the client and the route', () => {
  let server: Server;
  let base = '';
  beforeAll(async () => {
    const { createApp } = await import('../src/server/app.ts');
    server = await createApp();
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    useWiki(undefined);
    await new Promise<void>((done) => server.close(() => done()));
  });
  const post = (data: unknown) => fetch(`${base}/api/facts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

  it('names the program in its User-Agent and no person, unless the environment says otherwise', () => {
    const was = process.env.ADVISOR_WIKI_UA;
    delete process.env.ADVISOR_WIKI_UA;
    expect(wikiUserAgent()).toBe('austenadvisor/1.0 (writing tutor)');
    process.env.ADVISOR_WIKI_UA = 'advisor-test/2.0 (https://example.org/contact)';
    expect(wikiUserAgent()).toBe('advisor-test/2.0 (https://example.org/contact)');
    if (was === undefined) delete process.env.ADVISOR_WIKI_UA;
    else process.env.ADVISOR_WIKI_UA = was;
  });

  it('builds no client under the test runner', async () => {
    useWiki(undefined);
    expect(await wikiClient()).toBeNull();
    expect(await gatherFacts(HISTORY)).toEqual([]);
  });

  it('answers POST /api/facts with the facts', async () => {
    useWiki(fake(FOUND));
    const r = await post({ text: HISTORY });
    expect(r.status).toBe(200);
    const { facts } = (await r.json()) as { facts: { text: string; title: string; paragraph: number }[] };
    expect(facts.length).toBeGreaterThan(0);
    for (const f of facts) expect(proseOf(f.title)).toContain(f.text);
    expect((await post({ text: '  ' })).status).toBe(400);
    const none = (await (await post({ text: DIARY })).json()) as { facts: unknown[] };
    expect(none.facts).toEqual([]);
  });
});
