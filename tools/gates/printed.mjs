/**
 * `printed`: what a settled screen prints that a person should never read (PRF-B04 job 7).
 *
 *   node tools/gates/printed.mjs     every address the gates' record gives, drawn on its clock, at a phone's width
 *
 * THE ONE GATE THAT READS DRAWN TEXT. After a screen settles it reads the words of `#main` and the page's own errors,
 * and is red on any of:
 * - an uncaught error, or an error written to the console;
 * - the words `undefined`, `NaN`, `[object Object]` or `Invalid Date`, which are a value that never arrived;
 * - an open pair of braces, `{name}` or `{}`, a template that was printed and not filled;
 * - the page lint's own rules over the same words (`packages/render/src/lint.ts` `lintText`): a raw id (`tools#8`, a
 *   ULID, a key-shaped random string), a raw time (an ISO instant, seconds since 1970), a key where a value goes
 *   (`nav_shape`, `navShape`), a figure in double braces, an icon's name as a word, an amount cut off.
 *
 * The rules: a page prints no placeholder, raw id or raw timestamp, and a gate never invents the data it checks
 * (HD.221). So the screens are the record's, at the record's own addresses (`routes.mjs` `routesFor`), on
 * the record's clock (`lib.mjs` `openPage`), and nothing here writes an answer.
 *
 * THE COPY RULES ARE NOT READ HERE. An em dash and the words row, list item and entity are the product's copy, held in
 * the source by `em-dash` and `dead-copy`; a drawn screen also carries the person's own words, which are theirs. A run
 * handle (`S731`) beside its name is not a finding (`ids`), since that is the one id a person reads on purpose.
 *
 * TWO WAYS IN. `checkScreen` is the rule, for `layout` to call on every page-run once its lines move onto `openPage`
 * (the unit's job 5). The gate's own run draws every address once. A planted tree holds `screens/*.json`, each
 * `{ "where", "text", "errors" }` as `readScreen` captures them, and is judged without a browser.
 *
 * A FINDING QUOTES WHAT IT FOUND ONLY WHEN THAT IS SAFE TO PRINT: the lint never quotes an id, a time or a key, and
 * this gate's log is read as often as a page.
 */

import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, STATUS_CODES } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import { LINT_RULES, lintText } from '../../packages/render/src/lint.ts';
import { APP_BASE, appShell, budget, openPage, readiness } from './lib.mjs';
import { answers, forward, forwards, recordsAnswer, startRecord } from './record.mjs';
import { routesFor } from './routes.mjs';

/** The lint's rules this gate holds a screen to: every rule that is not about the product's copy. */
export const LINT_HELD = new Set(LINT_RULES.filter((r) => !r.copy).map((r) => r.rule));

/**
 * This gate's own rules, each a name and what it looks for in the words. A value that never arrived prints as one of
 * JavaScript's own words for nothing, and a template that was not filled prints its braces.
 */
export const OWN = [
  { rule: 'undefined', find: /\bundefined\b/u, said: 'prints "undefined" where a value goes' },
  { rule: 'nan', find: /\bNaN\b/u, said: 'prints "NaN" where a number goes' },
  { rule: 'object', find: /\[object Object\]/u, said: 'prints "[object Object]" where a value goes' },
  { rule: 'invalid-date', find: /\bInvalid Date\b/u, said: 'prints "Invalid Date" where a date goes' },
  { rule: 'open-braces', find: /\{\s*\}|(?<!\{)\{[A-Za-z_][\w.]*\}(?!\})/u, said: 'prints a pair of braces, a template that was never filled' },
];

/** An answer's status, by the protocol's own word for it, as `NOT_FOUND` below is read. */
const statusOf = (word) => Number(Object.keys(STATUS_CODES).find((code) => STATUS_CODES[code] === word));

/**
 * THE SELF-HOST'S OWN NO, ASKED FOR ON PURPOSE AND SAID ON THE SCREEN. The browser writes a console line for every answer
 * that is not ok, whether or not the page asked for it knowing the answer; the gates' record is a self-host, and these
 * are the answers a self-host gives by design, each a page that says what it means. Matched by status AND path, so the
 * same status anywhere else is still red, and a held list (`ledger.json` `printed.ALLOWED`): it only shrinks.
 */
export const ALLOWED = [
  {
    status: 'Not Implemented',
    path: '/api/snapshots',
    why: 'A self-host with no folder for copies says so, and Backups says it on the screen (the canary forgives the same answer).',
  },
  {
    status: 'Not Implemented',
    path: '/api/clearVaultPassphrase',
    why: "The vault switch asks whether a passphrase is on by taking one off with none (`lockOf`); a record with no key of its own answers that it cannot, and the switch says so.",
  },
  {
    status: 'Not Found',
    path: '/auth/signup/name',
    why: 'Sign-up asks the one door a stranger can ask; a self-host has no sign-up, and the page is the closed one with its way to sign in.',
  },
];

/** On an address drawn as not found on purpose (`routes.mjs` `missing`), the record's not found is the answer asked for. */
const MISSING = new Set(['Not Found', 'Unprocessable Entity'].map(statusOf));

/** The status a console line says the browser was answered with, or `null` for any other line. */
const ANSWERED = /^Failed to load resource: the server responded with a status of (\d+)\b/u;

/**
 * Every fault one settled screen prints, as the sentences this gate says. `where` names the page-run (`/usage @390`).
 *
 * `text` is the words of `#main`, `code` the words of each `pre` and `code` in it, and `errors` the page's own, `{ kind: 'uncaught' | 'console', text }`, as `openPage`
 * collects them, and `failed` each answer that was not ok, `{ status, path }`. Pure, so a test reads it without a browser
 * and `layout` can call it on every page-run.
 *
 * A CONSOLE LINE FOR AN ANSWER IS NOT A FINDING ONLY WHEN EVERY ANSWER OF THAT STATUS ON THE SCREEN WAS THE HOST'S OWN NO:
 * one `ALLOWED` names, or, with `missing` (an address drawn as not found on purpose), the record's not found to an
 * `/api/` read. One answer of that status that is neither keeps the line red.
 */
export function checkScreen({ where, text = '', code = [], errors = [], failed = [] }, { missing = false } = {}) {
  const hostsWord = (f) =>
    ALLOWED.some((a) => statusOf(a.status) === f.status && f.path.endsWith(a.path)) || (missing && MISSING.has(f.status) && f.path.includes('/api/'));
  const answered = (status) => {
    const of = failed.filter((f) => f?.status === status);
    return of.length > 0 && of.every(hostsWord);
  };
  const out = [];
  for (const e of errors) {
    const first = String(e?.text ?? '').split('\n')[0];
    const said = ANSWERED.exec(first);
    if (e?.kind === 'console' && said && answered(Number(said[1]))) continue;
    if (e?.kind === 'uncaught') out.push(`${where}  threw an uncaught error: ${first}`);
    else if (e?.kind === 'console') out.push(`${where}  wrote an error to the console: ${first}`);
  }
  /* CODE IS QUOTED, NOT PRINTED. A `pre` or `code` on a screen is a sample a person copies (the site's `/agents` shows a
     call with its braces and its keys), so its words are taken out of what the rules read, once per sample, and the
     same braces in the prose round it are still read. */
  let prose = text;
  for (const c of code) if (c) prose = prose.replace(c, '\n');
  for (const own of OWN) if (own.find.test(prose)) out.push(`${where}  ${own.said}`);
  /* THE LINT'S SENTENCE WITHOUT WHAT IT NAMED. It quotes a key spoken (`next due at`), and a key-shaped secret drawn on a
     screen is a key too: spoken, it is still the secret, in a log anybody with the run can read.
     `screen`: the words are a whole screen of parts, so `two-spellings` reads one currency spelled two ways and not an
     amount said short in a sentence beside the same amount exact on a ledger's row, which is the one writer's rule. */
  for (const f of lintText(prose, { name: where, ids: true, screen: true })) if (LINT_HELD.has(f.rule)) out.push(`${where}  ${f.said.replace(/:.*$/su, '.')} (${f.rule})`);
  return out;
}

/**
 * What one settled screen printed, for `checkScreen`: the words of `#main` and the errors `openPage` collected.
 * `innerText`, so what is hidden is not read and what is drawn is read as a person reads it, line by line.
 */
export async function readScreen(opened, where) {
  const main = opened.page.locator('main#main').first();
  const text = await main.innerText({ timeout: budget('ready').settleTimeoutMs }).catch(() => '');
  /* The outermost `pre` and `code` in it, each as it is drawn, for `checkScreen` to leave out of what it reads. */
  const code = await main
    .evaluate((el) => [...el.querySelectorAll('pre, code')].filter((c) => !c.parentElement?.closest('pre, code')).map((c) => c.innerText))
    .catch(() => []);
  return { where, text, code, errors: [...opened.errors], failed: [...(opened.failed ?? [])] };
}

/** A planted tree's folder of captured screens. Only a planted tree holds one: the repository's own root never does, so
    it is no input of a push run, and is named here so the walk in `apps/worker/scripts/gates-workflow.test.mjs` does not read it as one. */
const CAPTURED = 'screens';

/** The faults a planted tree's captured screens print, or `null` when the root holds no `screens/`. */
function fromCaptures(root) {
  let names;
  try {
    names = readdirSync(join(root, CAPTURED)).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return null;
  }
  return { screens: names.length, findings: names.flatMap((n) => checkScreen(JSON.parse(readFileSync(join(root, CAPTURED, n), 'utf8')))) };
}

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
 * Every address the gates' record gives, drawn once, and what each printed.
 *
 * AT A PHONE'S WIDTH, ONCE: the words a screen prints do not change with the width, and the narrowest judged width is
 * where a value cut short shows first. The record's own `/account/records` answer is handed back, as `record.mjs` says,
 * because the self-host would answer it 401 and the switcher's error would be a console error on every screen.
 */
async function drawn(root) {
  const ROOT = join(root, 'apps', 'web', 'build');
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
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      /* A PATH THAT CLIMBS OUT OF THE BUILD IS GIVEN THE SHELL, never a file beside it. */
      for (const candidate of rel.includes('..') ? [] : [rel, `${rel}.html`, join(rel, 'index.html')]) {
        const file = join(ROOT, candidate);
        if (!(await stat(file).catch(() => null))?.isFile()) continue;
        res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
        return createReadStream(file).pipe(res);
      }
      /* A MISSING ASSET IS NOT FOUND, never the shell, or a page asking for a chunk would be handed HTML. */
      if (Object.hasOwn(TYPES, extname(rel)) && extname(rel) !== '.html') {
        res.statusCode = NOT_FOUND;
        return res.end();
      }
      res.setHeader('content-type', TYPES['.html']);
      return createReadStream(appShell(ROOT)).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const ORIGIN = `http://127.0.0.1:${server.address().port}`;
    await answers(ORIGIN);

    const ready = readiness('printed', budget('ready').settleTimeoutMs, ROOT, { quietMs: budget('ready').quietMs });
    const { routes, unsampled, unseen, missing } = await routesFor(join(root, 'apps', 'web'), record);
    findings.push(...unsampled.map((u) => `${u}, so it was never drawn`));
    const width = Math.min(...budget('a11y').widths);
    browser = await chromium.launch();
    for (const route of routes) {
      const where = `${route} @${width}`;
      /* A LOAD THAT THROWS IS THAT SCREEN'S FINDING, and the sweep goes on: `openPage` has handed its context back. */
      const opened = await openPage(browser, `${ORIGIN}${APP_BASE}${route}`, { width, touch: true, record, ready }).catch((e) => e);
      if (opened instanceof Error) {
        findings.push(`${where}  never loaded: ${opened.message.split('\n')[0]}`);
        continue;
      }
      try {
        const unmeasured = ready.check(where, route, opened.state);
        if (unmeasured) findings.push(unmeasured);
        else findings.push(...checkScreen(await readScreen(opened, where), { missing: missing.includes(route) }));
      } finally {
        await opened.context.close().catch(() => {});
      }
    }
    const blind = ready.nothingDrawn();
    if (blind) findings.push(blind);
    return { screens: routes.length, unseen, retried: ready.retried(), findings };
  } finally {
    await browser?.close().catch(() => {});
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* THE PREREQUISITE for the drawn run, read by `run.mjs` before anything is spawned. A planted tree needs no build. */
export const needs = ['web-build'];

/**
 * THE GATE. A root holding `screens/` is a planted tree and is judged from its captures; any other root is the
 * repository, and its build is drawn. Returns 1 on a finding and 3 when there was nothing to read, and falls off the
 * end for a pass.
 */
export default async function printed(root = process.env.BRAINDOG_GATE_ROOT ?? join(import.meta.dirname, '..', '..')) {
  let read = fromCaptures(root);
  const built = read === null && (await stat(join(root, 'apps', 'web', 'build')).catch(() => null))?.isDirectory() === true;
  if (built) read = await drawn(root);
  /* EXIT 3 IS A SKIP, NOT A PASS: nothing was read, and a run that read nothing asserts nothing. */
  if (read === null || read.screens === 0) {
    console.log(
      read === null
        ? '  printed: no apps/web/build to draw and no screens captured, so nothing was read. Run `pnpm --filter @braindog/web build` first.'
        : '  printed: no screen to read, so nothing was checked.',
    );
    return 3;
  }
  const seen = read.unseen === undefined ? '' : `, ${read.unseen.length} not seen with data`;
  const again = (read.retried ?? 0) === 0 ? '' : `, ${read.retried} settled on a second look`;
  if (read.findings.length > 0) {
    console.error(`\n  printed: ${read.screens} screen(s) read${seen}${again}, ${read.findings.length} finding(s):`);
    for (const f of read.findings) console.error(`    ${f}`);
    return 1;
  }
  console.log(`  printed: ${read.screens} screen(s) read${seen}${again}, and none printed a raw id, a raw time, a key or an error.`);
}

/* STILL A SCRIPT, because `self-test` spawns this file over each planted tree. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await printed()) ?? 0;
