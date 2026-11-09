# How Advisor reads

Advisor is a model of one author, built from that author's complete works and nothing else (apart from English's dictionary and grammar). It answers four questions about every word and sentence you write:

1. Would the author have written this word?
2. If not, which of the author's words would stand in its place?
3. How does this sentence, paragraph or chapter compare with the author's?
4. Where can I see the author doing it?

There is no language model anywhere in the engine. Each answer comes from counts, and each comes with the counts and the author's own sentences, cited. "Rewrite with AI" is a separate step that sits on top of the engine (below).

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
| Vectors | Words seen five times or more. Weighted co-occurrence within five words, positive PMI with context-distribution smoothing (α = 0.75), randomized SVD to 100 dimensions, U·√Σ, unit length. These are the author's own semantic space: in Austen's, *angry* is nearest *vexed, pleased, disappointed, astonished, ashamed*. | `src/nlp/linalg.ts`, `vectors` |
| Profile | Sentence length (narration and speech separately), paragraph length, punctuation per sentence, how clauses are joined (", and" 10,813×; "; and" 4,156×), how narrative sentences open, contractions in narration and speech, -ly adverbs, and the 150 commonest words with their mean and spread over 2,000-word stretches (for Delta). | `meta.profile` |

## Reading your text

`analyze(model, blocks)` (`src/engine/analyze.ts`) reads the document block by block, as the Word Processor numbers them, so every place it names is a place in the editor. Headings begin chapters, and paragraphs are split into sentences. Each sentence's result is cached by its words, so typing re-reads only the sentence you are in. A page is read in about 20 ms once the model is warm.

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

## Rewrite with AI (`src/server/rewrite.ts`)

Claude (`claude-opus-5-5`, adaptive thinking, high effort, server-side refusal fallback) is given:

- the author's measured habits;
- the engine's reading of the passage: each flagged word with the alternatives she used, the advice, and the measures;
- the six sentences of hers nearest the passage in meaning;
- the paragraphs before and after.

It has the engine as tools, the same functions the page uses (`src/engine/tools.ts`):

- **`check_passage`:** the engine's reading of a draft.
- **`word_profile`:** how she used a word, or what she used instead.
- **`concordance`:** her sentences with a word or phrase.
- **`similar_sentences`:** her sentences nearest a passage.

It is told to look words up, confirm idioms, check its draft until nothing she never wrote is left, and submit the rewrite with the techniques it used, each tied to a sentence of hers copied from a tool result. The server then checks each quotation word for word against the full-text index and marks it verified, or not, before the writer sees it.

## Shared editing

The page is Tiny Little Office's Word Processor (`mount('write', …)`). Each edit is a group of the kernel's ops. The server rebases a group over what came since its base (`rebase`) and applies it. It keeps the ops, the text and a version per author in SQLite, and tells everyone. Each page keeps one group in flight and the rest waiting, and carries the server's ops over both (`cross`). See `src/server/room.ts`, `src/web/sync.ts`, and `test/sync.test.ts` for two writers and Advisor converging.

Advisor is a person in the document. Its suggestions are ops made under its own name, so the kit's redline draws them as tracked changes with its lozenge. Accept is a review. Reject is a review plus the kernel's `rejectOps`, which takes the change back exactly. Writers' own versions are settled (drawn plain), so the redline shows only what Advisor proposes. The margin (`<to-comments>`) has Advisor as its assistant. Ask it in any thread: it answers from the statistics, and suggests the statistical rewrite of the words in question as a change. If you ask it to "rewrite" and the server has a key, it calls the AI rewrite.

## Another author

Everything above reads the author from `authors/<id>.json`: the works and their sources, the name, the pronouns the advisor uses for the author, and a line of persona for the AI. `npm run build:model -- twain` builds Twain Advisor (903,501 words from eight books) in under a minute. In his space, *reckon* sits beside *maybe, ain't, bet*.
