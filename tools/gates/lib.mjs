/**
 * The only code the gates share.
 *
 * A GATE THAT HOLDS ITS OWN NUMBER IS A NUMBER NOBODY REVIEWS. `52 §4`: every number a gate asserts
 * lives in `budgets.json`, and a gate holds no numeric literal that is not `0`, `1` or an index. The
 * reason is not tidiness. A budget is a decision some design document made, and a
 * decision spread across ten scripts is one that gets quietly widened by whoever is in a hurry. In
 * one file, changing 30 KB to 40 KB is a diff a reviewer sees and asks about.
 *
 * A COUNT IS NEVER A BUDGET. `34 §6`: a count is read from the enumeration that owns it. The nine
 * outbox kinds are counted from `OUTBOX_KINDS`, never from a `9` written down here, because the
 * whole point of counting them is to catch the day somebody adds a tenth.
 *
 * KEYS BEGINNING `//` ARE COMMENTS. JSON has none, and the argument for each number belongs beside
 * it rather than in a document nobody opens when they are changing it. They are stripped here, so a
 * gate never sees one and `self-test`'s "every key is read" check never asks for one.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** `//`-prefixed keys are the file's comments. Recursive, because the sections carry their own. */
const stripComments = (v) =>
  Array.isArray(v) || v === null || typeof v !== 'object'
    ? v
    : Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => !k.startsWith('//'))
          .map(([k, x]) => [k, stripComments(x)]),
      );

/**
 * Every number a gate asserts, frozen.
 *
 * FROZEN BECAUSE A GATE THAT ADJUSTED ITS OWN BUDGET WOULD BE A GATE THAT PASSES. It is one object
 * shared by every gate in a run, and `Object.freeze` is the difference between "shared" and
 * "shared and mutable", which is a bug that would show up as a gate passing on a Tuesday.
 */
const deepFreeze = (v) => {
  if (v === null || typeof v !== 'object') return v;
  for (const x of Object.values(v)) deepFreeze(x);
  return Object.freeze(v);
};

let cached;

/** @returns {Readonly<Record<string, Readonly<Record<string, number | number[]>>>>} */
export function budgets() {
  cached ??= deepFreeze(stripComments(JSON.parse(readFileSync(join(here, 'budgets.json'), 'utf8'))));
  return cached;
}

/**
 * One section, and a missing one is loud.
 *
 * A GATE READING AN ABSENT SECTION WOULD GET `undefined` AND COMPARE AGAINST IT, and every
 * comparison against `undefined` is false. So the gate would go green having asserted nothing,
 * which is the exact silence `self-test` exists to break. It throws instead.
 */
export function budget(section) {
  const all = budgets();
  const found = all[section];
  if (!found) throw new Error(`budgets.json has no "${section}" section, and a gate asked for it.`);
  return found;
}

/** Every key path in the file, `section.key`, for the check that nothing here is unread. */
export function keyPaths() {
  return Object.entries(budgets()).flatMap(([section, values]) =>
    Object.keys(values).map((key) => `${section}.${key}`),
  );
}

/**
 * Directories no gate walks into, and one list instead of seven.
 *
 * THERE WERE SEVEN, AND THEY HAD DRIFTED. `secret-grep` skipped four names, `stack` three,
 * `layout` three, `css-rules` and `colour-grep` their own supersets, and `routes` and
 * `no-declarations-in-kernel` skipped `node_modules` alone. So the same directory was source to
 * two gates and invisible to five, with nothing anywhere saying which answer was intended.
 *
 * WHAT IT COST, MEASURED: a subagent left a scratch script under `apps/web/.verify/` during an
 * audit, and `secret-grep` read `console.log('=== plain /r/obligations ===')` as a plaintext
 * reaching a log. One gate red, on a file nobody wrote to ship, in a directory five other gates
 * were already ignoring.
 *
 * A LEADING DOT MEANS TOOLING. `.svelte-kit` was already named by three of the seven and `.git` by
 * two, which is the rule those lists were groping towards; no source directory in this repository
 * begins with one, and every scratch, cache and editor directory does. The built outputs are named
 * because they do not.
 *
 * IT IS THE UNIVERSAL PART ONLY. A gate that also skips its own fixtures, or `docs/`, keeps saying
 * so at its own call site. Those are statements about what that gate measures, not about what a
 * directory is.
 */
const BUILT = new Set(['node_modules', 'build', 'dist', 'shots']);

/**
 * AND A VARIANT BUILD IS A BUILD. `build-cloud/` is the same output for a different record, and the
 * moment it existed every grep gate started reading minified CSS as though it were a component.
 * `css-rules` reported fourteen colour literals in `Button.css`, which is the compiled form of rules
 * that name only tokens. A built directory is built whatever the record inside it is.
 */
export const skipDir = (name) => name.startsWith('.') || BUILT.has(name) || name.startsWith('build-');

/**
 * THE SOURCE A WEB BUILD IS MADE OF, AND THE NEWEST FILE IN IT. Lifted out of `bundle.mjs`, which
 * wrote it first and still uses it unchanged, because the runner needs the same answer before it
 * lets any browser gate near `apps/web/build`.
 *
 * THE RUNNER DID NOT HAVE IT, AND IT COST AN HOUR ON 22 SEPTEMBER. `web-build` was
 * `existsSync(apps/web/build)`, so `layout` and `a11y` measured whatever that directory held and
 * reported nineteen findings about a version of the app that was no longer the source. `bundle`
 * already refused a build older than the code; the six gates beside it were never asked.
 *
 * `apps/web/src` IS NOT ALL OF THE SOURCE. The app imports eight workspace packages and compiles
 * them into its own chunks, so a change to `packages/kernel/src` makes the build exactly as stale as
 * a change to a route. The first version of this walk covered only the app, so the first kernel
 * commit after it went straight through a green bundle row again.
 *
 * `src` AND NOT THE PACKAGE. A package's `test/` is not compiled into anything the browser
 * downloads, so counting it would demand a rebuild for a change that cannot move a byte of the
 * bundle, and a gate that cries stale on work it does not measure is a gate people learn to re-run
 * blind.
 *
 * THE NAME COMES BACK WITH THE TIME because a verdict of "the build is stale" that does not say WHICH
 * file made it stale is a verdict somebody re-runs blind.
 *
 * @returns {Promise<{ when: number, at: string }>} `when` is 0 when there is no source at all.
 */
export async function newestSource(root) {
  const dirs = [join(root, 'apps', 'web', 'src')];
  /* AND `packages/` IS ALLOWED NOT TO BE THERE. A bare `readdir` of a directory that does not exist
     throws ENOENT out of the gate, and a gate that dies is a gate whose other rows nobody sees.
     Silence is honest here because this list feeds a STALENESS comparison: no packages means no
     package source that could be newer than the build, and an empty list says exactly that. */
  for (const pkg of await readdir(join(root, 'packages'), { withFileTypes: true }).catch(() => []))
    if (pkg.isDirectory()) dirs.push(join(root, 'packages', pkg.name, 'src'));
  return (await Promise.all(dirs.map(newestUnder))).reduce((a, b) => (a.when >= b.when ? a : b));
}

async function newestUnder(dir) {
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
       a `test/` directory, so the rule about `src` did not reach them: writing a test for a page
       block declared the bundle stale and demanded a rebuild that could not move a byte. */
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

/**
 * The variant builds `pnpm --filter @braindog/web build` writes, read from the script that writes them.
 *
 * READ AND NOT LISTED, because `34 §6` says a count is read from the enumeration that owns it, and the
 * owner here is `build:variants` in `apps/web/package.json`. A fourth variant added there is checked
 * for freshness the day it is added rather than the day somebody remembers this file.
 *
 * `build-alpha/` AND ITS KIN ARE DELIBERATELY NOT HERE. They are `BRAINDOG_ENV=alpha`, which the
 * `build` script never writes, so holding them against the prerequisite would refuse a gate and then
 * name a command that cannot fix the refusal. In this tree on 22 September they were five days older
 * than the main build, and no gate that declares `web-build` reads them.
 *
 * A SCRIPT THAT IS THERE AND CANNOT BE READ THROWS, rather than answering "no variants". An empty
 * answer would wave a stale `build-cloud/` past `layout`, which is the exact fault this exists for.
 */
export function buildVariants(root) {
  const at = join(root, 'apps', 'web', 'package.json');
  if (!existsSync(at)) return [];
  const script = JSON.parse(readFileSync(at, 'utf8')).scripts?.['build:variants'];
  if (script === undefined) return [];
  const list = /for \(const v of \[([^\]]*)\]\)/u.exec(script);
  if (list === null)
    throw new Error(
      `apps/web/package.json has a build:variants this file cannot read the variant names out of, so ` +
        `it cannot tell which build-* directories the build writes. It expected \`for (const v of ['a','b'])\``,
    );
  return [...list[1].matchAll(/'([a-z][a-z-]*)'/gu)].map((m) => m[1]);
}

/**
 * WHERE THE APP IS SERVED, AND WHERE ITS SHELL IS ON DISK.
 *
 * The app is the root of `app.brain.dog`, so `svelte.config.js` writes it to the root of `build/` and the Worker serves
 * `build/` as it is. Every browser gate serves `build/` at the root the same way and opens `<route>`; its SPA fallback
 * is this shell. It was `/app` and `build/app/index.html` until 29 Oct, when the app left `/app`; `APP_BASE` stays, empty,
 * so every gate that builds an address from it reads the same either way.
 */
export const APP_BASE = '';
export const appShell = (buildRoot) => join(buildRoot, 'index.html');

/**
 * When a build directory was written: the later of the directory and its `index.html`.
 *
 * THE DIRECTORY BECAUSE `adapter-static` EMPTIES AND REFILLS IT, so its time moves with every build,
 * and `index.html` because it is the fallback shell the adapter writes after the chunks, which is
 * the file every browser gate actually loads first. Measured in this tree: the two agree to the
 * tenth of a microsecond on `build/` and on each of the three variants.
 */
function builtAt(dir) {
  /* `index.html` AT THE ROOT, where the app is, and `app/index.html` too, so a tree built while the app was under `/app`
     is still read by the same rule rather than by its directory's time alone. */
  const shells = [appShell(dir), join(dir, 'app', 'index.html')].filter((f) => existsSync(f));
  return Math.max(statSync(dir).mtimeMs, ...shells.map((f) => statSync(f).mtimeMs));
}

/**
 * WHY THE WEB BUILD CANNOT BE MEASURED, OR `null` WHEN IT CAN. The `web-build` prerequisite.
 *
 * A SENTENCE AND NOT A BOOLEAN, because the runner prints it, and "needs a built web app" beside a
 * build that is plainly there reads as the runner being wrong. It names the file that is newer.
 *
 * THE VARIANTS ARE HELD TO THE SAME RULE WHEN THEY ARE THERE, and only then. `layout` reads
 * `build-cloud/`, `build-quiet/` and `build-busy/` when they exist and says so when they do not, so
 * an absent variant is coverage that gate reports losing, and a stale one is the nineteen findings
 * again, one directory over. `vite build` alone refreshes `build/` and leaves them where they were,
 * which is the ordinary way to get one fresh and three stale.
 */
export async function webBuildUnmet(root) {
  const web = join(root, 'apps', 'web');
  if (!existsSync(join(web, 'build'))) return 'there is no apps/web/build';
  const newest = await newestSource(root);
  const shown = relative(root, newest.at).split(/[\\/]/).join('/');
  const stale = ['build', ...buildVariants(root).map((v) => `build-${v}`)].filter(
    (name) => existsSync(join(web, name)) && builtAt(join(web, name)) < newest.when,
  );
  if (stale.length === 0) return null;
  return `${stale.map((name) => `apps/web/${name}`).join(', ')} ${stale.length === 1 ? 'is' : 'are'} older than ${shown}, so ${stale.length === 1 ? 'it is' : 'they are'} not this code`;
}

/**
 * THE READINESS CONTRACT, AND WHY IT IS IN THE FILE THAT IMPORTS NO PLAYWRIGHT.
 *
 * Four gates open a browser, and all four decided a page was ready the same way:
 * `waitForSelector('#main *', { timeout: 5000 }).catch(() => {})`, copy-pasted at six sites, three
 * of which spelt the timeout as a bare literal against this file's own opening rule. It worked
 * because every screen computed its content synchronously, so the moment `#main` had one child it
 * had all of them.
 *
 * IT STOPS WORKING THE DAY A SCREEN FETCHES, AND IT STOPS WORKING SILENTLY. `#main *` is then
 * satisfied by a page heading or a section frame, and `.catch(() => {})` means that even total
 * failure of that weak signal is not a finding: `layout` would measure the rail and the tab bar over
 * 627 page-runs, print `0 finding(s)` and exit 0, while its own seeded negative kept passing because
 * the seed goes into `#main` whether or not any data arrived. `keys` is worse in kind: its verdict is
 * `document.body.innerHTML.length` before a keystroke against after, so a response landing between
 * those two lines counts a dead key as alive.
 *
 * THE CONTRACT. `<main id="main">` carries `data-screen`, with three values and one meaningful
 * absence. ABSENT is the only "still loading", and it is a FINDING once it outlasts the budget rather
 * than a swallowed catch. `ready` is a call that came back with something drawn from it. `empty` is a
 * designed empty state, which is a real screen with its own content contract and is measured
 * normally. `refused` is a refusal, which is a value in this codebase and never an exception.
 *
 * WHAT MAKES IT UNSATISFIABLE VACUOUSLY, and each of the three closes a hole the old wait left open:
 * the attribute is not written until a call has COMPLETED, so chrome alone carries none; absence past
 * the budget is a finding; and a run with no `ready` at all, or a `refused` on a route outside
 * `MAY_REFUSE`, is red. The wait carries a budget and its expiry is a value, so no gate can hang.
 *
 * IT LIVES HERE RATHER THAN IN A GATE OF ITS OWN, AND STILL IMPORTS NO PLAYWRIGHT. `settled` calls
 * three methods on the page it is handed. Every grep gate imports this file, and none of them should
 * pay for a browser in order to read a budget.
 */

/**
 * The addresses that are MEANT to refuse, named rather than described so they are one diff to review.
 *
 * Both are the not-found samples the sweeps already carry: `/nowhere` is an extra address on the
 * route lists of `layout` and `a11y`, and `/r/nope` is the route `a11y`'s `empty: not found`
 * scenario drives expecting `.empty[data-kind="error"]`. Everything ELSE refusing means the gate is
 * looking at a host that is not answering, and a whole sweep of error cards must not read as a pass.
 */
export const MAY_REFUSE = new Set(['/nowhere', '/r/nope']);

/** The attribute, spelt once. */
const SCREEN = 'data-screen';

/** The three settled values. A fourth is a contract violation, not a state to measure. */
const SETTLED = new Set(['ready', 'empty', 'refused']);

/**
 * What a page reports when the build it came from does not carry the contract at all.
 *
 * NOT A FOURTH VALUE OF THE CONTRACT. It is this helper saying which of two worlds the run is in, and
 * it exists because the gates have to be correct on both sides of the app change: the attribute is
 * rendered by `apps/web/src/lib/shell/AppFrame.svelte`, which lands separately, and a gate that went red
 * over every route until it did would be a gate somebody switches off, while a gate that went green
 * would be the exact silence this contract is for. So a pre-contract build is measured the way it has
 * always been measured, the absence is said out loud once per run, and the timeout is a finding in
 * BOTH worlds.
 */
const UNCONTRACTED = 'uncontracted';

/**
 * Does the built app name the attribute anywhere.
 *
 * ASKED OF THE BUILD AND NOT OF A PAGE, because a page can fail to settle for a reason that has
 * nothing to do with whether the contract exists, and a probe that confused those two would answer
 * "the app does not emit it" about an app that emits it and is broken. Svelte compiles the attribute
 * name into the chunk as a string literal, the same way `data-rail` and `data-state` are already in
 * `build/_app/immutable/nodes/0.*.js`, so the question is decidable off disk and is not a race.
 */
function emitsContract(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!skipDir(e.name)) stack.push(join(dir, e.name));
      } else if (/\.(js|html)$/.test(e.name) && readFileSync(join(dir, e.name), 'utf8').includes(SCREEN)) {
        return true;
      }
    }
  }
  return false;
}

/** Read in the page: the settled value, or `null` while the screen has not settled. */
const screenOf = () => document.querySelector('main#main')?.getAttribute('data-screen') ?? null;

/**
 * One gate's readiness, built once per run from the build it is about to measure.
 *
 * `gate` names the gate in the two sentences this prints, `timeoutMs` is `ready.settleTimeoutMs`
 * read by the caller the way every gate reads its own section, and `root` is the built app.
 *
 * THE MISSING CONTRACT IS ANNOUNCED FROM HERE RATHER THAN FROM THE CALLER, so a gate cannot acquire
 * the helper and forget to say that it measured less than it claims. There is no environment
 * variable in it: a switch that defaults to skipping is how a check stops being one.
 */
export function readiness(gate, timeoutMs, root, { quietMs = 0 } = {}) {
  /* A missing build is a different sentence, and each gate already prints its own before exiting 3. */
  const built = existsSync(root);
  const contract = built && emitsContract(root);
  if (built && !contract) {
    console.error(
      `  ${gate}: this build carries no \`${SCREEN}\`, so the readiness contract is not live and this\n` +
        `  run waited for \`#main\` to have a child instead, which is only sound while every screen\n` +
        `  draws synchronously. Absence of even that is a finding here. Until\n` +
        `  apps/web/src/lib/shell/AppFrame.svelte and LightFrame.svelte render <main id="main" ${SCREEN}={settled()}>, this\n` +
        `  gate cannot tell a drawn screen from a shell that has fetched nothing.`,
    );
  }

  let anyReady = false;
  let retried = 0;

  return {
    /** Whether this run is holding the app to the contract. Read by the aggregate check. */
    contract,

    /**
     * What the screen settled into: `ready`, `empty`, `refused`, `uncontracted`, or `null`.
     *
     * `null` IS A FINDING AT EVERY CALL SITE, and that is the whole of this contract. The idiom it
     * replaces ended in `.catch(() => {})`, so a page that had rendered nothing was measured anyway
     * and the gate reported green over an empty document.
     *
     * `prerendered` is for a root that is not the record app: the marketing site is three prerendered
     * pages that make no call, so it has nothing to settle and is measured on the pre-contract signal
     * for ever. It is a statement about that root, not a way to opt a screen out.
     */
    async settled(page, prerendered = false, afresh = () => {}) {
      const live = contract && !prerendered;
      const sel = live ? `main#main[${SCREEN}]` : `main#main[${SCREEN}], #main *`;
      const once = async () => {
        const el = await page.waitForSelector(sel, { timeout: timeoutMs }).catch(() => null);
        return el ? ((await page.evaluate(screenOf)) ?? UNCONTRACTED) : null;
      };
      let state = await once();
      /* ONE RELOAD BEFORE IT IS A FINDING. On a shared two-core runner a screen that settles in a second
         locally can miss the window, or catch the record mid-boot and draw its error card; that is the
         runner, not the screen. A screen that fails twice is the screen. The count is printed, so a run
         that leans on the second look says so. */
      /* A REFUSAL THAT IS MEANT IS NOT THE RUNNER'S FAULT, so it is not looked at twice: reloading `/nowhere` bought
         nothing and, on a loaded runner, lost the screen it had. */
      const meant = state === 'refused' && [...MAY_REFUSE].some((r) => new URL(page.url()).pathname.endsWith(r));
      if (state === null || (state === 'refused' && live && !meant)) {
        /* AND WHAT THE FIRST LOOK SAID IS GONE WITH IT (`afresh`, `openPage`'s errors and failed answers). On a hosted
           runner a first look can lose its own modules (`Failed to fetch dynamically imported module`) and never settle;
           the reload draws the screen, and `layout`'s printed rule then read the dead document's errors as the screen's
           own: eleven routes over the two parts of run 37987998125, one for each screen that settled only on a reload. */
        afresh();
        const again = await page.reload().then(once, () => null);
        if (again !== null && again !== 'refused') retried++;
        /* THE SECOND LOOK IS THE ANSWER, even when it is none: the page was reloaded, so the first look describes a
           document that is gone, and auditing on its word measured a blank shell (`/nowhere` on a loaded runner). */
        state = again;
      }
      if (state === 'ready') anyReady = true;
      /* THEN WAIT FOR THE PAGE TO BE AT REST. A screen drawn from the tab's kept copy is settled before the reads behind it
         land, and a gate that moves on with those in flight has WebKit print each as refused. `html[data-quiet]` is the
         app saying no call is out and none is promised; it only changes WHEN the screen is looked at. The cap is short and
         its expiry is not a finding: a screen that never goes quiet was already measured on what it drew. `perf` passes
         no `quietMs` and measures drawn, as it always has. */
      if (quietMs > 0 && live && state !== null) {
        await page.waitForSelector('html[data-quiet]', { state: 'attached', timeout: Math.min(timeoutMs, quietMs) }).catch(() => null);
      }
      return state;
    },

    /** How many screens settled only on the second look, for the gate's summary line. */
    retried: () => retried,

    /**
     * The one decision every call site makes, and the one sentence it prints.
     *
     * `where` is how the gate names this page-run; `route` is the address, so that the two addresses
     * meant to refuse can be told from every other one.
     */
    check(where, route, state) {
      if (state === null) return `${where}  never settled in ${timeoutMs}ms, so nothing on it was measured`;
      if (state === UNCONTRACTED) return null;
      if (!SETTLED.has(state))
        return `${where}  says ${SCREEN}="${state}", and the contract has exactly ready, empty and refused`;
      if (state === 'refused' && !MAY_REFUSE.has(route))
        return `${where}  refused, so what was measured is an error card and not the screen`;
      return null;
    },

    /**
     * The aggregate, which is the property a per-page check cannot hold.
     *
     * A host that answers nothing draws the error card on every route, and a record with nothing in
     * it draws the empty one. Both sweep cleanly page by page. A run that never once saw a screen
     * with the record on it has measured the product's chrome, and that is a red run rather than a
     * quiet one. Silent before the contract is live, because there is no `ready` to count yet.
     */
    nothingDrawn() {
      return contract && !anyReady
        ? `${gate}: no screen on this run settled into \`ready\`. Everything measured was an empty or` +
            ` a refused page, so this run asserts nothing about a screen with the record drawn on it.`
        : null;
    },
  };
}

/* ── one way to open a page ────────────────────────────────────── */

/**
 * The plan for one page a gate opens, made without a browser, so a test reads it whole.
 *
 * `{ url, context, clock, prefs, waitUntil, prerendered }`: `context` is what `browser.newContext` is given, `clock` the
 * instant the page is pinned to (epoch milliseconds, or `null`), and `prefs` the settings the record keeps first.
 *
 * ONE CLOCK. A page draws on the record's clock: `clock`, or `record.now` when it is not given (`record.mjs` `clockOf`).
 * Neither is a throw and not a default, because the default was the runner's own date, which is how Today's date line
 * and Usage's "this month" were measured on a day the record never lived. `clock: null` leaves the page on the runner's
 * time, said in the call, for the one planted fault that has to show a gate going red on it.
 *
 * WHAT THE RECORD KEEPS IS KEPT BY THE RECORD. `prefs` is the person's own settings, key by key as `setPref` takes them,
 * and `null` takes one away. They are written through `record.setPref` before the page loads, so the page reads them
 * from `boot` exactly as a person's page does. No gate writes them into an answer. They are THIS page's: the record
 * keeps them past the page, so the next `openPage` on the same record hands back each one it does not keep itself, to
 * what the record held before, as a fresh context once dropped a cookie.
 *
 * `height` is `layout.viewportHeightPx` unless a gate says otherwise. `touch` is a phone: a coarse pointer and the
 * mobile viewport together, because a gate that emulated only a mouse never measured the size a thumb gets.
 * `serviceWorkers` is handed to the context as it is (`'block'` or `'allow'`), and left out when not given.
 *
 * `cookies` IS THE DEVICE'S OWN, name to value, put on the context for the page's origin before the page exists: the
 * first-paint copy a browser already holds (`bd_pref`), which is what `prefs` measures beside what the record keeps.
 * Never what the record keeps, which goes through `prefs`.
 */
export function pagePlan(
  url,
  { width, height, record, prefs = {}, clock, scheme, touch = false, reducedMotion = 'reduce', waitUntil = 'domcontentloaded', prerendered = false, serviceWorkers, cookies = {} } = {},
) {
  if (!Number.isInteger(width) || width <= 0) throw new Error(`openPage ${url}: width is a whole number of pixels, and was ${String(width)}.`);
  /* `record.now` is `null` for a base `record.mjs` did not start, and that is no clock, not `clock: null`: only the call
     may say the page runs on the runner's date. */
  const at = clock === undefined ? (record?.now ?? undefined) : clock;
  if (at === undefined || (at !== null && Number.isNaN(new Date(at).getTime())))
    throw new Error(`openPage ${url}: no clock. A page draws on the record's clock: pass the record, or its clock, or clock: null on purpose.`);
  const keeps = Object.entries(prefs ?? {});
  if (keeps.length > 0 && typeof record?.setPref !== 'function')
    throw new Error(`openPage ${url}: ${keeps.map(([k]) => k).join(', ')} can only be kept by a record, and none was given.`);
  return {
    url,
    context: {
      viewport: { width, height: height ?? budget('layout').viewportHeightPx },
      reducedMotion,
      hasTouch: touch,
      isMobile: touch,
      /* THE SITE SHIPS A HASH CSP IN A META TAG and `a11y` injects axe as an inline script. Bypassing it changes what
         a gate can run in the page, not what the page is. */
      bypassCSP: true,
      ...(scheme === undefined ? {} : { colorScheme: scheme }),
      /* `serviceWorkers: 'block'` FOR A GATE WHOSE PAGE MUST MAKE ITS OWN REQUESTS (`keys`): the read copy's worker
         answers `/api` from its own fetch, which `page.route` never sees. */
      ...(serviceWorkers === undefined ? {} : { serviceWorkers }),
    },
    clock: at === null ? null : new Date(at).getTime(),
    prefs: keeps,
    cookies: Object.entries(cookies ?? {}).map(([name, value]) => ({ name, value: String(value), url: new URL(url).origin })),
    waitUntil,
    prerendered,
  };
}

/**
 * A PAGE THAT LOST ONE OF ITS OWN MODULES, in each engine's words: Chromium's, WebKit's and Firefox's. The known flake
 * under a full run's load, and the runner's, not the screen's.
 */
export const LOST = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/u;

/** A LOAD THAT NEVER REACHED THE GATE'S PORT, in each engine's words: the server, or the record behind it, not up yet. */
export const UNREACHED = /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|Could not connect|Connection refused|network connection was lost|NS_ERROR_CONNECTION_REFUSED/u;

/** The settings `openPage` kept on each record, by its base, each with what the record held before it was kept. */
const KEPT = new Map();

/**
 * Keep one page's settings on the record, and first hand back each one an earlier page kept that this page does not:
 * a gate that drew the menu shape and then the default would otherwise draw the menu twice and call it the default.
 */
async function keepPrefs(record, prefs) {
  if (typeof record?.setPref !== 'function') return;
  const kept = KEPT.get(record.base) ?? new Map();
  KEPT.set(record.base, kept);
  const asked = new Set(prefs.map(([key]) => key));
  for (const [key, was] of [...kept]) {
    if (asked.has(key)) continue;
    await record.setPref(key, was);
    kept.delete(key);
  }
  if (prefs.length === 0) return;
  const held = typeof record.ask === 'function' ? ((await record.ask('boot'))?.value?.me?.prefs ?? {}) : {};
  for (const [key, value] of prefs) {
    if (!kept.has(key)) kept.set(key, held[key] ?? null);
    await record.setPref(key, value);
  }
}

/**
 * Open one page the one way every gate opens a page: the record's settings kept, the record's clock, the page's own
 * ready mark waited for, and its errors collected.
 *
 *   const opened = await openPage(browser, `${origin}${APP_BASE}/today`, { width: 390, touch: true, record, ready });
 *   // opened.state: what the screen settled into (`ready.settled`), `null` when it never did, which is a finding
 *   // opened.errors: `{ kind: 'uncaught' | 'console', text }`, for this load only; `printed.mjs` reads them
 *   // opened.failed: `{ status, path }` of each answer that was not ok, for this load only, so a console line the
 *   //   browser writes for one can be told apart as the host's answer (`printed.mjs` `hostsWord`)
 *   // opened.goto(url): the next address in the same page, its errors collected afresh; resolves to its state
 *   // opened.context: the caller's to close, in the `finally` of the `try` it opened it in
 *
 * `ready` IS REQUIRED. It is the gate's `readiness(...)`, and a page opened without waiting for its mark is the idiom
 * that ended in `.catch(() => {})` and measured an empty document. `init` is a script run before the page's own on
 * every load (`context.addInitScript`). The rest is `pagePlan`'s.
 *
 * THE CLOCK IS PINNED ON THE CONTEXT BEFORE THE PAGE EXISTS (`clock.setFixedTime`), so the first script that reads the
 * date reads the record's. Timers still run, so a screen that settles on a timer still settles.
 *
 * `again: { ms, said }` opens a load once more when the load itself was lost, not the screen (`LOST`, `UNREACHED`), and
 * is what `layout` passes; a gate that leaves it out sees every load once, as before.
 *
 * A THROW HANDS THE CONTEXT BACK FIRST: a caller holds no handle to a context it was never given.
 */
export async function openPage(browser, url, options = {}) {
  const { ready, record, again } = options;
  if (typeof ready?.settled !== 'function') throw new Error(`openPage ${url}: no readiness, so nothing would wait for the screen to settle.`);
  const plan = pagePlan(url, options);
  await keepPrefs(record, plan.prefs);
  const context = await browser.newContext(plan.context);
  try {
    if (plan.clock !== null) await context.clock.setFixedTime(plan.clock);
    if (plan.cookies.length > 0) await context.addCookies(plan.cookies);
    /* A SCRIPT BEFORE THE PAGE'S OWN (`init`), on the context, so it is in the first document and every one after.
       Added to a page after its first load it misses that load, and `keys`'s planted swallowed key went unseen. */
    if (options.init !== undefined) await context.addInitScript(options.init);
    const page = await context.newPage();
    const errors = [];
    const failed = [];
    page.on('pageerror', (e) => errors.push({ kind: 'uncaught', text: e instanceof Error ? e.message : String(e) }));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push({ kind: 'console', text: m.text() });
    });
    page.on('response', (r) => {
      if (!r.ok()) failed.push({ status: r.status(), path: new URL(r.url()).pathname });
    });
    const afresh = () => {
      errors.length = 0;
      failed.length = 0;
    };
    const goto = async (to) => {
      afresh();
      /* A LOAD THAT NEVER GOES QUIET IS A FIRST LOOK THAT FAILED, NOT A GATE THAT DIES. `a11y` waits for `networkidle`,
         and on a hosted runner a load can hang on one request for Playwright's thirty seconds: the throw ended the whole
         gate (`a11y threw rather than reporting`, run 37987998125), and under `self-test` it ended the seeded run before
         it named a seed. So it is `settled`'s rule, one more look before it is a finding: the address is opened again,
         afresh, and a second load that never goes quiet is `null`, a page never settled, said by name. Any other failure
         to navigate is still thrown. */
      const timedOut = (e) => {
        if (e?.name !== 'TimeoutError') throw e;
        return true;
      };
      const open = () => page.goto(to, { waitUntil: plan.waitUntil }).then(() => false, timedOut);
      const look = async () => {
        if (await open()) {
          afresh();
          if (await open()) return null;
        }
        return ready.settled(page, plan.prerendered, afresh);
      };
      if (again === undefined) return look();
      /* `again`: ONE MORE LOOK WHEN THE LOAD ITSELF WAS LOST, before what it drew is a finding. Under a full run's load
         a page can settle and still have lost one of its own modules (`LOST`), so the printed rule read the runner's
         failure as the screen's; or the gate's port, or the record behind it, was not answering yet (`UNREACHED`),
         which threw and ended the whole gate. Either is opened again, afresh, the second after `again.ms`. A second
         loss is the answer: a lost module is read as the screen's, and a port still not answering is a page that
         never settled. `again.said` is told why, for the gate's summary. */
      let why = null;
      let state = null;
      try {
        state = await look();
        if (errors.some((e) => LOST.test(e.text))) why = 'lost';
      } catch (e) {
        if (!UNREACHED.test(String(e?.message ?? e))) throw e;
        why = 'unreached';
      }
      if (why === null) return state;
      again.said?.(why);
      afresh();
      if (why === 'unreached') await new Promise((r) => setTimeout(r, again.ms));
      try {
        return await look();
      } catch (e) {
        if (!UNREACHED.test(String(e?.message ?? e))) throw e;
        return null;
      }
    };
    const state = await goto(url);
    return { context, page, state, errors, failed, plan, goto };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}
