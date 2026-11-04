/**
 * Sealed files' bytes on the Cloud (`sealed.ts`): under the record's own id, never under a name the record did not make,
 * and never where the file door reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sealedName } from '@braindog/record';

import { filesPrefix } from '../src/files.ts';
import { cloudSealed, sealedPrefix, type SealedBucket } from '../src/sealed.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const SHA = 'c'.repeat(64);

function bucket() {
  const held = new Map<string, Uint8Array>();
  const deletes: number[] = [];
  const b: SealedBucket & { held: typeof held; deletes: typeof deletes } = {
    held,
    deletes,
    put: async (key, value) => void held.set(key, Uint8Array.from(value)),
    get: async (key) => {
      const bytes = held.get(key);
      return bytes === undefined ? null : { arrayBuffer: async () => Uint8Array.from(bytes).buffer };
    },
    delete: async (keys) => {
      const list = typeof keys === 'string' ? [keys] : keys;
      deletes.push(list.length);
      for (const key of list) held.delete(key);
    },
  };
  return b;
}

test('A PART IS KEPT UNDER THE RECORD\'S OWN SEALED PREFIX, AND NEVER UNDER ITS FILES', async () => {
  const b = bucket();
  const store = cloudSealed(b, () => REC);
  const name = await sealedName('sync/key', SHA, 0);
  await store.put(name, Uint8Array.of(1, 2, 3));
  assert.deepEqual([...b.held.keys()], [`${sealedPrefix(REC)}${name}`]);
  assert.ok(![...b.held.keys()].some((k) => k.startsWith(filesPrefix(REC))), 'a sealed part is where the file door reads');
  assert.deepEqual(await store.get(name), Uint8Array.of(1, 2, 3));
  assert.equal(await store.get(await sealedName('sync/key', SHA, 1)), null);
  await store.drop([name, await sealedName('sync/other', SHA, 0)]);
  assert.equal(b.held.size, 0);
});

test('A NAME THE RECORD DID NOT MAKE IS NEVER A KEY: a path, a prefix of its own, or a key as it was sent', async () => {
  const b = bucket();
  const store = cloudSealed(b, () => REC);
  for (const name of ['sync/key', `../a/${'a'.repeat(64)}`, `${'a'.repeat(64)}.${SHA}.8`, `${'A'.repeat(64)}.${SHA}.0`])
    await assert.rejects(store.put(name, Uint8Array.of(1)), /named by its key/);
  assert.equal(b.held.size, 0);
});

test('A RECORD NOT CREATED YET KEEPS NOTHING, and the day is asked before a part is kept', async () => {
  const store = cloudSealed(bucket(), () => {
    throw new Error('This BrainDog has not been made yet, so it keeps no sealed files.');
  });
  await assert.rejects(store.put(await sealedName('sync/key', SHA, 0), Uint8Array.of(1)), /not been made yet/);

  const asked: number[] = [];
  const metered = cloudSealed(bucket(), () => REC, async (n) => (asked.push(n), null));
  assert.equal(await metered.spend?.(42), null);
  assert.deepEqual(asked, [42]);
});
