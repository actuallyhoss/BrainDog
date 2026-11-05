/**
 * Two doors a file needs from the Cloud: the record's public key at `/<slug>/.well-known/braindog-key`,
 * and an operation bearer, which opens its one method once.
 *
 * MEASURED BEFORE THIS FILE, AT 07ba6dbd, through the bundle. `GET /app/studio/.well-known/braindog-key` fell to
 * `appPage` as a page of the app and answered the shell's 404, "This deployment serves no app", so `braindog verify
 * --key <url>` had no URL on the Cloud that answered a key. And an `export` bearer the device flow had just handed the
 * CLI was 401 `UNAUTHORIZED` at `/api/export`: `bearerOf` asked the record's token table and nothing else, and an
 * operation grant is a `device_grant` row, not a token (`packages/kernel/src/device.ts` `operationGrant`).
 *
 * THE KEY IS PER RECORD BECAUSE ONE WORKER SERVES MANY. `03 §4` puts the key at the host's root, which on a self-host
 * is one record and on the Cloud is every record there is. The root still answers the router's 404: the site does not
 * hand `/.well-known/braindog-key` to the app, so a sentence there would reach `app.brain.dog` and not `brain.dog`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';
const SLUG = 'studio';
/* A TEST KEY, MADE HERE AND NEVER A DEPLOYMENT'S. */
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

async function keyed() {
  const c = await cloud({ KEK });
  const store = (await keyStoreOf(KEK)) ?? assert.fail('no key store');
  const person = await c.provision(REC, SLUG, OWNER, { keys: await recordKeys(store, REC) });
  return { ...c, person };
}

/** What `dog_sig` says signed a file: the row under its header, an array in the header's column order. */
const sigOf = (lines: readonly string[]): { key_id: unknown; public_key: unknown } => {
  const at = lines.findIndex((l) => l.startsWith('#table dog_sig '));
  const columns = (lines[at] ?? '').split(' ')[2]?.split(',') ?? [];
  const row = JSON.parse(lines[at + 1] ?? '[]') as unknown[];
  return { key_id: row[columns.indexOf('key_id')], public_key: row[columns.indexOf('public_key')] };
};

test('A RECORD\'S KEY IS AT /<slug>/.well-known/braindog-key, to anybody, and it is the key its exports are signed with', async () => {
  const c = await keyed();
  const res = await c.ask(`/${SLUG}/.well-known/braindog-key`);
  const body = await res.text();
  assert.equal(res.status, 200, body);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const key = JSON.parse(body) as { key_id: string; public_key: string };
  assert.match(key.key_id, /^[0-9a-f]{16}$/);
  assert.match(key.public_key, /^[A-Za-z0-9_-]{43}$/);

  const cookie = await c.signIn(OWNER);
  const exported = (await (await c.ask('/api/export', { method: 'POST', cookie, body: '{}' })).json()) as { ok: boolean; value?: string[] };
  assert.ok(exported.ok, JSON.stringify(exported));
  assert.deepEqual(key, sigOf(exported.value ?? []), 'the door answers a key the record does not sign with');
});

test('A NAME NO RECORD HOLDS IS 404 AND WAKES NO OBJECT, and one released is the same 404', async () => {
  const c = await keyed();
  const before = c.objects.size;
  const res = await c.ask('/nobody-here/.well-known/braindog-key');
  const said = (await res.json()) as Out;
  assert.equal(res.status, 404, JSON.stringify(said));
  assert.equal(c.objects.size, before, 'an object was addressed for a name nobody holds, and on this platform that creates it');

  assert.equal(c.directory.close(REC), null);
  const released = (await (await c.ask(`/${SLUG}/.well-known/braindog-key`)).json()) as Out;
  assert.equal(released.refusal?.code, said.refusal?.code);
  assert.equal(released.refusal?.fix.replace(SLUG, 'x'), said.refusal?.fix.replace('nobody-here', 'x'), 'a released name answers differently from one never given');
});

test('AN EXPORT OPERATION BEARER EXPORTS ONCE AND IS REFUSED THE SECOND TIME, and opens no other door', async () => {
  const c = await keyed();
  const object = c.record(REC);
  const started = (await object.deviceStart({ reach: 'export', label: 'test-box · braindog-cli' }, '203.0.113.7')) as { ok: boolean; value: { user_code: string; device_code: string } };
  assert.ok(started.ok, JSON.stringify(started));
  const owner = { principal: { kind: 'person', id: c.person, level: 'owner' }, credentialed: true, provedAt: Date.now() };
  const looked = await object.fetch(
    new Request('https://app.example.test/api/deviceLook', {
      method: 'POST',
      headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
      body: JSON.stringify({ user_code: started.value.user_code }),
    }),
  );
  const handle = ((await looked.json()) as { value: { handle: string } }).value.handle;
  const approved = await object.fetch(
    new Request('https://app.example.test/api/deviceApprove', {
      method: 'POST',
      headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
      body: JSON.stringify({ user_code: started.value.user_code, handle }),
    }),
  );
  assert.equal(approved.status, 200, await approved.clone().text());
  const polled = (await object.devicePoll({ device_code: started.value.device_code })) as { ok: boolean; value: { bearer: string } };
  assert.ok(polled.ok && polled.value.bearer, JSON.stringify(polled));
  const bearer = polled.value.bearer;

  /* ONE OTHER DOOR FIRST, WHICH MUST NOT SPEND IT: a bearer read at `/api/boot` is not an operation anybody approved. */
  assert.equal((await c.ask('/api/boot', { bearer })).status, 401, 'an export bearer opened boot');

  const first = await c.ask('/api/export', { method: 'POST', bearer, body: '{}' });
  const out = (await first.json()) as { ok: boolean; value?: string[] };
  assert.equal(first.status, 200, JSON.stringify(out));
  assert.ok((out.value ?? []).some((l) => l.startsWith('#table dog_sig')), 'the answer is not a file');

  const second = await c.ask('/api/export', { method: 'POST', bearer, body: '{}' });
  assert.equal(second.status, 401, `a spent bearer exported twice: ${await second.text()}`);
});

test('AN IMPORT BEARER PRESENTED AT /api/export IS REFUSED, and the record is not asked to export', async () => {
  const c = await keyed();
  const object = c.record(REC);
  const started = (await object.deviceStart({ reach: 'import', label: 'test-box · braindog-cli' }, '203.0.113.7')) as { value: { user_code: string; device_code: string } };
  const owner = { principal: { kind: 'person', id: c.person, level: 'owner' }, credentialed: true, provedAt: Date.now() };
  const looked = await object.fetch(
    new Request('https://app.example.test/api/deviceLook', {
      method: 'POST',
      headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
      body: JSON.stringify({ user_code: started.value.user_code }),
    }),
  );
  const handle = ((await looked.json()) as { value: { handle: string } }).value.handle;
  await object.fetch(
    new Request('https://app.example.test/api/deviceApprove', {
      method: 'POST',
      headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
      body: JSON.stringify({ user_code: started.value.user_code, handle }),
    }),
  );
  const polled = (await object.devicePoll({ device_code: started.value.device_code })) as { value: { bearer: string } };
  const exports = c.events(REC, 'export');
  const res = await c.ask('/api/export', { method: 'POST', bearer: polled.value.bearer, body: '{}' });
  assert.equal(res.status, 403, await res.clone().text());
  assert.equal(c.events(REC, 'export'), exports, 'the record exported for a bearer approved for an import');
});
