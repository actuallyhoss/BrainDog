import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import adapter from '@sveltejs/adapter-static';

const SUFFIX = [process.env.BRAINDOG_VARIANT, process.env.BRAINDOG_ENV].filter(Boolean).join('-');
const OUT = SUFFIX ? `build-${SUFFIX}` : 'build';

/* THE APP LIVES AT `brain.dog/app`, AND ITS FILES LIVE AT `build/app` (`loop/research-one-domain.md` §2.2). The Worker's
   asset directory stays `build/`, so `/app/_app/x.js` is `build/app/_app/x.js` and the marketing site's own `/_app/*`
   never reaches the product. `lib/at.ts` holds the same word as `BASE`, and a test holds the two equal. */
const BASE = '/app';
const PAGES = `${OUT}${BASE}`;

/**
 * `adapter-static`, with the two things the base path costs it.
 *
 * THE ROOT IS EMPTIED FIRST. The adapter empties `build/app` and nothing above it, so a tree built before the move kept
 * `build/index.html` and `build/_app/` beside the new build, and the gates' freshness check read that `index.html`.
 *
 * `_headers` GOES BACK TO THE ROOT. Cloudflare reads the file at the top of the asset directory and nowhere else, and
 * `static/` is copied under the base with everything in it, so left where the adapter put it the immutable rule would
 * apply to nothing and every hashed chunk would be served `max-age=0` again.
 */
const shipped = adapter({
  pages: PAGES,
  assets: PAGES,
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
    const headers = join(PAGES, '_headers');
    if (existsSync(headers)) renameSync(headers, join(OUT, '_headers'));
  },
};

/**
 * A static shell. `fallback: 'index.html'` and `ssr = false` build one `build/` directory that both
 * hosts serve unchanged — the Worker's ASSETS binding and the self-host's disk root — and no request
 * is ever rendered on a server (50 §13 D1, D2). Neither host holds a path list: `src/routes/**` is
 * the only one (19 §5).
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
  kit: {
    /* A VARIANT BUILD GOES SOMEWHERE ELSE. `adapter-static` writes the pages, not Vite's `outDir`, so
       `BRAINDOG_VARIANT=cloud` would otherwise overwrite the shipped record's build — and the next
       gate to run would measure the wrong one silently. The default is unchanged.
       `BRAINDOG_ENV=alpha` goes to `build-alpha` for the same reason: `env.alpha` in the Worker's
       wrangler file serves that directory, so an alpha build can never replace production's. */
    adapter: atBase,
    paths: { base: BASE },
    alias: { $lib: 'src/lib' },
    files: { assets: 'static' },
    version: { pollInterval: 0 },
  },
  compilerOptions: {
    // One stylesheet the linter can attribute every declaration to a file (22 §2).
    css: 'external',
    /* NO `window.__svelte.v` MARKER. It is a chunk of its own in the entry graph, read by nothing this
       app ships, and the entry bundle has a budget. */
    discloseVersion: false,
  },
};
