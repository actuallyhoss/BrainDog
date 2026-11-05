/**
 * An operation bearer over the socket: a device grant of reach `export` or `import`, approved from a session, reaches
 * its one method once and nothing else (`48 §5.2`, `49 §5.2` step 7).
 *
 * MEASURED AT 1586f2a2, BEFORE THIS FILE: the record had `operationGrant` and an `admin` that admits a context
 * carrying `operation`, and no host built one. The self-host's `bearerFor` asked `verifyToken`, which reads the `token`
 * table, and an operation bearer lives in `device_grant`, so `POST /api/export` with the bearer the device had just been
 * handed answered 401 "This BrainDog does not know that credential." `braindog export` against a self-host had a bearer
 * and no door.
 *
 * THE ORDER OF THE CHECKS IS WHAT IS PROVED. The grant is spent only at one of the four doors an operation can open, so a
 * bearer sent to `/api/boot` by mistake is refused and is still good at its own door; at the wrong one of the four it is
 * spent and refused, which is the record's gate and not this file's.
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
  const dir = mkdtempSync(join(tmpdir(), 'braindog-operation-'));
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
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.com', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);

  /**
   * One request. `/auth/device*` goes as the CLI sends it, with no `Origin`; the sign-in and a write with a session carry
   * this origin, as a page does, because measured without it the sign-in answered 403 "Sign-in is answered only for
   * pages on http://localhost:<port>." and no session was ever made to approve with.
   */
  const call = async (path: string, init: { body?: unknown; sid?: string; bearer?: string; page?: true } = {}) => {
    const method = init.body === undefined ? 'GET' : 'POST';
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        ...(init.sid === undefined && init.page === undefined ? {} : { origin }),
        ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}` }),
        ...(init.bearer === undefined ? {} : { authorization: `Bearer ${init.bearer}` }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const raw = await res.text();
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body, headers: res.headers };
  };

  /** A bearer for one operation, as the CLI gets it: start, approve from a session signed in with the server key, poll. */
  const operation = async (reach: 'export' | 'import'): Promise<string> => {
    const started = await call('/auth/device', { body: { reach, label: 'test-laptop · braindog-cli' } });
    assert.equal(started.status, 200, started.raw);
    const code = started.body?.value as { device_code: string; user_code: string };
    const signed = await call('/auth/token', { body: { serverKey }, page: true });
    const sid = /^bd_s=([A-Za-z0-9_-]{43});/.exec(signed.headers.getSetCookie()[0] ?? '')?.[1] ?? assert.fail(signed.raw);
    const looked = await call('/api/deviceLook', { sid, body: { user_code: code.user_code } });
    const approved = await call('/api/deviceApprove', { sid, body: { user_code: code.user_code, handle: looked.body?.value?.handle } });
    assert.equal(approved.status, 200, approved.raw);
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

test('AN EXPORT BEARER EXPORTS ONCE, and the second presentation is told what a stranger is told', async () => {
  const s = await stack();
  try {
    const bearer = await s.operation('export');
    assert.ok(bearer.startsWith(`${REC}.`));

    /* A DOOR THAT IS NOT AN OPERATION'S DOES NOT SPEND IT. */
    const boot = await s.call('/api/boot', { bearer });
    assert.equal(boot.status, 401, boot.raw);

    const first = await s.call('/api/export', { bearer, body: {} });
    assert.equal(first.status, 200, first.raw);
    assert.ok(Array.isArray(first.body?.value) && (first.body.value as unknown as string[])[0]?.startsWith('#dogl'), 'the export is not a file');

    const second = await s.call('/api/export', { bearer, body: {} });
    assert.equal(second.status, 401, second.raw);
    assert.equal(second.body?.refusal?.code, 'UNAUTHORIZED');
  } finally {
    await s.close();
  }
});

test('AN IMPORT BEARER OPENS IMPORT AND NOT EXPORT, and a bearer spent at the wrong door is gone', async () => {
  const s = await stack();
  try {
    const wrong = await s.operation('import');
    const exported = await s.call('/api/export', { bearer: wrong, body: {} });
    assert.equal(exported.status, 403, exported.raw);
    assert.equal(exported.body?.refusal?.code, 'FORBIDDEN');
    assert.equal((await s.call('/api/import', { bearer: wrong, body: { lines: [] } })).status, 401, 'a bearer refused at the wrong door was still good');

    /* AT ITS OWN DOOR THE RECORD ANSWERS, which is the record's refusal for these lines and not the host's 401. */
    const right = await s.operation('import');
    const imported = await s.call('/api/import', { bearer: right, body: { lines: ['not a file'] } });
    assert.notEqual(imported.status, 401, imported.raw);
    assert.notEqual(imported.status, 403, imported.raw);
    assert.equal(imported.body?.ok, false);
  } finally {
    await s.close();
  }
});
