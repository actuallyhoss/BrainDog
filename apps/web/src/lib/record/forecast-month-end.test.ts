/**
 * A yearly bill taken on 28 February, in the browser's walk, and held against the kernel's.
 *
 * THE MONTH-END RULE READ 28 FEBRUARY OF A COMMON YEAR AS "THE END OF THE MONTH", in both engines,
 * because `48eeaf4c` copied W57-2 across line for line. Audit fifty-eight finding 10: a yearly bill on
 * 2027-02-28 walked 2028-02-29, a day after the anniversary it renews on. A cycle of whole years now
 * keeps its day of the month and leaves a leap-day start to the clamp, which gives 28 February in a
 * common year and 29 February in a leap one.
 *
 * AND THE TWO WALKS MUST AGREE ON THE SAME ROWS. `engines.test.ts` compares them over the demo's
 * records, and the demo has no yearly row on the last day of February, so a repair made in one engine
 * alone would have passed it. This file walks the same rows through both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Declaration } from '@braindog/kernel';

import { NOW, ROWS } from './data.ts';
import { runway, type Leg } from './forecast.ts';
import type { Entry } from './schema.ts';

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const LEG: Leg = {
  register: 'obligations',
  on: 'due',
  amount: 'amount',
  every: { field: 'repeats', months: { monthly: 1, 'half-yearly': 6, yearly: 12, 'two-yearly': 24 } },
};

/* EIGHT YEARS FROM THE DEMO'S 3 SEPTEMBER 2026, so every walk below reaches two leap Februaries. */
const HORIZON = 3000;

/** The days one row walks on in the browser, with the demo's obligations put back afterwards. */
function webDays(due: string, repeats: string): string[] {
  const held = ROWS.obligations!;
  const model = held[0]!;
  ROWS.obligations = [{ ...model, seq: 1, fields: { what: 'Licence', amount: gbp(12_000), due, repeats } as Entry['fields'] }];
  try {
    const out = runway(5_000_000, [LEG], HORIZON);
    assert.deepEqual(out.refusals, []);
    return out.steps.map((s) => s.day);
  } finally {
    ROWS.obligations = held;
  }
}

/** The days the same row walks on in the kernel, in a record of its own on the demo's clock. */
async function kernelDays(due: string, repeats: string): Promise<string[]> {
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
        { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'half-yearly', 'yearly', 'two-yearly'] },
      ],
    } as never,
  };
  try {
    const k = await openRecord(sql as unknown as Parameters<typeof openRecord>[0], { now: () => NOW });
    assert.ok((await k.install([register])).ok);
    assert.ok(k.create('obligations', { what: 'Licence', amount: gbp(12_000), due, repeats }, { actor: 'p_1' }).ok);
    const out = k.runway(5_000_000, [LEG], HORIZON);
    assert.ok(out.ok, JSON.stringify(out));
    assert.deepEqual(out.value.refusals, []);
    return out.value.steps.map((s) => s.day);
  } finally {
    db.close();
  }
}

/** The browser's walk, checked against what it should be and against the kernel's walk of the same row. */
async function walks(due: string, repeats: string, expected: string[]) {
  const web = webDays(due, repeats);
  assert.deepEqual(web, expected, 'the browser walked this row somewhere else');
  assert.deepEqual(await kernelDays(due, repeats), web, 'the kernel and the browser walked the same row to different days');
}

test('A YEARLY BILL ON 28 FEBRUARY 2027 RENEWS ON 28 FEBRUARY IN 2028 AND 2032, in both engines', async () => {
  await walks('2027-02-28', 'yearly', ['2027-02-28', '2028-02-28', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-28', '2033-02-28', '2034-02-28']);
});

/* STARTED IN 2026 SO EVERY STEP FALLS IN A LEAP YEAR. The first cycle is behind the demo's clock and is
   skipped as already charged. */
test('and a two-yearly one taken on 28 February 2026 renews on the 28th of every leap February', async () => {
  await walks('2026-02-28', 'two-yearly', ['2028-02-28', '2030-02-28', '2032-02-28', '2034-02-28']);
});

test('A YEARLY BILL ON 29 FEBRUARY IS ON THE LAST DAY OF EVERY LATER FEBRUARY, in both engines', async () => {
  await walks('2028-02-29', 'yearly', ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29', '2033-02-28', '2034-02-28']);
});

/* A CYCLE THAT LEAVES FEBRUARY STILL READS ITS LAST DAY AS THE END OF THE MONTH. */
test('A HALF-YEARLY BILL ON 28 FEBRUARY IS ON THE LAST DAY OF EVERY AUGUST AND FEBRUARY, in both engines', async () => {
  const out = webDays('2027-02-28', 'half-yearly').slice(0, 5);
  assert.deepEqual(out, ['2027-02-28', '2027-08-31', '2028-02-29', '2028-08-31', '2029-02-28']);
  assert.deepEqual((await kernelDays('2027-02-28', 'half-yearly')).slice(0, 5), out);
});
