/**
 * Answers a screen opted to keep (`read(key, fn, { kept })`), for the tab, by the record's version.
 *
 * A VISIT AT THE SAME VERSION ASKS NOTHING. Work's list is about half a megabyte on a lived-in record, and it was
 * fetched again on every visit, five times over nine screens. Kept, the screen draws the
 * answer at once; at a moved version it draws the kept answer and asks again quietly, so it still lands true.
 *
 * WHAT IS NEVER KEPT: a refusal, an answer older than `KEPT_MS`, and one from before the reader's midnight, because a
 * figure that says "late" or "today" changes with the clock and not the version. `forgetKept` drops every one on a
 * record switch and a sign-out, where the app's `forget` runs.
 */

import type { Result } from './read.ts';

/** How long a kept answer may be drawn without asking again. */
export const KEPT_MS = 300_000;
/** The most answers kept at once; past it the oldest is dropped. */
export const KEPT_MOST = 24;

type Kept = { version: number | null; at: number; got: Result<unknown> };
const answers = new Map<string, Kept>();

const sameDay = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * The kept answer for `name` and `key`, and whether it is still true: `fresh` when it was kept at this version, within
 * `KEPT_MS` and today; `null` when there is none to draw at all.
 */
export function keptAnswer<T>(name: string, key: string, version: number | null, now: number = Date.now()): { got: Result<T>; fresh: boolean } | null {
  const was = answers.get(`${name} ${key}`);
  if (was === undefined || now < was.at || now - was.at >= KEPT_MS || !sameDay(was.at, now)) return null;
  return { got: was.got as Result<T>, fresh: was.version === version };
}

/** Keep an answer as true at `version`. A refusal is not kept, and drops what was. */
export function keep(name: string, key: string, version: number | null, got: Result<unknown>, now: number = Date.now()): void {
  const at = `${name} ${key}`;
  answers.delete(at);
  if (!got.ok) return;
  answers.set(at, { version, at: now, got });
  if (answers.size > KEPT_MOST) answers.delete(answers.keys().next().value!);
}

/** Drop every kept answer. */
export function forgetKept(): void {
  answers.clear();
}
