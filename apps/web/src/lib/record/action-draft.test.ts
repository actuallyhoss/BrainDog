/**
 * The scheduled-action sheet's presets, and the one that is made from the record: exchange rates.
 *
 * THE RATES PRESET WAS A DRAFT OF ITS OWN: one action a currency, at api.frankfurter.app, whose own answer quotes no
 * Egyptian pound (`docs/08` 2.5), on a record whose home currency is the Egyptian pound. It is now the add-on file
 * filled by `fillRates(template, ratesSpecFor(...))` from the record's currencies, one poll for all of them, and these
 * hold that it stays so: the filler's maps are the ones filed, the home currency is the base, and a record in one
 * currency is offered no feed at all.
 *
 * RED FIRST, MEASURED: before `ratesPreset` this file did not load (no such export), and with the old frankfurter preset
 * put back in its place five of the seven tests below failed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateDeclaration } from '@braindog/kernel';
import { fillRates, ratesSpecFor } from '../../../../../packs/rates-poll/fill.ts';

import { RATES_CURRENCIES_MOST } from '../../../../../packs/rates-poll/fill.ts';
import { actionWords, blankDraft, declarationOf, presetOf, ratesPreset, type ActionDraft } from './action-draft.ts';

const FILE = (): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL('../../../../../packs/rates-poll/rates-poll.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;

/** The record of the scope: home EGP, money in Egyptian pounds and dollars. */
const EGP_USD = { currencies: ['EGP', 'USD'], home: 'EGP' };

/** What the filler alone would write for the same record, the poll's maps. */
const fillerMaps = (currencies: string[], home: string): unknown =>
  (fillRates(FILE(), ratesSpecFor(currencies, home)!).declarations as { map: unknown }[])[0]!.map;

test('THE RATES PRESET IS THE ADD-ON FILE FILLED FROM THE RECORD: the home currency is the base, at the file’s address, once a day', () => {
  const draft = presetOf('action', 'rates', EGP_USD);
  assert.equal(draft.name, 'Exchange rates');
  assert.equal(draft.channel, 'poll');
  assert.equal(draft.url, 'https://open.er-api.com/v6/latest/EGP');
  assert.equal(draft.every, '1d');
  assert.equal(draft.register, 'fx');
  assert.equal(draft.grant, '', 'the address is public and sends no key');
  assert.deepEqual(draft.filled?.maps, fillerMaps(['EGP', 'USD'], 'EGP'));
  assert.equal(draft.filled?.said, 'Asks open.er-api.com once a day what one EGP is worth in USD, and writes it to Exchange rates.');
  assert.doesNotMatch(JSON.stringify(draft), /frankfurter/u, 'the old address, which quotes no Egyptian pound, is still offered');
});

test('ONE ACTION FOR EVERY CURRENCY: dollars and sterling beside the pound are two rows of one poll', () => {
  const draft = ratesPreset({ currencies: ['USD', 'GBP', 'EGP'], home: 'EGP' })!;
  const maps = draft.filled!.maps as { currency: { value: string }; base: { value: string }; rate: { path: string } }[];
  assert.deepEqual(
    maps.map((m) => [m.currency.value, m.base.value, m.rate.path]),
    [
      ['EGP', 'GBP', 'rates.GBP'],
      ['EGP', 'USD', 'rates.USD'],
    ],
  );
  assert.match(draft.filled!.said, /once a day what one EGP is worth in GBP and USD/u);
});

test('FILED, IT IS THE FILLER’S POLL UNDER THE FILLER’S NAME, and the record’s own lint takes it', () => {
  const built = declarationOf(presetOf('action', 'rates', EGP_USD), new Set(['rates_open_er_api_com']));
  assert.ok(built.ok, built.ok ? '' : built.fix);
  /* `taken` HOLDS THE SAME NAME AND IT IS NOT REFUSED: a record that gains a currency opens this again, and its feed is
     replaced rather than joined by a second poll fetching the same address. */
  assert.equal(built.decl.id, 'ingest.rates_open_er_api_com');
  assert.deepEqual(built.decl.body, {
    ingest: 'rates_open_er_api_com',
    description: 'Exchange rates',
    channel: 'poll',
    url: 'https://open.er-api.com/v6/latest/EGP',
    every: '1d',
    writes: { register: 'fx' },
    map: fillerMaps(['EGP', 'USD'], 'EGP'),
  });
  assert.equal(validateDeclaration(built.decl as never), null);
});

test('A RECORD IN ONE CURRENCY, OR WITH NO HOME, IS OFFERED NO FEED, and the sheet opens blank rather than at a guess', () => {
  for (const held of [
    { currencies: ['EGP'], home: 'EGP' },
    { currencies: [], home: 'EGP' },
    { currencies: ['EGP', 'USD'], home: null },
  ]) {
    assert.equal(ratesPreset(held), null, JSON.stringify(held));
    assert.deepEqual(presetOf('action', 'rates', held), blankDraft('action'), JSON.stringify(held));
  }
  /* A DOOR NAMED rates IS NOT THE RATES ACTION. */
  assert.deepEqual(presetOf('door', 'rates', EGP_USD), blankDraft('door'));
});

test('TURNED INTO SOMETHING ELSE ON THE SHEET, IT IS AN ORDINARY DRAFT, and the filler’s maps go with it', () => {
  const draft: ActionDraft = { ...presetOf('action', 'rates', EGP_USD), register: 'datapoints' };
  const built = declarationOf(draft);
  assert.ok(built.ok, built.ok ? '' : built.fix);
  assert.equal(built.decl.id, 'ingest.exchange_rates');
  assert.equal(built.decl.body.map, undefined, 'maps written for Exchange rates were filed against another list');
});

test('EACH OPENING IS A FRESH COPY, so typing into one sheet never changes the next', () => {
  const first = presetOf('action', 'rates', EGP_USD);
  (first.filled!.maps[0] as { rate: { path: string } }).rate.path = 'rates.XXX';
  first.url = 'https://example.com';
  const again = presetOf('action', 'rates', EGP_USD);
  assert.equal(again.url, 'https://open.er-api.com/v6/latest/EGP');
  assert.deepEqual(again.filled?.maps, fillerMaps(['EGP', 'USD'], 'EGP'));
  /* AND A FILED DRAFT CARRIES ITS OWN MAPS, NOT THE PRESET'S. */
  const filed = declarationOf(again);
  assert.ok(filed.ok);
  assert.notEqual(filed.decl.body.map, again.filled?.maps);
});

test('the words are plain: no em dash, and the host is named so the owner knows where it calls', () => {
  const said = actionWords.ratesSaid('open.er-api.com', 'EGP', ['GBP', 'SAR', 'USD']);
  assert.equal(said, 'Asks open.er-api.com once a day what one EGP is worth in GBP, SAR and USD, and writes each to Exchange rates.');
  assert.doesNotMatch(said + actionWords.ratesName, /—/u);
});

test('SAVED FROM THE SHEET, WHOSE DRAFT IS A PROXY, IT FILES: the filler’s maps are copied in a way a proxy allows', () => {
  /* THE SHEET HOLDS ITS DRAFT IN `$state`, a deep proxy, and `structuredClone` refuses a proxy. Measured red: with the
     maps copied by `structuredClone` this threw "could not be cloned", which on the sheet is the save press doing
     nothing. A plain `Proxy` stands in for Svelte's, which throws the same. */
  const deep = <T extends object>(o: T): T =>
    new Proxy(o, { get: (t, k) => (typeof t[k as keyof T] === 'object' && t[k as keyof T] !== null ? deep(t[k as keyof T] as object) : t[k as keyof T]) });
  const built = declarationOf(deep(presetOf('action', 'rates', EGP_USD)));
  assert.ok(built.ok, built.ok ? '' : built.fix);
  assert.deepEqual(built.decl.body.map, fillerMaps(['EGP', 'USD'], 'EGP'));
});

test('MORE CURRENCIES THAN ONE POLL FILLS OPENS A BLANK SHEET, rather than throwing as the sheet opens', () => {
  const codes = Array.from({ length: RATES_CURRENCIES_MOST + 1 }, (_, i) => `Q${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);
  assert.equal(ratesPreset({ currencies: [...codes, 'EGP'], home: 'EGP' }), null);
  assert.deepEqual(presetOf('action', 'rates', { currencies: [...codes, 'EGP'], home: 'EGP' }), blankDraft('action'));
  assert.equal(ratesPreset({ currencies: [...codes.slice(1), 'EGP'], home: 'EGP' })?.filled?.maps.length, RATES_CURRENCIES_MOST);
});
