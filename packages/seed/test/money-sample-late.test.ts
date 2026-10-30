/**
 * The sample's paid bills and invoices are settled on the habit of the party each names (review 30 Oct, R15): the
 * party became Halden or Ravensworth for money in and the accountant or nobody for a cost, while the lateness was still
 * read off the number drawn, so an invoice to Halden could be paid on another party's days.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { day } from '../src/modules/base.ts';
import { LATE_BY, OBLIGATIONS } from '../src/modules/money/sample.ts';

const daysOf = (iso: unknown): number => Date.parse(String(iso)) / 86_400_000;

test('A SAMPLE ROW IS SETTLED ON THE HABIT OF THE PARTY IT NAMES, never later than yesterday', () => {
  /* THE GENERATED TAIL, the last 24 rows; the hand-written ones above it say their own settled days. */
  const paid = OBLIGATIONS.slice(-24).filter((o) => o.state === 'paid');
  assert.ok(paid.length > 0, 'the sample has no paid row left to read');
  for (const o of paid) {
    const late = typeof o.party === 'number' ? (LATE_BY[o.party] ?? 0) : 0;
    assert.equal(daysOf(o.settled), Math.min(daysOf(o.due) + late, daysOf(day(-1))), `${String(o.what)} is settled off its party's habit`);
  }
});
