/**
 * HOW MUCH OF ONE HOST TICK A STEP MAY SPEND, and where it stops so the next tick carries on.
 *
 * WHAT WAS SEEN, 27 TO 30 OCTOBER, ON HIS RECORD. The record's object ran its alarm for 15 to 75 seconds, 15 to 37 of
 * them CPU, and the platform reset it five times ("storage operation exceeded timeout"). Every request did the same
 * work in its `waitUntil`: from 00:00 UTC on 30 October each `/api/pulse` (one every 25 seconds while a session is
 * open) spent 14 to 17 seconds of CPU, about 2,100 seconds of every hour, until the object had nothing left for a bank
 * text. The work was the daily look and the lint drawing every page in one go, and the same look again after it.
 *
 * SO A STEP DRAWS A FEW PAGES, NOT ALL OF THEM. A budget counts the units a step spent (a page drawn is one) and the
 * wall time since it began, and says `spent` once either is past its bound. A step asks `spent` only after a unit, so
 * every tick makes progress, and keeps where it stopped, so the next tick goes on from there: what comes out at the
 * end is what one long tick would have made.
 *
 * THE COUNT IS THE BOUND THAT HOLDS ON A WORKER. A Worker's clock stands still while synchronous code runs (the page
 * draws are synchronous), so `ms` cuts only where the clock moves (the self-host, a test, or a step that waited on the
 * network between its units). `units` cuts everywhere.
 *
 * `UNBOUNDED` is what a caller that hands no budget gets, and it never says `spent`: the self-host's tick and every
 * test that asks once see one tick do the whole of the work, as before.
 */

export type TickBudget = {
  /** Count `n` units of work spent, one page drawn being one. */
  spend(n?: number): void;
  /** Whether the step should stop before its next unit. */
  spent(): boolean;
  /**
   * Count `n` units passed over because nothing they read moved since they were last done (a page of the look's later
   * walks whose lists stand, `slashHeadlinesAgain`). Spends nothing; a host that counts what its alarm did says it.
   */
  kept?(n?: number): void;
};

/** A budget that never runs out: one tick does everything, as a caller that hands none always had. */
export const UNBOUNDED: TickBudget = { spend: () => undefined, spent: () => false };

/** About this long of wall time per step of one alarm, where the clock moves. */
export const TICK_MS = 5_000;

/**
 * And at most this many pages drawn per step of one alarm, wherever it runs. His pages drew at about half a second of
 * CPU each on the platform (a whole walk of the look took 15 s), so ten is about the 5 s a step is given.
 */
export const TICK_PAGES = 10;

/** A budget of `units` and `ms` from now. */
export function tickBudget(now: () => number, ms: number = TICK_MS, units: number = TICK_PAGES): TickBudget {
  const start = now();
  let used = 0;
  return {
    spend: (n = 1) => {
      used += n;
    },
    spent: () => used >= units || now() - start >= ms,
  };
}
