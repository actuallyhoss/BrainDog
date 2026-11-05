# 31 · The stack, and the repository

Languages, layout, ports, publishing. Every version was read from the registry or run locally on
**2026-09-01**; the rows dated **2026-09-02** were re-measured then, and one of them reverses a
2026-09-01 claim (§10).

---

## 1 · The rule that generates the layout

> ### `packages/*` may name a **capability**. Only `apps/*` may name a **runtime**.

The moment a file writes `import { DurableObject } from 'cloudflare:workers'`, it belongs in `apps/`.
`node:*` has two named exceptions under `packages/**`, and only two: `packages/ports/src/node-sqlite.ts`,
behind the `./node-sqlite` subpath, because the Node `Sql` adapter is a port implementation and the
conformance corpus runs against it; and `packages/fixtures`' row generator, which writes files. Lint
layer 4 exempts exactly those paths ([37-SPEC-PORTS](37-SPEC-PORTS.md) §13 D8;
[40-SPEC-FIXTURES](40-SPEC-FIXTURES.md) §13 D9). *(An earlier draft named `node:sqlite` as the import
that sends a file to `apps/`; the adapter for it is the one file that must not go there.)*

That single rule is what makes [01-ARCHITECTURE](01-ARCHITECTURE.md) §4's self-host claim structural
rather than aspirational — and it is exactly the thing
[22-FRONTEND](22-FRONTEND.md) §11 names as expensive to reverse: *"if one `ctx.storage.sql` call
leaks into a component, self-host is broken and you learn it from a user."*

**Every `packages/*` must run in workerd, in Node, and under bare `node --test`.** That is not a
consequence of the boundaries — it *is* the boundary. Permitted surface: ES2023, WebCrypto,
`TextEncoder`, `structuredClone`, `URL`, `Intl`. Banned under `packages/**`: `node:*` — save the two
paths above — `cloudflare:*`, `process`, `Buffer`, `__dirname`, and bare `fetch`, under
`packages/record/**` and `packages/slash/**` alike; `RegExp` is banned under `packages/extract/**`
([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §13 D4).

---

## 2 · The package graph

```
 L3  apps/worker        apps/selfhost       apps/web            apps/cli
     wrangler · DOs     node · fs           static shell        one file
         │                  │                   │                   │
 L2      └────────┬─────────┘                   │                   │
                host                            │                   │
                ROUTES · httpStatus             │                   │
                resolveContext · serveApi       │                   │
            ┌─────┼─────────┐                   │                   │
          mcp   slash    connect                │                   │
          types                                 │                   │
            └─────┼─────────┘                   │                   │
                record ─────────────────────────┴── (types) ────────┤
                RPC · write path · ./directory  · NO network object │
            ┌─────┼─────────┐                                       │
 L1     declare  kernel   extract                                   │
            │  │    │  │     │                                      │
 L0  ───────┼──┼────┼──┼─────┼──────────────────────────────────────┤
         render   where    ports     theme     fixtures
         ★ MIT    parse·   9 ifaces  oklch     devDep
         in-deg 0 /sql     Refusal   16 chk    only
```

**Acyclicity is proved by exhibiting a total order** in which every package's dependencies have
strictly lower indices — a cycle would require an edge that increases the index. Sixteen packages,
then the five apps; apps import packages and never each other.

THIS TABLE HAD SEVENTEEN ROWS AND THE TREE HAS TWENTY-ONE WORKSPACES. `skin`, `seed`, `client` and
`site` were built, wired into the apps, and named nowhere in the order — so the proof above covered
a graph that was not the graph, and the four packages whose direction nothing could check were the
four nobody had thought about. Found by `tools/gates/graph.mjs`, which is what the gate is for: an
order stated in prose is a claim, and a claim about a package it does not name is not even wrong.

A row marked *(unbuilt)* is specified and not yet in the tree; the rank is reserved so the packages
around it do not renumber when it arrives. `Depends on` is measured from the manifests, and a
devDependency is an edge — a build-time import is an import.

| # | Package | Depends on |
|---|---|---|
| 1 | `render` | — |
| 2 | `ports` | — |
| 3 | `where` | 2 — the `Refusal` type only ([ADR-065](16-DECISIONS.md)) |
| 4 | `theme` | — |
| 5 | `skin` | 4, at build time only — `scripts/theme.mjs` solves the palette and writes `house.css` and `alpha.css`. No JavaScript ships from this package; both apps import its CSS |
| 6 | `fixtures` | — *(unbuilt)* |
| 7 | `kernel` | 2, 3 |
| 8 | `declare` | 2, 7 — and `yaml` behind `./yaml` ([ADR-063](16-DECISIONS.md)). **7 is the edge the boundary table below says must not exist**; see the note under it |
| 9 | `extract` | 3, 7 — `selectAll` from `where`, which is `43 §4.4`'s path, and `mapField` from `kernel`, which is `§4.5`'s coercion table. Neither is a copy made here. The path grammar lives beside `47 §4.3`'s `readPath` because it had three readers and `where` already owned two of them, with the divergences between the two readings written down between them; the coercion table was already in `kernel` for its own ingest path, and 9 depends on 7 so there is no reason for a second. The package is built: all nine functions of 43 §2, from the text extractors and the five response formats to `matches`, the skip list, `§5.1`'s nine steps, `isDuplicate` and `testAgainst`, with `§7`'s budget asserted by a benchmark rather than hoped for. The one package under a scoped ban: no `RegExp` anywhere in its `src`, because it is the one that matches a stranger's payload (43 §8, layer 4 below) |
| 10 | `seed` | 2, 3, 7, 8 — the demonstration record, as declarations, and the packs and use cases a host offers to install (`./usecases/catalogue`). A devDependency of `web`, and a dependency of `worker` and `selfhost` for that catalogue |
| 11 | `record` | 1, 2, 3, 4, 7, 8, 9, 10 — `10` is `updateFirstParty` and the first-party module documents (`@braindog/seed/packs/quiet`, `./packs`, `./usecases/install`), loaded on the host's tick and never when the record opens, so BrainDog's own updates reach a record on their own. `./directory` is a subpath, not a package. `4` is `theme-check.ts`: a pack's `theme` declaration is solved and checked by `@braindog/theme` at plan and at install, which is the boundary table's "`record` orchestrates both", since `declare` and `theme` may not import each other. It is loaded when a theme arrives rather than when the record opens. **1 is the other edge the boundary table forbids**. `9` is `scanMoney`, `scanInts`, `scanDecimals`, `matchLiterals` and `scanDates`, handed down into `openRecord`: `43 §4.3`'s three number forms are read by `extract` at rank 9 and the reader of an arrival is the kernel at rank 7, neither may import the other, and this row may reach both. The three number readers travel under one key, all or nothing, because a record reading its amounts by one grammar and its integers by another would answer two ways about the same digits; `matchLiterals` is the fourth, and it is what lets `enum` and `lookup` say `ambiguous`; `scanDates` is the fifth, and it is what took the build's own date grammar out of the kernel — six of the ten forms are read here now, and the four that are not are the anchors. `isDuplicate` is the sixth value and the only one that is not a reader: it answers `43 §5.7`'s *are these two rows one event*, which SQL can narrow and cannot decide, because folding accents and case off a merchant string is the grammar's. It is the same seam `readRows` uses one rank up, and it is `43 §14`'s last box arriving as a dependency rather than as a move |
| 12 | `script` | none: the sandbox a person's or an agent's script runs in, `quickjs-emscripten` (quickjs-ng) only. RANKED HERE, JUST BELOW `mcp`, because it depends on nothing and the packages that will run or describe a script sit above it: `mcp` (a `script_try` tool), `host`, `worker` and `selfhost` (the hosted sandbox). At 23 every one of those edges pointed up the order. It stays above `record` and `kernel` on purpose: the record's half of a run (`kernel/src/script-run.ts`) never runs anything and holds the answer's shape structurally, and a sandbox is not a thing the core may reach for |
| 13 | `mcp` | 2, 4, 11 (types) — the wrapper sits above what it wraps; `4` is the card widget's palette as a string (`@braindog/theme/look-b.ts`) |
| 14 | `slash` | 2, 3, 11 *(unbuilt)* — Phase B7; ports `{ Sql, Clock, Inference }`, hosted by `apps/worker/src/do/slash.ts` |
| 15 | `connect` | 2, 3, 9 — the `Http`, `KeyStore` and `Clock` types, `readPath` for a response path, and `42 §4.7`'s `Read` from `extract`, which is the one shape `fetch.read` has. `9` is types only and the reading is not done here: a JSON page keeps `readPath`, because `extract`'s `select` is a second grammar and routing today's JSON through it would re-decide what every installed declaration points at. The other four formats have no document at all, so `expect:`, the `on_error` body paths, `more:` and the two body-reading paginators are refused beside them at install and the page's rows come back from the extractor. `11` was in this row and is not an edge: the record's surface is declared structurally here as `RecordApi` (47 §1), which is how connect calls it without importing it |
| 16 | `host` | 2, 7, 9, 11, 12, 15 — platform-neutral ([ADR-064](16-DECISIONS.md)). `15` and `7` are `./connector`: the mapping between a leased `pull.fetch` row and a `runPull` call is the same on both runtimes, and only the socket, the key store and the clock differ, so it is an argument list rather than a copy in each app. Both edges point down the order and neither weakens the neutrality — `connect` names no `node:` or `cloudflare:` either, and `7` is types only (`Paged`, `PagedReport`, `PagedRun`), already reachable through `11` Also `sealing.ts`, `47 §13` D9's key hierarchy: HKDF-SHA-256 to AES-256-GCM, held once rather than written out in both hosts, because a credential deposited in one has to open in the other. It carries no `Plaintext` brand on purpose (52 §5.2 rule 4) and it never names `CryptoKey`, which is ambient under the Worker's types and not under Node's. `9` is `readRows`, handed down into the record's extractor beside the row budget: `42 §4.7`'s four non-JSON formats are read by `extract` at rank 9 and the extractor that reads them is the record's at rank 7, neither may import the other, and 16 can reach both. `12` is types only, in `./script`: `CtxHost`, `ScriptDecl` and the sandbox's answer, so the runner both hosts build (a script's `ctx.fetch` sent through `sendAction`, and `holdingScript` on the shared admissions) is written against the sandbox's own contract rather than a copy of it. The sandbox itself is handed in, because running one is a runtime's business |
| 17 | `client` | 2, 16: the typed client, and the third way into the route table. It reaches 11 through 16, types only: `@braindog/host/types` re-exports the record's answer types, so a client method added from now on names its answer once, in the record (`Answer<'x'>`), and adds no manifest edge. The shapes the client wrote out before stay, held equal by `apps/selfhost/test/client.test.ts` |
| 18 | `dog` | — the printed form of a page, and the parser that reads one back. It depends on nothing, so the app that prints a page and the command line that reads one can each hold it without holding the other |
| 19 | `web` | 1, 4, 5, 7, 10, 11 — `render` and `skin` at build time, `seed` for the demonstration record, and `record` for its Directory's step list in one test only |
| 20 | `site` | 5 — the marketing site is the same design system with fewer screens, and imports nothing else |
| 21 | `cli` | 1, 2, 3, 7, 8, 13, 14, 17. The manifest holds 2, 13 and 17 today: `braindog mcp` runs the MCP core (`13`) over stdio and reaches the record through the typed client (`17`). The others arrive with the commands that need them, and `14` is for `@braindog/slash/prompts` and nothing else of it. Every edge is a devDependency, because what ships is one bundled file |
| 22 | `worker` | 2, 7, 8, 10, 11, 13, 16. `8` is the Kennel's rules (`./kennel`, `./catalogue`), which the Cloud answers `/api/kennel/v1/` with (`src/kennel.ts`). `10` is the catalogue, so an update carries progress forward as it does on the self-host. `13` serves `POST /mcp` from the same core the command line runs over stdio; `web`'s `build/` is the asset directory, never an import |
| 23 | `selfhost` | 2, 7, 8, 10, 11, 12, 13, 16, 17. `12` is `./quickjs`, the sandbox a scheduled script runs in on this host (`src/script.ts`). `13` serves `POST /mcp`, as on the Worker. `17` is a devDependency: the client's integration test runs against this server, because the test needs a runtime and only an app may name one |
| 24 | `desktop` | — the Mac app, a Tauri window around app.brain.dog. Built with cargo, not pnpm, and imports no package |
| 25 | `watchdog` | — the uptime check, its own small Worker so it is still up when the other Workers are not. It imports no package |

**Eighteen workspaces in the tree today, twenty-two at platform.** The
order is also the build order, so `pnpm -r run build` reproduces it for free. *(An earlier draft had
no `slash` package, then no `connect` row and no `host`; and it placed `mcp` below `record`, which
put the wrapper under the thing it wraps — the second revision swapped them, [ADR-064](16-DECISIONS.md).)*

### Each boundary, by what it prevents

| Edge, or its absence | Prevents |
|---|---|
| **`render` has in-degree 0** | the published MIT tarball containing code from a package it does not ship. **The boundary that makes the renderer embeddable, and the one gate 1a is measured through** — §4 |
| **`record`'s ports are exactly `{ Sql, Scheduler, Clock }`** | [ADR-002](16-DECISIONS.md) becoming a comment. No `Http`, no `Inference`, no `Dispatch`. *"The record cannot speak"* becomes *"the record has no object to speak with"*. The one outbound act — the outbox doorbell — is `Scheduler.wake()`: Cloud `OUTBOX_Q.send({ record })`, self-host a no-op |
| **`kernel` → `where`** | the index and the predicate disagreeing. `where` owns `jsonPath`, `searchText`, `derive` and `toSchema`, and the kernel imports them — so `CREATE INDEX … json_extract(fields,'$.due')` and `WHERE json_extract(fields,'$.due') < ?` are **the same string**, which is the difference between the planner using the partial expression index and scanning it; and the stored `unique:` fingerprint and the compiled inline share one definition. `compile()` returns the whole `WHERE` clause and the kernel never splices a fragment ([38-SPEC-WHERE](38-SPEC-WHERE.md) §13; [41-SPEC-KERNEL](41-SPEC-KERNEL.md)) |
| **`where` ⇏ `kernel`, and takes one *type* from `ports`** | shipping the SQL schema to the browser. The query builder round-trips `parse(print(t)) ≡ t` client-side, so `where` has a fourth runtime; the `Refusal` type it imports from `ports` is erased at build and costs the browser nothing. Split: `where` (parse · print · validate) and `where/sql` (compile) — and there is no `where/text`; the text lens is `declare`'s. The client imports only the first |
| **`declare` ⇎ `theme`** | the one cycle the design invites. `declare` owns *shape*, `theme` owns *semantics*; `record` orchestrates both. Neither imports the other |
| **`declare` ⇏ `kernel`** | `braindog pack lint` needing a database. A pack must lint offline, from a file |
| **`mcp` imports the `RecordApi` *type* only** | the MCP server reaching into internals. It is testable with a stub `RecordApi`, no Durable Object needed — and because a type import is still an edge, it sits *above* `record` in the order, not below it |
| **`host` is platform-neutral** — standard `Request`/`Response`, no `cloudflare:*`, no `node:*` | the route table, `httpStatus`, `resolveContext` and `serveApi` drifting between the Worker and the self-host: ~300 lines written once ([ADR-064](16-DECISIONS.md)) |
| **The Directory is `@braindog/record/directory`** | a fourteenth package for tables that share `record`'s port, schema discipline and tests ([51-SPEC-WORKER](51-SPEC-WORKER.md) §13 D10) |
| **`record` ⇏ `render`** | markup in the record, and therefore markup in the `.brain` |
| **`fixtures` is a devDependency everywhere** | 402 lines of one person's seed data shipping in a bundle — the exact defect the clean room exists to avoid |

**Two of those absences are not absent.** The order above permits both, because both point down
it, so `graph` is green on them and the table is where the disagreement lives:

- **`declare` → `kernel`** — `packages/declare/src/index.ts` imports `KINDS`, `digest` and `jcs`.
  The row says the absence prevents *"`braindog pack lint` needing a database"*, and a pack does
  still lint offline: the three imports are constants and pure functions, and nothing in that path
  opens one. But the edge is declared in the manifest, so the argument now rests on what `kernel`
  happens to export rather than on a boundary — and the day somebody adds a database call behind
  one of those three names, nothing says so.
- **`record` → `render`** — `packages/record/src/index.ts` imports `PRIMITIVES_VERSION`. The row
  says the absence prevents *"markup in the record, and therefore markup in the `.brain`"*, and a
  version constant is not markup. It is also the edge into the **MIT** package, the one package
  published to strangers, and it points the safe way (`render` has in-degree 0 still, because this
  is an edge OUT of it, not in).

Both are the same shape: a boundary stated as an absence, holding today because of what is on the
other end. `52 §5.2`'s algorithm is the order and only the order, so a gate built from it cannot see
either — which is written down here rather than fixed, because closing them means moving two
constants and that is a decision, not a chore.

### The one compromise, named

The client interpreter is a recursive Svelte component, and a genuinely zero-dependency MIT package
cannot contain it. **Two subpath exports, one package:**

- `braindog-render` — `parse` · `toHTML` · `render` · `KINDS` · `PRIMITIVES` · `PRIMITIVES_VERSION`.
  Zero dependencies, zero peers. No `expand` at the root: kinds expansion is `declare`'s
  ([36-SPEC-RENDER](36-SPEC-RENDER.md) §13 D3).
- `braindog-render/svelte` — the interpreter. `svelte` as an **optional peer**.

**Cost, stated: two renderers that can drift.** Mitigated by one fixture corpus, shipped in the
tarball, and a test asserting both paths produce the same accessibility tree and the same declared
column tracks. *(HTML-snapshot equality was already banned, so identical markup was never the
contract.)*

**Refused: making `toHTML` call `render()` from `svelte/server`.** It deletes the drift risk and
makes the package unusable to anyone not on Svelte — killing the only distribution instrument in the
plan.

---

## 3 · Language and toolchain

| Decision | Pick | Why |
|---|---|---|
| Language | **TypeScript**, `strict`, `verbatimModuleSyntax` | the closed lists are the security argument, and a union type is the cheapest enforcement of one |
| TypeScript version | **pinned 6.0.3, not 7.0.2** | `typescript-eslint@8.69.0` declares `typescript: >=4.8.4 <6.1.0`. **TS 7 and type-aware linting are mutually exclusive today.** Pin with a dated comment; revisit quarterly |
| Package manager | **pnpm 11.25.0** | Cloudflare's own `workers-sdk` says *"use pnpm, not npm or yarn."* And three pnpm 11 defaults matter — see below |
| Task runner | **none** | pnpm 11.25 shipped a real scheduler: `tasks:` with `dependsOn: [^build]`, cycle detection, `--resume-from`. **That is most of what Turborepo is installed for, and it is now free** |
| Test runner | **Vitest 4.1.11** + **`@cloudflare/vitest-plugin` 1.1.2** — for `apps/worker/test` alone; every package's own `test` is `node --test` ([52-SPEC-TESTING-AND-CI](52-SPEC-TESTING-AND-CI.md) §13 D5) | renamed from `@cloudflare/vitest-pool-workers` on 2026-08-19. Peers `vitest ^4.1.0` **exactly** — Vitest 5 RC is out of range. **The repo's hardest external pin** |
| Property testing | **fast-check 4.9.0** | inspected: zero Node built-ins, one zero-dep dependency. **Runs unchanged inside workerd**, which matters because the compiler must be property-tested against a real Durable Object |
| Lint | ESLint flat + **`eslint-plugin-import-x`** — **deferred** until a rule needs an AST; `tools/gates/graph.mjs` covers layers 3–5 below until then. **No Stylelint**: the CSS gates are the twelve rules of `css-rules.mjs`, one regex tokeniser, zero dependencies ([52-SPEC-TESTING-AND-CI](52-SPEC-TESTING-AND-CI.md) §13 D10, D11) | when it lands, never `eslint-plugin-import`: no release since 2025-06-20, 581 open issues |
| E2E | **Playwright 1.64.1** + **axe-core 4.14.0** | the rendered-box and contrast gates run in a real browser ([18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6); Playwright specs are the one gate family that is not a zero-dependency script |
| Deploy | **wrangler 4.157.0** | read from the registry 2026-09-02 |
| UI | **Svelte 5.57.3 / SvelteKit 2.70.3** | [22-FRONTEND](22-FRONTEND.md) §2; read from the registry 2026-09-02 |
| Node | **24.13.0**, pinned to the minor | `node:sqlite` is the self-host default driver (§5) and is still **Stability 1.1** — an earlier draft said 1.2 (RC) — and still emits `ExperimentalWarning`; FTS5 is present in the official build (measured 2026-09-02, §10) and the boot probe re-measures it on every start |
| Runtime, `declare` | **valibot 1.4.2** (§9) · **`yaml` 2.9.1**, behind `@braindog/declare/yaml` and on the CLI and self-host paths only | [ADR-046](16-DECISIONS.md) enumerates both; [ADR-063](16-DECISIONS.md) is the parser's own decision |
| Build, dev only | **esbuild** — the CLI bundles to one file, `--platform=node --format=esm --target=node24` · **`@sveltejs/adapter-static`** · **`@valibot/to-json-schema`** — the tool-schema generator, at build | pinned in the catalog from the registry at the first commit; none ships ([48-SPEC-CLI](48-SPEC-CLI.md) §13 D4; [50-SPEC-WEB](50-SPEC-WEB.md) §13 D2; [44-SPEC-MCP](44-SPEC-MCP.md) §13 D1) |

### Three pnpm 11 defaults that are load-bearing

| Default | Keep it because |
|---|---|
| **`minimumReleaseAge: 1440`** (24 h) | a free supply-chain cooldown, on by default since Shai-Hulud 2.0 compromised 400–800 packages at ~2B monthly downloads |
| **`linkWorkspacePackages: false`** | every internal dep must say `workspace:*`, so a typo'd internal name goes to the registry and **fails loudly** instead of silently linking |
| Settings moved to `pnpm-workspace.yaml` | `packages:`, `catalog:`, `allowBuilds:`, `tasks:` — not `.npmrc` any more |

**Never `nodeLinker: hoisted` or `shamefullyHoist`.** Either one deletes enforcement layer 1 below,
entirely. Use `publicHoistPattern` for a specific broken package instead.

### Enforcement: five layers, four of them free

| Layer | Catches |
|---|---|
| **1 · pnpm's isolated layout** | an undeclared package import → `ERR_MODULE_NOT_FOUND`. Workspace packages live outside `node_modules`, so the hoisting leak does not reach them |
| **2 · an `exports` map per package** | a deep import into internals → `ERR_PACKAGE_PATH_NOT_EXPORTED`. Three lines each |
| **3 · `import-x/no-relative-packages`** — `graph.mjs` until ESLint lands | **the hole layer 1 cannot see.** `import '../../where/src/index.js'` from inside `packages/render/src/` **works fine** under pnpm — and it is exactly the import that would break the MIT boundary. *The dangerous form is the one nothing blocks by default* |
| **4 · path-scoped `no-restricted-imports`** — `graph.mjs` until ESLint lands | `node:*` and `cloudflare:*` under `packages/**`, save §1's two `node:*` paths; bare `fetch` under `packages/record/**` and `packages/slash/**`; `RegExp` under `packages/extract/**` |
| **5 · `tools/gates/graph.mjs`** | the seventeen-row edge table of §2, in its order, and acyclicity. ~40 lines, zero deps |

*Plus a sixth for free: per-package `tsconfig` `references` mirror the graph, and `tsc -b` fails on a
cycle.*

**Refused: dependency-cruiser.** Good tool. It needs a second resolver config kept in sync with
tsconfig, and **the thing that enforces a seventeen-row table should be as small as the table.**

---

## 4 · The licence boundary

Apache-2.0 app, MIT renderer, one repository. Two licences, by path, and the whole of this section
is about making every scanner agree with that one sentence.

**Apache-2.0 for the product.** The business is the hosted record and the data in it, not the
source, so the licence has no work to do beyond getting out of the way. What it adds over MIT is an
explicit patent grant and a trademark clause, both of which matter for a product with a company
behind it and neither of which costs an adopter anything.

**MIT for `packages/render`.** The block dialect is meant to be embedded anywhere, including in code
that is not open at all, and MIT asks nothing of whoever embeds it. The root `LICENSING.md` is the
routing table, and it is the file a person reads; the rules below are what keep a machine reading
the same thing.

The research turned up one model to copy and one to avoid.

| | |
|---|---|
| **Copy Grafana** | root `LICENSE` is the plain text of the app's own licence; root `package.json` names that same SPDX id and is `private: true`; `packages/grafana-ui` carries its own `LICENSE` and its own `"license"` field; a root **`LICENSING.md`** routes paths to SPDX names. **GitHub's licence API then reports one licence for the repository, the root one**, and the exception is discoverable by anyone who looks for it |
| **Avoid cal.com** | root `LICENSE` is 21 lines of plain MIT; root `package.json` has **no `license` field at all**. **GitHub's API reports the whole repo as `MIT`** — for a codebase whose app is AGPL and whose `ee/` tree is commercial. The root file is what every scanner believes, so a root file that is not the app's licence is a claim nobody meant to make |

### The failure mode is that the separable half will not build

Three reproductions of the same shape: a package a repository advertises as separable, that is not.

| | |
|---|---|
| cal.com #13575 | *"there are 254 imports `from "@calcom/features/ee/` in the open-source parts… In effect, there is no open-source cal.com."* |
| Rocket.Chat #34053 | their own de-EE script deletes the directories; the build still fails because MIT code imports the licence package |
| **Grafana Loki #13019** | Apache code imports AGPL code. Staff reproduced it and said they would add CI validation *once false positives could be reduced.* **Two years on there is no check and the issue is open** |

> **That last row is the whole argument for building the gate in commit one.** It is thirty lines on
> day one and an archaeology project at day 400.

### The rules

| # | Rule |
|---|---|
| 1 | **The root `LICENSE` is the Apache-2.0 text and nothing else.** GitHub's own guidance: *"simplify your LICENSE file and note the complexity somewhere else."* Put MIT at the root and you have told every scanner the whole app is MIT, dropping the patent grant and the trademark clause that are the reason for choosing Apache-2.0 at all, and that is not retroactively fixable for anyone who relied on it |
| 2 | **`LICENSING.md` routes paths to SPDX names.** Grafana's shape, and short enough that it stays true |
| 3 | **The filename must be exactly `LICENSE`.** With a `files` field set, npm auto-includes `LICENSE`/`LICENCE`/`COPYING`/`README*` and **silently drops `LICENSE_APACHE2` or `NOTICE`** |
| 4 | **A real file, not just the field** — otherwise a scanner falls back to the repo root and reports the renderer as `Apache-2.0` |
| 5 | **Never `"SEE LICENSE IN LICENSE"`.** It renders as *unknown* to every policy gate, and gates treat unknown as block. Use the bare identifier |
| 6 | **SPDX headers on `packages/render/src/**` only** — the only thing that protects a single file copied out. Everything else is covered by the root `LICENSE`, and headers on 300 files is churn nobody maintains |
| 7 | **No `NOTICE` file, and that is a choice.** Apache-2.0 §4(d) binds a redistributor only when the work it took actually carries one, so shipping a `NOTICE` would hand every adopter an obligation for the sake of a copyright line. It would also be the exact file rule 3 says npm silently drops, which is an obligation created and then packaged away |
| 8 | **The closure is enforced on the artefact, not the intent.** `npm pack --dry-run --json`, then assert: every entry is under `dist/`/`src/`/`test/fixtures/` or is `LICENSE`/`README`/`package.json`; `dependencies` is empty; the built ESM contains no `@braindog/` and no `../../`; both LICENSE files start with the right words |

**The `render` boundary is an engineering rule first, and the gate is what holds it.** `render` has
in-degree 0 in the package graph and `tools/gates/graph.mjs` asserts it, because a renderer with
zero dependencies is what makes it embeddable at all and what makes gate 1a a registry query for
`depends:braindog-render`. The licence reads the same line rather than driving it: a tarball
published as MIT should contain only what its own `LICENSE` covers, so an import out of the
repository and into `render` is a finding for two independent reasons. One check, two jobs, thirty
lines.

**The sole-copyright-holder point, because it changes the risk.** Bitwarden, Element, Grafana, n8n
and cal.com all require a CLA precisely so they *can* change a licence. A sole holder has that for
free, can relicense either half at will, and cannot be sued by a contributor for a mistake. **The
residual risk is downstream confusion, not legal exposure**, which is why every control above is
about signalling.

**Refused: a separate repo for the renderer.** It has the best record in the survey — Element split
its SDK from its clients and produced *zero* "what licence is this?" issues. Refused for
solo-maintainer economy. **Reverse it the day a second person commits, or the day the gate is
bypassed once.**

---

## 5 · The ports — nine, not six

[01-ARCHITECTURE](01-ARCHITECTURE.md) §4 said *"six adapters"* over a table with eight rows. Neither
count was right: **search is not a seam** (FTS5 is a feature of `Sql`), **compute is not an
interface** (it is which `apps/*` you deploy), and **three were missing.**

| # | Port | Cloud | Self-host |
|---|---|---|---|
| 1 | **`Sql`** | `ctx.storage.sql` | **`node:sqlite`** — the default on Node ≥ 24.13, zero native dependencies, FTS5 and JSON1 present (measured on 24.13.0, §10); there is no `better-sqlite3` — the Node minor is pinned, so the older Node it would serve does not arise ([37-SPEC-PORTS](37-SPEC-PORTS.md) §13 D9) — and `bun:sqlite` is unsupported. The adapter enforces **`DO_LIMITS`** above the driver ([30-BLUEPRINT](30-BLUEPRINT.md) §13) and throws the DO adapter's closed error vocabulary, so the Node adapter refuses first. A build without FTS5 is **refused at boot** — there is no degraded mode ([ADR-038](16-DECISIONS.md)). *An earlier draft said `better-sqlite3` default, `node:sqlite` degraded, on the claim that official Node builds lack FTS5; measured false* |
| 2 | `Scheduler` | DO alarm | one `setTimeout` over `MIN(due_at)` |
| 3 | **`Clock`** *(new)* | `Date.now()` | `Date.now()` |
| 4 | `Blobs` | R2 | `node:fs` under a root |
| 5 | `Inference` | Workers AI via the gateway — **BYO key is the same adapter, a different base URL and keychain access** | any OpenAI-compatible endpoint |
| 6 | `Dispatch` | Email Service · VAPID · fetch | SMTP · VAPID · undici |
| 7 | **`Http`** *(new)* | `fetch`, `redirect: 'manual'` | undici with an agent refusing private IPs |
| 8 | **`KeyStore`** *(new)* | Secrets Store | env var or an `0600` file |
| 9 | `Snapshots` | bookmarks + nightly `.brain.age` | scheduled snapshot with retention |

Plus **`Ingress`**, which is an entrypoint contract rather than an interface.

### The best line in the file

```ts
exec<T = Row>(query: string, ...params: Param[]): Cursor<T>;  // SYNCHRONOUS — one statement when a param is supplied (MULTI_STATEMENT_PARAMS)
execScript(sql: string): void;                              // the migration runner only; no params
transactionSync<T>(fn: () => NotPromise<T>): T;             // SYNCHRONOUS
readonly caps: Capabilities;                                // measured at open: sqlite, fts5, json, the DO_LIMITS numbers
```

The full port signatures — `Cursor`, `Row`, `Param`, `Capabilities`, and the other eight ports with
`Ingress` — are in [33-CONTRACTS](33-CONTRACTS.md) §1; this document keeps only the line that
matters.

DO SQLite and `node:sqlite` are both synchronous. An async signature would permit
an `await` between two writes inside a transaction — **the exact interleaving
[01-ARCHITECTURE](01-ARCHITECTURE.md) §2 spends a page on.**

> **A synchronous type makes the concurrency bug unrepresentable rather than merely forbidden**, and
> `NotPromise<T>` closes the async-callback hole at compile time.

`Param` excludes `boolean` and `undefined`. DO's SQL API rejects them; `node:sqlite` does not coerce
a boolean — it throws — while it binds a `Date` as `NULL`, so the two drivers disagree in three
different ways. The adapter refuses every non-`Param` value as `SYNTAX` before either driver sees it
([37-SPEC-PORTS](37-SPEC-PORTS.md) §13 D5), which is what stops the asymmetry passing every self-host
test and failing in production; it is conformance case #1. *(An earlier draft said `node:sqlite`
coerces.)*

And `BlobKey` is a branded type with `blobKey(recordId, sha256)` as its **only** constructor — which
makes the cross-tenant dedupe leak in [03-DOG-FORMAT](03-DOG-FORMAT.md) §8 unrepresentable rather
than merely forbidden.

### The check that makes conformance real

The cases are **a plain array, not a `describe` block**, and `Assert` is a four-method interface the
host supplies — `ok · equal · deepEqual · fail` ([37-SPEC-PORTS](37-SPEC-PORTS.md) §13 D7; an earlier
draft said six). No test framework is imported — so the same list runs under `node --test`, under
the Cloudflare plugin's Vitest, and under any host a self-hoster supplies to certify their own build.

> **Then CI asserts each host ran the same number of cases, and prints every skip reason.** A skip
> becomes visible and attributed, never silent. *That* is the difference between self-host parity
> being a claim and being a number.

---

## 6 · Publishing

**Two packages: `braindog-render` (MIT) and `braindog-cli` (Apache-2.0).** Unscoped, because gate 1a is
literally a registry query for `depends:braindog-render`.

`braindog`, `braindog-render`, `braindog-cli`, `braindog-mcp` and the `@braindog` scope are **all
free on npm today**. Reserve them in the first five minutes — `braindog-mcp` is reserved and never
published under this design; the MCP handler ships inside the Worker and `braindog-cli`
([ADR-042](16-DECISIONS.md)). On GitHub, `braindog` is a dormant 2013
account and `brain-dog` is taken — **pick an org name before the first push**, because a repo move
after gates 1a–1d start breaks every dependent link they are measured on.

### Four version numbers, deliberately independent — three of them the record's

| Number | Moves when |
|---|---|
| `braindog-render` semver | any API change |
| **`PRIMITIVES_VERSION`** (integer) | the eight primitives change. A bump implies a renderer major; not conversely. **1 at stage 0** |
| **`.brain` `user_version`** — the format revision | a reader below it would **misread** the file. An additive migration does not bump it. **1 at v1**; `record.format_ver INTEGER` mirrors it for readers without PRAGMA access |
| kernel migration number — `MAX(migration.version)` | every applied migration. 1 at v1 |

**The app has no semver.** It is a hosted service. `braindog --version` prints the tuple —
`app 2027.03.14+a1b2c3 · format 1 · kernel 41 · primitives 1` — **and that tuple is the version
surface a bug report should carry.** *(An earlier draft printed `format 3 · primitives 3`, values
[03-DOG-FORMAT](03-DOG-FORMAT.md) had already withdrawn; v1 ships every number at 1.)*

**A pack's `requires:` names `format`, `primitives` and `packs` — never an app version, and never
`kernel`:** `requires: { format: 1, primitives: 1, packs: { money-core: "^1" } }`. A migration
number is not a compatibility promise; the format revision is.

### npm auth changed underneath everyone

| | |
|---|---|
| 2025-07-31 | Trusted Publishing with OIDC goes GA |
| 2025-11-24 | Shai-Hulud 2.0 |
| **2025-12-09** | **All classic tokens permanently revoked.** Not deprecated — revoked |
| 2026-02-03 | Existing granular tokens forcibly expired |

Granular write tokens now expire in **7 days by default, 90 maximum**. So: trusted publishing,
`permissions: { id-token: write }`, and **provenance is automatic — the `--provenance` flag is not
needed.** Two caveats: the config is **per package**, so do it twice; and it is unclear whether it
works for a package's *first* publish, so **publish `0.0.1` by hand and wire it up afterwards.**

**Refused: Changesets.** Genuinely healthy, and refused anyway — two packages with independent
version lines and no edge between them makes `.changeset/*.md` a ritual for an audience of one.
Adopt at package #3 or contributor #2.

---

## 7 · `.gitattributes` is load-bearing here, not hygiene

**Measured on this machine today:** `core.autocrlf=true` is set at the **system** level — the
Git-for-Windows installer default. Without `.gitattributes`, every text file checks out CRLF.

That is not cosmetic in *this* product:

- `declaration.checksum` and the `.brain` manifest's canonical projection are **content hashes over
  checked-in files**. A `.pack.yaml` fixture hashes differently on Windows than on Linux CI, so the
  round-trip test **passes in one place and fails in the other with a diff that shows nothing.**
- Shell scripts get `bad interpreter: /bin/sh^M` inside the self-host Docker build.

```gitattributes
* text=auto eol=lf
*.brain binary
*.brainl.age binary
*.sqlite binary
*.woff2 binary
*.sh  text eol=lf
*.ps1 text eol=crlf
```

**It must be in commit one.** `.gitattributes` is not retroactive.

---

## 8 · The tree

```
braindog/
├── .github/workflows/{ci,gates,deploy,release,gate1,nightly}.yml   gate1.yml is a report, never a gate
├── apps/
│   ├── cli/          braindog-cli · PUBLISHED · esbuild → one file, no deps
│   ├── selfhost/     Node 24.13+ · node:sqlite · the "free and complete" artefact · Dockerfile
│   ├── web/          Svelte 5 + SvelteKit · adapter-static · one build/ both hosts serve · no SSR entry
│   └── worker/       the single Cloudflare deployment · three DO classes — Record, Slash, Directory — ~60 lines each
├── packages/
│   ├── connect/      ingest with fetch: · placeholders · formats · expect: · probe: · metric_point
│   ├── declare/      every kind (`KINDS`) · 16 field types · one schemas.ts · ./yaml — the one YAML parser (ADR-063)
│   ├── extract/      10 extractors + 3 combinators. No regex, ever — a scoped lint rule says so
│   ├── fixtures/     9 records (8 pages + corpus) · row JSON + rows/gen.mjs for the generated corpora · a pack corpus
│   ├── host/         ROUTES · httpStatus · resolveContext · serveApi · the MCP wiring — what both hosts share (ADR-064)
│   ├── kernel/       27 tables (+ 4 dog_* header tables) · migrations as .ts modules · ULID · money · time · the erase cascade
│   ├── mcp/          16 tools · resources · 3 prompts · the token budget in CI · src/ imports ports alone
│   ├── ports/        ★ the linchpin: 9 interfaces · the Refusal type · ./node-sqlite · the conformance cases · no fakes
│   ├── record/       the RPC surface, 64 methods · ./directory · Ports = { Sql, Scheduler, Clock }. Nothing else
│   ├── render/       ★★ MIT · PUBLISHED · in-degree 0 · its own LICENSE
│   ├── slash/        the assistant. Ports = { Sql, Clock, Inference }. Phase B7 · ./prompts is data
│   ├── theme/        OKLCH generator · Brettel 1997 · the 16 checks · nextAccentHue · DTCG 2025.10
│   └── where/        ./ = parse·print·validate (browser)   ./sql = compile (server)   no ./text
├── docs/             the fifty-four documents
├── tools/gates/      zero-dependency scripts for the source and artefact gates; graph.mjs holds §2's seventeen-row
│                     table in its order; budgets.json holds every asserted number; negative/<gate>/ holds one
│                     seeded violation each; rendered-box gates are Playwright specs under apps/web/test —
│                     the inventory is 33-CONTRACTS §8
└── LICENSE · LICENSING.md · CONTRIBUTING.md · SECURITY.md · .gitattributes · package.json — six root scripts:
                      test typecheck gates test:browser test:do release
```

**`apps/worker/src/do/record.ts`, `slash.ts` and `directory.ts` are ~60 lines each. If any passes
100, logic has leaked out of a package and into a runtime** — and that is a review comment, not a
refactor to schedule. *(An earlier draft said two DO classes; identity — email → person, slug →
record, sessions, magic links, the lockout — needed a home outside every record, and it is the third
class, `Directory`, one instance. On the self-host it is `directory.sqlite` in the same process.)*

There is no staging environment: the ops record — slug `ops`, in production — is the canary, the
drill target and the operator's audit ledger ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §13 #14).

---

## 9 · Validation, and the rule that is not about libraries

Packs are YAML validated against closed schemas with refusals that name the field. The library
choice matters less than one thing measured in real workerd (Miniflare 4.20260730.0, compat
2026-08-01):

| Where `new Function` / `Ajv.compile()` runs | Result |
|---|---|
| **Module top level** | ✅ **works** |
| Inside `fetch()` | ❌ `EvalError: Code generation from strings disallowed for this context` |
| **Inside a Durable Object constructor** | ❌ same |

> ### Construct schemas and compile validators at module top level. Never in the DO constructor.
>
> **The DO constructor *is* request context.** A module-scope-compiled validator is freely callable
> from inside the object — that part works. Any plan that compiles one *in* the constructor is dead
> on arrival, and it fails at runtime on the first request rather than at build.

The same measurement kills a documented optimisation: **`z.compile()` silently degrades in a
Durable Object** — it reports success and delivers zero speedup, because Zod catches the `EvalError`
and restores the interpreted path. The published 2.4–9× figures are unavailable there, and nothing
tells you.

### The pick: Valibot 1.4.2

Measured on a realistic closed pack schema, esbuild-minified with wrangler's own config:

| | gzip | cold start | valid µs/op | invalid µs/op |
|---|---:|---:|---:|---:|
| hand-rolled | 764 B | 0.49 ms | 0.83 | 0.60 |
| `ajv/dist/standalone` (build-time) | 1.6 kB | 0.66 ms | **0.49** | **0.24** |
| **`valibot`** | **2.1 kB** | **0.87 ms** | 6.12 | 2.97 |
| `zod/mini` + `en` locale | 7.8 kB | 2.92 ms | 7.02 | 7.91 |
| `zod`, named imports | 25.0 kB | 6.91 ms | 2.45 | 6.63 |
| `zod`, `import { z }` | 87.4 kB | 14.46 ms | 2.31 | 6.36 |
| `arktype` | 47.1 kB | **90.7 ms** | 3.01 | **38.42** |

**Three things that table decides:**

| | |
|---|---|
| **ArkType is out** | 90.7 ms is **9% of the one-second startup budget for a single schema module**, `jitless` does not help (86.9 ms — the cost is graph construction, not codegen), and **its error path is 12× its success path.** That is the wrong asymmetry for a validator whose entire job is producing refusals |
| **`zod/mini` is a trap for this product specifically** | it tree-shakes the locale away, so every refusal becomes `✖ Invalid input` with no field and no expectation. **Undocumented** on the page that sells Mini on size. Restoring the messages costs 1.1 kB — at which point the size advantage is gone. Given the requirement is *precise refusals*, shipping it naively defeats the point |
| **`import { z }` costs 3.5× the bytes** | 87.4 kB against 25.0 kB. **Rollup shakes the `z` namespace; esbuild does not — and wrangler uses esbuild.** Zod's own source comment says otherwise. Named imports only, if Zod is ever chosen |

**And a correction to the premise:** the Workers size ceiling is measured in **gzip, not brotli**, and the worst candidate in that table uses **1.6% of the free budget.** So bundle size is *not* a real constraint for the Worker. It binds in exactly one place — where the same schema ships to the browser to drive the generated form — which is where Valibot's 2.1 kB earns its keep and nowhere else.

### Why not JSON Schema as the source of truth

Ajv is the fastest and smallest thing in the field, and it still loses, for a reason that is about
this product rather than about Ajv:

- **Its errors fail the stated bar literally.** An unknown key comes back with `instancePath: ""` — the offending field is only in `params.additionalProperty`. An enum error says *"must be equal to one of the allowed values"* with the values hidden. Every other library puts the bad key in the path. Reaching *"name the field and what was expected"* needs a message-rewriting layer.
- **`allOf` + `additionalProperties: false` accepts nothing but `{}`** — reproduced. Two closed objects composed with `allOf` each reject the other's fields, and `strict: true` does **not** warn. A pack document is a base plus typed variants, which is exactly the shape that triggers it. The fix is `unevaluatedProperties` on draft 2019-09+, i.e. a different import.

> **But not a flat refusal:** if JSON Schema ever becomes the primary artefact, **`ajv/dist/standalone` at build time** is the right answer and is *identical in speed* to runtime-compiled Ajv (0.49 vs 0.48 µs). There is no reason to ship runtime Ajv at all.

### The honest cost of the pick

**Standard Schema's `~standard.jsonSchema` is live**, and Zod and ArkType expose it while Valibot
does not. Writing the MCP tool-definition generator against it would be a vendor-neutral seam;
choosing Valibot binds that generator to `@valibot/to-json-schema` instead. **That is cheap, because
the generator runs at build time** — but it is the cost, and it should be named rather than
discovered. Named, then, and since avoided: the sixteen tools carry hand-written JSON Schemas in
`packages/mcp/src/index.ts`, so no generator runs and nothing can drift from one
([44-SPEC-MCP](44-SPEC-MCP.md) §2).

*(One more measured trap, whichever is picked: `z.toJSONSchema()` **silently drops `.refine()`** —
emitting a schema without the constraint — while Valibot and ArkType throw. An MCP tool definition
that quietly under-describes its own contract is worse than one that fails to build.)*

---

## 10 · Corrections this produced

| Doc | Correction |
|---|---|
| [01-ARCHITECTURE](01-ARCHITECTURE.md) §4 | *"Six adapters"* over an eight-row table. It is **nine ports**, and three were missing entirely: `Clock`, `KeyStore`, `Http` |
| [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §5 | **`pushforge` does not exist on npm.** The package is `@pushforge/builder@2.0.5` (MIT, zero deps). And `age-encryption` pulls **five** transitive deps — *"one dependency"* is six |
| [17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q12 | **Half answered, today.** On Node 24.13.0, `node:sqlite`'s planner *does* use a partial expression index: `SEARCH entry USING INDEX entry_obligations_due (<expr><?)`. The workerd half is still the week-one spike — **and it becomes a conformance case rather than a spike, so the answer is permanent.** *Extended 2026-09-02:* the bound-parameter form (`register` as `?`, which is what the compiler emits) was measured too and also uses the index — Q12 is fully answered for Node; the Durable Object is week one |
| [25-CONNECTORS](25-CONNECTORS.md) §5.3 | the `for_each` example names `braindog-mcp`, which nothing publishes under this design. Reserve the name |
| Everywhere | `@cloudflare/vitest-pool-workers` → **`@cloudflare/vitest-plugin`** |
| **2026-09-02** — [01-ARCHITECTURE](01-ARCHITECTURE.md) §4, [30-BLUEPRINT](30-BLUEPRINT.md) §13, this document §5 | **`node:sqlite` on official Node 24.13.0 HAS FTS5** — measured: SQLite 3.50.4, compile options include `ENABLE_FTS5`, `CREATE VIRTUAL TABLE … USING fts5` succeeds. The 2026-09-01 "official builds compile without FTS5" claim was wrong (nodejs/node#56476 was closed because FTS5 was *enabled*), so `node:sqlite` is the self-host default and there is no degraded mode. **And `DatabaseSync` has no `limits` option** — unknown option keys are silently ignored and there is no `setLimit` — so `DO_LIMITS` parity is enforced in the adapter, above the driver: param count before `prepare`, LIKE pattern length on every bound pattern, statement length before `exec`; compound depth and expression depth are properties of the compiler's output, asserted by the property test |

---

*Next: [30-BLUEPRINT](30-BLUEPRINT.md) for the contracts this layout implements.*
