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
 * AND IT FORWARDS `/api/*` TO A RECORD, because the register list reads one now. It is the same
 * in-memory seed the browser gates read (`tools/gates/record.mjs`), pinned at the seed's day, so the
 * grid photographed here is a read of a real record and not the in-browser sample. Its unsorted
 * order is the record's, newest first.
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

import { answers, forward, startRecord } from '../../../tools/gates/record.mjs';

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

const record = await startRecord();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/api/')) return forward(req, res, record.base);
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
await answers(`http://localhost:${PORT}`);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

/**
 * AND A PHONE, WHICH IS THE HALF THAT WAS MISSING.
 *
 * These went out at 2880 by 1800 into a box that is 358px wide on a phone. That is a twelve per
 * cent scale, so the app's 15px body text renders at 1.9 pixels and every screenshot on the site
 * is a grey texture. Six of the nine sections of the home page argue "look at this screen", and on
 * the device most people arrive on there was nothing to look at.
 *
 * The fix is not a bigger box, because there is no bigger box on a phone. It is a photograph of
 * the product AS A PHONE DRAWS IT: 390 by 844 into 358px is a ninety-two per cent scale, the type
 * is the size the type is, and the picture is also the truthful one, because a person reading the
 * marketing site on a phone is deciding whether to open the app on a phone.
 *
 * `deviceScaleFactor: 3` on the narrow one and 2 on the wide, which is what those two classes of
 * device actually have, so neither is soft.
 *
 * `isMobile` IS DELIBERATELY NOT SET. It would give the page a coarse pointer, and this product
 * changes control SIZE on the pointer rather than on the width (`05 §6`), so the screenshots would
 * show 44px controls to a laptop reader looking at the wide capture next to them. Width decides
 * layout here; the narrow capture is a narrow window, which is exactly what the app treats a phone
 * as.
 */
const SIZES = [
  { suffix: '', width: 1440, height: 900, scale: 2 },
  { suffix: '-phone', width: 390, height: 844, scale: 3 },
];

for (const size of SIZES)
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.scale,
      colorScheme: scheme,
      // No entrance animations racing the shutter, and no motion in a still image anyway.
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    for (const shot of SHOTS) {
      await page.goto(`http://localhost:${PORT}${shot.route}`, { waitUntil: 'networkidle' });
      /* THE SCREEN SAYS WHEN IT HAS DRAWN, and a list that reads the record has not drawn when its
         heading has. `data-screen` is the app's own answer; a shot that timed out waiting for it is
         still taken, because a picture of what went wrong is more use than no picture. */
      await page.waitForSelector('main#main[data-screen]', { timeout: 10000 }).catch(() => {});
      // The same reason both other scripts do it: an off-screen rowgroup photographs empty.
      await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
      /* AND THE ACT IS THE LAPTOP'S. `arrange` presses a control that a phone lays out somewhere
         else or not at all, and a shot whose setup silently failed is a picture of the screen
         before the thing it is meant to be showing. It is skipped rather than guessed at, and the
         phone falls back to the wide capture for that one. */
      if (shot.act && size.suffix === '') await shot.act(page);
      if (shot.act && size.suffix !== '') continue;
      await page.waitForTimeout(300);
      const file = join(OUT, `${shot.name}${size.suffix}-${scheme}.png`);
      await page.screenshot({ path: file });
      console.log(`  static/shots/${shot.name}${size.suffix}-${scheme}.png`);
    }
    await context.close();
  }

await browser.close();
server.close();
await record.close();
