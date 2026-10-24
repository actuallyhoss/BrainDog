/**
 * The shell drawn from the service worker's copy, in a real browser over the built app (scope 2026-10-24 A17).
 *
 * EVERY ANSWER IS HELD 400 MS, the shell, every file and every read, which is a phone a long way from the record: the
 * hashed files and the fonts are kept by the browser as the Worker's `_headers` says (`static/_headers`), and nothing
 * else. Network first, the second open waited the whole 400 ms before its first paint; drawn from the copy, it paints
 * under 150 ms. And a new build is drawn by the next open: the worker asks for the shell behind its copy, keeps the new
 * one and tells the page, which reloads onto it untouched, and the open after draws it from the start.
 *
 * Skipped, with a sentence, where there is no build (`pnpm --filter @braindog/web build`) or no browser to open.
 */

import assert from 'node:assert/strict';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { answers, forward, forwards, recordsAnswer, startRecord } from '../../../tools/gates/record.mjs';

const BUILD = fileURLToPath(new URL('../build', import.meta.url));
const SHELL = join(BUILD, 'app', 'index.html');
const HOLD_MS = 400;
const PAINT_MS = 150;
/** The screen opened: one under the app's base with no record name, so its reads go to the gates' record at `/api/`. */
const SCREEN = '/app/p/money';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const KEPT_BY_BROWSER = /^\/app\/(?:_app\/immutable|fonts)\//u;

const built = existsSync(SHELL);
let browser = null;
let record = null;
let server = null;
let origin = '';
/** What the shell carries now: a deploy is a different shell. */
let deployed = 'A';

before(async () => {
  if (!built) return;
  browser = await chromium.launch().catch(() => null);
  if (browser === null) return;
  record = await startRecord(0);
  server = createServer(async (req, res) => {
    await new Promise((r) => setTimeout(r, HOLD_MS));
    const url = new URL(req.url ?? '/', 'http://x');
    if (/^\/+account\/records\/?$/u.test(url.pathname)) {
      res.setHeader('content-type', TYPES['.json']);
      return res.end(JSON.stringify(recordsAnswer()));
    }
    if (forwards(url.pathname)) return forward(req, res, record.base);
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/u, '');
    const file = rel.includes('..') ? null : join(BUILD, rel);
    if (file !== null && extname(file) !== '' && existsSync(file)) {
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      if (KEPT_BY_BROWSER.test(url.pathname)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      return createReadStream(file).pipe(res);
    }
    if (extname(rel) !== '' && extname(rel) !== '.html') return res.writeHead(404).end();
    res.setHeader('content-type', TYPES['.html']);
    res.end(readFileSync(SHELL, 'utf8').replace('<head>', `<head><meta name="braindog-test-build" content="${deployed}">`));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  await answers(origin);
});

after(async () => {
  await browser?.close().catch(() => {});
  if (server !== null) await new Promise((r) => server.close(() => r()));
  await record?.close().catch(() => {});
});

const skip = () => (!built ? 'no build of the app to open: `pnpm --filter @braindog/web build`' : browser === null ? 'no browser to open' : false);

/** The build the page in front of us was drawn from. */
const buildOf = (page) => page.evaluate(() => document.querySelector('meta[name="braindog-test-build"]')?.getAttribute('content') ?? null);

/** Open the screen in a new tab of the context; resolves at the first contentful paint, with its time. */
async function open(context, wait = 15_000) {
  const page = await context.newPage();
  await page.goto(`${origin}${SCREEN}`, { waitUntil: 'commit' });
  const paint = await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? false, null, { timeout: wait, polling: 'raf' });
  return { page, paint: Math.round(await paint.jsonValue()) };
}

test('A SECOND OPEN PAINTS FROM THE COPY UNDER 150 MS, with every answer held 400 ms, and a new build is drawn by the next open', async (t) => {
  if (skip()) return t.skip(skip());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    /* THE FIRST OPEN registers the worker, which keeps the shell as it installs. */
    const first = await open(context, 60_000);
    await first.page.waitForSelector('main#main[data-screen]', { timeout: 60_000 });
    await first.page.evaluate(() => navigator.serviceWorker.ready);
    await first.page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
    await first.page.waitForFunction(async () => (await (await caches.open('braindog-copy')).keys()).some((k) => k.url.endsWith('/app/')), null, { timeout: 15_000 });
    assert.ok(first.paint >= HOLD_MS, `the first open waited the network (${first.paint} ms), so the hold is real`);

    const paints = [];
    for (let i = 0; i < 3; i++) {
      const again = await open(context);
      paints.push(again.paint);
      await again.page.close();
    }
    const middle = [...paints].sort((a, b) => a - b)[1];
    console.log(`  shell from the copy: first open ${first.paint} ms, then ${paints.join(', ')} ms (network held ${HOLD_MS} ms)`);
    assert.ok(middle < PAINT_MS, `a second open painted in ${middle} ms (${paints.join(', ')}), over ${PAINT_MS} ms`);

    /* A DEPLOY: the next open draws the copy at once, the worker finds the new shell behind it, and the page, untouched,
       reloads onto it; the open after that draws it from the start. */
    deployed = 'B';
    const next = await open(context);
    assert.equal(await buildOf(next.page), 'A', 'the open just after the deploy drew the copy at once');
    await next.page.waitForFunction(() => document.querySelector('meta[name="braindog-test-build"]')?.getAttribute('content') === 'B', null, { timeout: 15_000 });
    const then = await open(context);
    assert.equal(await buildOf(then.page), 'B', 'the open after drew the new build from the start');
  } finally {
    await context.close().catch(() => {});
  }
});
