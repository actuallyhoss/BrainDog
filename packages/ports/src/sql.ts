/**
 * The storage port, and the guard both of its adapters put in front of their driver (`37 §2.4`, `§5`, `30 §13`).
 *
 * TWO DRIVERS, TWO SETS OF CEILINGS, AND THE LOWER ONE IS PRODUCTION'S. Measured on local workerd
 * through Miniflare against Node 24.13.0: a Durable Object refuses a 101st bound parameter, a statement past 100,000
 * UTF-8 bytes, a `LIKE ?` or `GLOB ?` pattern past 50 bytes and a sixth compound term, and `node:sqlite` answers all of
 * them. So without a guard a statement that the self-host and every test in this tree serve can fail on the Worker,
 * with a driver sentence and no code. `guard` refuses at the DO's number on both hosts, before either driver sees the
 * statement, with one of the thirteen codes below.
 *
 * IT ALSO REFUSES WHAT BOTH DRIVERS WOULD HAVE BOUND WRONGLY. The same probe bound `true` on the DO as the TEXT 'true',
 * `new Date(0)` as its `toString()` in the machine's time zone, `{}` as '[object Object]', `[]` as '', `undefined` and
 * `NaN` as NULL, and `2 ** 53 + 2` as a REAL. None of those threw. A JavaScript caller that got past the types would
 * have written a wrong row on the Worker and a different wrong row, or a throw, on the self-host.
 *
 * NOTHING HERE IS WIRED. `guarded(sql)` is the wrapper a host puts around the port it builds; the Worker's
 * `storageSql` and the self-host's `openSqlite` adopt it in their own change, and the kernel's boot probe calls
 * `measureCaps` and `bootProbe` in its own. This file imports nothing, so it runs in workerd, in Node and in a bare
 * test process (`31 §1`).
 */

/** What a bound parameter may be. Anything else is refused by `guard` as `SYNTAX` before a driver binds it. */
export type Param = string | number | bigint | null | Uint8Array;

/** One row, as the driver returns it: column name to value. */
export type Row = Record<string, Param>;

/**
 * The storage port.
 *
 * Four methods, and the fourth is the one the whole write path is built on. `exec` is for statements
 * with no result; `all` and `one` read. A driver that cannot do `transactionSync` cannot host a
 * record, because a write that is half applied is a record that has to be repaired by hand.
 *
 * `exec` WITH NO PARAMETERS IS THE SCRIPT DOOR IN THIS TREE, which is where it departs from `37 §2.1`'s one-statement
 * `exec` beside an `execScript`. Both hosts hand a zero-parameter `exec` to the driver's multi-statement entry, so
 * `guarded` checks it as a script (`guardScript`) and everything else as one statement (`guard`).
 */
export interface Sql {
  exec(sql: string, ...params: Param[]): void;
  all<T = Row>(sql: string, ...params: Param[]): T[];
  one<T = Row>(sql: string, ...params: Param[]): T | undefined;
  /** Runs `fn` in a transaction, rolls back on a throw, and rethrows. Never nested by the driver. */
  transactionSync<T>(fn: () => T): T;
}

/**
 * `30 §13`'s table of the Durable Object's SQLite limits, verbatim.
 *
 * FOUR OF THESE ARE COUNTED HERE AND THE REST ARE THE DRIVER'S. `sqlLength`, `variableNumber`, `likePatternLength` and
 * `compoundSelect` are counted by `guard`; `exprDepth` needs a parser and is named after the driver refuses it.
 * `length` is 2 MB because the documentation says so and workerd's source sets 4 MB, and the tighter one is the one a
 * record can rely on.
 */
export const DO_LIMITS = {
  length: 2 * 1024 * 1024,
  sqlLength: 100_000,
  column: 100,
  variableNumber: 100,
  likePatternLength: 50,
  exprDepth: 100,
  compoundSelect: 5,
  triggerDepth: 10,
  attach: 0,
  vdbeOp: 25_000,
  functionArg: 32,
} as const;

/**
 * The adapter's thirteen (`30 §13`, `33 §3`). A THIRD LIST, NOT THE REFUSAL REGISTRY: these name what the driver
 * refused, and the kernel maps the two it acts on (`CONSTRAINT`, `INT_OUT_OF_RANGE`) onto its own codes.
 */
export const SQL_ERROR_CODES = [
  'TOO_MANY_PARAMS', 'LIKE_TOO_LONG', 'EXPR_TOO_DEEP', 'INT_OUT_OF_RANGE', 'TXN_STATEMENT_FORBIDDEN',
  'NO_SUCH_MODULE', 'MULTI_STATEMENT_PARAMS', 'STATEMENT_TOO_LONG', 'TOO_MANY_COLUMNS', 'COMPOUND_TOO_LONG',
  'CONSTRAINT', 'SYNTAX', 'UNKNOWN',
] as const;

export type SqlErrorCode = (typeof SQL_ERROR_CODES)[number];

/**
 * A statement the guard or the driver refused, with its code.
 *
 * THE MESSAGE NEVER CARRIES A BOUND VALUE. The guard's own sentences name parameter indexes and byte counts, and a
 * driver sentence names tables and columns and never data (`12 §8`), so a `SqlError` can go to a log line whole.
 */
export class SqlError extends Error {
  override readonly name = 'SqlError';
  readonly code: SqlErrorCode;
  constructor(code: SqlErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/**
 * What a driver can do, measured at open (`37 §5.2`).
 *
 * The five ceilings are declared rather than measured, because they are the DO's and `guard` enforces them on both
 * hosts; `node:sqlite` would report 32,766 parameters and a billion bytes.
 */
export type Capabilities = {
  /** `sqlite_version()`, '3.50.4' on Node 24.13.0. */
  sqlite: string;
  /** A scratch `fts5` table was created and dropped. `false` is refused at boot. */
  fts5: boolean;
  /** `json_extract` answered. `false` is refused at boot. */
  json: boolean;
  maxParams: number;
  maxLikePattern: number;
  maxSqlBytes: number;
  maxCompoundSelect: number;
  maxExprDepth: number;
  /** The compiler's bound form of an expression-index query was planned onto the index. */
  expressionIndexUsed: boolean;
  nestedTransactions: false;
};

/**
 * UTF-8 bytes in a string, counted rather than encoded.
 *
 * COUNTED BECAUSE THIS RUNS ON EVERY STATEMENT and an encoder allocates the statement a second time to measure it.
 * A lone surrogate counts three, which is what `TextEncoder` writes for it (U+FFFD).
 */
const utf8Bytes = (s: string): number => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
};

/**
 * ponytail: the transaction prefix regex skips no leading comment. `/* c *\/ BEGIN` passes on Node; no caller writes a
 * comment before a keyword. Strip comments if a case ever needs it (`37 §10` #7).
 */
const TXN_AT_START = /^\s*(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
const TXN_IN_SCRIPT = /(?:^|;)\s*(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
/**
 * A placeholder, and whether it follows `LIKE` or `GLOB`.
 *
 * ponytail: LIKE detection is a positional regex. A `?` inside an inline string literal shifts the count. The
 * compiler binds every value and inlines only `'$.<id>'` paths, whose alphabet has no `?`. Parse if a hand-written
 * statement ever inlines one (`37 §10` #3). `?NNN` IS HONOURED, because `identity.ts` binds `?1` twice.
 */
const PLACEHOLDER = /(\b(?:LIKE|GLOB)\s*)?\?(\d*)/gi;
/**
 * ponytail: compound terms by keyword count. Nested compounds are summed, so three subqueries of two terms each read
 * as six. Split per SELECT when a kernel statement needs it (`37 §10` #4).
 */
const COMPOUND = /\b(?:UNION|INTERSECT|EXCEPT)\b/gi;
const SECOND_STATEMENT = /;\s*[^\s;]/;

const tooLong = (text: string): void => {
  /* A UTF-16 code unit is at most three UTF-8 bytes, so the cheap test filters exactly and the count runs only past
     33,333 characters. */
  if (text.length * 3 <= DO_LIMITS.sqlLength) return;
  const n = utf8Bytes(text);
  if (n > DO_LIMITS.sqlLength)
    throw new SqlError(
      'STATEMENT_TOO_LONG',
      `statement is ${n} bytes; the ceiling is ${DO_LIMITS.sqlLength} (DO_LIMITS.sqlLength).`,
    );
};

/** What a non-`Param` is, in a word, without its value. */
const kindOf = (v: unknown): string =>
  typeof v === 'number'
    ? 'not a finite number'
    : typeof v === 'object' && v !== null
      ? (Object.getPrototypeOf(v)?.constructor?.name ?? 'an object with no prototype')
      : typeof v;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * The seven checks of `37 §5.3`, in its order, and a throw of `SqlError` at the first that fails.
 *
 * `params` IS `unknown[]` ON PURPOSE: the type check at step 4 is the one TypeScript cannot make for a caller that
 * went around it. Expression depth is not here (`37 §10` #5, ponytail: expression depth is not guarded): it needs a
 * parser, the DO refuses at 101 and Node at 1,001, and `guarded` names the driver's refusal after the fact.
 */
export function guard(query: string, params: readonly unknown[]): void {
  // 1. A transaction statement. Measured: `node:sqlite` runs a raw `SAVEPOINT a; RELEASE a`, and the DO refuses all six.
  const txn = TXN_AT_START.exec(query);
  if (txn) throw new SqlError('TXN_STATEMENT_FORBIDDEN', `statement begins with ${txn[1]!.toUpperCase()}; use transactionSync.`);

  // 2. Length: the DO answered exactly 100,000 bytes and refused 100,001.
  tooLong(query);

  // 3. Parameter count: the DO answered 100 and refused 101 (`too many SQL variables`).
  if (params.length > DO_LIMITS.variableNumber)
    throw new SqlError(
      'TOO_MANY_PARAMS',
      `${params.length} parameters bound; the ceiling is ${DO_LIMITS.variableNumber} (DO_LIMITS.variableNumber). Chunk the statement.`,
    );

  // 4. Types. SQLite numbers its parameters from 1, and so does every sentence here.
  for (let i = 0; i < params.length; i++) {
    const v = params[i];
    if (v === null || typeof v === 'string' || v instanceof Uint8Array) continue;
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (Number.isInteger(v) && !Number.isSafeInteger(v))
        throw new SqlError('INT_OUT_OF_RANGE', `parameter ${i + 1} is an integer beyond ±(2^53 - 1); store it as TEXT (01 §2).`);
      continue;
    }
    if (typeof v === 'bigint') {
      if (v > MAX_SAFE || v < -MAX_SAFE)
        throw new SqlError('INT_OUT_OF_RANGE', `parameter ${i + 1} is an integer beyond ±(2^53 - 1); store it as TEXT (01 §2).`);
      continue;
    }
    throw new SqlError('SYNTAX', `parameter ${i + 1} is ${kindOf(v)}; a Param is null, number, bigint, string or Uint8Array.`);
  }

  // 5. The pattern bound at `LIKE ?` or `GLOB ?`, measured at bind time even when SQLite would never evaluate it: the
  //    DO accepts a long pattern against an empty table and fails once the table has a row (`37 §13` D2).
  let highest = 0;
  for (const m of query.matchAll(PLACEHOLDER)) {
    const at = m[2] ? Number(m[2]) : highest + 1;
    highest = Math.max(highest, at);
    const pattern = params[at - 1];
    if (m[1] && typeof pattern === 'string') {
      const n = utf8Bytes(pattern);
      if (n > DO_LIMITS.likePatternLength)
        throw new SqlError(
          'LIKE_TOO_LONG',
          `LIKE pattern at parameter ${at} is ${n} bytes; the ceiling is ${DO_LIMITS.likePatternLength} (DO_LIMITS.likePatternLength).`,
        );
    }
  }

  // 6. Compound terms: the DO answered five and refused a sixth; Node refuses at 501.
  const terms = (query.match(COMPOUND)?.length ?? 0) + 1;
  if (terms > DO_LIMITS.compoundSelect)
    throw new SqlError(
      'COMPOUND_TOO_LONG',
      `${terms} compound SELECT terms; the ceiling is ${DO_LIMITS.compoundSelect} (DO_LIMITS.compoundSelect).`,
    );

  // 7. A second statement. Measured: the DO runs both and answers the last; `node:sqlite`'s `prepare` compiles the
  //    first and drops the rest without a word. Neither is what the caller asked for.
  const second = SECOND_STATEMENT.exec(query);
  if (second)
    throw new SqlError(
      'MULTI_STATEMENT_PARAMS',
      `this takes exactly one statement; a second begins at byte ${utf8Bytes(query.slice(0, second.index + second[0].length - 1))}. A script goes through exec with no parameters.`,
    );
}

/**
 * The two checks a script can fail (`37 §5.4`): a transaction keyword opening any statement, and the byte ceiling,
 * which SQLite applies to the whole text handed to it.
 *
 * ponytail: a script refuses by a `(^|;)` keyword regex, so a trigger body's `BEGIN ... END;` would be refused. No
 * migration declares a trigger (`01 §2`); walk the script statement by statement when one does (`37 §10` #6).
 */
export function guardScript(sql: string): void {
  const txn = TXN_IN_SCRIPT.exec(sql);
  if (txn) throw new SqlError('TXN_STATEMENT_FORBIDDEN', `a statement in this script begins with ${txn[1]!.toUpperCase()}; use transactionSync.`);
  tooLong(sql);
}

/**
 * SQLite's fixed sentences, and the code each one is.
 *
 * SUBSTRING MATCHES ON THE DRIVER'S OWN TEXT, because workerd exposes no numeric code. Every fragment was produced on
 * Node 24.13.0 or on local workerd. The workerd transaction refusal is its current sentence,
 * "To execute a transaction, please use the state.storage.transaction() or state.storage.transactionSync() APIs
 * instead of ...", which is not the `cannot execute transaction-related statements` that `37 §5.8` had recorded.
 * And the DO answers an unknown virtual-table module with `not authorized: SQLITE_AUTH`, not `no such module`, so that
 * stays `UNKNOWN`: it is also the answer to `PRAGMA compile_options`, and it does not mean a missing module.
 */
const FRAGMENTS: readonly [string, SqlErrorCode][] = [
  ['constraint failed', 'CONSTRAINT'],
  ['syntax error', 'SYNTAX'],
  ['no such module', 'NO_SUCH_MODULE'],
  ['too many columns', 'TOO_MANY_COLUMNS'],
  ['too many terms in compound SELECT', 'COMPOUND_TOO_LONG'],
  ['Expression tree is too large', 'EXPR_TOO_DEEP'],
  ['LIKE or GLOB pattern too complex', 'LIKE_TOO_LONG'],
  ['too many SQL variables', 'TOO_MANY_PARAMS'],
  ['statement too long', 'STATEMENT_TOO_LONG'],
  ['too large to be represented as a JavaScript number', 'INT_OUT_OF_RANGE'],
  ['please use the state.storage.transaction', 'TXN_STATEMENT_FORBIDDEN'],
];

/**
 * A driver's message as one of the thirteen. Never throws; anything unrecognised is `UNKNOWN`.
 *
 * ponytail: `UNKNOWN` is a wide bucket (no such table, malformed JSON, an empty statement). Split when a consumer
 * needs to branch on one (`37 §10` #14).
 */
export function mapDriverMessage(message: string): SqlErrorCode {
  for (const [fragment, code] of FRAGMENTS) if (message.includes(fragment)) return code;
  return 'UNKNOWN';
}

/**
 * A driver error as a `SqlError` when its sentence carries one of the eleven fragments, and unchanged when it does not.
 *
 * UNCHANGED, NOT WRAPPED AS `UNKNOWN`, because a code that says "something else" adds nothing a caller can branch on,
 * and a caller that already reads the driver's own error (its `code`, its class) keeps reading it. A mapped one keeps
 * the driver's sentence verbatim and carries the driver's error as its `cause`, so a test for `/storage\.transaction/`
 * or `UNIQUE constraint failed` still matches.
 */
const named = (e: unknown): unknown => {
  if (e instanceof SqlError || !(e instanceof Error)) return e;
  const code = mapDriverMessage(e.message);
  return code === 'UNKNOWN' ? e : new SqlError(code, e.message, { cause: e });
};

const GUARDED = new WeakSet<Sql>();

/**
 * The port a host builds, with `guard` in front of every statement and the driver's refusals named behind it.
 *
 * `exec` WITH NO PARAMETERS IS CHECKED AS A SCRIPT, because both hosts hand it to the driver's multi-statement entry
 * (`db.exec` on Node; the DO's `sql.exec` runs every statement and answers the last). Everything else is one statement.
 * `transactionSync` is the host's own and is not touched. Every other property the host hung on its port (`close`,
 * a `db` handle) is copied across, so a host can return `guarded(port)` where it returned `port`; a port whose methods
 * live on a prototype would lose them, and neither host builds one.
 */
export function guarded<S extends Sql>(sql: S): S {
  if (GUARDED.has(sql)) return sql;
  const driver = <T>(run: () => T): T => {
    try {
      return run();
    } catch (e) {
      throw named(e);
    }
  };
  const out: S = {
    ...sql,
    exec(text: string, ...params: Param[]): void {
      if (params.length === 0) guardScript(text);
      else guard(text, params);
      driver(() => sql.exec(text, ...params));
    },
    all<T = Row>(text: string, ...params: Param[]): T[] {
      guard(text, params);
      return driver(() => sql.all<T>(text, ...params));
    },
    one<T = Row>(text: string, ...params: Param[]): T | undefined {
      guard(text, params);
      return driver(() => sql.one<T>(text, ...params));
    },
    transactionSync: <T>(fn: () => T): T => sql.transactionSync(fn),
  };
  GUARDED.add(out);
  return out;
}

/**
 * What a driver can do, measured by doing it (`37 §5.2`). `run` is the driver's own statement door, under no guard.
 *
 * FTS5 IS A TABLE CREATED, NOT A COMPILE OPTION READ, because the DO answers `PRAGMA compile_options` and
 * `sqlite_compileoption_used` with `not authorized` (measured) and does allow `CREATE VIRTUAL TABLE ... USING fts5`.
 *
 * ponytail: measureCaps creates and drops two probe tables in main on every open, a write per boot. Move to `temp` if
 * the DO permits it and the write is ever measured to matter (`37 §10` #12).
 */
export function measureCaps(run: (sql: string, ...params: Param[]) => Row[]): Capabilities {
  const sqlite = String(run('SELECT sqlite_version() AS v')[0]?.v);

  let json = false;
  try {
    json = run(`SELECT json_extract('{"a":1}', '$.a') AS v`)[0]?.v === 1;
  } catch {
    json = false;
  }

  let fts5 = true;
  run('DROP TABLE IF EXISTS _caps_fts');
  try {
    run('CREATE VIRTUAL TABLE _caps_fts USING fts5(x)');
  } catch (e) {
    /* Only a missing module is a missing module. A full disk or a locked file is a real failure and goes up. */
    if (mapDriverMessage(e instanceof Error ? e.message : String(e)) !== 'NO_SUCH_MODULE') throw e;
    fts5 = false;
  }
  run('DROP TABLE IF EXISTS _caps_fts');

  /* The compiler's bound form, since that is what the record runs (`30 §7`). A host that refuses EXPLAIN still opens:
     the flag records `false` and the conformance case says why. */
  let expressionIndexUsed = false;
  if (json) {
    try {
      run('DROP TABLE IF EXISTS _caps_probe');
      run('CREATE TABLE _caps_probe (register TEXT NOT NULL, fields TEXT NOT NULL)');
      run(`CREATE INDEX _caps_probe_due ON _caps_probe (json_extract(fields, '$.due')) WHERE register = 'x'`);
      expressionIndexUsed = run(
        `EXPLAIN QUERY PLAN SELECT 1 FROM _caps_probe WHERE register = ? AND json_extract(fields, '$.due') < ?`,
        'x',
        '2026-01-01',
      ).some((r) => String(r['detail']).includes('USING INDEX _caps_probe_due'));
    } catch {
      expressionIndexUsed = false;
    }
    try {
      run('DROP TABLE IF EXISTS _caps_probe');
    } catch {
      /* A host that could not create it has nothing to drop. */
    }
  }

  return {
    sqlite,
    fts5,
    json,
    maxParams: DO_LIMITS.variableNumber,
    maxLikePattern: DO_LIMITS.likePatternLength,
    maxSqlBytes: DO_LIMITS.sqlLength,
    maxCompoundSelect: DO_LIMITS.compoundSelect,
    maxExprDepth: DO_LIMITS.exprDepth,
    expressionIndexUsed,
    nestedTransactions: false,
  };
}

/**
 * The refusal a build without FTS5 or JSON1 opens as (`37 §5.1` step 4, `30 §13`). There is no degraded mode
 * (ADR-038): a record without search is a record whose search answers nothing and says nothing.
 *
 * `driver` names the adapter ('node:sqlite', 'durable-object'), because the operator reading this has to know which
 * SQLite to replace, and `caps.sqlite` is the version they are running.
 */
export function bootProbe(caps: Capabilities, driver: string): void {
  const missing = (['fts5', 'json'] as const).filter((k) => !caps[k]);
  if (missing.length === 0) return;
  throw new SqlError(
    'NO_SUCH_MODULE',
    [
      'This SQLite build cannot host a .brain file:',
      ...missing.map((k) => `  ${k}: required, not available`),
      `  driver: ${driver} · SQLite ${caps.sqlite}`,
      "On macOS, Bun loads Apple's libsqlite3.dylib and is unsupported. Use Node 24.13+, which bundles its own SQLite.",
    ].join('\n'),
  );
}
