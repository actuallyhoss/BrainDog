/**
 * Deleting a hosted record (`02 §9`, `51 §5.13`): the host's half of `deleteRecord`.
 *
 * THE RECORD CHECKED EVERYTHING BEFORE THIS RUNS: an owner, a recent sign-in, the name typed exactly. What is left is
 * the platform's, in this order: the final copy, then every other copy the bucket
 * holds for the record, then the alarm, then every byte the object holds, then the Directory's names for it, so nothing
 * resolves to the empty object afterwards and nothing of the record is left in R2 but the one copy that is meant to be.
 *
 * THE COPIES BEFORE THE BYTES, AND A SWEEP THAT FAILED IS THROWN BEFORE `deleteAll`. Measured at `afb3b1b2`: this
 * function ran `deleteAlarm`, `deleteAll` and `close`, the bucket held 2 objects under the record's prefix before and 2
 * after, and the next walk (which lists open records only) never visited that prefix again. Sweeping after the wipe
 * would fix the count and keep the leak for every sweep that fails: a record whose bytes are gone and whose thirty
 * nights are still in the bucket, which is the one state an owner who pressed "delete" can never repair. Thrown first,
 * the record is whole, the owner is told it did not delete, and asking again runs the same steps.
 *
 * THE FINAL COPY FIRST, while there is still a record to copy. `53 §5.9` step 1 put it inside the prefix step 4
 * deletes, so as written it lived for the length of the request. Here the sweep keeps exactly the key the final copy
 * was written under, and the night's walk expires it once `FINAL_KEPT_DAYS` have passed (`nightly.ts`).
 *
 * THE ALARM BEFORE `deleteAll`, AND BY NAME. `deleteAll()` clears it too at the compatibility date this Worker runs on,
 * and the explicit call is what keeps that true if the date is ever moved back (`alarm.test.ts` checks the date).
 *
 * THE DIRECTORY LAST, AND ITS REFUSAL IS THROWN. A record whose bytes are gone and whose name still resolves is a
 * name that opens an empty record, and saying "deleted" over that would be the record agreeing with itself.
 */

import { filesPrefix } from './files.ts';
import { sealedPrefix } from './sealed.ts';
import { prefixOf, type Blobs } from './snapshots.ts';

/**
 * How long a deleted record's final copy is kept, in days. THE OWNER'S CHOICE, NOT YET MADE.
 *
 * The choice is none, a day, or thirty, because it is a promise to customers and the
 * sentence Settings shows before a delete (`deleteCosts` in `apps/web/src/lib/copy.ts`) must say the same number.
 * Thirty stands until he answers: it is `53 §5.9`'s "by day +30 nothing of the record remains anywhere", and
 * it is the PITR window, so the final copy and the platform's own history of the object end on the same day.
 */
export const FINAL_KEPT_DAYS = 30;

/** The same, in milliseconds, for the night's cutoff. */
export const FINAL_KEPT_MS = FINAL_KEPT_DAYS * 86_400_000;

/** What a final copy's name starts with, inside the record's prefix: `final-2026-09-23.brainl.age`. */
export const FINAL = 'final-';

/**
 * R2's ceiling on the keys one `delete` names.
 *
 * A CALL OVER IT IS REFUSED WHOLE, so a sweep that handed over every key of a large prefix at once would delete none
 * of them and throw, which is safe and is also a record nobody can delete. A record's copies are thirty-one objects at
 * most, thirty nights and `latest` (`KEEP` in `snapshots.ts`); the ceiling matters for a prefix something else has been writing into.
 */
const DELETE_BATCH = 1000;

/** The two storage methods deletion needs, so a test can hold the order without a Durable Object. */
export type Wipe = { deleteAlarm(): Promise<void>; deleteAll(): Promise<void> };

/** The Directory's `close`: `null` once every name the record had is released, a refusal otherwise. */
export type Close = (record: string) => Promise<{ code: string; fix: string } | null>;

/** What a deleted record answers from then on, on every door it has. */
export const DELETED = { code: 'RECORD_UNAVAILABLE', fix: 'This BrainDog was deleted.', at: 'record' } as const;

/**
 * The bucket's half of a deletion: the copy to keep, and the prefix to empty around it.
 *
 * `final` WRITES THE COPY AND ANSWERS ITS KEY, and it is injected because writing a sealed copy is `snapshots.ts`'s job
 * and not this file's (in the Worker it is the copies port's `take('final')`). The key must lie under the record's
 * prefix and start `final-`, which is where `expireFinal` looks for it; a key anywhere else is refused before the sweep
 * runs, because it would be a copy no night ever expires.
 */
export type Swept = {
  blobs: Pick<Blobs, 'list' | 'delete'>;
  final: (record: string) => Promise<string>;
};

/** Every key under a prefix, across every page R2 hands back. */
async function keysUnder(blobs: Pick<Blobs, 'list'>, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await blobs.list({ prefix, ...(cursor === undefined ? {} : { cursor }) });
    for (const object of page.objects) keys.push(object.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return keys;
}

/**
 * Deletes every key under `prefix` except `keep`, then lists the prefix again and throws unless `keep` is all there is.
 *
 * THE KEYS ARE LISTED WHOLE BEFORE THE FIRST DELETE. Deleting page by page while following the cursor asks R2 to
 * continue a listing whose earlier half no longer exists, and the answer to that is not something to find out on a
 * customer's record.
 *
 * THE COPY TO KEEP IS LOOKED FOR IN THE FIRST LISTING, BEFORE ANYTHING IS DELETED. The first version looked only in
 * the second, so a final copy the bucket did not hold was noticed after every night had gone: the owner was told the
 * delete failed and kept a record with no copy to go back to (`destroy.test.ts`). That is also exactly what a caller
 * produces by answering the copy's id, `final-2026-09-23`, where the key is meant, which is what `copies.ts`'s `take`
 * returns.
 *
 * AND THE SECOND LISTING IS THE PROOF, NOT THE DELETE'S ANSWER. R2 takes a delete of a key it does not hold without
 * complaint, so a delete that returned says nothing about what is left; the listing does.
 */
async function sweep(blobs: Pick<Blobs, 'list' | 'delete'>, prefix: string, keep: string | null): Promise<number> {
  const before = await keysUnder(blobs, prefix);
  if (keep !== null && !before.includes(keep))
    throw new Error(`The final copy ${keep} is not in the bucket after it was written, so nothing was deleted. Run the delete again.`);
  const doomed = before.filter((key) => key !== keep);
  for (let i = 0; i < doomed.length; i += DELETE_BATCH) await blobs.delete(doomed.slice(i, i + DELETE_BATCH));
  const left = await keysUnder(blobs, prefix);
  const stray = left.filter((key) => key !== keep);
  if (stray.length > 0)
    throw new Error(`${String(stray.length)} object${stray.length === 1 ? '' : 's'} under ${prefix} survived the sweep, so nothing else was deleted. Run the delete again.`);
  if (keep !== null && !left.includes(keep))
    throw new Error(`The final copy ${keep} is not in the bucket after it was written, so nothing else was deleted. Run the delete again.`);
  return doomed.length;
}

/**
 * The night's expiry of one closed record's copies: everything under its prefix, and the count deleted.
 *
 * THE WHOLE PREFIX AND NOT ONLY `final-*`, and the reason is measured rather than tidy. Every record deleted before
 * this file swept left its nightly copies and `latest` behind (§5: 2 objects before, 2 after), and those records are
 * closed in the Directory like any other. A record closed longer ago than `FINAL_KEPT_DAYS` has no copy anybody is
 * owed, and its prefix is the one place those leftovers are ever going to be found. The same listing proves it empty.
 */
export async function expireFinal(blobs: Pick<Blobs, 'list' | 'delete'>, record: string): Promise<number> {
  /* AND ITS FILES, for the same measured reason: a record deleted before the file store's prefix was swept at delete
     left its files at `<record>/a/`, and a closed record's prefix is the one place anybody will find them. Its sealed
     files' parts likewise, at `<record>/sealed/`. */
  return (await sweep(blobs, prefixOf(record), null)) + (await sweep(blobs, filesPrefix(record), null)) + (await sweep(blobs, sealedPrefix(record), null));
}

/**
 * What a delete kept and what it took: the final copy's key, which starts `final-` inside the record's
 * prefix, and how many other copies and files the sweep deleted. THE KEY IS A NAME AND NOT A SECRET: the bytes behind
 * it are sealed, and the owner is owed knowing which copy is kept for `FINAL_KEPT_DAYS` and nothing else.
 */
export type Deleted = { kept: string; removed: number };

/**
 * Deletes a record: final copy, sweep, alarm, bytes, names. Answers what it kept, or `undefined` where no bucket was
 * handed, since nothing was kept then and a delete must never say it kept a copy it did not.
 *
 * `copies` ABSENT IS THE WORKER AS IT IS WIRED TODAY, which hands this no bucket, and it keeps the order it had: the
 * copies stay in R2, as was measured. Passing the Worker's bucket and its copies port is still to be wired; nothing here
 * should be read as the Cloud already sweeping until that lands.
 */
export async function destroyRecord(storage: Wipe, close: Close, record: string | null, copies?: Swept): Promise<Deleted | undefined> {
  /* A RECORD WITH NO IDENTITY HAS NO PREFIX, because the prefix is its id. Such an object never finished `createRecord`,
     the walk lists records by the Directory's ids, and so nothing was ever copied under a name it does not have. */
  let answer: Deleted | undefined;
  if (copies && record !== null) {
    const kept = await copies.final(record);
    const prefix = prefixOf(record);
    if (!kept.startsWith(`${prefix}${FINAL}`))
      throw new Error(`The final copy was written to ${kept}, outside ${prefix}${FINAL}, where no night would ever expire it. Nothing was deleted.`);
    let removed = await sweep(copies.blobs, prefix, kept);
    /* THE RECORD'S FILES GO WITH ITS COPIES, before the bytes and for the same reason: a file whose row is gone
       is a photo of somebody's receipt that nothing names and nobody can delete, and a failed sweep throws while the
       record is still whole. None is kept: the final copy holds each file's name and not its bytes, so a record put
       back from it within the thirty days comes back with its facts and without its files. */
    removed += await sweep(copies.blobs, filesPrefix(record), null);
    /* AND ITS SEALED FILES, which nothing but the record names and the final copy names without their bytes. A record put
       back from that copy lists them as not whole, and the owner's machines put them again. */
    removed += await sweep(copies.blobs, sealedPrefix(record), null);
    answer = { kept, removed };
  }
  await storage.deleteAlarm();
  await storage.deleteAll();
  if (record === null) return answer;
  const refused = await close(record);
  if (refused) throw new Error(`The record's data was deleted, and its name was not released: ${refused.fix}`);
  return answer;
}
