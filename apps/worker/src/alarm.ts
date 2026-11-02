/**
 * The alarm, as the `Scheduler` port over a Durable Object's own storage.
 *
 * ONE ALARM PER CUSTOMER, never later than the earliest pending row, and set to exactly it (or not set
 * at all) by each alarm as it ends. That invariant is what an object per customer buys: the alternative
 * is a cron worker fanning out across every tenant on a schedule of its own, waking records that have
 * nothing to do in order to ask them. Between alarms a request only moves it earlier (`AlarmRules`).
 *
 * THIS FILE IMPORTS NOTHING FROM `cloudflare:`, and the reason is that it is the half worth testing.
 * The platform's contribution is three methods on `ctx.storage`; everything that can be wrong —
 * arming twice, arming to the past, clearing an alarm a pending row still needs — is in the twenty
 * lines below, and those run in a bare Node process against an object literal.
 *
 * TWO RETRY LADDERS NEST HERE AND THEY ARE NOT THE SAME ONE. Cloudflare retries a *throwing*
 * `alarm()` itself, with its own backoff. That covers an alarm that crashed. It does not cover a
 * notification whose delivery failed, because that alarm returned successfully — which is the
 * record's ladder, in `schedule`. Conflating them produces either a retry storm or a job that is
 * never retried at all.
 */

import type { Scheduler } from '@braindog/ports';

/** The three methods this needs from `DurableObjectStorage`, and not one more. */
export type AlarmStore = {
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
};

/**
 * `wake()` is the outbox doorbell, and it is the ONE piece of I/O a record performs.
 *
 * It carries the record's name and never the payload: a queue message that copied a notification
 * would be a second copy of something that may have changed by the time it is read. A lost message
 * costs latency and never a notification, because the outbox row is still `pending` and the next
 * request drains it — the outbox is the source of truth and the queue is a doorbell.
 *
 * IT RETURNS `unknown` AND NOT `void`, so the caller may hand over anything that resolves. This was
 * `Promise<void>` and `Queue.send()` began returning a `QueueSendResponse` in the platform types,
 * which made the one production caller — the only one there has ever been — a type error. The
 * doorbell has never had a return value: what it answers with is the platform's business, and
 * writing that down as `void` was a claim about a call this file does not make.
 */
export type Doorbell = () => Promise<unknown>;

/**
 * When this object may move its alarm LATER or clear it, and not only earlier (`AlarmRules.exact`).
 *
 * A REQUEST ONLY EVER MOVES THE ALARM EARLIER (perf3, 2 November). Every pulse asked whether the look was due and set
 * the alarm for now (`#lookSoon`), and then the pulse's own write tailed it back out to the earliest schedule row, an
 * hour off (`kernel.tail`). The platform cancels an alarm that was due and is moved before it runs: on his record that
 * was a cancelled alarm every pulse, four every fifteen seconds while agents worked, 200 between 00:00 and 02:00 UTC,
 * and the look that was due waited for a gap between bursts long enough to slip through, up to about a minute.
 *
 * Only the alarm itself is exact, since it is the one that just ran what was due and knows what is next: inside it the
 * platform reads no alarm set, so its tail sets the true next one. A request's tail that would move the alarm later or
 * clear it leaves it as it is; the worst that costs is one alarm that wakes early, finds nothing due and sets the true
 * next one from its own tail. An alarm already due is never moved by a request at all, earlier or not.
 */
export type AlarmRules = {
  /** Whether the call comes from the alarm itself, which may move the alarm later or clear it. Absent is always. */
  exact?: (() => boolean) | undefined;
  /** The clock an alarm already due is read against. */
  now?: (() => number) | undefined;
};

export function alarmScheduler(store: AlarmStore, ring?: Doorbell | undefined, rules: AlarmRules = {}): Scheduler {
  const exact = rules.exact ?? (() => true);
  const now = rules.now ?? Date.now;
  return {
    get: () => store.getAlarm(),

    async set(atMs: number) {
      /* IDEMPOTENT, and it has to be: `arm()` runs after every write that could have changed the
         minimum, which on a busy record is every write. Reading first turns "set the alarm" into a
         storage read that usually decides to do nothing. */
      const armed = await store.getAlarm();
      if (armed === atMs) return;
      /* OUTSIDE THE ALARM, ONLY EARLIER, AND NEVER ONE ALREADY DUE (`AlarmRules`). */
      if (!exact() && armed !== null && (armed <= atMs || armed <= now())) return;
      /* A TIME ALREADY PAST IS SET, NOT SKIPPED. A record reopened after a week has reminders whose
         time came while nothing was running, and an alarm nobody set is a schedule that never
         restarts. The platform fires a past alarm immediately, which is exactly right. */
      await store.setAlarm(atMs);
    },

    async clear() {
      /* A REQUEST NEVER CLEARS IT: an alarm with nothing left to do wakes once and its own tail clears it. Cleared from
         a request, it was the alarm a pulse had just set for the look. */
      if (!exact()) return;
      if ((await store.getAlarm()) !== null) await store.deleteAlarm();
    },

    /* THE PORT'S `wake()` IS `Promise<void>` AND THE DOORBELL'S RETURN IS DISCARDED HERE, which is
       the honest place to drop it: `31 §2` says the record's one outbound act carries no answer
       back, so whatever the platform hands the ringer is not a value the kernel may see. */
    wake: async () => {
      await ring?.();
    },
  };
}
