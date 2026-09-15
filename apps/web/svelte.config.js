import adapter from '@sveltejs/adapter-static';

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
       gate to run would measure the wrong one silently. The default is unchanged. */
    adapter: adapter({
      pages: process.env.BRAINDOG_VARIANT ? `build-${process.env.BRAINDOG_VARIANT}` : 'build',
      assets: process.env.BRAINDOG_VARIANT ? `build-${process.env.BRAINDOG_VARIANT}` : 'build',
      fallback: 'index.html',
      precompress: false,
      strict: false,
    }),
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
