# 35 · The technical specifications — how to read one, and the template every one follows

Documents 00–34 decide *what* BrainDog is and *which* trade-offs it makes. The specifications, 36–53, decide
*how each package and app is written* — to the level where a builder who has never seen the predecessor, and
must never look at it, can type the files without a design meeting. One spec per package in the build order
of [31-STACK](31-STACK.md) §2, one per app, and two cross-cutting: testing and operations.

> **Clean room.** Nothing here is ported. Nobody writing or building from these documents reads the predecessor's
> code at `C:\Tools\legacy`; its behaviours were traced into [32-PARITY](32-PARITY.md), its code stays where it is,
> and every part below is designed on its own merits. A spec that would be easier to write by looking is a spec
> that has not understood the problem yet.

---

## 1 · What a spec is for

A design document argues. A spec **states**: every exported symbol with its signature, every file with its
responsibility, every algorithm as numbered steps with the exact SQL where SQL is involved, every refusal with
its code, every test as a case a runner can execute, and every deliberate simplification with the condition that
would remove it. Where a spec needs a decision the design documents did not take, it takes it, lists it under
*Decisions taken here*, and the design document is amended in the same revision — the two never disagree for
longer than one loop iteration.

The mode is **ponytail** (lazy senior engineering): the standard library before a dependency, a native platform
feature before code, the fewest files that hold, no abstraction with one implementation, deletion before
addition, one runnable check per non-trivial piece of logic, and a `ponytail:` line naming every ceiling a
simplification leaves behind and the upgrade path when it is hit. Laziness shortens the solution, never the
reading: a spec traces the whole flow before it picks the smallest shape.

## 2 · Conventions every spec inherits

| Concern | Rule |
|---|---|
| Language | TypeScript 6.0.3, type-check only. Node 24.13 runs the `.ts` sources directly, so there is no build step until a package is published (`braindog-render`, `braindog-cli`). Every local import carries its `.ts` extension |
| Syntax | `erasableSyntaxOnly`: no `enum`, no `namespace`, no parameter properties, no `const enum`. Types are `type` aliases and `interface`s; closed lists are `as const` arrays with a derived union |
| Modules | ESM only. A package's public surface is its `exports` map; nothing else is importable. Packages import only *down* the total order (`render → ports → where → theme → fixtures → kernel → declare → extract → mcp → record → spark → connect`); apps import packages, never each other |
| Tests | `node:test` and `node:assert/strict`, files `test/**/*.test.ts`, run with `node --test`. Property tests use `fast-check` 4.9.0 and commit every failing `{ seed, path }` under `test/seeds/`. The Worker's Durable Object tests alone use Vitest + `@cloudflare/vitest-plugin` (phase 5) |
| Dependencies | runtime: zero in every package except the two the Worker needs (`@pushforge/builder`, `age-encryption`) and Svelte in `apps/web`. A new runtime dependency is a new ADR. Dev: the pins in [31-STACK](31-STACK.md) §3 |
| Naming | files kebab-case; types `PascalCase`; functions and fields `camelCase`; SQL and JSON keys `snake_case`; refusal codes `UPPER_SNAKE` from [30-BLUEPRINT](30-BLUEPRINT.md) §6; identifiers per [34-GRAMMARS](34-GRAMMARS.md) §4 |
| Errors | inside a package: `throw` a typed error whose `code` is from a closed list; at the record's boundary: the `Result<T>` envelope of [33-CONTRACTS](33-CONTRACTS.md) §2 — never an exception across an RPC |
| Logging | a log line never carries a field value, a credential, a prompt or a raw payload — the code, the id and the shape only ([12-SECURITY](12-SECURITY.md) §8) |
| Comments | explain *why*, in full sentences, at the decision — never what the next line does. A `ponytail:` comment names a ceiling and its upgrade path |
| Money and time | integers in minor units with a currency; RFC 3339 UTC instants; `YYYY-MM-DD` days; never a float for a figure ([02-DATA-MODEL](02-DATA-MODEL.md) §3–§4) |
| Licence | `packages/render/**` MIT with an SPDX header on every source file; everything else `Apache-2.0` ([31-STACK](31-STACK.md) §4) |
| Size | a package is a handful of files. A spec that needs more than about eight source files is describing two packages, or an abstraction that should not exist |

## 3 · The template

Every spec has exactly these sections, in this order, with these headings. A missing section is a review finding.

```
# NN · <package or app> — specification

## 1 · Purpose and boundary        what it does, what it refuses to do, what it may import
## 2 · Public API                  every exported symbol: TypeScript signature, one sentence, error contract
## 3 · Files                       each file, its responsibility, rough size; the fewest that hold
## 4 · Data structures             types with their invariants, stated as sentences a test can check
## 5 · Algorithms                  numbered steps; exact SQL; complexity where it matters; what is measured
## 6 · Refusals and errors         every code raised, when, and the `fix` sentence a person reads
## 7 · Performance budget           the numbers: sizes, latencies, limits; how each is measured
## 8 · Security                    trust boundaries crossed, what is validated where, what never travels
## 9 · Tests and gates             the exact case list — unit, property, conformance, fixtures, CI rows
## 10 · Deliberate ceilings         the `ponytail:` list: what was cut, and the condition that adds it back
## 11 · Dependencies               runtime (should be none) and dev, with versions
## 12 · Build order                what must exist before this, what this unblocks
## 13 · Decisions taken here        choices the design documents did not make, each with its amendment
## 14 · Done when                   the checklist that closes the spec's implementation
```

Voice: short declarative sentences; counted lists ("Nine, counted."); exact numbers in tables; the "an
earlier draft said X" note whenever a number is corrected. Code blocks hold signatures, SQL, file trees and
wire shapes — never prose.

## 4 · The specifications

| # | Spec | Derives from | Position |
|---|---|---|---|
| 36 | `packages/render` — the dialect parser, the sixteen kinds, `toHTML` | 05 §1–§7 · 34 §2 · 13 §2.3 | stage 0, first, alone, MIT |
| 37 | `packages/ports` — `Sql` and the eight other ports, the `node:sqlite` adapter, the conformance corpus | 33 §1, §3 · 30 §13 | second; the first of the three artefacts of 30 §14 |
| 38 | `packages/where` — the predicate tree, JCS print, validate, compile, the reference evaluator, the property test | 34 §1, §3, §5 · 02 §6 · 30 §7 | third; the second artefact of 30 §14 |
| 39 | `packages/theme` — DTCG wire format, the YAML dialect, the contrast-driven generator, the sixteen checks | 28 · 13 §2 · 22 §7 | fourth |
| 40 | `packages/fixtures` — the eight reference pages, row corpora, the pack corpus, the seed manifest | 22 §10 · 31 §2 · 33 §8 | fifth; text only |
| 41 | `packages/kernel` — migrations for the twenty-seven tables and the header tables, the write path, counters, events, `entry_fts`, refusals | 30 §1–§4, §6, §11 · 02 · 34 §3–§5 | sixth; the record's core |
| 42 | `packages/declare` — the eight declaration kinds' schemas, YAML → JSON, lint, the install plan and diff | 04 · 06 §1.1 · 07 §6 · 08 §2 · 09 §4 · 25 §3 · 34 §6 | seventh |
| 43 | `packages/extract` — the ten extractors and three combinators, the money and date parsers | 07 §3–§4 · 25 | eighth; phase B |
| 44 | `packages/mcp` — the sixteen tools, resources, `instructions`, one JSON-RPC core over stdio and streamable HTTP, budgets | 10 · 33 §2, §4 | ninth |
| 45 | `packages/record` — the RPC surface in six groups, `CallContext`, `Result`, pagination, projection, the outbox and schedule protocols | 30 §5, §8–§10 · 33 §2 · 09 | tenth |
| 46 | `packages/spark` — tier A jobs, the projection reader, proposals, the tier-C dispatcher | 11 · 23 · 26 · 33 §11 | eleventh |
| 47 | `packages/connect` — `ingest` with `fetch:`, placeholders, formats, `expect:`, `probe:`, `metric_point` | 25 · 08 §3 | twelfth |
| 48 | `apps/cli` — `braindog` | 33 §5 · 03 · 04 §4 | after `record` |
| 49 | `apps/selfhost` — one Node process, the Directory file, the HTTP surface | 33 §4, §6, §10 · 12 §3 | after `cli` |
| 50 | `apps/web` — the SvelteKit shell, the eight primitives, the palette, registers, pages, the keyboard model | 22 · 19 · 13 · 06 · 29 · 23 | after `selfhost` |
| 51 | `apps/worker` — the three Durable Object classes, the DO `Sql` adapter, WebSocket, queue, R2, `wrangler.jsonc` | 33 §7 · 01 · 30 §13 · 26 §2 | phase 5 |
| 52 | Testing and CI — the test pyramid, the fixtures corpus, every gate as a script or spec, the workflows, publishing | 18 §6 · 33 §3, §8 · 31 §6 | cross-cutting |
| 53 | Operations — deploy, backup and restore, key rotation, erasure requests, incident response, the version tuple | 03 · 12 · 33 §9 · 30 §11 | cross-cutting |

Eighteen specifications, counted.

## 5 · The revision loop

Specifications are written and revised in rounds until two consecutive audits find nothing.

1. **Draft** — one spec at a time, from its design documents and this template, never from the predecessor.
2. **Audit** — three lenses over every spec: *derivation* (does every statement trace to a design document, or to a
   recorded decision?), *interface agreement* (does every cross-spec call name a symbol the other spec exports, with
   the same signature?), *buildability* (could a builder type this without a question — and is anything here
   more than the problem needs?).
3. **Revise** — every finding applied; every decision taken written into §13 and the design document amended.
4. **Exit** — an audit round with zero findings, twice in a row. Until then the loop continues.

The loop's log is [BUILD.md](../BUILD.md): iteration number, what changed, what the audit found.

---

*Next: [36-SPEC-RENDER](36-SPEC-RENDER.md).*
