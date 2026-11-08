# `@braindog/site`: brain.dog

The marketing site. Prerendered: every page is finished HTML on disk, with no fallback and no client
router, and the whole of it reads with scripting off. It describes the finished product in the
present tense and ships with that product.

```sh
pnpm dev              # http://localhost:5184
pnpm build            # -> build/, one directory of static files
node scripts/shot.mjs # screenshots of the built site, both schemes
node scripts/product.mjs  # the shared cards, static/shots/og-*.png, from seo.ts
```

## How it is built

- **SvelteKit, prerendered, `strict: true`.** A route that stops prerendering fails the build rather
  than shipping blank. The record app is `ssr = false` because it draws a database that changes
  while you look at it; this site draws sentences that change only when somebody edits this
  repository, so it arrives finished.
- **One origin.** The site's Worker (`src/worker.ts`, `wrangler.jsonc`) hands `/app`, `/api/*`,
  `/auth/*`, `/account/*` and `/mcp` to the app's Worker, which sends an old `/app` link on to
  `app.brain.dog`. Every link to the app (`https://app.brain.dog/...`) carries `rel="external"`, or
  the prerender crawler follows it and stops the build.
- **The same design system as the app**, imported from `@braindog/skin` rather than copied: the
  tokens, the generated palette, the mark. The site's own half is `src/app.css`: the type scale, the
  grounds, the button and the section shapes every page is made of.
- **One list of pages.** `src/lib/nav.ts` names every page in order, and a page shows only once its
  route folder exists. The header, the footer, the 404 and `/sitemap.xml` all read it.
- **No photographs.** The product is drawn in HTML and CSS from the seed each starter installs, and
  `test/content.test.ts` fails if a `<picture>` or an `<img>` reaches the home page. The only pictures
  are the shared cards, `static/shots/og-*.png`, one per key page, which `scripts/product.mjs` draws in the
  hero's style from each page's headline (`CARDS` in `src/lib/site/seo.ts`).

## The flags

`src/lib/launch.ts` holds `LAUNCH`: `signup`, `billing`, `repo`, `cli`, `render` and `legal`, each
`false` until the owner's word. Every sentence that is true only after launch reads one, and nothing
else on the site knows the date. The production vars that mirror `signup` and `billing` are named by
the ops area, and a test holds each pair equal.

## The copy files

Every word a reader sees is in `src/lib/copy/`, one file per area: `shell` (the name, the header,
the footer, the search results, the 404), `home`, `cases` (the drawn app and its kinds of person),
`pricing` (with Slash), `agents`, `packs`, `for`, `trust` (support, security, legal) and
`changelog`. `src/lib/copy.ts` is the barrel: it spreads them into `site` and re-exports the
addresses, so every import reads as before. A page may import its own area file. Nobody edits the
barrel; a new key goes in its area's file. Every address is in `src/lib/links.ts`.

## The rules

- Say what it does. Never sell it, never adjective it.
- A button is a verb and a noun. Never "Get Started", never "Learn More".
- A number is a real number or it is absent. No "10x", no "up to".
- Say the limits out loud.
- No em dash anywhere a person reads. Write two sentences, or use a colon.
- Sentence case. No uppercase or letter-spaced label, and no band numbers.
- One face for words, Geist. Lexend is for page names, big figures and the wordmark, and mono is for code and addresses.
- Colour through tokens only. The accent is for the hero's words, focus and a chart's primary series;
  buttons are ink, and the state hues mean state.
- One motion per band, played once, finished in under five seconds, and still under reduced motion.
- At 390: 16px gutters, 44px targets, nothing under 14px, no sideways scroll.
- The licence is named on `/legal` and nowhere else on the site.

## Shooting it

`scripts/shot.mjs` serves `build/` itself rather than borrowing `vite preview`, which hands out an
`index.html` pointing at hashed chunks that no longer exist after a rebuild. It forces
`loading="eager"` and awaits `decode()` before the shutter, because a full-page capture does not
scroll and lazy images would photograph as empty frames.
