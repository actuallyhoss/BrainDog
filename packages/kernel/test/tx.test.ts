/**
 * `attempt()` on a host that refuses raw transaction statements, which is what a Durable Object is.
 *
 * THIS IS A FAKE, AND IT IS A FAKE OF SOMETHING MEASURED. A Durable Object's `ctx.storage.sql.exec`
 * throws on `SAVEPOINT`, `RELEASE`, `BEGIN` and the rest, with or without a comment in front, inside
 * `transactionSync` or outside it; and `ctx.storage.transactionSync` called inside another one is a
 * real savepoint, so an inner throw rolls back the inner writes and the outer ones commit. Both were
 * driven on workerd 1.20260903.1 through miniflare on 2026-09-22, and the real run is
 * `apps/worker/test/kernel-in-do.test.ts`. This file keeps the same two facts in the kernel's own
 * suite, over `node:sqlite`, so that a kernel change which reaches for a raw savepoint again fails
 * here in a second rather than on the Cloud as a 500.
 *
 * WHY IT EXISTS AT ALL: `/api/keys/put` and `/api/invite` answered 500 on the Cloud with the Durable Object's own
 * sentence while 1001 kernel tests were green, because every one of them opened `node:sqlite`, which permits
 * `SAVEPOINT`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import type { Param, Result, Row, Sql } from '@braindog/ports';
import { fixOf, refused as isRefusal } from '@braindog/ports';

import { openRecord } from '../src/index.ts';
import { attempt } from '../src/tx.ts';
import { fixedClock } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** The Durable Object's refusal, word for word as it came back from workerd. */
const DO_REFUSAL =
  'To execute a transaction, please use the state.storage.transaction() or state.storage.transactionSync() APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements.';

/** Every statement the Durable Object answers with that sentence, including behind a leading comment. */
const TX_STATEMENT = /^\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*)*(?:SAVEPOINT|RELEASE|ROLLBACK|BEGIN|COMMIT|END)\b/i;

/**
 * A `Sql` shaped like `ctx.storage` behind the Worker's adapter: raw transaction statements refused,
 * `transactionSync` the only way in, and a nested `transactionSync` a savepoint of its own when
 * `nests` is on (which is what `storage.transactionSync` is when nothing flattens it).
 */
function durableSql(nests: boolean) {
  const db = new DatabaseSync(':memory:');
  const refused: string[] = [];
  let depth = 0;
  const guard = (text: string) => {
    if (TX_STATEMENT.test(text)) {
      refused.push(text.trim().split(/\s+/)[0]!.toUpperCase());
      throw new Error(DO_REFUSAL);
    }
  };
  const sql: Sql = {
    exec(text: string, ...params: Param[]) {
      guard(text);
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all<T = Row>(text: string, ...params: Param[]) {
      guard(text);
      return db.prepare(text).all(...(params as never[])) as T[];
    },
    one<T = Row>(text: string, ...params: Param[]) {
      guard(text);
      return db.prepare(text).get(...(params as never[])) as T | undefined;
    },
    transactionSync<T>(fn: () => T): T {
      if (depth > 0 && !nests) return fn();
      /* The runtime's own statements, which go to the database directly and never through `exec`. */
      const name = `cf_${depth}`;
      db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
      depth++;
      try {
        const out = fn();
        db.exec(depth === 1 ? 'COMMIT' : `RELEASE ${name}`);
        return out;
      } catch (e) {
        db.exec(depth === 1 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return { sql, db, refused };
}

async function record(nests = true) {
  const { sql, db, refused } = durableSql(nests);
  const k = await openRecord(sql, fixedClock(NOW));
  const made = k.createRecord({ id: ID, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } });
  assert.ok(made.ok, 'the record was not created on the Durable-Object-shaped host');
  sql.exec('CREATE TABLE probe (x TEXT)');
  return { k, sql, db, refused };
}

/**
 * The one raw statement a refusing host may see is the first `SAVEPOINT`, which is `attempt()` asking.
 *
 * A REFUSED STATEMENT IS HARMLESS ON THE DURABLE OBJECT, measured rather than assumed: workerd threw
 * before running it, the transaction it was issued in carried on, and its later writes committed
 * (`apps/worker/test/kernel-in-do.test.ts`). What must never reach it is a second one, because that
 * means the answer was not kept, or a `RELEASE` or `ROLLBACK TO`, because that means the attempt
 * went down the statement path after being told no.
 */
const askedOnce = (refused: string[]) =>
  assert.ok(refused.length <= 1 && refused.every((s) => s === 'SAVEPOINT'), `raw statements reached a host that refuses them: ${refused.join(', ')}`);

const NOPE: Result<never> = { ok: false, refusal: { code: 'NOPE', fix: 'no' } };
const probe = (sql: Sql) => sql.all<{ x: string }>('SELECT x FROM probe ORDER BY rowid').map((r) => r.x);
const GRANT = { label: 'stats read', opens: 'stats.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 9]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' } as const;

test('A SEALING WRITE WORKS ON A HOST THAT REFUSES SAVEPOINT, which is the keychain 500 on the Cloud', async () => {
  const { k, refused } = await record();
  const made = k.bindGrant({ ...GRANT }, 'p_1');
  assert.ok(made.ok, `bindGrant was refused: ${fixOf(made)}`);
  assert.equal(k.grants().length, 1, 'the grant the host said it bound is not there');
  askedOnce(refused);
});

test('A TOP-LEVEL REFUSAL WRITES NOTHING, and the host transaction is what undoes it', async () => {
  const { k, sql, refused } = await record();
  const out = attempt(sql, k.transaction, () => {
    sql.exec("INSERT INTO probe (x) VALUES ('half')");
    return NOPE;
  });
  assert.equal(out.ok, false);
  assert.equal(isRefusal(out) ? out.refusal.code : '', 'NOPE', 'the refusal came back as something other than itself');
  assert.deepEqual(probe(sql), [], 'the writes before the refusal committed');
  askedOnce(refused);
});

test('A NESTED REFUSAL ROLLS BACK ONLY ITS OWN WRITES, through the host savepoint and not a raw one', async () => {
  const { k, sql, refused } = await record(true);
  const inner = k.transaction(() => {
    sql.exec("INSERT INTO probe (x) VALUES ('outer')");
    const r = attempt(sql, k.transaction, () => {
      sql.exec("INSERT INTO probe (x) VALUES ('inner')");
      return NOPE;
    });
    sql.exec("INSERT INTO probe (x) VALUES ('after')");
    return r;
  });
  assert.equal(inner.ok, false);
  assert.deepEqual(probe(sql), ['outer', 'after'], 'one refusal took the whole transaction with it, or left its own row');
  askedOnce(refused);
});

test(
  'A NESTED REFUSAL BEHIND AN ADAPTER THAT FLATTENS transactionSync',
  {
    todo:
      'an adapter that answers a nested transactionSync with fn() throws away the savepoint the Durable Object would have made, so a nested refusal after a write keeps that write. apps/worker/src/index.ts storageSql no longer does that; this stays a todo because no kernel-side change can fix an adapter that flattens',
  },
  async () => {
    const { k, sql } = await record(false);
    k.transaction(() => {
      sql.exec("INSERT INTO probe (x) VALUES ('outer')");
      attempt(sql, k.transaction, () => (sql.exec("INSERT INTO probe (x) VALUES ('inner')"), NOPE));
    });
    assert.deepEqual(probe(sql), ['outer']);
  },
);

test('A NESTED SUCCESS COMMITS WITH ITS CALLER, and k.transaction(() => k.bindGrant(...)) is that case', async () => {
  const { k, refused } = await record(true);
  const made = k.transaction(() => k.bindGrant({ ...GRANT }, 'p_1'));
  assert.ok(made.ok, fixOf(made));
  assert.equal(k.grants().length, 1);
  askedOnce(refused);
});

test('A REAL THROW STILL ROLLS BACK AND KEEPS GOING UP on the refusing host', async () => {
  const { k, sql, refused } = await record(true);
  assert.throws(
    () =>
      k.transaction(() =>
        attempt(sql, k.transaction, () => {
          sql.exec("INSERT INTO probe (x) VALUES ('thrown')");
          throw new TypeError('a real error');
        }),
      ),
    TypeError,
  );
  assert.deepEqual(probe(sql), []);
  askedOnce(refused);
});

test('THE HOST IS ASKED ONCE, not once an attempt', async () => {
  const { k, sql, refused } = await record(true);
  for (let i = 0; i < 5; i++) attempt(sql, k.transaction, () => ({ ok: true as const, value: i }));
  k.transaction(() => attempt(sql, k.transaction, () => NOPE));
  assert.deepEqual(refused, ['SAVEPOINT']);
});

test('A SAVEPOINT THAT FAILS FOR ANY OTHER REASON GOES UP AS ITSELF, and is not taken for the Durable Object saying no', async () => {
  const { k, sql } = await record(true);
  const broken: Sql = {
    ...sql,
    exec(text: string, ...params: Param[]) {
      if (/^SAVEPOINT/.test(text)) throw new Error('disk I/O error');
      sql.exec(text, ...params);
    },
  };
  assert.throws(() => attempt(broken, k.transaction, () => ({ ok: true as const, value: 1 })), /disk I\/O error/);
});

test('A SUCCESS IS RETURNED AS ITSELF and its writes commit, top-level and nested', async () => {
  const { k, sql } = await record(true);
  const top = attempt(sql, k.transaction, () => (sql.exec("INSERT INTO probe (x) VALUES ('top')"), { ok: true as const, value: 1 }));
  const nested = k.transaction(() =>
    attempt(sql, k.transaction, () => (sql.exec("INSERT INTO probe (x) VALUES ('nested')"), { ok: true as const, value: 2 })),
  );
  assert.deepEqual([top, nested], [{ ok: true, value: 1 }, { ok: true, value: 2 }]);
  assert.deepEqual(probe(sql), ['top', 'nested']);
});
