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
const PORT = 5188;

/** Each shot, and what it has to be showing. `do` runs after load, before the shutter. */
/**
 * ONE SHOT, BECAUSE THE SITE SERVES ONE.
 *
 * This list held five: `home`, `grid`, `money`, `project` and `arrange`. Four of them existed for
 * the bento and the use-case rows on the old home page, which drew ten pictures of the product,
 * most of them painted below full size. The redesign kept two pictures, and photographing four
 * screens nobody is shown cost 2.2 MB in `static/`, every byte of it deployed and none of it
 * requested. The four went with the sections that asked for them.
 *
 * Adding one back is one line here and one `node scripts/product.mjs` run. That is the whole
 * reason this comment names the four rather than just deleting them quietly.
 */
const SHOTS = [
  /* `webp`: the typed band serves this one at full size, so it gets a WebP beside its PNG. The
     PNG is not spare — `app.html` names `home-light.png` as the `og:image`, and a link preview
     fetcher is the one reader that will not take a WebP from every service that renders it. */
  { name: 'home', route: '/', webp: true },
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
/* A blank page of its own does the encoding, because the app's page can navigate under it. */
const encoder = await browser.newPage();

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
    /* A READER WHO HAS BEEN HERE BEFORE. The first visit's furniture, the sample bar and the one-line
       definitions under a title, is right for somebody opening the app and noise on a marketing
       page: it pushed the product down the frame and put a paragraph about the sample above it. */
    await context.addCookies([
      {
        name: 'bd_pref',
        value: encodeURIComponent(JSON.stringify({ scheme, sampleSaid: true, defined: ['row', 'page', 'block'] })),
        url: BASE,
      },
    ]);
    const page = await context.newPage();

    for (const shot of SHOTS) {
      if (shot.act && size.suffix !== '') continue;
      /* A DEV SERVER RELOADS WHEN ITS SOURCE CHANGES, and a reload mid-capture is a thrown
         screenshot rather than a wrong one, so a failed attempt is simply taken again. */
      let png;
      const name = `${shot.name}${size.suffix}-${scheme}`;
      for (let attempt = 1; !png; attempt++) {
        try {
          await page.goto(`${BASE}${shot.route}`, { waitUntil: 'networkidle' });
          /* THE SCREEN SAYS WHEN IT HAS DRAWN, and a list that reads the record has not drawn when its
         heading has. `data-screen` is the app's own answer; a shot that timed out waiting for it is
         still taken, because a picture of what went wrong is more use than no picture. */
          await page.waitForSelector('main#main[data-screen]', { timeout: 10000 }).catch(() => {});
          // The same reason both other scripts do it: an off-screen rowgroup photographs empty.
          await page.addStyleTag({
            /* And the one-line "This is a sample record." note a list keeps after the bar is put away:
               on brain.dog the page around the picture already says so. */
            content: '.rowgroup{content-visibility:visible !important}.sample-note{display:none !important}',
          });
          /* AND THE ACT IS THE LAPTOP'S. `arrange` presses a control that a phone lays out somewhere
         else or not at all, and a shot whose setup silently failed is a picture of the screen
         before the thing it is meant to be showing. It is skipped rather than guessed at, and the
         phone falls back to the wide capture for that one. */
          if (shot.act && size.suffix === '') await shot.act(page);
          await page.waitForTimeout(300);
          png = await page.screenshot({ path: join(OUT, `${name}.png`) });
        } catch (error) {
          if (attempt >= 3) throw error;
          await page.waitForTimeout(2000);
        }
      }
      if (shot.webp) {
        /* AND A WEBP BESIDE IT, which is what the page serves: the PNG of one screen is over a
           megabyte and the hero is the largest paint on the page. The PNG stays for `og:image`,
           because a preview fetcher is somebody else's server and not every one decodes WebP. The
           browser encodes it, so the script needs no image library. */
        const webp = await encoder.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
          canvas.getContext('2d').drawImage(img, 0, 0);
          const blob = await canvas.convertToBlob({
            type: 'image/webp',
            quality: 0.9,
          });
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let out = '';
          for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(out);
        }, png.toString('base64'));
        await writeFile(join(OUT, `${name}.webp`), Buffer.from(webp, 'base64'));
      }
      console.log(`  static/shots/${name}.png${shot.webp ? ' and .webp' : ''}`);
    }
    await context.close();
  }

await browser.close();
server?.close();
await record?.close();
