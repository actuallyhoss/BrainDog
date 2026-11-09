# 42 · `packages/declare` — specification

The seventh package in the build order of [31-STACK](31-STACK.md) §2. It owns the *shape* of everything modular:
the manifest of [04-PACKS](04-PACKS.md) §2, the declaration kinds (eight when this was written; `KINDS` in `packages/kernel/src/declare.ts` keeps them, with `script`, `job` and `look` since), YAML → canonical JSON, the lint of 04 §5,
the install plan and its diff (04 §3), the one-transaction install, and the retire-not-remove uninstall (04 §4).
Derives from 04 · 06 §1.1 · 07 §6 · 08 §2 · 09 §4 · 25 §3 · 34 §4–§6 · 30 §1, §6, §11 · 31 §9.

> **Clean room.** Nothing here is ported. The design documents are the only source ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md)).

---

## 1 · Purpose and boundary

`declare` answers one question — *is this text a pack this record can take, and what exactly would taking it do?* —
and then does exactly that, once, in one transaction.

| It does | It refuses to do |
|---|---|
| turn pack text into canonical JSON (RFC 8785) and back into typed `Pack`/`Declaration` objects | parse YAML anywhere but its own `./yaml` subpath — the record, the Worker and the self-host API receive JSON only ([30-BLUEPRINT](30-BLUEPRINT.md) §7) |
| validate the manifest and every kind of declaration against closed Valibot schemas built at module scope ([31-STACK](31-STACK.md) §9, ADR-040) | evaluate anything: no template, no expression, no regex from pack text ([04-PACKS](04-PACKS.md) §7) |
| run every check of 04 §5 — shape, per-declaration, cross-declaration, and against a record's declaration state | touch SQL — the install transaction is the kernel's (`installDeclarations` / `retireDeclarations`, [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.6); `declare` builds the batch and calls them through a `Host` the record hands it — `braindog pack lint` runs from a file with no record (31 §2: `declare ⇏ kernel`) |
| compute the `Diff` of 04 §3 and its `planHash` | run the sixteen theme checks — `theme` owns them and `record` merges their refusals (31 §2: `declare ⇎ theme`) |
| turn a `Diff` into the kernel's `InstallBatch` — declaration bodies, retirements, the pack row, seeds tagged `example`, the plan's version — so one transaction applies all of it or none; refuse a conflict, an orphaning retire, or a plan the caller did not see | write a row a person could have written — the only rows it causes are seeds tagged `example` |
| retire a pack: `retired = 1`, one `uninstall` event, every row kept | delete anything, ever |

**May import:** `braindog-render` (`KINDS`, `PRIMITIVES`, `PRIMITIVES_VERSION` — the kinds table of 34 §2.4, one
TypeScript table, a recorded deviation), `@braindog/where` (`parse`, `flatten`, `validate`, `INBOX_RAW`, `jcs`), `valibot`.
The `./yaml` subpath alone imports `yaml`. Nothing else — not `ports`, not `kernel`, not `theme`.

---

## 2 · Public API

Two entry points. `@braindog/declare` is pure and database-free except for `install`/`uninstall`, which take a
`Host`; `@braindog/declare/yaml` is the one module in the repository that parses YAML.

```ts
// ─── @braindog/declare ────────────────────────────────────────────────────────────────────
/** JSON (already parsed, untrusted) → a shape-checked Pack. Stage A of §5.2. Never throws. */
export function normalise(doc: unknown, source?: PackSource): Pack | Refusal[];

/** Every check of 04 §5 that needs no record (installed = null) or a record's declaration state. Sync, pure. */
export function lint(pack: Pack, installed: Installed | null): Refusal[];

/** lint(pack, installed), then the diff of 04 §3 against installed. Refusals win over a Diff. */
export function plan(pack: Pack, installed: Installed): Promise<Diff | Refusal[]>;

/** Build the InstallBatch of a fresh Diff and hand it to the kernel (41 §5.6). `approved` is the planHash the caller saw. */
export function install(diff: Diff, host: Host, approved: string): Promise<Applied | Refusal[]>;

/** Retire every active declaration of the pack through the kernel; the pack row goes, every row stays. */
export function uninstall(packId: string, host: Host): Retired | Refusal[];

/** SHA-256, lower-case hex, of jcs(body) — declaration.checksum and pack.checksum (34 §5). WebCrypto, hence async. */
export function checksum(body: Json): Promise<string>;

/** The Valibot schemas, constructed once at module load. Exported so apps/web can drive generated forms. */
export const schemas: { manifest: Schema; register: Schema; page: Schema; block: Schema; ingest: Schema;
                        rule: Schema; metric: Schema; theme: Schema; digest: Schema };

export const PACK_KINDS = ['register', 'page', 'block', 'ingest', 'rule', 'metric', 'theme', 'digest'] as const;
export const PACK_CODES: readonly string[];          // the thirty-eight of §6 — what the refusal-fixtures gate reads
export type { Kind, Pack, PackSource, Declaration, Seed, Installed, Host, InstallBatch, Diff, Applied, Retired, Refusal, Json };

// ─── @braindog/declare/yaml ───────────────────────────────────────────────────────────────
/** One file, or a directory of files with one manifest (04 §2): YAML → JSON (§5.1) → normalise(). Never throws. */
export function parsePack(files: { path: string; text: string }[], source?: PackSource): Pack | Refusal[];
```

Error contract: every function returns `X | Refusal[]`; nothing throws across the package boundary. `install` and
`uninstall` pass the kernel's `refusals` through, re-pathed. `Refusal` is the shape of 30 §6 / 33 §2 —
`{ code, at, found?, wanted?, fix }` — and every `code` is one of 30 §6's, plus the five this spec adds (§13 D4). `at` is a
path rooted on the declaration's own id, dotted, with `[i]` for a position in a list
(`ingest.hsbc_sms.extract.due.date.format`, `theme.brand.seed.accent`, `ingest.hsbc_sms.extract.due.first[0].date.format`),
or `<file>#<line>:<col>` for a text-level fault. Not a JSON index path: `declarations[3].fields[4].type` is a form this
package has never emitted, and the twelve fixtures that copied it from here were wrong for as long as it stood.

---

## 3 · Files

Six source files. The schemas are one file because they are data, they share nine pieces (identifiers, columns,
predicates, durations, the sixteen types…), and the browser imports them as one module for generated forms.

```
packages/declare/
├── package.json        "@braindog/declare" · private · "exports": { ".": "./src/index.ts", "./yaml": "./src/yaml.ts" }
├── src/
│   ├── index.ts        re-exports · normalise() · checksum() · toRefusals() · the types                 ~120 lines
│   ├── schemas.ts      every Valibot schema at module scope: shared pieces, manifest, each kind        ~800 lines
│   ├── lint.ts         the Registry · stage B/C/D checks in 04 §5 order · the value scans of §8        ~450 lines
│   ├── plan.ts         Installed × Pack → Diff · summaries · base · planHash                            ~250 lines
│   ├── install.ts      install() · uninstall(): the InstallBatch of §5.5, its pre-checks, seeds tagged — no SQL  ~120 lines
│   └── yaml.ts         parsePack(files): yaml.parseAllDocuments → merged JSON, the refusals of §5.1     ~80 lines
└── test/
    ├── installed.json  the stock record every fixture lints against (§9)
    ├── expected/       freelancer-uk.install.json · freelancer-uk.upgrade.json
    └── *.test.ts       node:test
```

Refusal fixtures are not here: `packages/fixtures/refusals/<code-kebab>.yaml` ([30-BLUEPRINT](30-BLUEPRINT.md) §6, spec 40 §6),
reached through `REFUSALS`; the golden packs are `packages/fixtures/packs/*.pack.yaml`, through `PACKS` and `text()` (40 §2).

`ponytail:` one 800-line `schemas.ts`; split per kind when one kind's schema passes ~250 lines or a second
consumer needs one kind alone.

---

## 4 · Data structures

### 4.1 · Types

```ts
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Kind = (typeof PACK_KINDS)[number];
type PackSource = { kind: 'kennel' | 'url' | 'git' | 'paste' | 'local'; ref?: string };   // pack.source, 30 §1

type Declaration = {
  kind: Kind;
  id: string;                    // '<kind>.<name>' — the spoken form, 34 §4
  body: Json;                    // the declaration object as written, as JSON; body[kind] is the bare name
  canonical: string;             // jcs(body) — what declaration.body stores
};

type Seed = { register: string; fields: { [field: string]: Json }; note?: string };

type Pack = {
  manifest: { pack: string; version: string; summary: string; author: string; license: string;
              requires: { format: number; primitives: number; packs: { [id: string]: string } };
              provides: string[]; note?: string };
  declarations: Declaration[];
  seeds: Seed[];
  canonical: string;             // jcs({ manifest (provides omitted), declarations: [body…], seeds })
  source: PackSource;            // metadata — never hashed
};

type Installed = {               // the record's declaration state; record builds it, tests write it as JSON
  format: number;                // PRAGMA user_version, 30 §11
  primitives: number;            // PRIMITIVES_VERSION of the running build
  record_version: number;        // MAX(event.rowid), 30 §1
  packs: { id: string; version: string }[];
  declarations: { id: string; version: number; kind: Kind; pack_id: string | null; body: string; checksum: string }[];
                                 // active rows only: superseded_at IS NULL AND retired = 0. body is JCS text
  rows: { [register: string]: number };                 // live rows per register
  units: { [registerDotField: string]: string[] };       // distinct currency/unit per money/quantity field the pack reads
};

type Host = {                    // the kernel's declaration methods (41 §2) with the CallContext bound by the record
  declarations(): { id: string; version: number; kind: Kind; pack_id: string | null; body: Json; checksum: string }[];
  count(register: string): number;
  installDeclarations(batch: InstallBatch): Promise<Result<{ versions: Record<string, number> }>>;
  retireDeclarations(req: { ids: string[]; pack?: string }): Result<{ retired: number }>;
};
type InstallBatch = {            // 41 §2's, plus `retire` and `seeds` — §12
  declarations: { id: string; kind: Kind; body: Json; pack_id: string | null }[];
  retire?: string[];             // retired in the same transaction — a downgrade
  seeds?: { register: string; fields: Json }[];   // through the write path, cascade = false, same transaction
  pack?: { id: string; version: string; source: string; source_ref: string | null; manifest: Json; checksum: string };
  planVersion?: number;          // record_version when the plan was made; the kernel's CAS raises PLAN_STALE
};
type Result<T> = { ok: true; value: T; version: number } | { ok: false; refusals: Refusal[] };   // 33 §2, structural
type Refusal = { code: string; at: string; found?: unknown; wanted?: string; fix: string };

type Applied = { pack: string; version: string; declarations: number; seeds: number; versions: Record<string, number> };
type Retired = { pack: string; declarations: number; rows_kept: { [register: string]: number } };
```

Invariants a test checks: `pack.canonical` is byte-identical for one document written in any YAML style or key
order · `declaration.canonical === jcs(declaration.body)` · `manifest.provides` equals the set of `declarations[].id`
· `Installed.declarations` never holds two rows with one `id` · `Host.installDeclarations` is called at most once per install,
with every seed inside the same batch · no identifier reaches the kernel without having matched `Id` (§8).

### 4.2 · The grammars the tables below name

| Name | Grammar | Owner |
|---|---|---|
| `Id` | `^[a-z][a-z0-9_]{0,31}$` — register, field, page, block, rule, metric, theme, digest, ingest ids | 34 §4 |
| `PackId` | `^[a-z][a-z0-9-]{1,63}$` | 34 §4 |
| `DeclId` | `^(register\|page\|block\|ingest\|rule\|metric\|theme\|digest)\.[a-z][a-z0-9_]{0,31}$` | 34 §4 |
| `SeqPrefix` | `#`, or `^[A-Z][A-Z0-9]{0,3}$`; `D` `SG` `S` are the kernel's | 34 §4 |
| `Semver` | `^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)(-[0-9A-Za-z.-]+)?$`; prerelease ordered per SemVer 2.0 §11 | 04 §5 |
| `Range` | comparators joined by spaces: `^N[.N[.N]]` · `~N.N[.N]` · `=` `>=` `>` `<` `<=` + Semver · a bare Semver. No `\|\|`, no `x` | §13 D6 |
| `Window` | `^[1-9]\d{0,3}(d\|w\|m)$` — days, weeks, calendar months: the offset units of 34 §1.4 | 08 §2 |
| `Interval` | `^[1-9]\d{0,4}(s\|m\|h\|d)$` — seconds to days; `m` is *minutes* here | 25 §3.2 |
| `Offset` | `^[+-][1-9]\d{0,3}(d\|w\|m\|h)$` — `h` legal in `remind:` only | 02 §4, 34 §1.4 |
| `Clock` | `^([01]\d\|2[0-3]):[0-5]\d$` | 09 §6 |
| `Tz` | `record`, or `^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$` — IANA shape, syntax only | 09 §6 |
| `Cur` | `^[A-Z]{3}$` | 02 §3 |
| `Path` | `segment { "." segment }`, ≤ 16 segments; a segment is a key of any characters but `.` `[` `]` and whitespace, with optional `[n]`, `[-1]` or `[]` (`[]` at most once) — the union of 43 §4.4 and 47 §4.3 (§13 D18) | 25 §3.1 |
| `Placeholder` | `\{(since\|until\|page\|probe\.[a-z][a-z0-9_]*\|grant\.[a-z][a-z0-9_]*)(:(date\|instant\|epoch_s\|epoch_ms\|int))?\}`; a brace group that does not match is literal text (47 §4.2), so a GraphQL body survives; a matching name with an illegal format is `VALUE_MALFORMED` | 25 §3.1 · 47 §4.2 |
| `Origin` | `^https://[a-z0-9.-]+(:\d{1,5})?$` — a literal origin: no path, no placeholder, no userinfo | 25 §7 rule 4 |
| `Glyph` | `^[a-z][a-z0-9-]{0,31}$` | 06 §1.1 |
| `Colour` | the whole value, trimmed: `^#[0-9a-fA-F]{3,8}$`, or `^(rgba?\|hsla?\|hwb\|lab\|lch\|oklab\|oklch\|color)\(` | 04 §5 |

### 4.3 · The manifest — 04 §2

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `pack` | `PackId` | yes | — | — |
| `version` | `Semver` | yes | — | — |
| `summary` | text ≤ 140 bytes | yes | — | — |
| `author` | text ≤ 80 | yes | — | — |
| `license` | `^[A-Za-z0-9.+-]{1,64}$` — SPDX syntax, not the list | yes | — | — |
| `declarations` | 1–256 objects, each with exactly one kind key | yes | — | the kinds of `KINDS` |
| `requires` | `{ format?: int ≥ 1, primitives?: int ≥ 1, packs?: { PackId: Range } }` | no | `{ format: 1, primitives: 1, packs: {} }` | — |
| `seeds` | `[{ register: Id, fields: object, note? }]`, at most eight per register | no | `[]` | — |
| `provides` | `[DeclId]` — **derived**; written out, it must equal the derived set (`PROVIDES_MISMATCH`) | no | derived | — |
| `note` | text ≤ 280 — 21 §11: a note is data, not a YAML comment. Legal on every declaration, field, block, section and action below | no | — | — |
| `config` | up to 64 settings, `{ <key>: { type, values?, max?, default?, label?, note? } }`, checked by the kernel's `readConfig`; on the manifest only when it holds a setting, so a pack without one keeps its checksum. A body reads one as `{{config:<key>}}`, filled by `plan` and `install` from the chosen value, else the default; every placeholder names a declared setting with a default. A metric's `target` may name a money or number setting as `setting`, which the record reads each time the figure is read, so a change holds it at once. A `list` setting fills a whole placeholder as its array, and inside a longer string is joined by `', '` | no | none | text, enum, bool, money, day, duration, number, list |

| `adds` | 1 to `ADDS_MOST` (16) objects `{ page: 'page.<name>', block: object with a text kind, after?: text, note?: text }`, none on a page this pack declares, no credential, colour or setting in a block. `plan` answers each as `Diff.page_adds` (the page, the block's kind and heading, `line` "adds a block to <page> from <pack>", `unresolved` when the record lacks the page) and checks the block with the kernel's `validate` over the page's `for:`; `install` refuses a missing page `PAGE_UNKNOWN` and a block the page could not draw with the kernel's refusal. Nothing is staged: the kernel reads the stored manifest and lays the block among the page's own when the page is read (`page-adds.ts`) | no | none | — |

`requires` here is a map; on a page it is a list (§4.5). Any key not in a table: `FIELD_UNKNOWN`, naming it.

### 4.4 · `register` — 02 §5

**On the register**

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `register` | `Id` | yes | — | — |
| `name` | text ≤ 60 — "the id is never shown" | **yes** | — | — |
| `one` | text ≤ 40, the singular | no; absent is a warning | — | — |
| `pack` | `PackId`, equal to the manifest's | no | — | — |
| `seq_prefix` | `SeqPrefix`; not `D` `SG` `S`, not another active register's, and not one that another prefix followed by a number spells, as `P` and `P2` both read `P21` (`SEQ_PREFIX_TAKEN`) | no | `#` | — |
| `series` | bool | no | `false` | — |
| `key` | 1–4 field ids | iff `series: true` | — | — |
| `fields` | 1–64 field objects, ids unique (`FIELDS_OVER_CAP` above 64) | yes | — | — |
| `search` | field ids typed `text document enum url email list<text>` (`SEARCH_FIELD_TYPE`) | no | `[]` | — |
| `title` | a `text` field id | no | the first `text` field | — |
| `mobile` | 3 or 4 field ids: a card draws the first three, and `context` carries every one | no | the first three fields | — |
| `table` | 1–9 columns, in the order the list's table draws them: a field id, or `{ field: Id, or?: Id | [Id…] ≤ 3, label?: text ≤ 40 }`, `or` the field, or up to three in turn, read where `field` holds nothing and `label` the column's heading. Each `field` and `or` is a live field of this register (`FIELD_UNKNOWN`, at `table[n]` or `table[n].or`); a field drawn twice, an `or` naming its own field or one field twice, any other key or label is `DECLARATION_INVALID`. A column over a field that waits (`when`) waits with it, and a table left with no column is dropped (`settleWhen`). Read by the app's list table (`tableOf` in `apps/web/src/lib/record/api.ts`); checked by `tableFault` in `packages/kernel/src/declare.ts` | no | worked out from `title`, `mobile`, `state` and a deadline field | — |
| `delete` | `refuse_while_referenced`, the one value (any other is `DECLARATION_INVALID`, at `delete`). Deleting a row that a live row of any register points at through a `ref` or `list<ref>` field is refused `DELETE_WHILE_REFERENCED`, at `delete`, naming the referring registers and how many of each one's rows point there (the most-referring ones by name, up to `LISTS_NAMED_MOST`, and the rest counted together); a register the writer cannot read still keeps the row and is neither named nor counted to her; a row that points at itself does not count, and a retired field does not count. Once those rows are repointed or deleted, the delete goes through. Checked in the write path by `referencedBy` (`packages/kernel/src/referenced.ts`) | no | none | `refuse_while_referenced` |
| `owner_only` | `true`, or left out (any other value is `DECLARATION_INVALID`, at `owner_only`). A colleague whose "Adds only" covers the whole record adds to every list but this one, and is refused it in one sentence naming the list; a grant naming the list still reaches it, and `read`, `write` and `decide` are unchanged. Keys and People are owner-only by their roles and declare nothing. Read by `guard` in `packages/record/src/index.ts` ([20 §1](20-COLLABORATION.md)) | no | absent | `true` |
| `personal` | `true`, or left out (any other value is `DECLARATION_INVALID`, at `personal`, and so is `owner_only` beside it). Only the owner reads and writes its rows, in their own session or through their own key; no grant, share, share template, guest, member row, child key, narrowed key, page link or "See as" reaches it, even one that names the list. A share or an invitation naming it is refused `FORBIDDEN`, an Admin is refused its rows, and every read across the whole record (a feed, the questions, what went quiet, a digest) is drawn for him with its lines left out rather than refused (`seesFor`), a page that shows it opens no link, and its rows never go out as example rows. A list playing `profiles` or `carry` must declare it (`DECLARATION_INVALID`, at `personal`). Read by `personalStop` in `packages/record/src/index.ts` and by `coverOf` in `packages/kernel/src/lens.ts` | no | absent | `true` |
| `hand` | `{ person?: Id, agent?: Id, taken?: <a state value> }`, at least one of `person` and `agent`: `person` a `ref` field of this register (the person a row is handed to, a People link), `agent` a `text` field (the name an agent signs with), `taken` one of the values of the register's `state` field, which a row handed to an agent moves to. Any other part, a field of another type, or a value the state does not have is `DECLARATION_INVALID`, at `hand`, `hand.person`, `hand.agent` or `hand.taken`. Read by the app's "Hand to" and by the start hook's briefing; Work declares `{ person: owner, agent: agent, taken: doing }` on `tasks` | no | — | — |
| `once` | a list of this register's own field ids, none of them derived (anything else is `DECLARATION_INVALID`, at `once` or `once[n]`). The fields an add-on plants and never patches: a write the add-on signs as its own (`pack: true` in the write context) leaves each as an existing row holds it and writes the rest, with no refusal; a new row takes every field, and a person's own edit is not narrowed, which is the difference from `immutable`. An update writes a row the add-on planted only where the file changed a seed's field since it was planted: the row is found by the seed's `key` through `planted` in the add-on's stored manifest, a seed with no `key` is never gone over, and `tags` is never written | no | absent | — |
| `order` | `{ field: Id, dir?: asc \| desc }`: a field of this register of type int, decimal, duration, day, instant or text; a read that names no order comes back in it. Any other key, direction or field is `DECLARATION_INVALID`, at `order` | no | none (newest made first) | `dir ∈ asc desc` |
| `same` | `{ fields: [Id…], within?: Id, fold: text \| exact, keep?: oldest \| latest \| sealed }`: what makes two rows of this register one thing. `fields` are live `text` fields of this register, each named once; `within` is its scope field or one of its `ref` fields; `keep: sealed` needs a live `secret` or `file` field; a register declaring `meets`, `org` or `scopes` does not declare it. Any other part or field is `DECLARATION_INVALID` or `FIELD_UNKNOWN`, and a fold or keep it does not have is `ENUM_VALUE_UNKNOWN`, at `same`, `same.fields[n]`, `same.within`, `same.fold` or `same.keep`. Each row holds one key, `same:<register>:<within value or *>:<the folded fields>`, kept in `entity_key` as a person's are: the first live row holds it and a deleted row frees it. `text` lower-cases, folds accents and runs of space, and drops a last word in brackets and a file ending; `exact` trims (`packages/kernel/src/entities.ts`) | no | absent | `fold ∈ text exact`, `keep ∈ oldest latest sealed` |
| `pairs` | `{ on: 1–3 of Id \| abs(Id), opposite: Id, across: Id, within: Window, date?: Id, mark: text ≤ 20 }` | no | — | — |
| `identity` | `{ mark?: a text field, accent?: an int field, picture?: a file field }`: the field a row's mark is kept in, the one its frozen hue is (13 §2.1b), and the `file` field its picture is kept in, a project's or an organisation's logo or a person's photo, drawn in place of the mark or the first letter wherever the row is. People and Organisations name a picture and no mark | no | — | — |
| `scopes` | `{ repos?: Id, folders?: Id }`, at least one, each a `list<text>` field of this register; not on a `series`; one active register declares it (`DECLARATION_INVALID`) | no | — | — |
| `rates` | `{ currency: Id, base: Id, rate: Id, as_of: Id }`, each a field of this register: `currency` and `base` `text` or `enum`, `rate` `decimal` or `int`, `as_of` `day`; one field plays one part; one active register declares it, and a keyless `fx` with those four fields counts as one (`DECLARATION_INVALID`) | no | — | — |
| `meets` | `{ name: Id, email: Id, met: Id, merged_into: Id, handles?: Id, projects?: Id }`: `name` `text`, `email` `email` or `text`, `met` and `handles` `list<text>`, `merged_into` a `ref` to this register, `projects` a `list<ref>` to the register declaring `scopes`; one field plays one part; one active register declares it, and a keyless `people` with the four required fields counts as one (`DECLARATION_INVALID`) | no | — | — |
| `restates` | `{ night: Id, unit: Id, day: Id, match?: { Id: text \| number \| bool } }`: this register keeps what one unit sells for, and the night's net worth is restated by it. `unit` is one of its `money` fields, `day` one of its `day` fields, `match` names its fields and the value each must hold for a row to be the price in use; `night` is a `decimal` field of the night's list, which is written the worth over the newest such price, converted into the night's currency, and nothing where that list does not declare it (`packages/kernel/src/restates.ts`). Any other shape is `DECLARATION_INVALID` at `restates` or the part | no | — | — |
| `kept_by` | `automations`, the one value, or left out (any other is `DECLARATION_INVALID`, at `kept_by`). Its rows are written by the record's own automations and read, never typed one by one, as the nightly money snapshots are; so the record offers it no page of its own and no week of it (`pagesOffered` and `weeksOffered` in `packages/record/src/emergent.ts`). It refuses no write | no | absent | `automations` |
| `predicates` | `{ Id: predicate }`, ≤ 16, each through `where.validate` on this register | no | `{}` | — |
| `immutable_when` | predicate | no | — | — |

`series: true` forbids `seq_prefix title mobile search one` and requires `key` (`PACK_MALFORMED`, naming the key).

**On a field**

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `id` | `Id`; not `id seq register created_at updated_at deleted_at version spoken title`; not `_*`; `state` only with `type: enum` (`STATE_NOT_ENUM`) | yes | — | — |
| `type` | one of sixteen, or `list` (`FIELD_TYPE_UNKNOWN`, with the nearest by §5.3) | yes | — | `text document int decimal money quantity day instant duration bool enum ref file url email secret list json` |
| `of` | `{ type: a value type, register?, values? }` | iff `type: list` | — | — |
| `values` | 1–50 unique strings | iff `type: enum` | — | — |
| `labels` | `{ <value>: text ≤ 64 bytes }`, keys ⊆ `values` (`ENUM_VALUE_UNKNOWN`); a label may not read as another value or its label once case and `_` are folded (`DECLARATION_INVALID`). The screen shows the label, the column holds the value, and a predicate may say either | `enum` only | the value with `_` as a space | — |
| `register` | `Id` — declared in this pack, installed, or provided by a required pack | iff `type: ref` | — | — |
| `required` | bool; never with `derive` or `retired` | no | `false` | — |
| `index` | bool; never with `derive` or `retired`; with `unique`, ≤ 8 per register (`INDEXES_OVER_CAP`) | no | `false` | — |
| `unique` | bool; never with `retired` | no | `false` | — |
| `immutable` | bool | no | `false` | — |
| `default` | a JSON value of the field's type; for `enum` one of `values` (`ENUM_VALUE_UNKNOWN`) | no | — | — |
| `min` / `max` | number: UTF-8 bytes for `text` and `document`, a whole number with `max` at most 16,384 and 524,288; the value for `int` `decimal` `duration`, `amount` for `money`, `value` for `quantity`. `min` ≤ `max`, and a `default` inside them (`OUT_OF_BOUNDS`). `url` `email` `json` `list` are given a size by 02 §5 and bounded by nothing in this build (`NOT_IN_THIS_BUILD`); any other type is `DECLARATION_INVALID` | no | none | — |
| `retired` | bool | no | `false` | — |
| `redact` | bool — the per-field redaction of 20 §8; `from_v`/`to_v` write `--redacted--` (41 §2) | no | `false` | — |
| `hidden_from_agents` | bool — the field is the list's own bookkeeping (a mark, a hue, a draft flag): the short `get` and `list` answers an agent reads leave it out, while `format: full` and the app still carry it | no | `false` | — |
| `lead` | bool — one of the facts a row's page puts first, in the list's order, ahead of the rest; read by the app's row page and by no write. A list that marks none leads with what the app knows of it | no | `false` | — |
| `derive` | exactly one of `{ sum: [Id…] } { diff: [Id, Id] } { product: [Id, Id] } { ratio: { of: Id, per: Id } } { band: { of: Id, edges: [number…] } } { via: Id, field: Id } { normalise: Id }` | no | — | seven shapes, 02 §5 |
| `required_when` | `{ field: Id, is: value }`: required while `field`, a `text` `enum` `bool` or `int` of this register other than this one, holds `is`, which is coerced as that field and for an enum is one of its `values`. `is` is the operator this build reads; the rest of 02 §5's list (`not in not_in gt gte lt lte before after between empty present has lacks`) is `NOT_IN_THIS_BUILD`, and `contains matches near starts ends via` are `REQUIRED_WHEN_OP_UNSUPPORTED` | no | none | `is` |
| `transitions` | `{ <value>: { to: [values], requires?: [Id…], by?: decide } }`, keys and `to` ⊆ `values`. `requires` names fields of this register a move out of `<value>` needs filled (`FIELD_UNKNOWN`); `by: decide` is a move only an accepted proposal makes | `enum` only | every move legal | `by ∈ decide` (`ENUM_VALUE_UNKNOWN`) |
| `by` | `decide`: once the row is made, only an accepted proposal changes the field. A create sets it freely; a direct update that would change it is `FORBIDDEN` from every caller, the owner included | no | none | `decide` (`ENUM_VALUE_UNKNOWN`) |
| `remind` | 1–6 `Offset`, `h` allowed | `day`/`instant` only | — | — |
| `repeat` | `{ freq, interval?: 1–99, byday?: [MO TU WE TH FR SA SU], bymonthday?: [−31…31 ≠ 0], until?: day, count?: 1–999, workday? }` | `day`/`instant` only | — | `freq ∈ daily weekly monthly yearly` · `workday ∈ previous next none` |
| `note` | text ≤ 280 | no | — | — |
| `scope` | `{ widen?, same? }` on a `ref`, or `{ links? }` on a `list<ref>`, whose target is the register declaring `scopes`; one per register | no | global; `widen: any`, `same: both` | `widen ∈ any person` · `same ∈ both nearer` · `links ∈ true` |
| `currency_from` | `'<link>.<field>'`: a `ref` of this register and a `money` field of the register it points at. An amount written with no code takes that field's code on the linked row, and is `VALUE_MALFORMED` when there is none to give. `DECLARATION_INVALID` on another type, a link that is not a `ref`, or a target that is not `money` | `money` only | none | — |
| `currency_fixed` | `true`: once a row holds a code, a write that would change it is `CURRENCY_FIXED`; the amount stays free | `money` only | `false` | — |
| `parts_of` | a `money` field of this register: the field holds the row split into two parts or more, each a patch over the row (`{ category, amount, note }`) in its currency, adding up to that field, else `VALUE_MALFORMED` saying what to move. A sum of that field reads a split row as its parts. `DECLARATION_INVALID` on another type, a target that is not `money`, or a second field of one register | `json` only | none | — |
| `on_delete` | `unlink`: a link the record drew itself, such as a mail's sender. Deleting the row it names clears it on every row in the delete's own batch instead of `DELETE_WHILE_REFERENCED`, and Undo or bringing the row back points each one back while it is still empty. `DECLARATION_INVALID` on any other value or type | `ref`, `list<ref>` | none | — |
| `when` | `{ holds: [Id…] }`, 1 to 8 list ids or roles (`rates`, `meets`, `org`): the field is there only while the record holds every one. The plan takes it out, so a stored field never says it. On a field that is `required` or has `required_when` it is `DECLARATION_INVALID` | no | always there | — |

`band.edges.length + 1 === values.length`, else `BAND_EDGES_MISMATCH`. Every field id named by `search title mobile
table key pairs identity scopes derive required_when transitions.requires` is declared on this register, else `FIELD_UNKNOWN`.

A `secret` field is written by the Keychain door alone (41 §5.4), so nothing else may put a value in it: it is never
`required`, never under `required_when`, never given a `default`, and a `list` of `secret` is refused
(`DECLARATION_INVALID`). It holds where a key is sealed and says nothing about the row, so it is never searched
(`SEARCH_FIELD_TYPE`) and never the `title` (`DECLARATION_INVALID`).

`scopes` and `scope` say where a row applies (02 §5). The register declaring `scopes` holds the projects, and a run is
placed in one by the repositories and folders its rows list. A field's `scope` names the project a row belongs to, and
absent is global. `widen: person` holds a token to its run's project: its create lands there and names no other, and it
may narrow a global row to a project but never move a row out of one (`FORBIDDEN`). `same: nearer` makes a project row
hide a global row with the same title when a run reads by scope. `links: true` lets a token add a project to the list
and never remove one. A `scope` on any other type, one pointing at a register that does not declare `scopes`, `widen`
or `same` on a list, `links` on a `ref`, an unknown key and a second `scope` on one register are `DECLARATION_INVALID`;
a value outside the closed list is `ENUM_VALUE_UNKNOWN`.

### 4.5 · `page` — 06 §1.1

**On the page**

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `page` | `Id` | yes | — | — |
| `title` | text ≤ 60 | yes | — | — |
| `nav` | `{ section: text ≤ 40, order: int 0–9999, icon: Glyph }` | no | absent — not in nav | — |
| `requires` | `[register.<Id>]`, 1–16 — every register any block reads must be here (`DEPENDENCY_UNRESOLVED`) | yes | — | — |
| `origin` | — | no | `pack` — the installer writes it, 29 §3 | `derived person pack` |
| `derived_from` | `DeclId` | iff `origin: derived` | — | — |
| `placed` | bool | no | `true` | — |
| `tone` | intent | no | — | `good warn bad info` |
| `filters` | `[{ field: Id, control }]` ≤ 8 | no | `[]` | `control ∈ chips toggle picker range search` (29 §5) |
| `header` | `{ count?: { source }, action?: { kind: new, label }, filters?, search?: [Id], state?: [stale offline provisional] }` | no | derived from the register | — |
| `blocks` | 1–24 block objects | yes | — | — |

**On a block**

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `kind` | a key of render's `KINDS` (twenty), or a `block.<Id>` declared by this pack or installed (`KIND_UNKNOWN`) | yes | — | `Object.keys(KINDS)` ∪ declared blocks |
| `heading` | text ≤ 80; on a `section` it is the section, drawn as a heading | `section` | — | — |
| `span` | int 1–12 | no | `12` | — |
| `source` | `register.<Id>` · `metric.<Id>` (a `bar` or `split` only, over a figure grouped by a word; `NOT_IN_THIS_BUILD` on other kinds, `DECLARATION_INVALID` for a bucketed figure) · `block.<n>` (an earlier block on this page) · `activity` · `sessions.live`, the runs of `session` not done, the most recently seen first, whose `where` and columns name that register's fields and which refuses `order` (`DECLARATION_INVALID`) · `actions`, the record's scheduled actions, one row each, which refuses `order` too; on a `section`, what its count counts; on a `diff`, the register whose row it reads | `table`, `cards`, `feed`, `diff` | — | on a `feed`, `activity` only |
| `where` | predicate, validated on the source register | no | every row | — |
| `when` | `{ metric: Id, <op>: value }`, one leaf, ops `is not in not_in gt gte lt lte empty present` | no | always drawn | — |
| `columns` | 1–16 of `{ field: Id, label?, width?: `^\d{1,3}(ch\|%)$` or `minmax(…)`, align?: start \| end, link?: bool (**specified and not built**: no evaluator reads it, and a row that has somewhere to go is already a link in whole), tone_when?: leaf + tone (**specified and not built**: no evaluator reads it, and a row's tone comes from its register's state field, not from its block), as? }`; `as` only on `cards`, where each role appears once and `fact` at most three times (`OUT_OF_BOUNDS`), except `as: scope`, which a `table` takes too and which names the register's scope field (`DECLARATION_INVALID`) `sign: { field: Id, minus }` names an enum field and one of its values (`DECLARATION_INVALID` otherwise); a `field: changed` on a register with no such field is who changed the row last, from its history. | `table`, `cards` | on `cards`, the first text column is `title`, the first figure that never truncates is `figure`, the rest `fact` | `as ∈ title figure fact trend ring who when mark scope` (`ENUM_VALUE_UNKNOWN`); the renderer's `quiet` role is not among them, because the evaluator writes it from the record's clock |
| `inherit` | bool; only over a register with a scope field (`FIELD_UNKNOWN` at `inherit`), whose `where` then holds, at its top level, one leaf `<scope field> is <project>` (`REQUIRED_MISSING` at `where`). The project's rows, then the global rows `inScope` leaves after nearer-wins | no | `false` | none |
| `order` | `[{ field: Id, dir: asc \| desc }]` ≤ 3 | no | 29 §5's rule | — |
| `limit` | int 1–500 | no | `50` | — |
| `empty` | text ≤ 200, interpolatable | **yes on every block with a `source`** | — | — |
| `cells` | 1–6 of `{ metric: Id, label: text ≤ 40, trend?: window, note?: text ≤ 200 }`; `note` replaces the target line under the figure and may carry `{{id}}` | `stat` | — | — |
| `series` | 1–4 of `{ metric: Id, then?: Id, label?: text ≤ 40, dir?: in \| out }`; every metric grouped by a date with a `bucket`, all the same bucket (`DECLARATION_INVALID`), one currency (`MIXED_CURRENCY`) | `series` | — | `dir ∈ in out` |
| `back` | int 1–24 buckets, the current one included (`OUT_OF_BOUNDS`) | no | `6` | — |
| `ahead` | int 0–12 buckets after the current one (`OUT_OF_BOUNDS`) | no | `0` | — |
| `net` | bool; on a `series`, in minus out as a line | no | `false` | — |
| `recorded` | series `Id`, with or without `series.`; on a `forecast`, the opening metric's own series (`DECLARATION_INVALID` otherwise) | no | — | — |
| `stale` | `{ field: Id of a day or instant field, after: window }` (`DECLARATION_INVALID`); on `cards` | no | — | — |
| `knobs` | list of `horizon late spend leave` (`DECLARATION_INVALID`) | no | none | the four |
| `late` | metric `Id`; on a `forecast`, the figure the late knob marks (`METRIC_UNKNOWN`) | no | — | — |
| `under` | int 1–365 days; on a `forecast`, how near a crossing is said (`OUT_OF_BOUNDS`) | no | — | — |
| `unset` | text; on a `bar` or `split`, the label of the last row holding what no part does, linked to those rows | no | — | — |
| `tone` | intent | no | — | the four |
| `body` | the dialect, ≤ 64 KB | `note` | — | — |
| `icon` | `Glyph`, beside a `section`'s heading | no | — | — |
| `fold` | bool; a `section` that starts shut, folding the blocks after it up to the next section | no | `false` | — |
| `since` | `seen`; on a `feed`, the rows after the reader's read mark are new | no | absent: nothing is new | `seen` (`ENUM_VALUE_UNKNOWN`) |
| `first` | int 1–50; on a `feed`, the most rows it draws, newest first, a burst being one row; the rest go in one last row per group | no | every row | — |
| `row` | a spoken id, interpolatable (`'{{spoken}}'` on a template); on a `diff`, the row whose history it reads | `diff` | — | — |
| `field` | `Id` of a `document` or `text` field on that register; on a `diff`, the field compared | `diff` | — | the register's fields (`FIELD_UNKNOWN`) |
| `versions` | int 2–10; on a `diff`, how many versions, newest first, each against the one before it | no | `2` | — |
| *accepts names* | for a pack-declared `kind`, the keys its `accepts:` names, typed §4.6 | per the block declaration | — | — |

`heading`, `body`, `empty` and authored cells may carry `{{path}}` (05 §7.1). Nothing checks a path at
install: outside `for:` the record answers each one it holds on the block's `values` when the page is
read, and a path it holds nothing for draws `—` (06 §1).

### 4.6 · `block` — 22 §3 · 05 §1 · 34 §2.4

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `block` | `Id` | yes | — | — |
| `primitive` | one of render's eight | yes | — | `PRIMITIVES`: `panel grid rows proportional inline list table media` |
| `accepts` | `{ name: accept type }`, 1–6 names, each `^[a-z][a-z0-9_]{0,15}$` | yes | — | `register metric number text` |
| `body` | 1–64 nodes, depth ≤ 8 | yes | — | — |
| `note` | text ≤ 280 | no | — | — |

A **node**: `{ primitive, cells?: int 1–12, children?: [node], parts?: [node], rows?: $name \| [{ label, value, note? }],
columns?: [column], empty?: text, value?: $name \| scalar, note? }`. `$name` is a whole-node reference to a key of
`accepts` and nothing else (`FIELD_UNKNOWN` naming the unknown `$name`); it is never spliced into a string. On a page,
a block of this kind supplies each accepted name as its own key: `register` → `register.<Id>` and the block may
also carry `where order limit` and must carry `empty`; `metric` → `metric.<Id>`; `number` → a JSON number; `text` →
a string ≤ 200.

### 4.7 · `ingest` — 25 §3 · 07 §3 · 12 §3 · 43 §4.2–§4.5 · 47 §4.1

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `ingest` | `Id` | yes | — | — |
| `channel` | — | yes | — | `email webhook pull paste api call poll`; the last two are scheduled actions, 25 §3.3 |
| `match` | predicate, backend `inbox_raw` | all channels but `pull`; forbidden on `pull` | — | fields `from to subject body channel state ts` |
| `skip` | 1–16 of `{ when: predicate on inbox_raw, reason: text ≤ 120 }` — 07 §2's skip list | no | `[]` | — |
| `verify` | `{ kind: hmac_sha256, header: header name, grant: text ≤ 40 }` | no; `webhook` only | the URL's path token | — |
| `extract` | `{ Id: form }`, 1–64 | all but `pull` | — | — |
| `fetch` | the fetch object below | `pull` only | — | — |
| `map` | `{ Id: { path: Path \| [Path, Path], type, from?, minor?: bool, currency?: Cur, format?: text, values?: [text], other?: text } }`, 1–64 | `pull` only | — | `type ∈ text int decimal money day instant enum bool duration url email document json` · `from ∈ epoch_s epoch_ms` |
| `writes` | `{ register: Id \| Route, confidence? }` or `{ series: Id, kind, unit }` | yes | `confidence: exact` | `confidence ∈ exact proposed needs-review` (a pull: `exact proposed`) · `kind ∈ gauge flow cumulative unique fact` · `unit ∈ count ms bytes money.<Cur> pct.bp` |
| `dedupe` | 1–4 field ids, or `{ near: { on: [Id…], day: Id, prefix?: { field: Id, chars?: int 1–64 } } }` — 07 §2's fuzzy dedupe | no | — | — |
| `on_conflict` | — | no | `skip`; `update` on a pull | `skip update new` |
| `url` | a literal `https://` address; `{since}` and `{until}` only after the origin | `call` `poll` | — | `ACTION_NOT_HTTPS` · `ACTION_HOST_COMPUTED` · `ACTION_EVALUATES` |
| `grant` | text ≤ 40, a Keychain label | `call` `poll` | — | `ACTION_GRANT_MISSING` |
| `every` · `floor` | `Interval`; `every` ≥ 15m and ≥ `floor` | `every` on `call` `poll` | — | `ACTION_INTERVAL_TOO_SHORT`, on a `pull` too |
| `project` | text | no | the whole record, metered as `global` | — |
| `body` | an object ≤ 8 KB; string leaves substituted, never evaluated | no; `call` only | — | `OUT_OF_BOUNDS` over 8 KB · `ACTION_EVALUATES` |

The scheduled actions' keys, `url` `grant` `every` `floor` `project` `body`, are checked by the kernel at install
(`packages/kernel/src/declare.ts`, September 15th 2026), and their codes are 30 §6's. A **`Route`** is `{ by: 1–2 field ids, to: 1–16 of { when: [text…], register: Id } }` — 07 §2's routing table; every `register` it
names resolves like `writes.register`. A **form** (43 §4.3, whose keys this schema accepts exactly — 43 §13 D6) is one object
with one key: `{ after: text }` · `{ before: text }` · `{ between: [text, text] }` · `{ text: { anchor? } }` · `{ money: { anchor?, currency?: Cur } }` ·
`{ date: { format, anchor? } }` · `{ int: { anchor? } }` · `{ decimal: { anchor?, sep?: "." \| "," } }` · `{ enum: { map: { literal: value } ≤ 64, anchor? } }` ·
`{ lookup: { register: Id, by: Id, anchor? } }`, and the combinators `{ first: [form…] }` (2–8, nesting ≤ 3) · `{ nth: { n: int 1–64, of: form } }` ·
`{ default: { value: Json, of: form } }`. `anchor` is at most one of `after` `before` `between` inside the form; `format` matches
`^(YYYY|YY|MM|M|DD|D|[^A-Za-z])+$`; a literal is 1–200 bytes (`OUT_OF_BOUNDS`). `extract` owns what a form *does*; this table owns what it *is*.

**`fetch`** — 47 §4.1's `FetchDecl`, key for key

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `base` | `Origin` | yes | — | — |
| `path` | `^/`, ≤ 512 bytes; `..` `//` `@` refused; `Placeholder`s resolved, other braces literal | yes | — | — |
| `method` | — | no | `GET` | `GET POST` |
| `headers` | `{ name: text }` ≤ 16; a name in `authorization cookie host content-length referer origin x-forwarded-*`, any case, is `SECRET_IN_PACK` | no | `{}` | — |
| `query` | `{ key: scalar \| [scalar] }` ≤ 32 | no | `{}` | — |
| `body` | an object, ≤ 8 KB serialised, `POST` only; printed whole in the diff | no | — | — |
| `auth` | `{ kind: none }` · `{ kind: bearer \| basic, grant, require_scopes? }` · `{ kind: header \| query_param, grant, name, require_scopes? }` · `{ kind: oauth2_refresh, grant, token_url: an https URL, scope?, require_scopes? }` · `{ kind: jwt_rs256, grant, mode: exchange \| present, aud, scope?, token_url? (exchange needs it), ttl_s?: int 60–3600, require_scopes? }` · `{ kind: aws_sigv4, grant, region, service }`; `grant` text ≤ 40, `require_scopes` ≤ 16 | yes | — | `kind ∈ none bearer basic header query_param oauth2_refresh jwt_rs256 aws_sigv4` (25 §5.2) |
| `schedule` | `{ every: Interval ≥ 15m, at?: Clock — needs `every` a multiple of 24h, tz?, jitter? }` | yes | `tz: record` · `jitter: auto` | `tz ∈ record` · `jitter ∈ auto` — v1 |
| `window` | `{ grain?, start: day, lookback?: Interval ≤ max_span, max_span?: Interval ≤ 366d, end?: exclusive \| inclusive }` | no | `grain: day` · `max_span: 31d` · `end: exclusive` | `grain ∈ hour day month`; `end` says whether the provider's range includes its last day, which is what `{until}` is written as (47 §4.2) |
| `source_retention` | `Interval`; `every` ≤ half of it, else `OUT_OF_BOUNDS` | no | — | — |
| `probe` | `{ path, read: { name: Path } ≤ 8 }` — exactly one | no | — | — |
| `page` | `{ kind: none }` · `{ kind: cursor_param, param, from: Path, more?: expect }` · `{ kind: offset, param, size: int 1–1000, more? }` · `{ kind: page_number, param, start?: int, more? }` · `{ kind: keyset, param, from: Path, more? }` · `{ kind: link_header, stop_when: { param, is } }` | no | `{ kind: none }` | six kinds |
| `expect` | 1–16 of `{ path: Path, <one op>, on_fail? }` — no nesting; a list is `all` | no | `[]` | ops `eq ne is is_not present absent contains starts ends len_lte len_gte` · `on_fail ∈ warn review fail` · string ops ≤ 40 bytes (`PATTERN_OVER_CAP`) |
| `read` | `{ format?, rows?: Path, delimiter?: `,` \| `;` \| tab, table?: int }` — 43 §4.2's `Read` | no | the body is the list, in JSON | `format ∈ json csv xml html_table text` · `delimiter` is csv's and `table` is html_table's · `table ≥ 0` |
| `limits` | `{ response_bytes?: int ≤ 2 000 000, rows_per_run?: int ≤ 5 000, timeout?: Interval 1s–30s, max_pages?: int 1–50 }` | no | `2000000 · 5000 · 6s · 40` | — |
| `on_error` | `{ error_when?: [cond], fatal_when?: [cond], honour?: retry_after }`; a cond is `{ status_in: [int] }` or an `expect` without `on_fail` | no | 47 §4.1's | — |

`for_each`, `conditional`, `on_error.backoff` and `on_error.pause_after` — keys 25 §3.2's example carries — are not v1 (47 §13 D7) and
are refused as unknown keys.

**A `read.format` other than `json` is refused beside anything that reads a document.** `expect`, an
`on_error` cond with a `path` (a `{ status_in }` cond is fine), any `more:`, and `page.kind` of
`cursor_param` or `keyset` all reach into a parsed body; a csv, xml, html_table or text page has rows
and no body to reach into. Installed together they do not fail loudly — the conds never match, the
`expect`s never fire, and a cursor that is never found reads as *the provider stopped sending one*,
which ends the run after page one. So the pair is `DECLARATION_INVALID` at install, naming the key
that has to go. `offset`, `page_number` and `link_header` stop on a count or a header and are legal
with every format.

### 4.8 · `rule` — 07 §6

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `rule` | `Id` | yes | — | — |
| `register` | `Id` | yes | — | — |
| `priority` | int 0–999 | no | `100` | — |
| `when` | predicate on `register`; never `near` | yes | — | — |
| `then` | 1–8 actions; `stop` only last | yes | — | ten shapes |
| `once_per` | 1–3 of `entry` or a field id | iff `then` has `notify` or `create` | — | — |

The ten shapes, and what each is checked against: `{ tag: text ≤ 40 }` · `{ untag: text }` — the register declares a `tags` field of
`list<text>` (§13 D9; `FIELD_UNKNOWN` otherwise) · `{ set: { field: Id, to: Json \| interpolation } }` —
one declared, non-derived, non-`secret`, non-`file` field · `{ move: value }` — a `values` member reachable along
`transitions` from the state `when` pins, or from any state when it pins none (`TRANSITION_ILLEGAL`) · `{ notify: { tone, say: text ≤ 120, urgent?: bool } }` ·
`{ schedule: { in: Window, kind: rule, note: text ≤ 280 } }` · `{ suggest: { question: text ≤ 280, options: 2–6 texts } }` ·
`{ link: { field: a ref field, to: { register: Id, by: Id, value: text } } }` · `{ create: { register: Id, each: 1–2 field ids, bound: int 1–500, fields: { Id: Json \| interpolation } } }` · `stop`.

### 4.9 · `metric` — 08 §2

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `metric` | `Id` | yes | — | — |
| `name` | text ≤ 60 | no | the id | — |
| `source` | `register.<Id>` · `series.<Id>` · `forecast.runway` · `*` | yes | — | — |
| `where` | predicate on the source register; on `*` and `series.*`, kernel fields only | no | every row | — |
| `value` | an aggregation `{ agg: operand }`, a combinator `{ ratio: { of: agg, per: agg } } \| { diff: [agg, agg] } \| { product: [agg, agg] }`, or `{ running: agg, from: Json \| { field: Id }, stop?: { lt \| gt \| lte \| gte: number } }`; over a register, `{ rolled: { balance, as_of, checks?, moves } }`; over `forecast.runway`, `{ walk: in \| out \| net \| days_to_zero \| zero_on, within? }` | yes | — | `agg ∈ sum count avg min max delta median distinct last running trend` · `series` source: `last sum avg delta min max trend` |
| `format` | — | yes | — | `money` `money.<Cur>` `int` `decimal` `pct` `days` `duration` `day`; `day` is the earliest or latest of a day field or `walk: zero_on`, and `walk: zero_on` takes `day` and no other |
| `target` | `{ lte \| gte \| lt \| gt \| eq: number \| money }` | **yes** | — | — |
| `window` | `Window` | **yes** | — | — |
| `compare` | — | no | `previous` | `previous year_ago none` |
| `group_by` | one field id; a list is `GROUP_BY_TWICE` | no | — | — |
| `bucket` | — | with a `day`/`instant` `group_by` only | — | `day week month quarter year` |
| `order` | `[{ field, dir }]` ≤ 2 | with `running` only | — | — |
| `snapshot` | `{ grain, into: series.<Id> }` | no | — | `grain ∈ day hour month` |
| `lookups` | named factor tables `{ <name>: { <value>: number } }`: ≤ 8 tables, a name matching `^[a-z][a-z0-9_]{0,31}$`, 1–64 finite numbers each, a key ≤ 64 characters | with a `lookup` operand | — | — |
| `home` | whole number 1 to 9, its place among the Home figures | no | none | none |
| `sellable` | `true` | no | absent | none |
| `legs` | 1 to 12 forecast legs, as a forecast block's `from` | with `forecast.runway` only | none | none |
| `opening` | `{ metric: Id }` | with `walk: days_to_zero` or `zero_on` only | none | none |

An **operand** is a field id, `id` (rows), or a row-level `{ product: [a, b] } \| { diff: [a, b] }` where `a`/`b` is a
field id or `{ lookup: Id, by: Id, as_of?: Id }`. Depth one in either direction; a `where` or `source` key inside an
operand is `RATIO_MIXED_SOURCE`.

**A figure carries the factor tables it multiplies by.** Every `{ lookup: <name> }` inside `value`, however deep it sits, must
name a table under the same declaration's `lookups`, or the install refuses `LOOKUP_UNKNOWN` at `lookups`: *`metric.estate-year
multiplies by per_year and carries no table of that name. Add it under lookups.`* A malformed table is `DECLARATION_INVALID` at
`lookups`. The kernel's install check raises both (`packages/kernel/src/declare.ts`), so the tables are installed, versioned,
exported and retired with the figure that reads them. *(Landed 2026-09-16. Until then the tables were an option handed to the
kernel when a record was opened, `RecordOptions.lookups`; no host handed one in, so every real record answered `LOOKUP_UNKNOWN`
for the estate pack's own Cost per year while every test passed the seed's table. That option is gone.)*

A body installed before 2026-09-16 carries no `lookups` key at all, and declaration rows are never edited, so the evaluator reads
such a body against the one table a build ever named without carrying: `per_year: { monthly: 12, yearly: 1, two_yearly: 0.5 }`.
A body that has the key, even an empty one, reads only its own tables.

### 4.10 · `theme` — 28 §1 · 13 §2.1

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `theme` | `Id` | yes | — | — |
| `extends` | `house` · `high-contrast` · a declared or installed `theme.<Id>` | no | `house` | — |
| `scheme` | — | no | `both` | `light dark both` |
| `seed` | `{ accent: colour text ≤ 64, neutral_hue?: from-accent \| number 0–360 }` | yes | — | — |
| `roles` | `{ light?: { role: colour text }, dark?: { role: colour text } }` | no | `{}` | the 22 roles: `sunk bg s1 s2 s3 ink ink2 dim faint line edge earn warn danger earn-fill warn-fill danger-fill accent accent-text accent-ink focus-in focus-out` |
| `scale` | `{ space?: { base: int 2–8 }, radius?: { sm, md, lg: int 0–24 }, density? }` | no | `house`'s | `density ∈ compact comfortable roomy` |

`declare` checks shape and the banned substrings (`url( image( element( attr( var( \` → `REMOTE_ASSET`); every
colour *value* is parsed, re-serialised and contrast-checked by `theme` (28 §4.4), whose refusals `record` merges.

### 4.11 · `digest` — 09 §6

| Key | Type | Required | Default | Closed list |
|---|---|---|---|---|
| `digest` | `Id` | yes | — | — |
| `schedule` | `{ day?, at: Clock, tz? }` — weekly with `day`, daily without | yes | `tz: record` | `day ∈ mon tue wed thu fri sat sun` |
| `channels` | 1–5, unique | yes | — | `in-app email push webhook mcp` (09 §3) |
| `sections` | 1–12 of `{ heading: text ≤ 60, source: register.<Id> \| metric.<Id>, where?, as, columns?, limit?: 1–50, omit_when_empty?: bool }` | yes | `omit_when_empty: false` | `as ∈ KINDS` except `section`; `table` and `cards` need `columns` |
| `prose` | — | no | — | `slash` |

### 4.12 · `Diff` — 04 §3

```ts
type Diff = {
  pack: { id: string; version: string; author: string; license: string; summary: string; checksum: string; source: PackSource };
  installed_version: string | null;
  direction: 'install' | 'upgrade' | 'downgrade' | 'reinstall';
  requires: { format: Req; primitives: Req; packs: { id: string; range: string; installed: string | null; ok: boolean }[] };
  adds:      { id: string; summary: string }[];                         // "11 fields" · "4 blocks, nav → Money/20"
  changes:   { id: string; from_version: number; summary: string; applied: boolean }[];   // nav: applied = false
  retires:   { id: string; rows: number }[];                            // in the installed version, absent here
  conflicts: { id: string; pack: string; version: string }[];           // another pack's active declaration
  seeds:     { count: number; registers: { register: string; rows: number }[] };
  spawns:    { rule: string; register: string; bound: number; when: string }[];
  calls_out: { ingest: string; channel: string; host: string | null; every: string; grant: string | null; line: string }[];   // line: CALLS OUT <host> · every <n> · grant "<label>"
  interrupts: string[];                                                 // rules with notify urgent: true, 09 §5
  touches:   { rows_read: 0; rows_written: 0 };                        // by construction — a pack cannot read a row
  orphans:   number;                                                    // rows under retired registers; > 0 is WOULD_ORPHAN in v1 (§5.7)
  warnings:  { at: string; say: string }[];                             // `one:` absent · a register with no seed
  base:      { format: number; primitives: number; packs: [string, string][]; declarations: [string, number, string][] };
  planHash:  string;                                                    // `${record_version}.${sha256hex(jcs({ pack: checksum, base }))}`
};
type Req = { wants: number; have: number; ok: boolean };
```

Invariants: `adds ∩ changes ∩ retires ∩ conflicts = ∅` by id · `conflicts.length > 0 ⇒ install refuses` ·
`base.declarations` and `base.packs` are sorted by id, so `planHash` is a pure function of `(pack, Installed)` ·
`touches` is the literal `{ 0, 0 }` · `direction === 'reinstall'` iff `installed_version === pack.version` and
`adds`, `changes`, `retires` are all empty.

---

## 5 · Algorithms

### 5.1 · Parse — `yaml.ts`

`parsePack(files, source)` — one file, or a directory of files with one manifest (04 §2):

1. More than 64 files, or a file above 1,048,576 bytes → `PACK_MALFORMED` at `<path>#0:0`, `found` the count, wanted
   `≤ 64 files · ≤ 1 MB each`. Nothing is parsed.
2. Per file: `yaml.parseAllDocuments(text, { version: '1.2', schema: 'core', strict: true, uniqueKeys: true, maxAliasCount: 0, intAsBigInt: true })`.
   Core schema, so `yes`/`no`/`on`/`off` stay strings and `2026-01-01` stays a string; `maxAliasCount: 0` refuses every alias.
3. More or fewer than one document in a file → `PACK_MALFORMED` at `<path>#0:0`, fix `one document per file`.
4. Every entry of `doc.errors` and `doc.warnings` → `PACK_MALFORMED` at `<path>#<line>:<col>` from `linePos`, `found` = the yaml
   error code (`DUPLICATE_KEY`, `BAD_INDENT`, …), `fix` = the yaml message. Warnings are errors here.
5. Walk `doc.contents`. A node with an explicit tag (`node.tag` set) → `PACK_MALFORMED`, fix `a pack carries no tags`.
6. `doc.toJS({ mapAsMap: true })`, then convert: a Map key that is not a string → `PACK_MALFORMED`; a `bigint` outside
   `±(2^53 − 1)` → `INT_OUT_OF_RANGE`, inside it → `Number`; a non-finite number (`.inf`, `.nan`) → `PACK_MALFORMED`;
   `-0` → `0`; depth above 32 → `PACK_MALFORMED`. Everything else is already JSON.
7. Merge: the one file whose root has a `pack` key is the manifest (none, or two → `PACK_MALFORMED`); every other file's root
   is one declaration object or a list of them, appended to `declarations` after the manifest's own, files in path order.
   From here `at` paths address the merged pack.
8. Return `normalise(json, source ?? { kind: 'paste' })`.

### 5.2 · Normalise — stage A, `index.ts`

`normalise(doc, source)`:

1. `v.safeParse(schemas.manifest, doc)`; `declarations` is `v.array(v.unknown())` at this stage. Issues → `toRefusals(issues, '')` (§5.9).
2. For each `declarations[i]`: an object with exactly one key in `PACK_KINDS`. Zero → `KIND_UNKNOWN` at `declarations[i]`,
   found the first key; two or more → `PACK_MALFORMED`, fix `one kind per declaration`. Else `v.safeParse(schemas[kind], obj)`,
   issues → `toRefusals(issues, 'declarations[i]')`.
3. `id = kind + '.' + obj[kind]`. A repeated id → `PACK_MALFORMED` at `declarations[i]`, fix `<id> is declared twice`.
4. `provides`: derive the id list. If the manifest wrote one, compare as sets: each entry not derived → `PROVIDES_MISMATCH`
   (04 §5's copy), each derived id not listed → `PROVIDES_MISMATCH` with `found` absent.
5. `seeds[j]`: `register` must be one of this pack's registers, else `CREATE_FOREIGN_REGISTER` at `seeds[j].register`;
   a ninth seed for one register → `PACK_MALFORMED`, fix `at most 8 example rows`; the register must declare a `tags`
   field of `list<text>` to carry the `example` marker (§13 D9), else `FIELD_UNKNOWN` at `seeds[j].fields.tags`.
6. Refusals are collected, not short-circuited, capped at 50 (`ponytail:` a cap, not a stream). Any → return them.
7. Build `Pack`: every predicate site of §5.3 becomes `where.flatten(where.parse(json))` — same-quantifier nesting flattens on
   save (21 §4.4, 38 §2.4); a `SyntaxError` from `parse` is `PACK_MALFORMED` at the site. Then `canonical` for each declaration
   is `jcs(body)`, and `pack.canonical = jcs({ manifest without provides, declarations: bodies, seeds })`.

### 5.3 · Lint — stages B, C, D, `lint.ts`

`lint(pack, installed)` builds one **Registry**: `Map<DeclId, { body: Json; pack_id: string | null; version: number;
from: 'pack' | 'installed' }>` = every active installed declaration, then every declaration of the pack (the pack's wins
on an equal id — that is an upgrade). `owner(id)` is `pack.manifest.pack` for the pack's own, else the installed
`pack_id`. `installed === null` skips every stage-D check; nothing else changes.

Every predicate site — page `where`, rule `when`, metric `where`, digest `where`, register `predicates.*` and
`immutable_when`, ingest `match` and `skip[].when`, and the single leaves `required_when`, `when`, `tone_when` — goes
through `where.validate(tree, schema, schemas)` (38 §2.4). `schema` is the site's register projected onto 38 §2.2's
`RegisterSchema` — `fields` with `type`, `of`, `register`, `values`, `derive` and `index = index || unique`; `search`;
`series`; `predicates`; `backend 'entry'` — or `where.INBOX_RAW` for `match` and `skip`; `schemas` is every register in the
Registry, so projected. Its refusals — the fourteen of 38 §2.3, which include `PATTERN_OVER_CAP`, `FIELD_UNKNOWN`,
`ENUM_VALUE_UNKNOWN`, `SERIES_HAS_NO_TEXT` and `PREDICATE_CYCLE` — are re-pathed to the site and appended. What the
grammar cannot know is checked here: `near` in a rule, `immutable_when`, `match` or `skip` is refused at the site
(34 §1.8), and a single-leaf site must be a leaf, not a group.

The checks, in 04 §5's row order. B = one declaration alone · C = the Registry · D = `installed`.

1. `KIND_UNKNOWN` — A (§5.2 step 2).
2. `FIELD_TYPE_UNKNOWN` — B. `found` outside the sixteen + `list`; `fix` names the nearest: a synonym table first
   (`currency→money string→text number→decimal integer→int boolean→bool date→day datetime→instant timestamp→instant
   markdown→document link→url reference→ref attachment→file image→file password→secret array→list object→json`), else
   Levenshtein ≤ 2 over the seventeen, else no suggestion.
3. `FIELDS_OVER_CAP` — B. `fields.length > 64`.
4. `INDEXES_OVER_CAP` — B. Count of fields with `index` or `unique` true > 8 (`key:` is one index and does not count — §13 D7).
5. `PATTERN_OVER_CAP` — via `where.validate`; and B for an `expect` string operator > 40 bytes (47 §4.1). An extractor anchor
   or literal > 200 bytes is `OUT_OF_BOUNDS`.
6. `METRIC_NEEDS_TARGET_OR_WINDOW` — B. Before the generic missing-key mapping: `target` or `window` absent → this code, 04 §5's sentence.
7. `MIXED_CURRENCY` — C/D. For every aggregation over a `money` field (not `count`): the field is *pinned* if a leaf of the
   root `all:` compares that field against a money literal (its `currency`), or the operand is a row-level `product` with
   a `lookup`. Unpinned and `installed.units['reg.field'].length > 1` → refuse, naming the count. Offline: pass.
8. `CONTRAST_FLOOR` — not raised here; `theme`'s, merged by `record`.
9. `REQUIRED_ON_POPULATED` — D. An upgrade whose new body sets `required: true` without `default` on a field the installed body
   had as not-required or lacked, and `installed.rows[register] > 0` → refuse with the row count.
10. `ID_RENAMED` — D. An upgrade that retires declaration X and adds Y of the same kind where `jcs(X.body minus its kind key)
    === jcs(Y.body minus its kind key)` → refuse. `ponytail:` exact-body heuristic; anything else is a retire plus an add.
11. `COLOUR_OUTSIDE_THEME` — B. In every non-theme declaration: a key named `colour`/`color`, or a string value matching `Colour`.
12. `DEPENDENCY_UNRESOLVED` — C/D. (a) `requires.packs[p]`: not in `installed.packs`, or its version outside the range.
    (b) A page block `source: register.x` with `register.x ∉ page.requires`. (c) Any `register.<id>` this pack reads or
    references — page `requires`, block/section `source`, `ref.register`, `lookup`, rule `register`, `create.register`,
    `writes.register` — whose owner is another pack not named in `requires.packs`. Offline, (a) and the installed half of (c) pass.
13. `CREATE_UNBOUNDED` — B. `create` without `bound`, before the generic missing-key mapping.
14. `CREATE_OVER_BOUND` — C. Every `each` field is an enum → product of `values.length` > `bound`. A list field: unbounded, run time decides.
15. `CREATE_FOREIGN_REGISTER` — C. `create.register`'s owner is not this pack; also a seed's register (§5.2 step 5).
16. `TRANSITION_ILLEGAL` — C. `move: v`: with `transitions` declared on `state`, the states `when` pins (`{ field: state, is | in }`
    in the root `all:`) must each allow `→ v`; with none pinned, some state must. `v ∉ values` → `ENUM_VALUE_UNKNOWN`.
17. `GROUP_BY_TWICE` — B. `group_by` is a list.
18. `GROUP_BY_CARDINALITY` — C/D. `enum`: `values.length > 50`. `ref`: `installed.rows[target] > 50`, unless the record already holds this metric with the same `group_by`, so rows added since never block an update. Text: unbounded, render truncates.
19. `RATIO_MIXED_SOURCE` — B. A `where` or `source` key inside an operand (§4.9).
20. `RATIO_MIXED_CURRENCY` — C/D. `ratio` of two money operands: each pinned or single-valued in `units`, and equal; else refuse.
21. `QUANTITY_MIXED_UNIT` — C/D. As 7 over `quantity` fields and `unit`.
22. `STATE_NOT_ENUM` — B.
23. `FORMAT_OUT_OF_RANGE` — D. `requires.format > installed.format`.
24. `PRIMITIVES_OUT_OF_RANGE` — D. `requires.primitives > installed.primitives`.
25. `BAND_EDGES_MISMATCH` — B.
26. `SERIES_HAS_NO_TEXT` — via `where.validate` (38 §2.3), whose `RegisterSchema.series` this package sets.
27. `REQUIRED_WHEN_OP_UNSUPPORTED` — B.
28. `PREDICATE_CYCLE` — via `where.validate` over `RegisterSchema.predicates` (38 §2.3).
29. `SEQ_PREFIX_TAKEN` — C/D. A non-`#` prefix equal to `D` `SG` `S` (`S` only when the declaration is not `register.session`), to another register's in the pack, or to an installed register's, or one that such a prefix followed by a number spells.
30. `SEARCH_FIELD_TYPE` — B.
31. `FIELD_TYPE_CHANGED` — D. An upgrade where a field id persists with a different `type` (or `of.type`) and `installed.rows[register] > 0`.
32. `PROVIDES_MISMATCH` — A (§5.2 step 4).
33. `PLAN_STALE` — install (§5.5).
34. `PACK_MALFORMED` (§13 D4) — A/B: everything §5.1–§5.2 and the shape rules of §4 marked with it.
35. `PROVIDES_CONFLICT` (§13 D4) — C. An installed active declaration with this id and another `pack_id` (`NULL` counts — an
    in-app declaration is the person's). Reported in `Diff.conflicts` and refused by `install`.
36. `REMOTE_ASSET` (§13 D4) — B. In any string of any declaration or seed: `url(` `image(` `element(` `attr(` `var(` `\`, a `<script`
    `<iframe` `<img` `<link` `<style` `<object` `<embed` tag, an `http://` URL, a `data:` `javascript:` `file:` scheme, or a
    markdown image `![`. `fetch.base` and `probe.path` are exempt from the URL rule and bound by `Origin`.
37. `SECRET_IN_PACK` (§13 D4) — B. A string matching `^(sk_live_|sk_test_|rk_live_|ghp_|github_pat_|phx_|vcp_|xoxb-|xoxp-|AKIA[0-9A-Z]{16})`
    (25 §7 rule 3); a header named `authorization cookie host content-length referer origin x-forwarded-*` (47 §8); a
    `create.fields` or seed key whose field is `secret` or `file`.
38. `WOULD_ORPHAN` (§13 D4) — D. A `retires` entry for a register with `installed.rows > 0` — every downgrade, and an upgrade
    that drops a register. Reported in `Diff.retires`/`orphans` and refused by `install` while v1 has no `--force` (48 §13 D12).
39. The scope rules (§4.4), B and D, borrowing `DECLARATION_INVALID`, `FIELD_UNKNOWN` and `ENUM_VALUE_UNKNOWN`: `scopes` names
    `list<text>` fields of its own register, never on a series, and one active register in the Registry declares it; a field's
    `scope` sits on a `ref` or `list<ref>` to that register, `widen` and `same` on a ref and `links` on a list, one per register.
40. The field rules (§4.4), B: `min`/`max` bound a type that has a size and hold their own `default` (`OUT_OF_BOUNDS`,
    `VALUE_MALFORMED`; `NOT_IN_THIS_BUILD` on `url email json list`); `required_when` compares one `text enum bool int` field by
    `is` (`FIELD_UNKNOWN`, `ENUM_VALUE_UNKNOWN`, 27's `REQUIRED_WHEN_OP_UNSUPPORTED`); a field's and a move's `by` is `decide`
    (`ENUM_VALUE_UNKNOWN`), and a move's `requires` names fields of the register (`FIELD_UNKNOWN`); and a `secret` field takes no
    value but the Keychain door's (`DECLARATION_INVALID`, `SEARCH_FIELD_TYPE`).

Borrowed at install, "one code, two moments" (30 §6's `TRANSITION_ILLEGAL` precedent): `FIELD_UNKNOWN` (an unknown key,
or a named field the register lacks), `REQUIRED_MISSING` (a required key absent), `ENUM_VALUE_UNKNOWN` (a closed-list
miss, a `default` or `move` outside `values`), `OUT_OF_BOUNDS` (a numeric or length bound, both bounds named),
`REGISTER_UNKNOWN` (a referenced register in no registry), `INT_OUT_OF_RANGE` (§5.1), `VALUE_MALFORMED` (41 §6 — a value that
is not its key's shape: a wrong scalar type, a failed identifier or duration grammar). `UNIQUE_VIOLATION` — an index created
over rows that already repeat a value — is the kernel's, inside `installDeclarations` (41 §5.6); lint does not pre-empt it.

Complexity: O(n + m + p·f) for n pack declarations, m installed, p predicate sites of f leaves; every lookup is a `Map`.

### 5.4 · Plan — `plan.ts`

`plan(pack, installed)`:

1. `refusals = lint(pack, installed)`; any → return them.
2. `requires`: `format`/`primitives` as `{ wants, have, ok }`; each `packs[p]` with the installed version and `satisfies(range)`.
3. For each declaration `d`: no active installed row with `d.id` → `adds` with `summarise(d)`. Installed with `pack_id === pack.id`:
   `d.canonical === row.body` → nothing; else `changes` with `diffSummary(kind, old, new)`, `applied: true`, plus — for a
   page whose `nav` differs — one more line `nav <field> a → b`, `applied: false` (19 §3: an update never moves nav). Installed
   with another `pack_id` → `conflicts`.
4. `retires`: active installed rows with `pack_id === pack.id` whose id the pack no longer declares, with `installed.rows[register] ?? 0`.
   `orphans` = the sum over retired registers.
5. `seeds` from the manifest; `spawns` from every `create` (`when` rendered as `<field> <op> <value>` of the first root leaf);
   `calls_out` from every `channel: pull` (`host = new URL(base).host`, `every`, `grant`, `require_scopes`, `body` when present);
   `interrupts` = rules with a `notify` whose `urgent` is true.
6. `warnings`: a non-series register without `one:`; a declared register with no seed.
7. `direction`: no installed pack → `install`; `semver.compare(new, installed)` `> 0` → `upgrade`, `< 0` → `downgrade`, `0` → `reinstall`.
8. `base` = `{ format, primitives, packs: sorted [id, version], declarations: sorted [id, version, checksum] }` over *all* of `installed`.
9. `planHash = installed.record_version + '.' + hex(sha256(jcs({ pack: pack.checksum, base })))` where `pack.checksum = await checksum(pack.canonical)`.
   The integer prefix is what the kernel's `planVersion` CAS compares (§5.5); the hash half is what catches a pack edited between plan and install.

`summarise`: register `"<n> fields"` · page `"<n> blocks, nav → <section>/<order>"` or `"<n> blocks"` · metric `"target: <target>, window: <w>"` ·
rule `"when <leaf> → <actions joined by +>"` · ingest `"<channel>, writes register.<r>"` or `"pull <host> every <every>, writes series.<s>"` ·
block `"<primitive>, accepts <names>"` · theme `"<scheme>, <n> roles set"` · digest `"<day> <at>, <n> sections"`. `diffSummary`:
registers list `+<n> fields`, `<n> retired`, `index: <f>` / `unindexed: <f>`; pages `+/−<n> blocks`; anything else `body changed`.

### 5.5 · Install — `install.ts`

`install(diff, host, approved)`. `diff` is the plan the record computed *now*; `approved` is the `planHash` the caller saw. The
SQL — declaration rows, supersession, counters, the index families, the pack row, the events, `PLAN_STALE`, `UNIQUE_VIOLATION` —
is the kernel's `installDeclarations` (41 §5.6). This function builds its batch and refuses what the kernel cannot see.

1. `diff.conflicts.length > 0` → one `PROVIDES_CONFLICT` per conflict. Nothing is called.
2. `diff.orphans > 0` → one `WOULD_ORPHAN` per retired register with rows. v1 has no `--force` (48 §13 D12); the diff has shown the count.
3. `diff.planHash !== approved` → `PLAN_STALE`, fix `the pack or the record changed since this plan was made. Plan again` — the
   pre-check, which also sees an edited pack. The atomic check is the kernel's `planVersion` CAS in step 5.
4. Build the `InstallBatch`:
   - `declarations` = every add and change, in pack order, as `{ id, kind, body, pack_id: pack.id }` — `body` with its predicates
     already flattened (§5.2); the kernel canonicalises and hashes it;
   - `retire` = `diff.retires[].id`;
   - `seeds` = every seed as `{ register, fields: { …fields, tags: [...(fields.tags ?? []), 'example'] } }` — the register's `tags`
     field (§13 D9); the kernel writes them after every declaration row, in manifest order, with `cascade = false`;
   - `pack` = `{ id, version, source: source.kind, source_ref: source.ref ?? null, manifest: pack.manifest, checksum: diff.pack.checksum }`;
   - `planVersion` = the integer before the `.` in `approved`.
5. `result = await host.installDeclarations(batch)`. The kernel runs 41 §5.6 in one transaction: the pack row, one new version per
   declaration with `superseded_at` on the prior, `counter` rows, the index families of §13 D8, the retirements, the seeds through
   the write path, one `install`/`upgrade`/`declare` event per declaration and one `retire` per retirement. A refusal anywhere —
   a seed's `REQUIRED_MISSING`, an index over duplicates, a record that moved — rolls all of it back.
6. `result.ok` → `Applied { pack, version, declarations: batch.declarations.length, seeds: batch.seeds.length, versions }`; else the
   kernel's refusals, a seed's re-pathed to `seeds[j].fields.<f>`.

Nav is not written here. A page's `nav` travels inside its body; the record's per-user position store (19 §3 rule 3) reads a pack's
suggestion once, at first placement, and never again — so a changed `nav` in an upgraded body is inert without special-casing.

### 5.6 · Uninstall

`uninstall(packId, host)`:

1. `active = host.declarations().filter(d => d.pack_id === packId)`; none → `DEPENDENCY_UNRESOLVED` at `pack`, fix `<id> is not installed`.
2. `rows_kept[register] = host.count(register)` for every active `register` declaration.
3. `host.retireDeclarations({ ids: active.map(d => d.id), pack: packId })` — the kernel sets `retired = 1` on each, drops the
   registers' index families, deletes the `pack` row, writes one `retire` event per declaration and one `uninstall` event (41 §5.6).
4. Return `{ pack: packId, declarations: active.length, rows_kept }`.

Rows stay (04 §4). Reinstalling inserts new active versions — and recreates the indexes — and the orphaned rows are visible
again; nothing is re-adopted, because they were never anything but rows under a register id.

### 5.7 · Upgrade and downgrade

The same `plan` and `install`. `direction` is informational; `retires` and `orphans` are not: a version that retires a register
with rows under it — every downgrade, and an upgrade that drops a register — is refused `WOULD_ORPHAN` in v1, because `--force`
is not a v1 flag (48 §13 D12) and the alternative is silent orphaning. The diff still shows `RETIRES` and the row count, so the
author knows what to change. There is no automatic update path in this package (ADR-048).

### 5.8 · Checksums and `jcs`

`jcs` is `@braindog/where`'s (the function its `print` is built on — §12): recursively sort object keys (default code-unit
order), then `JSON.stringify` — RFC 8785 for every value JSON can hold, because ECMAScript number and string serialisation are
what the RFC specifies. `checksum(body) = hex(await
crypto.subtle.digest('SHA-256', utf8(jcs(body))))`. `pack.checksum` is over `pack.canonical`; `declaration.checksum` over `declaration.canonical`.

### 5.9 · Valibot issues → refusals

Every action in `schemas.ts` sets its `message` to the refusal code it means, so the mapping is one lookup:

| Valibot issue | Code | `fix` |
|---|---|---|
| unknown key (`strict_object`) | `FIELD_UNKNOWN` | `<path>: '<key>' is not a key here. Keys: <the object's keys>` |
| `non_optional` missing | `REQUIRED_MISSING` | `<path> needs <key>` |
| `picklist`, `literal`, `union` of literals | `ENUM_VALUE_UNKNOWN` | `<path>: '<found>' is not one of <list>` |
| `min_value` `max_value` `min_length` `max_length` `integer` | `OUT_OF_BOUNDS` | `<path>: <found>; the bounds are <min> and <max>` |
| `regex`, wrong scalar type (`string` `number` `boolean` `array` `object`) | `VALUE_MALFORMED` (41 §6) | `<path>: '<found>' — <wanted> was expected` |
| `check` with a code message | that code | 04 §5's sentence, identifiers substituted; `PACK_MALFORMED` for the structural rules of §4 |

`at` = `prefix + issue.path` rendered `a.b[3].c`; `found` = `issue.input` (truncated to 80 chars, never a whole body); `wanted` = `issue.expected`.

---

## 6 · Refusals and errors

Every code `declare` raises, the moment it is raised (§5 step), and the `fix` sentence — 04 §5's copy verbatim, identifiers
substituted for the pack at hand. `at`, `found` and `wanted` carry the specifics; `fix` is what a person reads.

| Code | Raised at | `fix` |
|---|---|---|
| `KIND_UNKNOWN` | §5.2·2 | `declarations[3]: kind 'widget' is not one of the eight` |
| `FIELD_TYPE_UNKNOWN` | §5.3·2 | `register.invoices.fields[4].type 'currency' — did you mean 'money'?` |
| `FIELDS_OVER_CAP` | §5.3·3 | `register.wide: 71 fields. The ceiling is 64 — a register with more than that is a database, not a register.` |
| `INDEXES_OVER_CAP` | §5.3·4 | `register.invoices: 11 indexed fields; the ceiling is 8` |
| `PATTERN_OVER_CAP` | `where.validate`; §5.3·5 | `rule.x.when — the 'starts' pattern is 63 bytes. The cap is 40. Use 'matches', which searches the full-text index instead.` |
| `METRIC_NEEDS_TARGET_OR_WINDOW` | §5.3·6 | `metric.unpaid: a number with no target is decoration; a number with no comparison window cannot be acted on` |
| `MIXED_CURRENCY` | §5.3·7 | `metric.total: sums register.obligations.amount across 3 currencies. Name an fx source and date, or scope the predicate to one currency` |
| `CONTRAST_FLOOR` | `theme`, merged by `record` | `theme.midnight — the pair (faint on s3) is 3.61:1. Body text needs 4.5:1. Lighten faint to at least #8E9C96, or use it only above 24px.` |
| `REQUIRED_ON_POPULATED` | §5.3·9 | `register.obligations.vat is required and 412 rows lack it. Ship a default or a fill rule` |
| `ID_RENAMED` | §5.3·10 | `register.obligations → register.bills renames a spoken id. #125 in a note would stop resolving` |
| `COLOUR_OUTSIDE_THEME` | §5.3·11 | `block.invoice-card sets 'colour: #E11D48'. A block names intent — good, warn, bad, info — and the theme names appearance.` |
| `DEPENDENCY_UNRESOLVED` | §5.3·12; §5.6 | `requires packs.people ^1 — not installed. Install people first, or use --with-deps` |
| `CREATE_UNBOUNDED` | §5.3·13 | `rule.expand-size-run: create has no bound. A generator with no ceiling fills the record` |
| `CREATE_OVER_BOUND` | §5.3·14 | `rule.expand-size-run: sizes (8) × colours (12) = 96 exceeds bound 60` |
| `CREATE_FOREIGN_REGISTER` | §5.3·15; §5.2·5 | `rule.x writes register.invoices, declared by freelancer-uk. A pack generates only into its own registers` |
| `TRANSITION_ILLEGAL` | §5.3·16 | `rule.close-early: state cannot move draft → void. Legal from draft: posted` |
| `GROUP_BY_TWICE` | §5.3·17 | `metric.spend: group_by takes one field. Two dimensions is a report generator` |
| `GROUP_BY_CARDINALITY` | §5.3·18 | `metric.by-client: group_by client has 412 possible values; the ceiling is 50` |
| `RATIO_MIXED_SOURCE` | §5.3·19 | `metric.roas: both operands must share one source and one predicate` |
| `RATIO_MIXED_CURRENCY` | §5.3·20 | `metric.roas: revenue is USD, spend is EGP. Name an fx source, or scope the predicate to one currency` |
| `QUANTITY_MIXED_UNIT` | §5.3·21 | `metric.fabric: sums consumption across m, cm and g. Scope the predicate to one unit` |
| `STATE_NOT_ENUM` | §5.3·22 | `register.x.state: state is a reserved id and is always an enum` |
| `FORMAT_OUT_OF_RANGE` | §5.3·23 | `requires format 2; this record is format 1. Update BrainDog` |
| `PRIMITIVES_OUT_OF_RANGE` | §5.3·24 | `requires primitives 2; this record renders primitives 1. Update BrainDog, or ask the author for a primitives-1 build` |
| `BAND_EDGES_MISMATCH` | §5.3·25 | `register.leads.tier: band has 3 edges and 5 values. n edges need n+1 values` |
| `SERIES_HAS_NO_TEXT` | §5.3·26 | `metric.spend.where: 'contains' over register.campaign_day, which is series: true. A series has no text` |
| `REQUIRED_WHEN_OP_UNSUPPORTED` | §5.3·27 | `register.leads.tier_why.required_when: 'matches' needs the index, not a row. Use is, in, gt, before, empty, present, has…` |
| `PREDICATE_CYCLE` | §5.3·28 | `register.invoices.predicates.overdue references unpaid, which references overdue` |
| `SEQ_PREFIX_TAKEN` | §5.3·29 | `register.leads: seq_prefix 'LN' is taken by register.learnings. D, SG and S are the kernel's` |
| `SEARCH_FIELD_TYPE` | §5.3·30 | `register.invoices.search names amount, which is money. search: takes text, document, enum, url, email and list<text>` |
| `FIELD_TYPE_CHANGED` | §5.3·31 | `register.obligations.amount: text → money changes a type. Retire the field and add a new one` |
| `PROVIDES_MISMATCH` | §5.2·4 | `provides lists register.fx; no declaration provides it` |
| `PLAN_STALE` | §5.5·3 here; the kernel's CAS, 41 §5.6 | `the record changed since this plan was made — 2 declarations differ. Plan again` — the count is the kernel's, from the `declare`/`retire` events after `planVersion`; the pre-check says `the pack or the record changed since this plan was made. Plan again` |
| `PACK_MALFORMED` *(new, §13 D4)* | §5.1; §5.2; the structural rules of §4 | `pack.yaml#14:3: mapping values are not allowed here` · `declarations[5]: register.accounts is declared twice` |
| `PROVIDES_CONFLICT` *(new)* | §5.3·35; §5.5·1 | `register.obligations is provided by money-core 1.4.0. Two packs cannot provide one id — uninstall money-core, or rename the register` |
| `REMOTE_ASSET` *(new)* | §5.3·36 | `page.invoicing.blocks[2].body loads https://…/pixel.png. A pack loads no remote asset — an image URL is a callback with the record id in it` |
| `SECRET_IN_PACK` *(new)* | §5.3·37 | `ingest.stripe.fetch.headers.Authorization: a pack never spells a credential. Name a grant under auth: and the kernel sends the header` |
| `WOULD_ORPHAN` *(new)* | §5.3·38; §5.5·2 | `register.clients would be retired with 38 rows under it. A downgrade needs --force, which v1 does not have — upgrade instead, or export first` |
| `REGISTER_UNRESOLVED` *(new, 2026-09-15)* | `plan` reports it as `Diff.unresolved`; `install` refuses it after the missing-pack check, and the record's `planPack` refuses it too | `money-core points at the people list (register.obligations.fields.party.to), which this record does not hold and money-core does not declare. It also points at things. Install people and portfolio first: they declare people and things.` |
| `CONFIG_TYPE_UNSUPPORTED` *(new, 2026-09-15)* | `normalise`, through the kernel's `readConfig` | `The setting billing_contact is a ref, and a setting never points at a list, so a pack cannot configure its way into one it did not declare. A setting is text, enum, bool, money, day, duration, number or list.` |

Forty, counted: 04 §5's thirty-three, the five of §13 D4, and the two of the 2026-09-15 pack settings build. Borrowed from other groups of 30 §6 and raised here at install:
`FIELD_UNKNOWN` · `REQUIRED_MISSING` · `ENUM_VALUE_UNKNOWN` · `OUT_OF_BOUNDS` · `REGISTER_UNKNOWN` · `INT_OUT_OF_RANGE` ·
`VALUE_MALFORMED` (§5.3), and the fourteen `where.validate` raises (38 §2.3). The kernel raises `UNIQUE_VIOLATION` and its own
`PLAN_STALE` inside `installDeclarations`, and a seed can surface any write-path code, re-pathed to `seeds[j].fields.<f>`. No code
outside 30 §6 as amended by §13 exists in this package; a test greps for it (§9).

---

## 7 · Performance budget

| Number | Value | Measured by |
|---|---|---|
| Pack text | ≤ 64 files · ≤ 1 MB each · depth ≤ 32 · ≤ 256 declarations | §5.1 refusals; `test/limits.test.ts` |
| Schema construction at module load | ≤ 10 ms, all nine schemas — Valibot's measured 0.87 ms cold start per schema module (31 §9) | `performance.now()` around `await import('../src/schemas.ts')`, Node 24.13, CI runner; fails above 25 ms |
| `parsePack` + `normalise`, 50 declarations (~40 KB YAML) | ≤ 15 ms | `test/perf.test.ts`, median of 20, fails above 2× |
| `lint`, the same pack against an `Installed` of 200 declarations | ≤ 50 ms | same |
| `plan`, same | ≤ 60 ms + one SHA-256 | same |
| `install`, 50 declarations · 30 indexes · 12 seeds, `node:sqlite` `:memory:` | ≤ 250 ms — the kernel's `installDeclarations` and the seeds' write path dominate; this package's share is the batch, < 5 ms | same, with the kernel as a dev dependency |
| Refusals per call | ≤ 50; `found` ≤ 80 chars | §5.2·6 |
| `@braindog/declare` in the browser | ≤ 30 kB gzip (Valibot 2.1 kB + the schemas); `./yaml` adds the `yaml` browser build, loaded by `import()` on first paste | `apps/web`'s `bundle` gate (33 §8) |
| Valibot per object | 6.1 µs valid · 3.0 µs invalid (31 §9) | inherited; a 50-declaration pack is ~1,500 objects ≈ 9 ms worst case |

Nothing here runs on a request path except `normalise` + `plan` + `install` inside `planPack`/`installPack`, which are
ADMIN calls a person makes a few times a month.

---

## 8 · Security

A pack is text somebody else wrote. Four boundaries, each with its check on the near side:

| Boundary | Crosses | Checked by |
|---|---|---|
| YAML text → JSON | the CLI's file/URL/git fetch; the web app's paste box, client-side | §5.1: size, depth, one document, no alias, no tag, string keys, finite numbers. `yaml` runs with `maxAliasCount: 0` — no billion laughs |
| JSON → the record (`planPack`/`installPack` args) | HTTP, from a browser session only (30 §5 ADMIN) | the record calls `normalise` on what it receives and never trusts the client's `Pack`; the Worker bundle contains no YAML parser — `tools/gates/graph.mjs` fails if `yaml` is reachable from `apps/worker` or `packages/record` |
| `Installed` → `plan` | the record's own reads | trusted; built from SQL, never from the caller |
| `Diff` → `install` | the record's own object, recomputed at install | `planHash` ties it to the declaration state and the pack checksum; `approved` is the only caller-supplied input and it is compared, never parsed beyond its version prefix |

What lint refuses on principle, from 04 §7's enumeration: any remote asset, raw markup or non-`https:`/`mailto:` scheme in
any string (`REMOTE_ASSET`); any colour, font or spacing key or literal outside a theme (`COLOUR_OUTSIDE_THEME`, unknown-key
refusal); any outbound host other than one literal `fetch.base` `Origin` per pull ingest, with `probe` on the same origin
(`Origin`, `Placeholder`; `for_each` is not a v1 key — 47 §13 D7); a reserved header and any credential-shaped literal
(`SECRET_IN_PACK`); a `create` or seed into a `secret` or `file` field; a `create` into a register the pack does not own; a rule
action outside the ten; a `where:` beyond the grammar. The install diff surfaces every host statically in `calls_out` — host,
interval, grant, scopes, and the whole request body when there is one (25 §7 rule 9).

What never happens in this package: `new Function`, `eval`, a `RegExp` built from pack text (every regex is a module constant),
a string from a pack spliced into SQL — this package emits no SQL; the kernel's DDL (41 §5.6) receives register and field ids
that matched `Id` here, and values only as bound parameters. Nothing is written to a log but `code` and `at`; a refusal's `found`
is truncated and a body is never echoed (12 §8). The only rows an install causes are seeds, through the kernel's write path
with `cascade = false`, tagged `example` so digests and notifications skip them (19 §6) and one predicate clears them (02 §1).
Who may call `install` is the record's concern (a browser session, ADR-060); `declare` assumes it is already true.

---

## 9 · Tests and gates

`node --test`, `node:assert/strict`, `test/**/*.test.ts`. One stock record, `test/installed.json`: format 1, primitives 1,
`money-core 1.4.0` and `people 1.0.0` installed, `register.obligations` with 412 rows in three currencies,
`register.learnings` with `seq_prefix LN`, `register.clients` with 38 rows, `record_version 184233`.

| File | Input → expected |
|---|---|
| `yaml.test.ts` | one pack written flow-style and block-style with shuffled keys → equal `pack.canonical` · an alias → `PACK_MALFORMED` · a `!!str` tag → `PACK_MALFORMED` · two documents → `PACK_MALFORMED` · a duplicate key → `PACK_MALFORMED` at its `line:col` · 1,048,577 bytes → `PACK_MALFORMED`, `found` the byte count · `.inf` → `PACK_MALFORMED` · `9007199254740992` → `INT_OUT_OF_RANGE` · a key `1:` → `PACK_MALFORMED` · **property**: random `Json` (string keys, finite numbers, no `-0`) → `toJson(parse(yaml.stringify(j)))` deep-equals `j`, 1,000 runs, failing `{ seed, path }` committed under `test/seeds/` |
| `refusals.test.ts` | for each of the thirty-eight codes in §6: `REFUSALS[kebab]` (40 §6's shape — `code`, `via`, `at`, `found?`, then `pack:` alone for `via: lint`, `pack:` + `installed:` + `facts:` for `via: install`) → `normalise(fixture.pack)`, then `lint(pack, null)` for a `lint` fixture, or `plan` against an `Installed` built from `installed` and `facts` for an `install` fixture (`PROVIDES_CONFLICT` and `WOULD_ORPHAN` through `install` with a `Host` that records calls and makes none) → exactly one refusal, its `code` and `at` equal to the file's, `found` when the file names it · the codes iterated equal `PACK_CODES`, which the `refusal-fixtures` gate reads · of D4's five, `PACK_MALFORMED` `REMOTE_ASSET` `SECRET_IN_PACK` are `via: lint`, `PROVIDES_CONFLICT` `WOULD_ORPHAN` are `via: install`; `PLAN_STALE` stays `via: rpc` (40 §6) and this package tests its pre-check with `install(diff, host, 'other')` |
| `golden.test.ts` | each `PACKS[id]` — the six first-party packs and `freelancer-uk`, read with `text()` → `parsePack` then `lint` returns `[]` against the stock record · every written `provides` equals the derived list · `provides-mismatch` fixture (lists `register.fx`) → `PROVIDES_MISMATCH` at `provides[…]` · `format-out-of-range` fixture (`requires.format: 2`) → `FORMAT_OUT_OF_RANGE` with 04 §5's sentence |
| `plan.test.ts` | `freelancer-uk 2.1.0` fresh → `Diff` deep-equals `expected/freelancer-uk.install.json`: six adds with the summaries of 04 §3 (`11 fields` · `6 fields` · `4 blocks, nav → Money/20` · `target: 0, window: 90d` · `when overdue > 14d → notify + tag` · `webhook, writes register.invoices`), `conflicts []`, `seeds.count 2`, `spawns []`, `touches { 0, 0 }`, every `requires` line `ok` · `2.0.0 → 2.1.0` where 2.1.0 moves `page.invoicing` nav 20 → 12 and adds `register.clients` → `direction 'upgrade'`, `changes` contains `{ id: 'page.invoicing', summary: 'nav order 20 → 12', applied: false }`, `adds` contains `register.clients` · `2.1.0 → 2.0.0` (2.0.0 lacks `register.clients`, 38 rows) → `direction 'downgrade'`, `retires [{ register.clients, 38 }]`, `orphans 38` · the same inputs twice → equal `planHash`; one installed checksum changed → different `planHash`; the prefix equals `record_version` · a pack whose `register.obligations` collides with `money-core`'s → `conflicts [{ register.obligations, money-core, 1.4.0 }]` · a rule with `urgent: true` → `interrupts [rule id]` · a pull ingest → `calls_out [{ host 'api.stripe.com', every '24h', grant 'stripe-read', scopes […] }]` |
| `install.test.ts` — `@braindog/kernel` (`openRecord` on `node:sqlite` `:memory:`, migration 0001) as a dev dependency, its four methods bound into a `Host` | install the golden pack → one `declaration` row per declaration, `version 1`, `checksum === await checksum(canonical)`, one `pack` row, `sqlite_master` holds `entry_i_invoices__due` and `entry_u_…`, seeds present with `tags` containing `example`, one `install` event per declaration (41 §5.6) · `approved` = a foreign hash → `PLAN_STALE` from the pre-check, `installDeclarations` never called · `approved` with a stale prefix → the kernel's `PLAN_STALE`, every table's row count unchanged · a conflict → `PROVIDES_CONFLICT`, nothing written · a retire over rows → `WOULD_ORPHAN`, nothing written · a seed missing a required field → `REQUIRED_MISSING` at `seeds[0].fields.<f>`, zero declaration rows (rollback) · upgrade → `version 2` rows active, `superseded_at` on `version 1`, `upgrade` events with `from_v` · uninstall → `retired = 1` on every active row, `entry` counts unchanged, `pack` row gone, the pack's indexes gone, one `uninstall` event, `Retired.rows_kept` matches · reinstall after uninstall → `version 3` active, the indexes back; the kernel's `list` returns the orphaned rows again |
| `schemas.test.ts` | `await import('../src/schemas.ts')` ≤ 25 ms (budget 10) · every export is a constructed schema, not a function · the page block `kind` picklist equals `Object.keys(KINDS)` — sixteen — plus declared blocks · every closed list in §4 has the count 34 §6 states — the `closed-lists` gate reads this file |
| `limits.test.ts` · `perf.test.ts` | the rows of §7, each as one assertion |
| `codes.test.ts` | a grep of `src/**` finds no `UPPER_SNAKE` refusal code outside 30 §6 as amended by §13 D4 |

CI rows this package feeds (33 §8): `refusal-fixtures` · `closed-lists` · `graph` (no `yaml` reachable from `apps/worker` or
`packages/record`) · `clean-room`.

---

## 10 · Deliberate ceilings

- `ponytail:` one 800-line `schemas.ts`; split per kind when a kind passes ~250 lines or a consumer needs one kind alone.
- `ponytail:` refusals are collected then capped at 50; stream them when a fixture legitimately needs more.
- `ponytail:` `ID_RENAMED` is an exact-body heuristic (id key removed, bodies equal); a fuzzier match when a real rename slips past it.
- `ponytail:` `Range` has no `||` and no `x`-ranges; add them when a Kennel pack needs one.
- `ponytail:` offline lint skips stage D and runs no theme check — the CLI's graph row (31 §2 #12) has no `theme`; add it there when a theme author asks for offline contrast.
- `ponytail:` `MIXED_CURRENCY` / `QUANTITY_MIXED_UNIT` / `GROUP_BY_CARDINALITY` read `Installed.units` and `rows` over *all* live rows, not the rows the predicate selects; compute over the predicate when a false refusal is reported.
- `ponytail:` staleness is the kernel's `record_version` CAS (41 §13 #17), so an agent's row write between plan and install is `PLAN_STALE` and one re-plan; a declaration-state CAS if that ever bites — the `base` hash is already in the token.
- `ponytail:` `diffSummary` says `body changed` for every kind but register and page; per-kind summaries when the diff screen needs them.
- `ponytail:` no `inputs:` key and no `!input` substitution; add with the pack builder (21 §9).
- `ponytail:` two warnings only (`one:` absent, a register with no seed); a warnings vocabulary when a third is needed.
- `ponytail:` a seed carries no `ref`, `secret` or `file` value, and that stands. A first-party use case links its examples after the install instead, outside this package and the kernel: the installer that put them in (onboarding, or an accepted proposal through the catalogue entry's `afterInstall`) finds each example row by its title and sets the link through the ordinary write path, only on a row marked `example` whose field is empty, skipping a refused write (`packages/seed/src/usecases/links.ts`). `$seed:<register>` references in the format when a pack from outside needs a linked example.
- `ponytail:` `FIELD_TYPE_UNKNOWN`'s suggestion is a sixteen-entry synonym table plus Levenshtein ≤ 2.
- `ponytail:` `license` and `Tz` are checked by syntax, not against the SPDX list or the IANA database.
- `ponytail:` `checksum` is WebCrypto and async, so `plan` and `install` are async; a 60-line pure SHA-256 if a synchronous path is ever needed.
- `ponytail:` `Host` is the one structural interface in the package — the kernel's four declaration methods with the `CallContext` bound — so `declare` never imports `kernel` or `ports`; it has one implementation (the record's object literal) and exists only for the graph.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | `valibot` | 1.4.2, MIT, zero dependencies | the closed schemas — ADR-040, 31 §9 |
| runtime, `./yaml` subpath only | `yaml` | 2.9.0, ISC, zero dependencies, browser export | the one YAML parse — §13 D1, ADR-063 |
| runtime, workspace | `braindog-render` | `workspace:*` | `KINDS`, `PRIMITIVES`, `PRIMITIVES_VERSION` |
| runtime, workspace | `@braindog/where` | `workspace:*` | `parse`, `flatten`, `validate`, `INBOX_RAW`, `jcs` |
| dev | `typescript` 6.0.3 · `@types/node` 24.13.0 · `fast-check` 4.9.0 | 31 §3 pins | type-check; the one property test |
| dev, workspace | `@braindog/kernel` · `@braindog/ports` · `@braindog/fixtures` | `workspace:*` | `install.test.ts`; `PACKS`, `REFUSALS`, `text` |

Versions read from the registry on 2026-09-02; `pnpm`'s `minimumReleaseAge: 1440` applies. Node 24.13, `node --test`, no build step.

---

## 12 · Build order

**Needs first**, with the exact exports this spec calls: `braindog-render` — `KINDS: Readonly<Record<Kind, KindSpec>>` (sixteen
keys), `PRIMITIVES` (eight), `PRIMITIVES_VERSION` (36 §2); `@braindog/where` — `parse(input: unknown): Predicate`, `flatten(pred)`,
`validate(pred, schema: RegisterSchema, schemas: Schemas): Refusal[]`, `INBOX_RAW`, the `RegisterSchema` type (38 §2.2–§2.4), and
**`jcs(value: Json): string`** — 38 exports `print(pred)` and 41 §1 already imports `jcs` from `where`; 38 to export the function
`print` is built on. For tests only: `@braindog/kernel` — `openRecord`, `installDeclarations`, `retireDeclarations` (41 §2), with
**two additions to `InstallBatch`** this spec needs and 41 lacks: `retire?: string[]` and `seeds?: { register, fields }[]`, so a
downgrade's retirements and a pack's seeds share the install transaction (04 §3: nothing is left behind); `@braindog/ports`'
`node:sqlite` adapter (37); `@braindog/fixtures` — `PACKS`, `REFUSALS`, `text` (40 §2).

**Interface notes.** 48 §11 names `parsePack(files) → { pack?, refusals }`, `lintPack(pack)` and a synchronous
`packChecksum(pack)`; this spec's are `parsePack(files) → Pack | Refusal[]`, `lint(pack, null)` and the async `checksum` — one of the
two aligns in the next revision. 48 §13 D12 defers `--force` and expects the record to refuse an orphaning downgrade "until the code
exists": the code is `WOULD_ORPHAN` (§13 D4). 43 §13 D6 requires this schema to accept exactly its ingest keys, 47 §4.1 its `FetchDecl`
— §4.7 is written against both. 44 imports the `Refusal` type from here; 50 imports `schemas` and `./yaml`; 40 §6 counts
seventy-five fixtures and gains D4's five.

**Unblocks:** `packages/mcp` (#9 — a `pattern` suggestion body carries an ingest declaration, validated with `schemas.ingest`);
`packages/record` (#10 — `planPack` = `normalise` + `plan`, `installPack` = `plan` + `install`, `uninstallPack` = `uninstall`,
`setDeclaration` through the same schemas); `packages/slash` (#11 — proposes ingest declarations); `apps/cli` (#12 — `pack lint |
plan | install | uninstall`, importing `./yaml`); `apps/web` (#13 — the paste installer through `./yaml` by `import()`, generated
forms from `schemas`). It sits in phase 1 beside the kernel.

---

## 13 · Decisions taken here

| # | Decision | Amend |
|---|---|---|
| D1 | **The YAML parser is `yaml` 2.9.0**, reachable only through the `./yaml` subpath; imported by `apps/cli` and, lazily, by `apps/web`'s paste box; never by `packages/record`, `apps/worker` or the self-host API, which take JSON. Chosen over a hand-written subset: the packs in the corpus use flow mappings, nested sequences, quoted escapes and block scalars, which is 300–400 lines of indentation-sensitive parsing against a zero-dependency parser configured to refuse aliases, tags and multi-documents. **ADR-063 · "One YAML parser, in one subpath, never in the record":** decided as above; rejected a subset parser (a bug farm with a spec) and JSON-only packs (the design's artefact is YAML, 04 §2); reversed by `yaml` gaining a dependency or a CVE its options cannot close | 16 (ADR-063; ADR-046 enumerates `valibot` — chosen by ADR-040 but absent from ADR-046's list — and `yaml`) · 18 §5 · 31 §2 row 7 · 35 §2 |
| D2 | One `schemas.ts` (~800 lines), not `schemas/<kind>.ts`; ceiling in §10 | 31 §8 |
| D3 | `planHash = <record_version>.<sha256hex(jcs({ pack: checksum, base }))>`, `base` the sorted declaration state of §4.12. The integer prefix is the kernel's `planVersion`, whose CAS inside `installDeclarations` is the atomic staleness check (41 §5.6, §13 #17); the hash half catches a pack edited between plan and install, which no version can see | 04 §3 property 3 · 30 §5 · ADR-048 |
| D4 | **Five codes 04 §5's refusals needed and 30 §6 lacked:** `PACK_MALFORMED` (not a well-formed pack: a YAML fault, two kinds or two ids, a structural rule of §4), `PROVIDES_CONFLICT` (an id another pack provides — 04 §2 promised the refusal and coded nothing), `REMOTE_ASSET` and `SECRET_IN_PACK` (04 §7's and 25 §7's enumerations, previously without a code), `WOULD_ORPHAN` (an install that would retire a register with rows under it — 04 §5's downgrade rule with no `--force` in v1, 48 §13 D12). Pack codes 33 → 38; total 75 → 80 before 43's and 47's own additions | 30 §6 · 04 §5 · 33 §8 · 40 §6 |
| D5 | Seven write-path codes are raised at install too, on 30 §6's own "one code, two moments" precedent: `FIELD_UNKNOWN` `REQUIRED_MISSING` `ENUM_VALUE_UNKNOWN` `OUT_OF_BOUNDS` `REGISTER_UNKNOWN` `INT_OUT_OF_RANGE`, and 41 §6's `VALUE_MALFORMED` for a value that is not its key's shape. `UNIQUE_VIOLATION` at install is the kernel's (41 §5.6) | 30 §6 "Raised where" |
| D6 | The `Range` grammar of §4.2; prerelease per SemVer 2.0 §11 | 04 §5 Versioning |
| D7 | `INDEXES_OVER_CAP` counts fields with `index` or `unique`; `key:` is one index and is not counted | 02 §5 caps |
| D8 | Money and quantity index names take a third segment: `entry_i_<reg>__<f>__amount` / `__currency`, `__value` / `__unit` | 34 §4 · 30 §1 |
| D9 | **Seeds:** `seeds: [{ register, fields, note? }]`, at most eight per register, own registers only, no `ref`/`secret`/`file` values; applied after every declaration row, in manifest order, through the write path with `cascade = false`, actor the installer; a refusal rolls the install back. **The `example` marker is the value `example` in the register's `tags` field** — a `list<text>` field named `tags` that a register with seeds, or with a `tag`/`untag` rule action, must declare (`FIELD_UNKNOWN` otherwise): 02 §1 puts the marker in a `list<text>` inside `fields`, 41 K6 admits only declared fields, and the `tag` action names no field, so one conventional field is the only reading that satisfies all three | 04 §2 · 19 §6 · 02 §1 · 07 §6 |
| D10 | Block ids follow `Id`; 22 §3's `burnRate` reads `burn_rate`. For 36: the fence regex `^[a-z]+` admits no pack kind with a digit or `_` — widen it or keep pack kinds page-only | 22 §3 · 34 §2.1 |
| D11 | A pack kind's `accepts` names are legal keys on a page block of that kind, typed as §4.6 (`register metric number text`) | 06 §1.1 · 22 §3 |
| D12 | `install(diff, host, approved)` builds the kernel's `InstallBatch` and calls `installDeclarations`; `uninstall` calls `retireDeclarations`; `Host` is the structural slice of `Kernel` (41 §2) with the `CallContext` bound by the record's `installPack(pack, planHash)`, which re-plans first. No SQL lives in this package | 45 (record) · 41 (`InstallBatch` gains `retire` and `seeds`) |
| D13 | Digest keys typed: `schedule { day?, at, tz? }`, `channels ⊆ in-app email push webhook mcp`, `sections` ≤ 12, `prose: slash` | 09 §6 |
| D14 | Form and `map` shapes follow 43 §4.3–§4.5 exactly (`anchor` inside the form, `lookup: { register, by }`, `first` 2–8, `nth` ≤ 64, `default: { value, of }`); `fetch` follows 47 §4.1 key for key, including 47 D7's four keys that are not v1 | 07 §3 · 25 §3.2 |
| D15 | `metric.name` optional (the id); `note` legal on every declaration, field, block, section and action (21 §11) | 08 §2 · 04 §2 |
| D16 | Uninstall retires every `declaration` row, deletes the `pack` row and drops the pack's index families (41 §5.6); "DELETES nothing" reads "nothing of yours" | 04 §4 |
| D17 | An install whose `retires` carry rows is refused `WOULD_ORPHAN`; when 48's `--force` arrives, a caller that passed it lifts this one refusal and nothing else | 04 §5 Versioning · 48 |
| D18 | A brace group that does not match `Placeholder` is literal text (47 §4.2 — a GraphQL body survives); one `Path` grammar serves `map`, `read`, `probe.read`, `expect` and `page.from`: keys of any character but `.` `[` `]` and whitespace, ≤ 16 segments, `[]` at most once — the union of 43 §4.4 and 47 §4.3 | 25 §3.1 · 43 §4.4 · 47 §4.3 |
| D19 | `redact: bool` on a field (20 §8's per-field redaction, 41 §2's `FieldDecl`) and `pairs.date?` are schema keys | 02 §5 |

Nineteen, counted.

---

## 14 · Done when

- [ ] `packages/declare` has the six files of §3 and nothing else; `package.json` exports exactly `.` and `./yaml`.
- [ ] `schemas.ts` constructs every schema at module scope; `schemas.test.ts` passes its load-time assertion.
- [ ] Every key table of §4 is a schema; an unknown key on any object is refused by name.
- [ ] `parsePack` refuses aliases, tags, second documents, non-string keys, non-finite numbers, 1 MB + 1; the round-trip property holds for 1,000 cases.
- [ ] Every one of the thirty-eight codes has a fixture under `packages/fixtures/refusals/` that produces it, and `codes.test.ts` finds no other.
- [ ] The seven golden packs lint clean; `provides` derives.
- [ ] `plan` reproduces `expected/freelancer-uk.install.json` and the upgrade's `applied: false` nav line; `planHash` is deterministic.
- [ ] `install` builds the batch the kernel applies — declaration rows with version and checksum, supersession, indexes, seeds tagged `example`, the `install`/`upgrade`/`declare`/`retire` events (41 §5.6); a stale plan, a conflict, an orphaning retire or a failing seed leaves nothing behind.
- [ ] `uninstall` retires, keeps every row, drops the pack row and its indexes, and a reinstall shows the rows again.
- [ ] `graph` proves `yaml` unreachable from `apps/worker` and `packages/record`; `closed-lists` and `refusal-fixtures` are green.
- [ ] Every §13 amendment is applied to its design document in the same revision.

---

*Next: [43-SPEC-EXTRACT](43-SPEC-EXTRACT.md).*
