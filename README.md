# Austen Advisor

Advisor helps a student write better by showing how a great writer would have written the same piece. The student pastes a paragraph or a page, picks one of twenty voices, and reads three columns, one row to each paragraph:

- **Yours**: the student's paragraph, with up to five words the voice never wrote underlined. Tap one for the voice's own word.
- **The voice**: the same paragraph rewritten in that voice.
- **Why**: at most two notes a row. Each names a move the rewrite made, says what it does, and quotes a real sentence of the voice's that makes it, cited by work and chapter.

The rewrite is written by a language model. Everything else on the page comes from the engine, which has no language model: a statistical model of each voice built from its complete works.

## How a student uses it

1. **Write or paste.** As the student types, the engine reads the text with no model call. Under the box it says which voice the text already sounds like and offers a stretch, a voice far from it that still suits the kind of piece. Or the student taps a kind (Argument, Story, Letter, Speech, Essay, Review) for one of 42 sample texts.
2. **Pick a voice.** One select lists every voice: three suggested for this piece first, then the four families (Storytellers, Speakers, Arguers, Essayists).
3. **Press Rewrite.** The engine's view shows at once: the shape of the piece (what each paragraph does, against the order the voice usually follows), a line on sentence length and punctuation, and the words the voice never wrote. The rewrite streams in part by part.
4. **Read the rows.** Each Why note has **Read it**, which opens the quoted sentence in its passage, and **Try it**.
5. **Try it.** The student writes one of their own sentences again with the move. The engine checks it in about 200 ms and says whether the move is there, how long the sentence runs against the voice's, what other moves it makes, and which words the voice never used. A miss gets a hint and an example. A pass is kept in **Your moves**, on this device.
6. **Flip voices.** On the result, the arrows move between voices the text is already rewritten in. Any other voice asks first ("Rewrite as Ernest Hemingway? It takes about 20 seconds."), so no rewrite is spent by accident.

When no rewrite is available (no key, or the day's budget spent), the student still gets the engine's view: for each paragraph, the voice's own sentences built most like the student's, and moves to try where the engine finds a gap, such as sentences much shorter than the voice's.

While the page waits, and on the compose screen, a card asks **Guess whose sentence this is**: a real sentence from one of three voices. After a guess it names the writer, the source, and the words that gave it away.

## The glossary

Every term of rhetoric, poetics or grammar the page uses is defined where it appears. A defined term is underlined; tap it and its definition opens in the line. The glossary is [src/engine/glossary.ts](src/engine/glossary.ts): 115 terms, each defined in one plain sentence, most with one short example. It is written to `data/glossary.sqlite` (a row for each term, a row for each name it goes by, and a full-text index) and rebuilt whenever the list changes.

```sh
curl localhost:4180/api/glossary?q=objection
curl localhost:4180/api/glossary/anastrophe
npm run cli -- define tricolon
```

## The voices

Each voice is a statistical model of the whole corpus below. All are public domain in the US; `authors/<id>.json` gives each work, its source and its license.

| Voice | Family | Corpus | Words |
|---|---|---|---|
| Jane Austen | Storytellers | the six novels, Lady Susan, the juvenilia, Sanditon (Standard Ebooks, Gutenberg) | 800,587 |
| George Eliot | Storytellers | Middlemarch, The Mill on the Floss, Silas Marner, Romola, Daniel Deronda (Standard Ebooks) | 1,117,254 |
| Charles Dickens | Storytellers | A Christmas Carol, David Copperfield, Bleak House, Hard Times, A Tale of Two Cities, Great Expectations (Standard Ebooks) | 1,162,758 |
| Mark Twain | Storytellers | eight books, from The Innocents Abroad to Joan of Arc (Standard Ebooks) | 903,501 |
| Ernest Hemingway | Storytellers | In Our Time, The Sun Also Rises, Men Without Women, A Farewell to Arms (Standard Ebooks) | 232,965 |
| Dashiell Hammett | Storytellers | Red Harvest, The Dain Curse, The Maltese Falcon and twenty Continental Op stories (Standard Ebooks) | 506,311 |
| Virginia Woolf | Storytellers | Mrs. Dalloway, To the Lighthouse, Orlando, The Common Reader, A Room of One's Own (Standard Ebooks, Gutenberg) | 331,160 |
| The Fairy Books | Storytellers | Andrew Lang's twelve coloured Fairy Books, Blue to Lilac (Gutenberg) | 1,247,250 |
| Abraham Lincoln | Speakers | The Papers and Writings, ed. Lapsley (1905), seven volumes with the Lincoln–Douglas debates (Gutenberg) | 394,520 |
| Frederick Douglass | Speakers | the Narrative and My Bondage and My Freedom (Standard Ebooks, Gutenberg) | 161,759 |
| Barack Obama | Speakers | 281 weekly addresses and 48 speeches from the Obama White House archive, works of the US government | 311,127 |
| The King James Bible | Speakers | all 66 books, cited by book, chapter and verse (Gutenberg ebook 30) | 789,626 |
| William Shakespeare | Speakers | the 37 plays, cited by act and scene, and the Sonnets, by number (Standard Ebooks, Gutenberg) | 816,564 |
| The Federalist | Arguers | the 85 papers of Hamilton, Madison and Jay (Standard Ebooks) | 187,067 |
| Edward Gibbon | Arguers | The Decline and Fall of the Roman Empire (Standard Ebooks) | 1,069,908 |
| G. K. Chesterton | Arguers | Heretics, Orthodoxy, What's Wrong with the World, The Everlasting Man, The Man Who Was Thursday, two Father Brown books (Standard Ebooks) | 499,442 |
| Samuel Johnson | Essayists | Rasselas, The Rambler, The Adventurer, The Idler (Standard Ebooks, Gutenberg) | 487,020 |
| Ralph Waldo Emerson | Essayists | Nature, the Essays, Representative Men, The Conduct of Life (Standard Ebooks, Gutenberg) | 272,035 |
| Henry David Thoreau | Essayists | Walden, A Week on the Concord and Merrimack Rivers, the essays, A Yankee in Canada (Standard Ebooks) | 443,883 |
| Oscar Wilde | Essayists | The Picture of Dorian Gray, the stories, Intentions, the four comedies (Standard Ebooks, Gutenberg) | 253,239 |

Each voice has a pack (`data/packs/<id>.json` and `.sif`), built from its model: its signature words, real sentences that make each of its moves, the rounds of the guessing game, and a shape index of its sentences. The server keeps every pack in memory, and the whole models of only the six voices used last.

[docs/eval/voices](docs/eval/voices/README.md) records how the voices were measured: every voice on every case, judged on fidelity, voice, sense, naturalness, notes, teaching and structure.

## The rewrite and its budget

A rewrite is one call to the writer for each part of the text (about 600 words of whole paragraphs), with one retry only on a hard failure: a sentence lost, a heading crossed, or the paragraphs run together. The engine writes the brief beforehand and the Why notes afterward, so no note quotes the model.

- **Writer.** With `ANTHROPIC_API_KEY`, Claude (`claude-opus-5-5`); with `DEEPSEEK_API_KEY` alone, DeepSeek (`deepseek-v4-pro`) through its Anthropic-compatible API; or any OpenRouter model with `ADVISOR_WRITER=openrouter:<model>` and `OPENROUTER_API_KEY`. `ADVISOR_MODEL` overrides the model. `data/tiers.json`, written by `scripts/tiers.ts` from two evaluation runs, can move a voice to the faster model where it scored within 0.3 of the best.
- **Reader.** With `DEEPSEEK_API_KEY` set, `deepseek-flash` first reads the text for contradictions; `ADVISOR_READER_MODEL` names another model. With neither, there is no reader. `ADVISOR_READER=off` turns it off.
- **Cache.** Each part the writer has rewritten is kept in `data/cache.sqlite` for 180 days (`ADVISOR_CACHE_DAYS`), keyed by a hash of the prompt's version and fingerprint, the voice, its tier, the part and the paragraphs on either side. Change one paragraph and only its part is written again. The table holds hashes, never a student's text. `ADVISOR_CACHE=off` turns it off.
- **Budget.** Ten full rewrites a day for each address (`ADVISOR_DAILY_PER_IP`), two million tokens a day across all students (`ADVISOR_DAILY_TOKENS`), counted as each call returns, one rewrite at a time for each open page, and the first 1,200 words of a long text (`ADVISOR_FULL_WORDS`) in at most three parts (`ADVISOR_PARTS`); the rest gets the engine's view. A limit of 0 means no limit. Requests from the server's own machine are not counted against the address limit. Past the budget, the page says "Rewrites of your own text are off for now. Every sample has a rewrite ready." and shows the engine's view.

Every setting is in [.env.example](.env.example).

### Samples rewritten ahead of time

`scripts/prewarm.ts` rewrites every sample in every voice through a running server's own `/api/rewrite` and keeps the result in `data/precomputed/<sample>/<voice>.json`. A text that is a sample, or has the same words with a few marks changed, is then served from there with no call at all, and the select marks those voices "ready".

**This has not been run yet.** It needs the owner's key on the server. Until then, samples are rewritten on demand like any other text, and with no key the page shows the engine's view only.

```sh
ANTHROPIC_API_KEY=… npm start                 # in one shell (port 4180, or set PORT)
BASE=http://localhost:4180 node scripts/prewarm.ts --check   # what is missing
BASE=http://localhost:4180 node scripts/prewarm.ts            # write every missing pair; safe to stop and restart
```

Move `data/tiers.json` aside while it runs, so every sample is written with the best model. A share of the pairs (10%) is saved for judging in `docs/eval/voices/`. `data/` is not in Git: the deploy ships `data/precomputed` and `data/tiers.json` by its `SHIP` list. A change to `PROMPT_VERSION` in `src/server/rewrite.ts` makes the kept rewrites stale; `node scripts/prewarm.ts --stale` writes them again.

## Running it

Node 24 or later.

```sh
npm install
npm run build:model -- austen   # about 3 minutes, once: fetches the works, WordNet and the Brown Corpus, trains the model
npm run build:model -- eliot    # about a minute each for the other voices (ids are the file names in authors/)
npm run fetch:obama && npm run build:model -- obama
node scripts/build-packs.ts     # every built voice's pack; run again after adding or rebuilding a voice
npm run dev                     # http://localhost:4180, keyless: the engine's view only
ANTHROPIC_API_KEY=… npm run dev # with rewrites
```

`npm run build:model` writes `data/english.sqlite` (WordNet 3.1 and a part-of-speech tagger trained on the Brown Corpus, shared by every voice) and `data/<id>.sqlite` (the corpus, its full-text index and the model). The server reads every pack at start and is ready in about a minute.

```sh
npm test                                   # the engine, the corpus readers, the routes, the page
npm run typecheck
npm run build && npm start                 # the built page, served by the same server
node scripts/index-samples.ts              # rebuild samples/index.json after adding a sample
npm run cli -- analyze samples/store.txt   # what the engine flags and advises
npm run cli -- austenize samples/store.txt # the engine's own rewrite, with reasons and sources
npm run cli -- word tolerable              # how the voice used a word
npm run cli -- concordance "at last"       # the voice's sentences with a phrase
npm run cli -- similar "I went to the shop to buy bread"
```

The page's API: `/api/boot` (voices, samples, glossary, which samples are ready), `/api/read` (the engine's view of a text), `/api/rewrite` (the rewrite, as lines of JSON), `/api/ready`, `/api/practice` and `/api/practice/drills` (Try it), `/api/guess`, `/api/glossary`, `/api/health`.

## How it works

See [docs/engine.md](docs/engine.md). The engine uses well-tested language technology and no language model:

- **Part-of-speech tagging:** an averaged perceptron (Collins 2002) trained on the Brown Corpus, 97.2% on held-out text.
- **Language model:** trigrams with interpolated Kneser–Ney smoothing (Kneser & Ney 1995; Chen & Goodman 1998).
- **Word senses:** WordNet 3.1, with simplified Lesk (1986) to pick the sense meant.
- **Word vectors:** positive PMI factored by randomized SVD (Levy, Goldberg & Dagan 2015; Halko, Martinsson & Tropp 2011), trained on each voice's works alone.
- **Sentence similarity:** SIF sentence vectors (Arora, Liang & Ma 2017).
- **Retrieval:** SQLite FTS5 ranked by BM25.
- **Style:** Burrows's Delta (2002) over the commonest words.

## Layout

```
authors/          a voice: works, sources, moves, family
samples/          the 42 sample texts and index.json
src/corpus/       Standard Ebooks and Gutenberg into chapters, paragraphs, sentences (SQLite + FTS5)
src/nlp/          tokenizer, tagger, WordNet, Kneser–Ney, SVD
src/train/        the build: english.sqlite and <id>.sqlite
src/engine/       the model in memory, packs, the reading, the notes, Try it, the glossary
src/server/       HTTP: routes/ holds one module per group of routes; page.ts and rewrite.ts run the rewrite;
                  cache.ts keeps the cache and the budget
src/web/          the page
scripts/          packs, the sample index, the prewarm, writer tiers, evaluations
```
