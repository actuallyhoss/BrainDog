/**
 * `perf`: how fast nine screens draw, on a phone and at a desk, read from the built app over the gates' record.
 *
 *   node tools/gates/perf.mjs
 *
 * FOUR TIMES A SCREEN, because they are four different waits (`apps/web/src/lib/data/timing.ts` names the targets):
 * - first paint: the first contentful paint of a cold open, a page that has never been here;
 * - drawn: from that open until the screen's heading is up and nothing in `#main` that can be seen is still waiting
 *   (`aria-busy`; a shut panel's own skeleton is not a screen waiting);
 * - from the copy: a reload in the same browser, when the local copy of the record is already kept, which is how a
 *   person opens the app on any day after the first (the roadmap's page read, under 0.3 s for Today);
 * - a revisit: pressing Back to a screen the page already holds in memory, which the roadmap puts under 0.1 s.
 *
 * THE NINE are the screens a person opens first: Today, Needs you, a project, Projects, Money, Work, a list, Agents and
 * Settings, each at 390 and 1440 (`budgets.json` `perf`). Every number is the middle of a few runs, because one run of a
 * time is a fact about a moment and the middle of three is a fact about the build.
 *
 * ON THE GATES' RECORD WITH NO WAIT ADDED: the record answers from this machine, so what is timed is the app, its
 * script and its drawing, and not a network. A budget here is a ceiling on that, set from a measured run with room for a
 * loaded runner (`ledger.json` says when and why), and the roadmap's targets are held where the build meets them.
 *
 * THE PAGE IS LEFT ON THE RUNNER'S CLOCK (`clock: null`): pinning it (`clock.setFixedTime`) switches the browser's paint timing
 * off, so there would be no first contentful paint to read. The record is still the gates' own.
 *
 * THE MARK OF BEING DRAWN IS THE APP'S OWN: `main#main[data-screen]` with no `aria-busy` below it and a heading, the
 * same contract `lib.mjs` `readiness` waits for. A screen that never draws is a finding, never a quick pass.
 *
 * `BRAINDOG_GATE_SEED=perf` holds every script of the build back before it is served, on one screen at one width, which
 * is what a bundle that suddenly weighs a second looks like from outside; `self-test` needs it to go red.
 *
 * Returns 1 on a finding and 3 when there is no build, and falls off the end for a pass.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, STATUS_CODES } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import { APP_BASE, appShell, budget, openPage, readiness } from './lib.mjs';
import { answers, forward, forwards, recordsAnswer, startRecord } from './record.mjs';

export const needs = ['web-build'];

/**
 * The nine screens, by what a person calls them. `route` is the address under the app's base. `today` marks the one whose
 * copy-open the roadmap holds to its own number.
 */
export const SCREENS = [
  { name: 'Today', route: '/', today: true },
  { name: 'Needs you', route: '/decide' },
  { name: 'A project', route: '/p/kiln' },
  { name: 'Projects', route: '/p/portfolio' },
  { name: 'Money', route: '/p/money' },
  { name: 'Work', route: '/?work' },
  { name: 'A list', route: '/r/tasks' },
  { name: 'Agents', route: '/p/agents' },
  { name: 'Settings', route: '/settings' },
];

/** Not found, by its name: an answer's status is the protocol's word, not a number this gate chose. */
const NOT_FOUND = Number(Object.keys(STATUS_CODES).find((code) => STATUS_CODES[code] === 'Not Found'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

/**
 * Run before the page's own script on every load: stamps the moment `#main` is drawn. `before` is the heading the screen
 * had when `arm` was called, so a move is drawn only when the heading has changed.
 */
function stamp() {
  const d = { at: null, t0: 0, before: null };
  window.__perf = d;
  const heading = () => (document.querySelector('#main h1') ?? document.querySelector('h1'))?.textContent.trim() ?? null;
  const drawn = () => {
    const main = document.querySelector('main#main[data-screen]');
    const h = heading();
    return main !== null && h !== null && ![...main.querySelectorAll('[aria-busy="true"]')].some((e) => e.checkVisibility()) && (d.before === null || h !== d.before);
  };
  const tick = () => {
    if (d.at === null && drawn()) d.at = performance.now();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__arm = () => {
    d.before = heading();
    d.at = null;
    d.t0 = performance.now();
  };
}

/** The middle of an odd count of runs; of an even count, the upper of the middle two. */
const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

/** The page's own stamp, once it has one. */
const stamped = (page, when) =>
  page
    .waitForFunction(() => window.__perf?.at !== null && window.__perf?.at !== undefined, null, { timeout: budget('ready').settleTimeoutMs, polling: 'raf' })
    .catch(() => {
      throw new Error(`never drew ${when}`);
    });

/**
 * One screen opened one time: `{ paint, drawn, copy, revisit }` in milliseconds, or `{ never }` naming what did not come.
 */
async function once(browser, origin, screen, width, { record, ready }) {
  const opened = await openPage(browser, `${origin}${APP_BASE}${screen.route}`, { width, touch: width < Math.max(...budget('perf').widths), record, ready, clock: null, init: stamp });
  try {
    const where = `${screen.name} @${width}`;
    const unmeasured = ready.check(where, screen.route, opened.state);
    if (unmeasured) return { never: unmeasured };
    const { page } = opened;
    await stamped(page, 'on a cold open');
    const cold = await page.evaluate(() => ({
      paint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      drawn: window.__perf.at,
    }));
    if (cold.paint === null) return { never: `${where}  drew no first contentful paint` };

    /* A REVISIT: out to another screen of the app by a link in its own navigation, then Back. The move is timed from the
       call to the heading being the first screen's again. */
    const here = new URL(page.url()).pathname + new URL(page.url()).search;
    const links = page.locator('nav a[href^="/app"]:visible');
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    const at = hrefs.findIndex((h) => h !== here && h !== here.replace(/\?.*$/u, ''));
    if (at < 0) return { never: `${where}  has no other link in its navigation to leave by, so a revisit could not be timed` };
    await page.evaluate(() => window.__arm());
    await links.nth(at).click();
    await stamped(page, 'the screen it left by');
    const back = await page.evaluate(() => {
      window.__arm();
      const t0 = window.__perf.t0;
      history.back();
      return t0;
    });
    await stamped(page, 'on Back');
    const revisit = (await page.evaluate(() => window.__perf.at)) - back;

    /* FROM THE COPY: the same browser, the record's copy already kept by the open above. */
    await page.reload({ waitUntil: 'commit' });
    await stamped(page, 'on a reload');
    const copy = await page.evaluate(() => window.__perf.at);
    return { paint: cold.paint, drawn: cold.drawn, copy, revisit };
  } finally {
    await opened.context.close().catch(() => {});
  }
}

/** `{ screen, width, paint, drawn, copy, revisit }` for each screen at each width, every time the middle of `samples` opens. */
async function walk(root, seeded) {
  const P = budget('perf');
  const ROOT = join(root, 'apps', 'web', 'build');
  const rows = [];
  const findings = [];
  let record = null;
  let server = null;
  let browser = null;
  try {
    record = await startRecord(0);
    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (/^\/+account\/records\/?$/u.test(url.pathname)) {
        res.setHeader('content-type', TYPES['.json']);
        return res.end(JSON.stringify(recordsAnswer()));
      }
      if (forwards(url.pathname)) return forward(req, res, record.base);
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/u, '');
      for (const candidate of rel.includes('..') ? [] : [rel, `${rel}.html`, join(rel, 'index.html')]) {
        const file = join(ROOT, candidate);
        if (!(await stat(file).catch(() => null))?.isFile()) continue;
        /* THE PLANTED FAULT: every script held back before it is sent. */
        if (seeded && extname(file) === '.js') await new Promise((r) => setTimeout(r, P.seedDelayMs));
        res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
        return createReadStream(file).pipe(res);
      }
      if (Object.hasOwn(TYPES, extname(rel)) && extname(rel) !== '.html') return res.writeHead(NOT_FOUND).end();
      res.setHeader('content-type', TYPES['.html']);
      return createReadStream(appShell(ROOT)).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await answers(origin);
    const ready = readiness('perf', budget('ready').settleTimeoutMs, ROOT);
    browser = await chromium.launch();
    const widths = seeded ? P.widths.slice(0, 1) : P.widths;
    const screens = seeded ? SCREENS.slice(0, 1) : SCREENS;
    for (const width of widths) {
      for (const screen of screens) {
        const runs = [];
        for (let i = 0; i < P.samples; i++) {
          const got = await once(browser, origin, screen, width, { record, ready }).catch((e) => ({ never: `${screen.name} @${width}  threw: ${String(e?.message ?? e).split('\n')[0]}` }));
          if (got.never) {
            findings.push(got.never);
            break;
          }
          runs.push(got);
        }
        if (runs.length === P.samples)
          rows.push({ screen, width, ...Object.fromEntries(['paint', 'drawn', 'copy', 'revisit'].map((k) => [k, Math.round(median(runs.map((r) => r[k])))])) });
      }
    }
    const blind = ready.nothingDrawn();
    if (blind) findings.push(blind);
    return { rows, findings };
  } finally {
    await browser?.close().catch(() => {});
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/** Whether a run is the planted one: `perf` among the seeds named, one or several joined by commas. */
export const seededBy = (value) => String(value ?? '').split(',').some((s) => s.trim() === 'perf');

/** The findings a table of measured rows holds, each saying the number, the budget and the screen. */
export function judge(rows, P = budget('perf')) {
  const out = [];
  const over = (r, what, got, ceiling) => {
    if (got > ceiling) out.push(`${r.screen.name} @${r.width}  ${what} took ${got} ms, over its budget of ${ceiling} ms`);
  };
  for (const r of rows) {
    over(r, 'first paint', r.paint, P.paintMs);
    over(r, 'drawing', r.drawn, P.drawnMs);
    over(r, 'opening from the kept copy', r.copy, r.screen.today ? P.todayCopyMs : P.copyMs);
    over(r, 'a revisit', r.revisit, P.revisitMs);
  }
  return out;
}

export default async function perf(root = process.env.BRAINDOG_GATE_ROOT ?? join(import.meta.dirname, '..', '..')) {
  if (!(await stat(join(root, 'apps', 'web', 'build')).catch(() => null))) {
    console.log('  perf: no build to time. `pnpm build` first, and CI does.');
    return 3;
  }
  const seeded = seededBy(process.env.BRAINDOG_GATE_SEED);
  const { rows, findings } = await walk(root, seeded);
  findings.push(...judge(rows));
  const label = (r) => `${r.screen.name} @${r.width}`;
  const wide = Math.max(...rows.map((r) => label(r).length));
  for (const r of rows) console.log(`  ${label(r).padEnd(wide)} paint ${r.paint}  drawn ${r.drawn}  copy ${r.copy}  revisit ${r.revisit}`);
  if (findings.length > 0) {
    console.error(`\n  perf: ${rows.length} screen(s) timed, ${findings.length} finding(s):`);
    for (const f of findings) console.error(`    ${f}`);
    return 1;
  }
  console.log(`  perf: ${rows.length} screen(s) timed, 0 finding(s)`);
}

if (import.meta.main) process.exitCode = (await perf()) ?? 0;
