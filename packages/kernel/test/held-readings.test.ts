/**
 * A figure's reading is held across reads while the lists it read stand (`readingHeld`, `held-readings.ts`): an agent's
 * step on its run reads nothing again, a write to a list the figure reads reads it again, and so does a repair in place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Sql } from '@braindog/ports';

import { openRecord, type Declaration, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money' }] },
} as never;

const CASH: MetricDecl = { metric: 'cash', name: 'Cash', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' } as never;

/** The record's database, counting the reads of the accounts' rows. */
function counted(sql: Sql): { sql: Sql; reads: () => number } {
  let n = 0;
  const see = (text: string, params: unknown[]): void => {
    if (/\bentry\b/u.test(text) && (params.includes('accounts') || text.includes("'accounts'")) && !/max\(rowid\)/u.test(text)) n += 1;
  };
  return {
    sql: {
      exec: (text, ...params) => sql.exec(text, ...params),
      all: (text, ...params) => (see(text, params), sql.all(text, ...params)),
      one: (text, ...params) => (see(text, params), sql.one(text, ...params)),
      transactionSync: (fn) => sql.transactionSync(fn),
    },
    reads: () => n,
  };
}

test('A FIGURE IS HELD WHILE ITS LISTS STAND: a run moving reads it no more, and a write to its list or a repair in place does', async () => {
  const raw = openSqlite();
  const { sql, reads } = counted(raw);
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([ACCOUNTS])).ok);
  assert.ok(k.create('accounts', { name: 'Current', balance: { amount: 5_000, currency: 'EGP' } }, OWNER).ok);

  const first = k.metric(CASH);
  assert.ok(first.ok && first.value.value === 5_000, JSON.stringify(first));
  const before = reads();

  /* AN AGENT'S RUN MOVES, and the figure over the accounts is not read again. */
  const run = k.create('session', { doing: 'Working', agent: 'claude', state: 'active' }, OWNER);
  assert.ok(run.ok, JSON.stringify(run));
  assert.ok(k.update('session', run.value.id, { doing: 'Still working' }, OWNER).ok);
  const held = k.metric(CASH);
  assert.ok(held.ok && held.value.value === 5_000);
  assert.equal(reads(), before, 'a run moving read the accounts again');

  /* A WRITE TO THE ACCOUNTS IS READ. */
  assert.ok(k.create('accounts', { name: 'Savings', balance: { amount: 2_000, currency: 'EGP' } }, OWNER).ok);
  const written = k.metric(CASH);
  assert.ok(written.ok && written.value.value === 7_000, JSON.stringify(written));

  /* AND SO IS A ROW PUT RIGHT IN PLACE, with no line and its version and time unmoved. */
  raw.exec("UPDATE entry SET fields = json_set(fields, '$.balance.amount', 12000) WHERE register = 'accounts' AND json_extract(fields, '$.name') = 'Savings'");
  const repaired = k.metric(CASH);
  assert.ok(repaired.ok && repaired.value.value === 17_000, JSON.stringify(repaired));

  /* AND A WRITE TAKEN BACK LEAVES NOTHING HELD THAT IT SAW. */
  assert.throws(() =>
    raw.transactionSync(() => {
      raw.exec("UPDATE entry SET fields = json_set(fields, '$.balance.amount', 1) WHERE register = 'accounts'");
      const inside = k.metric(CASH);
      assert.ok(inside.ok && inside.value.value === 2);
      throw new Error('taken back');
    }),
  );
  const after = k.metric(CASH);
  assert.ok(after.ok && after.value.value === 17_000, JSON.stringify(after));
  raw.close();
});
