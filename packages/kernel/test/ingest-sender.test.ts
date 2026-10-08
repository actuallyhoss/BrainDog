/**
 * Who an arrival is from and who it paid, kept on the arrival in the parts the record meets them by.
 *
 * A MAIL'S SENDER IS THREE PARTS, NOT ONE HEADER. `rule.meet-senders` met `"Sara Ali" <sara@…>` as a person whose email
 * was that whole string, and every reader that wanted the address or the domain parsed the header again. The arrival
 * carries `from_name`, `from_address` and `from_domain` beside `from`, which stays word for word.
 *
 * A BANK DOOR'S PAYEE IS KEPT ON THE ARRIVAL, whatever became of the row, so the record's rule can meet the organisation
 * by its `bank:` key; and a list that has no field for it yet never refuses the charge over it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Json, type Kernel } from '../src/index.ts';
import { senderOf } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER = { actor: 'p_1' };

test('A FROM HEADER IS READ INTO A NAME, AN ADDRESS AND A DOMAIN, in every form a mail server sends one', () => {
  assert.deepEqual(senderOf('Sara Ali <Sara.Ali@Acme.example>'), { name: 'Sara Ali', address: 'sara.ali@acme.example', domain: 'acme.example' });
  assert.deepEqual(senderOf('"Ali, Sara" <sara@acme.example>'), { name: 'Ali, Sara', address: 'sara@acme.example', domain: 'acme.example' });
  /* AND UNQUOTED, as some clients send it: the piece before the comma is the front of the name, not a mailbox. */
  assert.deepEqual(senderOf('Ali, Sara <sara@acme.example>'), { name: 'Ali, Sara', address: 'sara@acme.example', domain: 'acme.example' });
  assert.deepEqual(senderOf('alerts@bank.example'), { name: '', address: 'alerts@bank.example', domain: 'bank.example' });
  assert.deepEqual(senderOf('alerts@bank.example (Bank Alerts)'), { name: 'Bank Alerts', address: 'alerts@bank.example', domain: 'bank.example' });
  assert.deepEqual(senderOf('<noreply@shop.example>'), { name: '', address: 'noreply@shop.example', domain: 'shop.example' });
  /* A NAME THAT IS THE ADDRESS AGAIN IS NO NAME, and a quote escaped inside one is the character. */
  assert.deepEqual(senderOf('"sara@acme.example" <sara@acme.example>'), { name: '', address: 'sara@acme.example', domain: 'acme.example' });
  assert.equal(senderOf('"Sara \\"S\\" Ali" <sara@acme.example>').name, 'Sara "S" Ali');
  /* RFC 2047, which is how a name in Arabic or with an accent arrives; two words beside each other are one name. */
  assert.equal(senderOf('=?UTF-8?B?2LPYp9ix2Kk=?= <sara@acme.example>').name, 'سارة');
  assert.equal(senderOf('=?ISO-8859-1?Q?Ren=E9e_Dupont?= <renee@acme.example>').name, 'Renée Dupont');
  assert.equal(senderOf('=?UTF-8?Q?Ren=C3=A9e?= =?UTF-8?Q?_Dupont?= <renee@acme.example>').name, 'Renée Dupont');
  /* A WORD THIS RUNTIME CANNOT DECODE IS LEFT AS IT WAS WRITTEN, never guessed at. */
  assert.equal(senderOf('=?x-nothing?B?AAAA?= <a@b.example>').name, '=?x-nothing?B?AAAA?=');
  /* ONLY THE FIRST MAILBOX, and a folded header is one line. */
  assert.deepEqual(senderOf('Sara Ali <sara@acme.example>, Omar <omar@acme.example>'), { name: 'Sara Ali', address: 'sara@acme.example', domain: 'acme.example' });
  assert.equal(senderOf('Sara\r\n Ali <sara@acme.example>').name, 'Sara Ali');
  /* NO ADDRESS IS THREE EMPTY STRINGS, not a guess. */
  assert.deepEqual(senderOf('Bank Alerts'), { name: '', address: '', domain: '' });
  assert.deepEqual(senderOf(undefined), { name: '', address: '', domain: '' });
  /* A HEADER A HOST HANDED AS SOMETHING OTHER THAN TEXT is no sender, and never an exception out of `arrive`. */
  assert.deepEqual(senderOf(['sara@acme.example'] as never), { name: '', address: '', domain: '' });
});

const TRANSACTIONS = (withPayee: boolean): Declaration => ({
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', label: 'Merchant', required: true },
      { id: 'amount', type: 'money', label: 'Amount' },
      ...(withPayee ? [{ id: 'counterparty_text', type: 'text', label: 'Paid to, as printed' }] : []),
      { id: 'account', type: 'ref', to: 'accounts', label: 'Account' },
    ],
  } as never,
});

const ACCOUNTS = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'last4', type: 'text' }], ...over } as never,
});

const READS = {
  merchant: { text: { between: ['at ', ' for'] }, strip: ['GEIDEA*'] },
  counterparty_text: { text: { between: ['at ', ' for'] } },
  amount: { money: { after: 'EGP ', currency: 'EGP' } },
};

const CARD = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.card-used',
  kind: 'ingest',
  body: {
    ingest: 'card-used',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'card ending' }] },
    extract: READS,
    writes: { register: 'transactions', confidence: 'exact' },
    ...over,
  } as never,
});

/* Synthetic wordings, invented for this file: no real message is quoted here. */
const said = (payee: string, amount = '85.00', card = '6518'): string => `Your card ending ${card} was used at ${payee} for EGP ${amount} today.`;

const literals = (text: string, entries: readonly (readonly [string, Json])[], form?: 'enum' | 'lookup'): Json[] => {
  const tokens = text.trim().split(/\s+/);
  const whole = entries.filter(([literal]) => tokens.includes(literal)).map(([, id]) => id);
  if (whole.length || form !== 'lookup') return whole;
  const printed = /^\*+-?(\d{3,})$/.exec(tokens[0] ?? '')?.[1];
  return printed === undefined ? [] : entries.filter(([literal]) => literal.length > printed.length && literal.endsWith(printed)).map(([, id]) => id);
};

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { literals });
  const installed = await k.install(decls);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

const arrive = (k: Kernel, body: string, sha256: string, from = '"Card Alerts" <Alerts@Bank.example>', channel: 'email' | 'api' = 'email'): Arrived => {
  const r = k.arrive({ channel, headers: { From: from, Subject: 'Card' }, body, sha256 }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

const fieldsOf = (sql: NodeSql, id: string): Record<string, unknown> => JSON.parse(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', id)!.fields) as Record<string, unknown>;

test('AN EMAIL ARRIVAL CARRIES ITS SENDER IN THREE PARTS, and the stored header stays word for word', async () => {
  const { k, sql } = await record(ACCOUNTS(), TRANSACTIONS(false), CARD());
  const out = arrive(k, said('Halden Coffee'), 'm1');
  assert.deepEqual(out.sender, { name: 'Card Alerts', address: 'alerts@bank.example', domain: 'bank.example' });
  const headers = JSON.parse(sql.one<{ headers: string }>('SELECT headers FROM inbox_raw WHERE id = ?', out.raw)!.headers) as Record<string, string>;
  assert.equal(headers.from, '"Card Alerts" <Alerts@Bank.example>', 'the header a pattern matches on changed');

  /* A MESSAGE NOBODY WROTE A PATTERN FOR still says who sent it, and a redelivery says it again. */
  const stray = arrive(k, 'Your invoice is attached.', 'm2', 'Sara Ali <sara@acme.example>');
  assert.equal(stray.state, 'untriaged');
  assert.deepEqual(stray.sender, { name: 'Sara Ali', address: 'sara@acme.example', domain: 'acme.example' });
  const twice = arrive(k, 'Your invoice is attached.', 'm2', 'Sara Ali <sara@acme.example>');
  assert.equal(twice.redelivered, true);
  assert.equal(twice.sender?.address, 'sara@acme.example');

  /* NO ADDRESS, OR ANOTHER CHANNEL, IS NO SENDER rather than an empty one. */
  assert.equal(arrive(k, 'Your invoice is attached again.', 'm3', 'Bank Alerts').sender, undefined);
  assert.equal(arrive(k, 'A webhook body.', 'm4', 'alerts@bank.example', 'api').sender, undefined);
  sql.close();
});

test('A PAYEE A PATTERN READ IS KEPT ON THE ARRIVAL, and written to the row only where the list has a field for it', async () => {
  /* A LIST THAT HAS NO FIELD FOR IT YET: the charge files, and the payee rides on the arrival alone. */
  const bare = await record(ACCOUNTS(), TRANSACTIONS(false), CARD());
  const filed = arrive(bare.k, said('GEIDEA*Halden Coffee'), 'c1');
  assert.equal(filed.state, 'matched', filed.reason ?? '');
  assert.equal(filed.counterparty, 'GEIDEA*Halden Coffee', 'the payee as printed, for the record to make its bank key from');
  const row = fieldsOf(bare.sql, filed.wrote[0]!);
  assert.equal(row.merchant, 'Halden Coffee');
  assert.equal(Object.hasOwn(row, 'counterparty_text'), false, 'a field the list does not declare was written');
  bare.sql.close();

  /* A LIST THAT DECLARES IT keeps it on the row as well. */
  const kept = await record(ACCOUNTS(), TRANSACTIONS(true), CARD());
  const both = arrive(kept.k, said('GEIDEA*Halden Coffee'), 'c2');
  assert.equal(both.state, 'matched', both.reason ?? '');
  assert.equal(both.counterparty, 'GEIDEA*Halden Coffee');
  assert.equal(fieldsOf(kept.sql, both.wrote[0]!).counterparty_text, 'GEIDEA*Halden Coffee');
  kept.sql.close();
});

test('A PAYEE THE TEXT DID NOT CARRY NEVER HOLDS A CHARGE on a list that has no field for it', async () => {
  const reads = {
    merchant: { text: { between: ['at ', ' for'] } },
    counterparty_text: { text: { after: 'Paid to: ' } },
    amount: { money: { after: 'EGP ', currency: 'EGP' } },
  };
  const bare = await record(ACCOUNTS(), TRANSACTIONS(false), CARD({ extract: reads }));
  const out = arrive(bare.k, said('Halden Coffee'), 'n1');
  assert.equal(out.state, 'matched', out.reason ?? '');
  assert.equal(out.counterparty, undefined);
  bare.sql.close();

  /* WHERE THE LIST HAS THE FIELD, a payee the text did not carry is a field it could not read, as any other is. */
  const kept = await record(ACCOUNTS(), TRANSACTIONS(true), CARD({ extract: reads }));
  const held = arrive(kept.k, said('Halden Coffee'), 'n2');
  assert.equal(held.state, 'review');
  assert.match(held.reason ?? '', /could not read paid to, as printed out of this one/u);
  kept.sql.close();
});

test('A HELD CHARGE KEEPS ITS PAYEE, and its question is joined only by charges to the same payee', async () => {
  const { k, sql } = await record(ACCOUNTS(), TRANSACTIONS(true), CARD({ writes: { register: 'transactions', confidence: 'needs-review' } }));
  const first = arrive(k, said('GEIDEA*Halden Coffee'), 'h1');
  assert.equal(first.state, 'review');
  assert.equal(first.counterparty, 'GEIDEA*Halden Coffee', 'a held arrival lost its payee');
  const same = arrive(k, said('geidea*halden  coffee', '12.00'), 'h2');
  assert.equal(same.suggestion, first.suggestion);
  const other = arrive(k, said('PAYMOB-Nile Books', '12.00'), 'h3');
  assert.notEqual(other.suggestion, first.suggestion);
  sql.close();
});

test('A ROW FOUND BY ITS PRINTED TAIL IS NAMED BY ITS LIST’S WORD FOR ONE, and with none, the account it is', async () => {
  const tail = (one?: string) => async (): Promise<string> => {
    const { k, sql } = await record(ACCOUNTS(one === undefined ? {} : { one }), TRANSACTIONS(false), CARD({ extract: { ...READS, account: { lookup: { register: 'accounts', by: 'last4', after: 'card ending ' } } } }));
    /* AN ACCOUNT NOBODY NAMED, so the sentence has only the list's word for it. */
    assert.ok(k.create('accounts', { last4: '6518' }, OWNER).ok);
    const out = arrive(k, said('Halden Coffee', '85.00', '***518'), 't1');
    assert.equal(out.state, 'proposed', out.reason ?? '');
    sql.close();
    return out.reason ?? '';
  };
  const plain = await tail()();
  assert.equal(plain, 'Filed to the account ending 518 by its last digits 518. Confirm it once and later ones file straight away.');
  assert.doesNotMatch(plain, /\brow\b/u, 'the record’s own word reached a person');
  assert.equal(await tail('card')(), 'Filed to the card ending 518 by its last digits 518. Confirm it once and later ones file straight away.');
});
