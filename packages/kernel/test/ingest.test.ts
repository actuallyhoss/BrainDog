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

test('A REGISTER REFUSING WHAT A PATTERN READ DOWNGRADES IT, and never discards the bytes', async () => {
  /* The header of the module says the raw is stored first and always, twice. Returning the refusal
     rolled the raw back with it — the payload gone, and nobody able to fix the pattern from a row
     that does not exist. */
  const { k, sql } = await record(
    HSBC({
      extract: { amount: { money: { after: 'EGP', currency: 'EGP' } } },
      writes: { register: 'transactions' },
    }),
  );
  const out = value<Arrived>(send(k));
  assert.equal(out.state, 'review');
  assert.equal(out.confidence, 'needs-review');
  assert.equal(out.wrote.length, 0);
  assert.match(out.reason ?? '', /merchant/, 'the reason does not say which field the register refused');

  assert.equal(k.count('transactions'), 0, 'a row with no required field was written');
  const raw = sql.one<{ state: string; reason: string }>('SELECT state, reason FROM inbox_raw')!;
  assert.equal(raw.state, 'review');

  // And what it read is in front of somebody, which is the only thing that makes it fixable.
  const sg = sql.one<{ id: string; body: string; opened_by: string }>("SELECT id, body, opened_by FROM suggestion")!;
  assert.equal(sg.id, out.suggestion);
  assert.equal(sg.opened_by, 'ingest:hsbc-sms');
  assert.deepEqual(JSON.parse(sg.body), {
    register: 'transactions',
    rows: [{ amount: { amount: 131_624, currency: 'EGP' } }],
    ingest: 'hsbc-sms',
  });

  // And the observation the write left behind survives, or the record cannot tell a bad
  // declaration from a bad afternoon.
  assert.equal(
    sql.one<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'write.refused'")?.subject,
    'transactions.merchant:REQUIRED_MISSING',
  );
  sql.close();
});

/* ── the ceiling ────────────────────────────────────────────────── */

test('A PATTERN NOBODY HAS APPROVED WRITES NOTHING, however cleanly it read', async () => {
  /* Every pattern a model proposes files at `needs-review`, and one of those writing rows into
     somebody's ledger is the single failure this whole design exists to prevent. */
  const { k, sql } = await record(HSBC({ writes: { register: 'transactions', confidence: 'needs-review' } }));
  const out = value<Arrived>(send(k));

  assert.equal(out.state, 'review');
  assert.equal(out.confidence, 'needs-review');
  assert.deepEqual(out.wrote, []);
  assert.equal(k.count('transactions'), 0, 'an unapproved pattern wrote a row');
  assert.equal(sql.all('SELECT 1 FROM ingest_receipt').length, 0, 'nothing was written, so nothing has a receipt');

  // The extraction is not thrown away: it is the thing somebody accepts or corrects.
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion')!.body) as {
    register: string;
    rows: Record<string, unknown>[];
    ingest: string;
  };
  assert.equal(body.register, 'transactions');
  assert.equal(body.rows[0]?.merchant, 'Halden Coffee');
  assert.equal(body.ingest, 'hsbc-sms');
  sql.close();
});

test('and `proposed` parks the arrival in its own state, so the two are told apart', async () => {
  const { k, sql } = await record(HSBC({ writes: { register: 'transactions', confidence: 'proposed' } }));
  const out = value<Arrived>(send(k));

  assert.equal(out.state, 'proposed');
  assert.equal(out.confidence, 'proposed');
  assert.equal(sql.one<{ state: string }>('SELECT state FROM inbox_raw')?.state, 'proposed');
  assert.match(out.reason ?? '', /proposed rather than written/);
  assert.equal(k.count('transactions'), 0);
  sql.close();
});

test('THE CEILING ONLY EVER BRINGS IT DOWN: an unreadable field beats an `exact` declaration', async () => {
  // Confidence is derived and the ceiling caps it. A pattern cannot promise its way past a miss.
  const { k, sql } = await record(HSBC());
  const out = value<Arrived>(k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert' }, body: 'Your card ending 4471 was debited at Halden Coffee on 03/04/26.', sha256: 'b2' }));
  assert.equal(out.state, 'review');
  assert.equal(out.confidence, 'needs-review');
  assert.match(out.reason ?? '', /could not read amount/);

  /* AND A CONFIDENCE OUTSIDE THE THREE KEEPS THE BYTES. This used to refuse before `store` had run,
     and the whole call sits in a savepoint — so a declaration carrying `confidence: probably`, which
     nothing validates at install and which a `.dog` import or a pack installs cleanly, threw the
     arrival away entirely: `inbox_raw` got no row, against 07 §2's "nothing is ever dropped". The
     sender did nothing wrong; the pattern did, and the payload is the evidence for fixing it. */
  const bad = await record(HSBC({ writes: { register: 'transactions', confidence: 'probably' } }));
  const r = value<Arrived>(
    bad.k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert' }, body: MAIL, sha256: 'c3' }),
  );
  assert.equal(r.state, 'review');
  assert.match(r.reason ?? '', /not a confidence/);
  assert.equal(bad.sql.all('SELECT 1 FROM inbox_raw').length, 1, 'the bytes were thrown away');
  assert.equal(bad.k.count('transactions'), 0, 'and nothing was written from a declaration it could not read');
  sql.close();
  bad.sql.close();
});

test('and the ingest is on the ledger under its own name, twice', async () => {
  // `match` says a pattern claimed this payload; `extract` says it wrote. Neither is a person.
  const { k, sql } = await record(HSBC());
  value<Arrived>(send(k));
  assert.deepEqual(
    sql
      .all<{ kind: string; actor: string }>("SELECT kind, actor FROM event WHERE kind IN ('match','extract') ORDER BY rowid")
      .map((r) => ({ kind: r.kind, actor: r.actor })),
    [
      { kind: 'match', actor: 'ingest:hsbc-sms' },
      { kind: 'extract', actor: 'ingest:hsbc-sms' },
    ],
  );
  sql.close();
});

/* ── 3′: the shape nobody wrote a pattern for ─────────────────────────── */

test('AN UNMATCHED SHAPE EARNS ONE DRAFT AT ITS THIRD ARRIVAL, and never one per payload', async () => {
  /* A model call per arrival is a bill that scales with a stranger's sending rate. Three is the
     smallest number of examples a pattern can be written from and the smallest that is not a
     coincidence, which is why it is the same three. */
  const { k, sql } = await record();
  const cib = (n: number, from = 'CIB Alerts <alerts@cib.eg>') =>
    value<Arrived>(k.arrive({ channel: 'email', headers: { From: from, Subject: 'Debit' }, body: `payment ${n}`, sha256: `x${n}` }));

  assert.equal(cib(1).state, 'untriaged');
  assert.equal(cib(2).state, 'untriaged');
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 0, 'two of anything is a coincidence');

  cib(3);
  const rows = sql.all<{ kind: string; payload: string }>('SELECT kind, payload FROM outbox');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, 'infer.draft');
  const draft = JSON.parse(rows[0]!.payload) as { shape: string; n: number; examples: string[]; window: string };
  assert.equal(draft.shape, 'email:alerts@cib.eg');
  assert.equal(draft.n, 3);
  assert.equal(draft.window, '30d');

  // Ids, oldest first, and never the bodies: a stranger's text does not go into a queue that is
  // summarised in front of a person.
  assert.equal(draft.examples.length, 3);
  assert.deepEqual(
    draft.examples,
    sql.all<{ id: string }>('SELECT id FROM inbox_raw ORDER BY rowid').map((r) => r.id),
  );
  assert.equal(JSON.stringify(draft).includes('payment'), false);

  // And the fourth asks the same question again, which is one bill for nothing.
  cib(4);
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1);
  sql.close();
});

test('and the display name is not the shape, or three examples are three shapes', async () => {
  // A bank that sends as `CIB` on Monday and `CIB Alerts` on Tuesday is one sender.
  const { k, sql } = await record();
  const names = ['CIB <alerts@cib.eg>', 'CIB Alerts <ALERTS@cib.eg>', 'alerts@cib.eg'];
  names.forEach((from, i) =>
    k.arrive({ channel: 'email', headers: { From: from, Subject: 'Debit' }, body: `p${i}`, sha256: `y${i}` }),
  );
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 1, 'one sender was read as three');

  // And what it noticed about itself is the same shape, so the weekly analyser agrees with 3'.
  assert.equal(
    sql.one<{ subject: string; n: number }>("SELECT subject, n FROM observation WHERE kind = 'ingest.unmatched'")?.n,
    3,
  );
  sql.close();
});

test('and a matched payload proposes nothing, because there is nothing to propose', async () => {
  const { k, sql } = await record(HSBC());
  value<Arrived>(send(k));
  assert.equal(sql.all('SELECT 1 FROM outbox').length, 0);
  assert.equal(sql.all("SELECT 1 FROM observation WHERE kind = 'ingest.unmatched'").length, 0);
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
      allocate: () => 1,
      nowMs: NOW,
    },
    { channel: 'paste', body: 'anything', sha256: 'p1' },
    k.transaction,
  );
  assert.equal(value<Arrived>(out).state, 'untriaged');
  sql.close();
});

/* ── what the transforms get wrong when nobody looks ──────────────────── */

test('MONEY DECLARES ITS THOUSANDS SEPARATOR, or every European amount is a thousandth of itself', async () => {
  /* `decimal` took a `sep` and `money` did not, so €1.234,56 was written as €1.23 — the worst place
     for that bug, because the row still looks plausible. */
  const { k, sql } = await record();
  const deps = { find: () => null } as never;

  assert.deepEqual(extractField(deps, { money: { after: 'EUR', currency: 'EUR', sep: '.' } }, 'EUR 1.234,56'), {
    amount: 123_456,
    currency: 'EUR',
  });
  assert.deepEqual(extractField(deps, { money: { after: 'EUR', currency: 'EUR', sep: '.' } }, 'EUR 1.234.567,89'), {
    amount: 123_456_789,
    currency: 'EUR',
  });
  assert.deepEqual(extractField(deps, { money: { after: 'EGP', currency: 'EGP' } }, 'EGP 1,316.24'), {
    amount: 131_624,
    currency: 'EGP',
  });

  // And a number stops at the number: the next token's digits are not part of this one.
  assert.deepEqual(extractField(deps, { money: { after: 'EGP', currency: 'EGP' } }, 'EGP 250 2 items'), {
    amount: 25_000,
    currency: 'EGP',
  });
  void k;
  sql.close();
});

test('and a declared DD/MM/YY does not read the first half of a four-digit year', async () => {
  // `03/04/2026` came back as 2020-04-03 — a real day, six years early, sorting before everything.
  assert.equal(ingestDay('paid 03/04/2026', 'DD/MM/YY'), null);
  assert.equal(ingestDay('paid 03/04/2026', 'DD/MM/YYYY'), '2026-04-03');
  assert.equal(ingestDay('paid 03/04/26', 'DD/MM/YY'), '2026-04-03');
  assert.equal(ingestDay('ref 12026-04-03', 'YYYY-MM-DD'), null);
});

/* ── what a pack may put in a query ──────────────────────────────────────── */

test('A FIELD ID FROM A DECLARATION CANNOT BECOME SQL', async () => {
  /* `writes.key` is a list of field ids from a declaration, and a declaration can come from a pack —
     which 04 says is meant to be safe to install from a stranger. They were interpolated into
     `json_extract(fields, '$.<id>')` with no grammar check, so a key of
     `ref') = 1 OR 1 = 1 OR json_extract(fields, '$.x` selected the first row of the register and an
     `on_conflict: update` wrote over it. */
  /* AND IT IS REFUSED AT INSTALL, where somebody can still fix it. `declare.ts`'s grammar check
     applies to register and field ids and returns before every other kind, so an ingest's
     `writes.key` was an arbitrary string all the way to the query. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([
    TRANSACTIONS,
    HSBC({ writes: { register: 'transactions', key: ["ref') = 1 OR 1 = 1 OR json_extract(fields, '$.x"] } }),
  ]);
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { code: string } }).refusal.code, 'DECLARATION_INVALID');
  sql.close();
});

test('A NUMERIC DEDUPE KEY MATCHES, which it never did', async () => {
  /* The key values were bound as strings and `json_extract` answers an INTEGER for an `int` field
     and an object for a `money` one — and SQLite compares storage classes, so `= '1234'` never
     matched. Every re-notice of one payment wrote a second row and the money was counted twice. */
  const { k, sql } = await record(HSBC({ writes: { register: 'transactions', key: ['amount'] } }));
  const first = value<Arrived>(
    k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert' }, body: MAIL, sha256: 'm1' }),
  );
  assert.equal(first.state, 'matched');

  const again = value<Arrived>(
    k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'Your transaction alert (resent)' }, body: MAIL, sha256: 'm2' }),
  );
  assert.equal(again.state, 'skipped', 'the same amount arrived twice and was written twice');
  assert.equal(k.count('transactions'), 1);
  sql.close();
});

test('A DOT-GROUPED AMOUNT IS NOT A THOUSAND TIMES TOO SMALL', () => {
  /* `sep` was the whole of the thousands rule and it defaulted to a comma, so `EGP 1.250` read as
     125 minor units — EGP 1.25 for EGP 1,250.00, on a row that still looks plausible. And `int` had
     no way to pass one at all, so `Quantity: 2.000` read as 2 while `1.500` read as null: the same
     declaration refusing one payload and silently mis-reading the next.

     07 §3's rule reads it off the digits: a lone separator followed by exactly three digits is
     grouping, and with two or more the last one that differs is the decimal point. */
  const money = (text: string, sep?: string) =>
    extractField({} as never, { money: { currency: 'EGP', ...(sep === undefined ? {} : { sep }) } } as never, text);

  assert.deepEqual(money('EGP 1.250'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 1,250'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 1250'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 1.250,00'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 1,250.00'), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(money('EGP 12,50'), { amount: 1250, currency: 'EGP' }, 'two digits after a lone mark is a decimal');
  // A declared separator still wins, because a caller who knows the locale knows better.
  assert.deepEqual(money('EGP 1.250', '.'), { amount: 125_000, currency: 'EGP' });
});

test('and an amount that would need rounding is refused', () => {
  /* 07 §3. `USD 10.5555` is not 1056 minor units; it is a payload whose pattern does not fit, and
     writing the rounded figure puts a number nobody sent into a ledger.

     `10.555` IS NOT THAT CASE, and the difference is the thousands rule doing its job: a lone
     separator followed by exactly THREE digits is grouping, so that is ten thousand five hundred and
     fifty-five. Four digits after a lone mark is a decimal, and 1055.55 minor units is not a number
     of minor units. */
  assert.deepEqual(extractField({} as never, { money: { currency: 'USD' } } as never, 'USD 10.555'), {
    amount: 1_055_500,
    currency: 'USD',
  });
  assert.equal(extractField({} as never, { money: { currency: 'USD' } } as never, 'USD 10.5555'), null);
  assert.deepEqual(extractField({} as never, { money: { currency: 'USD' } } as never, 'USD 10.55'), {
    amount: 1055,
    currency: 'USD',
  });
});

test('AND AN INTEGER READS ITS OWN GROUPING', () => {
  assert.equal(extractField({} as never, { int: {} } as never, 'Quantity: 2.000 units'), 2000);
  assert.equal(extractField({} as never, { int: {} } as never, 'Quantity: 1.500 units'), 1500);
  assert.equal(extractField({} as never, { int: {} } as never, 'Quantity: 2 units'), 2);
});
