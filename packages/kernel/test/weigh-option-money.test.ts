/**
 * An option that writes on the pick is weighed by what it writes, as a rowset is (batch 66). Until now its patches
 * weighed `rows` whatever they held, so an option that moved money, or changed a value the history withholds, wore
 * no mark on Decide while the same write filed as a rowset was called hard to undo. `optionCost`, `optionCosts` and
 * `pickCost` read the rowset's rule now, and `costOf` and `COST_SQL` are held here to the same answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COST_RANK_SQL, COST_SQL, costOf, costRank, costRows, optionCost, optionCosts, pickCost, type Cost, type CostRows } from '../src/weigh.ts';
import { openSqlite, type NodeSql } from './sqlite.ts';

const EUR = { amount: 4200, currency: 'EUR' };
const PLAIN = { id: 'plain', patches: [{ at: 'bills#4', version: 2, patch: { note: 'paid' } }] };
const MONEY = { id: 'money', patches: [{ at: 'bills#4', version: 2, patch: { total: EUR } }] };
const PIN = { id: 'pin', patches: [{ at: 'keys#1', version: 1, patch: { pin: '0000' } }] };
const SAY = { id: 'say' };

/* A LIST WHOSE HISTORY WITHHOLDS `pin`, by a version since replaced, and one that withholds nothing. */
const TABLES = `CREATE TABLE declaration (id TEXT, version INTEGER, kind TEXT, body TEXT, retired INTEGER, superseded_at TEXT);
  CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, deleted_at TEXT, UNIQUE (register, seq));
  CREATE TABLE suggestion (body_kind TEXT, body TEXT);`;

function record(): NodeSql {
  const sql = openSqlite();
  sql.exec(TABLES);
  const list = (id: string, fields: unknown[]): string => JSON.stringify({ id, fields });
  sql.exec("INSERT INTO declaration VALUES ('register.keys', 1, 'register', ?, 0, '2026-10-01T00:00:00.000Z')", list('keys', [{ id: 'name', type: 'text' }, { id: 'pin', type: 'secret' }]));
  sql.exec("INSERT INTO declaration VALUES ('register.keys', 2, 'register', ?, 0, NULL)", list('keys', [{ id: 'name', type: 'text' }, { id: 'pin', type: 'text' }]));
  sql.exec("INSERT INTO declaration VALUES ('register.bills', 1, 'register', ?, 0, NULL)", list('bills', [{ id: 'note', type: 'text' }, { id: 'pin', type: 'text' }]));
  return sql;
}

const said = (sql: NodeSql, kind: string, body: unknown): { cost: string | undefined; rank: number | undefined } => {
  sql.exec('DELETE FROM suggestion');
  sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, JSON.stringify(body));
  const row = sql.one<{ cost: string; rank: number }>(`SELECT ${COST_SQL} AS cost, ${COST_RANK_SQL} AS rank FROM suggestion`);
  return { cost: row?.cost, rank: row?.rank };
};

test('AN OPTION WHOSE PATCHES WRITE A MONEY VALUE IS undo, with the record handed in or without it', () => {
  const sql = record();
  assert.equal(optionCost(MONEY), 'undo');
  assert.equal(optionCost(MONEY, costRows(sql)), 'undo');
  /* one such patch among plain ones is enough: the pick applies all of them or none */
  assert.equal(optionCost({ id: 'both', patches: [...PLAIN.patches, ...MONEY.patches] }), 'undo');
  /* a list of money values is not a money value, and neither is an amount with no currency */
  assert.equal(optionCost({ id: 'no', patches: [{ at: 'bills#4', patch: { total: { amount: 4200 } } }] }), 'rows');
  assert.equal(optionCost({ id: 'no', patches: [{ at: 'bills#4', patch: { total: { amount: 42.5, currency: 'EUR' } } }] }), 'rows');
  sql.close();
});

test('AN OPTION THAT PATCHES A FIELD THE HISTORY WITHHOLDS IS undo WHEN THE RECORD IS HANDED IN, and rows without it', () => {
  const sql = record();
  const rows = costRows(sql);
  assert.equal(optionCost(PIN, rows), 'undo');
  assert.equal(optionCost(PIN), 'rows');
  /* the list is the one the entry's spoken id names, or the one `register` names beside it */
  assert.equal(optionCost({ id: 'named', patches: [{ at: '01JABCDEF', register: 'keys', patch: { pin: '1' } }] }, rows), 'undo');
  assert.equal(optionCost({ id: 'other', patches: [{ at: 'keys#1', register: 'bills', patch: { pin: '1' } }] }, rows), 'rows');
  /* the same field on a list that never withheld it, and another field of the list that does */
  assert.equal(optionCost({ id: 'bills', patches: [{ at: 'bills#4', patch: { pin: '1' } }] }, rows), 'rows');
  assert.equal(optionCost({ id: 'name', patches: [{ at: 'keys#1', patch: { name: 'Door' } }] }, rows), 'rows');
  /* an entry that does not say which list it is in is weighed by what it says alone */
  assert.equal(optionCost({ id: 'lost', patches: [{ at: '01JABCDEF', patch: { pin: '1' } }] }, rows), 'rows');
  assert.equal(optionCost({ id: 'lost', patches: [{ at: 'Keys#1', patch: { pin: '1' } }] }, rows), 'rows');
  assert.equal(optionCost({ id: 'lost', patches: [{ at: 'keys#0', patch: { pin: '1' } }] }, rows), 'rows');
  sql.close();
});

test('A PLAIN PATCH STAYS rows, a choice with nothing attached stays call, and hard stands above both', () => {
  const sql = record();
  const rows = costRows(sql);
  for (const r of [undefined, rows]) {
    assert.equal(optionCost(PLAIN, r), 'rows');
    assert.equal(optionCost(SAY, r), 'call');
    assert.equal(optionCost({ ...PLAIN, hard: true }, r), 'undo');
    assert.equal(optionCost({ id: 'empty', patches: [] }, r), 'rows');
    assert.equal(optionCost({ id: 'odd', patches: { total: EUR } }, r), 'call');
    assert.equal(optionCost({ id: 'odd', patches: [null, 'x', [EUR], { at: 'bills#4', patch: 'x' }] }, r), 'rows');
    assert.equal(optionCost(null, r), 'call');
  }
  sql.close();
});

test('EACH OPTION WEARS ITS OWN BAND, and a pick is weighed by the option picked', () => {
  const sql = record();
  const rows = costRows(sql);
  const body = { options: [SAY, PLAIN, MONEY, PIN] };
  assert.deepEqual(optionCosts(body), [
    { id: 'say', cost: 'call' },
    { id: 'plain', cost: 'rows' },
    { id: 'money', cost: 'undo' },
    { id: 'pin', cost: 'rows' },
  ]);
  assert.deepEqual(optionCosts(body, rows).map((o) => o.cost), ['call', 'rows', 'undo', 'undo']);
  assert.equal(pickCost('options', body, 'money'), 'undo');
  assert.equal(pickCost('options', body, 'pin'), 'rows');
  assert.equal(pickCost('options', body, 'pin', rows), 'undo');
  assert.equal(pickCost('options', body, 'plain', rows), 'rows');
  assert.equal(pickCost('options', body, 'say', rows), 'call');
  assert.equal(pickCost('options', body, 'reject', rows), 'call');
  sql.close();
});

test('WITHHELD FIELDS ARE READ ONCE A LIST, not once a patch', () => {
  const asked: string[] = [];
  const rows: CostRows = { withheld: (register) => (asked.push(register), ['pin']) };
  const patches = [1, 2, 3].map((n) => ({ at: `keys#${n}`, patch: { name: 'Door' } }));
  assert.equal(optionCost({ id: 'many', patches: [...patches, { at: 'bills#1', patch: { note: 'x' } }] }, rows), 'rows');
  assert.deepEqual(asked, ['keys', 'bills']);
});

/* THE QUESTION IS undo ONLY WHEN NO PICK AVOIDS IT, and an option that moves money is one that cannot be avoided by
   picking it. Each body with the band it must have, in `costOf` handed the record and in `COST_SQL`. */
const QUESTIONS: [Cost, unknown][] = [
  ['undo', { options: [MONEY] }],
  ['undo', { options: [PIN] }],
  ['undo', { options: [MONEY, PIN, { id: 'take', hard: true }] }],
  ['undo', { options: [{ id: 'named', patches: [{ at: '01JABCDEF', register: 'keys', patch: { pin: '1' } }] }] }],
  ['rows', { options: [MONEY, PLAIN] }],
  ['rows', { options: [PIN, PLAIN, SAY] }],
  ['call', { options: [MONEY, SAY] }],
  ['call', { options: [PIN, SAY] }],
  ['rows', { options: [PLAIN] }],
  ['rows', { options: [{ id: 'bills', patches: [{ at: 'bills#4', patch: { pin: '1' } }] }] }],
  ['rows', { options: [{ id: 'other', patches: [{ at: 'keys#1', register: 'bills', patch: { pin: '1' } }] }] }],
  ['rows', { options: [{ id: 'lost', patches: [{ at: 'Keys#1', patch: { pin: '1' } }] }] }],
  ['rows', { options: [{ id: 'lost', patches: [{ at: 'keys#0', patch: { pin: '1' } }] }] }],
  ['rows', { options: [{ id: 'lost', patches: [{ at: 'keys#1x', patch: { pin: '1' } }] }] }],
  ['rows', { options: [{ id: 'lost', patches: [{ at: '#1', patch: { pin: '1' } }] }] }],
  ['rows', { options: [{ id: 'empty', patches: [] }] }],
  ['rows', { options: [{ id: 'odd', patches: [null, 'x', [EUR], { at: 'bills#4', patch: 'x' }] }] }],
  ['call', { options: [{ id: 'odd', patches: { total: EUR } }] }],
  ['call', { options: [SAY] }],
];

test('THE QUESTION IS undo ONLY WHEN EVERY OPTION IS, by its mark or by what it writes, and COST_SQL says the same', () => {
  const sql = record();
  const rows = costRows(sql);
  for (const [want, body] of QUESTIONS) {
    assert.equal(costOf('options', body, rows), want, JSON.stringify(body));
    assert.deepEqual(said(sql, 'options', body), { cost: want, rank: costRank(want) }, JSON.stringify(body));
  }
  /* without the record only the money is read */
  assert.equal(costOf('options', { options: [MONEY] }), 'undo');
  assert.equal(costOf('options', { options: [PIN] }), 'rows');
  sql.close();
});
