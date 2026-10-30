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
 * SEVEN OF THESE ARE COUNTED HERE AND THE REST ARE THE DRIVER'S. `sqlLength`, `variableNumber`, `likePatternLength`
 * and `compoundSelect` are counted exactly by `guard`; `column` and `exprDepth` are counted from below by `guardShape`
 * (what it counts the Durable Object refuses too, and a shape it cannot see is still the driver's); `length` and
 * `functionArg` are counted at the numbers the Durable Object really refuses at, `DO_MEASURED`.
 * `length` is 2 MB because the documentation says so and workerd's source sets 4 MB, and the tighter one is the one a
 * record can rely on: the kernel holds a row's fields under it (`ROW_CAP` in `kernel/src/coerce.ts`).
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
 * Where the Durable Object really refuses, for the two ceilings it holds looser than `DO_LIMITS` documents.
 *
 * MEASURED ON LOCAL WORKERD (1.20260903.1, through Miniflare at `wrangler.jsonc`'s compatibility date 2026-09-01), on 30
 * Oct 2026: a bound string of 4,194,304 bytes is answered and one of 4,194,305 is `string or blob too big:
 * SQLITE_TOOBIG`, and `json_array` of 127 arguments is answered and of 128 is `too many arguments on function`. The
 * guard counts at these and not at `DO_LIMITS`, because a guard below the Cloud's real ceiling would refuse a statement
 * the Cloud runs today: a row it wrote at 3 MB could not be written again. `node:sqlite` takes a billion bytes and a
 * thousand arguments, so without these the self-host ran what the Cloud refuses.
 */
export const DO_MEASURED = {
  length: 4 * 1024 * 1024,
  functionArg: 127,
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
  /** `sqlite_version()`, '3.50.4' on Node 24.13.0, and 'not said' on a Durable Object, which refuses the function. */
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
/** A trigger's own `BEGIN ... END`, which is its body and no transaction: up to the first `; END` after its `BEGIN`. */
const TRIGGER_BODY = /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b[\s\S]*?\bBEGIN\b[\s\S]*?;\s*END\b/gi;
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
 * `STATEMENT_TOO_LONG` for one bound value past what the Durable Object takes (`DO_MEASURED.length`).
 *
 * THAT CODE, BECAUSE IT IS SQLite's: a statement too long and a string or blob too big are both `SQLITE_TOOBIG`, and the
 * thirteen have no other word for it. The sentence says which it was.
 */
const tooBig = (bytes: number, i: number): void => {
  if (bytes > DO_MEASURED.length)
    throw new SqlError(
      'STATEMENT_TOO_LONG',
      `parameter ${i + 1} is ${bytes} bytes; one value takes at most ${DO_MEASURED.length} (DO_MEASURED.length). Keep it in a file and store its reference.`,
    );
};

/* ── THE STATEMENT'S SHAPE ─────────────────────────────────────────────────────────────────────────────────────────── */

/** A token as the shape reads it: a word upper-cased, an operator, a bracket or a separator, and everything else one operand. */
type Tok = { k: 'word' | 'op'; v: string } | { k: 'operand' | '(' | ')' | ',' | ';' | '.' };

const OPERAND: Tok = { k: 'operand' };
const PUNCT: Readonly<Record<string, Tok>> = { '(': { k: '(' }, ')': { k: ')' }, ',': { k: ',' }, ';': { k: ';' }, '.': { k: '.' } };
const OPS3 = ['->>'];
const OPS2 = ['||', '<=', '>=', '==', '!=', '<>', '<<', '>>', '->'];
const OPS1 = '+-*/%&|<>=~';

const isDigit = (c: number): boolean => c >= 48 && c <= 57;
/** A letter, a digit, `_`, `$` or anything past ASCII, which SQLite reads as a letter of an identifier. */
const isWordChar = (c: number): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c > 127;

/** The statement as tokens, comments dropped and every literal one operand. Never throws: what it cannot read it skips. */
function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i]!;
    const code = text.charCodeAt(i);
    if (code <= 32) {
      i++;
      continue;
    }
    if (c === '-' && text[i + 1] === '-') {
      const e = text.indexOf('\n', i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      /* A doubled quote is the quote itself, inside a string and a quoted name alike. */
      let j = i + 1;
      for (;;) {
        const e = text.indexOf(c, j);
        if (e < 0) {
          j = n;
          break;
        }
        if (text[e + 1] === c) {
          j = e + 2;
          continue;
        }
        j = e + 1;
        break;
      }
      out.push(OPERAND);
      i = j;
      continue;
    }
    if (c === '[') {
      const e = text.indexOf(']', i + 1);
      i = e < 0 ? n : e + 1;
      out.push(OPERAND);
      continue;
    }
    if (isDigit(code) || (c === '.' && isDigit(text.charCodeAt(i + 1)))) {
      const hex = c === '0' && (text[i + 1] === 'x' || text[i + 1] === 'X');
      let j = i + 1;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (isWordChar(d) || d === 46) j++;
        else if ((d === 43 || d === 45) && !hex && (text[j - 1] === 'e' || text[j - 1] === 'E')) j++;
        else break;
      }
      out.push(OPERAND);
      i = j;
      continue;
    }
    if (c === '?' || c === ':' || c === '@' || c === '$') {
      let j = i + 1;
      while (j < n && isWordChar(text.charCodeAt(j))) j++;
      out.push(OPERAND);
      i = j;
      continue;
    }
    if (isWordChar(code)) {
      let j = i + 1;
      while (j < n && isWordChar(text.charCodeAt(j))) j++;
      out.push({ k: 'word', v: text.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    const three = text.slice(i, i + 3);
    const two = text.slice(i, i + 2);
    if (OPS3.includes(three)) {
      out.push({ k: 'op', v: three });
      i += 3;
    } else if (OPS2.includes(two)) {
      out.push({ k: 'op', v: two });
      i += 2;
    } else if (OPS1.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
    } else {
      const p = PUNCT[c];
      if (p) out.push(p);
      i++;
    }
  }
  return out;
}

/**
 * The words that end one expression and begin the next: clauses, CASE's arms, a statement's own keywords. Splitting at
 * a word that was really a column's name only ever counts less, so a name that is also a keyword costs nothing.
 */
const SPLIT: ReadonlySet<string> = new Set(
  ('SELECT FROM WHERE GROUP BY HAVING ORDER LIMIT OFFSET UNION INTERSECT EXCEPT ALL DISTINCT ON USING JOIN INNER LEFT RIGHT ' +
    'FULL OUTER CROSS NATURAL SET VALUES INTO INSERT UPDATE DELETE REPLACE CREATE TABLE INDEX VIEW TRIGGER VIRTUAL TEMP ' +
    'TEMPORARY IF WHEN THEN ELSE END CASE AS RETURNING WINDOW OVER PARTITION ROWS RANGE GROUPS DO CONFLICT NOTHING ASC ' +
    'DESC COLLATE WITH RECURSIVE MATERIALIZED DEFAULT PRIMARY KEY UNIQUE CHECK FOREIGN REFERENCES CONSTRAINT BEFORE AFTER ' +
    'INSTEAD OF FOR EACH ROW BEGIN DROP ALTER ADD COLUMN RENAME TO PRAGMA EXPLAIN QUERY PLAN ANALYZE VACUUM REINDEX ' +
    'ATTACH DETACH ABORT FAIL IGNORE ROLLBACK RAISE FILTER NULLS FIRST LAST UNBOUNDED PRECEDING FOLLOWING CURRENT ' +
    'EXCLUDE TIES OTHERS WITHOUT STRICT AUTOINCREMENT GENERATED ALWAYS STORED INDEXED DEFERRABLE INITIALLY DEFERRED ' +
    'IMMEDIATE EXCLUSIVE CASCADE RESTRICT ACTION NO').split(' '),
);

/** SQLite's operators that are words. `AND` and `OR` are counted; the rest only say a chain below them is not one. */
const OPERATOR_WORDS: ReadonlySet<string> = new Set(['AND', 'OR', 'NOT', 'IS', 'IN', 'LIKE', 'GLOB', 'MATCH', 'REGEXP', 'BETWEEN', 'ESCAPE', 'ISNULL', 'NOTNULL']);

/**
 * SQLite's own functions, the ones a word before a bracket is a call to. A call is a node of the expression tree, so it
 * adds one to the depth, and its arguments are counted against `DO_MEASURED.functionArg`. A word not here before a
 * bracket (a table's name, a type's size) is read as neither. `REPLACE`, `LIKE` and `GLOB` are left out: they are also
 * a statement's or an operator's words.
 */
const FUNCTIONS: ReadonlySet<string> = new Set(
  ('ABS CHANGES CHAR COALESCE CONCAT CONCAT_WS FORMAT GLOB HEX IFNULL IIF INSTR LAST_INSERT_ROWID LENGTH LIKELIHOOD ' +
    'LIKELY LOAD_EXTENSION LOWER LTRIM MAX MIN NULLIF OCTET_LENGTH PRINTF QUOTE RANDOM RANDOMBLOB ROUND RTRIM SIGN ' +
    'SOUNDEX SUBSTR SUBSTRING TOTAL_CHANGES TRIM TYPEOF UNHEX UNICODE UNLIKELY UPPER ZEROBLOB DATE TIME DATETIME ' +
    'JULIANDAY UNIXEPOCH STRFTIME TIMEDIFF AVG COUNT GROUP_CONCAT STRING_AGG SUM TOTAL ROW_NUMBER RANK DENSE_RANK ' +
    'PERCENT_RANK CUME_DIST NTILE LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE ACOS ACOSH ASIN ASINH ATAN ATAN2 ATANH CEIL ' +
    'CEILING COS COSH DEGREES EXP FLOOR LN LOG LOG10 LOG2 MOD PI POW POWER RADIANS SIN SINH SQRT TAN TANH TRUNC CAST ' +
    'EXISTS BM25 HIGHLIGHT SNIPPET JSON JSONB JSON_ARRAY JSONB_ARRAY JSON_ARRAY_LENGTH JSON_ERROR_POSITION JSON_EXTRACT ' +
    'JSONB_EXTRACT JSON_INSERT JSONB_INSERT JSON_OBJECT JSONB_OBJECT JSON_PATCH JSONB_PATCH JSON_PRETTY JSON_REMOVE ' +
    'JSONB_REMOVE JSON_REPLACE JSONB_REPLACE JSON_SET JSONB_SET JSON_TYPE JSON_VALID JSON_QUOTE JSON_GROUP_ARRAY ' +
    'JSONB_GROUP_ARRAY JSON_GROUP_OBJECT JSONB_GROUP_OBJECT JSON_EACH JSON_TREE').split(' '),
);

/** Symbols below `+` and `-` in SQLite's order: where one stands, a run of `+` is not one chain. */
const LOWER_SYMBOLS: ReadonlySet<string> = new Set(['=', '==', '!=', '<>', '<', '<=', '>', '>=', '&', '|', '<<', '>>']);

/** The words that end a SELECT's result columns. */
const SELECT_END: ReadonlySet<string> = new Set(['FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'WINDOW', 'UNION', 'INTERSECT', 'EXCEPT']);
/** The words that open a table constraint rather than a column, in a CREATE TABLE's brackets. */
const TABLE_CONSTRAINT: ReadonlySet<string> = new Set(['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN']);

/** What one expression's tokens showed, between two words of `SPLIT` or two commas. */
type Seg = { or: number; and: number; between: number; add: number; mul: number; cat: number; lower: boolean; binary: boolean; child: number };
const fresh = (): Seg => ({ or: 0, and: 0, between: 0, add: 0, mul: 0, cat: 0, lower: false, binary: false, child: 0 });

/**
 * The least the expression tree's height can be.
 *
 * FROM BELOW, NEVER ABOVE, because a guard that counts one too many refuses a statement the Cloud runs. So it counts
 * only what SQLite cannot build any shallower: a run of the LOWEST operator in one expression, which is the spine of
 * its tree (`a OR b OR c` is three deep under the ORs, whatever the terms are); `+`, `*` and `||` only where nothing
 * lower stands between them; one for each call to a function of SQLite's (`abs(abs(1))` is three); and one for a
 * bracket that an operator stands outside. A bracket alone adds nothing, as in SQLite. A `BETWEEN`'s `AND` is its own.
 * Measured on the Durable Object: 100 `1 + ...` terms answered and 101 refused; 100 ANDs answered and 101 refused;
 * `abs` nested 99 deep answered; parentheses 98 deep answered.
 */
function depthOf(t: readonly Tok[], close: Int32Array, from: number, to: number): number {
  let best = 1;
  let seg = fresh();
  let operand = false;
  let word: string | null = null;
  const end = (): void => {
    const chain =
      seg.or > 0 ? seg.or + 1
      : seg.and - seg.between > 0 ? seg.and - seg.between + 1
      : seg.lower ? 1
      : seg.add > 0 ? seg.add + 1
      : seg.mul > 0 ? seg.mul + 1
      : seg.cat > 0 ? seg.cat + 1
      : 1;
    best = Math.max(best, chain, seg.child + (seg.binary ? 1 : 0));
    seg = fresh();
    operand = false;
    word = null;
  };
  for (let i = from; i < to; i++) {
    const x = t[i]!;
    if (x.k === '(') {
      const j = close[i]!;
      const call = word !== null && FUNCTIONS.has(word);
      seg.child = Math.max(seg.child, depthOf(t, close, i + 1, j) + (call ? 1 : 0));
      i = j;
      operand = true;
      word = null;
    } else if (x.k === ',' || x.k === ';') end();
    else if (x.k === '.') {
      operand = false;
      word = null;
    } else if (x.k === 'operand') {
      operand = true;
      word = null;
    } else if (x.k === 'op') {
      const v = x.v;
      if (operand && v !== '~') {
        seg.binary = true;
        if (v === '+' || v === '-') seg.add++;
        else if (v === '*' || v === '/' || v === '%') seg.mul++;
        else if (v === '||' || v === '->' || v === '->>') seg.cat++;
        else seg.lower = true;
      } else if (LOWER_SYMBOLS.has(v)) seg.lower = true;
      operand = false;
      word = null;
    } else if (x.k === 'word') {
      const v = x.v;
      if (SPLIT.has(v)) end();
      else if (OPERATOR_WORDS.has(v)) {
        if (v === 'OR' && operand) seg.or++;
        else if (v === 'AND' && operand) seg.and++;
        else {
          if (v === 'BETWEEN') seg.between++;
          seg.lower = true;
        }
        if (operand && v !== 'NOT' && v !== 'ISNULL' && v !== 'NOTNULL') seg.binary = true;
        operand = false;
        word = null;
      } else {
        operand = true;
        word = v;
      }
    }
  }
  end();
  return best;
}

/** How many comma-separated items stand directly inside the bracket at `open`, and the index each begins at. */
function itemsIn(t: readonly Tok[], close: Int32Array, open: number): number[] {
  const end = close[open]!;
  if (end === open + 1) return [];
  const starts = [open + 1];
  for (let i = open + 1; i < end; i++) {
    const x = t[i]!;
    if (x.k === '(') i = close[i]!;
    else if (x.k === ',') starts.push(i + 1);
  }
  return starts;
}

const isWord = (x: Tok | undefined, v: string): boolean => x !== undefined && x.k === 'word' && x.v === v;

/** The first refusal the shape earns, as its code and sentence, or `null`. */
function shapeOf(text: string): [SqlErrorCode, string] | null {
  const t = tokenize(text);
  /* Each bracket's partner. A statement whose brackets do not pair is the driver's syntax error, not this one's. */
  const close = new Int32Array(t.length).fill(-1);
  const open: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const k = t[i]!.k;
    if (k === '(') open.push(i);
    else if (k === ')') {
      const o = open.pop();
      if (o === undefined) return null;
      close[o] = i;
    }
  }
  if (open.length > 0) return null;

  const columns = (said: string): [SqlErrorCode, string] =>
    ['TOO_MANY_COLUMNS', `${said}; the ceiling is ${DO_LIMITS.column} (DO_LIMITS.column). Keep the values in one JSON column, or read fewer at a time.`];

  for (let i = 0; i < t.length; i++) {
    const x = t[i]!;
    if (x.k !== 'word') continue;
    /* A call to one of SQLite's functions, held to what the DO takes. `EXISTS` holds a SELECT, whose commas are its
       columns and are counted below as those. */
    if (FUNCTIONS.has(x.v) && x.v !== 'EXISTS' && t[i + 1]?.k === '(') {
      const n = itemsIn(t, close, i + 1).length;
      if (n > DO_MEASURED.functionArg)
        return ['SYNTAX', `${x.v.toLowerCase()} is called with ${n} arguments; the ceiling is ${DO_MEASURED.functionArg} (DO_MEASURED.functionArg). Bind the list as one JSON array.`];
    }
    if (x.v === 'CREATE') {
      let j = i + 1;
      if (isWord(t[j], 'TEMP') || isWord(t[j], 'TEMPORARY')) j++;
      if (isWord(t[j], 'TABLE')) {
        /* The column list is the first bracket before any `AS`: `CREATE TABLE t AS SELECT` has none. */
        for (let k = j + 1; k < t.length && t[k]!.k !== ';' && !isWord(t[k], 'AS'); k++) {
          if (t[k]!.k !== '(') continue;
          const n = itemsIn(t, close, k).filter((s) => !(t[s]!.k === 'word' && TABLE_CONSTRAINT.has((t[s] as { v: string }).v))).length;
          if (n > DO_LIMITS.column) return columns(`a table of ${n} columns`);
          break;
        }
      } else if (isWord(t[j], 'INDEX') || (isWord(t[j], 'UNIQUE') && isWord(t[j + 1], 'INDEX'))) {
        for (let k = j + 1; k < t.length && t[k]!.k !== ';'; k++) {
          if (t[k]!.k !== '(' || !isWord(t[k - 2], 'ON')) continue;
          const n = itemsIn(t, close, k).length;
          if (n > DO_LIMITS.column) return columns(`an index on ${n} columns`);
          break;
        }
      }
    }
    /* A SELECT's result columns, a `*` counted as one. */
    if (x.v === 'SELECT') {
      let n = 1;
      for (let k = i + 1; k < t.length; k++) {
        const y = t[k]!;
        if (y.k === '(') k = close[k]!;
        else if (y.k === ',') n++;
        else if (y.k === ')' || y.k === ';' || (y.k === 'word' && SELECT_END.has(y.v))) break;
      }
      if (n > DO_LIMITS.column) return columns(`${n} result columns`);
    }
    /* Each row of a VALUES. */
    if (x.v === 'VALUES')
      for (let k = i + 1; t[k]?.k === '('; ) {
        const n = itemsIn(t, close, k).length;
        if (n > DO_LIMITS.column) return columns(`a row of ${n} values`);
        k = close[k]! + 1;
        if (t[k]?.k !== ',') break;
        k++;
      }
  }

  const depth = depthOf(t, close, 0, t.length);
  if (depth > DO_LIMITS.exprDepth)
    return ['EXPR_TOO_DEEP', `an expression here is at least ${depth} deep; the ceiling is ${DO_LIMITS.exprDepth} (DO_LIMITS.exprDepth). Split it, or bind the list as one JSON array and read it with json_each.`];
  return null;
}

/** Shapes already read, by their text: the kernel's statements are a few hundred texts asked again and again. */
const SHAPES = new Map<string, [SqlErrorCode, string] | null>();

/**
 * The Durable Object's ceilings on a statement's shape, which `node:sqlite` holds far higher (2,000 columns, 1,000
 * arguments, a depth of 1,000), so a statement the self-host ran could fail on the Cloud: more than `DO_LIMITS.column`
 * columns in a table, an index, a SELECT's results or a VALUES row; a call to one of SQLite's functions with more than
 * `DO_MEASURED.functionArg` arguments; an expression deeper than `DO_LIMITS.exprDepth`.
 *
 * COUNTED FROM BELOW, so what it refuses the DO refuses too, and what it lets by that the DO refuses (a SELECT whose `*`
 * stands for a hundred columns, an `ALTER TABLE ADD COLUMN` past the hundredth, a depth hidden in a shape `depthOf`
 * does not read) is the driver's to refuse, and `guarded` names it after the fact. ponytail: a parser would count all of
 * them; nothing in the kernel comes near any of them, which is why this is a net and not a gate.
 *
 * A STATEMENT OF 200 CHARACTERS OR FEWER IS NEVER READ: each ceiling takes a hundred commas or operators to pass.
 */
export function guardShape(text: string): void {
  if (text.length <= 200) return;
  let shape = SHAPES.get(text);
  if (shape === undefined) {
    shape = shapeOf(text);
    if (text.length <= 20_000) {
      if (SHAPES.size >= 512) SHAPES.clear();
      SHAPES.set(text, shape);
    }
  }
  if (shape) throw new SqlError(shape[0], shape[1]);
}

/**
 * Where a value sent from outside holds U+0000, as a path (`rows[2].note`, a key by its own name), or `null`.
 *
 * FOR THE DOORS, so a caller who sends one is told where in words and with a 400, rather than meeting `guard`'s throw
 * as a crash: the API's router and the MCP endpoint ask it of every body. A key holding one is named by its parent and
 * `(a key)`. Iterative, so a body nested ten thousand deep cannot overflow it.
 */
export function nulAt(value: unknown): string | null {
  const stack: [unknown, string][] = [[value, '']];
  while (stack.length > 0) {
    const [v, at] = stack.pop()!;
    if (typeof v === 'string') {
      if (v.includes('\u0000')) return at === '' ? 'body' : at;
    } else if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) stack.push([v[i], `${at}[${i}]`]);
    } else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k.includes('\u0000')) return `${at === '' ? 'body' : at} (a key)`;
        stack.push([x, at === '' ? k : `${at}.${k}`]);
      }
    }
  }
  return null;
}

/** What a door says to a value holding U+0000, at the path `nulAt` found. */
export const nulSaid = (at: string): string =>
  `${at} has a hidden character in it (U+0000, the null character), which a record cannot keep in text. Send it again without that character.`;

/**
 * The seven checks of `37 §5.3`, in its order, then the statement's shape (`guardShape`), and a throw of `SqlError` at
 * the first that fails.
 *
 * `params` IS `unknown[]` ON PURPOSE: the type check at step 4 is the one TypeScript cannot make for a caller that
 * went around it. Step 4 also holds each text to no U+0000 and each value to `DO_MEASURED.length`.
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
    if (v === null) continue;
    if (typeof v === 'string') {
      /* A NUL IN A TEXT IS REFUSED ON BOTH HOSTS. Measured: `node:sqlite` binds a string up to its first U+0000 and
         stores 'a\u0000b' as 'a' without a word, and the Durable Object stores all three characters, which its own
         `length()` and every text function then read as 'a'. Neither keeps what was sent, so neither is let try. */
      if (v.includes('\u0000')) throw new SqlError('SYNTAX', `parameter ${i + 1} holds the character U+0000, which a text cannot keep (node:sqlite cuts it there); take it out, or bind the value as bytes.`);
      tooBig(v.length * 3 > DO_MEASURED.length ? utf8Bytes(v) : 0, i);
      continue;
    }
    if (v instanceof Uint8Array) {
      tooBig(v.byteLength, i);
      continue;
    }
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

  // 8. The shape: columns, a function's arguments and expression depth, which the DO refuses and Node allows.
  guardShape(query);
}

/**
 * The checks a script can fail (`37 §5.4`): a transaction keyword opening any statement, the byte ceiling, which SQLite
 * applies to the whole text handed to it, and each statement's shape (`guardShape`), which it applies statement by
 * statement as the DO does.
 *
 * A TRIGGER'S BODY IS TAKEN OUT FIRST, because its `BEGIN ... END` is the trigger's and not a transaction: migration 31
 * declares `decision_kept`, and without this both hosts refused it and no record opened past migration 30. What
 * follows the body is still read, so `CREATE TRIGGER ... END; BEGIN;` is refused as before.
 */
export function guardScript(sql: string): void {
  const txn = TXN_IN_SCRIPT.exec(sql.replace(TRIGGER_BODY, 'CREATE TRIGGER'));
  if (txn) throw new SqlError('TXN_STATEMENT_FORBIDDEN', `a statement in this script begins with ${txn[1]!.toUpperCase()}; use transactionSync.`);
  tooLong(sql);
  guardShape(sql);
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
  /* A GROUP BY or ORDER BY of more terms than `DO_LIMITS.column`, which is SQLite's limit on both. */
  ['too many terms in ', 'TOO_MANY_COLUMNS'],
  ['too many arguments on function', 'SYNTAX'],
  /* `SQLITE_TOOBIG` for one value, which SQLite gives a statement too long as well (`DO_MEASURED.length`). */
  ['string or blob too big', 'STATEMENT_TOO_LONG'],
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
 * A driver error as a `SqlError` when its sentence carries one of the fragments above, and unchanged when it does not.
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
  /* THE DURABLE OBJECT DOES NOT SAY: measured on workerd 1.20260903.1, `sqlite_version()` is `not authorized to use
     function: sqlite_version`. A version is for the operator's sentence, so its absence is a word and not a failure. */
  let sqlite = 'not said';
  try {
    sqlite = String(run('SELECT sqlite_version() AS v')[0]?.v);
  } catch {
    /* The host keeps it to itself. */
  }

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
