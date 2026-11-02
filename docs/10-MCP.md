# 10 · MCP: the agent surface

The reason this product exists rather than a notes app: **every agent, the same rows.** No vendor
will build the screen showing what you pay its competitors, and a memory store that mounts inside
one vendor's sandbox cannot be the place all of them write.

Built against the **2026-07-28 MCP specification**, which changed enough to matter.

---

## 1 · What the 2026-07-28 spec changed, and why each change helps

| Change | Consequence for BrainDog |
|---|---|
| **`initialize`/`initialized` handshake removed; no `Mcp-Session-Id`** | Every request is self-contained, carrying protocol version, client identity and capabilities in `_meta`. The server is genuinely stateless, so it is just the Worker, with no session store and no sticky routing |
| **`Mcp-Method` and `Mcp-Name` HTTP headers** | The headers must equal the body, so the edge's telemetry names the tool without parsing JSON. The rate limit itself keys on the token, never on a header (§8) |
| **`ttlMs` and `cacheScope` on `tools/list`, `prompts/list`, `resources/list`, `resources/read`**, as top-level fields of the result | The tool list is cached by the client. This is the single biggest lever on context cost; see §4 |
| **Multi Round-Trip Requests (MRTR)**: a server returns `resultType: "input_required"`, the client retries with `inputResponses` | **The decision gate could become protocol-native.** See §5: what is built is the `decide` link on every filed question, and the input-required answer waits behind a switch until a client's capability for it can be confirmed |
| **DCR deprecated in favour of Client ID Metadata Documents; `iss` per RFC 9207; issuer-bound credentials; `application_type`** | Standard OAuth 2.1 resource-server behaviour, and desktop/CLI clients on localhost redirects finally work. BrainDog accepts a metadata document and still registers a client that brings none, because not every client ships one (§2) |
| **Roots, Sampling and Logging deprecated** (12-month minimum support) | Do not build on them. Sampling in particular was the tempting way to have the client's model do our inference; it is going away |

The legacy HTTP+SSE transport has a one-year offramp. BrainDog ships **streamable HTTP only** and
does not carry a compatibility layer for a transport that is being retired, with one permitted
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

BrainDog is an OAuth 2.1 **resource server and its own authorization server**, so any MCP client
connects by the URL `https://app.brain.dog/mcp` and a person's yes. Every token is an ordinary agent
token, whichever way it was made.

**Two ways to hold a token.** An agent token is a bearer, scoped, revocable, and shown once. It is
made in the app, or by `braindog login` through the device grant, which is the path for a headless
session in a repo on a machine with no browser; or it is made by OAuth, below, for a client that
connects by URL. Both land in the same list under Settings, Agents, and revoking one there stops it.

A machine that runs Claude Code needs two lines, the install and then `setup`, which signs in by the device grant,
adds the hooks and, with them, the Agent Skill, and registers `braindog mcp` ([48-SPEC-CLI](48-SPEC-CLI.md) §5.15):

```sh
curl -fsSL https://brain.dog/cli/install.sh | sh     # macOS and Linux; on Windows: irm https://brain.dog/cli/install.ps1 | iex
braindog setup https://app.brain.dog/<slug>
```

**OAuth, as built** (`packages/host/src/oauth.ts`, the protocol; `packages/record/src/oauth.ts`, its
store on the Directory's SQL; `apps/worker/src/oauth.ts`, the Cloud's wiring; `apps/selfhost/src/oauth.ts`, the
self-host's). The Cloud serves all of it. A self-host serves it too, on the origin it serves the app from, wherever
somebody can sign in to it from a browser; an issuer at an `http:` address is allowed only while the process listens on
loopback alone (`BRAINDOG_HOST=127.0.0.1`), and then each loopback name `/mcp` answers by is named as the resource when
it is the one a client reached.

- `POST /mcp` without a bearer answers 401 with
  `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource"`.
  That document (RFC 9728, also at `/.well-known/oauth-protected-resource/mcp`) names the resource
  and this host as its authorization server; `/.well-known/oauth-authorization-server` (RFC 8414)
  names the endpoints.
- A client is public, never given a secret, and proves itself with PKCE (`S256` only). It registers
  at `POST /oauth/register` (RFC 7591), or its `client_id` is an `https:` address serving a **Client
  ID Metadata Document**, read at most once a day. A redirect address is `https:`, or `http:` on
  `127.0.0.1` or `localhost` at any port (RFC 8252).
- `GET /oauth/authorize` checks the client and its redirect address, answering anything wrong with
  either on a BrainDog page and never at the client's address, then holds the request ten minutes and
  sends the browser to the consent screen. On the Cloud that is the app's own `/connect`
  (`CONSENT_AT` in `apps/worker/src/oauth.ts`), and the Worker keeps a plain page at `/oauth/consent`
  as its fallback; a self-host serves that plain page. `GET /oauth/request?request=<id>` is that screen's read of
  it: the client's name, its redirect host, and the scopes it may be given.
- The person allows it (`POST /oauth/approve`) from a browser signed in within the last fifteen
  minutes, as a machine's six digits are approved. The token is minted by the record's own
  `createToken`, as that person and so only by an owner, labelled with the client's name, for ninety
  days, and sealed under a one-time code that lives sixty seconds. `POST /oauth/deny` answers the
  client `access_denied`.
- `POST /oauth/token` trades the code and its verifier for `{ access_token, token_type: 'Bearer',
  expires_in, scope }`. A code is spent by being asked for, so a second use fails. Every redirect
  carries `iss` (RFC 9207). The access token is a one-hour child key of the token Allow made, which
  stays sealed and is never sent; the app also gets a refresh token, good ninety days from its last
  use, and each refresh mints a new one-hour child while that token still works. Removing the app in
  Settings revokes it, every child with it, and the next refresh answers `invalid_grant`.
- Errors at `/oauth/*` are OAuth's own `{ error, error_description }`. `/oauth/register` and
  `/oauth/authorize` are counted per address in the Directory's lockout table and answer 429 with
  `Retry-After` past the limit.

**Every token is scoped to one record.** There is no token that reaches two records, because
there is no code path that reaches two records: the object boundary is the security boundary.

Token scopes are coarse on purpose: `read`, `propose`, `write`. Not per-register. A capability
matrix nobody can reason about is a capability matrix that gets set to "all". **There is no
`admin` scope, ever.** KEYCHAIN is a browser session only. ADMIN is a browser session, or a bearer
carrying an **operation grant**: one named operation the owner approved from a browser session after
seeing its summary, single-use, ten minutes, reaching exactly that method once
([12-SECURITY](12-SECURITY.md) §3, [ADR-060](16-DECISIONS.md)). A bearer at either group's routes
without one gets `403 NEEDS_BROWSER_SESSION`; over MCP every token is refused (§8).

---

## 3 · The tool surface is DYNAMIC and per-customer

A customer's registers come from *their* installed packs and from what they and their agents added
at run time. A freelancer with `money-core` and `freelancer-uk` has
different registers from a studio with `products` and `people`, and the same sixteen tools reach all of them.

### The generation rule

Tools are **not** one per register. That is the naive design, and it produces 40 tools nobody can choose between.
Instead:

| Tool | Shape | Count |
|---|---|---|
| `record_index` | the cheap orientation call: registers, counts and the version | 1 |
| `context` | the briefing for where the session stands: its project, open work, questions waiting on the person, people, the keys and servers it may use by name, skills and learnings, and everything global | 1 |
| `schema` / `history` | a register's fields, read before a write; the writes that made one row | 2 |
| `get` | one row, by the id a person says: `obligations#41`, a prefixed id such as `S42` or `LN7`, or the row id a ref field holds. A script or an automation by its id or whole title, with dashes, spaces and case read as the id's underscores (`packages/mcp/src/scripts.ts`), with its runs and the rules that start it. A lone search hit answered for a name nothing has opens "Nothing is called X; search found this one:" | 1 |
| `list` | a register plus a `where:` tree, a limit and a cursor. `scripts` and `automations` (or `rules`), where the record has no list of that name, answer a line each. A register named by one word of one list's name is refused with that list as `try` | 1 |
| `search` | FTS5 over everything the token can read, with how many matched, and a sentence when fewer came back than that | 1 |
| `activity` | the record's whole log lately, newest first: each write, the row it touched and who made it, for a session picking up after another | 1 |
| `governance` | what was proposed, decided and predicted | 1 |
| `propose` | open a suggestion with options. **The only way an agent affects a decision**, and the way it asks to change what it may not change itself. A rule change comes back with its dry run, and a script change sent with `"try"` is run once and filed nowhere | 1 |
| `create` / `update` | typed writes against a named register; `update` carries the row's `version`, and either may carry an `op_id`, so a write sent again after a lost answer is one entry | 2 |
| `log` | one note on a row, changing nothing about it | 1 |
| `handoff` | keep the session's next step and its dead ends true | 1 |
| `meet` | a person met in the work, matched or added, with where they were met | 1 |
| `triage` | one arrival from the inbox filed as a row, or set aside | 1 |
| `undo` | put back one of your own writes, by the batch its receipt gave; anyone else's is refused. `dry` shows what would go back and changes nothing | 1 |
| **Per-register schemas, pages, figures, skills** | delivered as **resources**, not tools | *n* |

**Sixteen tools, fixed, regardless of how many registers a customer has.** The variability lives in the
*arguments*, as in `list(register: "obligations", where: {...})`, and in the resources, which are fetched when
needed. Fourteen and not the eight an earlier revision named, because the agent path added three things every
session does: `context`, `handoff` and `meet`. Five went to pay for them: `pages`, `page` and
`metric` are resources, `credentials` could never answer a token, and `dry_run` left the list, to come back later on
`propose`'s answer for a rule change. Then two joined, and each was paid for inside the same ceiling by cutting
descriptions that said twice what their schema or the instructions already say: `activity`, because `history` takes a
row and an agent picking up after another session does not yet know which row, and `money`, because "how am I doing
this month" had no verb, and an agent adding rows up itself is an agent that will add two currencies together
([44-SPEC-MCP](44-SPEC-MCP.md) §4.4). `money` left again, its figures read through `get` and `record_index` for any
pack, and `triage` joined, the one tool the ceiling was raised for. `understand` joined as a seventeenth and is the
address `braindog:understand` now (§6), so the list stays where it was, and what it freed pays for `op_id` on the two
writes. `undo` then joined as the seventeenth, the way back for every receipt (§3). The command line sends a create or an update once more, with the same `op_id`, when the host's answer was
lost, and the record answers the second sending with the first one's row.

**What was asked for as a tool and went elsewhere.** A dry run of an automation and a trial of a draft script both
cost more tokens than the ceiling had left (the smallest `script_try` tool measured 102 against 3). So both ride on
`propose`: a rule change is filed and answered with `dry_run`, what would start it and what each step would do; a
script change whose body also says `"try"` is run once in the host's sandbox and answered with the writes it would
make, filed nowhere and asked of nobody. The grammars that teach both are resources (§6).

**Trying a change before it is filed.** `propose` with `"try"` beside `to` files nothing and answers what the
change would do, `proposed: false`, in the record's own words; the agent sends it again without `try` to put it in
front of the owner. A page is answered `page_preview`, the record's `previewPage`; a script `script_try`; a rule
`automation_try`. Anything else, a bundle `{ declarations: [...] }` or one list or figure, is answered
`change_preview`, the record's `previewChange` ([33-CONTRACTS](33-CONTRACTS.md) §2): the whole change installed in
the record's rehearsal, over sample rows when `"try": { "rows": { "<list>": [ { ... } ] }, "about": "<list>#<n>" }`
brings them, every page it makes drawn as `page` would draw it, a page per row filled over the row `about` names or
the first there is, and every write rolled back before it answers. A bundle is tried as one call, so the pages of a
change that brings its own lists are seen holding rows before anything is filed. None of it is a tool, so the list
costs what it did.

**What each reaches, said once:** `record_index` reads `boot()` and `version()`, `log` is `update` with an empty
patch, `activity` reads `recentHistory()`, `propose` may add
`dryRun()` or, with `try`, call `previewPage()`, `scriptTry()`, `tryAutomation()` or `previewChange()` instead, and
every other tool shares its method's name
([30-BLUEPRINT](30-BLUEPRINT.md) §5). The tools reshape an answer only to address it: a row comes back compact, as
`{ spoken, version, state, fields }` with the id `context` uses, and a list of questions comes back without bodies. Every method takes
`(args, ctx)` and returns the `Result<T>` envelope of [33-CONTRACTS](33-CONTRACTS.md) §2. Over HTTP a refusal is
`422 { refusals }` and a conflict is `409 { conflict }`. Over MCP a refusal is an error result carrying the refusal
whole, `code`, `fix` and `allowed`, and a conflict is `VERSION_STALE` with the current row and who changed it. A
message the protocol cannot read gets one of JSON-RPC's numbers, which are a vocabulary and not refusal codes
([30-BLUEPRINT](30-BLUEPRINT.md) §6).

This is the central design decision of the MCP surface and it exists because of §4.

### `tools/list_changed`

Not pushed, and not needed for the tools: the server is stateless, the sixteen do not change on an install (they are cut to the caller, §9), and no
tool description names a register. A register added or removed is seen through `record_index`, `context` and
`resources/list`, and a client holding a stale register name is answered `REGISTER_UNKNOWN` with the registers there
are in `allowed` ([44-SPEC-MCP](44-SPEC-MCP.md) §5.6).

---

### Receipts, the way back, and hints

Every write answers with a **receipt**: its first line as it was said in names, then the call that takes it back, as in *Receipt: Added Invoice 12. To undo, call undo with batch "..."*, kept whole in `structuredContent.receipt`. The text says the first line once, so its receipt line is the call alone: *Receipt: To undo, call undo with batch "..."*. The `batch` is an opaque handle and no credential is ever in a receipt. A write that made no batch says so rather than offering an undo that would fail, and a `propose` points to its `withdraw` instead. `create`, `update`, `log`, `triage`, `handoff`, `propose` and `meet` carry one; `undo` does not, being the way back itself.

**`undo({ batch, dry? })`** puts back one write made by the caller's own run. It is refused for anyone else's writes, and the owner's Undo in the app stays the owner's. It deletes nothing it did not make, so it is not marked destructive. A surface whose record has no `undoOwn` answers that the owner can put it back from the app.

**Every tool says its hints.** A missing hint is read as the worst: destructive and open to the world. So `tools/list` carries `readOnlyHint` on every tool, true for a read and false for a write, and a write also says `destructiveHint` and `idempotentHint`; `openWorldHint` is false on all of them, since none reaches past the record. `update` overwrites a value and says so.

**Cards.** `get` and `governance` carry a card for hosts that draw one: a project card and a decision card, with a rule card as well, as MCP Apps resources at `ui://braindog/project.html`, `decision.html` and `rule.html`, and the same pages under `.skybridge.html` for ChatGPT. The tool list names them in `_meta`, the page draws only what the tool answered, and a button on it is only ever a press the person made. A host that draws nothing, Claude Code among them, still gets every fact in the tool's text lines.

## 4 · The token budget, which is the real design constraint

An MCP server's tool definitions sit in the model's context on **every single turn**. A verbose
server is a permanent tax on every conversation the customer has, in every client, forever.

This is measured rather than assumed, because there is direct evidence from a comparable system:
a prior MCP server for a similar record shipped a digest response of **~27,000 tokens** and an
index response of **~1,300 tokens** for the same orientation job. The digest was the default. The
fix was making the index the default: a **95% reduction** in the cost of the first call of every
session, with no loss of capability, because the index says what to ask for next.

Three rules follow, and they are the difference between an MCP server agents keep and one they
disable.

**1 · Sixteen tools, not forty.** A tool per register would put every customer's entire schema in
every context window. Registers are arguments; schemas are resources fetched on demand.

**2 · Progressive disclosure, by contract.** Every response ends with what to ask for next. This is the design:

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

~350 tokens. It is enough to orient and deliberately not enough to quote from, which is the
point: an agent that needs a figure asks for the figure.

**What is built is less than that.** `record_index` answers `{ record, registers, version }`, where each register is
`{ id, name, count }`: 256 tokens over the seed's sixteen registers ([44-SPEC-MCP](44-SPEC-MCP.md) §7). There is no
`open` count, no per-register figure such as `renewing_30d`, no `open_questions`, no `changed_since_your_last_call`
and no `next` on it. The open questions are `context`'s `waiting` and the `braindog:decisions` resource, and what
changed is the `activity` tool. Of the tools, `context` alone ends with a `next`, and `search` says `more` when fewer
rows came back than matched, whether its `limit` or the record's cap of a hundred cut them; the rest end where the
record's answer ends.

**3 · `ttlMs` on every list.** `tools/list` gets `ttlMs: 3600000` and `cacheScope: "private"`, the scope for
anything a record answers; `server/discover` alone is `"public"`, because it reads nothing and is the same for every
caller ([44-SPEC-MCP](44-SPEC-MCP.md) §4.3). The sixteen do not change on an install (they are cut to the caller, §9) and no tool description names a
register (§3), so a client holds the list for its hour without holding anything stale. This also keeps the client's
*upstream prompt cache* stable across reconnects, which the 2026-07-28 spec calls out explicitly as a goal of the
field.

### Measured budget targets

| Item | Target | Why |
|---|---|---|
| `tools/list` total, `instructions` included | **≤ 2,760 tokens**, raised once from 2,600 for `triage` | it is in every turn of every session. 1,800 was set for eight tools; the agent path needs fourteen, `activity` joined inside 2,600, and `triage` is the one tool the ceiling was raised for ([44-SPEC-MCP](44-SPEC-MCP.md) §7) |
| One tool description | < 200 tokens, measured at 12 to 60 | forces the description to say when to use it, not how it works |
| `record_index` response | < 500 tokens, measured at 450 on the seed once it learned figures ([44-SPEC-MCP](44-SPEC-MCP.md) §7) | the first call of every session |
| A `list` response, default page | < 2,000 tokens, **met on the Work list**: 1,728 for twenty seeded tasks; 2,287 for twenty `obligations`, which is over | the target was set for 25 rows, projected, not whole documents. The tool sends `limit: 20` when a call names none, and a `list` row leaves out `updated_at` and empty fields and cuts long text at 280 characters with `clipped: true` unless `fields` names it ([44-SPEC-MCP](44-SPEC-MCP.md) §7). A register of rows as dense as `obligations` wants a smaller `limit` from the agent |
| A `get` on a document row | full | if you asked for the document, you want the document |

The first two are asserted by `packages/mcp/test/budget.test.ts` with `tokenBudget`
([44-SPEC-MCP](44-SPEC-MCP.md) §5.8), over the tool list exactly as it is sent, under the ceiling `CEILING` names. The other
three are targets for the record's answers, which the tools relay made compact; they were measured once, over a real
record with the seed's declarations, and no test holds them. A budget nobody measures is a budget that drifts, and the
`list` row is the one that did.


### Three read levels, and a scope

The predecessor's whole-record read has three levels and the cheapest is the default:
**index** (~700 to 1,300 tokens: one line per entity plus counts and open questions), **digest**
(~27,000: every write-up collapsed to a word count except the project the caller is inside), and
**full with a path**. Full *without* a path is refused, because *"it spends the whole budget to
learn nothing."* `record_index` is the first; `get` with a path is the third. The digest as a named projection,
`record_index({ level: 'digest' })`, is **not built**: `record_index` takes no arguments and answers the index
whatever it is sent.

And a **scope**, which is `context`'s. A session is placed in a project by its remote, its folder or its
repository's name, matched against the one register that declares `scopes:` and lists each project's `repos` and
`folders`, so it can ask *"what is true about the project I am standing in"* with the one thing it already knows
about itself. The predecessor sends this on every call as a header. Here the command line sends it as the session
headers, and an HTTP client sends it in `_meta.session` ([44-SPEC-MCP](44-SPEC-MCP.md) §4.2).

An agent with no folder has none of the three. Claude.ai, ChatGPT and any remote client say instead what the person
is working on, as `context`'s `topic` on their first call: "Kiln works". That places the run in the project of that
name, or, on a record with no project yet, in the first project formed from it as a draft the person keeps with one
press. One with no folder and no topic is asked, in one line of the answer, to find out
([44-SPEC-MCP](44-SPEC-MCP.md) §15.3).

### `boot`, and the read mark

`boot()`, a READ+ method and a resource, returns the index, the live sessions and the open
suggestions, **in one round trip.** It is what the web app opens with, and at 34 kilobytes on the seeded record (as measured in
`packages/mcp/src/index.ts`) it is too big to be an agent's first call, so `record_index` answers only its registers. `whatsNew` since the caller's
read mark is its own call for now, and a session's hook prints `context`, which says where the session
stands ([44-SPEC-MCP](44-SPEC-MCP.md) §4.7). The read mark is one value per person, written
with `MAX()`, stored outside the record's rows ([30-BLUEPRINT](30-BLUEPRINT.md) §1), so a late
device never moves it back and a read is never a write.

---

## 5 · MRTR: the decision gate becomes protocol-native

This is the most consequential find in this research pass.

**As built: the link, and the shape behind a switch.** `propose` answers like every other tool, with the
suggestion's id and a `decide` link, `<origin>/<slug>/decide/<id>`, the address where the person answers that
one question, so an agent can hand it on in its own reply (`decideAt` in `packages/mcp/src/index.ts`). A transport
that does not hand the core its origin answers without the link. The input-required answer is written in `rpc.ts`
and held off by `const MRTR = false`, because the client capability the revision names for it could not be confirmed
from the specification's own text; the day it is, the switch turns true for a client that declares it, and for no
other. A `propose` that carries `inputResponses` is refused `LEVEL_REQUIRED` before anything is filed, because
whatever a client collected in its own window is not the person's decision on this record: deciding stays a
person's act in the app ([ADR-060](16-DECISIONS.md)). No write is turned into a question inside the call. What
follows is the design, kept for the day a person can reach MCP ([44-SPEC-MCP](44-SPEC-MCP.md) §5.7, D8).

The product's differentiator is that an agent lays out options and **never chooses**; a human
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
             {id:"keep",   label:"Keep it",    because:"the shop's worker is on this plan"}
           ],
           requires_reason: true
         }]

human sees this in their own client, chooses, types a reason

agent → update(…, inputResponses:[{id:"keep", reason:"the shop still deploys weekly"}])

server ← { ok:false, decided:"D42", reason_recorded:true }
```

The write did not happen, a decision row did, and the reason is in the record. **The gate is
enforced by the server, so it holds regardless of which client or model is on the other end**,
which is exactly the property a governance mechanism needs, and the thing a client-side
"confirm?" prompt can never provide.

The counter-pressure worth recording: the runtime ecosystem is moving the other way: auto-approve
modes replaced human approval with a classifier and became default. BrainDog's position is that
for *money, cancellations and credentials* the human stays in the loop, and MRTR is now the
standards-track way to do it.

---

## 6 · Resources and prompts

**Resources** are the read surface that does not belong in a tool. What is built is what `packages/mcp/src/index.ts`
lists: the fixed addresses of `RESOURCES` and the templates of `TEMPLATES`, which a client fills in itself.

| Resource | Contents |
|---|---|
| `schema/<register>` | the field list, types, validation. Fetched when an agent is about to write |
| `decisions` | what has been proposed and not yet answered: the open suggestions |
| **`inbox`**, **`inbox/<state>`** | what arrived and nothing filed yet, newest first, with how many arrivals are in each state; the template reads one state, and `skipped` is where a wrong skip rule shows. `triage` files one |
| `digest/today` | what the scheduler would have said |
| **`page/<slug>`** | a declared page, **resolved against live rows**: the same projection the web app renders, as data rather than HTML |
| **`metric/<id>`** | one metric's value, target, window, delta and the row count behind it |
| **`sessions/live`** | who else is working, on what, and **`same_repo`**: the list the SessionStart hook prints with *"two sessions in one working tree overwrite each other. Coordinate or stop."* |
| **`context`** | where the session stands, in one call: its run and project, the last handoff there, who else is live, what waits on the person, and every register with a scope field, the project's rows first and then the global ones the nearer scope leaves. Learnings, skills and keys arrive this way, keys by name only, and `truncated` is set honestly. It is the briefing `attach` returns and the start hook prints, with the same `teach` sentences the tool adds; `ttlMs` 0 |
| **`boot`** | the first-screen read: the registers the caller may read with their row counts, the record's `now`, the live runs and the open suggestions, in one call |
| **`understand`** | what the record would link to who and what each thing is about, and what it would ask, in names. Read before meeting anyone; `ttlMs` a minute. It was a tool once, and is a resource now |
| **`whoami`** | who this token is, its scope and its record, which is what a new session reads first; `ttlMs` 0 |
| **`skill/<name>`** | the text of one skill, listed with when to use it |
| **`actions`** | every scheduled action (`pull`, `call`, `poll`): what it calls, how often, its key by label only, whether it is paused and why, its last run and this month so far; `ttlMs` a minute. Starting a paused one again is `resumeAction`, which is ADMIN and a person's |
| **`automations`** | every automation: what starts it, when it runs next, and how its runs went this month |
| **`automation/<id>`** | one automation as declared, with its last ten runs, each step with its outcome. A template, never listed one by one |
| **`arrangement`** | how this BrainDog is arranged: its packs, what else is on offer, its voice and settings, its pages, and what waits |
| **`declaration/<slug>`** | one page as declared, to change and propose back. A template, never listed one by one |
| **`design`** | the design book: every kind of block with an example, the colours, type and spacing, and the layout rules. Read before designing a page, a card or a visual; `ttlMs` an hour |
| **`grammar/page`**, **`grammar/register`**, **`grammar/metric`**, **`grammar/proposals`**, **`grammar/ingest`** | what a page, a list and a figure declaration may contain, each with one that installs; the `pack`, `settings` and `arrange` bodies of `propose`; and what a door or a scheduled action may contain, with one of each; `ttlMs` an hour. A rule is `grammar/automations` |
| **`grammar/script`**, **`grammar/automations`** | what a script and an automation may say, their limits, what does not run yet, and examples that install; `grammar/script` also says how to ask for a trial. `ttlMs` an hour |

**Every resource is backed by a method but two**, so [ADR-018](16-DECISIONS.md)'s rule holds for the rest by
construction: `schema` `digest/today` `page` `metric` `sessions/live` `context` `boot` `whoami` `actions` and
`automations` are the methods `schema({ register })` `digestToday()` `page({ slug })` `metric({ metric })`
`sessionsLive()` `context()` `boot()` `whoami()` `actions()` and `automations()` of [30-BLUEPRINT](30-BLUEPRINT.md)
§5, `automation/<id>` is `automations({ rule })`, and `understand` is `understandPlan()`. `inbox` and `inbox/<state>` are `inbox()`, asked for every
state or one. `arrangement`, `declaration/<slug>` and the grammars of pages, lists, figures, proposals and doors are
one method, `arrangement()`, asked for the whole, a page or a grammar. `decisions` is
`governance({ register: 'suggestion' })`, the open suggestions, and `skill/<name>` is `list` over the skills register
by name, so neither is a read path of its own. The two that are not a method are `grammar/script` and
`grammar/automations`: each is text `packages/mcp` holds, because its numbers are copies of ceilings the record
cannot reach: the script sandbox's, which the record may not import, and the automation lint's, which the kernel does
not export. Each is asked of `version()` first, so the permission ladder still
decides who reads it, and a test holds every number in it to the source it was copied from. The move that decides
stays a person's act (§5). URIs are `braindog:<path>`; `schema`, `page`, `metric`, `skill`, `declaration` and
`automation` are templates, and every resource carries `ttlMs`: the table is [44-SPEC-MCP](44-SPEC-MCP.md) §4.7. Two
more are planned and not built, so neither is listed: `dialect`, the block dialect of [34-GRAMMARS](34-GRAMMARS.md) §2
in one line a kind, which is the writing guide; and `whats-new`, the events since a cursor, which is the cheap way to
catch up (the `activity` tool answers the latest writes meanwhile, with no cursor). Each waits for its method. A third,
`rule-test/<id>`, a rule's `when:` run against live rows without applying it, is not built as a resource; what a rule
would do reaches an agent as `dry_run` on the answer to `propose` of that rule (§3).

> **The page and metric rows close a hole [ADR-018](16-DECISIONS.md) would otherwise have called a design
> error.** Its rule is *"any screen that needs an endpoint no agent can call is a design error"*,
> and the web app's page read is `page({ slug })`, which **no tool in §3 can reach.** Every
> declared page and every figure on it was invisible to every agent.
>
> **The fix is a resource, not another tool**, and that is not a dodge: it is what the distinction
> in this section is *for*: a page is a read surface with a stable address and cacheable content,
> which is the definition of a resource. The tool list did not grow for it, [ADR-008](16-DECISIONS.md)
> stands, and an agent asked *"what does my Money page say"* can answer it.

Each carries `ttlMs` ([44-SPEC-MCP](44-SPEC-MCP.md) §4.7): `schema/*`, `skill/*` and the four grammars an hour,
because they change only when a pack or a build does; `boot`, the digest, `decisions`, `actions`, `automations`,
`automation/*`, `arrangement`, `declaration/*`, pages and figures a minute; `whoami`, `context` and `sessions/live`
zero, which is ask every time. No `list_changed` is sent (§3).

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
123 tasks carrying a group, and 61% of the groups holding fewer than two items. The prose said
one thing, the schema implied another, and the schema won, **because the schema is what is in
every session's prompt.**

The rules that fall out:

1. **A tool description is a decision aid, not documentation.** It says when to reach for this and
   when not to. It never explains how the server works.
2. **Every optional field's description says what the normal case is.** If most records leave it
   unset, the description leads with "usually leave this unset."
3. **The skill is under 200 lines** with references loaded on demand.
4. **The refusal is the teacher.** A rejected write returns what was wrong, where, and the
   correction, in the same voice the UI uses. An agent that gets a good refusal does not need to
   have read the docs.

---

## 8 · Rate limiting and abuse

| Limit | Where | Value |
|---|---|---|
| Requests per token | the host, keyed by the token's hash; `Mcp-Name` names the tool in telemetry, never in a decision ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5) | 600/min, burst 60 |
| Writes per token | Worker | 120/min |
| Model-backed calls per record | **AI Gateway** | budgeted monthly, see [08-METRICS](08-METRICS-AND-ANALYTICS.md) §6 |
| Payload size | Worker | 1 MB |
| Per-object throughput | platform | ~1,000 req/s, a natural ceiling |

A runaway agent loop is the realistic failure, not an attacker. It is bounded at the gateway
rather than by trusting a client, and the customer sees it in their own activity feed with the
token named, because *"which of my agents did 4,000 calls last night"* is a question they will
ask. A limit answers a bare `429` with `Retry-After`; no refusal code is minted for it.


### The refusal list, and the test that drives it

The predecessor refuses five things **at the MCP layer**, before any request leaves, each with a
reason an agent reads: deciding a suggestion (*"deciding is the owner's, never an agent's"*), the one-time
import, every sign-in route (*"registering a passkey would mint a permanent way in that he never
approved"*), the job surface (*"arbitrary code execution … ask the owner to run it from Spark"*), and every
Keychain route (*"the highest-value thing prompt injection could ask for"*). BrainDog's equivalents are
the four RPC groups outside DATA and READ+ in [30-BLUEPRINT](30-BLUEPRINT.md) §5, forty-three of
the sixty-six methods, each refused to every MCP token **with a reason**, plus `by: decide` on the
transitions that need a person. `markRead`, alone in DATA, answers a person principal only.

Over MCP none of these methods is a tool, so an agent that names one to `tools/call` is answered `ROUTE_UNKNOWN` with
the sixteen tools in `allowed`, and nothing runs. The reason in the table is what the record answers a token at that
route over `/api`. A refusal list at the MCP layer, one named refusal per method as the predecessor has, is not built
([44-SPEC-MCP](44-SPEC-MCP.md) §6.2).


| Group | Methods | The reason an agent reads |
|---|---|---|
| **KEYCHAIN** (4) | `listGrants` `openGrant` `bindGrant` `revokeGrant` | *a credential is the highest-value thing prompt injection could ask for*: a browser session only; every token gets `403 NEEDS_BROWSER_SESSION` |
| **JOBS** (7) | `createJob` `cancelJob` `listJobs` `jobEvents` (a browser session) · `claimJob` `postJobEvent` `readCancel` (the runner's device grant) | *a job is code execution on a machine*, the predecessor's job-surface refusal, [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2 |
| **ADMIN** (16) | `planPack` `installPack` `uninstallPack` `setDeclaration` `ruleApply` `invite` `export` `import` `erase` `restore` `snapshot` `createToken` `listTokens` `revokeToken` `deviceApprove` `deleteRecord` | *installing a pack or erasing a record is the owner's act*: a browser session, or an operation grant the owner approved from one (§2); never an MCP token, and no `admin` scope exists |
| **INTERNAL** (16) | `drainSchedule` `leaseOutbox` `ackOutbox` `observe` `applyMigrations` `createRecord` `arrive` `ingestVerify` `applyPull` `sealedGrant` `changed` `acceptInvite` `deviceStart` `devicePoll` `rewrapKeys` `opsReport` | *the host's own machinery*: an outbox lease or a migration is not a thing an agent does; only the host calls these |

Three things were meant to carry over as **tests**, not prose. One has:

| Test | Asserts | Built |
|---|---|---|
| **Every route has a verdict** | each route in the router is either reachable through a tool, exposed as a resource, or named in the refusal list with a reason. A route with none of the three fails CI, which is how the predecessor found a briefing endpoint *"for the SessionStart hook"* that nothing called | no. `packages/mcp/test/index.test.ts` holds the other direction: every advertised tool and resource reaches a method ([44-SPEC-MCP](44-SPEC-MCP.md) §9) |
| **The refusals are driven** | the test starts the sealed server and calls each refused path, asserting the refusal text arrives **before any fetch** | no, because there is no refusal list at the MCP layer to drive |
| **The tool surface has a ceiling** | the predecessor caps the whole tool listing at ~4,900 tokens by test; **BrainDog's sum is §4's 2,760**, and `packages/mcp/test/budget.test.ts` asserts it. §4's budgets are the same idea per tool; this one is the sum | yes; the latest measure is [44-SPEC-MCP](44-SPEC-MCP.md) §7's first row |

And the server's `instructions` carry the contract every tool description would otherwise repeat. They go out in
`initialize`, in `server/discover` and with every `tools/list` under the same `ttlMs`, because a 2026-07-28 client
has no initialise step, and they are counted inside §4's 2,760 (the exact text is [44-SPEC-MCP](44-SPEC-MCP.md)
§4.6). They say: call `context` first; money in minor units, shifted by its currency's own decimals; on `VERSION_STALE`, re-read the row and re-apply your
change, and never resend the copy you held (there is no 412, and no whole-document copy to resend: an earlier draft
carried the predecessor's *"re-read on a 409, never resend"*, which is a whole-document rule); an agent never
decides; a credential never goes in the record, and `braindog keys put` deposits one; hand off before you stop;
record a learning only when a future session would otherwise go wrong; call `meet`; a refusal names the fix;
**everything you write is read on a phone.** The predecessor duplicates them into descriptions anyway, *"because not all clients honour it."* BrainDog
does not: its descriptions say when to reach for each tool, and every client is sent the instructions twice.

---

## 9 · What the person tells an agent, and how it is configured

Built on 21 October 2026. The spec is [44-SPEC-MCP](44-SPEC-MCP.md) §15. This is the short version.

**Sixteen tools.** `instructions` joined. `schema` folded into `record_index {register}` and `history` into
`get {history: true}`; both stay callable until 20 December 2026 and are not listed. The 2,760-token ceiling did not
move: the list is 2,739.

**He can tell an agent something.** In the app he writes one line to a run, to an agent kind on a project, to whoever is
next, or on a task. The agent sees it in four ways:

1. `context` leads with it, and the start hook prints it.
2. Any tool answer can carry one line, "New for you".
3. In Claude Code, a hook adds it to the next prompt, from a file the bridge keeps fresh.
4. Opt in: a Claude Code channel, for a push while the agent works.

An agent without hooks, such as Codex or Cursor, gets 1 and 2, and reads with `instructions` when it asks. The app says
which agents can be reached now and which only at their next call.

**The agent answers.** `instructions {take}` takes one, and only one run can. `instructions {reply, said, state}` answers
with `done`, `needs_you` or `declined`. The app shows Sent, Seen (and how), Working, then the reply and what changed,
with Undo.

**Stop and pause hold.** The record refuses a stopped run's writes for every client (`RUN_STOPPED`, `RUN_PAUSED`). In
Claude Code a hook also denies the next tool call. An agent without hooks is stopped at its next BrainDog call.

**Settings are per kind of agent.** How far it may go, which lists, which tools, a brief, quiet hours, limits and what
to tell him on finish. New agents start at Suggest. Only he changes a row, signed in to the app, and no token can.
`tools/list` is cut to what the caller may use, so a narrower agent pays fewer tokens, and a tool turned off is refused
`TOOL_OFF` with the setting named.

**Prompts.** `/braindog:start`, `/braindog:wrap` and `/braindog:ask` say the steps in order.

**The pulse.** The bridge tells the record every 15 seconds that the run is open and hears what is pending. It writes no
version and no history. A WebSocket is not used (ADR-075).

**Refusals added:** `PATCH_EMPTY`, `NAME_AMBIGUOUS`, `TOOL_OFF`, `RUN_STOPPED`, `RUN_PAUSED`.

---

*Next: [11-ASSISTANT](11-ASSISTANT.md), Slash.*
