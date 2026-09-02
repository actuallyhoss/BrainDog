# 23 · Spark's surfaces

Where the assistant lives, how a proposal is reviewed, and how a claim is traced to a row. The
engine is [11-ASSISTANT](11-ASSISTANT.md).

---

## 1 · The verdict, on one screen

| Question | Answer |
|---|---|
| Where does it live? | **Nowhere new.** A second mode of the command palette, plus rows in queues that already exist. No panel, no widget, no page, no chat |
| Does it ship in v1? | **No conversational surface** — [ADR-030](16-DECISIONS.md). The §1b base ships no in-app model call; Phase A ships tier A-minimal plus *one job*, the ingest-pattern proposal; conversation arrives with tier B |
| What shape is it? | **A proposal row**, identical in kind to the suggestion rows the decision gate already consumes; it carries `model`, `filed` and `read` beside its five fields, and a fifth body, `query`, is the palette's unfiled answer (§4, §10) |
| What does it emit? | `{{path}}`, block fences, and row addresses. **Never a typed number** |
| Is it a coordinator? | **No — a peer, and the weakest one.** It cannot write. The coordinator is the record |
| Does cost show? | One row in Settings, counted in *asks*. Never near the input. **The model name ships with every output, always** |
| What streams? | **Nothing that lands in the record** |

---

## 2 · Does it ship in v1? The record answers, not taste

[15-ROADMAP](15-ROADMAP.md) funds Spark explicitly — **B7, 8 days**, now gated on
[ADR-030](16-DECISIONS.md)'s counter. *(An earlier draft of this section claimed the roadmap had
"eleven stages and nine tracks" and no assistant track. That was a misreading of the **prior
product's** record rather than of this roadmap, and it is withdrawn.)*

**The argument does not need that error, and stands without it:** the five things the price argument
says make $12/mo worth paying — an always-up inbound endpoint, cron, off-machine agent tokens,
one-click packs, backups — **do not include an assistant.** B7 is 8 funded days serving no line in
the value proposition, which is why ADR-030 stages it: no conversational surface first, tier B
before a chat mode, and the chat mode only when a Cloud customer with MCP configured asks.

The model is scoped in exactly **one** place, the ingest loop:

> *"An agent triages it — and **proposes an `ingest:` document from three examples.** You approve it
> once, through the decision gate, and from then on it is deterministic and free."*

That is the whole job. It is not a chat panel. And note what the sentence does not say: it says *an
agent*, not an *in-app* agent — Claude Code over MCP can do it today.

### What an in-app assistant does that the terminal one does not

Honestly: **four things, and they are all narrow.**

| # | The in-app one wins because | Strength |
|---|---|---|
| 1 | **It runs when the laptop is off.** An alarm in a Durable Object. A terminal agent cannot fire at 07:00 on a Tuesday | Real, and the **only** structural one |
| 2 | **It is on the phone.** The record is read on a phone; the terminal is not there | Real |
| 3 | **It has no write capability**, so it can be pointed at the raw inbox — untrusted content you would not hand a write-capable agent | Real, and it is the security argument |
| 4 | **It renders into the app's own dialect and addresses**, so output is clickable rows rather than terminal text | Real but small |

> **Everything else is less than you think.** The terminal agent has the repo, the shell, the whole
> conversation and a better model. On any task involving code, iteration, or more than one register,
> it wins outright. **A design that forgets this builds a worse Claude Code inside a web app.**

**The scoping rule that follows: Spark only gets jobs where at least one of those four applies.**
*"Summarise my week"* fails all four and must not ship.

And the external precedent is decisive — GitHub retired **GitHub Spark** because *"builders can now
build and refine these experiences through GitHub Copilot in the environments where they already
work"* ([17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q2).

**The fair counter-argument:** a $12/mo product in 2026 with no visible AI reads as a 2019 product,
and the gates measure retention, which is partly a marketing problem. That is an argument for *the
name on the marketing page and one honest narrow feature behind it* — not for a chat panel.

---

## 3 · The surface

| Candidate | Verdict | Why |
|---|---|---|
| Right-hand panel | **No** | permanently spends a third of a 1440px laptop on a feature used minutes a day |
| Floating widget | **No** | the corner bubble is the 2023 shape and reads as a support chat |
| Full page | **No** | a page is a destination, and a destination has to be worth walking to. A proposal queue that is usually empty is not |
| Inline command bar | **Already exists** | it is the palette. Do not build a second one |
| Inline-in-context | **Yes, for one thing** | the raw inbox row gets one affordance: `Propose a pattern` |
| **A row in an existing queue** | **Yes — the primary surface** | the Decide queue already holds suggestion rows and the three verbs. A Spark proposal *is* one. **Zero new surface** |

The palette's shape is already the right one — *a header that owns the input, a body that renders a
result, a footer* — and the second mode changes one word: **not a transcript, a proposal.** The body
renders one artifact with verbs, and the panel closes. **Nothing accumulates.** That is the tier A rule.
A tier-C *job* is the one body that is a transcript, and §3.1 says why it is allowed to be.

### 3.1 · The job view — the second body, for a run

The predecessor's palette header said from the day it was written that *"a second mode later replaces the
body with a transcript and a stream while the header, the footer, the focus trap, the scroll lock and every
keystroke stay exactly as they are"* — and on 2026-09-02 that prediction held. A tier-C job
([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5) opened from the palette swaps the body for the **job view**.
It is a transcript of a *run*, never of a conversation, which is why the tier A rule above survives it.
One thing the prediction did not foresee: the header's search field goes in run mode, because the prompt is a
textarea in the body and two text fields sharing one software keyboard is a screen where Enter means whichever
you last touched.

Five things that make it better than the terminal it wraps, each a test:

| Rule | Mechanism |
|---|---|
| **It names what it is doing** | not *working…* and not a spinner: `⟳ Running find . -name "*.php" \| wc -l · 17 s · Stop`. **Derived, not sent** — the last event says which state the session is in and the tool call's own input says what the call *is*. A terminal cannot do this because its status line is the last line of output |
| **A tool call and its result are one row** | Claude Code prints them as two blocks with an unknown amount between them; three calls draw as three rows, not six blocks |
| **A long result is folded, and says what it threw away** | the runner truncates at 2 KB and records the real length, so the fold reads *2,000 of 41,812 characters* rather than implying that was all. A one-line result is **not** folded — half of all tool calls answer with a number or a path |
| **A failure is a word, not a colour** | `ok: false` puts *failed* on the row. A red block in a terminal is red whether the command failed or merely wrote to stderr |
| **You can leave** | the job store is module state and the stream is owned by no component, so closing the palette does not stop the transcript; asserted: events received before closing < events after. A dot on the launcher says one is running — *a job you can walk away from is only a feature if there is a way back to it* |

Mechanics: job events are never pushed over the record's WebSocket ([22-FRONTEND](22-FRONTEND.md) §5).
While a job is live the client polls `jobEvents({ id, after })` every 700 ms — `after` is the highest
`seq` it holds, answered only with what came after and **with nothing at all when the job's high-water
mark has not moved**, one indexed row read ([30-BLUEPRINT](30-BLUEPRINT.md) §5;
[26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5); `listJobs({ status?, limit? })` is the list behind
the launcher's dot. Each event crosses the wire once; `after` is asserted monotonic and non-zero;
**nothing polls when nothing is live**. The `start` event
draws nothing of its own — the header reads model and repo through it, which is also what keeps the header
honest about the model for the whole of a live job. `Esc` in run mode goes **back to the launcher, not out**:
one press to leave a mode, a second to leave the panel — and not while the cursor is in the prompt, where
`Esc` is how you leave the field. Fifty-two harness checks in the predecessor; the rows above are the ones
[18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6 carries.

### States

| State | On screen |
|---|---|
| `absent` | no model configured. Spark is **not there** — not greyed out. *A row that cannot run is not there* |
| `idle` | the palette as normal. One extra row appears only once the input stops matching a place |
| `waking` | 1–3 s cold start. The **silhouette** of a proposal. No spinner — see §7 |
| `reading` | `Searched money · 412 rows · 0.4s`. True, and it *is* the retrieval trace |
| `proposed` | one artifact, verbs at its foot |
| `nothing` | the empty state, deterministic |
| `stopped` | Escape. Input intact, nothing filed |
| `out` | budget exhausted. Deterministic rows still answer |

**Two marks, because Spark is one agent among four.** A generic machine mark means *a machine
wrote this row* — any agent. A **paw** means *Spark specifically*.

---

## 4 · The proposal review

### One object, five bodies — four filed, one not

Spark produces exactly one kind of thing: **a suggestion**, which the decision gate already
consumes and which already becomes an immutable decision with a mandatory reason. The gate is one
mechanism in two clients: here, the review below; over MCP, the protocol's MRTR round trip
([10-MCP](10-MCP.md) §5) — the same row, the same mandatory reason.

| Body | Case |
|---|---|
| `options` | two or more paths, one recommended |
| `pattern` | an `ingest:` document derived from raw-inbox examples. **The v1 case.** A Spark-derived pattern always files `confidence: needs-review`; a person raises it at review ([07-INGEST-AND-RULES](07-INGEST-AND-RULES.md) §4) |
| `rowset` | *n* rows to write. Partial acceptance matters most here |
| **`change`** | **a declaration diff, and the falsifiable prediction that comes with it** — [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.6. Phase C |
| `query` | the palette's answer — a drafted predicate and the rows it selects (§10). **Unfiled**: it reaches the queue only if the person saves it ([46-SPEC-SPARK](46-SPEC-SPARK.md) §4.2) |

**`change` is the one that needed a fourth body rather than reusing `options`,** and the reason is
the prediction. A `change` review shows three things no other body has: the diff, the observation
that triggered it with its count and window (*"11 unmatched payloads from alerts@cib.eg over 30
days"*), and **the claim it will be scored against on a named date**. Accepting writes the
declaration and the prediction in one transaction; a `prediction` with no measurable form is refused
at write time (`PREDICTION_UNMEASURABLE`), so a `change` proposal that cannot state what it would
improve cannot reach this screen at all.

The per-line hit counts the `pattern` review already draws (`3/3 · 2/3 · 0/3`) are the right idiom
for the diff, which is why this is a fourth body and not a fourth screen.

> **And it never announces itself.** A `change` lands in the weekly digest as one line in *"Three
> things the record noticed"*, never as a notification — §11's batching rule, and the habituation
> argument in §4. A proposal about the shape of your record is the least urgent thing in the
> product.

### The queue row

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ?  Which November renewals move to the new card before it expires?       SG27   │
│    ★ Spark · 3 options · 11 rows behind them              2 tasks · bake      │
├────────────────────────────────────────────────────────────────────────────────┤
│ ?  A pattern for the three HSBC texts nothing has parsed                SG31   │
│    ★ Spark · from 3 messages · derived from untrusted content    ⚠  money     │
└────────────────────────────────────────────────────────────────────────────────┘
```

Four rules, each load-bearing:

1. **No verbs on the row.** *A control that commits from a place where its own field is not visible
   is a control hiding what it is about to ask for.* Doubly true when the source is untrusted.
2. **The mark is on the sub-line, not in front of the question.** The question is the object;
   authorship is a property of it.
3. **`derived from untrusted content` is on the row, in `warn`, before it is opened.** That is the
   one fact you need to decide whether to open it in a hurry.
4. **The row states how many rows are behind it.** A proposal with zero addressable rows is never
   filed at all.

### Options are compared, not read

```
  The options                                                                  3
  ┌───────────────┬─────────────────┬─────────────────┬─────────────────┐
  │               │ A               │ B  ★ recommended│ C               │
  │               │ Move all three  │ Move the two    │ Move none, pay  │
  │               │ now             │ that renew first│ on the old card │
  ├───────────────┼─────────────────┼─────────────────┼─────────────────┤
  │ Costs         │ $0              │ $0              │ $0              │
  │ At risk       │ nothing         │ 1 domain        │ 3 domains       │
  │ Deadline      │ {{date:…11-04}} │ {{date:…11-04}} │ {{date:…11-04}} │
  │ Reversible    │ yes, 14d        │ yes, 14d        │ not stated      │
  │ Rows behind   │ 11 ▸            │ 11 ▸            │ 4 ▸             │
  └───────────────┴─────────────────┴─────────────────┴─────────────────┘
   ▸ under 640px: three stacked cards, rows in the same order
```

**Enforced as a schema constraint, not guidance:** every option answers the same row set, and a row
an option does not state renders **`not stated`** — never blank, never zero. *A zero is a reading.*

Below the table each option's full body renders **open, not folded** — this page exists to be the
place the argument is readable, and folding it here would leave it folded everywhere.

### The evidence fold: every line is an address

```
  Rows behind option B                                                        11
  ─────────────────────────────────────────────────────────────────────────────
  domains       clogs.example      renews {{date:2026-11-30}}   → /r/domains/4
  services      Porkbun          USD 52.01/yr on card ••4471  → /r/services/12
  money_txn     3 rows           card ••4471, last 90d        → /r/txn?acct=…
  decide        D40              Buy brain.dog for $150       → /decide/D40
```

- **Every line is clickable and lands on the app's own screen.** No bespoke evidence viewer.
- **Every figure is a `{{path}}`**, so the fold cannot go stale.
- **A line Spark cannot address is not in the fold.** If it cannot name the row, it did not use
  the row.

### The `pattern` review — the v1 case

```
  A pattern for the three HSBC texts nothing has parsed                    SG31
  ★ Spark · 2026-08-31 14:07 · glm-5.3-flash

  ┌─ THE SOURCE, AS IT ARRIVED ─────────────────────────────────── untrusted ─┐
  │ +20 100 ••• ••••          2026-08-29 14:02          inbox_raw #212        │
  │ HSBC: You have received EGP 5,005.00 from NILE REALTY on 29/08/26.        │
  │ Ref 88213. Available balance EGP 12,447.19.                               │
  │ ── 2 more, same shape ▸ ───────────────────────────────────────────────── │
  │ Not rendered.  0 instruction-shaped spans.                                │
  └───────────────────────────────────────────────────────────────────────────┘

  THE PATTERN                                                 accept · edit · drop
  ─────────────────────────────────────────────────────────────────────────────
  match     from contains "HSBC"                        ✓ 3 of 3      ⌄  ✎  ✕
  extract   amount    money after "EGP"                 ✓ 3 of 3      ⌄  ✎  ✕
            date      date format "DD/MM/YY"            ✓ 3 of 3      ⌄  ✎  ✕
            payer     text between "from" and "on"      ⚠ 2 of 3      ⌄  ✎  ✕
            account   lookup account by last4           ✗ 0 of 3      ⌄  ✎  ✕
  writes    transactions · confidence: needs-review              ⌄  ✎
  ─────────────────────────────────────────────────────────────────────────────
  Dropped: account.  4 of 5 fields accepted.
```

Four decisions:

1. **The untrusted source is above the proposal, and you scroll through it to reach the verbs.** You
   cannot approve without the source having been on screen.
2. **Every line carries its own hit rate** — `3 of 3`, `2 of 3`, `0 of 3`. Not a confidence score; a
   count. *State the number, do not grade it.*
3. **A `0 of 3` line is pre-dropped and struck through**; re-including it is an explicit act.
4. **Approving retires the model from this job forever.** From then on the pattern is deterministic
   and free. **Cost falls with use — the opposite of every metered assistant.**

### Partial acceptance

```
  Rows to write                                               9 of 12 selected
  ─────────────────────────────────────────────────────────────────────────────
  ☑  task   Renew clogs.example before {{date:2026-11-30}}       bake
  ☐  task   Email Porkbun support                              no deadline stated
  ☐  task   Consider consolidating registrars                  no row behind this
  ─────────────────────────────────────────────────────────────────────────────
  Uncheck all ·  Check all                        [ Write 9 rows ]   [ Reject ]
```

- **The count is in the button label**, not beside it. You cannot mis-read what you are about to do.
- **`no row behind this` is a pre-uncheck reason, stated in the row.** Uncited rows start off.
- `Check all` exists. **`Accept all and don't ask again` does not** — never for anything derived
  from untrusted content.
- Every write goes on the existing undo stack with a real label.

### Capturing the reason without collecting "ok"

The tension is real: optional is how you get nothing, and compulsory-and-dumb is how you get "ok".
**Make it compulsory, and make the cheapest way to satisfy it a true sentence.**

```
  What you decided                                                   compulsory
  ┌──────────────────────────────────────────────────────────────────────────┐
  └──────────────────────────────────────────────────────────────────────────┘

  Or take a sentence that is already true:
  [ The two that renew before the card expires are the only ones at risk ]
  [ Dropped the account lookup — it matched none of the three ]

                          [ Choose B — Move the two that renew ]     [ Cancel ]
  This writes D44 and points the two at each other.
```

| # | Mechanism | Why it works |
|---|---|---|
| 1 | ~~Offer the option's own stated bet as a one-tap chip~~ | **DELETED in review.** The bet was written by whoever proposed the option — often an agent. A chip *cheaper than typing* would mean **the machine writes the human's binding reason and the human taps it**, which voids the mechanism the product is sold on |
| 2 | **Offer the edits made as an unfinished starting point** — `Dropped the account lookup because …` | the user did the reasoning by editing, so the summary is true; leaving the sentence incomplete keeps the judgement theirs. **Never a complete tappable sentence** |
| 3 | **Nudge once, never block** — under ~15 characters ask *"That will not mean anything in six weeks. Keep it anyway?"*, and accept either answer | this replaces an earlier draft's stop-list, which **directly contradicted [20-COLLABORATION](20-COLLABORATION.md) §3 in the same document set**. A validator that refuses short reasons produces `okokokokokok` — it converts a thinking problem into a character-count problem |
| 4 | **Keep the third verb.** `Defer` + reason + wake date ([19-INTERFACE](19-INTERFACE.md) §4; an earlier draft labelled it *Not yet*) | measured: cheap questions get closed and expensive ones get left. **A cheap deferral is worth more than a coerced "ok"** |
| 5 | **For untrusted-derived proposals, change the label, not the length** | *"What in the message made this right?"* cannot be answered with "ok" without noticing you are doing it |

**And the discipline that makes all five survive: one gate, rarely.** OpenAI's Model Spec is
explicit that confirmation scope *"should also not be so narrow as to require multiple confirmations
by the user for trivial actions, which could **habituate the user to automatically confirming all
requests**."* **Every extra confirm anywhere in the app devalues this one.**

---

## 5 · Citations

### The doctrine, inverted from a feature that already works

A screenshot-redaction feature in the prior codebase solved this problem in the other direction, and
its reasoning transfers exactly: *"The obvious build is to mark the sensitive things. It is also the
wrong one, and it fails in the one direction a privacy feature may never fail in: **silently**. So
the default is blur, and the exceptions have to be **proven** — by provenance, not by pattern."*

> **Inverted for citations: the default is uncited, and citation has to be proven.** A figure added
> next month is uncited because nobody did anything — the only kind of honesty that survives contact
> with a codebase.

### The one hard rule

> **Spark may not type a number. It may only name a path.**

| Spark emits | Renders as | Status |
|---|---|---|
| `{{revenue-monthly}}` — a metric id | `USD 3,988.00`, live, re-read every paint | **cited** |
| `{{money:500500 EGP}}` — minor units and a currency | `EGP 5,005.00` — a value the source stated | **quoted**, tied to its source row |
| `inbox_raw#212`, `SG31`, `D41` | auto-linked, struck if superseded — a `#` id carries its register, because every register has a `#1` | **cited** |
| `about 40%` | **dotted underline, receded, pressable** | **UNCITED — marked** |

### The affordance: the figure is the chip

**Rejected: hover cards.** The record is read on a phone. A citation that only exists on hover does
not exist. **Rejected: numbered superscripts.** They work when sources are *documents*; here the
source is a **row with an address**, and `inbox_raw#212` is a better handle than `¹²`.

Press an uncited span and get the honest answer:

```
  ┌───────────────────────────────────────────────────────────┐
  │  about 40%                                                │
  │  Spark typed this figure. There is no path behind it.   │
  │  [ Show me the rows it would come from ]                  │
  └───────────────────────────────────────────────────────────┘
```

### Many rows behind one figure — no new interpolation

The gap: a figure derived from *many* rows. `{{money-owed}}` gives the number; nothing gives the
fourteen rows. An earlier draft added a ninth typed interpolation, `{{rows:14|/r/txn?cat=owed}}`. It
is **not in the dialect** — the typed forms are closed at eight ([34-GRAMMARS](34-GRAMMARS.md) §2.3)
and a typed argument is a literal or a path, never an address. Spark cites the rows themselves:

```
{{ref:txn#12}} {{ref:txn#15}} … {{ref:txn#41}}      →   "14 rows ▸", linked
```

The panel draws `n rows ▸` **from the citation count** and links it to the register filtered to those
ids. Two properties make it worth having:

1. **The link lands on the app's own deterministic view.** No bespoke drill-through — the answer is
   a table you can open, and the table was drawn by code, not by a model.
2. **Every citation resolves at paint.** A `{{ref:…}}` whose row has since left the set — moved
   state, purged, superseded — is drawn struck, and the chip goes `warn`:

```
   14 rows ▸        →      ⚠ 14 cited · 11 now ▸
```

> **That single check catches the entire "confident wrong figure" class at render time, for free,
> forever — including when the proposal was right on Monday and is wrong on Thursday.**

---

## 6 · Trust, and honesty about not knowing

### No confidence percentages. Ever.

Three reasons, and the first is in-house: an earlier page in the prior codebase had a *"tightest
constraint"* card explaining which readings were worrying, and it was removed — *record the count
and let the gauge do the work.* Second: **a control gets a label and what to do, never an internal
metric.** Third: a percentage from a model is not a measurement of anything. `3 of 3` is.

**Show instead:** the count of rows, the age of the oldest, and the model's name. All three are
facts.

### What was searched — and the line that is drawn every time

```
  What Spark read                                                    folded ▸
  ─────────────────────────────────────────────────────────────────────────────
  transactions    412 rows      predicate: cat=owed, due<90d
  obligations      24 rows      all
  domains          31 rows      renews<60d
  grant             — refused   Spark has no tool that reads this register
  ─────────────────────────────────────────────────────────────────────────────
  0.4s · glm-5.3-flash · 2 asks
```

**The `grant — refused` line is drawn every time, including when nothing about credentials was
asked.** It is the single most reassuring line in the product.

### When retrieval returns nothing, the model is not called

> **If the projection returns 0 rows, no inference happens.** The empty state is deterministic.

It removes the entire fabrication surface for the case where fabrication is most likely, costs
nothing, and returns instantly. **There is no honest sentence a model can write about rows that do
not exist.**

The same gate applies to filing: a proposal with zero addressable rows behind it is **never
written** (`PROPOSAL_NO_ROWS`), one that cites nothing is refused (`PROPOSAL_UNCITED`), and a
proposal is filed exactly once, by `record.propose` — the palette's second call files it and nothing
else does ([46-SPEC-SPARK](46-SPEC-SPARK.md) §5.5).

And guessing is not a tone — it is an absence of citation. A proposal whose *recommendation* rests
on an uncited figure **cannot be marked recommended**; it files with no recommendation and the
comparison table shows no star.

---

## 7 · Streaming and latency

| Output | Streams? | Why |
|---|---|---|
| A **proposal** | **No** | it is a form, and a form that assembles itself under the cursor cannot be reviewed |
| A **figure or a block** | **No** | a malformed block degrades to a visible fence, and a block streamed character-by-character is malformed for most of its life — it would flicker through the fallback |
| **Retrieval progress** | **As pass 1, not a stream** | `Searched transactions · 412 rows` is the `read` call's answer, drawn before any model is asked. This is the real progress signal |

Two supports and one dissolution:

- **Partial structured output cannot be validated** against a schema — incomplete data does not yet
  conform. The remedy maps exactly onto tables: **stream complete rows, never partial objects.**
- Streaming *"makes it more difficult to moderate the content."*
- And the apparent conflict dissolves: streaming is required for long generations as a **transport**
  matter (HTTP timeouts), and SDKs *"provide a way to use streaming internally while returning the
  complete Message object."* **You can be required to stream on the wire and still be right to render
  one finished artifact.**

### The caching trade, corrected

**The claim that AI Gateway caching does not work with streaming is not in Cloudflare's
documentation** — verified 2026-08-31 against the caching page and `ai-gateway/llms-full.txt`, which
does not mention streaming anywhere. It came from a bundled reference file. It is withdrawn.

What *is* documented is enough, and it is a better constraint: the cache key is provider + endpoint +
model + auth header + **the full request body**; caching covers **text and image responses**; it
applies only to **identical requests**; and the cache is **volatile** — two simultaneous identical
requests may both miss.

| Call | Body identical across turns? | Cacheable? |
|---|---|---|
| the ~1B classifier (fixed prompt, short input) | often | **yes** |
| an embedding (fixed model, same text) | often | **yes** |
| the tool-calling conversation | **never** — the projection is in the body | no |

> **The cacheable calls are the cheap ones, and they were never going to stream. The expensive call
> was never cacheable. There is no trade to make at the UI layer** — which is a better answer than a
> compromise.

### The 1–3 second cold start

Practitioner thresholds: under 1 s a looped animation is *"distracting"*; a spinner is *"reserved for
actions that take between 2–10 seconds"*; percent-done only at *"10 or more seconds."* 1–3 s straddles
the spinner threshold, so **do not use one** — draw the **silhouette** of a proposal, which is the
same rule [19-INTERFACE](19-INTERFACE.md) §6 applies everywhere else.

- **The input accepts typing from frame one.** The object warms in the background from the moment the
  palette opens, not from the moment Enter is pressed. **Warming on open is free** — it is a cold
  start, not a token.
- **No "waking up" copy.** Never write a sentence explaining the interface.
- The live region exists in the tree before its text does — an element created in the same frame as
  its own content is not reliably announced.

### What the user does while waiting: reads the deterministic answer

The body renders in two passes, and **the first needs no model.**

```
  ┌─ 1 ─ instant, no inference ───────────────────────────────────────────┐
  │  14 rows match. EGP 1,171,940.00 due before {{date:2027-02-01}}.      │
  │  Delta ·············· {{money:82400000 EGP}}   2 rows                 │
  │  Nile Realty ········ {{money:34794000 EGP}}   12 rows                │
  │                                             [ Open in Money ]         │
  ├─ 2 ─ arriving ────────────────────────────────────────────────────────┤
  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  Spark is reading these rows                   │
  └───────────────────────────────────────────────────────────────────────┘
```

> **This is the most important layout in the document. The rows are the answer; the model's
> contribution is a proposal about them.** If the model never returns, the user still got what they
> came for — which is also the graceful-degradation design and the no-model design, for free.

The palette is two calls — `read`, then `propose` — so pass 1 renders without a stream and Escape
between them cancels for free. Both are named methods on the Spark object, dispatched over
`/api/spark/<method>` (`status` · `read` · `propose` · `pattern` · `settings`), a browser session only —
a bearer gets `403 NEEDS_BROWSER_SESSION` ([46-SPEC-SPARK](46-SPEC-SPARK.md) §5).

### Cancel

Escape **stops** rather than bubbling, instantly, and **the typed text survives**. Toast: `Stopped.`
and nothing else — **the UI must not claim a refund**, because billing for a client-aborted stream is
not documented and silence is the honest position.

Two refinements worth taking:

- **Steer, don't kill.** Typing during `reading` refines the *next* retrieval rather than restarting
  — *"follow-ups wait for the next tool call instead of cutting the agent off mid-action."*
- **A closed panel is not a cancellation.** A nearly-finished proposal completes server-side and
  files itself in the queue. **Escape** is the cancellation.

---

## 8 · Cost visibility

**Mostly no.** A token counter beside the input is an internal metric on a control, which the house
style forbids outright.

The market splits instructively: developer tools with volatile marginal cost put the meter in front
of the user; consumer knowledge tools bury it in settings. **BrainDog is the second kind** — $0.20
against $12 is 1.6% of revenue, and the buyer did not come here to think about tokens.

**One row in Settings. Nothing anywhere else.**

```
  Spark
  ─────────────────────────────────────────────────────────────────────────────
  Asks this month            41 of 80
  Model                     glm-5.3-flash
  Resets                    {{date:2026-10-01}}
  Patterns approved         4          each one stopped costing anything
```

- **The unit is an *ask*, not tokens, credits or dollars.** Nobody has ever changed behaviour because
  of a token count.
- **No gauge, no bar, no percentage.** A number with a label above it.
- **`Patterns approved` is the row that matters** — the only meter in the product that goes the right
  way.

| Point | What happens |
|---|---|
| 0–79% | **nothing.** No indicator anywhere |
| 80% | one dismissible line in the palette footer, **once per month** |
| 100% | a `warn` chip on the Settings row, and Spark's own rows say so |

Never a modal. Never an upsell in the flow.

### Exhaustion, and the rule that cannot bend

```
  │  14 rows match. EGP 1,171,940.00 due before {{date:2027-02-01}}.        │
  │                                              [ Open in Money ]          │
  │  ───────────────────────────────────────────────────────────────────── │
  │  Spark is out of asks until {{date:2026-10-01}}.                      │
  │  Everything above this line was drawn without it.                       │
  │                          [ Use your own endpoint ]   [ Settings ]       │
```

That last sentence is the whole product argument in eleven words, and it is **only true because of
the two-pass layout in §7.** The line above it is the `SPARK_BUDGET_SPENT` refusal's own `fix`
sentence, shown verbatim — a refusal is never rewritten client-side ([13-UI](13-UI.md) §6); the
number behind it is `ask_cap`, per record per month ([46-SPEC-SPARK](46-SPEC-SPARK.md) §6).

> **The model is never silently downgraded.**

**Mechanism, not policy: every Spark output carries the model name in its footer, always** —
receded, small, mono. A downgrade is then physically impossible to hide, because the row that changed
says so, and the audit log records it.

**Silent downgrade is the one failure that destroys a product built on a decision gate: a decision
taken on a proposal from a model you were not told about is a decision taken on evidence you did not
have.**

### Bring your own endpoint, and no model at all

With a self-hosted endpoint configured, **the meter disappears entirely** — not zeroed, not greyed,
gone. It is not our money. The model name still ships with every output.

With **no** model, Spark is **absent**: no palette row, no `Propose a pattern` action, no **Ask
Spark** button on any empty state, one line in Settings. `SPARK_ENDPOINT` unset means the host never
imports the package and registers no Spark route; `GET /api/version` answers `spark: false`, and the
client draws a Spark affordance on nothing but `spark: true` ([46-SPEC-SPARK](46-SPEC-SPARK.md) §5.1;
[50-SPEC-WEB](50-SPEC-WEB.md) §5.5). **Every deterministic feature is byte-identical, and CI proves
it** — `SPARK_ENDPOINT` unset must pass every e2e suite (an earlier draft named the variable for the
withdrawn *Pointer* rename; the row is in [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6).

---

## 9 · Injection defence at the UI layer

### The architecture already satisfies the 2026 rule — and the UI is the leg it is missing

The **Agents Rule of Two**: an agent may satisfy **no more than two** of — **[A]** processes
untrustworthy input, **[B]** has access to private data, **[C]** can change state or communicate
externally. If all three are needed, it *"requires supervision — via human-in-the-loop approval."*

| Property | Spark |
|---|---|
| **A** untrusted input | **yes** — the raw inbox is the whole point |
| **B** private data | **yes** — a narrow projection |
| **C** state change / external comms | **no.** No write tool, no fetch tool, no email tool, no secret-reading tool |

**Two of three, satisfied by architecture rather than by prompt.** That is the strongest security
sentence in the product.

**But the human is C.** Every accepted proposal is a state change — so **the review UI *is* the
human-in-the-loop supervision the rule names**, and it must be designed as a security control rather
than a convenience.

### The quarantine, and every part of it does work

```
  ┌─ AS IT ARRIVED ─────────────────────────────────────────── untrusted ─┐
  │ +20 100 ••• ••••          2026-08-29 14:02        inbox_raw #212       │
  │ HSBC: You have received EGP 5,005.00 from NILE REALTY on 29/08/26.     │
  │ Not rendered.  0 instruction-shaped spans.                            │
  └───────────────────────────────────────────────────────────────────────┘
```

1. **The markdown renderer is never called on it.** Not sanitised markdown — *no* markdown. So
   untrusted content **cannot draw a `note`, a `stat` or a `chips` line, and can never wear the app's
   own voice.** Enforceable precisely because there is only one renderer.
2. **Mono, inset, hairline-bounded, its own ground.** It reads as a quotation of something from
   outside.
3. **The origin is in the frame** — sender, arrival time, row address.
4. **The word `untrusted` is on the frame**, not in a tooltip.
5. **`Not rendered.`** is a two-word statement of a security property.

And a taint lattice **that can only add**: anything derived from untrusted content inherits
quarantine.

### Stopping the rubber-stamp

| # | Mechanism |
|---|---|
| 1 | **No verbs on the row.** Untrusted-derived proposals cannot be accepted from a list |
| 2 | **No bulk accept, ever, across untrusted-derived proposals** |
| 3 | **Rarity is the defence.** ONE gate in the product; every trivial confirm elsewhere devalues it |
| 4 | **The reason label asks about the source** |
| 5 | **Per-field acceptance with per-field hit rates.** To accept, you look at five lines and five counts. **Reading is the control** |
| 6 | **The proposal names its own blast radius** — `writes: transactions` and nothing else |
| 7 | **Measure the accept rate and treat a high one as a defect.** Above ~80% accepted-unchanged, the review is theatre |

**The instruction-span scan marks. It never allows and never blocks.** A detector used as a gate is a
gate that opens for whatever fraction it misses; a detector used as a *highlighter* has no failure
mode worse than a missed highlight.

### Credentials: nothing to add

Spark gets **no** Vault affordance. No *"ask about this key"*, no summary. The register is not in
its projection, and the `What Spark read` fold says so on every run. Compare MCP's own elicitation
rule: servers *"**MUST NOT** use elicitation to request sensitive information."*

### The residual risk, stated

**Spark cannot exfiltrate. The human can.** An injected instruction that persuades a person to
write a row is the remaining path, and no UI closes it completely. What the UI can do is make the
persuasion visible: quarantined, unrendered, marked, above the verbs, with instruction-shaped spans
highlighted, and the reason field asking what in *that* made this right.

Also: **Spark emits no raw markdown links.** Links come only from validated typed interpolations.

---

## 10 · Chat is the wrong shape

### The argument from this record specifically

The record is **typed**, and the scope already contains the deterministic answer to nearly every
useful question — `metric`, `rule`, `digest` and `page` all need **no model at all**, and one
`where:` grammar serves all of them ([02-DATA-MODEL](02-DATA-MODEL.md) §6 counts its seven consumers).

**And the number that ends the argument:** on the BIRD text-to-SQL benchmark, top execution accuracy
is **81.95%** against a human baseline of **92.96%** — a gap of 11 points. **One in five natural-
language questions over a typed database gets the wrong answer.** On *"how much do I owe in
November"*, one in five is not a feature. It is a liability with a decision gate attached.

### So the model drafts the predicate; the predicate answers

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  what's due before the card expires                                      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  Spark read that as:                                                   │
  │    source  obligations, domains, services                                │
  │    where   due < 2026-11-04  and  paid_with = card ••4471                │
  │                                                    [ Edit ]  [ Save ]    │
  │  ──────────────────────────────────────────────────────────────────────  │
  │  14 rows.  EGP 1,171,940.00 · USD 312.06                                 │
  │  Delta ············ {{money:82400000 EGP}}    {{date:2026-09-15}}   ▸     │
  │                                             [ Open as a page ]           │
  └──────────────────────────────────────────────────────────────────────────┘
```

1. **The predicate is shown before the answer.** You read the question the app is about to ask.
2. **It is editable, in the grammar.**
3. **It is saveable.** A good predicate becomes a metric or a page, and **the model never runs on
   that question again.** Same economics as the pattern: **use retires cost.**
4. **The rows are drawn by code.** The model touched the filter, not the figures.
5. **Two currencies print separately.** Any output that sums two currencies is **refused at render**,
   not corrected.

**And this is not simply "build a query builder instead."** Chat's real advantage is that it has no
discoverability problem — a user who does not know the grammar can still type a sentence. This design
keeps exactly that property: **natural language in, structured artifact out.**

### Deliberately absent

**No transcript** for an answer — nothing accumulates; the job view (§3.1) is the one transcript, and it is a run's, not a conversation's. **No suggested-prompt chips** — they teach that the way in
is a sentence. **No follow-up affordance** — a follow-up is a new predicate; if you need three turns
to express a filter, the grammar is the thing to fix. **No "ask about this page" button** on every
screen.

---

## 11 · Proactive behaviour

> **Proactive surfacing is deterministic. The model never fires a notification.**

A rule is `when <where:> then <action>`, and `suggest` is the decision gate's own front door. So the
brief's own example is a rule, not an inference:

```
  rule      renewals-on-an-expiring-card
  register  domains
  when      all: [ { field: renews, before: "+30d" },
                   { via: paid_with, field: expires, before: "+30d" } ]
  then      suggest
  ─────────────────────────────────────────────────────────────────────────────
  Fires on 3 rows today.                        [ Preview ]  [ Save ]  [ Drop ]
```

*(The second leaf approximates "the card expires before the renewal" — a field-to-field comparison is
not in the grammar, and [02-DATA-MODEL](02-DATA-MODEL.md) §6 says why; `via:` names the one ref hop
and `field:` the field on its far side — [34-GRAMMARS](34-GRAMMARS.md) §1.6. An earlier draft wrote
`domains.paid_with.expires < domains.renews`: a two-hop path, arithmetic on a literal and a
field-to-field comparison, three constructs the grammar refuses.)*

**Spark's only role is to have proposed that rule once, from an observation.** After that it is
free, deterministic, testable and shareable as a pack file.

### The etiquette rules, each with a source

| # | Rule | Grounding |
|---|---|---|
| 1 | **Batch. Never interrupt.** One digest a day, at a time the user set | CHI 2007, 27 people / 2,267 logged hours: return-to-task after an email alert **9m 33s**; **4.28** alerts/hour |
| 2 | **Never cover the user's work** | same study: windows *"less than 25% visible… took significantly longer to return to"* than >75% visible |
| 3 | **A proactive row states the deadline that makes it urgent, or it is not proactive** | the Decide queue already ranks by cost of leaving a question open |
| 4 | **Tier by consequence; only the top tier interrupts** | clinical-alert literature |
| 5 | **Do not notify about something already on screen** | Apple's Mail *"simply adds it to the list… because sending a notification about it would be unnecessary and distracting"* |
| 6 | **A dismissal is a learning, not a mute** — it takes a reason, and the reason suppresses the class | — |
| 7 | **Measure the override rate. Over 50% is a design defect** | drug-safety alerts are overridden *"in 49% to 96% of cases"*, and the authors put the fault in *"the error-producing conditions in software and organization"* |

**And the cost of getting it wrong, for the record:** interrupted work is finished *faster* but
*"this comes at a price: experiencing more stress, higher frustration, time pressure and effort."*

### What must never be proactive

| Never | Why |
|---|---|
| Anything advisory about money — *what to do*, as opposed to *what is due* | the whole product is a decision gate. A proactive recommendation is a decision taken by nobody |
| Anything inferred about a **person** — a collaborator's reliability, a counterparty's intent | *"in no circumstances should it go off and autonomously message the peer to resolve the issue on its own"* |
| Anything reading as inference about the user's state or mood | EU AI Act Art. 5(1)(f) prohibits emotion inference in workplace contexts. And the canonical creepiness failure was solved by making the output *look* random — **the accuracy was never the problem; the legibility as inference was** |
| Health, in any form | a large consumer study notified 0.52% of participants and confirmed the condition in only **34%** of analysable readings, while **57%** contacted providers outside the study. **A proactive health signal generates work it cannot close** |
| Anything on a first run | *"because people don't request a proactive feature, they often have less patience with its mistakes"* |

**And the remediation order to copy:** when a large vendor's notification summaries misreported news
stories, the first fix was not better summaries — it was **better marking**: labels, italics, a
per-app off switch, a *"may contain errors"* warning, and the worst category disabled outright.
**When a proactive feature is wrong, mark it before you improve it.**

---

## 12 · Multi-agent reality

### Spark is a peer, and the weakest one

1. **A coordinator needs authority. Spark has none** — no write path, by design. An actor that
   cannot write cannot arbitrate between actors that can.
2. **The coordinator already exists and is not an agent.** It is the record: one object, one version,
   compare-and-set, an append-only log. **Better than a model because it cannot be persuaded.**
3. MCP encodes the same shape: the host *"acts as the container and coordinator… enforces security
   policies and consent requirements"*, and *"servers should not be able to read the whole
   conversation, nor 'see into' other servers."*

### Seeing what another agent did

```
  Changes · new                                                    26 unread
  ─────────────────────────────────────────────────────────────────────────────
  ★ codex      S24   task.add        #241  Rotate the Porkbun key      14:02
  ★ claude     S25   suggestion.add  SG31  A pattern for HSBC texts    14:06
    sam             decide          D44 ← SG27                        14:11
  ★ spark            suggestion.add  SG32  Three renewals, one card    07:30
  ─────────────────────────────────────────────────────────────────────────────
  [ everyone ]  [ machines ]  [ sam ]  [ spark ]
```

Three mechanisms, all borrowed:

**1 · The actor is first-class and filterable, and is never laundered into the human.** Model it on
CloudTrail, which carries an identity *type* including a service principal plus a `sourceIdentity`
that *"identifies the original user identity making the request"* and **survives arbitrary
delegation depth.** Slack shows the failure: *"an `actor` will always be a user"*, and for app-driven
events it is *"the user who installed the app"* — which destroys exactly the distinction this screen
exists to draw.

**2 · Delegate, never assignee.** Linear's rule, and it is the best published one: *"the agent
becomes the **delegate** rather than the assignee, preserving human ownership"* / *"**the human
assignee remains responsible for the issue, even after delegation to an agent**"* / *"**an agent
cannot be held accountable**… the final responsibility should always remain with a human."*

**3 · Provenance travels with the artifact.** The single best mechanism found in this pass: *"each
commit message includes a link to the session logs, so you can trace why a change was made during
code review or an audit."* Every machine write in the audit log carries its session id, and that
session id is a page.

**And the trailer conventions contradict each other, so pick one and say it is a choice.** The kernel
requires a human author and forbids agents adding sign-off (*"only humans can legally certify"*);
Aider names the model in a co-author trailer; GitHub's cloud agent authors as the agent with the
human as co-author. **Take the kernel's stance and Aider's precision:** the record's actor names the
agent *and its model*, the human is never the actor for a machine write, and responsibility stays
with the human via the delegate rule.

### Two agents proposing opposite things

```
  ⚠  Two agents wrote about SG27, four minutes apart
     ★ codex   S24   recommends A — move all three now              14:02
     ★ claude  S25   recommends B — move the two that renew first   14:06
     The record kept both. Nothing has been decided.
                          [ Compare ]   [ Ask for a third option ]
```

Four mechanisms:

1. **Show the base, never a guess.** VS Code's merge editor recomputes *"without inserting any
   conflict markers"* and resets true conflicts *"to the common ancestor… marked as unhandled."*
   **The UI refuses to display a fake resolution.**
2. **There is no "Ignore" — there is "Mark as Handled",** tooltip *"Don't take this side of the
   conflict."* An ignore that reads as *a decision you took* is a different affordance from one that
   reads as *a thing you skipped*.
3. **Name the difference, not the diff.** *"Disagrees on: the card's expiry date"* — one line,
   computed from the evidence sets.
4. **One HTTP code, one meaning.** **409** for a stale `version`, **with a body carrying the current
   row and the other actor's name**, so the UI can draw the row above rather than a generic failure;
   the client re-reads and re-applies. There is **no 412** — an earlier draft split "stale
   precondition" from "domain conflict", and in a single-writer object they are the same event.

**And the counterweight, before over-building this:** from a team that built several of these —
*"users **surprisingly rarely encounter conflicts**… and generic resolution mechanisms work well…
users have an intuitive sense of human collaboration and avoid creating conflicts with their
collaborators."* **Ship the collision row. Ship `Compare` only when the audit log shows collisions
actually happening.**

### Identity, honestly

Agent-to-agent discovery specs carry names, descriptions and auth schemes but **do not address
verification of which agent performed an action** — provenance after the fact is out of scope, so do
not wait for it. Meanwhile identity providers are adding agents as *principals* alongside people,
which is the direction the actor column should be built for. What the record does today — a token per
session, a session id registered at start, every write attributed — is weaker than cryptographic
attestation and **stronger than everything shipping.**

---

## 13 · The twelve ways this ruins the product

Ranked by probability × damage to the thing being sold.

| # | Anti-pattern | Countermeasure |
|---|---|---|
| **1** | **The confident wrong figure.** Spark writes "£14,200 owed"; it is £11,800; a decision is taken; the decision is immutable — and it poisons every decision that cites it | **Spark may not type a number.** Figures are `{{path}}` or refused. `{{ref:…}}` citations resolve at paint and a stale one flags itself. Two currencies never sum |
| **2** | **The assistant becomes the only way to do anything** — it inverts the value proposition and breaks the self-host promise in spirit while honouring it in letter | **Every Spark output has a deterministic route to the same result, and Spark's own UI shows it.** Ship the no-model build in CI — make it a test, not a value |
| **3** | **Approval fatigue turns the gate into a rubber stamp** — the gate *is* the differentiator, and a rubber-stamped gate manufactures false provenance | cap proposals; compulsory non-trivial reasons with true-sentence chips; one gate, rarely; **instrument the accept-unchanged rate and treat >80% as a defect** |
| **4** | **Injection via the raw inbox, laundered through a human** | Rule of Two by architecture; quarantine rendering; source above the verbs; no bulk accept; the reason label asks about the source |
| **5** | **Proposal spam.** The Decide lane goes from 8 to 80 and is abandoned — and the queue is the product | **A hard cap of 3 open Spark proposals per register.** A fourth displaces the lowest-ranked, which closes with a recorded reason ([19-INTERFACE](19-INTERFACE.md) §8). Every proposal states a deadline or is not filed |
| **6** | **Silent model downgrade** | the model name in every output footer, always. A routing change writes an audit line. Exhaustion is a hard stop |
| **7** | **A chat panel eats the design** — a permanent panel taxes the only screen that matters, forever, for a feature used minutes a day | no panel. A second *mode* of the palette, occupying zero pixels when closed |
| **8** | **Proactive becomes noise, then is muted, then rots** — and a quietly stale surface is worse than none, because it gets believed | deterministic rules only; batch; tier by consequence; dismissal writes a suppression with a reason; measure the override rate |
| **9** | **The evidence fold is decoration** — "11 rows behind this" reads as verification and is not one | make it **cheap to be right**: the count re-checks at paint, so a stale citation flags itself with no human in the loop. **The check is the verification; the fold is for the curious** |
| **10** | **Streaming makes the proposal unreviewable** | nothing that lands in the record streams |
| **11** | **The cost meter chills use, or invites it** — both failures are silent | one row in Settings, counted in asks. Nothing near the input |
| **12** | **The self-hoster gets a second-class app** — which breaks both the distribution engine and the trust proof | Spark is **absent**, not disabled. BYO endpoint is first-class and unmetered. Every deterministic feature byte-identical, **and CI proves it** |

---

## 14 · Open questions

| Question | What settles it | Cost |
|---|---|---|
| **Does the assistant ship in v1?** | decided by [ADR-030](16-DECISIONS.md); the instrument — a 30-day count of unmatched payloads in the raw inbox — belongs to [17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q2, which this row defers to rather than duplicates | — |
| Does gateway caching apply to a streamed response? | send one identical streamed request twice and read `cf-aig-cache-status`. **The public docs do not answer this** | 10 minutes |
| Is the reason field actually filled with real sentences? | ship compulsory reasons for two weeks; measure the length distribution and how often a chip was tapped rather than typed | free |
| Does anyone open the evidence fold? | one event on expand. Under 10% means the fold is decoration and the paint-time check is doing all the work — which is fine, but stop investing in the fold | free |
| Do two agents ever actually collide on one object? | log collisions only. Build `Compare` if it fires | half a day |
| Is a ninth typed interpolation for row sets worth adding? The dialect is closed at eight, and §5 cites rows with `{{ref:…}}` instead | count how many Spark figures are aggregates rather than single paths | free |
| Does an 80-ask cap hold? | meter for one month against the $0.20 budget. If a real month is 90 asks, the meter is theatre and can come out | free |

---

*Back to [00-README](00-README.md).*
