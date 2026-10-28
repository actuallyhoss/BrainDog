/**
 * A screen, drawn with no browser: the web's own parts (`shell/SideBar.svelte`, `PageView.svelte`) compiled for the server and
 * rendered from a `boot` a host answered, then read into the snapshot `first-screen.mjs` judges (`{ path, width, text,
 * roles, counts }`). Five of the seven first-screen checks read nothing because no screen was
 * handed in, and the rail's Pages heading and Today's line on the vital signs were among what nobody read.
 *
 * WHAT IS REAL AND WHAT IS NOT. The markup is the product's: the same components, the same readers the layout and Home
 * call (`flatNav`, `railOf`, `holdsOf`, `todayHome`, `homeDrawn`), fed by the record's own answers. What is not here is
 * a browser: no layout, no style, no effect and no press. So a thing drawn only after an effect ran, or hidden by a
 * style sheet alone, is not judged by this file, and a width is a word the caller says, never something measured.
 *
 * THE HOOKS are registered once, on the first draw, and stay for the life of the process: `.svelte` and `.svelte.ts`
 * are compiled for the server, `$lib` is the web's `src/lib`, a style sheet is nothing, and `$app/*` is the small
 * stand-in below (the page's data and address, set before each draw; a navigation that goes nowhere).
 */

import { readFileSync } from 'node:fs';
import { createRequire, registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = new URL('../../../apps/web/', import.meta.url);
const LIB = new URL('src/lib/', WEB);
const fromWeb = createRequire(new URL('package.json', WEB));

/** The address a stand-in is served under, and what each one holds. */
const STAND_IN = 'braindog-draw:';
const HOLDER = '__braindogDrawnPage';
const STAND_INS = {
  '$app/state': `export const page = globalThis.${HOLDER}; export const navigating = { from: null, to: null, type: null, complete: null }; export const updated = { current: false, check: async () => false };`,
  '$app/navigation': `const nothing = async () => {}; export const goto = nothing, invalidate = nothing, invalidateAll = nothing, preloadData = nothing, preloadCode = nothing, pushState = () => {}, replaceState = () => {}, beforeNavigate = () => {}, afterNavigate = () => {}, onNavigate = () => {}, disableScrollHandling = () => {};`,
  '$app/environment': `export const browser = false, dev = false, building = false, version = 'drawn';`,
  '$app/paths': `export const base = '', assets = ''; export const resolve = (p) => p, asset = (p) => p;`,
  '$app/stores': `const of = (v) => ({ subscribe(f) { f(v); return () => {}; } }); export const page = of(globalThis.${HOLDER}), navigating = of(null), updated = of(false);`,
};

/** The page every drawn part reads through `$app/state`: one object, filled before each draw. */
const drawnPage = (globalThis[HOLDER] ??= { data: {}, url: new URL('http://localhost/'), params: {}, route: { id: null }, state: {}, form: null, error: null, status: 200 });

let hooked = null;

/**
 * Register the hooks (once) and answer the server renderer the web itself uses. A caller that loads one of the web's
 * rune modules itself (`nav-prefs.svelte.ts`) waits on this first, or Node loads it uncompiled and `$state` is no name.
 */
export async function hooks() {
  if (hooked) return hooked;
  const { compile, compileModule } = fromWeb('svelte/compiler');
  registerHooks({
    resolve(specifier, context, next) {
      if (Object.hasOwn(STAND_INS, specifier)) return { url: `${STAND_IN}${specifier}`, format: 'module', shortCircuit: true };
      if (specifier === '$lib' || specifier.startsWith('$lib/')) return next(new URL(specifier.slice(5) || 'index.ts', LIB).href, context);
      /* A style sheet is nothing here, and so is the one module that only gathers them through the bundler's glob. */
      if (/\.(css|scss)(\?.*)?$/u.test(specifier) || /(^|\/)kinds\/styles\.ts$/u.test(specifier)) return { url: `${STAND_IN}style`, format: 'module', shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.startsWith(STAND_IN)) return { format: 'module', source: STAND_INS[url.slice(STAND_IN.length)] ?? 'export default {};', shortCircuit: true };
      const bare = url.split('?')[0];
      if (bare.endsWith('.svelte')) {
        const filename = fileURLToPath(bare);
        return { format: 'module', source: compile(readFileSync(filename, 'utf8'), { generate: 'server', filename, css: 'external' }).js.code, shortCircuit: true };
      }
      if (/\.svelte\.(ts|js)$/u.test(bare)) {
        const filename = fileURLToPath(bare);
        const text = readFileSync(filename, 'utf8');
        /* The types go first, as Node strips them, and then the runes are compiled: the compiler reads no TypeScript here. */
        const plain = bare.endsWith('.ts') ? stripTypeScriptTypes(text, { mode: 'strip' }) : text;
        return { format: 'module', source: compileModule(plain, { generate: 'server', filename }).js.code, shortCircuit: true };
      }
      return next(url, context);
    },
  });
  const { render } = await import(pathToFileURL(fromWeb.resolve('svelte/server')).href);
  hooked = { render };
  return hooked;
}

/** One of the web's own modules, by its path under `apps/web/src`, loaded after the hooks are in. */
const web = (path) => import(new URL(`src/${path}`, WEB).href);

/** A part's markup: the part by its path under `apps/web/src`, its props, and the page it is drawn on. */
export async function markupOf(part, props, at = {}) {
  const { render } = await hooks();
  drawnPage.data = at.data ?? {};
  drawnPage.url = new URL(at.path ?? '/', 'http://localhost');
  const { default: Part } = await web(part);
  return render(Part, { props }).body;
}
