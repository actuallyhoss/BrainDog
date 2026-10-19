/**
 * "Change this" on a block: the lines the rules read into a patch, and the ones they leave to the model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withPatch } from '../record/page-write.ts';
import { askedOf, pinnedIn, unchanged, type AskField, type AskIn } from './change-this.ts';

const FIELDS: AskField[] = [
  { id: 'status', type: 'enum', values: ['open', 'paid', 'cancelled'] },
  { id: 'due', type: 'day' },
  { id: 'amount', type: 'money' },
  { id: 'owner', type: 'text' },
];
const BLOCK = {
  kind: 'table',
  source: 'bills',
  columns: [{ field: 'owner' }, { field: 'due' }, { field: 'amount' }],
};
const NOW = Date.UTC(2026, 9, 20);
const ask = (text: string, over: Partial<AskIn> = {}) =>
  askedOf({ text, block: BLOCK, register: 'bills', fields: FIELDS, kinds: ['table', 'cards', 'calendar', 'board', 'bar'], now: NOW, ...over });

test('A KIND IS NAMED THE WAY A PERSON SAYS IT, and only one the cells allow is taken', () => {
  assert.equal(ask('show it as a calendar')?.patch.kind, 'calendar');
  assert.equal(ask('as a chart')?.patch.kind, 'bar');
  assert.equal(ask('show it as a timeline'), null);
});

test('A SORT NAMES A FIELD OR A WAY, and the way picks the field', () => {
  assert.deepEqual(ask('sort by amount highest first')?.patch.order, [{ field: 'amount', dir: 'desc' }]);
  assert.deepEqual(ask('newest first')?.patch.order, [{ field: 'due', dir: 'desc' }]);
  assert.deepEqual(ask('oldest first')?.patch.order, [{ field: 'due', dir: 'asc' }]);
  assert.deepEqual(ask('biggest first')?.patch.order, [{ field: 'amount', dir: 'desc' }]);
});

test('A COUNT IS A LIMIT, and a feed keeps its own word for it', () => {
  assert.equal(ask('top 5')?.patch.limit, 5);
  assert.equal(askedOf({ text: 'first 3', block: { kind: 'feed' }, register: 'bills', fields: FIELDS, kinds: [], now: NOW })?.patch.first, 3);
  assert.notEqual(ask('last 30 days')?.patch.limit, 30);
});

test('A PERIOD FILTERS THE BLOCK`S DATE, in a sentence the record reads', () => {
  assert.equal(ask('only this month')?.patch.where, 'due is between bom and eom');
  assert.equal(ask('next 7 days')?.patch.where, 'due is between today and +7d');
});

test('LEAVING ONE OUT AND KEEPING ONE ARE THE SAME FIELD`S WORDS', () => {
  assert.equal(ask('hide paid ones')?.patch.where, 'status is not paid');
  assert.equal(ask('only the open ones')?.patch.where, 'status is open');
  assert.equal(ask('paid ones')?.patch.where, 'status is paid');
});

test('A SECOND FILTER IS ADDED TO THE FIRST, never in place of it', () => {
  const out = askedOf({ text: 'hide paid ones', block: { ...BLOCK, where: 'due is today' }, register: 'bills', fields: FIELDS, kinds: [], now: NOW });
  assert.equal(out?.patch.where, 'due is today, status is not paid');
});

test('A COLUMN IS TAKEN OFF BY NAME, and never the last one', () => {
  assert.deepEqual(ask('hide the owner column')?.patch.columns, [{ field: 'due' }, { field: 'amount' }]);
  assert.equal(askedOf({ text: 'hide the owner column', block: { kind: 'table', columns: [{ field: 'owner' }] }, register: 'bills', fields: FIELDS, kinds: [], now: NOW }), null);
});

test('A LINE THE RULES CANNOT READ IS LEFT FOR THE MODEL, and a block with no list takes no filter', () => {
  assert.equal(ask('make it feel calmer'), null);
  assert.equal(ask('only this month', { register: null }), null);
});

test('THE PATCH LANDS ON THE BLOCK THROUGH THE EDITOR`S OWN WRITE', () => {
  const got = ask('sort by due')!;
  assert.deepEqual(withPatch(BLOCK, got.patch).order, [{ field: 'due', dir: 'asc' }]);
  assert.equal(unchanged({ ...BLOCK, limit: 5 }, { limit: 5 }), true);
  assert.equal(unchanged(BLOCK, { limit: 5 }), false);
});

test('HIS PINS ARE KNOWN BY KEY', () => {
  assert.equal(pinnedIn('late', ['late']), true);
  assert.equal(pinnedIn('late', []), false);
  assert.equal(pinnedIn(undefined, ['late']), false);
});
