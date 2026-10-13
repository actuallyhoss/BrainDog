/**
 * An option its proposer marked `hard: true` cannot be taken back once it is picked, and it is that option that
 * weighs `undo`, not the question that offers it beside a safe one (audit 62, claim 6, over audit 60, claim 1). The
 * question is `undo` only when every option it offers is marked. And a change that adds a field to a list that holds
 * rows is `undo` (audit 62, claim 5). `costOf` and `COST_SQL` are held here to the band each body must have, and so
 * to each other: a count beside the queue that disagreed with the order it is drawn in would be the fault.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COST_RANK_SQL, COST_SQL, costOf, costRank, costRows, optionCost, optionCosts, pickCost, type Cost } from '../src/weigh.ts';
import { openSqlite } from './sqlite.ts';

const PATCH = { patches: [{ at: 'tasks#4', patch: { done: true } }] };

/* COST_SQL READS WHICH FIELDS THE HISTORY WITHHOLDS off the lists' declarations, and whether a list holds a row off the
   rows themselves, so both tables have to be there. */
const TABLES = `CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT);
  CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, deleted_at TEXT, UNIQUE (register, seq));`;

/* ONE SET OF QUESTIONS, each with the band it must have. */
const CASES: [Cost, string, unknown][] = [
  /* THE QUESTION IS HARD ONLY WHEN NO PICK AVOIDS IT: every option it offers is marked */
  ['undo', 'options', { options: [{ id: 'take', hard: true }] }],
  ['undo', 'options', { options: [{ id: 'take', hard: true }, { id: 'drop', hard: true }] }],
  ['undo', 'options', { options: [{ id: 'take', hard: true, ...PATCH }, { id: 'drop', hard: true }] }],
  /* one hard option beside one that can be taken back leaves the question at what the others do, wherever it stands */
  ['call', 'options', { options: [{ id: 'take', hard: true }, { id: 'leave' }] }],
  ['call', 'options', { options: [{ id: 'leave' }, { id: 'take', hard: true }] }],
  ['call', 'options', { options: [{ id: 'take', hard: true }, { id: 'leave', hard: false }] }],
  /* and the hard option's own patches are not what the others do */
  ['call', 'options', { options: [{ id: 'take', hard: true, ...PATCH }, { id: 'leave' }] }],
  ['rows', 'options', { options: [{ id: 'write', ...PATCH }, { id: 'take', hard: true }] }],
  /* what is not an option is not a hard one, so it keeps the question off undo */
  ['call', 'options', { options: [{ id: 'take', hard: true }, null] }],
  ['call', 'options', { options: [{ id: 'take', hard: true }, 'drop'] }],
  ['call', 'options', { options: [{ id: 'take', hard: true }, [{ hard: true }]] }],
  ['call', 'options', { options: [{ id: 'take', hard: true }, { id: 'drop', hard: 'true' }] }],
  /* with no hard option the band is what it was */
  ['rows', 'options', { options: [{ id: 'write', ...PATCH }, { id: 'leave' }] }],
  ['rows', 'options', { options: [{ id: 'write', hard: false, ...PATCH }] }],
  ['call', 'options', { options: [{ id: 'take' }, { id: 'leave' }] }],
  ['call', 'options', { options: [{ id: 'take', hard: false }, { id: 'leave' }] }],
  ['call', 'options', { options: [] }],
  ['call', 'options', {}],
  /* ONLY THE BOOLEAN `true` MARKS AN OPTION: a word, a number or nothing does not */
  ['call', 'options', { options: [{ id: 'take', hard: 'true' }] }],
  ['call', 'options', { options: [{ id: 'take', hard: 1 }] }],
  ['call', 'options', { options: [{ id: 'take', hard: null }] }],
  ['call', 'options', { options: [{ id: 'take', hard: {} }] }],
  ['call', 'options', { options: [{ id: 'take', hard: [true] }] }],
  /* the marker is read on an option and nowhere else */
  ['call', 'options', { hard: true, options: [{ id: 'take' }] }],
  ['call', 'options', { options: [true, 'hard', [{ hard: true }], null] }],
  ['call', 'options', { options: { take: { hard: true } } }],
  ['call', 'options', { options: { take: PATCH } }],
  ['call', 'options', { options: 'hard' }],
  ['call', 'options', { options: [{ id: 'take', more: { hard: true } }] }],
  /* and on a question of options only: another kind keeps its own band */
  ['rows', 'rowset', { hard: true, rows: [{ register: 'tasks', hard: true }] }],
  ['shape', 'settings', { options: [{ hard: true }] }],
  ['rows', 'pattern', { options: [{ hard: true }] }],
  ['call', 'something-new', { options: [{ hard: true }] }],
];

test('A QUESTION WHOSE EVERY OPTION IS MARKED HARD WEIGHS AS undo, and no other does, in costOf', () => {
  for (const [want, kind, body] of CASES) assert.equal(costOf(kind, body), want, `${kind} ${JSON.stringify(body)}`);
});

test('COST_SQL GIVES THE SAME BAND AND THE SAME PLACE IN THE ORDER for every one of them', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (body_kind TEXT, body TEXT)');
  sql.exec(TABLES);
  for (const [want, kind, body] of CASES) {
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, JSON.stringify(body));
    const said = sql.one<{ cost: string; rank: number }>(`SELECT ${COST_SQL} AS cost, ${COST_RANK_SQL} AS rank FROM suggestion`);
    assert.deepEqual({ cost: said?.cost, rank: said?.rank }, { cost: want, rank: costRank(want) }, `${kind} ${JSON.stringify(body)}`);
    assert.equal(said?.cost, costOf(kind, body), `the two disagree on ${kind} ${JSON.stringify(body)}`);
  }
  sql.close();
});

test('A QUESTION WITH NO WAY ROUND ITS HARD OPTION IS RANKED FIRST BY THE QUEUE’S OWN ORDER', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (name TEXT, body_kind TEXT, body TEXT)');
  sql.exec(TABLES);
  const asked: [string, unknown][] = [
    ['says a choice', { options: [{ id: 'take' }, { id: 'leave' }] }],
    ['writes on the pick', { options: [{ id: 'write', ...PATCH }] }],
    ['one hard option beside a safe one', { options: [{ id: 'leave' }, { id: 'take', hard: true }] }],
    ['cannot be taken back', { options: [{ id: 'take', hard: true }, { id: 'drop', hard: true }] }],
  ];
  for (const [name, body] of asked) sql.exec('INSERT INTO suggestion (name, body_kind, body) VALUES (?, ?, ?)', name, 'options', JSON.stringify(body));
  const order = sql.all<{ name: string }>(`SELECT name FROM suggestion ORDER BY ${COST_RANK_SQL}, name`).map((r) => r.name);
  assert.deepEqual(order, ['cannot be taken back', 'writes on the pick', 'one hard option beside a safe one', 'says a choice']);
  sql.close();
});

test('EACH OPTION WEARS ITS OWN BAND, and a pick is weighed by the option picked', () => {
  /* THE PACK UPDATE'S OWN QUESTION (`keptAsk`): keeping is safe, and only taking the update's page is hard. */
  const body = { options: [{ id: 'keep', label: 'Keep my pages' }, { id: 'take', hard: true, label: "Take the update's page" }, { id: 'write', ...PATCH }] };
  assert.deepEqual(optionCosts(body), [
    { id: 'keep', cost: 'call' },
    { id: 'take', cost: 'undo' },
    { id: 'write', cost: 'rows' },
  ]);
  assert.equal(costOf('options', body), 'rows');
  assert.equal(pickCost('options', body, 'keep'), 'call');
  assert.equal(pickCost('options', body, 'take'), 'undo');
  assert.equal(pickCost('options', body, 'write'), 'rows');
  /* an answer that writes nothing, or that the question does not offer */
  for (const none of ['reject', 'accept', 'defer', '', 'Take']) assert.equal(pickCost('options', body, none), 'call', none);

  /* hard stands above the option's own patches, and only the boolean marks it */
  assert.equal(optionCost({ id: 'take', hard: true, ...PATCH }), 'undo');
  for (const hard of ['true', 1, null, {}, [true], false]) assert.equal(optionCost({ id: 'take', hard }), 'call', JSON.stringify(hard));
  for (const not of [null, true, 'hard', 7, [{ hard: true }], undefined]) assert.equal(optionCost(not), 'call', JSON.stringify(not));
  /* an option with no id cannot be picked, so it is not listed; a body that is not one lists nothing */
  assert.deepEqual(optionCosts({ options: [{ hard: true }, { id: 4, hard: true }, 'take', { id: 'leave' }] }), [{ id: 'leave', cost: 'call' }]);
  for (const not of [null, 'text', [], { options: 'take' }, { options: { take: { hard: true } } }]) assert.deepEqual(optionCosts(not), [], JSON.stringify(not));

  /* ANOTHER KIND HAS ONE ANSWER THAT WRITES, `accept`, and it weighs what the question weighs */
  assert.equal(pickCost('pack', { disable: 'money' }, 'accept'), 'undo');
  assert.equal(pickCost('pack', { disable: 'money' }, 'reject'), 'call');
  assert.equal(pickCost('settings', {}, 'accept'), 'shape');
  assert.equal(pickCost('pattern', { options: [{ id: 'take', hard: true }] }, 'take'), 'call');
});

/* ── A field added to a list that holds rows (audit 62, claim 5) ── */

const FROM = { id: 'register.tasks' };
const FIELD = { id: 'effort', type: 'number' };

/* Lists as the record below holds them: `tasks` and `people` hold a row, `notes` holds only a removed one, `ideas` none. */
const ADDS: [Cost, unknown][] = [
  ['undo', { declaration_id: 'register.tasks', to: { add: { fields: [FIELD] } } }],
  ['undo', { declaration_id: 'register.tasks', to: { add: { register: 'tasks', fields: [FIELD] } } }],
  ['undo', { declaration_id: 'register.tasks', to: { add: { register: 'register.tasks', fields: [FIELD] } } }],
  ['undo', { declaration_id: 'register.tasks', to: { add: { register: null, fields: [FIELD] } } }],
  ['undo', { declaration_id: 'register.tasks', from: FROM, to: { add: { fields: [FIELD], values: { status: ['parked'] } } } }],
  /* the list `add` names is the one read, over the one the change is filed under */
  ['undo', { declaration_id: 'register.ideas', to: { add: { register: 'people', fields: [FIELD] } } }],
  ['shape', { declaration_id: 'register.tasks', to: { add: { register: 'ideas', fields: [FIELD] } } }],
  /* A LIST WITH NO ROW HAS NOTHING TO FILL: none yet, only a removed one, or no such list */
  ['shape', { declaration_id: 'register.ideas', to: { add: { fields: [FIELD] } } }],
  ['shape', { declaration_id: 'register.notes', to: { add: { fields: [FIELD] } } }],
  ['shape', { declaration_id: 'register.nowhere', to: { add: { fields: [FIELD] } } }],
  /* values added to a closed list are not a field, and neither is an empty or unreadable `fields` */
  ['shape', { declaration_id: 'register.tasks', to: { add: { values: { status: ['parked'] } } } }],
  ['shape', { declaration_id: 'register.tasks', to: { add: { fields: [] } } }],
  ['shape', { declaration_id: 'register.tasks', to: { add: { fields: 'effort' } } }],
  ['shape', { declaration_id: 'register.tasks', to: { add: { fields: { id: 'effort' } } } }],
  ['shape', { declaration_id: 'register.tasks', to: { add: [FIELD] } }],
  ['shape', { declaration_id: 'register.tasks', to: { fields: [FIELD] } }],
  ['shape', { declaration_id: 'register.tasks', add: { fields: [FIELD] } }],
  /* no list named: filed under something that is not a list, or a name that is not text */
  ['shape', { declaration_id: 'page.tasks', to: { add: { fields: [FIELD] } } }],
  ['shape', { declaration_id: 'tasks', to: { add: { fields: [FIELD] } } }],
  ['shape', { to: { add: { fields: [FIELD] } } }],
  ['shape', { declaration_id: 'register.tasks', to: { add: { register: 7, fields: [FIELD] } } }],
  ['shape', { declaration_id: 7, to: { add: { fields: [FIELD] } } }],
  /* A WHOLE LIST PROPOSED AGAIN, and a retire, keep the band they had; a retype with a `from` keeps its own */
  ['shape', { declaration_id: 'register.tasks', from: FROM, to: { id: 'register.tasks', kind: 'register', fields: [FIELD] } }],
  ['shape', { declaration_id: 'register.tasks', from: FROM, to: { retire: { fields: ['owner'] } } }],
  ['undo', { declaration_id: 'register.tasks', from: FROM, to: { retype: { field: 'owner', type: 'ref' } } }],
  ['shape', { declaration_id: 'register.tasks', to: { retype: { field: 'owner', type: 'ref' } } }],
  ['undo', { declaration_id: 'register.ideas', from: FROM, to: { narrow: { field: 'owner' } } }],
];

test('A FIELD ADDED TO A LIST THAT HOLDS ROWS WEIGHS AS undo, in costOf and in COST_SQL alike', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (body_kind TEXT, body TEXT)');
  sql.exec(TABLES);
  const row = 'INSERT INTO entry (id, register, seq, fields, deleted_at) VALUES (?, ?, ?, ?, ?)';
  sql.exec(row, 'e1', 'tasks', 1, '{"title":"Call the bank"}', null);
  sql.exec(row, 'e2', 'tasks', 2, '{"title":"Gone"}', '2026-10-01T00:00:00.000Z');
  sql.exec(row, 'e3', 'people', 1, '{}', null);
  sql.exec(row, 'e4', 'notes', 1, '{"title":"Removed"}', '2026-10-01T00:00:00.000Z');
  const rows = costRows(sql);
  assert.equal(rows.held?.('tasks'), true);
  assert.equal(rows.held?.('notes'), false);
  assert.equal(rows.held?.('ideas'), false);

  for (const [want, body] of ADDS) {
    const at = JSON.stringify(body);
    assert.equal(costOf('change', body, rows), want, at);
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', 'change', at);
    const said = sql.one<{ cost: string; rank: number }>(`SELECT ${COST_SQL} AS cost, ${COST_RANK_SQL} AS rank FROM suggestion`);
    assert.deepEqual({ cost: said?.cost, rank: said?.rank }, { cost: want, rank: costRank(want) }, at);
  }

  /* THE BAND MOVES WITH THE LIST: the first row makes the question hard, and removing the last one takes it off again. */
  const ideas = { declaration_id: 'register.ideas', to: { add: { fields: [FIELD] } } };
  sql.exec('DELETE FROM suggestion');
  sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', 'change', JSON.stringify(ideas));
  const band = (): string | undefined => sql.one<{ cost: string }>(`SELECT ${COST_SQL} AS cost FROM suggestion`)?.cost;
  assert.deepEqual([costOf('change', ideas, rows), band()], ['shape', 'shape']);
  sql.exec(row, 'e5', 'ideas', 1, '{}', null);
  assert.deepEqual([costOf('change', ideas, rows), band()], ['undo', 'undo']);
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', '2026-10-02T00:00:00.000Z', 'e5');
  assert.deepEqual([costOf('change', ideas, rows), band()], ['shape', 'shape']);

  /* ONLY A CHANGE IS READ THIS WAY: the same body under another kind keeps that kind's band. */
  const adds = ADDS[0]![1];
  for (const [kind, want] of [['settings', 'shape'], ['pattern', 'rows'], ['options', 'call'], ['something-new', 'call']] as const) {
    assert.equal(costOf(kind, adds, rows), want, kind);
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, JSON.stringify(adds));
    assert.equal(band(), want, kind);
  }
  sql.close();
});

test('WITHOUT THE RECORD A CHANGE IS WEIGHED BY ITS BODY ALONE, and a reader written before `held` still weighs', () => {
  for (const [want, body] of ADDS) {
    const alone = want === 'undo' && !('retype' in ((body as { to: object }).to) || 'narrow' in ((body as { to: object }).to)) ? 'shape' : want;
    assert.equal(costOf('change', body), alone, JSON.stringify(body));
    assert.equal(costOf('change', body, { withheld: () => [] }), alone, JSON.stringify(body));
  }
  /* and `held` is asked only of a change that adds a field to a list it names, once each, by the list's bare name */
  const asked: string[] = [];
  const rows = { withheld: () => [], held: (list: string) => (asked.push(list), true) };
  for (const [, body] of ADDS) costOf('change', body, rows);
  assert.deepEqual(asked, ['tasks', 'tasks', 'tasks', 'tasks', 'tasks', 'people', 'ideas', 'ideas', 'notes', 'nowhere']);
});
