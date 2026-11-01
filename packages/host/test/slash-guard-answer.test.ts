/**
 * `slashGuardedEngine`'s `answer` (`src/slash.ts`): `byo`'s monthly cap, held for an automation's question as it is for a
 * person's read. Tier `b` was held to it too until it became his own key, whose asks are listed and not capped.
 *
 * THE GUARD WRAPPED `read` AND `propose` AND NOTHING ELSE, so a method the package gained reached the engine unguarded
 * through the prototype `Object.create` leaves. The package counts tier `a` alone (`packages/slash/src/propose.ts`,
 * `s.tier !== 'a'` returns no refusal), so on `b` and `byo` a clock rule would have asked this host's model every fifteen
 * minutes with nothing standing in front of it. Run before the guard named `answer`: the two tier cases below failed, each
 * with the fake engine called once where the cap allowed none.
 *
 * THE ENGINE IS A FAKE AND THE LEDGER IS REAL. `@braindog/slash` gained `answer` separately, so a package
 * before it has none to wrap; the guard reads Slash's own `slash_settings` and `slash_call` tables, so those are the package's DDL on real
 * SQLite, imported by a relative path as `slash.test.ts` imports `createSlash`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CallContext } from '@braindog/record';
import type { Result } from '@braindog/ports';

import { slashGuardedEngine, type SlashInference } from '../src/slash.ts';
import type { SlashAsk } from '../src/slash-answers.ts';
import { DDL } from '../../slash/src/call.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const ASK: SlashAsk = { run: 'r_1', step: 1, rule: 'rate', question: 'What rate for Acme Ltd?', shape: 'number', about: { client: 'Acme Ltd' } };
const INFERENCE: SlashInference = { complete: async () => ({ text: '{"answer":4}', usage: { in: 1, out: 1 } }) };

/** Slash's SQLite at `tier`, `ask_cap`, with `reads` model calls already made this month on that tier. */
function ledger(tier: 'a' | 'b' | 'byo', askCap: number, reads: number) {
  const sql = openSqlite();
  for (const statement of DDL) sql.exec(statement);
  sql.exec(
    'INSERT INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
    tier,
    tier === 'a' ? null : 'llama3:8b',
    tier === 'b' ? 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE' : null,
    askCap,
    new Date(NOW).toISOString(),
  );
  for (let i = 0; i < reads; i++)
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, predicate)
       VALUES (?, ?, 'read', ?, 'glm-5.3-flash', 10, 10, 0, 5, 'ok', '{}')`,
      `c_${i}`,
      new Date(NOW - 60_000).toISOString(),
      tier,
    );
  return sql;
}

/** The package's engine as far as the guard reads it, with `answer` counting what reaches it. */
function engineOf() {
  const reached: { ask: SlashAsk; inference: SlashInference | undefined }[] = [];
  const engine = {
    status: () => ({ asks: { used: 0, cap: 0 } }),
    read: async (_question: string, _ctx: CallContext): Promise<Result<unknown>> => ({ ok: true, value: null }),
    propose: async (): Promise<Result<unknown>> => ({ ok: true, value: null }),
    configure: (): Result<unknown> => ({ ok: true, value: null }),
    answer: async (ask: SlashAsk, inference?: SlashInference): Promise<Result<{ text: string }>> => {
      reached.push({ ask, inference });
      return { ok: true, value: { text: '4' } };
    },
  };
  return { engine, reached };
}

const guardOf = (tier: 'a' | 'b' | 'byo', askCap: number, reads: number) => {
  const { engine, reached } = engineOf();
  const sql = ledger(tier, askCap, reads);
  const guarded = slashGuardedEngine(engine, { sql, clock: fixedClock(NOW), grants: () => [] });
  return { guarded, reached, sql };
};

test('on tier byo at ask_cap 1 with one read made, answer refuses SLASH_BUDGET_SPENT without calling through', async () => {
  const { guarded, reached } = guardOf('byo', 1, 1);
  const out = await guarded.answer(ASK, INFERENCE);
  assert.equal(reached.length, 0);
  assert.deepEqual(out, {
    ok: false,
    refusal: {
      code: 'SLASH_BUDGET_SPENT',
      fix: "rule.rate asked Slash at step 2, and this month's Slash questions are used until 1 October. Raise the monthly limit, or wait.",
    },
  });
});

/* ON HIS OWN KEY NOTHING IS CAPPED: his provider bills the ask, so the guard lists it
   and stands aside, as it does on tier `a`, where the package holds the cap itself. Before his own key replaced the host's
   drafting on tier `b`, this case was the refusal above. */
test('on his own key, tier b, at ask_cap 1 with one read made, the guard calls through: his asks are listed and not capped', async () => {
  const { guarded, reached } = guardOf('b', 1, 1);
  const out = await guarded.answer(ASK, INFERENCE);
  assert.deepEqual(out, { ok: true, value: { text: '4' } });
  assert.equal(reached.length, 1);
});

test('under the cap the guard calls through, with the job and the inference it was handed', async () => {
  const { guarded, reached } = guardOf('byo', 2, 1);
  const out = await guarded.answer(ASK, INFERENCE);
  assert.deepEqual(out, { ok: true, value: { text: '4' } });
  assert.equal(reached.length, 1);
  assert.equal(reached[0]!.ask, ASK);
  assert.equal(reached[0]!.inference, INFERENCE);
});

test('on tier a the guard stands aside, because the package holds that cap itself', async () => {
  const { guarded, reached } = guardOf('a', 1, 1);
  await guarded.answer(ASK, INFERENCE);
  assert.equal(reached.length, 1);
});

test("an answer's own ledger row, kind read with no predicate, is spent from the same count as a person's read", async () => {
  /* THE PACKAGE WRITES THE ROW AS `read` AND NOT A NEW KIND, and this pins the half of that choice the guard relies on:
     `drafted()` counts it. */
  const { guarded, reached, sql } = guardOf('byo', 1, 0);
  sql.exec(
    `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, question)
     VALUES ('c_answer', ?, 'read', 'byo', 'glm-5.3-flash', 10, 10, 0, 5, 'ok', 'rule.rate step 2')`,
    new Date(NOW - 1_000).toISOString(),
  );
  const out = await guarded.answer(ASK, INFERENCE);
  assert.equal(out.ok, false);
  assert.equal(reached.length, 0);
  assert.equal((guarded.status() as { asks: { used: number } }).asks.used, 1);
  const read = await guarded.read('what is due?', { principal: { kind: 'person', id: 'p_owner', level: 'owner' } } as CallContext);
  assert.equal(read.ok, false);
});

test('an engine with no answer is left with none, so a host on a package before answer keeps its shape', () => {
  const { engine } = engineOf();
  const { answer: _answer, ...before } = engine;
  const guarded = slashGuardedEngine(before, { sql: ledger('b', 1, 1), clock: fixedClock(NOW), grants: () => [] });
  assert.equal('answer' in guarded, false);
});
