/**
 * The product screenshots on brain.dog, regenerated from the record app's own build.
 *
 *   node scripts/product.mjs        # writes static/shots/<name>[-phone]-<scheme>.webp
 *
 * THESE ARE SHIPPED ASSETS, not review artefacts: `scripts/shot.mjs` beside this one photographs
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

/**
 * ONE SHOT, BECAUSE ONE IS WHAT THE PAGE DRAWS.
 *
 * This list was one, then five, then one, then six. The six were chosen on a rule that still holds,
 * EVERY ENTRY IS A SCREEN THAT SHOWS WHAT A PERSON GETS, never one that shows how the thing is built,
 * and measured by opening sixteen of the seeded record's routes at 1440 by 900 (`/inbox` and `/spark`
 * photograph as empty states, `/p/ledger` leads with a warning panel, `/r/*` are the mechanism).
 *
 * BUT FIVE OF THE SIX HAD NO READER. On 22 September every `/shots/` token in the built site was
 * extracted and there were nine: this script's `home` in four captures and its og:image PNG, and
 * the founder dashboard `usecases.mjs` takes. `money`, `board`, `projects`, `project` and `decide`
 * were twenty WebPs, 2,774,922 bytes, deployed on every push and fetched by nobody: the page had
 * stopped drawing them and this list had not been told. A capture no page names is not free: it
 * ships, it goes stale in the next palette change, and nothing says so. They were deleted and
 * their entries with them, so a run cannot put them back. `scripts/shots.test.mjs` fails if this
 * list names a capture `apps/site/src` does not, and it is the check to read before adding one: add
 * the page's `<img>` first.
 *
 * `png` IS THE EXCEPTION AND NOT THE RULE. `app.html` names `home-light.png` as the `og:image`, and
 * a link preview fetcher is somebody else's server: not every one of them decodes WebP. That is one
 * file. Every other capture ships as WebP alone; see the shutter below for what the old `path:`
 * argument cost.
 *
 * `act` runs after load and before the shutter, and is skipped at phone width (the layout differs).
 */
const SHOTS = [
  /* The day: what you are owed, what is due, what needs your call, and what the agents did while you
     were away. It is the only screen that holds all four at once, which is why it is the one. */
  { name: 'home', route: '/', png: true },
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
  /* `png`: the one pass that also writes a PNG, for the one address `app.html` names as `og:image`. */
  { suffix: '', width: 1440, height: 900, scale: 2, png: true },
  { suffix: '-phone', width: 390, height: 844, scale: 3 },
];

for (const size of SIZES)
  for (const scheme of ['light', 'dark']) {
    const wants = { png: size.png === true && scheme === 'light' };
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
          /**
           * NO `path:` ON THE SHUTTER, AND THAT WAS COSTING A PNG A CAPTURE.
           *
           * `page.screenshot({ path })` both returns the buffer and writes it, so every shot at
           * every size in every scheme landed in `static/shots/` as a PNG whether or not anything
           * served it. Measured on this directory with the old one-shot list: `git ls-files` tracks
           * `home-light.png` and nothing else, and a run left `home-dark.png`,
           * `home-phone-light.png` and `home-phone-dark.png` untracked beside it, 932,761 bytes of
           * files somebody deleted by hand afterwards. At six shots that is twenty-one of them, and
           * `static/` is a directory where an untracked file is one `git add -A` from being
           * deployed. The buffer is all this loop ever needed; `png: true` writes the one file that
           * has a reader.
           */
          png = await page.screenshot();
        } catch (error) {
          if (attempt >= 3) throw error;
          await page.waitForTimeout(2000);
        }
      }
      /**
       * AND THE PNG IS ONE FILE, NOT FOUR, AND IT IS WRITTEN OUTSIDE THE RETRY.
       *
       * `png: true` on the shot is a fact about the shot, so the first pass at this wrote
       * `home-dark.png`, `home-phone-light.png` and `home-phone-dark.png` as well and left exactly
       * the three strays the change was made to stop. `app.html` names one address,
       * `/shots/home-light.png`, so the condition is the wide light capture of a shot that asked for
       * a PNG and nothing else.
       *
       * IT SITS AFTER THE LOOP BECAUSE THE LOOP'S CONDITION IS `png`. Inside the `try`, a `writeFile`
       * that threw was caught by the shutter's own handler, and by then `png` held the buffer, so
       * `!png` ended the loop on the spot: the same shape run on its own answered `attempts: 1,
       * png assigned: true, png file written: false, error surfaced: no`. A retry cannot help a
       * refused write anyway, and the og:image quietly not being there is the one failure this
       * directory cannot afford, so the write throws where the run can see it.
       */
      if (shot.png && wants.png) await writeFile(join(OUT, `${name}.png`), png);
      {
        /* THE WEBP IS WHAT THE PAGE SERVES, every time and not just for the hero: the PNG of one
           screen is around half a megabyte and the WebP of the same pixels is around 270 KB, so
           WebP-for-everything is the whole of `static/shots/` at a little over half its old weight.
           The browser encodes it, so the script needs no image library. */
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
        const bytes = Buffer.from(webp, 'base64');
        await writeFile(join(OUT, `${name}.webp`), bytes);
        /* THE WEIGHT IS PRINTED BECAUSE THE PAGE IS A BUDGET. A full-bleed capture at 2x is the
           largest thing brain.dog ships, and "keep it defensible" is not a thing anybody can do
           from a run that says only which files it wrote. */
        console.log(`  static/shots/${name}.webp  ${(bytes.length / 1024).toFixed(0)} KB${shot.png && wants.png ? ' (and .png for og:image)' : ''}`);
      }
    }
    await context.close();
  }

await browser.close();
server?.close();
await record?.close();
