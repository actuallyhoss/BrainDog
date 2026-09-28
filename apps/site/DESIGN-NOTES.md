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
