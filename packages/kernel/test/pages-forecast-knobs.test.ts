/**
 * The forecast's later controls, reachable from a declaration: the four knob words and the `sell:` figure.
 *
 * THE CONTROLS WERE BUILT AND NO PAGE COULD TURN THEM ON. `packages/render/src/forecast.ts` reads eight knob words and a
 * `sell` row, and this file's `KNOBS` held four, so a page that asked for `grow` was refused DECLARATION_INVALID and
 * the whole walk drew nothing. And holdings sold on a day need a figure the host has read, since the renderer only
 * does arithmetic over rows it was handed: `sell:` names that figure and `sells` is the answer.
 *
 * MONEY IS THE WORST PLACE TO BE WRONG, so every figure below is asserted to the minor unit against what the record
 * itself reads for the same declaration, and the figures are invented ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type PageBlock } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const OWNER = { actor: 'p_1' };

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'balance', type: 'money', required: true },
    ],
  },
};

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', required: true },
    ],
  },
};

const STORE: Declaration = {
  id: 'register.store',
  kind: 'register',
  body: {
    id: 'store',
    name: 'Store of value',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'worth', type: 'money' },
    ],
  },
};

const figure = (metric: string, name: string, source: string, sum: string, format: string): Declaration => ({
  id: `metric.${metric}`,
  kind: 'metric',
  body: { metric, name, source, value: { sum }, format, target: { gte: 0 }, window: '30d', compare: 'none' },
});

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(
    await k.install([
      ACCOUNTS,
      BILLS,
      STORE,
      figure('cash-now', 'Cash now', 'register.accounts', 'balance', 'money.GBP'),
      figure('store-value', 'Store value', 'register.store', 'worth', 'money.GBP'),
    ]),
  );
  value(k.create('accounts', { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } }, OWNER));
  value(k.create('bills', { what: 'Rent', amount: { amount: 600_000, currency: 'GBP' }, due: '2026-10-01' }, OWNER));
  value(k.create('store', { what: 'Coins', worth: { amount: 150_075, currency: 'GBP' } }, OWNER));
  value(k.create('store', { what: 'Bond', worth: { amount: 99_901, currency: 'GBP' } }, OWNER));
  return k;
}

const walk = (more: Partial<PageBlock> = {}): PageBlock => ({
  kind: 'forecast',
  source: 'forecast.runway',
  opening: { metric: 'cash-now' },
  from: [{ register: 'bills', on: 'due', amount: 'amount' }],
  horizon: 90,
  ...more,
});

test('EVERY KNOB THE RENDERER DRAWS IS A WORD A DECLARATION MAY TURN ON, and a word it does not draw is still refused', async () => {
  const k = await record();
  const all = k.block(walk({ knobs: ['horizon', 'late', 'spend', 'leave', 'grow', 'drift', 'count', 'sell'] }));
  assert.deepEqual(all.refusals, []);
  assert.equal(all.walk?.from, 412_345);
  const wrong = k.block(walk({ knobs: ['horizon', 'payrise'] }));
  assert.equal(wrong.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(wrong.refusals[0]?.at, 'knobs');
  assert.equal(wrong.walk, undefined, 'a refused knob list draws no walk, as before');
});

test('WHAT THE SELL CONTROL MAY COUNT AS SOLD IS THE FIGURE `sell:` NAMES, to the minor unit, in the walk’s own money', async () => {
  const k = await record();
  const out = k.block(walk({ knobs: ['sell'], sell: { metric: 'store-value' } }));
  assert.deepEqual(out.refusals, []);
  /* THE SAME DECLARATION READ ON ITS OWN, so the number on the control is the number the record holds and not a copy. */
  const read = value<{ value: number; unit: string }>(k.metric(k.metricDecl('store-value')!));
  assert.equal(read.value, 249_976, 'GBP 1,500.75 and GBP 999.01');
  assert.deepEqual(out.sells, [{ label: 'Store value', value: read.value }]);
  assert.equal(out.walk?.currency, read.unit);
  /* AND THE WALK ITSELF IS NOT MOVED: holdings are sold only when a reader picks a day, which the host never does. */
  assert.deepEqual(out.walk, k.block(walk()).walk);
});

test('A SELL FIGURE IN ANOTHER CURRENCY IS NOT OFFERED, rather than counted as the walk’s money', async () => {
  const k2 = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k2.install([ACCOUNTS, BILLS, STORE, figure('cash-now', 'Cash now', 'register.accounts', 'balance', 'money.GBP'), figure('store-value', 'Store value', 'register.store', 'worth', 'money.USD')]));
  value(k2.create('accounts', { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } }, OWNER));
  value(k2.create('bills', { what: 'Rent', amount: { amount: 600_000, currency: 'GBP' }, due: '2026-10-01' }, OWNER));
  value(k2.create('store', { what: 'Coins', worth: { amount: 150_075, currency: 'USD' } }, OWNER));
  /* THE FIGURE READS, so what is left out below is left out for its currency and not for reading nothing. */
  assert.deepEqual(
    (({ value: v, unit }) => ({ v, unit }))(value<{ value: number; unit: string }>(k2.metric(k2.metricDecl('store-value')!))),
    { v: 150_075, unit: 'USD' },
  );
  const out = k2.block(walk({ sell: { metric: 'store-value' } }));
  assert.deepEqual(out.refusals, []);
  assert.equal(out.walk?.currency, 'GBP');
  assert.deepEqual(out.sells, [], 'USD 1,500.75 is not GBP 1,500.75');
});

test('A WALK WITH NOTHING DUE STILL OFFERS THE SELL FIGURE, in the money its opening figure is', async () => {
  /* NO BILLS AT ALL, so the walk has no step to take a currency from. Measured: with the opening's unit
     taken out as the fallback, `sells` came back empty here and every other test in this file still passed. */
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([ACCOUNTS, BILLS, STORE, figure('cash-now', 'Cash now', 'register.accounts', 'balance', 'money.GBP'), figure('store-value', 'Store value', 'register.store', 'worth', 'money.GBP')]));
  value(k.create('accounts', { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } }, OWNER));
  value(k.create('store', { what: 'Coins', worth: { amount: 150_075, currency: 'GBP' } }, OWNER));
  const out = k.block(walk({ sell: { metric: 'store-value' } }));
  assert.deepEqual(out.refusals, []);
  assert.equal(out.walk?.steps.length, 0);
  assert.deepEqual(out.sells, [{ label: 'Store value', value: 150_075 }]);
});

test('A SELL FIGURE THAT HOLDS NOTHING, OR LESS THAN NOTHING, IS NOT OFFERED', async () => {
  /* A ZERO WAS OFFERED WHEN THE `> 0` WAS TAKEN OUT, and no other test here noticed: a control called `Store value sold on`
     that moves nothing is a control that says something is there when nothing is. */
  const k = await record();
  value(k.create('store', { what: 'Loan against the coins', worth: { amount: -249_976, currency: 'GBP' } }, OWNER));
  assert.equal(value<{ value: number }>(k.metric(k.metricDecl('store-value')!)).value, 0);
  assert.deepEqual(k.block(walk({ sell: { metric: 'store-value' } })).sells, []);
  value(k.create('store', { what: 'Margin call', worth: { amount: -1, currency: 'GBP' } }, OWNER));
  assert.deepEqual(k.block(walk({ sell: { metric: 'store-value' } })).sells, []);
});

test('A SELL FIGURE NOBODY DECLARED IS SAID, and so is a `sell:` that names no figure', async () => {
  const k = await record();
  const unknown = k.block(walk({ sell: { metric: 'store-later' } }));
  assert.equal(unknown.refusals[0]?.code, 'METRIC_UNKNOWN');
  assert.equal(unknown.refusals[0]?.at, 'sell');
  const shapeless = k.block(walk({ sell: 'store-value' as never }));
  assert.equal(shapeless.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(shapeless.refusals[0]?.at, 'sell');
});

test('A WALK THAT READS A SELL FIGURE READS THAT FIGURE’S LIST, so a reader who may not open the list is not handed its total', async () => {
  const k = await record();
  assert.deepEqual(k.blockRegisters(walk()).sort(), ['accounts', 'bills']);
  assert.deepEqual(k.blockRegisters(walk({ sell: { metric: 'store-value' } })).sort(), ['accounts', 'bills', 'store']);
});

test('ONE WALK A CURRENCY CARRIES NO SELLS, since each walk is drawn with the block’s keys and a figure has one currency', async () => {
  const k = await record();
  value(k.create('bills', { what: 'Hosting', amount: { amount: 1_000, currency: 'USD' }, due: '2026-09-20' }, OWNER));
  const out = k.block(walk({ sell: { metric: 'store-value' } }));
  assert.deepEqual(out.refusals, []);
  assert.equal(out.walks?.length, 2);
  assert.equal(out.sells, undefined);
});
