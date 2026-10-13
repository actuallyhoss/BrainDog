/**
 * The two forms a template writes a message in: `{{short:amount}}` and `{{on:due}}`.
 *
 * WHAT WAS WRONG. Every form a template had for an amount wrote `EGP 12,000.00`, and every form it had for a day wrote
 * `2026-10-30` or a count of days. Both are right in a note the record keeps and wrong in a message somebody sends: a
 * drafted chase reads "The invoice for EGP 12,000 was due on 30 Oct", and no template could write that sentence.
 *
 * THE OLD FORMS WRITE WHAT THEY WROTE. `{{amount}}`, `{{money:amount}}`, `{{due}}`, `{{ago:due}}` and a form nobody
 * declared are each pinned here beside the new ones, since rules stored on real records are filled by them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fillTemplate, type Entry } from '../src/index.ts';

/** Eleven days after the due day, in the due day's own year. */
const NOW = Date.UTC(2026, 10, 10, 12);

const row = (fields: Record<string, unknown>): Entry => ({
  id: '01JB0000000000000000000000',
  register: 'obligations',
  seq: 8,
  fields: fields as never,
  state: null,
  version: 1,
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-01T09:00:00.000Z',
  deleted_at: null,
});

const money = (amount: number, currency: string) => ({ amount, currency });
const INVOICE = row({ what: 'Poster run', amount: money(1_200_000, 'EGP'), due: '2026-10-30' });
const short = (amount: number, currency: string) => fillTemplate('{{short:amount}}', row({ amount: money(amount, currency) }), NOW);
const on = (due: unknown, nowMs = NOW) => fillTemplate('{{on:due}}', row({ due }), nowMs);

test('the chase draft is one template now: whole units, and the day with its month', () => {
  assert.equal(
    fillTemplate('The invoice for {{short:amount}} was due on {{on:due}}. Could you tell me when it will be paid?', INVOICE, NOW),
    'The invoice for EGP 12,000 was due on 30 Oct. Could you tell me when it will be paid?',
  );
});

test('the forms that held before hold still', () => {
  assert.equal(fillTemplate('{{amount}}', INVOICE, NOW), 'EGP 12,000.00');
  assert.equal(fillTemplate('{{money:amount}}', INVOICE, NOW), 'EGP 12,000.00');
  assert.equal(fillTemplate('{{due}}', INVOICE, NOW), '2026-10-30');
  assert.equal(fillTemplate('{{ago:due}}', INVOICE, NOW), '11 days ago');
  assert.equal(fillTemplate('{{until:due}}', INVOICE, NOW), '11 days ago');
});

test('a form nobody declared is still the bare value', () => {
  assert.equal(fillTemplate('{{day:due}}', INVOICE, NOW), '2026-10-30');
  assert.equal(fillTemplate('{{shorts:what}}', INVOICE, NOW), 'Poster run');
});

test('a field with no value writes the dash the old forms write', () => {
  for (const empty of [row({}), row({ amount: null, due: null }), row({ amount: '', due: '' })]) {
    assert.equal(fillTemplate('{{short:amount}}', empty, NOW), fillTemplate('{{money:amount}}', empty, NOW));
    assert.equal(fillTemplate('{{on:due}}', empty, NOW), fillTemplate('{{ago:due}}', empty, NOW));
    assert.equal(fillTemplate('{{short:amount}} {{on:due}}', empty, NOW), '— —');
  }
});

test('short keeps the minor part when there is one, in the currency\'s own decimals', () => {
  assert.equal(short(1_200_000, 'EGP'), 'EGP 12,000');
  assert.equal(short(1_200_050, 'EGP'), 'EGP 12,000.50');
  assert.equal(short(5, 'EGP'), 'EGP 0.05');
  assert.equal(short(0, 'EGP'), 'EGP 0');
  assert.equal(short(129_900, 'JPY'), '¥129,900');
  assert.equal(short(240_000, 'GBP'), '£2,400');
  assert.equal(short(999, 'USD'), '$9.99');
  assert.equal(short(1_500, 'KWD'), 'KWD 1.500');
  assert.equal(short(2_000, 'KWD'), 'KWD 2');
});

test('short writes a currency that has no symbol of its own by its code, and never borrows another\'s', () => {
  assert.equal(short(1_200_000, 'SAR'), 'SAR 12,000');
  assert.equal(short(1_200_000, 'CAD'), 'CA$12,000');
  assert.equal(short(1_200_000, 'AUD'), 'A$12,000');
  assert.equal(short(1_200_000, 'egp'), 'EGP 12,000');
});

test('short puts a true minus before the symbol', () => {
  assert.equal(short(-3_900, 'GBP'), '−£39');
  assert.equal(short(-3_950, 'SAR'), 'SAR −39.50');
});

test('short on a field that holds no money writes it as the bare form does', () => {
  const r = row({ what: 'Poster run', tags: ['late', 'print'], count: 3 });
  assert.equal(fillTemplate('{{short:what}}', r, NOW), 'Poster run');
  assert.equal(fillTemplate('{{short:tags}}', r, NOW), 'late, print');
  assert.equal(fillTemplate('{{short:count}}', r, NOW), '3');
});

test('on names the year only when it is not this one', () => {
  assert.equal(on('2026-10-30'), '30 Oct');
  assert.equal(on('2026-01-05'), '5 Jan');
  assert.equal(on('2027-01-05'), '5 Jan 2027');
  assert.equal(on('2025-12-31'), '31 Dec 2025');
  /* THE YEAR IS THE ONE THE FILL IS MADE IN, not the one the row was written in. */
  assert.equal(on('2026-10-30', Date.UTC(2027, 0, 2, 12)), '30 Oct 2026');
});

test('on reads the day of a moment, and leaves what is not a day as it is', () => {
  assert.equal(on('2026-10-30T23:30:00.000Z'), '30 Oct');
  assert.equal(on('2026-10-30 09:00'), '30 Oct');
  assert.equal(on('next week'), 'next week');
  assert.equal(on('2026-02-31'), '2026-02-31');
  assert.equal(on('2026-13-01'), '2026-13-01');
  assert.equal(on(20261030), '20261030');
});
