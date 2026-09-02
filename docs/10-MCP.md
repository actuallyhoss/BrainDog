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
| **`Mcp-Method` and `Mcp-Name` HTTP headers** | Auth and rate limiting happen at the edge on headers, without parsing a JSON body. A per-tool rate limit becomes a WAF rule |
| **`ttlMs` and `cacheScope` on `tools/list`, `prompts/list`, `resources/list`, `resources/read`** | The tool list is cached by the client. This is the single biggest lever on context cost — see §4 |
| **Multi Round-Trip Requests (MRTR)**: a server returns `resultType: "input_required"`, the client retries with `inputResponses` | **The decision gate becomes protocol-native.** See §5 — this is the most important item in this document |
| **DCR deprecated in favour of Client ID Metadata Documents; `iss` per RFC 9207; issuer-bound credentials; `application_type`** | Standard OAuth 2.1 resource-server behaviour, and desktop/CLI clients on localhost redirects finally work |
| **Roots, Sampling and Logging deprecated** (12-month minimum support) | Do not build on them. Sampling in particular was the tempting way to have the client's model do our inference; it is going away |

The legacy HTTP+SSE transport has a one-year offramp. BrainDog ships **streamable HTTP only** and
does not carry a compatibility layer for a transport that is being retired — with one permitted
exception, stated in [17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q7 and [ADR-054](16-DECISIONS.md): a
stateless one-day shim for a named client whose software is still on HTTP+SSE at build time, removed
at the offramp date. The endpoint is `POST /mcp`; the handler is `createMcpHandler(api, decls)` over
the `DataApi` envelopes — hand-rolled JSON-RPC, zero dependencies ([33-CONTRACTS](33-CONTRACTS.md)
§2, §4).

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
`admin` scope, ever** — the ADMIN and VAULT groups are a browser session only
([ADR-060](16-DECISIONS.md)), and a bearer at one of their routes gets `403 NEEDS_BROWSER_SESSION`.

---

## 3 · The tool surface is DYNAMIC and per-customer

A customer's tools are generated from *their* installed packs. A freelancer with `money-core` and
`freelancer-uk` gets different tools from a studio with `products` and `people`.

### The generation rule

Tools are **not** one per register — that is the naive design and it produces 40 tools nobody can
choose between. Instead:

| Tool | Shape | Count |
|---|---|---|
| `record_index` | the orientation call. Registers, counts, open questions, what changed | 1 |
| `search` | FTS5 + vector over everything the token can read | 1 |
| `get` | fetch one row: `{ spoken }` \| `{ register, seq }` \| `{ id }`, plus an optional `path` into it | 1 |
| `list` | a register plus a `where:` and a projection | 1 |
| `create` / `update` | typed writes against a named register; `update` carries the row's `version` and a client `op_id` | 2 |
| `propose` | open a suggestion with options. **The only way an agent affects a decision** | 1 |
| `log` | append one audit event — kind `note`, one sentence, target optional | 1 |
| **Per-register schemas** | delivered as **resources**, not tools | *n* |

**Eight tools, fixed, regardless of how many registers a customer has.** (An earlier draft said nine and enumerated eight — the ninth row of the table is *resources*, which are deliberately not tools.) The variability lives in
the *arguments* — `list(register: "obligations", where: {…})` — and the register schemas are
fetched as resources when needed.

**One method, two names, said once:** the tool `record_index` calls the RPC method `index()` of the
DATA group in [30-BLUEPRINT](30-BLUEPRINT.md) §5 — the tool name carries the noun because a bare
`index` reads as a verb in a tool list. The other seven tools share their method's name. Every
method takes `(args, ctx)` and returns the `Result<T>` envelope of [33-CONTRACTS](33-CONTRACTS.md)
§2; over HTTP a refusal is `422 { refusals }` and a conflict is `409 { conflict }`.

This is the central design decision of the MCP surface and it exists because of §4.

### `tools/list_changed`

Emitted on pack install, uninstall or upgrade. The eight tools do not change, but their
*descriptions* embed the customer's register list, and that list does. A client that cached the
tool list gets told to refetch rather than calling `list(register: "invoices")` against a record
that no longer has one.

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

**1 · Eight tools, not forty.** A tool per register would put every customer's entire schema in
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
point: an agent that needs a figure asks for the figure.

**3 · `ttlMs` on every list.** `tools/list` gets `ttlMs: 3600000` and `cacheScope: "record"`.
Combined with `tools/list_changed` on install, the client refetches when something actually
changed and not otherwise. This also keeps the client's *upstream prompt cache* stable across
reconnects, which the 2026-07-28 spec calls out explicitly as a goal of the field.

### Measured budget targets

| Item | Target | Why |
|---|---|---|
| `tools/list` total | **< 1,800 tokens** | it is in every turn of every session |
| One tool description | < 200 tokens | forces the description to say when to use it, not how it works |
| `record_index` response | < 500 tokens | the first call of every session |
| A `list` response, default page | < 2,000 tokens | 25 rows, projected, not whole documents |
| A `get` on a document row | full | if you asked for the document, you want the document |

These are asserted in CI by counting tokens on a fixture record. A budget nobody measures is a
budget that drifts.


### Three read levels, and a scope

The predecessor's whole-record read has three levels and the cheapest is the default:
**index** (~700–1,300 tokens: one line per entity plus counts and open questions), **digest**
(~27,000: every write-up collapsed to a word count except the project the caller is inside), and
**full with a path** — full *without* a path is refused, because *"it spends the whole budget to
learn nothing."* `record_index` is the first; `get` with a path is the third; **the digest is now a
named projection**, `record_index({ level: 'digest' })`, so an agent that needs the shape of every
register in one call can have it without paying for every document.

And a **scope**: `record_index({ scope: { repo: 'crumb-bot' } })` resolves through any register with a
`repos` list — a `has:` lookup on a `list<text>` field, not a `via:` hop — so a session can ask *"what is true about the project I am standing
in"* with the one thing it already knows about itself. The predecessor sends this on every call as a
header; here it rides in `_meta` with the session id.

### `boot`, and the read mark

`boot()` — a READ+ method and a resource — returns the index, the live sessions, the open suggestions
and `whatsNew` since the caller's read mark, **in one round trip.** It is what a hook prints at
session start, and it is what the web app opens with. The read mark is one value per person, written
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
| `dialect` | the block dialect: **sixteen** kinds, one line each ([34-GRAMMARS](34-GRAMMARS.md) §2). The writing guide |
| `whats-new` | events since a given cursor. The cheap way to catch up |
| `decisions` | the decision log, ids and answers |
| `digest/today` | what the scheduler would have said |
| **`page/<slug>`** | a declared page, **resolved against live rows** — the same projection the web app renders, as data rather than HTML |
| **`metric/<id>`** | one metric's value, target, window, delta and the row count behind it |
| **`sessions/live`** | who else is working, on what, and **`same_repo`** — the list the SessionStart hook prints with *"two sessions in one working tree overwrite each other. Coordinate or stop."* |
| **`learnings/for/<repo>`** | what earlier sessions worked out, ordered **method → fact, global → scoped, newest within each**, forty by default with `truncated` set honestly. The description carries the four-part test for what qualifies, because it is the thing agents most often get wrong |
| **`boot`** | the first-screen read: index, live sessions, open suggestions, and everything since the read mark — one call |

**Every resource is backed by a method**, so [ADR-018](16-DECISIONS.md)'s rule holds by
construction: `schema` `dialect` `whats-new` `digest/today` `page` `metric` `sessions/live`
`learnings/for` and `boot` are the READ+ methods `schema(register)` `dialect()` `whatsNew(cursor)`
`digestToday()` `page(slug)` `metric(id)` `sessionsLive()` `learningsFor(repo)` `boot()` of
[30-BLUEPRINT](30-BLUEPRINT.md) §5; `decisions` alone is `list(decision)` under DATA. A resource
with no method behind it is a design error.

> **The last two close a hole [ADR-018](16-DECISIONS.md) would otherwise have called a design
> error.** Its rule is *"any screen that needs an endpoint no agent can call is a design error"* —
> and the web app's page render is `GET /api/pages/:slug`, which **no tool in §3 can reach.** Every
> declared page and every figure on it was invisible to every agent.
>
> **The fix is a resource, not a ninth tool**, and that is not a dodge — it is what the distinction
> in this section is *for*: a page is a read surface with a stable address and cacheable content,
> which is the definition of a resource. `tools/list` stays at eight, [ADR-008](16-DECISIONS.md)
> stands, and an agent asked *"what does my Money page say"* can answer it.

All carry `ttlMs`. `schema/*` is effectively static between pack installs, so it caches for an
hour and invalidates on `list_changed`.

**Prompts** are three, and no more:

| Prompt | Does |
|---|---|
| `orient` | read the index, summarise what needs attention. The session opener |
| `file-this` | given pasted text, propose typed rows for approval |
| `write-up` | draft a write-up for an entity in the block dialect, with `{{path}}` for every figure |

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
| Requests per token | Worker, on `Mcp-Name` | 600/min, burst 60 |
| Writes per token | Worker | 120/min |
| Model-backed calls per record | **AI Gateway** | budgeted monthly, see [08-METRICS](08-METRICS-AND-ANALYTICS.md) §6 |
| Payload size | Worker | 1 MB |
| Per-object throughput | platform | ~1,000 req/s, a natural ceiling |

A runaway agent loop is the realistic failure — not an attacker. It is bounded at the gateway
rather than by trusting a client, and the customer sees it in their own activity feed with the
token named, because *"which of my agents did 4,000 calls last night"* is a question they will
ask.


### The refusal list, and the test that drives it

The predecessor refuses five things **at the MCP layer**, before any request leaves, each with a
reason an agent reads: deciding a suggestion (*"deciding is Sam's, never an agent's"*), the one-time
import, every sign-in route (*"registering a passkey would mint a permanent way in that he never
approved"*), the job surface (*"arbitrary code execution … ask Sam to run it from Spark"*), and every
vault route (*"the highest-value thing prompt injection could ask for"*). BrainDog's equivalents are
three RPC groups in [30-BLUEPRINT](30-BLUEPRINT.md) §5, each refused to every MCP token **with a
reason**, plus `by: decide` on the transitions that need a person:

| Group | Methods | The reason an agent reads |
|---|---|---|
| **VAULT** | `listGrants` `openGrant` `bindGrant` `revokeGrant` | *a credential is the highest-value thing prompt injection could ask for* — a browser session only; every token gets `403 NEEDS_BROWSER_SESSION` |
| **JOBS** | `createJob` `cancelJob` `listJobs` (a browser session) · `claimJob` `postJobEvent` `readCancel` (the runner's device grant) | *a job is code execution on a machine* — the predecessor's job-surface refusal, [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2 |
| **ADMIN** | `planPack` `installPack` `uninstallPack` `setDeclaration` `invite` `export` `import` `erase` `restore` | *installing a pack or erasing a record is the owner's act* — a browser session only; no `admin` token exists |

Three things carry over as **tests**, not prose:

| Test | Asserts |
|---|---|
| **Every route has a verdict** | each route in the router is either reachable through a tool, exposed as a resource, or named in the refusal list with a reason. A route with none of the three fails CI — which is how the predecessor found a briefing endpoint *"for the SessionStart hook"* that nothing called |
| **The refusals are driven** | the test starts the sealed server and calls each refused path, asserting the refusal text arrives **before any fetch** |
| **The tool surface has a ceiling** | the predecessor caps the whole tool listing at ~4,900 tokens by test; **BrainDog's sum is §4's 1,800**, and this test asserts that number. §4's budgets are the same idea per tool; this one is the sum |

And the server's `instructions` — returned with every `tools/list` under the same `ttlMs`, since
2026-07-28 has no initialise step — ~300 tokens — carry the contract every tool description would
otherwise repeat: minor units; **on a 409, re-read the row and re-apply — the body names who changed
it** (there is no 412, and there is no whole-document copy to resend: an earlier draft carried the
predecessor's *"re-read on a 409, never resend"*, which is a whole-document CAS rule); a credential
never goes in the record; log every material change as one sentence a human reads in six weeks;
**everything you write, he reads on a phone.** The predecessor duplicates them into descriptions
anyway, *"because not all clients honour it."* So does BrainDog.

---

*Next: [11-ASSISTANT](11-ASSISTANT.md) — Spark.*
