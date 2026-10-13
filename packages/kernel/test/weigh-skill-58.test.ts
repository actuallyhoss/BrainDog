/**
 * What is hard to undo, and what only looked it (batch 58).
 *
 * `costOf` gave `undo` to any `change` with a `from` under it and to any rowset with an update in it, so a skill's
 * wording changed was "hard to undo" and every card's main button warned of it. The record keeps the way back for
 * both: a declaration replaced stays beside its successor, and an edit's history line holds what the row said before.
 * What it keeps nothing for is a pack turned off and money moved, and those are the band still.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COST_RANK_SQL, COST_SQL, MANY_ROWS, costOf, costRank } from '../src/weigh.ts';
import { openSqlite } from './sqlite.ts';

const SKILL_BEFORE = { id: 'skill.weekly_review', kind: 'skill', body: { name: 'Weekly review', text: 'Read the week, then say what moved.' } };
const SKILL_AFTER = { id: 'skill.weekly_review', kind: 'skill', body: { name: 'Weekly review', text: 'Read the week, say what moved, and name one thing to drop.' } };
const SKILL_REWORDED = { declaration_id: 'skill.weekly_review', from: SKILL_BEFORE, to: SKILL_AFTER, from_version: 3 };

const fee = { amount: 12_500, currency: 'EGP' };

test('a skill’s wording changed is not hard to undo: the version it replaces is kept', () => {
  assert.equal(costOf('change', SKILL_REWORDED), 'shape');
  assert.notEqual(costOf('change', SKILL_REWORDED), 'undo');
  /* AND IT IS THE BAND A NEW DECLARATION IS: `from` says what is under it, and no longer what it costs. */
  assert.equal(costOf('change', { declaration_id: 'skill.weekly_review', to: SKILL_AFTER }), 'shape');
  assert.equal(costOf('change', { declaration_id: 'skill.weekly_review', to: SKILL_AFTER, from: null }), 'shape');
});

test('every shape a change takes is kept by the record, so none of them is hard to undo', () => {
  const field = { id: 'owner', type: 'text', label: 'Owner' };
  for (const to of [{ add: { fields: [field] } }, { retire: { fields: ['owner'] } }, { retype: { field: 'owner', type: 'ref' } }, { narrow: { field: 'owner', required: true } }])
    assert.equal(costOf('change', { declaration_id: 'register.tasks', from: { id: 'register.tasks' }, to }), 'shape', JSON.stringify(to));
});

test('a pack turned off is still hard to undo, alone or as one part of an arrangement', () => {
  assert.equal(costOf('pack', { disable: 'money' }), 'undo');
  assert.equal(costOf('arrange', { why: ['because'], packs: { disable: ['money'] } }), 'undo');
  assert.equal(costOf('pack', { enable: 'money' }), 'shape');
  assert.ok(costRank(costOf('pack', { disable: 'money' })) < costRank(costOf('change', SKILL_REWORDED)));
});

test('a row changed is put back from its history, so it weighs what a row added weighs', () => {
  const update = { at: 'tasks#3', version: 2, patch: { title: 'Call the bank' } };
  assert.equal(costOf('rowset', { register: 'tasks', rows: [update] }), 'rows');
  assert.equal(costOf('rowset', { register: 'tasks', rows: [{ fields: { title: 'One' } }, update] }), 'rows');
  /* A ROW REMOVED IS KEPT AND MARKED, and Put back restores it, so it is not the dearer band either. */
  assert.equal(costOf('rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 2, patch: { deleted_at: '2026-10-13T09:00:00.000Z' } }] }), 'rows');
  /* AND MANY OF THEM AT ONCE IS STILL THE EVENT IT WAS. */
  assert.equal(costOf('rowset', { register: 'tasks', rows: Array.from({ length: MANY_ROWS }, () => update) }), 'shape');
});

test('money moved is hard to undo, in a new row or in a change to one', () => {
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'Rent', fee }] }), 'undo');
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ at: 'bills#2', version: 1, patch: { fee } }] }), 'undo');
  /* ONE SUCH ROW AMONG MANY IS ENOUGH: a rowset lands whole. */
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'A' }, { title: 'B' }, { title: 'Rent', fee }] }), 'undo');
  /* A FIGURE THAT IS NOT MONEY IS NOT: an amount with no currency, or a currency that is not three capitals. */
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12_500 } }] }), 'rows');
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12_500, currency: 'egp' } }] }), 'rows');
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12.5, currency: 'EGP' } }] }), 'rows');
  /* AN UPDATE WITH NO PATCH WRITES NOTHING, whatever else it carries. */
  assert.equal(costOf('rowset', { register: 'bills', rows: [{ at: 'bills#2', fee }] }), 'rows');
});

const CASES: [string, unknown][] = [
  ['change', SKILL_REWORDED],
  ['change', { declaration_id: 'skill.weekly_review', to: SKILL_AFTER }],
  ['change', { from: 'text', to: { retire: { fields: ['owner'] } } }],
  ['change', { from: [1], to: { retype: { field: 'owner', type: 'ref' } } }],
  ['pack', { disable: 'money' }],
  ['pack', { enable: 'money' }],
  ['arrange', { why: ['because'], packs: { disable: ['money'] } }],
  ['rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 2, patch: { title: 'Call the bank' } }] }],
  ['rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 2, patch: { deleted_at: '2026-10-13T09:00:00.000Z' } }] }],
  ['rowset', { register: 'bills', rows: [{ at: 'bills#2', version: 1, patch: { fee: null } }] }],
  ['rowset', { register: 'tasks', rows: Array.from({ length: MANY_ROWS }, () => ({ at: 'tasks#3', patch: {} })) }],
  ['rowset', { register: 'bills', rows: [{ title: 'Rent', fee }] }],
  ['rowset', { register: 'bills', rows: [{ at: 'bills#2', version: 1, patch: { fee } }] }],
  ['rowset', { register: 'bills', rows: [{ title: 'A' }, 'bills#2', null, { title: 'Rent', fee }] }],
  ['rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12_500 } }] }],
  ['rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12_500, currency: 'egp' } }] }],
  ['rowset', { register: 'bills', rows: [{ title: 'Rent', fee: { amount: 12.5, currency: 'EGP' } }] }],
  ['rowset', { register: 'bills', rows: [{ at: 'bills#2', fee }] }],
  ['rowset', { register: 'bills', rows: [{ at: null, patch: { fee } }] }],
  ['rowset', { register: 'bills', rows: [{ at: 'bills#2', patch: [fee] }] }],
  ['rowset', { register: 'bills', rows: { title: 'Rent', fee } }],
  ['rowset', { register: 'bills', rows: [[fee]] }],
];

test('COST_SQL and costOf give one band for each of these, so the count beside the queue agrees with its cards', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (body_kind TEXT, body TEXT)');
  for (const [kind, body] of CASES) {
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, JSON.stringify(body));
    const said = sql.one<{ cost: string; rank: number }>(`SELECT ${COST_SQL} AS cost, ${COST_RANK_SQL} AS rank FROM suggestion`);
    const want = costOf(kind, body);
    assert.deepEqual({ cost: said?.cost, rank: said?.rank }, { cost: want, rank: costRank(want) }, `${kind} ${JSON.stringify(body).slice(0, 80)}`);
  }
  sql.close();
});

test('the SQL says what the tests above say, read off the table and not off costOf', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (id INTEGER PRIMARY KEY, body_kind TEXT, body TEXT)');
  const put = (kind: string, body: unknown) => sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, JSON.stringify(body));
  put('change', SKILL_REWORDED);
  put('pack', { disable: 'money' });
  put('rowset', { register: 'tasks', rows: [{ at: 'tasks#3', version: 2, patch: { title: 'Call the bank' } }] });
  put('rowset', { register: 'bills', rows: [{ at: 'bills#2', version: 1, patch: { fee } }] });
  const said = sql.all<{ cost: string }>(`SELECT ${COST_SQL} AS cost FROM suggestion ORDER BY id`).map((r) => r.cost);
  assert.deepEqual(said, ['shape', 'undo', 'rows', 'undo']);
  sql.close();
});
