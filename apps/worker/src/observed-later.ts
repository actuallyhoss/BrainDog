/**
 * A read's counters, written a few seconds later and together, so a read is not a write (`observe` in `kernel/src/observe.ts`).
 *
 * WHY. Every `list`, `get` and `page` raised its day's counter as it was answered, and an answer leaves a Durable Object
 * only once what it wrote is safe: 15 to 25 ms on every read, for a number nobody waits on. The counters are what says which
 * list nobody has opened and which field is scanned, so they are kept, and what they cost is one write now and then.
 *
 * AN `Sql` IN FRONT OF THE RECORD'S, AND NOTHING ELSE KNOWS. The kernel writes its two counter statements as ever, and this
 * adds them up instead of sending them. ANY STATEMENT THAT NAMES THE TABLES WRITES THE COUNT DOWN FIRST, so a reader, a purge
 * or an erasure sees every count, and an erased person's count is never written back after the erasure.
 *
 * WHAT CAN BE LOST: the counts of the last few seconds when an object is reset or deployed over, and a count written down
 * inside a write that rolls back. Both are a count, of a read that did happen, one short. Nothing else goes through here.
 *
 * THE SELF-HOST DOES NOT DO THIS: its SQLite is on its own disk, and a write there holds nothing back.
 */

import { OBSERVE_COUNT, OBSERVE_COUNT_WHO } from '@braindog/kernel';
import type { Param, Sql } from '@braindog/ports';

/** How long a count waits to be written. Long enough that a page's calls are one write, short enough to lose little. */
export const OBSERVED_LATER_MS = 15_000;

/** The statements that add counts up, written once a batch. */
const ADD = 'INSERT INTO observation (kind, subject, day, n) VALUES (?, ?, ?, ?) ON CONFLICT (kind, subject, day) DO UPDATE SET n = n + excluded.n';
const ADD_WHO = 'INSERT INTO observation_who (kind, subject, day, who, n) VALUES (?, ?, ?, ?, ?) ON CONFLICT (kind, who, subject, day) DO UPDATE SET n = n + excluded.n';

/** Names either table, in any statement, read or write. */
const NAMES_THE_TABLES = /observation/iu;

export type ObservedLater = {
  sql: Sql;
  /** Write down what is held now. A fault is said and the counts let go: a count never stops a call. */
  flush(): void;
  /** How many different counters are held, for a test. */
  held(): number;
};

/** `later` is told once when a count starts waiting, and calls `flush` when the wait is over. `live` is false once nothing may be written. */
export function observedLater(inner: Sql, later: (flush: () => void) => void, live: () => boolean = () => true): ObservedLater {
  const counts = new Map<string, { params: Param[]; n: number; who: boolean }>();
  let waiting = false;

  const flush = (): void => {
    waiting = false;
    if (counts.size === 0) return;
    const out = [...counts.values()];
    counts.clear();
    if (!live()) return;
    try {
      for (const c of out) inner.exec(c.who ? ADD_WHO : ADD, ...c.params, c.n);
    } catch (e) {
      console.error('observed later:', e instanceof Error ? e.message : String(e));
    }
  };

  const keep = (who: boolean, params: Param[]): void => {
    const key = JSON.stringify([who, params]);
    const held = counts.get(key);
    if (held !== undefined) held.n += 1;
    else counts.set(key, { params, n: 1, who });
    if (!waiting) {
      waiting = true;
      later(flush);
    }
  };

  const first = (text: string): void => {
    if (counts.size > 0 && NAMES_THE_TABLES.test(text)) flush();
  };

  return {
    flush,
    held: () => counts.size,
    sql: {
      exec: (text, ...params) => {
        if (text === OBSERVE_COUNT) return keep(false, params);
        if (text === OBSERVE_COUNT_WHO) return keep(true, params);
        first(text);
        inner.exec(text, ...params);
      },
      all: (text, ...params) => {
        first(text);
        return inner.all(text, ...params);
      },
      one: (text, ...params) => {
        first(text);
        return inner.one(text, ...params);
      },
      transactionSync: (fn) => inner.transactionSync(fn),
    },
  };
}
