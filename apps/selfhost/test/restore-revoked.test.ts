/**
 * Putting a copy back puts back the rows, and not a credential somebody has since taken away.
 *
 * MEASURED BEFORE THIS FILE: `fileSnapshots.restore` copies every table but
 * `migration` and the search index, so the `token`, `device_grant` and `invitation` rows came back as the copy held
 * them. A token that answered `/api/boot` 200, was revoked (401), and then saw last night's copy restored answered 200
 * again, and nothing said so. An owner who revokes a leaked token and then restores to undo something else has handed
 * the token back.
 *
 * WHAT IS CARRIED IS ONLY WHAT CANNOT BE UNDONE ON PURPOSE. A token revoked since the copy stays revoked, a device grant
 * spent, denied or expired since stays so, and an invitation withdrawn or used since stays dead. Nothing else about the
 * live record survives the restore, because that is what a restore is for.
 *
 * EVERY STEP GOES THROUGH A DOOR A PERSON USES: the token and the operation bearer are presented over the socket, and the
 * restore is the record's own `restore`, which takes the `before-restore` copy and then calls the port.
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
  const dir = mkdtempSync(join(tmpdir(), 'braindog-restore-revoked-'));
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
  const owner = { principal: { kind: 'person' as const, id: person.value.id, level: 'owner' as const }, credentialed: true };

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

  /** A copy, taken as a person takes one, and put back as a person puts one back. */
  const copy = async (): Promise<string> => {
    const snap = await running.api.snapshot({ label: 'now' }, owner);
    assert.ok(snap.ok, JSON.stringify(snap));
    return snap.value.id;
  };
  const restore = async (bookmark: string): Promise<void> => {
    const back = await running.api.restore({ bookmark }, owner);
    assert.ok(back.ok, JSON.stringify(back));
  };

  return {
    api: running.api,
    owner,
    call,
    operation,
    copy,
    restore,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('A TOKEN REVOKED AFTER THE COPY STAYS REVOKED WHEN THE COPY IS PUT BACK, and a token the copy never saw revoked is untouched', async () => {
  const s = await stack();
  try {
    const leaked = await s.api.createToken({ scope: 'write', label: 'leaked' }, s.owner);
    const kept = await s.api.createToken({ scope: 'read', label: 'kept' }, s.owner);
    assert.ok(leaked.ok && kept.ok);
    const { id: leakedId, bearer: leakedBearer } = leaked.value as unknown as { id: string; bearer: string };
    const keptBearer = (kept.value as unknown as { bearer: string }).bearer;
    assert.equal((await s.call('/api/boot', { bearer: leakedBearer })).status, 200);

    const night = await s.copy();
    assert.ok((await s.api.revokeToken({ id: leakedId }, s.owner)).ok);
    assert.equal((await s.call('/api/boot', { bearer: leakedBearer })).status, 401);

    await s.restore(night);
    const after = await s.call('/api/boot', { bearer: leakedBearer });
    assert.equal(after.status, 401, `the revoked token came back with the copy: ${after.raw.slice(0, 120)}`);
    assert.equal((await s.call('/api/boot', { bearer: keptBearer })).status, 200, 'a token nobody revoked was lost with the restore');
  } finally {
    await s.close();
  }
});

test('AN OPERATION GRANT SPENT AFTER THE COPY IS NOT ALIVE AGAIN WHEN THE COPY IS PUT BACK', async () => {
  const s = await stack();
  try {
    const bearer = await s.operation('export');
    const night = await s.copy();
    assert.equal((await s.call('/api/export', { bearer, body: {} })).status, 200);

    await s.restore(night);
    const again = await s.call('/api/export', { bearer, body: {} });
    assert.equal(again.status, 401, `a spent grant exported twice: ${again.raw.slice(0, 120)}`);
  } finally {
    await s.close();
  }
});

test('AN INVITATION WITHDRAWN AFTER THE COPY DOES NOT OPEN AGAIN WHEN THE COPY IS PUT BACK', async () => {
  const s = await stack();
  try {
    const invited = await s.api.invite({ email: 'bea@example.com', level: 'write' }, s.owner);
    assert.ok(invited.ok, JSON.stringify(invited));
    const { invitation, token } = invited.value as unknown as { invitation: { id: string }; token: string };
    assert.ok((await s.api.acceptInvite({ token })).ok, 'the link did not open before anything happened to it');

    const night = await s.copy();
    assert.ok((await s.api.revokeInvite({ id: invitation.id }, s.owner)).ok);
    assert.equal((await s.api.acceptInvite({ token })).ok, false);

    await s.restore(night);
    const looked = await s.api.acceptInvite({ token });
    assert.equal(looked.ok, false, 'the withdrawn link opened again after the restore');
  } finally {
    await s.close();
  }
});

test('A LINK CLOSED AFTER THE COPY STAYS CLOSED WHEN THE COPY IS PUT BACK', async () => {
  const s = await stack();
  try {
    const reg = { id: 'register.notes', kind: 'register' as const, body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never };
    const page = { id: 'page.board', kind: 'page' as const, body: { page: 'board', title: 'Board', requires: ['register.notes'], blocks: [{ kind: 'table', source: 'register.notes', span: 12 }] } as never };
    assert.ok((await s.api.kernel.install([reg, page])).ok);
    const opened = await s.api.openShare({ slug: 'board' }, s.owner);
    assert.ok(opened.ok, JSON.stringify(opened));
    const id = (opened.value as unknown as { id: string }).id;

    const night = await s.copy();
    assert.ok((await s.api.closeShare({ id }, s.owner)).ok);

    await s.restore(night);
    const links = await s.api.shares({}, s.owner);
    assert.ok(links.ok, JSON.stringify(links));
    assert.notEqual(links.value.find((l) => l.id === id)?.closed_at ?? null, null, 'the closed link is open again after the restore');
  } finally {
    await s.close();
  }
});
