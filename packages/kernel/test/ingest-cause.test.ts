/**
 * A question an arrival opens has a cause ("a question has a cause").
 *
 * BEFORE: the ingest's rowset was inserted with no cause, while its tail and move questions carried one, so the index that
 * keeps one open question a cause (migration 31) could not hold the ingest's own, and a page or an agent reading
 * questions by cause saw every charge question as about nothing. Now the question carries the cause it joins on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CAUSE, openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const OWNER = { actor: 'p_1' };

const TRANSACTIONS: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', label: 'Merchant', required: true },
      { id: 'amount', type: 'money', label: 'Amount' },
      { id: 'account', type: 'ref', to: 'accounts', label: 'Account' },
    ],
  } as never,
};

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'last4', type: 'text' }] } as never,
};

/* A pattern that holds every charge for a person, so each arrival asks. */
const CARD: Declaration = {
  id: 'ingest.bank-card-used',
  kind: 'ingest',
  body: {
    ingest: 'bank-card-used',
    channel: 'email',
    match: { all: [{ field: 'from_address', is: 'alerts@bank.example' }, { field: 'body', contains: 'card ending' }] },
    extract: {
      merchant: { text: { between: ['at ', ' for'] } },
      amount: { money: { after: 'EGP ', currency: 'EGP' } },
      account: { lookup: { register: 'accounts', by: 'last4', after: 'card ending ' } },
    },
    writes: { register: 'transactions', confidence: 'needs-review' },
    dedupe: ['merchant', 'amount'],
    on_conflict: 'skip',
  } as never,
};

/* Synthetic wordings, invented for this file: no real message is quoted here. */
const said = (merchant: string, amount: string): string => `Your card ending 6518 was used at ${merchant} for EGP ${amount} today.`;

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, TRANSACTIONS, CARD]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('accounts', { name: 'Cairo savings', last4: '6518' }, OWNER).ok);
  return { k, sql };
}

const arrive = (k: Kernel, body: string, sha256: string): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: 'alerts@bank.example', Subject: 'Card' }, body, sha256 }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

const held = (sql: NodeSql, id: string): { cause: string | null; body: string } => ({ ...sql.one<{ cause: string | null; body: string }>('SELECT cause, body FROM suggestion WHERE id = ?', id)! });

const open = (sql: NodeSql): { id: string; cause: string | null }[] =>
  sql.all<{ id: string; cause: string | null }>("SELECT id, cause FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => ({ ...r }));

test('TWO ARRIVALS ABOUT ONE THING ARE ONE QUESTION WITH ONE CAUSE, written on the question and in its body', async () => {
  const { k, sql } = await record();
  const first = arrive(k, said('Halden Coffee', '85.00'), 'c1');
  const second = arrive(k, said('Halden Coffee', '12.00'), 'c2');
  assert.ok(first.suggestion);
  assert.equal(second.suggestion, first.suggestion, 'two charges at one shop were asked twice');
  const q = held(sql, first.suggestion!);
  assert.ok(q.cause !== null, 'the question an arrival opened has no cause');
  assert.match(q.cause!, CAUSE);
  assert.match(q.cause!, /^ingest#/u);
  assert.equal((JSON.parse(q.body) as { cause?: string }).cause, q.cause, 'the body does not carry the cause the question holds');
  assert.deepEqual(open(sql), [{ id: first.suggestion!, cause: q.cause }]);

  /* ANOTHER THING IS ANOTHER CAUSE: a charge at another shop is its own question. */
  const other = arrive(k, said('Nile Books', '40.00'), 'c3');
  assert.notEqual(other.suggestion, first.suggestion);
  const causes = open(sql).map((r) => r.cause);
  assert.equal(new Set(causes).size, 2, 'two questions share one cause');
  sql.close();
});

test('A FULL QUESTION IS ASKED AGAIN BESIDE IT, under a cause of its own, and the index never refuses the arrival', async () => {
  const { k, sql } = await record();
  const first = arrive(k, said('Halden Coffee', '85.00'), 'f1');
  sql.exec("UPDATE suggestion SET body = json_set(body, '$.rows', json(?)) WHERE id = ?", JSON.stringify(Array.from({ length: 200 }, () => ({ merchant: 'Halden Coffee' }))), first.suggestion!);
  const beside = arrive(k, said('Halden Coffee', '7.00'), 'f2');
  assert.ok(beside.suggestion && beside.suggestion !== first.suggestion, 'a full question was grown past two hundred rows');
  const base = held(sql, first.suggestion!).cause!;
  assert.equal(held(sql, beside.suggestion!).cause, `${base}#2`);
  assert.match(`${base}#2`, CAUSE);

  /* AND ONE MORE JOINS THE ONE BESIDE IT, which has room, so no third is asked. */
  const joins = arrive(k, said('Halden Coffee', '3.00'), 'f3');
  assert.equal(joins.suggestion, beside.suggestion);
  assert.equal(open(sql).length, 2);
  sql.close();
});

test('ANSWERED, ITS CAUSE IS FREE AGAIN: the next arrival about the same thing opens a new question with the same cause', async () => {
  const { k, sql } = await record();
  const first = arrive(k, said('Halden Coffee', '85.00'), 'a1');
  const cause = held(sql, first.suggestion!).cause;
  const yes = k.decide(first.suggestion!, { decide: { option: 'accept', reason: 'mine' } }, 'p_1');
  assert.ok(yes.ok, JSON.stringify(yes));
  const next = arrive(k, said('Halden Coffee', '9.00'), 'a2');
  assert.ok(next.suggestion && next.suggestion !== first.suggestion);
  assert.equal(held(sql, next.suggestion!).cause, cause);
  sql.close();
});
