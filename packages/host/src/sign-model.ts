/**
 * The vital sign "The model answers" (`model-answers`), filed by the
 * host once a night through the kernel's one verb for it, `signRead`.
 *
 * WHY THE HOST FILES IT. The kernel cannot see a model call: every ask is written to Slash's own ledger, `slash_call`
 * (`slash-ask.ts` `read` and `background`, and the engine's own rows), which lives in the host's storage. And the model
 * jobs that died on the retry ladder are the kernel's faults (`fault.ts`), which this reads through the kernel's
 * `faults()` where the record has it. On his record no model composed a page on the Cloud for days and nothing said so
 * ("whether a model answered").
 *
 * THE RULE, 2.2's: over 7 days, red when the newest ask failed, when fewer than 9 in 10 of 5 or more were answered, when
 * a model job is dead, or when the last day held asks and none was answered. `none` when there was no ask in the week
 * and no model job is dead: a record nobody asked is not a green one.
 *
 * AND RED WHEN THE MONTH'S ASKS ARE SPENT (5). A budget refusal is neither an answer nor a failure, so the
 * two counts below pass it over, and before this five answers and then fifty refusals read "answered all 5 asks", and a
 * week of nothing but refusals read "No one asked the model anything". Now the refusals are a fact of their own, and the
 * sign is red while the newest thing in the ledger is a refusal and its month has not yet turned: nothing the record
 * asks reaches the model until it does, and the reading says the day the asks come back.
 *
 * WHAT COUNTS, AND IT IS SETTINGS' COUNT. A row is an ask when Slash's own health reads it as an answer or a failure
 * (`packages/slash/src/health.ts`, `LEDGER_ANSWERED` and `LEDGER_FAILED`), and nothing else is: a hold still in flight, a
 * month's asks spent, a build without the model and a call that needed none say nothing about the model. Before this the
 * sign counted every `error` as a failure, so at his 600-ask cap the night's budget refusals read red here while
 * Settings read "answered an hour ago" over the same ledger. An answer the engine's own checks refused, or one that broke
 * its schema, was still the model speaking.
 *
 * AN ASK, NOT AN ATTEMPT, AND NEVER A TEST (`asksOf`). A model a route passed over for the next is one ask, and the
 * model tests (`probe`) are none. And a red reading says which kind of ask went unanswered and since when
 * (`kindsMissed`): "Digest summaries have not been answered since 14 October." A count alone named nothing to look at.
 *
 * NO PROVIDER'S WORDS, ONLY THE FAULT'S OWN SENTENCE. A dead job's kept error and the host's last failure can carry a
 * provider's words about a key, which is why `faults` (`packages/record/src/methods/faults.ts`) holds the error back
 * from everybody but a self-host's owner, and a sign is read by anyone who reads signs. So the reading quotes the
 * fault's fixed `said`, a plain sentence from the kernel's table (`fault.ts` `SAID`), and the operator reads the
 * provider's words in the Worker's log line, where they always were.
 *
 * AND WHAT THE MODEL WROTE THAT IS STILL ON THE PAGES (thinking C3): "Page headlines: 9 of 14 pages written by the model
 * now", the count the record's daily lint round keeps (`HEADLINES_HELD`), said first in the facts while it is under two
 * days old. Asks answered say the model spoke; this says how much of what a person reads is its line and not the rules'.
 *
 * AND THE OTHER WORK THAT STOPPED. A dead job that is not a model's (a notification, a pull, a copy, a script) does not
 * turn this sign red, since it is not the model, but it is said in the facts in its own sentence, because no other sign
 * reads faults and a fault nobody reads is the dead job disappearing.
 */

import { SLASH, type SignReading } from '@braindog/kernel';
import type { Result, Sql } from '@braindog/ports';
import { HEADLINES_HELD, heldOn, heldSaid } from '@braindog/record';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ── the thresholds, one line each, as 2.2 sets them ──────────────────────────────────────────────────────────────────── */

/** The window the sign reads. */
export const MODEL_WINDOW_DAYS = 7;
/** The share rule applies from this many asks in the window. */
export const MODEL_ASKS_LEAST = 5;
/** ...and is red when fewer than 9 in 10 were answered: answered * 10 < asks * 9. */
export const MODEL_ANSWERED_TENTHS = 9;
/** The last day: asks in it and none answered is red. */
export const MODEL_DAY_MS = DAY;
/** How many of the other dead jobs' sentences the facts carry. */
const OTHER_MOST = 2;
/** The longest reading a sign files. */
const READ_MOST = 280;

/* ── the ledger's three clauses, Slash's own ───────────────────────────────────────────────────────────────────────────── */

/**
 * `LEDGER_FAILED`, `LEDGER_ANSWERED` and `LEDGER_BUDGET` of `packages/slash/src/health.ts`, RESTATED BECAUSE THIS PACKAGE
 * MAY NOT IMPORT THAT ONE (`46 §5.1`, and `graph` refuses a relative import across the line). The definition is Slash's;
 * these three strings are held equal to it, character for character, by `test/sign-model.test.ts`, so a change there
 * goes red here.
 */
export const LEDGER_FAILED = "status = 'error' AND code IN ('UNREACHABLE', 'PULL_REQUEST_REFUSED', 'ANSWER_UNREADABLE')";
export const LEDGER_ANSWERED =
  "model <> '-' AND NOT (" +
  LEDGER_FAILED +
  ") AND (code IS NULL OR code NOT IN ('SLASH_PENDING', 'SPARK_PENDING', 'SLASH_BUDGET_SPENT', 'SPARK_BUDGET_SPENT', 'NOT_IN_THIS_BUILD'))";
/** An ask turned away because the month's asks were spent: neither of the two above. */
export const LEDGER_BUDGET = "model = '-' AND code IN ('SLASH_BUDGET_SPENT', 'SPARK_BUDGET_SPENT')";

/** A fault as the kernel's `faults()` answers one (`packages/kernel/src/fault.ts`), read structurally. Its `error` is never read. */
export type ModelFault = { kind: string; said: string; last_at: string };

/** What this needs of the kernel: the verb that files, and where the record has it, the open faults. */
export type ModelSignKernel = {
  signRead: (id: string, reading: SignReading) => Result<{ sign: string; day: string }>;
  faults?: () => Result<{ faults: readonly ModelFault[] }>;
  identity?: () => { tz?: string | null } | null | undefined;
  /** Where the record keeps its prefs: Slash's holds the count of page lines the model wrote (`HEADLINES_HELD`). */
  prefsOf?: (person: string) => Record<string, unknown>;
};

/** How old the kept count of model-written lines may be and still be said as now: the lint's day and one more. */
const HELD_FRESH_MS = 2 * DAY;

/** The fact of how many pages say the model's line now, or none where no fresh count is kept. */
function pagesWritten(kernel: ModelSignKernel, nowMs: number): string[] {
  if (typeof kernel.prefsOf !== 'function') return [];
  const held = heldOn(kernel.prefsOf(SLASH)[HEADLINES_HELD]);
  if (held === null || !(Date.parse(held.day) > nowMs - HELD_FRESH_MS)) return [];
  return [heldSaid(held)];
}

/**
 * What a host may hand beside the ledger.
 *
 * @deprecated `lastFail` is accepted so a host that still passes it compiles, and it is never read: the provider's words
 * are the operator's log line, not a sign (the header's second rule).
 */
export type ModelSignMore = { lastFail?: { raw: string; at: number } | null };

/** `n thing` or `n things`. */
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A day a person reads in the record's zone: `28 September`. */
function dateSaid(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'long' }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(ms);
  }
}

/**
 * One ask of the week as the sign reads it: `ok` is 1 where Slash's health reads an answer, and `spent` is 1 where it
 * reads a budget refusal, which is never an answer and never a failure. `purpose` is what the ask was for, `null` on a
 * ledger built before the column (store version 3), where nothing can say it.
 */
type Ask = { ts: string; ok: number; spent: number; purpose: string | null };

/** The model tests: the engine's probe (`engine-probe.ts`) and the silent model's half-hourly test (`model-jobs.ts`). */
const PROBE = 'probe';
/** The search embedding (`jobs.ts`): it answers every few minutes, so counting it read a silent writing model as answering. */
const EMBED = 'embed';

/**
 * The asks of the window and its budget refusals, Slash's health's way, newest first. `[]` where Slash never ran.
 *
 * ONE ROW AN ASK, AND A TEST IS NO ASK. The ledger writes one row an ATTEMPT: a route's walk writes the candidate it
 * passed over and then the one that ended the walk (`core.run`, `digestProse`, the host's `infer`), so an ask the second
 * model answered read here as one failure and one answer, and one that no candidate answered as two failures. A row is
 * passed over the way Slash's health reads a second model (`DOUBLED` in `packages/slash/src/health.ts`): a failure on a
 * candidate whose next settled row is the same purpose, on the same route, on another candidate. And the model tests
 * spend nothing and ask nothing of the record, so `probe` is not counted either: the half-hourly test of a silent model
 * read as one more ask the model did not answer every half hour of an outage. The engine's health still reads both.
 *
 * READ WHERE THE COLUMNS ARE, off the table's own `CREATE` text as `engine-ledger.ts` reads it: a ledger built before
 * store version 3 has no `purpose`, `route` or `candidate`, and every row of it is an ask, as it always was.
 */
function asksOf(sql: Sql, sinceMs: number): Ask[] {
  const built = sql.one<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'");
  if (built === undefined) return [];
  const has = (column: string): boolean => new RegExp(`\\b${column}\\b`, 'u').test(built.sql);
  const purpose = has('purpose') ? 'purpose' : 'NULL';
  const walked = has('route') && has('candidate');
  const route = walked ? 'route' : 'NULL';
  const candidate = walked ? 'candidate' : 'NULL';
  return sql.all<Ask>(
    `SELECT ts, ok, spent, purpose FROM (
       SELECT rowid AS r, ts, ${purpose} AS purpose, ${route} AS route, ${candidate} AS candidate,
              CASE WHEN ${LEDGER_ANSWERED} THEN 1 ELSE 0 END AS ok, CASE WHEN ${LEDGER_BUDGET} THEN 1 ELSE 0 END AS spent,
              CASE WHEN ${LEDGER_FAILED} THEN 1 ELSE 0 END AS failed,
              LEAD(${purpose}) OVER w AS n_purpose, LEAD(${route}) OVER w AS n_route, LEAD(${candidate}) OVER w AS n_candidate
       FROM slash_call WHERE ts >= ? AND ((${LEDGER_ANSWERED}) OR (${LEDGER_FAILED}) OR (${LEDGER_BUDGET}))
       WINDOW w AS (ORDER BY rowid)
     )
     WHERE (purpose IS NULL OR purpose NOT IN ('${PROBE}', '${EMBED}'))
       AND NOT (failed = 1 AND candidate IS NOT NULL AND n_candidate IS NOT NULL AND n_candidate IS NOT candidate
                AND n_route IS route AND n_purpose IS purpose)
     ORDER BY ts DESC, r DESC`,
    new Date(sinceMs).toISOString(),
  );
}

/**
 * What each kind of ask is, in a person's words, as Usage names it (`apps/web/src/lib/ui/slash-asks.ts`), restated
 * because this package may not import an app. A purpose with no entry is a newer host's, and is said as other asks.
 */
const KINDS: Readonly<Record<string, string>> = {
  ask: 'Your questions',
  automation: 'Automation steps',
  plan: 'Readings of what you wrote at sign-up',
  headline: 'Page headlines',
  understand: 'Readings of what arrived',
  look: 'Daily looks and drafts',
  compose: 'Drafts',
  skill: 'Skill revisions',
  pattern: 'Pattern drafts',
  prose: 'Digest summaries',
  embed: 'Search updates',
};

/** How many kinds of ask a red reading names, the most missed first. */
const KINDS_MOST = 2;

/**
 * Which kinds of ask the model did not answer and since when, one sentence each, the most missed first. `[]` on a
 * ledger that cannot say what an ask was for.
 *
 * STILL FAILING IS SAID WITH THE DAY IT BEGAN, which is the first miss after that kind's last answer this week, or the
 * week's first miss where none was answered: "Digest summaries have not been answered since 14 October." A kind that
 * answers again is said with how often it missed and its last miss, so a week that mended itself does not read as a
 * fault still open. Before this the sentence was a count alone, and "87 of 190" said neither what to look at nor whether
 * it was over.
 */
function kindsMissed(asks: readonly Ask[], tz: string): string[] {
  const by = new Map<string, Ask[]>();
  for (const a of asks) {
    if (a.purpose === null) return [];
    const kind = Object.hasOwn(KINDS, a.purpose) ? a.purpose : 'other';
    by.set(kind, [...(by.get(kind) ?? []), a]);
  }
  const missed = [...by.entries()]
    .map(([kind, rows]) => ({ kind, rows, no: rows.filter((a) => !answered(a)).length }))
    .filter((k) => k.no > 0)
    .sort((a, b) => b.no - a.no || (a.kind < b.kind ? -1 : 1))
    .slice(0, KINDS_MOST);
  return missed.map(({ kind, rows, no }) => {
    /* NEWEST FIRST, as the week's rows are. */
    const name = KINDS[kind] ?? 'Other asks';
    const lastOk = rows.findIndex(answered);
    if (lastOk === 0) {
      const lastMiss = rows.find((a) => !answered(a))!;
      return `${name} missed ${no === 1 ? 'once' : `${no} times`}, the last on ${dateSaid(Date.parse(lastMiss.ts), tz)}, and answer again.`;
    }
    const run = lastOk === -1 ? rows : rows.slice(0, lastOk);
    const began = dateSaid(Date.parse(run[run.length - 1]!.ts), tz);
    /* NO ANSWER IN THE WEEK, so the run may have begun before it: the week's first miss is said as that, not as its start. */
    if (lastOk === -1) return `${name} have not been answered this week, ${no === 1 ? 'one ask' : `${no} asks`} from ${began}.`;
    return `${name} have not been answered since ${began}.`;
  });
}

/** The first instant of the month after `ms`, in UTC: the day a month's spent asks come back (`slash/src/call.ts` `resets`). */
const monthAfter = (ms: number): number => {
  const at = new Date(ms);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1);
};

/** The record's open faults, newest first: the model's (`infer.*`) and the rest. None where the kernel has no `faults()`. */
function faultsOf(kernel: ModelSignKernel): { model: ModelFault[]; other: ModelFault[] } {
  if (typeof kernel.faults !== 'function') return { model: [], other: [] };
  const got = kernel.faults();
  if (!got.ok) return { model: [], other: [] };
  const all = [...got.value.faults].sort((a, b) => b.last_at.localeCompare(a.last_at));
  return { model: all.filter((f) => f.kind.startsWith('infer.')), other: all.filter((f) => !f.kind.startsWith('infer.')) };
}

/** Each sentence once: two causes of one kind read the same words. */
const sentences = (faults: readonly ModelFault[]): string[] => [...new Set(faults.map((f) => f.said.slice(0, 200)))];

const answered = (a: Ask): boolean => a.ok === 1;

/**
 * Read the week's asks and the open faults, and judge them by 2.2's rule. Pure over its inputs, so a test reads the
 * same reading the night files. `_more` is not read (`ModelSignMore`).
 */
export function readModelSign(kernel: ModelSignKernel, sql: Sql, nowMs: number, _more: ModelSignMore = {}): SignReading {
  const tz = (typeof kernel.identity === 'function' ? kernel.identity()?.tz : null) || 'UTC';
  const since = nowMs - MODEL_WINDOW_DAYS * DAY;
  const rows = asksOf(sql, since);
  /* A MISSED FIRST PLAN IS NOT A FAULT (audit 11-01, AP10): the sign-up's reading of what a stranger wrote falls back to the
     rules when the model is quiet, and is never asked again, so nothing waits on it and nobody can mend it. Counted, it
     opened a new person's Settings on "The model did not answer 1 of 1 ask this week". */
  const asks = rows.filter((a) => a.spent !== 1 && !(a.purpose === 'plan' && a.ok !== 1));
  const refused = rows.filter((a) => a.spent === 1).length;
  const faults = faultsOf(kernel);
  const dead = faults.model.filter((f) => Date.parse(f.last_at) >= since || f.last_at === '');
  /* THE OTHER WORK, OPEN AS LONG AS ITS FAULT IS: a dead copy or notification is still dead after the week. */
  const other = sentences(faults.other).slice(0, OTHER_MOST);
  const written = pagesWritten(kernel, nowMs);

  /* THE MONTH SPENT: the newest row is a budget refusal, so no answer came after it, and nothing asked since its month
     began reached the model. Once that month turns the asks are back, and the refusals stay a fact but nothing more. */
  const latest = rows[0];
  const backMs = latest !== undefined && latest.spent === 1 ? monthAfter(Date.parse(latest.ts)) : null;
  const spent = backMs !== null && backMs > nowMs;
  /* The refusals since the last answer or failure, newest first: the run the reading counts and dates from its oldest. */
  const run = rows.findIndex((a) => a.spent !== 1);
  const turnedAway = rows.slice(0, run === -1 ? rows.length : run);
  const firstAway = turnedAway[turnedAway.length - 1];
  const spentSaid =
    firstAway === undefined
      ? ''
      : `The month's Slash questions are used: ${count(turnedAway.length, 'question')} since ${dateSaid(Date.parse(firstAway.ts), tz)} did not reach the model.`;
  /* The day is the meter's, which turns at midnight UTC, so it is said in UTC the way Slash's own refusal says it. */
  const backSaid = backMs === null ? '' : dateSaid(backMs, 'UTC');

  if (asks.length === 0 && dead.length === 0) {
    if (refused === 0) return { state: 'none', value: null, said: 'No one asked the model anything this week.', facts: [...written, ...other] };
    /* REFUSALS ALONE ARE NEVER "No one asked": someone did, and the month's meter turned every ask away. */
    if (!spent) {
      const said = `No ask reached the model this week: the month's asks were spent for all ${refused}. They were back on ${backSaid}.`;
      return { state: 'none', value: null, said, facts: [...written, ...other] };
    }
  }

  const yes = asks.filter(answered).length;
  const no = asks.length - yes;
  const newest = asks[0];
  const dayAsks = asks.filter((a) => Date.parse(a.ts) >= nowMs - MODEL_DAY_MS);
  const lastOk = asks.find(answered);
  const deadSaid = sentences(dead);

  const facts: string[] = [...written];
  if (asks.length > 0) facts.push(`${count(asks.length, 'ask')} this week, ${yes} answered.`);
  if (lastOk !== undefined) facts.push(`The model last answered on ${dateSaid(Date.parse(lastOk.ts), tz)}.`);
  else if (asks.length > 0) facts.push('The model has not answered once this week.');
  /* NOT ON A SPENT READING, whose headline already says it (model-sign-49's checker): the screen says it once. */
  if (refused > 0 && !spent) facts.push(`${count(refused, 'ask')} this week ${refused === 1 ? 'was' : 'were'} turned away because the month's asks were spent.`);
  /* THE NEWEST DEAD JOB'S SENTENCE IS THE READING'S OWN LAST WORDS (below), so the facts carry the next one, not it twice. */
  facts.push(...deadSaid.slice(1, 3), ...other);

  const red =
    (newest !== undefined && !answered(newest)) ||
    (asks.length >= MODEL_ASKS_LEAST && yes * 10 < asks.length * MODEL_ANSWERED_TENTHS) ||
    dead.length > 0 ||
    (dayAsks.length > 0 && !dayAsks.some(answered)) ||
    spent;
  if (!red) {
    const said = no === 0 ? `The model answered all ${count(asks.length, 'ask')} this week.` : `The model answered ${yes} of ${count(asks.length, 'ask')} this week.`;
    return { state: 'green', value: yes, said, facts: facts.slice(0, 6) };
  }
  const head = spent
    ? `${spentSaid} They come back on ${backSaid}.`
    : asks.length === 0
      ? `${dead.length === 1 ? 'A model job' : `${dead.length} model jobs`} stopped after every retry.`
      : no === 0
        ? `The model answered ${yes} of ${count(asks.length, 'ask')} this week, but ${dead.length === 1 ? 'a model job' : `${dead.length} model jobs`} stopped after every retry.`
        : `The model did not answer ${no} of ${count(asks.length, 'ask')} this week.`;
  /* WHICH KIND OF ASK, AND SINCE WHEN (`kindsMissed`), each sentence only where the reading has room for it beside the
     dead job's sentence below, which is never the one cut. */
  const room = READ_MOST - (deadSaid[0] === undefined ? 0 : deadSaid[0].length + 1);
  const told = spent || no === 0 ? head : kindsMissed(asks, tz).reduce((said, kind) => (`${said} ${kind}`.length <= room ? `${said} ${kind}` : said), head);
  /* THE NEWEST DEAD MODEL JOB'S OWN SENTENCE, which says what was not done and when it is tried again. Never its error. */
  const said = deadSaid[0] === undefined ? told : `${told} ${deadSaid[0]}`;
  return { state: 'red', value: yes, said: said.slice(0, READ_MOST), facts: facts.slice(0, 6) };
}

/**
 * File today's `model-answers` through the kernel's `signRead`. The host calls this once a night beside the record's
 * own signs (the Worker's alarm and the self-host's poll), and a later filing the same day replaces the earlier one.
 */
export function fileModelSign(kernel: ModelSignKernel, sql: Sql, nowMs: number, more: ModelSignMore = {}): Result<{ sign: string; day: string }> {
  return kernel.signRead('model-answers', readModelSign(kernel, sql, nowMs, more));
}
