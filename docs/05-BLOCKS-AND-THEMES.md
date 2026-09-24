# 05 · Blocks and themes

What an agent reaches for when it has something to show, and the reason twenty kinds — and every
kind a pack adds after them — can look like one product.

> A block set is a **system**, not a catalogue. Every kind draws from the same eight primitives
> and the same tokens. **No kind introduces a colour, a font or a spacing value.**

---

## 1 · The eight primitives

Kinds are declarations over these. Primitives compose, so kinds do not have to.

| Primitive | Is | Kinds built on it |
|---|---|---|
| `panel` | a bounded region with a tone, an optional glyph, and a nested document | `note`, `quote`, `section` (page only) |
| `grid` | *n* cells of label and figure, row-aligned by subgrid | `stat`, `board`, `cards` (page only) |
| `rows` | label · value · note, one per line | `spec`, `params` |
| `proportional` | rows whose number drives a drawn magnitude | `bar`, `gauge` |
| `inline` | a run of pills | `chips` |
| `list` | title · detail · optional state marker | `steps`, `todo`, `timeline`, `feed` (page only) |
| `table` | real columns, a header, per-column alignment | `comparison`, `table` |
| `media` | a figure with a caption | `code`, `tree`, `diff` — and `diagram`, post-v1 |

> **Three kinds were listed here that are in no version of the closed list** — `callout`,
> `sparkline` and `tags`. They are removed. `callout` is `note` with a tone, `tags` is `chips`, and
> `sparkline` is the one that matters, because [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3 binds it
> as a chart. **`sparkline` is therefore a real gap, not a ghost:** it is a `proportional` over a
> time bucket with no axes — **post-v1**, arriving as a pack alongside `diagram`, `series` and
> `forecast`, which is what the primitive layer exists for. *An earlier draft of this note called it
> "the sixteenth kind"; the sixteenth v1 kind is `table` (§2), and the four post-v1 kinds sit outside
> the count.*

A board is a **grid of lists**. A roadmap is a **list with dates**. A risk matrix is a **grid of
inlines**. This is why a pack can add a kind without asking a designer.

A kind is data, not code. A `block` declaration is a primitive, an `accepts:` list and a body of
primitive nodes, each node one of `parts children rows columns empty value`; `$<name>` substitutes a
whole node named in `accepts:` and is never spliced into a string. The twenty ship as one TypeScript
table — `src/kinds.ts`, `as const`, with a derived `Kind` union — whose shape is the shape a pack's
`block` declaration takes, so a first-party kind and a pack's kind take one code path
([36-SPEC-RENDER](36-SPEC-RENDER.md) §13 D4; an earlier draft said sixteen JSON files).
`PRIMITIVES_VERSION = 1` at stage 0. The package's root exports `parse`, `toHTML`, `render`, `KINDS`,
`PRIMITIVES` and `PRIMITIVES_VERSION` — no `expand`; kinds expansion is `declare`'s. `toHTML` serves
the mirror, exports, tests and the digest email, never a server render: the app draws blocks through
`braindog-render/svelte` inside a static shell ([ADR-066](16-DECISIONS.md)).

---

## 2 · The dialect an agent writes

Fenced blocks, because an agent already writes fenced blocks and a new syntax is a new thing to
get wrong.

````
```stat | The number that shapes all three
Daily-active players | ~2,690 | across 70,073 servers
DAU per server | 0.04 | the median server has 0 | bad
Active worldwide in any hour | 460-640 | your server-mates are not online | warn
```
````

`kind | heading`, then one row per line, `field | field | field | tone`. Positional, terse, and
an agent gets it right first time because there is nothing to nest. The row shape of every kind is
§2.1. Between fences the markdown is a closed subset — ATX headings, paragraphs, flat lists, a rule,
strong, em, code spans and links; a blockquote, a table, an image or raw HTML is text
([36-SPEC-RENDER](36-SPEC-RENDER.md) §13 D12).

### Kinds, thirty-three

| Group | Kinds |
|---|---|
| Prose and emphasis | `note` · `quote` |
| Figures | `stat` (with a `lead` form) · `bar` · `gauge` · `chips` · `sparkline` · `split` · `bridge` · `series` (with a `net` form) · `lines`, a measure over time with the period before it dashed beside it · `progress` (with a `budget` form), one track a row filled toward a target (typed on the row, or `toward:` a figure of what was logged against it), or spending against a limit (`spent:`, in the limit's currency or refused `MIXED_CURRENCY`) with the overspend marked · `forecast`, a cash walk as a line, **page-only** · `ring`, a 64px dial with its figure in the centre, one row toward a target or two to five parts of a whole · `heat`, twelve weeks by weekday, each day washed by how busy it was, today outlined |
| Rows | `spec` · `params` |
| Work | `todo` · `steps` · `timeline` · `board` · `roadmap`, dated work on one time axis: a task with an effort is a bar ending on its due day, one with none a dated stem, overlapping windows packed into tracks, over month bands and today's line |
| Technical | `code` (annotated) · `tree` · `comparison` · `diff`, how a text changed from one version to the next, before and after |
| Register-bound | `table` — rows from a `source:` register with declared `columns:`; bound to a register rather than to authored rows, and **page-only** |
| Page-bound | `cards` — one card per row of a `source:` register, each column given a role by `as:`; `section` — a heading for the blocks after it, with a count and `fold:`; `feed`, what agents, rules and you did since you last looked, grouped by who did it; `agents`, what each agent did, one group per agent; `queue`, what is waiting on you — one card per open question, who opened it, why, what it would cost to get wrong, and the ways to answer it, dearest to get wrong first, the recommendation a label beside its option and never a selection; `capture`, the one-line add, a field whose Add appears inside its edge once there is text, writing into `register:` with what its `where:` pins, and drawn only where the host can write. All six **page-only** |

Thirty-three, counted: the sixteen of v1, the four kinds of the agent path
(`loop/research-agent-path.md` steps 20 and 21), `sparkline`, `split` and `bridge` (`loop/research-modules.md` S9 and S10), `series` and `forecast` (S13 and S11), `agents` (`loop/research-spark.md`, Team board's Agent work page), `lines` (the Solo founder's dashboards), `progress` (the Personal use case's savings goals, goals and budget), `queue` (`loop/research-modules.md` S21, the
Decide shape as a block any page may carry), `capture` (S16, the add line Work leads with), `roadmap` (S17, Work's plan on a time axis), `heat` (S18) and `ring` (S30, the dial `cards` already drew inside a card), which sit on existing primitives so
`PRIMITIVES_VERSION` does not move. *An earlier draft counted fifteen and left `table` out while every declared page in the
corpus used it.* `diagram` — a **constrained shape set** of boxes, arrows and lanes, never
arbitrary SVG — is **post-v1**, and everything after it
arrives as a pack, which is the whole reason for the primitive layer.

### 2.1 · Row shape per kind — the grammar, stated

The EBNF is [34-GRAMMARS](34-GRAMMARS.md) §2. This is what an author needs of it:

- The info string is `^(?<kind>[a-z]+)(\s+(?<form>[a-z]+))?(\s*\|\s*(?<heading>.*))?$`. A form is a word the kind names: `stat lead` and `series net` are the two. Any other word after the kind degrades under `DIALECT_KIND_UNKNOWN`, naming the forms there are. The heading half is row-split like a row, and a trailing tone word there is the block's tone — `note | Kicker | bad` (36 §13 D6).
- A row is split on `|` **after** unescaping — `\|` is a literal pipe, `\\` a literal backslash.
- A trailing cell that is a tone word — `good` `warn` `bad` `info`, an alias from §7.4, or `hole` on a `bar` — is the tone. Anything else in that position is a cell.
- `{{path}}` is substituted **per cell, after splitting**, and a substituted value is never re-parsed, so a value containing `|` cannot add a column.
- More cells than the kind takes degrades the block to its fence with one line above it naming the kind and the row — `DIALECT_ARITY`; a kind this build does not draw is `DIALECT_KIND_UNKNOWN`. Fewer cells leaves the trailing ones absent. Both happen at render; nothing is refused at write (§3).

| Kind | Cells, in order |
|---|---|
| `note` | heading = kicker; body lines are markdown, no cells |
| `quote` | text \| attribution |
| `stat` | label \| figure \| note \| *trend* \| *tone* — six rows at most. The trend is optional, a run of numbers (`18 20 19 24`) drawn as a small line under the figure; a word there with no number degrades under `DIALECT_ARITY`. A tone straight after three cells is still the tone. `stat lead` draws the first figure as the screen's one hero figure, at `--t-2xl` |
| `sparkline` | label \| run of numbers \| figure \| *tone*. A 120 by 28 line in `--dim` with a dot on the last point, no axes; under two points, the figure only |
| `split` | label \| value \| note \| *tone*, or `hole` as on `bar`. One 6px track cut into parts in neutral steps (a toned row in its intent), a legend of 7px dots, figures and shares, then the hole row. A row with no number, zero or less has no part. All zero, a sentence |
| `bridge` | label \| ±amount \| note. The first row is the start and the last the end; the rows between move it. Floating bars, up in `earn`, down neutral; rows that do not add up get a warn line saying so; a row with no number draws no bars. In a narrow container, a list with inline bars |
| `series` | a header row, then a row a bucket: bucket \| up to four series, each headed `in: Label` or `out: Label` (bare is in) \| *`state`*, a last header cell whose rows say `partial` (the current bucket, drawn faint), `due` (the current bucket when it also counts money due later in it, a line's `then`: faint inside a dashed edge, said "so far, and due") or `ahead` (still to come, an outline). Bars in stand above a zero rule in `earn`, bars out hang under it in a neutral, one scale; the `net` form adds in minus out as the one accent line. An empty cell is a gap, never zero. Two axis figures, the bucket labels, a legend and "The numbers" fold are text; all empty or zero, a sentence |
| `forecast` | page-only. mark \| day \| label \| amount, the mark one of `opening` (today, what the figure is called, the balance; once), `past` (a remembered daily balance before today), `step` (a signed movement), `horizon` (days walked, in the day cell) and `knobs` (any of `horizon late spend leave`, in the day cell). The remembered balance solid and the walk dashed in the accent, a zero rule always in view, stems from it for every movement worth a twentieth of the range (up in `earn`, down neutral), the first day under zero as a warn dot with its date, the lowest point as a dim dot, a sentence over the chart and every movement in a fold. With `RenderOptions.scenario` the Svelte drawer adds the knobs (horizon 3, 6 or 12 months within the walk; clients paying late by 0 to 60 days; spending the record does not know, 0 to 5,000 a month; leaving out the five heaviest movements) and a scrub, in memory only, with the untouched walk drawn faint beside it. No opening row, a sentence |
| `bar` | label \| number \| note \| *tone* |
| `gauge` | label \| value \| target \| *tone* |
| `ring` | label \| value \| *target* \| *tone*, one to five rows. One row is progress: the arc is the value's share of the target, read as `progress` reads a goal, with the share in the centre and what is left beside it; a value written `3/5` or `60%` needs no target. Two to five rows are parts, the third cell a note: arcs end to end in `split`'s four neutral steps (a toned row in its intent), the whole in the centre when every part is in one unit and nothing there when they are not, and a legend of dots with each figure and share. A sixth row degrades under `DIALECT_ARITY`. A value that does not read draws no ring at all, only the words, because an empty dial reads as zero |
| `chips` | glyph \| figure \| word \| *tone* — one row is one run |
| `spec` | label \| value \| note |
| `params` | label \| value \| note |
| `todo` | `[ ]` or `[x]`, then title \| detail |
| `steps` | title \| detail \| state |
| `timeline` | date \| title \| detail \| *tone* |
| `board` | column \| title \| detail |
| `heat` | day \| *value*. `day` is `YYYY-MM-DD`; a row with no value counts one, and rows on one day are added. Twelve weeks by weekday, Monday first, ending on the week that holds today: a day nobody wrote is a gap, a day counted empty a zero, a busy one of four washes of `--info` against the busiest day in view, today outlined, a day still to come not drawn. Eight weeks on a phone, the last eight, washed as the twelve were. A row whose day or value does not read is named under the grid; one dated outside the weeks is counted and said, never placed. The counted days are said again as a table; nothing in view, a sentence |
| `roadmap` | title \| by \| *effort* \| *tone*. `by` is the due day, `2026-10-05`, or `5 Oct 2026` as a page writes a day; `effort` is days, `3`, `1.5 d` or `3d`, rounded up to whole days. A row with an effort is a bar that many days long ending on `by`, and a row with none, or `0`, is a stem on its day. A row whose day or effort does not read is named under the drawing and never placed. Bound to a register, the block's `columns:` name the three fields: `[{ field: what }, { field: by }, { field: effort }]` on Tasks. Every placed row is said again as a table; with nothing dated, a sentence |
| `code` | heading = the language; rows verbatim, not split |
| `tree` | indentation-significant, two spaces per level; rows not split |
| `comparison` | the header row fixes the column count |
| `table` | **page-only**: `source:` and `columns:` on the block ([06-PAGES](06-PAGES.md) §1.1); a `table` fence in a write-up has no rows to draw and degrades to its fence like an unknown kind |
| `cards` | **page-only**: the page's evaluator writes the rows. The first row names each column's role, `role` or `role: label`, from `title figure fact trend ring who when mark quiet`; then one row per card, then a *tone*. A `quiet` column is the evaluator's and is never printed: a card whose `quiet` cell holds anything carries `data-quiet` for the host to dim, which is how "Working now" shows a run not heard from lately. One figure and at most three facts, or the block degrades under `DIALECT_ARITY`. A `trend` cell is a run of numbers, and a token that is not one is a gap; a `ring` cell is `3/5` or `60%` |
| `section` | **page-only**: the heading is the section, drawn as a heading and never as a caption; one row, glyph \| count \| `fold`. A count of zero is not drawn. `fold` starts it shut, and the host hides the blocks after it up to the next section |
| `feed` | **page-only**: the page's evaluator writes the rows from `activity`, newest first. A row is by \| who \| count \| what \| when \| *tone*, where *by* is `agent`, `rule` or `you` and names the row's group, so a machine's work is never folded into the person's. A burst is one row: `agent \| Claude \| 14 \| saves on Variable axis QA \| 3h ago`. One row `seen \| when` sits where the reader last looked: the rows above it are new, their count in the accent and their group headed "N new", and a line reading "Before you last looked" parts them from the rest; an empty *when* is no mark yet. Any other first word, or a second `seen` row, degrades under `DIALECT_ARITY`. Empty, it says "Nothing new." or, with no mark, "Nothing to catch up on yet." |
| `diff` | rows verbatim, each marked `- ` (taken out), `+ ` (put in) or two spaces (in both); a unified diff's `-line` and ` line` read the same. A row with any other first character degrades under `DIALECT_ARITY`. `diffRows(before, after)` writes the rows for two versions. A removed line is a `del` with a minus whose name is the word "removed", an added one an `ins` with a plus named "added"; lines wrap in their box; a run of shared lines that would hide four or more, keeping three beside each change, folds into "N lines unchanged" |
| `capture` | **page-only**: the page's evaluator writes the rows from the block's `register:` and `where:` ([06-PAGES](06-PAGES.md) §1.1). One row `into \| register \| label \| where`, first: the list a new row goes into, what it is called, and optionally a path to it; then one `set \| field \| value` per value a new row inherits, in the stored form. A second `into`, a `set` before it, a field set twice or a `where` that is not a path of this record degrades under `DIALECT_ARITY`. The heading is the field's placeholder and accessible name, never a caption. The field, with its Add inside its edge once there is text, is drawn only where the host passes `oncapture`; without it the block draws one line naming the list, a link where `where` is given, and never a disabled field |

---

## 3 · Three invariants, none negotiable

**1 · A malformed block degrades to a visible code fence.** It never renders wrong and never
renders nothing — it shows the author exactly what they typed. A dropped block must read as
feedback, and the writing guidance says so out loud so an agent learns from it. **The write is
accepted**: a `document` is never parsed at write and never refused for its dialect; the fence at
render is the feedback channel.

**2 · Column positions are FIXED.** An unknown glyph draws no glyph rather than shifting the
columns — a glyph is a `data-glyph` name the host's stylesheet draws, and the renderer ships no glyph
art (36 §13 D17). A column that moves is worse than a column an agent has to count.

**3 · The dialect names INTENT; the theme names appearance.** An agent writes `warn`, never
amber. So a theme swap can never break a page, and an agent can never make a page ugly.

---

## 4 · The rule that came from being wrong twice

> **A long prose paragraph inside a drawn block is unreadable.** Blocks are for rows and
> figures. Prose goes between them.

This is recorded as a rule because it was learned expensively: a callout carrying a comparison
was capped near a reading measure on the theory that a callout is a sentence, which turned a wide
block into a narrow column of thirty short lines — *"so unreadable"*, and correctly. The cap came
back off the next day.

The general form, and it is the whole reason the blocks and the themes are one document:

| Thing | Gets |
|---|---|
| A sentence | a reading measure — about 72 characters |
| A table, a grid, a ledger | **the room** |
| A drawn block whose content is short | **its content's width, not its column's** |

That last row is the third mistake in the same family, and it is the newest. A three-tile `stat`
in a 962 px column drew *seven* auto-fit tracks of 136 px — three filled, four holding nothing
but the block's own border colour, a 550 px slab of grey. The lesson generalises past CSS:

> **A layout primitive must be told how many things it contains. It must never infer the count
> from the space available.**

So `grid` takes its cell count from the declaration, `table` sizes to content, `proportional`
spans because the length *is* the figure, and every one of those is asserted by a test that
measures the rendered box in a real browser rather than reading the stylesheet.

---

## 5 · Themes

> A theme is a **token document and nothing else.**

| Sets | Cannot |
|---|---|
| colour **roles** — `ink`, `dim`, `faint`, `line`, `edge`, `s1`–`s3`, `accent`, `earn`, `warn`, `danger`, each intent with a `-fill` variant. **Roles, not the four intent words an author writes** — see [13-UI](13-UI.md) §2.3 | inject CSS |
| a family pairing, from the shipped families — **never the type scale**, which is fixed at eight steps (`t-xs` … `t-3xl`, [13-UI](13-UI.md) §3); the reader's own Text setting picks the body step | load a third-party font |
| spacing scale, radii, density — `compact \| comfortable \| roomy` | target a selector |
| a light/dark pair | override one block |
| how loud `warn` is (its chroma) — never the word | write a hex at a call site |

**Contrast is gated at install.** Every role pair the theme sets is checked, and a theme that
fails is refused with the failing pair named. The floor is WCAG 2.2 AA — 4.5:1 for body text,
3:1 for large text and UI boundaries.

The one colour a theme did not set that may reach the DOM is an **identity accent** — `oklch(L C h)`,
where `h` is a row's frozen `identity.accent` and `L`, `C` are the theme's two mark constants — and
only on a mark, a chip, an avatar, a calendar dot or a chart series ([13-UI](13-UI.md) §2.1b). Gate 3
in [22-FRONTEND](22-FRONTEND.md) §7 knows it as the single permitted non-token value.

> **[28-THEMING](28-THEMING.md) is the whole of this in detail** — the wire format (DTCG 2025.10,
> which is *not* a W3C standard however often it is called one), the generator that turns one seed
> colour into a coherent theme by solving for contrast rather than lightness, and the sixteen
> install checks. Two of those checks catch failures nothing here notices: the elevation ladder §6
> promises, and the fact that `forced-colors: active` deletes the surface ladder entirely.

Ships with two themes, each in both schemes: the house theme and a **high-contrast** one. The
second is the accessibility floor, not a nicety. Both are constants in `@braindog/theme`, not
declarations: the high-contrast theme is the house seed built through the `HIGH_CONTRAST` profile —
no dialect key — and is swapped in under `prefers-contrast: more`
([39-SPEC-THEME](39-SPEC-THEME.md) §13 D10, D17). *An earlier draft counted three, taking light for a
theme; light is a scheme of each.*

A theme is the cheapest thing anybody will ever share, which makes it the right first format to
prove in the Kennel.

### Why this is strict rather than flexible

The block set only looks like one product because no kind writes its own colour. A theme that can
reach past tokens breaks every kind at once — and the author will never find out which
one, because they will only hear that it looks broken.

---

## 6 · The token ladder

Three layers, and a component may only read the third.

```
primitive   --slate-900, --green-500, --size-14        ← the generator derives these from the theme's seed (28 §3)
    ↓
semantic    --ink, --dim, --line, --s1, --accent       ← a theme maps these
    ↓
component   --row-h, --ctl-h, --tap, --measure         ← a component reads only these
```

**Five guards**, all in CI, all cheap, all learned from a codebase where they caught real bugs. *(An earlier draft said two over this same five-row table; [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6 is the canonical list and has more.)*

| Guard | Catches |
|---|---|
| No colour or font-size literal outside the token file | the slow drift that ends with 1,854 global rules nobody can attribute |
| No component styles a class it does not own | a rule aimed at a class passed into a component, which the compiler prunes — and a control silently loses its chevron |
| Every `var(--x)` resolves | a token-shaped name that never read a token |
| A width query never changes a control's **size** | a small laptop window getting phone chrome. Width may change *layout*; only the pointer may change *size* |
| The elevation ladder only goes up, in both themes — and the ladder is the generator's: three levels, fixed geometry, alphas per scheme; a theme has no `shadow` or `elevation` key (39 §13 D9) | a shadow that is invisible in one theme |

---

## 7 · What an agent is given so that it picks well

In the skill, not in the schema — a schema that teaches is a schema nobody reads.

- A kind list with **one line each**: when to reach for it, and what it needs.
- The degradation rule stated out loud, so a dropped block reads as feedback.
- `{{path}}` interpolation for live values inside prose and rows, so a figure is never typed:
  `{{obligations.due_30d}}` re-reads on every open.

> **Never type a figure the record already holds.** This is the rule with the most evidence
> behind it: a write-up that typed seven headline numbers had all seven wrong three days later.
> A typed figure is a claim with an expiry date nobody set.


### 7.1 · The `{{path}}` grammar — which an earlier draft used and never wrote down

| Names | Example |
|---|---|
| a field on this row | `{{status}}` · `{{effortDays}}` |
| a metric | `{{due-30d}}` |
| a row by spoken id, then a field | `{{tasks#125.state}}` — **the register is required**, because every register has a `#1`. *An earlier draft also wrote `{{bake.revenue.monthly}}`; `bake` is a row's title, not its id, and a bare row id is not a path* |
| a **count**, never the contents | `{{blockers.count}}` — `register.count` |
| the rows in one state, counted | `{{tasks.open}}` — `register.<state value>` |
| the whole record | `{{portfolio.revenue}}` — a metric with `source: *` |

Six forms, resolved in that order. **Lexically**, a path is `segment ('.' segment)*`; a segment is
`[A-Za-z][A-Za-z0-9_-]*` or `register#digits`. Anything after `{{` that is not a path, or one of the
eight typed kinds of §7.2 followed by `:`, renders as the author's text, marked unresolved.

Four rules, learned by the predecessor over a month of real use:

1. **A path that names nothing renders as the path, marked; a path whose value is missing renders
   `—`** — never blank, never `undefined`, and **never a zero.** *"A product that earns nothing and a
   product nobody measured are not the same product."*
2. **Long fields are unavailable.** `document` and `note` are arguments, not figures. A paragraph
   interpolated mid-sentence is a worse lie than a stale number.
3. **Formatting is decided for you** — money as money, a rate as a level, billions with a suffix, a
   status with its glyph; a `ref` reads as its spoken `register#seq`, a boolean as `yes`/`no`, a
   day-shaped string as a day (36 §13 D14). Do not wrap a path in `**`; a named figure is already
   set apart.
4. **Code spans are lifted first**, so a literal `{{…}}` from another system survives in backticks.

### 7.2 · Typed interpolations — eight, and two of them link

`{{path}}` asks the record what a figure is *now*. These render a value **the author wrote** as the
kind of thing it is, so a date, a sum and a reference stop being hand-formatted differently every
time.

```
{{date:2026-09-26}}      26 Sep 2026 · in 4w     — LINKS to the calendar
{{day:2026-04-10}}       10 Apr 2026 · 5mo ago   — the same, no link
{{until:2026-11-30}}     in 3mo
{{ago:2026-08-14}}       2w ago
{{money:129900 EGP}}     EGP 1,299.00
{{quantity:1.4 m}}       1.4 m
{{pct:-46.3}}            −46.3%
{{ref:tasks#241}}        #241                    — any row by spoken id; LINKS
```

**Eight, counted: `date` `day` `until` `ago` `money` `quantity` `pct` `ref`.** The predecessor has
ten; four of them are `ref` for four specific registers, and BrainDog has a spoken id on every
register, so they collapse into one. The two that link are a `day` — the calendar — and a `row`; the
visible text of a `ref` is `#seq`, and a link the host cannot resolve is plain text (36 §13 D16; an
earlier draft said three link). Relative time is banded — days to about two weeks, weeks to about
two months, months to a year, then years — measured at noon UTC of the day named; `until` and `ago`
are both signed (36 §13 D15).

**Arguments.** `date` `day` `until` `ago` take `YYYY-MM-DD`. `money` takes `<integer minor units> <ISO 4217>`
and renders code first, then the amount with the currency's exponent — `{{money:129900 EGP}}` is
`EGP 1,299.00`, `{{money:1299 JPY}}` is `JPY 1,299`; *an earlier draft wrote `1299 EGP` and drew
`EGP 1,299`, major units, against the minor-units rule of [02-DATA-MODEL](02-DATA-MODEL.md) §3.*
`quantity` takes `<decimal> <unit>`. `pct` takes a signed decimal. `ref` takes `register#seq`.
Numbers group in `en` — `,` for thousands, `.` for the decimal — the minus is U+2212, a negative
amount reads `EGP −1,299.00`, and there is no locale option at stage 0 (36 §13 D2). **An
argument may be a path instead of a literal** — `{{until:renews}}` · `{{money:cost}}` · `{{ref:parent}}`
— which is how a rule's `say:` names a row's own values; a literal starts with a digit or `-`, a path
with a letter. There is no conditional `{{? … }}` form, no pipe `{{path | filter}}` form and no
`{{rows:…}}` form: the two examples that used the first two were rewritten
([06-PAGES](06-PAGES.md) §1, [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §5).

| Rule | Why |
|---|---|
| **`date:` for anything ahead, `day:` for anything behind** | a future date raises *what else is happening then*, which is why only the forward one links; a shutdown in 2025 has nothing on the calendar |
| **A percentage carries no colour, on purpose** | down is not bad. A fall in churn, in spend or in p95 is the work succeeding — say what it means in words; the interpolation only says what it *is* |
| An argument that does not parse renders as the author's text, marked unresolved | `{{date:31 Sep}}` draws `31 Sep` dotted rather than vanishing or inventing a day |
| The two forms cannot collide | a path has no colon in its character class; inside a typed form, a first character that is a letter makes the argument a path |

### 7.3 · Evidence tags

`{verified}` · `{inferred}` · `{estimate}` · `{unknown}`, each with an optional source —
`{verified: Ministry of Labour Decree 2026}`. **Inline**, so they work inside a blocker, a reason
and a list item, where a block cannot go. A source runs to the first `}` and may not contain `|` or
`}` — except a whole `{{…}}` interpolation, which it may hold, tokenised once and one level deep, so
a source can cite a row (36 §13 D13); inside a drawn row a tag sits in one cell. Any other `{word}`
is text, and a literal tag is written in a code span.

> **`{unknown}` is the one that carries weight.** It is not a weak claim — it is a hole, and a hole is
> a task somebody has to close. So it renders as an affordance, not a tag: the same rule as the
> uncategorised row in §7.5.

And the distinction that matters: **`{{path}}` is not `{verified: path}`.** The tag says somebody
checked this figure against that path *once*; the double brace says go and read it *now*. A figure
you interpolate needs no tag — the path is its provenance.

### 7.4 · Renderer rules learned in production

A census of the predecessor's 7,138 rendered lines: **`spec` 194 · `note bad` 43 · `note warn` 28 ·
`stat` 23 · `bar` 20 · `chips` 19 · `steps` 18.** `spec` is the workhorse, and no writing guide said
so. Rules that came from that month:

| Rule | Why |
|---|---|
| `stat` is capped at **six** — rows over a cap (`stat` 6, `quote` 1, `gauge` 1) degrade under `DIALECT_ARITY` at `rows`; there is no `DIALECT_ROWS` code (36 §13 D9) | *"a seventh tile is a table"* |
| A `chips` row needs a number **and** a word, or it is dropped | an icon alone is a rebus; a colour alone is unreadable to a tenth of readers |
| The columns of a chip **do not move**; an empty field is left empty | shifting left is how a tone lands in the value slot |
| A `bar` row whose value is not a number **keeps its words and loses its bar**; a cell that is one interpolation uses the raw value; `bar` scales to its largest non-hole row and `gauge` to `value / target`, clamped at 1 (36 §13 D19) | a bar at zero claims the value *is* zero |
| A `bar` whose rows name paths is a live chart; one whose rows are typed numbers is a **snapshot, so it carries dates** | the whole reason `{{path}}` exists |
| A `note` heading is a **kicker** — two or three words, small caps | the sentence goes in the body |
| Tone aliases: `earn→good` `danger→bad` `accent→info` `risk→warn` | an author who reaches for a role gets the intent, not a refusal |
| `hole` is a tone, on `bar` only | the row that is a task, not a value — §7.5 |
| The fence scan is **flat** — a fence inside a `note` ends the note | one parser, no nesting, nothing to escape |

### 7.5 · A hole is a task, not a value

The predecessor's clearest single rule, and it generalises past money. Eighty-five per cent of one
currency's spending was uncategorised. Sorted by size, that row would take the top of the chart and
**set the bar scale**, making every real category a one-pixel stub — *"the chart unreadable because of
the thing it reports."*

> **So it sits last, in `warn`, outside the bar scale, and it is the only row that is a button** — it
> opens the ledger filtered to exactly those rows.

The general form: **an unknown never participates in a scale, never sorts among the knowns, and is
always the affordance that fixes it.** `{unknown}` renders the same way. A `{{path}}` that names
nothing renders the same way — the path, marked, an affordance to fix it. The `bar` kind implements it
as a tone: a row whose tone cell is `hole` is drawn last, in `warn`, outside the scale, as the button
— a `<button data-hole>`; `{unknown}` is a `<button>` too (36 §13 D11).
*An earlier draft made it a row option, `hole: true`, which a positional dialect has no place for.*

### 7.6 · The write-up skeleton the corpus converged on

Nobody designed this; it is the shape a month of write-ups settled into, and it is worth writing down
so an agent does not rediscover it:

1. A `chips` line at the very top, with `{{path}}` values — so the page answers itself before anyone
   scrolls.
2. `# Name`, then a status line: `{{status}} · {{lane}} · one sentence`.
3. Numbered `## N · Title` sections, **each opening with a block and then prose.**
4. For research: `## What is not verified` and `## Sources`.
5. A `## Log` of dated one-liners at the end — the document's own history.
6. Settled things **marked so nobody re-runs them**: *"Settled by research — do not run it again."*

And the five registers of writing, each with its own constraint — a reply in a terminal (no renderer;
answer first; a table the moment two things are compared) · a task note (a phone, weeks later; full
markdown) · an option body (comparable without reading both: same headings, same order) · a write-up
(length allowed, structure not optional) · an audit note (**one sentence, never formatted**).

### 7.7 · The markup

Every block is one `<figure>` carrying its kind, its primitive and its tone as data attributes, with
the heading as its `<figcaption>`; a cell is a `<span>` named for the cell it is. That is the whole
contract a host's stylesheet draws against; the class list is [36-SPEC-RENDER](36-SPEC-RENDER.md) §5.9.

---

*Next: [06-PAGES](06-PAGES.md) — a page is a row.*
