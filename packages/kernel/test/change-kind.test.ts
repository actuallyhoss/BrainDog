/**
 * What kind of change a write or a proposal is, and the floor no rung lifts.
 *
 * The ladder lets an agent make one kind of change without asking once the owner has kept enough of them, so the kind
 * has to be the same name whether it is read off a write, a proposal's body or the log, and the floor has to hold
 * however the change arrives: money amounts, keys, sharing, deletes, add-ons, rows another person made, and anything
 * that leaves the record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dearest,
  keysOfStamp,
  kindOfEvent,
  kindOfWrite,
  kindsOfProposal,
  kindsOfWrite,
  stampOf,
  type KindReader,
  type ListShape,
} from '../src/change-kind.ts';
import { ceilingOf, CEILING } from '../src/token.ts';

const TASKS: ListShape = {
  state: 'state',
  fields: [
    { id: 'title', type: 'text' },
    { id: 'state', type: 'enum' },
    { id: 'tags', type: 'list', of: 'text' },
    { id: 'project', type: 'ref', scope: { widen: 'person' } },
  ],
};
const BILLS: ListShape = { fields: [{ id: 'what', type: 'text' }, { id: 'amount', type: 'money' }] };
const KEYS: ListShape = { fields: [{ id: 'label', type: 'text' }, { id: 'value', type: 'secret' }] };

const keys = (kinds: { key: string }[]) => kinds.map((k) => k.key);
const floors = (kinds: { key: string; floor: string | null }[]) => Object.fromEntries(kinds.map((k) => [k.key, k.floor]));

test('A WRITE IS ITS LIST AND A VERB: add, move to a state, edit, tag, note and delete', () => {
  assert.equal(kindOfWrite({ list: 'tasks', op: 'create', patch: { title: 'Ship' }, shape: TASKS }).key, 'tasks:add');
  assert.equal(kindOfWrite({ list: 'tasks', op: 'update', patch: { state: 'done' }, shape: TASKS }).key, 'tasks:move:done');
  assert.equal(kindOfWrite({ list: 'tasks', op: 'update', patch: { title: 'Ship it' }, shape: TASKS }).key, 'tasks:edit');
  assert.equal(kindOfWrite({ list: 'tasks', op: 'update', patch: { tags: ['late'] }, shape: TASKS }).key, 'tasks:tag');
  assert.equal(kindOfWrite({ list: 'tasks', op: 'note', shape: TASKS }).key, 'tasks:note');
  assert.equal(kindOfWrite({ list: 'tasks', op: 'delete', shape: TASKS }).key, 'tasks:delete');
  for (const k of ['create', 'update', 'note'] as const)
    assert.equal(kindOfWrite({ list: 'tasks', op: k, patch: { title: 'x' }, shape: TASKS }).floor, null, `${k} is on the floor`);
});

test('A PATCH THAT DOES TWO THINGS IS BOTH KINDS, so a rung for one does not carry the other', () => {
  const both = kindsOfWrite({ list: 'tasks', op: 'update', patch: { state: 'done', title: 'Renamed' }, shape: TASKS });
  assert.deepEqual(keys(both).sort(), ['tasks:edit', 'tasks:move:done']);
  /* AND THE DEAREST NAMES IT: a move before an edit, a delete before both. */
  assert.equal(dearest(both)?.key, 'tasks:move:done');
  const gone = kindsOfWrite({ list: 'tasks', op: 'update', patch: { deleted_at: '2026-10-06T00:00:00Z', title: 'x' }, shape: TASKS });
  assert.equal(dearest(gone)?.key, 'tasks:delete');
  assert.equal(dearest(gone)?.floor, 'delete');
});

test('THE FLOOR: money, keys, sharing, deletes and another person’s row always ask', () => {
  assert.equal(kindOfWrite({ list: 'bills', op: 'create', patch: { what: 'Rent', amount: { amount: 120000, currency: 'GBP' } }, shape: BILLS }).floor, 'money');
  /* A ROW MADE WITH NO AMOUNT IS NOT MONEY, and neither is editing what it is for. */
  assert.equal(kindOfWrite({ list: 'bills', op: 'create', patch: { what: 'Rent' }, shape: BILLS }).floor, null);
  assert.equal(kindOfWrite({ list: 'bills', op: 'update', patch: { what: 'Rent, October' }, shape: BILLS }).floor, null);
  assert.equal(kindOfWrite({ list: 'bills', op: 'update', patch: { amount: { amount: 1, currency: 'GBP' } }, shape: BILLS }).floor, 'money');
  /* AND CLEARING AN AMOUNT CHANGES IT AS MUCH AS SETTING ONE. */
  assert.equal(kindOfWrite({ list: 'bills', op: 'update', patch: { amount: null }, shape: BILLS }).floor, 'money');
  /* EVERY CHANGE TO A LIST THAT HOLDS SEALED VALUES IS KEYS, even its label. */
  assert.equal(kindOfWrite({ list: 'credentials', op: 'update', patch: { label: 'Stripe' }, shape: KEYS }).floor, 'keys');
  assert.equal(kindOfWrite({ list: 'credentials', op: 'create', patch: { label: 'Stripe' }, shape: KEYS }).floor, 'keys');
  /* MOVING WHERE A ROW APPLIES IS SHARING; putting it somewhere when it is made is not. */
  assert.equal(kindOfWrite({ list: 'tasks', op: 'update', patch: { project: 'things#2' }, shape: TASKS }).floor, 'sharing');
  assert.equal(kindOfWrite({ list: 'tasks', op: 'create', patch: { title: 'x', project: 'things#2' }, shape: TASKS }).floor, null);
  assert.equal(kindOfWrite({ list: 'tasks', op: 'delete', shape: TASKS }).floor, 'delete');
  /* A ROW ANOTHER PERSON MADE, for every verb but making one. */
  const theirs = { madeBy: 'p_ada', person: 'p_mara' };
  assert.equal(kindOfWrite({ list: 'tasks', op: 'update', patch: { state: 'done' }, shape: TASKS, ...theirs }).floor, 'others');
  assert.equal(kindOfWrite({ list: 'tasks', op: 'note', shape: TASKS, ...theirs }).floor, 'others');
  assert.equal(kindOfWrite({ list: 'tasks', op: 'update', patch: { state: 'done' }, shape: TASKS, madeBy: 'p_mara', person: 'p_mara' }).floor, null);
  /* A LIST THE RECORD DOES NOT HAVE IS OUTSIDE IT. */
  assert.equal(kindOfWrite({ list: 'nowhere', op: 'create', patch: {}, shape: null }).floor, 'outside');
});

test('THE LOG READS BACK AS THE SAME KINDS the write was', () => {
  const line = (kind: string, field: string | null, to_v: string | null) => kindOfEvent({ list: 'tasks', kind, field, to_v }, TASKS);
  assert.equal(line('create', null, '{"title":"Ship"}')?.key, 'tasks:add');
  assert.equal(line('state', 'state', '"done"')?.key, 'tasks:move:done');
  assert.equal(line('edit', 'title', '"Ship it"')?.key, 'tasks:edit');
  assert.equal(line('link', 'project', null)?.floor, 'sharing');
  assert.equal(line('tag', 'tags', '"late"')?.key, 'tasks:tag');
  assert.equal(line('untag', 'tags', null)?.key, 'tasks:tag');
  assert.equal(line('note', null, null)?.key, 'tasks:note');
  for (const k of ['delete', 'restore', 'purge']) assert.equal(line(k, null, null)?.key, 'tasks:delete');
  assert.equal(line('decide', null, null), null);
  /* A MONEY VALUE IS REDACTED IN THE LOG, and the field's type is what makes it the floor. */
  assert.equal(kindOfEvent({ list: 'bills', kind: 'edit', field: 'amount', to_v: '"--redacted--"' }, BILLS)?.floor, 'money');
  assert.equal(kindOfEvent({ list: 'bills', kind: 'create', field: null, to_v: '{"what":"Rent","amount":"--redacted--"}' }, BILLS)?.floor, 'money');
});

const reader = (made: Record<string, string> = {}): KindReader => ({
  shape: (list) => ({ tasks: TASKS, bills: BILLS, credentials: KEYS })[list] ?? null,
  madeBy: (_list, at) => made[at] ?? null,
  person: 'p_mara',
});

test('A PROPOSAL BREAKS DOWN INTO THE SAME KINDS, plus shape, automation, add-ons and a call', () => {
  const rows = kindsOfProposal('rowset', { register: 'tasks', rows: [{ title: 'a' }, { title: 'b' }, { at: 'tasks#3', version: 1, patch: { state: 'done' } }] }, reader());
  assert.deepEqual(keys(rows), ['tasks:move:done', 'tasks:add']);
  assert.deepEqual(keys(kindsOfProposal('options', { options: [] }, reader())), ['call']);
  assert.deepEqual(floors(kindsOfProposal('pack', { install: 'money' }, reader())), { addons: 'addons' });
  assert.deepEqual(floors(kindsOfProposal('arrange', { packs: {} }, reader())), { addons: 'addons' });
  assert.deepEqual(floors(kindsOfProposal('pattern', { ingest: {} }, reader())), { automation: 'outside' });
  assert.deepEqual(floors(kindsOfProposal('change', { declaration_id: 'register.tasks', to: { add: { fields: [{ id: 'due', type: 'day' }] } } }, reader())), { 'shape:tasks': null });
  assert.deepEqual(floors(kindsOfProposal('change', { declaration_id: 'register.tasks', to: { retire: { fields: ['due'] } } }, reader())), { 'shape:tasks': 'delete' });
  const bundle = { declaration_id: 'register.tasks', to: { declarations: [{ id: 'register.tasks', kind: 'register', body: { id: 'tasks' } }, { id: 'rule.nag', kind: 'rule', body: {} }, { id: 'page.home', kind: 'page', body: {} }] } };
  assert.deepEqual(floors(kindsOfProposal('change', bundle, reader())), { 'automation.reaches': 'outside', 'shape:tasks': null, 'declare:page': null });
  /* WHAT IT SENDS OUT PUTS EVERY KIND ON THE FLOOR. */
  assert.deepEqual(floors(kindsOfProposal('change', { ...bundle, egress: [{ line: 'x' }] }, reader())), { 'automation.reaches': 'outside', 'shape:tasks': 'outside', 'declare:page': 'outside' });
  /* AND A ROW ANOTHER PERSON MADE is read through the reader. */
  const theirs = kindsOfProposal('rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 1, patch: { state: 'done' } }] }, reader({ 'tasks#3': 'p_ada' }));
  assert.equal(theirs[0]?.floor, 'others');
});

test('THE STAMP IS ONE KEY, OR A LIST OF THEM DEAREST FIRST, and reads back either way', () => {
  assert.equal(stampOf(kindsOfProposal('rowset', { register: 'tasks', rows: [{ title: 'a' }, { title: 'b' }] }, reader())), 'tasks:add');
  const two = stampOf(kindsOfProposal('rowset', { register: 'bills', rows: [{ what: 'a' }, { at: 'bills#1', version: 1, patch: { amount: { amount: 5, currency: 'GBP' } } }] }, reader()));
  assert.equal(two, '["bills:edit","bills:add"]');
  assert.deepEqual(keysOfStamp(two), ['bills:edit', 'bills:add']);
  assert.deepEqual(keysOfStamp('tasks:add'), ['tasks:add']);
  assert.deepEqual(keysOfStamp(null), []);
  assert.equal(stampOf([]), null);
});

test('THE SCOPE IS THE CEILING: read has no rung, propose always asks, write lets a kind climb', () => {
  assert.deepEqual(CEILING, { read: null, propose: 'ask', write: 'quiet' });
  assert.equal(ceilingOf('read', 'quiet'), null);
  assert.equal(ceilingOf('propose', 'tell'), 'ask');
  assert.equal(ceilingOf('write', 'tell'), 'tell');
  assert.equal(ceilingOf('write', 'ask'), 'ask');
});
