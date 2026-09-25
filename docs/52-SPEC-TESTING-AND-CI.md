# 52 · Testing and CI — specification

Cross-cutting: the test pyramid, the fixtures' use, every gate as a script or a spec, the five workflows, and
publishing. Derives from [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6, [33-CONTRACTS](33-CONTRACTS.md) §3 and §8,
[31-STACK](31-STACK.md) §3–§4 and §6–§7, [30-BLUEPRINT](30-BLUEPRINT.md) §6, §7, §13–§14, [22-FRONTEND](22-FRONTEND.md)
§9–§10, [34-GRAMMARS](34-GRAMMARS.md) §6, and the recorded deviations in [BUILD.md](../BUILD.md). The template is
[35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §3; the sections keep its headings and read them for a cross-cutting spec:
*Public API* is the commands a developer runs, *Files* is the tools and workflow files, *Data structures* is the
fixture and trace formats.

> **Clean room.** No gate, fixture or harness here is ported. `tools/gates/clean-room.mjs` is a tripwire for the
> predecessor's identifiers — a tripwire, not a proof; the proof is the rule ([BUILD.md](../BUILD.md)).

---

## 1 · Purpose and boundary

**Does.** Turns every assertion the corpus makes about itself into something a runner executes: a unit test, a
property, a conformance case, a fixture, a script under `tools/gates/`, or a Playwright spec. Runs them in five
workflows. Publishes two packages. One principle picks the shape of every gate ([18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md)
§6): *any step whose failure mode is silence gets checked against the thing itself, never against the tool's
opinion of it* — so `deploy-parity` fetches the live host, `bundle` compresses the built bytes, `targets` measures
the rendered box.

**Refuses.** A framework where `node --test` and `node:assert/strict` hold (Vitest runs the Durable Object host
alone — [BUILD.md](../BUILD.md)). A gate whose number lives in its own file: every asserted number is in
`tools/gates/budgets.json` (§4). A gate that warns: a gate is red or green, and a red gate is fixed or the design
document is changed first (§6). An HTML snapshot or a full-page pixel diff as an assertion ([22-FRONTEND](22-FRONTEND.md)
§10). A test that can pass on the degraded branch (§9). A skip that is silent ([33-CONTRACTS](33-CONTRACTS.md) §3).

**May import.** `tools/gates/*.mjs`: `node:*` only — zero dependencies, a few dozen lines each; a gate that needs a
package imports its `.ts` source directly, because Node 24 runs it. Package tests: `node:test`, `node:assert/strict`,
`fast-check` in `packages/where`, and `@braindog/fixtures` as a devDependency. `apps/web/test/e2e/*.spec.ts`:
`@playwright/test`, `axe-core`, `@braindog/fixtures`. `apps/worker/test`: `vitest`, `@cloudflare/vitest-plugin`.
Nothing here is shipped.

## 2 · Public API

The commands a developer runs. Six root scripts; the first three exist in commit one's `package.json`.

```jsonc
// package.json (root) — scripts
{
  "test":         "pnpm -r --workspace-concurrency=1 run test",          // every package's `node --test "test/**/*.test.ts"`
  "typecheck":    "pnpm -r run typecheck",                               // tsc -b, noEmit, per package
  "gates":        "node tools/gates/run.mjs",                            // every script gate; flags below
  "test:browser": "pnpm --filter ./apps/web exec playwright test",       // the 128-configuration matrix
  "test:do":      "pnpm --filter ./apps/worker exec vitest run",         // Durable Object host only (phase 5)
  "release":      "node tools/release.mjs"                               // tag a package for release.yml
}
```

| Command | Runs | Where |
|---|---|---|
| `pnpm test` | unit, property (1,000 runs), the Node conformance host, the fixture tests (materialise the nine seed records, the refusal fixtures through their runners, both counts read from 40 §6, determinism), `brain-roundtrip`, `boot-probe`, `theme-sixteen` | `ci.yml` |
| `pnpm typecheck` | `tsc -b` over every package and app; `references` mirror the graph so a cycle fails here first ([31-STACK](31-STACK.md) §3) | `ci.yml` |
| `pnpm gates [-- --only a,b] [-- --allow-skip a,b] [-- --negative]` | the scripts of §3. A gate whose `needs` are unmet prints a skip; under `CI=true` a skip not named in `--allow-skip` is red. `--negative` runs §9 | `gates.yml`, `ci.yml`, `deploy.yml` |
| `pnpm test:browser [-- --shard=i/n]` | the Playwright specs over 8 fixtures × 4 widths × 2 schemes × 2 directions | `ci.yml` |
| `pnpm test:do` | the conformance corpus and `boot-probe` under `@cloudflare/vitest-plugin`; with `CONFORMANCE_WRITE=1` it rewrites `reference.json` ([37-SPEC-PORTS](37-SPEC-PORTS.md) §9.3) | `ci.yml` (phase 5) |
| `pnpm release <render\|cli> <semver>` | asserts a clean tree on `master`, runs `graph` and `licence-closure`, writes the version, commits `release: braindog-<pkg> <semver>`, tags `<pkg>-v<semver>`, pushes the tag | a developer's machine |

The five workflows, one table of steps each. Every job pins `node-version: 24.13.0`, uses `pnpm/action-setup@v4`,
installs with `--frozen-lockfile`, and carries `timeout-minutes` equal to its §7 budget.

**`ci.yml`** — `on: push, pull_request`. One job, `test`; the browser step shards only when §7's budget is hit.

| # | Step | Fails when |
|---|---|---|
| 1 | `actions/checkout@v4` | — |
| 2 | `pnpm/action-setup@v4` · `actions/setup-node@v4` (`24.13.0`, `cache: pnpm`) | — |
| 3 | `pnpm install --frozen-lockfile` | the lockfile is stale |
| 4 | `pnpm typecheck` | any type error, any cycle |
| 5 | `pnpm test` | any test in §5.3 or §5.5 |
| 6 | `pnpm --filter ./apps/web build` | the build fails |
| 7 | `pnpm --filter ./apps/web exec playwright install --with-deps chromium` | — |
| 8 | `pnpm test:browser` | any spec in §5.4 — `bundle` included, over the step-6 build; `SLASH_ENDPOINT` is unset, so this is the no-model build ([23-ASSISTANT-UI](23-ASSISTANT-UI.md) §8) |
| 9 | `actions/upload-artifact@v4` of `apps/web/test-results/`, `if: failure()` | — (screenshots are artefacts, never assertions) |
| 10 | `pnpm test:do` — phase 5 onward | a trace differs from `reference.json`; a host ran a different case count |

**`gates.yml`** — `on: push, pull_request`. `permissions: contents: read`.

| # | Step | Fails when |
|---|---|---|
| 1–3 | checkout · setup · frozen install | as above |
| 4 | `pnpm --filter ./packages/render --filter ./apps/cli build` | the two publishable packages do not build |
| 5 | `pnpm gates -- --allow-skip deploy-parity` | any script gate red; any skip other than the one named |
| 6 | `pnpm gates -- --negative` | a gate passes its seeded violation (§9) |

**`deploy.yml`** — `on: workflow_run: workflows: [ci], types: [completed], branches: [master]`, guarded by
`if: conclusion == 'success'`. Environment `production`; `concurrency: deploy`, never cancel-in-progress.

| # | Step | Fails when |
|---|---|---|
| 1–3 | checkout at `workflow_run.head_sha` · setup · frozen install | — |
| 4 | `BRAINDOG_BUILD=<YYYY.MM.DD>+<sha7> pnpm --filter ./apps/web build` — the date from `date -u`, the sha from `GITHUB_SHA` | — |
| 5 | `pnpm --filter ./apps/worker exec wrangler deploy` with `CLOUDFLARE_API_TOKEN` (secret, deploy-scoped) and `CLOUDFLARE_ACCOUNT_ID` (var) | wrangler fails |
| 6 | `DEPLOY_HOST=<vars.DEPLOY_HOST> pnpm gates -- --only deploy-parity` | the live shell's hashes differ from `build/`; `/.well-known/braindog-build` does not carry this run's `app` tuple |

**`release.yml`** — `on: push: tags: ['render-v*', 'cli-v*']`. `permissions: { contents: read, id-token: write }`.
No npm token exists anywhere ([31-STACK](31-STACK.md) §6).

| # | Step | Fails when |
|---|---|---|
| 1–3 | checkout · setup (`registry-url: https://registry.npmjs.org`) · frozen install | — |
| 4 | resolve `<pkg>` and `<semver>` from the tag; assert `package.json.version == <semver>` | the tag and the manifest disagree |
| 5 | `pnpm --filter <dir> build` | — |
| 6 | `pnpm gates -- --only licence-closure,graph` | the tarball closure is broken |
| 7 | `npm publish` in the package directory — OIDC trusted publishing; provenance is automatic, no `--provenance` flag | npm refuses |
| 8 | `npm view braindog-<pkg>@<semver> version` | the registry does not show the version |

**`gate1.yml`** — `on: schedule: '0 6 * * 1'` and `workflow_dispatch`. A report, not a gate: it never fails
([15-ROADMAP](15-ROADMAP.md) §5, gates 1a–1d). `permissions: { contents: read, issues: read }`.

| # | Step | Writes to the step summary |
|---|---|---|
| 1 | `GET registry.npmjs.org/-/v1/search?text=depends:braindog-render&size=250` | **1a** dependents not owned by us (target ≥ 3) |
| 2 | `gh api repos/$REPO/issues?state=all&per_page=100`, paged | **1b** issues and PRs by non-authors, bots excluded (≥ 5) |
| 3 | `GET api.npmjs.org/downloads/range/last-month/braindog-render`, minus the publish days from `npm view braindog-render time --json` | **1c** downloads per week on non-publish days (≥ 150) |
| 4 | the last four weekly figures from step 3 with zero publishes in the window | **1d** four consecutive weeks above 1c |

## 3 · Files

The fewest that hold. One gate per file; a shared `lib.mjs`; one budgets file; one runner.

```
tools/
├── gates/
│   ├── run.mjs                 the runner: an ordered array; 22 gates called, 8 spawned, the answer read (§5.1)
│   ├── self-test.mjs           runs each grep gate against tools/gates/negative/<gate> (§9)
│   ├── lib.mjs                 budgets() · budget() · keyPaths() · skipDir · MAY_REFUSE · readiness()
│   ├── record.mjs              NOT a gate: the self-host in memory with the seed installed, served on
│   │                           127.0.0.1 so the browser gates read a real record; imported by six of them
│   ├── routes.mjs              NOT a gate: `routesOf`, the route list derived from the route directory
│   ├── budgets.json            every number a gate asserts (§4)
│   ├── negative/<gate>/…       fifty-nine seeded violations, several per grep gate (§9)
│   ├── test/needs.test.mjs     the runner's prerequisite check, driven against a tree with no build
│   ├── clean-room.mjs   stack.mjs       nul-bytes.mjs         graph.mjs        secret-grep.mjs
│   ├── event-kinds.mjs  router-groups.mjs  guards.mjs         closed-lists.mjs slash-actor.mjs
│   ├── import.mjs       refusals.mjs    refusal-fixtures.mjs  flags.mjs        em-dash.mjs
│   ├── no-declarations-in-kernel.mjs    css-rules.mjs         colour-grep.mjs  dead-copy.mjs
│   └── bundle.mjs       prefs.mjs       keys.mjs              layout.mjs       a11y.mjs
│                        passkey.mjs     queue.mjs             deploy-parity.mjs
└── release.mjs                 `pnpm release` (§5.6)

packages/skin/scripts/theme.mjs         `theme`, a registered gate that is not a file in tools/gates
fixtures/refusals/<code>.yaml           the refusal corpus, one file per code (40 §6); read by `refusal-fixtures`
fixtures/corpus.ts                      the one reader the `via` runners share, and the only code they share
packages/ports/src/conformance/         cases.ts (CASES, runConformance) · reference.json — owned by 37 §3
packages/kernel/test/                   materialise.ts (40 §5.3) · refusals-write.test.ts, the `write` runner
packages/<pkg>/test/**/*.test.ts        node --test; packages/where/test/seeds/<seed>.json (§4)
apps/web/test/                          refusals-render.test.ts, the `render` runner · measures-currency.test.ts
apps/worker/test/*.test.ts              vitest + @cloudflare/vitest-plugin; twenty-eight files
.github/workflows/                      ci.yml · gates.yml · deploy.yml · codeql.yml · tag.yml (§2)
```

**Twenty-seven script gates, and no Playwright spec at all.** This section said nineteen gates and
seventeen specs, and both numbers described a tree that was never built.
`ls tools/gates/*.mjs | grep -vE '/(run|lib|self-test|record|routes)\.mjs$' | wc -l` is 27. The five
excluded are the two runners and the three modules another file in this directory imports, which is
the rule `run.mjs` derives rather than lists: *a file another file in this directory imports is a
library, and the two runners are the two runners*. `run.mjs`'s ordered array holds thirty entries,
those twenty-seven plus `typecheck` (`pnpm -r run typecheck`), `theme`
(`packages/skin/scripts/theme.mjs --check`) and `self-test` itself, counted with
`grep -cE "^  \['[a-z0-9-]+'," tools/gates/run.mjs`.
`find apps packages -name '*.spec.ts' -not -path '*/node_modules/*' | wc -l` is 0, and
`find . -name 'playwright.config*' -not -path '*/node_modules/*'` finds nothing: `@playwright/test`
is a root devDependency that six gates IMPORT: `grep -n "@playwright/test" tools/gates/*.mjs` prints
seven lines, and six of them are `import { chromium }` in `a11y` `keys` `layout` `passkey` `prefs` and
`queue` while the seventh is a sentence about them inside `refusal-fixtures.mjs`. Those same six are
`record.mjs`'s importers. So every browser assertion in this tree is a gate rather than a spec, and the `apps/web/test/e2e/`
matrix this section used to draw does not exist. `apps/worker/test/` holds twenty-eight Vitest files
rather than two (`ls apps/worker/test/*.test.ts | wc -l`). **§2, §5.4, §9 and §10 still describe that
matrix as though it ran**, down to `test:browser`, `test:do`, `release.yml` and `gate1.yml`, none of
which is in `package.json` or `.github/workflows/` (`ls .github/workflows/` gives `ci.yml` `gates.yml`
`deploy.yml` `codeql.yml` `tag.yml`). Those four section numbers are the output of
`grep -n 'test:browser\|test:do\|release\.yml\|gate1\.yml' docs/52-SPEC-TESTING-AND-CI.md` read
against the `^## ` headings, and not a list somebody remembered, because the first draft of this
paragraph named three and missed §9's negative-project fixture. Correcting them is a separate pass,
and whoever takes it should decide whether the matrix is being built or being dropped rather than
editing the prose twice.

**Eight gates this section tabulated have never been written**: `licence-closure`, `mcp-budget`,
`telemetry-allowlist`, `shot-allowlist`, `conformance-count`, `compat-date`, `grant-note` and
`harness-constants`. None is a file in `tools/gates/` and none is an entry in `run.mjs`'s array.
**§5.2 still specifies all eight as the steps of a gate that runs, and only `mcp-budget`'s block says
otherwise** (*"Not a gate today. The budget is held by `packages/mcp/test/budget.test.ts`"*): a reader
who arrives at §5.2's `licence-closure` is handed `needs: ['pack-build']`, a prerequisite `run.mjs`
declines to declare until the gate that wants it exists (`tools/gates/run.mjs:313`). Marking the other
seven in §5.2 belongs with the pass above rather than here. They are not in the table below, because a
table of gates is read as a list of what runs.

The table lost two columns it had no source for. **`ms`**: `budgets.json` holds no per-gate runtime
budget and never has, and `run.mjs` neither times a gate nor asserts anything about how long one
took, so nineteen numbers were being maintained against nothing. **`what` on failure**: §5's opening,
above §5.1 and not §4 as the old tree listing said, already
records that every gate prints its own two-space-indented sentence and that `run.mjs` reads the exit
code rather than the stream, so a column of failure strings here is a fourth copy of a sentence the
gate owns. What stands in its place is the prerequisite, which is a declaration a gate really makes
(`export const needs`) and which the runner really reads (`grep -rn "export const needs"
tools/gates/*.mjs`). The rows are the twenty-seven plus `theme`, in `run.mjs`'s order, which is
load-bearing; `typecheck` and `self-test` are the array's other two entries and are §5.1's subject
rather than this table's.

| Gate | Reads | Asserts | Needs |
|---|---|---|---|
| `clean-room` | every text file under the root, skipping `node_modules` `.svelte-kit` `build` `dist` `.git` `shots` `docs` `loop` | no whole-word, case-insensitive hit on the seven identifiers of the inline `TRIPWIRES` list; an empty list is itself red, because a tripwire with no wire reports green over a repository nobody checked | — |
| `stack` | `packages/*` and `src/` sources | 31 §1's banned surface: no `node:` or `cloudflare:` import, no bare `fetch`, no `Buffer`. A signature is not a call, so the port interface passes | — |
| `nul-bytes` | every tracked text file, as bytes rather than as syntax | no C0 control byte below 0x20 other than tab, newline and carriage return, and no DEL. Two files carried one and typechecked clean | — |
| `graph` | every `package.json`; every `src/**` import specifier | acyclic; every workspace edge points down 31 §2's order; no undeclared import and no relative import that climbs out of its own package | — |
| `secret-grep` | `packages/**` and `apps/**` sources | no plaintext source reaches a sink (a log, telemetry, a push, a prompt template); the `Plaintext` brand appears only at the two hosts' vault boundaries | — |
| `event-kinds` | the migration's CHECK; 30 §1's CHECK; 30 §2's table and its prose; `EVENT_KINDS` | all five sources say the same number and the same members. Four of the five are not code, which is why it is a gate and not a test | — |
| `router-groups` | each host's route table; `METHOD_GROUPS`; 30 §5's groups; 44 §2's `REFUSED` | every route declares a group; no INTERNAL method is routed; VAULT is cookie-only; ADMIN admits no token principal | — |
| `guards` | `ROUTES` in `packages/host`; the guard each handler in `packages/record` actually calls | the group the table publishes and the check the record applies agree. It found `members` routed ADMIN and guarded `read`, on an answer carrying every colleague's email | — |
| `closed-lists` | 34 §6's table; 30 §1's SQL block; `migrations/0001_kernel.ts`; each owner's `as const` array | counts and member sets agree across every source, for the twenty-three lists the DDL refuses in a `CHECK` | — |
| `slash-actor` | the seed, materialised through the real write path, then offered the four writes a model may not make | 30 §3's query returns zero rows. It makes the writes before it queries, because the seed writes no `slash` event and the filter would otherwise filter nothing | — |
| `import` | a self-host, onboarded, with the founder, agents and estate packs installed | `braindog import packs/legacy-import/adapter.ts` over HTTP lands every planned row in the record. The adapter's own tests drive an in-memory fake door and a stub server answering ok to everything | — |
| `refusals` | the refusal registry, the `RefusalCode` union, and every `raises:` in the tree | the registry, the type and the code say the same list, and a registered code no code path emits is named | — |
| `refusal-fixtures` | 30 §6's code tables; `fixtures/refusals/*.yaml`; the code list `declare` exports (42 §2) | one fixture per code, one code per fixture, kebab name equals code, and every `via` is one of 40 §6's nine. It owns the enumeration; the runners of §5.3 own the behaviour | — |
| `flags` | the flag list and every read of it | six questions, of which the load-bearing one is whether the flag is read at all; `budgets.flags` caps a flag at ninety days and two call sites | — |
| `no-declarations-in-kernel` | `packages/kernel/**` | one `INSERT INTO declaration`, id `register.session`; no `.yaml`; no other declaration body | — |
| `css-rules` | `apps/web/src/**`, `packages/render/src/**`, the emitted token set, `pairs.json` | the twelve rules of §5.2, one `what` per rule, plus the dead-class report that never goes red | — |
| `colour-grep` | the same trees, outside the token file | the colour a class computed in TypeScript, an inline SVG `fill` or a data file smuggles past `css-rules`. 22 §7 gate 2, and the one that actually fires | — |
| `dead-copy` | `copy.ts` and every file that reads it | no key defined and referenced nowhere. Measured on the day it was written: 212 keys, 26 of them rendered by nothing | — |
| `em-dash` | `packages/*/src/**` and `apps/*/src/**`, `.ts` and `.svelte`, plus the published README; comments blanked in all three dialects | `LOOP.md`'s no em dashes in anything a stranger reads: no U+2014 with a space on each side. One that stands alone, opens a line or closes one is a glyph and is not punctuation | — |
| `theme` | the shipped themes and the emitted stylesheet (`packages/skin/scripts/theme.mjs --check`) | the committed stylesheet is byte-equal to the one the tokens generate | — |
| `bundle` | the entry chunk and everything statically reachable from it, compressed at `brotliQuality` | `budgets.bundle`: measured from the entry graph and not from the total of `build/`, so adding a screen cannot move it | `web-build` |
| `prefs` | every preference control, driven in a real browser against a real record | each preference changes what it says it changes. The Text setting shipped inert for the life of the build, because the old browser matrix was widths, schemes and directions and no other preference was an axis of it | — |
| `keys` | the keymap registry, the `?` sheet and every printed `<kbd>` | every key the product prints is bound to something. It had drifted three ways, found by a sweep of 379 clicked controls rather than by a gate | `web-build` |
| `layout` | every route, at both sides of every width the stylesheets themselves declare | nothing overflows sideways. The widths are read out of the CSS, so a `@media (width < 900px)` is checked at 899 and at 900, which is where responsive bugs live | `web-build` |
| `a11y` | axe-core over every route of five build roots (`apps/web/build`, the three variant builds, `apps/site/build`), both schemes, two widths | no unnamed control, no heading level skipped, no `aria-*` that names nothing, no contrast under the floor. It declares no `needs` on purpose: each root is skipped by name, so a tree with only the site built still gets a real audit | — |
| `passkey` | a real browser against a real record, on its own ephemeral port | the ceremony end to end: arrive signed out, come in by the server key, add a passkey, sign out, come back in with it | `web-build` |
| `queue` | `/p/agents` in a real browser, on its own ephemeral port | pressing an option lands on its gate, highlighted and unchosen; pressing the count of what is left lands on Decide | `web-build` |
| `deploy-parity` | `DEPLOY_HOST`; `apps/web/build/`; `BRAINDOG_BUILD` | SHA-256 of the live `/app/` and `/app/_app/version.json` equal the build's (`/` and `/_app/version.json` before push A of the one-domain move); `/.well-known/braindog-build` carries this run's `app` tuple. The one gate that measures something outside this repository | `host` `web-build` |

## 4 · Data structures

**The trace** ([33-CONTRACTS](33-CONTRACTS.md) §3; [37-SPEC-PORTS](37-SPEC-PORTS.md) §2) — the differential unit of
the conformance suite. Cited, not restated: `SqlErrorCode` (thirteen), `TraceLine`, `Case`, `Assert`, `CASES`
(thirty-two), `runConformance(sql, assert, reference) → { trace, ran, skipped }`, and `ReferenceFile` with its
`generated_by` and `provisional` flags. What this spec adds is the file each host's conformance test writes for the
gate to read:

```ts
// packages/ports/test/results/<host>.json — git-ignored; one per host per run
type ConformanceResult = {
  host: 'node-sqlite' | 'durable-object';           // the generated_by vocabulary of 37 §2
  sqlite: string;                                   // caps.sqlite, so a diff names the build
  ran: number;                                      // runConformance's count; MUST equal CASES.length − skipped.length
  skipped: { id: string; reason: string }[];        // printed by conformance-count, never silent
  trace: Trace;                                     // runConformance's trace, in CASES order
};
```

Invariants a test checks: `ran + skipped.length === CASES.length` for every host; `ran` is equal across hosts; two
results are equal iff their `trace` values are deep-equal — `host`, `sqlite` and `skipped` are excluded from equality
and included in the failure line; after phase 5 `reference.json` has `provisional: false`.

**The seed file** — every failing property run is committed as a permanent example
([30-BLUEPRINT](30-BLUEPRINT.md) §14).

```jsonc
// packages/where/test/seeds/<seed>.json
{
  "seed": 1725302400123,            // fast-check's seed; the filename
  "path": "42:3:1",                 // fast-check's shrink path
  "predicate": { "all": [ { "field": "due", "before": "+30d" }, { "field": "state", "not_in": ["paid"] } ] },
  "rows": [ { "id": "01J…", "fields": { "due": "2026-09-30" } } ],
  "found": "2026-09-02 — negative operator on a missing field disagreed with the evaluator"
}
```

Invariants: `seed` is the filename; `predicate` is the JSON tree of [34-GRAMMARS](34-GRAMMARS.md) §1 at depth ≤ 3;
`rows` ≤ `budgets.property.maxRows`; every seed file is replayed as an explicit example before the random runs, so a
fixed counter-example never regresses.

**The fixture manifest** — owned by [40-SPEC-FIXTURES](40-SPEC-FIXTURES.md) §2 and §4.1; cited, not restated. One
`seed.json` at the package root holds the clock, the `sfc32` RNG state, the owner and nine `records`; `pages/*.json`
hold the eight `Page`s; the `.brain` is materialised through the real write path by `packages/kernel/test/materialise.ts`
(40 §5.3), never committed as bytes ([22-FRONTEND](22-FRONTEND.md) §10). What the gates and specs here read:

```ts
import { PAGES, SEED, REFUSALS, PACKS } from '@braindog/fixtures';     // 40 §2
PAGES[i].id        // 'empty' | 'twelve' | 'five-hundred' | 'five-thousand' | 'currencies' | 'writeup'
                   // | 'third-party-kind' | 'unknown-primitive' — 22 §10's order; FIXTURES in matrix.ts is PAGES.map(p => p.id)
PAGES[i].record    // a key of SEED.records — the record a page is rendered from
PAGES[i].expect    // { blocks, rows, cap, degraded, empty[] } — the non-vacuous assertions of §5.4
SEED.records.corpus   // every pack, two seeded grants — the record slash-actor, grant-note and brain-roundtrip run over (40 §9)
REFUSALS           // kebab code → path; a hundred and nineteen files (`ls fixtures/refusals/*.yaml | wc -l`)
```

A refusal fixture (40 §6) carries `code`, `via` (one of the values 40 §6's table names, which is the
closed list), `at`, optional `found`, and the input keys its `via` names; its runner is the test file
40 §6's table assigns (`declare/test`, `record/test`, `apps/web/test`, `connect/test`, `slash/test`).

**There are nine `via` values, not eight.** `ask` is the ninth, minted on September 21st 2026 for the
four codes `packages/slash` arrived with, and its row is in 40 §6; `pull` was the eighth, the day
before. Counted from the corpus rather than from either document:
`grep -rhoE '^via: *[a-z]+' fixtures/refusals/*.yaml | sed 's/via: *//' | sort -u` prints
`ask import install lint pull render rpc where write`, and the same pipe into `wc -l` prints 9. The
fixtures split 27 `lint`, 20 `install`, 7 `where`, 15 `write`, 30 `rpc`, 7 `import`, 2 `render`,
7 `pull`, 4 `ask`, which is the hundred and nineteen above (`| sort | uniq -c`). The corpus also
lives at `fixtures/refusals/`, not `packages/fixtures/refusals/`: there is no `packages/fixtures`
package, and `graph` prints it as the one unbuilt row of 31 §2 (*1 of 31 §2's rows are unbuilt
(fixtures)*), so the `PAGES`, `SEED` and `PACKS` imports above are specification and not a
description of the tree. `packages/seed` is what the tests actually read.

**The budgets file** — every number a gate asserts, in one place. A *count* is never here: a count is read from the
enumeration that owns it ([34-GRAMMARS](34-GRAMMARS.md) §6).

```jsonc
// tools/gates/budgets.json
{
  "ci":       { "wallMinutes": 20, "gatesWallMinutes": 5, "browserMinutes": 10, "doMinutes": 4, "testSeconds": 90 },
  "property": { "runs": 1000, "maxRows": 50, "maxDepth": 3 },
  "bundle":   { "mainJsBrotli": 30720, "mainCssBrotli": 12288, "editorGzip": 81920,
                "fontsBytes": 46080, "fontFiles": 2, "htmlGzip": 25600 },
  "mcp":      { "toolsList": 1800, "toolDescription": 200, "recordIndex": 500, "listPage": 2000, "instructions": 300 },
  "targets":  { "minPx": 43.5 },
  "row":      { "centreTolerancePx": 1.5 },
  "layout":   { "emptyTailPx": 2, "widthTolerancePx": 0 },
  "contrast": { "textAA": 4.5, "nonTextAA": 3, "apcaWarnLc": 60 },
  "motion":   { "springEnd": 1, "springPeakMax": 1.05, "ceilingMs": 300, "reducedMs": 1 },
  "web":      { "widths": [390, 768, 1024, 1440] },
  "worker":   { "compatDateFloor": "2026-02-24" },
  "deploy":   { "parityAttempts": 6, "parityIntervalMs": 10000 },
  "jobView":  { "foldBytes": 2048, "pollMs": 700 }
}
```

Invariants: every key is read by at least one gate (a `budgets.json` key nothing reads is a `self-test` failure);
a gate never holds a numeric literal that is not `0`, `1` or an index; a change to this file is reviewed against the
design document that owns the number (the owners are the citations in §5).

**The gate result** — one line per gate, machine-readable, human-scannable. JSON Lines on stdout; nothing else
is printed by a gate.

```jsonc
{"gate":"graph","ok":true,"ms":41}
{"gate":"deploy-parity","skip":"needs DEPLOY_HOST to name the host to compare against"}
{"gate":"closed-lists","ok":false,"ms":118,
 "what":"list Schedule kinds: migration CHECK has 9, owner 30 §1 says 10",
 "expected":"digest reminder rule retry purge rotate pull analyse score snapshot",
 "found":"digest reminder rule retry purge rotate pull analyse score",
 "where":"packages/kernel/src/migrations/0001_kernel.ts:212"}
```

Invariants: exactly one of `ok` or `skip`; a red line carries all four of `what`, `expected`, `found`, `where`;
`where` is `path:line` or a URL; the runner's last line is
`{"summary":true,"ok":n,"red":m,"skipped":k,"ms":t}`.

A skip names only the prerequisites that are actually absent. The line above was a constant reading
`needs DEPLOY_HOST and apps/web/build`, and locally the build is usually present and the variable never is, so it
sent a reader off to rebuild what they had already built. A skip earns its line only when the next thing the
reader does is the thing that removes it.

**What the tree prints instead.** Not this. Every gate in `tools/gates/` writes a two-space-indented sentence
opening with its own name, and `run.mjs` spawns each one with `stdio: 'inherit'` and reads the EXIT CODE rather
than the stream, so nothing parses the line and the JSON buys nothing today while costing the one format a person
in a terminal cannot read at a glance. `deploy-parity` was the only gate still emitting JSON, and only for its
skip: its own red and green lines were already prose, so the JSON was not even consistent within one file. The
prose is now uniform. Whoever wants the machine-readable stream back should add it as a second, opt-in channel
(`--json`) rather than by taking the readable one away, and should change this section when they do.

## 5 · Algorithms

### 5.1 · The runner — `tools/gates/run.mjs`

**Built in part, and the part is named gate by gate below.** The algorithm is the design. Steps 2 and 5 are
what the tree does; steps 1, 3 and 4 hold for twenty-two of the thirty gates and in a narrower shape than
written. Read the list for the intent and the paragraphs after it for the tree.

1. List `tools/gates/*.mjs` minus `run.mjs`, `lib.mjs`, `self-test.mjs`; apply `--only`.
2. For each file, in name order: `import()` it; read `export const needs: string[]` (`'web-build'`, `'pack-build'`,
   `'host'`); if a need is unmet, print a `skip` line naming the command that meets it and continue.
3. Call `export default async (ctx) => Result` with `ctx = { root, budgets, args }`, timed with `performance.now()`.
4. Print the result line (§4). A thrown error is a red line with `what: 'gate crashed: <message>'`.
5. Exit `0` if nothing is red and every skip is allowed (locally: all; under `CI=true`: only `--allow-skip`);
   `1` if any gate is red; `2` if a gate crashed or a skip is disallowed (§6).

**Step 1, as built.** The list is a hard-coded ordered array, `GATES`, and it stays: it carries the ORDER,
which is load-bearing (`typecheck` first, `self-test` second, the browser gates last), and entries that are
not files in this directory, like `theme`. The directory scan step 1 describes runs as a CHECK on the array
instead of as its source: a `.mjs` file here that no entry names and no other file imports is exit 1 before
any gate runs. Two gates were written and left unregistered in one week before that check existed.

**Step 2, as built.** Every prerequisite is the runner's question. A gate whose declared `needs` is unmet is
never started, and the skip line is the runner's, naming the command that meets it. `web-build` also asks
whether the build is newer than the source, because a stale build gave `layout` and `a11y` nineteen findings
about an app that no longer existed. `pack-build` is declared by nothing, because its one gate,
`licence-closure`, has never been written. This closed a defect that shipped twice: `passkey` and `queue` each
found no build and exited `0`, which is a pass.

**Step 3, as built: twenty-two gates are called and eight are spawned.** The dialect is declared per entry,
with `call(file)`, and never guessed from the file's text; the text is read only to REFUSE a disagreement
(a call with no `export default` or no `if (import.meta.main)` guard, or a spawned script that names
`export default`). A called gate is `export default async (root) => 1 | 3 | undefined`, handed the root and
nothing else rather than `ctx`; a throw is that gate's red and not the run's, and a `process.exit` inside
one is named by the runner on the way out. `mod.needs` is read off the module before the function is
called, so the declaration and the code are one account. Every gate still runs on its own, because each ends
with `if (import.meta.main)`, which is also how `self-test` spawns it against a seeded tree.

The twenty-two called: `nul-bytes` `graph` `secret-grep` `event-kinds` `router-groups` `guards` `closed-lists`
`refusals` `refusal-fixtures` `flags` `css-rules` `colour-grep` `dead-copy` `em-dash` `bundle` `prefs` `keys`
`layout` `a11y` `passkey` `queue` `deploy-parity`. The eight spawned, and why:

| Gate | Why it is spawned |
|---|---|
| `typecheck` | `pnpm -r run typecheck` through a shell. There is no module to import. |
| `self-test` | spawns every gate itself; called, it would be this runner's work done twice in one process. |
| `theme` | `packages/skin/scripts/theme.mjs --check`: a flag, and a file outside this directory. A call takes the root and nothing else. |
| `stack` | on purpose. `test/dialect.test.mjs`, `test/durations.test.mjs` and `test/needs.test.mjs` overwrite it with a script-shaped stub and rely on one real spawned entry. It moves when they pick another stand-in. |
| `clean-room` | a script: its whole body runs at module top level and it exports nothing. |
| `no-declarations-in-kernel` | the same. |
| `slash-actor` | the same, and it calls `process.exit(3)` and `process.exit(process.exitCode ?? 0)` at top level. |
| `import` | the same, and it calls `process.exit(3)` at top level. |

**The last four cannot be called without editing the gate file, and a wrapper is not a way round that.**
Measured on 22 September by importing each from a stand-in for `run.mjs`, which is what an adapter in
`tools/gates/lib/` would have to do: `clean-room` reads its root from `process.argv[2]`, and in the runner's
process that is the runner's own first flag, so `run.mjs --only clean-room` made it `scandir
'C:\Repos\braindog\--only'` and throw `ENOENT`. `no-declarations-in-kernel` ran and printed its line, and a
second import in the same process printed nothing, because the module is cached: an adapter only works once
per process, and only by treating the importing as the call, which is the exact trap `run.mjs`'s `IMPORTED OR
SPAWNED` paragraph refuses. `slash-actor` and `import` would end the runner at their `process.exit`. Each of
the four moves to `call(...)` the way `em-dash` did: the body inside `export default async function
gate(root = process.env.BRAINDOG_GATE_ROOT ?? <its current default>)`, where the default is kept as it
is (`process.cwd()` for `clean-room`, the repository root two directories up for the other three, so that
running one by hand from another directory still scans this tree), `return 3` and `return 1` for the exits, and
`if (import.meta.main) process.exitCode = (await gate(process.argv[2])) ?? 0;` at the foot. That is an edit to
the gate, which is the gate owner's to make.

**Step 4, as built.** Not a `Result` object. Each gate prints its own two-space-indented prose line (§4 says
why the JSON line was dropped), and the runner adds `▸ <name> · imported|spawned` above it and `◂ <name> ·
<seconds> s` below it.

**Step 5, as built,** with one difference. `0` when nothing is red and every skip is allowed; `1` when a gate
is red. A gate that throws, returns a number outside `1`, `3` and nothing, or has a disallowed skip under `CI`
is RED, exit `1`, rather than `2`: the run still asks every gate after it. Exit `2` is kept for what stops the
run before any gate is asked: an unknown gate name, an empty selection, an unreadable `needs`, and a
registration that disagrees with its file.

### 5.2 · Source and artefact gates — one script each

**`graph`** ([31-STACK](31-STACK.md) §2–§3; layers 3, 4 and 5 in one file)

1. Read every `packages/*/package.json` and `apps/*/package.json`; collect workspace edges from `dependencies` and
   `devDependencies` whose value is `workspace:*`; `@braindog/fixtures` may appear only under `devDependencies`.
2. The total order is the fifteen-row table of 31 §2, as an array in the gate. For each edge `a → b`, assert
   `index(b) < index(a)`; an edge into a name outside the table is `unknown package`.
3. Scan `src/**/*.{ts,svelte}`: every `import … from '<spec>'` and `import('<spec>')`. A `@braindog/*` specifier
   must be a declared edge; a relative specifier resolved against the file must stay under the package root.
4. Under `packages/**`, except `packages/ports/src/node-sqlite.ts` (the adapter [37-SPEC-PORTS](37-SPEC-PORTS.md)
   owns), refuse specifiers `node:*`, `cloudflare:*`, and identifiers `process.`, `Buffer`, `__dirname`, and `fetch(`
   not preceded by `.` — 31 §1's banned surface. `packages/record/**` refuses `fetch(` unconditionally.
5. Red on the first violation, `where` = `file:line`.

**`licence-closure`** (31 §4 rule 8; `needs: ['pack-build']`). For each of `packages/render` and `apps/cli`:

1. `execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd })` → `files[].path`.
2. Every path matches `^(dist|src|test/fixtures)/` or is `LICENSE`, `README.md`, `package.json`.
3. `package.json`: `dependencies` absent or `{}`; `license` is exactly `MIT` or `Apache-2.0`; never `SEE LICENSE IN`.
4. Every `dist/**/*.js`: contains neither `@braindog/` nor `../../`.
5. `packages/render/LICENSE` begins `MIT License`; root `LICENSE` and `apps/cli/LICENSE` begin
   `Apache License` and are byte-equal.
6. Every `packages/render/src/**/*.ts` first line is `// SPDX-License-Identifier: MIT`.

**`clean-room`** ([BUILD.md](../BUILD.md))

1. Read `tools/gates/clean-room.txt`: non-empty lines, lower-cased, each ≥ 6 characters; an empty list is red
   (`what: 'clean-room list is empty'`) — a tripwire with no wire is decoration.
2. `git ls-files` minus `docs/**`, `BUILD.md`, `tools/gates/clean-room.txt`, binaries by `.gitattributes`.
3. For each file, for each identifier: whole-word, case-insensitive match → red, `where` = the first hit.

**`no-declarations-in-kernel`** ([02-DATA-MODEL](02-DATA-MODEL.md) §1)

1. Under `packages/kernel/`: no `*.yaml`, `*.yml`.
2. Across `src/migrations/*.ts`: `INSERT INTO declaration` occurs exactly once, with `'register.session'` and
   `pack_id = 'kernel'`.
3. Across `src/**`: no object literal with `kind: '<one of the eight>'` beside an `id:` key.

**`closed-lists`** ([34-GRAMMARS](34-GRAMMARS.md) §6)

1. Parse 34 §6's table: `{ list, count, members?, owner }`. A Members cell of backtick words yields members; a cell
   that cites a section yields a count only. A count like `16 + 2 meta` or `5 / 5` is summed per its own rule.
2. Parse every `CHECK (<col> IN (…))` in 30 §1's SQL block and in the DDL string `packages/kernel/src/migrations/
   0001_kernel.ts` exports ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §3); assert the two sets of CHECKs are identical —
   the document and the DDL cannot drift.
3. Parse each owner's `as const` array by name — the map in the gate: list → `{ sql?: 'table.col', src?:
   'packages/<p>/src/<f>.ts#NAME' }` — with `export const NAME = [ … ] as const` read by regex.
4. For every list: every source's length equals the table's count; where members are known in two sources, the
   sets are equal. Order is not asserted.
5. One red line per disagreement; `expected` = the owner's members, `found` = the disagreeing source's.

**`event-kinds`** ([30-BLUEPRINT](30-BLUEPRINT.md) §2) — the same comparison for the one list large enough to
have drifted three times: the migration's CHECK, 30 §1's CHECK, 30 §2's table, and the word *Forty* in 30 §2's
sentence must all say the same number; `EVENT_KINDS` in `packages/kernel` must equal the CHECK's members.

**`refusal-fixtures`** (30 §6; ADR-057)

1. Parse the five code tables of 30 §6: `{ code, fixture }` rows; assert `fixture === kebab(code)`.
2. `ls fixtures/refusals/*.yaml` → names. There is no `packages/fixtures` package; see §4.
3. Set difference both ways: a code without a fixture, a fixture without a code — each a red line.
4. The closed code list `declare` exports ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §2) equals the table's codes.
5. Whether a fixture *produces* its code is the `via` runners of §5.3: the script owns the enumeration, the tests own
   the behaviour.

**`router-groups`** (30 §5; [33-CONTRACTS](33-CONTRACTS.md) §4; [10-MCP](10-MCP.md) §8)

1. Import each host's route table as data — [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §4.7's `Route[]` and
   `METHOD_GROUPS`, and [51-SPEC-WORKER](51-SPEC-WORKER.md) §4's — the `handle` functions are never called.
2. Every `group` is one of 49 §4.7's nine; no route carries `INTERNAL`; no INTERNAL method of 30 §5 has a route.
3. Every `VAULT` route has `auth: 'cookie'`; no `ADMIN` route admits a `token` principal; the runner's three `JOBS`
   routes have `auth: 'runner'` and no other route does.
4. `METHOD_GROUPS`' keys equal 30 §5's six groups less INTERNAL, plus 48's three token methods; every DATA and READ+
   method appears in exactly one `POST /api/<method>` route.
5. Every method in a browser-only group is a key of 44 §2's `REFUSED` (twenty-one) — 10 §8's *every route has a verdict*.

**`slash-actor`** (30 §3) and **`grant-note`** (12 §8) — the two gates that need a live record

1. `materialise(SEED.records.corpus, openNodeSqlite(':memory:'))` — the materialiser of 40 §5.3
   (`packages/kernel/test/materialise.ts`), the adapter of 37 §2.5 (`@braindog/ports/node-sqlite`). The `corpus`
   record installs every pack and seeds two grants (40 §4.1, §9).
2. `slash-actor`: `SELECT kind FROM event WHERE actor = 'slash' AND kind NOT IN ('suggest','propose','predict')` → zero rows.
3. `grant-note`: `SELECT e.id FROM event e JOIN grant g ON e.target = 'grant:' || g.id WHERE e.kind LIKE 'grant.%'
   AND (instr(e.note, g.label) > 0 OR instr(e.note, g.opens) > 0)` → zero rows.
4. `where` names the record and the event id.

**`mcp-budget`** (10 §4)

Not a gate today. The budget is held by `packages/mcp/test/budget.test.ts`, which keeps `tools/list` at or
under 2,600 tokens by `tokenBudget` (44 §7), and `budgets.json` carries no `mcp` entry. The steps below are
the gate this becomes when the corpus record exists.

1. Assert `BUDGETS` of [44-SPEC-MCP](44-SPEC-MCP.md) §2 deep-equals `budgets.mcp` on the five shared keys — one
   place for the numbers, and 44's constant must match it.
2. Render `tools/list` (with `instructions`) over the stub `api` of 44 §3 (`test/fixtures/index-24.json`) — the shape
   44 assigns this script; then `serveMcp` over the materialised `corpus` record for a `record_index`
   response and a default `list` page.
3. Count each with 44 §5.8's `tokenBudget` — the calibrated estimator, never `bytes / 4` (44 §5.8 measured it
   under-counting minified JSON by a fifth).
4. Assert each against `budgets.mcp`; red names the item and its count.

**`secret-grep`** (12 §8; ADR-062)

1. Sources: identifiers `plaintext`, `decrypted`, `secretValue`, and the branded type `Plaintext`.
2. Sinks: `console.`, `log(`, `telemetry(`, `push(`, `dispatch.`, any file under `**/prompts/`.
3. For every sink call whose argument text contains a source → red.
4. `Plaintext` (the brand) appears only in the two hosts' vault steps — the module 49 §5 step 9 and 51 §5 name for
   `openGrant`/`bindGrant`'s unwrap; anywhere else is red. The record never sees one.
   *`47 §13` D9's key hierarchy moved into `packages/host/src/sealing.ts`, and that file carries no brand on
   purpose. It takes and returns plain bytes; each host brands at its own boundary, which is where the answer is
   built and where this rule is watching. Branding in the shared module would have made a fourth file and read as
   a plaintext that escaped, when the value has simply not reached anything yet.*

**`telemetry-allowlist`** (08 §5)

1. `writeDataPoint(` occurs exactly once under `apps/**` — 51 §5.18's one call per request.
2. The blob tuple type of 51 §4.3 has at most six positions and each position's name is one of the six columns
   parsed from 08 §5's table.
3. At the call site no argument token matches `fields|note|label|subject|amount|register|email|body`.

**`shot-allowlist`** (ADR-050; [19-INTERFACE](19-INTERFACE.md) §6)

1. Extract every literal a developer typed into `apps/web/src/**/*.svelte` markup: text nodes and static `{'…'}`
   expressions, trimmed, deduplicated, sorted.
2. Read `apps/web/src/lib/shot-allowlist.json`.
3. Assert set equality; red prints `+n −m` and the first ten of each difference. The count is printed, never asserted.

**`conformance-count`** (33 §3)

1. Read `packages/ports/test/results/*.json` (§4) and `CASES.length` = `m`.
2. Every result: `ran + skipped.length === m`, and `ran` equal across results; print each skip as
   `{"gate":"conformance-count","skip":…}` — attributed, never silent (37 §9.3 step 4).
3. Every result's `trace` deep-equals `reference.json`'s `traces`; the first differing case id is `where`.
4. Until phase 5 the reference is `generated_by: 'node-sqlite', provisional: true`; from phase 5 only the Worker's
   Vitest job with `CONFORMANCE_WRITE=1` writes it (37 §9.3), and `provisional: true` while `apps/worker` exists is red.

**`compat-date`** (33 §7) — strip `//` and `/* */` comments from `wrangler.jsonc`, `JSON.parse`, assert
`compatibility_date >= budgets.worker.compatDateFloor` by ISO string comparison.

**`deploy-parity`** (22 §9; 30 §14; `needs: ['host', 'web-build']`)

1. For `/app/` and `/app/_app/version.json`: fetch `https://${DEPLOY_HOST}<path>` with `Cache-Control: no-cache`;
   SHA-256 the body; compare with `apps/web/build/app/index.html` and `apps/web/build/app/_app/version.json`.
   *(Amended September 23rd 2026 for push A of the one-domain move: the app is built under `paths.base: '/app'`,
   and once push A2 routes `brain.dog` to the Worker, `/` and `/_app/version.json` there are the marketing site's.
   `DEPLOY_HOST` is `app.brain.dog` through pushes A and A2 and is set to `brain.dog` before push B.)*
2. Fetch `/.well-known/braindog-build`; assert `app === BRAINDOG_BUILD`. That path is public and
   `/api/version` is not: the build id belongs to the Worker version rather than to a record, and this
   gate holds no bearer. An unset build answers `null`, which reads as an absent tuple rather than as
   one that merely differs.
3. On mismatch, retry every `budgets.deploy.parityIntervalMs` up to `parityAttempts` (propagation), then red with
   both hashes. A network failure after the last attempt exits `3`.

**`harness-constants`** (22 §7) — over `apps/web/test/**` except `env.ts`: red on
`localhost|127\.0\.0\.1|:\d{4}\b|https?://`.

**`css-rules`** (18 §6; 22 §7; 13 §7) — one regex tokeniser over first-party CSS: `apps/web/src/**/*.{svelte,css}`
(the `<style>` block of a component), the emitted token stylesheet from `packages/theme`, and `packages/render`'s
class emissions. Twelve rules and a report; each rule is its own `what`:

| # | Rule | Red when |
|---|---|---|
| 1 | no colour literal outside the token file | `#hex`, `rgb(`, `hsl(`, `oklch(`, `oklab(`, `color-mix(` outside `packages/theme/**`; `currentColor` is ignored |
| 2 | no `font-size` literal | `font-size:` followed by a digit outside the token file |
| 3 | every `var(--x)` resolves | a name not in the emitted token set and not declared as `--x:` in the same file |
| 4 | no `outline: none` | `outline:\s*(none\|0)` anywhere |
| 5 | no physical inline-axis property | `left right margin-left margin-right padding-left padding-right border-left border-right float:left\|right text-align:left\|right` |
| 6 | every positive `z-index` is a `var(--z-*)` | `z-index:\s*[1-9]` |
| 7 | every icon size is one of four names | an `<Icon size=…>` not in `s m l xl`; a literal `width`/`height` on an `<svg>` |
| 8 | the identifier role never meets a display size | one element's class list holds the identifier role class (13 §3.2) and any of `t-xl t-2xl t-3xl` |
| 9 | no icon component accepts `color` | `color` in `Icon.svelte`'s `$props()` destructure |
| 10 | a component styles only classes it emits | a `.class` selector in a component's `<style>` whose class its own markup never emits, outside `:global(...)` |
| 11 | no media rule beaten by a later copy | a bare rule with a selector identical to one inside an earlier `@media` block, declaring the same property |
| 12 | every semantic colour token has a `pairs.json` entry | a 13 §2.1 role in the emitted set absent from `pairs.json` as foreground or surface |
| R | dead classes — a report | never red: prints classes declared and never emitted, counting `"s-" + x` as reaching `s-*` |

### 5.3 · Gates that are tests — `node --test`, under `pnpm test`

[33-CONTRACTS](33-CONTRACTS.md) §8 wrote `vitest` on three of these; [BUILD.md](../BUILD.md) records the deviation:
`node --test` on `.ts` source, Vitest for the Durable Object host only.

**`where-property`** — `packages/where/test/property.test.ts` (30 §7, §14; [38-SPEC-WHERE](38-SPEC-WHERE.md))

1. Arbitraries: a predicate tree of depth ≤ `budgets.property.maxDepth` over every operator of 34 §1.2 except
   `near` (30 §7: ranking, out of the property), with literals of every value type and the temporal anchors; a row
   set of ≤ `maxRows` rows whose fields are present, `null`, `""`, `[]` or absent — the missing-value rule
   (ADR-058) is what makes the oracle and the SQL agree.
2. For each run: `evaluate(predicate, rows)` in the reference evaluator → set A; `compile(predicate, ctx)` → run the
   SQL over the same rows in `node:sqlite :memory:` with the `entry` DDL → set B; `assert.deepEqual(A, B)`.
3. Also assert on the compiled output: `params.length ≤ 100`; compound selects ≤ 5; expression depth ≤ 100; no
   `"` in the SQL (double-quoted literals are off in `node:sqlite`).
4. `fc.assert(prop, { numRuns: budgets.property.runs, examples: seeds })` where `seeds` is every file under
   `test/seeds/` — replayed first, every run.
5. On failure: write `test/seeds/<seed>.json` (§4) and fail; the file is committed with the fix.

**`boot-probe`** — `packages/ports/test/boot-probe.test.ts` (30 §13; 33 §3)

1. `openNodeSqlite(':memory:')` → `caps.fts5 === true`, `caps.json === true`, `caps.sqlite === '3.50.4'` (37 §9.1).
2. `bootProbe({ ...caps, fts5: false }, 'node:sqlite')` throws `SqlError` `NO_SUCH_MODULE` whose message equals 37
   §5.1's four-line text exactly — `assert.equal`, the text held once in the test (37 §9.4).
3. Phase 5: `apps/worker/test/boot-probe.test.ts` runs step 1 against the real Durable Object adapter.

**`brain-roundtrip`** — `packages/kernel/test/roundtrip.test.ts` (18 §6; 33 §9; 34 §5; 41 §5.10–5.11)

1. Materialise `corpus` (40 §9); page through `exportBrainl(cursor)` and concatenate → A.
2. `importBrainl(A, ctx)` into an empty record; export it the same way → B.
3. Split each into header lines, `dog_sig` lines, body lines. Assert A.body and B.body are identical except that
   B holds exactly one more `event` line, of kind `import` — asserted as *exactly one*. Assert the `dog_manifest`
   rows are identical for every table but `event`.
4. Import into a non-empty record → `IMPORT_NOT_EMPTY`; a flipped byte in a body line → `CHECKSUM_MISMATCH`.

**`refusals`** — the `via` runners of 40 §6, one test file per runner, each where 40's table puts it (30 §6; 40 §6).
**Two of them exist.** `render` is `apps/web/test/refusals-render.test.ts` and `write` is
`packages/kernel/test/refusals-write.test.ts`; both discover the corpus themselves and assert their family's size,
so a new fixture cannot arrive undriven. The write runner sits beside the kernel rather than in `record/test`
because all fifteen of its `raises:` name kernel files, and a runner a layer above the raiser goes green the day
the layer between starts answering for itself. **Seven of the nine are not built**: `lint`, `install`,
`where`, `rpc`, `import`, `pull` and `ask`. This sentence named six and left `ask` out, which is the
same error §4 held. Until a runner is built, its fixtures are headers nothing drives

1. For each `REFUSALS` entry with this runner's `via`: build the input its keys describe (40 §6's table), run the
   surface (`lint(pack, null)`; `plan`; `where/sql`'s `compile`; the kernel's `write` on a fresh materialised record;
   an RPC call; export → tamper → `importBrainl`; `toHTML`).
2. Assert the refusal list is exactly one long, its `code` and `at` equal the fixture's, `found` when the fixture
   carries it, and `fix` is a non-empty sentence (40 §6 rule two).
3. The runners' case counts sum to the total in 40 §6, so a code with no fixture fails here as well as in the
   script. Do not write that total here: 40 §6 owns it and says why copying it is how it goes stale.

**Other tests that are gates**, each a case in its package's `test/`:

| Test | Package | Asserts | Source |
|---|---|---|---|
| `theme-sixteen` | `theme` | the shipped house and high-contrast themes pass checks A–P, both schemes; the high-contrast theme is never refused or auto-corrected — if it is, the validator is wrong | 28 §4.4–4.5 |
| `pack-uninstall` | `declare` + `record` | install every first-party pack, write a row under each, uninstall all: rows intact, `retired = 1`, zero active declarations, nav renders | 04 §4 |
| `money-sum` | `kernel` | summing two currencies throws `MIXED_CURRENCY`; no `+` on a money amount outside `money.ts` (a code-shape grep) | 02 §3; 22 §10 |
| `dialect-fuzz` | `render` | 1,000 random byte strings parse without throwing | 22 §10 |
| `params-under-100` | `where` | a 130-value `not_in` compiles to three `AND`-ed chunks | 30 §7 |
| `reminder-cancel` | `record` | moving a renewal date cancels the old date's reminders before inserting the new | 09 §2 |
| `determinism` | `kernel` | each seed record materialised twice → `dog_manifest` rows equal, table by table | 40 §9 |
| `conformance` (Node host) | `ports` | `runConformance(openNodeSqlite(':memory:'), nodeAssert, reference)`; writes `test/results/node-sqlite.json` (§4); the trace deep-equals `reference.json` | 33 §3; 37 §9.3 |

### 5.4 · Rendered-box gates — Playwright, under `pnpm test:browser`

**The matrix.** `e2e/matrix.ts` exports `FIXTURES = PAGES.map(p => p.id)` (eight, §4), `WIDTHS =
budgets.web.widths`, `SCHEMES = ['light', 'dark']`, `DIRS = ['ltr', 'rtl']`; `forEachConfig(fn)` iterates pages ×
widths inside a spec, and `playwright.config.ts` declares four projects `{ colorScheme } × { dir }` — 8 × 4 × 2 × 2 =
**128 configurations** per spec (50 §9). Direction comes from the record: `setup.ts` materialises every page's record
twice, `locale: 'en'` and `locale: 'ar'`, into the scratch data dir `braindog dev` serves (33 §5), and the shell
derives `dir` from `record.locale` (30 §1) — the DOM is never poked. `targets` and `field-height` add
`test.use({ hasTouch: true })` for the coarse pointer. Chromium only. `SLASH_ENDPOINT` is unset. Every spec asserts
on the accessibility tree and computed geometry, never on markup or pixels (22 §10). The names below are 50 §9's
sixteen plus `vault-screen`; 50 owns the spec files, this spec owns their place in the workflows and their negatives.

**Non-vacuity, in every spec.** The first assertion of every spec is one the degraded branch cannot satisfy:
`aria-rowcount === page.expect.rows` for a register page, a mark per row, zero inline comboboxes — never
`childElementCount > 0` (18 §6).

| Spec | Steps | Source |
|---|---|---|
| `targets` | 1 · every `button, a, [role=button], [role=option], input, [role=gridcell] [tabindex]`; 2 · rect = union of the element's box and its `::before`/`::after` boxes; 3 · both axes ≥ `budgets.targets.minPx` | 13 §7 |
| `row-centre` | 1 · every `[role=row]`; 2 · centre-y of each child's box; 3 · max − min ≤ `budgets.row.centreTolerancePx`, or the row has wrapped (`offsetTop` differs) | 13 §7 |
| `field-height` | 1 · every `input, select, textarea, [role=combobox]`; 2 · one distinct height per pointer size across all four widths; 3 · a width change never changes the height — measured, not read from source | 18 §6 |
| `contrast` | 1 · axe-core `color-contrast` over the page: zero violations; every `pairs.json` pair ≥ `budgets.contrast.textAA` as text, ≥ `nonTextAA` for `edge` and focus; a pair over `textAA` with APCA `\|Lc\| < apcaWarnLc` is printed as advisory, never red (28 §4.1); 2 · every element's computed colour is in the emitted token set or an identity accent `oklch(L C h)` on a mark/chip/avatar/dot/series; 3 · the value is in the sRGB gamut via a 1×1 canvas readback, never the CSSOM string (22 §7 gate 3) | 22 §7; 50 §9 |
| `focus` | 1 · tab order equals visual order (sort by box, compare); 2 · arrow keys in the grid move `activeElement` to the box it *looks* like it lands on — assert the box, not the id; RTL inverts the inline axis only; 3 · the two-tone ring is present on every focusable; 4 · with `requestAnimationFrame` stubbed to a no-op, the selected control still paints a non-transparent background — the decorative pill is never the only thing drawing selection | 13 §7; 22 §7; 22 §10 |
| `screenshot-mode` | 1 · record every element's box and `scrollHeight`; toggle `html[data-shot]`; boxes and height byte-identical; 2 · a redacted figure re-rendered as all `0` and as all `8`: pixel readback of its box is identical; 3 · every legible text node is in `shot-allowlist.json` | ADR-050; 19 §6 |
| `motion` | 1 · `--ease-spring` sampled at 1,000 points: last value `=== budgets.motion.springEnd`, max `≤ springPeakMax`; no duration token > `ceilingMs`; 2 · open a panel; after `transitionend`, its box equals the target box exactly — a spring ending at 0.998 leaves a gap; 3 · `prefers-reduced-motion: reduce`: the same state change completes within `reducedMs` and still changes something | 13 §9; 50 §9 |
| `bundle` | no browser; reads the step-6 build: 1 · parse `build/index.html` for the `_app/immutable/**.js` it preloads and the `.css` it links; 2 · `brotliCompressSync` each — JS sum ≤ `mainJsBrotli`, CSS sum ≤ `mainCssBrotli`; `gzipSync(index.html)` ≤ `htmlGzip`; 3 · `build/**/*.woff2` count `=== fontFiles`, bytes ≤ `fontsBytes`; 4 · from `.svelte-kit/output/client/.vite/manifest.json`, BFS from the entry over static `imports` never reaches the chunk owning `src/lib/editor/index.ts`, whose gzip ≤ `editorGzip` | 22 §9 |
| `a11y-tree` | 1 · for every fixture block and the degraded fence, the accessibility tree of `<Block>`/`<Table>` equals that of `toHTML`'s markup parsed by the browser, and `--cells`/`--cols` are equal (31 §2; 36 §9); 2 · every plot's list twin holds ≥ every event the plot draws | 22 §10; 19 §4; 50 §9 |
| `shell` | `/app/r/obligations` requested directly answers `app/index.html` and the grid renders; `/app/_app/version.json` exists and equals the build's | 50 §9 |
| `grid-contract` | 1 · the APG checklist: roving `tabindex` on the row; ←→↑↓, `Home`/`End`, `⌘Home`/`⌘End`, `PageUp`/`PageDown`; `aria-sort`; `aria-rowcount`/`aria-rowindex` when windowed; the labelled `role=region` with `tabindex=0`; 2 · DOM rows = `min(rows, 2,000)` and the cap line at 2,000; 3 · every grid and flex container: tracks not `0px` equal `children.length`; container width − (children widths + gaps) < `budgets.layout.emptyTailPx`; header cell widths `===` body cell widths, exactly | 13 §7; 22 §10; 50 §9 |
| `page-render` | every declared block once, in order; each `expect.empty` string present iff zero rows; `aria-rowcount === page.expect.rows`; degraded blocks `=== page.expect.degraded`; a failed block renders `role="status"` and the page one `role="alert"`; the unknown-primitive page renders *Block "…" needs a newer client.* | 22 §10; 40 §9; 50 §9 |
| `no-model` | with `SLASH_ENDPOINT` unset every spec passes and no element's text contains *Slash* | 23 §8; 50 §9 |
| `keys-sheet` | the `?` sheet lists exactly the registry; every palette row's printed `<kbd>` matches its binding; nav destinations equal the drawn nav | 19 §4; 50 §9 |
| `vault-screen` | 1 · a closed row draws no `opens`; 2 · opening a row expands exactly one; 3 · no value control exists when nothing is expanded; 4 · under `data-shot` the screen is absent — not in the DOM, not blurred | 12 §8 |
| `job-view` | over a fixture job stream: 1 · one row per tool call; 2 · a result over `budgets.jobView.foldBytes` is folded and the fold names both lengths — `2,000 of 41,812 characters`; 3 · a one-line result is not folded; 4 · with the socket held closed, one poll per `budgets.jobView.pollMs`, `after=` monotonic and reaching non-zero; 5 · events received after the panel closes > before; 6 · zero requests when no job is live | 23 §3.1 |
| `draft-survives-load` | 1 · gate the screen's load behind a promise; 2 · type into the sheet; 3 · resolve the load; 4 · the typed text is present. Verified non-vacuous once by removing the guard and watching it fail | 22 §7 |

### 5.5 · The pyramid — what runs where, and how long

| Layer | Runner | Lives in | Volume | Budget | Workflow |
|---|---|---|---|---|---|
| Unit | `node --test` | `packages/*/test` | ~150 cases; each ≤ 50 ms | ≤ 30 s | `ci.yml` |
| Property | `node --test` + fast-check | `packages/where/test` · `packages/render/test` | 1,000 predicate runs + 1,000 fuzz strings + every seed | ≤ 20 s | `ci.yml` |
| Conformance | `node --test` (Node); Vitest (DO) | `packages/ports/src/conformance` | thirty-two cases, equal `ran` per host | ≤ 10 s Node; ≤ 4 min DO | `ci.yml` |
| Fixtures | `node --test` | `fixtures/` · `kernel/test` · `declare/test` · `record/test` | 9 materialisations (`five-thousand` ≤ 10 s, 40 §7); 119 refusal fixtures, two of the nine `via` runners built; round-trip; determinism | ≤ 40 s | `ci.yml` |
| Gates | `node tools/gates/run.mjs` | `tools/gates` | 27 scripts + 59 negative fixtures (§3) | ≤ 5 min | `gates.yml` |
| Browser | Playwright 1.62.1, imported by six gates | `tools/gates` | no spec files; the browser work is `layout` `a11y` `keys` `prefs` `passkey` `queue` (§3) | nineteen minutes, which is a comment in `run.mjs` and the only figure that exists: nothing times a gate. That comment says *the two browser gates*, and was written when there were two, so the number survives it and the count does not | `gates.yml` |
| Durable Object | Vitest 4.1.11 + plugin 1.1.2 | `apps/worker/test` | twenty-eight files (§3), and neither `conformance.test.ts` nor `boot-probe.test.ts` is one of them: `ls apps/worker/test/` names neither, so this row asked for two files that have never existed | ≤ 4 min | `ci.yml` (phase 5) |
| Deploy | `deploy-parity` | `tools/gates` | 3 fetches, ≤ 6 attempts | ≤ 2 min | `deploy.yml` |

### 5.6 · Publishing ([31-STACK](31-STACK.md) §6; ADR-042)

1. **Once, by hand, in the first five minutes:** reserve `braindog`, `braindog-render`, `braindog-cli`,
   `braindog-mcp` and the `@braindog` scope. Pick the GitHub org before the first push — a repo move after gates
   1a–1d start breaks every dependent link.
2. **First publish, by hand:** `npm publish` `braindog-render@0.0.1` and `braindog-cli@0.0.1` with a granular
   token that expires in 7 days; then, per package, configure Trusted Publishing on npmjs.com → this repository,
   workflow `release.yml`; then revoke the token. Trusted publishing for a *first* publish is unverified, so it is
   never relied on.
3. **Every release after:** `pnpm release render 0.1.0` (§2) → tag `render-v0.1.0` → `release.yml` publishes under
   `id-token: write`. Provenance is automatic. Two packages, two tags, two configurations — no Changesets.
4. **The version tuple.** `braindog --version` and `GET /api/version` print
   `app <YYYY.MM.DD>+<sha7> · format 1 · kernel <n> · primitives 1`. `app` is `BRAINDOG_BUILD` injected by
   `deploy.yml` step 4; `format` is `PRAGMA user_version`; `kernel` is `MAX(migration.version)`; `primitives` is
   `PRIMITIVES_VERSION`. **The app has no semver.** Only the two npm packages carry one, and their lines are
   independent of each other and of every record number.

## 6 · Refusals and errors

A gate does not raise refusal codes; it prints one line and sets an exit code. The line is the refusal.

**The one line.** Every red gate prints exactly one JSON line (§4) carrying `gate`, `what`, `expected`, `found`,
`where`. Read as a sentence: *`closed-lists`: list Schedule kinds — the migration CHECK has 9, the owner says 10;
expected `… snapshot`, found `… score`; at `0001_kernel.ts:212`.* A `what` is a fact about the thing measured,
never advice; the `fix` sentence belongs to the design document the `where` points at. A test under `node --test`
reports the same five facts through `assert`'s `message`: `what — expected X, found Y (where)`.

| Exit | Meaning | Who exits with it |
|---|---|---|
| `0` | every gate green; every skip printed, and allowed where it was printed | `run.mjs` |
| `1` | at least one gate red, a gate crashed, or a skip was disallowed under `CI=true` | `run.mjs`; `self-test.mjs`; `node --test`; `playwright test`; `vitest run` |
| `2` | the run was asked for something it cannot do: a gate name matching nothing, an empty selection, a flag with no value | `run.mjs` |
| `3` | a gate could not run, because a prerequisite of its own is absent and it therefore measured nothing | any gate with a prerequisite; `run.mjs` reads it as a skip and never as a pass |

Exit `3` is the skip, and this table said otherwise for as long as it has existed: it read *"the live host was
unreachable after every attempt"*, owned by `deploy-parity` alone, two lines above a **Skips** paragraph
describing the real meaning. Ten gates exit `3`, all of them for an absent prerequisite, and an unreachable host
in `deploy-parity` is a finding like any other and exits `1`. The CLI's own `3 unreachable` (33 §5) is a
different number in a different program and the two do not mirror each other.

**A red gate is never skipped.** There is no `skip`, `only`, `retry` or `allow-failure` on a gate. A red gate is
one of three things, and the third is the only one that touches the gate: the code is wrong — fix the code; the
gate is wrong — fix the gate and add the case that exposed it to `negative/`; the *rule* is wrong — change the design
document first, cite the change in the commit that changes the gate, and update `budgets.json` in the same commit.
A gate deleted without a design amendment is a review finding ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §1).

**Skips.** A skip is a missing prerequisite, never a failing assertion; it names the command that removes it, and
names only the prerequisites actually absent; under `CI=true` an unlisted skip is red and `run.mjs` exits `1`.
A conformance skip (`requires` unmet) is printed by `conformance-count` with its reason, attributed and never
silent (33 §3).

## 7 · Performance budget

Every number below is a key in `budgets.json`, and every workflow job carries `timeout-minutes` equal to its wall
budget — so a budget that is exceeded fails, it does not warn (22 §9).

| Budget | Value | Measured how |
|---|---|---|
| `ci.yml` wall time | ≤ 20 min | the job's `timeout-minutes`; trend from `gh run list --workflow ci.yml --json createdAt,updatedAt` |
| `gates.yml` wall time | ≤ 5 min | as above; each gate's `ms` is in its result line |
| `pnpm test` | ≤ 90 s | `node --test` reporter duration, summed by the CI step |
| `where-property` | 1,000 runs ≤ 20 s | the test's own `performance.now()`; a run is one compile, one evaluate, one `exec` |
| Browser matrix | 128 configurations × 17 specs ≤ 10 min on one runner | Playwright's report; shard `--shard=i/4` only when this is hit, never before |
| `pnpm test:do` | ≤ 4 min | Vitest's report |
| `deploy-parity` | ≤ 6 attempts × 10 s | the gate's `ms` |
| Each script gate | its `ms` column in §3 | the result line; a gate over its budget is a review finding, not a red — a gate's own speed is not a product property |

The **INP p75 ≤ 100 ms on the target phone** row of 18 §6 is not in any workflow: 22 §10 measured that a throttled
headless browser does not measure scroll or input latency. It is recorded per release, by hand, on the target phone
over ADB, and written into [53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md)'s release checklist until an ADB harness
exists (§10).

## 8 · Security

| Boundary | Rule |
|---|---|
| Secrets in CI | two, and no more: `CLOUDFLARE_API_TOKEN` (deploy-scoped, environment `production`, `deploy.yml` only) and the npm OIDC identity (`id-token: write`, `release.yml` only). No npm token, no classic token, no long-lived anything (12 §8; 31 §6) |
| Workflow permissions | every workflow declares `permissions:`; the default is `contents: read`; `gate1.yml` adds `issues: read`; `release.yml`'s app job adds `contents: write` to create the release; `codeql.yml` adds `security-events: write`, which is the only way an analysis reports. Nothing else has `write` but the OIDC id-token. *An earlier draft of this row said "nothing has `write` but the OIDC id-token" and was written before either workflow existed; a release that cannot create a release and an analysis that cannot file an alert are not tighter, they are inert.* |
| Actions | six, pinned to a major: `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`, `actions/cache@v4`, and `github/codeql-action/*@v3` as one publisher. `wrangler` and `playwright` run from the lockfile, never from a marketplace action. **A major tag is mutable**, so a compromised publisher reaches this repository without a commit in it; `renovate.json5` sets `pinDigests`, which rewrites each to a 40-character sha with the tag in a trailing comment and then maintains it — the only pinning that is both safe and current. *An earlier draft said four and named a cache action in none of the five workflows it specified.* |
| Installs | `pnpm install --frozen-lockfile` in every job; `minimumReleaseAge: 1440` and `linkWorkspacePackages: false` in `pnpm-workspace.yaml` (31 §3) — a package under 24 h old never installs, a typo'd internal name fails loudly |
| The deploy | `deploy-parity` runs after every `wrangler deploy`, in the same job, and a red parity fails the deploy run — a green deploy serving a stale asset has happened three times before (30 §14) |
| What a gate may read | the repository, `build/`, and the live host named by `DEPLOY_HOST`. No gate reads a secret; `deploy-parity` fetches unauthenticated routes only |
| What a test may hold | fixtures are synthetic: no real payee, credential, email or amount; `clean-room` walks `fixtures/**` too. `secret-grep` does NOT: it loops over `packages` and `apps` only, and its own comment claims `packages/fixtures/**` is in scope, which is a directory this tree has never had. The refusal corpus at `fixtures/refusals/` is therefore unscanned by that gate, and the fix belongs in `secret-grep.mjs` rather than here |
| Logs | a gate's line carries a path, a count, a hash, a code — never a field value or a body (35 §2). `deploy-parity` prints hashes, not HTML |
| Provenance | npm provenance is automatic under trusted publishing; `release.yml` step 8 verifies the version landed, and a consumer may verify the attestation against this repository and `release.yml` |

### 8.1 · A sixth workflow, and why the list in §2 is five

§2 names `ci.yml`, `gates.yml`, `deploy.yml`, `release.yml` and `gate1.yml`. `codeql.yml` is a sixth,
and it is here rather than folded into `ci.yml` for one reason: **the analysis has to be able to
write a security alert, and nothing else in the repository may write anything.** A job with
`security-events: write` inside `ci.yml` would put that permission on the same workflow file as the
test run, and a workflow's permissions are read by whoever changes it next.

Its second matrix leg is `actions`, which analyses the workflow files themselves. That is not
symmetry: `deploy.yml` holds a Cloudflare token scoped to the account that serves `brain.dog`, and
**workflow injection is the way that token leaves** — an untrusted `github.event.*` value interpolated
into a `run:` block. No gate in `tools/gates/` looks for it, and none reasonably could, because the
thing being analysed is a shell string assembled by a YAML template at run time.

*The three rows above were amended in the revision that added this workflow rather than after it,
because a specification that contradicts the tree is worse than one that is silent: the next reader
cannot tell which of the two is the mistake.*

---

## 9 · Tests and gates

The gates' own tests. A gate that has never failed is a gate that may not work.

**The negative-fixture rule.** Every script gate has `tools/gates/negative/<gate>/` holding one seeded violation —
a minimal tree the gate runs against with `ctx.root` pointed at it. `self-test.mjs` runs each gate against its
negative and asserts: exit red; `what` equals the fixture's `expect.what`; `where` names the seeded file. It also
asserts that every key of `budgets.json` is read by at least one gate, test or spec (by grepping `budgets.<key>`
across `tools/gates`, `packages/*/test` and `apps/web/test`), and that every `timeout-minutes:` in
`.github/workflows/*.yml` equals its `budgets.ci` key. `gates.yml` step 6 runs it; `pnpm gates -- --negative` runs
it locally.

| Gate | Seeded violation |
|---|---|
| `graph` | a `packages/where/src/x.ts` importing `@braindog/kernel` |
| `licence-closure` | a `dist/index.js` containing `from '@braindog/where'` |
| `clean-room` | one identifier from the list in a `.ts` comment |
| `no-declarations-in-kernel` | a second `INSERT INTO declaration` |
| `closed-lists` | a migration CHECK with nine schedule kinds |
| `event-kinds` | thirty-nine kinds in the CHECK, forty in the table |
| `refusal-fixtures` | `refusals/version-stale.yaml` deleted; `refusals/not-a-code.yaml` added |
| `router-groups` | a `POST /api/openGrant` route with `auth: 'bearer-or-cookie'` |
| `slash-actor` | a materialised record given one `event` row `actor = 'slash', kind = 'edit'` |
| `mcp-budget` | a tool description of 1,200 bytes |
| `secret-grep` | `console.log(plaintext)` |
| `telemetry-allowlist` | a second `writeDataPoint(` whose blob tuple carries `register` |
| `shot-allowlist` | one literal removed from the JSON |
| `conformance-count` | a `results/node-sqlite.json` with `ran` one short and no skip |
| `compat-date` | `"compatibility_date": "2026-02-23"` |
| `deploy-parity` | a `build/index.html` whose hash differs from a local stub host's (`http://127.0.0.1:<port>` served by the fixture itself) |
| `grant-note` | a `grant.add` event whose note contains the grant's `label` |
| `harness-constants` | `const base = 'http://localhost:5173'` in a spec |
| `css-rules` | twelve files, one per rule, each breaking exactly its rule |

**Two rules for writing any test here**, enforced at review and named in 18 §6:

1. **Assert on something only the real branch produces.** `rows ≥ 4`, a mark per row, `aria-rowcount ===
   page.expect.rows` — never `childElementCount > 0`. A spec whose first assertion could pass on the error path
   is rejected.
2. **A regression test carries the old wrong number in its name.** `'a 130-value not_in compiled to one IN of 130
   params (was TOO_MANY_PARAMS)'`, `'spring settled at 0.998 (now 1)'` — so a reviewer sees what it protects.

**The Playwright specs' own check:** each spec runs once against `negative/web/` — a fixture page built to fail it
(a 40 px control, a header track that differs from the body's, a missing focus ring, a `build/` whose `index.html`
preloads a 40 KB chunk and whose manifest imports the editor statically) — under `pnpm test:browser --
--project negative`, which is a fifth project of 8 configurations, not 128.

## 10 · Deliberate ceilings

- `ponytail:` gates run serially in one process; parallelise with `Promise.all` per file when `gates.yml` passes 5 min.
- `ponytail:` `css-rules` is a regex tokeniser over first-party CSS we control, not a CSS parser; add `postcss` (dev only) the first time a real rule is missed or a false red needs a hand-written exception.
- `ponytail:` `graph` does layers 3–5 of 31 §3 by regex over import specifiers; add ESLint flat + `import-x` when a rule needs an AST (re-exports, type-only imports, `import.meta`).
- `ponytail:` `mcp-budget` counts with 44's `tokenBudget`, a calibrated heuristic; the day 44 swaps in a real tokenizer this gate changes nothing.
- `ponytail:` `deploy-parity` checks `/app/`, `/app/_app/version.json` and `/.well-known/braindog-build`; add the hashed asset list from `build/` when a stale sub-asset is ever served with a fresh shell.
- `ponytail:` the browser matrix runs Chromium only; add WebKit for the `focus`, `targets` and `grid-contract` specs when a Safari-only layout bug reaches a user.
- `ponytail:` no sharding, no retries, no flaky-test quarantine; shard at the §7 budget, and a flaky spec is fixed or deleted, never retried.
- `ponytail:` the property test runs 1,000 cases in CI (33 §8 said 10,000); raise `budgets.property.runs` when a seed is found that 1,000 runs missed twice.
- `ponytail:` the conformance reference is Node's until phase 5; the Durable Object's from then, regenerated only by `CONFORMANCE_WRITE=1 pnpm test:do` on a developer's machine, and committed by a person.
- `ponytail:` INP on the target phone is measured by hand per release; automate over ADB with `long-animation-frame` counting when the release checklist has been run five times.
- `ponytail:` `shot-allowlist` extracts literals by regex from `.svelte` markup; use the Svelte compiler's AST (already a devDependency of `apps/web`) if a template form escapes the regex.
- `ponytail:` `clean-room.txt` is a hand-kept list; there is no automated derivation because the derivation would require reading the predecessor, which is the one thing the rule forbids.
- `ponytail:` `gate1.yml` writes a step summary and nothing else; add an issue comment when the numbers are read by anyone other than the owner.
- `ponytail:` screenshots are artefacts on failure only; there is no visual-diff service and none is planned.

## 11 · Dependencies

Runtime: **none.** Nothing in this spec ships.

| Dev dependency | Version | Where | For |
|---|---|---|---|
| `typescript` | 6.0.3 | root | `pnpm typecheck` ([31-STACK](31-STACK.md) §3) |
| `@types/node` | 24.13.0 | root | the gates and tests |
| `fast-check` | 4.9.0 | `packages/where`, `packages/render` | the property test, the parser fuzz |
| `@playwright/test` | 1.62.1 | `apps/web` | the rendered-box specs |
| `axe-core` | 4.13.0 | `apps/web` | the `contrast` spec |
| `vitest` | 4.1.11 | `apps/worker` | the Durable Object host (phase 5) |
| `@cloudflare/vitest-plugin` | 1.1.2 | `apps/worker` | peers `vitest ^4.1.0` exactly — the repo's hardest pin |
| `wrangler` | 4.128.0 | `apps/worker` | `deploy.yml` step 5 |
| `esbuild` | the version `wrangler` 4.128.0 pins | `apps/cli`, `packages/render` | the publish build — one file, no deps (31 §8) |

`tools/gates/**` and `tools/release.mjs` import `node:*` only. Node **24.13.0** pinned to the minor; pnpm
**11.25.0** via corepack. No task runner, no Changesets, no Stylelint, no dependency-cruiser, no ESLint yet (§10).

## 12 · Build order

| Phase ([BUILD.md](../BUILD.md)) | This spec delivers | Unblocks |
|---|---|---|
| 0 · Foundations | `run.mjs`, `lib.mjs`, `budgets.json`, `self-test.mjs`; `graph`, `licence-closure`, `clean-room`, `conformance-count`, `compat-date`; `gates.yml`; the Node conformance host and the first `reference.json`; `where-property` with `test/seeds/`; `dialect-fuzz` | every later package has a green `pnpm test` and `pnpm gates` to land into |
| 1 · Kernel | `closed-lists`, `event-kinds`, `refusal-fixtures`, `no-declarations-in-kernel`, `slash-actor`, `grant-note`; the `lint`, `where`, `write` and `import` refusal runners, `roundtrip.test.ts`, `determinism`, `money-sum`, `boot-probe`, `theme-sixteen` | a record that refuses every code with a fixture |
| 2 · Self-host + CLI | `router-groups`; the `install` and `rpc` refusal runners; `pack-uninstall`; `tools/release.mjs`; `release.yml`; the hand publish of `0.0.1` ×2 | `braindog-cli` on npm |
| 3 · Web | `env.ts`, `e2e/matrix.ts`, `e2e/setup.ts`, the seventeen specs, `negative/web/`; `css-rules`, `shot-allowlist`, `harness-constants`; `ci.yml` steps 6–9 | the eight fixture pages pass the rendered-box gates |
| 4 · Ingest, rules, metrics | `reminder-cancel`; `job-view` against a fixture stream | — |
| 5 · Cloud | `apps/worker/test/` under Vitest; `reference.json` regenerated from the Durable Object; `deploy.yml`; `deploy-parity`; `telemetry-allowlist`; `ci.yml` step 10 | a deploy that passes parity |
| 6 · Packs, MCP, Slash A | `mcp-budget`; `secret-grep`; `vault-screen` | — |
| after the first publish | `gate1.yml` | the four numbers of 15 §5 |

Nothing in this spec waits on [53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md); 53 consumes `deploy.yml`, the version
tuple and the INP checklist row from here.

## 13 · Decisions taken here

Each decision names the design document to amend in the same revision ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §1).

| # | Decision | Amend |
|---|---|---|
| 1 | **The budgets file.** Every number a gate asserts lives in `tools/gates/budgets.json`; a gate holds no numeric literal but `0`, `1` and indices; a count is never a budget — it is read from the owning enumeration | 33 §8 (cite the file); 18 §6 (the numbers in its rows point here) |
| 2 | **The gate output format.** One JSON line per gate — `gate ok ms` or `gate skip`, and on red `what expected found where`; a summary line last; exit codes `0 1 2 3` | 33 §8 |
| 3 | **`pnpm` scripts.** Six root scripts: `test typecheck gates test:browser test:do release`; per-package `test` is `node --test "test/**/*.test.ts"`; `gates` takes `--only`, `--allow-skip`, `--negative` | 31 §8 (the tree's root); BUILD.md |
| 4 | **The negative-fixture rule.** Every script gate has one seeded violation under `tools/gates/negative/<gate>/`, run by `self-test.mjs` in `gates.yml`; every Playwright spec runs once against `negative/web/` | 33 §8; 18 §6 |
| 5 | **`node --test` for `where-property`, `boot-probe`, `brain-roundtrip`.** 33 §8's `vitest` column becomes *test*; Vitest is `apps/worker/test` alone | 33 §8 (BUILD.md already records the deviation) |
| 6 | **1,000 property runs, not 10,000.** `budgets.property.runs = 1000`, every committed seed replayed first | 33 §8; 30 §7 (add the number) |
| 7 | **The four widths are 390 / 768 / 1024 / 1440.** 22 §10 said *four widths* and named none; 390 is 22 §4's phone, 1440 is 13 §4.2's column ceiling | 22 §10 |
| 8 | **Seventeen Playwright specs, not ten.** [50-SPEC-WEB](50-SPEC-WEB.md) §9's sixteen names are adopted as written (they fold 22 §10's layout assertions into `grid-contract` and 18 §6's `page-render`, `shell`, `no-model`, `keys-sheet` rows in); `vault-screen` is added because 50 covers only one of 12 §8's three vault invariants; `bundle` stays a spec — it reads the build, needs no browser, and runs in `ci.yml` step 8 | 33 §8; 50 §9 (add `vault-screen`) |
| 9 | **`telemetry-allowlist` is two gates.** 33 §8's row conflated 08 §5's Analytics Engine blob list with ADR-050's screenshot-mode provenance list; they are `telemetry-allowlist` and `shot-allowlist` | 33 §8 |
| 10 | **No Stylelint.** 22 §7 gate 1's three Stylelint rules and 18 §6's CSS rows are the twelve rules of `css-rules.mjs`, one regex tokeniser, zero dependencies; Stylelint or `postcss` is added the day a rule needs a parser (§10) | 22 §7; 31 §3 |
| 11 | **`graph` covers 31 §3's layers 3–5.** ESLint + `import-x` is deferred until a rule needs an AST | 31 §3 |
| 12 | **The round-trip differs by exactly one row.** Export → import → export is identical but for one appended `event` of kind `import`, asserted as exactly one; 18 §6's *identical* is amended to say so | 18 §6; 33 §9 |
| 13 | **Direction comes from the record.** The RTL half of the matrix is every fixture materialised with `locale: 'ar'`; the harness never sets `dir` on the DOM | 22 §10; 40 (two locales per page) |
| 14 | **`gate1.yml` is a report.** It never fails and maps to no gate; 33 §8's *one-to-one* mapping holds for the other four workflows | 33 §8 |
| 15 | **Each conformance host writes `packages/ports/test/results/<host>.json`** (§4) so `conformance-count` has an artefact to read; the reference's `provisional` flag and `CONFORMANCE_WRITE=1` are 37 §9.3's, adopted as written | 37 §3, §9.3 (add the results file); 33 §3 |
| 16 | **INP on the target phone is a release checklist row, not a workflow step**, until an ADB harness exists | 18 §6; 53 |
| 17 | **`deploy-parity` also checks the deployed build id**, at the public `/.well-known/braindog-build` rather than at `READ+` `/api/version`, which takes a bearer this job has never held: the `app` tuple must equal the deploying run's `BRAINDOG_BUILD` | 33 §8; 22 §9 |
| 18 | **`refusal-fixtures` is a script and the runners of 40 §6.** The script owns the enumeration (a code per fixture, a fixture per code); the `via` runners of 40 §6, in the packages 40's table names, own *produces exactly it* | 33 §8; 30 §6 |
| 19 | **Interface with [40-SPEC-FIXTURES](40-SPEC-FIXTURES.md), confirmed.** This spec reads `PAGES`, `SEED`, `REFUSALS`, `PACKS` as 40 §2 exports them, the `Page.expect` shape, the `corpus` record, and the materialiser at `packages/kernel/test/materialise.ts` (40 §5.3). Two asks of 40: `materialise` takes `{ locale }` so a record can be built `ar` for the RTL half (decision 13), and a fixture job stream for `job-view` | 40 §5.3 (the `locale` option); 40 §3 (a `jobs/` stream) |
| 20 | **`clean-room.txt` is the owner's file.** Its content is never derived, generated or reviewed by a builder; the gate asserts only that it is non-empty and that nothing matches | BUILD.md |
| 21 | **`budgets.mcp` and 44's `BUDGETS` are one number twice, asserted equal.** `mcp-budget` deep-equals them on the five shared keys before counting; a change to either without the other is red | 44 §2 (cite `budgets.json`); 33 §8 |
| 22 | **The four `test/env.ts`, `test/e2e/`, `braindog dev` and `PAGES` names are 50's and 48's**, adopted over this spec's first-draft `harness.ts`, `server.ts`, `FIXTURES` — one name per thing across the two specs | 50 §3, §9 (no change; recorded so the audit sees the agreement) |

Twenty-two, counted.

## 14 · Done when

- [ ] `pnpm gates` prints nineteen result lines and a summary; `pnpm gates -- --negative` prints nineteen reds, each with the seeded `where`
- [ ] `tools/gates/budgets.json` holds every number in §3–§7; `self-test.mjs` finds no unread key and no gate with a bare numeric literal
- [ ] `ci.yml`, `gates.yml`, `deploy.yml`, `release.yml`, `gate1.yml` exist as §2's tables; every job has `permissions:` and `timeout-minutes`
- [ ] `pnpm test` runs `where-property` at 1,000 runs with every `test/seeds/*.json` replayed first, and the seeds directory has at least the first committed counter-example
- [ ] `packages/ports/src/conformance/reference.json` is committed; `conformance-count` reads `test/results/node-sqlite.json` and reports equal counts and every skip
- [ ] `refusal-fixtures` and every built `via` runner are green, and the runners' counts sum to the per-`via`
      totals in 40 §6
- [ ] the seventeen specs run over 128 configurations in four projects; `targets` and `field-height` also under `hasTouch`; the first assertion of every spec is non-vacuous
- [ ] `env.ts` is the only file under `apps/web/test/` with a host or port literal
- [ ] `braindog-render@0.0.1` and `braindog-cli@0.0.1` were published by hand; both packages have Trusted Publishing configured; the token used is revoked
- [ ] `pnpm release render 0.1.0` produced a tag, and `release.yml` published it with automatic provenance
- [ ] `deploy.yml` deployed once and `deploy-parity` was green on the live host, including `/.well-known/braindog-build`
- [ ] `braindog --version` prints `app <date>+<sha> · format 1 · kernel <n> · primitives 1`
- [ ] every workflow's wall time is under its §7 budget, read from the run list
- [ ] every amendment in §13 is applied to its design document in this revision

---

*Previous: [51-SPEC-WORKER](51-SPEC-WORKER.md). Next: [53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md).*
