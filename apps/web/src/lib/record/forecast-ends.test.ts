/**
 * A repeating row with an end day, in the browser's walk, and held against the kernel's.
 *
 * `Leg.ends` WAS ADDED TO BOTH ENGINES AT ONCE, and `engines.test.ts` would not have noticed one of them alone: the
 * demo's records carry no leg that names an end, so both walks agree over them whether or not either reads the field.
 * This file walks the same ended rows through both, on the demo's clock of 3 September 2026. Before the field, the
 * browser walked the monthly row below twelve times over a year where its end allows two, the same fault the kernel's
 * `test/forecast-ends.test.ts` measured.
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

const usd = (amount: number) => ({ amount, currency: 'USD' });

const LEG: Leg = {
  register: 'obligations',
  on: 'due',
  amount: 'amount',
  every: { field: 'repeats', months: { monthly: 1, quarterly: 3, yearly: 12 } },
  ends: 'ends',
};

type Walk = { steps: string[]; refusals: string[] };

/** One row walked in the browser over a year, with the demo's obligations put back afterwards. */
function webWalk(fields: Record<string, unknown>, leg: Leg): Walk {
  const held = ROWS.obligations!;
  const model = held[0]!;
  ROWS.obligations = [{ ...model, seq: 1, fields: { what: 'Salary', amount: usd(100_000), repeats: 'monthly', ...fields } as Entry['fields'] }];
  try {
    const out = runway(0, [leg], 365);
    return { steps: out.steps.map((s) => `${s.day} ${String(s.delta)}`), refusals: [...out.refusals] };
  } finally {
    ROWS.obligations = held;
  }
}

/** The same row walked in the kernel, in a record of its own on the demo's clock. */
async function kernelWalk(fields: Record<string, unknown>, leg: Leg): Promise<Walk> {
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
        { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'quarterly', 'yearly'] },
        { id: 'ends', type: 'day' },
        { id: 'until', type: 'text' },
      ],
    } as never,
  };
  try {
    const k = await openRecord(sql as unknown as Parameters<typeof openRecord>[0], { now: () => NOW });
    assert.ok((await k.install([register])).ok);
    assert.ok(k.create('obligations', { what: 'Salary', amount: usd(100_000), repeats: 'monthly', ...fields }, { actor: 'p_1' }).ok);
    const out = k.runway(0, [leg], 365);
    assert.ok(out.ok, JSON.stringify(out));
    return { steps: out.value.steps.map((s) => `${s.day} ${String(s.delta)}`), refusals: out.value.refusals.map((r) => r.fix) };
  } finally {
    db.close();
  }
}

/** The browser's walk, checked against what it should be and against the kernel's walk of the same row. */
async function walks(fields: Record<string, unknown>, expected: Walk, leg: Leg = LEG) {
  const web = webWalk(fields, leg);
  assert.deepEqual(web, expected, 'the browser walked this row somewhere else');
  assert.deepEqual(await kernelWalk(fields, leg), web, 'the kernel and the browser walked the same row to different days');
}

test('A MONTHLY LINE ENDING ON 20 OCTOBER WALKS 15 SEPTEMBER AND 15 OCTOBER AND NOTHING AFTER, in both engines', async () => {
  await walks({ due: '2026-09-15', ends: '2026-10-20' }, { steps: ['2026-09-15 -100000', '2026-10-15 -100000'], refusals: [] });
});

test('a payday on the end day is walked, and one on the day after is not, in both engines', async () => {
  await walks({ due: '2026-09-15', ends: '2026-10-15' }, { steps: ['2026-09-15 -100000', '2026-10-15 -100000'], refusals: [] });
  await walks({ due: '2026-09-15', ends: '2026-10-14' }, { steps: ['2026-09-15 -100000'], refusals: [] });
});

/* THE ONE-OFF TOO, because only a one-off reaches the guard at the top of `occurrences`: a repeating row stops on its
   first step anyway, so with the repeating case alone the browser's guard could be deleted and this file stayed green
   while the two engines walked a one-off due after its end differently. Measured by deleting it. */
test('a row whose first day is past its end walks nothing, repeating or not, in both engines', async () => {
  await walks({ due: '2026-10-01', ends: '2026-09-28' }, { steps: [], refusals: [] });
  await walks({ due: '2026-10-01', ends: '2026-09-28', repeats: 'none' }, { steps: [], refusals: [] });
});

test('an end no day reader can read leaves the row out, in the same words in both engines', async () => {
  await walks(
    { due: '2026-09-15', until: 'when the contract stops' },
    { steps: [], refusals: ['1 row of obligations has an end in until that this walk could not read, and its money is not in it.'] },
    { ...LEG, ends: 'until' },
  );
});
