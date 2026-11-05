# 17 · Open questions

What this design does **not** settle. Each open one has what would settle it, because an open
question with no test attached becomes a preference argument; each answered one says where the
answer now lives, so the question is not re-opened by accident. Q15 lists the questions other
documents hold.

Ordered by how expensive it is to get wrong.

---

## Q1 · Is the clean room worth its price, now that the price is known?

**The question.** [00-README](00-README.md) §1 withdrew all reuse of `brain`. An earlier version of
this question priced that at ~115 days. **The audited number is ≈488–645 working days — ≈3.0–4.0
years at 4 productive days in 9, which is 162 productive days a year** ([15-ROADMAP](15-ROADMAP.md)
§1; the two days over the previous 486–643 are `@braindog/host`, added in iteration 2).  *(An earlier
draft of this question paired 488–643 days with 2.6–3.4 years — the years the roadmap had computed
for a smaller number.)*

**That changes the question from "is it worth 69 extra days" to "is it worth three to four years".**

**Why it is Q1.** Every other question is downstream. This is the only one that is a decision
rather than a measurement.

**Options, honestly:**

| | Cost | What it costs you |
|---|---|---|
| Clean room, full platform | ≈488–645d | ≈3.0–4.0 years before the platform exists — [15-ROADMAP](15-ROADMAP.md) §1 |
| Clean room, the §1b shape — the record and nothing declarative — then decide on gate 2 | ≈105–135d (+10 for stage 0) | nothing — this is the recommended shape |
| Allow a *clean-room reimplementation informed by* `brain`'s tests | ~95d | nothing material; tests are specifications, not code |
| Reuse `brain` as originally planned | 46d | inherits `OWNER_ID`, nine spoken id sequences built for one person, and 402 lines of one man's seed data — each paid for twice |

*(An earlier draft priced the first two rows at 115d and 60d and gated the second on gate 1; both
numbers were withdrawn in 15 §1, and gate 2 is the spending gate — [ADR-031](16-DECISIONS.md).)*

**What would settle it:** it is the owner's call, and the stage-0-first shape means it does not have to
be made yet. Stage 0 is 10 days, is useful alone, and starts the clock on gates 1a–1d — which can
veto Phase B but never authorise it.

**My recommendation:** clean room, the §1b shape, and stop at gate 2. The middle option —
reimplementing against `brain`'s existing test *specifications* while writing all new code — is
worth asking about explicitly, because 1,043 lines of tests over 106 cases encode measured
behaviour, and re-deriving them is 20 days of rediscovering things already known.

---

## Q2 · Is the assistant worth building at all in v1?

**Answered by [ADR-030](16-DECISIONS.md).** The §1b shape ships no intelligence at all. Phase A
ships tier A-minimal — triage, extraction, digest prose and embeddings on small models, no
conversational surface — with the ingest-pattern proposal as the one model-backed in-app job.
Slash's conversational mode arrives with tier B, tier C last, and a chat surface is added only when
a Cloud customer with MCP configured asks for one, with that ask instrumented. The reasoning below
is what the ADR rests on, and it stays here as the evidence.

**The question.** The buyer already has Claude Code in a terminal, with MCP access to this record.
Slash costs 8 days as first estimated (20–26 re-costed, [15-ROADMAP](15-ROADMAP.md) §1b),
~$0.20/record/month, and a permanent prompt-injection surface. What does the in-app assistant do
that the terminal one does not?

**The honest partial answer:** two things. The **ingest proposal loop** (forward three texts, get a
pattern) is genuinely in-app because it is bound to the raw inbox and the approval gate. And the
**digest sentence** is scheduled, so no terminal is open.

Everything else — "what's due", "draft this write-up", "what did I decide about X" — the terminal
agent already does, better, with more context.

**What would settle it:** ship Phase A **without** Slash, keep the two in-app jobs as narrow
non-conversational features, and instrument how often a Cloud customer with MCP configured asks
for a chat panel. If nobody asks, 8 days and an attack surface were saved.

**The external evidence, and it is unusually direct.** The Browser Company shipped Arc Max — a
settings page of five independent AI features, each on its own bespoke gesture. Their own
wind-down letter (26 May 2025) published the usage:

| Feature | Share of daily active users |
|---|---|
| Calendar Preview on Hover | **0.4%** |
| Live Folders | 4.17% |
| More than one Space | 5.52% |

Their diagnosis, verbatim: *"Arc was simply too different, with too many new things to learn, for
too little reward."* They named the failure the **"novelty tax"**, and added: *"Everything we ended
up concluding — about growth, retention — we had already seen in the data. We just didn't want to
admit it. We knew. We just were in denial."*

Their successor product's design doc states the discipline that follows: *"Every product has a
novelty budget."* BrainDog's novelty budget is already fully committed — a typed record, a
declarative page engine, a pack format, and a decision gate are four new things to learn. **An
assistant is the fifth, and it is the one with a substitute the user already owns.**

Two more data points on the same side:

- Superhuman, which is *good* at this, now has roughly twelve separate doors to its AI — a palette
  row, a bare `?`, `Cmd+J`, a sidebar, an icon, four settings pages, a separate app, a web app and
  a browser extension. Their own cognitive-load post bills that as the unmeasured cost: *"the
  mental effort employees spend before they've even started work: deciding which tool to use."*
- Every published walk-back of an AI feature was fixed by **suppression, not by a better model**.
  Google's AI Overviews remedy was *"triggering restrictions for queries where AI Overviews were
  not proving to be as helpful"*. Apple disabled notification summaries for an entire app
  category. Figma pulled *Make Designs* outright and shipped it again renamed. Firefox's answer
  was a master switch labelled **"Block AI enhancements"** — and note what it turns off: *"won't
  see pop-ups or reminders to use existing or upcoming AI features."* **The thing users demanded
  control over was the nagging, not the capability.**

**And the closest possible precedent, which is decisive.** GitHub retired **GitHub Spark** on
2026-08-04. The stated reason, verbatim:

> *"AI models and agentic development tools have advanced significantly. Builders can now build and
> refine these experiences through GitHub Copilot in the environments where they already work."*

A bespoke AI surface was killed **because the general-purpose agent in the user's existing
environment absorbed it.** That is precisely the Slash-versus-Claude-Code-in-a-terminal argument,
run as an experiment by a company with more distribution than this product will ever have, and
answered in the negative.

GitHub also deprecated **Copilot Workspace** — *"officially deprecated and no longer available to
staff or public"* — which was the most elaborate proposal-review UI anybody has shipped. Its
successor collapsed research, planning and iteration into one conversation.

*(This was once read as incidental confirmation for [ADR-017](16-DECISIONS.md), because the name
that ADR chose was not merely taken but a **retired** product's. The assistant has been Slash since
[ADR-070](16-DECISIONS.md), and whether that name is clear is Q8.)*

**Revised recommendation, now the decision.** Ship Phase A with **narrow, non-conversational** AI
jobs and no chat panel — the ingest proposal loop and the digest sentence among them. Both are bound
to a surface that already exists, neither has a terminal substitute, and both are suppressible.
Defer the conversational assistant until a Cloud customer with MCP already configured asks for it —
and instrument that ask. [ADR-030](16-DECISIONS.md) records exactly this staging.

**Flag:** this contradicts the enthusiasm in the brief. It is recorded because the strongest thing
in the prior research is a habit of refusing features on evidence, and this is the feature with the
weakest evidence.

---

## Q3 · Does the pack format survive a second author?

**The question.** The pack kinds (eight when this was asked; `KINDS` keeps them now) and sixteen value types are one person's model of a business.
Gate 5 measures it — 5 packs by somebody who is not the owner, at 6 months — but that is *after* 62–63
days of platform work as first estimated (≈126–195 re-costed — [15-ROADMAP](15-ROADMAP.md) §4).

**What would settle it earlier, and cheaply:** write three packs for businesses the owner does **not**
run, before building the page engine. A landlord pack, a photographer pack, an agency pack — as
YAML only, against the spec, with no code. If any of the three needs a ninth kind or a seventeenth
value type, the closed list is wrong and it is better to know at day 8 than at day 63.

**Cost of the test:** one day. It is the highest-value day in the whole plan.

---

## Q4 · What is the actual second-user permission model?

**The question.** Cloud Team is $29/mo for up to 5 people on one record. [12-SECURITY](12-SECURITY.md)
settles authentication but not authorisation: is it role-based or capability-based, per-register or
per-page, and how is the Keychain excluded for a contractor?

**Answered in [20-COLLABORATION](20-COLLABORATION.md) §1**, recorded as
[ADR-035](16-DECISIONS.md). Three layers — a materialised ceiling (person × register × level, five
levels: `read append write decide owner`), scope as rules over typed fields, and pages and share
links as projections that can only narrow. Capability-based, per register; the Keychain is its own
capability, owner-only by default; a share link is a projection with an empty ceiling. The schema
decision that could not wait past stage A2 is made: grants live in the kernel `member` table, not
on `entry` — [30-BLUEPRINT](30-BLUEPRINT.md) §1. Capability-based because it extends to >5 people
later without a re-model, which role-based does not.

---

## Q5 · Chat, or not chat?

**The question.** Is a conversation the right primary shape for an assistant over a typed record,
or is it structured actions plus inline suggestions? The 2026 pattern literature is turning against
chat-as-default, and this record is *typed* — which means most useful questions have a deterministic
answer that needs no model at all.

**Answered in [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §1**, recorded as [ADR-051](16-DECISIONS.md):
not chat. Slash is the palette's fallback row when a model is configured — one proposal with its
verbs, never a transcript — plus rows in Decide and Inbox. No panel, no widget, no page. The
20-question test — list the 20 questions a user most plausibly asks and count how many a metric or a
saved query answers — remains a useful instrument and belongs in 23 §14; if it is more than 12, the
answer is a better query builder, and that is the position taken.

---

## Q6 · Should the renderer's dialect be frozen before it ships?

**The question.** Stage 0 publishes the renderer on npm as the gate-1 instrument. The moment an
agent writes the dialect, it is a public contract. But the sixteen kinds have never been used by
anyone except one person.

**The risk:** shipping first and changing the dialect later breaks every write-up an agent has
produced, in a product whose whole promise is that the record outlives things.

**What would settle it:** a versioned dialect (`user_version` in the file already covers the
container; the dialect needs its own), plus the Q3 test — three packs by a non-author will exercise
kinds that one person's use never touches.

**Half answered.** `PRIMITIVES_VERSION` ([31-STACK](31-STACK.md) §6) versions the primitives and
`braindog-render`'s semver versions the dialect, so the mechanism exists. The formal grammar an
earlier review listed as the half that blocked stage 0 is now written —
[34-GRAMMARS](34-GRAMMARS.md) §2 — and the kinds are sixteen, not fifteen. What stays open is the
freeze date, which is the provisional answer below.

**Provisional answer:** ship stage 0 with the dialect marked `0.x` and an explicit
*"the dialect may change before 1.0"* in the README, then freeze it at the Phase A checkpoint. A
distribution instrument that cannot ship until the design is perfect is not an instrument.

---

## Q7 · Do we need the legacy MCP transport?

**The question.** BrainDog ships streamable HTTP only, per the 2026-07-28 spec. The legacy HTTP+SSE
transport has a one-year offramp, and some clients in the field will still be on it.

**What would settle it:** count the clients. If the three the buyer actually uses (Claude Code,
Codex, Cursor) are all on the new transport at build time, ship one transport. If one is not, the
shim is a day and it is worth a day.

**Do not** design for both. A dual-transport server carries the statelessness assumption of the old
one forever.

**The one permitted exception:** a stateless one-day shim for a named client, removed at the offramp
date — the exception [10-MCP](10-MCP.md) §1 points at, recorded in [ADR-054](16-DECISIONS.md).

---

## Q8 · Is "Slash" clear of a register, and how much does the collision cost?

**The question changed twice.** An earlier draft asked whether *Pointer* was clear. The owner then
reaffirmed the assistant's earlier name, twice, and the question became what that name cost. On
September 25th 2026 he renamed it Slash ([ADR-070](16-DECISIONS.md)), so the question is the same
one asked of a new word: what does this one cost, and is anything about it actually blocking? It is
open. It does not block the rename.

**What is known about the earlier name, which is the precedent.** GitHub Spark is Microsoft's.
Google shipped Gemini Spark in 2026. Neither was a registration search; both were enough to
establish that the term was crowded in exactly this category.

**What is known about Slash.** No registration search has been run. The word is already ordinary in
this category in a different sense: chat and agent tools call the commands a person types after `/`
slash commands, Claude Code among them ([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5 passes it
`--disable-slash-commands`). That is a generic use rather than a mark, and it is a discoverability
cost whatever a search finds.

**What would settle it:** a TMview / USPTO / EUIPO / UK IPO search across classes 9 and 42, the
same check that cleared BrainDog itself, which came back empty in every class. Cheap, and the bar
is lower here because it is a *feature* name inside a product rather than the product name, where
coexistence is the norm.

**The cost, if it clears:** discoverability, and only discoverability. Nobody will find BrainDog by
searching "Slash AI". Mitigated by the naming rule in [11-ASSISTANT](11-ASSISTANT.md) §1:
**always "BrainDog Slash" on first use**, never "Slash" alone in a repository, a package or a
domain.

**The one thing that would force a change:** a live registration in class 9 or 42 by somebody who
enforces. That is what the search is for, and it is an afternoon.

---

## Q9 · Where does the theme editor stop?

**The question.** [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) says a theme sets roles, scales and
density and nothing else, with contrast gated at install. But a customer who wants their brand
colour on their shared pages is asking a reasonable question, and shared pages are a distribution
instrument.

**The tension:** brand colour on a shared page is marketing value. A brand colour that fails
contrast against the record's own semantic roles is a broken product.

**Answered by [28-THEMING](28-THEMING.md) §4.4, [ADR-023](16-DECISIONS.md) and
[ADR-028](16-DECISIONS.md):** no role is exempt from the gate. Check B gates `accent` as text
against every surface at 4.5:1, because `accent` is used as text and measurably fails there; a brand
`accent` passes it or the generator solves `accent-text` from it, and a theme that cannot pass is
refused, not corrected. A brand colour on a shared page arrives as the register's `identity:`
accent — mark, chip, avatar, calendar dot, chart series — never as an ungated theme role; its hue is
the theme's farthest-point pick, which the kernel stores and never computes
([ADR-028](16-DECISIONS.md), as amended in iteration 2). *(An
earlier draft exempted `accent` from the gate on the grounds that it only appears on interactive
surfaces; 13 §2.2 measured the link colour failing as text at 4.22 and 3.67, which is why check B
exists.)*

---

## Q10 · Should attachments exist in v1?

**The question.** [03-DOG-FORMAT](03-DOG-FORMAT.md) §8 designs attachments in R2 with per-record
key prefixes. But an invoice PDF is exactly the thing that arrives by email, and the ingest is a
Phase B feature.

**What would settle it:** whether the raw inbox stores the message body only, or the attachments
too. Storing them is cheap; *rendering* them (a PDF viewer) is not.

**Answered in [02-DATA-MODEL](02-DATA-MODEL.md) §5 and [03-DOG-FORMAT](03-DOG-FORMAT.md) §8**,
recorded as [ADR-053](16-DECISIONS.md): the `file` type (`{ sha256, mime, bytes, name }`), the
per-record content-addressed store and `/a/<sha256>` exist and are in the §1b kernel row of
[15-ROADMAP](15-ROADMAP.md); iteration 2 added the way in — `PUT /a/<sha256>`, the client computing
the hash and the host verifying it ([33-CONTRACTS](33-CONTRACTS.md) §4); nothing is rendered in v1 —
a download link and the sha256. Open
remainder: the viewer, Phase C. *(An earlier draft of the roadmap listed attachments among the things
"the base never had"; 03 §8 records that the deferral was read back as a position.)*

---

## Q11 · The two watched external signals

Not questions to answer but conditions to monitor, restated from
[15-ROADMAP](15-ROADMAP.md) §5 because they can invalidate the thesis rather than the plan.

| Watch | If it fires |
|---|---|
| A model vendor ships a typed, user-owned, exportable store | the schema advantage collapses. Today theirs is path-addressed text capped at 100 kB a file — that cap is the entire gap |
| A competitor charges for the **record** rather than the compute | contested from inside the niche. Every one of them meters compute today; not one sells a record |

---

## Q12 · Does the Durable Object's SQL API actually use a partial expression index?

**The question.** [02-DATA-MODEL](02-DATA-MODEL.md) §1 rests the entire indexing model on this:

```sql
CREATE INDEX entry_obligations_due
  ON entry (json_extract(fields, '$.due'))
  WHERE register = 'obligations' AND deleted_at IS NULL;
```

SQLite has supported indexes on expressions since 3.9 and partial indexes since 3.8, and the
Durable Object SQL surface is SQLite. But *supported* is not *used*: the query planner has to
recognise that the predicate the compiler emits is the same expression the index was built on,
character for character, and `EXPLAIN QUERY PLAN` is the only thing that settles it.

**Why it is load-bearing.** It replaced generated columns, which failed at the twelfth installed
pack. If expression indexes are not picked up, every indexed field falls back to a scan through
`json_extract` and the ceiling moves from "storage" to "a few thousand rows per register" —
which is inside the range a real customer reaches.

**What would settle it:** a half-day spike. Create the index, insert 50,000 rows across six
registers, run `EXPLAIN QUERY PLAN` on the exact SQL the compiler emits, and confirm
`SEARCH entry USING INDEX` rather than `SCAN`. Then repeat with the `deleted_at IS NULL` clause
present and absent, because a partial index is only usable when the query's predicate provably
implies the index's.

**Half answered, 2026-09-01.** Run on Node v24.13.0 against `node:sqlite` with 3,000 rows,
`EXPLAIN QUERY PLAN` returns:

```
SEARCH entry USING INDEX entry_obligations_due (<expr><?)
```

**So the planner does use a partial expression index, on at least one of the two engines.** The
workerd half is still open — and it stops being a *spike* and becomes a **conformance case**
([31-STACK](31-STACK.md) §5), so the answer is permanent and both engines are re-checked on every
commit rather than once.

**Answered for Node, 2026-09-02.** The 2026-09-01 run used `register` as a literal in the SQL. The
compiler binds it as a parameter, and a partial index is only usable when the query's predicate
provably implies the index's — so the bound form was measured separately, on the same Node
v24.13.0: `SEARCH e USING INDEX i (<expr><?)`. Both forms use the index. Node is fully answered;
the Durable Object half is measured in week one, as the conformance case above.

**And the week-one measurement is now three conformance cases, not a spike.** `EXPLAIN` on the
Durable Object (#20), double-quoted literals (#21) and the object's counters (#30) sit in the
conformance corpus with Node's answer recorded, so the Durable Object's answer is a green or red row
on every commit rather than a one-off ([37-SPEC-PORTS](37-SPEC-PORTS.md) §13 D12;
[33-CONTRACTS](33-CONTRACTS.md) §3).

**Deadline: week one, for the Durable Object.** It gates the data model, so it happens before
anything is built on it.

**Fallback if it fails:** a narrow `entry_index(entry_id, register, field, text_val, num_val)`
side table maintained in the same transaction as the write. It costs one insert per indexed field
per write and one join per predicate, it is boring, and it cannot fail this way.

---

## Q13 · Does turning the keychain password on disable pull connectors?

**The question, and it is a genuine conflict between two things this corpus is proud of.**

[12-SECURITY](12-SECURITY.md) §6 offers an optional passphrase, and when it is on the DEK is wrapped
**only** by `HKDF(passphrase)` — the operator holds no key and cannot decrypt a grant. That is the
whole point, it is correct, and §7's honesty table says so in public.

[25-CONNECTORS](25-CONNECTORS.md) needs the Worker to decrypt a grant **on a schedule, with nobody
present**, to send a bearer token or refresh an OAuth credential.

**Both cannot be true at once.** Two defensible answers:

| | |
|---|---|
| **(a) Connectors pause without a live session** | honest, simple, and it makes the passphrase mean exactly what it says. The cost is that a security feature silently disables an unrelated one, and the user finds out from a gap in a chart |
| **(b) Connector grants live under a second, KEK-wrapped DEK** | connectors keep working. **The cost is that the operator *can* decrypt those specific credentials — read-scoped analytics keys, not the whole Keychain** |

**What must not happen is (b) silently.** [12-SECURITY](12-SECURITY.md) §7 is a table of what we can
see, and it was already corrected once for overclaiming. Taking (b) without adding a row to it makes
that table false, which is worse than either answer.

**Answered in [12-SECURITY](12-SECURITY.md) §7, recorded as [ADR-052](16-DECISIONS.md): (b).**
Connector grants live under a second, KEK-wrapped DEK — the `connector` row of the kernel
`vault_key` table, always wrapped by the KEK — that the passphrase does not cover. The honesty table
carries the row, and the bind screen says it in words: *"this credential is stored so BrainDog can
use it while you are away. Your passphrase does not cover it."* Then the choice is the user's, at
the moment it matters, which is the pattern the whole product uses. Iteration 2 kept the shape and
added two facts: decryption happens in the host — the Worker or the self-host process — never in the
record, and sign-up generates all three keys, the record DEK, the connector DEK and the signing key
([ADR-062](16-DECISIONS.md)).

---

## Q14 · Is half to two-thirds of real APIs enough?

**The measurement:** ~64% of the nine APIs modelled, and — independently — ~53% of Airbyte's 609
real connectors reachable with substitution plus a typed window, ~71% within its pure-declarative
tier. **Not convergence — two populations**: 53% is the honest number for *any* API, 64% for the ones this buyer uses.

**The question is not whether the number can be raised.** It can: an expression language reaches
~85%, and that is exactly the trade Ansible, GitHub Actions and CloudFormation each made.

**It is whether ~53–71% plus a good fallback beats ~85% plus a language.** The fallback is
`mode: agent` — the record asks, the user's own agent fetches, the human approves — and it creates
**no new capability**: no egress, no write path, no new security surface.

**What would settle it:** ship five connectors, count how many of the next five need the fallback.
If it is more than two, the format is too narrow. If it is zero, the format may be too generous and
the expression pressure will come from somewhere else.

---

## Q15 · Questions held in other documents

Twenty-five open questions live outside this document, and the specification loop's own residue
is listed with them. Listed so that this document is the one place to look, and so that a question
settled elsewhere is not re-asked here.

| Where | Count | The ones that gate a stage, and what has since closed |
|---|---|---|
| [21-AUTHORING](21-AUTHORING.md) §13 | 8 | none gate a stage — the authoring tier is outside §1b. The type-change conversion preview stays open there |
| [22-FRONTEND](22-FRONTEND.md) §12 | 5 | **DO bindings in `vite dev`** — verify before A1 (22 says "stage 1", the prior plan's numbering) |
| [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §14 | 7 | none. Row 1 (*does the assistant ship in v1?*) is Q2, answered by [ADR-030](16-DECISIONS.md), and should be deleted there in favour of it |
| [30-BLUEPRINT](30-BLUEPRINT.md) §12 | 4 | all four closed: the dialect grammar → [34-GRAMMARS](34-GRAMMARS.md) §2; billing lapse and the export guarantee → [ADR-059](16-DECISIONS.md); the six first-party packs' seeds → the first task of B2; an `admin` token for the install path → never a scope — the install path is a single-use operation grant, [ADR-060](16-DECISIONS.md) as amended in iteration 2 |
| [31-STACK](31-STACK.md) §6 | 1 | first publish under trusted publishing (stage 0) — publish `0.0.1` by hand and wire it up afterwards |
| [35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §5 — the revision, after iteration 2 | — | the rulings settled the audit's thirty-two conflicts and are folded into 16 as [ADR-063](16-DECISIONS.md)–[ADR-068](16-DECISIONS.md). What the revision leaves open, by design rather than by omission: the Durable Object's three conformance cases (Q12, week one); passkeys and the theme editor in later phases; `pack install --force` and `export --with-grants`, marked *CLI: later*; the OAuth authorization server ([ADR-054](16-DECISIONS.md)) |

**What stays genuinely open across the corpus:** the Durable Object planner measurement (Q12, week
one, as three conformance cases); the OAuth authorization server — Phase A ships agent tokens only
and the RFC 9728 document is deferred with its reason, [ADR-054](16-DECISIONS.md); the two CLI flags
marked *later*; and the type-change conversion preview, which is authoring-tier scope.

---

*Next: [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md).*
