# `@braindog/site` — brain.dog

The marketing site. Prerendered: every page is finished HTML on disk, no fallback, no client router,
and the whole thing readable with scripting off.

That is the one structural difference from `apps/web`, and it follows from what each renders. The
record app is `ssr = false` because it draws a database that changes while you are looking at it, so
there is nothing true to put in the HTML at build time. This draws sentences that change when
somebody edits this repository. **A landing page's first job is to arrive, and the fastest way to
arrive is to already be finished.**

`strict: true` on the adapter, unlike the app: a route that quietly stopped prerendering fails the
build rather than shipping blank.

```sh
pnpm dev              # http://localhost:5184
pnpm build            # -> build/, one directory of static files
node scripts/shot.mjs # screenshots of the BUILT site, both schemes
```

## It is the same design system, not a lookalike

Same tokens, same generated palette, same mark, same corner radii, because it imports
`@braindog/skin` rather than copying it. It follows the app's redesign (`loop/DESIGN-BRIEF.md`,
sections 3 and 4): a monochrome ground, headings in Geist, the primary button in ink, and colour
spent only on state. The button and the glyph are the site's own, in `src/app.css`, so the three
pages draw them one way. No kicker over a heading, no glow, no tinted card, no translucent bar.

## Two photographs at full size, and the rest is drawn

THE OLD PAGE HAD TEN PICTURES OF THE PRODUCT and a reader could read none of them. Seven were
screenshots painted at about three quarters, so the app's own 14px text landed on the page at
11px, and all ten read as the same grey table. It ran to 1,804 words down eight bands of identical
shape. The page is six numbered bands and about 300 words now.

The two photographs that stayed, `home-*.webp` in the typed band and
`usecase-founder-dashboard-*.webp` in the reporting band, are painted at exactly `1440px` inside a
window that scrolls. That is the rule and it is worth stating plainly: an image of an interface is
never scaled below 1:1, because at full size a reader can read it and shrunk they cannot, so the
frame gives way rather than the pixels.

Everything else is drawn from tokens, so it paints with the first byte of HTML, reads at phone size
and wears whichever palette the tokens say. `src/lib/Ledger.svelte` is the record's history
arriving a row at a time, and `src/lib/Arrange.svelte` is the application's own rail, redrawn when
a reader presses one of five use cases.

**The page is the record.** One hairline runs down the left of every band with an ascending mono
sequence number pinned to it, `0001` to `0006`. The sections are events in an append-only log. It
costs one border and one number per band, and it is the product's own thesis: nothing here is
overwritten.

**Nothing in them is invented.** Every label, figure, name and time is read off the demo record
(`apps/web/src/lib/record/data.ts` and `packages/seed/src/index.ts`) and lives in `copy.ts` with
the rest of the words. When the seed's sample business changes, the drawings change with it.

**One thing moves, and it stops.** The ledger shows two rows and adds one every four seconds until
all five have landed, and then it rests. It never loops, never removes a row and never invents a
sixth to keep the motion going: an append-only log that secretly recycles its rows is a picture of
a lie, and the component's whole job is to be the proof of the claim beside it. The rows arrive
inside a box of fixed height, so nothing below the hero moves while somebody is reading it.

**Its reduced-motion guard is in the script, not the stylesheet**, and that is the one place this
app departs from the app's rule that motion is CSS. A `prefers-reduced-motion` rule can stop a
transition; it cannot stop a `setInterval`. So the component asks `matchMedia` before it creates a
timer: under that preference every row is on screen at once and no timer is ever created. A CSS
guard here would have left the tick running and only hidden the evidence.

**Who it's for was photographed from fresh records, and is now drawn.** `scripts/usecases.mjs` creates one
self-hosted record per use case (a temporary data directory, a free port that is never 5189 or 5317,
nothing secret), sets it up through `/start` the way a stranger would, and writes
`static/shots/usecase-<id>[-phone]-<scheme>.webp` of the page it opens on, plus the founder's
Dashboard after sixty days of reported numbers. It needs `apps/web/build`. A use case `/start` does
not offer yet is skipped and said.

Of those, **the page serves one**: the founder's Dashboard, in the reporting band. The five
arrangements are drawn by `Arrange.svelte` now, because five photographs of five arrangements of
the same application, each painted below full size, were five pictures a reader could not read and
could not tell apart. **So the script writes into `static/shots/` only what a page serves** (its
`SHIPPED` list), because `static/` is deployed whole and the twenty-four that nobody requested were
3 MB of it until 22 September. `--png=<dir>` still takes every use case, into a directory of your
choosing, since that is the cheapest way to see what a stranger actually gets out of `/start`.

`scripts/product.mjs` writes `static/shots/` from the app's build, or from a running app with
`--from=http://localhost:5317` while the build lags the source. Its `SHOTS` list holds only the
shots a page serves, for the same reason.
The page serves the `home` WebPs; `home-light.png` is the `og:image` in `src/app.html`, because not
every preview fetcher decodes WebP.

## The copy is one file

`src/lib/copy.ts`. Same discipline as the app's, for a sharper reason: **marketing copy is where a
product lies to itself.** One file is one pass to check that every claim on this site is a thing the
software does. The voice, in five rules:

- Say what it does. Never sell it, never adjective it.
- A CTA is Verb + Noun. Never "Get Started", never "Learn More".
- A number is a real number or it is absent. No "10×", no "up to".
- Say the limits out loud. A page that lists only strengths is a page nobody believes twice, and
  the buyer here reads specifications for a living.
- No em dashes in anything a person reads. A sentence that only worked because of the dash was two
  sentences; write them as two, or use a colon. `grep -c '—' build/*.html` is the check.

Which is why the changelog opens with the state of the product, the pricing page says out loud that
neither plan is open yet, the section about agents says which half of the MCP surface is connected,
and the landing page ends on what is not built yet and three things the product will not do.

**The claims go stale faster than the code does.** `copy.ts` is checked against `REPORT.md` rather
than against last week's copy: the changelog said *"Nothing has shipped yet"* for six days after the
app was deployed, and the pricing page sold inbound email and the Kennel, neither of which exists.
Re-read both files together before changing either.

## Shooting it

`scripts/shot.mjs` serves `build/` itself rather than borrowing `vite preview`, because preview
serves the dev server's output directory and hands out an `index.html` pointing at hashed chunks
that no longer exist after a rebuild. It also forces `loading="eager"` and awaits `decode()` before
the shutter: a full-page capture does not scroll, so lazy images photograph as empty frames.
