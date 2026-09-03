# @braindog/web

The browser client of the record. **A frontend mock-up: every screen, no write path.**

```
pnpm install
pnpm dev            # http://localhost:5183
pnpm build          # one build/ directory, served unchanged by both hosts
pnpm shots          # screenshots of every route, both schemes, into shots/
```

The record it shows is `src/lib/record/` — synthetic by rule, the same rule the fixture corpus
follows: invented names, `.example` hosts, no real person and no real credential. Swapping
`record/api.ts` for a real `lib/data/call.ts` is the whole of what the wiring costs; the shapes above
that file are the real ones.

---

## The nineteen screens

| | |
|---|---|
| `/` | Home — what needs you, and what changed while you were away |
| `/decide` · `/decide/SG31` | the queue, ranked by cost of being wrong; and the gate |
| `/inbox` | arrivals no pattern matched |
| `/r/obligations` · `/r/obligations/1` | a register, and a row |
| `/v/obligations.overdue` | a saved view — a named predicate |
| `/p/money` · `?src=1` | a declared page, and its declaration as text |
| `/vault` · `/packs` · `/settings/appearance` · `/audit` · `/search` | the rest of the spine |
| `/start` | the first run: one row, typed by hand |
| `/jobs/j_7Q2F` | a tier-C run's transcript |
| `/s/<token>` | a shared page: signed, read-only, and a landing page |
| `/SG31` | the spoken-id resolver |

---

## Five things worth reading the source for

**The gate** (`routes/decide/[id]`). `1`–`9` **highlight** an option and do not choose it; `↵` opens
the commit step and moves focus to the empty, required reason; only `⌘↵` from inside that field
commits. **No single keystroke ever commits a decision**, and the recommendation is displayed and
never pre-selected — if it were highlighted on open, three keystrokes would rubber-stamp the machine's
answer with a reason typed under its influence.

**The grid** (`routes/r/[register]`). CSS grid with declared column tracks, not a `<table>`, and that
is measured rather than tasteful: `<table>` layout scales superlinearly and `content-visibility` does
not work on table rows, by spec and by measurement. No virtualisation at any size — it breaks
find-in-page, breaks the scrollbar as a position cue, and only *hides* the real wall, which is DOM
construction.

**The keymap** (`lib/a11y/keys.svelte.ts`). One registry, one dispatcher, and every bare
single-letter shortcut lives inside a focused `role="grid"`. That satisfies WCAG 2.1.4's focus
exception with no settings toggle, and it solves the screen-reader collision *mechanically*: a
composite widget flips NVDA and JAWS out of browse mode, so a grid is the only place bare letters are
safe and it is exactly where they are wanted.

**`copy.ts`.** Every UI literal, in one file. Load-bearing twice: it is the only place a sentence is
typed, so the rule that the interface never explains itself is reviewable in one pass; and it is the
first input of the screenshot allow-list, where only text a developer typed into source stays legible.


**The widgets** (`routes/p/[slug]`, `lib/record/arrange.ts`, `lib/ui/AddBlock.svelte`). A page is a
twelve-column grid and a block takes the columns it declares. `span: 1–12` has been in the page
declaration since `06-PAGES` was written and nothing had ever read it.

A **flow, not a canvas**: blocks fill the row and wrap, so a layout cannot have a hole in it, cannot
reflow because a query returned one more row, and collapses to one column on a phone by keeping the
only thing a span encodes — which block comes after which. `21-AUTHORING` §3.1 rejected free
placement on measured evidence: in Home Assistant's masonry a **one-pixel** height difference could
move a card from the leftmost column to the rightmost, and people lost their spatial memory of where
a control lived.

**No height.** What a person means by "make it taller" is "show me more rows", and that is `limit` —
a number that survives a font-size change, a density change and a phone, where a pixel height does
not. Order and span are the only authorable dimensions, which is why an amateur cannot produce
something ugly: the vocabulary has no word for it.

Each kind declares the narrowest span it survives, and the width control **refuses** below it rather
than clamping. A `table` at span 4 is eight columns in a third of a page — not a narrow table, an
unreadable one — and a `Third` button that silently gives you a half has taught you the wrong thing
about your own page.

The picker's tiles are **live rendered blocks over your own rows**, through the same component the
page uses, because the preview is the real renderer. Selecting one inserts it already bound and
already drawing, with each cell filled by the first type-compatible field: the first act is
narrowing, never starting.

---

## What is deliberately absent

- **No write path.** Nothing saves, and no request leaves the page.
- **No Spark.** The record has no model configured, so every *Ask Spark* affordance is **absent, not
  disabled** — which is also the correct behaviour on any self-host.
- **No service worker, no outbox, no dialect editor.** Named in `50-SPEC-WEB` and not built here.
- **No page-generation wizard.** `Bind as a block` puts one saved view on one page you already have,
  which is the largest generator that does not break the contract: a whole-page proposal cannot be
  filed at all, because a `change` body needs a falsifiable prediction and "is this page good?" has
  no measure that is not `page.render` count — which is Goodhart, and refused by name.

---

## The gates

`pnpm gates` from the repository root, and each one exits non-zero:

| | |
|---|---|
| `css-rules` | a colour literal on a colour property · an unknown custom property · `outline: none` · a physical property |
| `colour-grep` | what the stylesheet rules cannot see: a class computed in TypeScript, a `fill="#333"` in an inline SVG. **This is the one that fires in practice** |
| `theme` | `src/theme/house.css` is byte-identical to what its generator emits |
| `bundle` | the size budgets, measured from the entry graph rather than the output directory |
| `clean-room` | nothing is ported from the predecessor |

Screenshots are **artefacts for a human, never an assertion**: rendering can vary with the host OS,
version, settings, hardware and power source, so a pixel diff fails on whitespace and passes on layout
bugs.

---

AGPL-3.0-only. The renderer is MIT and lives in `packages/render`.
