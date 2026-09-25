/**
 * A cycle the walk has no factor for, in the browser's walk, and held against the kernel's.
 *
 * THE SAME SILENCE WAS IN BOTH ENGINES, ON THE SAME LINE. `leg.every.months[value] ?? 0` read a cycle
 * the leg does not name as zero, and zero is the one-off branch. Driven before the repair over the
 * demo's own obligations register with one row swapped in: a £100 bill whose `repeats` is `weekly`,
 * on a leg that names only `monthly`, walked as a single step of minus 10,000 with an empty
 * refusals list. Every week after the first was missing from Cash ahead and nothing said so.
 *
 * AND THE TWO WALKS MUST SAY IT IN ONE SENTENCE. The kernel draws the page a person opens and this
 * one draws the demo, and a refusal worded twice is a refusal that drifts: the fractional-cycle
 * sentence already did, one commit after a pass whose whole subject was the two engines agreeing,
 * because nothing compared the strings. This file compares them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Declaration } from '@braindog/kernel';

import { NOW, ROWS } from './data.ts';
import { runway as walkAt, type Leg } from './forecast.ts';
import type { Entry } from './schema.ts';
/* THE SAMPLE'S ROWS WALKED AT THE SAMPLE'S CLOCK, which `runway` took for granted and now takes from its caller. */
const runway: typeof walkAt = (opening, legs, horizon, only, now = NOW) => walkAt(opening, legs, horizon, only, now);

const DAY = 86_400_000;
const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const LEG: Leg = { register: 'obligations', on: 'due', amount: 'amount', every: { field: 'repeats', months: { monthly: 1 } } };

const ROWS_HERE: Record<string, unknown>[] = [
  { what: 'Cleaner', amount: gbp(10_000), due: day(3), repeats: 'weekly' },
  { what: 'Window round', amount: gbp(2_000), due: day(4), repeats: 'weekly' },
  { what: 'Deposit', amount: gbp(30_000), due: day(2), repeats: 'none' },
  { what: 'Survey', amount: gbp(7_000), due: day(6) },
  { what: 'Rent', amount: gbp(50_000), due: day(10), repeats: 'monthly' },
  /* WEEKLY, BUT FIRST DUE PAST THE 60-DAY HORIZON, so nothing of it is missing from this walk. The
     checker deleted `walked.length` from the browser's count and every test here stayed green
     until this row was added. */
  { what: 'Gardener', amount: gbp(4_000), due: day(90), repeats: 'weekly' },
];

/** The browser's walk over these rows alone, with the demo's obligations put back afterwards. */
function webWalk(rows: Record<string, unknown>[]) {
  const held = ROWS.obligations!;
  const model = held[0]!;
  ROWS.obligations = rows.map((fields, i): Entry => ({ ...model, seq: i + 1, fields: fields as Entry['fields'] }));
  try {
    return runway(500_000, [LEG], 60);
  } finally {
    ROWS.obligations = held;
  }
}

/** The kernel's walk over the same rows, in a record that declares `weekly` and a leg that does not. */
async function kernelWalk(rows: Record<string, unknown>[]) {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  const register: Declaration = {
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
        { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'weekly'] },
      ],
    } as never,
  };
  try {
    const k = await openRecord(sql as unknown as Parameters<typeof openRecord>[0], { now: () => NOW });
    assert.ok((await k.install([register])).ok);
    for (const fields of rows) assert.ok(k.create('obligations', fields, { actor: 'p_1' }).ok);
    const out = k.runway(500_000, [LEG], 60);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value;
  } finally {
    db.close();
  }
}

test('A CYCLE THE LEG HAS NO FACTOR FOR IS SAID IN THE BROWSER TOO, and the row is still walked once', () => {
  const out = webWalk([ROWS_HERE[0]!]);
  assert.deepEqual(
    out.steps.map((s) => [s.day, s.label, s.delta]),
    [[day(3), 'Cleaner', -10_000]],
    'the row was dropped, or walked as a cycle the leg never named',
  );
  assert.deepEqual(out.refusals, [
    '1 row of obligations has repeats set to weekly, which this walk has no cycle for, and its money is in the walk once rather than every time it recurs. Give weekly a whole number of months on this leg, or set the row to a cycle the leg has.',
  ]);
});

test('NONE AND AN EMPTY CYCLE ARE A ONE-OFF IN THE BROWSER, AND SAY NOTHING', () => {
  const out = webWalk(ROWS_HERE.slice(2));
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.steps.map((s) => s.label), ['Deposit', 'Survey', 'Rent', 'Rent']);
});

test('THE TWO ENGINES WALK THE SAME ROWS AND REFUSE IN THE SAME SENTENCE', async () => {
  const web = webWalk(ROWS_HERE);
  const kernel = await kernelWalk(ROWS_HERE);
  assert.equal(web.refusals.length, 1, `the browser said: ${JSON.stringify(web.refusals)}`);
  assert.deepEqual(web.refusals, kernel.refusals.map((r) => r.fix));
  assert.deepEqual(
    web.steps.map((s) => [s.day, s.label, s.delta, s.balance]),
    kernel.steps.map((s) => [s.day, s.label, s.delta, s.balance]),
  );
});
