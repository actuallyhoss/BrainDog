/**
 * An operation bearer is spent only by a request that could have used it: a POST, under this record's own name.
 *
 * MEASURED BEFORE THIS FILE: `contextFor` was handed the path's method name as the
 * door for any HTTP method and under any slug, and `bearerFor` spent the grant as soon as that name was one of the four.
 * `GET /api/export` spent it and then `serveApi` answered 405 "export changes the record, so it is a POST.", and
 * `POST /not-this-one/api/export` spent it and then the slug was refused 403 "You are not on this BrainDog.". In both
 * cases the right request that followed was 401, and the person had to approve on their phone again for nothing.
 *
 * THE STACK IS `operation-bearer.test.ts`'s, the device flow as the CLI drives it, so the bearer is the one a real
 * `braindog export` holds and not a row this file wrote.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string } } | null;

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-operation-doors-'));
  const serverKey = randomBytes(32).toString('base64url');
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    pollMs: 0,
  });
  const origin = `http://localhost:${(running.server.address() as { port: number }).port}`;
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.com', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);

  const call = async (path: string, init: { method?: string; body?: unknown; sid?: string; bearer?: string; page?: true } = {}) => {
    const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(init.sid === undefined && init.page === undefined ? {} : { origin }),
        ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}` }),
        ...(init.bearer === undefined ? {} : { authorization: `Bearer ${init.bearer}` }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const raw = await res.text();
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body, headers: res.headers };
  };

  const operation = async (reach: 'export' | 'import'): Promise<string> => {
    const started = await call('/auth/device', { body: { reach, label: 'test-laptop · braindog-cli' } });
    assert.equal(started.status, 200, started.raw);
    const code = started.body?.value as { device_code: string; user_code: string };
    const signed = await call('/auth/token', { body: { serverKey }, page: true });
    const sid = /^bd_s=([A-Za-z0-9_-]{43});/.exec(signed.headers.getSetCookie()[0] ?? '')?.[1] ?? assert.fail(signed.raw);
    const looked = await call('/api/deviceLook', { sid, body: { user_code: code.user_code } });
    assert.equal(looked.status, 200);
    assert.equal((await call('/api/deviceApprove', { sid, body: { user_code: code.user_code, handle: looked.body?.value?.handle } })).status, 200);
    const polled = await call('/auth/device/token', { body: { device_code: code.device_code } });
    assert.equal(polled.status, 200, polled.raw);
    return String(polled.body?.value?.bearer);
  };

  return {
    call,
    operation,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('A GET AT AN OPERATION’S DOOR DOES NOT SPEND IT: the 405 comes back and the POST after it still exports', async () => {
  const s = await stack();
  try {
    const bearer = await s.operation('export');
    for (const method of ['GET', 'HEAD', 'PUT']) {
      const wrong = await s.call('/api/export', { method, bearer });
      assert.notEqual(wrong.status, 200, `${method} ${wrong.raw}`);
    }
    const post = await s.call('/api/export', { bearer, body: {} });
    assert.equal(post.status, 200, `a GET spent the grant: ${post.raw}`);
    assert.ok(Array.isArray(post.body?.value), 'the export is not a file');
  } finally {
    await s.close();
  }
});

test('A NAME THAT IS NOT THIS RECORD’S DOES NOT SPEND IT, and the same bearer then exports at the root and under the record’s own name', async () => {
  const s = await stack();
  try {
    const first = await s.operation('export');
    const elsewhere = await s.call('/not-this-one/api/export', { bearer: first, body: {} });
    assert.notEqual(elsewhere.status, 200, elsewhere.raw);
    const root = await s.call('/api/export', { bearer: first, body: {} });
    assert.equal(root.status, 200, `a wrong slug spent the grant: ${root.raw}`);

    /* AND UNDER ITS OWN NAME IT IS STILL A DOOR, so the check is the slug and not "any slug at all". */
    const second = await s.operation('export');
    const named = await s.call('/the-studio/api/export', { bearer: second, body: {} });
    assert.equal(named.status, 200, named.raw);
  } finally {
    await s.close();
  }
});
