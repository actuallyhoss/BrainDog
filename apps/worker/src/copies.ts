/**
 * One hosted record's copies as the record's own `Snapshots` port (`33 §1` port 9), and going back
 * to one through the Durable Object's point-in-time recovery.
 *
 * WHERE THIS RUNS: INSIDE THE RECORD'S DURABLE OBJECT, handed to `createRecordApi` as `snapshots`
 * the way `sql` and `clock` are. It has to be there. `onNextSessionRestoreBookmark` belongs to the
 * object's own `ctx.storage` and nothing outside the object can call it, and the record takes its
 * `before-restore` copy in the same call that arms the restore, so the copy and the bookmark are
 * one moment and not two ends of a round trip to the Worker with writes landing in between. The
 * nightly walk is unchanged: it still asks the object for a dump and puts it from the Worker with
 * `r2Snapshots` (`snapshots.ts`), and a night taken through this port lands under the same key.
 *
 * WHY THAT STILL KEEPS THE RECORD FREE OF I/O. `packages/record` names no bucket, imports no
 * binding and reaches no storage method; it calls `take`, `list` and `restore` on whatever the host
 * handed it, which is how `test/copies.test.ts` hands it a Map and three methods. The R2 binding and
 * the storage are the host half of the object, built beside the record in `index.ts`, and what
 * this port holds is the age RECIPIENT, a public key: nothing here can open a copy it wrote, which
 * is what `12 §8` asks of the Cloud and why a restore goes back by bookmark rather than by
 * decrypting.
 *
 * WHAT THIS DOES NOT DO IS RESTART THE OBJECT, AND THE CALLER MUST. `onNextSessionRestoreBookmark`
 * restores nothing now; it restores the next time the object starts. `51 §5.14` has the host call
 * `ctx.abort()` straight after, and `restore.pitr` written on the fresh object (`51 D15`). Left
 * armed and never aborted, the record would go back at whatever eviction came next, hours later,
 * over everything written since. That wiring is `index.ts`'s and not this file's.
 *
 * AND NONE OF THE RESTORE HALF HAS RUN ON A REAL DURABLE OBJECT. Local workerd throws "does not
 * implement point-in-time recovery" for both restore methods
 * (measured), so the test drives a fake storage, and the proof is one restore on alpha.
 */

import type { Snapshot, Snapshots } from '@braindog/ports';

import { KEEP, prefixOf, r2Snapshots, type Blobs, type Dump, type Fixed, type Seal, type StreamBlobs } from './snapshots.ts';

/**
 * How far back a copy can be gone back to in place: thirty days, the window Cloudflare keeps a
 * Durable Object's point-in-time history for (`53 §5.4`). The walk keeps thirty nights, so the
 * oldest night sits at the edge of it and is refused the day it crosses.
 */
export const WINDOW = 30 * 86_400_000;

/**
 * The two PITR methods of `DurableObjectStorage` this uses, and not the third.
 *
 * `getBookmarkForTime` IS LEFT OUT ON PURPOSE. A copy is gone back to by the bookmark it recorded
 * when it was dumped. Looking one up by the copy's instant lands after the dump, on whatever was
 * written while the copy was being sealed and put, which is a record the copy does not hold.
 */
export type Pitr = {
  getCurrentBookmark(): Promise<string>;
  onNextSessionRestoreBookmark(bookmark: string): Promise<string>;
};

/** A copy as this port lists it: the port's shape, plus what its metadata says. */
export type CloudCopy = Snapshot & { label: string; rows?: number; bookmark?: string };

/** The record's own rule for a label (`packages/record` `snapshot`), checked again because it becomes a key. */
const LABEL = /^[a-z][a-z0-9-]{0,23}$/u;

/** `nightly-2026-09-23`, `now-2026-09-23`, `before-restore-2026-09-23-2`, under either extension. */
const COPY = /^([a-z][a-z0-9-]*?)-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.brainl(?:\.age)?$/u;

/* THE SAME NUMERIC ORDER AS THE SELF-HOST'S, for the same measured reason: by name, `-10` sorts
   before `-2`, and a prune that read the names as text deleted a newer copy and kept an older one. */
const NATURAL = new Intl.Collator('en', { numeric: true });

/** The label a deploy's restore point is taken under, alone or with the commit after it: `before-deploy-1a2b3c4`. */
export const BEFORE_DEPLOY = 'before-deploy';

/** How long a deploy's restore point is kept: seven days, enough to go back past a bad week of pushes. */
export const BEFORE_DEPLOY_KEPT = 7 * 86_400_000;

const isBeforeDeploy = (label: string): boolean => label === BEFORE_DEPLOY || label.startsWith(`${BEFORE_DEPLOY}-`);

const said = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The `Snapshots` port for one record on the Cloud.
 *
 * `dump` IS A FUNCTION BECAUSE THE PORT IS BUILT BEFORE THE RECORD, since `createRecordApi` is what
 * takes it. `Record$` passes `(at, bookmark) => dumpOf(api, at, bookmark)` with `api` filled in once
 * the record exists, which is what the test does too.
 */
export function cloudSnapshots(
  blobs: Blobs | StreamBlobs,
  storage: Pitr,
  dump: (at: string, bookmark: string | undefined) => Promise<Dump>,
  o: { record: string; now: () => number; recipient?: string | undefined; seal?: Seal | undefined; fixed?: Fixed | undefined },
): Snapshots & { readonly reopens: true; list(): Promise<CloudCopy[]> } {
  const r2 = r2Snapshots(blobs, { recipient: o.recipient, seal: o.seal, fixed: o.fixed });
  const prefix = prefixOf(o.record);
  /* THE COPY THE RECORD TOOK JUST BEFORE ARMING, named in the receipt so the two can be found
     together. Memory is enough: the record takes it and calls `restore` in one call. */
  let before: string | undefined;

  /**
   * Every copy under the prefix, with its metadata, paged.
   *
   * ONE LISTING WITH `include` AND NOT A `head` PER COPY. R2 carries `customMetadata` in a listing
   * only when asked, and `r2Snapshots` never asks (its list was measured with
   * no bookmark and every instant at midnight). Forty-odd copies is one page either way.
   */
  const held = async (): Promise<(CloudCopy & { key: string })[]> => {
    const all: (CloudCopy & { key: string })[] = [];
    let cursor: string | undefined;
    do {
      const page = await blobs.list({ prefix, include: ['customMetadata'], ...(cursor === undefined ? {} : { cursor }) });
      for (const object of page.objects) {
        const name = object.key.slice(prefix.length);
        const m = COPY.exec(name);
        if (!m) continue;
        const meta = object.customMetadata ?? {};
        const rows = Number(meta.rows);
        all.push({
          key: object.key,
          id: name.slice(0, name.indexOf('.')),
          label: m[1] ?? '',
          at: meta.at ?? `${m[2] ?? ''}T00:00:00.000Z`,
          bytes: object.size,
          ...(meta.rows !== undefined && Number.isFinite(rows) ? { rows } : {}),
          ...(meta.bookmark ? { bookmark: meta.bookmark } : {}),
        });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
    return all.sort((a, b) => (a.at === b.at ? NATURAL.compare(b.id, a.id) : a.at < b.at ? 1 : -1));
  };

  /**
   * Copies not taken by the night: the newest `keep` stay, and the rest go.
   *
   * A RESTORE POINT A DEPLOY TOOK IS KEPT BY AGE AND NOT BY COUNT (`restore-point.ts`, LCH-C06): seven days, and it is
   * left out of the `keep` the other labels share, so a week of pushes never pushes out a copy somebody took on purpose.
   */
  const pruneOthers = async (keep: number): Promise<void> => {
    const others = (await held()).filter((c) => c.label !== 'nightly');
    const now = o.now();
    const doomed = [
      ...others.filter((c) => isBeforeDeploy(c.label) && !(now - Date.parse(c.at) <= BEFORE_DEPLOY_KEPT)),
      ...others.filter((c) => !isBeforeDeploy(c.label)).slice(keep),
    ].map((c) => c.key);
    if (doomed.length > 0) await blobs.delete(doomed);
  };

  return {
    /* `reopens` TELLS THE RECORD THAT `restore` ENDS THIS OBJECT (`ReopeningSnapshots` in
       `packages/record`). Without it the record took this port for one that puts rows back in place,
       reloaded, and wrote `restore.pitr` into the object PITR is about to replace: measured as one
       row by `test/copies.test.ts` before the flag. The event belongs on the reopened object, where
       the host calls `restored`. */
    reopens: true as const,

    list: async () => (await held()).map(({ key: _, ...copy }) => copy),

    /**
     * A copy now, sealed and put as `<label>-<date>`, with the bookmark the object is at.
     *
     * NIGHTLY IS THE ONLY LABEL THE THIRTY NIGHTS COUNT. A night moves `latest` and prunes nights,
     * exactly as the walk does, and is the same object the walk would have written. Every other
     * label is kept apart, thirty of its own, as the self-host keeps them (`apps/selfhost/src/
     * snapshots.ts` `KEEP`): a month of nights never pushes out a copy somebody took on purpose,
     * and a copy taken by hand never pushes out a night. A `before-restore` copy prunes nothing, so
     * the copy about to be gone back to cannot be the one it pushes out. A deploy's `before-deploy` copy is kept seven
     * days and never counts as a night or among the thirty (`pruneOthers`).
     *
     * A SECOND COPY WITH ONE LABEL ON ONE DAY IS NUMBERED, `-2`, and never put over the first. The
     * key has only the day in it, and two restores in one afternoon would otherwise leave one
     * `before-restore` copy, the second, and lose the state from before either. A night is the
     * exception: a retried night replaces the night, as the walk's has always done.
     */
    async take(label: string): Promise<Snapshot> {
      if (!LABEL.test(label)) throw new Error(`A label is one short lower-case word, such as nightly or final, and ${JSON.stringify(label)} is not.`);
      const at = new Date(o.now()).toISOString();
      const day = at.slice(0, 10);
      /* THE BOOKMARK BEFORE THE DUMP, as `Record$.dump` takes it, and a storage with no PITR still
         gets its copy: it is a file that imports, only not one to go back to in place. */
      let bookmark: string | undefined;
      try {
        bookmark = await storage.getCurrentBookmark();
      } catch {
        bookmark = undefined;
      }
      const dumped = await dump(at, bookmark);

      if (label === 'nightly') {
        const id = `nightly-${day}`;
        const kept = await r2.write(o.record, id, dumped, true);
        await r2.prune(o.record);
        return { id, at, bytes: kept.stored };
      }
      const taken = new Set((await held()).map((c) => c.id));
      let id = `${label}-${day}`;
      for (let n = 2; taken.has(id); n++) id = `${label}-${day}-${String(n)}`;
      const kept = await r2.write(o.record, id, dumped, false);
      if (label === 'before-restore') before = id;
      else await pruneOthers(KEEP);
      return { id, at, bytes: kept.stored };
    },

    /**
     * Arms the object to come back at the copy's own bookmark on its next start, and keeps the way
     * back in the bucket.
     *
     * THE UNDO BOOKMARK GOES TO R2 AND NOWHERE ELSE. `onNextSessionRestoreBookmark` answers with a
     * bookmark for the moment just before the restore, which is the exact way back. The object's
     * storage is what is about to be rewound and its memory goes with the restart, so a receipt
     * beside the copies, `restore-<instant>.json`, is the one place it survives. It is not a copy and
     * is never listed as one.
     *
     * A RECEIPT THE BUCKET REFUSED CALLS THE RESTORE OFF. Throwing with the restore still armed would
     * tell the owner it did not happen and then do it at the next eviction. Arming the undo bookmark
     * points the next start at now, which is nothing changed.
     */
    async restore(id: string): Promise<void> {
      const copy = (await held()).find((c) => c.id === id);
      if (!copy) throw new Error(`${id} is not one of the copies this record keeps.`);
      if (copy.bookmark === undefined)
        throw new Error(
          `${id} was taken with no point-in-time bookmark, so the record cannot be put back to it in place. Nothing was changed. The copy is still a file that opens with the backup identity and imports.`,
        );
      if (!(o.now() - Date.parse(copy.at) <= WINDOW))
        throw new Error(
          `${id} is more than thirty days old, and the Cloud keeps the history a restore in place needs for thirty days. Nothing was changed. The copy is still a file that opens with the backup identity and imports.`,
        );

      const undo = await storage.onNextSessionRestoreBookmark(copy.bookmark);
      const at = new Date(o.now()).toISOString();
      const receipt = { to: id, bookmark: copy.bookmark, undo, ...(before === undefined ? {} : { before }), at };
      try {
        await blobs.put(`${prefix}restore-${at.replace(/[:.]/gu, '-')}.json`, JSON.stringify(receipt), { customMetadata: receipt });
      } catch (e) {
        try {
          await storage.onNextSessionRestoreBookmark(undo);
        } catch (again) {
          throw new Error(
            `The record is set to go back to ${id} when it next starts, and neither the way back nor calling it off could be done: ${said(e)}; ${said(again)}. The way back is bookmark ${undo}.`,
          );
        }
        throw new Error(`The way back from ${id} could not be written down, so the restore was called off and nothing will change: ${said(e)}`);
      }
    },

    async prune(keep: number): Promise<void> {
      await r2.prune(o.record, keep);
      await pruneOthers(keep);
    },
  };
}
