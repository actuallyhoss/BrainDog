/**
 * The accessibility gate: axe-core over every route, in both schemes, at two widths.
 *
 *   node tools/gates/a11y.mjs
 *
 * WHY A GATE AND NOT A CHECKLIST. Every rule in here is one a machine can decide — a control with
 * no name, a heading level skipped, an `aria-*` that names nothing, contrast below the floor. Those
 * are exactly the failures that arrive by accident during a redesign and survive review, because
 * nothing about them looks wrong in a screenshot. The judgement calls axe cannot make (is the
 * reading order sensible, does the keyboard path make sense, is the copy comprehensible) stay with
 * a person, and this gate does not pretend otherwise: passing it is the floor, not the ceiling.
 *
 * BOTH SCHEMES, because contrast is the most common failure and half of it is invisible in the
 * scheme you happen to be developing in. Two widths, because the phone layout swaps the table for
 * cards and the rail for a tab bar — different markup, different names, different failures.
 *
 * It serves `build/` itself for the same reason the screenshot script does, and reports and exits 0
 * when there is no build, so `pnpm gates` stays useful on a fresh checkout.
 *
 * `color-contrast` is included but reported separately. The theme's own proof already guarantees
 * the token PAIRS clear their floors; what axe adds is the composition — a token used against a
 * surface it was never solved for. That is a real class of bug and worth catching, but a false
 * positive on it means the theme is right and one call site is wrong, which reads differently from
 * a missing button name.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

const REPO = join(import.meta.dirname, '..', '..');

/**
 * BOTH APPS. The record app is where the interesting failures are, but the marketing site is the
 * first page anybody ever sees and the only one they meet before deciding whether to trust the
 * rest — a contrast failure there is a contrast failure in the shop window. It is prerendered
 * rather than a shell, so it needs no fallback and has no states to drive.
 */
const APPS = [
  { name: 'web', root: join(REPO, 'apps', 'web', 'build'), routes: null, spa: true },
  { name: 'site', root: join(REPO, 'apps', 'site', 'build'), routes: ['/', '/pricing', '/changelog'], spa: false },
];
const AXE = join(REPO, 'node_modules', 'axe-core', 'axe.min.js');
const PORT = 5186;

/* Every surface at rest. */
const ROUTES = [
  '/',
  '/decide',
  '/decide/SG31',
  '/inbox',
  '/r/obligations',
  '/r/obligations/1',
  '/p/money',
  '/p/kiln',
  '/vault',
  '/packs',
  '/settings/appearance',
  '/start',
  '/audit',
  '/search?q=invoice',
  '/jobs/j_7Q2F',
  '/t/2',
  '/t/3',
  '/v/obligations.overdue',
  '/nowhere',
];

/**
 * The states a route can only be IN, which is where the accessibility bugs actually live.
 *
 * Everything above is a page at rest, and a page at rest is the easy case. A dialog that never
 * moves focus into itself, a menu with no accessible name, a toggle whose `aria-pressed` never
 * flips, a selection count nothing announces — none of those exist until somebody presses a key,
 * and none of them are reachable by a crawler that only visits URLs.
 *
 * Each one names the keys to press and what should exist afterwards. The `expect` is not
 * decoration: if a keystroke silently stops working, the scenario would otherwise still "pass" by
 * auditing the page underneath it, and the gate would go green over a dialog that no longer opens.
 */
const STATES = [
  { name: 'grid: filter sheet', route: '/r/obligations', keys: ['f'], expect: 'dialog[open]' },
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
  /* Arranging has no key — it is a button, and only on desktop. 13 §10 keeps authoring off phones,
     and `.arrange-slot` is display:none below 900px rather than a control that exists and refuses. */
  { name: 'page: arrange mode', route: '/p/kiln', click: '.arrange-slot button', expect: '[role="listitem"]', desktop: true },
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
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
     document fails `html-has-lang`, `landmark-one-main` and `page-has-heading-one` — sixty-four
     findings that say nothing about the app. Serve what production serves.

     A ROUTE SEGMENT MAY CONTAIN A DOT. `/v/obligations.overdue` is a view id, not a file, so the
     test cannot be "has an extension" — that 404s a real page and blames the app for having no
     `lang`. It is "has an extension WE SERVE": anything in `TYPES` that is missing stays a 404, so
     a genuinely broken asset still fails loudly, and everything else gets the shell. Worth knowing
     when this is deployed, because an SPA fallback that excludes dotted paths — several hosts
     default to exactly that — would 404 every view in production. */
  const shell = join(current.root, 'index.html');
  const asset = Object.hasOwn(TYPES, extname(rel));
  if (current.spa && !asset && (await stat(shell).catch(() => null))?.isFile()) {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return createReadStream(shell).pipe(res);
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
/** `id -> { help, nodes: Set<'route scheme@width  target'> }`, so one bug is one line however often it repeats. */
const found = new Map();
let checked = 0;
/** Scenarios whose keystroke did not produce the state it names — a silently dead key. */
const broken = [];

for (const app of APPS) {
  if (!(await stat(app.root).catch(() => null))) {
    console.log(`  a11y: no ${app.name} build to check. \`pnpm build\` first, and CI does.`);
    continue;
  }
  current = app;

for (const scheme of ['dark', 'light']) {
  for (const width of [1440, 390]) {
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


    /** Loads a route, waits for it to be real, and injects axe. */
    const open = async (route) => {
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#main *', { timeout: 5000 }).catch(() => {});
      // The same reason the screenshots do it: an un-laid-out rowgroup has no colours to measure.
      await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
      await page.addScriptTag({ content: axeSource });
    };

    const audit = async (where) => {
      const result = await page.evaluate(async () => {
        // @ts-expect-error injected
        return await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
          resultTypes: ['violations'],
        });
      });
      checked++;
      process.stdout.write(result.violations.length ? '!' : '.');
      for (const v of result.violations) {
        const entry = found.get(v.id) ?? { help: v.help, impact: v.impact, nodes: new Set() };
        for (const n of v.nodes) entry.nodes.add(`${app.name}${where.startsWith('/') ? '' : ' '}${where} ${scheme}@${width}  ${n.target.join(' ')}`);
        found.set(v.id, entry);
      }
    };

    process.stdout.write(`    ${(app.name + '     ').slice(0, 5)} ${(scheme + '@' + width + '   ').slice(0, 11)} `);
    for (const route of app.routes ?? ROUTES) {
      await open(route);
      await audit(route);
    }

    /* States are the record app's. The site is three prerendered pages with nothing to drive. */
    if (!app.spa) {
      process.stdout.write('\n');
      await context.close();
      continue;
    }

    process.stdout.write(' ');
    for (const st of STATES) {
      if (st.desktop && width < 900) continue;
      await open(st.route);
      // Focus the grid first: bare letters act only inside one, which is the point of the rule.
      /* SHORT timeouts, and they matter. Both of these clicks are speculative — a page surface has
         no `[role="row"]` at all — and Playwright's default is to wait thirty seconds before
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

const CONTRAST = 'color-contrast';
const contrast = found.get(CONTRAST);
found.delete(CONTRAST);

console.log(`  a11y: ${checked} page-runs, ${found.size + (contrast ? 1 : 0)} rule(s) with findings`);

const show = (id, e) => {
  console.error(`\n  ${id} (${e.impact}) — ${e.help}`);
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

if (found.size || contrast || broken.length) process.exitCode = 1;
