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

## The hero is photographed, the rest is drawn

The hero is the demo's real home screen, `static/shots/home-*.webp`, with the phone's own capture
on a phone and one per scheme, so the first picture a stranger sees is the product and not an
illustration of it. The bento (`src/lib/bento/`, with `Fields.svelte`) is seven features in
miniature, and `src/lib/Steps.svelte` is the one chain in the demo that runs from an email to rows.
Those are markup and tokens, so they paint with the first byte of HTML, read at phone size and wear
whichever palette the tokens say.

**Nothing in them is invented.** Every label, figure, name and time is read off the demo record
(`apps/web/src/lib/record/data.ts` and `packages/seed/src/index.ts`) and lives in `copy.ts` with
the rest of the words. When the seed's sample business changes, the drawings change with it.

**The motion is CSS, and it cannot fail open.** Every loop lives inside
`prefers-reduced-motion: no-preference`, so the resting style is the finished state: a reader who
asked for no motion, and the a11y gate, see the whole picture standing still. A loop pauses under
the pointer. A list that gains rows moves inside a box of fixed height, so nothing on the page
shifts once per loop.

**Who it's for is photographed from fresh records, not the demo.** `scripts/usecases.mjs` creates one
self-hosted record per use case (a temporary data directory, a free port that is never 5189 or 5317,
nothing secret), sets it up through `/start` the way a stranger would, and writes
`static/shots/usecase-<id>[-phone]-<scheme>.webp` of the page it opens on, plus the founder's
Dashboard after sixty days of reported numbers. It needs `apps/web/build`. A use case `/start` does not
offer yet is skipped and said, and its row on the page is text only with `data-reshoot` until
`node scripts/usecases.mjs <id>` is run and `copy.ts` gives it a `shot`. Personal is that row today.

`scripts/product.mjs` writes `static/shots/` from the app's build, or from a running app with
`--from=http://localhost:5317` while the build lags the source. The page serves the `home` WebPs;
`home-light.png` is the `og:image` in `src/app.html`, because not every preview fetcher decodes WebP.

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
