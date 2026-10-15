/**
 * Money's Where it went, walked in a real browser: open Money on a fresh record, find the folded heading, open it.
 *
 *   node tools/gates/walks/money-where.walk.mjs
 *
 * WHY THIS EXISTS (PGS-C20's guard). The declaration's test (`packages/seed/test/money-where-it-went.test.ts`) holds the
 * three blocks, their order and what each reads, through the record. NOTHING HAD LOOKED AT THEM. A folded heading the
 * app draws open, or draws shut and never opens, or a page that drops the last blocks of a long declaration, passes
 * every one of those tests, and the first person to find it would be the person whose money it is.
 *
 * WHAT IT WALKS, in PGS-C20's own words: on a fresh record with Money, one account and twelve entries this month, five
 * of them with no category from two payees, open Money. The heading Where it went is on the page, shut: what is under it
 * is not in sight. Pressed, it opens on This month, by category and No category yet, by who was paid. At the phone's
 * width and the desk's. The desk is the gates' own (`WIDTHS` says why it is 1512 and not the 1440 the scope names).
 *
 * TWO HALVES, as `row-drawer.walk.mjs` has. `judge` is a pure function of what was read, so each promise taken away is
 * red in the words of what was missing; the drive below it only presses and reads.
 *
 * NO BUILD, NO RUN. It says it walked nothing and returns 3, which `run.mjs` counts as a skip and never as a pass. ITS
 * OWN EPHEMERAL PORT (`server.listen(0)`), and every handle it opens is given back in one `finally`.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, STATUS_CODES } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import { APP_BASE, appShell, budget, openPage, readiness } from '../lib.mjs';
import { answers, forward, forwards, serverKeyFor, startRecord } from '../record.mjs';

/* THE PREREQUISITE IS THE RUNNER'S QUESTION (`52 §5.1` step 2): it reads this line before it calls the walk. */
export const needs = ['web-build'];

/** The phone's width and the desk's, the two every screen is audited at (`budgets.json`, `a11y.widths`). */
export const WIDTHS = budget('a11y').widths;

/** The folded heading and the two blocks under it, in the words the page declares them. */
export const HEADING = 'Where it went';
export const UNDER = ['This month, by category', 'No category yet, by who was paid'];

/** Two invented payees for what nobody filed, and one for what was filed. */
const PAYEES = { larger: 'Saltmarsh Labs', smaller: 'Orchardline', filed: 'Brightwell' };

/**
 * The twelve entries, each with how many days before the record's own day it was spent (never before the first of
 * the month, `writeMoney` clamps it) and its payee; `filed` says whether it has a category.
 *
 * A PENNY EACH. The walk reads headings and never a sum (the declaration's test holds the sums, to the penny), so no
 * amount here is one a reader has to check, and the larger payee is larger by its three entries to the other's two.
 * It also keeps the file free of numbers a gate would have to carry (`ledger.mjs`).
 */
const filed = (ago) => ({ ago, payee: PAYEES.filed, filed: true });
const unfiled = (ago, payee) => ({ ago, payee, filed: false });
export const ENTRIES = [
  ...[0, 1, 0, 1, 0, 1, 0].map(filed),
  ...[0, 1, 0].map((ago) => unfiled(ago, PAYEES.larger)),
  ...[1, 0].map((ago) => unfiled(ago, PAYEES.smaller)),
];

/** A penny, in pence: every amount the walk writes. */
const PENNY = { amount: 1, currency: 'GBP' };

/**
 * What one walk fell short of, each as a sentence that starts with its width. An empty list is a pass.
 *
 * `seen` is `{ width, heading, before: { [heading]: visible }, after: { [heading]: visible } }`.
 */
export function judge(seen) {
  const out = [];
  const say = (line) => out.push(`${seen.width}: ${line}`);
  if (seen.heading !== true) {
    say(`Money draws no heading "${HEADING}" with twelve entries this month and five of them unfiled.`);
    return out;
  }
  for (const h of UNDER) {
    if (seen.before?.[h] === true) say(`"${h}" is in sight before "${HEADING}" is pressed, so the heading is not folded.`);
    if (seen.after?.[h] !== true) say(`"${h}" is not in sight after "${HEADING}" is pressed.`);
  }
  return out;
}

/** One write through the record's own door with the gate's key, as a person's own writes are. Its new entry's id. */
async function create(record, register, fields) {
  const said = await fetch(new URL('/api/create', record.base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${serverKeyFor(record.base)}` },
    body: JSON.stringify({ register, fields }),
  })
    .then((r) => r.json())
    .catch(() => null);
  if (said?.ok !== true) throw new Error(`the record would not take a new entry in ${register}: ${said?.refusal?.fix ?? 'it did not answer'}`);
  return said.value.id;
}

/** One bank account, one category and the twelve entries, every one of them this month by the record's own day. */
async function writeMoney(record) {
  const today = new Date(record.now);
  const day = (ago) => {
    const d = new Date(today);
    d.setUTCDate(Math.max(1, today.getUTCDate() - ago));
    return d.toISOString().split('T')[0];
  };
  const account = await create(record, 'accounts', { name: 'Harbourline Bank current account', kind: 'bank', balance: PENNY, as_of: day(0), liquid: true });
  const category = await create(record, 'categories', { name: 'Groceries', direction: 'out', state: 'live' });
  for (const e of ENTRIES)
    await create(record, 'transactions', {
      what: 'Card payment',
      on: day(e.ago),
      direction: 'out',
      amount: PENNY,
      account,
      state: 'cleared',
      transfer: false,
      payee: e.payee,
      ...(e.filed ? { category } : {}),
    });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const NOT_FOUND = Number(Object.keys(STATUS_CODES).find((code) => STATUS_CODES[code] === 'Not Found'));

/** The build's own files, the record's doors handed to the record, and the app's shell for every other address. */
function serve(ROOT, record) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (forwards(url.pathname)) return forward(req, res, record.base);
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    for (const candidate of rel.includes('..') ? [] : [rel, `${rel}.html`, join(rel, 'index.html')]) {
      const file = join(ROOT, candidate);
      if (!(await stat(file).catch(() => null))?.isFile()) continue;
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      return createReadStream(file).pipe(res);
    }
    if (Object.hasOwn(TYPES, extname(rel)) && extname(rel) !== '.html') {
      res.statusCode = NOT_FOUND;
      return res.end();
    }
    res.setHeader('content-type', TYPES['.html']);
    return createReadStream(appShell(ROOT)).pipe(res);
  });
}

/** Whether each of `UNDER` is in sight, read off the page by its words. */
const sight = async (page) => Object.fromEntries(await Promise.all(UNDER.map(async (h) => [h, await page.getByText(h, { exact: true }).first().isVisible().catch(() => false)])));

/** One walk at one width: find the heading, read what is in sight, press it, read again. Nothing here decides. */
async function walk(page, seen, timeout) {
  const heading = page.getByText(HEADING, { exact: true }).first();
  seen.heading = await heading.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
  if (!seen.heading) return;
  seen.before = await sight(page);
  await heading.click();
  await page.getByText(UNDER[0], { exact: true }).first().waitFor({ state: 'visible', timeout }).catch(() => {});
  seen.after = await sight(page);
}

/** THE WHOLE WALK, AS A FUNCTION THE RUNNER CALLS. It returns 1 or 3 and falls off the end for a pass. */
export default async function moneyWhere(root = join(import.meta.dirname, '..', '..', '..')) {
  const ROOT = join(root, 'apps', 'web', 'build');
  if (!(await stat(ROOT).catch(() => null))?.isDirectory()) {
    console.log('  money-where: no apps/web/build to walk, so nothing was opened. Run `pnpm --filter @braindog/web build` first.');
    return 3;
  }
  const findings = [];
  let record = null;
  let server = null;
  let browser = null;
  try {
    record = await startRecord(0, { fresh: true });
    await writeMoney(record);
    server = serve(ROOT, record);
    await new Promise((r) => server.listen(0, r));
    const ORIGIN = `http://127.0.0.1:${server.address().port}`;
    await answers(ORIGIN);
    const ready = readiness('money-where', budget('ready').settleTimeoutMs, ROOT);
    browser = await chromium.launch();
    for (const width of WIDTHS) {
      const seen = { width, heading: false, before: {}, after: {} };
      let opened = null;
      try {
        opened = await openPage(browser, `${ORIGIN}${APP_BASE}/p/money`, { width, record, ready, waitUntil: 'networkidle' });
        const unmeasured = ready.check(`money-where /p/money at ${width}`, '/p/money', opened.state);
        if (unmeasured) findings.push(unmeasured);
        await walk(opened.page, seen, budget('ready').settleTimeoutMs);
        for (const e of opened.errors.filter((e) => e.kind === 'uncaught')) findings.push(`${width}: the page threw while it was walked: ${e.text.split('\n')[0]}`);
      } catch (e) {
        findings.push(`${width}: the walk stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      } finally {
        await opened?.context.close().catch(() => {});
      }
      findings.push(...judge(seen));
    }
    const blind = ready.nothingDrawn();
    if (blind) findings.push(blind);
    if (findings.length === 0) {
      console.log(`money-where: at ${WIDTHS.join(' and ')}, Money drew ${HEADING} shut, and pressed it opened on ${UNDER.join(' and ')}.`);
    } else {
      console.error('\n  Money\'s Where it went, walked in a real browser:');
      for (const f of findings) console.error(`      ${f}`);
      return 1;
    }
  } finally {
    await browser?.close().catch(() => {});
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* AND IT IS STILL A SCRIPT, for a person running the file by hand. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await moneyWhere()) ?? 0;
