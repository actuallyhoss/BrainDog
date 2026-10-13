/**
 * `referencedBy`, the check behind a list's `delete: refuse_while_referenced` (`referenced.ts`).
 *
 * IT IS DRIVEN HERE ON ITS OWN, against a real record, because its one call in the write path's delete branch is
 * written into `index.ts` by that file's owner. What this proves is the answer that call hands back: who points at a
 * row, counted as a person would count them, and nothing once they are gone. The fixture
 * `fixtures/refusals/delete-while-referenced.yaml` proves the same refusal through the write path once the call is in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { openRecord, validateDeclaration, type Declaration, type Entry } from './index.ts';
import type { KernelParts } from './parts.ts';
import { DELETE_RULES, referencedBy } from './referenced.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const PERSON = { actor: 'p_1' };

const list = (id: string, name: string, fields: readonly Record<string, unknown>[], extra: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields], ...extra } as never,
});

const ACCOUNTS = list('accounts', 'Accounts', [{ id: 'within', type: 'ref', to: 'accounts' }], { delete: 'refuse_while_referenced' });
const TRANSACTIONS = list('transactions', 'Transactions', [
  { id: 'account', type: 'ref', to: 'accounts' },
  { id: 'other', type: 'ref', to: 'accounts' },
]);
/* THE SAME LIST WITH A FINISHED STATE, so a row that cannot go has somewhere to go instead. */
const CLOSABLE = list(
  'accounts',
  'Accounts',
  [
    { id: 'within', type: 'ref', to: 'accounts' },
    { id: 'state', type: 'enum', values: ['open', 'closed', 'written_off'], default: 'open' },
  ],
  { delete: 'refuse_while_referenced', state: 'state', done: ['closed', 'written_off'] },
);
const BUDGETS = list('budgets', 'Budgets', [{ id: 'covers', type: 'list', of: 'ref', to: 'accounts' }]);
const NOTES = list('notes', 'Notes', []);
const TASKS = list('tasks', 'Tasks', [{ id: 'note', type: 'ref', to: 'notes' }]);

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { ok: true; value: T }).value;
};

async function record(accounts: Declaration = ACCOUNTS) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([accounts, TRANSACTIONS, BUDGETS, NOTES, TASKS]));
  /* THE THREE MEMBERS `referencedBy` READS, and they are the kernel's own: the storage, the list cache and the live
     declarations. The rest of `KernelParts` is the write path's, which this check never touches. */
  const parts = { sql, register: k.register, declarations: k.declarations } as unknown as KernelParts;
  const create = (register: string, fields: Record<string, unknown>): Entry => value(k.create(register, fields, PERSON));
  const remove = (register: string, seq: number | null): Entry => value(k.update(register, `${register}#${seq}`, { deleted_at: true }, PERSON));
  return { sql, k, parts, create, remove };
}

test('A ROW NOTHING POINTS AT MAY GO, and so may any row of a list that does not ask', async () => {
  const { sql, parts, create } = await record();
  const alone = create('accounts', { what: 'Savings' });
  assert.equal(referencedBy(parts, 'accounts', alone.id), null);

  /* A LIST WITHOUT THE KEY KEEPS `ref`'s SOFT DEFAULT, however many rows point at its row. */
  const note = create('notes', { what: 'Kiln' });
  create('tasks', { what: 'Fire the kiln', note: `notes#${note.seq}` });
  assert.equal(referencedBy(parts, 'notes', note.id), null);
  sql.close();
});

test('A ROW LIVE ROWS POINT AT IS KEPT, naming each list and counting each row once', async () => {
  const { sql, parts, create } = await record();
  const current = create('accounts', { what: 'Current account' });
  const at = `accounts#${current.seq}`;
  /* ONE TRANSACTION NAMES THE ACCOUNT IN BOTH ITS FIELDS, and it is one row to move, not two. */
  create('transactions', { what: 'Moved to itself', account: at, other: at });
  create('transactions', { what: 'Rent', account: at });
  create('budgets', { what: 'Monthly', covers: [at] });

  const refusal = referencedBy(parts, 'accounts', current.id);
  assert.ok(refusal, 'a referenced row was free to go');
  assert.equal(refusal.code, 'DELETE_WHILE_REFERENCED');
  assert.equal(refusal.at, 'delete');
  assert.match(refusal.fix, /^3 entries still point at this one \(2 in Transactions and 1 in Budgets\)/u);
  assert.ok(/[.?!]$/u.test(refusal.fix), refusal.fix);
  sql.close();
});

test('ONE LIST IS SAID PLAINLY, and a row that names itself does not keep itself', async () => {
  const { sql, k, parts, create } = await record();
  const parent = create('accounts', { what: 'Current account' });
  const pot = create('accounts', { what: 'Holiday pot', within: `accounts#${parent.seq}` });
  value(k.update('accounts', `accounts#${pot.seq}`, { within: `accounts#${pot.seq}` }, PERSON));
  assert.equal(referencedBy(parts, 'accounts', pot.id), null, 'a row pointing at itself kept itself');

  value(k.update('accounts', `accounts#${pot.seq}`, { within: `accounts#${parent.seq}` }, PERSON));
  const refusal = referencedBy(parts, 'accounts', parent.id);
  assert.equal(refusal?.fix, '1 entry in Accounts still points at this one, so it cannot be deleted: point that entry elsewhere or delete it first.');
  sql.close();
});

test('ONCE THE ROWS POINTING AT IT ARE GONE, THE ROW MAY GO', async () => {
  const { sql, parts, create, remove } = await record();
  const current = create('accounts', { what: 'Current account' });
  const at = `accounts#${current.seq}`;
  const rent = create('transactions', { what: 'Rent', account: at });
  const monthly = create('budgets', { what: 'Monthly', covers: [at] });
  assert.ok(referencedBy(parts, 'accounts', current.id));

  remove('transactions', rent.seq);
  assert.match(referencedBy(parts, 'accounts', current.id)?.fix ?? '', /^1 entry in Budgets still points/u);
  remove('budgets', monthly.seq);
  assert.equal(referencedBy(parts, 'accounts', current.id), null);
  sql.close();
});

test('A LIST THE WRITER CANNOT READ STILL KEEPS THE ROW, and is never named or counted to her', async () => {
  const { sql, parts, create } = await record();
  const current = create('accounts', { what: 'Current account' });
  const at = `accounts#${current.seq}`;
  create('transactions', { what: 'Rent', account: at });
  create('transactions', { what: 'Salary', account: at });
  create('budgets', { what: 'Monthly', covers: [at] });

  /* SHE READS BUDGETS AND NOT TRANSACTIONS: the one list she can open is named, and the rest is only "more". */
  const some = referencedBy(parts, 'accounts', current.id, (register) => register !== 'transactions');
  assert.equal(some?.code, 'DELETE_WHILE_REFERENCED');
  assert.match(some?.fix ?? '', /^Entries still point at this one \(1 in Budgets and more you cannot open\)/u);
  assert.doesNotMatch(some?.fix ?? '', /Transactions|3 rows|2 in/u);

  /* AND SHE READS NEITHER: the row is still kept, and the sentence names nothing. */
  const none = referencedBy(parts, 'accounts', current.id, (register) => register === 'accounts');
  assert.equal(none?.code, 'DELETE_WHILE_REFERENCED');
  assert.equal(none?.at, 'delete');
  assert.doesNotMatch(none?.fix ?? '', /Transactions|Budgets|\d/u);
  sql.close();
});

test('A LIST WITH A FINISHED STATE OFFERS IT AS THE WAY OUT, in all three sentences', async () => {
  const { sql, parts, create } = await record(CLOSABLE);
  const current = create('accounts', { what: 'Current account' });
  const at = `accounts#${current.seq}`;
  create('transactions', { what: 'Rent', account: at });
  assert.equal(
    referencedBy(parts, 'accounts', current.id)?.fix,
    '1 entry in Transactions still points at this one, so it cannot be deleted. Mark it Closed instead.',
  );

  create('transactions', { what: 'Salary', account: at });
  assert.equal(
    referencedBy(parts, 'accounts', current.id)?.fix,
    '2 entries in Transactions still point at this one, so it cannot be deleted. Mark it Closed instead.',
  );

  create('budgets', { what: 'Monthly', covers: [at] });
  assert.equal(
    referencedBy(parts, 'accounts', current.id)?.fix,
    '3 entries still point at this one (2 in Transactions and 1 in Budgets), so it cannot be deleted. Mark it Closed instead.',
  );

  /* THE HIDDEN LISTS STILL GO UNNAMED AND UNCOUNTED, and the way out is hers all the same: the row is one she can open. */
  const none = referencedBy(parts, 'accounts', current.id, (register) => register === 'accounts');
  assert.equal(none?.fix, 'Entries you cannot open still point at this one, so it cannot be deleted. Mark it Closed instead.');
  assert.doesNotMatch(none?.fix ?? '', /Transactions|Budgets|\d/u);
  const some = referencedBy(parts, 'accounts', current.id, (register) => register !== 'transactions');
  assert.equal(some?.fix, 'Entries still point at this one (1 in Budgets and more you cannot open), so it cannot be deleted. Mark it Closed instead.');
  sql.close();
});

test('THE WORD IS THE LABEL OF THE FIRST FINISHED VALUE, the list\'s own where it declares one', async () => {
  const labelled = list(
    'accounts',
    'Accounts',
    [{ id: 'stage', type: 'enum', values: ['open', 'written_off', 'shut'], labels: { shut: 'Closed for good' }, default: 'open' }],
    { delete: 'refuse_while_referenced', state: 'stage', done: ['shut', 'written_off'] },
  );
  const a = await record(labelled);
  const one = a.create('accounts', { what: 'Current account' });
  a.create('transactions', { what: 'Rent', account: `accounts#${one.seq}` });
  assert.match(referencedBy(a.parts, 'accounts', one.id)?.fix ?? '', / Mark it Closed for good instead\.$/u);
  a.sql.close();

  /* NO LABEL DECLARED, so the value is said as words: `written_off` is "Written off". */
  const plain = list(
    'accounts',
    'Accounts',
    [{ id: 'stage', type: 'enum', values: ['open', 'written_off'], default: 'open' }],
    { delete: 'refuse_while_referenced', state: 'stage', done: ['written_off'] },
  );
  const b = await record(plain);
  const two = b.create('accounts', { what: 'Current account' });
  b.create('transactions', { what: 'Rent', account: `accounts#${two.seq}` });
  assert.match(referencedBy(b.parts, 'accounts', two.id)?.fix ?? '', / Mark it Written off instead\.$/u);
  b.sql.close();
});

test('A ROW THAT IS FINISHED ALREADY IS NOT TOLD TO FINISH, and a list with no finished state says what it said', async () => {
  const { sql, k, parts, create } = await record(CLOSABLE);
  const old = create('accounts', { what: 'Old account' });
  const at = `accounts#${old.seq}`;
  create('transactions', { what: 'Rent', account: at });
  create('transactions', { what: 'Salary', account: at });
  /* ANY FINISHED STATE, not only the first: marking a written-off row Closed is no way out of anything. */
  value(k.update('accounts', at, { state: 'written_off' }, PERSON));
  const today = '2 entries in Transactions still point at this one, so it cannot be deleted: point those entries elsewhere or delete them first.';
  assert.equal(referencedBy(parts, 'accounts', old.id)?.fix, today);
  sql.close();

  /* NO `done:`, AND EVERY SENTENCE IS TODAY'S, BYTE FOR BYTE. */
  const b = await record();
  const current = b.create('accounts', { what: 'Current account' });
  const to = `accounts#${current.seq}`;
  b.create('transactions', { what: 'Rent', account: to });
  b.create('transactions', { what: 'Salary', account: to });
  assert.equal(referencedBy(b.parts, 'accounts', current.id)?.fix, today);
  b.create('budgets', { what: 'Monthly', covers: [to] });
  assert.equal(
    referencedBy(b.parts, 'accounts', current.id)?.fix,
    '3 entries still point at this one (2 in Transactions and 1 in Budgets), so it cannot be deleted: point those entries elsewhere or delete them first.',
  );
  assert.equal(
    referencedBy(b.parts, 'accounts', current.id, (register) => register === 'accounts')?.fix,
    'Entries you cannot open still point at this one, so it cannot be deleted: somebody who can open them has to point them elsewhere or delete them first.',
  );
  b.sql.close();
});

test('`delete:` TAKES THE ONE VALUE, and any other is refused at install', () => {
  assert.equal(validateDeclaration(ACCOUNTS), null);
  const said = validateDeclaration(list('accounts', 'Accounts', [], { delete: 'cascade' }));
  assert.equal(said?.code, 'DECLARATION_INVALID');
  assert.equal(said?.at, 'delete');
  assert.deepEqual(said?.allowed, [...DELETE_RULES]);
});
