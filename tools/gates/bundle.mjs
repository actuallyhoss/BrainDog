/**
 * `bundle` — the size budget, measured from the ENTRY GRAPH rather than from the output directory.
 *
 * A size budget that only warns is a size budget that is exceeded, so this exits non-zero. And it
 * measures the right thing: the total of `build/` is nineteen code-split routes, and what a person
 * waits for is the entry chunk and everything statically reachable from it. Adding a screen must
 * not be able to move this number.
 *
 * Budgets are 22 §9 and 50 §7. `--report` prints the rows without failing.
 *
 *   node tools/gates/bundle.mjs [--report]
 */

import { readFile, stat } from 'node:fs/promises';
import { brotliCompressSync, constants } from 'node:zlib';
import { join } from 'node:path';

import { budget } from './lib.mjs';

const APP = join(process.cwd(), 'apps/web');
const CLIENT = join(APP, '.svelte-kit/output/client');
const BUILD = join(APP, 'build');

const B = budget('bundle');

const brotli = (buf) =>
  brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: B.brotliQuality } }).length;

const KB = (n) => `${(n / 1024).toFixed(1)} KB`;

let manifest;
try {
  manifest = JSON.parse(await readFile(join(CLIENT, '.vite/manifest.json'), 'utf8'));
} catch {
  /* EXIT 3 IS A SKIP, NOT A PASS. Exiting 0 with no build made `pnpm gates` report ten gates
     passed on a fresh checkout while three of them had examined nothing — the same silence the
     self-test exists to break, one level up. The runner names a skip and is red under CI. */
  console.log('  bundle: no build to measure — run `pnpm --filter @braindog/web build` first');
  process.exit(3);
}

/** Everything statically reachable from an entry. A dynamic import is a separate chunk by design. */
function reach(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  const node = manifest[key];
  if (!node) return seen;
  seen.add(key);
  for (const dep of node.imports ?? []) reach(dep, seen);
  return seen;
}

/**
 * The TWO Kit entries, not every `isEntry` in the manifest.
 *
 * SvelteKit marks every route component `isEntry` so it can be preloaded, so summing them measures
 * the whole application and any new screen moves the number. What a person waits for is
 * `entry/start` and `entry/app` plus everything statically reachable from them; a route module is
 * fetched when its route is, which is the point of splitting them.
 */
const entries = Object.keys(manifest).filter((k) => /_app\/immutable\/entry\//.test(manifest[k].file ?? ''));
const reachable = new Set();
for (const e of entries) for (const k of reach(e)) reachable.add(k);

let js = 0;
for (const key of reachable) {
  const node = manifest[key];
  if (node.file?.endsWith('.js')) js += brotli(await readFile(join(CLIENT, node.file)));
}

/**
 * "Main CSS" is the ROOT LAYOUT's stylesheet: `app.css`, the generated theme, the block contract,
 * the row shape, and the shell's own components. Every other stylesheet arrives with the route that
 * needs it, which is what `css: 'external'` plus route splitting buys.
 */
// SvelteKit numbers its route nodes and node 0 is the root layout, so `assets/0.*.css` is the
// stylesheet every screen pays for. Everything else is a route's own.
const allCss = [...new Set(Object.values(manifest).flatMap((n) => n.css ?? []))];
const isMain = (f) => /assets\/0\.[^/]*\.css$/.test(f);

let css = 0;
let routeCss = 0;
for (const f of allCss) {
  const size = brotli(await readFile(join(CLIENT, f)));
  if (isMain(f)) css += size;
  else routeCss += size;
}

const shell = brotli(await readFile(join(BUILD, 'index.html')));

const font = async (f) => (await stat(join(BUILD, 'fonts', f))).size;

/**
 * The font budget is SPLIT, and that is a recorded deviation rather than a moved goalpost.
 *
 * 22 §9 budgets "≤ 45 KB total, 2 files", assuming ONE Latin face plus Arabic. This ships two Latin
 * faces on purpose: a workhorse that has to hold up at 11px with tabular figures, and a display face
 * used only above 20px because it is the wordmark's own. So the workhorse keeps the original 45 KB
 * and the display face gets its own small budget, which is the honest way to say "we chose to spend
 * eight more kilobytes" instead of quietly widening one number to 55.
 *
 * Arabic is not in either row: `unicode-range` is evaluated per page, so an English-only session
 * never fetches it.
 */
/**
 * A row may carry a BASELINE: a recorded number the gate fails above, when the budget is already
 * exceeded by something outside this repository's control.
 *
 * That is not the same as widening the budget, and the difference matters. The budget stays 30 KB and
 * still prints, the cause is named, and the gate's job becomes catching GROWTH. Move the budget
 * instead and the number stops meaning anything the first time somebody is in a hurry.
 */
const ROWS = [
  {
    name: 'entry JS, brotli',
    size: js,
    budget: B.mainJsBrotli,
    // The measurement and the argument are in `budgets.json` beside the number, which is where a
    // reviewer widening it would have to read them.
    baseline: B.mainJsBaseline,
    note: "Kit's runtime alone; the interpreter is 19.3 of it",
  },
  { name: 'entry CSS, brotli', size: css, budget: B.mainCssBrotli, note: 'tokens, a11y, blocks, rows and the shell' },
  { name: 'index.html, brotli', size: shell, budget: B.htmlBrotli, note: 'it carries no record state' },
  { name: 'UI face (Plex)', size: await font('plex-sans.woff2'), budget: B.uiFaceBytes, note: "22 §9's budget, unchanged" },
  { name: 'display face (Poppins)', size: await font('poppins-600.woff2'), budget: B.displayFaceBytes, note: 'nothing below 20px' },
];

const report = process.argv.includes('--report');
let failed = 0;

console.log();
for (const { name, size, budget, baseline, note } of ROWS) {
  const within = size <= budget;
  const ok = within || (baseline !== undefined && size <= baseline);
  if (!ok && !report) failed++;
  const mark = within ? 'ok  ' : ok ? 'over' : 'FAIL';
  const tail = within ? note : `RECORDED, fails above ${KB(baseline ?? budget)} — ${note}`;
  console.log(`  ${mark}  ${name.padEnd(22)} ${KB(size).padStart(9)} / ${KB(budget).padStart(9)}   ${tail}`);
}
console.log(
  `\n  ${entries.length} entry chunks, ${reachable.size} statically reachable.` +
    ` ${KB(routeCss)} more CSS arrives with the routes that need it.\n`,
);

if (failed) {
  console.error(
    '  bundle: budget(s) exceeded. A budget that only warns is a budget that is exceeded.\n' +
      "  For entry JS the recorded path is NOT a bigger budget: it is `hydrate()` from svelte plus a\n" +
      '  60-line router with the route files as a table, which is why the app was kept off SvelteKit\'s\n' +
      '  data-loading conventions in the first place (50 §10).',
  );
  process.exitCode = 1;
}
