/**
 * The doorbell's other end: what happens to one record's outbox, and to the messages that rang.
 *
 * IT IMPORTS NOTHING FROM `cloudflare:`, for the same reason `deliver.ts` does not. This is where
 * an ack can land on the wrong lease, where a failure can be swallowed into a silent success, and
 * where one record's bad afternoon can take the other twenty-four in the batch with it — and all
 * three of those are decisions in plain functions rather than facts about the platform. They run in
 * a bare Node process against an object literal, which is the only reason they are tested at all.
 *
 * THE RECORD OWNS THE LADDER AND THIS OWNS THE PASS. Nothing here decides when to try again: a
 * failure is acked as a failure and `ackOutbox` counts the attempt, arms the `retry` row and opens
 * the suggestion at the ceiling. A pump that kept its own counter would be the second ladder
 * `09-ALARMS` spends a paragraph forbidding.
 */

import { messageOf } from '@braindog/host/log-floor';
import type { OutboxRow } from '@braindog/kernel';

/**
 * What the pump needs of a record, which is the two methods and not the class.
 *
 * `result` IS WHAT THE DELIVERY SAID, passed to `ackOutbox` as it came. A push the service called gone is `{ gone: true }`,
 * and the record drops that subscription in the ack's transaction (`51 §5`). Absent for every delivery that had nothing
 * to say, which is every kind but that one.
 */
export type Leasable = {
  lease(n?: number): Promise<OutboxRow[]>;
  ack(done: { id: string; state: 'done' | 'failed'; error?: string; leasedUntil?: string; result?: unknown }): Promise<void>;
};

/** What the pump needs of a queue message. Cloudflare's `Message` is a superset of it. */
export type Rung = { readonly body: { readonly record: string }; ack(): void; retry(): void };

export type Pass = { sent: number; failed: number; unacked: number };

/**
 * One pass over one record's outbox: lease, deliver, ack.
 *
 * ONE PASS AND NOT A LOOP. The ack rings the doorbell again when anything is left, so a queue that
 * keeps filling is drained by the doorbell rather than by a `while` nobody can stop — and a
 * consumer that looped would hold one invocation open across a customer's entire backlog.
 */
export async function pump(record: Leasable, deliver: (job: OutboxRow) => Promise<unknown>, log = warn): Promise<Pass> {
  const out: Pass = { sent: 0, failed: 0, unacked: 0 };

  for (const job of await record.lease()) {
    /* THE SUCCESS ACK IS OUTSIDE THE TRY WHOSE CATCH ACKS FAILURE. It used to be inside, so an ack
       that threw for its own reasons — a DO RPC can, on a code update or an eviction — recorded a
       SENT email as failed, armed a retry and sent it again. */
    let sent = false;
    let why = '';
    let result: unknown;
    try {
      result = await deliver(job);
      sent = true;
    } catch (e) {
      /* THE MESSAGE AND NEVER THE PAYLOAD. A digest is somebody's overdue invoices; an error line
         that quoted one has published it to wherever logs go. */
      why = said(e);
    }

    try {
      /* AND THE LEASE GOES BACK WITH THE ANSWER. Without it a stale ack completes somebody else's
         lease: a slow endpoint outlives its sixty seconds, another worker reclaims and delivers,
         and the first worker's late failure arms a retry for a job that already went. */
      await record.ack(
        sent
          ? { id: job.id, state: 'done', leasedUntil: job.leasedUntil, ...(result === undefined ? {} : { result }) }
          : { id: job.id, state: 'failed', error: why, leasedUntil: job.leasedUntil },
      );
      if (sent) out.sent++;
      else out.failed++;
    } catch (e) {
      /* AN ACK THAT WILL NOT LAND IS NOT A REASON TO ABANDON THE REST OF THE BATCH. The lease
         expires and the job is reclaimed, which is what the lease is for. */
      out.unacked++;
      log(`ack ${job.id}: ${said(e)}`);
    }
  }

  return out;
}

/**
 * A batch of doorbells, answered.
 *
 * DE-DUPLICATED BY RECORD, and every message that named one is answered with that record's outcome.
 * Twenty writes to one record in a second ring twenty times, and twenty passes over one outbox is
 * nineteen round trips for nothing.
 *
 * AND A FAILURE IS RETRIED RATHER THAN LOGGED. A consumer that catches, logs and returns is a
 * consumer Cloudflare reads as successful: the message is acked and `max_retries` — three of them,
 * written down in `wrangler.toml` with a comment explaining that they cover a consumer that
 * crashed — can never fire once. A `lease()` that failed because the object was mid-deploy lost
 * that doorbell for good, and the rows sat `pending` with nothing left to ring for them.
 *
 * THE ROWS ARE STILL `pending` EITHER WAY, which is what makes redelivery safe: a message that
 * arrives after the record recovered drains them, and one that arrives after another worker already
 * did finds nothing to lease and acks.
 */
export async function consume(
  messages: readonly Rung[],
  drain: (record: string) => Promise<unknown>,
  log = warn,
): Promise<void> {
  const rang = new Map<string, Rung[]>();
  for (const m of messages) {
    /* A MESSAGE NOBODY HERE CAN READ IS ACKED, NOT RETRIED. `m.body.record` on a `null` body throws
       a `TypeError` out of this loop, out of `queue()`, and Cloudflare fails the WHOLE batch — so a
       single malformed message (an older payload shape, another producer, one injected from the
       dashboard) re-drove twenty-four healthy records three times and then dropped them. The
       docstring above promises the opposite, and the grouping loop was breaking the promise the
       drain loop below keeps.

       ACKED BECAUSE NOTHING CAN EVER MAKE IT DRAINABLE. Retrying a message whose body is not a
       record name is three more chances to fail at the same sentence. */
    const named: unknown = (m as { body?: { record?: unknown } }).body?.record;
    if (typeof named !== 'string' || named === '') {
      log('drain: a doorbell that named no record');
      safely(() => m.ack(), log);
      continue;
    }
    const seen = rang.get(named);
    if (seen) seen.push(m);
    else rang.set(named, [m]);
  }

  for (const [id, ringers] of rang) {
    let drained = false;
    try {
      await drain(id);
      drained = true;
    } catch (e) {
      /* ONE RECORD'S FAILURE IS NOT THE BATCH'S. The other twenty-four are drained, and only the
         messages about this one go back. */
      log(`drain ${id}: ${said(e)}`);
    }
    /* AND THE ANSWERING IS OUTSIDE THE TRY THAT CATCHES THE DRAIN, for the same reason the success
       ack is outside its own: an `ack()` that threw on the third of five ringers used to be caught
       as a DRAIN failure, so the two already acked were retried and a log line named a failure that
       never happened. */
    for (const m of ringers) safely(() => (drained ? m.ack() : m.retry()), log);
  }
}

/** The platform's own answer, which can throw too. It is one message, not the batch. */
function safely(fn: () => void, log: (line: string) => void): void {
  try {
    fn();
  } catch (e) {
    log(`answering a doorbell: ${said(e)}`);
  }
}

/* THROUGH THE FLOOR, BECAUSE THIS SENTENCE IS KEPT: on the outbox row, shown on a screen and carried in every export. A thrown
   fetch names the whole address it asked, and an address can hold a key. */
const said = (e: unknown): string => messageOf(e);

/* The default log, named so a test can pass its own and read what was said. */
const warn = (line: string): void => console.error(line);
