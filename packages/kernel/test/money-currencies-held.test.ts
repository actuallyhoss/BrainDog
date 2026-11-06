/**
 * Which currencies a record's money is in, held while each list stands, and never another person's or an old answer.
 *
 * MEASURED: three scans of a 20,000 line ledger, 27 ms on the bench and about five times that live, on every `boot` after a
 * write anywhere. What is asserted is that a hit reads no row, and that every way the answer can change changes it at once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 3, 12);
const P = { actor: 'p_owner' };
const money = (amount: number, currency: string) => ({ amount, currency });

const list = (id: string, field: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: field, type: 'money' }] } as never,
});

async function made() {
  const sql = openSqlite();
  const statements: string[] = [];
  const all = sql.all.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (statements.push(q), all(q, ...a))) as typeof sql.all;
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([list('spends', 'amount'), list('bills', 'cost')])).ok);
  const add = (register: string, field: string, amount: number, currency: string): Entry => {
    const out = k.create(register, { what: 'A line', [field]: money(amount, currency) }, P);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value as Entry;
  };
  const scans = () => statements.filter((q) => /^SELECT DISTINCT json_extract/u.test(q)).length;
  return { sql, k, add, statements, scans };
}

test('A SECOND ASK READS NO ROW, and answers the same', async () => {
  const { k, add, statements, scans } = await made();
  add('spends', 'amount', 100, 'GBP');
  add('bills', 'cost', 100, 'USD');
  const first = k.moneyCurrencies(() => true, 5);
  assert.deepEqual(first, ['GBP', 'USD']);
  statements.length = 0;
  assert.deepEqual(k.moneyCurrencies(() => true, 5), first);
  assert.equal(scans(), 0, 'a held answer scanned the rows');
});

test('A WRITE TO ANOTHER LIST LEAVES IT HELD, a new currency on the list is seen at once', async () => {
  const { k, add, statements, scans } = await made();
  add('spends', 'amount', 100, 'GBP');
  k.moneyCurrencies(() => true, 5);
  add('bills', 'cost', 100, 'USD');
  statements.length = 0;
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP', 'USD']);
  assert.equal(scans(), 1, 'it read every list again, or missed the new one');
  add('spends', 'amount', 100, 'EUR');
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['EUR', 'GBP', 'USD']);
});

test('A ROW EDITED OR DELETED TAKES ITS CURRENCY WITH IT', async () => {
  const { sql, k, add } = await made();
  const a = add('spends', 'amount', 100, 'GBP');
  const b = add('spends', 'amount', 100, 'EUR');
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['EUR', 'GBP']);
  const edited = k.update('spends', b.id, { amount: money(100, 'GBP') }, P);
  assert.ok(edited.ok, JSON.stringify(edited));
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP']);
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), a.id);
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), b.id);
  assert.deepEqual(k.moneyCurrencies(() => true, 5), []);
});

test('A REPAIR WITH NO LINE IN THE LOG MOVES IT TOO: the list\'s version counts what its rows weigh', async () => {
  const { sql, k, add } = await made();
  const a = add('spends', 'amount', 100, 'GBP');
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP']);
  sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify({ ...a.fields, amount: money(100, 'EUR'), note: 'x' }), a.id);
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['EUR']);
});

test('WHO MAY READ A LIST IS ASKED EACH TIME: a list she may not open says nothing, whatever was held for somebody else', async () => {
  const { k, add } = await made();
  add('spends', 'amount', 100, 'GBP');
  add('bills', 'cost', 100, 'USD');
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP', 'USD']);
  assert.deepEqual(k.moneyCurrencies((r) => r === 'spends', 5), ['GBP']);
  assert.deepEqual(k.moneyCurrencies((r) => r === 'bills', 5), ['USD']);
  assert.deepEqual(k.moneyCurrencies(() => false, 5), []);
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP', 'USD']);
});

test('A ROW KEPT PRIVATE IS ANOTHER PERSON\'S ANSWER: held apart by viewer, and moved at once when it is kept or let go', async () => {
  const { sql, k, add } = await made();
  add('spends', 'amount', 100, 'GBP');
  const secret = add('spends', 'amount', 100, 'CHF');
  assert.deepEqual(k.moneyCurrencies(() => true, 5, 'p_owner'), ['CHF', 'GBP']);
  assert.deepEqual(k.moneyCurrencies(() => true, 5, 'p_member'), ['CHF', 'GBP']);
  sql.exec('INSERT INTO entry_private (entry_id, person_id) VALUES (?, ?)', secret.id, 'p_owner');
  assert.deepEqual(k.moneyCurrencies(() => true, 5, 'p_member'), ['GBP'], 'a member was told the currency of a row kept from her');
  assert.deepEqual(k.moneyCurrencies(() => true, 5, 'p_owner'), ['CHF', 'GBP'], 'the owner lost her own row');
  /* And the viewer's answer is not the no-viewer one, or the other way. */
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['CHF', 'GBP']);
  sql.exec('DELETE FROM entry_private WHERE entry_id = ?', secret.id);
  assert.deepEqual(k.moneyCurrencies(() => true, 5, 'p_member'), ['CHF', 'GBP']);
});

test('HOW MANY WERE ASKED IS PART OF THE ANSWER: stopping at two is not held for one who asked twenty', async () => {
  const { k, add } = await made();
  for (const c of ['AUD', 'BRL', 'CAD']) add('spends', 'amount', 100, c);
  assert.equal(k.moneyCurrencies(() => true, 2).length, 2);
  assert.equal(k.moneyCurrencies(() => true, 21).length, 3);
  assert.equal(k.moneyCurrencies(() => true, 2).length, 2);
});

test('A WRITE TAKEN BACK IS NOT SEEN, and what was read inside it is not held', async () => {
  const { sql, k, add } = await made();
  add('spends', 'amount', 100, 'GBP');
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP']);
  assert.throws(() =>
    k.transaction(() => {
      add('spends', 'amount', 100, 'EUR');
      assert.deepEqual(k.moneyCurrencies(() => true, 5), ['EUR', 'GBP'], 'inside the write its own row counts');
      throw new Error('taken back');
    }),
  );
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP']);
  void sql;
});

test('INSIDE A TRANSACTION THAT HAS ONLY READ IT IS HELD, as in `boot`; one that wrote reads the rows', async () => {
  const { k, add, statements, scans } = await made();
  add('spends', 'amount', 100, 'GBP');
  k.moneyCurrencies(() => true, 5);
  statements.length = 0;
  k.transaction(() => assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP']));
  assert.equal(scans(), 0, 'a read transaction scanned the rows');
  k.transaction(() => {
    add('bills', 'cost', 100, 'USD');
    statements.length = 0;
    assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP', 'USD']);
    assert.ok(scans() > 0, 'a transaction that wrote answered from before its write');
  });
});

test('A LIST INSTALLED AFTER THE ANSWER IS ASKED ABOUT, and one retired is not', async () => {
  const { k, add } = await made();
  add('spends', 'amount', 100, 'GBP');
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP']);
  assert.ok((await k.install([list('loans', 'owed')])).ok);
  add('loans', 'owed', 100, 'JPY');
  assert.deepEqual(k.moneyCurrencies(() => true, 5), ['GBP', 'JPY']);
});
