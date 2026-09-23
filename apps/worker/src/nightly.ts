/**
 * The nightly walk: one cron invocation, every record, one copy each. `53 §5.1`, `51 §5.12` step 1.
 *
 * ONE INVOCATION AND NOT AN ALARM PER RECORD, which is the opposite of how every other scheduled
 * thing in this Worker works, and the reason is worth writing down. A record's own alarm is set to
 * the earliest pending row or not set at all (`alarm.ts`), and that invariant is what makes a
 * customer's schedule cheap: an object with nothing to do is never woken. A nightly backup has
 * nothing to do with what the record holds, so hanging it off that alarm would wake every object
 * every night and put a second meaning on the one number `alarm.ts` keeps.
 *
 * IT IMPORTS NOTHING FROM `cloudflare:`. The platform's contribution is two functions, and what can
 * be wrong is here: paging that stops at the first five hundred, one record's failure taking the
 * rest of the fleet with it, and a night that failed saying nothing.
 *
 * A FAILURE DOES NOT STOP THE WALK AND IS NEVER SWALLOWED. It is counted, named with its reason in
 * an error line, and counted again in the closing line the morning check reads (`53 §5.1` step 5).
 * One record with a bucket that will not take its copy must not decide that nobody else gets one.
 *
 * A NIGHT WHERE EVERY RECORD FAILED IS A DIFFERENT FACT, and `fleetFailure` below is where it is
 * said: that is not one record's problem, it is the deployment's, and it is the one outcome that
 * should make the invocation itself red rather than a green run with lines in it.
 *
 * AND THE SAME WALK EXPIRES WHAT DELETED RECORDS LEFT. A deleted record keeps one final copy for
 * `FINAL_KEPT_DAYS` (`destroy.ts`), and nothing else would ever visit its prefix again: the records
 * page above lists open records only, which is how the two objects `loop/research-restore.md` §5
 * measured outlived their record. So after the copies, the Directory is asked which records closed
 * before the cutoff, and each one's prefix is emptied.
 */

import { FINAL_KEPT_MS } from './destroy.ts';

/** What one night came to. `53 §5.1` step 4's `walk.done`, in the fields this build can fill. */
export type Walked = { records: number; backups: number; failed: number; expired: number; expiryFailed: number; ms: number };

/** A page of record ids and the cursor to the next, absent at the end. The Directory's keyset shape, for both lists. */
type Page = { ids: readonly string[]; cursor?: string | undefined };

export type Walk = {
  /** The Directory's records, a page at a time. The cursor is the last id of the page, or absent at the end. */
  records: (cursor?: string) => Promise<Page>;
  /** One record's copy. Throwing is how it reports a failure, and the reason is the sentence. */
  snapshot: (record: string) => Promise<{ key: string; bytes: number; rows: number }>;
  /** The walk's own lines. `console.log` in the Worker, collected in a test. */
  say?: ((line: string) => void) | undefined;
  /** The same, for the lines that are a problem. `console.error` in the Worker, so the tail shows them apart. */
  moan?: ((line: string) => void) | undefined;
  /**
   * The records closed before `cutoff` (epoch milliseconds), paged like `records`: the Directory's `closedBefore`.
   * ABSENT, NOTHING IS EXPIRED AND THE CLOSING LINE SAYS NOTHING ABOUT EXPIRY, which is the Worker until W55-7 wires it.
   */
  closed?: ((cutoff: number, cursor?: string) => Promise<Page>) | undefined;
  /** Empties one closed record's prefix and answers how many objects went: `expireFinal` over the bucket. */
  expire?: ((record: string) => Promise<number>) | undefined;
  now: () => number;
};

/**
 * Every id a paged list hands back, one at a time, stopping at a cursor that does not move.
 *
 * A CURSOR THAT DID NOT MOVE IS THE END. The Directory's cursor is the last id of the page, so a
 * repeat means the page did not advance, and following it is an invocation that pages the same five
 * hundred records until the platform kills it and calls it a timeout.
 */
async function each(list: (cursor?: string) => Promise<Page>, visit: (id: string) => Promise<void>): Promise<void> {
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list(cursor);
    for (const id of page.ids) await visit(id);
    cursor = page.cursor !== undefined && !seen.has(page.cursor) ? page.cursor : undefined;
    if (cursor !== undefined) seen.add(cursor);
  } while (cursor !== undefined);
}

export async function nightlyWalk(o: Walk): Promise<Walked> {
  const began = o.now();
  const out: Walked = { records: 0, backups: 0, failed: 0, expired: 0, expiryFailed: 0, ms: 0 };

  await each(o.records, async (record) => {
    out.records++;
    try {
      const kept = await o.snapshot(record);
      out.backups++;
      o.say?.(`walk ${record} backup=${String(kept.rows)} rows ${String(kept.bytes)} bytes`);
    } catch (e) {
      out.failed++;
      /* THE RECORD AND THE REASON, AND NOTHING FROM THE FILE. The dump is somebody's whole
         business; an error line that quoted a byte of it would have published it to wherever
         logs go. `deliver.ts` makes the same decision for the same reason. */
      o.moan?.(`walk ${record} backup=failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  /* AFTER THE COPIES, SO A SLOW BUCKET SPENDS THE EXPIRY'S TIME AND NOT A RECORD'S COPY. A final
     copy kept a night longer than promised is a line to read in the morning; a record that got no
     copy because the walk ran out of time deleting somebody else's is the failure this file exists
     to prevent. The cutoff is read from the same clock as the walk, once. */
  const closed = o.closed;
  const expire = closed && o.expire ? o.expire : undefined;
  if (closed && expire) {
    const cutoff = began - FINAL_KEPT_MS;
    await each(
      (cursor) => closed(cutoff, cursor),
      async (record) => {
        try {
          const gone = await expire(record);
          out.expired += gone;
          o.say?.(`walk ${record} closed, expired=${String(gone)} objects`);
        } catch (e) {
          out.expiryFailed++;
          o.moan?.(`walk ${record} closed, expiry=failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    );
  }

  out.ms = o.now() - began;
  /* THE EXPIRY'S TWO FIELDS ONLY WHEN IT RAN. `expired_objects=0` from a walk that was never handed
     the Directory's `closedBefore` would read, the morning after, as a night when nothing was due. */
  const expiry = expire ? ` expired_objects=${String(out.expired)} expiry_failed=${String(out.expiryFailed)}` : '';
  const done = `walk.done records=${String(out.records)} backups=${String(out.backups)} backups_failed=${String(out.failed)}${expiry} ms=${String(out.ms)}`;
  /* WRITTEN ON EVERY NIGHT, INCLUDING AN EMPTY ONE. A Directory with no records and a Directory
     that answered nothing look identical in a log made only of per-record lines. */
  o.say?.(done);
  if (out.failed > 0 || out.expiryFailed > 0) o.moan?.(done);
  return out;
}

/**
 * The sentence for a night where nothing was copied at all, or `null` when something was.
 *
 * WHY IT IS A SEPARATE ANSWER FROM `failed`. A count of failures is read by somebody who is already
 * looking; an invocation marked failed is what makes them look. The line between the two is whether
 * anything at all worked: one record over the 40 MiB ceiling is a record to fix, and a whole fleet
 * that wrote nothing is a binding, a bucket or a recipient, and nobody has a copy of anything.
 */
export function fleetFailure(walked: Walked): string | null {
  if (walked.records === 0 || walked.backups > 0) return null;
  return `The nightly copy wrote nothing: all ${String(walked.records)} records failed. The lines above name the reason; it is the same one for every record, so it is the bucket, the binding or the recipient rather than any record.`;
}
