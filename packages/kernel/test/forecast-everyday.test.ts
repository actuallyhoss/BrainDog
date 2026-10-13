/**
 * Everyday spending is in the walk: a leg that measures what went out in the last full months and moves a week's share
 * of it each week to the horizon.
 *
 * THE WALK HELD ONLY ROWS WITH A DATE, so a record with a salary line and no bills climbed by the salary for ever. What
 * a card spends on food has no row ahead of it, and the only honest figure for it is what it has been.
 *
 * WHAT IS HELD HERE: full months only, a month with nothing in it left out and not counted as nought, what the walk
 * already holds taken off so rent paid through the bank is not walked twice, a floor at nought, each currency on its
 * own, and a sentence where there is no full month to measure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Leg } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* 13 OCTOBER 2026: July, August and September are the three full months before it. */
const NOW = Date.UTC(2026, 9, 13, 12);
const usd = (amount: number) => ({ amount, currency: 'USD' });
const egp = (amount: number) => ({ amount, currency: 'EGP' });

const register = (id: string, name: string, fields: unknown[]): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }, ...fields] } as never,
});

const LINES_DECL = register('lines', 'Repeating lines', [
  { id: 'next', type: 'day', index: true },
  { id: 'repeats', type: 'enum', values: ['monthly', 'weekly', 'yearly'] },
  { id: 'way', type: 'enum', values: ['in', 'out'] },
  { id: 'until', type: 'day' },
]);
const BILLS_DECL = register('bills', 'Bills', [{ id: 'due', type: 'day', index: true }]);
const MOVES_DECL = register('moves', 'Moves', [
  { id: 'on', type: 'day', index: true },
  { id: 'state', type: 'enum', values: ['pending', 'cleared'] },
  { id: 'kind', type: 'enum', values: ['card', 'transfer'] },
  { id: 'way', type: 'enum', values: ['in', 'out'] },
]);

const LINES: Leg = {
  register: 'lines',
  on: 'next',
  amount: 'amount',
  incoming: { field: 'way', is: 'in' },
  every: { field: 'repeats', months: { monthly: 1, yearly: 12 }, weeks: { weekly: 1 } },
  ends: 'until',
};
const BILLS: Leg = { register: 'bills', on: 'due', amount: 'amount' };
const SPENT: Leg = {
  register: 'moves',
  on: 'on',
  amount: 'amount',
  where: 'state is cleared, kind is not transfer',
  incoming: { field: 'way', is: 'in' },
  everyday: {},
};

type Row = [register: string, fields: Record<string, unknown>];
const salary: Row = ['lines', { what: 'Salary', amount: usd(500_000), next: '2026-11-01', repeats: 'monthly', way: 'in' }];
const spend = (on: string, amount: number, more: Record<string, unknown> = {}): Row => [
  'moves',
  { what: 'Card', amount: usd(amount), on, state: 'cleared', kind: 'card', way: 'out', ...more },
];
/** A ledger that began in June and spent USD 1,300.00 in each of July, August and September. */
const THREE_MONTHS: Row[] = [
  spend('2026-06-20', 10_000),
  spend('2026-07-03', 100_000),
  spend('2026-07-28', 30_000),
  spend('2026-08-31', 130_000),
  spend('2026-09-01', 130_000),
];

async function walk(rows: readonly Row[], legs: readonly Leg[], days = 364) {
  const sql = openSqlite();
  try {
    const k = await openRecord(sql, fixedClock(NOW));
    assert.ok((await k.install([LINES_DECL, BILLS_DECL, MOVES_DECL])).ok);
    for (const [name, fields] of rows) {
      const made = k.create(name, fields, { actor: 'p_1' });
      assert.ok(made.ok, JSON.stringify(made));
    }
    const out = k.runway(0, legs, days);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value;
  } finally {
    sql.close();
  }
}
const end = (w: { steps: { balance: number }[]; from: number }): number => w.steps.at(-1)?.balance ?? w.from;

test('A SALARY AND THREE FULL MONTHS OF SPENDING: THE WALK ENDS LOWER BY THE MEASURED SPEND TIMES THE MONTHS WALKED', async () => {
  const rows: Row[] = [
    salary,
    ...THREE_MONTHS,
    /* NONE OF THESE IS EVERYDAY SPENDING: this month is not over, and the leg's own filter leaves the other three out. */
    spend('2026-10-05', 999_000),
    spend('2026-07-10', 70_000, { kind: 'transfer' }),
    spend('2026-07-11', 80_000, { state: 'pending' }),
    spend('2026-08-01', 90_000, { way: 'in' }),
  ];
  const alone = await walk(rows, [LINES]);
  const both = await walk(rows, [LINES, SPENT]);
  assert.deepEqual(both.refusals, []);
  /* 364 DAYS IS 52 WEEKS, WHICH IS TWELVE MONTHS OF A YEAR COUNTED IN WEEKS: USD 300.00 a week, USD 1,300.00 a month. */
  assert.equal(end(alone) - end(both), 12 * 130_000);
  const moved = both.steps.filter((s) => s.kind === 'everyday');
  assert.equal(moved.length, 52);
  assert.deepEqual([moved[0]!.day, moved[0]!.delta, moved[0]!.label], ['2026-10-20', -30_000, 'Everyday spending']);
  assert.equal(moved.at(-1)!.day, '2027-10-12');
  assert.deepEqual(both.everyday, [{ currency: 'USD', months: ['2026-07', '2026-08', '2026-09'], spent: 130_000, planned: 0, monthly: 130_000 }]);
  assert.equal(alone.everyday, undefined);
});

test('a month with nothing in it is left out, not counted as nought', async () => {
  const got = await walk([spend('2026-06-20', 10_000), spend('2026-07-03', 100_000), spend('2026-09-09', 200_000)], [SPENT]);
  assert.deepEqual(got.everyday, [{ currency: 'USD', months: ['2026-07', '2026-09'], spent: 150_000, planned: 0, monthly: 150_000 }]);
});

test('the month the ledger began in is not a full month, and months to measure is the leg\'s to say', async () => {
  const rows: Row[] = [spend('2026-07-20', 10_000), spend('2026-08-03', 100_000), spend('2026-09-09', 200_000)];
  assert.deepEqual((await walk(rows, [SPENT])).everyday![0]!.months, ['2026-08', '2026-09']);
  assert.deepEqual((await walk(rows, [{ ...SPENT, everyday: { months: 1 } }])).everyday, [
    { currency: 'USD', months: ['2026-09'], spent: 200_000, planned: 0, monthly: 200_000 },
  ]);
});

test('what the walk already holds is taken off: a repeating line of money out, and the bills that fell due in those months', async () => {
  const rows: Row[] = [
    salary,
    ...THREE_MONTHS,
    ['lines', { what: 'Rent', amount: usd(40_000), next: '2026-11-01', repeats: 'monthly', way: 'out' }],
    ['lines', { what: 'Gym, ended', amount: usd(5_000), next: '2026-10-01', repeats: 'monthly', way: 'out', until: '2026-10-01' }],
    ['bills', { what: 'Dentist', amount: usd(30_000), due: '2026-08-15' }],
    ['bills', { what: 'Before the months', amount: usd(77_000), due: '2026-06-30' }],
    ['bills', { what: 'After the months', amount: usd(88_000), due: '2026-10-02' }],
  ];
  /* THE LEG NAMES WHAT IS ALREADY WALKED: rent a month, and one bill of USD 300.00 over three months. */
  const named = await walk(rows, [LINES, { ...SPENT, everyday: { already: [LINES, BILLS] } }]);
  assert.deepEqual(named.everyday, [{ currency: 'USD', months: ['2026-07', '2026-08', '2026-09'], spent: 130_000, planned: 50_000, monthly: 80_000 }]);
  /* AND WITH NONE NAMED IT IS THE WALK'S OWN OTHER LEGS, here the repeating lines alone. */
  const own = await walk(rows, [LINES, SPENT]);
  assert.equal(own.everyday![0]!.planned, 40_000);
  assert.equal(own.everyday![0]!.monthly, 90_000);
});

test('the result is floored at nought, and a walk that moves nothing says why', async () => {
  const rows: Row[] = [...THREE_MONTHS, ['lines', { what: 'Rent', amount: usd(200_000), next: '2026-11-01', repeats: 'monthly', way: 'out' }]];
  const got = await walk(rows, [LINES, SPENT]);
  assert.equal(got.steps.filter((s) => s.kind === 'everyday').length, 0);
  assert.deepEqual(got.everyday, [
    {
      currency: 'USD',
      months: ['2026-07', '2026-08', '2026-09'],
      spent: 130_000,
      planned: 200_000,
      monthly: 0,
      why: 'What is already planned covers the spending measured, so nothing more is moved for everyday spending.',
    },
  ]);
});

test('two currencies are each measured on their own, and what is planned comes off its own currency only', async () => {
  const pounds = (on: string, amount: number): Row => ['moves', { what: 'Card', amount: egp(amount), on, state: 'cleared', kind: 'card', way: 'out' }];
  const rows: Row[] = [
    ...THREE_MONTHS,
    /* THE POUNDS BEGAN IN JULY, so August and September are their full months and July is not. */
    pounds('2026-07-15', 1_000),
    pounds('2026-08-10', 600_000),
    pounds('2026-09-10', 400_000),
    ['lines', { what: 'Rent', amount: usd(40_000), next: '2026-11-01', repeats: 'monthly', way: 'out' }],
  ];
  const got = await walk(rows, [LINES, SPENT]);
  assert.deepEqual(got.everyday, [
    { currency: 'EGP', months: ['2026-08', '2026-09'], spent: 500_000, planned: 0, monthly: 500_000 },
    { currency: 'USD', months: ['2026-07', '2026-08', '2026-09'], spent: 130_000, planned: 40_000, monthly: 90_000 },
  ]);
  /* NO HOME CURRENCY AND NO RATE, so the two are never added: the walk says it reads both, as it does for any two. */
  assert.deepEqual(got.mixed, ['EGP', 'USD']);
  assert.deepEqual(got.steps, []);
});

test('no full month moves nothing and says so, and it is not a refusal', async () => {
  const why = 'There is no full month of spending to measure yet, so everyday spending is not in this walk.';
  const none = await walk([salary], [LINES, SPENT]);
  assert.deepEqual(none.everyday, [{ currency: null, months: [], spent: 0, planned: 0, monthly: 0, why }]);
  assert.deepEqual(none.refusals, []);
  /* A LEDGER THAT BEGAN LAST MONTH has a month that is not full and a month that is not over. */
  const young = await walk([salary, spend('2026-09-20', 50_000), spend('2026-10-02', 50_000)], [LINES, SPENT]);
  assert.deepEqual(young.everyday, [{ currency: 'USD', months: [], spent: 0, planned: 0, monthly: 0, why }]);
  assert.equal(end(young), end(await walk([salary], [LINES])));
});

test('months to measure that is not a whole number from 1 to 24 is refused in words', async () => {
  const got = await walk(THREE_MONTHS, [{ ...SPENT, everyday: { months: 0 } }]);
  assert.equal(got.steps.length, 0);
  assert.deepEqual(got.refusals.map((r) => [r.code, r.at]), [['OUT_OF_BOUNDS', 'everyday']]);
});
