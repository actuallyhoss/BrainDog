import adapter from '@sveltejs/adapter-static';

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
    adapter: adapter({ precompress: false, strict: true }),
    alias: { $lib: 'src/lib' },
    files: { assets: 'static' },
    prerender: { entries: ['*'] },
  },
  compilerOptions: {
    css: 'external',
  },
};
