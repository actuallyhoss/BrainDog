/**
 * The inbox keeps a bounded number of arrivals nothing verified, newest first, and every verified one.
 *
 * Before this every forged post to a webhook address stored a row for good: the hour's count slowed a stranger down and
 * nothing bounded what piled up, so a record's storage was theirs to fill.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { UNVERIFIED, UNVERIFIED_BYTES, UNVERIFIED_KEPT } from '../src/ingest.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const HOOK: Declaration = {
  id: 'ingest.bank',
  kind: 'ingest',
  body: { ingest: 'bank', channel: 'webhook', verify: { kind: 'path' }, writes: { register: 'one', confidence: 'exact' } } as never,
};
const ONE: Declaration = { id: 'register.one', kind: 'register', body: { id: 'one', name: 'one', title: 'what', fields: [{ id: 'what', type: 'text' }] } as never };

test('ARRIVALS NOTHING VERIFIED ARE KEPT TO A COUNT AND A SIZE, THE NEWEST FIRST, AND A VERIFIED ONE IS NEVER TAKEN', async () => {
  const sql = openSqlite();
  let now = NOW;
  const k = await openRecord(sql, { now: () => now });
  assert.ok((await k.install([ONE, HOOK])).ok);
  const real = k.arrive({ channel: 'webhook', ingest: 'bank', body: 'a real one', sha256: 'real', verified: true });
  assert.ok(real.ok);

  for (let i = 0; i < UNVERIFIED_KEPT + 50; i++) {
    now += 1000;
    assert.ok(k.arrive({ channel: 'webhook', ingest: 'bank', body: `forged ${String(i)}`, sha256: `f${String(i)}`, verified: false }).ok);
  }
  const kept = sql.all<{ body: string }>("SELECT body FROM inbox_raw WHERE reason = ? ORDER BY ts", UNVERIFIED);
  assert.equal(kept.length, UNVERIFIED_KEPT, 'forged arrivals piled up without end');
  assert.equal(kept[0]!.body, 'forged 50', 'the oldest were not the ones that went');
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM inbox_raw WHERE sha256 = 'real'")!.n, 1);

  /* AND BY SIZE: a few large forgeries take no more than the bytes allowed. */
  const big = 'x'.repeat(4_000_000);
  for (let i = 0; i < 10; i++) {
    now += 1000;
    assert.ok(k.arrive({ channel: 'webhook', ingest: 'bank', body: `${big}${String(i)}`, sha256: `b${String(i)}`, verified: false }).ok);
  }
  const bytes = sql.one<{ n: number }>('SELECT SUM(length(body) + length(headers)) AS n FROM inbox_raw WHERE reason = ?', UNVERIFIED)!.n;
  assert.ok(bytes <= UNVERIFIED_BYTES, `${String(bytes)} bytes of forgeries kept`);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM inbox_raw WHERE sha256 = 'real'")!.n, 1);
});
