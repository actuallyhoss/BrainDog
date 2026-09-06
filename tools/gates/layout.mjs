/**
 * The layout gate: nothing may stick out sideways, at any width the CSS itself cares about.
 *
 *   node tools/gates/layout.mjs
 *
 * A HORIZONTAL SCROLLBAR IS THE MOST VISIBLE BUG A RESPONSIVE LAYOUT CAN HAVE and one of the least
 * likely to be caught in development, because it appears at widths nobody has open. One missing
 * `min-inline-size` on one grid child is all it takes, and the symptom — the whole page sliding
 * under the thumb — reads to a person as the app being broken rather than as a stylesheet being
 * four pixels out.
 *
 * IT TESTS BOTH SIDES OF EVERY BREAKPOINT, and that is the idea in this file. The widths are not a
 * taste list of devices; they are read out of the stylesheets, so a `@media (width < 900px)` is
 * checked at 899 AND at 900. That pair is where responsive bugs actually live: at 899 the rail is
 * gone and the tab bar is up, at 900 the rail is back and has to fit — and the width at which a
 * layout changes its mind is the width nobody drags their window to. A breakpoint added tomorrow
 * gets tested tomorrow without anybody editing this file.
 *
 * A floor of real sizes goes on top, because the narrowest phone still in use is narrower than any
 * breakpoint anyone writes.
 *
 * WHAT COUNTS AS AN OVERFLOW is deliberately narrow, or a gate cries wolf and gets deleted. A table
 * wider than the viewport is CORRECT — it lives in `.table-region`, which scrolls, which is the
 * whole design. So an element is a finding only if nothing above it scrolls or clips. The document
 * scrolling sideways is a finding always, with no exceptions.
 */

import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from '@playwright/test';

import { budget } from './lib.mjs';
import { routesOf } from './routes.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const ROOT = join(REPO, 'apps', 'web', 'build');
const L = budget('layout');
const PORT = L.port;

/**
 * Every route the app has, derived from the tree, plus a few extra addresses of the same routes.
 *
 * IT WAS TYPED OUT, AND THE TWO GATES DISAGREED. `a11y` was missing `/s/[token]` — the shared page,
 * the only surface a non-user ever sees — and neither list was compared to the route directory, so a
 * route added tomorrow was audited by neither and nothing noticed. The derivation also found
 * `/[id]`, the spoken-id resolver, which neither list had ever covered.
 *
 * THE EXTRAS ARE SECOND ADDRESSES OF ROUTES ALREADY IN THE LIST — a different page, a different
 * track — because one sample proves the route renders and a second proves the DECLARATION does.
 */
const { routes: ROUTES, unsampled } = await routesOf(join(REPO, 'apps', 'web'), ['/p/estate', '/p/work', '/p/kiln', '/t/3', '/nowhere']);
if (unsampled.length) {
  for (const u of unsampled) console.error(`  a route with no sample address: ${u}`);
  process.exit(1);
}

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
    if (e.name === 'node_modules' || e.name === '.svelte-kit' || e.name === 'build') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (/\.(css|svelte)$/.test(e.name)) yield p;
  }
}

/** The pixel widths inside `@media` conditions, in every syntax this repo uses. */
async function breakpoints() {
  const found = new Set();
  for (const dir of [join(REPO, 'apps', 'web', 'src'), join(REPO, 'packages', 'skin')]) {
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
  /* EXIT 3 IS A SKIP, NOT A PASS — see the note in `bundle.mjs`. */
  console.log('  layout: no build to check. `pnpm build` first, and CI does.');
  process.exit(3);
}

const bps = (await breakpoints()).sort((a, b) => a - b);
/* One pixel either side of each. `width < 900px` is on at 899 and off at 900, and those are two
   different layouts that both have to hold. */
const widths = [...new Set([...FLOOR, ...bps.flatMap((b) => [b - 1, b])])].sort((a, b) => a - b);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const rel = decodeURIComponent(url.pathname).slice(1);
  if (rel.includes('..')) return res.writeHead(400).end();
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = join(ROOT, candidate);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) continue;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    return createReadStream(file).pipe(res);
  }
  // The same SPA fallback the app is deployed behind, keyed on extensions we actually serve.
  if (!Object.hasOwn(TYPES, extname(rel))) {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return createReadStream(join(ROOT, 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const findings = [];
let checked = 0;

for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: L.viewportHeightPx },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  process.stdout.write(`    ${String(width).padStart(4)}px `);

  for (const route of ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#main *', { timeout: L.readyTimeoutMs }).catch(() => {});
    // An un-laid-out rowgroup has no geometry: it cannot overflow, and it cannot be measured.
    await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
    /* THE GATE'S OWN PROOF THAT IT LOOKS AT ANYTHING. With `BRAINDOG_GATE_SEED=1` a 2000px heading
       is put into `#main` — the exact bug this gate is named after — and the run must go red. It is
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

    const out = await page.evaluate(([w, slack]) => {
      const hits = [];
      if (document.documentElement.scrollWidth > w + slack) {
        hits.push(`the DOCUMENT scrolls sideways (${document.documentElement.scrollWidth}px)`);
      }
      /* A table wider than the page is the design. A heading wider than the page is a bug. The
         difference is whether anything above it scrolls or clips. */
      const contained = (el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
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
      return [...new Set(hits)].slice(0, 4);
    }, [width, L.widthTolerancePx]);

    checked++;
    process.stdout.write(out.length ? '!' : '.');
    for (const o of out) findings.push(`${route} @${width}  ${o}`);
  }
  process.stdout.write('\n');
  await context.close();
}

await browser.close();
server.close();

console.log(
  `  layout: ${checked} page-runs over ${widths.length} widths ` +
    `(${bps.join(', ')} + floor), ${findings.length} finding(s)`,
);

for (const f of findings.slice(0, L.findingsShown)) console.error(`      ${f}`);
if (findings.length > L.findingsShown) console.error(`      ...and ${findings.length - L.findingsShown} more`);
if (findings.length) process.exitCode = 1;
