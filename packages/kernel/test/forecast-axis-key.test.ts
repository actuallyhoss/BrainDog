/**
 * A forecast's `axis` (forecast-axis-93): `fit`, what saying nothing draws, or `zero`, always from nought. Any other word is
 * refused where the page is installed and where the block is read, in one sentence that names both words.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forecastAxisFault, kindsReading } from '../src/block-keys.ts';
import { validate, type Declaration } from '../src/declare.ts';
import { openRecord, type PageBlock } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);

test('THE KEY IS A FORECAST\'S ALONE, and its fault names the two words', () => {
  assert.deepEqual(kindsReading('axis'), ['forecast']);
  assert.equal(forecastAxisFault({ axis: 'zero' }, 'x'), null);
  assert.equal(forecastAxisFault({ axis: 'fit' }, 'x'), null);
  assert.equal(forecastAxisFault({}, 'x'), null, 'saying nothing is fit');
  const f = forecastAxisFault({ axis: 'wide' }, 'money.cash-ahead')!;
  assert.equal(f.at, 'axis');
  assert.deepEqual(f.allowed, ['fit', 'zero']);
  assert.match(f.fix, /axis is "wide"; a forecast's axis is fit, .* or zero/u);
});

const page = (axis: unknown): Declaration => ({
  id: 'page.money',
  kind: 'page',
  body: {
    page: 'money',
    title: 'Money',
    blocks: [{ kind: 'forecast', source: 'forecast.runway', opening: { metric: 'cash-now' }, from: [{ register: 'bills', on: 'due', amount: 'amount' }], horizon: 90, axis }],
  } as never,
});

test('A PAGE WHOSE FORECAST SAYS ANOTHER WORD IS REFUSED AT INSTALL, at the block\'s axis', () => {
  assert.equal(validate(page('zero')), null);
  const r = validate(page('wide'));
  assert.equal(r?.code, 'DECLARATION_INVALID');
  assert.equal(r?.at, 'blocks[0].axis');
  assert.deepEqual(r?.allowed, ['fit', 'zero']);
  assert.match(r!.fix, /axis is "wide"; a forecast's axis is fit, .* or zero/u);
});

test('A FORECAST READ WITH ANOTHER WORD IS REFUSED, and draws no walk', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([
    { id: 'register.accounts', kind: 'register', body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money', required: true }] } },
    { id: 'register.bills', kind: 'register', body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }, { id: 'due', type: 'day', required: true }] } },
    { id: 'metric.cash-now', kind: 'metric', body: { metric: 'cash-now', name: 'Cash now', source: 'register.accounts', value: { sum: 'balance' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } },
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('accounts', { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  const walk = (more: Partial<PageBlock>): PageBlock => ({ kind: 'forecast', source: 'forecast.runway', opening: { metric: 'cash-now' }, from: [{ register: 'bills', on: 'due', amount: 'amount' }], horizon: 90, ...more });
  const zero = k.block(walk({ axis: 'zero' }));
  assert.deepEqual(zero.refusals, []);
  assert.equal(zero.walk?.from, 412_345);
  const wrong = k.block(walk({ axis: 'wide' as never }));
  assert.equal(wrong.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(wrong.refusals[0]?.at, 'axis');
  assert.equal(wrong.walk, undefined);
});
