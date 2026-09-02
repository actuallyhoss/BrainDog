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
    adapter: adapter({ fallback: 'index.html', precompress: false, strict: false }),
    alias: { $lib: 'src/lib' },
    files: { assets: 'static' },
    version: { pollInterval: 0 },
  },
  compilerOptions: {
    // One stylesheet the linter can attribute every declaration to a file (22 §2).
    css: 'external',
  },
};
