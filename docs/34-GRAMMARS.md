# 34 · The grammars

Three small languages an implementer has to build, written down to the level a parser can be written from:
the `where:` predicate (§1), the write-up dialect (§2), and the JSON every value type takes inside a row (§3).
Then the lexical rules everything else leans on — identifiers and spoken ids (§4), canonical bytes for every
checksum (§5) — and one index of every closed list with its count and its owner (§6).

> **Why this document exists.** [30-BLUEPRINT](30-BLUEPRINT.md) §12 recorded the dialect grammar as open and blocking
> stage 0. A review of the whole corpus on 2026-09-02 found the `where:` grammar was in the same state: nineteen
> operators defined, a root production never written, no rule for a missing value, and three documents disagreeing
> on what `contains` compiles to. **Nothing here is new design.** It is the grammar the corpus already implied,
> decided where it was silent, and stated once.

Notation: EBNF over the *abstract* syntax. The concrete form is YAML in a pack and canonical JSON in
`declaration.body`; `where.parse` takes the JSON ([33-CONTRACTS](33-CONTRACTS.md) §1). Terminals in quotes.

---

## 1 · `where:` — the predicate grammar

One grammar, seven consumers: pages, rules, metrics, alarms, locks, predictions, ingest `match:`
([02-DATA-MODEL](02-DATA-MODEL.md) §6, canonical). Two backends: `entry` and `inbox_raw`.

### 1.1 · Syntax

```ebnf
predicate   = group | leaf ;                        (* a bare leaf is legal at the root *)
group       = quantifier ":" "[" node { "," node } "]" ;
quantifier  = "all" | "any" | "none" ;              (* none = NOT any *)
node        = group | leaf ;                        (* depth ≤ 3, the root group is level 1 *)

leaf        = "{" subject "," test "}"
            | "{" "matches" ":" string "}"             (* the register, no subject — full-text, entry backend only, §1.2 *)
            | "{" "predicate" ":" predicate-id "}" ;   (* a named predicate of the same register, §1.7 *)
subject     = "field" ":" field-id
            | "via" ":" ref-field "," "field" ":" field-id ;   (* one hop, §1.6 *)

test        = ( "is" | "not" ) ":" scalar
            | ( "in" | "not_in" ) ":" "[" scalar { "," scalar } "]"
            | ( "gt" | "gte" | "lt" | "lte" ) ":" ordered
            | ( "before" | "after" ) ":" temporal
            | "between" ":" "[" temporal "," temporal "]"      (* inclusive *)
            | "contains" ":" string                             (* substring, ≤ 40 bytes *)
            | ( "starts" | "ends" ) ":" string                  (* ≤ 40 bytes, measured after escaping *)
            | ( "empty" | "present" ) ":" "true"
            | ( "has" | "lacks" ) ":" scalar                    (* list<T> *)
            | "near" ":" "{" "text" ":" string [ "," "k" ":" integer ] "}" ;   (* on a text or document field, §1.8 *)

scalar      = string | number | boolean | money | quantity | ref-literal | day | instant ;
ordered     = number | money | quantity | temporal | duration ;
string      = byte { byte } ;                       (* one byte or more — the empty string is missing, §1.3 *)
money       = "{" "amount" ":" integer "," "currency" ":" iso4217 "}" ;
quantity    = "{" "value" ":" number "," "unit" ":" unit "}" ;
ref-literal = entry-id | register "#" seq ;         (* either form of §4.2 *)
duration    = integer ;                             (* seconds *)

temporal    = day | instant | relative ;
day         = digit digit digit digit "-" digit digit "-" digit digit ;
instant     = rfc3339-utc ;                         (* "Z", millisecond precision *)
relative    = anchor | offset ;
anchor      = "today" | "tomorrow" | "yesterday" | "bom" | "eom" | "boy" | "eoy" ;
offset      = ( "+" | "-" ) digit { digit } unit ;  (* 1–4 digits *)
unit        = "d" | "w" | "m" ;                     (* day, week, calendar month — clamped *)
```

Nineteen operators, one modifier (`via`), three quantifiers, one reference form (`predicate`). **Counted.** A
`ref-literal` in its spoken form (`register#seq`) passes `validate` and is bound as given by `compile`; the record
rewrites it to an id at install (38 §13).

### 1.2 · Operators, by type

| Operator | Applies to | `entry` compiles to | Notes |
|---|---|---|---|
| `is` / `not` | every type | `expr = ?` / `(expr IS NULL OR expr <> ?)` | `bool` binds 1/0; money and quantity take the two-expression form of §1.5 |
| `in` / `not_in` | enum · ref · text · int | `IN (…)` chunked at 64 | chunks of `in` joined by `OR`, of `not_in` by `AND`, one parenthesis; the chunk bounds the statement's shape — the parameter ceiling is the adapter's (33 §1) |
| `gt gte lt lte` | int · decimal · money · quantity · day · instant · duration | comparison | money/quantity: two expressions, §1.5 |
| `before` / `after` / `between` | day · instant | comparison on the resolved literal | `between` inclusive both ends |
| `contains` | text · document · url · email | `instr(lower(expr), lower(?)) > 0` | **substring**, ASCII case-folded, ≤ 40 bytes (`CONTAINS_TOO_LONG`); a scan, honestly |
| `matches` | *the register* (no `field:`) | `id IN (SELECT id FROM entry_fts WHERE register = ? AND entry_fts MATCH ?)` | whole-token, case-folded, diacritic-insensitive; over the register's `search:` fields; operand = one quoted phrase with `"` doubled, ≤ 200 bytes (`PATTERN_OVER_CAP`) |
| `starts` / `ends` | text · url · email | `LIKE ? ESCAPE '\'` | `%` and `_` in the literal are escaped; ASCII case-insensitive; ≤ 40 bytes **after** escaping (`PATTERN_OVER_CAP`) |
| `empty` / `present` | every type | `(expr IS NULL OR expr = '' OR expr = '[]')` / its negation | §1.3 defines missing; these are its three SQL spellings (38 §13 D2) |
| `has` / `lacks` | `list<T>` | `EXISTS (SELECT 1 FROM json_each(expr) WHERE value = ?)` | `lacks` is `NOT EXISTS` and true on a missing list |
| `near` | text · document | none — §1.8 | ranking, not filtering |

`expr` is `json_extract(fields, '$.<id>')`, except `state`, which reads the mirrored column, and the kernel fields
`id seq created_at updated_at version`, which read their columns. A `matches` leaf has no `field:`; every other leaf has one.

### 1.3 · Missing values — the rule the property test needs first

A field that is **absent**, JSON `null`, the empty string or the empty list is *missing*.

| Leaf | On a missing value |
|---|---|
| `empty: true` | **true** |
| `present: true` | false |
| every positive operator — `is in gt gte lt lte before after between has contains matches starts ends` | **false** |
| every negative operator — `not not_in lacks` | **true** |
| `none:` | `NOT (any: …)` over branches already made two-valued by the rows above |

So `{ field: owner, not: sam }` matches a row with no owner, which is what a person means by it. In SQL a missing
value has three spellings — `NULL`, `''` and `'[]'` — because a write never stores any of them (§3) but an import or
an older row may carry one; `empty`/`present` test all three, and the property test's row generator emits all three.
The compiler emits `(expr IS NULL OR expr <> ?)` for the negatives and a plain comparison for the positives, whose SQL
`NULL` already reads as false — and a `string` literal is never empty, so `<> ?` is true on `''` too. The reference
evaluator implements the table above literally, and the two agree by construction. **Decided in
[ADR-058](16-DECISIONS.md).**

### 1.4 · Temporal literals

Resolved **once, at compile time**, against `ctx.now` in `ctx.tz`, and bound as a parameter — never computed in SQL,
so a compiled query is reproducible and a test can pin the clock.

| Literal | On a `day` field | On an `instant` field |
|---|---|---|
| `today` · `tomorrow` · `yesterday` | that calendar day in `ctx.tz` | 00:00:00 of that day in `ctx.tz`, as a UTC instant |
| `bom` · `eom` · `boy` · `eoy` | first/last day of the current month/year in `ctx.tz` | 00:00:00 of that day, as above |
| `+30d` · `-1w` · `+2m` | `today` ± the offset; `m` is a calendar month, clamped to the last day | `ctx.now` ± the offset |

`h` is not a `where:` unit; it is legal only in `remind:` ([02-DATA-MODEL](02-DATA-MODEL.md) §4). An unknown literal is
refused at install — `RELATIVE_LITERAL_UNKNOWN`, naming it. An `h` or `m` offset against a `day` field would be
`RELATIVE_UNIT_FOR_DAY` if `h` were legal; it is not, so only the month-clamp rule needs stating.

### 1.5 · Money and quantity

A `money` field is two expressions — `json_extract(fields, '$.<id>.amount')` and `…'$.<id>.currency')` — and
`index: true` on it creates both indexes. `gt gte lt lte is not` compile to `currency = ? AND amount <op> ?`; a row
in another currency matches none of the six — `not` compiles to `(currency IS NULL OR (currency = ? AND amount <> ?))`,
so a foreign-currency row is not a match even under negation — and is counted in `uses.currency_excluded` so a total
can say so. A money literal without a currency is refused at install (`MONEY_LITERAL_NEEDS_CURRENCY`). `quantity` is
the same shape over `value` and `unit` (`QUANTITY_LITERAL_NEEDS_UNIT`). **Two currencies are never compared, and never
added.**

### 1.6 · `via:` — exactly one hop

`{ via: period, field: state, is: closed }` reads *the period this row points at is closed*. `via:` names the
`ref` field on this row; `field:` names the field on the far row. It compiles to one indexed subquery:

```sql
json_extract(fields, '$.period') IN (
  SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND <leaf compiled on that register>
)
```

The hop is positive for every operator: a missing ref, a dangling ref or a soft-deleted target makes the leaf false,
even under `not` or `not_in` — the `IN (subquery)` form has no `IS NULL` escape (38 §13). A second `via:` is refused
(`VIA_TWICE`). A `via:` leaf may not carry `matches`, `has`, `lacks` or `near` — a subquery inside a subquery — and
is refused `VIA_NESTED_SUBQUERY`. The same two keys, in the same roles, are how `derive: { via: account, field:
currency }` reads one field across one hop.

### 1.7 · Named predicates

A register may declare `predicates: { overdue: { all: [ … ] } }`. The leaf `{ predicate: overdue }` expands at
compile time; the expansion counts toward the depth cap; a cycle is refused (`PREDICATE_CYCLE`). A saved view is a
named predicate plus an `order:`, addressed as `register.predicate` (`/v/obligations.overdue`) — which is what the interface's "save this filter" does.

### 1.8 · `near` — ranking, not filtering

`near: { text: "…", k: 20 }` is legal only as the last leaf of a root `all:`, never inside `any:` or `none:`,
and never in a rule, a lock, a prediction or a `match:`. The rest of the predicate selects at most 5,000 candidate
ids in SQL; the record scores int8 cosine over `entry_vec` in JS and truncates to `k` (default 20, max 100).
`uses.vec = true` marks the two-phase plan. It is **outside the property test** and has its own fixtures, because an
80-line evaluator cannot reproduce an embedding. Deferred past the §1b shape of [15-ROADMAP](15-ROADMAP.md).

### 1.9 · The second backend — `inbox_raw`

Ingest `match:` predicates over an arrival, not a row. Legal `field:` names are exactly
`from to subject body channel state ts`. `from`, `to` and `subject` compile to `json_extract(headers, '$.<name>')`
(headers are lower-cased on arrival); the rest are columns. `via has lacks near matches starts ends` are refused on
this backend (`MATCH_FIELD_UNKNOWN`, `MATCH_OP_UNSUPPORTED`). `contains` is the same `instr` on both backends,
which is why an author never learns there are two.

### 1.10 · Limits, and the three legal subqueries

| Rule | Value |
|---|---|
| Nesting depth | 3, counting the root group; same-quantifier nesting is flattened on save |
| `IN` chunk | 64 values a chunk — bounds the statement's shape; the 100-parameter ceiling is the adapter's (33 §1), not the grammar's |
| Text literals | `contains starts ends` ≤ 40 bytes, `starts`/`ends` measured after escaping; `matches` phrase ≤ 200 bytes — over either of the last three caps is `PATTERN_OVER_CAP`, over `contains`' is `CONTAINS_TOO_LONG` |
| Internal subqueries the compiler may emit | **three, and only three**: the FTS5 set-membership test (`matches`), the `via:` hop, and `json_each` existence (`has`/`lacks`). None is author-writable; a `json_each(?)` form for a long `in` list would be a fourth and is not emitted |
| String literals in emitted SQL | single-quoted only; values are bound (double-quoted strings are identifiers in `node:sqlite`) |

### 1.11 · The compile contract

```
compile(predicate | null, ctx) → { sql, params, uses }
  sql  = the WHOLE clause: 'WHERE register = ? AND deleted_at IS NULL AND (…)'; null = an absent where:, every row
  ctx  = { subject: 'entry' | 'inbox_raw', register, schemas, now, tz, includeDeleted?, scope: { registers: '*' | string[], rows?: predicate } }
  uses = { fts: bool, vec: bool, indexes: string[], currency_excluded: bool }
evaluate(predicate, row, { subject, now, tz }) → boolean        the reference evaluator, exported beside compile
```

`compile` returns the **whole** `WHERE` clause; the kernel composes `SELECT … FROM entry <compiled.sql> AND <its own
terms>` and never splices a fragment into a `WHERE` of its own. `includeDeleted` is a `ctx` flag that drops the
`deleted_at IS NULL` term — not a kernel rewrite. `ctx.schemas` is required: one `RegisterSchema` per installed
register, built by `where.toSchema(declarationBody)`, so the kernel needs nothing from `declare`. `ctx.now` is an RFC
3339 UTC string. `ctx.scope.rows` is `AND`-ed **inside** the SQL, never filtered after ranking. `evaluate` is the
evaluator the property test runs — over the stored body for `matches`, never the normalised one — and `where` also
exports `derive`, `searchText`, `normalise`, `jcs` and `jsonPath`: the grammar's helpers, imported by the kernel, so the
stored `unique:` fingerprint and the compiled inline share one definition (38 §2). The property test in
[30-BLUEPRINT](30-BLUEPRINT.md) §7 generates a random predicate and a random row set, evaluates §1.2–§1.3 in plain
JS, runs the compiled SQL over the same rows, and asserts the two sets are equal — 1,000 runs in CI, 10,000 nightly
([33-CONTRACTS](33-CONTRACTS.md) §8). Every failing `{seed, path}` is committed as a permanent example.

---

## 2 · The dialect — what an agent writes into a `document`

Fenced blocks with a positional row grammar, `{{path}}` interpolation with eight typed forms, and inline evidence
tags. Sixteen kinds ([05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §2). The renderer rules are 05 §7.4; this
section is the syntax under them. The record's `dialect()` answers from its own `DIALECT` constant, kept equal to
`render`'s kinds by the `closed-lists` gate — `record` never imports `render`.

### 2.1 · Blocks

```ebnf
document    = { segment } ;
segment     = drawn-block | markdown ;              (* a flat scan: the next fence line closes a block *)

drawn-block = fence info NL { row NL } fence ;      (* EOF closes an open block as a fence would *)
fence       = "```" ;
info        = kind [ ws "|" ws heading [ ws "|" ws tone ] ] ;   (* regex ^(?<kind>[a-z]+)(\s*\|\s*(?<heading>.*))?$ — then the heading is row-split *)
kind        = "note" | "quote" | "stat" | "bar" | "gauge" | "chips" | "spec" | "params"
            | "todo" | "steps" | "timeline" | "board" | "code" | "tree" | "comparison" | "table" ;
row         = cell { ws "|" ws cell } [ ws "|" ws tone ] ;
cell        = { char - "|" - NL | "\|" | "\\" } ;   (* \| is a literal pipe, \\ a literal backslash *)
tone        = "good" | "warn" | "bad" | "info"      (* the four words *)
            | "earn" | "danger" | "accent" | "risk" (* aliases → good bad info warn *)
            | "hole" ;                              (* bar only: the row that is a task *)
```

Rows are split on `|` **after** unescaping. A trailing cell that is one of the tone words is the tone — on every
split kind, and on the heading, where it is the block's tone; anything else in that position is a cell. An empty info
string is a `code` block with no language. The fence regex admits `[a-z]+` only: a pack's block kind, whose id may
carry a digit or `_` (22 §3), is page-only and never fenced in a write-up. `{{path}}` is substituted **per cell,
after splitting**, and a substituted value is never re-parsed — so a value containing `|` cannot add a column.

### 2.2 · Row shape per kind

| Kind | Rows | Cells, in order |
|---|---|---|
| `note` | body is markdown, no cells | heading = a **kicker**, two or three words, small caps |
| `quote` | one | text · attribution |
| `stat` | one per figure, ≤ 6 | label · figure · note · *tone* |
| `bar` | one per bar | label · number · note · *tone* (`hole` draws last, in `warn`, outside the scale, as a button) |
| `gauge` | one | label · value · target · *tone* |
| `chips` | one row is one run | glyph · figure · word · *tone* — a chip needs a number and a word |
| `spec` | one per line | label · value · note |
| `params` | one per line | label · value · note |
| `todo` | one per item | `[ ]`, `[x]` or `[X]` at the start of the first cell — absent means not done — then title · detail; rendered as a disabled checkbox |
| `steps` | one per step | title · detail · state |
| `timeline` | one per event | date · title · detail · *tone* |
| `board` | one per card | column · title · detail |
| `code` | verbatim | heading = the language; rows are not split |
| `tree` | indentation-significant | two spaces per level; rows are not split |
| `comparison` | header row, then rows | the header fixes the column count |
| `table` | **page-only** | rows come from `source:` with declared `columns:`; a `table` fence in a write-up degrades |

Under-arity leaves the trailing cells absent. Over-arity, or a kind not in the twenty, degrades the block to its
visible fence with one line above it naming the kind and the row (`DIALECT_ARITY`, `DIALECT_KIND_UNKNOWN`). **A
document is never refused for its dialect** — the fence is the feedback channel, at render, never at write. The
per-kind markup — element and class names — is 36 §5.9's, mirrored in 05 §7.7; this table is the row shape under it.

### 2.3 · Inline forms

```ebnf
inline        = code-span | interpolation | typed | evidence | text ;
code-span     = "`" { char - "`" } "`" ;            (* lifted first; nothing inside is parsed *)

interpolation = "{{" path "}}" ;
path          = segment { "." segment } ;
segment       = identifier | register "#" digits ;
identifier    = letter { letter | digit | "_" | "-" } ;

typed         = "{{" typed-kind ":" argument "}}" ;
typed-kind    = "date" | "day" | "until" | "ago" | "money" | "quantity" | "pct" | "ref" ;
argument      = literal | path ;                    (* a literal starts with a digit or "-"; a path with a letter *)

evidence      = "{" tag [ ":" ws source ] "}" ;
tag           = "verified" | "inferred" | "estimate" | "unknown" ;
source        = { char - "}" - "|" | interpolation } ;   (* runs to the first }, may not contain |; may hold an interpolation whole *)
```

**Paths resolve in this order:** a field of the current row · a metric id · `register#seq.field` (the register is
required; every register has a `#1`) · `register.count` · `register.<state value>` (rows in that state) ·
`portfolio.<metric>` (a metric whose `source:` is `*`). A path that names nothing renders as the path, marked
unresolved. A path that resolves to a missing value renders `—`. Never blank, never zero.

**Typed arguments.** `date day until ago` take `YYYY-MM-DD`. `money` takes `<integer minor units> <ISO 4217>` and
renders `EGP 1,299.00` with the currency's exponent (`JPY 1,299`). `quantity` takes `<decimal> <unit>`. `pct` takes
a signed decimal and carries **no colour** — down is not bad. `ref` takes `register#seq` and links. **Any argument
may instead be a path**: `{{until:renews}}`, `{{money:cost}}`, `{{ref:parent}}` — which is how a rule's `say:`
template names a row's own values. There is no conditional form and no pipe form; two earlier examples that used
them were rewritten. An argument that does not parse renders as the author's text, marked. Eight typed kinds,
counted; a path has no colon, so the two forms cannot collide.

**Evidence tags** are inline, so they work inside a blocker, a reason and a list item. Inside a drawn row a tag
sits in one cell. Any other `{word}` is text; to write a literal tag, put it in a code span.

### 2.4 · Kinds are data

A kind is a named composition of primitives plus a query. The twenty ship as one `as const` TypeScript table,
`packages/render/src/kinds.ts` — `render`'s `KINDS`, beside `PRIMITIVES`, `parse`, `toHTML` and `render` at the root, and
no `expand`: kinds expansion is `declare`'s — so a first-party kind and a pack's kind take one code path. The closed key
list per primitive (`parts children rows columns{field,label,width,align} empty value accepts`) is `declare`'s schema;
`render` has no dependencies and validates nothing. `$<name>` binds to a key in `accepts:` and nothing else,
substituted as a whole node, never spliced into a string. `PRIMITIVES_VERSION = 1` at stage 0.

---

## 3 · Canonical JSON for the sixteen value types

The byte-exact shape each type takes inside `entry.fields`. Step 3 of the write path coerces to it; the compiler
compares against it; the checksum in §5 is computed over it.

| Type | JSON | Rule |
|---|---|---|
| `text` | string | never itself JSON-quoted (`TEXT_JSON_QUOTED`); no literal `\n` where a newline was meant (`TEXT_ESCAPED_NEWLINE`) |
| `document` | string | the dialect of §2, LF line endings |
| `int` | integer | `|n| ≤ 2^53 − 1`, else `INT_OUT_OF_RANGE` |
| `decimal` | number | ≤ 15 significant digits, else `VALUE_MALFORMED`; never money |
| `money` | `{ "amount": 131624600, "currency": "EGP" }` | integer minor units; the key is `amount`, never `minor`; the exponent comes from `Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits`, cached per code — **no package ships a currency table**; `extract` holds only a symbol → code map for detection and refuses a bare `$` |
| `quantity` | `{ "value": 1.4, "unit": "m" }` | two units are never added or compared |
| `day` | `"2026-09-02"` | no time zone; renders at noon UTC |
| `instant` | `"2026-09-02T14:03:11.000Z"` | RFC 3339, UTC, `Z`, millisecond precision; a malformed one is `VALUE_MALFORMED` |
| `duration` | integer | seconds; displays as `3d 4h` |
| `bool` | `true` / `false` | bound to SQL as `1` / `0` — `Param` has no boolean |
| `enum` | string | one of the field's `values:` (`ENUM_VALUE_UNKNOWN`) |
| `ref` | string | the target `entry.id`; the target register is declared, not stored (`REF_REGISTER_MISMATCH` at write); an unresolvable id or spoken ref is `VALUE_MALFORMED` |
| `file` | `{ "sha256": "…64 hex…", "mime": "image/png", "bytes": 48213, "name": "front.png" }` | bytes live in the blob store under the record's prefix |
| `url` | string | absolute; `https:` or `mailto:` only |
| `email` | string | one addr-spec; the domain lower-cased |
| `secret` | string | the `grant.id`; never a value |
| `list<T>` | array of T | element shape from `of:`; the empty list is *missing* |
| `json` | any JSON | the escape hatch; never indexed |

Sixteen value types and two meta, as [02-DATA-MODEL](02-DATA-MODEL.md) §5 counts them. A field absent from
`fields` is missing (§1.3); a write never stores `null`, `""` or `[]` — the key is dropped. A value outside its type's
shape that step 3 cannot coerce is `VALUE_MALFORMED` (41 §13 #13), the refusal this table once left unnamed.

---

## 4 · Identifiers and spoken ids

| Thing | Grammar | Notes |
|---|---|---|
| Register id, field id | `^[a-z][a-z0-9_]{0,31}$` | so `json_extract` paths and index names never need quoting |
| Pack id | `^[a-z][a-z0-9-]{1,63}$` | globally unique in the Kennel |
| Record slug | `^[a-z][a-z0-9-]{1,31}$` | `record_dir.slug`; `<slug>@in.brain.dog`; `<data>/<slug>/` on a self-host |
| Declaration id | `<kind>.<id>` | the spoken form authors use — `register.obligations` |
| Entry id | 26-char ULID | never spoken |
| Record id | `rec_` + 26-char ULID | `record.id`; R2 prefixes, AAD, `dog_meta` |
| Person id | `p_` + 26-char ULID | minted by the Directory |
| Grant id | `g_` + 26-char ULID | `grant.id`; the value a `secret` field holds |
| Prefixed spoken id | an installed prefix `^[A-Z][A-Z0-9]{0,3}$`, then `[1-9][0-9]*` | `D41`, `SG23`, `S42`, `LN7`. Read against the installed prefixes, never split by one pattern: `^([A-Z][A-Z0-9]{0,3})([1-9][0-9]*)$` is greedy and reads `S42` as `S4` and 2 |
| Qualified spoken id | `^([a-z][a-z0-9_]*)#([1-9][0-9]*)$` | `tasks#125` |
| Index names | `entry_i_<reg>__<field>` · `entry_u_<reg>__<field>` · `entry_k_<reg>` · `entry_created_by`; a `money` or `quantity` field adds a third segment — `__amount` / `__currency`, `__value` / `__unit` | the double underscore is the separator, so `a_b`+`c` and `a`+`b_c` cannot collide |

**Reserved field ids:** `id seq register created_at updated_at deleted_at version spoken title`; `state` unless it
is an `enum`; anything beginning `_` (the kernel's own, e.g. `_rule _parent _each`). A reserved or `_`-prefixed key
arriving from the boundary is `FIELD_UNKNOWN`.

**Prefixes.** `#` is the display default and **never resolves bare** — `get('#7')` is ambiguous the moment two
registers keep it, and is refused `REGISTER_UNKNOWN`. A prefixed id is resolved against the installed prefixes:
`get('S42')` finds the register whose `seq_prefix` is `S` and reads the rest as its number. So one prefix may not
overlap another in speech. Two overlap when they are equal, or when one is the other followed by digits, as `P` and
`P2` do, because `P21` reads as either; `S` and `SG` do not, because `SG12` is never `S` and a number. An
overlapping prefix is `SEQ_PREFIX_TAKEN` at install. `D`, `SG` and `S` are the kernel's: decisions, suggestions
and the `session` register. `get` accepts `{ spoken }`, `{ register, seq }` or `{ id }`.

**Allocation.** `seq`, `D<n>` and `SG<n>` come from the `counter` table:
`UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1`, inside the write transaction. Race-free
because the object is single-writer. A purged row's number is never reissued — a spoken id is stable forever.

---

## 5 · Canonical bytes for every checksum

| Checksum | Over | Algorithm |
|---|---|---|
| `declaration.checksum` | the declaration body | SHA-256 of the RFC 8785 (JCS) form of the JSON, lower-case hex |
| `pack.checksum` | manifest + declarations | SHA-256 of JCS after YAML → JSON |
| `migration.checksum` | the SQL string the migration's `.ts` module exports | SHA-256 of the text after CRLF → LF |
| `dog_manifest.sha256` | one table | the **canonical projection**: rows ordered by primary key (the tables without one by the orderings 41 §5.10 states); each row the JCS array of column values in declared order — `NULL` → `null`, INTEGER → number, REAL → JCS number, TEXT → string, BLOB → `{"b64": "…"}`; rows joined by LF; UTF-8; no unicode normalisation |
| `dog_sig.sig` | the manifest | Ed25519 over the canonical projection of `dog_manifest` ordered by `table_name`; keys are raw 32 bytes, base64url; `key_id` = the first 16 hex of SHA-256(public key) |
| `kek_id` | the KEK | the first 18 hex of SHA-256(raw KEK) |

The `.dogl` is the canonical projection written out — 41 §5.10's line format, one table after another in
`dog_section` order — so `dog_manifest.sha256` is checkable with `sed` and `sha256sum`. The vault's bytes — the AAD
and the sealed shape `{ ciphertext, nonce, aad, kek_id, wrapped_dek }` — are defined once, in
[12-SECURITY](12-SECURITY.md) §6, and `‖` in this corpus means byte concatenation.

Hashing content rather than page bytes is what lets two exports of an unchanged record be provably identical
across three SQLite builds ([03-DOG-FORMAT](03-DOG-FORMAT.md) §3). `.gitattributes` in commit one keeps the
checked-in fixtures LF so the same hash comes out on Windows and Linux CI ([31-STACK](31-STACK.md) §7).

---

## 6 · Every closed list, counted, with its owner

| List | Count | Members | Owner |
|---|---|---|---|
| Value types | 16 + 2 meta | §3 | 02 §5 |
| Pack kinds | 8 | `register page block ingest rule metric theme digest` | 04 §1 |
| Block kinds | 20 | §2.1 — one TypeScript table, `render`'s `KINDS` | 05 §2 |
| Post-v1 kinds | 4 | `diagram sparkline series forecast` | 05 §2 |
| Layout primitives | 8 | `panel grid rows proportional inline list table media` | 05 §1 |
| Tone words | 4 (+4 aliases, +`hole`) | `good warn bad info` | 13 §2.3 |
| Typed interpolations | 8 | `date day until ago money quantity pct ref` | 05 §7.2 |
| Evidence tags | 4 | `verified inferred estimate unknown` | 05 §7.3 |
| `where:` operators | 19 + `via` + `predicate` | §1.1 | 02 §6 |
| Quantifiers | 3 | `all any none` | 02 §6 |
| `where:` consumers | 7 | pages rules metrics alarms locks predictions ingest `match:` | 02 §6 |
| Aggregations | 11 | `sum count avg min max delta median distinct last running trend` | 08 §2 |
| Combinators | 3 | `ratio diff product` | 08 §2 |
| `derive:` combinators | 7 | `sum diff product ratio band via normalise` | 02 §5 |
| Rule actions | 10 | `set untag move schedule suggest link notify tag create stop` | 07 §6 |
| Extractors | 10 + 3 | `after before between money date text int decimal enum lookup` · `first nth default` | 07 §4 |
| Notification fields | 6 | `tone say because to key urgent` | 09 §4 |
| Series kinds | 5 | `gauge flow cumulative unique fact` | 08 §3 |
| Suggestion body kinds | 4 (+ `query`, never filed) | `options pattern rowset change` · `query` is the palette's unfiled answer | 23 §4 |
| Refusal codes | 122, in 9 families | pack and declaration 52 · grammar 14 · write path 18 · auth and vault 7 · format and lifecycle 8 · dialect 2 · spark 5 · connector 12 · host and client 4 | 30 §6 |
| `SqlErrorCode` | 13 | 33 §3 — the adapter vocabulary, not refusal codes | 30 §13 |
| `Http` error names | 4 | `PrivateRange TooLarge Timeout Network` — a vocabulary, not refusal codes | 33 §1 |
| Event kinds | 40 | 30 §2 | 30 §2 |
| Schedule kinds | 12 | `digest reminder rule retry purge rotate pull call poll analyse score snapshot` | 30 §1 |
| `schedule.state` | 5 | `pending firing done failed paused` | 09 §1 |
| Outbox kinds | 9 | `notify.email notify.push notify.webhook pull.fetch export.r2 erase.r2 infer.embed infer.prose infer.draft` | 30 §1 |
| Outbox states | 5 | `pending leased done failed dead` | 30 §1 |
| `inbox_raw.channel` | 5 | `email webhook pull paste api` | 30 §1 |
| `inbox_raw.state` | 7 | `untriaged matched skipped review proposed ignored erased` | 30 §1 |
| Member levels | 5 | `read append write decide owner` | 20 §1 |
| Token scopes | 3 | `read propose write` | 10 §2 |
| Principal kinds | 6 | `person token runner share system spark` | 33 §2 |
| Device-grant statuses | 6 | `pending approved active expired denied revoked` | 12 §6.1 |
| `device_grant.reach` | 6 | `login runner export import pack token` — the last four are operation grants | 30 §1 |
| Job kinds | 4 | `triage explain propose draft` | 26 §4 |
| Job statuses | 9 | `queued claimed ok needs_decision refused limit error interrupted cancelled` | 26 §5 |
| Job event kinds | 9 | `start say think tool out limit note end error` | 26 §5 |
| Grant kinds | 5 | `api_token password ssh_key recovery_codes note` | 12 §6 |
| Vault key purposes | 3 | `record connector signing` | 12 §6 |
| Connector `auth.kind` | 8 | 25 §3 | 25 §3 |
| Connector placeholders | 5 | 25 §3 | 25 §3 |
| `fetch.read.format` | 5 | `json csv xml html_table text` | 25 §3.2 |
| `.dog` sections | 5 | `data origin governance local header` | 03 §3 |
| Kernel tables | 27 + 4 header | 30 §1 | 30 §1 |
| `local` tables | 6 | `token device_grant auth_fail observation job job_event` — the other 25 travel | 02 §1 |
| Erase stores | 19 + R2 | 02 §10, in one transaction; R2 through the outbox is the twentieth | 02 §10 |
| Record methods | 77 | 12 DATA · 13 READ+ · 4 VAULT · 7 JOBS · 22 ADMIN · 19 INTERNAL — 33 §2 | 30 §5 |
| RPC groups | 6 | `DATA READ+ VAULT JOBS ADMIN INTERNAL` | 30 §5 |
| `/auth/*` routes | 10 | 33 §4 | 33 §4 |
| DO classes | 3 | `Record Spark Directory` | 01 §1 |
| Packages | 13 | `render ports where theme fixtures kernel declare extract record mcp spark connect host`, in build order | 31 §2 |
| Ports | 9 + `Ingress` | `Sql Scheduler Clock Blobs Inference Dispatch Http KeyStore Snapshots` | 31 §5 |
| Guarded SQL keywords | 6 | `BEGIN COMMIT END ROLLBACK SAVEPOINT RELEASE` | 33 §1 |
| `Assert` methods | 4 | `ok equal deepEqual fail` | 33 §3 |
| Theme checks | 16 | A–P | 28 §4 |
| Colour roles | 5 + 4 + 2 + 3(+3 fills) + 5 | 13 §2.1 | 13 §2.1 |
| Motion tokens | 6 | `--d-press --d-release --d-state --d-move --d-enter --d-exit` | 13 §9 |
| Type scale | 8 | `t-xs 12 · t-sm 13 · t-base 15 · t-md 17 · t-lg 20 · t-xl 24 · t-2xl 28 · t-3xl 34` | 13 §3 |
| Density | 3 | `compact comfortable roomy` → 28 / 32 / 36 px | 28 §1 |
| Empty states | 5 | `no-data-yet no-results cleared no-permission error` | 19 §6 |
| Test widths | 4 | `390 768 1024 1440` | 22 §10 |
| Fixture records | 9 | eight pages + `corpus` | 22 §10 |
| Playwright specs | 17 | 33 §8 — 50 §9's sixteen plus `vault-screen` | 33 §8 |
| First-party packs | 6 | `agents work portfolio money-core estate people` | 32 §5 |

**When a count is needed anywhere in the corpus, cite the owner rather than re-counting.** A CI gate reads this
table and every owner's enumeration and fails when they differ ([33-CONTRACTS](33-CONTRACTS.md) §8). A count is never
a budget: the numbers a gate asserts live in `tools/gates/budgets.json`, the enumerations live with their owners, and
this table indexes the second, never the first.

---

*Next: [33-CONTRACTS](33-CONTRACTS.md) — the interfaces, envelopes and surfaces those grammars are used through.*
