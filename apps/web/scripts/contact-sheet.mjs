/**
 * One image of every screen, for a person to judge the whole thing at once.
 *
 * Run `shot.mjs` first. Like every screenshot here it is an ARTEFACT and never an assertion —
 * rendering varies with the host, so a pixel diff fails on whitespace and passes on layout bugs.
 *
 *   node scripts/contact-sheet.mjs [dark|light]
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const DIR = process.env.BD_SHOTS ?? 'shots';
const scheme = process.argv[2] ?? 'dark';
const COLUMNS = 4;
const TILE = 520;

const files = (await readdir(DIR))
  .filter((f) => f.endsWith(`-${scheme}-1440.png`))
  .sort();

const tiles = await Promise.all(
  files.map(async (f) => ({
    name: f.replace(`-${scheme}-1440.png`, ''),
    data: `data:image/png;base64,${(await readFile(join(DIR, f))).toString('base64')}`,
  })),
);

const rows = Math.ceil(tiles.length / COLUMNS);
const html = `
<style>
  :root { color-scheme: ${scheme}; }
  body {
    margin: 0; padding: 28px; background: ${scheme === 'dark' ? '#0d0e11' : '#e9e9ec'};
    font: 500 13px/1.4 system-ui, sans-serif; color: ${scheme === 'dark' ? '#e6e7ec' : '#22242a'};
  }
  h1 { font-size: 20px; letter-spacing: -0.02em; margin: 0 0 4px; }
  p { margin: 0 0 24px; opacity: 0.55; font-weight: 400; }
  .sheet { display: grid; grid-template-columns: repeat(${COLUMNS}, 1fr); gap: 20px; }
  figure { margin: 0; }
  img {
    width: 100%; display: block; border-radius: 8px;
    border: 1px solid ${scheme === 'dark' ? '#2a2c33' : '#cdcdd4'};
    object-fit: cover; object-position: top; aspect-ratio: 1440 / 1000;
  }
  figcaption { margin-top: 8px; opacity: 0.6; font-family: ui-monospace, monospace; font-size: 11px; }
</style>
<h1>BrainDog &mdash; every screen, ${scheme}</h1>
<p>${tiles.length} routes at 1440. A frontend mock-up: nothing writes, and no request leaves the page.</p>
<div class="sheet">
  ${tiles.map((t) => `<figure><img src="${t.data}"><figcaption>${t.name}</figcaption></figure>`).join('')}
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: COLUMNS * TILE + 100, height: rows * (TILE * 0.75) + 200 },
  deviceScaleFactor: 2,
  colorScheme: scheme,
});
await page.setContent(html);
await page.waitForTimeout(600);
const out = join(DIR, `contact-sheet-${scheme}.png`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`  ${out} — ${tiles.length} screens`);
