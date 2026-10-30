/**
 * An alarm step the runtime cut off twice in a row is held for a while, so one heavy step cannot reset the record's
 * object every hour.
 *
 * WHAT WAS SEEN, 29 AND 30 OCTOBER. The record's alarm runs its steps one after another (drain, act, ask, model, look,
 * lint, signs) and some of them ran 20 to 75 seconds with 35 seconds of CPU. Past that the platform resets the object:
 * "Durable Object storage operation exceeded timeout which caused object to be reset", the alarm ends `exceededWallTime`,
 * and every call waiting on the object fails with it. A step that never finished is due again at the next alarm, so it
 * ran again and was cut again: 07:00, 08:00, 09:00 and 09:09 on 29 October, four resets in a row, and the one at 09:00
 * took a bank text with it (`held.ts`). On 30 October at 13:48 a script's call into the record in `act` did the same.
 *
 * SO THE CUT IS COUNTED. `#cutOff` reads the step left written down by an alarm that never finished, as it did, and
 * now also keeps how many alarms in a row were cut in that same step. At `CUTS_TO_HOLD` the step is skipped for
 * `CUT_HOLD_MS`, with an error line on every alarm that skips it and one mail to the operator when the hold starts, and
 * then it is tried again. A step that finishes clears its count. The drain is never held: it is what re-arms the alarm.
 *
 * ITS OWN FILE, FREE OF `cloudflare:`, so the rule runs in a test (`test/alarm-cuts.test.ts`); `index.ts` keeps the
 * storage.
 */

/** Alarms in a row cut in one step before that step is held. */
export const CUTS_TO_HOLD = 2;

/** How long a held step is skipped before it is tried again. */
export const CUT_HOLD_MS = 6 * 60 * 60 * 1000;

/** What an object keeps about its last cut step: which, how many alarms in a row, and when the last one was. */
export type Cuts = { step: string; times: number; at: number };

/** The step an `ALARM_STEP` value names: `act` for `act:<script>`, which says which script was running in it. */
export const stepOf = (left: string): string => left.split(':')[0] ?? left;

/** The count after one more alarm was found cut in `left`. */
export function cutAgain(before: Cuts | null, left: string, now: number): Cuts {
  const step = stepOf(left);
  return { step, times: before !== null && before.step === step ? before.times + 1 : 1, at: now };
}

/** Whether `step` is held now, and until when. Never the drain. */
export function heldUntil(cuts: Cuts | null, step: string, now: number): number | null {
  if (cuts === null || step === 'drain' || cuts.step !== step || cuts.times < CUTS_TO_HOLD) return null;
  const until = cuts.at + CUT_HOLD_MS;
  return now < until ? until : null;
}

/** A stored value read back as `Cuts`, or `null` for anything else. */
export function cutsOf(value: unknown): Cuts | null {
  if (typeof value !== 'object' || value === null) return null;
  const { step, times, at } = value as Record<string, unknown>;
  return typeof step === 'string' && typeof times === 'number' && typeof at === 'number' ? { step, times, at } : null;
}
