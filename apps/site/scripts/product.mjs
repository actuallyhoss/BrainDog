/**
 * The link-preview card of brain.dog, drawn from the site's own build.
 *
 *   pnpm -C apps/site build && node apps/site/scripts/product.mjs   # writes static/shots/home-light.png
 *
 * ONE FILE, AND IT IS NOT ON ANY PAGE. `app.html` names `/shots/home-light.png` as the `og:image`,
 * which is what a chat app or a search result draws beside a shared link. The name is the old one on
 * purpose, so `static/_headers` and `test/content.test.ts` did not have to change with the picture.
 *
 * A DRAWING AND NOT A CAPTURE OF THE APP. Until 23 September this script photographed the record
 * app's Work board at 1440 by 900 at a device scale of 2, and the card was a 288 KB screenshot of
 * the app on every page's preview. On 22 September the owner said of the screenshots on the home
 * page *i hate those screenshots. they look terrible. dont just add scnreehots like that*
 * (`loop/DIRECTION.md` section 23), and the preview was the last one left. It had also stopped
 * running: it looked for `apps/web/build/index.html`, and the record app now builds under
 * `apps/web/build/app/`, so a run printed "no record-app build" and exited 1.
 *
 * WHAT IS ON IT is lifted out of the built home page rather than typed again here: the bar's mark and
 * wordmark, and the hero's one `<h1>`, with the stylesheet the page loaded still applied. So the
 * card's words are `copy.ts`'s, its faces are the ones in `static/fonts`, and its colours are the
 * palette's tokens; a change to any of them is a change to the card on the next run.
 *
 * A PNG AND NOT A WEBP because a link-preview fetcher is somebody else's server, and not every one
 * of them decodes WebP. 1200 BY 630 AT A DEVICE SCALE OF 1, because that is the size the Open Graph
 * card is drawn at, and `scripts/shots.test.mjs` reads the PNG's own header to hold it there.
 *
 * NO PORT. The page is served to the browser through Playwright's request routing, straight off
 * disk, so the run binds nothing the browser gates or another agent's server could be holding, and a
 * request for anything outside the build is answered 404 here rather than going to the network.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..', 'build');
const OUT = join(import.meta.dirname, '..', 'static', 'shots');
/** The one file. `scripts/shots.test.mjs` fails if the site does not name it. */
const FILE = 'home-light.png';
/* THE ORIGIN THE PAGE IS LOADED UNDER. Every request to it is answered from `ROOT` below, and every
   other request is refused, so nothing is fetched from the real brain.dog. */
const BASE = 'https://brain.dog';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const home = await readFile(join(ROOT, 'index.html'), 'utf8').catch(() => null);
if (!home) {
  console.error('  no site build at apps/site/build. `pnpm -C apps/site build` first.');
  process.exit(1);
}

/* THE PALETTE THE BUILD WAS MADE WITH. An alpha build resolves `house.css` to `alpha.css`
   (`vite.config.ts`), and a card drawn from it would put alpha's violet on every preview of
   brain.dog. An alpha build writes `build-alpha` and not `build` (`svelte.config.js`), so what this
   catches in practice is a `build` older than the palette. Pointed at `build-alpha` on 23 September
   it refused, reading #6c62be against #db2527. The production brand colour is read from the
   generated palette, not typed here. */
const house = await readFile(join(import.meta.dirname, '..', '..', '..', 'packages', 'skin', 'house.css'), 'utf8');
const BRAND = house.match(/--brand:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase();

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  reducedMotion: 'reduce',
  /* NO SCRIPTING, because the page is finished HTML without it, and a hydrating page would redraw the
     body this run is about to replace. */
  javaScriptEnabled: false,
});

await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== BASE) return route.fulfill({ status: 404, body: '' });
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return route.fulfill({ status: 400, body: '' });
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const body = await readFile(join(ROOT, candidate)).catch(() => null);
    if (body) return route.fulfill({ status: 200, body, contentType: TYPES[extname(candidate)] ?? 'application/octet-stream' });
  }
  return route.fulfill({ status: 404, body: '' });
});

const page = await context.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'load' });

const brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase());
if (BRAND && brand !== BRAND) {
  console.error(`  the build's brand colour is ${brand}, and production's is ${BRAND}. \`pnpm -C apps/site build\`, without BRAINDOG_ENV, first.`);
  process.exit(1);
}

/* THE CARD: the hero's own ground, the mark and wordmark at the top, the slogan across the lower
   half. The classes the build gave the lifted elements keep the page's rules for colour and face;
   the rules below only size and place them, since a 1200-wide card is not the 1440-wide page. */
const drew = await page.evaluate(() => {
  const mark = document.querySelector('header .brand');
  const title = document.querySelector('#hero-title');
  if (!mark || !title) return false;
  const card = document.createElement('div');
  card.className = 'og-card';
  card.append(mark.cloneNode(true), title.cloneNode(true));
  document.body.replaceChildren(card);
  const style = document.createElement('style');
  style.textContent = `
    html, body { margin: 0; background: var(--sunk); }
    .og-card {
      box-sizing: border-box; inline-size: 1200px; block-size: 630px; padding: 88px 96px;
      display: flex; flex-direction: column; justify-content: space-between;
      background: var(--sunk); border-block-end: 12px solid var(--accent);
    }
    .og-card .brand { gap: 22px; }
    .og-card .brand .mark { inline-size: auto; block-size: 60px; }
    .og-card .brand .wordmark { font-size: 52px; }
    .og-card #hero-title { max-inline-size: 15ch; font-size: 96px; line-height: 1.04; }
  `;
  document.head.append(style);
  return true;
});
if (!drew) {
  console.error('  the built home page has no `header .brand` or `#hero-title` to draw the card from.');
  process.exit(1);
}
await page.evaluate(() => document.fonts.ready);

const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
await writeFile(join(OUT, FILE), png);
console.log(`  static/shots/${FILE}  1200x630  ${(png.length / 1024).toFixed(0)} KB`);

await context.close();
await browser.close();
