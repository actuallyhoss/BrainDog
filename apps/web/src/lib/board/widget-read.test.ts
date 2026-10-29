import { test } from 'node:test';
import assert from 'node:assert/strict';

import { figureSaid, rowLine } from './widget-read.ts';
import { asksWidgets, widgetRows } from './palette-rows.ts';
import { answered, forgotten, heldOf } from './held.ts';

test('a figure is said in its own currency, whole, and a day as a short date', () => {
  assert.equal(figureSaid({ value: 3385000, unit: 'GBP', format: 'money' }, 'GBP'), '£33,850');
  assert.equal(figureSaid({ value: 57, unit: null, format: 'days' }, null), '57 days');
  assert.equal(figureSaid({ value: null, unit: null, format: 'int' }, null), '—');
});

test('a row with a budget says what is left of it', () => {
  assert.match(rowLine({ title: 'Food', amount: { amount: 40000, currency: 'GBP' }, done: 22000, of: 40000 }, 'GBP'), /£180 left of £400/u);
});

test('the palette offers Add a widget for "add", "widget" and "/w", and the offer with its count', () => {
  assert.ok(asksWidgets('add'));
  assert.ok(asksWidgets('/w'));
  assert.ok(asksWidgets('widget'));
  assert.ok(!asksWidgets('add Kiln to tasks'));
  const rows = widgetRows('widget', { key: 'widget:spending', widget: 'spending', title: 'Spending', why: 'You asked.', size: 'wide', block: {}, signal: 'S1', score: 3, asked: 3 }, '/');
  assert.equal(rows.length, 2);
  assert.equal(rows[1]!.detail, 'You’ve asked this 3 times');
});

test('Not now keeps the day, and Forget clears what was put off', () => {
  const now = Date.UTC(2026, 9, 29, 12);
  const held = answered(heldOf({}), 'widget:spending', now);
  assert.deepEqual(held.notNow, ['widget:spending@2026-10-29']);
  assert.equal(held.last, '2026-10-29');
  assert.deepEqual(forgotten(held, now).notNow, []);
  assert.equal(forgotten(held, now).forgot, '2026-10-29');
});
