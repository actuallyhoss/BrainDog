/**
 * The engine's health, read from its own ledger: whether Slash's model answers, and one sentence a person can read about it.
 *
 * FROM THE LEDGER AND NOT FROM THE SETTINGS, because a model that is configured and a model that answers are two facts,
 * and the product said the first as if it were the second: the version door answers `slash: true` when a model is set, and
 * Settings read "All healthy" on the day a model job died eight times on the owner's record. Every call to a model is a
 * `slash_call` row (`call.ts`), so the ledger already knows when one last answered and when the failures began.
 *
 * WHAT A ROW SAYS ABOUT THE MODEL. A row whose model was reached and spoke is an answer, whatever came of it afterwards: a
 * reply that broke its schema, cited nothing or could not be filed was still a model answering. A row that ends
 * `UNREACHABLE`, `PULL_REQUEST_REFUSED` (a status no retry mends) or `ANSWER_UNREADABLE` (a reply that never finished, or
 * a timeout) is a model that did not answer. Holds in flight (`SLASH_PENDING`, written before the model is called, see
 * `core.reserve`), budget refusals and the rows of a call that needed no model (settled under `-`) say nothing either way
 * and are passed over.
 *
 * NO MODEL ID, JOB NAME OR CODE IN WHAT A PERSON READS. `said` names the model as "Slash's model" and the key as "your own
 * key", because a person cannot act on `@cf/...` or `UNREACHABLE`; the operator reads those in the Worker's log
 * (ENG-A01), which is where the provider's own words are kept.
 */

import type { Clock, Sql } from '@braindog/ports';

/** The engine's state, its last answer and since when it has been failing, all ISO instants. */
export type EngineHealth = {
  state: 'answering' | 'not_answering' | 'never_asked' | 'off' | 'key_closed';
  /** The newest row in the window whose model answered, or `null` when none did. */
  last_ok: string | null;
  /** The first failure after `last_ok`, where the state is a failure, and `null` otherwise. */
  since: string | null;
};

/** The one sentence a person reads, and whose it is to fix: ours (the operator's), yours (the owner's), or nobody's. */
export type EngineSaid = { text: string; whose: 'ours' | 'yours' | null };

/**
 * What the host knows that the ledger cannot: whether it has a model to ask at all, whether this record runs on its owner's
 * own key, and whether that key would open now. A key that will not open leaves no row (`answer.ts` releases the hold
 * before anything is sent), so only the host can say so. `key_open` absent or `null` is a host that cannot tell.
 */
export type EngineFacts = {
  model: boolean;
  own_key?: boolean | undefined;
  key_open?: boolean | null | undefined;
};

/** How far back the ledger is read. */
export const HEALTH_DAYS = 30;

/** Failures after the last answer before the engine is called not answering: one or two are a blip the retry mends. */
export const FAILS_DOWN = 3;

const DAY = 86_400_000;

/** An answer older than this, with a failure in the last day, is not an engine that answers: it is one that stopped. */
export const ANSWER_STALE_DAYS = 7;

/**
 * A model that did not answer, in the ledger's own words: a `WHERE` clause over `slash_call`.
 *
 * EXPORTED, WITH `LEDGER_ANSWERED` AND `LEDGER_BUDGET`, SO EVERY READING OF THE LEDGER COUNTS ONE WAY. The vital sign
 * `model-answers` (`packages/host/src/sign-model.ts`) judges the same rows Settings does; a host package may not import
 * this one (`46 §5.1`), so it restates the three clauses and its test holds them equal to these.
 */
export const LEDGER_FAILED = "status = 'error' AND code IN ('UNREACHABLE', 'PULL_REQUEST_REFUSED', 'ANSWER_UNREADABLE')";

/** A model that answered: reached (named, not `-`), not a failure, and not a hold, a budget refusal or a build without it. */
export const LEDGER_ANSWERED =
  "model <> '-' AND NOT (" +
  LEDGER_FAILED +
  ") AND (code IS NULL OR code NOT IN ('SLASH_PENDING', 'SPARK_PENDING', 'SLASH_BUDGET_SPENT', 'SPARK_BUDGET_SPENT', 'NOT_IN_THIS_BUILD'))";

/**
 * An ask turned away because the month's asks were spent: neither an answer nor a failure, and never one of the two above.
 *
 * `health` passes it over, since Settings says the month's meter beside it (`asks` in `status`), but the vital sign reads
 * it as a fact of its own: before this, five answers and then fifty refusals read "answered all 5" there (audit 40-42, 5).
 * `SPARK_BUDGET_SPENT` is the old name `call.ts`'s migration renames, kept so a ledger not yet migrated counts the same.
 * UNDER `-` ONLY (`TURNED_AWAY_SQL`): a per-call neuron ceiling refuses under the model's own name (the worker's
 * `budgetSpent`), and that is one call too large, never the month spent.
 */
export const LEDGER_BUDGET = "model = '-' AND code IN ('SLASH_BUDGET_SPENT', 'SPARK_BUDGET_SPENT')";

/**
 * Read the last `HEALTH_DAYS` of Slash's ledger and say how the engine stands.
 *
 * `off` FIRST, because a host with no model has nothing to report. Then the owner's own key, where the host says it will
 * not open or the newest failure is the provider turning the key away. Then the ledger: no row is `never_asked`; a
 * failure under a day old after the last answer is `not_answering` when there are three or more of them, or when that
 * answer is older than `ANSWER_STALE_DAYS`, and so is a window with failures and no answer at all; anything else is
 * `answering`. Failures older than a day with an answer before them read as
 * `answering`, since `last_ok` is still true and nobody has asked since.
 */
export function health(sql: Sql, clock: Clock, facts: EngineFacts): EngineHealth {
  if (!facts.model) return { state: 'off', last_ok: null, since: null };
  const now = clock.now();
  const from = new Date(now - HEALTH_DAYS * DAY).toISOString();
  /* A STORE NEVER OPENED IS A LEDGER WITH NO ROWS, and reading it must not create it: the health read answers a person
     looking at Settings, and `openStore` is the engine's to run on its first ask. */
  const ledger = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'")?.n ?? 0;
  const lastOk =
    ledger === 0 ? null : (sql.one<{ ts: string | null }>(`SELECT MAX(ts) AS ts FROM slash_call WHERE ts >= ? AND ${LEDGER_ANSWERED}`, from)?.ts ?? null);
  const fails =
    ledger === 0
      ? { n: 0, first: null, newest: null }
      : (sql.one<{ n: number; first: string | null; newest: string | null }>(
          `SELECT COUNT(*) AS n, MIN(ts) AS first, MAX(ts) AS newest FROM slash_call WHERE ts >= ? AND ts > ? AND ${LEDGER_FAILED}`,
          from,
          lastOk ?? '',
        ) ?? { n: 0, first: null, newest: null });

  if (facts.own_key === true) {
    const keyRefused =
      fails.newest !== null &&
      sql.one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM slash_call WHERE ts = ? AND tier <> 'a' AND code = 'PULL_REQUEST_REFUSED' AND ${LEDGER_FAILED}`,
        fails.newest,
      )?.n !== 0;
    if (facts.key_open === false || keyRefused) return { state: 'key_closed', last_ok: lastOk, since: fails.first };
  }

  if (lastOk === null && fails.n === 0) return { state: 'never_asked', last_ok: null, since: null };
  if (lastOk === null) return { state: 'not_answering', last_ok: null, since: fails.first };
  const fresh = fails.newest !== null && now - Date.parse(fails.newest) < DAY;
  /* A RECENT ANSWER EARNS THE BLIP ITS TWO FREE FAILURES; AN OLD ONE DOES NOT. Two fresh failures after an answer twenty
     days old read "answered 20 days ago" while the model was failing, so past `ANSWER_STALE_DAYS` one fresh failure is
     enough. */
  const stale = now - Date.parse(lastOk) > ANSWER_STALE_DAYS * DAY;
  if (fresh && (fails.n >= FAILS_DOWN || stale)) return { state: 'not_answering', last_ok: lastOk, since: fails.first };
  return { state: 'answering', last_ok: lastOk, since: null };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "6 October", in UTC, as the brief writes a date. */
const day = (iso: string): string => {
  const at = new Date(iso);
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
};

/** "just now", "a minute ago", "3 hours ago", "2 days ago". */
const ago = (iso: string, nowMs: number): string => {
  const ms = Math.max(0, nowMs - Date.parse(iso));
  const say = (n: number, one: string, many: string): string => (n === 1 ? `${one} ago` : `${n} ${many} ago`);
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return say(Math.floor(ms / 60_000), 'a minute', 'minutes');
  if (ms < DAY) return say(Math.floor(ms / 3_600_000), 'an hour', 'hours');
  return say(Math.floor(ms / DAY), 'a day', 'days');
};

/** The one sentence for a state, and whose it is to fix. */
export function said(h: EngineHealth, nowMs: number): EngineSaid {
  switch (h.state) {
    case 'answering':
      return { text: h.last_ok === null ? "Slash's model is answering." : `Slash's model answered ${ago(h.last_ok, nowMs)}.`, whose: null };
    case 'not_answering':
      return {
        text: `${h.since === null ? "Slash's model is not answering." : `Slash's model has not answered since ${day(h.since)}.`} That is ours to fix. Until it is back, BrainDog works from its rules.`,
        whose: 'ours',
      };
    case 'key_closed':
      return {
        text: `${h.since === null ? 'Your own key for Slash will not open.' : `Your own key for Slash has not opened since ${day(h.since)}.`} Open it in the vault, or switch to the included model.`,
        whose: 'yours',
      };
    case 'never_asked':
      return { text: 'Slash has not needed its model yet.', whose: null };
    case 'off':
      return { text: 'Slash has no model on this host, so BrainDog works from its rules.', whose: null };
  }
}
