/**
 * The link-preview cards of brain.dog, drawn from the site's own build.
 *
 *   pnpm -C apps/site build && node apps/site/scripts/product.mjs   # writes static/shots/*.png
 *
 * ONE CARD PER KEY PAGE, AND NONE IS ON A PAGE. `lib/site/seo.ts` names which pages have a card of their own
 * (`CARD_PATHS`) and the file each is written to (`cardOf`), and `Seo.svelte` names it as that page's `og:image` and
 * `twitter:image`, which is what a chat app or a search result draws beside a shared link. Every other page uses the
 * home card, which keeps its old name, `home-light.png`, so `static/_headers` and the tests did not have to change.
 *
 * A DRAWING AND NOT A CAPTURE OF THE APP. On 22 September the screenshots on the site were ruled out: a screenshot is
 * not to be dropped onto a page like that. WHAT IS ON A CARD is lifted out of the built page rather than typed again
 * here: the bar's mark and wordmark, the page's one `<h1>` and the line under it, on that section's own ground, with
 * the stylesheet the page loaded still applied. So a card's words are `copy/`'s, its faces are the ones in
 * `static/fonts`, and its colours are the palette's tokens; a change to any of them is a change to the card on the
 * next run.
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

import { CARD_PATHS, cardOf } from '../src/lib/site/seo.ts';

const ROOT = join(import.meta.dirname, '..', 'build');
const OUT = join(import.meta.dirname, '..', 'static', 'shots');
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
   brain.dog. The production brand colour is read from the generated palette, not typed here. */
const house = await readFile(join(import.meta.dirname, '..', '..', '..', 'packages', 'skin', 'house.css'), 'utf8');
const BRAND = house.match(/--red-fill:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase();

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

/* The token may come back as a hex or as `rgb()`, by how the palette spells it, so both sides are said as hex. */
const hex = (c) => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c);
  return m ? `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : c;
};
const brand = hex(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--red-fill').trim().toLowerCase()));
if (BRAND && brand !== BRAND) {
  console.error(`  the build's brand colour is ${brand}, and production's is ${BRAND}. \`pnpm -C apps/site build\`, without BRAINDOG_ENV, first.`);
  process.exit(1);
}

/* EACH CARD IS ITS PAGE'S HEAD, SHRUNK TO FIT: the ground it sits on, the mark and wordmark at the top, and the
   page's h1 with the line under it across the lower half. The ground is read off the section that holds the h1, so a
   card follows whatever ground the page gives it. The classes the build gave the lifted elements keep the page's
   rules for colour and face; the rules below only size and place them, since a 1200-wide card is not the 1440-wide
   page. */
for (const path of CARD_PATHS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  const drew = await page.evaluate(() => {
    const title = document.querySelector('main h1');
    const mark = document.querySelector('header .brand');
    const section = title?.closest('section');
    if (!title || !mark || !section) return false;
    /* THE GROUND THE HEAD SITS ON: its own, or since the redo of 2 November (a page's head on the app's board, with no
       fill of its own) the first ground behind it, down to the document's. */
    const clear = (c) => c === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(c);
    let ground = getComputedStyle(document.documentElement).backgroundColor;
    for (let n = section; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (!clear(c)) {
        ground = c;
        break;
      }
    }
    const card = document.createElement('div');
    card.className = 'og-card';
    card.style.color = getComputedStyle(title).color;
    const words = document.createElement('div');
    words.className = 'og-words';
    const h = title.cloneNode(true);
    h.classList.add('og-title');
    words.append(h);
    const sub = section.querySelector('.lead, .lede, .sub');
    if (sub) {
      /* A card holds two short lines under the title, so a long lead keeps its first sentences up to about 150
         characters, whole, and never ends cut mid-word. */
      const line = sub.cloneNode(true);
      line.classList.add('og-sub');
      const said = (sub.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (said.length > 150) {
        let kept = '';
        for (const s of said.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []) {
          if ((kept + s).trim().length > 150) break;
          kept += s;
        }
        if (kept.trim()) line.textContent = kept.trim();
      }
      words.append(line);
    }
    card.append(mark.cloneNode(true), words);
    document.body.replaceChildren(card);
    const style = document.createElement('style');
    style.textContent = `
      html, body { margin: 0; background: ${ground}; }
      .og-card {
        box-sizing: border-box; inline-size: 1200px; block-size: 630px; padding: 72px 96px;
        display: flex; flex-direction: column; justify-content: space-between;
        background: ${ground};
      }
      .og-card .brand { gap: 20px; font-size: 44px; }
      .og-card .brand .mark { inline-size: auto; block-size: 56px; }
      .og-card .brand .wordmark { font-size: 48px; }
      .og-card .og-words { display: grid; gap: 24px; }
      .og-card .og-title { max-inline-size: 20ch; margin: 0; font-size: 80px; line-height: 1.02; letter-spacing: -0.05em; }
      .og-card .og-sub {
        max-inline-size: 46ch; margin: 0; font-size: 26px; line-height: 1.4;
      }
    `;
    document.head.append(style);
    return true;
  });
  if (!drew) {
    console.error(`  ${path} has no \`main h1\` inside a section, or no \`header .brand\`, to draw its card from.`);
    process.exit(1);
  }
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
  const name = new URL(cardOf(path)).pathname.split('/').pop();
  await writeFile(join(OUT, name), png);
  console.log(`  static/shots/${name}  1200x630  ${(png.length / 1024).toFixed(0)} KB`);
}

await context.close();
await browser.close();
