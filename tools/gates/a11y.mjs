/**
 * The accessibility gate: axe-core over every route, in both schemes, at two widths.
 *
 *   node tools/gates/a11y.mjs
 *
 * WHY A GATE AND NOT A CHECKLIST. Every rule in here is one a machine can decide: a control with
 * no name, a heading level skipped, an `aria-*` that names nothing, contrast below the floor. Those
 * are exactly the failures that arrive by accident during a redesign and survive review, because
 * nothing about them looks wrong in a screenshot. The judgement calls axe cannot make (is the
 * reading order sensible, does the keyboard path make sense, is the copy comprehensible) stay with
 * a person, and this gate does not pretend otherwise: passing it is the floor, not the ceiling.
 *
 * BOTH SCHEMES, because contrast is the most common failure and half of it is invisible in the
 * scheme you happen to be developing in. Two widths, because the phone layout swaps the table for
 * cards and the rail for a tab bar: different markup, different names, different failures.
 *
 * AND IT SAYS WHAT IT AUDITED, PER SURFACE, BECAUSE ITS TOTAL WAS QUOTED FOR A PAGE IT BARELY
 * TOUCHED. This gate used to end on one line: `244 page-runs, 0 rule(s) with findings`. That line was
 * copied into `apps/site/DESIGN-NOTES.md` as the accessibility evidence for a marketing home-page
 * redesign, under a heading about what was measured on the finished page. Twelve of the 244 were the
 * marketing site and four of those were its home page; the other 232 were the record app and its
 * three variant records, none of which the redesign touched. The number was exactly right and the
 * sentence it was standing in was not, and nobody was being careless: a single total is the only
 * thing the gate gave them to quote. `surfaces` and `per` are the two halves of the fix, and the
 * breakdown printed under the total is what it buys.
 *
 * It serves `build/` itself for the same reason the screenshot script does, and reports and exits 3
 * when there is no build, so `pnpm gates` stays useful on a fresh checkout.
 *
 * THAT SENTENCE READ `EXITS 0` UNTIL TODAY, AND THE CODE HAS NOT AGREED WITH IT FOR SOME TIME.
 * `self-test`'s `silent-pass` grep exists because two gates reported an unbuilt tree and then exited 0,
 * which `run.mjs` counts as a gate that passed; the bottom of this file returns 3 and spells out why.
 * The header was the last line in it still promising the defect, which is the same failure as the one
 * the paragraph above is about: a true-sounding sentence nobody had reason to re-read.
 *
 * `color-contrast` is included but reported separately. The theme's own proof already guarantees
 * the token PAIRS clear their floors; what axe adds is the composition: a token used against a
 * surface it was never solved for. That is a real class of bug and worth catching, but a false
 * positive on it means the theme is right and one call site is wrong, which reads differently from
 * a missing button name.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import { APP_BASE, appShell, budget, readiness } from './lib.mjs';
import { answers, forward, forwards, startRecord, VARIANTS as RECORDS } from './record.mjs';
import { routesOf } from './routes.mjs';

/**
 * AND WHY THIS GATE DECLARES NO `needs`, WHICH IS THE QUESTION A READER OF `layout.mjs` ARRIVES
 * WITH. `52 §5.1` step 2 lets a gate name a prerequisite the runner checks, and `layout` names
 * `web-build` because it skips on `apps/web/build` alone. This gate does not: `surfaces` below names
 * five builds, each skipped by name on its own, and a tree with the marketing site built and the
 * record app not still gets a real contrast audit of the shop window. A declaration of `web-build`
 * here would be the runner refusing a run that had something to measure, which is a worse failure
 * than the one step 2 exists to fix, because it is silent in the direction of measuring less.
 *
 * STEP 3 DOES NOT CHANGE THAT. `run.mjs` reads `mod.needs` off this module, finds nothing, and runs
 * the gate, which is the same answer it reached by finding no `export const needs` in the text. The
 * absence is the declaration here, and the paragraph above is the whole of its argument.
 */

/**
 * Addresses a surface names by hand that the derivation for its app does not yield.
 *
 * A HAND-WRITTEN LIST NAMING A ROUTE THAT NO LONGER EXISTS IS THE SAME DECAY AS A LIST THAT NEVER
 * GREW, and it is the quieter of the two. `spa: true` serves the shell for any address that matches
 * no file, so the gate would load a not-found screen, audit it, count it as a page-run and print a
 * green line. The three variant records are the only surfaces that still name routes by hand, and
 * this is what keeps their two or three addresses honest.
 *
 * A QUERY STRING IS A SECOND ADDRESS OF A ROUTE AND NOT A ROUTE. `busy` drives `/search?q=renewal`
 * because the point of that pass is a list with something in it, and the route is `/search`. Written
 * without the split, this check went red on the day it was written, naming a route the app has.
 *
 * `routes: null` IS A SURFACE WITH NO LIST TO BE WRONG, so it contributes nothing here: its addresses
 * came out of the derivation this is comparing against.
 *
 * AND WHAT IT COMPARES AGAINST IS THE SAMPLED ADDRESSES, WHICH IS WHY THE SENTENCE SAYS ADDRESS AND
 * NOT ROUTE. `routes.mjs` samples `/r/[register]` once, as `obligations`, so the derived list holds
 * `/r/obligations` and nothing else under it. Measured: `stray` on a variant naming `/r/invoices`
 * reports it, and `/r/invoices` is a route the app certainly has. The first wording of this line said
 * `has no such route`, which is a false sentence in exactly that case, and a check whose red reads as
 * a lie about the app is a check somebody deletes rather than answers. The finding is still right,
 * because an address outside the derivation is an address this gate cannot reach through
 * `routes.mjs`, and the fix for a variant that wants a second register is a second sample there.
 */
export const stray = (apps, derived) =>
  apps.flatMap((a) =>
    (a.routes ?? [])
      .filter((r) => !derived[a.tree].routes.includes(r.split('?')[0]))
      .map((r) => `${a.name} names ${r}, which is not an address ${a.tree}'s derivation yields`),
  );

/**
 * EVERY SURFACE THIS GATE AUDITS, AND WHICH ROUTES OF IT.
 *
 * IT IS OUT HERE AND EXPORTED because the only way to ask this gate what it covers used to be to read
 * it, and for two routes the answer a reader got was wrong. `test/a11y-coverage.test.mjs` imports this
 * and compares it against the route directories in ten milliseconds, measured, which is a question
 * worth being able to put without the six minutes and five builds the gate itself needs.
 *
 * THE SITE'S LIST WAS TYPED OUT AND IT WAS THREE OF FIVE. It read `['/', '/pricing', '/changelog']`,
 * so `/legal` and `/404` had never been audited by this gate at all, and those are the two routes
 * `164ad664` rebuilt. It rebuilt them on an argument this file should have heard first:
 * `apps/site/scripts/shot.mjs` says "a page nobody looks at is a page nobody notices has stopped
 * matching the rest of the site", and taught itself to photograph five routes instead of three. The
 * gate stayed at three, so the two pages a stranger meets by accident were photographed and measured
 * never. Derived from the tree now, which is the repair the record app's list already had: the two
 * browser gates each held a hand-written list, the lists disagreed, one was missing `/s/[token]`, and
 * neither had ever been compared to the route directory.
 *
 * AND THE RECORD APP WAS CHECKED FOR THE SAME HOLE RATHER THAN ASSUMED CLEAN. It has none. `web` is
 * `routes: null`, so all 27 of its route files are covered, as 38 addresses (the settings route is
 * sampled twelve times) plus the three extras, which is the 41 that a reader of this gate's total can
 * now see accounted for. What the variants carry is a list each, and `stray` above is why those are
 * still trustworthy: all five of their addresses are routes the app has.
 *
 * THE EXTRAS ARE SECOND ADDRESSES OF ROUTES ALREADY IN THE LIST (a different page, a different
 * track), because one sample proves the route renders and a second proves the DECLARATION does.
 * `/nowhere` is in `MAY_REFUSE`: it is the not-found screen, audited on purpose rather than by
 * accident.
 *
 * THE HUB'S TABS AND A NEW AUTOMATION ARE EXTRAS FOR THE SAME REASON. `/automations` draws each kind
 * that runs by itself under one path, picked by `?tab=`, so the tree yields one address and every tab
 * but the first went unaudited; and `/automations/[id]` is sampled with an id no record has, so the
 * canvas was audited only as "not found" until `new` opened it with its trigger card, its sticky bar
 * and the keys a card answers. The counts in the paragraph above were measured before these extras.
 *
 * `tree` IS WHICH APP'S ROUTES A SURFACE IS A PASS OVER, and it is not `name`: four of the five
 * surfaces are builds of `apps/web`, three of them variant records of it, and a check that confused
 * the surface with the tree would look for `/settings/billing` in the marketing site.
 */
export async function surfaces(root = join(import.meta.dirname, '..', '..')) {
  const derived = {
    web: await routesOf(join(root, 'apps', 'web'), [
      '/p/kiln',
      '/t/3',
      '/nowhere',
      '/automations?tab=scheduled',
      '/automations?tab=scripts',
      '/automations?tab=doors',
      '/automations/new',
    ]),
    site: await routesOf(join(root, 'apps', 'site')),
  };

  /**
   * BOTH APPS. The record app is where the interesting failures are, but the marketing site is the
   * first page anybody ever sees and the only one they meet before deciding whether to trust the
   * rest. A contrast failure there is a contrast failure in the shop window. It is prerendered
   * rather than a shell, so it needs no fallback and has no states to drive.
   */
  const APPS = [
    { name: 'web', tree: 'web', root: join(root, 'apps', 'web', 'build'), routes: null, spa: true, states: true },
    /**
     * THE OTHER RECORDS, for the half of every branch the gates' own record cannot draw.
     *
     * The same build, with `/api` forwarded to one of `record.mjs`'s `VARIANTS` for the length of the pass, and only
     * the routes where that record differs: the point is that the other side is drawn at all and passes the same
     * rules, not a second sweep of the same screens. They were three builds, `build-cloud/`, `build-quiet/` and
     * `build-busy/`, that differed only in the sample's constants, so once no screen read those they audited the main
     * build's screens again (wave C2 of `loop/research-no-sample.md`). A record is always there to be asked, so
     * a variant is never skipped for want of a build.
     */
    /* `states` IS NOT `spa`, AND THEY WERE ONE FLAG. `spa` says *serve the shell for a route with no
       file*, which every variant needs; running the state scenarios is a different question, and
       every variant answered yes to it because the two facts shared a boolean.

       EVERY SCENARIO STANDS ON `/r/obligations`, `/`, `/p/kiln` OR `/r/nope`, routes no variant
       changes. A variant differs in its host, its machines and keys, or its decisions, which is why each
       one names the two or three routes where that shows. So the three variants contributed
       **156 audits of 156 identical pages**: 13 scenarios x 4 passes x 3 variants, 44% of this
       gate's run, spent proving that opening the palette on a record with no machines connected draws
       the same palette.

       THOSE SENTENCES SAID `THIRTEEN` AND `STATES` HOLDS FOURTEEN, counted off the list below. The 156
       is left as it was measured, because it records a run that happened rather than arithmetic to
       redo, and `toast`'s own comment says it arrived after: it is the scenario the list did not have.
       The summary this gate prints now names the count it actually drove, which is a number no comment
       can fall behind.

       A variant earns `states: true` the day a scenario lands on a route it changes. */
    ...RECORDS.map((v) => ({ name: v.name, tree: 'web', root: join(root, 'apps', 'web', 'build'), routes: v.routes, spa: true, record: v.name })),
    { name: 'site', tree: 'site', root: join(root, 'apps', 'site', 'build'), routes: null, spa: false },
  ];

  return {
    apps: APPS.map((a) => ({ ...a, routes: a.routes ?? derived[a.tree].routes })),
    /* A ROUTE WITH NO SAMPLE IS A FAILURE AND NEVER A SKIP, which is `routes.mjs`'s own rule, and the
       tree it came from is named because two trees are derived here now. */
    unsampled: Object.entries(derived).flatMap(([tree, d]) => d.unsampled.map((u) => `${tree}: ${u}`)),
    strays: stray(APPS, derived),
  };
}

/**
 * EVERY SURFACE, AUDITED, AS A FUNCTION THE RUNNER CALLS. `52 §5.1` step 3.
 *
 * IT OWNS A PORT, A RECORD AND A BROWSER, AND A CALLED GATE HAS TO GIVE THEM BACK, which a spawned
 * one got for nothing: the process ending closed whatever it held. In this process a server left
 * listening is a handle the runner cannot exit past, and a browser left running is a
 * runner that never exits.
 *
 * AND `axe.min.js` IS READ INSIDE THE FUNCTION RATHER THAN BESIDE THE IMPORTS, which is not tidying.
 * It was a top-level `await readFile`, so a tree with no `node_modules/axe-core` threw ENOENT while
 * `run.mjs` was IMPORTING this file to read its `needs`, which is before any gate has run and outside
 * every report the runner makes. Read here, the same absence is this gate going red with a sentence.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to this file's own two directories up, which is what the
 * constant it replaces computed. Nothing here has ever read `process.cwd()`.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function a11y(root = join(import.meta.dirname, '..', '..')) {
  const { apps: APPS, unsampled, strays } = await surfaces(root);
  const AXE = join(root, 'node_modules', 'axe-core', 'axe.min.js');
  const A = budget('a11y');

  /**
   * WHAT THIS GATE IS ALLOWED TO AUDIT.
   *
   * `networkidle` is a race and not a contract. It means 500ms with no request in flight, which today
   * usually covers a call issued during hydration because the entry chunks keep the network busy right
   * up to it. A call issued from an `$effect` after paint, or the second of a serial pair, or a loaded
   * runner, each open a gap wider than that, and then `#main *` matched the chrome and axe audited the
   * chrome: `html-has-lang`, `landmark-one-main` and the contrast of a rail, with zero rows for
   * `color-contrast`, zero row menus for `button-name` and zero `[data-intent]` for the rule this file
   * argues hardest for. Green, over nothing.
   *
   * From `APPS[0]`, the record app, because that is the shell the contract belongs to. The marketing
   * site is `spa: false` and is passed as prerendered below.
   */
  const ready = readiness('a11y', budget('ready').settleTimeoutMs, APPS[0].root);

  /* BOTH DERIVATIONS ANSWERED FOR BEFORE A PORT IS BOUND OR A BROWSER LAUNCHED. A coverage hole is a
     fact about the tree, and two full runs of this gate on this machine took 380s and 340s, so a
     tree that has one should not first spend them measuring what it does cover. */
  if (unsampled.length) {
    for (const u of unsampled) console.error(`  a route with no sample address: ${u}`);
    return 1;
  }
  /* AND A SURFACE THAT NAMES AN ADDRESS THE DERIVATION DOES NOT YIELD IS RED HERE rather than a
     page-run that audited the not-found screen and counted. See `stray`. */
  if (strays.length) {
    for (const s of strays) console.error(`  a surface names an address this gate cannot derive: ${s}`);
    return 1;
  }

  /**
   * The states a route can only be IN, which is where the accessibility bugs actually live.
   *
   * Everything above is a page at rest, and a page at rest is the easy case. A dialog that never
   * moves focus into itself, a menu with no accessible name, a toggle whose `aria-pressed` never
   * flips, a selection count nothing announces. None of those exist until somebody presses a key,
   * and none of them are reachable by a crawler that only visits URLs.
   *
   * Each one names the keys to press and what should exist afterwards. The `expect` is not
   * decoration: if a keystroke silently stops working, the scenario would otherwise still "pass" by
   * auditing the page underneath it, and the gate would go green over a dialog that no longer opens.
   */
  const STATES = [
    /* THE FILTER DRAWER IS GONE AND `f` OPENS NOTHING. It rendered the same enum fields as the chips
       in the toolbar, as checkboxes, behind a scrim, over the identical controls still visible
       underneath. So this scenario audited a second copy of the row above it. What is worth auditing
       is that the chips themselves carry their state to somebody who cannot see the raised segment. */
    /* AND THE CHIPS BECAME MENUS. A list with three or more choice fields draws each as a menu of its values, where a
       value is a `menuitemcheckbox` carrying `aria-checked`, and a phone draws one Filter button and a sheet of
       `aria-pressed` values. `.segmented` is left only for a list with one or two fields, and Obligations has more, so
       this scenario waited on a control the screen no longer draws. Each width now opens the control it has, and the
       state is audited with the values in view, which is where somebody who cannot see a tick needs it said. */
    { name: 'grid: filter menu', route: '/r/obligations', click: '.menu-trigger:has(.sift)', expect: '[role="menu"] [role="menuitemcheckbox"][aria-checked]', wide: true },
    { name: 'grid: filter sheet', route: '/r/obligations', click: '.sift-sheet', expect: 'dialog[open] .filter-value[aria-pressed]', narrow: true },
    { name: 'grid: create sheet', route: '/r/obligations', keys: ['n'], expect: 'dialog[open]' },
    { name: 'grid: display options', route: '/r/obligations', keys: ['v'], expect: 'dialog[open]' },
    { name: 'grid: peek drawer', route: '/r/obligations', keys: ['p'], expect: 'dialog[open]' },
    /* Desktop only, and that is the product being right rather than the gate being lax: below 900px
       the register draws declared CARDS instead of a grid, so there are no cells to select. */
    { name: 'grid: selection', route: '/r/obligations', keys: ['x', 'j', 'x'], expect: '[aria-selected="true"]', desktop: true },
    { name: 'grid: row menu', route: '/r/obligations', keys: ['Shift+F10'], expect: '[role="menu"]' },
    { name: 'keymap sheet', route: '/r/obligations', keys: ['?'], expect: 'dialog[open]' },
    { name: 'palette', route: '/', keys: ['/'], expect: '[role="listbox"], [role="dialog"]' },
    { name: 'page: declaration', route: '/p/kiln', keys: ['Shift+E'], expect: '.source, pre' },
    /* Arranging has no key: it is a button, and only on desktop. 13 §10 keeps authoring off phones,
       and `.arrange-slot` is display:none below 900px rather than a control that exists and refuses. */
    { name: 'page: arrange mode', route: '/p/kiln', click: '.arrange-slot button', expect: '[role="listitem"]', desktop: true },
    /* THE EMPTY STATES, WHICH NO ROUTE AT REST EVER REACHES. `19 §6` designs five and says collapsing
       them is the failure; an audit measured `no-results`, `cleared`, `no-permission` and `error`
       rendering zero times across forty-two routes, so four fifths of that section had never been in
       front of this gate. Two of them are reachable from an address, and these are those two. The
       other three need a record shaped differently from the seed: `no-data-yet` needs an empty list,
       which is why the state was unreachable in the product for as long as it was. */
    { name: 'empty: no results', route: '/r/obligations?q=zzzzz', keys: [], expect: '.empty[data-kind="no-results"]' },
    { name: 'empty: not found', route: '/r/nope', keys: [], expect: '.empty[data-kind="error"]' },
    /* A TOAST, WHICH IS ONE KEYSTROKE AWAY AND WAS IN FRONT OF NO SCENARIO. The list covered sheets,
       menus, the palette, arrange mode and two empty states; the surface that appears after almost
       every action in this mock-up appeared in none of them.

       `Backspace` AND NOT `e`. `e` used to answer with a sentence about what it would have done, and
       it opens the cell for editing now, so the key this scenario was built on stopped raising a
       toast the day it started doing its job. Archive is the verb that still raises one, and it is
       the better subject anyway: it is the toast a person actually meets, it carries an Undo, and a
       toast with a control in it is the harder thing for this gate to be right about. */
    { name: 'toast', route: '/r/obligations', keys: ['Backspace'], expect: '.toast' },
  ];

  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
  };

  const axeSource = await readFile(AXE, 'utf8');

  /** The app the server is currently answering for. The outer loop sets it before each pass. */
  let current = APPS[0];

  /**
   * AND FROM HERE EVERY HANDLE IS GIVEN BACK EVEN WHEN THE AUDIT THROWS, which it was not.
   *
   * The three closes used to stand together after the last surface on the straight-line path, with no
   * `try` above them, and this gate is the sixth with that shape rather than one of the five
   * `3e9d5ea0` repaired: `layout`, `keys`, `prefs`, `passkey` and `queue` were found by a grep and
   * this one was not. Two full runs of it took 380s and 340s over five surfaces, four passes each and
   * fourteen state scenarios, and almost every line of that can throw: an `axe.run` past its timeout,
   * `browser.newContext` at one of two widths, a `click` on a control a redesign moved,
   * `chromium.launch()` where no browser is installed. Any of those skipped all three closes.
   * `run.mjs` calls this gate IN-PROCESS, so what was skipped stayed open for the rest of the run.
   *
   * DRIVEN ON 21 SEPTEMBER rather than argued: a scratch copy of this file on a port of its own,
   * throwing immediately after `chromium.launch()`, with the operating system asked afterwards whether
   * the port came back. Before the `finally`, a second `listen` on that port came back **EADDRINUSE**,
   * `getActiveResourcesInfo()` still held the browser's `ProcessWrap` and its four `PipeWrap`, and the
   * process was still alive three seconds later with nothing left to do. After it, the same throw
   * leaves that `listen` answering **free**, leaves no `ProcessWrap` and no `PipeWrap`, and the process
   * reaches the end of its event loop and exits on its own.
   *
   * THE PROBE BINDS THE WAY THIS GATE BINDS, WITH NO HOST, and the first one did not. `server.listen`
   * here names a port and no address, which takes the dual-stack `::`, and a probe on `127.0.0.1`
   * reported the port FREE against a gate that was still listening on it: Windows let the narrower
   * bind sit beside the wider one. A probe that is not the bind the next gate makes proves nothing.
   *
   * `let`, BECAUSE THE FINALLY HAS TO SEE THEM HALF-BUILT: the run that dies before the browser exists
   * is the run this is for, and a `const` inside the block is out of scope for the hand-back.
   *
   * THE RECORD IS ONE OF THEM AND IS TAKEN INSIDE THE `try`, as `passkey.mjs` already took it. It used
   * to be awaited on the line above these declarations, on the argument that nothing between that line
   * and the `try` could throw, which held only until somebody added a line. On 22 September one such
   * line was added there in a scratch copy, and `test/handles.test.mjs` named the record as opened
   * outside the `try` whose `finally` closes it. A record that failed to start is still not one to hand
   * back: a `startRecord()` that throws has already closed what it built (`record.mjs`), so `record`
   * stays `null` and the `finally` does not close it a second time.
   */
  let record = null;
  let server = null;
  let browser = null;
  try {
    /* THE RECORD THE REGISTER LIST READS, forwarded to from this gate's own port, and its variants under the same
       handle, so the one `record.close()` below gives all of them back. See `record.mjs`. */
    record = await startRecord(0, { variants: true });

    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (forwards(url.pathname)) return forward(req, res, current.record === undefined ? record.base : record.variants[current.record]);
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (rel.includes('..')) return res.writeHead(400).end();
      for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
        const file = join(current.root, candidate);
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) continue;
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        return createReadStream(file).pipe(res);
      }
      /* THE SPA FALLBACK, and leaving it out made this gate lie. `svelte.config.js` builds with
         `fallback: 'index.html'`, so the deployed host answers every unmatched path with the shell and
         lets the router decide. A server that 404s instead hands axe an empty document, and an empty
         document fails `html-has-lang`, `landmark-one-main` and `page-has-heading-one`. That is
         sixty-four findings that say nothing about the app. Serve what production serves.

         A ROUTE SEGMENT MAY CONTAIN A DOT. `/v/obligations.open` is a view id, not a file, so the
         test cannot be "has an extension". That 404s a real page and blames the app for having no
         `lang`. It is "has an extension WE SERVE": anything in `TYPES` that is missing stays a 404, so
         a genuinely broken asset still fails loudly, and everything else gets the shell. Worth knowing
         when this is deployed, because an SPA fallback that excludes dotted paths (several hosts
         default to exactly that) would 404 every view in production. */
      /* THE RECORD APP'S SHELL IS `build/app/index.html`, because the app is served under `/app` (`lib.mjs`). */
      const shell = current.spa ? appShell(current.root) : join(current.root, 'index.html');
      const asset = Object.hasOwn(TYPES, extname(rel));
      if (current.spa && !asset && (await stat(shell).catch(() => null))?.isFile()) {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        return createReadStream(shell).pipe(res);
      }
      res.writeHead(404).end();
    });
    /* AN EPHEMERAL PORT, AS `passkey.mjs` AND `queue.mjs` TAKE ONE. This gate used to bind a fixed
       port out of `budgets.json`, and the CI runner is the same PC where sessions run this gate by
       hand, so a CI run and a desk run of it could meet on one port and one of the two would go red
       for a reason that is not in the tree (`loop/research-ci-gates.md` §2). Port 0 is a port the
       operating system hands out free at the moment of the bind, and every URL below is built from
       what it handed out. `localhost` still, because the bind names no host and takes the dual-stack
       `::`, which is what `localhost` reaches first on this machine. */
    await new Promise((r) => server.listen(0, r));
    const PORT = server.address().port;
    await answers(`http://localhost:${PORT}`);

    browser = await chromium.launch();
    /** `id -> { help, nodes: Set<'route scheme@width  target'> }`, so one bug is one line however often it repeats. */
    const found = new Map();
    /** Apps this run did not look at. A skip is not a pass. See the exit at the bottom. */
    const skipped = [];
    let checked = 0;
    /** Scenarios whose keystroke did not produce the state it names: a silently dead key. */
    const broken = [];
    /**
     * Pages that were never in a state to audit, which is a different sentence from `broken`.
     *
     * IT USED TO BE SAID AS `broken`, AND THAT SENT READERS INTO THE KEY HANDLER. A scenario whose route
     * never settled printed `after n, no dialog[open]`, which reads as a dead keystroke and is a bug in
     * the gate's timing. These say the route never settled, and name the route.
     */
    const unsettled = [];
    /** `element[intent] -> Set<'route scheme@width'>`: a meaning carried by colour and nothing else. */
    const mute = new Map();

    /**
     * WHAT EACH SURFACE CONTRIBUTED, because this gate's total was once quoted as evidence for a page
     * inside it.
     *
     * `244 page-runs, 0 rule(s) with findings` was the whole of what the old summary said, and that line
     * went into `apps/site/DESIGN-NOTES.md` as the accessibility evidence for a marketing home-page
     * redesign. Twelve of the 244 were the marketing site and four of those were the home page; the
     * other 232 were the record app and its three variant records, which the redesign never touched.
     * Every digit of it was true. Sitting under a heading that read "What was measured on the finished
     * page, a third time", it said 244 measurements of that page, and nothing this gate printed let a
     * reader tell the two readings apart.
     *
     * SO A RUN IS COUNTED AGAINST THE SURFACE IT WAS ON, and the total is printed with the breakdown
     * under it. `the site: 20 page-runs over 5 route(s)` cannot be quoted for the record app, and 244
     * could be quoted for anything.
     *
     * A SURFACE THAT WAS NOT BUILT KEEPS ITS ROW AND PRINTS A ZERO. Dropping it would leave the reader
     * exactly where the 244 left them: holding a total with no way to see which surfaces are inside it,
     * and a missing surface is the reading that costs the most.
     */
    const per = new Map(APPS.map((a) => [a.name, { runs: 0, routes: new Set(), states: new Set(), built: true }]));

    /**
     * A SEEDED RUN IS A NEGATIVE, AND A NEGATIVE NEEDS ONE PAGE. The same argument as `layout.mjs`'s:
     * `self-test` runs this gate again with `BRAINDOG_GATE_SEED=intent` to prove it goes red on an
     * intent with no glyph, and it was proving that over 356 page-runs. The seeded anchor is prepended
     * to every page, so one scheme at one width says it. Only when the seed is set.
     *
     * THE THREE OF THEM ARE OUT HERE NOW, AND THAT IS THE SUMMARY'S DOING. `SEEDED` was declared inside
     * the per-app loop and the two matrices were spelt inline in the `for` headers, so the only place
     * that knew how many schemes and widths a run covered was the loop running them. The breakdown below
     * has to say `dark and light, at 1440 and 390`, and a summary that recomputed those from the budget
     * would print the full matrix for a seeded run that drove a quarter of it.
     */
    const SEEDED = Boolean(process.env.BRAINDOG_GATE_SEED);
    const SCHEMES = SEEDED ? ['dark'] : ['dark', 'light'];
    const WIDTHS = SEEDED ? A.widths.slice(0, 1) : A.widths;

    for (const app of APPS) {
      if (!(await stat(app.root).catch(() => null))) {
        /* NOT A PASS. Skipping one app silently dropped the marketing site from every run that did not
           build it, and the gate still printed its own green line.

           A VARIANT RECORD IS SERVED FROM THE MAIN BUILD, so it is missing exactly when the record app is, and
           that is already the skip above it in `APPS`. */
        console.log(`  a11y: no ${app.name} build to check. \`pnpm build\` first, and CI does.`);
        skipped.push(app.name);
        per.get(app.name).built = false;
        continue;
      }
      current = app;
      /* THE PORT ANSWERS FOR THE VARIANT BEFORE ANYTHING IS AUDITED ON IT, as `answers` proved of the gates' own record
         above: a pass whose forward still pointed at that record would audit it a second time under another name. */
      if (app.record !== undefined) await answers(`http://localhost:${PORT}`);

      for (const scheme of SCHEMES) {
        for (const width of WIDTHS) {
          const context = await browser.newContext({
            /* THE SITE SHIPS A HASH CSP IN A META TAG, and `addScriptTag` below injects axe as an inline script, which
               that policy refuses. Bypassing it here changes what the audit can run, not what the page is: the page
               under test is the one production serves, policy and all. */
            bypassCSP: true,
            viewport: { width, height: 900 },
            colorScheme: scheme,
            // Motion off: axe reads a mid-animation opacity as the real one, and an entrance animation
            // would have every panel failing contrast for the first 280ms of its life.
            reducedMotion: 'reduce',
          });
          const page = await context.newPage();
          /* A gate that runs a browser over sixty-eight pages and prints nothing for four minutes is a
             gate people learn to kill. One line per pass, flushed as it goes. */


          /** Loads a route, waits for it to be real, injects axe, and RETURNS what the screen settled into. */
          const open = async (route) => {
            /* UNDER `/app` FOR THE RECORD APP, and the route itself as the tree names it, because `MAY_REFUSE` is
               written in those words. The site is prerendered at the root. */
            await page.goto(`http://localhost:${PORT}${app.spa ? APP_BASE : ''}${route}`, { waitUntil: 'networkidle' });
            /* The one readiness site in this gate, because every load goes through here. The `5000` that
               used to be written on this line was a bare literal in a directory whose shared file opens by
               forbidding them; the number is `ready.settleTimeoutMs` now, and its expiry is a value. */
            const state = await ready.settled(page, !app.spa);
            /* Two things, and the second is about the gate being TRUSTWORTHY rather than about the app.
               An un-laid-out rowgroup has no colours to measure, which is why the screenshots do it too.
               And every transition is killed outright: `reducedMotion` suppresses the animations that
               honour the media query, but a `transition` on a hover or focus colour is not covered by it,
               and axe measuring a colour halfway through one is a contrast finding that appears and
               disappears between runs. A gate that fails one run in ten is a gate people re-run until it
               passes, which is the same as not having one. */
            await page.addStyleTag({
              content:
                '.rowgroup{content-visibility:visible !important}' +
                '*,*::before,*::after{transition:none !important;animation:none !important}',
            });
            /* THE GATE'S OWN PROOF THAT ITS NEW RULE LOOKS AT ANYTHING. With `BRAINDOG_GATE_SEED=intent`
               a row wearing an intent and carrying no name for it is put into `#main` (the exact bug the
               rule is for), and the run must go red. Here rather than in a fixture tree for the same
               reason the layout gate's is: the thing under test is a real browser over a real build. */
            if (process.env.BRAINDOG_GATE_SEED === 'intent')
              await page.evaluate(() => {
                /* AN ANCHOR, NOT A `div`, and that is the whole of what the negative is worth.
               
                   The first version seeded a bare `<div>`, which the old exemption did not cover. So the
                   gate proved itself against the one shape that could not slip through, while every phone
                   card, being `<a class="card" href=…>`, was exempt. A negative that cannot fail the way
                   the rule fails is a negative that certifies nothing. */
                const el = document.createElement('a');
                el.className = 'seeded';
                el.href = '#seeded';
                el.dataset.intent = 'bad';
                el.textContent = 'a meaning carried by colour and nothing else';
                document.getElementById('main')?.prepend(el);
              });
            await page.addScriptTag({ content: axeSource });
            return state;
          };

          const audit = async (where) => {
            const result = await page.evaluate(async () => {
              // @ts-expect-error injected
              return await window.axe.run(document, {
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
                resultTypes: ['violations'],
              });
            });
            /**
             * COLOUR NEVER CARRIES MEANING ALONE (`13 §5.1`), and axe cannot decide it.
             *
             * "The glyph is part of the intent token, not a choice at the call site. There is exactly one
             * table mapping intent → (role, glyph), and it is the only path by which an intent reaches the
             * DOM. A component cannot render `warn` without its glyph because there is no API that lets
             * it." There WAS such a path: `data-intent` is an attribute, and four components set it and
             * drew a coloured edge and nothing else. Measured on `/r/obligations`: sixteen rows carrying
             * an intent, zero elements naming one. So an overdue invoice and a paid one were the same
             * row to a screen reader and the same row to anybody who does not see red.
             *
             * WHAT COUNTS AS NAMED. The intent's own glyph, `role="img"` with the `TONES` label, anywhere
             * inside the element. That is the shape every primitive that got it right already emits, so
             * the rule is "do what `List` does" rather than a new contract.
             *
             * WHAT IS EXEMPT: an element whose own TEXT is the meaning, and the list is named rather
             * than described. A `.btn` reading `Uninstall` or `Stop the run` is not telling you it is
             * destructive with colour. It is telling you with the verb. A `.count` or `.badge` is a
             * number, and the tint is emphasis on a fact already written out. A `.toast` is a whole
             * sentence in a live region: "Nothing was written" says what happened, and the amber agrees.
             *
             * IT WAS WRITTEN AS `button, a[href], .count, .badge` AND EXEMPTED THE SURFACE IT WAS FOR.
             * Every phone card is `<a class="card" href=… data-intent=…>`, so all sixteen rows on
             * `/r/obligations` at 390 were exempt. That is one of the four components the rule was
             * written to protect, and stripping every glyph out of them left the gate green. Being a
             * link is not being a sentence. The exemption is by class now, and each class is here with
             * its reason.
             *
             * The guard was also written `el.closest(sel)?.contains(el) && el.matches(sel)`, and an
             * element always contains itself, so the first half could never decide anything. Dead code
             * inside the test that decides whether the rule applies.
             */
            const unnamed = await page.evaluate(() => {
              const out = [];
              for (const el of document.querySelectorAll('[data-intent]')) {
                if (el.matches('.btn, .count, .badge, .toast')) continue;
                if (el.querySelector('[role="img"][aria-label]')) continue;
                /* A NESTED INTENT IS ONE INTENT. `Block` puts `data-intent` on the figure AND on its own
                   figcaption; the glyph is in the caption, so the figure is named through it. */
                if (el.querySelector('[data-intent] [role="img"][aria-label]')) continue;
                out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}[${el.getAttribute('data-intent')}]`);
              }
              return [...new Set(out)];
            });
            for (const u of unnamed) {
              const at = mute.get(u) ?? new Set();
              at.add(`${app.name} ${where} ${scheme}@${width}`);
              mute.set(u, at);
            }

            checked++;
            /* THE SAME RUN, COUNTED TWICE ON PURPOSE: once for the total and once against the surface it
               was on. `where` is an address for a page at rest and a scenario's name otherwise, which is
               the distinction the node labels below already rest on. */
            const p = per.get(app.name);
            p.runs++;
            (where.startsWith('/') ? p.routes : p.states).add(where);
            process.stdout.write(result.violations.length || unnamed.length ? '!' : '.');
            for (const v of result.violations) {
              const entry = found.get(v.id) ?? { help: v.help, impact: v.impact, nodes: new Set() };
              for (const n of v.nodes) entry.nodes.add(`${app.name}${where.startsWith('/') ? '' : ' '}${where} ${scheme}@${width}  ${n.target.join(' ')}`);
              found.set(v.id, entry);
            }
          };

          process.stdout.write(`    ${(app.name + '     ').slice(0, 5)} ${(scheme + '@' + width + '   ').slice(0, 11)} `);
          for (const route of app.routes) {
            const where = `${app.name} ${route} ${scheme}@${width}`;
            const unmeasured = ready.check(where, route, await open(route));
            /* AUDITING AN UNSETTLED PAGE IS THE FAILURE, NOT THE FALLBACK. Axe over a document with no
               `h1` fails `page-has-heading-one` on every route, which is the sixty-four-findings-that-say-
               nothing failure the SPA fallback comment above already records happening once. A red that
               blames the app for the gate's timing is a red somebody widens the rule to silence. */
            if (unmeasured) {
              unsettled.push(unmeasured);
              process.stdout.write('~');
              continue;
            }
            await audit(route);
          }

          /* States are the record app's. The site is five prerendered pages with nothing to drive, and a
             variant's record changes none of the routes the scenarios stand on. */
          if (!app.states) {
            process.stdout.write('\n');
            await context.close();
            continue;
          }

          process.stdout.write(' ');
          for (const st of STATES) {
            if (st.desktop && width < 900) continue;
            /* A LIST IS CARDS BELOW 640 (`packages/render/svelte/cards.svelte.ts`), and the filter control changes with it. */
            if ((st.wide && width < 640) || (st.narrow && width >= 640)) continue;
            const unmeasured = ready.check(`${app.name} ${st.name} ${scheme}@${width}`, st.route, await open(st.route));
            /* THE ROUTE BEFORE THE KEYSTROKE. A scenario whose page never settled has no grid for the key
               to act on, and reporting that as `no dialog[open]` is the gate accusing the app of its own
               timing. `/r/nope` is in `MAY_REFUSE`, so `empty: not found` still runs on a refusal, which
               is the state it exists to audit. */
            if (unmeasured) {
              unsettled.push(unmeasured);
              process.stdout.write('~');
              continue;
            }
            // Focus the grid first: bare letters act only inside one, which is the point of the rule.
            /* SHORT timeouts, and they matter. Both of these clicks are speculative (a page surface has
               no `[role="row"]` at all), and Playwright's default is to wait thirty seconds before
               admitting it. Fourteen scenarios times four passes times thirty seconds is twenty-eight
               minutes, against the six the whole gate takes today: the difference between a gate that
               runs and a gate nobody waits for. `Nine` was the count when this was written, and `STATES`
               holds fourteen. */
            await page.locator('[role="row"]').first().click({ timeout: 1200 }).catch(() => {});
            if (st.click) await page.locator(st.click).first().click({ timeout: 1200 }).catch(() => {});
            for (const k of st.keys ?? []) {
              await page.keyboard.press(k);
              await page.waitForTimeout(120);
            }
            if (!(await page.locator(st.expect).first().isVisible().catch(() => false))) {
              broken.push(`${app.name} ${st.name} ${scheme}@${width}: after ${st.click ?? st.keys.join(' ')}, no ${st.expect}`);
              process.stdout.write('?');
              continue;
            }
            await audit(st.name);
          }
          process.stdout.write('\n');
          await context.close();
        }
      }
    }


    const CONTRAST = 'color-contrast';
    const contrast = found.get(CONTRAST);
    found.delete(CONTRAST);

    /* `n OF m SURFACES` AND NOT `m`, because a run on a tree with no marketing site built would otherwise
       claim five surfaces in the same breath as the five lines below saying it looked at four. */
    const audited = [...per.values()].filter((p) => p.built).length;
    console.log(
      `  a11y: ${checked} page-runs over ${audited} of ${APPS.length} surface(s), ` +
        `${found.size + (contrast ? 1 : 0) + (mute.size ? 1 : 0)} rule(s) with findings`,
    );
    /**
     * AND WHAT EACH SURFACE WAS. See `per`: the total above is quotable about anything, and these lines
     * are quotable only about themselves, which is the whole of the repair.
     *
     * THE COUNTS ARE MEASURED AND NOT THE MATRIX MULTIPLIED OUT. A page that never settled is not a
     * page-run, so a surface whose routes half failed to draw reports the smaller number here and the
     * arithmetic stops agreeing with the schemes and widths beside it. That disagreement is the point:
     * it is the same run reported twice, and `page(s) were never in a state to audit` below says why.
     *
     * AND IT DOES NOT MULTIPLY OUT ON A CLEAN RUN EITHER, WHICH THE PARAGRAPH ABOVE ON ITS OWN WOULD
     * HAVE A READER BLAME ON A PAGE THAT DID NOT DRAW. The record app's row reads `212 page-runs over 41
     * route(s) and 14 state scenario(s), dark and light, at 1440 and 390`, and 41 x 4 plus 14 x 4 is 220.
     * The eight are four scenarios the widths exclude: `grid: selection` and `page: arrange mode` are
     * `desktop`, `grid: filter menu` is `wide` and `grid: filter sheet` is `narrow`, so they run twice
     * each and not four times, and the state runs are 10 x 4 plus 4 x 2, which is 48. The scenario counts
     * here are a UNION over the four passes, because a scenario that only makes sense on a phone is still
     * a scenario this run drove, and dropping it from the row would understate the coverage to make the
     * multiplication come out.
     */
    for (const app of APPS) {
      const p = per.get(app.name);
      console.log(
        p.built
          ? `      ${app.name}: ${p.runs} page-runs over ${p.routes.size} route(s)` +
              `${p.states.size ? ` and ${p.states.size} state scenario(s)` : ''}, ` +
              `${SCHEMES.join(' and ')}, at ${WIDTHS.join(' and ')}`
          : `      ${app.name}: 0 page-runs. Not built, so nothing on it was audited.`,
      );
    }

    if (mute.size) {
      /* ONE LINE, AND IT USED TO BE TWO. Three sentences in this file opened with a bare newline inside a
         template and carried their own leading spaces on the next line, which makes the printed text a
         function of the indentation of the code around it. Moving this gate into a function would have
         moved the text with it, so each one is written as the `\n` it always meant. */
      console.error('\n  intent-without-glyph (serious): colour never carries meaning alone (13 §5.1)');
      for (const [what, at] of [...mute].slice(0, 8))
        console.error(`      ${what}  ${[...at].slice(0, 3).join(' · ')}${at.size > 3 ? ` …${at.size - 3} more` : ''}`);
      if (mute.size > 8) console.error(`      ...and ${mute.size - 8} more`);
    }

    const show = (id, e) => {
      console.error(`\n  ${id} (${e.impact}): ${e.help}`);
      for (const n of [...e.nodes].slice(0, 6)) console.error(`      ${n}`);
      if (e.nodes.size > 6) console.error(`      ...and ${e.nodes.size - 6} more`);
    };

    for (const [id, e] of found) show(id, e);
    if (contrast) show(CONTRAST, contrast);

    /* A scenario that cannot reach its state is a FAILURE, not a skip. Otherwise a key that quietly
       stopped working leaves the gate auditing the page underneath the dialog and reporting green. */
    if (broken.length) {
      console.error(`\n  ${broken.length} scenario(s) never reached their state:`);
      for (const b of broken) console.error(`      ${b}`);
    }

    /* A PAGE THAT COULD NOT BE AUDITED IS A FINDING, and it is in the first condition rather than the
       second on purpose: a route that never settles must not fall through to the exit-3 branch, because
       exit 3 is a skip and CI runs master with no `--allow-skip`. Every exit-3 path in this gate is still
       a `stat()` on a build directory, decided before a browser is launched, which is what keeps a real
       failure from turning into one. */
    if (unsettled.length) {
      console.error(`\n  ${unsettled.length} page(s) were never in a state to audit:`);
      for (const u of unsettled) console.error(`      ${u}`);
    }

    /**
     * AND A RUN THAT AUDITED NO SCREEN WITH THE RECORD ON IT IS RED.
     *
     * Everything this gate is for lives on a drawn screen: `color-contrast` over rows and cells,
     * `button-name` on row menus, the `aria-selected` states, and `intent-without-glyph`, whose measured
     * finding was sixteen rows on `/r/obligations`. Over chrome alone every one of them has zero elements
     * to look at and reports zero violations.
     */
    const blind = ready.nothingDrawn();
    if (blind) console.error(`\n  ${blind}`);

    if (found.size || contrast || broken.length || mute.size || unsettled.length || blind) return 1;
    /* AND A RUN THAT LOOKED AT NOTHING IS A SKIP: 3, not the green line it used to print. */
    if (skipped.length) {
      console.log(`  a11y: skipped ${skipped.join(', ')}. No build.`);
      return 3;
    }
  } finally {
    /**
     * ALL THREE, AND ONE FAILURE MAY NOT COST THE OTHER TWO.
     *
     * `await browser.close()` first and unguarded would be the same defect one layer in: a browser that
     * had already crashed rejects there, the rejection leaves the `finally`, and the record and the port
     * stay open exactly as before. Each hand-back is its own statement and swallows its own failure.
     * None of them is a second close either, which matters more than it looks: two closes of one record
     * reach `sql.close()` on a database already closed (`apps/selfhost/src/server.ts:72`) and throw
     * `ERR_INVALID_STATE` from inside `net`'s close callback, where no `await` can catch it, and the run
     * dies. The two early returns above this block are both before `startRecord()`, so neither of them
     * has anything to hand back and neither may grow a close of its own.
     */
    await browser?.close().catch(() => {});
    /* AWAITED, unlike the bare `server.close()` this replaces: the callback is the moment the listening
       socket is actually gone. The port is ephemeral, so no later gate is waiting on this number, but a
       socket still listening is a handle that keeps the runner from exiting. */
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns this file with `BRAINDOG_GATE_SEED=intent` and
   the header documents `node tools/gates/a11y.mjs`. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await a11y()) ?? 0;
