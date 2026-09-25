/**
 * A digest at a time the zone skips or says twice, against the calendar clock at the same time.
 *
 * MEASURED ON 25 SEPTEMBER, BEFORE THE FIX, in New York: `nextOccurrence` asked for 02:30 on 14 March 2027, which the
 * zone skips, answered 06:30Z, which is 01:30 EST and an hour BEFORE the gap. `clock.ts`'s `nextCalendar` at the same
 * wall time answers 07:30Z, 03:30 EDT, the same distance past it. Asked for 01:30 on 7 November 2027, which the zone
 * says twice, the digest took the second (06:30Z, EST) and the clock the first (05:30Z, EDT). So a daily digest and a
 * monthly rule both written `at: 02:30` fired an hour apart on the one night a year anybody would look.
 *
 * AND THE DAY WALK LOST A WHOLE DAY, found while measuring the above. The walk added 24 hours to the instant it was
 * asked from and read the local date there, and 24 hours from 23:30 EST on 13 March is 00:30 EDT on the 15th, because
 * the 14th is 23 hours long. So a digest re-armed late that evening never had the 14th as a candidate and answered the
 * 15th, for an ordinary time like 09:00 as much as for a skipped one.
 *
 * THE ORACLE IS THE CALENDAR, WRITTEN OUT BY HAND: New York goes to EDT at 02:00 on 14 March 2027 and back at 02:00 on
 * 7 November 2027; London goes to BST at 01:00 GMT on 28 March 2027 and back at 02:00 BST on 31 October 2027. Tokyo has
 * no daylight saving, and it and an ordinary London day are the controls, which held before the fix and must hold after.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextCalendar } from '../src/clock.ts';
import { nextOccurrence } from '../src/index.ts';

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const daily = (at: string, from: number, tz: string): string | null => iso(nextOccurrence({ at }, from, tz));
/** The calendar clock at the same wall time, on one day of the month, as `flow.ts` arms a `1mo` rule. */
const monthly = (day: number, at: string, from: number, tz: string): string | null => {
  const [hh, mm] = at.split(':').map(Number) as [number, number];
  return iso(nextCalendar({ months: 1, month: 0, day, hh, mm }, from, tz));
};

/* ── the two nights the checker measured ─────────────────────────────── */

test('A TIME NEW YORK SKIPS IS THE SAME DISTANCE PAST THE GAP, as the calendar clock reads it', () => {
  const from = Date.UTC(2027, 2, 13, 17); // Sat 13 Mar 12:00 EST
  assert.equal(daily('02:30', from, 'America/New_York'), '2027-03-14T07:30:00.000Z', '02:30 on the night of the gap is 03:30 EDT, not 01:30 EST');
  assert.equal(iso(nextOccurrence({ day: 'sun', at: '02:30' }, Date.UTC(2027, 2, 8), 'America/New_York')), '2027-03-14T07:30:00.000Z', 'and a Sunday digest lands with it');
  assert.equal(daily('02:30', from, 'America/New_York'), monthly(14, '02:30', from, 'America/New_York'), 'a digest and a rule at the same time run together');
});

test('A TIME NEW YORK SAYS TWICE IS THE FIRST ONE, as the calendar clock reads it', () => {
  const from = Date.UTC(2027, 10, 6, 16); // Sat 6 Nov 12:00 EDT
  assert.equal(daily('01:30', from, 'America/New_York'), '2027-11-07T05:30:00.000Z', '01:30 on the night the clocks go back is the EDT one');
  assert.equal(daily('01:30', from, 'America/New_York'), monthly(7, '01:30', from, 'America/New_York'));
  /* AND ONCE, NOT TWICE. Re-armed at the first 01:30, the next is the following night, not the second 01:30 an hour on. */
  assert.equal(daily('01:30', Date.UTC(2027, 10, 7, 5, 30), 'America/New_York'), '2027-11-08T06:30:00.000Z');
});

test('LONDON SKIPS AND REPEATS AN HOUR TOO, and the digest reads both nights the way the clock does', () => {
  const spring = Date.UTC(2027, 2, 27, 12);
  assert.equal(daily('01:30', spring, 'Europe/London'), '2027-03-28T01:30:00.000Z', '01:30 on the night of the gap is 02:30 BST');
  assert.equal(daily('01:30', spring, 'Europe/London'), monthly(28, '01:30', spring, 'Europe/London'));
  const autumn = Date.UTC(2027, 9, 30, 12);
  assert.equal(daily('01:30', autumn, 'Europe/London'), '2027-10-31T00:30:00.000Z', '01:30 on the night the clocks go back is the BST one');
  assert.equal(daily('01:30', autumn, 'Europe/London'), monthly(31, '01:30', autumn, 'Europe/London'));
});

/* ── the day the walk lost ───────────────────────────────────────────── */

test('A DIGEST ARMED LATE ON THE EVE OF THE GAP STILL HAS THE NEXT DAY', () => {
  const eve = Date.UTC(2027, 2, 14, 4, 30); // Sat 13 Mar 23:30 EST
  assert.equal(daily('09:00', eve, 'America/New_York'), '2027-03-14T13:00:00.000Z', 'a 09:00 digest skipped Sunday the 14th');
  /* A DIGEST AT 23:30 IS RE-ARMED AT 23:30, which is exactly the instant the walk lost a day from. */
  assert.equal(daily('23:30', eve, 'America/New_York'), '2027-03-15T03:30:00.000Z', 'a 23:30 digest skipped Sunday the 14th');
});

/* ── the controls ────────────────────────────────────────────────────── */

test('AN ORDINARY LONDON DAY AND A ZONE WITH NO DAYLIGHT SAVING ARE WHAT THEY WERE', () => {
  const june = Date.UTC(2027, 5, 1, 12);
  assert.equal(daily('08:00', june, 'Europe/London'), '2027-06-02T07:00:00.000Z');
  assert.equal(daily('08:00', june, 'Europe/London'), monthly(2, '08:00', june, 'Europe/London'));
  /* TOKYO ON NEW YORK'S NIGHT, which is nothing to Tokyo: 02:30 JST on the 14th is 17:30Z on the 13th. */
  const tokyo = Date.UTC(2027, 2, 13, 12); // Sat 13 Mar 21:00 JST
  assert.equal(daily('02:30', tokyo, 'Asia/Tokyo'), '2027-03-13T17:30:00.000Z');
  assert.equal(daily('02:30', tokyo, 'Asia/Tokyo'), monthly(14, '02:30', tokyo, 'Asia/Tokyo'));
  assert.equal(iso(nextOccurrence({ day: 'mon', at: '09:00' }, tokyo, 'Asia/Tokyo')), '2027-03-15T00:00:00.000Z');
  /* STRICTLY AFTER: asked at the instant it was due, a daily digest is the next day, not the same turn again. */
  assert.equal(daily('09:00', Date.UTC(2027, 2, 15, 0), 'Asia/Tokyo'), '2027-03-16T00:00:00.000Z');
});
