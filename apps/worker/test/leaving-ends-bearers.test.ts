/**
 * Somebody leaving, and every bearer they left behind.
 *
 * A BEARER IS CHECKED AGAINST THE RECORD'S OWN TABLES and never asks the Directory, so three ways of leaving ended the
 * browser session and left the machines working: closing an account, the operator stopping one, and an owner being taken
 * off. Each test below failed before its fix, on the local cloud harness.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';
const BO = 'bo@example.test';
const OPERATOR_KEY = 'operator-key-for-this-test-only-00000000';
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

async function two() {
  const c = await cloud({ KEK, PROVISION_KEY: OPERATOR_KEY });
  const store = (await keyStoreOf(KEK))!;
  await c.provision(REC, 'studio', OWNER, { keys: await recordKeys(store, REC) });
  const owner = await c.signIn(OWNER);
  const call = async (cookie: string, method: string, body: object = {}) => {
    const res = await c.ask(`/api/${method}`, { method: 'POST', cookie, body: JSON.stringify(body) });
    return { status: res.status, out: (await res.json()) as any };
  };
  const minted = await call(owner, 'invite', { email: BO, level: 'owner' });
  assert.equal(minted.status, 200, JSON.stringify(minted.out));
  const bo = (c.directory as any).invitee(BO);
  const cookie = await c.signIn(BO);
  const accepted = await c.ask('/auth/invite', { method: 'POST', cookie, body: JSON.stringify({ inviteToken: minted.out.value.token, accept: true }) });
  assert.equal(accepted.status, 200, await accepted.clone().text());
  const token = await call(cookie, 'createToken', { scope: 'write', label: 'agent' });
  assert.equal(token.status, 200, JSON.stringify(token.out));
  return { c, owner, call, boId: bo.value.id as string, boCookie: cookie, bearer: token.out.value.bearer as string };
}

/** A machine Bo lets in, by the device door: started by a stranger, approved by him, collected by its poll. */
async function machine(s: Awaited<ReturnType<typeof two>>, ask: { reach: string; scope?: string; label: string }): Promise<string> {
  const object = s.c.record(REC) as any;
  const started = await object.deviceStart(ask, '203.0.113.7');
  const approved = await s.call(s.boCookie, 'deviceApprove', { user_code: started.value.user_code });
  assert.equal(approved.status, 200, JSON.stringify(approved.out));
  const polled = await s.c.ask('/auth/device/token', { method: 'POST', body: JSON.stringify({ slug: 'studio', device_code: started.value.device_code }) });
  return ((await polled.json()) as any).value.bearer as string;
}

const suspend = (s: Awaited<ReturnType<typeof two>>, suspended: boolean) =>
  s.c.ask('/auth/suspend', { method: 'POST', bearer: OPERATOR_KEY, body: JSON.stringify({ email: BO, suspended }) });

test('closing an account ends its agent keys and machines on every record it was on', async () => {
  const s = await two();
  const vault = await machine(s, { reach: 'vault', scope: '*', label: 'bo-laptop' });
  const object = s.c.record(REC) as any;
  assert.equal((await s.c.ask('/api/whoami', { bearer: s.bearer })).status, 200);
  assert.equal((await object.keychainGrant(vault)).ok, true);

  const closed = await s.c.ask('/account/close', { method: 'POST', cookie: s.boCookie, body: JSON.stringify({ email: BO }) });
  assert.equal(closed.status, 200, await closed.clone().text());

  assert.equal((await s.c.ask('/api/whoami', { bearer: s.bearer })).status, 401, 'the key ended with the account');
  assert.equal((await object.keychainGrant(vault)).ok, false, 'and the machine let into the keychain');

  /* AN OWNER LIFTING THE STOP BRINGS NOTHING BACK: the keys are revoked, not only stopped. */
  const lifted = await s.call(s.owner, 'suspendMember', { person: s.boId, suspended: false });
  assert.equal(lifted.status, 200, JSON.stringify(lifted.out));
  assert.equal((await s.c.ask('/api/whoami', { bearer: s.bearer })).status, 401);
  assert.equal((await object.keychainGrant(vault)).ok, false);
});

test('the operator stopping somebody ends their keys too, and letting them back brings them back', async () => {
  const s = await two();
  const runner = await machine(s, { reach: 'runner', label: 'bo-runner' });
  const object = s.c.record(REC) as any;

  const stopped = await suspend(s, true);
  assert.equal(stopped.status, 200, await stopped.clone().text());
  const said = (await stopped.json()) as any;
  assert.equal(said.value?.unreached ?? said.unreached, 0, 'every record was reached');
  assert.equal(said.value?.was ?? said.was, undefined, 'the internal stamp stays in');

  const refused = await s.c.ask('/api/whoami', { bearer: s.bearer });
  assert.notEqual(refused.status, 200, 'the key stopped');
  assert.equal(await object.runner(runner), null, 'and the runner');

  assert.equal((await suspend(s, false)).status, 200);
  assert.equal((await s.c.ask('/api/whoami', { bearer: s.bearer })).status, 200, 'the key is back with the person');
  assert.notEqual(await object.runner(runner), null);
});

test("letting somebody back in never lifts an owner's own stop of them", async () => {
  const s = await two();
  const own = await s.call(s.owner, 'suspendMember', { person: s.boId, suspended: true });
  assert.equal(own.status, 200, JSON.stringify(own.out));
  assert.notEqual((await s.c.ask('/api/whoami', { bearer: s.bearer })).status, 200);

  assert.equal((await suspend(s, true)).status, 200);
  assert.equal((await suspend(s, false)).status, 200);

  assert.notEqual((await s.c.ask('/api/whoami', { bearer: s.bearer })).status, 200, 'the owner still has them stopped');
});

test('an owner taken off, or made less than one, takes their keychain and runner machines with them', async () => {
  const s = await two();
  const vault = await machine(s, { reach: 'vault', scope: '*', label: 'bo-laptop' });
  const runner = await machine(s, { reach: 'runner', label: 'bo-runner' });
  const object = s.c.record(REC) as any;
  assert.equal((await object.keychainGrant(vault)).ok, true);
  assert.notEqual(await object.runner(runner), null);

  /* HANDING IT OVER IS THE PLAIN WAY AN OWNER STOPS BEING ONE: Bo steps down to Can decide, and his machines with him. */
  const ada = (s.c.directory as any).invitee(OWNER);
  const lowered = await s.call(s.boCookie, 'handOver', { person: ada.value.id });
  assert.equal(lowered.status, 200, JSON.stringify(lowered.out));
  assert.equal((await object.keychainGrant(vault)).ok, false, 'no longer an owner, no keychain');
  assert.equal(await object.runner(runner), null, 'and no runner');

  const removed = await s.call(s.owner, 'removeMember', { person: s.boId });
  assert.equal(removed.status, 200, JSON.stringify(removed.out));
  assert.equal((await object.keychainGrant(vault)).ok, false, 'the grant stands no longer');
  assert.equal(await object.runner(runner), null);
});
