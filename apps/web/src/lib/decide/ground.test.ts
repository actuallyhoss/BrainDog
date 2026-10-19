import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groundOf, monthKey, refOf, rowOf, type GroundRead } from './ground.ts';

const now = Date.UTC(2026, 9, 20, 9);
const read = (): GroundRead => ({
  rows: new Map([
    ['pay#3', { account: 'bank#1', category: 'tags#2', amount: { amount: 4500, currency: 'GBP' } }],
    ['bank#1', { balance: { amount: 200000, currency: 'GBP' } }],
    ['tags#2', { name: 'Software' }],
  ]),
  month: new Map([
    [
      monthKey('pay', 'bank#1'),
      [
        { on: '2026-10-02', direction: 'out', amount: { amount: 1000, currency: 'GBP' } },
        { on: '2026-10-09', direction: 'out', amount: { amount: 2500, currency: 'GBP' } },
        { on: '2026-10-10', direction: 'in', amount: { amount: 9900, currency: 'GBP' } },
        { on: '2026-09-30', direction: 'out', amount: { amount: 7000, currency: 'GBP' } },
        { on: '2026-10-11', direction: 'out', transfer: true, amount: { amount: 5000, currency: 'GBP' } },
      ],
    ],
  ]),
});

test('a row names its account, month, filing and figure', () => {
  const g = groundOf('pay#3', read(), now);
  assert.deepEqual(g?.balance, { amount: 200000, currency: 'GBP' });
  assert.deepEqual(g?.spend, { amount: 3500, currency: 'GBP' });
  assert.equal(g?.listName, 'Software');
  assert.match(g?.figure ?? '', /45/u);
});

test('a question about no row, or a row not read, has no ground', () => {
  assert.equal(groundOf(undefined, read(), now), undefined);
  assert.equal(groundOf('pay#9', read(), now), undefined);
  assert.equal(groundOf('not a row', read(), now), undefined);
});

test('the list name stands in when the row is filed under nothing', () => {
  const r = read();
  r.rows.set('pay#3', { amount: { amount: 100, currency: 'GBP' } });
  assert.equal(groundOf('pay#3', r, now, 'Payments')?.listName, 'Payments');
});

test('spoken ids parse, anything else does not', () => {
  assert.deepEqual(rowOf(' pay#3 '), { spoken: 'pay#3', register: 'pay' });
  assert.equal(refOf('pay#0'), null);
  assert.equal(refOf({}), null);
});
