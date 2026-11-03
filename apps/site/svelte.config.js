import adapter from '@sveltejs/adapter-static';
import { HELD, held } from './src/lib/launch.ts';

const OUT = process.env.BRAINDOG_ENV ? `build-${process.env.BRAINDOG_ENV}` : 'build';

/**
 * PRERENDERED, and every page of it.
 *
 * The record app is a static shell that hydrates because it renders data that changes while you are
 * looking at it. A marketing page renders sentences that change when somebody edits this repository,
 * so it is HTML on disk: no fallback, no client router by default, and the whole site readable with
 * scripting off. That is not austerity for its own sake: the first thing a landing page has to do
 * is arrive, and the fastest way to arrive is to already be finished.
 *
 * `strict: true`, unlike the app: every route here must actually prerender, so a page that quietly
 * became dynamic fails the build rather than shipping a blank.
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
  kit: {
    /* `BRAINDOG_ENV=alpha` writes `build-alpha`, which `env.alpha` in `wrangler.jsonc` serves, so an
       alpha build never replaces production's `build`. */
    adapter: adapter({ pages: OUT, assets: OUT, precompress: false, strict: true }),
    alias: { $lib: 'src/lib' },
    files: { assets: 'static' },
    /* `*` is every route without a parameter. `/legal` is named as well, so the page a licence
       points at is prerendered even on a day nothing on the site links to it. */
    prerender: {
      entries: ['*', '/legal'],
      /* A HELD ADDRESS ANSWERS 404 ON PURPOSE (`HELD` in `src/lib/launch.ts`): it writes no file, so the site's 404 page
         answers it. Any other failure still stops the build. */
      handleHttpError: ({ status, path, message }) => {
        if (status === 404 && HELD.includes(path)) return;
        throw new Error(message);
      },
      /* `/addons/[id]` and `/addons/by/[who]` name no page while the store is held, so they are never reached; anything
         else unseen still stops the build. */
      handleUnseenRoutes: ({ routes, message }) => {
        if (held() && routes.every((r) => r === '/addons/[id]' || r === '/addons/by/[who]')) return;
        throw new Error(message);
      },
    },
    /* EVERY ASSET IS NAMED FROM THE ROOT, because `not_found_handling: "404-page"` in
       `wrangler.jsonc` serves one `404.html` at whatever address was asked, at any depth. With
       SvelteKit's default of relative paths that page, prerendered for `/404`, asked for
       `./_app/immutable/...` eighteen times and set its base from `location`. At `/nope` that
       resolves to `/_app/` and the page was whole; at `/a/b`, `/changelog/x`, `/app/signin` or
       `/api/` it resolves to `/a/_app/` and the like, which is itself a path with no file, so all
       16 stylesheets and modules came back as the 404 page's HTML. Chromium drew it in "Times New
       Roman" and threw "Failed to fetch dynamically imported module" on 23 September.
       The site is only ever served at the root of its
       host, so nothing else moves. `test/not-found-depth.test.mjs` holds the built page to it. */
    paths: { relative: false },
    /* EVERY STYLESHEET IS IN THE PAGE, not linked beside it. Linked, a phone waited on six to eight more round trips
       before it drew a word, and Lighthouse put the docs under 95 for it; inlined, the first bytes are the finished page,
       and the docs' block sheets add about 20 KB to a docs page once compressed. No `style-src` is set in `csp`, so an
       inline style needs no hash. */
    inlineStyleThreshold: Infinity,
    /* THE SCRIPT POLICY IS HERE AND NOT IN `static/_headers`, because a header cannot name the one
       script that has to run. Every page carries an inline `<script>` that starts SvelteKit, and a
       header of `script-src 'self'` blocked it on 23 September: the console logged the violation and
       pressing "Solo founder" in the hero left "Personal" selected. `mode: 'hash'` writes the
       sha256 of that script into each prerendered page's `<meta http-equiv>`, so it runs and an
       injected one does not. `frame-ancestors` is ignored in a meta policy, so it stays a header;
       `test/one-origin.test.mjs` holds both halves. */
    csp: {
      mode: 'hash',
      directives: { 'script-src': ['self'], 'object-src': ['none'], 'base-uri': ['self'] },
    },
  },
  compilerOptions: {
    css: 'external',
  },
};
