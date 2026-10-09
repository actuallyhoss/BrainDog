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
 * page above lists open records only, which is how two objects were
 * measured outliving their record. So after the copies, the Directory is asked which records closed
 * before the cutoff, and each one's prefix is emptied.
 *
 * AND LAST, THE LEDGER IS MADE EQUAL TO THE EVENTS. Every run a record metered is a `pull` event in it,
 * and the Directory's usage ledger is told of each by the pass that ran it, which can die between the
 * two or be refused. So each record hands the Directory its last forty days of runs again
 * (`replayUsage`), and a run already counted adds nothing, which makes a night that replays twice the
 * same as one that replays once.
 *
 * EACH RECORD, IN ORDER: ITS KEYS RE-WRAPPED, ITS COPY, ITS ERASURES CHECKED (`53 §5.1` step 3). The re-wrap comes
 * before the copy so tonight's copy holds the keys under tonight's root key. The erasures are checked against the bucket
 * itself, because a delete R2 took without complaint says nothing about what is left: a key still there is put back on
 * the record's outbox and counted open. Then the billing ladder (`ladder.ts`), once, over the Directory's lapsed rows.
 *
 * AND WHAT EACH RECORD HAS ON, FOR THE KENNEL'S INSTALL COUNTS. The same visit asks the record which add-ons and use
 * cases it has on, and once every record was asked the tally becomes `kennel/counts.json` (`writeCounts` in `kennel.ts`).
 * Only the records this walk visits are counted, which are the hosted ones: a self-host has no row in this Directory,
 * so it is never counted and never asked.
 *
 * EVERY LINE IS ONE JSON OBJECT THROUGH `op()` (`oplog.ts`, `53 §2.3`), because the morning's alerts are saved queries
 * over fields: `op=walk backup=failed`, `op=walk.done stragglers>0`. A sentence could not be queried.
 */

import type { Replayed } from '@braindog/host/actions';

import { FINAL_KEPT_MS } from './destroy.ts';
import type { Laddered } from './ladder.ts';
import type { OpFields } from './oplog.ts';
import type { RewrapOutcome } from './rewrap.ts';

/**
 * What one night came to. `53 §5.1` step 4's `walk.done`.
 *
 * `replay` AND `ladder` ARE THERE ONLY WHEN THE WALK WAS HANDED ONE: the runs the ledger counted new, the runs it would
 * not take, and the records whose replay failed outright; the lapsed rows, the letters, the deletions and the failures.
 */
export type Walked = {
  records: number;
  backups: number;
  failed: number;
  /** Records whose keys are still under an old root key, or whose re-wrap threw. */
  stragglers: number;
  /** `erase.r2` work still open: pending longer than a day, dead, or done with its object still in the bucket. */
  eraseOpen: number;
  expired: number;
  expiryFailed: number;
  ms: number;
  replay?: { counted: number; lost: number; failed: number } | undefined;
  ladder?: Laddered | undefined;
  /**
   * The install counts, there only when the walk was handed both `installed` and `counts`: the records that answered,
   * the ones that could not be asked, how many listings the file names, and whether it was written.
   */
  counts?: { records: number; failed: number; listings: number; written: boolean } | undefined;
};

/** How far back a done erasure is checked against the bucket: `53 §5.8` step 4's thirty nights. */
export const ERASE_CHECK_MS = 30 * 86_400_000;

/** How long an erasure may wait before it counts as open. The queue drains in minutes; a day is a stuck row. */
export const ERASE_LATE_MS = 86_400_000;

/**
 * The most `erase.r2` rows one record answers the walk in a night, and the most it puts back. An erasure queues one row
 * per attachment of the subject, so a thousand is a record with a thousand erased files in a month; the rest are read
 * the next night, oldest first.
 */
export const ERASE_ROWS_MOST = 1_000;

/**
 * The most pack ids one record adds to the night's install tally. A record's own add-ons are ids too, and the tally is
 * held for the whole walk, so one record with thousands of its own cannot grow it without end; a record with more has
 * the rest left out of the counts, which only ever makes a count too low.
 */
export const COUNTED_PACKS_MOST = 500;

/**
 * One `erase.r2` row as the record answers it for the walk: its id, where it is on the ladder, when it was queued, and
 * the erasure and object key its payload names.
 */
export type EraseRow = { id: string; state: string; created: string; erase: string; key: string };

/** A page of record ids and the cursor to the next, absent at the end. The Directory's keyset shape, for both lists. */
type Page = { ids: readonly string[]; cursor?: string | undefined };

export type Walk = {
  /** The Directory's records, a page at a time. The cursor is the last id of the page, or absent at the end. */
  records: (cursor?: string) => Promise<Page>;
  /** One record's copy. Throwing is how it reports a failure, and the reason is the sentence. */
  snapshot: (record: string) => Promise<{ key: string; bytes: number; rows: number }>;
  /**
   * The record told its copy was kept, so its own Settings can say when and how large (`copyKept` in the kernel, LCH-C03).
   * ABSENT, THE RECORD IS NOT TOLD, for the reason `expire` is optional.
   */
  kept?: ((record: string, copy: { key: string; bytes: number }) => Promise<void>) | undefined;
  /**
   * The record told its copy failed, and why: one `export` event whose note begins `failed:`, and one fault, counted
   * again rather than opened twice when the same night fails the same way tomorrow (`copyFailed`). Never a question.
   */
  failed?: ((record: string, why: string) => Promise<void>) | undefined;
  /**
   * The walk's own lines, one object each: `op()` in the Worker, collected in a test. `error` is a line that is a
   * problem, which Workers Logs files apart from the rest.
   */
  speak?: ((fields: OpFields, level: 'info' | 'error') => void) | undefined;
  /**
   * One record's keys moved under the current root key: `rewrapRecord` (`rewrap.ts`). ABSENT, NOTHING IS RE-WRAPPED AND
   * THE CLOSING LINE SAYS NOTHING ABOUT STRAGGLERS, for the reason `expire` is optional.
   */
  rewrap?: ((record: string) => Promise<RewrapOutcome>) | undefined;
  /** One record's erasures checked against the bucket, answering how many are open (`reconcileErase`). */
  erase?: ((record: string) => Promise<number>) | undefined;
  /** The billing ladder, once, after every copy (`ladder.ts`). */
  ladder?: (() => Promise<Laddered>) | undefined;
  /** The night's summary as one `log` note in the operator's own record (`OPS_RECORD`). Absent, no note is written. */
  note?: ((text: string) => Promise<void>) | undefined;
  /**
   * The records closed before `cutoff` (epoch milliseconds), paged like `records`: the Directory's `closedBefore`.
   * ABSENT, NOTHING IS EXPIRED AND THE CLOSING LINE SAYS NOTHING ABOUT EXPIRY, which is the Worker until it is wired.
   */
  closed?: ((cutoff: number, cursor?: string) => Promise<Page>) | undefined;
  /** Empties one closed record's prefix and answers how many objects went: `expireFinal` over the bucket. */
  expire?: ((record: string) => Promise<number>) | undefined;
  /**
   * One record's metered runs from the last forty days, handed to the Directory's ledger again: `Record$.meterReplay`.
   * `null` is a record with nothing to replay. ABSENT, NOTHING IS REPLAYED AND THE CLOSING LINE SAYS NOTHING ABOUT IT,
   * for the reason `expire` is optional.
   */
  replay?: ((record: string) => Promise<Replayed | null>) | undefined;
  /**
   * The packs one record has on, by the id it holds each under (`Record$.packsOn`): its add-ons, and its use cases as
   * `usecase-<id>`. `null` is a record with nothing to answer. ABSENT, OR `counts` ABSENT, NOTHING IS COUNTED AND THE
   * CLOSING LINE SAYS NOTHING ABOUT COUNTS, for the reason `expire` is optional.
   */
  installed?: ((record: string) => Promise<readonly string[] | null>) | undefined;
  /** The night's tally, records by pack id, written as the Kennel's `counts.json` (`writeCounts`); answers the listings named. */
  counts?: ((held: ReadonlyMap<string, number>) => Promise<number>) | undefined;
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

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * How many of one record's erasures are open, putting back on its outbox every one whose object is still there.
 *
 * OPEN IS THREE THINGS (`53 §5.1` step 3d): a row still waiting a day after it was queued, a row the retry ladder gave
 * up on (`dead`, which is a compliance alert and not only the owner's item), and a row marked `done` in the last thirty
 * days whose object the bucket still holds. Only the third is put back: the first two are already on the outbox.
 *
 * A KEY ALREADY WAITING AGAIN IS NOT QUEUED A SECOND TIME. The done row stays in the thirty days whatever happens next,
 * so without this every night would add one more row for the same object until a delete finally took.
 */
export async function reconcileErase(
  rows: readonly EraseRow[],
  held: (key: string) => Promise<boolean>,
  again: (rows: { erase: string; key: string }[]) => Promise<void>,
  now: number,
): Promise<number> {
  let open = 0;
  const waiting = new Set(rows.filter((r) => r.state !== 'done').map((r) => r.key));
  const back: { erase: string; key: string }[] = [];
  for (const row of rows) {
    const created = Date.parse(row.created);
    if (row.state === 'dead') open++;
    else if (row.state !== 'done') {
      if (!(now - created < ERASE_LATE_MS)) open++;
    } else if (now - created <= ERASE_CHECK_MS && !waiting.has(row.key) && (await held(row.key))) {
      open++;
      waiting.add(row.key);
      back.push({ erase: row.erase, key: row.key });
    }
  }
  if (back.length > 0) await again(back);
  return open;
}

export async function nightlyWalk(o: Walk): Promise<Walked> {
  const began = o.now();
  const out: Walked = { records: 0, backups: 0, failed: 0, stragglers: 0, eraseOpen: 0, expired: 0, expiryFailed: 0, ms: 0 };
  const installed = o.installed;
  const writeCounts = o.counts;
  const counted = installed && writeCounts ? { records: 0, failed: 0, listings: 0, written: false } : undefined;
  if (counted) out.counts = counted;
  /* HOW MANY RECORDS HAVE EACH PACK ON, by the id a record holds it under. Only a number per id is kept, never which
     record, so nothing about one record outlives its visit. */
  const held = new Map<string, number>();

  await each(o.records, async (record) => {
    out.records++;
    const from = o.now();
    const line: OpFields = { op: 'walk', rec: record };
    let bad = false;
    /* A RE-WRAP THAT THROWS IS A STRAGGLER WITH A REASON, and the walk carries on to the copy. `53 §5.6` would stop the
       walk here; this file's rule is that one record never costs another its copy, and the closing line's
       `stragglers` is the alert either way. */
    if (o.rewrap) {
      try {
        const moved = await o.rewrap(record);
        line.kek = moved;
        if (moved === 'straggler') {
          out.stragglers++;
          bad = true;
        }
      } catch (e) {
        out.stragglers++;
        bad = true;
        line.kek = 'failed';
        line.rewrap_why = reason(e);
      }
    }
    const copying = o.now();
    /* WHAT THE NIGHT CAME TO FOR THIS RECORD: the copy kept, or the reason it was not. */
    let told: { key: string; bytes: number } | string;
    try {
      const kept = await o.snapshot(record);
      out.backups++;
      line.backup = 'ok';
      line.rows = kept.rows;
      line.bytes = kept.bytes;
      line.backup_ms = o.now() - copying;
      told = { key: kept.key, bytes: kept.bytes };
    } catch (e) {
      out.failed++;
      bad = true;
      /* THE RECORD AND THE REASON, AND NOTHING FROM THE FILE. The dump is somebody's whole
         business; an error line that quoted a byte of it would have published it to wherever
         logs go. `deliver.ts` makes the same decision for the same reason. */
      line.backup = 'failed';
      told = reason(e);
      line.why = told;
    }
    /* AND THE RECORD IS TOLD, so a night that failed reaches the person whose copy it was and not only the tail. Told
       after the copy and never before, so the telling is never in the copy; a record that could not be told is a line,
       and costs nobody else a thing. */
    const onKept = o.kept;
    const onFailed = o.failed;
    if (typeof told === 'string' ? onFailed : onKept) {
      try {
        if (typeof told === 'string') await onFailed?.(record, told);
        else await onKept?.(record, told);
        line.told = true;
      } catch (e) {
        bad = true;
        line.told = false;
        line.told_why = reason(e);
      }
    }
    /* AN ERASURE CHECK THAT COULD NOT RUN COUNTS AS ONE OPEN. `erase_open = 0` is the morning's proof that every
       erased object is gone, and a record that could not be asked has not proved it. */
    if (o.erase) {
      try {
        const open = await o.erase(record);
        out.eraseOpen += open;
        line.erase_open = open;
        if (open > 0) bad = true;
      } catch (e) {
        out.eraseOpen++;
        bad = true;
        line.erase_open = 1;
        line.erase_why = reason(e);
      }
    }
    /* WHAT THE RECORD HAS ON, EACH ID ONCE. A record that could not be asked is out of tonight's tally and named here
       with its reason; it costs no record its copy, and the counts are only ever too low, never too high. */
    if (installed && counted) {
      try {
        const on = await installed(record);
        if (on !== null) {
          counted.records++;
          for (const id of new Set(on.slice(0, COUNTED_PACKS_MOST))) held.set(id, (held.get(id) ?? 0) + 1);
        }
      } catch (e) {
        counted.failed++;
        bad = true;
        line.counts = 'failed';
        line.counts_why = reason(e);
      }
    }
    line.ms = o.now() - from;
    o.speak?.(line, bad ? 'error' : 'info');
  });

  /* THE COUNTS WRITTEN ONCE, AFTER EVERY RECORD WAS ASKED, and before the ladder, whose deletions change no count that
     was true tonight. A NIGHT WHERE NO RECORD ANSWERED AND SOME FAILED WRITES NOTHING: that is a binding or a build, not
     a fleet where nobody holds anything, and the last night's file is truer than an empty one. A write that throws is a
     line, and the last night's file stands. */
  if (counted && writeCounts) {
    if (counted.records === 0 && counted.failed > 0) o.speak?.({ op: 'walk', rec: null, counts: 'skipped', counts_failed: counted.failed }, 'error');
    else {
      try {
        counted.listings = await writeCounts(held);
        counted.written = true;
      } catch (e) {
        o.speak?.({ op: 'walk', rec: null, counts: 'failed', why: reason(e) }, 'error');
      }
    }
  }

  /* THE LADDER AFTER THE COPIES, so a record deleted tonight had its night's copy first, and ONCE, over the Directory's
     lapsed rows rather than beside each record: the rows are few and the Directory answers them in one call. A ladder
     that throws is a line and a failure, never the end of the walk. */
  if (o.ladder) {
    try {
      out.ladder = await o.ladder();
    } catch (e) {
      out.ladder = { lapsed: 0, sent: 0, deleted: 0, failed: 1 };
      o.speak?.({ op: 'walk', rec: null, billing: 'failed', why: reason(e) }, 'error');
    }
  }

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
          o.speak?.({ op: 'walk', rec: record, closed: true, expired: gone }, 'info');
        } catch (e) {
          out.expiryFailed++;
          o.speak?.({ op: 'walk', rec: record, closed: true, expiry: 'failed', why: reason(e) }, 'error');
        }
      },
    );
  }

  /* AND LAST, EACH RECORD'S RUNS INTO THE LEDGER AGAIN. Last because a count that waits a night is still a count, and a
     copy or an expiry that waits is a promise broken; a second page through the records rather than a step beside each
     copy, for the reason the expiry above is one. A record's replay that throws is its own line and never the rest's. */
  const replay = o.replay;
  if (replay) {
    const tally = { counted: 0, lost: 0, failed: 0 };
    out.replay = tally;
    await each(o.records, async (record) => {
      try {
        const again = await replay(record);
        if (again === null) return;
        tally.counted += again.counted;
        tally.lost += again.lost;
        if (again.lost > 0) o.speak?.({ op: 'walk', rec: record, replay_lost: again.lost, runs: again.runs }, 'error');
        if (again.reached === 'ceiling') o.speak?.({ op: 'walk', rec: record, replay: 'ceiling', walked: again.walked }, 'error');
      } catch (e) {
        tally.failed++;
        o.speak?.({ op: 'walk', rec: record, replay: 'failed', why: reason(e) }, 'error');
      }
    });
  }

  out.ms = o.now() - began;
  /* EACH STEP'S FIELDS ONLY WHEN IT RAN. `expired_objects: 0` from a walk that was never handed the Directory's
     `closedBefore` would read, the morning after, as a night when nothing was due, and `stragglers: 0` from a walk that
     re-wrapped nothing as a rotation that finished. */
  const done: OpFields = { op: 'walk.done', records: out.records, backups: out.backups, backups_failed: out.failed };
  if (o.rewrap) done.stragglers = out.stragglers;
  if (o.erase) done.erase_open = out.eraseOpen;
  if (out.ladder) {
    done.lapsed = out.ladder.lapsed;
    done.lapse_letters = out.ladder.sent;
    done.lapse_deleted = out.ladder.deleted;
    done.lapse_failed = out.ladder.failed;
  }
  if (expire) {
    done.expired_objects = out.expired;
    done.expiry_failed = out.expiryFailed;
  }
  if (out.replay) {
    done.replayed_runs = out.replay.counted;
    done.replay_lost = out.replay.lost;
    done.replay_failed = out.replay.failed;
  }
  if (out.counts) {
    done.counted_records = out.counts.records;
    done.counts_failed = out.counts.failed;
    done.count_listings = out.counts.listings;
    done.counts_written = out.counts.written;
  }
  done.ms = out.ms;
  const problem =
    out.failed > 0 ||
    out.stragglers > 0 ||
    out.eraseOpen > 0 ||
    out.expiryFailed > 0 ||
    (out.ladder !== undefined && out.ladder.failed > 0) ||
    (out.replay !== undefined && (out.replay.failed > 0 || out.replay.lost > 0)) ||
    (out.counts !== undefined && (out.counts.failed > 0 || !out.counts.written));
  /* WRITTEN ON EVERY NIGHT, INCLUDING AN EMPTY ONE. A Directory with no records and a Directory
     that answered nothing look identical in a log made only of per-record lines. */
  o.speak?.(done, problem ? 'error' : 'info');

  /* AND THE SAME NIGHT AS ONE NOTE IN THE OPERATOR'S OWN RECORD (`53 §5.1` step 4), which is where the morning check
     starts. A note that could not be written is a line, and the night it describes still happened. */
  if (o.note) {
    try {
      await o.note(summaryOf(out, began));
    } catch (e) {
      o.speak?.({ op: 'walk', rec: null, note: 'failed', why: reason(e) }, 'error');
    }
  }
  return out;
}

/**
 * The night in one line for the operator's record: `walk 2026-09-28 · 12 records · 0 stragglers · 0 failed · 0 open`.
 * `53 §5.1` step 4's words, dated by the walk's own clock.
 */
export function summaryOf(walked: Walked, began: number): string {
  const date = new Date(began).toISOString().slice(0, 10);
  return `walk ${date} · ${String(walked.records)} records · ${String(walked.stragglers)} stragglers · ${String(walked.failed)} failed · ${String(walked.eraseOpen)} open`;
}

/**
 * The sentence for a night where nothing was copied at all, or `null` when something was.
 *
 * WHY IT IS A SEPARATE ANSWER FROM `failed`. A count of failures is read by somebody who is already
 * looking; an invocation marked failed is what makes them look. The line between the two is whether
 * anything at all worked: one record over the 40 MiB ceiling is a record to fix, and a whole fleet
 * that wrote nothing is a binding, a bucket or a recipient, and nobody has a copy of anything.
 *
 * A WALK THAT REACHED NO RECORD IS NOT RED HERE, because a deployment before its first sign-up is not broken. It is not a
 * night that ran either: `/healthz` says `reached: false, ran: false` for it (`nightSaid` in `health.ts`), so a watch
 * from outside sees a Directory whose page came back empty.
 */
export function fleetFailure(walked: Walked): string | null {
  if (walked.records === 0 || walked.backups > 0) return null;
  return `The nightly copy wrote nothing: all ${String(walked.records)} records failed. The lines above name the reason; it is the same one for every record, so it is the bucket, the binding or the recipient rather than any record.`;
}
