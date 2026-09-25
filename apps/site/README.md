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

## No photographs, and the product is drawn

THE HOME PAGE CARRIES NO SCREENSHOT. It carried two until 22 September, the work board in the hero
and the founder's dashboard in a band of its own, each a WebP painted at 1:1 inside a scrolling
window. The owner's word on them was *i hate those screenshots. they look terrible*, and he asked
for the drawn app to take their place, overlapping the hero, with its records pressable. Before
that the page had carried ten pictures, seven of them painted at three quarters so the app's 14px
text landed at 11px; a picture of an interface is soft at every width but one and goes stale with
every palette change, and a drawing is neither. `test/content.test.ts` fails if a `<picture>` or an
`<img>` comes back into `index.html`.

`src/lib/Arrange.svelte` is the app's own window, drawn in HTML and CSS from `copy.ts`: a tab per
use case, the rail with the glyph the app draws beside every page and list, and a page that answers
the rail. Home shows its tiles and the table the setup's Home draws under them; every list with
rows written for it opens, every row opens its own page, Decide shows a question with Accept and
Reject that answer it, and Automations opens each rule as the app draws one. It is raised over the
seam between the hero and the band under it, the one element on the site with a shadow (`--e3`),
and its body is one fixed height at each width, so choosing a case, a list or a row never moves
the page. `src/lib/Decide.svelte`, further down, is an agent's proposal that a person accepts,
landing as the newest row of the record's history.

**The bands are not numbered.** They opened with `0001` upwards in the accent until 22 September,
when the owner asked for the numbering to go. A band opens on its own word and a rule, or on its
heading.

**Nothing in them is invented.** Every label, figure, name and time is read off the seed each use
case installs (`packages/seed/src/usecases`) or the web app's test-only sample
(`apps/web/src/lib/record/fixtures/sample.ts`)
and lives in `copy.ts` with the rest of the words; the one liberty, a question on Decide, is named
beside the data. `src/lib/arrange.test.ts` holds the rail's glyphs to the app's and every list and
Home table to rows that are there.

**One thing moves, and it stops.** The decision scene plays once when it first comes on screen, in
under five seconds, and rests. Its reduced-motion guard is in the script, not the stylesheet, which
is the one place this site departs from the rule that motion is CSS: a `prefers-reduced-motion` rule
can stop a transition and cannot stop a timer, so under that preference no timer is made.

**The captures that remain are for people, not for the page.** `static/shots/` holds one file,
`home-light.png`, which `src/app.html` names as the `og:image` for link previews, and
`scripts/shots.test.mjs` fails if a capture script writes anything else there. It is a drawn card
and not a photograph of the app: `scripts/product.mjs` lifts the mark, the wordmark and the hero's
slogan out of this site's own build and renders them at 1200 by 630, so `pnpm -C apps/site build`
first. Until 23 September it photographed the record app's Work board, and it had stopped running
when the app moved under `/app`; it no longer reads the app's build, starts a record or binds a
port.
`scripts/usecases.mjs` creates one self-hosted record per use case, sets it up through `/start` the
way a stranger would, and writes what it sees into the directory `--png=<dir>` names, because that
is the cheapest way to see what a stranger actually gets out of `/start`; it writes nothing that
ships.

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
