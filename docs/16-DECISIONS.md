# 16 · Decisions

Architectural decisions with their rejected alternatives. A decision without its alternatives is
an assertion, and an assertion gets re-litigated every six weeks.

Format: what was decided, what was rejected and why, and what would reverse it.

---

## ADR-001 · The system of record is one SQLite Durable Object per customer

**Decided.** One Durable Object instance per customer, SQLite-backed, holding the whole record.

**Rejected:**

| Alternative | Why not |
|---|---|
| One shared D1 with a `tenant_id` column | Nine id sequences are **spoken out loud** — "#125", "D41". The second customer's first task would be #4,732. And isolation would be a property of every query being correct forever, rather than of the runtime's addressing |
| One D1 per customer (the prior plan) | A control-plane API call per signup that can fail, retry and orphan. Plus PITR, FTS5 and per-customer scheduling would all have to be built. A 50,000-database account ceiling |
| Postgres via Hyperdrive | The record is a single-writer document, not shared OLTP. Adds an operational dependency the self-host must also satisfy |
| KV or R2 as the store | No queries. Pages, metrics and rules are all queries |

**Bought:** zero-step provisioning (naming *is* provisioning), 30-day point-in-time recovery,
FTS5, a per-customer alarm, and storage in the same thread as the code.

**Cost:** a 10 GB ceiling per customer, no cross-customer queries, one alarm, and a bug in the
record class affects every customer at once.

**Would reverse it:** a customer legitimately needing >10 GB of *rows* (not attachments), or
cross-customer reporting becoming a product requirement.

---

## ADR-002 · The record object makes no outbound network calls

**Decided.** Inference, email out, webhooks out and pack fetching happen in the Worker or in
Slash's object. The record can be asked for data and can store data. It cannot speak.

**Amended by [ADR-021](16-DECISIONS.md):** the one exception is the outbox doorbell —
`Scheduler.wake()`, a queue `send()` carrying a record id, the last statement after every write.
It carries no data and it is a no-op on the self-host.

**Why:** two independent reasons want the same constraint. `fetch()` inside a Durable Object
breaks the input/output gates and permits request interleaving — a correctness bug. And an object
that cannot call out cannot exfiltrate — a security property against the lethal trifecta.

**Rejected:** `blockConcurrencyWhile()` around outbound calls. It works, and it makes every future
contributor responsible for remembering it. A structural rule beats a discipline.

**Cost:** one extra RPC hop for anything that combines a model call with a write.

**Would reverse it:** Durable Objects gaining an outbound call that is provably gate-safe — and even
then the exfiltration half of the argument stands, so this is unlikely ever to move.

---

## ADR-003 · `entry` is one table; registers are declarations

**Decided.** All rows live in one `entry` table with a JSON `fields` column. A field a register
declares indexable gets a **partial expression index** on `json_extract(fields,'$.x') WHERE
register = …` — **not a generated column.** An earlier draft said generated columns, which cannot
work on a shared table: 64 registers × 8 indexed fields is up to 512 columns against SQLite's
100-column ceiling, failing at roughly the twelfth installed pack. See
[02-DATA-MODEL](02-DATA-MODEL.md) §1.

**Rejected:** a real table per register. It is faster and it is typed by the database — and
uninstalling a pack would then mean dropping tables, which destroys the customer's rows. The pack
contract is *declarations belong to the pack, rows belong to you*, and that contract is only
keepable this way. It also keeps the `.brain` schema stable across every pack combination, which is
what makes the file openable by plain `sqlite3`.

**Cost:** queries go through `json_extract`. Recovered by expression indexes for declared fields;
an unindexed field is a scan, which is microseconds at thousands of rows.

**Would reverse it:** a register reaching millions of rows, at which point that one register gets
promoted to a real table with a documented migration.

---

## ADR-004 · `.brain` is a SQLite database, typed by `application_id`

**Decided.** `PRAGMA application_id = 0x444F4721` (`DOG!`), `PRAGMA user_version` as the format
revision. Acronym: **Data, Origin, Governance** — the file's three real sections.

**Rejected:**

| Alternative | Why not |
|---|---|
| A zip container (`.docx`/`.epub` shape) | cannot query without unpacking, cannot read partially, and needs a serialiser that can drift from the live store |
| JSON or JSONL | no partial read, no query, and 400 MB of JSON is not a document anyone can inspect |
| A custom binary format | a reader nobody has, for a product whose pitch is that you can check what we hold |
| Whole-file encryption by default | destroys the property that makes the format worth having |

**Bought:** the export is a **canonical logical dump** (`.brainl`) streamed from the record in pages;
the `.brain` SQLite file is materialised by the CLI or the self-host, never inside the Worker —
`VACUUM INTO` and `ATTACH` are unavailable in workerd ([03-DOG-FORMAT](03-DOG-FORMAT.md) §3,
[ADR-034](16-DECISIONS.md)). There is still no bespoke serialiser to have a bug in: the dump is rows
by primary key in declared column order, and the round-trip gate is that logical dump, not byte
equality. `file(1)` names the format. `sqlite3` opens it. *(An earlier version of this ADR recorded
`VACUUM INTO` as the bought property — a mechanism 03 verified on 2026-09-01 cannot run where the
record lives.)*

**Would reverse it:** SQLite ceasing to be readable by tooling a customer already has — nothing on
the horizon.

---

## ADR-005 · Extensions are data; where data is insufficient, an agent

**Decided.** Eight extensible kinds, a closed list, none of which executes. No sandbox, no eval,
no plugin runtime, no Workers for Platforms.

**Rejected:** a real plugin system. It is the obvious way to be extensible, and it would require a
sandbox to secure, per-tenant code deployment, a review process for binaries whose intent cannot
be diffed, and a permanent security surface. The prior research's line holds: *a table survives a
shared Worker; an `eval` does not.*

**Bought:** the worst a malicious pack achieves is a misleading page, plus one scheduled GET to a named host if it declares a `source:` ([ADR-025](16-DECISIONS.md)), which the diff shows before
it applies. Every variant is readable, diffable, shareable text. And it makes the marketplace an
index over files rather than a platform with a moderation queue.

**Cost:** anything genuinely computational is not a pack. That is the escape hatch — it is an
agent — and the product is already about agents.

**Would reverse it:** a class of pack customers demonstrably need that no declaration plus an agent
can express — and the answer would still be a ninth kind before a sandbox.

**Amended September 22nd 2026, by the owner's answer "both".**
Never a script in the core; a person's or an agent's script is record content, run in a sandbox
BrainDog hosts (metered, per account) or anywhere outside that pushes in through a door or the
API. A person, Claude or Slash writes one and attaches it to a schedule or a door, and its writes
arrive through the same API anything else uses, under its own actor. What survives of this ADR is
the part that was load-bearing: a pack is data, nothing a pack declares executes inside the record,
and no user code runs in the record's own object. What it no longer says is "no sandbox": the
hosted sandbox is a convenience, never required, and it carries its own ceilings, metering and key handling.

---

## ADR-006 · Embeddings live in the customer's own SQLite; no shared vector index

**Decided.** `bge-m3` embeddings quantised to int8 in `entry_vec`, brute-forced with cosine
similarity, fused with FTS5 results by reciprocal rank.

**Rejected:** Vectorize with a namespace per customer. It scales far higher and it is one shared
index — so isolation becomes a property of a metadata filter being correct, and a self-hoster has
no equivalent at all, which violates *self-host free and complete*.

**The arithmetic that makes it safe:** 1,024 bytes per row at int8/1024-dims → a 20,000-row record
is ~20 MB in a 10 GB object, and 20M int8 MACs is single-digit milliseconds.

**Cost:** a practical ceiling around 50,000 rows per record.

**Would reverse it:** records routinely exceeding 50,000 rows, which would mean a different
customer than the one this is for.

---

## ADR-007 · The metric fields `target` and `window` are mandatory

**Decided.** A metric declaration without both is refused at install.

**Why:** *a number with no target is decoration; a number with no comparison window is a number
you cannot act on.* Every dashboard product makes these optional and every dashboard product is
full of numbers nobody acts on.

**Cost:** slightly more friction authoring a metric. That is the intended effect.

**Would reverse it:** a metric whose target is genuinely undefined — a raw counter with nothing to
compare against — and the answer there is a `series`, not an optional `target`.

---

## ADR-008 · Eight MCP tools, fixed, regardless of register count

**Decided.** `record_index`, `search`, `get`, `list`, `create`, `update`, `propose`, `log`, plus
per-register **schemas delivered as resources**. Registers are arguments, not tools.

**Rejected:** a tool per register — the naive design. It puts every customer's whole schema into
every context window of every session in every client, forever.

**Evidence:** a comparable prior MCP server shipped a ~27,000-token digest as its default
orientation response and cut it to a ~1,300-token index — a 95% reduction on the first call of
every session with no loss of capability.

**Enforced by:** token budgets asserted in CI. `tools/list` under 1,800 tokens, raised to 2,600 when the surface grew to fourteen tools ([44-SPEC-MCP](44-SPEC-MCP.md) §7).

**Would reverse it:** an MCP client the buyer uses that cannot read resources, which would force
schemas back into tool descriptions and break the 1,800-token budget.

---

## ADR-009 · The decision gate is enforced server-side, via MCP's MRTR

**Decided.** A write that requires a decision returns `resultType: "input_required"` with the
options; the client re-calls with `inputResponses` carrying the choice and the mandatory reason.

**Rejected:** a client-side confirmation prompt, or a "pending" status the human resolves in the
web app later. The first can be bypassed or auto-approved by the client; the second breaks the
flow of whichever tool the person is actually in.

**Why it matters:** the gate holds **regardless of which client or model is on the other end**,
because the server refuses the write. That is the property a governance mechanism needs.

**The failure mode to design against, and it has a corpse.** GitHub's Copilot Workspace staged
every task through five separately-generated, separately-editable, separately-regeneratable
artifacts — Task → Topic → current spec → proposed spec → Plan — before a line of code existed.
Each regeneration invalidated everything downstream. Their own final changelog is the walk-back
("Reducing Action Button Clicks", "Consolidating the Plan Action Buttons"), and the product was
then deprecated outright.

**So the gate is ONE decision, not a staircase.** Options, a choice, a reason, a row. No
intermediate artifact that must itself be approved before the real question can be asked. If a
proposal needs three approvals to land, the design is wrong.

Three mechanisms worth taking from the survivors, all cheap:

| From | Mechanism |
|---|---|
| Zed | an **undo for the review action itself** — a rejection stack, so a fast reviewer can decline without fear of losing something mis-read. Nobody else ships it |
| Warp | **batched review comments as one re-instruction.** Comments anchor to lines, accumulate, and submit together; the agent answers once with a fresh proposal. N chatty turns become one — and it is cheaper in tokens, which matters at $12/mo |
| GitHub | **resolution reasons** on a closed suggestion — *Addressed · Won't fix · Incorrect*. The cheapest possible instrument for learning which proposals were noise |

And one from Zed that maps exactly onto packs: Zed refuses to offer an "always allow" rung for
**skills**, reasoning that *"skills are inert by themselves — they're just instructions — but the
side effects of the model following those instructions are not."* A BrainDog pack is inert data
whose rules have side effects, so a pack install is never auto-approved, however trusted its
author.

**Counter-pressure, recorded:** the ecosystem is moving the other way — auto-approve modes replaced
human approval with a classifier and became default. BrainDog's position is that money,
cancellations and credentials keep the human, and MRTR is now the standards-track way to do it.

**Would reverse it:** MRTR being withdrawn from the MCP spec — in which case the gate falls back to
`propose` → suggestion → decide in the app, still refused server-side; the human is never the part
that moves.

---

## ADR-010 · Slash has no write capability, and no tool that returns a secret

**Decided.** The assistant runs in a separate object with no write RPC. It proposes. There is no
tool that decrypts a grant — absent, not gated.

**Rejected:** a capable assistant with permission checks. Permissions are a control that has to be
correct on every path; absence of a path is a control that cannot be wrong.

**Consequence accepted:** the assistant is less immediately impressive. A perfect jailbreak yields
a row in `suggestion`.

**Would reverse it:** nothing short of the security argument failing; a more capable assistant is an
agent over MCP, which already exists and already has the gate.

---

## ADR-011 · Passkeys, and no passwords at all

**Decided.** WebAuthn primary, email magic link fallback, agent tokens for headless.

**Rejected:** passwords with 2FA. A record holding credentials should not itself be protected by a
reusable phishable secret. Also satisfies WCAG 2.2's accessible-authentication criterion for free.

**Rejected:** SMS 2FA. SIM swap is exactly the attack this data attracts.

**Staging:** the §1b base of [15-ROADMAP](15-ROADMAP.md) ships the magic-link fallback alone;
passkeys land in A3. Neither path is a password.

**Would reverse it:** WebAuthn losing platform support on a device class the buyer uses — the
fallback is still the magic link, never a password.

---

## ADR-012 · The keychain password is optional and defaults to OFF

**Decided.** Envelope encryption always; an optional passphrase that removes the operator's
ability to decrypt, defaulting to off, with the consequence stated in the same sentence as the
switch.

**Why off:** a founder locking themselves out of their own hosting credentials is more likely than
the operator reading them. And the strongest honest answer to "can you read my data" is
self-hosting, which a free and complete self-host build makes real.

**Rejected:** on by default (support becomes unable to help with the most valuable data), and
absent entirely (no answer for a customer who wants one).

**The connector clause (Q13):** connector grants live under a second, KEK-wrapped DEK the
passphrase does not cover, so a scheduled connector can decrypt with nobody present; the
[12-SECURITY](12-SECURITY.md) §7 honesty table carries the row and the bind screen says it in words
— [ADR-052](16-DECISIONS.md).

**Would reverse it:** a measured pattern of operator-side reads of grants, or a regulator requiring
customer-held keys by default.

---

## ADR-013 · One `where:` grammar, seven consumers

**Decided.** Pages, rules, metrics, alarms, `immutable_when:` locks, self-improvement predictions
and ingest `match:` share one predicate grammar, built once in stage A2 — seven, and the canonical
list is [02-DATA-MODEL](02-DATA-MODEL.md) §6; the full grammar is [34-GRAMMARS](34-GRAMMARS.md) §1.
*(An earlier version of this ADR enumerated six under a title that said seven; the one it dropped
was ingest `match:`, the consumer with the second backend.)*

**Precedent:** Firefly III has 33 action classes and **zero** trigger classes, because triggers
feed the same search grammar as transaction search.

**Bought:** "new filter", "new trigger" and "new metric predicate" are one commit. One thing to
secure instead of seven — the canonical list is [02-DATA-MODEL](02-DATA-MODEL.md) §6, and it is canonical because four documents had four different counts. The fifth and sixth consumers are the evidence: a period lock — the control
an auditor asks about first — cost one predicate on the write path, and the self-improvement loop's
falsifiable predictions ([24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.6) cost **nothing at
all**, because a prediction's `measure:` is just a `where:` with a frozen baseline. That is the
whole reason the loop is affordable in this architecture and would not be in another.

**Cost:** the grammar must serve seven masters, so it is more conservative than any one of them
would choose. `contains` compiles to `instr(lower(x), lower(?))` rather than `LIKE` because Durable
Objects cap a LIKE pattern at 50 bytes — **workerd's `sqlite3_limit`, not SQLite's default**, which
is 50,000 ([02-DATA-MODEL](02-DATA-MODEL.md) §6) — a silent ceiling that would otherwise ship.
Full-text is a separate operator, `matches:`, over FTS5 ([ADR-055](16-DECISIONS.md)). *(An earlier
version attributed the cap to SQLite and had `contains` compile to FTS5.)*

**Would reverse it:** a consumer whose predicate needs cannot be met by the shared grammar without
weakening it for the other six — and the answer would be a named refusal, as in ADR-019, not a
second grammar.

---

## ADR-014 · Analytics Engine for our telemetry only; never for customer metrics

**Decided.** Customer figures live in their record forever. Product telemetry goes to Analytics
Engine with a **monthly-rotating salt** on the hashed record id, and never contains field values.

**Why:** Analytics Engine retains for 3 months. A business record keeps figures for years. And the
rotating salt is a deliberate ceiling on our own ability to profile a customer over time.

**Enforced by:** a test that fails if `writeDataPoint` is called with anything outside the declared
blob list. The record object cannot reach it at all, per ADR-002.

**Would reverse it:** nothing puts a customer's figures there; the only part that could loosen is
the salt rotation, if the product ever needed a longer view of its own usage.

---

## ADR-015 · One alarm, one schedule table

**Decided.** The object's single alarm is always set to `MIN(due_at)` over pending schedule rows;
one `arm()` function, called in a `finally`.

**Rejected:** a global cron Worker fanning out across all customers. It reintroduces a
cross-customer code path, scales with customer count rather than with work, and cannot be
self-hosted identically.

**The bug this prevents:** an alarm handler that throws before re-arming stops the customer's
entire schedule forever.

**Would reverse it:** Durable Objects offering more than one alarm per object — which would remove
the `MIN(due_at)` indirection but not the one table, because the self-host loop needs it.

---

## ADR-016 · Apache-2.0 for the app, MIT for the renderer

**Decided.** Two licences, by path. Everything is `Apache-2.0` except `packages/render/**`, which is
`MIT`. The root `LICENSING.md` is the routing table.

**Why Apache-2.0 for the app:** the business is the hosted record and the data in it, not the
source, so the licence has no job beyond getting out of the way of an adopter. What Apache-2.0 adds
over a bare MIT is an explicit patent grant and a trademark clause. Both matter for a product with a
company behind it, and neither costs an adopter anything.

**Why MIT for the renderer:** the block dialect is meant to be embedded anywhere, including in code
that is not open at all, and MIT asks nothing at all of whoever embeds it. Apache-2.0's attribution
mechanics are small, and they are still more than zero for a five-file library whose whole pitch is
that it costs nothing to take.

**Rejected: a copyleft core, `AGPL-3.0-only`, in Grafana's shape.** The argument for it is that the
network clause is what stops somebody hosting this product, closed, in competition with the hosted
one. It does not survive contact with who actually reads a licence here. The realistic risk at this
stage is not a competitor reselling a self-hostable business database; it is nobody adopting the
thing at all, because the licence makes a company's lawyer say no. The network clause falls hardest
on ordinary self-hosting users, who are exactly the audience this product is for, while a
well-resourced competitor could comply and compete anyway. **PostHog is the reference for where the
permissive answer lands**: a permissive core, and the business in the hosted product.

**Rejected: one licence for the whole repository.** MIT everywhere gives up the patent grant on the
product; Apache-2.0 everywhere puts an attribution obligation on the one artefact that exists to be
copied without thinking about it. The split is two files and a router, and [ADR-041](16-DECISIONS.md)
is what keeps a scanner from misreading it.

**Recorded consequence:** a permissive licence does not stop a rehost of the *name*, and Apache-2.0
§6 declines to license the trademark rather than protecting one that does not exist yet. Only a
registration does. The UK TM3 filing is trigger-gated on the first paying subscriber rather than
date-gated, and the name is now the only thing in this design that a rehost cannot simply take.

**Would reverse it:** a hosted rehost of the *product* taking real revenue, which is the case the
copyleft argument was for and the only evidence that would revive it; or a patent claim from an
adopter, which would argue for Apache-2.0 on the renderer too and accept the attribution cost
knowingly.

---

## ADR-017 · The assistant's first name (superseded by ADR-070)

**Superseded** on September 25th 2026 by [ADR-070](16-DECISIONS.md): the assistant is called Slash.

This ADR chose the assistant's earlier name over *Pointer*, which a draft of it had recommended. Its
argument was about that word, and an argument about one word does not survive being find-and-replaced
onto another, so the body is not carried forward here. It reads as it stood in
`git show 62fabc69:docs/16-DECISIONS.md`. Two things it decided were never about the word, and both
moved to ADR-070 whole: the sentence the governance model rests on, and the first-use rule.

---

## ADR-018 · The web app is a client of the agent API

**Decided.** No private endpoints. Any screen needing an endpoint no agent can call is a design
error.

**Why:** it guarantees the MCP surface is complete, and it means every feature is scriptable the
day it ships. It also prevents the failure where the UI can express something the record cannot
describe.

**Cost:** some screens are slightly more work than a bespoke endpoint would be.

**Would reverse it:** a screen whose endpoint genuinely cannot be an agent call — none has been found,
and finding one is a design error to fix, not a private route to add.

---

## ADR-019 · BrainDog is not a ledger, and says so

**Decided.** No cross-row constraint. A transaction cannot be required to have postings that sum
to zero, and there will be no `constraint:` key.

**Why it came up.** An adversarial audit modelled a bookkeeping operation and found the invariant
unenforceable: `where:` refuses correlated aggregates, no rule action refuses a write, and you
cannot even declare the metric that *counts* the unbalanced transactions, because that predicate is
an aggregate over a joined register — two refusals at once.

**Why the answer is a refusal rather than a feature.** Enforcing balance means evaluating a
correlated aggregate on the write path, which is the single most expensive thing on the grammar's
refused list, and it would be evaluated on **every** write in the record to serve one register in
one vertical. The honest position is the one the audit itself recommended: *"a named refusal is
worth more than a weak feature."*

**What is offered instead, and it covers most of the ground:** `transitions:` with `requires:`
gates the *posting* of an entry, `immutable_when:` freezes it afterwards, and the closed `ratio` in
[08-METRICS](08-METRICS-AND-ANALYTICS.md) §2.2 computes what a bookkeeper actually reads. A draft
that does not balance can be saved — which is what every real accounting package does anyway.

**Cost:** double-entry bookkeeping is not a market for this product. Said plainly, in the docs,
rather than discovered by a bookkeeper in their first hour.

**Would reverse it:** a cheap way to evaluate one correlated aggregate on the write path for one
register only — and even then the product would say *ledger-adjacent*, not *ledger*.

---

## ADR-020 · Sixteen value types, after a four-vertical stress test

**Decided.** `file` and `quantity` join the closed list. `create` joins the rule actions.
`transitions:`, `group_by`/`bucket`, a closed `ratio`, `immutable_when:` and `series: true` are
added. `state` is a promoted column. Retroactive erasure is a kernel obligation.

**Why, in one line each.** Every one of these was found by modelling a fashion label, a marketing
operation, a bookkeeping operation and a clinic against the schema as written — not by reasoning
about what a platform ought to have. Four of them were **bugs**, not gaps: `series` was a chart
advertised with no way to feed it, `state` was dual-homed and unresolved, `list<ref>` had no
declared syntax for its target register, and `decision.reason NOT NULL` made a lawful erasure
request impossible to honour.

**Cost:** two more validators, two more form controls, two more renderers, two more lines in every
MCP schema. Paid deliberately. [27-VERTICALS](27-VERTICALS.md) is the evidence and the arithmetic.

**What was refused despite being asked for:** cross-row constraints (ADR-019), a third `each:`
dimension, nested combinators, and a formula language of any kind.

**Would reverse it:** a fifth vertical stress test finding a value none of the sixteen types can
carry — one deliberate migration with a validator, exactly as this ADR was.

---

## ADR-021 · The record's outbound work goes through an `outbox` table

**Decided.** A kernel table. The alarm handler writes rows; the Worker leases and sends. The only
I/O the record object performs is one queue `send()` carrying a record id — `Scheduler.wake()` —
as the last statement after every write. *(An earlier version called it "a fifteenth kernel table";
the ordinal is from a fifteen-table draft and the kernel is twenty-seven.)*

**Why.** The rule that the record makes no outbound calls is right, and it had a hole: the alarm
fires *inside* the record object, so as written nothing could ever send a digest, a push, or a
connector fetch. The hole was only visible reading two documents together.

**Bought:** at-least-once delivery survives — Cloudflare documents that *"in rare cases, alarms may
fire more than once"* — because a lease with an expiry is idempotent where a delete-on-send is not.
And self-hosting needs no second code path: the same table, drained by a loop instead of a queue.

**Cost:** one table, and a rule about statement ordering that a reviewer has to know. Stated in
[01-ARCHITECTURE](01-ARCHITECTURE.md) §2 with the reason, because a rule whose reason is not
written down gets optimised away.

**Would reverse it:** the platform delivering alarms exactly once with a guarantee — and the lease
would stay anyway, because the self-host loop needs it.

---

## ADR-022 · The self-improvement loop recommends; it never acts

**Decided.** BrainDog builds a MAPE-K loop over its own declarations. **Nothing is auto-applied in
v1.** The loop's only output is a row in `suggestion`. Every accepted change writes a falsifiable
`prediction` with a baseline frozen at acceptance, scored once on a named date.

**Why not auto-apply the safe class.** A partial expression index is provably semantics-preserving
and is the obvious candidate. Refused for [ADR-010](16-DECISIONS.md)'s own reason — *absence of a
path is a control that cannot be wrong.* Once "the loop writes a declaration without a human" is a
code path, the only thing stopping it writing a page is a conditional. **Microsoft agrees in
practice:** Azure SQL ships `CREATE_INDEX` and `DROP_INDEX` **off** by default, with only the
trivially reversible plan correction on, and reports that **~11% of its automated actions are
reverted** by validation.

**And the exception, recorded here because §4.5 grants it and an earlier version of this ADR did
not mention it.** After **20 scored predictions at ≥80% met**, auto-apply may be enabled **for the
index class only**, per-record, defaulting off. That does create the code path this ADR's own
argument warns about — *absence of a path is a control that cannot be wrong* — so the mitigation is
named rather than assumed: the path is **typed to one proposal class at the function signature**,
not gated by a runtime conditional, so extending it to a second class is a code change with a diff
rather than a flag flip. An auto-applied change still writes an event, still carries a prediction,
and still appears in the digest.

**Bought:** IBM autonomic maturity **Level 3, Predictive** — *"system monitors, correlates, and
recommends actions; IT staff approves and initiates actions."* A narrow claim that is true, against
a broad one that is not.

**Cost:** ≈22 days at the corpus's own correction factor, and it is Phase C, gated on gate 4.

**Refused outright:** the loop proposing a new named metric (it automates the one failure no sandbox
prevents), a theme change (no signal has "a different colour" as its remedy), and any change to the
loop's own thresholds, analyser or budget.

**Would reverse it:** twenty scored predictions at ≥ 80 % met enabling the index-class auto-apply,
per record, off by default — the one exception this ADR already names, and the only one.

---

## ADR-023 · Themes are generated by contrast, and validated before they install

**Decided.** The generator solves for **target contrast ratios**, not lightnesses. Sixteen install
checks, in both schemes, over every surface. Intent separability is measured as **ΔE2000 after
Brettel-1997 dichromat simulation**, not as a contrast ratio.

**Why contrast-driven.** BrainDog already has a refusal gate. Generating by lightness and validating
by contrast builds a loop that can fail, whose failure mode is *"the user picked a colour and the app
said no,"* repeatedly, with no path forward. **Generate by contrast and the checks the generator
drives become tautologies** — only separability and monotonicity can fail.

**The correction this records.** [13-UI](13-UI.md) §2.3's measured collapse — two intents at 1.07:1
under deuteranopia — is correct and is the motivating evidence. **The metric was wrong:** under
simulated dichromacy colour collapses onto a two-dimensional surface, and contrast ratio measures
only one axis, so it produces both false failures and false passes.

**Cost:** a per-hue chroma solve instead of a lookup, and a validator that refuses more often.

**Refused:** runtime colour derivation in CSS (browsers clip, and the clip is invisible to
`getComputedStyle` — measured), `light-dark()`, per-page themes, and auto-correcting a contrast
failure — because **an auto-corrected theme is not portable**, and portability is the entire point of
the one artefact designed to be shared.

**Would reverse it:** a perceptual metric shown to predict legibility better than ΔE2000 after
Brettel simulation; contrast-driven generation stays regardless.

---

## ADR-024 · Pages emerge; navigation does not

**Decided.** Structure appears as the record fills — but in a holding pen. **The system never writes
nav order after first install.** A proposal becomes a nav entry only when a human promotes it, and
promotion appends to the end of a section rather than inserting.

**Evidence, and it is unusually direct.** Findlater & McGrenere (CHI 2004, 27 subjects) measured
static menus **faster** than adaptive ones, with user-arranged menus equal to static. Microsoft
shipped adaptive menus in Office 2000 and **withdrew them on 2006-01-20**, citing unpredictability,
loss of spatial memory, and — the counter-intuitive one — that hiding items to reduce clutter made
**feature discovery worse**. WCAG 2.2 **SC 3.2.3 Consistent Navigation (AA)** is normative against
reordering.

**The shape taken:** Metabase's X-ray split — generate freely into a quarantine, become real on one
click. BrainDog already has the quarantine.

**Bought:** the ask — *"page headers are created as you go"* — in full, with no nav entry ever
appearing unasked.

**Cost:** an `origin: derived | person | pack` field, and one more thing on every page: its origin,
visible in one word. *(An earlier version spelled the middle value `authored`, which 04 and 06 use
for a different thing — the tier of every declared page, a pack's included.)*

**Refused:** auto-placing, auto-hiding a stale entry (Office's own finding), and a proposal that
returns after being dismissed.

**Would reverse it:** a controlled study showing adaptive navigation beating user-arranged
navigation for this task class — twenty years of evidence say otherwise.

---

## ADR-025 · Pull connectors, and the row they cost

**Decided.** `ingest` gains a `fetch:` block when `channel: pull` — the kernel's word for the
scheduled channel, as in `inbox_raw.channel`, schedule kind `pull` and outbox kind `pull.fetch`; an
earlier version said `cron`, a value the kernel's vocabulary does not have. **Not a ninth pack kind.** Five
placeholders, five formats, no operators and no functions. Three primitives: `expect:`, a closed
kernel list of eight `auth.kind`s, and `probe:` — **exactly one preflight, never chained.**

**Why it is not free.** [04-PACKS](04-PACKS.md) §7's *"a pack cannot make an outbound call of any
kind"* becomes false, and that argument is an **enumeration**, so removing an entry weakens it.
Bought back: a literal origin with no placeholders, every host printed in the install diff, scopes
proven at bind time, and the response treated as untrusted content.

**The ceiling, measured twice.** Against nine hand-picked APIs: ~64% expressible. Against Airbyte's
**609 real connectors**: ~53% catalogue-wide, ~71% within its declarative tier. **Two-thirds is the
honest ceiling**, and the fallback for the rest is `mode: agent` — the record asks, the user's own
agent fetches, the human approves — which creates **no new capability at all.**

**The lever that made it possible:** 96% of Airbyte's macro usage is date handling, because its
cursor is a string the author formats. A **typed** incremental window removes the reason for an
expression language.

**Refused:** an interpolated `base:` (20% of real connectors do it, and it is SSRF), fan-out over a
*fetched* list (47% of real connectors, and it makes the host list unnameable), a `poll:` state
machine, and any nesting inside `expect:`.

**Not built:** a bank connector. The format handles it in five minutes; **the credential does not
exist** — UK open banking has had no self-serve path since GoCardless closed signups, and unattended
access is capped at four calls a day *by law*.

**Would reverse it:** the measured ceiling falling below half on the connectors this buyer actually
wants ([Q14](17-OPEN-QUESTIONS.md)) — at which point `mode: agent` is the product and the `fetch:`
block is removed, restoring 04 §7's enumeration.

---

## ADR-026 · `session` is the kernel's one register

**Decided.** The kernel declares exactly one register, `session` — spoken id `S<n>`, a handoff
(`title`, `next`, `tried`, `notes`), and liveness that is **half derived**: stale at 45 minutes is
computed at read and never stored; `abandoned` at 12 hours is **written**, by a `schedule` row of
kind `purge` run hourly by `system` — never by a read, because `list` never writes. `last_seen` is a
plain instant the kernel writes at step 6 on every write whose actor is the session, not a
derivation. **Every agent write resolves to a session or opens one**, and `event.actor` is the
session. *(An earlier version said all of liveness was derived at read; 02 and 32 wrote `abandoned`,
and one of them wrote it during `list`.)*

**Why a register and not a table.** The predecessor's most-used coordination feature — *"two sessions
in one working tree overwrite each other, coordinate or stop"* — needs `list`, `get` and `update`, a
spoken id, transitions and an audit trail. A table would have cost a ninth MCP tool for each of those;
a register gets them all from the eight. And it cannot be a pack, because it is the register whose
rows *are* the agents.

**Cost:** the CI rule *"the kernel contains no register declaration"* gains one named exception, in
the same spirit as the promoted `state` column — an acknowledged special case with its reason beside
it, rather than a uniform rule quietly broken.

**Refused:** marking a session `done` from a hook. *"A session ending says the terminal closed, not
that the work finished."*

**Would reverse it:** a second register the kernel must own — which would mean the pack boundary is
in the wrong place, and the fix is the boundary, not a second exception.

---

## ADR-027 · Row-level derivation, closed

**Decided.** A field may carry `derive:` — `sum` · `diff` · `product` · `ratio` · `band` · `via` ·
`normalise` — computed at read, **never stored**, inlined by the `where:` compiler, row-scoped with
at most one `via:` hop.

**Why.** Tracing the predecessor found the gaps were one shape: it *derives* what the record does not
store — a tier from four judgements, a currency from an account, a session's staleness — and this model
had no primitive for it. The predecessor's own version parses a priority score out of a sentence, which
is the right instinct with a fragile mechanism.

**Why it does not become a formula language.** The combinators are a closed list of seven — three
shared with the metric grammar (`diff` · `product` · `ratio`) and four that are row-scoped only
(`sum` over named fields, `band` onto the field's own `values:`, `via` for one hop, `normalise`) —
there is no nesting, a derivation cannot read another row except through one hop, and a derivation
over another *register* is a metric. Operands are this row's field ids or one `lookup`, never
aggregations. A derived field cannot be written, `index: true`, or `required`. **One exception, and
it is the only stored derivation:** `unique: true` on a derived field materialises the derived value
into `fields` at step 6 of the write path, so the partial unique index has an expression to cover
(the learnings fingerprint in [32-PARITY](32-PARITY.md) §5). **Two things that look like
combinators and are not:** `session.last_seen` is written by the kernel at step 6 on every write from
that session, and the identity accent `hue` is generated by the kernel at create ([ADR-028](16-DECISIONS.md)) —
an earlier draft wrote them as `touched_by` and `hue_from`, which a closed list cannot contain.

**Bought:** *derived, never stored* as a mechanism rather than a discipline — and `required_when:`,
`unique:` and `immutable:` alongside it, each closing a rule the predecessor enforces only in prose.

**Would reverse it:** a derivation that needs nesting or a second hop — that is a metric, and the
answer is a named refusal, not a formula language.

---

## ADR-028 · Identity is a third axis: one mark, one accent, never the only signal

**Decided.** A register may declare `identity: { mark, accent }`. The accent field (`hue`, an
immutable `int`) is **chosen by the theme and stored by the kernel at create**, once, and frozen — a
kernel-written field, not a `derive:` combinator ([ADR-027](16-DECISIONS.md)). The chooser is
`@braindog/theme`'s farthest-point rule, `nextAccentHue(existing)`: the point on the hue circle
farthest from every existing accent and from the three intent hues, deterministic given its inputs.
The kernel never computes a hue — it calls the `accent(existingHues)` it was opened with and writes
the answer to `identity.accent` ([39-SPEC-THEME](39-SPEC-THEME.md) §13 D11;
[41-SPEC-KERNEL](41-SPEC-KERNEL.md)). Every accent is validated ≥ 3:1 against every surface;
separability is the farthest available hue, measured — four marks stay ΔE ≥ 4 apart, and past that
the name carries identity — never a regenerate-until-distinct loop. An accent may colour **only** the
row's mark, chip, avatar, calendar dot and chart series — never text, never an intent, never a
surface. It is the one non-token colour that may reach the DOM, as `oklch(L C h)` with the theme's
two mark constants. A retired row is achromatic. The name always sits beside the colour. *(Iteration
2 withdrew a golden-angle rule — `round(seq × 137.508) mod 360` in the kernel — that would have given
the kernel a colour opinion.)*

**Why.** *"Colour means which project, everywhere"* is the predecessor's best UX rule, and this corpus
closed intent colours at four and refused per-page themes without ever saying where a *thing's* colour
comes from. Without this ADR the four-intent rule would forbid a product having a colour.

**Refused:** hand-picking an accent. The predecessor's picker shows a hue grid and says *"too close to
X"* from a ΔE and a deuteranope simulation; the generator here does the same and does not ask.

**Would reverse it:** a customer whose rows need a brand colour per client — the answer would be a
validated palette per register, still generated, never typed.

---

## ADR-029 · Kept, not shown

**Decided.** Every arriving payload is kept raw, and nothing is *shown* until it earns it. The inbox
is a fold at the foot of a page with counts per status, never a queue; the pattern loop fires only on
three same-shape payloads.

**Why.** Two correct rules conflicted. This corpus says *"nothing is ever dropped"* — a pipeline that
discards what it does not understand cannot be trusted with a bank statement. The predecessor drops
unmatched bank texts **silently and deliberately**, because *"a review queue that is mostly noise stops
being read within a week"* — and it is right about that too. Keeping everything and showing almost
nothing satisfies both.

**Cost:** raw storage for noise, bounded by the 400-day retention already in place. Cheap.

**Would reverse it:** raw storage cost exceeding the 400-day window's value — the window would
shorten before anything was dropped unread.

---

## ADR-030 · What intelligence ships first

**Decided.** The §1b shape of [15-ROADMAP](15-ROADMAP.md) ships **no intelligence at all**. Phase A
ships **tier A-minimal**: triage, extraction, digest prose and embeddings on small models
(`llama-3.2-1b` for triage and digest prose), with no conversational surface; the ingest-pattern
proposal is the one model-backed in-app job, and the record's own agent can do it over MCP. Slash's
conversational mode arrives with **tier B** (bring your own key), on `glm-5.3-flash`; **tier C**
(your machine) comes last. A chat surface is added only when a Cloud customer with MCP configured
asks for one — and that ask is instrumented.

**Rejected:** shipping Slash as a conversational assistant in the first version (B7 as first
written). Five documents disagreed on what ships, and the roadmap funded eight days that
[23-ASSISTANT-UI](23-ASSISTANT-UI.md) says serve no line in the value proposition; the buyer already
owns a better assistant in a terminal, and GitHub retired its own Spark for exactly that reason
([Q2](17-OPEN-QUESTIONS.md)).

**Would reverse it:** the instrumented ask firing — a measured majority of Cloud customers with MCP
configured requesting a chat panel inside their first month.

---

## ADR-031 · Gate 2 authorises spending; gates 1a–1d can only veto

**Decided.** Phase B is spent only when **gate 2** passes — ten subscribers still paying at day 30.
Gates 1a–1d (dependents, outside issues, non-publish-day downloads, four quiet weeks) are **stop
signals**: if all four miss, Phase B is not built even if gate 2 passes. The Kennel follows the same
rule.

**Rejected:** gate 1a–1d as the go signal — 15 §3 and §8 as first written, and 14 §2's *"never
before gate 1"*. Distribution of a free library says nothing about whether anyone pays for the
record; the one gate that measures the thing being sold is gate 2.

**Would reverse it:** a paying cohort that never installs a pack and never touches the renderer —
which would show the platform is unrelated to what is sold, and the platform question should then be
dropped rather than re-gated.

---

## ADR-032 · Money is an integer in minor units with its own currency

**Decided.** `{ amount, currency }` — `amount` an integer in minor units, never a float, never a
bare number, never a `minor` key. Two currencies are never added. A metric over mixed currencies is
refused at install unless it names an FX source; with one, rows without a rate are listed and the
total wears "≥". Rendering is code, space, amount at the currency's exponent — `EGP 1,299.00`,
`JPY 1,299` — and a typed interpolation takes minor units: `{{money:129900 EGP}}`.

**Rejected:** a decimal amount with a display currency. Floats drift on every sum, and a bare
number loses the one fact — which currency — that makes a total mean anything.

**Would reverse it:** a currency whose exponent is not fixed, or a regulator requiring more
precision than the minor unit; neither exists in ISO 4217 today.

---

## ADR-033 · Nothing is deleted; erasure tombstones the payload and keeps the fact

**Decided.** `retired` and `archived` are states; `delete: refuse_while_referenced` protects
referenced rows; `event` is append-only with no FK to `entry`; a data-subject erasure (Art. 17)
replaces payloads across every store that can name a person ([02-DATA-MODEL](02-DATA-MODEL.md) §10)
with the literal `--erased--` — a value withheld at write is `--redacted--`, and `NULL` means only
"there was no prior value" — and keeps the row that something happened. The cascade is nineteen
stores in one transaction, the `person` mirror among them; R2 bytes are the twentieth, through the
outbox as `erase.r2`. The `erase` event carries the subject as a SHA-256 prefix, never the value
([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §13 #15; [53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §13 #11).
The purge of soft-deleted rows after 30 days is the one hard delete, and the `event` rows survive it.

**Rejected:** hard delete on request. It destroys the audit's ability to say *that* something was
there — the property the README sells — and a history with holes is a history that can be edited.

**Would reverse it:** a jurisdiction ruling that a tombstoned event row is itself personal data
that must go.

---

## ADR-034 · The export is a canonical logical dump streamed from the record; `.brain` is materialised outside it

**Decided.** The record streams **`.brainl`** — header lines, then one JSON row per line, tables in
`dog_section` order — in pages of ≤ 1,000 rows via `export(cursor)`. `braindog export` and the
self-host materialise the `.brain` SQLite file with a real SQLite and sign it; Cloud's nightly R2 backup
is `.brainl.age`; `braindog verify` and `import` accept both containers. `VACUUM INTO` and `ATTACH`
are unavailable in workerd. The round-trip gate is the logical dump, never byte equality; `import`
goes only into an empty record and through validation ([33-CONTRACTS](33-CONTRACTS.md) §9).

**Rejected:** assembling the SQLite file inside the Worker. workerd has no SQLite engine outside a
Durable Object, no filesystem and a 128 MB ceiling — there is nothing to write the file with.

**Would reverse it:** a SQLite-in-Worker primitive that can write a file without a filesystem — at
which point the `.brain` could be produced at the edge and `.brainl` would become an internal format.

---

## ADR-035 · The permission model is ceiling × scope × projection

**Decided.** A person's grants are register × level, materialised in `member` — five levels,
`read append write decide owner`; scope is rules over typed fields; every page and share link is a
projection that can only narrow. Capability-based, per register. The Keychain is its own capability,
owner-only by default; a share link is a projection with an empty ceiling. Enforced inside the
record — at step 1 of the write path and in the compiler for reads — never in the router. This
settles [Q4](17-OPEN-QUESTIONS.md); the model is [20-COLLABORATION](20-COLLABORATION.md) §1.

**Rejected:** role-based access — admin, editor, viewer. It does not extend past five people
without a re-model, and it puts the deny in a table a future page can widen.

**Would reverse it:** a customer needing row-level grants that rules over typed fields cannot
express — which would mean the record has become a shared database, not a business record.

---

## ADR-036 · The read mark is `member.seen_at`, written with `MAX()` only

**Decided.** One mark per person, monotonic, a column on `member` — never an `entry` row — so a read
is never a write and a late device cannot move it back. `markRead({ upTo })` in the DATA group is its
only writer, for person principals; `whatsNew(cursor)` defaults to it; `boot()` returns index, live
sessions, open suggestions and `whatsNew` in one round trip.

**Rejected:** a read mark inside the document or an entry row. The predecessor's whole-document
write made every read a potential destructive write; a column updated with `MAX()` cannot regress.

**Would reverse it:** per-register read marks becoming a product need, which turns the column into
a small table under the same rule.

---

## ADR-037 · Nine ports; `packages/*` name a capability, `apps/*` name a runtime

**Decided.** `Sql · Scheduler · Clock · Blobs · Inference · Dispatch · Http · KeyStore · Snapshots`,
plus `Ingress` as an entrypoint contract. The record's ports are exactly `{ Sql, Scheduler, Clock }`;
Slash's are `{ Sql, Clock, Inference }`. `Sql` is synchronous — `exec`, `execScript`,
`transactionSync` with `NotPromise<T>`, `readonly caps` — and `Param` excludes `boolean` and
`undefined`. Conformance cases are a plain array run under every host against a committed Durable
Object reference trace, and CI asserts equal case counts. Full signatures:
[33-CONTRACTS](33-CONTRACTS.md) §1.

**Rejected:** *"six adapters"*, the count an earlier draft printed twice. Search is not a seam (FTS5
is a feature of `Sql`), compute is not an interface, and `Clock`, `Http` and `KeyStore` were missing.

**Would reverse it:** a self-host requirement none of the nine can express — a tenth port is a
design change recorded here, not a helper.

---

## ADR-038 · `node:sqlite` is the self-host default driver; there is no degraded mode

**Decided.** `node:sqlite` on Node ≥ 24.13 is the default — zero native dependencies, FTS5 and
JSON1 present (measured 2026-09-02 on official 24.13.0: SQLite 3.50.4, `ENABLE_FTS5`). It is still
Stability 1.1, so the Node minor is pinned and **the boot probe measures FTS5 on every start**.
`better-sqlite3` is the alternative driver for an older Node. `bun:sqlite` is **unsupported** — it
links Apple's system libsqlite3 on macOS, nests via SAVEPOINT, and has different parameter ceilings;
Node bundles its own SQLite on every platform. A build without FTS5 is **refused at boot** with the
message in [30-BLUEPRINT](30-BLUEPRINT.md) §13 — there is no `LIKE` fallback. `DO_LIMITS` is
enforced in the adapter above the driver, because `DatabaseSync` has no `limits` option; both
drivers throw the closed error vocabulary the Durable Object adapter maps to. That is what *"Node
refuses first"* means.

**Amended in iteration 2:** there is no `better-sqlite3` alternative. The Node minor is pinned, so
the older Node it served does not arise; `node:sqlite` is the only driver, and its `:memory:` mode is
the memory adapter — two `Sql` implementations, no fakes ([37-SPEC-PORTS](37-SPEC-PORTS.md) §13 D9).

**Rejected:** `better-sqlite3` as the default with `node:sqlite` degraded — an earlier draft, resting
on the claim that official Node builds lack FTS5, which was measured false. A native dependency is a
build step for every self-hoster, and a degraded mode is a third compilation with different
semantics.

**Would reverse it:** `node:sqlite` dropping FTS5 from official builds, or Bun shipping its own
SQLite with matching limits and no SAVEPOINT nesting.

---

## ADR-039 · The toolchain pins

**Decided.** TypeScript 6.0.3 (not 7 — `typescript-eslint@8.69.0` caps at `<6.1.0`); pnpm 11.25.0
with `minimumReleaseAge: 1440` and `linkWorkspacePackages: false`, never hoisted; Vitest 4.1.11 +
`@cloudflare/vitest-plugin` 1.1.2 (peer `vitest ^4.1.0`, the hardest external pin); fast-check
4.9.0; ESLint flat + `eslint-plugin-import-x`; **Playwright 1.62.1**; **axe-core 4.13.0**;
**wrangler 4.128.0**; **Svelte 5.57.0 / SvelteKit 2.70.3**; **Node 24.13.0**, pinned to the minor.
Every pin carries a dated comment and is revisited quarterly ([31-STACK](31-STACK.md) §3).

**Rejected:** floating ranges. A pin with no recorded reason is re-litigated at the first upgrade
PR, and the Vitest ↔ Cloudflare-plugin peer range is the one that breaks silently.

**Would reverse it:** any single pin, on its own dated review — this ADR is amended, not replaced.

---

## ADR-040 · Valibot 1.4.2; validators compiled at module top level

**Decided.** Valibot over Zod, Ajv and ArkType for the closed pack schemas — 2.1 kB gzip, refusals
that name the field, throws on an unrepresentable JSON Schema. `new Function` / `Ajv.compile()`
never run inside `fetch()` or a Durable Object constructor (`EvalError` in workerd, measured).
`ajv/dist/standalone` at build time is the fallback if JSON Schema ever becomes primary. The MCP
tool-definition generator binds to `@valibot/to-json-schema`, and it runs at build:
`scripts/gen-schemas.ts` writes the committed tool schemas and a drift test keeps them equal to
their Valibot source ([44-SPEC-MCP](44-SPEC-MCP.md) §13 D1). Superseded for MCP: the sixteen tools carry
hand-written JSON Schemas in `packages/mcp/src/index.ts`, so no generator runs (44 §2).

**Rejected:** ArkType — a 90.7 ms cold start for one schema module and an error path 12× its
success path, the wrong asymmetry for a validator whose whole job is producing refusals.

**Would reverse it:** Valibot exposing Standard Schema's `~standard.jsonSchema`, which removes the
one vendor binding — or a measured regression in its refusal quality.

---

## ADR-041 · The licence layout follows Grafana

**Decided.** Root `LICENSE` is the Apache-2.0 text only; root `package.json` is `Apache-2.0,
private: true`; `LICENSING.md` routes paths to SPDX names; `packages/render/LICENSE` is MIT, the
filename exactly `LICENSE`, with SPDX headers on `packages/render/src/**` only; no `NOTICE` file, so
no adopter inherits an attribution obligation; never `SEE LICENSE IN`; the closure is enforced on
`npm pack --dry-run --json` output from commit one; one repository until a second committer or a
bypassed gate ([31-STACK](31-STACK.md) §4).

**This is a signalling layout, and the thing it signals is `packages/render`.** Every scanner in the
supply chain reads the root file and believes it, so the exception has to be stated in three places
that agree: its own `LICENSE`, its own `license` field, and a header on each source file, which is
the only one of the three that travels with a single file copied out.

**`render` keeps in-degree 0, and that is an engineering rule the licence agrees with.**
`tools/gates/graph.mjs` asserts it. The reason it exists is that a renderer with zero dependencies
is what makes it embeddable and what makes gate 1a a registry query for `depends:braindog-render`.
That a tarball published as MIT should also contain only what its own `LICENSE` covers is the second
job the same check does, and neither job needs the other to be worth thirty lines.

**Rejected:** cal.com's shape, MIT at the root over a differently licensed app. GitHub's API then
reports the whole repository as MIT, which is not retroactively fixable for anyone who relied on it,
and here it would silently drop the patent grant that is half the reason for
[ADR-016](16-DECISIONS.md).

**Would reverse it:** a second committer, or one bypass of the closure gate. Either moves the
renderer to its own repository, where the routing problem does not exist.

---

## ADR-042 · Two published packages, trusted publishing, three record version numbers, no app semver

**Decided.** `braindog-render` (MIT) and `braindog-cli` (Apache-2.0), unscoped; `braindog`,
`braindog-mcp` and `@braindog` reserved and never published under this design. Publishing is OIDC
trusted publishing per package, `0.0.1` by hand first. The version surface is the tuple
`app <date>+<sha> · format <user_version> · kernel <migration> · primitives <PRIMITIVES_VERSION>` —
`format 1 · kernel 1 · primitives 1` at v1, where `user_version` is the `.brain` format revision
(bumped only when an older reader would misread), the kernel number is `MAX(migration.version)`,
and `record.format_ver INTEGER` mirrors `user_version`. A pack's `requires:` is
`{ format: <int>, primitives: <int>, packs: { id: semver-range } }` — never an app version, never
`kernel:`. Changesets refused until package #3 or contributor #2.

**Rejected:** `braindog: ">=0.4"` — a semver range in the manifest. The app has no semver, it is a
hosted service, so the installer would have nothing to compare against.

**Would reverse it:** a third published package or a second contributor, which brings Changesets
in; or a self-host release cadence that needs a user-facing app version.

---

## ADR-043 · `.gitattributes` in commit one: LF everywhere, binaries marked

**Decided.** `* text=auto eol=lf`; `*.brain *.brain.age *.sqlite *.woff2 binary`; `*.sh eol=lf`;
`*.ps1 eol=crlf`. It is the first commit, because it is not retroactive.

**Rejected:** relying on each developer's `core.autocrlf`. It is `true` at the system level on the
development machine, and `declaration.checksum` and the `.brain` manifest hash checked-in files — the
round-trip test would pass on one OS and fail on the other with a diff that shows nothing.

**Would reverse it:** nothing foreseeable; the migration checksum already normalises CRLF for SQL,
and doing the same for every hashed file would make this hygiene rather than load-bearing.

---

## ADR-044 · Live updates and tier-C dispatch ride a hibernatable WebSocket to the Durable Object

> **Superseded in part (21 October 2026) by [ADR-075](16-DECISIONS.md).** The live-update WebSocket is not built, and
> an agent hears the record through the pulse. The runner's transport below stands: the claim is the long-poll.

**Decided.** Live updates are a **hibernatable WebSocket on the `Record` object** carrying
`{ version, registers }`, with 15-second polling of `GET /api/version` as the fallback; the tier-C
runner's socket terminates on `Slash`. Non-hibernating sockets and SSE are refused on cost — a held
object is 0.125 GB × 2,592,000 s = **324,000 GB-s ≈ $4.05 per customer-month, 81 % of the included
allowance**; Queues are refused on scope (an account-wide token, no per-queue scope); Cloudflare
Tunnel on footprint. Outgoing change notifications are free.

**The runner's transport, settled in iteration 2:** the claim is always the record's
`claimJob { wait }` — a long-poll — and v1 ships the long-poll alone; the socket, where a host exposes
it, is a doorbell that wakes the claim and never carries the job. The self-host serves no `/ws` in its
first phase and the client polls ([46-SPEC-SLASH](46-SPEC-SLASH.md) §4.7; [48-SPEC-CLI](48-SPEC-CLI.md)
§13 D8; [51-SPEC-WORKER](51-SPEC-WORKER.md) §13 D13).

**Rejected:** SSE. An open SSE response is an active request, so the object cannot hibernate and
pays the whole held-object cost.

**Would reverse it:** Cloudflare pricing a hibernating socket, or hibernation ceasing to cover the
runner's idle hours.

---

## ADR-045 · Svelte 5 + SvelteKit 2, and one renderer package with two subpath exports

**Decided.** Svelte 5.57.0 / SvelteKit 2.70.3, built once with `adapter-static` into one `build/`
that both hosts serve unchanged — a static shell, no server renders a request
([ADR-066](16-DECISIONS.md)); `render()` from `svelte/server` serves the `a11y-tree` parity gate and
nothing else. `braindog-render` exports the zero-dependency
`parse · toHTML · render · KINDS · PRIMITIVES · PRIMITIVES_VERSION` at its root — no `expand`; kinds
expansion is `declare`'s ([36-SPEC-RENDER](36-SPEC-RENDER.md) §13 D3) — and the Svelte interpreter
at `braindog-render/svelte` with `svelte` as an optional peer; `toHTML` never calls `svelte/server`;
one fixture corpus asserts both paths agree on the accessibility tree and the declared column tracks.
*(An earlier version named `entry-ssr.ts` as the app's one SSR entry; there is none.)*

**Rejected:** SolidStart — a Babel pass, release churn, and no scoped-CSS story; and making `toHTML`
call `render()`, which deletes the drift risk by making the package unusable to anyone not on
Svelte, killing the one distribution instrument.

**Would reverse it:** the drift test failing repeatedly on real fixtures, which would mean two
renderers cost more than one framework dependency.

---

## ADR-046 · Runtime dependencies are enumerated

**Decided.** The record object has **zero** runtime dependencies; the Worker ideally zero (WebCrypto
for signing). The permitted runtime packages are four: `@pushforge/builder@2.0.5` (Web Push, in the
Worker and the self-host alike); `age-encryption@0.3.1` with its five `@noble`/`@scure` transitive
packages (`.brainl.age`); `valibot` 1.4.2 (`declare`'s schemas — chosen by [ADR-040](16-DECISIONS.md)
and, until iteration 2, missing from this list); and `yaml` 2.9.0, reachable only through
`@braindog/declare/yaml` and only on the CLI and self-host paths ([ADR-063](16-DECISIONS.md)).
Anything else is a new ADR.

**Rejected:** dependencies as conveniences added per PR. Every runtime package is a supply-chain
surface in a Worker holding a KEK, and 18 §5 promised a record of them that did not exist.

**Would reverse it:** a dependency with no zero-dependency alternative — which is exactly what this
ADR is amended to record.

---

## ADR-047 · The Kennel is an index over files

**Decided.** Two JSON files in one public repository, submitted by pull request, reviewed by one
person plus a CI schema check that installs the pack into a throwaway record; install from URL, git
ref, paste or file; the index is a convenience, never a gate; the diff names every host a declared
`source:` will call. Refused: paid packs in v1, ratings and reviews, remote assets in packs, a
submission portal, a hosted forum, in-app social, a Discord before launch. Built last, and never
before gate 2 ([ADR-031](16-DECISIONS.md)).

**Rejected:** a marketplace with accounts, ratings and a moderation queue. A five-star system over
twelve packs is theatre, and a platform with a moderation queue is a company before there are users.

**Would reverse it:** a pack author asking to be paid — which brings Stripe Connect, tax and
refunds, and is a company decision, not a format one.

**Amended September 28th 2026, as built, on a default that holds
until the owner rules.** The Kennel is built now, before gate 2, because the product asks for a
registry and for publishing your own packs. It is the same format (an `index.json` over immutable
files, each held to its checksum and, when signed, to its author's key) with a publish door in
place of pull requests: `POST /api/kennel/v1/submit` on the app's own host, taking a file signed by
its author's Ed25519 key or sent by a person signed in to BrainDog. A submission from a publisher the
operator has not trusted waits for the operator's review before it is listed, and the operator
reviews with the provisioning key the Cloud already has (`PROVISION_KEY`), with the waiting file,
every script's source in it, open to read in full first. There is no Kennel signing key, so no single lost key forges every pack; a listed
version says when it was reviewed. Storage is the existing R2 bucket under `kennel/`, with no table,
migration, binding, refusal code or event kind. The refusals stand: no paid packs, no ratings or
reviews (install counts rounded down instead), no remote assets. A submission portal is the one
refusal this reverses, as a door and not a portal: there is no account, profile or form beyond the
file itself. The rules are `packages/declare/src/kennel.ts`, the Cloud's door
`apps/worker/src/kennel.ts`, the self-host's reader `apps/selfhost/src/kennel.ts`, and
[14-KENNEL](14-KENNEL-AND-COMMUNITY.md) §1 says it whole. **The pull-request model stays open to
the owner:** the index format is the same either way, so only the door would change.

---

## ADR-048 · A pack install is never auto-approved, and packs never auto-update

**Decided.** No "always allow" for a pack author however trusted — Zed's argument about skills:
inert by themselves, side effects not. No automatic pack updating. An update that would move an
existing page's `nav` is shown and ignored. Seeds are marked `example` and clearable in one undoable
action. Install is two phases with one plan: `planPack(pack) → Diff`, then
`installPack(pack, planHash)`, refused with `PLAN_STALE` if the record moved in between. The plan
hash carries the record's version and a hash over the pack's checksum and the base it was planned
against, so a pack edited between plan and install is caught as well as a record that moved
([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §13 D3).

**Rejected:** trusted-author auto-update. It makes the Kennel a distribution channel for a rule that
silently changes what a rule does to money.

**Would reverse it:** nothing; a customer needing unattended updates gets a scheduled `planPack`
that opens a suggestion, never an auto-apply.

---

## ADR-049 · Rule precedence is fixed, and a person's write beats a rule's

**Decided.** Rules resolve by `priority` ascending (default 100) → longest literal (the byte length
of the longest `is`/`contains`/`starts`/`ends` literal in `when:`; none = 0) → `id`; one pass; ≤ 1
`set` per field. `hits` is drawn per rule; a dry run reports `won`, `lost`, `takenBy`;
`rule apply --dry` is the undo. A field whose last `event.actor` is a person is **never overwritten**
by a rule, an ingest or a connector — step 2b of the write path.

**Rejected:** "declared order". It makes specificity a matter of where an author put a line, and a
pack merge changes it silently.

**Would reverse it:** a measured case where a person's stale value should lose to a connector's
fresh one — a per-field `pinned: false` option, not a change to the default.

---

## ADR-050 · Screenshot mode is a kernel display mode with a provenance allow-list

**Decided.** Under `html[data-shot]` every record-held figure and string is plated and blurred; only
literals typed into source are legible; layout is byte-identical off → on (element boxes and page
height asserted) and pixel readback proves redacted digits are indistinguishable. It is a display
mode for a shoulder, not a privacy boundary, and says so.

**Rejected:** pattern-based redaction. It once let *"GREEN MARKET"* through as a placeholder;
provenance cannot.

**Would reverse it:** a requirement that the redacted words leave the DOM — which is a different
feature, a redacted projection, and is named as such.

---

## ADR-051 · Slash has no panel; it is a mode of the palette and rows in existing queues

**Decided.** No chat panel, widget or page. The command surface is **the palette** (`⌘K`); Slash is
its fallback row when a model is configured — one proposal with its verbs, never a transcript — plus
rows in Decide and Inbox. Every deterministic feature is byte-identical with Slash absent, and CI
proves it with `SLASH_ENDPOINT` unset. Slash may not type a number — figures are `{{path}}`
interpolations. Open proposals are capped at 3 per register; a fourth displaces the lowest-ranked,
which closes with a recorded reason. This settles [Q5](17-OPEN-QUESTIONS.md).

**Rejected:** a chat panel. It eats the design, it accumulates, and it has a substitute the buyer
already owns in a terminal.

**Would reverse it:** [ADR-030](16-DECISIONS.md)'s instrumented ask firing.

---

## ADR-052 · Connector credentials live under a second, KEK-wrapped DEK

**Decided.** A scheduled connector must decrypt with nobody present, so connector grants are wrapped
by the operator's KEK — `vault_key.purpose = 'connector'`, always `kek` — even when the Keychain
passphrase is on. The [12-SECURITY](12-SECURITY.md) §7 honesty table carries the row and the bind
screen says it in words. *"We cannot read it"* is true only after the 30-day PITR and backup window.
This settles [Q13](17-OPEN-QUESTIONS.md).

**Rejected:** pausing connectors whenever the passphrase is on. Honest, but a security feature
silently disabling an unrelated one, discovered from a gap in a chart.

**Would reverse it:** a passphrase-derived key usable unattended — a hardware token per record,
which no self-hoster has.

---

## ADR-053 · Attachments: a `file` type, a per-record content-addressed store, same-origin delivery, no viewer

**Decided.** `file = { sha256, mime, bytes, name }` is a kernel value type; bytes live in R2 or on
disk under `rec_<id>/<sha256>` (dedupe per record only — `BlobKey` is the only constructor); served
at `/a/<sha256>` with the type sniffed from bytes, SVG refused (415), a 2 MB cap and
`default-src 'none'; sandbox`; `export --with-attachments` hashes the set; nothing is rendered in
v1. This settles [Q10](17-OPEN-QUESTIONS.md).

**Rejected:** deferring attachments entirely. An invoice PDF is exactly what arrives by email, and
the deferral had been read back as a position.

**Would reverse it:** nothing — the open remainder is the viewer, Phase C.

---

## ADR-054 · Streamable HTTP only; the legacy HTTP+SSE transport is not carried

**Decided.** One MCP transport per the 2026-07-28 spec, hand-rolled JSON-RPC with zero
dependencies; `instructions` returned with every `tools/list` under the same `ttlMs`, since there is
no initialise step; `tools/list` ≤ 1,800 tokens. Phase A ships agent tokens only; the RFC 9728
document and the authorization server are deferred with a stated reason, and when built BrainDog is
its own AS. A stateless one-day shim for a named client is the only permitted exception, removed at
the offramp date.

**Amended, September 2026.** The same JSON-RPC core also answers over stdio, through `braindog mcp`,
and answers `initialize`, negotiating the newest version it supports at or below the one asked for.
`tools/list` is held at or under 2,600 tokens since the surface grew to fourteen tools ([44-SPEC-MCP](44-SPEC-MCP.md) §1, §7).

**Rejected:** a dual-transport server. It carries the statelessness assumption of the old transport
forever.

**Would reverse it:** one of the three clients the buyer uses still lacking streamable HTTP at build
time — which is the shim, not a reversal.

---

## ADR-055 · `contains:` is substring; `matches:` is full-text

**Decided.** `contains:` is field-scoped, ASCII-case-folded substring —
`instr(lower(x), lower(?)) > 0`, ≤ 40 bytes, **identical on both backends**. `matches:` is
register-wide FTS5 token match over the register's `search:` fields, on the entry backend only; the
MATCH operand is one quoted phrase with `"` doubled, so no FTS5 operator is reachable from an
author. Neither compiles to `LIKE`; `starts`/`ends` do, with `ESCAPE` and a 40-byte cap under
workerd's 50-byte `sqlite3_limit`.

**Rejected:** `contains` compiling to FTS5. A field-scoped test cannot be answered by one
register-wide `text` column, and a token match is not a substring match — an author would learn the
difference from a wrong result.

**Would reverse it:** per-field FTS5 columns becoming cheap enough to make `contains` a token match
without losing field scope — and even then `contains` and `matches` stay two operators.

---

## ADR-056 · Sixteen block kinds

**Decided.** `note quote stat bar gauge chips spec params todo steps timeline board code tree
comparison table` — sixteen, counted. `table` is the one kind bound to a `source:` register with
declared `columns:`, page-only and refused in a write-up. `diagram sparkline series forecast` are
post-v1 and arrive as a pack. Kinds are one TypeScript table — `src/kinds.ts`, `as const`, with a
derived `Kind` union — whose shape is the shape a pack's `block` declaration takes, so first-party
and third-party kinds take one code path ([36-SPEC-RENDER](36-SPEC-RENDER.md) §13 D4; an earlier
version said sixteen `kinds/*.json` files); `PRIMITIVES_VERSION = 1`. The grammar is
[34-GRAMMARS](34-GRAMMARS.md) §2.

**Rejected:** fifteen, with `table` spelled `comparison`. The canonical page declaration, the T1
emergent page and the width-class table all used `table`, and a validator built from fifteen refused
every declared page in the corpus.

**Would reverse it:** a seventeenth kind that cannot arrive as a pack — which would mean the
primitive layer is wrong, not the count.

---

## ADR-057 · Refusal codes are enumerated, `UPPER_SNAKE`, in one table, with a fixture per code

**Decided.** Every refusal has a code from the one table in [30-BLUEPRINT](30-BLUEPRINT.md) §6 —
**a hundred and twelve codes in nine families**: pack and declaration (47), grammar (14), write path
(18), auth and Keychain (7), format and lifecycle (8), dialect (2), slash (5), connector (7) and host
and client (4) — plus the adapter's separate closed vocabulary of thirteen. *An earlier draft said
ninety-nine in eight, which was true when nothing enforced it: the `refusals` gate then compared the
table against the code and found twenty-six codes the tree emitted and the registry did not have,
including one — a record whose owners are all suspended — whose absence from the table also kept it
out of `httpStatus`'s exception list, so a 503 condition answered 422. A closed list nothing closes
is a list that is already open.* JSON-RPC `-32602` and the `Http` adapter's error
names are vocabularies, not codes. A code with no fixture fails CI — the rule reaches every family,
the Slash and connector codes through their own `via` runners
([40-SPEC-FIXTURES](40-SPEC-FIXTURES.md) §6); a refusal path with no code fails review. Adding a code
is a diff to that table. *(Iteration 2 accepted twenty-four proposed codes and two new families at
once; the six specs that each counted from seventy-five had reached six different totals.)*

**Rejected:** codes as free strings in two conventions — `already_known`, `wrong_key`, `human_only`
beside `FIELD_TYPE_UNKNOWN`. A refusal an implementer cannot grep is a refusal that cannot be tested.

**Would reverse it:** nothing; the table grows, the rule does not change.

---

## ADR-058 · Missing-value semantics: positive operators are false, negative operators are true

**Decided.** An absent key, JSON `null`, `""` and `[]` are **missing**. `empty: true` matches;
`present: true` does not. Positive operators — `is in gt gte lt lte before after between has
contains matches starts ends` — are **false** on missing. Negative operators — `not not_in lacks` —
are **true**, and compile to `(expr IS NULL OR expr <> ?)`. `none:` is `NOT(any)` over branches
already two-valued by this rule; `bool` literals bind as 1/0. The reference evaluator and the
compiler agree by construction, which is what the property test needs.

**Rejected:** SQL's three-valued logic as the truth table. `<>` and `NOT IN` yield NULL on a missing
field, so `{ field: tag, not: x }` would silently exclude every row with no tag.

**Would reverse it:** an author-facing need for *unknown* as a third value — which would be a new
operator, not a change to these.

---

## ADR-059 · Billing lapse: read-only, then a 90-day ladder; export is always guaranteed

**Decided.** When a Cloud subscription lapses the record goes **read-only**: connectors and digests
pause; export and MCP reads stay available for 90 days; then the erasure ladder runs. At no point is
export withheld — the no-lock-in argument depends on it.

**Mechanism, recorded in iteration 2:** billing state lives in the Directory —
`record_dir.billing ∈ active | lapsed` with `lapsed_at` — and the ladder is day 0 · 60 · 83 · 90.
Under lapse every principal is capped at `read`, the owner's session may still `export`, and
everything else is `FORBIDDEN` with the fix sentence ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md)
§13 #5–#6).

**Rejected:** immediate suspension with the data held pending payment. It turns the record into a
ransom, which is the one thing the format exists to make impossible.

**Would reverse it:** nothing about the guarantee; the 90-day figure moves with storage cost.

**Amended September 28th 2026, as built.** The
billing state is the Directory's `dir_billing` table, one row per record somebody pays for, with
`state` in `active`, `past_due` and `lapsed`, `lapsed_at`, and `told`, the notices already sent in
this lapse. Only a verified Stripe webhook event writes it, so a record with no row, which is every
record nobody pays for through Stripe, is never capped and never deleted. While `lapsed` the Worker
caps every person at `read` and every token at `scope ∩ {read}` on the app, `/api` and `/mcp`
alike, refuses each write `403 FORBIDDEN` with "Read-only until billing resumes. Export is
available.", and lets the owner export. Connectors, inference and digests pause; reminders still
deliver. The ladder runs in the nightly walk, one notice a night at most, the earliest still owed:
day 0, day 60 and day 83 by mail to the payer and every owner, and a deletion at day 90
(`LAPSE_DELETES_DAYS`) only for a row that is still `lapsed` when asked again, whose three notices
all went, by the walk's one clock. The deletion keeps one final copy for `FINAL_KEPT_DAYS`, thirty
days, and the day-90 letter names the day it expires. **One departure from iteration 2's
mechanism:** a lapsed record starts no scheduled run at all and writes no per-run held event; the
lapse sentence, on the banner and in every refused write, is the record's one message
([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.10, §13 #6).

**Amended October 15th 2026: a lapse in the order the code takes it, the gift, and back to Free.**
A row is in one of four states, `active`, `past_due`, `lapsed` and `comp`, and a record with no
row is in none of them: it is not billed and never lapses. What happens, step by step:

1. **The Directory decides the state.** Only a verified Stripe event moves a paid row
   (`apps/worker/src/billing.ts`), and the subscription is read again from Stripe so events out of
   order still write what is true now. Stripe's `active` and `trialing` are `active`; its
   `past_due` is `past_due`, still writable while Stripe retries the card; its `unpaid` and
   `incomplete_expired` are `lapsed`. A subscription cancelled is first asked whether the record
   fits Free (below): when it does, the record goes **back to Free**; when it does not, it is
   `lapsed`. Entering `lapsed` sets `lapsed_at` once; staying there never restarts the ladder.
   Within one event the record's own lapse switch is flipped first, then the plan follows the
   price, then the row is written, then the letter goes, so a delivery cut halfway is put right by
   the next one. An invoice paid on a `lapsed` row makes it `active` again, empties `lapsed_at`
   and `told`, and sends the letter that says it can be written again.
2. **`apps/worker/src/lapse.ts` refuses writes and keeps export.** While `lapsed`, every write on
   the app, `/api` and `/mcp` is answered `403 FORBIDDEN` with its one sentence, "Read-only until
   billing resumes. Export is available."; a person is held to `read`, a token to `scope ∩ {read}`,
   and only the owner's own session, or a grant approved for `export`, may export. The drain drops
   fetches, model jobs and digests unsent; reminders still deliver. No credit pack is sold to a
   lapsed record.
3. **The nightly walk mails and deletes** (`apps/worker/src/ladder.ts`): one letter a night at
   most, the earliest still owed, on day 0, day 60 and day 83 to the payer and every owner; on day
   90 a deletion, only for a row still `lapsed` when asked again, whose three letters all went. One
   final copy is kept for thirty days.

**Back to Free.** A record whose paid plan is cancelled goes back to Free when it fits Free: one
person on it, and no other record of its owner's already on Free. How many agents it holds does
not decide this. The record stays writable and stays off the ladder: its lapse switch is turned off
if an unpaid card had turned it on, its plan becomes Free with Free's allowance, and its row keeps
the Stripe customer, so paying again is the same customer, and loses the subscription, price and
period, state `active`. A record with colleagues, or an owner who already has a record on Free,
lapses as in step 1. While nobody can count the people on a record it does not fit, and a count
that fails is an error Stripe delivers again, so a record never lapses on a guess. This is a
default taken for the owner and his to change; `fitsFree` in `billing.ts` is the one place it lives.

**`comp`, a plan given as a gift.** The operator's door `POST /account/ops/plan`, behind the
provision key, writes a row with no Stripe customer, no subscription and no price, state `comp`,
and puts the record on Cloud or Cloud Plus. No Stripe event can find such a row, the walk never
reads it, and the Directory refuses to write `lapsed` or `past_due` over it: a gift never lapses,
is never charged, offers no payment portal, and may still buy credit packs. A record paying through
a subscription, or one already lapsed, cannot be given one. The same door with no plan takes the
gift back by the same rule a cancel goes through: when the record fits Free it goes back to Free
with no billing row at all, as a record nobody pays for; when it does not, nothing changes and the
answer says why. A gift has no end date yet: it ends when the operator takes it back. The door
mails nobody.

---

## ADR-060 · No admin token; VAULT (now KEYCHAIN) is a browser session only, ADMIN a session or one operation grant

**Decided.** Token scopes are `read propose write` and nothing else — **there is no `admin` scope,
ever**, and no standing token reaches ADMIN. The VAULT group (`listGrants openGrant bindGrant
revokeGrant`) answers a browser session only; every bearer at those routes gets
`403 NEEDS_BROWSER_SESSION`. The self-host's `BRAINDOG_TOKEN` is the one owner-level bearer and
exists only for a single-user private instance.

**Amended in iteration 2 — the operation grant, an addendum and not a reversal.** ADMIN answers a
browser session, or a bearer carrying an **operation grant**: from a browser session the owner
approves *one named operation* — a pack install with its plan hash, an export, an import, a token's
creation or revocation — after seeing its summary: the plan diff, the export scope, the token's
scope. The approval is single-use, expires in ten minutes, is recorded as
`device_grant.reach = <operation>` and an `access.grant` event, and the bearer then reaches exactly
that ADMIN method once, with the grant's id in `ctx.op`. The reach is `pack`, `export`, `import` or
`token` — never erasure, restore, an invitation, a declaration write or the record's deletion, which
stay a browser session. A stolen `hosts.json` therefore cannot export or install. The tables are
[33-CONTRACTS](33-CONTRACTS.md) §4, [12-SECURITY](12-SECURITY.md) §3 and
[30-BLUEPRINT](30-BLUEPRINT.md) §10; the `router-groups` gate asserts it
([48-SPEC-CLI](48-SPEC-CLI.md) §13 D1; [53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §13 #3).

**Amended 22 October 2026: the press on a decision card, an addendum and not a reversal.** A
question may be answered inside Claude or ChatGPT, on the person's own press on the decision card,
while the owner has "Answer from inside chat apps" on. No token reaches `decide` still: the press is
carried by a one-time grant the MCP door mints beside the card and hides in the answer's `_meta`,
which the app hands the card and never the model. It names the person, the key, the question, the
options shown and the question's version, is spent once, lapses in fifteen minutes, and is minted
only for a key a chat app holds after the person signed in to it. The press runs `decide` as the
person with `pressedIn`, which `admin` and `vault` refuse, so it never installs or opens a key, and
the decision keeps the app it was pressed in. A model calling `answer` without a grant is refused
and told to show the card ([12-SECURITY](12-SECURITY.md) §5.1, [44-SPEC-MCP](44-SPEC-MCP.md) §15.12).

**Amended 27 October 2026: on the person's word, the owner's decision.** "Make it so decisions can be closed out by
agents if I tell them so." An agent the owner tells, in the conversation, to answer a question or make a change sends
his words, quoted, as `said`: `instructions {answer, option, said}` answers a waiting question, and `create` or
`update` with `said` writes a change the ladder would have filed as a question. The record runs `decide` as the owner
with `onWord` set, keeps his words and the run on the decision (a `note`, `field` `answered_on_word`, "Answered by S12
on Teodor's word: ..."), and Undo takes it back as any of his answers; a write keeps his words in its note and counts
towards no rung. Only an owner's key that may write, while **Agents may answer when you tell them** is on (Settings ›
Agents, `agents.answer_on_word`, on until he turns it off), from a run that has not read outside text. His word may
accept what installs (an add-on, an arrangement, an automation), which `decide` allows `onWord` alone; it never reaches
a key (a list of keys, or an automation that calls out with one), an amount of money set on what is already there, or
anything else `admin` and `vault` keep, which refuse `onWord`: erasing, deleting the record, the keychain, billing,
tokens and sharing stay a browser session's. A token still never calls `decide` itself; the record cannot tell his
words from words an agent made up, so the switch, the words kept and Undo are the controls
([44-SPEC-MCP](44-SPEC-MCP.md) §15.14, [12-SECURITY](12-SECURITY.md) §5.2).

**Amended 4 November 2026: no agent widens what agents may do, the owner's call.** His word (2 Nov) passes every owner's
door but handing over, deleting the record, erasing and the keychain. It does not pass what would let agents do more:
`agents.answer_on_word`, `agents.bypass` turned on, `agents.answer_in_chat` turned on, a settings row, a yes to a rung
offered, a new key from a key his settings hold to part of the record, a replacing import that changes the settings rows
or the members, or a restore past his last change to any of these. The same holds while his agents act without asking.
Turning a switch off stays open, except his word's own, which he alone turns.

**Rejected:** an `admin` scope, off by default. A scope that exists can be minted, leaked and
replayed; a group no token can reach cannot.

**Would reverse it:** the condition first written here — *"a signed, single-use plan hash, not a
scope"* — is what the operation grant is, so it is met rather than reversed. What would move the
rest: a deployment that must reach ADMIN with nobody in a browser at all — and the answer would still
be a grant per operation, approved somewhere a person is, never a scope.

---

## ADR-061 · Identity lives in a `Directory` object; three DO classes

**Decided.** `Record`, `Slash`, `Directory`. The Directory is one instance holding email → person,
credential → passkey, person → records, slug → `rec_id`, browser sessions, magic links and the login
lockout; the record keeps what a `.brain` must resolve offline and what is scoped to one record —
`person` (a mirror), `token`, `auth_fail`, `counter`, `vault_key`, `job`, `job_event` — for
**twenty-seven kernel tables**, plus the four `dog_*` header tables in every live record. On the
self-host the Directory is `directory.sqlite` in the same process, same schema, same `Sql` port.
The Worker resolves slug → `rec_id` there, then `idFromName(rec_id)`. The Directory's tables and
flows are `@braindog/record/directory` — a subpath of `record`, not a package of its own
([51-SPEC-WORKER](51-SPEC-WORKER.md) §13 D10).

**Rejected:** identity tables inside every record, or KV as a hot directory. The first cannot answer
*which records does this email own* without fanning out; the second is a second store to replicate
that the self-host cannot match.

**Would reverse it:** a customer count at which one Directory object's single-writer throughput
binds — sharding by email prefix is the documented next step.

---

## ADR-062 · The record never sees a plaintext credential

**Decided.** AES-GCM runs in **the host** — the Worker on Cloud, the Node process on the self-host —
never in the record. `openGrant(id)` logs `grant.read`, increments `opened`, and returns sealed
material `{ ciphertext, nonce, aad, kek_id, wrapped_dek }` — the one sealed shape everywhere, with
the AAD defined byte-exactly once in [12-SECURITY](12-SECURITY.md) §6; the host unwraps the DEK via
`KeyStore`, derives the grant key, decrypts, and returns plaintext to the browser once. `bindGrant`
is the mirror: the host encrypts, the record stores. Sign-up generates three keys — the record DEK,
the connector DEK and the signing key. The record has no `KeyStore` port, so the property is
structural rather than policed. *(Iteration 2 added the self-host half and the third key; an earlier
version said "the Worker" and left the connector DEK to be found at first bind.)*

*Note, September 15th 2026:* the agent path's key doors keep this. A deposit through `/api/vault/deposit`
is sealed by the host before `depositGrant` binds it, and a read through `/api/vault/open` is opened by the
host from what `openForGrant` returns sealed; the plaintext goes back once, to a terminal holding a Keychain
grant, rather than to a browser ([12-SECURITY](12-SECURITY.md) §6 rule 9). The Worker checks the grant and
answers `NOT_IN_THIS_BUILD` until it has a key store bound.

*Note, September 15th 2026, later the same day:* the Worker has its key store, and this decision holds across the
RPC boundary. `apps/worker/src/keys.ts` reads the root key only from the `KEK` binding, a Worker secret or a
Secrets Store binding. With it bound, provisioning wraps a new record's three keys, and the key doors seal and open
in the Worker exactly as the self-host does: the Durable Object's `depositGrant` calls the Worker's `seal` back over
RPC, so the object receives sealed bytes and performs no crypto. Unbound, `/auth/provision` refuses: "nothing
changes" was this ADR's own wording and it is amended here, in the revision that added the guard, because what
changed was unrecoverable and silent. A record provisioned before the binding has no wrapped keys and its doors say
so in one sentence ([51-SPEC-WORKER](51-SPEC-WORKER.md) §8 rule 3); a record provisioned after it is not made at
all, unless the deployment sets `PROVISION_WITHOUT_KEYS: yes` to say it seals nothing on purpose.

**Rejected:** decryption inside the object. It would give the record a `KeyStore` port and make a
compromised record a compromised Keychain; today a compromised record yields ciphertext.

**Would reverse it:** a per-record hardware key that only the object can drive — which does not
exist on the platform.

---

## ADR-063 · One YAML parser, in one subpath, never in the record

**Decided.** `yaml` 2.9.0 is a runtime dependency of `@braindog/declare`, reachable only through
the `@braindog/declare/yaml` subpath, and only on the CLI and self-host paths — a pack file or a
theme's authoring form is parsed where it is read from disk. The record never imports it, and the
Worker holds no YAML parser: what reaches them is the JSON `declare` produces.
[ADR-046](16-DECISIONS.md) lists it; [42-SPEC-DECLARE](42-SPEC-DECLARE.md) §13 D1 owns it.

**Rejected:**

| Alternative | Why not |
|---|---|
| A hand-rolled subset parser | a second YAML dialect nobody else implements, whose every gap is a pack that fails to load |
| JSON-only packs | the authoring form of every declaration in [21-AUTHORING](21-AUTHORING.md) and [28-THEMING](28-THEMING.md) is YAML, and a pack is written by hand |
| `yaml` importable from the package root | one import line away from the record bundle; the subpath makes the boundary a path, not a discipline |

**Would reverse it:** `yaml` losing maintenance, or a zero-dependency parser passing the whole pack
corpus — either swaps the module behind the same subpath.

---

## ADR-064 · `@braindog/host` — one package for what both hosts would duplicate; `record` before `mcp`

**Decided.** A thirteenth package, `@braindog/host`, holds what the Worker and the self-host would
otherwise each write: the route table as data (`ROUTES`), `httpStatus(result)`,
`resolveContext(req, lookups)` — cookie, bearer and operation-grant parsing over the host's own
lookups — `serveApi(api, req, ctx)` over standard `Request`/`Response`, and the `serveMcp`
wiring. Platform-neutral, about three hundred lines, and they must never drift between
[49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) and [51-SPEC-WORKER](51-SPEC-WORKER.md). It is last in the
package order, and the order gains a swap: **`record` before `mcp`** — `render → ports → where →
theme → fixtures → kernel → declare → extract → record → mcp → slash → connect → host` — because
`mcp` wraps the `RecordApi` type, a type import is still an edge, and the wrapper sits above the
thing it wraps. `mcp` is testable with a stub `RecordApi`, no Durable Object needed
([31-STACK](31-STACK.md) §2).

**Rejected:**

| Alternative | Why not |
|---|---|
| Each host carrying its own router and status map | the two drift, and the drift is found by a customer on the host the developer does not run |
| The shared code inside `record` | a capability package that knows HTTP; the record's ports are `{ Sql, Scheduler, Clock }` and stay so |
| `mcp` below `record` with a re-declared `RecordApi` | a structural copy of a sixty-four-method type, wrong on the first added method ([ADR-065](16-DECISIONS.md)) |

**Would reverse it:** a third host whose request model is not `Request`/`Response` — which would
argue for a narrower `host`, not for two of them.

---

## ADR-065 · Shared types have one owner each, and nobody re-declares them

**Decided.** `Refusal` and `RefusalCode` are `@braindog/ports`' — a type-only export from its root,
because `ports` is the lowest shared package and `where` needs the type while sitting below `kernel`;
[30-BLUEPRINT](30-BLUEPRINT.md) §6 stays the list's home. `CallContext` and `Result<T>` are
`@braindog/kernel`'s. `RecordApi` is `@braindog/record`'s, as `export type`. Every consumer imports
the type; **no structural re-declaration anywhere**. `CallContext.principal.kind` is
`person | token | runner | share | system | slash` — `runner` and `share` are principal kinds, never
top-level fields.

**Rejected:** `Refusal` in `where` (its first spec), in `kernel` (the kernel's) or in `declare` (the
MCP spec's) — three specs had three owners, and each consumer would have carried its own copy of the
shape; a `RecordApi` re-declared structurally by each of `mcp`, `slash`, `connect` and the hosts,
which is one type five times.

**Would reverse it:** a package below `ports` needing `Refusal` — none can exist, because `ports`
has no dependencies.

---

## ADR-066 · The web app is a static shell; `toHTML` is never a server render

**Decided.** `apps/web` builds once with `adapter-static` into one `build/` that both hosts serve
unchanged. No server renders a request; there is no `@braindog/web/node`, no nonce plumbing, no
document ETag. `braindog-render`'s `toHTML` serves the mirror, exports, tests and the digest email —
never SSR. The theme editor imports `@braindog/theme` in its own chunk when it arrives; there is no
SSR head, and the house theme is built into the shell at build time ([50-SPEC-WEB](50-SPEC-WEB.md)
§13 D1; [36-SPEC-RENDER](36-SPEC-RENDER.md) §12; [22-FRONTEND](22-FRONTEND.md) §2).

**Rejected:** a server-rendered shell with a Node handler for the self-host and a Worker path for
Cloud — two render paths for one app, and the self-host differing from Cloud in three ways instead
of two; `parse` and `toHTML` "for SSR of write-ups", which made an MIT library a server dependency.

**Would reverse it:** a shared page that must be readable by a client with no script — which would
be a rendered export of that one page through `toHTML`, not SSR of the app.

---

## ADR-067 · On the self-host a snapshot is not an export

**Decided.** A self-host **snapshot** is a full `VACUUM INTO` copy that keeps the six `local` tables
and never leaves the host — disaster recovery for *this* instance, with its tokens, device grants,
observations and jobs intact. An **export** is the portable `.brain` without them, as
[03-DOG-FORMAT](03-DOG-FORMAT.md) §5 defines it. Two artefacts, two jobs
([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §13; [53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §13 #10).

**Rejected:** stripping `local` from the snapshot so that `braindog verify` reads it as an export —
a restore from it would then have lost every agent token and every device grant, which is the one
thing a restore of an instance must not lose.

**Would reverse it:** a self-host restore that can rebuild the `local` tables from somewhere else —
nothing on the self-host holds them but the file.

---

## ADR-068 · The record's surface is sixty-four methods in six groups, and its reach is the group's

**Decided.** Sixty-four methods, counted: DATA 9 · READ+ 12 · VAULT 4 · JOBS 7 · ADMIN 16 ·
INTERNAL 16. Every method is `(args, ctx: CallContext) => Promise<Result<T>>`. Reach is the group's:
DATA answers any token in scope (`markRead` to person principals only); READ+ any token, and MCP
resources; VAULT a browser session only; JOBS is refused to every MCP token — its browser half and
its runner half alike; ADMIN a browser session, or a bearer carrying an operation grant for that one
operation ([ADR-060](16-DECISIONS.md)); INTERNAL the host only. The list is
[30-BLUEPRINT](30-BLUEPRINT.md) §5; the signatures are [45-SPEC-RECORD](45-SPEC-RECORD.md) §2. A host
routes `POST /api/<method>` by property lookup on the object — the generic `call` is a two-line
lookup in `@braindog/host`, not a shape of the record.

**Rejected:** the six counts the specs reached from six starting points — 44, 45, 47, 49, 55 and 57
— none of which was the surface; a generic `call(method, args, ctx)` as the record's own shape; a
`mode` on `setDeclaration` carrying rule test and apply — `ruleTest` is READ+ and `ruleApply` is
ADMIN, as methods.

**Would reverse it:** a sixty-fifth method — recorded as a diff to 30 §5 and to this ADR, never as
a route.

---

## ADR-069 · Usage is counted per record in the Directory, and a hosted record waits at its allowance

**Decided.** Every scheduled action's run writes one `pull` event in the record with its runs, requests,
bytes, run time and failures, and its scope (a project, or `global`). The host adds that event to a ledger
in the Directory, `dir_usage_day` by record, UTC day, scope and action, counting each event id once
(`dir_usage_run`). A month is the sum of its days and an account is the sum of the records it owns. Each
record has a plan: `hosted` allows 15,000 runs, 150,000 requests, 1 GB fetched and 50 hours of run time a
month; `selfhost` is counted and never limited. Before a run starts the host asks the Directory, and at the
limit the action waits until the first of the next month with an event that says so in one sentence. It is
never paused and never skipped silently. Metering started with the first run. Directory version 4.

**Rejected:** the count in the record, because billing is the account's and the record is the customer's
data, and a customer's export should not carry the operator's meter; a refusal code at the limit, because
nothing a caller asked for was refused and 30 §6 already has what an install needs; an install-time refusal
against the allowance, because the record cannot see the Directory; overage charges, until a payment
provider exists.

**Would reverse it:** a price per run rather than per record, which would move the allowance from the plan
to an invoice line; or the owner choosing a different allowance, which changes `PLAN_TABLE`
(`packages/record/src/plans.ts`, whose rows the Directory's `ALLOWANCE` reads), with the site's copy of its
rows in `apps/site/src/lib/plans.ts` and ADR-071's figures in the same change, each held to it by a test
([ADR-071](#adr-071--one-table-of-plans-and-every-figure-is-read-from-it)).

---

## ADR-070 · The assistant is called Slash, by the owner's choice

**Decided.** The assistant is **Slash**. It was called Spark until September 25th 2026, when the
owner chose the new name and asked for every reference to change.

**Every reference, not only the words on screen.** The package (`packages/slash`), the routes
(`/api/slash/*`), the flow step (`ask_slash`), the Keychain key label, the host settings (`SLASH_*`),
the spec ([46-SPEC-SLASH](46-SPEC-SLASH.md)), and the types, functions, tests and file names under
them. What a record already holds under the old name (an event's actor, a suggestion's opener, a
person's prefs, a key's label, a parked step, a declaration's step) is renamed by a migration that
runs when the record opens, so nothing is left answering to the old name.

**What it costs a self-hoster.** An environment that sets `SPARK_ENDPOINT`, `SPARK_MODEL` or
`SPARK_KEY` has to rename them to `SLASH_ENDPOINT`, `SLASH_MODEL` and `SLASH_KEY` by hand. The host
reads only the new names, and a host with none of them set runs with no model, which refuses rather
than fails.

**Not renamed.** `sparkline`, which is a kind of chart and not the name. The uses of "slash" that
mean the `/` character: an identifier that means the character takes a `-key` or `Key` suffix, so
`slash` alone only ever means the assistant. Other companies' products:
GitHub Spark and Gemini Spark. Quoted words, which stay as they were said. And history: earlier records
say what was true on their day.

**Kept from ADR-017, because they were never about the word.** The governance sentence:
**Slash never decides. It points at what does.** And the first-use rule: always **"BrainDog Slash"**
on first use in any public surface, never *Slash* alone in a repository, a package or a domain. The
rule weighs more on this name than it did on the last, because "slash" is already a plain word in
the same category: chat and agent tools call the commands a person types after `/` slash commands.

**Rejected:** keeping the old names as aliases beside the new ones, because an alias is a second
name somebody has to keep answering to, and nothing outside this repository depends on the old
ones: the owner's own record is the only record on the Cloud. And a text substitution on its own,
because ADR-017's history shows what one does to a document whose subject is the name: the three
passages that argue about the name (ADR-017, [11-ASSISTANT](11-ASSISTANT.md) §1 and
[Q8](17-OPEN-QUESTIONS.md)) were rewritten by hand.

**Open:** [Q8](17-OPEN-QUESTIONS.md). Whether Slash is clear of a register in classes 9 and 42 has
not been checked. It does not block the rename.

**Would reverse it:** the owner's word again, or a live registration in class 9 or 42 by somebody
who enforces.

---

## ADR-071 · One table of plans, and every figure is read from it

**Decided.** Every figure of every plan is one row of `PLAN_TABLE` in `packages/record/src/plans.ts`
(9 October 2026). Money is whole cents of one currency, USD. The figures:

| Plan | Price | Runs | Requests | Data | Script time | Slash credits | Agents | People |
|---|---|---|---|---|---|---|---|---|
| Free | $0 | 1,000 | 10,000 | 0.1 GB | 5 hours | 20 | 3 | 1 |
| Cloud | $12 a month | 15,000 | 150,000 | 1 GB | 50 hours | 80 | 15 | any number |
| Cloud Plus | $29 a month | 75,000 | 750,000 | 5 GB | 250 hours | 400 | 75 | any number |

Every figure is a month's except agents, which is how many agent keys a record may hold live at once. A
self-host is counted and never limited. No plan is sold by the year. Credit packs are 100 credits for $5
and 500 for $20, and usage past the allowance is $1 per 5,000 runs, $1 per 50,000 requests, $0.50 a GB and
$1 per 10 hours, under a cap the owner sets; neither is sold by any checkout yet, and billing stays off or
in test mode until the owner sits for a live charge.

The Directory's `ALLOWANCE` and `PLANS` read the table, the checkout takes its names and prices from it
(`apps/worker/src/billing.ts`), and the site's cards are made from it (`apps/site/src/lib/plans.ts`, held by
`plans.test.ts` with a planted fault). This ADR and [15-ROADMAP](15-ROADMAP.md) say the same figures, and
`packages/record/test/plans-docs.test.ts` reads both against the table.

**Why.** The same figures lived in four files, and Cloud Plus was 75,000 runs in the code and 60,000 in the
roadmap. Cloud, the packs and extra usage are the owner's (26 September); Free's figures are the default taken
for him on 2 October. Cloud Plus at five times
Cloud on every figure, agents at 3, 15 and 75, and no yearly price are the defaults taken for him on
8 October.

**Rejected:** the roadmap's 60,000 runs for Cloud Plus, because its card says five times Cloud and the code
already held that; a yearly price, until he names one; a second table on the site, because a figure typed
twice is a figure that drifts. Until the site declares `@braindog/record`, its `TABLE` is the three sold
rows whole, and `plans.test.ts` refuses any field of it that differs from the table.

**Would reverse it:** the owner's word on any figure, which changes the table's row, the site's copy of it
and the two documents in the same change, or `plans.test.ts` and `plans-docs.test.ts` go red.

---

## ADR-072 · Slash signs the declare of its own look, and no other declaration

**Decided.** Slash signs `suggest`, `propose` and `predict`, and one thing more: the `declare` line of a look
whose body says `by: slash` and which no add-on carries. A look arranges a page that already exists. It adds no
page, no list, no rule and no script, and it is versioned, so Undo puts back the one before. A page, a list, a
rule, a script and an add-on are a person's to install and to retire, and an install or a retire signed `slash`
of any of them is refused before its line is written, inside the transaction, so nothing of it lands
(`slashMayWrite` in `packages/kernel/src/slash.ts`, called by the install and the retire).

**A fold is never Slash's.** A fold of two entries made in the top band of understanding, where the model's
score says the two are certain, is signed by the record itself, as a fold by the strong rules is, and names the
model's score in its note. Slash signs no fold.

[30-BLUEPRINT](30-BLUEPRINT.md) §3 states the invariant as a query with this one exception, the `slash-actor`
gate reads the query from there, and [46-SPEC-SLASH](46-SPEC-SLASH.md) says the same list.

**Why.** The rule: "Model (spark) may only write suggest/propose/predict events; enforced in kernel."
A model arranges a page, and that install was signed `slash` with a plain insert the guard never saw, so the
first look a model wrote broke the invariant with nothing saying so, and a page installed as Slash would have
been written the same way.

**Rejected:** signing a look as `system`, because the feed would then not say a model arranged the page;
letting Slash sign any look, because the body's `by:` is what stops it signing the owner's arrangement.

**Would reverse it:** the owner's word. A new kind Slash may sign is one line in `SLASH_MAY`, this decision and
the query in 30 §3, in the same change.

---

## ADR-073 · What the owner tells an agent is a record of its own, and an agent answers it

**Decided.** An instruction is one row of a kernel register, `instructions`, spoken `IN4`. The owner writes it in the
app, to a run, to an agent kind on a project or repository, to whoever is next, or on a task. It moves Sent, Seen (by
which run, and how), Working, then Done, Needs you or Declined, or Expired or Withdrawn. One run takes it, by compare
and set. The agent answers with the `instructions` tool, and the answer carries what it changed, with Undo.

Delivery has four paths and says so honestly. Every client gets it in `context` and in one line on a tool answer. Claude
Code also gets hooks that read a local file, and an opt-in channel. A client with no hooks is reached when it next calls
BrainDog, and the app says which is which. Stop and pause are enforced by the record for every client, and by a hook in
Claude Code.

**Only a person writes an instruction.** `instruct` refuses a token, so no agent can instruct another, and text an agent
read in a mail never becomes an order to a second agent.

**Rejected:** a plain tool that returns a message (no states, no taking, no answer); a push-only design (most clients
cannot receive one); letting agents instruct each other (it opens prompt injection from one agent to the next).

**Would reverse it:** a client protocol with real push that every agent honours, which would make the polling paths
spare.

---

## ADR-074 · Agent settings are one row per kind of agent, and only the owner changes them

**Decided.** One row of `agent_profile` per kind of agent (`claude`, `codex`, `cursor`, `runner`, `script`), optionally
bound to a token or machine, and a `default` row for agents no row matches. The nearest match wins. A row sets how far
the agent may go (read, propose, write), the projects and lists it may change, the tools it has, its brief, quiet hours,
limits, what to tell the owner on finish, and its context size, stop switch and channel.

The effective level is the lowest of the token's scope, the row and the ladder rung, and the floors (money, keys,
deletes, sharing) that no row lifts. A tool turned off is not listed, and a call to it is refused `TOOL_OFF` with the
setting named. New agents start at Suggest. The migration gives each kind his runs have used a row at the scope its token
holds, so nothing he has now gets narrower.

Only the owner, signed in to a browser, changes a row. Every token is refused `NEEDS_BROWSER_SESSION`. An agent reads its
own effective row in `whoami`, and never writes it.

`braindog setup` makes one token per agent it wires, so a row bound to a token is a boundary. A row matched on the
agent's own name is a claim the client makes, and the app labels it "applies by name".

**Rejected:** settings in the agent's own config (the agent could change them); one global setting (Claude and a script
do not deserve the same reach); a settings tool for agents (an agent would raise its own limits).

**Would reverse it:** per-agent identity that is stronger than a token, which would make "applies by name" go away.

---

## ADR-075 · The pulse replaces the WebSocket for what an agent hears

**Decided.** The bridge calls `pulse` on the record every 15 seconds, and every 5 seconds while a stop or a pause is
pending. The answer is the run's stamp, what is pending for it and whether it is stopped. The bridge writes it to a local
file, and the Claude Code hooks read only that file. A pulse writes no version, no event and no history line, so it costs
about 10 ms in the record and does not wake the app.

This supersedes the WebSocket of [ADR-044](16-DECISIONS.md) for live updates to agents. ADR-044's reasons stand: a held
connection costs a Durable Object its hibernation, and the app already polls the version every 1.5 seconds. The runner's
long-poll claim also stands.

The honest latency is at most about 15 seconds plus the next prompt or tool call. The opt-in channel gives seconds, for
a client that supports it, and is off by default.

**Rejected:** a WebSocket per agent (the cost ADR-044 counted, for a latency no agent asks for); server-sent events (the
same cost); pulling on every prompt (a network call in front of every prompt, about 400 ms).

**Would reverse it:** the channel leaving research preview and being honoured by more clients, which would make push the
default.

---

## ADR-076 · The kernel declares one more register, `instructions`

**Decided.** `register.instructions` is the second register the kernel declares, beside `register.session`, with
`pack_id = 'kernel'`, seated by migration 0042. The rule that the kernel contains no register declaration now has two
named exceptions, and `no-declarations-in-kernel` reads both from one list. No pack or person may declare it:
`validate` refuses it as `PROVIDES_CONFLICT` unless it is the kernel's own bytes. [02 §1](02-DATA-MODEL.md) says the same.

**Why.** It is core for the reason `session` is. It is how the owner reaches the runs, so it cannot wait for a pack to be
installed, and it has one writer. As a plain table it would have needed a tool and a route of its own, and as a register
it gets spoken ids, lists, transitions and a log for free.

**Rejected:** a pack (an uninstalled pack would leave the owner unable to stop a run); a plain table (no spoken id, no
history, a second set of routes).

**Would reverse it:** a third register wanting the same exception. A third needs this decision, the gate's list and 02 §1,
in the same change.

---

## ADR-077 · The Keychain asks before a machine opens a key, and locks itself

**Decided.** A key may say, for one machine or for every machine, `always`, `ask` or `deny` (migration 46,
`key_access`), and no rule is `always`. On `ask`, an agent's keychain grant is answered `KEY_ASKED` and the owner is
told once; he allows it once, always, or denies it (`key_ask`), and the CLI waits up to two minutes on the same open
door. The Keychain's gate reads the owner's `lock_after` (5, 15 or 60 minutes, 15 by default) where it read a fixed
fifteen, and Lock now (`/auth/keychain/lock`) puts the session's proof behind the longest window. [12-SECURITY](12-SECURITY.md)
§6.3 has the detail.

**Why.** A keychain grant opened every key in its project for thirty days, so a leaked one, or an agent doing more than
asked, could open the deploy key as easily as the test key. A Mac keychain answers this by asking per item, and that is
the shape people already know. No rule meaning `always` keeps every installed CLI and every agent working unchanged.

**Rejected:** a narrower grant per key (a grant per key is a sign-in per key, and the asks are what the owner wants to
see); prompting scheduled runs and leases (nobody is there to answer, so a run would fail where it worked); a new event
kind for asks (an ask is a notice, and the `note` event and the one router already carry it); a Directory column for the
lock (moving the session's proof back says the same thing with no schema change).

**Would reverse it:** asks so frequent that owners set every key to `always`, which would say the rule belongs on the
grant instead.

---

*Next: [17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md).*

