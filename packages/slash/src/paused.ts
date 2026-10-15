/**
 * Whether a route's candidate is passed over, read from its own last rows in Slash's ledger (ENG-A06).
 *
 * WHY THIS FILE EXISTS. The walk (`call.ts`, `core.run`) asked a model that kept failing first on every ask and waited for
 * it to fail again before it asked the next. A model that keeps failing is now skipped at once: three failures in ten
 * minutes pause it for ten minutes, and a provider saying it does not serve the model pauses it for a day.
 *
 * FROM THE LEDGER AND FROM NOTHING HELD IN MEMORY: both hosts build the engine per request, so a mark in memory would be
 * one per request and would never see the second failure.
 *
 * THE RULE WAS THE HOST ROUTER'S (`packages/host/src/infer.ts`) AND IS THIS PACKAGE'S NOW, unchanged in meaning. The host
 * may not import this package (`docs/31-STACK.md` row 16, `46 §5.1`: only an app imports Slash), so it restates the rule
 * and its test holds the two equal, as `sign-model.ts` restates `health.ts`'s clauses.
 */

/** One of a candidate's last rows, newest first: when it was written and how it ended. */
export type LastRow = { ts: string; status: string; code: string | null; raw: string | null };

/** `@braindog/ports`'s `Missing` for a model the provider does not have, which is what marks a candidate down. */
export const NOT_SERVED = 'the provider does not serve it';

/** How long a model its provider does not serve is passed over: a day, because such a model does not come back in minutes. */
export const NOT_SERVED_PAUSE = 86_400_000;

/** How long a model that failed `FAILS_TO_PAUSE` times inside this window is passed over: the same ten minutes. */
export const FAILED_PAUSE = 600_000;

/** Failures in a row, inside `FAILED_PAUSE`, that pause a candidate. */
export const FAILS_TO_PAUSE = 3;

/** How many of a candidate's rows a pause is read from: three failures make one, so a few more than three is enough. */
export const LAST_ROWS = 6;

/** The longest a provider's own words are kept on a row. */
export const RAW_MAX = 300;

/**
 * A candidate's last rows, newest first, by its handle AND the model it sends: one handle may name another model after a
 * deploy, and the old model's failures are not the new one's.
 *
 * A ROW UNDER `-` IS NOT READ, because it reached no model: a throw that sent nothing, and the row this file's own skip
 * writes. So a skip never counts as a failure, and never as an answer that would end a pause early.
 */
export const LAST_ROWS_SQL = `SELECT ts, status, code, raw FROM slash_call WHERE candidate = ? AND model = ? ORDER BY rowid DESC LIMIT ${LAST_ROWS}`;

const failed = (row: LastRow): boolean => row.status === 'error' && row.code === 'UNREACHABLE';

/** Why a candidate is passed over at `now`, or `null` when it is asked. */
export type PausedFor = 'failed' | 'not_served';

/**
 * Why a candidate is passed over at `now`, read from its own last rows, newest first.
 *
 * NOT SERVED IS A DAY. THREE FAILURES IN TEN MINUTES ARE TEN MINUTES, counted from the newest and only while nothing
 * since has answered: the first row that is not a failure ends the run of failures.
 */
export const pausedFor = (rows: readonly LastRow[], now: number): PausedFor | null => {
  const fails: LastRow[] = [];
  for (const row of rows) {
    if (!failed(row)) break;
    fails.push(row);
  }
  const newest = fails[0];
  if (newest === undefined) return null;
  const at = Date.parse(newest.ts);
  if (newest.raw?.startsWith(NOT_SERVED) === true) return now < at + NOT_SERVED_PAUSE ? 'not_served' : null;
  const third = fails[FAILS_TO_PAUSE - 1];
  return third !== undefined && at - Date.parse(third.ts) <= FAILED_PAUSE && now < at + FAILED_PAUSE ? 'failed' : null;
};

/** Whether a candidate is passed over at `now`: `pausedFor`, as a yes or no. */
export const paused = (rows: readonly LastRow[], now: number): boolean => pausedFor(rows, now) !== null;

/**
 * What a skipped attempt's row says, in `raw`, for the operator's log and the engine's health. Plain words: the row is
 * read by a person on Settings only through `health.ts`, which scrubs it again.
 */
export const PASSED_WORDS: Readonly<Record<PausedFor, string>> = {
  failed: 'Passed over: paused after three failures in ten minutes.',
  not_served: 'Passed over: not served by its provider.',
};

/**
 * A skipped attempt in the ledger's own words, a `WHERE` clause over `slash_call`: under `-` because no model was asked,
 * `nothing` because nothing came of it, so it is neither an answer nor a failure in `health.ts`'s clauses.
 */
export const LEDGER_PASSED = "model = '-' AND status = 'nothing' AND code = 'UNREACHABLE' AND raw LIKE 'Passed over:%'";
