/**
 * The Worker's half of read-only links (USE-A06): whether it makes them at all (`sharesOf`), and a link's whole life
 * through the Worker as it ships: opened by the owner, read with no session, closed, and refused when read again.
 *
 * OFF UNLESS SAID. `sharesOf` is yes only with `KEK` bound and `SHARE_LINKS` exactly `on`, which production does not set
 * until the owner says yes; every other answer is no with the one sentence the owner reads.
 *
 * THE HARNESS PART RUNS THE THREE SEAMS TOGETHER: the routes in the host's table (`routes/index.ts`), the Worker's
 * `shares` answer handed to the record, and the record passing it on to its methods.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sharesOf, SHARES_OFF } from '../src/share.ts';
import { cloud } from './cloud-harness.ts';

/* NOT A SECRET. A root key for a deployment that lives in this process for a second. */
const KEK = 'ab'.repeat(32);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAW';
const OWNER = 'ada@example.test';

test('sharesOf: yes only with the root key bound and SHARE_LINKS on', async () => {
  assert.deepEqual(sharesOf({ KEK, SHARE_LINKS: 'on' }), { can: true });
  assert.deepEqual(sharesOf({ KEK: { get: async () => KEK }, SHARE_LINKS: 'on' }), { can: true });
});

test('sharesOf: off, unset or misspelt is no, with the owner\'s sentence', () => {
  for (const SHARE_LINKS of [undefined, '', 'off', 'On', 'true', '1', ' on']) assert.deepEqual(sharesOf({ KEK, SHARE_LINKS }), { can: false, why: SHARES_OFF });
  assert.equal(SHARES_OFF, 'Read-only links are switched off on this BrainDog.');
});

test('sharesOf: no root key bound is no, even with SHARE_LINKS on', () => {
  for (const bound of [undefined, '']) assert.deepEqual(sharesOf({ KEK: bound, SHARE_LINKS: 'on' }), { can: false, why: SHARES_OFF });
  assert.deepEqual(sharesOf({}), { can: false, why: SHARES_OFF });
});

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string } };

test('over the Worker with SHARE_LINKS on: open, read with no session, close, read again refused', async () => {
  const c = await cloud({ KEK, SHARE_LINKS: 'on' });
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  const call = async (method: string, body: object): Promise<{ status: number; out: Out }> => {
    const res = await c.ask(`/api/${method}`, { method: 'POST', cookie, body: JSON.stringify(body) });
    return { status: res.status, out: (await res.json()) as Out };
  };
  const page = { page: 'plans', title: 'Plans', blocks: [{ kind: 'note', body: 'The Lanternfish launch is on the first.' }] };
  assert.equal((await call('setDeclaration', { body: page, version: 0 })).out.ok, true);

  const able = await call('shareable', {});
  assert.deepEqual(able.out, { ok: true, value: { can: true } });

  const opened = await call('openShare', { slug: 'plans' });
  assert.equal(opened.status, 200, JSON.stringify(opened.out));
  const { id, token, url } = opened.out.value as { id: string; token: string; url: string };
  assert.equal(url, `https://app.example.test/app/s#${token}`);
  assert.ok(!JSON.stringify(opened.out).includes(KEK), 'the answer carries no key');

  const read = () => c.ask('/api/sharedPage', { method: 'POST', headers: { authorization: `Share ${token}` }, body: '{}' });
  const first = await read();
  assert.equal(first.status, 200);
  assert.match(await first.text(), /Lanternfish launch/);

  assert.equal((await call('closeShare', { id })).out.ok, true);
  const again = await read();
  assert.equal(again.status, 404);
  assert.equal(await again.text(), '');
});
