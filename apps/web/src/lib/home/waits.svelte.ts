/**
 * WHAT WAITS AND WHO IS WORKING, AS THE NEWEST `boot` SAID IT, for every screen that says either: the rail's badge and
 * its working row, Today's header and Decide's sentence (EXP-E07).
 *
 * ONE ANSWER, HELD FOR THE TAB. The root layout writes it from the shell it was handed, and again from the poll's
 * re-read of `boot` whenever the record's version moves (`rereadBoot`), so a question answered on Decide takes one off
 * the rail's badge and Today's header in the same moment, and no screen counts what waits a second way.
 *
 * `null` UNTIL A RECORD THAT SENDS `waits` HAS ANSWERED: a screen then says what it said before, from its own reads.
 */

import type { Waits, Working } from '../record/boot-live.ts';

const state = $state<{ waits: Waits | null; working: readonly Working[] }>({ waits: null, working: [] });

/** What waits on the reader now, as the newest `boot` said it, or `null` where no record said. Reactive where it is read. */
export const waitsNow = (): Waits | null => state.waits;

/** The agents working now, as the newest `boot` said it. Reactive where it is read. */
export const workingNow = (): readonly Working[] => state.working;

/** Hear a `boot`'s answer: what waits and who is working, as the shell or the poll read them. */
export function heardWaits(from: { waits: Waits | null; working: readonly Working[] }): void {
  state.waits = from.waits;
  state.working = from.working;
}
