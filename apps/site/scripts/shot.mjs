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
import { readdir, stat } from 'node:fs/promises';
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

/**
 * EVERY ROUTE THE BUILD HAS, READ FROM THE BUILD AND NOT TYPED HERE.
 *
 * The list was typed, and it was six routes on a site that now has twenty: `/slash`, `/packs`, the
 * five `/for/` pages, `/docs`, `/support` and `/security` had never been photographed, and a page
 * nobody looks at is a page nobody notices has stopped matching the rest of the site. Every `.html`
 * the adapter wrote is a page a stranger can reach, so that is the list, and a page added tomorrow is
 * in the next run without anyone remembering to add it.
 *
 * ONE PAGE PER ROUTE WITH A PARAMETER. `/packs/[id]`, `/docs/[section]/[slug]` and `/legal/[name]`
 * each prerender a page per value from one template, and forty shots of one template teach nothing
 * the first does not. The templates are read from `src/routes`, and the first built page of each (in
 * sorted order, so the same one every run) stands for the rest.
 */
const ROUTES = await (async () => {
  const slash = (f) => f.replaceAll('\\', '/');
  const templates = (await readdir(join(import.meta.dirname, '..', 'src', 'routes'), { recursive: true }))
    .map(slash)
    .filter((f) => f.endsWith('+page.svelte') && f.includes('['))
    .map((f) => new RegExp(`^/${f.slice(0, -'/+page.svelte'.length).replace(/\[[^\]]+\]/g, '[^/]+')}$`));
  const pages = (await readdir(ROOT, { recursive: true }))
    .map(slash)
    .filter((f) => f.endsWith('.html'))
    .map((f) => `/${f.slice(0, -'.html'.length).replace(/(^|\/)index$/, '')}`)
    .sort();
  const seen = new Set();
  const routes = [];
  for (const path of pages) {
    const template = templates.find((t) => t.test(path));
    if (template && seen.has(template)) continue;
    if (template) seen.add(template);
    routes.push([path === '/' ? 'home' : path.slice(1).replaceAll('/', '-'), path]);
  }
  return routes;
})();

/**
 * TWO WIDTHS, BECAUSE HE READS THIS ON A PHONE AND THE PAGE WAS ONLY EVER PHOTOGRAPHED ON A DESKTOP.
 *
 * 1440 is the width the design is drawn at and 390 is an iPhone. A marketing page that has never
 * been photographed narrow is one whose narrow layout nobody has looked at, and the first thing a
 * stranger does with a link is open it on the device in their hand. `deviceScaleFactor` stays at 1.5
 * for both, so a phone shot is legible when it is opened on a phone.
 */
const WIDTHS = [
  ['', 1440],
  ['-390', 390],
];

const browser = await chromium.launch();
let broken = 0;

for (const [suffix, width] of WIDTHS)
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1.5,
    colorScheme: scheme,
    /**
     * AND NO ENTRANCE ANIMATIONS, which is what `product.mjs` beside this file has always said and
     * this one did not.
     *
     * The home page's sections arrive on a `view()` timeline now, and a FULL-PAGE capture does not
     * resolve one: Playwright photographs the whole document against a 900px viewport, so every
     * band below the fold is still at its first keyframe and the review shot comes out of the
     * oven at forty per cent opacity. Nothing is wrong with the page: a reader scrolling sees
     * every section at full strength, measured. But a screenshot tool that lies about the page is
     * worse than no screenshot tool.
     *
     * `reducedMotion` and not a stylesheet injection, because the page already answers that
     * question correctly: the arrival is inside `prefers-reduced-motion: no-preference` and is
     * absent rather than damped under the other branch.
     */
    reducedMotion: 'reduce',
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
      /* WAIT FOR `load` BEFORE `decode`, which is the bit that was missing and the reason three of
         the five product shots photographed as empty boxes. Flipping `loading` to `eager` starts
         the fetch, but it starts it ASYNCHRONOUSLY — and `decode()` on an image that has not begun
         loading REJECTS. The rejection went into a `.catch(() => {})` written to ignore a broken
         file, so the script sailed past three unloaded images and photographed the reserved boxes
         `Shot.svelte` had helpfully laid out for them. */
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await Promise.all(
        [...document.images].map(
          (img) =>
            new Promise((res) => {
              if (img.complete && img.naturalWidth > 0) return res(undefined);
              img.addEventListener('load', () => res(undefined), { once: true });
              img.addEventListener('error', () => res(undefined), { once: true });
            }),
        ),
      );
      // `decode()` and not `complete`: `complete` is true the moment the bytes have arrived, and a
      // full-page capture can fire between the last byte and the first painted pixel.
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    });
    await page.waitForTimeout(200);

    /* AND THEN CHECK. A screenshot script that silently ships a blank frame is worse than one that
       fails, because the blank frame goes on the marketing page and nothing says so. */
    const blank = await page.evaluate(() =>
      [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
    );
    if (blank.length) {
      console.error(`  ${blank.length} image(s) never loaded on ${path}:`);
      for (const b of blank) console.error(`      ${b}`);
      broken += blank.length;
    }

    /* AND A PAGE WIDER THAN THE SCREEN IS SAID OUT LOUD. A full-page capture is as wide as the
       viewport, so a row that runs off the side at 390 is cut from the picture rather than shown in
       it, and the one fault a phone reader meets first would be the one the shots hide. */
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    /* One pixel of slack, the layout gate's own, for a width that rounds up at a device scale of 1.5. */
    if (wide > 1) {
      console.error(`  ${path} scrolls sideways by ${wide}px at ${width}.`);
      broken++;
    }

    const file = join(OUT, `${name}-${scheme}${suffix}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  shots/${name}-${scheme}${suffix}.png`);
  }
  await context.close();
}

await browser.close();
server.close();

if (broken > 0) {
  console.error(`\n  ${broken} fault(s) above: a failed request, an image that never loaded, or a page wider than the screen.`);
  process.exitCode = 1;
}
