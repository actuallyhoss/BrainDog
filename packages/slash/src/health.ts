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
 * ONLY THE MODEL THAT WRITES (`LEDGER_WRITING`). The search embedding is a row of kind `embed`, and the state, the last
 * answer, the run of failures, who answered last and the last words are read from every row but those. The embedding
 * answered every few minutes through the days the model that writes did not, and health said "answering" for all of them.
 *
 * NO MODEL ID, JOB NAME OR CODE IN WHAT A PERSON READS. `said` names the model as "Slash's model" and the key as "your own
 * key", because a person cannot act on `@cf/...` or `UNREACHABLE`; the operator reads those in the Worker's log
 * (ENG-A01), which is where the provider's own words are kept.
 *
 * BESIDE THE SENTENCE, WHAT SETTINGS SAYS UNDER IT (ENG-A05, ENG-A06, "health shown"): which model answered
 * last and when, the provider's own words for the newest failure (scrubbed again, never a key), how many asks needed a
 * second model, and this month's asks by whose allowance they spent. "Rules are the fallback, not the engine.":
 * a fallback that doubles the bill unseen is the risk the scope names, so the share is read here and not guessed.
 */

import type { Clock, Sql } from '@braindog/ports';
import { LEDGER_PASSED } from './paused.ts';

/** The engine's state, its last answer and since when it has been failing, all ISO instants. */
export type EngineHealth = {
  state: 'answering' | 'not_answering' | 'never_asked' | 'off' | 'key_closed';
  /** The newest row in the window whose model answered, or `null` when none did. */
  last_ok: string | null;
  /** The first failure after `last_ok`, where the state is a failure, and `null` otherwise. */
  since: string | null;
  /*
   * WHAT THE LEDGER SAYS BESIDE THE STATE (ENG-A05, ENG-A06), each ABSENT AND NEVER ZERO OR NULL where the ledger has
   * nothing to say: a host restates the three fields above (`packages/host/src/engine-health.ts`) and its tests hold a
   * failing ledger to exactly them, and an older host hands none of these, so a reader treats absent as "not said".
   */
  /** The newest answer in the window: the model that gave it, by the name on its row, and when. */
  answeredBy?: { model: string; at: string } | undefined;
  /** The provider's own words on the newest failure in the window, scrubbed again here (`scrubWords`) and cut at 200. */
  lastWords?: string | undefined;
  /** The asks answered in the window that needed a second model, over the asks answered; present once one was. */
  doubleShare?: number | undefined;
  /** The two counts `doubleShare` is made of, so a person reads "2 of 40" and never a ratio. */
  doubleOf?: { twice: number; asks: number } | undefined;
  /** This month's asks by whose allowance they spent, as the meter counts them; present once one was spent. */
  spent?: { person: number; background: number } | undefined;
  /** Attempts in the window the walk passed over because their model was paused (`LEDGER_PASSED`, `paused.ts`); present once one was. */
  passedOver?: number | undefined;
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
 * A call that writes: every row but an embedding. HEALTH SPEAKS FOR THE MODEL THAT WRITES (the brief, the headlines, the
 * digest, Slash's own asks) AND NEVER FOR THE SEARCH EMBEDDING. On 22 October the embedding answered every few minutes
 * while no writing call had for days, so "answering" and "answered 11 minutes ago" were true of the wrong model. Kept
 * apart from the three clauses above, which the vital sign and the engine's readings restate and still count embeddings.
 */
export const LEDGER_WRITING = "kind <> 'embed'";

/** The most of a provider's own words a person is shown. */
export const WORDS_MOST = 200;

/**
 * A provider's own words, fit for a person to read: anything shaped like a key cut out, then cut at `WORDS_MOST`.
 *
 * THE WORKER'S `scrubRaw` (`apps/worker/src/inference.ts`), RESTATED, because this package may not import an app and a
 * `raw` reaches the ledger by more than one road: the Worker scrubs the platform's sentence before it is written, but the
 * host's router writes a throw's message as it came (`packages/host/src/infer.ts`, `said`), and a provider quotes back
 * what it was sent. So it is scrubbed again on the way out, whoever wrote it. The first patterns are the Worker's, line
 * for line, and a change to one is a change to both. The last three are this one's: a person reads these words and the
 * operator's log does not need to be cut as far, so ids and account numbers go here and stay there.
 */
export const scrubWords = (said: string): string =>
  said
    .replace(/\b(bearer|basic)\s+\S+/giu, '$1 [cut]')
    .replace(/\b(?:sk|pk|rk)[-_][\w-]{6,}|\b(?:ghp|gho|ghu|ghs|ghr|github_pat|glpat|xox[abprse]|cfut|cfat|AIza)[\w-]{6,}|\b(?:AKIA|ASIA)[A-Z0-9]{12,}/gu, '[cut]')
    .replace(/\b((?:api|access|secret|auth)[ _-]?(?:key|token)s?)((?:\s+provided)?\s*:?\s+)(?=\S*\d)\S{6,}/giu, '$1$2[cut]')
    .replace(/(["']?)\b([\w-]*(?:key|token|secret|password|authorization)[\w-]*)\1(\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[^\s,;}&]+)/giu, '$1$2$1$3[cut]')
    .replace(/(["']?)\b(content|prompt|text|input)\1(\s*:\s*)(?:"(?:[^"\\]|\\.)*"?|\[(?:[^\]"]|"(?:[^"\\]|\\.)*"?)*\]?)/giu, '$1$2$1$3"[cut]"')
    .replace(/[A-Za-z0-9_\-+/=]{32,}/gu, '[cut]')
    /* AND WHAT A PERSON CANNOT ACT ON, which the operator's log keeps: a record's id, a request's id, an account number. */
    .replace(/(?<![A-Za-z0-9])[0-9A-HJKMNP-TV-Z]{26}(?![A-Za-z0-9])/gu, '[cut]')
    .replace(/(?<![A-Za-z0-9])[0-9a-f]{16,}(?![A-Za-z0-9])/gu, '[cut]')
    .replace(/(?<![A-Za-z0-9.])\d{8,}(?![A-Za-z0-9])/gu, '[cut]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, WORDS_MOST);

/** A `WHERE` clause as a 0 or 1 a `SELECT` can sum: a clause that reads NULL (a failure's `code IN` on no code) is 0. */
const flag = (clause: string): string => `CASE WHEN ${clause} THEN 1 ELSE 0 END`;

/** The holds in flight, which are no attempt yet and sit between the rows of an ask in `rowid` order. */
const NOT_HELD = "(code IS NULL OR code NOT IN ('SLASH_PENDING', 'SPARK_PENDING'))";

/**
 * ASKS THAT NEEDED A SECOND MODEL, read from the order the rows were settled in, because no column ties two attempts to
 * one ask. A router writes one row an attempt and settles each as it ends (`account` replaces a hold, so `rowid` is the
 * order of settling), so an ask that fell through reads as a failure on one candidate and, next, an answer on another
 * on the same route. An answer counts as a second model's when the row settled just before it is such a failure: on a
 * candidate, on the same route (both may be NULL, as `core`'s own walk writes), and on a candidate that is not this
 * answer's. A schema retry on the same candidate is not counted; it is one model asked twice, and it spends once.
 */
const DOUBLED = `
  WITH seq AS (
    SELECT rowid AS r, route, candidate, ${flag(LEDGER_ANSWERED)} AS answered, ${flag(LEDGER_FAILED)} AS failed
    FROM slash_call WHERE ts >= ? AND ${NOT_HELD} AND ${LEDGER_WRITING}
  ),
  lagged AS (
    SELECT answered, route, candidate,
           LAG(failed) OVER w AS p_failed, LAG(candidate) OVER w AS p_candidate, LAG(route) OVER w AS p_route
    FROM seq WINDOW w AS (ORDER BY r)
  )
  SELECT COALESCE(SUM(answered), 0) AS asks,
         COALESCE(SUM(CASE WHEN answered = 1 AND p_failed = 1 AND p_candidate IS NOT NULL AND p_route IS route AND p_candidate IS NOT candidate THEN 1 ELSE 0 END), 0) AS twice
  FROM lagged`;

/**
 * This month's asks by whose allowance they spent: `call.ts`'s `COUNT_3` and `BACKGROUND_3`, restated because neither is
 * exported, and held equal to `asksUsed` and `backgroundUsed` by `test/health.test.ts`.
 */
const SPENT =
  "SELECT COALESCE(SUM(CASE WHEN tier = 'a' AND spends = 'person' AND model <> '-' THEN 1 ELSE 0 END), 0) AS person, " +
  "COALESCE(SUM(CASE WHEN spends = 'background' THEN 1 ELSE 0 END), 0) AS background FROM slash_call WHERE ts >= ?";

/** The first instant of the UTC month `ms` falls in, as the meter's month starts (`monthOf` in `call.ts`). */
const monthStart = (ms: number): string => {
  const at = new Date(ms);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString();
};

type Beside = Pick<EngineHealth, 'answeredBy' | 'lastWords' | 'doubleShare' | 'doubleOf' | 'spent' | 'passedOver'>;

/**
 * What the ledger says beside the state, each field only where it says something.
 *
 * THE COLUMNS VERSION 3 ADDED ARE READ ONLY WHERE THEY ARE. A store at 2 not yet opened by a build at 3 has no `raw`,
 * `candidate` or `spends`, and this read must not migrate it (`health` below), so its table's own `CREATE` text says
 * which it has: `sqlite_master` is read where `PRAGMA table_info` is refused (a Durable Object's authorizer). Such a store
 * still says who answered last, which needs none of them. Old rows in a store at 3 hold NULL there and read as nothing.
 */
const beside = (sql: Sql, from: string, nowMs: number): Beside => {
  const out: Beside = {};
  const made = sql.one<{ sql: string | null }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'")?.sql ?? '';
  const v3 = /\braw\b/.test(made) && /\bcandidate\b/.test(made) && /\bspends\b/.test(made);

  const last = sql.one<{ model: string; ts: string }>(`SELECT model, ts FROM slash_call WHERE ts >= ? AND ${LEDGER_WRITING} AND ${LEDGER_ANSWERED} ORDER BY ts DESC, rowid DESC LIMIT 1`, from);
  if (last !== undefined) out.answeredBy = { model: last.model, at: last.ts };
  if (!v3) return out;

  const failed = sql.one<{ raw: string | null }>(`SELECT raw FROM slash_call WHERE ts >= ? AND ${LEDGER_WRITING} AND ${LEDGER_FAILED} ORDER BY ts DESC, rowid DESC LIMIT 1`, from);
  const words = failed?.raw ? scrubWords(failed.raw) : '';
  if (words !== '') out.lastWords = words;

  const doubled = sql.one<{ asks: number; twice: number }>(DOUBLED, from);
  if (doubled !== undefined && doubled.asks > 0) {
    out.doubleShare = doubled.twice / doubled.asks;
    out.doubleOf = { twice: doubled.twice, asks: doubled.asks };
  }

  const passed = sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM slash_call WHERE ts >= ? AND ${LEDGER_PASSED}`, from);
  if (passed !== undefined && passed.n > 0) out.passedOver = passed.n;

  const spent = sql.one<{ person: number; background: number }>(SPENT, monthStart(nowMs));
  if (spent !== undefined && spent.person + spent.background > 0) out.spent = { person: spent.person, background: spent.background };
  return out;
};

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
    ledger === 0 ? null : (sql.one<{ ts: string | null }>(`SELECT MAX(ts) AS ts FROM slash_call WHERE ts >= ? AND ${LEDGER_WRITING} AND ${LEDGER_ANSWERED}`, from)?.ts ?? null);
  const fails =
    ledger === 0
      ? { n: 0, first: null, newest: null }
      : (sql.one<{ n: number; first: string | null; newest: string | null }>(
          `SELECT COUNT(*) AS n, MIN(ts) AS first, MAX(ts) AS newest FROM slash_call WHERE ts >= ? AND ts > ? AND ${LEDGER_WRITING} AND ${LEDGER_FAILED}`,
          from,
          lastOk ?? '',
        ) ?? { n: 0, first: null, newest: null });
  const more: Beside = ledger === 0 ? {} : beside(sql, from, now);

  if (facts.own_key === true) {
    const keyRefused =
      fails.newest !== null &&
      sql.one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM slash_call WHERE ts = ? AND tier <> 'a' AND code = 'PULL_REQUEST_REFUSED' AND ${LEDGER_WRITING} AND ${LEDGER_FAILED}`,
        fails.newest,
      )?.n !== 0;
    if (facts.key_open === false || keyRefused) return { state: 'key_closed', last_ok: lastOk, since: fails.first, ...more };
  }

  if (lastOk === null && fails.n === 0) return { state: 'never_asked', last_ok: null, since: null, ...more };
  if (lastOk === null) return { state: 'not_answering', last_ok: null, since: fails.first, ...more };
  const fresh = fails.newest !== null && now - Date.parse(fails.newest) < DAY;
  /* A RECENT ANSWER EARNS THE BLIP ITS TWO FREE FAILURES; AN OLD ONE DOES NOT. Two fresh failures after an answer twenty
     days old read "answered 20 days ago" while the model was failing, so past `ANSWER_STALE_DAYS` one fresh failure is
     enough. */
  const stale = now - Date.parse(lastOk) > ANSWER_STALE_DAYS * DAY;
  if (fresh && (fails.n >= FAILS_DOWN || stale)) return { state: 'not_answering', last_ok: lastOk, since: fails.first, ...more };
  return { state: 'answering', last_ok: lastOk, since: null, ...more };
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
