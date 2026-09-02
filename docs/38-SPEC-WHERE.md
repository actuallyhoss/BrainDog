# 38 · `packages/where` — specification

The `where:` predicate as a package: the JSON tree, its canonical bytes, validation against a register, the
reference evaluator, and — in a second entry — the compiler to SQLite for both backends. Third in the build order
of [31-STACK](31-STACK.md) §2; the second of the three artefacts of [30-BLUEPRINT](30-BLUEPRINT.md) §14. Derives
from [34-GRAMMARS](34-GRAMMARS.md) §1, §3, §5 · [02-DATA-MODEL](02-DATA-MODEL.md) §5–§6 · [30-BLUEPRINT](30-BLUEPRINT.md)
§6–§7 · [33-CONTRACTS](33-CONTRACTS.md) §1, §3 · [21-AUTHORING](21-AUTHORING.md) §4. Mode: ponytail, per
[35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §1.

---

## 1 · Purpose and boundary

**Does.** One grammar, seven consumers ([02-DATA-MODEL](02-DATA-MODEL.md) §6). This package is the grammar: the tree
types, `parse` and `print` (RFC 8785), `validate` against a `RegisterSchema`, `resolveTemporal`, `evaluate` (the
oracle of 30 §7), and `compile` to a `WHERE` clause with bound parameters over `entry` or `inbox_raw`.

**Two entries, one package** ([31-STACK](31-STACK.md) §2).

| Entry | Exports | Runs in |
|---|---|---|
| `@braindog/where` | types · `parse` · `print` · `jcs` · `flatten` · `validate` · `resolveTemporal` · `evaluate` · `derive` · `searchText` · `INBOX_RAW` | browser and server — no SQL text anywhere in it |
| `@braindog/where/sql` | `compile` · `jsonPath` | server only |

**Refuses to do.**

| Not here | Where it is |
|---|---|
| YAML, the text lens, `# comments` | `declare` (42) — the only package with a YAML parser; there is no `where/text` (§13) |
| Executing SQL, opening a database, importing `Sql` | `kernel` (41) and `record` (45); `where ⇏ ports` (31 §2) |
| `near` scoring — int8 cosine, the 5,000-candidate cap, truncation to `k` | `record`; `compile` marks `uses.vec = true` and emits no SQL for the leaf (34 §1.8) |
| Resolving `register#seq` to an entry id | `record`, before compile (§13) |
| Flattening on save, projection, order, `LIMIT`, pagination | the caller: `flatten` is exported, the caller decides when |
| Reading across more than one register | the caller loops registers; `ctx.register` is one id |

**Imports.** Nothing at runtime. Position 3 in the total order; nothing below it. `node:sqlite` and `node:test` appear
under `test/` only.

**Consumers and what each takes** — the interface-agreement lens of 35 §5 reads this row.

| Package | Takes |
|---|---|
| `kernel` 41 | `jsonPath` (the index expression is the predicate expression, 31 §2) · `searchText` (the `entry_fts` projection, 30 §1) · `derive` (read-time derivation, 02 §5) · `evaluate` (`required_when:`, `immutable_when:`) · `jcs` (the `event.to_v` of a `create`, 30 §1) |
| `declare` 42 | `parse` · `validate` · `flatten` · `print` (the stored body, 30 §1 `declaration.body`) · `jcs` (`declaration.checksum`, `pack.checksum`, 34 §5) · the `Refusal` type |
| `extract` 43 | `evaluate` over an `inbox_raw` arrival for `match:` (07 §3); `compile` when a `match:` runs in SQL |
| `record` 45 | `compile` · `evaluate` · `resolveTemporal` |
| `spark` 46 | `validate` on a drafted predicate; the `Where` type |
| `apps/web` 50 | the browser entry only: `parse` · `print` · `validate` · `flatten` · `evaluate` (21 §4.5) |

---

## 2 · Public API

Every signature below is exported; nothing else is importable (`exports` map, 31 §3 layer 2). Errors: `parse` throws
`SyntaxError`; `validate` returns `Refusal[]` and never throws; `compile` and `resolveTemporal` throw `WhereError` on a
tree `validate` would have refused — compiling an unvalidated tree is a programming error, and the record validates at
install (30 §4) and compiles at read.

### 2.1 · The tree

```ts
// tree.ts
export const QUANTIFIERS = ['all', 'any', 'none'] as const;
export type Quantifier = (typeof QUANTIFIERS)[number];

export const OPERATORS = [
  'is', 'not', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'between',
  'contains', 'matches', 'starts', 'ends', 'empty', 'present', 'has', 'lacks', 'near',
] as const;                                                   // nineteen — 34 §1.1
export type Operator = (typeof OPERATORS)[number];

export type Money    = { amount: number; currency: string };  // integer minor units — 34 §3
export type Quantity = { value: number; unit: string };
export type Temporal = string;      // 'YYYY-MM-DD' | RFC 3339 UTC | anchor | offset — one string, resolved by type
export type Scalar   = string | number | boolean | Money | Quantity;
export type Ordered  = number | Money | Quantity | Temporal;

export type Test =
  | { is: Scalar } | { not: Scalar }
  | { in: Scalar[] } | { not_in: Scalar[] }
  | { gt: Ordered } | { gte: Ordered } | { lt: Ordered } | { lte: Ordered }
  | { before: Temporal } | { after: Temporal } | { between: [Temporal, Temporal] }
  | { contains: string } | { starts: string } | { ends: string }
  | { empty: true } | { present: true }
  | { has: Scalar } | { lacks: Scalar }
  | { near: { text: string; k?: number } };

export type Leaf =
  | ({ field: string; via?: string } & Test)     // every leaf but matches has a field — 34 §1.2
  | { matches: string }                          // the register, not a field
  | { predicate: string };                       // a named predicate of the same register — 34 §1.7

export type Group = { all: Node[] } | { any: Node[] } | { none: Node[] };
export type Node = Group | Leaf;
export type Predicate = Node;                    // a bare leaf is legal at the root — 34 §1.1
export type Where = Predicate;                   // the name the consumers use for a where: value (46 §2)
```

### 2.2 · The schema the grammar is checked against

```ts
export const FIELD_TYPES = [
  'text', 'document', 'int', 'decimal', 'money', 'quantity', 'day', 'instant', 'duration',
  'bool', 'enum', 'ref', 'file', 'url', 'email', 'secret', 'list', 'json',
] as const;                                                   // sixteen + two meta — 34 §3
export type FieldType = (typeof FIELD_TYPES)[number];

export type Derive =                                          // seven shapes, closed — 02 §5
  | { sum: string[] } | { diff: [string, string] } | { product: [string, string] }
  | { ratio: { of: string; per: string } }
  | { band: { of: string; edges: number[] } }
  | { via: string; field: string }
  | { normalise: string };

export interface FieldSpec {
  type: FieldType;
  of?: { type: FieldType; register?: string };  // list<T>: the element — 02 §5
  register?: string;                            // ref: the target register
  values?: string[];                            // enum
  index?: boolean;                              // index: true or unique: true — feeds uses.indexes
  derive?: Derive;                              // inlined by compile, computed by derive() — §5.6
}

export interface RegisterSchema {
  id: string;                                   // ^[a-z][a-z0-9_]{0,31}$ — 34 §4
  backend?: 'entry' | 'inbox_raw';              // default 'entry'
  fields: Record<string, FieldSpec>;
  search?: string[];                            // what matches reads — 02 §5
  series?: boolean;                             // SERIES_HAS_NO_TEXT — 02 §5
  predicates?: Record<string, Predicate>;       // named predicates — 34 §1.7
}
export type Schemas = Record<string, RegisterSchema>;         // every installed register, by id

export const KERNEL_FIELDS = {                  // addressable undeclared — 02 §6
  id: 'ref', seq: 'int', created_at: 'instant', updated_at: 'instant', version: 'int',
} as const;                                     // state is the sixth: addressable when declared, as its enum

export const INBOX_RAW: RegisterSchema;         // id 'inbox_raw', backend 'inbox_raw', the seven fields of 34 §1.9:
                                                //   from to subject body: text · channel: enum(5) · state: enum(7) · ts: instant
```

`declare` (42) projects a register declaration onto `RegisterSchema` — `unique: true` sets `index: true`, `list`'s
`of:` is copied, everything else is dropped. The projection is the only thing this package knows about a register.

### 2.3 · Refusals

```ts
export const GRAMMAR_CODES = [
  'PREDICATE_TOO_DEEP', 'VIA_TWICE', 'VIA_NESTED_SUBQUERY', 'MONEY_LITERAL_NEEDS_CURRENCY',
  'QUANTITY_LITERAL_NEEDS_UNIT', 'MATCH_FIELD_UNKNOWN', 'MATCH_OP_UNSUPPORTED', 'CONTAINS_TOO_LONG',
  'PATTERN_OVER_CAP', 'RELATIVE_LITERAL_UNKNOWN', 'PREDICATE_CYCLE', 'FIELD_UNKNOWN', 'ENUM_VALUE_UNKNOWN',
  'SERIES_HAS_NO_TEXT',
] as const;                                     // fourteen, every one in 30 §6 — §6 says when each fires
export type GrammarCode = (typeof GRAMMAR_CODES)[number];

export interface Refusal {                      // the shape of 30 §6, declared here because this is the lowest
  code: GrammarCode;                            //   package that raises one; declare and kernel reuse it (§13)
  at: string;                                   // 'all[1].any[0].field' — 'root' for a bare root leaf
  found: string;
  wanted: string;
  fix: string;                                  // one sentence, imperative
}

export class WhereError extends Error { readonly code: GrammarCode; readonly refusal: Refusal }
```

### 2.4 · Functions — the browser entry

```ts
// print.ts
export function parse(input: unknown): Predicate;     // JSON text or a parsed value; SyntaxError on a bad shape — §5.1
export function jcs(value: unknown): string;          // RFC 8785 of any JSON value — the checksums of 34 §5 use it — §5.2
export function print(pred: Predicate): string;       // = jcs(pred); named for the round trip of 21 §4.5
export function flatten(pred: Predicate): Predicate;  // all[all[a,b],c] → all[a,b,c]; identity-preserving — 21 §4.4

// validate.ts
export function validate(pred: Predicate, schema: RegisterSchema, schemas: Schemas): Refusal[];   // [] = valid — §5.3

// temporal.ts
export function resolveTemporal(literal: string, fieldType: 'day' | 'instant', now: string, tz: string): string;
//   now: RFC 3339 UTC. Returns 'YYYY-MM-DD' for day, 'YYYY-MM-DDTHH:MM:SS.mmmZ' for instant — §5.4

// evaluate.ts
export type Row = Record<string, unknown>;            // entry: { id, register, seq, fields: object, state, created_at,
                                                      //   updated_at, version, deleted_at } · inbox_raw: its columns,
                                                      //   headers as an object
export interface EvalCtx {
  now: string; tz: string;
  subject?: 'entry' | 'inbox_raw';                    // 'inbox_raw' selects INBOX_RAW; default 'entry'
  schema?: RegisterSchema;                            // required on the entry backend
  schemas?: Schemas;                                  // default {} — then every via hop finds no register and is false
  lookup?(register: string, id: string): Row | undefined;   // live rows only; the via hop — §5.5; default: none found
}                                                     // so extract (43) passes { subject: 'inbox_raw', now, tz } and nothing else
export function evaluate(pred: Predicate, row: Row, ctx: EvalCtx): boolean;
export function derive(row: Row, field: string, ctx: EvalCtx): unknown;      // the JS twin of §5.6; undefined = missing
export function searchText(fields: Record<string, unknown>, schema: RegisterSchema): string;   // the entry_fts projection
```

### 2.5 · Functions — the `./sql` entry

```ts
// sql.ts
export interface CompileCtx {                         // 34 §1.11, plus schemas (§13)
  subject: 'entry' | 'inbox_raw';
  register: string;                                   // the schema is schemas[register]; ignored on inbox_raw
  schemas: Schemas;
  now: string;                                        // RFC 3339 UTC
  tz: string;                                         // IANA
  scope: { registers: '*' | string[]; rows?: Predicate };
}
export interface Compiled {
  sql: string;                                        // 'WHERE register = ? AND deleted_at IS NULL AND (…)' — §5.7
  params: (string | number | null)[];                 // a subset of the Sql port's Param — no boolean, ever
  uses: { fts: boolean; vec: boolean; indexes: string[]; currency_excluded: boolean };
}
export function compile(pred: Predicate | null, ctx: CompileCtx): Compiled;   // null = an absent where:, every row
export function jsonPath(field: string, key?: 'amount' | 'currency' | 'value' | 'unit'): string;
//   "json_extract(fields,'$.due')" · "json_extract(fields,'$.amount.currency')" — the same bytes as the DDL of 30 §1
```

---

## 3 · Files

```
packages/where/
├── package.json          name @braindog/where · private · type module · exports { ".": "./src/index.ts", "./sql": "./src/sql.ts" }
├── tsconfig.json         extends ../../tsconfig.base.json
├── src/
│   ├── tree.ts           the types and closed lists of §2.1–§2.3, KERNEL_FIELDS, INBOX_RAW, the applicability table   ~110 lines
│   ├── print.ts          parse (shape check) · print (JCS) · flatten                                                    ~150
│   ├── validate.ts       the ordered pass of §5.3, the fourteen fix sentences                                           ~220
│   ├── temporal.ts       resolveTemporal, Intl parts, localToUtc                                                       ~110
│   ├── evaluate.ts       evaluate · derive · searchText · fold · the missing rule                                       ~200
│   ├── sql.ts            compile · jsonPath · expression per field kind · chunk · escapeLike · the three subqueries     ~260
│   └── index.ts          re-exports of the browser entry                                                                 ~10
└── test/
    ├── tree.test.ts  validate.test.ts  temporal.test.ts  evaluate.test.ts  compile.test.ts  property.test.ts
    └── seeds/            one { seed, path } JSON per captured counter-example — replayed first, committed forever
```

Seven source files; `index.ts` is a re-export. Six hold logic, as 35 §2 asks. `sql.ts` imports `tree.ts`,
`temporal.ts` and `evaluate.ts` (for `searchText`'s twin rules and the missing predicate); nothing imports `sql.ts`
except the `./sql` entry, so the browser bundle never sees a byte of SQL.

`package.json` scripts: `"test": "node --disable-warning=ExperimentalWarning --test test/"` (the warning is
`node:sqlite`'s, 31 §3), `"typecheck": "tsc -p ."`.

---

## 4 · Data structures

Invariants, each a sentence a test can check.

### 4.1 · Tree

1. A `Node` is an object with exactly one quantifier key (a `Group`) or no quantifier key (a `Leaf`).
2. A `Group`'s array is non-empty.
3. A `Leaf` carries exactly one operator key, or the single key `predicate`.
4. A `Leaf` with `matches` or `predicate` has no `field` and no `via`; every other leaf has `field`.
5. `via`, when present, is a field id, and the leaf's operator is not `matches has lacks near`.
6. The `string` terminal is non-empty: `is: ""`, `contains: ""`, `has: ""` and `matches: ""` are shape errors, because
   `""` is *missing* (34 §1.3) and the shape for that is `empty: true`. `in`/`not_in` arrays are non-empty (34 §1.1).
7. `between` is an array of exactly two strings. `empty`/`present` carry the literal `true`. `near.k`, when present, is
   an integer 1–100.
8. Depth: a group's level is 1 + its parent group's level; the root group is level 1; a leaf adds no level. After
   named-predicate expansion, no group is at level 4.
9. `flatten` splices a child group into its parent when both carry the same quantifier and it is `all` or `any`; `none`
   never flattens (`none[none[a]]` is `a`, not `none[a]`). `evaluate(flatten(p))` equals `evaluate(p)` on every row.

### 4.2 · Canonical bytes

10. `print(p)` has sorted keys at every level, no whitespace, and every scalar serialised by `JSON.stringify`.
11. `parse(print(p))` deep-equals `p`; `print(parse(print(p)))` equals `print(p)` byte for byte (21 §4.5).
12. `print` never reorders an array.

### 4.3 · Schema and applicability

The operator × type table — 34 §1.2 and 21 §4.2 folded into one relation, `APPLIES: Record<FieldType, Operator[]>`.

| Field type | Operators |
|---|---|
| `text` | `is not in not_in contains starts ends empty present near` |
| `url` · `email` | `is not in not_in contains starts ends empty present` |
| `document` | `contains empty present near` |
| `int` | `is not in not_in gt gte lt lte empty present` |
| `decimal` · `duration` | `is not gt gte lt lte empty present` |
| `money` · `quantity` | `is not gt gte lt lte empty present` — the literal carries `currency` / `unit` |
| `day` · `instant` | `is not gt gte lt lte before after between empty present` — every string literal is a `Temporal` |
| `bool` | `is not empty present` |
| `enum` | `is not in not_in empty present` — literals in `values` |
| `ref` | `is not in not_in empty present`, and the subject of `via` |
| `list<T>` | `has lacks empty present` — `T` one of `text int decimal duration enum ref bool day instant url email` |
| `file` · `secret` · `json` | `empty present` |
| the register | `matches` (entry backend, `search` non-empty) · `predicate` |

13. `KERNEL_FIELDS` resolve when the register declares no field of that id: `id` as `ref`, `seq` and `version` as
    `int`, `created_at` and `updated_at` as `instant`. `state` resolves only when declared, as its `enum`.
14. A `FieldSpec` with `derive: { via, field }` resolves to the far field's spec on `schemas[this.register]`; a leaf on it
    is rewritten to a `via` leaf on the source ref field before anything else looks at it (§5.6).
15. `INBOX_RAW.fields` are exactly `from to subject body channel state ts`; `channel.values` are the five of 30 §1,
    `state.values` the seven.

### 4.4 · Compiled

16. `sql` contains no `"` byte. Every `'…'` literal in `sql` is one of the compiler's constants: `''`, `'[]'`, `'\'`
    (the `ESCAPE` character) and the `'$.…'` paths produced by `jsonPath`. Every author value is a `?`.
17. `params.length` equals the count of `?` in `sql`; no `params[i]` is a boolean or `undefined`.
18. `uses.fts` is true iff a `matches` leaf was compiled; `uses.vec` iff a `near` leaf; `uses.currency_excluded` iff a
    money or quantity leaf; `uses.indexes` lists `entry_i_<reg>__<field>` once per indexed field met by a positive
    comparison operator, in leaf order, plus `entry_state` for `state`.

---

## 5 · Algorithms

### 5.1 · `parse` — shape, not meaning

1. If `input` is a string, `JSON.parse` it; a `SyntaxError` from there is the caller's `SyntaxError`.
2. Walk with `assertNode(value, path)`. A non-object, an array, or an object with zero keys → `SyntaxError`.
3. If exactly one key is in `QUANTIFIERS`: the value must be a non-empty array; recurse into each element with
   `path + '.' + q + '[' + i + ']'`. Any other key beside a quantifier → `SyntaxError`.
4. Else the object is a leaf. Its keys minus `{field, via}` must be exactly one key, in `OPERATORS` or `predicate`.
   Check invariants 4–7 of §4.1: `field` and `via` are strings; `predicate` stands alone; `matches` has no `field`;
   `in`/`not_in` non-empty arrays of scalars; `between` two strings; `empty`/`present` are `true`; `near` is
   `{ text: non-empty string, k?: integer 1–100 }`; a string scalar is non-empty; a number scalar is finite; an object
   scalar has only string or number values (its shape against money or quantity is `validate`'s, so
   `MONEY_LITERAL_NEEDS_CURRENCY` can fire).
5. The message is `where.parse: <path>: <what>`, `path` as `root`, `all[0]`, `all[1].any[2].in`.

A shape error is not a `Refusal`: a well-formed declaration never carries one, and the record answers a malformed
body with 400, not 422 (§13). `parse` never checks depth, types or literal values — that is `validate`.

### 5.2 · `jcs` and `print` — RFC 8785 in nine lines

1. `jcs(v)`: an array → `'[' + v.map(jcs).join(',') + ']'`; a plain object → `'{' + keys.sort().map(k =>
   JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}'`; `undefined` → omitted from an object, `null` in an array;
   anything else → `JSON.stringify(v)`.
2. `print(pred)` returns `jcs(pred)`.

Why that is RFC 8785. JCS is exactly: no whitespace; object members sorted by comparing property names as arrays of
UTF-16 code units (RFC 8785 §3.2.3) — which is what `Array.prototype.sort()` with no comparator does; strings
serialised as ECMAScript `JSON.stringify` serialises them (§3.2.2.2 cites it: `"` `\` and controls escaped, lower-case
`\u00xx`, everything else literal UTF-8); numbers serialised by ECMAScript `Number::toString` (§3.2.2.3), which is
what `JSON.stringify` calls for a number — shortest round-trip, `1e21` as `1e+21`, `-0` as `0`. Booleans and `null`
are their literals. The tree has no `NaN`, `Infinity` or `undefined` — `parse` admits none — so the two places where
JSON.stringify and I-JSON diverge never arise. The same nine lines serve `declaration.checksum` and `pack.checksum`
(34 §5) through `declare`.

### 5.3 · `validate` — one ordered pass

A depth-first walk with `(node, path, level, viaDepth, stack)`. `stack` is the list of named predicates being expanded.
A group collects from every child. A leaf yields **at most one** refusal — the first rule that fires — because every
later rule presumes the earlier ones. Rules, in order:

| # | Rule | Code |
|---|---|---|
| G1 | a group at `level > 3` (root group = 1; a `predicate` leaf at level *n* expanding to a group makes that group level *n*+1) — refuse, do not descend | `PREDICATE_TOO_DEEP` |
| L1 | `{ predicate: p }`: `p` in `stack` | `PREDICATE_CYCLE` |
| L2 | `p` not in `schema.predicates` | `FIELD_UNKNOWN` |
| L3 | else validate `schema.predicates[p]` at this path with `stack + [p]`, its root group at this level (G1 counts it) | — |
| L4 | `matches`: `schema.backend === 'inbox_raw'` | `MATCH_OP_UNSUPPORTED` |
| L5 | `matches`: `schema.series` | `SERIES_HAS_NO_TEXT` |
| L6 | `matches`: `schema.search` empty | `MATCH_OP_UNSUPPORTED` |
| L7 | `matches`: phrase > 200 UTF-8 bytes | `PATTERN_OVER_CAP` |
| L8 | `via` on the `inbox_raw` backend | `MATCH_OP_UNSUPPORTED` |
| L9 | `via` names no declared field | `FIELD_UNKNOWN` |
| L10 | `via` field is not a `ref` (a field whose `derive` is `via` counts as a second hop) | `VIA_TWICE` when the field derives `via`, else `MATCH_OP_UNSUPPORTED` |
| L11 | `via` with operator `matches has lacks near` | `VIA_NESTED_SUBQUERY` |
| L12 | `via`: `schemas[viaField.register]` missing | `FIELD_UNKNOWN` |
| L13 | `via`: continue at L14 with `schema = the far schema`, `viaDepth = 1` |  — |
| L14 | `field` resolution: `inbox_raw` and not one of the seven | `MATCH_FIELD_UNKNOWN` |
| L15 | entry: not declared and not a kernel field (`state` only when declared) | `FIELD_UNKNOWN` |
| L16 | the field's `derive` is `via` and `viaDepth === 1` | `VIA_TWICE` |
| L17 | the field's `derive` is `via`: rewrite to `{ via: derive.via, field: derive.field, <op>: … }` and restart at L8 | — |
| L18 | operator not in `APPLIES[type]` (element type for `list`); `near` not the last leaf of a root `all` | `MATCH_OP_UNSUPPORTED` |
| L19 | `contains matches starts ends near` on `schema.series` | `SERIES_HAS_NO_TEXT` |
| L20 | literal shape against the type — money: object with integer `amount` and string `currency` | `MONEY_LITERAL_NEEDS_CURRENCY` |
| L21 | quantity: object with number `value` and string `unit` | `QUANTITY_LITERAL_NEEDS_UNIT` |
| L22 | every other type: a literal of the wrong JS type (`gt: "5"` on `int`, `is: "yes"` on `bool`, a number on `text`) | `MATCH_OP_UNSUPPORTED` |
| L23 | `enum` or `list<enum>` (and `state`): a literal not in `values` — each element of `in`/`not_in` | `ENUM_VALUE_UNKNOWN` |
| L24 | `day`/`instant`: `resolveTemporal(literal, type, now?, tz?)` in **dry-run** — the literal must be `YYYY-MM-DD`, RFC 3339 UTC, an anchor, or `<sign><1–4 digits><d|w|m>`; each of `between`'s two | `RELATIVE_LITERAL_UNKNOWN` |
| L25 | `contains` literal > 40 UTF-8 bytes | `CONTAINS_TOO_LONG` |
| L26 | `starts`/`ends`: `escapeLike(literal)` > 40 UTF-8 bytes (§13) | `PATTERN_OVER_CAP` |

L24 needs no clock: the dry run classifies the literal without resolving it. `at` is the leaf path plus `.field`,
`.via`, `.predicate` or `.<op>` — whichever key the rule read. `validate` is total: it never throws on any output of
`parse`.

### 5.4 · `resolveTemporal` — `Intl.DateTimeFormat` parts, no library

Helpers, all private to `temporal.ts`:

1. `wall(ms, tz)` → `{ y, m, d, hh, mm, ss }` — `new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
   year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
   .formatToParts(new Date(ms))`, parts read by `type`. One formatter per `tz`, cached in a `Map`.
2. `ymd(y, m, d)` → `'YYYY-MM-DD'` via `Date.UTC(y, m - 1, d)` then `toISOString().slice(0, 10)` — so day 0 and day 32
   roll over for free.
3. `daysIn(y, m)` → `new Date(Date.UTC(y, m, 0)).getUTCDate()`.
4. `addMonths(y, m, d, n)` → `m' = m + n` normalised into `y'`; `d' = Math.min(d, daysIn(y', m'))` — the clamp of 34 §1.4.
5. `localToUtc(y, m, d, hh, mm, ss, tz)` → guess `g = Date.UTC(…)`; `off = Date.UTC(wall(g, tz)) - g`; `u = g - off`;
   if `wall(u, tz)` is not the requested wall time (a DST transition), repeat once from `u`. Two passes, the second
   wins.

`resolveTemporal(literal, fieldType, now, tz)`:

1. `nowMs = Date.parse(now)`; `t = wall(nowMs, tz)`; `today = (t.y, t.m, t.d)`.
2. Classify `literal`:
   - `/^\d{4}-\d{2}-\d{2}$/` and `ymd` round-trips it (so `2026-13-01` is not a day) → an absolute day `D`.
   - `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/` and `Date.parse` is finite → an absolute instant `I`.
   - `today tomorrow yesterday bom eom boy eoy` → an anchor.
   - `/^([+-])(\d{1,4})([dwm])$/` → an offset.
   - else throw `WhereError(RELATIVE_LITERAL_UNKNOWN)`.
3. Resolve to a day triple when the class is a day, an anchor, or an offset on a `day` field:
   - `D` → itself; `I` → `wall(Date.parse(I), tz)`'s date.
   - `today` → `today`; `tomorrow`/`yesterday` → `today ± 1` through `ymd`; `bom` → `(y, m, 1)`; `eom` → `(y, m,
     daysIn(y, m))`; `boy` → `(y, 1, 1)`; `eoy` → `(y, 12, 31)`.
   - offset `d` → `today + n`; `w` → `today + 7n`; `m` → `addMonths(today, n)`.
4. On a `day` field: return `ymd(triple)`.
5. On an `instant` field: an anchor or an absolute day → `localToUtc(triple, 00:00:00, tz)`; an absolute instant →
   itself; an offset `d`/`w` → `nowMs ± n × 86_400_000` (`w`: × 7); an offset `m` → `addMonths` on `t` keeping
   `hh:mm:ss`, then `localToUtc`. Return `new Date(ms).toISOString()` — millisecond `Z`, the shape of 34 §3, so a
   TEXT comparison in SQL and a string comparison in JS agree.

Worked, with `now = 2026-09-02T12:00:00Z` (15:00 in `Africa/Cairo`, UTC+3 under Egypt's reinstated DST):

| Literal | `day` | `instant` |
|---|---|---|
| `today` | `2026-09-02` | `2026-09-01T21:00:00.000Z` |
| `+30d` | `2026-10-02` | `2026-10-02T12:00:00.000Z` |
| `eom` | `2026-09-30` | `2026-09-29T21:00:00.000Z` |
| `-1w` | `2026-08-26` | `2026-08-26T12:00:00.000Z` |
| `+1m` from `now = 2026-01-31T12:00:00Z`, `UTC` | `2026-02-28` | `2026-02-28T12:00:00.000Z` |

### 5.5 · `evaluate` — the table of 34 §1.3, implemented literally

1. `missing(v)` = `v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)`.
2. `fold(s)` = `s.replace(/[A-Z]/g, c => c.toLowerCase())` — ASCII only, the same fold as SQLite's `lower()` (§13).
3. `valueOf(row, field, schema, ctx)`: entry backend — `state` → `row.state`; a kernel field → `row[field]`; a field
   with `derive` → `derive(row, field, ctx)`; else `row.fields[field]`. `inbox_raw` — `from to subject` →
   `row.headers[field]`; else `row[field]`.
4. Group: `all` → every child; `any` → some child; `none` → `!some`.
5. `{ predicate: p }` → `evaluate(schema.predicates[p], row, ctx)` (validation already broke cycles).
6. `via`: `ref = valueOf(row, via)`; `far = missing(ref) ? undefined : ctx.lookup(viaField.register, ref)`; **no far row →
   `false` for every operator** (the hop is positive, §13); else evaluate the leaf on `far` with the far schema.
7. `matches`: `tokens(searchText(row.fields, schema))` contains `tokens(fold(phrase))` as a contiguous run, where
   `tokens(s) = fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean)` — unicode61's alphanumeric rule with an ASCII fold;
   `searchText` = the `search:` values in order, a list joined by `' '`, fields joined by `'\n'`, whitespace collapsed
   (30 §1). A stated ceiling (§10).
8. `near` → `true`: ranking, not filtering.
9. Every other leaf: `v = valueOf(...)`, then the table:

| Operator | `missing(v)` | Otherwise |
|---|---|---|
| `empty` | `true` | `false` |
| `present` | `false` | `true` |
| `is` | `false` | `eq(v, lit)` |
| `not` | `true` | `!eq(v, lit)` |
| `in` | `false` | `lits.some(l => eq(v, l))` |
| `not_in` | `true` | `!lits.some(...)` |
| `gt gte lt lte` | `false` | numeric, or string comparison on the resolved temporal for `day`/`instant` |
| `before` / `after` | `false` | `v < r` / `v > r`, `r = resolveTemporal(lit, type, ctx.now, ctx.tz)` |
| `between` | `false` | `lo <= v && v <= hi`, both resolved |
| `contains` | `false` | `fold(v).includes(fold(lit))` |
| `starts` / `ends` | `false` | `fold(v).startsWith(fold(lit))` / `endsWith` |
| `has` | `false` | `v.some(e => eq(e, lit))` |
| `lacks` | `true` | `!v.some(...)` |

`eq`: `bool` compares booleans (the SQL binds 1/0 against `json_extract`'s 1/0); `day`/`instant` compare the
normalised strings, the literal through `resolveTemporal`; `money`: `v.currency === lit.currency && v.amount ===
lit.amount`; `quantity` likewise on `unit`/`value`; everything else `===`. **Money and quantity comparison rule:** a
value in another currency or unit is *incomparable* — `is not gt gte lt lte` are all `false` on it; only the missing
rule makes `not` true (34 §1.5: two currencies are never compared). `state` on a register that declares it is its enum.

### 5.6 · `derive` — one definition, two renderings

`derive(row, field, ctx)` in JS and the inline in SQL are the same table. `F(x)` is the operand's value in JS and
`jsonPath(x)` in SQL; operands are fields of this row. An operand that is itself derived inlines recursively — 02 §5's
own example bands the derived `score` — and a cycle between derivations is `declare`'s to refuse at install; "depth
one" means no shape nests inside a shape.

| Shape | JS | SQL inline (`E`) |
|---|---|---|
| `sum: [a, b, …]` | `Σ (F(x) ?? 0)` | `(COALESCE(F(a),0) + COALESCE(F(b),0) + …)` |
| `diff: [a, b]` | `(F(a) ?? 0) - (F(b) ?? 0)` | `(COALESCE(F(a),0) - COALESCE(F(b),0))` |
| `product: [a, b]` | missing if either missing, else `F(a) * F(b)` | `(F(a) * F(b))` — SQL `NULL` propagates |
| `ratio: { of, per }` | missing if either missing or `per === 0`, else `of / per` | `(CASE WHEN F(per) = 0 THEN NULL ELSE F(of) * 1.0 / F(per) END)` |
| `band: { of, edges }` | missing if `F(of)` missing; else `values[i]` for the first `edge[i] > x`, else `values[n]` | `(CASE WHEN F(of) IS NULL THEN NULL WHEN F(of) < ? THEN ? … ELSE ? END)` — edges and values **bound**, 2*n*+1 params |
| `via: r, field: f` | the far row's `f` through `ctx.lookup`; missing if no far row | never inlined: the leaf is rewritten to `{ via: r, field: f, … }` and compiles to the hop of §5.7 — three subquery forms stay three |
| `normalise: f` | `fold(F(f)).trim()` | `lower(trim(F(f)))` |

A missing addend is zero; a missing factor is unknown; a zero divisor is missing, never zero (02 §5). `band` guards
`NULL` first because `NULL < ?` is `NULL` and would fall through to the last value. `normalise` does not collapse
internal whitespace on either side — SQLite has no regexp and the two sides must agree (§13).

### 5.7 · `compile`

An **expression** is `{ text, params }`; wherever `E` appears twice in a fragment its params are pushed twice, in
order. Every author value is a `?`. `bool` binds `1`/`0`; a `Temporal` binds its resolved string; money binds
`[currency, amount]`; quantity `[unit, value]`.

**Step 1 — the expression for a field** (`exprFor(field, schema)`):

| Field kind | `E` |
|---|---|
| declared, entry backend | `json_extract(fields,'$.<id>')` — `jsonPath(id)`, byte-identical to the DDL of 30 §1 |
| `state` (declared) | `state` |
| `id seq created_at updated_at version` | the column, unquoted |
| `money` | `jsonPath(id, 'currency')` and `jsonPath(id, 'amount')` — two expressions |
| `quantity` | `jsonPath(id, 'unit')` and `jsonPath(id, 'value')` |
| `list<T>` | `jsonPath(id)` — the JSON array as text; `json_each` reads it |
| derived | the inline of §5.6 (a `via` derivation rewrites the leaf instead) |
| `inbox_raw`: `from to subject` | `json_extract(headers,'$.<name>')` |
| `inbox_raw`: `body channel state ts` | the column |

`empty`/`present` on money, quantity and list read the base path `jsonPath(id)`.

**Step 2 — the fragment per operator.** `E` as above; `P` a bound parameter.

| Operator | Fragment | Params |
|---|---|---|
| `is` | `E = ?` | `[lit]` |
| `not` | `(E IS NULL OR E <> ?)` | `[lit]` |
| `in` | one chunk: `E IN (?,?,…)`; more: `(E IN (…) OR E IN (…))` — chunks of 64 | the values |
| `not_in` | one chunk: `(E IS NULL OR E NOT IN (…))`; more: `(E IS NULL OR (E NOT IN (…) AND E NOT IN (…)))` | the values |
| `gt gte lt lte` | `E > ?` `E >= ?` `E < ?` `E <= ?` | `[lit]` or the resolved temporal |
| `before` / `after` | `E < ?` / `E > ?` | resolved |
| `between` | `E BETWEEN ? AND ?` — inclusive, as SQLite's is | `[lo, hi]` resolved |
| `contains` | `instr(lower(E), lower(?)) > 0` | `[lit]` |
| `starts` / `ends` | `E LIKE ? ESCAPE '\'` | `[escapeLike(lit) + '%']` / `['%' + escapeLike(lit)]` |
| `matches` | `id IN (SELECT id FROM entry_fts WHERE register = ? AND entry_fts MATCH ?)` | `[register, '"' + phrase.replaceAll('"', '""') + '"']` |
| `empty` | `(E IS NULL OR E = '' OR E = '[]')` | `[]` |
| `present` | `(E IS NOT NULL AND E <> '' AND E <> '[]')` | `[]` |
| `has` | `EXISTS (SELECT 1 FROM json_each(E) WHERE value = ?)` | `[lit]` |
| `lacks` | `NOT EXISTS (SELECT 1 FROM json_each(E) WHERE value = ?)` | `[lit]` |
| `near` | *(nothing emitted; the parent `all` skips it)* — `uses.vec = true` | `[]` |

`escapeLike(s)` = `s.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')`. The `'\'` after
`ESCAPE` is a compiler constant, not a value. `json_each(NULL)` yields no rows, so `has` is false and `lacks` true on a
missing list, as the table of §5.5 says.

Money and quantity (`C`, `A` = the currency and amount expressions):

| Operator | Fragment | Params |
|---|---|---|
| `is` | `(C = ? AND A = ?)` | `[currency, amount]` |
| `gt gte lt lte` | `(C = ? AND A <op> ?)` | `[currency, amount]` |
| `not` | `(C IS NULL OR (C = ? AND A <> ?))` | `[currency, amount]` |

A row in another currency matches none of the six; `uses.currency_excluded = true` on any money or quantity leaf so a
total can say so (34 §1.5).

**Step 3 — `in` chunking.** Split the values into slices of 64; emit one `IN (…)` per slice with as many `?` as it has
values; join `in` slices with ` OR `, `not_in` slices with ` AND `; wrap in one parenthesis when there is more than one
slice. 130 values → 64, 64, 2. Chunking bounds the size of one `IN` list; it does not lower the parameter total,
which is the adapter's 100 (§7, §13).

**Step 4 — `via`.** `R` = `jsonPath(viaField)`; the far schema `S' = schemas[viaField.register]`:

```sql
R IN (SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND <leaf compiled against S'>)
```

Params: `[S'.id, …leaf params]`. The inner leaf uses S' for its expression, so `state` on the far register reads the
column (30 §7). A missing or dangling `R` gives `NULL IN (…)`, which is `NULL`, which is false — for every operator,
which is why §5.5 step 6 says the same.

**Step 5 — `predicate`.** Replace the leaf with `schema.predicates[name]` and compile that node at this position. The
expansion is what G1 measured; `compile` re-checks nothing.

**Step 6 — groups.** `all` → `(a AND b AND c)`; `any` → `(a OR b OR c)`; `none` → `NOT (a OR b OR c)`. A single child
still gets its parenthesis. A `near` child is skipped; a root `all` whose only child was `near` compiles to nothing,
and step 7 then omits the `AND (…)` — no `1 = 1`, no unbound literal.

**Step 7 — the statement.** Entry backend:

```sql
WHERE register = ?                        -- ctx.register
  [AND register IN (?,?,…)]               -- ctx.scope.registers when it is an array, chunked as `in`
  AND deleted_at IS NULL
  [AND (<predicate>)]                     -- absent when pred is null or compiled to nothing
  [AND (<ctx.scope.rows>)]                -- compiled against the same schema
```

Emitted on one line, single spaces. Params in the same order: register, scope registers, predicate, scope rows.
`inbox_raw` backend: `WHERE (<predicate>)` `[AND (<scope.rows>)]`; `''` when both are absent — the table has neither
`register` nor `deleted_at`, and `scope.registers` does not apply.

**Step 8 — `uses`.** Set as §4.4 item 18 says. `indexes` gets `entry_i_<reg>__<field>` for `is in gt gte lt lte before
after between starts` on a field with `index: true`, `entry_state` for `state` — advisory, "what the planner should
have picked" (30 §7); the `EXPLAIN QUERY PLAN` assertion that it did is `ports`' (37) and `kernel`'s (41).

Complexity: one pass, O(nodes + literals); no allocation beyond the string parts. Measured in §7.

---

## 6 · Refusals and errors

Fourteen codes, every one in [30-BLUEPRINT](30-BLUEPRINT.md) §6; the fixture for each is `fixtures/refusals/<kebab>.yaml`
and the `refusal-fixtures` gate (33 §8) checks the pairing. `found` carries the offending literal or key; `wanted` the
rule; `fix` is the sentence below with the angle-bracket parts filled from the leaf.

| Code | Fires when (§5.3 rule) | `fix` |
|---|---|---|
| `PREDICATE_TOO_DEEP` | a group at level 4 after expansion (G1) | "Save the inner group as a named predicate on the register and reference it as { predicate: <name> }." |
| `VIA_TWICE` | `via` on a field that itself derives `via` (L10), or a leaf on a `via`-derived field inside a `via` (L16) | "A predicate crosses one ref. Filter <far register> in its own predicate, or store <field> on <register>." |
| `VIA_NESTED_SUBQUERY` | `via` with `matches`, `has`, `lacks` or `near` (L11) | "Across a hop use is, not, in, not_in, gt, gte, lt, lte, before, after, between, contains, starts, ends, empty or present." |
| `MONEY_LITERAL_NEEDS_CURRENCY` | a money field's literal is not `{ amount: integer, currency: string }` (L20) | "Write { amount: <minor units>, currency: <ISO 4217> } — for example { amount: 100000, currency: EGP }." |
| `QUANTITY_LITERAL_NEEDS_UNIT` | a quantity field's literal is not `{ value: number, unit: string }` (L21) | "Write { value: <number>, unit: <unit> } — for example { value: 1.4, unit: m }." |
| `MATCH_FIELD_UNKNOWN` | `inbox_raw` and `field` is not one of the seven (L14) | "Use one of from, to, subject, body, channel, state, ts." |
| `MATCH_OP_UNSUPPORTED` | `matches`/`via` on `inbox_raw` (L4, L8); `via` on a non-ref (L10); `matches` on a register with no `search:` (L6); an operator outside `APPLIES[type]`, `near` off the last leaf of the root `all` (L18); a literal of the wrong JS type (L22) | "<op> does not apply to a <type> field; use one of <APPLIES[type]>." · for `near`: "Put near last, in the root all:." · for `inbox_raw`: "A match: predicate takes is, not, in, not_in, gt, gte, lt, lte, before, after, between, contains, empty, present." |
| `CONTAINS_TOO_LONG` | `contains` literal over 40 UTF-8 bytes (L25) | "Shorten the text to 40 bytes or fewer, or use matches for a phrase." |
| `PATTERN_OVER_CAP` | `starts`/`ends` literal over 40 bytes after escaping `%`, `_`, `\` (L26); `matches` phrase over 200 bytes (L7) | "Shorten the pattern to 40 bytes after escaping %, _ and \." · "Shorten the phrase to 200 bytes or fewer." |
| `RELATIVE_LITERAL_UNKNOWN` | a `day`/`instant` literal that is none of the four classes of §5.4 (L24) | "Use YYYY-MM-DD, an RFC 3339 UTC instant, an anchor (today tomorrow yesterday bom eom boy eoy) or an offset such as +30d, -1w, +2m." |
| `PREDICATE_CYCLE` | a named predicate reached while it is being expanded (L1) | "Remove the reference to <name> from <name>'s own definition." |
| `FIELD_UNKNOWN` | an undeclared, non-kernel field (L15); an unknown `predicate` name (L2); `via` on an undeclared field (L9); a `via` target register not installed (L12) | "Use one of the register's fields: <ids…>, or id, seq, created_at, updated_at, version." · "Declare predicates.<name> on <register>." |
| `ENUM_VALUE_UNKNOWN` | an `enum`, `list<enum>` or `state` literal outside `values` (L23) | "Use one of <values>." |
| `SERIES_HAS_NO_TEXT` | `contains matches starts ends near` on a `series: true` register (L5, L19) | "A series has no text; filter <register> on its key fields or its numbers." |

Two codes of the corpus are **not** raised here, and the spec says why:

| Code | Why not here |
|---|---|
| `RELATIVE_UNIT_FOR_DAY` | `h` is not a `where:` unit (34 §1.4); `-1h` on any field is `RELATIVE_LITERAL_UNKNOWN`. Its 30 §6 row moves to `declare`'s `remind:` check (§13) |
| the adapter's thirteen (`TOO_MANY_PARAMS` …) | the driver's vocabulary, raised by `ports` when the statement runs (33 §3). `compile` neither counts nor refuses; `params.length` is on the result |

**Not refusals.** `parse`'s `SyntaxError` (§5.1) — a malformed body. A `WhereError` from `compile` or
`resolveTemporal` — a tree that skipped `validate`, a bug in the caller, carrying the `Refusal` it would have
returned. An unknown `ctx.tz` — `Intl` throws `RangeError`, left to propagate: the record's `tz` column is validated
at write, not here.

---

## 7 · Performance budget

| Quantity | Budget | Measured how |
|---|---|---|
| `compile`, depth-3 predicate, 12 leaves incl. one `via`, one `matches`, one 70-value `in` | **< 1 ms** | `compile.test.ts`: 1,000 compiles of the fixture in a loop under `performance.now()`, total < 1,000 ms — mean under budget, robust to one slow iteration |
| `validate`, same predicate, 64-field schema | < 1 ms | same loop |
| `print` + `parse` round trip, same predicate | < 0.2 ms | same loop |
| `resolveTemporal`, cold formatter | < 5 ms first call, < 0.05 ms after | the `Map` cache; measured once in `temporal.test.ts` |
| `evaluate`, one row, same predicate | < 0.05 ms | 40 rows × 1,000 predicates inside the property run stays under the run budget |
| property test, `FC_RUNS=1000` | **< 20 s wall** on the CI runner; ~5 s expected | `node --test` duration line; the test's own `timeout` is 60 s |
| property test, `FC_RUNS=10000` (the `where-property` gate) | < 200 s | nightly `gates.yml` row, not `ci.yml` |
| compiled SQL bytes, 130-value `not_in` | < 1 KB | asserted in the exact-SQL test |
| compiled SQL bytes, worst legal predicate | < 100,000 (`maxSqlBytes`) | not approached: depth 3 × builder-sized groups is a few KB |
| parameters | ≤ 100 per statement | **the adapter's** ceiling, not the compiler's. `register` takes one; a predicate may bind about 95 values in total. `in` chunking does not change this number (§13) |
| compound selects | 0 | the compiler emits no `UNION`/`INTERSECT`/`EXCEPT`; asserted on every property run |
| expression depth | < 100 (`maxExprDepth`) | a group of *n* leaves is a chain of *n*−1 `AND`s; ~90 leaves in one group would approach it; the builder produces under ten (§10) |
| browser entry, minified | < 8 KB | `apps/web`'s bundle gate (22 §9) reads it; no SQL text in the entry |

---

## 8 · Security

**The trust boundary is the tree.** Predicates arrive from three untrusted directions — an agent's `list({ where })`
over MCP (10 §3), a pack's YAML through `declare`, the builder over HTTP — and every one crosses `parse` (shape) then
`validate` (meaning) before `compile` sees it. `compile` throws on what `validate` would have refused, so the
compiler cannot be reached with an unvalidated tree by mistake.

| Property | Held by | Checked by |
|---|---|---|
| no author string ever appears in SQL text | every literal is a `?`; the only quoted constants are `''`, `'[]'`, `'\'` and `jsonPath`'s `'$.<id>'` | §9's constant-literal regex on every compiled statement, property run included |
| no double-quoted string — `"x"` is an identifier in `node:sqlite` (30 §13) | the compiler has no code path that writes `"` | `assert(!sql.includes('"'))` on every statement |
| no FTS5 operator reachable from an author | `matches` binds one quoted phrase with `"` doubled | the `matches` exact-SQL test, plus `"a" OR "b"` as a phrase in the property alphabet |
| no author-writable subquery | three forms, emitted only by the compiler, none takes author SQL | grep the compiler for `SELECT`: three sites |
| `json_extract` paths cannot escape `$.` | `jsonPath` asserts `^[a-z][a-z0-9_]{0,31}$` on the id and throws otherwise — defence in depth under `declare`'s check | `tree.test.ts` |
| `LIKE` patterns stay under workerd's 50-byte `sqlite3_limit` | 40 bytes after escaping, plus one `%` — 41 ≤ 50 | L26 and the `starts` exact-SQL test |
| the read scope is inside the SQL, never after ranking | `register = ?`, `register IN (…)` and `scope.rows` are `AND`-ed in step 7; `near` candidates are drawn from that clause (11 §5) | the scope exact-SQL test |
| regex is not in the grammar | `matches`, `contains`, `starts`, `ends` — no pattern language (02 §6) | the closed operator list |
| bounded work from a declaration | depth 3, 64-value chunks, 40/200-byte literals, one hop | `validate` |
| refusals do not leak into logs | a `Refusal.found` may carry a field value; the record logs `code` and `at` only (12 §8) | `secret-grep` gate (33 §8) |

Nothing here is a credential path: the package touches no key, no grant, no network, no file.

---

## 9 · Tests and gates

`node:test` + `node:assert/strict`, `test/**/*.test.ts`, run by `node --test` (35 §2). Every case below is
input → expected. The fixture schemas:

```yaml
obligations:   # 02 §5, plus tags
  fields: { what: text (index), to: ref→people, amount: money, due: day (index), state: enum [open, part, paid, void] (index),
            note: document, tags: list<text> }
  search: [what, note]
  predicates: { overdue: { all: [ { field: state, is: open }, { field: due, before: today } ] } }
people:        { fields: { name: text, state: enum [active, gone] } }
tasks:         { fields: { rev: int, unblock: int, clock: int, cheap: int,
                           score: int (derive sum [rev, unblock, clock, cheap]),
                           tier: enum [low, medium, high, urgent] (derive band { of: score, edges: [40, 60, 80] }) } }
transactions:  { fields: { account: ref→accounts, currency: text (derive via: account, field: currency) } }
accounts:      { fields: { currency: text } }
ctx:           { subject: entry, register: obligations, now: 2026-09-02T12:00:00Z, tz: Africa/Cairo, scope: { registers: '*' } }
```

### 9.1 · `tree.test.ts` — parse, print, flatten

| Input | Expected |
|---|---|
| `print({ is: 'open', field: 'state' })` | `{"field":"state","is":"open"}` |
| `print({ any: [{ field: 'b', is: 1 }, { field: 'a', is: 2 }] })` | `{"any":[{"field":"b","is":1},{"field":"a","is":2}]}` — arrays keep order |
| `print({ field: 'n', gt: 1e21 })` | `{"field":"n","gt":1e+21}` |
| `print(parse(print(t)))` for the depth-3 fixture predicate | `=== print(t)` |
| `parse(print(t))` | `deepEqual t` |
| `parse('{}')` · `parse('[]')` · `parse('{"all":[]}')` | `SyntaxError` |
| `parse({ field: 'x' })` — no operator | `SyntaxError` |
| `parse({ field: 'x', is: 'a', not: 'b' })` | `SyntaxError` |
| `parse({ field: 'x', is: '' })` · `parse({ field: 'x', in: [] })` | `SyntaxError` — the non-empty terminal |
| `parse({ matches: 'x', field: 'y' })` · `parse({ predicate: 'p', field: 'y' })` | `SyntaxError` |
| `parse({ all: [{ field: 'x', is: 1 }], any: [] })` | `SyntaxError` |
| `parse({ field: 'x', between: ['2026-01-01'] })` · `parse({ field: 'x', empty: false })` | `SyntaxError` |
| `parse({ field: 'x', near: { text: 'a', k: 101 } })` | `SyntaxError` |
| `parse({ field: 'x', foo: 1 })` | `SyntaxError`, message contains `root` and `foo` |
| `parse({ field: 'amount', is: { amount: 5 } })` | a `Leaf` — object literals pass the shape check so L20 can fire |
| `flatten({ all: [{ all: [a, b] }, c] })` | `{ all: [a, b, c] }` |
| `flatten({ none: [{ none: [a] }] })` | unchanged |
| `flatten({ all: [{ any: [a, b] }, c] })` | unchanged |
| `jsonPath('due')` · `jsonPath('amount', 'currency')` | `json_extract(fields,'$.due')` · `json_extract(fields,'$.amount.currency')` |
| `jsonPath("due') OR 1=1 --")` | throws |

### 9.2 · `validate.test.ts` — one case per code, plus the boundaries

| Input (against `obligations` unless said) | Expected `code` · `at` |
|---|---|
| `{ all: [{ any: [{ none: [{ all: [{ field: state, is: open }] }] }] }] }` | `PREDICATE_TOO_DEEP` · `all[0].any[0].none[0]` |
| `{ all: [{ any: [{ none: [{ field: state, is: open }] }] }] }` | `[]` — three levels |
| `{ via: currency, field: name, is: x }` on `transactions` — `currency` derives `via` (L10); and L16's form, a `via` whose far field derives `via` | `VIA_TWICE` · `root.via` / `root.field` |
| `{ via: to, field: name, has: x }` · `{ via: to, matches: x }` | `VIA_NESTED_SUBQUERY` |
| `{ field: amount, gt: 100000 }` · `{ field: amount, gt: { amount: 1 } }` · `{ field: amount, gt: { amount: 1.5, currency: EGP } }` | `MONEY_LITERAL_NEEDS_CURRENCY` |
| `{ field: w, gt: { value: 1.4 } }` on a schema with `w: quantity` | `QUANTITY_LITERAL_NEEDS_UNIT` |
| `{ field: sender, is: x }` against `INBOX_RAW` | `MATCH_FIELD_UNKNOWN` · `root.field` |
| `{ field: subject, starts: x }` against `INBOX_RAW` · `{ matches: x }` against `INBOX_RAW` · `{ via: to, field: name, is: x }` against `INBOX_RAW` | `MATCH_OP_UNSUPPORTED` |
| `{ field: amount, contains: x }` · `{ field: due, gt: 5 }` · `{ field: state, gt: open }` · `{ field: what, is: 5 }` | `MATCH_OP_UNSUPPORTED` — entry backend |
| `{ any: [{ field: what, near: { text: x } }] }` · `{ all: [{ field: what, near: { text: x } }, { field: state, is: open }] }` | `MATCH_OP_UNSUPPORTED` — position |
| `{ all: [{ field: state, is: open }, { field: what, near: { text: x } }] }` | `[]` |
| `{ field: what, contains: <41 bytes> }` · `{ field: what, contains: <40 bytes> }` | `CONTAINS_TOO_LONG` · `[]` |
| `{ field: what, starts: <21 × '%'> }` — 42 bytes escaped | `PATTERN_OVER_CAP` |
| `{ field: what, starts: <20 × '%'> }` — 40 bytes escaped | `[]` |
| `{ matches: <201 bytes> }` | `PATTERN_OVER_CAP` |
| `{ field: due, before: "-1h" }` · `"next week"` · `"2026-13-01"` · `"+12345d"` | `RELATIVE_LITERAL_UNKNOWN` |
| `predicates: { a: { predicate: b }, b: { predicate: a } }`, then `{ predicate: a }` | `PREDICATE_CYCLE` · `root.predicate(a).predicate(b).predicate` |
| `{ predicate: nope }` · `{ field: owner, is: x }` (undeclared) · `{ via: owner, field: name, is: y }` (`via` undeclared) · `{ via: to, field: name, is: y }` with `schemas` lacking `people` | `FIELD_UNKNOWN` |
| `{ field: state, is: x }` on a register that declares no `state` | `FIELD_UNKNOWN` |
| `{ field: state, is: closed }` · `{ field: state, in: [open, closed] }` | `ENUM_VALUE_UNKNOWN` · `root.is` / `root.in` |
| `{ field: what, contains: x }` on `{ …, series: true }` | `SERIES_HAS_NO_TEXT` |
| the depth-3 fixture predicate with every operator applied to its type | `[]` |
| `{ field: created_at, after: "-7d" }` · `{ field: id, in: [<ulid>] }` · `{ field: seq, gt: 100 }` | `[]` — kernel fields |
| a group with two bad leaves | two refusals, in leaf order |

### 9.3 · `temporal.test.ts`

The table of §5.4 — ten cells — plus: `resolveTemporal('2026-09-02T12:00:00Z', 'instant', …)` →
`2026-09-02T12:00:00.000Z`; `resolveTemporal('2026-09-02T12:00:00Z', 'day', now, 'Pacific/Auckland')` →
`2026-09-03`; `'2026-09-02'` on `instant` in `Africa/Cairo` → `2026-09-01T21:00:00.000Z`; `'+1m'` from
`2026-03-31` (UTC) → `2026-04-30`; `'-1m'` from `2026-03-31` → `2026-02-28`; `bom` on `instant` in
`America/New_York` at `2026-03-08T12:00:00Z` (a DST Sunday) → `2026-03-01T05:00:00.000Z`; `-1h` → throws
`WhereError` with `code RELATIVE_LITERAL_UNKNOWN`.

### 9.4 · `evaluate.test.ts` — the truth table

For every operator in §5.5's table, four rows — field absent, `null`, `''` or `[]`, a matching value, a non-matching
value — asserted against the table's column. Then:

| Input | Expected |
|---|---|
| `{ via: to, field: state, not: gone }` on a row with no `to` | `false` |
| same, `to` dangling (lookup returns `undefined`) | `false` |
| same, far row `state: active` | `true` |
| `{ field: amount, not: { amount: 1, currency: EGP } }` on `{ amount: 1, currency: USD }` | `false` |
| `{ field: amount, is: … EGP }` on the USD row | `false` |
| `{ field: amount, not: … EGP }` on a row without `amount` | `true` |
| `{ matches: "web hosting" }` on `what: "Web Hosting renewal"` | `true` |
| `{ matches: "hosting web" }` on the same row | `false` — adjacency |
| `{ matches: "host" }` on the same row | `false` — whole token |
| `{ field: what, contains: "HOST" }` on the same row | `true` |
| `{ none: [{ field: tags, has: x }] }` on a row with no tags | `true` |
| `{ field: tier, is: urgent }` on `tasks` row `rev 30 unblock 14 clock 20 cheap 20` | `true` (84 ≥ 80) |
| `derive(row, 'tier')` on a row with no judgements | `'low'` — four zeros sum to 0, band 0 |
| `derive(row, 'ratio_field')` with `per: 0` | `undefined` |
| `searchText({ what: 'a  b', note: 'c', tags: ['x', 'y'] }, obligations)` | `'a b\nc'` — `search: [what, note]`, collapsed |

### 9.5 · `compile.test.ts` — exact SQL

`E(f)` abbreviates `json_extract(fields,'$.f')` in this table only; the assertion is on the full string. `P` is
the prefix `WHERE register = ? AND deleted_at IS NULL AND `.

| Predicate | `sql` | `params` | `uses` |
|---|---|---|---|
| `{ field: state, is: open }` | `P(state = ?)` | `['obligations','open']` | `indexes: ['entry_state']` |
| `{ field: what, not: "hosting" }` | `P((E(what) IS NULL OR E(what) <> ?))` | `['obligations','hosting']` | — |
| `{ field: what, not_in: [130 values] }` | `P((E(what) IS NULL OR (E(what) NOT IN (?×64) AND E(what) NOT IN (?×64) AND E(what) NOT IN (?,?))))` | length 131 — over the adapter's 100; this case pins the shape (§13) | — |
| `{ field: what, in: [70 values] }` | `P((E(what) IN (?×64) OR E(what) IN (?×6)))` | length 71 | `indexes: ['entry_i_obligations__what']` |
| `{ field: amount, gt: { amount: 100000, currency: EGP } }` | `P((E(amount.currency) = ? AND E(amount.amount) > ?))` | `['obligations','EGP',100000]` | `currency_excluded: true` |
| `{ field: what, contains: "Hosting" }` | `P(instr(lower(E(what)), lower(?)) > 0)` | `['obligations','Hosting']` | — |
| `{ field: what, starts: "50%" }` | `P(E(what) LIKE ? ESCAPE '\')` | `['obligations','50\\%%']` — the bytes `5 0 \ % %` | — |
| `{ matches: 'web "hosting"' }` | `P(id IN (SELECT id FROM entry_fts WHERE register = ? AND entry_fts MATCH ?))` | `['obligations','obligations','"web ""hosting"""']` | `fts: true` |
| `{ field: tags, has: infra }` | `P(EXISTS (SELECT 1 FROM json_each(E(tags)) WHERE value = ?))` | `['obligations','infra']` | — |
| `{ field: tags, empty: true }` | `P((E(tags) IS NULL OR E(tags) = '' OR E(tags) = '[]'))` | `['obligations']` | — |
| `{ via: to, field: state, is: active }` | `P(E(to) IN (SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND state = ?))` | `['obligations','people','active']` | — |
| `{ all: [{ predicate: overdue }, { field: tags, lacks: disputed }] }` | `P(((state = ? AND E(due) < ?) AND NOT EXISTS (SELECT 1 FROM json_each(E(tags)) WHERE value = ?)))` | `['obligations','open','2026-09-02','disputed']` | `indexes: ['entry_state','entry_i_obligations__due']` |
| `{ field: due, before: "+30d" }` | `P(E(due) < ?)` | `['obligations','2026-10-02']` | `indexes: ['entry_i_obligations__due']` |
| `{ field: created_at, after: today }` | `P(created_at > ?)` | `['obligations','2026-09-01T21:00:00.000Z']` | — |
| `{ field: tier, is: urgent }` on `tasks`, `S` = `(COALESCE(E(rev),0) + COALESCE(E(unblock),0) + COALESCE(E(clock),0) + COALESCE(E(cheap),0))` | `P((CASE WHEN S IS NULL THEN NULL WHEN S < ? THEN ? WHEN S < ? THEN ? WHEN S < ? THEN ? ELSE ? END) = ?)` | `['tasks',40,'low',60,'medium',80,'high','urgent','urgent']` | — |
| `{ field: currency, is: EGP }` on `transactions` | `P(E(account) IN (SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND E(currency) = ?))` | `['transactions','accounts','EGP']` | — |
| `{ all: [{ field: state, is: open }, { field: what, near: { text: "x" } }] }` | `P((state = ?))` | `['obligations','open']` | `vec: true` |
| `{ field: due, before: today }` with `scope: { registers: ['obligations','tasks'], rows: { field: state, not: void } }` | `WHERE register = ? AND register IN (?,?) AND deleted_at IS NULL AND (E(due) < ?) AND ((state IS NULL OR state <> ?))` | `['obligations','obligations','tasks','2026-09-02','void']` | — |
| `null` | `WHERE register = ? AND deleted_at IS NULL` | `['obligations']` | — |
| `inbox_raw`: `{ all: [{ field: from, is: "alerts@hsbc.com.eg" }, { field: subject, contains: "transaction" }] }` | `WHERE ((json_extract(headers,'$.from') = ? AND instr(lower(json_extract(headers,'$.subject')), lower(?)) > 0))` | `['alerts@hsbc.com.eg','transaction']` | — |
| `inbox_raw`: `{ field: ts, after: "-1d" }` | `WHERE (ts > ?)` | `['2026-09-01T12:00:00.000Z']` | — |
| `inbox_raw`, `null` | `''` | `[]` | — |
| the §7 fixture, 1,000 times | total under 1,000 ms | | |
| every statement above | no `"`; every `'…'` literal ∈ {`''`, `'[]'`, `'\'`, `'$.…'`}; `?` count = `params.length` | | |

### 9.6 · `property.test.ts` — the oracle against the compiler

The artefact of 30 §14 #2. One property: **for every row set and every predicate the grammar admits, the ids the
compiled SQL returns equal the ids the evaluator accepts.**

**Fixed schema** (not generated — the operators' applicability is the point, not the schema's variety):

```yaml
things:  { fields: { name: text, n: int, cost: money, due: day, kind: enum [a, b, c], on: bool,
                     tags: list<text>, owner: ref→people },
           search: [name, tags],
           predicates: { hot: { all: [ { field: on, is: true }, { field: n, gte: 10 } ] } } }
people:  { fields: { name: text, state: enum [active, gone] } }
```

**Arbitraries** (`fc` = fast-check 4.9.0):

| Name | Draws |
|---|---|
| `word` | `fc.stringMatching(/^[a-d]{1,4}$/)` — a four-letter alphabet, so `contains`/`matches`/`in` hit often; upper-cased with probability ¼ |
| `text` | 1–3 `word`s joined by a space; `''` with probability ⅒ |
| `money` | `{ amount: fc.integer({ min: 0, max: 1000 }), currency: fc.constantFrom('EGP', 'USD') }` |
| `day` | `fc.date({ min: 2026-08-01, max: 2026-10-31 })` → `YYYY-MM-DD` |
| `instant` | `fc.date({ min: 2026-07-04, max: 2026-11-01 })` → `toISOString()` |
| `maybe(a)` | `fc.oneof({ weight: 6 }, a, { weight: 1 }, fc.constant(null), { weight: 2 }, fc.constant(undefined))` — present · JSON null · absent |
| `personRow` | `{ id: ulid, register: 'people', fields: { name: maybe(text), state: maybe(enum) }, state: <mirrored>, created_at, updated_at, version: 1, deleted_at: null or an instant (¹⁄₆) }` |
| `thingRow(peopleIds)` | `fields` from `maybe(...)` per field — `tags: maybe(fc.array(word, { maxLength: 3 }))` (so `[]` occurs), `owner: maybe(fc.oneof(constantFrom(...peopleIds), ulid))` (a dangling ref ⅓ of the time); `created_at` from `instant`; `deleted_at` null |
| `rows` | `fc.array(personRow, { maxLength: 6 })` then `fc.array(thingRow, { maxLength: 40 })` |
| `temporal(type)` | `fc.oneof(day-or-instant literal, constantFrom(7 anchors), offset)` with offset = sign × `fc.integer(1, 60)` × `d`/`w`, or `fc.integer(1, 3)` × `m` |
| `leaf` | pick a field (incl. `created_at`), pick an operator from `APPLIES[type]` minus `near`, draw a type-fitting literal; `in`/`not_in` arrays of 1–70; `has`/`lacks` on `tags`; `matches` of 1–2 `word`s (with `"` inserted ⅒); `{ predicate: hot }` ⅒; `{ via: owner, field: state|name, <op> }` ⅒ |
| `node(level)` | `level < 3 ? oneof(leaf, group(level + 1)) : leaf` |
| `group(level)` | `{ [constantFrom('all','any','none')]: fc.array(node(level), { minLength: 1, maxLength: 3 }) }` |
| `predicate` | `oneof(leaf, group(1))` — a bare root leaf ¼ of the time |

`near` is excluded (34 §1.8). Every generated predicate passes `validate` by construction; the run asserts it does.

**The `:memory:` database** — `entry` of 30 §1, column-for-column, and `entry_fts`:

```sql
CREATE TABLE entry (
  id TEXT PRIMARY KEY, register TEXT NOT NULL, seq INTEGER, fields TEXT NOT NULL DEFAULT '{}', state TEXT,
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  UNIQUE (register, seq)
);
CREATE INDEX entry_state ON entry(register, state) WHERE deleted_at IS NULL;
CREATE INDEX entry_i_things__due ON entry(json_extract(fields,'$.due')) WHERE register = 'things' AND deleted_at IS NULL;
CREATE VIRTUAL TABLE entry_fts USING fts5(id UNINDEXED, register UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');
```

One `DatabaseSync(':memory:')` per run; `DELETE FROM entry; DELETE FROM entry_fts` between runs is cheaper than
reopening. Rows are inserted with `fields` as `JSON.stringify(fields)` — `undefined` keys vanish, `null` keys stay, so
both kinds of missing reach `json_extract` — and `INSERT INTO entry_fts(rowid, id, register, text)` with
`searchText(fields, schema)` from `last_insert_rowid()`.

**The run**, per case:

1. `refusals = validate(pred, things, schemas)`; assert `[]`.
2. `expected = rows.filter(r => r.register === 'things' && !r.deleted_at && evaluate(pred, r, ctx)).map(r => r.id)`,
   with `ctx.lookup = (reg, id) => live rows of reg by id`.
3. `{ sql, params, uses } = compile(pred, { subject: 'entry', register: 'things', schemas, now, tz, scope: { registers: '*' } })`.
4. `actual = db.prepare('SELECT id FROM entry ' + sql).all(...params).map(r => r.id)`.
5. `assert.deepEqual(actual.sort(), expected.sort())` — **the assertion: the id sets are equal.**
6. `assert(!sql.includes('"'))`; `assert(!/UNION|INTERSECT|EXCEPT/.test(sql))`; the constant-literal regex.
7. `assert.equal(print(parse(print(pred))), print(pred))` — the round trip rides along for free.

`now = '2026-09-02T12:00:00Z'`, `tz = 'Africa/Cairo'`.

**Runs and seeds.** `const FC_RUNS = Number(process.env.FC_RUNS ?? 1000)`; `fc.assert(fc.property(rows, predicate,
run), { numRuns: FC_RUNS, endOnFailure: true })`. On failure fast-check prints `{ seed, path }`; the pair is committed
as `test/seeds/<yyyymmdd>-<n>.json` — `{ "seed": …, "path": "…", "note": "one sentence" }` — and **the test file
replays every file in `test/seeds/` first**, each as `fc.assert(prop, { seed, path, numRuns: 1 })`, before the random
runs. A counter-example is never deleted (30 §14). The `where-property` gate row of 33 §8 runs this file with
`FC_RUNS=10000` under `node --test`, not Vitest (BUILD.md's recorded deviation; §13).

### 9.7 · Gates this spec owns

| Gate | Where | Asserts |
|---|---|---|
| `where-property` | `gates.yml`, nightly | `FC_RUNS=10000 node --test test/property.test.ts` green; `test/seeds/` replayed |
| `refusal-fixtures` (shared) | script | each of the fourteen codes has a `fixtures/refusals/<kebab>.yaml` that `validate` produces |
| `closed-lists` (shared) | script | `OPERATORS.length === 19`, `QUANTIFIERS.length === 3`, `FIELD_TYPES.length === 18` against 34 §6 |
| `graph` (shared) | script | `packages/where` imports nothing; `src/index.ts` does not import `sql.ts` |
| CI row | `ci.yml` | `pnpm --filter @braindog/where typecheck && test` — every file above, `FC_RUNS=1000` |

---

## 10 · Deliberate ceilings

Each is a `ponytail:` comment at the site in the code, verbatim.

| # | `ponytail:` | Adds it back when |
|---|---|---|
| 1 | `ponytail: ASCII case fold only, matching SQLite's lower(); Unicode folding needs an ICU build on both sides` | the record ships an ICU-enabled SQLite and a non-ASCII generator alphabet |
| 2 | `ponytail: matches oracle = alphanumeric split + ASCII fold, no diacritics; unicode61 semantics are approximated for the ASCII generator` | the generator draws Arabic or accented text |
| 3 | `ponytail: normalise is lower(trim(x)) on both sides; internal whitespace is not collapsed because SQLite has no regexp` | a unique-fingerprint collision report that whitespace alone explains |
| 4 | `ponytail: localToUtc is two Intl passes; a wall time inside a DST gap resolves to the second pass, undocumented by any tz database anyway` | a temporal fixture pins a gap and disagrees with a person |
| 5 | `ponytail: IN chunking recombines in one statement, so it does not lower the parameter count; ~95 literal values per predicate is the real ceiling` | one JSON parameter through `json_each(?)` — a fourth subquery form, needing 34 §1.10 amended |
| 6 | `ponytail: spoken refs (register#seq) are bound as given; the record resolves them before compile` | a pack ships a predicate over its own seed rows by spoken id |
| 7 | `ponytail: one refusal per leaf, the first rule that fires` | the builder wants every problem on a row at once |
| 8 | `ponytail: no fuzzy 'did you mean'; fix lists the legal ids` | three support tickets that a Levenshtein of two would have answered |
| 9 | `ponytail: expression depth is not measured; a single group of ~90 leaves would meet maxExprDepth 100` | a builder or an agent produces a group that wide — then count leaves in validate, with a code |
| 10 | `ponytail: uses.indexes names entry_i_<reg>__<field> for money and quantity too; the kernel names the pair` | `kernel` (41) decides the two suffixes; one string function, both sides |
| 11 | `ponytail: near has no compile; uses.vec is the whole plan` | `near` ships after §1b (15) — the two-phase plan is the record's |
| 12 | `ponytail: evaluate is O(rows × leaves) with no short-circuit beyond &&/||` | never; it is a test oracle and a write-path check over one row |
| 13 | `ponytail: print does not flatten; flatten is the caller's` | never — `parse(print(t)) ≡ t` forbids a printer that rewrites |
| 14 | `ponytail: the formatter cache is a Map keyed by tz, unbounded` | a record with more than a few hundred time zones, which is not a record |

Fourteen, counted.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | — | — | zero (35 §2) |
| dev | `typescript` | 6.0.3 | workspace root |
| dev | `@types/node` | 24.13.0 | workspace root; `node:sqlite`, `node:test` types under `test/` |
| dev | `fast-check` | 4.9.0 | the property test — the one property-testing library of 31 §3 |

`node:sqlite` (built-in, Node 24.13.0, SQLite 3.50.4 with FTS5 — 30 §13) and `node:test` are imported under `test/`
only; the `no-restricted-imports` rule on `node:*` (31 §3 layer 4) scopes to `src/`. `Intl.DateTimeFormat` is the
platform's, in Node and in every browser the web app targets.

---

## 12 · Build order

**Needs first:** nothing but the toolchain of BUILD.md — Node 24.13.0, pnpm 11.25.0, TypeScript 6.0.3. `where` has
in-degree 0 in the package graph (31 §2, position 3). It is written third only because `render` and `ports` are the
first two artefacts of 30 §14 and share the phase.

**Unblocks:**

| Package | Which needs |
|---|---|
| `kernel` 41 | `jsonPath` for the index DDL; `searchText` for step 7 of the write path; `derive` and `evaluate` for `required_when:` and `immutable_when:` |
| `declare` 42 | `parse` · `validate` · `flatten` · `print` · `Refusal` — every `where:` in the eight kinds is checked through them at lint |
| `extract` 43 | `compile` over `INBOX_RAW` for `match:` |
| `record` 45 | `compile` for `list`, pages, rules, metrics, alarms, locks, predictions; `evaluate` for the write path |
| `apps/web` 50 | the browser entry for the query builder (21 §4) |
| phase 0 close | "the property test runs 1,000 cases" (BUILD.md) is this package's `FC_RUNS` default |

---

## 13 · Decisions taken here

Four the brief asked for, then the smaller ones the design documents left open. Each names the document to amend
in the same revision (35 §1).

**1 · ASCII folding in the oracle.** The evaluator folds `A–Z` only, for `contains`, `starts`, `ends`, `matches` and
`normalise` — exactly what SQLite's `lower()` and `LIKE` do without ICU — and the property test's alphabet is ASCII.
unicode61's Unicode case folding and `remove_diacritics 2` are outside the property; `matches` on Arabic text is
tested by fixture, not by the oracle. *Rejected:* `toLowerCase()` in the oracle — it folds `İ` and `ß` where SQLite
does not, and the property test would fail on a correct compiler. *Amend* 30 §7's property paragraph: "the oracle
folds ASCII; the generator emits ASCII".

**2 · `''` and `'[]'` as missing, in SQL.** `empty: true` compiles to `(E IS NULL OR E = '' OR E = '[]')` and
`present: true` to its negation, on every type — the two constants are the compiler's, not values. Positive
operators need no guard because the `string` terminal is non-empty (§4.1 item 6): no author literal can equal `''`,
so `E = ?` is false on an empty value by itself, and negatives are already `IS NULL OR <>`. *Rejected:* binding `''`
and `'[]'` as parameters (two more `?` per leaf for nothing) and stripping `''` at write (34 §3 says only `null` is
never stored). *Amend* 34 §1.3: replace `expr IS NULL` / `expr IS NOT NULL` in the `empty`/`present` row with the
two fragments; 34 §1.1: "`string` is one byte or more".

**3 · The `derive` map's home.** `where` owns the `Derive` type and `FieldSpec.derive`; `declare` projects a register
declaration onto `RegisterSchema` and hands the shape down; `kernel`'s read-time derivation is `where.derive()`, so
the SQL inline and the JS value have one definition and the property test could cover them tomorrow. *Rejected:*
`declare` owning the type — `where` is below `declare` and cannot import it; and duplicating the table in `kernel`,
which is the drift the property test exists to prevent. *Amend* 31 §2's `kernel → where` row to name `jsonPath`,
`searchText` and `derive`; 02 §5 to write the four arithmetic inlines as §5.6 has them (`sum`/`diff` coalesce to 0,
`product`/`ratio` propagate missing, `band` NULL-guarded, `normalise` without whitespace collapse).

**4 · `where/text` is deferred, and the deferral is a decision.** There is no third entry and no string grammar in
this package. The text lens of 21 §4.5 is the YAML flow form, converted by `declare` — the only package with a YAML
parser — into the JSON tree that `parse` takes. A `where/text` would be a second parser for the same tree, in the one
package that must stay dependency-free. *Amend* 31 §2's split sentence: "…and there is no `where/text`; the text lens
is `declare`'s".

**The smaller ones:**

| Decision | Amend |
|---|---|
| `MATCH_OP_UNSUPPORTED` is the one code for *this test cannot apply here*: the six absent `inbox_raw` operators, an operator outside `APPLIES[type]` on either backend, a literal of the wrong JS type, `near` off the last leaf of the root `all`. No code for operator × type existed; a new one is refused by the brief; the precedent is `TRANSITION_ILLEGAL` — one code, two moments | 30 §6, its row |
| `FIELD_UNKNOWN` also covers an unknown `predicate:` name and a `via` target register that is not installed — the path and `fix` disambiguate | 30 §6, its row |
| `RELATIVE_UNIT_FOR_DAY` is unreachable from `where` (34 §1.4 already says `h` is not a unit); its row moves to `declare`'s `remind:` check so the fixture gate has a producer | 30 §6 |
| `PATTERN_OVER_CAP` measures the **escaped** `starts`/`ends` literal against 40 bytes — a 40-byte literal of `%` would escape to 80 and meet workerd's 50 — and also fires for a `matches` phrase over 200 bytes, which had a cap and no code | 34 §1.10, 30 §6 |
| `parse` throws `SyntaxError` for a malformed tree; not a `Refusal`, not 422 — a malformed body is 400 at the record | 30 §7 |
| The `via` hop is positive for every operator: no far row (missing ref, dangling ref, soft-deleted target) is `false` even under `not` — the `IN (SELECT …)` form makes it so, and the oracle follows | 34 §1.6 |
| Money and quantity in another currency or unit match none of `is not gt gte lt lte`; `not` compiles to `(C IS NULL OR (C = ? AND A <> ?))`; `uses.currency_excluded` is set on any such leaf | 34 §1.5 |
| `in` chunking is kept as written and bounds nothing: the 100-parameter ceiling is the adapter's and holds the predicate to ~95 literal values; the 130-value case in §9.5 pins the shape and is over the ceiling on purpose. The upgrade is one JSON parameter through `json_each(?)` — a fourth subquery form | 30 §7, 34 §1.10 |
| `ctx` gains `schemas`; `ctx.now` is an RFC 3339 UTC string; `compile(null, ctx)` is the absent `where:` | 34 §1.11, 30 §7 |
| `Refusal` is declared in `where`, the lowest package that raises one; `declare` and `kernel` import the type | 30 §6 |
| `FC_RUNS` defaults to 1,000 (BUILD.md, phase 0); the `where-property` gate runs 10,000 nightly under `node --test` | 33 §8, its row |
| Spoken `register#seq` ref literals pass `validate` and are bound as given by `compile`; the record rewrites them to ids at install, because resolution needs rows and a fourth subquery is refused | 34 §1.1 |
| The six kernel fields are typed: `id` ref · `seq` int · `created_at` `updated_at` instant · `version` int · `state` its enum, only when declared | 02 §6 |
| `near` carries a `field:` (34 §1.2: "every other leaf has one") of type `text` or `document`; it validates, compiles to `uses.vec = true`, evaluates `true` | 34 §1.1 EBNF (its `leaf` rule shows `matches` without a subject) |

**Interface agreement with the sibling specs already drafted** — for the audit's second lens (35 §5):

| Sibling says | This spec | Reconcile by |
|---|---|---|
| 41 §2: `jsonPath(fieldId) → "'$.<id>'"`, imported from the root entry | `jsonPath(field, key?)` returns the whole `json_extract(fields,'$.<id>[.key]')` expression and lives in `./sql`, so the money and quantity pair need no string surgery and the root entry stays free of SQL | 41 imports from `@braindog/where/sql` and drops its own `json_extract(` wrapper |
| 41, 42: `jcs` from `@braindog/where` | exported, §2.4 | — |
| 42 §5: `validate(tree, { backend, consumer, fields, predicates })` | `validate(pred, schema: RegisterSchema, schemas)` — `schema` carries `id`, `backend`, `fields`, `predicates`, `search`, `series`; `schemas` is needed for `via` and `ref` targets; there is no `consumer` — `near`'s placement is structural (L18) and the rule/lock/match ban on `near` is one check on the root's last leaf in `declare` | 42 passes its `RegisterSchema` projection and the pack's schemas |
| 43 §5: `evaluate(match, subject, { subject: 'inbox_raw', now, tz })` | accepted as written — `EvalCtx.subject` selects `INBOX_RAW` (§2.4) | — |
| 46 §2: `import('@braindog/where').Where` | `export type Where = Predicate` | — |
| 50 §5: `where.evaluate(leaf, value, { now, tz })` — a leaf over one cell | `evaluate` takes a row; a cell test is `evaluate(leaf, { fields: { [leaf.field]: value } }, { now, tz, schema })` | 50 wraps the value |
| 52 §9: `where-property` at 1,000 runs ≤ 20 s, seeds replayed first | the same numbers, §7 and §9.6 | — |

---

## 14 · Done when

- [ ] `packages/where` exists with the seven files of §3 and the two entries of §1; `pnpm --filter @braindog/where typecheck` is clean under `tsconfig.base.json`.
- [ ] Every signature of §2 is exported with the stated types; nothing else is importable.
- [ ] `tree.test.ts`, `validate.test.ts`, `temporal.test.ts`, `evaluate.test.ts`, `compile.test.ts` pass with every row of §9.1–§9.5 as a case, exact strings included.
- [ ] `property.test.ts` runs `FC_RUNS=1000` green in under 20 s and `FC_RUNS=10000` green nightly; `test/seeds/` exists and holds every counter-example the build found, the first one included (52 §14); a seed is never deleted.
- [ ] The fourteen `GRAMMAR_CODES` each have a `fixtures/refusals/<kebab>.yaml` that `validate` produces, and the `refusal-fixtures` gate passes.
- [ ] No compiled statement in any test contains `"`, an unlisted `'…'` literal, or a `?` count different from `params.length`.
- [ ] The fourteen `ponytail:` comments of §10 are in the source, verbatim.
- [ ] The amendments of §13 are applied to 02, 30, 31, 33 and 34 in the same revision, and BUILD.md's loop table records the iteration.
- [ ] `kernel`'s index DDL and `searchText` (41) and `declare`'s lint (42) import from this package and nowhere else.

---

*Next: [39-SPEC-THEME](39-SPEC-THEME.md).*
