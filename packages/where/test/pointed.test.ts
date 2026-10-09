/**
 * A hop against the ref: `{ pointed: { register, by, where? } }`.
 *
 * TWO FIGURES NEED IT (REC-A13 job 2, REC-C08 step 9): the spending categories an incoming entry points at, and the
 * earning categories nothing has come in against. Both ask about the entries that point AT a row, and `via` walks a
 * ref forward from the row that holds it, so neither could be said. These hold the hop in SQL, against both ways a
 * caller names the outer table, with a deleted entry and an entry pointing nowhere in the data to keep the answer honest.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { compile, evaluate, type Predicate, type Schema } from '../src/index.ts';

const LEDGER: Schema = {
  register: 'ledger',
  fields: {
    what: { type: 'text' },
    direction: { type: 'enum', values: ['in', 'out'] },
    category: { type: 'ref', to: 'categories' },
    project: { type: 'ref', to: 'projects' },
    refund_of: { type: 'ref', to: 'ledger' },
    amount: { type: 'money' },
  },
};

const schemaOf = (register: string): Schema | undefined =>
  register === 'ledger' ? { ...LEDGER, schemaOf } : register === 'categories' ? CATEGORIES : undefined;

const CATEGORIES: Schema = {
  register: 'categories',
  fields: { name: { type: 'text' }, kind: { type: 'enum', values: ['income', 'spend'] } },
  schemaOf,
};

/** The categories, and the ledger entries pointing at them. `l4` is deleted and `l5` points at nothing. */
function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  d.exec(
    'CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, state TEXT, version INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)',
  );
  const put = d.prepare('INSERT INTO entry (id, register, fields, deleted_at) VALUES (?, ?, ?, ?)');
  for (const [id, name, kind] of [
    ['food', 'Food', 'spend'],
    ['rent', 'Rent', 'spend'],
    ['salary', 'Salary', 'income'],
    ['gifts', 'Gifts', 'income'],
  ] as const)
    put.run(id, 'categories', JSON.stringify({ name, kind }), null);
  for (const [id, category, direction, gone, refund_of] of [
    ['l1', 'food', 'out', null],
    ['l2', 'food', 'in', null, 'l1'],
    ['l3', 'salary', 'in', null],
    ['l4', 'rent', 'in', '2026-10-01T00:00:00.000Z'],
    ['l5', null, 'in', null],
  ] as const)
    put.run(id, 'ledger', JSON.stringify({ what: id, direction, ...(category ? { category } : {}), ...(refund_of ? { refund_of } : {}) }), gone);
  return d;
}

const IN: Predicate = { pointed: { register: 'ledger', by: 'category', where: { field: 'direction', is: 'in' } } };

/** The categories a predicate keeps, read with the outer table named as the kernel's list names it, and bare. */
const kept = (d: DatabaseSync, where: Predicate): string[] => {
  const c = compile(where, CATEGORIES);
  assert.deepEqual(c.bad, [], c.bad[0]?.fix);
  const aliased = d
    .prepare(`SELECT e.id FROM entry e WHERE e.register = 'categories' AND e.deleted_at IS NULL AND ${c.sql} ORDER BY e.id`)
    .all(...(c.params as never[])) as { id: string }[];
  const bare = d
    .prepare(`SELECT id FROM entry WHERE register = 'categories' AND deleted_at IS NULL AND ${c.sql} ORDER BY id`)
    .all(...(c.params as never[])) as { id: string }[];
  assert.deepEqual(bare, aliased, 'the hop answers the same whatever the caller calls the outer table');
  return aliased.map((r) => r.id);
};

test('SPENDING CATEGORIES AN INCOMING ENTRY POINTS AT are counted in SQL, and a deleted entry is not one', () => {
  const d = db();
  assert.deepEqual(kept(d, { all: [{ field: 'kind', is: 'spend' }, IN] }), ['food']);
  /* `rent`'s incoming entry is deleted, so only `food`'s refund counts. */
  const c = compile({ all: [{ field: 'kind', is: 'spend' }, IN] }, CATEGORIES);
  const n = d
    .prepare(`SELECT count(*) AS n FROM entry WHERE register = 'categories' AND deleted_at IS NULL AND ${c.sql}`)
    .get(...(c.params as never[])) as { n: number };
  assert.equal(n.n, 1);
  /* WITH NO `where`, ANY LIVE ENTRY POINTING HERE COUNTS. */
  assert.deepEqual(kept(d, { pointed: { register: 'ledger', by: 'category' } }), ['food', 'salary']);
  d.close();
});

test('UNDER none: THE HOP NEGATES: earning with no money in, and an entry pointing nowhere does not empty the answer', () => {
  const d = db();
  /* `l5` has no category. Were its NULL let into the set, `NOT (id IN (…, NULL))` would keep nothing. */
  assert.deepEqual(kept(d, { all: [{ field: 'kind', is: 'income' }, { none: [IN] }] }), ['gifts']);
  assert.deepEqual(kept(d, { none: [IN] }), ['gifts', 'rent']);
  d.close();
});

test('A HOP INSIDE A HOP reads each register against its own entries', () => {
  const d = db();
  /* Categories with an entry that a later entry refunded: `l2` refunds `l1`, which is Food's. The inner `id` is the
     ledger entry's, not the category's, because a bare name resolves to the innermost table. */
  const refunded: Predicate = { pointed: { register: 'ledger', by: 'category', where: { pointed: { register: 'ledger', by: 'refund_of' } } } };
  assert.deepEqual(kept(d, refunded), ['food']);
  /* A text field holds no entry, so it cannot be hopped along. */
  const c = compile({ pointed: { register: 'ledger', by: 'category', where: { pointed: { register: 'categories', by: 'name' } } } }, CATEGORIES);
  assert.equal(c.bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
  d.close();
});

test('WITHOUT schemaOf THE HOP IS REFUSED as via is, and evaluate refuses it with or without one', () => {
  const { schemaOf: _, ...alone } = CATEGORIES;
  const c = compile(IN, alone);
  assert.equal(c.bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
  assert.equal(c.bad[0]?.at, 'pointed');
  assert.equal(c.sql, '0 = 1');
  assert.deepEqual(c.params, []);
  /* A ROW IN MEMORY HAS NO TABLE TO HOP INTO, so the whole predicate is false, `none:` included. */
  for (const where of [IN, { none: [IN] }] as Predicate[]) {
    assert.equal(evaluate(where, { kind: 'spend' }, CATEGORIES), false);
    assert.equal(evaluate(where, { kind: 'spend' }, alone), false);
  }
});

test('WHAT THE HOP CANNOT READ IS REFUSED BY NAME', () => {
  const code = (where: Predicate): string | undefined => compile(where, CATEGORIES).bad[0]?.code;
  assert.equal(code({ pointed: { register: 'nope', by: 'category' } }), 'REGISTER_UNKNOWN');
  assert.equal(code({ pointed: { register: 'ledger', by: 'nope' } }), 'FIELD_UNKNOWN');
  assert.equal(code({ pointed: { register: 'ledger', by: 'what' } }), 'MATCH_OP_UNSUPPORTED');
  /* `project` points at projects, so it never holds a category. */
  assert.equal(code({ pointed: { register: 'ledger', by: 'project' } }), 'VALUE_MALFORMED');
  assert.equal(code({ pointed: { register: 'ledger', by: 'category', where: { field: 'nope', is: 'x' } } }), 'FIELD_UNKNOWN');
  assert.equal(code({ pointed: { register: 'ledger', by: 'category' }, field: 'kind', is: 'spend' } as Predicate), 'VALUE_MALFORMED');
  assert.equal(code({ pointed: 'ledger' } as unknown as Predicate), 'VALUE_MALFORMED');
});

test('THE PARAMETERS DO NOT GROW WITH THE ROWS: one statement over a thousand categories', () => {
  const where: Predicate = { all: [{ field: 'kind', is: 'spend' }, IN] };
  const c = compile(where, CATEGORIES);
  const d = db();
  const put = d.prepare('INSERT INTO entry (id, register, fields) VALUES (?, ?, ?)');
  for (let i = 0; i < 1000; i++) {
    put.run(`c${i}`, 'categories', JSON.stringify({ name: `C${i}`, kind: 'spend' }));
    if (i % 4 === 0) put.run(`m${i}`, 'ledger', JSON.stringify({ direction: 'in', category: `c${i}` }));
  }
  assert.equal(compile(where, CATEGORIES).params.length, c.params.length);
  assert.equal(c.params.length, (c.sql.match(/\?/g) ?? []).length);
  assert.equal(kept(d, where).length, 251);
  d.close();
});

test('A LIST THE READER MAY NOT READ IS NOT HOPPED INTO, at any depth, and is refused in the words of a list that is not there', () => {
  /* The schema a caller builds for somebody who reads categories and not the ledger. Were the hop to read the ledger
     anyway, which categories came back would tell them which way its money went. */
  const hidden = (register: string): Schema | undefined => (register === 'categories' ? { ...CATEGORIES, schemaOf: hidden } : undefined);
  const theirs: Schema = { ...CATEGORIES, schemaOf: hidden };
  const missing = compile({ pointed: { register: 'nope', by: 'category' } }, theirs).bad[0]!;
  for (const where of [IN, { none: [IN] }, { all: [{ field: 'kind', is: 'spend' }, IN] }] as Predicate[]) {
    const c = compile(where, theirs);
    assert.equal(c.bad[0]?.code, 'REGISTER_UNKNOWN');
    assert.equal(c.bad[0]?.fix, missing.fix.replace('nope', 'ledger'));
    assert.equal(c.sql, '0 = 1');
    assert.deepEqual(c.params, []);
  }
  /* ONE HOP IN, A SECOND LIST THE READER MAY NOT READ IS REFUSED TOO: the inner schema carries the same lookup. */
  const ledgerOnly = (register: string): Schema | undefined => (register === 'ledger' ? { ...LEDGER, schemaOf: ledgerOnly } : undefined);
  const deep: Predicate = { pointed: { register: 'ledger', by: 'refund_of', where: { pointed: { register: 'categories', by: 'name' } } } };
  assert.equal(compile(deep, { ...LEDGER, schemaOf: ledgerOnly }).bad[0]?.code, 'REGISTER_UNKNOWN');
  /* `null` is how the kernel's other lookups say no such list, and an arrival is not a list of entries. */
  const odd = (answer: unknown): string | undefined =>
    compile(IN, { ...CATEGORIES, schemaOf: () => answer as Schema }).bad[0]?.code;
  assert.equal(odd(null), 'REGISTER_UNKNOWN');
  assert.equal(odd({ register: 'ledger', subject: 'inbox_raw', fields: LEDGER.fields }), 'REGISTER_UNKNOWN');
});
