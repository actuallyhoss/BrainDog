/**
 * Given-up arrivals are kept for the operator for thirty days and then deleted by the nightly sweep; they were kept for
 * ever. And the operator's mail about a door is quiet per reason, so a burst of junk give-ups does not use up the window
 * the give-up of a real arrival is mailed in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HELD_GAVE_UP, HELD_GAVE_UP_MS, pruneGaveUp, type HeldBucket } from '../src/held.ts';
import { opsSlot } from '../src/mail.ts';

const NOW = Date.UTC(2026, 9, 30, 3);
const DAY = 86_400_000;

function bucket(objects: { key: string; uploaded: number }[], page = 2) {
  const held = new Map(objects.map((o) => [o.key, o.uploaded]));
  const b: HeldBucket = {
    get: async () => null,
    put: async () => undefined,
    delete: async (key) => void held.delete(key),
    list: async ({ prefix, cursor }) => {
      const all = [...held.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [z]) => a.localeCompare(z));
      const from = Number(cursor ?? 0);
      const objects = all.slice(from, from + page).map(([key, at]) => ({ key, uploaded: new Date(at) }));
      return from + page < all.length ? { objects, truncated: true, cursor: String(from + page) } : { objects, truncated: false };
    },
  };
  return { b, held };
}

test('A GIVEN-UP ARRIVAL PAST THIRTY DAYS IS DELETED, ACROSS PAGES, AND A YOUNGER ONE AND A WAITING ONE ARE KEPT', async () => {
  const old = (n: number) => ({ key: `${HELD_GAVE_UP}rec_a/${String(n).padStart(64, '0')}.held`, uploaded: NOW - HELD_GAVE_UP_MS - DAY });
  const young = { key: `${HELD_GAVE_UP}rec_a/${'9'.repeat(64)}.held`, uploaded: NOW - 2 * DAY };
  const waiting = { key: `held/wait/rec_a/${'8'.repeat(64)}.held`, uploaded: NOW - 90 * DAY };
  const { b, held } = bucket([old(1), old(2), old(3), young, waiting]);
  assert.equal(await pruneGaveUp(b, NOW), 3);
  assert.deepEqual([...held.keys()].sort(), [young.key, waiting.key].sort());
});

test('A DOOR’S MAIL IS QUIET PER REASON, and every other kind keeps its one window', () => {
  assert.equal(opsSlot({ op: 'door', why: 'gave-up status-404', rec: 'rec_a' }), 'door:gave-up status-404');
  assert.notEqual(opsSlot({ op: 'door', why: 'gave-up status-404' }), opsSlot({ op: 'door', why: 'gave-up status-413' }));
  assert.equal(opsSlot({ op: 'door', why: 'waiting' }), 'door:waiting');
  assert.equal(opsSlot({ op: 'door' }), 'door');
  assert.equal(opsSlot({ op: 'crash', why: 'anything' }), 'crash');
});
