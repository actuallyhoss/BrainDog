import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync } from 'node:fs';

import { COUNTABLE, counterReady, countFields, differenceOf, exponentOf, typedTotalOf, linesOf, noteSet, notesOf, stepped, totalOf, typedCount } from './cash-count.ts';

test('each currency has its own notes, largest first, and an unknown one has none', () => {
  assert.deepEqual(noteSet('EGP').slice(0, 3), ['200', '100', '50']);
  assert.equal(noteSet('usd')[0], '100');
  assert.deepEqual(noteSet('JPY'), []);
  assert.deepEqual([...COUNTABLE].sort(), ['AED', 'EGP', 'EUR', 'GBP', 'SAR', 'USD']);
});

test('the total is worked in hundredths, so quarters and tenths add up exactly', () => {
  assert.equal(totalOf({ '200': 3, '0.25': 4 }), 60100);
  assert.equal(totalOf({ '0.1': 3, '0.05': 1 }), 35);
  assert.equal(totalOf({}), 0);
});

test('a count keeps only the notes that were counted', () => {
  assert.deepEqual(notesOf({ '100': 2, '50': 0, '20': 1 }), { '100': 2, '20': 1 });
});

test('the steppers stop at nothing and at the most, and a typed box keeps digits only', () => {
  assert.equal(stepped(0, -1), 0);
  assert.equal(stepped(9999, 1), 9999);
  assert.equal(stepped(4, 1), 5);
  assert.equal(typedCount('1a2'), 12);
  assert.equal(typedCount(''), 0);
  assert.equal(typedCount('999999'), 9999);
});

test('the difference is counted less expected', () => {
  assert.equal(differenceOf(50000, 52500), -2500);
});

test('lines are checked against the difference, and the rest is what is left', () => {
  const ok = linesOf([{ what: ' Taxi ', amount: '10.50', category: 'Transport' }, { what: '', amount: '', category: '' }], -2500);
  assert.deepEqual(ok, { ok: true, lines: [{ what: 'Taxi', amount: 10.5, category: 'Transport' }], rest: 1450 });
  assert.equal(linesOf([{ what: 'Taxi', amount: '30', category: '' }], -2500).ok, false);
  assert.equal(linesOf([{ what: '', amount: '5', category: '' }], -2500).ok, false);
  assert.equal(linesOf([{ what: 'Taxi', amount: '0', category: '' }], -2500).ok, false);
  assert.deepEqual(linesOf([], 400), { ok: true, lines: [], rest: 400 });
});

test('the row carries the total, the notes, and the way the difference is recorded only when the cash was out', () => {
  const base = { account: 'a1', currency: 'EGP', counts: { '200': 2, '50': 0 }, day: '2026-10-27', lines: [] };
  assert.deepEqual(countFields({ ...base, out: false, reconcile: 'discrepancy' }), {
    account: 'a1',
    on: '2026-10-27',
    counted: { amount: 40000, currency: 'EGP' },
    denominations: { currency: 'EGP', notes: { '200': 2 } },
  });
  const out = countFields({ ...base, out: true, reconcile: 'lines', lines: [{ what: 'Taxi', amount: 10 }] });
  assert.equal(out.filed, 'lines');
  assert.deepEqual(out.lines, [{ what: 'Taxi', amount: 10 }]);
  assert.equal(countFields({ ...base, out: true, reconcile: 'discrepancy' }).lines, undefined);
});

test('a typed total is worked in the currency\'s own minor unit', () => {
  assert.equal(exponentOf('EGP'), 2);
  assert.equal(exponentOf('JPY'), 0);
  assert.equal(typedTotalOf('1,250.5', 'EGP'), 125050);
  assert.equal(typedTotalOf('5000', 'JPY'), 5000);
  assert.equal(typedTotalOf('abc', 'EGP'), 0);
  assert.equal(typedTotalOf('', 'EGP'), 0);
});

test('the counter opens only onto a list the record holds, and a record without the add-on gets an empty screen', () => {
  const lists = [{ id: 'accounts' }, { id: 'cash_counts' }];
  assert.equal(counterReady('cash_counts', lists), true);
  assert.equal(counterReady(null, lists), false, '/count opened bare');
  assert.equal(counterReady('', lists), false);
  assert.equal(counterReady('cash_counts', [{ id: 'accounts' }]), false, 'the add-on is not installed');
  assert.equal(counterReady('cash_counts', []), true, 'the lists are not known yet');
  /* AND THE SCREEN ASKS NOTHING AND DRAWS THE EMPTY STATE FIRST, so it never settles as a refusal. */
  const page = readFileSync(new URL('../../routes/count/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /const ready = \$derived\(counterReady\(into, lists\)\)/u);
  assert.match(page, /!ready \? null :/u);
  assert.match(page, /\{#if !ready && installed && into === null\}\s*<Empty [^>]*>[\s\S]*?\{:else if !ready\}\s*<Empty /u);
});
