/**
 * The night's speed measure: how fast the live six open on a real record, and how many reads each one asks, read-only.
 *
 *   node tools/look/nightly.mjs [--source live:<record>|seed] [--out <file>] [--check] [--runs <n>]
 *
 * WHY: the perf gate times the app over the gates' own seed on this machine, with no network in between, so it cannot
 * say what his record costs from Cairo. This walks the same six screens a look draws (`screens.mjs` `six`), at the
 * phone and the laptop (`speed.widths`), through the look's forwarder that cannot press (`sources/live.mjs`), so
 * nothing is ever written to the record it reads.
 *
 * EACH SCREEN IS OPENED TWICE IN ONE BROWSER: cold (a new context, nothing kept) and warm (the same context again, the
 * tab's copy and the record's kept reads in place, which is how a person opens the app on any day after the first).
 * For each it keeps:
 * - `settleMs`: from the open until `main#main[data-screen]` says what the screen settled into;
 * - `quietMs`: until `html[data-quiet]`, no call out and none promised, capped at `speed.quietCapMs`;
 * - `calls`: every `/api/<method>` the page asked, by method, and their total; refused ones are counted apart;
 * - `bytes`: the decoded size of every answer it read;
 * - `rec`: the record's own time for each call, from its `Server-Timing` (`rec;dur=`), when the host says it.
 *
 * `--check` judges the warm Today against `speed.todaySettleMs` and exits 1 when it is over, so a launchd job can say a
 * slow night without anyone reading the file. The file is `loop/proof/speed/<date>.json` unless `--out` names another.
 *
 * THE LAUNCHD JOB, at 04:30 on the Mac's own clock (Cairo): `node tools/look/nightly.mjs --plist >
 * ~/Library/LaunchAgents/dog.brain.speed.plist` writes it with this checkout's path and this Node, and
 * `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dog.brain.speed.plist` starts it. No path of anybody's
 * machine is kept in the repository. The job builds the app first when the build is older than the tree, and says
 * each night in `.ship/logs/speed-nightly.log`.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, env as processEnv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

import { chromium } from '@playwright/test';

import { appShell, budget, webBuildUnmet } from '../gates/lib.mjs';
import { answers } from '../gates/record.mjs';
import { asker } from './capture.mjs';
import { ROOT, openSource, serve } from './run.mjs';
import { pick, screensOf } from './screens.mjs';

/** `--flag value` and `--flag=value`; a flag this command does not take is a refusal. */
export function parse(args) {
  const out = { check: false, plist: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--check' || args[i] === '--plist') {
      out[args[i].slice(2)] = true;
      continue;
    }
    const m = /^--(source|out|runs)(?:=(.*))?$/u.exec(args[i]);
    if (m === null) throw new Error(`The night's measure takes --source, --out, --runs and --check, and not ${args[i]}.`);
    out[m[1]] = m[2] ?? args[(i += 1)];
  }
  const raw = out.source ?? 'live:sam';
  const colon = raw.indexOf(':');
  return { source: { name: colon === -1 ? raw : raw.slice(0, colon), arg: colon === -1 ? undefined : raw.slice(colon + 1) }, out: out.out, check: out.check, plist: out.plist, runs: Number(out.runs ?? 1) };
}

/** The launchd job for this checkout and this Node: every night at 04:30, read-only, `--check` so a slow night exits 1. */
export function plist(root = ROOT, node = process.execPath) {
  const log = join(root, '.ship', 'logs', 'speed-nightly.log');
  const esc = (t) => t.replace(/&/gu, '&amp;').replace(/</gu, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dog.brain.speed</string>
  <key>ProgramArguments</key>
  <array><string>${esc(node)}</string><string>${esc(join(root, 'tools', 'look', 'nightly.mjs'))}</string><string>--check</string></array>
  <key>WorkingDirectory</key><string>${esc(root)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${esc(dirname(node))}:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>${esc(log)}</string>
  <key>StandardErrorPath</key><string>${esc(log)}</string>
</dict>
</plist>
`;
}

/** The method an address asks, `/api/list` and `/app/<slug>/api/list` alike, or `null` for anything else. */
export const methodOf = (pathname) => /\/api\/([A-Za-z][A-Za-z0-9/]*)$/u.exec(pathname)?.[1] ?? null;

/** The record's own time in a `Server-Timing` header (`rec;dur=12.3`), or `null`. */
export const recOf = (header) => {
  const m = /(?:^|,)\s*rec;dur=([0-9.]+)/u.exec(header ?? '');
  return m === null ? null : Number(m[1]);
};

/** The middle of a list of numbers, or `null` for none. */
const median = (xs) => (xs.length === 0 ? null : [...xs].sort((a, b) => a - b)[xs.length >> 1]);

/**
 * Run before the page's own script on every load: the moment the screen says it settled and the last moment after it
 * that the page went quiet for good, from the navigation's start, so the times are not rounded to a wait's polling step.
 */
export function stamp() {
  const d = { drawn: null, quiet: null, was: false };
  window.__speed = d;
  /* THE LAST TIME THE PAGE WENT QUIET, not the first: a tile's later wave takes the mark off again, and the screen is
     at rest only once the last call it asked has landed. */
  const look = () => {
    const now = Math.round(performance.now());
    if (d.drawn === null && document.querySelector('main#main[data-screen]') !== null) d.drawn = now;
    const quiet = document.documentElement.hasAttribute('data-quiet');
    if (d.drawn !== null && quiet && (!d.was || d.quiet === null)) d.quiet = now;
    d.was = quiet;
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-screen', 'data-quiet'] });
}

/** What one read asked for, for the file: a list by its register, a page by its slug, anything else by its method. */
export function whatOf(name, request) {
  let args = {};
  try {
    const url = new URL(request.url());
    args = Object.fromEntries(url.searchParams);
    const body = request.postData();
    if (body) args = { ...args, ...JSON.parse(body) };
  } catch {
    /* A body that is not JSON is asked by its method alone. */
  }
  const of = args.register ?? args.slug ?? args.metric ?? args.name ?? null;
  const limit = args.limit === undefined ? '' : ` ${args.limit}`;
  return of === null ? name : `${name}:${String(of).slice(0, 48)}${limit}`;
}

/** One open of one screen in a page: what it cost, read from the page's own requests. */
async function open(page, url, quietCapMs, timeoutMs) {
  const calls = {};
  const refused = {};
  const asked = {};
  const recs = [];
  let bytes = 0;
  let total = 0;
  const pending = [];
  const onResponse = (r) => {
    const name = methodOf(new URL(r.url()).pathname);
    if (name === null) return;
    total += 1;
    const what = whatOf(name, r.request());
    if (what !== null) asked[what] = (asked[what] ?? 0) + 1;
    if (r.status() === 403) refused[name] = (refused[name] ?? 0) + 1;
    else calls[name] = (calls[name] ?? 0) + 1;
    const rec = recOf(r.headers()['server-timing']);
    if (rec !== null) recs.push(rec);
    pending.push(
      r.body().then(
        (b) => {
          bytes += b.length;
        },
        () => {},
      ),
    );
  };
  page.on('response', onResponse);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  const settled = await page.waitForSelector('main#main[data-screen]', { timeout: timeoutMs }).then(
    () => Date.now() - t0,
    () => null,
  );
  /* The mark is put on and taken off as calls come and go, so the first quiet after the screen is drawn is the one read. */
  const quiet = await page.waitForSelector('html[data-quiet]', { state: 'attached', timeout: quietCapMs }).then(
    () => Date.now() - t0,
    () => null,
  );
  /* Reads a screen asks after it is quiet (a tile's late wave) still count against it, so a short rest is kept. */
  await page.waitForTimeout(budget('speed').restMs);
  page.off('response', onResponse);
  await Promise.all(pending);
  const state = await page.evaluate(() => document.querySelector('main#main')?.getAttribute('data-screen') ?? null).catch(() => null);
  const stamps = await page.evaluate(() => window.__speed ?? null).catch(() => null);
  return { state, settleMs: stamps?.drawn ?? settled, quietMs: stamps?.quiet ?? quiet, calls: Object.values(calls).reduce((a, b) => a + b, 0), asked, refused: Object.values(refused).reduce((a, b) => a + b, 0), byMethod: calls, refusedBy: refused, bytes, recMedianMs: median(recs), recMaxMs: recs.length === 0 ? null : Math.max(...recs), all: total };
}

/** The night's rows: each of the six at each width, cold then warm, `runs` times over, the middle of each kept. */
export async function walk({ app, screens, widths, runs }) {
  const S = budget('speed');
  const timeoutMs = budget('ready').settleTimeoutMs;
  const height = budget('layout').viewportHeightPx;
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const width of widths)
      for (const screen of screens) {
        const tries = { cold: [], warm: [] };
        for (let i = 0; i < runs; i += 1) {
          const phone = width < 600;
          const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
          await context.addInitScript(stamp);
          const page = await context.newPage();
          try {
            tries.cold.push(await open(page, `${app}${screen.path}`, S.quietCapMs, timeoutMs));
            tries.warm.push(await open(page, `${app}${screen.path}`, S.quietCapMs, timeoutMs));
          } finally {
            await context.close();
          }
        }
        for (const kind of ['cold', 'warm']) {
          const got = tries[kind];
          const mid = (k) => median(got.map((g) => g[k]).filter((v) => v !== null));
          const last = got.at(-1);
          rows.push({ screen: screen.key, route: screen.path, width, kind, state: last.state, settleMs: mid('settleMs'), quietMs: mid('quietMs'), calls: mid('calls'), refused: mid('refused'), bytes: mid('bytes'), recMedianMs: mid('recMedianMs'), recMaxMs: mid('recMaxMs'), byMethod: last.byMethod, refusedBy: last.refusedBy, asked: last.asked });
          console.log(`  ${screen.key} @${width} ${kind}: settle ${rows.at(-1).settleMs ?? 'never'} ms, quiet ${rows.at(-1).quietMs ?? 'never'} ms, ${rows.at(-1).calls} calls (+${rows.at(-1).refused} refused), ${Math.round((rows.at(-1).bytes ?? 0) / 1024)} KB`);
        }
      }
  } finally {
    await browser.close();
  }
  return rows;
}

/** What a night's rows say against the budgets: one sentence a finding, none for a good night. */
export function judge(rows, S = budget('speed')) {
  const out = [];
  for (const r of rows) {
    if (r.screen !== 'today' || r.kind !== 'warm') continue;
    if (r.settleMs === null) out.push(`Today @${r.width} never settled warm`);
    else if (r.settleMs > S.todaySettleMs) out.push(`Today @${r.width} settled warm in ${r.settleMs} ms, over ${S.todaySettleMs} ms`);
  }
  return out;
}

/** Build the app when the build is older than the tree, as a look refuses a stale one. */
async function built() {
  const build = join(ROOT, 'apps', 'web', 'build');
  const stale = (await webBuildUnmet(ROOT)) !== null;
  if (stale) execFileSync('pnpm', ['-C', join(ROOT, 'apps', 'web'), 'build'], { stdio: 'inherit' });
  return build;
}

async function main() {
  const asked = parse(argv.slice(2));
  if (asked.plist) {
    process.stdout.write(plist());
    return;
  }
  const source = await openSource(asked.source, { env: processEnv });
  let served = null;
  try {
    const build = await built();
    if (!existsSync(appShell(build))) throw new Error('There is no built app to open.');
    served = await serve(source, { build });
    await answers(served.origin);
    const picked = await pick(asker(served.origin));
    const { screens } = await screensOf('six', picked);
    const started = new Date();
    const rows = await walk({ app: served.app, screens, widths: budget('speed').widths, runs: asked.runs });
    const findings = judge(rows);
    const day = started.toISOString().slice(0, 10);
    const file = asked.out === undefined ? join(ROOT, 'loop', 'proof', 'speed', `${day}.json`) : resolve(asked.out);
    mkdirSync(dirname(file), { recursive: true });
    const counts = source.counts();
    writeFileSync(file, `${JSON.stringify({ record: source.record, source: source.name, started: started.toISOString(), closed: new Date().toISOString(), budgets: budget('speed'), writesBlocked: counts.writes ?? 0, findings, rows }, null, 2)}\n`);
    console.log(`  speed: ${rows.length} rows in ${file}; ${findings.length === 0 ? 'Today is inside its budget' : findings.join('; ')}`);
    if (asked.check && findings.length > 0) process.exitCode = 1;
  } finally {
    await served?.close();
    await source.close();
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href)
  main().catch((e) => {
    console.error(`  speed refused: ${e instanceof Error ? e.message : String(e)}`);
    exit(1);
  });

