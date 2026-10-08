/**
 * A text with no currency code is in its account's currency (REC-A03 job 5, the kernel half).
 *
 * BEFORE: the bank add-on declared GBP as its fallback in twenty-two places, and a text printing an amount with no code
 * filed in sterling whatever the account held. A pattern's money form now says `currency: { of: 'account', field:
 * 'balance' }`, the lookup is read first, and the amount is read in the currency the account's balance is kept in. A code
 * the text prints still wins over it; with neither, the amount is not read and the text waits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Json, type NumberReaders } from '../src/index.ts';
import { ACCOUNTS, LEDGER, NOW, OWNER } from './ingest-tail-kit.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const PATTERN = (currency: unknown = { of: 'account', field: 'balance' }, extra: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.bank-sms',
  kind: 'ingest',
  body: {
    ingest: 'bank-sms',
    channel: 'webhook',
    verify: { kind: 'path' },
    match: { all: [{ field: 'body', contains: 'was used' }] },
    extract: {
      what: { text: { between: [' at ', '.'] } },
      amount: { money: { after: 'used for ', currency } },
      account: { lookup: { register: 'accounts', by: 'last4', between: ['*** ', ' was used'] } },
      ...extra,
    },
    writes: { register: 'transactions', confidence: 'exact' },
  } as never,
});

/** A stand-in for the record's money reader: a code beside the number wins, the declared one stands behind it. */
const numbers: NumberReaders = {
  money: (text, declared) => {
    const m = /(?:([A-Z]{3})\s*)?(\d+(?:\.\d+)?)(?:\s*([A-Z]{3}))?/u.exec(text);
    if (!m) return [];
    const currency = m[1] ?? m[3] ?? declared;
    return currency === undefined ? [] : [{ amount: Math.round(Number(m[2]) * 100), currency }];
  },
  int: () => [],
  decimal: () => [],
};

async function record(withReaders: boolean, decl = PATTERN()) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), withReaders ? { numbers } : {});
  const installed = await k.install([ACCOUNTS, LEDGER, decl]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const account = (name: string, last4: string, currency: string) => {
    const made = k.create('accounts', { name, kind: 'card', balance: { amount: 0, currency }, last4 }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    return made.value.id;
  };
  return { k, sql, egp: account('Cairo card', '1111', 'EGP'), usd: account('Dollar card', '2222', 'USD') };
}

let n = 0;
const arrive = (k: Awaited<ReturnType<typeof record>>['k'], body: string): Arrived => {
  const r = k.arrive({ channel: 'webhook', ingest: 'bank-sms', body, sha256: `cur-${++n}`, verified: true });
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};
const amountOf = (k: Awaited<ReturnType<typeof record>>['k'], out: Arrived): Json | undefined => k.get(out.wrote[0]!)?.fields.amount;

for (const readers of [false, true])
  test(`A TEXT WITH NO CODE IS IN ITS ACCOUNT'S CURRENCY, ${readers ? 'with' : 'without'} the record's money reader`, async () => {
    const r = await record(readers);
    const egp = arrive(r.k, 'Card *** 1111 was used for 250.00 at Corner Shop.');
    assert.equal(egp.state, 'matched', egp.reason);
    assert.deepEqual(amountOf(r.k, egp), { amount: 25_000, currency: 'EGP' });
    const usd = arrive(r.k, 'Card *** 2222 was used for 12.50 at Corner Shop.');
    assert.deepEqual(amountOf(r.k, usd), { amount: 1_250, currency: 'USD' });
    r.sql.close();
  });

test('A CODE THE TEXT PRINTS STILL WINS over the account’s, and a text with neither waits', async () => {
  const r = await record(true);
  const printed = arrive(r.k, 'Card *** 1111 was used for USD 9.00 at Corner Shop.');
  assert.deepEqual(amountOf(r.k, printed), { amount: 900, currency: 'USD' });

  /* NO ACCOUNT READ, NO CODE PRINTED: no currency at all, so no amount, and the text waits rather than guess one. */
  const neither = arrive(r.k, 'Card *** 9999 was used for 9.00 at Corner Shop.');
  assert.equal(neither.state, 'review');
  assert.equal(r.k.count('transactions'), 1);
  r.sql.close();
});

test('THE FORM IS CHECKED AT INSTALL: it reads off a lookup of the same pattern, and a field that holds a currency', async () => {
  const refused = async (decl: Declaration): Promise<string> => {
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    const out = await k.install([ACCOUNTS, LEDGER, decl]);
    sql.close();
    assert.equal(out.ok, false, 'installed');
    return (out as { refusal: { code: string; at?: string } }).refusal.code;
  };
  assert.equal(await refused(PATTERN({ of: 'what', field: 'balance' })), 'EXTRACTOR_UNKNOWN');
  assert.equal(await refused(PATTERN({ of: 'nowhere', field: 'balance' })), 'EXTRACTOR_UNKNOWN');
  assert.equal(await refused(PATTERN({ of: 'account', field: 'colour' })), 'EXTRACTOR_UNKNOWN');
  assert.equal(await refused(PATTERN({ of: 'account', field: 'balance', more: 1 })), 'EXTRACTOR_UNKNOWN');
  assert.equal(await refused(PATTERN('GPB')), 'EXTRACTOR_UNKNOWN');
});
