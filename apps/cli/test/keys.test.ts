/**
 * `braindog keys put` and `braindog keys exec` against a stub host on node:http: a value in from stdin, a value handed
 * to a command's environment, the refusals that come before any request, and nothing secret in anything the CLI
 * writes.
 *
 * THE VALUE AND THE GRANT ARE OBVIOUSLY FAKE, made per run, and long enough that any fragment in a sentence is
 * findable. Most cases run `keys` in process with a fake spawner; the rest start real processes, so what the CLI
 * writes to stdout and stderr is what a terminal or a pipe would get.
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
import { keys, spawnInherit, variableOf, type KeysIo, type Spawner } from '../src/keys.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const SCOPE = '01JZ8QK3F7R2M9V4XN6TCB5HAE';
const LATER = '2099-01-01T00:00:00.000Z';

const fakeValue = (): string => ['fake-key-for-tests-only-', randomBytes(20).toString('hex')].join('');
const fakeGrant = (): string => ['rec_01TESTTESTTESTTESTTESTTEST.stub-vault-grant-', randomBytes(12).toString('hex')].join('');

type Seen = { path: string; authorization: string | undefined; body: Record<string, unknown> };

/** A stub host holding one key: a deposit keeps it, and a read gives it back. */
async function stub(t: { after: (fn: () => Promise<void>) => void }, held: string) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
    req.on('end', () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      seen.push({ path: req.url ?? '', authorization: req.headers.authorization, body });
      const value =
        req.url === '/api/vault/deposit'
          ? { credential: 'credentials#1', label: body.label, version: 1, rotated: false }
          : { credential: 'credentials#1', label: 'Kiln deploy', value: held };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, value }));
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
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

/** A config folder whose hosts file holds one vault grant for the stub. */
function config(t: { after: (fn: () => void) => void }, base: string, grant: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-keys-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = hostKey(base);
  mkdirSync(join(dir, 'braindog'), { recursive: true });
  const file = join(dir, 'braindog', 'hosts.json');
  saveHosts(file, { default: key, hosts: { [key]: { vault: { [SCOPE]: { value: grant, expires: LATER } } } } });
  return { dir, file };
}

type Started = { command: string; args: string[]; vars: Record<string, string | undefined> };

/** An in-process `KeysIo` whose spawner records what it was asked to start, and ends with `code`. */
function io(file: string, o: { stdin?: string | null; code?: number; spawn?: Spawner; env?: Record<string, string | undefined> } = {}) {
  const said: string[] = [];
  const started: Started[] = [];
  const shape: KeysIo = {
    file,
    env: o.env ?? {},
    stdin: () => (o.stdin === undefined ? null : o.stdin),
    say: (line) => void said.push(line),
    headers: async () => ({}),
    spawn:
      o.spawn ??
      (async (command, args, vars) => {
        started.push({ command, args, vars: { ...vars } });
        return o.code ?? 0;
      }),
  };
  return { io: shape, said, started };
}

const nowhere = (texts: string[], secrets: string[]) => {
  for (const text of texts) for (const secret of secrets) assert.ok(!text.includes(secret), 'a secret reached a sentence');
};

test('PUT READS THE VALUE FROM STDIN, sends it once under the vault grant, and says neither', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { file } = config(t, host.base, grant);
  const run = io(file, { stdin: `${value}\n` });

  assert.equal(await keys(['put', 'Kiln deploy', '--opens', 'Deploys kiln.example'], run.io), 0, run.said.join('\n'));
  assert.equal(host.seen.length, 1);
  assert.equal(host.seen[0]?.path, '/api/vault/deposit');
  assert.equal(host.seen[0]?.authorization, `Bearer ${grant}`);
  assert.deepEqual(host.seen[0]?.body, { label: 'Kiln deploy', opens: 'Deploys kiln.example', value });
  assert.deepEqual(run.started, []);
  assert.match(run.said.join('\n'), /^deposited credentials#1 on .+ · version 1$/);
  nowhere(run.said, [value, grant]);
});

test('PUT WITH NOTHING PIPED IN, OR AN EMPTY PIPE, SENDS NOTHING', async (t) => {
  const host = await stub(t, fakeValue());
  const { file } = config(t, host.base, fakeGrant());
  for (const stdin of [null, '', '\n']) {
    const run = io(file, { stdin });
    assert.equal(await keys(['put', 'Kiln deploy'], run.io), 1);
    assert.equal(run.said.length, 1);
  }
  assert.deepEqual(host.seen, []);
});

test('EXEC HANDS THE VALUE TO THE COMMAND UNDER ONE VARIABLE, exits with its code, and says nothing of it', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { file } = config(t, host.base, grant);
  const env = { BRAINDOG_KEEP: 'kept' };
  const run = io(file, { code: 5, env });

  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'deploy', '--to', 'kiln.example'], run.io), 5, run.said.join('\n'));
  assert.deepEqual(host.seen.map((s) => [s.path, s.authorization, s.body]), [['/api/vault/open', `Bearer ${grant}`, { label: 'Kiln deploy' }]]);
  assert.equal(run.started.length, 1);
  assert.equal(run.started[0]?.command, 'deploy');
  assert.deepEqual(run.started[0]?.args, ['--to', 'kiln.example']);
  assert.deepEqual(Object.keys(run.started[0]?.vars ?? {}).sort(), ['BRAINDOG_KEEP', 'KILN_DEPLOY']);
  assert.ok(run.started[0]?.vars.KILN_DEPLOY === value, 'the command did not get the key');
  assert.deepEqual(env, { BRAINDOG_KEEP: 'kept' }, 'the environment of this process changed');
  assert.deepEqual(run.said, []);

  /* A spoken id is sent as the credential it names, and --as names the variable. Flags after -- are the command's. */
  const spoken = io(file);
  assert.equal(await keys(['exec', 'credentials#1', '--as', 'KILN_TOKEN', '--', 'deploy', '--as', 'x'], spoken.io), 0);
  assert.deepEqual(host.seen[1]?.body, { credential: 'credentials#1' });
  assert.deepEqual(Object.keys(spoken.started[0]?.vars ?? {}), ['KILN_TOKEN']);
  assert.deepEqual(spoken.started[0]?.args, ['--as', 'x']);
  nowhere([...run.said, ...spoken.said], [value, grant]);
});

test('A NAME IS MADE FROM THE LABEL: upper case, other runs to an underscore, no leading digits or underscores', () => {
  assert.equal(variableOf('Kiln deploy'), 'KILN_DEPLOY');
  assert.equal(variableOf('credentials#12'), 'CREDENTIALS_12');
  assert.equal(variableOf('3 stripe-live key'), 'STRIPE_LIVE_KEY');
  assert.equal(variableOf('__42__'), '');
  assert.equal(variableOf('#!'), '');
});

test('EXEC IS REFUSED IN ONE SENTENCE, BEFORE ANY REQUEST, with no command, a bad --as, or no name to make', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());

  const cases: [string[], RegExp][] = [
    [['exec', 'Kiln deploy'], /no command was given/],
    [['exec', 'Kiln deploy', '--'], /no command was given/],
    [['exec', 'Kiln deploy', '--as', 'kiln_token', '--', 'deploy'], /^--as takes an environment variable name/],
    [['exec', 'Kiln deploy', '--as', '1KILN', '--', 'deploy'], /^--as takes an environment variable name/],
    [['exec', 'Kiln deploy', '--as', 'KILN-TOKEN', '--', 'deploy'], /^--as takes an environment variable name/],
    [['exec', 'Kiln deploy', '--as', value, '--', 'deploy'], /^--as takes an environment variable name/],
    [['exec', '1234', '--', 'deploy'], /name one with --as/],
    [['exec', '--', 'deploy'], /^braindog keys exec takes one label/],
    [['exec', 'Kiln deploy', value, '--', 'deploy'], /^braindog keys exec takes one label/],
    [['exec', 'Kiln deploy', '--show', '--', 'deploy'], /^braindog keys exec takes one label/],
    [['get', 'Kiln deploy'], /^braindog keys takes put <label>/],
  ];
  for (const [args, said] of cases) {
    const run = io(file);
    assert.equal(await keys(args, run.io), 1, args.join(' '));
    assert.equal(run.said.length, 1, args.join(' '));
    assert.match(run.said[0] ?? '', said, args.join(' '));
    assert.deepEqual(run.started, []);
    nowhere(run.said, [value]);
  }
  assert.deepEqual(host.seen, []);
});

test('A COMMAND THAT DID NOT START IS ONE SENTENCE, and not the error that could quote it', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());
  const run = io(file, { spawn: () => Promise.reject(new Error(`spawn failed with ${value}`)) });
  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'no-such-command'], run.io), 1);
  assert.deepEqual(run.said, ['The command after -- did not start.']);
});

test('A VALUE PASSED AS AN ARGUMENT IS NEVER SENT, AND NEVER REPEATED', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());
  const run = io(file, { stdin: 'ignored' });
  assert.equal(await keys(['put', 'Kiln deploy', value], run.io), 1);
  assert.equal(await keys(['put', 'Kiln deploy', `--value=${value}`], run.io), 1);
  assert.deepEqual(host.seen, []);
  nowhere(run.said, [value]);
});

/** A `node -e` script that exits 0 when the variable is there at this length, and 9 otherwise. It prints nothing. */
const checks = (name: string, length: number) => `const v = process.env.${name}; process.exit(typeof v === 'string' && v.length === ${length} ? 0 : 9);`;

test('THE REAL SPAWNER STARTS A REAL CHILD with the variable set, and the CLI says nothing', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { file } = config(t, host.base, grant);
  const run = io(file, { spawn: spawnInherit, env: { ...process.env } });

  assert.equal(await keys(['exec', 'Kiln deploy', '--', process.execPath, '-e', checks('KILN_DEPLOY', value.length)], run.io), 0, run.said.join('\n'));
  assert.equal(await keys(['exec', 'Kiln deploy', '--as', 'OTHER', '--', process.execPath, '-e', checks('KILN_DEPLOY', value.length)], run.io), 9);
  assert.deepEqual(run.said, []);
  assert.equal(process.env.KILN_DEPLOY, undefined);
});

/** The real command, with this test's config folder and what it pipes in. */
async function command(dir: string, args: string[], stdin: string) {
  const env: Record<string, string | undefined> = { ...process.env, XDG_CONFIG_HOME: dir, APPDATA: dir };
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_HOST;
  const child = spawn(process.execPath, [MAIN, 'keys', ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  child.stdin.end(stdin);
  const code = await new Promise<number | null>((done) => child.on('close', done));
  return { code, stdout, stderr };
}

test('AS A PROCESS: put prints nothing secret, and exec hands the key to a node child and writes nothing at all', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { dir } = config(t, host.base, grant);

  const put = await command(dir, ['put', 'Kiln deploy', '--opens', 'Deploys kiln.example'], `${value}\n`);
  assert.equal(put.code, 0, put.stderr);
  assert.equal(put.stdout, '');
  assert.equal(host.seen[0]?.body.value, value);
  for (const secret of [value, grant]) assert.ok(!put.stderr.includes(secret), 'a secret reached stderr');

  const exec = await command(dir, ['exec', 'Kiln deploy', '--', process.execPath, '-e', checks('KILN_DEPLOY', value.length)], '');
  assert.equal(exec.code, 0, exec.stderr);
  assert.equal(exec.stdout, '');
  assert.equal(exec.stderr, '');

  const failing = await command(dir, ['exec', 'Kiln deploy', '--', process.execPath, '-e', 'process.exit(5)'], '');
  assert.equal(failing.code, 5, failing.stderr);
  for (const text of [exec.stdout, exec.stderr, failing.stdout, failing.stderr]) for (const secret of [value, grant]) assert.ok(!text.includes(secret), 'a secret was written');
});
