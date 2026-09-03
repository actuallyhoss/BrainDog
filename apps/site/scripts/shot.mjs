/**
 * Screenshots of the built site, for a person to look at.
 *
 * It serves `build/` itself rather than borrowing `vite preview`, and that is not fussiness: preview
 * serves the dev server's own output directory, so after a rebuild it hands out an `index.html`
 * pointing at hashed chunks that no longer exist — every script 404s, nothing hydrates, and the
 * screenshot is of a page that would never ship. Serving the artefact the adapter actually wrote is
 * the only way to photograph the artefact the adapter actually wrote.
 *
 * IT TURNS LAZY LOADING OFF FIRST. Every product shot below the fold is `loading="lazy"`, and a
 * full-page capture does not scroll — so the images are never requested and the page photographs
 * with empty frames in it. That is the optimisation working, not a layout bug. Scrolling the page to
 * wake them is not enough either: the capture re-renders at full height and the decode races the
 * shutter. Setting `eager` and waiting for `decode()` is the honest fix, and it is the same move the
 * record app's shot script makes for `content-visibility` — one more reason 22 §10 keeps pixels out
 * of the gates entirely.
 *
 *   node scripts/shot.mjs
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..', 'build');
const OUT = join(import.meta.dirname, '..', 'shots');
const PORT = 5185;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  // `normalize` then reject `..`: this serves a directory to a browser on this machine, and one
  // traversal is all it takes for that to be a different sentence.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return res.writeHead(400).end();

  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = join(ROOT, candidate);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) continue;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    return createReadStream(file).pipe(res);
  }
  res.writeHead(404).end();
});

await new Promise((r) => server.listen(PORT, r));

const ROUTES = [
  ['home', '/'],
  ['pricing', '/pricing'],
  ['changelog', '/changelog'],
];

const browser = await chromium.launch();
let broken = 0;

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    colorScheme: scheme,
  });
  const page = await context.newPage();
  page.on('response', (r) => {
    if (r.status() >= 400) {
      console.error(`  ${r.status()} ${r.url()}`);
      broken++;
    }
  });

  for (const [name, path] of ROUTES) {
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (const img of document.images) img.loading = 'eager';
      // `decode()` and not `complete`: `complete` is true the moment the bytes have arrived, and a
      // full-page capture can fire between the last byte and the first painted pixel.
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    });
    await page.waitForTimeout(200);

    const file = join(OUT, `${name}-${scheme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  shots/${name}-${scheme}.png`);
  }
  await context.close();
}

await browser.close();
server.close();

if (broken > 0) {
  console.error(`\n  ${broken} request(s) failed. The build and the served directory disagree.`);
  process.exitCode = 1;
}
