/**
 * The host's own model, handed in for one ask, so the host can key it for the person asking.
 *
 * WHY THIS FILE EXISTS. `createSpark` takes one `inference` for the life of the engine, and the host builds that once with
 * nobody asking. Where the host's model is keyed from the vault, every opening of that key is a `grant.read` event, and
 * with one engine-wide adapter the owner's own read was logged `system`
 * (`apps/selfhost/test/spark-included-guard.test.ts`, "THE OWNER'S OWN READ IS SIGNED BY HER"). `propose` already took a
 * per-call adapter for tier `b`'s key; `read` took none, so the one place the asker could have been named was not there.
 *
 * THE TWO ASKS IN FLIGHT ARE THE POINT OF THE SECOND CASE. A slot the host sets before calling `read` and clears after
 * would do for one ask at a time, and two asks awaiting the model together would cross, one person's key opened in the
 * other's name. An argument is scoped to its call by construction, and this measures that it is.
 *
 * RED BEFORE THE REPAIR, measured on 22 September: `read` ignored its third argument, so the first case saw the draft on
 * the engine's adapter (`fallback 1, per call 0`) and the second saw both drafts there.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSpark, type Inference } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, MEMBER, openSqlite } from './double.ts';

const PREDICATE = JSON.stringify({
  registers: ['obligations'],
  where: { all: [{ field: 'state', is: 'open' }] },
  q: null,
});

const PROPOSAL = JSON.stringify({
  text: 'Two are open: {{ref:obligations#7}} and {{ref:obligations#8}}.',
  body_kind: 'query',
  body: {},
  flagged: false,
});

/** A canned model that answers after `ms`, so two asks are both awaiting it at once. */
const slow = (ms: number) => {
  const inner = canned();
  const adapter: Inference & { seen: typeof inner.seen; say: typeof inner.say } = {
    seen: inner.seen,
    say: inner.say,
    complete: async (call) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return inner.complete(call);
    },
  };
  return adapter;
};

test('A READ HANDED AN INFERENCE DRAFTS ON IT, and the engine-wide one is not called', async () => {
  const sql = openSqlite();
  const fallback = canned();
  const spark = createSpark({ sql, clock: fixedClock(NOW), inference: fallback, record: fakeRecord() });
  try {
    const mine = canned();
    mine.say(PREDICATE);
    const out = await spark.read('what is still open', OWNER, mine);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual([fallback.seen.length, mine.seen.length], [0, 1], `fallback ${fallback.seen.length}, per call ${mine.seen.length}`);
    /* STILL AN ASK ON THE METER: the adapter changes who is named on the key, not what the month has spent. */
    assert.equal(spark.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('TWO READS IN FLIGHT TOGETHER EACH DRAFT ON THEIR OWN INFERENCE, so one asker never opens the other one\'s key', async () => {
  const sql = openSqlite();
  const fallback = canned();
  const spark = createSpark({ sql, clock: fixedClock(NOW), inference: fallback, record: fakeRecord() });
  try {
    /* THE FIRST IS THE SLOWER, so it is still awaiting its model when the second starts and finishes. */
    const hers = slow(30);
    const his = slow(5);
    hers.say(PREDICATE);
    his.say(PREDICATE);
    const [a, b] = await Promise.all([spark.read('what is still open', OWNER, hers), spark.read('what is still open', MEMBER, his)]);
    assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
    assert.deepEqual([fallback.seen.length, hers.seen.length, his.seen.length], [0, 1, 1]);
  } finally {
    sql.close();
  }
});

test('A PROPOSE HANDED AN INFERENCE DRAFTS AND PROPOSES ON IT on tier a, where both calls are the host model', async () => {
  const sql = openSqlite();
  const fallback = canned();
  const spark = createSpark({ sql, clock: fixedClock(NOW), inference: fallback, record: fakeRecord() });
  try {
    const mine = canned();
    mine.say(PREDICATE);
    mine.say(PROPOSAL);
    const out = await spark.propose('what is still open', OWNER, undefined, undefined, mine);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual([fallback.seen.length, mine.seen.length], [0, 2]);
  } finally {
    sql.close();
  }
});

test("ON TIER b THE PROPOSAL STAYS ON byok, and only the draft before it takes the host's per-call inference", async () => {
  const sql = openSqlite();
  const fallback = canned();
  const spark = createSpark({ sql, clock: fixedClock(NOW), inference: fallback, record: fakeRecord() });
  try {
    assert.ok(spark.configure({ tier: 'b', grant_id: 'g_01JZ8QK3F7R2M9V4XN6TCB5HAD', model: 'gpt-4o-mini' }, OWNER).ok);
    const host = canned();
    const byok = canned();
    host.say(PREDICATE);
    byok.say(PROPOSAL);
    const out = await spark.propose('what is still open', OWNER, byok, undefined, host);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual([fallback.seen.length, host.seen.length, byok.seen.length], [0, 1, 1]);
  } finally {
    sql.close();
  }
});
