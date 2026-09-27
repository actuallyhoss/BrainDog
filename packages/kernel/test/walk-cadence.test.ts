/**
 * The cash walk at any cadence and any length (modules C4, MOD-2).
 *
 * A LEG COULD ONLY COUNT MONTHS, AND ONLY SIXTY-FOUR OF THEM. A weekly cleaner or a fortnightly salary had no way to
 * be said except as a fraction of a month, which the walk refuses, and a monthly salary on the ten-year horizon a
 * block may ask for ran into the recurrence cap. These cases hold the three tables a leg may now name (`months`,
 * `weeks`, `twice`), the cap that fits the longest horizon, the horizon that ends at the last dated movement, and a
 * walk converted into a currency somebody asked for.
 *
 * EVERYTHING GOES THROUGH THE KERNEL'S `runway`, over rows written by `create`, so what is held here is what a page's
 * forecast block and a metric reading the walk are handed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { openRecord, type Declaration, type Leg, type Runway } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const DAY = 86_400_000;
const usd = (amount: number) => ({ amount, currency: 'USD' });

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
      { id: 'due', type: 'day', index: true },
      { id: 'cycle', type: 'enum', values: ['none', 'weekly', 'fortnightly', 'monthly', 'yearly', 'twice_monthly', 'mid_and_end'] },
      { id: 'ends', type: 'day' },
    ],
  } as never,
};

/* A LIST THAT DECLARES `rates:`, which is where the walk's rates come from (`roles.ts`). */
const RATES: Declaration = {
  id: 'register.rates',
  kind: 'register',
  body: {
    id: 'rates',
    name: 'Rates',
    title: 'currency',
    rates: { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' },
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

const LEG: Leg = {
  register: 'lines',
  on: 'due',
  amount: 'amount',
  every: {
    field: 'cycle',
    months: { monthly: 1, yearly: 12 },
    weeks: { weekly: 1, fortnightly: 2 },
    twice: { twice_monthly: [1, 15], mid_and_end: [15, 31] },
  },
  ends: 'ends',
};

/** The kernel's `runway`: what is liquid, the legs, the horizon in days or `'last'`, and a currency to walk in. */
type Walk = (opening: number, legs: readonly Leg[], horizon?: number | 'last', into?: string) => Result<Runway>;

/** A record at `now` holding `rows` of lines (and the rates, when given), handed to `use`, then closed. */
async function over(now: number, rows: Record<string, unknown>[], use: (walk: Walk) => void, rates: Record<string, unknown>[] = []): Promise<void> {
  const sql = openSqlite();
  try {
    const k = await openRecord(sql, fixedClock(now));
    assert.ok((await k.install([LINES, RATES])).ok);
    for (const fields of rows) {
      const made = k.create('lines', { amount: usd(10_000), ...fields }, { actor: 'p_1' });
      assert.ok(made.ok, JSON.stringify(made));
    }
    for (const r of rates) assert.ok(k.create('rates', r, { actor: 'p_1' }).ok);
    use((opening, legs, horizon, into) => k.runway(opening, legs, horizon, into));
  } finally {
    sql.close();
  }
}

/** The walk's value, failing the test on a refusal of the whole walk. */
function value(out: Result<Runway>): Runway {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
}

/** The days each labelled row lands on. */
const daysOf = (walk: Runway): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const s of walk.steps) (out[s.label] ??= []).push(s.day);
  return out;
};

test('A WEEK IS SEVEN DAYS ACROSS A MONTH END AND A LEAP DAY, a fortnight is two, and weeks already gone are not charged', async () => {
  /* 10 February 2028, a leap year, so the walk has to pass through the 29th. */
  await over(
    Date.UTC(2028, 1, 10, 12),
    [
      { what: 'Cleaner', due: '2028-02-22', cycle: 'weekly' },
      { what: 'Nursery', due: '2028-02-22', cycle: 'fortnightly' },
      /* ANCHORED IN JANUARY, so its first two weeks are past and today is one of its days. */
      { what: 'Paper', due: '2028-01-27', cycle: 'weekly' },
    ],
    (walk) => {
      const out = value(walk(1_000_000, [LEG], 38));
      assert.deepEqual(out.refusals, []);
      assert.deepEqual(daysOf(out), {
        Cleaner: ['2028-02-22', '2028-02-29', '2028-03-07', '2028-03-14'],
        Nursery: ['2028-02-22', '2028-03-07'],
        Paper: ['2028-02-10', '2028-02-17', '2028-02-24', '2028-03-02', '2028-03-09', '2028-03-16'],
      });
    },
  );
});

test('TWICE A MONTH LANDS ON ITS TWO DAYS, a day past the month is its last day, and the row keeps its own first day', async () => {
  await over(
    Date.UTC(2028, 1, 10, 12),
    [
      { what: 'Pay', due: '2028-02-15', cycle: 'twice_monthly' },
      /* THE 31ST IN A LEAP FEBRUARY IS THE 29TH, and in March it is the 31st again. */
      { what: 'Share', due: '2028-02-15', cycle: 'mid_and_end' },
      /* DUE ON A DAY THAT IS NEITHER OF THE TWO: that day, then the named days after it. */
      { what: 'Odd', due: '2028-02-20', cycle: 'twice_monthly' },
    ],
    (walk) => {
      const out = value(walk(1_000_000, [LEG], 60));
      assert.deepEqual(out.refusals, []);
      assert.deepEqual(daysOf(out), {
        Pay: ['2028-02-15', '2028-03-01', '2028-03-15', '2028-04-01'],
        Share: ['2028-02-15', '2028-02-29', '2028-03-15', '2028-03-31'],
        Odd: ['2028-02-20', '2028-03-01', '2028-03-15', '2028-04-01'],
      });
    },
  );
});

test('A MONTHLY SALARY WALKS TEN YEARS WITHOUT A REFUSAL, and so does a weekly one', async () => {
  /* 3,650 days from 25 September 2026 is 22 September 2036, three leap days in between. */
  await over(
    Date.UTC(2026, 8, 25, 12),
    [
      { what: 'Salary', due: '2026-10-01', cycle: 'monthly' },
      { what: 'Wage', due: '2026-09-28', cycle: 'weekly' },
    ],
    (walk) => {
      const out = value(walk(1_000_000, [LEG], 3650));
      assert.deepEqual(out.refusals, [], 'a cadence inside the longest horizon ran into the recurrence cap');
      const days = daysOf(out);
      assert.equal(days.Salary?.length, 120);
      assert.equal(days.Salary?.at(-1), '2036-09-01');
      /* 3,647 days from the first wage to the last day of the walk is exactly 521 weeks, and a step on the last day is in. */
      assert.equal(days.Wage?.length, 522);
      assert.equal(days.Wage?.at(-1), '2036-09-22');
    },
  );
});

test('TO THE LAST DATED MOVEMENT: the last one-off or the end of a line that ends, and a line with no end sets nothing', async () => {
  const now = Date.UTC(2026, 8, 25, 12);
  const day = (offset: number) => new Date(now + offset * DAY).toISOString().slice(0, 10);
  const plan = [
    { what: 'Press, 1 of 3', due: day(30), cycle: 'none' },
    { what: 'Press, 2 of 3', due: day(60), cycle: 'none' },
    { what: 'Press, 3 of 3', due: day(90), cycle: 'none' },
    { what: 'Salary', due: '2026-10-01', cycle: 'monthly' },
  ];
  await over(now, plan, (walk) => {
    const out = value(walk(1_000_000, [LEG], 'last'));
    assert.equal(out.horizon, 90);
    assert.equal(out.steps.at(-1)?.day, day(90), 'the walk went past the last instalment, or stopped before it');
    assert.deepEqual(daysOf(out).Salary, ['2026-10-01', '2026-11-01', '2026-12-01'], 'the salary did not walk up to the day the plan ends');
  });

  /* A LINE THAT ENDS 5 APRIL 2027 IS LATER THAN THE PLAN, so the walk runs to it: 192 days from 25 September. */
  await over(now, [...plan, { what: 'Contract', due: '2026-10-05', cycle: 'monthly', ends: '2027-04-05' }], (walk) => {
    const out = value(walk(1_000_000, [LEG], 'last'));
    assert.equal(out.horizon, 192);
    assert.equal(daysOf(out).Contract?.at(-1), '2027-04-05');
  });

  /* NOTHING DATED: a line with no end walks the default rather than a day. */
  await over(now, [{ what: 'Salary', due: '2026-10-01', cycle: 'monthly' }], (walk) => {
    assert.equal(value(walk(1_000_000, [LEG], 'last')).horizon, 180);
  });
});

test('A WALK INTO A CURRENCY SOMEBODY ASKED FOR converts each step at its own day, and names a rate it lacks', async () => {
  const rates = [
    { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' },
    { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-11-01' },
  ];
  const rows = [
    { what: 'October', due: '2026-10-10', cycle: 'none' },
    { what: 'November', due: '2026-11-10', cycle: 'none' },
  ];
  await over(
    Date.UTC(2026, 8, 25, 12),
    rows,
    (walk) => {
      /* NOT ASKED, AND NO HOME CURRENCY: the dollars walk as dollars. */
      const bare = value(walk(0, [LEG], 90));
      assert.equal(bare.currency, 'USD');
      assert.deepEqual(bare.steps.map((s) => s.delta), [-10_000, -10_000]);

      /* USD 100.00 at 48 on 10 October, and at 50 on 10 November, the newest rate on or before each day. */
      const egp = value(walk(0, [LEG], 90, 'EGP'));
      assert.equal(egp.currency, 'EGP');
      assert.deepEqual(
        egp.steps.map((s) => [s.day, s.delta, s.from]),
        [
          ['2026-10-10', -480_000, 'USD'],
          ['2026-11-10', -500_000, 'USD'],
        ],
      );
      assert.deepEqual(egp.converted, { asOf: '2026-09-01', forward: false, stale: true });
      assert.equal(egp.missing, undefined);

      const gbp = value(walk(0, [LEG], 90, 'GBP'));
      assert.deepEqual(gbp.missing, ['USD to GBP']);
      assert.deepEqual(gbp.steps, []);
      assert.equal(gbp.refusals[0]?.code, 'MIXED_CURRENCY');

      const bad = walk(0, [LEG], 90, 'pounds');
      assert.equal(bad.ok, false, 'a currency that is not a code was walked');
      assert.equal(!bad.ok && 'refusal' in bad ? bad.refusal.code : null, 'VALUE_MALFORMED');
    },
    rates,
  );
});

test('A TABLE THE WALK CANNOT STEP BY IS SAID BEFORE ANY ROW IS WALKED', async () => {
  const wrong: [NonNullable<Leg['every']>, RegExp][] = [
    [{ field: 'cycle', weeks: { weekly: 1.5 } }, /whole number of weeks/u],
    [{ field: 'cycle', twice: { twice_monthly: [15, 1] } }, /two different days from 1 to 31, the earlier first/u],
    [{ field: 'cycle', months: { monthly: 1 }, weeks: { monthly: 4 } }, /gives monthly more than one cycle/u],
  ];
  await over(Date.UTC(2026, 8, 25, 12), [{ what: 'Rent', due: '2026-10-01', cycle: 'monthly' }], (walk) => {
    for (const [every, says] of wrong) {
      const out = value(walk(1_000_000, [{ ...LEG, every }], 90));
      assert.deepEqual(out.steps, [], `a leg with ${JSON.stringify(every)} walked`);
      assert.equal(out.refusals.length, 1);
      assert.equal(out.refusals[0]?.code, 'VALUE_MALFORMED');
      assert.equal(out.refusals[0]?.at, 'every');
      assert.match(out.refusals[0]?.fix ?? '', says);
    }
  });
});
