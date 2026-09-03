/**
 * Screenshots, for a person to look at.
 *
 * Deliberately NOT a gate. Rendering "can vary based on the host OS, version, settings, hardware,
 * power source", so a full-page pixel diff fails on whitespace and passes on layout bugs. Keep
 * screenshots as artefacts for the human; assert on the accessibility tree and computed geometry
 * instead (22 §10).
 *
 *   node scripts/shot.mjs                       every route, both schemes, 1440
 *   node scripts/shot.mjs /decide/SG31 390      one route at one width
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const HOST = process.env.BD_HOST ?? 'http://localhost:5183';
const OUT = process.env.BD_SHOTS ?? 'shots';

const ROUTES = [
  ['home', '/'],
  ['decide', '/decide'],
  ['gate', '/decide/SG31'],
  ['inbox', '/inbox'],
  ['grid', '/r/obligations'],
  ['entry', '/r/obligations/1'],
  ['page-money', '/p/money'],
  ['page-estate', '/p/estate'],
  ['vault', '/vault'],
  ['packs', '/packs'],
  ['settings', '/settings/appearance'],
  ['start', '/start'],
  ['audit', '/audit'],
  ['search', '/search?q=kiln'],
  ['job', '/jobs/j_7Q2F'],
];

const [argRoute, argWidth] = process.argv.slice(2);
const width = Number(argWidth) || 1440;
const routes = argRoute ? [['shot', argRoute]] : ROUTES;
const schemes = argRoute ? ['dark'] : ['dark', 'light'];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const scheme of schemes) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  for (const [name, path] of routes) {
    await page.goto(HOST + path, { waitUntil: 'networkidle' });
    // A hydrated shell, not a silhouette: wait for the router to have painted something real.
    await page.waitForSelector('#main *', { timeout: 5000 }).catch(() => {});
    const file = `${OUT}/${name}-${scheme}-${width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ${file}`);
  }

  if (errors.length) {
    console.error(`\n  ${errors.length} console errors in ${scheme}:`);
    for (const e of [...new Set(errors)].slice(0, 12)) console.error(`    ${e}`);
    process.exitCode = 1;
  }
  await context.close();
}

await browser.close();
