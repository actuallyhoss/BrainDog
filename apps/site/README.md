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
`@braindog/skin` rather than copying it. The pill, the tinted glyph and its four hues are the
site's own, in `src/app.css`, so the three pages draw them one way. The one thing it does that the
record app refuses is the translucent blurred bar: the app will not put translucency behind a
column of small tabular digits, and a marketing page has no such column.

## Every screenshot is the real app

`static/shots/` holds captures of `apps/web` on the synthetic record, at 1440×900, in both schemes,
served through `<picture>` with `prefers-color-scheme`. Two files and not one image with a CSS
invert: the light and dark palettes are generated separately from one seed and are not each other
inverted, so a single shot with `filter: invert()` would be a picture of a product that does not
exist.

Regenerate them with `apps/web` running, from `apps/web`:

```sh
node scripts/shot.mjs   # the app's own routes, into apps/web/shots
```

then copy the ones the site uses into `apps/site/static/shots/`. They are committed, because a
marketing page that cannot build without a running app is a marketing page that cannot build.

The one exception is the top of the home page, which is `src/lib/Preview.svelte`: the same home
screen, laid out from words read off `home-light.png` rather than shown as the PNG, so it paints
with the HTML, reads at phone size and wears the current palette. Nothing in it is invented, for
the reason `Fields.svelte` gives, and its words are in `copy.ts` with the rest.

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
and the landing page ends on three things the product will not do.

**The claims go stale faster than the code does.** `copy.ts` is checked against `REPORT.md` rather
than against last week's copy: the changelog said *"Nothing has shipped yet"* for six days after the
app was deployed, and the pricing page sold inbound email and the Kennel, neither of which exists.
Re-read both files together before changing either.

## Shooting it

`scripts/shot.mjs` serves `build/` itself rather than borrowing `vite preview`, because preview
serves the dev server's output directory and hands out an `index.html` pointing at hashed chunks
that no longer exist after a rebuild. It also forces `loading="eager"` and awaits `decode()` before
the shutter: a full-page capture does not scroll, so lazy images photograph as empty frames.
