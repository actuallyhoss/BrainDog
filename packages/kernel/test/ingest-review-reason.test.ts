/**
 * The reason on an arrival that waits for a person says what is actually happening to it.
 *
 * THE SEED'S `bank-from-unsure` READ A LINE CLEANLY AND WAS TOLD IT HAD PROPOSED SOMETHING. Its
 * declaration files at `needs-review`, because a bank line whose sign is unclear cannot say which way
 * the money went, and the arrival lands in `review`. The reason a person read on it was
 * *"bank-from-unsure files at needs-review, so what it read is proposed rather than written."* Nothing
 * was proposed: `proposed` is a different state, with its own place in the inbox, and the arrival was
 * not in it. The same false word sat on the sibling sentence for a field the pattern chose or
 * defaulted under a `needs-review` ceiling.
 *
 * `proposed` STAYS WHERE IT IS TRUE. An arrival whose state IS `proposed` keeps the words "proposed rather than
 * written". And now every one of these says the pattern by its name, here its description, never its id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const TRANSACTIONS: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'ref', type: 'text' },
    ],
  } as never,
};

const UNSURE = (extract: Record<string, unknown>, confidence: string): Declaration => ({
  id: 'ingest.bank-unsure',
  kind: 'ingest',
  body: {
    ingest: 'bank-unsure',
    description: 'Bank alerts',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'from bank:' }] },
    extract,
    writes: { register: 'transactions', confidence },
    dedupe: ['merchant'],
    on_conflict: 'skip',
  } as never,
});

const READS = {
  merchant: { text: { between: ['at ', ' for'] } },
  amount: { money: { after: 'EGP', currency: 'EGP' } },
};

const MAIL = 'From BANK: a movement at Halden Coffee for EGP 2,500.00 - Your available balance is hidden.';

async function record(decl: Declaration): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([TRANSACTIONS, decl])).ok);
  return { k, sql };
}

const arrive = (k: Kernel): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: 'alerts@bank.example', Subject: 'Alert' }, body: MAIL, sha256: 'u1' }) as {
    ok: boolean;
    value: Arrived;
  };
  assert.ok(r.ok);
  return r.value;
};

test('A LINE HELD FOR A PERSON IS NOT CALLED PROPOSED, and its reason says nothing was written', async () => {
  const { k, sql } = await record(UNSURE(READS, 'needs-review'));
  const out = arrive(k);

  assert.equal(out.state, 'review');
  assert.equal(out.confidence, 'needs-review');
  assert.equal(k.count('transactions'), 0);
  assert.doesNotMatch(out.reason ?? '', /proposed/, `the reason calls a held arrival proposed: ${out.reason}`);
  assert.doesNotMatch(out.reason ?? '', /files at/, 'the reason is in the record\'s jargon, not in words a stranger reads');
  assert.equal(out.reason, 'Bank alerts will not write anything it reads until somebody accepts it, so this one waits for a person.');
  assert.equal(sql.one<{ reason: string }>('SELECT reason FROM inbox_raw')?.reason, out.reason, 'the stored reason is another sentence');
  sql.close();
});

test('AND A CHOSEN OR DEFAULTED FIELD UNDER THE SAME CEILING is not called proposed either', async () => {
  const { k, sql } = await record(
    UNSURE({ ...READS, ref: { default: { value: 'none', of: { text: { after: 'ref: ' } } } } }, 'needs-review'),
  );
  const out = arrive(k);

  assert.equal(out.state, 'review');
  assert.equal(out.confidence, 'needs-review');
  assert.doesNotMatch(out.reason ?? '', /proposed/, `the reason calls a held arrival proposed: ${out.reason}`);
  assert.equal(
    out.reason,
    'Bank alerts chose or defaulted ref rather than reading it, and it will not write anything it reads until somebody accepts it, so this one waits for a person.',
  );
  sql.close();
});

test('AND WHERE THE STATE IS `proposed` THE SENTENCE IS WORD FOR WORD WHAT IT WAS', async () => {
  const ceiling = await record(UNSURE(READS, 'proposed'));
  const held = arrive(ceiling.k);
  assert.equal(held.state, 'proposed');
  assert.equal(held.reason, 'Bank alerts will ask before it writes anything, so what it read is proposed rather than written.');
  ceiling.sql.close();

  const soft = await record(UNSURE({ ...READS, ref: { default: { value: 'none', of: { text: { after: 'ref: ' } } } } }, 'exact'));
  const chose = arrive(soft.k);
  assert.equal(chose.state, 'proposed');
  assert.equal(chose.reason, 'Bank alerts chose or defaulted ref rather than reading it, so what it read is proposed rather than written.');
  soft.sql.close();
});
