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
import assert from 'node:assert/strict';

import { METRICS } from './declared.ts';
import { read, type MetricDecl } from './metrics.ts';
import { NOW, ROWS } from './data.ts';
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
