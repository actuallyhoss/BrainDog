/**
 * A digest's webhook is signed with the key it names, or it is not sent (KRN-13, delivery half).
 *
 * MEASURED AT afb3b1b2, BEFORE THIS FILE: `digest.ts` queued `notify.webhook { url, body, grant: 'collector' }`, and
 * `makeDeliver` read `url` and `body` and posted. `Transports.post` took no headers, `payload.grant` was never read, and
 * the POST left with a content type and nothing that said who sent it. The receiver could not tell this record's
 * digest from anybody's JSON. `49 §5.12` and `51 §5.11` both promise a signature; neither was built.
 *
 * THE SIGNATURE IS HMAC-SHA256 OVER THE RAW BODY, IN `x-braindog-signature` AS `sha256=<hex>`. That is the shape this
 * product's own inbound `verify: hmac_sha256` reads (`packages/host/src/ingest.ts`, prefix taken off, lower-case hex),
 * so one record can take another's digest as a verified arrival with nothing between them.
 *
 * AND A KEY THAT IS NAMED AND CANNOT BE OPENED IS A DEAD LETTER, NEVER AN UNSIGNED POST. A receiver that checks
 * signatures drops an unsigned body, and one that does not has just been sent the owner's rows by a record that was
 * told to sign them. Either way the post that went is the wrong one, so none goes and the ladder says why.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';

import { createRecordApi } from '@braindog/record';
import { grantAad, grantKey, seal } from '@braindog/host';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { leasedOpener, makeDeliver, SIGNATURE_HEADER, type OpenPostKey } from '../src/deliver.ts';
import { keyStoreOf, recordKeys, unwrap } from '../src/keys.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const URL_ = 'https://collector.example.com/in';
const BODY = '{"digest":"monday","sections":[{"id":"overdue","rows":2}]}';

const job = (payload: unknown) => ({
  id: '01ABCDEFGHJKMNPQRSTVWXYZ01',
  kind: 'notify.webhook' as const,
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

type Posted = { url: string; body: string; headers: Record<string, string> };
const poster = () => {
  const posted: Posted[] = [];
  return { posted, post: async (url: string, body: string, headers: Record<string, string> = {}) => (posted.push({ url, body, headers }), { ok: true, status: 202 }) };
};

const utf8 = (s: string) => new TextEncoder().encode(s);

test('A POST THAT NAMES A KEY IS SIGNED WITH IT: HMAC-SHA256 over the raw body, sha256=<hex>', async () => {
  const secret = `bd_fake_webhook_secret_${randomBytes(12).toString('hex')}`;
  const asked: string[] = [];
  const open: OpenPostKey = async (_job, grant) => (asked.push(grant), { ok: true, secret: utf8(secret) });
  const { posted, post } = poster();

  await makeDeliver({ post, open })(job({ url: URL_, body: BODY, grant: 'collector' }));

  assert.deepEqual(asked, ['collector'], 'the key the payload names was not the key asked for');
  assert.equal(posted.length, 1);
  assert.equal(posted[0]?.body, BODY, 'the body was re-serialised, so the signature covers bytes the receiver never sees');
  /* NODE'S HMAC, NOT THE CODE UNDER TEST, says what the header must be. */
  assert.equal(posted[0]?.headers[SIGNATURE_HEADER], `sha256=${createHmac('sha256', secret).update(BODY).digest('hex')}`);
  assert.equal(SIGNATURE_HEADER, 'x-braindog-signature');
  assert.ok(!JSON.stringify(posted).includes(secret), 'the secret itself left in the request');
});

test('A KEY THAT IS NAMED AND GONE, OR REVOKED, OR ON A HOST WITH NO OPENER, IS NOT POSTED UNSIGNED', async () => {
  const { posted, post } = poster();
  const refusing: OpenPostKey = async () => ({ ok: false, why: 'collector was revoked on 2026-09-22.' });
  assert.match(await threw(() => makeDeliver({ post, open: refusing })(job({ url: URL_, body: BODY, grant: 'collector' }))), /revoked on 2026-09-22.*nothing was posted|nothing was posted.*revoked/s);
  assert.match(await threw(() => makeDeliver({ post })(job({ url: URL_, body: BODY, grant: 'collector' }))), /cannot open the key "collector"/);
  /* AN OPENER THAT THROWS IS THE SAME REFUSAL, because a rejected RPC is not a reason to send the body bare. */
  const broken: OpenPostKey = async () => {
    throw new Error('the object was reset');
  };
  assert.match(await threw(() => makeDeliver({ post, open: broken })(job({ url: URL_, body: BODY, grant: 'collector' }))), /nothing was posted/);
  assert.deepEqual(posted, [], 'a post that could not be signed was sent anyway');
});

test('A POST THAT NAMES NO KEY GOES UNSIGNED, because `webhook.grant` is optional and the declaration chose that', async () => {
  const { posted, post } = poster();
  let opened = 0;
  const open: OpenPostKey = async () => (opened++, { ok: true, secret: utf8('never') });
  await makeDeliver({ post, open })(job({ url: URL_, body: BODY }));
  assert.equal(opened, 0, 'a key was opened for a post that names none');
  assert.equal(posted[0]?.headers[SIGNATURE_HEADER], undefined);
});

test('END TO END ON A REAL RECORD: the lease opens the record-sealed key, the post is signed, and a revoke stops the next one', async () => {
  const store = (await keyStoreOf(randomBytes(32).toString('hex'))) ?? assert.fail('no store');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)) });
  const keys = await recordKeys(store, REC);
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' },
    keys,
  } as never);
  assert.ok(made.ok, JSON.stringify(made));

  /* SEALED AS THE VAULT DOOR SEALS A PERSON'S DEPOSIT: under the record key, for one grant id and version. */
  const secret = `bd_fake_webhook_secret_${randomBytes(12).toString('hex')}`;
  const dek = (await unwrap(store, REC, 'record', keys.record)) ?? assert.fail('the record key did not open');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await seal(await grantKey(dek, GRANT), nonce, grantAad(REC, GRANT, '1'), utf8(secret));
  const bound = api.kernel.bindGrant(
    { label: 'collector', opens: 'collector.example.com', kind: 'api_token', ciphertext, nonce, kdf: 'hkdf', wrapped_by: 'kek', kek_id: keys.record.kek_id, sealed_under: 'record', sealed_for: { id: GRANT, version: 1 } },
    'p_1',
  );
  assert.ok(bound.ok, JSON.stringify(bound));

  /* THE RECORD'S HALF, AS `Record$.sealFor` ANSWERS IT OVER RPC. */
  const ask = async (args: { outbox: string; leasedUntil: string; grant: string }) => {
    const out = api.kernel.sealedGrant(args, 'system');
    return out.ok ? { ok: true as const, value: { record: REC, seal: out.value } } : out;
  };
  const { posted, post } = poster();
  const deliver = makeDeliver({ post, open: leasedOpener(ask, async () => store) });

  api.kernel.outbox('notify.webhook', { url: URL_, body: BODY, grant: 'collector' });
  const [first] = api.kernel.leaseOutbox(['notify.webhook'], 1);
  assert.ok(first);
  await deliver(first);
  assert.equal(posted[0]?.headers[SIGNATURE_HEADER], `sha256=${createHmac('sha256', secret).update(BODY).digest('hex')}`);

  /* REVOKED BETWEEN THIS POST AND THE NEXT: nothing goes, and the sentence says the key was revoked. */
  assert.ok(api.kernel.revokeGrant(GRANT, 'p_1').ok);
  api.kernel.outbox('notify.webhook', { url: URL_, body: BODY, grant: 'collector' });
  const [second] = api.kernel.leaseOutbox(['notify.webhook'], 1);
  assert.ok(second);
  assert.match(await threw(() => deliver(second)), /revoked/);
  assert.equal(posted.length, 1, 'a post whose key was revoked was sent');

  /* AND A HOST WITH NO KEY STORE REFUSES THE SAME WAY, rather than posting bare. */
  const bare = makeDeliver({ post, open: leasedOpener(ask, async () => null) });
  api.kernel.outbox('notify.webhook', { url: URL_, body: BODY, grant: 'collector' });
  const [third] = api.kernel.leaseOutbox(['notify.webhook'], 1);
  assert.ok(third);
  assert.match(await threw(() => bare(third)), /no key store|nothing was posted/);
  assert.equal(posted.length, 1);
  sql.close();
});
