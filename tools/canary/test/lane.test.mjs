/**
 * The steps of `lane.d/`, as the workflow runs them: every file in the folder in name order, each saying what its red
 * does in the line the workflow reads, and each judging what it is for. The look and the sign-in drive a browser and are
 * not run here; their verdicts are, on answers written out below. The drill has its own file, `drill.test.mjs`.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { selfHost } from '../lib.mjs';
import { liveSmoke, selfHostSmoke } from '../lane.d/10-smoke.mjs';
import { envFor } from '../lane.d/20-signin-live.mjs';
import { argsFor, judge as judgeLook, productErrors } from '../lane.d/30-look.mjs';
import { judge as judgeSigns, MOST_HOURS, newestReading } from '../lane.d/40-signs.mjs';
import { keptStep, planFor as keptPlan } from '../lane.d/70-kept.mjs';

const DIR = join(import.meta.dirname, '..', 'lane.d');
/** The workflow's own reading of a step's red (`.github/workflows/after-deploy.yml`). */
const ON_RED = /^export const onRed = '(rollback|finding)';$/m;

test('every step in the folder is numbered, declares its red, and only a red smoke or sign-in rolls back', () => {
  /* THE FOLDER, NOT A LIST OF NAMES: a later unit adds a step by adding a file, as the workflow reads it. */
  const files = readdirSync(DIR).filter((n) => /\.m?js$/.test(n)).sort();
  assert.ok(files.length >= 5, `the lane holds ${files.length} steps`);
  for (const f of ['10-smoke.mjs', '20-signin-live.mjs', '30-look.mjs', '40-signs.mjs', '50-drill.mjs']) assert.ok(files.includes(f), `${f} is gone from the lane`);
  for (const f of files) {
    assert.match(f, /^\d{2}-[a-z][a-z0-9-]*\.mjs$/, `${f} is not named NN-name.mjs, so its place in the order is not plain`);
    const red = ON_RED.exec(readFileSync(join(DIR, f), 'utf8'))?.[1];
    assert.ok(red, `${f} does not declare what its red does`);
    assert.equal(red, /smoke|sign-?in/i.test(f) ? 'rollback' : 'finding', `${f} declares ${red}`);
  }
  assert.deepEqual(files.slice(0, 2), ['10-smoke.mjs', '20-signin-live.mjs'], 'the doors are proven before anything is looked at');
});

test('the smoke’s first-draw reads all answer on a fresh self-host, judged by the smoke’s own checks', async () => {
  const host = await selfHost();
  try {
    const lines = [];
    const wrong = await selfHostSmoke(host, { say: (l) => lines.push(l) });
    assert.deepEqual(wrong, []);
    assert.ok(lines.some((l) => /ok\s+GET \/api\/boot$/u.test(l)));
    assert.ok(!lines.some((l) => l.includes(host.key)), 'the key is in no line');
  } finally {
    await host.close();
  }
});

test('the live smoke is the smoke itself, for production, with the canary’s key in its environment', () => {
  let seen;
  const out = liveSmoke({ SMOKE_SLUG: 'ops', SMOKE_TOKEN: 'k' }, (cmd, args, opts) => ((seen = { cmd, args, opts }), { status: 0, stdout: 'ok', stderr: '' }));
  assert.deepEqual(out, { code: 0, said: 'ok' });
  assert.match(seen.args[0], /apps\/worker\/scripts\/smoke\.mjs$/u);
  assert.equal(seen.args[1], 'production');
  assert.equal(seen.opts.env.SMOKE_TOKEN, 'k');
});

test('the sign-in keeps its session in the runner’s temporary folder once the canary is named, and nowhere before', async () => {
  const runner = mkdtempSync(join(tmpdir(), 'canary-lane-'));
  try {
    const before = { LANE_OUT: join(runner, 'lane') };
    assert.equal((await envFor(before)).CANARY_SESSION, undefined);
    const env = await envFor({ SMOKE_SLUG: 'ops', RUNNER_TEMP: runner, LANE_OUT: join(runner, 'lane') });
    assert.equal(env.CANARY_SESSION, join(runner, 'braindog-canary', 'session.json'));
    assert.ok(!env.CANARY_SESSION.startsWith(join(runner, 'lane')), 'never in the artefact');
    assert.ok(statSync(dirname(env.CANARY_SESSION)).isDirectory());
  } finally {
    rmSync(runner, { recursive: true, force: true });
  }
});

const shot = (extra = {}) => ({ screen: 'today', name: 'Today', width: 390, settled: 'ready', consoleErrors: [], raw: {}, lint: null, ...extra });

test('the look is red on a refused screen, a console error or a lint finding, and green on none', () => {
  assert.deepEqual(judgeLook({ shots: [shot(), shot({ width: 1512 })] }), []);
  assert.deepEqual(judgeLook({ shots: [] }), ['the look drew no screen at all.']);
  assert.match(judgeLook({ shots: [shot({ settled: 'refused' })] })[0], /refused or never settled: Today at 390/u);
  assert.match(judgeLook({ shots: [shot({ settled: null, name: 'Money' })] })[0], /Money at 390/u);
  assert.match(judgeLook({ shots: [shot({ consoleErrors: ['boom'] })] })[0], /console said an error on Today at 390/u);
  assert.match(judgeLook({ shots: [shot({ raw: { ulid: { count: 1, e: ['x'] } } })] })[0], /lint finding on Today at 390/u);
  assert.match(judgeLook({ shots: [shot({ lint: ['a heading in two tones'] })] })[0], /lint finding/u);
  assert.equal(judgeLook({ shots: [shot({ settled: 'refused', consoleErrors: ['x'], raw: { path: { count: 1 } } })] }).length, 3);
});

test('a 403 the look gave itself is not the product’s error, and a 403 the canary gave still is', () => {
  const FORBIDDEN = 'Failed to load resource: the server responded with a status of 403 (Forbidden)';
  const own = shot({ consoleErrors: [FORBIDDEN], failedRequests: ['POST /app/ops/api/previewPage: 403', 'GET /api/kennel/v1/index.json: 403'], refused: { refused: 2, blocked: { previewPage: 1, '/api/kennel/v1/index.json': 1 } } });
  assert.deepEqual(productErrors(own), []);
  assert.deepEqual(judgeLook({ shots: [own] }), []);
  const theirs = shot({ consoleErrors: [FORBIDDEN], failedRequests: ['POST /api/previewPage: 403', 'GET /api/boot: 403'], refused: { refused: 1, blocked: { previewPage: 1 } } });
  assert.deepEqual(productErrors(theirs), [FORBIDDEN]);
  assert.deepEqual(productErrors(shot({ consoleErrors: [FORBIDDEN, 'TypeError: x is undefined'], failedRequests: ['POST /api/previewPage: 403'], refused: { blocked: { previewPage: 1 } } })), ['TypeError: x is undefined']);
  assert.deepEqual(productErrors(shot({ consoleErrors: [FORBIDDEN] })), [FORBIDDEN], 'a 403 with no refusal behind it is the product’s');
});

test('the look draws the canary through its session once named, and the self-host before', () => {
  assert.deepEqual(argsFor(true, '/out/look').slice(1), ['--source', 'canary', '--set', 'all', '--out', '/out/look']);
  assert.deepEqual(argsFor(false, '/out/look').slice(1), ['--source', 'canary:self-host', '--set', 'all', '--out', '/out/look']);
});

/** Five signs whose fourteen days end `last`, with a reading on each day in `read`. */
const signs = (last, read) =>
  Array.from({ length: 5 }, (_, i) => ({
    sign: `s${i}`,
    days: Array.from({ length: 14 }, (_, d) => {
      const day = new Date(Date.parse(`${last}T00:00:00Z`) - (13 - d) * 86_400_000).toISOString().slice(0, 10);
      return { day, state: read.includes(day) && i === 0 ? 'red' : 'none' };
    }),
  }));

test('a reading filed last night is fresh, and one a night older is red once the morning is past 26 hours', () => {
  const now = Date.parse('2026-10-09T08:00:00Z');
  /* London, summer time: today there is the 9th, yesterday's reading filed at 00:05 on the 9th (23:05 UTC), about 9 hours ago. */
  const fresh = newestReading(signs('2026-10-08', ['2026-10-08']), now, 'Europe/London');
  assert.equal(fresh.day, '2026-10-08');
  assert.equal(Math.round(fresh.hours), 9);
  assert.equal(judgeSigns({ signs: signs('2026-10-08', ['2026-10-08']) }, { nowMs: now, tz: 'Europe/London' }).red, false);
  /* The 7th's reading was filed at 00:05 on the 8th, 32 hours ago. */
  const stale = judgeSigns({ signs: signs('2026-10-08', ['2026-10-07']) }, { nowMs: now, tz: 'Europe/London' });
  assert.equal(stale.red, true);
  assert.match(stale.line, new RegExp(`2026-10-07, 32 hours old, past ${MOST_HOURS}`, 'u'));
  /* At 00:30 London the same reading is 24 hours old: one night, not yet missed. */
  assert.equal(judgeSigns({ signs: signs('2026-10-08', ['2026-10-07']) }, { nowMs: Date.parse('2026-10-08T23:30:00Z'), tz: 'Europe/London' }).red, false);
});

test('without the zone it calls a reading old only when it is old in every zone, and no reading at all is red', () => {
  const now = Date.parse('2026-10-09T08:00:00Z');
  assert.equal(judgeSigns({ signs: signs('2026-10-08', ['2026-10-07']) }, { nowMs: now }).red, false, 'within 26 hours somewhere');
  assert.equal(judgeSigns({ signs: signs('2026-10-08', ['2026-10-06']) }, { nowMs: now }).red, true, 'old everywhere');
  assert.match(judgeSigns({ signs: signs('2026-10-08', []) }, { nowMs: now }).line, /no sign holds a reading in fourteen days/u);
  assert.equal(judgeSigns({ signs: [] }).red, true);
  const own = judgeSigns({ signs: signs('2026-10-08', []) }, { live: false });
  assert.equal(own.red, false);
  assert.match(own.line, /waits for the canary/u);
});

/* THE KEPT LANE ON THE CANARY (`70-kept.mjs`): skipped on production and without the drill's names, skipped on a
   host whose billing is not test, and red on any FAIL line, with nothing run when it skips. */
test('the kept step skips on production, without the drill’s names, or where billing is not test, and is red on a FAIL', async () => {
  const names = { SMOKE_SLUG: 'ops', CANARY_MAIL_DOOR: 'door@example.test', CANARY_INVITE_CODE: 'c', CANARY_INBOX_KEY: 'k' };
  let ran = 0;
  const run = async (_ctx, { say }) => (ran++, say('  PASS  invoices: read back'), [{ name: 'invoices', pass: true }]);
  assert.match(keptPlan(names).line, /production/u);
  assert.match(keptPlan({ ...names, CANARY_ORIGIN: 'https://alpha.example.test', CANARY_INBOX_KEY: '' }).line, /CANARY_INBOX_KEY is not set/u);
  assert.deepEqual(keptPlan({ SMOKE_SLUG: '' }).run, false);
  const alpha = { ...names, CANARY_ORIGIN: 'https://alpha.example.test' };
  assert.deepEqual(await keptStep(alpha, { run, billing: async () => 'billing on alpha.example.test is live, and the lane runs only where it is test.' }), { code: 3, lines: ['skipped: billing on alpha.example.test is live, and the lane runs only where it is test.'] });
  assert.equal(ran, 0);
  assert.deepEqual(await keptStep(alpha, { run, billing: async () => null }), { code: 0, lines: ['PASS  invoices: read back'] });
  const red = await keptStep(alpha, { run: async () => [{ name: 'stripe', pass: false }], billing: async () => null });
  assert.equal(red.code, 1);
});
