// The glossary: every term of rhetoric, poetics and grammar that Advisor uses, each defined in one sentence with one
// example. The page defines a term where it uses it, in a note's heading or text; the CLI and the API look one up.
// This list is the source. data/glossary.sqlite is built from it, and rebuilt when the list changes, with a row for
// every name a term goes by and a full-text index, so the server, the CLI and a voice's build query one store. The
// figures the engine recognizes (figures.ts) are terms here too, under the same ids.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { DATA, open, tx } from '../db.ts';
import { FIGURES } from './figures.ts';
import type { GlossaryEntry } from './terms.ts';
export { findTerms, type GlossaryEntry } from './terms.ts';

export type TermKind = 'figure' | 'sound' | 'verse' | 'sentence' | 'narrative' | 'argument' | 'diction' | 'role' | 'form';

export interface Term {
  id: string;
  /** The name a heading gives it: “Litotes”. */
  term: string;
  kind: TermKind;
  /** What it is, in one sentence. */
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
  T('antithesis', 'Antithesis', 'figure', 'Two opposite ideas set side by side in words of the same shape.', { example: 'It was the best of times, it was the worst of times.', source: 'Dickens, A Tale of Two Cities', also: ['antitheses', 'not this, but that'] }),
  T('chiasmus', 'Chiasmus', 'figure', 'Two phrases whose terms come back in reverse order (A B, B A), so the second answers the first.', { example: 'Ask not what your country can do for you—ask what you can do for your country.', source: 'Kennedy, inaugural address', also: ['antimetabole', 'chiastic'] }),
  // Litotes is a kind of understatement. One term answers to both names, so a writer looks up only one.
  T('litotes', 'Litotes (understatement)', 'figure', 'Saying less than you mean, often by denying the opposite.', { example: '“not unwilling”, “no small matter”', also: ['understatement', 'understated', 'understatements', 'meiosis', 'understatement and litotes'] }),
  T('hyperbole', 'Hyperbole', 'figure', 'Exaggeration not meant to be taken literally, for emphasis or comedy.', { example: '“the most awkward ten minutes of my life”', also: ['exaggeration'] }),
  T('periphrasis', 'Periphrasis', 'figure', 'Naming a thing by a description of it instead of by its name.', { example: '“the instrument in his hand” for a phone', also: ['circumlocution'] }),
  T('tricolon', 'Tricolon', 'figure', 'Three parallel words, phrases or clauses in a row.', { example: 'Emma Woodhouse, handsome, clever, and rich', source: 'Austen, Emma, ch. 1', also: ['tricola', 'rule of three', 'building in threes', 'things in threes'] }),
  T('polysyndeton', 'Polysyndeton', 'figure', '“And” repeated between the items of a list where commas would do.', { example: 'And the rain descended, and the floods came, and the winds blew, and beat upon that house; and it fell not.', source: 'Matthew 7:25' }),
  T('asyndeton', 'Asyndeton', 'figure', 'A list with the joining words (“and”, “or”) left out.', { example: 'I came, I saw, I conquered.', source: 'Julius Caesar, as Plutarch reports him' }),
  T('anaphora', 'Anaphora', 'figure', 'The same words opening clause after clause.', { example: 'We shall fight on the beaches, we shall fight on the landing grounds, we shall fight in the fields and in the streets.', source: 'Churchill, 4 June 1940' }),
  T('epistrophe', 'Epistrophe', 'figure', 'The same words closing clause after clause.', { example: 'government of the people, by the people, for the people', source: 'Lincoln, the Gettysburg Address' }),
  T('parallelism', 'Parallelism', 'figure', 'Like ideas put in like grammatical form; in the King James Bible, one thought said twice in other words.', { example: 'Pride goeth before destruction, and an haughty spirit before a fall.', source: 'Proverbs 16:18', also: ['parallel', 'parallels'] }),
  T('isocolon', 'Isocolon', 'figure', 'Clauses of the same length and build set side by side.', { example: 'Many are called, but few are chosen.', source: 'Matthew 22:14', also: ['balance', 'balanced clauses', 'balanced period', 'balanced periods'] }),
  T('climax', 'Climax', 'figure', 'Words or clauses set in rising order of weight, the strongest last.', { example: 'tribulation worketh patience; and patience, experience; and experience, hope', source: 'Romans 5:3–4', also: ['gradatio', 'crescendo'] }),
  T('anticlimax', 'Anticlimax', 'figure', 'A drop from the grand to the trivial at the end of a series, made on purpose.', { example: 'Here thou, great Anna! whom three realms obey, / Dost sometimes counsel take—and sometimes tea.', source: 'Pope, The Rape of the Lock', also: ['bathos'] }),
  T('zeugma', 'Zeugma', 'figure', 'One word used with two others in two different senses.', { example: 'Or stain her honour, or her new brocade', source: 'Pope, The Rape of the Lock', also: ['syllepsis'] }),
  T('apostrophe', 'Apostrophe', 'figure', 'Speaking to someone absent or dead, or to a thing or an idea, as if it could hear.', { example: 'O death, where is thy sting? O grave, where is thy victory?', source: '1 Corinthians 15:55' }),
  T('metaphor', 'Metaphor', 'figure', 'Calling one thing by the name of another to give it the other’s qualities.', { example: 'All the world’s a stage', source: 'As You Like It 2.7', also: ['metaphorical'] }),
  T('simile', 'Simile', 'figure', 'A comparison made openly, with “like” or “as”.', { example: 'O my luve’s like a red, red rose', source: 'Burns' }),
  T('conceit', 'Conceit', 'figure', 'A long, surprising metaphor followed through: two lovers as the two legs of a compass.', { source: 'Donne, “A Valediction: Forbidding Mourning”', unless: '(self|his own|her own|my own)[-\\s]$' }),
  T('image', 'Image', 'figure', 'Words that make the reader see, hear or feel a thing.', { example: 'to take arms against a sea of troubles', source: 'Hamlet 3.1', also: ['imagery', 'the image'] }),
  T('personification', 'Personification', 'figure', 'A thing or an idea given the acts or feelings of a person.', { example: 'But look, the morn, in russet mantle clad, / Walks o’er the dew of yon high eastward hill.', source: 'Hamlet 1.1', also: ['personified', 'prosopopoeia'] }),
  T('synecdoche', 'Synecdoche', 'figure', 'A part named for the whole, or the whole for a part: “all hands on deck”.'),
  T('metonymy', 'Metonymy', 'figure', 'A thing named by something closely tied to it: “the Crown” for the monarch, “the pen” for writing.'),
  T('oxymoron', 'Oxymoron', 'figure', 'Two words of opposite meaning joined.', { example: 'O brawling love! O loving hate!', source: 'Romeo and Juliet 1.1' }),
  T('paradox', 'Paradox', 'figure', 'A statement that seems to contradict itself and yet is true.', { example: 'The Child is father of the Man', source: 'Wordsworth', also: ['paradoxical'] }),
  T('pun', 'Pun', 'figure', 'A play on two senses of one word, or on two words that sound alike.', { example: 'Now is the winter of our discontent / Made glorious summer by this sun of York', source: 'Richard III 1.1 (sun, son)', also: ['wordplay', 'quibble'] }),
  T('epigram', 'Epigram', 'figure', 'A short, witty saying with a twist.', { example: 'I can resist everything except temptation.', source: 'Wilde, Lady Windermere’s Fan', also: ['epigrammatic'] }),
  T('aphorism', 'Aphorism', 'figure', 'A general truth put briefly enough to remember.', { example: 'Brevity is the soul of wit.', source: 'Hamlet 2.2', also: ['maxim', 'maxims', 'proverb', 'sententia'] }),
  T('gnomic', 'Generalization (gnomic statement)', 'figure', 'A general truth stated about the case in hand, often to make it ironic.', { example: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', source: 'Austen, Pride and Prejudice, ch. 1', also: ['gnomic', 'gnomic statement', 'generalization', 'general truth'] }),
  T('irony', 'Irony', 'figure', 'Saying one thing so that the reader understands another.', { example: '“What a fine day for a picnic,” said in the pouring rain.', also: ['ironic', 'ironically', 'ironies'] }),
  T('ironicverdict', 'Ironic verdict', 'figure', 'A narrator’s judgement that means more than, or other than, what it says.', { example: 'The business of her life was to get her daughters married; its solace was visiting and news.', source: 'Austen, Pride and Prejudice, ch. 1', also: ['ironic verdict'] }),
  T('aside', 'Aside', 'narrative', 'In a play, words the others on stage do not hear; in a story, the narrator breaking off to comment.', { example: '“which, I may say, was a lie”', also: ['ironic aside', 'narrator’s aside', 'asides'], unless: '\\b(set|sets|setting|put|puts|putting|lay|laid|lays|cast|casts|brush|brushed|step|stepped|steps|stand|stood|turn|turned|leave|left|leaving|push|pushed|draw|drew|took|take|taking|move|moved|moves|moving|stepped)\\s+((it|them|this|that|him|her|these|those|everything|all)\\s+)?$' }),
  T('parenthesis', 'Parenthesis', 'sentence', 'A remark set inside a sentence that interrupts it, between commas, dashes or brackets.', { example: 'The test—I admit it—was fair.', also: ['parenthetical'] }),
  T('inversion', 'Inversion (anastrophe)', 'sentence', 'Words put out of their usual order, so the one that matters comes first or last.', { example: 'For whom the Lord loveth he chasteneth', source: 'Hebrews 12:6', also: ['anastrophe', 'inverted', 'inverted order'] }),
  T('rhetoricalquestion', 'Rhetorical question', 'figure', 'A question asked for effect, with the answer taken for granted.', { example: 'Who would not want to be happy?', also: ['rhetorical questions', 'erotema'] }),
  T('hypophora', 'Hypophora', 'figure', 'Asking a question and then answering it yourself.', { example: 'What is a man, / If his chief good and market of his time / Be but to sleep and feed? A beast, no more.', source: 'Hamlet 4.4', also: ['question and answer', 'the question turned over'] }),
  T('epithet', 'Epithet', 'diction', 'A word or phrase fixed to a name to describe it: “rosy-fingered Dawn”, “the youngest son”.', { also: ['epithets'] }),

  // Sound and verse.
  T('alliteration', 'Alliteration', 'sound', 'Words close together that begin with the same sound.', { example: 'Full fathom five thy father lies', source: 'The Tempest 1.2', also: ['alliterative'] }),
  T('assonance', 'Assonance', 'sound', 'The same vowel sound repeated in nearby words.', { example: 'Hear the mellow wedding bells', source: 'Poe, “The Bells”' }),
  T('cadence', 'Cadence', 'sound', 'The rise and fall of a sentence’s rhythm, above all at its close.', { example: 'and great was the fall of it.', source: 'Matthew 7:27', also: ['cadences'] }),
  T('rhythm', 'Rhythm', 'sound', 'The pattern of stressed and unstressed syllables in a sentence or a line read aloud.', { example: 'da-DUM da-DUM da-DUM', also: ['metre', 'meter'] }),
  T('iamb', 'Iamb', 'verse', 'A foot of two syllables, unstressed then stressed: da-DUM, “be-HOLD”.', { also: ['iambic', 'iambs'] }),
  T('pentameter', 'Iambic pentameter', 'verse', 'A line of five iambs, ten syllables, da-DUM five times.', { example: 'But, soft! what light through yonder window breaks?', source: 'Romeo and Juliet 2.2', also: ['iambic pentameter', 'pentameter'] }),
  T('blankverse', 'Blank verse', 'verse', 'Unrhymed iambic pentameter: the verse of Shakespeare’s plays and Milton’s Paradise Lost.', { example: 'To be, or not to be: that is the question', source: 'Hamlet 3.1', also: ['blank verse'] }),
  T('couplet', 'Couplet', 'verse', 'Two lines in a row that rhyme.', { example: 'So long as men can breathe or eyes can see, / So long lives this, and this gives life to thee.', source: 'Sonnet 18', also: ['rhyming couplet', 'couplets'] }),
  T('sonnet', 'Sonnet', 'verse', 'A poem of fourteen lines; Shakespeare’s end on a rhyming couplet.', { example: 'Shall I compare thee to a summer’s day?', source: 'Sonnet 18', also: ['sonnets'] }),
  T('volta', 'Volta', 'verse', 'The turn in a sonnet, where the argument changes direction.', { example: 'Yet in these thoughts myself almost despising', source: 'Sonnet 29, line 9' }),
  T('soliloquy', 'Soliloquy', 'narrative', 'A speech in which a character alone on stage thinks aloud.', { example: 'To be, or not to be: that is the question', source: 'Hamlet 3.1', also: ['soliloquies'] }),
  T('refrain', 'Refrain', 'sound', 'A line or phrase that comes back again and again in a song, a poem or a speech.', { example: 'Nevermore.', source: 'Poe, “The Raven”', also: ['refrains'] }),
  T('formula', 'Formula', 'diction', 'A set phrase that comes back whenever the same moment does: “Once upon a time”, “And it came to pass”, “happily ever after”.', { also: ['formulas', 'formulae', 'formulaic'] }),

  // The sentence.
  T('clause', 'Clause', 'sentence', 'A group of words with its own subject and verb.', { example: '“the bus was late” in “The bus was late, so we walked.”', also: ['clauses'] }),
  T('mainclause', 'Main clause', 'sentence', 'The clause that could stand alone as a sentence.', { example: '“we walked” in “Because the bus was late, we walked.”', also: ['main clause', 'independent clause'] }),
  T('subordinateclause', 'Subordinate clause', 'sentence', 'A clause that cannot stand alone and hangs on another by “because”, “although”, “which” or “when”.', { example: '“because the bus was late”', also: ['subordinate clause', 'dependent clause', 'subordination', 'subordinate'] }),
  T('period', 'Period', 'sentence', 'A long sentence of several clauses built as one whole, its sense complete only at the end.', { example: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', source: 'Austen, Pride and Prejudice, ch. 1', also: ['periods'], unless: '\\b(time|trial|long|short|brief|same|whole|grace|waiting|holiday|sixty-day|ninety-day|that|this)\\s+$' }),
  T('periodic', 'Periodic sentence', 'sentence', 'A sentence that holds its main point until the end.', { example: 'Tired, wet and an hour late, we finally reached the house.', also: ['periodic sentence', 'periodic sentences', 'periodic'] }),
  T('cumulative', 'Cumulative sentence', 'sentence', 'A sentence that states its main clause first and then adds detail after detail.', { example: 'We reached the house, wet through, an hour late, and too tired to speak.', also: ['cumulative sentence', 'loose sentence'] }),
  T('qualifiedperiod', 'The qualified period', 'sentence', 'A long sentence that corrects and limits itself as it goes.', { example: 'She was happy, or nearly so, though she could not have said why.', also: ['qualified period'] }),
  T('parataxis', 'Parataxis', 'sentence', 'Clauses set side by side as equals, joined by “and” or by nothing.', { example: 'And God said, Let there be light: and there was light.', source: 'Genesis 1:3', also: ['paratactic', 'clauses laid side by side'] }),
  T('hypotaxis', 'Hypotaxis', 'sentence', 'Clauses set one under another by “because”, “although” or “which”, so the sentence shows how things depend.', { example: 'Because the bus was late, which it often was, we walked.', also: ['hypotactic'] }),
  T('apposition', 'Apposition', 'sentence', 'A noun phrase set beside another to rename or explain it.', { example: 'Paul, an apostle of Jesus Christ by the will of God', source: 'Ephesians 1:1', also: ['appositive', 'appositives', 'in apposition'] }),
  T('syntax', 'Syntax', 'sentence', 'The order and arrangement of words in a sentence.', { example: '“Home they went” and “They went home” differ only in syntax.', also: ['syntactic'] }),
  T('genitive', 'The genitive with “of”', 'sentence', 'Ownership or kind shown by “of” instead of “’s”: “the house of the LORD”.', { also: ['genitive'] }),

  // Words.
  T('diction', 'Diction', 'diction', 'The choice of words: plain or fancy, old or new.', { example: '“begin” and “commence” differ in diction' }),
  T('register', 'Register', 'diction', 'The level of language that suits an occasion.', { example: '“Hey” in a text; “Dear Sir” in a letter.', also: ['registers'], unless: '\\b(cash|the|a)\\s+$' }),
  T('vernacular', 'Vernacular', 'diction', 'The everyday spoken language of a place and its people.', { example: 'You don’t know about me without you have read a book by the name of The Adventures of Tom Sawyer', source: 'Twain, Huckleberry Finn, ch. 1' }),
  T('dialect', 'Dialect', 'diction', 'The words and grammar of a region or a group, often spelled to show how they sound.', { example: '“I reckon”, “ain’t”', also: ['dialects'] }),
  T('archaism', 'Archaism', 'diction', 'A word already old when it is used: “thou”, “unto”, “wherefore”.', { also: ['archaic', 'archaisms'] }),
  T('thou', 'Thou and you', 'diction', 'In Shakespeare’s English, “thou” for one person who is close, lower in rank, or God, and “you” for a superior or for more than one.', { example: 'Thou art more lovely and more temperate', source: 'Sonnet 18', also: ['thou and thee', 'thou-form'] }),
  T('abstractnoun', 'Abstract noun', 'diction', 'A noun for a quality or a state instead of a thing: civility, vanity, courage.', { also: ['abstract noun', 'abstract nouns'] }),
  T('interjection', 'Interjection', 'diction', 'A word thrown in to show feeling, outside the grammar of the sentence: alas, oh, wow.', { also: ['interjections'] }),

  // Narrative.
  T('fid', 'Free indirect discourse', 'narrative', 'A character’s thoughts given in the narrator’s sentences, without “she thought” or quotation marks.', { example: 'She would not go. Why should she go, only to be laughed at?', also: ['free indirect style', 'free indirect speech', 'free indirect'] }),
  T('reported', 'Reported speech', 'narrative', 'Speech given in the narrator’s words instead of quoted: “he said that he was not ready”.', { also: ['reported speech', 'indirect speech', 'speech reported'] }),
  T('deadpan', 'Deadpan', 'narrative', 'Something absurd told with a straight face.', { example: 'The report of my death was an exaggeration.', source: 'Twain, 1897' }),
  T('talltale', 'Tall tale', 'narrative', 'A story of impossible feats told as plain fact.', { example: 'It was so cold the words froze as we spoke them.', also: ['tall tale', 'tall tales'] }),
  T('frame', 'Frame story', 'narrative', 'A story set inside another story.', { example: 'A sailor tells a stranger the tale of his last voyage.', also: ['frame story', 'frame narrative', 'frame tale'] }),
  T('omniscient', 'Omniscient narrator', 'narrative', 'A narrator who knows what every character thinks.', { example: 'She hoped he would call; he had already decided not to.', also: ['omniscient narrator', 'omniscient'] }),
  T('narratorwe', 'The narrator’s “we”', 'narrative', 'The narrator stepping back from the story to say what is true of all of us.', { example: 'We are all of us born in moral stupidity.', source: 'Eliot, Middlemarch, ch. 21', also: ['narrator’s “we”'] }),
  T('digression', 'Digression', 'narrative', 'A turn away from the subject, and back.', { example: 'But I am getting ahead of my story.', also: ['digressions', 'digresses'] }),
  T('catalogue', 'Catalogue', 'narrative', 'A long list, given for its weight or its comedy.', { example: 'eggs, flour, two lemons, a ladder, my uncle and the dog', also: ['catalog'] }),
  T('inmediasres', 'In medias res', 'narrative', 'Beginning in the middle of the action and filling in what came before later.', { example: 'The door was already burning when I woke.' }),
  T('exemplum', 'Exemplum', 'argument', 'A story told to make a point, one person’s case standing for many.', { example: 'Take my neighbour, who worked two jobs and still lost the house.', also: ['exempla', 'one person standing for many'] }),

  // Argument: the parts of a classical speech, and the three appeals.
  T('ethos', 'Ethos', 'argument', 'Persuading by the speaker’s character: why the hearer should trust the one speaking.', { example: 'I have coached this team for ten years.' }),
  T('pathos', 'Pathos', 'argument', 'Persuading by feeling.', { example: 'Picture a child waiting alone at the bus stop.' }),
  T('logos', 'Logos', 'argument', 'Persuading by reasons and evidence.', { example: 'Half the class failed, so the test was too hard.' }),
  T('exordium', 'Exordium', 'argument', 'The opening of a speech or an argument, which wins the hearer’s attention.', { example: 'Friends, I will keep this short.' }),
  T('narratio', 'Narratio', 'argument', 'The facts of the case, set out before the argument about them.', { example: 'On Monday the library closed at noon.' }),
  T('confirmatio', 'Confirmatio', 'argument', 'The proof: the reasons and evidence for the claim.', { example: 'First, the library is the only quiet room in school.' }),
  T('refutation', 'Refutation', 'argument', 'Answering the other side by showing why an objection fails.', { example: 'Some say it costs too much; it costs less than the repairs.', also: ['refutatio', 'rebuttal'] }),
  T('concession', 'Concession', 'argument', 'Granting the other side a point in order to win a larger one.', { example: 'It is true that the plan is slow; but it works.', also: ['concessions', 'concedes', 'conceding'] }),
  T('procatalepsis', 'Procatalepsis', 'argument', 'Raising an objection before the hearer can, and answering it.', { example: 'You may say we cannot afford it. We cannot afford to wait.', also: ['prolepsis', 'anticipating the objection'] }),
  T('peroration', 'Peroration', 'argument', 'The close of a speech or an argument, which sums up the case and asks the hearer to act.', { example: 'So vote on Tuesday, and bring a friend.', also: ['perorations'] }),
  T('calltoaction', 'Call to action', 'argument', 'What the reader is asked to do, said plainly, usually at the end.', { example: 'Sign the petition today.', also: ['call to action'] }),
  T('enthymeme', 'Enthymeme', 'argument', 'An argument with one premise left unsaid for the hearer to supply: “He is a politician, so of course he lied.”'),
  T('thesis', 'Thesis', 'argument', 'The claim a piece of writing sets out to prove, stated so someone could disagree.', { example: 'School should start an hour later.' }),
  T('premise', 'Premise', 'argument', 'A statement an argument starts from and takes as true.', { example: 'All people want to be free.', also: ['premises', 'premiss'] }),
  // Terms the voices' notes use.
  T('mockheroic', 'Mock-heroic', 'diction', 'Grand words used for a small matter, for comedy.', { example: 'I shall then place my establishment on a superior footing.', source: 'Dickens, David Copperfield', also: ['mock heroic'] }),
  T('epizeuxis', 'Epizeuxis', 'figure', 'A word said twice or more in a row, for emphasis.', { example: 'Simplify, simplify.', source: 'Thoreau, Walden' }),
  T('participle', 'Participle', 'sentence', 'A verb form in -ing or -ed used as a describing word: “looking up”, “tired out”.', { also: ['participles', 'participial'] }),
  T('intensifier', 'Intensifier', 'diction', 'A word that strengthens the word after it: “quite”, “perfectly”, “absolutely”.', { also: ['intensifiers'] }),
  T('analogy', 'Analogy', 'figure', 'Explaining one thing by its likeness to another, point by point.', { example: 'The heart is a pump.', also: ['analogies'] }),
  // Plain style: the rules its moves are made of (plain.ts), and the names its notes give a fault.
  T('needlesswords', 'Needless words', 'diction', 'Words a sentence can lose with no loss of meaning.', { example: '“in order to win” for “to win”', also: ['needless word', 'needless words cut'] }),
  T('stockphrase', 'Stock phrase', 'diction', 'A ready-made run of words used where one word would do.', { example: '“due to the fact that” for “because”' }),
  T('hedge', 'Hedge', 'diction', 'Words that soften a statement, so the writer need not stand behind it.', { example: '“sort of”, “I think”, “it seems”', also: ['hedging', 'hedges and intensifiers removed'] }),
  T('activevoice', 'Active voice', 'sentence', 'The subject of the sentence does the action.', { example: 'The dog bit the man.' }),
  T('passivevoice', 'Passive voice', 'sentence', 'The subject of the sentence receives the action; the one who acts is left out or put after “by”.', { example: 'The man was bitten by the dog.', also: ['the passive'] }),
  T('positiveform', 'Positive form', 'sentence', 'Saying what is so, in place of what is not.', { example: '“He forgot” for “He did not remember”', also: ['positive statement'] }),
  T('abstractword', 'Abstract word', 'diction', 'A word for an idea or a class of things, which names no particular thing.', { example: '“situation”, “factor”, “aspect”' }),
  T('concreteword', 'Concrete word', 'diction', 'A word for a particular thing the reader can see, hear or touch.', { example: '“rain” for “bad weather”', also: ['the concrete word', 'concrete language'] }),
  T('oneidea', 'One idea a sentence', 'sentence', 'A sentence that states one thing and stops, and leaves the next thing to the next sentence.', { example: 'The bus was late. We missed the start.' }),
  T('declarative', 'Declarative sentence', 'sentence', 'A sentence that states a fact, where another kind asks, orders or exclaims.', { example: 'The bridge was down.', also: ['declarative'] }),
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

/**
 * The forms a student can ask for (essay, anecdote, letter), from src/engine/forms.json, so the page can define a
 * form's name where it shows one. Like a role, a form's name is an everyday word: it is defined where the page
 * shows it as a label, by formTerm, and never marked in running prose.
 */
export function formsOf(raw: unknown, taken: Term[] = BASE): Term[] {
  const names = new Set(taken.flatMap(namesOf));
  const out: Term[] = [];
  for (const f of Array.isArray(raw) ? (raw as { id?: string; name?: string; definition?: string }[]) : []) {
    if (!f?.id || typeof f.definition !== 'string') continue;
    const name = (f.name ?? f.id).trim();
    if (names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    out.push(T(`form-${f.id}`, name[0]!.toUpperCase() + name.slice(1), 'form', f.definition.trim(), { unless: '^' }));
  }
  return out;
}

const FORMS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'forms.json');
function loadForms(taken: Term[]): Term[] {
  try {
    return existsSync(FORMS_FILE) ? formsOf(JSON.parse(readFileSync(FORMS_FILE, 'utf8')), taken) : [];
  } catch {
    return [];
  }
}

const ROLE_TERMS = loadRoles();

/** Every term: the list above, then the roles, then the forms. */
export const TERMS: Term[] = [...BASE, ...ROLE_TERMS, ...loadForms([...BASE, ...ROLE_TERMS])];

/** The glossary id of a role word: “claim” is defined under “role-claim”. */
export const roleTerm = (role: string): string => `role-${role}`;

/** The glossary id of a form's name: “essay” is defined under “form-essay”. */
export const formTerm = (form: string): string => `form-${form}`;

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
