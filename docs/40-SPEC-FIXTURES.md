# 40 · `packages/fixtures` — specification

The text corpus every gate reads: eight reference pages, their row corpora, a pack corpus, one refusal
fixture per code the source names, and one seed manifest. Text only — the `.brain` is never committed; it is materialised at test time through
the real write path with an injected `Clock` and a seeded RNG ([22-FRONTEND](22-FRONTEND.md) §10,
[33-CONTRACTS](33-CONTRACTS.md) §9, [30-BLUEPRINT](30-BLUEPRINT.md) §12 row 3). Fifth in the build order, dependent
on nothing, a devDependency everywhere ([31-STACK](31-STACK.md) §2).

> **Clean room.** No fixture is a copy of the predecessor's data. Every name, amount, date and phrase is synthetic
> by construction (§5.4) and a hygiene test proves the negative it can prove (§8). A fixture that *looks* like
> somebody's record is a defect, not a convenience.

---

## 1 · Purpose and boundary

| | |
|---|---|
| **Does** | holds text fixtures and exposes their paths; parses JSON with `JSON.parse`; nothing else |
| **Refuses** | to hold a `.brain`, `.brainl` or `.sqlite` (the root `.gitignore` already refuses them); to parse YAML (that is `declare`'s); to validate a row (that is the write path's, at materialisation); to ship in any bundle |
| **Imports** | nothing. `node:fs` and `node:path` only |
| **Imported by** | `kernel` and everything above it, as a devDependency. `render`, `ports`, `where` and `theme` sit below it in the total order and keep their own in-package corpora ([31-STACK](31-STACK.md) §2, §4 row 8) |

The materialiser — the code that turns the seed into a live record — is **not** in this package. It lives in
`packages/kernel/test/` because it needs the write path (§5.3). This package is the data it reads.

---

## 2 · Public API

```ts
// packages/fixtures/src/index.ts — paths and loaders. No logic beyond reading files.

export const ROOT: string;                       // absolute path of the package directory

export type PageId =
  | 'empty' | 'twelve' | 'five-hundred' | 'five-thousand'
  | 'currencies' | 'writeup' | 'third-party-kind' | 'unknown-primitive';   // 22 §10's order

export type Page = {
  id: PageId;
  record: string;                                // a key of SEED.records
  pack: string;                                  // absolute path of the pack YAML that declares the page
  rows: Record<string, string>;                  // register id → absolute path of its rows JSON
  open: { page: string } | { register: string } | { row: string };   // page id · register id · `register#seq`
  expect: { blocks: number; rows: number; cap: number | null; degraded: number; empty: string[] };
};

export type Seed = {
  format: 1; primitives: 1;
  clock: { start: string; step_ms: number; render_at: string };
  rng:   { alg: 'sfc32'; state: [number, number, number, number]; discard: number };
  owner: { name: string; email: string };
  kek_id: string;
  records: Record<string, SeedRecord>;
};
export type SeedRecord = {
  slug: string; name: string; tz: string;
  packs: string[];                               // ids from PACKS, dependencies first
  raw?: true;                                    // insert declarations directly — §4.3 page 8
  rows: Record<string, { file: string; take?: number }>;   // register id → rows file, head-sliced
  grants?: { label: string; opens: string; kind: string }[];
};

export type Row = Record<string, unknown>;       // field id → canonical JSON of 34 §3; `ref` as `register#seq`

export const PAGES: readonly Page[];             // eight, from pages/*.json
export const PACKS: Readonly<Record<string, string>>;      // pack id → absolute path, from packs/*.pack.yaml
export const REFUSALS: Readonly<Record<string, string>>;   // kebab name → absolute path, from refusals/*.yaml
export const SEED: Seed;                         // seed.json, parsed once at import

export function rows(name: string): Row[];       // JSON.parse(rows/<name>.json); resolves { "$file": "<name>" }
export function text(path: string): string;      // readFileSync(path, 'utf8') — for YAML, which callers parse
```

| Symbol | One sentence | Errors |
|---|---|---|
| `PAGES` `PACKS` `REFUSALS` | built by `readdirSync` at import, so a file on disk **is** the list — nothing is enumerated twice | a malformed `pages/*.json` throws `SyntaxError` at import |
| `SEED` | the manifest of §4.1 | `SyntaxError` at import |
| `rows(name)` | one array per file, one row per line on disk; a value `{ "$file": "x" }` is replaced by the text of `rows/x` — the one indirection, used for the write-up | `ENOENT` unchanged |
| `text(path)` | the bytes as a string | `ENOENT` unchanged |

There is no refusal code in this package. A fixture that is missing or malformed is a build error, and Node's own
error is the message.

---

## 3 · Files

```
packages/fixtures/
├── package.json                 @braindog/fixtures · private · "type": "module" · exports { ".": "./src/index.ts" } · no dependencies
├── src/index.ts                 ~70 lines — §2
├── test/fixtures.test.ts        ~90 lines — the cases of §9 that need no other package
├── seed.json                    §4.1 — nine records
├── pages/                       8 files, <id>.json — §4.3
├── packs/                       8 files, <id>.pack.yaml — §4.4
├── rows/                        9 corpora + the generator — §4.2, §5.1
│   ├── gen.mjs                  ~120 lines, zero dependencies, run once, output committed
│   ├── people-20.json           generated
│   ├── obligations-5000.json    generated — the 500-row page reads its head
│   ├── obligations-fx-60.json   generated — five currencies
│   ├── fx-4.json  tasks-12.json  tracks-2.json  entities-3.json  plan_steps-6.json    hand-written
│   └── writeup.md               the long write-up, LF — §4.3 page 6
└── refusals/                    one file per code the source names, <kebab-code>.yaml — §6
```

| Directory | Files | Rows or declarations |
|---|---|---|
| `pages/` | 8 | — |
| `packs/` | 8 | 21 registers · 7 pages · 2 blocks · 7 metrics · 2 rules · 1 digest · 1 ingest |
| `rows/` | 9 + `gen.mjs` | 5,107 rows |
| `refusals/` | one per code the source names | [30-BLUEPRINT](30-BLUEPRINT.md) §6; the live count is printed by `refusal-fixtures` |
| root | `seed.json` | 9 records |

Two files are code (`index.ts`, `gen.mjs`); everything else is data.

---

## 4 · Data structures

### 4.1 · `seed.json`

```json
{
  "format": 1, "primitives": 1,
  "clock":  { "start": "2031-01-05T09:00:00.000Z", "step_ms": 1000, "render_at": "2031-01-05T12:00:00.000Z" },
  "rng":    { "alg": "sfc32", "state": [1, 2, 3, 4], "discard": 15 },
  "owner":  { "name": "Fixture Owner", "email": "owner@fixtures.example" },
  "kek_id": "00000000000000f1c7",
  "records": {
    "empty":             { "slug": "empty", "name": "Empty", "tz": "UTC", "packs": ["estate"], "rows": {} },
    "five-hundred":      { "slug": "five-hundred", "name": "Five hundred", "tz": "Africa/Cairo", "packs": ["people", "money-core"],
                           "rows": { "people": { "file": "people-20.json" }, "fx": { "file": "fx-4.json" },
                                     "obligations": { "file": "obligations-5000.json", "take": 500 } } },
    "unknown-primitive": { "slug": "core", "name": "Core", "tz": "UTC", "packs": ["reactor-core"], "raw": true, "rows": {} },
    "corpus":            { "slug": "corpus", "name": "Corpus", "tz": "UTC",
                           "packs": ["people", "agents", "work", "portfolio", "money-core", "estate"], "rows": {},
                           "grants": [ { "label": "Fixture registry token", "opens": "registry.example", "kind": "api_token" },
                                       { "label": "Fixture deploy key",     "opens": "deploy.example",   "kind": "ssh_key" } ] }
  }
}
```

The other five records follow the same shape; §4.3 names each one's packs and rows (`third-party-kind` takes 6
people and 40 obligations from the shared files; `writeup` loads `plan_steps-6` then `entities-3`). Invariants, each
a test in §9:

| Invariant | Sentence |
|---|---|
| Clock | every write in a record happens at `start + i × step_ms`, `i` counting rows written; the page is rendered at `render_at`, which is after the last write of the largest record (5,024 rows → 10:23:44 Z) |
| RNG | every random byte the kernel draws during materialisation comes from `sfc32` seeded with `state`, after `discard` outputs are thrown away (§5.2) |
| ULID | time from the Clock, randomness from the RNG — so two materialisations mint identical ids, and **no ULID appears in any fixture file** |
| Records | one record per reference page, plus `corpus`, which installs every first-party-shaped pack and nothing else — the record the whole-corpus gates run over (§9) |
| `packs` | listed dependencies-first; `installPack` in that order never sees `DEPENDENCY_UNRESOLVED` |
| `take` | the first *n* rows of the file, in file order; `seq` therefore equals the row's 1-based line number in every record |
| `owner` | the one person; `p_` + a ULID minted first, before any pack install; the principal of every write |
| `kek_id` | a synthetic wrapping-key fingerprint; the two grants' `ciphertext` and `nonce` are RNG bytes (§10) |

### 4.2 · A row corpus

`rows/<name>.json` is a JSON array; **one row per line**, no indentation inside a row, LF, trailing newline. A
row is `{ <field id>: <value> }` in the canonical JSON of [34-GRAMMARS](34-GRAMMARS.md) §3 — `money` as
`{ "amount": 1250000, "currency": "EGP" }`, `quantity` as `{ "value": 3.5, "unit": "h" }`, `day` as
`"2031-03-14"`, `instant` with `Z` and milliseconds, `list<text>` as an array — with two corpus conventions:

| Convention | Rule |
|---|---|
| `ref` | written as the **qualified spoken id** `people#7` ([34-GRAMMARS](34-GRAMMARS.md) §4), never a ULID; the materialiser resolves it to the minted id, which works because refs point only at rows written earlier (a file, or a register listed earlier in `rows`) |
| `document` | `{ "$file": "writeup.md" }` — the loader inlines the file's text (§2). The only `$`-key |
| absent | a missing field is absent, never `null` — the write path stores no `null` (34 §3) |
| never present | `secret` (a grant id the fixture cannot know), `file` (no blob store — §10), `id` `seq` `created_at` and every kernel field |

```
rows/obligations-5000.json — one line:
{"what":"Kiln service lot 217","to":"people#14","amount":{"amount":4187300,"currency":"EGP"},"due":"2031-02-19","state":"open","tags":["tooling"]}
```

### 4.3 · The eight reference pages

`pages/<id>.json` carries the `Page` of §2 minus the resolved paths. The eight, counted, in 22 §10's order:

| # | `id` | Record · pack | `open` | Rows | Blocks | Cap | Degraded | What it is for |
|---|---|---|---|---|---|---|---|---|
| 1 | `empty` | `empty` · estate | `page: domains` | 0 | 2 | — | 0 | `empty:` appears **iff** zero rows; a `sum` over nothing renders `—`, never `0` ([06-PAGES](06-PAGES.md) §1) |
| 2 | `twelve` | `twelve` · work | `page: tasks` | 12 | 2 | — | 0 | refs across a `via:` rule, enum tone, `tone_when: { before: today }`, `list<text>` tags; the small-table keyboard gates |
| 3 | `five-hundred` | `five-hundred` · money-core + people | `page: money` | 500 | 6 | — | 0 | the 300–2,000 band of [22-FRONTEND](22-FRONTEND.md) §4; the *6-block / 500-row* SSR question of 22 §12 |
| 4 | `five-thousand` | `five-thousand` · money-core + people | `register: obligations` | 5,000 | 1 | 2,000 | 0 | the DOM-build wall: `aria-rowcount` = 5,000, DOM rows = 2,000, the *showing 2,000 of 5,000* line (22 §4). Not a page block — a block's `limit` caps at 500 ([02-DATA-MODEL](02-DATA-MODEL.md) §5) |
| 5 | `currencies` | `currencies` · money-core + people | `page: money` | 60 | 6 | — | 0 | five currencies with exponents 2·2·2·0·3; a metric scoped to one currency excludes 48 rows; an fx total wears `≥` with `noRate: [KWD]` ([08-METRICS](08-METRICS-AND-ANALYTICS.md) §2.5) |
| 6 | `writeup` | `writeup` · portfolio | `row: entities#1` | 3 | 22 fences | — | **1** | the dialect end to end: 21 well-formed fences over 15 kinds, one over-arity `gauge` that degrades to its fence ([05-BLOCKS](05-BLOCKS-AND-THEMES.md) §3) |
| 7 | `third-party-kind` | `third-party-kind` · burn-rate | `page: runway` | 40 | 1 | — | 0 | a `block` kind the bundle never saw, drawn by the primitive interpreter: 41 `role="row"`, `data-kind="burnRate"` (22 §3) |
| 8 | `unknown-primitive` | `unknown-primitive` · reactor-core | `page: core` | 0 | 2 | — | **1** | a primitive outside the eight degrades to one line — *needs a newer client* (22 §3); the record was written by a newer build, so the pack is installed **raw** (§5.3) |

Two are designed to degrade — 6 and 8 — and each degrades **exactly one** block. Every other page renders with
`degraded: 0`, and the Playwright gates assert the count, not the absence.

**Page 3's six blocks**, on `page.money`: `stat` (three cells: `due-30d` · `owed-egp` · `owed-count`) · `gauge`
(`due-30d` against its target) · `bar` (`owed-by-state`, a `group_by: state` metric) · `table` (`register.obligations`,
`limit: 500`, `order: due asc`, four columns) · `table` (`register.installments`, zero rows — its `empty:` renders on
the same screen as a full table) · `note` (`when: { metric: due-30d, gt: 0 }`). Pages 4 and 5 reuse the same
declaration on their own records.

**Page 6's write-up** (`rows/writeup.md`, ~220 lines, ~9 KB) follows the skeleton of 05 §7.6 — a `chips` line
first, `# Name`, a status line, numbered sections each opening with a block, `## Log` last. Fences by kind: `spec` 3 ·
`note` 3 (bad · warn · info) · `stat` 2 · `bar` 2 (one row toned `hole`) · `chips` `steps` `timeline` `todo` `gauge`
`quote` `code` `tree` `comparison` `params` `board` 1 each · plus one `gauge` with five cells (`DIALECT_ARITY`).
Fifteen kinds; `table` is page-only and absent. Inline, at least once each: the eight typed forms
`{{money:cost}}` `{{until:renews}}` `{{ago:started}}` `{{ref:plan_steps#1}}` `{{pct:-12.5}}` `{{day:2031-04-01}}`
`{{date:2031-04-01}}` `{{quantity:3.5 h}}`; the paths `{{name}}` `{{plan_steps.count}}` `{{plan_steps.done}}`; one
unresolved path `{{nothing.here}}` (renders as the path, marked — not a degraded block); the four evidence tags; a
code span holding a literal `{verified}`; one `\|` inside a `spec` cell ([34-GRAMMARS](34-GRAMMARS.md) §2).

### 4.4 · The pack corpus

Eight packs. Six mirror the **shapes** of the first-party packs — the register ids of [32-PARITY](32-PARITY.md)
§5 with invented fields and invented seeds — and two are invented outright. Every manifest carries the required keys
of [04-PACKS](04-PACKS.md) §2 (`pack` `version` `summary` `author: fixtures` `license: MIT` `declarations`), a
`requires`, and a written-out `provides` equal to the derived list.

| Pack | Registers | Also declares | Seeds (`example`) | `requires` |
|---|---|---|---|---|
| `agents` | `learnings` (`LN`) · `skills` · `credentials` | — | 1 learning · 1 skill | format 1 · primitives 1 |
| `work` | `tasks` · `tracks` · `dates` | `page.tasks` · `rule.parent-closed` (the `via:` rule of 32 §5) · `metric.open-tasks` | 1 task | format 1 · primitives 1 |
| `portfolio` | `entities` · `plan_steps` | `page.portfolio` | 1 entity | format 1 · primitives 1 |
| `money-core` | `accounts` `obligations` `installments` `fx` `income` `recurring` `assets` `snapshots` `company` `transactions` | `page.money` · `metric.due-30d` `owed-egp` `owed-count` `owed-by-state` `fx-total-usd` · `rule.due-soon` · `digest.money-weekly` · `ingest.paste-statement` (channel `paste`) | 1 account · 1 obligation | packs `people: "^1"` |
| `estate` | `services` · `domains` | `page.domains` · `page.services` · `metric.renewals-30d` | 1 service | format 1 · primitives 1 |
| `people` | `people` | — | 1 person | format 1 · primitives 1 |
| `burn-rate` | — | `block.burnRate` · `page.runway` | — | packs `money-core: "^1"` |
| `reactor-core` | — | `block.reactorCore` (`primitive: lattice`) · `page.core` | — | **primitives 2** |

Seven of the eight kinds appear (`theme` does not: `packages/theme` sits below this package and keeps its own
corpus). Every value type but `file` is declared at least once — `secret` on `credentials` (declared, never
valued), `email` and `url` under `.example` hosts (§8), `quantity` on `plan_steps.effort`, `duration` on
`tasks.estimate`, `decimal` on `fx.rate`, `json` on `company.meta`, `instant` on `tasks.started`, `bool` on
`services.auto_renew`. Register options exercised: `series: true` with `key:` (`snapshots`); `transitions:` with
`by: decide` and `requires:`, `immutable_when:`, `seq_prefix` and `derive: { normalise }` with `unique: true`
(`learnings`); `derive: { via }` and `required_when:` (`tasks`); `pairs:` (`transactions`); `predicates:`
(`obligations`); `delete: refuse_while_referenced` (`accounts`).

The two invented blocks, in full:

```yaml
# packs/burn-rate.pack.yaml — the shape of 22-FRONTEND §3, one input
- block: burnRate
  primitive: panel
  accepts: { source: register }
  body:
    - primitive: grid
      cells: 2
      children:
        - primitive: table
          rows: $source
          empty: "Nothing owed."
          columns:
            - { field: seq,    label: "#",   width: 6ch, align: end }
            - { field: to,     label: To,    width: "minmax(0,1fr)", link: true }
            - { field: amount, label: Owed,  width: 14ch, align: end }
        - primitive: rows
          rows: [ { label: Open rows, value: "{{obligations.open}}" } ]

# packs/reactor-core.pack.yaml — one primitive outside the eight; requires: { format: 1, primitives: 2 }
- block: reactorCore
  primitive: lattice
  accepts: { source: register }
  body: []
```

---

## 5 · Algorithms

### 5.1 · The generator — `rows/gen.mjs`

Committed JSON for anything a person can read in one sitting (≤ 60 rows, hand-written); a generator for the
three corpora nobody should type. It is **run once and its output committed**; a test re-runs it with `--check` and
fails if the bytes differ, so the generator can never drift from what the gates actually saw.

1. Seed `sfc32` with `SEED.rng.state`, discard `SEED.rng.discard` outputs (§5.2). One stream, in this order, so
   adding a corpus later never disturbs an earlier one.
2. `people-20.json` — 20 rows. `name` is `<Given> <Family>`: each is two syllables drawn from an onset table
   (`b d f g h k l m n p r s t v z`) and a rime table (`ar el in or us ette a ov`), title-cased; `email` is
   `<given>.<family>@people.example`; `kind` alternates `person` · `company`.
3. `obligations-5000.json` — 5,000 rows, EGP only. `what` is `<Noun> <noun> lot <n>` from a 24-word invented
   trade vocabulary (`kiln` `loom` `bobbin` `crate` …); `to` is `people#<1–20>`; `amount` uniform in
   `[10_000, 9_999_900]` minor units; `due` uniform over the 365 days centred on `clock.render_at`'s day, so
   `before: today` splits the file near half; `state` weighted `open` 60 · `part` 15 · `paid` 20 · `void` 5;
   `tags` zero to two of five words.
4. `obligations-fx-60.json` — 60 rows, 12 per currency in the cycle `EGP USD EUR JPY KWD`; amounts per exponent:
   `[10_000, 999_900]` for exponent 2, `[100, 999_999]` for JPY, `[1, 999_999]` for KWD.
5. Write each file as `[` + one `JSON.stringify(row)` per line + `]`, LF, trailing newline. `--check` writes to
   memory and compares bytes.

Runs in under a second. Complexity is linear; nothing here is measured beyond §7.

### 5.2 · `sfc32`, and the ULID rule

```js
// the RNG the seed names — 4 × u32 state, from PractRand's sfc32; the kernel's test double implements it verbatim
function sfc32(a, b, c, d) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = ((c << 21) | (c >>> 11)) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
}
```

| Step | Rule |
|---|---|
| Random bytes | `random(n)`: draw `ceil(n / 4)` outputs, write each big-endian, return the first `n` bytes |
| ULID | 6 bytes = `Clock.now()` in ms, big-endian; 10 bytes = `random(10)`; Crockford base32 → 26 chars. Production mints the same shape from `crypto.getRandomValues`; only the byte source differs |
| Within one write | every ULID the write mints (entry, event, batch) shares the millisecond and differs in its random part; the kernel orders events by `rowid`, never by id |
| Grants | `ciphertext = random(48)`, `nonce = random(12)` — opaque to every fixture consumer |

### 5.3 · Materialising a record — `packages/kernel/test/materialise.ts`

The sequence 41 implements against its own exports; the interface-agreement audit reconciles the names.

1. `open(':memory:')` through the `node:sqlite` adapter of `packages/ports`; `clock = fixedClock(seed.clock.start)`;
   `rng = sfc32(...seed.rng.state)` with `discard` outputs thrown away; both injected into the kernel.
2. Apply every migration in `packages/kernel/migrations/` — the twenty-seven tables and the four header tables.
3. Mint the owner (`p_` + ULID), write `person`, then the `record` row (`slug` `name` `tz`, `format_ver = 1`) and
   `member('*', 'owner')`.
4. For each pack in `packs`, in order: read the YAML with `declare`, `plan` against the live record, `install` with
   the plan hash; the installer writes the seeds, marked `example`. If `raw: true`, skip lint and plan and insert
   the `pack` row and one `declaration` row per declaration directly — the state a record written by a newer build
   would be in.
5. For each register in `rows`, in order; for each row in file order, head-sliced by `take`: replace every
   `register#seq` with the id minted for that row; `write(register, undefined, fields, ctx)` with the owner as
   principal, surface `cli`; `clock.advance(step_ms)`. A refusal here is a **test failure** — the corpus is wrong,
   not the kernel.
6. For each grant: insert the sealed row with RNG bytes, the seed's `kek_id`, `wrapped_by: kek`; one `grant.add`
   event.
7. `clock.set(seed.clock.render_at)`; return `{ sql, clock, ids }`. A test that needs a file calls `VACUUM INTO`
   on a temp path the root `.gitignore` excludes; one that needs the manifest calls `export()` and reads
   `dog_manifest`.

Nothing here reads wall-clock time or `Math.random`; §9's two-run test proves it.

### 5.4 · The invented-data rule

| Rule | Mechanically |
|---|---|
| Names are generated, never listed | §5.1 step 2; hand-written corpora use the same tables by hand (`Torel Vinus`, `Basor Kette`) |
| Hosts end in `.example` | RFC 6761's reserved TLD: `people.example`, `registry.example`; no `https://` host anywhere else |
| Dates live in 2030–2031 | a year the predecessor's record cannot contain; the fixed clock makes every relative literal stable |
| Amounts are bounded | `< 10^7` minor units per row, so no digit run reaches thirteen |
| Vocabulary is a trade nobody in the corpus runs | a pottery-and-textile supply house: kilns, looms, bobbins, crates |
| No ULID, no hash, no key in any file | ids are minted, checksums computed, grants sealed at materialisation |

---

## 6 · Refusals and errors

The package raises none. It **carries** the seventy-five fixtures of [30-BLUEPRINT](30-BLUEPRINT.md) §6 — one file
per code, named by that table's *Fixture* column — and this section fixes their shape.

**Rule one: a fixture that fails `declare` lint is a test failure, not a fixture.** Every pack in `packs/`, every
`pack:` inside a `lint`/`install` refusal fixture, and every inline declaration lints clean — except where the
fixture *is* the lint failure, in which case the file names the code and the test asserts that code and no other.
The one pack this applies to is `reactor-core`, whose `expect.lint` is `PRIMITIVES_OUT_OF_RANGE` at
`requires.primitives` (found `2`, wanted `≤ 1`).

**Rule two: every refusal fixture names its `code` and its exact `at`**, and the runner asserts the refusal list is
exactly one long. Common keys:

```yaml
code: FIELD_TYPE_UNKNOWN          # UPPER_SNAKE; kebab-case of it is the file name
via:  lint                        # one of seven — the surface that raises it
at:   declarations[0].fields[1].type   # the path 30 §6's Refusal carries, relative to the fixture's input
found: currency                   # optional; asserted when present
```

| `via` | Codes | Input keys | `at` is a path into | Runner |
|---|---|---|---|---|
| `lint` | 27 | `pack:` — a whole manifest | the manifest | `declare/test` — the pack alone, offline |
| `install` | 20 | `pack:` · `installed:` (active declaration bodies) · `facts:` (`rows`, `distinct` values per field, `format`, `primitives` — the numbers the code's message cites) | the manifest | `record/test`, composing `declare`'s plan and `theme`'s checks exactly as `planPack` does |
| `where` | 7 | `register:` · `subject:` (`entry` \| `inbox_raw`) · `predicate:` | the predicate | `record/test` via `where/sql` |
| `write` | 15 | `declare:` (one register) · `rows:` (prior rows, owner-written) · `write:` (`register` `seq?` `patch` `version?`) · `principal:` | `<id>` · `<id>[<i>]` · `version` · `register` · `state` | `record/test` via the kernel's `write` on a fresh materialised record |
| `rpc` | 37 | `record:` (a seed record) · `call:` (`method` `args`) or `calls:` (a sequence, for `PLAN_STALE`) · `principal:` | `principal` · `<k>` · `authorization` | `record/test` |
| `import` | 7 | `record:` · `tamper:` — `sig` · `row` · `format` · `not-empty` · `migration-text` · `migration-ahead`, one per code | `dog_sig.sig` · `dog_manifest.<table>` · `dog_meta.format` · `record` · `migration[<n>]` | `record/test` — export the record, apply the verb, import |
| `render` | 2 | `document:` | `blocks[<i>].rows[<j>]` · `blocks[<i>].kind` | `apps/web/test`, through `braindog-render` |

The `at` column was wrong for the `write` and `rpc` rows until 2026-09-20, and it did damage. It said
`fields.<id>` and `args.<k>` and `headers.authorization`; the kernel emits the bare field id, with `[i]`
appended for a position in a list, and the rpc path emits the bare argument name. Twelve fixtures were
written to this column and carried a prefix no refusal has ever contained. Nothing caught them, because
`refusal-fixtures.mjs` owns the enumeration and not the behaviour, and the `via: write` runner that would
have driven them does not exist yet. A specification that nothing executes is a specification that can be
wrong for months, which is the argument for building the runners in §6 rather than for writing this
paragraph.

**Specified, and not built: the "Input keys" column.** No fixture in the corpus carries a body. All 115 are the same
five lines, and `pack:`, `installed:`, `facts:`, `rows:`, `write:`, `call:`, `tamper:` and `document:` describe input
nothing has ever held. The column is the right design and it is what a runner would read, so it stays; it is marked
here rather than quietly deleted, the same way `52 §5.1` is. Until a runner exists, a fixture is an enumeration entry
with a sentence attached, and `refusal-fixtures.mjs` says so about itself: it owns the enumeration and not the
behaviour.

**`at` is optional.** `41 §6` always said so, the gate required it anyway, and nine fixtures invented an address
because the format left no way to say there is none. Three of those nine are now blank, which is the true answer for
a refusal about several tables at once, for one that carries `allowed:` instead, and for one derived from a conflict
envelope that has no slot for an address at all.

115, counted: 27 + 20 + 7 + 15 + 37 + 7 + 2, against a registry of 126. The eleven without a fixture are the eleven
no line of source names, which is the rule `refusal-fixtures` enforces and prints on every run. Do not hand-copy
these numbers anywhere: the figures in this section were 75 against 112 for months after both had moved, and twelve
fixtures were written wrong from the column beside them. The `lint`/`install` split follows each code's own message:
a code that cites rows, installed packs or the record's versions needs a record and is `install`
(`REQUIRED_ON_POPULATED` `ID_RENAMED` `DEPENDENCY_UNRESOLVED` `FORMAT_OUT_OF_RANGE` `FIELD_TYPE_CHANGED`
`SEQ_PREFIX_TAKEN` `MIXED_CURRENCY` `GROUP_BY_CARDINALITY` `QUANTITY_MIXED_UNIT` `CONTRAST_FLOOR`); the other
twenty-two of 04 §5's thirty-three lint offline; `PLAN_STALE` is `rpc`. Two examples:

```yaml
# refusals/row-locked.yaml
code: ROW_LOCKED
via: write
at: fields.lesson
declare:
  register: learnings
  name: Learnings
  fields:
    - { id: lesson, type: text, required: true }
    - { id: state,  type: enum, values: [proposed, active, reverted], default: proposed }
  immutable_when: { field: state, in: [reverted] }
rows:
  - { lesson: "A lesson invented for this fixture, long enough to pass min.", state: reverted }
write: { register: learnings, seq: 1, patch: { lesson: "changed" }, version: 1 }
principal: { kind: person, level: owner }
```

```yaml
# refusals/checksum-mismatch.yaml
code: CHECKSUM_MISMATCH
via: import
at: dog_manifest.entry
record: twelve
tamper: row            # append one byte to the first `entry` line of the exported .brainl; the signature still verifies the manifest
```

---

## 7 · Performance budget

| Number | Budget | Expected | Measured by |
|---|---|---|---|
| Corpus on disk, committed | **< 5 MB** | ≈ 0.8 MB — `obligations-5000.json` ≈ 0.65 MB, everything else < 0.15 MB | `test/fixtures.test.ts` sums `statSync().size` over the package |
| `import '@braindog/fixtures'` | ≤ 50 ms | ≈ 10 ms — three `readdirSync`, nine small `JSON.parse` | `performance.now()` around a dynamic import, in the package test |
| `rows('obligations-5000')` | ≤ 20 ms | ≈ 5 ms | same |
| `gen.mjs` | ≤ 1 s | ≈ 0.2 s | `--check` in the package test |
| Materialise `five-thousand` | ≤ 10 s | 5,024 writes × ~10 statements at `:memory:` | `kernel/test`, one `performance.now()` per record, printed |
| Materialise any other record | ≤ 1 s | ≤ 524 writes | same |
| Render page 4 | see 22 §4 | 2,000 DOM rows ≈ 54 ms desktop · ≈ 334 ms at 4× throttle (27 / 167 µs per row); `aria-rowcount` 5,000 | the Playwright gates, on LoAF `blockingDuration` |
| Render page 3 | see 22 §4 | 500 rows, grid + chunked CV: **14 ms** desktop · **89 ms** throttled — the measured row | same |

The 5,000-row page exists to stand on the wall 22 §4 measured, not to beat it: a register view renders
`min(rows, 2,000)` and says so.

---

## 8 · Security

Fixtures are trusted inputs that cross one boundary: they are rendered by the same escape path as a stranger's
pack, so a fixture is also the cheapest place to prove that path. Five rules, and the check for each:

| Rule | Check | Where |
|---|---|---|
| No real address | every `@` is followed by a host ending `.example` — `/@(?![\w.-]*\.example\b)[\w.-]+/` matches nothing | `test/fixtures.test.ts`, over every file in the package |
| No real domain | every `https://` host ends `.example`; no `http://` at all | same |
| No card-like number | `/\b(?:\d[ -]?){13,19}\b/` matches nothing — amounts stay under seven digits and no ULID is on disk | same |
| No credential | no run of 32+ hex or base64url characters; `secret` fields are never valued; grant material is RNG bytes minted at test time; the one bearer in `refusals/unauthorized.yaml` is the literal `tok_fixture_invalid` | same, plus the `secret-grep` gate ([33-CONTRACTS](33-CONTRACTS.md) §8) |
| No predecessor | the clean-room tripwire `tools/gates/clean-room.mjs` runs over `packages/fixtures/**` | `gates.yml` |

And the property the package cannot test but the layout enforces: the corpus never ships. It is a devDependency
everywhere, and the `licence-closure` gate asserts neither published tarball contains `@braindog/` anything
([31-STACK](31-STACK.md) §4 row 8).

---

## 9 · Tests and gates

**In this package** — `test/fixtures.test.ts`, `node --test`, no other package imported:

| Case | Input → expected |
|---|---|
| eight pages | `PAGES.map(p => p.id)` → the eight ids of §2, in order |
| paths resolve | every `Page.pack`, every `Page.rows[*]`, every `SEED.records[*].rows[*].file` → `existsSync` true; every `Page.record` → a key of `SEED.records` |
| seventy-five | `Object.keys(REFUSALS).length` → 75; for each file, its `code:` line lower-cased with `_` → `-` → equals its name |
| head slicing | `rows('obligations-5000').length` → 5,000; `SEED.records['five-hundred'].rows.obligations.take` → 500 |
| generator honest | `node rows/gen.mjs --check` → exit 0 |
| size | sum of bytes under the package, excluding `node_modules` → < 5,242,880 |
| LF | no file contains `\r` |
| hygiene | the four regexes of §8 → zero matches |
| one row per line | every `rows/*.json` → line count = rows + 2 |

**In other packages**, each named with its owner:

| Owner | Case | Input → expected |
|---|---|---|
| `declare/test` | packs lint | each of `PACKS` → zero findings, except `reactor-core` → exactly `[PRIMITIVES_OUT_OF_RANGE at requires.primitives]` |
| `declare/test` | provides | each manifest's written `provides` → equals the derived list (else the fixture is wrong, and `PROVIDES_MISMATCH` says so) |
| `kernel/test` | determinism | materialise each seed record twice → `dog_manifest` rows equal, table by table, `rows` and `sha256` |
| `kernel/test` | counts | `five-thousand` → `entry WHERE register='obligations' AND deleted_at IS NULL` = 5,000; `seq` 1…5,000 contiguous |
| `kernel/test` | ULID rule | the first entry id of `twelve` → time part decodes to `clock.start` exactly |
| `kernel/test` | budget | each record within §7's time budget, printed |
| `record/test` | refusals | each `lint` `install` `where` `write` `rpc` `import` fixture → `refusals.length === 1`, `code` and `at` equal the file's |
| `apps/web/test` | dialect refusals | the two `render` fixtures → one degraded fence carrying the named code; nothing thrown |
| `apps/web/test` (Playwright) | the eight pages | each page × 4 widths × 2 schemes × 2 directions → declared blocks appear once in order; DOM rows = `min(rows, cap)`; `aria-rowcount` = rows; `expect.empty` strings appear iff zero rows; degraded blocks = `expect.degraded` (22 §10) |

**Gate rows this corpus feeds** ([33-CONTRACTS](33-CONTRACTS.md) §8): `refusal-fixtures` — the script compares
the `refusals/` file names with the *Fixture* column of 30 §6 by regex, both directions; `brain-roundtrip`,
`mcp-budget`, `spark-actor` and the `grant.*` note grep of [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6 run over the
`corpus` record; the ten Playwright gates run over the eight pages.

---

## 10 · Deliberate ceilings

- `ponytail:` **lookalike packs, not the shipped six.** The six do not exist yet (phase 6). When they ship, `PACKS`
  points at them and the six lookalikes are deleted; the invented two stay.
- `ponytail:` **grant ciphertext is RNG bytes**, not AES-GCM output. Add real sealing when a fixture must be *opened*;
  the vault's own tests (45) seal their own.
- `ponytail:` **no `file` values, no blob store.** Add an attachment fixture when 53's export-with-missing-attachment
  case needs one.
- `ponytail:` **the third-party kind takes one input, `source:`**, because the page grammar's closed key list passes
  nothing else ([06-PAGES](06-PAGES.md) §1.1). Grows when that list gains an input key.
- `ponytail:` **no `entry_vec`, no `near` fixtures** — 34 §1.8 gives `near` its own; they arrive with §1b.
- `ponytail:` **one owner, no members, no shares, no inbox arrivals** — 20's, 43's and 47's tests seed their own.
- `ponytail:` **`take` slices the head only.** A fixture that needs a different subset gets its own file.
- `ponytail:` **no Spark grounding record** (the thirty questions of [11-ASSISTANT](11-ASSISTANT.md) §9) — 46's.

---

## 11 · Dependencies

| Kind | Dependency | Version |
|---|---|---|
| runtime | none | — |
| dev (workspace root) | `typescript` | 6.0.3 |
| dev (workspace root) | `@types/node` | 24.13.0 |
| platform | Node — `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `import.meta.dirname` | 24.13 |

No `fast-check`: there is no property here to test. No YAML library: the package returns YAML as text.

---

## 12 · Build order

| Needs | For |
|---|---|
| nothing | the package itself — it can be the first thing committed after 36 |
| 37 `ports` · 41 `kernel` | the materialiser (§5.3) and the determinism test |
| 42 `declare` | the lint test and the `install` refusals |
| 45 `record` · 50 `web` | the refusal runners and the Playwright gates |

| Unblocks | How |
|---|---|
| 41 `kernel` | a corpus to drive the write path at 5,000 rows on day one |
| 42 `declare` | eight packs that must lint clean, and seventy-five refusal cases |
| 44 `mcp` | the `corpus` record the token budgets are counted on ([10-MCP](10-MCP.md) §4) |
| 50 `web` · 52 testing | the eight pages the 128-configuration gates run over |

---

## 13 · Decisions taken here

| # | Decision | Amends |
|---|---|---|
| D1 | **Committed for ≤ 60 rows, generated for the rest.** Hand-written JSON up to sixty rows; `rows/gen.mjs` with the seed's RNG for the 5,000-row, 60-row-fx and 20-person corpora, run once, output committed, `--check` in CI | 22 §10 — add the sentence; 31 §8 — the `fixtures/` tree line |
| D2 | **The synthetic-data rule** of §5.4: generated names, `.example` hosts, 2030–2031 dates, amounts under 10^7 minor, no ULID or hash on disk, refs as `register#seq` | 22 §10; 12 §8 — one line under *Refusals that do not leak* |
| D3 | **The fixed instant and RNG.** `2031-01-05T09:00:00.000Z`, one second per row, rendered at `12:00:00.000Z`; `sfc32` seeded `[1, 2, 3, 4]`, fifteen outputs discarded; ULID = Clock ms + ten RNG bytes | 33 §3 — the paragraph 30 §12 row 3 cites and that says nothing yet; 30 §12 row 3 |
| D4 | **One record per page, plus `corpus`.** Nine records; the whole-corpus gates name `corpus`; page 4 opens the register view (cap 2,000), not a page block (limit ≤ 500) | 22 §10; 33 §8 — the `mcp-budget`, `brain-roundtrip`, `spark-actor` rows name the record |
| D5 | **The unknown-primitive pack is installed raw** and lints `PRIMITIVES_OUT_OF_RANGE` — the one pack that may not lint clean, by design; no new refusal code | 22 §10 — the *deliberately unknown primitive* item |
| D6 | **The refusal fixture format**: `code` `via` `at` `found?` plus per-`via` inputs; seven `via` values with the 22 · 10 · 10 · 17 · 8 · 6 · 2 split; the `refusal-fixtures` script checks names, the runners check production | 30 §6 — the sentence after *Every fixture lives at…*; 33 §8 — the `refusal-fixtures` row |
| D7 | **`take` and `$file`.** The 500-row page reads the head of the 5,000 file; a `document` value may name a file | 22 §10 |
| D8 | **Hygiene is a package test, not a gate row**: `.example`-only hosts, no card-like digit run, no 32+ character key-shaped run | 18 §6 — one row, noting it runs in `pnpm test` |

---

## 14 · Done when

- [ ] `packages/fixtures` exists with the tree of §3; `pnpm --filter @braindog/fixtures test` is green
- [ ] `PAGES` has eight entries in 22 §10's order; every path resolves
- [ ] `refusals/` holds exactly the seventy-five names of 30 §6's *Fixture* column, each with a matching `code:` line and a `via:` from §6
- [ ] `node rows/gen.mjs --check` exits 0 on Windows and on Linux CI; every file is LF
- [ ] the corpus is under 5 MB; the four hygiene regexes match nothing
- [ ] `declare` lints seven packs clean and `reactor-core` to exactly `PRIMITIVES_OUT_OF_RANGE`
- [ ] `kernel/test` materialises all nine records twice with identical `dog_manifest` rows, each inside its §7 budget
- [ ] the eight pages pass the ten Playwright gates in all 128 configurations, with `degraded` equal to 1 on pages 6 and 8 and 0 elsewhere
- [ ] the eight design-document amendments of §13 are applied in the same revision

---

*Next: [41-SPEC-KERNEL](41-SPEC-KERNEL.md).*
