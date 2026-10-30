/**
 * Deleting a hosted record: the final copy, the sweep, the alarm, the bytes, then the names, and a name that will not
 * release is not "deleted".
 *
 * THE SWEEP IS HERE BECAUSE IT WAS MEASURED MISSING. `destroyRecord` was run over a bucket
 * holding a record's nightly copy and `latest`, and the bucket held the same 2 objects afterwards; the next walk lists
 * only open records, so nothing ever visited that prefix again. Every test below that names a bucket is a way that
 * failure comes back: copies left, a sweep that half ran and the record gone anyway, or a final copy that was never
 * written while the bytes it was meant to keep were deleted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FINAL_KEPT_DAYS, destroyRecord, expireFinal, type Swept } from '../src/destroy.ts';
import { fileKey } from '../src/files.ts';
import { sealedPrefix } from '../src/sealed.ts';
import { prefixOf } from '../src/snapshots.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OTHER = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HZZ';
const FINAL = `${prefixOf(REC)}final-2026-09-23.brainl.age`;

function fakes(refuse = false) {
  const calls: string[] = [];
  const storage = {
    deleteAlarm: async () => void calls.push('deleteAlarm'),
    deleteAll: async () => void calls.push('deleteAll'),
  };
  const close = async (record: string) => {
    calls.push(`close:${record}`);
    return refuse ? { code: 'OUT_OF_BOUNDS', fix: 'There is no record rec_x.' } : null;
  };
  return { calls, storage, close };
}

/**
 * The two R2 methods a sweep uses, over a sorted Map, paged the way R2 pages: `page` keys at a time, `truncated` and an
 * opaque cursor while there are more. `keep` names a key a delete silently leaves, which is what R2 does with a key it
 * does not have and is the only way a sweep can "succeed" and leave something behind.
 */
function bucket(keys: string[], o: { page?: number; failDelete?: string; keep?: string } = {}) {
  const held = new Set(keys);
  const deletes: number[] = [];
  const blobs = {
    held,
    deletes,
    list(options?: { prefix?: string; cursor?: string }) {
      const all = [...held].filter((k) => k.startsWith(options?.prefix ?? '')).sort();
      const from = Number(options?.cursor ?? 0);
      const size = o.page ?? 1000;
      const objects = all.slice(from, from + size).map((key) => ({ key, size: 1 }));
      const more = from + size < all.length;
      return Promise.resolve(more ? { objects, truncated: true, cursor: String(from + size) } : { objects, truncated: false });
    },
    delete(doomed: string | string[]) {
      const list = typeof doomed === 'string' ? [doomed] : doomed;
      if (o.failDelete) return Promise.reject(new Error(o.failDelete));
      deletes.push(list.length);
      for (const key of list) if (key !== o.keep) held.delete(key);
      return Promise.resolve();
    },
  };
  return blobs;
}

/** A record's two nightly objects, as `r2Snapshots.take` leaves them, and another record's beside them. */
const nightly = (record: string) => [`${prefixOf(record)}nightly-2026-09-22.brainl.age`, `${prefixOf(record)}latest.brainl.age`];

/** The final copy's writer, which records that it ran and puts the key it answers. */
const finalInto = (blobs: { held: Set<string> }, calls: string[], key = FINAL) => async (record: string) => {
  calls.push(`final:${record}`);
  blobs.held.add(key);
  return key;
};

test('A DELETED RECORD LOSES ITS ALARM, THEN ITS BYTES, THEN ITS NAMES, in that order', async () => {
  const { calls, storage, close } = fakes();
  await destroyRecord(storage, close, 'rec_x');
  assert.deepEqual(calls, ['deleteAlarm', 'deleteAll', 'close:rec_x']);
});

test('A NAME THAT WILL NOT RELEASE IS NOT A DELETED RECORD, and a record with no identity has no name to release', async () => {
  const refused = fakes(true);
  await assert.rejects(destroyRecord(refused.storage, refused.close, 'rec_x'), /its name was not released/);
  assert.deepEqual(refused.calls, ['deleteAlarm', 'deleteAll', 'close:rec_x']);

  const bare = fakes();
  await destroyRecord(bare.storage, bare.close, null);
  assert.deepEqual(bare.calls, ['deleteAlarm', 'deleteAll']);
});

test('A DELETED RECORD LEAVES ITS FINAL COPY AND NOTHING ELSE, and the copy is taken before a byte is deleted', async () => {
  // §5's measurement as a test: 2 objects under the prefix before `destroyRecord`, and 2 after. Now the prefix holds
  // exactly the final copy, another record's copies are untouched, and the order is the one that loses nothing: the
  // copy is written while the record still exists to be copied, and the bytes go only once the bucket agrees.
  const { calls, storage, close } = fakes();
  const blobs = bucket([...nightly(REC), ...nightly(OTHER)]);
  const swept: Swept = { blobs, final: finalInto(blobs, calls) };

  await destroyRecord(storage, close, REC, swept);

  assert.deepEqual([...blobs.held].filter((k) => k.startsWith(prefixOf(REC))), [FINAL]);
  assert.deepEqual([...blobs.held].filter((k) => k.startsWith(prefixOf(OTHER))).sort(), nightly(OTHER).sort(), 'another record lost a copy');
  assert.deepEqual(calls, [`final:${REC}`, 'deleteAlarm', 'deleteAll', `close:${REC}`]);
});

test('THE DELETE ANSWERS WHAT IT KEPT AND WHAT IT TOOK: the final copy by its key, and every other copy and file counted', async () => {
  // LCH-A03 step 9 reads this answer: one key kept, named `final-`, and none other under the prefix. Two nights, one
  // file and another record's copies beside them, so a count that took the other record's, or forgot the files, is off.
  const { calls, storage, close } = fakes();
  const file = fileKey(REC, 'a'.repeat(64));
  const blobs = bucket([...nightly(REC), file, ...nightly(OTHER)]);

  const said = await destroyRecord(storage, close, REC, { blobs, final: finalInto(blobs, calls) });

  assert.deepEqual(said, { kept: FINAL, removed: 3 });
  assert.match(said?.kept ?? '', /(^|\/)final-/u);
  assert.ok(!blobs.held.has(file), 'the file outlived its record');
  assert.equal([...blobs.held].filter((k) => k.startsWith(prefixOf(REC))).length, 1);
});

test('A DELETED RECORD TAKES ITS SEALED FILES WITH IT, and the night takes a closed record\'s that were left', async () => {
  const { calls, storage, close } = fakes();
  const part = `${sealedPrefix(REC)}${'b'.repeat(64)}.${'c'.repeat(64)}.0`;
  const theirs = `${sealedPrefix(OTHER)}${'b'.repeat(64)}.${'c'.repeat(64)}.0`;
  const blobs = bucket([...nightly(REC), part, theirs]);
  const said = await destroyRecord(storage, close, REC, { blobs, final: finalInto(blobs, calls) });
  assert.deepEqual(said, { kept: FINAL, removed: 3 });
  assert.ok(!blobs.held.has(part), 'a sealed part outlived its record');
  assert.ok(blobs.held.has(theirs), 'another record lost a sealed part');

  const left = bucket([part]);
  assert.equal(await expireFinal(left, REC), 1);
  assert.equal(left.held.size, 0);
});

test('WITHOUT A BUCKET THE DELETE KEEPS NOTHING AND SAYS NOTHING KEPT, and a record with nothing else answers 0 removed', async () => {
  const bare = fakes();
  assert.equal(await destroyRecord(bare.storage, bare.close, REC), undefined, 'a delete with no bucket said it kept a copy');

  const lone = fakes();
  const blobs = bucket([]);
  assert.deepEqual(await destroyRecord(lone.storage, lone.close, REC, { blobs, final: finalInto(blobs, lone.calls) }), { kept: FINAL, removed: 0 });
});

test('A SWEEP THAT FAILS LEAVES THE RECORD WHOLE: deleteAll is never called over copies that are still there', async () => {
  // The mutation this is written against is the sweep moved after `deleteAll`. Then a bucket that refused the delete
  // leaves a record whose bytes are gone and whose thirty nights are still in R2, which is the §5 leak with an error
  // line beside it. Thrown before the wipe, the owner is told it did not delete and can ask again.
  const { calls, storage, close } = fakes();
  const blobs = bucket(nightly(REC), { failDelete: 'the bucket said no' });

  await assert.rejects(destroyRecord(storage, close, REC, { blobs, final: finalInto(blobs, calls) }), /the bucket said no/u);
  assert.deepEqual(calls, [`final:${REC}`], 'the record was wiped, or its name released, over copies that remain');
});

test('A DELETE THAT ANSWERED AND DID NOT DELETE IS CAUGHT BY LISTING AGAIN, before the wipe', async () => {
  // R2 takes a delete of a key it does not hold without complaint, so "delete returned" is not "the prefix is empty".
  // The prefix is listed a second time and anything but the final copy is a failed sweep.
  const { calls, storage, close } = fakes();
  const stuck = nightly(REC)[0] ?? '';
  const blobs = bucket(nightly(REC), { keep: stuck });

  await assert.rejects(destroyRecord(storage, close, REC, { blobs, final: finalInto(blobs, calls) }), /1 object/u);
  assert.deepEqual(calls, [`final:${REC}`]);
  assert.ok(blobs.held.has(stuck));
});

test('EVERY PAGE OF THE PREFIX IS SWEPT, and no delete names more keys than R2 takes in one call', async () => {
  // Thirty nights and `latest` fit in one page, so a sweep that read one page would pass every test with a real
  // record's shape. 2,500 keys at a page of 1,000 is three pages, and R2's `delete` takes at most 1,000 keys a call.
  const { calls, storage, close } = fakes();
  const many = Array.from({ length: 2_500 }, (_, i) => `${prefixOf(REC)}x-${String(i).padStart(5, '0')}`);
  const blobs = bucket(many, { page: 1000 });

  await destroyRecord(storage, close, REC, { blobs, final: finalInto(blobs, calls) });

  assert.deepEqual([...blobs.held], [FINAL]);
  assert.ok(blobs.deletes.every((n) => n <= 1000), `a delete named ${String(Math.max(...blobs.deletes))} keys`);
  assert.equal(blobs.deletes.reduce((a, b) => a + b, 0), 2_500);
});

test('A FINAL COPY THAT WAS NOT WRITTEN, OR WAS WRITTEN OUTSIDE THE PREFIX, STOPS THE DELETE BEFORE ANYTHING GOES', async () => {
  // A put that throws is a record with no final copy, and deleting its nightly copies then would leave nothing at all.
  // A key outside the record's prefix is a copy the night's expiry never finds, kept for as long as the bucket is.
  const threw = fakes();
  const one = bucket(nightly(REC));
  const failing = async () => Promise.reject(new Error('the put said no'));
  await assert.rejects(destroyRecord(threw.storage, threw.close, REC, { blobs: one, final: failing }), /the put said no/u);
  assert.deepEqual(threw.calls, []);
  assert.equal(one.held.size, 2);

  const astray = fakes();
  const two = bucket(nightly(REC));
  const elsewhere = finalInto(two, astray.calls, 'finals/rec_x.brainl.age');
  await assert.rejects(destroyRecord(astray.storage, astray.close, REC, { blobs: two, final: elsewhere }), /outside/u);
  assert.deepEqual(astray.calls, [`final:${REC}`]);
  assert.equal(two.deletes.length, 0, 'the sweep ran with the final copy somewhere it would not be kept');
});

test('A FINAL COPY THE BUCKET DOES NOT HOLD STOPS THE DELETE BEFORE A NIGHT GOES, and the record keeps its thirty', async () => {
  // The writer answered a key and the key is not in the bucket: a put R2 lost, or a caller that answered the copy's id
  // (`final-2026-09-23`) where the key (`…final-2026-09-23.brainl.age`) was meant, which is what `copies.ts`'s `take`
  // returns. The first version of the sweep deleted every night first and noticed the missing copy on the second
  // listing, so the owner was told the delete failed and kept a record with no copy to go back to. Checked against the
  // first listing now, before any delete.
  const { calls, storage, close } = fakes();
  const blobs = bucket(nightly(REC));
  const lost = async (record: string) => (calls.push(`final:${record}`), FINAL);

  await assert.rejects(destroyRecord(storage, close, REC, { blobs, final: lost }), /not in the bucket/u);
  assert.deepEqual(calls, [`final:${REC}`]);
  assert.equal(blobs.deletes.length, 0, 'the nights were deleted on the strength of a final copy that is not there');
  assert.deepEqual([...blobs.held].sort(), nightly(REC).sort());
});

test('THE FINAL COPY IS KEPT THIRTY DAYS UNTIL THE OWNER DECIDES OTHERWISE', () => {
  // None, a day or thirty is the owner's choice and not yet made. Pinned so that changing it is a
  // decision somebody makes in this file and its test, and `deleteCosts` in the web copy is changed with it.
  assert.equal(FINAL_KEPT_DAYS, 30);
});

/* ARRIVALS KEPT AT THE DOOR FOR A RECORD GO WITH IT. They are sealed webhook bodies, bank texts among them, and they were
   kept for ever, waiting or given up, after the record they were for was erased. */
test('A DELETED RECORD TAKES ITS KEPT ARRIVALS WITH IT, waiting and given up, and the night takes any left', async () => {
  const { calls, storage, close } = fakes();
  const waiting = `held/wait/${REC}/${'d'.repeat(64)}.held`;
  const gaveUp = `held/gave-up/${REC}/${'e'.repeat(64)}.held`;
  const theirs = `held/gave-up/${OTHER}/${'f'.repeat(64)}.held`;
  const blobs = bucket([...nightly(REC), waiting, gaveUp, theirs]);
  const said = await destroyRecord(storage, close, REC, { blobs, final: finalInto(blobs, calls) });
  assert.deepEqual(said, { kept: FINAL, removed: 4 });
  assert.ok(!blobs.held.has(waiting) && !blobs.held.has(gaveUp), 'a kept arrival outlived its record');
  assert.ok(blobs.held.has(theirs), 'another record lost a kept arrival');

  const left = bucket([gaveUp]);
  assert.equal(await expireFinal(left, REC), 1);
  assert.equal(left.held.size, 0);
});
