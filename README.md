# Austen Advisor

Paste your prose, choose a voice, and press the button. **Advisor** rewrites it as Jane Austen would have written it, or Shakespeare, or the King James Bible, and shows you why in three columns:

- **Yours**, with every word the voice never used underlined. Tap one for the words it did use in that place.
- **The rewrite**, sentence by sentence. Hover a sentence to light the sentences of yours it renders. Tap it for why it was written so, the sentence of the original it follows, and its words: tap a word to see how often and where the original used it.
- **Why**: each move the rewrite makes (balanced periods, litotes, speech reported, "And it came to pass", parallelism…), with a sentence of the original that shows it. Tap a citation to read it in its passage.

How a rewrite runs, in about twenty-five seconds:

1. **The engine briefs it.** From the voice's whole corpus: the words of yours the voice never used and its own words for them, its sentences nearest each of yours, its moves with examples, and its habits as targets (sentence length, punctuation, contractions).
2. **A fast reader reads it for sense** (deepseek-flash, about ten seconds): only a contradiction, or a true echo of one of the voice's famous scenes. "New Neighbors" gives the new family a mother, then says the father is single; the rewrite makes the standoffish woman his sister, and notes that the whole is the opening of Pride and Prejudice.
3. **The writer writes once** (deepseek-v4-pro, one transaction): first what kind of piece it is, how you built it, and how the voice would build it; then the rewrite, built to that plan; then the moves it made, the liberties it took (anything not in yours, said plainly) and the mendings of sense.
4. **The engine checks and mends** without a second call: a word the voice never used is put by the voice's own where the engine is sure of one; a note whose words do not make its move, or that misquotes the rewrite, is dropped; each note's source is chosen by the engine (of the voice's sentences that make the move, the one nearest the note's words) with the move's words marked. Only a hard failure (a sentence of yours lost, a heading crossed) is sent back.

Above the columns, **How it's built** sets your outline (claim, reason, objection, answer, call; or scene, turn, verdict) beside the voice's plan, each step with why. Below them, **Practise** gives up to three of the moves the rewrite made, each on a sentence of yours: rewrite it yourself and press Check, and the engine (no language model) says at once whether you made the move, what else you did, which words the voice never used, and how your sentences run against its.

**Every term is defined where it is used.** A move's heading carries what it does (the voice's own account of its move, else the glossary's), and a term of rhetoric, poetics or grammar in a note, a plan or a lesson (*litotes*, *blank verse*, *periodic sentence*, *procatalepsis*) is underlined: tap it and its definition opens in the line. The glossary is [src/engine/glossary.ts](src/engine/glossary.ts), ninety-five terms, most with an example, written to `data/glossary.sqlite` (a row a term, a row for each name it goes by, and a full-text index) and rebuilt whenever the list changes. `GET /api/glossary`, `/api/glossary?q=objection`, `/api/glossary/anastrophe`; `npm run cli -- define tricolon`.

[docs/eval/voices](docs/eval/voices/README.md) is how this was measured: every voice on every case, judged by Claude on fidelity, voice, sense, naturalness, notes, teaching and structure, round by round.

The voices, each a statistical model of its whole corpus:

| Voice | Corpus | Words |
|---|---|---|
| Jane Austen | the six novels, Lady Susan, the juvenilia, Sanditon (Standard Ebooks, Gutenberg) | 800,587 |
| George Eliot | Middlemarch, The Mill on the Floss, Silas Marner, Romola, Daniel Deronda (Standard Ebooks) | 1,117,254 |
| Mark Twain | eight books, from The Innocents Abroad to Joan of Arc (Standard Ebooks) | 903,501 |
| The King James Bible | all 66 books, cited by book, chapter and verse (Gutenberg ebook 30) | 789,626 |
| William Shakespeare | the 37 plays (Standard Ebooks), cited by act and scene, and the Sonnets (Gutenberg ebook 100), by number | 816,564 |
| The Fairy Books | Andrew Lang's twelve coloured Fairy Books, Blue to Lilac (Gutenberg) | 1,247,250 |
| Barack Obama | 281 weekly addresses and 48 speeches from the official White House archive, public domain as works of the federal government | 311,127 |

The Obama corpus is fetched once with `npm run fetch:obama` before its build; it keeps only the President's own words (not the Vice President's or others' remarks on the same pages, nor the press office's summaries).

See **[docs/rewrite-eval.md](docs/rewrite-eval.md)** for how the AI rewrite was designed and tested: three rounds of Claude Sonnet rewriting and Claude Opus judging, and what each round changed. See **[docs/before-after.md](docs/before-after.md)** for six everyday pieces (a trip to the store, a letter home from camp, a breakup…), each before and after the engine. Every change is listed with its reason and a sentence of Austen's.

## Running it

Node 24 or later.

```sh
npm install
npm run build:model -- austen   # ~3 minutes, once: fetches the works, WordNet and the Brown Corpus, trains the model
npm run build:model -- kjv      # ~1 minute each: the other voices
npm run build:model -- twain
npm run build:model -- eliot
npm run build:model -- fairy
npm run build:model -- shakespeare
npm run fetch:obama && npm run build:model -- obama
npm run dev                     # http://localhost:4180
```

`npm run build:model` writes two files to `data/`:

- `data/english.sqlite`: WordNet 3.1, and a part-of-speech tagger trained on the Brown Corpus. Both are shared by every author.
- `data/austen.sqlite`: the corpus, its full-text index, and the model.

Rewrite with AI needs an API key where the server runs. With an Anthropic key it uses Claude; with a DeepSeek key alone it uses DeepSeek through its Anthropic-compatible API, with the same prompts, tools and gate. `ADVISOR_MODEL` overrides the model (`claude-opus-5-5` and `deepseek-v4-pro` are the defaults).

```sh
ANTHROPIC_API_KEY=… npm run dev
DEEPSEEK_API_KEY=… npm run dev
```

The writer is whichever model has a key: Claude with `ANTHROPIC_API_KEY` (best in our evaluation), else DeepSeek; or any OpenRouter model with `ADVISOR_WRITER=openrouter:<model>` and `OPENROUTER_API_KEY`. DeepSeek's fast model does the reading whenever `DEEPSEEK_API_KEY` is set. Every setting is in [.env.example](.env.example). Two caches keep it cheap: the voice's long system prompt is the same for every rewrite, so the provider caches it (DeepSeek on its own, about two-thirds of each request's input; Claude by its cache mark, kept through OpenRouter too); and each finished rewrite is kept on disk (`data/cache/rewrites`), keyed by the text, the voice, the models and a fingerprint of the prompt's code, so the same text in the same voice comes back in milliseconds and a change to the prompt retires the old answers. `ADVISOR_CACHE=off` turns the second off.

Everything else needs no language model and no network once the model is built.

```sh
npm test                                   # the engine, the corpus readers, the routes
npm run cli -- analyze samples/store.txt   # what Advisor flags and advises
npm run cli -- austenize samples/store.txt # the statistical rewrite, with reasons and sources
npm run cli -- word tolerable              # how she used a word
npm run cli -- concordance "at last"       # her sentences with a phrase
npm run cli -- similar "I went to the shop to buy bread"
npm run cli -- rewrite samples/store.txt   # Claude + the engine (needs the key)
npm run before-after [-- --ai]             # regenerate docs/before-after.md
npm run build && npm start                 # the built page, served by the same server
```

## The corpus

All of Austen's published novels come from [Standard Ebooks](https://github.com/standardebooks) on GitHub: *Sense and Sensibility*, *Pride and Prejudice*, *Mansfield Park*, *Emma*, *Northanger Abbey* and *Persuasion*. These are clean XHTML with chapters, paragraphs, letters and verse marked up. The minor works come from Project Gutenberg's texts by way of GITenberg, with the boilerplate removed:

- *Lady Susan*
- the juvenilia, *Love and Freindship*
- *Sanditon*, from the 1925 transcription of the manuscript, with its editorial notes dropped

That makes 800,587 words in 357 chapters, 10,887 paragraphs and 34,296 sentences. Every sentence is kept with its citation. `authors/austen.json` lists the works and where each comes from.

## How it works

See [docs/engine.md](docs/engine.md). In short, the engine is built from a century of language technology, with no language model:

- **Vocabulary and inflection:** every form she used, by part of speech, by work, and in narration or speech.
- **Part-of-speech tagging:** an averaged perceptron (Rosenblatt 1958; Collins 2002) trained on the Brown Corpus. It scores 97.2% on held-out text.
- **Language model:** a trigram model of her sentences with interpolated Kneser–Ney smoothing (Shannon 1948; Kneser & Ney 1995; Chen & Goodman 1998).
- **Word senses:** WordNet 3.1 (Miller, 1985–) for senses, synonyms and related words, with Morphy for lemmas. Simplified Lesk (1986) picks the sense meant in context.
- **Word vectors:** positive PMI with a smoothed context distribution (Church & Hanks 1990; Levy, Goldberg & Dagan 2015), factored by randomized SVD (Halko, Martinsson & Tropp 2011). They are trained on her works alone, so "angry" sits next to *vexed*, *disappointed* and *astonished*.
- **Sentence similarity:** SIF sentence vectors (Arora, Liang & Ma 2017) find her sentences nearest yours in meaning.
- **Retrieval and collocation:** SQLite FTS5 ranked by BM25 (Robertson et al. 1994) for concordance, and Dunning's log-likelihood (1993) for collocates.
- **Spelling:** edit distance (Damerau 1964; Norvig 2007) catches typos.
- **Style:** Burrows's Delta (2002) over her 150 commonest words, plus Flesch–Kincaid (1975) readability.

## Another author

The engine knows nothing particular to Austen. An author is a JSON file of works and sources, with the button's words (`action`), what a full rewrite in that manner does (`manner`), the author's moves with a pattern each, and how sentences are cited (`citeStyle`). `authors/kjv.json` reads Project Gutenberg's numbered Bible (ebook 30) book by book, so that a verse is a paragraph and a citation reads "Genesis 1:3". `authors/twain.json` is there too:

```sh
npm run build:model -- twain
```

This builds Twain Advisor from Standard Ebooks' Twain. The page lists every voice that is built.

## Layout

```
authors/          an author: works and sources
src/corpus/       Standard Ebooks and Gutenberg into chapters, paragraphs, sentences (SQLite + FTS5)
src/nlp/          tokenizer, tagger, WordNet, Kneser–Ney, SVD, ZIP
src/train/        the build: english.sqlite and <author>.sqlite
src/engine/       the model in memory; analysis, alternatives, austenize, tools (one set for the page, the API and Claude)
src/server/       HTTP: app.ts serves the page and the API; routes/ holds one module per group of routes (listed in
                  routes/index.ts); page.ts and rewrite.ts run the AI rewrite
src/web/          the page: one route, three columns
```
