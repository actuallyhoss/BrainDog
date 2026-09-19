# 43 · packages/extract — specification

Derives from [07-INGEST-AND-RULES](07-INGEST-AND-RULES.md) §1–§5, [25-CONNECTORS](25-CONNECTORS.md) §3–§6,
[30-BLUEPRINT](30-BLUEPRINT.md) §1 and §6, [34-GRAMMARS](34-GRAMMARS.md) §3, [02-DATA-MODEL](02-DATA-MODEL.md) §3,
[11-ASSISTANT](11-ASSISTANT.md) §3 and [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §4. Eighth in the build order of
[31-STACK](31-STACK.md) §2; phase B, stage B5 of [15-ROADMAP](15-ROADMAP.md) §4. Mode: ponytail
([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §1).

---

## 1 · Purpose and boundary

`@braindog/extract` turns **one raw arrival into typed rows under one `ingest` declaration**, and nothing else.
It is the pure middle of the pipeline in 07 §7: step 2 (match) and step 3 (extract). It reads a declaration
and a payload; it returns fields in the canonical JSON of 34 §3, a confidence, and the receipt the record
writes into `ingest_receipt`.

| Does | Refuses to |
|---|---|
| evaluate `match:` and `skip:` over an arrival, in memory | touch a database, a port, or the network — it has no `Sql`, no `Http`, no `Clock` |
| run the ten extractors and three combinators of 07 §3 over text | run code from a declaration, or interpret one as anything but JSON |
| read the five response formats a pull connector returns (§4.4) | fetch, page, or assert `expect:` — that is `connect` ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §4 row 47) |
| parse money and dates without a float and without a guess | guess a date format, a currency, or a decimal separator it was not told |
| derive `exact · proposed · needs-review` and say why in field ids | write a row, write a receipt, or log a byte of payload |
| test a declaration against samples for the dry run and the proposal loop | call a model — the proposal is Spark's (11 §3); this package only scores it |
| decide whether two rows are the same movement (fuzzy dedupe) | query for the candidates — the record does (§5.7) |
| scan every input in one advancing pass | contain a `RegExp` — there is none, and a lint rule proves it (§8) |

**Imports:** `@braindog/where` for the `Predicate` type and the reference evaluator, and nothing else
(31 §2 row 8). No `node:*` import anywhere under `src/` (31 §3, layer 4). Licence `Apache-2.0`; private,
never published.

**Callers:** `record` (the pipeline), `spark` (the proposal loop's scoring), `connect` (`readRows`, `select`,
the `map:` coercion), `cli` (`braindog ingest test`, §13 D15).

---

## 2 · Public API

Nine exported functions and the types they need. A function throws only for a malformed declaration or path
(§6); a payload can never make it throw — a payload produces outcomes, never exceptions.

```ts
// index.ts — the `exports` map exposes "." only
export function matches(decl: Matchable, raw: RawArrival): boolean;
//   `match:` evaluated over the arrival as 34 §1.9 defines the subject. Absent `match:` = true.
//   Throws the grammar codes of §6 exactly as `where` raises them.
//   NO `ctx`, AND THERE IS NOTHING FOR ONE TO DO: the subject is the arrival, the schema is `INBOX_RAW`,
//   and neither `now` nor `tz` is reachable from a `match:` predicate, because `sentence.ts` resolves
//   `today`, `bom` and `eoy` to concrete days before the evaluator is entered. The earlier signature here
//   was the same guess as 34 §1.11's, corrected the same way: against the export.

export function extract(decl: IngestDeclaration, raw: RawArrival, ctx: ExtractCtx): Extraction;
//   Assumes `matches` was true. Runs §5.1–§5.6. Never throws for a payload.

export function testAgainst(decl: IngestDeclaration, samples: RawArrival[], ctx: ExtractCtx): Report;
//   `matches` + `extract` per sample; the won/lost counts of 23 §4 ("3 of 3"). Writes nothing.

export function isDuplicate(a: Fields, b: Fields, dedupe: Dedupe): boolean;
//   §5.7. Pure; both sides in canonical JSON.

export function parseMoney(text: string, currencies: CurrencyTable, declared?: string): Money | undefined;
//   The first money in `text` under the grammar of §4.3. `declared` is the fallback currency, never an override.

export function parseDate(text: string, format: string): string | undefined;
//   The first valid calendar day in `text` matching `format` (§4.3), as `YYYY-MM-DD`. Throws DATE_FORMAT_INVALID.

export function readRows(body: string, format: Format, read?: Read): Json[] | typeof UNPARSEABLE;
//   §5.5. Throws nothing for a body: an unparseable body yields the sentinel `UNPARSEABLE` (see below).

export function select(value: Json, path: string): Json[];
//   The JSON path subset of §4.4. Missing → []. Throws PATH_INVALID for a malformed path.

export function normalise(text: string): string;
//   §5.1 step 1, exported because `connect` and the web app show the same text the extractors saw.

export const UNPARSEABLE: unique symbol;      // readRows' one non-Json answer, for BODY_UNPARSEABLE
export const EXTRACTORS: readonly ['after','before','between','money','date','text','int','decimal','enum','lookup'];
export const COMBINATORS: readonly ['first','nth','default'];   // 10 + 3 — the closed-lists gate reads these
```

Error contract: a thrown error is `{ code: 'EXTRACTOR_UNKNOWN' | 'DATE_FORMAT_INVALID' | 'PATH_INVALID' | <where grammar code>;
at: string; fix: string }` — the `Refusal` shape of 30 §6 without `found`, because `found` could only ever be
payload text (§8).

---

## 3 · Files

Seven, counted. The sketch said four, then five once the formats were pulled out so that the only file
`connect` needs does not drag the text scanners with it. The two beyond that are `arrival.ts` and
`pipeline.ts`, split out of the `index.ts` this section first drew holding everything.

THE SPLIT KEEPS THE PROPERTY THE ONE-FILE RULE WAS FOR. The reason given below for a single file is that a
reviewer reads one file to answer *"why was this row proposed?"*, and that is still true of `pipeline.ts`:
every confidence decision is in it and nothing outside it makes one. `arrival.ts` answers a different
question, whether this reader owns the arrival at all, and it is asked before any row exists. `index.ts` is
the barrel.

```
packages/extract/
├── package.json            name @braindog/extract · private · "exports": { ".": "./src/index.ts" } · type module
├── tsconfig.json           extends ../../tsconfig.base.json; references ../where
├── src/
│   ├── index.ts            the barrel; the `exports` map exposes "." only
│   ├── arrival.ts          ~80 lines   subjectOf · matches · skip (§5.2)
│   ├── pipeline.ts         ~290 lines  extract · confidence · receipt · route (§5.1)
│   ├── dedupe.ts           ~110 lines  isDuplicate (§5.7)
│   ├── report.ts           ~60 lines   testAgainst (23 §4's counts)
│   ├── extractors.ts       ~260 lines  normalise · the ten forms as candidate scanners · the three combinators · enum/lookup token match
│   ├── money.ts            ~140 lines  the number grammar · currency detection · parseMoney · int and decimal share the tokenizer
│   ├── date.ts             ~90 lines   format compile · scan · calendar validation · parseDate
│   └── formats.ts          ~320 lines  select (path) · readRows · CSV · XML · HTML table · the map: coercion of §4.5
└── test/
    └── extractors · money · money-property · date · formats · confidence · dedupe · report · leak · bench · install-and-fire
```

`index.ts` owns every decision that touches confidence, so a reviewer reads one file to answer *"why was this
row proposed?"*. `extractors.ts` never sees a declaration; it sees one form and one string.

---

## 4 · Data structures

### 4.1 · The inputs and outputs

```ts
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Fields = Record<string, Json>;                          // canonical shapes of 34 §3; a missing field is absent, never null
type Confidence = 'exact' | 'proposed' | 'needs-review';     // the CHECK on ingest_receipt.confidence — 30 §1
type Money = { amount: number; currency: string };           // integer minor units, |amount| ≤ 2^53 − 1 — 02 §3, ADR-032
type CurrencyTable = Record<string, { exponent: number; symbol?: string }>;   // the register's table; exponent 0–4 (ISO 4217)

type RawArrival = {
  id: string; ts: string;                                    // inbox_raw.id, inbox_raw.ts
  channel: 'email' | 'webhook' | 'pull' | 'paste' | 'api';   // the five — 30 §1
  headers?: Record<string, string>;                          // lower-cased keys, as stored; from/to/subject are read here
  body: string;
};

type ExtractCtx = {
  currencies: CurrencyTable;
  lookup: (register: string, by: string) => { id: string; value: string }[];   // every live row's `by` value; the record runs one SELECT
  now: number; tz: string;                                   // for relative literals in match: — 34 §1.4
  maxRows?: number;                                          // default 5,000 — 25 §3.2 limits.rows_per_run
};

type FieldOutcome = 'exact' | 'chosen' | 'defaulted' | 'missing' | 'ambiguous' | 'invalid';
type ExtractedRow = { fields: Fields; confidence: Confidence; outcome: Record<string, FieldOutcome>; register?: string };

type Extraction = {
  rows: ExtractedRow[];                                      // exactly one for email · webhook · paste · api; n for pull
  confidence: Confidence;                                    // the worst row, then the ceiling of writes.confidence
  skipped?: string;                                          // the skip: reason; rows is [] and receipt is absent
  reason?: string;                                           // for inbox_raw.reason — field ids and counts only, never a value
  receipt?: Receipt;
};

type Receipt = {                                             // → ingest_receipt, 30 §1; the record fills `wrote`
  ingest_id: string; raw_id: string; confidence: Confidence;
  rows: number; fields: Record<string, FieldOutcome>;        // the worst outcome per field across rows
  wrote: string[];                                           // [] here; entry ids after the record writes
};

type Report = {
  samples: number; matched: number; skipped: number;
  fields: Record<string, { won: number; lost: number }>;    // over matched, unskipped samples — the "3 of 3" lines of 23 §4
  rows: { raw_id: string; matched: boolean; skipped?: string; confidence?: Confidence;
          fields: Record<string, { result: 'won' | 'lost'; outcome: FieldOutcome; value?: Json }> }[];
};
```

Invariants a test checks: `rows.length ≤ ctx.maxRows`; every `fields` value is in its 34 §3 shape; a row with any
outcome in `missing · ambiguous · invalid` has confidence `needs-review`; `Extraction.confidence` is never higher
than `writes.confidence`; `reason` is composed only from field ids, the six outcome words, the fixed phrases of
§6 and `skip[].reason` — never a slice of `raw.body` (the leak test, §9.5). `won` = outcome in
`exact · chosen · defaulted`; `lost` = the other three.

### 4.2 · The declaration, as this package reads it

`declare` (42) owns the schema and lints it at install; this is the subset read here, and 42's schema must
accept exactly these keys (§13 D6).

```ts
type IngestDeclaration = {
  id: string;                                   // 'hsbc-sms' — without the kind prefix
  channel: RawArrival['channel'];
  match?: Predicate;                            // @braindog/where; inbox_raw backend — 34 §1.9
  skip?: { when: Predicate; reason: string }[]; // §5.2 — the skip list of 07 §2
  extract?: Record<string, Form>;               // text-shaped payloads: the ten and the three
  map?: Record<string, Mapping>;                // structured responses: 25 §3.2
  fetch?: { read?: Read };                      // the only fetch: key read here
  writes: { register: string | Route; confidence?: Confidence }      // ceiling, default 'exact'
        | { series: string; kind: 'gauge' | 'flow' | 'cumulative' | 'unique' | 'fact' };   // 08 §3
  dedupe?: Dedupe;
};
type Route  = { by: string[]; to: { when: string[]; register: string }[] };   // kind × currency → register — 07 §2
type Dedupe = string[] | { near: { on: string[]; day: string; prefix?: { field: string; chars?: number } } };
type Read   = { format?: Format; rows?: string; delimiter?: ',' | ';' | '\t'; table?: number };
type Format = 'json' | 'csv' | 'xml' | 'html_table' | 'text';
```

### 4.3 · The thirteen forms — every key, type and default

A form is one object with one key from `EXTRACTORS` or `COMBINATORS`. Ten extractors read the text; three
combinators take a form. Anchors narrow the text an extractor scans: at most one of `after · before · between`
per form; none means the whole text.

| Form | Keys | Yields (candidates, in text order) |
|---|---|---|
| `{ after: L }` | `L` string ≥ 1 char | the text after each occurrence of `L`, to the end |
| `{ before: L }` | `L` | the text before each occurrence of `L`, from the start |
| `{ between: [A, B] }` | two strings | the text after each `A` up to the first `B` following it; an `A` with no `B` yields nothing |
| `{ text: { after? \| before? \| between? } }` | anchor | the slice with whitespace collapsed and trimmed; empty → nothing |
| `{ money: { anchor?, currency?: ISO } }` | `currency` a key of the table | each money in the slice under the grammar below; `currency` is the fallback when none is adjacent |
| `{ date: { format: F, anchor? } }` | `F` required | each valid calendar day matching `F` — §4.3 |
| `{ int: { anchor? } }` | — | each integer in the slice; grouping allowed, no fraction |
| `{ decimal: { anchor?, sep?: "." \| "," } }` | `sep` default `"."` | each decimal in the slice; the other separator groups |
| `{ enum: { map: { L: V }, anchor? } }` | ≤ 64 literals | `V` of the longest literal present as a whole token; two of equal length with different `V` → **ambiguous** |
| `{ lookup: { register: R, by: F, anchor? } }` | — | the `id` whose `by` value occurs as a whole token; longest wins; equal-length different ids → **ambiguous** |
| `{ first: [form, …] }` | 2–8 forms, nesting depth ≤ 3 | the first candidate of the first form that yields; outcome `chosen` when two or more forms yielded |
| `{ nth: { n: 1–64, of: form } }` | | candidate `n` (1-based) of `of`; fewer → nothing |
| `{ default: { value: J, of: form } }` | `J` already in the field's 34 §3 shape | `of`'s result, or `value` when `of` yields **nothing**; outcome `defaulted`. An ambiguous `of` stays ambiguous |

A bare extractor's result is candidate 1 with outcome `exact`; zero candidates is `missing`. Literal matching
is ASCII-case-insensitive over a parallel folded string, so positions align (34 §1.2's `contains` rule);
values are sliced from the unfolded text. *Whole token* means bounded by characters that are not letters or
digits.

**Money grammar.** Given a slice and the exponent `e` of the currency found or declared:

```
money   = [ "(" ] [ sign ] [ cur ws? ] number [ ws? cur ] [ ")" ]      ; parentheses = negative
sign    = "-" | "−" | "+"
cur     = code | symbol                                                 ; code: 3 upper-case letters in the table, whole token
number  = digits { grp digits3 } [ dec digits ] | digits [ dec digits ]
grp     = "," | "." | " " | "'"                                         ; a run of groups uses ONE character
dec     = "." | ","
```

| Shape | Reading | Example (e = 2) |
|---|---|---|
| no separator | major units | `1250` → 125000 |
| one separator, last group not 3 digits | decimal; last group ≤ e digits, else no candidate | `1,25` → 125 · `12.5` at e = 0 → nothing |
| **one separator, last group exactly 3 digits** | **thousands, unless e = 3, then decimal** | `1.250` → 125000 · `KWD 1.250` → 1250 |
| two or more separators | all but the last are one grouping character over groups of exactly 3; a last separator that differs is the decimal point; one that is the same needs a 3-digit last group | `1,250.00` → 125000 · `1.250,00` → 125000 · `1 250,00` → 125000 · `1,250,000` → 125000000 |
| first group | 1–3 digits when grouping | `1250,000` → nothing |
| a currency adjacent before and after that differ | no candidate | |
| a symbol two table rows share | not a currency; `declared` or nothing | `$` with USD and CAD in the table |
| \|amount\| > 2^53 − 1 | no candidate | |

The **thousands rule** is exact: *a lone separator followed by exactly three digits is a grouping separator,
because at exponent 0, 1, 2 or 4 no valid amount has exactly three decimals; at exponent 3 it is the decimal
separator, because three decimals is what that currency writes.* Its ceiling is named in §10: `KWD 1,250`
meaning one thousand two hundred and fifty dinars reads as 1.250.

The number is never a float. `Number()` is applied to a digit string once, after padding the fraction to `e`.

**Date format.** Tokens `YYYY` (4 digits) · `YY` (2, read as 20YY) · `MM` · `DD` (exactly 2) · `M` · `D` (1 or 2,
greedy). Every other character is a literal matching itself. A format must hold one year, one month and one
day token, and a variable-width token must be followed by a literal or the end; otherwise `DATE_FORMAT_INVALID`.
A match is bounded: the character before the first token and after the last is not a digit. The day must exist
in the Gregorian calendar (leap years included). Output `YYYY-MM-DD`.

### 4.4 · The JSON path subset

25 §3.1 promised "literal keys, integer indices, `[-1]`, `[]`"; this is that grammar, closed.

```ebnf
path    = [ segment { "." segment } ] ;                  (* empty path = the root *)
segment = key [ index ] | index ;                        (* a leading index addresses a root array *)
key     = 1*( char - "." - "[" - "]" ) ;                 (* exact, case-sensitive, own property only *)
index   = "[" ( digits | "-1" | "" ) "]" ;               (* [n] element n · [-1] the last · [] every element *)
```

`select` returns every value the path reaches; `[]` multiplies. Limits: ≤ 16 segments; a key is looked up with
`Object.hasOwn`, so `__proto__` and `constructor` reach nothing. Not addressable: a key containing `.`, `[`
or `]` (§10).

### 4.5 · `map:` — one entry per field for a structured row

The 25 §3.2 vocabulary, with every key stated:

```ts
type Mapping = { path: string | [string, string]; type: 'text' | 'int' | 'decimal' | 'money' | 'day' | 'instant' | 'enum' | 'bool' | 'duration' | 'url' | 'email' | 'document' | 'json';
                 from?: 'epoch_s' | 'epoch_ms'; minor?: boolean; currency?: string; format?: string; values?: string[]; other?: string };
```

| `type` | Coerces | Outcome when it cannot |
|---|---|---|
| `text` `url` `email` `document` | string, number or boolean → string | object or array → `invalid` |
| `int` | integer, or a string under the `int` grammar | fraction, \|n\| > 2^53 − 1 (the fact `INT_OUT_OF_RANGE` names at write) → `invalid` |
| `decimal` | number, or a string with `.` as separator; ≤ 15 significant digits | else `invalid` |
| `money` | `path: [amount, currency]`, or `path: amount` with `currency:`; `minor: true` → integer as-is; else a major-unit decimal under §4.3's grammar with the table's exponent | unknown currency, precision beyond `e`, out of range → `invalid` |
| `day` | `format` (default `YYYY-MM-DD`) over a string; or `from:` an epoch → the UTC day | `invalid` |
| `instant` | `from: epoch_s \| epoch_ms` → RFC 3339 UTC ms; or an RFC 3339 string with `Z` or an offset | anything else → `invalid` — never `Date.parse` on free text |
| `enum` | the string must be in `values`; else `other` if declared (outcome `defaulted`) | `invalid` |
| `bool` | `true/false`, `"true"/"false"`, `1/0` | `invalid` |
| `duration` | integer seconds | `invalid` |
| `json` | the value as-is | — |

`select(row, path)` must reach exactly one value: zero → `missing`, two or more → `ambiguous`. `ref`, `file`,
`secret`, `quantity` and `list<T>` are not mappable in v1 (§10).

**Built, September 17th 2026, for a `poll` and a `pull` answer** (`packages/kernel/src/map.ts`, `ingest.ts`). An
answer handed to a declaration that carries `map:` and no `extract:` is parsed as JSON once (the 2,000,000-byte cap;
a body that is not JSON reaches nothing) and each field is read by its entry. Two forms are added beside
`{ path, type }`, for facts a response does not carry:

| Form | Writes | Outcome |
|---|---|---|
| `{ value: <literal> }` | the literal, as the declaration states it: a measure's name, the project it is about | `exact` |
| `{ arrived: true }` | the instant the answer arrived (the raw row's own `ts`), cut to its day for a `day` field | `exact` |

A field that reads nothing is `missing` and an `enum` that falls back to `other:` is `defaulted`, so the row files
by §5.1 step 7 exactly as an extracted one does. On a `poll` every entry is checked at install: one of the three
forms, a type from the table above, a path in §4.4's grammar with no `[]` (a poll fills one row, so a path reads
one value), `from:` only `epoch_s` or `epoch_ms`, money with two paths or a `currency:`, an enum with `values:`,
and never `map:` beside `extract:`. A `pull`'s `map:` keeps the path check it had. Refusals are
`DECLARATION_INVALID` and `PATH_INVALID`.

---

## 5 · Algorithms

### 5.1 · `extract`, in order

1. **Cap.** `TextEncoder` length of `raw.body` > 2,000,000 bytes (25 §7 rule 7 — the row and BLOB ceiling) →
   `{ rows: [], confidence: 'needs-review', reason: 'body too large (<n> bytes; the cap is 2,000,000)' }`. Stop.
2. **Skip.** §5.2. A hit → `{ rows: [], skipped: reason, confidence: 'exact' }`, no receipt. Stop.
3. **Rows in.** `decl.fetch?.read?.format ?? 'text'`. `text` → one row, the body. Otherwise `readRows` (§5.5):
   `UNPARSEABLE` → needs-review, reason `body unparseable as <format>`; more than `maxRows` → needs-review, reason
   `rows over cap (<n>; the cap is <maxRows>)` — kept raw, never truncated (07 §2: nothing dropped). Stop on either.
4. **Normalise** (text rows only): CR and CRLF → LF; tab, NBSP and the Unicode space separators U+2000–U+200A,
   U+202F, U+205F, U+3000 → space; zero-width U+200B–U+200D and U+FEFF removed; runs of spaces collapsed; each
   line trimmed. No Unicode normalisation (§10). Case is folded on a parallel copy for matching, never in a value.
5. **Fields**, in declared order. A text row: each `extract:` form through §5.3. A structured row: each `map:` entry
   through §4.5. Every declared field is required; `default` is how a field is optional (§13 D7). Each field gets
   an outcome and, when it has one, a value in its 34 §3 shape.
6. **Route.** `writes.register` a string → every row. A `Route` → the row's `by` values (a field id, or
   `<money field>.currency`) as strings, matched in order against `to[].when`; the first equal tuple wins; none →
   `register` absent, the row is `needs-review`, reason `route miss on <by ids>`.
7. **Confidence per row.** Any outcome in `missing · ambiguous · invalid` → `needs-review`; else any in
   `chosen · defaulted` → `proposed`; else `exact`.
8. **Confidence of the arrival.** The worst row, then no higher than `writes.confidence` (default `exact`), on
   the order `exact > proposed > needs-review`. Zero rows from a parseable body is `exact` — an empty page is not
   a review.
9. **Receipt and reason.** `receipt.fields` is the worst outcome per field over rows, on the severity
   `invalid > ambiguous > missing > defaulted > chosen > exact`. `reason` is written only for `needs-review`:
   `needs-review: <field> <outcome>[; …]` for one row, `needs-review: row <i> <field> <outcome>[; …]` for many,
   at most eight items then `; +<n> more`. Field ids, outcome words, indices and counts only. A route miss
   (step 6) is an item on the same list, `route miss on <by ids>`, and not a fallback used when the list is
   otherwise empty: a person told only about the missing field fixes it and gets the arrival back with a
   sentence that was true the first time.

**What the record does with it** (07 §7 steps 4–5, restated for the contract): `exact` and `proposed` → write
every row in one transaction with `actor: ingest:<id>`, fill `receipt.wrote`, insert `ingest_receipt`, set
`inbox_raw.state = 'matched'`. `needs-review` → write nothing, insert the receipt with `wrote: []`, set
`state = 'review'` and `reason`. `skipped` → `state = 'skipped'`, `reason`, no receipt. Per arrival, all rows or
none (§10).

### 5.2 · `matches` and the skip list

1. Build the subject of 34 §1.9: `{ from, to, subject }` from `raw.headers`, `body` as stored (not normalised —
   so the in-memory answer equals the SQL `instr(lower(body), lower(?))` the record could run), `channel`,
   `state: 'untriaged'`, `ts`.
2. `evaluate(decl.match, subject, { subject: 'inbox_raw', now: ctx.now, tz: ctx.tz })` from `@braindog/where`
   (§13 D12). Missing values follow 34 §1.3. No `match:` is true.
3. `skip:` runs the same evaluator over the same subject, in declared order; the first true `when` wins and its
   `reason` is the arrival's.

### 5.3 · One form over one text — the candidate contract

`run(form, text, folded, ctx) → Json[] | 'ambiguous'`, where `text` and `folded` have equal length.

1. **Anchor.** Each occurrence of the anchor literal (`indexOf` over `folded`, advancing past every hit) yields
   one slice as §4.3 defines; no anchor is the whole text, once. Slices are scanned in turn; candidates
   concatenate in text order.
2. **Scan** the slice with the extractor's scanner (§5.4): `text` yields the collapsed slice; `money`, `date`,
   `int`, `decimal` yield every match; `enum` and `lookup` yield one value or `'ambiguous'`.
3. **Combine.** `first`: run each form in order; collect which yielded; the result is the first yielder's first
   candidate; `chosen` if two or more yielded. `nth`: candidate `n` of `of`. `default`: `of`, or `value` on an
   empty list.
4. An unknown key at any depth → throw `EXTRACTOR_UNKNOWN` at `extract.<field>` — unreachable behind 42's lint,
   kept as defence in depth.

Complexity: one left-to-right pass per slice; `first` with *k* forms is *k* passes; `enum` with *m* literals and
`lookup` with *r* rows are *m* and *r* `indexOf` scans of the slice.

### 5.4 · The scanners

**Money** (`parseMoney` is this, returning candidate 1):

1. Find the next digit whose predecessor is not a digit, a letter, `/`, `:` or `-` joined to a digit (so `29/08/26`
   and `2026-08-29` yield no amounts, and `Ref 88213.` does).
2. Take the longest number token from it: digits, and `,` `.` `'` or a single space only when followed by a digit.
   The token ends before any other character.
3. Look back over optional spaces for a currency token, then a sign, then `(`; look forward over at most one
   space for a currency token, then `)`. A code is 3 upper-case letters bounded by non-letters and present in
   the table; a symbol is a table row's `symbol`, matched literally, valid only if exactly one row carries it.
4. Currency: adjacent before, else adjacent after, else `declared`, else no candidate; before and after both
   present and different → no candidate. `e` = the table's exponent.
5. Parse the token by the shape table of §4.3; refuse rather than round. Sign from `-`/`−` or a balanced pair of
   parentheses. `|amount| ≤ 2^53 − 1`.
6. Continue after the token.

**Int / decimal** reuse steps 1–2 and 5 with no currency: `int` treats `,` `.` `'` space as grouping and rejects a
fraction; `decimal` treats `sep` as the point (at most once) and the rest as grouping, then checks ≤ 15
significant digits; the value is `Number(digits + '.' + fraction)`.

**Date.** Compile `format` once per call into tokens (cached per string in a `Map` of ≤ 64 entries). At each
index whose predecessor is not a digit, match tokens in order — fixed widths exactly, `D`/`M` greedily to two —
and literals by equality; require a non-digit after the last token; validate month 1–12 and day 1–days-in-month;
emit `YYYY-MM-DD`; continue at the next index.

**Enum / lookup.** For each literal (or each `value` from `ctx.lookup(register, by)`), `indexOf` its fold in the
folded slice, advancing until an occurrence is a whole token. Keep the longest matching literal; a second of equal
length mapping to a different value or id → `'ambiguous'`; none → `[]`.

### 5.5 · The five formats (`readRows`)

| `format` | Parser | Rows | `path` in `map:` |
|---|---|---|---|
| `json` | `JSON.parse` | `select(root, read.rows ?? '')`; if that is exactly one array, its elements | the §4.4 grammar over the row |
| `csv` | RFC 4180 by hand: header row required, `read.delimiter` default `,`, quotes with `""` escape, newlines inside quotes, CRLF or LF, a leading BOM dropped, a trailing empty line ignored | one object per record, keyed by header; fewer cells → absent keys; extra cells dropped; duplicate header → the last wins | the header name (a key) |
| `xml` | a tiny non-validating parser: prolog, comments and PIs skipped; elements, attributes, text, CDATA; the five predefined entities and `&#n;`/`&#xn;`; **a `<!DOCTYPE` anywhere → `UNPARSEABLE`** (no DTD, no entity expansion) | element → `{ "@attr": v, child: v \| [v…], "#text": s }`; a text-only element is its string; `select(root, read.rows)` as for JSON | the §4.4 grammar; prefixes are literal (`atom:entry`) |
| `html_table` | a tag tokenizer over `<table>` `<tr>` `<th>` `<td>` (case-insensitive; `<thead>`/`<tbody>` tolerated; `<script>`/`<style>` skipped); `read.table` picks the 1-based table, default 1; cell text = tags stripped, entities decoded, whitespace collapsed | the first row is the header; each later row is an object by header name | the header name |
| `text` | none | one row: the body | not used — `extract:` applies |

Every parser is a single forward pass with an index that only advances; none uses a `RegExp`. A body that does
not parse yields `UNPARSEABLE`, never a throw.

### 5.6 · `testAgainst`

1. For each sample: `matches` → if false, a row with `matched: false`; if a skip hits, `skipped`; else `extract`.
2. Per field per matched, unskipped sample: `won` when the outcome is `exact · chosen · defaulted`, else `lost`;
   the value travels in the report (it is returned to the caller, not logged — 23 §4 draws it beside the source).
3. Totals: `matched`, `skipped`, `fields[id] = { won, lost }`. 23 §4's `⚠ 2 of 3` line is `won: 2, lost: 1`;
   its pre-dropped line is `won: 0`.

### 5.7 · Fuzzy dedupe (`isDuplicate`)

The key of 07 §2 and 32 §6, made exact: **same `on:` fields, day within ±1, prefix equal.**

1. `string[]` form: every named field present on both sides and canonically equal (sorted-key JSON; a money value
   compares as `{ amount, currency }`).
2. `near` form: every `on` field equal as in 1; both `day` values present, `YYYY-MM-DD`, and
   `|Date.UTC(a) − Date.UTC(b)| ≤ 86,400,000`; `prefix`: the first `chars` (default 12) of each side's field after
   step-4 normalisation and ASCII folding are equal; absent on both sides counts equal, on one side not.

The record fetches candidates and calls this per candidate (its query, for 45 to carry):

```sql
SELECT id, fields FROM entry
 WHERE register = ? AND deleted_at IS NULL
   AND json_extract(fields, '$.<day>') BETWEEN ? AND ?          -- day − 1 … day + 1
   AND json_extract(fields, '$.<on0>') = ? …                     -- a money field: '.amount' = ? AND '.currency' = ?
```

`on_conflict` (07 §3: `skip | update | new`) then decides; it is the record's, not this package's.

---

## 6 · Refusals and errors

Extraction refuses nothing about a payload: a payload produces outcomes and a `reason`. The codes below are
raised for a **declaration** or a **path**, and none is a write-path code — those (`REQUIRED_MISSING`,
`ENUM_VALUE_UNKNOWN`, `INT_OUT_OF_RANGE`, …) are raised later by the record at steps 3–5 of 30 §4 over the rows
this package produced.

| Code | Raised by | When | `fix` |
|---|---|---|---|
| `MATCH_FIELD_UNKNOWN` | `where`, through `matches`/`testAgainst` | a `match:` or `skip.when` field outside `from to subject body channel state ts` (34 §1.9) | "Match on one of: from, to, subject, body, channel, state, ts." |
| `MATCH_OP_UNSUPPORTED` | `where`, as above | `via has lacks near matches starts ends` on the arrival backend | "Use contains, is, in or a temporal test on an arrival." |
| `CONTAINS_TOO_LONG` | `where`, as above | a `contains` literal over 40 bytes | "Shorten the literal to 40 bytes; match on two shorter ones with all:." |
| `PREDICATE_TOO_DEEP` | `where`, as above | a fourth nesting level | "Flatten the predicate; three levels is the ceiling." |
| `RELATIVE_LITERAL_UNKNOWN` | `where`, as above | a temporal literal outside the anchors and offsets | "Use today, tomorrow, yesterday, bom, eom, boy, eoy or ±<n>d/w/m." |

Three codes this package needs and the corpus lacks are proposed in §13 D13: `EXTRACTOR_UNKNOWN`,
`DATE_FORMAT_INVALID`, `PATH_INVALID`. Each throws the §2 error shape with `at` naming the declaration path
(`extract.amount`, `map.at.format`, `fetch.read.rows`) and never a payload byte.

`reason` strings are not codes: they are the sentence `inbox_raw.reason` holds (30 §1), read by a person in the
inbox fold (07 §2). Their vocabulary is closed to the six outcome words, `body too large`, `body unparseable
as <format>`, `rows over cap`, `route miss on <ids>`, and the declaration's own `skip[].reason`.

---

## 7 · Performance budget

Measured by `test/bench.test.ts` with `performance.now()` over generated inputs; the test asserts the CI ceiling,
prints the median, and the target is what a laptop should show. All warm, single-threaded.

| Case | Input | Target (p50) | CI ceiling (p99) |
|---|---|---|---|
| one message | 2 KB text, one declaration, 6 fields (money, date, two `between`, enum, lookup over 50 rows) | 0.3 ms | 5 ms |
| match fan-out | one arrival against 50 declarations' `match:` | 1 ms | 10 ms |
| one CSV | 1 MB, 5,000 rows × 8 columns, `map:` of 6 fields incl. money and day | 250 ms | 1,000 ms |
| one JSON | 1 MB, 5,000 rows under `data[]`, `map:` of 6 | 150 ms | 600 ms |
| one HTML table | 1 MB, 5,000 rows × 6 cells | 300 ms | 1,200 ms |
| the cap check | a 2 MB body | 2 ms (`TextEncoder`) | 20 ms |
| `testAgainst` | 3 samples × 6 fields | 1 ms | 10 ms |
| retained heap | 1 MB CSV | ≤ 8× the body | 16× |

Everything is linear in the slice length; the only multiplicative factors are `first`'s forms, `enum`'s literals
and `lookup`'s rows, each capped or bounded by the caller (§4.3, §10).

**The CSV row said 10,000 and §10 caps rows at 5,000**, so a benchmark written to the letter timed the refusal
path: parse the file, hit the cap, map nothing, report a number that answers a different question. It took a
row-count assertion in the harness to see it, which is now in every row, because the failure of a performance
test is silence rather than red.

**"Peak heap" became "retained heap", and the measurement is the reason.** Peak RSS over one run is dominated
by V8 arena growth and by whatever the collector has not got to yet; it moves with the runtime's scheduling
rather than with what the code holds, so asserting it asserts the wrong thing and flakes. Retained after a
collection is stable to the decimal across runs and answers the question the row is asking, which is whether
reading a big body costs memory in proportion to it. The figure is taken in a child process, with a collection
before the baseline as well as after: without the first one the baseline carries the garbage from loading the
modules, the second collection clears it, and the delta comes out negative.

---

## 8 · Security

**The boundary.** `raw.body` and `raw.headers` are a stranger's (07 §2; 12 §5; 25 §7 rule 8). The declaration is
trusted: it passed the gate and 42's lint. `ctx.lookup`'s values are the record's own rows.

| Control | Rule |
|---|---|
| **No `RegExp`** | not one, anywhere under `src/` — the 31 §8 line for this package. The repo lint carries `no-restricted-syntax` for `Literal[regex]`, `NewExpression[callee.name="RegExp"]` and `CallExpression[callee.name="RegExp"]` scoped to `packages/extract/**`. Every scanner is a single pass whose index only advances, bounded by the slice; a declared literal is compared with `indexOf` and never compiled. The brief's rule — anchored, bounded, literals escaped — is satisfied by having nothing to anchor |
| **Caps** | body 2,000,000 bytes (§5.1 step 1) · rows 5,000 · path segments 16 · `first` forms 8 · nesting 3 · `nth.n` 64 · `enum.map` 64 · format cache 64 entries. Over a cap is an outcome or a declaration refusal, never a partial result |
| **XML** | no DTD, no external entity, no parameter entity — `<!DOCTYPE` is `UNPARSEABLE`; entity expansion is the five names and numeric references only, so there is no billion-laughs surface |
| **JSON** | `JSON.parse` only; `select` reads own properties via `Object.hasOwn`; nothing is ever assigned from a payload key |
| **Nothing from a payload is logged** | the package has no logger and no `console`; a thrown error carries `code · at · fix` and never `found`; `reason` and `Receipt` carry field ids, outcome words, indices and counts (the leak test, §9). `Report.rows[].fields[].value` returns to the caller for the review screen and is the one place a value travels — into a return value, not a log |
| **Money** | never a float; refuse over round; `Number()` on a digit string only; `\|amount\| ≤ 2^53 − 1` |
| **Obfuscation** | zero-width characters are stripped before matching, so `E​GP` cannot dodge an anchor or hide from `enum` |
| **Injection** | extraction is deterministic and reads no instruction; the model never sees this package and this package never calls one. A proposal derived from arrivals is labelled untrusted by 23 §4 and approved by a person; a declared pattern writes only inside `writes:` (07 §5) |
| **Determinism** | same declaration, same body, same table → the same bytes out; no clock is read (`ctx.now` is for `match:` literals only) |

---

## 9 · Tests and gates

`node --test` over `test/**/*.test.ts`; `node:assert/strict`; one property test, over a seeded counter in the
test file rather than a generator library, so the 2,000 cases are the same every run and there is no seed
directory to keep (§9.2's row says why). Inputs are invented; no bank's real wording appears. The currency table in
every test is `{ EGP: {2}, USD: {2, '$'}, CAD: {2, '$'}, EUR: {2, '€'}, JPY: {0, '¥'}, KWD: {3} }`.

**Sample message `M1`** (used below):
`Card 1234 debited EGP 1,250.00 at BEANS COFFEE on 29/08/26. Ref 88213. Balance EGP 3,020.15.`

### 9.1 · Extractors — `test/extractors.test.ts`

| Form | On | → |
|---|---|---|
| `{ after: "Ref " }` | M1 | `"88213. Balance EGP 3,020.15."` |
| `{ before: " at" }` | M1 | `"Card 1234 debited EGP 1,250.00"` |
| `{ between: ["at ", " on"] }` | M1 | `"BEANS COFFEE"` |
| `{ between: ["at ", " zz"] }` | M1 | missing |
| `{ text: { between: ["at ", " on"] } }` | `"…at  BEANS\tCOFFEE  on…"` | `"BEANS COFFEE"` |
| `{ money: { after: "debited" } }` | M1 | `{ amount: 125000, currency: "EGP" }`, `exact` |
| `{ money: {} }` | M1 | `125000 EGP` (first; `1234` is skipped — no currency) |
| `{ money: { currency: "EGP" } }` | M1 | `123400 EGP` — the declared fallback applies to `1234`: **anchor it** (documented, tested) |
| `{ date: { format: "DD/MM/YY" } }` | M1 | `"2026-08-29"` |
| `{ int: { after: "Ref " } }` | M1 | `88213` |
| `{ int: {} }` | M1 | `1234` |
| `{ decimal: { after: "Balance EGP " } }` | M1 | `3020.15` |
| `{ enum: { map: { debited: "debit", credited: "credit" } } }` | M1 | `"debit"` |
| `{ enum: { map: { sent: "debit", recv: "credit" } } }` | `"sent 5 recv 5"` | ambiguous |
| `{ enum: { map: { in: "credit" } } }` | `"coin"` | missing (whole token) |
| `{ lookup: { register: "accounts", by: "last4" } }` with rows `[{e1,"1234"},{e2,"4471"}]` | M1 | `"e1"` |
| same | `"cards 1234 and 4471"` | ambiguous |
| `{ first: [{ between: ["at ", " on"] }, { between: ["to ", " on"] }] }` | M1 | `"BEANS COFFEE"`, `exact` |
| same | `"paid to ACME on 1/1"` | `"ACME"`, `exact` |
| same | `"at X on … to Y on …"` | `"X"`, `chosen` |
| `{ nth: { n: 2, of: { money: {} } } }` | M1 | `302015 EGP` |
| `{ nth: { n: 3, of: { money: {} } } }` | M1 | missing |
| `{ default: { value: "unknown", of: { between: ["at ", " on"] } } }` | `"no anchor here"` | `"unknown"`, `defaulted` |
| `{ default: { value: "x", of: { enum: { map: { sent: "a", recv: "b" } } } } }` | `"sent recv"` | ambiguous — a default never covers ambiguity |
| `{ regex: "…" }` | any | throws `EXTRACTOR_UNKNOWN` at `extract.f` |
| `normalise("a\r\nb  c​d")` | | `"a\nb cd"` |

### 9.2 · Money — `test/money.test.ts` (`parseMoney(input, table, declared?)`)

| Input | declared | → `{ amount, currency }` or `undefined` |
|---|---|---|
| `EGP 1,250.00` | | 125000 EGP |
| `1.250,00 EUR` | | 125000 EUR |
| `EGP 1250` | | 125000 EGP |
| `1 250,00 EUR` | | 125000 EUR |
| `EGP 1.250` | | 125000 EGP — the thousands rule |
| `KWD 1.250` | | 1250 KWD — exponent 3 |
| `KWD 1,250` | | 1250 KWD — the named ceiling, pinned |
| `EGP 1.25` · `EGP 1,25` | | 125 EGP |
| `JPY 1,250` | | 1250 JPY |
| `JPY 12.5` | | undefined — more precision than the currency |
| `EGP 12.345` | | 1234500 EGP — the only valid reading at exponent 2 |
| `EGP 1,250.000` | | undefined — three decimals at exponent 2 |
| `EGP 1,25,000` · `EGP 1250,000` | | undefined — groups not of three / first group too long |
| `EGP 1,250,000` · `EGP 1.250.000` | | 125000000 EGP |
| `EGP 1,250,000.50` | | 125000050 EGP |
| `-EGP 1,250.00` · `EGP -1,250.00` · `(EGP 1,250.00)` · `EGP −1,250.00` | | −125000 EGP |
| `€5` | | 500 EUR |
| `$5.00` | | undefined — `$` is USD and CAD |
| `$5.00` | `USD` | 500 USD |
| `1,250.00` | | undefined — no currency |
| `1,250.00` | `EGP` | 125000 EGP |
| `5.00 EGP` | | 500 EGP |
| `USD 5.00 (EGP 245.00)` | | 500 USD — the first candidate |
| `USD 5.00 EGP` | | undefined — two currencies adjacent |
| `XYZ 5.00` | | undefined — not in the table |
| `on 29/08/26 EGP 5.00` | | 500 EGP — the date yields nothing |
| `EGP 90,071,992,547,409.91` | | 9007199254740991 EGP — 2^53 − 1 |
| `EGP 90,071,992,547,409.92` | | undefined — 2^53 |
| **property** | | for 2,000 random `(amount ∈ ±10^13, currency ∈ table, style ∈ {en, eu, space, bare, parens})`: `parseMoney(render(amount, currency, style), table)` deep-equals `{ amount, currency }`. **A mulberry32 counter and not `fast-check`**: §13 asks for 2,000 cases and no seed under `test/seeds/`, which is the same 2,000 every run and a failure that reproduces from the test alone, and twenty lines buy that without a dependency. What a generator library adds is shrinking, and a failure here is already minimal — one amount, one currency, one style, all three in the message. The exponents are 0, 2 and 3, and the fraction's trailing zeroes are dropped half the time, because without that every rendered fraction is exactly `exponent` digits and the pad that turns `5` into `500` is never exercised |

### 9.3 · Dates — `test/date.test.ts`

| Input | Format | → |
|---|---|---|
| `29/08/26` | `DD/MM/YY` | `2026-08-29` |
| `29/08/2026` | `DD/MM/YYYY` | `2026-08-29` |
| `08/29/2026` | `MM/DD/YYYY` | `2026-08-29` |
| `2026-08-29` | `YYYY-MM-DD` | `2026-08-29` |
| `9/8/26` | `D/M/YY` | `2026-08-09` |
| `29.08.2026` | `DD.MM.YYYY` | `2026-08-29` |
| `on 29/08/26.` | `DD/MM/YY` | `2026-08-29` — bounded by non-digits |
| `129/08/26` | `DD/MM/YY` | undefined — preceded by a digit |
| `29/08/261` | `DD/MM/YY` | undefined — followed by a digit |
| `31/02/26` | `DD/MM/YY` | undefined — no such day |
| `29/02/2024` · `29/02/2026` | `DD/MM/YYYY` | `2024-02-29` · undefined |
| `29/08/26` | `MM/DD/YY` | undefined — month 29 |
| `2026-08-29` | `DD/MM/YY` | undefined — separator mismatch |
| `1/1/26 and 2/2/26` | `D/M/YY` as `nth: 2` | `2026-02-02` |
| any | `DD/MM` · `MMM DD YYYY` · `DMYYYY` | throws `DATE_FORMAT_INVALID` (no year · two month tokens · variable width before a digit token) |
| `29082026` | `DDMMYYYY` | `2026-08-29` — fixed widths need no separator |

### 9.4 · Formats — `test/formats.test.ts`

| Case | Input | → |
|---|---|---|
| path | `select({data:[{id:1},{id:2}]}, 'data')` | `[[{id:1},{id:2}]]` |
| path | `… 'data[].id'` · `'data[-1].id'` · `'data[0].id'` · `'data[5].id'` | `[1,2]` · `[2]` · `[1]` · `[]` |
| path | `select([7,8], '[1]')` · `select({a:{b:1}}, '')` | `[8]` · `[{a:{b:1}}]` |
| path | `select({}, '__proto__')` · `'constructor'` | `[]` · `[]` |
| path | `'a..b'` · `'a[x]'` · 17 segments | throws `PATH_INVALID` |
| json rows | `{"data":[…3…]}` with `rows: data` · `rows: data[]` | 3 rows · 3 rows |
| json rows | `{"data":{"x":1}}` with `rows: data` | 1 row `{x:1}` |
| csv | `﻿date,amount,note\r\n2026-08-29,"1,250.00","a ""q"" b\nline"\r\n2026-08-30,5\r\n` | 2 rows; row 1 note = `a "q" b\nline`; row 2 has no `note` key |
| csv | `a;b\n1;2` with `delimiter: ';'` | `[{a:'1', b:'2'}]` |
| csv | `a\n"unterminated` | `UNPARSEABLE` |
| xml | `<feed><entry><id>1</id><link href="u"/></entry><entry><id><![CDATA[2 &amp; 3]]></id></entry></feed>`, `rows: feed.entry` | `[{id:'1', link:{'@href':'u'}}, {id:'2 &amp; 3'}]` |
| xml | `<a>x &amp; y</a>` · `<!DOCTYPE a [<!ENTITY e "e">]><a>&e;</a>` | `'x & y'` · `UNPARSEABLE` |
| html | `<table><thead><tr><th>Date</th><th>Amount</th></tr></thead><tbody><tr><td><b>2026-08-29</b></td><td>1,250.00&nbsp;EGP</td></tr></tbody></table>` | `[{Date:'2026-08-29', Amount:'1,250.00 EGP'}]` |
| html | two tables, `table: 2` | the second's rows |
| map | `{ path: [amount, currency], type: money, minor: true }` on `{amount: 125000, currency: 'EGP'}` | `{amount:125000,currency:'EGP'}` |
| map | `{ path: amount, type: money, currency: EGP }` on `{amount: '1,250.00'}` | `125000 EGP` |
| map | `{ path: created, type: instant, from: epoch_s }` on `{created: 1756468800}` | `'2025-08-29T12:00:00.000Z'` |
| map | `{ path: t, type: instant }` on `'2026-08-29T14:03:11+02:00'` · `'yesterday'` | `'2026-08-29T12:03:11.000Z'` · `invalid` |
| map | `{ path: type, type: enum, values: [charge, refund], other: other }` on `'payout'` · `'charge'` | `'other'`, `defaulted` · `'charge'`, `exact` |
| map | `{ path: 'a[].b', type: int }` on two matches | `ambiguous` |

### 9.5 · Confidence, report, route, skip, dedupe — `test/confidence.test.ts`

Declaration `D1`: `extract: { amount: {money:{after:"debited"}}, date: {date:{format:"DD/MM/YY"}}, merchant: {between:["at "," on"]}, kind: {enum:{map:{debited:"debit",credited:"credit"}}} }`, `writes: { register: transactions }`.

| Case | → |
|---|---|
| `extract(D1, M1)` | one row, every outcome `exact`, confidence `exact`, `receipt.fields` all `exact`, no `reason` |
| M1 with `merchant` replaced by `{ first: [{between:["at "," on"]},{between:["debited "," at"]}] }` | `chosen` → `proposed` |
| M1 with `merchant` as `{ default: { value: "unknown", of: … } }` on a body without `at ` | `defaulted` → `proposed` |
| body without `at ` (plain D1) | `merchant: missing` → `needs-review`, `reason = 'needs-review: merchant missing'` |
| body `"sent recv"` under the ambiguous enum | `needs-review`, `reason = 'needs-review: kind ambiguous'` |
| D1 + `writes.confidence: needs-review` on M1 | `needs-review` — the ceiling |
| D1 + `writes.register: { by: [kind, amount.currency], to: [{ when: [debit, EGP], register: txn_egp }] }` on M1 | row `register = 'txn_egp'` |
| same, M1 with `USD` | `register` absent, `needs-review`, `reason = 'needs-review: route miss on kind, amount.currency'` |
| D1 + `skip: [{ when: { field: body, contains: "REFUND" }, reason: "refund" }]` on `"REFUND … "` | `skipped: 'refund'`, `rows: []`, no receipt |
| a 2,000,001-byte body | `needs-review`, `reason` starts `'body too large ('` |
| `read.format: csv`, 5,001 rows | `needs-review`, `reason` starts `'rows over cap ('` |
| `read.format: json`, body `{` | `reason = 'body unparseable as json'` |
| 10 CSV rows, row 4 with `amount: 'abc'` | `rows.length 10`, row 4 `invalid`, arrival `needs-review`, `reason = 'needs-review: row 4 amount invalid'` |
| **leak test** | over every case above: no 4-character substring of `reason` or of `JSON.stringify(receipt)` occurs in the body unless it is a field id |
| `testAgainst(D1, [M1, M1 with "to ACME on", M1 with "REFUND"])` with the skip | `samples 3, matched 3, skipped 1, fields.merchant = { won: 1, lost: 1 }, fields.amount = { won: 2, lost: 0 }` |
| `testAgainst` with `match: { field: from, contains: "bank" }` and one sample lacking `from` | that row `matched: false` (34 §1.3) |
| `isDuplicate(a, b, ['ref'])` with equal `ref` · differing `ref` · `ref` absent on one side | true · false · false |
| `isDuplicate(a, b, { near: { on: [account, amount], day: date, prefix: { field: merchant } } })` — `a = {account:'e1', amount:{125000,'EGP'}, date:'2026-08-29', merchant:'BEANS COFFEE CAIRO'}`, `b` same with `date:'2026-08-30'`, `merchant:'Beans Coffee Cairo Branch'` | true |
| `b.date = '2026-08-31'` · `b.amount.amount = 125001` · `b.amount.currency = 'USD'` · `b.merchant = 'BEANS CAFE'` | false · false · false · false |
| `b.merchant = 'BEANS COFFEE NASR'` | true — the first 12 folded characters, `beans coffee`, are equal; the prefix is a prefix, and the test pins that |
| `a` lacks `merchant`, `b` has it · both lack it | false · true |

### 9.6 · Bench and gates

`test/bench.test.ts` generates the §7 inputs and asserts the CI-ceiling column. Its 1 MB CSV is also a
correctness case: 10,000 generated rows extract as 10,000 rows, every outcome `exact`, and row 10,000's fields
deep-equal the generator's — so the timing and the answer are one test. Gates from 33 §8 that touch this
package: `graph` (imports `where` only), `closed-lists` (`EXTRACTORS` + `COMBINATORS` = 10 + 3 against 34 §6),
`refusal-fixtures` (the three §13 D13 codes, once 30 §6 carries them, each with `fixtures/refusals/<kebab>.yaml`),
`secret-grep` (nothing to grep — no log line exists), and the repo lint's no-`RegExp` rule over `src/`.
`clean-room` (BUILD.md) runs over the tests too: no predecessor identifier, no real bank text.

---

## 10 · Deliberate ceilings

- `ponytail: no Unicode normalisation; a decomposed payload misses a composed anchor — add String.normalize('NFC') on text and literals when a real message needs it.`
- `ponytail: YY is always 20YY — add a pivot key to the date form when a pre-2000 date is ever extracted.`
- `ponytail: no month names (MMM); add the token when the 50-message test of 21 §13 needs it — never regex.`
- `ponytail: exponent-3 currencies read a lone separator + 3 digits as the decimal point; KWD 1,250 meaning 1,250 dinars is misread — add decimal: "." | "," to the money form when a real ledger hits it.`
- `ponytail: trailing minus (1,250.00-) and DR/CR suffixes are not read; add when a statement uses them — the sign rule is one branch.`
- `ponytail: a symbol two table rows share resolves to none; declare currency: — a locale hint is not worth a key until a second currency table exists.`
- `ponytail: no anchor kinds beyond literal after/before/between; 21 §13 names the next three (table cell, label-adjacent, nth line) — add each as an extractor form.`
- `ponytail: every declared field is required and default is the only optional; add optional: true if authors keep wrapping fields in defaults they do not want written.`
- `ponytail: the JSON path has no quoted keys, wildcards or filters; a key containing . or [ is unaddressable — add "quoted.keys" when a real API needs one.`
- `ponytail: CSV takes the first row as the header and the last duplicate header wins; no type inference — map: coerces.`
- `ponytail: XML keeps namespace prefixes literal, refuses a DTD and flattens mixed content into #text; a feed that needs more needs a parser dependency, and that is a new ADR (35 §2).`
- `ponytail: HTML table ignores colspan/rowspan and nested tables and takes the first row as the header — add read.header: n when a page needs it.`
- `ponytail: text format is one row per body; a line-per-row source needs read.rows: lines — add when a source needs it.`
- `ponytail: lookup receives every live row's key and scans them; fine to a few thousand rows — add a resolver-side filter when a register outgrows it.`
- `ponytail: per arrival, all rows or none; a partly good CSV goes to review whole — per-row acceptance is the rowset review of 23 §4, later.`
- `ponytail: map: coerces no ref, file, secret, quantity or list; add lookup: on a map entry when a connector needs a foreign row.`
- `ponytail: the row cap refuses the whole response; lower the page size — add streaming only if a source cannot page.`
- `ponytail: the format cache is a 64-entry Map cleared when full; a record with more than 64 date formats is not a record this was built for.`

---

## 11 · Dependencies

| Kind | Name | Version | Why |
|---|---|---|---|
| runtime | — | — | none (35 §2) |
| workspace | `@braindog/where` | `workspace:*` | `Predicate`, `evaluate` — 31 §2 row 8 |
| dev | `typescript` | 6.0.3 | type-check only (31 §3) |
| dev | `@types/node` | 24.13.0 | the test files' `node:test` and `node:assert/strict` |

No Valibot: the declaration is validated by `declare`; this package's only structural check is the one `switch`
that throws `EXTRACTOR_UNKNOWN`. No YAML: `declare` is the one package with a YAML parser (30 §7).

---

## 12 · Build order

**Needs first:** `packages/where` with `Predicate` and `evaluate(predicate, subject, ctx)` over the `inbox_raw`
subject (phase 0, BUILD.md); `tsconfig.base.json` and the repo lint config for the no-`RegExp` rule.

**Unblocks:** `record` (45) — steps 2–3 of the pipeline, `isDuplicate` in step 5, the receipt row; `spark` (46) —
`testAgainst` scores a proposed `pattern` body (33 §2's `pattern { ingest, samples }`) before it is filed;
`connect` (47) — `readRows`, `select` and the `map:` coercion, so `expect:` paths and `page.from` paths are the
one grammar; `cli` (48) — `braindog ingest test` (§13 D15); `declare` (42) agrees on §4.2–§4.5 by schema, not by
import.

Position: eighth of the fifteen in 31 §2; buildable and fully testable before `kernel` exists, because nothing
here touches a table.

---

## 13 · Decisions taken here

Sixteen, counted. Each names the design document to amend in the same revision (35 §1).

| # | Decision | Amend |
|---|---|---|
| D1 | **The JSON path subset** is §4.4: literal keys, `[n]`, `[-1]`, `[]`, ≤ 16 segments, own properties only; `select` returns a list. **It lives in `@braindog/where` as `selectAll`, not in this package** — the grammar had three readers (`expect:`, `page.from`, `read.rows`) and `where` already owned two of them as `readPath`. `extract` re-exports it under §2's name. The two readings are not one function and the divergences are written between them in `where/src/path.ts`: `47 §4.3` keys are `[A-Za-z_][A-Za-z0-9_-]*` where §4.4 keys are anything but `.[]` (a CSV header, or `atom:entry`, which §5.5 requires be literal); `47` keeps a missing element in a fan as `undefined` because an `expect:` over every element must not become one over the elements that had the field, where §4.4 drops it because a row that is not there is not a row; `47` allows one fan, §4.4 one per segment; `47` reads `undefined` at run and refuses at install, §4.4 refuses at the door | 25 §3.1 — cite the grammar instead of the four-word list |
| D2 | **The thousands rule**: a lone separator followed by exactly three digits is grouping unless the currency's exponent is 3; two or more separators — the last differing one is the point; refuse over round | 07 §3 — after "`money` accepts `1,250.00`, `1.250,00` and `1250`", add the rule and its ceiling |
| D3 | **The dedupe key**: `dedupe:` is a field list (exact) or `{ near: { on, day, prefix: { field, chars = 12 } } }`; duplicate = `on` equal, day ±1, folded prefix equal; the record fetches candidates, this package decides | 07 §2 (the fuzzy dedupe gets its key), 25 §3.2 (`dedupe:` takes either form) |
| D4 | **Zero `RegExp`** in the package, enforced by a scoped lint rule; every scanner is a single advancing pass | 07 §3 "No regular expressions" — extend from the declaration to the implementation; 31 §3 layer 4 gains the rule |
| D5 | `lookup` takes the nested form `{ lookup: { register, by } }` like every other extractor | 07 §3 — the `account:` line of the example |
| D6 | **The forms of §4.3** — anchors as optional keys on value extractors, `enum.map`, `first: [..]`, `nth: { n, of }`, `default: { value, of }`, candidate lists in text order; 42's schema encodes them verbatim | 07 §3 — the transform table gains a JSON-form column; 42 §4 |
| D7 | **Confidence**: derived per row from outcomes (§5.1 step 7); `writes.confidence` is a ceiling, default `exact`; every declared field is required and `default` is the only optional; `needs-review` writes nothing and lands the arrival in `review` | 07 §2 (define `proposed`), 07 §3 (`confidence:` is a ceiling), 30 §1 comment on `ingest_receipt.confidence` |
| D8 | **`skip:` and routing get syntax**: `skip: [{ when, reason }]` over the arrival; `writes.register` may be `{ by: [ids], to: [{ when: [values], register }] }`, a miss → review | 07 §2 — the three rules that "travel with it" are written out |
| D9 | **`fetch.read` gains `format`** (`json` default · `csv` · `xml` · `html_table` · `text`), `delimiter`, `table` | 25 §3.2 — `read: { rows: data }` becomes `read: { format, rows, … }`; 34 §6 adds a five-member row owned by 25 |
| D10 | **`map:` coercion table** of §4.5 incl. `currency:` on a single-path money and `format:` on a day; `ref file secret quantity list` unmappable | 25 §3.2 — state the keys; `type:` values "are the register field types" minus five |
| D11 | **Per arrival, all rows or none**; the receipt is one row per arrival with `wrote` filled by the record; a skipped arrival has no receipt | 07 §7 steps 4–5 |
| D12 | `extract` imports `evaluate(predicate, fields, schema, row?): boolean` and the `INBOX_RAW` schema from `@braindog/where`; `matches` evaluates the stored body, not the normalised one, and a test asserts that answer equals `body.toLowerCase().includes(needle.toLowerCase())` rather than trusting the sentence. **The signature this row used to state does not exist**: there is no `ctx`, and `now`/`tz` are not parameters because `sentence.ts` resolves `today` and its kin to concrete days before the evaluator sees them. `subject` became a property of the schema, which is what makes `34 §1.9`'s "exactly these seven fields" true rather than aspirational — `specOf` had been handing every schema the record's five kernel columns, so `{ field: id }` over an arrival threw instead of answering false. **Landed.** `§1.9`'s operator half is enforced by `compile` itself, keyed on `subject`: the list is `INBOX_RAW_REFUSES` and `declare` imports it rather than keeping a copy. The claim that a schema could not express it was about the TYPE, and the fact belongs to the backend. `kernel/src/ingest.ts`'s second copy of the arrival schema is gone with it — it disagreed with this one about `channel`'s type, so `{ field: channel, in: [email, imap] }` installed clean, fired in the kernel and matched nothing here | 34 §1.11 — rewritten to the contract that exists; 38 §2 exports it |
| D13 | **Three codes**: `EXTRACTOR_UNKNOWN` (a key outside the thirteen), `DATE_FORMAT_INVALID` (§4.3's rules), `PATH_INVALID` (§4.4's grammar) — grammar group; fixtures `extractor-unknown`, `date-format-invalid`, `path-invalid`; 42 raises them at install, this package at first use | **Landed.** All three are in `30 §6`, with fixtures, in the `ports` union and raised from source. The row's old note read "grammar 10 → 13, total 75 → 78" against a table that is now 125 codes and 14 grammar: the codes were carried and the arithmetic was not, which is how a finished item keeps looking open; 34 §6 |
| D14 | **The currency table** is `{ [code]: { exponent, symbol? } }`, owned by the kernel, passed in `ctx`; a shared symbol resolves to none | 02 §3 — the table has an exponent and an optional symbol |
| D15 | **`braindog ingest test <id> --against <raw ids \| file>`** prints the `Report` in the 23 §4 shape; exit 1 when any field is `0 of n` | 33 §5 — one row beside `rule test` |
| D16 | **Body cap 2,000,000 bytes and row cap 5,000** at extraction; over either is kept raw in `review` with the reason | 07 §2 — a body over the row ceiling is kept and never extracted; 25 §3.2 `limits` cite it |

---

## 14 · Done when

- [x] `packages/extract` has the seven `src/` files of §3 and exports exactly the §2 surface; `pnpm -F @braindog/extract typecheck` is clean under `tsconfig.base.json`
- [x] `EXTRACTORS` and `COMBINATORS` read 10 + 3 and the `closed-lists` gate agrees with 34 §6
- [x] no `RegExp` under `src/`; the scoped lint rule exists and fails a planted `/a+/`
- [x] the money property runs 2,000 cases with no seed directory, and it has teeth: `padEnd` swapped for `padStart` in `readAmount` turns it red. It found the no-break space: `isSep` knew one space character and `normalise` folded sixteen, so `EGP 2 642,97` read as 2.00 for any caller of `parseMoney` who had not normalised first. One list now, in `money.ts`
- [x] the leak test passes over every §9.5 case — over the receipt's leaves rather than its serialisation, which is the same rule without the artefact that fires on `"e":"` whenever the body is itself JSON
- [x] `test/bench.test.ts` passes the CI-ceiling column of §7 and prints the medians
- [x] the three D13 codes are in 30 §6 with fixtures, and `refusal-fixtures` is green
- [ ] the sixteen amendments of §13 are applied to 02, 07, 25, 30, 31, 33, 34 in the same revision, and BUILD.md's loop table records it
- [ ] `record`'s pipeline compiles against `matches · extract · isDuplicate` and `connect` against `readRows · select` with no adapter code between

---

*Previous: [42-SPEC-DECLARE](42-SPEC-DECLARE.md). Next: [44-SPEC-MCP](44-SPEC-MCP.md).*
