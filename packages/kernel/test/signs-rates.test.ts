/**
 * `rates-current`, "Rates are current": the vital sign that reads the age the `rates-age-days` figure
 * reads, so stale rates turn a sign red and the skill "Keep a record current" offers a feed of rates in its one
 * question. Red past the line the figure's own note names (`RATE_STALE_DAYS`, `fx.ts`), none on a record whose money
 * is in one currency, however old its rates.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, VITAL_SIGNS, type Declaration, type Kernel } from '../src/index.ts';
import { RATE_STALE_DAYS } from '../src/fx.ts';
import { RATES_STALE_DAYS, signOf, type SignReading } from '../src/signs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const PERSON = { actor: 'p_1' };
/** The day `n` days before the ninth of October 2026. */
const AGO = (n: number): string => new Date(Date.UTC(2026, 9, 9 - n, 12)).toISOString().slice(0, 10);

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }] } as never,
};

/** The rates, on the list a record holds them in before any list declares `rates:`. */
const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

type Rec = { k: Kernel; sql: NodeSql };

/** A record with Bills in `currencies`, one bill each, and a rate dated each of `rates`. */
async function record(currencies: readonly string[], rates: readonly string[]): Promise<Rec> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([BILLS, FX]);
  assert.ok(out.ok, JSON.stringify(out));
  for (const currency of currencies) assert.ok(k.create('bills', { what: `Kiln in ${currency}`, amount: { amount: 120_000, currency } } as never, PERSON).ok);
  for (const as_of of rates) assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 48.5, as_of } as never, PERSON).ok);
  return { k, sql };
}

const read = ({ sql }: Rec): SignReading => {
  const s = signOf('rates-current');
  assert.ok(s?.read, 'rates-current is not a sign the kernel reads');
  return s.read(sql, NOW, 'UTC');
};

test('ON THE CLOSED LIST ONCE, after the money-shaped ones, by its name, judged by the line the figure names', () => {
  assert.equal(VITAL_SIGNS.filter((s) => s.sign === 'rates-current').length, 1);
  const at = VITAL_SIGNS.findIndex((s) => s.sign === 'rates-current');
  assert.ok(at > VITAL_SIGNS.findIndex((s) => s.sign === 'amounts-whole') && at > VITAL_SIGNS.findIndex((s) => s.sign === 'rate-age'));
  const s = signOf('rates-current');
  assert.equal(s?.name, 'Rates are current');
  assert.equal(s?.hand, 'kernel');
  assert.equal(RATES_STALE_DAYS, RATE_STALE_DAYS, 'a second line for how old a rate may be');
  assert.deepEqual(s?.thresholds, { RATES_STALE_DAYS: RATE_STALE_DAYS });
});

test('FRESH RATES READ GREEN, with the age the figure reads, up to the line itself', async () => {
  const today = read(await record(['EGP', 'USD'], [AGO(30), AGO(0)]));
  assert.equal(today.state, 'green');
  assert.equal(today.value, 0);
  assert.equal(today.said, 'The newest exchange rate is from today.');
  const edge = await record(['EGP', 'USD'], [AGO(RATE_STALE_DAYS)]);
  assert.equal(read(edge).state, 'green');
  assert.equal(read(edge).value, RATE_STALE_DAYS);
  const figure = edge.k.metric(edge.k.metricDecl('rates-age-days')!);
  assert.ok(figure.ok);
  assert.equal(figure.value.value, read(edge).value, 'the sign and the figure read two ages');
});

test('OLD RATES READ RED, a day past the line, and say the cure in the words an agent finds on offer', async () => {
  const old = read(await record(['EGP', 'USD'], [AGO(RATE_STALE_DAYS + 1)]));
  assert.equal(old.state, 'red');
  assert.equal(old.value, RATE_STALE_DAYS + 1);
  assert.match(old.said, /8 days old\. Turn on Keep rates current, on Money's plugin page, for a feed of rates once a day\./u);
  assert.ok(old.facts?.some((f) => f.includes('Egyptian Pound and US Dollar')), JSON.stringify(old.facts));
  for (const line of [old.said, ...(old.facts ?? [])]) assert.doesNotMatch(line, /—|\bfx\b|bills|rec_/u, line);
});

test('ONE CURRENCY READS NONE, however old its rates, and so do no money and no rate', async () => {
  const one = read(await record(['EGP', 'EGP'], [AGO(40)]));
  assert.equal(one.state, 'none');
  assert.equal(one.value, null);
  assert.equal(one.said, 'Every amount is in Egyptian Pound, so no exchange rate is needed.');
  assert.equal(read(await record([], [AGO(40)])).state, 'none');
  const unrated = read(await record(['EGP', 'USD'], []));
  assert.equal(unrated.state, 'none', 'nought would say the rates are fresh on a record that has none');
  assert.match(unrated.said, /No exchange rate is kept yet/u);
});
