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

Same tokens, same generated palette, same mark, same 4px corner, same pressable button edge —
because it imports `@braindog/skin` rather than copying it. The one thing it does that the record
app refuses is the translucent blurred bar: the app will not put translucency behind a column of
small tabular digits, and a marketing page has no such column.

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

## The copy is one file

`src/lib/copy.ts`. Same discipline as the app's, for a sharper reason: **marketing copy is where a
product lies to itself.** One file is one pass to check that every claim on this site is a thing the
software does. The voice, in four rules:

- Say what it does. Never sell it, never adjective it.
- A CTA is Verb + Noun. Never "Get Started", never "Learn More".
- A number is a real number or it is absent. No "10×", no "up to".
- Say the limits out loud. A page that lists only strengths is a page nobody believes twice, and
  the buyer here reads specifications for a living.

Which is why the changelog opens by saying nothing has shipped, the pricing page has no feature
matrix, and the landing page ends on three things the product will not do.

## Shooting it

`scripts/shot.mjs` serves `build/` itself rather than borrowing `vite preview`, because preview
serves the dev server's output directory and hands out an `index.html` pointing at hashed chunks
that no longer exist after a rebuild. It also forces `loading="eager"` and awaits `decode()` before
the shutter: a full-page capture does not scroll, so lazy images photograph as empty frames.
