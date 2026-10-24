import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

import { ENVIRONMENTS } from '@braindog/theme';

import { ownWordsOf } from './src/lib/shot/own-words.ts';

/**
 * WHICH DEPLOYMENT THIS BUILD IS FOR — `BRAINDOG_ENV`, and `src/lib/env.ts` has described this
 * substitution in the present tense since it was written. It did not exist. `__BRAINDOG_ENV__` was
 * declared in `app.d.ts`, read in `env.ts`, and defined by nothing: `typeof __BRAINDOG_ENV__` was
 * `'undefined'` in every build there has ever been, `named` was permanently `false`, and the
 * environment mechanism was four halves — a measured accent, a generated stylesheet, a favicon and
 * a label — with no build that could switch any of them on.
 *
 * IT THROWS ON A VALUE IT DOES NOT KNOW, which is the check `env.ts` says happens "earlier and
 * better" than a runtime membership test. A typo in a deploy command is a build that fails here,
 * loudly, rather than a deployment that quietly ships production's chrome under alpha's hostname —
 * and a runtime check could not replace it without costing the fold that keeps alpha's chrome out
 * of the production bundle entirely.
 *
 * `ENVIRONMENTS` comes from `@braindog/theme` rather than being retyped, because the package that
 * decides which deployments have a PALETTE is the one that decides which are deployments. 50 §1
 * admits `@braindog/theme` for the build; this is the build.
 */
const ENV = process.env.BRAINDOG_ENV ?? '';
if (ENV !== '' && !(ENVIRONMENTS as readonly string[]).includes(ENV))
  throw new Error(
    `BRAINDOG_ENV is ${JSON.stringify(ENV)}, and the deployments are ${ENVIRONMENTS.join(', ')} or nothing for production.`,
  );

/**
 * AND THE PALETTE FOLLOWS THE ENVIRONMENT, by resolving one specifier to a different file.
 *
 * `packages/theme` has generated `alpha.css` since the accent was measured, and nothing could load
 * it: `tokens.css` `@import`ed `house.css` on every app's behalf, so a deployment's colours were
 * decided by a file shared with every other deployment. The layout imports the palette by name now
 * and this line is what makes the name mean the right file — one palette in the bundle, chosen at
 * build time, with nothing to switch at run time.
 */
const PALETTE = fileURLToPath(new URL(`../../packages/skin/${ENV === '' ? 'house' : ENV}.css`, import.meta.url));

/**
 * WHERE `/api` AND `/auth` GO WHEN VITE SERVES THIS APP: `BRAINDOG_API`, or a record on this machine.
 *
 * BOTH, BECAUSE SIGN-IN IS SAME-ORIGIN TOO. `/auth/*` sets the session cookie and `/api/*` reads it, so
 * a proxy that forwarded one and not the other would sign somebody in to a record the lists cannot read.
 * `/account/*` reads the same cookie, so `/usage` goes the same way.
 *
 * The register list reads the record from its own origin, as it does on both hosts, so under
 * `vite dev` and `vite preview` something has to answer `/api/*` from this origin. `node
 * tools/gates/record.mjs` serves the seed on 8787, which is also where `wrangler dev` listens, and
 * `BRAINDOG_API` points it anywhere else. Nothing listening is not a failure: the proxy answers with
 * an error page, the client reads that as `UNREACHABLE`, and the screen says the record was not reached.
 */
const API = process.env.BRAINDOG_API ?? 'http://127.0.0.1:8787';

/**
 * EACH ROUTE'S PRELOAD LIST LEAVES OUT WHAT THE ROOT LAYOUT'S LIST ALREADY NAMES.
 *
 * The generated app entry carries one list of chunks per route node, and it counts against the entry
 * budget. The root layout is node 0, and Kit asks for it in the same tick as every other node, on the
 * first load and on every navigation, so its list has already started each chunk it names: repeating
 * them in twenty other lists preloaded nothing and cost bytes in the one file every visit downloads.
 *
 * ONLY SCRIPTS, AND ONLY ONCE NODE 0 HAS BEEN SEEN. Vite hands this the script dependencies and keeps
 * stylesheets itself, so a route's styles still wait before it draws. The lists are resolved in the
 * order the imports appear, node 0 first; were that ever not so, nothing is removed.
 */
const layoutDeps = new Map<string, Set<string>>();

/**
 * AND NO LIST NAMES A CHUNK THE ENTRY ITSELF IMPORTS. Those are running before any list is read, so
 * naming them preloads nothing. The set is read from the bundle before Vite writes the lists.
 */
const entryGraph = new Set<string>();
const entryGraphPlugin: Plugin = {
  name: 'braindog:entry-graph',
  generateBundle: {
    order: 'pre',
    handler(_, bundle) {
      entryGraph.clear();
      const walk = (file: string) => {
        const chunk = bundle[file];
        if (entryGraph.has(file) || chunk?.type !== 'chunk') return;
        entryGraph.add(file);
        for (const next of chunk.imports) walk(next);
      };
      for (const [file, chunk] of Object.entries(bundle)) if (chunk.type === 'chunk' && chunk.isEntry) walk(file);
    },
  },
};

function resolveDependencies(file: string, deps: string[], { hostId, hostType }: { hostId: string; hostType: 'html' | 'js' }) {
  if (hostType !== 'js') return deps;
  const kept = deps.filter((d) => d === file || !entryGraph.has(d));
  if (/(?:^|\/)nodes\/0\.[\w-]+\.js$/u.test(file)) {
    layoutDeps.set(hostId, new Set(kept));
    return kept;
  }
  const layout = layoutDeps.get(hostId);
  return layout ? kept.filter((d) => d === file || !layout.has(d)) : kept;
}

/**
 * AND NO ROUTE'S LIST NAMES A STYLESHEET THE ROOT LAYOUT'S LIST ALREADY NAMES.
 *
 * Vite appends each node's stylesheets after `resolveDependencies` has run, so the rule above cannot reach them, and
 * with the kernel out of the shell the shell's own components (`Icon`, `Kbd`, `Button`) each got a stylesheet of their
 * own that forty route lists then repeated in the entry, 154 bytes past its recorded number. Kit draws a route only
 * once every node of it has loaded, node 0 first among them, and node 0's load waits for its stylesheets; on a later
 * navigation they are already in the page. So a repeat holds nothing back that the root list does not already hold.
 *
 * ONLY IN THE CHUNK THAT CARRIES NODE 0'S LIST, the generated app entry, and only after Vite has written the lists.
 * A list is rewritten by index into the one table Vite emits, so a name the root list does not carry is never touched.
 */
const layoutCssPlugin: Plugin = {
  name: 'braindog:layout-css-once',
  generateBundle: {
    order: 'post',
    handler(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const table = /m\.f\|\|\(m\.f=(\[[^\]]*\])\)/u.exec(chunk.code);
        if (table === null) continue;
        const files: string[] = JSON.parse(table[1] ?? '[]');
        const CALL = /__vite__mapDeps\(\[([0-9,]*)\]\)/gu;
        const lists = [...chunk.code.matchAll(CALL)].map((m) => (m[1] ?? '').split(',').filter(Boolean).map(Number));
        const root = lists.find((list) => list.some((i) => /(?:^|\/)nodes\/0\.[\w-]+\.js$/u.test(files[i] ?? '')));
        if (root === undefined) continue;
        const rootCss = new Set(root.filter((i) => files[i]?.endsWith('.css')));
        chunk.code = chunk.code.replace(CALL, (call, ids: string) => {
          const list = ids.split(',').filter(Boolean).map(Number);
          if (list === root || list.some((i) => /(?:^|\/)nodes\/0\.[\w-]+\.js$/u.test(files[i] ?? ''))) return call;
          return `__vite__mapDeps([${list.filter((i) => !rootCss.has(i)).join(',')}])`;
        });
      }
    },
  },
};

/**
 * AND `/app/<slug>/api/*`, AS WRITTEN, TO THE SAME PLACE. Under a slug `apiBase()` (`lib/at.ts`) sends every record
 * call to `/app/<slug>/api/<method>`, and with only `/api` here nothing forwarded it, so a dev tab on
 * `/app/acme/r/tasks` asked Vite for the record and Vite has none. The path is NOT rewritten to `/api`: the record
 * answers it for its own slug and refuses any other, and a proxy that cut the slug off
 * would answer every slug with whichever record is listening, which is the check the path exists to make. A key that
 * opens with `^` is a pattern to Vite (`doesProxyContextMatchUrl`), and every other key is a prefix.
 *
 * THE SEGMENT IS A SLUG BY `SLUG`'S GRAMMAR IN `lib/at.ts`, AND NOT ANY SEGMENT. `api` is a legal register id
 * (`REGISTER_ID` in the kernel), so with `[^/]+` a reload of `/app/r/api/3`, row 3 of that register on a tab with no
 * slug, matched and was sent to the record instead of the app. A slug is at least two characters, so `r`, `p`, `v`
 * and the other one-letter routes can never be one.
 */
/* `/app/drawn-frame` IS THE HOSTS' TOO: the frame a drawn block is drawn in is answered from code under its own policy
   (`@braindog/host/drawn-frame`), and Vite would answer it with the shell, which in that sandbox posts nothing. */
const PROXY = { '/api': API, '/auth': API, '/account': API, '/app/catalogue': API, '^/app/drawn-frame$': API, '^/app/[a-z][a-z0-9-]{0,30}[a-z0-9]/api/': API };

/**
 * `virtual:own-words` IS THE SET OF TEXTS THE COPY FILES TYPE WHOLE, which is what screenshot mode needs
 * to tell the product's words from a record's (`src/lib/shot/plate.ts` plates every text not in it).
 *
 * THE FILES ARE READ AS TEXT AND NEVER RUN (`ownWordsOf`, `src/lib/shot/own-words.ts`): a sentence inside
 * a function is in no value an import could give. Every `.ts` file under `src/lib/copy` is read, folders
 * and all. A test file is left out, because its fixtures are made-up record words and must stay plated.
 *
 * THE DEFAULT EXPORT IS A `Set<string>`, built when the module is first imported, in sorted order so two
 * builds of the same copy are the same bytes. Each file is watched, so under `vite dev` a reworded
 * sentence is an own word on the next load.
 */
const COPY = fileURLToPath(new URL('./src/lib/copy', import.meta.url));
const OWN_WORDS = 'virtual:own-words';
const copyFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((at) => (at.isDirectory() ? copyFiles(join(dir, at.name)) : [join(dir, at.name)]))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    .sort();
const ownWordsPlugin: Plugin = {
  name: 'braindog:own-words',
  resolveId: (id) => (id === OWN_WORDS ? `\0${OWN_WORDS}` : null),
  load(id) {
    if (id !== `\0${OWN_WORDS}`) return null;
    const files = copyFiles(COPY);
    for (const file of files) this.addWatchFile(file);
    const own = [...ownWordsOf(files.map((file) => readFileSync(file, 'utf8')))].sort();
    return `export default new Set(${JSON.stringify(own)});`;
  },
};

/**
 * THE SVELTE RUNTIME ONLY ROUTES CALL IS A CHUNK OF ITS OWN, OUTSIDE THE ENTRY.
 *
 * Every component imports `svelte/internal/client`, a barrel that re-exports the whole runtime, so to the bundler every
 * runtime module is reached from the entry and lands in the shared chunk the entry imports, whoever calls it. List
 * motion (`lib/ui/motion.ts`) put `transition` and its frame loop there, 1.4 KB brotli the boot never runs. These are
 * the modules nothing in the entry (Kit's client, `root.svelte`) calls. The root layout imports this chunk, so the shell
 * still names it among the layout's modulepreloads and it arrives in the same wave as before. `svelte:element` is one of
 * them because it imports `transitions.js`; left in the shared chunk it would pull this chunk back into the entry.
 *
 * THREE THINGS MAKE IT HOLD. The modules are marked free of side effects (their top level declares and nothing more), or
 * the barrel would keep a bare import of this chunk to run them in order. The group takes only these modules, not what
 * they import, since that is the runtime itself. And taking only them needs `preserveEntrySignatures` looser than Kit's
 * `strict`: `allow-extension` lets an entry chunk export more than its module did, which Kit never reads. Client build
 * only; the server build is untouched.
 */
const ROUTE_RUNTIME =
  /[\\/]svelte[\\/]src[\\/]internal[\\/]client[\\/](?:loop|dom[\\/]elements[\\/](?:transitions|actions|bindings[\\/](?:input|size|universal))|dom[\\/]blocks[\\/](?:svelte-element|await|svelte-head|key))\.js$/u;
const routeRuntimePlugin: Plugin = {
  name: 'braindog:route-runtime',
  apply: 'build',
  applyToEnvironment: (environment) => environment.name === 'client',
  transform: { filter: { id: ROUTE_RUNTIME }, handler: (code) => ({ code, map: null, moduleSideEffects: false }) },
  options: (options) => ({ ...options, preserveEntrySignatures: 'allow-extension' }),
  outputOptions: (output) => ({
    ...output,
    codeSplitting: { groups: [{ name: 'route-runtime', test: ROUTE_RUNTIME, includeDependenciesRecursively: false }] },
  }),
};

export default defineConfig({
  plugins: [sveltekit(), entryGraphPlugin, layoutCssPlugin, ownWordsPlugin, routeRuntimePlugin],
  /* `__BRAINDOG_BUILD__` IS THE DEPLOY'S BUILD TUPLE, the one the Worker answers `/api/version` with as `app`, so a tab can
     tell it is running an older build than the one live (`newerBuild` in `lib/data/live.ts`). Empty in a build without one,
     which compares nothing. */
  define: { __BRAINDOG_ENV__: JSON.stringify(ENV), __BRAINDOG_BUILD__: JSON.stringify(process.env.BRAINDOG_BUILD ?? '') },
  resolve: { alias: [{ find: '@braindog/skin/house.css', replacement: PALETTE }] },
  /* `/app/catalogue` AND NOT `/catalogue`: the app is served under `/app` (`svelte.config.js`) and asks for the catalogue
     there (`routes/packs/browse/catalogue.ts`), so a proxy on the old path forwarded nothing. The sign-in and the
     account stay at the root, and so does the record for a tab with no slug. */
  server: { port: 5183, strictPort: true, proxy: PROXY },
  preview: { port: 5183, strictPort: true, proxy: PROXY },
  build: { target: 'es2022', cssMinify: 'lightningcss', modulePreload: { resolveDependencies } },
});
