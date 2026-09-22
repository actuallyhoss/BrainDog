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
 * AND ON A DURABLE OBJECT THE SAVEPOINT IS THE HOST'S, NEVER A STATEMENT. `ctx.storage.sql.exec`
 * refuses `SAVEPOINT`, `RELEASE` and `BEGIN` outright, inside `transactionSync` or outside it and
 * even behind a leading comment, and the version of this file that issued them answered 500 on the
 * Cloud for `/api/keys/put` and `/api/invite` while every Node suite was green
 * (`loop/research-provision-day.md`, "Reason two"). What the Durable Object does allow, measured on
 * workerd 1.20260903.1 on 2026-09-22, is `storage.transactionSync` inside another one, and that
 * nested call is a real savepoint: an inner throw undid the inner row and the outer rows committed.
 * So on a host that refuses the statement the attempt runs inside `sql.transactionSync` and carries
 * a refusal out as a throw, and the host's own savepoint (or, at the top, the host's own
 * transaction) does the rollback. On `node:sqlite` nothing changes: the statement is accepted and
 * the path below it is the one the kernel's tests have always proved.
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

/**
 * The hosts that have refused a raw `SAVEPOINT` once, so each asks at most once in its life.
 *
 * ASKED, NOT GUESSED FROM THE ENVIRONMENT. The kernel is not allowed to know which runtime it is in
 * (`31-STACK` §1), and the one fact that matters here is whether this `Sql` accepts the statement,
 * which the `Sql` itself answers in one call. The refusal is recognised by the Durable Object's own
 * sentence, which names `transactionSync`; any other failure of the statement is a real error and
 * goes up unchanged.
 */
const refusesSavepoint = new WeakSet<Sql>();
const HOST_OWNS_TRANSACTIONS = /storage\.transaction/;

export function attempt<T>(sql: Sql, transaction: <R>(fn: () => R) => R, fn: () => Result<T>): Result<T> {
  /* The name is unique per nesting level, because SQLite savepoints are a stack and releasing the
     wrong one releases everything above it. */
  const name = `dog_attempt_${++depth}`;
  try {
    return transaction(() => {
      if (!refusesSavepoint.has(sql)) {
        try {
          sql.exec(`SAVEPOINT ${name}`);
        } catch (e) {
          if (!(e instanceof Error && HOST_OWNS_TRANSACTIONS.test(e.message))) throw e;
          refusesSavepoint.add(sql);
        }
      }
      if (refusesSavepoint.has(sql))
        /* A REFUSAL LEAVES AS A THROW HERE, because a throw is the one thing the host's savepoint
           rolls back on. It is caught below, outside `transaction`, and handed back as the value it
           was. A real throw goes through the same savepoint and keeps going up. */
        return sql.transactionSync(() => {
          const out = fn();
          if (!out.ok) throw new Refused(out);
          return out;
        });
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
