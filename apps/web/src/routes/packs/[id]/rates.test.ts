/**
 * What the rates tile on an add-on's page draws (REC-B02 step 5): the newest rate of each pair, and the last 90 days of
 * a pair once it has rates enough to say something.
 *
 * BEFORE: the tile was a sentence and a button, and held no rate at all, so a person who had set the fetch up could not
 * see on that page what a dollar was worth today or which way it had gone. Now it reads the list that declares
 * `rates:` and draws one line a pair.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CHART_FROM, lineSaid, pairsOf, rateNote, rateSaid, ratesListOf, readRates, type RatesCalls } from './rates.ts';

const TODAY = '2026-10-13';
const rate = (currency: string, base: string, n: number, asOf: string) => ({ currency, base, rate: n, as_of: asOf });

test('THE NEWEST RATE OF EACH PAIR, one line a pair, in code order', () => {
  const pairs = pairsOf(
    [rate('USD', 'EGP', 48.1, '2026-09-28'), rate('USD', 'EGP', 48.5, '2026-10-12'), rate('GBP', 'EGP', 64.2, '2026-10-10')],
    TODAY,
    'EGP',
  );
  assert.deepEqual(
    pairs.map((p) => [p.currency, p.base, p.rate, p.asOf]),
    [
      ['GBP', 'EGP', 64.2, '2026-10-10'],
      ['USD', 'EGP', 48.5, '2026-10-12'],
    ],
  );
});

test('A PAIR WITH ONE RATE draws its number and no line, and says what one of the currency is worth', () => {
  const [usd] = pairsOf([rate('USD', 'EGP', 48.5, '2026-10-12')], TODAY, 'EGP');
  assert.equal(usd!.points.length, 1);
  assert.equal(usd!.chart, false);
  assert.equal(usd!.moved, null);
  assert.equal(rateSaid(usd!), '1 USD is 48.5 EGP');
});

test('ONCE A PAIR HAS TWO RATES the tile says which way it went, and from what, in the last 90 days', () => {
  const [usd] = pairsOf([rate('USD', 'EGP', 48.5, '2026-10-12'), rate('USD', 'EGP', 48, '2026-10-11')], TODAY, 'EGP');
  assert.deepEqual(usd!.points, [
    { day: '2026-10-11', rate: 48 },
    { day: '2026-10-12', rate: 48.5 },
  ]);
  assert.deepEqual(usd!.moved, { dir: 'up', from: 48, since: '2026-10-11' });
});

test('THE LINE IS DRAWN ONCE THE LAST 90 DAYS HOLD ENOUGH POINTS, oldest first, and a rate older than that is left off it', () => {
  const days = ['2026-06-01', '2026-10-10', '2026-10-11', '2026-10-12'];
  const [usd] = pairsOf(days.map((d, i) => rate('USD', 'EGP', 47 + i, d)), TODAY, 'EGP');
  assert.equal(CHART_FROM <= 3, true);
  assert.deepEqual(usd!.points.map((p) => p.day), ['2026-10-10', '2026-10-11', '2026-10-12']);
  assert.equal(usd!.chart, true);
  assert.equal(usd!.rate, 50);
});

test('A RATE QUOTED THE OTHER WAY ROUND IS THE SAME PAIR, read into the home currency, and one day is one point', () => {
  const [usd, none] = pairsOf(
    [rate('EGP', 'USD', 0.02, '2026-10-11'), rate('USD', 'EGP', 48.5, '2026-10-12'), rate('EGP', 'USD', 0.025, '2026-10-12')],
    TODAY,
    'EGP',
  );
  assert.equal(none, undefined);
  assert.deepEqual([usd!.currency, usd!.base], ['USD', 'EGP']);
  /* On one day the row quoted the way the pair is read wins over its inverse, as `rateFor` rules. */
  assert.deepEqual(usd!.points, [
    { day: '2026-10-11', rate: 50 },
    { day: '2026-10-12', rate: 48.5 },
  ]);
  assert.deepEqual(usd!.moved, { dir: 'down', from: 50, since: '2026-10-11' });
});

test('THE LIST IS THE ONE THAT DECLARES rates:, by its declaration and never by a name, and two declaring are none', () => {
  const fields = { currency: 'code', base: 'into', rate: 'worth', as_of: 'on' };
  assert.deepEqual(ratesListOf([{ id: 'wallets' }, { id: 'quotes', rates: fields }]), { register: 'quotes', fields });
  assert.equal(ratesListOf([{ id: 'wallets' }]), null);
  assert.equal(ratesListOf([{ id: 'a', rates: fields }, { id: 'b', rates: fields }]), null);
});

test('THE PAGE READS THE RATES OFF THE RECORD: the add-on’s own lists are asked what they declare, and the one is read', async () => {
  const asked: string[] = [];
  const calls: RatesCalls = {
    schema: async (register) => {
      asked.push(register);
      return { ok: true, value: register === 'quotes' ? { rates: { currency: 'coin', base: 'into', rate: 'worth', as_of: 'on' }, fields: [] } : { fields: [] } };
    },
    list: async ({ register, cursor }) => {
      assert.equal(register, 'quotes');
      return cursor
        ? { ok: true, value: { rows: [{ fields: { coin: 'USD', into: 'EGP', worth: 48, on: '2026-10-11' } }], cursor: null } }
        : { ok: true, value: { rows: [{ fields: { coin: 'USD', into: 'EGP', worth: '48.5', on: '2026-10-12' } }, { fields: { coin: 'USD' } }], cursor: 'next' } };
    },
  };
  const rates = await readRates(calls, ['wallets', 'quotes']);
  assert.deepEqual(asked.sort(), ['quotes', 'wallets']);
  assert.deepEqual(rates, [rate('USD', 'EGP', 48.5, '2026-10-12'), rate('USD', 'EGP', 48, '2026-10-11')]);
  /* No list declares it, or the record refuses: nothing to draw, and the tile is the sentence and the button it was. */
  assert.deepEqual(await readRates(calls, ['wallets']), []);
  assert.deepEqual(await readRates({ ...calls, list: async () => ({ ok: false }) }, ['quotes']), []);
});

test('WHAT IS SAID UNDER A RATE: the day it is of, then which way it went, in days and never in codes of time', () => {
  const [one] = pairsOf([rate('USD', 'EGP', 48.5, '2026-10-12')], TODAY, 'EGP');
  assert.equal(rateNote(one!), 'As of 12 Oct 2026.');
  const [three] = pairsOf(
    [rate('USD', 'EGP', 48, '2026-10-10'), rate('USD', 'EGP', 48.25, '2026-10-11'), rate('USD', 'EGP', 48.5, '2026-10-12')],
    TODAY,
    'EGP',
  );
  assert.equal(rateNote(three!), 'As of 12 Oct 2026. Up from 48 on 10 Oct.');
  assert.equal(lineSaid(three!), 'USD in EGP, 10 Oct to 12 Oct, from 48 to 48.5');
  /* A rate that came back to where it began has not moved, and says only its day. */
  const [flat] = pairsOf([rate('USD', 'EGP', 48, '2026-10-10'), rate('USD', 'EGP', 48, '2026-10-12')], TODAY, 'EGP');
  assert.equal(rateNote(flat!), 'As of 12 Oct 2026.');
});
