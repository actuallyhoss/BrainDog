/**
 * What each pattern did with the last fourteen days, door by door (REC-A03 step 5): filed, skipped with its reason,
 * waiting, and one line for the texts no pattern read. The agent door reads it as `braindog:inbox/patterns`, and the
 * Inbox draws it under "What comes in".
 *
 * BEFORE: nothing said what a pattern did with the texts it was sent, so a pattern that read nothing, or skipped real
 * charges, looked exactly like one doing its job, until somebody counted the ledger against the phone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { patternReport } from '../src/ingest.ts';
import { CARD, CASH, NOW, record, text, used } from './ingest-tail-kit.ts';

test('EACH PATTERN BY ITS NAME, WITH ITS THREE COUNTS, and the door’s texts no pattern read', async () => {
  const r = await record(
    CARD({ description: 'Card texts', skip: [{ when: { field: 'body', contains: 'declined' }, reason: 'A declined charge moved no money.' }] }),
    { ...CASH, body: { ...(CASH.body as object), description: 'Cash texts' } } as never,
  );
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  /* A REPEAT, A DECLINE, A TEXT FOR A CARD NOBODY HOLDS, AND ONE NO PATTERN READS. */
  text(r.k, used('1234', 'NILE BOOKS', '40.00').replace('.', '. '));
  text(r.k, `${used('1234', 'HALDEN COFFEE', '3.00')} It was declined.`);
  text(r.k, used('9999', 'CEDAR LANE BAKERY', '8.00'));
  text(r.k, 'Your OTP for login is 551234. Do not share it.');

  const report = patternReport(r.sql, NOW, 14);
  assert.equal(report.days, 14);
  assert.equal(report.doors.length, 1);
  const [door] = report.doors;
  assert.equal(door!.said, 'Card texts');
  assert.equal(door!.unread, 1, 'the text no pattern read was not counted against its door');
  const card = door!.patterns.find((p) => p.ingest === 'bank-sms')!;
  assert.equal(card.said, 'Card texts');
  assert.equal(card.filed, 2);
  assert.equal(card.waiting, 1);
  assert.deepEqual(
    card.skipped.map((s) => [s.reason, s.n]).sort(),
    [
      ['A declined charge moved no money.', 1],
      ['Looks like a repeat of NILE BOOKS, EGP 40.00, 5 Oct.', 1],
    ],
  );
  /* A PATTERN THAT READ NOTHING IS STILL LISTED, by its name, with nothing against it. */
  const cash = door!.patterns.find((p) => p.ingest === 'bank-cash')!;
  assert.deepEqual([cash.said, cash.filed, cash.waiting, cash.skipped.length], ['Cash texts', 0, 0, 0]);

  /* THE WINDOW: fourteen days back from the reading, and nothing older. */
  const later = patternReport(r.sql, NOW + 15 * 86_400_000, 14);
  assert.deepEqual(
    later.doors.flatMap((d) => d.patterns.map((p) => p.filed + p.waiting + p.skipped.length)),
    [0, 0],
  );
  r.sql.close();
});

test('NAMES, NEVER IDS: a pattern with no description is said by its door’s, and a door with neither by a plain word', async () => {
  const r = await record(CARD({ description: undefined }));
  text(r.k, used('9999', 'CORNER SHOP', '1.00'));
  const [door] = patternReport(r.sql, NOW).doors;
  assert.equal(door!.said, 'A door with no name');
  assert.doesNotMatch(JSON.stringify(door!.patterns.map((p) => p.said)), /bank-sms/u);
  r.sql.close();
});
