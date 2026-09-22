# 10 · MCP — the agent surface

The reason this product exists rather than a notes app: **every agent, the same rows.** No vendor
will build the screen showing what you pay its competitors, and a memory store that mounts inside
one vendor's sandbox cannot be the place all of them write.

Built against the **2026-07-28 MCP specification**, which changed enough to matter.

---

## 1 · What the 2026-07-28 spec changed, and why each change helps

| Change | Consequence for BrainDog |
|---|---|
| **`initialize`/`initialized` handshake removed; no `Mcp-Session-Id`** | Every request is self-contained, carrying protocol version, client identity and capabilities in `_meta`. The server is genuinely stateless, so it is just the Worker — no session store, no sticky routing |
| **`Mcp-Method` and `Mcp-Name` HTTP headers** | The headers must equal the body, so the edge's telemetry names the tool without parsing JSON. The rate limit itself keys on the token, never on a header (§8) |
| **`ttlMs` and `cacheScope` on `tools/list`, `prompts/list`, `resources/list`, `resources/read`** — top-level fields of the result | The tool list is cached by the client. This is the single biggest lever on context cost — see §4 |
| **Multi Round-Trip Requests (MRTR)**: a server returns `resultType: "input_required"`, the client retries with `inputResponses` | **The decision gate becomes protocol-native.** See §5 — this is the most important item in this document |
| **DCR deprecated in favour of Client ID Metadata Documents; `iss` per RFC 9207; issuer-bound credentials; `application_type`** | Standard OAuth 2.1 resource-server behaviour, and desktop/CLI clients on localhost redirects finally work |
| **Roots, Sampling and Logging deprecated** (12-month minimum support) | Do not build on them. Sampling in particular was the tempting way to have the client's model do our inference; it is going away |

The legacy HTTP+SSE transport has a one-year offramp. BrainDog ships **streamable HTTP only** and
does not carry a compatibility layer for a transport that is being retired — with one permitted
exception, stated in [17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q7 and [ADR-054](16-DECISIONS.md): a
stateless one-day shim for a named client whose software is still on HTTP+SSE at build time, removed
at the offramp date. The endpoint is `POST /mcp`, served by `serveMcp(request, surface, ctx)` over one pure
JSON-RPC core, `handle`, which the command line's stdio server shares. The host checks the bearer and hands over a
`CallContext`, or `null` for a 401. The tools reach the record through a structural surface, so the package imports
nothing of `@braindog/record` and is tested with a stub: hand-rolled JSON-RPC, no dependencies
([33-CONTRACTS](33-CONTRACTS.md) §2, §4; [31-STACK](31-STACK.md) §2; [44-SPEC-MCP](44-SPEC-MCP.md) §2). A client of
an earlier revision still connects through `initialize`, and a 2026-07-28 client may ask `server/discover` first.

---

## 2 · Authentication

BrainDog is an OAuth 2.1 **resource server** — staged, because a resource server needs an
authorization server and an earlier draft never named one.

**Phase A ships agent tokens only.** An agent token is a long-lived bearer, scoped, revocable,
created in the app (or minted by `braindog login` through the device grant) and shown once. This is
the path for a headless session in a repo on a machine with no browser, and it is how tier-0
collaboration works with zero UI.

**Deferred, with the reason stated:** the OAuth 2.0 Protected Resource Metadata document
(RFC 9728) at `/.well-known/oauth-protected-resource` must name an issuer, and an authorization
server is a component with no line item in [15-ROADMAP](15-ROADMAP.md) §1b. When it is built,
**BrainDog is its own authorization server** on `apps/worker`:

- passkey or magic-link consent, PKCE, no refresh tokens for CLI clients;
- `iss` validated per RFC 9207 before a code is redeemed; credentials issuer-bound;
- **Client ID Metadata Documents** accepted; Dynamic Client Registration not implemented, per the
  deprecation.

**Every token is scoped to one record.** There is no token that reaches two records, because
there is no code path that reaches two records — the object boundary is the security boundary.

Token scopes are coarse on purpose: `read`, `propose`, `write`. Not per-register. A capability
matrix nobody can reason about is a capability matrix that gets set to "all". **There is no
`admin` scope, ever.** VAULT is a browser session only. ADMIN is a browser session — or a bearer
carrying an **operation grant**: one named operation the owner approved from a browser session after
seeing its summary, single-use, ten minutes, reaching exactly that method once
([12-SECURITY](12-SECURITY.md) §3, [ADR-060](16-DECISIONS.md)). A bearer at either group's routes
without one gets `403 NEEDS_BROWSER_SESSION`; over MCP every token is refused (§8).

---

## 3 · The tool surface is DYNAMIC and per-customer

A customer's registers come from *their* installed packs and from what they and their agents added
at run time ([DIRECTION §22](../loop/DIRECTION.md)). A freelancer with `money-core` and `freelancer-uk` has
different registers from a studio with `products` and `people`, and the same fourteen tools reach all of them.

### The generation rule

Tools are **not** one per register. That is the naive design, and it produces 40 tools nobody can choose between.
Instead:

| Tool | Shape | Count |
|---|---|---|
| `record_index` | the cheap orientation call: registers, counts and the version | 1 |
| `context` | the briefing for where the session stands: its project, open work, questions waiting on the person, people, the keys and servers it may use by name, skills and learnings, and everything global | 1 |
| `schema` / `history` | a register's fields, read before a write; the writes that made one row | 2 |
| `get` | one row, by the id a person says: `obligations#41`, or a prefixed id such as `S42` or `LN7` | 1 |
| `list` | a register plus a `where:` tree, a limit and a cursor | 1 |
| `search` | FTS5 over everything the token can read | 1 |
| `governance` | what was proposed, decided and predicted | 1 |
| `propose` | open a suggestion with options. **The only way an agent affects a decision**, and the way it asks to change what it may not change itself | 1 |
| `create` / `update` | typed writes against a named register; `update` carries the row's `version` | 2 |
| `log` | one note on a row, changing nothing about it | 1 |
| `handoff` | keep the session's next step and its dead ends true | 1 |
| `meet` | a person met in the work, matched or added, with where they were met | 1 |
| **Per-register schemas, pages, figures, skills** | delivered as **resources**, not tools | *n* |

**Fourteen tools, fixed, regardless of how many registers a customer has.** The variability lives in the
*arguments*, as in `list(register: "obligations", where: {...})`, and in the resources, which are fetched when
needed. Fourteen and not the eight an earlier revision named, because the agent path added three things every
session does: `context`, `handoff` and `meet` (`loop/DIRECTION.md` §0). Five went to pay for them: `pages`, `page` and
`metric` are resources, `credentials` could never answer a token, and `dry_run` previews a rule, which only a person
installs ([44-SPEC-MCP](44-SPEC-MCP.md) §4.4).

**What each reaches, said once:** `record_index` reads `boot()` and `version()`, `log` is `update` with an empty
patch, and every other tool shares its method's name ([30-BLUEPRINT](30-BLUEPRINT.md) §5). Every method takes
`(args, ctx)` and returns the `Result<T>` envelope of [33-CONTRACTS](33-CONTRACTS.md) §2. Over HTTP a refusal is
`422 { refusals }` and a conflict is `409 { conflict }`. Over MCP a refusal is an error result carrying the refusal
whole, `code`, `fix` and `allowed`, and a conflict is `VERSION_STALE` with the current row and who changed it. A
message the protocol cannot read gets one of JSON-RPC's numbers, which are a vocabulary and not refusal codes
([30-BLUEPRINT](30-BLUEPRINT.md) §6).

This is the central design decision of the MCP surface and it exists because of §4.

### `tools/list_changed`

Not pushed, and not needed for the tools: the server is stateless, the fourteen do not change on an install, and no
description names a register. A register added or removed is seen through `record_index`, `context` and
`resources/list`, and a client holding a stale register name is answered `REGISTER_UNKNOWN` with the registers there
are in `allowed` ([44-SPEC-MCP](44-SPEC-MCP.md) §4.5).

---

## 4 · The token budget, which is the real design constraint

An MCP server's tool definitions sit in the model's context on **every single turn**. A verbose
server is a permanent tax on every conversation the customer has, in every client, forever.

This is measured rather than assumed, because there is direct evidence from a comparable system:
a prior MCP server for a similar record shipped a digest response of **~27,000 tokens** and an
index response of **~1,300 tokens** for the same orientation job. The digest was the default. The
fix was making the index the default — a **95% reduction** in the cost of the first call of every
session, with no loss of capability, because the index says what to ask for next.

Three rules follow, and they are the difference between an MCP server agents keep and one they
disable.

**1 · Fourteen tools, not forty.** A tool per register would put every customer's entire schema in
every context window. Registers are arguments; schemas are resources fetched on demand.

**2 · Progressive disclosure, by contract.** Every response ends with what to ask for next.

```json
{
  "registers": [
    { "id": "obligations", "rows": 38, "open": 14 },
    { "id": "services",    "rows": 22, "renewing_30d": 4 }
  ],
  "open_questions": ["SG23"],
  "changed_since_your_last_call": 3,
  "next": [
    "list({register:'obligations', where:{field:'due', before:'+30d'}})",
    "resource: schema/obligations",
    "get({spoken:'SG23'})"
  ]
}
```

~350 tokens. It is enough to orient and deliberately not enough to quote from — which is the
point: an agent that needs a figure asks for the figure. `open` counts rows in non-terminal states —
`0` for a register without `transitions:` — and each register's `fields` lists `{ id, type }` only
([45-SPEC-RECORD](45-SPEC-RECORD.md) §5).

**3 · `ttlMs` on every list.** `tools/list` gets `ttlMs: 3600000` and `cacheScope: "private"`, the scope for
anything a record answers; `server/discover` alone is `"public"`, because it reads nothing and is the same for every
caller ([44-SPEC-MCP](44-SPEC-MCP.md) §4.3). The fourteen do not change on an install and no description names a
register (§3), so a client holds the list for its hour without holding anything stale. This also keeps the client's
*upstream prompt cache* stable across reconnects, which the 2026-07-28 spec calls out explicitly as a goal of the
field.

### Measured budget targets

| Item | Target | Why |
|---|---|---|
| `tools/list` total, `instructions` included | **≤ 2,600 tokens**, measured at 2,311 | it is in every turn of every session. 1,800 was set for eight tools, and the agent path needs fourteen ([44-SPEC-MCP](44-SPEC-MCP.md) §7) |
| One tool description | < 200 tokens | forces the description to say when to use it, not how it works |
| `record_index` response | < 500 tokens | the first call of every session |
| A `list` response, default page | < 2,000 tokens | 25 rows, projected, not whole documents |
| A `get` on a document row | full | if you asked for the document, you want the document |

The first two are asserted by `packages/mcp/test/budget.test.ts` with `tokenBudget`
([44-SPEC-MCP](44-SPEC-MCP.md) §5.8), over the tool list exactly as it is sent. The other three are targets for the
record's answers, which the tools relay unchanged. A budget nobody measures is a budget that drifts.


### Three read levels, and a scope

The predecessor's whole-record read has three levels and the cheapest is the default:
**index** (~700–1,300 tokens: one line per entity plus counts and open questions), **digest**
(~27,000: every write-up collapsed to a word count except the project the caller is inside), and
**full with a path** — full *without* a path is refused, because *"it spends the whole budget to
learn nothing."* `record_index` is the first; `get` with a path is the third; **the digest is now a
named projection**, `record_index({ level: 'digest' })`, so an agent that needs the shape of every
register in one call can have it without paying for every document.

And a **scope**, which is `context`'s. A session is placed in a project by its remote, its folder or its
repository's name, matched against the one register that declares `scopes:` and lists each project's `repos` and
`folders`, so it can ask *"what is true about the project I am standing in"* with the one thing it already knows
about itself. The predecessor sends this on every call as a header. Here the command line sends it as the session
headers, and an HTTP client sends it in `_meta.session` ([44-SPEC-MCP](44-SPEC-MCP.md) §4.2).

### `boot`, and the read mark

`boot()` — a READ+ method and a resource — returns the index, the live sessions and the open
suggestions, **in one round trip.** It is what the web app opens with. `whatsNew` since the caller's
read mark is its own call for now, and a session's hook prints `context`, which says where the session
stands ([44-SPEC-MCP](44-SPEC-MCP.md) §4.4). The read mark is one value per person, written
with `MAX()`, stored outside the record's rows ([30-BLUEPRINT](30-BLUEPRINT.md) §1) — so a late
device never moves it back and a read is never a write.

---

## 5 · MRTR: the decision gate becomes protocol-native

This is the most consequential find in this research pass.

The product's differentiator is that an agent lays out options and **never chooses** — a human
does, and the choice becomes an immutable row with a mandatory reason. Until 2026-07-28, that
meant a custom flow: the agent calls `propose`, gets back "pending", and the human goes to the
web app.

MRTR replaces server-initiated requests with a retry pattern: the server returns
`resultType: "input_required"` naming what it needs, and the client retries the original call
with `inputResponses`. It exists for *mid-call confirmations and parameter elicitation*.

Which means the gate can happen **inside the tool call, in whatever client the human is already
using**:

```
agent → update({register:'services', seq:12, patch:{state:'cancelled'}, version:4, op_id:'01J…'})

server ← resultType: "input_required"
         requests: [{
           kind: "decision",
           question: "Cancel Cloudflare Workers Paid ($5/mo, renews 2026-09-01)?",
           options: [
             {id:"cancel", label:"Cancel it",  because:"Nothing has deployed in 60 days"},
             {id:"keep",   label:"Keep it",    because:"acme.example's worker is on this plan"}
           ],
           requires_reason: true
         }]

human sees this in their own client, chooses, types a reason

agent → update(…, inputResponses:[{id:"keep", reason:"acme.example still deploys weekly"}])

server ← { ok:false, decided:"D42", reason_recorded:true }
```

The write did not happen, a decision row did, and the reason is in the record. **The gate is
enforced by the server, so it holds regardless of which client or model is on the other end** —
which is exactly the property a governance mechanism needs, and the thing a client-side
"confirm?" prompt can never provide.

The counter-pressure worth recording: the runtime ecosystem is moving the other way — auto-approve
modes replaced human approval with a classifier and became default. BrainDog's position is that
for *money, cancellations and credentials* the human stays in the loop, and MRTR is now the
standards-track way to do it.

---

## 6 · Resources and prompts

**Resources** are the read surface that does not belong in a tool:

| Resource | Contents |
|---|---|
| `schema/<register>` | the field list, types, validation. Fetched when an agent is about to write |
| `decisions` | what has been proposed and not yet answered: the open suggestions |
| `digest/today` | what the scheduler would have said |
| **`page/<slug>`** | a declared page, **resolved against live rows** — the same projection the web app renders, as data rather than HTML |
| **`metric/<id>`** | one metric's value, target, window, delta and the row count behind it |
| **`sessions/live`** | who else is working, on what, and **`same_repo`** — the list the SessionStart hook prints with *"two sessions in one working tree overwrite each other. Coordinate or stop."* |
| **`context`** | where the session stands, in one call: its run and project, the last handoff there, who else is live, what waits on the person, and every register with a scope field, the project's rows first and then the global ones the nearer scope leaves. Learnings, skills and keys arrive this way, keys by name only, and `truncated` is set honestly. It is the briefing `attach` returns and the start hook prints; `ttlMs` 0 |
| **`boot`** | the first-screen read: the registers the caller may read with their row counts, the record's `now`, the live runs and the open suggestions, in one call |
| **`whoami`** | who this token is, its scope and its record — what a new session reads first; `ttlMs` 0 |
| **`skill/<name>`** | the text of one skill, listed with when to use it |
| **`actions`** | every scheduled action (`pull`, `call`, `poll`): what it calls, how often, its key by label only, whether it is paused and why, its last run and this month so far; `ttlMs` a minute. Starting a paused one again is `resumeAction`, which is ADMIN and a person's |

**Every resource is backed by a method**, so [ADR-018](16-DECISIONS.md)'s rule holds by
construction: `schema` `digest/today` `page` `metric` `sessions/live` `context` `boot` `whoami` and `actions` are the
methods `schema({ register })` `digestToday()` `page({ slug })` `metric({ id })` `sessionsLive()` `context()` `boot()`
`whoami()` and `actions()` of [30-BLUEPRINT](30-BLUEPRINT.md) §5. `decisions` is `governance({ register: 'suggestion' })`, the open
suggestions, and `skill/<name>` is `list` over the skills register by name, so neither is a read path of its own. The
move that decides stays a person's act (§5). URIs are `braindog:<path>`; `schema`, `page`, `metric` and `skill` are
templates, and every resource carries `ttlMs`: the table is [44-SPEC-MCP](44-SPEC-MCP.md) §4.7. Three more are
planned and not built, so none is listed: `dialect`, the block dialect of [34-GRAMMARS](34-GRAMMARS.md) §2 in one line
a kind, which is the writing guide; `whats-new`, the events since a cursor, which is the cheap way to catch up; and
`rule-test/<id>`, a rule's `when:` run against live rows without applying it. Each waits for its method. A resource
with no method behind it is a design error.

> **The last two close a hole [ADR-018](16-DECISIONS.md) would otherwise have called a design
> error.** Its rule is *"any screen that needs an endpoint no agent can call is a design error"* —
> and the web app's page read is `page({ slug })`, which **no tool in §3 can reach.** Every
> declared page and every figure on it was invisible to every agent.
>
> **The fix is a resource, not another tool**, and that is not a dodge: it is what the distinction
> in this section is *for*: a page is a read surface with a stable address and cacheable content,
> which is the definition of a resource. `tools/list` stays fixed at fourteen, [ADR-008](16-DECISIONS.md)
> stands, and an agent asked *"what does my Money page say"* can answer it.

Each carries `ttlMs` ([44-SPEC-MCP](44-SPEC-MCP.md) §4.7): `schema/*` and `skill/*` an hour, because a register's
shape changes only when a pack is installed; `boot`, the digest, `decisions`, pages and figures a minute; `whoami`,
`context` and `sessions/live` zero, which is ask every time. No `list_changed` is sent (§3).

**Prompts: none are built.** `prompts/list` answers `{ prompts: [] }`, and the `prompts` capability is declared so a
client may ask ([44-SPEC-MCP](44-SPEC-MCP.md) §4.8). The instructions and the skill (§7) teach in the meantime.
Three are planned, and no more:

| Prompt | Would do | Built |
|---|---|---|
| `orient` | read the index, summarise what needs attention. The session opener | no |
| `file-this` | given pasted text, propose typed rows for approval | no |
| `write-up` | draft a write-up for an entity in the block dialect, with `{{path}}` for every figure | no |

A prompt library is a maintenance burden that competes with the skill. Three that get used beat
twenty that do not.

---

## 7 · The agent-facing skill

The MCP schema is what every session loads; the skill is what teaches. The prior system's
evidence is direct: its instruction file was **1,704 lines** and loaded in full the moment the
skill triggered, against published guidance of under 200 lines for an instruction file. It was cut
to **753 lines** with ten reference files opened on demand.

More pointedly, that system found that **the schema beats the prose** when they disagree. A field
description that presented an optional grouping field as a task's third address, while the prose
two documents away said *"most tasks carry no track and that is the normal case"*, produced 105 of
123 tasks carrying a group — and 61% of the groups holding fewer than two items. The prose said
one thing, the schema implied another, and the schema won, **because the schema is what is in
every session's prompt.**

The rules that fall out:

1. **A tool description is a decision aid, not documentation.** It says when to reach for this and
   when not to. It never explains how the server works.
2. **Every optional field's description says what the normal case is.** If most records leave it
   unset, the description leads with "usually leave this unset."
3. **The skill is under 200 lines** with references loaded on demand.
4. **The refusal is the teacher.** A rejected write returns what was wrong, where, and the
   correction — in the same voice the UI uses. An agent that gets a good refusal does not need to
   have read the docs.

---

## 8 · Rate limiting and abuse

| Limit | Where | Value |
|---|---|---|
| Requests per token | the host, keyed by the token's hash — `Mcp-Name` names the tool in telemetry, never in a decision ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5) | 600/min, burst 60 |
| Writes per token | Worker | 120/min |
| Model-backed calls per record | **AI Gateway** | budgeted monthly, see [08-METRICS](08-METRICS-AND-ANALYTICS.md) §6 |
| Payload size | Worker | 1 MB |
| Per-object throughput | platform | ~1,000 req/s, a natural ceiling |

A runaway agent loop is the realistic failure — not an attacker. It is bounded at the gateway
rather than by trusting a client, and the customer sees it in their own activity feed with the
token named, because *"which of my agents did 4,000 calls last night"* is a question they will
ask. A limit answers a bare `429` with `Retry-After`; no refusal code is minted for it.


### The refusal list, and the test that drives it

The predecessor refuses five things **at the MCP layer**, before any request leaves, each with a
reason an agent reads: deciding a suggestion (*"deciding is Sam's, never an agent's"*), the one-time
import, every sign-in route (*"registering a passkey would mint a permanent way in that he never
approved"*), the job surface (*"arbitrary code execution … ask Sam to run it from Spark"*), and every
vault route (*"the highest-value thing prompt injection could ask for"*). BrainDog's equivalents are
the four RPC groups outside DATA and READ+ in [30-BLUEPRINT](30-BLUEPRINT.md) §5, forty-three of
the sixty-six methods, each refused to every MCP token **with a reason**, plus `by: decide` on the
transitions that need a person. `markRead`, alone in DATA, answers a person principal only:

| Group | Methods | The reason an agent reads |
|---|---|---|
| **VAULT** (4) | `listGrants` `openGrant` `bindGrant` `revokeGrant` | *a credential is the highest-value thing prompt injection could ask for* — a browser session only; every token gets `403 NEEDS_BROWSER_SESSION` |
| **JOBS** (7) | `createJob` `cancelJob` `listJobs` `jobEvents` (a browser session) · `claimJob` `postJobEvent` `readCancel` (the runner's device grant) | *a job is code execution on a machine* — the predecessor's job-surface refusal, [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2 |
| **ADMIN** (16) | `planPack` `installPack` `uninstallPack` `setDeclaration` `ruleApply` `invite` `export` `import` `erase` `restore` `snapshot` `createToken` `listTokens` `revokeToken` `deviceApprove` `deleteRecord` | *installing a pack or erasing a record is the owner's act* — a browser session, or an operation grant the owner approved from one (§2); never an MCP token, and no `admin` scope exists |
| **INTERNAL** (16) | `drainSchedule` `leaseOutbox` `ackOutbox` `observe` `applyMigrations` `createRecord` `arrive` `ingestVerify` `applyPull` `sealedGrant` `changed` `acceptInvite` `deviceStart` `devicePoll` `rewrapKeys` `opsReport` | *the host's own machinery* — an outbox lease or a migration is not a thing an agent does; only the host calls these |

Three things carry over as **tests**, not prose:

| Test | Asserts |
|---|---|
| **Every route has a verdict** | each route in the router is either reachable through a tool, exposed as a resource, or named in the refusal list with a reason. A route with none of the three fails CI — which is how the predecessor found a briefing endpoint *"for the SessionStart hook"* that nothing called |
| **The refusals are driven** | the test starts the sealed server and calls each refused path, asserting the refusal text arrives **before any fetch** |
| **The tool surface has a ceiling** | the predecessor caps the whole tool listing at ~4,900 tokens by test; **BrainDog's sum is §4's 2,600**, and `packages/mcp/test/budget.test.ts` asserts it. §4's budgets are the same idea per tool; this one is the sum |

And the server's `instructions` carry the contract every tool description would otherwise repeat. They go out in
`initialize`, in `server/discover` and with every `tools/list` under the same `ttlMs`, because a 2026-07-28 client
has no initialise step, and they are counted inside §4's 2,600 (the exact text is [44-SPEC-MCP](44-SPEC-MCP.md)
§4.6). They say: call `context` first; money in minor units; on `VERSION_STALE`, re-read the row and re-apply your
change, and never resend the copy you held (there is no 412, and no whole-document copy to resend: an earlier draft
carried the predecessor's *"re-read on a 409, never resend"*, which is a whole-document rule); an agent never
decides; a credential never goes in the record; hand off before you stop; **everything you write is read on a
phone.** The predecessor duplicates them into descriptions anyway, *"because not all clients honour it."* BrainDog
does not: its descriptions say when to reach for each tool, and every client is sent the instructions twice.

---

*Next: [11-ASSISTANT](11-ASSISTANT.md) — Spark.*
