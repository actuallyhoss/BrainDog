/**
 * The self-host signs a digest's webhook as the Worker does, or does not post it (the delivery half).
 *
 * MEASURED AT afb3b1b2, BEFORE THIS FILE: the self-host had no way to sign a post at all. `Deliver` is handed the job
 * and nothing else, the record's `sealedGrant` refused every job that was not a `pull.fetch`, and `main.ts` passes no
 * deliverer to `start()`, so a `notify.webhook` waited in `pending` for ever. A deliverer somebody did pass could only
 * have posted the body bare.
 *
 * WHAT IS HERE. The poller hands each deliverer an opener bound to the job it just leased, so the key comes out under
 * that lease and no other, and `signedWebhooks` is the `notify.webhook` deliverer that uses it: HMAC-SHA256 over the
 * raw body in `x-braindog-signature` as `sha256=<hex>`, the shape the Worker sends and the inbound `verify` reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { grantAad, grantKey, seal } from '@braindog/host';

import { openKeyStore, recordKeys, unwrap } from '../src/keys.ts';
import { SIGNATURE_HEADER, signedWebhooks, start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const URL_ = 'https://collector.example.com/in';
const BODY = '{"digest":"monday","sections":[{"id":"overdue","rows":2}]}';
const utf8 = (s: string) => new TextEncoder().encode(s);

test('A LEASED POST IS SIGNED WITH THE RECORD-SEALED KEY IT NAMES, and a revoked key stops the next one cold', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-signed-'));
  const store = await openKeyStore(join(dir, 'kek.key'));
  const posted: { url: string; body: string; headers: Record<string, string> }[] = [];
  /* THE RECORD KEEPS A FAILED ATTEMPT'S REASON ONLY AT THE DEAD LETTER, so the reason is read where it is thrown. */
  const threw: string[] = [];
  const signing = signedWebhooks(async (url, body, headers) => (posted.push({ url, body, headers }), { ok: true, status: 202 }));
  const running = await start({
    file: join(dir, 'record.brain'),
    port: 0,
    pollMs: 0,
    keys: store,
    delivers: ['notify.webhook'],
    deliver: async (job, keys) => {
      try {
        await signing(job, keys);
      } catch (e) {
        threw.push(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
  });
  try {
    const keys = await recordKeys(store, REC);
    const made = await running.api.createRecord({
      id: REC,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' },
      keys,
    } as never);
    assert.ok(made.ok, JSON.stringify(made));

    const secret = `bd_fake_webhook_secret_${randomBytes(12).toString('hex')}`;
    const dek = (await unwrap(store, REC, 'record', keys.record)) ?? assert.fail('the record key did not open');
    const nonce = new Uint8Array(randomBytes(12));
    const ciphertext = await seal(await grantKey(dek, GRANT), nonce, grantAad(REC, GRANT, '1'), utf8(secret));
    const bound = running.api.kernel.bindGrant(
      { label: 'collector', opens: 'collector.example.com', kind: 'api_token', ciphertext, nonce, kdf: 'hkdf', wrapped_by: 'kek', kek_id: keys.record.kek_id, sealed_under: 'record', sealed_for: { id: GRANT, version: 1 } },
      'p_1',
    );
    assert.ok(bound.ok, JSON.stringify(bound));

    const first = running.api.kernel.outbox('notify.webhook', { url: URL_, body: BODY, grant: 'collector' });
    await running.poll();
    assert.equal(posted.length, 1, 'the post was not sent');
    assert.equal(posted[0]?.body, BODY);
    assert.equal(posted[0]?.headers[SIGNATURE_HEADER], `sha256=${createHmac('sha256', secret).update(BODY).digest('hex')}`);
    assert.equal(running.sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', first)?.state, 'done');

    /* REVOKED BEFORE THE NEXT DIGEST: the job fails with the reason, and nothing leaves. */
    assert.ok(running.api.kernel.revokeGrant(GRANT, 'p_1').ok);
    const second = running.api.kernel.outbox('notify.webhook', { url: URL_, body: BODY, grant: 'collector' });
    await running.poll();
    assert.equal(posted.length, 1, 'a post whose key was revoked was sent');
    assert.equal(running.sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', second)?.state, 'failed');
    assert.equal(threw.length, 1);
    assert.match(threw[0] ?? '', /revoked.*nothing was posted/is);
    assert.ok(!JSON.stringify(running.sql.all('SELECT * FROM outbox')).includes(secret), 'the secret reached the outbox');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A POST THAT NAMES NO KEY GOES UNSIGNED, and one that is not https goes nowhere', async () => {
  const posted: Record<string, string>[] = [];
  const deliver = signedWebhooks(async (_url, _body, headers) => (posted.push(headers), { ok: true, status: 200 }));
  const job = (payload: unknown) => ({ id: 'ob_1', kind: 'notify.webhook' as const, payload: JSON.stringify(payload), attempts: 0, leasedUntil: '' });
  const never = { open: async () => assert.fail('a key was opened for a post that names none') };
  await deliver(job({ url: URL_, body: BODY }), never);
  assert.deepEqual(posted, [{}]);
  await assert.rejects(deliver(job({ url: 'http://collector.example.com/in', body: BODY }), never), /https/);
  await assert.rejects(deliver({ ...job({}), kind: 'notify.email' as never }, never), /delivers a notify.email/);
  assert.equal(posted.length, 1);
});
