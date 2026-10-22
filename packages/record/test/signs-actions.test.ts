/**
 * The record's briefing names the signs of what runs by itself and what arrives (SHL-C01 job 4): a paused action, a job
 * that stopped after failing and a message nothing verified each reach `context` as a red sign, by name and sentence,
 * through `redSigns` and the kernel's closed list with no line of the record's own. And the `signs` read answers them.
 *
 *   node --test packages/record/test/signs-actions.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ActionAnswer, Declaration } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { UNVERIFIED } from '../../kernel/src/ingest.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 5, 12);
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);
const iso = (ms: number): string => new Date(ms).toISOString();

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' },
  session: { client_id: 'claude-run-1', agent: 'claude', host: 'dev-pc', repo: 'kiln' },
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const POLL: Declaration = {
  id: 'ingest.balance',
  kind: 'ingest',
  body: {
    ingest: 'balance',
    channel: 'poll',
    description: 'Oxbow revenue',
    url: 'https://api.example.test/v1/balance',
    every: '1h',
    grant: 'example read',
    project: 'studio',
    extract: { what: { after: 'balance ' } },
    writes: { register: 'notes' },
  } as never,
};

const refused: ActionAnswer = { status: 401, body: 'no', bytes: 2, ms: 3, requests: 1 };

/** A record whose poll was refused and paused, whose weekly digest died, and where a message came in unverified. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const k = api.kernel;
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  assert.ok(k.bindGrant({ label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1').ok);
  const out = await k.install([NOTES, POLL]);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal((await k.runActions(async () => refused)).paused, 1);
  /* WRITTEN AS `schedule.ts`'s ladder leaves a job at its end, and as `ingest.ts` keeps an arrival nothing vouched for. */
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('01JZ8QK3F7R2M9V4XN6TCBDEAD', ?, 'reminder', 'weekly', '{}', 'failed', 8)", iso(NOW - 3_600_000));
  sql.exec("INSERT INTO inbox_raw (id, ts, channel, body, sha256, state, reason) VALUES ('01JZ8QK3F7R2M9V4XN6TCBRAW1', ?, 'webhook', 'hello', 'forged-1', 'untriaged', ?)", iso(NOW - 60_000), UNVERIFIED);
  return { api, sql };
}

const EXPECTED = [
  { name: 'No scheduled action is paused', said: '1 action is paused and will not run until somebody resumes it: Oxbow revenue.' },
  { name: 'Nothing that runs by itself has died', said: '1 job that runs by itself has stopped after failing: A reminder. The operator has been told.' },
  { name: 'Every arrival is verified', said: '1 message in 7 days came in that nothing verified, so no pattern was offered it.' },
];

test('THE BRIEFING NAMES THEM: the owner and her agent are each told the paused action, the dead job and the unverified message', async () => {
  const { api, sql } = await record();
  for (const who of [owner, agent]) {
    const told = await api.context({}, who);
    assert.ok(told.ok, JSON.stringify(told));
    const signs = told.value.signs;
    for (const want of EXPECTED)
      assert.ok(signs.some((s) => s.name === want.name && s.said === want.said), `${want.name} is not in the briefing: ${JSON.stringify(signs)}`);
    for (const s of signs) assert.doesNotMatch(s.said, /[—]|\b[0-9A-HJKMNP-TV-Z]{26}\b|example\.test|\brow\b/, s.said);
  }
  sql.close();
});

test('THE SIGNS READ answers the five, and a record with nothing scheduled and nothing arrived reads none on each', async () => {
  const { api, sql } = await record();
  const out = await api.signs({}, owner);
  assert.ok(out.ok, JSON.stringify(out));
  const all = (out.value as { signs: { sign: string; state: string }[] }).signs;
  const state = (id: string) => all.find((s) => s.sign === id)?.state;
  assert.deepEqual(['actions-paused', 'schedule-failed', 'arrivals-unverified'].map(state), ['red', 'red', 'red']);
  sql.close();

  const blank = openSqlite();
  const fresh = await createRecordApi({ sql: blank, clock: fixedClock(NOW) });
  const none = await fresh.signs({}, owner);
  assert.ok(none.ok, JSON.stringify(none));
  const quiet = (none.value as { signs: { sign: string; state: string }[] }).signs;
  for (const id of ['actions-paused', 'actions-held', 'schedule-failed', 'doors-silent', 'arrivals-unverified'])
    assert.equal(quiet.find((s) => s.sign === id)?.state, 'none', `${id} is not none on an empty record`);
  blank.close();
});
