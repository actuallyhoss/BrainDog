/**
 * A SHOT SMALL ENOUGH TO REACH HIS PHONE.
 *
 * `shot.mjs` writes twenty PNGs at a device scale of 1.5 for looking at on this machine, and the
 * home page is 1.4 MB of that. The file channel refuses anything much over half a megabyte with a
 * bare `400`, which has now cost two sessions the same twenty minutes: the 1.4 MB pair failed, the
 * 0.8 MB phone shot failed, and a 56 KB one went through on the first try. So the limit is size
 * and not the image, and this script exists so that nobody works that out a third time.
 *
 * JPEG AND NOT PNG, at 1,200px and quality 60. A screenshot of a page is mostly flat colour with
 * text on it, which is the case PNG is good at, and at full page height PNG is still four times
 * over the limit. What comes out here is about 95 KB, which is a tenth of the allowance, and it is
 * a picture to look at on a phone rather than a record of pixels: `shots/` keeps the PNGs.
 *
 *   node apps/site/scripts/send-shot.mjs            the home page, both schemes
 *   node apps/site/scripts/send-shot.mjs pricing    any shot `shot.mjs` has taken
 *
 * Run `node apps/site/scripts/shot.mjs` first: this re-encodes what that wrote.
 *
 * It writes into `%TEMP%/braindog-loop/` and prints the paths, because these are for sending once
 * and not for keeping.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const SHOTS = join(import.meta.dirname, '..', 'shots');
const OUT = join(process.env.TEMP ?? '/tmp', 'braindog-loop');
const NAME = process.argv[2] ?? 'home';
const PORT = 5178;

/* THE PNG IS SERVED RATHER THAN OPENED AS A FILE. A page made with `setContent` has an opaque
   origin, and an `<img>` at a `file://` URL inside one fails to decode with `EncodingError`, which
   reads like a corrupt PNG and is not one. One request handler is cheaper than working that out
   twice. */
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(SHOTS, decodeURIComponent(req.url.slice(1))));
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not here');
  }
});

await mkdir(OUT, { recursive: true });
await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await chromium.launch();

for (const scheme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  /* THE PNG IS PHOTOGRAPHED AGAIN, rather than the site being visited a second time. The first
     version of this script did visit the site, and it caught five of the seven bands as bare
     ground and both product shots as empty frames: the bands arrive on a scroll-driven timeline
     and the pictures are lazy, and a full-page capture scrolls neither. `shot.mjs` has solved all
     of that already, so re-encoding what it wrote is one moving part instead of a second copy of
     its careful ones, and what he is sent cannot drift from what is in `shots/`. */
  await page.setContent(
    `<body style="margin:0"><img src="http://127.0.0.1:${PORT}/${NAME}-${scheme}.png" style="display:block;width:1200px"></body>`,
  );
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  const file = join(OUT, `${NAME}-${scheme}-send.jpg`);
  await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 62 });
  await page.close();
  console.log(`  ${file}`);
}

await browser.close();
server.close();
