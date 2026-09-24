/**
 * A repeating row stops walking on the last day its leg's `ends` field names, and not the night after.
 *
 * A LEG HAD NO END DAY. The the old tool import closes a line only on the first night after its `ends_on` has passed,
 * so between the night it learns the end and that night, the kernel walked the row to the horizon: measured against
 * the walk before `Leg.ends`, the USD 1,000.00 monthly salary below, ending on 20 October 2026, walked twelve cheques
 * over 365 days, 15 October 2026 to 15 September 2027, where the old tool's own forecast counts one.
 *
 * THE END IS INCLUSIVE, because it is set from the old tool's `ends_on` and that is the last payday there: `payDays`
 * keeps a payday on the day and drops every one after it. The reasoning is on `Leg.ends`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Leg } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* 24 SEPTEMBER 2026, the night the import tests hold his salary against. */
const NOW = Date.UTC(2026, 8, 24, 12);
const usd = (amount: number) => ({ amount, currency: 'USD' });

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
      { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'quarterly', 'yearly'] },
      { id: 'ends', type: 'day' },
      /* A TEXT FIELD, so a value no day reader can read reaches the walk at all: a `day` field refuses one on write. */
      { id: 'until', type: 'text' },
    ],
  } as never,
};

const LEG: Leg = {
  register: 'obligations',
  on: 'due',
  amount: 'amount',
  every: { field: 'repeats', months: { monthly: 1, quarterly: 3, yearly: 12 } },
  ends: 'ends',
};

/** One row walked through the kernel's `runway` over a year, as `day delta`, with the refusals beside it. */
async function walk(fields: Record<string, unknown>, leg: Leg = LEG): Promise<{ steps: string[]; refusals: string[] }> {
  const sql = openSqlite();
  try {
    const k = await openRecord(sql, fixedClock(NOW));
    assert.ok((await k.install([OBLIGATIONS])).ok);
    const made = k.create('obligations', { what: 'Salary', amount: usd(100_000), repeats: 'monthly', ...fields }, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
    const out = k.runway(0, [leg], 365);
    assert.ok(out.ok, JSON.stringify(out));
    return { steps: out.value.steps.map((s) => `${s.day} ${String(s.delta)}`), refusals: out.value.refusals.map((r) => r.fix) };
  } finally {
    sql.close();
  }
}

test('A MONTHLY LINE ENDING ON 20 OCTOBER WALKS ITS ONE CHEQUE BEFORE THE END, AND NOTHING AFTER IT', async () => {
  const got = await walk({ due: '2026-10-15', ends: '2026-10-20' });
  assert.deepEqual(got, { steps: ['2026-10-15 -100000'], refusals: [] });
});

test('a payday on the end day itself is walked, because the end is the last payday', async () => {
  assert.deepEqual((await walk({ due: '2026-10-15', ends: '2026-11-15' })).steps, ['2026-10-15 -100000', '2026-11-15 -100000']);
});

/* THE IMPORT WRITES THIS ROW: a line ending on 28 September whose next payday, 1 October, is already past the end. */
test('a row whose first day is past its end walks nothing, repeating or not', async () => {
  assert.deepEqual((await walk({ due: '2026-10-01', ends: '2026-09-28' })).steps, []);
  assert.deepEqual((await walk({ due: '2026-10-01', ends: '2026-09-28', repeats: 'none' })).steps, []);
});

/* A PAST DAY STILL OWED IS STILL OWED. The end bounds the day money moves, not the day the walk is read on, so a one-off
   due before its end and not yet paid is clamped to today as overdue as it always was. */
test('a one-off due on or before its end is walked, overdue included', async () => {
  assert.deepEqual((await walk({ due: '2026-09-20', ends: '2026-09-20', repeats: 'none' })).steps, ['2026-09-24 -100000']);
});

test('with no end, and on a leg that names none, the line walks the whole year as it did', async () => {
  const year = ['2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15', '2027-03-15', '2027-04-15', '2027-05-15', '2027-06-15', '2027-07-15', '2027-08-15', '2027-09-15'];
  assert.deepEqual((await walk({ due: '2026-10-15' })).steps, year.map((d) => `${d} -100000`));
  const { ends: _named, ...plain } = LEG;
  assert.deepEqual((await walk({ due: '2026-10-15', ends: '2026-10-20' }, plain)).steps, year.map((d) => `${d} -100000`));
});

/* AN END THE WALK CANNOT READ IS SAID, and the row is left out rather than walked for ever. */
test('an end no day reader can read leaves the row out and says so', async () => {
  const got = await walk({ due: '2026-10-15', until: 'when the contract stops' }, { ...LEG, ends: 'until' });
  assert.deepEqual(got, { steps: [], refusals: ['1 row of obligations has an end in until that this walk could not read, and its money is not in it.'] });
});
