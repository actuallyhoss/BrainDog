/**
 * `braindog login <host>` against a stub on node:http: approved, expired, denied, a foreign approval address, and
 * Ctrl+C. The command runs as a real process, so what it prints is what a terminal would show.
 *
 * THE BEARER IS OBVIOUSLY FAKE and long enough that any fragment of it in stdout or stderr is findable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readHosts } from '../src/http.ts';
import { login } from '../src/login.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-bearer-never-printed-4c1d';
const POLL_ID = 'stub-poll-id-never-printed-9e2a';
const LATER = '2099-01-01T00:00:00.000Z';

type Answer = { status: number; body: unknown };
type Seen = { path: string; body: Record<string, unknown> };

const pending: Answer = { status: 200, body: { ok: true, value: { pending: true, interval: 0 } } };
const granted: Answer = { status: 200, body: { ok: true, value: { pending: false, bearer: TOKEN, reach: 'login', scope: null, expires: LATER } } };
const refused = (code: string): Answer => ({ status: 422, body: { ok: false, refusal: { code, fix: 'Ask the device to start again.', at: 'device_code' } } });

/** A stub host: `/auth/device` answers a code whose address `uri` builds, and each poll takes the next answer. */
async function stub(t: { after: (fn: () => Promise<void>) => void }, polls: (n: number) => Answer, uri = (base: string) => `${base}/settings/agents`) {
  const seen: Seen[] = [];
  let base = '';
  let n = 0;
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
    req.on('end', () => {
      const path = req.url ?? '';
      seen.push({ path, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} });
      const answer: Answer =
        path === '/auth/device'
          ? { status: 200, body: { ok: true, value: { device_code: POLL_ID, user_code: '123456', verification_uri: uri(base), expires_in: 600, expires: LATER, interval: 0 } } }
          : polls(n++);
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
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
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, seen };
}

/** `braindog login <base>` as a process, with its own config folder, so the hosts file is this test's alone. */
async function run(t: { after: (fn: () => void) => void }, base: string) {
  const config = mkdtempSync(join(tmpdir(), 'braindog-login-'));
  t.after(() => rmSync(config, { recursive: true, force: true }));
  const env: Record<string, string | undefined> = { ...process.env, XDG_CONFIG_HOME: config, APPDATA: config };
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_HOST;
  const child = spawn(process.execPath, [MAIN, 'login', base], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  const code = await new Promise<number | null>((done) => child.on('close', done));
  return { code, stdout, stderr, file: join(config, 'braindog', 'hosts.json') };
}

const hidden = (out: { stdout: string; stderr: string }) => {
  for (const secret of [TOKEN, TOKEN.split('.')[1]!, POLL_ID]) {
    assert.ok(!out.stdout.includes(secret), 'a secret reached stdout');
    assert.ok(!out.stderr.includes(secret), 'a secret reached stderr');
  }
};

test('APPROVED: pending twice, then the token kept in the hosts file, the default set, and printed nowhere', async (t) => {
  const host = await stub(t, (n) => (n < 2 ? pending : granted));
  const out = await run(t, host.base);

  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stdout, '');
  assert.ok(out.stderr.includes(`Open ${host.base}/settings/agents and enter  123 456   (10 minutes)`), out.stderr);
  assert.match(out.stderr, new RegExp(`logged in to ${host.base.replaceAll('.', '\\.')} as .+ · token expires 2099-01-01`));
  hidden(out);

  const hosts = readHosts(out.file);
  assert.equal(hosts.default, host.base);
  assert.equal(hosts.hosts[host.base]?.token?.value, TOKEN);
  assert.equal(hosts.hosts[host.base]?.token?.expires, LATER);

  assert.deepEqual(host.seen.map((s) => s.path), ['/auth/device', '/auth/device/token', '/auth/device/token', '/auth/device/token']);
  assert.equal(host.seen[0]?.body.reach, 'login');
  assert.equal(typeof host.seen[0]?.body.label, 'string');
  assert.equal(host.seen[1]?.body.device_code, POLL_ID);
});

test(
  'the hosts file is written 0600',
  { skip: process.platform === 'win32' ? 'Windows keeps no POSIX mode on a file, so 0600 cannot be checked here' : false },
  async (t) => {
    const host = await stub(t, () => granted);
    const out = await run(t, host.base);
    assert.equal(out.code, 0, out.stderr);
    assert.equal(statSync(out.file).mode & 0o777, 0o600);
  },
);

test('EXPIRED: one plain sentence, exit 1, and nothing saved', async (t) => {
  const host = await stub(t, (n) => (n < 1 ? pending : refused('DEVICE_CODE_EXPIRED')));
  const out = await run(t, host.base);
  assert.equal(out.code, 1);
  assert.equal(out.stderr.trim().split('\n').pop(), `The code expired before anyone approved it. Run braindog login ${host.base} to start again.`);
  assert.equal(existsSync(out.file), false);
  hidden(out);
});

test('DENIED: one plain sentence, exit 1, and nothing saved', async (t) => {
  const host = await stub(t, () => refused('DEVICE_CODE_TRIES'));
  const out = await run(t, host.base);
  assert.equal(out.code, 1);
  assert.equal(out.stderr.trim().split('\n').pop(), `The request was denied after five wrong codes were typed. Run braindog login ${host.base} to start again.`);
  assert.equal(existsSync(out.file), false);
  hidden(out);
});

test('AN APPROVAL ADDRESS ON ANOTHER SITE IS REFUSED BEFORE ANY CODE IS SHOWN', async (t) => {
  const host = await stub(t, () => granted, () => 'https://evil.example/settings/agents');
  const out = await run(t, host.base);
  assert.equal(out.code, 1);
  assert.ok(!out.stderr.includes('123'), 'the code was printed for a foreign address');
  assert.deepEqual(host.seen.map((s) => s.path), ['/auth/device'], 'it polled after refusing');
  assert.equal(existsSync(out.file), false);
});

test('CTRL+C WHILE WAITING ENDS WITH ONE SENTENCE, A NON-ZERO EXIT, AND NOTHING SAVED', async (t) => {
  /* In process, because a signal cannot be sent to a child the same way on every platform. main.ts aborts this signal on SIGINT. */
  const host = await stub(t, () => ({ status: 200, body: { ok: true, value: { pending: true, interval: 5 } } }));
  const config = mkdtempSync(join(tmpdir(), 'braindog-login-'));
  t.after(() => rmSync(config, { recursive: true, force: true }));
  const file = join(config, 'braindog', 'hosts.json');
  const stopping = new AbortController();
  const lines: string[] = [];
  const code = await login(host.base, {
    file,
    signal: stopping.signal,
    say: (line) => {
      lines.push(line);
      if (line.startsWith('Open ')) setTimeout(() => stopping.abort(), 20);
    },
  });
  assert.equal(code, 1);
  assert.equal(lines.at(-1), 'Sign-in was stopped before it finished, and nothing was saved.');
  assert.equal(existsSync(file), false);
});
