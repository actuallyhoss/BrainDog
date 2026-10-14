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

import { core, openStore, STORE_VERSION, type StoreStep } from '../src/call.ts';
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
    assert.equal(sql.one<{ value: string }>("SELECT value FROM slash_meta WHERE key = 'version'")?.value, String(STORE_VERSION));
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
    sql.exec("UPDATE slash_meta SET value = ? WHERE key = 'version'", String(STORE_VERSION + 1));
    assert.throws(() => createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() }), /newer BrainDog/u);
  } finally {
    sql.close();
  }
});

/** Version 2's ledger, as the build before `purpose` and `spends` created it: Slash's own names, and none of the five columns. */
const VERSION_2 = [
  'CREATE TABLE slash_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  `CREATE TABLE slash_settings (
     singleton INTEGER PRIMARY KEY CHECK (singleton = 1), tier TEXT NOT NULL DEFAULT 'a' CHECK (tier IN ('a','b','byo')),
     model TEXT, grant_id TEXT, ask_cap INTEGER NOT NULL DEFAULT 80, updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE slash_call (
     id TEXT PRIMARY KEY, ts TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('read','propose','triage','pattern','prose','embed','change')),
     tier TEXT NOT NULL CHECK (tier IN ('a','b','byo')), model TEXT NOT NULL, tokens_in INTEGER NOT NULL,
     tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('ok','nothing','refused','error')), code TEXT, question TEXT,
     predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT
   )`,
  'CREATE INDEX slash_call_meter ON slash_call(tier, kind, ts)',
  "INSERT INTO slash_meta (key, value) VALUES ('version', '2')",
  "INSERT INTO slash_settings (singleton, tier, ask_cap, updated_at) VALUES (1, 'a', 80, '2026-11-01T00:00:00.000Z')",
];

type Old = { id: string; kind: string; tier?: string; model?: string; ts?: string; code?: string; question?: string; filed?: string };

/** One row as a version 2 build wrote it: no purpose, no spends, only what the row held then. */
const old = (sql: TestSql, r: Old): void =>
  sql.exec(
    `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, filed)
     VALUES (?, ?, ?, ?, ?, 700, 60, 9, 40, ?, ?, ?, ?)`,
    r.id,
    r.ts ?? '2026-11-02T09:00:00.000Z',
    r.kind,
    r.tier ?? 'a',
    r.model ?? 'glm-5.3-flash',
    r.code === undefined ? 'ok' : 'error',
    r.code ?? null,
    r.question ?? null,
    r.filed ?? null,
  );

/** A version 2 store with the rows given, and his month's count as that build made it (`call.ts` at version 2, word for word). */
const version2 = (rows: readonly Old[]): { sql: TestSql; counted: number } => {
  const sql = openSqlite();
  for (const statement of VERSION_2) sql.exec(statement);
  for (const r of rows) old(sql, r);
  const counted =
    sql.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM slash_call WHERE tier = 'a' AND kind IN ('read', 'pattern') AND model <> '-' AND ts >= ?",
      '2026-11-01T00:00:00.000Z',
    )?.n ?? 0;
  return { sql, counted };
};

const said = (sql: TestSql): Record<string, { purpose: string; spends: string }> =>
  Object.fromEntries(sql.all<{ id: string; purpose: string; spends: string }>('SELECT id, purpose, spends FROM slash_call').map((r) => [r.id, { purpose: r.purpose, spends: r.spends }]));

/** The ledger's mark on a hold in flight (`core.reserve`). A row's state, and not a refusal anybody is answered with. */
const PENDING = 'SLASH_PENDING';

/** A month of his own asks as version 2 left them, with everything beside them that its count passed over. */
const HIS: readonly Old[] = [
  { id: 'asked', kind: 'read', question: 'what is still open' },
  { id: 'asked_twice', kind: 'read', question: 'who owes me' },
  { id: 'proposed', kind: 'propose', question: 'who owes me' },
  { id: 'rule', kind: 'read', question: 'rule.rate step 1' },
  { id: 'plan', kind: 'read', question: "Slash's first plan" },
  { id: 'pressed', kind: 'pattern', filed: 'p_1' },
  { id: 'failed', kind: 'read', code: 'UNREACHABLE', question: 'what is late' },
  { id: 'held', kind: 'read', code: PENDING },
  { id: 'not_reached', kind: 'read', model: '-', code: 'UNREACHABLE', question: 'rule.rate step 2' },
  { id: 'turned_away', kind: 'read', model: '-', code: 'SLASH_BUDGET_SPENT' },
  { id: 'last_month', kind: 'read', ts: '2026-10-30T09:00:00.000Z', question: 'an older ask' },
  { id: 'own_key', kind: 'read', tier: 'b', question: 'on his own key' },
];

test("THE STEP FROM 2 TO 3 LEAVES HIS MONTH'S COUNT WHERE IT WAS: every older row says what it was, and the count is logged on both sides", () => {
  const { sql, counted } = version2(HIS);
  try {
    const steps: StoreStep[] = [];
    openStore(sql, { now: NOW, said: (step) => steps.push(step) });

    assert.equal(sql.one<{ value: string }>("SELECT value FROM slash_meta WHERE key = 'version'")?.value, '3');
    assert.deepEqual(said(sql), {
      asked: { purpose: 'ask', spends: 'person' },
      asked_twice: { purpose: 'ask', spends: 'person' },
      /* THE SECOND CALL OF A QUESTION ALREADY COUNTED: written as his, the month would have read one more the moment it stepped. */
      proposed: { purpose: 'ask', spends: 'none' },
      rule: { purpose: 'automation', spends: 'person' },
      plan: { purpose: 'plan', spends: 'person' },
      pressed: { purpose: 'ask', spends: 'person' },
      /* COUNTED WHEN IT HAPPENED, so it stays counted: the step does not take an ask back. */
      failed: { purpose: 'ask', spends: 'person' },
      held: { purpose: 'ask', spends: 'person' },
      not_reached: { purpose: 'automation', spends: 'none' },
      turned_away: { purpose: 'ask', spends: 'none' },
      last_month: { purpose: 'ask', spends: 'person' },
      own_key: { purpose: 'ask', spends: 'person' },
    });

    /* THE COUNT, THREE WAYS: as version 2 made it before the step, as the step logged it, and as the engine reads it after. */
    assert.equal(counted, 7);
    assert.deepEqual(steps, [{ from: 2, to: 3, month: '2026-11-01T00:00:00.000Z', before: 7, after: 7, background: 0 }]);
    const ledger = core(sql, fixedClock(NOW), canned());
    assert.equal(ledger.asksUsed(), counted);
    assert.equal(ledger.backgroundUsed(), 0);

    /* AND A SECOND OPEN IS TWO READS: nothing is filled again and nothing is said. */
    sql.exec("UPDATE slash_call SET spends = 'background', purpose = 'look' WHERE id = 'asked'");
    openStore(sql, { now: NOW, said: (step) => steps.push(step) });
    assert.equal(steps.length, 1);
    assert.deepEqual(said(sql)['asked'], { purpose: 'look', spends: 'background' });
  } finally {
    sql.close();
  }
});

test('THE STEP MOVES ONLY THE BACKGROUND WORK OFF HIS COUNT, and says how much: before, less what was never his, is after', () => {
  const work: readonly Old[] = [
    { id: 'headline', kind: 'pattern', question: "Slash's page headlines" },
    { id: 'who', kind: 'pattern', question: "Slash's reading of who is who" },
    { id: 'drafted', kind: 'pattern' },
    { id: 'skill', kind: 'pattern', question: "Slash's skill draft" },
    { id: 'prose', kind: 'prose' },
    { id: 'embedded', kind: 'embed' },
    { id: 'embed_unreached', kind: 'embed', model: '-', code: 'UNREACHABLE' },
  ];
  const { sql, counted } = version2([...HIS, ...work]);
  try {
    const steps: StoreStep[] = [];
    openStore(sql, { now: NOW, said: (step) => steps.push(step) });

    const rows = said(sql);
    assert.deepEqual(
      work.map((r) => [r.id, rows[r.id]]),
      [
        ['headline', { purpose: 'headline', spends: 'background' }],
        ['who', { purpose: 'understand', spends: 'background' }],
        /* STILL `look`, ALL FIVE, THOUGH A JOB WRITTEN TODAY SAYS `pattern`, `prose` OR `embed` (`job-purposes.test.ts`):
           the step is a released one and reads a row once, and an older row has no purpose on it to be told apart by. */
        ['drafted', { purpose: 'look', spends: 'background' }],
        ['skill', { purpose: 'look', spends: 'background' }],
        ['prose', { purpose: 'look', spends: 'background' }],
        ['embedded', { purpose: 'look', spends: 'background' }],
        ['embed_unreached', { purpose: 'look', spends: 'none' }],
      ],
    );

    /* VERSION 2 COUNTED THE FOUR PATTERNS AS HIS, which is the fault: 11 of his 80 where he had asked 7 times. */
    assert.equal(counted, 11);
    assert.deepEqual(steps, [{ from: 2, to: 3, month: '2026-11-01T00:00:00.000Z', before: 11, after: 7, background: 6 }]);
    const ledger = core(sql, fixedClock(NOW), canned());
    assert.equal(ledger.asksUsed(), 7);
    assert.equal(ledger.backgroundUsed(), 6);
    assert.equal(ledger.backgroundUsed('headline'), 1);
    assert.equal(ledger.backgroundUsed('understand'), 1);
    assert.equal(ledger.backgroundUsed('look'), 4);
  } finally {
    sql.close();
  }
});

test('THE STEP ASKS NO PRAGMA AND A NEW STORE SAYS NOTHING: the columns are read off the table\'s own text', () => {
  const sql = authorized();
  try {
    for (const statement of VERSION_2) sql.exec(statement);
    const steps: StoreStep[] = [];
    openStore(sql, { now: NOW, said: (step) => steps.push(step) });
    assert.equal(sql.refused.length, 0);
    assert.equal(steps.length, 1);

    /* A WRITER A RELEASE BEHIND, which names none of the five columns, still lands and is counted as his, as before. */
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status)
       VALUES ('behind', '2026-11-03T09:00:00.000Z', 'read', 'a', 'glm-5.3-flash', 1, 1, 1, 1, 'ok')`,
    );
    assert.deepEqual(said(sql)['behind'], { purpose: 'ask', spends: 'person' });
    assert.throws(() => sql.exec("UPDATE slash_call SET spends = 'operator' WHERE id = 'behind'"), /CHECK/u);

    const fresh = openSqlite();
    try {
      const none: StoreStep[] = [];
      openStore(fresh, { now: NOW, said: (step) => none.push(step) });
      assert.equal(none.length, 0);
      assert.equal(fresh.one<{ value: string }>("SELECT value FROM slash_meta WHERE key = 'version'")?.value, '3');
    } finally {
      fresh.close();
    }
  } finally {
    sql.close();
  }
});
