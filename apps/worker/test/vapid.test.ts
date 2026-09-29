/**
 * Web Push from the Worker, content-free, signed with VAPID over WebCrypto. `09 §3`, `51 §5` (`notify.push`), RFC 8292.
 *
 * THE KEYS HERE ARE MADE IN MEMORY AND THROWN AWAY. No VAPID pair is written to this repository, in a test or
 * anywhere else: the real one is his to generate and put in, and a
 * fixture that looked like one is a secret somebody eventually pastes into production because it was lying there.
 *
 * WHAT IS ASSERTED IS WHAT A PUSH SERVICE CHECKS. FCM, Mozilla and Apple each verify the JWT against the `k=` key in
 * the same header, refuse an `aud` that is not the endpoint's origin, and refuse an `exp` more than 24 hours out
 * (RFC 8292 §2). None of that is reachable from here, so the test does what they do: verify the signature with the
 * public half and read the two claims. A token that verified only against the key it was made with in the same
 * process would prove nothing; the verify below imports the public key from the base64url the header carries.
 *
 * AND AN UNKEYED DEPLOYMENT IS EXACTLY TODAY'S. Until he puts the pair in, `notify.push` is not leased, so a push job
 * sits `pending` as it always has instead of walking the ladder to a dead letter that says "no keys" eight times.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { b64url } from '@braindog/kernel';

import { DELIVERS, delivers, leasedTarget, makeDeliver } from '../src/deliver.ts';
import { vapidJwt, vapidKeys, type Vapid } from '../src/vapid.ts';

const fromB64url = (text: string): Uint8Array =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

/** A throwaway P-256 pair in the two strings `web-push generate-vapid-keys` prints: a 65-byte point and a 32-byte scalar. */
async function throwaway(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const point = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(point), privateKey: d! };
}

async function keyed(): Promise<{ vapid: Vapid; publicKey: string }> {
  const pair = await throwaway();
  const vapid = await vapidKeys(pair.publicKey, pair.privateKey);
  assert.ok(typeof vapid !== 'string', `a fresh pair was refused: ${String(vapid)}`);
  return { vapid, publicKey: pair.publicKey };
}

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91b-example';
const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);

const job = (payload: unknown) => ({
  id: '01ABCDEFGHJKMNPQRSTVWXYZ01',
  kind: 'notify.push' as const,
  payload: JSON.stringify(payload),
  attempts: 0,
  leasedUntil: '2026-09-23T12:01:00.000Z',
});

const threw = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  assert.fail('this was supposed to fail');
};

/* ── the token ───────────────────────────────────────────────────────────── */

test('THE JWT VERIFIES WITH THE PUBLIC KEY, names the endpoint origin as aud, and expires inside 24 hours', async () => {
  const { vapid, publicKey } = await keyed();
  const jwt = await vapidJwt(vapid, ENDPOINT, 'mailto:hello@brain.dog', NOW);

  const [head, body, sig] = jwt.split('.');
  assert.ok(head && body && sig, `not three parts: ${jwt}`);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromB64url(head))), { typ: 'JWT', alg: 'ES256' });

  /* ES256 in a JWT is r||s, 64 bytes, and WebCrypto's ECDSA sign returns exactly that (not DER). A signer that
     handed back DER would be 70 or 71 bytes and every push service would answer 403. */
  assert.equal(fromB64url(sig).length, 64);

  const pub = await crypto.subtle.importKey('raw', fromB64url(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(sig), new TextEncoder().encode(`${head}.${body}`));
  assert.equal(ok, true, 'the signature does not verify under the public key the header will carry');

  const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as { aud: string; exp: number; sub: string };
  assert.equal(claims.aud, 'https://fcm.googleapis.com', 'aud must be the origin alone: no path, no trailing slash');
  assert.equal(claims.sub, 'mailto:hello@brain.dog');
  assert.ok(claims.exp > NOW / 1000, 'already expired');
  assert.ok(claims.exp - NOW / 1000 <= 24 * 3600, `exp is ${claims.exp - NOW / 1000} s out, and a push service refuses more than 24 h`);
});

test('A PAIR THAT IS NOT A PAIR IS REFUSED WHEN IT IS READ, not by every push service one job at a time', async () => {
  /* Two keys from two runs of the generator is the likeliest mistake an operator makes here, and it is invisible
     until a phone stays silent: every POST answers 403 and the ladder dead-letters each push with a status code. */
  const a = await throwaway();
  const b = await throwaway();
  assert.match(String(await vapidKeys(a.publicKey, b.privateKey)), /VAPID_PUBLIC and VAPID_PRIVATE are not one pair/);
  assert.match(String(await vapidKeys('not-a-key', a.privateKey)), /VAPID_PUBLIC/);
  assert.match(String(await vapidKeys(a.publicKey, 'AAAA')), /VAPID_PRIVATE/);
});

test('THE k= KEY IS SENT AS BASE64URL WITHOUT PADDING, whatever padding the pasted var carried', async () => {
  /* The web half forgives a trailing `=` on VAPID_PUBLIC (`keyBytes` in `apps/web/src/lib/ui/push.ts`), so a padded
     paste subscribes a phone. This half accepted the same paste and echoed it into `k=` as typed, `=` and all, and
     RFC 8292 §3.2 has that value unpadded base64url. Measured before the repair: `k=` ended in `=`. */
  const pair = await throwaway();
  const vapid = await vapidKeys(`${pair.publicKey}=`, pair.privateKey);
  assert.ok(typeof vapid !== 'string', `a padded public key was refused: ${String(vapid)}`);
  assert.equal(vapid.publicKey, pair.publicKey);
});

/* ── which kinds are leased ──────────────────────────────────────────────── */

test('WITHOUT BOTH KEYS THE LEASED LIST IS TODAY’S, and with both it adds notify.push', () => {
  const today = ['notify.email', 'notify.webhook', 'erase.r2'];
  assert.deepEqual(DELIVERS, today);
  assert.deepEqual(delivers({}), today);
  assert.deepEqual(delivers({ VAPID_PUBLIC: '', VAPID_PRIVATE: '' }), today, 'the var is declared empty in wrangler.jsonc');
  assert.deepEqual(delivers({ VAPID_PUBLIC: 'BPub', VAPID_PRIVATE: undefined }), today, 'the var without the secret');
  assert.deepEqual(delivers({ VAPID_PUBLIC: '  ', VAPID_PRIVATE: 'priv' }), today, 'the secret without the var');
  assert.deepEqual(delivers({ VAPID_PUBLIC: 'BPub', VAPID_PRIVATE: 'priv' }), [...today, 'notify.push']);
});

/* ── the delivery ────────────────────────────────────────────────────────── */

type Sent = { endpoint: string; headers: Record<string, string> };

/* THE RECORD'S HALF, FAKED: the endpoint behind whatever id the leased job names. The real one is `pushTarget` under the
   lease, and `push-deliver.test.ts` runs this whole path against it. */
const at = (endpoint: string | null) => async () => endpoint;
const JOB = { sub: { id: 'ps_01JZ8QK3F7R2M9V4XN6TCB5HAF' } };

test('A PUSH IS A POST WITH NO BODY, a TTL and the VAPID header, to the endpoint the subscription named', async () => {
  const { vapid, publicKey } = await keyed();
  const sent: Sent[] = [];
  const deliver = makeDeliver({
    push: { vapid, subject: 'mailto:hello@brain.dog', send: async (endpoint, headers) => (sent.push({ endpoint, headers }), { status: 201 }), target: at(ENDPOINT) },
  });

  /* WORDS A PAYLOAD CARRIES ARE NOT SENT. The kernel queues `{ sub: { id } }` alone now, and a row an older build wrote
     still carries a title; `09 §3` says one line and no content, and a push with no body needs no payload encryption. */
  const out = await deliver(job({ ...JOB, title: 'Invoices: 3 overdue', url: '/digest/1' }));
  assert.equal(out, undefined, 'a delivered push acks done with no result');

  assert.equal(sent.length, 1);
  const [{ endpoint, headers }] = sent as [Sent];
  assert.equal(endpoint, ENDPOINT);
  assert.equal(JSON.stringify(headers).includes('Invoices'), false, 'the notice words reached the push service');
  assert.match(headers['TTL'] ?? '', /^\d+$/);
  const auth = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(headers['Authorization'] ?? '');
  assert.ok(auth, `not an RFC 8292 header: ${headers['Authorization']}`);
  assert.equal(auth[2], publicKey);
  /* No body means nothing for a content header to describe, and a push service reads a `Content-Type` with no
     `Content-Encoding: aes128gcm` as a malformed encrypted payload. */
  assert.deepEqual(Object.keys(headers).sort(), ['Authorization', 'TTL']);
});

test('A 404 OR 410 IS ACKED AS { gone: true }, so the record drops the subscription; anything else not 2xx fails', async () => {
  const { vapid } = await keyed();
  for (const status of [404, 410]) {
    const deliver = makeDeliver({ push: { vapid, subject: 'mailto:hello@brain.dog', send: async () => ({ status }), target: at(ENDPOINT) } });
    assert.deepEqual(await deliver(job(JOB)), { gone: true }, `status ${status}`);
  }
  /* A 403 is a key the service does not accept, a 429 is a service asking for less, and a 500 is the service's
     afternoon. None of them says the phone is gone, so none of them drops a subscription. */
  for (const status of [301, 400, 403, 413, 429, 500]) {
    const deliver = makeDeliver({ push: { vapid, subject: 'mailto:hello@brain.dog', send: async () => ({ status }), target: at(ENDPOINT) } });
    assert.match(await threw(() => deliver(job(JOB))), new RegExp(`answered ${status}`), `status ${status}`);
  }
});

test('AN ENDPOINT THAT IS NOT A PUBLIC HTTPS ADDRESS IS NEVER POSTED TO, and a deployment without keys says so', async () => {
  /* The endpoint came out of a browser and was stored by the record, so it is data somebody else wrote. The same
     `postable()` a webhook goes through keeps it off the metadata service. */
  const { vapid } = await keyed();
  const sent: string[] = [];
  const send = async (e: string) => (sent.push(e), { status: 201 });
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://localhost./x', ''])
    assert.match(await threw(() => makeDeliver({ push: { vapid, subject: 'mailto:hello@brain.dog', send, target: at(endpoint) } })(job(JOB))), /https address on a public host/, endpoint);
  assert.equal(sent.length, 0);

  assert.match(await threw(() => makeDeliver({})(job(JOB))), /VAPID/);

  // A pair `vapidKeys` refused dead-letters every push with its sentence, never a request.
  const refused = makeDeliver({ push: { vapid: 'VAPID_PUBLIC and VAPID_PRIVATE are not one pair', subject: 'mailto:hello@brain.dog', send, target: at(ENDPOINT) } });
  assert.match(await threw(() => refused(job(JOB))), /not one pair/);
  assert.deepEqual(sent, []);
});

test('THE JOB NAMES A SUBSCRIPTION BY ID, AND AN ENDPOINT IN THE PAYLOAD IS NEVER READ', async () => {
  /* The deliverer once posted to `payload.sub.endpoint`, which is the shape an endpoint in every `.brain` export would take. A payload
     that still says one is read for its id, and a `sub` with no id is a dead letter that says so, not a guess. */
  const { vapid } = await keyed();
  const sent: string[] = [];
  const asked: string[] = [];
  const deliver = makeDeliver({
    push: { vapid, subject: 'mailto:hello@brain.dog', send: async (e) => (sent.push(e), { status: 201 }), target: async (j) => (asked.push(j.id), ENDPOINT) },
  });
  assert.match(await threw(() => deliver(job({ sub: { endpoint: 'https://push.attacker.example/x' } }))), /names the subscription it rings, by id/);
  /* AND A ROW AN OLDER BUILD QUEUED, WITH NO `sub` AT ALL, IS NOBODY TO RING, as the kernel's `pushSubOf` reads it: done,
     and neither the record nor a push service is asked. `test/push-deliver.test.ts` has why it is not a dead letter. */
  assert.equal(await deliver(job({ title: 'an older build wrote this', url: '/' })), undefined);
  assert.deepEqual([sent, asked], [[], []], 'a job naming no id reached the record or the push service');

  /* NOBODY LEFT TO RING, because the person unsubscribed after the job was queued: done, and nothing sent. */
  const gone = makeDeliver({ push: { vapid, subject: 'mailto:hello@brain.dog', send: async (e) => (sent.push(e), { status: 201 }), target: at(null) } });
  assert.equal(await gone(job(JOB)), undefined);
  assert.deepEqual(sent, []);
});

test('THE LEASE IS ASKED WITH THE JOB IT CAME WITH, and a refusal is the sentence the dead letter keeps', async () => {
  const asked: { outbox: string; leasedUntil: string }[] = [];
  const target = leasedTarget(async (args) => (asked.push(args), { ok: true as const, value: { id: 'ps_1', endpoint: ENDPOINT } }));
  assert.equal(await target(job(JOB)), ENDPOINT);
  assert.deepEqual(asked, [{ outbox: '01ABCDEFGHJKMNPQRSTVWXYZ01', leasedUntil: '2026-09-23T12:01:00.000Z' }]);
  const refusing = leasedTarget(async () => ({ ok: false as const, refusal: { code: 'PULL_LEASE_EDGE', fix: 'The lease on 01ABC ran out.' } }));
  assert.match(await threw(() => refusing(job(JOB))), /lease on 01ABC ran out/);
});
