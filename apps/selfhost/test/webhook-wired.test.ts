/**
 * The self-host's signed webhooks leave through the pinned socket, and `braindog serve` wires it; notification mail, which has no transport here yet, says so once rather than waiting unseen.
 *
 * MEASURED AT 1586f2a2, BEFORE THIS FILE. `signedWebhooks` existed and was handed to nothing: `main.ts` passed no
 * `deliver` to `start()`, so a `notify.webhook` job an automation queued sat `pending` with `attempts` 0 for as long as
 * the process ran (the second test below, red, reads exactly that), and there was no post function to hand it that
 * checked where a name resolves. A `notify.email` job sat beside it the same way, and nothing on stderr or anywhere else
 * said that this host has no way to send mail.
 *
 * WHY THE POST IS PINNED. A webhook URL is typed by whoever wrote the automation, and a name can answer a public address
 * to one lookup and `127.0.0.1` to the next. `webhookPost` checks every address the name resolves to and connects to the
 * one it checked (`./actions.ts`), the rule the scheduled actions already follow.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { grantAad, grantKey, seal } from '@braindog/host';
import { createRecordApi } from '@braindog/record';

import { webhookPost, type Pinned } from '../src/actions.ts';
import { openKeyStore, recordKeys, unwrap } from '../src/keys.ts';
import { openSqlite, SIGNATURE_HEADER, signedWebhooks, start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const BODY = '{"digest":"monday","sections":[{"id":"overdue","rows":2}]}';
const MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts');

test('A SIGNED WEBHOOK GOES TO THE ADDRESS ITS NAME WAS CHECKED AT, and a name that resolves somewhere private is not posted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-wired-'));
  const store = await openKeyStore(join(dir, 'kek'));
  const sent: { url: string; init: RequestInit; pinned: Pinned }[] = [];
  const names: Record<string, Pinned[]> = {
    'collector.example.com': [{ address: '93.184.216.34', family: 4 }],
    'inside.example.com': [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }],
  };
  const running = await start({
    file: join(dir, 'record.brain'),
    port: 0,
    pollMs: 0,
    keys: store,
    delivers: ['notify.webhook'],
    deliver: signedWebhooks(
      webhookPost({
        resolve: async (host) => names[host] ?? [],
        send: async (url, init, pinned) => (sent.push({ url: url.toString(), init, pinned }), new Response('accepted', { status: 202 })),
      }),
    ),
  });
  try {
    const keys = await recordKeys(store, REC);
    assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' }, keys } as never)).ok);
    const secret = `bd_fake_webhook_secret_${randomBytes(12).toString('hex')}`;
    const dek = (await unwrap(store, REC, 'record', keys.record)) ?? assert.fail('the record key did not open');
    const nonce = new Uint8Array(randomBytes(12));
    const ciphertext = await seal(await grantKey(dek, GRANT), nonce, grantAad(REC, GRANT, '1'), new TextEncoder().encode(secret));
    assert.ok(
      running.api.kernel.bindGrant(
        { label: 'collector', opens: 'collector.example.com', kind: 'api_token', ciphertext, nonce, kdf: 'hkdf', wrapped_by: 'kek', kek_id: keys.record.kek_id, sealed_under: 'record', sealed_for: { id: GRANT, version: 1 } },
        'p_1',
      ).ok,
    );

    const posted = running.api.kernel.outbox('notify.webhook', { url: 'https://collector.example.com/in', body: BODY, grant: 'collector' });
    await running.poll();
    assert.equal(sent.length, 1, 'the post was not sent');
    const headers = new Headers(sent[0]!.init.headers);
    assert.equal(sent[0]!.url, 'https://collector.example.com/in');
    assert.equal(sent[0]!.init.method, 'POST');
    assert.equal(sent[0]!.init.body, BODY);
    assert.deepEqual(sent[0]!.pinned, { address: '93.184.216.34', family: 4 });
    assert.equal(headers.get(SIGNATURE_HEADER), `sha256=${createHmac('sha256', secret).update(BODY).digest('hex')}`);
    assert.equal(headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(running.sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', posted)?.state, 'done');

    /* ONE PRIVATE ADDRESS AMONG THE NAME'S ANSWERS IS ENOUGH TO SEND NOTHING, the key included: it is never opened. */
    const inside = running.api.kernel.outbox('notify.webhook', { url: 'https://inside.example.com/in', body: BODY });
    await running.poll();
    assert.equal(sent.length, 1, 'a post to a name with a private address was sent');
    assert.equal(running.sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', inside)?.state, 'failed');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('`braindog serve` LEASES A WEBHOOK AND SENDS IT THROUGH THE PINNED POST, and says once that queued mail has no way out', { timeout: 60_000 }, async () => {
  const data = mkdtempSync(join(tmpdir(), 'braindog-wired-serve-'));
  const env = { ...process.env, BRAINDOG_DATA: data, BRAINDOG_OWNER: '', PORT: '0', BRAINDOG_BACKUP_AT: 'off' };
  const made = spawnSync(process.execPath, [MAIN, 'init', 'the-studio', '--owner', 'ada@example.com'], { encoding: 'utf8', env });
  assert.equal(made.status, 0, made.stderr);
  const file = join(data, 'the-studio', 'record.brain');

  /* TWO JOBS QUEUED WHILE NOTHING RAN, as an automation queues them. The webhook names a loopback address, which the
     pinned post refuses before anything is sent: the proof that `serve` handed the job to it is that the job was tried
     and failed with nothing listening, where before it was never leased at all. */
  {
    const sql = openSqlite(file);
    const api = await createRecordApi({ sql, clock: { now: () => Date.now() } });
    api.kernel.outbox('notify.webhook', { url: 'https://127.0.0.1:9/in', body: BODY });
    api.kernel.outbox('notify.email', { to: ['ada@example.com'], subject: 'Due this week', text: 'Two things are due.' });
    sql.close();
  }

  const served = spawn(process.execPath, [MAIN, 'serve'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let said = '';
  served.stderr.setEncoding('utf8');
  served.stderr.on('data', (chunk: string) => void (said += chunk));
  try {
    const deadline = Date.now() + 40_000;
    let tried: { state: string; attempts: number } | undefined;
    while (Date.now() < deadline) {
      const read = openSqlite(file);
      tried = read.one<{ state: string; attempts: number }>("SELECT state, attempts FROM outbox WHERE kind = 'notify.webhook'");
      read.close();
      if (tried && tried.attempts > 0 && /notification email/u.test(said)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(tried && tried.attempts > 0, `the webhook was never tried: ${JSON.stringify(tried)}; serve said: ${said}`);
    assert.notEqual(tried.state, 'done', 'a post to a loopback address was delivered');

    const mail = said.split('\n').filter((l) => /notification email/u.test(l));
    assert.equal(mail.length, 1, said);
    assert.match(mail[0]!, /^braindog · 1 notification email is waiting to be sent, and this host has no way to send mail yet\. /u);
    assert.ok(!said.includes('—'));
    const read = openSqlite(file);
    assert.equal(read.one<{ state: string }>("SELECT state FROM outbox WHERE kind = 'notify.email'")?.state, 'pending', 'the mail was taken off the queue');
    read.close();
  } finally {
    served.kill();
    await new Promise((resolve) => (served.exitCode === null ? served.once('exit', resolve) : resolve(null)));
    rmSync(data, { recursive: true, force: true });
  }
});
