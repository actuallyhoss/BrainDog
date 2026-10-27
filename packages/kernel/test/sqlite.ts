/**
 * The `Sql` port over `node:sqlite`, for tests and for the self-host.
 *
 * IT LIVES IN `test/` AND NOT IN `src/`, and the line is the point. `31-STACK` §1 bans `node:` imports from
 * every source file under the packages tree, so that one kernel runs unchanged in workerd, in Node
 * and in a bare test process — a package that imports a driver has chosen one of the three. The adapter is
 * the other side of that line: it is allowed to know exactly which runtime it is in, and the kernel
 * is not allowed to ask.
 *
 * `node:sqlite` is the same SQLite the Durable Object runs, which is what makes a test here evidence
 * about production rather than evidence about a mock.
 */

import { DatabaseSync } from 'node:sqlite';

import { DO_LIMITS, SqlError } from '@braindog/ports';
import type { Param, Row, Sql } from '@braindog/ports';

export type NodeSql = Sql & { db: DatabaseSync; close(): void };

/**
 * The way out of the guard, and it names why: `openSqlite(file, { raw: true, why: 'reads a damaged index' })`. A
 * test that turns the guard off says so on the line that does it, so a reader never has to guess.
 */
export type OpenOptions = { raw: true; why: string };

/* The placeholder and compound shapes `guard` reads in `ports/src/sql.ts`, so a test here refuses what production
   refuses. They are copied rather than exported because the port names them as private, and the counts must agree. */
const PLACEHOLDER = /(\b(?:LIKE|GLOB)\s*)?\?(\d*)/gi;
const COMPOUND = /\b(?:UNION|INTERSECT|EXCEPT)\b/gi;

const firstLine = (text: string): string => text.trim().split('\n', 1)[0]!.trim();

/**
 * Three of the Durable Object's ceilings, checked before `node:sqlite` sees the statement.
 *
 * THE TEST DATABASE HAS NONE OF THEM, and that is how a list of 130 ids bound as 130 placeholders passed every test and
 * answered INTERNAL on production. Both hosts wrap their database in `guarded`; the tests did not, so the
 * class of fault could only show up on a live record. The message carries the statement's first line, because the
 * test that goes red has to say which statement to bind as one array.
 */
export function sqlGuard(text: string, params: readonly Param[]): void {
  const refuse = (code: 'TOO_MANY_PARAMS' | 'COMPOUND_TOO_LONG' | 'LIKE_TOO_LONG', why: string): never => {
    throw new SqlError(code, `${why}. The statement: ${firstLine(text)}`);
  };
  if (params.length > DO_LIMITS.variableNumber)
    refuse('TOO_MANY_PARAMS', `${params.length} parameters bound; the Durable Object refuses more than ${DO_LIMITS.variableNumber}. Bind the list as one JSON array and read it with json_each`);
  const terms = (text.match(COMPOUND)?.length ?? 0) + 1;
  if (terms > DO_LIMITS.compoundSelect)
    refuse('COMPOUND_TOO_LONG', `${terms} compound SELECT arms; the Durable Object refuses more than ${DO_LIMITS.compoundSelect}`);
  let highest = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    const at = m[2] ? Number(m[2]) : highest + 1;
    highest = Math.max(highest, at);
    const pattern = params[at - 1];
    if (!m[1] || typeof pattern !== 'string') continue;
    const bytes = new TextEncoder().encode(pattern).length;
    if (bytes > DO_LIMITS.likePatternLength)
      refuse('LIKE_TOO_LONG', `the LIKE pattern at parameter ${at} is ${bytes} bytes; the Durable Object refuses more than ${DO_LIMITS.likePatternLength}`);
  }
}

/**
 * Guarded unless the caller says why not. `exec` with no parameters is a script and goes to `db.exec` unchecked, as it
 * does under `guarded`, because a migration's statements summed would read as one long compound.
 */
export function openSqlite(path = ':memory:', options?: OpenOptions): NodeSql {
  /* The type asks for a reason; an empty one is no reason, and is refused before the file is opened. */
  if (options?.raw === true && !options.why?.trim()) throw new Error('openSqlite: { raw: true } needs a why that says what the test measures');
  /* DEFENSIVE OFF, as `apps/selfhost` opens: Node 26 turns it on by default and 24.13 does not, and under it the
     kernel cannot rebuild a damaged search index (`migrate.ts`, `rebuildIndex`). */
  const db = new DatabaseSync(path, { defensive: false } as never);
  const check = options?.raw === true ? () => {} : sqlGuard;
  /* Foreign keys OFF is SQLite's default and the schema does not declare any: the record's integrity
     is the write path's, in one transaction, where a refusal can carry a sentence. */
  db.exec('PRAGMA journal_mode = WAL');

  let depth = 0;

  const sql: NodeSql = {
    db,
    close: () => db.close(),

    exec(text: string, ...params: Param[]): void {
      if (params.length === 0) db.exec(text);
      else {
        check(text, params);
        db.prepare(text).run(...(params as never[]));
      }
    },

    all<T = Row>(text: string, ...params: Param[]): T[] {
      check(text, params);
      return db.prepare(text).all(...(params as never[])) as T[];
    },

    one<T = Row>(text: string, ...params: Param[]): T | undefined {
      check(text, params);
      return db.prepare(text).get(...(params as never[])) as T | undefined;
    },

    /**
     * `33-CONTRACTS` §1 says the driver never nests, so the depth counter is here rather than in the
     * kernel's callers: a re-entrant write shares its trigger's transaction, and a second BEGIN
     * against SQLite is an error rather than a savepoint.
     */
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };

  return sql;
}

/**
 * The `Scheduler` port, recording what it was asked to do.
 *
 * A stub rather than a spy on a real alarm, because what the tests are about is the INVARIANT — the
 * alarm is the earliest pending row or it is not set — and that is a statement about the calls, not
 * about a platform.
 */
export function recordingScheduler() {
  let at: number | null = null;
  const calls: string[] = [];
  return {
    calls,
    get armed(): number | null {
      return at;
    },
    get: () => {
      calls.push('get');
      return Promise.resolve(at);
    },
    set: (ms: number) => {
      calls.push(`set:${ms}`);
      at = ms;
      return Promise.resolve();
    },
    clear: () => {
      calls.push('clear');
      at = null;
      return Promise.resolve();
    },
    wake: () => {
      calls.push('wake');
      return Promise.resolve();
    },
  };
}

/** A clock a test can move. Real time in a test is a test that is slow and flaky in one move. */
export const fixedClock = (ms: number) => {
  let at = ms;
  return { now: () => at, set: (next: number) => (at = next), advance: (by: number) => (at += by) };
};
