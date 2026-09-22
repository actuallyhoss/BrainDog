# 27 · Does it work for any job? — the four-vertical stress test

The claim under test: *"it can dynamically work for any job purpose, whether you want it for
finance, marketing, fashion, whichever the case."*

That claim was unproven. The model was derived from one person's use — software projects, money
owed, domains, hosting — and a design derived from one shape wearing a generic label is the most
common way a platform is wrong. So four businesses were modelled against the schema **as written**,
using only what [02-DATA-MODEL](02-DATA-MODEL.md) permitted, with instructions to break it.

---

## 1 · The result, before the detail

**The claim did not survive.** The useful part is *where* it failed:

> **The record layer was general. The analysis layer was not.**

The kernel — `entry`, `event` with an actor, `decision` with a mandatory reason, the vault,
money-as-minor-units, one predicate grammar — would carry any of the four, and several parts of it
are better than what the commercial products in each vertical ship. What broke was everything
downstream of storage: no arithmetic, no grouping, no pictures, no cross-row constraints, no state
transitions, and no way to create a row from a declaration.

| Business | Modelled, as written | After the changes | What still doesn't fit |
|---|---|---|---|
| Marketing | ~70% | ~90% | attribution, funnels, significance testing |
| Clinic / law | ~55%, then a **legal problem** | ~85% | field-level confidentiality within a row |
| Finance | ~40% | ~65% | double-entry, refused on purpose — [ADR-019](16-DECISIONS.md) |
| Fashion | ~30% | ~75% | grading rules, points of measure |

---

## 2 · The four things that broke it, and they are the same four every time

| # | Missing | Fashion | Marketing | Finance | Clinic |
|---|---|---|---|---|---|
| 1 | **Derived numbers** — any ratio | fabric buy = consumption × units | CAC, ROAS, CTR, CVR | VAT, FX, margin | cost per session |
| 2 | **High-cardinality rows nobody names** | 40 SKUs per style | 26k daily fact rows a year | every posting | — |
| 3 | **Pictures** | *the product is the picture* | creative assets | receipts | scans |
| 4 | **Relationships that carry attributes** | style ↔ fabric, with a consumption | audience ↔ creative | posting ↔ period | — |

Every one of them was answered, and the answers are in [ADR-020](16-DECISIONS.md). Two were
answered by refusing.

---

## 3 · Four findings that were bugs, not gaps

These matter more than the missing features, because each was a statement the corpus already made
and could not honour.

| Bug | What was wrong |
|---|---|
| **`series` was a chart with nothing behind it** | [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3 advertised *"a metric grouped by a field, over buckets"*. The metric document had no `group_by` and no `bucket`. There was no way to feed it |
| **`state` was dual-homed** | a kernel column *and* a declared enum field, and nothing said which one `{field: state}` compiled against. For a state machine that is the whole thing |
| **`list<ref>` had no syntax** | used throughout the corpus; the declaration for its target register was written down nowhere |
| **`decision.reason NOT NULL` forbade compliance** | see §5. The schema made a lawful erasure request impossible to honour |

A design review that only finds missing features has not read carefully enough.

---

## 4 · The arithmetic finding, because it is the one that would have shipped wrong

Without a ratio, the workaround for CAC is to store it as a field on each daily row and average it.
That is wrong twice:

1. It violates the corpus's own strongest rule — *"never type a figure the record already holds. A
   typed figure is a claim with an expiry date nobody set."*
2. **It is arithmetically wrong.** A day with £5 of spend and one conversion drags a 30-day average
   exactly as hard as a day with £5,000 and a thousand. Simpson's paradox — rendered confidently,
   with a target, a delta, and a provenance hover on it.

> [08-METRICS](08-METRICS-AND-ANALYTICS.md) §7 admits metrics cannot be protected against bad
> semantics. There is a difference between a model that *allows* a wrong number and one that leaves
> no other way to get the right one. This was the second.

A ratio of sums, never a sum of ratios. It is one closed form, two operands, one depth.

---

## 5 · The legal finding, which blocks four verticals rather than one

A clinic exercises Article 17 on a patient. Every store was audited. Three could not comply **by
construction**: `event.from_v`/`to_v`/`note`, `inbox_raw.body`, and `decision.reason` — the last
because it is `NOT NULL`. Two more, `entry_fts` and `entry_vec`, were simply **undefined** on
purge — meaning a search would still return a name whose row was gone, and `near` would still match
its embedding.

And the deletion table had a row for *"a customer"* and no row for *"a person inside a customer's
record."* The model had a **tenant** erasure story and no **data-subject** erasure story.

> **This is not a clinic feature.** Any B2C marketing list holds unsubscribed leads with the same
> right. Any HR use holds ex-employees. Any agency holds a former client's contacts.

Resolved in [02-DATA-MODEL](02-DATA-MODEL.md) §10 without giving up append-only, because the
principle was never *"keep the values forever"* — it was *"nobody can rewrite what happened."* Only
the second is load-bearing. Tombstone the payload, keep the fact, log the erasure.

It was the cheapest item on the whole remediation list, and it is a correctness fix, so it is in
the kernel rather than in a phase.

---

## 6 · What was refused, and why refusing is the right answer

| Refused | Asked for by | Why |
|---|---|---|
| **Cross-row constraints** (a transaction must balance) | finance | a correlated aggregate on the write path, evaluated on every write in the record to serve one register in one vertical. [ADR-019](16-DECISIONS.md) says *not a ledger*, out loud |
| A third `each:` dimension on `create` | nobody, pre-emptively | two is a matrix. Three is a cube, and nobody has wanted a cube |
| Nested combinators in a metric | finance | the moment a declaration has operator precedence it is a language, and a language in YAML is the failure this platform exists to avoid |
| Funnels, cohorts, attribution | marketing | this is a record, not an analytics product. A marketing *operation* legitimately needs them, and legitimately needs a second tool |
| Field-level confidentiality inside a row | clinic | the access ceiling is register × level. Put the sensitive field in its own register. It costs a register against the 64 cap, and it is honest about what it enforces |

---

## 7 · The claim, restated so it is true

The old claim was *"it works for any job."* A fashion label or a bookkeeper would have found out
otherwise in the first hour.

> ### **It works for any business whose records are named things with dates, money and quantities on them — and whose numbers are sums, ratios and differences over those rows.**

That is longer, it is testable, and it is still a large market: freelancers, agencies, landlords,
consultancies, studios, small clinics, small labels, anybody running several things at once.

*(Read September 22nd 2026 against DIRECTION §22.)* The claim above describes what the record
can hold, and it stays true. It is not a list of use cases the product ships. BrainDog is the
shell: a typed record, doors in and out, schedules, pages and a vault. The code ships those
primitives; the lists, fields, integrations and metadata a given business needs are added at run
time by the person or their agents, or brought by a pack they choose to install. The verticals in
this document are tests of the primitives, not packs the product is obliged to carry.

**What it is not, said plainly:** a general database, a BI tool, a ledger, a PIM, or a calendar.
Each of those is a real product that this deliberately is not, and each refusal is written down
next to the vertical that asked for it.

---

## 8 · The tell, kept as a record of how the shape was found

Worth preserving, because it is the method rather than the conclusion. The audit did not argue
abstractly that the model was one person's shape — it listed the fingerprints:

| Tell | What it assumed |
|---|---|
| `seq` mandatory, spoken, stable forever | every row is a thing a human says a number about |
| `title:` — *"what a row is called in a list"* | every row has a name. A Tuesday's ad spend does not |
| every register FTS-projected and vector-embedded | every row is text |
| `remind: [-30d, -7d, -1d]` on a `day` | a date is a **deadline**, never the timestamp of an observation |
| *"a renewal date has no time zone"* — the justification for `day` | the canonical date in this model is a renewal |
| RRULE subset with **`BYMONTHDAY` and no `BYDAY`** | recurrence means monthly billing, not a person's calendar |
| aggregations `sum·count·avg·min·max·delta·median·distinct` — **no ratio** | the questions are "what do I owe" and "what am I owed". Both are sums |
| `money` is `{amount, currency}`; `decimal` is a bare number | the only quantity that matters is money |

**Six of the eight are fixed by a change to the model; the other two — `title:` and the FTS
projection — are fixed by `series: true`, which turns the tax off for the registers that are facts
rather than things. So: eight of eight**, by two different mechanisms.

Two tells are *not* on that list and remain true: `remind:` still treats every date as a deadline,
and *"a renewal date has no time zone"* is still the justification for `day`. Both are correct for
this product and wrong for a calendar — which is exactly what §7's restated claim says.

---

*Next: [15-ROADMAP](15-ROADMAP.md) for what this costs, and
[17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) for what it leaves open.*
