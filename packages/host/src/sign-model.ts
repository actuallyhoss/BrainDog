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
 * WHAT COUNTS. A row that called a model (`model <> '-'`, the rule `call.ts` meters by). A hold still in flight
 * (`SLASH_PENDING`) is neither answered nor failed. An answer the engine's own checks refused (`refused`) was an answer:
 * the model spoke. `error` is a call that came back with nothing usable.
 *
 * THE WORDS ARE THE PROVIDER'S, SCRUBBED. The sentence quotes the newest dead model job's kept error, or the words the host
 * kept of its last failure (`lastFail`), with keys, addresses, links, model ids, hosts and paths taken out. A code is
 * never quoted: it is not a sentence.
 */

import type { SignReading } from '@braindog/kernel';
import type { Result, Sql } from '@braindog/ports';

import { scrubbed } from './understand.ts';

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
/** How much of the provider's words a reading quotes. */
const WORDS_MOST = 140;

/** The one code a hold in flight carries (`packages/slash/src/call.ts` `reserve`). */
const PENDING = 'SLASH_PENDING';

/** A fault as the kernel's `faults()` answers one (`packages/kernel/src/fault.ts`), read structurally. */
export type ModelFault = { kind: string; said: string; last_at: string; error: string };

/** What this needs of the kernel: the verb that files, and where the record has it, the open faults. */
export type ModelSignKernel = {
  signRead: (id: string, reading: SignReading) => Result<{ sign: string; day: string }>;
  faults?: () => Result<{ faults: readonly ModelFault[] }>;
  identity?: () => { tz?: string | null } | null | undefined;
};

/** The provider's words the host kept of its newest failure, where it keeps any (the Worker's `onFail`). */
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
 * The provider's words as a person may read them, or `null`. Keys, addresses and links go (`scrubbed`); then a model's
 * id (`'@cf/meta/llama-3.1-8b'`, `gpt-4o-mini`), a host name, a path and a long id each go, since a reading names
 * things and never ids.
 */
export function wordsOf(raw: string): string | null {
  /* A KEY BY ITS SHAPE FIRST, as the Worker's `scrubRaw` cuts one: a bearer, the prefixes providers mint, a named key's
     value and a long run of key characters. Then the record's own check on what is left (`scrubbed`). */
  /* A PROVIDER THAT ANSWERS IN JSON says its sentence in a `message`: that is the words, not the braces around it. */
  const said = /"message"\s*:\s*"((?:[^"\\]|\\.){3,})"/u.exec(raw)?.[1] ?? raw;
  const cut = said
    .replace(/\b(bearer|basic)\s+\S+/giu, '')
    .replace(/\b(?:sk|pk|rk)[-_][\w-]{6,}|\b(?:ghp|gho|ghu|ghs|ghr|github_pat|glpat|xox[abprse]|cfut|cfat|AIza)[\w-]{6,}|\b(?:AKIA|ASIA)[A-Z0-9]{12,}/gu, '')
    .replace(/(["']?)\b[\w-]*(?:key|token|secret|password|authorization)[\w-]*\1\s*[:=]\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^\s,;})&]+)/giu, '')
    .replace(/[A-Za-z0-9_\-+/=]{32,}/gu, '')
    .replace(/\(\s*\)|\[\s*\]/gu, '');
  const first = scrubbed(cut, 400);
  if (first === null) return null;
  const plain = first
    .replace(/\[link\]/gu, 'the provider')
    .replace(/(["'`])[\w.-]*[/@:][\w./@:-]*\1/gu, 'the model')
    .replace(/@[\w-]+\/[\w./:-]+/gu, 'the model')
    .replace(/\b(?:gpt|claude|llama|mistral|gemma|qwen|deepseek)[\w.:-]*/giu, 'the model')
    .replace(/(?:\/[\w.-]+){2,}/gu, '')
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|ai|dev|app|dog|cloud|workers)\b/giu, 'the provider')
    .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/gu, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu, '')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b|\[[0-9a-f:]+\](?::\d+)?/giu, 'the provider')
    .replace(/\b[\w-]+#\d+\b/gu, '')
    .replace(/\(\s*(?:request|trace|ref)?\s*(?:id)?\s*[:=]?\s*\)|\[\s*\]/giu, '')
    .replace(/—/gu, ',')
    .replace(/\s+([,.:;])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  if (plain === '' || /^[\W_]*$/u.test(plain)) return null;
  return plain.length > WORDS_MOST ? `${plain.slice(0, WORDS_MOST - 1).trimEnd()}…` : plain;
}

/** One ask of the week as the sign reads it. */
type Ask = { ts: string; status: string };

/** The asks of the window that called a model and are not in flight, newest first. `[]` where Slash never ran. */
function asksOf(sql: Sql, sinceMs: number): Ask[] {
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'") === undefined) return [];
  return sql.all<Ask>(
    "SELECT ts, status FROM slash_call WHERE model <> '-' AND (code IS NULL OR code <> ?) AND ts >= ? ORDER BY ts DESC, rowid DESC",
    PENDING,
    new Date(sinceMs).toISOString(),
  );
}

/** The record's open model faults (`infer.*`), newest first. None where the kernel has no `faults()`. */
function deadJobsOf(kernel: ModelSignKernel): ModelFault[] {
  if (typeof kernel.faults !== 'function') return [];
  const got = kernel.faults();
  if (!got.ok) return [];
  return got.value.faults.filter((f) => f.kind.startsWith('infer.')).sort((a, b) => b.last_at.localeCompare(a.last_at));
}

const answered = (a: Ask): boolean => a.status !== 'error';

/**
 * Read the week's asks and the dead model jobs, and judge them by 2.2's rule. Pure over its inputs, so a test reads the
 * same reading the night files.
 */
export function readModelSign(kernel: ModelSignKernel, sql: Sql, nowMs: number, more: ModelSignMore = {}): SignReading {
  const tz = (typeof kernel.identity === 'function' ? kernel.identity()?.tz : null) || 'UTC';
  const since = nowMs - MODEL_WINDOW_DAYS * DAY;
  const asks = asksOf(sql, since);
  const dead = deadJobsOf(kernel).filter((f) => Date.parse(f.last_at) >= since || f.last_at === '');
  if (asks.length === 0 && dead.length === 0) return { state: 'none', value: null, said: 'No one asked the model anything this week.', facts: [] };

  const yes = asks.filter(answered).length;
  const no = asks.length - yes;
  const newest = asks[0];
  const dayAsks = asks.filter((a) => Date.parse(a.ts) >= nowMs - MODEL_DAY_MS);
  const lastOk = asks.find(answered);

  const facts: string[] = [];
  if (asks.length > 0) facts.push(`${count(asks.length, 'ask')} this week, ${yes} answered.`);
  if (lastOk !== undefined) facts.push(`The model last answered on ${dateSaid(Date.parse(lastOk.ts), tz)}.`);
  else if (asks.length > 0) facts.push('The model has not answered once this week.');
  for (const f of dead.slice(0, 2)) facts.push(f.said.slice(0, 200));

  /* THE WORDS: the newest dead job's, else the host's last failure inside the window. */
  const kept = dead.map((f) => f.error).find((e) => e !== '') ?? (more.lastFail && more.lastFail.at >= since ? more.lastFail.raw : '');
  const words = kept === '' ? null : wordsOf(kept);
  const last = words === null ? 'The provider gave no reason that could be kept.' : `The last error: ${words}${/[.!?…]$/u.test(words) ? '' : '.'}`;

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
  return { state: 'red', value: yes, said: `${head} ${last}`.slice(0, 280), facts: facts.slice(0, 6) };
}

/**
 * File today's `model-answers` through the kernel's `signRead`. The host calls this once a night beside the record's
 * own signs (the Worker's alarm and the self-host's poll), and a later filing the same day replaces the earlier one.
 */
export function fileModelSign(kernel: ModelSignKernel, sql: Sql, nowMs: number, more: ModelSignMore = {}): Result<{ sign: string; day: string }> {
  return kernel.signRead('model-answers', readModelSign(kernel, sql, nowMs, more));
}
