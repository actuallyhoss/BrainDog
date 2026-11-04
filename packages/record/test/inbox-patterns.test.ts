/**
 * `inboxPatterns` and `fileAsSecond`, the record's doors to what each pattern did and to "It is a second one" (REC-A03
 * steps 3 and 5).
 *
 * BEFORE: the kernel counted what each pattern filed, skipped and held (`patternReport`) and could file a repeat after
 * all (`fileAsSecond`), and nothing above the kernel called either, so no screen, agent or check could read the one or
 * press the other. A bank pattern that read nothing looked exactly like one doing its job.
 *
 * EVERY VALUE IS INVENTED: the kit's card wording with made-up shops, amounts and digits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import type { Arrived, PatternReport } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { ACCOUNTS, CARD, LEDGER, NOW, used } from '../../kernel/test/ingest-tail-kit.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_2', scope: 'read', person: 'p_1', level: 'owner' } };
const reach: CallContext = { principal: { kind: 'token', id: 't_3', scope: 'read', person: 'p_1', level: 'owner', reach: ['inbox'] } };

type Answer<T> = { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Answer<T>;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown) => {
  const x = r as Answer<unknown>;
  assert.equal(x.ok, false, JSON.stringify(x));
  return x.refusal!;
};

/** A record with a card ending 1234 and the card pattern, its repeat check on amount and card, and three texts sent. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const k = api.kernel;
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const installed = await k.install([ACCOUNTS, LEDGER, CARD({ description: 'Card texts', dedupe: ['amount', 'account'] })]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const card = value<{ id: string }>(k.create('accounts', { name: 'Credit Card', kind: 'card', last4: '1234', balance: { amount: 0, currency: 'EGP' } }, { actor: 'p_1' }));
  clock.advance(60 * 60_000);
  const send = (body: string): Arrived => value<Arrived>(k.arrive({ channel: 'webhook', ingest: 'bank-sms', body, sha256: randomUUID(), verified: true }));
  const first = send(used('1234', 'Corner Shop', '120.00', '07/10/2026'));
  const again = send(used('1234', 'Corner Shop', '120.00', '08/10/2026'));
  send('Your OTP for login is 551234. Do not share it.');
  return { api, sql, card: card.id, first, again };
}

test('WHAT EACH PATTERN DID, by its name, with what it filed, skipped with its reason, and what no pattern read', async () => {
  const { api, sql, first, again } = await record();
  assert.equal(first.state, 'matched');
  assert.equal(again.state, 'skipped');
  const report = value<PatternReport>(await api.inboxPatterns({}, owner));
  assert.equal(report.days, 14);
  const [door] = report.doors;
  assert.equal(door!.said, 'Card texts');
  assert.equal(door!.unread, 1, 'the text no pattern read is counted on its door');
  const [card] = door!.patterns;
  assert.deepEqual([card!.said, card!.filed, card!.waiting], ['Card texts', 1, 0]);
  assert.deepEqual(card!.skipped, [{ reason: 'Looks like a repeat of Corner Shop, EGP 120.00, 7 Oct.', n: 1 }]);
  /* NAMES, NEVER IDS, in every sentence a person reads from it. */
  const said = JSON.stringify(report.doors.map((d) => [d.said, d.patterns.map((p) => [p.said, p.skipped.map((s) => s.reason)])]));
  assert.doesNotMatch(said, /bank-sms|transactions|#\d|—/u);
  /* THE WINDOW IS THE CALLER'S, and nothing older than it is counted. */
  assert.equal(value<PatternReport>(await api.inboxPatterns({ days: 30 }, owner)).days, 30);
  sql.close();
});

test('THE REACH IS THE INBOX’S: an owner, a token given the inbox, and nobody held to part of the record', async () => {
  const { api, sql } = await record();
  assert.equal(refusal(await api.inboxPatterns({}, token)).code, 'FORBIDDEN', 'a token its owner did not give the inbox');
  assert.equal(value<PatternReport>(await api.inboxPatterns(undefined, reach)).doors.length, 1);
  const narrow = refusal(await api.inboxPatterns({}, { ...reach, registers: ['transactions'] }));
  assert.equal(narrow.code, 'FORBIDDEN');
  assert.match(narrow.fix, /all of this BrainDog/u);
  /* THE ARGUMENT IS HELD TO WHAT IT IS, and never quietly read as 14. */
  for (const days of [0, 1.5, 400, '14'])
    assert.equal(refusal(await api.inboxPatterns({ days } as never, owner)).code, 'VALUE_MALFORMED', String(days));
  assert.equal(refusal(await api.inboxPatterns({ state: 'skipped' } as never, owner)).code, 'FIELD_UNKNOWN');
  sql.close();
});

test('IT IS A SECOND ONE: one press files the repeat beside the first, a second press files nothing', async () => {
  const { api, sql, again } = await record();
  assert.equal(api.kernel.count('transactions'), 1);
  const filed = value<Arrived>(await api.fileAsSecond({ id: again.raw }, owner));
  assert.equal(filed.state, 'matched');
  assert.equal(api.kernel.count('transactions'), 2, 'two real charges, two movements');
  const twice = refusal(await api.fileAsSecond({ id: again.raw }, owner));
  assert.deepEqual([twice.code, twice.at], ['OUT_OF_BOUNDS', 'id'], 'the refusal names the field the caller sent');
  assert.equal(api.kernel.count('transactions'), 2);
  /* AND THE REPORT SAYS SO: the pattern filed two and skipped none. */
  const [card] = value<PatternReport>(await api.inboxPatterns({}, owner)).doors[0]!.patterns;
  assert.deepEqual([card!.filed, card!.skipped.length], [2, 0]);
  sql.close();
});

test('THE PRESS IS AN OWNER’S IN A BROWSER, as filing from the inbox is, and names the message it files', async () => {
  const { api, sql, again } = await record();
  assert.equal(refusal(await api.fileAsSecond({ id: again.raw }, reach)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.fileAsSecond({ id: again.raw }, { ...owner, registers: ['transactions'] })).code, 'FORBIDDEN');
  assert.equal(refusal(await api.fileAsSecond({} as never, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.fileAsSecond({ id: again.raw, register: 'transactions' } as never, owner)).code, 'FIELD_UNKNOWN');
  assert.equal(api.kernel.count('transactions'), 1, 'nothing refused wrote anything');
  sql.close();
});
