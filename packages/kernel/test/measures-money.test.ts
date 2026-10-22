/**
 * A reading that is money: `amount`, minor units and a currency, read in major units by the currency's decimals and
 * with the code as its unit, and drawn on one line with the older decimal readings of the same name and project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { measureLines, measureSeries, type RawReading } from '../src/measures.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const DAY = 86_400_000;
const on = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();
const OPTS = { nowMs: NOW, back: 7, tz: 'UTC', fallback: '' };

test('a decimal reading and a money reading of one name and project make one line', () => {
  const readings: RawReading[] = [
    { at: on(2), name: 'Monthly revenue', of: 'Oxbow.gg', project: 't_1', value: 48.15, unit: 'USD' },
    { at: on(1), name: 'Monthly revenue', of: 'Oxbow.gg', project: 't_1', value: null, amount: { amount: 4815, currency: 'USD' } },
  ];
  const all = measureSeries(readings, OPTS);
  assert.equal(all.length, 1);
  const line = all[0]!;
  assert.equal(line.name, 'Monthly revenue');
  assert.equal(line.of, 'Oxbow.gg');
  assert.equal(line.unit, 'USD');
  assert.deepEqual(line.now.filter((v) => v !== null), [48.15, 48.15]);
  assert.equal(line.latest?.value, 48.15);

  const { lines, latest } = measureLines(readings, OPTS);
  assert.equal(lines.length, 1);
  assert.equal(latest.length, 0);
});

test('money is read before value, and a row whose amount is not money is read from value', () => {
  const [both] = measureSeries([{ at: on(1), name: 'Takings', value: 1, unit: 'USD', amount: { amount: 250, currency: 'USD' } }], OPTS);
  assert.equal(both!.latest?.value, 2.5);
  const [loose] = measureSeries([{ at: on(1), name: 'Takings', value: 7, unit: 'USD', amount: 700 }], OPTS);
  assert.equal(loose!.latest?.value, 7);
  assert.deepEqual(measureSeries([{ at: on(1), name: 'Takings', value: null, amount: null }], OPTS), []);
});

test('JPY has no decimals, KWD has three, and a lower-case code is the same currency', () => {
  const [yen] = measureSeries([{ at: on(1), name: 'Sales', value: null, amount: { amount: 4815, currency: 'JPY' } }], OPTS);
  assert.equal(yen!.latest?.value, 4815);
  assert.equal(yen!.unit, 'JPY');
  const [dinar] = measureSeries([{ at: on(1), name: 'Sales', value: null, amount: { amount: 4815, currency: 'kwd' } }], OPTS);
  assert.equal(dinar!.latest?.value, 4.815);
  assert.equal(dinar!.unit, 'KWD');
});

test('an amount that arrives as JSON text is read as money', () => {
  const readings: RawReading[] = [
    { at: on(3), name: 'Monthly revenue', value: '48.15', unit: 'USD' },
    { at: on(1), name: 'Monthly revenue', value: null, amount: '{"amount":5020,"currency":"USD"}' },
  ];
  const [line] = measureSeries(readings, OPTS);
  assert.deepEqual(line!.now.filter((v) => v !== null), [48.15, 50.2]);
  assert.equal(line!.unit, 'USD');
  assert.deepEqual(measureSeries([{ at: on(1), name: 'Broken', value: null, amount: '{"amount":' }], OPTS), []);
});

test('two currencies under one name are never one line: each is a line in its own currency, and neither is added to the other', () => {
  const readings: RawReading[] = [
    { at: on(3), name: 'Monthly revenue', project: 't_1', value: 40, unit: 'EUR' },
    { at: on(2), name: 'Monthly revenue', project: 't_1', value: 45, unit: 'eur' },
    { at: on(2), name: 'Monthly revenue', project: 't_1', value: null, amount: { amount: 4000, currency: 'JPY' } },
    { at: on(1), name: 'Monthly revenue', project: 't_1', value: null, amount: { amount: 5000, currency: 'JPY' } },
  ];
  const all = measureSeries(readings, OPTS);
  const byUnit = new Map(all.map((m) => [m.unit.toUpperCase(), m.now.filter((v) => v !== null)]));
  assert.equal(all.length, 2);
  assert.deepEqual(byUnit.get('EUR'), [40, 45]);
  assert.deepEqual(byUnit.get('JPY'), [4000, 5000]);
});
