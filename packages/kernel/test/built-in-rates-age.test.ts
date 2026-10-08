/**
 * `rates-age-days` (REC-B02): how many days old the newest exchange rate is, read on a real record through `metric`, by
 * the rows of the list that plays the rates, under whatever names that list gives the parts. With no rate it says
 * nothing, never nought: nought would read as fresh rates on a record that holds none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { builtInFigure } from '../src/built-in-figures.ts';
import { evaluateMetric } from '../src/metrics.ts';
import { RATE_STALE_DAYS } from '../src/fx.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const OWNER = { actor: 'p_1' };

const register = (id: string, fields: unknown[], more: Record<string, unknown> = {}): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name: 'Rates', title: fields.length ? (fields[0] as { id: string }).id : 'id', fields, ...more } }) as never;

/** The old list, `fx`, whose parts are under their own names. */
const FX = register('fx', [
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', required: true },
]);

/** A list that names the parts itself, under another id. */
const QUOTES = register(
  'quotes',
  [
    { id: 'from', type: 'text', required: true },
    { id: 'to', type: 'text', required: true },
    { id: 'price', type: 'decimal', required: true },
    { id: 'day', type: 'day', required: true },
  ],
  { rates: { currency: 'from', base: 'to', rate: 'price', as_of: 'day' } },
);

async function record(lists: Declaration[], at = NOW): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(at));
  if (lists.length) {
    const installed = await k.install(lists);
    assert.ok(installed.ok, JSON.stringify(installed));
  }
  return k;
}

const age = (k: Kernel): Reading => {
  const decl = k.metricDecl('rates-age-days');
  assert.ok(decl, 'rates-age-days is not a figure this record answers');
  const read = k.metric(decl);
  assert.ok(read.ok, JSON.stringify(read));
  return read.value;
};

test('WITH NO RATE, NOTHING, NEVER NOUGHT: no rates list, and a rates list with no row', async () => {
  const none = age(await record([]));
  assert.equal(none.value, null);
  assert.equal(none.met, null);
  const empty = age(await record([FX]));
  assert.equal(empty.value, null);
  assert.match(empty.why, /no exchange rate/);
});

test('THE NEWEST RATE OF ANY PAIR IS THE AGE, in whole days, and a week is still met while eight is not', async () => {
  const k = await record([FX]);
  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 48.5, as_of: '2026-09-29' }, OWNER).ok);
  assert.equal(age(k).value, 10);
  assert.equal(age(k).met, false);
  assert.ok(k.create('fx', { currency: 'GBP', base: 'EGP', rate: 64.1, as_of: '2026-10-02' }, OWNER).ok);
  assert.equal(age(k).value, 7);
  assert.equal(age(k).met, true);
  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 48.7, as_of: '2026-10-09' }, OWNER).ok);
  assert.equal(age(k).value, 0);
});

test('A LIST THAT NAMES ITS OWN PARTS is read by those names, and a rate dated ahead is nought days old', async () => {
  const k = await record([QUOTES]);
  assert.ok(k.create('quotes', { from: 'USD', to: 'EGP', price: 48.5, day: '2026-10-06' }, OWNER).ok);
  assert.equal(age(k).value, 3);
  assert.ok(k.create('quotes', { from: 'USD', to: 'EGP', price: 48.9, day: '2026-10-11' }, OWNER).ok);
  assert.equal(age(k).value, 0);
});

test('ON A PAST DAY, the age that day, and a rate dated after it does not count', () => {
  const decl = builtInFigure('rates-age-days')!;
  const rates = [
    { currency: 'USD', base: 'EGP', rate: 48.5, as_of: '2026-09-20' },
    { currency: 'USD', base: 'EGP', rate: 48.7, as_of: '2026-10-05' },
  ];
  const read = (asOf: string | null) => {
    const r = evaluateMetric(openSqlite(), decl, {
      nowMs: NOW,
      ...(asOf ? { asOfMs: Date.parse(`${asOf}T12:00:00Z`) } : {}),
      schemaOf: () => null,
      fx: () => ({ home: 'EGP', rates }),
    });
    assert.ok(r.ok, JSON.stringify(r));
    return r.value.value;
  };
  assert.equal(read(null), 4);
  assert.equal(read('2026-10-01'), 11);
  assert.equal(read('2026-09-19'), null);
});

test("THE RECORD'S DAY, NOT UTC'S: late on the 8th in UTC is already the 9th in Auckland", () => {
  const decl = builtInFigure('rates-age-days')!;
  const late = Date.UTC(2026, 9, 8, 13);
  const readIn = (tz: string) =>
    evaluateMetric(openSqlite(), decl, { nowMs: late, tz, schemaOf: () => null, fx: () => ({ home: null, rates: [{ currency: 'USD', base: 'EGP', rate: 48.5, as_of: '2026-10-07' }] }) });
  const utc = readIn('UTC');
  const auckland = readIn('Pacific/Auckland');
  assert.ok(utc.ok && auckland.ok);
  assert.equal(utc.value.value, 1);
  assert.equal(auckland.value.value, 2);
});

test("THE LINE IS fx.ts's OWN STALE AGE, written once more so loading fx.ts first does not throw", () => {
  assert.deepEqual(builtInFigure('rates-age-days')!.target, { lte: RATE_STALE_DAYS });
});
