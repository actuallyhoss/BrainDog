/**
 * The exchange rates form's proposal (`rates-form.ts`): one pack polling a documented public address once a day into
 * Money's exchange rates, for the currencies the record holds and its home currency, and the picker's list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RATES_SOURCES, addressOf, currenciesIn, ratesFault, ratesIdOf, ratesProposal, rowsFor, type RatesDraft } from './rates-form.ts';

/* The picker's own list moved to `currencies.test.ts` when it stopped being typed out and started coming from `Intl`:
   the list a form offers is the list's invariant, not the form's. */

test('THE CURRENCIES START AS THE ONES THE MONEY IS IN AND THE HOME ONE, less the base, at the address’s path', () => {
  const held = currenciesIn([
    { fields: { balance: { amount: 5_200_000, currency: 'EGP' }, name: 'CIB' } },
    { fields: { balance: { amount: 340_000, currency: 'USD' } } },
    { fields: { amount: { amount: 100, currency: 'gbp' }, note: 'x' } },
  ]);
  assert.deepEqual(held, ['EGP', 'USD']);
  assert.deepEqual(rowsFor('open-er-api', 'USD', [...held, 'EGP']), [{ currency: 'EGP', path: 'rates.EGP' }]);
});

test('A DOCUMENTED ADDRESS FILES ONE POLL A DAY INTO fx, with the base as the currency and each code as the base of a row', () => {
  const d: RatesDraft = { source: 'open-er-api', base: 'USD', url: '', rows: rowsFor('open-er-api', 'USD', ['EGP', 'GBP']) };
  assert.equal(ratesFault(d), null);
  assert.equal(addressOf(d), 'https://open.er-api.com/v6/latest/USD');
  const p = ratesProposal(d);
  assert.equal(p.body_kind, 'pack');
  assert.equal(p.body.install, 'rates-open-er-api-com');
  const decl = (p.body.doc as { declarations: Record<string, unknown>[] }).declarations[0]!;
  assert.equal(decl.channel, 'poll');
  assert.equal(decl.every, '1d');
  assert.deepEqual(decl.writes, { register: 'fx' });
  const maps = decl.map as Record<string, { value?: unknown; path?: unknown }>[];
  assert.deepEqual(maps.map((m) => [m.currency?.value, m.base?.value, m.rate?.path]), [
    ['USD', 'EGP', 'rates.EGP'],
    ['USD', 'GBP', 'rates.GBP'],
  ]);
  assert.equal(p.question, 'Fetch open.er-api.com every day for what one USD is worth in EGP, GBP?');
});

test('WHAT CANNOT BE FILED IS SAID: an address that does not quote a currency, no currency, a typed address and path', () => {
  const frank: RatesDraft = { source: 'frankfurter', base: 'USD', url: '', rows: rowsFor('frankfurter', 'USD', ['EGP']) };
  assert.equal(ratesFault(frank)?.at, 'rows');
  assert.match(ratesFault(frank)!.fix, /EGP/u);
  assert.equal(addressOf({ ...frank, rows: [] }), 'https://api.frankfurter.app/latest?from=USD');
  assert.equal(ratesFault({ ...frank, rows: rowsFor('frankfurter', 'USD', ['USD']) })?.at, 'rows');
  const custom: RatesDraft = { source: 'custom', base: 'EUR', url: 'http://rates.example/x', rows: [{ currency: 'EGP', path: 'data.egp' }] };
  assert.equal(ratesFault(custom)?.at, 'url');
  assert.equal(ratesFault({ ...custom, url: 'https://rates.example/x' }), null);
  assert.equal(ratesFault({ ...custom, url: 'https://rates.example/x', rows: [{ currency: 'EGP', path: 'data..egp' }] })?.at, 'rows');
  assert.equal(ratesFault({ ...custom, base: '' })?.at, 'base');
  assert.equal(ratesIdOf('nonsense'), 'rates');
  assert.equal(RATES_SOURCES.every((s) => s.url('USD').startsWith('https://')), true);
});
