/**
 * The hosted record's nightly copy, over a fake R2 bucket.
 *
 * WHAT IS ASSERTED HERE IS THE THING THAT GOES WRONG SILENTLY. A backup subsystem has one failure
 * mode that matters, and it is not a crash: it is a night where nothing was written and nothing
 * said so. So the four tests below are the four ways that happens — a bucket that refused the put,
 * a dump over the ceiling, a deployment that names an age recipient this build cannot seal to, and
 * a copy that was written but cannot be read back.
 *
 * THE ROUND TRIP IS AGAINST A REAL RECORD, not a fixture string: `createRecordApi` over
 * `node:sqlite`, the same SQLite a Durable Object runs, with the three wrapped keys the Worker
 * provisions and the Worker's own signer. `checkBrainl` is the reader every importer uses, and an
 * unsigned file fails it (`41 §5.11` step 3), so the round trip is also the proof that the hosted
 * export is signed at all. It was not before this change: `createRecordApi` in the Worker was
 * called without `sign`, so every hosted `.brain` was a file nothing would import.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkBrainl } from '@braindog/kernel';
import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { keyStoreOf, recordKeys, type KeyStore } from '../src/keys.ts';
import { workerSigner } from '../src/sign.ts';
import { CEILING, KEEP, LATEST, dumpOf, r2Snapshots, snapshotKey, type Blobs } from '../src/snapshots.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAO';
const NOW = Date.UTC(2026, 8, 20, 3, 17);
/** What an unsealed copy is called, so the test below can assert that none of them is left. */
const PLAIN_EXT = '.brainl';
const AT = new Date(NOW).toISOString();

/** A root key for one test, made in memory and written nowhere. */
const testStore = async (): Promise<KeyStore> =>
  (await keyStoreOf(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'))) ?? assert.fail('no store');

/** The five methods `snapshots.ts` asks of R2, over a Map, with a log of what was actually put. */
function bucket(fail?: (key: string) => string | null) {
  const held = new Map<string, { body: string; size: number; meta: Record<string, string> }>();
  const blobs: Blobs & { held: typeof held } = {
    held,
    put(key, value, options) {
      const why = fail?.(key);
      if (why) return Promise.reject(new Error(why));
      const body = typeof value === 'string' ? value : new TextDecoder().decode(value as Uint8Array);
      held.set(key, { body, size: body.length, meta: options?.customMetadata ?? {} });
      return Promise.resolve(null);
    },
    get(key) {
      const object = held.get(key);
      return Promise.resolve(object ? { size: object.size, text: () => Promise.resolve(object.body) } : null);
    },
    list(options) {
      const prefix = options?.prefix ?? '';
      const objects = [...held.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({ key, size: object.size }))
        .sort((a, b) => (a.key < b.key ? -1 : 1));
      return Promise.resolve({ objects, truncated: false as const });
    },
    delete(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) held.delete(key);
      return Promise.resolve();
    },
  };
  return blobs;
}

/** A record with its three keys wrapped, and the signer the Worker hands `createRecordApi`. */
async function record() {
  const sql = openSqlite();
  const store = await testStore();
  const api = await createRecordApi({
    sql,
    clock: fixedClock(NOW),
    sign: workerSigner(sql, () => Promise.resolve(store), () => REC),
  });
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: OWNER, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  return { api, sql };
}

test('A NIGHTLY COPY IS WRITTEN, AND IT READS BACK THROUGH THE IMPORTER', async () => {
  // The whole promise in one assertion: the bytes in R2 are a `.brain` file that `checkBrainl`
  // accepts, which is the same check `kernel.import` runs before it writes a row. An export whose
  // manifest or signature does not verify is a backup that cannot be restored, and nothing about
  // writing it to a bucket would have said so.
  const { api } = await record();
  const blobs = bucket();
  const kept = await r2Snapshots(blobs).take(REC, await dumpOf(api, AT));

  assert.equal(kept.key, snapshotKey(REC, AT));
  assert.ok(kept.rows > 0, 'a copy of a record with an owner in it carried no rows');
  assert.equal(blobs.held.size, 2, 'the dated key and latest are both written, so a restore never has to guess');
  assert.ok(blobs.held.has(`${REC}/snapshots/${LATEST}`));
  assert.equal(blobs.held.get(kept.key)?.meta.rows, String(kept.rows));
  assert.equal(blobs.held.get(kept.key)?.meta.at, AT);

  const read = blobs.held.get(`${REC}/snapshots/${LATEST}`)?.body ?? '';
  const sound = await checkBrainl(read.split('\n'));
  assert.ok(sound.ok, JSON.stringify(sound));
});

test('A PUT THAT FAILED IS THROWN, NEVER SWALLOWED, and nothing is left claiming a copy was taken', async () => {
  // The worst bug this file can have. A `take` that caught its own error would leave last night's
  // `latest` in place, the list would show a copy, and the record would have been unbacked for as
  // long as the bucket was refusing writes.
  const { api } = await record();
  const blobs = bucket((key) => (key.endsWith(LATEST) ? 'the bucket said no' : null));
  const dump = await dumpOf(api, AT);
  await assert.rejects(() => r2Snapshots(blobs).take(REC, dump), /the bucket said no/u);
});

test('A DUMP OVER THE CEILING IS REFUSED BEFORE IT IS BUFFERED TWICE', async () => {
  // `51 §5.12` step 3: over 40 MiB the snapshot throws rather than tries. The Worker holds the whole
  // file in memory to sign it, and a 128 MiB record would take the invocation down with an
  // out-of-memory the operator reads as a platform fault instead of a record that outgrew the path.
  const blobs = bucket();
  const huge = { text: 'x'.repeat(CEILING + 1), rows: 1, at: AT };
  await assert.rejects(() => r2Snapshots(blobs).take(REC, huge), /40 MiB/u);
  assert.equal(blobs.held.size, 0, 'the refusal still wrote something');
});

test('A DEPLOYMENT THAT NAMES AN AGE RECIPIENT NEVER GETS A PLAINTEXT COPY', async () => {
  // `53 §5.4`: a cloud copy is sealed to exactly one recipient, and the identity lives outside
  // Cloudflare. This build cannot seal, so the only two honest answers are a loud refusal or no
  // recipient at all. Writing the plaintext under a name that ends `.age` is the third answer, and
  // it is the one that gets a record's whole vault read by whoever can list a bucket.
  const blobs = bucket();
  await assert.rejects(
    () => r2Snapshots(blobs, { recipient: 'age1qqqqqq' }).take(REC, { text: 'x', rows: 1, at: AT }),
    /seal/u,
  );
  assert.equal(blobs.held.size, 0);
});

test('THIRTY DATED COPIES ARE KEPT AND LATEST IS NEVER ONE OF THEM', async () => {
  // The self-host keeps thirty (`apps/selfhost/src/snapshots.ts` `KEEP`, `53 §5.4`), so the cloud
  // keeps thirty: two answers to "how far back does this go" is one answer too many. `latest` is
  // outside the count because it is a pointer, and a prune that counted it would throw away a
  // night's copy every month for ever.
  const blobs = bucket();
  const snapshots = r2Snapshots(blobs);
  const nights = Array.from({ length: KEEP + 5 }, (_, n) => new Date(Date.UTC(2026, 7, 1, 3, 17) + n * 86_400_000).toISOString());
  for (const at of nights) await snapshots.take(REC, { text: `#dogl 1\n["${at}"]`, rows: 1, at });

  const kept = await snapshots.list(REC);
  assert.equal(kept.length, KEEP, 'the list is the dated copies, and there are thirty of them');
  assert.equal(kept[0]?.id, `nightly-${(nights[nights.length - 1] ?? '').slice(0, 10)}`, 'the newest is first');
  assert.ok(blobs.held.has(`${REC}/snapshots/${LATEST}`), 'latest was pruned with the dated keys');
  assert.ok(!blobs.held.has(snapshotKey(REC, nights[0] ?? '')), 'the oldest of thirty-five was kept');
});

test('THE DAY THE SEALER ARRIVES, RETENTION IS STILL THIRTY AND THE PLAINTEXT DRAINS AWAY', async () => {
  // MEASURED AGAINST THE BUILD BEFORE THIS FIX: thirty plaintext nights then eight sealed ones left
  // THIRTY-EIGHT dated objects in the bucket, and it would have gone on growing for ever. `prune`
  // rebuilt each doomed key from the parsed date plus the extension this build would write TODAY,
  // so the moment the extension changed it was deleting `nightly-2026-08-03.brainl.age`, which had
  // never been written. R2 takes a delete of an absent key without complaint, so retention stopped
  // and nothing said so.
  //
  // AND THE HALF THAT MATTERS MORE THAN THE COUNT: the objects that survived were the UNSEALED
  // ones, in a bucket whose operator had just turned sealing on. That is the harm the recipient
  // refusal above exists to prevent, arriving from the other direction. What the fix promises is
  // not that they vanish the same night, which would be throwing away last month's real backups,
  // but that the ordinary thirty-night window carries them out, and that the plaintext POINTER
  // goes at once, because the moment a sealed copy is written it is what `latest` is not.
  const blobs = bucket();
  const night = (n: number): string => new Date(Date.UTC(2026, 7, 1, 3, 17) + n * 86_400_000).toISOString();
  const plaintext = (): string[] => [...blobs.held.keys()].filter((key) => key.endsWith(PLAIN_EXT)).sort();

  const plain = r2Snapshots(blobs);
  for (let n = 0; n < KEEP; n++) await plain.take(REC, { text: `#dogl 1\n["${night(n)}"]`, rows: 1, at: night(n) });
  assert.equal((await plain.list(REC)).length, KEEP, 'thirty plaintext nights');

  /* The sealer this build cannot build, stood in for by the one transform that proves the seam:
     the extension changes, the bytes go through it, and nothing else about the night does. */
  const sealed = r2Snapshots(blobs, { recipient: 'age1qqqqqq', seal: (f) => Promise.resolve(f) });
  for (let n = KEEP; n < KEEP + 8; n++) await sealed.take(REC, { text: `#dogl 1\n["${night(n)}"]`, rows: 1, at: night(n) });

  const kept = await sealed.list(REC);
  assert.equal(kept.length, KEEP, 'the transition left more than thirty dated copies in the bucket');
  assert.equal(kept[0]?.id, `nightly-${night(KEEP + 7).slice(0, 10)}`, 'the newest is first');
  assert.equal(plaintext().length, KEEP - 8, 'the eight oldest plaintext nights were pruned, and the pointer with them');
  assert.ok(blobs.held.has(`${REC}/snapshots/latest.brainl.age`), 'the sealed pointer was written');
  assert.ok(!blobs.held.has(`${REC}/snapshots/${LATEST}`), 'the plaintext pointer outlived the switch to sealing');

  /* AND THIRTY MORE NIGHTS EMPTIES IT, which is the whole claim: the window carries the unsealed
     copies out rather than any one night having to sweep them. */
  for (let n = KEEP + 8; n < KEEP + 8 + KEEP; n++) await sealed.take(REC, { text: `#dogl 1\n["${night(n)}"]`, rows: 1, at: night(n) });
  assert.deepEqual(plaintext(), [], 'an unsealed copy outlived its thirty nights');
  assert.equal((await sealed.list(REC)).length, KEEP);
});
