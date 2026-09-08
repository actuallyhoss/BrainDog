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
 *
 * AND A CONFLICT IS NOT A REFUSAL. They are different answers to different questions: a refusal
 * says the write was WRONG and repeating it will fail again; a conflict says the write was FINE and
 * arrived second. Collapsing them — which this did, with `VERSION_STALE` as a plain refusal
 * carrying a sentence and nothing else — leaves the caller with no way to recover, because
 * recovering means re-reading the row and re-applying the patch, and it had neither the row nor the
 * name of whoever moved it. Two people editing one invoice then produce a sentence, a shrug and a
 * lost edit, and last-writer-wins is exactly wrong for money (30 §4).
 *
 * THE BODY IS WHAT MAKES IT RECOVERABLE. `current` is the row as it now stands and `actor` is who
 * put it there, so a caller can resend once when the other change was disjoint from its own patch,
 * and put both values in front of a person when it was not (22 §5, 50 §5.3). There is no 412 and
 * no whole-document resend.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: Refusal }
  | { ok: false; conflict: Conflict };

/**
 * Somebody else got there first.
 *
 * `current` IS THE ROW, NOT A DIFF. A diff would need the caller to hold what it read, and the whole
 * point of the compare-and-set is that what it read is stale. The row it hands back is authoritative
 * and the caller re-applies its own patch onto it.
 */
export type Conflict = {
  /** The version the row is actually at — what a resend must carry. */
  version: number;
  /**
   * The row as it now stands.
   *
   * `unknown`, AND THAT IS NOT LAZINESS. Ports may not know what an entry is — that is the seam this
   * package exists to hold — and the row crosses HTTP as JSON to a client that types it itself. The
   * kernel narrows it at the one place it builds one.
   */
  current: unknown;
  /** Who moved it. A person's id or a mechanism's name, never "someone". */
  actor: string;
};

/**
 * THE NINETY-NINE, AND `30 §6` SAYS THIS PACKAGE IS WHERE THEY LIVE.
 *
 * *"The type `Refusal` (with `RefusalCode`) is a type-only export of `@braindog/ports`, the lowest
 * shared package, because `where` raises one and sits below the kernel."* It did not exist. `code`
 * was `string`, so a refusal could carry any word at all. `refusals.mjs` counts it: **51 of the 99
 * emitted, 48 emitted by nothing, and 24 more that are not in the registry at all** — 32 of those
 * occurrences being `DECLARATION_INVALID`, the catch-all this build leans on hardest.
 *
 * (Two earlier numbers here were wrong and both are worth keeping. A hand count said 41 · 58 · 24.
 * Then the gate said 39 · 60 · 22 — and it was wrong too, because its pattern matched `no(` and
 * `code:` and nothing else, while `declare.ts`, the largest emitter in the repository, builds every
 * refusal through a local `bad()`. A gate whose predicate cannot reach its biggest input is the
 * failure this tools directory exists to catch, made by the tool.)
 *
 * A code is the one part of a refusal a caller can branch on. `10 §7` builds the agent contract on
 * it — *"the refusal teaches"* — and an agent teaches itself from a code that is stable across
 * versions. An invented code is a `fix` sentence with a shouty prefix.
 *
 * GROUPED AND COUNTED AS `30 §6` GROUPS AND COUNTS THEM: *"Ninety-nine, counted, in eight families
 * — 41 pack and declaration · 13 grammar · 18 write path · 7 auth and vault · 6 format and
 * lifecycle · 2 dialect · 5 spark · 7 connector."* A sentence that counts is a sentence that can be
 * wrong, so the shape is kept and `refusals.mjs` checks both the total and the eight sizes against
 * the document — the same gate shape `event-kinds` uses for the one other list that has to say the
 * same thing in two places.
 *
 * TWO THINGS THAT LOOK LIKE CODES AND ARE NOT: JSON-RPC's `-32602` and the `Http` port's four error
 * names. They are vocabularies, mapped onto a code where one applies (`PULL_ORIGIN_REFUSED`) and
 * otherwise never on the wire as a refusal. The storage adapter's own thirteen (`30 §13`) are a
 * third list and stay thirteen — they name what the DRIVER refused, not what the FORMAT refused.
 */

/** Pack and declaration — 41. */
const PACK = [
  'KIND_UNKNOWN', 'FIELD_TYPE_UNKNOWN', 'FIELDS_OVER_CAP', 'INDEXES_OVER_CAP', 'PATTERN_OVER_CAP',
  'METRIC_NEEDS_TARGET_OR_WINDOW', 'MIXED_CURRENCY', 'CONTRAST_FLOOR', 'REQUIRED_ON_POPULATED', 'ID_RENAMED',
  'COLOUR_OUTSIDE_THEME', 'DEPENDENCY_UNRESOLVED', 'CREATE_UNBOUNDED', 'CREATE_OVER_BOUND',
  'CREATE_FOREIGN_REGISTER', 'TRANSITION_ILLEGAL', 'GROUP_BY_TWICE', 'GROUP_BY_CARDINALITY',
  'RATIO_MIXED_SOURCE', 'RATIO_MIXED_CURRENCY', 'QUANTITY_MIXED_UNIT', 'STATE_NOT_ENUM',
  'FORMAT_OUT_OF_RANGE', 'PRIMITIVES_OUT_OF_RANGE', 'BAND_EDGES_MISMATCH', 'SERIES_HAS_NO_TEXT',
  'REQUIRED_WHEN_OP_UNSUPPORTED', 'PREDICATE_CYCLE', 'SEQ_PREFIX_TAKEN', 'SEARCH_FIELD_TYPE',
  'FIELD_TYPE_CHANGED', 'PROVIDES_MISMATCH', 'PLAN_STALE', 'THEME_VALUE_INVALID', 'INTENT_INSEPARABLE',
  'THEME_LADDER_ORDER', 'PACK_MALFORMED', 'PROVIDES_CONFLICT', 'REMOTE_ASSET', 'SECRET_IN_PACK',
  'WOULD_ORPHAN',
] as const;

/** Grammar — 13. */
const GRAMMAR = [
  'PREDICATE_TOO_DEEP', 'VIA_TWICE', 'VIA_NESTED_SUBQUERY', 'MONEY_LITERAL_NEEDS_CURRENCY',
  'QUANTITY_LITERAL_NEEDS_UNIT', 'MATCH_FIELD_UNKNOWN', 'MATCH_OP_UNSUPPORTED', 'CONTAINS_TOO_LONG',
  'RELATIVE_LITERAL_UNKNOWN', 'RELATIVE_UNIT_FOR_DAY', 'EXTRACTOR_UNKNOWN', 'DATE_FORMAT_INVALID',
  'PATH_INVALID',
] as const;

/** Write path — 18. */
const WRITE = [
  'REGISTER_UNKNOWN', 'FIELD_UNKNOWN', 'ROW_LOCKED', 'HUMAN_ONLY', 'TEXT_JSON_QUOTED',
  'TEXT_ESCAPED_NEWLINE', 'INT_OUT_OF_RANGE', 'VALUE_MALFORMED', 'REQUIRED_MISSING', 'ENUM_VALUE_UNKNOWN',
  'OUT_OF_BOUNDS', 'IMMUTABLE_FIELD', 'UNIQUE_VIOLATION', 'ALREADY_KNOWN', 'REF_REGISTER_MISMATCH',
  'DELETE_WHILE_REFERENCED', 'VERSION_STALE', 'LEVEL_REQUIRED',
] as const;

/** Auth and vault — 7. */
const AUTH = [
  'UNAUTHORIZED', 'FORBIDDEN', 'NEEDS_BROWSER_SESSION', 'WRONG_KEY', 'GRANT_REVOKED', 'DEVICE_CODE_EXPIRED',
  'DEVICE_CODE_TRIES',
] as const;

/** Format and lifecycle — 6. */
const LIFECYCLE = [
  'FORMAT_NEWER_THAN_READER', 'CHECKSUM_MISMATCH', 'SIGNATURE_INVALID', 'IMPORT_NOT_EMPTY',
  'SCHEMA_MISMATCH', 'SCHEMA_NEWER',
] as const;

/** Dialect — 2. */
const DIALECT = [
  'DIALECT_ARITY', 'DIALECT_KIND_UNKNOWN',
] as const;

/** Spark — 5. */
const SPARK = [
  'PROPOSAL_UNCITED', 'PROPOSAL_NO_ROWS', 'PROPOSAL_SCHEMA', 'PREDICTION_UNMEASURABLE', 'SPARK_BUDGET_SPENT',
] as const;

/** Connector — 7. */
const CONNECTOR = [
  'PULL_AUTH_REJECTED', 'PULL_PROVIDER_UNAVAILABLE', 'PULL_REQUEST_REFUSED', 'PULL_EXPECT_FAILED',
  'PULL_SHAPE_MISMATCH', 'PULL_ORIGIN_REFUSED', 'PULL_LEASE_EDGE',
] as const;
/** The ninety-nine, in `30 §6`'s order. */
export const REFUSAL_CODES = [
  ...PACK, ...GRAMMAR, ...WRITE, ...AUTH, ...LIFECYCLE, ...DIALECT, ...SPARK, ...CONNECTOR,
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** Whether a string is one. For a boundary deciding whether it can hand a code to a caller. */
export const isRefusalCode = (code: string): code is RefusalCode =>
  (REFUSAL_CODES as readonly string[]).includes(code);

export type Refusal = {
  /**
   * One of the ninety-nine. `30-BLUEPRINT` §6, and the list is above.
   *
   * STILL `string`, AND THE GATE IS WHY. Typing it `RefusalCode` compiles against 41 sites carrying
   * 22 codes that are not in the registry — `ROUTE_UNKNOWN`, `METRIC_UNKNOWN`, `PAGE_UNKNOWN` and
   * the rest. Some of those are concepts `30 §6` is missing and should gain by amendment; some are
   * placeholders (`UNIMPLEMENTED`, `INTERNAL`, `SOMETHING_NOBODY_MAPPED`) that should not exist at
   * all; and telling them apart is a judgement per site, not a rename.
   *
   * So `refusals.mjs` holds the number instead, as a budget that may only go down. That is the
   * honest intermediate: the list is real, the drift is measured, and a twenty-third invented code
   * is red today — rather than a type change that would have to be landed with 41 hurried guesses
   * behind it. The field narrows the day the budget reaches zero.
   */
  code: string;
  /** What was wrong, where, and what to do. No apology, no blame. */
  fix: string;
  /** The field or register the refusal is about, when it is about one. */
  at?: string;
  /** What the caller may send instead: an enum's values, a register's fields. */
  allowed?: readonly string[];
};

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * The third answer: the write was fine and arrived second.
 *
 * IT IS A CONSTRUCTOR AND NOT A REFUSAL CODE because the difference has to survive the type system.
 * `no('VERSION_STALE', …)` type-checks everywhere a conflict belongs and loses the row, and the loss
 * is invisible until two people are editing at once — which is the one case it exists for.
 */
export const clash = <T>(version: number, current: unknown, actor: string): Result<T> => ({
  ok: false,
  conflict: { version, current, actor },
});

/** Whether an answer is the second kind of not-ok, narrowed. 409 rather than 422 is one call away. */
export const conflicted = <T>(r: Result<T>): r is { ok: false; conflict: Conflict } => !r.ok && 'conflict' in r;

/** Whether an answer is a refusal, narrowed. The two `ok: false` arms are told apart by shape. */
export const refused = <T>(r: Result<T>): r is { ok: false; refusal: Refusal } => !r.ok && 'refusal' in r;

/** `CODE: sentence` — one string for a log line or a failed assertion. */
export const sayOf = <T>(r: Result<T>): string => (r.ok ? '' : `${codeOf(r)}: ${fixOf(r)}`);

/**
 * The code a not-ok answer carries.
 *
 * A CONFLICT'S CODE IS `VERSION_STALE`, and it is a real code rather than a stand-in: 30 §6 lists it
 * beside every other, and a caller branching on codes must be able to see this one. What the
 * envelope changes is only the STATUS it earns — 409, not 422 — and 30 §6 says that too.
 */
export const codeOf = <T>(r: Result<T>): string =>
  refused(r) ? r.refusal.code : conflicted(r) ? 'VERSION_STALE' : '';

/**
 * The sentence a not-ok answer carries, whichever kind it is.
 *
 * FOR THE PLACES THAT ONLY WANT THE WORDS — a log line, a toast, an `Error` message, a failed
 * assertion. They should not have to know which of the two failures they are holding, and before
 * this existed every one of them reached for `.refusal.fix` and would have printed `undefined` the
 * day a conflict reached it.
 */
export const fixOf = <T>(r: Result<T>): string =>
  refused(r)
    ? r.refusal.fix
    : conflicted(r)
      ? `${r.conflict.actor} changed this since you read it — it is at version ${r.conflict.version} now. Read it again and re-apply.`
      : '';
export const no = <T>(code: string, fix: string, extra: Omit<Refusal, 'code' | 'fix'> = {}): Result<T> => ({
  ok: false,
  refusal: { code, fix, ...extra },
});
