/**
 * `createSlash` over storage that refuses a pragma, which is what a Durable Object's storage is.
 *
 * WHY A WRAPPER AND NOT WORKERD. The fault was measured in workerd (`loop/research-spark-seam.md` §4):
 * a bare DO SQLite ran `CREATE TABLE IF NOT EXISTS` and answered `not authorized: SQLITE_AUTH` to
 * `PRAGMA user_version = 1`, and the real `createSlash` bundled by wrangler threw that same sentence
 * out of its constructor. `node:sqlite` has no authorizer, which is how every test in this package
 * passed on storage the Worker does not run on. The wrapper refuses exactly what the authorizer
 * refused, with the same words, so this file fails for the reason production would and in a
 * millisecond. `apps/worker/test/slash-in-do.test.ts` is the same claim driven through workerd.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Param } from '@braindog/ports';

import { createSlash } from '../src/index.ts';
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

test('createSlash builds on storage whose authorizer refuses PRAGMA, and the engine then answers', async () => {
  const sql = authorized();
  try {
    const inference = canned();
    const slash = createSlash({ sql, clock: fixedClock(NOW), inference, record: fakeRecord() });

    /* THE PRAGMA WAS TRIED AND REFUSED, which is the case this file is about. A build that simply
       stopped asking would pass the rest of this test and prove nothing about the refusal. */
    assert.equal(sql.refused.length, 1);
    const status = slash.status();
    assert.equal(status.tier, 'a');
    assert.deepEqual({ used: status.asks.used, cap: status.asks.cap }, { used: 0, cap: 80 });

    inference.say(PREDICATE);
    const out = await slash.read('what is still open', OWNER);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(inference.seen.length, 1);
  } finally {
    sql.close();
  }
});

/**
 * The two codes the ledger wrote under the old name, as a build before the rename left them (`loop/DIRECTION.md`
 * section 31, `loop/research-slash-rename.md` section 2.2). Written out as literals because they are what that build's
 * rows hold.
 */
const OLD_PENDING = 'SPARK_PENDING';
const OLD_SPENT = 'SPARK_BUDGET_SPENT';

test('A HOLD WRITTEN UNDER THE OLD NAME IS RENAMED WHEN THE LEDGER OPENS, so the renamed release can find it', async () => {
  /* WHAT WENT WRONG WITHOUT IT. The release deletes by `code`, so a hold an older build wrote in flight was never
     released by the renamed one: it stayed counted against the month for good. The package keeps no migration table,
     and cannot keep `user_version` on a Durable Object (above), so the rename is one idempotent statement that runs
     with the DDL on every build. */
  const sql = openSqlite();
  try {
    createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    const row = (id: string, status: string, code: string) =>
      sql.exec(
        `INSERT INTO call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code)
         VALUES (?, '2026-09-24T09:00:00.000Z', 'read', 'a', 'glm-5.3-flash', 0, 0, 0, 0, ?, ?)`,
        id,
        status,
        code,
      );
    row('c_held', 'error', OLD_PENDING);
    row('c_spent', 'refused', OLD_SPENT);
    row('c_other', 'error', 'UNREACHABLE');

    createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    const codes = Object.fromEntries(sql.all<{ id: string; code: string }>('SELECT id, code FROM call ORDER BY id').map((r) => [r.id, r.code]));
    assert.deepEqual(codes, { c_held: 'SLASH_PENDING', c_other: 'UNREACHABLE', c_spent: 'SLASH_BUDGET_SPENT' });

    /* AND A THIRD OPEN CHANGES NOTHING, which is what a statement that runs on every build must be. */
    createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM call WHERE code LIKE 'SLASH%'")?.n, 2);
  } finally {
    sql.close();
  }
});
