import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';

import adapter from '@sveltejs/adapter-static';

const OUT = process.env.BRAINDOG_ENV ? `build-${process.env.BRAINDOG_ENV}` : 'build';

/* THE TEMPLATE'S OWN INLINE SCRIPT AND STYLE ARE HASHED HERE, because `kit.csp` hashes only what SvelteKit writes
   itself: the boot script is added for us, and the preference reader and the first-paint style in `src/app.html` are
   not. They are read from the file and not copied as literals, so an edit to either one moves its hash with it
   instead of blanking the app. Comments go first, because a comment that spelled a tag would be hashed as one.
   `apps/web/test/csp.test.ts` reads the built shell and fails on any inline script or style this list missed. */
const TEMPLATE = readFileSync(new URL('./src/app.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
/** @param {'script' | 'style'} tag */
const inlineHashes = (tag) =>
  [...TEMPLATE.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map(
    (m) => /** @type {`sha256-${string}`} */ (`sha256-${createHash('sha256').update(m[1] ?? '').digest('base64')}`),
  );

/* EVERY FRAME A PAGE MAY HOLD. The embeds are the origins of `EMBED_PROVIDERS` in `packages/render/src/embed.ts`,
   which the kernel copies and refuses any other against, and `test/csp.test.ts` holds this list equal to that one.
   Turnstile's origin is here for its script and its frame, and the hosts take it out of every page but `/signup` and `/signin`
   (`asPage` in `apps/worker/src/route.ts`); the self-host has no sign-up, so it takes it out everywhere.
   `'self'` IS FOR ONE DOCUMENT, the frame a drawn block is drawn in (`@braindog/host/drawn-frame`), which both hosts serve
   under its own sandboxing policy. Not `srcdoc`: a `srcdoc` frame takes this page's policy, which runs no inline script,
   so a component written into one would never run. Every other page of this origin sends `frame-ancestors 'none'`, so
   naming `'self'` here frames nothing else. */
const TURNSTILE = 'https://challenges.cloudflare.com';
const EMBEDS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://www.loom.com', 'https://www.figma.com', 'https://www.google.com'];

/* THE APP LIVES AT THE ROOT OF `app.brain.dog`, AND ITS FILES AT THE ROOT OF `build/`. It was built under `/app` while
   it shared `brain.dog` with the marketing site, and the site is its own Worker on its own name now, so nothing else
   lives beside it. `lib/at.ts` holds the same base as `BASE`, and a test holds the two equal. */
const BASE = '';

/**
 * `adapter-static`, writing the pages and the files to one folder.
 *
 * THE ROOT IS EMPTIED FIRST. The adapter empties only the folder it writes, and a tree built while the app was under
 * `/app` kept `build/app/` beside the new build, with an `index.html` of its own that nothing serves.
 */
const shipped = adapter({
  pages: OUT,
  assets: OUT,
  fallback: 'index.html',
  precompress: false,
  strict: false,
});
const atBase = {
  name: shipped.name,
  /** @param {import('@sveltejs/kit').Builder} builder */
  async adapt(builder) {
    rmSync(OUT, { recursive: true, force: true });
    await shipped.adapt(builder);
  },
};

/**
 * A static shell. `fallback: 'index.html'` and `ssr = false` build one `build/` directory that both
 * hosts serve unchanged — the Worker's ASSETS binding and the self-host's disk root — and no request
 * is ever rendered on a server (50 §13 D1). Neither host holds a path list: `src/routes/**` is
 * the only one (19 §5).
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
  kit: {
    /* AN ALPHA BUILD GOES SOMEWHERE ELSE. `adapter-static` writes the pages, not Vite's `outDir`, so
       `BRAINDOG_ENV=alpha` goes to `build-alpha`: `env.alpha` in the Worker's wrangler file serves that
       directory, so an alpha build can never replace production's. The record variants the browser gates
       measure were builds here too until the sample went; they are records now
       (`tools/gates/record.mjs`), served beside the one build. */
    adapter: atBase,
    paths: { base: BASE },
    alias: { $lib: 'src/lib' },
    files: { assets: 'static' },
    /* THE WORKER IS REGISTERED BY THE PRESS THAT NEEDS IT, NOT BY EVERY PAGE. At the default of `true`, the mere presence
       of `src/service-worker.ts` puts a `register` call in the shell's inline boot script, and the generated
       `internal.js` read `service_worker: true`: every visitor to every page installed a worker, whether or not they
       ever turned notifications on. `PushToggle.svelte` registers it when he turns notifications on, and `keep` in
       `lib/data/offline.ts` registers it for a record being followed, outside development, for the read copy.
       The file is still built to `service-worker.js` either way, because building it follows the file and
       not this flag. */
    serviceWorker: { register: false },
    version: { pollInterval: 0 },
    /* A CONTENT SECURITY POLICY WITH NO INLINE SCRIPT BUT THE SHELL'S OWN (12 §8). A record draws strangers' text, so
       `script-src` is the backstop behind escaping: nothing injected into a page can run. `mode: 'hash'` because the
       shell is static and a nonce would be the same for every visitor. SvelteKit writes the policy into the shell's
       `<meta>`, and both hosts copy it into the header with `frame-ancestors 'none'`, which a meta tag cannot carry.
       The one named exception is `style-src-attr 'unsafe-inline'`: the renderer's `--cells` and `--magnitude` ride
       a `style` attribute, which no content reaches unescaped (36 §13-10). Themes and the accent are constructed
       sheets and never a `<style>`, so `style-src-elem` needs only the shell's own. */
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        'script-src': ['self', ...inlineHashes('script'), TURNSTILE],
        'style-src-elem': ['self', ...inlineHashes('style')],
        'style-src-attr': ['unsafe-inline'],
        /* `blob:` FOR AN ATTACHED PDF ONLY, which the browser's own viewer draws from a `blob:` the app makes with the type
           `application/pdf` and no other (`lib/attach/AttachmentViewer.svelte`), so a blob in a frame is never a page. */
        'frame-src': ['self', 'blob:', ...EMBEDS, TURNSTILE],
        'object-src': ['none'],
        'base-uri': ['none'],
        /* NO FORM OF THE APP POSTS ANYWHERE: every one is sent by `fetch`. `default-src` does not cover this directive, so a form
           that markup somehow put on the page could otherwise post what it asked for to any host. */
        'form-action': ['self'],
      },
    },
  },
  compilerOptions: {
    // One stylesheet the linter can attribute every declaration to a file (22 §2).
    css: 'external',
    /* NO `window.__svelte.v` MARKER. It is a chunk of its own in the entry graph, read by nothing this
       app ships, and the entry bundle has a budget. */
    discloseVersion: false,
    /* EVERY COMPONENT IN RUNES MODE. Two components with no rune in them compiled in legacy mode, and legacy mode's
       `init` and its before- and after-update queues rode into the Svelte runtime the entry imports: about 200
       brotli bytes on the budget in `bundle.mjs` for two components that use none of it. */
    runes: true,
  },
};
