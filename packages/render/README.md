# braindog-render

**A block dialect an agent gets right first time, and two renderers held to one accessibility tree.**

MIT, zero dependencies, and separately licensed from the app on purpose. The app is Apache-2.0 and
this is MIT, because the block dialect is meant to be embedded anywhere, including in code that is
not open at all, and MIT asks nothing of whoever embeds it.

```
npm i braindog-render
```

---

## The problem it solves

An agent has something to show. Give it eighteen components and it will reach for the wrong one; give
it HTML and it will write a table inside a callout; give it a JSON schema and it will spend a
third of its tokens on punctuation.

So: **fenced blocks, because an agent already writes fenced blocks**, and a new syntax is a new thing
to get wrong.

````
```stat | The number that shapes all three
Daily-active players | ~2,690 | across 70,073 servers
DAU per server | 0.04 | the median server has 0 | bad
Active worldwide in any hour | 460-640 | your server-mates are not online | warn
```
````

`kind | heading`, then one row per line, `field | field | field | tone`. Positional, terse, nothing to
nest.

```js
import { parse, toHTML } from 'braindog-render';

toHTML(parse(markdown));
```

---

## Three invariants, none negotiable

**1 · A malformed block degrades to a visible fence.** It never renders wrong and never renders
nothing: it shows the author exactly what they typed, with the reason above it.

> The parser has **no path that returns nothing.** Silent omission in a record whose value is
> completeness is data loss with a tidy appearance, and when the author is an agent, the visible
> fence is the only feedback channel that exists.

**2 · Column positions are fixed.** An unknown glyph draws no glyph rather than shifting the columns.
A column that moves is worse than a column an agent has to count.

**3 · The dialect names INTENT; the theme names appearance.** An agent writes `warn`, never amber. So
a theme swap can never break a page, and an agent can never make a page ugly.

---

## Forty-three kinds over eight primitives

Kinds are declarations over primitives, so primitives compose and kinds do not have to. `cards`,
`section` and `feed` are page-only: a page's evaluator writes their rows and passes
`parse(src, { page: true })`. A `diff` is verbatim rows marked `- `, `+ ` or two spaces, and
`diffRows(before, after)` writes them. A `capture` is the one-line add, page-only too: an `into` row naming the
list and a `set` row for each value a new row inherits. Its field and its Add exist only where the host passes
`oncapture` to `Block`; without one it draws the list's name, as a link where the row gives it an address,
and never a disabled field.

| Primitive | Is | Kinds |
|---|---|---|
| `panel` | a bounded region with a tone and a nested document | `note` `quote` `section` `capture` `embed` `drawn` `project` |
| `grid` | *n* cells of label and figure | `stat` `board` `cards` `heat` `gallery` `kpis` |
| `rows` | label · value · note, one per line | `spec` `params` `inputs` `form` |
| `proportional` | rows whose number drives a drawn magnitude | `bar` `gauge` `sparkline` `split` `bridge` `series` `lines` `progress` `forecast` `ring` |
| `inline` | a run of pills | `chips` |
| `list` | title · detail · optional state marker; on a `todo`, up to two more facts as one quiet line under the title | `todo` `steps` `timeline` `feed` `agents` `queue` `roadmap` `calendar` `lanes` `link` |
| `table` | real columns, a header, per-column alignment | `comparison` `table` |
| `media` | a figure with a caption | `code` `tree` `diff` |

A `todo` row is `[ ] title | detail | fact | fact`, and the two facts are optional: where either is
there, both renderers draw them after the detail as one `<span class="item-meta">`, joined by ` · `,
and where both are blank there is no span at all, so a two-cell todo draws exactly what it always
did. A fifth cell degrades the block. Placing the line under the title is the host stylesheet's job,
as every other class here is.

A `roadmap` row is `title | by | effort`: the task, its due day, and its effort in days (`10`, `1.5 d`). The
due day reads as `2026-10-05` or as `5 Oct 2026`, the form `day()` writes and so the form a page's reader
projects a `day` field in. A row with an effort is a bar ending on its due day, as many whole days long as the effort rounded up, and a
row with none is a dated stem. A row whose date or effort does not read is named under the drawing, never placed.
Each mark carries `currentColor` presentation attributes, so a host with no `roadmap-` rules still draws it
quietly rather than black, and any rule the host does write wins over them.

A `ring` is one to five rows of `label | value | target`. One row is progress toward the target, read by the
same plan `progress` uses, so the two never disagree about how far along a goal is; `3/5` or `60%` needs no
target. Two to five rows are the parts of a whole, the third cell a note, cut as `split` cuts its track. A value
that does not read draws no dial, only the words, because an empty dial in a 64px square reads as zero. Its
circles carry `currentColor` presentation attributes, as a roadmap's marks do.

A `heat` row is `day | value`, the value one when left off and rows on one day added. The grid is twelve weeks
by weekday ending on the week of `RenderOptions.now`, the cells written week by week, Monday first, with no
position of their own: the host flows them into seven rows and `--weeks` columns, and on a phone hides the first
four weeks. A day nobody wrote is a gap and never a zero, and a day still to come carries `data-future` and no wash.
` ```heat who ` reads `day | who` instead: one `heat-person` line a person, the latest in touch first and at most eight (the rest counted in `heat-more`), across the
same twelve weeks, a `heat-week` dot each week (`data-on` where they were in touch), each line's dots named in words,
and the months along them as `heat-tick`s placed by `--week`. All twelve weeks hold on a phone.

A `calendar` row is `title | day`, and a tone. Every month from the first row's to the last row's is drawn as a
table of weeks, Monday first, each day naming its first three rows and counting the rest (`+2`), then an agenda of
every day that holds anything. Nothing is hidden behind a control, so the app, the mirror and the digest draw the
same months; a busy day carries `data-count`, which a host drawing a month as a strip of days puts a dot on.

A `lanes` row is `title | start | end`, and a tone, each end an instant with its offset (`2026-10-07T11:00:00+02:00`,
or `Z`); an end left off is a span still going. The first row may be the window, `window | from | to | now`, and a
block with none takes its window from its rows. One `lanes-item` a row, in the order they came, each with its title,
how its time is said (`lanes-when`) and a `lanes-track` holding a `lanes-bar`, placed by `--at` and `--span` on the
item, percentages of the track's width. A hidden `lanes-axis` names the hours or the days (`lanes-tick`) and holds
now's line (`lanes-now`), each placed by `--at`. An item carries `data-open` while it is still going, `data-point`
when it is one instant, and `data-before` or `data-after` when it is cut at an edge of the window. Times are said in
the offset the window was written in, so the host writes its instants on the reader's clock.

A `section` row is `glyph | count | fold | tone`. The tone is `danger`, `action` or `earn`, written as `data-tone` on
the heading's well (`sec-glyph`); left off, or any other word, the well is drawn as it was.

A `link` row is `title | url | note`. The address is an `https:` one, a `mailto:` or a path of this BrainDog, and any
other degrades the block. The host is drawn under the title, and nothing is fetched: no favicon, no preview.

A `gallery` row is `caption | file`. The file is `file:<list>#<seq>/<field>`, turned into an address only by the host's
`RenderOptions.file` and drawn only where that address is the host's own; anything else in the cell is the file's name.

An `embed` is one authored row, `url | title | aspect`, and page-only. The address must be one of `EMBED_PROVIDERS`
(YouTube, Vimeo, Loom, Figma, Google Maps), framed through the provider's own embed address, and the aspect is `16:9`,
`4:3`, `1:1` or `9:16`. Both drawers draw a facade; only the Svelte one adds a Load button, and only a press puts a
sandboxed frame on the page.

A card's column may be its `hue`, a whole number from 0 to 359 written on the card as `--hue` for the host to draw its
mark in, or its `picture`, a file as a gallery names one, which the card leads with. A `steps path` may name a short
view in a first row, `short | This week`, and mark each stone in it with `short` after its mark: the short view is drawn
first with how many more there are, and the Svelte drawer adds the switch to every stone. With `onpath` passed to
`Block`, each stone is a 44px toggle; with `onmove`, each card on a board carries a "Move to" select, which is how a
card moves under a finger.

A board is a **grid of lists**. A roadmap is a **list with dates**. A risk matrix is a **grid of
inlines**. Which is why a third party can add a kind without asking a designer: a kind is not code,
it is a named composition of primitives shipped as data, and `PRIMITIVES_VERSION` is the integer a
consumer checks.

**The primitive set is the real API surface.** Eight is reviewable; forty-three kinds plus unbounded
third-party kinds is not. Adding a primitive is easy; renaming or removing one breaks every pack ever
written, so ship fewer than you think you need.

---

## Four intents, and the glyph is part of the token

`good` · `warn` · `bad` · `info`. That is the whole vocabulary an author may write.

The glyph is **part of the intent token**, not a choice at the call site, and there is exactly one
table mapping intent → (role, glyph). A component cannot render `warn` without its glyph because
there is no API that lets it.

That is not fussiness. Simulate the four intent colours through a dichromat transform and measure the
distance between the simulated pairs: **green and red are the same olive.** For roughly 8% of men,
four intent words are one colour. And the mechanism is inescapable: tuning hues to the *same*
contrast target against the *same* ground necessarily gives them the *same luminance*, so any palette
built the obvious, careful, correct-looking way has this property.

Each glyph carries `U+FE0E`. Without it the warning triangle resolves to a colour emoji on most
platforms, which paints an intent in a colour no theme chose and no validator measured.

---

## Two renderers, one tree

| | |
|---|---|
| `toHTML(segments, opts)` | framework-free. Serves exports, tests, the mirror and a digest email |
| `braindog-render/svelte` | the same markup as components, for an app that hydrates. 0.1.0 does not publish it: the components import `../src/*.ts` and need `svelte-package` to ship, so it is a workspace entry for now |

They are not two implementations of a guess. The Svelte components emit the same `<figure>` skeleton,
the same classes and the same data attributes as `toHTML`, so **their accessibility trees are equal by
construction** rather than by a promise a gate has to police afterwards.

The Svelte `Block` takes four write callbacks and `toHTML` takes none: `onmove` for a board, `ontick` and
`onact` for a list, and `oncapture(register, text, inherited)` for a capture. A block drawn without them is
the tree `toHTML` draws, so a read-only embed is the default rather than a mode.

Every row a `todo`, `timeline`, list, `feed` or `queue` draws carries `data-row` with its key (`rowKey`:
`register#seq` for a row the host drew from the record, its place otherwise), and every queue option
carries `data-choice`, 1 to 9, in both renderers. So a host can walk a page's rows with j/k across its
blocks. The Svelte `Block` also takes `cursor` (the key of the row the host is on, drawn `data-focused`)
and `onrowfocus(key, row)`, and exports `choose(i)`, which answers the queue question under the cursor
with option `i`. Secondary lines (a task's due line, when a feed line happened, who asked a question) wear
`data-calm`, so a host's stylesheet can show them on hover or focus only.

Three more reads draw controls only when passed, and nothing otherwise: `onopen(row)` makes a todo's title a
button that opens it, `onmenu(row, anchor)` adds a quiet trailing "more" control to each task, and
`onselect(row, on)` (with the host's `selected` keys, if it holds them) puts a box on each queue question for
one answer in bulk. `queue lead` draws its first question whole: the recommendation, why, and the `does`
rows (`does | id | line`) saying what accepting it changes. `Filters` (with `filtersHTML` as its mirror)
is the strip a host draws over a page that names `filters:`, taking `filters`, `chosen` and `onfilter`.

The subpath ships **no stylesheet**. The markup contract is the whole of what a host draws against:

> Every block is one `<figure>` carrying its kind, its primitive and its tone as data attributes, with
> the heading as its `<figcaption>`; a cell is a `<span>` named for the cell it is.

---

## Live values, typed values, evidence

```
{{obligations.due_30d}}      asks the record what the figure is NOW
{{money:129900 EGP}}         EGP 1,299.00        — minor units, code first
{{date:2026-09-26}}          26 Sep 2026 · in 4w — links to the calendar
{{ago:2026-08-14}}           2w ago
{{ref:tasks#241}}            #241                — links to the row
{verified: Decree 2026}      somebody checked this once
{unknown}                    a hole, drawn as the affordance that fixes it
```

**Never type a figure the record already holds.** This is the rule with the most evidence behind it:
a write-up that typed seven headline numbers had all seven wrong three days later. A typed figure is a
claim with an expiry date nobody set.

And the distinction that carries the weight: `{{path}}` is not `{verified: path}`. The tag says
somebody checked this figure against that path *once*; the double brace says go and read it *now*.

Four rules the formatter never bends:

- A path that names nothing renders as the path, **marked**; a path whose value is missing renders an
  em dash: never blank, never `undefined`, and **never a zero**. *A product that earns nothing and a
  product nobody measured are not the same product.*
- Long fields are unavailable. A paragraph interpolated mid-sentence is a worse lie than a stale
  number.
- Formatting is decided for you. Money as money, a rate as a level, a reference as its spoken id.
- Code spans are lifted first, so a literal `{{…}}` from another system survives in backticks.

---

## A hole is a task, not a value

Eighty-five per cent of one currency's spending was uncategorised. Sorted by size, that row took the
top of the chart and **set the bar scale**, making every real category a one-pixel stub, the chart
made unreadable by the thing it reports.

> So it sits last, in `warn`, **outside the scale**, and it is the only row that is a button.

The general form: an unknown never participates in a scale, never sorts among the knowns, and is
always the affordance that fixes it. `{unknown}` renders the same way. A `{{path}}` that names nothing
renders the same way.

---

## What it will not do

| Refused | Because |
|---|---|
| Render a string of HTML | one parser, one escape function, and no `{@html}` anywhere in the package |
| Link to `javascript:` or `data:` | `https:`, `mailto:`, `#anchor` and same-origin paths are links; everything else is text |
| Throw | `parse` is total. Any byte string in, segments out |
| Write a colour | it emits `data-intent`; the host's stylesheet decides what that looks like |
| Nest a fence | the scan is flat. One parser, nothing to escape |

---

## Tests

`node --test src/render.test.ts`: 31 of them, no framework, including a property test that three
hundred random byte strings parse and render without throwing.

---

MIT. Part of [BrainDog](https://github.com/actuallyhoss/BrainDog), which is Apache-2.0.
