/**
 * A field worked out through a link (`through`, from `derive: { via }`): a filter over it is asked of the linked row, as
 * a semi-join, where the schema can name the other list. A row whose link names nothing, or a row that is gone, reads
 * as nothing there. Without a way into the other list the clause is refused, and in memory it matches nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { compile, evaluate, type Predicate, type Schema } from '../src/index.ts';

const LEDGER: Schema = {
  register: 'ledger',
  fields: {
    what: { type: 'text' },
    category: { type: 'ref', to: 'categories' },
    stays: { type: 'bool', derived: true, through: { ref: 'category', field: 'moves' } },
  },
};

const CATEGORIES: Schema = { register: 'categories', fields: { name: { type: 'text' }, moves: { type: 'bool' } } };

const reads = (register: string): Schema | undefined => (register === 'categories' ? CATEGORIES : undefined);
const HOPS: Schema = { ...LEDGER, schemaOf: reads };

/** `moved` says so, `food` says not, `old` holds nothing there, `gone` is deleted; `l5` names nothing, `l6` names gone. */
function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, fields TEXT, state TEXT, deleted_at TEXT)');
  const put = d.prepare('INSERT INTO entry (id, register, fields, deleted_at) VALUES (?, ?, ?, ?)');
  put.run('moved', 'categories', JSON.stringify({ name: 'Moves', moves: true }), null);
  put.run('food', 'categories', JSON.stringify({ name: 'Food', moves: false }), null);
  put.run('old', 'categories', JSON.stringify({ name: 'Old' }), null);
  put.run('gone', 'categories', JSON.stringify({ name: 'Gone', moves: true }), '2026-10-01T00:00:00.000Z');
  for (const [id, category] of [
    ['l1', 'moved'],
    ['l2', 'food'],
    ['l3', 'old'],
    ['l5', null],
    ['l6', 'gone'],
  ] as const)
    put.run(id, 'ledger', JSON.stringify({ what: id, ...(category ? { category } : {}) }), null);
  return d;
}

const rows = (where: Predicate, schema: Schema = HOPS): string[] => {
  const c = compile(where, schema);
  assert.deepEqual(c.bad, []);
  return (db().prepare(`SELECT id FROM entry WHERE register = 'ledger' AND ${c.sql} ORDER BY id`).all(...c.params) as { id: string }[]).map((r) => r.id);
};

test('is true reads the linked row, and a gone row or no link is not true', () => {
  assert.deepEqual(rows({ field: 'stays', is: true }), ['l1']);
});

test('not true keeps every row the linked one does not say true of, a row with no link among them', () => {
  assert.deepEqual(rows({ field: 'stays', not: true }), ['l2', 'l3', 'l5', 'l6']);
  assert.deepEqual(rows({ none: [{ field: 'stays', is: true }] }), ['l2', 'l3', 'l5', 'l6']);
});

test('beside the row\'s own fields, inside a group', () => {
  assert.deepEqual(rows({ all: [{ field: 'what', not: 'l2' }, { field: 'stays', not: true }] }), ['l3', 'l5', 'l6']);
});

test('a reader who may not read the other list reads nothing there, as the derived value reads for them', () => {
  const blind: Schema = { ...LEDGER, schemaOf: () => undefined };
  assert.deepEqual(rows({ field: 'stays', is: true }, blind), []);
  assert.deepEqual(rows({ field: 'stays', not: true }, blind), ['l1', 'l2', 'l3', 'l5', 'l6']);
});

test('with no way into another list it is refused, and in memory it matches nothing', () => {
  const out = compile({ field: 'stays', not: true } as never, LEDGER);
  assert.equal(out.bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
  assert.equal(evaluate({ field: 'stays', not: true } as never, { category: 'food' }, HOPS), false);
});
