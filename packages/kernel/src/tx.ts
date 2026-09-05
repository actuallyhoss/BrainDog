/**
 * A refusal writes nothing.
 *
 * `transaction(fn)` rolls back on a THROW, which is the driver's contract and the right one — but
 * this record's whole posture is that a refusal is a VALUE, not an exception. So a function that
 * validates halfway through its own writes and then returns `no(...)` commits everything it did
 * before the refusal, and reports failure while having succeeded partially. That is the worst
 * available shape: the caller believes nothing happened.
 *
 * A SAVEPOINT, NOT A TRANSACTION, and that is the whole difference between this working and looking
 * like it works. The kernel's `transaction` is re-entrant: at depth greater than zero it calls the
 * function directly and opens nothing, so a throw carried out through it reaches nobody who could
 * roll anything back. An earlier version of this file relied on exactly that and rolled back only
 * at the top level — a safety net that was not there in the one case it was written for, a caller
 * doing `k.transaction(() => k.bindGrant(…))`.
 *
 * Validation before the first write is still better; this is what makes the order stop mattering.
 */

import type { Result, Sql } from '@braindog/ports';

/** Carries a refusal out through a rollback. Never escapes this file. */
class Refused extends Error {
  result: Result<unknown>;
  constructor(result: Result<unknown>) {
    super('refused');
    this.result = result;
  }
}

let depth = 0;

export function attempt<T>(sql: Sql, transaction: <R>(fn: () => R) => R, fn: () => Result<T>): Result<T> {
  /* The name is unique per nesting level, because SQLite savepoints are a stack and releasing the
     wrong one releases everything above it. */
  const name = `dog_attempt_${++depth}`;
  try {
    return transaction(() => {
      sql.exec(`SAVEPOINT ${name}`);
      let out: Result<T>;
      try {
        out = fn();
      } catch (e) {
        /* A REAL THROW ROLLS BACK TOO, and then keeps going up: the outer transaction is entitled to
           abort on it, and swallowing it here would leave a half-written record looking whole. */
        sql.exec(`ROLLBACK TO ${name}`);
        sql.exec(`RELEASE ${name}`);
        throw e;
      }
      if (!out.ok) {
        sql.exec(`ROLLBACK TO ${name}`);
        sql.exec(`RELEASE ${name}`);
        return out;
      }
      sql.exec(`RELEASE ${name}`);
      return out;
    });
  } catch (e) {
    if (e instanceof Refused) return e.result as Result<T>;
    throw e;
  } finally {
    depth--;
  }
}
