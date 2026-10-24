/**
 * Every record answer says how long it took, split between the record and the doors (`Server-Timing`, scope
 * 2026-10-24 A1), so the trip from Cairo and the record's own wait are read off the answer rather than out of logs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF';
const OWNER = 'ada@example.test';

test('A RECORD ANSWER CARRIES rec AND door IN Server-Timing, at either address', async () => {
  const c = await cloud();
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  for (const path of ['/app/studio/api/version', '/api/version']) {
    const res = await c.ask(path, { cookie });
    assert.equal(res.status, 200, path);
    const timing = res.headers.get('server-timing') ?? '';
    assert.match(timing, /(?:^|,)\s*rec;dur=\d+/u, `${path}: ${timing}`);
    assert.match(timing, /(?:^|,)\s*door;dur=\d+/u, `${path}: ${timing}`);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true, path);
  }
});

test('A REFUSAL BEFORE THE RECORD SAYS ONLY door', async () => {
  const c = await cloud();
  await c.provision(REC, 'studio', OWNER);
  const res = await c.ask('/api/version', {});
  assert.equal(res.status, 401);
  const timing = res.headers.get('server-timing') ?? '';
  assert.match(timing, /^door;dur=\d+$/u, timing);
});
