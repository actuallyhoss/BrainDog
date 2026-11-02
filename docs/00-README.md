# BrainDog: the design documents

**Status: built, and in production.** BrainDog runs at brain.dog, and this repository is the code that runs it. The
documents in this folder were written before that code, from 2 September 2026, and the code has since overtaken most of
them. Where a document and the code disagree, the code is the truth.

**This folder is not the plan.** The milestones and what is true today are kept outside it, and
[15-ROADMAP](15-ROADMAP.md) is an older roadmap, kept as history.

BrainDog is the shell (September 22nd 2026): a typed record, doors in and out,
schedules, pages and a Keychain, which a person and their agents shape to whatever they run. The code ships the primitives;
use cases, integrations and metadata (a field, a list, a relation) are added at run time by people or agents, or
brought by an add-on (a pack) somebody chose to install. Money, renewals, hosting and credentials, which many of these documents
use as their examples, are use cases built on those primitives, not the product.

---

## How to read this folder

Every document carries one of three labels.

- **CONTRACT**: read from disk by a gate or a test, or matched by the code line for line. It is kept exact, and it is
  edited in the same change as the code it describes. Where a gate or a test reads it, changing that code and not the
  section turns CI red.
- **REFERENCE**: design intent that still holds. Read it for why; where it disagrees with the code, the code is right.
- **HISTORICAL**: a build-time plan the code overtook. Builders do not read it, and nobody rewrites it to match the
  tree; where it disagrees with the code, the code wins.

Where a label names sections, only those sections carry it, and the label after the semicolon covers the rest of that
document. The last column names what reads each CONTRACT section, or the code it is kept beside when nothing reads it.

These rules hold for every document here, whatever its label: every relative link lands on a file
(`docs/test/links.test.mjs`), and a sentence that spells out how many block kinds there are must agree with the `TABLE`
in `packages/render/src/kinds.ts` (`tools/gates/closed-lists.mjs`). A count of gates, MCP tools, MCP resource templates,
refusal codes or declaration kinds stated in `README.md` or in a document here that is not HISTORICAL must agree with
the code too (`tools/gates/docs-counts.mjs`).

| # | Document | Label | Read by, or kept beside |
|---|---|---|---|
| 01 | [Architecture](01-ARCHITECTURE.md) | REFERENCE | |
| 02 | [Data model](02-DATA-MODEL.md) | CONTRACT §6, the `where:` grammar; REFERENCE | kept beside `packages/where`; no gate reads it |
| 03 | [The .DOG format](03-DOG-FORMAT.md) | REFERENCE | |
| 04 | [Packs](04-PACKS.md) | REFERENCE | |
| 05 | [Blocks and themes](05-BLOCKS-AND-THEMES.md) | CONTRACT, the block grammar | kept beside `packages/render/src/kinds.ts`; no gate reads it beyond the rule on counting the kinds |
| 06 | [Pages](06-PAGES.md) | CONTRACT, the page grammar | kept beside `packages/kernel/src/pages.ts`; no gate reads it |
| 07 | [Ingest and rules](07-INGEST-AND-RULES.md) | CONTRACT §6.2, automations; REFERENCE | kept beside `packages/kernel/src/rules.ts`, which declares an automation's trigger and steps, and `flow-lint.ts`, which says what its body may hold; no gate reads it |
| 08 | [Metrics and analytics](08-METRICS-AND-ANALYTICS.md) | REFERENCE | |
| 09 | [Alarms and notifications](09-ALARMS-AND-NOTIFICATIONS.md) | REFERENCE | |
| 10 | [MCP](10-MCP.md) | CONTRACT §4, the token budget; REFERENCE | kept beside `CEILING` in `packages/mcp/test/budget.test.ts`, which measures the tools and does not read this document |
| 11 | [The assistant](11-ASSISTANT.md) | REFERENCE | |
| 12 | [Security](12-SECURITY.md) | REFERENCE | |
| 13 | [The visual system](13-UI.md) | REFERENCE | |
| 14 | [The Kennel and community](14-KENNEL-AND-COMMUNITY.md) | CONTRACT §1, the Kennel as built; HISTORICAL | |
| 15 | [Roadmap](15-ROADMAP.md) | HISTORICAL | replaced by a roadmap kept outside this folder |
| 16 | [Decisions](16-DECISIONS.md) | REFERENCE | |
| 17 | [Open questions](17-OPEN-QUESTIONS.md) | HISTORICAL | |
| 18 | [Build toolkit](18-BUILD-TOOLKIT.md) | HISTORICAL | |
| 19 | [Interface architecture](19-INTERFACE.md) | REFERENCE | |
| 20 | [Collaboration](20-COLLABORATION.md) | REFERENCE | |
| 21 | [Authoring](21-AUTHORING.md) | REFERENCE | |
| 22 | [Frontend](22-FRONTEND.md) | REFERENCE | |
| 23 | [The assistant's surfaces](23-ASSISTANT-UI.md) | REFERENCE | |
| 24 | [Self-improvement](24-SELF-IMPROVEMENT.md) | REFERENCE | |
| 25 | [Connectors](25-CONNECTORS.md) | CONTRACT, the connector declaration | kept beside `packages/connect`; no gate reads it |
| 26 | [Your account, your key, your machine](26-BYO-INTELLIGENCE.md) | REFERENCE | |
| 27 | [Verticals](27-VERTICALS.md) | HISTORICAL | |
| 28 | [Theming](28-THEMING.md) | REFERENCE | |
| 29 | [Emergent pages](29-EMERGENT-PAGES.md) | HISTORICAL | |
| 30 | [The blueprint](30-BLUEPRINT.md) | CONTRACT §1, §2, §3, §5, §6 and §13; REFERENCE | §1: `packages/kernel/test/migrate.test.ts` (migration 0001's SQL equals the one `sql` fence, which needs LF endings), `tools/gates/closed-lists.mjs` (the CHECK lists) and `tools/gates/event-kinds.mjs`; §2: `event-kinds.mjs`, with its counted sentence; §3: `tools/gates/slash-actor.mjs`; §5: `tools/gates/router-groups.mjs`, the group rows and the sentence that totals them; §6: `tools/gates/refusals.mjs` and `tools/gates/refusal-fixtures.mjs`; §13: `refusals.mjs` |
| 31 | [The stack](31-STACK.md) | CONTRACT §2, the numbered package order; REFERENCE | `tools/gates/graph.mjs` |
| 32 | [Parity with the brain](32-PARITY.md) | HISTORICAL | |
| 33 | [The contracts](33-CONTRACTS.md) | CONTRACT §4, the HTTP surface; REFERENCE | `tools/gates/router-groups.mjs`, which needs every `/account/*` route named there |
| 34 | [The grammars](34-GRAMMARS.md) | CONTRACT | §6: `tools/gates/closed-lists.mjs`, every closed list and its count; §1, the `where:` grammar, kept beside `packages/where` |
| 35 | [Specifications, overview](35-SPEC-OVERVIEW.md) | HISTORICAL | |
| 36 | [Spec · render](36-SPEC-RENDER.md) | HISTORICAL | |
| 37 | [Spec · ports](37-SPEC-PORTS.md) | HISTORICAL | |
| 38 | [Spec · where](38-SPEC-WHERE.md) | HISTORICAL | |
| 39 | [Spec · theme](39-SPEC-THEME.md) | HISTORICAL | |
| 40 | [Spec · fixtures](40-SPEC-FIXTURES.md) | CONTRACT §6, the `via` table; HISTORICAL | `tools/gates/refusal-fixtures.mjs`, each fixture's `via` and the keys it may carry |
| 41 | [Spec · kernel](41-SPEC-KERNEL.md) | HISTORICAL | |
| 42 | [Spec · declare](42-SPEC-DECLARE.md) | CONTRACT §4.4, the register and field keys; HISTORICAL | `packages/kernel/test/declare.test.ts`, the keys the kernel admits are the ones published |
| 43 | [Spec · extract](43-SPEC-EXTRACT.md) | HISTORICAL | |
| 44 | [Spec · mcp](44-SPEC-MCP.md) | HISTORICAL | |
| 45 | [Spec · record](45-SPEC-RECORD.md) | HISTORICAL | |
| 46 | [Spec · slash](46-SPEC-SLASH.md) | HISTORICAL | |
| 47 | [Spec · connect](47-SPEC-CONNECT.md) | HISTORICAL | |
| 48 | [Spec · cli](48-SPEC-CLI.md) | HISTORICAL | |
| 49 | [Spec · selfhost](49-SPEC-SELFHOST.md) | HISTORICAL | |
| 50 | [Spec · web](50-SPEC-WEB.md) | HISTORICAL | |
| 51 | [Spec · worker](51-SPEC-WORKER.md) | HISTORICAL | |
| 52 | [Spec · testing and CI](52-SPEC-TESTING-AND-CI.md) | HISTORICAL | |
| 53 | [Spec · operations](53-SPEC-OPERATIONS.md) | REFERENCE | |
| 54 | [The writing guide](54-WRITING.md) | CONTRACT, made from `tools/gates/words.json` by `tools/gates/words-guide.mjs` | `tools/gates/test/words.test.mjs`, the page is the list printed |
| 55 | [The Mac and iPhone apps](55-DESKTOP-APP.md) | PLAN | |

A builder reads the CONTRACT sections a change touches, and nothing else here. To learn how a part works, read its code.

---

## Two instructions that still stand

Several documents cite this index for them, so they are kept here as the owner gave them.

### 1 · No reuse of `brain`. None.

**BrainDog is a clean-room rewrite that shares no file with `brain`,** the working predecessor. The first plan reused
`brain`'s renderer and Worker, and the owner withdrew that before any code was written. The reason still holds: the
predecessor's data model was built for one person, with an `OWNER_ID`, spoken `AUTOINCREMENT` ids and one person's seed
data in its schema, and each of those is a defect in a product that holds many people's records. The `clean-room` gate
(`tools/gates/clean-room.mjs`) keeps the predecessor's names out of the source.

`brain`'s **lessons** are still evidence, and they are cited throughout. Its **code** is not present.

### 2 · The assistant is called Slash, and whether the name collides is still open.

The owner renamed it on September 25th 2026 ([ADR-070](16-DECISIONS.md)); its
specification is [46-SPEC-SLASH](46-SPEC-SLASH.md). The new name has had no register check, which is
[Q8](17-OPEN-QUESTIONS.md), and that blocks nothing: it is a feature name inside a product, and the register check that
mattered was done for **BrainDog** itself. **Always "BrainDog Slash" on first use in any public surface**, never "Slash"
alone in a repository, a package or a domain name. See [11-ASSISTANT](11-ASSISTANT.md) §1.

The sentence the governance model rests on: **Slash never decides. It points at what does.**

### And one note on wording

"Visual layer" is **banned copy**: in 2026 the phrase means no-code node editors priced at zero. The thing itself is
scoped across [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) and [13-UI](13-UI.md), and it is called **the blocks**
and **the themes**. The feature is not refused; the phrase is.

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
in is the same thing to the record.

*An earlier revision ended this rule "never a script". The owner answered "both" on September 22nd
2026: BrainDog hosts small sandboxed scripts for
convenience, and anything can run outside and push in.*

---

## What is deliberately not here

| Not built | Because |
|---|---|
| Real-time co-editing | ~15–20d plus permanent maintenance, and it is where Nimbalyst and AFFiNE already sit. Tier 4, not this year |
| A double-entry accounting rewrite | 25–40d to reach parity with what Actual Budget and Firefly III give away free |
| A plugin system that runs user code inside the record | See the rule above. User code never runs inside the record's own object, and that is what makes the platform possible rather than a limit on it. A person's or an agent's script is record content, run in a metered sandbox BrainDog hosts or outside it, pushing in through a door or the API |
| Paid packs in v1 | Tax, VAT, refunds, chargebacks and moderation are a company, not a feature |
| A shared vector index | Breaks self-host parity and the isolation proof. See [ADR-006](16-DECISIONS.md) |
| Event tracking, funnels, sessions on customer data | This is a record, not an analytics product |

---

*Every figure in these documents is either measured and dated, or marked as an estimate.
Where a number came from a third party it names the source. Star counts and platform limits
were read on 2026-08-31.*
