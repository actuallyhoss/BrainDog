/**
 * An automation's question that reached no model spends none of `ask_cap`, on any tier, and one the model did answer
 * still does.
 *
 * `loop/research-batch-forty-two-audit.md` FINDING 6. `answer` holds its row before the call and settled it, on
 * `UNREACHABLE`, as an error under the model's name, and both counts (the package's tier `a` count and this host's
 * `drafted()` for `b` and `byo`) pass over a row only when its model is `-`. Measured by the audit on 23 September with a
 * real `createSpark` behind `sparkGuardedEngine` at `ask_cap: 3` and an inference throwing `ECONNREFUSED`: on tiers `a`
 * and `b` the four asks answered `UNREACHABLE` three times and then `SPARK_BUDGET_SPENT`.
 *
 * THE SCALE, AS THE AUDIT'S CHECKER CORRECTED IT. `serveAsks` acks `UNREACHABLE` as `failed`, so the outbox asks again up
 * to its eighth rung, and the ladder doubles: a fifteen-minute clock rule through a two-hour outage is about forty asks
 * that reached nothing, by that arithmetic and not by a run. That is half the default cap of 80, not a spent one; what
 * spends it is a longer outage, a second rule or the owner's own reads in the meantime, and then his reads are refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sparkGuardedEngine, type SparkInference } from '../src/spark.ts';
import type { SparkAsk } from '../src/spark-answers.ts';
import { createSpark } from '../../spark/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const ASK: SparkAsk = { run: 'r_1', step: 0, rule: 'rate', question: 'What rate?', shape: 'number' };

const DOWN: SparkInference = {
  complete: async () => {
    throw new Error('connect ECONNREFUSED');
  },
};
const UP: SparkInference = { complete: async () => ({ text: '{"answer":4}', usage: { in: 12, out: 3 } }) };
const WRONG: SparkInference = { complete: async () => ({ text: '{"answer":"four"}', usage: { in: 12, out: 3 } }) };

/** A real Spark on its own SQLite at `tier` and `ask_cap: 3`, behind this host's guard, as the audit's probe built it. */
function sparkAt(tier: 'a' | 'b' | 'byo') {
  const sql = openSqlite();
  const spark = createSpark({ sql, clock: fixedClock(NOW), inference: DOWN, record: {} as never });
  sql.exec(
    'UPDATE settings SET tier = ?, model = ?, grant_id = ?, ask_cap = 3',
    tier,
    tier === 'a' ? null : 'llama3:8b',
    tier === 'b' ? 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE' : null,
  );
  const guarded = sparkGuardedEngine(spark as never, { sql, clock: fixedClock(NOW), grants: () => [] }) as unknown as {
    answer(ask: SparkAsk, inference?: SparkInference): Promise<{ ok: boolean; refusal?: { code: string } }>;
  };
  return { guarded, sql };
}

const codeOf = (out: { ok: boolean; refusal?: { code: string } }): string => (out.ok ? 'ok' : (out.refusal?.code ?? '?'));

for (const tier of ['a', 'b', 'byo'] as const)
  test(`on tier ${tier} at ask_cap 3, four unanswered asks spend nothing and the fifth reaches the model`, async () => {
    const { guarded, sql } = sparkAt(tier);
    const said: string[] = [];
    for (let i = 0; i < 4; i++) said.push(codeOf(await guarded.answer(ASK, DOWN)));
    said.push(codeOf(await guarded.answer(ASK, UP)));
    assert.deepEqual(said, ['UNREACHABLE', 'UNREACHABLE', 'UNREACHABLE', 'UNREACHABLE', 'ok']);

    /* THE ROWS STAY, so a month of outages is still in the ledger, under the mark for a row that called nothing. */
    const rows = sql.all<{ model: string; status: string; code: string | null }>('SELECT model, status, code FROM call ORDER BY id');
    assert.deepEqual(
      rows.filter((r) => r.code === 'UNREACHABLE').map((r) => [r.model, r.status]),
      Array.from({ length: 4 }, () => ['-', 'error']),
    );
  });

test('AN ANSWER THE MODEL DID GIVE STILL SPENDS AN ASK, though it was the wrong shape', async () => {
  const { guarded } = sparkAt('a');
  const said: string[] = [];
  for (let i = 0; i < 4; i++) said.push(codeOf(await guarded.answer(ASK, WRONG)));
  assert.deepEqual(said, ['PROPOSAL_SCHEMA', 'PROPOSAL_SCHEMA', 'PROPOSAL_SCHEMA', 'SPARK_BUDGET_SPENT']);
});
