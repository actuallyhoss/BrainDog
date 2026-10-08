/**
 * `/account/ops/alert` (batch 38's model-checks B0): the model-checks workflow mails the `model` operator line through the
 * Worker, behind the provision key as `/account/ops/invite` is. Only `model` is taken, and the mail goes once a window.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud } from './cloud-harness.ts';

const OPERATOR = 'an-operator-key-for-these-tests-only-0123456789';

test('THE ALERT DOOR: 404 with no key, 401 with a wrong one, model only, and one mail a window', async () => {
  const sent: { text?: unknown }[] = [];
  const env = {
    AUTH_MAIL_FROM: 'hello@example.test',
    OPS_ALERT_TO: 'ops@example.test',
    EMAIL: { send: async (m: Record<string, unknown>) => (sent.push(m), { messageId: 'm' }) },
  };
  const off = await cloud({ ...env, PROVISION_KEY: '' });
  assert.equal((await off.ask('/account/ops/alert', { method: 'POST', body: '{"op":"model"}', bearer: OPERATOR })).status, 404);

  const c = await cloud({ ...env, PROVISION_KEY: OPERATOR });
  assert.equal((await c.ask('/account/ops/alert', { method: 'POST', body: '{"op":"model"}', bearer: 'wrong' })).status, 401);
  assert.equal((await c.ask('/account/ops/alert', { method: 'POST', body: '{"op":"crash"}', bearer: OPERATOR })).status, 400);
  const res = await c.ask('/account/ops/alert', { method: 'POST', body: JSON.stringify({ op: 'model', model: 'm'.repeat(300), why: 'the night read red' }), bearer: OPERATOR });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, value: { sent: true } });
  assert.equal(sent.length, 1);
  assert.match(String(sent[0]?.text), /op: model/);
  assert.ok(!String(sent[0]?.text).includes('m'.repeat(201)), 'the model name was not cut to 200');
  const again = await c.ask('/account/ops/alert', { method: 'POST', body: '{"op":"model"}', bearer: OPERATOR });
  assert.deepEqual(await again.json(), { ok: true, value: { sent: false } }, 'a second alert inside the quiet window was mailed');
});
