# Voices evaluation: opus

24 rewrites (4 voices × 6 cases), judged by openai/gpt-5.6-terra. Judge scores 1–5; engine score 0–100 against the voice's corpus; never-used is words left in the rewrite that the voice never used.

## By voice

| | fidelity | voice | sense | natural | notes | teaching | structure | mean | engine score | never-used | time | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jane Austen | 3.5 | 3.5 | 4.5 | 4.0 | 2.5 | 3.5 | 5.0 | 3.8 | 94.0 | 0.3 | 31s | 3 |
| The King James Bible | 4.0 | 3.0 | 4.0 | 3.0 | 2.0 | 3.0 | 5.0 | 3.4 | 81.0 | 2.0 | 21s | 5 |
| Barack Obama | – | – | – | – | – | – | – | – | – | – | 17s | 6 |
| Mark Twain | – | – | – | – | – | – | – | – | – | – | 18s | 6 |
| **All** | 3.7 | 3.3 | 4.3 | 3.7 | 2.3 | 3.3 | 5.0 | 3.7 | 90.8 | 0.8 | 21s | 20 |

## By case

| | fidelity | voice | sense | natural | notes | teaching | structure | mean | engine score | never-used | time | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| breakup | – | – | – | – | – | – | – | – | 95.0 | 1.0 | 23s | 3 |
| neighbors | – | – | – | – | – | – | – | – | – | – | 22s | 4 |
| email | 3.5 | 3.0 | 4.0 | 3.0 | 2.0 | 3.0 | 5.0 | 3.4 | 87.5 | 1.0 | 25s | 2 |
| oped | – | – | – | – | – | – | – | – | – | – | 19s | 4 |
| pitch | – | – | – | – | – | – | – | – | – | – | 18s | 4 |
| relieved | 4.0 | 4.0 | 5.0 | 5.0 | 3.0 | 4.0 | 5.0 | 4.3 | 93.0 | 0.0 | 20s | 3 |

## Faults

### austen / email (f3 v3 s4 n3 n2 t3 s5)

_The rewrite preserves the essential schedule, approval dependency, deadline, and escalation instruction, and its overall email order is sound. Its main weaknesses are vague period substitutions for concrete workplace objects, only moderately convincing Austen diction, and notes that are inaccurately located and insufficiently supported._

- **fidelity**: “our undertaking is put off from Tuesday to Thursday”: “Undertaking” can cover a project, but it does not specifically retain that the delayed event is a launch. The original’s operational fact is made more general.
- **fidelity**: “the paper of terms”: A “pricing page” is reduced to a vague “paper of terms.” Pricing is not necessarily equivalent to contractual terms, and “page” is not retained.
- **fidelity**: “have your several parts of the papers finished”: “Sections of the deck” means portions of a presentation; “parts of the papers” is broader and can suggest documents generally. This loses a concrete work-email fact.
- **voice**: “the lawyers have not yet given their approval to the paper of terms”: The phrasing is generically old-fashioned rather than distinctly Austenian. “Paper of terms” sounds like a costume-period substitution, not the precise social or domestic language characteristic of her letters and novels.
- **natural**: “send anything abroad without it”: Though historically intelligible as sending something out for publication or circulation, it is an awkward equivalent for shipping a launch in this workplace context. “Anything” also makes the intended product or launch oddly indefinite.
- **natural**: “our undertaking is put off”: The passive phrasing is intelligible, but it makes an ordinary scheduling update sound ceremonious enough to risk unintended comedy in a team email.
- **notes**: “Paragraph 3:”: The cited rewrite sentence beginning “I must beg you” appears in the second body paragraph, not paragraph 3. The note’s location is inaccurate.
- **notes**: “cites Mansfield Park, ch. 43, ¶ 2”: A chapter-and-paragraph citation is not reliably verifiable across editions, and the note does not identify a comparable Austen sentence or explain what exact syntactic feature the source demonstrates.
- **notes**: “cites Emma, ch. 14, ¶ 13”: As with the other citation, the paragraph reference is edition-dependent and the note gives no quoted source passage. It therefore does little to establish that the claimed litotic move is specifically Austen’s.
- **notes**: “The voice says that outright”: The liberty note overstates the change: “when the knowledge of it could be of no very great use” is an indirect implication, not a statement outright that tomorrow is too late. It also does not acknowledge the shift from a direct operational instruction to a more diffuse formulation.
- **teaching**: “Your email gives its news in short, separate bursts.”: This inaccurately characterizes the draft. Its first sentence already combines the schedule change with the reason that Legal has not signed off, and its second sentence combines the deadline with the reporting instruction. The lesson starts from a faulty diagnosis.
- **teaching**: “Practise ending a request on understatement”: This is a usable exercise, but it does not warn that understatement can weaken clarity in a work email with a real deadline. It also does not teach how to preserve concrete nouns such as “pricing page” and “deck” while borrowing Austen’s sentence shape.
- **form**: “a plain salutation to the whole party; why: Her letters always open by naming whom they address.”: “Always” is too absolute, and “My dear friends” is not a plain team salutation. The structural explanation is therefore both overgeneralized and imprecise.

### austen / relieved (f4 v4 s5 n5 n3 t4 s5)

_The rewrite is clear, faithful in feeling, and convincingly Austen-like in its balanced reserve. Its principal defect is the unnecessary invented detail of Dana “sent[ing] word,” compounded by notes that defend rather than flag the liberty._

- **fidelity**: “When Dana sent word that our dinner could not take place”: “Sent word” specifies a mode of cancellation that the original does not supply. It is a small invention, but the brief explicitly permits additions only as voice-commentary or reported repairs to faults of sense; there was no such fault to repair.
- **notes**: “In her world an engagement is put off by a note or a message, so I named it plainly and added no other detail.”: This note acknowledges an unsupported addition but mislabels it as a harmless clarification. The original already states the relevant fact—Dana cancelled—and does not require a mode of communication. “Her world” is also unclear: it could mean Dana’s world or Austen’s.
- **notes**: “cites Pride and Prejudice, ch. 52, ¶ 5”: The citation is not readily verifiable because paragraph numbering varies by edition, and the note does not identify an edition or quote the Austen passage that supposedly supplies the move. A chapter citation would be more useful with a short source quotation or a stable edition reference.
- **notes**: “cites Northanger Abbey, ch. 21, ¶ 9”: As with the first citation, the paragraph reference is edition-dependent and does not show what particular Austen syntax or passage is being borrowed. The reported-speech move is accurately named, but the sourcing is not sufficiently precise for teaching use.
- **teaching**: “Your draft gives each feeling its own short sentence”: This slightly misdescribes the draft: “I'd been dreading it all week, and I'm not proud of that” joins dread and shame in one sentence. The useful lesson about consolidation would be stronger if it identified the actual pattern—three short units of reaction—rather than overstating it.

### kjv / email (f4 v3 s4 n3 n2 t3 s5)

_The rewrite preserves the email’s essential facts, sequence, requests, and form, and its broad biblical-epistolary manner is serviceable. Its weakest aspect is the instructional apparatus: several claimed sources are wrong or poorly matched, and the lesson inaccurately diagnoses the original’s structure._

- **voice**: “Behold, I make known unto you in few words”: This is a generalized biblical pastiche rather than a strongly KJV-shaped epistolary opening. KJV epistles more characteristically use formulas such as “I would not have you ignorant,” “I certify you,” or “I would have you know,” rather than this assembled phrasing.
- **natural**: “I give you thanks.”: This is not idiomatic KJV wording for a closing. The KJV commonly has “I thank my God,” “we give thanks,” or a benediction; “I give you thanks” sounds like a literal modern-English substitution and is faintly awkward.
- **fidelity**: “the lawyers have not yet given their word upon the pricing page”: “Legal” is rendered as “the lawyers,” which is plausible, but “given their word” is less exact than having “signed off”: it can mean merely offering an opinion or promise rather than formally approving the page.
- **fidelity**: “I will not that we send forth the work without it”: “It” has a potentially unstable antecedent: grammatically it may refer to “the pricing page” rather than Legal’s approval. The source specifically says Sam does not want shipping without Legal’s sign-off.
- **notes**: ““Behold, I make known unto you in few words, that the launch shall not be on Tuesday, but on Thursday.” — cites Galatians 1:20”: The citation is inapt. Galatians 1:20 reads, “Now the things which I write unto you, behold, before God, I lie not”; it does not support “make known unto you” or “in few words.”
- **notes**: “Behold, lo, verily”: The note lists “lo” and “verily,” but neither occurs in the quoted rewrite. It therefore does not accurately name the actual move.
- **notes**: ““Wherefore let every one of you finish his part of the deck by Wednesday at noon” — cites 1 Samuel 30:24”: 1 Samuel 30:24 contains “as his part is that goeth down to the battle, so shall his part be that tarrieth by the stuff,” not a comparable “Wherefore let every one...” exhortation. The citation does not substantiate the claimed syntax.
- **notes**: ““and if ye be hindered in any thing, tell me this day, and tarry not until the morrow.” — cites Judges 6:18”: Judges 6:18 says “Depart not hence, I pray thee, until I come unto thee,” and is not a good source for the stated paratactic pattern or the wording “tarry ... until the morrow.”
- **notes**: ““if ye be hindered” — cites Luke 11:52”: Luke 11:52 does not illustrate this second-person passive form; it concerns lawyers taking away “the key of knowledge.” The source attribution is inaccurate.
- **teaching**: “Your email is a string of short, separate orders.”: This misdescribes the original. Its launch news and reason are already joined in one sentence, and its two requests are organized as a deadline followed by a contingency. The lesson should identify a real stylistic opportunity rather than characterize the draft unfairly.
- **teaching**: ““Wherefore let every one of you” makes the deadlines the natural result of the delay”: The lesson overstates the logical relation. The delayed launch may make the Wednesday deadline sensible, but the source does not explicitly present the deck deadline as a consequence of the legal delay. This teaches connective rhetoric at the cost of slightly inventing the argument.

- ERROR austen/neighbors: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR austen/oped: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR austen/pitch: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR kjv/breakup: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR kjv/neighbors: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR kjv/oped: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR kjv/pitch: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR kjv/relieved: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/breakup: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/neighbors: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/email: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/oped: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/pitch: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR obama/relieved: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/breakup: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/neighbors: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/email: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/oped: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/pitch: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.
- ERROR twain/relieved: The writer (anthropic/claude-opus-5.5) did not answer: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.