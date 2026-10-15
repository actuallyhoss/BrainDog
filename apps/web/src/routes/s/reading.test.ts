/**
 * The shared page's reading, held without a browser: the link read off the fragment and wiped from the address bar at
 * once, a link that does not open said in one sentence, and each typed cell drawn in the record's language and zone
 * with its amount in its own currency.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AMOUNT_SPACE } from 'braindog-render';

import { cellSaid, figureSaid, headOf, moneySaid, plainSaid, takeShared, type Said, type Where } from './reading.ts';

const where: Where = { language: 'en-GB', zone: 'Europe/London', now: Date.parse('2026-10-15T12:00:00Z') };
/** What a cell says, with the writer's own space between a code and its figure read as a plain one. */
const said = (s: Said): string => ('money' in s ? s.money.text : s.text).replaceAll(AMOUNT_SPACE, ' ');

test('the link is read off the fragment once, and the address is wiped first', () => {
  let wiped = 0;
  assert.equal(
    takeShared('#tok_Qm2kLz', () => (wiped += 1)),
    'tok_Qm2kLz',
  );
  assert.equal(wiped, 1);
});

test('an address with no fragment is a link that does not open, and nothing is wiped', () => {
  let wiped = 0;
  assert.equal(
    takeShared('', () => (wiped += 1)),
    '',
  );
  assert.equal(
    takeShared('#  ', () => (wiped += 1)),
    '',
  );
  assert.equal(wiped, 0);
});

test('a dead or closed link reads This page is not shared., and never why', () => {
  assert.deepEqual(headOf({ from: 'shut' }), { title: 'This page is not shared.', line: 'Ask whoever sent the link for a new one.' });
});

test('a live page heads with its name and the day its link stops', () => {
  const page = { title: 'Weekly bakes', expires_at: '2026-11-14T00:00:00.000Z', read_at: null, language: 'en', zone: 'UTC', empty: null, blocks: [] };
  assert.deepEqual(headOf({ from: 'live', page }), { title: 'Weekly bakes', line: 'This link works until 14 Nov 2026.' });
  const east = { ...page, expires_at: '2026-11-14T03:00:00.000Z', zone: 'America/New_York' };
  assert.equal(headOf({ from: 'live', page: east }).line, 'This link works until 13 Nov 2026.');
});

test('a money cell is drawn whole in its own currency, and turned when its row says it went out', () => {
  const row = {
    cells: { total: { type: 'money', value: { amount: 123450, currency: 'EGP' } }, way: { type: 'enum', value: 'out', label: 'Paid out' } },
    fields: {},
    state: null,
  };
  assert.equal(said(cellSaid(row, { field: 'total' }, where)), 'EGP 1,234.50');
  assert.equal(said(cellSaid(row, { field: 'total', sign: { field: 'way', minus: 'out' } }, where)), '−EGP 1,234.50');
  assert.equal(said(cellSaid(row, { field: 'way' }, where)), 'Paid out');
  const gbp = moneySaid(999, 'GBP');
  assert.ok(gbp && gbp.text.includes('9.99') && gbp.text.includes('GBP'), gbp?.text);
});

test('a money figure says its currency, and a figure with none says so', () => {
  assert.equal(said(figureSaid({ metric: 'takings', label: 'Takings', value: 4_200_00, unit: 'EGP' }, where)), 'EGP 4,200');
  assert.equal(said(figureSaid({ metric: 'loaves', value: 1200, unit: 'loaves' }, where)), '1,200 loaves');
  assert.equal(said(figureSaid({ metric: 'loaves', value: null, unit: null }, where)), 'No figure');
});

test('numbers follow the record language with Latin digits, not the visitor device', () => {
  assert.equal(plainSaid(1234.5, { ...where, language: 'de-DE' }), '1.234,5');
  assert.equal(plainSaid(1234.5, { ...where, language: 'ar-EG' }).replace(/[^0-9]/gu, ''), '12345');
  assert.equal(plainSaid('2026-10-03', where), '3 Oct 2026');
  assert.equal(plainSaid(true, where), 'Yes');
});

test('a list cell says each value by its type, and a row with no cells falls back to its plain value', () => {
  const row = { cells: { tags: { type: 'list', of: 'day', value: ['2026-10-01', '2026-10-02'] } }, fields: { note: 'Rye on Fridays' }, state: null };
  assert.equal(said(cellSaid(row, { field: 'tags' }, where)), '1 Oct 2026, 2 Oct 2026');
  assert.equal(said(cellSaid(row, { field: 'note' }, where)), 'Rye on Fridays');
});
