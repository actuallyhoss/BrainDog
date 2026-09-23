import adapter from '@sveltejs/adapter-static';

const OUT = process.env.BRAINDOG_ENV ? `build-${process.env.BRAINDOG_ENV}` : 'build';

/**
 * PRERENDERED, and every page of it.
 *
 * The record app is a static shell that hydrates because it renders data that changes while you are
 * looking at it. A marketing page renders sentences that change when somebody edits this repository,
 * so it is HTML on disk: no fallback, no client router by default, and the whole site readable with
 * scripting off. That is not austerity for its own sake — the first thing a landing page has to do
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
    prerender: { entries: ['*', '/legal'] },
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
