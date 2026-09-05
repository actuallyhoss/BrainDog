# BrainDog

**Everything about your business that isn't code — in one database your agents can write to.**

Money owed, renewals, hosting, credentials, decisions and their reasons. Open source, and hosted
for you if you want. It renders itself as a web app.

---

> ## Status: the record is built, and it writes.
>
> **[docs/](docs/)** is the complete 0→1 engineering scope and remains the source of truth: nothing
> here is designed twice, and every decision below cites the document it comes from.
>
> **What exists.** The kernel — one write path, an append-only ledger whose `MAX(rowid)` IS the
> record's version, sixteen types with their refusals, a predicate grammar with two renderings held
> to each other by a differential test, full-text search, a per-customer schedule with ten kinds and
> an outbox with nine. On top of it: metrics and their stored series, declared pages, rules
> (including a bounded row generator and a bulk apply), the cash walk, ingest with a closed transform
> vocabulary, the vault index, the decision gate, packs, agent tokens, membership, and `.dog` export
> and import that round-trip byte for byte.
>
> Reachable three ways from one route table, so they cannot drift: **HTTP**, an **MCP** server —
> sixteen tools and a resource surface, so a page is not invisible to an agent — and a **typed
> client**. Hosted as a Cloudflare Worker — a SQLite
> Durable Object per customer, a `Directory` object holding the tenant map, a queue as the outbox
> doorbell — or as one Node process over `node:sqlite`, from the same packages.
>
> The browser client is the whole app against a synthetic record: every screen, every keyboard path,
> the block dialect, the theme generator and the forecast. Swapping its one data file for the typed
> client is the remaining wiring.
>
> **857 tests and nine gates**: a clean-room tripwire, a stack gate (no `node:`, no `cloudflare:`, no
> `fetch`, no `Buffer` under `packages/*/src`), a CSS rule checker, a colour-literal grep, a
> byte-comparison of the generated theme, a bundle budget, a layout gate that reads its own test
> widths out of the stylesheets, an accessibility gate that drives every interactive state across
> both apps, and a workspace typecheck under `exactOptionalPropertyTypes` and `erasableSyntaxOnly`.
>
> Every test is named after the failure it prevents rather than the function it covers, which is why
> five adversarial audit passes have found sixty-five reproducible defects in this code and every
> one of them has a test standing where it was.

**Start here: [docs/00-README.md](docs/00-README.md)** for the design, or
**[apps/web/README.md](apps/web/README.md)** for what is running.

---

## The four proofs

| | |
|---|---|
| **Typed, not text** | Money has dates and currencies; quantities have units; domains have renewal dates. So you can ask what is due in October. A path-addressed markdown store capped at 100 kB a file cannot answer that |
| **Every agent, the same rows** | Claude, Codex, Cursor, Copilot — over MCP. No vendor will build the screen showing what you pay its competitors |
| **Decisions that bind** | The agent lays out options and never chooses. You choose, and it becomes an immutable numbered row with a mandatory reason |
| **A history that cannot be edited — including by you** | Of four comparable products surveyed, three ship a mutable history: one has a `Clear revision history` button whose result *"cannot be retrieved"*, one lets authors delete published updates, one never claims append-only. Ours is append-only by construction, because there is one write path. See [docs/20-COLLABORATION.md §9](docs/20-COLLABORATION.md) |

## Who it is for

One person running several things at once, now using more than one agent, with no shared place to
put what all of them need to know.

**The scope claim, stated so it is testable** — because *"it works for any business"* was tried
against a fashion label, a marketing operation, a bookkeeper and a clinic, and it did not survive:

> **It works for any business whose records are named things with dates, money and quantities on
> them — and whose numbers are sums, ratios and differences over those rows.**

It is **not** a general database, a BI tool, a ledger, a PIM or a calendar. Each of those is a real
product this deliberately is not, and each refusal is written down next to the vertical that asked
for it: [docs/27-VERTICALS.md](docs/27-VERTICALS.md).

It replaces the spreadsheet of what is due, the registrar dashboard, the notes app of decisions,
the password manager opened only to recall what an account is *for*, and the paragraph retyped
into every new session.

## The price

| | |
|---|---|
| **Self-host** | **Free, forever.** The whole app, no caps, no time bomb. This is the distribution engine and the trust proof |
| **BrainDog Cloud** | **$12/mo · $120/yr** — one record, one person, hosted |
| **Cloud Team** | **$29/mo** — up to 5 people on ONE record. Priced per *record*, not per seat |
| The renderer | **MIT**, separately. AGPL on a library kills adoption |

The app is **AGPL-3.0-only**. Self-hosting is free and *complete* — that word is an architectural
constraint, not marketing: see [docs/01-ARCHITECTURE.md §4](docs/01-ARCHITECTURE.md).

## Adding to it without forking it

Everything a business's shape is made of is a **declaration** — a document, not code. A register, a
page, a rule, a metric, an ingest, a digest, a theme. Eight kinds, and a pack is a file of them.

```yaml
pack: studio-books
version: 1.0.0
summary: What a small studio owes and is owed.
author: you
license: MIT

declarations:
  - register: obligations           # the first key IS the kind
    name: Obligations
    title: what
    fields:
      - { id: what,   type: text, required: true }
      - { id: amount, type: money }
      - { id: due,    type: day, index: true }
      - { id: tags,   type: list, of: text }
      - { id: state,  type: enum, values: [open, paid], index: true }

  - metric: still-open
    source: register.obligations
    where: state is open, due before today
    value: { count: id }
    target: { lte: 5 }

  - rule: chase
    register: obligations
    when: state is open, due before today
    once_per: [entry]
    then:
      - { tag: late }
      - { notify: { say: "{{what}} is {{ago:due}}" } }

seeds:
  - register: obligations
    fields: { what: Invoice 41, due: 2026-10-01 }
```

`planPack` tells you exactly what installing it would do — what it adds, what it changes, what it
would retire and how many rows are under that, which rules would generate rows and with what
ceiling, which connectors would leave the record, which rules would interrupt somebody — and
`installPack` applies **that** plan and refuses a different one. Taking a pack out retires its
declarations and **keeps every row**.

What a pack cannot do is the reason it is safe to install one from a stranger: it declares shape and
seeds examples, and has no verb that reads a row. There is no script, so there is no sandbox to
secure. A credential in one is refused at the door, by key name, at any depth.

## The one rule the platform rests on

> **Extensions are DATA. Where data is not enough, the extension is an AGENT — never a script.**

A table survives a shared Worker; an `eval` does not. So there is no sandbox to secure, and every
variant is a readable diffable file. The worst a malicious extension achieves is a misleading page,
plus — if it declares a connector — one scheduled GET to a host named in the diff. You are shown
both before anything applies.

## What your data is

A single file you can open with tooling you already have.

```
$ file portfolio.dog
portfolio.dog: SQLite 3.x database, application id 1145193761

$ sqlite3 portfolio.dog "select seq, json_extract(fields,'$.what') from entry
                         where register='obligations' and state='open'"
```

`.dog` — **Data, Origin, Governance**. See [docs/03-DOG-FORMAT.md](docs/03-DOG-FORMAT.md).

## The intelligence, in three tiers

Because the best model is the one you already pay for, and it is not ours.

| | Runs | Who pays per token | Its job |
|---|---|---|---|
| **Spark, included** | Workers AI, in our Worker | **us**, ~$0.20/record/month | triage, extraction, digests, embeddings — no conversation in the first version ([ADR-030](docs/16-DECISIONS.md)) — **the record thinking at 3am** |
| **Your key** | our Worker, your provider | **you, to Anthropic** | **the phone.** Claude quality from a taxi — and where the conversational Spark arrives |
| **Your machine** | your own Claude Code, your own subscription | **nobody** | **the desk.** The heavy reconciliation, the long write-up |

BrainDog never holds your Claude credential, never sees your seat, and never bills against your
usage — which is not only good manners, it is what Anthropic's terms require.
[docs/26-BYO-INTELLIGENCE.md](docs/26-BYO-INTELLIGENCE.md).

## Architecture in one paragraph

One stateless Cloudflare Worker for every customer, and **one SQLite-backed Durable Object per
customer** as the system of record — which buys per-customer ids that can be spoken aloud, 30-day
point-in-time recovery, FTS5 search and a per-customer scheduler, with no provisioning step at all,
because naming an object is creating it. A second object per customer runs the assistant, which has
no write capability by construction, and one `Directory` object holds identity for every customer.
Full reasoning and the rejected alternatives:
[docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md), [docs/16-DECISIONS.md](docs/16-DECISIONS.md).

## The honest numbers

| | |
|---|---|
| The full platform as designed | **≈488–645 working days** — ≈3.0–4.0 years at 4 productive days in 9. An earlier draft said 115, and a later one 488–643 at 3.7–4.9 years; an adversarial re-cost found ~88–125 days with no line item and the stage estimates ~2.4× optimistic, a validation round added ~106–140 and a parity trace against the predecessor ~46–63 more, and the specification loop's second iteration added one package at 2 — 248–317 + 88–125 + 106–140 + 46–63 |
| **The largest version one person can ship** | **≈105–135 working days**, or **≈86–105** with every remaining cut taken — the record, and nothing declarative. An earlier draft said 70–85; the cut list it rested on subtracted items the base already excluded. See [docs/15-ROADMAP.md §1b](docs/15-ROADMAP.md) |
| Gross margin at $12/mo | **≈95% — about $0.55** of cost per active record, of which $0.20 is inference. An earlier draft said 93%/$0.86 on a dearer model |
| Base case at month 24 | 80 subscribers, ≈$960/mo |
| Modal single outcome | **$0.** Stated because it is true |

**Read those two rows before anything else.** The design is coherent; the schedule was not, twice —
once by omitting described work, and once by an arithmetic error that flattered the floor. The
honest recommendation is unchanged and is in [docs/15-ROADMAP.md §1b](docs/15-ROADMAP.md): build the
record, cut every declarative layer, and let gate 2 — ten subscribers still paying at day 30,
[ADR-031](docs/16-DECISIONS.md) — decide whether the platform is ever worth the other ≈353–540
days (488 − 135 · 645 − 105).

The likeliest cause of death is the **cold start**: a record's value is proportional to what is in
it, and on day one it is empty. Everything about packs exists to attack that.

[docs/15-ROADMAP.md](docs/15-ROADMAP.md) · [docs/17-OPEN-QUESTIONS.md](docs/17-OPEN-QUESTIONS.md)

## Vocabulary

Say **record**, never "memory". Say *your data, your database, and self-hosting is a real option*.

Never say "visual layer" — in 2026 that phrase resolves to no-code node editors priced at zero.
Never say anything ending "…Layer". Never lead with MCP, credentials or domains. Never say
"built by agents".

---

*Every figure in these documents is either measured and dated, or marked as an estimate. Platform
limits and star counts were read on 2026-08-31; API behaviour, pricing, terms and browser support
were re-verified or live-probed on 2026-09-01.*
