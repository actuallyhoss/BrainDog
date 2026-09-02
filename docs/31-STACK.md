# 31 · The stack, and the repository

Languages, layout, ports, publishing. Every version was read from the registry or run locally on
**2026-09-01**; the rows dated **2026-09-02** were re-measured then, and one of them reverses a
2026-09-01 claim (§10).

---

## 1 · The rule that generates the layout

> ### `packages/*` may name a **capability**. Only `apps/*` may name a **runtime**.

The moment a file writes `import { DurableObject } from 'cloudflare:workers'` or
`import { DatabaseSync } from 'node:sqlite'`, it belongs in `apps/`.

That single rule is what makes [01-ARCHITECTURE](01-ARCHITECTURE.md) §4's self-host claim structural
rather than aspirational — and it is exactly the thing
[22-FRONTEND](22-FRONTEND.md) §11 names as expensive to reverse: *"if one `ctx.storage.sql` call
leaks into a component, self-host is broken and you learn it from a user."*

**Every `packages/*` must run in workerd, in Node, and in a bare Vitest process.** That is not a
consequence of the boundaries — it *is* the boundary. Permitted surface: ES2023, WebCrypto,
`TextEncoder`, `structuredClone`, `URL`, `Intl`. Banned under `packages/**`: `node:*`,
`cloudflare:*`, `process`, `Buffer`, `__dirname`, and bare `fetch`.

---

## 2 · The package graph

```
 L3  apps/worker      apps/selfhost     apps/web        apps/cli
     wrangler · DOs   node · fs         SvelteKit       one file
         │  │  │          │  │  │         │  │  │        │  │  │
 L2      └──┴──┼──────────┴──┼──┼─────────┼──┼──┼────────┼──┼──┤
               │             │  │         │  │  │        │  │  │
            record ──────────┘  │         │  │  │        │  │  │
            RPC · write path    │         │  │  │        │  │  │
            NO network object   │         │  │  │        │  │  │
               │  │  │  │       │         │  │  │        │  │  │
 L1         mcp┘  │  │  │       │         │  │  │        │  │  │
                  │  │  │       │         │  │  │        │  │  │
            declare  kernel  extract      │  │  │        │  │  │
               │  │     │  │     │        │  │  │        │  │  │
 L0  ──────────┼──┼─────┼──┼─────┼────────┼──┼──┼────────┼──┼──┤
            render      where            ports    theme    fixtures
            ★ MIT       parse·print      9 ifaces  oklch    devDep
            in-deg 0    /sql             + conf.   16 chk   only
```

**Acyclicity is proved by exhibiting a total order** in which every package's dependencies have
strictly lower indices — a cycle would require an edge that increases the index:

| # | Package | Depends on |
|---|---|---|
| 1 | `render` | — |
| 2 | `ports` | — |
| 3 | `where` | — |
| 4 | `theme` | — |
| 5 | `fixtures` | — |
| 6 | `kernel` | 2, 3 |
| 7 | `declare` | 1, 3 |
| 8 | `extract` | 3 |
| 9 | `mcp` | 2, 7 |
| 10 | `record` | 2, 3, 4, 6, 7, 8 |
| 11 | `spark` | 2, 7 — Phase B7; ports `{ Sql, Clock, Inference }`, hosted by `apps/worker/src/do/spark.ts` |
| 12 | `cli` | 1, 2, 3, 6, 7 |
| 13 | `web` | 1, 3, 7 |
| 14 | `worker` | 1–4, 7–11, 13 |
| 15 | `selfhost` | 1–4, 6–11, 13 |

**Eleven workspaces at the §1b shape, fourteen at the end of Phase A, sixteen at platform.** The
order is also the build order, so `pnpm -r run build` reproduces it for free. *(An earlier draft had
no `spark` package: the assistant's object had ports and no capability package to hold them.)*

### Each boundary, by what it prevents

| Edge, or its absence | Prevents |
|---|---|
| **`render` has in-degree 0** | the MIT tarball containing AGPL code. **The only boundary here with a legal consequence** — §4 |
| **`record`'s ports are exactly `{ Sql, Scheduler, Clock }`** | [ADR-002](16-DECISIONS.md) becoming a comment. No `Http`, no `Inference`, no `Dispatch`. *"The record cannot speak"* becomes *"the record has no object to speak with"*. The one outbound act — the outbox doorbell — is `Scheduler.wake()`: Cloud `OUTBOX_Q.send({ record })`, self-host a no-op |
| **`kernel` → `where`** | the index and the predicate disagreeing. `where` owns `jsonPath(fieldId)`, so `CREATE INDEX … json_extract(fields,'$.due')` and `WHERE json_extract(fields,'$.due') < ?` are **the same string** — which is the difference between the planner using the partial expression index and scanning it |
| **`where` ⇏ `ports`, ⇏ `kernel`** | shipping the SQL schema to the browser. The query builder round-trips `parse(print(t)) ≡ t` client-side, so `where` has a fourth runtime. Split: `where` (parse · print · validate) and `where/sql` (compile). The client imports only the first |
| **`declare` ⇎ `theme`** | the one cycle the design invites. `declare` owns *shape*, `theme` owns *semantics*; `record` orchestrates both. Neither imports the other |
| **`declare` ⇏ `kernel`** | `braindog pack lint` needing a database. A pack must lint offline, from a file |
| **`mcp` ⇏ `record`** | the MCP server reaching into internals, and being untestable without a Durable Object |
| **`record` ⇏ `render`** | markup in the record, and therefore markup in the `.dog` |
| **`fixtures` is a devDependency everywhere** | 402 lines of one person's seed data shipping in a bundle — the exact defect the clean room exists to avoid |

### The one compromise, named

The client interpreter is a recursive Svelte component, and a genuinely zero-dependency MIT package
cannot contain it. **Two subpath exports, one package:**

- `braindog-render` — `parse` · `expand` · `toHTML` · `PRIMITIVES`. Zero dependencies, zero peers.
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
| Test runner | **Vitest 4.1.11** + **`@cloudflare/vitest-plugin` 1.1.2** | renamed from `@cloudflare/vitest-pool-workers` on 2026-08-19. Peers `vitest ^4.1.0` **exactly** — Vitest 5 RC is out of range. **The repo's hardest external pin** |
| Property testing | **fast-check 4.9.0** | inspected: zero Node built-ins, one zero-dep dependency. **Runs unchanged inside workerd**, which matters because the compiler must be property-tested against a real Durable Object |
| Lint | ESLint flat + **`eslint-plugin-import-x`** | never `eslint-plugin-import`: no release since 2025-06-20, 581 open issues |
| E2E | **Playwright 1.62.1** + **axe-core 4.13.0** | the rendered-box and contrast gates run in a real browser ([18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6); Playwright specs are the one gate family that is not a zero-dependency script |
| Deploy | **wrangler 4.128.0** | read from the registry 2026-09-02 |
| UI | **Svelte 5.57.0 / SvelteKit 2.70.3** | [22-FRONTEND](22-FRONTEND.md) §2; read from the registry 2026-09-02 |
| Node | **24.13.0**, pinned to the minor | `node:sqlite` is the self-host default driver (§5) and is still **Stability 1.1** — an earlier draft said 1.2 (RC) — and still emits `ExperimentalWarning`; FTS5 is present in the official build (measured 2026-09-02, §10) and the boot probe re-measures it on every start |

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
| **3 · `import-x/no-relative-packages`** | **the hole layer 1 cannot see.** `import '../../where/src/index.js'` from inside `packages/render/src/` **works fine** under pnpm — and it is exactly the import that would break the MIT boundary. *The dangerous form is the one nothing blocks by default* |
| **4 · path-scoped `no-restricted-imports`** | `node:*` and `cloudflare:*` under `packages/**`; bare `fetch` under `packages/record/**` |
| **5 · `tools/gates/graph.mjs`** | the fifteen-row edge table and acyclicity. ~40 lines, zero deps |

*Plus a sixth for free: per-package `tsconfig` `references` mirror the graph, and `tsc -b` fails on a
cycle.*

**Refused: dependency-cruiser.** Good tool. It needs a second resolver config kept in sync with
tsconfig, and **the thing that enforces a fifteen-row table should be as small as the table.**

---

## 4 · The licence boundary

AGPL-3.0-only app, MIT renderer, one repository. This is the only boundary here with a legal
consequence, and the research turned up one model to copy and one to avoid.

| | |
|---|---|
| **Copy Grafana** | root `LICENSE` is the plain AGPLv3 text; root `package.json` is `AGPL-3.0-only, private: true`; `packages/grafana-ui` carries its own `LICENSE` and `"license": "Apache-2.0"`; a root **`LICENSING.md`** routes paths to SPDX names. **GitHub's licence API reports the repo as `agpl-3.0`** — one licence, the restrictive one |
| **Avoid cal.com** | root `LICENSE` is 21 lines of plain MIT; root `package.json` has **no `license` field at all**. **GitHub's API reports the whole repo as `MIT`** — for a codebase whose app is AGPL and whose `ee/` tree is commercial |

### The failure mode is not legal — it is that the free half will not build

Three reproductions of the same shape, permissive code importing copyleft code in one repo:

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
| 1 | **The root `LICENSE` is the AGPLv3 text and nothing else.** GitHub's own guidance: *"simplify your LICENSE file and note the complexity somewhere else."* Put MIT at the root and you have told every scanner the whole app is MIT — and that is not retroactively fixable for anyone who relied on it |
| 2 | **`LICENSING.md` routes paths to SPDX names.** Six lines, Grafana's shape |
| 3 | **The filename must be exactly `LICENSE`.** With a `files` field set, npm auto-includes `LICENSE`/`LICENCE`/`COPYING`/`README*` and **silently drops `LICENSE_APACHE2` or `NOTICE`** |
| 4 | **A real file, not just the field** — otherwise a scanner falls back to the repo root and reports the renderer as AGPL |
| 5 | **Never `"SEE LICENSE IN LICENSE"`.** It renders as *unknown* to every policy gate, and gates treat unknown as block. Use the bare identifier |
| 6 | **SPDX headers on `packages/render/src/**` only** — the only thing that protects a single file copied out. Headers on 300 AGPL files is churn nobody maintains |
| 7 | **`AGPL-3.0-only`, not `-or-later`** — "or later" hands a future FSF the ability to change your terms |
| 8 | **The closure is enforced on the artefact, not the intent.** `npm pack --dry-run --json`, then assert: every entry is under `dist/`/`src/`/`test/fixtures/` or is `LICENSE`/`README`/`package.json`; `dependencies` is empty; the built ESM contains no `@braindog/` and no `../../`; both LICENSE files start with the right words |

**The sole-copyright-holder point, because it changes the risk.** Bitwarden, Element, Grafana, n8n
and cal.com all require a CLA precisely so they *can* do this. A sole holder has it for free, can
relicense either half at will, and cannot be sued by a contributor for a mistake. **The residual
risk is downstream confusion, not legal exposure** — which is why every control above is about
signalling.

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
| 1 | **`Sql`** | `ctx.storage.sql` | **`node:sqlite`** — the default on Node ≥ 24.13, zero native dependencies, FTS5 and JSON1 present (measured on 24.13.0, §10); `better-sqlite3` is the alternative for an older Node; `bun:sqlite` is unsupported. Both drivers run under **adapter-enforced `DO_LIMITS`** ([30-BLUEPRINT](30-BLUEPRINT.md) §13) and throw the DO adapter's closed error vocabulary, so a Node adapter refuses first. A build without FTS5 is **refused at boot** — there is no degraded mode ([ADR-038](16-DECISIONS.md)). *An earlier draft said `better-sqlite3` default, `node:sqlite` degraded, on the claim that official Node builds lack FTS5; measured false* |
| 2 | `Scheduler` | DO alarm | one `setTimeout` over `MIN(due_at)` |
| 3 | **`Clock`** *(new)* | `Date.now()` | `Date.now()` |
| 4 | `Blobs` | R2 | `node:fs` under a root |
| 5 | `Inference` | Workers AI via the gateway — **BYO key is the same adapter, a different base URL and a vault grant** | any OpenAI-compatible endpoint |
| 6 | `Dispatch` | Email Service · VAPID · fetch | SMTP · VAPID · undici |
| 7 | **`Http`** *(new)* | `fetch`, `redirect: 'manual'` | undici with an agent refusing private IPs |
| 8 | **`KeyStore`** *(new)* | Secrets Store | env var or an `0600` file |
| 9 | `Snapshots` | bookmarks + nightly `.dog.age` | scheduled snapshot with retention |

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

DO SQLite, `node:sqlite` and `better-sqlite3` are all synchronous. An async signature would permit
an `await` between two writes inside a transaction — **the exact interleaving
[01-ARCHITECTURE](01-ARCHITECTURE.md) §2 spends a page on.**

> **A synchronous type makes the concurrency bug unrepresentable rather than merely forbidden**, and
> `NotPromise<T>` closes the async-callback hole at compile time.

`Param` excludes `boolean` and `undefined`, because DO's SQL API rejects them while `node:sqlite`
coerces. **That asymmetry passes every self-host test and fails in production**, so it is
conformance case #1.

And `BlobKey` is a branded type with `blobKey(recordId, sha256)` as its **only** constructor — which
makes the cross-tenant dedupe leak in [03-DOG-FORMAT](03-DOG-FORMAT.md) §8 unrepresentable rather
than merely forbidden.

### The check that makes conformance real

The cases are **a plain array, not a `describe` block**, and `Assert` is a six-method interface the
host supplies. No test framework is imported — so the same list runs under bare Vitest, under the
Cloudflare plugin, and under `node --test` if a self-hoster wants to certify their own build.

> **Then CI asserts each host ran the same number of cases, and prints every skip reason.** A skip
> becomes visible and attributed, never silent. *That* is the difference between self-host parity
> being a claim and being a number.

---

## 6 · Publishing

**Two packages: `braindog-render` (MIT) and `braindog-cli` (AGPL).** Unscoped, because gate 1a is
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
| **`.dog` `user_version`** — the format revision | a reader below it would **misread** the file. An additive migration does not bump it. **1 at v1**; `record.format_ver INTEGER` mirrors it for readers without PRAGMA access |
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

- `declaration.checksum` and the `.dog` manifest's canonical projection are **content hashes over
  checked-in files**. A `.pack.yaml` fixture hashes differently on Windows than on Linux CI, so the
  round-trip test **passes in one place and fails in the other with a diff that shows nothing.**
- Shell scripts get `bad interpreter: /bin/sh^M` inside the self-host Docker build.

```gitattributes
* text=auto eol=lf
*.dog binary
*.dog.age binary
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
├── .github/workflows/{ci,gates,deploy,release,gate1}.yml
├── apps/
│   ├── cli/          braindog-cli · PUBLISHED · esbuild → one file, no deps
│   ├── selfhost/     Node 24.13+ · node:sqlite · the "free and complete" artefact · Dockerfile
│   ├── web/          Svelte 5 + SvelteKit · entry-ssr.ts is the ONLY SSR entry
│   └── worker/       the single Cloudflare deployment · three DO classes — Record, Spark, Directory — ~60 lines each
├── packages/
│   ├── declare/      8 kinds · 16 field types · the refusal codes of 30 §6
│   ├── extract/      10 extractors + 3 combinators. No regex, ever
│   ├── fixtures/     8 reference pages · row JSON + seed.json (the .dog is materialised at test time) · a pack corpus
│   ├── kernel/       27 tables (+ 4 dog_* header tables) · migrations · ULID · money · time · the erase cascade
│   ├── mcp/          8 tools · resources · 3 prompts · the token-budget fixture
│   ├── ports/        ★ the linchpin: 9 interfaces + memory impls + the conformance cases
│   ├── record/       the RPC surface. Ports = { Sql, Scheduler, Clock }. Nothing else
│   ├── render/       ★★ MIT · PUBLISHED · in-degree 0 · its own LICENSE
│   ├── spark/        the assistant. Ports = { Sql, Clock, Inference }. Phase B7
│   ├── theme/        OKLCH generator · Brettel 1997 · the 16 checks · DTCG 2025.10
│   └── where/        ./ = parse·print·validate (browser)   ./sql = compile (server)
├── docs/             the 35 documents
├── tools/gates/      zero-dependency scripts for the source and artefact gates; rendered-box gates are
│                     Playwright specs under apps/web/test — the inventory is 33-CONTRACTS §8
└── LICENSE · LICENSING.md · CONTRIBUTING.md · SECURITY.md · .gitattributes · …
```

**`apps/worker/src/do/record.ts`, `spark.ts` and `directory.ts` are ~60 lines each. If any passes
100, logic has leaked out of a package and into a runtime** — and that is a review comment, not a
refactor to schedule. *(An earlier draft said two DO classes; identity — email → person, slug →
record, sessions, magic links, the lockout — needed a home outside every record, and it is the third
class, `Directory`, one instance. On the self-host it is `directory.sqlite` in the same process.)*

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
discovered.

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
