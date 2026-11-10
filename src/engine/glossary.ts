// The glossary: every term of rhetoric, poetics and grammar that Advisor uses, defined in a line a writer can use.
// The page defines a term where it uses it (a note's heading, a word in a note or a plan); the CLI and the API look
// one up. This list is the source; data/glossary.sqlite is built from it (rebuilt whenever the list changes), with a
// row for every name a term goes by and a full-text index, so that the server, the CLI and a voice's build query one
// store. Figures the engine recognizes (figures.ts) are terms here too, under the same ids.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { DATA, open, tx } from '../db.ts';
import { FIGURES } from './figures.ts';
import type { GlossaryEntry } from './terms.ts';
export { findTerms, type GlossaryEntry } from './terms.ts';

export type TermKind = 'figure' | 'sound' | 'verse' | 'sentence' | 'narrative' | 'argument' | 'diction' | 'role';

export interface Term {
  id: string;
  /** The name as a heading gives it: “Litotes”. */
  term: string;
  kind: TermKind;
  /** What it is, in a sentence, for a writer. */
  definition: string;
  /** A short example; `source` says where it is, when it is a quotation. */
  example?: string;
  source?: string;
  /** Other names and forms it goes by (“anastrophe”, “ironic”); plurals are found without being listed. */
  also?: string[];
  /** Not marked where the words before it match this (“set aside” is not an aside). */
  unless?: string;
}

const T = (id: string, term: string, kind: TermKind, definition: string, rest: Partial<Term> = {}): Term => ({ id, term, kind, definition, ...rest });

const BASE: Term[] = [
  // Figures of speech: the classical names for turns of phrase.
  T('antithesis', 'Antithesis', 'figure', 'Contrary ideas set against each other in balanced words, so each sharpens the other.', { example: 'It was the best of times, it was the worst of times.', source: 'Dickens, A Tale of Two Cities', also: ['antitheses', 'not this, but that'] }),
  T('chiasmus', 'Chiasmus', 'figure', 'Two phrases whose terms come back in reverse order (A B, B A), so the second answers the first.', { example: 'Ask not what your country can do for you—ask what you can do for your country.', source: 'Kennedy, inaugural address', also: ['antimetabole', 'chiastic'] }),
  // Litotes is a kind of understatement, and a writer needs only one name to look up: one term answers to both.
  T('litotes', 'Litotes (understatement)', 'figure', 'Saying less than the case warrants, often by denying the opposite, so the reader supplies the rest.', { example: '“not unwilling”, “no small matter”', also: ['understatement', 'understated', 'understatements', 'meiosis', 'understatement and litotes'] }),
  T('hyperbole', 'Hyperbole', 'figure', 'Exaggeration not meant to be taken literally, for emphasis or comedy.', { example: '“the most awkward ten minutes of my life”', also: ['exaggeration'] }),
  T('periphrasis', 'Periphrasis', 'figure', 'Naming a thing by a description of it rather than by its name, to dignify it, distance it or make it strange.', { example: '“the instrument in his hand” for a phone', also: ['circumlocution'] }),
  T('tricolon', 'Tricolon', 'figure', 'Three parallel words, phrases or clauses in a row, often rising to the last.', { example: 'Emma Woodhouse, handsome, clever, and rich', source: 'Austen, Emma, ch. 1', also: ['tricola', 'rule of three', 'building in threes', 'things in threes'] }),
  T('polysyndeton', 'Polysyndeton', 'figure', 'Many conjunctions (“and … and … and”) where commas would do, so each item lands on its own.', { example: 'And the rain descended, and the floods came, and the winds blew, and beat upon that house; and it fell not.', source: 'Matthew 7:25' }),
  T('asyndeton', 'Asyndeton', 'figure', 'The conjunctions left out of a series, for speed or force.', { example: 'I came, I saw, I conquered.', source: 'Julius Caesar, as Plutarch reports him' }),
  T('anaphora', 'Anaphora', 'figure', 'Successive clauses or sentences opening with the same words.', { example: 'We shall fight on the beaches, we shall fight on the landing grounds, we shall fight in the fields and in the streets.', source: 'Churchill, 4 June 1940' }),
  T('epistrophe', 'Epistrophe', 'figure', 'Successive clauses ending with the same words.', { example: 'government of the people, by the people, for the people', source: 'Lincoln, the Gettysburg Address' }),
  T('parallelism', 'Parallelism', 'figure', 'Like things said in like grammatical form, so the form shows they belong together. In Hebrew poetry, and so in the King James Bible, one thought said twice, the second half echoing the first in other words.', { example: 'Pride goeth before destruction, and an haughty spirit before a fall.', source: 'Proverbs 16:18', also: ['parallel', 'parallels'] }),
  T('isocolon', 'Isocolon', 'figure', 'Clauses of the same length and build set side by side, so the sentence balances.', { also: ['balance', 'balanced clauses', 'balanced period', 'balanced periods'] }),
  T('climax', 'Climax', 'figure', 'Words or clauses arranged in rising order of weight, the strongest last.', { also: ['gradatio', 'crescendo'] }),
  T('anticlimax', 'Anticlimax', 'figure', 'A fall, by design, from the grand to the trivial at the end of a series; called bathos when it is not by design.', { example: 'Here thou, great Anna! whom three realms obey, / Dost sometimes counsel take—and sometimes tea.', source: 'Pope, The Rape of the Lock', also: ['bathos'] }),
  T('zeugma', 'Zeugma', 'figure', 'One word made to govern two others in different senses, so the sentence turns on it.', { example: 'Or stain her honour, or her new brocade', source: 'Pope, The Rape of the Lock', also: ['syllepsis'] }),
  T('apostrophe', 'Apostrophe', 'figure', 'Turning to address someone absent or dead, or a thing or an idea, as if it could hear.', { example: 'O death, where is thy sting? O grave, where is thy victory?', source: '1 Corinthians 15:55' }),
  T('metaphor', 'Metaphor', 'figure', 'Calling one thing another, so it carries the other’s qualities across.', { example: 'All the world’s a stage', source: 'As You Like It 2.7', also: ['metaphorical'] }),
  T('simile', 'Simile', 'figure', 'A likeness drawn openly, with “like” or “as”.', { example: 'O my luve’s like a red, red rose', source: 'Burns' }),
  T('conceit', 'Conceit', 'figure', 'A metaphor carried far and followed through, often surprising: two lovers as the legs of a compass.', { source: 'Donne, “A Valediction: Forbidding Mourning”', unless: '(self|his own|her own|my own)[-\\s]$' }),
  T('image', 'Image', 'figure', 'Words that make the reader see, hear or feel a thing; in Shakespeare, a figure followed out from one phrase to the next.', { example: 'to take arms against a sea of troubles', source: 'Hamlet 3.1', also: ['imagery', 'the image'] }),
  T('personification', 'Personification', 'figure', 'A thing or an idea given a person’s qualities or acts.', { example: 'But look, the morn, in russet mantle clad, / Walks o’er the dew of yon high eastward hill.', source: 'Hamlet 1.1', also: ['personified', 'prosopopoeia'] }),
  T('synecdoche', 'Synecdoche', 'figure', 'A part named for the whole, or the whole for a part: “all hands on deck”.'),
  T('metonymy', 'Metonymy', 'figure', 'A thing named by something closely tied to it: “the Crown” for the monarch, “the pen” for writing.'),
  T('oxymoron', 'Oxymoron', 'figure', 'Two words of contrary sense joined, so the contradiction says something neither could.', { example: 'O brawling love! O loving hate!', source: 'Romeo and Juliet 1.1' }),
  T('paradox', 'Paradox', 'figure', 'A statement that seems to contradict itself and yet holds.', { example: 'The Child is father of the Man', source: 'Wordsworth', also: ['paradoxical'] }),
  T('pun', 'Pun', 'figure', 'A play on two senses of one word, or on two words that sound alike.', { example: 'Now is the winter of our discontent / Made glorious summer by this sun of York', source: 'Richard III 1.1 (sun, son)', also: ['wordplay', 'quibble'] }),
  T('epigram', 'Epigram', 'figure', 'A short, pointed, witty saying, often turning on a surprise.', { example: 'I can resist everything except temptation.', source: 'Wilde, Lady Windermere’s Fan', also: ['epigrammatic'] }),
  T('aphorism', 'Aphorism', 'figure', 'A general truth put briefly enough to remember.', { example: 'Brevity is the soul of wit.', source: 'Hamlet 2.2', also: ['maxim', 'maxims', 'proverb', 'sententia'] }),
  T('gnomic', 'Generalization (gnomic statement)', 'figure', FIGURES.gnomic!.gloss, { example: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', source: 'Austen, Pride and Prejudice, ch. 1', also: ['gnomic', 'gnomic statement', 'generalization', 'general truth'] }),
  T('irony', 'Irony', 'figure', 'Saying one thing so that another is understood, or a turn of events the reverse of what was meant.', { also: ['ironic', 'ironically', 'ironies'] }),
  T('ironicverdict', 'Ironic verdict', 'figure', FIGURES.irony!.gloss, { also: ['ironic verdict'] }),
  T('aside', 'Aside', 'narrative', 'In a play, words spoken to the audience that the others on stage do not hear; in a story, the teller breaking off to comment, confide or correct himself.', { also: ['ironic aside', 'narrator’s aside', 'asides'], unless: '\\b(set|sets|setting|put|puts|putting|lay|laid|lays|cast|casts|brush|brushed|step|stepped|steps|stand|stood|turn|turned|leave|left|leaving|push|pushed|draw|drew|took|take|taking|move|moved|moves|moving|stepped)\\s+((it|them|this|that|him|her|these|those|everything|all)\\s+)?$' }),
  T('parenthesis', 'Parenthesis', 'sentence', FIGURES.parenthesis!.gloss, { also: ['parenthetical'] }),
  T('inversion', 'Inversion (anastrophe)', 'sentence', 'The usual order of words turned about, so the word that matters comes first or last.', { example: 'For whom the Lord loveth he chasteneth', source: 'Hebrews 12:6', also: ['anastrophe', 'inverted', 'inverted order'] }),
  T('rhetoricalquestion', 'Rhetorical question', 'figure', 'A question asked for its effect, its answer taken for granted.', { also: ['rhetorical questions', 'erotema'] }),
  T('hypophora', 'Hypophora', 'figure', 'The speaker asks a question and answers it, so the hearer follows the thought as it is made.', { example: 'What is a man, / If his chief good and market of his time / Be but to sleep and feed? A beast, no more.', source: 'Hamlet 4.4', also: ['question and answer', 'the question turned over'] }),
  T('epithet', 'Epithet', 'diction', 'A word or phrase fixed to a name to describe it: “rosy-fingered Dawn”, “the youngest son”.', { also: ['epithets'] }),

  // Sound and verse.
  T('alliteration', 'Alliteration', 'sound', 'Words close together beginning with the same sound.', { example: 'Full fathom five thy father lies', source: 'The Tempest 1.2', also: ['alliterative'] }),
  T('assonance', 'Assonance', 'sound', 'The same vowel sound repeated in nearby words.'),
  T('cadence', 'Cadence', 'sound', 'The rise and fall of a sentence’s rhythm, above all as it closes.', { also: ['cadences'] }),
  T('rhythm', 'Rhythm', 'sound', 'The pattern of stressed and unstressed syllables a sentence or a line makes when read aloud.', { also: ['metre', 'meter'] }),
  T('iamb', 'Iamb', 'verse', 'A foot of two syllables, unstressed then stressed: da-DUM, “be-HOLD”.', { also: ['iambic', 'iambs'] }),
  T('pentameter', 'Iambic pentameter', 'verse', 'A line of five iambs, ten syllables, da-DUM five times: the line of English verse from Chaucer to Wordsworth.', { example: 'But, soft! what light through yonder window breaks?', source: 'Romeo and Juliet 2.2', also: ['iambic pentameter', 'pentameter'] }),
  T('blankverse', 'Blank verse', 'verse', 'Unrhymed iambic pentameter: the verse of Shakespeare’s plays and Milton’s Paradise Lost.', { example: 'To be, or not to be: that is the question', source: 'Hamlet 3.1', also: ['blank verse'] }),
  T('couplet', 'Couplet', 'verse', 'Two lines that rhyme together; Shakespeare closes a scene or a sonnet with one.', { example: 'So long as men can breathe or eyes can see, / So long lives this, and this gives life to thee.', source: 'Sonnet 18', also: ['rhyming couplet', 'couplets'] }),
  T('sonnet', 'Sonnet', 'verse', 'A poem of fourteen lines; Shakespeare’s are three quatrains of alternating rhyme and a closing couplet, the argument turning near the end.', { also: ['sonnets'] }),
  T('volta', 'Volta', 'verse', 'The turn in a sonnet, where the argument changes direction.'),
  T('soliloquy', 'Soliloquy', 'narrative', 'A speech in which a character alone on stage thinks aloud, so we overhear a mind at work.', { example: 'To be, or not to be: that is the question', source: 'Hamlet 3.1', also: ['soliloquies'] }),
  T('refrain', 'Refrain', 'sound', 'A line or phrase that returns at intervals, in a song, a poem or a speech.', { also: ['refrains'] }),
  T('formula', 'Formula', 'diction', 'A set phrase that comes back whenever the same moment does: “Once upon a time”, “And it came to pass”, “happily ever after”.', { also: ['formulas', 'formulae', 'formulaic'] }),

  // The sentence.
  T('clause', 'Clause', 'sentence', 'A group of words with its own subject and verb; a sentence is one clause or several joined.', { also: ['clauses'] }),
  T('mainclause', 'Main clause', 'sentence', 'The clause that can stand alone as a sentence and carries its chief assertion.', { also: ['main clause', 'independent clause'] }),
  T('subordinateclause', 'Subordinate clause', 'sentence', 'A clause that cannot stand alone, hung on another by “because”, “although”, “which”, “when”.', { also: ['subordinate clause', 'dependent clause', 'subordination', 'subordinate'] }),
  T('period', 'Period', 'sentence', 'A long sentence of several clauses built as one whole, the sense held until it closes: the unit of Johnson’s and Austen’s thought.', { also: ['periods'], unless: '\\b(time|trial|long|short|brief|same|whole|grace|waiting|holiday|sixty-day|ninety-day|that|this)\\s+$' }),
  T('periodic', 'Periodic sentence', 'sentence', 'A sentence that holds its main point to the end, after its qualifications, so the reader waits for it.', { also: ['periodic sentence', 'periodic sentences', 'periodic'] }),
  T('cumulative', 'Cumulative sentence', 'sentence', 'A sentence that states its main clause first and then piles detail after it, “and … and …”, building to a turn.', { also: ['cumulative sentence', 'loose sentence'] }),
  T('qualifiedperiod', 'The qualified period', 'sentence', 'A long sentence that corrects and qualifies itself as it goes, so the reader sees the thought being refined.', { also: ['qualified period'] }),
  T('parataxis', 'Parataxis', 'sentence', 'Clauses set side by side as equals, joined by “and” or by nothing, so the reader draws the connections.', { example: 'And God said, Let there be light: and there was light.', source: 'Genesis 1:3', also: ['paratactic', 'clauses laid side by side'] }),
  T('hypotaxis', 'Hypotaxis', 'sentence', 'Clauses placed one under another (because, although, which), so the sentence itself shows how things depend.', { also: ['hypotactic'] }),
  T('apposition', 'Apposition', 'sentence', 'A noun phrase set beside another to rename or explain it.', { example: 'Paul, an apostle of Jesus Christ by the will of God', source: 'Ephesians 1:1', also: ['appositive', 'appositives', 'in apposition'] }),
  T('syntax', 'Syntax', 'sentence', 'The order and arrangement of words in a sentence.', { also: ['syntactic'] }),
  T('genitive', 'The genitive with “of”', 'sentence', 'Possession or kind given by “of” rather than by “’s”: “the house of the LORD”.', { also: ['genitive'] }),

  // Words.
  T('diction', 'Diction', 'diction', 'The choice of words: plain or ornate, Saxon or Latin, old or new.'),
  T('register', 'Register', 'diction', 'The level of a language suited to an occasion: the words and manner of a sermon, a memo, a text to a friend.', { also: ['registers'], unless: '\\b(cash|the|a)\\s+$' }),
  T('vernacular', 'Vernacular', 'diction', 'The everyday spoken language of a place and its people, rather than the literary or the formal.'),
  T('dialect', 'Dialect', 'diction', 'The speech of a region or a group, its words and grammar, often spelled to show how it sounds.', { also: ['dialects'] }),
  T('archaism', 'Archaism', 'diction', 'A word or form already old when it is used, for solemnity or colour: “thou”, “unto”, “wherefore”.', { also: ['archaic', 'archaisms'] }),
  T('thou', 'Thou and you', 'diction', 'Early Modern English kept two words for “you”: “thou” for one person close to you, below you, or God, and “you” for a superior or for more than one; the choice says how the speaker stands to the hearer.', { also: ['thou and thee', 'thou-form'] }),
  T('abstractnoun', 'Abstract noun', 'diction', 'A noun for a quality or a state rather than a thing: civility, propriety, vanity. Austen and Eliot judge with them.', { also: ['abstract noun', 'abstract nouns'] }),
  T('interjection', 'Interjection', 'diction', 'A word thrown in to express feeling, outside the grammar of the sentence: alas, fie, O.', { also: ['interjections'] }),

  // Narrative.
  T('fid', 'Free indirect discourse', 'narrative', 'A character’s thoughts given in the narrator’s sentences, without “she thought” or quotation marks, so the two voices blend.', { example: 'She would not go. Why should she go, only to be laughed at?', also: ['free indirect style', 'free indirect speech', 'free indirect'] }),
  T('reported', 'Reported speech', 'narrative', 'Speech given in the narrator’s words (“he said that he was not ready”) rather than quoted.', { also: ['reported speech', 'indirect speech', 'speech reported'] }),
  T('deadpan', 'Deadpan', 'narrative', 'Absurd or comic matter told with a straight face, the teller giving no sign it is funny.'),
  T('talltale', 'Tall tale', 'narrative', 'A story of impossible feats or numbers told as plain fact.', { also: ['tall tale', 'tall tales'] }),
  T('frame', 'Frame story', 'narrative', 'A story set inside another, the outer one giving the occasion for the telling.', { also: ['frame story', 'frame narrative', 'frame tale'] }),
  T('omniscient', 'Omniscient narrator', 'narrative', 'A teller who knows what every character thinks and may comment on all of them.', { also: ['omniscient narrator', 'omniscient'] }),
  T('narratorwe', 'The narrator’s “we”', 'narrative', 'The narrator stepping back from the case to what is true of us all, and taking the reader along.', { also: ['narrator’s “we”'] }),
  T('digression', 'Digression', 'narrative', 'A turn away from the matter in hand, and back.', { also: ['digressions', 'digresses'] }),
  T('catalogue', 'Catalogue', 'narrative', 'A list given at length, for its weight, its music or its comedy.', { also: ['catalog'] }),
  T('inmediasres', 'In medias res', 'narrative', 'Beginning in the middle of the action, and filling in what came before later.'),
  T('exemplum', 'Exemplum', 'argument', 'A story told to make a point: one person’s case standing for many.', { also: ['exempla', 'one person standing for many'] }),

  // Argument: how a case is built (the parts of a classical oration, and the appeals).
  T('ethos', 'Ethos', 'argument', 'Persuasion by the speaker’s character: why the hearer should trust the one speaking.'),
  T('pathos', 'Pathos', 'argument', 'Persuasion by feeling: moving the hearer to care.'),
  T('logos', 'Logos', 'argument', 'Persuasion by reasoning and evidence.'),
  T('exordium', 'Exordium', 'argument', 'The opening of a speech or an argument, which wins the hearer’s attention and good will.'),
  T('narratio', 'Narratio', 'argument', 'The statement of the facts of the case, before the argument about them.'),
  T('confirmatio', 'Confirmatio', 'argument', 'The proof: the reasons and evidence for the claim.'),
  T('refutation', 'Refutation', 'argument', 'Answering the other side: taking an objection and showing why it fails.', { also: ['refutatio', 'rebuttal'] }),
  T('concession', 'Concession', 'argument', 'Granting a point to the other side, the better to carry the larger one.', { also: ['concessions', 'concedes', 'conceding'] }),
  T('procatalepsis', 'Procatalepsis', 'argument', 'Raising an objection before the hearer can, and answering it.', { also: ['prolepsis', 'anticipating the objection'] }),
  T('peroration', 'Peroration', 'argument', 'The close of a speech or an argument: the case gathered up and the hearer moved to act.', { also: ['perorations'] }),
  T('calltoaction', 'Call to action', 'argument', 'What the reader is asked to do, said plainly, usually at the end.', { also: ['call to action'] }),
  T('enthymeme', 'Enthymeme', 'argument', 'An argument with one premise left unsaid for the hearer to supply: “He is a politician, so of course he lied.”'),
  T('thesis', 'Thesis', 'argument', 'The claim a piece of writing sets out to prove, stated so it could be disputed.'),
];

/**
 * The parts of a piece of writing that the structure line names (claim, reason, scene, close), from
 * src/engine/roles.json, so the page can define a role word where it shows one. The file maps each role to its
 * definition, as `{"claim": "..."}`, `{"claim": {"name": "Claim", "definition": "..."}}` or a list of such objects.
 * Other fields of a role are ignored. A role whose name a term already has is left to that term; “part”, the label
 * for a paragraph with no clear role, is not a term.
 */
export function rolesOf(raw: unknown, taken: Term[] = BASE): Term[] {
  const src = raw && typeof raw === 'object' && 'roles' in raw ? (raw as { roles: unknown }).roles : raw;
  const items: { id: string; name?: string; definition?: string }[] = Array.isArray(src)
    ? (src as { id: string; name?: string; definition?: string }[])
    : Object.entries((src ?? {}) as Record<string, unknown>).map(([id, v]) => (typeof v === 'string' ? { id, definition: v } : { id, ...(v as object) }));
  const names = new Set(taken.flatMap(namesOf));
  const out: Term[] = [];
  for (const r of items) {
    if (!r?.id || typeof r.definition !== 'string' || r.id === 'part') continue;
    const name = (r.name ?? r.id).trim();
    if (names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    // “Close” and “call” are everyday words: a role is defined where the page shows it as a label, by roleTerm,
    // and never marked in running prose (an `unless` that always matches).
    out.push(T(`role-${r.id}`, name[0]!.toUpperCase() + name.slice(1), 'role', r.definition.trim(), { unless: '^' }));
  }
  return out;
}

const ROLES_FILE = join(dirname(fileURLToPath(import.meta.url)), 'roles.json');
function loadRoles(): Term[] {
  try {
    return existsSync(ROLES_FILE) ? rolesOf(JSON.parse(readFileSync(ROLES_FILE, 'utf8'))) : [];
  } catch {
    return [];
  }
}

/** Every term: the list above, then the roles. */
export const TERMS: Term[] = [...BASE, ...loadRoles()];

/** The glossary id of a role word: “claim” is defined under “role-claim”. */
export const roleTerm = (role: string): string => `role-${role}`;

let byName: Map<string, Term> | null = null;
/**
 * A term by any of its names or its id, from the list in memory (no store): “understatement” and “litotes” are the
 * same term. Used where the engine must tell whether two names mean one thing.
 */
export function termOf(name: string): Term | undefined {
  if (!byName) {
    byName = new Map();
    for (const t of TERMS) {
      if (!byName.has(t.id)) byName.set(t.id, t);
      for (const n of namesOf(t)) if (!byName.has(n)) byName.set(n, t);
    }
  }
  const n = name.trim().toLowerCase().replace(/'/g, '’');
  return byName.get(n) ?? byName.get(n.replace(/(es|s)$/, ''));
}

const glossaryPath = () => join(DATA, 'glossary.sqlite');
const fingerprint = () => createHash('sha1').update(JSON.stringify(TERMS)).digest('hex');

/** Every name a term is found by: its heading, its other names, the engine's name for it when it is a figure. */
export function namesOf(t: Term): string[] {
  const figure = FIGURES[t.id === 'ironicverdict' ? 'irony' : t.id]?.name;
  const base = [t.term, ...(t.also ?? []), ...(figure && t.id !== 'irony' ? [figure] : [])];
  // “Inversion (anastrophe)” is found as “inversion” too.
  const bare = base.map((n) => n.replace(/\s*\(.*\)$/, ''));
  return [...new Set([...base, ...bare].map((n) => n.toLowerCase().replace(/'/g, '’')))];
}

/** Writes the glossary to SQLite: a row a term, a row a name, and a full-text index over term, definition, example. */
export function buildGlossary(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE IF EXISTS glossary_fts; DROP TABLE IF EXISTS glossary_names; DROP TABLE IF EXISTS glossary;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE glossary (id TEXT PRIMARY KEY, term TEXT NOT NULL, kind TEXT NOT NULL, definition TEXT NOT NULL, example TEXT, source TEXT, unless TEXT, ord INTEGER NOT NULL);
    CREATE TABLE glossary_names (name TEXT PRIMARY KEY, id TEXT NOT NULL REFERENCES glossary(id));
    CREATE VIRTUAL TABLE glossary_fts USING fts5(id UNINDEXED, term, definition, example, names, tokenize = 'porter unicode61');
  `);
  const term = db.prepare('INSERT INTO glossary (id, term, kind, definition, example, source, unless, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const name = db.prepare('INSERT OR IGNORE INTO glossary_names (name, id) VALUES (?, ?)');
  const fts = db.prepare('INSERT INTO glossary_fts (id, term, definition, example, names) VALUES (?, ?, ?, ?, ?)');
  tx(db, () => {
    TERMS.forEach((t, i) => {
      term.run(t.id, t.term, t.kind, t.definition, t.example ?? null, t.source ?? null, t.unless ?? null, i);
      const names = namesOf(t);
      for (const n of names) name.run(n, t.id);
      fts.run(t.id, t.term, t.definition, t.example ?? '', names.join(' '));
    });
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('glossary', ?)").run(JSON.stringify({ fingerprint: fingerprint(), terms: TERMS.length }));
  });
}

/** The glossary, read from SQLite; built, or rebuilt, first if the list above has changed since. */
export class Glossary {
  private db: DatabaseSync;
  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  private static one: Glossary | null = null;
  static load(file = glossaryPath()): Glossary {
    if (Glossary.one && file === glossaryPath()) return Glossary.one;
    const fresh = !existsSync(file);
    const db = open(file);
    const had = fresh ? undefined : (db.prepare("SELECT value FROM meta WHERE key = 'glossary'").get() as { value: string } | undefined);
    if (!had || (JSON.parse(had.value) as { fingerprint: string }).fingerprint !== fingerprint()) buildGlossary(db);
    const g = new Glossary(db);
    if (file === glossaryPath()) Glossary.one = g;
    return g;
  }

  private entry(row: Record<string, unknown>): GlossaryEntry {
    const names = (this.db.prepare('SELECT name FROM glossary_names WHERE id = ? ORDER BY length(name) DESC').all(row.id as string) as { name: string }[]).map((x) => x.name);
    const e: GlossaryEntry = { id: row.id as string, term: row.term as string, kind: row.kind as TermKind, definition: row.definition as string, names };
    if (row.example) e.example = row.example as string;
    if (row.source) e.source = row.source as string;
    if (row.unless) e.unless = row.unless as string;
    return e;
  }

  all(): GlossaryEntry[] {
    return (this.db.prepare('SELECT * FROM glossary ORDER BY ord').all() as Record<string, unknown>[]).map((r) => this.entry(r));
  }

  /** A term by any of its names (“anastrophe”, “Inversion (anastrophe)”, “periods”), or by its id. */
  define(name: string): GlossaryEntry | null {
    const n = name.trim().toLowerCase().replace(/'/g, '’');
    const hit = (k: string) => this.db.prepare('SELECT g.* FROM glossary_names n JOIN glossary g ON g.id = n.id WHERE n.name = ?').get(k) as Record<string, unknown> | undefined;
    const row = hit(n) ?? hit(n.replace(/(es|s)$/, '')) ?? (this.db.prepare('SELECT * FROM glossary WHERE id = ?').get(n) as Record<string, unknown> | undefined);
    return row ? this.entry(row) : null;
  }

  /** Terms whose name, definition or example mention the words asked for, best first. */
  search(q: string, limit = 10): GlossaryEntry[] {
    const words = q.toLowerCase().match(/[\p{L}]+/gu) ?? [];
    if (!words.length) return [];
    const rows = this.db.prepare(`SELECT g.* FROM glossary_fts f JOIN glossary g ON g.id = f.id WHERE glossary_fts MATCH ? ORDER BY bm25(glossary_fts, 0, 10, 2, 1, 8) LIMIT ?`).all(words.map((w) => `"${w}"*`).join(' '), limit) as Record<string, unknown>[];
    return rows.map((r) => this.entry(r));
  }
}
