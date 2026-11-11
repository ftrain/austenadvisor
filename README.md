# Austen Advisor

Advisor helps a student write better by showing how a great writer would have written the same piece. The student pastes a paragraph or a page, picks a form (an essay, an anecdote) and one of twenty writers or the plain style, and reads three columns, one row to each paragraph:

- **Yours**: the student's paragraph, with up to five words the voice never wrote underlined. Tap one for the voice's own word. For the plain style the underlined words are the student's needless ones, each with the reason to cut it.
- **The voice**: the same paragraph rewritten in that voice. Text the rewrite added is highlighted, and a sentence that states a fact carries a footnote.
- **Why**: at most two notes a row. Each names a move the rewrite made, says what it does, and quotes a real sentence of the voice's that makes it, cited by work and chapter. A paragraph the form moved, and a part written to fill the form, each say so.

The rewrite is written by a language model, in one call for each part of the text. Everything else on the page comes from the engine, which has no language model: a statistical model of each voice built from its complete works, the fitting of the text to its form, the facts and the checks on what was added.

## How a student uses it

1. **Write or paste.** As the student types, the engine reads the text with no model call. Under the box it says which voice the text already sounds like and offers a stretch, a voice far from it that still suits the kind of piece. Or the student taps a kind (Argument, Story, Letter, Speech, Essay, Review) for one of 42 sample texts.
2. **Pick a voice and a form.** One select lists every voice: three suggested for this piece first, then the families (Storytellers, Speakers, Arguers, Essayists), then Styles, which holds the plain style. Beside it, **Form** lists Auto and seven forms: essay, argument, anecdote, story, letter, speech, review. Auto takes the form of the kind of writing the text already is. One checkbox, **Add facts from Wikipedia**, asks for facts.
3. **Press Rewrite.** The engine's view shows at once: the shape of the piece (what each paragraph does, the form's parts in order, and the order the voice usually follows), a line on sentence length and punctuation, and the words the voice never wrote. The rewrite streams in part by part.
4. **Read the rows.** Each Why note has **Read it**, which opens the quoted sentence in its passage, and **Try it**.
5. **Try it.** The student writes one of their own sentences again with the move. The engine checks it in about 200 ms and says whether the move is there, how long the sentence runs against the voice's, what other moves it makes, and which words the voice never used. A miss gets a hint and an example. A pass is kept in **Your moves**, on this device.
6. **Flip voices.** On the result, the arrows move between voices the text is already rewritten in. Any other voice asks first ("Rewrite as Ernest Hemingway? It takes about 20 seconds."), so no rewrite is spent by accident.

When no rewrite is available (no key, or the day's budget spent), the student still gets the engine's view: for each paragraph, the voice's own sentences built most like the student's, and moves to try where the engine finds a gap, such as sentences much shorter than the voice's.

While the page waits, and on the compose screen, a card asks **Guess whose sentence this is**: a real sentence from one of three voices. After a guess it names the writer, the source, and the words that gave it away.

## Form, facts and what was added

Before the writer is called, the engine does three things with no model.

- **It fits the text to the form** ([src/engine/forms.ts](src/engine/forms.ts), [src/server/fit.ts](src/server/fit.ts)). A form is a list of parts in order; an essay is claim, reasons with evidence, the other side and its answer, and a close. The engine labels each paragraph and puts the paragraphs in the form's order, moving as few as it can and dropping none. A paragraph that moved says so in its row: "Moved: this was your paragraph 3. An essay opens with its claim." Nothing moves across a heading.
- **It names the parts the text lacks.** When the student chose the form, the writer may write a missing part as one short paragraph. Its Yours cell reads "Not in your text. An essay closes by saying what the reader should now believe or do." Under Auto the form is only the engine's reading of the text, and no part is written.
- **It gathers facts** ([src/server/facts.ts](src/server/facts.ts)), when the checkbox is on. It finds the names and strongest noun phrases in the text, looks each up on Wikipedia through the `@pef/wikiproxy` library, and keeps at most three sentences a paragraph and twelve a text, each quoted exactly. It spends six seconds at most, and a text with nothing to look up gets none. The writer may state a fact in a sentence of its own or work it into one of the student's.

After the writer answers, the engine checks what was added (`factGate` in [src/server/rewrite.ts](src/server/rewrite.ts)). A fact that was not supplied is dropped. A sentence that renders none of the student's sentences is marked as added, and so is one that shares almost no words with the sentences it claims to render. An added sentence that states a number or a name found in no supplied fact and not in the student's text is cut.

On the page, added text is highlighted in one colour, and one line under the column heads says "Highlighted text was added. It is not in yours." A sentence that states a fact ends with a small number. The facts are listed under the rows, each quoted from its article with the article's title as a link. **Copy** copies the rewrite with the facts as numbered notes. A text with nothing added and no facts shows neither the line nor the list.

Facts need a contact address. Wikimedia asks every client to name one, and the library refuses a User-Agent without it, so set `ADVISOR_WIKI_UA` to a name with a project URL or an address. Without it, facts are off and rewrites go on as before.

## The glossary

Every term of rhetoric, poetics or grammar the page uses is defined where it appears. A defined term is underlined; tap it and its definition opens in the line. The glossary is [src/engine/glossary.ts](src/engine/glossary.ts): 132 terms, each defined in one plain sentence, most with one short example. It is written to `data/glossary.sqlite` (a row for each term, a row for each name it goes by, and a full-text index) and rebuilt whenever the list changes.

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

**The plain style** stands apart from the twenty writers, under Styles. It is a manner with rules: formal, declarative prose with everything extra removed. Its models are Ulysses S. Grant's Personal Memoirs and William Strunk's The Elements of Style of 1918 (240,245 words). Its moves are rules the engine checks ([src/engine/plain.ts](src/engine/plain.ts)): needless words cut, the active voice, positive form, no hedges or intensifiers, one idea a sentence, the concrete word. The student's modern words stay. In place of words the voice never wrote, the Yours column marks the student's needless words: the hedges, intensifiers and stock phrases the rules cut.

Each voice has a pack (`data/packs/<id>.json` and `.sif`), built from its model: its signature words, real sentences that make each of its moves, the rounds of the guessing game, and a shape index of its sentences. The server keeps every pack in memory, and the whole models of only the six voices used last.

[docs/eval/voices](docs/eval/voices/README.md) records how the voices were measured: every voice on every case, judged on fidelity, voice, sense, naturalness, notes, teaching and structure.

## The rewrite and its budget

A rewrite is one call to the writer for each part of the text (about 600 words of whole paragraphs), with one retry only on a hard failure: a sentence lost, a heading crossed, or the paragraphs run together. The engine writes the brief beforehand and the Why notes afterward, so no note quotes the model.

- **Writer.** With `ANTHROPIC_API_KEY`, Claude (`claude-opus-5-5`); with `DEEPSEEK_API_KEY` alone, DeepSeek (`deepseek-v4-pro`) through its Anthropic-compatible API; or any OpenRouter model with `ADVISOR_WRITER=openrouter:<model>` and `OPENROUTER_API_KEY`. `ADVISOR_MODEL` overrides the model. `data/tiers.json`, written by `scripts/tiers.ts` from two evaluation runs, can move a voice to the faster model where it scored within 0.3 of the best.
- **Reader.** With `DEEPSEEK_API_KEY` set, `deepseek-flash` first reads the text for contradictions; `ADVISOR_READER_MODEL` names another model. With neither, there is no reader. `ADVISOR_READER=off` turns it off.
- **Cache.** Each part the writer has rewritten is kept in `data/cache.sqlite` for 180 days (`ADVISOR_CACHE_DAYS`), keyed by a hash of the prompt's version and fingerprint, the voice, its tier, the form as the part's brief states it, the ids of the facts supplied, the part and the paragraphs on either side. Change one paragraph and only its part is written again. The table holds hashes, never a student's text. `ADVISOR_CACHE=off` turns it off.
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

The page's API: `/api/boot` (voices, forms, samples, glossary, which samples are ready), `/api/read` (the engine's view of a text; `form` is `auto` or a form's id), `/api/facts` (the facts for a text), `/api/rewrite` (the rewrite, as lines of JSON; it takes `form`, and `facts`, which is on unless false; with `job: true` it answers with a job id, and `GET /api/rewrite/<job>?after=n` gives the lines from the n-th on), `/api/ready`, `/api/practice` and `/api/practice/drills` (Try it), `/api/guess`, `/api/glossary`, `/api/health`.

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
                  fit.ts fits a text to its form; facts.ts gathers facts; cache.ts keeps the cache and the budget
src/web/          the page
scripts/          packs, the sample index, the prewarm, writer tiers, evaluations
```
