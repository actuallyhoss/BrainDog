/**
 * Free, enforced ("Free leads"): one person, and sign-up open wherever this host has an address.
 *
 * BEFORE THIS, BOTH WERE WORDS. The site and the terms said Free is one person, and an owner on Free could still mint an
 * invitation and a colleague could still spend it, because `dir_member` had no limit and nothing asked the plan. And
 * sign-up was shut wherever billing was off, so the "Start for free" button on a host with no Stripe led to a closed door.
 *
 * THROUGH THE WORKER AS IT SHIPS: `src/index.ts` bundled, a real Directory, real record objects (`cloud-harness.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FREE_JOIN_REFUSED, FREE_JOIN_REFUSED_SHORT, FREE_ONE_PERSON, FREE_ONE_PERSON_SHORT } from '@braindog/record/directory';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };

/** A host that sells Cloud, as `/account/billing` reads it: a key that matches its mode, an address, and Cloud's price. */
const SELLS = { BILLING: 'test', STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_PRICE_HOSTED: 'price_cloud' };

/** A record, its owner signed in, and a way to put it on a plan as billing does: the Directory first, then the record. */
async function studio(extra: Record<string, unknown> = SELLS) {
  const c = await cloud(extra);
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  const plan = async (to: string) => {
    assert.equal((c.directory as unknown as { setPlan(r: string, p: string): unknown }).setPlan(REC, to), null);
    await (c.record(REC) as unknown as { planMoved(p: string): Promise<void> }).planMoved(to);
  };
  const invite = async (email: string) => {
    const res = await c.ask('/api/invite', { method: 'POST', cookie, body: JSON.stringify({ email, level: 'read' }) });
    return { status: res.status, body: (await res.json()) as Out };
  };
  return { ...c, cookie, plan, invite };
}

test('AN OWNER ON FREE CANNOT INVITE ANYBODY, and is told why and how to move on', async () => {
  const c = await studio();
  await c.plan('free');
  const out = await c.invite('bo@example.test');
  assert.equal(out.status, 403, JSON.stringify(out.body));
  assert.equal(out.body.refusal?.code, 'FORBIDDEN');
  assert.equal(out.body.refusal?.fix, FREE_ONE_PERSON);
  const held = () => Number((c.storages.get(REC)?.sql.exec('SELECT count(*) AS n FROM invitation').toArray()[0] as { n: number } | undefined)?.n ?? -1);
  assert.equal(held(), 0, 'an invitation was minted on Free');

  /* CLOUD IS NOT ENOUGH EITHER: teams are Cloud Plus's. */
  await c.plan('hosted');
  assert.equal((await c.invite('bo@example.test')).status, 403);

  /* ON CLOUD PLUS, THE SAME INVITATION GOES THROUGH. */
  await c.plan('plus');
  const paid = await c.invite('bo@example.test');
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(typeof paid.body.value?.['token'], 'string');
  assert.equal(held(), 1);
});

test('A SHARE TO SOMEBODY NOT ON THE RECORD YET IS A SECOND PERSON: refused on Free and Cloud as an invitation is, taken on Cloud Plus', async () => {
  const c = await studio();
  const share = async () => {
    const res = await c.ask('/api/share', {
      method: 'POST',
      cookie: c.cookie,
      body: JSON.stringify({ share: { who: { kind: 'email', id: 'bo@example.test' }, what: { record: true }, can: 'view', when: { until: '2099-01-01T00:00:00.000Z' } } }),
    });
    return { status: res.status, body: (await res.json()) as Out };
  };
  await c.plan('free');
  const free = await share();
  assert.equal(free.status, 403, JSON.stringify(free.body));
  assert.deepEqual(free.body.refusal, { code: 'FORBIDDEN', fix: FREE_ONE_PERSON, at: 'plan' });
  const held = () => Number((c.storages.get(REC)?.sql.exec('SELECT count(*) AS n FROM share').toArray()[0] as { n: number } | undefined)?.n ?? -1);
  assert.equal(held(), 0, 'a share was kept on Free');

  await c.plan('hosted');
  assert.equal((await share()).status, 403);

  await c.plan('plus');
  const paid = await share();
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(held(), 1);
});

test('WHILE THE HOST SELLS NO PLAN, a share to an address on Free is kept', async () => {
  const c = await studio({});
  await c.plan('free');
  const res = await c.ask('/api/share', {
    method: 'POST',
    cookie: c.cookie,
    body: JSON.stringify({ share: { who: { kind: 'email', id: 'bo@example.test' }, what: { record: true }, can: 'view', when: { until: '2099-01-01T00:00:00.000Z' } } }),
  });
  assert.equal(res.status, 200, await res.text());
});

test('A FREE RECORD IS READ FROM THE DIRECTORY when billing never told the object, as after an eviction', async () => {
  const c = await studio();
  assert.equal((c.directory as unknown as { setPlan(r: string, p: string): unknown }).setPlan(REC, 'free'), null);
  const out = await c.invite('bo@example.test');
  assert.equal(out.body.refusal?.fix, FREE_ONE_PERSON);
});

test('A LINK TO A RECORD NOW ON FREE IS REFUSED WHEN IT IS OPENED, before a proof is mailed, and the Directory refuses the join', async () => {
  const c = await studio();
  await c.plan('plus');
  const minted = await c.invite('bo@example.test');
  const token = minted.body.value?.['token'] as string;
  assert.equal(typeof token, 'string', JSON.stringify(minted.body));
  await c.plan('free');

  const res = await c.ask('/auth/invite', { method: 'POST', body: JSON.stringify({ inviteToken: token, accept: true }) });
  const out = (await res.json()) as Out;
  assert.equal(res.status, 403, JSON.stringify(out));
  assert.equal(out.refusal?.fix, FREE_JOIN_REFUSED);

  /* AND THE DIRECTORY ITSELF, for a join that reached it some other way. */
  const dir = c.directory as unknown as { invitee(e: string): { ok: boolean; value: { id: string } }; joinRecord(r: string, p: string): Out };
  const bo = dir.invitee('bo@example.test');
  assert.ok(bo.ok);
  assert.equal(dir.joinRecord(REC, bo.value.id).refusal?.fix, FREE_JOIN_REFUSED);
});

test('WHILE THE HOST SELLS NO PLAN THE TEAMS GATE IS OFF: a record on Free takes an invitation and its link is spent', async () => {
  const c = await studio({});
  await c.plan('free');
  const minted = await c.invite('bo@example.test');
  assert.equal(minted.status, 200, JSON.stringify(minted.body));
  const dir = c.directory as unknown as { invitee(e: string): { ok: boolean; value: { id: string } }; joinRecord(r: string, p: string): Out };
  const bo = dir.invitee('bo@example.test');
  assert.ok(bo.ok);
  assert.equal(dir.joinRecord(REC, bo.value.id).ok, true);
  assert.match(FREE_ONE_PERSON_SHORT, /^Teams are part of Cloud Plus/u);
  for (const short of [FREE_ONE_PERSON_SHORT, FREE_JOIN_REFUSED_SHORT]) assert.doesNotMatch(short, /Settings|link/u);
});

test('SIGN-UP IS OPEN WHERE SIGNUP SAYS open, with billing off', async () => {
  const c = await cloud({ SIGNUP: 'open' });
  const res = await c.ask('/auth/signup/name?slug=bakery');
  const out = (await res.json()) as Out;
  assert.equal(res.status, 200, JSON.stringify(out));
  assert.equal(out.value?.['open'], true);
  assert.equal(out.value?.['mode'], 'open');
});
