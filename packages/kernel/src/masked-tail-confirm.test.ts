/**
 * A bank text filed by an account's printed tail waits for one confirmation.
 *
 * `lookup`'s masked-tail rule reads digits printed behind stars as the end of one row's longer value, so a line that
 * prints `***518` lands on the account whose number ends 518. That is a guess about money, and a misfiled transfer is
 * wrong money, so the first arrival filed that way for one ingest, account and tail is `proposed` and waits for a
 * person; once somebody has accepted one, the later ones file at `exact`. A lookup that found the whole value is not
 * asked anything, and another tail on the same account waits again.
 *
 * THE LITERAL RULE IS A STAND-IN HERE, because this package may not import `@braindog/extract` (`31 §2`), where the
 * record hands `matchLiterals` down. It keeps the two halves that matter: the longest whole token first, and for a
 * `lookup` only, digits behind stars in the first token as the tail of the one row ending in them. Every value below
 * is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Json, type Kernel } from './index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);

const wordy = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9]/.test(ch);

/** The whole-token rule, and the masked-tail rule for a `lookup`, over the table the kernel hands in. */
function literals(text: string, entries: readonly (readonly [string, Json])[], form: 'enum' | 'lookup' = 'enum'): Json[] | 'ambiguous' {
  const hay = text.toLowerCase();
  let best: { length: number; value: Json } | null = null;
  let clash = false;
  for (const [literal, value] of entries) {
    const needle = literal.toLowerCase();
    if (needle === '') continue;
    let hit = false;
    for (let i = hay.indexOf(needle); i !== -1 && !hit; i = hay.indexOf(needle, i + 1))
      hit = !wordy(hay[i - 1]) && !wordy(hay[i + needle.length]);
    if (!hit) continue;
    if (best === null || needle.length > best.length) {
      best = { length: needle.length, value };
      clash = false;
    } else if (needle.length === best.length && JSON.stringify(value) !== JSON.stringify(best.value)) clash = true;
  }
  if (best !== null) return clash ? 'ambiguous' : [best.value];
  if (form !== 'lookup') return [];
  const first = hay.trimStart().split(' ')[0] ?? '';
  const digits = /\*+-?(\d{3,})$/.exec(first)?.[1];
  if (digits === undefined) return [];
  /* AND THE REVERSE TAIL: a stored value of three digits or more that the printed digits end in. */
  const ending = entries.filter(
    ([literal]) => (literal.length > digits.length && literal.endsWith(digits)) || (/^\d{3,}$/.test(literal) && literal.length < digits.length && digits.endsWith(literal)),
  );
  if (ending.length === 0) return [];
  return ending.length > 1 ? 'ambiguous' : [ending[0]![1]];
}

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'number', type: 'text' },
    ],
  } as never,
};

const TRANSACTIONS: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'account', type: 'text' },
    ],
  } as never,
};

const BANK: Declaration = {
  id: 'ingest.bank-out',
  kind: 'ingest',
  body: {
    ingest: 'bank-out',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'was debited' }] },
    extract: {
      account: { lookup: { register: 'accounts', by: 'number', between: ['Account ***', ' was'] } },
      what: { text: { between: ['to ', ' for'] } },
      amount: { money: { after: 'for ', currency: 'EGP' } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
  } as never,
};

/** A second pattern reading the same account the same way: money in, where `BANK` reads money out. */
const BANK_IN: Declaration = {
  id: 'ingest.bank-in',
  kind: 'ingest',
  body: {
    ingest: 'bank-in',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'was credited' }] },
    extract: {
      account: { lookup: { register: 'accounts', by: 'number', between: ['Account ***', ' was'] } },
      what: { text: { between: ['from ', ' for'] } },
      amount: { money: { after: 'for ', currency: 'EGP' } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; savings: string; deposit: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { literals });
  const installed = await k.install([ACCOUNTS, TRANSACTIONS, BANK, BANK_IN]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = (fields: Record<string, unknown>): string => {
    const got = k.create('accounts', fields, { actor: 'p_1' });
    assert.ok(got.ok, JSON.stringify(got));
    return got.value.id;
  };
  return { k, sql, savings: made({ name: 'Cairo savings', number: '906518' }), deposit: made({ name: 'Cairo deposit', number: '7729' }) };
}

let sent = 0;
const debit = (k: Kernel, printed: string, pounds: string): Arrived => {
  sent += 1;
  const r = k.arrive({
    channel: 'email',
    headers: { From: 'alerts@bank.example', Subject: 'Debit' },
    body: `Your Account ***${printed} was debited to Orchard Prints for EGP ${pounds} today.`,
    sha256: `masked-tail-${String(sent)}`,
  }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

const accept = (k: Kernel, suggestion: string | undefined): void => {
  assert.ok(suggestion, 'a held arrival opens something a person can answer');
  const yes = k.decide(suggestion, { decide: { option: 'accept', reason: 'that is my savings account' } }, 'p_1');
  assert.ok(yes.ok, JSON.stringify(yes));
};

test('THE FIRST ROW FILED BY A PRINTED TAIL IS PROPOSED, and after one is accepted the next files at exact', async () => {
  const { k, sql, savings } = await record();

  const first = debit(k, '518', '75.00');
  assert.equal(first.state, 'proposed', `${first.state} at ${first.confidence}: ${first.reason}`);
  assert.equal(first.confidence, 'proposed');
  assert.equal(first.reason, 'Filed to Cairo savings by its last digits 518. Confirm it once and later ones file straight away.');
  assert.equal(k.count('transactions'), 0, 'a row found by its last digits reached the ledger before anybody confirmed it');

  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', first.suggestion ?? null)!.body) as {
    rows: Record<string, unknown>[];
    tails: { field: string; digits: string; row: string }[];
  };
  assert.equal(body.rows[0]?.account, savings, 'the proposed row does not name the account the digits end');
  assert.deepEqual(
    body.tails.map((t) => ({ field: t.field, digits: t.digits, row: t.row })),
    [{ field: 'account', digits: '518', row: savings }],
  );

  accept(k, first.suggestion);
  assert.equal(k.count('transactions'), 1);

  const second = debit(k, '518', '120.00');
  assert.equal(second.state, 'matched', `${second.state} at ${second.confidence}: ${second.reason}`);
  assert.equal(second.confidence, 'exact');
  assert.equal(k.get(second.wrote[0]!)?.fields.account, savings);
  sql.close();
});

test('ANOTHER TAIL ON THE SAME ACCOUNT WAITS AGAIN, because the confirmation is for one account and one tail', async () => {
  const { k, sql } = await record();
  accept(k, debit(k, '518', '75.00').suggestion);

  const other = debit(k, '6518', '40.00');
  assert.equal(other.state, 'proposed', `${other.state} at ${other.confidence}: ${other.reason}`);
  assert.equal(other.reason, 'Filed to Cairo savings by its last digits 6518. Confirm it once and later ones file straight away.');
  sql.close();
});

test('A REJECTED ONE CONFIRMS NOTHING, so the next arrival by that tail still waits', async () => {
  const { k, sql } = await record();
  const first = debit(k, '518', '75.00');
  const no = k.decide(first.suggestion!, { decide: { option: 'reject', reason: 'not that account' } }, 'p_1');
  assert.ok(no.ok, JSON.stringify(no));
  assert.equal(k.count('transactions'), 0);

  const again = debit(k, '518', '80.00');
  assert.equal(again.state, 'proposed', `${again.state} at ${again.confidence}: ${again.reason}`);
  sql.close();
});

test('A LOOKUP THAT FOUND THE WHOLE VALUE IS UNCHANGED, and files at exact the first time', async () => {
  const { k, sql, deposit } = await record();
  const whole = debit(k, '7729', '75.00');
  assert.equal(whole.state, 'matched', `${whole.state} at ${whole.confidence}: ${whole.reason}`);
  assert.equal(whole.confidence, 'exact');
  assert.equal(k.get(whole.wrote[0]!)?.fields.account, deposit);
  sql.close();
});

const credit = (k: Kernel, printed: string, pounds: string): Arrived => {
  sent += 1;
  const r = k.arrive({
    channel: 'email',
    headers: { From: 'alerts@bank.example', Subject: 'Credit' },
    body: `Your Account ***${printed} was credited from Orchard Prints for EGP ${pounds} today.`,
    sha256: `masked-tail-${String(sent)}`,
  }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

test('ONE CONFIRMATION SERVES EVERY PATTERN: the account and its digits are confirmed, whichever wording asked', async () => {
  const { k, sql, savings } = await record();
  accept(k, debit(k, '518', '75.00').suggestion);

  /* ANOTHER PATTERN, THE SAME ACCOUNT AND DIGITS: confirmed already, so it files at exact the first time. */
  const inward = credit(k, '518', '300.00');
  assert.equal(inward.state, 'matched', `${inward.state} at ${inward.confidence}: ${inward.reason}`);
  assert.equal(k.get(inward.wrote[0]!)?.fields.account, savings);
  sql.close();
});

test('THE REVERSE TAIL: digits printed longer than a value they end in are a tail too, confirmed once like the other way', async () => {
  const { k, sql } = await record();
  /* AN ACCOUNT WHOSE NUMBER WAS TYPED AS ITS LAST THREE, and a bank that prints four. */
  const short = k.create('accounts', { name: 'Giza wallet', number: '291' }, { actor: 'p_1' });
  assert.ok(short.ok, JSON.stringify(short));

  const first = debit(k, '4291', '10.00');
  assert.equal(first.state, 'proposed', `${first.state} at ${first.confidence}: ${first.reason}`);
  assert.equal(first.reason, 'Filed to Giza wallet by its last digits 4291. Confirm it once and later ones file straight away.');
  accept(k, first.suggestion);

  const second = debit(k, '4291', '20.00');
  assert.equal(second.state, 'matched', `${second.state} at ${second.confidence}: ${second.reason}`);
  assert.equal(k.get(second.wrote[0]!)?.fields.account, short.value.id);
  sql.close();
});
