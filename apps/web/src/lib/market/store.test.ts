/**
 * The store as a person reads it: starters first, the example setups apart, then every add-on on the shelf of what it
 * is for. BrainDog's own parts are never on it, and a base part is offered only as the way back on. "Suggested for you"
 * comes from the record itself, with its reason.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CORE, MODULES } from '@braindog/declare';

import type { PackState } from '../record/packs.ts';
import { listingHref, type Listing, type ListingKind } from './listing.ts';
import { shelfOf, storeChips, storeOf } from './shelves.ts';
import { SUGGESTED_MOST, suggestionsOf, suggestWords } from './suggest.ts';

const listing = (kind: ListingKind, id: string, more: Partial<Listing> = {}): Listing => ({
  key: `${kind}:${id}`,
  kind,
  id,
  installedId: kind === 'usecase' ? `usecase-${id}` : id,
  title: id,
  summary: `${id} does a thing`,
  author: 'BrainDog',
  license: 'MIT',
  categories: [],
  publisher: null,
  source: 'kennel',
  latest: '1.0.0',
  versions: [{ version: '1.0.0', published_at: '2026-10-01T00:00:00.000Z', bump: null, reach: {} } as unknown as Listing['versions'][number]],
  count: null,
  ...more,
});

const core = CORE[0]!;
const base = MODULES.find((m) => !(CORE as readonly string[]).includes(m))!;
const state = (id: string, off = false): PackState => ({ id, version: '1.0.0', disabled_at: off ? '2026-10-01' : null, registers: [] });

test('STARTERS LEAD, EXAMPLES STAND APART, and every add-on is on one shelf in the store order', () => {
  const store = storeOf(
    [
      listing('usecase', 'solo'),
      listing('usecase', 'trade', { example: true }),
      listing('pack', 'bank-feed', { shelf: 'money' }),
      listing('pack', 'look', { categories: ['themes'] }),
      listing('pack', 'loose'),
    ],
    [],
  );
  assert.deepEqual(
    store.starters.map((l) => l.id),
    ['solo'],
  );
  assert.deepEqual(
    store.examples.map((l) => l.id),
    ['trade'],
  );
  assert.deepEqual(
    store.shelves.map((s) => [s.shelf, s.items.map((l) => l.id)]),
    [
      ['money', ['bank-feed']],
      ['reading', ['loose']],
      ['looks', ['look']],
    ],
  );
});

test('BRAINDOG’S OWN PARTS ARE NEVER IN THE STORE, and a base part only while it is turned off here', () => {
  const listings = [listing('module', core), listing('module', base)];
  const on = storeOf(listings, [state(core), state(base)]);
  assert.equal(on.shelves.flatMap((s) => s.items).length, 0);
  const unknown = storeOf(listings, null);
  assert.equal(unknown.shelves.flatMap((s) => s.items).length, 0);
  const off = storeOf(listings, [state(core, true), state(base, true)]);
  assert.deepEqual(
    off.shelves.flatMap((s) => s.items.map((l) => l.id)),
    [base],
  );
});

test('A SHELF IS THE CATALOGUE’S, else worked out from the part an add-on needs', () => {
  assert.equal(shelfOf(listing('pack', 'x', { shelf: 'regions' })), 'regions');
  assert.equal(shelfOf(listing('pack', 'x', { categories: ['themes'] })), 'looks');
  assert.equal(shelfOf(listing('pack', 'x')), 'reading');
});

test('THE CHIPS ARE THE STARTERS, examples counted in, then each shelf that holds anything', () => {
  const store = storeOf([listing('usecase', 'a'), listing('usecase', 'b', { example: true }), listing('pack', 'c', { shelf: 'money' })], []);
  assert.deepEqual(storeChips(store, 'Starters'), [
    { id: 'starters', name: 'Starters', count: 2 },
    { id: 'money', name: 'Money', count: 1 },
  ]);
});

const feed = listing('pack', 'acme', { title: 'Acme Bank', shelf: 'money', categories: ['connectors'] });
const red = { sign: 'rates-current', state: 'red', said: 'The newest exchange rate is 28 days old. A feed of rates once a day would keep them current.' };

test('A RED RATES SIGN SUGGESTS KEEPING RATES CURRENT, with the sign’s first sentence as the reason, only where money is on', () => {
  const got = suggestionsOf({ signs: [red], questions: [], listings: [], states: [], moneyOn: true, href: listingHref });
  assert.equal(got.length, 1);
  assert.equal(got[0]!.title, suggestWords.ratesTitle);
  assert.equal(got[0]!.why, 'The newest exchange rate is 28 days old.');
  assert.equal(suggestionsOf({ signs: [red], questions: [], listings: [], states: [], moneyOn: false, href: listingHref }).length, 0);
  assert.equal(suggestionsOf({ signs: [{ ...red, state: 'green' }], questions: [], listings: [], states: [], moneyOn: true, href: listingHref }).length, 0);
});

test('A QUESTION THAT NAMES A MONEY CONNECTOR SUGGESTS IT, while it is not added, and never a part of a word', () => {
  const ask = (q: string, states: PackState[] = []) => suggestionsOf({ signs: [], questions: [q], listings: [feed], states, moneyOn: true, href: listingHref });
  const got = ask('What is the balance on Acme Bank today?');
  assert.equal(got.length, 1);
  assert.match(got[0]!.why, /Acme Bank/u);
  assert.equal(got[0]!.href, '/plugins/acme?kind=pack');
  assert.equal(ask('What is the balance on Acme Bank today?', [state('acme')]).length, 0);
  assert.equal(ask('Is the Acme Banks report in?').length, 0);
  assert.equal(suggestionsOf({ signs: [], questions: ['Acme Bank?'], listings: [feed], states: null, moneyOn: true, href: listingHref }).length, 0);
});

test('AT MOST THREE SUGGESTIONS, rates first', () => {
  const many = ['A', 'B', 'C', 'D'].map((x) => listing('pack', x.toLowerCase(), { title: `${x}bank`, shelf: 'money', categories: ['connectors'] }));
  const got = suggestionsOf({ signs: [red], questions: ['Abank Bbank Cbank Dbank balances?'], listings: many, states: [], moneyOn: true, href: listingHref });
  assert.equal(got.length, SUGGESTED_MOST);
  assert.equal(got[0]!.key, 'rates');
});
