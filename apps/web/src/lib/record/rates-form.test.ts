/**
 * The exchange rates form's proposal (`rates-form.ts`): one pack polling a documented public address once a day into
 * Money's exchange rates, for the currencies the record holds and its home currency, and the picker's list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import {
  ECB_QUOTES,
  ECB_QUOTES_ASKED,
  ECB_QUOTES_URL,
  RATES_SOURCES,
  addressOf,
  currenciesIn,
  ratesDraftFor,
  ratesFault,
  ratesIdOf,
  ratesProposal,
  ratesProposalFor,
  ratesRows,
  rowsFor,
  sourceFor,
  type RatesDraft,
} from './rates-form.ts';

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

/* CODES NOBODY MINTS, so that a test about how MANY currencies one poll fills is not also a list of what currencies
   there are: `packages/kernel/test/ingest.test.ts`'s membership guard counts the real ones quoted in a file. */
const many = (n: number): string[] => Array.from({ length: n }, (_, i) => `XX${String.fromCharCode(65 + i)}`);

/** The maps of the one declaration a rates pack holds: one a currency, one row of `fx` each. */
const mapsOf = (doc: unknown): Record<string, { value?: unknown; path?: unknown }>[] =>
  (doc as { declarations: { map: Record<string, { value?: unknown; path?: unknown }>[] }[] }).declarations[0]!.map;

test('MORE CURRENCIES THAN ONE POLL FILLS IS SAID HERE, not by install after the owner has approved the call out', () => {
  const at = (n: number) => ratesFault({ source: 'open-er-api', base: 'USD', url: '', rows: rowsFor('open-er-api', 'USD', many(n)) });
  assert.equal(at(20), null);
  assert.equal(at(21)?.at, 'rows');
});

test('THE RECORD FILES ITS OWN PROPOSAL, against the home currency, at an address that quotes every currency it holds', () => {
  const p = ratesProposalFor('EGP', ['USD', 'EGP', 'GBP']);
  assert.ok(p, 'a record holding three currencies filed nothing, so every mixed figure stays MIXED_CURRENCY');
  assert.equal(p.body_kind, 'pack');
  assert.equal(p.body.install, 'rates-open-er-api-com');
  assert.equal(p.question, 'Fetch open.er-api.com every day for what one EGP is worth in GBP, USD?');
  const decl = (p.body.doc as { declarations: Record<string, unknown>[] }).declarations[0]!;
  assert.equal(decl.url, 'https://open.er-api.com/v6/latest/EGP');
  assert.equal(decl.every, '1d');
  assert.deepEqual(decl.writes, { register: 'fx' });
  assert.deepEqual((decl.map as Record<string, { value?: unknown }>[]).map((m) => [m.currency?.value, m.base?.value]), [
    ['EGP', 'GBP'],
    ['EGP', 'USD'],
  ]);
});

test('AND FILES NOTHING WHEN A CALL OUT WOULD BUY NOTHING, or when the record would refuse what was filed', () => {
  assert.equal(ratesProposalFor('', ['USD', 'EGP']), null, 'no home currency, so no currency to convert into');
  assert.equal(ratesProposalFor('EGP', ['EGP', 'egp', '']), null, 'one currency, so every figure is already a figure');
  assert.equal(ratesProposalFor('USD', many(21)), null, 'one poll fills twenty, and install refuses the twenty-first');
  /* AND THE DRAFT SAYS SO ITSELF RATHER THAN LEANING ON `ratesFault` DOWNSTREAM, which nothing here held until each
     of `ratesDraftFor`'s two guards was deleted in turn and this file run: every test stayed green both times,
     because `ratesProposalFor` asks `ratesFault` afterwards and it refuses an empty base and an empty list anyway.
     The form is about to open on this draft rather than on `USD`, and a draft with no base, or with no row to fill,
     is not something a form can open on. */
  assert.equal(ratesDraftFor('', ['USD', 'EGP']), null, 'no home currency, so no base to quote against');
  assert.equal(ratesDraftFor('EGP', ['EGP', 'egp', '']), null, 'one currency, so no row for the poll to fill');
});

test('THE ADDRESS CHOSEN QUOTES WHAT IT WAS CHOSEN FOR, whatever order the table is written in', () => {
  /* THE TABLE IS HANDED IN REVERSED, BECAUSE IN ITS WRITTEN ORDER THIS TEST CANNOT FAIL. open.er-api is the first
     row and carries no `only`, so `find` settles on it for every possible input and never reads the second row:
     changing `sourceFor`'s `every` to `some` was measured to leave all eight tests in this file green, which makes
     the covered assertion below a test of a constant rather than of a choice. Reversed, Frankfurter is the row
     asked first, so the ECB's coverage is what decides, and `some` goes red on the first line here. */
  const ecbFirst = [...RATES_SOURCES].reverse();
  assert.equal(sourceFor(['EGP', 'USD'], ecbFirst)?.id, 'open-er-api', 'the ECB never published the Egyptian pound, and it was offered anyway');
  assert.equal(sourceFor(['EUR', 'GBP'], ecbFirst)?.id, 'frankfurter', 'an address that quotes both was passed over');
  assert.equal(sourceFor([...ECB_QUOTES], ecbFirst)?.id, 'frankfurter');
  /* AND NO ADDRESS AT ALL IS AN ANSWER. With the table as written it is unreachable, because the first row quotes
     nearly everything, so the only way to reach `null` is to ask a table of addresses that all name their list. */
  assert.equal(sourceFor(['EGP'], ecbFirst.filter((s) => s.only !== undefined)), null, 'an address that does not quote it was still offered');
  assert.equal(sourceFor(['EGP', 'USD'])?.id, 'open-er-api', 'the table as written stopped covering the currency he holds');
  /* THE ONE THAT MATTERS FOR THIS RECORD: a draft filed for a currency the ECB never published must not come back
     with the ECB's address on it, which `ratesFault` would then refuse by name. */
  const draft = ratesDraftFor('EGP', ['USD', 'GBP']);
  assert.ok(draft);
  assert.equal(ratesFault(draft), null);
});

test('THE SAME CURRENCY ASKED FOR TWICE IS ONE ROW IN ALL THREE ANSWERS: the count, the question and the map', () => {
  /* `ratesPollPack` DROPS A REPEAT AND THE FORM DID NOT, so the two disagreed about the same draft. Measured before
     this test was written: a draft naming EGP twice filed a pack with one map under a Decide line that read "worth
     in EGP, EGP", which is the owner approving a sentence the pack does not keep.
     AND THE REPEAT IS WRITTEN DIFFERENTLY FROM THE ROW IT REPEATS, because a `Map` keyed by code drops a second row
     whether or not `ratesRows` asks `seen.has` first, so two identical rows cannot tell first wins from last wins:
     deleting that guard was measured to leave all nine tests in this file green. Spelled ` egp `, with a path the
     poll must not read, the guard is what keeps `rates.EGP`, which is the row `quoted` keeps on the pack's side. */
  const twice: RatesDraft = { source: 'open-er-api', base: 'USD', url: '', rows: [{ currency: 'EGP', path: 'rates.EGP' }, { currency: ' egp ', path: 'rates.wrong' }] };
  assert.deepEqual(ratesRows(twice), [{ currency: 'EGP', path: 'rates.EGP' }], 'the one row set the count, the question and the map all read');
  assert.equal(ratesFault(twice), null);
  const p = ratesProposal(twice);
  assert.equal(p.question, 'Fetch open.er-api.com every day for what one USD is worth in EGP?');
  assert.equal(mapsOf(p.body.doc).length, 1);
  /* AND A REPEAT DOES NOT SPEND ONE OF THE TWENTY. The same mistake counted rather than printed: twenty-one rows
     naming twenty currencies build twenty maps, so refusing them refuses a request the record would have taken. */
  const rows = [...many(20), 'XXA'].map((currency) => ({ currency, path: `rates.${currency}` }));
  assert.equal(ratesFault({ ...twice, rows }), null, 'a repeat was counted against the ceiling the pack never reaches');
  assert.equal(mapsOf(ratesProposal({ ...twice, rows }).body.doc).length, 20);
  /* THE BASE ASKED FOR AGAINST ITSELF IS THE SAME JUDGEMENT, and `fx` would drop the row it wrote. */
  assert.equal(ratesFault({ ...twice, rows: [{ currency: 'usd', path: 'rates.USD' }] })?.fix, copy.ratesFaultNone);
});

test('WHAT A SOURCE PUBLISHES IS A FACT ABOUT THE SOURCE, and the half of it that can be checked offline is', () => {
  const tender = new Set(Intl.supportedValuesOf('currency'));
  assert.deepEqual([...ECB_QUOTES].filter((c) => !tender.has(c)), [], 'a code here is not money anybody keeps books in');
  assert.deepEqual([...ECB_QUOTES], [...new Set(ECB_QUOTES)].sort(), 'repeated or out of order, which is how a hand edit goes wrong');
  assert.match(ECB_QUOTES_ASKED, /^\d{4}-\d{2}-\d{2}$/u);
  /* AND THE SENTENCE BESIDE THE PICKER IS PART OF THE LIST. "About 30 currencies" is what the owner reads before
     choosing this address, so it goes red with the list rather than a year after it. */
  assert.ok(Math.abs(ECB_QUOTES.length - 30) <= 5, `the list holds ${ECB_QUOTES.length}`);
  assert.match(copy.ratesCoversFrankfurter, /about 30 currencies/u);
});

/* THE OTHER HALF CAN ONLY BE ASKED, and asking is a keyless GET that costs nothing, so it is one command rather
   than a note in a file: `RATES_LIVE=1 node --test --experimental-strip-types "apps/web/src/lib/record/rates-form.test.ts"`.
   It is skipped by default because a gate that needs the network is a gate that goes red on a train. It caught BGN
   the first time it was run, a code `Intl` still calls tender and the ECB had stopped publishing. */
const LIVE = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RATES_LIVE === '1';

test('WHAT FRANKFURTER PUBLISHES TODAY IS WHAT THE LIST SAYS IT PUBLISHES', { skip: LIVE ? false : `set RATES_LIVE=1 to ask ${ECB_QUOTES_URL}, last asked ${ECB_QUOTES_ASKED}` }, async () => {
  const out = await fetch(ECB_QUOTES_URL, { redirect: 'follow' });
  assert.equal(out.status, 200);
  const live = Object.keys((await out.json()) as Record<string, string>).sort();
  assert.deepEqual([...ECB_QUOTES], live, 'the list and the source disagree: copy the source in, and set ECB_QUOTES_ASKED to today');
});
