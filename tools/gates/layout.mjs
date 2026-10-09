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
 * that draws it at the size the owner judges it at (1512 and 1728, DIRECTION 37).
 *
 * WHAT COUNTS AS AN OVERFLOW is deliberately narrow, or a gate cries wolf and gets deleted. A table
 * wider than the viewport is CORRECT: it lives in `.table-region`, which scrolls, which is the
 * whole design. So an element is a finding only if nothing above it scrolls or clips. The document
 * scrolling sideways is a finding always, with no exceptions.
 */

import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from '@playwright/test';

import { APP_BASE, appShell, budget, openPage, readiness, skipDir } from './lib.mjs';
import { checkScreen, readScreen } from './printed.mjs';
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
 * EVERY RULE IN THIS GATE, AND THE FAULT EACH ONE IS PROVED ON (PRF-B02, `loop/scope/area-proof-b.md`).
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
  /** A seeded finding carries its seed's name, so `self-test` can tell which seed a red line answers. */
  const mark = (s, text) => (s ? `[${s.id}] ${text}` : text);
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
    { name: 'site', root: join(root, 'apps', 'site', 'build'), routes: (await routesOf(join(root, 'apps', 'site'))).routes, prerendered: true },
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
    '/t/3',
    '/nowhere',
    '/automations?tab=scheduled',
    '/automations?tab=scripts',
    '/automations?tab=doors',
    '/automations/new',
  ];
  /* AT THE SAMPLES IT HAD BEFORE, ONLY TO REFUSE A ROUTE WITH NO SAMPLE BEFORE A PORT IS TAKEN; the sweep reads them again
     at the record's own ids once the record is up (`routesFor`, PRF-B04). */
  let { routes: ROUTES, unsampled } = await routesFor(join(root, 'apps', 'web'), null, { extra: EXTRA });
  /** The addresses the record had nothing for, drawn as not found: said in the summary, never dropped. */
  let unseen = [];
  let missing = [];
  if (unsampled.length) {
    for (const u of unsampled) console.error(`  a route with no sample address: ${u}`);
    return 1;
  }

  /**
   * THE CONTROLS THAT DO NOT EXIST UNTIL SOMEBODY DOES SOMETHING, and this gate has never seen one.
   *
   * The sweep below measures a page AT REST: it opens a route, waits for it to settle, and reads
   * the geometry. That is the right default and it is not the whole product. Two of the targets a
   * phone actually presses are conditional markup, and both were under 44px for as long as they
   * have existed:
   *
   *   * `.capture-go`, the submit control of the register's capture line, measured 48x24. It is
   *     drawn inside `{#if capture.trim()}`, so at rest it is not in the document at all.
   *   * `.filter-value`, in the Display sheet, measured 358x34. It is the only way to sort a list
   *     or hide a column on a phone, and the sheet is closed at rest.
   *
   * Both were found by a person reading the CSS, not by this gate, on a run that reported zero
   * findings over 572 page-runs. A rule that cannot see a control cannot enforce anything about it.
   *
   * ONLY AT THE FLOOR WIDTHS, AND ONLY WHERE THERE IS AN ACT. The target-size rule turns on the
   * pointer and the pointer is emulated below 640, so a state opened at 1180px would be measured
   * against a rule that does not apply there. Three widths and two acts was six extra page-runs on
   * a sweep of five hundred and seventy-two.
   *
   * AND NOT AT THE FLOOR'S TWO LAPTOP WIDTHS, which joined it so every screen is drawn at the size the
   * owner reads it. Both are past the widest breakpoint under a fine pointer, which is the 1180px
   * argument again with more room, so the acts keep to the phones and the tablet: four widths and
   * eight page-runs on a sweep of about eighteen hundred.
   *
   * AN ACT THAT DOES NOT TAKE IS A FINDING AND NOT A SKIP. A `catch` here would give exactly the
   * green this block exists to stop being: the gate would report the state measured and have
   * measured the page behind it.
   */
  const ACTS = {
    '/r/obligations': [
      {
        name: 'capture typed',
        run: async (page) => {
          /* BELOW 640 THE CAPTURE LINE IS A SHEET BEHIND THE HEAD'S "+", so the act opens it first. */
          if (!(await page.locator('#capture').isVisible())) await page.click('.capture-open', { timeout: 4000 });
          await page.fill('#capture', 'a');
          await page.waitForSelector('.capture-go, [data-capture-go]:not([disabled])', { timeout: 4000 });
        },
      },
      {
        name: 'Display open',
        run: async (page) => {
          await page.getByRole('button', { name: 'Display' }).click({ timeout: 4000 });
          await page.waitForSelector('.filter-value', { timeout: 4000 });
        },
      },
    ],
  };

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

  /** Every source file that could hold a media query. */
  async function* sources(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (skipDir(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) yield* sources(p);
      else if (/\.(css|svelte)$/.test(e.name)) yield p;
    }
  }

  /** The pixel widths inside `@media` conditions, in every syntax this repo uses. */
  async function breakpoints() {
    const found = new Set();
    for (const dir of [join(root, 'apps', 'web', 'src'), join(root, 'packages', 'skin')]) {
      for await (const file of sources(dir)) {
        const text = await readFile(file, 'utf8');
        for (const m of text.matchAll(/(?:width\s*[<>]=?\s*|(?:min|max)-width:\s*)(\d+)px/g)) {
          found.add(Number(m[1]));
        }
      }
    }
    return [...found];
  }

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
  try {
    /* THE RECORD THE REGISTER LIST READS, forwarded to from this gate's own port, and its variants under the same
       handle, so the one `record.close()` below gives all of them back. See `record.mjs`. */
    record = await startRecord(0, { variants: true });
    /* THE ROUTES AT THE RECORD'S OWN IDS (PRF-B04): an automation and a catalogue entry by a real id, settled, and not
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
    const ready = readiness('layout', budget('ready').settleTimeoutMs, ROOT);
    /* AND THE SAME WAIT FOR A PRESS THAT OPENS SOMETHING, so the docked pass spells no number of its own. */
    const ACT_MS = budget('ready').settleTimeoutMs;

    const bps = (await breakpoints()).sort((a, b) => a - b);
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
    /* AND THE ADDRESS IT IS OPENED UNDER. The record app is `/app` (`svelte.config.js`), so its routes are opened as
       `/app<route>` and its fallback is `build/app/index.html`; the marketing site is prerendered at the root. The
       route itself stays as the tree names it, because `MAY_REFUSE` is written in those words. */
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

    browser = await chromium.launch();
    /**
     * WHAT ONE PAGE IS MEASURED FOR, hoisted so the variant pass runs the identical check.
     *
     * It was an inline arrow inside the width loop, which is fine while there is one loop. A second
     * pass over a second record with a COPY of this would be two rules wearing one name, the exact
     * shape this repo keeps finding. It is named once and passed to both.
     */
    const MEASURE = ([w, slack, COARSE, docked = false]) => {
          const hits = [];
          /* WITH A PANEL DOCKED, THE WORK ENDS WHERE THE PANEL STARTS, and that is the edge nothing in it may pass: the
             panel has a column of its own from 1,280 up, so a heading reaching under it has made `#main` scroll sideways
             beside it, which is the same bug as the document doing it with the panel shut. The panel's own contents are
             not the work's and are not read. */
          const dock = docked ? document.querySelector('dialog.dock[open]:not(:modal)') : null;
          const edge = dock ? dock.getBoundingClientRect().left : w;
          const work = document.getElementById('main');
          if (dock && work && work.scrollWidth > work.clientWidth + slack) {
            hits.push(`the work scrolls sideways beside the panel (${work.scrollWidth}px in ${work.clientWidth}px)`);
          }
          if (document.documentElement.scrollWidth > w + slack) {
            hits.push(`the DOCUMENT scrolls sideways (${document.documentElement.scrollWidth}px)`);
          }
          /* A table wider than the page is the design. A heading wider than the page is a bug. The
             difference is whether anything above it scrolls or clips. */
          /* THE WALK STOPS AT THE SURFACE, and that is the whole rule. It went all the way to `body`,
             and the shell's own `.body` panel is `overflow-y: auto`, which computes `overflow-x` to
             `auto` as well, so EVERY element inside `#main` had a scrolling ancestor and every one of
             them was excused. The gate could only ever see the nav and the tab bar; a 2000px heading in
             the middle of a page was contained by the thing that makes the page scroll at all.

             It went green on its own seeded violation the day a second surface got a scroll container,
             which is the self-test doing exactly what it is for. */
          /* THE THREE ROOTS THE SELECTOR BELOW WALKS FROM, and a `nav` INSIDE `#main` is not one of them.
             Stopping at every `nav` excused nothing and accused plenty: the settings tab strip is a
             `<nav>` with `overflow-x: auto`, doing exactly what a horizontal scroller does, and reading
             it as a surface root meant its own scrolling never counted: twenty-four findings about a
             control working as designed. A surface is where the measurement starts, not any element that
             happens to share its tag. */
          const surface = (el) =>
            el.id === 'main' || el.classList.contains('tab-slot') || (el.tagName === 'NAV' && !el.closest('#main'));
          const contained = (el) => {
            for (let a = el.parentElement; a && a !== document.body && !surface(a); a = a.parentElement) {
              const ox = getComputedStyle(a).overflowX;
              if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
            }
            return false;
          };
          for (const el of document.querySelectorAll('#main *, nav *, .tab-slot *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.right <= edge + 1) continue;
            if (getComputedStyle(el).position === 'fixed' || contained(el) || dock?.contains(el)) continue;
            hits.push(
              `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} reaches ${Math.round(r.right)}px` +
                (dock ? `, under the panel from ${Math.round(edge)}px` : ''),
            );
          }
          /**
           * AND EVERY CONTROL IS 44 x 44, WHICH NOTHING MEASURED.
           *
           * `packages/skin/a11y.css` states the rule and names the exact failure it is written against:
           * *"Both axes: a control grown only in height measures 38x44 and fails."* `13 §7` designs the
           * targets at 44 x 44 CSS px counting `::before`, and every route had been measured on a phone with
           * no target under 44px by hand, once, with no gate behind it. A review then found the six-option level segment on `/settings/people` at
           * **43 x 36**, on the primary control of that screen.
           *
           * WCAG 2.5.8 is 24px and this product designs to 44. The gate holds the product's number.
           *
           * The box is the union of the element and its `::before`, because a chevron drawn as a 20px
           * glyph inside a 44px pseudo-element is a 44px target and the element's own rect is not.
           * Anything with zero area is not on screen and is not a target.
           */
          /**
           * COARSE ONLY, AND THAT IS THE DESIGN RATHER THAN A GAP IN THE GATE.
           *
           * A review suggested running this on both pointers, and doing so reports every segmented
           * control in the product: `--ctl-h` is 44 on a coarse pointer and **36 on a fine one**, and
           * `05 §6` is explicit that density follows the pointer. 36px under a mouse is what this
           * product chose, not a defect. WCAG 2.5.8 asks 24 and this design gives 36 there and 44 under a
           * thumb.
           *
           * The skip link, which is what prompted it, is a different argument and is fixed at the
           * control rather than here: its audience reaches it by keyboard, and it takes `--tap`.
           */
          if (COARSE) {
            const box = (el) => {
              /* A CHECKBOX OR RADIO INSIDE ITS OWN LABEL IS PRESSED THROUGH THE LABEL. The browser toggles the input on a
                 press anywhere in a wrapping `<label>`, so that box is the target, the way a `::before` is below. Only the
                 wrapping form counts: a `for=` label elsewhere on the screen is not round the control. A native box is
                 drawn at the size of the element, so a 44px input would be a 44px square of chrome; `/packs/share` gives
                 its rows `min-block-size: var(--tap)` and this is the rule that sees it. */
              const around = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') : null;
              if (around) {
                const l = around.getBoundingClientRect();
                return [l.width, l.height];
              }
              const r = el.getBoundingClientRect();
              const b = getComputedStyle(el, '::before');
              const w = parseFloat(b.width);
              const h = parseFloat(b.height);
              return [Math.max(r.width, Number.isFinite(w) ? w : 0), Math.max(r.height, Number.isFinite(h) ? h : 0)];
            };
            const small = [];
            /* THE WHOLE DOCUMENT, not `#main`. Scoping to the main region excused the shell: the skip
               link, which is the first target a keyboard user reaches on every route, and the palette's
               own text field. A target is a target wherever it is drawn. */
            for (const el of document.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, summary')) {
              if (el.closest('[hidden], [aria-hidden="true"]')) continue;
              const [w2, h2] = box(el);
              if (w2 === 0 || h2 === 0) continue;
              /* HALF A PIXEL OF SLACK. A 44px control measures 43.99 whenever a border, a transform or a
                 fractional font metric lands between the box and the device pixel. `/audit`'s spoken-id
                 links reported 44x44 and failed on the raw comparison. The rule is 44 CSS px; a gate
                 that fires on rounding is a gate somebody switches off. */
              if (w2 >= 43.5 && h2 >= 43.5) continue;
              const name = `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')}`;
              small.push(`${name} is ${Math.round(w2)}x${Math.round(h2)} ("${(el.textContent ?? '').trim().slice(0, 24)}")`);
            }
            for (const s of [...new Set(small)].slice(0, 3)) hits.push(`a target under 44px on a coarse pointer: ${s}`);
          }
          return [...new Set(hits)].slice(0, 4);
    };

    const findings = [];
    let checked = 0;

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
    /* THE GATE'S OWN PROOF THAT IT LOOKS AT ANYTHING. With `BRAINDOG_GATE_SEED=layout-overflow` a 2000px heading is put into `#main`
       (the exact bug this gate is named after) and the run must go red. It is here rather than in a fixture tree because
       the thing under test is a real browser over a real build, and there is no smaller way to hold that. One function
       for every pass that seeds, so the heading the docked pass is proved on is the one the sweep is. */
    const seedHeading = (page) =>
      page.evaluate(() => {
        const h = document.createElement('h2');
        h.textContent = 'seeded';
        h.style.cssText = 'width:2000px;white-space:nowrap';
        document.getElementById('main')?.prepend(h);
      });

    /* A CONTROL ONE OR TWO PIXELS SHORT OF THE RULE, for the two target seeds. Its own `::before` is put out, because the
       rule counts a pseudo-element's box as the target and a skin that grows every button's would grow this one too. */
    const seedTarget = async (page, w, h) => {
      await page.addStyleTag({ content: '.seeded-target::before,.seeded-target::after{content:none !important}' });
      await page.evaluate(
        ([w, h]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'seeded-target';
          b.textContent = 'seeded';
          b.style.cssText =
            `all:unset;display:block;box-sizing:border-box;inline-size:${w};block-size:${h};` +
            'min-inline-size:0;min-block-size:0;padding:0;border:0;overflow:hidden';
          document.getElementById('main')?.prepend(b);
        },
        [w, h],
      );
    };
    /* WHAT EACH SEED DOES TO A PAGE IT HAS OPENED. `layout-settle` is not here: its fault has to be in place before the
       page loads, so it is planted on the context (`takeMark`). */
    const PLANT = {
      'layout-overflow': seedHeading,
      'layout-site': seedHeading,
      'layout-target': (page) => seedTarget(page, '30px', '30px'),
      'layout-target-edge': (page) => seedTarget(page, '43px', '44px'),
      'layout-full': (page) => page.addStyleTag({ content: '#main{max-inline-size:60% !important}' }),
      'layout-dock': (page) => page.addStyleTag({ content: 'dialog.dock{display:none !important}' }),
    };
    const plant = async (page, s) => {
      if (s && Object.hasOwn(PLANT, s.id)) await PLANT[s.id](page);
    };
    /* THE MARK TAKEN OFF `#main` EVERY TIME THE SCREEN PUTS IT ON, from before the first script runs, so the wait sees a
       screen that never says it is drawn, and on the reload it is given as well. `data-screen` is `lib.mjs`'s `SCREEN`. */
    const takeMark = (context) =>
      context.addInitScript(() => {
        new MutationObserver(() => document.getElementById('main')?.removeAttribute('data-screen')).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['data-screen'],
        });
      });

    /** The record `/api` reaches on this pass, as `openPage` reads it: the gates' own, or the variant the pass names. */
    const asked = () => (asking === null ? record : recordAt(record.variants[asking]));
    /**
     * WHAT A SETTLED SCREEN PRINTS (PRF-B04 job 5, `printed.mjs` `checkScreen`): on every page-run, a raw id, a raw time,
     * a key, a value that never arrived or a page error is a finding of this gate too. Said once a screen, and only of
     * a screen that settled.
     */
    const printedOn = async (opened, where, planted, route) => {
      for (const f of checkScreen(await readScreen(opened, where), { missing: missing.includes(route) })) findings.push(mark(planted, f));
    };

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

    for (const width of widths)
      for (const planted of sweepSeeds) {
        /**
         * A COARSE POINTER AT PHONE WIDTHS, because that is the axis the target-size rule turns on.
         *
         * `05 §6` and `13 §7`: density follows the POINTER, never the width. `--ctl-h` is 44 on a coarse
         * pointer and **36** on a fine one, measured in the built page. (Two comments in this repo say 32,
         * including `controls.css`'s; the token is 36.) A gate that only ever emulated a mouse could
         * measure every width this product has and never once see the size a thumb gets.
         */
        /* OPENED THE ONE WAY EVERY GATE OPENS A PAGE (PRF-B04, `openPage`): the record's clock, and a coarse pointer at a
           phone's width. The mark is taken off after the first load, so every route below is loaded with it gone. */
        const opened = await openPage(browser, `http://localhost:${PORT}${base}${ROUTES[0]}`, { width, touch: width < 640, record: asked(), ready });
        const { context, page } = opened;
        if (planted?.id === 'layout-settle') await takeMark(context);
        process.stdout.write(`    ${String(width).padStart(4)}px ${planted ? `${planted.id} ` : ''}`);

        for (const route of ROUTES) {
          /* `domcontentloaded` IS WORTH NOTHING ON ITS OWN HERE and never was: `ssr = false`, so the shell
             served off disk is a script tag that imports the client, and `#main` does not exist until it
             has run. The wait for the screen's mark is the only thing between the gate and an empty document, which is
             why its expiry is a finding and not a `catch`. */
          const unmeasured = ready.check(`${route} @${width}`, route, await opened.goto(`http://localhost:${PORT}${base}${route}`));
          if (unmeasured) {
            findings.push(mark(planted, unmeasured));
            process.stdout.write('!');
            continue;
          }
          // An un-laid-out rowgroup has no geometry: it cannot overflow, and it cannot be measured.
          await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
          await plant(page, planted);
          await page.waitForTimeout(L.settleMs);

          const out = await page.evaluate(MEASURE, [width, L.widthTolerancePx, width < 640]);

          checked++;
          process.stdout.write(out.length ? '!' : '.');
          for (const o of out) findings.push(mark(planted, `${route} @${width}  ${o}`));
          await printedOn(opened, `${route} @${width}`, planted, route);

          /* AND THEN THE STATES, at the widths where the rule they break applies. `FLOOR` short of its
             desktops is the phones and the tablet; above them the pointer is fine and a 34px control is the
             density this product means. */
          if (FLOOR.includes(width) && !desktop(width))
            for (const act of ACTS[route] ?? []) {
              try {
                await act.run(page);
              } catch (e) {
                findings.push(mark(planted, `${route} @${width}  could not reach "${act.name}": ${String(e).split('\n')[0]}`));
                process.stdout.write('!');
                continue;
              }
              await page.waitForTimeout(L.settleMs);
              const after = await page.evaluate(MEASURE, [width, L.widthTolerancePx, width < 640]);
              checked++;
              process.stdout.write(after.length ? '!' : ':');
              for (const o of after) findings.push(mark(planted, `${route} @${width} (${act.name})  ${o}`));
              /* BACK TO REST, because the acts share one page and the next one must not open its sheet
                 over the last one's. A reload is cheaper to reason about than an undo per act. */
              await opened.goto(`http://localhost:${PORT}${base}${route}`);
              await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
            }
        }
        process.stdout.write('\n');
        await context.close();
      }

    /**
     * AND THE MAIN SCREENS FILL THE WINDOW, which nothing above can say.
     *
     * DIRECTION 36: "it's not even filling fully horizontally on my macbook". Every check in this file is about a page
     * that is too WIDE, and a page held to a narrow column in the middle of a laptop scrolls nowhere and has nothing to
     * press under 44px, so it sweeps clean at every width. 37 asks for full width with fluid gutters, judged at the
     * owner's two MacBook widths, and this is the half of that the sweep could not see.
     *
     * THE WIDEST CONTENT BOX IN `#main`, NOT `#main` ITSELF. `#main` is the shell's grid column and always takes the room
     * beside the rail; a page that caps itself inside it is the defect. So every element drawn in `#main` is read, less
     * its own padding and border, and the widest is the screen's content. The widest and not some fixed wrapper, because
     * a screen is free to draw its prose at 72ch beside a wide list: one thing running the width is what full width means.
     * Inline boxes, positioned layers and anything reaching past `#main` (a table scrolling in its region) are not the
     * page's width and are not read.
     *
     * THE ROOM IS THE COLUMN THE SHELL GIVES THE WORK, read off the shell's own grid: the track `#main` stands in, so the
     * rail card's column, folded or not, and the docked panel's column are both outside it. It was the viewport less
     * `.rail-slot`'s width, which is only drawn on the rail: on the top bar and the menu it read 0 and the room was the
     * whole window, right with the panel shut and 400 too wide with it open (research-audit-16 L12). The track is what
     * the shell gave and not what the page took, so a page capping itself is still the short one.
     *
     * ON ALL THREE SHAPES, because each lays the work out on its own grid and only one of them was ever drawn. A shape
     * the record keeps is kept through its own `setPref` (`openPage`'s `prefs`), and a pass that asked for the top bar and got the rail says so
     * rather than measuring the rail three times.
     *
     * NAMED BY THEIR NAMES, because a red line here is read by somebody deciding which screen to open. The addresses are
     * the shipped seed's pages (`packages/seed/src/modules`): Projects is `portfolio`.
     */
    const MAIN_SCREENS = [
      { name: 'Today', route: '/' },
      { name: 'Work', route: '/p/work' },
      { name: 'Decide', route: '/decide' },
      { name: 'Money', route: '/p/money' },
      { name: 'Projects', route: '/p/portfolio' },
      { name: 'People', route: '/p/people' },
    ];
    /* THE THREE SHAPES `19 §3` OFFERS, by what the shell writes on `.shell[data-shape]` and what the record keeps to ask
       for each. The rail is the default and asks for nothing; the record's word for it is not the shell's. */
    const SHAPES = [
      { name: 'the rail', drawn: 'rail', keeps: null },
      { name: 'the top bar', drawn: 'bar', keeps: { 'nav.shape': 'bar' } },
      { name: 'the menu', drawn: 'menu', keeps: { 'nav.shape': 'menu' } },
    ];
    /**
     * A desktop window drawing one shape, opened at `route` (`openPage`). THE SHAPE IS KEPT BY THE RECORD, through its own
     * `setPref` as a person's Settings keeps it, and the next window that asks for none hands it back. Motion is reduced
     * unless the pass is watching something move.
     */
    const openFor = (width, shape, route, reducedMotion = 'reduce') =>
      openPage(browser, `http://localhost:${PORT}${base}${route}`, { width, record: asked(), prefs: shape.keeps ?? {}, reducedMotion, ready });
    /**
     * Opens a screen and waits for it to settle; `false`, with the finding written, when it never did. A screen that
     * settled is read for what it prints (`printedOn`).
     */
    const reach = async (opened, route, where, planted = null) => {
      const unmeasured = ready.check(where, route, await opened.goto(`http://localhost:${PORT}${base}${route}`));
      if (unmeasured) {
        findings.push(mark(planted, unmeasured));
        process.stdout.write('!');
        return false;
      }
      await opened.page.waitForTimeout(L.settleMs);
      await printedOn(opened, where, planted, route);
      return true;
    };
    const SPAN = () => {
      const main = document.getElementById('main');
      if (!main) return null;
      const box = main.getBoundingClientRect();
      const px = (v) => parseFloat(v) || 0;
      let widest = 0;
      for (const el of main.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.display === 'inline' || s.display === 'contents' || s.position === 'fixed' || s.position === 'absolute') continue;
        if (el.closest('dialog')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.left < box.left - 1 || r.right > box.right + 1) continue;
        const inner = r.width - px(s.paddingLeft) - px(s.paddingRight) - px(s.borderLeftWidth) - px(s.borderRightWidth);
        if (inner > widest) widest = inner;
      }
      /* THE SHELL'S TRACKS, as the browser resolved them (`216px 1256px 0px` on the rail with the panel shut), and the
         one `#main` starts in is the room. The track after it, when there is one, is the docked panel's column. */
      const shell = main.closest('.shell');
      const tracks = shell ? getComputedStyle(shell).gridTemplateColumns.split(' ').map(parseFloat).filter(Number.isFinite) : [];
      let start = shell ? shell.getBoundingClientRect().left : 0;
      let room = box.width;
      let dock = 0;
      for (const [i, t] of tracks.entries()) {
        if (box.left + 1 < start + t) {
          room = t;
          dock = tracks[i + 1] ?? 0;
          break;
        }
        start += t;
      }
      return { widest: Math.round(widest), room: Math.round(room), dock: Math.round(dock), shape: shell?.getAttribute('data-shape') ?? null };
    };
    /* THE WIDTHS THIS PART DRAWS, AND ANY NO PART DRAWS, in the first part, so a width named in the budget is never
       judged by nobody. NOT UNDER THE OTHER SEEDS for the full-width pass: a 2000px heading proves nothing about a narrow
       page. Its own seed caps `#main` on one page, the first width, the rail and Today, in the first part. */
    const ours = (list) => (seeds ? [] : list.filter((w) => widths.includes(w) || (part === 1 && !every.includes(w))));
    const fullSeed = plants('layout-full');
    const fullAt = fullSeed ? (part === 1 ? L.fullWidthAtPx.slice(0, 1) : []) : ours(L.fullWidthAtPx);
    const pct = new Intl.NumberFormat('en', { style: 'percent' });
    /** What is wrong with a screen narrower than its room, or `null`. `beside` says what the room is. */
    const short = (span, beside) =>
      span.widest < span.room * L.fullWidthShare
        ? `is ${span.widest}px wide at most in the ${span.room}px ${beside} ` +
          `(${pct.format(span.widest / span.room)}), and a main screen fills ${pct.format(L.fullWidthShare)}: a cap or a centred column`
        : null;
    /** What is wrong with a shell that drew another shape than the one asked for, or `null`. */
    const misdrawn = (span, shape) =>
      span.shape === shape.drawn ? null : `asked for ${shape.name} and the shell drew ${span.shape ?? 'no shell'}, so ${shape.name} was not measured`;
    for (const width of fullAt)
      for (const shape of fullSeed ? SHAPES.slice(0, 1) : SHAPES) {
        const screens = fullSeed ? MAIN_SCREENS.slice(0, 1) : MAIN_SCREENS;
        const opened = await openFor(width, shape, screens[0].route);
        const { context, page } = opened;
        process.stdout.write(`    full @${String(width).padStart(4)} ${shape.drawn.padEnd(4)} `);
        for (const screen of screens) {
          const where = `${screen.name} (${screen.route}) @${width} on ${shape.name}`;
          if (!(await reach(opened, screen.route, `${screen.route} @${width} on ${shape.name} (full width)`, fullSeed))) continue;
          await plant(page, fullSeed);
          const span = await page.evaluate(SPAN);
          checked++;
          const said = span === null ? 'drew no #main to measure for full width' : (misdrawn(span, shape) ?? short(span, 'the shell gives the work'));
          process.stdout.write(said ? '!' : '.');
          if (said) findings.push(mark(fullSeed, `${where}  ${said}`));
        }
        process.stdout.write('\n');
        await context.close();
      }

    /**
     * AND WITH A PANEL DOCKED BESIDE THE WORK, which no pass above ever opened (research-audit-16 L12).
     *
     * DIRECTION 37's docked right panel takes a column of its own from 1,280 up, and every screen that opens a task or a
     * row narrows beside it. Every pass above measures a screen at rest, so the three things that go wrong only while a
     * panel is open swept green: the work squeezed under the panel or scrolling sideways beside it, blocks paired into
     * halves by the window's width when the panel has taken a third of it (H2), and the column opening in one frame while
     * the panel takes a quarter of a second to arrive, so a strip of bare ground shows where it will be (M1).
     *
     * AT 1,280, 1,440 AND 1,728 (`dockedAtPx`): where the panel first docks, where blocks begin to pair, and the owner's
     * wide laptop. On all three shapes, because the panel's column is a track of each shape's own grid.
     *
     * TWO SCREENS, ONE FOR EACH WAY A PANEL OPENS: a task's title on Work (`.item-open`, the renderer's row verb) and `p`
     * on a list (the register's peek). An open that does not take is a finding and not a skip, for the reason `ACTS`
     * gives.
     *
     * WHAT IS READ, IN ORDER:
     *   * THE ARRIVAL, WITH MOTION ON. Every pass above reduces motion, which is the right default and is exactly why a
     *     panel that arrives late was never seen. Each frame from the press until the panel is still, the ground between
     *     the work's edge and the panel's is read; more than `dockBlankShare` of the panel's column over the gap it rests
     *     at is the blank column.
     *   * THE OVERFLOW RULE, with the panel's edge for the window's (`MEASURE`'s `docked`).
     *   * FULL WIDTH, IN THE COLUMN LEFT BESIDE THE PANEL, by the same share as at rest.
     *   * THE PAIRING, AGAINST THE SAME SCREEN WITH THE SAME ROOM AND NO PANEL. Blocks set side by side beside the panel
     *     are compared with the screen drawn in a window narrower by the panel's column, where the work has about the same
     *     room and nothing is docked. If that window stacks them, pairing read the window and not the work. No number
     *     of pixels is assumed: the product's own rule at that room is the measure.
     */
    const DOCKED = [
      { name: 'Work', route: '/p/work', open: (page) => page.locator('#main .item-open:visible').first().click({ timeout: ACT_MS }) },
      { name: 'Bills and invoices', route: '/r/obligations', open: (page) => page.keyboard.press('p') },
    ];
    /* EACH FRAME FROM THE PRESS UNTIL THE PANEL IS STILL, the widest ground between the work and the panel. Still is two
       frames with the gap unchanged and nothing running on the panel or on the root; `limit` ends a watch on a panel
       that never came.

       THE ROOT TOO, because the column is a transition there and not on the panel: `--dock-col` waits `--d-panel` and
       then lands in one step (`Panel.svelte`). Read off the panel alone, a slide that ended a frame before the column
       came looked still with the panel over the work's end, and the column landing after the watch was never seen.
       A transition in its delay is running, so the root's list holds it until it lands.

       THE WIDEST GAP STARTS AT THE FIRST ONE READ, NOT AT 0. While the panel slides in over the work the gap is
       negative, and a 0 to start from made every watch that ended there report the whole overlap as bare ground.

       AND A WATCH THAT RUNS OUT HAS NO REST, so it says it never came to rest and gives no gap to measure from: the last
       one read was mid-slide, and the overlap against it is the same false bare ground. `#main` is read each frame,
       because a press that changes the address draws a new one (`{#key}` in `+layout.svelte`). */
    const ARRIVAL = (limit) =>
      new Promise((done) => {
        const from = performance.now();
        let blank = null;
        let last = null;
        let still = 0;
        const moving = (el) => el.getAnimations().some((a) => a.playState === 'running');
        const frame = () => {
          const main = document.getElementById('main');
          /* A PANEL WITH NO WIDTH HAS NOT ARRIVED, though the dialog is open: `display: none` or a column of 0 leaves the
             work beside nothing, and read as docked it put the panel's edge at 0 and every element of the work under it
             (the `layout-dock` seed). */
          const shown = document.querySelector('dialog.dock[open]:not(:modal)');
          const dock = shown && shown.getBoundingClientRect().width > 0 ? shown : null;
          if (dock && main) {
            const gap = dock.getBoundingClientRect().left - main.getBoundingClientRect().right;
            if (blank === null || gap > blank) blank = gap;
            still = last !== null && Math.abs(gap - last) < 1 && !moving(dock) && !moving(document.documentElement) ? still + 1 : 0;
            last = gap;
            if (still > 1) return done({ docked: true, settled: true, blank: Math.round(blank), rest: Math.round(gap) });
          }
          if (performance.now() - from > limit) return done({ docked: dock !== null, settled: false, blank: null, rest: null });
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    /* THE NARROWEST OF ANY TWO BLOCKS SET SIDE BY SIDE in the work, or `null` when every block has its row to itself. */
    const PAIRED = () => {
      const slots = [...document.querySelectorAll('#main .block-slot')]
        .filter((el) => !el.closest('dialog'))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      let narrowest = null;
      for (const a of slots)
        for (const b of slots)
          if (a !== b && Math.abs(a.top - b.top) < 1 && a.right <= b.left + 1) narrowest = Math.min(narrowest ?? a.width, a.width, b.width);
      return narrowest === null ? null : Math.round(narrowest);
    };
    /* UNDER THE SEEDS, ONE PAGE WITH THE PANEL OPEN PER SEED, AND NOT NONE (research-audit-16 L12: this pass skipped the
       seed, so `self-test` had never once asked it to go red). The first width, the rail and Work: the seeded heading is
       2000px wide, so it reaches under the panel at every width on every shape, and `self-test` holds the run to naming
       that; the panel hidden before the press is a panel that never arrives. In the first part only, like every width no
       part draws. Each seed reaches the screen afresh, so the style one plants is gone before the next is planted. */
    const seeded = seeds !== null;
    const dockSeeds = plantedIn('dock');
    const dockAt = seeded ? (part === 1 && dockSeeds.length ? L.dockedAtPx.slice(0, 1) : []) : ours(L.dockedAtPx);
    const dockRuns = seeded ? dockSeeds.map((s) => ({ screen: DOCKED[0], planted: s })) : DOCKED.map((d) => ({ screen: d, planted: null }));
    for (const width of dockAt)
      for (const shape of seeded ? SHAPES.slice(0, 1) : SHAPES) {
        const opened = await openFor(width, shape, dockRuns[0]?.screen.route ?? DOCKED[0].route, 'no-preference');
        const { context, page } = opened;
        process.stdout.write(`    dock @${String(width).padStart(4)} ${shape.drawn.padEnd(4)} `);
        for (const { screen, planted } of dockRuns) {
          const where = `${screen.name} (${screen.route}) @${width} on ${shape.name}, panel open`;
          if (!(await reach(opened, screen.route, `${screen.route} @${width} on ${shape.name} (docked)`, planted))) continue;
          await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
          if (planted?.id === 'layout-dock') await plant(page, planted);
          const watching = page.evaluate(ARRIVAL, L.dockArrivalMs);
          try {
            await screen.open(page);
          } catch (e) {
            await watching.catch(() => null);
            findings.push(mark(planted, `${where}  could not open a panel: ${String(e).split('\n')[0]}`));
            process.stdout.write('!');
            continue;
          }
          /* `null` IS A PAGE THAT LOADED AGAIN UNDER THE WATCH, which took the watch with it: the press left the screen. */
          const arrival = await watching.catch(() => null);
          checked++;
          if (arrival === null || !arrival.docked) {
            findings.push(
              mark(
                planted,
                `${where}  ${arrival === null ? 'loaded the page again instead of opening a panel' : `opened no docked panel in ${L.dockArrivalMs}ms: a sheet over the screen, or nothing`}`,
              ),
            );
            process.stdout.write('!');
            continue;
          }
          if (planted?.id === 'layout-overflow') await plant(page, planted);
          await page.waitForTimeout(L.settleMs);
          const said = [...(await page.evaluate(MEASURE, [width, L.widthTolerancePx, false, true]))];
          if (!arrival.settled) said.push(`was still moving ${L.dockArrivalMs}ms after the press, so how it arrived was not read`);
          const span = await page.evaluate(SPAN);
          if (span === null) said.push('drew no #main to measure beside the panel');
          else {
            const wrong = misdrawn(span, shape);
            if (wrong) said.push(wrong);
            else {
              const narrow = short(span, 'left beside the panel');
              if (narrow) said.push(narrow);
              if (arrival.rest !== null && arrival.blank - arrival.rest > span.dock * L.dockBlankShare)
                said.push(
                  `showed ${arrival.blank - arrival.rest}px of bare ground between the work and the panel while it arrived: ` +
                    'the column opened before the panel came to fill it',
                );
              const pairs = await page.evaluate(PAIRED);
              if (pairs !== null && span.dock > 0) {
                /* THE SAME SCREEN, NO PANEL, IN A WINDOW NARROWER BY THE PANEL'S COLUMN. */
                const alike = width - span.dock;
                const shut = await openFor(alike, shape, screen.route);
                const other = shut.context;
                const bare = shut.page;
                if (await reach(shut, screen.route, `${screen.route} @${alike} on ${shape.name} (the panel's room, shut)`, planted)) {
                  await bare.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
                  const apart = await bare.evaluate(PAIRED);
                  const room = await bare.evaluate(SPAN);
                  checked++;
                  if (apart === null)
                    said.push(
                      `sets blocks side by side, the narrower ${pairs}px, in the ${span.room}px left beside the panel, where a ${alike}px ` +
                        `window with ${room?.room ?? alike}px for the work stacks them: pairing reads the window and not the work`,
                    );
                }
                await other.close();
              }
            }
          }
          process.stdout.write(said.length ? '!' : '.');
          for (const s of [...new Set(said)]) findings.push(mark(planted, `${where}  ${s}`));
        }
        process.stdout.write('\n');
        await context.close();
      }

    /**
     * The variants, at the widths that matter for them.
     *
     * Only the routes that branch, and only on a phone and a desktop. The point is that the OTHER half
     * of the branch is drawn at all and holds together, not a second full sweep of a build that differs
     * from the first by one constant.
     */
    /* The floor and a desktop. `FLOOR` is the gate's own. A numeric literal here would be the
       thing `lib.mjs` forbids, and the narrowest phone is the width its preamble argues for.

       THE FLOOR CARRIES ITS OWN DESKTOPS NOW, the owner's two laptop widths, so the widest breakpoint is
       added only when no floor width reaches it. Added anyway, every variant route would be drawn at three
       widths past the last breakpoint, where all three draw the one layout. */
    const variantWidths = FLOOR.some(desktop) ? [...FLOOR] : [...FLOOR, bps[bps.length - 1] ?? 1_200];
    /* AND ONE OF THEM UNDER THE SEED. The seeded heading is 2000px wide, so the narrowest width proves
       what every one of them proves, and the rest are browser contexts on every `pnpm gates`. */
    if (seeds) variantWidths.length = 1;

    /* THE VARIANTS ONCE, IN THE FIRST PART, because they do not depend on the width list above. */
    if (part === 1)
      for (const { v, planted } of variantRuns) {
        serving = v.root;
        base = v.prerendered ? '' : APP_BASE;
        asking = v.record ?? null;
        /* THE PORT ANSWERS FOR THE VARIANT BEFORE ANYTHING IS MEASURED ON IT, which is what `answers` proves of the main
           record above: a pass over a forward that still pointed at the first record would be the first record again. */
        if (asking !== null) await answers(`http://localhost:${PORT}`);
        for (const width of variantWidths) {
          /* OPENED AS EVERY PAGE IS (`openPage`), ON THE VARIANT'S OWN CLOCK; the site is drawn on the gates' record's. */
          const opened = await openPage(browser, `http://localhost:${PORT}${base}${v.routes[0]}`, {
            width,
            touch: width < 640,
            record: asked(),
            ready,
            prerendered: v.prerendered === true,
          });
          const { context, page } = opened;
          process.stdout.write(`    ${v.name} @${String(width).padStart(4)} `);
          for (const route of v.routes) {
            /* THE SAME READINESS, or the variant pass is the half of this gate that can still go green
               over nothing. The site is prerendered and says so in `VARIANTS`. */
            const unmeasured = ready.check(`${v.name}${route} @${width}`, route, await opened.goto(`http://localhost:${PORT}${base}${route}`));
            if (unmeasured) {
              findings.push(mark(planted, unmeasured));
              process.stdout.write('!');
              continue;
            }
            /* THE SAME PREPARATION, or "the identical check" is only true of the function. An un-laid-out
               rowgroup has no geometry and cannot overflow; the seed is what makes this pass answerable by
               `self-test`, which otherwise passes on the main loop alone however little the variant pass
               measures. */
            await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
            await plant(page, planted);
            await page.waitForTimeout(L.settleMs);
            const out = await page.evaluate(MEASURE, [width, L.widthTolerancePx, width < 640]);
            checked++;
            process.stdout.write(out.length ? '!' : '.');
            for (const o of out) findings.push(mark(planted, `${v.name}${route} @${width}  ${o}`));
            await printedOn(opened, `${v.name}${route} @${width}`, planted, route);
          }
          process.stdout.write('\n');
          await context.close();
        }
      }
    serving = ROOT;
    asking = null;

    console.log(
      `  layout: ${checked} page-runs over ${widths.length} widths ` +
        `(${of === 1 ? `${bps.join(', ')} + floor` : `${widths.join(', ')}, part ${part} of ${of}`}), ${findings.length} finding(s)`,
    );

    /* EVERY FINDING OF A SEEDED RUN, because `self-test` reads them for each seed's name and a cut would hide a seed's. */
    const shown = seeds ? findings.length : L.findingsShown;
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
