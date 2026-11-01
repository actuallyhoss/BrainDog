/**
 * The record's half of signing a machine in: approval behind a fresh sign-in, the list and the revoke by handle,
 * the count on starts per address, and the three internal methods no route reaches. `12 §6.1`.
 *
 * THE KERNEL IS TRUSTED FOR THE GRANT ITSELF, and its own tests hold the codes, tries and exchange. What is new
 * here is who may approve, when, and how often an address may ask.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { ROUTES, UNROUTED } from '../../host/src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const MINUTE = 60_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const ADDRESS = '203.0.113.7';
const AGAIN = { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to approve a device.', at: 'proof' };

/** A record with one owner, a clock the test moves, and a device start that must succeed. */
async function record() {
  let now = Date.UTC(2026, 8, 5, 12);
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => now } });
  const made = await api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));

  const owner = (provedAt?: number): CallContext => ({
    principal: { kind: 'person', id: 'p_owner', level: 'owner' },
    credentialed: true,
    ...(provedAt === undefined ? {} : { provedAt }),
  });
  const start = async (ip = ADDRESS) => {
    const out = await api.deviceStart({ reach: 'login', label: 'test-laptop · braindog-cli' }, ip);
    if (!out.ok) return assert.fail(JSON.stringify(out));
    return out.value;
  };
  const refusalOf = (out: object) => ('refusal' in out ? (out.refusal as { code: string; fix: string; at?: string }) : null);
  return { api, owner, start, refusalOf, now: () => now, advance: (ms: number) => void (now += ms) };
}

test('A SIGN-IN FIFTEEN MINUTES OLD APPROVES, AND ONE A MILLISECOND OLDER IS SENT TO SIGN IN AGAIN', async () => {
  const r = await record();
  const code = await r.start();

  const stale = await r.api.deviceApprove({ user_code: code.user_code }, r.owner(r.now() - 15 * MINUTE - 1));
  assert.deepEqual(r.refusalOf(stale), AGAIN);
  const still = await r.api.devicePoll({ device_code: code.device_code });
  assert.deepEqual(still.ok && still.value, { pending: true, interval: 5 }, 'a stale approval let the device in');

  const approved = await r.api.deviceApprove({ user_code: code.user_code }, r.owner(r.now() - 15 * MINUTE));
  if (!approved.ok) return assert.fail(JSON.stringify(approved));
  assert.match(approved.value.handle, /^[0-9a-f]{16}$/);
  assert.equal(approved.value.reach, 'login');

  const exchanged = await r.api.devicePoll({ device_code: code.device_code });
  if (!exchanged.ok || exchanged.value.pending) return assert.fail(JSON.stringify(exchanged));
  assert.ok(exchanged.value.bearer.startsWith(`${REC}.`));
  assert.ok((await r.api.kernel.verifyToken(exchanged.value.bearer, 'api')).ok, 'the bearer the device took does not verify');
});

test('A TOKEN IS REFUSED, SO IS A CALLER WHO PRESENTED NOTHING, AND SO IS A PERSON BELOW OWNER', async () => {
  const r = await record();
  const code = await r.start();
  const args = { user_code: code.user_code };

  const agent = await r.api.deviceApprove(args, { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'owner' }, provedAt: r.now() });
  assert.equal(r.refusalOf(agent)?.code, 'NEEDS_BROWSER_SESSION');
  assert.notEqual(r.refusalOf(agent)?.fix, AGAIN.fix, 'a token was told to sign in again, as if it could');

  const open = await r.api.deviceApprove(args, { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: false });
  assert.equal(r.refusalOf(open)?.code, 'NEEDS_BROWSER_SESSION');

  const writer = await r.api.deviceApprove(args, { principal: { kind: 'person', id: 'p_2', level: 'write' }, credentialed: true, provedAt: r.now() });
  assert.equal(writer.ok, false);

  const waiting = await r.api.devicePoll({ device_code: code.device_code });
  assert.deepEqual(waiting.ok && waiting.value, { pending: true, interval: 5 }, 'a refused approval changed the grant');

  /* The server key carries no `provedAt`: it is proved on the request that presents it. */
  assert.ok((await r.api.deviceApprove(args, r.owner())).ok);
});

test('LISTED AND REVOKED BY HANDLE, NEVER BY THE ID A DEVICE POLLS WITH, AND THE TOKEN GOES WITH IT', async () => {
  const r = await record();
  const code = await r.start();
  const approved = await r.api.deviceApprove({ user_code: code.user_code }, r.owner(r.now()));
  if (!approved.ok) return assert.fail(JSON.stringify(approved));
  const exchanged = await r.api.devicePoll({ device_code: code.device_code });
  if (!exchanged.ok || exchanged.value.pending) return assert.fail(JSON.stringify(exchanged));
  const { bearer } = exchanged.value;

  const listed = await r.api.listDevices(r.owner(r.now()));
  if (!listed.ok) return assert.fail(JSON.stringify(listed));
  assert.equal(listed.value.length, 1);
  assert.equal(listed.value[0]?.handle, approved.value.handle);
  assert.equal(listed.value[0]?.status, 'active');
  const shown = JSON.stringify(listed.value);
  for (const secret of [code.device_code, code.user_code, bearer]) assert.ok(!shown.includes(secret), 'the listing carries a secret');

  const agent = await r.api.listDevices({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'owner' } });
  assert.equal(r.refusalOf(agent)?.code, 'NEEDS_BROWSER_SESSION');

  const revoked = await r.api.revokeDevice({ handle: approved.value.handle }, r.owner(r.now()));
  if (!revoked.ok) return assert.fail(JSON.stringify(revoked));
  assert.equal(revoked.value.status, 'revoked');
  assert.equal((await r.api.kernel.verifyToken(bearer, 'api')).ok, false, 'revoking the device left its token working');
  assert.equal((await r.api.revokeDevice({ handle: approved.value.handle }, r.owner(r.now()))).ok, true, 'a second revoke said something different');

  assert.equal(r.refusalOf(await r.api.revokeDevice({ handle: 'feedfacefeedface' }, r.owner(r.now())))?.code, 'OUT_OF_BOUNDS');
  assert.equal(r.refusalOf(await r.api.revokeDevice({} as never, r.owner(r.now())))?.code, 'REQUIRED_MISSING');
});

test('STARTS ARE COUNTED PER ADDRESS: TEN IN FIFTEEN MINUTES, THEN FIFTEEN MINUTES OF WAITING', async () => {
  const r = await record();
  for (let i = 0; i < 10; i++) await r.start();

  assert.deepEqual(await r.api.deviceStart({ reach: 'login', label: 'one too many' }, ADDRESS), { ok: false, retryAfter: 900 });
  /* Another address is another count. */
  await r.start('198.51.100.20');

  r.advance(5 * MINUTE);
  assert.deepEqual(await r.api.deviceStart({ reach: 'login', label: 'still waiting' }, ADDRESS), { ok: false, retryAfter: 600 }, 'a refused start moved the lock');

  r.advance(10 * MINUTE + 1);
  await r.start();
});

test('THE THREE INTERNAL METHODS EXIST AND NO ROUTE REACHES THEM; THE THREE ADMIN ONES ARE ROUTED ADMIN', async () => {
  const r = await record();
  const routed = new Map(ROUTES.map((route) => [route.name, route.group]));
  for (const name of ['deviceStart', 'devicePoll', 'keychainGrant'] as const) {
    assert.equal(typeof r.api[name], 'function');
    assert.equal(routed.has(name), false, `${name} is routed`);
    assert.ok((UNROUTED as readonly string[]).includes(name), `${name} is not listed in UNROUTED`);
  }
  for (const name of ['deviceApprove', 'listDevices', 'revokeDevice']) assert.equal(routed.get(name), 'ADMIN', `${name} is not routed ADMIN`);
});

/* A DEVICE LET INTO THE KEYCHAIN IS HELD TO THE KEYCHAIN'S OWN LOCK WINDOW. It asked only the fifteen minutes every
   approval asks, so with the window at five, a sign-in ten minutes old could not open the keychain here and could still
   hand a machine a keychain grant. The code was right, so the refusal spends no try, and a fresh sign-in approves it. */
test('A KEYCHAIN GRANT ASKS A SIGN-IN INSIDE THE KEYCHAIN’S LOCK WINDOW; A LOGIN ASKS ONLY THE FIFTEEN MINUTES', async () => {
  const r = await record();
  r.api.kernel.setLockAfter(5);
  const vault = await r.api.deviceStart({ reach: 'vault', scope: '*', label: 'test-laptop · braindog-cli' }, ADDRESS);
  if (!vault.ok) return assert.fail(JSON.stringify(vault));
  const login = await r.start();

  const stale = await r.api.deviceApprove({ user_code: vault.value.user_code }, r.owner(r.now() - 10 * MINUTE));
  assert.equal(r.refusalOf(stale)?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(r.refusalOf(stale)?.at, 'principal');
  const still = await r.api.devicePoll({ device_code: vault.value.device_code });
  assert.deepEqual(still.ok && still.value, { pending: true, interval: 5 }, 'a sign-in the keychain refuses let a machine into it');

  const loginApproved = await r.api.deviceApprove({ user_code: login.user_code }, r.owner(r.now() - 10 * MINUTE));
  assert.ok(loginApproved.ok, JSON.stringify(loginApproved));

  const fresh = await r.api.deviceApprove({ user_code: vault.value.user_code }, r.owner(r.now() - 4 * MINUTE));
  assert.ok(fresh.ok, JSON.stringify(fresh));
});
