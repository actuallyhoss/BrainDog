# BrainDog — the project record

**Status: design complete and audited, nothing built.** This directory is the 0→1 engineering
scope. No code exists yet and none should be written until [15-ROADMAP](15-ROADMAP.md) §1b is
agreed.

> **This set has been through an adversarial review pass, and the review changed it.** Four
> reviewers audited internal consistency, feasibility, usability and the thesis. What they found is
> folded in and marked in place — every correction says what an earlier draft claimed and why it was
> wrong, because a design document that quietly fixes itself teaches nobody. The two largest:
> **the roadmap was ~3× optimistic and ~88–125 days of described work had no line item** (§1 of the
> roadmap), and **the index model would have failed at the twelfth installed pack**
> ([02-DATA-MODEL](02-DATA-MODEL.md) §1).

BrainDog is everything about a business that is not just code: money owed, renewals, hosting,
credentials, decisions and their reasons — in one typed database that every agent writes to
over MCP, and that renders itself as a web app. Open source under Apache-2.0, self-hostable free
and complete, hosted at $12/mo (D41).

> **Read the sentence above as examples, not as the product (September 22nd 2026, [DIRECTION
> §22](../loop/DIRECTION.md)).** BrainDog is the shell: a typed record, doors in and out, schedules,
> pages and a vault, which a person and their agents shape to whatever they run. Money, renewals,
> hosting and credentials are one owner's use cases built on those primitives. The code ships the
> primitives; use cases, integrations and metadata (a field, a list, a relation) are added at run
> time by people or agents, or brought by a pack somebody chose to install.

---

## How to read this

Fifty-four documents: this index, the design in 01–34, and the technical specifications in 35–53 — one per
package and app, written to the level a builder types from without a design meeting, and revised on a loop
until two audits find nothing ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §5). No code exists yet, by decision;
the loop's log is [BUILD.md](../BUILD.md).

| # | Document | Answers |
|---|---|---|
| 01 | [Architecture](01-ARCHITECTURE.md) | What it runs on, and why one Durable Object per customer is the whole design |
| 02 | [Data model](02-DATA-MODEL.md) | The record's tables, ids, money, time, and the one `where:` grammar |
| 03 | [The .DOG format](03-DOG-FORMAT.md) | The file a customer owns, what the acronym means, and how it is signed |
| 04 | [Packs](04-PACKS.md) | The extension format. A closed list of kinds, and no code ever runs |
| 05 | [Blocks and themes](05-BLOCKS-AND-THEMES.md) | The rendering dialect an agent writes, and why it cannot write a colour |
| 06 | [Pages](06-PAGES.md) | A page is a row. Nav, onboarding, and the native/authored split |
| 07 | [Ingest and rules](07-INGEST-AND-RULES.md) | Five ways in, patterns instead of parsers, and the raw inbox |
| 08 | [Metrics and analytics](08-METRICS-AND-ANALYTICS.md) | Declarative metrics for the customer, telemetry for us, and why they never mix |
| 09 | [Alarms and notifications](09-ALARMS-AND-NOTIFICATIONS.md) | One alarm per object, and how a schedule of hundreds fits inside it |
| 10 | [MCP](10-MCP.md) | The per-customer tool surface, the 2026-07-28 spec, and the token budget |
| 11 | [The assistant](11-ASSISTANT.md) | Spark: model routing, retrieval, cost per customer, and what it may never do |
| 12 | [Security](12-SECURITY.md) | Auth, the credential vault, envelope encryption, and the lethal trifecta |
| 13 | [The visual system](13-UI.md) | Typography, colour, density, motion, accessibility, RTL |
| 14 | [The Kennel and community](14-KENNEL-AND-COMMUNITY.md) | Distribution. A marketplace that is an index over files |
| 15 | [Roadmap](15-ROADMAP.md) | Clean-room staging, honest costs, the gates, and the additive future scope |
| 16 | [Decisions](16-DECISIONS.md) | Every architectural decision with its rejected alternatives |
| 17 | [Open questions](17-OPEN-QUESTIONS.md) | What is unresolved, and what measurement would settle it |
| 18 | [Build toolkit](18-BUILD-TOOLKIT.md) | The skills and repos to build this with, measured by stars |
| 19 | [Interface architecture](19-INTERFACE.md) | Screens, navigation, the keyboard model, URLs, states |
| 20 | [Collaboration](20-COLLABORATION.md) | The five tiers, the decision gate UI, permissions, presence |
| 21 | [Authoring](21-AUTHORING.md) | The creative tools: page builder, query builder, theme editor, pack builder |
| 22 | [Frontend](22-FRONTEND.md) | The stack, the runtime renderer, dense tables, feasibility |
| 23 | [The assistant's surfaces](23-ASSISTANT-UI.md) | Where Spark lives, proposal review, citations, trust |
| 24 | [Self-improvement](24-SELF-IMPROVEMENT.md) | What the record learns from its own use, and where the loop stops |
| 25 | [Connectors](25-CONNECTORS.md) | Attaching to your projects: pull-based analytics, credentials, time series |
| 26 | [Your account, your key, your machine](26-BYO-INTELLIGENCE.md) | Three tiers of intelligence, the costs, the terms, and the runner |
| 27 | [Verticals](27-VERTICALS.md) | Does it work for any job? The four-business stress test, and the honest claim |
| 28 | [Theming](28-THEMING.md) | Dynamic themes as data: generation from a seed, and the validator that gates them |
| 29 | [Emergent pages](29-EMERGENT-PAGES.md) | Pages and headers created as you go — and why the nav must not move |
| 30 | [The blueprint](30-BLUEPRINT.md) | The kernel DDL, the write path, the RPC surface, the refusal model |
| 31 | [The stack](31-STACK.md) | Languages, the package graph, the nine ports, the licence boundary |
| 32 | [Parity with the brain](32-PARITY.md) | Every feature of the working predecessor, traced to its mechanism, and where each lands |
| 33 | [The contracts](33-CONTRACTS.md) | The contracts: port signatures, RPC envelopes, HTTP surface, CLI, self-host process, wrangler, gates, export/import |
| 34 | [The grammars](34-GRAMMARS.md) | The grammars: `where:` and dialect EBNF, JSON encodings of the sixteen types, identifiers, checksums, declaration key tables |
| 35 | [Specifications — overview](35-SPEC-OVERVIEW.md) | How to read a spec, the fourteen-section template every spec follows, the eighteen specs, the revision loop |
| 36 | [Spec · render](36-SPEC-RENDER.md) | `packages/render`: the dialect parser, the sixteen kinds, `toHTML` — stage 0, MIT |
| 37 | [Spec · ports](37-SPEC-PORTS.md) | `packages/ports`: `Sql` and the eight other ports, the `node:sqlite` adapter, the conformance corpus |
| 38 | [Spec · where](38-SPEC-WHERE.md) | `packages/where`: the predicate tree, JCS print, validate, compile, the reference evaluator, the property test |
| 39 | [Spec · theme](39-SPEC-THEME.md) | `packages/theme`: the DTCG wire format, the YAML dialect, the contrast-driven generator, the sixteen checks |
| 40 | [Spec · fixtures](40-SPEC-FIXTURES.md) | `packages/fixtures`: the eight reference pages, row corpora, the pack corpus, the seed |
| 41 | [Spec · kernel](41-SPEC-KERNEL.md) | `packages/kernel`: migrations, the write path, counters, events, `entry_fts`, refusals, `.brainl` |
| 42 | [Spec · declare](42-SPEC-DECLARE.md) | `packages/declare`: the eight kinds' schemas, YAML → JSON, lint, plan, install |
| 43 | [Spec · extract](43-SPEC-EXTRACT.md) | `packages/extract`: the ten extractors, three combinators, money and date parsing |
| 44 | [Spec · mcp](44-SPEC-MCP.md) | `packages/mcp`: the fourteen tools, resources, `instructions`, one JSON-RPC core over stdio and streamable HTTP, budgets |
| 45 | [Spec · record](45-SPEC-RECORD.md) | `packages/record`: the six RPC groups, `CallContext`, `Result`, metrics, rules, schedule and outbox |
| 46 | [Spec · spark](46-SPEC-SPARK.md) | `packages/spark`: tier A jobs, the projection reader, proposals, the tier-C dispatcher |
| 47 | [Spec · connect](47-SPEC-CONNECT.md) | `packages/connect`: `ingest` with `fetch:`, placeholders, formats, `expect:`, `probe:`, `metric_point` |
| 48 | [Spec · cli](48-SPEC-CLI.md) | `apps/cli`: the `braindog` command tree, the device-flow login, export/import/verify |
| 49 | [Spec · selfhost](49-SPEC-SELFHOST.md) | `apps/selfhost`: one Node process, the Directory file, the HTTP surface, the timer and poller |
| 50 | [Spec · web](50-SPEC-WEB.md) | `apps/web`: the SvelteKit shell, the eight primitives, the palette, registers, pages, the keyboard model |
| 51 | [Spec · worker](51-SPEC-WORKER.md) | `apps/worker`: the three Durable Object classes, the DO `Sql` adapter, WebSocket, queue, R2 |
| 52 | [Spec · testing and CI](52-SPEC-TESTING-AND-CI.md) | The test pyramid, every gate as a script or spec, the workflows, publishing |
| 53 | [Spec · operations](53-SPEC-OPERATIONS.md) | Deploy, backup and restore, key rotation, erasure requests, incident response, billing lapse |

Read 01, 02 and 16 first. Everything else is downstream of those three.

---

## Two instructions that override the prior record

The brain's `braindog` entity holds four research passes and is the source of truth for
*intent*. Two things in it are now superseded, on Sam's instruction, and this is recorded here
so nobody re-derives the old answer.

### 1 · No reuse of `brain`. None.

The prior plan was built on reuse and said so plainly: stage 0 published `brain`'s `md.js` as an
MIT renderer, stage 2 was "~130 lines of shim, `worker/src/index.js` **UNTOUCHED**", and the
`reuses` field read *"everything `brain` already proved."* The ~46-day estimate rested on it.

**That is withdrawn. BrainDog is a clean-room rewrite that shares no file with `brain`.**

What this costs, stated honestly rather than buried:

| | Prior plan | Clean room |
|---|---|---|
| Renderer | extract 528 lines + 1,043 lines of tests, 2.5d | write and test from nothing, ~8d |
| Server | shim an existing Worker, 4d | design the substrate, ~10d |
| Gate-1 instrument | an already-tested library, publishable in days | a new library nobody has run — **and gate 1 itself has since been replaced**, see [15-ROADMAP](15-ROADMAP.md) §5 |
| Total | ~46d to platform launch | **≈488–645 working days — ≈3.0–4.0 years at 162 productive days a year** — after an adversarial re-cost, a validation round, a parity trace against the predecessor and the specification loop's second iteration — see [15-ROADMAP](15-ROADMAP.md) §1. The recommended shape is **≈105–135 days** for the record alone (§1b), plus 10 for stage 0 |

What it buys, which is the reason to accept it: the prior plan inherited a data model built for
one person, an `OWNER_ID`, nine `AUTOINCREMENT` id sequences that are spoken out loud, and a
schema with 402 lines of one man's seed data in it. Every one of those is a defect in a
multi-tenant product, and each would have been paid for twice — once to ship, once to remove.
The clean room is more expensive to start and cheaper to finish.

`brain`'s **lessons** are still evidence, and they are cited throughout. Its **code** is not
present.

### 2 · The assistant is called Spark, and the collision is accepted.

The prior record argued against it — *"'Spark' cannot travel: GitHub Spark is Microsoft's and
Google shipped Gemini Spark in 2026"* — and a draft of these documents renamed it to Pointer on
that basis. **Sam has since reaffirmed Spark twice.** That is the decision.

The cost is real and it is entirely discoverability: nobody finds BrainDog by searching "Spark
AI". It is affordable because this is a *feature* name inside a product, and the expensive
register check was done for **BrainDog** itself — empty in every class at USPTO, EUIPO and UK IPO.
**Always "BrainDog Spark" on first use in any public surface**, never "Spark" alone in a repo
name, a package or a domain. See [11-ASSISTANT](11-ASSISTANT.md) §1.

The better half of the rename survives as the sentence the governance model rests on:
**Spark never decides. It points at what does.**

### And one note on wording

"Visual layer" is **banned copy** — §1 of the record: in 2026 it resolves to no-code node
editors priced at zero (n8n at 203k★, Dify, Flowise, Coze). The thing itself is scoped in full
across [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) and [13-UI](13-UI.md). It is called
**the blocks** and **the themes**. The feature is not refused; the phrase is.

---

## The one rule the whole platform rests on

> **Extensions are DATA. Where data is not enough, the extension is an AGENT, or a script, and
> never a script in the core. A person's or an agent's script is record content, run in a sandbox
> BrainDog hosts (metered) or anywhere outside that pushes in through a door or the API.**

A table survives a shared Worker; an `eval` does not. So no user code runs inside the record's own
object, every declaration is a readable diffable file, and everything modular in this design
follows from it. A script is not a declaration: it is a row the record stores, attached to a door or
a schedule, and whatever it writes arrives through the same API anything else uses, under its own
actor. Hosted is a convenience and never required; a Claude routine, a server or a cron that pushes
in is the same thing to the record. The design is
[research-shell-scripts.md](../loop/research-shell-scripts.md).

*An earlier revision ended this rule "never a script". The owner answered "both" on September 22nd
2026 ([DIRECTION §22](../loop/DIRECTION.md)): BrainDog hosts small sandboxed scripts for
convenience, and anything can run outside and push in.*

---

## What is deliberately not here

| Not built | Because |
|---|---|
| Real-time co-editing | ~15–20d plus permanent maintenance, and it is where Nimbalyst and AFFiNE already sit. Tier 4, not this year |
| A double-entry accounting rewrite | 25–40d to reach parity with what Actual Budget and Firefly III give away free |
| A plugin system that runs user code inside the record | See the rule above. User code never runs inside the record's own object, and that is what makes the platform possible rather than a limit on it. A person's or an agent's script is record content, run in a metered sandbox BrainDog hosts or outside it, pushing in through a door or the API ([research-shell-scripts.md](../loop/research-shell-scripts.md)) |
| Paid packs in v1 | Tax, VAT, refunds, chargebacks and moderation are a company, not a feature |
| A shared vector index | Breaks self-host parity and the isolation proof. See [ADR-006](16-DECISIONS.md) |
| Event tracking, funnels, sessions on customer data | This is a record, not an analytics product |

---

*Every figure in these documents is either measured and dated, or marked as an estimate.
Where a number came from a third party it names the source. Star counts and platform limits
were read on 2026-08-31.*
