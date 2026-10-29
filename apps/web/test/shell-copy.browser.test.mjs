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
const SHELL = join(BUILD, 'index.html');
const HOLD_MS = 400;
const PAINT_MS = 150;
/** The screen opened: one of the app's with no record name, so its reads go to the gates' record at `/api/`. */
const SCREEN = '/p/money';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const KEPT_BY_BROWSER = /^\/(?:_app\/immutable|fonts)\//u;

const built = existsSync(SHELL);
let browser = null;
let record = null;
let server = null;
let origin = '';
/** What the shell carries now: a deploy is a different shell. */
let deployed = 'A';
/** Asks for the shell that came in, and those not answered yet: the worker's ask behind the copy, held like any other. */
let shellsAsked = 0;
let shellsOut = 0;

before(async () => {
  if (!built) return;
  browser = await chromium.launch().catch(() => null);
  if (browser === null) return;
  record = await startRecord(0);
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/u, '');
    const file = rel.includes('..') ? null : join(BUILD, rel);
    /* THE BUILD LIVE WHEN THE ASK CAME IN, as a deploy is: an ask that reached the old build is answered by it. */
    const build = deployed;
    const shell = !/^\/+account\/records\/?$/u.test(url.pathname) && !forwards(url.pathname) && !(file !== null && extname(file) !== '' && existsSync(file)) && ['', '.html'].includes(extname(rel));
    if (shell) {
      shellsAsked++;
      shellsOut++;
      res.once('close', () => shellsOut--);
    }
    await new Promise((r) => setTimeout(r, HOLD_MS));
    if (/^\/+account\/records\/?$/u.test(url.pathname)) {
      res.setHeader('content-type', TYPES['.json']);
      return res.end(JSON.stringify(recordsAnswer()));
    }
    if (forwards(url.pathname)) return forward(req, res, record.base);
    if (file !== null && extname(file) !== '' && existsSync(file)) {
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      if (KEPT_BY_BROWSER.test(url.pathname)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      return createReadStream(file).pipe(res);
    }
    if (extname(rel) !== '' && extname(rel) !== '.html') return res.writeHead(404).end();
    res.setHeader('content-type', TYPES['.html']);
    res.end(readFileSync(SHELL, 'utf8').replace('<head>', `<head><meta name="braindog-test-build" content="${build}">`));
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

/**
 * THE BUILDS A TAB DREW, IN ORDER, each written down by the document itself as it is parsed, so a reload onto a new build
 * cannot be mistaken for the first document. Read off the page after the fact it raced the worker: on a loaded machine
 * the worker found the new shell and the page had reloaded onto it before the read, and the open just after the deploy
 * read as drawn from the new build when it was drawn from the copy.
 */
const DRAWN = 'braindog-test-drawn';
function noteDrawn(key) {
  addEventListener('DOMContentLoaded', () => {
    const drawn = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    drawn.push(document.querySelector('meta[name="braindog-test-build"]')?.getAttribute('content') ?? null);
    sessionStorage.setItem(key, JSON.stringify(drawn));
  });
}

/** The builds this tab has drawn, waited for until there are at least `n`; a reload in between is waited across. */
async function drawnBy(page, n = 1) {
  const drawn = ([key, at]) => {
    const d = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    return d.length >= at ? d : false;
  };
  return (await page.waitForFunction(drawn, [DRAWN, n], { timeout: 15_000 })).jsonValue();
}

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
  await context.addInitScript(noteDrawn, DRAWN);
  try {
    /* THE FIRST OPEN registers the worker, which keeps the shell as it installs. */
    const first = await open(context, 60_000);
    await first.page.waitForSelector('main#main[data-screen]', { timeout: 60_000 });
    await first.page.evaluate(() => navigator.serviceWorker.ready);
    await first.page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
    await first.page.waitForFunction(async () => (await (await caches.open('braindog-copy')).keys()).some((k) => new URL(k.url).pathname === '/'), null, { timeout: 15_000 });
    assert.ok(first.paint >= HOLD_MS, `the first open waited the network (${first.paint} ms), so the hold is real`);

    /* THREE OPENS, AND THE MIDDLE ONE IS THE MEASURE, ASKED UP TO THREE TIMES. What is under test is where the shell came
       from, and the network cannot answer under the 400 ms it is held, so a middle under 150 ms is drawn from the copy
       whatever else the machine is doing; a round on a machine busy elsewhere is asked again, not failed. */
    const rounds = [];
    const asked = shellsAsked;
    let opens = 0;
    let middle = Infinity;
    for (let round = 0; round < 3 && middle >= PAINT_MS; round++) {
      const paints = [];
      for (let i = 0; i < 3; i++) {
        const again = await open(context);
        opens++;
        paints.push(again.paint);
        await again.page.close();
      }
      rounds.push(paints.join(', '));
      middle = Math.min(middle, [...paints].sort((a, b) => a - b)[1]);
    }
    console.log(`  shell from the copy: first open ${first.paint} ms, then ${rounds.join('; ')} ms (network held ${HOLD_MS} ms)`);
    assert.ok(middle < PAINT_MS, `a second open painted in ${middle} ms at best (${rounds.join('; ')}), over ${PAINT_MS} ms`);

    /* A DEPLOY: the next open draws the copy at once, the worker finds the new shell behind it, and the page, untouched,
       reloads onto it; the open after that draws it from the start. NOT BEFORE THE WORKER'S ASK BEHIND EACH OPEN IS IN AND
       ANSWERED: on a loaded machine the ask behind the last open was answered after the deploy, the worker kept the new
       shell, and the open after the deploy drew the new one from the copy, which is right of the worker and not this case. */
    for (const until = Date.now() + 15_000; (shellsAsked < asked + opens || shellsOut > 0) && Date.now() < until; ) await new Promise((r) => setTimeout(r, 20));
    deployed = 'B';
    const next = await open(context);
    assert.equal((await drawnBy(next.page))[0], 'A', 'the open just after the deploy drew the copy at once');
    assert.deepEqual(await drawnBy(next.page, 2), ['A', 'B'], 'and reloaded onto the new build once');
    const then = await open(context);
    assert.deepEqual(await drawnBy(then.page), ['B'], 'the open after drew the new build from the start');
  } finally {
    await context.close().catch(() => {});
  }
});
