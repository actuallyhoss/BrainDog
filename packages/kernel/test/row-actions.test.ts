/**
 * The verbs a page may name on a block and on each row: the table, the check an install and a read share, and
 * the cut that sends a reader only what they may press. Invented lists and fields throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refused } from '@braindog/ports';

import { ACTION_LEVELS, ACTION_VERBS, ACTIONS_MOST, actionsBody, cutActions, type DeclaredAction } from '../src/row-actions.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

/* A list of shipments, as an invented pack would declare it. */
const FIELDS = { fields: new Set(['title', 'stage', 'shipped', 'owner']) };

const refusalOf = (raw: unknown, key: 'actions' | 'row_actions' = 'row_actions') => {
  const out = actionsBody(raw, { ...FIELDS, key });
  assert.ok(refused(out), `expected a refusal for ${JSON.stringify(raw)}`);
  return out.refusal;
};

test('every verb in the table has a level, an undo, a hard mark and its args', () => {
  const verbs = Object.entries(ACTION_VERBS);
  assert.ok(verbs.length >= 7);
  for (const [verb, spec] of verbs) {
    assert.ok((ACTION_LEVELS as readonly string[]).includes(spec.level), `${verb} has a level`);
    assert.equal(typeof spec.undo, 'boolean', `${verb} says whether it can be undone`);
    assert.equal(typeof spec.hard, 'boolean', `${verb} says whether it is hard to undo`);
    assert.ok(Array.isArray(spec.args), `${verb} lists its args`);
  }
  for (const first of ['row.create', 'row.update', 'row.delete', 'row.tick', 'row.move', 'suggestion.answer', 'rule.from_arrivals'])
    assert.ok(Object.hasOwn(ACTION_VERBS, first), `${first} is in the table`);
});

test('a clean list comes back cleaned, labels trimmed and args bound to fields', () => {
  const out = actionsBody(
    [
      { verb: 'row.move', label: ` Send to ${PROJECTS[0]} `, args: { field: 'stage' }, as: 'choice' },
      { verb: 'row.tick', label: 'Shipped', as: 'switch' },
      { verb: 'row.delete', label: 'Remove', confirm: 'Remove this shipment? It can be brought back.', again: true },
    ],
    { ...FIELDS, key: 'row_actions' },
  );
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value[0], { verb: 'row.move', label: `Send to ${PROJECTS[0]}`, args: { field: 'stage' }, as: 'choice' });
  assert.equal(out.value[2]!.confirm, 'Remove this shipment? It can be brought back.');
  assert.equal(out.value[2]!.again, true);
});

test('an unknown verb is refused, naming the action and the verbs there are', () => {
  const r = refusalOf([{ verb: 'row.launch', label: 'Launch' }]);
  assert.equal(r.at, 'row_actions[0].verb');
  assert.match(r.fix, /row_actions\[0\] \(Launch\)/u);
  assert.match(r.fix, /not one a page may name/u);
  assert.ok(r.allowed?.includes('row.move'));
});

test('an arg bound to a field the list does not hold is refused with the fields it does', () => {
  const r = refusalOf([{ verb: 'row.move', label: 'Move', args: { field: 'colour' } }]);
  assert.equal(r.at, 'row_actions[0].args.field');
  assert.match(r.fix, /"colour", which is not a field this block's list holds/u);
  assert.deepEqual([...(r.allowed ?? [])].sort(), [...FIELDS.fields].sort());
});

test('an arg the verb does not send is refused with the ones it does', () => {
  const r = refusalOf([{ verb: 'row.move', label: 'Move', args: { colour: 'stage' } }]);
  assert.equal(r.at, 'row_actions[0].args.colour');
  assert.deepEqual(r.allowed, ['field', 'to']);
});

test('a confirm of 141 bytes is refused and one of 140 is kept', () => {
  const r = refusalOf([{ verb: 'row.delete', label: 'Remove', confirm: 'x'.repeat(141) }]);
  assert.equal(r.at, 'row_actions[0].confirm');
  assert.match(r.fix, /140 bytes/u);
  assert.ok(actionsBody([{ verb: 'row.delete', label: 'Remove', confirm: 'x'.repeat(140) }], FIELDS).ok === false, 'a row verb under actions is refused');
  assert.ok(actionsBody([{ verb: 'row.delete', label: 'Remove', confirm: 'x'.repeat(140) }], { ...FIELDS, key: 'row_actions' }).ok);
});

test('nine actions are refused; eight are the most', () => {
  const one = { verb: 'row.tick', label: 'Done' };
  const r = refusalOf(Array.from({ length: ACTIONS_MOST + 1 }, () => one));
  assert.equal(r.at, 'row_actions');
  assert.match(r.fix, /at most 8/u);
  assert.ok(actionsBody(Array.from({ length: ACTIONS_MOST }, () => one), { ...FIELDS, key: 'row_actions' }).ok);
});

test('a label past 40 bytes, a stray key and a flag that is not true are each refused', () => {
  assert.equal(refusalOf([{ verb: 'row.tick', label: 'é'.repeat(21) }]).at, 'row_actions[0].label');
  assert.equal(refusalOf([{ verb: 'row.tick', label: 'Done', colour: 'red' }]).at, 'row_actions[0].colour');
  assert.equal(refusalOf([{ verb: 'row.tick', label: 'Done', once: 'yes' }]).at, 'row_actions[0].once');
  assert.equal(refusalOf([{ verb: 'row.tick', label: 'Done', as: 'slider' }]).at, 'row_actions[0].as');
});

test("a block's own actions take only the verbs that need no row", () => {
  assert.ok(actionsBody([{ verb: 'row.create', label: 'Add a shipment' }], { ...FIELDS, key: 'actions' }).ok);
  const r = refusalOf([{ verb: 'row.tick', label: 'Done' }], 'actions');
  assert.equal(r.at, 'actions[0].verb');
  assert.match(r.fix, /goes under row_actions/u);
});

test("a member's level cuts an owner verb, keeps a write verb, and marks hard where the table says", () => {
  const list: DeclaredAction[] = [
    { verb: 'rule.from_arrivals', label: 'Make a rule' },
    { verb: 'row.tick', label: 'Shipped' },
    { verb: 'row.delete', label: 'Remove' },
    { verb: 'suggestion.answer', label: 'Answer' },
  ];
  const member = cutActions(list, 'write');
  assert.deepEqual(member.map((a) => a.verb), ['row.tick', 'row.delete']);
  assert.equal(member[0]!.hard, false);
  assert.equal(member[1]!.hard, true, 'a delete is on the floor, so it is hard');
  assert.equal(member[0]!.undo, true);

  assert.deepEqual(cutActions(list, 'decide').map((a) => a.verb), ['row.tick', 'row.delete', 'suggestion.answer']);
  const owner = cutActions(list, 'owner');
  assert.deepEqual(owner.map((a) => a.verb), ['rule.from_arrivals', 'row.tick', 'row.delete', 'suggestion.answer']);
  assert.equal(owner[0]!.hard, true);
});

test("a decider's answer is not marked undo, since only an owner takes a decision back", () => {
  const list: DeclaredAction[] = [{ verb: 'suggestion.answer', label: 'Answer' }];
  assert.equal(cutActions(list, 'decide')[0]!.undo, false);
  assert.equal(cutActions(list, 'owner')[0]!.undo, true);
});

test('a verb the host does not run is dropped when the host says what it runs', () => {
  const list: DeclaredAction[] = [{ verb: 'rule.from_arrivals', label: 'Make a rule' }, { verb: 'row.create', label: 'Add' }];
  assert.deepEqual(cutActions(list, 'owner', new Set(['row.create'])).map((a) => a.verb), ['row.create']);
  assert.equal(cutActions(list, 'owner').length, 2, 'without a host list, the table alone cuts');
});

test('a reader who only reads, or a level the ladder does not hold, is sent no control', () => {
  const list: DeclaredAction[] = [{ verb: 'row.tick', label: 'Shipped' }, { verb: 'row.create', label: 'Add' }];
  assert.deepEqual(cutActions(list, 'read'), []);
  assert.deepEqual(cutActions(list, 'append'), []);
  assert.deepEqual(cutActions(list, 'constructor'), []);
  assert.deepEqual(cutActions([{ verb: 'row.gone' as never, label: 'Gone' }], 'owner'), [], 'a verb the table no longer holds is dropped');
});
