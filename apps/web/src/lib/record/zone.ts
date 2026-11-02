/**
 * THE RECORD'S ZONE AND ITS DAY, ONCE, for every screen that says "today", "late" or "tomorrow at".
 *
 * Each screen had its own: Work and Today read the browser's wall clock, a page's blocks and a forecast's opening read
 * the day in Greenwich (`toISOString().slice(0, 10)`), and a script's next run read the browser's hours. At half past
 * midnight in Cairo, three hours east of Greenwich, Work said a task due the day before was due today while Today called
 * it a day late. Now `boot` says the record's zone (`Boot.zone`), `layoutOf` keeps it here, and every day a screen
 * derives is `recordToday` of its clock, which is `dayIn` (`braindog-render`) in that zone. A record that never said one
 * (an older host, the sample) counts in the reader's own zone, as before.
 *
 * PURE AND NODE LOADS IT, so a test sets a zone and reads the day.
 */

import { dayIn, knowsZone, readerZone, timeIn } from 'braindog-render';

let zone: string | null = null;

/** The zone "today" is counted in: the record's, once its `boot` or a page said it, else the reader's own. */
export const recordZone = (): string => zone ?? readerZone();

/**
 * Keep the zone the record said, and answer the one now in force. Anything that is not a zone `Intl` reads is not kept,
 * so a host that sent nothing, or nonsense, leaves the reader's own zone in place.
 */
export function learnZone(said: unknown): string {
  /* THE ZONE ALREADY HELD IS NOT CHECKED AGAIN: a formatter made to test it cost about 10 ms of a cold phone's first draw. */
  if (said === zone && zone !== null) return zone;
  /* CHECKED BY THE FORMATTER `dayIn` KEEPS FOR IT (`knowsZone`), which the first "today" drawn then takes, and not by
     one made only to throw (speed6, 2 Nov). Anything else is not a zone: the one already held stays. */
  if (typeof said === 'string' && said !== '' && knowsZone(said)) zone = said;
  return recordZone();
}

/** Forget the zone, so the next record opened counts in its own and never in the last one's. */
export const forgetZone = (): void => {
  zone = null;
};

/** The record's day at an instant, `YYYY-MM-DD`: the one "today" every screen says. */
export const recordToday = (now: number = Date.now()): string => dayIn(now, recordZone());

/** The record's wall clock at an instant, `HH:MM`. */
export const recordTime = (at: number): string => timeIn(at, recordZone());

/** How far the record's wall is ahead of UTC at an instant, in milliseconds, to the minute. */
const aheadAt = (ms: number): number => {
  const z = recordZone();
  const wall = Date.parse(`${dayIn(ms, z)}T${timeIn(ms, z)}:00Z`);
  return wall - Math.floor(ms / 60_000) * 60_000;
};

/**
 * The instant the record's day at `now` began: its midnight, on its own wall. Read with the offset in force at that
 * midnight, so a night the clocks change is not an hour out.
 */
export function recordMidnight(now: number = Date.now()): number {
  const day = Date.parse(`${recordToday(now)}T00:00:00Z`);
  const guess = day - aheadAt(now);
  return day - aheadAt(guess);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A calendar day in full, as a sentence about one day carries it: `Wed 30 Sep`. The day is a date and has no zone to move it. */
export function weekdayDaySaid(day: string): string {
  const at = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}
