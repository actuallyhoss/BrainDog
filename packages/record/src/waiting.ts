/**
 * WHAT WAITS ON A PERSON, COUNTED ONCE: the questions open for them, how many of those are late and how many are hard
 * to undo, the arrivals waiting in the inbox, and the agents working now.
 *
 * THREE COUNTS DISAGREED ON ONE SCREEN. On the owner's record on 7 October Today's header said "Nothing needs you",
 * the rail's badge said 25, Decide's sentence said 25 and the Agents header said 4 working beside runs last heard from
 * hours before (`loop/research-direction-audit.md`, "How good is the experience on screen"). Each was worked out in
 * its own place: the badge from `boot`'s count, Decide's sentence from the queue it drew, Home's line from the blocks
 * its page happened to hold, and "late" written as fourteen days in the kernel and again in the web. So `boot`, Home's
 * line and the queue's counts all read this one answer, and a header that says a number about questions, arrivals or
 * agents is held to it (`headlineAgrees` in `headlines.ts`).
 *
 * PURE: the record hands it what the reader may see (`WaitingReader`), so the rule is the same for the owner, a member
 * held to some lists and the record's own nightly look, and a test reads it without a database.
 *
 * WORKING IS ONE CLOCK, THE KERNEL'S: a run is working while it is `active` and not `isQuiet` (`QUIET_MS` in
 * `@braindog/kernel`). No time of its own is written here.
 */

import { costOf, isQuiet, type Json } from '@braindog/kernel';

/**
 * How many days a question waits before it is late: two weeks.
 *
 * THE KERNEL'S `STALE_DAYS` (`packages/kernel/src/pages.ts`), which its queue counts `stale` by. The kernel's index does
 * not export it yet, so it is said here once for the record and the app (`boot` sends it as `lateDays`), and
 * `waiting-counts.test.ts` holds the two to one answer against the kernel's own queue count. When the kernel exports
 * it, this line imports it.
 */
export const LATE_DAYS = 14;

const DAY_MS = 86_400_000;

/** What waits on a person, as `boot` sends it (`waits`) and Home's line and the queue's counts read it. */
export type WaitingNow = {
  /** Questions open for this reader: not answered, and not put off past now. */
  questions: number;
  /** Of those, how many have waited past `LATE_DAYS`. */
  late: number;
  /** Of those, how many are hard to undo (the kernel's `undo` band, `costOf`). */
  hard: number;
  /** Arrivals waiting in the inbox, or `null` for a reader who is not told how many (`counts.inbox`'s rule). */
  inbox: number | null;
  /** Agents working now: runs `active` and not `isQuiet`. */
  working: number;
};

/** One open question as the reader is handed it: when it was opened, and what kind of change it proposes. */
export type WaitingQuestion = { opened_at: string; body_kind: string; body: unknown };

/** One run as the reader is handed it: its state and its fields, with when its row last changed. */
export type WaitingRun = { state?: string | null; fields: Record<string, Json>; updated_at: string };

/**
 * What `waiting` reads: the questions this reader may see, the inbox count they are told, and the open runs they may
 * read (none for a reader who may not read runs). `nowMs` is the record's clock.
 */
export type WaitingReader = {
  nowMs: number;
  questions: readonly WaitingQuestion[];
  inbox: number | null;
  runs: readonly WaitingRun[];
  /**
   * The fields of a list the history withholds (the kernel's `costRows`), so a question that patches one counts as
   * hard to undo here as it does in the queue's own count. Left out, a body is weighed alone.
   */
  withheld?: (register: string) => readonly string[];
};

/** Whether a question opened at `at` has waited past `LATE_DAYS` by `nowMs`. An instant that cannot be read has not. */
export function lateAt(at: string, nowMs: number): boolean {
  const ms = Date.parse(at);
  return Number.isFinite(ms) && nowMs - ms > LATE_DAYS * DAY_MS;
}

/**
 * Where a run stands for a person, worked out when it is read and never stored.
 *
 * `working`: active and heard from inside the kernel's quiet mark. `quiet`: open (active or idle) and not working.
 * `left`: handed on (`handoff`). `ended`: done. `stopped`: abandoned. `before`: open and never heard from here, which is
 * a run an import wrote rather than one an agent ran.
 */
export type Presence = 'working' | 'quiet' | 'left' | 'ended' | 'stopped' | 'before';

/** A run's state, from its column, or from its fields for a reader handed the fields alone. */
const stateOf = (run: WaitingRun): string => run.state ?? (typeof run.fields.state === 'string' ? run.fields.state : '');

/** Where one run stands at `nowMs` (`Presence`). */
export function presenceOf(run: WaitingRun, nowMs: number): Presence {
  const state = stateOf(run);
  if (state === 'handoff') return 'left';
  if (state === 'done') return 'ended';
  if (state === 'abandoned') return 'stopped';
  if (typeof run.fields.last_seen !== 'string') return 'before';
  return state === 'active' && !isQuiet(run, nowMs) ? 'working' : 'quiet';
}

/** Whether a run is working now: the one clock (`presenceOf`). */
export const isWorking = (run: WaitingRun, nowMs: number): boolean => presenceOf(run, nowMs) === 'working';

/** What waits on the reader `r` describes. */
export function waiting(r: WaitingReader): WaitingNow {
  let late = 0;
  let hard = 0;
  for (const q of r.questions) {
    if (lateAt(q.opened_at, r.nowMs)) late++;
    if (costOf(q.body_kind, q.body, r.withheld === undefined ? undefined : { withheld: r.withheld }) === 'undo') hard++;
  }
  return {
    questions: r.questions.length,
    late,
    hard,
    inbox: r.inbox,
    working: r.runs.filter((run) => isWorking(run, r.nowMs)).length,
  };
}

/**
 * Whether a page may say that nothing needs the reader: only when no question waits and nothing waits in the inbox. An
 * inbox the reader is not told about (`null`) says nothing either way, so it does not stop the calm line.
 */
export const nothingWaits = (w: Pick<WaitingNow, 'questions' | 'inbox'>): boolean => w.questions === 0 && (w.inbox ?? 0) === 0;
