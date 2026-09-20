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
 * It serves `build/` itself for the same reason the screenshot script does, and reports and exits 0
 * when there is no build, so `pnpm gates` stays useful on a fresh checkout.
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

import { budget, readiness } from './lib.mjs';
import { answers, forward, forwards, recordFor, startRecord } from './record.mjs';
import { routesOf } from './routes.mjs';

const REPO = join(import.meta.dirname, '..', '..');

/**
 * AND WHY THIS GATE DECLARES NO `needs`, WHICH IS THE QUESTION A READER OF `layout.mjs` ARRIVES
 * WITH. `52 §5.1` step 2 lets a gate name a prerequisite the runner checks, and `layout` names
 * `web-build` because it exits 3 on `apps/web/build` alone. This gate does not: `APPS` below holds
 * two builds, each skipped by name on its own, and a tree with the marketing site built and the
 * record app not still gets a real contrast audit of the shop window. A declaration of `web-build`
 * here would be the runner refusing a run that had something to measure, which is a worse failure
 * than the one step 2 exists to fix, because it is silent in the direction of measuring less.
 */

/**
 * BOTH APPS. The record app is where the interesting failures are, but the marketing site is the
 * first page anybody ever sees and the only one they meet before deciding whether to trust the
 * rest. A contrast failure there is a contrast failure in the shop window. It is prerendered
 * rather than a shell, so it needs no fallback and has no states to drive.
 */
const APPS = [
  { name: 'web', root: join(REPO, 'apps', 'web', 'build'), routes: null, spa: true, states: true },
  /**
   * THE OTHER RECORD, for the half of every host branch the shipped seed cannot draw.
   *
   * `BRAINDOG_VARIANT=cloud` writes `build-cloud/`, and only the two routes that branch are worth
   * running: the point is that the Cloud side is drawn at all and passes the same rules, not a second
   * sweep of a build that differs by one constant. Skipped with a line when it is not built, because
   * "we did not check this" must not look like "there was nothing here".
   */
  /* `states` IS NOT `spa`, AND THEY WERE ONE FLAG. `spa` says *serve the shell for a route with no
     file*, which every variant needs; running the thirteen state scenarios is a different question,
     and every variant answered yes to it because the two facts shared a boolean.

     ALL THIRTEEN SCENARIOS STAND ON `/r/obligations`, `/`, `/p/kiln` AND `/r/nope`, routes no
     variant changes. A variant differs in `DEPLOYMENT`, `DEVICES`, `TOKENS` and `DECIDED`, which is
     why each one names the two or three routes where that shows. So the three variants contributed
     **156 audits of 156 identical pages**: 13 scenarios x 4 passes x 3 variants, 44% of this
     gate's run, spent proving that opening the palette on a record with no machines connected draws
     the same palette.

     A variant earns `states: true` the day a scenario lands on a route it changes. */
  { name: 'cloud', root: join(REPO, 'apps', 'web', 'build-cloud'), routes: ['/settings/backups', '/settings/billing'], spa: true, optional: true },
  { name: 'quiet', root: join(REPO, 'apps', 'web', 'build-quiet'), routes: ['/settings/agents'], spa: true, optional: true },
  { name: 'busy', root: join(REPO, 'apps', 'web', 'build-busy'), routes: ['/search?q=renewal', '/decide'], spa: true, optional: true },
  { name: 'site', root: join(REPO, 'apps', 'site', 'build'), routes: ['/', '/pricing', '/changelog'], spa: false },
];
const AXE = join(REPO, 'node_modules', 'axe-core', 'axe.min.js');
const A = budget('a11y');
const PORT = A.port;

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

/* Every surface at rest. */
/**
 * Every route the app has, derived from the tree, plus a few extra addresses of the same routes.
 *
 * IT WAS TYPED OUT, AND THE TWO GATES DISAGREED. `a11y` was missing `/s/[token]` (the shared page,
 * the only surface a non-user ever sees), and neither list was compared to the route directory, so
 * a route added tomorrow was audited by neither and nothing noticed. The derivation also found
 * `/[id]`, the spoken-id resolver, which neither list had ever covered.
 *
 * THE EXTRAS ARE SECOND ADDRESSES OF ROUTES ALREADY IN THE LIST (a different page, a different
 * track), because one sample proves the route renders and a second proves the DECLARATION does.
 */
const { routes: ROUTES, unsampled } = await routesOf(join(REPO, 'apps', 'web'), ['/p/kiln', '/t/3', '/nowhere']);
if (unsampled.length) {
  for (const u of unsampled) console.error(`  a route with no sample address: ${u}`);
  process.exit(1);
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

/* THE RECORD THE REGISTER LIST READS, forwarded to from this gate's own port. See `record.mjs`. */
const record = await startRecord();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (forwards(url.pathname)) return forward(req, res, record.base);
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

     A ROUTE SEGMENT MAY CONTAIN A DOT. `/v/obligations.overdue` is a view id, not a file, so the
     test cannot be "has an extension". That 404s a real page and blames the app for having no
     `lang`. It is "has an extension WE SERVE": anything in `TYPES` that is missing stays a 404, so
     a genuinely broken asset still fails loudly, and everything else gets the shell. Worth knowing
     when this is deployed, because an SPA fallback that excludes dotted paths (several hosts
     default to exactly that) would 404 every view in production. */
  const shell = join(current.root, 'index.html');
  const asset = Object.hasOwn(TYPES, extname(rel));
  if (current.spa && !asset && (await stat(shell).catch(() => null))?.isFile()) {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return createReadStream(shell).pipe(res);
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(PORT, r));
await answers(`http://localhost:${PORT}`);

const browser = await chromium.launch();
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

for (const app of APPS) {
  if (!(await stat(app.root).catch(() => null))) {
    /* NOT A PASS. Skipping one app silently dropped the marketing site from every run that did not
       build it, and the gate still printed its own green line.

       AN `optional` APP IS A VARIANT RECORD, not a missing build. It is written only when somebody
       asks for it, so its absence is a smaller sentence and not a skip that shows up beside the
       marketing site's. It still says what was not measured. */
    console.log(
      app.optional
        ? `  a11y: no ${app.name} record built. \`pnpm --filter @braindog/web build\` draws the other half of every host branch.`
        : `  a11y: no ${app.name} build to check. \`pnpm build\` first, and CI does.`,
    );
    if (!app.optional) skipped.push(app.name);
    continue;
  }
  current = app;

/**
 * A SEEDED RUN IS A NEGATIVE, AND A NEGATIVE NEEDS ONE PAGE. The same argument as `layout.mjs`'s:
 * `self-test` runs this gate again with `BRAINDOG_GATE_SEED=intent` to prove it goes red on an
 * intent with no glyph, and it was proving that over 356 page-runs. The seeded anchor is prepended
 * to every page, so one scheme at one width says it. Only when the seed is set.
 */
const SEEDED = Boolean(process.env.BRAINDOG_GATE_SEED);

for (const scheme of SEEDED ? ['dark'] : ['dark', 'light']) {
  for (const width of SEEDED ? A.widths.slice(0, 1) : A.widths) {
    const context = await browser.newContext({
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
      await recordFor(page, route);
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
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
      process.stdout.write(result.violations.length || unnamed.length ? '!' : '.');
      for (const v of result.violations) {
        const entry = found.get(v.id) ?? { help: v.help, impact: v.impact, nodes: new Set() };
        for (const n of v.nodes) entry.nodes.add(`${app.name}${where.startsWith('/') ? '' : ' '}${where} ${scheme}@${width}  ${n.target.join(' ')}`);
        found.set(v.id, entry);
      }
    };

    process.stdout.write(`    ${(app.name + '     ').slice(0, 5)} ${(scheme + '@' + width + '   ').slice(0, 11)} `);
    for (const route of app.routes ?? ROUTES) {
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

    /* States are the record app's. The site is three prerendered pages with nothing to drive, and a
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
         admitting it. Nine scenarios times four passes times thirty seconds is the difference
         between a gate that runs and a gate nobody waits for. */
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

await browser.close();
server.close();
await record.close();

const CONTRAST = 'color-contrast';
const contrast = found.get(CONTRAST);
found.delete(CONTRAST);

console.log(
  `  a11y: ${checked} page-runs, ${found.size + (contrast ? 1 : 0) + (mute.size ? 1 : 0)} rule(s) with findings`,
);

if (mute.size) {
  console.error(`
  intent-without-glyph (serious): colour never carries meaning alone (13 §5.1)`);
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
  console.error(`
  ${broken.length} scenario(s) never reached their state:`);
  for (const b of broken) console.error(`      ${b}`);
}

/* A PAGE THAT COULD NOT BE AUDITED IS A FINDING, and it is in the first condition rather than the
   second on purpose: a route that never settles must not fall through to the exit-3 branch, because
   exit 3 is a skip and CI runs master with no `--allow-skip`. Every exit-3 path in this gate is still
   a `stat()` on a build directory, decided before a browser is launched, which is what keeps a real
   failure from turning into one. */
if (unsettled.length) {
  console.error(`
  ${unsettled.length} page(s) were never in a state to audit:`);
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

if (found.size || contrast || broken.length || mute.size || unsettled.length || blind) process.exitCode = 1;
/* AND A RUN THAT LOOKED AT NOTHING IS A SKIP: exit 3, not the green line it used to print. */
else if (skipped.length) {
  console.log(`  a11y: skipped ${skipped.join(', ')}. No build.`);
  process.exitCode = 3;
}
