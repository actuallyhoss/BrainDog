/**
 * An attach is its own kind: a name in a text put on the row it is, with the sentence it was seen in.
 *
 * Slash may act on its own, per kind, so the attach it files has to be a kind that can be earned
 * apart from editing the row, off the floors, always undoable. A row with an amount is never earned:
 * it is the money floor, and asks at every rung. Nothing else's floor moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ATTACH, FLOORS, kindOfAttach, kindOfEvent, kindsOfProposal, type KindReader, type ListShape } from '../src/change-kind.ts';

const PEOPLE: ListShape = {
  fields: [
    { id: 'name', type: 'text' },
    { id: 'met', type: 'list', of: 'text' },
    { id: 'notes', type: 'text' },
  ],
  identity: ['name'],
  names: ['name'],
  seen: ['met'],
};
const PAYEES: ListShape = {
  fields: [
    { id: 'name', type: 'text' },
    { id: 'met', type: 'list', of: 'text' },
    { id: 'owed', type: 'money' },
  ],
  seen: ['met'],
};

const reader = (fields: Record<string, Record<string, unknown>> = {}): KindReader => ({
  shape: (list) => (list === 'people' ? PEOPLE : list === 'payees' ? PAYEES : null),
  madeBy: () => null,
  fieldsOf: (_list, at) => fields[at] ?? null,
  person: null,
});
const line = '2026-10-15 · note on Lanternfish: "Sara sent the drawings."';

test('an attach is its own kind, off the floors', () => {
  assert.equal(ATTACH, 'attach');
  assert.deepEqual(kindOfAttach('people', false), { key: 'people:attach', list: 'people', verb: 'attach', floor: null });
  assert.ok(!(FLOORS as readonly string[]).includes(ATTACH), 'attach is no floor of its own');
});

test('an attach to a row with an amount is the money floor', () => {
  assert.equal(kindOfAttach('payees', true).floor, 'money');
  assert.equal(kindOfAttach('payees', true).key, 'payees:attach');
});

test('a rowset said as an attach, adding only where a row was seen, is the attach kind', () => {
  const body = { register: 'people', as: ATTACH, rows: [{ at: 'people#4', patch: { met: [line] } }] };
  const kinds = kindsOfProposal('rowset', body, reader({ 'people#4': { name: 'Sara Idris', met: [] } }));
  assert.deepEqual(kinds.map((k) => [k.key, k.floor]), [['people:attach', null]]);
});

test('the same rowset not said as an attach reads as it always did', () => {
  const body = { register: 'people', rows: [{ at: 'people#4', patch: { met: [line] } }] };
  const kinds = kindsOfProposal('rowset', body, reader({ 'people#4': { name: 'Sara Idris' } }));
  assert.deepEqual(kinds.map((k) => k.key), ['people:tag']);
});

test('saying attach never makes more than an attach cheaper', () => {
  const renames = { register: 'people', as: ATTACH, rows: [{ at: 'people#4', patch: { met: [line], name: 'Sara Kell' } }] };
  const kinds = kindsOfProposal('rowset', renames, reader({ 'people#4': { name: 'Sara Idris' } }));
  assert.ok(!kinds.some((k) => k.verb === ATTACH));
  assert.ok(kinds.some((k) => k.floor === 'identity'), 'a rename in it is still who the row is');
  const clears = { register: 'people', as: ATTACH, rows: [{ at: 'people#4', patch: { met: [] } }] };
  assert.equal(kindsOfProposal('rowset', clears, reader()).some((k) => k.verb === ATTACH), false);
  const adds = { register: 'people', as: ATTACH, rows: [{ name: 'Tomas Reyes', met: [line] }] };
  assert.deepEqual(kindsOfProposal('rowset', adds, reader()).map((k) => k.key), ['people:add']);
});

test('an attach to a row with an amount asks, and one that cannot be read is taken to hold one', () => {
  const body = { register: 'payees', as: ATTACH, rows: [{ at: 'payees#2', patch: { met: [line] } }] };
  const owed = kindsOfProposal('rowset', body, reader({ 'payees#2': { name: 'Brightwell', owed: { amount: 12000, currency: 'EUR' } } }));
  assert.deepEqual(owed.map((k) => [k.key, k.floor]), [['payees:attach', 'money']]);
  const none = kindsOfProposal('rowset', body, reader({ 'payees#2': { name: 'Brightwell', owed: null } }));
  assert.deepEqual(none.map((k) => [k.key, k.floor]), [['payees:attach', null]]);
  assert.equal(kindsOfProposal('rowset', body, reader()).map((k) => k.floor)[0], 'money');
});

test('an attach keeps the floor of a row another person made', () => {
  const body = { register: 'people', as: ATTACH, rows: [{ at: 'people#4', patch: { met: [line] } }] };
  const theirs: KindReader = { ...reader({ 'people#4': { name: 'Sara Idris' } }), madeBy: () => 'member-2' };
  assert.deepEqual(kindsOfProposal('rowset', body, theirs).map((k) => [k.key, k.floor]), [['people:attach', 'others']]);
});

test('an attach event is read as the attach kind', () => {
  const e = { list: 'people', kind: ATTACH, field: 'met', to_v: JSON.stringify([line]) };
  assert.deepEqual(kindOfEvent(e, PEOPLE), { key: 'people:attach', list: 'people', verb: 'attach', floor: null });
  assert.equal(kindOfEvent({ ...e, list: 'payees' }, PAYEES)?.floor, 'money');
  assert.equal(kindOfEvent({ ...e, list: 'payees' }, PAYEES, { amount: false })?.floor, null);
  assert.equal(kindOfEvent(e, null)?.floor, 'outside');
});

test('an attach that takes a line out of where the row was seen reads as the edit it is', () => {
  const before = '2026-10-01 · note on the renewal: "Sara called."';
  const was = reader({ 'people#4': { name: 'Sara Idris', met: [before] } });
  const keeps = { register: 'people', as: ATTACH, rows: [{ at: 'people#4', patch: { met: [before, line] } }] };
  assert.deepEqual(kindsOfProposal('rowset', keeps, was).map((k) => k.key), ['people:attach']);
  const swaps = { register: 'people', as: ATTACH, rows: [{ at: 'people#4', patch: { met: [line] } }] };
  assert.deepEqual(kindsOfProposal('rowset', swaps, was).map((k) => k.key), ['people:tag']);
  const same = { register: 'people', as: ATTACH, rows: [{ at: 'people#4', patch: { met: [before] } }] };
  assert.equal(kindsOfProposal('rowset', same, was).some((k) => k.verb === ATTACH), false);
});
