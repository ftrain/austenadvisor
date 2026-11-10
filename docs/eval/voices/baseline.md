# Voices evaluation: baseline

60 rewrites (6 voices × 10 cases), judged by anthropic/claude-sonnet-5.5. Judge scores 1–5; engine score 0–100 against the voice's corpus; never-used is words left in the rewrite that the voice never used.

## By voice

| | fidelity | voice | sense | natural | notes | mean | engine score | never-used | time | errors |
|---|---|---|---|---|---|---|---|---|---|---|
| Jane Austen | 2.5 | 3.0 | 2.8 | 2.5 | 2.1 | 2.6 | 93.1 | 0.2 | 48s | 0 |
| George Eliot | 2.2 | 3.0 | 2.9 | 2.5 | 2.1 | 2.5 | 89.5 | 0.3 | 45s | 0 |
| The Fairy Books | 2.8 | 2.9 | 2.8 | 2.5 | 2.1 | 2.6 | 87.4 | 0.1 | 83s | 0 |
| The King James Bible | 2.5 | 3.1 | 3.3 | 2.6 | 1.9 | 2.7 | 83.4 | 2.1 | 34s | 0 |
| Barack Obama | 2.5 | 2.4 | 3.5 | 2.8 | 1.8 | 2.6 | 66.1 | 1.0 | 39s | 0 |
| Mark Twain | 2.7 | 2.8 | 3.4 | 2.7 | 2.0 | 2.7 | 77.5 | 0.4 | 34s | 0 |
| **All** | 2.5 | 2.9 | 3.1 | 2.6 | 2.0 | 2.6 | 82.8 | 0.7 | 47s | 0 |

## By case

| | fidelity | voice | sense | natural | notes | mean | engine score | never-used | time | errors |
|---|---|---|---|---|---|---|---|---|---|---|
| breakup | 2.2 | 2.8 | 2.7 | 2.0 | 1.8 | 2.3 | 88.7 | 0.8 | 29s | 0 |
| camp-letter | 2.5 | 2.8 | 2.8 | 2.3 | 2.0 | 2.5 | 84.3 | 1.0 | 69s | 0 |
| job-interview | 2.5 | 3.0 | 3.2 | 2.5 | 2.0 | 2.6 | 82.7 | 1.5 | 40s | 0 |
| neighbors | 2.3 | 3.0 | 3.0 | 2.8 | 2.0 | 2.6 | 83.5 | 0.2 | 81s | 0 |
| party | 2.5 | 2.8 | 2.7 | 2.7 | 2.0 | 2.5 | 82.8 | 0.3 | 51s | 0 |
| store | 2.3 | 3.0 | 2.8 | 2.3 | 1.8 | 2.5 | 83.0 | 0.5 | 50s | 0 |
| email | 2.3 | 2.8 | 3.0 | 2.5 | 2.0 | 2.5 | 76.3 | 0.8 | 50s | 0 |
| list | 2.8 | 2.7 | 3.7 | 3.2 | 2.3 | 2.9 | 86.7 | 0.7 | 32s | 0 |
| paris | 2.7 | 2.7 | 3.3 | 2.8 | 2.0 | 2.7 | 75.0 | 0.8 | 28s | 0 |
| relieved | 3.2 | 3.0 | 4.0 | 2.8 | 2.0 | 3.0 | 85.3 | 0.2 | 43s | 0 |

## Faults

### austen / breakup (f3 v3 s4 n2 n2)

_The rewrite keeps the main events in order but blurs the phone, alters 'okay' and the nod, and adds an invented maxim. The diction is stiff and sometimes awkward ('My companion with whom I shared the room'), and the notes cite doubtful sources while leaving the real changes unreported._

- **fidelity**: “engaged with some little trifle of the hand, rather than with his own thoughts”: The original says he was scrolling on his phone. The rewrite adds a contrast with his thoughts that the writer never made, and 'trifle of the hand' is so vague that the fact is lost.
- **fidelity**: “and said that it was all very well”: The writer said only 'okay'. 'All very well' carries a note of irony or reluctant acceptance that was not in the original.
- **fidelity**: “for in such cases, where the mind cannot be comforted, the appetite must be attended to in its stead.”: This is an invented maxim. It is arguably commentary, but it explains the ice cream with a stated reason and a note of mock-philosophy the writer did not give.
- **fidelity**: “he had something of consequence to say to me”: The writer said only 'we needed to talk'. The rewrite adds something of consequence, and 'desiring that we should meet' changes the text into a request to meet.
- **fidelity**: “I knew right away what that meant.”: The immediacy and the brevity of the original dread are diluted into a long, cool construction with a double negative, which weakens the sense of knowing at once.
- **natural**: “My companion with whom I shared the room”: This is clumsy and awkward. Austen would say 'my room-mate' or 'the friend who shared my apartments'. The phrase is wordy without being elegant.
- **natural**: “a shop in the town”: The coffee shop is reduced to a vague 'shop', and a coffee shop would be an anachronism. The voice needs a period substitute, and 'downtown' is lost.
- **natural**: “I only bowed my head and made him some short answer of assent”: The writer said she nodded. Bowing the head is more formal, and the long phrase 'short answer of assent' is heavy and slightly comic.
- **voice**: “I was not so little acquainted with such language as to be in any doubt of what it must mean.”: The stacked negatives are overdone, and the Austen irony is aimed at nobody. It reads as pastiche more than as Austen's narrative manner.
- **voice**: “but it hurt me all the same.”: The ending is plain modern idiom ('all the same') and loses the balance that Austen would give the final line. The closing feeling is not tied to any judgement.
- **voice**: “I wanted to cry, but I did not”: The first-person confessional narration is not Austen's manner, but the rewrite does not make up for it with free indirect style or a narrator's irony.
- **notes**: “Clauses balanced in one period”: The cited chapters and paragraphs cannot be verified, and the label 'Speech reported' or 'Feeling shown by conduct' is applied to sentences that merely paraphrase the writer. The citations look like invented references. Paragraph 3 has no notes at all.
- **notes**: “Judgement in abstract nouns: “in such cases, where the mind cannot be comforted, the appetite must be attended to in its stead.””: The same sentence is annotated twice with different sources, one as 'ironic verdict' and one as 'abstract nouns'. This is redundant, and neither note mentions that the maxim was added to the text.
- **notes**: “[structure] Structure: Brings together your paragraphs 1 and 2.”: The notes do not report that the original's 'nodded' became 'bowed my head', that the 'phone' was obscured, or that 'okay' changed register, so the changes are not reported.

### austen / camp-letter (f2 v3 s2 n2 n3)

_The rewrite has a pleasant Austenian surface, but it garbles or changes several facts: Ohio becomes 'the country', the snoring becomes insomnia, the phone charger becomes a 'machine for writing', and invented expectations and a rescue are added. The notes do not flag any of these and are thin and partly mislabeled._

- **fidelity**: “She is from the country”: The original says she is from Ohio. The specific place is replaced with a vague 'country', so a fact is lost. 'The country' also means something different from a state.
- **fidelity**: “or sleeps so loud that nobody else can”: The bunkmate 'snores like crazy'. The rewrite turns this into insomnia plus loud sleep, which is garbled and adds an invented detail ('lies awake half the night').
- **fidelity**: “and was taken up in a state which afforded great entertainment”: Adds a rescue ('taken up'). The original only says everybody laughed. The laughter is also blurred into 'entertainment'.
- **fidelity**: “for the food here does not quite answer to my appetite”: This repeats the food complaint as a reason for the snacks. The original gives no reason and the food was 'gross', so the force is weakened. It is also redundant.
- **fidelity**: “whether from want of skill or of attention I know not”: Adds a speculation about the cause of the capsizing that the writer never made.
- **fidelity**: “while I am away”: Small addition to the P.S. that is not in the original.
- **fidelity**: “I think her by far the pleasantest girl of all the party”: Inflates 'really cool' into a comparative superlative over all the girls. This is a new claim.
- **natural**: “my little machine for writing”: A circumlocution for the phone charger that actually names a typewriter or pen. It is a riddle and the wrong object. A charger is not a writing machine, so the sense is lost.
- **natural**: “Camp, upon the whole, is tolerably well, though I cannot pretend that my expectations have been answered”: Adds disappointed expectations the writer never expressed. 'Okay I guess' is not the same as unmet expectations. The 'society... more of form than of comfort' clause is also invented.
- **sense**: “my little machine for writing, which I entirely forgot, I beg you would send likewise”: The phone charger is turned into something unrelated and the mending is not reported. The rewrite also leaves out that the charger is for a phone. The clause is clumsy as well.
- **voice**: “My dear Father and Mother, Camp, upon the whole,”: The letter opening runs straight into the body with no line break. The result reads as a pastiche and the rewrite also lacks Austen's ironic play. It has mostly stock phrases.
- **notes**: “cites Sense and Sensibility, ch. 13, ¶ 62”: The label 'Feeling shown by conduct' does not fit the snoring line, which is a complaint rather than feeling shown by action. The citations also look unverifiable and are used for generic moves.
- **notes**: “Ironic verdict: “I was taken up in a state which afforded great entertainment to the whole party; I was not a little mortified by it.””: This duplicates the litotes note by quoting the same sentence. The notes also say nothing of the changes made to the facts (Ohio, charger, added expectations) and give no 'sense' mending report.
- **notes**: “Paragraph 2 (renders the writer’s ¶3):
  (no notes)”: Paragraphs 2, 4 and 5 carry no notes, though they contain significant changes such as 'the country' and the 'machine for writing'. The writer is not told about these.

### austen / job-interview (f2 v3 s2 n2 n2)

_The rewrite has some Austenian cadence and diction, but it adds incidents and feelings, reverses the smile's effect, invents a sum of money, and introduces a confusing 'powers' aside. The notes mislabel moves and give doubtful pinpoint citations without admitting the changes._

- **fidelity**: “that smile, so much at variance with my own notion of what I deserved, sunk me a very little lower”: The writer's 'She smiled anyway' is a mild relief. The rewrite makes the smile deflate the narrator, which reverses the feeling.
- **fidelity**: “which I had the mortification of seeing was not lost upon her”: This adds an incident: the interviewer visibly noticing the narrator's weak answer. The writer only said the answer was lame.
- **fidelity**: “I could not look upon it without suspecting that every person in it must be a person of consequence”: This adds a new thought, that the staff are important people. It is more than commentary on what is there.
- **fidelity**: “like a walking testimony to my own want of consequence”: This adds self-deprecation and intensifies the writer's mild 'out of place'. It also repeats 'consequence' from the previous sentence.
- **fidelity**: “scarce five pounds in the world”: The writer said only 'basically broke'. The specific sum is invented.
- **fidelity**: “it is her being right that I trust for above every thing”: 'I hope she's right' becomes strong trust and dependence. The degree of feeling shifts, and the sentence is clumsy.
- **fidelity**: “carried about their cups of coffee with an air of perfect ease”: 'Fancy' coffee is lost, and 'hoodies' becomes the vague 'rough common dress of the town'. Both details are blurred.
- **sense**: “for by neither of those names, I am convinced, would she have called them”: This is an unexplained aside that contradicts the plain fact that she asked about strengths and weaknesses. It introduces confusion into a clear draft, and the notes do not report it.
- **natural**: “I called upon my sister”: In Austen's idiom 'called upon' means a visit in person, not a telephone call. It is a misused sense.
- **natural**: “I called upon my sister, and related to her, with all the eagerness of a mind in suspense, the particulars of the hour I had passed”: This is padding, and it adds an eager full retelling the writer never gave.
- **natural**: “my powers and my weaknesses”: 'Powers' is an awkward substitute for 'strengths', and the following dash sentence makes it more confusing.
- **voice**: “and it is her being right that I trust for above every thing, because I am in the greatest need of this situation; for the rent is due next week”: The sentence is a clumsy pile of 'because' and 'for' clauses with a shifting tense. It is not Austen's controlled periodic balance.
- **notes**: “Ironic verdict: “and it is her being right that I trust for above every thing”: The label does not fit the passage, which is earnest need rather than irony. The cited source, Lady Susan 'ch. 17 ¶ 4', is doubtful for an epistolary work.
- **notes**: “Feeling shown by conduct: “She smiled, however, and that smile”: The quoted passage is narratorial self-judgement, not feeling shown by conduct. The specific chapter and paragraph citations look unreliable.
- **notes**: “Judgement in abstract nouns”: The notes never mention the added content, the invented figure, or the 'powers' aside. They report no sense mendings, although the rewrite changed the text in these places.

### austen / neighbors (f2 v3 s3 n3 n2)

_The prose is passably period-flavoured and the mother's matchmaking irony is well caught. The mend for the contradiction deletes the standoffish mother instead of reassigning her, the order of revelation is shuffled so 'on hearing it' dangles, and several move labels in the notes are inaccurate._

- **fidelity**: “The father, it was soon agreed, seemed a very good sort of man; and it was not long before it appeared”: The standoffish mother is deleted outright, so the writer's fact 'The mom is kind of standoffish' is lost. The two characterisations of the household are reduced to one.
- **sense**: “I removed the mother, so that the father, single and parted from his wife, agrees”: The contradiction is caught and reported, but the mending deletes a fact instead of reassigning it. The woman could have been a sister, housekeeper or other relation who stays standoffish. Deleting her leaves the writer's observation unrepresented.
- **fidelity**: “The father, it was soon agreed, seemed a very good sort of man; and it was not long before it appeared that he was in the law”: The order is changed: the lawyer and divorce revelation now comes before the mother's baking and enquiries, but the writer reveals it afterwards. 'It was soon agreed' also invents a consensus among neighbours.
- **natural**: “My mother's countenance, on hearing it, wore an expression”: 'it' has no antecedent, because the revelation was moved to paragraph 1. The reader cannot tell what she heard, and the cause-and-effect of the writer's 'Well, divorced. My mom got this look' is blurred.
- **fidelity**: “in so doing opened an acquaintance which was to answer every purpose of her heart”: This adds an outcome not in the original, namely that the acquaintance will serve her purposes. The baking is also reduced to 'sending over a plate', so the baking itself is dropped.
- **natural**: “whose curiosity was not to be resisted by any distance”: This is an odd, near-meaningless phrase. The neighbour is next door, so distance is irrelevant, and the litotes does not land.
- **fidelity**: “with a great cart of furniture”: 'Huge truck' becomes a cart, and 'of furniture' is added. This is a period substitution, but it changes the detail slightly.
- **notes**: “Judgement in abstract nouns: “The father, it was soon agreed, seemed a very good sort of man””: The sentence contains no abstract nouns, so the label does not describe the move. The cited source is doubtful for it.
- **notes**: “Clauses balanced in one period: “A new family removed into the house next door at the close of the last week, with a great cart of furniture and two little children.””: The sentence is a plain loose sentence with no balanced clauses, so the move is mislabelled.
- **notes**: “Speech reported: “what they did for their living, and whether they went to church, were questions which followed one another””: This is narrated enquiry, not reported speech, so the label is loose.
- **notes**: “while changing no fact of the passage”: This is false, because the mother is removed and her standoffishness is lost. The echo-of-Pride-and-Prejudice note is also put under 'sense' though it is not a fault mending.
- **voice**: “did her great credit”: The ironic praise is Austenian, but much of the rest is generic period diction. There is little of Austen's free indirect style or her sharp, epigrammatic framing.

### austen / party (f3 v3 s3 n3 n2)

_The rewrite has a plausible period diction but adds an ironic aside about noise and shifts several details such as the eye-roll and the verdict on the guests. The notes include a spurious Box Hill claim and doubtful citations, so they teach little and misdescribe the passage._

- **fidelity**: “so exceedingly loud that it would have been the whole of the entertainment to those who delight in noise”: The writer only said the music was super loud. The rewrite adds an ironic comment about people who like noise, which is more than the voice's commentary on what is there. It also makes the noise sound like the whole entertainment, which the writer did not say.
- **fidelity**: “the two together made him not altogether unamusing”: The writer said he was arrogant but also funny. The rewrite's weak, hedged verdict softens the 'funny' and adds a judgement of its own.
- **fidelity**: “the people about him not worth speaking to”: The writer said the people were boring. The rewrite turns that into a statement that they were not worth speaking to, which is a different and harsher claim.
- **fidelity**: “Emma turned away her eyes”: The writer said Emma rolled her eyes, a gesture of exasperation. Turning away the eyes is a different gesture and loses the eye-roll's dismissive attitude.
- **fidelity**: “helping to put the rooms to rights”: The writer said he helped clean up when everyone else left. The rewrite does not state this clearly, and 'quitted the house' is also a little stronger than 'left'.
- **natural**: “every body else had quitted the house, I saw him helping”: The sentence is awkward. The narrator sees him helping after everyone has quitted the house, so it is unclear where the narrator is, and the order of events is blurred.
- **voice**: “I could not but feel that I had been, perhaps, a little too hasty in my judgement of him”: The writer's 'Maybe I was wrong' is an open question. The rewrite turns it into a settled admission, and the Austen idiom is somewhat generic. The first-person narration is also not typical of Austen's narrators.
- **notes**: “The passage faintly, and in inverted form, echoes the Box Hill scene from Emma, chapter 43”: This is a spurious claim. The writer's passage has no Box Hill echo, and the note labels it a 'sense' point though no sense fault was found or mended. It also misstates the scene, since Emma rebukes nobody there and Knightley rebukes Emma. The note reads as invented justification.
- **notes**: “cites Emma, ch. 44, ¶ 4”: The citations look arbitrary or fabricated, and they do not obviously show the cited move. The 'Ironic verdict' note is also a duplicate of the first move's quote, so the notes teach little.
- **notes**: “Structure: Brings together your paragraphs 1 and 2.”: The note is accurate but thin. It does not report that the rewrite also added the commentary on noise, so the writer is not told about a real addition.

### austen / store (f2 v3 s1 n2 n2)

_The rewrite has a real fault of sense: it calls the ex "him", which conflates her with the hoodie man. It also adds invented class judgment and softens the panic. The Austen diction is partly convincing, but "Hey", "instrument" and "awkward" break it, and the notes mislabel moves and never mention the error._

- **sense**: “It was then that I saw him at the place of payment—my former acquaintance—”: The ex is female ("she said"), but the rewrite says "him", which makes it seem the hoodie man is the ex. It contradicts the next paragraph and creates a real fault of sense.
- **fidelity**: ““Hey,” said she; “it is an age since I have seen you—and you are looking remarkably well.””: The speech is rendered more formally, but "Hey" is retained, which is jarring. It is also not mended and breaks the voice.
- **fidelity**: “and I was for a moment not a little alarmed, though I did my best to command my countenance.”: The writer said he "basically panicked". "Not a little alarmed" softens that, and "did my best to command my countenance" adds an unstated action, namely hiding his feelings.
- **fidelity**: “whose dress proclaimed him not of the better sort”: This adds a social judgment of class that the writer never made. The writer said only "a guy in a hoodie". It is an invented attitude, not commentary on what is there.
- **fidelity**: “I was in want of milk; and as the house could not supply it”: This adds the claim that the house had no milk, which the writer implied only loosely. The "I needed milk" beat becomes an explanation.
- **fidelity**: “upon some instrument of his own the whole while”: "Instrument" for a phone is an obscure periphrasis. It is nearly a riddle and reads as unintended comedy.
- **natural**: “the most awkward ten minutes I have passed this week”: "Awkward" as a social term is anachronistic for Austen. The line is also flatter than the original "Honestly", and "ten minutes" is the writer's own count.
- **voice**: “I paid my bill and quitted the place as fast as decency would permit”: The writer left "as fast as I could", and the "decency" qualifier shifts the meaning. It is Austen-like in vocabulary but changes the degree of haste.
- **notes**: “cites Emma, ch. 4, ¶ 28”: The move is labelled "judgement in abstract nouns", but the quoted sentence contains no abstract-noun judgement. The label does not match the example, and the citation is doubtful.
- **notes**: “Clauses balanced in one period”: The sentence quoted is the one with the "him" error, and the notes do not flag it. The cited P&P passage is not obviously apt. No sense mending is reported, so the note misses the fault.
- **notes**: “Ironic verdict: “and, upon my word, it was the most awkward ten minutes”: There is no irony in the line, as it is a sincere verdict. The cited Northanger Abbey passage is doubtful.
- **form**: “Paragraph 1 (renders the writer’s ¶1, 2):”: The rewrite merges the first two paragraphs and also the hoodie scene and the ex sighting. This changes the structure, and the note does not explain it.

### austen / email (f3 v3 s3 n2 n2)

_The rewrite keeps the basic email shape and two requests, but loses 'today', the deck, and turns Legal into 'the law', with a grammatical slip and stiff pomposity rather than real Austen irony. The notes mislabel moves (litotes, reported speech, irony) and cite doubtful sources, teaching little accurately._

- **fidelity**: “the sanction of the law”: Legal (the legal team/department) has not signed off; 'the law' makes it sound like statute or courts, shifting the meaning from an internal sign-off to legal authority.
- **fidelity**: “and not wait upon the morrow”: The writer said 'today, not tomorrow' for telling Sam; 'today' is dropped, replaced with 'at once', and the contrast is softened. Also the pointed urgency is blurred.
- **fidelity**: “any thing should go before the public”: 'Shipping' becomes 'go before the public', and 'the launch' becomes 'our undertaking'; the launch is blurred and 'the deck' is rendered as 'the matter', so 'sections of the deck' is lost.
- **fidelity**: “Let every one, therefore, have his own part of the matter ready”: The deck is dropped as a referent; 'sections of the deck' becomes 'part of the matter', and the 'therefore' adds a causal link not in the original.
- **natural**: “any of you who find himself hindered”: Grammatical disagreement ('you who find himself'); not Austen's usage, reads as a slip.
- **natural**: “It will, I trust, be understood without difficulty that our undertaking is put off”: Pompous and oddly framed for announcing a delay; the opening presumes comprehension and reads as stiff and unintended comedy rather than Austen irony. The writer's tone was a plain apology-free update.
- **voice**: “To the company, my good friends,”: Reads as a Victorian or pastiche address; 'company' is ambiguous (the firm or a social group) and Austen's letters would not open this way. The sign-off 'With every good wish, Sam.' is also thin, and the writer's 'Thanks' is lost.
- **voice**: “Let every one, therefore, have his own part”: The imperative is dry rather than Austen's characteristic narrative irony and free indirect style; the piece is mostly generic archaic business prose with little wit.
- **notes**: “Ironic verdict: “It will, I trust, be understood without difficulty””: This is not an ironic verdict; the sentence is sincere. The label mischaracterizes the change, and the cited Mansfield Park location is doubtful.
- **notes**: “Speech reported: “any of you who find himself hindered””: Nothing here is reported speech; it is a direct address and the phrase is a grammatical slip. Citing Emma for it is inapt.
- **notes**: “Understatement and litotes: “and not wait upon the morrow””: This is not litotes, merely a negative imperative; citation to Northanger Abbey is unconvincing. The 'I am unwilling that…' note likewise cites litotes where there is none, and the paragraph numbering (Paragraph 1, 4 with no notes) misaligns with the text, which has a greeting and sign-off listed as paragraphs.
- **notes**: “Clauses balanced in one period”: The sentence is one long clause pair joined by 'for'; the cited balance is not Austen-like antithesis, and the notes do not mention the changes to 'Legal' or 'the deck' or any lost content.

### austen / list (f2 v3 s3 n3 n2)

_The rewrite is readable and mildly period-flavoured, but it changes facts (the phone call becomes a sit, the leak becomes a sink that had 'given way', the cat becomes a 'companion' with 'habits and disposition') and adds a moral justification for the pride. The notes are poor: one quotes a sentence that is not in the rewrite, and others mislabel the moves._

- **fidelity**: “mended the kitchen sink, which had given way”: The writer said the sink leaked. 'Kitchen' is added, and 'given way' suggests collapse or failure, which changes the fault and is a stronger claim than a leak.
- **fidelity**: “her neighbour's little companion, of its habits and its disposition”: The cat is never named, and the rewrite adds 'little' and 'habits and disposition', so the grandmother now discusses the cat's character. The writer said only that she talked about the cat. Replacing 'cat' with 'companion' also hides the fact and the comedy.
- **fidelity**: “the work had been got through, and the day had not been thrown away”: This adds a justification the writer never gave. The writer was 'weirdly proud', which is surprised and unexplained, but the rewrite supplies reasons and loses the oddness. It also reads as a moral summary, not as commentary on what is there.
- **fidelity**: “fairly worn out, and yet not a little pleased”: 'Weirdly proud' has become ordinary pleasure. The writer's self-surprise is gone, and 'pleased' is milder than 'proud'.
- **natural**: “sat a full hour with my grandmother”: The writer 'called' her grandmother, so it was a phone call. 'Sat ... with' implies a visit, which changes the event. The Austen-era equivalent is lost, though it could have been rendered as a long conversation by letter or a call.
- **notes**: ““In the morning I had cleaned the gutters; in the afternoon I had mended the kitchen sink; and towards evening I had sat a full hour with my grandmother, while she talked.””: This note quotes a sentence that does not appear in the rewrite. It invents morning, afternoon and evening, which the rewrite does not contain, and the note does not report that.
- **notes**: “Clauses balanced in one period: “mended the kitchen sink, which had given way, and sat a full hour with my grandmother””: This is a plain list with a relative clause, not a balanced period. The move is mislabelled and is listed twice. The citations (specific chapter and paragraph numbers) are also doubtful.
- **notes**: “Ironic verdict: “the work had been got through, and the day had not been thrown away””: There is no irony here, and the sentence is earnest. The citation to Emma is dubious, and the note does not say that the rewrite adds content.
- **notes**: “Speech reported: “who had a great deal to say of her neighbour's little companion”: The note presents this as a move but does not mention that it replaces 'cat' with a euphemism and adds 'habits and disposition'. It also does not mention changing 'called' to 'sat'.
- **voice**: “By the evening I was fairly worn out”: The Austenian touches are light and sparse. There is little irony or balance, and the first-person diary voice never becomes narratorial wit. The ending reads as a Victorian moral.

### austen / paris (f3 v3 s3 n3 n2)

_The rewrite has a plausible Austenian surface, but it adds invented opinions and characterisation, softens 'embassy' to 'offices of government', and its fix for the contradiction ('only once' with 'the last time') is itself inconsistent. The notes also cite dubious sources and do not report the additions._

- **fidelity**: “where such business is done as the loss of a passport makes necessary”: The writer said 'the embassy'. The rewrite turns it into 'offices of government', which is vague and loses the specific fact. An embassy is not a government office of the host country.
- **fidelity**: “and I must own it did not appear to me the best amusement a man could propose”: This adds a new feeling for the narrator, a dislike of the embassy visits. The writer gave no such opinion. It is also oddly generalised to 'a man'.
- **fidelity**: “which, as he was never much at a loss for cheerfulness, is perhaps less a proof of the pleasure of the place than of the disposition he carried into it.”: This invents a trait of the brother (habitual cheerfulness) and a judgement on his claim. It goes beyond commentary on what is there and changes the tone of the writer's affectionate or wry ending.
- **sense**: “I have been to Paris only once in my life; and the last time I was there”: The mending creates a new contradiction. 'Only once' sits badly with 'the last time I was there', which implies more than one visit. The note claims it agrees, but it does not. A better mend would be 'I never saw Paris, only the embassy'.
- **natural**: “the rain came down the whole of the week”: 'The last time' plus 'only once' reads awkwardly and is a slight garble. 'The whole of the week' is acceptable but stiff.
- **notes**: “cites Persuasion, ch. 23, ¶ 59”: The citations (Persuasion, Emma, Mansfield Park, Lady Susan with chapter and paragraph numbers) look unverifiable or invented. Lady Susan is epistolary and its chapter numbering does not fit. The cited passages do not obviously illustrate the moves claimed.
- **notes**: “Sense: Your first sentence says you have never been to Paris”: The note says the opening 'admits one visit and no more' and calls this consistent. It does not report that the rewrite also added the narrator's opinion and the brother's character, so the notes are incomplete.
- **voice**: “I must own it did not appear to me”: The Austen-like markers are present but thin. The long clauses strung with semicolons feel like pastiche. It lacks Austen's free indirect irony in the narration of the facts themselves.

### austen / relieved (f3 v3 s4 n3 n2)

_The rewrite keeps the direction of the feelings and a plausible Regency cadence, but it mistranslates 'upset' as 'mortified', adds a maxim, and pads the confession. The notes misquote the rewrite and give shaky, possibly fabricated citations, with a wrong 'he'._

- **fidelity**: “I was not in the least mortified”: The writer said 'wasn't upset at all' and 'relieved'. 'Mortified' means humiliated, not upset, so it shifts the sense. The relief itself is never stated outright, only implied.
- **fidelity**: “seldom leaves room for regret when the thing dreaded is removed”: This adds a general maxim the writer did not make. It is the voice's commentary, but it displaces the plain admission of relief, which is the writer's actual feeling.
- **fidelity**: “It was not, in truth, a feeling I can boast of.”: The writer's 'I'm not proud of that' is already conveyed by 'so little to one's credit'. The restatement is redundant, and it also changes the referent, since the writer was not proud of the dread and the relief together.
- **voice**: “sent word that our dinner was put off”: 'Sent word' invents the means of cancelling, which the writer never specified. The rest of the paragraph is competent period pastiche, but 'dread of it the whole week' sits awkwardly between idiom and gloss.
- **natural**: “a dread so little to one's credit seldom leaves room for regret”: The sentence is clumsy: a dread leaving room for regret is a muddled thought, and the 'for' clause is overloaded. The shift from 'I' to the generalised 'one's' is also awkward.
- **voice**: “I told her it was very well”: 'It was very well' is acceptable Austen, but the whole second paragraph is a near-literal transposition with only a semicolon and 'ever shall' added, so the ironic bite is mild.
- **notes**: ““he had been dreading it the whole week” — cites Sense and Sensibility, ch. 12, ¶ 29”: The quoted phrase does not appear in the rewrite; the rewrite says 'I had been in dread of it'. 'He' is also wrong, since the narrator is first person. The cited source looks fabricated or unverifiable.
- **notes**: ““a dread so little to one's credit leaves no room for regret when the thing dreaded is removed””: The note misquotes the rewrite, which says 'seldom leaves room'. Citing Pride and Prejudice ch. 24 as the source of the move is dubious.
- **notes**: “Ironic verdict: “but I do not think we ever shall.” — cites Mansfield Park, ch. 44, ¶ 2”: The note calls it an 'ironic verdict', but the line is just the writer's plain statement. It also fails to mention that 'it was very well' mends nothing and that no sense faults were reported. The 'Speech reported' note is thin.

### eliot / breakup (f2 v3 s2 n2 n2)

_The rewrite has some Eliot-like generalizing, but it changes content (what she said, an invented self-doubt, a simile for the ice cream) and uses awkward periphrases such as 'little instrument' and 'frozen sweet'. The notes mislabel moves and give citations that look unreliable._

- **fidelity**: “the hour had come in which he would say we must speak together”: The original says he texted that they needed to talk. The rewrite turns this into a prediction about what he would say, which muddles the event.
- **fidelity**: “ate a whole pot of the frozen sweet as a child takes a spoonful of something sweet”: The ice cream is blurred into the periphrasis 'frozen sweet', and the simile adds a comparison that was not in the writer's text. It also repeats 'sweet' twice in one clause.
- **fidelity**: “I only inclined my head and said that all was well between us”: The writer said 'okay'. 'All was well between us' is a stronger claim, which changes what she said and implies a reconciliation she did not offer.
- **fidelity**: “it smarted the more because I could not say that it had any right to”: This adds a new feeling, that she doubts her hurt is justified. The writer only said 'it still hurt', and the added doubt shifts the emotion.
- **fidelity**: “bent over the little instrument in his hand as if it could keep him from the office he had come to perform”: This adds an interpretation of why he was on his phone. The 'little instrument' phrase also appears twice, which reads as repetition.
- **fidelity**: “He told me he was not ready for what was serious, and that the fault lay in him and not in me”: 'The fault lay in him' makes it blame, where the writer's 'it was him' is the standard brush-off. The result is a shift in tone.
- **natural**: “in one of those houses where coffee is sold in the crowded quarter of the town”: Coarse, awkward periphrasis. 'Downtown' becomes 'the crowded quarter', which is not what the writer said, and the whole phrase is stilted.
- **natural**: “the little instrument in my hand, I knew while I read them”: 'Instrument' for a phone is a comic periphrasis that the voice would hardly use, and it is repeated. The sentence is garbled: 'few words' is not in the original.
- **natural**: “which, by a strange deceit of civility, consoles the speaker and comforts no one”: 'Consoles' and 'comforts' are near-synonyms, so the paradox is muddled. The remark is also glib.
- **voice**: “I wished to weep, but I did not; for there is in many of us, at such a moment, a pride”: This is sound Eliot-style generalizing, but it reads as pastiche. The first-person confessional also sits oddly with Eliot's narrator, and the claim of pride is an invented motive.
- **notes**: “Analogy from science and nature: “as a child takes a spoonful of something sweet”: The label does not fit, since the analogy is a child's comfort and has no science or nature in it. The citations to specific chapters and paragraphs also look unverifiable and probably invented.
- **notes**: “cites Daniel Deronda, ch. 32, ¶ 110”: The same chapter is cited for two different moves, and the notes list no sense mendings or changes (the added claims, 'all was well', the invented guilt). They are not accurate about what changed.
- **sense**: “as we know the shape of a storm that is not yet over our heads”: The simile does not fit well with 'professions which we all of us recognize before they are made'. 'Professions' is also ambiguous.

### eliot / camp-letter (f2 v3 s2 n2 n2)

_The rewrite adds inventions and shifts feelings: a moral aside about misreading kindness, a justification for the snacks, and grudging acceptance of the counselors. The charger sentence is broken. The notes quote sentences absent from the rewrite and give dubious citations, so the voice is only a thin archaic costume._

- **fidelity**: “for we are all of us apt to mistake a little kindness for something more, and I would not flatter myself where there is nothing certain”: Adds a new reflection and a hedge. Jake only says he thinks she likes him but isn't sure. The rewrite turns that into a general claim about misreading kindness, which shifts the feeling toward self-doubt.
- **fidelity**: “for the appetite of a growing boy is not to be satisfied at the set hours”: Invents a justification for the snack request that Jake never gave. 'More snacks' becomes 'more to eat between meals', and the rewrite also implies the food is inadequate in quantity, not only gross.
- **fidelity**: “and since they have the charge of us, I cannot call them anything worse”: Adds a new moral stance. Jake's 'kind of strict but mostly fine' becomes a grudging concession, which softens and changes the feeling.
- **fidelity**: “my boat turned over with me in it while all the others stood about and laughed”: Jake says he flipped the canoe and everybody laughed. The rewrite adds that the others 'stood about', which is an invented image. It also says 'my boat', where the original had 'the canoe' as a shared activity.
- **fidelity**: “the most awkward thing that ever befell me, for I wished myself anywhere else”: 'So embarrassing' is intensified into a superlative of 'ever befell me', and 'I wished myself anywhere else' is added. 'Awkward' also weakens the sense of embarrassment.
- **fidelity**: “the friend who shares my quarters”: 'Bunkmate' becomes a 'friend', which the original does not say, and the gripe about snoring is softened. 'Snores like crazy' is reduced to 'breathes in his sleep with a noise'. The added 'made my first nights wakeful' is invented, and 'first nights' is a new time frame.
- **natural**: “and the thing I plug into the wall to charge my telephone, which I entirely forgot to bring with me”: The request has no verb. 'Can you send me more to eat... and the thing I plug into the wall' is broken syntax. The periphrasis for 'charger' reads as a riddle and as comedy, and a telephone charger sits oddly in this idiom.
- **natural**: “the food is such as one must learn to bear”: Changes 'gross' to a stoic 'one must learn to bear' and moves into a generic 'one', which is stiff and out of character for a letter from a boy.
- **notes**: “my boat turning under me while all the others stood about and laughed, and I wished myself anywhere else”: The note quotes a sentence that does not appear in the rewrite, which has 'turned over with me in it'. The notes do not match the delivered text.
- **notes**: “It is a strange thing how a boy's dignity, which is dearer to him than his comfort, may be overset in a moment”: The note cites an 'ironic verdict' sentence that is absent from the rewrite. This misreports a change. The cited chapters and paragraph numbers also look unverifiable or arbitrary.
- **notes**: “the appetite of a growing boy is not to be satisfied at the set hours" — cites Silas Marner, ch. 19, ¶ 40”: Silas Marner has no chapter 19 in the usual numbering, so the citation is dubious. The note also does not flag that the clause is an addition, nor the telephone-charger mangling.
- **voice**: “Camp is all right, I suppose”: The voice is only partly Eliot. It uses a generic 'old-fashioned' register of 'such as', 'befell' and 'is not to be', with little of Eliot's narratorial irony or sympathetic generalization. It also keeps the modern letter frame and the 'P.S.' unchanged.

### eliot / job-interview (f2 v3 s3 n2 n2)

_The rewrite has a Victorian cadence, but it invents imagery and feelings (chairs knowing, courage gathered, a sceptical view of the sister's reassurance) and recasts the sister's comfort as faint praise. Several periphrases are awkward or comic, and the notes' pinpoint citations are doubtful and do not report the additions._

- **fidelity**: “a stranger entering it felt his own plain clothing to be a kind of trespass”: The writer's first person 'I felt totally out of place' becomes a generalised third-person stranger. The sentence is then repeated in the first person, which muddles it.
- **fidelity**: “as if the very chairs and tables knew that I had brought with me neither loose garment nor costly cup to offer them”: This invents an image and an incident of the narrator bringing nothing. The original has no such conceit.
- **fidelity**: “so that I gathered courage”: The narrator's gathering courage is added. The original gives no such feeling.
- **fidelity**: “made a plain answer seem a thing to be weighed and reweighed before it was spoken”: This adds the narrator's reaction to Priya's intensity. The original only says she was intense.
- **fidelity**: “with the look of one who had heard such answers before, and was not the less content with them for that”: This is invented characterisation. The original says only 'She smiled anyway.' It also changes the sense of the smile.
- **fidelity**: “a prophecy in which I could read no more than that I had not openly disgraced myself”: The sister's reassurance is turned into the narrator's sceptical judgement. This reverses the feeling; the writer treats it as comfort and hopes she is right.
- **fidelity**: “told her the whole as well as I could”: This is an added action; the writer never says the narrator recounted the interview.
- **fidelity**: “I said I was a perfectionist, which is a lame answer.”: 'I was one of those persons who can never leave a thing half done' paraphrases 'perfectionist' and softens the bluntness. 'weaker than I had meant it to be' also softens 'lame'.
- **natural**: “I, in my suit, which had seemed very well at home, felt myself to be quite out of the place”: 'Seemed very well at home' is muddled and clashes with 'out of place'. 'Out of the place' is awkward.
- **natural**: “loose garments of the sort worn by persons at ease in the morning”: This periphrasis for hoodies suggests dressing gowns, so it reads as unintended comedy.
- **natural**: “We are all of us aware how such surroundings act upon a mind already doubtful of its claims”: The narrator's 'we' sits oddly beside the first-person 'I' mid-sentence, and the generalisation is stiff.
- **voice**: “the truth must be owned that I am in real need of this job”: The phrase is a pastiche tic, and the tense shifts from past to present without grounding.
- **sense**: “she said that I had probably succeeded in getting the job”: The original says the sister told her she 'probably nailed it'. Equating this with getting the job subtly alters the claim, and the narrator then undercuts it.
- **notes**: “cites Middlemarch, ch. 45, ¶ 33”: The notes quote the rewrite's own sentences as the 'move' and attach precise chapter and paragraph citations. These cannot be verified and look fabricated. They also do not name what changed from the original.
- **notes**: “Litotes: “a prophecy in which I could read no more than that I had not openly disgraced myself.””: The same sentence is listed twice as two moves. The notes never flag that this adds a sceptical feeling absent from the original.
- **notes**: “The inner life, from inside”: The notes do not mention the added invented content, such as the chairs and tables, so they misrepresent the extent of the changes.

### eliot / neighbors (f2 v3 s3 n3 n2)

_The rewrite catches the mom/divorce contradiction and mends it by making the woman a sister, but it invents a housekeeper role, muddles the narrator's gender and the matchmaking logic, and softens the exasperation into indulgence. The Eliot voice is only partly achieved, and the notes are thin, with doubtful citations._

- **fidelity**: “his sister, who kept the house”: The mending invents a specific relation (sister) and a role (housekeeper) that the draft never gave. The 'mom' is changed into a sister. Mending was warranted, but the invented detail goes beyond the least change, and 'kept the house' adds a fact.
- **fidelity**: “a woman whose kindness and curiosity were so mixed in her that she could not have told them apart, and whose mind was already turning the newcomer into a husband for me”: This is added commentary beyond the voice's remark. It also moves the matchmaking reveal ahead of the draft's order, undercutting the later 'My mother got this look' beat.
- **fidelity**: “to marry me to some good woman, and here was a man set free again”: The narrator's gender is changed or left confused: the draft says the mother is trying to set the narrator up, and 'marry me to some good woman' implies a male narrator marrying a woman, which makes the match with the divorced father nonsensical. This is an invented and contradictory change.
- **fidelity**: “though, to be sure, it is no very dreadful purpose, and a mother may be forgiven a little scheming of that sort”: The narrator's weary exasperation ('trying to set me up for years') is softened into indulgent forgiveness, so the feeling no longer points the same way.
- **fidelity**: “with a great wagon of their goods”: 'Huge truck' becomes a wagon, and 'biscuits' stands in for cookies. These are period substitutions, not strictly faithful. The 'last weekend' timing becomes 'within the last week'.
- **sense**: “marry me to some good woman, and here was a man set free again”: The mending of the mom/divorce contradiction is itself followed by a new fault, since the sense of the match falls apart. The mother's thought about the single man and the narrator no longer agrees.
- **natural**: “and which told me, without a syllable, what was working within”: Awkward and vague; 'working within' is clumsy. The long sentences also pile up clauses, and 'it is a hard thing to stop a mother' reads like filler.
- **voice**: “A new family came to the house next door within the last week”: The first-person narrator is not Eliot's usual omniscient manner, and the 'we are all of us' generalisation is rather generic. The commentary is thinner than Eliot's, which has more specific imagery, irony and moral reflection.
- **notes**: “The passage lightly echoes the small-town talk deciding a person's fate in Middlemarch's gossip”: This is vague and unsourced, with no chapter citation, and it is filed as a [sense] note though it describes no sense fix. It mentions no actual changes in the text.
- **notes**: “cites Daniel Deronda, ch. 32, ¶ 110”: The citations are bare and likely unverifiable or fabricated. They do not show the move's source in a way that teaches, and 'Moral nouns' is misapplied to a sentence that has no moral nouns.
- **notes**: “The woman of sentence 4 is not the father's wife.”: The note asserts the sister reading as fact rather than flagging it as a guess the writer should check. It also fails to report the added matchmaking commentary.

### eliot / party (f2 v3 s2 n2 n2)

_The rewrite has a Victorian surface, but it adds a lot of invented material (mothers, instruction, warm and cold currents, moral maxims) and firms up the narrator's opinions beyond what the writer said. The notes give suspiciously exact citations and do not disclose the additions._

- **fidelity**: “had left it for this one evening to the young people of the school, who had the run of every room”: The writer only said the parents were out of town. The rewrite adds that the parents deliberately left the house to the young people, and that the guests had the run of every room.
- **fidelity**: “which was of a sort that no mother present would have willingly allowed”: This is an invented judgment about mothers and the music. The writer only said it was super loud.
- **fidelity**: “as if a party at which one knows nobody were among the most instructive of schools”: The writer never said the party was instructive, and this is an invented moral. The ironic aside is not tied to anything in the draft and muddles the plain statement that they didn't know many people.
- **fidelity**: “I felt, without being able to say why, a small vexation at the words, as something warm in me had suddenly met a cold current”: The writer only said Emma rolled her eyes and the narrator thought him rude. The rewrite invents a vexation and an inner warmth that the narrator never mentions.
- **fidelity**: “and the guests of a house ought not to speak ill of the feast they are sharing”: This adds a moral lecture that goes beyond the writer's 'I thought he was rude'. It turns the narrator's impression into a general rule.
- **fidelity**: “as indeed he was”: The narrator only thought him rude, and the draft ends in doubt ("Maybe I was wrong"). This asserts that he really was rude, which makes the narrator's earlier opinion firmer than the writer's.
- **fidelity**: “with a willingness that no one had asked of him”: This is invented. The writer did not say nobody asked him to help, and 'glasses' is also an invented detail.
- **fidelity**: “since we so often judge a man wrongly by the first hour of his company”: This turns the writer's tentative 'Maybe I was wrong about him' into a general maxim and more settled certainty. It also loses the tentativeness.
- **fidelity**: “when the rest were gone, I saw him helping to clear away”: The writer said he helped 'when everyone else left', so the sense is that the others had gone while he stayed. This is roughly kept, but 'afterwards' loses the contrast that he stayed after everyone else left.
- **natural**: “being from home on affairs of their own”: This is awkward and odd. It adds an invented reason (affairs of their own) and does not read idiomatically.
- **natural**: “and his name was Chris”: This is flat and tacked on with a semicolon. 'Chris' is jarring in a Victorian register, and the clause sits oddly after the long sentence about his ease.
- **natural**: “and we are all of us a little chilled where the faces are strange”: The sudden tense shift into a general present, and the 'as if' clause that follows, break the sentence and read as a pasted maxim.
- **voice**: “set the very air beating against one's ears”: This is a generic Victorian-flavored flourish. Eliot's actual manner is more analytic and ironic, with fewer decorative images.
- **notes**: “cites Middlemarch, ch. 15, ¶ 3”: The notes give precise chapter and paragraph citations that cannot be verified and look fabricated. Many of the cited passages do not seem to match the moves (for instance Romola for 'inner life' and a room-warmth analogy).
- **notes**: “[move] The narrator’s “we””: The notes do not report that new content was added (the mothers, the instructive school, the moral of courtesy, the maxim about judging). They label additions as 'moves' without admitting that they change the meaning.
- **sense**: “Emma rolled her eyes at this, and I thought him rude—as indeed he was”: The rewrite introduces a conflict between the narrator's closing doubt and this firm verdict, a slight inconsistency that the notes do not report.

### eliot / store (f2 v3 s3 n3 n2)

_The rewrite has a period flavor, but it adds invented feelings, durations and moralizing, and it leaves modern slang in the dialogue. The notes mislabel moves, quote text that differs from the rewrite, and cite questionable sources, so it teaches little reliably._

- **fidelity**: “a useful reminder, did we but read it so, that the world is not arranged for our convenience”: This moralizing commentary is an invented addition beyond the writer's content. It may count as the voice's commentary, but it adds a thesis the writer did not hold and the passage does not sustain.
- **fidelity**: “It was only after some further minutes that he moved aside”: The original says only 'Finally'. The 'further minutes' is an invented duration, and 'slow unwillingness of one disturbed in a serious matter' invents the man's attitude.
- **fidelity**: “I saw her whom I had once known and loved”: The original says only 'my ex'. 'Loved' is added emotional content, and the plain panic is recast as a heavier feeling.
- **fidelity**: “carrying my small burden out into the air as one who has long been held in a crowded room”: This is an invented image and gesture, and the 'long held' suggests a longer ordeal than the writer gave.
- **fidelity**: “looking up with a steady cheerfulness”: This adds a demeanor and an action for the ex that the original lacks. 'Steady cheerfulness' is also at odds with the awkwardness the writer describes.
- **fidelity**: “and I went away wondering at the strange power which a chance meeting has to disorder the whole current of one's thoughts”: This adds a reflective conclusion the writer did not make. It reframes the 'most awkward ten minutes' as a meditation.
- **fidelity**: “as gently as the thing could be said”: This is an added detail; the original says only 'I said excuse me'.
- **natural**: “A man in a coarse woollen garment drawn over his head”: This is an awkward periphrasis for 'hoodie' that sounds contrived, and 'woollen' is invented. The 'instrument he held to his ear' for the phone is comic in a way the voice would not intend, and so is 'unseen hearer'.
- **natural**: “It was crowded beyond what the place, in any reasonable expectation, could be thought to hold.”: This is wordy to the point of muddle, and it is not quite Eliot's cadence.
- **natural**: “Hey," she said, looking up with a steady cheerfulness. "Long time no see.”: The modern slang 'Hey' and 'Long time no see' is left in the quoted speech, which is jarring against the Victorian narration. 'Thanks' is likewise left bare.
- **voice**: “and having been made sensible, as we all of us are at such moments, that the want would not satisfy itself”: This is a heavy and faintly mock-heroic opening for a trivial need. The 'we' generalization is imposed, and the voice is closer to pastiche than to Eliot's grounded irony.
- **notes**: “Analogy from science and nature: “a man in a coarse woollen garment drawn over his head””: The label does not match the quoted text, which is a periphrasis for 'hoodie' and no scientific or natural analogy. The cited source is dubious.
- **notes**: “I was seized with a dread that had in it more of blind fright than of reason”: This quote does not match the rewrite's wording ('a dread seized me…'). The notes also cite precise chapter and paragraph numbers that look fabricated.
- **notes**: “Paragraph 3:
  (no notes)”: The paragraph has changes (added 'steady cheerfulness', 'well' for 'great') that go unreported. The notes also do not flag the additions of 'loved' or the fabricated durations.
- **fidelity**: “You look well.”: 'Great' is weakened to 'well', which slightly changes the compliment's degree.

### eliot / email (f2 v3 s3 n2 n2)

_The rewrite keeps the email shape and both requests, but it adds an invented 'confession' clause and a rationale about time, heightens the tone, and uses stilted archaic phrasing ('company of our undertaking', 'leaves of the deck'). The notes mislabel several moves and report none of the additions._

- **fidelity**: “which is but a man's way of confessing that he would sooner put off a thing than send it out unfinished and hope for the best.”: Invented clause adding a new self-characterising confession and sentiment not in the original. It goes beyond commenting on what is there and reads as a new claim about the writer's motives.
- **fidelity**: “the work we had set for Tuesday”: The writer said the launch moves. Rendering it as 'the work' blurs a key fact (the launch) and loses its specificity.
- **fidelity**: “when the time for mending will be gone from us”: Adds a rationale (no time left to fix things) that the original lacks. The writer only said to tell today, not tomorrow, and the added consequence changes the urgency.
- **fidelity**: “I will not have it go forth from us without their mark upon it”: The writer's mild 'I don't want us shipping without it' becomes a stern 'I will not have it'. The degree of feeling is raised.
- **natural**: “To the company of our undertaking, greeting:”: An odd, archaic opening that reads like a letter from a guild, not Eliot. 'Company of our undertaking' is a riddle-like phrase.
- **natural**: “There is small change to tell of”: 'Small change' suggests coins or a trivial matter, and it undersells a launch delay. It is unclear and slightly comic. The 'few words' clause is also awkward.
- **natural**: “bring his part of the leaves of the deck to its ending”: 'Leaves of the deck' is clumsy and the stacked 'of' phrases garble the meaning. 'Deck' stays modern in an archaic frame.
- **voice**: “I entreat”: Too biblical or pleading for Eliot's urbane narrator, and out of proportion to a routine request. The whole piece is archaic pastiche (shall, entreat, greeting) rather than Eliot's reflective, ironic, sympathetic narration.
- **notes**: “Litotes: “There is small change to tell of, and you shall have it in few words””: This is not litotes, which is understatement by negating the contrary. The label is inaccurate.
- **notes**: “Moral nouns: “and I will not have it go forth from us without their mark upon it””: The quoted sentence contains no moral nouns, so the label is wrong. The passage is also not the one that would carry the move.
- **notes**: “The narrator’s “we”: “and not wait for the morrow, when the time for mending will be gone from us””: There is no narratorial 'we' here, only 'from us'. The note mislabels the move, and the notes ignore the substantial added clause about the man's confession.
- **notes**: “Paragraph 4:
  (no notes)”: The notes list phantom paragraphs (1 and 4) and number the paragraphs inconsistently with the rewrite, which has only three. None of the notes flags the additions, so the writer is not told what was added.

### eliot / list (f3 v3 s3 n3 n3)

_The rewrite keeps all three tasks and the pride. But 'called upon' misstates a phone call, 'porous' alters the sink's fault, and an invented reluctance to confess the pride is added. The voice is only partly Eliot, and the notes over-cite one sentence while leaving paragraph 1 unannotated._

- **fidelity**: “I made good the sink which had grown porous”: The original said the sink was leaky and that the writer fixed it. 'Porous' changes the nature of the fault, since a leaky sink is not a porous one, and 'made good' is vaguer than 'fixed'.
- **fidelity**: “which I could call by no humbler name than pride”: The original has 'weirdly proud', a light, self-amused feeling. Here the pride is made weighty and moralised ('duty by the day'), which shifts its degree and its tone.
- **fidelity**: “We are all of us apt enough to entertain such pride over work that is done and done alone, and I should hardly have confessed it to a friend.”: This adds claims the writer never made: that the work was done alone, and that the writer would not confess the pride to a friend. The 'we' commentary is allowed, but the confession is a new fact about the writer's behaviour.
- **fidelity**: “in which small labours find their reward in being finished”: This is an added generalisation. It is mild commentary, but it pre-empts the pride that the writer reaches only in the evening.
- **fidelity**: “kept me an hour and more”: The original says she talked for an hour. 'An hour and more' exaggerates slightly. 'Kept me' also makes the writer's captivity explicit, which the original does not say.
- **natural**: “I called upon my grandmother”: 'Called upon' means a visit in person, whereas the original is a telephone call. The idiom gives the wrong sense and makes it seem the writer went to her house.
- **voice**: “I cleaned the gutters, I made good the sink”: The anaphoric 'I... I...' is choppy for Eliot's periodic, subordinated syntax. The first paragraph is a plain list with little of her ironic narratorial stance.
- **notes**: “cites Middlemarch, ch. 37, ¶ 65”: Three of the four notes mark the same sentence as separate moves, which is padding. The citations are precise-looking but not clearly apt, and they pile onto one sentence.
- **notes**: “Paragraph 1:
  (no notes)”: Paragraph 1 was substantially changed (added generalisation, 'porous', 'called upon'), yet no changes are reported.

### eliot / paris (f2 v3 s4 n3 n2)

_The rewrite catches and reports the contradiction, but it invents extra content (vivid memory, strangers, weary waiting, a moral about temper), and the 'only once' mend clashes with 'the last time'. The voice is partial, a few phrases are clumsy, and the notes mislabel moves and falsely claim every detail was kept intact._

- **fidelity**: “and my memory of it is more vivid than the memory of many places where I have spent pleasant days”: Invented claim about the vividness of the memory; not in the original and unconnected to the writer's content. It is an addition beyond voice commentary.
- **fidelity**: “among strangers and the slow business of papers, in that manner of waiting which makes a foreign city seem to us only a weary room in which we sit”: Adds new details (strangers, slow paperwork, waiting) and a new feeling of weariness that the writer did not state. The writer's tone is dry and wry, not weary.
- **fidelity**: “so little do our pleasures depend on the weather or the luck of the hour, and so much on the temper with which we meet them”: Adds a moral generalisation that goes beyond commentary on the facts and reinterprets the writer's deadpan irony as a sermon on temper. It is arguably more than commentary.
- **fidelity**: “I have been to Paris only once”: The mending asserts it was once only; the writer said 'the last time', which implies more than one visit. This introduces a new fact and makes it less faithful. The mend also loses the writer's possible joke.
- **voice**: “and on the second day my brother lost his passport”: The plain, brisk statement is merged into one long sentence, losing the writer's two-beat comic timing; Eliot's irony is present but the passage is overstuffed with semicolons and clauses, giving a pastiche feel.
- **natural**: “he keeps to this day to saying that it was the pleasantest holiday”: 'keeps to … to saying' is clumsy and awkward, a doubled 'to'.
- **natural**: “in that manner of waiting which makes a foreign city seem to us only a weary room in which we sit”: Muddled image: a city seeming a room in which we sit is strained, and 'that manner of waiting' is vague.
- **notes**: “Analogy from science and nature: “in that manner of waiting which makes a foreign city seem to us only a weary room in which we sit””: Mislabelled: the phrase is not an analogy from science or nature, and so the move name does not fit the change.
- **notes**: “Moral nouns: “so little do our pleasures depend on the weather or the luck of the hour””: The phrase does not clearly use moral nouns; the same quote is also double-counted under another move, and the citations (specific chapters and paragraphs) look unreliable or unverifiable.
- **notes**: “This removes the contradiction while keeping every other detail intact.”: Claim is false: the rewrite added several details (strangers, papers, weariness, vividness of memory, moral) and the notes do not report these additions. The notes also do not mention that the 'last time' implies earlier visits, which the mend contradicts.
- **sense**: “I have been to Paris only once”: The mend is workable, but it conflicts with 'the last time I was there', which implies multiple visits; a better mend would keep the plural or join the two statements.

### eliot / relieved (f3 v3 s4 n3 n2)

_The relief, dread and doubt all point the right way, but "set off" misrenders "cancelled", and the added moralizing and burden simile go beyond the original. The voice is a Victorian costume more than Eliot, and the notes are mislabeled and padded with dubious citations._

- **natural**: “When Dana set off our dinner”: "Set off" does not mean cancel. It reads as a malapropism, since "set off" suggests departing or igniting. "Put off" would mean postponing, which is also not cancelling.
- **fidelity**: “for we are all of us apt to shrink from what we have undertaken, and to call our shrinking by gentler names.”: This adds a new claim and a generalization about self-deception that the writer did not make. It goes beyond voice commentary and imputes euphemism to the writer. The writer's "I'm not proud of that" is plain.
- **fidelity**: “relieved as one is when a burden that has been carried in silence is at last lifted and laid down.”: The simile adds the idea of a burden carried in silence, which the writer never said. It also over-intensifies the relief.
- **fidelity**: “I was not, I think, in any distress at all.”: The writer says "wasn't upset at all" flatly. The hedge "I think" softens the certainty, and "distress" is heavier than "upset".
- **fidelity**: “Only I do not think we ever shall.”: "Ever" is slightly stronger than the writer's "I don't think we will". "Only" adds a rueful contrast. "Quite well" for "fine" is also a slight shift.
- **voice**: “all the week long”: This is a folksy phrase and not characteristic of Eliot's narrative register. The overall effect is generic Victorian pastiche rather than Eliot's analytic, ironic, sympathetic narration. There is also no real Eliot-style syntactic subordination.
- **notes**: “Analogy from science and nature: “relieved as one is when a burden that has been carried in silence is at last lifted and laid down.””: The label is wrong. A burden lifted is neither science nor nature. The citation to Romola looks arbitrary.
- **notes**: “The qualified period: “When Dana set off our dinner, I was not, I think, in any distress at all.” — cites The Mill on the Floss, ch. 17, ¶ 46”: The same sentence is cited twice for two different moves, with two different sources (ch. 17 and ch. 16). The move names are vague and the paragraph citations look unverifiable. Nothing flags the added generalization as an addition. Paragraph 2 gets no notes even though it was changed ("So", "Only").
- **notes**: “The inner life, from inside: “I had been dreading the evening all the week long, and I am not proud of that.””: This is a near-verbatim restatement of the writer's own sentence, so it names no real change. The note does not teach anything.

### fairy / breakup (f2 v3 s2 n2 n2)

_The rewrite reads as stiff archaic word-swapping with a dangling "of it" that turns ice cream into rain, plus an invented comfort claim. The notes misquote the text and cite sources dubiously, so it teaches little._

- **sense**: “and ate a whole pint of it—which, if it was little comfort, was comfort of a kind.”: "of it" has no antecedent, since ice cream is never named; the rain is the nearest noun, so it reads as eating a pint of rain. The writer's ice cream is lost.
- **fidelity**: “which, if it was little comfort, was comfort of a kind”: Adds a new evaluative claim, that the ice cream gave some comfort. The writer never says this. It is more than the voice's commentary on what is there and softens the hurt.
- **fidelity**: “and he was there before me, looking at his little screen and moving his thumb across it”: "Scrolling on his phone" is turned into a vague periphrasis. "Moving his thumb" is added detail, and "little screen" is a coy circumlocution.
- **fidelity**: “and when I had sat down he said”: Adds the narrator sitting down, an event not in the original. It also makes the nervous look and the statement run together.
- **fidelity**: “My friend who shares my room with me”: "Roommate" becomes a clumsy periphrasis, and "friend" adds a relationship the writer did not state.
- **natural**: “a house in the town where they sell coffee”: Reads as a riddle rather than fairy-book diction. It also drops "downtown" and the coffee shop as a shop.
- **natural**: “sent me word at midnight that we must have some talk together”: Awkward. "Texted" and "We needed to talk" lose the natural idiom, and "some talk together" is not idiomatic even for archaic prose.
- **voice**: “I wanted to cry, but I did not; I only nodded and said, All right.”: Fairy-book prose rarely uses this semicolon-and-unquoted-speech pattern, and the whole piece stays in first-person modern emotional reportage. The voice is mostly archaic word swaps, not real Lang cadence.
- **notes**: “and ate a whole measure of it, which, if it was little comfort, was comfort of a kind”: The quoted note text does not match the rewrite, which says "pint", not "measure", and has a dash, not "which" directly. The note misreports the text.
- **notes**: “Antithesis: “I wanted to cry, but I did not.” — cites The Red Fairy Book, “Soria Moria Castle”, ¶ 25”: The citations are paragraph-specific and seem implausible for such generic moves. "And so, and then" is given for a sentence with neither, and the notes never flag the vague "of it" or the added comfort claim.
- **fidelity**: “thought I made too much of it, and maybe I did; but it hurt me all the same.”: "Overreacting" is rendered acceptably, but "it still hurt" becomes "all the same", which shifts the nuance slightly. Minor.

### fairy / camp-letter (f3 v3 s3 n2 n2)

_The rewrite is readable and mostly keeps the facts, but it adds a moral, softens some feelings, turns 'phone charger' into a riddle, and gets only a thin Fairy Book flavour. The notes cite doubtful sources and leave the largest changes unexplained._

- **fidelity**: “and that is what comes of going on the water”: Adds a moral/verdict not in the original; Jake does not blame the water or generalise. It is more than commentary and shifts the tone from embarrassment to a lesson.
- **fidelity**: “a charger for the instrument by which I speak with you”: The phone is turned into a circumlocution; it is a riddle-like obscuring of 'phone charger'. It also drops the sense that this is the writer's own phone, and the charger is an unnatural way to keep the fact.
- **fidelity**: “I flipped the canoe”: Rewrite says 'my canoe turned over', removing Jake's agency, and 'went out in the canoes' blurs 'we went canoeing'. Minor shift of meaning.
- **fidelity**: “she is very pleasant”: Original 'really cool' is a stronger, admiring feeling; 'pleasant' weakens the degree of his admiration.
- **fidelity**: “the friend who sleeps in my room”: A 'bunkmate' becomes a 'friend', adding a relationship not stated. Also 'my room' clashes with the P.S. 'my room' at home, creating confusion between camp and home.
- **fidelity**: “On the whole they are kind.”: 'Mostly fine' becomes 'kind', raising the warmth of the feeling beyond the original.
- **fidelity**: “Camp is all right, I suppose, but the food is very bad”: Merges the two sentences and drops 'gross'; 'but' adds a contrast not in the original. 'Snores like crazy' becomes 'very loudly', flattening it.
- **natural**: “talk about many things”: 'Stuff' is rendered vaguely; fine, but 'hang out' becomes 'sit', losing the activity. The sentence reads stiffly.
- **voice**: “I was greatly ashamed”: Fairy Books diction is more plain narration with 'whereupon', 'at once', and 'said'; the first-person letter register with 'I suppose' and 'somewhat' is closer to generic Victorian than Lang's tale-telling. Little real fairy-tale cadence or marked vocabulary.
- **notes**: “cites The Olive Fairy Book, “The Billy Goat And The King”, ¶ 27”: The cited sources are dubious and unverifiable; 'The Golden Branch' and 'The Fairy Of The Dawn' do not obviously support the moves claimed (e.g., 'People by their place'). The citations seem to be fabricated attributions.
- **notes**: “(no notes)”: Notes skip the major changes: the phone circumlocution, 'all right, I suppose', the P.S., and the added moral. The numbering by paragraph also does not match the letter's structure, since it lists six paragraphs for a letter with fewer.
- **notes**: “People by their place: “the friend who sleeps in my room snores very loudly””: The note presents 'friend' as a move, but the change is a fidelity departure and not reported as such.

### fairy / job-interview (f2 v3 s2 n2 n2)

_The rewrite adds content (idle staff, an elaborated definition of perfectionism), inflates 'probably' to 'surely,' and has some garbled phrasing. The notes misquote the rewrite and make dubious source citations, and the voice is generic archaic pastiche rather than the plain Fairy Book narration._

- **fidelity**: “but not one of them seemed to be working”: Invented claim. The writer never said anyone was idle. This adds a new negative judgment about the staff.
- **fidelity**: “I told her I was the sort of person who does all things too well and too long for fear they should be done ill”: The writer said only 'I was a perfectionist.' The rewrite adds an elaborate explanation of what perfectionism means, with new content.
- **fidelity**: “super modern”: 'Super modern' is rendered as 'very new,' which loses the sense of contemporary style. Hoodies become 'a hooded coat in place of a good coat,' an added contrast that is not in the original.
- **fidelity**: “which was a poor thing to say”: The writer called the answer a lame answer, meaning cliché. 'A poor thing to say' is a bit different, but it is acceptable. The bigger issue is the following 'Yet she smiled at me for all that,' which is fine.
- **fidelity**: “I have no money”: 'Basically broke' is flattened to an absolute 'no money.' The writer's hedge is lost.
- **fidelity**: “she said I had surely got what I went for”: 'Probably nailed it' becomes 'surely.' This raises the certainty and shifts the degree of the sister's confidence.
- **natural**: “every soul in it wore a hooded coat in place of a good coat”: Awkward and unclear. 'Hooded coat' for a hoodie, and a 'good coat' contrast, read as a riddle.
- **natural**: “She asked me what good was in me and what weakness”: Garbled phrasing. 'What good was in me' is not idiomatic for asking about strengths.
- **natural**: “I called my sister”: 'Called' on the telephone is an anachronism in a fairy-book register, and the rewrite did nothing to render it, which breaks the voice.
- **voice**: “The office into which I was shown”: The first-person modern interview narrative is rendered in a stiff, generic archaic style. The Fairy Books' plain, brisk narration ('Once upon a time') is not captured. The voice leans on semicolons and 'for all that' pastiche.
- **notes**: “Ironic verdict: “and every soul in it drank fine coffee, but not one of them seemed to be working.””: The quote does not match the rewrite text. It omits 'wore a hooded coat... and.' The move justifies an invented addition rather than reporting it.
- **notes**: “too well and too long; which was a poor thing to say.”: The quote is again altered from the rewrite, which has 'for fear they should be done ill.' The notes do not report the added elaboration of perfectionism.
- **notes**: “I stand in great need of it”: Misquotes the rewrite, which says 'of this place.' The 'Antithesis' label does not fit that sentence. The citations to specific tales and paragraph numbers look unsupportable for such modern content.
- **sense**: “hooded coat in place of a good coat”: The rewrite adds a muddled contrast and no note explains it. Modern items like 'hoodies' and 'fancy coffee' are not clearly conveyed, which hurts clarity.

### fairy / neighbors (f3 v3 s2 n3 n2)

_The rewrite spots the mom/divorced contradiction but mends it badly. 'The woman' is left unexplained, and the added 'alone in the world' contradicts her, along with other softening additions. The Fairy Book flavour is thin, and several notes cite moves the text does not contain or misquote it._

- **fidelity**: “but this was by her manner and not by any unkindness”: The writer called the mom 'kind of standoffish'. This clause adds a defence of her character and softens the feeling. The writer's mild disapproval is turned into reassurance.
- **fidelity**: “and that he and the children were alone in the world”: This invents a claim the writer never made. It also contradicts the woman who still lives in the household and the 'great cart' that carried the whole family.
- **sense**: “the woman held herself apart and spoke little”: The mending is incomplete. Calling her 'the woman' never says who she is (sister, nanny, mother-in-law?), so the reader is left with an unexplained person. The note claims the later 'divorced' line makes this clear, but it does not.
- **sense**: “he and the children were alone in the world, his wife having parted from him”: This undoes the mending. If the father and children are 'alone', the woman has no place in the household, and the rewrite now has its own contradiction.
- **fidelity**: “I saw at once that she meant to set me before this lawyer”: The writer's 'I knew exactly what she was thinking' and 'set me up' are changed to 'find me a husband' and 'set me before'. This adds marriage as the aim and loses the dry weariness of 'for years'.
- **voice**: “Once upon a time a new family came to live in the house next door”: A fairy-tale opening is stuck on a first-person, modern-domestic anecdote ('my mother', 'this lawyer'). The Fairy Books are third-person narration, so the register reads as costume. The 'great cart' for the truck and 'church' also sit awkwardly together.
- **natural**: “he had no wife”: The writer's wry 'Well, divorced' correction is flattened into two plain clauses. The sentence 'So it came out that... and that... and that...' is clumsy and over-padded.
- **notes**: ““where they came from, what they did for their bread, and whether they went to church””: The quoted source line says 'for their bread', but the rewrite says 'for their work'. The quote does not match what was actually produced.
- **notes**: “Ironic verdict: “for they had but one mother between them...”: The rewrite contains no ironic verdict, so this cited move names a change that was not made.
- **notes**: “Periphrasis: “a look upon her face that I knew well””: This is a plain rewording, not a periphrasis. The label is inaccurate and teaches little.
- **notes**: “I made her 'the woman' rather than 'the mom'”: The notes do not report the added 'alone in the world' or 'not by any unkindness'. These are the changes that matter most, and they are not disclosed.

### fairy / party (f3 v3 s3 n3 n2)

_The rewrite keeps the facts and has a pleasant fairy-tale opening, but it shifts "arrogant" and "funny" to "proud" and "merry", adds a narrated "said to myself", and uses a first-person frame that Lang's tales lack. The notes are weak: one cites a quotation that does not appear in the rewrite, and others mislabel plain phrases as moves._

- **fidelity**: “he was proud, but he was also merry”: "Arrogant" becomes "proud", which is milder and partly positive. "Funny" becomes "merry", which means cheerful rather than witty. The writer's ambivalence is slightly shifted.
- **fidelity**: “I stood in the kitchen with my friend Emma, and we knew few of the people.”: "We didn't know many people" is kept, but the "kitchen" detail and the paragraph break are handled loosely. The point is minor, since the facts survive.
- **fidelity**: “the music was very loud”: "Super loud" is flattened to "very loud", and the emphasis is lost. The notes also call this a periphrasis, though it is a plain rendering.
- **fidelity**: “all the school was there”: "Everyone from school" is kept, but "all the school" is slightly odd, and the "out of town" phrasing is changed to "away from town".
- **fidelity**: “then I said to myself that perhaps I had been wrong about him”: This adds a narrated inner speech act that the writer did not have. The writer's "Maybe I was wrong" is a fleeting thought, so the shift is small but real.
- **voice**: “and her parents were away from town, and all the school was there and the music was very loud”: A run of "and" clauses is a plausible Lang move. But the first-person narrator with "I said to myself" is not how the Fairy Books narrate. They are third-person tales, so the rewrite sounds like a costume more than the real texts.
- **voice**: “the people dull folk”: The phrasing is slightly stilted and does not read as idiomatic Lang. "Called the party a poor one" is also awkward.
- **natural**: “he was proud, but he was also merry”: The semicolon-and-antithesis construction is clumsy. "Merry" does not suit a sarcastic, rude guy who calls the party lame.
- **natural**: “set the house in order when all the rest had gone away”: It is fine as pastiche but wordy. "Helping to set the house in order" is a little too tidy for "clean up".
- **notes**: “Ironic verdict: “said this young man, who plainly thought a great deal of himself” — cites The Brown Fairy Book”: The quoted sentence does not appear in the rewrite, so this note describes a change that was not made. It is a fabricated or misattributed move.
- **notes**: “Antithesis: “he was proud, but he was also merry” — cites The Yellow Fairy Book, “The Grateful Beasts(11)”, ¶ 2”: The citation is dubious. The notes also repeat the same sentence under several labels, so they teach little.
- **notes**: “Periphrasis: “the music was very loud””: This is not periphrasis. It is a direct, nearly literal rendering, so the label is inaccurate.
- **form**: “Paragraph 1 (renders the writer’s ¶1, 2)”: The rewrite merges the writer's three paragraphs into two. The notes admit this, but the merge is not needed and the paragraph mapping is muddled, since paragraph 2 is said to render the writer's ¶2, 3 while paragraph 1 already used ¶2.

### fairy / store (f3 v3 s3 n2 n2)

_The rewrite keeps the main events and has some fitting Lang-like phrasing ('in want of', 'said she', 'paid me no heed'). It garbles the aisle sentence, drops the 'most awkward ten minutes' ending in favour of an invented moral, and has a punctuation slip. The notes misquote the text and call the moral a 'happy ending'._

- **fidelity**: “And if a man is in want of milk, he may well meet every soul he does not wish to meet.”: This replaces the writer's closing judgment ('the most awkward ten minutes of my week') with an invented general moral. The 'awkward' feeling, the 'ten minutes' and the 'my week' are all lost. 'Every soul' also exaggerates, since only one person was met.
- **sense**: “There were so many people in the store that a man in his hooded jacket stood the whole length of the aisle”: The 'so many ... that' construction makes the crowd the cause of the man blocking the aisle. The original says only that it was crowded and that a man was blocking the aisle. This adds a false causal link, and 'stood the whole length' is unclear.
- **natural**: “stood the whole length of the aisle”: A man cannot stand 'the whole length' of an aisle. The phrase is awkward and nearly nonsensical where 'blocked the whole aisle' was meant.
- **natural**: “"I thank you," said I, "and you the same."; and I paid”: The punctuation '.";' is wrong. A closing quote followed by a semicolon after a full stop is a typographical garble.
- **natural**: “at the check”: 'The check' for the checkout is not idiomatic and may read as a bill or a cheque. It is unclear and does not sound like Lang.
- **fidelity**: “my old sweetheart”: The writer says 'my ex', meaning a former partner after a breakup. 'Old sweetheart' softens this and loses the sense of a failed relationship.
- **voice**: “"Hey," said she”: 'Hey' is a modern interjection in an otherwise archaic register. It sits as modern prose in costume, and 'Hey' is not a Fairy Book greeting.
- **fidelity**: “my heart stood still with fear”: The writer says 'basically panicked', a casual, hedged reaction. 'Stood still with fear' is a stronger, differently coloured feeling, nearer to terror than awkward panic.
- **notes**: “My old sweetheart stood at the check, and my heart stood still with fear.”: The note quotes a sentence that is not in the rewrite. The rewrite reads 'And then I saw my old sweetheart at the check, and my heart stood still with fear.' The quotation is misreported.
- **notes**: “The happy ending: “And if a man is in want of milk”: The line is an invented moral, not a happy ending. The note does not tell the writer that the original closing sentence was replaced and its content dropped.
- **notes**: “Paragraph 4 (renders the writer’s ¶4)”: The notes assume four paragraphs, but the rewrite's dialogue and closing moral share one paragraph. The structure notes are vague, and the rewrite changed the paragraphing without saying so.

### fairy / email (f2 v3 s3 n3 n2)

_The rewrite keeps the dates and requests but invents a snide line about Legal, which alters the feeling and adds a fact. The voice is a thin archaic costume, and the notes misquote the text and do not report the addition._

- **fidelity**: “They are ever the slowest to set their hand to any page, as all the company knows.”: Invented sentence: it adds a new, sarcastic claim that legal is always slow and that everyone knows it. The original only said legal has not yet signed off. This also changes the feeling, since Sam is neutral and the rewrite blames Legal.
- **fidelity**: “Quick update: the launch is moving”: The rewrite renders 'launch' as 'the sending forth' and later 'send the thing forth'. This loses the product-launch meaning and 'shipping' is blurred into the same phrase. 'The sending forth' is vague about what is being sent.
- **fidelity**: “Those who mind the law”: 'Legal' is a team or department. Rendering it as 'those who mind the law' is a loose paraphrase that loses the sense of a specific group, though it is passable.
- **fidelity**: “Let each of you have his share of the writing done”: The deck, as a presentation, is lost: 'the writing' does not say 'deck'. 'His share' also genders the team, though this is in keeping with the voice.
- **voice**: “Good day to you, my team,”: A stiff, generic archaic greeting. The Fairy Books do not open with such a salutation, and the voice does not sustain 'Good day' with the 'Here is a word of news' that follows. The result is pastiche more than Lang's plain, brisk narration.
- **voice**: “I thank you, Sam.”: An awkward sign-off that keeps the name on the same line as the thanks. It reads as a costume rather than a fairy-tale cadence, and the signature is not set apart.
- **natural**: “if any of you is stayed”: 'Stayed' for 'blocked' is an odd usage; the sense of 'delayed or hindered' is archaic but unclear, and may read as 'stopped' or 'supported'.
- **notes**: “Ironic verdict: “They are ever the slowest to set their hand to any page, as all the company knows.””: The note presents an invented sentence as a stylistic move and does not report it as an addition that changes the meaning. It also cites a specific paragraph of 'Heart Of Ice' that is unlikely to contain such a verdict.
- **notes**: “Things in threes: “the sending forth goes from Tuesday to Thursday; let each of you have his share of the writing done by noon on Wednesday; and if any of you is stayed, let him say so today and not tomorrow””: The quoted text is not what appears in the rewrite: it is stitched together from separate paragraphs and punctuation is altered. These items are not a real triple in the draft; they are three separate points, so the note misdescribes the change.
- **notes**: “And so, and then: “and if any of you is stayed, let him say so today, and not tomorrow””: The 'and so, and then' move is not shown: the quoted clause has no 'and then' sequencing. The same sentence is cited for two different moves, which is padding. The notes also omit the real changes (the 'Legal' paraphrase, the 'launch' paraphrase, the invented insult).
- **notes**: “Paragraph 1:
  (no notes)”: Paragraphs 1 and 4 receive no notes although the greeting and sign-off were heavily changed.

### fairy / list (f3 v3 s4 n3 n3)

_A faithful skeleton, but the rewrite loses 'weirdly' and 'exhausted', adds 'old', and uses awkward periphrases ('troughs of the roof', 'together'). The voice is only lightly Langian and the notes' moves and citations are doubtful._

- **fidelity**: “I was weary, but I was proud of myself all the same.”: Drops 'weirdly'. The writer's slight surprise at feeling proud is lost, and 'exhausted' is softened to 'weary'. The feeling is flattened.
- **fidelity**: “my old grandmother”: The writer never said she was old. 'Old' is an added detail, though a mild one.
- **fidelity**: “the sink that let the water through”: 'Leaky' becomes a paraphrase that could mean the sink let water drain through, which is its job. It is a little ambiguous and over-periphrastic.
- **natural**: “cleaned the troughs of the roof”: A riddling periphrasis for 'gutters'. Lang would more likely write 'gutters' or 'the water-spouts'. It reads as a thesaurus swap, not idiom.
- **natural**: “talked for an hour together”: 'Together' is a stray filler. Nobody else is talking, so it reads oddly.
- **voice**: “On Saturday I cleaned ... and I mended ... and I called”: The Fairy Books are narrated in third person past, with 'Once upon a time' framing and plain narrative diction. A first-person diary list with 'and I' repeated is only thinly Langian. 'Called' (phone) is anachronistic and was left unadapted, and the weak 'all the same' tag carries little flavour.
- **notes**: “cites The Lilac Fairy Book, “The Enchanted Deer”, ¶ 40”: The citations look unverifiable and the paragraph numbers are suspect. The 'things in threes' move is also not what the rewrite does: the writer's list was already three items, and nothing was added.
- **notes**: “People by their place: “my old grandmother””: This mislabels the change. 'Old' is just an added adjective, and nothing identifies a person by their place or role beyond what the writer gave.
- **notes**: “Brings together your paragraphs 1 and 2.”: The merge is stated, but the notes do not mention the changes to 'weirdly' and 'exhausted' or the invented 'old'. They teach little about what was lost.

### fairy / paris (f4 v2 s3 n3 n2)

_The rewrite catches the 'never been' contradiction and reports the mend, but the mend is only partly consistent and not flagged as a guess. The voice is thin and the phrasing is awkward in places ('says still'). Several move labels in the notes are inaccurate or invented, so they teach little._

- **sense**: “I have never seen Paris. The last time I was there”: The mend is reported, but it is only partly consistent. 'The last time' still implies several visits, which sits oddly with 'never seen'. The note does not say that this reading is a guess, and it does not offer the alternative that the contradiction is a joke.
- **natural**: “He says still that it was the best holiday he ever had.”: 'Says still' is a stiff, pseudo-archaic inversion that no fairy-book narrator would use. 'He still says' is the natural form. It reads as costume rather than idiom.
- **fidelity**: “we passed nearly all the journey at the embassy”: 'Trip' became 'journey', and 'most of' became 'nearly all'. Both shift the sense slightly. A journey is the travelling, not the stay in Paris, so 'passed the journey at the embassy' is a little off.
- **voice**: “The last time I was there the rain fell the whole week through, and on the second day my brother lost his passport.”: This is plain modern prose with a few word swaps. It lacks Lang's fairy-tale markers: 'Now', 'it came to pass', the 'and so' chaining, a tale-teller's framing. The first-person modern anecdote is hardly transformed.
- **notes**: “Litotes: “the rain fell the whole week through””: This is not litotes, which is understatement by negation. It is a plain hyperbolic duration phrase, so the label teaches the wrong thing.
- **notes**: “People by their place: “on the second day my brother lost his passport””: The sentence names a time and an event, not a person defined by their place or station. The move label does not match the quoted text.
- **notes**: “Once upon a time: “I have never seen Paris.””: The sentence has no 'once upon a time' opening feature. The cited move is a stretch, and the source is not apt for a first-person statement of experience.
- **notes**: “Structure: Brings together your paragraphs 1 and 2.”: The merge is reported, but it loses the writer's paragraph break before the punchline about the embassy. The note does not explain why the merge helps.

### fairy / relieved (f3 v3 s3 n2 n2)

_The rewrite keeps the basic events and the relieved, guilty, doubtful direction, but it loses the 'told her' framing and slightly shifts the degree of feeling. The diction is partly clumsy ('scratched', 'all the week long'), and the notes cite sources inaccurately and mislabel the ending as 'happy'._

- **fidelity**: “for I was truly glad of it”: The writer said 'relieved'; 'truly glad' makes the feeling more positive, and it adds a redundant clause. It also reads as a reason for the preceding clause rather than an intensification, which blurs the original.
- **fidelity**: “'It is well, and we will do it another time,' said I”: The writer reports the speech indirectly ('I told her it was fine and we'd do it another time'). The rewrite makes it direct speech with no mention of telling Dana, so the addressee is lost. 'It is well' is also a weaker match for 'it's fine'.
- **natural**: “scratched our dinner”: 'Scratched' is a modern idiom for cancelling, as in scratching an event. It is not fairy-book diction and is slightly ambiguous. Something like 'put off' or 'begged to be excused' would fit better, and 'put off' would also be accurate.
- **natural**: “all the week long, and that I am not proud to own”: 'all the week long' is awkward, and the dangling 'and that I am not proud to own' is stilted rather than idiomatic. 'And' is repeated three times in the paragraph, which sounds mechanical.
- **voice**: “I was not sorry at all, for I was truly glad of it”: Lang's fairy books rarely use this reflective first-person confessional register. The passage sounds like generic archaic pastiche rather than the plain, brisk narration of the tales.
- **notes**: “cites The Green Fairy Book, “The War Of The Wolf And The Fox”, ¶ 7”: The cited line is the rewrite's own sentence, not a quotation from the source. The note presents a generic 'and so, and then' connective as a named move, and it is not evidently apt for a sentence about dreading.
- **notes**: “Your ending lightly echoes the promise-made-lightly motif of Rumpelstiltskin and The Frog Prince”: This is a forced comparison with irrelevant tales. The note is labelled 'sense' but reports no real mending, and it is confusing about what changed. Its closing remark that the rewrite 'does not make the promise binding' is irrelevant.
- **notes**: “The happy ending: “but I do not think we ever shall.””: Mislabelled: the line is a doubtful, bleak ending, not a happy ending. The cited source (Little King Loc) is dubious for it.
- **fidelity**: “but I do not think we ever shall”: The writer says 'I don't think we will'; 'ever' strengthens it to near-certainty. This is a slight shift in degree.

### kjv / breakup (f2 v3 s3 n2 n2)

_The rewrite has a KJV flavor from 'it came to pass' and archaic pronouns, but it duplicates and inflates details, adds an invented aside about the ice cream, and uses clumsy circumlocutions ('vessel', 'house where they sold drink'). The notes mislabel moves and cite verses that do not fit._

- **fidelity**: “saying, We must needs talk: and he said that we should talk together.”: The original has a text saying they need to talk. The rewrite says the same thing twice, which is redundant filler and adds a second speech act.
- **fidelity**: “he was sore afraid”: The original says 'He looked nervous'. 'Sore afraid' overstates it, and 'troubled' is also added, so the feeling is intensified.
- **fidelity**: “and he handled it”: He was 'scrolling', and 'handled' is a vague, odd substitute. It also adds something not in the original.
- **fidelity**: “a fine comfort, and a man might do worse”: This is an invented commentary. It changes the writer's tone, since the original has no wry approval of the ice cream. 'A man' is also out of place for a female narrator.
- **fidelity**: “said in her heart that I grieved more than the matter was worth”: The roommate 'thought I was overreacting'. The rewrite makes it 'grieved', which is not quite overreacting, and adds 'the matter was worth'. 'Said in her heart' is acceptable but the shift is real.
- **fidelity**: “a thing so grave and so solemn”: Original: 'something serious'. The doubled adjectives inflate it into grandeur and change the degree of feeling.
- **natural**: “a house in the city where they sold drink”: This is an awkward circumlocution for a coffee shop. 'Drink' suggests alcohol rather than coffee, and 'downtown' is flattened to 'in the city'.
- **natural**: “I would have wept, but I wept not: and I bowed mine head”: 'Would have wept, but wept not' is clumsy. It also loses the nodding, since 'bowed my head' differs from nodding in assent. The sequence 'I went home on foot' is stilted.
- **natural**: “a whole vessel of ice cream”: The 'pint' becomes a 'vessel', which is unidiomatic and unintentionally comic. 'And left nothing of it' is also an addition.
- **voice**: “But it hurt me still.”: This is plain modern prose, not KJV cadence, and it breaks the register of the rest. 'Perhaps I did' is also modern.
- **voice**: “And it came to pass on the next day”: The 'came to pass' formula is applied mechanically and repeatedly. KJV would vary with 'And on the morrow' or 'Then', and the paragraphs are not built with real parallelism.
- **fidelity**: “Then I went home on foot in the rain”: The original says 'walked home in the rain'. This is acceptable, but it omits that the rain and the walk are tied to her emotional state, and the last paragraph's tone is changed.
- **notes**: “cites Ruth 3:8”: The citations look arbitrary or invented. The cited verses do not exemplify the quoted construction, such as Mark 13:35 for 'the genitive with of', when the quoted sentence has no genitive 'of' construction.
- **notes**: “Behold, lo, verily: “And his countenance was troubled, and he was sore afraid.””: The label names behold, lo and verily, but none of these appears in the example. The same mismatch is found in 'Unto, thereof, wherefore', where 'thereof' and 'wherefore' are absent.
- **notes**: “Parallelism: “And I would have wept, but I wept not.” — cites 2 Samuel 22:42”: This is not an accurate example of the cited parallelism, and the notes do not report any sense changes or the added commentary.

### kjv / camp-letter (f3 v3 s4 n3 n2)

_The rewrite is readable and mostly faithful in events, but it flattens feeling, such as 'gross' and 'really cool'. It also invents a causal link between the charger and the counselors, and it replaces 'Love' with a Pauline formula. The notes carry mismatched, dubious citations and one note describes forms that are not in the quoted line._

- **fidelity**: “which I wholly left behind me; for the counsellors are somewhat exact with us”: The writer's phone charger and the counselors' strictness are separate points. Joining them with 'for' makes strictness the reason for forgetting the charger, which the original does not say.
- **fidelity**: “The camp is well enough, as I suppose;”: 'Okay I guess' is rendered weakly. 'Gross' food becomes merely 'not to my liking', which understates the disgust.
- **fidelity**: “snores like crazy”: The intensity is reduced to 'maketh a noise in his sleeping all the night long'. It no longer names snoring and gives no sense of extremity.
- **fidelity**: “truly a good companion”: 'Really cool' becomes 'good companion', which loses the sense of admiration or attraction. 'Truly' is not the writer's emphasis.
- **fidelity**: “The salutation of me Jake with mine own hand.”: This is a Pauline closing formula that replaces 'Love, Jake'. The affection of the original is lost.
- **fidelity**: “Moreover, I beseech you, suffer not Max to use my room.”: The P.S. has become a main-text sentence, so its afterthought quality is lost. The 'P.S.' is dropped.
- **natural**: “which is truly a good companion”: 'Whose name is Kayla, which is truly a good companion' has a clumsy relative: 'which' is used of a person and the clause is awkward.
- **natural**: “and the charger of my phone also”: 'Phone' is left as a bare modern word inside an archaic frame. The 'ye' and 'unto me' sit awkwardly beside 'Can ye send', which is a modern question form.
- **voice**: “Can ye send unto me more of such things as I may eat?”: Fronted 'Can ye' is not KJV syntax. KJV would use 'Send unto me, I pray you, more...'. It also switches from the 'my father and my mother' address, which is a minor inconsistency.
- **voice**: “Unto my father and my mother, greeting.”: The frame is plausible, but the register is mostly generic 'thee/ye' pastiche rather than distinctive KJV rhythm. Kayla's paragraph in particular is flat.
- **notes**: “cites Acts 16:16”: Acts 16:16 is not an apt or accurate source for 'And it came to pass'. The same applies to the other citations (Luke 15:32, Exodus 5:11, Hebrews 4:16, Philippians 3:15, 1 Corinthians 10:27), which look arbitrary and do not illustrate the named moves.
- **notes**: “Thou and thee, -eth and -est: “the counsellors are somewhat exact with us...”: The quoted sentence has no thou/thee or -eth/-est forms, so the note does not match the text. The notes also omit the sign-off changes, the P.S. restructuring and the sentence merging.
- **notes**: “Paragraph 1:
  (no notes)”: The salutation, the sign-off and the restructured P.S. are real changes that go unreported.

### kjv / job-interview (f3 v3 s4 n3 n2)

_The rewrite has a plausible KJV flavor (and, unto, it came to pass), but it drops 'fancy' and 'modern', overstates Priya as 'fierce' and 'ruled over', and flattens 'smiled' and 'perfectionist'. The notes mislabel moves and cite verses that do not fit them._

- **fidelity**: “exceeding great and new”: 'Super modern' becomes plain 'new', which loses the contemporary, cutting-edge sense.
- **fidelity**: “drank coffee”: 'Fancy' is dropped, so the writer's slightly mocking note on the coffee is lost.
- **fidelity**: “the woman that ruled over the office”: 'Manager' becomes one who 'ruled over' the office, which overstates her role.
- **fidelity**: “of an earnest and fierce countenance”: 'Kind of intense' is hedged and mild. 'Fierce' overstates it, and the 'kind of' softening is gone.
- **fidelity**: “I am one that will do all things wholly and perfectly”: The writer said 'I said I was a perfectionist', reported speech naming the cliché answer. The rewrite turns it into a paraphrase in direct speech, and the word 'perfectionist' is lost.
- **fidelity**: “And yet she set a pleasant look upon me.”: 'She smiled anyway' becomes a vague 'pleasant look', and the smile itself is lost.
- **fidelity**: “Peradventure it hath gone well with thee.”: The sister said 'I probably nailed it'. This is a vaguer 'it hath gone well', and the confident, colloquial sense of 'nailed' is weakened.
- **fidelity**: “I have no money left unto me”: 'Basically broke' is hedged. The rewrite makes it absolute and drops the 'basically'.
- **natural**: “and this was a lame answer”: In the KJV 'lame' means crippled, so the modern slang sense reads oddly. The rewrite also leaves the writer's present-tense 'is' and adds an awkward explanatory 'and'.
- **natural**: “And I hope she speaketh truly”: 'I hope' is a modern construction beside the archaic verb, and the sentence stacks 'for... for...' clumsily.
- **voice**: “had hoodies upon him, and drank coffee”: The phrasing is stilted, and 'hoodies' stays as modern vocabulary in costume. The passage leans on 'And' and 'unto' but has little of the KJV's rhythm and parallelism.
- **notes**: “The genitive with “of”: “every one that was therein had hoodies upon him””: The quoted sentence contains no genitive with 'of', so the label does not describe it, and the Matthew 1:18 citation is not apt.
- **notes**: “Unto, thereof, wherefore: “And yet she set a pleasant look upon me.””: The sentence contains none of unto, thereof or wherefore, so the label is inaccurate.
- **notes**: “Ironic verdict: “I am one that will do all things wholly and perfectly: and this was a lame answer.” — cites Mark 7:11”: Mark 7:11 (Corban) is not an apt model for a self-judging aside. The 'ironic verdict' is also not a KJV move, so the citation looks arbitrary.
- **notes**: “cites Luke 10:39”: The cited verse is loosely matched to 'and... and' parataxis. Some other citations, such as Luke 13:12 and Luke 8:47, are also not clearly tied to the moves they are cited for.

### kjv / neighbors (f3 v4 s4 n3 n2)

_The rewrite catches and reports the divorced-father/mother contradiction, and its KJV cadence is mostly convincing. But it invents 'found no taker', changes truck to cart, mixes tenses, and the notes cite mismatched verses and misquote the rewrite._

- **fidelity**: “and hath found no taker”: The writer never says the mother's matchmaking failed or that the narrator is unmarriageable. This is an invented, mildly insulting claim, and it also shifts the feeling from wry resignation to mockery.
- **fidelity**: “a great cart”: The writer's 'huge truck' becomes a cart. This is a period swap that changes the object, and 'great' is a weaker equivalent for 'huge'.
- **fidelity**: “And it came to pass that a new family came to dwell in the house next door beside us.”: 'Last weekend' is dropped, so the timing is lost. 'Next door beside us' is redundant.
- **fidelity**: “and carried them over”: This adds an action. The writer says only that the mother baked the cookies.
- **fidelity**: “he is put away from his wife”: 'Put away' is KJV idiom for divorce, but this passive phrasing is ambiguous about who ended the marriage. It also leaves the link between her look and setting the narrator up with him only implied.
- **sense**: “the sister of the man is somewhat aloof”: The mending is acceptable and reported, but it is a guess. It also leaves the two little kids with no mother, and 'sister of the man' appears from nowhere without any introduction.
- **natural**: “And they have a great cart, and two little kids. The father seemeth a good man”: Tenses jump from past narrative ('came to dwell') to present ('have', 'seemeth', 'is single'). The slang 'little kids' also sits oddly in KJV diction.
- **natural**: “my mother set a look upon her face”: This is an unidiomatic construction for the KJV, which would say something like 'her countenance changed'. It reads as a stiff calque of 'got this look'.
- **notes**: “Thou and thee, -eth and -est: “And the father is a man of the law, and he is single; yea, he is put away from his wife.” — cites Mark 14:8”: The label does not match the example, which has no thou/thee/-eth/-est. The quoted line also differs from the rewrite, which begins 'And it was found that the father…'. Mark 14:8 ('She hath done what she could') is not an apt source.
- **notes**: “Parallelism: “The father seemeth a good man; but the sister of the man is somewhat aloof, and keepeth herself apart.” — cites Acts 9:40”: Acts 9:40 (Peter raising Tabitha) is not a source for this contrast. The quoted sentence also differs from the rewrite, which says 'a good man' and 'a great cart'.
- **notes**: “Ironic verdict: “for many years she hath sought to give me in marriage, and hath found no taker.” — cites John 16:21”: John 16:21 is about a woman in travail and has no ironic verdict. The note also does not flag the added 'found no taker' as something beyond the writer's text.
- **notes**: “cites Genesis 39:13”: The source is loosely apt for 'it came to pass', but the quoted opening misquotes the rewrite, and the notes never mention changes like truck to cart or cookies to cakes.

### kjv / party (f2 v3 s2 n3 n2)

_The rewrite has KJV surface features (and-chains, unto, thereof, peradventure), but it adds an invented incident, moves the narrator's changed opinion forward so that it contradicts the later 'rude' line, and mistranslates the eye-roll. The notes cite loosely related verses and do not report these changes._

- **fidelity**: “so that we laughed at his words: and he was not so ill a man as I had thought.”: Invents an incident (they laughed at his words) and gives the narrator's later conclusion about Chris too early, which pre-empts the ending. The original says only that he was funny.
- **fidelity**: “and he was not so ill a man as I had thought.”: The narrator's revised opinion belongs at the end, after the cleaning. Placing it here gives the story a contradictory order: she has already revised her view, yet she next 'thought in my heart that the man was rude'.
- **sense**: “and he was not so ill a man as I had thought. ... And I thought in my heart that the man was rude.”: The rewrite introduces a contradiction: the narrator has already thought better of him, and then thinks him rude. It also makes the final 'Peradventure I judged him too hastily' redundant. No note reports this.
- **fidelity**: “And Emma lifted up her eyes.”: 'Rolled her eyes' is contempt or exasperation. 'Lifted up her eyes' in the KJV means looking up, often in prayer or at something seen, so the gesture is lost. The meaning is changed.
- **fidelity**: “I saw him stooping and setting the house in order”: Drops the detail that everyone else had left and that it was cleaning up. The 'when all the rest were departed' clause keeps part of it, but 'but later' (the contrast with rudeness) is weakened. 'Everyone from school' is also reduced to 'all that were of the school'.
- **fidelity**: “Peradventure I judged him too hastily.”: The original is the tentative 'Maybe I was wrong about him', but this states the verdict flatly ('judged him too hastily'), which is firmer than the writer's uncertainty.
- **voice**: “The feast was at the house of Jessica”: 'Feast' makes the party into a banquet, a change of register. 'Gone out of the town' and 'the room' for kitchen are loose, and 'the room' loses the kitchen.
- **voice**: “heavy and dull”: Modern-sounding. 'Lame' and 'boring' are not rendered in the KJV vocabulary, which would use words like 'vain' or 'of no account'. 'Of no account' is not KJV idiom either.
- **natural**: “the sound of the music was exceeding loud”: 'Exceeding loud' is acceptable KJV idiom, but 'the sound of the music' is flat. 'He was somewhat proud, yet also pleasant' is modern in rhythm, and 'yet also' is not KJV.
- **notes**: “cites Romans 12:3”: Romans 12:3 is about not thinking too highly of oneself, and it is not an 'ironic verdict' or a model for the construction. The citation is misapplied.
- **notes**: “cites Acts 28:8”: Acts 28:8 uses 'it came to pass' but is not an apt source for this construction, and the note does not teach the common KJV usage. The 'Unto, thereof, wherefore' note lists 'wherefore', which does not appear in the rewrite.
- **notes**: “cites Acts 8:7”: Cited for 'parallelism', but the verse is about unclean spirits and the healed, so it is not an apt model for this sentence. The notes also do not mention the added 'laughed' content or the moved verdict.

### kjv / store (f2 v3 s3 n2 n1)

_The rewrite keeps the order of events and reads as KJV-flavoured in places, but it garbles several details with riddling circumlocutions ('her that was mine', 'garment that had a covering'). It also contains a typo, shifts the closing feeling and drops 'ten minutes'. The notes have mismatched quotations and apparently arbitrary citations, so they teach little that is reliable._

- **fidelity**: “it was the sorest time of my week”: The original says 'most awkward ten minutes'. The rewrite drops 'ten minutes' and shifts 'awkward' to 'sorest', which means painful, and so changes the feeling. The notes then quote a different line, 'sorest ten minutes'.
- **fidelity**: “I was sore afraid”: 'Basically panicked' is rendered as fear. This is close, but 'sore afraid' is a stock angelic-terror phrase and overstates the mild panic.
- **fidelity**: “and he regarded me not at all”: 'Totally ignored me' is kept, but the notes cite this line as 'Behold, lo, verily', and none of those words appears in it.
- **fidelity**: “And I would not be rude”: 'Didn't want to be rude' is a wish. 'Would not' reads as a refusal or resolve, which shifts the meaning slightly.
- **natural**: “in al the passage”: Typo ('al'). It also reads as a stray archaic spelling in an otherwise standard text.
- **natural**: “a man in a garment that had a covering stood in al the passage, and talked upon the thing in his hand”: The periphrases for 'hoodie' and 'phone' read as riddles. 'Talked upon the thing in his hand' is awkward, and the 'blocking' sense is only implied. The KJV would not describe a hoodie this way.
- **natural**: “the place where men give the price of their goods”: A clumsy circumlocution for 'checkout' that reads as a riddle.
- **natural**: “Then I saw her that was mine”: 'Her that was mine' is an unclear rendering of 'my ex' and could mean a present possession. It loses the sense of a former partner, and 'ex' is not conveyed.
- **natural**: “Hail; it is a long time that I have not seen thee”: 'Hail' is a stiff greeting for 'Hey', and the 'long time that I have not seen thee' construction is garbled.
- **voice**: “I gat the milk”: 'Gat' is a Middle English or older form, not KJV usage (the KJV has 'got' or 'gotten'). The KJV-flavoured line would have 'obtained' or 'I took'.
- **voice**: “And I said, I thank thee; and thou also.”: The wording is stilted, and 'and thou also' is an odd elliptical reply compared with the original 'You too'.
- **notes**: “cites Isaiah 7:22”: Isaiah 7:22 is about abundance of milk and does not model 'And it came to pass'. The citation is a poor fit for the move, and the others are similarly arbitrary.
- **notes**: “cites 2 Kings 6:33”: The label says 'Behold, lo, verily' but the quoted line contains none of them. The verse is unrelated to the move named.
- **notes**: “cites Mark 16:2”: The quoted text 'sorest ten minutes' does not match the rewrite, and the label 'genitive with of' does not describe 'And of a truth'. The cited verse does not apply.
- **notes**: “cites Luke 24:41”: This verse is about the disciples' disbelief and does not illustrate 'said unto'. Job 14:2 and Ezekiel 1:28 are likewise loose fits for the moves.
- **notes**: “Structure: Brings together your paragraphs 1 and 2.”: The structure notes are redundant and inaccurate. The rewrite has three paragraphs while the original has four, and the grouping claims overlap (¶2 appears in both groups).

### kjv / email (f2 v3 s2 n2 n2)

_The rewrite has a faint KJV flavour but garbles several facts ("ends of the book", "the lawful", mismatched weekdays), invents a sentence, and uses a singular "thee" for a team. The notes cite loosely fitting verses and report none of the real alterations._

- **fidelity**: “the lawful hath not yet set his hand unto the page of the price”: "Legal" (the legal department) becomes "the lawful", which reads as a single person or an adjective; the sign-off is kept but the department is lost.
- **fidelity**: “a wondrous thing it were, that the deck should go forth, and the ends thereof remain unfinished”: Invented sentence that the writer never wrote; it adds a claim and a tone of reproach and is also confusing ("wondrous" implies marvel, not displeasure).
- **fidelity**: “the ends of the book in the deck”: "your sections of the deck" is garbled into "ends of the book"; "book" is invented and "ends" does not mean sections.
- **fidelity**: “the opening thereof was moved”: "the launch" is rendered as "the opening" with no antecedent; the reader cannot tell what is opening. Also "Quick update" is lost.
- **fidelity**: “by the third day at the noon thereof”: "Wednesday" as "third day" is right in numbering from Sunday as first? Tuesday=third day, Wednesday=fourth, Thursday=fifth, so the days are mismatched: Tuesday rendered as "second day", Thursday as "fourth day", and Wednesday as "third day", all off by one and inconsistent with Monday-first or Sunday-first reckoning.
- **fidelity**: “I give thee thanks.”: The addressee is plural ("company", "ye"), but "thee" is singular; also the sign-off is flattened.
- **sense**: “from the second day of the week unto the fourth day”: Weekday numbering is wrong under either reckoning (Sunday-first: Tuesday is third, Thursday fifth; Monday-first: Tuesday second, Thursday fourth, then Wednesday should be third), so the days are internally inconsistent with the Sunday-first or Monday-first scheme. This is unreported and may confuse a real reader about dates.
- **natural**: “I would not that we should send it forth without the same.”: Archaic but reasonably biblical; however "the lawful hath not yet set his hand" and "the page of the price" are riddling rather than idiomatic.
- **voice**: “Unto the company, greeting.”: Epistolary opening is plausible, but the closing "I give thee thanks. Sam" is weak and the whole piece leans on "thereof" and "hath" as costume, with few real KJV cadences.
- **notes**: “cites Amos 8:9”: Amos 8:9 is used as a source for "And it came to pass"; the phrase is not characteristic of that verse (it begins "And it shall come to pass in that day"), so the citation is shaky. The note also quotes the whole sentence rather than the move.
- **notes**: “cites Isaiah 55:11”: Isaiah 55:11 ("so shall my word be that goeth forth") does not illustrate "unto, thereof, wherefore"; the quoted example contains only "unto".
- **notes**: “cites Luke 13:33”: Poor fit for parallelism; and Isaiah 5:19 and Luke 11:9 likewise do not clearly demonstrate the genitive or paratactic "and" claimed.
- **notes**: “Paragraph 1:
  (no notes)”: No notes at all on the greeting, the invented sentence, the loss of "Legal" or the weekday renaming; the invented addition and changes are unreported.

### kjv / list (f3 v3 s4 n3 n2)

_All the facts survive and nothing is invented, but "weirdly" is lost and several phrases are awkward or stilted ("let water through", "made clean"). The KJV voice is thin, resting mainly on "came to pass" and "unto". The notes rely on dubious citations and name features that are not in the text._

- **fidelity**: “and yet proud of myself”: The writer's "weirdly proud" carries a note of surprise at feeling proud. "Weirdly" is dropped, and "exhausted" is flattened to "weary". The feeling is softened and no longer odd or surprising.
- **natural**: “the sink that let water through”: This is an awkward paraphrase of "leaky". It is neither KJV idiom nor plain English, and it reads like a riddle.
- **voice**: “I made clean the gutters”: "Made clean" is a stilted calque. KJV would say "cleansed" or "purged". "Repaired" and "called my grandmother" also have no KJV colouring, since "called" in KJV usually means summoned.
- **voice**: “proud of myself”: This ends in modern, reflexive self-regard. In the KJV "proud" is a vice, and the reflexive "of myself" is not its idiom. The close is a modern sentiment in costume.
- **voice**: “These are the things that I did on the Saturday”: "The Saturday" is not a KJV form, which would say "the sabbath day" or "the seventh day". The opening is a thin, mostly modern frame and does not use KJV cadence or diction.
- **natural**: “she talked an hour unto me of the cat of her neighbour”: "Talked ... unto me" is not natural KJV usage, which has "spake unto me" or "talked with". The stacked "of ... of" is clumsy and verges on unintended comedy.
- **notes**: “cites Acts 16:18”: This verse is not a clear model of paratactic "and" lists of tasks. The citation looks arbitrary.
- **notes**: “cites 2 Corinthians 2:5”: The verse ("if any have caused grief") does not show an "X, and yet Y" antithesis. It does not support the move as claimed.
- **notes**: “cites Matthew 24:50”: This is a weak example of a genitive with "of", and it does not teach the specific construction used here.
- **notes**: “Unto, thereof, wherefore”: The note names "thereof" and "wherefore", but neither appears in the rewrite. It also does not report the changes actually made, such as "made clean" and "the Saturday".

### kjv / paris (f2 v3 s3 n2 n2)

_The rewrite mends the contradiction in a reasonable way and has some KJV flavor, but it invents details (the embassy scene, 'better than all his days') and has wrongly formed archaisms ('thither', 'the most of'). The notes cite loosely matched verses and name a 'behold, lo, verily' move that is not present._

- **fidelity**: “where the men of many nations give forth their papers”: Adds an invented detail about the embassy that is not in the draft; it is not commentary on what is there.
- **fidelity**: “for the passport of my brother was not to be found”: Adds a clause that restates the loss as an explanation for the embassy visit. The writer implied this but did not say it, and the sentence now does extra work.
- **fidelity**: “yea, better than all his days”: Exaggerates the claim. The writer said 'the best vacation he ever had', not better than all his days; this changes its degree and scope.
- **fidelity**: “the best leisure that ever befel him”: 'Vacation' becomes 'leisure', and 'befel' implies something that happened to him, not a trip. The meaning drifts.
- **fidelity**: “I have never been back to Paris.”: The mending changes the writer's claim. A more faithful fix would keep 'never been' as a joke or as 'never seen Paris, only the embassy'. The 'back' reading is plausible but is reported weakly, and it also drops the contrast between never having seen Paris and having spent the week at the embassy.
- **natural**: “thither”: 'Thither' means 'to that place', so 'the last time I was thither' is wrongly formed. The KJV would say 'there', or 'when I went thither'.
- **natural**: “the most of the journey”: Awkward and not idiomatic; the KJV would say 'the most part' or 'the greater part'.
- **natural**: “And he saith even now”: The mix of present-tense 'saith' with the narrative past is acceptable, but 'even now' is a modern-sounding filler.
- **voice**: “And it came to pass that we spent”: Overused formula, and it is applied to a mundane reflection in the past; 'it came to pass' ordinarily introduces events. The 'we spent' also keeps the modern 'spent'.
- **notes**: “Behold, lo, verily: “I have never been back to Paris.” — cites Psalms 37:36”: The sentence contains no 'behold', 'lo' or 'verily', so the note names a move that was not used. The cited verse does not model that move either.
- **notes**: “The genitive with “of”: “where the men of many nations give forth their papers: for the passport of my brother was not to be found.” — cites Daniel 12:1”: The citation is a loose pairing with nothing that teaches the construction. The note also does not flag that the embassy clause is invented content.
- **notes**: “Parallelism: “and he saith even now that it was the best leisure that ever befel him, yea, better than all his days.” — cites Matthew 19:30”: Matthew 19:30 ('many that are first shall be last') is not an apt source for this, and the rewrite is not really parallelism. The note does not admit the added exaggeration.
- **notes**: “Clauses laid side by side with “and”: “And the last time I was thither it rained the whole week”: The quote in the note differs from the rewrite, which says 'And the last time I was thither' but with a separate sentence after 'Paris'. Ezra 5:16 is a doubtful source. The note does not mention the reordering of 'my brother lost his passport on the second day'.

### kjv / relieved (f3 v3 s4 n3 n2)

_The meaning of relief and dread is mostly preserved, but a redundant 'neither' clause is added and the dinner is cast as a loss. The diction is mixed KJV pastiche with a punctuation slip. The source citations in the notes are largely inapt or fabricated-looking._

- **fidelity**: “neither was my spirit heavy at the losing of the dinner”: This adds a second restatement of 'not upset' and recasts the cancellation as 'losing' the dinner. That suggests the dinner was a loss, which fits poorly with the writer's relief and dread.
- **fidelity**: “It is well with me; and we will take the dinner again at another time.”: The writer said 'it was fine and we'd do it another time.' The rewrite turns that into a direct promise, 'we will take the dinner', and changes the reported speech into a quoted line. 'It is well with me' also shifts the meaning slightly from 'it's fine'.
- **fidelity**: “But I think not that we shall.”: This is acceptable in meaning, but 'we shall' now refers back to 'will take the dinner' and loses 'I don't think we will' as a plain rueful aside. The tone is weaker.
- **natural**: “Verily, I was eased. for I had feared it the week through”: A lowercase 'for' follows a full stop, which is a punctuation error. 'Eased' is an odd choice for 'relieved'. 'Feared' also overstates 'dreaded', and 'the week through' is not idiomatic KJV.
- **voice**: “Verily, I was eased.”: 'Verily' is used as a decorative tag. In the KJV it introduces a solemn assertion ('Verily I say unto you'), not a personal confession of relief. The sentence sounds like pastiche.
- **voice**: “I am not proud of that.”: This stays in modern idiom. The KJV would use something like 'I am not proud thereof' or 'I am ashamed.' The 'did put off' construction is also more Tudor than KJV, and 'the putting off of it' is clunky.
- **notes**: “cites Numbers 33:56”: This verse ('it shall come to pass, that I shall do unto you, as I thought to do unto them') is a weak and arbitrary source for the 'came to pass' opener. Many verses would fit better, such as Gen 4:3.
- **notes**: “cites Luke 12:40”: This verse ('Be ye therefore ready also') has no negative-neither parallelism. The citation does not support the move.
- **notes**: “cites Mark 9:12”: This is a poor example of 'verily'. The common usage is 'Verily I say unto you', for example Matt 5:18.
- **notes**: “cites John 9:4”: The verse ('I must work the works of him that sent me') does not show the 'the Xing of it' genitive construction claimed.
- **notes**: “cites Judges 8:2”: Judges 8:2 begins 'And he said unto them, What have I done now in comparison of you?' It is a loose fit for the reported-speech pattern, though it does contain 'said unto'. The notes also flag no mending and no structural changes, such as the doubled clause that was added.

### obama / breakup (f2 v2 s3 n2 n1)

_The rewrite changes facts (text became a phone call, pint became box, the nod is dropped) and uses awkward, unidiomatic phrasing, with little real Obama cadence. The notes cite dubious sources for moves that are not present and do not disclose the actual changes._

- **fidelity**: “Ryan reached me by phone at midnight, and when I answered he said only that we needed to talk.”: The original says he texted. 'Reached me by phone' and 'when I answered' imply a call and invent an exchange, which changes the event.
- **fidelity**: “I just said it was okay”: The original has her nod and then say okay. The nod is dropped, and the line is turned into reported speech.
- **fidelity**: “turned down to his phone”: 'Scrolling' is lost, and the phrase is a garbled paraphrase.
- **fidelity**: “a whole box of ice cream”: The original says a pint. 'Box' changes the quantity.
- **fidelity**: “because everybody knows what that means”: This adds a claim not in the original. It is commentary, but it flattens the writer's personal dread.
- **fidelity**: “and that is the truth of it”: This tag is added filler. It changes the quiet ending into an assertion.
- **natural**: “a little shop downtown that serves coffee”: This is an awkward circumlocution for 'coffee shop' that sounds odd, not Obama-like.
- **natural**: “I took in a whole box of ice cream before the night was over”: 'Took in' is an odd verb for eating. 'Before the night was over' is vague and adds timing the original lacks.
- **natural**: “when I got in, turned down to his phone”: 'When I got in' and 'turned down to' are unidiomatic and read as a thesaurus swap.
- **voice**: “He looked nervous, and then he said he wasn't ready for something serious; it wasn't about me, he said, it was about him.”: The prose is flat paraphrase. There are no real Obama signatures such as 'Now,' 'Look,' a rhetorical turn, a measured build, or a reflective generalization. It reads as lightly reworded modern prose.
- **notes**: “cites Eulogy for the Honorable Reverend Clementa Pinckney, 26 June 2015, ¶ 8”: The cited speeches and paragraphs are implausible matches for a breakup anecdote. They look fabricated or unverifiable, and the 'move' named does not correspond to the cited text.
- **notes**: “Building in threes: “he said he wasn't ready for something serious; it wasn't about me, he said, it was about him.””: The quoted sentence has two parts, not three, so the note misdescribes the change. 'Not this, but that' is also claimed for the same sentence.
- **notes**: “Ironic verdict: “Then I walked home in the rain, and I took in a whole box of ice cream before the night was over.””: The sentence is not an ironic verdict. Citing a 9/11 Pentagon memorial for it is inapt.
- **notes**: “From what happened to what we do: “But it still hurt, and that is the truth of it.””: The line does not move from what happened to what we do. The note also does not report the phone/text, box/pint, or missing-nod changes.

### obama / camp-letter (f2 v2 s3 n2 n1)

_A bland, over-euphemized paraphrase that softens or shifts details (friend for bunkmate, 'device' for charger, 'really like' for 'cool') and barely sounds like Obama. The notes attach dubious citations to ordinary sentences and mislabel the moves._

- **fidelity**: “my friend makes an awful noise every night when he is lying there”: Original says bunkmate snores like crazy. 'Friend' changes the relationship, and 'awful noise... lying there' blurs the snoring. 'Every night' is added.
- **fidelity**: “The food is not very good”: 'Gross' is weakened to a mild understatement, so the intensity of the complaint is lowered.
- **fidelity**: “And the device for my phone, which I forgot to bring along.”: 'Charger' is replaced with a vague 'device', which is a riddle-like circumlocution. The 'totally' emphasis is lost.
- **fidelity**: “Could you send me some more things to eat?”: 'Snacks' is replaced by 'things to eat', which is vaguer and changes the meaning slightly.
- **fidelity**: “she is someone I really like”: The original says Kayla is 'really cool'. This turns it into romantic liking, which is a shift in feeling, and it pre-empts the later 'I think she likes me'.
- **fidelity**: “The counselors keep a close watch on us, but they are mostly all right.”: 'Kind of strict' becomes 'keep a close watch', which is a different meaning, and 'mostly all right' also drops the 'fine' nuance.
- **fidelity**: “I turned the boat over”: The canoe becomes 'the boat' and 'went out on the water' hides the canoeing. 'Everybody laughed' becomes 'made fun of me', which is a stronger claim.
- **fidelity**: “It was not the finest moment of my staying here, that is for sure.”: 'It was so embarrassing' becomes an understatement, so the intensity is reduced, and the wording 'my staying here' is awkward.
- **voice**: “talk about everything under the sun”: This is a generic cliché rather than Obama's cadence. The whole rewrite is mostly flat paraphrase with one 'here's the thing' and lacks his rhythm, his qualifying clauses and his warmth.
- **natural**: “my staying here”: Unidiomatic phrasing; no one would say 'the finest moment of my staying here'.
- **natural**: “makes an awful noise every night when he is lying there”: This is clumsy and euphemistic, and reads as an unintended comedic circumlocution.
- **notes**: “Building in threes: “Yesterday we went out on the water, and I turned the boat over, and everybody made fun of me.” — cites 34th Fallen Firefighters Memorial Service”: This is a simple sequence of clauses, not a rhetorical triad, and the cited speech is a dubious, solemn source for a camp letter. The citations look fabricated or loosely matched.
- **notes**: “From what happened to what we do: “The food is not very good, and my friend makes an awful noise every night when he is lying there.””: The note is misplaced under paragraph 2 when the quoted sentence is in paragraph 1, and it describes no real move. Paragraph 1 is also marked as having no notes.
- **notes**: “Not this, but that: “The counselors keep a close watch on us, but they are mostly all right.””: This is not a 'not this, but that' construction, and the cited Weekly Address of 7 January 2017 does not fit. It misdescribes the change.
- **notes**: “One American’s story: “She is from Ohio, and she knows more about horses than just about anybody I have ever met.””: This is a mislabel. It is a plain description, and the notes do not report the drift in meaning ('device', 'friend') or the weakened feelings.
- **sense**: “my friend makes an awful noise”: The notes do not flag the changes of sense, such as the new relationship and the vague 'device'.

### obama / job-interview (f3 v3 s4 n3 n2)

_The rewrite is readable and keeps the main events in order, but it adds invented details (badge, glass, "one good suit") and drops "perfectionist" and the coffee. The Obama voice is thin, with only one real tic. The notes mislabel moves and cite poorly matched sources._

- **fidelity**: “the kind of place where you half expected someone to hand you a badge at the door”: Invented detail and image. The writer never said anything about badges or security. It goes beyond commentary on what is there.
- **fidelity**: “all glass and clean lines”: "Super modern" becomes specific architecture (glass) the writer never mentioned.
- **fidelity**: “wore pullovers and carried cups from that fancy shop”: "Hoodies" is changed to "pullovers". "Fancy coffee" becomes "cups from that fancy shop", so coffee disappears and "that" points at nothing.
- **fidelity**: “my one good suit”: Adds that it is the narrator's only good suit. This is a new fact and reinforces the money worry.
- **fidelity**: “feeling as out of place as a man can feel”: Intensifies "totally out of place" and assumes the narrator is male.
- **fidelity**: “there was something fierce about her”: "Kind of intense" is a hedged, milder impression. "Fierce" shifts the feeling toward aggression.
- **fidelity**: “I told her I expected too much of myself”: The writer said "perfectionist" and judged it a lame, cliché answer. The rewrite replaces the word with a paraphrase, so the reader cannot see why it was lame.
- **voice**: “Everyone in there wore pullovers and carried cups from that fancy shop”: Flat, generic descriptive prose. Obama's reflective cadence, parallel builds and wry self-deprecation are largely absent. Only "Here's the thing" is a recognizable tic, and it sits oddly in a narrative recount.
- **natural**: “feeling as out of place as a man can feel”: Stilted, filler-like superlative. It does not sound like a natural idiom.
- **natural**: “I have almost nothing left to my name”: Slightly formal and cliché. It overshoots the casual "basically broke".
- **notes**: “Not this, but that: “Everyone in there wore pullovers and carried cups from that fancy shop, and there I was in my one good suit, feeling as out of place as a man can feel.””: This sentence is not a not-this-but-that construction. The Dallas memorial citation is also an inapt source for a comic office description.
- **notes**: “Building in threes: “huge and all glass and clean lines””: This is a loose adjective list, not a clear triad. The commencement citation is a stretch.
- **notes**: “Not this, but that: “she was friendly enough, but there was something fierce about her””: This is an ordinary "but" contrast, not the rhetorical move named. The notes also do not report real changes such as "hoodies" to "pullovers", "perfectionist" to a paraphrase, and the added badge and suit details.

### obama / neighbors (f2 v2 s3 n3 n2)

_The rewrite mends the mom/divorced contradiction with a reported sister and keeps the order of events. But it mistranslates "divorced" as "separated," adds glosses, and barely sounds like Obama. The notes attach grand citations to moves that are absent or generic._

- **fidelity**: “separated, from a broken marriage”: The writer said "Well, divorced." Separated is not divorced, so the fact changes. "From a broken marriage" is an added editorial gloss that the writer did not give.
- **sense**: “he's single — separated, from a broken marriage”: A separated man is still legally married, so "single" sits badly beside it. The rewrite brings back a small version of the contradiction it set out to mend.
- **fidelity**: “something home-baked”: The writer's concrete "cookies" becomes a vague phrase. It loses detail and the homely specificity the voice would keep.
- **fidelity**: “That's just who she is.”: This is an added characterization of the mother. It goes beyond commentary on what is there and slightly changes the tone of her nosiness.
- **fidelity**: “The dad seems like a good man.”: "Nice" becomes "a good man," a heavier moral judgment than the writer made.
- **fidelity**: “His sister keeps to herself.”: "Kind of standoffish" is softened to a neutral idiom, so the mild negative judgment is lost.
- **voice**: “A new family moved in next door last weekend — a big truck, and two little kids.”: The rewrite is nearly the original with dashes and small swaps. It has little of Obama's cadence: no "Now," no "Look," no balanced clauses, no rising reflective turn. It reads as lightly edited modern prose.
- **voice**: “My mom got this look on her face, and I knew exactly where it was headed.”: This is largely the writer's own sentence. The self-deprecating, rhetorically built humor Obama uses is not supplied.
- **notes**: “Plain talk to the listener: “His sister keeps to herself.” — cites Booker T. Washington High School Commencement, 16 May 2011, ¶ 20”: The line is a sense-repair, not a rhetorical move. It is not plain talk to a listener, and the citation looks unverifiable or decorative.
- **notes**: “Not this, but that: “he's single — separated, from a broken marriage.” — cites National Peace Officers' Memorial Service, 15 May 2012, ¶ 11”: This is not a not-this-but-that construction. The note also hides that "divorced" was changed to "separated."
- **notes**: “From what happened to what we do: “My mother went over with something home-baked right away, because she wanted to find out everything about them.””: The label does not describe the sentence, which just merges two sentences with a causal "because." The citation to a weekly address is a stretch.
- **notes**: “Remove the wife/mother from the house so the setup pays off.”: The sense note is muddled and wordy. It says to remove the mother and then fixes the problem by adding a sister. It also misses that the draft's "My mom" is a different person from the new family's mom.
- **notes**: “Ironic verdict: “I knew exactly where it was headed.””: The line is nearly the writer's own and adds no real change, so the note claims a move that was not made.

### obama / party (f2 v2 s3 n2 n2)

_The rewrite is mostly the original with light colloquial swaps, so it barely sounds like Obama. It also shifts feelings (a firmer 'all wrong', 'proud' for 'arrogant'), invents a sarcastic aside, and comes with notes whose labels and citations do not match the text._

- **fidelity**: “which was a fine thing for him to say, standing there as he was”: Invents an ironic commentary implying Chris was hypocritical, standing at the party he mocked. This is not in the original, and it muddles the feeling about Chris. The commentary also reads as a dig rather than the writer's attitude.
- **fidelity**: “her folks were away for the weekend”: The original says only that her parents were out of town. 'For the weekend' is an added detail.
- **fidelity**: “neither of us knowing a soul”: The original says they 'didn't know many people'. 'Not a soul' overstates this, and it contradicts 'Everyone from school was there'.
- **fidelity**: “kind of proud but funny, too”: 'Arrogant' is softened to 'proud', which loses the negative edge. 'Proud' is also a positive word in many contexts, so the feeling shifts.
- **fidelity**: “It turned out I had him all wrong.”: The original is tentative: 'Maybe I was wrong about him.' The rewrite turns it into a firm conclusion, so the degree of feeling is changed.
- **fidelity**: “when everyone else had gone home”: The original says 'when everyone else left'. This is a minor change, but 'gone home' is a small addition.
- **voice**: “Here's the thing:”: This is a generic colloquial filler, not an Obama cadence. The passage has none of his anaphora, his balanced clauses, or his reflective turns toward a moral. The voice is mostly thin modern prose with a few casual tags.
- **natural**: “the music was so loud you could barely hear yourself think”: This is a stock cliché. It replaces 'super loud' without adding any voice-specific texture.
- **natural**: “a tall boy made his way over”: 'Boy' for a high-school 'guy' is a slightly odd register. The sentence also reads stiffly beside the casual 'folks' and 'kind of'.
- **notes**: “Building in threes: “I stood in the kitchen with my friend Emma, neither of us knowing a soul.””: The sentence contains no triad, so the label is inaccurate. The cited source (a firefighters memorial) has no apparent bearing on it.
- **notes**: “cites Eulogy for the Honorable Reverend Clementa Pinckney, 26 June 2015, ¶ 8”: The citations look fabricated or ill-fitting. A eulogy and memorial services are tonally unrelated to a party scene, and 'plain talk' is a vague label. The notes also do not mention the added ironic clause as an addition.
- **notes**: “Not this, but that: “I thought he was rude. But later...”: The label is overstated, because this is just the writer's original contrast. The notes claim moves that are not Obama-specific and teach little.
- **sense**: “which was a fine thing for him to say, standing there as he was, and Emma rolled her eyes”: The added aside is ambiguous (who is judging?) and makes the sentence harder to follow. No sense faults were reported, though one was introduced.

### obama / store (f3 v3 s4 n3 n2)

_The rewrite is readable and keeps the main events in order. It invents the man's motive, adds 'picked up the milk' and a closing quip, and softens the panic. The Obama voice is a thin layer of tics, and the notes cite dubious sources and hide the additions._

- **fidelity**: “not because he'd heard me, but because he'd finished his call”: Invents a cause for the man moving. The writer only said he finally moved. The rewrite adds an incident and an inference about his motive.
- **fidelity**: “I saw a face I wasn't ready for — the woman I used to be with.”: Adds the writer's unreadiness, a gloss that stands in for 'basically panicked'. The panic is softened and the 'panicked' feeling is lost. 'Ex' also becomes a wordy periphrasis.
- **fidelity**: “I paid, I picked up the milk, and I left”: Adds 'picked up the milk', which is a new action. It was added only to make a triple.
- **fidelity**: “And all that, for a carton of milk.”: Adds a closing quip and a new sentiment not in the original. It is more than commentary, and it shifts the emphasis.
- **fidelity**: “He didn't so much as look up.”: The original says he 'totally ignored me'. This is a reasonable equivalent, but 'look up' adds a detail about what he did.
- **voice**: “Here's the thing — I needed milk.”: A stock Obama tic, jammed onto a trivial first line. The em-dash use feels modern-columnist rather than Obama's spoken cadence. The register is mock-solemn without the real rhythm or the rhetorical build.
- **voice**: “We've all been there: you don't want to be rude, but you do need to get by.”: The 'we' move is apt, but the sentence is generic and flat. The voice lacks Obama's specific self-deprecating humor and longer periodic sentences.
- **natural**: “stood deep in a phone call, blocking the way”: 'Deep in a phone call' is slightly odd. 'Blocking the way' is flat.
- **natural**: “The most awkward ten minutes of my week. And all that, for a carton of milk.”: Fragment followed by a tacked-on quip. It reads as a sitcom button rather than the voice.
- **notes**: “cites Eulogy for the Honorable Reverend Clementa Pinckney, 26 June 2015, ¶ 8”: The citation is implausible. A eulogy has no 'Here's the thing' opener at that paragraph, and the precise paragraph numbers look fabricated. The same applies to the other citations.
- **notes**: “Not this, but that: “Finally he moved aside”: This labels an added invention as a rhetorical move. It does not disclose that a new fact (his motive) was inserted.
- **notes**: “Ironic verdict: “And all that, for a carton of milk.” — cites State of the Union Address, 20 January 2015, ¶ 9”: The cited source is not a plausible home for this kind of quip. The note does not flag that the line is an addition.

### obama / email (f2 v3 s3 n3 n2)

_The rewrite drops the new launch day (Thursday), changes the noon deadline to 1 pm, invents a rationale, and omits the signature. The notes quote sentences that do not appear in the text and cite dubious sources, and the voice is generic motivational talk rather than Obama's cadence._

- **fidelity**: “Wednesday at one in the afternoon”: The writer said Wednesday at noon. The deadline has been changed to 1 pm, which is a factual error.
- **fidelity**: “Hi, team.

Here's the thing, team:”: The email greets the team twice. It also drops the original's plain 'Quick update' opening.
- **fidelity**: “the launch is moving, and we're going to make the most of it”: The rewrite omits the Tuesday-to-Thursday change. Thursday is never mentioned and the new date is lost. The added 'make the most of it' is a cheerful spin the writer did not express.
- **fidelity**: “But better to take two more days and get it right than to ship on Tuesday and spend the week fixing what broke.”: This invents a rationale and a consequence (things breaking, a week of fixes) that the writer never stated. It goes beyond commentary on what is there. 'Two more days' is also computed rather than given.
- **fidelity**: “that's how we stay on schedule together”: This adds a claim the writer never made. The schedule has already slipped, so 'stay on schedule' is slightly off.
- **fidelity**: “Thanks, everybody.”: The signature 'Sam' is dropped, so the sign-off is incomplete.
- **notes**: ““That's why we're waiting for legal to sign off on the pricing page before anything goes out the door.””: This quoted sentence is not in the rewrite. The note describes a move that was never made.
- **notes**: ““Which means our friends in legal move on their own clock, and the rest of us plan around it.””: This quoted sentence is also absent from the rewrite. The 'ironic verdict' note is therefore fabricated.
- **notes**: “cites President Barack Obama's State of the Union Address, 28 January 2014, ¶ 73”: The citations look fabricated or ill-fitting. The same line is attributed to two different sources, and the paragraph numbers are implausibly precise. The notes don't teach anything real.
- **voice**: “Here's the thing, team: the launch is moving, and we're going to make the most of it.”: This is generic motivational filler rather than Obama's cadence. It lacks his characteristic balanced clauses and 'Now, ...' or 'Look, ...' turns. An email about a delay gets a rally-speech tone.
- **natural**: “I'm not going to let us ship a launch without it”: 'Ship a launch' is awkward. Obama would not likely say it, and it reads as a garbled version of 'ship without it'.
- **sense**: “the launch is moving, and we're going to make the most of it”: With the day omitted, the reader cannot tell where the launch is moving. The vagueness introduces a clarity fault the original did not have.

### obama / list (f3 v2 s4 n4 n2)

_The content is mostly preserved, but the neighbor's cat is made plural and 'weirdly' is dropped. The prose is barely changed and has little Obama-like voice, and the notes mislabel moves and cite dubious sources._

- **fidelity**: “her neighbors' cat”: The writer wrote 'her neighbor's cat' (singular neighbor). The rewrite makes it plural.
- **fidelity**: “but I was proud of it”: The writer's 'weirdly proud' carries surprise and self-deprecation. The rewrite flattens it and drops 'weirdly'. 'Exhausted' is softened to 'worn out'.
- **fidelity**: “This is the kind of Saturday I'd call a good one”: This adds an evaluative frame the writer never gave. It is commentary, but it pre-judges the day as 'good' and shifts the order, since the writer's 'Things I did on Saturday' framing is lost.
- **voice**: “I cleaned out the rain gutters, fixed the sink that wouldn't stop dripping, and called my grandmother”: This is essentially the writer's own sentence with light paraphrase. It has little of Obama's cadence: no wry aside, no 'Now,' or 'Look,' no humane turn. It reads as lightly edited modern prose, not Obama.
- **voice**: “By the evening I was worn out, but I was proud of it.”: There is no real Obama texture, such as a self-aware joke, a balanced clause or a reflective turn. It is a minimal rewrite.
- **notes**: “cites Weekly Address, 9 October 2010, ¶ 1”: The citations look fabricated or unverifiable and do not match any specific moves. The 'plain talk' note is vague, and the cited text would not contain this kind of sentence.
- **notes**: “Not this, but that: “By the evening I was worn out, but I was proud of it.””: This is not a 'not this, but that' construction. It is a simple 'tired but proud' contrast, so the move is mislabeled.
- **notes**: “Periphrasis: “the sink that wouldn't stop dripping””: Swapping 'leaky' for a relative clause is hardly periphrasis worth teaching. Also, the 'building in threes' note cites a memorial service for a trivial list, which is a poor fit.

### obama / paris (f3 v2 s4 n3 n2)

_The rewrite mends the contradiction sensibly and reports it, but it changes "passport" to "pass" and adds "working it out". The voice is thin, and the move notes mislabel the lines and cite sources that do not fit._

- **fidelity**: “my brother lost his pass on the second day”: The writer said "passport". "Pass" changes the object, and "lost his pass" would not carry the sense of a passport and a trip to the embassy.
- **fidelity**: “working it out”: Added detail not in the draft. It invents an activity at the embassy and softens the writer's bare, deadpan statement.
- **voice**: “And the one time I was there, the rain came down the whole week”: The sentence is padded and "And the one time" repeats "only once". It sounds like generic casual prose, not Obama's cadence. The "whole week" rain is not a triad.
- **notes**: “Building in threes: “the rain came down the whole week, and my brother lost his pass on the second day.””: The quoted line has two items, not three, so the labelled move is inaccurate. Citing the Tucson memorial speech for a comic travel anecdote is not apt.
- **notes**: “From what happened to what we do”: This label does not describe the sentence. The line is a past-tense anecdote with no pivot to "what we do". The Weekly Address citation is misapplied.
- **notes**: “Plain talk to the listener: “To this day, he says it was the best vacation he ever had.””: The line does not address the listener. The citation is generic and the claim is weak. The notes also describe the sense mending only in part and name no joke alternative.
- **sense**: “I've only been to Paris once.”: The mending is reasonable and reported. It flattens the draft's possibly ironic contradiction, e.g. never having really seen Paris, only the embassy, and gives up the deadpan humor.
- **voice**: “To this day, he says it was the best vacation he ever had.”: This is the only Obama-like phrase, and it is stock. There is no characteristic reflective turn, wry self-aware humor, or rhythmic buildup, so the piece reads as lightly modernized prose.

### obama / relieved (f3 v3 s4 n3 n2)

_The rewrite keeps the core relief and the doubt, but it adds anger and a hopeful 'another chance' that the writer never had, and it softens the dread. The Obama voice is thin and relies on stock phrases, and the notes carry dubious citations and misquote the rewrite._

- **fidelity**: “It wasn't that I was angry with her; it's that I was relieved.”: Adds a new idea (anger) that the writer never raised. The writer said 'not upset', not 'not angry', and invents a contrast that was absent.
- **fidelity**: “I'd been carrying that dinner around all week”: Softens 'dreading'. Carrying is neutral and could suggest a burden or just keeping it in mind. The dread is lost, and so is the force of the confession.
- **fidelity**: “another evening, another chance to sit down together”: Adds warmth and a hopeful tone ('another chance') that the writer lacked. It sits oddly against the closing 'I don't think we will', and 'sit down together' invents detail.
- **fidelity**: “I told her it was fine, and that we'd find another time”: The writer's 'we'd do it another time' is changed to 'find another time', and the clause is restructured. A minor shift, but it makes the reassurance more eager.
- **voice**: “But here's the truth of it:”: Stacking 'Here's the thing' and 'here's the truth of it' within one short paragraph is a mechanical tic. Obama would not repeat such an opener so closely. The second also adds a needless gear shift.
- **voice**: “Here's the thing: when Dana called off our dinner”: 'Here's the thing' is a stock imitation phrase. The sentence is flat, with little of Obama's reflective cadence or self-deprecating humor.
- **notes**: “cites Weekly Address, 4 February 2012, ¶ 8”: Specific citations with paragraph numbers cannot be verified and look fabricated. A casual 'here's the thing' does not demonstrate a speech-specific move.
- **notes**: “One American’s story: “But here's the truth of it: I'd been carrying that dinner around all week, and I'm not proud of that.””: Mislabelled. This is a personal confession, not an 'American's story' illustration, and the weekly address cited is not apt.
- **notes**: “Building in threes: “I told her it was fine, and we'd find another time, another evening, another chance to sit down.””: The quoted line does not match the rewrite, which has 'and that we'd find... sit down together'. The citation to a firefighters' memorial service is irrelevant. The notes also report no changes to the meaning, such as the added anger and the hope.
- **natural**: “It wasn't that I was angry with her; it's that I was relieved.”: Redundant after 'I wasn't upset at all'. The sentence restates the same point and reads as padding.

### twain / breakup (f2 v3 s2 n2 n2)

_The rewrite pastes Huck Finn dialect over the passage and adds invented commentary, with some muddled sentences that read as garbled rather than as Twain. The notes cite one line twice with dubious sources and don't report the additions._

- **fidelity**: “There was no use in asking a person what a thing like that meant when he had been studying to say it at midnight, because a man don't take the trouble to say it at that hour unless it is a thing he can't keep shut of by daylight.”: Adds a whole invented reflection (Ryan had been 'studying' to say it, couldn't keep it shut by daylight). The writer never says this, and it also misrepresents the text message, since Ryan only texted that they needed to talk, not the breakup itself.
- **fidelity**: “there ain't any better comfort in this world when a body is feeling low, only a body keeps on feeling low just the same.”: Adds a new claim and a feeling, that ice cream is the best comfort but fails, which the writer didn't state. It changes the mood from a quiet, hurt beat to a wry generalization.
- **fidelity**: “she judged I was making too much of it”: The writer said the roommate 'thought I was overreacting' and the rewrite doubles it ('carrying on more than the case called for' and 'making too much of it'). The sentiment is repeated and the roommate is made gendered, which is an addition.
- **fidelity**: “busy with his telephone”: 'Scrolling' is turned into 'busy with', which loses the detail of scrolling. 'Sent me word' for 'texted' is a slight shift, since it implies a messenger.
- **natural**: “because a man don't take the trouble to say it at that hour unless it is a thing he can't keep shut of by daylight”: Garbled and hard to parse. 'Keep shut of' is an inverted idiom, and the logic is muddled. It also doesn't fit: the narrator is a woman using 'a man' as a generality.
- **natural**: “because that is about all a body can do when a man has took the trouble to tell her it is him”: The logic doesn't connect: why does telling her 'it is him' leave her nothing to do but nod? The 'took the trouble' phrase is reused from paragraph 1 and reads as a tic.
- **voice**: “he looked mighty nervous”: The Huck Finn dialect ('mighty', 'ain't', 'has took') is pasted over a modern woman's story, and the dialect is applied inconsistently, with 'coffee-house' and 'telephone' next to it. It reads as costume. Twain's own humorous essay voice would suit better than Huck's.
- **sense**: “which is a thing a person always says when it is him.”: The joke is a muddled tautology. The intended point, that 'it's not you, it's me' is a polite lie, isn't clearly delivered, and it risks reading as the opposite.
- **notes**: “cites Adventures of Huckleberry Finn, ch. 31, ¶ 50”: The same sentence is cited to two different sources for two labels (Huck ch. 31 and Roughing It ch. 7). The citations look arbitrary and unverifiable, and the moves named (cumulative sentence, deadpan) don't match the passages.
- **notes**: “Paragraph 4:
  (no notes)”: The notes omit the added reflection and the doubling in the last paragraph, and say nothing about the invented content, so they fail to teach what was changed.

### twain / camp-letter (f3 v3 s3 n3 n2)

_The rewrite has a pleasant Huck-style dialect but adds several invented details and intensifies feelings, and it introduces a one-canoe contradiction. The notes quote lines that are not in the rewrite, so they misreport the work and teach little._

- **fidelity**: “and never lets up the whole night long”: Adds a detail (the snoring never stops all night) that the writer did not state; it is embellishment beyond the original.
- **fidelity**: “and I would give a heap to know for sure”: Adds a strong wish to know that the writer did not express; the original only says "I'm not sure." This intensifies the feeling.
- **fidelity**: “till they call us in”: Invented detail: nobody calls them in in the original.
- **fidelity**: “so as a boy has something to eat betwixt meals”: Adds an explanatory purpose for the snacks that the writer did not give.
- **fidelity**: “every last one of them stood there and laughed fit to kill”: Original says "everybody laughed"; the standing there and laughing to kill is a mild exaggeration of degree.
- **fidelity**: “I tipped it clean over”: The writer said "flipped the canoe"; the rewrite's "the lot of us went out in the canoe" implies a single shared canoe, which is a change from the original and unclear.
- **fidelity**: “Yesterday the lot of us went out in the canoe”: The original just said "we went canoeing"; making it one canoe with everybody aboard conflicts with the rest of the sentence, where everyone stood there and laughed after the tip.
- **sense**: “went out in the canoe, and I tipped it clean over, and every last one of them stood there”: If the whole lot were in the one canoe, they could not be standing and laughing; this creates a contradiction the original did not have.
- **voice**: “I judge she likes me”: The tone is generic folksy dialect; a 'telephone' and 'advisers' used alongside dated words make the voice a patchwork. Twain's humor, with its specific comic similes and deadpan turns, is mostly absent. The piece is mostly dialect markers (reckon, ain't, betwixt).
- **natural**: “a few more of them little refreshments”: "Refreshments" is a stilted, mock-genteel word for snacks, and it does not sit with the otherwise Huck-like dialect.
- **natural**: “she is a right smart girl, and no mistake”: The original says she is "really cool"; "right smart" means clever, a shift in sense, and the "no mistake" tag is a filler cliché.
- **natural**: “she knows about as much about horses as any man could want to know”: Changes "a ton" into a slightly odd comparison; the sense is garbled and the "man" shifts the register.
- **form**: “Your loving son, Jake P.S. I wish you would not let Max have the use of my room whilst I am gone.”: The sign-off and P.S. are run onto one line, losing the letter's structure; the P.S. is also softened from "Please don't" to "I wish you would not."
- **fidelity**: “The advisers are a trifle strict, but mostly they are all right when you come to know them.”: Adds "when you come to know them," which is not in the original, and changes "counselors" to "advisers."
- **notes**: “The whole camp stood there and laughed fit to kill, which was a mortifying thing to a boy, and no mistake.”: The quoted text does not appear in the rewrite; the rewrite reads differently. The notes cite a line that is not the rewrite's, so they misreport the actual change.
- **notes**: “Could you send along a few more of them little refreshments, so as a boy has something to eat betwixt meals—and I don't know as I'd mind a bite now and then.”: The quoted clause about a bite now and then is not in the rewrite; the note misquotes. The 'exaggeration with a straight face' label does not match the content either.
- **notes**: “cites Adventures of Huckleberry Finn, “Chapter The Last”, ¶ 13”: The 'narrator's aside' label is odd for a first-person letter, and the citation is dubious. The notes also leave paragraph 1 with no notes and never mention the "charger for my telephone" change or the added details.
- **notes**: “Paragraph 1 (renders the writer’s ¶1):
  (no notes)”: The notes' paragraph numbering is off against the rewrite, and they report no sense or fidelity changes despite the additions, so they teach little.
- **voice**: “I clean forgot it when I was packing up”: The writer's "totally forgot" is rendered fine, but adding "when I was packing up" is an invented circumstance.

### twain / job-interview (f3 v3 s4 n3 n2)

_The rewrite keeps the facts and has a fair Huck-like flavor, but it adds feelings and details (the near-disbelief of the sister, the staff's attitude) and contains garbled phrasing like 'perfection kind of men'. The notes are weak: one quotes a sentence absent from the rewrite, and the citations look invented._

- **fidelity**: “she said it so cheerful that I almost believed her for a minute”: The writer shows no doubt about the sister's words. This invents a sceptical feeling and shifts the emotional tone from plain hope to near-disbelief.
- **fidelity**: “and they all acted as if that was the only sensible way a body could go through the day”: The writer says nothing of the staff's attitude. This adds a judgment and an incident-like detail beyond voice commentary.
- **fidelity**: “and told her how it had gone”: Adds an action (recounting the interview) that the draft does not state.
- **fidelity**: “and I knew it the minute it was out”: Adds a new beat of self-awareness. The writer only called the answer lame, in retrospect.
- **fidelity**: “The office was a big one”: Flattens 'huge' to 'big', so the emphasis is lost.
- **natural**: “I said I was what you might call one of them perfection kind of men”: 'perfection kind of men' is garbled. It is neither a natural dialect phrase nor a clear rendering of 'perfectionist'.
- **natural**: “as much at home as a cat in a strange garret, and as much out of place”: The simile already says 'out of place', so the tail is redundant. 'Garret' is also an odd setting for a cat that is meant to feel uneasy, and the clause is clumsy.
- **voice**: “she come after or know the reason why”: This is Huck's illiterate dialect ('come', 'was', 'give'). It is mixed with Twain's more polished narratorial wit and with modern content, so the voice wobbles between Huck and the essayist.
- **voice**: “went about sipping coffee that cost a good deal”: This is mild and generic rather than Twain's sharper, more specific exaggeration, so the satire of 'fancy coffee' is underplayed.
- **notes**: “It is a comfort, of course, that a man who is flat broke and out of a job has nothing left to lose but the rent, which is due in any case.”: This sentence is not in the rewrite. The note invents a quotation and mislabels it as a move, and the cited Connecticut Yankee passage is implausible.
- **notes**: “cites Adventures of Huckleberry Finn, ch. 28, ¶ 87”: The chapter and paragraph citations look fabricated or inapt. Chapter 28 concerns Mary Jane and the king and duke, not this kind of simile, and the other chapter and paragraph numbers are equally doubtful.
- **notes**: “[move] Cumulative sentence: “She asked me what my strong points was”: This note repeats the same sentence already cited under 'Deadpan'. It teaches little, and the Pudd'nhead Wilson source is questionable. The notes also do not mention the additions made to the text.

### twain / neighbors (f2 v3 s3 n2 n2)

_The rewrite catches the single-versus-mom contradiction and reports it, but it adds invented content (barn joke, 'showed her quality', cornered ending), alters facts (cakes, wagon), and the dialect is uneven. The notes' citations are dubious and incomplete._

- **fidelity**: “and has just found a single man with two young ones and his own ready-made family”: Adds an invented thought to the mother ('ready-made family' and a found single man). It also repeats the 'two kids' fact and goes beyond the writer's 'I knew exactly what she was thinking'.
- **fidelity**: “and me standing right there with no place to run to.”: Adds a feeling of dread and entrapment that the writer never stated. The writer's tone is wry, not cornered.
- **fidelity**: “and a body couldn't say for certain about her till she'd been there a week and showed her quality.”: Invents commentary and a judgement about the woman. It softens the writer's flat 'kind of standoffish' into a wait-and-see verdict.
- **fidelity**: “which they didn't try, I judge.”: Invents an incident about the barn, and the aside doesn't comment on anything the writer said. 'Huge truck' also becomes a wagon, an unflagged anachronism swap.
- **fidelity**: “she wanted the whole of it, and she got it, too, before the cakes was cold.”: Adds the fact that she succeeded, and how fast. The writer says only that she wanted to find out.
- **fidelity**: “pan of cakes”: Cookies become cakes. This is a small change of fact.
- **sense**: “but the grandmother, she's kind of offish”: The mend, making the woman a grandmother, is a reasonable repair. But it is a fresh invented person that the rest of the passage never supports, and the family is then described as 'a father and two little kids', which leaves her out. The mend is only half integrated.
- **natural**: “you couldn't of got it into the barn sideways”: The sentence is clumsy and muddled: a wagon in a barn sideways, then a joke about not trying. The follow-on aside reads as a non sequitur.
- **natural**: “A new family moved in next door the other day—a father and two little kids—and they come with a wagon”: It mixes tenses and dialect inconsistently ('moved in' and 'come'), with 'where they come from' beside 'they went to church'. The Huck dialect is patchy and sounds like an imitation.
- **voice**: “I judge is pretty nigh the same thing after the lawyers get done with it”: Huck-style 'I judge' is used three times, including for a lawyer joke that sounds more like Twain the essayist. The narrator's register wobbles between a Huck dialect and a sardonic adult.
- **notes**: “cites Adventures of Huckleberry Finn, ch. 15, ¶ 42”: The citations are suspiciously exact and probably not verifiable. They are attached to generic moves like 'vernacular voice' and 'deadpan' that don't match the quoted passage, and the same 'which they didn't try, I judge' is listed twice under different chapters.
- **notes**: “Sense: Your passage gives the family a mother who is standoffish”: The notes don't flag the other changes: wagon for truck, cakes for cookies, the invented ending, the 'show her quality' line. They also omit the Pride and Prejudice echo.

### twain / party (f3 v3 s3 n3 n2)

_The rewrite keeps the plot but adds a muddled claim ('the whole shebang had nothing to it'). The voice is thin, mostly 'and... ; and...' chaining plus dialect pasted onto a modern setting. The notes misquote the rewrite and give vague labels with questionable citations._

- **fidelity**: “and the whole shebang had nothing to it”: Adds a claim not in the original. The writer only said Chris was rude, not that the party had nothing to it. It also muddles whose opinion this is, since it reads as the narrator agreeing the party was lame.
- **fidelity**: “I judged he was rude”: Meaning is kept, but 'I judged' is stiffer than the writer's flat 'I thought'. More importantly, the 'But later' contrast is weakened by merging the clauses.
- **fidelity**: “a tall guy came over”: The notes quote 'tall fellow', but the rewrite says 'guy'. 'Guy' is modern and out of voice.
- **notes**: ““and by and by a tall fellow came over and commenced talking to us””: The notes quote text that differs from the rewrite, which has 'tall guy' and a different clause structure. This misreports the actual change.
- **notes**: “cites Adventures of Huckleberry Finn, ch. 18, ¶ 1”: 'Ironic verdict' is a vague label. The line 'kind of arrogant, only he was funny, too' is a plain restatement, not irony. The citations look arbitrary and the teaching value is low.
- **notes**: ““He said the party was lame and the people were dull.” — cites Adventures of Huckleberry Finn, ch. 30, ¶ 45”: The rewrite has 'and Emma rolled her eyes' attached to this sentence, so the quoted sentence is not what appears. 'Deadpan' is a weak label for a plain report. The cited paragraph looks implausible.
- **notes**: “Paragraph 1 (renders the writer’s ¶1):
  (no notes)”: Several moves go unreported there: the semicolon chaining, 'a body couldn't hear himself think', and the dropped 'super'. The paragraph is also heavily changed.
- **voice**: “and the music was going so loud a body couldn't hear himself think”: 'A body' is apt, but the stock phrase is cliché and the added 'hear himself think' is an embellishment. The sentence has no Twainian comic exaggeration or specific detail.
- **voice**: “I seen him helping clean up; and I says to myself, maybe I was wrong about him.”: Mixes Huck-style dialect ('I seen', 'I says') with the otherwise standard narration ('commenced', 'by and by'). Dialect is applied only at the end, and a girl narrator at a modern party in Huck's dialect is incongruous. 'I says to myself' is also an addition.
- **natural**: “he was kind of arrogant, only he was funny, too”: 'Kind of' and 'only' are a clumsy mix. It remains modern prose with 'and' and ';' glue and no real Twain wit.
- **voice**: “Everyone from school was there... lame”: 'Lame' stays modern slang inside a pseudo-19th-century register. It is a jarring anachronism, though it may be kept as the character's quoted word.
- **form**: “But along towards the end, when everybody else had cleared out”: The original's single paragraph was split into two, which is unnecessary. The 'later' and 'when everyone else left' logic is kept, but the structure was changed for no good reason.

### twain / store (f2 v3 s3 n2 n2)

_The rewrite has some Huck Finn flavor, but it invents incidents and feelings (wishing he hadn't come, turning away, the crowd, the wagon), and one simile is garbled. Its notes misquote the rewrite and give doubtful citations._

- **fidelity**: “and I wished I hadn't come, and I turned away a little, but the crowd wouldn't give.”: Adds invented incidents and feelings: wishing he hadn't come, turning away, the crowd blocking him. The writer said only that he panicked.
- **fidelity**: “and it wasn't the milk that made it so.”: Adds a new commentary clause that is not in the original. It is more than the voice's gloss on what is there and reads as an invented point.
- **fidelity**: “with the wagon”: Invents a wagon. The writer said "drove", and a wagon is anachronistic beside telephones and an ex at a checkout.
- **fidelity**: “a guy with a cap pulled down”: The writer's hoodie became a cap. It is a changed detail, and the notes do not report it.
- **fidelity**: “I saw my ex up at the counter and I wished”: "Basically panicked" is replaced by a milder, vaguer reaction, so the degree of feeling changes. "Checkout" also becomes "counter".
- **fidelity**: “and she looked me over and said, "long time no see—you look great."”: Adds a gesture, "looked me over", that the writer did not give. It also merges her two separate lines into one.
- **natural**: “talking into his telephone the way a man will talk who has got something the telephone wants to hear about”: A garbled, riddling simile that does not make sense, and its comic point is muddy.
- **natural**: “"Hey," she says, and she looked me over and said”: Tense shifts from present "says" to past "looked" and "said" in one sentence. Later it shifts again to "I says", which is sloppy dialect.
- **voice**: “a guy with a cap pulled down”: "Guy", "ex", "checkout" and "awkward" are modern words that sit awkwardly against the Huck-like dialect, so the result is a patchwork of voices.
- **voice**: “most awkward ten minutes I have put in all this week”: This is a mix of Huck's dialect with a more polished Twain narrator. "Honest" and "I have put in" are not wholly consistent with it.
- **notes**: ““I grabbed up my keys and struck out for the store, and took the wagon, and was there in no flat time.” — cites Adventures of Huckleberry Finn, ch. 18, ¶ 79”: The quoted text does not match the rewrite, which says "with the wagon" and has no "took the wagon". Citations to specific paragraph numbers look fabricated and unverifiable.
- **notes**: ““He never so much as looked at me, and went right on talking, and I judged he would have talked till morning if the telephone would have stood it.””: The quoted line differs from the rewrite, which has "went right on with his talk" and "the instrument". The notes misreport the text.
- **notes**: “cites Pudd’nhead Wilson, ch. 20, ¶ 38”: Cites a different book for the ironic verdict. The notes also do not mention the added invented content or the cap-for-hoodie change, and they teach little.

### twain / email (f3 v2 s4 n3 n2)

_The rewrite keeps the email's basic facts and structure, but it adds two invented justifications and uses a thin, inconsistent dialect that is not truly Twain. The notes mislabel the moves and the citations look dubious._

- **fidelity**: “every last one of them, mind, for a deck with a page missing is no deck at all.”: Adds a new claim and an emphasis the writer never made. It goes beyond commentary and turns the plain request into an insistence on completeness.
- **fidelity**: “for tomorrow’s too late to mend it.”: Adds a rationale (tomorrow is too late to fix it) that Sam did not give. It also raises the urgency beyond the original.
- **fidelity**: “I ain’t for shipping without it.”: Softens Sam's 'I don't want us shipping without it', which includes the team. The 'for' construction also shifts the tone toward a stance or vote.
- **voice**: “Quick word: the launching is moved from Tuesday over to Thursday.”: This is a mild, generic folksy tweak. 'The launching' is awkward and not distinctively Twain. The mix of 'ain't' with 'Please have your sections of the deck' and 'Thanks, Sam' is inconsistent, like costume dialect on a modern email.
- **voice**: “The lawyers ain’t yet set their hand to the pricing page”: 'Set their hand to' is archaic and legalistic rather than Twain's vernacular. Twain would be more vivid or humorous about lawyers. The word order is stilted, and there is little real Twain wit.
- **natural**: “tell me to-day, not tomorrow—for tomorrow’s too late to mend it.”: 'to-day' is hyphenated while 'tomorrow' is not, which is inconsistent. 'Too late to mend it' has a vague referent. The double 'for' clauses with em-dashes repeat the same structure.
- **notes**: “cites Adventures of Huckleberry Finn, ch. 33, ¶ 53”: The cited passages do not plausibly exemplify the moves named. A 'vernacular voice' note on a plain statement is vague, and the specific paragraph citations look unreliable or fabricated.
- **notes**: “Cumulative sentence: “The lawyers ain’t yet set their hand to the pricing page, and I ain’t for shipping without it.””: This is a simple compound sentence, not a cumulative one. The note mislabels it, and the cited source (ch. 1, ¶ 2) does not teach the move.
- **notes**: “The narrator’s aside: “If you’re blocked, tell me to-day, not tomorrow—for tomorrow’s too late to mend it.””: This is not an aside by a narrator. It is an added justification, and the note does not report that content was added.
- **notes**: “Ironic verdict: “Please have your sections of the deck done by Wednesday noon—every last one of them, mind, for a deck with a page missing is no deck at all.””: Calling this an 'ironic verdict' is inaccurate, because it is a sincere maxim. The note also does not flag the invented content. Notes are given per paragraph, with empty entries for paragraphs 1 and 4 and no mention of the greeting or sign-off changes.
- **form**: “Thanks, Sam”: The sign-off is collapsed onto one line, losing the original's line break and structure. The 'Hi, team,' comma is also added.

### twain / list (f3 v2 s4 n3 n2)

_The rewrite keeps the facts but is nearly a straight paraphrase with a few dialect markers. It dilutes 'exhausted' and 'weirdly proud', and adds almost no Twain wit. The notes cite precise sources for moves that are generic or absent from the text, and one quoted phrase ('strangely proud') does not appear in the rewrite._

- **fidelity**: “tired out, but very proud of myself”: The writer said 'exhausted' and 'weirdly proud'. 'Tired out' weakens the exhaustion and 'very' drops the 'weirdly', so the odd, self-surprised quality of the pride is lost.
- **notes**: ““but strangely proud of myself” — cites The Innocents Abroad, ch. 67, ¶ 44”: The note quotes words that are not in the rewrite, which says 'very proud'. It also calls this exaggeration, but nothing is exaggerated. The citation looks invented.
- **notes**: “Deadpan: “that talked a solid hour about her neighbor's cat” — cites Adventures of Huckleberry Finn, ch. 33, ¶ 24”: The note claims a precise source for a move that is a plain restatement. 'A solid hour' keeps the writer's 'an hour' with a mild intensifier. The precise paragraph citations look fabricated and teach little.
- **notes**: “Cumulative sentence: “I cleaned out the gutters, and fixed the leaky sink, and called up my grandmother” — cites The Adventures of Tom Sawyer, ch. 29, ¶ 1”: Polysyndeton is a generic device. Tying it to a specific Tom Sawyer paragraph is dubious, and the note does not explain what it teaches.
- **voice**: “Things I done Saturday: I cleaned out the gutters”: Dialect is applied inconsistently: 'done' is Huck-like, but 'I cleaned', 'called up' and 'tired out' are standard. Huck's vernacular is also not really Twain's own narrative voice. The result is a thin costume with no Twain humor, such as a wry aside, a mock-grave comparison, or a deflating turn on the grandmother or the pride.
- **voice**: “By evening I was tired out, but very proud of myself.”: The sentence is flat modern prose. It has no Twainian commentary or ironic framing, so the rewrite barely shows the writer's passage as Twain would have written it.
- **natural**: “called up my grandmother, that talked a solid hour”: Using 'that' as a relative pronoun for a person is a dialect touch that clashes with the otherwise standard narration. 'Things I done' also sits oddly against 'I cleaned'.
- **form**: “By evening I was tired out”: The writer's two paragraphs are merged into one, which the note acknowledges. The writer's paragraph break, which set off the closing feeling, is lost for no clear gain.

### twain / paris (f2 v3 s3 n3 n2)

_The rewrite catches the contradiction and has a few Twainish touches, but it invents an opinion, a new passport and a 'that was enough' verdict, and it garbles one joke. The notes are weak: the citations look dubious and the added content is not reported._

- **fidelity**: “I judge it was the best part of the trip, for there is one place to sit and nothing to lose, which is more than the streets could say.”: Adds a new claim: the narrator says the embassy was the best part, which the writer never said. It is an invented opinion, not commentary on what is there, and it muddles the brother's 'best vacation' point.
- **fidelity**: “and that was enough.”: Invents a feeling (the narrator's verdict on Paris) that the draft lacks.
- **fidelity**: “and a new passport into the bargain”: Invents an incident: the passport being replaced is never stated in the draft.
- **fidelity**: “as if it meant to wash the town clean and hadn't the strength for it”: Adds a figurative embellishment that is not in the draft. It is voice commentary, but it makes the rain feel less relentless than 'the whole week'.
- **fidelity**: “and after that we saw the inside of the embassy more than Paris itself.”: Moves the embassy fact into paragraph 1 and then repeats it in paragraph 2 ('We spent most of the trip at the embassy'), restructuring and duplicating the content.
- **sense**: “I've only been to Paris once, and that was enough.”: The contradiction is mended by dropping 'never', which is acceptable, but it discards the possible joke reading (never saw Paris, only the embassy). The mending also contradicts the draft's 'the last time I was there', which implies several visits.
- **notes**: “The opening sentence says the narrator has never been to Paris, while sentence 2 says she was there”: Assumes the narrator is female; nothing in the draft says so. The note also does not mention the added 'that was enough'.
- **notes**: “cites Adventures of Huckleberry Finn, ch. 15, ¶ 34”: The cited source is dubious and precise paragraph numbers look fabricated. The Pudd'nhead Wilson and Roughing It citations are likewise unlikely to support the claimed moves.
- **notes**: “Sentence 2 says the passport was lost on the second day, and sentence 3 says most of the trip was spent at the embassy”: The sense note claims a repair for something that was not a fault. It also does not report the additions: the 'best part' opinion and the new passport.
- **voice**: “and my brother, he lost his passport”: The doubled subject ('my brother, he') is a crude imitation of dialect. Twain's narrator voice is more often wry and periodic; the phrase reads as a costume, and 'But my brother, he still says' repeats the tic.
- **natural**: “there is one place to sit and nothing to lose, which is more than the streets could say.”: The logic is strained: the streets 'saying' they have nothing to lose is a muddled joke. The sentence reads as a garbled aside.

### twain / relieved (f4 v3 s5 n3 n2)

_The facts and the feeling (relief, dread, doubt) are all kept. The Twain is thin: a few dialect tags on plain prose, with no real wit or cadence. The notes use mislabeled moves and arbitrary-looking citations, and they teach little._

- **fidelity**: “I wasn't a bit put out about it—not a bit.”: The writer's 'wasn't upset at all' is rendered with doubled emphasis. It slightly overstates the denial and adds a protesting tone that was not in the original, though the direction of feeling is kept.
- **fidelity**: “we'd make it up some other time”: 'Make it up' normally means to compensate or reconcile. The writer meant only 'do it another time', so the sense drifts.
- **fidelity**: “I'm not proud of that, neither.”: The sense is kept, but 'neither' after a positive clause is a clumsy grafting of dialect. The original had no negative before it for 'neither' to follow.
- **voice**: “and that's the plain truth of it;”: This is a generic folksy filler, not Twain's characteristic wit. The rewrite adds no humor, no exaggeration and no comic comparison. It reads as light dialect dressing on modern prose.
- **voice**: “But I don't judge we will.”: The Huck-style 'I judge' is apt dialect, but the passage mixes Huck's register with a more standard narrator. 'Called our dinner off' and 'put out' are mild and uneven. The 'But' also adds a contrast the original lacked.
- **natural**: “I don't judge we will.”: 'Don't judge' reads ambiguously, as 'don't pass judgment', and so is mildly confusing. Twain usually wrote 'I reckon we won't' or 'I judge we won't'.
- **form**: “I told her it was fine, and we'd make it up some other time. But I don't judge we will.”: The writer's two paragraphs are merged into one. The note admits the merge, but it removes the beat of the short closing paragraph.
- **notes**: “Cumulative sentence: “I'd been dreading it the whole week, and I'm not proud of that, neither.””: The label does not fit. This is a plain compound sentence with a dialect tag. The cited source cannot be confirmed as apt.
- **notes**: “Vernacular voice: “I told her it was fine, and we'd make it up some other time.””: This line is nearly standard English, so it is not a vernacular move. The citation to Huck Finn ch. 15 looks arbitrary. The notes also repeat the same label and give no teaching about what changed from the original.
- **notes**: “Deadpan: “When Dana called our dinner off I wasn't a bit put out about it—not a bit.””: 'Deadpan' is a poor name for an emphatic, repeated denial. The Connecticut Yankee citation for the 'narrator's aside' is a weak match for a stock phrase.
