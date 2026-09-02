# BrainDog

**Everything about your business that isn't code — in one database your agents can write to.**

Money owed, renewals, hosting, credentials, decisions and their reasons. Open source, and hosted
for you if you want. It renders itself as a web app.

---

> ## Status: design only. Nothing is built.
>
> This repository currently contains **[docs/](docs/)** — the complete 0→1 engineering scope — and
> no implementation. Nothing should be written until the shape in [docs/15-ROADMAP.md §1b](docs/15-ROADMAP.md) is
> agreed.

**Start here: [docs/00-README.md](docs/00-README.md)**

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
| The full platform as designed | **≈486–643 working days** — ≈3.0–4.0 years at 4 productive days in 9. An earlier draft said 115, and a later one 488–643 at 3.7–4.9 years; an adversarial re-cost found ~88–125 days with no line item and the stage estimates ~2.4× optimistic, and a validation round added ~106–140 and a parity trace against the predecessor ~46–63 more — 246–315 + 88–125 + 106–140 + 46–63 |
| **The largest version one person can ship** | **≈103–133 working days**, or **≈84–103** with every remaining cut taken — the record, and nothing declarative. An earlier draft said 70–85; the cut list it rested on subtracted items the base already excluded. See [docs/15-ROADMAP.md §1b](docs/15-ROADMAP.md) |
| Gross margin at $12/mo | **≈95% — about $0.55** of cost per active record, of which $0.20 is inference. An earlier draft said 93%/$0.86 on a dearer model |
| Base case at month 24 | 80 subscribers, ≈$960/mo |
| Modal single outcome | **$0.** Stated because it is true |

**Read those two rows before anything else.** The design is coherent; the schedule was not, twice —
once by omitting described work, and once by an arithmetic error that flattered the floor. The
honest recommendation is unchanged and is in [docs/15-ROADMAP.md §1b](docs/15-ROADMAP.md): build the
record, cut every declarative layer, and let gate 2 — ten subscribers still paying at day 30,
[ADR-031](docs/16-DECISIONS.md) — decide whether the platform is ever worth the other ≈350–540
days (486 − 133 · 643 − 103).

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
