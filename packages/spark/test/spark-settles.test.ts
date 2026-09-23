/**
 * Every call that reached a model settles a `call` row and counts, whatever the record does after it answered.
 *
 * SPK-1, AUDIT THIRTY #3. `look` drafted the predicate, then asked the record for the rows, and a refusal there was returned
 * before `accountRead` ran; `finally` then gave the hold back. The model had been called and paid for, and no row said so:
 * `46 §4.1` table, last line, "pass 1, the model answered and the rows projection was then refused by the record | none | 0".
 * A projection that THREW went the same way, and so did a `propose` with no `ask_id`, which drafts through the same path.
 * The proposal had the same shape one step further on: a `record.propose` that threw after the proposal's model answered
 * left `finally` to release that hold too.
 *
 * THE RECORD'S REFUSAL IS STILL THE ANSWER. The person asked a question the record would not project for; that sentence is
 * theirs to read and is returned as it was. What changes is that the ledger now holds the model call that preceded it.
 *
 * RED BEFORE THE REPAIR, MEASURED ON 23 SEPTEMBER: six tests, one pass, five fail. Cases 1 to 5 read no `call` row and
 * `asks.used` 0 (case 3 at `ask_cap: 1` answered the second read with a second model call). Case 6 passed before and after,
 * which is its job: a refusal BEFORE any model was called still gives the hold back.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf, no } from '@braindog/ports';

import { createSpark, type RecordApi } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const PREDICATE = JSON.stringify({
  registers: ['obligations'],
  where: { all: [{ field: 'state', is: 'open' }] },
  q: null,
});

const OPTIONS = JSON.stringify({
  text: 'Two are open: {{ref:obligations#7}} and {{ref:obligations#8}}.',
  body_kind: 'options',
  body: {
    options: [
      { id: 'a', label: 'Pay the rent first', because: 'It is the larger, {{ref:obligations#7}}.', recommended: true },
      { id: 'b', label: 'Pay the accountant first', because: 'It is due later.' },
    ],
  },
  flagged: false,
});

/** How the record answers the ROWS projection (the one naming registers); the index projection answers as the double does. */
type Rows = 'refuse' | 'throw' | 'answer';

const build = (rows: Rows, cap = 80) => {
  const sql = openSqlite();
  const inference = canned();
  const base = fakeRecord();
  let mode = rows;
  let index: 'refuse' | 'answer' = 'answer';
  const record: RecordApi & { rows(next: Rows): void; index(next: 'refuse' | 'answer'): void; throwOnPropose: boolean } = {
    throwOnPropose: false,
    rows: (next) => {
      mode = next;
    },
    index: (next) => {
      index = next;
    },
    project: (args, ctx) => {
      if (args.registers.length === 0) {
        if (index === 'refuse') return Promise.resolve(no('FORBIDDEN', 'The record would not say what lists it has.'));
        return base.project(args, ctx);
      }
      if (mode === 'refuse') return Promise.resolve(no('FORBIDDEN', 'The record would not project those rows.'));
      if (mode === 'throw') return Promise.reject(new Error('the record fell over mid-projection'));
      return base.project(args, ctx);
    },
    propose: (args, ctx) => {
      if (record.throwOnPropose) return Promise.reject(new Error('the record fell over while filing'));
      return base.propose(args, ctx);
    },
  };
  const spark = createSpark({ sql, clock: fixedClock(NOW), inference, record });
  assert.ok(spark.configure({ ask_cap: cap }, OWNER).ok);
  const calls = () =>
    sql
      .all<{ kind: string; status: string; code: string | null; model: string }>(
        'SELECT kind, status, code, model FROM call ORDER BY rowid',
      )
      .map((r) => ({ ...r }));
  return { sql, inference, record, spark, calls };
};

test('(1) A READ WHOSE ROWS THE RECORD REFUSED AFTER THE MODEL DRAFTED IS A ROW, AND AN ASK', async () => {
  const { sql, inference, spark, calls } = build('refuse');
  try {
    inference.say(PREDICATE);
    const out = await spark.read('what is still open', OWNER);

    assert.equal(codeOf(out), 'FORBIDDEN', 'the record refusal is no longer the answer');
    assert.equal(inference.seen.length, 1);
    assert.deepEqual(calls(), [{ kind: 'read', status: 'error', code: 'FORBIDDEN', model: 'glm-5.3-flash' }]);
    assert.equal(spark.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('(2) A PROJECTION THAT THREW AFTER THE MODEL DRAFTED STILL THROWS, AND THE CALL IS SETTLED UNDER RECORD_UNAVAILABLE', async () => {
  const { sql, inference, spark, calls } = build('throw');
  try {
    inference.say(PREDICATE);
    await assert.rejects(spark.read('what is still open', OWNER), /fell over mid-projection/u);

    assert.deepEqual(calls(), [{ kind: 'read', status: 'error', code: 'RECORD_UNAVAILABLE', model: 'glm-5.3-flash' }]);
    assert.equal(spark.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('(3) AT ask_cap 1, A READ THE RECORD REFUSED SPENDS THE MONTH, and the next ask reaches no model', async () => {
  const { sql, inference, spark } = build('refuse', 1);
  try {
    inference.say(PREDICATE);
    inference.say(PREDICATE);
    const said = [codeOf(await spark.read('what is still open', OWNER)), codeOf(await spark.read('what is still open', OWNER))];

    assert.deepEqual(said, ['FORBIDDEN', 'SPARK_BUDGET_SPENT']);
    assert.equal(inference.seen.length, 1, `${inference.seen.length} model calls at ask_cap 1`);
  } finally {
    sql.close();
  }
});

test('(4) A PROPOSE WITH NO ask_id DRAFTS THROUGH THE SAME PATH: its drafting call is settled, and the proposal it never made is given back', async () => {
  const { sql, inference, spark, calls } = build('refuse');
  try {
    inference.say(PREDICATE);
    const out = await spark.propose('what is still open', OWNER);

    assert.equal(codeOf(out), 'FORBIDDEN');
    assert.equal(inference.seen.length, 1);
    assert.deepEqual(calls(), [{ kind: 'read', status: 'error', code: 'FORBIDDEN', model: 'glm-5.3-flash' }]);
    assert.equal(spark.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('(5) A PROPOSAL WHOSE MODEL ANSWERED AND WHOSE FILING THEN THREW IS SETTLED, AND COUNTED', async () => {
  const { sql, inference, record, spark, calls } = build('answer');
  try {
    inference.say(PREDICATE);
    const first = await spark.read('what is still open', OWNER);
    assert.equal(first.ok, true, JSON.stringify(first));
    const askId = first.ok ? first.value.ask_id : '';

    record.throwOnPropose = true;
    inference.say(OPTIONS);
    await assert.rejects(spark.propose('what is still open', OWNER, undefined, askId), /fell over while filing/u);

    assert.deepEqual(calls(), [
      { kind: 'read', status: 'ok', code: null, model: 'glm-5.3-flash' },
      { kind: 'propose', status: 'error', code: 'RECORD_UNAVAILABLE', model: 'glm-5.3-flash' },
    ]);
    assert.equal(spark.status().asks.used, 2);
  } finally {
    sql.close();
  }
});

test('(6) A REFUSAL BEFORE ANY MODEL WAS CALLED STILL GIVES THE HOLD BACK: no row, no ask', async () => {
  const { sql, inference, record, spark, calls } = build('answer');
  try {
    record.index('refuse');
    const out = await spark.read('what is still open', OWNER);

    assert.equal(codeOf(out), 'FORBIDDEN');
    assert.equal(inference.seen.length, 0);
    assert.deepEqual(calls(), []);
    assert.equal(spark.status().asks.used, 0);
  } finally {
    sql.close();
  }
});
