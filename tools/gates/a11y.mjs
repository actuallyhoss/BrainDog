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

const ROOT = join(import.meta.dirname, '..', '..', 'apps', 'web', 'build');
const AXE = join(import.meta.dirname, '..', '..', 'node_modules', 'axe-core', 'axe.min.js');
const PORT = 5186;

/* Every surface, plus the two that only exist in a state: a grid with a selection, and a sheet
   open over it. A dialog that traps focus badly is a dialog nothing else in this file would reach. */
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
  '/v/obligations.overdue',
  '/nowhere',
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

if (!(await stat(ROOT).catch(() => null))) {
  console.log('  a11y: no build to check. `pnpm build` first, and CI does.');
  process.exit(0);
}

const axeSource = await readFile(AXE, 'utf8');

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return res.writeHead(400).end();
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = join(ROOT, candidate);
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
  const shell = join(ROOT, 'index.html');
  const asset = Object.hasOwn(TYPES, extname(rel));
  if (!asset && (await stat(shell).catch(() => null))?.isFile()) {
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
    process.stdout.write(`    ${scheme}@${width} `);

    for (const route of ROUTES) {
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#main *', { timeout: 5000 }).catch(() => {});
      // The same reason the screenshots do it: an un-laid-out rowgroup has no colours to measure.
      await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
      await page.addScriptTag({ content: axeSource });

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
        for (const n of v.nodes) entry.nodes.add(`${route} ${scheme}@${width}  ${n.target.join(' ')}`);
        found.set(v.id, entry);
      }
    }
    process.stdout.write('\n');
    await context.close();
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

if (found.size || contrast) process.exitCode = 1;
