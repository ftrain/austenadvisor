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

## Round 3: the rewrites, every sentence with its reason and its model

Each reason is one sentence, written by the engine from a template (never by the language model), and each link is a sentence of Austen's from the corpus.

### A Trip to the Store (15 → 86 on the engine's score)

> I was in want of milk, and therefore took up my keys and drove to the shop; but the place was extremely crowded, and the difficulty of my errand was not lessened by it. A man was standing in the very heart of the passage, talking to someone far away, and stopping the way of every body else.
>
> I was unwilling to be rude, and said that I begged his pardon, as civilly as I could; but he took no very great notice of me, and it was some time before he thought proper to move, and I might get my milk. I then saw a lady with whom I had formerly been intimate standing at the counter, and was essentially alarmed.
>
> "It is a long time since we met," said she, "and you look remarkably well."
>
> "I thank you," said I, "and you the same;" and I paid and left the shop as quickly as I could, having passed, I believe, the most awkward ten minutes of my week, which was a very sufficient allowance for a meeting of so little consequence.

- **I was in want of milk, and therefore took up my keys and drove to the shop; but the place was extremely crowded, and the difficulty of my errand was not lessened by it.**  
  This sentence uses her “clauses balanced in one period”, joins three sentences (3, 10, 4 words) into one of 34, and removes “grabbed”, “super” (never in Austen), modelled on Pride and Prejudice, ch. 43, ¶ 4.  
  > They descended the hill, crossed the bridge, and drove to the door; and, while examining the nearer aspect of the house, all her apprehensions of meeting its owner returned.  
  > — *Pride and Prejudice, ch. 43, ¶ 4*
- **A man was standing in the very heart of the passage, talking to someone far away, and stopping the way of every body else.**  
  This sentence removes “guy”, “hoodie”, “blocking”, “aisle” (never in Austen), modelled on Pride and Prejudice, ch. 18, ¶ 74.  
  > Mr. Bingley and Jane were standing together, a little detached from the rest, and talked only to each other.  
  > — *Pride and Prejudice, ch. 18, ¶ 74*
- **I was unwilling to be rude, and said that I begged his pardon, as civilly as I could; but he took no very great notice of me, and it was some time before he thought proper to move, and I might get my milk.**  
  This sentence uses her “speech reported”, “understatement and litotes”, joins four sentences (6, 4, 4, 8 words) into one of 44, and removes “ignored” (never in Austen), modelled on Mansfield Park, ch. 7, ¶ 17.  
  > She began then to be afraid of appearing rude and impatient; and walked to meet them with a great anxiety to avoid the suspicion.  
  > — *Mansfield Park, ch. 7, ¶ 17*
- **I then saw a lady with whom I had formerly been intimate standing at the counter, and was essentially alarmed.**  
  This sentence removes “ex”, “checkout”, “basically”, “panicked” (never in Austen) and brings in her “counter”, modelled on Sense and Sensibility, ch. 33, ¶ 3.  
  > All that could be done was, to sit down at that end of the counter which seemed to promise the quickest succession; one gentleman only was standing there, and it is probable that Elinor was not without hope of exciting his politeness to a quicker despatch.  
  > — *Sense and Sensibility, ch. 33, ¶ 3*
- **"It is a long time since we met," said she, "and you look remarkably well."**  
  This sentence uses her “speech tagged after its first clause” and joins three sentences (3, 4, 3 words) into one of 15, modelled on Pride and Prejudice, ch. 1, ¶ 5.  
  > “But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”  
  > — *Pride and Prejudice, ch. 1, ¶ 5*
- **"I thank you," said I, "and you the same;" and I paid and left the shop as quickly as I could, having passed, I believe, the most awkward ten minutes of my week, which was a very sufficient allowance for a meeting of so little consequence.**  
  This sentence uses her “ironic verdict”, “judgement in abstract nouns” and joins four sentences (3, 2, 9, 11 words) into one of 46, modelled on Northanger Abbey, ch. 25, ¶ 13.  
  > Nothing further was said for a few minutes; and then speaking through her tears, she added, “I do not think I shall ever wish for a letter again!”  
  > — *Northanger Abbey, ch. 25, ¶ 13*

Moves to practise (the notes, each with a sentence of hers that shows the move):

- *Clauses balanced in one period*: “I needed milk.” → “I was in want of milk, and therefore took up my keys and drove to the shop; but the place was extremely crowded, and the difficulty of my errand was not lessened by it.”  
  > She then sat still five minutes longer; but unable to waste such a precious occasion, she suddenly got up, and saying to Kitty, “Come here, my love, I want to speak to you,” took her out of the room. — *Pride and Prejudice, ch. 55, ¶ 13*
- *Speech tagged after its first clause*: “"Hey," she said.” → “"It is a long time since we met," said she, "and you look remarkably well."”  
  > “But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.” — *Pride and Prejudice, ch. 1, ¶ 5*
- *Speech reported*: “I said excuse me.” → “said that I begged his pardon, as civilly as I could”  
  > In a few minutes the servant returned, and with a look which did not quite confirm his words, said he had been mistaken, for that Miss Tilney had walked out. — *Northanger Abbey, ch. 12, ¶ 3*
- *Understatement and litotes*: “He totally ignored me.” → “he took no very great notice of me”  
  > In a few moments Catherine, with unaffected pleasure, assured her that she need not be longer uneasy, as the gentlemen had just left the Pump Room. — *Northanger Abbey, ch. 6, ¶ 36*
- *Ironic verdict*: “Honestly, it was the most awkward ten minutes of my week.” → “which was a very sufficient allowance for a meeting of so little consequence”  
  > In short, Catherine, everything has gone wrong, but it is now all happily settled. — *Lady Susan, ch. 24, ¶ 3*

### Letter Home from Camp (18 → 88 on the engine's score)

> My dear Mother and Father,
>
> Camp is, I suppose, all right; the food is not to be borne, and the friend who shares my cabin snores beyond all reason. Yesterday we went upon the water in a narrow boat, which I overturned; and the whole party was diverted, to my own very considerable mortification.
>
> There is, however, a girl of the name of Kayla, who is really fine company; she is from Ohio, and knows a great deal of horses. We walk down to the lake after dinner, and talk of nothing in particular; I think she likes me, though I am not certain of it, which is the usual condition of such discoveries.
>
> Will you send me more refreshments? and the device which keeps me within your call, which I have entirely forgotten. The persons set over us are not a little strict, though in general tolerable.
>
> Your affectionate Jake.
>
> P.S. I beg you will not let Max use my room.

- **My dear Mother and Father,**  
  This sentence puts the writer’s sense into her diction, modelled on Lady Susan, ch. 18, ¶ 3.  
  > I think, my dear mother, you would not disapprove of her as a daughter.  
  > — *Lady Susan, ch. 18, ¶ 3*
- **Camp is, I suppose, all right; the food is not to be borne, and the friend who shares my cabin snores beyond all reason.**  
  This sentence joins two sentences (5, 10 words) into one of 24, removes “okay”, “bunkmate”, “crazy” (never in Austen), and brings in her “shares”, modelled on Persuasion, ch. 22, ¶ 23.  
  > It is very fit they should have daughters’ shares; and I am sure he has always been a very kind, liberal father to me.  
  > — *Persuasion, ch. 22, ¶ 23*
- **Yesterday we went upon the water in a narrow boat, which I overturned; and the whole party was diverted, to my own very considerable mortification.**  
  This sentence uses her “clauses balanced in one period”, “judgement in abstract nouns”, joins two sentences (12, 4 words) into one of 25, and removes “canoeing”, “flipped”, “canoe” (never in Austen), modelled on Persuasion, ch. 18, ¶ 11.  
  > She and the Harvilles came on Tuesday very safely, and in the evening we went to ask her how she did, when we were rather surprised not to find Captain Benwick of the party, for he had been invited as well as the Harvilles; and what do you think was the reason?  
  > — *Persuasion, ch. 18, ¶ 11*
- **There is, however, a girl of the name of Kayla, who is really fine company; she is from Ohio, and knows a great deal of horses.**  
  This sentence joins two sentences (9, 10 words) into one of 26, writes out “there’s”, “who’s”, and brings in her “company”, modelled on Persuasion, ch. 16, ¶ 16.  
  > “My idea of good company, Mr. Elliot, is the company of clever, well-informed people, who have a great deal of conversation; that is what I call good company.”  
  > — *Persuasion, ch. 16, ¶ 16*
- **We walk down to the lake after dinner, and talk of nothing in particular; I think she likes me, though I am not certain of it, which is the usual condition of such discoveries.**  
  This sentence uses her “ironic verdict”, “clauses balanced in one period”, joins two sentences (12, 9 words) into one of 34, and writes out “I’m”, modelled on Mansfield Park, ch. 43, ¶ 2.  
  > You should listen to me till you were tired, and advise me till you were still tired more; but it is impossible to put a hundredth part of my great mind on paper, so I will abstain altogether, and leave you to guess what you like.  
  > — *Mansfield Park, ch. 43, ¶ 2*
- **Will you send me more refreshments? and the device which keeps me within your call, which I have entirely forgotten.**  
  This sentence joins two sentences (5, 8 words) into one of 20, removes “snacks”, “phone”, “charger” (never in Austen), and brings in her “refreshments”, modelled on Sense and Sensibility, ch. 36, ¶ 18.  
  > The dining parlour will admit eighteen couple with ease; card-tables may be placed in the drawing-room; the library may be open for tea and other refreshments; and let the supper be set out in the saloon.’  
  > — *Sense and Sensibility, ch. 36, ¶ 18*
- **The persons set over us are not a little strict, though in general tolerable.**  
  This sentence uses her “understatement and litotes” and removes “counselors” (never in Austen), modelled on Pride and Prejudice, ch. 10, ¶ 37.  
  > But in general and ordinary cases between friend and friend, where one of them is desired by the other to change a resolution of no very great moment, should you think ill of that person for complying with the desire, without waiting to be argued into it?”  
  > — *Pride and Prejudice, ch. 10, ¶ 37*
- **Your affectionate Jake.**  
  This sentence brings in her “affectionate”, modelled on Lady Susan, ch. 1, ¶ 5.  
  > Your most obliged and affectionate sister,  
  > — *Lady Susan, ch. 1, ¶ 5*
- **P.S. I beg you will not let Max use my room.**  
  This sentence writes out “don’t” and brings in her “beg”, modelled on Pride and Prejudice, ch. 19, ¶ 3.  
  > I beg you will not go.  
  > — *Pride and Prejudice, ch. 19, ¶ 3*

Moves to practise (the notes, each with a sentence of hers that shows the move):

- *Clauses balanced in one period*: “Yesterday we went canoeing and I flipped the canoe and everybody laughed.” → “Yesterday we went upon the water in a narrow boat, which I overturned; and the whole party was diverted, to my own very considerable mortification.”  
  > Good bye,” he added, shaking my hand with earnestness; “I do not know when you will see me again; but remember what I tell you of Frederica; you MUST make it your business to see justice done her. — *Lady Susan, ch. 23, ¶ 3*
- *Judgement in abstract nouns*: “It was so embarrassing.” → “my own very considerable mortification”  
  > I will tell you why she is out of spirits. — *Persuasion, ch. 6, ¶ 27*
- *Understatement and litotes*: “The counselors are kind of strict but mostly fine.” → “not a little strict”  
  > “Oh! very well,” exclaimed Miss Bates, “then I need not be uneasy. — *Emma, ch. 43, ¶ 24*
- *Ironic verdict*: “I think she likes me but I'm not sure.” → “which is the usual condition of such discoveries”  
  > If I did not believe that she had some regard for me, of course I should not say this, but I do believe it. — *Mansfield Park, ch. 44, ¶ 2*

### The Breakup (27 → 86 on the engine's score)

> Ryan wrote to me at midnight, to say that we must talk; and I understood at once what such a request meant.
>
> We met the next day at a shop where coffee was served, and I found him there before me, busy with the instrument in his hand, and looking not a little nervous; he said that he was not ready for anything serious, and that the fault was not mine but his own.
>
> I wished to cry, but did not; I only nodded, and said that it was all very well, and walked home in the rain, and ate a whole pint of ice, which was mostly cream.
>
> My friend, who shared my room, thought that I made too much of it; and perhaps I did, but it hurt me still, as a grief pronounced unreasonable commonly does.

- **Ryan wrote to me at midnight, to say that we must talk; and I understood at once what such a request meant.**  
  This sentence uses her “clauses balanced in one period”, joins three sentences (5, 6, 7 words) into one of 22, and removes “texted” (never in Austen), modelled on Pride and Prejudice, ch. 55, ¶ 11.  
  > Elizabeth would not observe her; and when at last Kitty did, she very innocently said, “What is the matter, mamma?  
  > — *Pride and Prejudice, ch. 55, ¶ 11*
- **We met the next day at a shop where coffee was served, and I found him there before me, busy with the instrument in his hand, and looking not a little nervous; he said that he was not ready for anything serious, and that the fault was not mine but his own.**  
  This sentence uses her “speech reported”, “understatement and litotes”, joins five sentences (10, 8, 3, 8, 8 words) into one of 52, and removes “downtown”, “scrolling”, “phone” (never in Austen), modelled on Mansfield Park, ch. 7, ¶ 33.  
  > Her own gentle voice speaking from the other end of the room, which was a very long one, told them that she was on the sofa.  
  > — *Mansfield Park, ch. 7, ¶ 33*
- **I wished to cry, but did not; I only nodded, and said that it was all very well, and walked home in the rain, and ate a whole pint of ice, which was mostly cream.**  
  This sentence uses her “feeling shown by conduct”, “speech reported”, joins three sentences (7, 6, 15 words) into one of 35, and removes “okay” (never in Austen), modelled on Northanger Abbey, ch. 25, ¶ 10.  
  > They went to breakfast directly; but Catherine could hardly eat anything.  
  > — *Northanger Abbey, ch. 25, ¶ 10*
- **My friend, who shared my room, thought that I made too much of it; and perhaps I did, but it hurt me still, as a grief pronounced unreasonable commonly does.**  
  This sentence uses her “clauses balanced in one period”, “ironic verdict”, joins three sentences (6, 3, 4 words) into one of 30, and removes “roommate”, “overreacting” (never in Austen), modelled on Pride and Prejudice, ch. 22, ¶ 3.  
  > Elizabeth would wonder, and probably would blame her; and though her resolution was not to be shaken, her feelings must be hurt by such disapprobation.  
  > — *Pride and Prejudice, ch. 22, ¶ 3*

Moves to practise (the notes, each with a sentence of hers that shows the move):

- *Speech reported*: “He said it wasn't me, it was him.” → “he said that he was not ready for anything serious, and that the fault was not mine but his own”  
  > It was his business, however, to say that he did, and he said it very prettily. — *Sense and Sensibility, ch. 49, ¶ 23*
- *Understatement and litotes*: “He looked nervous.” → “looking not a little nervous”  
  > I dare say she will not be in good humour again this month; but I am determined I will not be cross; it is not a little matter that puts me out of temper.” — *Northanger Abbey, ch. 15, ¶ 4*
- *Clauses balanced in one period*: “My roommate thought I was overreacting. Maybe I was. But it still hurt.” → “thought that I made too much of it; and perhaps I did, but it hurt me still”  
  > “No, but I wrote to him—I did indeed, I got up this morning before it was light, and was two hours about it; and when my letter was done I thought I never should have courage to give it. — *Lady Susan, ch. 24, ¶ 3*
- *Feeling shown by conduct*: “I just nodded and said okay.” → “I only nodded, and said that it was all very well”  
  > Emma recollected, blushed, was sorry, but tried to laugh it off. — *Emma, ch. 43, ¶ 57*
- *Ironic verdict*: “But it still hurt.” → “as a grief pronounced unreasonable commonly does”  
  > In time, of course, Mr. Knightley would be forgotten, that is, supplanted; but this could not be expected to happen very early. — *Emma, ch. 51, ¶ 38*
