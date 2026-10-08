/**
 * A FIGURE OVER A FIELD NOBODY FILLED IS UNSAID, NOT NOUGHT (batch 38's drawn-kernel-web, B5). A figure whose own `where`
 * requires the field it reduces (`amount is set`) and matched no row while the list holds rows reads `unsaid: true`, so
 * `drawn.ts` leaves "Earning £0" out on the record as the web's `overUnsaidField` already did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const DEALS: Declaration = {
  id: 'register.deals',
  kind: 'register',
  body: {
    id: 'deals',
    name: 'Deals',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', index: true },
    ],
  } as never,
};

const EARNING = (where: string): MetricDecl => ({
  metric: 'earning',
  name: 'Earning',
  source: 'register.deals',
  where,
  value: { sum: 'amount' },
  format: 'money',
  target: { gte: 1 },
  window: '30d',
  compare: 'none',
});

const reading = (r: unknown): Reading => {
  const x = r as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('NO ROW SAID THE AMOUNT: unsaid, and only while the where asks for it and rows are held', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([DEALS])).ok);
  assert.equal(reading(k.metric(EARNING('amount is set'))).unsaid, undefined, 'an empty list is empty, not unsaid');
  assert.ok(k.create('deals', { what: 'Kiln' }, { actor: 'p_1' }).ok);
  const quiet = reading(k.metric(EARNING('amount is set')));
  assert.equal(quiet.rows, 0);
  assert.equal(quiet.unsaid, true, 'a row with no amount under "amount is set" is a figure nobody said');
  assert.equal(reading(k.metric(EARNING('what is set'))).unsaid, undefined, 'a where that does not name the reduced field says nothing of it');
  assert.ok(k.create('deals', { what: 'Marlow', amount: { amount: 5_000, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  assert.equal(reading(k.metric(EARNING('amount is set'))).unsaid, undefined, 'one row said it, so the figure is read');
});
