/**
 * The mail door's attachments, against the record's day of file bytes: a mailbox is no way round what a person
 * uploading is held to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fileKeeper } from '../src/email.ts';
import type { FileBucket } from '../src/files.ts';

const PNG = (n: number): Uint8Array => {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes[63] = n;
  return bytes;
};

function bucket(): FileBucket & { keys: string[] } {
  const held = new Map<string, Uint8Array>();
  return {
    keys: [] as string[],
    async put(key, value) {
      held.set(key, value);
      this.keys.push(key);
    },
    async get() {
      return null;
    },
    async head(key) {
      const v = held.get(key);
      return v === undefined ? null : { size: v.byteLength };
    },
    async delete() {},
  };
}

test('A MAILED FILE SPENDS THE RECORD\'S DAY OF BYTES, and past it is not kept', async () => {
  const blobs = bucket();
  let left = 100;
  const spent: number[] = [];
  const spend = async (_record: string, n: number) => {
    spent.push(n);
    if (n > left) return new Response(null, { status: 429 });
    left -= n;
    return null;
  };
  const keep = fileKeeper(blobs, spend);
  assert.ok(await keep({ rec: 'rec_fake', name: 'a.png', type: 'image/png', bytes: PNG(1) }));
  /* THE SAME BYTES AGAIN ARE THE SAME FILE: nothing is written and nothing is spent. */
  assert.ok(await keep({ rec: 'rec_fake', name: 'a.png', type: 'image/png', bytes: PNG(1) }));
  assert.equal(await keep({ rec: 'rec_fake', name: 'b.png', type: 'image/png', bytes: PNG(2) }), null);
  assert.deepEqual(spent, [64, 64]);
  assert.equal(blobs.keys.length, 1);
});
