/**
 * The five product screenshots on brain.dog, regenerated from the record app's own build.
 *
 *   node scripts/product.mjs        # writes static/shots/<name>-<scheme>.png
 *
 * THESE ARE SHIPPED ASSETS, not review artefacts — `scripts/shot.mjs` beside this one photographs
 * the SITE for a person to look at, and those go to `shots/`. These go to `static/shots/` and get
 * served to the public, which is why they need a script at all: they were made by hand once, and a
 * hand-made screenshot of a product that is still changing is a marketing page that quietly starts
 * lying. Every palette change, every contrast fix, every renamed control leaves them a little more
 * wrong and nothing says so.
 *
 * It serves `apps/web/build` for the same reason the other two scripts serve their own build, and
 * with the same SPA fallback: the record app ships one `index.html` and lets the router decide.
 *
 * VIEWPORT, NOT FULL PAGE. `Shot.svelte` declares `width="2880" height="1800"` so the page reserves
 * the box before the image arrives and never reflows the sentence somebody is reading. A full-page
 * capture is whatever height the route happens to be, and every one of them would be a different
 * shape and none of them 1800 tall.
 */

import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..', '..', 'web', 'build');
const OUT = join(import.meta.dirname, '..', 'static', 'shots');
const PORT = 5188;

/** Each shot, and what it has to be showing. `do` runs after load, before the shutter. */
const SHOTS = [
  { name: 'home', route: '/' },
  { name: 'grid', route: '/r/obligations' },
  { name: 'money', route: '/p/money' },
  { name: 'project', route: '/p/kiln' },
  // The one that is a STATE rather than a route: arranging has no URL, by design.
  { name: 'arrange', route: '/p/kiln', act: async (page) => {
      await page.locator('.arrange-slot button').first().click({ timeout: 4000 });
      await page.waitForSelector('[role="listitem"]', { timeout: 4000 });
    } },
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
  console.error('  no record-app build at apps/web/build. `pnpm build` first.');
  process.exit(1);
}

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
  if (!Object.hasOwn(TYPES, extname(rel))) {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return createReadStream(join(ROOT, 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(PORT, r));

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    // No entrance animations racing the shutter, and no motion in a still image anyway.
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  for (const shot of SHOTS) {
    await page.goto(`http://localhost:${PORT}${shot.route}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#main *', { timeout: 5000 }).catch(() => {});
    // The same reason both other scripts do it: an off-screen rowgroup photographs empty.
    await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
    if (shot.act) await shot.act(page);
    await page.waitForTimeout(300);
    const file = join(OUT, `${shot.name}-${scheme}.png`);
    await page.screenshot({ path: file });
    console.log(`  static/shots/${shot.name}-${scheme}.png`);
  }
  await context.close();
}

await browser.close();
server.close();
