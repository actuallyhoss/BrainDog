/**
 * One page per add-on: `/addons/<id>` is the add-on as this record holds it when it holds it, whichever way the address
 * names it, and the store's page when it does not. A private add-on is found from the catalogue this build ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { listedEntries, readCatalogue, type CatalogueIndex } from '@braindog/declare/catalogue';
import { CORE as CORE_PARTS } from '@braindog/declare';
import { USE_CASES } from '@braindog/seed/usecases';

import { foundListing, heldAs, newerThan } from './found.ts';

const starter = USE_CASES[0]!.usecase;
const state = (id: string) => ({ id, version: '1.0.0', disabled_at: null, registers: [] });

test('A STARTER IS HELD UNDER ITS PACK ID, and an address names it either way', () => {
  const states = [state(`usecase-${starter}`), state('some-addon')];
  assert.equal(heldAs(starter, null, states), `usecase-${starter}`);
  assert.equal(heldAs(starter, 'usecase', states), `usecase-${starter}`);
  assert.equal(heldAs(`usecase-${starter}`, null, states), `usecase-${starter}`);
  assert.equal(heldAs('some-addon', 'pack', states), 'some-addon');
  assert.equal(heldAs('other-addon', 'pack', states), null);
});

const read = readCatalogue(JSON.parse(readFileSync(new URL('../../../../static/catalogue/index.json', import.meta.url), 'utf8')));
if (!read.ok) throw new Error('the shipped catalogue does not read');
const shipped: CatalogueIndex = read.value;
const kennel: CatalogueIndex = { ...shipped, entries: listedEntries(shipped) };

test('A PRIVATE ADD-ON IS FOUND FROM THE SHIPPED CATALOGUE, offered by link only; a listed one is in the store', () => {
  const hidden = shipped.entries.find((e) => e.kind === 'pack' && e.private === true)!;
  const got = foundListing({ kennel, shipped, counts: null, id: hidden.id, kind: null });
  assert.equal(got?.tier, 'link');
  assert.equal(got?.shippedOnly, true);
  const listed = kennel.entries.find((e) => e.kind === 'pack')!;
  const store = foundListing({ kennel, shipped, counts: null, id: listed.id, kind: 'pack' });
  assert.equal(store?.tier, 'store');
  assert.equal(store?.shippedOnly, false);
});

test('BRAINDOG’S OWN PARTS ARE PART OF BRAINDOG, and a starter is found by its pack id', () => {
  const core = foundListing({ kennel: null, shipped: null, counts: null, id: CORE_PARTS[0]!, kind: 'module' });
  assert.equal(core?.tier, 'builtin');
  const found = foundListing({ kennel: null, shipped: null, counts: null, id: `usecase-${starter}`, kind: null });
  assert.equal(found?.listing.kind, 'usecase');
  assert.equal(found?.listing.id, starter);
});

test('AN UPDATE IS SAID ONLY PAST THE VERSION HELD', () => {
  const listing = foundListing({ kennel, shipped, counts: null, id: kennel.entries.find((e) => e.kind === 'pack')!.id, kind: 'pack' })!.listing;
  assert.equal(newerThan(listing, '0.0.1'), listing.latest);
  assert.equal(newerThan(listing, listing.latest), null);
  assert.equal(newerThan(listing, null), null);
});
