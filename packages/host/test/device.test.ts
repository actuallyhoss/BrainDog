/**
 * The address a device start tells a person to open (`loop/research-one-domain.md` Brief D).
 *
 * THE APP LIVES UNDER `/app` NOW, so `${origin}/settings/agents` is a page on the marketing site: once `brain.dog`
 * serves both, the old address answers the site's 404 and the six digits have nowhere to be typed. On the Worker the
 * record goes in the path when the device named one, because under `/app/<slug>` the app reads that record and no other.
 *
 * THE DOOR IS A STUB that answers a code for any ask. Whether a slug names a record is the host's to decide before
 * this line is reached, and it is tested there; here only the address built from the answer is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AUTH_ROUTES, serveAuth, type AuthDoor, type DeviceAsk } from '../src/auth.ts';

const ORIGIN = 'https://brain.dog';

function door(reached = 'brain.dog', on: 'worker' | 'selfhost' = 'worker') {
  const asked: DeviceAsk[] = [];
  const shape = {
    origin: ORIGIN,
    on,
    ip: '203.0.113.9',
    reached,
    device: {
      start: async (ask: DeviceAsk) => {
        asked.push(ask);
        return { ok: true as const, value: { device_code: 'poll-id', user_code: '123456', expires: '2099-01-01T00:00:00.000Z', interval: 5 } };
      },
      poll: async () => ({ ok: true as const, value: { pending: true } }),
    },
  };
  return { door: shape as unknown as AuthDoor, asked };
}

const start = async (d: AuthDoor, body: object) => {
  const res = await serveAuth(new Request(`${ORIGIN}/auth/device`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), d);
  return { status: res.status, body: (await res.json()) as { ok: boolean; value?: { verification_uri: string }; refusal?: { at?: string } } };
};

test('the device route this file tests is the one serveAuth answers', () => {
  assert.ok(AUTH_ROUTES.some((r) => r.path === '/auth/device' && r.method === 'POST'));
});

test('A DEVICE THAT NAMED ITS RECORD IS SENT TO THAT RECORD\'S AGENTS PAGE, UNDER /app', async () => {
  const d = door();
  const out = await start(d.door, { slug: 'acme', reach: 'login', label: 'laptop' });
  assert.equal(out.status, 200);
  assert.equal(out.body.value?.verification_uri, 'https://brain.dog/app/acme/settings/agents');
  assert.equal(d.asked[0]?.slug, 'acme');
});

test('A DEVICE THAT NAMED NO RECORD IS SENT TO /app/settings/agents, which is the record the session is on', async () => {
  const out = await start(door().door, { reach: 'login', label: 'laptop' });
  assert.equal(out.status, 200);
  assert.equal(out.body.value?.verification_uri, 'https://brain.dog/app/settings/agents');
});

test('A SLUG NO RECORD COULD HAVE NEVER REACHES THE ADDRESS, so it cannot make it another page', async () => {
  /* The Worker refuses these upstream; the stub does not, which is the case this lock is for. `%2e%2e` is here
     because a URL parser reads it as `..`, which is why the check is a grammar and not an encoding. */
  for (const slug of ['..', '%2e%2e', '../../x?y#z', 'Acme', 'acme-', 'a', 'acme/r', 'x'.repeat(33)]) {
    const out = await start(door().door, { slug, reach: 'login', label: 'laptop' });
    assert.equal(out.status, 200, slug);
    const uri = new URL(out.body.value?.verification_uri ?? '');
    assert.equal(`${uri.origin}${uri.pathname}${uri.search}${uri.hash}`, 'https://brain.dog/app/settings/agents', slug);
  }
  for (const slug of ['ab', 'acme-studio', 'a1', 'x'.repeat(32)]) {
    const out = await start(door().door, { slug, reach: 'login', label: 'laptop' });
    assert.equal(out.body.value?.verification_uri, `https://brain.dog/app/${slug}/settings/agents`, slug);
  }
});

test('THE SELF-HOST IS NEVER SENT UNDER A SLUG, because it serves no /app/<slug>/api and would answer its own shell', async () => {
  const d = door('brain.dog', 'selfhost');
  const out = await start(d.door, { slug: 'acme', reach: 'login', label: 'laptop' });
  assert.equal(out.status, 200);
  assert.equal(out.body.value?.verification_uri, 'https://brain.dog/app/settings/agents');
});

test('REACHED BY ANOTHER NAME, NOTHING IS STARTED, as before the move', async () => {
  const d = door('app.brain.dog');
  const out = await start(d.door, { slug: 'acme', reach: 'login', label: 'laptop' });
  assert.equal(out.status, 403);
  assert.equal(out.body.refusal?.at, 'verification_uri');
  assert.equal(d.asked.length, 0);
});
