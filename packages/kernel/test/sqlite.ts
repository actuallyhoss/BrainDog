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

import type { Param, Row, Sql } from '@braindog/ports';

export type NodeSql = Sql & { db: DatabaseSync; close(): void };

export function openSqlite(path = ':memory:'): NodeSql {
  const db = new DatabaseSync(path);
  /* Foreign keys OFF is SQLite's default and the schema does not declare any: the record's integrity
     is the write path's, in one transaction, where a refusal can carry a sentence. */
  db.exec('PRAGMA journal_mode = WAL');

  let depth = 0;

  const sql: NodeSql = {
    db,
    close: () => db.close(),

    exec(text: string, ...params: Param[]): void {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },

    all<T = Row>(text: string, ...params: Param[]): T[] {
      return db.prepare(text).all(...(params as never[])) as T[];
    },

    one<T = Row>(text: string, ...params: Param[]): T | undefined {
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
