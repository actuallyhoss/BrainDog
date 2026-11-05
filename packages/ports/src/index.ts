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

/*
 * The storage port, its guard and its boot probe (`37 §2.4`). `Param`, `Row` and `Sql` moved there from here with
 * the guard, so the port and the checks every adapter runs in front of it are read in one file.
 */
export { DO_LIMITS, DO_MEASURED, SQL_ERROR_CODES, SqlError, bootProbe, guard, guardScript, guardShape, guarded, mapDriverMessage, measureCaps, nulAt, nulSaid } from './sql.ts';
export type { Capabilities, Param, Row, Sql, SqlErrorCode } from './sql.ts';

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
 *
 * THIS WAS WRITTEN TWICE, byte for byte, comment and all, twenty lines apart. TypeScript merges two
 * interfaces of one name without a word — that is declaration merging working as designed — so it
 * compiled, `tsc --noEmit` was clean, and every consumer got the same shape either way. The cost was
 * not the duplication. It is that a method added to one copy and not the other is not an error
 * either — merging is a union — so the two would have drifted apart quietly, and the reader who
 * jumped to the first would have been reading half the port.
 *
 * There is no lint rule in this repository to catch the class, and one duplicate does not earn a
 * gate. Whether a duplicate exported declaration in a package's
 * `src` is worth a check of its own is an open question.
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
 * WebCrypto's key, named from the class rather than from a library.
 *
 * `tsconfig.base.json` SETS NO `dom` LIB, deliberately — a package that can name `document` is a
 * package that can reach for it — and `31 §1` bans `node:` under `packages/**`, which is where
 * `webcrypto.CryptoKey` lives. What is left is the global class, which is a VALUE, so the type is
 * taken off it. The alternative was the one import this half of the tree is not allowed to make.
 */
export type Key = InstanceType<typeof CryptoKey>;

/**
 * The root key store. `33 §1` port 8: the host has it, the record does not.
 *
 * THE SAFE CANNOT HOLD WHAT OPENS IT (`12 §6`). A record holds sealed bytes and the fingerprint of
 * what wrapped them, and no way to open either — so the two methods live behind a port that only a
 * host implements, and every package that needs a key asks for one it cannot make.
 *
 * `byId` ANSWERS `null` RATHER THAN THROWING, because "the root key rotated" is an operational event
 * with a repair a person can carry out, and it reaches them as `WRONG_KEY` and a sentence.
 */
export interface KeyStore {
  /** The key new wrapping uses, and the id that records which one it was. */
  current(): Promise<{ kekId: string; key: Key }>;
  /** A key this host still holds, or `null` — which is a rotated root key and not a bug. */
  byId(kekId: string): Promise<Key | null>;
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
 * THE HUNDRED AND TWELVE, AND `30 §6` SAYS THIS PACKAGE IS WHERE THEY LIVE.
 *
 * *"The type `Refusal` (with `RefusalCode`) is a type-only export of `@braindog/ports`, the lowest
 * shared package, because `where` raises one and sits below the kernel."* It did not exist. `code`
 * was `string`, so a refusal could carry any word at all, and it did: the first count found **51 of
 * the 99 emitted, 48 emitted by nothing, and 24 more outside the registry entirely** — 32 of those
 * occurrences being `DECLARATION_INVALID`, the catch-all this build leans on hardest.
 *
 * (Three earlier numbers here were wrong and all three are worth keeping. A hand count said
 * 41 · 58 · 24. Then the gate said 39 · 60 · 22 — wrong too, because its pattern matched `no(` and
 * `code:` and nothing else, while `declare.ts`, the largest emitter in the repository, builds every
 * refusal through a local `bad()`. Widened for that it said 51 · 48 · 24, and was STILL wrong: a
 * code written as `cond ? 'A' : 'B'` puts an expression where the pattern wanted a quote, and two
 * codes were hiding behind one — `IMPORT_FAILED`, which appeared nowhere else in the tree, and
 * `SCOPE_INSUFFICIENT`, which a test asserts on. The honest count was 26. A gate whose predicate
 * cannot reach its input is the failure the tools directory exists to catch, made by the tool, and
 * it made it twice.)
 *
 * A code is the one part of a refusal a caller can branch on. `10 §7` builds the agent contract on
 * it — *"the refusal teaches"* — and an agent teaches itself from a code that is stable across
 * versions. An invented code is a `fix` sentence with a shouty prefix.
 *
 * TWENTY-SIX WERE SORTED AND THIRTEEN WERE ADMITTED, on 2026-09-08. Six of the twenty-six were
 * renames onto codes that already existed — five spellings of `MATCH_OP_UNSUPPORTED`, and
 * `RECORD_NOT_EMPTY` onto `IMPORT_NOT_EMPTY`, `PERSON_REQUIRED` onto `FORBIDDEN` — which is the
 * repair this list prefers, because a registry that grows whenever somebody needs a word is not a
 * closed list. Five more were renamed onto three of the NEW codes, their old names having been wrong
 * about their own subject rather than redundant. A twelfth rename was made and then UNDONE:
 * `REF_UNKNOWN` reads like `VALUE_MALFORMED` and `declare` branches on it, which is the test for
 * whether two refusals are one — not whether the sentences read alike, but whether a caller has to
 * tell them apart. The thirteen that were admitted had no existing name at all, and the four
 * in `HOST` below are a family this document had never had: `30 §6` was written about what a record
 * refuses and never about the boundary a request arrives through, so both hosts and the client each
 * minted their own word for a route that does not exist.
 *
 * GROUPED AND COUNTED AS `30 §6` GROUPS AND COUNTS THEM: *"One hundred and thirty-six, counted, in nine
 * families — 54 pack and declaration · 14 grammar · 24 write path · 12 auth and keychain · 8 format and
 * lifecycle · 2 dialect · 6 slash · 12 connector · 4 host and client."* A sentence that counts is a
 * sentence that can be wrong, so the shape is kept and `refusals.mjs` checks both the total and the
 * nine sizes against the document — the same gate shape `event-kinds` uses for the one other list
 * that has to say the same thing in two places.
 *
 * TWO THINGS THAT LOOK LIKE CODES AND ARE NOT: JSON-RPC's `-32602` and the `Http` port's four error
 * names. They are vocabularies, mapped onto a code where one applies (`PULL_ORIGIN_REFUSED`) and
 * otherwise never on the wire as a refusal. The storage adapter's own thirteen (`30 §13`) are a
 * third list and stay thirteen — they name what the DRIVER refused, not what the FORMAT refused.
 * `INTERNAL` is a fourth: a handler that threw names no field and no expectation, so a 500 is a
 * crash report wearing the envelope's shape rather than a refusal, and admitting it would turn this
 * into the list of everything that can appear in a `code`.
 */

/** Pack and declaration — 54. */
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
  /* Six codes for a caller naming a declaration this record has not got. The family is
     named for what its codes are ABOUT and not for the moment they are raised — `TRANSITION_ILLEGAL`
     above has said "one code, two moments" since the first draft — which is why a page read at 7am
     belongs here rather than under a family whose first line is "refused before any row is written". */
  'DECLARATION_UNKNOWN', 'PAGE_UNKNOWN', 'METRIC_UNKNOWN', 'SOURCE_UNKNOWN', 'LOOKUP_UNKNOWN',
  'LOOKUP_MISSING',
  /* A seventh of the same kind, 2026-09-16: a caller naming a saved view the register has not got.
     It is filed here rather than under the write path for the reason the six above were: the family
     is named for what its codes are ABOUT, and a view is a thing the record was told to hold. */
  'VIEW_UNKNOWN',
  /* Turning a pack off and on, 2026-09-15: an upgrade of a disabled pack, and the two guards on disabling. */
  'PACK_DISABLED', 'PACK_REQUIRED', 'SCOPES_IN_USE',
  /* A pack's settings and what it points at, 2026-09-15: a setting of a type a setting does not take,
     and a pack leaning on a list the record does not hold and the pack does not declare. */
  'CONFIG_TYPE_UNSUPPORTED', 'REGISTER_UNRESOLVED',
  /* A shared use case, 2026-09-17: a file past the size a shared use case may be, refused before it is parsed. */
  'PACK_OVER_CAP',
] as const;

/** Grammar — 14. */
const GRAMMAR = [
  'PREDICATE_TOO_DEEP', 'VIA_TWICE', 'VIA_NESTED_SUBQUERY', 'MONEY_LITERAL_NEEDS_CURRENCY',
  'QUANTITY_LITERAL_NEEDS_UNIT', 'MATCH_FIELD_UNKNOWN', 'MATCH_OP_UNSUPPORTED', 'CONTAINS_TOO_LONG',
  'RELATIVE_LITERAL_UNKNOWN', 'RELATIVE_UNIT_FOR_DAY', 'EXTRACTOR_UNKNOWN', 'DATE_FORMAT_INVALID',
  'PATH_INVALID',
  /* THE ONE THAT WAS RENAMED AWAY AND HAD TO COME BACK. `REF_UNKNOWN` reads like `VALUE_MALFORMED`,
     whose row says "an unresolvable id or spoken reference" — and `declare`'s rule linter branches
     on it, surviving this refusal and no other because a name with nothing behind it today may be
     written tomorrow. Two refusals are one when no caller has to tell them apart. One does. */
  'REF_UNKNOWN',
] as const;

/** Write path — 24. */
const WRITE = [
  'REGISTER_UNKNOWN', 'ROW_UNKNOWN', 'FIELD_UNKNOWN', 'ROW_LOCKED', 'HUMAN_ONLY', 'TEXT_JSON_QUOTED',
  'TEXT_ESCAPED_NEWLINE', 'INT_OUT_OF_RANGE', 'VALUE_MALFORMED', 'REQUIRED_MISSING', 'ENUM_VALUE_UNKNOWN',
  /* THREE LETTERS IS A SHAPE AND NOT A CURRENCY, and the two were one test until `GPB` reached a
     row. It is its own code beside `ENUM_VALUE_UNKNOWN` and not folded into `VALUE_MALFORMED`
     because the two send a caller somewhere different: `POUNDS` is a typo in the SHAPE, and `GPB`
     is a typo in a real-looking code that no rate will ever exist for, so every figure over that
     register stops being a number and any target on it stops being evaluated. */
  'CURRENCY_UNKNOWN',
  'OUT_OF_BOUNDS', 'IMMUTABLE_FIELD', 'UNIQUE_VIOLATION', 'ALREADY_KNOWN', 'REF_REGISTER_MISMATCH',
  'DELETE_WHILE_REFERENCED', 'VERSION_STALE', 'LEVEL_REQUIRED',
  /* A ROW'S CURRENCY DOES NOT CHANGE, 2026-10-09: a money field declaring `currency_fixed` keeps the code it
     was filed in, and its number stays free. Not `IMMUTABLE_FIELD`, which says the whole field is set once and would
     send a caller correcting an amount away from a write that is allowed; the repair here is delete and add again. */
  'CURRENCY_FIXED',
  /* TWO AT THE AGENTS' DOOR, 2026-10-21 (agents and MCP plan §6.5): an `update` whose patch changes nothing, refused before
     the ladder files it as a question for nothing; and a name `get` was handed that more than one thing is called, with
     each by its handle. Not `VALUE_MALFORMED`: the shape is right, and the repair is a different call. */
  'PATCH_EMPTY', 'NAME_AMBIGUOUS',
  /* A SEALED FILE OR A PART OF ONE THIS RECORD DOES NOT HOLD, 2026-10-22 (Setup sync): `sealedGet` by a name nothing was
     put under, or a part not put yet. Not `ROW_UNKNOWN`, whose sentence is about rows a caller may not see: a sealed
     file is the owner's alone, and the command that asks for one branches on its absence to put it. */
  'NOT_FOUND',
] as const;

/** Auth and keychain — 12. */
const AUTH = [
  'UNAUTHORIZED', 'FORBIDDEN', 'NEEDS_BROWSER_SESSION', 'WRONG_KEY', 'GRANT_REVOKED', 'DEVICE_CODE_EXPIRED',
  'DEVICE_CODE_TRIES',
  /* A credential past its budget for now, 2026-09-17: a report key's rows a minute. The one code that carries
     `retry_after`, and HTTP 429 with `Retry-After`. */
  'RATE_LIMITED',
  /* A RUN HE STOPPED OR PAUSED IN THE APP, 2026-10-21 (agents and MCP plan §2.4): the record refuses its changes, for
     every client, until he resumes it. Not `FORBIDDEN`, which says the credential is short and sends an agent looking
     for a bigger one; a stopped run is told to answer and end, and a paused one to wait. Both 403. */
  'RUN_STOPPED', 'RUN_PAUSED',
  /* A TOOL HE SWITCHED OFF FOR THIS AGENT in Settings > Agents, 2026-10-21 (§6.5), refused at the door before
     it runs, for a client whose cached list still has it. Not `FORBIDDEN`: no bigger key turns it back on, only he does. */
  'TOOL_OFF',
  /* A KEY SET TO ASK FIRST, 2026-10-26 (Keychain access): a machine's keychain grant reached it, and the owner has been
     asked to allow that machine. Not `FORBIDDEN`, which says the grant is short: the same call opens the key once he
     answers, so a CLI waits and tries it again, and only a `deny` answer or rule is `FORBIDDEN`. 403. */
  'KEY_ASKED',
] as const;

/** Format and lifecycle — 8. */
const LIFECYCLE = [
  'FORMAT_NEWER_THAN_READER', 'CHECKSUM_MISMATCH', 'SIGNATURE_INVALID', 'IMPORT_NOT_EMPTY',
  'SCHEMA_MISMATCH', 'SCHEMA_NEWER',
  /* Two facts the family already implied and had no word for: a file that is not a `.brainl` at all
     (nothing has been checksummed, so `CHECKSUM_MISMATCH` would be a lie), and a declaration that is
     correct against its document and ahead of this code — the same sentence the three `*_NEWER*`
     codes say about a version integer, which is why it is filed beside them. */
  'FILE_MALFORMED', 'NOT_IN_THIS_BUILD',
] as const;

/** Dialect — 2. */
const DIALECT = [
  'DIALECT_ARITY', 'DIALECT_KIND_UNKNOWN',
] as const;

/** Slash — 6. */
const SLASH = [
  'PROPOSAL_UNCITED', 'PROPOSAL_NO_ROWS', 'PROPOSAL_SCHEMA', 'PREDICTION_UNMEASURABLE', 'SLASH_BUDGET_SPENT',
  /* A model that answered an automation's question with a 200 the host could not read, too large, not
     JSON or broken off, or that ran out the clock. An earlier build raised `PROPOSAL_SCHEMA` for it, which is output read and
     failing its schema; here nothing was read, and the ask was still paid for (`packages/slash/src/answer.ts`). */
  'ANSWER_UNREADABLE',
] as const;

/** Connector — 12. */
const CONNECTOR = [
  'PULL_AUTH_REJECTED', 'PULL_PROVIDER_UNAVAILABLE', 'PULL_REQUEST_REFUSED', 'PULL_EXPECT_FAILED',
  'PULL_SHAPE_MISMATCH', 'PULL_ORIGIN_REFUSED', 'PULL_LEASE_EDGE',
  /* Scheduled actions: `call` and `poll` refused where they are declared. An origin that is
     not https, a host built from data, no key named, an interval under the floor, and a url or body
     that computes rather than substitutes (`25 §3.1`). */
  'ACTION_NOT_HTTPS', 'ACTION_HOST_COMPUTED', 'ACTION_GRANT_MISSING', 'ACTION_INTERVAL_TOO_SHORT',
  'ACTION_EVALUATES',
] as const;

/**
 * Host and client — 4. The ninth family, and the one this document had never had.
 *
 * The other eight are all about the record's CONTENT — what a pack may declare, what a predicate may
 * ask, what a write may do — and none of them is about the surface every caller actually touches. So
 * `serveApi`, the self-host and the client each invented a word, and `httpStatus` grew a table of
 * codes `30 §6` had never heard of. That is not a tidiness problem: a code outside the registry is a
 * code outside the status map, and `RECORD_UNAVAILABLE` — which said `SCHEMA_UNAVAILABLE` while
 * having nothing to do with a schema — therefore answered **422** for a record nobody may act on,
 * where `49 §5.1` step 5.3 says 503.
 */
const HOST = [
  'ROUTE_UNKNOWN', 'BODY_MALFORMED', 'RECORD_UNAVAILABLE', 'UNREACHABLE',
] as const;
/** The hundred and thirty-six, in `30 §6`'s order. */
export const REFUSAL_CODES = [
  ...PACK, ...GRAMMAR, ...WRITE, ...AUTH, ...LIFECYCLE, ...DIALECT, ...SLASH, ...CONNECTOR, ...HOST,
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** Whether a string is one. For a boundary deciding whether it can hand a code to a caller. */
export const isRefusalCode = (code: string): code is RefusalCode =>
  (REFUSAL_CODES as readonly string[]).includes(code);

export type Refusal = {
  /**
   * One of the hundred and thirty-six. `30-BLUEPRINT` §6, and the list is above.
   *
   * STILL `string`, AND THE GATE IS WHY — but the reason is now four codes rather than twenty-four.
   * `ROUTE_UNKNOWN`, `METRIC_UNKNOWN`, `PAGE_UNKNOWN` and the rest were the concepts `30 §6` was
   * missing and they have been admitted by amendment; the synonyms have been renamed onto the
   * codes that already existed. What is left is `DECLARATION_INVALID` — the catch-all `declare.ts`
   * leans on, 32 occurrences, a project of its own — and three codes whose last emitting site sits in
   * a file the same change could not reach: `INTERNAL` (a crash, not a refusal, and it must move in
   * all three hosts at once or they answer differently), and two deliberate placeholders that live
   * only in tests and should stay there. `SCOPE_INSUFFICIENT` was a fourth, and on 2026-09-10 it
   * went the way `PERSON_REQUIRED` had, into `FORBIDDEN` with the remedy in the sentence.
   *
   * So `refusals.mjs` holds the number as a budget that may only go down. That is still the honest
   * intermediate: the list is real, the drift is measured, and a seventh invented code is red today.
   * The field narrows the day the budget reaches zero, and it is now four away rather than
   * twenty-four.
   *
   * `RECORD_NOT_EMPTY` WAS THE FIFTH AND IT IS GONE. `seed` was its last site, the kernel's
   * importer had already moved to `IMPORT_NOT_EMPTY` for the identical sentence, both map to 422,
   * and nothing in this repository asserted on the old spelling: two codes for one fact, one of
   * them unpublished.
   *
   * `WHERE_OPERATOR_UNSUPPORTED` WAS THE SIXTH AND IT IS GONE, in the one line the gate's own notes
   * said it would take. It had TWO sites rather than the one recorded: the kernel's rule linter,
   * which is an operator applied to a field whose type does not admit it and is now
   * `MATCH_OP_UNSUPPORTED`; and a cursor-plus-order conflict in `list` that was not about a `where`
   * operator at all, and is now `VALUE_MALFORMED` pointing at the cursor rather than at the order,
   * because the order is the legitimate half of that request.
   */
  code: string;
  /** What was wrong, where, and what to do. No apology, no blame. */
  fix: string;
  /** The field or register the refusal is about, when it is about one. */
  at?: string;
  /** What the caller may send instead: an enum's values, a register's fields. */
  allowed?: readonly string[];
  /** For `RATE_LIMITED`: the whole seconds until asking again may be answered. A host sends it as `Retry-After`. */
  retry_after?: number;
  /** The technical reason, kept apart from `fix` so a screen folds it under Details and never prints it as content. */
  detail?: string;
  /** The corrected call, ready to send, where the fix has one (MCP answers carry it). */
  try?: string;
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
 *
 * AND THE THIRD ARM, a not-ok answer carrying neither, is the one that used to come back empty.
 *
 * `packages/host/src/connector.ts:127` is `if (!wrote.ok) throw new Error(fixOf(wrote))`, and
 * `runPull` writes that message onto the run as `error.fix`, so an `{ ok: false }` with no reason
 * became `new Error('')` and the run event a person reads ended at the colon: `balance stopped at
 * page 1: ` and nothing after it. The shape is not hypothetical here. `packages/host/src/index.ts`
 * gives it its own 500 arm in `httpStatus`, and the client mints `UNREACHABLE` for exactly that
 * body arriving over the wire, so both boundaries already expect to meet one.
 *
 * An OK answer still has no sentence, because there is nothing wrong to say.
 */
export const fixOf = <T>(r: Result<T>): string =>
  refused(r)
    ? r.refusal.fix
    : conflicted(r)
      ? `${r.conflict.actor} changed this since you read it. It is at version ${r.conflict.version} now. Read it again and re-apply.`
      : r.ok
        ? ''
        : 'That did not go through, and the answer came back without saying why. Try it once more, and if it fails the same way this is a bug in the record rather than anything you sent.';
export const no = <T>(code: string, fix: string, extra: Omit<Refusal, 'code' | 'fix'> = {}): Result<T> => ({
  ok: false,
  refusal: { code, fix, ...extra },
});

/**
 * `33 §1` port 9: the copies a host keeps of one whole record, by id.
 *
 * THE HOST'S, NOT THE RECORD'S. A self-host writes `VACUUM INTO` files beside the record (`53 §5.4`); the Worker has
 * no such file, and its sealed nightly copy needs a key only the operator holds, so it passes no store and the record
 * refuses `snapshot`, `snapshots` and `restore` with `NOT_IN_THIS_BUILD`. `restore` throws a sentence a person can
 * read when a copy cannot be put back in place.
 */
export type Snapshot = { id: string; at: string; bytes: number };
export interface Snapshots {
  take(label: string): Promise<Snapshot>;
  list(): Promise<Snapshot[]>;
  restore(id: string): Promise<void>;
  prune(keep: number): Promise<void>;
}
/* The connector's one outbound call, and the four names its adapter refuses by (`47 §13` D14). */
export { HTTP_FAULTS, httpFault } from './http.ts';
export type { Http, HttpFault, HttpInit } from './http.ts';

/* Sign-in's seam between a host and the Directory, type-only like everything above. */
export type {
  AssertionJSON, AssertionOptions, Auth, AuthBodies, AuthCall, AuthFlow, AuthResult, InviteProved, Mail, Methods,
  PasskeyInfo, RegistrationJSON, RegistrationOptions, SessionInfo, Who,
} from './auth.ts';
export type { SignupCall, SignupName, SignupVerified } from './auth.ts';
export type { AccountCall, AccountClosed, Suspended } from './auth.ts';

/*
 * The model call's one seam: `Inference`, its request and answer types, and its three refusals.
 *
 * A PLAIN `export *` AND NOT `export type *`, which the port's own header measured: the file ships
 * values (`modelMissing` and its neighbours) and the type-only form erases them, so the first
 * consumer reads a barrel that appears to export the port and does not. No name in it is declared
 * above, which matters because a local declaration wins over a star export without a word.
 */
export * from './inference.ts';

/**
 * On a `list`'s arguments, in process only: this read is for a row's name beside its handle, and marks nobody as having read
 * the row's words. A SYMBOL BECAUSE NOTHING SENT OVER A WIRE CAN HOLD ONE, so no agent can read a row quietly by asking to.
 */
export const NAMES_ONLY: unique symbol = Symbol('names only');
