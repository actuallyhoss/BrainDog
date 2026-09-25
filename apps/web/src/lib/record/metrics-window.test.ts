/**
 * The window a comparison reads BEFORE the current one, in the browser's engine.
 *
 * THE SAME DEFECT AS THE KERNEL'S, BLOCK FOR BLOCK, because the mechanism was written twice.
 * `spent-30d` says `on after -30d` and nothing about an end, so its window ends at the clock. The
 * comparison matched the same clauses at a clock thirty days back, which moved the start to `-61d`
 * and left the end at today: the window before was sixty-one days CONTAINING the thirty-one it was
 * compared with. Measured here before the repair, 150,000 spent in each of two consecutive months
 * read `delta: -0.5` under "on the 30 days before", and a doubled month read `-0.33`.
 *
 * `packages/kernel/test/metrics-window.test.ts` holds the kernel to the same rows and the same
 * answers. These drive the real declaration from `declared.ts` over rows put in place of the
 * sample ledger, so the tile under test is the Ledger's own.
 */

import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

import { openRecord } from '@braindog/kernel';

import './fixtures/fill.ts';
import { METRICS } from './declared.ts';
import { read, type MetricDecl } from './metrics.ts';
import { NOW } from './fixtures/sample.ts';
import { ROWS } from './held.ts';
import type { Entry } from './schema.ts';

const DAY = 86_400_000;
const day = (offset: number): string => new Date(NOW + offset * DAY).toISOString().slice(0, 10);

const SPENT = METRICS['spent-30d']!;

/** The ledger replaced by these rows for the length of one reading, then put back. */
function over<T>(rows: ReadonlyArray<[offset: number, amount: number]>, run: () => T): T {
  const kept = ROWS.transactions;
  ROWS.transactions = rows.map(
    ([offset, amount], i): Entry =>
      ({
        seq: i + 1,
        fields: { what: `spent ${offset}`, on: day(offset), direction: 'out', amount: { amount, currency: 'GBP' }, state: 'cleared', transfer: false },
        version: 1,
        created: `${day(offset)}T12:00:00.000Z`,
        by: 'you',
      }) as unknown as Entry,
  );
  try {
    return run();
  } finally {
    ROWS.transactions = kept!;
  }
}

test('the declaration under test is the Ledger tile as it ships', () => {
  assert.equal(SPENT.where, 'state is cleared, transfer is false, direction is out, on after -30d');
  assert.equal(SPENT.window, '30d');
  assert.equal(SPENT.compare, 'previous');
});

test('EQUAL MONEY IN TWO CONSECUTIVE WINDOWS IS FLAT, and the superset made it half', () => {
  const r = over([[-5, 100_000], [-20, 50_000], [-40, 100_000], [-50, 50_000]], () => read(SPENT, NOW));
  assert.deepEqual(r.refusals, []);
  assert.equal(r.value, 150_000, 'the current window is not what is in question');
  assert.equal(r.unmeasured, null, `the comparison this test is about was withheld: ${r.why}`);
  assert.equal(r.delta, 0, `the window before held the current one as well, so equal months read as ${r.delta}`);
});

test('AND A RISE READS AS A RISE, which a superset can never report', () => {
  const r = over([[-5, 200_000], [-20, 100_000], [-40, 100_000], [-50, 50_000]], () => read(SPENT, NOW));
  assert.equal(r.delta, 1, `twice the spending is a hundred per cent up, and the reading was ${r.delta}`);
});

test('A ROW ON THE DAY THE WINDOW STARTS IS IN THIS WINDOW AND NOT THE ONE BEFORE', () => {
  /* `on after -30d` is today and the twenty-nine days before it, since `after` leaves out its own day, and the
     clock moves thirty, so day -29 is this window's first and day -30 is the last day of the window before. */
  const r = over([[-29, 100_000], [-5, 50_000], [-30, 100_000], [-50, 50_000]], () => read(SPENT, NOW));
  assert.equal(r.value, 150_000, 'day -29 is inside `on after -30d`');
  assert.equal(r.delta, 0, `a row on the boundary was counted twice or not at all, and the reading was ${r.delta}`);
});

test('a window that names its end and one whose end is the clock compare the same', () => {
  const where = 'state is cleared, transfer is false, direction is out, on after -30d';
  const rows: Array<[number, number]> = [[-5, 100_000], [-20, 50_000], [-40, 100_000], [-50, 50_000]];
  const open = over(rows, () => read({ ...SPENT, where } as MetricDecl, NOW));
  const closed = over(rows, () => read({ ...SPENT, where: `${where}, on before tomorrow` } as MetricDecl, NOW));
  assert.equal(closed.value, open.value);
  assert.equal(open.delta, closed.delta, 'two spellings of one window compared with two different windows');
  assert.equal(open.delta, 0);
});

test('`year_ago` reads the same window a year earlier, not the whole year up to today', () => {
  const r = over([[-5, 100_000], [-20, 50_000], [-40, 900_000], [-370, 100_000], [-380, 50_000]], () =>
    read({ ...SPENT, compare: 'year_ago' } as MetricDecl, NOW),
  );
  assert.equal(r.value, 150_000);
  assert.equal(r.delta, 0, `the same month a year ago held the same money, and the reading was ${r.delta}`);
});

test('a figure whose window has no written start is left as it was', () => {
  const r = over([[-5, 100_000], [-40, 100_000], [-50, 50_000]], () =>
    read({ ...SPENT, where: 'state is cleared, transfer is false, direction is out, on before today' } as MetricDecl, NOW),
  );
  assert.equal(r.value, 250_000);
  assert.equal(r.delta, (250_000 - 150_000) / 150_000, 'the balance thirty days ago is the rows dated before that day');
});

/*
 * A WINDOW STARTED BY `more than` OR `at least` IS STILL A WINDOW, and the kernel has said so since its
 * `LOWER` list read `gt` and `gte`. This engine's `endedAt` read `after` alone, so `on more than -30d`
 * and `on at least -29d`, which name the same thirty days as `on after -30d`, were compared with a
 * window before that had no end: the sixty days up to today, holding the thirty it was set beside.
 * Measured before the repair over the seven rows below, the browser read `delta` -0.053 for both new
 * spellings and +17 for `after`, while the kernel read +17 for all three.
 *
 * The rows are chosen so a superset cannot pass by accident: the current window holds far more than
 * the one before, so a window before that swallows the current one reads down where the truth is up.
 */
const SEVEN: ReadonlyArray<[offset: number, amount: number]> = [
  [-1, 400_000],
  [-10, 300_000],
  [-29, 200_000],
  [-30, 30_000],
  [-45, 10_000],
  [-59, 10_000],
  [-80, 500_000],
];
const SPELLINGS = ['on after -30d', 'on more than -30d', 'on at least -29d'] as const;

/** The same seven rows in a record of the kernel's own, read by its `metric`, at the same clock. */
async function kernelDelta(where: string, rows: ReadonlyArray<[offset: number, amount: number]> = SEVEN): Promise<number | null> {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      db.exec('BEGIN');
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const k = await openRecord(sql as never, { now: () => NOW });
  const installed = await k.install([
    {
      id: 'register.spending',
      kind: 'register',
      body: {
        id: 'spending',
        name: 'Spending',
        title: 'what',
        state: 'state',
        fields: [
          { id: 'what', type: 'text', required: true },
          { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
          { id: 'amount', type: 'money', index: true },
          { id: 'on', type: 'day', index: true },
          { id: 'state', type: 'enum', values: ['cleared', 'pending'], index: true },
          { id: 'transfer', type: 'bool', index: true },
        ],
      },
    } as never,
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const [offset, amount] of rows)
    assert.ok(
      k.create('spending', { what: `spent ${offset}`, direction: 'out', amount: { amount, currency: 'GBP' }, on: day(offset), state: 'cleared', transfer: false }, { actor: 'p_1' }).ok,
    );
  const r = k.metric({ ...SPENT, source: 'register.spending', where: `state is cleared, transfer is false, direction is out, ${where}` } as never);
  db.close();
  assert.ok(r.ok, JSON.stringify(r));
  return r.value.delta;
}

for (const spelling of SPELLINGS)
  test(`\`${spelling}\` compares with the thirty days before it, in this engine and the kernel alike`, async () => {
    const r = over(SEVEN, () => read({ ...SPENT, where: `state is cleared, transfer is false, direction is out, ${spelling}` } as MetricDecl, NOW));
    assert.deepEqual(r.refusals, []);
    assert.equal(r.value, 900_000, `${spelling} is today and the twenty-nine days before it`);
    assert.equal(r.unmeasured, null, `the comparison this test is about was withheld: ${r.why}`);
    assert.equal(r.delta, (900_000 - 50_000) / 50_000, `the window before is days -30 to -59, and the reading was ${r.delta}`);
    assert.equal(r.delta, await kernelDelta(spelling), 'the browser and the kernel set one window beside two different ones');
  });

/*
 * AND `gte` NAMES ITS OWN DAY WHERE `after` AND `gt` NAME THE DAY BEFORE, which the three tests above
 * cannot see: a start thirty days back ends the window before at the moved clock whichever day the
 * start names, since the clock falls first. A window longer than the one the figure declares ends the
 * window before at its own first day instead, and there the two readings part. With `gte` read as
 * `after` was, `on at least -44d` ended the window before a day late and counted the row on day -44
 * in both windows: `delta` read -0.333 here where `on after -45d`, the same days, read 0. Measured by
 * making that one change to `endedAt`, with the three tests above still passing.
 */
const LONGER: ReadonlyArray<[offset: number, amount: number]> = [
  [-5, 100_000],
  [-44, 100_000],
  [-50, 200_000],
  [-80, 1_000],
];

for (const spelling of ['on after -45d', 'on more than -45d', 'on at least -44d'] as const)
  test(`\`${spelling}\` ends the window before on the day before its first, in this engine and the kernel alike`, async () => {
    const r = over(LONGER, () => read({ ...SPENT, where: `state is cleared, transfer is false, direction is out, ${spelling}` } as MetricDecl, NOW));
    assert.deepEqual(r.refusals, []);
    assert.equal(r.value, 200_000, `${spelling} holds day -44 and day -5`);
    assert.equal(r.unmeasured, null, `the comparison this test is about was withheld: ${r.why}`);
    assert.equal(r.delta, 0, `the window before is days -74 to -45, and the reading was ${r.delta}`);
    assert.equal(r.delta, await kernelDelta(spelling, LONGER), 'the browser and the kernel set one window beside two different ones');
  });
