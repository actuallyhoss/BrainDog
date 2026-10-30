/**
 * The Mac app's way back from an emailed link opened in a browser: the handoff seals the unspent link to the app's
 * challenge, and only the app's window, with the verifier, can spend it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import type { AuthCall, AuthResult } from '@braindog/ports';

import { serveDesktop, type DesktopDoor } from '../src/desktop-signin.ts';

const ORIGIN = 'https://app.brain.dog';
const NOW = Date.UTC(2026, 9, 31, 12);
const SECRET = 'k'.repeat(40);
const LINK = 'L'.repeat(43);
const SID = 'S'.repeat(43);
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function door() {
  const asked: AuthCall[] = [];
  const d: DesktopDoor = {
    origin: ORIGIN,
    mode: 'secure',
    ip: '203.0.113.9',
    secret: SECRET,
    now: () => NOW,
    ask: async (call): Promise<AuthResult> => {
      asked.push(call);
      return { status: 200, body: {}, session: { sid: SID } };
    },
  };
  return { d, asked };
}

const post = (d: DesktopDoor, path: '/auth/desktop' | '/auth/desktop/handoff', body: unknown, origin = ORIGIN) =>
  serveDesktop(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) }), path, d);

async function handed(d: DesktopDoor): Promise<string> {
  const res = await post(d, '/auth/desktop/handoff', { linkToken: LINK, challenge: CHALLENGE });
  assert.equal(res.status, 200);
  return ((await res.json()) as { value: { code: string } }).value.code;
}

test('THE HANDOFF SPENDS NOTHING AND SETS NO COOKIE, and the code does not carry the link readable', async () => {
  const { d, asked } = door();
  const code = await handed(d);
  assert.equal(asked.length, 0, 'the Directory was asked during the handoff');
  for (const part of code.split('.')) assert.notEqual(part, LINK);
  assert.ok(!code.includes(LINK));
});

test('THE APP SWAPS THE CODE WITH ITS VERIFIER, and the link is spent there', async () => {
  const { d, asked } = door();
  const code = await handed(d);
  const ok = await post(d, '/auth/desktop', { code, verifier: VERIFIER });
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.getSetCookie().some((c) => c.startsWith(`__Host-bd_s=${SID}; `)));
  assert.deepEqual(asked.at(-1), { flow: 'magic.redeem', linkToken: LINK, ip: '203.0.113.9' });
});

test('A CODE OPENS NOTHING with another verifier or after two minutes', async () => {
  const { d } = door();
  const code = await handed(d);
  assert.notEqual((await post(d, '/auth/desktop', { code, verifier: 'w'.repeat(43) })).status, 200);
  d.now = () => NOW + 121_000;
  assert.notEqual((await post(d, '/auth/desktop', { code, verifier: VERIFIER })).status, 200);
});

test('THE HANDOFF IS REFUSED from another origin, without the secret, or in any other shape', async () => {
  const { d } = door();
  assert.equal((await post(d, '/auth/desktop/handoff', { linkToken: LINK, challenge: CHALLENGE }, 'https://evil.example')).status, 403);
  assert.equal((await post(d, '/auth/desktop/handoff', { linkToken: LINK, challenge: 'short' })).status, 400);
  assert.equal((await post(d, '/auth/desktop/handoff', { linkToken: 'not a token!', challenge: CHALLENGE })).status, 400);
  assert.equal((await post({ ...d, secret: 'short' }, '/auth/desktop/handoff', { linkToken: LINK, challenge: CHALLENGE })).status, 403);
  const got = await serveDesktop(new Request(`${ORIGIN}/auth/desktop/handoff`), '/auth/desktop/handoff', d);
  assert.equal(got.status, 405);
});
