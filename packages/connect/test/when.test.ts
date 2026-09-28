/**
 * The zone, the jitter and the window — the three pieces of arithmetic nobody notices until they
 * are wrong, and then cannot explain.
 *
 * CAIRO IS THE ZONE THROUGHOUT, and not because it is convenient. Egypt reinstated summer time in
 * 2023, so `Africa/Cairo` changes offset twice a year on a Friday at midnight — a spring-forward
 * that deletes an hour and an autumn one that repeats it. Those two nights are exactly when a
 * connector double-counts a bucket or skips one, and exactly when nobody is looking.
 *
 * AND THE CEILING IS THE TEST THAT MATTERS MOST. A day series fetched at 14:00 that reached to
 * 14:00 would write eleven hours into the row that means a whole day, and nothing downstream could
 * tell that number from a finished one. Every assertion about `until` is really about that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  jitterMs, nextDue, rfc3339, startOfGrainMs, wallClock, watermarkAfter, windowFor, zonedToMs,
  type Cursor, type FetchDecl,
} from '../src/index.ts';

const CAIRO = 'Africa/Cairo';
const UTC = 'UTC';

const decl = (over: Partial<FetchDecl> = {}): FetchDecl => ({
  base: 'https://api.example.com',
  path: '/v1/things',
  auth: { kind: 'none' },
  schedule: { every: '1h' },
  ...over,
});

const at = (iso: string): number => Date.parse(iso);

/* ── The zone ────────────────────────────────────────────────────────────────────────────────── */

test('a wall clock in a zone is the instant a person there would call it', () => {
  /* Cairo is UTC+2 in winter and UTC+3 under summer time. */
  assert.equal(zonedToMs({ year: 2026, month: 1, day: 15, hour: 0, minute: 0, second: 0 }, CAIRO), at('2026-01-14T22:00:00Z'));
  assert.equal(zonedToMs({ year: 2026, month: 7, day: 15, hour: 0, minute: 0, second: 0 }, CAIRO), at('2026-07-14T21:00:00Z'));
  assert.equal(zonedToMs({ year: 2026, month: 1, day: 15, hour: 0, minute: 0, second: 0 }, UTC), at('2026-01-15T00:00:00Z'));
});

/* GUESSING WITH THE OFFSET AT THE NAIVE INSTANT IS WRONG BY AN HOUR on the two days a year a zone
   changes, and right on the other 363 — which is how it survives review. The offset is measured
   where the first guess landed, so a run on one of those two nights lands where a person there
   would say it did. */
test('a wall clock that never happened lands after the gap, and does not pretend', () => {
  /* Egypt jumps from 23:59 to 01:00 on the last Friday of April. Midnight on 2026-04-24 is not a
     time; the two passes agree on the first instant that actually happened after it. */
  const gone = zonedToMs({ year: 2026, month: 4, day: 24, hour: 0, minute: 0, second: 0 }, CAIRO);
  assert.equal(rfc3339(gone), '2026-04-23T22:00:00Z');
  assert.equal(wallClock(gone, CAIRO), '2026-04-24 01:00');

  /* An hour either side of the gap is ordinary, and reads back as itself. */
  assert.equal(wallClock(zonedToMs({ year: 2026, month: 4, day: 23, hour: 23, minute: 0, second: 0 }, CAIRO), CAIRO), '2026-04-23 23:00');
  assert.equal(wallClock(zonedToMs({ year: 2026, month: 4, day: 24, hour: 2, minute: 0, second: 0 }, CAIRO), CAIRO), '2026-04-24 02:00');
  /* And the day after the change is midnight again, an hour earlier in UTC than it was in winter. */
  assert.equal(rfc3339(zonedToMs({ year: 2026, month: 4, day: 25, hour: 0, minute: 0, second: 0 }, CAIRO)), '2026-04-24T21:00:00Z');
});

/* THE OTHER NIGHT REPEATS AN HOUR RATHER THAN DELETING ONE, so one wall clock is two instants.
   There is no right answer; there is only a stated one, and an unstated one is a connector that
   fetches the same hour twice in some builds and neither in others. This picks the later. */
test('a wall clock that happened twice resolves to the second of them, always', () => {
  const twice = zonedToMs({ year: 2026, month: 10, day: 29, hour: 23, minute: 0, second: 0 }, CAIRO);
  assert.equal(rfc3339(twice), '2026-10-29T21:00:00Z');
  assert.equal(wallClock(twice, CAIRO), '2026-10-29 23:00');
  assert.equal(rfc3339(zonedToMs({ year: 2026, month: 10, day: 29, hour: 23, minute: 0, second: 0 }, CAIRO)), '2026-10-29T21:00:00Z');
});

/* AND A DAY THAT STARTS AT 01:00 STILL STARTS WHERE IT STARTS. A `day` grain on a spring-forward
   date has 23 hours in it, and the bucket begins at the first instant of that local day. */
test('the start of a day is the first instant of it, on a day that has no midnight', () => {
  const inside = at('2026-04-24T09:00:00Z');
  assert.equal(wallClock(startOfGrainMs(inside, 'day', CAIRO), CAIRO), '2026-04-24 01:00');
  assert.equal(rfc3339(startOfGrainMs(inside, 'day', CAIRO)), '2026-04-23T22:00:00Z');
});

test('the start of a grain is read in the record zone and not in UTC', () => {
  /* 00:30 Cairo on the 15th is still the 14th in UTC, and the day this belongs to is the 15th. */
  const ms = at('2026-01-14T22:30:00Z');
  assert.equal(wallClock(startOfGrainMs(ms, 'day', CAIRO), CAIRO), '2026-01-15 00:00');
  assert.equal(wallClock(startOfGrainMs(ms, 'hour', CAIRO), CAIRO), '2026-01-15 00:00');
  assert.equal(wallClock(startOfGrainMs(ms, 'month', CAIRO), CAIRO), '2026-01-01 00:00');
  assert.equal(rfc3339(startOfGrainMs(ms, 'day', UTC)), '2026-01-14T00:00:00Z');
});

/* ── Jitter ──────────────────────────────────────────────────────────────────────────────────── */

/* STABLE, SO "WHY WAS THERE A GAP AT 04:00" HAS AN ANSWER. Random jitter makes that question
   unanswerable for ever, which is the cost nobody prices in when they reach for `Math.random`. */
test('the same record and ingest always get the same jitter', () => {
  const a = jitterMs('rec_1', 'ingest_a', 3_600_000);
  assert.equal(jitterMs('rec_1', 'ingest_a', 3_600_000), a);
  assert.notEqual(jitterMs('rec_1', 'ingest_b', 3_600_000), a);
  assert.notEqual(jitterMs('rec_2', 'ingest_a', 3_600_000), a);
});

/* ONE FORMULA ON BOTH SIDES OF THE ROW (DOR-5). The kernel's `jitterMs` in `pull.ts` arms the
   connector with this same arithmetic, and the number below is what it answers for these names. A
   runner that spread the run by a different amount set a due instant the record did not agree with. */
test('the jitter is the kernel\'s own arithmetic, to the millisecond', () => {
  assert.equal(jitterMs('rec_1', 'ingest_a', 3_600_000), 271_822);
});

/* AND THE SEPARATOR IS THERE FOR A REASON. Without `0x1F`, record `ab` with ingest `c` and record
   `a` with ingest `bc` hash the same, and two connectors that should be spread fire together. */
test('the record and the ingest cannot run together into one string', () => {
  assert.notEqual(jitterMs('ab', 'c', 3_600_000), jitterMs('a', 'bc', 3_600_000));
});

test('the jitter window is every/10, clamped to thirty seconds and fifteen minutes', () => {
  const spread = (everyMs: number): number => {
    let top = 0;
    for (let i = 0; i < 400; i += 1) top = Math.max(top, jitterMs('rec_1', `ingest_${String(i)}`, everyMs));
    return top;
  };
  /* 1 h / 10 is 6 min, which is `25 §9`'s "twenty hourly connectors land across six minutes". */
  assert.ok(spread(3_600_000) < 360_000, 'an hourly connector jittered past six minutes');
  assert.ok(spread(3_600_000) > 300_000, 'an hourly connector never used most of its window');
  /* 15 min / 10 is 90 s, and the floor does not bite. A day is 2.4 h, and the ceiling does. */
  assert.ok(spread(900_000) < 90_000);
  assert.ok(spread(86_400_000) < 900_000, 'a daily connector jittered past the fifteen-minute ceiling');
  /* The floor: 5 min / 10 is 30 s exactly, and anything under it still gets thirty. */
  assert.ok(spread(60_000) < 30_000);
});

/* ── The next slot ───────────────────────────────────────────────────────────────────────────── */

/* THE SLOT AND THE DUE INSTANT ARE TWO NUMBERS. Computing the next slot from the DUE instant adds
   the jitter again every hour and walks an hourly connector off the hour within a day. */
test('an hourly slot stays on the hour however much jitter it carries', async () => {
  const slot0 = at('2026-01-15T04:00:00Z');
  const first = await nextDue(decl(), slot0, at('2026-01-15T04:30:00Z'), 'rec_1', 'ing_1', CAIRO);
  assert.equal(rfc3339(first.slot), '2026-01-15T05:00:00Z');
  assert.ok(first.dueAt > first.slot && first.dueAt <= first.slot + 360_000);

  let slot = slot0;
  for (let hour = 0; hour < 24; hour += 1) {
    const due = await nextDue(decl(), slot, slot + 1, 'rec_1', 'ing_1', CAIRO);
    slot = due.slot;
  }
  assert.equal(rfc3339(slot), '2026-01-16T04:00:00Z', 'a day of hourly slots drifted off the hour');
});

test('a slot far behind catches up to the next one after now, and not to every one between', async () => {
  const out = await nextDue(decl(), at('2026-01-01T00:00:00Z'), at('2026-01-15T04:30:00Z'), 'rec_1', 'ing_1', CAIRO);
  assert.equal(rfc3339(out.slot), '2026-01-15T05:00:00Z');
});

/* `at:` RE-ANCHORS RATHER THAN ADDING. `every` is a multiple of 24 h when `at` is declared, so
   adding it preserves the wall clock — except across a zone change, where it slips an hour and
   stays slipped for six months. */
test('a declared wall time holds through a change of offset', async () => {
  const daily = decl({ schedule: { every: '24h', at: '04:10' } });
  let slot = zonedToMs({ year: 2026, month: 4, day: 22, hour: 4, minute: 10, second: 0 }, CAIRO);
  for (let day = 0; day < 5; day += 1) {
    const out = await nextDue(daily, slot, slot + 1, 'rec_1', 'ing_1', CAIRO);
    slot = out.slot;
    assert.match(wallClock(slot, CAIRO), /04:10$/u, 'the declared wall time slipped');
  }
  assert.equal(wallClock(slot, CAIRO), '2026-04-27 04:10');
});

/* ── The window ──────────────────────────────────────────────────────────────────────────────── */

const WINDOWED = decl({ window: { grain: 'day', start: '2026-01-01' } });
const fresh: Cursor = { watermark: null };

test('a first run starts at the declared start and stops at the last complete grain', () => {
  const w = windowFor(WINDOWED, fresh, at('2026-01-15T04:00:00Z'), at('2026-01-15T14:00:00Z'), CAIRO);
  assert.equal(rfc3339(w?.since ?? 0), '2025-12-31T22:00:00Z');
  /* THE CEILING IS THE START OF TODAY IN CAIRO, not 14:00. Eleven hours of a day written into the
     row that means the whole day is a number nothing downstream can tell from a finished one. */
  assert.equal(rfc3339(w?.until ?? 0), '2026-01-14T22:00:00Z');
});

test('a caught-up connector asks for nothing rather than for an incomplete bucket', () => {
  const caught: Cursor = { watermark: '2026-01-14T22:00:00Z' };
  assert.equal(windowFor(WINDOWED, caught, at('2026-01-15T04:00:00Z'), at('2026-01-15T14:00:00Z'), CAIRO), null);
});

/* `lookback` REACHES BACK BEHIND THE WATERMARK ON PURPOSE. A provider that settles a transaction
   two days late hands a run rows it has already seen; the record deduplicates them, and the
   alternative is never seeing the correction at all. */
test('a lookback re-reads settled ground, and never before the declared start', () => {
  const back = decl({ window: { grain: 'day', start: '2026-01-01', lookback: '2d' } });
  const w = windowFor(back, { watermark: '2026-01-10T22:00:00Z' }, 0, at('2026-01-15T14:00:00Z'), CAIRO);
  assert.equal(rfc3339(w?.since ?? 0), '2026-01-08T22:00:00Z');

  const early = windowFor(back, { watermark: '2026-01-01T22:00:00Z' }, 0, at('2026-01-15T14:00:00Z'), CAIRO);
  assert.equal(rfc3339(early?.since ?? 0), '2025-12-31T22:00:00Z', 'a lookback reached behind the declared start');
});

test('max_span cuts a long backfill into runs', () => {
  const capped = decl({ window: { grain: 'day', start: '2020-01-01', max_span: '7d' } });
  const w = windowFor(capped, fresh, 0, at('2026-01-15T14:00:00Z'), CAIRO);
  assert.equal((w?.until ?? 0) - (w?.since ?? 0), 7 * 86_400_000);
});

/* A HALF-FINISHED WINDOW IS RESUMED EXACTLY AND NEVER RECOMPUTED. Recomputing it from the
   watermark re-fetches the pages that already landed, and for a `flow` series that is every one of
   their values counted a second time. */
test('a partial run resumes the range it stopped in, whatever the watermark says', () => {
  const partial: Cursor = {
    watermark: '2026-01-05T22:00:00Z',
    window: { since: '2026-01-05T22:00:00Z', until: '2026-01-12T22:00:00Z', page: { kind: 'offset', value: 300 }, n: 6, rows: 300 },
  };
  const w = windowFor(WINDOWED, partial, 0, at('2026-01-15T14:00:00Z'), CAIRO);
  assert.equal(rfc3339(w?.since ?? 0), '2026-01-05T22:00:00Z');
  assert.equal(rfc3339(w?.until ?? 0), '2026-01-12T22:00:00Z');
});

/* NO `window:` MEANS THE RUN IS NOT A RANGE. `{since}` and `{until}` are refused at lint for such a
   declaration, so both are the slot and neither is ever substituted into anything. */
test('a declaration with no window asks about one instant', () => {
  const slot = at('2026-01-15T04:00:00Z');
  assert.deepEqual(windowFor(decl(), fresh, slot, at('2026-01-15T14:00:00Z'), CAIRO), { since: slot, until: slot });
});

/* THE INVARIANT `47 §4.4` ASKS A TEST TO CHECK: a watermark never reaches into a grain that is
   still filling, however far a window ran. */
test('a watermark never claims a bucket that is still filling', () => {
  const now = at('2026-01-15T14:00:00Z');
  assert.equal(watermarkAfter(at('2026-01-20T00:00:00Z'), 'day', now, CAIRO), '2026-01-14T22:00:00Z');
  assert.equal(watermarkAfter(at('2026-01-10T22:00:00Z'), 'day', now, CAIRO), '2026-01-10T22:00:00Z');
});

test('a declaration whose start or interval cannot be read says so rather than guessing', () => {
  assert.throws(() => windowFor(decl({ window: { grain: 'day', start: 'last Tuesday' } }), fresh, 0, 0, CAIRO), /start/u);
  assert.rejects(() => nextDue(decl({ schedule: { every: 'often' } }), 0, 0, 'r', 'i', CAIRO), /interval/u);
});
