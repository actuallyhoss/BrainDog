/**
 * `braindog keys exec`, `headers` and `helper` on a key set to ask first (`12 §6.3`): the host answers `KEY_ASKED` until
 * the owner allows the machine, and the command says so once and asks the same door again every three seconds, for up
 * to two minutes. A key with no rule opens on the first try with nothing said, which `keys.test.ts` holds.
 *
 * THE CLOCK AND THE WAIT ARE THE TEST'S, so two minutes pass in no time and every try is counted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hostKey, saveHosts } from '../src/http.ts';
import { ASK_EVERY_MS, ASK_FOR_MS, keys, type KeysIo } from '../src/keys.ts';

const SCOPE = '01JZ8QK3F7R2M9V4XN6TCB5HAE';
const LATER = '2099-01-01T00:00:00.000Z';
const fakeValue = (): string => ['fake-key-for-tests-only-', randomBytes(20).toString('hex')].join('');
const fakeGrant = (): string => ['rec_01TESTTESTTESTTESTTESTTEST.stub-keychain-grant-', randomBytes(12).toString('hex')].join('');

const ASKED = { ok: false, refusal: { code: 'KEY_ASKED', fix: 'The owner has been asked to allow this machine to open that key. Try again once they answer in BrainDog.', at: 'credential' } };

/** A stub host whose open door answers `KEY_ASKED` for the first `asks` tries, then the key. */
async function stub(t: { after: (fn: () => Promise<void>) => void }, held: string, asks: number) {
  const paths: string[] = [];
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      paths.push(req.url ?? '');
      const asked = paths.length <= asks;
      res.writeHead(asked ? 403 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(asked ? ASKED : { ok: true, value: { credential: 'credentials#1', label: 'Kiln deploy', value: held } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, paths };
}

function config(t: { after: (fn: () => void) => void }, base: string, grant: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-keys-ask-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = hostKey(base);
  mkdirSync(join(dir, 'braindog'), { recursive: true });
  const file = join(dir, 'braindog', 'hosts.json');
  saveHosts(file, { default: key, hosts: { [key]: { vault: { [SCOPE]: { value: grant, expires: LATER } } } } });
  return file;
}

/** An in-process `KeysIo` with a clock the waits move, and a spawner that keeps what it was handed. */
function io(file: string) {
  const said: string[] = [];
  const waits: number[] = [];
  const handed: string[] = [];
  let now = Date.UTC(2026, 9, 26, 12);
  const shape: KeysIo = {
    file,
    env: {},
    stdin: () => null,
    say: (line) => void said.push(line),
    headers: async () => ({}),
    now: () => now,
    wait: async (ms) => {
      waits.push(ms);
      now += ms;
    },
    terminal: () => false,
    spawn: async (_command, _args, vars) => {
      handed.push(String(vars.KILN_DEPLOY));
      return 0;
    },
  };
  return { io: shape, said, waits, handed };
}

test('EXEC WAITS FOR HIM AND THEN OPENS: one line said, the same door asked every three seconds, and the key handed on', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value, 3);
  const run = io(config(t, host.base, grant));

  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'deploy'], run.io), 0, run.said.join('\n'));
  assert.deepEqual(run.said, ['Waiting for you to allow Kiln deploy in BrainDog…']);
  assert.deepEqual(run.waits, [ASK_EVERY_MS, ASK_EVERY_MS, ASK_EVERY_MS]);
  assert.deepEqual(host.paths, ['/api/vault/open', '/api/vault/open', '/api/vault/open', '/api/vault/open'], 'the CLI asked another door than every installed host answers');
  assert.equal(run.handed[0], value, 'the command did not get the key');
  for (const line of run.said) assert.ok(!line.includes(value) && !line.includes(grant), 'a secret reached a sentence');
});

test('HEADERS AND HELPER WAIT THE SAME WAY, on the same door', async (t) => {
  for (const args of [['headers', 'credentials#1', '--as', 'Authorization'], ['helper', 'credentials#1']]) {
    const host = await stub(t, fakeValue(), 1);
    const run = io(config(t, host.base, fakeGrant()));
    assert.equal(await keys(args, run.io), 0, run.said.join('\n'));
    assert.deepEqual(run.said, ['Waiting for you to allow credentials#1 in BrainDog…']);
    assert.equal(host.paths.length, 2);
  }
});

test('AFTER TWO MINUTES IT GIVES UP: the host says why, and nothing is started', async (t) => {
  const host = await stub(t, fakeValue(), Number.MAX_SAFE_INTEGER);
  const run = io(config(t, host.base, fakeGrant()));

  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'deploy'], run.io), 1);
  assert.equal(run.waits.reduce((a, b) => a + b, 0), ASK_FOR_MS, 'it waited longer or shorter than two minutes');
  assert.equal(host.paths.length, ASK_FOR_MS / ASK_EVERY_MS + 1);
  assert.deepEqual(run.said, ['Waiting for you to allow Kiln deploy in BrainDog…', ASKED.refusal.fix]);
  assert.deepEqual(run.handed, []);
});

test('A KEY WITH NO RULE OPENS ON THE FIRST TRY, with nothing said and no wait', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value, 0);
  const run = io(config(t, host.base, fakeGrant()));
  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'deploy'], run.io), 0);
  assert.deepEqual(run.said, []);
  assert.deepEqual(run.waits, []);
  assert.equal(host.paths.length, 1);
  assert.equal(run.handed[0], value);
});
