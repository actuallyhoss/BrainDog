# 08 · Metrics and analytics

## 1 · Two systems that must never be confused

They answer different questions, with different retention and different privacy properties.

| | **Metrics** | **Telemetry** |
|---|---|---|
| Question | how is the customer's *business* doing | how is *BrainDog* doing |
| Lives in | the customer's own record, forever | Analytics Engine, 3 months |
| Who reads | the customer, their agents | us |
| Contains | their figures | counts and durations, never their content |
| Declared by | a pack | code |
| Exportable | yes, in the `.dog` | no — it is not theirs, it is about us |

Confusing these is how a "record" becomes a surveillance product. The wall is architectural: the
record object cannot write to Analytics Engine because **the record object makes no outbound
calls at all** ([01-ARCHITECTURE](01-ARCHITECTURE.md) §2).

---

## 2 · The metric document

```yaml
metric: due-30d
name: Due in 30 days
source: register.obligations
where:
  all:
    - { field: state, in: [open, part] }
    - { field: due,   before: "+30d" }
value:  { sum: amount }
format: money.EGP
target: { lte: { amount: 5000000, currency: EGP } }
window: 30d
compare: previous            # the same window, immediately before
```

| Field | Values | Required |
|---|---|---|
| `name` | the display name; when absent the id stands in ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §13 D15) | no |
| `source` | a register, **or `series.<id>`** — a time series written by a connector, [25-CONNECTORS](25-CONNECTORS.md) §8 | yes |
| `where` | the one grammar | no (defaults to everything) |
| `value` | an aggregation, or a **ratio** — see below. Over a `series.<id>` the legal set is `last · sum · avg · delta · min · max · trend` *(an earlier draft omitted `trend`, the one aggregation that is series-only)* | yes |
| `format` | `money.<CUR>` · `int` · `decimal` · `pct` · `days` · `duration` | yes |
| `target` | what good looks like | **yes** |
| `window` | over what period. For a register source it is the **comparison shift** — `compare` re-evaluates with `asOf = now − W`; for a `series.<id>` source it is the `at` filter ([45-SPEC-RECORD](45-SPEC-RECORD.md) §13 #3) | **yes** |
| `compare` | `previous` · `year_ago` · `none` | no (default `previous`) |
| `group_by` | one field — see §2.1 | no |
| `bucket` | `day` · `week` · `month` · `quarter` · `year` | only with a date `group_by` |
| `order` | `[{ field, dir }]` — the walk order for `running` (§2.3) | only with `running` |
| `snapshot` | `{ grain: day, into: series.<id> }` — §2.6 | no |

The evaluator is one synchronous function in `record` — `evaluateMetric(decl, ctx, kernel, sql)`,
[45-SPEC-RECORD](45-SPEC-RECORD.md) §5.8 — called by `metric(id)`, by a page's `stat` cells and by the
`snapshot` and `score` schedule kinds; nothing else computes a figure.

---

## 2.1 · `group_by` and `bucket` — closing a hole this document had

**An earlier draft advertised a chart it had no way to feed.** §3's table listed `series` as
*"a metric grouped by a field, over buckets"* — and the metric document above it had no `group_by`
and no `bucket`. There was nothing behind the chart. Spend by channel by week was not declarable,
and neither was any line over time: `compare: previous` yields exactly two data points.

```yaml
metric: spend-by-channel
source: register.campaign_day
where: { all: [{ field: day, after: "-90d" }] }
value:    { sum: spend }
group_by: channel            # an enum, a ref, or a date field
bucket:   week               # only when group_by is a date
format:   money.GBP
target:   { lte: { amount: 400000, currency: GBP } }   # per group
window:   90d
```

It compiles to one `GROUP BY` on the same expression the partial index was built on, so a grouped
metric is as cheap as an ungrouped one. Four rules, each preventing a specific way this goes wrong:

| Rule | Prevents |
|---|---|
| **One `group_by`, never two** | a pivot table. Two dimensions is a report generator, which §4 already refuses |
| **Cardinality capped at 50 groups**, refused at install for an `enum` or `ref` whose domain exceeds it, and truncated with a visible *"+N more"* at render for anything unbounded | a bar chart with 400 bars, which is not a chart |
| **`bucket` requires a `day` or `instant` `group_by`**, and a `window` that spans at least two buckets | a "trend" over one point |
| **A missing bucket is a gap, not a zero** | §3 already says this; grouping is where it stops being theoretical. A week with no spend and a week with no *data* are different claims |

---

## 2.2 · Arithmetic: one closed ratio, and deliberately not a formula language

Every derived rate in business is a division: CAC is spend over conversions, ROAS is revenue over
spend, gross margin is a difference over a total, a VAT line is net times a rate, and a
base-currency figure is an amount times an FX rate. **None of them was expressible.** `value:` took
one aggregation over one field, and *"a metric over a metric"* is on §4's refused list.

That refusal is right and it stays. What was wrong was concluding that arithmetic therefore could
not exist at all.

```yaml
metric: cac
source: register.campaign_day
where:  { all: [{ field: day, after: "-30d" }] }
value:
  ratio:
    of:  { sum: spend }
    per: { sum: conversions }
format: money.GBP
target: { lte: { amount: 4000, currency: GBP } }
window: 30d
```

**The form is closed and it is exactly this:** two aggregations from the list below, combined by
one of **`ratio`**, **`diff`** or **`product`**. No nesting, no parentheses, no user-typed
expression, no operator precedence — because the moment a declaration has precedence it is a
language, and a language in YAML is the failure this whole platform is built to avoid.

| | |
|---|---|
| Aggregations | `sum` · `count` · `avg` · `min` · `max` · `delta` · `median` · `distinct` · `last` · **`running`** · **`trend`**. **Eleven, counted.** *(An earlier draft said "ten" over a list of nine — the exact miscount this corpus keeps making; adding `running` and `trend` is what makes a number true.)* `last` exists for `series.<id>` sources. `median` is computed by the evaluator, not by SQL — SQLite has no `median` aggregate. `running` and `trend` are §2.3. `count` takes a field and counts the rows where it is present; `count: id` counts rows, `id` being one of the six kernel fields any `where:` or aggregation may name ([02-DATA-MODEL](02-DATA-MODEL.md) §6) |
| Combinators | `ratio` (a ÷ b) · `diff` (a − b) · `product` (a × b) |
| Depth | **one, in either direction**: a combinator over two aggregations (`ratio: { of, per }`), **or** one aggregation over a row-level `product`/`diff` of two fields, one of which may be a `lookup` (§2.5). Never a combinator over a combinator |

### The three rules that keep it honest

**1 · Both operands read the same rows.** One `source`, one `where`, one pass. This is what makes
it *not* a metric over a metric: it is two columns of one aggregate query, and it costs the same
scan. A combinator whose operands had different predicates would be a join, and a join is refused.

**2 · The unit algebra is checked at install, and this is where it earns its keep.** A ratio is not
type-free, and getting it wrong is how a dashboard states a confident wrong number:

| `of` | `per` | Result | Refused when |
|---|---|---|---|
| money | int | **money** — cost per unit | — |
| money | money | **decimal**, dimensionless — ROAS | the two currencies differ. Name an FX source, or scope the predicate |
| int | int | **decimal**, or `pct` if the format says so | — |
| money | — (`product` with a decimal) | **money** — a VAT line, an FX conversion | the multiplier is money. Money times money is not a thing |
| anything | a `per` that can be zero | — | **always.** A zero denominator renders as *"—"* with the numerator on hover, never as `0`, `∞` or `NaN` |

**3 · A ratio of sums, never a sum of ratios.** This is the rule the audit caught, and it is the
reason the feature had to be built rather than worked around. Without it, the workaround is to
store `cac` as a field on each daily row and average it — which violates
[05-BLOCKS](05-BLOCKS-AND-THEMES.md) §7's strongest rule (*"never type a figure the record already
holds"*) and is **arithmetically wrong**: a day with £5 of spend and one conversion drags a
30-day average exactly as hard as a day with £5,000 and a thousand. Simpson's paradox, rendered
confidently, with a target and a delta and a provenance hover on it.

> **The model was forcing the error, not merely permitting it.** §7 admits metrics cannot be
> protected against bad semantics. There is a difference between a model that allows a wrong
> number and one that leaves no other way to get the right one.

### Two fields that are required, and this is not negotiable

> **A number with no target is decoration. A number with no comparison window is a number you
> cannot act on.**

Both are refused at install if absent, with that sentence in the error. This is the single most
important rule in the metric system, and every dashboard product gets it wrong by making them
optional.

The consequence is that a metric can be **behind** rather than merely large:

```
  Due in 30 days
  EGP 6,240,000        target ≤ 5,000,000     ▲ 24% over
  ▲ 18% on the 30 days before it
```

Three facts, and the second is the one you act on. A bare `EGP 6,240,000` is a number you look at.

One body is exempt, and only one: a prediction's `measure` ([24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md)
§4.6) is a metric body **without** the two required fields — `{ source, where, value }` — because a
prediction's target is the claim itself, and its window is `score_at`. Accepting a `change` proposal is
what writes that `prediction` row: the accepted change carries its own claim, and the `score` schedule
kind measures it on `score_at` ([24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.6;
[45-SPEC-RECORD](45-SPEC-RECORD.md) §5.2).

---

## 2.3 · Two aggregations the predecessor needed and this grammar lacked

**`running`** — a cumulative reducer with an optional stop condition, over an `order:`.

```yaml
metric: runway
source: register.installments
where:  { field: paid, is: false }
order:  [{ field: due_day, dir: asc }]
value:  { running: { sum: amount }, from: { field: opening_balance }, stop: { lt: 0 } }
```

It returns the sequence and **the first row that crosses** — which is the predecessor's *runway
walk*: start from what is liquid, subtract each instalment on its day, stop at the first negative. A
plan's countdown to zero is the same reducer with no stop. Neither was expressible with nine
aggregations, and the workaround — a typed number — is the failure `{{path}}` exists to prevent.

`from:` is a literal or a field on the source rows, **never a metric** — a metric over a metric is what
§4 refuses, and the walk seeds from a figure the rows carry. `order:` is the walk order. The walk is the
evaluator's: `acc = from`, then `acc += f` per row in `order`, stopping at the first row that satisfies
`stop` and naming it as `crossed` ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.8). *(An earlier
draft wrote `from: { metric: liquid }`, which read another metric inside a metric two sections after
forbidding it.)*

**`trend`** — series-only, and **significance-gated**. A log-linear fit over the buckets; if
\|t\| ≥ 2.1 with n ≥ 6 it returns compound growth with a low/high band, else it returns *flat* and
says why. A projection compounds the last complete bucket forward, **capped at 10× with the cap
reported** — because an uncapped exponential on six points is a number that will be quoted.

## 2.4 · Rules that make a comparison honest

Each of these was a wrong figure the predecessor shipped and then pinned with a regression test that
records the old wrong number. The evaluator applies this table verbatim — it is the comparability gate,
and a `delta` is present only when the comparison is `comparable` ([45-SPEC-RECORD](45-SPEC-RECORD.md)
§5.8).

| Rule | The figure it prevents |
|---|---|
| **`compare:` renders a delta only when comparable**: the window spans ≥ 7 days, both windows have rows, and the prior has at least half the current's count | `−94%` in green, the morning after a guard shipped — one row against nine on the same day last month |
| **The prior window is cut at the same day** — this month to the 14th against last month to the 14th | a 28-day month against a 31-day one |
| **A bucket is `empty`, `partial` or `full`**: empty when nothing remains after exclusions, partial when unfinished *or* the data began inside it, full otherwise. **Averages use `full` only** | a month of only transfers averaging in at zero and becoming the forecast's opening assumption |
| **Buckets walk the contiguous run** from now backwards | three opening rows from a year ago, before a six-month hole, becoming a bar |
| **Leading zeros are trimmed as *data starts here*, never drawn as *nothing happened*** | a counter that began recording in August read as a collapse in July |
| **A missing bucket is a gap** — §3 already says it; grouping is where it stops being theoretical | — |

## 2.5 · Money across currencies: refuse to guess, but do not refuse the total

§2.2 refuses a mixed-currency aggregation **at install** unless an FX source is named. With one named,
the runtime rule is the predecessor's, and it is better than a refusal:

```yaml
value: { sum: { product: [amount, { lookup: fx, by: currency, as_of: day }] } }
```

| | |
|---|---|
| The rate is **as-of** | the nearest rate **on or before** the row's day, flagged `exact`; else the earliest rate after it, flagged `forward`; else **none** |
| A row with no rate is **excluded and listed** | `noRate: [{ currency: AED, amount: 120000 }]` is part of the result — absolute, never netted; `amount`, because a money value has no key called `minor` ([02-DATA-MODEL](02-DATA-MODEL.md) §3) |
| The total wears **`≥`** | and the note reads *"No rate for AED — those rows are left out."* |
| **Several currencies meet at runtime and no `lookup` is named** | `value: null`, and the parts travel as per-currency `mixed` partials — refuse to guess, keep the parts ([45-SPEC-RECORD](45-SPEC-RECORD.md) §13 #15) |

**A wrong total is worse than a partial one, and a partial one that pretends to be whole is worst.**
The rate table is a dated register, as §3 of [02-DATA-MODEL](02-DATA-MODEL.md) says — `fx`, with
`currency`, `base`, `rate`, `as_of`, `source`; the lookup is the same `lookup` the ingest extractors
already have, with one new key, `as_of`. *(An earlier draft spelled it `asof` and looked rows up by a
`pair` the register does not have.)*

## 2.6 · `snapshot:` — materialising a metric into a series

```yaml
metric: net-worth
snapshot: { grain: day, into: series.net-worth }
```

A metric with `snapshot: { grain, into }` is written into `metric_point` by a `schedule` row of its own
kind, `snapshot` ([09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §2), with the predecessor's policy: **overwrite yesterday** (a Friday's bank text can land on Saturday), backfill fills gaps only,
today is appended live and flagged, and `missing` days are counted rather than zero-filled. It is what
turns *"the balance now"* into *"the balance over time"* without a second table. *(An earlier draft's
heading read `snapshot: daily`, a scalar the example never had.)*

## 3 · Charts are blocks bound to metrics

No new drawing code. A chart is a `proportional` or `grid` primitive from
[05-BLOCKS](05-BLOCKS-AND-THEMES.md) with a metric on the other end. `stat`, `bar` and `gauge` are v1
kinds; `sparkline`, `series` and `forecast` are **post-v1** and arrive as the analytics pack
([05-BLOCKS](05-BLOCKS-AND-THEMES.md) §2).

| Chart | Primitive | Use for |
|---|---|---|
| `stat` cell | `grid` | one figure, its target, its delta |
| `bar` | `proportional` | a run of values whose relative size is the point |
| `gauge` | `proportional` | one value against one target |
| `sparkline` *(post-v1)* | `proportional` | shape over time, inline, no axes |
| `series` *(post-v1)* | `table` + `proportional` | a metric grouped by a field, over buckets |
| **`forecast`** *(post-v1)* | `proportional` | a **closed simulation**: `open: metric`, `events: [...]`, `horizon:`. Each event stream is a register with a day and a signed amount, or a `repeat:` (paydays from a frequency), or a metric prorated to the bucket's end (spending). The block runs the `running` reducer over the merged events and draws the past **solid** from the snapshot series and the future **dashed**. Not a formula language — a fixed shape over declared inputs. Knobs (a spending slider, a per-stream toggle) are UI over the declared inputs, deliberately not in the URL **One measure across the join**: the recorded half and the projected half read the *same* metric. The predecessor drew net worth against liquid cash and was right only by the coincidence that nothing illiquid had a snapshot yet; the first gold row would have put a 60,000,000-minor-unit cliff in the middle of the line the runway is read off, and nothing would have failed. A slow asset held flat is an approximation, stated where the derivation lives — and the derivation lives in a metric, where a test can reach it, never in markup. |
### Series kinds, from the predecessor's analytics model

A connector's series declares what kind of number it is, because the reducer depends on it — on the
**ingest**, as `writes: { series: <id>, kind: gauge | flow | cumulative | unique | fact, unit?, scale? }`
([25-CONNECTORS](25-CONNECTORS.md) §8), never as a `metric_point` column. `unit` is one of `count · ms ·
bytes · money.<CUR> · pct.bp`; `scale` is an integer multiplier applied to the mapped value, rounding half
away from zero, so a provider's `12.5%` lands as `1250` basis points. Two reducers read the kind and they
must agree: connect's at write — `flow` sums a bucket, the four others take the latest sample — and the
evaluator's at read ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.7, §13 D13;
[45-SPEC-RECORD](45-SPEC-RECORD.md) §5.8):

| Kind | Reduces by | Partial last bucket? | Notes |
|---|---|---|---|
| `gauge` | `last` | no | a level. Staleness is reported when the last sample is old |
| `flow` | `sum`, **zero-filled** | **yes** | a real zero is a reading; only an accumulator can be partial |
| `cumulative` | `delta`, carrying the level | yes | a counter that only goes up |
| `unique` | `distinct`, **pinned to the day, never widened** | yes | a daily-unique summed over a week is a lie |
| `fact` | a scalar | — | point-in-time |

**The current period is flagged `partial` and drawn faint — never read as a drop.** And a gauge that
did not exist before a date reads `null` there, not zero: *"nothing recorded them before that."*

A pack ships metrics **and** the page that shows them, so an analytics variant is one shareable
file — which was the whole ask.

### Charts obey the data rules, not fashion

- **Never colour alone to convey meaning.** A `bad` bar also carries a sign or a glyph, because
  8% of men cannot distinguish the red from the green.
- **A chart never picks its own colours.** Roles only; the theme owns appearance.
- **Axes start at zero for magnitudes**, and any truncated axis says so on the axis.
- **A missing measurement is missing**, drawn as a gap, never as a zero. A zero is a claim.
- **Tabular numerals**, always. Monospaced digits at display size render `$2,869` with the comma
  in its own cell — tabular is the correct tool, not mono.

---

## 4 · What is deliberately not built

| Refused | Because |
|---|---|
| Event tracking, funnels, sessions on customer data | this is a record, not an analytics product |
| Arbitrary SQL for metrics | the predicate grammar or nothing — an `eval` by another name |
| A metric over a metric | that is a report generator; different product |
| Real-time streaming charts | a business record's figures change daily, not per second |
| A port of the prior codebase's `analytics.js` | **keep the ~80-line metric model, delete the other 906.** Two private API adapters that generalise to nobody |

That last line is worth keeping in view during the build: 906 of 986 lines of an existing
analytics implementation were adapters to one person's two vendors. The generalisable part was
8% of it.

---

## 5 · Telemetry: what we measure about ourselves

Analytics Engine, written from the **Worker** (never the record object). Unlimited cardinality,
20 blobs + 20 doubles + 1 index per data point, 16 KB of blobs, 250 points per invocation,
**3-month retention**, queried over SQL.

That retention is exactly why customer metrics cannot live here — a business record keeps figures
for years — and exactly right for product questions.

| Blob | Double |
|---|---|
| event kind (`page.render`, `mcp.call`, `pack.install`, `ingest.match`) | duration ms |
| surface (`web`, `mcp`, `cli`, `email`, `webhook`) | rows touched |
| pack id (for install/uninstall) | neurons spent |
| tool name (for MCP) | payload bytes |
| outcome (`ok`, `refused`, `error`) | |
| **record id, hashed with a rotating salt** | |

### The rule on the last row

The record id is **hashed with a salt that rotates monthly**. We can answer "how many distinct
records used the ingest last week"; we cannot join a record across months, and we cannot map a
hash back to a customer. This is a deliberate ceiling on our own analytics.

**Never written:** field values, note text, register names a customer invented, credential
labels, email subjects, amounts. The blob list above is the whole of it, and it is asserted by a
test that fails if `writeDataPoint` is called with anything not on the list.

### The five questions telemetry exists to answer

Each maps to a gate in [15-ROADMAP](15-ROADMAP.md). Telemetry that answers no question is
surveillance with a dashboard.

1. Are there non-Sam records with >20 rows, >3 distinct days, still present at day 14?
2. Which packs get installed, and which get uninstalled within a week?
3. Does the ingest proposal loop converge — do proposed patterns get approved, and do approvals
   reduce model calls per record over time?
4. What does a record cost us per month in neurons, rows written and requests?
5. Which MCP tools do agents actually call, and which are dead weight in the context window?

---

## 6 · What a record costs us, computed rather than hoped

Workers AI pricing read 2026-08-31: **$0.011 per 1,000 neurons**, 10,000 neurons/day free at the
account level.

| Model | Neurons / M input | Neurons / M output | $ / M in | $ / M out |
|---|---|---|---|---|
| Granite 4.0-h-micro | 1,542 | 10,158 | $0.017 | $0.112 |
| Llama 3.2-1b | 2,457 | 18,252 | $0.027 | $0.201 |
| **GLM-5.3-Flash** | **13,636** | **45,455** | **$0.150** | **$0.500** |
| Mistral 7b | 10,000 | 17,300 | $0.110 | $0.190 |
| DeepSeek V4 Flash | 40,000 | 120,000 | $0.440 | $1.320 |
| GLM-5.3 | 127,273 | 400,000 | $1.400 | $4.400 |
| BGE-M3 (embed) | 1,075 | — | $0.0118 | — |

A modelled active record, per month:

| Job | Model | Volume | Cost |
|---|---|---|---|
| Triage classification | Llama 3.2-1b | 300 × 1.5k in / 0.1k out | $0.018 |
| Pattern proposal | **GLM-5.3-Flash** | 6 × 8k in / 2k out | $0.013 |
| Assistant conversation | **GLM-5.3-Flash** | 60 × 12k in / 1.5k out | **$0.153** |
| Embeddings (deltas) | BGE-M3 | 400k tokens | $0.005 |
| Digest prose | Llama 3.2-1b | 30 × 4k in / 0.6k out | $0.007 |
| **Total inference** | | | **≈ $0.196 → $0.20** |
| Durable Object + requests + R2 + Queues | | | ≈ $0.35 (est.) |
| **≈ $0.55 against $12.00** | | | **95% gross margin** |

> **Re-costed 2026-09-01, and the earlier figure is withdrawn.** An earlier draft routed extraction
> and conversation to DeepSeek V4 Flash and totalled **$0.51 / $0.86 / 93%**. `glm-5.3-flash` on the
> same platform is $0.150/$0.500 against $0.440/$1.320 — the conversation line alone falls from
> $0.44 to $0.153. **Any document still printing $0.51, $0.86 or 93% is stale.**

### The number the margin hides, and it is the one the customer feels

**One conversation turn at the modelled shape — 12k in, 1.5k out — costs $0.00255.** So:

| | |
|---|---|
| The modelled 60 conversations a month | **$0.153** — two a day |
| The whole $0.20 inference budget spent on conversation alone | **≈78 turns** |
| A product that wanted **600** asks a month | **$1.53**, and the margin falls from 95% to **84%** |

> **That last row is a pricing decision, not an accounting detail, and it should be made
> deliberately rather than discovered.** 84% is still a good margin. But the included assistant is
> budgeted at roughly *two conversations a day*, and a UI promising six hundred is promising eight
> times what the model pays for. This is the strongest argument for
> [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md): past ~80 turns the answer is not a bigger budget,
> it is **your key or your machine**, where the ceiling is yours and BrainDog's marginal cost is
> zero.
>
> **Note the two turn shapes and do not mix them.** This document models a *real* assistant turn
> carrying retrieved rows: **12k in / 1.5k out = $0.00255**. [26-BYO](26-BYO-INTELLIGENCE.md) §1
> compares providers on a smaller synthetic unit — **4k in / 600 out = $0.0009** — because it needs
> one shape that is fair across tiers. Both are correct; a figure quoted without its shape is not.

The margin is comfortable, and the risk is not the average — it is the tail. Mitigations, in
order of effectiveness:

1. **AI Gateway rate limiting per record.** A runaway agent loop is the realistic failure and it
   is bounded at the gateway, not by trusting a client.
2. **AI Gateway caching**, 60 s–30 days, for deterministic prompts. Triage classification of a
   repeated payload shape is a cache hit. The binding constraint is that the cache key includes
   **the full request body**, so only calls with a fixed prompt and short input ever repeat —
   classification and embeddings. A conversation carrying a retrieved projection is never identical
   and was therefore never cacheable. *(An earlier draft said caching does not work with streamed
   responses. **That claim is not in Cloudflare's documentation** — verified 2026-08-31 — and is
   withdrawn. The conclusion is unchanged, because it never rested on streaming.)*
3. **Model routing by job**, not one model for everything — the table above is a 50× spread
   between the cheapest and dearest per input token.
4. **A monthly neuron budget per record**, shown to the customer. When it is spent, deterministic
   features keep working and the assistant says it is out until the reset. Degrade, never bill by
   surprise.

---

## 7 · The one thing metrics cannot be protected against

A pack can declare `metric.profit` that aggregates the wrong field with a plausible name, and a
page can present it confidently. That is a *semantics* problem, not a code-execution problem, and
no sandbox fixes it.

Three mitigations, all cheap:

1. The install diff names every metric with its source, predicate, target and window.
2. `target` and `window` are mandatory, so a metric must state what it claims.
3. **Every rendered figure shows its provenance on hover and on focus**: source register,
   predicate, row count, and the window. `EGP 6,240,000 — sum of amount over 14 of 38 rows in
   obligations where state in (open, part) and due before 2026-09-30`.

A figure that can explain itself is a figure somebody can catch being wrong.

---

*Next: [09-ALARMS-AND-NOTIFICATIONS](09-ALARMS-AND-NOTIFICATIONS.md).*
