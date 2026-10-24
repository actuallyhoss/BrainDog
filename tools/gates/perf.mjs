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
 * AND HOW MANY READS A COLD OPEN ASKS, with their bytes (scope 2026-10-24 A6): every `/api/` answer the page fetched from
 * the open until it went quiet (`html[data-quiet]`), read off the browser's own resource timing. Each screen is held to
 * `callsMax`, the most it was measured asking, so a tile that starts asking the record again is red here before it
 * reaches his record. The count only falls. AND NO READ TWICE: every read asked is counted by what it asked, inside a
 * `reads` or alone, and one asked twice with the same arguments in one open is a finding, the version poll aside.
 *
 * `BRAINDOG_GATE_SEED=perf` holds every script of the build back before it is served, on one screen at one width, which
 * is what a bundle that suddenly weighs a second looks like from outside; `self-test` needs it to go red.
 * `BRAINDOG_GATE_SEED=perf-reads` asks each of Today's reads twice, which is what duplicated reads look like from
 * outside, and the gate must say Today asked more reads than its budget.
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
  /* ROOM FOR EVERY READ IN THE BROWSER'S TIMING: its buffer holds 250 entries by default, and a cold open's modules
     fill it before the screen's reads are asked, so they were never counted. */
  performance.setResourceTimingBufferSize(Number.MAX_SAFE_INTEGER);
  /* EVERY READ ASKED, ONE A LINE, inside a `reads` or by itself: what the record is asked, whichever way it travels. */
  const asked = [];
  window.__asked = asked;
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      const m = /\/api\/([A-Za-z][A-Za-z0-9/]*)$/u.exec(url.pathname);
      const body = typeof init?.body === 'string' ? init.body : '';
      if (m !== null && m[1] === 'reads') for (const c of JSON.parse(body).calls ?? []) asked.push(`${c.method} ${JSON.stringify(c.args ?? {})}`);
      else if (m !== null) asked.push(`${m[1]} ${url.search}${body}`);
    } catch {
      /* A request this cannot read is the page's own business; it is still counted by the browser's timing. */
    }
    return real(input, init);
  };
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

/**
 * THE PLANTED DUPLICATE (`perf-reads`): every read sent as a GET, and every `reads`, is sent a second time and its
 * answer dropped, which is what tiles asking for themselves what the screen already holds look like to the record. Every one and not a single
 * read, because a cold open's count moves by one or two between runs (a version poll, a presence beat), and a fault
 * the gate is sure to see is one far past that.
 */
function twice() {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    /* The copy's body is read, or the browser never finishes the answer and its timing never counts it. */
    if ((method === 'GET' && /\/api\/[A-Za-z]/u.test(url)) || /\/api\/reads$/u.test(url)) void real(input, init).then((r) => r.arrayBuffer()).catch(() => {});
    return real(input, init);
  };
}

/** The reads a page asked, by the browser's own resource timing: `{ calls, bytes, by }`, `by` counting each method. */
function readsIn() {
  const by = {};
  let bytes = 0;
  let calls = 0;
  for (const e of performance.getEntriesByType('resource')) {
    const m = /\/api\/([A-Za-z][A-Za-z0-9/]*)$/u.exec(new URL(e.name).pathname);
    if (m === null) continue;
    calls += 1;
    bytes += e.decodedBodySize;
    by[m[1]] = (by[m[1]] ?? 0) + 1;
  }
  return { calls, bytes, by, asked: [...(window.__asked ?? [])] };
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
async function once(browser, origin, screen, width, { record, ready, reads }) {
  const init = reads ? `(${stamp})();(${twice})();` : stamp;
  const opened = await openPage(browser, `${origin}${APP_BASE}${screen.route}`, { width, touch: width < Math.max(...budget('perf').widths), record, ready, clock: null, init });
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
    /* THE READS OF THE COLD OPEN, counted once the page is at rest: what it asked to draw this screen and nothing after. */
    await page.waitForSelector('html[data-quiet]', { state: 'attached', timeout: budget('ready').quietMs }).catch(() => null);
    const asked = await page.evaluate(readsIn);

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
    return { paint: cold.paint, drawn: cold.drawn, copy, revisit, calls: asked.calls, bytes: asked.bytes, by: asked.by, asked: asked.asked };
  } finally {
    await opened.context.close().catch(() => {});
  }
}

/** `{ screen, width, paint, drawn, copy, revisit }` for each screen at each width, every time the middle of `samples` opens. */
async function walk(root, seeded, reads = false) {
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
    const widths = seeded || reads ? P.widths.slice(0, 1) : P.widths;
    const screens = seeded || reads ? SCREENS.slice(0, 1) : SCREENS;
    for (const width of widths) {
      for (const screen of screens) {
        const runs = [];
        for (let i = 0; i < P.samples; i++) {
          const got = await once(browser, origin, screen, width, { record, ready, reads }).catch((e) => ({ never: `${screen.name} @${width}  threw: ${String(e?.message ?? e).split('\n')[0]}` }));
          if (got.never) {
            findings.push(got.never);
            break;
          }
          runs.push(got);
        }
        /* TIMES ARE THE MIDDLE RUN'S; READS ARE THE MOST ANY RUN ASKED, because a read asked once in three is still asked. */
        const most = runs.reduce((a, r) => (r.calls > a.calls ? r : a), runs[0]);
        if (runs.length === P.samples)
          rows.push({ screen, width, ...Object.fromEntries(['paint', 'drawn', 'copy', 'revisit'].map((k) => [k, Math.round(median(runs.map((r) => r[k])))])), calls: most.calls, bytes: Math.max(...runs.map((r) => r.bytes)), by: most.by, asked: most.asked });
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

/** Whether a run is the planted one: `perf` (or `name`) among the seeds named, one or several joined by commas. */
export const seededBy = (value, name = 'perf') => String(value ?? '').split(',').some((s) => s.trim() === name);

/** The poll, which asks on a clock and not because a screen wants something: never a read asked twice. */
const POLLS = new Set(['version']);

/** The reads a cold open asked more than once with the same arguments, the poll aside: `[read, times]`. */
export function twiceAsked(asked = []) {
  const seen = new Map();
  for (const a of asked) if (!POLLS.has(a.split(' ')[0])) seen.set(a, (seen.get(a) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1);
}

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
    const most = P.callsMax?.[r.screen.name];
    if (most === undefined) out.push(`${r.screen.name} @${r.width}  has no reads budget in perf.callsMax`);
    else if (r.calls > most) out.push(`${r.screen.name} @${r.width}  asked ${r.calls} reads, over its budget of ${most} (${Object.entries(r.by).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    /* A SCREEN ASKS NO READ TWICE (scope 2026-10-24 A11): one tile asking what another already asked is the record's
       time spent twice, and the first sign of a screen that has started asking for itself again. */
    for (const [read, n] of twiceAsked(r.asked)) out.push(`${r.screen.name} @${r.width}  asked ${read.slice(0, 120)} ${n} times in one open`);
  }
  return out;
}

export default async function perf(root = process.env.BRAINDOG_GATE_ROOT ?? join(import.meta.dirname, '..', '..')) {
  if (!(await stat(join(root, 'apps', 'web', 'build')).catch(() => null))) {
    console.log('  perf: no build to time. `pnpm build` first, and CI does.');
    return 3;
  }
  const seeded = seededBy(process.env.BRAINDOG_GATE_SEED);
  const reads = seededBy(process.env.BRAINDOG_GATE_SEED, 'perf-reads');
  const { rows, findings } = await walk(root, seeded, reads);
  findings.push(...judge(rows));
  const label = (r) => `${r.screen.name} @${r.width}`;
  const wide = Math.max(...rows.map((r) => label(r).length));
  for (const r of rows) console.log(`  ${label(r).padEnd(wide)} paint ${r.paint}  drawn ${r.drawn}  copy ${r.copy}  revisit ${r.revisit}  reads ${r.calls} (${r.bytes} bytes)`);
  if (findings.length > 0) {
    console.error(`\n  perf: ${rows.length} screen(s) timed, ${findings.length} finding(s):`);
    for (const f of findings) console.error(`    ${f}`);
    return 1;
  }
  console.log(`  perf: ${rows.length} screen(s) timed, 0 finding(s)`);
}

if (import.meta.main) process.exitCode = (await perf()) ?? 0;
