/**
 * The driver half of the suite: what the `Sql` port answers on each host, below the kernel.
 *
 * Values in and out, the guard's ceilings, transactions, FTS5, JSON, the SQL the kernel reaches for, and the
 * Durable Object's limits the guard does not count. Every case starts on an empty database of its own.
 *
 * WHERE A CASE PINS A VALUE IT WAS MEASURED ON `node:sqlite` (Node 24.13.0, SQLite 3.50.4) or is the Durable Object's
 * documented ceiling (`DO_LIMITS`, `packages/ports/src/sql.ts`). Where the Durable Object's answer is not known, the case
 * asserts only what the contract promises and puts what it saw in its trace, so `compare.run.ts` finds the difference.
 */

import { DO_LIMITS, bootProbe, measureCaps, type Param, type Sql } from '@braindog/ports';

import { codeOf, thrownCode, type Case } from './suite.ts';

/** `n` placeholders, comma-separated. */
const marks = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

/** The rows of a table holding one value each, in insert order, with SQLite's own word for each storage class. */
const held = (sql: Sql) =>
  sql.all<{ k: string; x: Param; t: string }>('SELECT k, x, typeof(x) AS t FROM v ORDER BY rowid');

const table = (sql: Sql): void => sql.exec('CREATE TABLE v (k TEXT NOT NULL, x)');

export const SQL_CASES: Case[] = [
  /* ── values ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'values-round-trip',
    area: 'values',
    says: 'every kind of value a Param can be is read back as itself, with the storage class it was written as',
    run(h, t) {
      table(h.sql);
      const sent: [string, Param, string][] = [
        ['zero', 0, 'number'],
        ['negative', -7, 'number'],
        ['largest-safe', Number.MAX_SAFE_INTEGER, 'number'],
        ['smallest-safe', -Number.MAX_SAFE_INTEGER, 'number'],
        ['fraction', 0.1, 'real'],
        ['negative-fraction', -2.5, 'real'],
        ['huge', 1e308, 'real'],
        ['subnormal', 5e-324, 'real'],
        ['empty-text', '', 'text'],
        ['ascii', 'hello', 'text'],
        ['arabic', 'فاتورة الكهرباء', 'text'],
        ['emoji', 'service dog 🐕‍🦺', 'text'],
        ['combining', 'é', 'text'],
        ['null', null, 'null'],
        ['blob', Uint8Array.of(0, 1, 127, 128, 255), 'blob'],
      ];
      for (const [k, x] of sent) h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', k, x);
      const rows = held(h.sql);
      t.equal(rows.length, sent.length, 'a value was not written');
      for (const [i, [k, x, kind]] of sent.entries()) {
        const row = rows[i]!;
        t.equal(row.k, k, 'the rows came back out of order');
        t.deepEqual(row.x, x, `${k} came back as something else`);
        /* A WHOLE NUMBER'S STORAGE CLASS IS LEFT TO THE TRACE: `node:sqlite` binds every JavaScript number as a REAL
           (measured: 1 is typeof 'real' and CAST text '1.0'), and `number-storage-class` is the case about it. */
        if (kind !== 'number') t.equal(row.t, kind, `${k} was stored as ${row.t}`);
      }
      /* AND LEFT OUT OF THIS TRACE TOO, so one difference is reported once, by the case that is about it. */
      return { rows: rows.map((r, i) => (sent[i]![2] === 'number' ? { k: r.k, x: r.x } : r)) };
    },
  },
  {
    id: 'number-storage-class',
    area: 'values',
    says: 'a whole JavaScript number is bound the same way on both hosts, so SQL that turns it into text writes the same text',
    /* NO `drift`, BECAUSE THE DURABLE OBJECT'S ANSWER IS NOT MEASURED. `node:sqlite` binds every number as a REAL, so
       `CAST(? AS TEXT)` of 1 is '1.0' and a number bound into a TEXT column or `json_set` is written with a `.0`. If the
       Durable Object binds a whole number as an INTEGER, the traces differ here and `compare.run.ts` says so. */
    run(h, t) {
      const sent: [string, number][] = [
        ['one', 1],
        ['largest-safe', Number.MAX_SAFE_INTEGER],
        ['half', 0.5],
        ['minus-zero', -0],
      ];
      const seen = sent.map(([k, n]) => {
        const row = h.sql.one<{ v: Param; t: string; s: string; j: string }>(
          "SELECT ? AS v, typeof(?) AS t, CAST(? AS TEXT) AS s, json_object('n', ?) AS j",
          n,
          n,
          n,
          n,
        )!;
        t.ok(row.v === n || (Object.is(n, -0) && row.v === 0), `${k} came back as ${String(row.v)}`);
        return { k, t: row.t, s: row.s, j: row.j };
      });
      /* AND INTO A TEXT COLUMN, which is where the class shows in a stored value. */
      h.sql.exec('CREATE TABLE words (w TEXT)');
      h.sql.exec('INSERT INTO words (w) VALUES (?)', 1);
      const word = h.sql.one<{ w: string }>('SELECT w FROM words')!.w;
      return { seen, intoText: word };
    },
  },
  {
    id: 'blob-shapes',
    area: 'values',
    says: 'a BLOB comes back as a Uint8Array on both hosts, an empty one included',
    run(h, t) {
      table(h.sql);
      h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'five', Uint8Array.of(9, 8, 7, 6, 5));
      h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'empty', new Uint8Array(0));
      h.sql.exec("INSERT INTO v (k, x) VALUES ('literal', x'00ff')");
      const rows = held(h.sql);
      for (const row of rows) {
        t.ok(row.x instanceof Uint8Array, `${row.k} came back as ${Object.prototype.toString.call(row.x)}, and the kernel reads a Uint8Array`);
        t.equal(row.t, 'blob', `${row.k} was stored as ${row.t}`);
      }
      t.deepEqual(rows.map((r) => r.x), [Uint8Array.of(9, 8, 7, 6, 5), new Uint8Array(0), Uint8Array.of(0, 255)], 'the bytes changed');
      const one = h.sql.one<{ x: Param }>("SELECT x FROM v WHERE k = 'five'")!;
      t.ok(one.x instanceof Uint8Array, '`one` hands back a different BLOB shape from `all`');
      return { rows };
    },
  },
  {
    id: 'text-with-nul',
    area: 'values',
    says: 'a string holding U+0000 is stored whole or refused, never cut short',
    drift: {
      host: 'node:sqlite',
      why: "node:sqlite binds a string up to its first U+0000 (measured on Node 24.13.0: 'a\\u0000b' is stored as 'a', length 1), so a text field holding one loses its tail without a word",
    },
    run(h, t) {
      table(h.sql);
      const sent = 'before\u0000after';
      const code = codeOf(() => h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'nul', sent));
      if (code !== 'ok') return { refused: code };
      const row = h.sql.one<{ x: string; n: number }>('SELECT x, length(CAST(x AS BLOB)) AS n FROM v')!;
      t.equal(row.x, sent, 'the text was cut at the NUL');
      t.equal(row.n, 12, 'the stored bytes are not the twelve that were sent');
      return { stored: row.x, bytes: row.n };
    },
  },
  {
    id: 'bigint-param',
    area: 'values',
    says: 'a bigint, which the Param type allows, binds as an INTEGER and reads back as a number',
    run(h, t) {
      table(h.sql);
      const code = codeOf(() => h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'big', 42n));
      t.equal(code, 'ok', 'a bigint the guard let through was refused by the driver');
      const rows = held(h.sql);
      t.deepEqual(rows, [{ k: 'big', x: 42, t: 'integer' }], 'the bigint came back as something else');
      return { rows };
    },
  },
  {
    id: 'int-too-large-to-read',
    area: 'values',
    says: 'an INTEGER past 2^53 - 1 is refused on the way out, never handed back rounded',
    run(h, t) {
      const code = codeOf(() => h.sql.all('SELECT 9007199254740993 AS v'));
      t.equal(code, 'INT_OUT_OF_RANGE', 'an integer JavaScript cannot hold came back as a number');
      return { code };
    },
  },

  /* ── the guard ──────────────────────────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'guard-refuses-non-params',
    area: 'guard',
    says: 'Case #1 of 33 §3: a value that is not a Param is refused as SYNTAX before either driver binds it',
    run(h, t) {
      table(h.sql);
      const sent: [string, unknown][] = [
        ['true', true],
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['-Infinity', Number.NEGATIVE_INFINITY],
        ['object', {}],
        ['array', []],
        ['Date', new Date(0)],
        ['undefined', undefined],
        ['ArrayBuffer', new ArrayBuffer(2)],
      ];
      const codes: Record<string, string> = {};
      for (const [name, v] of sent) codes[name] = codeOf(() => h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', name, v as never));
      for (const [name] of sent) t.equal(codes[name], 'SYNTAX', `${name} was not refused as SYNTAX`);
      t.equal(h.sql.all('SELECT 1 FROM v').length, 0, 'a refused value left a row');
      return { codes };
    },
  },
  {
    id: 'guard-int-range',
    area: 'guard',
    says: 'an integer past ±(2^53 - 1) is refused as INT_OUT_OF_RANGE, as a number or a bigint, and the edge is written exactly',
    run(h, t) {
      table(h.sql);
      const codes = {
        over: codeOf(() => h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'over', 2 ** 53)),
        under: codeOf(() => h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'under', -(2 ** 53))),
        bigOver: codeOf(() => h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'bigOver', 2n ** 53n)),
        edge: codeOf(() => h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'edge', 2n ** 53n - 1n)),
      };
      t.deepEqual(codes, { over: 'INT_OUT_OF_RANGE', under: 'INT_OUT_OF_RANGE', bigOver: 'INT_OUT_OF_RANGE', edge: 'ok' }, 'the integer edge moved');
      t.deepEqual(held(h.sql), [{ k: 'edge', x: Number.MAX_SAFE_INTEGER, t: 'integer' }], 'the edge was not written exactly');
      return { codes };
    },
  },
  {
    id: 'guard-params-ceiling',
    area: 'guard',
    says: 'a hundred bound parameters run, and a hundred and one are TOO_MANY_PARAMS',
    run(h, t) {
      table(h.sql);
      h.sql.exec("INSERT INTO v (k, x) VALUES ('a', 50)");
      const values = (n: number): Param[] => Array.from({ length: n }, (_, i) => i);
      const at100 = h.sql.one<{ n: number }>(`SELECT count(*) AS n FROM v WHERE x IN (${marks(100)})`, ...values(100))!.n;
      t.equal(at100, 1, 'a hundred parameters did not run');
      const code = codeOf(() => h.sql.all(`SELECT count(*) AS n FROM v WHERE x IN (${marks(101)})`, ...values(101)));
      t.equal(code, 'TOO_MANY_PARAMS', 'a hundred and one parameters were not refused');
      return { at100, at101: code, ceiling: DO_LIMITS.variableNumber };
    },
  },
  {
    id: 'guard-like-ceiling',
    area: 'guard',
    says: 'a LIKE or GLOB pattern of 50 UTF-8 bytes runs and one of 51 is LIKE_TOO_LONG, counted in bytes',
    run(h, t) {
      table(h.sql);
      /* A ROW, because the Durable Object accepts a long pattern against an empty table and refuses it once there is one. */
      h.sql.exec("INSERT INTO v (k, x) VALUES ('a', 'abc')");
      const like = (p: string) => codeOf(() => h.sql.all('SELECT k FROM v WHERE x LIKE ?', p));
      const glob = (p: string) => codeOf(() => h.sql.all('SELECT k FROM v WHERE x GLOB ?', p));
      const codes = {
        ascii50: like('%'.repeat(50)),
        ascii51: like('%'.repeat(51)),
        twoByte50: like('é'.repeat(25)),
        twoByte52: like('é'.repeat(26)),
        glob50: glob('*'.repeat(50)),
        glob51: glob('*'.repeat(51)),
      };
      t.deepEqual(
        codes,
        { ascii50: 'ok', ascii51: 'LIKE_TOO_LONG', twoByte50: 'ok', twoByte52: 'LIKE_TOO_LONG', glob50: 'ok', glob51: 'LIKE_TOO_LONG' },
        'the pattern ceiling moved',
      );
      return { codes };
    },
  },
  {
    id: 'guard-compound-ceiling',
    area: 'guard',
    says: 'five compound SELECT terms run and a sixth is COMPOUND_TOO_LONG',
    run(h, t) {
      const terms = (n: number) => Array.from({ length: n }, (_, i) => `SELECT ${i} AS n`).join(' UNION ALL ');
      const five = h.sql.all<{ n: number }>(terms(5)).map((r) => r.n);
      t.deepEqual(five, [0, 1, 2, 3, 4], 'five terms did not run');
      const six = codeOf(() => h.sql.all(terms(6)));
      t.equal(six, 'COMPOUND_TOO_LONG', 'a sixth term was not refused');
      return { five, six };
    },
  },
  {
    id: 'guard-statement-length',
    area: 'guard',
    says: 'a statement of exactly 100,000 UTF-8 bytes runs and one of 100,001 is STATEMENT_TOO_LONG',
    run(h, t) {
      const head = 'SELECT 1 AS v --';
      const of = (bytes: number) => head + 'x'.repeat(bytes - head.length);
      const at = codeOf(() => h.sql.all(of(DO_LIMITS.sqlLength)));
      const over = codeOf(() => h.sql.all(of(DO_LIMITS.sqlLength + 1)));
      /* AND IN A SCRIPT, which `exec` with no parameters is, and which SQLite measures whole. */
      const script = codeOf(() => h.sql.exec(`CREATE TABLE s (x);${' '.repeat(DO_LIMITS.sqlLength)}`));
      t.deepEqual({ at, over, script }, { at: 'ok', over: 'STATEMENT_TOO_LONG', script: 'STATEMENT_TOO_LONG' }, 'the length ceiling moved');
      return { at, over, script };
    },
  },
  {
    id: 'guard-one-statement',
    area: 'guard',
    says: 'Case #2 of 33 §3: a read or a bound write is one statement, and a second is MULTI_STATEMENT_PARAMS; a script runs whole',
    run(h, t) {
      table(h.sql);
      const codes = {
        read: codeOf(() => h.sql.all('SELECT 1 AS a; SELECT 2 AS b')),
        one: codeOf(() => h.sql.one('SELECT 1 AS a; SELECT 2 AS b')),
        bound: codeOf(() => h.sql.exec("INSERT INTO v (k, x) VALUES ('a', ?); INSERT INTO v (k, x) VALUES ('b', 2)", 1)),
      };
      t.deepEqual(codes, { read: 'MULTI_STATEMENT_PARAMS', one: 'MULTI_STATEMENT_PARAMS', bound: 'MULTI_STATEMENT_PARAMS' }, 'a second statement was not refused');
      t.equal(h.sql.all('SELECT 1 FROM v').length, 0, 'a refused pair wrote its first half');
      h.sql.exec("INSERT INTO v (k, x) VALUES ('a', 1); INSERT INTO v (k, x) VALUES ('b', 2)");
      const script = h.sql.all<{ k: string }>('SELECT k FROM v ORDER BY rowid').map((r) => r.k);
      t.deepEqual(script, ['a', 'b'], 'a script with no parameters did not run every statement');
      return { codes, script };
    },
  },
  {
    id: 'guard-transaction-statements',
    area: 'guard',
    says: 'Case #3 of 33 §3: a transaction statement is refused wherever the guard reads it, and a raw one is the host\'s',
    run(h, t) {
      const guarded = {
        read: codeOf(() => h.sql.all('SAVEPOINT a')),
        bound: codeOf(() => h.sql.exec('BEGIN', 1)),
        inScript: codeOf(() => h.sql.exec('CREATE TABLE s (x); BEGIN')),
        afterTrigger: codeOf(() =>
          h.sql.exec('CREATE TABLE s (x); CREATE TRIGGER s_t AFTER INSERT ON s BEGIN SELECT 1; END; COMMIT'),
        ),
      };
      t.deepEqual(
        guarded,
        { read: 'TXN_STATEMENT_FORBIDDEN', bound: 'TXN_STATEMENT_FORBIDDEN', inScript: 'TXN_STATEMENT_FORBIDDEN', afterTrigger: 'TXN_STATEMENT_FORBIDDEN' },
        'a transaction statement got past the guard',
      );
      /* A RAW `SAVEPOINT` WITH NO PARAMETERS GOES TO THE DRIVER ON PURPOSE, on both hosts: `attempt()` asks each port
         once and reads the answer (`kernel/src/tx.ts`). `node:sqlite` runs it; the Durable Object refuses it in the one
         sentence `attempt()` knows. Anything else would turn every refusal inside an attempt into a throw. The answer is
         the host's and is not traced; that it is one of the two is the contract. */
      let raw: string;
      try {
        h.sql.exec('SAVEPOINT conformance');
        h.sql.exec('RELEASE conformance');
        raw = 'runs';
      } catch (e) {
        raw = /storage\.transaction/.test(e instanceof Error ? e.message : String(e)) ? 'host-owns' : `other: ${thrownCode(e)}`;
      }
      t.ok(raw === 'runs' || raw === 'host-owns', `a raw SAVEPOINT answered ${raw}, which attempt() reads as a real failure`);
      return { guarded };
    },
  },
  {
    id: 'guard-trigger-body',
    area: 'guard',
    says: "a trigger's own BEGIN ... END is its body and not a transaction, and the trigger runs",
    run(h, t) {
      h.sql.exec(
        'CREATE TABLE s (x); CREATE TABLE seen (x); CREATE TRIGGER s_seen AFTER INSERT ON s BEGIN INSERT INTO seen (x) VALUES (new.x); END',
      );
      h.sql.exec('INSERT INTO s (x) VALUES (?)', 'fired');
      const seen = h.sql.all<{ x: string }>('SELECT x FROM seen').map((r) => r.x);
      t.deepEqual(seen, ['fired'], 'the trigger did not run');
      return { seen };
    },
  },

  /* ── transactions ───────────────────────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'transaction-commit-and-rollback',
    area: 'transactions',
    says: 'transactionSync commits what it ran and hands back its value; a throw rolls everything back and goes up as itself',
    run(h, t) {
      table(h.sql);
      const value = h.sql.transactionSync(() => {
        h.sql.exec("INSERT INTO v (k, x) VALUES ('kept', 1)");
        return { answer: 42 };
      });
      t.deepEqual(value, { answer: 42 }, 'the value did not come back');
      const thrown = new TypeError('a real error');
      let caught: unknown = null;
      try {
        h.sql.transactionSync(() => {
          h.sql.exec("INSERT INTO v (k, x) VALUES ('undone', 2)");
          h.sql.exec("UPDATE v SET x = 99 WHERE k = 'kept'");
          throw thrown;
        });
      } catch (e) {
        caught = e;
      }
      t.ok(caught === thrown, 'the throw came back as something other than itself');
      const rows = h.sql.all<{ k: string; x: number }>('SELECT k, x FROM v ORDER BY rowid');
      t.deepEqual(rows, [{ k: 'kept', x: 1 }], 'a thrown transaction left writes behind');
      /* AND A DRIVER REFUSAL INSIDE ONE IS THE SAME: the guard's throw rolls back what came before it. */
      const code = codeOf(() =>
        h.sql.transactionSync(() => {
          h.sql.exec("INSERT INTO v (k, x) VALUES ('before', 3)");
          h.sql.all(`SELECT 1 WHERE 1 IN (${marks(101)})`, ...Array.from({ length: 101 }, (_, i) => i));
        }),
      );
      t.equal(code, 'TOO_MANY_PARAMS', 'the refusal inside the transaction changed shape');
      t.equal(h.sql.all("SELECT 1 FROM v WHERE k = 'before'").length, 0, 'a refusal inside a transaction kept the write before it');
      return { rows, code };
    },
  },
  {
    id: 'transaction-nested',
    area: 'transactions',
    says: 'a nested transactionSync whose throw is caught undoes only its own writes, and the outer one commits',
    drift: {
      host: 'node:sqlite',
      why: "the self-host's port answers a nested call with fn() (apps/selfhost/src/server.ts, transactionSync: `if (depth > 0) return fn()`), so the inner writes stay; the Durable Object's is a savepoint (apps/worker/src/index.ts storageSql, measured on workerd 1.20260903.1)",
    },
    run(h, t) {
      table(h.sql);
      h.sql.transactionSync(() => {
        h.sql.exec("INSERT INTO v (k, x) VALUES ('outer', 1)");
        try {
          h.sql.transactionSync(() => {
            h.sql.exec("INSERT INTO v (k, x) VALUES ('inner', 2)");
            throw new Error('the inner one says no');
          });
        } catch {
          /* caught by its caller, which carries on */
        }
        h.sql.exec("INSERT INTO v (k, x) VALUES ('after', 3)");
      });
      const rows = h.sql.all<{ k: string }>('SELECT k FROM v ORDER BY rowid').map((r) => r.k);
      t.deepEqual(rows, ['outer', 'after'], 'the inner transaction kept its writes after it threw');
      return { rows };
    },
  },

  /* ── the driver's own behaviour ─────────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'foreign-keys-off',
    area: 'driver',
    says: "foreign keys are not enforced on either host, as migration 1's `decision.supersedes` comment and 37 §5.1 rely on",
    run(h, t) {
      h.sql.exec('CREATE TABLE parent (id TEXT PRIMARY KEY); CREATE TABLE child (id TEXT PRIMARY KEY, parent TEXT REFERENCES parent(id))');
      const orphan = codeOf(() => h.sql.exec('INSERT INTO child (id, parent) VALUES (?, ?)', 'c1', 'nobody'));
      h.sql.exec('INSERT INTO parent (id) VALUES (?)', 'p1');
      h.sql.exec('INSERT INTO child (id, parent) VALUES (?, ?)', 'c2', 'p1');
      const drop = codeOf(() => h.sql.exec('DELETE FROM parent WHERE id = ?', 'p1'));
      t.deepEqual({ orphan, drop }, { orphan: 'ok', drop: 'ok' }, 'a foreign key was enforced');
      const children = h.sql.all<{ id: string }>('SELECT id FROM child ORDER BY id').map((r) => r.id);
      t.deepEqual(children, ['c1', 'c2'], 'a child row went with its parent');
      return { orphan, drop, children };
    },
  },
  {
    id: 'double-quoted-string-refused',
    area: 'driver',
    says: 'a double-quoted word is an identifier and never a string literal, so a typo is an error on both hosts',
    run(h, t) {
      table(h.sql);
      const code = codeOf(() => h.sql.all('SELECT "nope" AS v FROM v'));
      t.ok(code !== 'ok', 'a double-quoted string was read as a literal');
      return { refused: code !== 'ok' };
    },
  },
  {
    id: 'duplicate-column-names',
    area: 'driver',
    says: 'a row with two columns of one name comes back the same way on both hosts',
    run(h, t) {
      /* MEASURED ON `node:sqlite`: the later column wins, `{ a: 2 }`. A join that selects `e.*, x.*` meets this. */
      const code = codeOf(() => h.sql.all('SELECT 1 AS a, 2 AS a'));
      const row = code === 'ok' ? h.sql.one('SELECT 1 AS a, 2 AS a') : null;
      t.ok(code === 'ok', `two columns of one name were refused (${code})`);
      return { row };
    },
  },
  {
    id: 'caps-measured',
    area: 'driver',
    says: 'measureCaps finds FTS5, JSON1 and the expression index on both hosts, so the boot probe opens the record',
    run(h, t) {
      const caps = measureCaps((text, ...params) => h.sql.all(text, ...params));
      t.equal(caps.fts5, true, 'FTS5 is missing');
      t.equal(caps.json, true, 'JSON1 is missing');
      t.equal(caps.expressionIndexUsed, true, "the compiler's bound form of an expression-index read is not planned onto the index (Q12)");
      bootProbe(caps, h.name);
      const left = h.sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE name LIKE '\\_caps%' ESCAPE '\\'");
      t.equal(left.length, 0, 'the probe left a table behind');
      return { fts5: caps.fts5, json: caps.json, expressionIndexUsed: caps.expressionIndexUsed };
    },
  },

  /* ── search ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'fts5-tokenizer',
    area: 'search',
    says: "the record's FTS5 tokenizer folds case and diacritics, reads Arabic, takes prefixes and ranks the same on both hosts",
    run(h, t) {
      /* THE TABLE AS MIGRATION 1 DECLARES `entry_fts`, tokenizer and all. */
      h.sql.exec("CREATE VIRTUAL TABLE f USING fts5(id UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2')");
      const docs: [string, string][] = [
        ['a', 'Café crème brûlée'],
        ['b', 'فاتورة الكهرباء'],
        ['c', 'Invoice 41 for Halden'],
        ['d', 'ÉCOLE naïve résumé'],
        ['e', 'invoice invoice invoice draft'],
      ];
      for (const [id, text] of docs) h.sql.exec('INSERT INTO f (id, text) VALUES (?, ?)', id, text);
      const match = (q: string) => h.sql.all<{ id: string }>('SELECT id FROM f WHERE f MATCH ? ORDER BY bm25(f), id', q).map((r) => r.id);
      const queries = ['"cafe"*', '"creme"*', '"فاتو"*', '"invoice"*', '"ecole"* AND "naive"*', '"resume"*', '"halden"* AND "inv"*', '"nope"*'];
      const found = Object.fromEntries(queries.map((q) => [q, match(q)]));
      t.deepEqual(
        found,
        {
          '"cafe"*': ['a'],
          '"creme"*': ['a'],
          '"فاتو"*': ['b'],
          '"invoice"*': ['e', 'c'],
          '"ecole"* AND "naive"*': ['d'],
          '"resume"*': ['d'],
          '"halden"* AND "inv"*': ['c'],
          '"nope"*': [],
        },
        'the tokenizer or the ranking answered differently',
      );
      const marked = h.sql.one<{ h: string }>("SELECT highlight(f, 1, '[', ']') AS h FROM f WHERE f MATCH ?", '"cafe"*')!.h;
      t.equal(marked, '[Café] crème brûlée', 'highlight marked a different span');
      /* AND THE INDEX'S OWN CHECK, which the kernel's boot leans on to tell a damaged index from a sound one. */
      const check = codeOf(() => h.sql.exec("INSERT INTO f (f) VALUES ('integrity-check')"));
      t.equal(check, 'ok', 'the integrity check failed on a sound index');
      return { found, marked };
    },
  },

  /* ── the SQL the kernel reaches for ─────────────────────────────────────────────────────────────────────────────── */
  {
    id: 'json-functions',
    area: 'driver',
    says: 'the JSON1 functions the kernel uses answer the same values and types on both hosts',
    run(h, t) {
      const doc = JSON.stringify({ a: 1, b: 2.5, c: 'three', d: [1, 'two', null], e: { f: true }, big: 9007199254740991 });
      const row = h.sql.one<Record<string, Param>>(
        `SELECT json_extract(?1, '$.a') AS a, typeof(json_extract(?1, '$.a')) AS at,
                json_extract(?1, '$.b') AS b, typeof(json_extract(?1, '$.b')) AS bt,
                json_extract(?1, '$.c') AS c, json_extract(?1, '$.d') AS d, json_type(?1, '$.e.f') AS ft,
                json_extract(?1, '$.big') AS big, json_array_length(?1, '$.d') AS dn,
                json_valid(?1) AS ok, json_valid('{') AS bad,
                json_set(?1, '$.a', 'one', '$.g', json('[1,2]')) AS setted,
                json_remove(?1, '$.d', '$.e') AS removed,
                json_patch('{"a":1,"b":2}', '{"b":null,"c":3}') AS patched,
                ?1 -> '$.d' AS arrow`,
        doc,
      )!;
      t.deepEqual(
        { a: row.a, at: row.at, b: row.b, bt: row.bt, c: row.c, d: row.d, ft: row.ft, big: row.big, dn: row.dn, ok: row.ok, bad: row.bad },
        { a: 1, at: 'integer', b: 2.5, bt: 'real', c: 'three', d: '[1,"two",null]', ft: 'true', big: 9007199254740991, dn: 3, ok: 1, bad: 0 },
        'a JSON function answered differently',
      );
      const each = h.sql.all<{ key: number; value: Param; type: string }>(
        "SELECT key, value, type FROM json_each(?) ORDER BY key",
        JSON.stringify(['x', 2, null, { y: 1 }]),
      );
      t.deepEqual(
        each,
        [
          { key: 0, value: 'x', type: 'text' },
          { key: 1, value: 2, type: 'integer' },
          { key: 2, value: null, type: 'null' },
          { key: 3, value: '{"y":1}', type: 'object' },
        ],
        'json_each walked the array differently',
      );
      /* A LIST BOUND AS ONE JSON ARRAY, which is how the kernel stays under the hundred-parameter ceiling. */
      const ids = Array.from({ length: 130 }, (_, i) => `id_${i}`);
      const counted = h.sql.one<{ n: number }>('SELECT count(*) AS n FROM json_each(?)', JSON.stringify(ids))!.n;
      t.equal(counted, 130, 'a list bound as one array lost members');
      const grouped = h.sql.one<{ g: string }>(
        "SELECT json_group_array(x) AS g FROM (SELECT 'b' AS x UNION ALL SELECT 'a' UNION ALL SELECT 'c')",
      )!.g;
      return {
        row: { ...row, setted: JSON.parse(String(row.setted)), removed: JSON.parse(String(row.removed)), patched: JSON.parse(String(row.patched)) },
        each,
        grouped: JSON.parse(grouped),
      };
    },
  },
  {
    id: 'sql-features',
    area: 'driver',
    says: 'RETURNING, upserts, WITHOUT ROWID, window functions and the date functions answer the same on both hosts',
    run(h, t) {
      h.sql.exec('CREATE TABLE counter (name TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID');
      const bump = () =>
        h.sql.one<{ n: number }>(
          'INSERT INTO counter (name, n) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET n = n + 1 RETURNING n',
          'seq:things',
        )!.n;
      const bumps = [bump(), bump(), bump()];
      t.deepEqual(bumps, [1, 2, 3], 'an upsert with RETURNING counted differently');
      const ranked = h.sql.all<{ g: string; v: number; n: number }>(
        `WITH r (g, v) AS (VALUES ('a', 3), ('a', 1), ('b', 2), ('a', 2))
         SELECT g, v, row_number() OVER (PARTITION BY g ORDER BY v DESC) AS n FROM r ORDER BY g, n`,
      );
      t.deepEqual(
        ranked,
        [
          { g: 'a', v: 3, n: 1 },
          { g: 'a', v: 2, n: 2 },
          { g: 'a', v: 1, n: 3 },
          { g: 'b', v: 2, n: 1 },
        ],
        'a window function ranked differently',
      );
      const dates = h.sql.one<Record<string, Param>>(
        `SELECT date('2031-01-31', '+1 month') AS month, date('2031-03-30', 'weekday 0') AS sunday,
                julianday('2031-01-15T12:00:00Z') - julianday('2031-01-14T00:00:00Z') AS days,
                strftime('%Y-%W', '2031-01-15') AS week, date('2031-01-15T23:30:00Z') AS day,
                instr('invoice', 'voi') AS at, lower('ÉCOLE') AS lowered`,
      )!;
      t.deepEqual(
        dates,
        { month: '2031-03-03', sunday: '2031-03-30', days: 1.5, week: '2031-02', day: '2031-01-15', at: 3, lowered: 'École' },
        'a date or string function answered differently',
      );
      return { bumps, ranked, dates };
    },
  },

  /* ── the Durable Object's ceilings the guard does not count ─────────────────────────────────────────────────────── */
  {
    id: 'limit-expression-depth',
    area: 'limits',
    says: 'an expression deeper than the Durable Object\'s 100 is refused as EXPR_TOO_DEEP, and a shallow one runs',
    drift: {
      host: 'node:sqlite',
      why: 'the guard does not count expression depth (packages/ports/src/sql.ts, guard: "Expression depth is not here"); node:sqlite allows 1,000, so a statement the self-host runs fails on the Cloud',
    },
    run(h, t) {
      const chain = (n: number) => `SELECT ${Array.from({ length: n }, () => '1').join(' + ')} AS v`;
      const shallow = h.sql.one<{ v: number }>(chain(50))!.v;
      t.equal(shallow, 50, 'a shallow expression did not run');
      const deep = codeOf(() => h.sql.all(chain(150)));
      t.equal(deep, 'EXPR_TOO_DEEP', 'an expression deeper than the Durable Object allows ran');
      return { shallow, deep };
    },
  },
  {
    id: 'limit-columns',
    area: 'limits',
    says: "a table of more than the Durable Object's 100 columns is refused as TOO_MANY_COLUMNS",
    drift: {
      host: 'node:sqlite',
      why: 'DO_LIMITS.column (100) is declared and not counted by guard; node:sqlite allows 2,000',
    },
    run(h, t) {
      const create = (name: string, n: number) =>
        `CREATE TABLE ${name} (${Array.from({ length: n }, (_, i) => `c${i} TEXT`).join(', ')})`;
      const fifty = codeOf(() => h.sql.exec(create('fifty', 50)));
      const over = codeOf(() => h.sql.exec(create('over', DO_LIMITS.column + 1)));
      t.deepEqual({ fifty, over }, { fifty: 'ok', over: 'TOO_MANY_COLUMNS' }, 'the column ceiling moved');
      return { fifty, over };
    },
  },
  {
    id: 'limit-function-args',
    area: 'limits',
    says: "a call with more than the Durable Object's 32 arguments is refused, and one with 20 runs",
    drift: {
      host: 'node:sqlite',
      why: 'DO_LIMITS.functionArg (32) is declared and not counted by guard; node:sqlite on SQLite 3.50.4 allows 1,000 (measured: json_array of 40 runs)',
    },
    run(h, t) {
      const call = (n: number) => `SELECT json_array(${Array.from({ length: n }, (_, i) => String(i)).join(', ')}) AS v`;
      const twenty = h.sql.one<{ v: string }>(call(20))!.v;
      t.equal(JSON.parse(twenty).length, 20, 'twenty arguments did not run');
      const forty = codeOf(() => h.sql.all(call(40)));
      t.ok(forty !== 'ok', 'forty arguments ran where the Durable Object refuses more than 32');
      return { twenty: JSON.parse(twenty).length, fortyRefused: forty !== 'ok' };
    },
  },
  {
    id: 'limit-value-length',
    area: 'limits',
    says: 'a bound string past the Durable Object\'s length ceiling is refused, and one of a megabyte is stored whole',
    drift: {
      host: 'node:sqlite',
      why: 'DO_LIMITS.length (2 MB; workerd sets 4 MB) is declared and not counted by guard, and node:sqlite takes a billion bytes; coerce caps text but not a json field or a row\'s whole fields (kernel/src/coerce.ts TEXT_CAPS)',
    },
    run(h, t) {
      table(h.sql);
      const megabyte = 'm'.repeat(1024 * 1024);
      h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'megabyte', megabyte);
      const n = h.sql.one<{ n: number }>("SELECT length(x) AS n FROM v WHERE k = 'megabyte'")!.n;
      t.equal(n, megabyte.length, 'a megabyte was not stored whole');
      const over = codeOf(() => h.sql.exec('INSERT INTO v (k, x) VALUES (?, ?)', 'over', 'o'.repeat(4 * 1024 * 1024 + 1)));
      t.ok(over !== 'ok', 'a value past the Durable Object\'s length ceiling was stored');
      return { megabyte: n, overRefused: over !== 'ok' };
    },
  },
];
