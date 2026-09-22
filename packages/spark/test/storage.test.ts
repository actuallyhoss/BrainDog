/**
 * `createSpark` over storage that refuses a pragma, which is what a Durable Object's storage is.
 *
 * WHY A WRAPPER AND NOT WORKERD. The fault was measured in workerd (`loop/research-spark-seam.md` §4):
 * a bare DO SQLite ran `CREATE TABLE IF NOT EXISTS` and answered `not authorized: SQLITE_AUTH` to
 * `PRAGMA user_version = 1`, and the real `createSpark` bundled by wrangler threw that same sentence
 * out of its constructor. `node:sqlite` has no authorizer, which is how every test in this package
 * passed on storage the Worker does not run on. The wrapper refuses exactly what the authorizer
 * refused, with the same words, so this file fails for the reason production would and in a
 * millisecond. `apps/worker/test/spark-in-do.test.ts` is the same claim driven through workerd.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Param } from '@braindog/ports';

import { createSpark } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite, type TestSql } from './double.ts';

/** `openSqlite()` with a Durable Object's authorizer in front of it, as far as a pragma is concerned. */
const authorized = (): TestSql & { refused: string[] } => {
  const inner = openSqlite();
  const refused: string[] = [];
  const guard = (text: string): void => {
    if (/^\s*PRAGMA/i.test(text)) {
      refused.push(text);
      throw new Error('not authorized: SQLITE_AUTH');
    }
  };
  return {
    refused,
    close: () => inner.close(),
    exec(text: string, ...params: Param[]) {
      guard(text);
      inner.exec(text, ...params);
    },
    all(text: string, ...params: Param[]) {
      guard(text);
      return inner.all(text, ...params);
    },
    one(text: string, ...params: Param[]) {
      guard(text);
      return inner.one(text, ...params);
    },
    transactionSync: (fn) => inner.transactionSync(fn),
  } as TestSql & { refused: string[] };
};

const PREDICATE = JSON.stringify({
  registers: ['obligations'],
  where: { all: [{ field: 'state', is: 'open' }] },
  q: null,
});

test('createSpark builds on storage whose authorizer refuses PRAGMA, and the engine then answers', async () => {
  const sql = authorized();
  try {
    const inference = canned();
    const spark = createSpark({ sql, clock: fixedClock(NOW), inference, record: fakeRecord() });

    /* THE PRAGMA WAS TRIED AND REFUSED, which is the case this file is about. A build that simply
       stopped asking would pass the rest of this test and prove nothing about the refusal. */
    assert.equal(sql.refused.length, 1);
    const status = spark.status();
    assert.equal(status.tier, 'a');
    assert.deepEqual({ used: status.asks.used, cap: status.asks.cap }, { used: 0, cap: 80 });

    inference.say(PREDICATE);
    const out = await spark.read('what is still open', OWNER);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(inference.seen.length, 1);
  } finally {
    sql.close();
  }
});
