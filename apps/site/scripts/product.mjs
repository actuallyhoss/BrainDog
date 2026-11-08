/**
 * The link-preview cards of brain.dog, drawn from the site's own words, marks and faces.
 *
 *   node apps/site/scripts/product.mjs   # writes static/shots/og-*.png, no build needed
 *
 * ONE CARD PER KEY PAGE, AND NONE IS ON A PAGE. `lib/site/seo.ts` names which pages have a card of their own
 * (`CARD_PATHS`), the file each is written to (`cardOf`) and the words on it (`cardFor`, read from `copy/`), and
 * `Seo.svelte` names it as that page's `og:image` and `twitter:image`, which is what a chat app or a search result
 * draws beside a shared link. A docs page takes the docs card, a plugin's page the plugins card, and every other page
 * the home card.
 *
 * A DESIGNED CARD IN THE HERO'S STYLE, NEVER A CAPTURE OF THE PAGE (8 November, the owner: "proper open graph images
 * that aren't just screenshots of the website, follow our branding and our jumbotron style"). Each card is the home
 * hero's night ground with the mark drawn large as a thin line behind, the red mark and the wordmark at the top, the
 * page's address in mono, and the page's own headline set big and tight in Plus Jakarta Sans 600 with the line under
 * it. No gradient, no pill, no shadow, no drawn app. The headline is set as large as fits in three lines, from 120px
 * down, so it reads at thumbnail size; a headline of two sentences takes a line each, as the hero sets it.
 *
 * THE FACES ARE `static/fonts`'s, inlined so nothing is fetched. THE COLOURS are Look B's night tokens, and the red
 * is read from the generated palette (`packages/skin/house.css`), so an alpha palette never reaches a preview.
 *
 * A PNG AND NOT A WEBP because a link-preview fetcher is somebody else's server, and not every one of them decodes
 * WebP. 1200 BY 630 AT A DEVICE SCALE OF 1, because that is the size the Open Graph card is drawn at, and
 * `scripts/shots.test.mjs` reads the PNG's own header to hold it there.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

import { CARD_PATHS, cardFor, cardOf, cardSub } from '../src/lib/site/seo.ts';
import { MARK } from '../../../packages/skin/mark.ts';

const SITE = join(import.meta.dirname, '..');
const OUT = join(SITE, 'static', 'shots');

const house = await readFile(join(SITE, '..', '..', 'packages', 'skin', 'house.css'), 'utf8');
const RED = house.match(/--red-fill:\s*(#[0-9a-f]{6})/i)?.[1];
if (!RED) {
  console.error('  no --red-fill in packages/skin/house.css. `pnpm --filter @braindog/skin theme` first.');
  process.exit(1);
}

/* LOOK B'S NIGHT (`packages/theme/look-b.css`): the ground, its ink, the ink's quiet half and the hero mark's line. */
const NIGHT = '#0F1012';
const ON_NIGHT = '#F3F4F6';
const ON_NIGHT_2 = 'rgba(243, 244, 246, .68)';
const NIGHT_MARK = 'rgba(255, 255, 255, .085)';

const font = async (file) => `data:font/woff2;base64,${(await readFile(join(SITE, 'static', 'fonts', file))).toString('base64')}`;
const JAKARTA = await font('jakarta.woff2');
const MONO = await font('geist-mono.woff2');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const paths = MARK.paths.map((d) => `<path d="${d}"/>`).join('');

/** A headline of two or more sentences takes a line each, as the hero sets its own. */
const lines = (title) => title.split(/(?<=[.!?]) (?=[A-Z])/).map((line) => `<span class="line">${esc(line)}</span>`).join(' ');

const html = (path, card) => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Jakarta'; src: url(${JAKARTA}) format('woff2'); font-weight: 200 800; }
  @font-face { font-family: 'Mono'; src: url(${MONO}) format('woff2'); }
  html, body { margin: 0; background: ${NIGHT}; }
  .card {
    position: relative; overflow: hidden; box-sizing: border-box;
    inline-size: 1200px; block-size: 630px; padding: 64px 80px 72px;
    display: flex; flex-direction: column; justify-content: space-between;
    background: ${NIGHT}; color: ${ON_NIGHT}; font-family: 'Jakarta', sans-serif;
  }
  .behind { position: absolute; inset-inline-end: -190px; inset-block-start: -36px; inline-size: 860px; block-size: auto; }
  .behind path { fill: none; stroke: ${NIGHT_MARK}; stroke-width: 3.4; stroke-linejoin: round; }
  .top { position: relative; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 40px; font-weight: 600; letter-spacing: -0.01em; }
  .brand svg { block-size: 48px; inline-size: auto; fill: ${RED}; }
  .where { font-family: 'Mono', monospace; font-size: 24px; color: ${ON_NIGHT_2}; }
  .words { position: relative; display: grid; gap: 24px; }
  h1 {
    margin: 0; max-inline-size: 1040px; font-weight: 600; line-height: 1.04; letter-spacing: -0.021em;
    text-wrap: balance;
  }
  h1 .line { display: block; text-wrap: balance; }
  p { margin: 0; max-inline-size: 900px; font-size: 30px; line-height: 1.4; color: ${ON_NIGHT_2}; text-wrap: balance; }
</style></head><body>
<div class="card">
  <svg class="behind" viewBox="${MARK.viewBox}" aria-hidden="true">${paths}</svg>
  <div class="top">
    <div class="brand"><svg viewBox="${MARK.viewBox}" aria-hidden="true">${paths}</svg>BrainDog</div>
    <div class="where">brain.dog${path === '/' ? '' : esc(path)}</div>
  </div>
  <div class="words">
    <h1>${lines(card.title)}</h1>
    <p>${esc(cardSub(card.sub))}</p>
  </div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
/* Nothing is fetched: the faces are inlined, and any other request is refused. */
await page.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));

for (const path of CARD_PATHS) {
  const card = cardFor(path);
  await page.setContent(html(path, card), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  /* THE HEADLINE AS LARGE AS FITS: from 120px down, until it holds three lines or fewer, no word runs past the
     column, and the words clear the brand row by 40px. */
  const size = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const words = document.querySelector('.words');
    const top = document.querySelector('.top');
    for (let px = 120; px >= 56; px -= 2) {
      h1.style.fontSize = `${px}px`;
      const lines = Math.round(h1.getBoundingClientRect().height / (px * 1.04));
      const room = words.getBoundingClientRect().top - top.getBoundingClientRect().bottom;
      if (lines <= 3 && h1.scrollWidth <= h1.clientWidth + 1 && room >= 40) return px;
    }
    return 56;
  });
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
  const name = new URL(cardOf(path)).pathname.split('/').pop();
  await writeFile(join(OUT, name), png);
  console.log(`  static/shots/${name}  ${size}px  ${(png.length / 1024).toFixed(0)} KB  ${card.title}`);
}

await browser.close();
