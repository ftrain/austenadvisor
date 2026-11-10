# Voices evaluation: sonnet

24 rewrites (4 voices × 6 cases), judged by openai/gpt-5.6-terra. Judge scores 1–5; engine score 0–100 against the voice's corpus; never-used is words left in the rewrite that the voice never used.

## By voice

| | fidelity | voice | sense | natural | notes | teaching | structure | mean | engine score | never-used | time | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jane Austen | 4.0 | 3.5 | 4.5 | 4.0 | 3.0 | 3.5 | 5.0 | 3.9 | 94.5 | 0.0 | 29s | 4 |
| The King James Bible | 3.0 | 3.0 | 3.0 | 2.0 | 2.0 | 3.0 | 4.0 | 2.9 | 80.0 | 4.0 | 28s | 3 |
| Barack Obama | – | – | – | – | – | – | – | – | 66.0 | 0.0 | 18s | 5 |
| Mark Twain | – | – | – | – | – | – | – | – | – | – | 17s | 6 |
| **All** | 3.7 | 3.3 | 4.0 | 3.3 | 2.7 | 3.3 | 4.7 | 3.6 | 82.5 | 2.0 | 23s | 18 |

## By case

| | fidelity | voice | sense | natural | notes | teaching | structure | mean | engine score | never-used | time | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| breakup | – | – | – | – | – | – | – | – | – | – | 20s | 4 |
| neighbors | – | – | – | – | – | – | – | – | 97.0 | 2.0 | 27s | 3 |
| email | – | – | – | – | – | – | – | – | – | – | 19s | 4 |
| oped | 3.0 | 3.0 | 3.0 | 2.0 | 2.0 | 3.0 | 4.0 | 2.9 | 66.0 | 4.0 | 26s | 2 |
| pitch | 3.0 | 4.0 | 4.0 | 4.0 | 2.0 | 4.0 | 5.0 | 3.7 | 86.5 | 1.0 | 27s | 2 |
| relieved | 5.0 | 3.0 | 5.0 | 4.0 | 4.0 | 3.0 | 5.0 | 4.1 | 93.0 | 0.0 | 20s | 3 |

## Faults

### austen / pitch (f3 v4 s4 n4 n2 t4 s5)

_The rewrite is a credible Austen-flavoured proposal with a sound argumentative order, but it loses the engineer detail and slightly overstates the client and risk objections. Its notes are too thin and do not adequately support their source claim or disclose consequential wording changes._

- **fidelity**: ““the ablest hand among us has but lately left us””: This drops the specific fact that the departing employee was “our best engineer.” “Hand” makes the person a generic worker and loses the professional role, which matters in an argument about staffing and hiring.
- **fidelity**: ““the scheme is a dangerous one””: “Risky” is recast as “dangerous,” which is appreciably stronger and makes the speaker’s concession more alarming than the writer’s.
- **fidelity**: ““those whom we serve may be very little disposed to approve it””: The original says clients “might not like it.” “Very little disposed to approve” heightens the anticipated opposition and substitutes formal approval for the simpler issue of client preference.
- **natural**: ““the ablest hand among us””: Though “hand” can mean worker, this phrasing sounds more like generalized labour or domestic service than a natural Austenian equivalent for an engineer in a colleague-facing proposal; it also contributes to the loss of the original’s specificity.
- **notes**: ““Clauses balanced in one period ... — cites Northanger Abbey, ch. 1, ¶ 1””: The note does not explain how the cited opening of Northanger Abbey specifically supports this claimed syntactic move. It gives no apt parallel phrase or sentence from the source, so the citation is too vague to verify or teach from.
- **notes**: ““A speaker who opens with an opinion in Austen usually shows some confidence in it.””: This is an unsupported generalization about Austen, and the stated “liberty” is not clearly a liberty requiring defense. “I think” already expresses an opinion; “I have reasons ... not inconsiderable” is permissible tonal commentary, but the note should identify the actual rhetorical expansion and its effect instead.
- **notes**: ““Paragraph 2: (no notes)””: The second paragraph contains major Austen-like rhetorical changes—especially “I am not insensible,” the intensified “dangerous,” and the concession-before-proposal construction—but provides no source-based explanation or disclosure of the two fidelity shifts.

### austen / relieved (f5 v3 s5 n4 n4 t3 s5)

_The rewrite preserves all events, feelings, and their order, and its compressed three-sentence structure works well. Its Austen effect is competent but somewhat generalized, while the teaching material contains several factual and analytical inaccuracies that weaken its usefulness._

- **voice**: “I must confess, in all honesty”: The two confession-markers are redundant, and “in all honesty” has a comparatively modern, generic sound. Austen commonly gets this effect through a single precise concession or a cooler narratorial qualification, rather than stacking sincerity signals.
- **natural**: “I had dreaded the evening the whole week together”: “The whole week together” is an awkward intensifier in this context. It can mean an uninterrupted span of time, but attached to “dreaded” it sounds more like period-flavoured wording than a natural sentence; “all the week” would be cleaner and more idiomatic.
- **notes**: “A small parenthetical of confession carries the writer's 'Honestly'”: The note calls the phrase a “parenthetical,” but it is not functioning as a detachable parenthesis in the sentence; it is an integrated adverbial qualification. The note should identify the actual move more accurately: replacing direct modern emphasis with a formal self-conscious confession.
- **notes**: “Your draft is three-to-twelve-word sentences in modern speech”: This inaccurately describes the draft. Its sentence lengths are not three to twelve words: “I’d been dreading it all week, and I’m not proud of that” is twelve words, while “Honestly, I was relieved” is four. More importantly, length alone does not establish “modern speech.”
- **notes**: “Austen would hold the same facts in two long periods”: The rewrite itself has three sentences, not two periods: the first paragraph contains two sentences and the second contains one. The lesson therefore misstates its own demonstration.
- **notes**: “the civil words reported, not quoted”: The writer already reported the speech indirectly: “I told her it was fine.” This is not a change the rewrite teaches. The useful lesson is instead the substitution of a more ceremonious civil formula (“of no consequence”) and the placement of the private reservation after it.

### kjv / oped (f3 v3 s3 n2 n2 t3 s4)

_The rewrite preserves the argument’s overall sequence, but it weakens a material claim and contains several unidiomatic pseudo-biblical constructions. Its notes and lesson identify some surface devices, yet their textual support and advice are too loose for a teaching tool._

- **fidelity**: “their shops do better than they did aforetime”: This weakens “doing better than ever.” “Better than ever” makes a superlative claim over all previous time; “better than they did aforetime” merely compares present performance with some earlier period.
- **fidelity**: “For to set our cars in the midst of the town is grievous”: This only loosely renders “Parking downtown is a nightmare.” “Grievous” means burdensome or sorrowful and loses the specific practical difficulty and emphatic frustration conveyed by “a nightmare.”
- **natural**: “shut Main Street unto the cars”: “Unto” does not idiomatically express exclusion here. It sounds as though the street is being shut toward the cars, rather than closed against their access. A biblical-sounding construction would need a clearer preposition or recasting.
- **natural**: “the sidewalks thereof are too narrow for the strollers”: “Strollers” is conspicuously modern in its likely intended sense of pushchairs, while in an older register it can also mean people who stroll. The phrase consequently sounds both anachronistic and slightly unclear.
- **natural**: “Let us therefore try it in this summer”: “In this summer” is not idiomatic English and does not sound like natural King James diction. The original’s “this summer” should remain direct, or be recast idiomatically without the intrusive “in.”
- **voice**: “Wherefore the town of our habitation ought to shut Main Street unto the cars on the weekends”: The sentence accumulates biblical-looking markers rather than achieving King James syntax. “Wherefore” has no preceding consequence to refer back to, “town of our habitation” is inflated for “our town,” and “on the weekends” remains conspicuously modern beside the archaisms.
- **notes**: “Unto, thereof, wherefore: “Wherefore the town of our habitation ought to shut Main Street unto the cars on the weekends.” — cites Ezekiel 44:2”: Ezekiel 44:2 concerns a gate that “shall be shut” and does not substantiate this composite wording, especially “wherefore,” “unto,” or “town of our habitation.” The citation makes the move sound more textually grounded than it is.
- **notes**: “Verily stands for the writer's 'Honestly', an oath of plain speaking”: “Verily” is an affirmation of truth, not an “oath.” The note’s explanation is inaccurate and does not teach the distinction between an evidentiary assertion and the writer’s conversational emphasis.
- **notes**: “Paragraph 3: (no notes)”: The rewrite changes “this summer” to “in this summer,” a conspicuous and unsuccessful alteration. Even if no liberty was intended, this departure should have been avoided or accounted for.
- **notes**: “The Bible lays down the thing to be done before the reasons, as a law is given before its cause.”: This is an overly broad claim about biblical structure, not a demonstrated feature of the cited or imitated passages. It gives the writer a rule that is too sweeping to use reliably.
- **teaching**: “opening with a connective”: The lesson recommends a device that the rewrite mishandles: opening this self-contained proposal with “Wherefore” falsely implies an already stated premise. It does not explain when a connective is warranted, so the transferable advice risks producing more faulty openings.
- **teaching**: “so the argument reads as one road and not as separate stones”: This is evocative but generic. Apart from conjunctions, the lesson offers no concrete revision method for preserving emphasis, handling the objection, or retaining a phrase’s exact force, as the lost force of “better than ever” demonstrates.

- ERROR austen/breakup: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR austen/neighbors: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR austen/email: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR austen/oped: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR kjv/breakup: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR kjv/email: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR kjv/relieved: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/breakup: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/neighbors: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/email: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/pitch: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/relieved: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/breakup: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/neighbors: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/email: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/oped: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/pitch: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/relieved: The writer (anthropic/claude-sonnet-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.