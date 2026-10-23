/**
 * Visuals on the Cloud (`src/visuals.ts`): a page kept once under the record's files at `a/pages/<sha256>`, never at an
 * address the file door answers, and a picture's length and type read from what the door kept.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fileAsked } from '../src/files.ts';
import { cloudVisuals, pagesPrefix, type VisualBucket } from '../src/visuals.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

function bucket() {
  const held = new Map<string, { bytes: Uint8Array; type?: string }>();
  const puts: string[] = [];
  const b: VisualBucket = {
    put: async (key, value, options) => {
      puts.push(key);
      held.set(key, { bytes: Uint8Array.from(value), ...(options?.httpMetadata?.contentType === undefined ? {} : { type: options.httpMetadata.contentType }) });
    },
    get: async (key) => {
      const one = held.get(key);
      return one === undefined ? null : { arrayBuffer: async () => one.bytes.slice().buffer };
    },
    head: async (key) => {
      const one = held.get(key);
      return one === undefined ? null : { size: one.bytes.byteLength, ...(one.type === undefined ? {} : { httpMetadata: { contentType: one.type } }) };
    },
  };
  return { b, held, puts };
}

test('A PAGE IS KEPT ONCE UNDER THE FILES, BY ITS HASH, AND NO ADDRESS OF THE FILE DOOR READS IT', async () => {
  const { b, puts } = bucket();
  const store = cloudVisuals(b, () => REC);
  const hash = 'e'.repeat(64);
  await store.putPage(hash, new TextEncoder().encode('<h1>Plan</h1>'));
  await store.putPage(hash, new TextEncoder().encode('<h1>Plan</h1>'));
  assert.deepEqual(puts, [`${REC}/a/pages/${hash}`], 'the same bytes again write nothing');
  assert.ok(pagesPrefix(REC).startsWith(`${REC}/a/`), 'inside the prefix a deleted record sweeps');
  assert.equal(new TextDecoder().decode((await store.getPage(hash))!), '<h1>Plan</h1>');
  assert.equal(await store.getPage('f'.repeat(64)), null);
  await assert.rejects(store.putPage('../x', Uint8Array.of(1)), /SHA-256/);
  const asked = fileAsked(`/api/files/pages/${hash}`);
  assert.equal(asked, null, 'the door answers one hash and nothing under it');
});

test("A PICTURE'S LENGTH AND TYPE ARE WHAT THE FILE DOOR KEPT", async () => {
  const { b } = bucket();
  const hash = 'a'.repeat(64);
  await b.put(`${REC}/a/${hash}`, new Uint8Array(1234), { httpMetadata: { contentType: 'image/webp' } });
  const store = cloudVisuals(b, () => REC);
  assert.deepEqual(await store.file(hash), { bytes: 1234, mime: 'image/webp' });
  assert.equal(await store.file('b'.repeat(64)), null);
  assert.equal(await store.file('not-a-hash'), null);
});
