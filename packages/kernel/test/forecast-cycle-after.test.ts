/**
 * The next day of a repeating line after a given day, by the steps the cash walk takes.
 *
 * A PAID LINE MOVES ITS "NEXT" ONE CYCLE ON, AND THE DAY IT MOVES TO HAS TO BE THE DAY THE FORECAST WALKS NEXT. Before
 * `cycleAfter` nothing outside `runway` could step a line, so a line's "Next" never moved and a script that moved it
 * would have had to count months itself: 30 September plus a month is 30 October there and 31 October in the walk.
 *
 * THE LAST TEST HOLDS THE TWO TOGETHER: every day `cycleAfter` answers in turn is the day `runway` walks, on the same
 * rows through the same leg.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Leg } from '../src/index.ts';
import { anchorDayOf, cycleAfter, type CycleLine } from '../src/forecast.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const LEG: Leg = {
  register: 'lines',
  on: 'next',
  amount: 'amount',
  every: { field: 'repeats', months: { monthly: 1, quarterly: 3, yearly: 12 }, weeks: { weekly: 1, fortnightly: 2 }, twice: { twice_monthly: [1, 15] } },
  ends: 'until',
  days: 'days',
  weekend: 'weekend',
};

/** Saturday and Sunday, and the weekend in Cairo. */
const SAT_SUN = [6, 0];
const FRI_SAT = [5, 6];

const line = (fields: Record<string, unknown>, rest?: readonly number[]): CycleLine => ({ leg: LEG, fields, ...(rest ? { rest } : {}) });

/** The days a line steps to, each asked for after the one before it, starting after `from`. */
function chain(from: string, of: CycleLine, count: number): (string | null)[] {
  const out: (string | null)[] = [];
  let day: string | null = from;
  while (out.length < count && day !== null) {
    day = cycleAfter(day, of);
    out.push(day);
  }
  return out;
}

test('A MONTHLY LINE ON THE 31ST STEPS TO EVERY LATER MONTH END, the short months too', () => {
  const rent = line({ next: '2026-08-31', repeats: 'monthly' });
  assert.deepEqual(chain('2026-08-31', rent, 6), ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
});

test('and one on 30 September is on the end of October, as the walk has it', () => {
  assert.equal(cycleAfter('2026-09-30', line({ next: '2026-09-30', repeats: 'monthly' })), '2026-10-31');
});

test('and one on 30 January clamps in February and comes back to the 30th', () => {
  assert.deepEqual(chain('2027-01-30', line({ next: '2027-01-30', repeats: 'monthly' }), 3), ['2027-02-28', '2027-03-30', '2027-04-30']);
});

test('A DAY BEFORE THE LINE BEGINS ANSWERS ITS OWN FIRST DAY, and a day inside a cycle the step after it', () => {
  const rent = line({ next: '2026-10-15', repeats: 'monthly' });
  assert.equal(cycleAfter('2026-09-01', rent), '2026-10-15');
  assert.equal(cycleAfter('2026-10-14', rent), '2026-10-15');
  assert.equal(cycleAfter('2026-10-20', rent), '2026-11-15');
  assert.equal(cycleAfter('2026-10-15T09:30:00.000Z', rent), '2026-11-15');
});

test('A WEEKLY LINE STEPS SEVEN DAYS, through a leap day, and a fortnightly one fourteen', () => {
  assert.deepEqual(chain('2028-02-22', line({ next: '2028-02-22', repeats: 'weekly' }), 3), ['2028-02-29', '2028-03-07', '2028-03-14']);
  assert.deepEqual(chain('2026-10-02', line({ next: '2026-10-02', repeats: 'fortnightly' }), 2), ['2026-10-16', '2026-10-30']);
});

test('TWICE A MONTH STEPS TO THE TWO DAYS OF THE TABLE, after the day the line itself names', () => {
  const pay = line({ next: '2026-10-03', repeats: 'twice_monthly' });
  assert.deepEqual(chain('2026-10-03', pay, 4), ['2026-10-15', '2026-11-01', '2026-11-15', '2026-12-01']);
});

test("and to the line's own two days when it names them: the 15th and each month's last day", () => {
  const pay = line({ next: '2026-10-15', repeats: 'twice_monthly', days: '15, last' });
  assert.deepEqual(chain('2026-10-15', pay, 5), ['2026-10-31', '2026-11-15', '2026-11-30', '2026-12-15', '2026-12-31']);
});

test('A LINE THAT HAS ENDED HAS NO NEXT DAY, and its last day is still one', () => {
  const job = line({ next: '2026-09-20', repeats: 'monthly', until: '2026-10-20' });
  assert.equal(cycleAfter('2026-09-20', job), '2026-10-20');
  assert.equal(cycleAfter('2026-10-20', job), null);
  assert.equal(cycleAfter('2026-09-20', line({ next: '2026-09-20', repeats: 'monthly', until: '2026-10-19' })), null);
  /* Ended before it begins, which an import can write: no cheque at all, as in the walk. */
  assert.equal(cycleAfter('2026-09-01', line({ next: '2026-10-01', repeats: 'monthly', until: '2026-09-28' })), null);
});

test('A REST DAY IS ANSWERED AS THE DAY THE LINE NAMES, and the walk moves it', () => {
  /* 31 October 2026 is a Saturday. The answer is the 31st, so the line still steps from a month end. */
  const pay = line({ next: '2026-09-30', repeats: 'monthly', weekend: 'before' }, SAT_SUN);
  assert.deepEqual(chain('2026-09-30', pay, 2), ['2026-10-31', '2026-11-30']);
});

test('and a payday already paid on the working day before is not answered again', () => {
  /* Paid on the 30th, a Friday and a rest day in Cairo, so the money came on Thursday 29 October. */
  const pay = line({ next: '2026-10-30', repeats: 'monthly', days: '30', weekend: 'before' }, FRI_SAT);
  assert.equal(cycleAfter('2026-10-29', pay), '2026-11-30');
  assert.equal(cycleAfter('2026-10-28', pay), '2026-10-30');
  /* The same line with "Next" typed as the Thursday: the 30th is October's pay, and November's is next. */
  const typed = line({ next: '2026-10-29', repeats: 'monthly', days: '30', weekend: 'before' }, FRI_SAT);
  assert.equal(cycleAfter('2026-10-29', typed), '2026-11-30');
});

test('nor is one paid on the working day after', () => {
  /* Saturday 31 October paid on Monday 2 November. */
  const pay = line({ next: '2026-10-31', repeats: 'monthly', weekend: 'after' }, SAT_SUN);
  assert.equal(cycleAfter('2026-11-02', pay), '2026-11-30');
  assert.equal(cycleAfter('2026-10-31', pay), '2026-11-30');
});

test('with no rest days given, nothing moves', () => {
  const pay = line({ next: '2026-10-30', repeats: 'monthly', days: '30', weekend: 'before' });
  assert.equal(cycleAfter('2026-10-29', pay), '2026-10-30');
});

test('A LINE THE WALK READS ONCE HAS NO NEXT DAY', () => {
  assert.equal(cycleAfter('2026-10-01', line({ next: '2026-10-15', repeats: 'none' })), null);
  assert.equal(cycleAfter('2026-10-01', line({ next: '2026-10-15', repeats: 'every other moon' })), null);
  assert.equal(cycleAfter('2026-10-01', line({ next: '2026-10-15' })), null);
  assert.equal(cycleAfter('2026-10-01', line({ repeats: 'monthly' })), null);
  assert.equal(cycleAfter('2026-10-01', line({ next: 'soon', repeats: 'monthly' })), null);
  assert.equal(cycleAfter('whenever', line({ next: '2026-10-15', repeats: 'monthly' })), null);
  assert.equal(cycleAfter('2026-10-01', line({ next: '2026-10-15', repeats: 'monthly', until: 'one day' })), null);
});

test('DAYS THAT DO NOT FIT THE CYCLE ARE LEFT, and the line steps by its cycle', () => {
  /* Two days on a line paid every month, and days nobody can read. */
  assert.equal(cycleAfter('2026-10-10', line({ next: '2026-10-10', repeats: 'monthly', days: '15, last' })), '2026-11-10');
  assert.equal(cycleAfter('2026-10-10', line({ next: '2026-10-10', repeats: 'monthly', days: 'payday' })), '2026-11-10');
});

/* 1 AUGUST, SO EVERY FIRST DAY BELOW IS STILL AHEAD AND THE WALK SKIPS NOTHING AS PAST. */
const NOW = Date.UTC(2026, 7, 1, 12);

const LINES: Declaration = {
  id: 'register.lines',
  kind: 'register',
  body: {
    id: 'lines',
    name: 'Lines',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'next', type: 'day', index: true },
      { id: 'repeats', type: 'text' },
      { id: 'until', type: 'day' },
      { id: 'days', type: 'text' },
      { id: 'weekend', type: 'text' },
    ],
  } as never,
};

/** The days the kernel's `runway` walks one line on. Saturday and Sunday rest, which is what a record has unset. */
async function walked(fields: Record<string, unknown>, horizon: number): Promise<string[]> {
  const sql = openSqlite();
  try {
    const k = await openRecord(sql, fixedClock(NOW));
    assert.ok((await k.install([LINES])).ok);
    assert.ok(k.create('lines', { what: 'Rent', amount: { amount: 50_000, currency: 'GBP' }, ...fields }, { actor: 'p_1' }).ok);
    const out = k.runway(50_000_000, [LEG], horizon);
    assert.ok(out.ok, JSON.stringify(out));
    assert.deepEqual(out.value.refusals, []);
    return out.value.steps.map((s) => s.day);
  } finally {
    sql.close();
  }
}

const SAME: [string, Record<string, unknown>][] = [
  ['monthly on the 31st', { next: '2026-08-31', repeats: 'monthly' }],
  ['monthly on 30 September', { next: '2026-09-30', repeats: 'monthly' }],
  ['quarterly on the 15th', { next: '2026-08-15', repeats: 'quarterly' }],
  ['weekly', { next: '2026-08-04', repeats: 'weekly' }],
  ['fortnightly', { next: '2026-08-07', repeats: 'fortnightly' }],
  ['twice a month by the table', { next: '2026-08-03', repeats: 'twice_monthly' }],
  ['twice a month on its own days', { next: '2026-08-15', repeats: 'twice_monthly', days: '15, last' }],
  ['monthly on a named 30th', { next: '2026-08-30', repeats: 'monthly', days: '30' }],
  ['monthly until 20 December', { next: '2026-08-20', repeats: 'monthly', until: '2026-12-20' }],
];

for (const [name, fields] of SAME)
  test(`THE WALK AND cycleAfter STEP THE SAME DAYS: ${name}`, async () => {
    const days = await walked(fields, 300);
    assert.ok(days.length >= 4, days.join(' '));
    const first = String(fields.next);
    assert.equal(days[0], first);
    /* One more than the walk has, so a line that ends says so here with a `null` in the same place. */
    const stepped = chain(first, line(fields), days.length).filter((d) => d !== null && d <= days[days.length - 1]!);
    assert.deepEqual([first, ...stepped], days);
  });

/* WITH A REST RULE THE WALK SHOWS THE DAY MOVED, so each day answered here is moved the way the walk moves it. */
test('and with a weekend rule, each day answered is the day the walk moves', async () => {
  const fields = { next: '2026-08-31', repeats: 'monthly', weekend: 'before' };
  const days = await walked(fields, 200);
  const named = ['2026-08-31', ...chain('2026-08-31', line(fields, SAT_SUN), days.length - 1)];
  /* 31 October and 31 January fall on a Saturday and a Sunday. */
  assert.deepEqual(named, ['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31'].slice(0, days.length));
  assert.deepEqual(days, ['2026-08-31', '2026-09-30', '2026-10-30', '2026-11-30', '2026-12-31', '2027-01-29'].slice(0, days.length));
});

/**
 * The days a line steps to when each answer is WRITTEN BACK to its "Next", which is what paying a line does: the next
 * question is asked of a row whose first day is the day last answered, and the day it began on is gone from it.
 */
function written(fields: Record<string, unknown>, count: number, anchorDay?: number | null): (string | null)[] {
  const out: (string | null)[] = [];
  let now = { ...fields };
  while (out.length < count) {
    const day = cycleAfter(String(now.next), { ...line(now), ...(anchorDay != null ? { anchorDay } : {}) });
    out.push(day);
    if (day === null) break;
    now = { ...now, next: day };
  }
  return out;
}

/* 2027 IS A COMMON YEAR, so 28 February is its month's last day and all three lines below are written back to it. */
const CLAMPED: [number, string[]][] = [
  [28, ['2027-02-28', '2027-03-28', '2027-04-28', '2027-05-28', '2027-06-28']],
  [29, ['2027-02-28', '2027-03-29', '2027-04-29', '2027-05-29', '2027-06-29']],
  [30, ['2027-02-28', '2027-03-30', '2027-04-30', '2027-05-30', '2027-06-30']],
];

for (const [anchorDay, days] of CLAMPED)
  test(`A LINE FIRST DUE ON ${anchorDay} JANUARY, WRITTEN BACK EACH STEP, IS NOT A MONTH END AFTER FEBRUARY`, async () => {
    const fields = { next: `2027-01-${anchorDay}`, repeats: 'monthly' };
    assert.equal(anchorDayOf(line(fields)), anchorDay);
    assert.deepEqual(written(fields, 5, anchorDay), days);
    /* And they are the days the walk shows for the row as it stood before anybody stepped it. */
    assert.deepEqual((await walked(fields, 340)).slice(0, 6), [fields.next, ...days]);
  });

test('and in a leap year the 30th clamps to the 29th and comes back, and the 29th is simply the 29th', () => {
  assert.deepEqual(written({ next: '2028-01-30', repeats: 'monthly' }, 3, 30), ['2028-02-29', '2028-03-30', '2028-04-30']);
  assert.deepEqual(written({ next: '2028-01-29', repeats: 'monthly' }, 3, 29), ['2028-02-29', '2028-03-29', '2028-04-29']);
  assert.deepEqual(written({ next: '2028-01-28', repeats: 'monthly' }, 3, 28), ['2028-02-28', '2028-03-28', '2028-04-28']);
});

test('WITHOUT AN ANCHOR THE CLAMPED DAY IS ALL THE ROW HAS, and it is read as the month end the walk reads', () => {
  /* What the anchor is for: the three January lines cannot be told apart once they are written back. */
  for (const day of [28, 29, 30])
    assert.deepEqual(written({ next: `2027-01-${day}`, repeats: 'monthly' }, 3), ['2027-02-28', '2027-03-31', '2027-04-30']);
});

test('THE SAME DAY KEPT IN THE LINE\'S OWN DAYS NEEDS NO ANCHOR, and the days win over one', () => {
  const fields = { next: '2027-01-30', repeats: 'monthly', days: '30' };
  assert.equal(anchorDayOf(line(fields)), null);
  assert.deepEqual(written(fields, 3), ['2027-02-28', '2027-03-30', '2027-04-30']);
  assert.deepEqual(written(fields, 3, 31), ['2027-02-28', '2027-03-30', '2027-04-30']);
});

test('A MONTH END IS ANCHORED ON THE 31ST, so it stays one through February whatever day it began on', () => {
  for (const next of ['2026-08-31', '2026-09-30', '2027-02-28']) assert.equal(anchorDayOf(line({ next, repeats: 'monthly' })), 31);
  assert.deepEqual(written({ next: '2026-11-30', repeats: 'monthly' }, 5, 31), ['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
});

test('A QUARTERLY LINE ON THE 30TH CLAMPS IN FEBRUARY AND COMES BACK IN MAY', () => {
  const fields = { next: '2026-11-30', repeats: 'quarterly' };
  /* 30 November is a month end, so the walk's own reading is the 31st: say the 30th to have the 30th. */
  assert.equal(anchorDayOf(line(fields)), 31);
  assert.deepEqual(written(fields, 3, 30), ['2027-02-28', '2027-05-30', '2027-08-30']);
  assert.deepEqual(written(fields, 3, 31), ['2027-02-28', '2027-05-31', '2027-08-31']);
});

test('A LEAP DAY PAID YEARLY COMES BACK TO THE 29TH, and a yearly 28 February never leaves the 28th', () => {
  const leap = { next: '2028-02-29', repeats: 'yearly' };
  assert.equal(anchorDayOf(line(leap)), 29);
  assert.deepEqual(written(leap, 4, 29), ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  const plain = { next: '2027-02-28', repeats: 'yearly' };
  assert.equal(anchorDayOf(line(plain)), 28);
  assert.deepEqual(written(plain, 2, 28), ['2028-02-28', '2029-02-28']);
});

test('AN ANCHOR IS READ ONLY ON A CYCLE OF MONTHS, and one that is no day of the month is left', () => {
  assert.equal(anchorDayOf(line({ next: '2028-02-22', repeats: 'weekly' })), null);
  assert.equal(anchorDayOf(line({ next: '2026-10-03', repeats: 'twice_monthly' })), null);
  assert.equal(anchorDayOf(line({ next: '2026-10-15', repeats: 'none' })), null);
  assert.equal(anchorDayOf(line({ next: 'soon', repeats: 'monthly' })), null);
  assert.deepEqual(written({ next: '2028-02-22', repeats: 'weekly' }, 2, 30), ['2028-02-29', '2028-03-07']);
  assert.deepEqual(written({ next: '2026-10-03', repeats: 'twice_monthly' }, 2, 30), ['2026-10-15', '2026-11-01']);
  for (const bad of [0, 32, 29.5, Number.NaN]) assert.deepEqual(written({ next: '2027-01-30', repeats: 'monthly' }, 2, bad), ['2027-02-28', '2027-03-31']);
});

test('and a rest day still answers the day the line names, anchored', () => {
  /* 30 October 2027 is a Saturday: answered as the 30th, and the walk moves it to the 29th. */
  const fields = { next: '2027-09-30', repeats: 'monthly', weekend: 'before' };
  const days: (string | null)[] = [];
  let now: Record<string, unknown> = fields;
  for (let n = 0; n < 2; n++) {
    days.push(cycleAfter(String(now.next), { ...line(now, SAT_SUN), anchorDay: 30 }));
    now = { ...now, next: days[n] };
  }
  assert.deepEqual(days, ['2027-10-30', '2027-11-30']);
});
