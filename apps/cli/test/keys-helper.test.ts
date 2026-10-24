/**
 * `braindog keys helper <credential>`: one key printed alone for Claude Code's `apiKeyHelper`, through the same door and
 * the same one function as `keys headers`, and refused when standard output is a terminal.
 *
 * THE VALUE AND THE GRANT ARE OBVIOUSLY FAKE, made per run. The real command runs as a process with standard output a
 * pipe, so what it prints is what Claude Code would read; standard error must hold neither.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hostKey, saveHosts } from '../src/http.ts';
import { keys, type KeysIo } from '../src/keys.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const SCOPE = '01JZ8QK3F7R2M9V4XN6TCB5HAE';
const LATER = '2099-01-01T00:00:00.000Z';

const fakeValue = (): string => ['fake-api-key-for-tests-only-', randomBytes(20).toString('hex')].join('');
const fakeGrant = (): string => ['rec_01TESTTESTTESTTESTTESTTEST.stub-vault-grant-', randomBytes(12).toString('hex')].join('');

type After = { after: (fn: () => void | Promise<void>) => void };

/** A stub host whose key door opens one key, and keeps each request. */
async function stub(t: After, held: string) {
  const seen: { path: string; authorization: string | undefined; body: Record<string, unknown> }[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
    req.on('end', () => {
      seen.push({ path: req.url ?? '', authorization: req.headers.authorization, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, value: { credential: 'credentials#4', label: 'Studio API', value: held } }));
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
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

/** A config folder whose hosts file holds one vault grant for the stub. */
function config(t: After, base: string, grant: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-keys-helper-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = hostKey(base);
  mkdirSync(join(dir, 'braindog'), { recursive: true });
  const file = join(dir, 'braindog', 'hosts.json');
  saveHosts(file, { default: key, hosts: { [key]: { vault: { [SCOPE]: { value: grant, expires: LATER } } } } });
  return { dir, file };
}

/** An in-process `KeysIo` with standard output a terminal or not, and every sentence kept. */
function io(file: string, terminal: boolean) {
  const said: string[] = [];
  const shape: KeysIo = {
    file,
    env: {},
    stdin: () => null,
    say: (line) => void said.push(line),
    headers: async () => ({}),
    spawn: async () => {
      throw new Error('keys helper started a command');
    },
    terminal: () => terminal,
  };
  return { io: shape, said };
}

test('TO A TERMINAL IT OPENS NOTHING: one sentence, and no request', async (t) => {
  const host = await stub(t, fakeValue());
  const { file } = config(t, host.base, fakeGrant());
  const run = io(file, true);
  assert.equal(await keys(['helper', 'credentials#4'], run.io), 1);
  assert.deepEqual(run.said, ["braindog keys helper prints a key for a program that reads its standard output, such as Claude Code's apiKeyHelper, and standard output here is a terminal, so nothing was opened."]);
  assert.equal(host.seen.length, 0);
});

test('IT TAKES NO HEADER AND NOTHING ELSE: --as, a second label or an unknown flag is its usage, before any request', async (t) => {
  const host = await stub(t, fakeValue());
  const { file } = config(t, host.base, fakeGrant());
  for (const args of [
    ['helper', 'credentials#4', '--as', 'Authorization'],
    ['helper', 'credentials#4', 'other'],
    ['helper', 'credentials#4', '--print'],
    ['helper'],
  ]) {
    const run = io(file, false);
    assert.equal(await keys(args, run.io), 1, args.join(' '));
    assert.deepEqual(run.said, ['braindog keys helper takes one label or credentials#n, --vault and --host, and nothing else.']);
  }
  assert.equal(host.seen.length, 0);
});

/** The real command with this test's config folder, standard output a pipe as an apiKeyHelper's is. */
async function command(dir: string, args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, XDG_CONFIG_HOME: dir, APPDATA: dir };
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_HOST;
  const child = spawn(process.execPath, [MAIN, 'keys', ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  const code = await new Promise<number | null>((done) => child.on('close', done));
  return { code, stdout, stderr };
}

test('AS A PROCESS IT PRINTS THE KEY ALONE ON STANDARD OUTPUT, opened under the vault grant, and nothing on standard error', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { dir } = config(t, host.base, grant);
  const out = await command(dir, ['helper', 'credentials#4']);
  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stdout, `${value}\n`);
  assert.equal(out.stderr, '');
  assert.deepEqual(
    host.seen.map((s) => [s.path, s.authorization, s.body]),
    [['/api/vault/open', `Bearer ${grant}`, { credential: 'credentials#4' }]],
  );
  /* By label, the same door. */
  const byLabel = await command(dir, ['helper', 'Studio API']);
  assert.equal(byLabel.stdout, `${value}\n`);
  assert.deepEqual(host.seen[1]?.body, { label: 'Studio API' });
});

test('A KEY WITH A CHARACTER A HEADER CANNOT CARRY IS NOT PRINTED, since Claude Code sends it in one', async (t) => {
  const host = await stub(t, `${fakeValue()}\nsecond-line`);
  const { dir } = config(t, host.base, fakeGrant());
  const out = await command(dir, ['helper', 'credentials#4']);
  assert.equal(out.code, 1);
  assert.equal(out.stdout, '');
  assert.match(out.stderr, /That key holds a character a header cannot carry/u);
  assert.doesNotMatch(out.stderr, /fake-api-key|second-line/u);
});
