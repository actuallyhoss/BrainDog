/**
 * The operator's key, held to ten wrong tries from one place at every door that takes it as a bearer.
 *
 * `operated` in `packages/host/src/auth.ts` held `/auth/*` to this, in one isolate's memory. `/account/ops/*` and the
 * Kennel's review doors compared the key as often as anybody asked, with only the write budget by address in front.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud } from './cloud-harness.ts';

const KEY = 'operator-key-for-this-test-only-00000000';
const WRONG = 'not-the-operator-key-00000000000000000000';

const me = (c: Awaited<ReturnType<typeof cloud>>, bearer: string, ip = '203.0.113.50') =>
  c.ask('/account/ops/me', { bearer, headers: { 'cf-connecting-ip': ip } } as never);

test('ten wrong keys are answered, the eleventh is a 429 at every ops door, and the right key waits too', async () => {
  const c = await cloud({ PROVISION_KEY: KEY });
  for (let i = 0; i < 10; i++) assert.notEqual((await me(c, WRONG)).status, 429, `try ${i + 1}`);
  assert.equal((await me(c, WRONG)).status, 429);
  const alert = await c.ask('/account/ops/alert', { method: 'POST', bearer: WRONG, headers: { 'cf-connecting-ip': '203.0.113.50' }, body: '{}' } as never);
  assert.equal(alert.status, 429, 'the count is one for every door');
  assert.equal((await me(c, KEY)).status, 429);
  assert.equal((await me(c, KEY, '203.0.113.51')).status, 200, 'another place is not held');
});

test('the right key clears what came before it, so a stale script does not lock its operator out', async () => {
  const c = await cloud({ PROVISION_KEY: KEY });
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 9; i++) await me(c, WRONG);
    assert.equal((await me(c, KEY)).status, 200, `round ${round + 1}`);
  }
});

test('one IPv6 network is one place', async () => {
  const c = await cloud({ PROVISION_KEY: KEY });
  for (let i = 1; i <= 10; i++) await me(c, WRONG, `2001:db8:0:9::${i.toString(16)}`);
  assert.equal((await me(c, WRONG, '2001:db8:0:9::ff')).status, 429);
});
