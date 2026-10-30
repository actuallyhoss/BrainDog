/**
 * The SQL guard, the driver-message map, the capability probe and the boot refusal (`37 §5.2`, `§5.3`, `§5.8`).
 *
 * THE DURABLE OBJECT IS THE CEILING AND `node:sqlite` IS THE HOST THAT DOES NOT HAVE ONE. Measured on
 * local workerd through Miniflare from wrangler 4.129.0, against Node 24.13.0: the DO refuses a 101st bound
 * parameter, a statement of 100,001 bytes, a `LIKE ?` pattern of 51 bytes and a sixth compound term, and `node:sqlite`
 * answers every one of them. So a statement the self-host serves today can fail on the Worker tomorrow, and nothing
 * between the two says so. The first test below runs each pair through a bare `node:sqlite` port first, to show the
 * pass it is taking away, and then through `guarded`, which must answer N and refuse N+1 with the DO's own code.
 *
 * THE BYTE CEILING IS 100,000 ALLOWED AND 100,001 REFUSED, which `37 §5.3` said and an earlier hardening
 * survey contradicted. The survey's probe padded `'SELECT 1 AS n /*'` with
 * `N - 17` characters and closed it with `*` and `/`, which is N + 1 bytes: its "99,999" was 100,000 and passed, its
 * "100,000" was 100,001 and failed. Padded exactly, the DO answers 99,999 and 100,000 and refuses 100,001 with
 * `statement too long: SQLITE_TOOBIG`, and in two-byte characters it answers 100,000 and refuses 100,002.
 *
 * `node:sqlite` IS IMPORTED HERE AND NOWHERE IN `src`, because `31 §1` keeps the main entry runnable in workerd.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import type { Param, Row, Sql } from '../src/index.ts';
import {
  DO_LIMITS,
  DO_MEASURED,
  SQL_ERROR_CODES,
  SqlError,
  bootProbe,
  guard,
  guardScript,
  guardShape,
  guarded,
  mapDriverMessage,
  measureCaps,
  type Capabilities,
  type SqlErrorCode,
} from '../src/sql.ts';

/** The port over `node:sqlite` as both hosts build it today: no guard, so no ceiling below the driver's own. */
const bare = () => {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  let calls = 0;
  const sql: Sql & { calls(): number; close(): void } = {
    calls: () => calls,
    close: () => db.close(),
    exec(text: string, ...params: Param[]) {
      calls++;
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all<T = Row>(text: string, ...params: Param[]) {
      calls++;
      return db.prepare(text).all(...(params as never[])) as T[];
    },
    one<T = Row>(text: string, ...params: Param[]) {
      calls++;
      return db.prepare(text).get(...(params as never[])) as T | undefined;
    },
    transactionSync<T>(fn: () => T): T {
      db.exec('BEGIN');
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return sql;
};

/** The code a throw carries, or a failed assertion naming what came back instead. */
const codeOf = (fn: () => unknown): SqlErrorCode => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof SqlError, `expected a SqlError and got ${String(e)}`);
    return e.code;
  }
  assert.fail('expected a refusal and the statement was answered');
};

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** `node:sqlite` hands back rows with a null prototype, which strict deep equality tells apart from a literal. */
const plain = (rows: unknown[]) => rows.map((r) => ({ ...(r as object) }));

/** A single SELECT exactly `n` UTF-8 bytes long, padded inside a comment with `ch`. */
const padded = (n: number, ch = 'x') => {
  const head = 'SELECT 1 AS n /*';
  const s = `${head}${ch.repeat((n - head.length - 2) / bytes(ch))}*/`;
  assert.equal(bytes(s), n, 'the pad is exact, which is the mistake the survey made');
  return s;
};

const inList = (k: number) => `SELECT 1 IN (${Array(k).fill('?').join(', ')}) AS n`;
const union = (k: number) => Array.from({ length: k }, (_, i) => `SELECT ${i + 1} AS v`).join(' UNION ALL ');

test('THE GUARD REFUSES AT THE CEILING THE DURABLE OBJECT WAS MEASURED AT, AND NOT ONE BELOW', () => {
  const raw = bare();
  const sql = guarded(raw);
  const pairs: { name: string; code: SqlErrorCode; at: () => unknown; over: (s: Sql) => unknown }[] = [
    { name: '100 / 101 parameters', code: 'TOO_MANY_PARAMS', at: () => sql.one(inList(100), ...Array(100).fill(1)), over: (s) => s.one(inList(101), ...Array(101).fill(1)) },
    { name: '100,000 / 100,001 bytes', code: 'STATEMENT_TOO_LONG', at: () => sql.one(padded(100_000)), over: (s) => s.one(padded(100_001)) },
    { name: '100,000 / 100,002 bytes of two-byte characters', code: 'STATEMENT_TOO_LONG', at: () => sql.one(padded(100_000, 'é')), over: (s) => s.one(padded(100_002, 'é')) },
    { name: 'LIKE 50 / 51 bytes', code: 'LIKE_TOO_LONG', at: () => sql.one("SELECT 'a' LIKE ? AS n", 'x'.repeat(50)), over: (s) => s.one("SELECT 'a' LIKE ? AS n", 'x'.repeat(51)) },
    { name: 'LIKE 25 / 26 characters of é, 50 / 52 bytes', code: 'LIKE_TOO_LONG', at: () => sql.one("SELECT 'a' LIKE ? AS n", 'é'.repeat(25)), over: (s) => s.one("SELECT 'a' LIKE ? AS n", 'é'.repeat(26)) },
    { name: 'GLOB 50 / 51 bytes', code: 'LIKE_TOO_LONG', at: () => sql.one("SELECT 'a' GLOB ? AS n", 'x'.repeat(50)), over: (s) => s.one("SELECT 'a' GLOB ? AS n", 'x'.repeat(51)) },
    { name: '5 / 6 compound terms', code: 'COMPOUND_TOO_LONG', at: () => sql.all(union(5)), over: (s) => s.all(union(6)) },
  ];
  for (const p of pairs) {
    assert.doesNotThrow(p.at, `${p.name}: the ceiling itself is answered`);
    assert.doesNotThrow(() => p.over(raw), `${p.name}: node:sqlite answers one past it, which is the gap`);
    const before = raw.calls();
    assert.equal(codeOf(() => p.over(sql)), p.code, p.name);
    assert.equal(raw.calls(), before, `${p.name}: the driver never saw the refused statement`);
  }
  assert.deepEqual(sql.all(union(5)).length, 5);
  raw.close();
});

test('THE SIX TRANSACTION KEYWORDS ARE REFUSED AT THE START OF A STATEMENT, AND NOWHERE ELSE', () => {
  for (const q of ['  begin', 'commit', 'END TRANSACTION', 'rollback to a', '\n savepoint a', 'RELEASE a'])
    assert.equal(codeOf(() => guard(q, [])), 'TXN_STATEMENT_FORBIDDEN', q);
  assert.doesNotThrow(() => guard("SELECT 'BEGIN' AS v", []));
  assert.doesNotThrow(() => guard('SELECT 1 AS ended', []), 'a word that begins with END is not END');
  assert.throws(() => guard('savepoint a', []), /statement begins with SAVEPOINT; use transactionSync\./);
});

test('THE BYTE CEILING COUNTS UTF-8, SO A STATEMENT UNDER 100,000 CHARACTERS CAN STILL BE OVER IT', () => {
  assert.doesNotThrow(() => guard(`SELECT '${'é'.repeat(33_400)}' AS v`, []), '66,814 bytes');
  const long = `SELECT '${'é'.repeat(50_000)}' AS v`;
  assert.ok(long.length < 100_000);
  assert.equal(codeOf(() => guard(long, [])), 'STATEMENT_TOO_LONG');
  assert.throws(() => guard(padded(100_001), []), /statement is 100001 bytes; the ceiling is 100000 \(DO_LIMITS\.sqlLength\)\./);
  const astral = `SELECT '${'😀'.repeat(25_000)}' AS v`;
  assert.equal(bytes(astral), 100_014, 'four bytes a pair, not six');
  /* THE COUNT IS ASSERTED, NOT ONLY THE REFUSAL. Scoring a pair as six bytes (two lone surrogates) refuses this
     statement just the same, and a mutation of it passed every test until the number was read back. */
  assert.throws(() => guard(astral, []), /statement is 100014 bytes;/);
  assert.doesNotThrow(() => guard(`SELECT '${'😀'.repeat(20_000)}' AS v`, []), '80,014 bytes, which six a pair would refuse');
  const lone = `SELECT '${String.fromCharCode(0xd800).repeat(33_400)}' AS v`;
  assert.equal(bytes(lone), 100_214, 'TextEncoder writes a lone surrogate as the three bytes of U+FFFD');
  assert.throws(() => guard(lone, []), /statement is 100214 bytes;/);
});

test('A VALUE THAT IS NOT A PARAM NEVER REACHES A DRIVER, BECAUSE BOTH DRIVERS BIND IT AS SOMETHING', () => {
  /* Measured on local workerd, `SELECT ? AS v`: `true` answered the TEXT 'true', `undefined` NULL,
     `new Date(0)` its toString() in the machine's own time zone, `{}` the TEXT '[object Object]', `[]` the empty
     string, `NaN` NULL. None was refused, which `37 §5.3` step 4 said they would be. `node:sqlite` throws on `true` and
     `undefined` and binds a Date as NULL. Two hosts, three answers, and the one the Worker gives writes a wrong row. */
  const bad: [unknown, string][] = [
    [true, 'boolean'], [undefined, 'undefined'], [new Date(0), 'Date'], [{}, 'Object'], [[], 'Array'],
    [NaN, 'not a finite number'], [Infinity, 'not a finite number'], [new ArrayBuffer(1), 'ArrayBuffer'],
  ];
  for (const [value, says] of bad) {
    let message = '';
    try {
      guard('SELECT ? AS a, ? AS b', ['ok', value]);
    } catch (e) {
      assert.ok(e instanceof SqlError);
      assert.equal(e.code, 'SYNTAX');
      message = e.message;
    }
    assert.ok(message.startsWith('parameter 2 is '), `${String(says)}: names the index, got ${message}`);
    assert.ok(message.includes(says), `names what it was: ${message}`);
  }
});

test('AN INTEGER PAST 2^53 IS REFUSED RATHER THAN BOUND AS A REAL, AND EVERY SAFE ONE PASSES', () => {
  /* The DO bound `2 ** 53 + 2` as `real` and a bigint of 5 threw `Cannot convert a BigInt value to a number`. */
  for (const v of [2 ** 53, -(2 ** 53), 2n ** 53n, -(2n ** 53n)])
    assert.equal(codeOf(() => guard('SELECT ? AS v', [v])), 'INT_OUT_OF_RANGE', String(v));
  for (const v of [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 1.5, -0, 5n, null, '', new Uint8Array([1]), Buffer.from('x')])
    assert.doesNotThrow(() => guard('SELECT ? AS v', [v]), String(v));
});

test('THE LIKE CEILING MEASURES THE PARAMETER BOUND AT THE PATTERN, BY POSITION OR BY NUMBER, AND NO OTHER', () => {
  const sixty = 'y'.repeat(60);
  assert.doesNotThrow(() => guard('SELECT 1 WHERE ? LIKE ? AND ? = ?', ['a', 'x'.repeat(50), 'b', sixty]));
  assert.equal(codeOf(() => guard('SELECT 1 WHERE ? NOT LIKE ?', ['a', 'x'.repeat(51)])), 'LIKE_TOO_LONG');
  assert.equal(codeOf(() => guard('SELECT 1 WHERE ?1 = ?1 AND ?2 GLOB ?3', ['a', 'b', 'x'.repeat(51)])), 'LIKE_TOO_LONG');
  assert.doesNotThrow(() => guard('SELECT 1 WHERE ?2 LIKE ?1', ['x'.repeat(50), sixty]), 'the pattern is ?1');
  /* A bare `?` after `?3` and `?1` is the fourth, not the second: measured on node:sqlite, `SELECT ?3 AS a, ?1 AS b,
     ? AS c` bound (1, 2, 3, 4) answers c = 4. Taking the last number seen rather than the highest would have measured `sixty`. */
  assert.doesNotThrow(() => guard('SELECT 1 WHERE ?3 = ?1 AND a LIKE ?', ['a', sixty, 'c', 'short']));
  assert.equal(codeOf(() => guard('SELECT 1 WHERE ?3 = ?1 AND a LIKE ?', ['a', 'b', 'c', sixty])), 'LIKE_TOO_LONG');
  assert.throws(
    () => guard('SELECT 1 WHERE a = ? AND b LIKE ?', ['a', 'é'.repeat(26)]),
    /LIKE pattern at parameter 2 is 52 bytes; the ceiling is 50 \(DO_LIMITS\.likePatternLength\)\./,
  );
});

test('A SECOND STATEMENT IS REFUSED, AND A TRAILING SEMICOLON IS NOT ONE', () => {
  for (const q of ['SELECT 1; SELECT 2', 'SELECT 1;SELECT 2', 'SELECT ?; DELETE FROM t'])
    assert.equal(codeOf(() => guard(q, [1])), 'MULTI_STATEMENT_PARAMS', q);
  for (const q of ['SELECT 1;', 'SELECT 1; ', 'SELECT 1;;\n']) assert.doesNotThrow(() => guard(q, []), q);
  assert.throws(() => guard('SELECT 1; SELECT 2', []), /a second begins at byte 10\./);
});

test('A REFUSAL NAMES INDEXES AND BYTE COUNTS AND NEVER A BOUND VALUE', () => {
  const secret = 'the-owner-said-hello-at-noon';
  const tries: [string, unknown[]][] = [
    ['SELECT 1 WHERE a LIKE ?', [secret + secret]],
    [inList(101), Array(101).fill(secret)],
    ['SELECT ? AS v', [2 ** 60]],
    ['SELECT ?; SELECT 2', [secret]],
  ];
  for (const [q, params] of tries) {
    try {
      guard(q, params);
      assert.fail(`${q.slice(0, 30)} was answered`);
    } catch (e) {
      assert.ok(e instanceof SqlError);
      assert.ok(!e.message.includes(secret) && !e.message.includes(String(2 ** 60)), e.message);
    }
  }
});

test('A SCRIPT REFUSES A TRANSACTION KEYWORD AFTER ANY SEMICOLON, AND RUNS NOTHING WHEN IT DOES', () => {
  const raw = bare();
  const sql = guarded(raw);
  sql.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1); INSERT INTO t VALUES (2); -- done');
  assert.deepEqual(plain(sql.all('SELECT x FROM t ORDER BY x')), [{ x: 1 }, { x: 2 }]);
  assert.equal(codeOf(() => sql.exec('CREATE TABLE t2 (x); BEGIN; INSERT INTO t2 VALUES (1); COMMIT;')), 'TXN_STATEMENT_FORBIDDEN');
  assert.deepEqual(plain(sql.all("SELECT count(*) AS n FROM sqlite_master WHERE name = 't2'")), [{ n: 0 }]);
  assert.equal(codeOf(() => guardScript(padded(100_001))), 'STATEMENT_TOO_LONG');
  /* A TRIGGER'S BODY IS NOT A TRANSACTION (migration 31's `decision_kept`), and a transaction after one still is. */
  const trigger = "CREATE TRIGGER kept BEFORE UPDATE ON t BEGIN SELECT RAISE(ABORT, 'kept'); END";
  sql.exec(trigger);
  assert.deepEqual(plain(sql.all("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name = 'kept'")), [{ n: 1 }]);
  assert.equal(codeOf(() => guardScript(`${trigger}; BEGIN; COMMIT;`)), 'TXN_STATEMENT_FORBIDDEN');
  raw.close();
});

test('WHAT THE GUARD CANNOT COUNT AHEAD IT NAMES AFTER THE DRIVER, AND WHAT IT CANNOT NAME IT LEAVES ALONE', () => {
  const raw = bare();
  const sql = guarded(raw);
  /* A RUN OF ONE OPERATOR IS COUNTED AHEAD: the DO answered 100 `OR` terms and refused 101, and so does the guard now,
     where Node alone answered up to 1,000. */
  assert.doesNotThrow(() => sql.one(`SELECT ${Array(100).fill('1').join(' OR ')} AS v`));
  let counted: unknown;
  try {
    sql.one(`SELECT ${Array(101).fill('1').join(' OR ')} AS v`);
  } catch (e) {
    counted = e;
  }
  assert.ok(counted instanceof SqlError, String(counted));
  assert.equal(counted.code, 'EXPR_TOO_DEEP');
  assert.match(counted.message, /at least 101 deep; the ceiling is 100/);
  /* A DEPTH THE GUARD DOES NOT READ (a run of NOT, which `depthOf` leaves uncounted rather than risk counting one too
     many) is the driver's, and the driver's sentence is named after the fact: Node refuses past 1,000. */
  let deep: unknown;
  try {
    sql.one(`SELECT ${'NOT '.repeat(1001)}1 AS v`);
  } catch (e) {
    deep = e;
  }
  assert.ok(deep instanceof SqlError, String(deep));
  assert.equal(deep.code, 'EXPR_TOO_DEEP');
  assert.match(deep.message, /^Expression tree is too large \(maximum depth 1000\)/);
  assert.ok(deep.cause instanceof Error, 'the driver error rides along as the cause');

  let unknown: unknown;
  try {
    sql.all('SELECT * FROM absent');
  } catch (e) {
    unknown = e;
  }
  assert.ok(unknown instanceof Error && !(unknown instanceof SqlError), 'no such table passes through as the driver threw it');
  assert.equal(unknown.message, 'no such table: absent');

  sql.exec('CREATE TABLE u (k TEXT UNIQUE)');
  sql.exec('INSERT INTO u VALUES (?)', 'a');
  assert.equal(codeOf(() => sql.exec('INSERT INTO u VALUES (?)', 'a')), 'CONSTRAINT');
  assert.throws(() => sql.exec('INSERT INTO u VALUES (?)', 'a'), { message: 'UNIQUE constraint failed: u.k' });
  raw.close();
});

test('A TEXT WITH U+0000 AND A VALUE PAST WHAT THE CLOUD TAKES ARE REFUSED BEFORE EITHER DRIVER BINDS THEM', () => {
  const raw = bare();
  const sql = guarded(raw);
  sql.exec('CREATE TABLE v (x)');
  /* Measured: `node:sqlite` stored 'a\u0000b' as 'a', and the DO stored three characters its `length()` reads as one. */
  assert.equal(codeOf(() => sql.exec('INSERT INTO v (x) VALUES (?)', 'a\u0000b')), 'SYNTAX');
  assert.throws(() => guard('SELECT ?', ['a\u0000b']), /parameter 1 holds the character U\+0000/);
  /* The same bytes bound as bytes are a BLOB, and kept whole. */
  sql.exec('INSERT INTO v (x) VALUES (?)', Uint8Array.of(97, 0, 98));
  assert.deepEqual(plain(sql.all('SELECT length(x) AS n FROM v')), [{ n: 3 }]);
  /* The DO answered 4,194,304 bytes and refused 4,194,305, as a string and as bytes. */
  assert.doesNotThrow(() => guard('SELECT length(?) AS n', ['o'.repeat(DO_MEASURED.length)]));
  assert.equal(codeOf(() => guard('SELECT length(?) AS n', ['o'.repeat(DO_MEASURED.length + 1)])), 'STATEMENT_TOO_LONG');
  assert.equal(codeOf(() => guard('SELECT length(?) AS n', [new Uint8Array(DO_MEASURED.length + 1)])), 'STATEMENT_TOO_LONG');
  /* Counted in UTF-8 bytes, so two-byte text passes the ceiling at half the characters. */
  assert.equal(codeOf(() => guard('SELECT length(?) AS n', ['é'.repeat(DO_MEASURED.length / 2 + 1)])), 'STATEMENT_TOO_LONG');
  raw.close();
});

test('THE SHAPE IS COUNTED FROM BELOW: WHAT THE GUARD REFUSES THE DURABLE OBJECT REFUSED, AND ITS EDGE RUNS', () => {
  const n = (k: number, each: (i: number) => string, sep: string) => Array.from({ length: k }, (_, i) => each(i)).join(sep);
  /* Each pair as the DO answered it on workerd 1.20260903.1: the first runs there, the second is refused there. */
  const pairs: [string, string, string, SqlErrorCode][] = [
    ['+ chain', `SELECT ${n(100, () => '1', ' + ')} AS v`, `SELECT ${n(101, () => '1', ' + ')} AS v`, 'EXPR_TOO_DEEP'],
    ['AND chain', `SELECT 1 AS v WHERE ${n(100, () => '1', ' AND ')}`, `SELECT 1 AS v WHERE ${n(101, () => '1=1', ' AND ')}`, 'EXPR_TOO_DEEP'],
    ['nested calls', `SELECT ${'abs('.repeat(99)}1${')'.repeat(99)} AS v`, `SELECT ${'abs('.repeat(100)}1${')'.repeat(100)} AS v`, 'EXPR_TOO_DEEP'],
    ['nested brackets', `SELECT ${'1 + ('.repeat(99)}1${')'.repeat(99)} AS v`, `SELECT ${'1 + ('.repeat(100)}1${')'.repeat(100)} AS v`, 'EXPR_TOO_DEEP'],
    ['|| chain', `SELECT ${n(100, () => "'a'", ' || ')} AS v`, `SELECT ${n(101, () => "'a'", ' || ')} AS v`, 'EXPR_TOO_DEEP'],
    ['arguments', `SELECT json_array(${n(127, String, ', ')}) AS v`, `SELECT json_array(${n(128, String, ', ')}) AS v`, 'SYNTAX'],
    ['table', `CREATE TABLE t (${n(100, (i) => `c${i} TEXT`, ', ')}, PRIMARY KEY (c0, c1))`, `CREATE TABLE t (${n(101, (i) => `c${i}`, ', ')})`, 'TOO_MANY_COLUMNS'],
    ['results', `SELECT ${n(100, (i) => `${i} AS c${i}`, ', ')}`, `SELECT ${n(101, (i) => `${i} AS c${i}`, ', ')}`, 'TOO_MANY_COLUMNS'],
    ['values', `VALUES (${n(100, String, ', ')})`, `VALUES (${n(101, String, ', ')})`, 'TOO_MANY_COLUMNS'],
  ];
  for (const [what, runs, refused, code] of pairs) {
    assert.doesNotThrow(() => guardShape(runs), what);
    assert.equal(codeOf(() => guardShape(refused)), code, what);
  }
  /* WHAT THE DO RAN THAT A CARELESS COUNT WOULD REFUSE: a BETWEEN's AND, a long IN list, many CASE arms, a sum of brackets,
     and a hundred comparisons joined by OR each holding its own AND. */
  for (const runs of [
    `SELECT 1 AS v WHERE ${n(60, (i) => `x BETWEEN ${i} AND ${i + 1}`, ' AND ')}`,
    `SELECT 1 AS v WHERE 1 IN (${n(500, String, ', ')})`,
    `SELECT CASE ${n(60, (i) => `WHEN ${i} THEN ${i}`, ' ')} END AS v`,
    `SELECT ${n(100, () => '(1)', ' + ')} AS v`,
    `SELECT 1 AS v WHERE ${n(60, (i) => `(1 = ${i} AND 2 = 2)`, ' OR ')}`,
    `SELECT coalesce(${n(120, String, ', ')}) AS v`,
  ])
    assert.doesNotThrow(() => guardShape(runs), runs.slice(0, 40));
  /* AND IN A SCRIPT, statement by statement, as a migration runs. */
  assert.equal(codeOf(() => guardScript(`CREATE TABLE a (x); CREATE TABLE b (${n(101, (i) => `c${i}`, ', ')});`)), 'TOO_MANY_COLUMNS');
});

test('THE WRAPPER KEEPS THE PORT IT WRAPS: ITS TRANSACTIONS, ITS ROWS, AND WHATEVER ELSE THE HOST HUNG ON IT', () => {
  const raw = bare();
  const sql = guarded(raw);
  assert.equal(typeof sql.close, 'function', 'close() survives, so a host can wrap what it returns');
  sql.exec('CREATE TABLE t (x INTEGER)');
  assert.throws(() => sql.transactionSync(() => {
    sql.exec('INSERT INTO t VALUES (?)', 1);
    throw new Error('boom');
  }), { message: 'boom' });
  assert.equal(sql.transactionSync(() => (sql.exec('INSERT INTO t VALUES (?)', 2), 7)), 7);
  assert.deepEqual(plain(sql.all('SELECT x FROM t ORDER BY x')), [{ x: 2 }]);
  assert.deepEqual(plain([sql.one('SELECT x FROM t WHERE x = ?', 2)]), [{ x: 2 }]);
  assert.equal(guarded(sql), sql, 'wrapping twice is wrapping once');
  raw.close();
});

test('THE DRIVER MESSAGES MAP TO THE THIRTEEN, AND THE WORKER SENTENCES ARE THE ONES WORKERD PRINTS TODAY', () => {
  const rows: [string, SqlErrorCode][] = [
    ['UNIQUE constraint failed: t.k', 'CONSTRAINT'],
    ['NOT NULL constraint failed: t.n', 'CONSTRAINT'],
    ['near "SELEC": syntax error', 'SYNTAX'],
    ['no such module: fts5', 'NO_SUCH_MODULE'],
    ['too many columns on c_cols: SQLITE_ERROR', 'TOO_MANY_COLUMNS'],
    ['too many terms in compound SELECT: SQLITE_ERROR', 'COMPOUND_TOO_LONG'],
    ['Expression tree is too large (maximum depth 100): SQLITE_ERROR', 'EXPR_TOO_DEEP'],
    ['LIKE or GLOB pattern too complex: SQLITE_ERROR', 'LIKE_TOO_LONG'],
    ['too many SQL variables at offset 213: SQLITE_ERROR', 'TOO_MANY_PARAMS'],
    ['statement too long: SQLITE_TOOBIG', 'STATEMENT_TOO_LONG'],
    /* Workerd's own sentences for the shapes `guardShape` counts, measured on 30 Oct 2026. */
    ['string or blob too big: SQLITE_TOOBIG', 'STATEMENT_TOO_LONG'],
    ['too many arguments on function json_array at offset 7: SQLITE_ERROR', 'SYNTAX'],
    ['too many terms in GROUP BY clause: SQLITE_ERROR', 'TOO_MANY_COLUMNS'],
    ['too many columns in result set: SQLITE_ERROR', 'TOO_MANY_COLUMNS'],
    ['Value is too large to be represented as a JavaScript number: 9007199254740993', 'INT_OUT_OF_RANGE'],
    [
      'To execute a transaction, please use the state.storage.transaction() or state.storage.transactionSync() APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements.',
      'TXN_STATEMENT_FORBIDDEN',
    ],
    ['no such table: x', 'UNKNOWN'],
    ['not authorized: SQLITE_AUTH', 'UNKNOWN'],
    ['', 'UNKNOWN'],
  ];
  for (const [message, code] of rows) assert.equal(mapDriverMessage(message), code, message);

  /* And the Node half from the driver itself rather than from memory. */
  const db = new DatabaseSync(':memory:');
  const said = (q: string) => {
    try {
      db.prepare(q).all();
    } catch (e) {
      return mapDriverMessage((e as Error).message);
    }
    return 'answered';
  };
  assert.equal(said('SELEC 1'), 'SYNTAX');
  assert.equal(said('CREATE VIRTUAL TABLE c_nomod USING nosuch(x)'), 'NO_SUCH_MODULE');
  assert.equal(said(`CREATE TABLE c_cols (${Array.from({ length: 2001 }, (_, i) => `c${i}`).join(', ')})`), 'TOO_MANY_COLUMNS');
  assert.equal(said(Array.from({ length: 501 }, (_, i) => `SELECT ${i}`).join(' UNION ALL ')), 'COMPOUND_TOO_LONG');
  assert.equal(said('SELECT 9007199254740993 AS v'), 'INT_OUT_OF_RANGE');
  db.close();
  assert.equal(SQL_ERROR_CODES.length, 13);
});

test('THE CAPABILITIES ARE MEASURED BY DOING, AND A HOST THAT CANNOT EXPLAIN STILL OPENS', () => {
  const db = new DatabaseSync(':memory:');
  const run = (q: string, ...p: Param[]) => db.prepare(q).all(...(p as never[])) as Row[];
  const caps = measureCaps(run);
  assert.match(caps.sqlite, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(
    { ...caps, sqlite: 'x' },
    {
      sqlite: 'x', fts5: true, json: true, maxParams: 100, maxLikePattern: 50, maxSqlBytes: 100_000,
      maxCompoundSelect: 5, maxExprDepth: 100, expressionIndexUsed: true, nestedTransactions: false,
    },
  );
  assert.deepEqual(run("SELECT name FROM sqlite_master WHERE name LIKE '_caps%'"), [], 'the probe tables are dropped');

  const noExplain = measureCaps((q, ...p) => {
    if (q.startsWith('EXPLAIN')) throw new Error('not authorized: SQLITE_AUTH');
    return run(q, ...p);
  });
  assert.equal(noExplain.expressionIndexUsed, false);
  assert.deepEqual(run("SELECT name FROM sqlite_master WHERE name LIKE '_caps%'"), []);

  const noFts = measureCaps((q, ...p) => {
    if (/USING fts5/.test(q)) throw new Error('no such module: fts5');
    return run(q, ...p);
  });
  assert.equal(noFts.fts5, false);
  assert.equal(noFts.json, true);

  assert.throws(
    () => measureCaps((q, ...p) => {
      if (/USING fts5/.test(q)) throw new Error('disk I/O error');
      return run(q, ...p);
    }),
    { message: 'disk I/O error' },
    'a failure that is not a missing module is not a missing module',
  );
  db.close();
});

test('A BUILD WITHOUT FTS5 OR JSON IS REFUSED AT BOOT IN THE WORDS 30 §13 GIVES IT', () => {
  const caps: Capabilities = {
    sqlite: '3.50.4', fts5: true, json: true, maxParams: 100, maxLikePattern: 50, maxSqlBytes: 100_000,
    maxCompoundSelect: 5, maxExprDepth: 100, expressionIndexUsed: true, nestedTransactions: false,
  };
  assert.doesNotThrow(() => bootProbe(caps, 'node:sqlite'));

  const refusal = (c: Capabilities, driver: string) => {
    try {
      bootProbe(c, driver);
    } catch (e) {
      assert.ok(e instanceof SqlError);
      assert.equal(e.code, 'NO_SUCH_MODULE');
      return e.message;
    }
    assert.fail('booted');
  };
  assert.equal(
    refusal({ ...caps, fts5: false }, 'node:sqlite'),
    [
      'This SQLite build cannot host a .brain file:',
      '  fts5: required, not available',
      '  driver: node:sqlite · SQLite 3.50.4',
      "On macOS, Bun loads Apple's libsqlite3.dylib and is unsupported. Use Node 24.13+, which bundles its own SQLite.",
    ].join('\n'),
  );
  assert.deepEqual(
    refusal({ ...caps, fts5: false, json: false }, 'durable-object').split('\n').slice(1, 4),
    ['  fts5: required, not available', '  json: required, not available', '  driver: durable-object · SQLite 3.50.4'],
  );
  assert.equal(DO_LIMITS.sqlLength, caps.maxSqlBytes);
});
