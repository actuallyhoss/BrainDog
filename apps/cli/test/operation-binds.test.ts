/**
 * An operation approval names the one request it is for: the command sends its body's SHA-256 as `binds` when it asks
 * for the code, and says the print the app shows beside it, so the word "token" the person approves cannot be spent on
 * another body. The host holds it there (`boundRequest` in `@braindog/host/auth`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { approveOperation, bodyDigest, bodyPrint } from '../src/login.ts';

const HOST = 'https://brain.example';
const BEARER = `rec_01JZ8QK3F7R2M9V4XN6TCB5HAD.${'g'.repeat(43)}`;

test('THE CODE IS ASKED FOR WITH THE BODY’S HASH, AND THE TERMINAL SAYS ITS PRINT', async () => {
  const body = JSON.stringify({ scope: 'read', label: 'laptop', days: 30 });
  const started: Record<string, unknown>[] = [];
  const said: string[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const sent = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const json = (value: unknown) => new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/device') {
      started.push(sent);
      return json({ device_code: 'p'.repeat(43), user_code: '123456', verification_uri: `${HOST}/connect/approve`, expires_in: 600, interval: 0 });
    }
    return json({ pending: false, bearer: BEARER, reach: 'token', scope: null, expires: '2026-10-30T12:10:00.000Z' });
  };
  const got = await approveOperation(HOST, 'token', { say: (l: string) => void said.push(l), fetch: fetch as typeof globalThis.fetch, label: 'laptop', body });
  assert.deepEqual(got, { bearer: BEARER });
  const binds = createHash('sha256').update(body, 'utf8').digest('hex');
  assert.equal(bodyDigest(body), binds);
  assert.equal(started[0]?.binds, binds);
  assert.ok(said.some((l) => l.includes(bodyPrint(binds))), said.join('\n'));
});

test('WITHOUT A BODY NOTHING IS BOUND, as before', async () => {
  const started: Record<string, unknown>[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const json = (value: unknown) => new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/device') {
      started.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return json({ device_code: 'p'.repeat(43), user_code: '123456', verification_uri: `${HOST}/connect/approve`, expires_in: 600, interval: 0 });
    }
    return json({ pending: false, bearer: BEARER, reach: 'export', scope: null, expires: '2026-10-30T12:10:00.000Z' });
  };
  await approveOperation(HOST, 'export', { say: () => undefined, fetch: fetch as typeof globalThis.fetch, label: 'laptop' });
  assert.equal('binds' in (started[0] ?? {}), false);
});
