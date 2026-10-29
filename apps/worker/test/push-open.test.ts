/**
 * TAPPING A PUSH OPENS THE THING THAT NEEDS HIM (E44 of the 24 October scope).
 *
 * A push carried no body, so the service worker could only open the app's home. Now the record's job names a path in
 * the record ("/decide/sg_..."), the Worker puts the record's name before it, and the one thing the push carries is
 * `{ open }`, encrypted to the phone's keys (RFC 8291). Read here as a phone would: the body the push service is handed
 * decrypts, with the phone's private key and auth secret, to `/the-studio/decide/<id>` and to nothing else, and a
 * job that names no path still goes with no body.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { b64url } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { delivers, leasedTarget, makeDeliver, type PushAddress } from '../src/deliver.ts';
import { pump, type Leasable } from '../src/pump.ts';
import { encryptPush, vapidKeys, type Vapid } from '../src/vapid.ts';

const NOW = Date.UTC(2026, 9, 24, 12);
const PHONE = 'https://fcm.googleapis.com/fcm/send/ada-phone-7f3a';
const ADA: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** A phone: an ECDH pair and an auth secret, as a browser makes for `PushSubscription`. */
async function phone() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as { publicKey: Key; privateKey: Key };
  const point = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, point, auth, keys: { p256dh: b64url(point), auth: b64url(auth) } };
}

/** The phone's half of RFC 8291: the body back to what was sent, or a throw. */
async function decrypt(p: Awaited<ReturnType<typeof phone>>, body: Uint8Array): Promise<string> {
  const hmac = async (key: Uint8Array, data: Uint8Array) =>
    new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data));
  const enc = (t: string) => new TextEncoder().encode(t);
  const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((x) => [...x]));
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const as = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  const sender = await crypto.subtle.importKey('raw', as, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: sender } as never, p.pair.privateKey, 256));
  const ikm = await hmac(await hmac(p.auth, shared), join(enc('WebPush: info\0'), p.point, as, Uint8Array.of(1)));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']), sealed));
  assert.equal(plain.at(-1), 2, 'the last record ends on the 0x02 delimiter');
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function throwaway(): Promise<Vapid> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const point = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return (await vapidKeys(b64url(point), d!)) as Vapid;
}

test('THE BODY IS THE PATH AND NOTHING ELSE, readable by the phone alone', async () => {
  const p = await phone();
  const body = await encryptPush(p.keys, new TextEncoder().encode('{"open":"/kiln/decide/sg_1"}'));
  assert.equal(await decrypt(p, body), '{"open":"/kiln/decide/sg_1"}');
  /* ANOTHER PHONE CANNOT READ IT. */
  await assert.rejects(decrypt(await phone(), body));
  await assert.rejects(encryptPush({ p256dh: 'short', auth: p.keys.auth }, new Uint8Array(1)));
});

test('A QUESTION\'S PUSH OPENS /<record>/decide/<id> ON A TAP, and one that names no path goes with no body', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), delivers: ['notify.push'] as never });
  assert.ok((await api.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } } as never)).ok);
  const p = await phone();
  assert.ok((await api.subscribePush({ endpoint: PHONE, expirationTime: null, keys: p.keys }, ADA)).ok);
  const sub = sql.one<{ id: string }>('SELECT id FROM push_sub')!.id;

  const sent: { headers: Record<string, string>; body?: Uint8Array }[] = [];
  /* THE RECORD'S NAME BEFORE ITS PATH, as `Record$.pushTargetFor` puts it. */
  const target = leasedTarget(async (args) => {
    const out = api.kernel.pushTarget(args) as { ok: boolean; value: PushAddress | null };
    if (!out.ok || !out.value?.open) return out as never;
    return { ok: true, value: { ...out.value, open: `/the-studio${out.value.open}` } };
  });
  const deliver = makeDeliver({ from: 'notify@brain.example', push: { vapid: await throwaway(), subject: 'mailto:hello@brain.dog', send: async (_e, headers, body) => (sent.push({ headers, ...(body ? { body } : {}) }), { status: 201 }), target } });
  const record: Leasable = {
    lease: async (n = 10) => api.kernel.leaseOutbox(delivers({ VAPID_PUBLIC: 'x', VAPID_PRIVATE: 'y' }), n),
    ack: async (done) => void api.kernel.ackOutbox(done),
  };

  api.kernel.outbox('notify.push', { sub: { id: sub }, open: '/decide/sg_01JQUESTION' });
  api.kernel.outbox('notify.push', { sub: { id: sub } });
  await pump(record, deliver);
  assert.equal(sent.length, 2);
  const opened = sent.find((s) => s.body)!;
  assert.equal(opened.headers['Content-Encoding'], 'aes128gcm');
  assert.deepEqual(JSON.parse(await decrypt(p, opened.body!)), { open: '/the-studio/decide/sg_01JQUESTION' });
  const bare = sent.find((s) => !s.body)!;
  assert.equal(bare.headers['Content-Encoding'], undefined);
  sql.close();
});
