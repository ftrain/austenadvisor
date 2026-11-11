// The engine against the built Austen model (npm run build:model); skipped where it is not built.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, authorDbPath } from '../src/db.ts';
import { analyze } from '../src/engine/analyze.ts';
import { austenize } from '../src/engine/austenize.ts';
import { blocksOfText } from '../src/engine/doc.ts';
import { AuthorModel } from '../src/engine/model.ts';
import { concordance, wordProfile } from '../src/engine/tools.ts';
import { buildBrief } from '../src/engine/brief.ts';
import { gate, render, type Submission } from '../src/server/rewrite.ts';
import { explainSentence } from '../src/engine/explain.ts';
import { figureExamples, findFigures, onset } from '../src/engine/figures.ts';

const built = existsSync(authorDbPath('austen'));

describe.skipIf(!built)('the Austen engine', () => {
  const m = built ? AuthorModel.load('austen') : (null as unknown as AuthorModel);

  it('holds her works', () => {
    expect(m.author.works.length).toBeGreaterThanOrEqual(6);
    expect(m.totalWords).toBeGreaterThan(700_000);
    expect(m.word('tolerable')!.count).toBeGreaterThan(40);
  });

  it('flags every word she never wrote, and offers hers', () => {
    const a = analyze(m, blocksOfText('I grabbed my keys. It was super crowded.'));
    const flagged = Object.fromEntries(a.words.map((w) => [w.word, w]));
    expect(Object.keys(flagged)).toEqual(expect.arrayContaining(['grabbed', 'super']));
    expect(flagged.grabbed!.kind).toBe('never');
    expect(flagged.grabbed!.alternatives.map((x) => x.text)).toEqual(expect.arrayContaining(['caught']));
    expect(flagged.super!.alternatives.map((x) => x.text)).toContain('extremely');
    expect(a.words.find((w) => w.word === 'keys')).toBeUndefined();
  });

  it('cites a real sentence for each alternative', () => {
    const a = analyze(m, blocksOfText('He totally ignored me.'));
    const ex = a.words.find((w) => w.word === 'ignored')!.alternatives.find((x) => x.example)!.example!;
    expect(ex.cite).toMatch(/, (ch\. \d+|“.*”), ¶ \d+$/);
    expect(m.cite(ex.id)!.text).toBe(ex.text);
  });

  it('writes out contractions in narration, and says how often she did', () => {
    const a = analyze(m, blocksOfText('I didn’t want to be rude.'));
    const fix = a.advice.find((x) => x.title.includes('did not'))!;
    expect(fix.severity).toBe('fix');
    expect(fix.why).toMatch(/“did not” \d[\d,]* times/);
  });

  it('places a fix in the paragraph, not the sentence, when the sentence is not the first', () => {
    const text = 'I needed milk. I didn’t want to be rude.';
    const a = analyze(m, blocksOfText(text));
    const fix = a.advice.find((x) => x.title.includes('did not'))!;
    expect(text.slice(fix.start, fix.end)).toBe('didn’t');
    const r = fix.replacements![0]!;
    expect(text.slice(r.start, r.end)).toBe('didn’t');
    expect(r.text).toBe('did not');
  });

  it('joins a run of short sentences as she joins clauses', () => {
    const a = analyze(m, blocksOfText('I needed milk. I drove to the shop. It was crowded. I waited.'));
    const join = a.advice.find((x) => x.title.includes('short sentences'))!;
    expect(join.replacements![0]!.text.split(/[.!?](\s|$)/).filter((s) => s.trim()).length).toBeLessThan(4);
  });

  it('rewrites by statistics alone and scores better', () => {
    const r = austenize(m, blocksOfText('I grabbed my keys. It was super crowded. I didn’t want to be rude.'));
    expect(r.scoreAfter).toBeGreaterThan(r.scoreBefore);
    expect(r.after[0]!.text).toContain('did not');
    expect(r.changes.length).toBeGreaterThan(2);
  });

  it('by statistics, puts in only a word of the same sense, and leaves the rest alone, so a second pass changes nothing', () => {
    const text = 'He was already there, scrolling on his phone. I just nodded and said okay. My roommate thought I was overreacting.';
    const r = austenize(m, blocksOfText(text));
    const after = r.after[0]!.text;
    for (const w of ['phone', 'scrolling', 'roommate']) expect(after).toContain(w);
    expect(after).not.toMatch(/countenance|extension|roomy/);
    const again = austenize(m, r.after);
    expect(again.after[0]!.text).toBe(after);
  });

  it('explores a word: by work, neighbours, collocates, sentences', () => {
    const p = wordProfile(m, 'handsome');
    expect(p.works.length).toBeGreaterThan(5);
    expect(p.neighbours).toEqual(expect.arrayContaining(['pretty']));
    expect(p.examples.length).toBeGreaterThan(0);
    expect(concordance(m, 'at last', 5).every((k) => /at last/i.test(k.match))).toBe(true);
  });

  it('briefs a rewrite, gates it, and renders its citations from the corpus', () => {
    const brief = buildBrief(m, blocksOfText('Dear Mom,\n\nI grabbed my keys. It was super crowded.\n\nLove, Jake'));
    expect(brief.register).toBe('letter');
    expect(brief.sentences[1]!.never[0]!.word).toBe('grabbed');
    expect(brief.sentences[1]!.models.length).toBeGreaterThan(0);
    const model = `S${m.moveExamples('judgement', 'keys', 1)[0]!.id}`;
    const bad: Submission = {
      paragraphs: [{ sentences: [{ text: 'Dear Mama,', from: [1], model: 'S1' }] }, { sentences: [{ text: 'I grabbed my keys.', from: [2], model: 'S1' }] }],
      notes: [{ move: 'balance', before: 'a', after: 'b', model: 'S999999999' }],
      explanation: '',
    };
    const problems = gate(m, brief, bad).join(' ');
    expect(problems).toMatch(/never wrote: “grabbed”/);
    expect(problems).toMatch(/Not rendered: sentence 3/);
    expect(problems).toMatch(/Unknown ids: S999999999/);
    const good: Submission = {
      paragraphs: [
        { sentences: [{ text: 'My dear Mama,', from: [1], model }] },
        { sentences: [{ text: 'I caught up my keys with some composure, though the shop was extremely crowded.', from: [2, 3], model: 'S999999999' }] },
        { sentences: [{ text: 'Your affectionate Jake', from: [4], model }] },
      ],
      notes: [1, 2, 3].map(() => ({ move: 'judgement', before: 'b', after: 'with some composure', model })),
      explanation: 'e',
    };
    expect(gate(m, brief, good).join(' ')).toMatch(/inspired it; these do not: “I caught up my keys/);
    good.paragraphs[1]!.sentences[0]!.model = model;
    expect(gate(m, brief, good)).toEqual([]);
    const r = render(m, brief, good);
    // The engine chooses the note's source: a sentence of hers, from the corpus, that makes the move, with its words marked.
    const n0 = r.notes[0]!;
    expect(m.cite(n0.id!)!.text).toBe(n0.austen);
    expect(m.shows(m.author.moves!.find((x) => x.id === 'judgement')!, n0.austen)).toBe(true);
    expect(n0.mark && n0.austen.slice(...n0.mark).length).toBeGreaterThan(2);
    expect(n0.verified).toBe(true);
    expect(r.aligned[1]!.before).toEqual(['I grabbed my keys.', 'It was super crowded.']);
    // Every rewritten sentence: one sentence of why, from the template, and a real sentence of hers.
    for (const a of r.aligned) {
      expect(a.why.split(/(?<=\.)\s+(?=[A-Z])/).length).toBe(1);
      expect(m.cite(a.model.id)!.text).toBe(a.model.text);
    }
    expect(r.aligned[1]!.why).toMatch(/^This sentence uses her “judgement in abstract nouns”, joins two sentences \(4, 4 words\) into one of 14, and replaces “grabbed” with “caught”, “super” with “extremely” \(never in Austen\), modelled on .+, ¶ \d+\.$/);
  });

  it('explains a rewritten sentence by what changed, and links the move it makes', () => {
    const w = explainSentence(m, ['“I’m not ready,” he said.'], 'He said that he was not ready for anything so serious.', null);
    expect(w.why).toMatch(/^This sentence .*(turns quoted speech into reported speech|“speech reported”).*, modelled on .+, ¶ \d+\.$/);
    expect(w.moves).toContain('reported');
    expect(new RegExp(m.author.moves!.find((x) => x.id === 'reported')!.pattern, 'i').test(w.model.text)).toBe(true);
  });

  it('recognizes figures of speech by their form, in her sentences and in a writer’s', () => {
    const terms = (t: string) => findFigures(m, t).map((f) => f.term);
    expect(terms('It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.')).toContain('gnomic');
    expect(terms('She was not unwilling to go, and it was a matter of no small consequence.')).toEqual(['litotes', 'litotes']);
    expect(terms('“Not they indeed,” cried Thorpe.')).not.toContain('litotes');
    expect(terms('He was busy with the instrument in his hand.')).toContain('periphrasis');
    expect(terms('Small heart had Harriet for visiting.')).toContain('inversion');
    expect(terms('She had been wrong, not in her judgement of him, but in her own.')).toContain('antithesis');
    expect(terms('They had walked, and talked, and laughed, and been happy together.')).toContain('polysyndeton');
    expect(terms('It was, I believe, the most awkward ten minutes of my life.')).toEqual(expect.arrayContaining(['parenthesis', 'hyperbole']));
    expect(terms('How could she have been so blind!')).toContain('fid');
    expect(terms('Will you send me my books?')).toContain('fid');
    expect(findFigures(m, 'Will you send me my books?', { letter: true }).map((f) => f.term)).not.toContain('fid');
    // Every example offered for a figure shows it.
    for (const t of ['litotes', 'antithesis', 'tricolon', 'gnomic']) for (const c of figureExamples(m, t, 'a quiet evening at home', 2)) expect(terms(c.text)).toContain(t);
  });

  it('finds litotes in its set forms, and not in a plain denial, a command or a count', () => {
    const lit = (t: string) => findFigures(m, t).filter((f) => f.term === 'litotes').map((f) => f.text);
    expect(lit('He was not a little pleased, and she was not displeased.')).toEqual(['not a little', 'not displeased']);
    expect(lit('The plan was not without merit.')).toEqual(['not without merit']);
    expect(lit('He was no fool, and it was not a bad evening.')).toEqual(['no fool', 'not a bad']);
    expect(lit('The proposal is not, I think, an unreasonable one.')).toEqual(['not, I think, an unreasonable']);
    expect(lit('He wasn’t unkind.')).toEqual(['wasn’t unkind']);
    for (const t of [
      'He was not informed of it.',
      'She was not disposed to go.',
      'She could not without pain think of it.',
      'There was no little boy in the room.',
      'Do not be uneasy.',
      'Was she not unhappy?',
      'She had never been so unhappy.',
      'Touch no unclean thing.',
      'They were not so unjust to him as the others were.',
    ])
      expect(lit(t), t).toEqual([]);
  });

  it('finds periphrasis by a settled phrase or a place’s use, and marks the looser form loose', () => {
    const per = (t: string) => findFigures(m, t).filter((f) => f.term === 'periphrasis');
    expect(per('He was a great favourite with the fair sex.').map((f) => [f.text, !!f.loose])).toEqual([['the fair sex', false]]);
    expect(per('We met at one of those houses where coffee is sold.').map((f) => [f.text, !!f.loose])).toEqual([['one of those houses where coffee is sold', false]]);
    expect(per('He spoke upon that instrument by which the voice is carried to a distance.')[0]).toMatchObject({ text: 'that instrument by which the voice is carried to a distance' });
    expect(per('He was busy with the instrument in his hand.').map((f) => [f.text, f.loose])).toEqual([['the instrument in his hand', true]]);
    // A description after “is” says what a thing is; “thing” describes nothing.
    expect(per('A telephone is an instrument by which the voice is carried.')).toEqual([]);
    expect(per('I read the whole thing in two days.')).toEqual([]);
    // An example offered for the figure is never the loose form.
    for (const c of figureExamples(m, 'periphrasis', 'the lady he loved', 3)) expect(per(c.text).some((f) => !f.loose), c.text).toBe(true);
  });

  it('finds the figures of a sentence’s build, and leaves an ordinary sentence alone', () => {
    const terms = (t: string) => findFigures(m, t).map((f) => f.term);
    const texts = (term: string, t: string) => findFigures(m, t).filter((f) => f.term === term).map((f) => f.text);
    expect(texts('tricolon', 'It was strange, awkward, and distressing.')).toEqual(['strange, awkward, and distressing']);
    expect(texts('tricolon', 'She wished to know where they came from, what they did for a living, and whether they went to church.')).toEqual(['where they came from, what they did for a living, and whether they went to church']);
    expect(texts('tricolon', 'I cleaned the gutters, fixed the sink, and called my grandmother.')).toEqual(['cleaned the gutters, fixed the sink, and called my grandmother']);
    expect(texts('tricolon', 'We bought eggs, milk, and bread.')).toEqual([]);
    expect(texts('tricolon', 'She was proud, vain, idle, and selfish.')).toEqual([]);
    expect(terms('We talked of this and that and the other.')).toContain('polysyndeton');
    expect(terms('I made clean the gutters, and repaired the sink, and called my grandmother.')).toContain('polysyndeton');
    // Three “and”s in a long sentence are not a series.
    expect(terms('I wanted to cry, but did not; I only nodded, and said that it was all very well; and then I walked home in the rain, and ate a whole pint of ice cream.')).not.toContain('polysyndeton');
    expect(terms('There was jealousy and envy in Sparta and Athens.')).not.toContain('polysyndeton');
    expect(terms('She gets the front seat, she gets to stay out later, she got her own room first.')).toContain('anaphora');
    expect(terms('The father, who is a lawyer, seems a good sort of man, and the mother, who lives with him, is his sister, who keeps his house.')).not.toContain('anaphora');
    expect(texts('antithesis', 'The fault was not mine but his own.')).toEqual(['not mine but his own']);
    expect(texts('antithesis', 'He was rather reserved than affable.')).toEqual(['rather reserved than affable']);
    expect(terms('I do not love the place, but I do not hate it either.')).not.toContain('antithesis');
    expect(terms('My memory of it is more vivid than the memory of many places.')).not.toContain('antithesis');
    expect(terms('Never had she seen such a thing.')).toContain('inversion');
    expect(terms('Here is a brief piece of news.')).not.toContain('inversion');
    expect(terms('Domestic happiness is the first of blessings.')).not.toContain('inversion');
    expect(terms('The witnesses were stupid, as witnesses always are.')).toContain('gnomic');
    expect(terms('He had the look of a man who is not at ease.')).not.toContain('gnomic');
    expect(terms('She was late, as she always is.')).not.toContain('gnomic');
  });

  it('finds the figures of repetition and balance, and leaves an ordinary sentence alone', () => {
    const texts = (term: string, t: string) => findFigures(m, t).filter((f) => f.term === term).map((f) => f.text);
    const none = (term: string, ts: string[]) => {
      for (const t of ts) expect(texts(term, t), `${term}: ${t}`).toEqual([]);
    };
    expect(texts('asyndeton', 'I came, I saw, I conquered.')).toEqual(['I came, I saw, I conquered']);
    expect(texts('asyndeton', 'She was proud, vain, selfish.')).toEqual(['proud, vain, selfish']);
    expect(texts('asyndeton', 'He had no money, no friends, no hope.')).toEqual(['no money, no friends, no hope']);
    // A list closed by “and” is the ordinary kind, and “he said” is no member of a series.
    none('asyndeton', ['We bought eggs, milk, and bread.', 'She walked in, sat down, and wept.', 'It wasn’t about me, he said, it was about him.']);
    expect(texts('epistrophe', 'They talked of the people, they voted for the people, they died for the people.')).toHaveLength(1);
    expect(texts('epistrophe', 'We ate a good deal, and slept a good deal.')).toEqual(['We ate a good deal, and slept a good deal']);
    none('epistrophe', ['He came to the house, and she left the house.', 'We have our breakfast on a balcony—on a balcony, if you please.']);
    expect(texts('anadiplosis', 'He gave them hope, and hope gave them strength.')).toEqual(['hope, and hope']);
    expect(texts('anadiplosis', 'I drove to the store. The store was full of people.')).toEqual(['store. The store']);
    // A name taken up again is plain narrative, and a word said twice at once is another figure.
    none('anadiplosis', ['She looked at Jane, and Jane looked away.', 'Come, come, we must go.']);
    expect(texts('chiasmus', 'Fair is foul, and foul is fair.')).toEqual(['Fair is foul, and foul is fair']);
    expect(texts('chiasmus', 'The people were made for kings, not kings for the people.')).toEqual(['people were made for kings, not kings for the people']);
    expect(texts('chiasmus', 'One should eat to live, not live to eat.')).toEqual(['eat to live, not live to eat']);
    none('chiasmus', ['My mother baked cakes for them, and the cakes of my mother went before her.', 'Asa begat Josaphat, and Josaphat begat Joram.']);
    expect(texts('isocolon', 'Many are called, but few are chosen.')).toEqual(['Many are called, but few are chosen']);
    expect(texts('isocolon', 'The walls are yellow; the floor is gray.')).toEqual(['The walls are yellow; the floor is gray']);
    none('isocolon', ['He came home late, and she was already asleep in the chair.']);
    expect(texts('polyptoton', 'Judge not, that ye be not judged.')).toEqual(['Judge not, that ye be not judged']);
    expect(texts('polyptoton', 'He was happy by imitation, and such was his happiness.')).toHaveLength(1);
    // A tense is the same form; two words that only begin alike share no root.
    none('polyptoton', ['It would happen, as it had happened before.', 'He considers the condition of others.', 'Everybody had cleared out, and I saw him helping clean up.', 'I thought the thought again.']);
  });

  it('names a question rhetorical only on evidence, and a hypophora only with its answer', () => {
    const texts = (term: string, t: string, opts = {}) => findFigures(m, t, opts).filter((f) => f.term === term).map((f) => f.text);
    for (const t of ['Who would not wish to be happy?', 'Is it not strange that nobody came?', 'What could be more natural?', 'Why should the artist be troubled by criticism?'])
      expect(texts('rhetoricalquestion', t), t).toEqual([t]);
    // A plain question asks for an answer, in a letter or anywhere.
    for (const t of ['Can you send more snacks?', 'Will you send me my books?', 'What time does the bus leave?', 'Did you get my letter?', 'Who is Mr. Ladislaw?', 'Will not your honours bear me company?', 'She could not repress the question, “Who is Mr. Ladislaw?”']) {
      expect(texts('rhetoricalquestion', t), t).toEqual([]);
      expect(texts('rhetoricalquestion', t, { letter: true }), t).toEqual([]);
    }
    expect(texts('hypophora', 'But has he ever looked at the numbers? I think not.')).toEqual(['But has he ever looked at the numbers? I think not.']);
    expect(texts('hypophora', 'Why did we lose? Because we did not try.')).toHaveLength(1);
    expect(texts('hypophora', 'What did he want? He wanted money.')).toHaveLength(1);
    // The answer may be the next sentence, handed in by the caller.
    expect(texts('hypophora', 'Why did we lose?', { next: 'Because we did not try.' })).toEqual(['Why did we lose?']);
    // A comment is no answer, and another speaker's answer is a conversation.
    for (const t of ['What is the result if the children fall behind? That is the true question.', 'How are you? I am well.', '“Where is she?” “She is in the garden.”', 'What shall the parents do? My adversary made no mention of it.'])
      expect(texts('hypophora', t), t).toEqual([]);
    // A question that is answered is not also called rhetorical.
    expect(texts('rhetoricalquestion', 'Who would not wish it? Nobody.')).toEqual([]);
  });

  it('hears alliteration by sound, not by letter', () => {
    expect(['city', 'cat', 'phone', 'fine', 'knee', 'write', 'who', 'why', 'hour', 'chorus', 'chair', 'gentle', 'girl', 'one', 'use', 'psalm', 'apple'].map(onset)).toEqual(
      ['s', 'k', 'f', 'f', 'n', 'r', 'h', 'w', '', 'k', 'ch', 'j', 'g', 'w', 'y', 's', ''],
    );
    const texts = (t: string) => findFigures(m, t).filter((f) => f.term === 'alliteration').map((f) => f.text);
    expect(texts('The counselors keep a close watch on us.')).toEqual(['counselors keep a close']);
    expect(texts('The city sent six cellists to the hall.')).toEqual(['city sent six cellists']);
    expect(texts('He took the phone and found a fine photograph.')).toEqual(['phone and found a fine photograph']);
    expect(texts('He knew no nicer neighbour.')).toEqual(['knew no nicer neighbour']);
    // One letter, two sounds; two words are not three; a word repeated is not alliteration; small words do not count.
    for (const t of ['The cat sat in the city centre.', 'She had a big brown dog.', 'It was a long, long lane.', 'We can’t cork that bottle.', 'The printers came, the paper presently died.']) expect(texts(t), t).toEqual([]);
  });

  it('finds the periodic sentence, apostrophe, simile and correction by their forms', () => {
    const texts = (term: string, t: string) => findFigures(m, t).filter((f) => f.term === term).map((f) => f.text);
    const none = (term: string, ts: string[]) => {
      for (const t of ts) expect(texts(term, t), `${term}: ${t}`).toEqual([]);
    };
    expect(texts('periodic', 'When the rain had stopped, and the guests had gone, she sat down by the fire.')).toHaveLength(1);
    expect(texts('periodic', 'If the reader will refer to the letter, to the notes, to the diary, he will understand these words.')).toHaveLength(1);
    // A main clause in the middle, or first, is no periodic sentence.
    none('periodic', [
      'When she was tired of playing she came out, but though she hunted high and low, she could find them nowhere.',
      'In a few minutes he reached the nest, and laying her down among the eaglets, he flew away.',
      'She sat down by the fire, when the rain had stopped, and the guests had gone.',
      'Well, my dear, if you say so, I will go.',
    ]);
    expect(texts('apostrophe', 'O Death, where is thy sting?')).toEqual(['O Death']);
    expect(texts('apostrophe', 'Ye hills, why do you look down on me?')).toEqual(['Ye hills']);
    // A prayer, a person, a cry, and plain “thou art”.
    none('apostrophe', ['O Lord, hear my prayer, for thou art good.', 'O Romeo, wherefore art thou Romeo?', 'O Henry, ope thine eyes!', 'O cursed spite, that ever I was born to set it right!', 'Thou art needlessly rough, methinks.']);
    expect(texts('simile', 'He ran like a hare.')).toEqual(['like a hare']);
    expect(texts('simile', 'She was as cold as ice.')).toEqual(['as cold as ice']);
    expect(texts('simile', 'Her face was pale as death.')).toEqual(['pale as death']);
    expect(texts('simile', 'My bedfellow snores like a whole herd.')).toEqual(['like a whole herd']);
    none('simile', [
      'I like a good book.',
      'I would like a cup of tea.',
      'We need things like education and research.',
      'It smells like detergent.',
      'He looks like a good man.',
      'She is as tall as her brother.',
      'Come as soon as you can.',
      'He was known as a writer.',
      'She plays as well as a professional.',
    ]);
    expect(texts('epanorthosis', 'It was a mistake, or rather a blunder.')).toEqual(['or rather']);
    expect(texts('epanorthosis', 'He was rude, nay, insolent to her.')).toEqual(['nay']);
    expect(texts('epanorthosis', 'The father was single; or, to speak more exactly, divorced.')).toEqual(['or, to speak more exactly']);
    none('epanorthosis', ['I would rather go than stay.', '“Nay, sir, I will not.”', 'He would sooner walk or rather than ride.']);
    // Litotes by distance: “far from” before a describing word, after a verb of being.
    const lit = (t: string) => texts('litotes', t);
    expect(lit('He was very far from wrong.')).toEqual(['far from wrong']);
    expect(lit('She was far from unhappy, and he was far from being poor.')).toEqual(['far from unhappy', 'far from being poor']);
    for (const t of ['They were far from home.', 'He was not far from wrong.', 'I am far from agreeing with you.', 'She had wandered far from the subject.']) expect(lit(t), t).toEqual([]);
  });

  it('names what a rewrite did with each word she never wrote: replaced, rendered by periphrasis, or dropped', () => {
    const w = explainSentence(m, ['He talked on his phone and wore a hoodie.'], 'He was busy with the instrument in his hand.', null);
    expect(w.why).toMatch(/renders “phone” \(“the instrument in his hand”\) by periphrasis/);
    expect(w.why).toMatch(/drops “hoodie”/);
    expect(w.dropped).toEqual(['hoodie']);
    const l = explainSentence(m, ['Camp is okay.'], 'Camp is not intolerable.', null);
    expect(l.why).toMatch(/makes a litotes \(“not intolerable”\)/);
  });

  it('reads a page quickly once warm', () => {
    const text = 'It was a bright cold day. The clocks were striking. '.repeat(40);
    analyze(m, blocksOfText(text));
    const t = performance.now();
    analyze(m, blocksOfText(text + ' One more sentence here.'));
    expect(performance.now() - t).toBeLessThan(400);
  });
});

// Every voice's report is built from its own numbers, in its own pronouns.
const builtVoices = ['austen', 'eliot', 'fairy', 'kjv', 'obama', 'shakespeare', 'twain'].filter((id) => existsSync(authorDbPath(id)));
const reportText = [
  'I went to the store. It was late. The lights were off. I didn’t know what to do. We waited by the door.',
  'My brother said we should go home. He wasn’t sure. The coffee shop was closed and the street was quiet.',
  'We walked back in the rain. Nobody spoke. It wasn’t far, but it felt long, and the dog was cold and tired and wet.',
  'In the morning we tried again. The store was open. We bought bread, milk, eggs and apples, and we went home happy. '.repeat(1),
]
  .join('\n\n')
  .concat('\n\n', 'It was a plain day and we did plain things, as people do when nothing much is wrong. '.repeat(16));

describe('reports for every voice', () => {
  for (const id of builtVoices)
    it(`says nothing of ${id} that is another voice’s habit`, { timeout: 120_000 }, () => {
      const v = AuthorModel.load(id);
      const a = analyze(v, blocksOfText(reportText));
      const lines = [...a.report.measures.map((x) => x.explain), ...a.advice.flatMap((x) => [x.title, x.message, x.why])];
      expect(lines.length).toBeGreaterThan(5);
      if (v.author.pronouns?.subject !== 'she') for (const l of lines) expect(l).not.toMatch(/\b(her|hers|heroine)\b/i);
      if (id === 'obama') {
        for (const l of lines) {
          expect(l).not.toMatch(/one sentence in three has/);
          expect(l).not.toMatch(/writes “do not”/);
        }
        expect(a.report.measures.find((x) => x.label.startsWith('Semicolons'))!.explain).toMatch(/one semicolon in about \d+ sentences/);
      }
    });
});

describe.skipIf(!builtVoices.includes('shakespeare'))('free indirect discourse in a play', () => {
  it('is not found in speech, which a play leaves unquoted', { timeout: 120_000 }, () => {
    const v = AuthorModel.load('shakespeare');
    const lines = [
      'O Mother, O Father, hear me!',
      'What light through yonder window breaks?',
      'Is this a dagger which I see before me?',
      'A horse! a horse! my kingdom for a horse!',
      'Wherefore art thou Romeo?',
      'Out, damned spot! out, I say!',
      'How now, my lord, what news?',
      'Shall I compare thee to a summer’s day?',
      'Alas, poor Yorick!',
      'Et tu, Brute?',
      'What’s in a name?',
      'O, what a rogue and peasant slave am I!',
      'Who’s there?',
      'Is it not strange, my lord?',
      'Get thee to a nunnery!',
      'Why, then the world’s mine oyster!',
      'What fools these mortals be!',
      'Hath not a Jew eyes?',
      'Now is the winter of our discontent made glorious summer by this sun of York!',
      'Will you walk out of the air, my lord?',
    ];
    expect(lines.filter((l) => findFigures(v, l).some((f) => f.term === 'fid'))).toEqual([]);
  });
});

describe('the page’s styles', () => {
  it('keeps the brand tile’s class for the brand tile alone', () => {
    const css = readFileSync(join(ROOT, 'src/web/page.css'), 'utf8');
    const page = readFileSync(join(ROOT, 'src/web/rewrite-page.ts'), 'utf8');
    expect(css.match(/\.pg-mark\b/g)).toHaveLength(1);
    expect(page.match(/pg-mark\b/g)).toHaveLength(1);
    expect(page).toMatch(/class: 'pg-brand'.*class: 'pg-mark'/);
  });
});
