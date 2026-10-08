/**
 * Every reason the kernel writes on an arrival it holds is words a person reads (REC-A03).
 *
 * THE REASON NAMED THE PATTERN BY ITS ID. "bank-from-out could not read account, on out of this one" was what the
 * owner's Inbox said under his own bank texts: a handle nobody chose for him to read, and two field ids joined by a
 * comma. Each held reason now says the pattern by its name (its description, else its add-on's title, else "the
 * pattern"), the fields by their labels and the row it resembles by its title.
 *
 * SO THIS WALKS EVERY WAY `arrive` HOLDS A TEXT that a declaration can reach: a field not found, a field a feed sent
 * and the pattern could not read, a guess, a pattern that waits for a person, one that proposes, a level of certainty the record does not know, a
 * routing table that takes none like it, a near copy of a row already there, and a list that would not take what was
 * read. Each reason is checked free of the pattern's id, any `list#n` handle, an em dash, and the words row and entity.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

/** An id no sentence could say by accident, so finding it in one is the id leaking and nothing else. */
const ID = 'bank-alert-x9';

const TRANSACTIONS: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', label: 'Shop', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'ref', label: 'Reference', type: 'text' },
      { id: 'on', label: 'Date', type: 'day' },
      { id: 'way', label: 'Which way', type: 'enum', values: ['in', 'out'] },
    ],
  } as never,
};

const READS = {
  merchant: { text: { between: ['at ', ' for'] } },
  amount: { money: { after: 'EGP', currency: 'EGP' } },
};

const MAIL = 'From BANK: a movement at Halden Coffee for EGP 2,500.00 on 99.99.2026 sideways - ref: none';

/** What the bank's own feed sends, which a pattern reads by `map:`: a date in a format the pattern does not read. */
const SENT = JSON.stringify({ data: { merchant: 'Halden Coffee', date: '29.08.2026' } });

/** The pattern, with `body` laid over it; a key `body` sets to `undefined` is left out, as a feed's `extract` is. */
const pattern = (body: Record<string, unknown>, described: boolean): Declaration => ({
  id: `ingest.${ID}`,
  kind: 'ingest',
  body: Object.fromEntries(
    Object.entries({
      ingest: ID,
      ...(described ? { description: 'Bank alerts' } : {}),
      channel: 'email',
      match: { all: [{ field: 'body', contains: 'from bank:' }] },
      extract: READS,
      writes: { register: 'transactions' },
      dedupe: ['merchant'],
      on_conflict: 'skip',
      ...body,
    }).filter(([, value]) => value !== undefined),
  ) as never,
});

/** A feed the pattern reads by `map:`, posted to its own door. */
const FEED = {
  channel: 'webhook',
  match: undefined,
  extract: undefined,
  map: {
    merchant: { path: 'data.merchant', type: 'text' },
    on: { path: 'data.date', type: 'day', format: 'YYYY-MM-DD' },
  },
};

/** Each way a text is held, as the pattern that holds it. `twice` arrives the mail a second time and reads that one. */
const WAYS: { way: string; body: Record<string, unknown>; twice?: boolean }[] = [
  { way: 'a field the text does not carry', body: { extract: { ...READS, ref: { text: { after: 'invoice: ' } } } } },
  { way: 'a field the text carries and the pattern cannot read', body: { extract: { ...READS, on: { date: { after: 'on ', format: 'YYYY-MM-DD' } } } } },
  { way: 'a field a feed sends and the pattern cannot read', body: FEED },
  { way: 'a guess', body: { extract: { ...READS, ref: { default: { value: 'none', of: { text: { after: 'invoice: ' } } } } } } },
  { way: 'a pattern that waits for a person', body: { writes: { register: 'transactions', confidence: 'needs-review' } } },
  { way: 'a guess under one that waits', body: { extract: { ...READS, ref: { default: { value: 'none', of: { text: { after: 'invoice: ' } } } } }, writes: { register: 'transactions', confidence: 'needs-review' } } },
  { way: 'a pattern that proposes', body: { writes: { register: 'transactions', confidence: 'proposed' } } },
  { way: 'a certainty the record does not know', body: { writes: { register: 'transactions', confidence: 'high' } } },
  {
    way: 'a routing table that takes none like it',
    body: { writes: { register: { by: ['amount.currency'], to: [{ when: ['USD'], register: 'transactions' }] } } },
  },
  { way: 'a near copy of a row already there', body: { on_conflict: 'review' }, twice: true },
  { way: 'a list that would not take what was read', body: { extract: { ...READS, way: { text: { between: ['2026 ', ' -'] } } } } },
];

async function held(body: Record<string, unknown>, described: boolean, twice = false): Promise<Arrived> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([TRANSACTIONS, pattern(body, described)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const fed = body.channel === 'webhook';
  const arrive = (sha256: string): Arrived => {
    const r = (
      fed
        ? k.arrive({ channel: 'webhook', ingest: ID, body: SENT, sha256, verified: true })
        : k.arrive({ channel: 'email', headers: { From: 'alerts@bank.example', Subject: 'Alert' }, body: MAIL, sha256 })
    ) as { ok: boolean; value: Arrived };
    assert.ok(r.ok, JSON.stringify(r));
    return r.value;
  };
  if (twice) arrive('first');
  const out = arrive('held');
  sql.close();
  return out;
}

const plain = (reason: string, way: string): void => {
  assert.ok(!reason.includes(ID), `${way}: the reason names the pattern by its id: ${reason}`);
  assert.doesNotMatch(reason, /\b[a-z_]+#\d+\b/u, `${way}: the reason names a row by its handle: ${reason}`);
  assert.ok(!reason.includes('—'), `${way}: the reason carries an em dash: ${reason}`);
  assert.doesNotMatch(reason, /\brows?\b/iu, `${way}: the reason says row: ${reason}`);
  assert.doesNotMatch(reason, /\bentit(y|ies)\b/iu, `${way}: the reason says entity: ${reason}`);
};

for (const { way, body, twice } of WAYS)
  test(`HELD BY ${way.toUpperCase()}, the reason says the pattern by its name and nothing a person did not choose`, async () => {
    const out = await held(body, true, twice);
    assert.ok(out.state === 'review' || out.state === 'proposed', `${way} was not held: ${out.state} ${out.reason}`);
    const reason = out.reason ?? '';
    plain(reason, way);
    assert.match(reason, /Bank alerts/u, `${way}: the reason does not name the pattern: ${reason}`);

    /* AND A PATTERN WITH NO NAME AT ALL IS "the pattern", never its id. */
    const bare = await held(body, false, twice);
    plain(bare.reason ?? '', way);
    assert.match(bare.reason ?? '', /\b[Tt]he pattern\b/u, `${way}: a pattern with no name is not called the pattern: ${bare.reason}`);
  });

test('THE STABLE PHRASES A CHECK MATCHES ARE KEPT, with the fields by their labels', async () => {
  assert.equal((await held(WAYS[0]!.body, true)).reason, 'Bank alerts could not read reference out of this one.');
  assert.equal((await held(WAYS[1]!.body, true)).reason, 'Bank alerts could not read date out of this one.');
  assert.equal(
    (await held(FEED, true)).reason,
    'Bank alerts found date in this one and could not make sense of it, so the format may have changed.',
  );
  assert.equal(
    (await held(WAYS[8]!.body, true)).reason,
    "Bank alerts read this one and found nowhere to file one with this amount's currency.",
  );
  /* THE VERB AFTER A NAME HAS NO PERSON, since a name like this one is plural: never "Bank alerts waits". */
  assert.equal(
    (await held(WAYS[4]!.body, true)).reason,
    'Bank alerts will not write anything it reads until somebody accepts it, so this one waits for a person.',
  );
  assert.equal(
    (await held(WAYS[7]!.body, true)).reason,
    'The level set on Bank alerts is not a confidence this record knows, so nothing from this one was written.',
  );
  assert.equal(
    (await held(WAYS[9]!.body, true, true)).reason,
    'This looks like Halden Coffee, with the same shop, so Bank alerts held it for a person rather than skip it or file it twice.',
  );
});
