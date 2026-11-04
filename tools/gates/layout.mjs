/**
 * The layout gate: nothing may stick out sideways, at any width the CSS itself cares about.
 *
 *   node tools/gates/layout.mjs
 *
 * A HORIZONTAL SCROLLBAR IS THE MOST VISIBLE BUG A RESPONSIVE LAYOUT CAN HAVE and one of the least
 * likely to be caught in development, because it appears at widths nobody has open. One missing
 * `min-inline-size` on one grid child is all it takes. The symptom is the whole page sliding under
 * the thumb, and it reads to a person as the app being broken rather than as a stylesheet being
 * four pixels out.
 *
 * IT TESTS BOTH SIDES OF EVERY BREAKPOINT, and that is the idea in this file. The widths are not a
 * taste list of devices; they are read out of the stylesheets, so a `@media (width < 900px)` is
 * checked at 899 AND at 900. That pair is where responsive bugs actually live: at 899 the rail is
 * gone and the tab bar is up, at 900 the rail is back and has to fit. The width at which a layout
 * changes its mind is the width nobody drags their window to. A breakpoint added tomorrow
 * gets tested tomorrow without anybody editing this file.
 *
 * A floor of real sizes goes on top, because the narrowest phone still in use is narrower than any
 * breakpoint anyone writes, and the laptop a person reads on is wider than all of them. Past the
 * widest breakpoint every width is the one desktop layout, only wider, and the floor is the only thing
 * that draws it at the size the owner judges it at (1512 and 1728).
 *
 * WHAT COUNTS AS AN OVERFLOW is deliberately narrow, or a gate cries wolf and gets deleted. A table
 * wider than the viewport is CORRECT: it lives in `.table-region`, which scrolls, which is the
 * whole design. So an element is a finding only if nothing above it scrolls or clips. The document
 * scrolling sideways is a finding always, with no exceptions.
 *
 * THIS FILE IS THE ENTRY, AND EACH RULE'S CHECK IS A FILE IN `layout/`. What is here is what the
 * runner and `self-test` read, `needs`, `slices`, `RULES` and `seedsOf`, and the run itself: the port, the record and
 * the browser, which widths and which seeds each pass draws, and the lines at the end. Beside it:
 *
 *   layout/overflow.mjs   `layout-overflow`, and `layout-site`'s check    layout/sweep.mjs    every route at every width
 *   layout/target.mjs     `layout-target` and `layout-target-edge`        layout/acts.mjs     the states a route is pressed into
 *   layout/settle.mjs     `layout-settle`'s fault                         layout/measure.mjs  the two checks, run as one
 *   layout/full.mjs       `layout-full`                                   layout/plant.mjs    which fault each seed plants
 *   layout/dock.mjs       `layout-dock`                                   layout/shared.mjs   what every pass shares
 *   layout/site.mjs       `layout-site`, with the other record variants
 *
 * THE BUDGET IS READ HERE AND HANDED DOWN, because `self-test` counts a `budgets.json` key as read only where a file of
 * this directory reads it (`budgetsAreRead`), and `layout/` is not this directory.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium, webkit } from '@playwright/test';

import { dock } from './layout/dock.mjs';
import { full } from './layout/full.mjs';
import { breakpoints } from './layout/shared.mjs';
import { variants } from './layout/site.mjs';
import { sweep } from './layout/sweep.mjs';
import { APP_BASE, appShell, budget, readiness } from './lib.mjs';
import { answers, forward, forwards, recordAt, recordsAnswer, startRecord, VARIANTS as RECORDS } from './record.mjs';
import { routesFor, routesOf } from './routes.mjs';

/**
 * WHAT THIS GATE CANNOT RUN WITHOUT, DECLARED SO THE RUNNER DECIDES INSTEAD OF THIS FILE.
 *
 * `52 §5.1` step 2: `run.mjs` reads this before it runs anything, and refuses to run this gate
 * when there is no build, so the sentence a reader gets comes from the runner rather than from a
 * gate that did not run. The `stat(ROOT)` below is still here and still answers 3, because it is
 * what answers a person who runs `node tools/gates/layout.mjs` by hand; it is no longer the only
 * account of the prerequisite, which is what let `passkey` and `queue` exit 0 with no build twice.
 *
 * AND STEP 3 READS IT OFF THE MODULE RATHER THAN OUT OF THIS TEXT. `run.mjs` imports this file and
 * reads `mod.needs` before it calls the gate, so the declaration it acts on is the value this file
 * holds. Nothing happens on that import, because everything below is inside the function.
 *
 * ONE NEED AND NOT TWO, although this gate sweeps two builds. `apps/site/build` is measured when
 * it is there and named when it is not, one variant at a time, and the gate has always skipped
 * on `apps/web/build` alone. The declaration says what the gate already does rather than widening
 * it, because a need that stops a run is the wrong place to change what gets measured.
 */
export const needs = ['web-build'];

/**
 * TWO PARTS AT MOST, CUT BY WIDTH. The sweep is the longest gate in the directory, and on the hosted
 * runner it alone ran into `gates.yml`'s ceiling. Every width is one browser context and none of them
 * reads another, so `run.mjs` may hand this gate `{ part, of }` and each part sweeps every `of`th width,
 * the floor and the breakpoints dealt alternately so neither part is all phones. The variant pass has
 * its own widths and is not cut, so it rides with part 1 alone and is never run twice.
 */
export const slices = 2;

/**
 * EVERY RULE IN THIS GATE, AND THE FAULT EACH ONE IS PROVED ON.
 *
 * It had one planted fault for five rules, a 2000px heading, which proves the overflow rule and nothing else: the target
 * rule, the readiness wait, the full-width pass and the panel's arrival could each have stopped looking and the
 * self-test would still have printed one red line. Now every rule has its own seed, and `self-test` walks this list.
 *
 * `id` is what `BRAINDOG_GATE_SEED` carries, one or several joined by commas, and what each finding of a seeded run is
 * tagged with, `[layout-target]`, so one run in one browser answers for every seed separately. `seed` is the fault in a
 * person's words, for the line that says it was caught. `expect` is the words a finding must hold to count as caught:
 * red for some other reason is not the rule working. `passes` is where the fault is planted, and the overflow seed is
 * planted in three because the sweep, the docked pass and the variant pass each measure overflow with their own edge.
 *
 * A SEED THAT CANNOT BE PLANTED ON THIS BUILD SAYS `[id] not run:` and why, so a run that proved less says so rather
 * than reading as a pass.
 */
export const RULES = [
  {
    id: 'layout-overflow',
    seed: 'a 2000px heading inside the work, with the panel shut and with it docked',
    expect: ['reaches 2000px', 'under the panel'],
    passes: ['sweep', 'dock', 'variant'],
  },
  { id: 'layout-target', seed: 'a 30 by 30 button on a phone', expect: ['is 30x30'], passes: ['sweep'] },
  { id: 'layout-target-edge', seed: 'a 43 by 44 button on a phone, one pixel short', expect: ['is 43x44'], passes: ['sweep'] },
  { id: 'layout-settle', seed: 'a screen whose mark of being drawn is taken away', expect: ['never settled'], passes: ['sweep'] },
  { id: 'layout-full', seed: 'a main screen capped at 60 per cent of its room', expect: ['a cap or a centred column'], passes: ['full'] },
  { id: 'layout-dock', seed: 'a panel that opens hidden', expect: ['opened no docked panel'], passes: ['dock'] },
  { id: 'layout-site', seed: 'a 2000px heading on a page of the marketing site', expect: ['reaches 2000px'], passes: ['variant'] },
];

/**
 * WHICH SEEDS A RUN PLANTS: `null` for a real run, else the rules named. `'1'` is `layout-overflow`, the value
 * `self-test` sent while this gate had one seed, kept until its list walks `RULES`.
 *
 * A NAME NOTHING ANSWERS TO IS REFUSED, AND THROWN. A seed mistyped in `self-test` would otherwise plant nothing, the run
 * would be a green real run under a name that promised a red one, and the self-test would read it as the rule failing
 * to look. The caller says which.
 */
export function seedsOf(value = process.env.BRAINDOG_GATE_SEED) {
  if (!value) return null;
  const names = [...new Set(value.split(',').map((s) => s.trim()).filter(Boolean))].map((s) => (s === '1' ? 'layout-overflow' : s));
  const unknown = names.filter((n) => !RULES.some((r) => r.id === n));
  if (unknown.length || !names.length)
    throw new Error(`layout: no seed is called ${unknown.map((n) => `"${n}"`).join(', ') || `"${value}"`}. The seeds are ${RULES.map((r) => r.id).join(', ')}.`);
  return RULES.filter((r) => names.includes(r.id));
}

/**
 * THE WHOLE SWEEP, AS A FUNCTION THE RUNNER CALLS. `52 §5.1` step 3.
 *
 * IT OWNS A PORT, A RECORD AND A BROWSER, AND A CALLED GATE HAS TO GIVE THEM BACK, which a spawned
 * one got for nothing: the process ending closed whatever it held. In this process a server left
 * listening is a handle the runner cannot exit past, and a browser left running is a
 * runner that never exits. The two returns above the record are the only ones that need no cleanup;
 * everything below it is inside ONE `try`, and the `finally` is the only place any of the three is
 * handed back, on the run that finished and on the run that threw alike.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to this file's own two directories up, which is what the
 * constant it replaces computed. Nothing here has ever read `process.cwd()`, so a run from inside a
 * package measures the same tree it always did.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function layout(root = join(import.meta.dirname, '..', '..'), { part = 1, of = 1 } = {}) {
  /* THE SEEDS FIRST, BEFORE A ROUTE IS READ OR A PORT TAKEN, so a refused name costs nothing and opens nothing. It is
     red, because a gate asked to plant a fault it does not have has proved nothing, and the line says which name. */
  let seeds;
  try {
    seeds = seedsOf();
  } catch (e) {
    console.error(`  ${e.message}`);
    return 1;
  }
  /** Whether this run plants `id`, and the rule when it does. */
  const plants = (id) => seeds?.find((s) => s.id === id) ?? null;
  /** The seeds planted in one pass, each on a page of its own; a real run is one unseeded page, `null`. */
  const plantedIn = (pass) => (seeds ? seeds.filter((s) => s.passes.includes(pass)) : [null]);
  /** The seeds this run could not plant, and why, for the lines at the end. */
  const unplanted = new Map();
  const ROOT = join(root, 'apps', 'web', 'build');

  /**
   * OTHER RECORDS, FOR THE HALF OF EVERY BRANCH THE FIRST ONE CANNOT DRAW.
   *
   * The gates' record is one record, so a screen that branches on a fact about the record has a side no gate
   * can reach. `/settings/backups` and `/settings/billing` branch on the host, and the Cloud side
   * shipped **eight sentences that drew nowhere**: invisible to `svelte-check`, which says nothing
   * about a branch that cannot be taken, and counted as rendered by `dead-copy`, which greps source.
   *
   * THE SAME BUILD, SERVED OVER ANOTHER RECORD (`record.mjs` `VARIANTS`). They were three builds of the app,
   * `build-cloud/`, `build-quiet/` and `build-busy/`, which differed only in the sample's constants, and once no
   * screen read those they drew what the main build drew. A record variant is always there, so only the site can
   * be missing, and the run says so rather than quietly covering less: "we did not check this" must not look like
   * "there was nothing here".
   */
  /* The site's routes, and the addresses it holds from visitors (`routesFor`'s `held`), said in the summary. */
  const SITE = await routesOf(join(root, 'apps', 'site'));
  const VARIANTS = [
    /**
     * THE MARKETING SITE, which no layout gate has ever measured.
     *
     * `a11y` serves it and runs `wcag21aa`; `target-size` is `wcag22aa` and axe has no overflow rule,
     * so the one surface a stranger sees FIRST was checked for neither of the two things this gate
     * exists for. A review applied the rule by hand and found the document scrolling sideways at 320px
     * with the call-to-action entirely off the screen.
     *
     * It sits in this list because a second build root is exactly what the variant pass already does.
     * It is not a variant of the record. It is a different app, and the mechanism does not care.
     */
    /* `prerendered` IS A FACT ABOUT THIS ROOT AND NOT A WAIVER. The site makes no call, so it has
       nothing to settle and no `data-screen` to carry, and holding it to the readiness contract would
       be six ten-second timeouts on three pages that were finished when the document loaded. Every
       other root here is the record app with a different record inside it.

       ITS ROUTES COME FROM ITS TREE, as `a11y` reads them, because the three typed here left every page
       added since unswept: a new page is measured the day its folder lands. */
    { name: 'site', root: join(root, 'apps', 'site', 'build'), routes: SITE.routes, prerendered: true },
    /* `record` NAMES WHICH OF `record.mjs`'s VARIANTS THE PORT FORWARDS TO for the length of the pass, over the one
       build. Why each exists, and why `connected` took `quiet`'s place, is written beside `VARIANTS` there. */
    ...RECORDS.map((v) => ({ name: v.name, root: ROOT, routes: v.routes, record: v.name })),
  ];
  const L = budget('layout');

  /**
   * Every route the app has, derived from the tree, plus a few extra addresses of the same routes.
   *
   * IT WAS TYPED OUT, AND THE TWO GATES DISAGREED. `a11y` was missing `/s/[token]` (the shared page,
   * the only surface a non-user ever sees), and neither list was compared to the route directory, so a
   * route added tomorrow was audited by neither and nothing noticed. The derivation also found
   * `/[id]`, the spoken-id resolver, which neither list had ever covered.
   *
   * THE EXTRAS ARE SECOND ADDRESSES OF ROUTES ALREADY IN THE LIST (a different page, a different
   * track), because one sample proves the route renders and a second proves the DECLARATION does.
   *
   * THE HUB'S TABS AND A NEW AUTOMATION ARE EXTRAS TOO. `/automations` draws each kind that runs by
   * itself under one path, picked by `?tab=`, so the tree yields one address and every tab but the
   * first went unmeasured at 390, where the tab bar scrolls inside itself and each tab's rows wrap
   * their own way. `/automations/[id]`
   * is sampled with an id no record has, so the canvas itself was measured only as "not found"; `new`
   * opens it with a trigger card and the sticky bar, which is the page a phone draws wrong first.
   */
  const EXTRA = [
    '/p/estate',
    '/p/work',
    '/p/kiln',
    '/r/tracks/3',
    '/nowhere',
    '/automations?tab=scheduled',
    '/automations?tab=scripts',
    '/automations?tab=doors',
    '/automations/new',
  ];
  /* AT THE SAMPLES IT HAD BEFORE, ONLY TO REFUSE A ROUTE WITH NO SAMPLE BEFORE A PORT IS TAKEN; the sweep reads them again
     at the record's own ids once the record is up (`routesFor`). */
  let { routes: ROUTES, unsampled } = await routesFor(join(root, 'apps', 'web'), null, { extra: EXTRA });
  /** The addresses the record had nothing for, drawn as not found: said in the summary, never dropped. */
  let unseen = [];
  let missing = [];
  if (unsampled.length) {
    for (const u of unsampled) console.error(`  a route with no sample address: ${u}`);
    return 1;
  }

  /* THE CONTROLS THAT DO NOT EXIST UNTIL SOMEBODY DOES SOMETHING are `layout/acts.mjs`'s, pressed by the sweep. */

  /** The narrowest phone still in the wild, two bigger phones, one common tablet, and the owner's two laptop widths. */
  const FLOOR = L.floorWidths;

  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
  };

  if (!(await stat(ROOT).catch(() => null))) {
    /* EXIT 3 IS A SKIP, NOT A PASS. See the note in `bundle.mjs`. */
    console.log('  layout: no build to check. `pnpm build` first, and CI does.');
    return 3;
  }

  /**
   * AND FROM HERE EVERY HANDLE IS GIVEN BACK EVEN WHEN THE SWEEP THROWS, which it was not.
   *
   * The three closes used to stand together after the variant pass on the straight-line path, with no
   * `try` above them. This is the longest sweep in the directory (855 page-runs over 19 widths, eight
   * minutes) and almost every line of it can throw: `page.evaluate(MEASURE)` past its timeout,
   * `browser.newContext` at one of 19 widths, `readdir` over a stylesheet tree, `chromium.launch()`
   * where no browser is installed. Any of those skipped all three closes. `run.mjs` calls this gate
   * IN-PROCESS, so what was skipped stayed open for the rest of the run. Measured on 21 September on
   * `keys.mjs`, which had the identical shape: a throw after the launch left the gate's port answering
   * **HTTP 200**, the rebind a later gate then needed came back **EADDRINUSE** (the port was fixed
   * then and is ephemeral now), and the machine went from
   * 18 browser processes to 21. With the `finally` the same throw rebinds free and the count returns
   * to 18.
   *
   * `let`, BECAUSE THE FINALLY HAS TO SEE THEM HALF-BUILT: the run that dies before the browser exists
   * is the run this is for, and a `const` inside the block is out of scope for the hand-back.
   *
   * THE RECORD IS ONE OF THEM AND IS TAKEN INSIDE THE `try`, as `passkey.mjs` already took it. It used
   * to be awaited on the line above these declarations, which held only while nothing that can throw
   * stood between it and the `try`. On 22 September one such line was added there in a scratch copy,
   * and `test/handles.test.mjs` named the record as opened outside the `try` whose `finally` closes it.
   * A `startRecord()` that throws has already closed what it built (`record.mjs`), so `record` stays
   * `null` and the `finally` does not close it a second time.
   */
  let record = null;
  let server = null;
  let browser = null;
  const spent = [];
  try {
    /* THE RECORD THE REGISTER LIST READS, forwarded to from this gate's own port, and its variants under the same
       handle, so the one `record.close()` below gives all of them back. See `record.mjs`. */
    record = await startRecord(0, { variants: true });
    /* THE ROUTES AT THE RECORD'S OWN IDS: an automation and a catalogue entry by a real id, settled, and not
       measured as not found. */
    ({ routes: ROUTES, unseen, missing } = await routesFor(join(root, 'apps', 'web'), record, { extra: EXTRA }));

    /**
     * WHAT THIS GATE IS ALLOWED TO CALL A MEASUREMENT.
     *
     * It used to be `waitForSelector('#main *').catch(() => {})`, and the swallow is the part that
     * mattered: a page that had rendered nothing was measured anyway, and an empty document never
     * scrolls sideways and holds no control under 44px, so the gate would have printed `0 finding(s)`
     * over 627 page-runs of chrome and exited 0. Built from `ROOT` because the contract is a property
     * of the record app's shell and every variant of it is the same shell.
     */
    const ready = readiness('layout', budget('ready').settleTimeoutMs, ROOT, { quietMs: budget('ready').quietMs });
    /* AND THE SAME WAIT FOR A PRESS THAT OPENS SOMETHING, so the docked pass spells no number of its own. */
    const ACT_MS = budget('ready').settleTimeoutMs;


    const bps = (await breakpoints(root)).sort((a, b) => a - b);
    /* One pixel either side of each. `width < 900px` is on at 899 and off at 900, and those are two
       different layouts that both have to hold. */
    const widths = [...new Set([...FLOOR, ...bps.flatMap((b) => [b - 1, b])])].sort((a, b) => a - b);
    /* A DESKTOP IS A WIDTH AT OR PAST THE WIDEST BREAKPOINT, where no stylesheet changes its mind again and every
       width draws the one layout, only wider. The floor's two laptop widths are there, so the acts and the variant
       pass below ask this rather than reading the floor as a list of phones, which it no longer is. */
    const desktop = (w) => bps.length > 0 && w >= bps[bps.length - 1];
    /* EVERY WIDTH OF EVERY PART, kept before the cut so the full-width pass can tell a width some other part draws from
       one no part draws at all. */
    const every = [...widths];
    /* THIS PART'S WIDTHS AND NO OTHER, dealt in turn so each width is in exactly one part. Whole, it is all of them. */
    widths.splice(0, Infinity, ...widths.filter((_, i) => i % of === part - 1));

    /* WHICH BUILD IS ON THE PORT. One server, pointed at the record under measurement. A second server
       would be a second port, and this file already knows what a port collision costs. */
    let serving = ROOT;
    /* AND THE ADDRESS IT IS OPENED UNDER. The record app is the root (`svelte.config.js`, `APP_BASE` in `lib.mjs`), so its
       routes are opened as `<route>` and its fallback is `build/index.html`; the marketing site is prerendered at the
       root too. The route itself stays as the tree names it, because `MAY_REFUSE` is written in those words. */
    let base = APP_BASE;
    /* AND WHICH RECORD `/api` REACHES: the gates' own, or the variant a pass names. */
    let asking = null;
    const shellOf = () => (base === APP_BASE ? appShell(serving) : join(serving, 'index.html'));

    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      /* THE RECORDS THE SWITCHER LISTS, answered as the host would (`record.mjs` `recordsAnswer`): the self-host answers it
         401 to the server key, and the switcher's error would be a console error the printed rule reads on every screen. */
      if (/^\/+account\/records\/?$/u.test(url.pathname)) {
        res.writeHead(200, { 'content-type': TYPES['.json'] });
        return res.end(JSON.stringify(recordsAnswer()));
      }
      if (forwards(url.pathname)) return forward(req, res, asking === null ? record.base : record.variants[asking]);
      const rel = decodeURIComponent(url.pathname).slice(1);
      if (rel.includes('..')) return res.writeHead(400).end();
      for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
        const file = join(serving, candidate);
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) continue;
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        return createReadStream(file).pipe(res);
      }
      // The same SPA fallback the app is deployed behind, keyed on extensions we actually serve.
      if (!Object.hasOwn(TYPES, extname(rel))) {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        return createReadStream(shellOf()).pipe(res);
      }
      res.writeHead(404).end();
    });
    /* AN EPHEMERAL PORT, AS `passkey.mjs` AND `queue.mjs` TAKE ONE. This gate used to bind a fixed
       port out of `budgets.json`, and the CI runner is the same PC where sessions run this gate by
       hand, so a CI run and a desk run of it could meet on one port and one of the two would go red
       for a reason that is not in the tree. Port 0 is a port the
       operating system hands out free at the moment of the bind, and every URL below is built from
       what it handed out. `localhost` still, because the bind names no host and takes the dual-stack
       `::`, which is what `localhost` reaches first on this machine. */
    /* LONGER THAN WEBKIT KEEPS A CONNECTION: node closes an idle one after 5s, and WebKit reusing it then fails a whole
       page's first fetches at once, which the gate read as the app's. */
    server.keepAliveTimeout = budget('ready').settleTimeoutMs;
    await new Promise((r) => server.listen(0, r));
    const PORT = server.address().port;
    await answers(`http://localhost:${PORT}`);

    const present = [];
    for (const v of VARIANTS) if (await stat(v.root).catch(() => null)) present.push(v);
    if (present.length < VARIANTS.length)
      console.log(
        `  layout: ${VARIANTS.length - present.length} variant(s) not built. ` +
          `\`pnpm --filter @braindog/site build\` measures the page a stranger sees first.`,
      );


    const findings = [];

    /**
     * A SEEDED RUN IS A NEGATIVE, AND A NEGATIVE NEEDS ONE PAGE.
     *
     * `self-test.mjs` runs this whole gate a second time with `BRAINDOG_GATE_SEED` set, to prove it goes
     * red on a 2000px heading inside `#main`. It was proving that over **627 page-runs** (the full
     * sweep, every route, every width, four records and the marketing site) to establish one fact. The
     * browser work therefore ran twice on every `pnpm gates`: about 1,966 page-runs for a tree whose
     * real sweep is 627 of them, and roughly an hour of wall clock, which is this loop's binding
     * constraint.
     *
     * The seeded heading is 2000px wide, so it overflows at every width on every route: the first route
     * at the floor width proves exactly what the full sweep proved. This narrowing applies ONLY when the
     * seed is set. A real run is never scoped, so the gate cannot be quietened by an environment
     * variable.
     */
    /**
     * AND ONE VARIANT PAGE-RUN, WHICH USED TO BE NONE.
     *
     * `present.length = 0` was the line here, so the seeded run never entered the variant pass at all.
     * The pass has its own copy of the wait, its own copy of the preparation and its own copy of the
     * seed, and the comment beside that seed says it is *"what makes this pass answerable by
     * `self-test`"*. It was not: the block could not execute under the only environment that sets the
     * variable, so the second half of this gate had never once been asked to go red. That half is the
     * half that measures the marketing site and the three records the shipped seed cannot draw, which
     * is to say the half nothing else in the suite covers.
     *
     * ONE VARIANT AND ONE OF ITS ROUTES, for the reason the paragraph above gives about the main loop:
     * a 2000px heading overflows at every width on every route, so the first of each proves what the
     * whole sweep proves and the rest is wall clock. Which variant it is depends on what has been
     * built, and the pass is the same code whichever it is.
     *
     * A RUN WITH NO VARIANT BUILT SAYS SO, because "we did not check this" must not look like "there
     * was nothing here". `self-test` reads that sentence and reports the variant half as unproved
     * rather than counting it.
     */
    /** The record `/api` reaches on this pass, as `openPage` reads it: the gates' own, or the variant the pass names. */
    const asked = () => (asking === null ? record : recordAt(record.variants[asking]));

    /* UNDER THE SEEDS, ONE WIDTH AND ONE ROUTE, and each seed of the sweep on a page of its own at that width: the
       narrowest of every part, which is the narrowest phone, where the pointer is coarse and the target rule applies.
       Every seed is planted in the first part, as the docked and full-width passes already were, so a later part says
       it planted nothing rather than reading as a seed nobody saw. */
    if (seeds && part !== 1) for (const s of seeds) unplanted.set(s.id, `part ${part} of ${of} plants nothing, and part 1 plants every seed`);
    const sweepSeeds = plantedIn('sweep').filter((s) => {
      if (s === null) return true;
      if (part !== 1) return false;
      if (s.id === 'layout-settle' && !ready.contract) unplanted.set(s.id, 'this build carries no mark of being drawn to take away');
      else return true;
      return false;
    });
    /* AND THE VARIANT PASS: the overflow seed on the first record variant, the site seed on the marketing site. */
    const variantRuns = seeds ? [] : present.map((v) => ({ v, planted: null }));
    if (seeds) {
      widths.splice(0, Infinity, ...every.slice(0, 1));
      ROUTES.length = 1;
      const first = (v) => ({ ...v, routes: v.routes.slice(0, 1) });
      const records = present.filter((v) => v.name !== 'site');
      const site = present.find((v) => v.name === 'site');
      if (plants('layout-overflow')) {
        if (records.length) variantRuns.push({ v: first(records[0]), planted: plants('layout-overflow') });
        else console.log('  layout: no variant is built, so the variant pass is not under test on this run.');
      }
      if (plants('layout-site')) {
        if (site) variantRuns.push({ v: first(site), planted: plants('layout-site') });
        else unplanted.set('layout-site', 'the marketing site is not built here, and `pnpm --filter @braindog/site build` builds it');
      }
    }

    /* BOTH ENGINES, ONE LAUNCH EACH: the Mac app draws with Safari's engine (55 §4), so WebKit meets the same rules as
       Chromium, at its own widths (`webkitWidths`): the Mac window and the phone, dealt over the parts as the sweep's are.
       Chromium draws every breakpoint; WebKit is here for what the engine draws differently, and the whole sweep twice
       would be a part past its ceiling. A seeded run is a negative of the rules and stays on Chromium. A missing install
       throws here. */
    const webkitAt = Array.from(L.webkitWidths).sort((a, b) => a - b).filter((_, i) => i % of === part - 1);
    /* THE PAGES THAT LOADED ONLY ON A SECOND TRY (`openPage`'s `again`), by why, for the summary. */
    const again = { lost: 0, unreached: 0 };
    let checked = 0;
    for (const [engine, kind] of [['chromium', chromium], ['webkit', webkit]]) {
      if (seeds && engine !== 'chromium') continue;
      const chrome = engine === 'chromium';
      /* THE FIRST ENGINE'S BROWSER STAYS OPEN UNTIL THE `finally`, which closes every one, so a throw cannot skip a close. */
      if (browser) spent.push(browser);
      browser = await kind.launch();
      const mine = [];
      /* WHAT EVERY PASS IS HANDED (`layout/shared.mjs` says what each part is for). The address and the record are asked
         for each time, because the variant pass points the port at another build and another record under them. */
      const run = {
        browser,
        ready,
        findings: mine,
        checked: 0,
        missing,
        asked,
        origin: `http://localhost:${PORT}`,
        at: (route) => `http://localhost:${PORT}${base}${route}`,
        serve: (v) => {
          serving = v.root;
          base = v.prerendered ? '' : APP_BASE;
          asking = v.record ?? null;
        },
        actMs: ACT_MS,
        /* A LOAD LOST UNDER A FULL RUN'S LOAD IS OPENED ONCE MORE before it is a finding (`lib.mjs` `openPage`). */
        again: { ms: budget('ready').againMs, said: (why) => again[why]++ },
        budgets: {
          settleMs: L.settleMs,
          widthTolerancePx: L.widthTolerancePx,
          fullWidthShare: L.fullWidthShare,
          dockArrivalMs: L.dockArrivalMs,
          dockBlankShare: L.dockBlankShare,
        },
      };

      /* THE SWEEP: every route at every width of this part, at rest and in each state an act opens (`layout/sweep.mjs`). */
      await sweep(run, { widths: chrome ? widths : webkitAt, routes: ROUTES, seeds: sweepSeeds, floor: FLOOR, desktop });

      /* AND THE MAIN SCREENS FILL THE WINDOW, which nothing above can say (`layout/full.mjs`). */
      /* THE WIDTHS THIS PART DRAWS, AND ANY NO PART DRAWS, in the first part, so a width named in the budget is never
         judged by nobody. NOT UNDER THE OTHER SEEDS for the full-width pass: a 2000px heading proves nothing about a narrow
         page. Its own seed caps `#main` on one page, the first width, the rail and Today, in the first part. WebKit's are
         its own desktop widths, here and for the docked pass. */
      const ours = (list) => (seeds ? [] : list.filter((w) => widths.includes(w) || (part === 1 && !every.includes(w))));
      const fullSeed = plants('layout-full');
      const fullAt = fullSeed ? (part === 1 ? L.fullWidthAtPx.slice(0, 1) : []) : chrome ? ours(L.fullWidthAtPx) : webkitAt.filter(desktop);
      await full(run, { at: fullAt, seed: fullSeed });

      /* AND WITH A PANEL DOCKED BESIDE THE WORK, which no pass above ever opened (`layout/dock.mjs`). Under the seeds, one
         page with the panel open for each seed, at the first width, in the first part only. */
      const seeded = seeds !== null;
      const dockSeeds = plantedIn('dock');
      const dockAt = seeded ? (part === 1 && dockSeeds.length ? L.dockedAtPx.slice(0, 1) : []) : chrome ? ours(L.dockedAtPx) : webkitAt.filter(desktop);
      await dock(run, { at: dockAt, seeds: seeded ? dockSeeds : null });

      /* The floor and a desktop. `FLOOR` is the gate's own. A numeric literal here would be the
         thing `lib.mjs` forbids, and the narrowest phone is the width its preamble argues for.

         THE FLOOR CARRIES ITS OWN DESKTOPS NOW, the owner's two laptop widths, so the widest breakpoint is
         added only when no floor width reaches it. Added anyway, every variant route would be drawn at three
         widths past the last breakpoint, where all three draw the one layout. WebKit draws them at its own widths. */
      const variantWidths = !chrome ? Array.from(L.webkitWidths) : FLOOR.some(desktop) ? [...FLOOR] : [...FLOOR, bps[bps.length - 1] ?? 1_200];
      /* AND ONE OF THEM UNDER THE SEED. The seeded heading is 2000px wide, so the narrowest width proves
         what every one of them proves, and the rest are browser contexts on every `pnpm gates`. */
      if (seeds) variantWidths.length = 1;

      /* THE VARIANTS ONCE, IN THE FIRST PART, because they do not depend on the width list above. */
      if (part === 1) await variants(run, { runs: variantRuns, widths: variantWidths });
      serving = ROOT;
      asking = null;
      checked += run.checked;
      /* THE ENGINE IS NAMED ON EVERY FINDING, except under a seed, whose tags `self-test` reads from the front. */
      findings.push(...mine.map((f) => (seeds ? f : `${engine}: ${f}`)));
    }

    console.log(
      `  layout: ${checked} page-runs over ${widths.length} widths ` +
        `(${of === 1 ? `${bps.join(', ')} + floor` : `${widths.join(', ')}, part ${part} of ${of}`})` +
        `${seeds ? '' : `, WebKit at ${webkitAt.join(' and ') || 'none in this part'}`}, ${findings.length} finding(s)`,
    );
    if (again.lost + again.unreached)
      console.log(`  ${again.lost + again.unreached} page(s) loaded only on a second try: ${again.lost} lost a module, ${again.unreached} found the port not answering`);

    /* EVERY FINDING OF A SEEDED RUN, because `self-test` reads them for each seed's name and a cut would hide a seed's. */
    /* `BRAINDOG_GATE_ALL` PRINTS THEM ALL: a target pass needs the whole list, and a cut at forty left 872 of 912 unread. */
    const shown = seeds || process.env.BRAINDOG_GATE_ALL ? findings.length : L.findingsShown;
    for (const f of findings.slice(0, shown)) console.error(`      ${f}`);
    if (findings.length > shown) console.error(`      ...and ${findings.length - shown} more`);

    /* AND A LINE FOR EVERY SEED THAT HAS NONE ABOVE: planted and unseen, which is that rule looking at nothing, or not
       planted at all on this build, which is a rule this run did not prove. Neither may read as caught. */
    for (const s of seeds ?? []) {
      if (unplanted.has(s.id)) console.log(`  [${s.id}] not run: ${unplanted.get(s.id)}`);
      else if (!findings.some((f) => f.startsWith(`[${s.id}] `))) console.error(`  [${s.id}] saw nothing of ${s.seed}`);
    }

    /**
     * AND A SWEEP THAT NEVER SAW THE RECORD IS RED, however clean every page in it was.
     *
     * This is the one thing the per-page check cannot say. A host answering nothing draws the error card
     * on every route and a record with nothing in it draws the empty one, and both of those sweep to
     * `0 finding(s)`: an `Empty` card is `max-inline-size: 56ch` and cannot overflow at any width. The
     * gate exists to measure a table, a card list and a row, so a run that measured none of them is a
     * run that asserted nothing about the thing it is for.
     */
    if (ready.retried()) console.log(`  ${ready.retried()} screen(s) settled only after one reload`);
    /* NOT SEEN WITH DATA (`routesFor`'s `unseen`): an address the record held nothing for, measured as not found. */
    if (unseen.length) console.log(`  not seen with data: ${unseen.length} address(es), ${unseen.join(', ')}`);
    if (SITE.held.length) console.log(`  held by the site, not opened: ${SITE.held.join(', ')}`);
    const blind = ready.nothingDrawn();
    if (blind) console.error(`  ${blind}`);

    /* ONE ANSWER AT THE END RATHER THAN TWO WRITES TO `process.exitCode`, because a called gate returns
       once and a gate that returned twice would return the first one. The two conditions are the two
       that were there: a finding at any width, or a sweep that never saw the record. */
    if (findings.length || blind) return 1;
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
     * dies. Driven on 21 September.
     */
    await browser?.close().catch(() => {});
    for (const b of spent) await b.close().catch(() => {});
    /* AWAITED, unlike the bare `server.close()` this replaces: the callback is the moment the listening
       socket is actually gone. The port is ephemeral, so no later gate is waiting on this number, but a
       socket still listening is a handle that keeps the runner from exiting. */
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns this file with `BRAINDOG_GATE_SEED` set to its seeds and the
   header documents `node tools/gates/layout.mjs`. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await layout()) ?? 0;
