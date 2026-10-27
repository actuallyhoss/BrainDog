/**
 * The rename door, `POST /auth/passkey/rename`, over HTTP against a real Directory.
 *
 * A PERSON RENAMES THEIR OWN PASSKEY AND NOBODY ELSE'S, on both hosts, with every check a session route has: the
 * cookie, the origin, a JSON body. A refusal names the fix and never carries the key's id. Sign-up is open, so
 * strangers reach this door; the stranger here is a second person with a session of their own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '@braindog/record/directory';

import { AUTH_ROUTES, serveAuth, type AuthDoor } from '../src/auth.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const ORIGIN = 'https://studio.example';
/* A credential id as a browser reports one: base64url, and nothing a person should ever be shown. */
const ADAS_KEY = 'q2Fkcy1tYWNib29rLXBhc3NrZXk';

type Body = { ok: boolean; value?: Record<string, unknown> | Record<string, unknown>[]; refusal?: { code: string; fix: string; at?: string } };

function setup(on: AuthDoor['on'] = 'selfhost') {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(NOW), { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: ORIGIN }, magic: true });
  const ada = d.person$('ada@example.com', 'Ada');
  const bo = d.person$('bo@example.com', 'Bo');
  assert.ok(ada.ok && bo.ok);
  /* ADA'S PASSKEY, AS A REGISTRATION WOULD HAVE KEPT IT: a rename reads and writes nothing but the row. */
  sql.exec(
    'INSERT INTO dir_passkey (id, person, jwk, alg, sign_count, label, backed_up, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ADAS_KEY,
    ada.value.id,
    '{}',
    -7,
    0,
    'iCloud Keychain',
    1,
    NOW,
  );
  const sent: string[] = [];
  const door: AuthDoor = { on, origin: ORIGIN, auth: d.auth, ip: '203.0.113.9', mail: (_to, link) => void sent.push(link) };
  const call = async (path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) => {
    const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = {
      ...(method === 'POST' ? { origin: ORIGIN, 'content-type': 'application/json' } : {}),
      ...(init.cookie ? { cookie: `__Host-bd_s=${init.cookie}` } : {}),
      ...init.headers,
    };
    const body = init.body === undefined ? {} : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) };
    const res = await serveAuth(new Request(`${ORIGIN}${path}`, { method, headers, ...body }), door);
    const raw = await res.text();
    return { status: res.status, raw, body: JSON.parse(raw) as Body };
  };
  /** A session for `email`, by the mailed link, as a person would have one. */
  const signIn = async (email: string): Promise<string> => {
    await call('/auth/magic/start', { body: { email } });
    const token = /#magic=([A-Za-z0-9_-]{43})$/.exec(sent.at(-1) ?? '')?.[1];
    assert.ok(token, 'no link was mailed');
    const redeemed = await serveAuth(
      new Request(`${ORIGIN}/auth/magic/redeem`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ linkToken: token }) }),
      door,
    );
    const sid = /__Host-bd_s=([^;]+)/.exec(redeemed.headers.getSetCookie()[0] ?? '')?.[1];
    assert.ok(sid, 'no session was set');
    return sid;
  };
  const labels = async (sid: string) => ((await call('/auth/passkeys', { cookie: sid })).body.value as { label: string | null }[]).map((k) => k.label);
  return { call, signIn, labels };
}

test('THE DOOR IS ONE ROW, a POST that needs a session, on both hosts', () => {
  const rows = AUTH_ROUTES.filter((r) => r.flow === 'passkey.rename');
  assert.deepEqual(
    rows.map((r) => [r.path, r.method, r.on, r.needs]),
    [['/auth/passkey/rename', 'POST', 'both', 'session']],
  );
});

for (const on of ['selfhost', 'worker'] as const) {
  test(`A PERSON RENAMES THEIR OWN PASSKEY THROUGH THE DOOR, on the ${on === 'worker' ? 'Worker' : 'self-host'}`, async () => {
    const { call, signIn, labels } = setup(on);
    const ada = await signIn('ada@example.com');
    const out = await call('/auth/passkey/rename', { cookie: ada, body: { id: ADAS_KEY, label: '  Ada\'s\nMacBook  ' } });
    assert.equal(out.status, 200, out.raw);
    assert.equal((out.body.value as { label: string }).label, "Ada's MacBook");
    assert.deepEqual(await labels(ada), ["Ada's MacBook"]);
  });
}

test('AN EMPTY NAME IS REFUSED WITH THE FIX, and the answer carries no id', async () => {
  const { call, signIn, labels } = setup();
  const ada = await signIn('ada@example.com');
  for (const label of ['', '   ', undefined]) {
    const out = await call('/auth/passkey/rename', { cookie: ada, body: { id: ADAS_KEY, ...(label === undefined ? {} : { label }) } });
    assert.equal(out.status, 422);
    assert.deepEqual(out.body, { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'A passkey needs a name. Type one, such as the device it lives on.', at: 'label' } });
    assert.ok(!out.raw.includes(ADAS_KEY), 'the refusal carries the key id');
  }
  assert.deepEqual(await labels(ada), ['iCloud Keychain']);
});

test("A STRANGER CANNOT RENAME ANOTHER PERSON'S PASSKEY, and hears what a key that is not there hears", async () => {
  const { call, signIn, labels } = setup();
  const ada = await signIn('ada@example.com');
  const bo = await signIn('bo@example.com');
  const crossed = await call('/auth/passkey/rename', { cookie: bo, body: { id: ADAS_KEY, label: 'Mine now' } });
  const unknown = await call('/auth/passkey/rename', { cookie: bo, body: { id: 'bm8tc3VjaC1rZXk', label: 'Mine now' } });
  assert.equal(crossed.status, 422);
  assert.equal(crossed.body.refusal?.code, 'OUT_OF_BOUNDS');
  assert.equal(crossed.raw, unknown.raw);
  assert.ok(!crossed.raw.includes(ADAS_KEY), 'the refusal carries the key id');
  assert.deepEqual(await labels(ada), ['iCloud Keychain']);
});

test('THE CHECKS EVERY SESSION ROUTE HAS: no cookie, the wrong verb, another origin, a body that is not JSON', async () => {
  const { call, signIn, labels } = setup();
  const ada = await signIn('ada@example.com');
  const body = { id: ADAS_KEY, label: 'Taken' };
  const nobody = await call('/auth/passkey/rename', { body });
  assert.equal(nobody.status, 401);
  assert.equal(nobody.body.refusal?.code, 'UNAUTHORIZED');
  assert.equal((await call('/auth/passkey/rename', { method: 'GET', cookie: ada })).status, 405);
  assert.equal((await call('/auth/passkey/rename', { cookie: ada, body, headers: { origin: 'https://elsewhere.example' } })).status, 403);
  assert.equal((await call('/auth/passkey/rename', { cookie: ada, body: 'not json' })).status, 400);
  /* A TOKEN IS NOT A SESSION: the session itself as a bearer, or a key in the cookie's place, is the one 401. */
  for (const headers of [{ authorization: `Bearer ${ada}` }, { authorization: 'Bearer bd_agent_key' }]) {
    const out = await call('/auth/passkey/rename', { body, headers });
    assert.equal(out.status, 401, JSON.stringify(headers));
  }
  assert.equal((await call('/auth/passkey/rename', { cookie: 'bd_agent_key', body })).status, 401);
  assert.deepEqual(await labels(ada), ['iCloud Keychain']);
});
