/**
 * Signing a machine in, end to end over a real socket: start, approve from a session, poll to a bearer that reads
 * the record; an expired code; five wrong codes; a device that called by another name; the count per address.
 *
 * ONE CLOCK, MOVED BY THE TEST, as in `signin.test.ts`, so ten minutes is one assignment.
 *
 * AND NOTHING SECRET IN A LOG. Every line the server logs is kept, and at the end of each test none of them holds
 * a six-digit code, a poll id, a bearer, the server key or a session id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../src/server.ts';

const MINUTE = 60_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const LABEL = 'test-laptop · braindog-cli';

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string }; retryAfter?: number } | null;
type Code = { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number };

/** Everything the process logs while a test runs, through every console method the server could use. */
function listen() {
  const lines: string[] = [];
  const kept = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const name of ['log', 'error', 'warn', 'info'] as const) console[name] = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  return { lines, stop: () => Object.assign(console, kept) };
}

/** A self-host with a server key, a Directory holding its owner, and the record they own. */
async function stack(o: { token?: null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-device-'));
  const serverKey = o.token === null ? undefined : randomBytes(32).toString('base64url');
  let now = Date.UTC(2026, 8, 5, 12);
  const logs = listen();
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    ...(serverKey === undefined ? {} : { token: serverKey }),
    sessionKey: new Uint8Array(randomBytes(32)),
    now: () => now,
    pollMs: 0,
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const made = await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);

  const secrets: string[] = serverKey === undefined ? [] : [serverKey];
  /**
   * One request. `/auth/device*` goes as a CLI sends it, with no `Origin`; a write to `/api` with a session carries
   * this origin, as a page would. `by` is the name the socket is reached at, which is what `Host` says.
   */
  const call = async (path: string, init: { body?: unknown; sid?: string; bearer?: string; by?: 'localhost' | '127.0.0.1'; headers?: Record<string, string> } = {}) => {
    const method = init.body === undefined ? 'GET' : 'POST';
    const headers: Record<string, string> = {
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(method === 'POST' && init.sid !== undefined ? { origin } : {}),
      ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}` }),
      ...(init.bearer === undefined ? {} : { authorization: `Bearer ${init.bearer}` }),
      ...init.headers,
    };
    const res = await fetch(`http://${init.by ?? 'localhost'}:${port}${path}`, { method, headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
    const raw = await res.text();
    for (const c of res.headers.getSetCookie()) {
      const sid = /^bd_s=([A-Za-z0-9_-]{43});/.exec(c)?.[1];
      if (sid) secrets.push(sid);
    }
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body, headers: res.headers };
  };

  return {
    call,
    origin,
    advance: (ms: number) => void (now += ms),
    /** A device start that must succeed, its two codes kept as secrets. */
    async begin(): Promise<Code> {
      const out = await call('/auth/device', { body: { reach: 'login', label: LABEL } });
      assert.equal(out.status, 200, out.raw);
      const code = out.body?.value as Code;
      secrets.push(code.user_code, code.device_code);
      return code;
    },
    /** A session from the server key, which proves a sign-in now. */
    async signIn(): Promise<string> {
      const out = await call('/auth/token', { body: { serverKey }, headers: { origin } });
      assert.equal(out.status, 200, out.raw);
      const sid = /^bd_s=([A-Za-z0-9_-]{43});/.exec(out.headers.getSetCookie()[0] ?? '')?.[1];
      return sid ?? assert.fail('no session cookie');
    },
    keep: (secret: string) => void secrets.push(secret),
    /** No line the server logged holds a code, a poll id, a bearer, the key or a session id. */
    clean() {
      for (const line of logs.lines) for (const secret of secrets) assert.ok(!line.includes(secret), 'a secret reached a log line');
    },
    async close() {
      logs.stop();
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('START, APPROVE FROM A SESSION, AND POLL TO A BEARER THAT READS THE RECORD, ONCE', async () => {
  const s = await stack();
  try {
    const code = await s.begin();
    assert.match(code.user_code, /^\d{6}$/);
    assert.equal(code.verification_uri, `${s.origin}/connect/approve`);
    assert.equal(code.expires_in, 600);
    assert.equal(code.interval, 5);

    const waiting = await s.call('/auth/device/token', { body: { device_code: code.device_code } });
    assert.equal(waiting.status, 200);
    assert.deepEqual(waiting.body?.value, { pending: true, interval: 5 });

    const sid = await s.signIn();
    const looked = await s.call('/api/deviceLook', { sid, body: { user_code: code.user_code } });
    assert.equal(looked.status, 200, looked.raw);
    const approved = await s.call('/api/deviceApprove', { sid, body: { user_code: code.user_code, handle: looked.body?.value?.handle } });
    assert.equal(approved.status, 200, approved.raw);
    const handle = String(approved.body?.value?.handle);

    const exchanged = await s.call('/auth/device/token', { body: { device_code: code.device_code } });
    assert.equal(exchanged.status, 200, exchanged.raw);
    const bearer = String(exchanged.body?.value?.bearer);
    s.keep(bearer);
    assert.ok(bearer.startsWith(`${REC}.`));
    assert.equal((await s.call('/api/boot', { bearer })).status, 200, 'the bearer the device took does not read the record');

    /* A bearer never approves another device, and the poll id is spent. */
    const agent = await s.call('/api/deviceApprove', { bearer, body: { user_code: code.user_code } });
    assert.equal(agent.status, 403);
    assert.equal(agent.body?.refusal?.code, 'NEEDS_BROWSER_SESSION');
    const twice = await s.call('/auth/device/token', { body: { device_code: code.device_code } });
    assert.equal(twice.status, 403);

    const listed = await s.call('/api/listDevices', { sid });
    assert.equal(listed.status, 200);
    assert.ok(!listed.raw.includes(code.device_code) && !listed.raw.includes(bearer), 'the listing carries a secret');
    assert.equal((listed.body?.value as unknown as { handle: string; status: string }[])[0]?.status, 'active');

    assert.equal((await s.call('/api/revokeDevice', { sid, body: { handle } })).status, 200);
    assert.equal((await s.call('/api/boot', { bearer })).status, 401, 'a revoked device still reads the record');
    s.clean();
  } finally {
    await s.close();
  }
});

test('A CODE NOBODY APPROVED IN TEN MINUTES HAS EXPIRED', async () => {
  const s = await stack();
  try {
    const code = await s.begin();
    s.advance(10 * MINUTE + 1);
    const late = await s.call('/auth/device/token', { body: { device_code: code.device_code } });
    assert.equal(late.status, 422);
    assert.equal(late.body?.refusal?.code, 'DEVICE_CODE_EXPIRED');
    s.clean();
  } finally {
    await s.close();
  }
});

test('FIVE WRONG CODES DENY THE WAITING DEVICE, AND THE RIGHT CODE DOES NOTHING AFTER', async () => {
  const s = await stack();
  try {
    const code = await s.begin();
    const sid = await s.signIn();
    const wrong = String((Number(code.user_code) + 1) % 1_000_000).padStart(6, '0');
    for (let i = 0; i < 4; i++) {
      const miss = await s.call('/api/deviceLook', { sid, body: { user_code: wrong } });
      assert.equal(miss.status, 403, miss.raw);
      assert.equal(miss.body?.refusal?.code, 'FORBIDDEN');
    }
    const fifth = await s.call('/api/deviceLook', { sid, body: { user_code: wrong } });
    assert.equal(fifth.status, 422);
    assert.equal(fifth.body?.refusal?.code, 'DEVICE_CODE_TRIES');

    const denied = await s.call('/auth/device/token', { body: { device_code: code.device_code } });
    assert.equal(denied.status, 422);
    assert.equal(denied.body?.refusal?.code, 'DEVICE_CODE_TRIES');
    assert.equal((await s.call('/api/deviceLook', { sid, body: { user_code: code.user_code } })).status, 403);
    s.clean();
  } finally {
    await s.close();
  }
});

test('A DEVICE THAT CALLED BY ANOTHER NAME, OR A PAGE ELSEWHERE, IS NOT GIVEN A CODE', async () => {
  const s = await stack();
  try {
    /* The origin is http://localhost:<port>. Reached as 127.0.0.1, the address to approve at would not be the one called. */
    const foreign = await s.call('/auth/device', { by: '127.0.0.1', body: { reach: 'login', label: LABEL } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.body?.refusal?.at, 'verification_uri');
    assert.equal(foreign.body?.value, undefined);

    const page = await s.call('/auth/device', { body: { reach: 'login', label: LABEL }, headers: { origin: 'https://evil.example' } });
    assert.equal(page.status, 403);
    assert.equal(page.body?.refusal?.at, 'origin');
    s.clean();
  } finally {
    await s.close();
  }
});

test('STARTS ARE LIMITED PER ADDRESS: THE ELEVENTH WAITS FIFTEEN MINUTES, WITH Retry-After', async () => {
  const s = await stack();
  try {
    for (let i = 0; i < 10; i++) await s.begin();
    const eleventh = await s.call('/auth/device', { body: { reach: 'login', label: LABEL } });
    assert.equal(eleventh.status, 429);
    assert.equal(eleventh.headers.get('retry-after'), '900');
    assert.deepEqual(eleventh.body, { ok: false, retryAfter: 900 });

    s.advance(15 * MINUTE + 1);
    await s.begin();
    s.clean();
  } finally {
    await s.close();
  }
});

test('AN OPEN SELF-HOST SIGNS NO DEVICE IN: it needs no bearer, and nobody on it could approve one', async () => {
  const s = await stack({ token: null });
  try {
    const out = await s.call('/auth/device', { body: { reach: 'login', label: LABEL } });
    assert.equal(out.status, 404);
    assert.equal(out.body?.refusal?.code, 'ROUTE_UNKNOWN');
  } finally {
    await s.close();
  }
});
