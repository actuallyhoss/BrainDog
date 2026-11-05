/**
 * The walk's window reads through the list's declared index on the day, and answers what it answered without it.
 *
 * MEASURED: 8 ms a window on 20,000 rows through `entry_state`, 800 windows in one alarm on the bench, 0.04 ms through the
 * day's index. The hint is an optimisation over money, so what is asserted here is that the same rows pair with it, with
 * no index to name, and that it is not used while a pass holds its own index.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import type { PairsDecl } from '../src/pairs.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 30, 12);
const PERSON = { actor: 'p_1' };
const PAIRS: PairsDecl = { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'transfer' };

const LEDGER = (indexed: boolean): Declaration => ({
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'what',
    pairs: PAIRS,
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', ...(indexed ? { index: true } : {}), required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'transfer', type: 'bool', default: false },
    ],
  } as never,
});

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record over an `Sql` that writes down each statement it is asked. */
async function opened(indexed: boolean) {
  const sql = openSqlite();
  const statements: string[] = [];
  const all = sql.all.bind(sql);
  const one = sql.one.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (statements.push(q), all(q, ...a))) as typeof sql.all;
  sql.one = ((q: string, ...a: never[]) => (statements.push(q), one(q, ...a))) as typeof sql.one;
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([LEDGER(indexed)])).ok);
  const add = (what: string, on: string, direction: string, amount: number, account: string): Entry =>
    made(k.create('transactions', { what, on, direction, amount: { amount, currency: 'USD' }, account }, PERSON));
  return { sql, k, add, statements };
}

/** A ledger of two moves and a stray, in which the window has to find each row's partner; what ended up paired, by name. */
async function pairedOn(indexed: boolean): Promise<{ paired: Record<string, boolean>; statements: string[] }> {
  const { k, add, statements } = await opened(indexed);
  const rows = [
    add('out to B', '2026-09-01', 'out', 5000, 'A'),
    add('in from A', '2026-09-02', 'in', 5000, 'B'),
    add('another size', '2026-09-02', 'in', 7000, 'B'),
    add('too far', '2026-09-20', 'in', 5000, 'B'),
    add('second out', '2026-09-21', 'out', 5000, 'A'),
  ];
  return { paired: Object.fromEntries(rows.map((r) => [String(r.fields.what), k.get(r.id)!.fields.transfer === true])), statements };
}

test('THE SAME ROWS PAIR through the day index as with no index to name', async () => {
  const withIndex = await pairedOn(true);
  const without = await pairedOn(false);
  assert.deepEqual(withIndex.paired, without.paired);
  assert.deepEqual(withIndex.paired, { 'out to B': true, 'in from A': true, 'another size': false, 'too far': true, 'second out': true });
  assert.ok(withIndex.statements.some((q) => /INDEXED BY entry_i_transactions__on WHERE register = 'transactions'/.test(q)), 'the window did not name the index');
  assert.ok(!without.statements.some((q) => /INDEXED BY entry_i_transactions__on/.test(q)), 'a list with no index on the day named one');
});

test('A PASS THAT HOLDS ITS OWN INDEX KEEPS IT: the day index is not named beside it', async () => {
  const { sql, add, statements } = await opened(true);
  add('first', '2026-09-01', 'out', 5000, 'A');
  sql.exec("CREATE INDEX entry_settle_transactions ON entry (register, json_extract(fields, '$.on')) WHERE deleted_at IS NULL");
  statements.length = 0;
  add('second', '2026-09-02', 'in', 5000, 'B');
  assert.ok(statements.some((q) => /json_extract\(fields, '\$\.on'\) BETWEEN/.test(q)), 'no window was asked');
  assert.ok(!statements.some((q) => /INDEXED BY/.test(q)));
});

test('AN INDEX OF ANOTHER SHAPE UNDER THE NAME IS NOT AN ERROR: the window is asked as it was', async () => {
  const { sql, k, add } = await opened(true);
  sql.exec('DROP INDEX entry_i_transactions__on');
  /* On another list: SQLite will not plan `INDEXED BY` for a statement this index does not fit. */
  sql.exec("CREATE INDEX entry_i_transactions__on ON entry (json_extract(fields, '$.other')) WHERE register = 'somewhere else'");
  add('first', '2026-09-01', 'out', 5000, 'A');
  const second = add('second', '2026-09-02', 'in', 5000, 'B');
  assert.equal(k.get(second.id)!.fields.transfer, true);
});
