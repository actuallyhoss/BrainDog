# 22 · Frontend

Every figure marked **measured** was measured on 2026-08-31 in Chrome 151 and Node 24.13.0, not
estimated. This document exists because the crux — *how do you render a block kind a pack invented
after the bundle shipped* — was built and timed before being recommended.

---

## 1 · The one-line answer

> **Svelte 5 + SvelteKit 2 on Workers Static Assets, rendering a recursive interpreter over the 8
> layout primitives — not 16 components, and never per-page code.** A third-party block kind is a
> *named composition of primitives shipped as data*. Tables are CSS grid with **declared** column
> tracks and chunked `content-visibility`, never `<table>`. Live updates ride a hibernatable
> WebSocket carrying only a version and the names of the registers that changed.

**Measured, on a working prototype:**

| | |
|---|---|
| The full recursive interpreter, client | **19.3 KB brotli** |
| Server render of a **third-party** pack kind with 400 rows | **0.6 ms** |
| Server render of a 6-block page, 100 rows each | **0.84 ms** |
| Marginal cost of one more block kind | **0.175 KB brotli for the first eight; ~0.03–0.04 for every kind after** — compression amortises the repetition |
| htmx 2.0.10 alone, for comparison | 14.6 KB brotli — *and it renders nothing* |

The whole declared-page renderer costs **1.3× htmx by itself**. The server-render rows were
measured through `svelte/server`'s `render()`; the shipped app is a static shell that hydrates (§2),
so they now price the parity gate, not a request.

---

## 2 · The stack, and the constraint that decides it

> **Nobody will ever author a page.** A page is a database row.

That deletes the entire value proposition of every framework whose pitch is authoring ergonomics —
JSX, file-based routing, per-page loaders. What is actually needed is four things: a small runtime
that renders a recursive structure with fine-grained updates; **the same renderer running in
workerd, in plain Node, and in a unit test with no framework server in between**; scoped CSS a
linter can attribute to a file; and something one person can hold in their head at 11pm.

### Measured baselines — identical sortable, filterable, keyed 4-column grid

| Stack | brotli KB |
|---|---|
| Hand-written vanilla DOM | 0.4 |
| Preact 10.29.8 | 5.2 |
| **Solid 1.9.15** | **5.3** |
| htmx 2.0.10 *(no renderer)* | 14.6 |
| Alpine 3.17.1 *(no renderer)* | 17.6 |
| **Svelte 5.57.0** | **19.0** |
| React 19.2.8 + react-dom | 50.9 |

**Stated honestly: Svelte 5 is no longer the framework that disappears.** Runes are a signals
runtime costing ~17.4 KB brotli before a single component exists; Svelte 4's 2 KB hello-world is
gone. It is 2.7× smaller than React and **not close to Solid**.

And the number that matters more — how the bundle scales with block kinds:

| Kinds compiled in | brotli KB |
|---|---|
| 0 (runtime + registry) | 17.4 |
| 8 | 18.8 |
| **15** | **19.0** |
| 100 | 22.2 |

The v1 set is **sixteen** kinds ([05-BLOCKS](05-BLOCKS-AND-THEMES.md) §2); the fifteen-kind build is
the measured point, and the sixteenth costs ~0.03 KB more.

Compression amortises the repetition almost completely. **Corollary: do not code-split per block
kind.** 100 kinds is 22.2 KB in one chunk; splitting adds a request per block and saves nothing.

### The verdicts

| Stack | Verdict |
|---|---|
| **Svelte 5 + SvelteKit 2** | **Recommended.** Wins on the specific thing: `render()` from `svelte/server` is a **pure function** `(Component, props) → {head, body}` — no framework server, no request context, no adapter. The identical renderer runs in a Worker, in Node, and in Vitest, which is exactly what the nine-port self-host constraint demands ([31-STACK](31-STACK.md) §5). Scoped `<style>` with `css: 'external'` gives one stylesheet and a linter that can attribute every declaration to a file |
| Server-rendered HTML + htmx/Alpine | **Rejected.** The block kinds have *local* interactive state — sort, filter, expand, row focus, inline edit. htmx returns HTML fragments, so **every sort of a 500-row table is a network round trip.** Measured: client sort of 5,000 rows is **1.9 ms**; server-rendering the replacement is **9.05 ms CPU and 72.4 KB gzip.** It makes the cheap thing expensive. Also htmx 4.0.0 was tagged three days ago and sits on `next` while `latest` is 2.0.10 — adopting a foundation mid-rewrite is a bad solo trade. And Alpine has **no server renderer**, so declared pages could not SSR |
| **SolidStart** | **Strongest runner-up, rejected on three practical grounds.** 3.6× smaller and genuinely the best fit for a 5,000-row grid. But it shipped 2.0.1 → 2.0.4 in six days; it **requires a Babel pass** (esbuild alone silently produces wrong output); and it has no scoped-CSS story equivalent to Svelte's, so "no component writes a colour" gets harder to enforce per file |
| React 19 | **Rejected.** 50.9 KB brotli for zero functional benefit. Its ecosystem advantage evaporates because §4 concludes you should not use a table library, and CodeMirror is framework-agnostic |
| Astro islands | **Rejected specifically on shape.** Every page is dynamic and per-customer, so nothing prerenders — and **each server island is its own HTTP request** with props capped at 2,048 bytes before degrading to an uncacheable POST. The literal opposite of "6 blocks must not be 6 round trips" |
| Qwik | **Rejected on project health.** `2.0.0-beta.42`. Forty-two betas |
| Web Components / Lit | **Rejected now, kept as one narrow escape hatch.** Lit is the one architecture that could let a pack ship a genuinely new *element* — but §3 means third parties never ship code, so the reason to pay the tax evaporates. Keep it for exactly one future case: if untrusted code ever *must* execute, a closed shadow root is the isolation boundary |

### Two hard constraints on the pick

1. **No per-page code, ever.** One interpreter. If a page needs code, the primitive set is wrong.
2. **The web app is a static shell.** `adapter-static` (`fallback: 'index.html'`, `ssr = false`)
   builds one `build/` that both hosts serve unchanged; no server renders a request, and there is no
   `@braindog/web/node` handler. `render()` from `svelte/server` is called by the `a11y-tree` parity
   gate alone — the test asserting that the Svelte interpreter at `braindog-render/svelte` and the
   framework-free `toHTML` at the package root produce the same accessibility tree. `toHTML` serves
   the mirror, exports, tests and the digest email — it is not SSR. The root exports are `parse` ·
   `toHTML` · `render` · `KINDS` · `PRIMITIVES` · `PRIMITIVES_VERSION`; `expand` is not exported at
   stage 0, because kinds expansion is `declare`'s — [31-STACK](31-STACK.md) §2,
   [ADR-045](16-DECISIONS.md), [50-SPEC-WEB](50-SPEC-WEB.md) §2, [36-SPEC-RENDER](36-SPEC-RENDER.md)
   §2. The app must not be welded to SvelteKit's data-loading conventions — **SvelteKit is at
   `3.0.0-next.25` against stable 2.70.3**, so a major is coming, and this keeps the migration to
   routing files.

---

## 3 · The crux: a pack's block kind, when the bundle predates it

### Three wrong answers, named so they get rejected on sight

1. **Ship JS in the pack and `import()` it.** You have built a plugin system executing untrusted
   code in the customer's session. Breaks CSP, breaks the no-outbound-calls rule, breaks self-host,
   and puts a code surface on an agent-facing API.
2. **Server-render the unknown block to opaque HTML.** Works for first paint; dies the instant the
   block must sort, filter or take a keystroke. You cannot hydrate what you cannot interpret.
3. **`eval` a template string.** (1) with worse ergonomics.

### The right answer

> **A block kind is not code. It is a named composition of primitives, plus a query.**

The client ships an interpreter for the **primitives** — a closed, versioned set — and never for
the **kinds**. A pack adding `burn_rate` ships one `block` declaration — a tree of primitives:

```yaml
- block: burn_rate
  primitive: panel
  accepts: { source: register, target: number }
  body:
    - primitive: grid
      cells: 2
      children:
        - primitive: table
          rows: $source
          empty: "Nothing owed."
          columns:
            - { field: ref,    label: Ref,          width: 22ch }
            - { field: party,  label: Counterparty, width: "minmax(0,1fr)" }
            - { field: amount, label: Amount,       width: 12ch, align: end }
        - primitive: rows
          rows: [ { label: Runway, value: $runway } ]
```

Three rules the example obeys. **A `block` is one declaration**, like `- register:` or `- page:`
([04-PACKS](04-PACKS.md) §1), addressed as `block.burn_rate` — block ids follow the declaration `Id`
grammar, so `burn_rate`, never `burnRate` ([34-GRAMMARS](34-GRAMMARS.md) §4); an earlier draft wrote
a `kinds:` root that exists nowhere else. **`$source` and `$runway` are the block's `accepts:`
names**, substituted as whole nodes — the same rule as pack inputs ([21-AUTHORING](21-AUTHORING.md)
§9) — never spliced into a string; and those names are legal keys on a page block of that kind, typed
`register metric number text` ([06-PAGES](06-PAGES.md) §1.1). **`columns` is the page grammar's list
of `{ field, label?, width?, align?, link? }`** ([06-PAGES](06-PAGES.md) §1.1); the `k`/`w`
shorthand an earlier draft used is gone. The sixteen first-party kinds ship as one TypeScript table —
`src/kinds.ts`, `as const`, a derived `Kind` union, in the shape a pack's `block` declaration takes
(`body` and `accepts` join it when `declare` needs them) — so first-party and third-party kinds take
one code path ([05-BLOCKS](05-BLOCKS-AND-THEMES.md) §1, [34-GRAMMARS](34-GRAMMARS.md) §2.4,
[ADR-056](16-DECISIONS.md)); `PRIMITIVES_VERSION = 1` at stage 0. A pack kind is page-only at stage 0
— not a fence in a write-up — so the dialect's fence regex stays `^[a-z]+`
([34-GRAMMARS](34-GRAMMARS.md) §2.1).

> ### An earlier draft of this example was wrong against the eight primitives, and the fix was a decision not a typo
>
> It used `proportional` as a **two-column splitter** and `text` as a **leaf** — but
> [05-BLOCKS](05-BLOCKS-AND-THEMES.md) §1 defines `proportional` as *"rows whose number drives a
> drawn magnitude"* (bar, gauge, sparkline), and `text` is not one of the eight at all. The eight are
> `panel`, `grid`, `rows`, `proportional`, `inline`, `list`, `table`, `media`.
>
> **There was no splitter and no leaf, and that example was the evidence that both were missing** —
> it is the demonstration that the whole third-party-block-kind architecture works, and it could not
> be written without inventing two primitives. §11 names the primitive set as the single most
> expensive decision to reverse, so that was exactly the moment to settle it rather than after packs
> exist:
>
> | Option | Cost |
> |---|---|
> | **Rewrite the example against the eight** — a `grid` of two cells, a `table` and a `rows` | free, and it proves the eight are sufficient |
> | **Add `split` and `text` as the ninth and tenth primitives** | a primitive-version bump, two renderers, and it weakens *"eight primitives is reviewable"* |
>
> **The first was taken; the example above is the rewrite.** A worked example that has to invent a
> primitive is a worked example arguing for a primitive, and that argument should be made explicitly
> or not at all.

**Built and measured.** A single recursive component that imports itself and dispatches on the node
type:

- Rendered `kind: burn_rate` — a kind the bundle had never heard of — with 400 rows, emitting
  `data-kind="burn_rate"` for pack-supplied styling. **401 `role="row"` elements verified.**
- **Server render 0.6 ms.** Interpreter **19.3 KB brotli** — indistinguishable from the 15-hand-written-
  component bundle at 19.0 KB (§2's measured row).
- An unknown **primitive** degrades to one line: *`Block "reactor_core" needs a newer client.`* A
  label and what to do — not an explanation, not a metric.

**Why this is a good deal rather than a compromise:**

| | |
|---|---|
| **The primitive set is the real API surface** you version and document | 8 primitives is reviewable; the kinds in render's `TABLE` plus unbounded third-party kinds is not |
| `requires: { primitives: 1 }` in the pack manifest — an integer compared against `PRIMITIVES_VERSION` ([31-STACK](31-STACK.md) §6), which is `1` at stage 0; the record refuses when its own is lower (`PRIMITIVES_OUT_OF_RANGE`) | lets the **server refuse the install**, so the failure lands in the agent's response at install time, not on the customer's screen at 7am |
| Self-host parity is free | no code shipped means no per-customer build |

**The escape hatch, priced.** If a kind genuinely needs behaviour no primitive expresses, it becomes
a *first-party* component and the primitive version bumps. At ~0.03–0.04 KB brotli per kind beyond the first eight that is
**20–30 new kinds before anyone notices the bytes**. The hatch is cheap — but it is *our* code on
*our* release cycle, which is the entire point.

---

## 4 · Dense tables

### `<table>` is not viable. Measured.

Chrome 151, 8 columns. Layout = forced reflow. The right-hand column is **4× CPU throttle at
390×844×3** — the honest mid-tier-phone proxy.

| Rows | Mode | Desktop build+layout | 4× throttled |
|---|---|---|---|
| 500 | `<table>` | 12.4 + 26.9 = **39 ms** | **231 ms** |
| 500 | grid + chunked CV | 13.9 + 0.2 = **14 ms** | **89 ms** |
| 2,000 | `<table>` | 51.9 + 149.2 = **201 ms** | **1,068 ms** |
| 2,000 | grid + chunked CV | 52.4 + 0.3 = **53 ms** | **363 ms** |
| 5,000 | `<table>` | 129 + 318 = **448 ms** | **2,372 ms** |
| 5,000 | grid + **chunked** CV | 166 + 0.6 = **167 ms** | **836 ms** |
| 10,000 | `<table>` | 252 + 790 = **1,042 ms** | — |
| 10,000 | grid + chunked CV | 270 + 1.0 = **271 ms** | — |

`<table>` layout scales **superlinearly**: 26.9 → 59.6 → 149 → 318 → 790 ms across 500/1k/2k/5k/10k.

### `content-visibility` does NOT work on table rows. Proven twice.

**By spec.** `content-visibility` *"applies to elements for which size containment can apply"*, and
size containment *"has no effect … if its principal box is an internal table box."* The spec even
says why: *"the table layout algorithm does not allow boxes to become smaller than their inflow
content."*

**By measurement.** 5,000 `<tr>` with `content-visibility: auto` moved layout from **318 ms to
337 ms** — nothing, slightly worse from the extra style resolution. On chunked `<tbody>`: 295 ms.
Also nothing.

> Anyone who recommends `content-visibility` on table rows has not measured it.

### Two traps found by measuring

**Trap 1 — `subgrid` is the obvious alignment fix and it is incompatible with
`content-visibility`.** A row with `grid-template-columns: subgrid` *and* `content-visibility: auto`
reports **computed `grid-template-columns: none`**. Size containment nullifies the subgrid.

Which forces the key architectural coupling, and it is the best sentence in this research:

> Because we need `content-visibility`, **column widths must be declared, not content-derived.**
> The page-as-data model gives us that for free. **The reason the fast path exists is that pages are
> declared.**

**Trap 2 — per-row `content-visibility` is a trap.** It fixes layout (318 → 33 ms) but produced
**17 of 89 frames over 16.7 ms** during scroll, versus **0 of 89** for chunked. Chrome pays a
relevancy check per skipped element. **Chunk at ~100 rows.**

### The honest ceiling

Layout is no longer the wall — chunked CV took it to 1.0 ms at 10,000 rows. The wall is **DOM
construction**, linear and irreducible if the nodes exist:

> **~27 µs/row desktop, ~167 µs/row at 4× throttle**, at 9 nodes per row.

So 5,000 rows costs **~833 ms of build on a mid-tier phone no matter what CSS you write.**

| Rows | Strategy |
|---|---|
| ≤ 300 | grid rows, no chunking |
| 300–2,000 | **200-row keyset pages** into rowgroups of 100 under chunked `content-visibility` |
| > 2,000 | **the cap.** The DOM stops at 2,000 with the cap line — *"showing 2,000 of 4,812"* — and the way past it is a filter or an export. **No virtualisation, at any size** ([50-SPEC-WEB](50-SPEC-WEB.md) §5.2) |

> **Design the product so a 5,000-row view is a report you export, not a page you scroll.**

**Sorting is free; re-rendering is the entire cost.** At 5,000 rows the sort is **1.9 ms** and a full
rebuild is 141 ms desktop / 919 ms throttled. So: never round-trip a sort, and use a **keyed** each
so the framework reorders existing nodes rather than recreating them.

**And Lighthouse will fail you.** It warns above ~800 body nodes and errors above ~1,400; a 500-row
table is 4,529 nodes. Treat that audit as advisory and **gate on LoAF `blockingDuration`** instead.

---

## 5 · The data layer

**REST over one resource shape.** Not GraphQL, not a bespoke query protocol — the rule *"the web app
is a client of the same API the agents use"* settles it. A query protocol would let the agent
express queries the pack system cannot declare, and then the web app has a capability packs do not.

**One request per page load, never one per block.** The record object *is* the query engine and
storage is in-process, so N queries cost N in-thread SQLite calls and **zero** network hops:

```
page({ slug })              (one DO invocation)
  page = readPage(slug)
  rows = { for each block: runRegister(source, where, projection, limit) }
  → { blocks[].{ rows, total, drawn, stale_at }, kinds, values, version }
```

> **And that endpoint is exposed to agents too, as the MCP resource `page/<slug>`** — because
> [ADR-018](16-DECISIONS.md) says *"any screen that needs an endpoint no agent can call is a design
> error"*, and until it was, this was one: none of the eight tools could read a declared page or a
> metric. A resource rather than a ninth tool, so the tool count is untouched.
> See [10-MCP](10-MCP.md) §6.

Fanning out per block would be N round trips and would burn the 1,000 req/s soft limit N× faster.

**Streaming buys nothing** — a whole page renders in under 2.12 ms, and with no server render there
is nothing to stream: `page()` answers once, with every block's rows, `total`, `drawn` and `stale_at`,
the `kinds` the page needs and its values pre-resolved ([50-SPEC-WEB](50-SPEC-WEB.md) §5.1).

### Writes: three terminal responses, and none of them is silent

Every write carries a client-generated `op_id` and the `version` it was based on. The change goes to
a **pending overlay**, never into the cache; reads render `merge(canonical, pending)`. `op_id` is
unique on `event`, so a replayed write returns the original result instead of applying twice.

| Response | Client action |
|---|---|
| `applied` + canonical row + new version | drop the overlay, adopt canonical |
| **`refused`** (422) + typed reason + field path | **keep the overlay**, mark the field, show the reason inline |
| `conflict` (409) + the current row + the other actor's name | drop the overlay, re-read, re-apply — the body names who changed it. **One** automatic resend with the same `op_id` when the other actor's change is disjoint from the patch; otherwise both values are re-presented and the person chooses ([50-SPEC-WEB](50-SPEC-WEB.md) §5.3). **There is no 412** |

These are the `Result<T>` envelopes every method shares ([33-CONTRACTS](33-CONTRACTS.md) §2); the
HTTP surface is `POST /api/<method>` per method plus four GET aliases ([33-CONTRACTS](33-CONTRACTS.md) §4).
Every call carries a client-minted `X-Request-Id`; the host echoes and logs it, and it is the copyable
id of every error state ([19-INTERFACE](19-INTERFACE.md) §6).

> **Never roll back silently. A refused write that vanishes is how a user loses a number they
> typed.**

A validation refusal is **an answer, not an error to retry**. This is the one place the
no-over-explaining rule inverts: the refusal must name the field and the reason, because that *is*
the instruction. *"Due date must be after issue date"* — never *"validation failed"*.

No CRDT and no vector clock: the object is single-threaded, so `version` is an integer bumped inside
the same transaction as the write, and **compare-and-set** is correct. Last-writer-wins is wrong for
money.

### Cache invalidation: do not invalidate, **version**

The record keeps a monotonic `record_version` — **`MAX(event.rowid)`**, because `event` is
append-only and written in the same transaction as every mutation — and **no separate `changelog`
table**. An earlier draft added a `changelog(version, register, id, op)`; the `event` table already
is one, and the live channel's changelog is `SELECT DISTINCT target FROM event WHERE rowid > ?`.
Every response carries `version`; the live channel pushes `{version, registers}`; the client
refetches only the blocks whose `source` appears in that list. One integer of coordination,
identical for a browser tab, the CLI and an agent.

**`MAX(event.rowid)` is what an owner who reads every list is answered, and nobody else.** Handed to
a member, the gap between two polls counted the events she was not shown: a colleague at `read` polled
4 and then 9 across three invitations hidden from her and two Diary rows. Since `83875130`, `version()` answers anybody
the record's `holdsRowids` refuses a 53-bit hash, from two FNV-1a passes, of the id of the newest
event line she is shown, or `0` when she is shown none. It moves when a line she may read is written
and stands still otherwise. **It is not ordered**: a client may compare two of hers for "did it
change" and must not subtract them, sort by them, or ask for "what changed since" with one; the
rowid range scan is the owner's alone.

> **Do not build on a database change hook.** Node's SQLite has `ENABLE_PREUPDATE_HOOK` and
> `ENABLE_SESSION`; the Durable Object's SQL API exposes **neither**. A mechanism that exists on one
> adapter only is a trap. The `event` row written at step 8 of the write path is the changelog.

### Live updates: hibernatable WebSocket, and the cost analysis is decisive

| Option | Cost per customer/month (8 h/day) | Verdict |
|---|---|---|
| Non-hibernating WebSocket | `accept()` *"will incur duration charges for the entire time the WebSocket is connected"* → 0.125 GB × 2,592,000 s = **324,000 GB-s ≈ $4.05 — 81% of the entire included allowance, for ONE customer** ([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2.2; an earlier draft multiplied by ten days rather than a month and printed 108,000) | **fatal** |
| SSE | an open SSE response is an *active request*, so the object cannot hibernate. Same ~324,000 GB-s | **fatal** |
| **Hibernatable WebSocket** | hibernation-eligible objects *"don't incur duration charges even before the runtime has hibernated them"*; inbound messages bill **20:1**; **outgoing messages and protocol pings are free** — and a change notification is outgoing. Steady state ≈ **$0** | ✅ |
| Polling every 5 s | ~173,000 requests/month = **17% of the included 1M for one customer** | fallback only |

Use `ctx.acceptWebSocket()` on the **`Record` object** (`apps/worker/src/do/record.ts`, pushing
`{ version, registers }`), `serializeAttachment()` for the subscription set (**16,384-byte cap** —
fine for a register list, not for data), and `setWebSocketAutoResponse()` so keepalives never wake
the object. Reconnect with 5–30 s jitter; after two failures fall back to polling `GET /api/version`
every 15 s with one socket attempt per five minutes, and a hidden tab pauses both
([50-SPEC-WEB](50-SPEC-WEB.md) §5.4). The frame is `{ version, registers }` and nothing else; the
route answers `{ version, format, kernel, primitives, app, slash }` ([33-CONTRACTS](33-CONTRACTS.md)
§4). Job events are never pushed — the job view polls `jobEvents({ id, after })`
([23-ASSISTANT-UI](23-ASSISTANT-UI.md) §3.1). A phase-2 self-host has no `/ws`: the route is 404 and
the client polls ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §4).
[ADR-044](16-DECISIONS.md) records the transport; [01-ARCHITECTURE](01-ARCHITECTURE.md) §7 once said
SSE and now agrees.

> **Never send record data over the socket.** A payload push means authorising the socket per
> record — a second authorisation path the agent API does not have, which is a design error by the
> product's own rule.

Note **"code deployments disconnect all existing WebSockets"**, so reconnect must be jittered across
5–30 s or you build your own thundering herd against a 1,000 req/s object. And respect
`.overloaded`, which Cloudflare documents **must not be retried**: *"if a Durable Object is
overloaded, then retrying will worsen the overload."*

---

## 6 · Offline

**A stale typed business record is worse than none.** So the split is sharp:

> An offline **create** has no base version, so it **cannot conflict** — only be refused on
> validation, later, without data loss.
> An offline **edit** has a base version that is by definition possibly stale, and the record is
> money with dates.

**Offline creates queue. Offline edits are disabled at the point of typing**, with one line:
*"Offline. New records only."*

A service worker doing **exactly three things**: precache the shell by content hash;
`stale-while-revalidate` on the page endpoint, serving the stale copy **with its version** so the UI
can mark it; and hold the outbox — `localStorage`, capped at 100 creates, in v1; IndexedDB the day
Background Sync is used ([50-SPEC-WEB](50-SPEC-WEB.md) §5.12) — draining on `online`. **Do not** cache register
queries, or build a client-side query engine over cached rows — each is a second source of truth.

The one exception where an offline edit is allowed is a **draft write-up body**, where losing
keystrokes is the worse failure. On version mismatch the local text is stored as a draft and the UI
shows *your version / current version* side by side and **makes the human choose**. Never merge
prose automatically; never last-writer-wins a number.

---

## 7 · Tokens, and a theme installed as data

**Three layers, and the layer boundary is the enforcement boundary:** primitive (`--slate-900` — the
generator's internal arithmetic, never emitted as CSS) → semantic (the [13-UI](13-UI.md) §2.1 roles,
emitted as `--s1`, `--dim`, `--edge`, …) → component (`--row-h`, `--ctl-h`). **A component may name
only the semantic layer**, and that layer has exactly one list — 13 §2.1's — so the linter has one
thing to check. Who emits what: the theme emits one `@layer theme` block per scheme under
`:root[data-scheme]`; the fixed type scale is `TOKENS_CSS` in `@layer tokens`; motion tokens,
`--ctl-h`, `--tap`, `--measure` and `pairs.json` are the web app's ([39-SPEC-THEME](39-SPEC-THEME.md)
§5; [50-SPEC-WEB](50-SPEC-WEB.md) §4.4).

Authored in the theme YAML dialect and stored as DTCG 2025.10 ([28-THEMING](28-THEMING.md) §1), built
to one layered stylesheet:

```css
@layer tokens, theme, a11y, components;
```

**A runtime theme is applied with `document.adoptedStyleSheets` + `replaceSync()`** — Baseline Widely available since 2025-09-27,
full expressiveness (`@layer`, media queries, attribute selectors), and **no CSP `unsafe-inline`**,
because it is never parsed from markup. An injected `<style>` would need a nonce; an inline `style`
on `:root` cannot express layers or variants. Swapping a theme is **one `replaceSync`**: one style
recalc, no reflow of the token layer, no flash. First paint is themed with no SSR head: the *same
generator* builds the house theme into the shell at build time — `scripts/theme.mjs` from
`@braindog/theme`, committed as `src/theme/house.css` — and an installed theme arrives with `boot()`.
**One generator, one runtime sink plus the built house file.** The reader's scheme, text and density
are the `bd_pref` cookie, per device, applied by a hashed one-statement inline script before first
paint. The theme editor (phase 7) imports `@braindog/theme` live, in its own chunk — `apps/web`
depends on `render`, `where`, `theme` and `record`'s types, nothing more
([31-STACK](31-STACK.md) §2; [50-SPEC-WEB](50-SPEC-WEB.md) §5.7; [28-THEMING](28-THEMING.md) §5).

### Sanitising an untrusted token value is not optional

A custom property value is not inert. `--x: red; } body{display:none} .z {` escapes the rule if
concatenated naively, and a `url(…)` landing in a `background` is an outbound request from a system
designed to make none.

1. Every token has a `$type`. **Parse the value against that type with a real parser.** Does not
   parse → refused. **Never regex-blocklist.**
2. **Re-serialise from the parsed value.** Never pass the input string through.
3. Reject `url(`, `image(`, `element(`, `attr(`, `var(` and `\` outright in any token value.
4. Emit into `@layer theme`, which sits **before** `@layer a11y`.

That last point is structural and it prevents the whole class: `@layer a11y` holds the
non-negotiables — the `:focus-visible` ring, `forced-colors` overrides, the minimum target. **A
theme in an earlier layer cannot remove a focus ring defined in a later one.** That is the
mechanical version of *a theme is data, not authority*. And the `unsafe-inline` rule is about
`<style>` elements — `style-src-elem` is nonced; nothing content-controlled ever reaches a `style`
attribute, and the renderer's one inline `style` is the magnitude it formats itself and asserts by
regex ([36-SPEC-RENDER](36-SPEC-RENDER.md) §8; [12-SECURITY](12-SECURITY.md) §8).

### "No component writes a colour" — four gates, or the rule is decoration

| Gate | Catches |
|---|---|
| **1 · `css-rules.mjs`** — twelve rules, one regex tokeniser, zero dependencies; **no Stylelint** ([52-SPEC-TESTING-AND-CI](52-SPEC-TESTING-AND-CI.md) §5). Among them: a literal on any colour property, an unknown custom property, and [13-UI](13-UI.md) §2.4 C's usage half — no `--faint` on text below 24 px | the unknown-property rule matters as much as the colour rule: `var(--fain)` is not a colour violation, it is an **invisible** one — it resolves to nothing, inherits, looks fine in light mode and is unreadable in dark |
| **2 · A colour grep over what the CSS rules cannot see** | a class computed in TypeScript, `fill="#333"` in an inline SVG. ~30 lines of Node, **and this is the gate that actually fires in practice** |
| **3 · A rendered-DOM gate** | walk **every** element on the reference pages and assert its *computed* colour resolves to a value in the generated token set — **or is an identity accent**: `oklch(L C h)` where `h` is a row's frozen `identity.accent` value and `L`, `C` are the theme's two mark constants ([13-UI](13-UI.md) §2.1b), legal only on a mark, chip, avatar, calendar dot or chart series — **and that the value is already in the sRGB gamut.** Catches colour from a third-party stylesheet, a browser default, or a token that resolved to nothing |
| **4 · The contrast gate** | **WCAG 2.2 AA fails the build; APCA is reported as advisory.** APCA's own documentation calls it *"a candidate for WCAG 3.0"* and *"still in development"* — so it is a better signal and not a standard |

> **Gate 3 was blind to gamut, and it is worth saying why rather than just fixing it.** Measured in
> Chrome 152: `oklch(0.70 0.30 30)`, `oklch(0.70 0.40 30)` and `oklch(0.70 0.50 30)` all paint as
> `rgb(255,0,0)` — three authored colours, one painted colour — while `getComputedStyle` returns the
> **authored string, verbatim and unresolved, at every chroma.** So the gate would have certified a
> token as valid while the user looked at pure red. The fix is one extra assertion, or sampling
> through a 1×1 canvas instead of reading the CSSOM. See [28-THEMING](28-THEMING.md) §2.1.

Enumerate the **declared** foreground/surface pairs from a checked-in `pairs.json`, not all pairs
(combinatorial and meaningless). **Make "a new semantic colour token without a `pairs.json` entry" a
CI failure** — that is what stops drift.

Also in gate 1, and **in the first commit**: the rule banning physical properties (`left`,
`margin-right`, `padding-left`, `text-align: left`). It is a day now and a fortnight after 16 block
kinds exist.


### Eight rules from the predecessor's own frontend, all learned by breaking it

**A decorative enhancement must never be the only thing drawing a state.** `requestAnimationFrame`
does not run in a hidden tab, so anything measured in one simply never happens while the tab is
occluded — which produced a segmented control with nothing selected at all. The selected button keeps
painting its own background until the sliding thumb is measured and in place; the worst case is the
previous design, never nothing. *(It is also why screenshots time out in a headless session: the tab
reports hidden, and nothing repaints. Measure geometry with `getBoundingClientRect` and read computed
style; say plainly that the visual motion was not observed.)*

**Anything that must outlive a render has to be derived, not poked.** A transition cannot fire on a
state change if the element that would transition was destroyed and re-created in its final state; a
keyframe runs on insertion, so use one — and **gate an entrance keyframe on what actually changed**,
or it becomes a tic that plays on every keystroke.

**No media rule may be beaten by a later copy of itself.** A rule inside `@media` loses to an
identical bare selector written below it; the base rules go first, always. The CI row found eight
live instances the first time it ran.

**Every positive `z-index` is a `var(--z-*)`, and every icon size literal is one of four names.** A
number that matches no rule is how an SVG grows to its container.

**No class is declared in a stylesheet that nothing emits** — reported, not gated. Dead rules read
as live and are what somebody edits by mistake.

**A check that can pass on the degraded branch tests nothing.** Assert on something only the real
branch produces — `rows ≥ 4`, a mark per row — never `childElementCount > 0`.

**A regression test names the old wrong number**, so a reviewer can see what it protects.

**A form is seeded on a transition, never on a dependency.** The predecessor's transaction sheet re-seeded from
an effect that read `accounts` — an array a reload replaces wholesale — so a draft typed while the screen was
still loading was wiped by its own screen finishing. Nothing threw and nothing looked broken; the form was
simply empty again, and the reachable path was the palette's own *Add a transaction*. Seed when the sheet
*opens*; fill a default **only when the field is empty**, which is the whole difference between defaulting
and re-seeding; and drive the race in e2e with the load gated behind a promise resolved after something has
been typed — verified non-vacuous by removing the guard and watching the typed text vanish.

**Assert on the code shape, never on the file.** A patch that asserts a token is absent from a whole file
fails the moment its own comment names that token; assert on a call site or an import list. One such
assertion hid a real fault — an extracted function referenced a constant that did not exist, which a bundler
cannot see and which threw on first call. A harness constant is imported from one module, never copied from a
scratch file: the predecessor's e2e suite failed on a dev-server port that every other file had right.

Each of the six is a row in [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6.

---

## 8 · The dialect editor

| Option | gzip |
|---|---|
| `<textarea>` + preview pane | **~0** |
| CodeMirror 6 minimal | **75 KB** |
| CodeMirror 6 `basic-setup` | 135 KB |
| Monaco | ~1 MB+ |

Against a whole-app budget of 19.3 KB brotli, CodeMirror's minimal build is **4× the entire rest of
the app.** That decides the shape:

> **Ship the textarea. Load CodeMirror on demand. Never in the main bundle.**

**Tier 1 (~1 KB, default):** `<textarea spellcheck="false">` with tab handling and a preview pane
rendered by `parse` + `toHTML` — the same framework-free renderer that produces the mirror and the
export, so the preview *is* the artefact; a 10 KB write-up parses in ≤ 1 ms per keystroke
([36-SPEC-RENDER](36-SPEC-RENDER.md) §7). This is the 390px path, the low-power path, and — genuinely —
the better iOS path: native keyboard, native selection handles, native undo. CodeMirror cannot match
any of those on touch.

**Tier 2 (dynamic `import()`, desktop, on focus, after idle):** CodeMirror 6 with a
**`StreamLanguage`**, not a Lezer grammar — a hand-written line tokenizer is ~150 lines and a day; a
Lezer grammar is a week and buys incremental parsing nobody needs at these sizes. **Autocomplete is
generated from the schema the server already has**, fetched as JSON — never a hand-maintained
keyword list, which would drift from installed packs invisibly.

**Run this spike before committing to CodeMirror at all:** the **CSS Custom Highlight API** (92%
support) syntax-highlights a plain textarea's overlay without a DOM-per-token editor. If it works,
Tier 1 gets syntax colour for ~2 KB and **Tier 2 may never be needed.**

### The parser must be error-recovering by construction

Not try/catch around a strict parser. Parse line-oriented and fence-delimited; **a malformed line
becomes an `error` node carrying its source text** and renders as itself, verbatim, in a marked
style. Therefore the preview always renders something and **never blanks** — which is the actual
requirement, because a preview that flickers to empty mid-word is worse than no preview.

Debounce 120 ms, hard 16 ms budget for the parse, on the main thread (a worker costs a
structured-clone round trip per keystroke and documents are kilobytes).

**Store both the dialect text and the parsed tree, with the parser version** — so a parser fix does
not silently change what an existing page renders, and an agent can read back exactly what it wrote.

---

## 9 · Build, delivery and the self-host difference

### Targets — asserted in CI, not aspired to

| Metric | Target |
|---|---|
| Main JS, brotli | **≤ 30 KB** (today: 19.3) |
| Main CSS, brotli | ≤ 12 KB |
| Editor chunk | ≤ 80 KB gzip, **and CI asserts it is unreachable from the entry chunk** — as is the theme editor's chunk, the one place `@braindog/theme` is imported at runtime (§7) |
| Fonts | ≤ 45 KB total, 2 files |
| First page HTML, gzip | ≤ 25 KB |
| **LCP p75** | ≤ 1.2 s |
| **INP p75** | ≤ 100 ms, gated on **LoAF `blockingDuration`** |
| **CLS** | ≤ 0.02 — reserve every box: `contain-intrinsic-size`, explicit row height, dimensions on media |
| Worker startup | ≤ 200 ms of the documented 1 s budget; keep top-level work at zero |

**A size budget that only warns is a size budget that is exceeded.**

Fonts: two files, one variable axis each, subset, `woff2`, `font-display: swap`. **`unicode-range`
is all-or-nothing per file and evaluated per page** — *"if it uses at least one, the whole font is
downloaded"* — so Latin and Arabic go in **separate files**, and an English-only session never
fetches the Arabic subset. **Skip a webfont for mono entirely**: the system stack costs zero bytes
and the buyer already reads it in a terminal.

Icons: an inline SVG sprite, ~20 glyphs, **`currentColor` only** — which is also why `currentColor`
is on `css-rules.mjs`'s allow list. **An icon component that accepts a `color` prop is a colour-writing
component and CI must reject it.**

Caching: hashed filenames with `immutable`; `no-store` on `/api/*` and `/mcp`; the shell document
`no-cache` with an ETag over its own bytes — it is the same file for every record, so a pack install
or a scheme switch changes what `boot()` returns, never the document. Requests to Workers Static
Assets are *"free and unlimited"* and do not count toward the bundle limit — `run_worker_first`
names the Worker's routes (`/api/*`, `/mcp`, `/auth/*`, `/a/*`, `/in/*`, `/s/*`, `/ws/*`;
[33-CONTRACTS](33-CONTRACTS.md) §7) so asset requests never invoke the Worker.

*(Amended September 23rd 2026 for push A of the one-domain move.)* The app is now built under
`paths.base: '/app'`, so its chunks are `/app/_app/immutable/*`, and `run_worker_first` also names `/app` and
`/app/*` with `!/app/_app/*` and `!/app/catalogue/*` taking precedence, so a hashed chunk still never invokes the
Worker while an app navigation always does, because under `/app/<slug>/` the slug is checked first
([33-CONTRACTS](33-CONTRACTS.md) §4).

**CI asserts the deployed shell matches the build byte for byte**: after `wrangler deploy`, fetch `/app/`
and `/app/_app/version.json` from the live host (`/` and `/_app/version.json` before push A) and compare their SHA-256 to the `build/` output, failing
on mismatch; the same gate reads the `app` tuple back and requires it to equal the deploying run's
`BRAINDOG_BUILD` ([33-CONTRACTS](33-CONTRACTS.md) §8; [52-SPEC-TESTING-AND-CI](52-SPEC-TESTING-AND-CI.md) §5).

### The self-hosted build differs in exactly two ways

1. Assets served from disk with the same immutable headers — the same `build/`, from the same
   `adapter-static` build; there is no adapter split and nothing renders on the server (§2).
2. The storage adapter binds `node:sqlite`'s `DatabaseSync` against the `.brain` file — **the
   self-host default** ([ADR-038](16-DECISIONS.md), [33-CONTRACTS](33-CONTRACTS.md) §6). `better-sqlite3`
   implements the same `Sql` port and is the alternative for an older Node; `bun:sqlite` is
   unsupported.

**Verified on Node 24.13.0** (the official win32-x64 build, re-measured 2026-09-02): SQLite
**3.50.4**, compile options include **`ENABLE_FTS5`**. An FTS5 virtual table was created, inserted
into and matched successfully. `PRAGMA application_id` works. **The `.brain` plan in
[03-DOG-FORMAT](03-DOG-FORMAT.md) is sound.** Earlier drafts of [01-ARCHITECTURE](01-ARCHITECTURE.md)
§4 and [30-BLUEPRINT](30-BLUEPRINT.md) §13 said official builds lacked FTS5; this measurement stands —
nodejs/node#56476 was closed because FTS5 was *enabled* — and both now agree. Node bundles its own
SQLite on every platform; only Bun links Apple's system `libsqlite3`.

> **The trap, verified: `node:sqlite` is a NON-FUNCTIONAL STUB in Workers** with `nodejs_compat` —
> importable, does nothing. **You cannot write one shared SQLite call site.** The storage adapter is
> not sugar; it is the only thing that lets the two runtimes share code.

**And the portability rules the schema must obey from commit one**, because these limits are
asymmetric and will pass every self-host test before failing in production:

| Limit | Durable Object | Node |
|---|---|---|
| Columns per table | **100** | 2,000 |
| Row / BLOB | **2 MB** | 1 GB |
| SQL statement | **100 KB** | 1 GB |
| Bound parameters | **100** | 32,766 |

*A batch insert of 200 rows × 3 params is 600 parameters. It works on Node and fails on
Cloudflare.*

So the adapter refuses first. `new DatabaseSync(path, { limits })` does **not** exist — unknown
option keys are silently ignored and there is no `setLimit` — so `DO_LIMITS` is a constant the adapter
enforces itself, above the driver: parameter count (100) counted before `prepare`, LIKE pattern length
(50) checked on every bound pattern, statement length (100 KB) checked before `exec`; compound depth
and expression depth are asserted on the compiler's output. `caps` (SQLite version, FTS5, JSON) are
measured at open, and the Node adapter throws the same closed error vocabulary the DO adapter maps to
([33-CONTRACTS](33-CONTRACTS.md) §1, §3).

`node:sqlite` is **Stability 1.1** (an earlier draft said 1.2). So: pin the Node minor, and the boot
probe measures FTS5 on every start — a build without it is **refused at boot**, naming the driver.
There is no degraded mode and no `LIKE` fallback. `better-sqlite3` is the alternative driver for an
older Node, behind the same `Sql` port.

**One artifact, one `docker run`, no build step for the self-hoster.** If a self-hoster has to run a
bundler, "free and complete" is not true.

---

## 10 · Testing — and the bucket that catches this team's bugs

### Unit (node environment, milliseconds)

The dialect parser against a corpus of good and malformed input, **property-tested so any random
byte string parses without throwing**; the pack validator including token values containing `}`,
`url(` and a wrong `$type`; declaration → primitive expansion for third-party kinds; the `where:`
compiler including **the parameter count staying under 100**; money as minor units, with a test that
**fails if two currencies are summed anywhere**; and the contrast matrix against the token file.

### Real browser

**A declared page renders correctly** — the central test, and it must **not** be an HTML snapshot.
Assert on the accessibility tree and computed geometry: every declared block appears once in
declaration order; each block's `empty:` string appears **iff** its query returned zero rows;
`aria-rowcount` equals the register count; DOM row count equals `min(rows, cap)`.

Keyboard: tab order equals visual order; arrow navigation lands on the row it *looks* like it lands
on — **assert `activeElement`'s bounding box, not its id**. Run the whole suite once against
fixtures materialised with `locale: 'ar'` — direction comes from the record; the harness never sets
`dir` — and assert arrow keys invert on the **inline** axis and not the block axis.

### Must be MEASURED, not asserted — the bucket that matters

This team has been bitten three times by CSS bugs invisible in source. The `auto-fit` class was
reproduced exactly, in Chrome 151, 3 items in a 1,100px container:

| Declaration | Tracks | Item widths | **Empty tail** |
|---|---|---|---|
| `repeat(auto-fit, minmax(140px, 1fr))` | **7** (4 collapsed to `0px`) | 358.7 × 3 | **0 px** ✅ |
| `repeat(auto-fill, minmax(140px, 1fr))` | 7, all 146.9px | 146.8 × 3 | **635 px** ❌ |
| `auto-fit, minmax(140px, 240px)` | 4 | 240 × 3 | **356 px** ❌ |
| `auto-fit, minmax(140px, max-content)` | 7 | 140 × 3 | **656 px** ❌ |
| `auto-fit, minmax(140px, 1fr)` + item `max-width: 240px` | 7 | 240 × 3 | **356 px** ❌ |

So the precise rule, which nobody can infer from source review:

> **`auto-fit` is only safe when the track max is `1fr` *and* no item caps its own width** — and
> **nothing spans `1 / -1`**, because a spanning item occupies every generated track and defeats the
> collapse. Any capped max — a px value, `max-content`, or an item `max-width` — leaves a
> measurable slab.

*(That last clause is the [05-BLOCKS](05-BLOCKS-AND-THEMES.md) §4 case: a heading spanning `1 / -1`
turned 3 tiles into 7 live tracks. The two findings together are the complete rule.)*

The CI assertion that catches all five rows in one place, run over **every** grid and flex container
at the four widths — 390 / 768 / 1024 / 1440 — in both directions:

```js
const tracks = getComputedStyle(g).gridTemplateColumns.split(' ');
expect(tracks.filter(t => t !== '0px').length).toBe(g.children.length);   // no phantom tracks
const used = [...g.children].reduce((a, el) => a + el.getBoundingClientRect().width, 0) + gapTotal(g);
expect(containerWidth - used).toBeLessThan(2);                            // no empty tail
```

**Column alignment, measured.** The prototype's own first grid-table had this bug and only
measurement found it: header cells `[57.73, 158.77, 573.23, 86.59]`, body cells
`[56.06, 154.17, 590.38, 84.09]` — because two sibling grids each sized their own `ch` and `1fr`
tracks, and the header's `font-weight: 600` made `ch` wider. **Invisible in source. A 4px stagger on
screen.** The assertion: **header cell widths === body cell widths, exactly.** The fix that makes it
pass is one declared track list in a custom property, shared.

**Nine fixture records** — one per reference page, eight, plus `corpus`, the whole-corpus record the
`brain-roundtrip` and `slash-actor` gates read — checked in as text: pack YAML, row JSON
per register, a `seed.json` manifest. Rows are committed for ≤ 60 and generated beyond that by
`rows/gen.mjs` from the seed's RNG, output committed and `--check`ed in CI; the data is synthetic by
rule — generated names, `.example` hosts, 2030–2031 dates, refs as `register#seq`, no ULID or hash on
disk. The `.brain` is materialised at test time through the real write path with an injected `Clock`
and seeded RNG, never committed as bytes ([40-SPEC-FIXTURES](40-SPEC-FIXTURES.md) §5). The pages: an
empty register · 12 rows · 500 rows · 5,000 rows · mixed currencies · a long write-up with inline
blocks · **a third-party pack kind** · **a deliberately unknown primitive**. The 500-row page reads
the head of the 5,000-row file (`take`) and a `document` value may name a file (`$file`); the
5,000-row page opens the register view (cap 2,000), not a page block, whose `limit` is ≤ 500; the
unknown-primitive pack is installed raw and lints `PRIMITIVES_OUT_OF_RANGE` — the one pack that may
not lint clean, by design, and no new code for it. Every gate runs against all eight pages at **four
widths (390 / 768 / 1024 / 1440) × two colour schemes × two directions = 128 configurations.**

**Explicitly not tested:** HTML snapshot diffs (fail on whitespace, pass on layout bugs) and
full-page pixel screenshots *as a gate* — rendering *"can vary based on the host OS, version,
settings, hardware, power source."* Keep screenshots as **artifacts on failure**, for the human.
Never as the assertion.

### Two things that could NOT be measured — named as experiments, not assumptions

| Unknown | Why | The experiment |
|---|---|---|
| **Real scroll long-frame counts** | under CPU throttling with software rasterisation, a **380-node** virtualised list showed the same ~55 ms p50 frame time as a **45,000-node** table — the harness was the bottleneck. **rAF-delta scroll benchmarking in a throttled headless browser does not measure scroll** | drive a real touch scroll on a real mid-tier Android over ADB, record a trace, count `long-animation-frame` entries and their `blockingDuration`. **Until then, treat every scroll figure here as comparative only** |
| **Memory per 1,000 rows** | `performance.memory` reported a flat **9.5 MB for every configuration from 380 to 90,000 nodes** — coarsened for privacy, useless | `performance.measureUserAgentSpecificMemory()` under cross-origin isolation, or a heap snapshot |

---

## 11 · Build order and the decisions expensive to reverse

| Stage | Work | Days |
|---|---|---|
| 0 | **Reversal-expensive decisions, written down**: the primitive set, token layer names and order, the `op_id`/`version`/three-response write contract, logical-properties-only, money as minor units, the ≤100 column / ≤100 param / ≤2 MB schema rules | 1 |
| 1 | **The interpreter and one real page**, hydrated into the static shell, all block queries in one DO call. **Ship this before any styling** | 4 |
| 2 | **Tokens, both schemes, and all four CI gates.** *Stage 2, not stage 8* — every component written before the gates exist must be re-audited | 3 |
| 3 | **The dense table primitive properly** — declared tracks, chunked CV, sticky header, roving tabindex, ARIA row counts, visible cap. Plus the layout-invariant assertions and the real-device LoAF baseline | 3 |
| 4 | Writes, refusals, the hibernatable live channel, jittered reconnect, `.overloaded` handling | 4 |
| 5 | **Navigation, palette, keyboard map, 390px, RTL.** *RTL here, not later* | 4 |
| 6 | Dialect editor, Tier 1 only. Run the Custom Highlight spike | 2 |
| 7 | Packs installing kinds and themes as data. *Proven feasible* | 3 |
| 8 | Service worker, outbox, offline creates | 2 |
| 9 | CodeMirror Tier 2, prose polish | 3 |
| | **Total** | **≈ 29** |

**This is NOT confirmation of the roadmap, and an earlier draft wrongly said it was.** The 29 days
above price *the frontend runtime* — interpreter, tokens, table primitive, write contract, nav,
editor, pack-installed kinds. [15-ROADMAP](15-ROADMAP.md)'s A5 + B3 + B4 = 27 days must fund that
**plus** eleven spine screens, **plus** the theme editor, **plus** the page engine. The two numbers
price different things and their near-agreement is a coincidence that reads as evidence.

Treat 29 days as a floor for the runtime alone. The screens on top of it are re-costed in
[15-ROADMAP](15-ROADMAP.md) §1.

### Expensive to reverse, in cost order

1. **The primitive set.** Every pack ever written encodes it. Adding one is easy; renaming or
   removing one breaks installed packs. **Ship fewer than you think you need.**
2. **Declared column tracks, not content-derived.** Reversing means losing either
   `content-visibility` (5.7× slower layout at 5,000 rows) or header/body alignment.
3. **The write contract.** Retrofitting refusal semantics onto fire-and-forget writes touches every
   mutation and every optimistic path.
4. **Logical properties only.** Mechanical on day one; a manual audit of hundreds of declarations
   later.
5. **Token layer names and `@layer` order.** Installed themes depend on the order.
6. **Hibernatable WebSocket rather than SSE.** A day of code to switch, but the cost model differs
   by ~324,000 GB-s per customer per month, and that shapes pricing.
7. **One endpoint shape.** If the client ever fans out per block, every later optimisation fights it.
8. **The storage adapter boundary.** If one `ctx.storage.sql` call leaks into a component, self-host
   is broken and you learn it from a user.

---

## 12 · Open questions

| Question | The experiment |
|---|---|
| Is CodeMirror needed at all? | the CSS Custom Highlight API spike — if it works, ~2 KB replaces 75 KB gzip |
| workerd's `toHTML` cost vs Node's | the 0.45–2.12 ms figures are Node 24, and the digest email renders in the Worker. Re-run inside `wrangler dev`; expect the same order, confirm it |
| Do DO bindings work in `vite dev`? | undocumented on the plugin page. **Verify before stage 1** |
| Is `node:fs` usable in Workers now? | Cloudflare's compat table says yes; the SvelteKit adapter docs still say *"you can't use `fs` in Cloudflare Workers."* One is stale |

---

*Next: [23-ASSISTANT-UI](23-ASSISTANT-UI.md).*
