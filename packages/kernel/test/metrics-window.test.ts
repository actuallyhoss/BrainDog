/**
 * The window a comparison reads BEFORE the current one, and the day it ends on.
 *
 * THE COMPARISON IS THE SAME PREDICATE AGAINST A MOVED CLOCK, AND ONLY THE START OF THE WINDOW MOVED.
 * `spent-30d` and `received-30d`, the two figures in the tree that declare `compare: previous`, say
 * `on after -31d` and nothing about an end: the end of their window is the clock itself. Moving the
 * clock back thirty days moved `-31d` to `-61d` and left the end where it was, so the window "before"
 * was the sixty-one days up to today, which CONTAINS the thirty-one it was being compared with. A sum
 * over a superset of the same rows is never smaller, so the Ledger's lead tile could say "down" or
 * "no change" and nothing else, whatever anybody spent.
 *
 * Measured on this file's seed before the repair: 150,000 spent in each of two consecutive windows,
 * and the reading was `delta: -0.5`, because the window before held all four rows.
 *
 * The sums are equal across the two windows here on purpose. A flat month is the one answer the
 * superset could never give, so it is the answer that tells the two arithmetics apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deltaFrom, openRecord, type Declaration, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const day = (offset: number): string => new Date(NOW + offset * DAY).toISOString().slice(0, 10);

const SPENDING: Declaration = {
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
    ],
  } as never,
};

/** The Ledger's lead tile, as `packages/seed/src/modules/money.ts` declares it, over this file's register. */
const SPENT: MetricDecl = {
  metric: 'spent-30d',
  name: 'Spent, 30 days',
  source: 'register.spending',
  where: 'state is cleared, direction is out, on after -31d',
  value: { sum: 'amount' },
  format: 'money.GBP',
  target: { lte: 1_500_000 },
  window: '30d',
  compare: 'previous',
};

async function seeded(rows: ReadonlyArray<[offset: number, amount: number]>) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([SPENDING])).ok);
  for (const [offset, amount] of rows)
    assert.ok(
      k.create('spending', { what: `spent ${offset}`, direction: 'out', amount: { amount, currency: 'GBP' }, on: day(offset), state: 'cleared' }, { actor: 'p_1' }).ok,
    );
  return { k, sql };
}

const reading = (r: unknown): Reading => {
  const x = r as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('EQUAL MONEY IN TWO CONSECUTIVE WINDOWS IS FLAT, and the superset made it half', async () => {
  // Two rows in the thirty days to the clock, and two in the thirty before that, summing the same.
  const { k, sql } = await seeded([[-5, 100_000], [-20, 50_000], [-40, 100_000], [-50, 50_000]]);
  const r = reading(k.metric(SPENT));
  assert.equal(r.value, 150_000, 'the current window is not what is in question');
  assert.equal(r.why, '', `the comparability gate refused a comparison this test is about: ${r.why}`);
  assert.equal(r.delta, 0, `the window before held the current one as well, so equal months read as ${r.delta}`);
  sql.close();
});

test('AND A RISE READS AS A RISE, which a superset can never report', async () => {
  const { k, sql } = await seeded([[-5, 200_000], [-20, 100_000], [-40, 100_000], [-50, 50_000]]);
  const r = reading(k.metric(SPENT));
  assert.equal(r.delta, deltaFrom(150_000, 300_000));
  assert.equal(r.delta, 1, 'twice the spending is a hundred per cent up, not the zero the superset reports');
  sql.close();
});

test('A ROW ON THE DAY THE WINDOW STARTS IS IN THIS WINDOW AND NOT THE ONE BEFORE', async () => {
  /* `on after -31d` is thirty-one days, today and the thirty before it, and `window: 30d` moves the
     clock thirty. So the moved clock falls on the current window's FIRST day, and a window before
     that ended at its clock counted day -30 on both sides. Day -31 is the last day of the window
     before and day -30 the first of this one; each row is seeded where one misplaced day changes
     the answer. */
  const { k, sql } = await seeded([[-30, 100_000], [-5, 50_000], [-31, 100_000], [-50, 50_000]]);
  const r = reading(k.metric(SPENT));
  assert.equal(r.value, 150_000, 'day -30 is inside `on after -31d`');
  assert.equal(r.delta, 0, `a row on the boundary was counted twice or not at all, and the reading was ${r.delta}`);
  sql.close();
});

test('a window that names its end and one whose end is the clock compare the same', async () => {
  /* `on after -30d` and `on after -30d, on before tomorrow` select the same rows when nothing is
     dated in the future. Before the repair the first was compared with sixty days and the second
     with thirty, because only a written end moved with the clock. */
  const where = 'state is cleared, direction is out, on after -30d';
  const { k, sql } = await seeded([[-5, 100_000], [-20, 50_000], [-40, 100_000], [-50, 50_000]]);
  const open = reading(k.metric({ ...SPENT, where }));
  const closed = reading(k.metric({ ...SPENT, where: `${where}, on before tomorrow` }));
  assert.equal(closed.value, open.value);
  assert.equal(open.delta, closed.delta, 'two spellings of one window compared with two different windows');
  assert.equal(open.delta, 0);
  sql.close();
});

test('`year_ago` reads the same window a year earlier, not the whole year up to today', async () => {
  /* The same defect under the other word: the start moved back a year and the end stayed at the
     clock, so "the same period last year" was thirteen months holding this month as well. */
  const { k, sql } = await seeded([[-5, 100_000], [-20, 50_000], [-40, 900_000], [-370, 100_000], [-380, 50_000]]);
  const r = reading(k.metric({ ...SPENT, compare: 'year_ago' }));
  assert.equal(r.value, 150_000);
  assert.equal(r.delta, 0, `the same month a year ago held the same money, and the reading was ${r.delta}`);
  sql.close();
});

test('a figure whose window has no written start is left as it was', async () => {
  /* ONLY A START IS GIVEN AN END. `due before today` is a balance at a moment rather than a window,
     and the day it was read at is its whole definition, so nothing is added to it. */
  const { k, sql } = await seeded([[-5, 100_000], [-40, 100_000], [-50, 50_000]]);
  const r = reading(k.metric({ ...SPENT, where: 'state is cleared, direction is out, on before today' }));
  assert.equal(r.value, 250_000);
  assert.equal(r.delta, deltaFrom(150_000, 250_000), 'the balance thirty days ago is the rows dated before that day');
  sql.close();
});
