/**
 * `model-answers` (PRF-A05 job 1): filed by the host from Slash's ledger and the dead model jobs, read back through the
 * kernel's own `signs`. A green week, a red week whose newest ask failed, a red week of a dead job quoting the
 * provider's words scrubbed, the 9-in-10 line, a hold in flight counted as nothing, and an empty ledger reading none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { ok } from '@braindog/ports';

import { fileModelSign, readModelSign, wordsOf, type ModelFault, type ModelSignKernel } from '../src/sign-model.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const HOUR = 3_600_000;

/** Slash's ledger as `packages/slash/src/call.ts` builds it, the columns this sign reads. */
const ledger = (sql: NodeSql) =>
  sql.exec(`CREATE TABLE IF NOT EXISTS slash_call (
    id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
    tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
    status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT)`);

let n = 0;
const ask = (sql: NodeSql, hoursAgo: number, status: 'ok' | 'nothing' | 'refused' | 'error', code: string | null = null, model = '@cf/meta/llama-3.1-8b') =>
  sql.exec(
    "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code) VALUES (?, ?, 'read', 'a', ?, 0, 0, 0, 0, ?, ?)",
    `c${++n}`,
    new Date(NOW - hoursAgo * HOUR).toISOString(),
    model,
    status,
    code,
  );

const fresh = async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  ledger(sql);
  return { sql, k };
};

const signOf = (k: Kernel) => {
  const all = k.signs();
  assert.ok(all.ok);
  return all.value.signs.find((s) => s.sign === 'model-answers')!;
};

/** The kernel with a `faults()` that answers these, as kernel-wire's verb does. */
const withFaults = (k: Kernel, faults: ModelFault[]): ModelSignKernel => ({ signRead: k.signRead, identity: k.identity, faults: () => ok({ faults }) });

const NO_ID = /\b[0-9A-HJKMNP-TV-Z]{26}\b|@cf\/|llama|tools#\d|\bc\d+\b/u;

test('AN EMPTY LEDGER READS NONE, never green, and so does a record with no ledger at all', async () => {
  const { sql, k } = await fresh();
  assert.equal(signOf(k).state, 'none', 'unfiled');
  assert.ok(fileModelSign(k, sql, NOW).ok);
  const s = signOf(k);
  assert.equal(s.state, 'none');
  assert.match(s.said, /No one asked/u);

  const bare = openSqlite();
  const k2 = await openRecord(bare, fixedClock(NOW));
  assert.equal(readModelSign(k2, bare, NOW).state, 'none', 'a record whose Slash never ran');
});

test('GREEN: every ask of the week answered, a refused draft counts as an answer, a hold in flight counts as nothing', async () => {
  const { sql, k } = await fresh();
  for (const h of [2, 20, 50, 90, 140]) ask(sql, h, 'ok');
  ask(sql, 30, 'refused', 'PROPOSAL_UNCITED');
  ask(sql, 1, 'error', 'SLASH_PENDING');
  ask(sql, 3, 'ok', null, '-');
  ask(sql, 8 * 24, 'error', 'INTERNAL');
  assert.ok(fileModelSign(k, sql, NOW).ok);
  const s = signOf(k);
  assert.equal(s.state, 'green', s.said);
  assert.equal(s.value, 6);
  assert.equal(s.said, 'The model answered all 6 asks this week.');
  assert.doesNotMatch([s.said, ...s.facts].join(' '), NO_ID);
});

test('RED: the newest ask failed, and the reading says how many and when the model last answered', async () => {
  const { sql, k } = await fresh();
  for (const h of [30, 50, 70, 90, 110, 130, 150, 160, 165]) ask(sql, h, 'ok');
  ask(sql, 2, 'error', 'UNREACHABLE');
  assert.ok(fileModelSign(k, sql, NOW, { lastFail: { raw: "No model answered for '@cf/meta/llama-3.1-8b': 5007 model unavailable at api.cloudflare.com", at: NOW - 2 * HOUR } }).ok);
  const s = signOf(k);
  assert.equal(s.state, 'red', 'nine of ten is not below nine in ten, but the newest failed');
  assert.match(s.said, /^The model did not answer 1 of 10 asks this week\. The last error: /u);
  assert.match(s.said, /model unavailable at the provider/u);
  assert.doesNotMatch([s.said, ...s.facts].join(' '), NO_ID);
  assert.ok(s.facts.some((f) => /last answered on 8 October/u.test(f)), s.facts.join(' | '));
  assert.doesNotMatch(s.said, /UNREACHABLE/u, 'a code is not a sentence');
});

test('THE 9-IN-10 LINE: 8 of 10 is red with the newest answered, 9 of 10 is green, 4 asks are too few to judge by share', async () => {
  const { sql, k } = await fresh();
  for (const h of [1, 10, 20, 30, 40, 50, 60, 70]) ask(sql, h, 'ok');
  ask(sql, 80, 'error', 'INTERNAL');
  ask(sql, 90, 'error', 'INTERNAL');
  assert.equal(readModelSign(k, sql, NOW).state, 'red');
  sql.exec("UPDATE slash_call SET status = 'ok' WHERE ts = ?", new Date(NOW - 80 * HOUR).toISOString());
  assert.equal(readModelSign(k, sql, NOW).state, 'green');

  const few = await fresh();
  for (const h of [1, 10]) ask(few.sql, h, 'ok');
  for (const h of [20, 30]) ask(few.sql, h, 'error', 'INTERNAL');
  assert.equal(readModelSign(few.k, few.sql, NOW).state, 'green', 'two of four with the newest answered');
});

test('RED: a dead model job with no ask at all, quoting the kept error scrubbed of keys, ids and hosts', async () => {
  const { sql, k } = await fresh();
  const dead: ModelFault = {
    kind: 'infer.resolve',
    said: 'BrainDog could not check for people who are here twice. It tries again tonight.',
    last_at: new Date(NOW - 5 * HOUR).toISOString(),
    error: "No model answered for '@cf/meta/llama-3.1-8b': the provider did not answer (api_key: sk-live-abcdef123456 at gateway.ai.cloudflare.com/v1/acct/run)",
  };
  const notify: ModelFault = { kind: 'notify.email', said: 'BrainDog could not send a letter.', last_at: dead.last_at, error: 'smtp down' };
  assert.ok(fileModelSign(withFaults(k, [notify, dead]), sql, NOW).ok);
  const s = signOf(k);
  assert.equal(s.state, 'red');
  assert.match(s.said, /^A model job stopped after every retry\. The last error: /u);
  assert.match(s.said, /the provider did not answer/u);
  assert.doesNotMatch(s.said, /sk-live|abcdef123456|cloudflare\.com|\/v1\//u);
  assert.doesNotMatch([s.said, ...s.facts].join(' '), NO_ID);
  assert.ok(s.facts.includes(dead.said));
  assert.ok(!s.facts.includes(notify.said), 'a letter is not a model job');
  assert.doesNotMatch(s.said, /—/u);
});

test('RED: asks in the last day and none answered, even with the week above the line', () => {
  const sql = openSqlite();
  ledger(sql);
  for (let h = 30; h < 160; h += 10) ask(sql, h, 'ok');
  ask(sql, 3, 'error', 'INTERNAL');
  ask(sql, 2, 'error', 'INTERNAL');
  const kernel: ModelSignKernel = { signRead: () => ok({ sign: 'model-answers', day: '2026-10-09' }) };
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'The model did not answer 2 of 15 asks this week. The provider gave no reason that could be kept.');
});

test('THE WORDS: nothing left of a key is null, and a long sentence is cut', () => {
  assert.equal(wordsOf('sk-live-abcdefghijklmnop1234'), null);
  assert.equal(wordsOf('Rate limited — try again in 30s'), 'Rate limited, try again in 30s');
  assert.ok((wordsOf('word '.repeat(80)) ?? '').length <= 140);
});

test('THROUGH THE KERNEL’S OWN FAULTS: a dead resolve job raised on the record turns the sign red, and clearing it turns it back', async () => {
  const { raiseFault, clearFault } = await import('../../kernel/src/fault.ts');
  const { sql, k } = await fresh();
  for (const h of [2, 20, 50, 90, 140]) ask(sql, h, 'ok');
  assert.equal(readModelSign(k, sql, NOW).state, 'green');
  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', 'the provider did not answer', NOW - HOUR);
  const r = readModelSign(k, sql, NOW);
  assert.equal(r.state, 'red', r.said);
  assert.equal(r.said, 'The model answered 5 of 5 asks this week, but a model job stopped after every retry. The last error: the provider did not answer.');
  clearFault(sql, 'outbox#infer.resolve', NOW);
  assert.equal(readModelSign(k, sql, NOW).state, 'green');
});

test('THE WORDS: a JSON answer gives its message, and an address, a port, a handle or an emptied request id is not quoted', () => {
  assert.equal(wordsOf('{"errors":[{"message":"Authentication error","code":10000}],"success":false}'), 'Authentication error');
  assert.equal(wordsOf('fetch failed: connect ECONNREFUSED 10.0.0.5:443'), 'fetch failed: connect ECONNREFUSED the provider');
  assert.equal(wordsOf('Capacity temporarily exceeded, please try again. (request 01J9ZQ4M2X8K7P3R5T6V8W9Y0A)'), 'Capacity temporarily exceeded, please try again.');
  assert.doesNotMatch(wordsOf('tools#8 failed: model overloaded') ?? '', /tools#8/u);
});
