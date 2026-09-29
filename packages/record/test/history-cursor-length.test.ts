/**
 * A sealed cursor is one length whatever rowid it seals.
 *
 * AES-GCM KEEPS THE PLAINTEXT'S LENGTH, and the plaintext was `String(rowid)`. Measured: 41 characters for rowid 7, 45
 * for 1000 and 48 for 100000, so the `s.` cursor a member held to named lists is handed past the 5,000-line walk told
 * her whether the log was past ten thousand events or a hundred thousand. The cursor still opens to the rowid it
 * sealed, at every width.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { historyCursors } from '../src/history-cursor.ts';

const ROWIDS = [1, 7, 42, 999, 1000, 5001, 99_999, 100_000, 1_234_567, 2 ** 40, Number.MAX_SAFE_INTEGER];

test('every sealed cursor has one length', async () => {
  const cursors = await historyCursors();
  const lengths = new Map<number, number>();
  for (const rowid of ROWIDS) lengths.set(rowid, (await cursors.seal(rowid)).length);
  assert.equal(new Set(lengths.values()).size, 1, `lengths by rowid: ${JSON.stringify([...lengths])}`);
});

test('open answers the rowid seal was given, at every width', async () => {
  const cursors = await historyCursors();
  for (const rowid of ROWIDS) assert.deepEqual(await cursors.open(await cursors.seal(rowid)), { rowid });
});

test('another instance still cannot open it', async () => {
  const mine = await historyCursors();
  const theirs = await historyCursors();
  assert.equal(await theirs.open(await mine.seal(7)), null);
});
