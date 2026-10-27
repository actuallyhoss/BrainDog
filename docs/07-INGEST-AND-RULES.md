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

*(Amended September 15th 2026: `channel:` gains two more values beside
`pull`, `call` (an outbound POST fired by a schedule or a rule) and `poll` (watch an endpoint, act
through a rule on a change), declared inside this same `ingest` kind rather than a new one, so the
closed list of kinds in [04-PACKS](04-PACKS.md) §1 did not grow for them. Both are safe by the same rules as `pull`
in [25-CONNECTORS](25-CONNECTORS.md) §4 and §7: a literal origin, one preflight, the install diff
naming every host.)*

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
              └── nothing matches ──▶ stays raw ──▶ Slash proposes a pattern
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
  merchant: { text: { between: ["at ", " on"] }, strip: ["FAWRY*", "PAYMOB*"] }
  account:  { lookup: { register: accounts, by: last4 } }
writes:
  register: transactions
  confidence: exact
on_conflict: skip          # skip | update | new
```

A webhook ingest also declares `verify:`, checked at the door and never in code (`packages/kernel/src/declare.ts`):

| `verify:` | Checks | Row |
|---|---|---|
| `{ kind: path }` | a random segment minted into the door's own URL, kept only as its SHA-256 | `ingestMint` |
| `{ kind: hmac_sha256 \| stripe \| github, header?, key: <Keychain label>, tolerance?: 1s..60m, stripe only }` | the signature the sender put over the raw body, with the key named by its Keychain label and never written into the declaration | `packages/host/src/ingest.ts` |

`header` defaults to what each sender actually sends when the declaration names none: `X-Signature` for `hmac_sha256`,
`Stripe-Signature` for `stripe`, `X-Hub-Signature-256` for `github`. `tolerance`, how far the signed time may sit from
now, is Stripe's alone, since Stripe is the one sender here that signs the time along with the body.

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

**A `lookup` reads digits printed behind stars as a tail, and the first row it files that way waits
for a person.** When no row's value is a whole token in the slice, a run of stars, one `-` or space,
and three or more digits in the slice's first token name the one row whose longer value ends in
those digits; two such rows are **ambiguous**. The stars may sit in the anchor, as in
`between: ["***-", " "]`. A bank prints one account as `***6518` in one message and `***-518` in
another, and this is how both reach the same row. But the digits are part of a number, not the
number, and a transfer filed to the wrong account is wrong money: so a field found only this way
has the outcome `tail`, and the arrival files at `proposed` at most, with the reason *Filed to
Cairo savings by its last digits 518. Confirm it once and later ones file straight away.* Once a
person has accepted one such arrival for that ingest, account and tail, the later ones file at
`exact`. The confirmation is the accepted rowset itself, which carries the tail it waited on; a
rejected one confirms nothing, and another tail on the same account waits again. A row the slice
names by its whole value is filed as it always was. The rule is `matchLiterals` in
`packages/extract/src/extractors.ts`; the confirmation is `confirmedTail` in
`packages/kernel/src/ingest.ts`.

**A field that reads text may take a prefix off it: `strip: [prefix, ...]`.** A card payment made
through an acquirer arrives as `FAWRY*Vodafone` or `PAYMOB*Talabat`, and the merchant is the part after
the star. `strip` sits beside the field's form, never inside it, so `{ first: [...], strip: ["FAWRY*"] }`
strips whichever arm answered. After the form has read the value, the longest listed prefix the value
starts with is taken off, **a case away** (the same ASCII fold the anchors use, so the name keeps the
capitals the bank sent), and the value is looked at again, so `FAWRY*PAYMOB*Talabat` loses both; then
every run of white space becomes one space and the ends are trimmed. A value the prefixes leave empty is
a miss, as an empty slice is. `declare` refuses a `strip` that is not a list of 1 to `STRIP_MOST`
prefixes, each no longer than an anchor may be (`LITERAL_BYTES`), and one beside a form whose value is not text (`money`, `date`, `int`,
`decimal`, `enum`, `lookup`, or a combinator holding one): an amount has no prefix, and a row's id or a
declared value with its start cut off is a value nobody declared. The ceiling and the cut are
`STRIP_MOST` and `stripped` in `packages/kernel/src/ingest.ts`; the check is `stripFault` in
`packages/kernel/src/declare.ts`.

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

An unmatched payload is triaged by Slash, which **proposes an `ingest:` document from three
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

A Slash-derived pattern always files with `confidence: needs-review`; a person raises the ceiling to
`exact` at review, once its rows have been looked at ([46-SPEC-SLASH](46-SPEC-SLASH.md) §13 #14).

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

**A door can still hand its arrival to a script.** The ingest runs no code, but a `script` declaration whose
`runs.door` names it is started by each verified arrival at it: the arrival is stored and matched as ever, and one
`script.run` is queued for each such script with `input: { body, headers }`, in the arrival's own transaction
(`startAtDoor` in `packages/kernel/src/script.ts`, called from `arrive` in `ingest.ts`). An unverified arrival, a
redelivery of bytes already offered, a paused script, and an arrival too big to queue start nothing, and past
`doorRunsPerDay()` a day the script is not started and says so once. The script runs in the host's sandbox, never in
the record, and writes only what its `writes:` names ([25-CONNECTORS](25-CONNECTORS.md) §12).

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
| `link` | set a `ref` field to a resolved row, found by the ladder below the shapes |
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
  that is not in the Keychain pauses it.
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

**`link` finds its row by a ladder, and links one row or none.** The value is filled from the row, and
then:

1. **The whole value.** One row of the linked list whose `by` field equals the value is linked,
   whatever that row says about how it matches. Two such rows link nothing: *two rows bear that
   name*.
2. **How it starts, then anywhere in it.** Only if the linked list declares a field named for `by`
   with `_by` after it (`match` and `match_by`), whose value is `exact`, `starts` or `contains`. A row
   saying `starts` is found when the value begins with its `by` text, and one saying `contains` when
   the value holds it anywhere, both **a case away** over the anchors' ASCII fold. Every row saying
   `starts` is tried before any saying `contains`.
3. **The first rung that finds a row decides, and on it the longest `by` text wins.** `FENWICK CLOUD
   LTD` beats `FENWICK` on the same rung. Two rows of the same longest length on that rung are a tie,
   and a tie links nothing and asks nothing: *two rows match it equally well*.

A list with no such field is linked by the whole value alone, which is what every `link` did before
the ladder, so nothing a record already files moves. money-core's `categories` declares
`match_by` (default `exact`), and `txn-categorise` links a transaction's `category` by `match`, so a
category that says `starts` files `FENWICK CLOUD` and `FENWICK CLOUD LTD 4471` alike. The lower rungs
read at most `LADDER_ROWS` rows of the linked list per link, longest first. The dry run below reads
the same ladder, and says the rung when it is not the whole value (*link category, matched by how it
starts*). The read is `linkOf` in `packages/kernel/src/rules.ts`.

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

*(Added September 22nd 2026 for the automations layer. This section is what the lint holds and what the runner does. Of the
steps that wait on somebody else, asking a person runs, and can put the question to one member; asking Slash runs on
a host with a model and is refused at install on one without; a script step starts the script and does not wait for
it, since September 24th; a call step sends its declared call and waits for the answer. Checked against the code
again on September 28th.)*

**Not a kind of its own.** [04-PACKS](04-PACKS.md) closes the list of kinds (`KINDS` in
`packages/kernel/src/declare.ts`, which `script` and `job` have joined since it was written), so an automation is a
`rule` body that has grown two keys: `on:`, what starts it, and `steps:`, what it does. A rule with neither is an automation whose trigger
is a write to its register, which is every rule installed before this section was written. The canvas can open all
of them.

```yaml
rule: queue_watch
on: { every: 1h }                         # or written, arrival, metric, decided, manual
steps:
  - call: { ingest: queue_depth, as: depth }   # a declared call; the run waits for its answer
  - if: "depth > 100"                          # a condition over the row and the run's answers
    then:
      - notify: { say: "The queue holds {{vars.depth}}" }
```

**Two paths, and the body decides which.** `pathOf` in `packages/kernel/src/flow-lint.ts` answers `inline` or
`run`, and nobody declares it:

- **inline** is this section's rules as they have always run, inside the write's transaction: a write trigger with
  no filter, and a `then:` list.
- **run** is everything else: a clock, an arrival, a button, a write trigger that filters by `op:` or
  `fields:` or accepts writes made by rules (`from_rules:`), or any `steps:` list. The inline pass cannot read any of
  these. It fires on every write of the register, it has no idea which fields changed, and it walks `then:` alone.

**What installs and what runs is one table.** Each trigger and each step is one row in
`packages/kernel/src/capabilities.ts`: whether it installs, whether a run takes it, on which hosts, and the words said
where it does not. The lint, the runner, the record's dry run and the grammar an agent reads (`braindog:grammar/automations`,
whose `not_in_this_build` is those rows) all read that table, so none of them says a capability the others do not. What
the rows say today: every trigger installs and starts a run, and every step installs and runs, except that
`ask_slash` runs only on a host that answers Slash.

**What the lint refuses, and why each is refused rather than ignored.** Each of these installed before September
22nd, and each would then have done nothing.

| Refused | Because |
|---|---|
| no `register:` and no `on:` | the pass selects rules by register, so nothing would ever start it |
| `every:` under `15m`, or a clock it cannot read | fifteen minutes is the shortest clock the record keeps, as it is for a connector; `at:` belongs to `every: 1d`, to `every: 1w` with a `day:`, or to a clock of months. The grammar is under *The clock*, below |
| a clock of months that does not divide the year (`5mo`, `2y`), or that leaves out its `day:` or its `at:`, or a count above one with no `month:`, or `month:` on `1mo` | each of those decides which day it runs, and none is defaulted: a missing `day:` could mean the 1st or the day it was installed, and the second moves whenever the rule is edited (`calendarFault` in `packages/kernel/src/flow-lint.ts`) |
| two triggers in one `on:` | a run has to say which one started it |
| `late:` beside `every:` that is not a span (`6h`) | it says how late a turn may be taken, and a turn past it is recorded as skipped |
| `metric:` naming no declared metric, a `crosses:` other than `target`, `{ lte: n }` or `{ gte: n }`, or `target` on a metric that declares none | the hourly sweep reads which side of that line the figure is on, and there would be no line |
| `decided:` with a key other than `about:` and `option:`, an `about:` that is not a declaration id, or a `when:` beside it | the decision is narrowed by the declaration that filed the question and the answer chosen; a condition on the question's row is an `if` step |
| a top-level `register:` on the run path | the inline pass would also run the body inside every write of that register |
| `on: { written: { register } }` inline without `register:` beside it | the inline pass reads the top-level key and nothing else |
| a row verb (`tag`, `set`, `move`, `note`, `run` and the rest) or a `when:` on `every`, `metric` or `manual` | those triggers have no row to act on |
| `limits:` or `project:` of the wrong shape, on either path, or more `then:` items than `limits.steps_per_run` inline | the inline pass reads `enabled`, `project` and `limits` as a run does, so every rule can be switched off |
| `then:` and `steps:` together | one list of things |
| more than 50 steps, counting both arms of every branch; a branch nested past 3; more than 64 answer names | the kernel's ceilings, which `limits:` may lower and never raise (`runs_per_day` at most 1,000) |
| a `call` step naming an address, or a call that is not declared with `trigger: rule` or `both` | a step names a declared call, whose host, key and fields were approved at install, exactly as `run:` does |
| a `call` step or `run:` whose call `sends:` fields of a register, on a trigger that brings no row of that register: a clock, a button, or an arrival whose `ingest:` does not write it | the call would post a row nobody handed it. A call that sends nothing, such as the one in the example above, needs no row and runs on a clock |
| an answer name (`as:`) that is not an identifier, or is `trigger` or `vars` | it is read back as `{{vars.<name>}}`, and those two are the run context's own keys |
| a step that notifies, creates, suggests, runs, calls or asks about a written row with no `once_per` | the same reason `notify` has always needed it |
| an `ask_person` with fewer than two `options:`, or the same one twice | the question is opened through the gate's own `propose`, which refuses a choice of one, so it would install and fail at every run |
| `to:` on an `ask_person` that is not text, or is blank | it is the id of the one member the question is put to, or a hole the run fills with one (`{{trigger.row.owner}}`). Whether that id is a member now is asked when the run reaches the step, since who is a member changes after install |
| `about:` on an `ask_slash` that is not a list of field ids, on a trigger with no row, naming a field the row's list does not have (`FIELD_UNKNOWN`), or naming a `secret` or `file` field | `about:` is the fields of the run's row that go with the question, and a secret or a file never leaves the record |
| an `ask_slash` whose `question:` names a `secret` or `file` field of the row (`{{pin}}`, `{{trigger.row.pin}}`), the whole row of a list that has one (`{{trigger.row}}`), or a variable a `set_var` before it filled from one, directly or by way of another variable | the question leaves the record as surely as `about:` does. The refusal names the `set_var` where the field went in |
| `ask_slash`, once its `question:`, `as:`, `shape:`, `choices:` and `about:` are right, on a host that does not answer one | nothing would lease the `infer.ask` job it queues, so a run would wait its day and fail with nobody asked: `NOT_IN_THIS_BUILD`, *"… no host in this build answers an automation's question to Slash. Ask a person with ask_person instead."* Which hosts answer is under *Who answers a question to Slash*, below |

A `create` inside a branch meets the same bound and the same foreign-register check as one in `then:`, because the
lint walks every action wherever it sits.

**The clock.** `every:` is either a length or a count of months, and what may sit beside it depends on which.
A month is no number of milliseconds, so a clock of months never goes through `intervalMs`: `packages/kernel/src/clock.ts`
works out each run as the next date on the wall of the record's zone.

| `every:` | `at:` | `day:` | `month:` |
|---|---|---|---|
| `15m` and up, in `m`, `h`, `d` or `w` (`6h`, `2d`) | refused, except on the two below | refused, except on `1w` | refused |
| `1d` | optional, `HH:MM` | refused: *"Write every: 1w for a weekday, or every: 1mo for a day of the month"* | refused |
| `1w` | optional, `HH:MM` | `mon` to `sun`: required with an `at:`, refused without one | refused |
| `1mo` | required, `HH:MM` | required: `1` to `31`, or `last` | refused: it would choose nothing |
| `2mo`, `3mo`, `4mo`, `6mo`, `12mo` or `1y` | required, `HH:MM` | required: `1` to `31`, or `last` | required: `jan` to `dec`, the month it counts from |

```yaml
on: { every: 1mo, day: last, at: "09:00" }              # the last day of every month
on: { every: 3mo, day: 15, at: "08:30", month: feb }    # 15 February, May, August and November
on: { every: 1y, day: 1, at: "09:00", month: apr }      # 1 April every year
```

- **The day is clamped and never carried.** `day: 31` runs on 30 April and on 31 May, because each run is worked out
  from the rule and never from the day the one before landed on.
- **Every few months names its month.** Without `month:`, a quarter would count from wherever the schedule row was
  armed, and an edit re-arms it from today, so fixing a typo would move the quarter. With it, the months are written in
  the rule, and the count divides the year so they are the same months every year. `12mo` and `1y` are one clock.
- **The time is the record's zone,** and a time the zone skips or says twice is read as `clock.ts`'s `instantOf`
  says. That is not always the reading a digest at the same time gives, on the two nights a year the clocks change.

The canvas offers the same clocks (`apps/web/src/lib/flow/calendar.ts`): 15 minutes to a week, then every month,
2, 3, 4 or 6 months, and every year, with the month, the day and the time as fields. A rule written with `12mo` opens
with its own clock kept. Every pick and edit of a clock is written from the clock it was (`clockTo`), keeping what the
new clock reads and supplying what the lint requires, so a pick from `1mo` to `3mo` keeps its day and adds a month. The
canvas's fault list (`faultsOf` in `apps/web/src/lib/flow/flow.ts`) raises nothing about a clock of months, so Send is
on for a monthly rule the record takes. The card and the sheet's heading say the clock as the record says it on Decide
(`calendarWords`, *"On the last day of each month at 09:00"*), and one the record would refuse as it was written.

**One older shape is let through, and only one.** Some rules carry `on: create` as a word. Nothing ever read it:
the pass fired those rules on every write. They lint as they did and answer `inline`. `create` is the only word any
rule in the seed, the packs, the docs or the fixtures carried, so any other word is refused with a sentence:
`on: hourly` used to install as an inline rule that fired on every write of its register, and is now told to write
`on: { every: 1h }`.

An arrival trigger's `when:` is read over the first row the arrival wrote, and with no row over the top-level keys of
its JSON body, text, numbers, true and false. A `script` step is checked for shape only, because `script.<id>` is a declaration
of its own: whether the script is installed, says `runs: { rule: true }` and is not paused is asked when a
run reaches the step, as the table below says.

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
| `written`, about time | the hourly sweep (`onTime`), for a rule with `once_per` whose `when:` names a day relative to today | `when:` over the list's rows, at most `SWEPT_ROWS` (in `packages/kernel/src/flow.ts`) a rule an hour, `project:`, and `once_per:`, with the same marker, so a row the write already started a run for starts none. `op:` and `fields:` are about writes, and a day passing writes nothing |
| `arrival` | after `arrive` has committed, in a transaction of its own | `ingest:`, `channel:`, `state:` and `when:`; never a redelivery, and never an arrival nothing verified unless the trigger says `unverified: true`. The run's row is the first row the arrival wrote |
| `every` | a `rule` schedule row keyed `flow.every:<id>`, armed at install one interval out, at the next `at:`, or for a clock of months at its next date; an install that changes the clock while a turn is pending arms it again from the new clock | taken at once when the row fires, and so is every turn after it the drain has also passed, each as its own run with its own instant, never folded into one. Each next turn counts from the one before, so an hourly rule stays on its hour and a monthly one on its day. Past `late:`, or past `limits.runs_per_day`, a turn is recorded and not taken, and a turn recorded that way is not counted against `runs_per_day`; past `MISSED_TURNS_CEILING` turns in one drain, the rest are said in one skipped run |
| `metric` | the hourly sweep (`onMetrics`), which reads the figure as a page reads it | which side of the line the figure is on, kept per rule in `automation_watch` (migration 17). The first reading sets the side and starts nothing; a reading that says nothing, such as mixed currencies, keeps it; a change of side starts one run, whose trigger carries the figure's `id`, the `value` read and the `side`, `above` or `below`. At most `WATCHED_PER_SWEEP` figures an hour, the longest unread first |
| `decided` | the kernel's `decide`, inside the decision's transaction (`onDecided`) | `about:` (the declaration that filed the question, or that a change proposes) and `option:` (the chosen answer's id, else its words exactly); once per question and rule. The run's row is the one the question's body names, which a rule's `suggest` writes as `about`, and its trigger carries the `suggestion`, the `option`'s words and `about`. A run's own `ask_person` question starts nothing here |
| `manual` | `automationRun(rule, actor)` on the kernel | only a rule that says `on: { manual: true }` |

**A late turn is recorded, not taken, where the clock says so.** `on: { every: 1d, at: "08:00", late: 6h }`: a turn
the drain reaches more than six hours after it was due is written as a run `cancelled` with its sentence and one step
`{ n: 0, kind: late, state: skipped }`, which the runs list draws as Skipped. `automation_run.state` has no `skipped`,
so no CHECK changes.

**An arrival nothing verified starts nothing, unless the rule asks for it.** A webhook with a wrong token is stored
`untriaged` and offered no pattern, and until September 22nd it still started every arrival automation on its
channel. A test that week sent five such posts at a rule with `runs_per_day: 5`: each started a run that wrote
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
| any action of the table above | one step through the inline pass, against the run's row, with the rule's own name as the actor: the write path, the transitions and `create`'s bound apply as they do to an inline rule. On a run with no row, `notify` writes a note (or interrupts, when `urgent`), `suggest` opens a question, `create` makes its rows with the clock's turn (`<rule>@<turn>`) or else the run as their parent, one set per turn or run, so a monthly clock makes the next task each month and a turn delivered twice makes it once (`createAlone` in `rules.ts`), and its `bound:` is the most it makes in a day: on a clock, counted over the rows the turns of the twenty-four hours before this turn made, so a drain that takes three missed months in one pass makes each month's rows; anywhere else, over the rows the rule made in the last twenty-four hours; the row verbs fail the run |
| `set_var` | fills `{{vars.…}}` and `{{trigger.…}}` into `to:` and keeps the answer; one answer holds 4 KB, all of them 64 KB |
| `if` | reads the condition with the sentence builder over the run's row and its answers together; a field of the row wins over an answer of the same name |
| `wait` | parks the run on its own schedule row and resumes it when the span has passed. A wait whose step row already says `done` is over and is not armed again |
| `ask_person` | opens an `options` suggestion through the gate, by `rule:<id>`, whose body carries the run and the step, and parks the run until the end of its `wait:` (a week when it names none). A decision on it hands the chosen option's words to the run as `{{vars.<as>}}` and wakes it for the next drain; putting it off changes nothing; closing it unanswered, or the wait running out, fails the run with a sentence, and a question whose run has ended is closed with it. With `to:`, filled from the run, the question is put to that one member, and only they or an owner may answer it (`decide` in `govern.ts`); a `to:` that names nobody who is a member now, or one suspended, fails the run with nothing asked |
| `ask_slash` | queues one `infer.ask` outbox job, `{ run, rule, step, question, shape, choices?, about? }`, and parks the run for a day. The question is filled from the run's row with every `secret` and `file` field read as the dash, and so is a variable set from one; `about` carries the fields the step names, never one of those two types. `rule` is who asks: the host's pass refuses a job without it and calls no model, because Slash's ledger row is written as `rule.<id> step <n>` and a key is opened as `rule:<id>`. The pass acks each job one of three ways. `done` with `result.text` is the answer, held to the step's `shape:` (a number, or one of its `choices:`) and kept as `{{vars.<as>}}`. `done` with `result.failed` is the sentence of a refusal no retry mends, which ends the run on that sentence: the month's asks spent, an answer the host could not read, an answer of the wrong shape or a blank one, a job queued without its rule, and on the Worker a Keychain with no key labelled `slash`. `failed` is a model not reached, which the outbox's retry ladder asks again, eight attempts over about four hours, and whose last rung fails the run with a sentence instead of opening a dead letter. A `done` with neither ends the run on *"Slash answered job … with no text"*. On a host that does not answer, a rule an earlier build let install fails the run there with `NOT_IN_THIS_BUILD` before anything is queued, and the steps before it stand |
| `script` | queues one `script.run` outbox job, the one a script's clock queues, `{ script, version, input }`, pinned to the version active now, and the run goes on to its next step without waiting. `input` is the row's `id`, `register` and `seq` and what the step's `input:` says, filled from the run; the row's fields are not copied, and a script reads them through its own `reads:`. An `input:` that reaches a `secret` or `file` field fails the run and queues nothing. `as:` keeps the job's id. The run fails there, with a sentence and nothing queued, when the script is not installed or retired or its pack is off, when it does not say `runs: { rule: true }`, and when it is paused, until somebody resumes it. When a job for the same script with the same input is still unfinished, nothing more is queued and `as:` keeps that job's id. What the script writes lands through the ordinary write path as `script:<id>@v<n>`, when a host has run it |
| `call` | queues the declared call as one `pull.fetch` outbox job naming the run and the step (`queueCall` in `actions.ts`), sending the run's row's fields only when the call `sends:` them, and parks the run for a day (`CALL_WAIT_MS` in `flow.ts`). The job's ack hands the provider's answer back, kept under `as:` as its JSON, so `{{vars.depth.total}}` reads into `{"total":120}`, or as its text when it is not JSON; an answer over 4 KB, the most one answer holds, stops the run with its size in the sentence, and a call that stopped hands back its sentence and fails the run. A call `queueCall` refuses fails the run there with nothing queued, and a wake that finds no answer after the day fails it with a sentence. The steps before it stand |
| `meet` | `{ name?, email?, handle?, where }`, each filled from the run and the row as a note is, meets one person through `people.ts`'s `meet` as `rule:<id>`, linked to the run's project: matched by email, then handle, never by name; added to the list that plays `meets:` when nobody matches; `where` kept on them as a dated line (`mail: {{trigger.body.subject}}` keeps the day, then `mail:` and the subject); a name shared with somebody else opens one merge question. A key that fills with nothing is left out, and when name, email and handle all do, nobody is met, the step row says `skipped` and the run goes on; a `where` that fills with nothing says the rule. A key that reaches a `secret` or `file` field fails the run and meets nobody, and so does anything `meet` refuses, such as no list playing `meets:` |
| `run_job` | `{ kind: 'job.<id>', args?, as? }` queues one job of that kind through `createJob` (`jobs.ts`), with the args filled from the run and the row and the run's row as its `about`, and parks the run. The run looks at the job's row every five minutes (`RUN_JOB_LOOK_MS` in `flow.ts`, since a job ends in `jobs.ts`, which knows nothing of runs) and, once the job ends, keeps `ok`, `needs_decision` or `error` under `as:` (every other end reads as `error`; the step row keeps which it was) and goes on. A job not ended a day after it was queued fails the run with a sentence and is left to run. A kind not approved, or retired, args the kind does not take, or one that reaches a `secret` or `file` field fail the run with nothing queued; `createJob`'s own ceilings on jobs waiting and jobs a day apply, and a write trigger needs `once_per` |

**Who answers a question to Slash.** The record is opened with `answersSlash` where its host has a pass that asks
Slash, and it is the same fact as `/api/version`'s `slash`, because both come out of one builder
(`endpointOptionsOf` in `packages/host/src/slash.ts`). Off, install refuses the step and the runner fails a run that
reaches one, as the two tables say. The pass is `serveAsks` (`packages/host/src/slash-answers.ts`), and each host
calls it from the place it already works its queue:

| Host | Answers where | The pass runs | The key |
|---|---|---|---|
| self-host | `SLASH_ENDPOINT` is set | in `poll`, after the scheduled actions | the operator's `SLASH_KEY` where one is set, else the Keychain's key labelled `slash` opened as `rule:<id>`, else none: a keyless call there is a model on the owner's own machine working |
| Worker | `SLASH_ENDPOINT` is set and `KEK` is bound | in `alarm()`, after the drain and the scheduled actions | the Keychain's key labelled `slash`, opened as `rule:<id>`, and never an operator's |

**On the Worker a record with no key labelled `slash` fails the run and posts nothing.** The endpoint there is a
hosted provider on the owner's own bill, and a call with no `authorization` is an anonymous one: the survey that set
this rule measured one keyless POST, answered 401. So the pass refuses the job `FORBIDDEN` before anything is held or sent, writes no ledger row,
and the run stops on *"rule.<id> asked Slash at step N, and this record's Keychain holds no key labelled slash, so the
run stopped there. Put your model key in the Keychain under slash."* A self-host does not make this check, for the
reason in the table.

**Five questions a pass, and the Worker sets its own alarm for the sixth.** `serveAsks` leases five. On a self-host
the poll comes round again; on the Worker nothing rings for an `infer.ask`, which is not in `DELIVERS`, so a pass
that leased its full five sets the alarm for now and the next invocation takes the rest. The alarm's drain is the
only drain on the Worker, so every question there is queued by it, and the first five are asked in the same invocation. The deployed Worker's
`SLASH_ENDPOINT` is empty (`apps/worker/wrangler.jsonc`), so the Cloud answers none until one is set.

**Each question is one ask on the owner's `ask_cap`**, the same count a person's read spends, and what a failure
costs is [46-SPEC-SLASH](46-SPEC-SLASH.md) §4.1's to say: a model not reached, or one that answered with a status that
is not 2xx, spends nothing and is asked again; a 200 the host cannot read, or no answer within thirty seconds, is
counted once and ends the run.

**Where the run is, is saved after every step that finishes,** not only at a wait and at the end. A run that stops
between two steps carries on from the next one and never takes a finished step a second time.

**A step that throws fails the run.** The runner catches it, marks that step `failed` and ends the run `failed` with
a sentence naming the step and the error. Before September 22nd a throw went to the drain's retry ladder with the run
still `running`, and every retry took again each step since the last wait: one row sent the same notify six times in
twelve hours, and a run with no wait ended `running` for ever, outside the ninety-day prune.

`{{vars.<name>}}` and `{{trigger.<path>}}` are filled in every string of a step before the row's own `{{field}}`s are.
`trigger` carries the kind, the row's fields as `row`, the arrival's `channel` and `ingest`, and for an arrival its
body, parsed when it is JSON.

`{{metric.<id>}}` is a figure, read when the step is taken, as a page reads it. **A figure is filled only where
everybody who reads the run's row may read it.** When somebody on the record reads the run's row's list, or a list
one of its `create` steps writes into, and does not read the list the figure adds up, every `{{metric.<id>}}` in
that run is the dash, in a variable too, since a variable is written into the row later. This is asked at the run
and not at install, because an invitation after the rule is in changes who reads the list. Measured before it: a member invited to Inbox alone was refused the figure Payroll, and an
owner's rule writing `filed; payroll {{metric.payroll}}` into each new Inbox row put `GBP 5200.00` in her list. A
run with no row and nothing to create writes where only the owner reads, and reads every figure.

**Ceilings.** `limits.runs_per_day` (at most 1,000) is counted over the last twenty-four hours, and a run past it is
refused with a sentence and not started. A rule with `enabled: false` starts no runs. The inline pass reads the same
three keys: `enabled: false` stops the rule, `project:` holds it to that project's rows, and `limits.runs_per_day`
counts its firings over the last twenty-four hours, a firing being one row written in which it did something, so a plain write
rule can be switched off without being retired.

**Switching a rule off or retiring it stops the runs it already started.** The install that sets `enabled: false`,
by hand or in a pack's version, the kernel's `retire`, and turning off the pack the rule belongs to, cancel every
unfinished run of that rule in their own transaction, each with a sentence saying why. The pack's case was measured
before it was fixed: a run waiting when its pack went off, with the pack turned on again before the wake, woke under
the rule turned back on, wrote to its row and notified. A turn-off refused part way, after one of its packs' rules was
retired, takes that retire back with the refusal, and the run goes on. The runner also asks at every wake whether an active,
not-retired version of the rule exists and is on, and cancels the run when not, for a record an earlier build left
holding a run of a rule already gone. A plain edit does not: a run keeps the version it started under and finishes
those steps.

**What is kept, and what is counted.** A finished run is kept ninety days and pruned by the hourly sweep. Every run
that ends writes one `pull` event with actor `rule:<id>`, the same shape a scheduled action's run writes, so the ledger
that counts scheduled actions counts automations beside them: a failed or cancelled run is free, as a failed action is.
A run can be cancelled while it waits, and its wake is dropped with it.

**Not yet.** Runs are `local`: they do not travel in a `.brain` file, and carrying them means a format revision. A
script's answer does not come back into the run that started it: the step hands off and the run goes on. A question
to Slash is answered on the two hosts above and nowhere else. A record opened without `answersSlash` refuses the step at install and fails it at the run, and both
read that one switch, so neither can come off without the other.

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
