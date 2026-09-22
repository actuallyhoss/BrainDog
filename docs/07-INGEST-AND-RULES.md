# 07 · Ingest and rules

The strongest single reason a hosted instance is worth $12/mo, and the mechanism that turns
*"write a parser"* into *"forward three texts and approve a suggestion."*

---

## 1 · Five ways in, one shape out

| Channel | Is | Self-host |
|---|---|---|
| **webhook** | a public URL that is always up | needs your own reverse proxy. **This is what Cloud sells** |
| **inbound email** | an address per record — `<slug>@in.brain.dog` | a forwarding webhook — `POST /in/email/<token>`, the raw RFC 5322 message as the body — or your own MX. No SMTP receive, no DKIM in-process ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §13 #3) |
| **pull** | a scheduled fetch of something you already own — **[25-CONNECTORS](25-CONNECTORS.md)**, which specifies the `fetch:` block this row promised and never had. The kernel's word is `pull` everywhere: `channel: pull` on the ingest, schedule kind `pull`, outbox `pull.fetch`, event kind `pull` — never `cron` | needs something awake |
| **paste** | a box | **always works, everywhere.** The fallback that never breaks |
| **api** | a `create`/`propose` whose payload is kept raw — the agent door | same |

Five, and `inbox_raw.channel` is the `CHECK` that counts them: `email` · `webhook` · `pull` · `paste` ·
`api`. *(An earlier draft counted four here, and [25-CONNECTORS](25-CONNECTORS.md) counted a different
four.)*

A self-hoster on a laptop cannot provide an always-up endpoint. That asymmetry is not a
crippled free tier — it is a genuine infrastructure difference, and it is the honest reason the
hosted tier has value even though the code is free.

*(Amended September 15th 2026 for `DIRECTION.md` §0b: `channel:` gains two more values beside
`pull`, `call` (an outbound POST fired by a schedule or a rule) and `poll` (watch an endpoint, act
through a rule on a change), declared inside this same `ingest` kind rather than a new one, so the
closed list of kinds in [04-PACKS](04-PACKS.md) §1 did not grow for them. Both are safe by the same rules as `pull`
in [25-CONNECTORS](25-CONNECTORS.md) §4 and §7: a literal origin, one preflight, the install diff
naming every host. `loop/research-modular.md` §3.2 has the detail and the runner it still needs.)*

*(Built September 15th 2026: both channels install, arm and run. A `call` is fired by its schedule; a rule
that fires a `call` is not built. The runner is [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1's and the
grammar is [25-CONNECTORS](25-CONNECTORS.md) §3.3. `inbox_raw.channel` still counts five, because a poll's
answer arrives as `pull`.)*

---

## 2 · Everything lands raw first

```
arrival → inbox_raw (untriaged, sha256, arrival time, channel, headers)
              │
              ├── a declared ingest matches ──▶ extract ──▶ write, confidence: exact
              │
              └── nothing matches ──▶ stays raw ──▶ Spark proposes a pattern
                                                          │
                                                    a suggestion you approve once
```

> **Nothing is ever dropped.** An unmatched payload is kept, with its arrival time, in a raw
> inbox. A pipeline that silently discards what it does not understand is a pipeline you cannot
> trust with a bank statement.
>
> **And nothing is *shown* unless it earns it.** The predecessor learned the other half the hard way
> — it drops unmatched bank texts silently, because *"a review queue that is mostly noise stops being
> read within a week."* Both are right. The resolution: **kept, not shown.** The inbox is a fold at the
> foot of a page with counts per status, never a queue; the proposal loop fires only on three
> same-shape payloads; and a `skipped` status with a reason is the one place a wrong skip ever shows.
> Three more of its ingest rules travel with it, each with a syntax: a **skip list** — `skip: [{ when, reason }]`
> over the arrival — that names why (a refund, a PIN); a **routing table** — `writes.register` may be
> `{ by: [ids], to: [{ when: [values], register }] }`, kind × currency → register — that lands a miss in
> `review` rather than guessing; and a **fuzzy dedupe** against rows already written — `dedupe:` is a field
> list (exact) or `{ near: { on, day, prefix: { field, chars = 12 } } }`: the same `on` fields, the day ±1, a
> folded prefix equal — because a bank sends the same movement twice with two wordings. The record fetches
> the candidates and applies `on_conflict`; the package decides ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §5.2,
> §5.7).
>
> `skipped` and `review` are values of `inbox_raw.state` — `untriaged` · `matched` · `skipped` ·
> `review` · `proposed` · `ignored` · `erased` — with the reason beside them in `inbox_raw.reason`; a
> validation miss lands as `ingest_receipt.confidence = 'needs-review'` (§7). *(An earlier draft named
> statuses no column could hold.)*
>
> **Confidence is derived, never declared.** Each row's confidence comes from its field outcomes —
> `exact` when every field read cleanly, `proposed` when a combinator *chose* or *defaulted*, `needs-review`
> on anything `missing`, `ambiguous` or `invalid` — and `writes.confidence` is only a **ceiling** (default
> `exact`). `exact` writes rows; `proposed` writes **no row** and opens a `rowset` suggestion, the arrival
> parked at `state = 'proposed'`; `needs-review` writes nothing and lands the arrival in `review` with the
> reason ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §5.1; [45-SPEC-RECORD](45-SPEC-RECORD.md) §5.11).

`sha256` of the body is stored and unique-indexed per channel, so the same webhook delivered
twice writes one row. Redelivery is normal; double-counting money is not. Two caps bound extraction —
a body of 2,000,000 bytes and 5,000 rows; over either, the arrival is kept raw in `review` with the
reason and never extracted ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §13 D16). A pull lands one
`inbox_raw` row per page, `channel = pull`; a page that passed keeps its `sha256`, headers and byte
count, and its body for thirty days — the window in which a pattern can still be rolled back and the
page re-triaged ([24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.8) — after which purge sets
`body = NULL`; a page in `review` keeps its body ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D12).

The email and webhook handlers themselves **do no parsing**. They verify, store, enqueue, return
200. A handler that parses is a handler a stranger can crash — and a 5 MiB attachment parsed
inside an email Worker on the free plan will exceed CPU and fail the message.

---

## 3 · The ingest document — extraction is DECLARED, never coded

```yaml
ingest: hsbc-sms
channel: email
match:
  all:
    - { field: from,    is: "alerts@hsbc.com.eg" }
    - { field: subject, contains: "transaction" }
extract:
  amount:   { money: { after: "EGP", currency: "EGP" } }
  date:     { date: { format: "DD/MM/YY" } }
  merchant: { text: { between: ["at ", " on"] } }
  account:  { lookup: { register: accounts, by: last4 } }
writes:
  register: transactions
  confidence: exact
on_conflict: skip          # skip | update | new
```

### The transform vocabulary, and it is closed

| Transform | Does | JSON form |
|---|---|---|
| `after` / `before` / `between` | literal-anchored slice | `{ after: L }` · `{ before: L }` · `{ between: [A, B] }` — also legal as an optional anchor key inside any value extractor below. The literal matches **a case away** (ASCII, over a parallel copy, so the value keeps the capitals the provider sent), **each occurrence is a slice**, and a bare anchor hands back the slice as cut — `{ text: … }` is the one that trims |
| `money` | parse a number and a currency into minor units | `{ money: { after?, currency? } }` |
| `date` | parse to a plain day with an explicit format — never a guess | `{ date: { format, after? } }` — `format` is built from `YYYY` `YY` `MM` `M` `DD` `D` and nothing else; each valid calendar day in the slice, in text order |
| `text` | trim and normalise whitespace | `{ text: { between? } }` — the whole message is normalised first ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §5.1 step 4: zero-width characters removed, space-likes to a space, runs collapsed, lines trimmed), so this is the second trim and not the first |
| `int` / `decimal` | numeric parse with locale-aware separators | `{ int: { after? } }` — grouping allowed, **no fraction** · `{ decimal: { after?, sep?: "." \| "," } }` — `sep` is the **decimal point**, default `"."`; the other separator groups |
| `enum` | map a matched literal to a declared value | `{ enum: { map: { L: V }, after? } }` — the longest literal present **as a whole token**; two of equal length with different values are **ambiguous** |
| `lookup` | resolve a foreign row by a named field | `{ lookup: { register, by, after? } }` — the id whose `by` value occurs as a whole token, anywhere in the slice; longest wins, equal-length different ids **ambiguous** |
| `first` / `nth` | pick from repeated matches | `{ first: [form, …] }` · `{ nth: { n, of: form } }` |
| `default` | a value when the field is absent | `{ default: { value, of: form } }` |

**Ten extractors** — `after`, `before`, `between`, `money`, `date`, `text`, `int`, `decimal`,
`enum`, `lookup` — **and three combinators**: `first`, `nth`, `default`. Counted separately because a
combinator takes an extractor's output rather than reading the payload, and because the builder
shows the count. Thirteen forms, then, and every key, type and default is
[43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §4.3; the forms and the `map:` shapes are that table exactly, and
`declare`'s schema encodes them verbatim ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.7). Three grammar codes
guard them — `EXTRACTOR_UNKNOWN` (a key outside the thirteen), `DATE_FORMAT_INVALID` (a `format` breaking
§4.3's token rules), `PATH_INVALID` (a path outside §4.4's grammar) — raised by `declare` at install and by
`extract` at first use; the grammar family they join is counted in [30-BLUEPRINT](30-BLUEPRINT.md) §6,
which owns the number — a count written twice is a count that goes stale in one of the two places.

> *An earlier draft said nine and enumerated ten, collapsing `int` and `decimal` — two separate rows
> in the table above — into a single invented name, `number`, which appears nowhere else in this
> corpus. **The table was right and the sentence was wrong**, which is the failure mode a stated
> count exists to catch.*

**An extractor's arguments are JSON, never a phrase.** An earlier draft wrote `money: after "EGP"` and
`text: between "at " and " on"` — a mini-language inside a YAML string, with no tokeniser, no escape rule,
and no way to say which currency the number was in. The forms are `{ money: { after: "EGP", currency:
"EGP" } }`, `{ date: { format: "DD/MM/YY" } }` — the `format` tokens are `YYYY` `YY` `MM` `M` `DD` `D` and
nothing else — and `{ text: { between: ["at ", " on"] } }`; `money` accepts `1,250.00`, `1.250,00` and
`1250`. **The thousands rule:** a lone separator followed by exactly three digits is grouping unless the
currency's exponent is 3; with two or more separators the last differing one is the decimal point; a value
that would need rounding is refused ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §13 D2). `money` declares no separator and needs none: the rule above reads `EUR 1.234,56` and
`EUR 1.234.567,89` the European way without being told, which is the whole of what a declared one
bought. The exponent comes from
**a table of every exponent that is not 2, at ISO 4217's values**, held in the kernel and the renderer
alike, because CLDR and ISO disagree on real codes ([02-DATA-MODEL](02-DATA-MODEL.md) §3 rule 1); `extract` owns only a
symbol → code map for detection (`€` → EUR, `E£` → EGP …) and refuses an ambiguous bare `$`
([02-DATA-MODEL](02-DATA-MODEL.md) §3).

**`currency:` is the fallback and never an override** ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §4.3, in
those words). A code written beside the number is the provider saying what it sent; `currency:` is the
reader saying what it expects, and when both exist and disagree the provider wins, because it is the one
that moved the money. A form with no `currency:` reads the first amount that has a code beside it rather
than reading nothing, two currencies either side of one number yield no candidate at all, and
parentheses are negative — `(EGP 75.00)` is a refund. The record reads money through
`@braindog/extract`'s `scanMoney`, handed down by `@braindog/record` because the reader of an arrival is
rank 7 and the scanner is rank 9 ([31-STACK](31-STACK.md) §2); its code list is
`Intl.supportedValuesOf('currency')`, the same place the exponents come from, so `VAT 500` is not five
hundred of anything. **Landed September 20th 2026**; a record opened without that scanner keeps the
older reading, where a declared currency relabelled whatever the text said.

**`int` takes no fraction, and `decimal`'s `sep` is its point** — the two rows in the table above,
read the same way and by the same reader. `1,250.00` is not an integer written with grouping, so
`{ int: {} }` over it yields nothing; `1,250` is, and yields 1250. And a `decimal` whose text
contradicts its declaration reads nothing rather than reading anyway: under the default `sep` of
`"."`, `1.234,56` is not a number this form can take, where the older reading returned 123456 — a
hundredfold on the field most likely to hold a price. Both arrive with `scanMoney`, down the same
seam, for the same reason: one grammar per record, or a declaration means one thing in an integer
field and another in an amount. **Landed September 20th 2026.**

**A literal is a whole token, and two readings are `ambiguous`.** `enum` and `lookup` share one
rule and now share one reader. Matching was `String.includes`, so an `enum` whose map held `in`
read the word `coin` as that literal — a legal value for the field, off a fragment of an unrelated
word, which is why nothing downstream catches it. And neither form could say `ambiguous` at all:
two literals of equal length both present were settled by the order `Object.keys` gave them, and a
`lookup` never noticed a second matching row because it read only the first token of its slice and
looked up exactly that — so a form with no anchor over `Card 1234 debited…` looked up `Card`, found
nothing, and was silent on every arrival. `lookup` now reads the register in one SELECT, which is
what [43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §2 says the record does, and a value of more than one
word can be found at all. **Ambiguity is `needs-review` and never a value** (§5.1 step 7): a text
that said two things is not something a `default` may answer, because the fallback would write the
declaration's guess over a message that contradicted it. **Landed September 20th 2026.**

**A date reads the whole token set, and the build stops being behind the grammar.** The runtime
read four named formats — `DD/MM/YY`, `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` — where
[43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §9.3's own table also reads `9/8/26` as `D/M/YY`,
`29.08.2026` as `DD.MM.YYYY` and `29082026` as `DDMMYYYY`. **That gap was never silent**, which is
what makes it a gap and not a defect: `declare` refused a format the grammar admits and the build
could not read, with the code `NOT_IN_THIS_BUILD` and the sentence *the repair is a deploy, not an
edit*. This was that deploy. The refusal is gone, the four-format list is deleted rather than
extended — it was a second date grammar beside `extract`'s — and `nth` reaches the second date in
a message, which `§9.3` has a row for and one-day-per-slice could not do. `DATE_FORMAT_INVALID` is
untouched: a format's own tokens are what §6 checks, and that never depended on any build.
**Landed September 20th 2026.** Every declared field is **required** and `default` is the only way
to make one optional; `writes.confidence` is a ceiling, never a promise (§2).

**No regular expressions.** A regex over a text field a stranger controls is catastrophic
backtracking waiting to happen, and it is unreadable, which defeats the point of a shareable
declaration. Where one bank words it differently, `first` takes an ordered list of ways — that is
why `first` exists and why no regex is needed. The rule reaches from the declaration into the
implementation: zero `RegExp` in the package, enforced by a lint rule scoped to `packages/extract`
([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §13 D4; [31-STACK](31-STACK.md) §3).

`skip:`, the routing table, `dedupe:` and `on_conflict:` are the record's to apply — inside `arrive`, and
for a pull per page inside `applyPull`. A skip hit stops the pipeline before anything is read, keeps the
bytes, and writes no receipt (43 §5.1 step 2). A routed `writes.register` reads the row's own `by` values
after the fields and before the confidence (43 §5.1 step 6), and a row that matches no `when` tuple is
`review` on an arrival and `kept` on a page — a miss is never guessed into the first target. Then: an exact `dedupe: [id]` matches every named field (lint requires `index: true` on each), a
`near` dedupe runs the window query of §2, and a hit then goes by `on_conflict` — `update` re-enters the
write path, `skip` is counted, `new` creates ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D3).

**What this replaces:** in the prior codebase, one bank cost **75 hard-coded lines** and served
exactly one person. This serves anybody's bank and is a file they can share.

---

## 4 · The loop that is the actual differentiator

An unmatched payload is triaged by Spark, which **proposes an `ingest:` document from three
examples**. You approve it once, through the decision gate, and from then on it is deterministic
and free — no model call, no cost, no variance.

```
  3 unmatched payloads from alerts@cib.eg look like the same shape.

  PROPOSED  ingest.cib-sms
    match     from is alerts@cib.eg
              subject contains "Debit"
    extract   amount    money after "EGP"      → EGP 1,250.00  ✓ 3/3
              date      date format DD/MM/YYYY → 2026-08-29    ✓ 3/3
              merchant  text between "at " and " - " → "UBER"  ✓ 3/3
    writes    register.transactions, confidence: needs-review

  Tested against all 3. Approve, edit, or discard.
  Approving writes a declaration. No model runs on this shape again.
```

A Spark-derived pattern always files with `confidence: needs-review`; a person raises the ceiling to
`exact` at review, once its rows have been looked at ([46-SPEC-SPARK](46-SPEC-SPARK.md) §13 #14).

Three things make this the right shape rather than a gimmick:

1. **It converges to zero cost.** The model is used once per *shape*, not once per *message*.
2. **The output is a readable file** — shareable in the Kennel, and everybody's bank is
   different, which makes ingest patterns the highest-value thing anyone will ever share.
3. **The approval is the product's existing mechanism**, not a new one. Options laid out, one
   named person decides, and it becomes a row with a reason.

> **"Write a parser" becomes "forward three texts and approve a suggestion."**

That is the answer to every *"but my bank is different."*

---

## 5 · What an ingest can never do

| Cannot | Because |
|---|---|
| Run code | it is a pattern, not a script |
| Call out | extraction reads the payload it was given and nothing else |
| Write outside `writes:` | that field is the whole of its permission |
| Silently drop | an unmatched payload is kept raw, with its arrival time |
| Write a row derived from unmatched content without approval | see [12-SECURITY](12-SECURITY.md) §5 |

---

## 6 · Rules

A rule sits directly on top: **`when <where:> then <action>`**, and the actions are a closed list.

```yaml
rule: renewal-30d
register: services            # the rows this rule watches; required
priority: 10                  # default 100; lower fires first
when:
  all:
    - { field: renews, before: "+30d" }
    - { field: state,  is: active }
then:
  - { notify: { tone: warn, say: "{{name}} renews {{until:renews}} — {{money:cost}}" } }
  - { tag: renewal-soon }
once_per: [entry, renews]     # never twice for the same renewal date
```

### Ten actions and one terminator, closed

| Action | Does |
|---|---|
| `tag` / `untag` | add or remove a tag — a value in the register's declared `tags` field (`list<text>`), which a register with either action must declare, `FIELD_UNKNOWN` otherwise; `example` in that field is the seed marker of [04-PACKS](04-PACKS.md) §2 ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §13 D9) |
| `set` | write one declared field to a literal or an interpolation |
| `move` | change a `state` enum to a declared value, **and only along a legal transition** |
| `notify` | emit a notification — the six-field contract in [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §4; a rule never names a `channel` |
| `schedule` | insert a future row into `schedule` |
| `suggest` | open a suggestion with options for a human |
| `link` | set a `ref` field to a resolved row |
| **`create`** | write bounded rows into a declared register — §6.1 |
| `run` | queue one run of a declared `call`, sending the fields of this row that the call's `sends:` names |
| `stop` | halt rule evaluation for this entry |

Ten actions (`tag`, `untag`, `set`, `move`, `notify`, `schedule`, `suggest`, `link`, `create`, `run`)
plus `stop`, which is a **terminator** rather than an action: it does nothing to the row, it halts
evaluation. Stated as eleven would be wrong, and stated as ten without naming `stop` would be
incomplete.

No `http`. No `delete`. A rule never names an address. A rule that needs either of those is an agent.

**`run` names a call, and the call holds everything that leaves.** The host, the key by label and the
fields are declared on the call and approved when it is installed, so a rule can reach nothing the owner
has not already seen:

```yaml
ingest: paid_hook
channel: call
url: https://hooks.example.test/paid
trigger: rule                 # schedule (the default), rule, or both; a rule-only call takes no every
grant: hook key
sends: [invoices.what, invoices.party]
body: { text: "{row.what} is paid" }   # optional; without one the sent fields go as they are
```

- **Only the fields `sends:` names.** The record copies them into the outbox row when the rule fires,
  and the runner never reads the record. A field whose type is `secret` or `file` is refused in
  `sends:` at install, and skipped again when the row is copied. `{row.<field>}` stands only in a
  body, only for a field `sends:` names, and never in the address.
- **Once per row.** A rule with `run` must declare `once_per` (`REQUIRED_MISSING` otherwise). A `run`
  naming no installed call, or a call whose trigger is `schedule`, is refused at install
  (`DECLARATION_UNKNOWN`, `DECLARATION_INVALID`).
- **At most 100 a day per action.** The next one is held with one sentence, metered as `held` rather
  than as a failure, and the owner is told once that day. A paused action queues nothing, and a key
  that is not in the vault pauses it.
- **Never from a bulk apply.** Running a rule over rows that were already there queues no calls; the
  apply counts what it skipped as `calls_skipped`.
- **Approved once, before it can run.** A pack whose plan adds a call, or changes its host, key or
  fields, installs only with `approve`, the plan's own `CALLS OUT` lines, in the same `installPack`. An
  agent proposes the call as a `change`, and accepting it is the same approval. A token does neither.

**`register:` is mandatory on a rule; a rule runs over one register**, and `field: renews` resolves
against it at install. *(An earlier draft's canonical example had no such key, and the dry run in this
section somehow knew it meant `register.services`.)*

### The shapes

Eleven, written out, because six of them had no syntax an implementer could parse:

```yaml
- { set: { field: category, to: "{{merchant}}" } }          # one declared field; a literal or an interpolation
- { untag: renewal-soon }
- { move: paid }                                            # along a legal transition only
- { schedule: { in: 14d, kind: rule, note: "check again" } }
- { suggest: { question: "…", options: ["…", "…"] } }
- { link: { field: account, to: { register: accounts, by: last4, value: "{{last4}}" } } }
- { notify: { tone: warn, say: "…", urgent: false } }        # the engine fills because, to and key — 09 §4
- { tag: x }
- { create: { register: skus, each: [sizes, colours], bound: 60, fields: { … } } }   # §6.1
- { run: paid_hook }                                        # a declared call with trigger: rule or both; once_per required
- stop                                                      # a bare word, always last
```

`notify` carries `tone`, `say` and `urgent`; the engine fills `because` (this rule), `to` (this row) and
`key` (the `once_per` tuple). There is no `channel` — routing is [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md)
§5's, by `urgent`, never the rule's. *(An earlier draft wrote `channel: digest` here, a field the
six-field contract does not have.)*

---

## 6.1 · `create`, and the argument it had to win first

**An earlier draft had no way to make a row from a declaration, and that was not a small gap.**
An adversarial audit modelled four businesses against this platform and found the same wall twice:

- A fashion style is a size run × colourway matrix — 8 sizes × 5 colours = **40 SKUs per style**.
  Nothing could generate them. Forty generated forms, per style, a hundred styles a season.
- A clinic's *"every Tuesday and Thursday for six weeks"* is **twelve appointments**, each with
  its own notes and its own state. A `repeat:` on a date field produces reminders, not rows.

The audit's own recommendation was to **refuse this out loud** and route it to an agent, on the
grounds that [04-PACKS](04-PACKS.md)'s install diff promises *"0 of YOUR rows written"* and that
the platform's governing rule already answers it. That is a serious argument and it is worth
stating before disagreeing with it.

**It loses on three counts.** First, the promise it protects is about **install time**; a rule
fires at *run* time, and rules have always written to your rows — `set` and `move` do nothing
else. Second, that exact objection was already raised and already resolved once: 04 §3 had to be
corrected because packs seed example rows while the diff claimed none were written, and the fix
was **a line in the diff**, not a ban. Third, routing it to an agent means the most mechanical,
most deterministic, most obviously-correct write in the product — a cross product of two declared
lists — is the one thing that requires a language model. That is exactly backwards.

So `create` exists, and every one of its bounds is checkable at install:

```yaml
rule: expand-size-run
register: styles
when:
  all:
    - { field: state, is: approved }
then:
  - create:
      register: skus
      each: [sizes, colours]          # cross product of two list fields on the matched row
      bound: 60                       # refused at install if the product can exceed it
      fields:
        style:  "{{id}}"
        size:   "{{each.0}}"
        colour: "{{each.1}}"
        state:  planned
once_per: [entry, state]
```

| Bound | Enforced | Why this one |
|---|---|---|
| **`bound:` is mandatory**, ≤ 500 | install, against the declared cardinality of the `each:` fields where they are enums; at run time always | a generator with no ceiling is how a rules engine fills a 10 GB object overnight |
| `each:` takes **at most two** list or enum fields | install | two is a matrix. Three is a cube, and nobody has ever wanted a cube |
| The target register must be **declared by the same pack** | install | a pack cannot write into a register somebody else owns |
| Created rows **cannot trigger rules** | run time: a generated row **re-enters the write path at step 2 with `cascade = false`** — locked, coerced, validated and transition-checked like any write; the flag skips step 9 only | §6's no-cascade rule already says this. `create` is the action that makes it load-bearing rather than theoretical |
| Every created row carries `actor: rule:<id>` and a `ref` to its parent | run time | so the whole batch is one query to find, and one action to undo |
| `once_per` is **mandatory** on any rule with a `create` | install | the same rule as `notify`, for the same reason, with a worse failure |
| The install diff gets its own line | install | `SPAWNS  up to 60 rows in register.skus, when a style is approved` |

**And the undo, because a generator without one is a trap.** A `create` batch is a unit: it shares
one `event.batch` — the ULID of the triggering write, never an event *id*, which is a primary key — so
*"undo this expansion"* is one action that soft-deletes exactly the rows that
rule made and nothing a human touched afterwards — a row edited after creation is excluded and
listed by name.

> **What `create` still cannot do:** write outside the declared register, write a `secret`, write
> a `file`, overwrite an existing row, or run at all without a `bound:`.

> **And the idempotency key had a hole.** An earlier draft said `create` *"refuses on the register's
> `key:`"* — but `key:` is a property `series: true` turns on, and the worked example writes into
> `register: skus`, an ordinary named register that has none. Re-running the rule would have
> duplicated forty SKUs.
>
> **The key is the rule, not the register:** every created row carries `_rule`, `_parent` and `_each`
> in `fields`, under one partial unique index — `entry_created_by`,
> [30-BLUEPRINT](30-BLUEPRINT.md) §1; field ids beginning `_` are the kernel's. That tuple exists for
> every `create` by construction — the rule id is the declaration, the parent is the matched row, and
> the tuple is the `each:` position. Re-running is a no-op; changing the `each:` fields creates only the
> new combinations, which is the behaviour a size run actually wants. Row *generation* is declarative.
> Row *judgement* is still an agent's, and still goes through the gate.

### Precedence, and four things the predecessor's rules engine had

Rules evaluate in **`priority` ascending (default 100) → longest literal → `id`**, one pass, at most one
`set` per field. *Longest literal* is the byte length of the longest `is`/`contains`/`starts`/`ends`
literal in the rule's `when:`; a rule with none has length 0. So specificity wins by construction:
`UBER EATS` beats `UBER` at equal priority, and nobody has to remember to set a number for it. There
is deliberately **no bulk reorder** — distinct priorities on every row would switch the length tiebreak
off. **This paragraph is the one place the order is stated**; step 9 of the write path in
[30-BLUEPRINT](30-BLUEPRINT.md) §4 cites it. *(An earlier draft said "declared order" three paragraphs
further down, and had no `priority:` key to be ordered by.)*

| | |
|---|---|
| **`hits`** | how many rows a rule has ever filed, on the row, drawn as `warn` when it is zero and the rule is old — *"never"* is information |
| **Dry run with attribution** | `braindog rule test` returns `matches`, `won`, `lost`, **and `takenBy: { rule: n }`** — which existing rule already claims the rows this one would. A candidate is ranked among the real rules with the id it *would* get, so it loses the tiebreak honestly. It is the READ+ method `ruleTest({ id, against })` |
| **`braindog rule apply --dry`** | re-run every rule over rows where a field is still empty — the predecessor's bulk recategorise. **No undo by design** (sixty writes); the dry run is the undo. It is the ADMIN method `ruleApply({ id, dry })`; neither is a `mode` on `setDeclaration` ([30-BLUEPRINT](30-BLUEPRINT.md) §5) |
| **A person's write beats a rule's, everywhere** | the predecessor has a `pinned` column on one table so a hand-set category survives a re-sync. Here it is the write path — **step 2b, PINNED**, in [30-BLUEPRINT](30-BLUEPRINT.md) §4: a **mechanism** actor — `rule:<id>` or `ingest:<id>`, and nothing else — may not `set` a field whose last `event.actor` is a person, so such a field is **never overwritten by a rule, an ingest or a connector.** Sessions, `agent:` tokens and `system` are exempt: the rule pins a field against machinery, not against the next person or agent who edits it ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §13 #5). One rule, every register |

### Three properties that stop a rules engine becoming a haunted house

**1 · `once_per` is mandatory on any rule with a `notify`.** It keys on a tuple; the engine
records the key and never fires twice for it. A renewal reminder that fires every night until you
act is a reminder you filter to a folder. The record is a `schedule` row of kind `rule` under that
table's `(kind, key)` unique index — one table, one uniqueness, one insertion path
([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.7; [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1).

**A rule about time is read again as time passes.** A rule fires when a row is written, and `due before -7d`
becomes true of an invoice nobody touches. So the hourly sweep reads every rule whose `when:` names a day
relative to today (`today`, `yesterday`, `tomorrow`, `-7d`, `+30d`) and declares `once_per` over its rows, as a
bulk apply: the marker keeps each firing to once, and a bulk apply queues no calls. A rule that names no
such day is never swept, because rows that were already there are not news to it.

**2 · Rules are ordered, and evaluation is bounded.** They run in the order stated above — priority,
longest literal, id — one pass, max one `set` per field per pass. **No rule can trigger another rule's re-evaluation in the same
pass** — a cascade is how a rules engine becomes non-deterministic, and a non-deterministic rules
engine over money is a defect.

**3 · Every rule action writes an `event` naming the rule.** `actor: rule:renewal-30d`. When
something in the record changed and nobody remembers doing it, the answer is one query away.

### Dry run, always available

```
$ braindog rule test renewal-30d
  matches 4 of 38 rows in register.services
    #12 Cloudflare Workers Paid   renews 2026-09-01   would notify, tag
    #19 brain.dog                 renews 2027-08-30   — outside +30d
  once_per would suppress 1 of 4 (already fired for #12 / 2026-09-01)
```

A rule you cannot test before enabling is a rule you enable and hope. This runs the real
predicate against the real rows and writes nothing.

## 6.2 · A rule with a trigger and steps is an automation

*(Added September 22nd 2026 for [DIRECTION §22](../loop/DIRECTION.md)'s automations layer. The design is
`loop/research-shell-automations.md` §2 to §4; this section is what the lint holds and what the runner does. The steps
that wait on somebody else, a call, a script, Spark or a person, are later work, and the section says where a run
meets one.)*

**Not a kind of its own.** [04-PACKS](04-PACKS.md) closes the list of kinds, nine since `script` joined it on
September 22nd (`KINDS` in `packages/kernel/src/declare.ts`), so an automation is a `rule` body that has
grown two keys: `on:`, what starts it, and `steps:`, what it does. A rule with neither is an automation whose trigger
is a write to its register, which is every rule installed before this section was written. The canvas can open all
of them.

```yaml
rule: gold_rate
on: { every: 1h }                         # or written, arrival, manual
steps:
  - call: { ingest: gold_price, as: price }
  - if: { field: price, gt: 3000 }       # a condition over the run's answers
    then:
      - notify: { say: "Gold is at {{vars.price}}" }
```

**Two paths, and the body decides which.** `pathOf` in `packages/kernel/src/flow-lint.ts` answers `inline` or
`run`, and nobody declares it:

- **inline** is this section's rules as they have always run, inside the write's transaction: a write trigger with
  no filter, and a `then:` list.
- **run** is everything else: a clock, an arrival, a button, a write trigger that filters by `op:` or
  `fields:` or accepts writes made by rules (`from_rules:`), or any `steps:` list. The inline pass cannot read any of
  these. It fires on every write of the register, it has no idea which fields changed, and it walks `then:` alone.

**What the lint refuses, and why each is refused rather than ignored.** Each of these installed before September
22nd, and each would then have done nothing.

| Refused | Because |
|---|---|
| no `register:` and no `on:` | the pass selects rules by register, so nothing would ever start it |
| `every:` under `15m`, or a clock it cannot read | fifteen minutes is the shortest clock the record keeps, as it is for a connector; `at:` belongs to `every: 1d` or `every: 1w` with a `day:` |
| two triggers in one `on:` | a run has to say which one started it |
| `decided:` | reserved: a run's own questions resume it without a trigger |
| `metric:`, once its id and its `crosses:` are right | nothing in this build watches a metric for a crossing, so it would install and never start: `NOT_IN_THIS_BUILD` until the start lands in the `snapshot` handler |
| a run-path `written` rule with `once_per` whose `when:` names a day relative to today (`today`, `-7d`) | the hourly re-read that makes such a rule fire as days pass reads inline rules only: `NOT_IN_THIS_BUILD`. Written with `register:` and `then:` it is swept |
| a top-level `register:` on the run path | the inline pass would also run the body inside every write of that register |
| `on: { written: { register } }` inline without `register:` beside it | the inline pass reads the top-level key and nothing else |
| a row verb (`tag`, `set`, `move`, `note`, `run` and the rest) or a `when:` on `every`, `metric` or `manual` | those triggers have no row to act on |
| `enabled: false`, `limits:` or `project:` on the inline path | the inline pass reads none of them, so a switch would be drawn and do nothing: `NOT_IN_THIS_BUILD` |
| `then:` and `steps:` together | one list of things |
| more than 50 steps, counting both arms of every branch; a branch nested past 3; more than 64 answer names | the kernel's ceilings, which `limits:` may lower and never raise (`runs_per_day` at most 1,000) |
| a `call` step naming an address, or a call that is not declared with `trigger: rule` or `both` | a step names a declared call, whose host, key and fields were approved at install, exactly as `run:` does |
| a `call` step or `run:` whose call `sends:` fields of a register, on a trigger that brings no row of that register: a clock, a button, or an arrival whose `ingest:` does not write it | the call would post a row nobody handed it. A call that sends nothing, such as the price in the example above, needs no row and runs on a clock |
| an answer name (`as:`) that is not an identifier, or is `trigger` or `vars` | it is read back as `{{vars.<name>}}`, and those two are the run context's own keys |
| a step that notifies, creates, suggests, runs, calls or asks about a written row with no `once_per` | the same reason `notify` has always needed it |

A `create` inside a branch meets the same bound and the same foreign-register check as one in `then:`, because the
lint walks every action wherever it sits.

**One older shape is let through, and only one.** Some rules carry `on: create` as a word. Nothing ever read it:
the pass fired those rules on every write. They lint as they did and answer `inline`. `create` is the only word any
rule in the seed, the packs, the docs or the fixtures carried, so any other word is refused with a sentence:
`on: hourly` used to install as an inline rule that fired on every write of its register, and is now told to write
`on: { every: 1h }`.

An arrival trigger with a `when:` is refused as `NOT_IN_THIS_BUILD`: the runner does not read one, and a filter that
filters nothing is worse than none. A `script` step is checked for shape only, because `script.<id>` is the scripts
brief's declaration.

### What the runner does

`packages/kernel/src/flow.ts`, over two tables from kernel migration 11, `automation_run` and `automation_step`.

**A run is a row, and so is each step it took.** The run pins the declaration's version for its life, so a run that
waits a day while somebody edits the rule finishes the steps it started with. Its steps are flattened into one list,
with a branch as a jump, and the run row holds the index of the next one; a step row is keyed by that index. Nothing
is held in memory between two steps, so a restart in the middle of a wait loses nothing.

**Each trigger only records that a run is due.** The run is inserted `pending` and its schedule row armed for now, in
the transaction of whatever started it, and the next drain takes its steps.

| Trigger | Where it is noticed | What it reads |
|---|---|---|
| `written` | the write path, beside the inline pass | `op:`, `fields:` (which fields this write changed), `project:` (the row's scope field), `when:`, and `once_per:`, claimed when the run starts with the marker an inline rule uses |
| `arrival` | after `arrive` has committed, in a transaction of its own | `ingest:`, `channel:`, `state:`; never a redelivery, and never an arrival nothing verified unless the trigger says `unverified: true`. The run's row is the first row the arrival wrote |
| `every` | a `rule` schedule row keyed `flow.every:<id>`, armed at install one interval out, or at the next `at:` | taken at once when the row fires; the next turn counts from when this one was due, so an hourly rule stays on its hour |
| `manual` | `automationRun(rule, actor)` on the kernel | only a rule that says `on: { manual: true }` |

`metric` is noticed nowhere yet, and the lint refuses it until it is.

**An arrival nothing verified starts nothing, unless the rule asks for it.** A webhook with a wrong token is stored
`untriaged` and offered no pattern, and until September 22nd it still started every arrival automation on its
channel. The audit of that week sent five such posts at a rule with `runs_per_day: 5`: each started a run that wrote
the sender's own text into a note, and the owner's real message after them started nothing, because the day was
spent. A rule that wants to hear about bad tokens says `on: { arrival: { unverified: true } }`, and its run reads
`{{trigger.verified}}` as `false`. `unverified:` is true or false; anything else is refused at install. An arrival
from a door that cannot be asked (`pull`, `paste`, `api`) counts as verified, as it does for matching.

**A run started by a delete reads the deleted row.** A deleted row is hidden from every read, so the run is marked as
started by a delete and reads the row from the record past that filter: its `if` conditions and its `{{trigger.row.…}}`
read the row, and a step that would write to it fails the run with a sentence saying the row was deleted, rather than
bringing it back. The run holds no copy of the row, so an erasure that tombstones the row reaches what the run reads.

**A write made by a rule starts nothing,** unless the trigger says `from_rules: true`. Then the run carries the
writer's depth plus one, and a fourth level is not started. Rules have never chained; a chain is a thing somebody asks
for in writing.

**The steps.**

| Step | What the runner does |
|---|---|
| any action of the table above | one step through the inline pass, against the run's row, with the rule's own name as the actor: the write path, the transitions and `create`'s bound apply as they do to an inline rule. On a run with no row, `notify` writes a note (or interrupts, when `urgent`), `suggest` opens a question, and the row verbs fail the run |
| `set_var` | fills `{{vars.…}}` and `{{trigger.…}}` into `to:` and keeps the answer; one answer holds 4 KB, all of them 64 KB |
| `if` | reads the condition with the sentence builder over the run's row and its answers together; a field of the row wins over an answer of the same name |
| `wait` | parks the run on its own schedule row and resumes it when the span has passed. A wait whose step row already says `done` is over and is not armed again |
| `call`, `script`, `ask_spark`, `ask_person` | fail the run there, with a sentence saying the step is not in this build; the steps before it stand |

**Where the run is, is saved after every step that finishes,** not only at a wait and at the end. A run that stops
between two steps carries on from the next one and never takes a finished step a second time.

**A step that throws fails the run.** The runner catches it, marks that step `failed` and ends the run `failed` with
a sentence naming the step and the error. Before September 22nd a throw went to the drain's retry ladder with the run
still `running`, and every retry took again each step since the last wait: one row sent the same notify six times in
twelve hours, and a run with no wait ended `running` for ever, outside the ninety-day prune.

`{{vars.<name>}}` and `{{trigger.<path>}}` are filled in every string of a step before the row's own `{{field}}`s are.
`trigger` carries the kind, the row's fields as `row`, the arrival's `channel` and `ingest`, and for an arrival its
body, parsed when it is JSON.

**Ceilings.** `limits.runs_per_day` (at most 1,000) is counted over the last twenty-four hours, and a run past it is
refused with a sentence and not started. A rule with `enabled: false` starts no runs.

**Switching a rule off or retiring it stops the runs it already started.** The install that sets `enabled: false`,
by hand or in a pack's version, and the kernel's `retire`, cancel every unfinished run of that rule in their own transaction, each with a sentence
saying why. The runner also asks at every wake whether an active, not-retired version of the rule exists and is on,
and cancels the run when not, so a rule a pack took away when it was turned off stops its runs as well. A plain edit
does not: a run keeps the version it started under and finishes those steps.

**What is kept, and what is counted.** A finished run is kept ninety days and pruned by the hourly sweep. Every run
that ends writes one `pull` event with actor `rule:<id>`, the same shape a scheduled action's run writes, so the ledger
that counts scheduled actions counts automations beside them: a failed or cancelled run is free, as a failed action is.
A run can be cancelled while it waits, and its wake is dropped with it.

**Not yet.** Runs are `local`: they do not travel in a `.brain` file, and carrying them means a format revision. A
`call`'s answer, Spark's answer and a person's decision do not resume a run yet.

---

## 7 · The pipeline, mechanically

Ingest is **one deterministic transaction** — `arrive`, an INTERNAL method of the record: store → match →
extract → validate → write → rules → outbox, with no model call inside it. It *may become* a Workflow the
day a model call re-enters the pipeline; in v1 none does ([45-SPEC-RECORD](45-SPEC-RECORD.md) §13 #18;
[51-SPEC-WORKER](51-SPEC-WORKER.md) §13 D12). *(An earlier draft said "is a Workflow", on the strength of
a step that no longer sits inside it.)*

| Step | Note |
|---|---|
| 1 · store raw | idempotent on `sha256` |
| 2 · match declared ingests | pure, no cost; the first matching ingest wins |
| 3 · extract | pure, no cost |
| 4 · validate against the register | a failure downgrades to `needs-review`, never discards |
| 5 · write | **per arrival, all rows or none.** The receipt is one row per arrival, its `wrote` filled by the record; a skipped arrival has no receipt ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §13 D11) |
| 6 · run rules | bounded, one pass |
| 7 · notify | deduped by `once_per`; anything that must leave the object is an outbox row |
| 3′ · propose a pattern (unmatched only) | **outside the transaction.** An unmatched shape earns one `infer.draft` outbox row at its **third** arrival in 30 days — never a model call per payload — and the ack files the proposal (§4). Retried by a person, from the raw inbox, because retrying a model call automatically bills twice for one payload |

Queues stay the front door — they absorb a burst and hand the record one call — and it is the record's
single transaction that survives a deploy mid-run, not in-memory state in a consumer.

---

*Next: [08-METRICS-AND-ANALYTICS](08-METRICS-AND-ANALYTICS.md).*
