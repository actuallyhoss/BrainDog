/**
 * A refusal writes nothing.
 *
 * `transaction(fn)` rolls back on a THROW, which is the driver's contract and the right one — but
 * this record's whole posture is that a refusal is a VALUE, not an exception. So a function that
 * validates halfway through its own writes and then returns `no(...)` commits everything it did
 * before the refusal, and reports failure while having succeeded partially. That is the worst
 * available shape: the caller believes nothing happened.
 *
 * `attempt` closes it. A refusal returned from inside is carried out through a throw the driver
 * understands, the transaction rolls back, and the refusal is returned as if nothing had been tried
 * — because nothing was. Validation before the first write is still better; this is what makes the
 * order stop mattering.
 */

import type { Result } from '@braindog/ports';

/** Carries a refusal out through a rollback. Never escapes this file. */
class Refused extends Error {
  result: Result<unknown>;
  constructor(result: Result<unknown>) {
    super('refused');
    this.result = result;
  }
}

export function attempt<T>(transaction: <R>(fn: () => R) => R, fn: () => Result<T>): Result<T> {
  try {
    return transaction(() => {
      const out = fn();
      if (!out.ok) throw new Refused(out);
      return out;
    });
  } catch (e) {
    if (e instanceof Refused) return e.result as Result<T>;
    throw e;
  }
}
