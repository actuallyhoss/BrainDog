/**
 * The name a person reads for who was paid, written beside the bank's own words.
 *
 * A BANK PRINTS `GEIDEA*CHILLOUT 0423 CAIRO EG` AND A PERSON SAYS `Chillout`. A list that declares a text field `payee`
 * gets the clean name (`payeeName`) written to it; `counterparty_text` keeps the bank's words. The arrival carries the
 * clean name too, since it is what the record names the organisation by, and the `bank:` key both fold to is the same.
 *
 * AND IT NEVER COSTS THE ROW: a list that has no `payee` field files the charge as it did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bankKey, openRecord, payeeName, type Arrived, type Declaration, type Json, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const PRINTED = 'GEIDEA*CHILLOUT 0423 CAIRO EG';

/** The ledger, with the bank's words always and the clean name's field only where a test asks for it. */
const TRANSACTIONS = (payee: Record<string, unknown> | null, printed = true): Declaration => ({
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', label: 'Merchant', required: true },
      { id: 'amount', type: 'money', label: 'Amount' },
      ...(printed ? [{ id: 'counterparty_text', type: 'text', label: 'As the bank wrote it' }] : []),
      ...(payee === null ? [] : [{ id: 'payee', label: 'Paid to or from', ...payee }]),
    ],
  } as never,
});

const CARD = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.card-used',
  kind: 'ingest',
  body: {
    ingest: 'card-used',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'card ending' }] },
    extract: {
      merchant: { text: { between: ['at ', ' for'] } },
      counterparty_text: { text: { between: ['at ', ' for'] } },
      amount: { money: { after: 'EGP ', currency: 'EGP' } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    ...over,
  } as never,
});

/* Synthetic wordings, invented for this file: no real message is quoted here. */
const said = (payee: string, amount = '85.00'): string => `Your card ending 6518 was used at ${payee} for EGP ${amount} today.`;

const literals = (text: string, entries: readonly (readonly [string, Json])[]): Json[] => {
  const tokens = text.trim().split(/\s+/);
  return entries.filter(([literal]) => tokens.includes(literal)).map(([, id]) => id);
};

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { literals });
  const installed = await k.install(decls);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

const arrive = (k: Kernel, body: string, sha256: string): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: 'Card Alerts <alerts@bank.example>', Subject: 'Card' }, body, sha256 }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

const fieldsOf = (sql: NodeSql, id: string): Record<string, unknown> => JSON.parse(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', id)!.fields) as Record<string, unknown>;

test('A LIST THAT DECLARES A TEXT FIELD payee GETS THE CLEAN NAME, and counterparty_text keeps the bank\'s words', async () => {
  assert.equal(payeeName(PRINTED), 'Chillout');
  const { k, sql } = await record(TRANSACTIONS({ type: 'text' }), CARD());
  const out = arrive(k, said(PRINTED), 'p1');
  assert.equal(out.state, 'matched', out.reason ?? '');
  const row = fieldsOf(sql, out.wrote[0]!);
  assert.equal(row.payee, 'Chillout');
  assert.equal(row.counterparty_text, PRINTED, 'the bank\'s own words were changed');
  sql.close();
});

test('A LIST THAT DOES NOT DECLARE payee IS UNCHANGED, and the charge is not refused over it', async () => {
  const { k, sql } = await record(TRANSACTIONS(null), CARD());
  const out = arrive(k, said(PRINTED), 'p2');
  assert.equal(out.state, 'matched', out.reason ?? '');
  const row = fieldsOf(sql, out.wrote[0]!);
  assert.equal(Object.hasOwn(row, 'payee'), false, 'a field the list does not declare was written');
  assert.equal(row.counterparty_text, PRINTED);
  sql.close();

  /* NOR ON A LIST WITH NEITHER FIELD, which files the charge by its merchant alone. */
  const bare = await record(TRANSACTIONS(null, false), CARD());
  const filed = arrive(bare.k, said(PRINTED), 'p3');
  assert.equal(filed.state, 'matched', filed.reason ?? '');
  assert.deepEqual(Object.keys(fieldsOf(bare.sql, filed.wrote[0]!)).filter((id) => id === 'payee' || id === 'counterparty_text'), []);
  bare.sql.close();
});

test('A payee FIELD THAT IS NOT TEXT IS LEFT ALONE, and one the pattern read itself is kept as read', async () => {
  /* ANOTHER LIST'S `payee` MAY BE A LINK TO SOMEBODY: a name written into it would refuse the whole charge. */
  const linked = await record(
    { id: 'register.organisations', kind: 'register', body: { id: 'organisations', name: 'Organisations', title: 'name', fields: [{ id: 'name', type: 'text' }] } as never },
    TRANSACTIONS({ type: 'ref', to: 'organisations' }),
    CARD(),
  );
  const out = arrive(linked.k, said(PRINTED), 'p4');
  assert.equal(out.state, 'matched', out.reason ?? '');
  assert.equal(Object.hasOwn(fieldsOf(linked.sql, out.wrote[0]!), 'payee'), false);
  linked.sql.close();

  /* A PATTERN THAT READS `payee` ITSELF HAS SAID WHAT IT IS, and nothing here writes over it. */
  const reads = {
    merchant: { text: { between: ['at ', ' for'] } },
    counterparty_text: { text: { between: ['at ', ' for'] } },
    payee: { text: { between: ['at ', '*'] } },
    amount: { money: { after: 'EGP ', currency: 'EGP' } },
  };
  const own = await record(TRANSACTIONS({ type: 'text' }), CARD({ extract: reads }));
  const kept = arrive(own.k, said(PRINTED), 'p5');
  assert.equal(kept.state, 'matched', kept.reason ?? '');
  assert.equal(fieldsOf(own.sql, kept.wrote[0]!).payee, 'GEIDEA');
  own.sql.close();
});

test('A TEXT WITH NO LETTERS KEEPS ITSELF as the bank\'s words, and is never written as a payee (Q15 of 29 October)', async () => {
  const { k, sql } = await record(TRANSACTIONS({ type: 'text' }), CARD());
  for (const [printed, sha] of [['4471', 'n1'], ['*** ###', 'n2']] as const) {
    const out = arrive(k, said(printed), sha);
    assert.equal(out.state, 'matched', out.reason ?? '');
    const row = fieldsOf(sql, out.wrote[0]!);
    assert.equal(row.payee, undefined, 'a name is words: the end of an account number is not one');
    assert.equal(row.counterparty_text, printed);
    assert.equal(out.counterparty, printed);
  }
  sql.close();
});

test('THE ARRIVAL CARRIES THE CLEAN NAME, and the bank: key it joins on is the one the bank\'s words had', async () => {
  /* WHETHER OR NOT THE LIST HAS A FIELD FOR IT: the organisation is named the same on every record. */
  for (const [payee, sha] of [[{ type: 'text' }, 'a1'], [null, 'a2']] as const) {
    const { k, sql } = await record(TRANSACTIONS(payee), CARD());
    const out = arrive(k, said(PRINTED), sha);
    assert.equal(out.counterparty, 'Chillout');
    assert.equal(bankKey(out.counterparty!), bankKey(PRINTED));
    assert.equal(bankKey(out.counterparty!), 'bank:chillout');
    sql.close();
  }
});

test('A HELD CHARGE CARRIES THE CLEAN NAME TOO, and its question is still joined by the bank\'s words', async () => {
  const { k, sql } = await record(TRANSACTIONS({ type: 'text' }), CARD({ writes: { register: 'transactions', confidence: 'needs-review' } }));
  const first = arrive(k, said(PRINTED), 'h1');
  assert.equal(first.state, 'review');
  assert.equal(first.counterparty, 'Chillout');
  const same = arrive(k, said('geidea*chillout  0423 cairo eg', '12.00'), 'h2');
  assert.equal(same.suggestion, first.suggestion);
  const other = arrive(k, said('PAYMOB-Nile Books', '12.00'), 'h3');
  assert.notEqual(other.suggestion, first.suggestion);
  sql.close();
});
