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
 *   node apps/site/scripts/send-shot.mjs /pricing   any route the built site serves
 *
 * It writes into `%TEMP%/braindog-loop/` and prints the paths, because these are for sending once
 * and not for keeping.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..', 'build');
const OUT = join(process.env.TEMP ?? '/tmp', 'braindog-loop');
const ROUTE = process.argv[2] ?? '/';
const PORT = 5178;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not here');
  }
});

await mkdir(OUT, { recursive: true });
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch();
const name = ROUTE.replaceAll('/', '') || 'home';

for (const scheme of ['dark', 'light']) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: scheme,
  });
  await page.goto(`http://127.0.0.1:${PORT}${ROUTE}`, { waitUntil: 'networkidle' });
  /* The ledger animates for four seconds and the reveals are scroll-driven, so a shot taken on
     `networkidle` catches the page mid-move. This is the same wait `shot.mjs` takes. */
  await page.waitForTimeout(1600);
  const file = join(OUT, `${name}-${scheme}-send.jpg`);
  await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 60 });
  await page.close();
  console.log(`  ${file}`);
}

await browser.close();
server.close();
