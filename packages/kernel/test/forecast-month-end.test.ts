/**
 * A monthly movement whose first day is the last day of its month stays on the last day.
 *
 * EVERY LATER DATE WAS STEPPED FROM THE DAY OF THE MONTH IT STARTED ON, AND 30 SEPTEMBER IS DAY THIRTY. Measured
 * through `resolveDay` before the repair: a monthly bill due `2026-09-30` walked `2026-10-30, 2026-11-30, 2026-12-30`,
 * so the October charge landed a day before the month it is paid for ends and December's landed a day early too. A bill
 * set on the last day of a month is a bill on "the end of the month", which is what a person means when they pick the
 * 30th of a thirty-day month. That reading is still the owner's call, and this assumes it; a bill that really is "the
 * 30th" now walks to 31 October.
 *
 * ANY OTHER DAY STEPS EXACTLY AS BEFORE. The 15th stays the 15th, and a start on the 31st was
 * already on every month's last day through the clamp, so neither moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Leg } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* 1 AUGUST, SO A START ON 31 AUGUST IS STILL AHEAD AND NOTHING IN THESE WALKS IS SKIPPED AS PAST. */
const NOW = Date.UTC(2026, 7, 1, 12);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day', index: true },
      { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'quarterly', 'half-yearly', 'yearly', 'two-yearly'] },
      { id: 'at', type: 'instant' },
    ],
  } as never,
};

const MONTHS = { monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12, 'two-yearly': 24 };
const LEG: Leg = { register: 'obligations', on: 'due', amount: 'amount', every: { field: 'repeats', months: MONTHS } };

/** The days one row walks on, through the kernel's `runway` and the horizon given. */
async function days(due: string, repeats = 'monthly', horizon = 160, on: 'due' | 'at' = 'due'): Promise<string[]> {
  const sql = openSqlite();
  try {
    const k = await openRecord(sql, fixedClock(NOW));
    assert.ok((await k.install([OBLIGATIONS])).ok);
    assert.ok(k.create('obligations', { what: 'Rent', amount: gbp(50_000), [on]: due, repeats }, { actor: 'p_1' }).ok);
    const out = k.runway(5_000_000, [{ ...LEG, on }], horizon);
    assert.ok(out.ok, JSON.stringify(out));
    assert.deepEqual(out.value.refusals, []);
    return out.value.steps.map((s) => s.day);
  } finally {
    sql.close();
  }
}

test('A MONTHLY BILL DUE ON 30 SEPTEMBER IS DUE ON EVERY LATER MONTH END, not on every 30th', async () => {
  assert.deepEqual(await days('2026-09-30'), ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31']);
});

test('and one due on the 15th is due on the 15th', async () => {
  assert.deepEqual(await days('2026-09-15'), ['2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15']);
});

test('and one due on 31 August walks the month ends it already walked', async () => {
  assert.deepEqual(await days('2026-08-31'), ['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31']);
});

/* THE LAST DAY OF FEBRUARY IS A MONTH END TOO, which is the case the clamp could never reach: a bill
   on 28 February stepped to the 28th of every later month and never came back to the 31st. */
test('A BILL ON 28 FEBRUARY OF A COMMON YEAR IS ON EVERY LATER MONTH END', async () => {
  assert.deepEqual((await days('2027-02-28', 'monthly', 365)).slice(0, 4), ['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
});

/* A DAY THAT IS NOT A MONTH END IN ITS OWN MONTH STAYS A DAY OF THE MONTH, even where a later month
   is short. The 30th of January is not an end, so it clamps in February and comes back to the 30th. */
test('A BILL ON 30 JANUARY STAYS ON THE 30TH AFTER FEBRUARY CLAMPS IT', async () => {
  assert.deepEqual((await days('2027-01-30', 'monthly', 365)).slice(0, 4), ['2027-01-30', '2027-02-28', '2027-03-30', '2027-04-30']);
});

/* THE CYCLE'S LENGTH STILL DECIDES WHICH MONTHS, and the month end only decides which day of them. */
test('A QUARTERLY BILL ON 30 SEPTEMBER IS ON THE LAST DAY OF EVERY THIRD MONTH', async () => {
  assert.deepEqual(await days('2026-09-30', 'quarterly', 365), ['2026-09-30', '2026-12-31', '2027-03-31', '2027-06-30']);
});

/* A YEARLY BILL TAKEN ON 28 FEBRUARY RENEWS ON 28 FEBRUARY, leap year or not. Measured before the repair: the month-end
   rule read 28 February 2027 as "the end of the month" and walked it to 29 February 2028, a day after the anniversary
   the bill was actually taken on. */
test('A YEARLY BILL ON 28 FEBRUARY OF A COMMON YEAR STAYS ON THE 28TH IN A LEAP YEAR', async () => {
  assert.deepEqual(await days('2027-02-28', 'yearly', 3000), ['2027-02-28', '2028-02-28', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-28', '2033-02-28', '2034-02-28']);
});

/* TAKEN IN 2026 SO ITS STEPS FALL IN THE LEAP YEARS. The first draft of this test started in 2027 and
   passed against the unrepaired walk, because 2029, 2031 and 2033 have no 29 February to land on. The
   2026 start is behind the clock, so its first cycle is skipped as already charged. */
test('and so does a two-yearly one, whose every step lands in a February', async () => {
  assert.deepEqual(await days('2026-02-28', 'two-yearly', 3000), ['2028-02-28', '2030-02-28', '2032-02-28', '2034-02-28']);
});

/* A BILL TAKEN ON A LEAP DAY IS ON FEBRUARY'S LAST DAY EVERY YEAR, the 28th in a common year and the
   29th again in the next leap year. */
test('A YEARLY BILL ON 29 FEBRUARY IS ON THE LAST DAY OF EVERY LATER FEBRUARY', async () => {
  assert.deepEqual(await days('2028-02-29', 'yearly', 3000), ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29', '2033-02-28', '2034-02-28']);
});

/* A CYCLE THAT IS NOT A WHOLE NUMBER OF YEARS STILL READS 28 FEBRUARY AS A MONTH END, because it
   leaves February: six months on is August, and the end of February is the end of August. */
test('A HALF-YEARLY BILL ON 28 FEBRUARY IS ON THE LAST DAY OF AUGUST AND OF EVERY FEBRUARY', async () => {
  assert.deepEqual(await days('2027-02-28', 'half-yearly', 1000), ['2027-02-28', '2027-08-31', '2028-02-29', '2028-08-31', '2029-02-28']);
});

/* AN `instant` IS NOT EXEMPT FROM THE MONTH-END RULE. The walk is handed the instant's first ten
   characters, so an instant on a month's last day is read as a month end exactly as a `day` is. */
test('A MONTHLY INSTANT ON THE LAST DAY OF SEPTEMBER IS ON EVERY LATER MONTH END', async () => {
  assert.deepEqual(await days('2026-09-30T09:15:00.000Z', 'monthly', 160, 'at'), ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31']);
});
