/**
 * When a scheduled action runs next: counted from its slot, and on a wall clock when it names one (`loop/finish/shell.md`
 * DOR-5).
 *
 * THE SLOT AND THE DUE INSTANT ARE TWO NUMBERS. The slot is where the schedule says a run belongs, and the due instant is
 * the slot plus the action's jitter. Counting the next run from the instant the alarm happened to ring adds every late
 * alarm to the schedule for good, so an hourly action drifts off its hour within a day; counting from the slot does not.
 * The slot is kept in the schedule row's payload (`fireAction`, and `finishPull` for a paged pull), because a due
 * instant can move for reasons that are not the schedule's: a month the plan held, a resume.
 *
 * `at:` RE-ANCHORS RATHER THAN ADDING. With `at: '07:00'` the interval is whole days, and adding it keeps the wall clock
 * except across a change of the zone's offset, where it slips by an hour and stays slipped. Re-reading the declared time
 * on the day each slot lands on puts it back, which is what `@braindog/connect`'s `nextDue` does for a paged pull.
 *
 * ONLY `clock.ts` IS IMPORTED, so `pull.ts`, which `actions.ts` imports, can import this file without a cycle.
 */

import { nextCalendar, timeOf } from './clock.ts';

const DAY_MS = 86_400_000;

/**
 * How many intervals one answer steps forward on the wall clock before it gives up counting and takes the clock's next
 * reading. A drain a few days late to a daily action settles inside it; the ceiling is what a loop over a stranger's
 * clock is held to.
 */
const ANCHOR_PASSES_MOST = 4;

/** An action's own clock: the time of day it runs at, when it names one, and the zone that time is read in. */
export type ActionClock = { at: { hh: number; mm: number } | null; tz: string };

/**
 * The clock an action declares, with the record's zone where it names none.
 *
 * A ZONE THIS RUNTIME CANNOT READ IS THE RECORD'S, and a record's own that it cannot read is UTC, as `armDerived` treats
 * one. The declaration check refuses an unreadable zone at install (`declare.ts`), so this is a zone the runtime lost
 * since, and a run at another wall clock is nearer what was asked than a `RangeError` out of the drain.
 */
export function clockOf(decl: { at?: unknown; tz?: unknown }, recordTz: string): ActionClock {
  const tz = typeof decl.tz === 'string' && decl.tz !== '' && isZone(decl.tz) ? decl.tz : isZone(recordTz) ? recordTz : 'UTC';
  return { at: timeOf(decl.at), tz };
}

/** Whether `Intl` can read a zone name. */
export function isZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The first instant after `fromMs` that the wall clock in `tz` reads `hh:mm`.
 *
 * THROUGH `nextCalendar`, as `digest.ts`'s `wallInstant` is, because `clock.ts` keeps the one reading of a wall time in
 * a zone and does not export it. A yearly clock pinned to a date and asked from two days before can only land on that
 * date. The four dates tried are the UTC dates from the day before `fromMs` to two days after, which covers every local
 * date a zone within fourteen hours of UTC can be on, and the earliest answer after `fromMs` wins.
 */
export function wallAfter(time: { hh: number; mm: number }, fromMs: number, tz: string): number {
  let best: number | null = null;
  for (let step = -1; step <= 2; step++) {
    const day = new Date(fromMs + step * DAY_MS);
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth();
    const date = day.getUTCDate();
    const at = nextCalendar({ months: 12, month, day: date, ...time }, Date.UTC(year, month, date) - 2 * DAY_MS, tz);
    if (at !== null && at > fromMs && (best === null || at < best)) best = at;
  }
  /* NONE IS ONLY A ZONE `Intl` READS AS NO WALL AT ALL. A day after is a run, and a run is what was asked for. */
  return best ?? fromMs + DAY_MS;
}

/**
 * The slot after `slotMs`, strictly after `nowMs`: the one the next run belongs to.
 *
 * SLOTS THAT WENT BY ARE SKIPPED, NOT RUN. A drain that comes three hours late to an hourly action runs it once and
 * arms the next hour, because three runs back to back ask a provider for the same answer three times.
 *
 * WITH `at`, EACH SLOT IS READ BACK ONTO THE WALL CLOCK. A slot on the clock steps one interval and takes the `hh:mm`
 * after half a day short of it, so the slot a day ahead of 07:00 lands on 07:00 whether that day is 23, 24 or 25 hours
 * long. A slot off the clock (an action armed at the moment it was installed, or one whose `at` was added since) goes to
 * the clock's next reading after it, and is on the clock from then on.
 */
export function nextSlotMs(o: { slotMs: number; nowMs: number; everyMs: number; clock: ActionClock }): number {
  const { slotMs, nowMs, everyMs, clock } = o;
  if (clock.at === null) {
    let next = slotMs + everyMs;
    if (next <= nowMs) next += Math.ceil((nowMs - next + 1) / everyMs) * everyMs;
    return next;
  }
  const onClock = wallAfter(clock.at, slotMs - 1, clock.tz) === slotMs;
  let next = onClock ? wallAfter(clock.at, slotMs + everyMs - DAY_MS / 2, clock.tz) : wallAfter(clock.at, slotMs, clock.tz);
  for (let pass = 0; pass < ANCHOR_PASSES_MOST && next <= nowMs; pass++) next = wallAfter(clock.at, next + everyMs - DAY_MS / 2, clock.tz);
  /* STILL BEHIND AFTER THE PASSES is a drain weeks late. The clock's next reading is a run on the clock, which is what
     was asked; the count of intervals starts again from it. */
  return next > nowMs ? next : wallAfter(clock.at, nowMs, clock.tz);
}

/**
 * When an action armed now first runs: now, or the next time its wall clock reads its `at`.
 *
 * FOR THE ARMING (`armDerived` in `index.ts`). An action that says `at: '07:00'` and runs the moment it is installed has
 * run at a time its declaration did not name. The answer carries no jitter, because the first fire reads the instant it
 * was armed for as its slot.
 */
export function firstSlotMs(decl: { at?: unknown; tz?: unknown }, recordTz: string, nowMs: number): number {
  const clock = clockOf(decl, recordTz);
  return clock.at === null ? nowMs : wallAfter(clock.at, nowMs, clock.tz);
}
