# 36 · `packages/render` — specification

Stage 0 of [31-STACK](31-STACK.md) §2: the first package, built alone, published as `braindog-render` under MIT.
Derives from [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §1–§7, [34-GRAMMARS](34-GRAMMARS.md) §2 and
[13-UI](13-UI.md) §2.3. Conventions are [35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §2. Nothing here is ported.

---

## 1 · Purpose and boundary

**Does.** Takes a `document` string in the dialect of 34 §2 and returns segments (`parse`) or HTML (`toHTML`).
Draws the thirty-one kinds over the eight primitives. Resolves `{{path}}` through a function the caller supplies.
Formats money, dates, quantities and references one way. Never renders nothing: a malformed block becomes a
visible fence with one line above it (05 §3 invariant 1).

**Refuses to do.**

| Never | Because |
|---|---|
| read a record, a file, the network, or a clock other than `opts.now` | in-degree 0; 31 §1 bans `node:*`, `fetch`, `process` under `packages/**` |
| pass HTML through, load an asset, emit a colour, a font or a spacing value | 05 §3 invariant 3; 04 §7 |
| refuse a document | the fence at render is the feedback channel, 05 §3 |
| draw a `table` | page-only, 05 §2.1; a `table` fence degrades |
| draw `cards`, `section` or `feed` from a write-up | page-only; only a page's evaluator passes `parse(src, { page: true })`, because it writes their rows from a declaration |
| read a version history | a `diff` draws the rows it is given; `diffRows(before, after)` is a pure function a host calls with two texts it already holds |
| render Svelte | `braindog-render/svelte` is stage 3 (31 §2) and outside this spec |
| validate a pack's `block` declaration | `declare`, spec 42 |

**May import:** nothing. Permitted platform surface: ES2023, `Intl`, `TextEncoder` (31 §1).

**Consumers:** `declare` (7), `cli` (12), `web` (13), and through `web` the Worker and the self-host process. All import the root export only.

---

## 2 · Public API

```ts
// packages/render/src/index.ts — the whole surface; the exports map names nothing else
export function parse(markdown: string, opts?: ParseOptions): Segment[];   // ParseOptions = { page?: boolean }
export function toHTML(segments: readonly Segment[], opts?: RenderOptions): string;
export function render(markdown: string, opts?: RenderOptions): string;      // toHTML(parse(markdown), opts)

export const PRIMITIVES_VERSION: 1;
export const PRIMITIVES: readonly ['panel', 'grid', 'rows', 'proportional', 'inline', 'list', 'table', 'media'];
export const KINDS: Readonly<Record<Kind, KindSpec>>;                          // thirty-one entries, §4
export function diffRows(before: string, after: string): string[];           // a `diff` fence's rows, §5.9

export type { Segment, Markdown, Block, Degraded, Row, Inline, Kind, KindSpec, Primitive,
              Tone, TypedKind, EvidenceTag, RenderOptions, LinkRef, Refusal };
```

```ts
interface RenderOptions {
  resolve?: (path: string) => unknown;            // undefined = the path names nothing · null = the value is missing
                                                  // default: () => undefined
  link?: (ref: LinkRef) => string | undefined;    // an href, or undefined for no link · default: () => undefined
  now?: number;                                   // ms since the epoch, UTC · default: Date.now(), the package's only clock read
}

type LinkRef =
  | { kind: 'row'; register: string; seq: number }   // {{ref:tasks#241}}
  | { kind: 'day'; day: string };                     // {{date:2026-09-26}} — the calendar (05 §7.2)
```

| Export | One sentence | Error contract |
|---|---|---|
| `parse` | fence scan, row split, tone, arity, inline tokens | never throws; every string yields a `Segment[]` (fuzz-tested, §9) |
| `toHTML` | resolves, formats, escapes, emits | throws nothing of its own; an exception from `opts.resolve` or `opts.link` propagates — the host owns them |
| `render` | `toHTML(parse(s), opts)` | as above |
| `KINDS` | the thirty-one kinds as data | — |
| `diffRows` | two texts as `- `, `+ ` and two-space rows, by a longest-common-run line diff over what differs between their shared head and tail | never throws; past 250,000 cells the changed middle is drawn as taken out and put back whole |
| `PRIMITIVES` | the eight primitive names, in 05 §1 order | — |
| `PRIMITIVES_VERSION` | `1` at stage 0 (31 §6) | — |

`braindog-render/svelte` is stage 3. It consumes the same `Segment[]` and is held to the parity test of §9. Nothing more is said here,
except that `cards`, `section`, `feed` and `diff` each have a drawer of their own on both sides (`svelte/Cards.svelte`,
`svelte/Section.svelte`, `svelte/Feed.svelte`, `svelte/Diff.svelte`, and the four in `html.ts`), reached through their primitive
as `board` and `quote` are, and that `src/cards.ts`, `src/feed.ts` and `src/diff.ts` hold what both drawers decide: the roles,
the trend line, the ring and a face's initial; a feed's groups, what is new and its empty sentence; a diff's lines, its folds and
its summary.

Versioning: the package semver moves on any change to this surface; `PRIMITIVES_VERSION` moves only when the eight
change (31 §6). A host that stores a parsed tree stores the package version beside it (22 §8).

---

## 3 · Files

```
packages/render/
  LICENSE                MIT text; the filename exactly (31 §4 rule 3)
  README.md
  package.json           name braindog-render · license MIT · type module · dependencies {} ·
                         exports { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } } ·
                         files ["dist", "src", "LICENSE", "README.md"]
  tsconfig.json          strict · erasableSyntaxOnly · verbatimModuleSyntax · declaration · outDir dist
  src/
    index.ts      ~20    re-exports; render()
    kinds.ts      ~70    PRIMITIVES, KINDS, TONES, ALIASES, TYPED, EVIDENCE — every closed list, `as const`
    parse.ts     ~140    fence scan → segments; row split; tone; arity; degradation
    inline.ts    ~130    the inline tokeniser: code span, {{…}}, typed forms, evidence, strong, em, link, text
    html.ts      ~340    escape; markdown blocks; resolve and format; eight primitive emitters; the degraded block
    cards.ts     ~150    what `cards` and `section` decide: the roles, the trend line, the ring, a face's initial
    feed.ts       ~90    what `feed` decides: its groups, which rows are new, its two empty sentences
    diff.ts      ~160    what `diff` decides, and the line diff: read a row, fold long shared runs, `diffRows`
  test/
    parse.test.ts  inline.test.ts  html.test.ts  fuzz.test.ts  budget.test.ts
    fixtures/      stat-05.md  dialect-arity.md  dialect-kind-unknown.md  writeup-100kb.md
    seeds/         committed { seed, path } from fuzz failures (35 §2)
```

Five source files, about 700 lines. Every `src/**` file opens with `// SPDX-License-Identifier: MIT` (31 §4 rule 6).
Build is `tsc -p .`; no bundler. Tests run on the `.ts` sources with `node --test`.

---

## 4 · Data structures

```ts
type Primitive   = typeof PRIMITIVES[number];
type Kind        = 'note' | 'quote' | 'stat' | 'bar' | 'gauge' | 'chips' | 'spec' | 'params'
                 | 'todo' | 'steps' | 'timeline' | 'board' | 'code' | 'tree' | 'comparison' | 'table'
                 | 'cards' | 'section';
type Tone        = 'good' | 'warn' | 'bad' | 'info' | 'hole';
type TypedKind   = 'date' | 'day' | 'until' | 'ago' | 'money' | 'quantity' | 'pct' | 'ref';
type EvidenceTag = 'verified' | 'inferred' | 'estimate' | 'unknown';

interface KindSpec {
  primitive: Primitive;
  cells: readonly string[];     // cell names in order; arity = cells.length; [] = rows are not split
  tone: boolean;                // the kind draws a tone (34 §2.2); the slot is parsed on every split kind (§13-7)
  rows?: 1 | 6;                 // a cap on rows: quote 1 · gauge 1 · stat 6
  ordered?: true;               // list kinds drawn as <ol>
  hole?: true;                  // bar
  pageOnly?: true;              // table
}
```

`KINDS`, thirty-one, counted:

| Kind | Primitive | Cells, in order | Arity | Tone | Row cap | Flags |
|---|---|---|---|---|---|---|
| `note` | panel | — body is markdown | 0 | yes | — | |
| `quote` | panel | text · attribution | 2 | no | 1 | |
| `stat` | grid | label · figure · note · trend (optional) | 4 | yes | 6 | forms `lead` |
| `bar` | proportional | label · number · note | 3 | yes | — | hole |
| `gauge` | proportional | label · value · target | 3 | yes | 1 | |
| `chips` | inline | glyph · figure · word | 3 | yes | — | |
| `sparkline` | proportional | label · run of numbers · figure | 3 | yes | — | |
| `split` | proportional | label · value · note | 3 | yes | — | hole |
| `bridge` | proportional | label · ±amount · note | 3 | no | — | |
| `series` | proportional | the header row's count: bucket · up to four series (`in:` or `out:`) · `state` (optional) | n | no | — | header, forms `net` |
| `lines` | proportional | the header row's count: point · up to four lines, a `was:` line being the same measure over the period before, dashed | n | no | — | header; the first current line is the one accent series, and the lead is its last value with the change against the first `was:` line at the same point |
| `progress` | proportional | label · value · target · note (optional) | 4 | yes | — | forms `budget`; a goal is `good` once reached, a budget `warn` from 90% and `bad` past its limit, the part over marked; a tone written on the row wins |
| `forecast` | proportional | mark (`opening` `past` `step` `horizon` `knobs`) · day · label · amount | 4 | no | — | page-only; knobs and scrub only with `RenderOptions.scenario` |
| `spec` | rows | label · value · note | 3 | no | — | |
| `params` | rows | label · value · note | 3 | no | — | |
| `todo` | list | title · detail · fact · fact (the two facts optional) | 4 | no | — | marker; the two facts are one quiet line under the title, joined by ` · `, and a row with both blank draws no line, so a two-cell row draws as it did before the facts existed |
| `steps` | list | title · detail · state | 3 | no | — | ordered |
| `timeline` | list | date · title · detail | 3 | yes | — | ordered |
| `board` | grid | column · title · detail | 3 | no | — | |
| `roadmap` | list | title · by (`YYYY-MM-DD`, or `D Mon YYYY` as `day()` writes it, which is the form a page's reader projects) · effort in days (optional) | 3 | yes | — | a row with an effort is a bar ending on `by`, as many whole days long as the effort rounded up; one with none is a dated stem; a row whose date or effort does not read is named under the drawing, never placed; today's line from `RenderOptions.now`; every mark painted `currentColor` by presentation attributes, which a host rule overrides |
| `code` | media | — verbatim | 0 | no | — | |
| `tree` | media | — verbatim | 0 | no | — | |
| `comparison` | table | the header row's count | n | no | — | |
| `table` | table | — | 0 | no | — | pageOnly |
| `cards` | grid | the first row names each column's role (`title figure fact trend ring who when mark quiet`); one row per card | the header's count | yes | — | pageOnly · header |
| `section` | panel | glyph · count · fold | 3 | no | 1 | pageOnly |
| `feed` | list | by (`agent rule you`, or `seen`) · who · count · what · when | 5 | yes | — | pageOnly |
| `diff` | media | — verbatim, each row marked `- `, `+ ` or two spaces | 0 | no | — | |
| `agents` | list | who · count · what (empty on the row that folds an agent's rest) · when | 4 | yes | none | pageOnly |
| `queue` | list | a row per part: `q · id · who · when · question · why · cost`, `opt · id · key · label · because · recommended`, `more · n` | 7 | yes | none | pageOnly |
| `capture` | panel | a row per part: `into · register · label · where` once and first, `set · field · value` for each value a new row inherits | 4 | no | none | pageOnly; the heading is the field's prompt and never a caption; the field and its Add only with the Svelte `Block`'s `oncapture`, and without it the list's name, a link where `where` is a path |

```ts
type Segment = Markdown | Block | Degraded;

interface Markdown { type: 'markdown'; text: string; line: number }   // the lines between fences, verbatim, LF-joined

interface Block {
  type: 'block'; kind: Kind; line: number;    // line = the opening fence, 1-based
  heading?: Inline[];                          // the info string after its first `|`, tokenised
  tone?: Tone;                                 // a trailing tone word on the info string (§5.1 step 6)
  rows: Row[];                                 // [] for note, code, tree
  body?: string;                               // note: markdown · code, tree: verbatim lines, LF-joined
}
interface Row { line: number; cells: Inline[][]; tone?: Tone; done?: boolean }   // done: todo only

interface Degraded { type: 'degraded'; line: number; kind: string; source: string; refusal: Refusal }
interface Refusal  { code: 'DIALECT_ARITY' | 'DIALECT_KIND_UNKNOWN'; at: string; found?: unknown; wanted?: string; fix: string }
                   // the shape of 33 §2, copied here because render imports nothing

type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'path'; path: string }
  | { type: 'typed'; kind: TypedKind; arg: string }        // literal or path — decided at render, §5.5
  | { type: 'evidence'; tag: EvidenceTag; source?: Inline[] }
  | { type: 'bad'; text: string }                          // `{{…}}` that is neither a path nor a typed form
  | { type: 'strong' | 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };
```

Invariants, each a test in §9:

1. Every non-blank input line belongs to exactly one segment. `Degraded.source` is the block's lines verbatim, both fences included.
2. `Block.kind` is one of the thirty-one and is never `table`; it is `cards`, `section` or `feed` only when `parse` was called with `{ page: true }`.
3. For a split kind, `Row.cells.length ≤ KINDS[kind].cells.length`; for `comparison`, ≤ the header row's count.
4. `Row.tone === 'hole'` only when `Block.kind === 'bar'`.
5. `Block.rows.length ≤ KINDS[kind].rows` where a cap is set.
6. A `code` inline holds text only. A resolved value never becomes an `Inline`: values are strings at render, never re-tokenised.
7. `Degraded.refusal.code` is one of the two dialect codes of 30 §6.
8. `parse` is total: no input throws, and the output of `parse` round-trips through `toHTML` without throwing.

---

## 5 · Algorithms

### 5.1 · The fence scan — `parse.ts`

1. Replace `\r\n` and `\r` with `\n`. Split on `\n`.
2. A line is a **fence line** iff it begins with three backticks at column 0. Its **info string** is the rest of the line, trimmed.
3. Outside a block, accumulate lines into the current markdown run. On a fence line: close the run as `Markdown` if it holds a non-blank line, then open a block with the info string; record the line number.
4. Inside a block, accumulate lines until the next fence line, whatever it carries — the scan is flat (05 §7.4). The closing fence's info string is dropped. EOF closes an open block (§13-8).
5. Info string → kind and heading with `^([a-z]+)(?:\s*\|\s*(.*))?$` (05 §2.1).
   - Empty info string → kind `code`, no heading (§13-8).
   - No match, non-empty → degrade `DIALECT_KIND_UNKNOWN`; `kind` = the info's first whitespace-delimited token.
   - Match, kind not in `KINDS`, or kind `table` → degrade `DIALECT_KIND_UNKNOWN` (§13-9).
   - Match, kind `cards`, `section` or `feed`, without `{ page: true }` → degrade `DIALECT_KIND_UNKNOWN` (§13-21, §13-22).
6. Heading: split as a row (§5.2). A trailing tone word is the **block's** tone; the remaining cells, re-joined with ` | `, are the heading, tokenised (§5.4). `note | Kicker | bad` is how a note takes a tone (§13-6).
7. Body: `note`, `code`, `tree` → `body` = the lines joined with `\n`, `rows = []`. Every other kind: each non-blank line is a row (§5.2).
8. Arity: a row with more cells than the kind takes → degrade the whole block, `DIALECT_ARITY`, `at: "rows[n]"` (n is 1-based among rows). `comparison` and `cards`: the first row is the header; its count is the arity for the rest, the header carries no tone, and a later row's tone is read only from a cell beyond that count. Rows over the cap → degrade, `at: "rows"`. A `cards` header with a word that is not a role, two of one role, or more than three facts → degrade, `DIALECT_ARITY`. A `feed` row whose first cell is not `agent`, `rule`, `you` or `seen`, or a second `seen` row → degrade, `DIALECT_ARITY`. A `diff` row that is not empty and starts with anything but `-`, `+` or a space → degrade, `DIALECT_ARITY`, naming the row.
9. Emit the `Block` or `Degraded`. Continue at step 3.
10. At EOF close an open markdown run.

O(lines). One pass. No recursion.

### 5.2 · Row split

1. Scan characters with a cell buffer: `\|` appends `|`; `\\` appends `\`; any other `\` appends `\`; a bare `|` ends the cell; anything else appends.
2. Trim every cell of spaces and tabs.
3. If the last cell is one of `good warn bad info` it is the tone. If it is an alias — `earn→good` `danger→bad` `accent→info` `risk→warn` — it is the mapped tone. If it is `hole` and the kind is `bar`, the tone is `hole`. Anything else stays a cell (05 §2.1).
4. `todo` only: a first cell beginning `[ ]`, `[x]` or `[X]` sets `done` and loses the marker; no marker means not done (§13-18).
5. Tokenise every cell (§5.4). Interpolation happens later, per cell, on the tokens — a substituted value is never re-split (34 §2.1).

### 5.3 · Tones

| Author writes | Tone | Class | Glyph | Theme role (13 §2.3) |
|---|---|---|---|---|
| `good`, `earn` | good | `tone-good` | ✓ | `earn` |
| `warn`, `risk` | warn | `tone-warn` | ⚠ | `warn` |
| `bad`, `danger` | bad | `tone-bad` | ⊘ | `danger` |
| `info`, `accent` | info | `tone-info` | ⓘ | `accent` |
| `hole` (bar only) | hole | `tone-warn hole` | ⚠ | `warn` |

Four words, four aliases, one bar-only tone — 34 §6. The glyph is emitted by the renderer as the first child of the
toned element: `<span class="glyph" role="img" aria-label="warn">⚠</span>`. The glyph is part of the intent token;
there is no path by which `tone-warn` reaches the DOM without it (13 §2.3).

### 5.4 · Inline tokeniser — `inline.ts`

One regular expression, one left-to-right pass. The earliest match wins, so a code span swallows everything inside it — "code spans are lifted first" (05 §7.1 rule 4) falls out of the ordering.

```
(`[^`\n]+`)                                                        1 code span
| \{\{\s*([^}\n]*?)\s*\}\}                                          2 interpolation — classified in step 3
| \{(verified|inferred|estimate|unknown)                            3 evidence tag …
    (?::\s*((?:\{\{[^}\n]*\}\}|[^}|\n])*))?\}                          … whose source may hold interpolations (§13-13)
| \*\*([^*\n]+)\*\*                                                 4 strong
| (?<![\w*])\*([^*\n]+)\*(?![\w*])                                  5 em
| \[([^\]\n]+)\]\(([^)\s]+)\)                                       6 link
```

1. Text before a match is a `text` token. Text after the last match is a `text` token.
2. Alternative 1 → `code` with the inner text.
3. Alternative 2, the inner text:
   - empty → `text` `{{}}` as typed;
   - `^(date|day|until|ago|money|quantity|pct|ref):(.*)$` → `typed { kind, arg: trimmed }`;
   - the path lexicon → `path`;
   - anything else → `bad { text: inner }` — rendered as the author's text, marked (05 §7.1).
4. Alternative 3 → `evidence { tag, source }`; the source is tokenised by this same function (its character class admits only text and interpolations).
5. Alternatives 4–6 → `strong` / `em` / `link` with children tokenised by this same function; `href` is kept as written and filtered at render (§5.8).
6. Any other `{word}` is text (05 §7.3).

**Path lexicon** (05 §7.1, 34 §2.3): `segment = [A-Za-z][A-Za-z0-9_-]*(#[1-9][0-9]*)?` · `path = segment(\.segment)*`.
A path has no colon, so a typed form cannot be mistaken for one.

Every alternative is bounded by `\n` or its closing delimiter: the scan is linear in the input.

### 5.5 · Resolution and formatting — `html.ts`

A `path` token `P`:

1. `v = opts.resolve(P)`.
2. `undefined` → `<span class="unresolved" data-path="P">P</span>` — the path, marked (05 §7.1 rule 1).
3. `null` → `<span class="figure missing" data-path="P">—</span>` — never blank, never zero.
4. Otherwise `<span class="figure" data-path="P">format(v)</span>`. `data-path` is the app's hook for provenance on hover (08 §7).

`format(v)` by shape, decided here (§13-14):

| `v` | Renders |
|---|---|
| string matching `^\d{4}-\d{2}-\d{2}$` | `2 Sep 2026` |
| any other string | as is |
| number | `en-US` grouping — `2,690` · `0.04`; minus is U+2212 |
| boolean | `yes` / `no` |
| `{ amount: integer, currency: /^[A-Z]{3}$/ }` | money, §5.6 |
| `{ value: number, unit: string }` | `1.4 m` |
| array | each item formatted, joined with `, ` |
| any other object | `JSON.stringify(v)` |

The formatted string is escaped and inserted as text. It is never tokenised, split or interpreted.

A `typed` token: an `arg` whose first character is a letter is a path — `v = resolve(arg)`; `undefined` renders the
argument marked unresolved; `null` renders `—`; otherwise `v` is the argument. Any other first character is a literal
(05 §7.2). A literal that fails its grammar, or a resolved value of the wrong shape, renders `<span class="unresolved">arg</span>`.

| Kind | Literal grammar | Resolved shape | Renders |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | day string | `<a class="date" href="…"><time datetime="2026-09-26">26 Sep 2026 · in 4w</time></a>`; href from `link({ kind: 'day', day })`; no href → the `<time>` alone |
| `day` | `YYYY-MM-DD` | day string | `<time datetime="2026-04-10">10 Apr 2026 · 5mo ago</time>` — never links |
| `until` · `ago` | `YYYY-MM-DD` | day string | `<time datetime="…">in 3mo</time>` · `<time datetime="…">2w ago</time>` — both signed (§13-15) |
| `money` | `<integer> <CCY>` | `{ amount, currency }` or the literal as a string | §5.6 |
| `quantity` | `<decimal> <unit>` | `{ value, unit }` | `<span class="figure quantity">1.4 m</span>` |
| `pct` | `-?\d+(\.\d+)?` | number | `<span class="figure pct">−46.3%</span>` — **no tone class, ever** (05 §7.2) |
| `ref` | `register#seq` | a spoken-id string | `<a class="ref" href="…">#241</a>` from `link({ kind: 'row', register, seq })`; no href → `<span class="ref">#241</span>` |

**Relative time.** `d = round((noonUTC(day) − opts.now) / 86 400 000)`; a plain day is noon UTC (02 §3).

| \|d\| | Text |
|---|---|
| 0 | `today` |
| 1 – 13 | `Nd` |
| 14 – 60 | `Nw`, N = **min(8,** round(d / 7)**)** |
| 61 – 364 | `Nmo`, N = **min(11,** round(d / 30.44)**)** |
| ≥ 365 | `Ny`, N = round(d / 365.25) |

*The two `min` caps are an amendment, made because the table as first written was **not monotone**
and named one duration twice. `round(60 / 7)` is `9w` — sixty-three days — sitting immediately below
`round(61 / 30.44)`, which is `2mo`, sixty-one: **one day older read as two days younger**, on the
ladder every date in this product goes through. And `round(364 / 30.44)` is `12mo`, which is a year
said the long way, immediately below `1y`. **A band may never name a duration the band above owns**,
and its cap is its own top. Measured over 1–1200 days: two bad steps before, none after.*

Future: `in N…`. Past: `N… ago`. Absolute form: `D Mon YYYY`, English abbreviations, no leading zero.

### 5.6 · Money

1. Literal: split on whitespace into `^-?\d+$` and `^[A-Z]{3}$`; anything else is unresolved.
2. `exp = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits` — EGP 2, JPY 0, KWD 3; an unknown but well-formed code gives 2. Cached in a `Map` per currency (§13-1).
3. `s = String(|amount|).padStart(exp + 1, '0')`; integer part `s.slice(0, s.length − exp)` grouped with `,` every three digits; fraction `s.slice(−exp)` when `exp > 0`. String arithmetic — no float, no `Number` conversion (02 §3; `|amount| ≤ 2^53 − 1`, 34 §3).
4. `CCY int.frac`; a negative amount puts U+2212 before the digits: `EGP −1,299.00` (§13-2).
5. `<span class="figure money">EGP 1,299.00</span>`.

### 5.7 · Markdown between the blocks

Line-oriented, over each `Markdown.text` and each `note` body:

1. A blank line closes the open paragraph or list.
2. `^(#{1,6})\s+(.+)` → `<h1>`…`<h6>`.
3. `^\s*[-*]\s+(.+)` → `<ul><li>`; `^\s*\d+[.)]\s+(.+)` → `<ol><li>`. Consecutive items of one family form one list. Indentation is ignored: lists are flat (§10).
4. `^-{3,}\s*$` → `<hr>`.
5. Any other line is paragraph text; consecutive lines join with `\n` inside one `<p>`.

Every text run passes through §5.4 and then `escape`. The subset is closed: no blockquote, no table, no image, no
raw HTML, no setext heading, no autolink, no footnote (§13-12). Raw HTML is escaped, never passed through, for the
reason 04 §7 gives: a remote asset is an exfiltration channel — an image URL in a page is a callback carrying the record id — so there are none.

### 5.8 · Links

An `href` is kept iff it matches `^https:` · `^mailto:` · `^/(?!/)` · `^#`. `https:` and `mailto:` links carry
`rel="noreferrer"`; no link carries `target`. Anything else — `http:`, `javascript:`, `data:`, `//host` — renders the
token as its literal text `[text](url)` (12 §8: everything else renders as text).

### 5.9 · HTML per kind

Every block: `<figure class="block[ tone-x]" data-kind="K" data-primitive="P">`, then `<figcaption>` when a heading
exists (glyph first when toned), then the inner skeleton, then `</figure>`. A cell renders as `<span class="<cell name>">…</span>`
in the kind's order; an absent cell renders as an empty span — columns never shift (05 §3 invariant 2). Exceptions are in the table.

| Kind | Inner skeleton |
|---|---|
| `note` | `<div class="body">` §5.7 over `body` `</div>` |
| `quote` | `<blockquote><p>text</p></blockquote><p class="attribution">attribution</p>` |
| `stat` | `<ul class="cells" style="--cells:N"><li class="cell[ tone-x]">glyph? <span class="label"> <span class="figure"> <span class="note"></li>…</ul>` — N = row count, declared, never inferred (05 §4) |
| `bar` | `<ul class="bars"><li class="bar[ tone-x]" style="--magnitude:0.42"><span class="label"> <span class="figure"> <span class="note"></li>…</ul>`; a number that does not parse → no `style` — the row keeps its words and loses its bar (05 §7.4); the `hole` row is drawn **last**: `<li class="bar hole tone-warn"><button type="button" data-hole="label">glyph label figure note</button></li>` |
| `sparkline` | `<div class="prop"><div class="spark-row"[ data-intent]><span class="spark-label"> <svg class="spark-line" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="label: 18, 20, 19, 24"><path class="trend-line"><path class="trend-end"></svg> <span class="spark-figure num"> glyph?</div>…</div>`; under two points there is no `svg`. A stat row's trend is the same `svg` with `class="cell-trend"`, after the figure. `stat lead` puts `data-form="lead"` on the `figure` |
| `split` | `<div class="prop split">`, then `<svg class="split-track" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="Payroll 60%, Rent 30%">` with `<rect class="split-seg" data-step="0-3"[ data-intent] x width>` per part and `<path class="split-cut">` where parts meet, or `<p class="split-empty">` when all are zero; `<ul class="split-legend"><li class="split-item"[ data-intent]><span class="split-dot"[ data-step] aria-hidden="true"> <span class="split-label"> <span class="split-value num"> <span class="split-share num">`, when a part `<span class="split-note"> glyph?</li>…</ul>`; then the hole row, `<button type="button" class="split-hole" data-hole>` when the host passes `hole`, else a `div`. `src/split.ts` holds the plan |
| `bridge` | `<div class="prop bridge" style="--cells:N">`, `<svg class="bridge-chart" … role="img" aria-label="Start £9,000, Coming in +£2,000, …">` with `<path class="bridge-zero">` when the walk crosses zero and `<rect class="bridge-bar" data-move="start\|up\|down\|end">`, then `<ol class="bridge-rows"><li class="bridge-row"[ data-move]><span class="bridge-label"> <svg class="bridge-inline" aria-hidden="true"><rect class="bridge-bar"></svg> <span class="bridge-value num"> <span class="bridge-note"></li>…</ol>`, then `<p class="bridge-warn" data-intent="warn">` glyph and sentence when the rows do not add up or a row has no number. `src/bridge.ts` holds the plan and `signedOf` |
| `gauge` | `<div class="gauge[ tone-x]" style="--magnitude:0.70"><span class="label"> <span class="figure">value</span> <span class="target">target</span></div>` |
| `chips` | `<ul class="chips"><li class="chip[ tone-x]"><span class="glyph" data-glyph="G" aria-hidden="true"></span><span class="figure"> <span class="word"></li>…</ul>`; a row with an empty figure or an empty word is not drawn (05 §7.4) |
| `spec` · `params` | `<dl><div class="row"><dt>label</dt><dd class="value">value</dd><dd class="note">note</dd></div>…</dl>` |
| `todo` | `<ul class="todo"><li class="item[ done]"><input type="checkbox" disabled[ checked]> <span class="title"> <span class="detail">[ <span class="meta">fact · fact</span>]</li>…</ul>`; `meta` only when the third or fourth cell is not blank, and a blank one is left out with its dot |
| `steps` | `<ol class="steps"><li class="step" data-state="S"><span class="title"> <span class="detail"> <span class="state">S</span></li>…</ol>` |
| `timeline` | `<ol class="timeline"><li class="event[ tone-x]"><time datetime="2026-09-02">2 Sep 2026</time> <span class="title"> <span class="detail"></li>…</ol>`; a date cell that is not `YYYY-MM-DD` → `<span class="date">` |
| `board` | `<div class="columns"><section class="column"><h4>column</h4><ul><li class="card"><span class="title"> <span class="detail"></li>…</ul></section>…</div>` — columns in order of first appearance |
| `code` | `<pre><code class="language-L">verbatim</code></pre>`; `L` = the heading when it matches `^[A-Za-z0-9_+#.-]+$`; no `<figcaption>` |
| `tree` | `<pre class="tree"><code>verbatim</code></pre>` |
| `comparison` | `<table><thead><tr><th scope="col">…</th></tr></thead><tbody><tr[ class="tone-x"]><td>…</td></tr></tbody></table>`; a short row is padded with empty `<td>` to the header count |
| `cards` | `<ul class="cards-grid"><li class="cards-item"[ data-intent][ data-quiet]><div class="cards-head">` mark or face · `<h3 class="cards-title">` · glyph · `<span class="cards-when">` `</div>` · `<div class="cards-body">` figure · trend `<svg role="img" viewBox="0 0 1000 100" preserveAspectRatio="none">` with `vector-effect="non-scaling-stroke"` paths · ring `<svg aria-hidden="true">` with `stroke-dasharray` against `pathLength="100"`, beside its printed value `</div>` · `<dl class="cards-facts">` · `<div class="cards-who">` face and name `</li>…</ul>`. `data-quiet=""` is on a card whose `quiet` cell holds anything, and that cell is never printed. No cards → `<p class="cards-empty">Nothing to show.</p>`. No `figcaption` is withheld; the page passes none. Every mark is placed by an attribute and no `style` is written |
| `section` | no `figcaption`: `<div class="sec"><h2 class="sec-title">`glyph? heading `<span class="sec-count">`count, when not zero`</span></h2>` and, when folded, `<details class="sec-fold"><summary class="sec-toggle"><span class="sec-show">Show</span><span class="sec-hide">Hide</span></summary></details></div>`. The host hides the blocks after a shut `sec-fold` |
| `feed` | `<div class="feed">`, then per group, in the order agents, rules, you: `<div class="feed-group" data-by="agent\|rule\|you"><h3 class="feed-head">`Agents · Rules · You `<span class="feed-new">N new</span>` when any row is new, else `<span class="feed-tally">N</span></h3><ul class="feed-rows">`, and per row `<li class="feed-row"[ data-new][ data-intent]><span class="feed-count">`count, when not zero`</span><span class="feed-face" aria-hidden="true">`initial`</span><span class="feed-what"><span class="feed-who">`who`</span> `what, glyph`</span><span class="feed-when">`when`</span></li>`; before a group's first read row, when new rows sit above it, `<li class="feed-seen">Before you last looked</li>`. A count is the sum of the rows' counts, a row without one being one. No rows → `<p class="feed-empty">Nothing new.</p>`, or, when the `seen` row has no time, `Nothing to catch up on yet. From your next visit, what changed while you were away shows here.` |
| `queue` | `<div class="queue">`, then per question `<article class="queue-card"[ data-intent]><p class="queue-by"><span class="queue-who">`who`</span><span class="queue-when">`when`</span>`, `<span class="queue-cost" data-cost="`cost`">`the band's word`</span>` when the record sent a band this build has a word for, `</p><h3 class="queue-question">`question`</h3>`, `<p class="queue-why">`why`</p>` when there is one, then `<ul class="queue-options">` and per option `<li class="queue-option"[ data-recommended]><span class="queue-label">`label`</span>`, `<span class="queue-rec">Recommended</span>` when it is, `<span class="queue-because">`because`</span>` when there is one, `</li></ul></article>`. Past the cards, `<p class="queue-more">N more</p>` when the count says so. No questions → `<p class="queue-empty">Nothing is waiting on you.</p>`. Nothing is ever pre-selected: `queue-rec` is a label beside the option it names |
| `diff` | `<div class="diff"><p class="diff-sum">`2 lines added, 1 removed · No change`</p><div class="diff-lines">`, a line per row: `<div class="diff-line" data-op="same"><span class="diff-mark" aria-hidden="true"></span>`, `<del class="diff-line" data-op="del"><span class="diff-mark" role="img" aria-label="removed">−</span>` or `<ins class="diff-line" data-op="add"><span class="diff-mark" role="img" aria-label="added">+</span>`, then `<span class="diff-text">`text`</span>`. A run of shared lines that would hide four or more, keeping three beside each change, is `<details class="diff-fold"><summary class="diff-toggle">N lines unchanged</summary>`lines`</details>`. The lines wrap, so there is no scrolling box and no `tabindex` |
| degraded | `<figure class="block block-degraded" data-kind="K"><figcaption>fix</figcaption><pre class="block-degraded" data-code="C"[ data-row="n"]><code>source</code></pre></figure>` |

**Magnitude.** `numeric(cell)`: a cell that is exactly one `path` token uses the raw resolved value — a number is itself,
money is `amount`, quantity is `value`, a string is parsed; otherwise the cell text with `,` and `%` removed goes
through `Number`. `bar`: `--magnitude = |m| / max|m|` over the non-hole rows, two decimals; `max = 0` gives `0`;
`NaN` gives no `style`. `gauge`: `min(value / target, 1)` when both are numeric and `target ≠ 0`. The `hole` row is
outside the scale: excluded from the max, no magnitude, last, a button (05 §7.5; §13-11).

**Evidence.** `<span class="evidence evidence-verified">verified<span class="source">: source</span></span>`.
`{unknown}` is a hole, so it is the affordance: `<button type="button" class="evidence evidence-unknown" data-hole>unknown…</button>` (05 §7.3).

**Custom properties.** `--cells` and `--magnitude` ride an inline `style` attribute whose value the renderer formats
itself and which always matches `^--(cells|magnitude):\d+(\.\d{1,2})?$`. No other `style` is ever emitted (§13-10).

**Escaping.** `escape(s)` maps `& < > " '` to `&amp; &lt; &gt; &quot; &#39;`. It is applied to every text node and
every attribute value, and it is the only function in the package that writes content into markup (12 §8).

---

## 6 · Refusals and errors

Two codes. Both are render-time degradations, never write refusals — the "Dialect" rows of 30 §6. A `document` is
stored unparsed and is never refused for its dialect (05 §3; 04 §5): a 422 at write would hide an agent's mistake
behind an error it may never read, while the fence at render shows exactly what it typed, where, with one line above
it saying what to do. The fence is the feedback channel.

| Code | When | `at` | `found` · `wanted` | `fix` — the figcaption a person reads |
|---|---|---|---|---|
| `DIALECT_KIND_UNKNOWN` | the info string names no kind, or does not match the info regex | `info` | the token · `one of the twenty kinds` | `` `widget` is not a block kind. Write `code \| widget` for verbatim text, or one of the twenty kinds. `` |
| `DIALECT_KIND_UNKNOWN` | the kind is `table` in a write-up (§13-9), or `cards` outside `{ page: true }` | `info` | the kind · `a page block` | `` `table` draws a register on a page. In a write-up, use `comparison`. `` |
| `DIALECT_KIND_UNKNOWN` | the kind is `section` outside `{ page: true }` | `info` | `section` · `a page block` | `` `section` is a heading on a page, so it has no place in a fence. Write a `##` heading. `` |
| `DIALECT_KIND_UNKNOWN` | the kind is `feed` outside `{ page: true }` (§13-22) | `info` | `feed` · `a page block` | `` `feed` draws what happened in the record, on a page, so it has no rows in a fence. Use `timeline`. `` |
| `DIALECT_ARITY` | row n has more cells than the kind takes | `rows[n]` | the count · the kind's cells joined with ` \| ` | `` `stat` row 2 has 5 cells. A `stat` row is label \| figure \| note, then a tone. `` |
| `DIALECT_ARITY` | a `comparison` row is wider than its header | `rows[n]` | the count · the header count | `` `comparison` row 3 has 4 cells. The header has 3. `` |
| `DIALECT_ARITY` | rows over the cap — `stat` 6, `quote` 1, `gauge` 1, `section` 1 (§13-9) | `rows` | the count · the cap | `` `stat` has 7 rows. Six at most — a seventh tile is a `spec`. `` |
| `DIALECT_ARITY` | a `cards` header names a word that is not a role, two of one role, or more than three facts (§13-21) | `rows[1]` | the fault · one figure and at most three facts | `` A cards block has more than three facts. A card takes one figure and at most three facts. `` |
| `DIALECT_ARITY` | a `feed` row starts with a word that is not `agent`, `rule`, `you` or `seen`, or there are two `seen` rows (§13-22) | `rows[n]` | the word · the four | `` A feed block has a row that starts "claude" where agent, rule, you or seen goes. `` |
| `DIALECT_ARITY` | a `diff` row starts with anything but `-`, `+` or a space (§13-22) | `rows[n]` | the row · the three marks | `` A diff row starts with "- ", "+ " or two spaces, and "@@ -1 +1 @@" does not. `` |

The `fix` sentence follows 13 §6: what was wrong, where, what to do; no reasoning, no metric. The `Degraded` segment
carries the whole `Refusal`, so a CLI or an MCP surface prints `code` and `fix` the way it prints a write refusal.

The package throws nothing. An exception thrown by `opts.resolve` or `opts.link` is not caught: the host wrote it, the host sees it.

---

## 7 · Performance budget

All measured in `test/budget.test.ts` on Node 24.13.0: five warm-up runs, then the median of twenty, with `performance.now()`. The test fails above the budget.

| Measure | Budget | How |
|---|---|---|
| `parse` of `test/fixtures/writeup-100kb.md` — 100 KB, 120 blocks, 1,400 rows, 900 interpolations | ≤ 10 ms | as above |
| `render` of the same with a `Map`-backed `resolve` and a constant `link` | ≤ 25 ms | as above |
| Output bytes | ≤ 5 × input bytes | `new TextEncoder().encode(out).length` |
| Editor keystroke path — a 10 KB write-up, `parse` only (22 §8 gives 16 ms hard) | ≤ 1 ms | as above |
| `dist/index.js`, brotli | ≤ 12 KB | `zlib.brotliCompressSync` in a CI script |
| Runtime dependencies | 0 | `npm pack --dry-run --json`: no `dependencies` key or `{}` — the `licence-closure` gate, 33 §8 |
| Fuzz worst case — 1 MB of random text | `parse` ≤ 2 s | `fuzz.test.ts` |
| Memory | O(input) — every regex alternative is bounded by `\n` or its closing delimiter, so no backtracking blow-up | review, plus the 1 MB case |

---

## 8 · Security

Three trust boundaries are crossed, all inbound: the **document** (agent or person, untrusted text); **`resolve`
results** (record values — untrusted as markup); **link targets** (author text).

| Rule | Where |
|---|---|
| Every text node and every attribute value passes through `escape` before it touches markup; nothing else concatenates content into HTML | `html.ts` |
| Raw HTML in the document is text — `<script>` renders as `&lt;script&gt;` | §5.7 |
| A resolved value is inserted as text and never re-tokenised: a value holding `\|`, `**`, `{{`, `<` or a backtick changes nothing | §5.5 |
| No colour, font, spacing or `style` from content; the only `style` attributes carry `--cells` or `--magnitude` with a renderer-formatted number matching `^\d+(\.\d{1,2})?$` | §5.9; test 34 in §9 asserts it over every `style=` in the corpus output |
| Links are `https:`, `mailto:`, `/path`, `#anchor` only; the first two carry `rel="noreferrer"`; none carries `target` | §5.8 |
| No images, no iframes, no remote assets, no `http:` (04 §7) | §5.7, §5.8 |
| No network, no filesystem, no clock but `opts.now` | §1 |
| Every class name comes from a closed list; every `data-*` value is escaped author text or a closed-list word | §5.9 |
| Logging: the package logs nothing | — |

What never travels: nothing leaves the process. The package makes no call.

---

## 9 · Tests and gates

`node:test`, `node:assert/strict`, `node --test`. Every case is input → expected. Thirty-six, counted.

**`parse.test.ts`**

| # | Input | Expected |
|---|---|---|
| 1 | the 05 §2 `stat` example (`test/fixtures/stat-05.md`) | one `Block`, kind `stat`, heading `The number that shapes all three`, 3 rows; row 1 no tone, row 2 `bad`, row 3 `warn`; cells trimmed |
| 2 | `` ```spec `` · `Pipe \| here \| v` | one row, cells `["Pipe \| here", "v"]` |
| 3 | `` ```stat `` · `A \| 1 \| n \| danger` | row tone `bad` |
| 4 | `` ```bar `` · `Uncategorised \| 4200 \| 85% \| hole` · and `` ```stat `` · `X \| hole` | bar row tone `hole`; stat row cells `["X", "hole"]`, no tone |
| 5 | `` ```stat `` with 5 cells on row 2 (`dialect-arity.md`) | `Degraded`, `DIALECT_ARITY`, `at: "rows[2]"`, `source` = the fence verbatim including both fence lines |
| 6 | `` ```widget `` · `foo` (`dialect-kind-unknown.md`) | `Degraded`, `DIALECT_KIND_UNKNOWN`, `kind: "widget"` |
| 7 | `` ```code \| sh `` · `a \| b {{x}}` | `body` = `a \| b {{x}}`, `rows: []` |
| 8 | `` ```comparison `` · header 3 cells · row of 4 · row of 2 | 4 → `DIALECT_ARITY`; alone, the row of 2 parses with 2 cells |
| 9 | `` ```table \| x `` · `A \| B` | `Degraded`, `DIALECT_KIND_UNKNOWN` |
| 10 | `` ```stat `` with 7 rows | `Degraded`, `DIALECT_ARITY`, `at: "rows"` |
| 11 | `` ```note \| Kicker \| bad `` · `Body` | `tone: "bad"`, heading `Kicker`, `body: "Body"` |
| 12 | `` ```stat `` · `A \| 1` · EOF, no closing fence · and a bare `` ``` `` fence with `x` | a `stat` Block; a `code` Block |
| 13 | `` ```note \| A `` · `text` · `` ```stat \| B `` · `` ``` `` | segments: `note` with body `text`, then a `code` block with empty body — no `stat` block; the fence inside the note ended it |

**`inline.test.ts`**

| # | Input | Expected |
|---|---|---|
| 14 | `` `{{x}}` `` | `[code "{{x}}"]` |
| 15 | `{{tasks#125.state}}` · `{{money:129900 EGP}}` · `{{date:31 Sep}}` · `{{foo bar}}` · `{word}` · `{estimate: 3 sprints}` · `{verified: {{ref:decisions#41}}}` | `path` · `typed money` · `typed date, arg "31 Sep"` · `bad` · `text "{word}"` · `evidence` with a text source · `evidence` whose source is one `typed ref` |
| 16 | lexicon: `due-30d` `portfolio.revenue` `tasks#125.state` `entities#3.revenue.monthly` · `#7` `tasks#0` `a..b` `9x` | the first four are `path`; the last four are `bad` |

**`html.test.ts`** — `now = Date.UTC(2026, 7, 31, 12)`; `link` returns `/r/<register>/<seq>` and `/day/<day>`

| # | Input | Expected |
|---|---|---|
| 17 | `{{money:129900 EGP}}` · `{{money:1299 JPY}}` · `{{money:cost}}` with `cost → { amount: 500, currency: "KWD" }` · `{{money:-129900 EGP}}` | `EGP 1,299.00` · `JPY 1,299` · `KWD 0.500` · `EGP −1,299.00` |
| 18 | `{{pct:-46.3}}` | contains `−46.3%`; output contains no `tone-` |
| 19 | `{{ref:tasks#125}}` with and without `link` | `<a class="ref" href="/r/tasks/125">#125</a>` · `<span class="ref">#125</span>` |
| 20 | `{{nothing.here}}`, `resolve → undefined` | `<span class="unresolved" data-path="nothing.here">nothing.here</span>` |
| 21 | `{{v}}`, `resolve → null` | `<span class="figure missing" data-path="v">—</span>` |
| 22 | `{estimate: 3 sprints}` · `{unknown}` | `<span class="evidence evidence-estimate">estimate<span class="source">: 3 sprints</span></span>` · `<button type="button" class="evidence evidence-unknown" data-hole>unknown</button>` |
| 23 | `{word}` in a paragraph | `<p>{word}</p>` |
| 24 | `<script>alert(1)</script>` in a paragraph | `&lt;script&gt;alert(1)&lt;/script&gt;`; no `<script` in the output |
| 25 | `` ```spec `` · `L \| {{v}}` with `v → "a \| b \| c"` | exactly one `<dd class="value">a \| b \| c</dd>` and one `<dd class="note"></dd>` |
| 26 | `` ```bar `` · rows `10`, `30`, `n/a`, and a `hole` row placed first | magnitudes `0.33`, `1.00`; the `n/a` row has no `style`; the hole `<li>` is last, has class `hole tone-warn`, contains `<button`, and has no `style` |
| 27 | the `stat` of test 5 | `<pre class="block-degraded" data-code="DIALECT_ARITY" data-row="2">` and a figcaption starting `` `stat` row 2 has 5 cells `` |
| 28 | the `table` of test 9 | `data-code="DIALECT_KIND_UNKNOWN"` |
| 29 | `{{date:2026-09-26}}` · `{{day:2026-04-10}}` · `{{until:2026-11-30}}` · `{{ago:2026-08-14}}` | `<a class="date" href="/day/2026-09-26"><time datetime="2026-09-26">26 Sep 2026 · in 4w</time></a>` · `<time datetime="2026-04-10">10 Apr 2026 · 5mo ago</time>`, no `<a` · `in 3mo` · `2w ago` |
| 30 | `[a](https://x)` · `[a](/p)` · `[a](javascript:1)` · `[a](//evil)` | `<a href="https://x" rel="noreferrer">a</a>` · `<a href="/p">a</a>` · the literal text `[a](javascript:1)` · the literal text `[a](//evil)` |
| 31 | a `stat` row with tone `bad` | `<span class="glyph" role="img" aria-label="bad">⊘</span>` as the first child of the `<li>` |
| 32 | `comparison`, header 3, a row of 2 | the row has three `<td>`, the last empty |
| 33 | a three-row `stat` | `style="--cells:3"` on the `<ul>` |
| 34 | `render` of `writeup-100kb.md` | every `style="…"` matches `^--(cells\|magnitude):\d+(\.\d{1,2})?$` |

**`fuzz.test.ts`** — fast-check 4.9.0; a failing `{ seed, path }` is committed under `test/seeds/`

| # | Input | Expected |
|---|---|---|
| 35 | `fc.string({ unit: 'binary', maxLength: 2000 })`, 2,000 runs | `parse` does not throw; `render` with `resolve: () => undefined` does not throw; after removing every tag the package emits, no `<` remains |
| 36 | 1 MB of `fc.string` output | `parse` under 2 s |

**`budget.test.ts`** — the rows of §7.

**Gates** (33 §8 rows this package feeds):

| Gate | Row |
|---|---|
| `closed-lists` | `KINDS` has 20 keys, `PRIMITIVES` 8, tone words 4 + 4 aliases + `hole`, typed kinds 8, evidence tags 4 — read from `dist/index.js` and compared with 34 §6 |
| `licence-closure` | `npm pack --dry-run --json`: every entry under `dist/`, `src/`, `test/fixtures/` or is `LICENSE`, `README.md`, `package.json`; no `@braindog/`; no `../../`; `dependencies` empty; `LICENSE` starts `MIT License` (31 §4 rule 8) |
| `refusal-fixtures` | `dialect-arity` and `dialect-kind-unknown` are produced by tests 5 and 6 from `test/fixtures/*.md`; spec 40 wraps the same two files as the `fixtures/refusals/*.yaml` the gate reads |
| `a11y-tree` parity — **stage 3** | the corpus through `toHTML`, parsed by a browser, and through the Svelte interpreter yields the same accessibility tree and the same `--cells` values (31 §2, ADR-045). A row here; it runs when spec 50 exists |
| `src/parity.test.ts` | the Svelte drawers compiled under `node --test` through Node's module hooks and rendered by `svelte/server`, held equal to `toHTML` once hydration markers and whitespace between tags are taken out. It covers every shape of `cards`, `section`, `feed` and `diff` today, and is the harness the corpus row above can grow into |

---

## 10 · Deliberate ceilings

- `ponytail:` one regex, one pass, whole-document re-parse on every keystroke (≤ 1 ms at 10 KB); add incremental parsing when a write-up passes ~500 KB.
- `ponytail:` markdown lists are flat; nesting renders as one level; add depth when a fixture write-up needs it.
- `ponytail:` `tree` is a `<pre>`; make it a nested `<ul>` when a screen-reader user has to walk one.
- `ponytail:` numbers group the `en` way with no locale option; add `opts.locale` when a non-English record ships.
- `ponytail:` instants render raw RFC 3339; add `opts.tz` and a time format when a page interpolates one.
- `ponytail:` `format(v)` has no "billions with a suffix" and no "rate as a level" (05 §7.1 rule 3); add when a metric's `format:` reaches the renderer through `resolve`.
- `ponytail:` bar magnitudes are linear from zero over absolute values; add a signed scale when a diff chart needs one.
- `ponytail:` the kinds are one TypeScript table with no `body`/`accepts`; `expand` and `$name` (22 §3) arrive with `declare` (42), the first consumer that has a pack kind to render.
- `ponytail:` glyph cells are emitted as `data-glyph` and drawn by the host stylesheet; the 122-glyph library is not in this package; ship it when a second consumer renders chips without the app's CSS.
- `ponytail:` `--cells` and `--magnitude` ride inline `style`; switch to an SVG `<rect width="N%">` if the host's CSP cannot allow `style-src-attr` (§13-10).
- `ponytail:` no heading ids; add anchors when a page links into a write-up section.
- `ponytail:` tokens carry no column positions, only `line` on segments and rows; add columns when the editor highlights a token.
- `ponytail:` relative time is computed once per render from `opts.now`; the host re-renders on open (05 §7); no timer.

Thirteen, counted.

---

## 11 · Dependencies

**Runtime: none.** `package.json` carries no `dependencies` and no `peerDependencies`. A new runtime dependency is a new ADR (35 §2).

| Dev | Version | For |
|---|---|---|
| `typescript` | 6.0.3 | type-check and the `dist/` emit (31 §3) |
| `fast-check` | 4.9.0 | `fuzz.test.ts` (35 §2) |
| `@types/node` | the workspace catalog's pin for Node 24.13 | `node:test`, `node:assert/strict` types in `test/**` |

Toolchain from the root: Node 24.13.0, pnpm 11.25.0, ESLint flat with `eslint-plugin-import-x` (31 §3). Nothing else.

---

## 12 · Build order

**Before this:** nothing in `packages/`. The repository skeleton only — `.gitattributes` with `* text=auto eol=lf`
(31 §7), the root `LICENSE` (the Apache-2.0 text) and `LICENSING.md` (31 §4), `pnpm-workspace.yaml`, the `graph` and
`licence-closure` gate scripts.

**This unblocks:**

| Package | Uses |
|---|---|
| `declare` (7) | `KINDS`, `PRIMITIVES`, `PRIMITIVES_VERSION` to validate a `block` declaration and `requires.primitives` |
| `cli` (12) | `render` for `braindog get --html` and the dialect check |
| `web` (13) | `parse` and `toHTML` for SSR of write-ups and the textarea preview (22 §8) |
| `braindog-render/svelte` — stage 3 | `Segment[]`, `KINDS`; the parity row of §9 |

**Publish:** `0.0.1` by hand, then trusted publishing with `id-token: write` (31 §6). The `licence-closure` gate runs before every publish.

---

## 13 · Decisions taken here

Twenty-one, counted. Each names the document to amend in the same revision (35 §1).

| # | Title | Decision | Amend |
|---|---|---|---|
| 1 | **Money exponent source** | A table of every exponent that is not 2, at ISO 4217's values; EGP 2, JPY 0, KWD 3, and a code the table does not name gives 2. **Not `Intl`**, which carries CLDR: CLDR says what a country expects to SEE and ISO says what a record STORES, they differ on `IQD` and `MGA`, and the difference is a hundred- or thousandfold on screen. This package's copy and the kernel's are byte-identical and held equal by a test | 02 §3 rule 1 (which now states the same rule, having said first "comes from a table" and then that none is shipped); 34 §3 money row |
| 2 | **Number and money presentation** | `en` grouping (`,` thousands, `.` decimal); minus is U+2212; a negative amount reads `EGP −1,299.00`; no locale option at stage 0 | 05 §7.2 arguments paragraph |
| 3 | **Root exports** | `parse` · `toHTML` · `render` · `KINDS` · `PRIMITIVES` · `PRIMITIVES_VERSION`. `expand` is not exported at stage 0: it has no consumer until a pack kind exists; it joins the root with spec 42 | 31 §2 "one compromise"; 15 §2; 22 §2; ADR-045 |
| 4 | **Kinds are one TypeScript table** | `src/kinds.ts`, `as const`, a derived `Kind` union — the closed-list convention of 35 §2 — instead of sixteen `kinds/*.json` files. The table's shape is the shape a pack's `block` declaration will take; `body`/`accepts` are added when `declare` needs them | 05 §1; 34 §2.4; 22 §3; ADR-056 |
| 5 | **The HTML skeleton and class names** | `<figure class="block[ tone-x]" data-kind data-primitive>` + `<figcaption>`; a cell is `<span class="<cell name>">`; the per-kind table of §5.9; `tone-good/warn/bad/info`, `hole`, `figure`, `missing`, `unresolved`, `evidence evidence-<tag>`, `source`, `glyph`, `ref`, `date`, `money`, `quantity`, `pct`, `block-degraded` | 05 — a new §7.7 "The markup"; 34 §2.2 gains an HTML column |
| 6 | **The heading takes a tone** | the info string's heading is row-split; a trailing tone word is the block's tone — `note \| Kicker \| bad`. The info regex is unchanged | 34 §2.1; 05 §2.1 |
| 7 | **The tone slot is universal** | every split kind parses a trailing tone word, not only the five 34 §2.2 italicises; a stylesheet may ignore it on `spec`, `params`, `quote`, `todo`, `steps`, `board`, `comparison` | 34 §2.2 |
| 8 | **Empty info and EOF** | an empty info string is a `code` block with no language; EOF closes an open block as a fence would | 34 §2.1 |
| 9 | **Two codes stretched, none added** | `table` in a write-up degrades under `DIALECT_KIND_UNKNOWN` with its own `fix`; rows over a cap (`stat` 6, `quote` 1, `gauge` 1) degrade under `DIALECT_ARITY` with `at: "rows"`. No `DIALECT_ROWS` code | 30 §6 dialect rows; 05 §7.4 `stat` cap row |
| 10 | **`--cells` and `--magnitude` on inline `style`** | the only `style` attributes emitted; values are renderer-formatted numbers. 22 §7's "no `unsafe-inline`" concerns `<style>` elements; the host's CSP splits `style-src-elem` (nonce) from `style-src-attr 'unsafe-inline'`, which admits nothing content-controlled because no content reaches an attribute unescaped. The SVG fallback is the §10 ceiling | 22 §7; 12 §8 |
| 11 | **Holes** | a `hole` row draws no bar, is excluded from the scale, is last, and is a `<button data-hole>`; `{unknown}` is a `<button>`; a path that names nothing is a marked `<span data-path>` the app may promote to an affordance | 05 §7.5 |
| 12 | **The markdown subset's boundary** | in: ATX headings, paragraphs, flat `-`/`*`/`1.` lists, `---`, strong, em, code spans, links. Out: blockquote, table, image, raw HTML, setext heading, autolink, footnote, nested list. Links: `https:` `mailto:` `/path` `#anchor`; `rel="noreferrer"` on the first two; a refused link renders as its literal text | 05 §2 gains "the markdown between blocks"; 12 §8 link row |
| 13 | **An evidence source may hold an interpolation** | `{verified: {{ref:decisions#41}}}` parses because the source class admits `{{…}}` whole; the source is tokenised once, one level | 34 §2.3 `source` production; 05 §7.3 |
| 14 | **What `resolve` returns and how it renders** | the `format(v)` table of §5.5; a `ref` path resolves to the spoken form `register#seq` (the host converts the ULID); booleans read `yes`/`no`; day-shaped strings format as days; other objects are `JSON.stringify` | 05 §7.1 |
| 15 | **Relative time** | noon UTC of the day against `opts.now`; `today` · `Nd` to 13 · `Nw` to 60 · `Nmo` to 364 · `Ny`; `until` and `ago` both render the signed form (`in 3mo`, `2w ago`) whatever the kind | 05 §7.2 examples |
| 16 | **`LinkRef` and `link`** | two ref kinds, `row` and `day`; `link` returns an href or `undefined`; the visible text of a `ref` is `#seq` — a register's `seq_prefix` is the host's to render (34 §4) | 05 §7.2 "three of them link" |
| 17 | **Glyphs** | a `chips` glyph cell is `<span class="glyph" data-glyph="…" aria-hidden="true">` drawn by the host's stylesheet — an unknown name draws nothing and the column stays (05 §3 invariant 2); the four tone glyphs are emitted by the renderer with `role="img" aria-label` | 13 §2.3; 05 §3 |
| 18 | **`todo` markers** | `[ ]`, `[x]`, `[X]` at the start of the first cell; absent → not done; rendered as `<input type="checkbox" disabled[ checked]>` | 34 §2.2 `todo` row |
| 19 | **Where a bar's magnitude comes from** | a cell that is one interpolation uses the raw value — number, `money.amount`, `quantity.value`, a parsed string; a text cell parses after stripping `,` and `%`; `bar` scales to the max non-hole row, `gauge` to `value / target` clamped at 1 | 05 §7.4 `bar` rows |
| 20 | **The budgets** | `parse` 100 KB ≤ 10 ms; `render` ≤ 25 ms; output ≤ 5× input; `dist` ≤ 12 KB brotli; 10 KB keystroke parse ≤ 1 ms | 15 §2 stage 0 ("a test suite"); 22 §8 |
| 21 | **`cards` and `section` are page kinds on existing primitives** | two rows in `KINDS`, on `grid` and `panel`, so `PRIMITIVES_VERSION` stays 1. Both are page-only, and `parse(src, { page: true })` admits a page-only kind that has a row grammar: `cards` carries its roles in a header row, `section` its glyph, count and fold in one row. `table` has none and still degrades. A `section`'s heading is drawn as an `h2`, never a caption. No new code, no new primitive, no new inline style: marks are placed by SVG attributes and coloured by host CSS in role tokens | 05 §2 and §2.1; 06 §1.1; 42 §4.5 |
| 22 | **`feed` and `diff` are two more, on `list` and `media`** | `PRIMITIVES_VERSION` stays 1. `feed` is page-only with a row grammar, `by \| who \| count \| what \| when`, grouped as agents, rules and you, with a `seen` row where the reader last looked, so new is a position rather than a flag each row carries; its page binding is `source: activity`, `since: seen`, `first:`. `diff` is not page-only: its rows are verbatim and marked `- `, `+ ` or two spaces, `diffRows` writes them from two texts, and the diff is computed here because the package imports nothing. A removed line is a `del` with a glyph named by the word, so it is never told apart by colour alone, and red stays for danger. No new code: a row the drawer cannot place degrades under `DIALECT_ARITY` | 05 §1, §2 and §2.1; 06 §1.1; 42 §4.5 |

---

## 14 · Done when

- [ ] `packages/render` exists with the five source files of §3, SPDX headers on each, `LICENSE` as `MIT License`, `dependencies` absent.
- [ ] `pnpm -F braindog-render exec tsc -p .` passes under `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`; `dist/` holds ESM and `.d.ts`.
- [ ] The exports map exposes `.` only; `import 'braindog-render/src/parse.ts'` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- [ ] `node --test` passes tests 1–36; the fixture files of §3 are committed; `test/seeds/` exists.
- [ ] `budget.test.ts` passes every row of §7 on Node 24.13.0.
- [ ] The `closed-lists` gate reads 20 · 8 · 4 + 4 + 1 · 8 · 4 from `dist/index.js` and matches 34 §6.
- [ ] The `licence-closure` gate passes on `npm pack --dry-run --json`.
- [ ] `dialect-arity` and `dialect-kind-unknown` fixtures produce their codes.
- [ ] The eleven design documents named in §13 carry their amendments, and [BUILD.md](../BUILD.md) logs this iteration.
- [ ] `braindog-render@0.0.1` is published by hand; trusted publishing is wired for `0.0.2`.
- [ ] The `a11y-tree` parity row is filed against spec 50 as its stage-3 owner.

---

*Next: [37-SPEC-PORTS](37-SPEC-PORTS.md).*
