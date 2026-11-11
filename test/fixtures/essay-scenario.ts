// One small text that exercises everything the engine does before and after the writer: a claim buried in the third
// paragraph (an essay moves it first), no closing call (the form lacks a part, and the writer fills it), and two
// names Wikipedia has articles for (facts, and footnotes). The articles are a fake client's; nothing here reaches
// the network. test/rewrite.test.ts runs it, and the page fixtures page-rewrite-essay.ndjson and
// page-read-essay.json were written from it.
import type { Fact, WikiLike } from '../../src/server/facts.ts';
import type { Submission } from '../../src/server/rewrite.ts';

export const ESSAY = `First, Britain taxed the colonies after a long war, and nobody spoke for the colonists in Parliament.

Second, the Boston Tea Party happened in 1773 and they threw the tea in the harbor. After that Britain punished Boston and closed the port.

I believe that the colonists were right to protest.

Some people say the colonists were only criminals who destroyed property. But they had asked Parliament for years and nobody listened.

Paul Revere rode at night to warn the militia that the soldiers were coming.`;

const ARTICLES: Record<string, { extract: string; body: string }> = {
  'Boston Tea Party': {
    extract: 'The Boston Tea Party was a protest on December 16, 1773, in which colonists threw 342 chests of tea into Boston harbor. It was organised by the Sons of Liberty.',
    body: 'Parliament answered in 1774 with laws that closed the port of Boston until the tea was paid for.',
  },
  'Paul Revere': {
    extract: 'Paul Revere was an American silversmith who rode at night in April 1775 to warn the militia that British soldiers were coming. He later made engravings.',
    body: 'Revere worked as a silversmith in Boston for forty years and trained a number of apprentices in the trade there.',
  },
};

/** A Wikipedia of two articles. `calls` counts every request. */
export function essayWiki(): WikiLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async search(q) {
      calls.push(`search ${q}`);
      return { hits: ARTICLES[q] ? [{ title: q }] : [] };
    },
    async summary(title) {
      calls.push(`summary ${title}`);
      return { title, extract: ARTICLES[title]!.extract, type: 'standard', content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}` } } };
    },
    async sections(title) {
      calls.push(`sections ${title}`);
      return [
        { title: '', text: ARTICLES[title]!.extract },
        { title: 'History', text: ARTICLES[title]!.body },
      ];
    },
  };
}

/** The fact among those gathered whose sentence holds these words. */
export const factWith = (facts: Pick<Fact, 'id' | 'text'>[], words: string) => facts.find((f) => f.text.includes(words))!;

/**
 * What a writer might submit for ESSAY fitted to an essay, as the brief numbers it: the claim first (sentence 1),
 * then the two reasons (2; 3 and 4), the other side (5 and 6) and Revere (7). It states the Tea Party fact in a
 * sentence of its own, works the Revere fact into a sentence of the writer's, and writes the missing call.
 */
export function essaySubmission(facts: Pick<Fact, 'id' | 'text'>[]): Submission {
  const tea = factWith(facts, '342 chests');
  const revere = factWith(facts, 'silversmith who rode');
  return {
    sense: [],
    liberties: [],
    explanation: 'The claim now comes first, so the reader knows what the reasons are for.',
    paragraphs: [
      { role: 'claim', why: 'A reader should know the claim before the reasons.', sentences: [{ text: 'I am persuaded that the colonists were right to protest.', from: [1], facts: [], added: false }] },
      { role: 'reason', why: 'The first reason follows the claim.', sentences: [{ text: 'Britain, at the end of a long war, laid taxes upon the colonies, and no one spoke for the colonists in Parliament.', from: [2], facts: [], added: false }] },
      {
        role: 'reason',
        why: 'The second reason, with the fact that fixes its date.',
        sentences: [
          { text: 'The Boston Tea Party followed in 1773, when they threw the tea into the harbor.', from: [3], facts: [], added: false },
          { text: 'It was a protest of December 16, 1773, in which 342 chests of tea went into Boston harbor.', from: [], facts: tea ? [tea.id] : [], added: true },
          { text: 'Britain then punished Boston and closed the port.', from: [4], facts: [], added: false },
        ],
      },
      {
        role: 'objection',
        why: 'The other side is stated, then answered.',
        sentences: [
          { text: 'Some will say that the colonists were only criminals who destroyed property.', from: [5], facts: [], added: false },
          { text: 'But they had asked Parliament for years, and nobody listened.', from: [6], facts: [], added: false },
        ],
      },
      {
        role: 'evidence',
        why: 'One man’s ride shows how far the quarrel had gone.',
        sentences: [{ text: 'Paul Revere, a silversmith, rode at night in April 1775 to warn the militia that the soldiers were coming.', from: [7], facts: revere ? [revere.id] : [], added: false }],
      },
      { role: 'call', why: 'An essay ends by saying what to believe.', sentences: [{ text: 'Let the reader judge the colonists, then, as people who had been refused a hearing.', from: [], facts: [], added: true }] },
    ],
  };
}
