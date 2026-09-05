/**
 * The ports every package under `packages/**` talks to the outside through.
 *
 * TYPES AND NOTHING ELSE. `31-STACK` §1 bans `node:*`, `cloudflare:*`, `fetch` and `Buffer` from
 * this half of the tree, and the reason is not purity — it is that the same kernel has to run
 * unchanged in workerd, in Node and in a bare test process. A package that imports a driver has
 * chosen one of the three.
 *
 * `Sql` IS SYNCHRONOUS ON PURPOSE. A SQLite Durable Object holds its storage in the same thread as
 * the code, so a query is a function call rather than a round trip, and `transactionSync` is what
 * makes the write path one atomic step rather than a sequence somebody has to reason about. An
 * async port would have bought nothing and cost the guarantee.
 */

/** What a bound parameter may be. Everything else is coerced before it reaches the driver. */
export type Param = string | number | bigint | null | Uint8Array;

/** One row, as the driver returns it: column name to value. */
export type Row = Record<string, Param>;

/**
 * The storage port.
 *
 * Four methods, and the fourth is the one the whole write path is built on. `exec` is for statements
 * with no result; `all` and `one` read. A driver that cannot do `transactionSync` cannot host a
 * record, because a write that is half applied is a record that has to be repaired by hand.
 */
export interface Sql {
  exec(sql: string, ...params: Param[]): void;
  all<T = Row>(sql: string, ...params: Param[]): T[];
  one<T = Row>(sql: string, ...params: Param[]): T | undefined;
  /** Runs `fn` in a transaction, rolls back on a throw, and rethrows. Never nested by the driver. */
  transactionSync<T>(fn: () => T): T;
}

/**
 * The clock, as a port, because a record's tests are about dates and a test that waits is a test
 * that is slow and flaky in the same move.
 */
export interface Clock {
  /** Milliseconds since the epoch. Read ONCE per call, so every row a write touches shares an instant. */
  now(): number;
}

/**
 * The alarm, as a port.
 *
 * ONE ALARM PER CUSTOMER, always set to the earliest pending row or not set at all. That invariant
 * is what an object per customer buys: the alternative is a cron worker fanning out across every
 * tenant, waking records that have nothing to do in order to ask them.
 *
 * `wake()` IS NOT PART OF THE ALARM — it is the outbox doorbell, and it is the one piece of I/O a
 * record performs. A lost doorbell costs latency and never a notification, because the outbox row is
 * still `pending` and the next request drains it.
 */
export interface Scheduler {
  /** When the alarm is currently set for, or `null` if it is not set. */
  get(): Promise<number | null>;
  set(atMs: number): Promise<void>;
  clear(): Promise<void>;
  /** Tell whatever drains the outbox that there is something in it. Never carries the payload. */
  wake(): Promise<void>;
}

/**
 * The alarm, as a port.
 *
 * ONE ALARM PER CUSTOMER, always set to the earliest pending row or not set at all. That invariant
 * is what an object per customer buys: the alternative is a cron worker fanning out across every
 * tenant, waking records that have nothing to do in order to ask them.
 *
 * `wake()` IS NOT PART OF THE ALARM — it is the outbox doorbell, and it is the one piece of I/O a
 * record performs. A lost doorbell costs latency and never a notification, because the outbox row is
 * still `pending` and the next request drains it.
 */
export interface Scheduler {
  /** When the alarm is currently set for, or `null` if it is not set. */
  get(): Promise<number | null>;
  set(atMs: number): Promise<void>;
  clear(): Promise<void>;
  /** Tell whatever drains the outbox that there is something in it. Never carries the payload. */
  wake(): Promise<void>;
}

/** A page boundary: what a list hands back so the next call resumes where it stopped. */
export type Cursor = string | null;

/**
 * The result every fallible call returns.
 *
 * A REFUSAL IS A VALUE, not an exception. The record's whole posture is that a refusal is the
 * teacher — it carries a code the caller can branch on and a sentence a person or an agent can act
 * on — and an exception carries neither across an RPC boundary without being rebuilt.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

export type Refusal = {
  /** SCREAMING_SNAKE, from the closed list in `30-BLUEPRINT` §6. */
  code: string;
  /** What was wrong, where, and what to do. No apology, no blame. */
  fix: string;
  /** The field or register the refusal is about, when it is about one. */
  at?: string;
  /** What the caller may send instead: an enum's values, a register's fields. */
  allowed?: readonly string[];
};

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const no = <T>(code: string, fix: string, extra: Omit<Refusal, 'code' | 'fix'> = {}): Result<T> => ({
  ok: false,
  refusal: { code, fix, ...extra },
});
