/**
 * An option its proposer marked `hard: true` cannot be taken back once it is picked, so the question that offers it is
 * weighed `undo` (audit 60, claim 1). `costOf` and `COST_SQL` are held here to the band each body must have, and so to
 * each other: a count beside the queue that disagreed with the order it is drawn in would be the fault.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COST_RANK_SQL, COST_SQL, costOf, costRank, type Cost } from '../src/weigh.ts';
import { openSqlite } from './sqlite.ts';

const PATCH = { patches: [{ at: 'tasks#4', patch: { done: true } }] };

/* ONE SET OF QUESTIONS, each with the band it must have. */
const CASES: [Cost, string, unknown][] = [
  /* one hard option is enough, wherever it stands and whatever the others are */
  ['undo', 'options', { options: [{ id: 'take', hard: true }, { id: 'leave' }] }],
  ['undo', 'options', { options: [{ id: 'leave' }, { id: 'take', hard: true }] }],
  ['undo', 'options', { options: [{ id: 'take', hard: true }] }],
  /* hard stands above what the patches say, on the same option or on another */
  ['undo', 'options', { options: [{ id: 'take', hard: true, ...PATCH }, { id: 'leave' }] }],
  ['undo', 'options', { options: [{ id: 'write', ...PATCH }, { id: 'take', hard: true }] }],
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

test('AN OPTION MARKED HARD WEIGHS AS undo, in costOf', () => {
  for (const [want, kind, body] of CASES) assert.equal(costOf(kind, body), want, `${kind} ${JSON.stringify(body)}`);
});

test('COST_SQL GIVES THE SAME BAND AND THE SAME PLACE IN THE ORDER for every one of them', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (body_kind TEXT, body TEXT)');
  /* COST_SQL READS WHICH FIELDS THE HISTORY WITHHOLDS off the lists' declarations, so the table has to be there. */
  sql.exec('CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT)');
  for (const [want, kind, body] of CASES) {
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, JSON.stringify(body));
    const said = sql.one<{ cost: string; rank: number }>(`SELECT ${COST_SQL} AS cost, ${COST_RANK_SQL} AS rank FROM suggestion`);
    assert.deepEqual({ cost: said?.cost, rank: said?.rank }, { cost: want, rank: costRank(want) }, `${kind} ${JSON.stringify(body)}`);
    assert.equal(said?.cost, costOf(kind, body), `the two disagree on ${kind} ${JSON.stringify(body)}`);
  }
  sql.close();
});

test('A HARD QUESTION IS RANKED FIRST BY THE QUEUE’S OWN ORDER', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (name TEXT, body_kind TEXT, body TEXT)');
  sql.exec('CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT)');
  const asked: [string, unknown][] = [
    ['says a choice', { options: [{ id: 'take' }, { id: 'leave' }] }],
    ['writes on the pick', { options: [{ id: 'write', ...PATCH }] }],
    ['cannot be taken back', { options: [{ id: 'leave' }, { id: 'take', hard: true }] }],
  ];
  for (const [name, body] of asked) sql.exec('INSERT INTO suggestion (name, body_kind, body) VALUES (?, ?, ?)', name, 'options', JSON.stringify(body));
  const order = sql.all<{ name: string }>(`SELECT name FROM suggestion ORDER BY ${COST_RANK_SQL}, name`).map((r) => r.name);
  assert.deepEqual(order, ['cannot be taken back', 'writes on the pick', 'says a choice']);
  sql.close();
});
