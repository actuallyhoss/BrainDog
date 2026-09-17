/**
 * A scheduled action's real run on this machine: a pull, a call and a poll, each once, through the runner, a real https
 * socket, the usage ledger and the record's own events (`loop/DIRECTION.md` §0b).
 *
 * THE SERVER IS A TINY LOCAL ONE WITH A THROWAWAY CERTIFICATE, made by openssl in a temp folder and deleted with it. The
 * self-host still refuses local addresses; `rehearseOnThisMachine` is passed in code, names only `.test` hosts, and is
 * never read from the environment. The key the actions send is an obviously fake value handed in by `openKey`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { actionExecutor } from '../src/actions.ts';
import { start } from '../src/server.ts';

const NAME = 'api.rehearsal.test';
const FAKE_KEY = 'fake-rehearsal-key-not-a-secret';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

function openssl(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** A self-signed certificate for NAME, in `dir`. */
function certificate(dir: string): { key: string; cert: string } {
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=${NAME}`, '-addext', `subjectAltName=DNS:${NAME}`],
    { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
  );
  return { key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') };
}

test('ONLY .test NAMES MAY BE REHEARSED, and a rehearsal leaves a local address in an action refused', async () => {
  const api = { kernel: { actionOrigins: () => ['https://localhost'] } } as never;
  for (const names of [[], ['api.example.com'], ['localhost'], ['127.0.0.1']])
    assert.throws(() => actionExecutor(api, { openKey: async () => FAKE_KEY, rehearseOnThisMachine: { names, ca: '' } }), /\.test/);
  const execute = actionExecutor(api, { openKey: async () => FAKE_KEY, rehearseOnThisMachine: { names: [NAME], ca: '' } });
  const out = await execute({ job: 'o_1', channel: 'poll', ingest: 'x', method: 'GET', url: 'https://localhost/', origin: 'https://localhost', headers: {}, grant: null, timeoutMs: 1_000, maxBytes: 1_000 });
  assert.ok('refused' in out && out.refused.code === 'PULL_ORIGIN_REFUSED');
});

test('A PULL, A CALL AND A POLL EACH RUN ONCE through the runner to a local https server, are metered in the ledger, and read back as events', { skip: openssl() ? false : 'openssl is not on this machine' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-rehearsal-'));
  const seen: { method: string; path: string; auth: string | undefined; idem: string | undefined }[] = [];
  const tls = certificate(dir);
  const provider = createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    req.resume();
    req.on('end', () => {
      seen.push({ method: req.method ?? '', path: req.url ?? '', auth: req.headers.authorization, idem: req.headers['idempotency-key'] as string | undefined });
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(req.url?.startsWith('/balance') ? 'balance 120' : 'ok');
    });
  });
  await new Promise<void>((done) => provider.listen(0, '127.0.0.1', done));
  const origin = `https://${NAME}:${String((provider.address() as AddressInfo).port)}`;

  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => FAKE_KEY, rehearseOnThisMachine: { names: [NAME], ca: tls.cert } },
  });
  try {
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    assert.ok((await running.api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
    assert.ok(running.directory.provision({ slug: 'studio', email: 'ada@example.test', record: REC }).ok);
    const k = running.api.kernel;
    const bound = k.bindGrant(
      { label: 'rehearsal key', opens: NAME, kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' },
      person.value.id,
    );
    assert.ok(bound.ok);
    const installed = await k.install([
      { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
      { id: 'ingest.stats', kind: 'ingest', body: { ingest: 'stats', channel: 'pull', url: `${origin}/stats`, every: '1h', extract: { what: { after: 'o' } }, writes: { register: 'notes' } } as never },
      { id: 'ingest.ping', kind: 'ingest', body: { ingest: 'ping', channel: 'call', url: `${origin}/ping`, every: '1h', grant: 'rehearsal key', body: { text: 'up to {until}' } } as never },
      { id: 'ingest.balance', kind: 'ingest', body: { ingest: 'balance', channel: 'poll', url: `${origin}/balance`, every: '1h', grant: 'rehearsal key', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never },
    ]);
    assert.ok(installed.ok, JSON.stringify(installed));

    await running.poll();

    assert.deepEqual(seen.map((s) => `${s.method} ${s.path.split('?')[0]}`).sort(), ['GET /balance', 'GET /stats', 'POST /ping']);
    const ping = seen.find((s) => s.path.startsWith('/ping'))!;
    assert.equal(ping.auth, `Bearer ${FAKE_KEY}`);
    assert.ok(ping.idem, 'the call carried no idempotency key');

    /* THE LEDGER COUNTED EACH RUN ONCE, on the self-host's plan. */
    const today = new Date().toISOString().slice(0, 10);
    const usage = running.directory.usage(person.value.id, { from: today, to: today });
    assert.ok(usage.ok);
    const mine = usage.value.records.find((r) => r.record === REC);
    assert.equal(mine?.plan, 'selfhost');
    assert.equal(mine?.totals.runs, 3);
    assert.equal(mine?.totals.failures, 0);
    assert.deepEqual(mine?.actions.map((a) => a.action).sort(), ['balance', 'ping', 'stats']);

    /* AND THE RECORD'S OWN EVENTS SAY THE SAME, which is what /usage reads where nobody is signed in. */
    const events = k.actions() as unknown as { ingest: string; days: { runs: number }[] }[];
    assert.deepEqual(events.map((e) => [e.ingest, e.days.reduce((n, d) => n + d.runs, 0)]).sort(), [['balance', 1], ['ping', 1], ['stats', 1]]);

    /* A SECOND PASS WITHIN THE HOUR SENDS NOTHING. */
    await running.poll();
    assert.equal(seen.length, 3);
  } finally {
    await running.close();
    await new Promise<void>((done) => provider.close(() => done()));
    rmSync(dir, { recursive: true, force: true });
  }
});
