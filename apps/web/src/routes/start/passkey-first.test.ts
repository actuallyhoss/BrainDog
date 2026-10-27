/**
 * The passkey, offered straight after the link (use case 6, step 4; `PasskeyFirst.svelte`): in the device's own name,
 * to the person who has none yet, and made in one press named for that device.
 *
 * The component draws `passkeyAsk` and asks `passkeyOffered`; the press is `passkeyRegister` with the device's label,
 * held here against a fake host and authenticator so a passkey made unnamed, or offered to the wrong person, goes red.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { passkeyRegister, platformLabel, type Io } from '../../lib/auth.ts';
import { deviceWord, passkeyAsk, passkeyOffered } from './building.ts';

const IPHONE = { navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 } };
const can = { webauthn: true, secure: true };
const host = (value: { passkey: boolean; me: unknown; firstRun?: boolean }) => ({ ok: true as const, value });

test('THE ASK IS IN THE DEVICE’S OWN NAME, one press and "Not now"', () => {
  const ask = passkeyAsk(platformLabel(IPHONE));
  assert.equal(ask.press, 'Use this iPhone');
  assert.equal(ask.title, 'Sign in with this iPhone from now on');
  assert.match(ask.why, /^This iPhone signs you in with its own lock, with no password to remember/u);
  assert.equal(ask.later, 'Not now');
  assert.equal(passkeyAsk('Windows Hello').press, 'Use Windows Hello');
  assert.deepEqual(deviceWord('Passkey'), { name: 'this device', it: 'This device' }, 'a device the label cannot tell is "this device"');
  for (const line of Object.values(passkeyAsk('Mac'))) {
    assert.doesNotMatch(line, /—|\btoken\b|\bcredential\b|\bWebAuthn\b/iu, `a word a person should not read: ${line}`);
  }
});

test('OFFERED ONLY TO THE PERSON ON THEIR FIRST RUN WITH NONE, on a page that can make one', () => {
  const me = { id: 'p1' };
  assert.equal(passkeyOffered(can, host({ passkey: true, me, firstRun: true })), true);
  assert.equal(passkeyOffered(can, host({ passkey: true, me, firstRun: false })), false, 'somebody with a passkey is asked again');
  assert.equal(passkeyOffered(can, host({ passkey: true, me: null, firstRun: true })), false, 'nobody signed in is asked');
  assert.equal(passkeyOffered(can, host({ passkey: false, me, firstRun: true })), false, 'a host with no passkeys asks');
  assert.equal(passkeyOffered({ webauthn: true, secure: false }, host({ passkey: true, me, firstRun: true })), false, 'an insecure page asks');
  assert.equal(passkeyOffered({ webauthn: false, secure: true }, host({ passkey: true, me, firstRun: true })), false, 'a browser with no passkeys asks');
  assert.equal(passkeyOffered(can, { ok: false }), false);
});

test('ONE PRESS MAKES THE PASSKEY, NAMED FOR THE DEVICE', async () => {
  const sent: { url: string; body: unknown }[] = [];
  const ok = (value: unknown) => new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  const bytes = (...b: number[]) => new Uint8Array(b).buffer;
  const io: Io = {
    fetch: async (url: string, init: RequestInit) => {
      sent.push({ url, body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null });
      if (url === '/auth/passkey/register/options')
        return ok({ challenge: 'AQID', rp: { id: 'brain.dog', name: 'BrainDog' }, user: { id: 'cF8wMQ', name: 'mariam@example.com', displayName: 'Mariam' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }] });
      if (url === '/auth/passkey/register') return ok({ id: 'k1', label: 'iPhone', alg: -7, backedUp: true, createdAt: 1, lastUsed: null });
      return new Response('', { status: 404 });
    },
    credentials: {
      create: async () => ({ id: 'k1', response: { clientDataJSON: bytes(1), attestationObject: bytes(2, 3) } }),
      get: async () => null,
    } as unknown as Io['credentials'],
  };
  const out = await passkeyRegister(io, platformLabel(IPHONE));
  assert.equal(out.ok, true, `the press did not make a passkey: ${JSON.stringify(out)}`);
  const made = sent.find((s) => s.url.endsWith('/auth/passkey/register'));
  assert.equal((made?.body as { label?: unknown } | undefined)?.label, 'iPhone', 'the passkey is not named for the device');
});
