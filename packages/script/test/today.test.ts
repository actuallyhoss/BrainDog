/**
 * `ctx.today()`: the record's own day, as `YYYY-MM-DD`, for a script that moves a date on once a day.
 *
 * The guard for the dates add-on's roll: it read the UTC day, because a script was handed the instant and the zone's
 * name and QuickJS in this build has no `Intl` to turn them into a local day. So a record ahead of UTC had a date
 * moved a few hours into its own next day, and one behind it, late by as much. The day is worked out on the host
 * (`dayIn`), handed in beside the instant (`scriptMeta`), and read by the prelude.
 *
 * THREE LAYERS, EACH HELD HERE: the host's sum, the prelude's reading of what it is handed, and a whole run in the
 * sandbox, where `quickjs.ts` builds its `meta` with `scriptMeta` (the Cloud's `apps/worker/src/script.ts` does too).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CtxHost, ScriptAnswer, ScriptDecl } from '../src/index.ts';
import { PRELUDE, dayIn, scriptMeta } from '../src/index.ts';
import { runInQuickJs } from '../src/quickjs.ts';

/** 22:30 UTC on the 9th: already the 10th in Cairo, three hours ahead in summer. */
const LATE = '2026-07-09T22:30:00.000Z';
/** 01:00 UTC on the 10th: still the 9th in New York. */
const EARLY = '2026-07-10T01:00:00.000Z';

/* ── The host's sum ───────────────────────────────────────────────────────────────────────────── */

test('ahead of UTC at 22:30 UTC, the day is the next one', () => {
  assert.equal(dayIn(LATE, 'Africa/Cairo'), '2026-07-10');
});

test('behind UTC at 01:00 UTC, the day is the one before', () => {
  assert.equal(dayIn(EARLY, 'America/New_York'), '2026-07-09');
});

test('with no zone, the day is the UTC day', () => {
  assert.equal(dayIn(LATE, undefined), '2026-07-09');
  assert.equal(dayIn(LATE, null), '2026-07-09');
  assert.equal(dayIn(LATE, ''), '2026-07-09');
  assert.equal(dayIn(EARLY, 'UTC'), '2026-07-10');
});

test('a zone nobody knows is read as no zone, not thrown', () => {
  assert.equal(dayIn(LATE, 'Mars/Olympus'), '2026-07-09');
});

test('the day crosses a month and a year where the zone does', () => {
  assert.equal(dayIn('2026-12-31T22:30:00.000Z', 'Africa/Cairo'), '2027-01-01');
  assert.equal(dayIn('2027-01-01T01:00:00.000Z', 'America/New_York'), '2026-12-31');
  assert.equal(dayIn('2028-02-29T23:30:00.000Z', 'Asia/Tokyo'), '2028-03-01');
});

test('scriptMeta hands the instant, the zone, the input and the day together', () => {
  assert.deepEqual(scriptMeta({ input: { a: 1 }, now: LATE, tz: 'Africa/Cairo' }), {
    input: { a: 1 },
    now: LATE,
    tz: 'Africa/Cairo',
    today: '2026-07-10',
  });
});

/* ── The prelude's reading ────────────────────────────────────────────────────────────────────── */

type Built = { today(): unknown; now(): string; tz: string };
/** `ctx` as the prelude builds it, in this process: the same text both hosts evaluate. */
const built = (meta: Record<string, unknown>): Built =>
  ((0, eval)(PRELUDE) as (host: object) => (meta: object) => Built)({})(meta);

test('ctx.today() answers the day the host handed in, as a string', () => {
  const ahead = built(scriptMeta({ input: null, now: LATE, tz: 'Africa/Cairo' }));
  assert.equal(ahead.today(), '2026-07-10');
  assert.equal(typeof ahead.today(), 'string');
  const behind = built(scriptMeta({ input: null, now: EARLY, tz: 'America/New_York' }));
  assert.equal(behind.today(), '2026-07-09');
});

test('ctx.today() answers the UTC day when the host hands no day in', () => {
  assert.equal(built({ input: null, now: LATE, tz: 'Africa/Cairo' }).today(), '2026-07-09');
});

test('ctx.today() answers the UTC day when what was handed in is not a day', () => {
  for (const today of [new Date(LATE), 20260710, '10/07/2026', '2026-07-10T00:00:00.000Z', null])
    assert.equal(built({ input: null, now: LATE, tz: 'Africa/Cairo', today }).today(), '2026-07-09');
});

/* ── A whole run in the sandbox ───────────────────────────────────────────────────────────────── */

const SOURCE = `export default function run(ctx) {
  const day = ctx.today();
  ctx.log(typeof day, day, day instanceof Date);
}`;

const decl = (): ScriptDecl => ({ id: 'roll', version: 1, egress: [], keys: [], reads: [], writes: [], source: SOURCE });

const host = (now: string, tz: string): CtxHost => ({
  fetch: async () => ({ status: 200, headers: {}, body: '{}' }),
  now: () => now,
  tz,
  input: null,
  clock: () => 0,
});

const logOf = (a: ScriptAnswer): string => {
  assert.ok(!('refused' in a), `expected a run, got ${JSON.stringify(a)}`);
  return a.log.trim();
};

test('in the sandbox ctx.today() is a string shaped as a day, never a Date', async () => {
  const log = logOf(await runInQuickJs(decl(), host(LATE, 'UTC')));
  assert.equal(log, 'string 2026-07-09 false');
});

test('in the sandbox, ahead of UTC at 22:30 UTC, ctx.today() is the next day', async () => {
  assert.equal(logOf(await runInQuickJs(decl(), host(LATE, 'Africa/Cairo'))), 'string 2026-07-10 false');
});

test('in the sandbox, behind UTC at 01:00 UTC, ctx.today() is the day before', async () => {
  assert.equal(logOf(await runInQuickJs(decl(), host(EARLY, 'America/New_York'))), 'string 2026-07-09 false');
});
