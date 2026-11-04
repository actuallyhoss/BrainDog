/**
 * Writes `apps/web/src/lib/shell/first-traces.json`: the shape each kind of main screen has, for a device that has never
 * drawn it (`lib/shell/first-trace-key.ts`). Boxes only, read by the app's own `page-trace.ts` off a running build against a
 * demo record (`apps/cli/scripts/demo-record.mjs make --self-host`), signed in with `state`.
 *
 *   node tools/first-traces.mjs <app url> <playwright storage state>
 *
 * Run it again when a main screen's layout changes much: a stale shape is only ever a first open's outline.
 */
import { writeFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

const [base, state] = process.argv.slice(2);
const SCREENS = { today: '/', needs: '/decide', usage: '/usage', settings: '/settings', 'settings-area': '/settings/appearance', money: '/p/money', dashboard: '/p/dashboard', portfolio: '/p/portfolio', people: '/p/people', agents: '/p/agents', project: '/p/pocketlab', list: '/r/tasks', row: '/r/obligations/4' };
const out = {};
const b = await chromium.launch();
for (const [band, width, height, mobile] of [['w', 1440, 900, false], ['p', 390, 844, true]]) {
  const ctx = await b.newContext({ storageState: state, viewport: { width, height }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  for (const [kind, path] of Object.entries(SCREENS)) {
    await page.goto(base + path, { waitUntil: 'load' });
    await page.waitForSelector('#main[data-screen]', { timeout: 30000 });
    await page.waitForTimeout(3500);
    /* WHERE IT LANDED: a row can open on a page of its own, at another address. */
    const text = await page.evaluate((b) => localStorage.getItem(`bd_tr:${b}:${location.pathname.replace(/\/$/u, '')}${location.search}`), band);
    if (text === null) throw new Error(`no trace kept for ${kind} at ${band}`);
    /* WHAT A SHAPE NEEDS: the page's boxes, its width, its name's width. The sidebar comes from the shell a device kept. */
    const { m, t, r } = JSON.parse(text);
    out[`${band}:${kind}`] = { m, t, r };
    console.log(band, kind, r.length);
  }
  await ctx.close();
}
await b.close();
writeFileSync(new URL('../apps/web/src/lib/shell/first-traces.json', import.meta.url), JSON.stringify(out) + '\n');
