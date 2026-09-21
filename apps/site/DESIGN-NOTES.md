# What the references actually do, measured

The brief for this redesign is `loop/research-site-reference.md`, which measured PostHog, FirstLook,
Linear and Supabase with Playwright and measured brain.dog's own screenshots with Pillow. This file
is the second read, done from source before any of the markup below it was written, and it exists
so the next person can check the numbers rather than take a feeling.

Every value has the URL it came from beside it. Nothing here is remembered.

## 1. PostHog, read from the repository

`github.com/PostHog/posthog.com` is public, so these are file values and not samples off a render.

### The palette, `raw.githubusercontent.com/PostHog/posthog.com/master/tailwind.config.js`

Fourteen brand colours carry the product:

| name | value |
| --- | --- |
| blue | `#2F80FA` |
| red | `#F54E00` |
| orange | `#EB9D2A` |
| yellow | `#F7A501` |
| green | `#6AA84F` |
| teal | `#29DBBB` |
| seagreen | `#30ABC6` |
| purple | `#B62AD9` |
| fuchsia | `#A621C8` |
| pink | `#E34C6F` |
| salmon | `#F35454` |
| lilac | `#8567FF` |
| sky-blue | `#2EA2D3` |
| burnt-orange | `#DF6133` |

Under them sits a twelve-step neutral ramp, `light-1 #FDFDF8` through `light-12 #23251D`, and the
button chrome has three colours of its own: `button-shadow #CD8407`, `button-border #B17816`,
`button-shadow-dark #99660E`.

**What is worth taking from this, and it is not the hues.** The ramp is twelve steps and the
buttons get their own three. BrainDog's generated palette already carries twenty-three roles per
scheme (`packages/skin/house.css`); the page spends four of them. The defect is spending, not
supply, which is what `loop/research-site-reference.md` §5 concluded by counting pixels.

### The button, `src/components/OSButton/index.tsx`

The press is built from two elements rather than a shadow. The parent carries
`bg-button-shadow dark:bg-button-shadow-dark text-primary border-button` and the child is
translated up off it:

| size | child classes |
| --- | --- |
| sm | `px-2 py-0.5 text-xs gap-1 rounded-[5px] translate-y-[-2px] hover:translate-y-[-3px] active:translate-y-[-1.5px] border-[1.5px]` |
| md | `px-2.5 py-1 gap-1 rounded-[6px] text-[13px] translate-y-[-2px] hover:translate-y-[-3px] active:translate-y-[-1.5px]` |
| lg | `px-3 py-1.5 text-[15px] gap-1 rounded-[6px] translate-y-[-2px] hover:translate-y-[-4px] active:translate-y-[-1px]` |
| xl | `px-4 py-2 text-base gap-1.5 rounded-[6px] translate-y-[-2px] hover:translate-y-[-4px] active:translate-y-[-1px]` |

So the "shadow" under a PostHog button is a solid colour the parent paints and the child moves off,
two device pixels at rest and four under the pointer. **Not taken.** `app.css` already argues that
the press here is a scale and an opacity, because `a11y.css` deletes durations under
`prefers-reduced-motion` rather than softening them, and a press written as a translate alone is
absent for those readers. The measurement is recorded because it was the thing worth checking.

### The type scale, `src/components/Home/classes.js`

```
lg:       text-4xl md:text-5xl          (36px, 48px)
md:       text-3xl lg:text-4xl          (30px, 36px)
subtitle: text-xl xl:text-2xl           (20px, 24px) leading-tight font-semibold
sm:       text-base md:text-[18px] md:text-xl  (16px, 18px, 20px)
section:  max-w-screen-2xl mx-auto py-8 px-4
```

**Three numbers out of that.** The largest heading on PostHog's home page is 48px. A section is
`py-8`, which is 32px of padding each side, so 64px between section bodies. The content column is
`max-w-screen-2xl`, 1536px.

Ours was 86.4px of heading and 192px between bands, so the reference is smaller type and a third
of the air. `research-site-reference.md` §5 says the same thing from the other direction and adds
that FirstLook spends 192px and Linear 256px, so spacing is not what these pages have in common.
**Air was left alone in this redesign. Type came down.**

### The accent in the hero, `src/components/Home/Hero.js`

The one className that matters on the whole file: `"text-red dark:text-yellow"`, on a phrase inside
the hero headline. PostHog spends `#F54E00` in light and `#F7A501` in dark on **a word**, and it is
a different hue per scheme because neither one reads on both grounds.

**Taken, and adapted.** BrainDog's accent is `#DB2527` in both schemes, so no per-scheme swap is
needed; `--accent-text` is already solved per scheme for exactly this job (`#981C1B` light,
`#FF7E72` dark). What was taken is the idea that the headline itself carries the colour. (The three
values here read `#D72065`, `#951946` and `#FD7B9B` until 21 September, when the accent went back to
the mark's own red and the generated skins moved with it.)

### The table, `src/components/OSTable/index.tsx`

```
text-primary inline-grid max-w-full divide-x divide-y divide-border border-b border-primary
text-[15px] [&>div]:px-2 rounded-md
```

A CSS grid, not a `<table>` element, dividers on both axes, radius only on the four corner cells,
15px text, 8px of horizontal cell padding and 8px vertical at the medium size.

**Taken.** Three grids on the new home page are built this way: `gap: 1px` over a line-coloured
ground with `overflow: hidden` and one radius on the outside, so every divider is the gap itself
and there is exactly one border in the markup. FirstLook does the same thing at `.pillars` and
`.systems` per `research-site-reference.md` §2, which is where the two references agree and
therefore, by DIRECTION §14's own rule, where the signal is.

### Separation, `src/styles/global.css`

```
hr        { @apply border-t border-b-0 border-solid border-primary my-6 h-0; }
details   { @apply bg-primary border border-transparent rounded; }
.footnotes{ @apply border-t border-input pt-4; }
h1 1.875rem/2.25rem   h2 1.5rem/2rem   h3 1.25rem/1.75rem   (.not-prose)
--tw-shadow-color: 77 79 70   (light)
--tw-shadow-color: 35 37 29   (dark)
```

There is no `boxShadow` key anywhere in the Tailwind config, and the shadow **colour** is a token
per scheme rather than black. Separation is a hairline and density.

**Taken.** No new shadow is introduced anywhere in this redesign. Every boundary on the new page is
either a 1px `--line`, a change of ground, or both at once.

## 2. FirstLook, Linear, Supabase

Measured in `loop/research-site-reference.md` §2 to §4 with Playwright on 21 September 2026, from
the served documents. Not re-measured here; the four findings this redesign is built on:

1. **FirstLook flips its ground six times across ten sections**, and the flip from `#0B1B3A` to
   `#F5F7FA` is a **15.88:1** jump. It has no dark mode at all. Ten sections, ten layouts, no
   repeat. (`firstlook.ai` served HTML, inline `<style>` at lines 89 to 220.)
2. **Linear's first screen is 0.0% chromatic pixels** and its largest single colour covers **49.8%**
   of it, against brain.dog's **86.4%**. Its content column is **1344 of 1440, 93.3%**, and its
   `h1` is **64px spanning 1282px**. Colour is not what separates them. Coverage is.
3. **PostHog no longer scrolls.** `scrollHeight` is 900px at a 900px viewport: it is an illustrated
   desktop with one translucent window, `1139px` wide at `border-radius: 20px`, and the marketing
   page scrolls inside that. Its dark mode is `darkMode: 'class'`
   (`tailwind.config.js:8`), a control in the site rather than an OS preference. **Not taken**, and
   the reason is written down rather than implied: this site answers `prefers-color-scheme` with no
   cookie and no control (`app.html`), so a window-on-a-desktop would need a scheme switch this
   site has deliberately never had.
4. **Every one of the four fills the frame.** The smallest "largest single colour" share on a first
   screen is PostHog's 10.5%. Ours was 86.4%, and 47.5% of the page's rows carried nothing but a
   1px rule.

## 3. What this redesign took, in one list

| taken | from | where it landed |
| --- | --- | --- |
| Ground changes per section, at a real contrast step | FirstLook, 6 flips in 10 sections | six ground changes across seven bands, two of them at the body-text ratio (17.61:1 dark, 15.41:1 light) |
| Hairline grid where the gap is the divider | FirstLook `.pillars`, PostHog `OSTable` | the sixteen-tool grid, the register rail, the three-column promise table |
| Separation by rule and density, never by more air | PostHog, 64px sections with a 1px top border | spacing left at 192px, every boundary given a full-bleed hairline |
| Smaller heading type, wider span | PostHog 48px, Linear 64px at 1282px wide | hero down from 86.4px to 68px, and the `14ch` cap removed so it spans the column |
| Product imagery at the full width of the ground | Linear's 1344px shot running off the fold | the record's home screen full-bleed at 1:1 |
| Colour in the headline itself | PostHog `text-red dark:text-yellow` | `--accent-text` on the last two words of the hero |
| Reveal on scroll, killed under reduced motion | FirstLook, 18px translate over 0.7s | `animation-timeline: view()`, inside `prefers-reduced-motion: no-preference` |

## 4. What was measured in this repository, for the numbers the page now prints

A number on the page is a number somebody ran. These were counted on 21 September 2026 and the
command is beside each one so the next reader can re-run it rather than trust it.

| figure | value | how |
| --- | --- | --- |
| MCP tools | **16** | `packages/mcp/src/index.ts`, the `name:` keys between `:163` and `:329` |
| MCP resource templates | **5** | `packages/mcp/src/index.ts`, the `TEMPLATES` array |
| gates | **30** | the `GATES` array in `tools/gates/run.mjs`, counted by parsing it |
| tests | **over 4,500** | 4,511 `test(`/`it(` calls across 384 `*.test.ts` files |
| packages | **16** | `ls -d packages/*/` |
| nightly backups kept | **30** | `apps/selfhost/src/snapshots.ts:30`, and `apps/worker/src/snapshots.ts` for the hosted side |
| report key caps | **100 rows a call, 256 KB a call, 600 rows a minute** | `packages/record/src/report.ts:1-30` |

Two numbers in the brief were **not** used because they did not survive being checked. The brief
said 1,239 commits; `git rev-list --count HEAD` says 1,265, and a figure that moves every hour is
not a figure to print on a page that redeploys on a schedule. The brief said 31 gates; the
registered list holds 30.

## 5. What was checked on the finished page

Three of these are not gates in `tools/gates` and were run by hand against `apps/site/build`, because
the measurements this redesign is answering are not things the standing gates measure. They are
written down here with what they covered, so the next person can decide whether any of them is worth
turning into a gate rather than re-deriving it.

First, the three numbers the whole redesign was aimed at, re-measured on the built page at a 1440
viewport (the same conditions `loop/research-site-reference.md` used):

| | before | after |
| --- | --- | --- |
| Rightmost ink per band | median CSS x=389, three bands at 37 to 38% of the viewport | 1320, 1440, 1320, 1320, 1440, 1320, 1320 |
| Hero headline | 86.4px, three lines, 441px wide | 67.68px, one line, 970px wide |
| Ground changes | 1, at 1.04:1 | 6, two of them at 17.61:1 dark and 15.41:1 light |

The document is 5,008px tall at 1440 where it was 4,368, which is the cost of filling it.

| check | how | result |
| --- | --- | --- |
| No sideways overflow | Playwright, `documentElement.scrollWidth` against `clientWidth`, 20 widths from 320 to 2560, 5 routes, both schemes, plus a walk for any element past the right edge with no clipping ancestor | 0 |
| The scroll reveal can never hide content | Playwright, scrolled the home page in 300px steps at 1440 in both `prefers-reduced-motion` states, reading computed `opacity` of every `.reveal` whose middle is on screen | every band reaches full opacity while it is on screen, in both states |
| Accessibility | axe-core, `wcag2a wcag2aa wcag21a wcag21aa wcag22aa`, 5 routes x 2 schemes x 2 widths (1440 and 390) | 0 violations |

The accessibility run is the one that matters most to this redesign, because two of the six ground
changes rewrite the semantic colour tokens underneath whole sections. Contrast on the flipped band
and on the brand band is checked there rather than only argued for in `app.css`.

The standing gates that read this app were run too: `colour-grep`, `css-rules`, `em-dash`,
`dead-copy`, `layout`, the site's own `test/content.test.ts` and `svelte-check`.

---

# The second pass, 2026-09-21

Everything above describes the first pass, which is commit `8d6bcc9c` and is what brain.dog serves
today. That pass ended by naming four things about itself that were not good enough. This section
is what was done about each, and the numbers are measured on the built page the same way the ones
above are.

## 1. Three bands shared one armature, and now none of them does

The first pass counted seven layouts in seven bands. Counted honestly, it was five: bands 0001,
0003 and 0005 were all the same shape, copy in a left column and a widget in a right one. The
contents differed and the armature did not, which is the fault
`loop/research-site-reference.md` §5 measures by asking how many distinct layouts a page runs
before it repeats one. FirstLook runs ten in ten.

Two of the three were rebuilt. The hero keeps the split, because one use of a shape is not a
repeat of it.

**0003 is a strip.** The heading and the sentence run the column, the segmented control runs the
full width of the screen between two hairlines, and the rail it redraws sits under it at the
column's own width. `Arrange.svelte` is now a child of the band rather than of `.in`, which is the
whole mechanism: the strip's rules are full-bleed and the buttons inside it are not. Above 760px
the five pills become five equal segments of the column, each carrying the case's name and how
many parts it holds, the selected one marked by ground, weight and a 2px rule on its top edge.
`holds.length` is read from `copy.ts` rather than typed, so the count cannot disagree with the
list beneath it.

**0005 is a layer.** The dashboard is the full width of the screen and wider than it inside, by
12.7 per cent at every width, so it runs off the right edge at every viewport (section 7 replaced
the fixed 1,760px this paragraph used to name, because a fixed width let the window decide where
the picture got cut), and the specification lies **on** the picture in an opaque card rather than
in a column beside it. It is the only place on the site where two surfaces overlap. The card is
`--s1` inside a `--line` hairline, so nothing is read through it: this costs no new token, no new
colour and no shadow, which is the rule the first pass set for itself.

Counted the way the reference file counts the four reference sites, the page now runs:

| band | layout |
| --- | --- |
| 0001 | split row, live ledger beside the sentence, spanning four-cell hairline strip under it |
| 0002 | paired head, then a full-bleed photograph cover-cropped edge to edge |
| 0003 | full-bleed control strip over a full-width result rail |
| 0004 | title, wide lead, sixteen-cell inventory grid and a chip row, on the flipped ground |
| 0005 | a card lying on a picture that is wider than the screen |
| 0006 | three-column hairline table of lists |
| close | display statement over a ruled baseline row |

**Seven distinct layouts in seven bands, no repeat**, against FirstLook's ten in ten and the first
pass's real five.

## 2. The slack under 0003's left column is gone, because the column is gone

Measured on the first pass's build, the copy column of band 0003 ended about 120px above the foot
of the rail beside it, so the bottom left of the band was empty. That is the same emptiness defect
the whole redesign was written to remove, at one band's scale. There is no left column now, so
there is nothing for a hole to be under. The band also got shorter and wider: 630px tall where it
was 779, with its ink reaching CSS x=1440 where it reached 1320.

Re-measured on the built page at 1440, the seven bands' rightmost ink is now
**1320, 1440, 1440, 1320, 1440, 1320, 1320**, so three bands reach the edge of the screen where two
did. The document is 5,270px tall where the first pass left it at 5,008 and the page before it was
4,368.

## 3. The changelog is five days less stale

The newest entry was 2026-09-16 and the tree was on the 21st, with 585 commits in between
(`git rev-list --count --since=2026-09-17 HEAD`). The first pass would not write entries because
that means making claims about commits it had not read.

They were read. Nineteen entries were added across four days, each one traced to a named commit,
with its body saying only what that commit's own message and diff support. Where the subject line
sounded more finished than the state was, the body says the smaller thing: the hosted nightly copy
entry says the copy refuses to write until an operator sets a real key, because
`apps/worker/wrangler.jsonc` still carries `age1<production-recipient>` as a placeholder in both
environments. Nineteen for 585 is deliberate: most of that week is tests, gates, specifications and
documents, and this page is for what a reader can see.

Reading the commits also falsified a line on the home page. `copy.ts` justified *the engine is
written; no host reaches it yet* by citing
`grep -rl "@braindog/spark" apps/worker/src apps/selfhost/src` returning nothing. Run again it
returns two files: `packages/spark` landed on the 20th and both hosts were wired to it the same
day. The line now says what is still true, which is that both hosts reach the engine and neither
has a model configured, and `SPARK_ENDPOINT` is `""` in both environments is the check for it.

## 4. Legal and 404 were not left alone

The first pass kept both on the old 960px document layout on purpose, and half of that decision was
right: a licence is read rather than sold, so the prose keeps its 68ch measure and gets no picture,
no ledger and no brand field. What did not survive a second look is that they also kept a
**different skeleton** from every other route, so the one page a stranger meets by accident was the
one page that did not look like the site. Both are bands now, with the site's own opener, the two
grounds and the full-width hairline at every seam; only the frame changed and not a word of the
copy. The 404's sequence number is `404` rather than `0001`, because it is not part of the
record's sequence and the status really is a 404.

`scripts/shot.mjs` photographs both routes from now on. They were the two routes nobody had ever
photographed, which is not a coincidence: a page nobody looks at is a page nobody notices has
stopped matching the rest of the site. Twenty shots rather than twelve.

## 5. Light mode, looked at on its own

The first pass was judged mostly in the dark. Every shot in `apps/site/shots` was opened in both
schemes for this pass, and the only fault that was worse in light than in dark was on the pricing
page: its closing band was a 16px heading and two lines of 16px prose in the left half of a 1,136px
column, which is the emptiness fault on the one page that asks for money. It now opens with the
same mark every other band on the site opens with, the question is a heading at heading size, and
the answer sits beside it so the row reaches both edges.

The two new bands were checked in both schemes and neither needed a scheme-specific rule, which is
the point of a band naming a ground rather than painting a colour: the strip is `--s1` between two
`--line` rules and the card is `--s1` inside one, and both come out right in light and in dark
because those tokens are already solved per scheme.

## What was measured on the finished page, again

| | first pass | second pass |
| --- | --- | --- |
| Distinct layouts before a repeat | 5 in 7, counted honestly | **7 in 7** |
| Rightmost ink per band, 1440 | 1320, 1440, 1320, 1320, 1440, 1320, 1320 | 1320, 1440, 1440, 1320, 1440, 1320, 1320 |
| Bands reaching the screen edge | 2 | 3 |
| Ground changes | 6 across 7 bands | 6 across 7 bands, unchanged |
| Document height at 1440 | 5,008px | 5,270px |
| Routes photographed | 3 of 5 | 5 of 5 |
| Changelog newest entry | 2026-09-16 | 2026-09-21 |

| check | how | result |
| --- | --- | --- |
| Accessibility | axe-core, `wcag2a wcag2aa wcag21a wcag21aa wcag22aa`, 5 routes x 2 schemes x 4 widths (1440, 900, 720, 390) | 0 violations |
| Layout | `tools/gates/layout.mjs`, 855 page-runs over 19 widths | 0 findings |
| Colour literals | `tools/gates/colour-grep.mjs` | 0 outside the theme |
| Stylesheet rules | `tools/gates/css-rules.mjs`, 125 files, 143 tokens | 0 findings |
| Em dashes | `tools/gates/em-dash.mjs`, 417 files | 0 |
| Unrendered copy | `tools/gates/dead-copy.mjs` | 1,128 sentences, 18 unrendered, all 18 known |
| Types and markup | `svelte-check`, 287 files | 0 errors, 0 warnings |
| The site's own tests | `pnpm --filter @braindog/site test` | 14 pass |

## 6. The third pass, and it is the one he asked for twice

Two passes had been made on this page before he saw it deployed, and he still called it horrible,
boring and ugly. So this pass was argued from what could be MEASURED about the fault rather than
from another look at it, and three faults were named before any line was written.

**A card lay across the dashboard's money figures, and neither margin was safe.** This is the
worst class of defect the product can ship, because a figure with its leading digits behind a card
is still readable and is wrong. It had already been moved once, from the left margin to the right,
and that only changed which figure it hid: the right-hand card cut `no more than GBP 50,000.00`,
the limit line under the third figure, in half.

**And the sentence this passage used to make its case with named a figure that is not in the
capture.** It said *the reports band was drawing `GBP 28,320.00` as `320.00`*. Read off
`static/shots/usecase-founder-dashboard-light.webp` at 1:1, the three figures under `Across your
organisations` are `GBP 24,800.00`, `GBP 0.00` and `GBP 320.00`, and nothing anywhere in the
picture reads 28,320. `GBP 320.00` is the whole figure for `Going out, 30 days`. The defect was
real and the number was not: somebody saw `320.00` beside a card and wrote down what the hidden
digits would have been, from a screenshot rather than from the pixels. That is the exact move this
tree refuses, performed inside the paragraph that names it.

Measured on the capture, with the ink profile in `apps/site/src/routes/+page.svelte` beside the
overlap: the three columns start at x=547, x=1319 and x=2091, which is 19.0, 45.8 and 72.6 per
cent of the 2,880px width, and the label, the figure and the limit under it all start on the same
three. A figure occupies every third of the picture, so no 480px card can be put beside one. What
is free is the top, where the picture carries a breadcrumb, a title and two controls and no number
at all. **The first money figure starts at source row 381 and not 341.** Profiled by ink over
three column windows centred on those percentages, every window opens on the label row, 333 to
352 on the left and 333 to 355 in the other two; the figures follow at 385 in the `Cash now`
column and 381 in the other two, so 381 is the topmost pixel of any of them and 341 is inside the
words above. At the 0.61111 scale the third pass painted at, that is 232.8 rendered pixels of
clear picture and not 208.

**And the overlap is 72px at 1440 and not 88.** `margin-block-end` is
`calc(-1 * clamp(40px, 5vw, 88px))`, and `5vw` is five per cent of the window, so the clamp only
reaches its ceiling at a 1,760px viewport; 1,760 was the width the picture was painted at, not the
width of the window. Read off the built page: -72px at 1440, -64px at 1280, -51.2px at 1024, -45px
at 900 and 0px below 900. So the clear picture between the card's bottom edge and the top of the
first figure was **161.8px at 1440, not 120**. Every one of those four errors ran in the safe
direction, which is why the shipped band was fine and the recorded derivation was not: it handed
the next person 341 to check a new capture against, and a capture whose first figure moved up to
row 350 would have read as a failure while one that moved to 130 would have read as a pass.

**Four of the six ground changes were invisible.** `--sunk` against `--bg` is 1.07:1. It is a real
step in the eye's adaptation and it is the right step inside the application, where it separates a
canvas from a panel; on a page somebody scrolls once it is nothing, which is why six ground changes
read as one grey field with rules across it. The grounds are now `page, page, flip, page, page,
flip, brand`, which is four changes.

**Three of those four are the body pair, and the two ratios this passage first quoted were
PostHog's.** It said *15.77:1 in dark and 18.51:1 in light*, citing `packages/theme/src/index.ts`,
and that line is the row recording PostHog's own `#111111` on `#FDFDF8`, under a heading saying it
was read from their source. Ours were three lines further down the same file and were not taken.
Sampled instead off the built page, by reading each band's computed `background-color` at 1440 in
both schemes and running the WCAG relative-luminance formula over the pair:

| | page ground | flipped ground | ratio |
| --- | --- | --- | --- |
| light | `rgb(247, 245, 243)` | `rgb(32, 29, 27)` | **15.41:1** |
| dark | `rgb(20, 18, 17)` | `rgb(250, 248, 244)` | **17.61:1** |

Ours is the higher of the two in dark; the borrowed pair is higher in light, so the schemes were
inverted as well as the numbers. Both pairs clear AAA by a wide margin, so nobody was misled about
legibility. What the error cost is the row in the table below, which carried a competitor's
measurement as this pass's headline achievement.

**And the fourth change is not the body pair at all.** `flip` to `brand` at the last seam is the
scheme's ink meeting `rgb(215, 32, 101)`: **3.42:1 in light and 4.62:1 in dark**. The band is
right and the change is real. The word *every* is what was wrong, and it was the word the claim
existed to carry, because the fault this pass was fixing was changes a reader could not see.

**The two seams that do not invert are marked by the rule and nothing else.** This passage said
they open with a picture that runs edge to edge, and that sentence is the whole argument for
dropping two of the six ground changes. Measured at 1440 in page coordinates: the 0001/0002
hairline is at y=953.06 and the picture's top edge at y=1188.06, **235px below it**, behind a mark
and a two-column heading; the 0004/0005 hairline is at y=3274.64 and its picture starts at
y=3617.27, **342.63px below**, behind a mark and the card. What a reader meets at those two seams
is a 1px `--line` and then a third of a screen of the ground the band above ended on. The claim is
withdrawn rather than repaired, because repairing it would mean moving two pictures, and the honest
statement is that this page has four ground changes and two seams carried by a hairline alone.

**Flipping a band exposed two tokens that did not flip with it.** `--sunk` and `--edge` were not in
the flipped set, so the parts widget drew its panel in the scheme's own canvas: a near-black panel
in the middle of a near-white band, the loudest thing on the page and none of it intended. Both are
now solved on `:root` with the rest of the flipped set, where the mix resolves against the page's
two colours rather than against the flipped ones. Written inside the flip rule instead, which was
the first attempt, `mix(--bg 18%, --ink)` lands on the far side of the ground and paints the panel
in the text colour.

**The hero was the third copy of one armature.** Copy in a 46ch column beside a 540px panel, which
bands 0002 and 0005 were both doing, and the hero is the one band that cannot look like the others
because it is the shape a stranger meets. The reference read measures what the pages he pointed at
put on the first screen: Linear runs a 1,344px product element from y=527 off the bottom of the
fold (section 3 of `loop/research-site-reference.md`). There is no third capture to run off a fold
here, and there is something no reference has, which is an element that is actually running. So the
headline takes the full column, the sentence and the two actions share one row at one baseline, and
the ledger goes underneath **at 1,200px, measured at x=120 in a 1,440px window**. Its `what` column
was the first thing to ellipsis inside the old 540px box, which is the component whose entire job
is to show that nothing is overwritten truncating its own sentences.

**This passage said the ledger goes edge to edge at the width of the screen, and it does not.**
The stage is the screen: `.hero-stage` measures x=0, w=1440. What is inside it is the reading
column plus its two gutters, because the stage's padding is
`max(var(--sp-6), calc((100% - var(--site-max)) / 2))` and `--site-max` is 1200px. Measured at
1440, 1280 and 1024: the ledger is 1200px at x=120, 1200px at x=40 and 960px at x=32, against the
`.display` above it at 1136px. That is 83 per cent of the screen at 1440, it is 2.2 times the box
it replaces, and it is 144px under the Linear element the same paragraph reaches for. Two elements
on this page really do run the width of the screen, and the moving one is not either of them: band
0002's figure is 1,440px and band 0005's picture is wider than the window.

### What was measured on the finished page, a third time

Every row below carries the width it was taken at, because the row about layouts turned out to be a
count with no width on it and the row about ground changes turned out to be somebody else's
measurement. The third-pass column is what the third pass shipped, re-taken here; the third pass's
own figures are in the last column where they differ.

| at 1440 unless said | first pass | second pass | third pass, re-taken | as the third pass wrote it |
| --- | --- | --- | --- | --- |
| Distinct layouts before a repeat | 5 in 7 | 7 in 7 | **7 in 7 at 1024 and above, 6 in 7 at 900 and at 390** | 7 in 7, no width |
| Ground changes | 6, four of them 1.07:1 | 6, four of them 1.07:1 | **4: three at 15.41:1 light and 17.61:1 dark, one at 3.42:1 light and 4.62:1 dark** | 4, every one 15.77:1 dark and 18.51:1 light |
| Money figures covered by a card | 2 | 1 | **0** | 0 |
| Money figures cut by the frame | not measured | not measured | **1, `no more than GBP 50,000.00` at 1440** | not measured |
| Clear picture above the card's lowest edge | not measured | not measured | **161.8px** | 120px |
| Document height | 5,008px | 5,270px | **5,607px** | 5,649px |
| Hero armature | copy beside widget | copy beside widget | headline, text row, 1,200px demo | headline, text row, full-bleed demo |

The document height row is the one that is stale rather than wrong: 5,649px is the page as
`cebcb62e` left it, and the follow-up commit shortened band 0004's opener from three lines to one
without the row being re-run. What ships measures 5,607px, at 1440, light, `deviceScaleFactor` 1,
motion reduced, `document.documentElement.scrollHeight`.

The layout count needed a width on it and the width is 1000px, which is where `.head-two` and
`.hero-say` collapse to one column. Measured as offsets inside each band, bands 0002 and 0003 open
apart above the rule and alike below it:

| | band 0002 opener | band 0003 opener |
| --- | --- | --- |
| 1440 | mark at y=97, title x=152 y=157.74 w=426.19, lead **x=752** y=139 w=487.95 | mark at y=97, title x=152 y=139 w=426.19, lead x=152 y=192.27 w=678.91 |
| 1024 | mark at y=97, title x=32 y=157.74, lead **x=544** y=139 w=448 | mark at y=97, title x=32 y=139, lead x=32 y=192.27 w=678.91 |
| 900 | mark at y=97, title x=32 y=139, lead x=32 **y=216.26** w=487.95 | mark at y=97, title x=32 y=139, lead x=32 **y=192.27** w=678.91 |
| 390 | mark at y=65, title x=32 y=107 w=326, lead x=32 **y=213.53** w=326 | mark at y=65, title x=32 y=107 w=326, lead x=32 **y=189.53** w=326 |

At 900 the two openers put the same three elements at the same coordinates and differ only in the
lead's measure and 24px of offset; at 390 only in the 24px. So it is **six distinct openers in
seven bands at 900 and at 390, and seven at 1024 and above**. The bands still differ below the
opener, so seven in seven is defensible as a statement about whole armatures at 1440. It was not
defensible with no width written on it, in a document whose second pass ranked three bands sharing
one armature as its first fault.

| check | how | result |
| --- | --- | --- |
| Colour literals | `tools/gates/colour-grep.mjs` | 0 outside the theme |
| Stylesheet rules | `tools/gates/css-rules.mjs`, 125 files, 145 tokens | 0 findings |
| Em dashes | `tools/gates/em-dash.mjs`, 417 files | 0 |
| Types and markup | `svelte-check`, 287 files | 0 errors, 0 warnings |
| The site's own tests | `pnpm --filter @braindog/site test` | 14 pass |
| Screenshots | `node apps/site/scripts/shot.mjs` | 20, five routes in both schemes at 1440 and 390 |
| Accessibility | `tools/gates/a11y.mjs`, axe-core over the app and the site | 244 page-runs, 0 rules with findings |

Two of those rows say less than they look like they say, and both are worth writing down next to
them rather than leaving for the next audit. The accessibility row is the whole repository: of its
244 page-runs, twelve are this site and four are this page, and the gate's site route list is
`['/', '/pricing', '/changelog']`, so `/legal` and `/404` are photographed and have never been
audited. The em-dash row is true about the gate and says nothing about this document: the gate
walks `packages/*/src` and `apps/*/src`, so `apps/site/DESIGN-NOTES.md` is outside it. This file
was grepped for U+2014 directly for that reason.

`tools/gates/layout.mjs` was NOT re-run against this pass. It declares `needs: ['web-build']` and
the record app was mid-edit by nine other agents while this ran, so a build then would have been a
build of a moving tree. It is the next thing to run against the page, said here rather than left
for somebody to assume either way.

## 7. The fourth pass: the card stopped hiding a money figure and the frame did not

`loop/research-site-audit.md` drove the third pass in Chromium and found twelve things. Seven of
them are above, corrected in place. This section is the one that needed code rather than prose,
and it is the same defect the third pass was written to remove, one pass later and in the same
band.

**A money figure was being cut in half by the edge of the window.** The picture was painted at a
fixed `1760px` with `block-size: clamp(420px, 44vw, 700px)`, so the window decided where both
edges of it landed. Driven over `apps/site/build`, served read only, at a device scale of 1 with
motion reduced, in both schemes:

| viewport | right edge lands at source column | ink in that column | bottom edge lands at source row | ink in that row |
| --- | --- | --- | --- | --- |
| 1440 | 2356.4 | **3** | 1035.1 | **79** |
| 1280 | 2094.5 | **27** | 919.9 | **27** |
| 1024 | 1675.6 | 0 | 735.6 | **50** |
| 900 | 1472.7 | **14** | 685.6 | **71** |

The rows are the painted area and not the border box: the image is `border-box` and carries a 1px
top rule, so the picture starts a pixel down and the bottom cut is about two source rows higher
than the declared height says. That pixel is the difference between these rows and the audit's.

Ink is counted the way the audit counts it: a pixel whose luminance differs by more than 25 from
the median of its own row, taken over the light and the dark capture together, with the two panel
edges that run the whole height and any rule that runs the whole width excluded, because a crop
that lands on a rule reads as a rule.

At 1440 the right edge falls inside the final `0` of `no more than GBP 50,000.00`, the limit line
under the third figure, which runs from source x=2092 to x=2371. That is one of the two strings
the card was moved to stop covering, still being cut, by the frame instead. The bottom edge is the
same class: at 1440 it cuts all three sparklines mid-stroke and slices two end dots in half.

**And at 1024 and 900 the bottom edge lands inside the navigation rail.** The audit called those
two clear space, by luck rather than design, and they are not clear: its ink profile was taken
over x=640 to x=2820 and the frame shows x=0. Row 736 carries 50 pixels of ink between x=82 and
x=163, which is the word `Ledger`, and row 686 carries 71 between x=35 and x=188, which is
`Overview`. A glyph sliced in the rail is the same mistake as one sliced in a figure. Photographed
into `%TEMP%/braindog-loop/f7-rail-cut.png`.

### Both edges are ratios of the capture now, and neither has the viewport in it

```css
inline-size: calc(100% * 2880 / 2556);
aspect-ratio: 2880 / 1214;
object-fit: cover;
object-position: 0 0;
```

The figure is the width of the screen, so painting the image at 2880/2556 of it puts the figure's
own right edge on source column **2556** whatever the screen is: the width cancels. `object-fit:
cover` then takes its scale from the width, so a box of `2880 / 1214` crops the bottom at source
row **1214**, also whatever the screen is. A `clamp` could not do this, and its own 700px ceiling
was a second wandering crop waiting above a 1,591px viewport.

**2556 and 1214 came out of the picture.** Over both captures, counting every pixel the frame
shows, columns **2535 to 2577** carry no ink over the rows the frame shows, and rows **1186 to
1242** carry none over the columns it shows. Each cut is the middle of its run, so it has 21
source columns and 28 source rows of clearance, which is 11.8 and 15.8 rendered pixels at 1440 and
7.4 and 9.9 at 900. The numbers are the widest clear runs in the neighbourhood of the composition
the third pass chose, found by iterating the two windows against each other until they stopped
moving.

Re-driven with those two declarations over the same built page, at the same settings:

| viewport | right edge, source column | ink | bottom edge, source row | ink | painted height |
| --- | --- | --- | --- | --- | --- |
| 1440 | **2556.0** | 0 | **1212.2** | 0 | 682.94px |
| 1280 | **2556.0** | 0 | **1212.0** | 0 | 606.94px |
| 1024 | **2556.0** | 0 | **1211.5** | 0 | 485.34px |
| 999 | **2556.0** | 0 | **1211.4** | 0 | 473.47px |
| 900 | **2556.0** | 0 | **1211.1** | 0 | 426.45px |

Both schemes. The bottom row reads 1211 and not the declared 1214 for the same reason the red rows
do: the 1px top rule is inside a border box, which costs about two source rows, and it costs a
shade more at the narrow end where a rendered pixel is worth more source pixels. Both numbers are
inside the same clear run, which is what a run 57 rows deep is for. Below 900 the `<picture>` swaps
in the phone capture and the rules above are undone by `aspect-ratio: auto`, which is the keyword
that now carries the crop where `block-size` used to.

### What this costs, said rather than left out

The picture is still wider than the screen, by 12.7 per cent rather than 22: 1,622.53px inside
1,440 at 1440, so 182.53px of it falls off the right edge. What it no longer does is hold its
scale while the window moves the cut, and that is the trade. The capture is a 2x shot, so at a
device scale of 2 the frame keeps a device pixel per source pixel down to a 1,278px viewport and
is downsampled below it: at 900 the capture is painted at 0.352 of its source, which is 70 per
cent of the size the application drew at. A downsample is soft. A crop through a glyph is a
mistake, and the band's own stylesheet had already written that rule down and applied it to one
edge only.

The card's clearance moves too, and it moves the right way. The clear strip above the first money
figure is now `381 / 2556` of the viewport, which is 14.9 per cent of it, against an overlap of
`5vw`: the strip is **2.98 times the overlap at every width** where `5vw` is the operative term,
rather than a fixed 232.8px racing a growing overlap. Measured card bottom to the top of the first
figure: 143.65px at 1440, 127.80 at 1280, 102.45 at 1024 and 90.15 at 900, against 161.83, 169.83,
182.64 and 188.83 before. It is less clearance at the narrow end and it can no longer be broken by
a width, which is the property that was missing.

| | third pass | fourth pass |
| --- | --- | --- |
| Money figures cut by the frame, 1440 | 1 | **0** |
| Widths at which a cut lands on ink, of 1440, 1280, 1024, 900 | 4 | **0** |
| Clear picture above the card's lowest edge, 1440 | 161.8px | 143.7px |
| Smallest clearance over 1440, 1280, 1024, 900 | 161.8px | 90.2px |
| Band 0005 painted picture height, 1440 | 632.59px | 682.94px |
| Document height, 1440 | 5,607px | **5,658px** |

| check | how | result |
| --- | --- | --- |
| Types and markup | `pnpm -C apps/site typecheck` | 288 files, 0 errors, 0 warnings |
| The site's own tests | `node --test --experimental-strip-types "apps/site/test/*.test.ts"` | tests 14, pass 14, fail 0 |
| Em dashes | `node tools/gates/em-dash.mjs`, and a direct grep of this file, which the gate does not read | 0 |
| Module graph | `node tools/gates/graph.mjs` | acyclic and in order |
| Secrets | `node tools/gates/secret-grep.mjs` | 0 plaintexts reach a sink |
| Geometry | Chromium over `apps/site/build`, served read only on a port no gate owns, 1440, 1280, 1024, 999, 900 and 390 in both schemes | `%TEMP%/braindog-loop/f7-red.json`, `f7-green.json` |
| The capture's own pixels | ink profiles and annotated crops of both wide captures | `%TEMP%/braindog-loop/f7-right-cut.png`, `f7-bottom-cut.png`, `f7-rail-cut.png`, `f7-whole.png` |

The green geometry was taken by replaying the two changed rules over the built page rather than by
rebuilding `apps/site/build`, because nine other agents were working in this tree and that
directory is not this run's to rewrite. The replay is `%TEMP%/braindog-loop` alongside the
readings, and it is the same two declarations that are in the stylesheet. A build and a re-run is
the thing to do next, along with `tools/gates/layout.mjs`, which has still never seen this band.

**What is still open.** There is no test in `apps/site/test` that would have caught either cut,
and this run does not own that directory. The test to write reads the two ratios out of
`+page.svelte` and asserts that the source column and source row they name carry no ink in either
capture, which is four lines of arithmetic once something in the tree can decode a WebP. Until
then the guard is this section.
