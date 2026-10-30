/**
 * `bundle`: the size budget, measured from the ENTRY GRAPH rather than from the output directory.
 *
 * A size budget that only warns is a size budget that is exceeded, so this exits non-zero. And it
 * measures the right thing: the total of `build/` is nineteen code-split routes, and what a person
 * waits for is the entry chunk and everything statically reachable from it. Adding a screen must
 * not be able to move this number.
 *
 * AND THE FIRST LOAD BESIDE IT: the entry with the root layout, the app's frame and Today, which is what a cold open
 * of the app waits for before it draws. Adding a screen cannot move that number either; putting a
 * package on Today's path can, and that is the one it is there to catch.
 *
 * Budgets are 22 §9 and 50 §7. `--report` prints the rows without failing.
 *
 *   node tools/gates/bundle.mjs [--report]
 */

import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { brotliCompressSync, constants } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { budget, newestSource } from './lib.mjs';

/**
 * THE ENTRY SCRIPT'S DEBT, OFF THE LEDGER. The number this gate fails above used to be `mainJsBaseline`
 * in `budgets.json`, raised eleven times with a sentence added to one comment string each time and nothing checking that
 * a change carried one. It is now the newest line of `debts["bundle.mainJsBrotli"]` in `ledger.json`, where every line
 * is dated with its reason and the `ledger` gate is red on a line higher than the one before. This reads it and nothing
 * more: the budget stays `mainJsBrotli` in `budgets.json` and still prints.
 *
 * The reason is the line that SET the number, not a later line that only restates it, which is how `ledger.mjs` reads
 * it too: the line the ledger opened with says the same number and would otherwise hide the reason of 6 October.
 *
 * It returns an Error rather than throwing, so a ledger with no such debt is a finding in this gate's own words.
 */
export function entryDebt(book) {
  const debt = book?.debts?.['bundle.mainJsBrotli'];
  const lines = Array.isArray(debt?.lines) ? debt.lines.filter((l) => Number.isInteger(l?.at)) : [];
  if (lines.length === 0 || lines.length !== debt.lines.length)
    return new Error('ledger.json holds no debt for the entry script, `debts["bundle.mainJsBrotli"]`, with a number on every line');
  const set = lines.findLast((l, i) => i === 0 || lines[i - 1].at !== l.at);
  return { at: lines.at(-1).at, owes: debt.owes ?? 'nobody named', on: set.on, why: set.why };
}

/** The line this gate prints for the debt: the budget, what is owed and by whom, where it fails, and the newest reason. */
export function debtLine(B, debt) {
  const bytes = (n) => n.toLocaleString('en-US');
  return (
    `entry JS: a budget of ${bytes(B.mainJsBrotli)} with ${bytes(debt.at - B.mainJsBrotli)} owed by ${debt.owes},` +
    ` failing above ${bytes(debt.at + B.mainJsNoise)}. Newest reason, ${debt.on}: ${debt.why}`
  );
}

/** `ledger.json` beside this file, as `budgets.json` is read: the gate's own numbers, never the seeded tree's. */
export function readLedger(at = fileURLToPath(new URL('./ledger.json', import.meta.url))) {
  try {
    return JSON.parse(readFileSync(at, 'utf8'));
  } catch (e) {
    return new Error(`tools/gates/ledger.json could not be read: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}

/**
 * THE PREREQUISITE, FOR THE RUNNER TO CHECK RATHER THAN THIS FILE (`52 §5.1` step 2). `run.mjs`
 * reads this before it runs anything and refuses the gate when there is no build, so the account
 * of an unmet prerequisite no longer comes from the program that did not run.
 *
 * READ OFF THE MODULE NOW RATHER THAN OUT OF THE TEXT (`52 §5.1` step 3), which is the same fact
 * with one fewer thing that can disagree: `run.mjs` imports this file and reads `mod.needs` before it
 * calls the gate, so the declaration it acts on is the value this file holds rather than a line
 * somebody read with a regular expression.
 *
 * IT IS THE BUILD'S EXISTENCE AND NOT ITS FRESHNESS. The two exit-3 paths below are different
 * questions and both stay here: a manifest with no shell beside it, and a build older than the
 * source it claims to be. Neither is decidable from a directory listing, and a runner that tried
 * to decide them would be a second copy of this gate's judgement kept in step by hand.
 */
export const needs = ['web-build'];

/**
 * THE WHOLE GATE, AS A FUNCTION THE RUNNER CALLS. `52 §5.1` step 3.
 *
 * THE ROOT IS AN ARGUMENT BECAUSE EVERY PATH HERE USED TO COME OFF `process.cwd()`, and a called
 * gate shares the runner's working directory, which is wherever the operator was standing:
 * `node ../../tools/gates/run.mjs` from inside a package would have pointed this gate at that
 * package and measured a build that is not there. `run.mjs` passes the root it derived from its own
 * location, and `BRAINDOG_GATE_ROOT` stays the default because that is how `self-test` points this
 * gate at its two seeded trees.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function bundle(root = process.env.BRAINDOG_GATE_ROOT ?? process.cwd()) {
  const APP = join(root, 'apps/web');
  const CLIENT = join(APP, '.svelte-kit/output/client');
  const MANIFEST = join(CLIENT, '.vite/manifest.json');
  /* THE APP'S OWN FOLDER OF THE BUILD, WHICH IS `build/` ITSELF. The app is the root of `app.brain.dog`, so the adapter
     writes the shell and the fonts to the root of `build/` (`svelte.config.js`). It was `build/app/` while the app was
     under `/app`, until 29 Oct. */
  const BUILD = join(APP, 'build');

  /** A path as a reader would type it, so a finding names the same file on both platforms. */
  const shown = (at) => relative(root, at).split(/[\\/]/).join('/');

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
  for (const app of await readdir(join(root, 'apps'), { withFileTypes: true }).catch(() => [])) {
    if (!app.isDirectory()) continue;
    const at = join(root, 'apps', app.name, 'src', 'app.html');
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
    return 1;
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
    return 3;
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
  /* THE WALK IS `newestSource` IN `lib.mjs` NOW, because the runner asks the same question of the
     `web-build` prerequisite before it lets any browser gate near the build, and two copies of which
     files count as source would drift the way the seven skip lists did. What it covers, and why a
     package's `src` counts and a test does not, is argued there. This gate compares it against the
     manifest rather than against `build/`, and an ordinary build writes the manifest before `build/`,
     so on the main build this is the stricter of the two comparisons. */
  const newest = await newestSource(root);
  if (newest.when > built) {
    console.log(
      `  bundle: the build is older than ${relative(APP, newest.at)}, so it is not this code. Run \`pnpm --filter @braindog/web build\` first.`,
    );
    return 3;
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
   * AND THE FIRST LOAD: KIT'S ENTRY, THE ROOT LAYOUT AND TODAY, WHICH A COLD OPEN OF THE APP WAITS FOR BEFORE IT DRAWS.
   *
   * The entry row above is Kit's runtime, and it was the only number here, so the first open grew to 734 KB of script
   * while this gate printed 33. Kit numbers its route nodes and node 0 is the root layout, which every screen waits for;
   * Today is the node the route table (`dictionary` in the app entry) names for `/`, which is the screen the app opens
   * on. A node is drawn once it and everything it imports statically have loaded, so the row is the entry's chunks, the
   * two nodes', and everything any of them imports. A dynamic import is not in it: it is asked when the screen asks,
   * and nothing waits for it to draw.
   *
   * A BUILD WITH A ROOT LAYOUT AND NO TODAY IS A FINDING, because the row would be smaller than a first open and say so
   * in green. A tree with neither (the planted ones under `negative/`) is Kit's entry alone, and the row says that.
   */
  const nodeKey = (n) => Object.keys(manifest).find((k) => (manifest[k].file ?? '').startsWith(`_app/immutable/nodes/${n}.`) && manifest[k].file.endsWith('.js'));
  const rootLayout = nodeKey('0');
  let today;
  if (rootLayout !== undefined) {
    for (const e of entries) {
      const at = join(CLIENT, manifest[e].file ?? '');
      if (!/\/entry\/app\.[^/]*\.js$/.test(manifest[e].file ?? '') || !existsSync(at)) continue;
      const leaf = /"\/":\[~?(\d+)/.exec(await readFile(at, 'utf8'))?.[1];
      if (leaf !== undefined) today = nodeKey(leaf);
    }
    if (today === undefined) {
      console.error(
        "\n  bundle: the build has a root layout and no route for `/` in the app entry's route table, so Today's chunks\n" +
          '  cannot be found. The first-load row would be smaller than a first open, so nothing was measured.\n',
      );
      return 1;
    }
  }
  /**
   * AND THE APP'S FRAME, WHICH THE ROOT LOAD ASKS FOR BESIDE `boot` (`routes/+layout.ts`). It was the root layout until
   * 30 Oct and is now a chunk of its own, loaded by import() so sign-in and sign-up never fetch it (E14); every screen of
   * a record waits for it all the same, so a row without it would be a first load smaller than the one a person waits
   * for, and green. Found by its source in the manifest; a tree with no such chunk (the planted ones) has no frame.
   */
  const appFrame = Object.keys(manifest).find((k) => /(?:^|\/)src\/lib\/shell\/AppFrame\.svelte$/.test(k));
  const firstLoad = new Set(reachable);
  for (const node of [rootLayout, today, rootLayout === undefined ? undefined : appFrame]) if (node !== undefined) for (const k of reach(node)) firstLoad.add(k);

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
  let firstJs = 0;
  for (const key of firstLoad) {
    const node = manifest[key];
    if (!node.file?.endsWith('.js')) continue;
    const size = await measure(node.file, key);
    firstJs += size;
    if (reachable.has(key)) js += size;
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
  /* AND THE APP FRAME'S, which every screen of a record waits for as it waited for the root layout's (above). */
  const frameCss = new Set(appFrame === undefined ? [] : (manifest[appFrame].css ?? []));
  const isMain = (f) => /assets\/0\.[^/]*\.css$/.test(f) || frameCss.has(f);

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
    return 1;
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
  const NEEDED = ['index.html', join('fonts', 'geist.woff2'), join('fonts', 'lexend-600.woff2')];
  const missing = [];
  for (const f of NEEDED) if (!(await stat(join(BUILD, f)).then((s) => s.isFile(), () => false))) missing.push(f.split(/[\\/]/).join('/'));
  if (missing.length > 0) {
    console.log(
      `  bundle: the build has a manifest but no ${missing.join(' and no ')}, so nothing was measured.` +
        ' Run `pnpm --filter @braindog/web build` first.',
    );
    return 3;
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
    return 1;
  }

  /* EVERY SCRIPT THE SHELL PRELOADS IS ONE THE FIRST-LOAD ROW COUNTED. The row is summed from the manifest, and the
     shell is what a browser actually fetches first, so a preload line naming a chunk outside that sum would be a first
     load this gate reports as smaller than it is. */
  const counted = new Set([...firstLoad].map((k) => manifest[k].file));
  const preloaded = [...shellHtml.matchAll(/<link\b[^>]*\bhref="[^"]*?(_app\/[^"]+\.js)"[^>]*\brel="modulepreload"|<link\b[^>]*\brel="modulepreload"[^>]*\bhref="[^"]*?(_app\/[^"]+\.js)"/g)].map((m) => m[1] ?? m[2]);
  const uncounted = preloaded.filter((f) => !counted.has(f));
  if (uncounted.length > 0) {
    console.error(`\n  bundle: the shell preloads ${uncounted.length} script(s) the first-load row did not count.\n`);
    for (const f of uncounted) console.error(`    ${f}`);
    console.error('\n  The row is the entry, the root layout, the app frame and Today with everything they import. A preload from anywhere\n  else is waited for on every first open, so it must be counted before any number is printed.\n');
    return 1;
  }

  const shell = brotli(Buffer.from(shellHtml, 'utf8'));

  const font = async (f) => (await stat(join(BUILD, 'fonts', f))).size;

  /**
   * The font budget is SPLIT, and that is a recorded deviation rather than a moved goalpost.
   *
   * 22 §9 budgets "≤ 45 KB total, 2 files", assuming ONE Latin face plus Arabic. This ships two Latin
   * faces on purpose: a workhorse that has to hold up at 11px with tabular figures, and a display face
   * used only above 20px because it is the wordmark's own (Lexend since 17 October).
   * So the workhorse keeps the original 45 KB and the display face gets its own small budget, which is
   * the honest way to say "we chose to spend fifteen more kilobytes" instead of quietly widening one
   * number to 60.
   *
   * Arabic is not in either row: `unicode-range` is evaluated per page, so an English-only session
   * never fetches it.
   */
  /* THE RECORDED NUMBER IS THE LEDGER'S DEBT, with every move dated and its reason on the line (`entryDebt` above). */
  const book = readLedger();
  const debt = book instanceof Error ? book : entryDebt(book);
  if (debt instanceof Error) {
    console.error(`\n  bundle: ${debt.message}. The entry script fails above that debt, so without it nothing is measured.\n`);
    return 1;
  }
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
      /* THE BAND IS ON THE RECORDED NUMBER, NOT ON THE BUDGET. Its argument is in `budgets.json` beside `mainJsNoise`,
         and the number it sits on is the debt, whose every line and reason are in `ledger.json`. */
      baseline: debt.at + B.mainJsNoise,
      note: "Kit's runtime alone; the interpreter is 19.3 of it",
    },
    /* A CEILING AND NO DEBT: the number a first open of Today was measured at once the kernel and the seed left it, which
       only falls (`ledger.json`). What it holds is said in the summary line below. */
    { name: 'first load JS, brotli', size: firstJs, budget: B.firstLoadJsBrotli, note: 'the entry, the root layout, the app frame and Today' },
    { name: 'entry CSS, brotli', size: css, budget: B.mainCssBrotli, note: 'tokens, a11y, blocks, rows and the shell' },
    { name: 'index.html, brotli', size: shell, budget: B.htmlBrotli, note: 'it carries no record state' },
    { name: 'UI face (Geist)', size: await font('geist.woff2'), budget: B.uiFaceBytes, note: "22 §9's budget, unchanged" },
    { name: 'display face (Lexend)', size: await font('lexend-600.woff2'), budget: B.displayFaceBytes, note: 'nothing below 20px' },
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
  console.log(`\n  ${debtLine(B, debt)}`);
  console.log(
    `\n  ${entries.length} entry chunks, ${reachable.size} statically reachable.` +
      (rootLayout === undefined
        ? ' No root layout in this build, so the first load is the entry alone.'
        : ` The first load is ${firstLoad.size} with the root layout${appFrame === undefined ? '' : ', the app frame'} and Today (${manifest[today].file}), ${preloaded.length} preloaded by the shell.`) +
      ` ${KB(routeCss)} more CSS arrives with the routes that need it.\n`,
  );

  if (failed) {
    console.error(
      '  bundle: budget(s) exceeded. A budget that only warns is a budget that is exceeded.\n' +
        "  For entry JS the recorded path is NOT a bigger budget: it is `hydrate()` from svelte plus a\n" +
        '  60-line router with the route files as a table, which is why the app was kept off SvelteKit\'s\n' +
        '  data-loading conventions in the first place (50 §10).',
    );
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns this file at two seeded trees with
   `BRAINDOG_GATE_ROOT`, and the header documents `node tools/gates/bundle.mjs [--report]`. `?? 0`
   because a pass returns nothing: see the function's own last paragraph. */
if (import.meta.main) process.exitCode = (await bundle()) ?? 0;
