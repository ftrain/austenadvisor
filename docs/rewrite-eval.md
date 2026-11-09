# Rewrite with AI: three rounds, Sonnet writing, Opus judging

There was no API key in the build environment, so the rewrite protocol was run by hand. Claude Sonnet, as a subagent, played the rewriting model:

- it read the exact system and user prompts the server sends (`npm run cli -- brief`);
- it called the engine's tools through the CLI (`npm run cli -- tool …`);
- it submitted to the same gate the server runs (`npm run cli -- submit`), revising until accepted.

Claude Opus, as a separate subagent, judged the results blind to which prompt was which. It scored each rewrite 1–5 on fidelity, Austen's manner, period integrity, naturalness and the notes' teaching value, checking suspect phrases against the concordance. The samples were three of [samples/](../samples/): the store, the camp letter and the breakup. Every round's prompts and results are in [eval/](eval/).

## What each round changed

**Round 1: brief and ID citations.** The engine hands the model a numbered brief: each sentence with its register, the words Austen never wrote with her alternatives, and two of her sentences nearest it in meaning and register, by ID. The model cites only by ID, and the server renders every quotation from the corpus. The gate rejects words she never wrote, contractions in narration, sentences left out and unknown IDs.

Opus found the rewrites fluent, with good stretches, but:

- the notes cited Austen sentences that merely shared a word with the rewrite;
- phrase-level anachronisms passed ("ice cream" is two Austen words);
- modern things were dressed in purple periphrasis ("talking to a distant person by means of a little instrument in his hand");
- there was no irony.

**Round 2: her moves.**

- Austen's craft became seven named moves, each with a pattern a sentence must match (balance, judgement nouns, litotes, reported speech, "said she", feeling shown by conduct, ironic verdict).
- The brief lists real exemplars of each, and a `find_example` tool finds more.
- The gate requires a note's cited sentence to show its move.
- Compounds she never wrote ("coffee shop", "ice cream") are refused.

Opus: notes and period integrity improved. But "omit what is not load-bearing" became licence to drop the pint and the coffee shop. A report of rare word pairs pushed the model into inversions. There was still no irony.

**Round 3: fidelity and irony enforced, and every sentence linked.**

- The gate keeps what the writer named (nouns lost without a synonym are refused).
- It keeps the writer's degree of feeling (a hedge may not become "terrified").
- It requires the note's own words to show the move.
- It requires one ironic verdict in a longer passage.
- Rare pairs became advisory only.
- Every rewritten sentence names the Austen sentence that inspired it. The engine writes a one-sentence reason from a template and checks the link (below).

Opus: better than round 2 on every sample. The facts are kept, and each rewrite now has a real ironic verdict. Its remaining criticisms were of the new per-sentence links and of a few calques. Those were then fixed in the template and gate, after this round:

- moves are credited only in narration;
- noted moves (irony) are credited to their sentence;
- "removes", not "replaces";
- links never come from the juvenilia burlesques, and a link must show a move made or a word brought in;
- adverb + adjective calques are refused ("essentially alarmed", "really fine").

The round-3 texts below are re-rendered with that template. The gate changes would send two of the three back for one more revision.

## Scores (Opus, 1–5)

| | Fidelity | Manner | Period | Natural | Notes |
|---|---|---|---|---|---|
| Round 1 → 2 (judge 2) | 3.0 → 3.0 | 3.3 → 3.3 | 2.3 → 3.3 | 3.7 → 3.3 | 1.7 → 3.0 |
| Round 2 → 3 (judge 3) | 3.3 → 4.0 | 3.0 → 4.0 | 4.0 → 3.3 | 3.3 → 3.3 | 2.0 → 3.0 |

Each judge scored only the pair it compared. Judges 2 and 3 scored round 2 a little differently, so compare within a row.

## What the testing changed in the design

- **Structure in and structure out beats prose both ways.** A numbered brief, sentences mapped back by number, and citations by ID make every claim checkable.
- **A model does what the gate checks, not what the prompt asks.** The round-1 prompt asked for tool use and got almost none. Once the gate refused unattested compounds and unshown moves, the model looked things up.
- **Every check can be gamed, so each needs its counter-check.** "Keep the nouns" produced "a whole pint of ice, which was mostly cream". A compound's nouns now go with the compound.
- **The judge can be wrong too.** Opus proposed "ices" for ice cream, and the engine showed Austen never wrote it.
- **Patterns must see text as typed.** A run failed five times on `"…," said she` because the move pattern wanted curly quotes. The gate now reads straight quotes as curly.

**Round 4: same prompt, stricter template.** Sonnet ran the round-3 fixes. Opus judged the prose a modest improvement:

- sentences are shorter and more natural;
- no clauses were invented;
- the ironies now comment on what is there ("a diversion in which I could not be expected to join").

It found the links no better: several still matched on an incidental word ("yesterday", "paid"). There was also a false irony tag, and the reasons hid deletions as "removes".

Two gate bugs surfaced in Sonnet's runs:

- the litotes check refused genuine litotes ("not intolerable") because its pattern knew only "un-";
- the "said she" check failed on typed straight quotes.

Both are fixed, and litotes is now recognized by principle (strip the negative prefix; is what's left a quality-word of hers?).

**Then figures of speech.** At the writer's request, a recognizer for classical figures (litotes, periphrasis, antithesis, tricolon, polysyndeton, anaphora, parenthesis, inversion, hyperbole, the ironic generalization and aside, free indirect discourse) now drives three things:

- **The reasons.** Each one names the figures a sentence gained, and what became of each word she never wrote: replaced, rendered by periphrasis, rephrased, or dropped. Irony is credited only with a vehicle.
- **The links.** A link is chosen by the figure's own detector, not by a shared word.
- **The gate.** It refuses a dropped thing the writer named.

The round-4 texts below are rendered with it.

## Round 4: the rewrites, every sentence with its reason and its model

Each reason is one sentence, written by the engine from a template (never by the language model), and each link is a sentence of Austen's from the corpus.

### A Trip to the Store (15 → 92 on the engine's score)

> I was in want of milk, and having caught up my keys, I drove to the shop, where I found it extremely crowded, and the whole passage stopped up by a man who stood conversing with some absent person.
>
> I was not at all disposed to be rude, and begged him to excuse me; but he disregarded me entirely, and it was not till some time had passed that he moved, and I obtained my milk. I then perceived, at the counter, a lady who had once been something more to me than a stranger, and was thrown into a flutter of spirits.
>
> She addressed me with perfect ease, said that it was a long while since we had met, and that I looked extremely well; to which I replied with thanks, and the same compliment, in as few words as civility allowed.
>
> I paid, and left the place as fast as I could; and it was, I must say, the most awkward ten minutes of my week.

- **I was in want of milk, and having caught up my keys, I drove to the shop, where I found it extremely crowded, and the whole passage stopped up by a man who stood conversing with some absent person.**  
  This sentence joins four sentences (3, 10, 4, 16 words) into one of 39, replaces “grabbed” with “caught”, “super” with “extremely”, “guy” with “man” (never in Austen), and brings in her “conversing”, modelled on Sense and Sensibility, ch. 11, ¶ 7.  
  > Colonel Brandon, unfortunately for himself, had no such encouragement to think only of Marianne, and in conversing with Elinor he found the greatest consolation for the indifference of her sister.  
  > — *Sense and Sensibility, ch. 11, ¶ 7*
- **I was not at all disposed to be rude, and begged him to excuse me; but he disregarded me entirely, and it was not till some time had passed that he moved, and I obtained my milk.**  
  This sentence makes a polysyndeton, uses her “clauses balanced in one period”, and joins four sentences (6, 4, 4, 8 words) into one of 37, modelled on Sense and Sensibility, ch. 44, ¶ 40.  
  > In that point, however, I undervalued my own magnanimity, as the event declared; for I went, I saw her, and saw her miserable, and left her miserable—and left her hoping never to see her again.”  
  > — *Sense and Sensibility, ch. 44, ¶ 40*
- **I then perceived, at the counter, a lady who had once been something more to me than a stranger, and was thrown into a flutter of spirits.**  
  This sentence uses her “judgement in abstract nouns”, replaces “checkout” with “counter” (never in Austen), and rephrases “basically”, “ex” (never in Austen), modelled on Mansfield Park, ch. 32, ¶ 45.  
  > His hopes from both gentleman and lady suffered a small depression in consequence; but when he looked at his niece, and saw the state of feature and complexion which her crying had brought her into, he thought there might be as much lost as gained by an immediate interview.  
  > — *Mansfield Park, ch. 32, ¶ 45*
- **She addressed me with perfect ease, said that it was a long while since we had met, and that I looked extremely well; to which I replied with thanks, and the same compliment, in as few words as civility allowed.**  
  This sentence uses her “speech reported”, “clauses balanced in one period” and joins five sentences (3, 4, 3, 3, 2 words) into one of 40, modelled on Northanger Abbey, ch. 16, ¶ 16.  
  > Catherine, without hesitation, replied that she was very sure Miss Thorpe did not mean to dance at all.  
  > — *Northanger Abbey, ch. 16, ¶ 16*
- **I paid, and left the place as fast as I could; and it was, I must say, the most awkward ten minutes of my week.**  
  This sentence makes a parenthesis (“, I must say,”), uses her “clauses balanced in one period”, and joins two sentences (9, 11 words) into one of 25, modelled on Sense and Sensibility, ch. 44, ¶ 2.  
  > “Miss Dashwood, for half an hour—for ten minutes—I entreat you to stay.”  
  > — *Sense and Sensibility, ch. 44, ¶ 2*

Moves to practise (the notes, each with a sentence of hers that shows the move; ⚠ where the engine could not confirm it):

- *Clauses balanced in one period*: “I paid and left as fast as I could.” → “I paid, and left the place as fast as I could; and it was, I must say, the most awkward ten minutes of my week.”  
  > She then sat still five minutes longer; but unable to waste such a precious occasion, she suddenly got up, and saying to Kitty, “Come here, my love, I want to speak to you,” took her out of the room. — *Pride and Prejudice, ch. 55, ¶ 13*
- *Speech reported*: “"Hey," she said. "Long time no see. You look great."” → “She addressed me with perfect ease, said that it was a long while since we had met, and that I looked extremely well”  
  > In a few minutes the servant returned, and with a look which did not quite confirm his words, said he had been mistaken, for that Miss Tilney had walked out. — *Northanger Abbey, ch. 12, ¶ 3*
- *Judgement in abstract nouns*: “I basically panicked.” → “was thrown into a flutter of spirits”  
  > They remained but a few minutes together, as Miss Woodhouse must not be kept waiting; and Harriet then came running to her with a smiling face, and in a flutter of spirits, which Miss Woodhouse hoped very soon to compose. — *Emma, ch. 4, ¶ 28*
- *Ironic verdict*: “Honestly, it was the most awkward ten minutes of my week.” → “and it was, I must say, the most awkward ten minutes of my week.”  
  > In short, Catherine, everything has gone wrong, but it is now all happily settled. — *Lady Susan, ch. 24, ¶ 3*

### Letter Home from Camp (18 → 90 on the engine's score)

> My dear Mother and Father,
>
> Camp is, I suppose, not intolerable; the food is disagreeable, and my neighbour's breathing by night is past bearing. Yesterday we went on the water in a small boat, and I overturned it, and had the mortification of seeing everybody laugh, a diversion in which I could not be expected to join.
>
> There is, however, a girl named Kayla, from Ohio, a very agreeable sort of girl, and she knows a great deal about horses; we walk by the lake after dinner, and talk of nothing in particular; and I think she likes me, though I am not certain of it.
>
> Would you be so good as to send more refreshments, and the line that gives power to my instrument, which I quite forgot? The persons set over us are rather strict, but in general not disagreeable.
>
> Yours affectionately,
Jake
>
> P.S. Pray do not suffer Max to make use of my room.

- **My dear Mother and Father,**  
  This sentence puts the writer’s sense into her diction, modelled on Lady Susan, ch. 18, ¶ 3.  
  > I think, my dear mother, you would not disapprove of her as a daughter.  
  > — *Lady Susan, ch. 18, ¶ 3*
- **Camp is, I suppose, not intolerable; the food is disagreeable, and my neighbour's breathing by night is past bearing.**  
  This sentence makes a parenthesis (“, I suppose,”) and a litotes (“not intolerable”), joins two sentences (5, 10 words) into one of 19, and rephrases “okay”, “crazy”, “bunkmate” (never in Austen), modelled on Emma, ch. 35, ¶ 17.  
  > “You are very obliging; but as to all that, I am very indifferent; it would be no object to me to be with the rich; my mortifications, I think, would only be the greater; I should suffer more from comparison.  
  > — *Emma, ch. 35, ¶ 17*
- **Yesterday we went on the water in a small boat, and I overturned it, and had the mortification of seeing everybody laugh, a diversion in which I could not be expected to join.**  
  This sentence uses her “judgement in abstract nouns”, joins two sentences (12, 4 words) into one of 33, and replaces “canoeing” with “boat”, “canoe” with “boat” (never in Austen), modelled on Pride and Prejudice, ch. 53, ¶ 56.  
  > When the gentlemen rose to go away, Mrs. Bennet was mindful of her intended civility, and they were invited and engaged to dine at Longbourn in a few days’ time.  
  > — *Pride and Prejudice, ch. 53, ¶ 56*
- **There is, however, a girl named Kayla, from Ohio, a very agreeable sort of girl, and she knows a great deal about horses; we walk by the lake after dinner, and talk of nothing in particular; and I think she likes me, though I am not certain of it.**  
  This sentence makes a polysyndeton, uses her “clauses balanced in one period”, and joins four sentences (9, 10, 12, 9 words) into one of 49, modelled on Persuasion, ch. 18, ¶ 11.  
  > She and the Harvilles came on Tuesday very safely, and in the evening we went to ask her how she did, when we were rather surprised not to find Captain Benwick of the party, for he had been invited as well as the Harvilles; and what do you think was the reason?  
  > — *Persuasion, ch. 18, ¶ 11*
- **Would you be so good as to send more refreshments, and the line that gives power to my instrument, which I quite forgot?**  
  This sentence renders “phone” (“the line that gives power to my instrument”) by periphrasis, joins two sentences (5, 8 words) into one of 23, and replaces “snacks” with “refreshments” (never in Austen), modelled on Emma, ch. 15, ¶ 14.  
  > I could change my shoes, you know, the moment I got home; and it is not the sort of thing that gives me cold.”  
  > — *Emma, ch. 15, ¶ 14*
- **The persons set over us are rather strict, but in general not disagreeable.**  
  This sentence renders “counselors” (“The persons set over us are rather strict”) by periphrasis and makes a litotes (“not disagreeable”), modelled on Emma, ch. 12, ¶ 36.  
  > It is a dreadful thing to have you forced to live there! so far off!—and the air so bad!”  
  > — *Emma, ch. 12, ¶ 36*
- **Yours affectionately,
Jake**  
  This sentence brings in her “affectionately”, modelled on Persuasion, ch. 21, ¶ 59.  
  > He described one Miss Elliot, and I thought very affectionately of the other.”  
  > — *Persuasion, ch. 21, ¶ 59*
- **P.S. Pray do not suffer Max to make use of my room.**  
  This sentence writes out “don’t” and brings in her “suffer”, modelled on Emma, ch. 46, ¶ 50.  
  > To suffer her to engage herself—to suffer her even to think of such a measure!”  
  > — *Emma, ch. 46, ¶ 50*

Moves to practise (the notes, each with a sentence of hers that shows the move; ⚠ where the engine could not confirm it):

- *Clauses balanced in one period*: “There's this girl named Kayla who's really cool.” → “There is, however, a girl named Kayla, from Ohio, a very agreeable sort of girl, and she knows a great deal about horses; we walk by the lake after dinner, and talk of nothing in particular; and I think she likes me, though I am not certain of it.”  
  > Good bye,” he added, shaking my hand with earnestness; “I do not know when you will see me again; but remember what I tell you of Frederica; you MUST make it your business to see justice done her. — *Lady Susan, ch. 23, ¶ 3*
- *Judgement in abstract nouns*: “It was so embarrassing.” → “and had the mortification of seeing everybody laugh, a diversion in which I could not be expected to join.”  
  > I will tell you why she is out of spirits. — *Persuasion, ch. 6, ¶ 27*
- *Understatement and litotes*: “Camp is okay I guess.” → “Camp is, I suppose, not intolerable”  
  > “Oh! very well,” exclaimed Miss Bates, “then I need not be uneasy. — *Emma, ch. 43, ¶ 24*
- *Ironic verdict* ⚠: “everybody laughed.” → “a diversion in which I could not be expected to join.”  
  > We have delightful Rides round us, I have a Charming horse, am uncommonly fond of the Amusement, replied I quite recovered from my Confusion, and in short I ride a great deal.” — *Love and Freindship, “Letter The Second From A Young Lady Crossed In Love To Her Freind”, ¶ 2*

### The Breakup (27 → 85 on the engine's score)

> Ryan sent me word at midnight that we must talk; and I knew very well what such a summons meant.
>
> We met the next day at a place of refreshment in the town, where he was before me, and looked not a little uneasy. He said that he was not ready for anything serious, and that the fault was not mine but his own.
>
> I wished to cry, but did not; I only nodded, and said it was all very well. My walk home lay through the rain, which was at least consistent with the occasion, and I consoled myself with a whole pint of ice.
>
> My friend thought I made too much of it; and perhaps I did, though it hurt me still.

- **Ryan sent me word at midnight that we must talk; and I knew very well what such a summons meant.**  
  This sentence uses her “clauses balanced in one period”, joins three sentences (5, 6, 7 words) into one of 20, and rephrases “texted” (never in Austen), modelled on Sense and Sensibility, ch. 17, ¶ 49.  
  > Elinor looked surprised at his emotion; but trying to laugh off the subject, she said to him, “Do not you know my sister well enough to understand what she means?  
  > — *Sense and Sensibility, ch. 17, ¶ 49*
- **We met the next day at a place of refreshment in the town, where he was before me, and looked not a little uneasy.**  
  This sentence makes a litotes (“not a little”), joins three sentences (10, 8, 3 words) into one of 24, and rephrases “downtown”, “scrolling”, “phone” (never in Austen), modelled on Pride and Prejudice, ch. 42, ¶ 17.  
  > Accordingly, when she retired at night, she asked the chambermaid whether Pemberley were not a very fine place, what was the name of its proprietor, and with no little alarm, whether the family were down for the summer.  
  > — *Pride and Prejudice, ch. 42, ¶ 17*
- **He said that he was not ready for anything serious, and that the fault was not mine but his own.**  
  This sentence makes an antithesis (“not mine but his own”), uses her “speech reported”, and joins two sentences (8, 8 words) into one of 20, modelled on Emma, ch. 38, ¶ 3.  
  > Frank Churchill seemed to have been on the watch; and though he did not say much, his eyes declared that he meant to have a delightful evening.  
  > — *Emma, ch. 38, ¶ 3*
- **I wished to cry, but did not; I only nodded, and said it was all very well.**  
  This sentence uses her “feeling shown by conduct”, “speech reported”, joins two sentences (7, 6 words) into one of 17, and rephrases “okay” (never in Austen), modelled on Mansfield Park, ch. 41, ¶ 16.  
  > She turned away, and wished he would not say such things.  
  > — *Mansfield Park, ch. 41, ¶ 16*
- **My walk home lay through the rain, which was at least consistent with the occasion, and I consoled myself with a whole pint of ice.**  
  This sentence makes an ironic aside (“, which was at least consistent with the occasion”) and brings in her “consoled”, modelled on Sanditon (Fragment of a Novel), ch. 6, ¶ 11.  
  > Charlotte was fully consoled for the loss of her walk, by finding herself in company with those, whom the conversation of the morng had given her a great curiosity to see.  
  > — *Sanditon (Fragment of a Novel), ch. 6, ¶ 11*
- **My friend thought I made too much of it; and perhaps I did, though it hurt me still.**  
  This sentence uses her “clauses balanced in one period”, joins three sentences (6, 3, 4 words) into one of 18, and replaces “roommate” with “friend” (never in Austen), modelled on Pride and Prejudice, ch. 22, ¶ 3.  
  > Elizabeth would wonder, and probably would blame her; and though her resolution was not to be shaken, her feelings must be hurt by such disapprobation.  
  > — *Pride and Prejudice, ch. 22, ¶ 3*

Moves to practise (the notes, each with a sentence of hers that shows the move; ⚠ where the engine could not confirm it):

- *Clauses balanced in one period*: “Ryan texted me at midnight. He said we needed to talk. I knew right away what that meant.” → “Ryan sent me word at midnight that we must talk; and I knew very well what such a summons meant.”  
  > Elizabeth would not observe her; and when at last Kitty did, she very innocently said, “What is the matter, mamma? — *Pride and Prejudice, ch. 55, ¶ 11*
- *Understatement and litotes*: “He looked nervous.” → “looked not a little uneasy”  
  > I dare say she will not be in good humour again this month; but I am determined I will not be cross; it is not a little matter that puts me out of temper.” — *Northanger Abbey, ch. 15, ¶ 4*
- *Speech reported*: “He said he wasn't ready for something serious.” → “He said that he was not ready for anything serious, and that the fault was not mine but his own.”  
  > Frank Churchill seemed to have been on the watch; and though he did not say much, his eyes declared that he meant to have a delightful evening. — *Emma, ch. 38, ¶ 3*
- *Feeling shown by conduct*: “I wanted to cry but I didn't. I just nodded and said okay.” → “I wished to cry, but did not; I only nodded, and said it was all very well.”  
  > Emma recollected, blushed, was sorry, but tried to laugh it off. — *Emma, ch. 43, ¶ 57*
- *Ironic verdict*: “Then I walked home in the rain and ate a whole pint of ice cream.” → “My walk home lay through the rain, which was at least consistent with the occasion, and I consoled myself with a whole pint of ice.”  
  > In time, of course, Mr. Knightley would be forgotten, that is, supplanted; but this could not be expected to happen very early. — *Emma, ch. 51, ¶ 38*
