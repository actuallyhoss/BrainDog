/**
 * `COST_SQL` is `costOf` said in SQL, so a queue counts and ranks every open question without reading a body into the
 * process (audit 16, M5). The two must give one band for every body, or a count beside the queue would disagree with
 * the order it is drawn in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COST_RANK_SQL, COST_SQL, costOf, costRank } from '../src/weigh.ts';
import { openSqlite } from './sqlite.ts';

const many = (n: number, row: Record<string, unknown> = {}) => Array.from({ length: n }, () => row);

const CASES: [string, unknown][] = [
  ['rowset', { rows: [{ register: 'tasks', fields: {} }] }],
  ['rowset', { rows: many(20, { register: 'tasks' }) }],
  ['rowset', { rows: [{ register: 'tasks' }, { at: 'tasks#4', patch: {} }] }],
  ['rowset', { rows: [{ at: 7 }] }],
  ['rowset', { rows: ['tasks#4'] }],
  ['rowset', { rows: { at: 'tasks#4' } }],
  ['rowset', {}],
  ['change', { from: { id: 'page.today' }, to: {} }],
  ['change', { from: null }],
  ['change', {}],
  ['pack', { disable: 'money-core' }],
  ['pack', { disable: 3 }],
  ['pack', { install: 'people' }],
  ['settings', { set: {} }],
  ['arrange', { packs: { disable: ['money-core'] } }],
  ['arrange', { packs: { install: ['people'] } }],
  ['arrange', { packs: { enable: [] }, pages: [{}] }],
  ['arrange', { settings: [{}] }],
  ['arrange', { rows: many(20) }],
  ['arrange', { rows: many(3), packs: ['disable'] }],
  ['arrange', { packs: 'disable' }],
  ['pattern', { any: true }],
  ['options', { options: [] }],
  ['something-new', { from: {} }],
];

test('COST_SQL GIVES costOf’S BAND FOR EVERY BODY, a body that is not an object included', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE suggestion (body_kind TEXT, body TEXT)');
  const bodies: [string, string][] = [
    ...CASES.map(([kind, body]): [string, string] => [kind, JSON.stringify(body)]),
    ...['rowset', 'change', 'pack', 'settings', 'arrange', 'pattern', 'options'].flatMap((kind): [string, string][] => [
      [kind, 'not json'],
      [kind, '[1, 2]'],
      [kind, '"text"'],
    ]),
  ];
  for (const [kind, body] of bodies) {
    sql.exec('DELETE FROM suggestion');
    sql.exec('INSERT INTO suggestion (body_kind, body) VALUES (?, ?)', kind, body);
    const said = sql.one<{ cost: string; rank: number }>(`SELECT ${COST_SQL} AS cost, ${COST_RANK_SQL} AS rank FROM suggestion`);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* text that is not JSON is read as nothing, as the kernel reads it */
    }
    const want = costOf(kind, parsed);
    assert.deepEqual({ cost: said?.cost, rank: said?.rank }, { cost: want, rank: costRank(want) }, `${kind} ${body.slice(0, 60)}`);
  }
  sql.close();
});
