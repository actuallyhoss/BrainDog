/**
 * A FIGURE OVER A LIST THAT HOLDS NOTHING HAS NO VERDICT.
 *
 * `ledger-rows-7d` and `currencies-held` (the seed's money signs) are counts held to `gte: 1`. On a fresh record the
 * Ledger and the accounts are empty, the count is 0, and the kernel answered `met: false`, so an agent reading the
 * figures was told two things were wrong on a record nobody had started. The web already says no verdict when `held`
 * is 0 (`apps/web/src/lib/record/page-live.ts`, `tileOf`); this holds the kernel to withhold the miss.
 *
 * NOUGHT OVER ROWS THAT EXIST STILL MISSES ITS MARK: a Ledger that holds rows and kept none this week has stopped, and
 * says so. Only a miss over an empty list is unjudged: a count of none that meets an `lte` is still met.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const LEDGER: Declaration = {
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['pending', 'cleared'], index: true },
    ],
  } as never,
};

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'balance', type: 'money' }] } as never,
};

/** The seed's two, in their own shapes (`packages/seed/src/modules/money/figures/signs.ts`), over the lists above. */
const KEPT_7D = {
  metric: 'kept-7d',
  name: 'Kept on the Ledger, 7 days',
  source: 'register.ledger',
  where: 'state is cleared, on after -7d, on before +1d',
  value: { count: 'id' },
  format: 'int',
  target: { gte: 1 },
  window: '7d',
  compare: 'none',
} as MetricDecl;

const CURRENCIES = {
  metric: 'held-in',
  name: 'Currencies held',
  source: 'register.accounts',
  value: { currencies: 'balance' },
  format: 'int',
  target: { gte: 1 },
  window: '30d',
  compare: 'none',
} as MetricDecl;

const reading = (r: unknown): Reading => {
  const x = r as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function fresh() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([LEDGER, ACCOUNTS])).ok);
  return k;
}

test('A COUNT OVER AN EMPTY LIST HAS NO VERDICT, never a miss: a fresh record is not red', async () => {
  const k = await fresh();
  for (const decl of [KEPT_7D, CURRENCIES]) {
    const r = reading(k.metric(decl));
    assert.equal(r.held, 0, `${decl.metric} holds nothing`);
    assert.equal(r.met, null, `${decl.metric} read met: ${String(r.met)} on a list that holds nothing`);
  }
});

test('NOUGHT OVER ROWS THAT EXIST STILL MISSES: a Ledger that kept nothing this week has stopped', async () => {
  const k = await fresh();
  assert.ok(k.create('ledger', { what: 'Rent', on: '2026-09-20', state: 'cleared' }, { actor: 'p_1' }).ok);
  const r = reading(k.metric(KEPT_7D));
  assert.equal(r.value, 0);
  assert.equal(r.held, 1);
  assert.equal(r.met, false);
  /* AND AN ACCOUNT THAT HOLDS NO MONEY IS HELD: a count of currencies that misses over it is still a miss. */
  assert.ok(k.create('accounts', { what: 'Current' }, { actor: 'p_1' }).ok);
  const c = reading(k.metric(CURRENCIES));
  assert.equal(c.value, 0);
  assert.equal(c.held, 1);
  assert.equal(c.met, false);
});

test('AND A LIST THAT HOLDS WHAT THE FIGURE ASKS FOR MEETS IT', async () => {
  const k = await fresh();
  assert.ok(k.create('ledger', { what: 'Rent', on: '2026-10-08', state: 'cleared' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('accounts', { what: 'Current', balance: { amount: 18_730_45, currency: 'USD' } }, { actor: 'p_1' }).ok);
  assert.equal(reading(k.metric(KEPT_7D)).met, true);
  assert.equal(reading(k.metric(CURRENCIES)).met, true);
});

test('A COUNT OF NONE THAT MEETS ITS MARK OVER AN EMPTY LIST STILL MEETS IT: lte 0 on nothing is no late bill', async () => {
  /* ONLY A MISS IS WITHHELD. `vital-absent.test.ts` holds an `lte 0` sign green over an empty list, and nothing held
     is no late bill; it is a miss that nothing held cannot prove. */
  const k = await fresh();
  const r = reading(k.metric({ ...KEPT_7D, metric: 'none-pending', where: 'state is pending', target: { lte: 0 } } as MetricDecl));
  assert.equal(r.held, 0);
  assert.equal(r.met, true);
});
