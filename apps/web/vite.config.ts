import { fileURLToPath } from 'node:url';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

import { ENVIRONMENTS } from '@braindog/theme';

/**
 * WHICH RECORD THIS BUILD SHOWS — `BRAINDOG_VARIANT`, and it exists because three separate findings
 * pointed at the same missing thing.
 *
 * The app renders one seed, so every screen that BRANCHES on a fact about the record has a half no
 * gate can reach: `/search`'s disclosure for a group with no door needs eleven decisions and the seed
 * has four; the two designed empty states on `/settings/agents` need a record with no machines and
 * no keys; and every Cloud sentence needs a record that is not self-hosted. The last of those shipped
 * eight sentences that drew nowhere, and `dead-copy` counted them as rendered because it greps
 * source.
 *
 * A BUILD FLAG RATHER THAN A RUNTIME SWITCH. A `?variant=` parameter would be a product surface
 * nobody asked for, and a `window.__seed` hook would be a dev door shipping to production. `define`
 * substitutes a literal at build time, so the shipped bundle contains one record and the constant
 * folds away — there is nothing to reach at run time because there is nothing there.
 *
 * `''` is the shipped record. Every other value is a variant, and `data.ts` is the only file that
 * reads it.
 *
 * WHERE THE BUILD GOES IS `svelte.config.js`'S, not this file's. `build.outDir` is in SvelteKit's
 * enforced config, so setting it here did nothing except print *"the following Vite config options
 * will be overridden by SvelteKit"* on every build — four times, once per record.
 */
const VARIANT = process.env.BRAINDOG_VARIANT ?? '';

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
 *
 * The register list reads the record from its own origin, as it does on both hosts, so under
 * `vite dev` and `vite preview` something has to answer `/api/*` from this origin. `node
 * tools/gates/record.mjs` serves the seed on 8787, which is also where `wrangler dev` listens, and
 * `BRAINDOG_API` points it anywhere else. Nothing listening is not a failure: the proxy answers with
 * an error page, the client reads that as `UNREACHABLE`, and the list draws the sample.
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

export default defineConfig({
  plugins: [sveltekit(), entryGraphPlugin],
  define: { __BRAINDOG_VARIANT__: JSON.stringify(VARIANT), __BRAINDOG_ENV__: JSON.stringify(ENV) },
  resolve: { alias: [{ find: '@braindog/skin/house.css', replacement: PALETTE }] },
  server: { port: 5183, strictPort: true, proxy: { '/api': API, '/auth': API } },
  preview: { port: 5183, strictPort: true, proxy: { '/api': API, '/auth': API } },
  build: { target: 'es2022', cssMinify: 'lightningcss', modulePreload: { resolveDependencies } },
});
