/**
 * `rehearse`: run a function against the record as it stands, and put the record back whatever the function wrote.
 *
 * WHAT IT IS FOR. A proposed change is drawn before anybody accepts it (`previewChange`), and an automation is tried
 * before anybody turns it on (`tryAutomation`). Both need the real write path, with every check, rule and event it
 * makes, because a preview that ran a second, simpler engine would show a result the real one does not reach. And
 * neither may leave a byte behind. So both run the real thing inside this, and this throws it all away.
 *
 * ONE TRANSACTION, THROWN OUT OF. The kernel's transaction rolls back on a throw and on nothing else, so the function's
 * answer leaves the transaction as a throw of its own class, is caught outside it, and is handed back as the value it
 * was. Everything written inside goes with the rollback (rows, events, counters, declarations, their DDL, the outbox
 * and the schedule), because all of it is rows in the record's one database.
 *
 * NEVER INSIDE A WRITE. The kernel's transaction is re-entrant: at a depth above zero it runs the function inside its
 * caller's transaction and opens nothing, so the throw that carries the answer out would roll back the caller's write
 * as well, or, caught by the caller, would leave the rehearsal's writes to be committed with it. Either is a write that
 * did something other than what it said, so a rehearsal asked for inside one is a `TypeError` before anything runs.
 *
 * THE CACHES ARE PUT BACK TOO. The list cache (`registers`, `prefixes`) and the plan the lint reads (`planned`) live
 * in memory beside the tables. A rehearsal that installs a list and reloads leaves the cache describing that list after
 * the rollback has taken it out of the table, and every later write would then read a list the record does not hold.
 * So they are saved before the function runs and restored in `finally`, whatever happened. The automation runner's
 * parsed-rule cache (`flow.ts`, `installed`) needs no restoring: it is keyed by each rule's version and checksum, so a
 * rolled-back version is an entry that no live declaration names, and it is dropped on the next read.
 */

import type { KernelParts } from '../parts.ts';

/** Carries a rehearsal's answer out through the rollback. Never escapes this file. */
class Rehearsed extends Error {
  value: unknown;
  constructor(value: unknown) {
    super('rehearsed');
    this.value = value;
  }
}

/** Whether a value is a promise, or anything else that finishes later. */
const later = (value: unknown): boolean =>
  (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function';

export function extension(parts: KernelParts) {
  return {
    /**
     * `fn`'s answer, with everything `fn` wrote rolled back.
     *
     * `fn` FINISHES BEFORE IT RETURNS. The rollback happens as soon as `fn` returns, so the part of an `async` function
     * after its first `await` would run outside any transaction and write for real. A promise is refused with a
     * `TypeError`, which rolls back what ran before it; what is past the `await` is the caller's defect to fix, and the
     * sentence says so.
     */
    rehearse<T>(fn: () => T): T {
      if (parts.depth() > 0) throw new TypeError('rehearse inside a write');
      const saved = parts.caches.save();
      try {
        return parts.transaction<T>(() => {
          const value = fn();
          if (later(value)) throw new TypeError('rehearse takes a function that finishes before it returns, and this one returned a promise');
          throw new Rehearsed(value);
        });
      } catch (e) {
        if (e instanceof Rehearsed) return e.value as T;
        throw e;
      } finally {
        parts.caches.restore(saved);
      }
    },
  };
}
