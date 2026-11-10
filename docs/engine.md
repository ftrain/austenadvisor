# How Advisor reads

Each voice in Advisor is a model of one author, built from that author's complete works and nothing else (apart from English's dictionary and grammar). It answers four questions about every word and sentence you write:

1. Would the author have written this word?
2. If not, which of the author's words would stand in its place?
3. How does this sentence, paragraph or chapter compare with the author's?
4. Where can I see the author doing it?

There is no language model anywhere in the engine. Each answer comes from counts, and each comes with the counts and the author's own sentences, cited. The rewrite is a separate step on top of the engine (below).

## The build: `npm run build:model -- austen`

| Step | What | Where |
|---|---|---|
| Works | Standard Ebooks' XHTML: the spine in `content.opf`, each `<section epub:type="chapter">`, its `<p>`s. A `<p>` inside a `<blockquote>` is a letter; one with line breaks is verse. Project Gutenberg's text by way of GITenberg: boilerplate, transcribers' marks (`M^r`, `_italic_`, `&`) and editorial notes removed, chapters found by a heading pattern given per work. | `src/corpus/sources.ts` |
| Corpus | Works → chapters → paragraphs → sentences, in SQLite. Each sentence keeps its place (work, chapter, paragraph) and how much of it is speech. An FTS5 index of every sentence, ranked by BM25. | `src/corpus/build.ts` |
| Tokens | One tokenizer for the works and for your text. Contractions and hyphenated words are single words. Quotation marks (curly or straight) mark speech. Sentences end where the next word begins a new one: not at *Mr.*, and not at the *Oh!* in "Oh! single, my dear". | `src/nlp/tokenize.ts` |
| Tags | An averaged perceptron (Collins 2002, after Honnibal) trained on the Brown Corpus. 97.2% on held-out Brown text. The Brown tagset is kept because it tells *was* (BEDZ) from *were* (BED) and *didn't* (DOD*). | `src/nlp/tagger.ts` |
| WordNet | WordNet 3.1's files into SQLite: senses in order of use, synonyms, and the relations a step away (broader, narrower, similar, also see). Morphy finds the lemma. | `src/nlp/wordnet.ts` |
| Vocabulary | Every word: how many times, in narration and in speech, by work, by tag. Every lemma: the forms the author gave it, by tag (*walk*: walked VBD 215, walking VBG 157…). | `words`, `forms` |
| Language model | Trigram counts of the author's sentences, punctuation included. The model is smoothed when it is read, by interpolated Kneser–Ney with Ney's discounts. | `src/nlp/kn.ts` |
| Tag model | Trigram counts of the tags, for how sentences are built. | `tag_trigrams` |
| Vectors | Words seen five times or more. Weighted co-occurrence within five words, positive PMI with context-distribution smoothing (α = 0.75), randomized SVD to 100 dimensions, U·√Σ, unit length. These are the author's own semantic space: in Austen's, *angry* is nearest *vexed, pleased, disappointed, astonished, ashamed*; in Twain's, *reckon* sits beside *maybe, ain't, bet*. | `src/nlp/linalg.ts`, `vectors` |
| Profile | Sentence length (narration and speech separately), paragraph length, punctuation per sentence, how clauses are joined (", and" 10,813×; "; and" 4,156×), how narrative sentences open, contractions in narration and speech, -ly adverbs, and the 150 commonest words with their mean and spread over 2,000-word stretches (for Delta). | `meta.profile` |

## Reading your text

`analyze(model, blocks)` (`src/engine/analyze.ts`) reads the document block by block (a title, a heading, or a paragraph; `src/engine/doc.ts`). Headings begin chapters, and paragraphs are split into sentences. Each sentence's result is cached by its words, so typing re-reads only the sentence you are in. A page is read in about 20 ms once the model is warm.

**Every word.** A word the author never wrote, in any form, is flagged `never`. A word whose lemma she used but whose form she didn't is flagged `form`. A capitalized word in mid-sentence is a `name`, unless WordNet knows it as a common noun (*Mom* → *Mama*). A contraction she wrote out is a `fix` in narration and a `consider` in speech; the deciding share comes from her own counts.

**Alternatives** (`src/engine/alternatives.ts`). Candidates come from five sources:

- **WordNet:** the word's senses and their synonyms, then the words a step away (broader, narrower, similar), each in the author's own inflection for the tag your word has.
- **The trigram model:** what she put in the same gap.
- **The contraction table:** her expansion of a contraction.
- **Spelling:** one letter away, for a slip.
- **Phrases:** WordNet's phrases where she wrote them (*turn out*, inflected on its head).

Each candidate is scored on four things:

- **Meaning:** sense order, weighted by how near the sense's gloss is to your passage in the author's vectors (simplified Lesk).
- **Fit:** the log probability of the candidate and the two words after it, in place.
- **Suit:** the cosine between the candidate and your passage.
- **Use:** how often she wrote it.

Candidates from meaning come first. Those from the gap come after, labelled for what they are. Each candidate comes with one of her sentences, found by BM25 and preferring sentences that share words with yours.

**Sentences and paragraphs.**

- **Short sentences.** A run of short narrative sentences (under her 25th percentile) is joined as she joined clauses: ", and" or "; ", or a conjunction's commonest mark, or with the repeated subject dropped ("I went in. I bought bread." → "I went in, and bought bread.").
- **Openings.** A sentence opening as she almost never opened one is noted.
- **A likelier word.** A word she did use, where her synonym is far likelier in that place, is a `consider`: *store* → *shop*, *Finally* → *At last*. This applies to nouns, adjectives and adverbs only; verbs' senses are too many to swap by statistics.

**The whole.** The document is compared with her profile measure by measure:

- the share of words she used;
- narrative sentence length;
- semicolons and commas per sentence;
- -ly adverbs;
- contractions in narration;
- speech share;
- narrative paragraph length;
- Flesch–Kincaid grade;
- Burrows's Delta over her commonest words (from 300 words on).

It also lists the words you lean on and the words she uses more. The score is the mean of the measures, each 0–100, and each measure says what it means.

## Austenize (`src/engine/austenize.ts`)

The engine's own rewrite, by statistics alone:

1. Contractions are written out, and her likelier words go in.
2. Each word she never wrote gets her nearest word in the same main sense, if one reads well in place. If none does, the word stays, and it is listed.
3. The text is read again, and runs of short sentences are joined.

Every change is listed with its reason and a sentence of hers. See [before-after.md](before-after.md) for what it does well and what it can't: an idiom ("said okay"), or a thing with no Regency word (a phone).

## The page's engine

The page asks the engine everything it can answer without a model call. These modules are new with the page, and each answers in milliseconds.

| Module | What it does |
|---|---|
| `src/engine/pack.ts` | A voice's pack, built by `scripts/build-packs.ts` into `data/packs/<id>.json` and `<id>.sif`. The JSON holds the signature words, up to eight real sentences for each move and figure, the profile in brief, the usual order of parts, 500 rounds of the guessing game and a shape index of 8,000 sentences. The `.sif` holds the vectors: the shape index's, the word vectors, and the whole corpus's sentence vectors, which `AuthorModel` reads in place of building them. Every pack stays in memory; only six whole models do (`src/server/models.ts`). A pack is rebuilt when its model's fingerprint changes. |
| `src/engine/structure.ts` | What kind of writing a text is (argument, story, letter, speech, essay, review), what job each paragraph does (claim, reason, objection, scene, turn, call…), and the order a voice usually puts those jobs in. It works from cue words and position, and says "part" where it cannot tell. The roles and their plain names are in `roles.json`. |
| `src/engine/voiceid.ts` | Which voice a passage sounds like, from the packs alone. It adds two scores: the words, by each voice's word counts, and the build, by each voice's tag trigrams. From these come the three voices the select puts first: the best voice for the kind, the voice it sounds like, and a stretch. |
| `src/engine/shape.ts` | For a student's sentence, the voice's real sentence built most like it: half the score from word classes in order (by edit distance), a fifth from punctuation in order, the rest from meaning. Below a score of 0.5 it offers nothing. This fills the voice's column when there is no rewrite. |
| `src/server/read.ts` | The engine's view of a text against one voice (`/api/read`): kind and roles, up to five words the voice never wrote with its own word where the engine is sure, a style line (words a sentence and one joining mark against the voice's), the suggested voices, and the shape sketches. |
| `src/engine/notes.ts` | The Why column. For each paragraph of a rewrite it compares every new sentence with the student's sentences it renders, finds the moves and figures the new one makes that the old did not, and quotes a sentence of the voice's that makes the same move, with the move's words marked. At most two notes a paragraph, and no move twice on a page. `moveKey` gives every name of a move one id ("understatement" is litotes). |
| `src/engine/practice.ts` | Try it. `practiceCheck` reads a student's attempt at a move with the same detector that checks the notes, and says whether the move is there, its length against the voice's, what else it does and which words the voice never used; a miss gets a hint and an example. `drillsFor` chooses what to practise: after a rewrite, only moves the rewrite was shown to make; with none, only gaps the engine finds (sentences much shorter than the voice's, no joined clauses, no move at all). |
| `src/engine/glossary.ts`, `terms.ts` | The glossary: 115 terms, each one plain sentence, most with an example, written to `data/glossary.sqlite`. `findTerms` finds them in any text, so the page can underline a term where it is used. |
| `src/server/routes/guess.ts` | The guessing game: a sentence from one of three voices, and after a guess, the words that gave it away. The rounds come from the packs. |

## The rewrite (`src/engine/brief.ts`, `src/server/rewrite.ts`, `src/server/page.ts`)

The language model writes the voice's sentences and nothing else on the page.

**Parts.** `page.ts` splits the text into parts of whole paragraphs, about 600 words each, and rewrites them at once. Each part is looked for first among the samples rewritten ahead of time (`data/precomputed`), then in the cache (`data/cache.sqlite`), and only then sent to the writer, within the budget (`src/server/cache.ts`). The answer streams to the page as lines of JSON: a `plan` with every paragraph, `progress`, a `part` with its rows, and `done`.

**In: a brief.** The system prompt is the same for every rewrite in a voice, so the provider caches it: the voice's manner, its moves with one example each, and how to write the notes for a reader of about fifteen. The user message is the engine's brief: the passage sentence by numbered sentence, each with its register (narration, speech, a letter), its length against the voice's, every word the voice never wrote with the voice's own words for it, and the voice's sentence nearest it in meaning, by id. Measures are given as ranges to write within, never as scores to raise, because a model told to raise a score pads its sentences.

**Out: one tool call.** `submit_rewrite` takes the faults of sense mended, the liberties taken (anything not in the student's text), a short explanation, and the paragraphs, each with its role and, for every sentence, the student's sentences it renders (`from`), so nothing is lost unseen.

**A gate.** `hardGate` finds what is worth one redraft: a sentence lost, a heading crossed, the paragraphs run together, or no rewrite submitted. That is the only second call. `softFindings` finds the rest, which the engine mends or shows: a word the voice never used is replaced by the voice's own where the engine is sure of one.

**After.** The engine writes the Why notes (`notes.ts`), the structure notes (a paragraph moved, a part added), and the explanation sentence for each rewritten sentence (`explain.ts`). Every quotation is rendered from the corpus by id; the model cannot invent one.

**Versions.** `PROMPT_VERSION` in `rewrite.ts` is raised whenever the prompts or the schema change in meaning. The cache key holds it, so old answers retire, and `scripts/prewarm.ts --stale` rewrites the samples made under an older one.

**Testing without a key.** The tests inject a fake writer. `npm run cli -- brief <file> <dir>` writes the exact prompts; `npm run cli -- tool <name> '<json>'` answers as the tools do; `npm run cli -- submit <dir> <submission.json>` runs the gate and renders the result. [rewrite-eval.md](rewrite-eval.md) and [eval/voices](eval/voices/README.md) record the evaluations.

## Figures of speech (`src/engine/figures.ts`)

Classical rhetoric's figures are recognized by their form: the words, their tags and their order. Each is named with its standard term and glossed in a line:

- **Litotes,** by principle rather than by list: a negative before a word whose negative prefix, taken off, leaves a quality-word of hers ("not unwilling", "not intolerable", but not "not understand" or "not … indeed"), or "no small" and its kind.
- **Periphrasis:** a thing named by a generic head and what it does ("the instrument in his hand", "a shop where coffee was served", "the persons set over us").
- **The generalization laid over a case** (the gnomic statement, the usual vehicle of her irony), and **the ironic aside** (", which was at least consistent with the occasion").
- **Free indirect discourse:** a question or exclamation in the narration (not in a letter, which is direct address).
- **Patterns of the sentence:**
  - antithesis;
  - tricolon;
  - polysyndeton;
  - anaphora;
  - parenthesis;
  - inversion (anastrophe);
  - hyperbole.

Irony itself has no form. It is credited only where one of its vehicles is there.

The figures are used in three places:

- **The Why column:** a note names the figure the rewrite made, defines it, and quotes a sentence of the voice's that makes it.
- **Try it:** the same detector says whether the student's attempt makes the figure, and names any other figures in it ("Also in it: ironic verdict").
- **The packs:** each voice's pack keeps real sentences for each figure it uses, so a note or a hint finds its example at once.

An example offered for a figure is always confirmed by that figure's detector (`figureExamples`): the nearest sentences first, then the whole corpus sifted by a cheap sign of the figure.

## Another author

Everything above reads the voice from `authors/<id>.json`: the works and their sources, the license, the name and pronouns, the family (storytellers, speakers, arguers, essayists), the kinds of writing it suits, its moves with a pattern each, and the persona and manner for the writer. There are twenty; the README lists them. To add one:

```sh
npm run build:model -- <id>       # the corpus and the model, data/<id>.sqlite
node scripts/build-packs.ts       # every pack again: signature words and the guessing game measure each voice against the rest
node scripts/index-samples.ts     # a sample that lists the voice under pending moves it to bestVoices
```
