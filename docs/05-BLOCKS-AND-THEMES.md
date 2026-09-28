# 05 · Blocks and themes

What an agent reaches for when it has something to show, and the reason every kind in
`packages/render/src/kinds.ts`'s `TABLE` — and every kind a pack adds after them — can look like one
product.

> A block set is a **system**, not a catalogue. Every kind draws from the same eight primitives
> and the same tokens. **No kind introduces a colour, a font or a spacing value.**

---

## 1 · The eight primitives

Kinds are declarations over these. Primitives compose, so kinds do not have to.

| Primitive | Is | Kinds built on it |
|---|---|---|
| `panel` | a bounded region with a tone, an optional glyph, and a nested document | `note`, `quote`, `section`, `capture`, `embed` |
| `grid` | *n* cells of label and figure, row-aligned by subgrid | `stat`, `board`, `cards`, `gallery`, `heat` |
| `rows` | label · value · note, one per line | `spec`, `params`, `inputs` |
| `proportional` | rows whose number drives a drawn magnitude | `bar`, `gauge`, `sparkline`, `split`, `bridge`, `series`, `forecast`, `lines`, `progress`, `ring` |
| `inline` | a run of pills | `chips` |
| `list` | title · detail · optional state marker | `steps`, `todo`, `timeline`, `feed`, `agents`, `queue`, `roadmap`, `calendar`, `link` |
| `table` | real columns, a header, per-column alignment | `comparison`, `table` |
| `media` | a figure with a caption | `code`, `tree`, `diff` — and `diagram`, post-v1 |

The column is read off `TABLE` in `packages/render/src/kinds.ts`, each kind's `primitive`, and which
of them are page-only is §2's.

> **Three kinds were listed here that are in no version of the closed list** — `callout`,
> `sparkline` and `tags`. They are removed. `callout` is `note` with a tone, `tags` is `chips`, and
> `sparkline` is the one that matters, because [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3 binds it
> as a chart. *(Amended September 28th 2026, as built: `sparkline`, `series` and `forecast` are
> first-party kinds on `proportional`, in `TABLE` beside the rest, not packs, and not post-v1: `TABLE`
> is the one closed list, and a kind either sits in it or is a pack's own. `diagram` alone is still
> post-v1.)*

A board is a **grid of lists**. A roadmap is a **list with dates**. A risk matrix is a **grid of
inlines**. This is why a pack can add a kind without asking a designer.

A kind is data, not code. A pack's `block` declaration is the spec a first-party kind has:

```yaml
id: block.risk-grid
kind: block
body: { block: risk-grid, title: Risk grid, primitive: grid, cells: 3, tone: true, minSpan: 4, purpose: figure }
```

The keys are closed: `block`, `title` (1 to 60 characters), `primitive` (one of `panel grid rows
proportional inline list`; not `table` or `media`, whose kinds are bound to a register or to code),
`cells` (1 to 8), `optional` (below `cells`), `tone`, `header` and `ordered` (true or false), `rows` (at
most 200), `minSpan` (1 to 12), `purpose` (one of the picker's groups, `say figure list plan media`)
and `note`. The record refuses a malformed one at install with the key named. A page names it as
`kind: 'block.risk-grid'`, a fence as ```` ```block.risk-grid | Risks ````, and a page naming a
`block.<id>` no installed pack declares is refused at install. The record's `schema` answer carries
the installed ones as `blocks`, keyed `block.<id>`; the web reads them with `installedKinds` and
hands them to the renderer as `RenderOptions.kinds` and `ParseOptions.kinds`, and `kindSpec(kind,
kinds)` is the one lookup both renderers and the parser read, so a pack's kind is drawn by its
primitive exactly as a first-party kind on that primitive is. The first-party kinds ship as one
TypeScript table, `src/kinds.ts`, `as const` with a derived `Kind` union, in the same shape
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

### Kinds, thirty-eight

| Group | Kinds |
|---|---|
| Prose and emphasis | `note` (with a `lead` form, the page's opening sentence said from its figures) · `quote` |
| Figures | `stat` (with a `lead` form) · `bar` · `gauge` · `chips` · `sparkline` · `split` · `bridge` · `series` (with a `net` form) · `lines`, a measure over time with the period before it dashed beside it · `progress` (with a `budget` form and a `range` form), one track a row filled toward a target (typed on the row, or `toward:` a figure of what was logged against it), or spending against a limit (`spent:`, in the limit's currency or refused `MIXED_CURRENCY`) with the overspend marked, or a line of a budget as a band from its low to its high estimate on one scale, what was spent marked on it, and a total line · `forecast`, a cash walk as a line, **page-only** · `ring`, a 64px dial with its figure in the centre, one row toward a target or two to five parts of a whole · `heat`, twelve weeks by weekday, each day washed by how busy it was, today outlined |
| Rows | `spec` · `params` |
| Work | `todo` · `steps` (with a `path` form: done, next and later, how many are left out, and a named short view of the steps that matter now with a switch to every step) · `timeline` · `board`, whose cards move by drag, by keys and, under a finger, by a "Move to" select on each card · `roadmap`, dated work on one time axis: a task with an effort is a bar ending on its due day, one with none a dated stem, overlapping windows packed into tracks, over month bands and today's line · `calendar`, rows on their days: every month the rows reach as a grid of weeks, each day naming its first three, and an agenda of every day that holds anything |
| Links and media | `link`, a list of addresses (an https address, a mailto or a path of this BrainDog), each with its host under its title, nothing fetched · `gallery`, a tile a row, a picture the record holds or a file's name, captioned · `embed`, one video, design or map from a closed list of providers, drawn as a facade until a reader presses Load, **page-only** |
| Technical | `code` (annotated) · `tree` · `comparison` · `diff`, how a text changed from one version to the next, before and after |
| Register-bound | `table` — rows from a `source:` register with declared `columns:`; bound to a register rather than to authored rows, and **page-only** |
| Page-bound | `cards` (with a `lead` form, the first card two tracks wide): one card per row of a `source:` register, each column given a role by `as:`, a group's next step, a reply under the title, the card's identity hue and a picture it leads with among them; `section`, a heading for the blocks after it, with a count and `fold:`; `feed`, what agents, rules and you did since you last looked, grouped by who did it; `agents`, what each agent did, one group per agent; `queue`, what is waiting on you: one card per open question, who opened it, why, what it would cost to get wrong, and the ways to answer it, dearest to get wrong first, the recommendation a label beside its option and never a selection, each option drawn beside what it is (its colours, a figure or a file the record holds), and a `tiles` form, one tile a question led by its recommended option's visual; `capture`, the one-line add, a field whose Add appears inside its edge once there is text, writing into `register:` with what its `where:` pins, and drawn only where the host can write; `inputs`, a few fields of one row to type into, each change written to the row so every figure over it answers, and a spec of the values where nothing can write. All seven **page-only** |

Thirty-eight, counted: the sixteen of v1, the four kinds of the agent path
(`loop/research-agent-path.md` steps 20 and 21), `sparkline`, `split` and `bridge` (`loop/research-modules.md` S9 and S10), `series` and `forecast` (S13 and S11), `agents` (`loop/research-spark.md`, Team board's Agent work page), `lines` (the Solo founder's dashboards), `progress` (the Personal use case's savings goals, goals and budget), `queue` (`loop/research-modules.md` S21, the
Decide shape as a block any page may carry), `capture` (S16, the add line Work leads with), `roadmap` (S17, Work's plan on a time axis), `heat` (S18), `ring` (S30, the dial `cards` already drew inside a card), `inputs` (`loop/research-dynamic-layouts.md` P8, the live numbers a verdict is written under), and `calendar`, `link`, `gallery` and `embed` (`loop/finish/pages.md` C4, what a person building a page of their own reached for and could not draw), which sit on existing primitives so
`PRIMITIVES_VERSION` does not move. *An earlier draft counted fifteen and left `table` out while every declared page in the
corpus used it.* `diagram` — a **constrained shape set** of boxes, arrows and lanes, never
arbitrary SVG — is **post-v1**, and everything after it
arrives as a pack, which is the whole reason for the primitive layer.

### Adding a kind

A kind is three files and one line in each of three registries, and nothing else changes:

- the kernel's `packages/kernel/src/kinds/<kind>.ts`, a `KindModule` (the keys only it reads, an optional `validate`, and `read`), and its line in `BLOCK_KIND_MODULES` in `packages/kernel/src/kinds/index.ts`;
- the app's `apps/web/src/lib/page/kinds/<kind>.ts`, a `KindDrawer` that draws the kernel's `BlockResult` into the dialect, and its line in `BLOCK_KIND_DRAWERS` in `apps/web/src/lib/page/kinds/index.ts`, with its rules in `apps/web/src/lib/page/kinds/<kind>.css`;
- the renderer's row in `TABLE` in `packages/render/src/kinds.ts`, on an existing primitive, with a component under `packages/render/svelte/` where the kind needs one.

The install admits the kind and its keys from the kernel's registry, the read asks the registry before its own arms, and the app draws a registered kind from the record's answer before its own. The sentences that count the kinds, here and elsewhere, are brought up to date by the integrator once per workflow, so a kind unit writes no number.

### 2.1 · Row shape per kind — the grammar, stated

The EBNF is [34-GRAMMARS](34-GRAMMARS.md) §2. This is what an author needs of it:

- The info string is `^(?<kind>[a-z]+)(\s+(?<form>[a-z]+))?(\s*\|\s*(?<heading>.*))?$`. A form is a word the kind names, and there are eight: `stat lead`, `series net`, `progress budget`, `progress range`, `note lead`, `cards lead`, `steps path` and `queue tiles`. Any other word after the kind degrades under `DIALECT_KIND_UNKNOWN`, naming the forms there are. The heading half is row-split like a row, and a trailing tone word there is the block's tone — `note | Kicker | bad` (36 §13 D6).
- A row is split on `|` **after** unescaping — `\|` is a literal pipe, `\\` a literal backslash.
- A trailing cell that is a tone word — `good` `warn` `bad` `info`, an alias from §7.4, or `hole` on a `bar` — is the tone. Anything else in that position is a cell.
- `{{path}}` is substituted **per cell, after splitting**, and a substituted value is never re-parsed, so a value containing `|` cannot add a column.
- More cells than the kind takes degrades the block to its fence with one line above it naming the kind and the row — `DIALECT_ARITY`; a kind this build does not draw is `DIALECT_KIND_UNKNOWN`. Fewer cells leaves the trailing ones absent. Both happen at render; nothing is refused at write (§3).

| Kind | Cells, in order |
|---|---|
| `note` | heading = kicker; body lines are markdown, no cells. `note lead` is the page's opening sentence: drawn as a note, marked `data-form="lead"` on its figure for the host to set as the screen's one sentence. The plural and nought rules for the figures in it are the page's writer's, which knows which words are figures |
| `quote` | text \| attribution |
| `stat` | label \| figure \| note \| *trend* \| *tone* — six rows at most. The trend is optional, a run of numbers (`18 20 19 24`) drawn as a small line under the figure; a word there with no number degrades under `DIALECT_ARITY`. A tone straight after three cells is still the tone. `stat lead` draws the first figure as the screen's one hero figure, at `--t-2xl` |
| `sparkline` | label \| run of numbers \| figure \| *tone*. A 120 by 28 line in `--dim` with a dot on the last point, no axes; under two points, the figure only |
| `split` | label \| value \| note \| *tone*, or `hole` as on `bar`. One 6px track cut into parts in neutral steps (a toned row in its intent), a legend of 7px dots, figures and shares, then the hole row. A row with no number, zero or less has no part. All zero, a sentence |
| `bridge` | label \| ±amount \| note. The first row is the start and the last the end; the rows between move it. Floating bars, up in `earn`, down neutral; rows that do not add up get a warn line saying so; a row with no number draws no bars. In a narrow container, a list with inline bars |
| `series` | a header row, then a row a bucket: bucket \| up to four series, each headed `in: Label` or `out: Label` (bare is in) \| *`state`*, a last header cell whose rows say `partial` (the current bucket, drawn faint), `due` (the current bucket when it also counts money due later in it, a line's `then`: faint inside a dashed edge, said "so far, and due") or `ahead` (still to come, an outline). Bars in stand above a zero rule in `earn`, bars out hang under it in a neutral, one scale; the `net` form adds in minus out as the one accent line. An empty cell is a gap, never zero. Two axis figures, the bucket labels, a legend and "The numbers" fold are text; all empty or zero, a sentence |
| `forecast` | page-only. mark \| day \| label \| amount, the mark one of `opening` (today, what the figure is called, the balance; once), `past` (a remembered daily balance before today), `step` (a signed movement), `horizon` (days walked, in the day cell) and `knobs` (any of `horizon late spend leave`, in the day cell). The remembered balance solid and the walk dashed in the accent, a zero rule always in view, stems from it for every movement worth a twentieth of the range (up in `earn`, down neutral), the first day under zero as a warn dot with its date, the lowest point as a dim dot, a sentence over the chart and every movement in a fold. With `RenderOptions.scenario` the Svelte drawer adds the knobs (horizon 3, 6 or 12 months within the walk; clients paying late by 0 to 60 days; spending the record does not know, 0 to 5,000 a month; leaving out the five heaviest movements) and a scrub, in memory only, with the untouched walk drawn faint beside it. No opening row, a sentence |
| `progress` | label \| value \| target \| *note* \| *tone*: a track filled toward the target, the share, and what is left; `progress budget` reads the target as a limit and marks the overspend. `progress range` reads the four cells as label \| spent \| low \| high: each row a band from low to high on ONE scale for the block, the largest figure on it (a high, or a spend past every high), what was spent marked on the band or said "Not spent", past the high `bad`; then a total line the drawer adds up itself, so it cannot disagree with the rows. Two units on one block (pounds beside dollars) total to the missing mark rather than to a sum |
| `bar` | label \| number \| note \| *tone* |
| `gauge` | label \| value \| target \| *tone* |
| `ring` | label \| value \| *target* \| *tone*, one to five rows. One row is progress: the arc is the value's share of the target, read as `progress` reads a goal, with the share in the centre and what is left beside it; a value written `3/5` or `60%` needs no target. Two to five rows are parts, the third cell a note: arcs end to end in `split`'s four neutral steps (a toned row in its intent), the whole in the centre when every part is in one unit and nothing there when they are not, and a legend of dots with each figure and share. A sixth row degrades under `DIALECT_ARITY`. A value that does not read draws no ring at all, only the words, because an empty dial reads as zero |
| `chips` | glyph \| figure \| word \| *tone* — one row is one run |
| `spec` | label \| value \| note |
| `params` | label \| value \| note |
| `todo` | `[ ]` or `[x]`, then title \| detail |
| `steps` | title \| detail \| state. `steps path` reads the third cell as a mark, `done`, `next` or blank (later), and at most one row is next; a last row of TWO cells, `more \| 4`, is how many open steps the short view left out, drawn "4 more". A stone is always three cells, so a step titled "more" stays a step. A first row of two cells, `short \| This week`, names a short view, and a stone in it says `short` after its mark (`done short`, `next short`, or `short` alone): the view is drawn first, with "N more for when there's room" under it, and the Svelte drawer adds a two-way switch, "This week · Everything"; a view holding every stone or none draws every stone. Any other mark, a second next, a name that is not the first row, or a row after the count degrades under `DIALECT_ARITY`. A done stone is a tick named "done", the next one says "Next", and each stone carries `data-mark` (and `data-short` in the view) for the host to draw the line through them. Where the host passes `onpath` to `Block`, each stone is a 44px toggle named for its step |
| `calendar` | title \| day \| *tone*. The day is `2026-09-12`, an instant (its own day as written), or `12 Sep 2026` as a page writes a day. Every month from the first row's to the last row's (up to `CALENDAR_MONTHS_MOST`) is a table of weeks, Monday first, a day of the months either side an empty cell; a day names its first three rows and counts the rest, `+2`, and carries `data-count` for a host drawing the month as a strip of days with a dot on a busy one. Under the months, an agenda of every day that holds anything, every row said. A row whose day does not read is named under it. Over a list, `columns: [{ field: <title> }, { field: <day or instant> }]`, with `back:` and `ahead:` in whole months ([06-PAGES](06-PAGES.md) §1.1) |
| `link` | title \| url \| *note*. The url is an `https:` address, a `mailto:` or a path of this BrainDog; any other degrades the block with "A link is an https address, a mailto or a path of this BrainDog." An empty url draws the title as words; an empty title is the url. The host (or the address a mailto writes to) is drawn under the title; nothing is fetched. Over a list, `columns: [title, url, note?]` |
| `gallery` | caption \| file. The file is `file:<list>#<seq>/<field>`, a picture the record holds, drawn only where the host's `RenderOptions.file` answers a path of its own; anything else in the cell is the file's name. A page's writer references a file only when it is a picture (`image/png`, `jpeg`, `webp`, `gif` or `avif`) and captions a tile with none by the file's name. Over a list, `columns: [{ field: <caption> }, { field: <file field> }]`, `limit:` at most 24 |
| `embed` | **page-only**, one authored row: url \| *title* \| *aspect*. The url is a YouTube `watch?v=` or `youtu.be/` address, a Vimeo video, a Loom `share/`, a Figma `file`, `design` or `proto` link, or a Google Maps `maps/embed?pb=` address (`EMBED_PROVIDERS` in `packages/render/src/embed.ts`), framed through the provider's own embed address; the aspect is `16:9` (when left off), `4:3`, `1:1` or `9:16`. Any other url or aspect degrades under `DIALECT_ARITY`. Drawn as a facade (the title, the provider, a link to the original); the Svelte drawer adds "Load from …", and only a press puts a sandboxed frame on the page |
| `timeline` | date \| title \| detail \| *tone* |
| `board` | column \| title \| detail. Where the host passes `onmove` to `Block`, each card carries a 44px "Move to" select of the lanes, the move under a finger, beside the drag and the keys |
| `heat` | day \| *value*. `day` is `YYYY-MM-DD`; a row with no value counts one, and rows on one day are added. Twelve weeks by weekday, Monday first, ending on the week that holds today: a day nobody wrote is a gap, a day counted empty a zero, a busy one of four washes of `--info` against the busiest day in view, today outlined, a day still to come not drawn. Eight weeks on a phone, the last eight, washed as the twelve were. A row whose day or value does not read is named under the grid; one dated outside the weeks is counted and said, never placed. The counted days are said again as a table; nothing in view, a sentence |
| `roadmap` | title \| by \| *effort* \| *tone*. `by` is the due day, `2026-10-05`, or `5 Oct 2026` as a page writes a day; `effort` is days, `3`, `1.5 d` or `3d`, rounded up to whole days. A row with an effort is a bar that many days long ending on `by`, and a row with none, or `0`, is a stem on its day. A row whose day or effort does not read is named under the drawing and never placed. Bound to a register, the block's `columns:` name the three fields: `[{ field: what }, { field: by }, { field: effort }]` on Tasks. Every placed row is said again as a table; with nothing dated, a sentence |
| `code` | heading = the language; rows verbatim, not split |
| `tree` | indentation-significant, two spaces per level; rows not split |
| `comparison` | the header row fixes the column count |
| `table` | **page-only**: `source:` and `columns:` on the block ([06-PAGES](06-PAGES.md) §1.1); a `table` fence in a write-up has no rows to draw and degrades to its fence like an unknown kind |
| `cards` | **page-only**: the page's evaluator writes the rows. The first row names each column's role, `role` or `role: label`, from `title figure fact trend ring who when mark next reply hue picture quiet`; then one row per card, then a *tone*. A `hue` cell is a whole number from 0 to 359, never printed: it is written on the card as `--hue` and the host draws the card's mark, and nothing else, in `oklch(var(--mark-l) var(--mark-c) var(--hue))` (§5's one identity accent); anything else in the cell is no hue. A `picture` cell is a file as a `gallery` names one, and the card leads with it where the host serves it, hidden from a screen reader because the title names the card. A `next` cell is drawn "Next: …" at the foot of the card and a `reply` cell as the line under its title, and an empty one draws neither. `cards lead` marks the first card `data-lead` for the host to draw two tracks wide. A `quiet` column is the evaluator's and is never printed: a card whose `quiet` cell holds anything carries `data-quiet` for the host to dim, which is how "Working now" shows a run not heard from lately. One figure and at most three facts, or the block degrades under `DIALECT_ARITY`. A `trend` cell is a run of numbers, and a token that is not one is a gap; a `ring` cell is `3/5` or `60%` |
| `section` | **page-only**: the heading is the section, drawn as a heading and never as a caption; one row, glyph \| count \| `fold`. A count of zero is not drawn. `fold` starts it shut, and the host hides the blocks after it up to the next section |
| `feed` | **page-only**: the page's evaluator writes the rows from `activity`, newest first. A row is by \| who \| count \| what \| when \| *tone*, where *by* is `agent`, `rule` or `you` and names the row's group, so a machine's work is never folded into the person's. A burst is one row: `agent \| Claude \| 14 \| saves on Variable axis QA \| 3h ago`. One row `seen \| when` sits where the reader last looked: the rows above it are new, their count in the accent and their group headed "N new", and a line reading "Before you last looked" parts them from the rest; an empty *when* is no mark yet. Any other first word, or a second `seen` row, degrades under `DIALECT_ARITY`. Empty, it says "Nothing new." or, with no mark, "Nothing to catch up on yet." |
| `diff` | rows verbatim, each marked `- ` (taken out), `+ ` (put in) or two spaces (in both); a unified diff's `-line` and ` line` read the same. A row with any other first character degrades under `DIALECT_ARITY`. `diffRows(before, after)` writes the rows for two versions. A removed line is a `del` with a minus whose name is the word "removed", an added one an `ins` with a plus named "added"; lines wrap in their box; a run of shared lines that would hide four or more, keeping three beside each change, folds into "N lines unchanged" |
| `queue` | **page-only**: the page's evaluator writes the rows from `governance.open`. `q \| id \| who \| when \| question \| why \| cost` a question, then `opt \| id \| key \| label \| because \| recommended \| *shows*` an option, then optionally `more \| n \| where`. *shows* is what the option is: `swatch:#1f3a5f,#c9a227` (one to eight colours, six hex digits each), `figure:EGP 1,200` (text), or `file:parts#2/photo` (a file the record holds, drawn only where the host resolves it to a path of its own). Anything else there degrades under `DIALECT_ARITY`. `queue tiles` draws a tile per question led by its recommended option's visual, "Recommended: …", and the ways to answer folded under it, shut |
| `inputs` | **page-only**: the page's evaluator writes one row a field of one record row: field \| label \| type \| value. `type` is the field's declared type, which picks the control: text, url and email as themselves; money, a number, a share and a duration as text asking for the decimal keypad (a number box refuses `EGP 1,200.00`); a day as a date; a yes or no as a checkbox; `enum:idea,sample,made` as a select. A field id that is not one, a field twice, or a type nobody types into (a ref, a list, a file) degrades under `DIALECT_ARITY`. The controls are drawn only where the host passes `oninput`, which is handed the row and the text on every change; without it the block is a `spec` of the values in the spec's own classes |
| `capture` | **page-only**: the page's evaluator writes the rows from the block's `register:` and `where:` ([06-PAGES](06-PAGES.md) §1.1). One row `into \| register \| label \| where`, first: the list a new row goes into, what it is called, and optionally a path to it; then one `set \| field \| value` per value a new row inherits, in the stored form. A second `into`, a `set` before it, a field set twice or a `where` that is not a path of this record degrades under `DIALECT_ARITY`. The heading is the field's placeholder and accessible name, never a caption. The field, with its Add inside its edge once there is text, is drawn only where the host passes `oncapture`; without it the block draws one line naming the list, a link where `where` is given, and never a disabled field |

---

## 3 · Three invariants, none negotiable

**1 · A malformed block degrades to a visible code fence.** It never renders wrong and never
renders nothing — it shows the author exactly what they typed. A dropped block must read as
feedback, and the writing guidance says so out loud so an agent learns from it. **The write is
accepted**: a `document` is never parsed at write and never refused for its dialect; the fence at
render is the feedback channel.

**2 · Column positions are FIXED.** An unknown glyph draws no glyph rather than shifting the
columns — a glyph is a `data-glyph` name, drawn from the path the host answers (`RenderOptions.icon`),
and the renderer ships no glyph art (36 §13 D17). A column that moves is worse than a column an agent has to count.

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

**A colour from data is drawn only inside its option's box.** The one other colour that reaches the
DOM is a `queue` option's swatch (§2.1): which lining, which cover, which paint, where the colour IS
the thing being chosen. It is the option's content, not a theme's and not the page's, so it is held
to three rules. It is six hex digits, checked by the kernel when the question is filed and again by
the renderer, so no value can close the property it sits in and write a style. It is written into
`--swatch` on a chip inside that option's `queue-visual` box and nowhere else: never a border, a
fill, a tile, a card or a heading, and never inherited by anything around it. And it is hidden from
a screen reader, because six hex digits are not a name; the option's label is. A page that wants its
own colours asks for a theme; a swatch cannot become one.

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

**A glyph, `{{icon:<name>}}`, is not a typed form.** Its argument is a glyph name and never a path:
`{{icon:rocket}} shipped` draws a rocket before the word, 1em high in the words' own colour, and holds the word after
it on the same line. A name is one `GLYPH_NAMES` (`packages/render/src/glyphs/names.ts`) holds, as written or through
its alias; any other name, `constructor` included, is the author's text, marked unresolved, and nothing is drawn for
it. The renderer still ships no art (§3): the host answers `RenderOptions.icon` with a path, and without an answer the
glyph is a named, empty `data-glyph` span of the same size, so the words around it never move. The same answer fills
a section's glyph (20px) and a chip's (16px).

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
