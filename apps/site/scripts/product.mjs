/**
 * The link-preview picture of brain.dog, regenerated from the record app's own build.
 *
 *   node scripts/product.mjs        # writes static/shots/home-light.png
 *
 * ONE FILE, AND IT IS NOT ON ANY PAGE. `app.html` names `/shots/home-light.png` as the `og:image`,
 * which is what a chat app or a search result draws beside a shared link. The pages themselves carry
 * no photograph: on 22 September the owner said of the screenshots on the home page *i hate those
 * screenshots. they look terrible*, and the home page now draws the app in HTML and CSS instead. The
 * four WebP captures this script used to write for the hero, and the phone pass that made two of
 * them, went with that change, so a run cannot put them back.
 *
 * A PNG AND NOT A WEBP because a link-preview fetcher is somebody else's server, and not every one
 * of them decodes WebP.
 *
 * It serves `apps/web/build` with the SPA fallback the record app needs, and forwards `/api/*` to
 * the same in-memory seed the browser gates read (`tools/gates/record.mjs`), so the picture is a read
 * of a real record and not the in-browser sample.
 */

import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from '@playwright/test';

import { answers, forward, startRecord } from '../../../tools/gates/record.mjs';

/**
 * `--from=<url>` SHOOTS A RUNNING APP INSTEAD OF THE BUILD, for the days the record app is being
 * redesigned and its build lags its source: `node scripts/product.mjs --from=http://localhost:5317`.
 * The dev server reads its own sample record, so no record is started and nothing is forwarded.
 */
const FROM = process.argv.find((a) => a.startsWith('--from='))?.slice('--from='.length) ?? null;

const ROOT = join(import.meta.dirname, '..', '..', 'web', 'build');
const OUT = join(import.meta.dirname, '..', 'static', 'shots');
/* 5390 AND NOT 5188, which sat inside the block the site's dev server and the browser gates hold. */
const PORT = 5390;

/**
 * THE ONE SHOT. `scripts/shots.test.mjs` fails if this list names a file `apps/site/src` does not,
 * so the name stays `home` because that is the name `app.html` asks for. The work board, because of
 * sixteen routes in the sample it is the one screen with no money figure on it: six status columns
 * of cards, which reads at the size a preview card is drawn.
 */
const SHOTS = [{ name: 'home', route: '/p/work-board', png: true }];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

if (!FROM && !(await stat(join(ROOT, 'index.html')).catch(() => null))) {
  console.error('  no record-app build at apps/web/build. `pnpm build` first.');
  process.exit(1);
}

const record = FROM ? null : await startRecord();

const server = FROM
  ? null
  : createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname.startsWith('/api/')) return forward(req, res, record.base);
      const rel = decodeURIComponent(url.pathname).slice(1);
      if (rel.includes('..')) return res.writeHead(400).end();
      for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
        const file = join(ROOT, candidate);
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) continue;
        res.writeHead(200, {
          'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        });
        return createReadStream(file).pipe(res);
      }
      if (!Object.hasOwn(TYPES, extname(rel))) {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        return createReadStream(join(ROOT, 'index.html')).pipe(res);
      }
      res.writeHead(404).end();
    });
const BASE = FROM ?? `http://localhost:${PORT}`;
if (server && record) {
  await new Promise((r) => server.listen(PORT, r));
  await answers(BASE);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

/* 1440 BY 900 AT A DEVICE SCALE OF 2, IN LIGHT, which is the one size and scheme the preview is. */
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
/* A READER WHO HAS BEEN HERE BEFORE: the sample bar and the one-line definitions under a title are
   right for somebody opening the app and noise in a preview. */
await context.addCookies([
  {
    name: 'bd_pref',
    value: encodeURIComponent(JSON.stringify({ scheme: 'light', sampleSaid: true, defined: ['row', 'page', 'block'] })),
    url: BASE,
  },
]);
const page = await context.newPage();

for (const shot of SHOTS) {
  /* A DEV SERVER RELOADS WHEN ITS SOURCE CHANGES, and a reload mid-capture is a thrown screenshot
     rather than a wrong one, so a failed attempt is simply taken again. */
  let png;
  for (let attempt = 1; !png; attempt++) {
    try {
      await page.goto(`${BASE}${shot.route}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main#main[data-screen]', { timeout: 10000 }).catch(() => {});
      await page.addStyleTag({
        content: '.rowgroup{content-visibility:visible !important}.sample-note{display:none !important}',
      });
      await page.waitForTimeout(300);
      png = await page.screenshot();
    } catch (error) {
      if (attempt >= 3) throw error;
      await page.waitForTimeout(2000);
    }
  }
  /* OUTSIDE THE RETRY, so a refused write throws where the run can see it rather than being caught
     by the shutter's own handler. */
  await writeFile(join(OUT, `${shot.name}-light.png`), png);
  console.log(`  static/shots/${shot.name}-light.png  ${(png.length / 1024).toFixed(0)} KB`);
}

await context.close();
await browser.close();
server?.close();
await record?.close();
