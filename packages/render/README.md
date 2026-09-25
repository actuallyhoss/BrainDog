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

## Thirty-four kinds over eight primitives

Kinds are declarations over primitives, so primitives compose and kinds do not have to. `cards`,
`section` and `feed` are page-only: a page's evaluator writes their rows and passes
`parse(src, { page: true })`. A `diff` is verbatim rows marked `- `, `+ ` or two spaces, and
`diffRows(before, after)` writes them. A `capture` is the one-line add, page-only too: an `into` row naming the
list and a `set` row for each value a new row inherits. Its field and its Add exist only where the host passes
`oncapture` to `Block`; without one it draws the list's name, as a link where the row gives it an address,
and never a disabled field.

| Primitive | Is | Kinds |
|---|---|---|
| `panel` | a bounded region with a tone and a nested document | `note` `quote` `section` `capture` |
| `grid` | *n* cells of label and figure | `stat` `board` `cards` `heat` |
| `rows` | label · value · note, one per line | `spec` `params` `inputs` |
| `proportional` | rows whose number drives a drawn magnitude | `bar` `gauge` `sparkline` `split` `bridge` `series` `lines` `progress` `forecast` `ring` |
| `inline` | a run of pills | `chips` |
| `list` | title · detail · optional state marker; on a `todo`, up to two more facts as one quiet line under the title | `todo` `steps` `timeline` `feed` `agents` `queue` `roadmap` |
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

A board is a **grid of lists**. A roadmap is a **list with dates**. A risk matrix is a **grid of
inlines**. Which is why a third party can add a kind without asking a designer: a kind is not code,
it is a named composition of primitives shipped as data, and `PRIMITIVES_VERSION` is the integer a
consumer checks.

**The primitive set is the real API surface.** Eight is reviewable; thirty-four kinds plus unbounded
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
| `braindog-render/svelte` | the same markup as components, for an app that hydrates |

They are not two implementations of a guess. The Svelte components emit the same `<figure>` skeleton,
the same classes and the same data attributes as `toHTML`, so **their accessibility trees are equal by
construction** rather than by a promise a gate has to police afterwards.

The Svelte `Block` takes four write callbacks and `toHTML` takes none: `onmove` for a board, `ontick` and
`onact` for a list, and `oncapture(register, text, inherited)` for a capture. A block drawn without them is
the tree `toHTML` draws, so a read-only embed is the default rather than a mode.

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

MIT. Part of [BrainDog](https://github.com/actuallyhoss/braindog), which is Apache-2.0.
