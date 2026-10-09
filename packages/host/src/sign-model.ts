/**
 * The vital sign "The model answers" (`model-answers`, PRF-A05 job 1, `loop/scope/area-proof-a.md` 2.2), filed by the
 * host once a night through the kernel's one verb for it, `signRead`.
 *
 * WHY THE HOST FILES IT. The kernel cannot see a model call: every ask is written to Slash's own ledger, `slash_call`
 * (`slash-ask.ts` `read` and `background`, and the engine's own rows), which lives in the host's storage. And the model
 * jobs that died on the retry ladder are the kernel's faults (`fault.ts`), which this reads through the kernel's
 * `faults()` where the record has it. On his record no model composed a page on the Cloud for days and nothing said so
 * (D40.24: "whether a model answered").
 *
 * THE RULE, 2.2's: over 7 days, red when the newest ask failed, when fewer than 9 in 10 of 5 or more were answered, when
 * a model job is dead, or when the last day held asks and none was answered. `none` when there was no ask in the week
 * and no model job is dead: a record nobody asked is not a green one.
 *
 * WHAT COUNTS, AND IT IS SETTINGS' COUNT. A row is an ask when Slash's own health reads it as an answer or a failure
 * (`packages/slash/src/health.ts`, `LEDGER_ANSWERED` and `LEDGER_FAILED`), and nothing else is: a hold still in flight, a
 * month's asks spent, a build without the model and a call that needed none say nothing about the model. Before this the
 * sign counted every `error` as a failure, so at his 600-ask cap the night's budget refusals read red here while
 * Settings read "answered an hour ago" over the same ledger. An answer the engine's own checks refused, or one that broke
 * its schema, was still the model speaking.
 *
 * NO PROVIDER'S WORDS, ONLY THE FAULT'S OWN SENTENCE. A dead job's kept error and the host's last failure can carry a
 * provider's words about a key, which is why `faults` (`packages/record/src/methods/faults.ts`) holds the error back
 * from everybody but a self-host's owner, and a sign is read by anyone who reads signs. So the reading quotes the
 * fault's fixed `said`, a plain sentence from the kernel's table (`fault.ts` `SAID`), and the operator reads the
 * provider's words in the Worker's log line, where they always were.
 *
 * AND THE OTHER WORK THAT STOPPED. A dead job that is not a model's (a notification, a pull, a copy, a script) does not
 * turn this sign red, since it is not the model, but it is said in the facts in its own sentence, because no other sign
 * reads faults and a fault nobody reads is the dead job disappearing.
 */

import type { SignReading } from '@braindog/kernel';
import type { Result, Sql } from '@braindog/ports';

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

/* ── the ledger's two clauses, Slash's own ───────────────────────────────────────────────────────────────────────────── */

/**
 * `LEDGER_FAILED` and `LEDGER_ANSWERED` of `packages/slash/src/health.ts`, RESTATED BECAUSE THIS PACKAGE MAY NOT IMPORT
 * THAT ONE (`46 §5.1`, and `graph` refuses a relative import across the line). The definition is Slash's; these two
 * strings are held equal to it, character for character, by `test/sign-model.test.ts`, so a change there goes red here.
 */
export const LEDGER_FAILED = "status = 'error' AND code IN ('UNREACHABLE', 'PULL_REQUEST_REFUSED', 'ANSWER_UNREADABLE')";
export const LEDGER_ANSWERED =
  "model <> '-' AND NOT (" +
  LEDGER_FAILED +
  ") AND (code IS NULL OR code NOT IN ('SLASH_PENDING', 'SPARK_PENDING', 'SLASH_BUDGET_SPENT', 'SPARK_BUDGET_SPENT', 'NOT_IN_THIS_BUILD'))";

/** A fault as the kernel's `faults()` answers one (`packages/kernel/src/fault.ts`), read structurally. Its `error` is never read. */
export type ModelFault = { kind: string; said: string; last_at: string };

/** What this needs of the kernel: the verb that files, and where the record has it, the open faults. */
export type ModelSignKernel = {
  signRead: (id: string, reading: SignReading) => Result<{ sign: string; day: string }>;
  faults?: () => Result<{ faults: readonly ModelFault[] }>;
  identity?: () => { tz?: string | null } | null | undefined;
};

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

/** One ask of the week as the sign reads it: `ok` is 1 where Slash's health reads an answer. */
type Ask = { ts: string; ok: number };

/** The asks of the window, Slash's health's way, newest first. `[]` where Slash never ran. */
function asksOf(sql: Sql, sinceMs: number): Ask[] {
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'") === undefined) return [];
  return sql.all<Ask>(
    `SELECT ts, CASE WHEN ${LEDGER_ANSWERED} THEN 1 ELSE 0 END AS ok FROM slash_call
     WHERE ts >= ? AND ((${LEDGER_ANSWERED}) OR (${LEDGER_FAILED})) ORDER BY ts DESC, rowid DESC`,
    new Date(sinceMs).toISOString(),
  );
}

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
  const asks = asksOf(sql, since);
  const faults = faultsOf(kernel);
  const dead = faults.model.filter((f) => Date.parse(f.last_at) >= since || f.last_at === '');
  /* THE OTHER WORK, OPEN AS LONG AS ITS FAULT IS: a dead copy or notification is still dead after the week. */
  const other = sentences(faults.other).slice(0, OTHER_MOST);
  if (asks.length === 0 && dead.length === 0) return { state: 'none', value: null, said: 'No one asked the model anything this week.', facts: other };

  const yes = asks.filter(answered).length;
  const no = asks.length - yes;
  const newest = asks[0];
  const dayAsks = asks.filter((a) => Date.parse(a.ts) >= nowMs - MODEL_DAY_MS);
  const lastOk = asks.find(answered);
  const deadSaid = sentences(dead);

  const facts: string[] = [];
  if (asks.length > 0) facts.push(`${count(asks.length, 'ask')} this week, ${yes} answered.`);
  if (lastOk !== undefined) facts.push(`The model last answered on ${dateSaid(Date.parse(lastOk.ts), tz)}.`);
  else if (asks.length > 0) facts.push('The model has not answered once this week.');
  /* THE NEWEST DEAD JOB'S SENTENCE IS THE READING'S OWN LAST WORDS (below), so the facts carry the next one, not it twice. */
  facts.push(...deadSaid.slice(1, 3), ...other);

  const red =
    (newest !== undefined && !answered(newest)) ||
    (asks.length >= MODEL_ASKS_LEAST && yes * 10 < asks.length * MODEL_ANSWERED_TENTHS) ||
    dead.length > 0 ||
    (dayAsks.length > 0 && !dayAsks.some(answered));
  if (!red) {
    const said = no === 0 ? `The model answered all ${count(asks.length, 'ask')} this week.` : `The model answered ${yes} of ${count(asks.length, 'ask')} this week.`;
    return { state: 'green', value: yes, said, facts: facts.slice(0, 6) };
  }
  const head =
    asks.length === 0
      ? `${dead.length === 1 ? 'A model job' : `${dead.length} model jobs`} stopped after every retry.`
      : no === 0
        ? `The model answered ${yes} of ${count(asks.length, 'ask')} this week, but ${dead.length === 1 ? 'a model job' : `${dead.length} model jobs`} stopped after every retry.`
        : `The model did not answer ${no} of ${count(asks.length, 'ask')} this week.`;
  /* THE NEWEST DEAD MODEL JOB'S OWN SENTENCE, which says what was not done and when it is tried again. Never its error. */
  const said = deadSaid[0] === undefined ? head : `${head} ${deadSaid[0]}`;
  return { state: 'red', value: yes, said: said.slice(0, 280), facts: facts.slice(0, 6) };
}

/**
 * File today's `model-answers` through the kernel's `signRead`. The host calls this once a night beside the record's
 * own signs (the Worker's alarm and the self-host's poll), and a later filing the same day replaces the earlier one.
 */
export function fileModelSign(kernel: ModelSignKernel, sql: Sql, nowMs: number, more: ModelSignMore = {}): Result<{ sign: string; day: string }> {
  return kernel.signRead('model-answers', readModelSign(kernel, sql, nowMs, more));
}
