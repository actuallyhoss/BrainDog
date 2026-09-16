/**
 * Deleting a hosted record: the alarm, the bytes, then the names, and a name that will not release is not "deleted".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { destroyRecord } from '../src/destroy.ts';

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
