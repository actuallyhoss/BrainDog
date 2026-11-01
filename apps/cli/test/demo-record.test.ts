/**
 * Maya's demo record, as a plan (`scripts/demo/maya-record.mjs`): the rows agree with the site and with each other on
 * any day it is made. Nothing is sent; the plan is pure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// @ts-expect-error a script module, with no types of its own
import { mayaRecord } from '../scripts/demo/maya-record.mjs';
import { CENTS } from '../../site/src/lib/demo/maya.ts';

type Row = { key: string; register: string; fields: Record<string, unknown>; label: string };
type Plan = { rows: Row[]; figures: { cash: number; owedToYou: number; youOwe: number; late: { what: string; daysLate: number }[] }; today: string };

const DAYS = ['2026-10-31', '2026-11-01', '2026-11-17', '2027-02-28', '2027-03-31'];

test('the two bank accounts end on the cash the site says, on any day', () => {
  for (const day of DAYS) {
    const plan = mayaRecord(day) as Plan;
    assert.equal(plan.figures.cash, CENTS.cashAhead, day);
    const banks = plan.rows.filter((r) => r.register === 'accounts' && r.fields.liquid === true);
    assert.equal(banks.reduce((s, r) => s + (r.fields.balance as { amount: number }).amount, 0), CENTS.cashAhead, day);
  }
});

test('Northbound 1042 is the one late invoice, four days late, and Dana is owed', () => {
  for (const day of DAYS) {
    const plan = mayaRecord(day) as Plan;
    assert.deepEqual(plan.figures.late.map((l) => [l.what, l.daysLate]), [['Northbound invoice 1042', 4]], day);
    assert.ok(plan.figures.youOwe >= CENTS.danaInvoice, day);
  }
});

test('every row points only at rows written before it, and every key is one row', () => {
  for (const day of DAYS) {
    const plan = mayaRecord(day) as Plan;
    const seen = new Set<string>();
    const refs = (v: unknown): string[] =>
      Array.isArray(v) ? v.flatMap(refs) : v && typeof v === 'object' && typeof (v as { $ref?: unknown }).$ref === 'string' ? [(v as { $ref: string }).$ref] : [];
    for (const r of plan.rows) {
      assert.ok(!seen.has(r.key), `${day}: ${r.key} twice`);
      for (const to of Object.values(r.fields).flatMap(refs)) assert.ok(to.startsWith('cat:') || seen.has(to), `${day}: ${r.key} points at ${to} before it is written`);
      seen.add(r.key);
    }
  }
});

test('one currency, and nothing dated after the day it is made but what is still to come', () => {
  const plan = mayaRecord('2026-11-17') as Plan;
  for (const r of plan.rows)
    for (const v of Object.values(r.fields))
      if (v && typeof v === 'object' && 'currency' in v) assert.equal((v as { currency: string }).currency, 'USD', r.key);
  for (const r of plan.rows.filter((x) => x.register === 'transactions')) assert.ok(String(r.fields.on) <= plan.today, r.key);
});

test('the same day makes the same record', () => {
  const a = mayaRecord('2026-11-17') as Plan;
  const b = mayaRecord('2026-11-17') as Plan;
  assert.deepEqual([a.rows, a.figures], [b.rows, b.figures]);
});
