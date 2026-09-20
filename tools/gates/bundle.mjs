/**
 * `bundle`: the size budget, measured from the ENTRY GRAPH rather than from the output directory.
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

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { brotliCompressSync, constants } from 'node:zlib';
import { join, relative } from 'node:path';

import { budget, skipDir } from './lib.mjs';

const APP = join(process.cwd(), 'apps/web');
const CLIENT = join(APP, '.svelte-kit/output/client');
const MANIFEST = join(CLIENT, '.vite/manifest.json');
const BUILD = join(APP, 'build');

/**
 * THE PREREQUISITE, FOR THE RUNNER TO CHECK RATHER THAN THIS FILE (`52 §5.1` step 2). `run.mjs`
 * reads this before it spawns anything and refuses the gate when there is no build, so the account
 * of an unmet prerequisite no longer comes from the program that did not run.
 *
 * IT IS THE BUILD'S EXISTENCE AND NOT ITS FRESHNESS. The two exit-3 paths below are different
 * questions and both stay here: a manifest with no shell beside it, and a build older than the
 * source it claims to be. Neither is decidable from a directory listing, and a runner that tried
 * to decide them would be a second copy of this gate's judgement kept in step by hand.
 */
export const needs = ['web-build'];

/** A path as a reader would type it, so a finding names the same file on both platforms. */
const shown = (at) => relative(process.cwd(), at).split(/[\\/]/).join('/');

const B = budget('bundle');

const brotli = (buf) =>
  brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: B.brotliQuality } }).length;

const KB = (n) => `${(n / 1024).toFixed(1)} KB`;

/**
 * EVERY SHELL IN THE WORKSPACE, BEFORE ANY NUMBER AND BEFORE A BUILD IS EVEN LOOKED FOR.
 *
 * `app.html` carries `%sveltekit.head%` and `%sveltekit.body%`, and the build replaces the FIRST
 * occurrence of each and leaves the rest. So a second spelling anywhere in that file, in a comment
 * for instance, takes the substitution and the real one ships as literal text. This repository's own
 * `apps/web/src/app.html` did exactly that, to explain itself.
 *
 * WHAT IT COSTS IS EVERYTHING AND IT SAYS NOTHING. The app does not mount: no console error, no
 * page error, an empty screen on every route, a build that succeeds, a typecheck that passes and a
 * deploy that goes out. It reached staging and served there.
 *
 * IT IS COUNTED IN THE SOURCE, WHICH IS THE HALF THIS GATE DID NOT HAVE. Further down, the same
 * defect is caught in `apps/web/build/index.html`, and that check has two limits it does not say out
 * loud: it needs a build, and it is about the one app whose size this gate reports. Exactly one
 * spelling of each name is the only arrangement the substitution can survive, so counting them in
 * the source is the same fact one step earlier, on a file that is always there, for every app in the
 * workspace.
 *
 * AND `apps/site` IS THE APP THAT NEEDED IT. It is a second SvelteKit app, with its own `app.html`
 * carrying twenty lines of comment about Open Graph and colour schemes, and until now nothing in
 * this suite read a line of its source. A site that never mounts is three blank pages on the one
 * surface a stranger sees first.
 *
 * THE SHELLS ARE FOUND RATHER THAN LISTED, so a third app is checked the day it exists and not the
 * day somebody remembers this file. An empty list is a finding for the same reason `clean-room`'s
 * empty tripwire list is: a gate that found nothing to read must not report that it read everything.
 */
const PLACEHOLDERS = ['%sveltekit.head%', '%sveltekit.body%'];
const shells = [];
for (const app of await readdir(join(process.cwd(), 'apps'), { withFileTypes: true }).catch(() => [])) {
  if (!app.isDirectory()) continue;
  const at = join(process.cwd(), 'apps', app.name, 'src', 'app.html');
  if (await stat(at).then((s) => s.isFile(), () => false)) shells.push([`apps/${app.name}/src/app.html`, at]);
}

const shellFindings = [];
if (shells.length === 0) shellFindings.push('no apps/*/src/app.html anywhere, so this gate read no shell at all');
for (const [name, at] of shells) {
  const source = await readFile(at, 'utf8');
  for (const placeholder of PLACEHOLDERS) {
    /* `split` RATHER THAN A REGEX WITH A `g` FLAG, because the names carry a `.` and a `%` and the
       escaping is one more thing that can be wrong in a check whose whole value is that it cannot. */
    const times = source.split(placeholder).length - 1;
    if (times !== 1) shellFindings.push(`${name} spells ${placeholder} ${times} time(s), and the build replaces the first of them`);
  }
}

if (shellFindings.length > 0) {
  console.error('\n  bundle: a shell the build cannot substitute.\n');
  for (const f of shellFindings) console.error(`    ${f}`);
  console.error(
    '\n  The build replaces the FIRST occurrence of each placeholder and leaves the rest, so a\n' +
      '  second spelling anywhere in the file, in a comment for instance, takes the substitution and\n' +
      '  the real one ships as literal text. The app then does not mount at all, on any route, with\n' +
      '  no error anywhere. Spell the two names apart in prose.\n',
  );
  process.exit(1);
}

let manifest;
let built;
try {
  manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  built = (await stat(MANIFEST)).mtimeMs;
} catch {
  /* EXIT 3 IS A SKIP, NOT A PASS. Exiting 0 with no build made `pnpm gates` report ten gates
     passed on a fresh checkout while three of them had examined nothing, the same silence the
     self-test exists to break, one level up. The runner names a skip and is red under CI. */
  console.log('  bundle: no build to measure, so nothing was measured. Run `pnpm --filter @braindog/web build` first.');
  process.exit(3);
}

/**
 * AND A BUILD OLDER THAN THE SOURCE IS NOT A MEASUREMENT.
 *
 * THIS GATE HAS BEEN REPORTING ON CODE THAT IS NOT THE CODE. A missing build was already a skip,
 * argued carefully in the paragraph above, and a STALE one was a pass: `pnpm gates` measured
 * whatever `build/` happened to hold, so a session that edited the shell and ran the gates without
 * rebuilding got a green entry-chunk row about the previous version. That is the same silence one
 * level up again, and it is how 116 bytes of growth got three commits past the gate that exists to
 * catch exactly that.
 *
 * IT IS A SKIP AND NOT A FAILURE, because "you have not built" is not "you have broken something",
 * and the runner is red on a skip under CI either way.
 */
/* `apps/web/src` IS NOT ALL OF THE SOURCE. The app imports eight workspace packages and compiles
   them into its own chunks, so a change to `packages/kernel/src` makes the build exactly as stale as
   a change to a route. The first version of this check walked only the app, so the first kernel
   commit after it went straight through a green bundle row again. */
const dirs = [join(APP, 'src')];
/* AND IT IS ALLOWED NOT TO BE THERE, which the sibling walk over `apps/` has said since it was
   written and this one did not: a bare `readdir` of a directory that does not exist throws ENOENT
   out of the gate, and a gate that dies is a gate whose other twelve rows nobody sees. It is the
   same fault `3eb5fdcd` fixed one function down, left in the line above it.

   SILENCE IS HONEST HERE AND IT IS NOT HONEST THERE, which is why this is a `catch` and the
   shells list is a finding. This list feeds a STALENESS comparison: no packages means no package
   source that could be newer than the build, and an empty list says exactly that. The shells list
   feeds a CONTENT check, where finding nothing to read and reporting that everything read clean
   are the same green row. */
for (const pkg of await readdir(join(process.cwd(), 'packages'), { withFileTypes: true }).catch(() => []))
  if (pkg.isDirectory()) dirs.push(join(process.cwd(), 'packages', pkg.name, 'src'));

/* `src` AND NOT THE PACKAGE. A package's `test/` is not compiled into anything the browser
   downloads, so counting it would demand a rebuild for a change that cannot move a byte of the
   bundle, and a gate that cries stale on work it does not measure is a gate people learn to
   re-run blind. */
const newest = (await Promise.all(dirs.map((d) => newestSource(d)))).reduce((a, b) => (a.when >= b.when ? a : b));
if (newest.when > built) {
  console.log(
    `  bundle: the build is older than ${relative(APP, newest.at)}, so it is not this code. Run \`pnpm --filter @braindog/web build\` first.`,
  );
  process.exit(3);
}

/**
 * The most recently touched source file under a directory, and which one it was.
 *
 * The name comes back with the time because a gate that says "the build is stale" and not WHICH file
 * made it stale is a gate somebody re-runs blind.
 */
async function newestSource(dir) {
  let when = 0;
  let at = dir;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch {
    /* A package with no `src` is a package that compiles into nothing. */
    return { when, at };
  }
  for (const e of entries) {
    /* `node_modules` under a workspace package is a symlink farm the size of the registry, and its
       mtimes are about an install rather than about this code. */
    if (!e.isFile() || (e.parentPath ?? e.path).split(/[\\/]/).some(skipDir)) continue;
    /* AND A TEST IS NOT SOURCE EITHER. The app's tests sit beside the code they test rather than in
       a `test/` directory, so the rule one comment up did not reach them: writing a test for a page
       block declared the bundle stale and demanded a rebuild that could not move a byte. Same
       argument, colocated. */
    if (/\.test\.[cm]?[jt]sx?$/.test(e.name)) continue;
    const full = join(e.parentPath ?? e.path, e.name);
    const t = (await stat(full)).mtimeMs;
    if (t > when) {
      when = t;
      at = full;
    }
  }
  return { when, at };
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

/**
 * A FILE THE MANIFEST NAMES AND THE BUILD DID NOT EMIT, WHICH IS A FINDING AND WAS A STACK TRACE.
 *
 * Every byte below is read by name out of `.vite/manifest.json`, and until now each of those reads
 * was `readFile(join(CLIENT, node.file))` with nothing between it and the disk. A manifest naming a
 * chunk that is not there threw ENOENT out of the top level, so the gate died with a Node stack
 * trace and `run.mjs`, which reads any non-zero, non-3 exit as a failure, reported the bundle gate
 * red with no sentence in it. A person then goes looking for a size regression that is not there.
 *
 * IT IS A FINDING AND NOT THE SKIP THE ADAPTER'S OUTPUT GETS, and the two cases differ in one way
 * that decides it. `build/index.html` and the fonts are written by the adapter, which is a SECOND
 * event after `vite build`, so a manifest with no shell beside it is an unfinished build and "you
 * have not finished building" is not "you have broken something". A chunk is written by the SAME
 * event that writes the manifest that names it. The two disagreeing is not a half-done build; it is
 * the gate's own input contradicting itself, and there is no command a reader should be told to run.
 *
 * NEVER SILENTLY, EITHER, WHICH IS WHY THE SUM IS NOT SIMPLY ALLOWED TO SKIP THE FILE. A budget
 * measured over the chunks that happen to exist is a smaller number than the truth and would report
 * a pass for a build nobody could serve. So the missing ones are collected, named with the manifest
 * that claims them, and the run ends before a single row is printed.
 */
const unemitted = [];

/** The brotli size of a file the manifest names, or zero and a finding saying what named it. */
async function measure(file, claimedBy) {
  const at = join(CLIENT, file);
  if (!existsSync(at)) {
    unemitted.push(`${file}, named by \`${claimedBy}\` in ${shown(MANIFEST)}, was not emitted by the build`);
    return 0;
  }
  return brotli(await readFile(at));
}

let js = 0;
for (const key of reachable) {
  const node = manifest[key];
  if (node.file?.endsWith('.js')) js += await measure(node.file, key);
}

/**
 * "Main CSS" is the ROOT LAYOUT's stylesheet: `app.css`, the generated theme, the block contract,
 * the row shape, and the shell's own components. Every other stylesheet arrives with the route that
 * needs it, which is what `css: 'external'` plus route splitting buys.
 */
// SvelteKit numbers its route nodes and node 0 is the root layout, so `assets/0.*.css` is the
// stylesheet every screen pays for. Everything else is a route's own.
/* THE CLAIMANT TRAVELS WITH THE FILE, because a stylesheet is named by a node and the finding above
   has to say which one. A `Map` over the pairs dedupes by file the way the `Set` here used to. */
const allCss = [...new Map(Object.entries(manifest).flatMap(([key, n]) => (n.css ?? []).map((f) => [f, key])))];
const isMain = (f) => /assets\/0\.[^/]*\.css$/.test(f);

let css = 0;
let routeCss = 0;
for (const [f, key] of allCss) {
  const size = await measure(f, key);
  if (isMain(f)) css += size;
  else routeCss += size;
}

/**
 * AND THE GATE STOPS HERE, BEFORE ANY NUMBER, if any of that was not on disk.
 *
 * `52 §9`'s rule, said the other way round: a gate that cannot find its input must say so, and the
 * one thing it must never do is print a row. Both totals above are short by whatever was missing,
 * so every row after this point would be a measurement of a build that does not exist.
 */
if (unemitted.length > 0) {
  console.error(`\n  bundle: the manifest names ${unemitted.length} file(s) the build did not emit.\n`);
  for (const f of unemitted) console.error(`    ${f}`);
  console.error(
    '\n  `vite build` writes the chunks and the manifest that names them in one event, so the two\n' +
      '  disagreeing is not a half-finished build: it is this gate\'s own input contradicting itself.\n' +
      '  Nothing below was printed, because a total over the chunks that happen to be there is\n' +
      '  smaller than the truth and would report a pass for a build nobody can serve.\n',
  );
  process.exit(1);
}

/**
 * AND THE ADAPTER'S OUTPUT, WHICH IS A SECOND BUILD AND WAS NEVER CHECKED FOR.
 *
 * The skip above turns on `.svelte-kit/output/client/.vite/manifest.json`, which `vite build`
 * writes. Everything from here down reads `apps/web/build/`, which the ADAPTER writes afterwards,
 * and the two are not the same event: a run that compiled and then failed to adapt, or a
 * `rm -rf apps/web/build` that left `.svelte-kit` alone, leaves a manifest with no shell beside it.
 * `readFile` then threw ENOENT out of the top level and `run.mjs` reads any non-zero, non-3 exit as
 * a FAILURE, so a half-finished build was reported as the bundle gate going red and sent a person
 * looking for a size regression that was not there.
 *
 * A SKIP AND NOT A FINDING, unlike the absences `event-kinds` and `guards` answer for. Nothing here
 * is committed: every one of these paths is output, there is a command that produces it, and "you
 * have not finished building" is not "you have broken something" - the same sentence the staleness
 * check above already makes about the same directory. A skip is red under CI anyway, because CI
 * builds first.
 *
 * THE FONTS ARE IN THE LIST BECAUSE THEY ARE THE SAME HAZARD thirty lines later. Two of the five
 * budget rows `stat` a file under `build/fonts/`, and guarding the shell alone would have moved the
 * stack trace rather than removed it.
 */
const NEEDED = ['index.html', join('fonts', 'geist.woff2'), join('fonts', 'poppins-600.woff2')];
const missing = [];
for (const f of NEEDED) if (!(await stat(join(BUILD, f)).then((s) => s.isFile(), () => false))) missing.push(f.split(/[\\/]/).join('/'));
if (missing.length > 0) {
  console.log(
    `  bundle: the build has a manifest but no ${missing.join(' and no ')}, so nothing was measured.` +
      ' Run `pnpm --filter @braindog/web build` first.',
  );
  process.exit(3);
}

const shellHtml = await readFile(join(BUILD, 'index.html'), 'utf8');

/**
 * THE SHELL STILL HOLDS A TEMPLATE PLACEHOLDER, WHICH MEANS THE APP IS NOT IN IT.
 *
 * `app.html` carries two of them, one for the head and one for the body, and the build replaces
 * each. It replaces the FIRST occurrence of each and leaves the rest, so a second spelling anywhere
 * in that file, in a comment for instance, takes the substitution and the real one ships as literal
 * text. A comment in this repository's own `app.html` did exactly that, to explain itself.
 *
 * WHAT IT COSTS IS EVERYTHING AND IT SAYS NOTHING. The app does not mount: no console error, no
 * page error, an empty screen on every route, a build that succeeds, a typecheck that passes and a
 * deploy that goes out. It reached staging and served there. Four browser gates would have caught
 * it eventually and each of them takes minutes; this is a substring search over one file.
 *
 * IT IS HERE RATHER THAN IN ITS OWN GATE because this is the gate that already reads the built
 * shell, and the question is about that file. A build whose shell is not a shell has no budget
 * worth reporting, so it is checked before the numbers rather than beside them.
 */
const LEFTOVER = /%sveltekit\.(head|body)%/g;
const leftover = [...new Set([...shellHtml.matchAll(LEFTOVER)].map((m) => m[0]))];
if (leftover.length > 0) {
  console.error(
    `\n  bundle: the built shell still contains ${leftover.join(' and ')}.\n\n` +
      '  The build replaces the FIRST occurrence of each placeholder and leaves the rest, so a\n' +
      '  second spelling anywhere in `apps/web/src/app.html`, in a comment for instance, takes the\n' +
      '  substitution and the real one ships as literal text. The app then does not mount at all,\n' +
      '  on any route, with no error anywhere. Spell the two names apart in prose.\n',
  );
  process.exit(1);
}

const shell = brotli(Buffer.from(shellHtml, 'utf8'));

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
    /* THE BAND IS ON THE RECORDED NUMBER, NOT ON THE BUDGET. Its argument, and the measurement it
       rests on, are in `budgets.json` beside the number, which is where a reviewer widening either
       would have to read them. */
    baseline: B.mainJsBaseline + B.mainJsNoise,
    note: "Kit's runtime alone; the interpreter is 19.3 of it",
  },
  { name: 'entry CSS, brotli', size: css, budget: B.mainCssBrotli, note: 'tokens, a11y, blocks, rows and the shell' },
  { name: 'index.html, brotli', size: shell, budget: B.htmlBrotli, note: 'it carries no record state' },
  { name: 'UI face (Geist)', size: await font('geist.woff2'), budget: B.uiFaceBytes, note: "22 §9's budget, unchanged" },
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
  const tail = within ? note : `RECORDED, fails above ${KB(baseline ?? budget)}. ${note}`;
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
