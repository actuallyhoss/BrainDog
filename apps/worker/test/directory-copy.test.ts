/**
 * The Directory's nightly copy, sealed and put: `loop/research-restore.md` §6's second half.
 *
 * THE COPY IS ONLY WORTH ITS READ-BACK. So the first test opens what was put with the test identity, the way the drill
 * opens a record's copy, and loads the lines into an empty Directory that must then resolve the name. Everything else
 * is a way the copy exists and cannot be used: a plaintext object in a bucket the operator believes is sealed, a
 * placeholder recipient, and retention that never stops.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '@braindog/record/directory';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { DIRECTORY_COPIES, directoryCopies } from '../src/directory-copy.ts';
import { KEEP, type Blobs } from '../src/snapshots.ts';
import { ageOpen, identity } from './age-open.ts';

const NOW = Date.UTC(2026, 8, 23, 3, 17);
const AT = new Date(NOW).toISOString();
const DAY = 86_400_000;

/** The five `Blobs` methods over a Map, bytes kept as bytes because a sealed copy is not text. */
function bucket(fail?: string) {
  const held = new Map<string, { bytes: Uint8Array; meta: Record<string, string> }>();
  const blobs: Blobs & { held: typeof held } = {
    held,
    put(key, value, options) {
      if (fail && key.includes(fail)) return Promise.reject(new Error('the bucket said no'));
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      held.set(key, { bytes, meta: options?.customMetadata ?? {} });
      return Promise.resolve(null);
    },
    get(key) {
      const object = held.get(key);
      return Promise.resolve(object ? { size: object.bytes.length, text: () => Promise.resolve(new TextDecoder().decode(object.bytes)) } : null);
    },
    list(options) {
      const objects = [...held.entries()]
        .filter(([key]) => key.startsWith(options?.prefix ?? ''))
        .map(([key, o]) => ({ key, size: o.bytes.length }))
        .sort((a, b) => (a.key < b.key ? -1 : 1));
      return Promise.resolve({ objects, truncated: false });
    },
    delete(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) held.delete(key);
      return Promise.resolve();
    },
  };
  return blobs;
}

/** A Directory with one person and one record, and its lines. */
function lines(): { lines: string[]; record: string } {
  const d = createDirectory(openSqlite(), fixedClock(NOW));
  assert.ok(d.person$('ada@example.com', 'Ada').ok);
  const made = d.provision({ slug: 'the-studio', email: 'ada@example.com' });
  if (!made.ok) return assert.fail(JSON.stringify(made));
  return { lines: d.dump(), record: made.value.record };
}

test('THE DIRECTORY IS SEALED UNDER directory/snapshots/, AND THE IDENTITY OPENS IT TO LINES THAT LOAD', async () => {
  const id = identity();
  const blobs = bucket();
  const copy = lines();
  const kept = await directoryCopies(blobs, { recipient: id.recipient }).take(copy.lines, AT);

  assert.equal(kept.key, `${DIRECTORY_COPIES}nightly-2026-09-23.dirl.age`);
  assert.deepEqual([...blobs.held.keys()].sort(), [kept.key, `${DIRECTORY_COPIES}latest.dirl.age`].sort());
  assert.equal(blobs.held.get(kept.key)?.meta.at, AT);
  assert.equal(blobs.held.get(kept.key)?.meta.rows, String(kept.rows));

  const sealed = blobs.held.get(`${DIRECTORY_COPIES}latest.dirl.age`)?.bytes ?? assert.fail('no latest');
  assert.equal(new TextDecoder().decode(sealed.subarray(0, 21)), 'age-encryption.org/v1', 'the copy was not sealed');
  assert.ok(!new TextDecoder().decode(sealed).includes('ada@example.com'), 'an address is readable in the sealed copy');

  const opened = ageOpen(sealed, id).toString('utf8').split('\n');
  const into = createDirectory(openSqlite(), fixedClock(NOW));
  const loaded = into.load(opened);
  assert.ok(loaded.ok, JSON.stringify(loaded));
  assert.deepEqual(into.resolve('the-studio'), { record: copy.record, slug: 'the-studio' });
});

test('A RECIPIENT THAT IS STILL THE PLACEHOLDER STOPS THE COPY BEFORE IT IS TAKEN, and nothing is put', () => {
  // The same rule as a record's copy (`snapshots.ts`): `age1<alpha-recipient>` is a decision nobody has made, and
  // treating it as "unsealed" would be every address on the deployment in plaintext in a bucket.
  const blobs = bucket();
  assert.throws(() => directoryCopies(blobs, { recipient: 'age1<alpha-recipient>' }), /AGE_RECIPIENT/u);
  assert.equal(blobs.held.size, 0);
});

test('THIRTY NIGHTS ARE KEPT, AND AN UNSEALED POINTER LEFT FROM BEFORE SEALING GOES', async () => {
  // Retention that never stops is a bucket that grows by one Directory a night for as long as the deployment runs. And
  // the one leftover that matters is an unsealed `latest`: it would outlive the day sealing was turned on, holding
  // every address in plaintext, because nothing else would ever overwrite that exact key.
  const blobs = bucket();
  const copy = lines();
  const plain = directoryCopies(blobs, { recipient: '' });
  await plain.take(copy.lines, new Date(NOW - 40 * DAY).toISOString());
  assert.ok(blobs.held.has(`${DIRECTORY_COPIES}latest.dirl`));

  const sealed = directoryCopies(blobs, { recipient: identity().recipient });
  for (let night = 34; night >= 0; night--) await sealed.take(copy.lines, new Date(NOW - night * DAY).toISOString());

  const dated = [...blobs.held.keys()].filter((k) => k.includes('/nightly-'));
  assert.equal(dated.length, KEEP);
  assert.ok(dated.includes(`${DIRECTORY_COPIES}nightly-2026-09-23.dirl.age`), 'tonight was pruned');
  assert.ok(!blobs.held.has(`${DIRECTORY_COPIES}latest.dirl`), 'the unsealed pointer outlived sealing');
  assert.ok(blobs.held.has(`${DIRECTORY_COPIES}latest.dirl.age`));
});

test('A PUT THAT FAILED IS THROWN, so the night says the Directory was not copied', async () => {
  const blobs = bucket('latest');
  await assert.rejects(directoryCopies(blobs, { recipient: '' }).take(lines().lines, AT), /the bucket said no/u);
});
