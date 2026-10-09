/**
 * The reader's own day, and money by its digits (PGS-B04).
 *
 * "Today" was counted from midnight UTC, so between midnight and two or three in the morning in Cairo a deadline
 * named the day before. And money divided by a power of ten into a float, which keeps sixteen digits, so a figure
 * longer than that was drawn with its last digits made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatTyped, money, MISSING, readerZone, relative, since } from './format.ts';

const at = (iso: string): number => Date.parse(iso);

test('PACIFIC/AUCKLAND: at 23:30 a task due the next local day is in 1d, and half an hour later it is today', () => {
  const late = at('2026-10-09T10:30:00Z'); // 23:30 on 9 October in Auckland
  const after = at('2026-10-09T11:30:00Z'); // 00:30 on 10 October in Auckland, still the 9th in UTC
  assert.equal(relative('2026-10-10', late, 'Pacific/Auckland'), 'in 1d');
  assert.equal(relative('2026-10-10', after, 'Pacific/Auckland'), 'today');
  assert.equal(relative('2026-10-09', after, 'Pacific/Auckland'), '1d ago');
  assert.equal(relative('2026-10-10', after, 'UTC'), 'in 1d', 'the same moment counted in UTC is still the day before');
});

test('AFRICA/CAIRO: a deadline read at 01:00 names the Cairo day, not the UTC one', () => {
  const one = at('2026-10-08T22:00:00Z'); // 01:00 on 9 October in Cairo
  assert.equal(relative('2026-10-09', one, 'Africa/Cairo'), 'today');
  assert.equal(relative('2026-10-08', one, 'Africa/Cairo'), '1d ago');
  assert.equal(relative('2026-10-09', one, 'UTC'), 'in 1d');
  assert.equal(formatTyped('until', '2026-10-09', one, 'Africa/Cairo'), 'today', 'a typed value counts in the zone it is handed');
  assert.equal(formatTyped('date', '2026-10-10', one, 'Africa/Cairo'), '10 Oct 2026 · in 1d');
  /* Past a day `since()` bands calendar days, and they are the reader's: 23:00 on the 8th to 01:30 on the 10th is two
     Cairo days, and one UTC day (the 8th to the 9th). */
  const evening = '2026-10-08T20:00:00Z';
  const night = at('2026-10-09T22:30:00Z');
  assert.equal(since(evening, night, 'Africa/Cairo'), '2d ago');
  assert.equal(since(evening, night, 'UTC'), '1d ago');
  assert.equal(since('2026-10-09', one, 'Africa/Cairo'), 'today', 'a day handed to since() is counted the same way');
});

test('UTC: the day turns at midnight exactly, and is the default where there is no window and no zone named', () => {
  const last = at('2026-10-09T23:59:59.999Z');
  const first = at('2026-10-10T00:00:00Z');
  assert.equal(relative('2026-10-10', last, 'UTC'), 'in 1d');
  assert.equal(relative('2026-10-10', first, 'UTC'), 'today');
  assert.equal(relative('2026-10-10', last), 'in 1d');
  assert.equal(readerZone(), 'UTC');
  assert.equal(readerZone('Africa/Cairo'), 'Africa/Cairo');
  assert.equal(relative('2026-10-10', first, 'Not/A_Zone'), 'today', 'a zone Intl does not know counts in UTC and never throws');
});

test('IN A BROWSER, "today" is the browser\'s own day when no zone is named', (t) => {
  const tz = process.env.TZ;
  (globalThis as { window?: unknown }).window = {};
  t.after(() => {
    delete (globalThis as { window?: unknown }).window;
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });
  process.env.TZ = 'Pacific/Auckland';
  assert.equal(readerZone(), 'Pacific/Auckland');
  assert.equal(relative('2026-10-10', at('2026-10-09T11:30:00Z')), 'today');
});

test('MONEY PAST SIXTEEN DIGITS prints every digit it was handed', () => {
  const long = '900719925474099312';
  assert.equal(money(long, 'JPY'), 'JPY 900,719,925,474,099,312');
  assert.equal(money(BigInt(long), 'JPY'), 'JPY 900,719,925,474,099,312');
  assert.equal(formatTyped('money', `${long} JPY`), 'JPY 900,719,925,474,099,312', 'the typed value hands the digits over as digits');
  assert.notEqual(money(Number(long), 'JPY'), money(long, 'JPY'), 'a number past 2^53 has lost its digits before it arrives');
  assert.equal(money('-12345678901234567890', 'EGP'), 'EGP −123,456,789,012,345,678.90');
  assert.equal(money('123456789012345678901', 'CLF'), 'CLF 12,345,678,901,234,567.8901');
});

test('MONEY BY ITS DIGITS keeps every old answer, and refuses what is not a whole number', () => {
  assert.equal(money(129_900, 'EGP'), 'EGP 1,299.00');
  assert.equal(money(-4_200, 'GBP'), 'GBP −42.00');
  assert.equal(money(1_000_000, 'CLF'), 'CLF 100.0000');
  assert.equal(money(1_299, 'jpy'), 'JPY 1,299');
  assert.equal(money(7, 'GBP'), 'GBP 0.07');
  assert.equal(money('007', 'GBP'), 'GBP 0.07', 'leading noughts are not part of the amount');
  assert.equal(money(0, 'KWD'), 'KWD 0.000');
  assert.equal(money('-0', 'GBP'), 'GBP 0.00', 'nought takes no minus');
  assert.equal(money(-0, 'GBP'), 'GBP 0.00');
  assert.equal(money(-5n, 'USD'), 'USD −0.05');
  assert.equal(money(1e21, 'USD'), 'USD 10,000,000,000,000,000,000.00', 'a large whole number is not drawn in exponent form');
  assert.equal(money('100', 'JPY'), 'JPY 100');
  assert.equal(money('1000', 'JPY'), 'JPY 1,000');
  assert.equal(money('100000', 'JPY'), 'JPY 100,000');
  /* Grouping is one pass: a look-ahead regex took about a second on fifty thousand digits, and an author can type that. */
  const started = performance.now();
  assert.equal(money('9'.repeat(200_000), 'JPY').length, 4 + 200_000 + 66_666);
  assert.ok(performance.now() - started < 500, 'two hundred thousand digits are grouped in well under half a second');
  for (const bad of [0.5, Number.NaN, Number.POSITIVE_INFINITY, '12.50', '1e3', ' 12', '+12', '', '-']) {
    assert.equal(money(bad, 'GBP'), MISSING, `${String(bad)} is not money`);
  }
});
