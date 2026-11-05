import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
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
 *
 * THAT RULE IS FOR THE LISTS IN KIT'S APP ENTRY ALONE (speed3, 2 Nov). With Rolldown every route node is an entry, so
 * `entryGraph` is every chunk any route reaches, and a list anywhere else that dropped it named its target and nothing
 * more: Home's `import()` of the page reader found the reader's ~90 chunks a level later, once the reader had landed. A
 * list outside Kit's entry now leaves out only what its own chunk already has in hand (`hostGraph`), and costs the entry
 * nothing. Cold Today on a throttled phone over HTTP/2, 2056 to 1777 ms; Work 2386 to 2106 (loop/speed3-2026-11-02).
 * The entry's own lists stay as they were: whole lists there were 5 KB past its fail line.
 */
const entryGraph = new Set<string>();

/**
 * THE LIGHT FRAME'S LIST CARRIES WHAT SIGN-IN AND SIGN-UP IMPORT. A route's own list names no chunk a route shares (the
 * rule above), so sign-in's imports arrived one level at a time, five round trips deep, before its field drew. The light
 * frame (`lib/shell/LightFrame.svelte`) is asked for by the root load on those screens only (`lib/shell/light.ts`), so
 * its list preloads every chunk the light screens import but Kit's entry, all at once; the few one of them needs and the
 * other does not are a few kilobytes, and a stranger on one of them is likely to open the other. The list is in the root
 * layout's chunk, not the entry, so it costs the entry nothing.
 *
 * NOT THE APP'S FRAME. Its list was tried the same way, and a cold Today on a throttled phone drew no sooner: the screen
 * waits on its own reads, not on the frame's chunks.
 */
const lightFrame = new Set<string>();
const kitEntry = new Set<string>();
const lightDeps = new Set<string>();
const LIGHT_FRAME = /[\\/]src[\\/]lib[\\/]shell[\\/]LightFrame\.svelte$/u;
const LIGHT_PAGE = /[\\/]src[\\/]routes[\\/](?:signin|signup)[\\/](?:desktop[\\/])?\+page\.svelte$/u;

const entryGraphPlugin: Plugin = {
  name: 'braindog:entry-graph',
  generateBundle: {
    order: 'pre',
    handler(_, bundle) {
      entryGraph.clear();
      lightFrame.clear();
      kitEntry.clear();
      lightDeps.clear();
      hostGraphs.clear();
      bundleSeen = bundle;
      const walk = (into: Set<string>, file: string) => {
        const chunk = bundle[file];
        if (into.has(file) || chunk?.type !== 'chunk') return;
        into.add(file);
        for (const next of chunk.imports) walk(into, next);
      };
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        if (chunk.isEntry) walk(entryGraph, file);
        if (/(?:^|\/)entry\/(?:start|app)\.[\w-]+\.js$/u.test(file)) walk(kitEntry, file);
        if (chunk.facadeModuleId !== null && LIGHT_FRAME.test(chunk.facadeModuleId)) lightFrame.add(file);
      }
      for (const chunk of Object.values(bundle))
        if (chunk.type === 'chunk' && chunk.moduleIds.some((id) => LIGHT_PAGE.test(id))) for (const dep of chunk.imports) walk(lightDeps, dep);
      for (const file of kitEntry) lightDeps.delete(file);
    },
  },
};

/**
 * WHAT A CHUNK OUTSIDE KIT'S ENTRY HAS IN HAND WHEN ITS `import()` RUNS: Kit's entry and its own static graph. Its lists
 * leave out those and nothing more, read once per chunk from the bundle `entryGraphPlugin` saw.
 */
const hostGraphs = new Map<string, Set<string>>();
let bundleSeen: Record<string, { type: string; imports?: string[] }> = {};
const hostGraph = (host: string): Set<string> => {
  let got = hostGraphs.get(host);
  if (got !== undefined) return got;
  got = new Set(kitEntry);
  const walk = (file: string) => {
    const chunk = bundleSeen[file];
    if (got!.has(file) || chunk?.type !== 'chunk') return;
    got!.add(file);
    for (const next of chunk.imports ?? []) walk(next);
  };
  walk(host);
  hostGraphs.set(host, got);
  return got;
};

function resolveDependencies(file: string, deps: string[], { hostId, hostType }: { hostId: string; hostType: 'html' | 'js' }) {
  if (hostType !== 'js') return deps;
  if (lightFrame.has(file)) return [...new Set([...deps.filter((d) => d === file || !kitEntry.has(d)), ...lightDeps])];
  const kept = deps.filter((d) => d === file || !(kitEntry.has(hostId) ? entryGraph : hostGraph(hostId)).has(d));
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
 * AND `/<slug>/api/*`, AS WRITTEN, TO THE SAME PLACE. Under a slug `apiBase()` (`lib/at.ts`) sends every record
 * call to `/<slug>/api/<method>`, and with only `/api` here nothing forwarded it, so a dev tab on
 * `/acme/r/tasks` asked Vite for the record and Vite has none. The path is NOT rewritten to `/api`: the record
 * answers it for its own slug and refuses any other, and a proxy that cut the slug off
 * would answer every slug with whichever record is listening, which is the check the path exists to make. A key that
 * opens with `^` is a pattern to Vite (`doesProxyContextMatchUrl`), and every other key is a prefix.
 *
 * THE SEGMENT IS A SLUG BY `SLUG`'S GRAMMAR IN `lib/at.ts`, AND NOT ANY SEGMENT. `api` is a legal register id
 * (`REGISTER_ID` in the kernel), so with `[^/]+` a reload of `/r/api/3`, row 3 of that register on a tab with no
 * slug, matched and was sent to the record instead of the app. A slug is at least two characters, so `r`, `p`, `v`
 * and the other one-letter routes can never be one.
 */
/* `/drawn-frame` IS THE HOSTS' TOO: the frame a drawn block is drawn in is answered from code under its own policy
   (`@braindog/host/drawn-frame`), and Vite would answer it with the shell, which in that sandbox posts nothing. So is
   `/drawn-frame/file`, where the attachment viewer loads a page saved from Claude: Vite drew the app there, blank; and
   `/drawn-frame/hold`, which holds a provider's player or an attached PDF. */
const PROXY = { '/api': API, '/auth': API, '/account': API, '/oauth': API, '/catalogue': API, '^/drawn-frame(/file|/hold)?$': API, '^/[a-z][a-z0-9-]{0,30}[a-z0-9]/api/': API };

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
 * AND THE KEYED LISTS AND AN ELEMENT'S ATTRIBUTES (speed5, 2 Nov): `{#each}` and `set_attribute`, `class`, `style` with
 * `clsx` under them are on every screen and in nothing Kit's client or `root.svelte` runs, and they were 3.4 KB brotli of
 * the entry, which read 33,854 against its 33,864 line on any build whose hashes happened to brotli worse. Out, the entry
 * is 30,492 and the first load the same 307.0 KB. Tried and left in: `custom-element` (the app entry grew by more than it
 * saved), `snippet`, `legacy-client`, `hydratable`, the `select` and `window` bindings and attachments, each of which the
 * entry calls and so pulled the whole chunk back into it.
 *
 * THREE THINGS MAKE IT HOLD. The modules are marked free of side effects (their top level declares and nothing more), or
 * the barrel would keep a bare import of this chunk to run them in order. The group takes only these modules, not what
 * they import, since that is the runtime itself. And taking only them needs `preserveEntrySignatures` looser than Kit's
 * `strict`: `allow-extension` lets an entry chunk export more than its module did, which Kit never reads. Client build
 * only; the server build is untouched.
 */
const ROUTE_RUNTIME =
  /[\\/]svelte[\\/]src[\\/]internal[\\/](?:client[\\/](?:loop|dom[\\/]elements[\\/](?:transitions|actions|attributes|class|style|bindings[\\/](?:input|size|universal))|dom[\\/]blocks[\\/](?:svelte-element|await|svelte-head|key|each))|shared[\\/]attributes)\.js$|[\\/]clsx[\\/]dist[\\/]clsx\.mjs$/u;
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

/**
 * THE CLIENT'S ROUTE TABLE, IN THE BROWSER, IS THE NAMES AND THE TWO MARKS IT READS.
 *
 * `@braindog/client` takes `ROUTES` from `@braindog/host/table` for three sets: the method names, which of them write,
 * and which are reads sent as a POST (`NAMES`, `WRITES`, `POST_READS` in `packages/client/src/index.ts`). The table
 * carries every route's line of help and its arguments besides, sixty files of it, and the client is on every screen's
 * first load: about 12 KB brotli of a cold Today was help text the browser never reads (speed-c FL1).
 *
 * SO A BUILD HANDS THE CLIENT THE TABLE ALREADY READ: the real table, imported here at build time, written out as its
 * names with `writes` and `postRead` and nothing else, in the table's order. The table stays the one list; a route added
 * there is in the next build. Only for the client's own import, and only in a build: `vite dev` serves the table whole,
 * so a route added while it runs is known at once. Reading any other field of `ROUTES` in the client needs it here too.
 */
const HOST_TABLE = new URL('../../packages/host/src/table.ts', import.meta.url).href;
const CLIENT_INDEX = /[\\/]packages[\\/]client[\\/]src[\\/]index\.ts$/u;
const ROUTE_MARKS = '\0braindog:route-marks';
const routeMarksPlugin: Plugin = {
  name: 'braindog:route-marks',
  apply: 'build',
  enforce: 'pre',
  resolveId: (id, importer) => (id === '@braindog/host/table' && importer !== undefined && CLIENT_INDEX.test(importer) ? ROUTE_MARKS : null),
  async load(id) {
    if (id !== ROUTE_MARKS) return null;
    const { ROUTES } = (await import(HOST_TABLE)) as { ROUTES: readonly { name: string; writes: boolean; postRead?: true }[] };
    const rows = ROUTES.map((r) => [r.name, (r.writes ? 1 : 0) | (r.postRead === true ? 2 : 0)]);
    return `export const ROUTES = ${JSON.stringify(rows)}.map(([name, m]) => ({ name, writes: (m & 1) === 1, ...(m & 2 ? { postRead: true } : {}) }));`;
  },
};

/**
 * A SCREEN'S CHUNK NAMES EVERY CHUNK IT WAITS FOR, SO THE BROWSER ASKS FOR THEM ALL AT ONCE (speed-c FL2).
 *
 * A module's imports are found only once it has arrived and been read, so a screen whose code is nine imports deep was
 * nine round trips before it could run: Today's node imported 60 chunks and waited on 114, and on a slow phone network
 * every level is half a second or more. Rollup's answer was `hoistTransitiveImports`, on by default, which names a
 * chunk's whole graph in it as bare imports; Rolldown has not got it (it accepts only `false`). And the preload lists
 * cannot carry it: Kit counts every route as an entry, so the rule above (`resolveDependencies`) names no shared chunk
 * in any route's list, and the lists are in the app entry, whose budget has no room for them.
 *
 * SO IT IS DONE HERE, for every chunk a screen or an `import()` starts at: each names, after its own imports, every
 * chunk under it that it does not import already. The browser then reads one level and asks for the rest together.
 * NOTHING RUNS IN ANOTHER ORDER: a module's imports run in the order they are written and each module runs once, and
 * the added ones come after the chunk's own, which have already run every one of them by then. Kit's own entry and
 * what it imports are left alone: the shell asks for those before anything else. The cost is a few bytes for each name,
 * in the chunks that carry them (Today's first load counts three of them), and nothing in the entry. Client build only.
 *
 * MEASURED, cold Today at 390 on a 4x slower CPU and Slow 4G over HTTP/2 with brotli: first paint 5.9 s to 4.9 s with
 * this and FL1's cuts. Whole lists on every `import()` outside the entry were tried as well, which would make a tile
 * one level and not two: the screen settled 0.6 s sooner but painted 0.5 s later, with 3.6 KB more on its first load,
 * since everything the frame's loads ask for then races Today's own chunks. So not those.
 */
const hoistPlugin: Plugin = {
  name: 'braindog:hoist-imports',
  apply: 'build',
  applyToEnvironment: (environment) => environment.name === 'client',
  generateBundle: {
    order: 'post',
    handler(_, bundle) {
      const walk = (into: Set<string>, file: string) => {
        const chunk = bundle[file];
        if (into.has(file) || chunk?.type !== 'chunk') return;
        into.add(file);
        for (const next of chunk.imports) walk(into, next);
      };
      const kit = new Set<string>();
      for (const file of Object.keys(bundle)) if (/(?:^|\/)entry\/(?:start|app)\.[\w-]+\.js$/u.test(file)) walk(kit, file);
      /* EVERY CHUNK AN `import()` LANDS ON, not only those Rolldown calls a dynamic entry (speed-d SD1). A module asked by
         `import()` that a screen also imports statically shares a chunk with others and gets no facade, and that chunk is
         not flagged: Today's page reader (`PageView`) and its read (`page-drawn`) were such chunks, and each went down its
         graph one level at a time, 4 s from asking `page-drawn` to having it on a cold phone. */
      const asked = new Set<string>();
      for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') for (const next of chunk.dynamicImports) asked.add(next);
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !(chunk.isEntry || chunk.isDynamicEntry || asked.has(file)) || kit.has(file)) continue;
        const under = new Set<string>();
        walk(under, file);
        const own = new Set(chunk.imports);
        const more = [...under].filter((dep) => dep !== file && !own.has(dep) && !kit.has(dep));
        if (more.length === 0) continue;
        const from = posix.dirname(file);
        const named = more.map((dep) => {
          const path = posix.relative(from, dep);
          return `import"${path.startsWith('.') ? path : `./${path}`}";`;
        });
        chunk.code += `\n${named.join('')}\n`;
      }
    },
  },
};

/**
 * VITE'S PRELOAD HELPER LOOKS EACH FILE UP ONCE, NOT IN EVERY LINK OF THE PAGE (speed6, 2 Nov). Before it adds a
 * `<link>` for a file a dynamic import needs, the helper walked every `<link>` in the document from the end, reading each
 * one's `href`. The list it walks is live, so after each link it added the next look counted the document again, and a
 * cold Today asks for over 200 files: 30 to 55 ms of a throttled phone's first screen, on every page. The page's own
 * links (the shell's preloads and sheets) are read once, at the first ask; every link the helper adds itself is already
 * in its `seen`, so it is never looked for. A file is still asked once, as before.
 */
const PRELOAD_LOOP = /for \(let i = links\.length - 1; i >= 0; i--\) \{\s*const link = links\[i\];\s*if \(link\.href === dep && \(!isCss \|\| link\.rel === "stylesheet"\)\) return;\s*\}/u;
const preloadOncePlugin: Plugin = {
  name: 'braindog:preload-once',
  enforce: 'post',
  transform(code, id) {
    if (id !== '\0vite/preload-helper.js') return null;
    if (!PRELOAD_LOOP.test(code)) throw new Error("braindog:preload-once: Vite's preload helper changed; read it again before building");
    const once = `let pageLinks = null;function inPage(links, dep, isCss) {if (pageLinks === null) {pageLinks = new Map();for (const l of links) pageLinks.set(l.href, pageLinks.get(l.href) === true || l.rel === "stylesheet");}const sheet = pageLinks.get(dep);return sheet !== undefined && (!isCss || sheet);}`;
    return { code: `${once}${code.replace(PRELOAD_LOOP, 'if (inPage(links, dep, isCss)) return;')}`, map: null };
  },
};

export default defineConfig({
  plugins: [sveltekit(), entryGraphPlugin, layoutCssPlugin, ownWordsPlugin, routeRuntimePlugin, routeMarksPlugin, hoistPlugin, preloadOncePlugin],
  /* `__BRAINDOG_BUILD__` IS THE DEPLOY'S BUILD TUPLE, the one the Worker answers `/api/version` with as `app`, so a tab can
     tell it is running an older build than the one live (`newerBuild` in `lib/data/live.ts`). Empty in a build without one,
     which compares nothing. */
  define: { __BRAINDOG_ENV__: JSON.stringify(ENV), __BRAINDOG_BUILD__: JSON.stringify(process.env.BRAINDOG_BUILD ?? '') },
  resolve: { alias: [{ find: '@braindog/skin/house.css', replacement: PALETTE }] },
  /* `/catalogue` AT THE ROOT, beside the pages: the app is served at the root (`svelte.config.js`) and asks for the
     catalogue there (`routes/packs/browse/catalogue.ts`). It was `/app/catalogue` while the app was under `/app`. The
     sign-in, the account and OAuth are the host's doors at the root, and so is the record for a tab with no slug. */
  server: { port: 5183, strictPort: true, proxy: PROXY },
  preview: { port: 5183, strictPort: true, proxy: PROXY },
  /* `:dir(rtl)` STAYS `:dir(rtl)`. With no targets Lightning CSS rewrites it to `:lang(ar, he, ...)`, so forty rules written
     for a right-to-left screen fired only for a document in one of those languages, and never for English words read
     right to left. 4 is its `Features.DirSelector`; it is not a dependency of this app to import the name from, and every
     browser this app supports has had the selector since 2023. */
  css: { lightningcss: { exclude: 4 } },
  build: { target: 'es2022', cssMinify: 'lightningcss', modulePreload: { resolveDependencies } },
});
