/**
 * A preference that changes nothing is a control that lies.
 *
 *   node tools/gates/prefs.mjs
 *
 * `25 §1` names this class of defect and calls it a bug rather than a gap: "Exactly the same class
 * of defect as the `series` chart that was advertised with no way to feed it: **a capability that
 * exists as a table row.**" `27 §3` puts it in a list titled "Four findings that were bugs, not
 * gaps", because "each was a statement the corpus already made and could not honour". `23 §3.1` is
 * the same rule from the other side: *"a row that cannot run is not there"*.
 *
 * IT WAS FOUND BY AN AUDIT, NOT BY A GATE, AND THAT IS THE POINT. Settings → Text size set
 * `data-text` on `<html>`, lit its own segment and wrote the cookie, while every UI surface sized
 * from a token pinned to a constant. Full-page screenshots at Small, Normal and Large were
 * byte-identical on six routes at two widths; 0 of 182 elements moved on Home. It shipped that way
 * because the 128-configuration matrix (`50 §9`) is 8 fixtures x 4 widths x 2 schemes x 2
 * directions — `data-text` is not an axis of it, and neither is any other preference but `scheme`.
 *
 * SO THIS GATE ASKS ONE QUESTION OF EACH: set it, and does the page come back different? Not "is it
 * the right difference" — a gate cannot judge that — but "is there one at all", which is the
 * question that was never asked. Each check names the token or attribute it measures, so a red line
 * says which preference stopped reaching the DOM rather than that something is wrong.
 *
 * WHAT IT DOES NOT COVER, AND THE LIST HAD DRIFTED FROM THE TYPE IT GUARDS. It used to name `keys`,
 * `columns`, `previewDismissed` and `suggestPages` — and `Pref` has never had `previewDismissed` or
 * `suggestPages`, while four real fields went unmentioned. The file written to catch an excuse that
 * outlives its reason had grown one of its own.
 *
 * `Pref` holds eleven: `scheme`, `text`, `density`, `theme`, `sidebar`, `chars`, `suggestPages`,
 * `seen`, `columns`, `nav`, `defined`. This covers six — `text`, `density`, `scheme`, `sidebar`,
 * `nav` and `suggestPages` — which is everything a page LOAD can settle. `suggestPages` joined the
 * type after this file had spent a paragraph excusing itself from covering a field the type did not
 * have; it is covered now, on the load, because turning it off empties a list. The other five each
 * need something a fixture cannot do by loading a URL:
 *
 *   - `theme`   an accent is chosen by pressing a swatch, and the difference is a palette rather
 *               than one token. **A duplicate swatch that repainted nothing lived here for months**
 *               precisely because this gate could not reach it; `theme.test.ts` asserts the
 *               invariant instead — no suggestion is the house colour.
 *   - `chars`   needs a keystroke, and `keys` (the gate next door) is the one that presses keys.
 *   - `seen`    needs a click on Home's *Mark all read*, and its effect is an absence.
 *   - `columns` needs the Display sheet opened and a column unticked.
 *   - `defined` is spent once per device and cannot be re-read.
 *
 * A check that pretended to cover any of them would be the thing this file exists to catch.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from '@playwright/test';

import { budget, readiness } from './lib.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const ROOT = join(REPO, 'apps', 'web', 'build');
const PORT = budget('prefs').port;

/**
 * WHEN A PROBE IS ALLOWED TO BE BELIEVED, and for this gate that is a question about false REDS.
 *
 * Four of the seven cases read the record: `text` measures a grid cell, `suggestPages` counts
 * `#main .ledger li`, `nav` joins the rail's hrefs. Over a screen that has not drawn, all three
 * settings come back `no element`, `0` and `''`, the values are identical, and this gate prints
 * exactly the sentence it is named for: a preference that reached the cookie and not the page. The
 * repair somebody reaches for under time pressure is to weaken the probe, and a weakened probe is
 * permanently vacuous. So an unsettled or refused load is reported as what it is, and its case is not
 * compared at all.
 */
const ready = readiness('prefs', budget('ready').settleTimeoutMs, ROOT);

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
  console.log('  prefs: no build to check. `pnpm build` first, and CI does.');
  process.exit(3);
}

/**
 * What to set, where to look, and what has to differ.
 *
 * `probe` runs in the page and returns a string. Two settings whose probes come back equal is the
 * finding: the preference reached the cookie and not the DOM.
 */
const CASES = [
  {
    name: 'text',
    what: 'the body step (13 §7)',
    route: '/r/obligations',
    /* `50 §4.7`: `text: 'sm' | 'base' | 'md'`, applied before first paint. `13 §7`: it "picks the
       body step" — so the chrome moves and the fixed steps around it do not. */
    values: [{ text: 'sm' }, { text: 'base' }, { text: 'md' }],
    probe: () => {
      const el = document.querySelector('.line-title, .td, .rail a[data-nav]');
      return el ? getComputedStyle(el).fontSize : 'no element';
    },
  },
  {
    name: 'density',
    what: 'the row height (13 §4.2)',
    route: '/r/obligations',
    values: [{ density: 'compact' }, { density: 'comfortable' }, { density: 'roomy' }],
    probe: () => getComputedStyle(document.documentElement).getPropertyValue('--row-h').trim(),
  },
  {
    name: 'scheme',
    what: 'the ground colour',
    route: '/',
    values: [{ scheme: 'light' }, { scheme: 'dark' }],
    probe: () => getComputedStyle(document.body).backgroundColor,
  },
  {
    /**
     * `contrast` — the second palette, which shipped and had no control at all.
     *
     * `packages/theme` solves it against a higher floor, `theme.mjs` writes it into `house.css`
     * behind `html[data-theme='hc']`, and `--check` byte-compares it on every build. Nothing in the
     * app ever set that attribute, so sixteen checks' worth of generated work was unreachable by
     * the reader it exists for, and no gate could say so: this list is hand-written, so a
     * preference nobody adds a case for is a preference nobody measures.
     *
     * THE INK AND NOT THE GROUND. The high-contrast grounds are close to the ordinary ones by
     * design, because what a contrast palette moves is the DISTANCE between a surface and what sits
     * on it. Probing `background-color` would compare `#F8F9EE` against `#F3F3E9` and call a five
     * per cent difference a pass; the ink moves from `#26261F` to `#181812`, which is the thing the
     * palette is for.
     */
    name: 'contrast',
    what: 'the ink against the ground (28 §4)',
    route: '/',
    values: [{}, { contrast: true }],
    probe: () => getComputedStyle(document.body).color,
  },
  {
    name: 'sidebar',
    what: 'whether the rail is drawn',
    route: '/',
    /* `undefined` is open, which is what a first visit should be — so the two values are "unset"
       and `false` rather than `true` and `false`. */
    values: [{}, { sidebar: false }],
    /* THE RENDERED WIDTH, not the link count. Folding hides the rail with CSS, so its anchors are
       still in the DOM and still queryable — a probe that counts them reports "no change" about a
       control that works, which is the same lie in the other direction. */
    probe: () => String(Math.round(document.querySelector('.rail-slot, nav.rail')?.getBoundingClientRect().width ?? -1)),
  },
  {
    /**
     * `suggestPages` — `29 §4`'s one global switch, and the list it empties.
     *
     * A page LOAD settles it, which is what makes it gateable at all: off draws a `cleared` empty
     * state where on draws the holding pen, so the count in the section heading is the measurement.
     * `19 §2` says this switch is the reason the `navigation` area exists, and the area shipped
     * without it — the third control in this product found to move a tick and write nothing.
     */
    name: 'suggestPages',
    route: '/settings/navigation',
    values: [{}, { suggestPages: false }],
    probe: () => String(document.querySelectorAll('#main .ledger li').length),
  },
  {
    name: 'nav',
    what: 'the order of the rail (19 §3: position lives in a per-user store and wins)',
    route: '/',
    /* THE ONE THAT WAS WRITTEN, SURVIVED A RELOAD, AND MOVED NOTHING. The rail rendered the raw
       list while the arrangement lived in a value read only by the two move functions. */
    /* WITHIN ONE SECTION, because that is the only move the product offers: `29 §4` places a page
       "at the end of its section, never inserted mid-list", and the menu is up / down / to top /
       hide. Three pages from three different sections would reorder three buckets of one, which
       changes nothing and would fail this gate for being a bad test rather than a bad build. */
    values: [{}, { nav: ['/p/portage', '/p/kiln', '/p/marlow-co'] }],
    probe: () => [...document.querySelectorAll('nav.rail a[data-nav]')].map((a) => a.getAttribute('href')).join(' '),
  },
];

const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).slice(1);
  if (rel.includes('..')) return res.writeHead(400).end();
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = join(ROOT, candidate);
    if ((await stat(file).catch(() => null))?.isFile()) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      return createReadStream(file).pipe(res);
    }
  }
  if (!Object.hasOwn(TYPES, extname(rel))) {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return createReadStream(join(ROOT, 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const findings = [];
/** Loads that never drew, kept apart from the findings so neither sentence is read as the other. */
const unsettled = [];
let checked = 0;

for (const test of CASES) {
  const seen = new Map();
  /* A CASE IS COMPARED ONLY IF EVERY LOAD IN IT WAS REAL. Two probes of two screens, one of which
     was never there, is not a comparison of a preference. */
  let comparable = true;
  for (const value of test.values) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    /* THE COOKIE, NOT A CLICK. `50 §4.7` has the shell read `bd_pref` in a one-statement inline
       script before first paint, so setting it is exactly what the product does — and it keeps this
       gate about whether the preference REACHES the DOM rather than about the control that sets it,
       which the a11y and layout gates already drive. */
    await context.addCookies([
      { name: 'bd_pref', value: encodeURIComponent(JSON.stringify(value)), url: `http://localhost:${PORT}` },
    ]);
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}${test.route}`, { waitUntil: 'networkidle' });
    const unmeasured = ready.check(`${test.name} ${JSON.stringify(value)}`, test.route, await ready.settled(page));
    if (unmeasured) {
      unsettled.push(unmeasured);
      comparable = false;
      process.stdout.write('~');
      await context.close();
      continue;
    }
    /* THE GATE'S OWN PROOF THAT IT LOOKS AT ANYTHING. `BRAINDOG_GATE_SEED=prefs` pins the two
       tokens the checks read, which is exactly the shape of the bug this gate is named after — a
       preference reaching the cookie and a constant reaching the page — and the run must go red. */
    if (process.env.BRAINDOG_GATE_SEED === 'prefs')
      await page.addStyleTag({ content: ':root{--row-h:34px !important}html{--t-ui:15px !important}' });
    await page.waitForTimeout(120);
    seen.set(JSON.stringify(value), await page.evaluate(test.probe));
    await context.close();
    checked++;
    process.stdout.write('.');
  }

  if (!comparable) continue;

  /* EVERY VALUE DISTINCT, not merely "some pair differs". Three settings where two agree is a
     control with a step that does nothing, which is the same defect one notch smaller. */
  const answers = [...seen.entries()];
  const distinct = new Set(answers.map(([, v]) => v));
  if (distinct.size < answers.length) {
    findings.push(
      `${test.name}: ${answers.length} values, ${distinct.size} distinct — ${test.what}\n` +
        answers.map(([k, v]) => `        ${k} -> ${v}`).join('\n'),
    );
    process.stdout.write('!');
  }
}

process.stdout.write('\n');
await browser.close();
server.close();

console.log(
  `  prefs: ${checked} page-runs over ${CASES.length} preferences, ${findings.length} finding(s)` +
    (unsettled.length ? `, ${unsettled.length} load(s) on a page that never drew` : ''),
);

if (findings.length) {
  console.error('\n  a preference that reaches the cookie and not the page:');
  for (const f of findings) console.error(`      ${f}`);
}

/* NOT UNDER THE HEADING ABOVE. "A preference that reaches the cookie and not the page" is a claim
   about the app, and a page that never drew is a claim about the load: printing the second under the
   first is how somebody ends up editing a probe to silence a host that was not answering. */
if (unsettled.length) {
  console.error('\n  a preference whose screen was never there to measure:');
  for (const u of unsettled) console.error(`      ${u}`);
}

/**
 * AND A RUN WHERE NO SCREEN DREW IS RED even when every case came back distinct.
 *
 * Three of the seven cases read tokens off `documentElement` and `body`, which `app.html` sets from
 * the cookie before first paint and which are true of an empty document as well as a full one. Those
 * three would pass over a product that drew nothing at all, so the aggregate is what keeps a clean
 * `prefs` run from meaning less than it says.
 */
const blind = ready.nothingDrawn();
if (blind) console.error(`\n  ${blind}`);

if (findings.length || unsettled.length || blind) process.exitCode = 1;
