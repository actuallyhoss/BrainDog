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
 * breakpoint anyone writes.
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

import { APP_BASE, appShell, budget, readiness, skipDir } from './lib.mjs';
import { answers, forward, forwards, startRecord, VARIANTS as RECORDS } from './record.mjs';
import { routesOf } from './routes.mjs';

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
export default async function layout(root = join(import.meta.dirname, '..', '..')) {
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
  const { routes: ROUTES, unsampled } = await routesOf(join(root, 'apps', 'web'), [
    '/p/estate',
    '/p/work',
    '/p/kiln',
    '/t/3',
    '/nowhere',
    '/automations?tab=scheduled',
    '/automations?tab=scripts',
    '/automations?tab=doors',
    '/automations/new',
  ]);
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
   * against a rule that does not apply there. Three widths and two acts is six extra page-runs on
   * a sweep of five hundred and seventy-two.
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

  /** The narrowest phone still in the wild, one bigger phone, one common tablet. */
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

    const bps = (await breakpoints()).sort((a, b) => a - b);
    /* One pixel either side of each. `width < 900px` is on at 899 and off at 900, and those are two
       different layouts that both have to hold. */
    const widths = [...new Set([...FLOOR, ...bps.flatMap((b) => [b - 1, b])])].sort((a, b) => a - b);

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
    const MEASURE = ([w, slack, COARSE]) => {
          const hits = [];
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
            if (r.width === 0 || r.right <= w + 1) continue;
            if (getComputedStyle(el).position === 'fixed' || contained(el)) continue;
            hits.push(
              `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} reaches ${Math.round(r.right)}px`,
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
    if (process.env.BRAINDOG_GATE_SEED) {
      widths.length = 1;
      ROUTES.length = 1;
      present.length = Math.min(present.length, 1);
      if (present.length === 0) console.log('  layout: no variant is built, so the variant pass is not under test on this run.');
      else present[0] = { ...present[0], routes: present[0].routes.slice(0, 1) };
    }

    for (const width of widths) {
      /**
       * A COARSE POINTER AT PHONE WIDTHS, because that is the axis the target-size rule turns on.
       *
       * `05 §6` and `13 §7`: density follows the POINTER, never the width. `--ctl-h` is 44 on a coarse
       * pointer and **36** on a fine one, measured in the built page. (Two comments in this repo say 32,
       * including `controls.css`'s; the token is 36.) A gate that only ever emulated a mouse could
       * measure every width this product has and never once see the size a thumb gets.
       */
      const context = await browser.newContext({
        viewport: { width, height: L.viewportHeightPx },
        reducedMotion: 'reduce',
        hasTouch: width < 640,
        isMobile: width < 640,
        bypassCSP: true,
      });
      const page = await context.newPage();
      process.stdout.write(`    ${String(width).padStart(4)}px `);

      for (const route of ROUTES) {
        await page.goto(`http://localhost:${PORT}${base}${route}`, { waitUntil: 'domcontentloaded' });
        /* `domcontentloaded` IS WORTH NOTHING ON ITS OWN HERE and never was: `ssr = false`, so the shell
           served off disk is a script tag that imports the client, and `#main` does not exist until it
           has run. This wait is the only thing between the gate and an empty document, which is why its
           expiry is a finding and not a `catch`. */
        const unmeasured = ready.check(`${route} @${width}`, route, await ready.settled(page));
        if (unmeasured) {
          findings.push(unmeasured);
          process.stdout.write('!');
          continue;
        }
        // An un-laid-out rowgroup has no geometry: it cannot overflow, and it cannot be measured.
        await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
        /* THE GATE'S OWN PROOF THAT IT LOOKS AT ANYTHING. With `BRAINDOG_GATE_SEED=1` a 2000px heading
           is put into `#main` (the exact bug this gate is named after) and the run must go red. It is
           here rather than in a fixture tree because the thing under test is a real browser over a real
           build, and there is no smaller way to hold that. */
        if (process.env.BRAINDOG_GATE_SEED)
          await page.evaluate(() => {
            const h = document.createElement('h2');
            h.textContent = 'seeded';
            h.style.cssText = 'width:2000px;white-space:nowrap';
            document.getElementById('main')?.prepend(h);
          });
        await page.waitForTimeout(L.settleMs);


        const out = await page.evaluate(MEASURE, [width, L.widthTolerancePx, width < 640]);

        checked++;
        process.stdout.write(out.length ? '!' : '.');
        for (const o of out) findings.push(`${route} @${width}  ${o}`);

        /* AND THEN THE STATES, at the widths where the rule they break applies. `FLOOR` is the phone
           set; above it the pointer is fine and a 34px control is the density this product means. */
        if (FLOOR.includes(width))
          for (const act of ACTS[route] ?? []) {
            try {
              await act.run(page);
            } catch (e) {
              findings.push(`${route} @${width}  could not reach "${act.name}": ${String(e).split('\n')[0]}`);
              process.stdout.write('!');
              continue;
            }
            await page.waitForTimeout(L.settleMs);
            const after = await page.evaluate(MEASURE, [width, L.widthTolerancePx, width < 640]);
            checked++;
            process.stdout.write(after.length ? '!' : ':');
            for (const o of after) findings.push(`${route} @${width} (${act.name})  ${o}`);
            /* BACK TO REST, because the acts share one page and the next one must not open its sheet
               over the last one's. A reload is cheaper to reason about than an undo per act. */
            await page.goto(`http://localhost:${PORT}${base}${route}`, { waitUntil: 'domcontentloaded' });
            await ready.settled(page);
            await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
          }
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
       thing `lib.mjs` forbids, and the narrowest phone is the width its preamble argues for. */
    const variantWidths = [...FLOOR, bps[bps.length - 1] ?? 1_200];
    /* AND ONE OF THEM UNDER THE SEED. The seeded heading is 2000px wide, so the narrowest width proves
       what four of them prove, and the other three are three browser contexts on every `pnpm gates`. */
    if (process.env.BRAINDOG_GATE_SEED) variantWidths.length = 1;

    for (const v of present) {
      serving = v.root;
      base = v.prerendered ? '' : APP_BASE;
      asking = v.record ?? null;
      /* THE PORT ANSWERS FOR THE VARIANT BEFORE ANYTHING IS MEASURED ON IT, which is what `answers` proves of the main
         record above: a pass over a forward that still pointed at the first record would be the first record again. */
      if (asking !== null) await answers(`http://localhost:${PORT}`);
      for (const width of variantWidths) {
        const context = await browser.newContext({
          viewport: { width, height: L.viewportHeightPx },
          reducedMotion: 'reduce',
          hasTouch: width < 640,
          isMobile: width < 640,
          bypassCSP: true,
        });
        const page = await context.newPage();
        process.stdout.write(`    ${v.name} @${String(width).padStart(4)} `);
        for (const route of v.routes) {
          await page.goto(`http://localhost:${PORT}${base}${route}`, { waitUntil: 'domcontentloaded' });
          /* THE SAME READINESS, or the variant pass is the half of this gate that can still go green
             over nothing. The site is prerendered and says so in `VARIANTS`. */
          const unmeasured = ready.check(`${v.name}${route} @${width}`, route, await ready.settled(page, v.prerendered));
          if (unmeasured) {
            findings.push(unmeasured);
            process.stdout.write('!');
            continue;
          }
          /* THE SAME PREPARATION, or "the identical check" is only true of the function. An un-laid-out
             rowgroup has no geometry and cannot overflow; the seed is what makes this pass answerable by
             `self-test`, which otherwise passes on the main loop alone however little the variant pass
             measures. */
          await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
          if (process.env.BRAINDOG_GATE_SEED)
            await page.evaluate(() => {
              const h = document.createElement('h2');
              h.textContent = 'seeded';
              h.style.cssText = 'width:2000px;white-space:nowrap';
              document.getElementById('main')?.prepend(h);
            });
          await page.waitForTimeout(L.settleMs);
          const out = await page.evaluate(MEASURE, [width, L.widthTolerancePx, width < 640]);
          checked++;
          process.stdout.write(out.length ? '!' : '.');
          for (const o of out) findings.push(`${v.name}${route} @${width}  ${o}`);
        }
        process.stdout.write('\n');
        await context.close();
      }
    }
    serving = ROOT;
    asking = null;

    console.log(
      `  layout: ${checked} page-runs over ${widths.length} widths ` +
        `(${bps.join(', ')} + floor), ${findings.length} finding(s)`,
    );

    for (const f of findings.slice(0, L.findingsShown)) console.error(`      ${f}`);
    if (findings.length > L.findingsShown) console.error(`      ...and ${findings.length - L.findingsShown} more`);

    /**
     * AND A SWEEP THAT NEVER SAW THE RECORD IS RED, however clean every page in it was.
     *
     * This is the one thing the per-page check cannot say. A host answering nothing draws the error card
     * on every route and a record with nothing in it draws the empty one, and both of those sweep to
     * `0 finding(s)`: an `Empty` card is `max-inline-size: 56ch` and cannot overflow at any width. The
     * gate exists to measure a table, a card list and a row, so a run that measured none of them is a
     * run that asserted nothing about the thing it is for.
     */
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

/* AND IT IS STILL A SCRIPT, because `self-test` spawns this file with `BRAINDOG_GATE_SEED=1` and the
   header documents `node tools/gates/layout.mjs`. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await layout()) ?? 0;
