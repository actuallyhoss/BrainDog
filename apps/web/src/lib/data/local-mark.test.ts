/** `local-mark.ts`: the last reader is named only by a marker this browser signed, for its record, while it is young. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { LOCAL_MS } from './local.ts';
import { dropMark, MARK_KEY, memoryKey, readMark, writeMark, type MarkDeps } from './local-mark.ts';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;

function strings() {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
  };
}

const deps = (now = 1_000): MarkDeps & { store: ReturnType<typeof strings> } => ({ store: strings(), subtle, key: memoryKey(subtle), now: () => now });

test('A MARKER WRITTEN IS READ BACK for its record, and names nobody for another', async () => {
  const d = deps();
  await writeMark('https://a', 'p_ada', d);
  assert.equal(await readMark('https://a', d), 'p_ada');
  assert.equal(await readMark('https://b', d), null);
});

test('A MARKER CHANGED BY HAND, OR SIGNED BY ANOTHER KEY, names nobody', async () => {
  const d = deps();
  await writeMark('https://a', 'p_ada', d);
  const raw = JSON.parse(d.store.held.get(MARK_KEY)!) as Record<string, unknown>;
  d.store.held.set(MARK_KEY, JSON.stringify({ ...raw, person: 'p_bo' }));
  assert.equal(await readMark('https://a', d), null, 'another person under the same signature');
  const other = { ...deps(), store: d.store };
  d.store.held.set(MARK_KEY, JSON.stringify(raw));
  assert.equal(await readMark('https://a', other), null, 'a key this browser does not hold');
});

test('AN OLD MARKER, A DROPPED ONE OR ONE WITH NO KEY TO MAKE names nobody', async () => {
  const d = deps(1_000);
  await writeMark('https://a', 'p_ada', d);
  assert.equal(await readMark('https://a', { ...d, now: () => 1_000 + LOCAL_MS }), null, 'as old as the copy may be');
  dropMark(d.store);
  assert.equal(await readMark('https://a', d), null);
  const keyless = { ...deps(), key: async () => null };
  await writeMark('https://a', 'p_ada', keyless);
  assert.equal(keyless.store.held.size, 0, 'nothing written without a key');
});
