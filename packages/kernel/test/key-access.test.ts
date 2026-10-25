/**
 * Keychain access (migration 46, `src/keychain.ts`): which machine may open which key, and the asks waiting on the owner.
 *
 * THE FIRST TEST IS THE ONE THAT MATTERS MOST: a key nobody set a rule on opens, which is every key there was before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KEY_ASK_LIFE_MS, openRecord, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const SIGNER = testSigner();
const NOW = Date.UTC(2026, 9, 26, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);

const KEY = 'e_01JZ8QK3F7R2M9V4XN6TCB5KEY';
const STUDIO = '0123456789abcdef';
const LAPTOP = 'fedcba9876543210';

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { sign: SIGNER });
  const made = k.createRecord({
    id: ID,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_1', name: 'Sam', email: 'sam@example.com' },
    keys: { record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' } },
  });
  assert.ok(made.ok);
  return { k, sql, clock };
}

const open = (k: Kernel, machine = STUDIO) => k.keyGate({ credential: KEY, machine, run: 'S4', spoken: 'credentials#3', machineName: 'Studio' }, 'S4');
const asks = (sql: NodeSql): number => Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM key_ask')?.n ?? 0);
const told = (sql: NodeSql): number => Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'note' AND actor LIKE 'key_ask:%'")?.n ?? 0);
const code = (gate: ReturnType<typeof open>): string => (gate.open ? 'open' : gate.refusal.code);

test('NO RULE IS ALWAYS: a key nobody set a rule on opens for every machine, and nothing is asked or written', async () => {
  const { k, sql } = await record();
  assert.deepEqual(open(k), { open: true });
  assert.deepEqual(open(k, LAPTOP), { open: true });
  assert.equal(asks(sql), 0);
  assert.equal(told(sql), 0);
  assert.deepEqual(k.keyAccess(), []);
  sql.close();
});

test('ASK, THEN ALLOW ONCE, THEN ASK AGAIN: the owner is told once, the answer is spent by one open, and the next asks', async () => {
  const { k, sql } = await record();
  k.setKeyAccess({ credential: KEY, machine: '*', rule: 'ask' }, 'p_1');

  const first = open(k);
  assert.equal(code(first), 'KEY_ASKED');
  assert.equal(first.open ? '' : first.refusal.at, 'credential');
  assert.equal(asks(sql), 1);
  assert.equal(told(sql), 1, 'the owner was not told');
  /* NEVER THE LABEL: the alert names the key by its spoken id and the machine by its name. */
  const note = sql.one<{ note: string }>("SELECT note FROM event WHERE actor LIKE 'key_ask:%'")!.note;
  assert.equal(note, 'Studio asks to use credentials#3');

  /* THE CLI TRIES AGAIN EVERY THREE SECONDS WHILE IT WAITS, and none of those tries asks again or tells him again. */
  assert.equal(code(open(k)), 'KEY_ASKED');
  assert.equal(code(open(k)), 'KEY_ASKED');
  assert.equal(asks(sql), 1);
  assert.equal(told(sql), 1, 'a try while waiting told the owner again');

  const [ask] = k.keyAsks();
  assert.equal(ask?.status, 'pending');
  assert.equal(ask?.machine, STUDIO);
  assert.equal(ask?.run, 'S4');
  const answered = k.answerKeyAsk({ id: ask!.id, answer: 'once' }, 'p_1');
  assert.ok(answered.ok && answered.value.status === 'once' && answered.value.answered_by === 'p_1');
  assert.deepEqual(k.keyAsks(), [], 'an answered ask is still waiting');

  assert.deepEqual(open(k), { open: true }, 'allowed once did not open');
  assert.equal(code(open(k)), 'KEY_ASKED', 'allowed once opened twice');
  assert.equal(asks(sql), 2);
  assert.equal(told(sql), 2);
  /* A SECOND PRESS ON THE OLD ALERT CHANGES NOTHING. */
  const again = k.answerKeyAsk({ id: ask!.id, answer: 'always' }, 'p_1');
  assert.equal(again.ok ? '' : 'refusal' in again ? again.refusal.code : '', 'FORBIDDEN');
  sql.close();
});

test('ALWAYS ALLOW writes the machine its own rule, so it opens from then on and another machine still asks', async () => {
  const { k, sql } = await record();
  k.setKeyAccess({ credential: KEY, machine: '*', rule: 'ask' }, 'p_1');
  assert.equal(code(open(k)), 'KEY_ASKED');
  assert.ok(k.answerKeyAsk({ id: k.keyAsks()[0]!.id, answer: 'always' }, 'p_1').ok);
  assert.deepEqual(open(k), { open: true });
  assert.deepEqual(open(k), { open: true });
  assert.deepEqual(
    k.keyAccess(KEY).map((r) => [r.machine, r.rule]),
    [['*', 'ask'], [STUDIO, 'always']],
  );
  assert.equal(code(open(k, LAPTOP)), 'KEY_ASKED', 'another machine was let through by an answer about this one');
  sql.close();
});

test('DENY: a rule refuses FORBIDDEN and asks nothing; an answer refuses the open it answered, then the next asks', async () => {
  const { k, sql } = await record();
  k.setKeyAccess({ credential: KEY, machine: STUDIO, rule: 'deny' }, 'p_1');
  const denied = open(k);
  assert.equal(code(denied), 'FORBIDDEN');
  assert.equal(denied.open ? '' : denied.refusal.at, 'credential');
  assert.equal(asks(sql), 0);
  assert.deepEqual(open(k, LAPTOP), { open: true }, "one machine's rule reached another");

  k.setKeyAccess({ credential: KEY, machine: STUDIO, rule: null }, 'p_1');
  k.setKeyAccess({ credential: KEY, machine: '*', rule: 'ask' }, 'p_1');
  assert.equal(code(open(k)), 'KEY_ASKED');
  assert.ok(k.answerKeyAsk({ id: k.keyAsks()[0]!.id, answer: 'deny' }, 'p_1').ok);
  assert.equal(code(open(k)), 'FORBIDDEN', 'a deny answer let the waiting open through');
  assert.equal(code(open(k)), 'KEY_ASKED', 'a deny answer refused for ever');
  sql.close();
});

test('AN ASK RUNS OUT after ten minutes, and the next try asks again and tells him again', async () => {
  const { k, sql, clock } = await record();
  k.setKeyAccess({ credential: KEY, machine: '*', rule: 'ask' }, 'p_1');
  assert.equal(code(open(k)), 'KEY_ASKED');
  clock.advance(KEY_ASK_LIFE_MS + 1);
  assert.deepEqual(k.keyAsks(), [], 'an ask past its life is still waiting');
  assert.equal(code(open(k)), 'KEY_ASKED');
  assert.equal(asks(sql), 2);
  assert.equal(told(sql), 2);
  assert.equal(k.keyAsks(true).length, 2, 'the recent asks are not kept');
  sql.close();
});

test('THE LOCK WINDOW IS FIFTEEN MINUTES UNTIL HE SETS ANOTHER, and a copy of the record carries neither table', async () => {
  const { k, sql } = await record();
  assert.equal(k.lockAfter(), 15);
  assert.equal(k.setLockAfter(5), 5);
  assert.equal(k.lockAfter(), 5);
  assert.deepEqual(
    sql.all<{ table_name: string; section: string }>("SELECT table_name, section FROM dog_section WHERE table_name IN ('key_access', 'key_ask') ORDER BY table_name").map((r) => ({ ...r })),
    [
      { table_name: 'key_access', section: 'local' },
      { table_name: 'key_ask', section: 'local' },
    ],
  );
  sql.close();
});
