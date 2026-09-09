/**
 * The alarm, as the `Scheduler` port over a Durable Object's own storage.
 *
 * ONE ALARM PER CUSTOMER, always set to the earliest pending row or not set at all. That invariant
 * is what an object per customer buys: the alternative is a cron worker fanning out across every
 * tenant on a schedule of its own, waking records that have nothing to do in order to ask them.
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

export function alarmScheduler(store: AlarmStore, ring?: Doorbell | undefined): Scheduler {
  return {
    get: () => store.getAlarm(),

    async set(atMs: number) {
      /* IDEMPOTENT, and it has to be: `arm()` runs after every write that could have changed the
         minimum, which on a busy record is every write. Reading first turns "set the alarm" into a
         storage read that usually decides to do nothing. */
      const armed = await store.getAlarm();
      if (armed === atMs) return;
      /* A TIME ALREADY PAST IS SET, NOT SKIPPED. A record reopened after a week has reminders whose
         time came while nothing was running, and an alarm nobody set is a schedule that never
         restarts. The platform fires a past alarm immediately, which is exactly right. */
      await store.setAlarm(atMs);
    },

    async clear() {
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
