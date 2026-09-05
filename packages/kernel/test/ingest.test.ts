/**
 * Ingest: a payload arrives, and the record fills itself.
 *
 * The two failures every ingest pipeline has are SILENCE and DUPLICATION, and everything here is
 * about one or the other. A payload nobody wrote a pattern for is a row somebody can see. A payload
 * whose pattern could not read a field is a row somebody can see, with the reason on it. And the
 * same bytes twice are one row, because every webhook sender retries and most mail servers do too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrive, extractField, ingestDay, openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
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
      { id: 'date', type: 'day', index: true },
      { id: 'account', type: 'ref', to: 'accounts' },
      { id: 'ref', type: 'text', index: true },
      { id: 'kind', type: 'enum', values: ['debit', 'credit'] },
    ],
  } as never,
};

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'last4', fields: [{ id: 'last4', type: 'text', required: true }] } as never,
};

const HSBC = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.hsbc-sms',
  kind: 'ingest',
  body: {
    ingest: 'hsbc-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@hsbc.example' }, { field: 'subject', contains: 'transaction' }] },
    extract: {
      merchant: { text: { between: ['at ', ' on'] } },
      amount: { money: { after: 'EGP', currency: 'EGP' } },
      date: { date: { format: 'DD/MM/YY', after: ' on ' } },
      account: { lookup: { register: 'accounts', by: 'last4', after: 'card ending ' } },
      kind: { enum: { map: { debited: 'debit', credited: 'credit' } } },
    },
    writes: { register: 'transactions', confidence: 'exact', key: ['merchant', 'date'] },
    on_conflict: 'skip',
    ...over,
  } as never,
});

const MAIL = 'Your card ending 4471 was debited EGP 1,316.24 at Halden Coffee on 03/04/26.';

type Clockish = ReturnType<typeof fixedClock>;

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([ACCOUNTS, TRANSACTIONS, ...decls])).ok);
  assert.ok(k.create('accounts', { last4: '4471' }, { actor: 'p_1' }).ok);
  return { k, sql, clock };
}

const send = (k: Kernel, body = MAIL, sha256 = 'a1', subject = 'Your transaction alert') =>
  k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: subject }, body, sha256 });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/* ── it fills itself ─────────────────────────────────────────────────────── */

test('A PAYLOAD ARRIVES AND THE RECORD FILLS ITSELF, in one transaction with no model in it', async () => {
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(send(k));

  assert.equal(out.state, 'matched');
  assert.equal(out.ingest, 'hsbc-sms');
  assert.equal(out.wrote.length, 1);

  const row = k.get('transactions#1')!;
  assert.equal(row.fields.merchant, 'Halden Coffee');
  assert.deepEqual(row.fields.amount, { amount: 131_624, currency: 'EGP' }, 'the money is not an integer in minor units');
  assert.equal(row.fields.date, '2026-04-03');
  assert.equal(row.fields.account, k.get('accounts#1')?.id, 'the lookup did not resolve to a row');
  assert.equal(row.fields.kind, 'debit');

  // The raw bytes are in the record, which is what makes "why did that not come through" answerable.
  const raw = sql.one<{ state: string; channel: string; sha256: string }>('SELECT state, channel, sha256 FROM inbox_raw')!;
  assert.equal(raw.state, 'matched');
  assert.equal(raw.sha256, 'a1');

  // One receipt per arrival, its `wrote` filled by the record.
  const receipt = sql.one<{ wrote: string; confidence: string; ingest_id: string }>('SELECT wrote, confidence, ingest_id FROM ingest_receipt')!;
  assert.deepEqual(JSON.parse(receipt.wrote), out.wrote);
  assert.equal(receipt.confidence, 'exact');

  // And the write wears the ingest's name, not a person's.
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'create' ORDER BY rowid DESC LIMIT 1")?.actor, 'ingest:hsbc-sms');
  sql.close();
});

/* ── the same bytes twice ────────────────────────────────────────────────── */

test('THE SAME BYTES TWICE ARE ONE ROW, because every webhook sender retries', async () => {
  const { k, sql } = await record(HSBC());
  value<Arrived>(send(k));
  const again = value<Arrived>(send(k));

  assert.equal(k.count('transactions'), 1, 'a redelivery wrote a duplicate invoice');
  assert.equal(sql.all('SELECT 1 FROM inbox_raw').length, 1);
  assert.match(again.reason ?? '', /arrived before/);
  /* AND IT SAYS WHAT IT DID THE FIRST TIME. A redelivery answering "nothing was written" would send
     a sender looking for the row it never got told about — the answer is the row from before. */
  assert.deepEqual(again.wrote, [k.get('transactions#1')!.id]);
  assert.equal(again.ingest, 'hsbc-sms');
  sql.close();
});

test('and a DIFFERENT email about the same thing is skipped by its key, with the row named', async () => {
  // The hash catches a redelivery; `key:` catches the second notice about one transaction.
  const { k, sql } = await record(HSBC());
  value<Arrived>(send(k));
  const out = value<Arrived>(send(k, `Reminder: ${MAIL}`, 'a2'));

  assert.equal(out.state, 'skipped');
  assert.match(out.reason ?? '', /transactions#1 already says this/);
  assert.equal(k.count('transactions'), 1);
  // A skipped arrival has no receipt, which is what makes "what did this do" answerable by existence.
  assert.equal(sql.all('SELECT 1 FROM ingest_receipt').length, 1);
  sql.close();
});

test('unless the pattern says to update, in which case the row moves rather than doubling', async () => {
  const { k, sql } = await record(HSBC({ on_conflict: 'update' }));
  value<Arrived>(send(k));
  const out = value<Arrived>(send(k, MAIL.replace('1,316.24', '1,400.00'), 'a2'));

  assert.equal(out.state, 'matched');
  assert.equal(k.count('transactions'), 1);
  assert.deepEqual(k.get('transactions#1')?.fields.amount, { amount: 140_000, currency: 'EGP' });
  sql.close();
});

/* ── silence is the failure ──────────────────────────────────────────────── */

test('A PAYLOAD NOBODY WROTE A PATTERN FOR IS A ROW SOMEBODY CAN SEE', async () => {
  /* Not dropped and not guessed at. An ingest pipeline whose answer to "I do not recognise this" is
     to drop it is a pipeline whose failures are invisible — and the person who would have written
     the pattern is the one who never finds out it was needed. */
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(
    k.arrive({ channel: 'email', headers: { From: 'somebody@else.example', Subject: 'hello' }, body: 'nothing to see', sha256: 'z1' }),
  );

  assert.equal(out.state, 'untriaged');
  assert.equal(out.ingest, null);
  assert.equal(k.count('transactions'), 0);
  assert.equal(sql.one<{ body: string }>('SELECT body FROM inbox_raw')?.body, 'nothing to see', 'the bytes went away');
  sql.close();
});

test('AND A FIELD THE PATTERN COULD NOT READ IS A REVIEW, with the reason on it', async () => {
  // A failure downgrades rather than discards: the person who set the pattern up is the only one who
  // can fix it, and they cannot fix what they cannot see.
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(send(k, 'Your card ending 4471 was debited at Halden Coffee on 03/04/26.', 'b1'));

  assert.equal(out.state, 'review');
  assert.match(out.reason ?? '', /could not read amount/);
  assert.equal(k.count('transactions'), 0, 'it wrote a row with a hole in it');
  assert.equal(sql.one<{ reason: string }>('SELECT reason FROM inbox_raw')?.reason, out.reason);
  assert.equal(sql.all('SELECT 1 FROM ingest_receipt').length, 0, 'a review earned a receipt');
  sql.close();
});

test('a lookup that resolves to nothing is a review too, not a broken reference', async () => {
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(send(k, MAIL.replace('4471', '9999'), 'c1'));
  assert.equal(out.state, 'review');
  assert.match(out.reason ?? '', /account/);
  sql.close();
});

/* ── the transforms ──────────────────────────────────────────────────────── */

const deps = { find: () => null } as never;

test('A DATE IS PARSED IN THE FORMAT THE PATTERN DECLARES, never guessed', () => {
  /* `03/04/26` is the third of April in Britain and the fourth of March in America. An extractor
     that decided by looking at the number would be right most of the time and wrong about every
     date before the thirteenth. */
  assert.equal(ingestDay('03/04/26', 'DD/MM/YY'), '2026-04-03');
  assert.equal(ingestDay('03/04/2026', 'MM/DD/YYYY'), '2026-03-04');
  assert.equal(ingestDay('2026-04-03', 'YYYY-MM-DD'), '2026-04-03');
  assert.equal(ingestDay('03/04/26', 'DD-MM-YY'), null, 'a format the vocabulary does not have');

  // The shape is not the check, here as everywhere: a row dated 31 February sorts for ever.
  assert.equal(ingestDay('31/02/26', 'DD/MM/YY'), null);
  assert.equal(ingestDay('nothing', 'DD/MM/YY'), null);
});

test('and money is a number the payload carries with a currency the PATTERN declares', () => {
  // Reading a currency out of a payload means guessing from a symbol, and `$` is at least five.
  assert.deepEqual(extractField(deps, { money: { after: 'EGP', currency: 'EGP' } }, 'paid EGP 1,316.24 today'), {
    amount: 131_624,
    currency: 'EGP',
  });
  assert.equal(extractField(deps, { money: { after: 'EGP' } } as never, 'paid EGP 12.00'), null, 'money with no currency');
  assert.equal(extractField(deps, { money: { after: 'USD', currency: 'USD' } }, 'no dollars here'), null);
});

test('an enum takes its LONGEST literal first, so `unpaid` does not read as `paid`', () => {
  const form = { enum: { map: { paid: 'settled', unpaid: 'open' } } } as const;
  assert.equal(extractField(deps, form, 'this invoice is unpaid'), 'open');
  assert.equal(extractField(deps, form, 'this invoice is paid'), 'settled');
  assert.equal(extractField(deps, form, 'this invoice is pending'), null);
});

test('an anchor that is not in the text is nothing, never the whole text', () => {
  // The failure this prevents: a `between` that missed and extracted the entire email as a merchant.
  assert.equal(extractField(deps, { between: ['at ', ' on'] }, 'no anchors here'), null);
  assert.equal(extractField(deps, { after: 'ref: ' }, 'no anchors here'), null);
  assert.equal(extractField(deps, { after: 'ref: ' }, 'ref: ABC-1'), 'ABC-1');
  assert.equal(extractField(deps, { between: ['at ', ' on'] }, 'paid at Halden on Tuesday'), 'Halden');
});

test('and `null` is "not there", never zero and never the empty string', () => {
  // A pattern producing a zero for a missing amount writes a row saying somebody owes nothing, which
  // is a different and worse claim than not writing one.
  assert.equal(extractField(deps, { int: {} }, 'no numbers'), null);
  assert.equal(extractField(deps, { text: {} }, '   '), null);
  assert.equal(extractField(deps, { int: {} }, 'there are 41 of them'), 41);
  assert.equal(extractField(deps, { int: {} }, 'there are 4.1 of them'), null, 'an int is a whole number');
});

/* ── the boundaries ──────────────────────────────────────────────────────── */

test('a channel that is not a channel, and an arrival with no hash, are refused', async () => {
  const { k, sql } = await record(HSBC());
  const bad = k.arrive({ channel: 'carrier-pigeon' as never, body: 'x', sha256: 'q' });
  assert.equal(bad.ok, false);
  const none = k.arrive({ channel: 'email', body: 'x', sha256: '' });
  assert.equal(none.ok, false);
  assert.equal(sql.all('SELECT 1 FROM inbox_raw').length, 0);
  sql.close();
});

test('THE FIRST MATCHING PATTERN WINS, and the second is not merged into it', async () => {
  // Merging two extractions produces a row neither declaration describes.
  const { k, sql } = await record(
    HSBC(),
    {
      id: 'ingest.catch-all',
      kind: 'ingest',
      body: {
        ingest: 'catch-all',
        channel: 'email',
        extract: { merchant: { text: {} } },
        writes: { register: 'transactions' },
      } as never,
    },
  );
  const out = value<Arrived>(send(k));
  assert.equal(out.ingest, 'hsbc-sms');
  assert.equal(k.get('transactions#1')?.fields.merchant, 'Halden Coffee', 'the catch-all took the whole email');
  sql.close();
});

test('and the pipeline is one transaction: a refused write leaves no raw behind', async () => {
  /* All rows or none, per arrival. The transaction is the record's, so a refusal rolls the raw back
     with it — rather than leaving a raw row whose receipt says nothing was written and cannot say
     why. */
  const { k, sql } = await record(
    HSBC({
      extract: { amount: { money: { after: 'EGP', currency: 'EGP' } } },
      writes: { register: 'transactions' },
    }),
  );
  const out = send(k);
  assert.equal(out.ok, false, 'a row with no required field was written');
  assert.equal(sql.all('SELECT 1 FROM inbox_raw').length, 0);
  assert.equal(k.count('transactions'), 0);
  sql.close();
});

test('the function is a function, and it reads the record it was handed', async () => {
  const { k, sql } = await record(HSBC());
  const out = arrive(
    {
      sql,
      ingests: () => [],
      schemaOf: () => null,
      write: () => ({ ok: false, refusal: { code: 'X', fix: 'x' } }),
      find: () => null,
      mint: () => '01ABCDEFGHJKMNPQRSTVWXYZ99',
      nowMs: NOW,
    },
    { channel: 'paste', body: 'anything', sha256: 'p1' },
    k.transaction,
  );
  assert.equal(value<Arrived>(out).state, 'untriaged');
  sql.close();
});
