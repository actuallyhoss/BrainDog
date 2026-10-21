/**
 * Run now on a scheduled action: the press, and the one line under the row after it.
 *
 * THE RECORD'S `actionRun({ ingest })`, POSTED AS `actions.ts` POSTS `resumeAction`: same origin, the browser's own
 * cookie, `no-store`, and an answer that is not the record's envelope read as no record. The press makes no request to
 * the action's host; the record moves the action's next turn to now and wakes its clock, and the line says so.
 *
 * FOUR ANSWERS, EACH ITS OWN LINE.
 *
 *   · `{ ingest, due_at }`: it runs in a moment.
 *   · A paused or held action: the record's own sentence, word for word. It knows why it will not run; this file does not.
 *   · `RATE_LIMITED` with `retry_after`, which the door answers as 429 and `Retry-After`: the wait in words, never a
 *     bare count of seconds past ninety.
 *   · A record without the method, nobody signed in, nobody reached: the sentence for each, never the code.
 *
 * NOT THROUGH `@braindog/client`, for `actions.ts`'s reason: the client refuses a method missing from its route table
 * before it sends anything, and a host a release behind is a sentence here, not a thrown call.
 *
 * PURE, so `node --test` imports it; the tab holds the state.
 */

import type { Answer, Fetch, Refusal } from '../../lib/record/actions.ts';
import { wroteOutside } from '@braindog/client';

/** What `actionRun` answers when the action will run. `said` is the record's sentence when it answers one beside it. */
export type Ran = { ingest: string; due_at: string; said?: string };

/** A refusal as the door may send it: the registry's shape, with the wait the rate limit names. */
export type RunRefusal = Refusal & { retry_after?: number };

export type RunAnswer = { ok: true; value: Ran } | { ok: false; refusal: RunRefusal };

const isEnvelope = (v: unknown): v is Answer<unknown> =>
  typeof v === 'object' && v !== null && 'ok' in v && ((v as { ok: unknown }).ok === true ? 'value' in v : 'refusal' in v);

const refused = (code: string, fix: string): RunAnswer => ({ ok: false, refusal: { code, fix } });

/** Whole seconds from a `Retry-After` header, which is seconds or an HTTP date. `undefined` when it says neither. */
function retryHeader(value: string | null, now: number): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.ceil(n));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : undefined;
}

/**
 * Press Run now on one action. `base` is the record's API base, as `apiBase()` gives it.
 *
 * THE 429'S WAIT IS READ FROM THE ENVELOPE FIRST and from `Retry-After` when the envelope has none, so a proxy that
 * answers the limit with its own body still says how long.
 */
export async function runNow(base: string, ingest: string, io: Fetch = (url, init) => fetch(url, init), now: number = Date.now()): Promise<RunAnswer> {
  let res: Response;
  try {
    res = await io(`${base}/api/actionRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ ingest }),
    });
  } catch {
    return refused('UNREACHABLE', runWords.unreached);
  }
  /* A RUN WRITES WHAT IT DOES: the reads the client kept go (`wroteOutside`). */
  wroteOutside();
  if (res.status === 401) {
    await res.body?.cancel().catch(() => undefined);
    return refused('UNAUTHORIZED', runWords.signIn);
  }
  const said: unknown = await res.json().catch(() => undefined);
  if (res.status === 429) {
    const body = isEnvelope(said) && !said.ok ? (said.refusal as RunRefusal) : { code: 'RATE_LIMITED', fix: '' };
    const wait = typeof body.retry_after === 'number' ? body.retry_after : retryHeader(res.headers.get('retry-after'), now);
    return { ok: false, refusal: { ...body, code: 'RATE_LIMITED', ...(wait === undefined ? {} : { retry_after: wait }) } };
  }
  /* A 404 WITH NO ENVELOPE IS A HOST WITHOUT THE ROUTE, as a static host's own page is; with one it is the record's. */
  if (!isEnvelope(said)) return res.status === 404 ? refused('ROUTE_UNKNOWN', '') : refused('UNREACHABLE', runWords.unreached);
  return said as RunAnswer;
}

/* ── the line ───────────────────────────────────────────────────────────── */

export const runWords = {
  press: 'Run now',
  soon: 'Runs in a moment.',
  later: (wait: string) => `Runs in ${wait}.`,
  /* A WAIT OF A MINUTE OR LESS IS THE ACTION'S OWN: it was pressed a moment ago. A longer one is the record's
     allowance for the hour, and "a moment ago" would be wrong about which press it was. */
  again: (wait: string) => `Pressed a moment ago. Try again in ${wait}.`,
  allowance: (wait: string) => `Run now has been pressed as often as this hour allows. Try again in ${wait}.`,
  againSoon: 'Pressed a moment ago. Try again in a minute.',
  /* THE SHARED "nothing was saved" IS ABOUT A WRITE, and a press saves nothing a person typed. */
  unreached: 'The record could not be reached, so it did not run. Try again in a moment.',
  signIn: 'Sign in again to run it now.',
  older: 'This record cannot run an action early yet. It runs on its own clock.',
  /* THE RECORD SENT A REFUSAL WITH NO SENTENCE IN IT. Said plainly rather than left blank under the button. */
  refusedQuietly: 'The record did not run it, and did not say why.',
  aria: (name: string) => `Run ${name} now`,
} as const;

/* EVERY UNIT HERE TAKES AN S FOR MORE THAN ONE, so the word is written once. */
const count = (n: number, unit: string): string => `${String(n)} ${unit}${n === 1 ? '' : 's'}`;

/**
 * A wait in words. Up to ninety seconds in seconds; past that in whole minutes, rounded up so the person never tries
 * a moment early; past ninety minutes in hours.
 */
export function waitWords(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s <= 90) return count(s, 'second');
  const m = Math.ceil(s / 60);
  if (m <= 90) return count(m, 'minute');
  return count(Math.ceil(m / 60), 'hour');
}

/** How long past now a run may be due and still be "in a moment": the clock's own wake is not instant. */
const MOMENT_MS = 2 * 60 * 1000;

/** The record's codes that mean this build has no Run now, said as one sentence. */
const OLDER: ReadonlySet<string> = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);

export type RunSaid = { line: string; ran: boolean };

/** The line under a row after its press. `now` is this browser's clock, for a run due later than a moment. */
export function runNowSaid(answer: RunAnswer, now: number): RunSaid {
  if (answer.ok) {
    const v = answer.value;
    /* A SENTENCE THE RECORD SENT BESIDE THE TURN IS ITS OWN, and it wins: it knows what the press did. */
    if (typeof v.said === 'string' && v.said.trim() !== '') return { line: v.said.trim(), ran: true };
    const due = Date.parse(v.due_at);
    if (!Number.isFinite(due) || due - now <= MOMENT_MS) return { line: runWords.soon, ran: true };
    return { line: runWords.later(waitWords((due - now) / 1000)), ran: true };
  }
  const r = answer.refusal;
  if (r.code === 'RATE_LIMITED') {
    const wait = r.retry_after;
    if (typeof wait !== 'number' || !Number.isFinite(wait)) return { line: runWords.againSoon, ran: false };
    return { line: wait <= 60 ? runWords.again(waitWords(wait)) : runWords.allowance(waitWords(wait)), ran: false };
  }
  if (OLDER.has(r.code)) return { line: runWords.older, ran: false };
  /* PAUSED, HELD, NOT SIGNED IN, NOT REACHED: the sentence the record, or the wire, already wrote. */
  const fix = typeof r.fix === 'string' ? r.fix.trim() : '';
  return { line: fix === '' ? runWords.refusedQuietly : fix, ran: false };
}
