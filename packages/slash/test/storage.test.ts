/**
 * `createSlash` over storage that refuses a pragma, which is what a Durable Object's storage is.
 *
 * WHY A WRAPPER AND NOT WORKERD. The fault was measured in workerd:
 * a bare DO SQLite ran `CREATE TABLE IF NOT EXISTS` and answered `not authorized: SQLITE_AUTH` to
 * `PRAGMA user_version = 1`, and the real `createSlash` bundled by wrangler threw that same sentence
 * out of its constructor. `node:sqlite` has no authorizer, which is how every test in this package
 * passed on storage the Worker does not run on. The wrapper refuses exactly what the authorizer
 * refused, with the same words, so this file fails for the reason production would and in a
 * millisecond. `apps/worker/test/slash-in-do.test.ts` is the same claim driven through workerd.
 * The store's version is a row now (`STORE_VERSION`), so the build asks no pragma at all.
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

    /* NO PRAGMA WAS ASKED, which is the case this file is about: the version lives in `slash_meta`, and a build that
       asked the pragma again would be one refusal away from the 500 this file was written for. */
    assert.equal(sql.refused.length, 0);
    assert.equal(sql.one<{ value: string }>("SELECT value FROM slash_meta WHERE key = 'version'")?.value, '2');
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
 * The two codes the ledger wrote under the old name, as a build before the rename
 * from Spark left them. Written out as literals because they are what that build's
 * rows hold.
 */
const OLD_PENDING = 'SPARK_PENDING';
const OLD_SPENT = 'SPARK_BUDGET_SPENT';

/** Version 1's two tables, as a build before `slash_meta` created them: the names and columns `46 §4.1` gave them. */
const VERSION_1 = [
  `CREATE TABLE settings (
     singleton INTEGER PRIMARY KEY CHECK (singleton = 1), tier TEXT NOT NULL DEFAULT 'a' CHECK (tier IN ('a','b','byo')),
     model TEXT, grant_id TEXT, ask_cap INTEGER NOT NULL DEFAULT 80, updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE call (
     id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL, tokens_in INTEGER NOT NULL,
     tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL, status TEXT NOT NULL, code TEXT, question TEXT,
     predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT
   )`,
  'CREATE INDEX call_meter ON call(tier, kind, ts)',
];

const put = (sql: TestSql, table: string, id: string, status: string, code: string) =>
  sql.exec(
    `INSERT INTO ${table} (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code)
     VALUES (?, '2026-11-02T09:00:00.000Z', 'read', 'a', 'glm-5.3-flash', 0, 0, 0, 0, ?, ?)`,
    id,
    status,
    code,
  );

test('A VERSION 1 STORE IS RENAMED IN PLACE WHEN THE LEDGER OPENS: the owner\'s cap, every row, and the old codes renamed', async () => {
  /* WHAT WENT WRONG WITHOUT THE CODE RENAME. The release deletes by `code`, so a hold an older build wrote in flight was
     never released by the renamed one: it stayed counted against the month for good. Version 1 ran that rename on every
     build; the version row lets it run once, with the table rename. */
  const sql = openSqlite();
  try {
    for (const statement of VERSION_1) sql.exec(statement);
    sql.exec("INSERT INTO settings (singleton, tier, ask_cap, updated_at) VALUES (1, 'a', 7, '2026-11-01T00:00:00.000Z')");
    put(sql, 'call', 'c_held', 'error', OLD_PENDING);
    put(sql, 'call', 'c_spent', 'refused', OLD_SPENT);
    put(sql, 'call', 'c_other', 'error', 'UNREACHABLE');

    const slash = createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((t) => t.name);
    assert.deepEqual(tables, ['slash_call', 'slash_meta', 'slash_settings']);
    const codes = Object.fromEntries(sql.all<{ id: string; code: string }>('SELECT id, code FROM slash_call ORDER BY id').map((r) => [r.id, r.code]));
    assert.deepEqual(codes, { c_held: 'SLASH_PENDING', c_other: 'UNREACHABLE', c_spent: 'SLASH_BUDGET_SPENT' });
    /* THE CAP THE OWNER CHOSE, AND THE MONTH'S COUNT: each row is a read on tier `a` this month under a model's name, so all
       three count, the hold among them, as they did before the rename. */
    assert.deepEqual({ used: slash.status().asks.used, cap: slash.status().asks.cap }, { used: 3, cap: 7 });

    /* AND A THIRD OPEN CHANGES NOTHING, which is what a step that runs on every build must be. */
    createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM slash_call WHERE code LIKE 'SLASH%'")?.n, 2);
    assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM slash_call')?.n, 3);
  } finally {
    sql.close();
  }
});

test('A ROLLBACK THAT MADE VERSION 1\'S TABLES AGAIN HAS ITS LEDGER CARRIED, and the owner\'s settings kept over the old build\'s default', async () => {
  /* An older build deployed after the rename creates `settings` and `call` again and meters into them. Those rows are the
     count of what was spent, so they are carried; the old build's settings row is the default it inserted, so it is not. */
  const sql = openSqlite();
  try {
    const slash = createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    assert.equal(slash.configure({ ask_cap: 5 }, OWNER).ok, true);
    put(sql, 'slash_call', 'c_before', 'ok', 'X');
    for (const statement of VERSION_1) sql.exec(statement);
    sql.exec("INSERT INTO settings (singleton, tier, ask_cap, updated_at) VALUES (1, 'a', 80, '2026-11-10T00:00:00.000Z')");
    put(sql, 'call', 'c_during', 'ok', 'Y');

    const again = createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((t) => t.name);
    assert.deepEqual(tables, ['slash_call', 'slash_meta', 'slash_settings']);
    assert.deepEqual(sql.all<{ id: string }>('SELECT id FROM slash_call ORDER BY id').map((r) => r.id), ['c_before', 'c_during']);
    assert.equal(again.status().asks.cap, 5);
  } finally {
    sql.close();
  }
});

test('A STORE A NEWER BUILD WROTE IS REFUSED, not read under columns this build does not know', () => {
  const sql = openSqlite();
  try {
    createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    sql.exec("UPDATE slash_meta SET value = '3' WHERE key = 'version'");
    assert.throws(() => createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() }), /newer BrainDog/u);
  } finally {
    sql.close();
  }
});
