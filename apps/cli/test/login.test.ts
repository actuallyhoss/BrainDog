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
import { ANY_HOST, login, sameMachine } from '../src/login.ts';

/**
 * Production's `PUBLIC_HOST`, read off `apps/worker/wrangler.jsonc` with the deploy check script's own parser.
 *
 * THE LOGIN EXAMPLE IS THE ONE ADDRESS A PERSON COPIES, AND ONLY ONE HOST STARTS A DEVICE THERE. `POST /auth/device`
 * checks that the name a request came by is `PUBLIC_HOST` (`packages/host/src/device.ts`), and with the production vars
 * `app.brain.dog` answered 403 "This BrainDog signs devices in at https://brain.dog, so start there". The example
 * said `app.brain.dog` and promised it "signs in on both sides", and nothing here read the file that made that
 * false, so the tests stayed green through the flip. A runtime specifier, because the script has no declaration and a static import of it does not typecheck.
 */
const checker = new URL('../../worker/scripts/provision-check.mjs', import.meta.url).href;
const { wranglerConfig } = (await import(checker)) as { wranglerConfig: () => { env?: { [name: string]: { vars?: { [key: string]: string } } } } };
const PRODUCTION = wranglerConfig().env?.['production']?.vars?.['PUBLIC_HOST'] ?? '';

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

test('THE APP\'S ADDRESS FOR A RECORD, <host>/app/<slug>, POSTS THE SLUG AND KEEPS THE LOGIN UNDER <host>/<slug>', async (t) => {
  /* The whole pathname used to be the slug, so the address the app now prints
     sent `app/acme`, which no Directory holds, and the sign-in failed with "Name a record this BrainDog holds". */
  const host = await stub(t, () => granted);
  const out = await run(t, `${host.base}/app/acme`);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(host.seen.map((s) => [s.path, s.body.slug]), [['/auth/device', 'acme'], ['/auth/device/token', 'acme']]);
  const hosts = readHosts(out.file);
  assert.equal(hosts.default, `${host.base}/acme`);
  assert.equal(hosts.hosts[`${host.base}/acme`]?.token?.value, TOKEN);
  hidden(out);
});

test('THE OLD SHAPE, <host>/<slug>, STILL POSTS THE SLUG', async (t) => {
  const host = await stub(t, () => granted);
  const out = await run(t, `${host.base}/acme/`);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(host.seen.map((s) => [s.path, s.body.slug]), [['/auth/device', 'acme'], ['/auth/device/token', 'acme']]);
  assert.equal(readHosts(out.file).default, `${host.base}/acme`);
});

test('A USAGE MISTAKE NAMES THE ADDRESS THE APP LIVES AT NOW, on the host production starts a device on', async (t) => {
  const config = mkdtempSync(join(tmpdir(), 'braindog-login-'));
  t.after(() => rmSync(config, { recursive: true, force: true }));
  const child = spawn(process.execPath, [MAIN, 'login'], { env: { ...process.env, XDG_CONFIG_HOME: config, APPDATA: config }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  assert.equal(await new Promise<number | null>((done) => child.on('close', done)), 1);
  assert.ok(PRODUCTION.length > 0, 'apps/worker/wrangler.jsonc has no PUBLIC_HOST for production');
  assert.equal(stderr.trim(), `braindog login takes one host, as in braindog login https://${PRODUCTION}/app/<slug>, and --vault <project>, and nothing else.`);
});

test('THE ADDRESS A SIGNED-OUT AGENT PASSES ON IS ON THAT HOST TOO', () => {
  /* `ANY_HOST` is what the MCP server's refusal tells a person to run `login` with (`src/signed-out.ts`), so it is the
     same example in a second place, and it was the same `app.brain.dog`. */
  assert.equal(new URL(ANY_HOST.replace('<slug>', 'acme')).host, PRODUCTION);
  assert.equal(new URL(ANY_HOST.replace('<slug>', 'acme')).pathname, '/app/acme');
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

test('A LOCAL SELF-HOST THAT CALLS ITSELF localhost is the same machine as 127.0.0.1, and the sign-in goes through', async (t) => {
  const host = await stub(t, () => granted, (base) => `${base.replace('127.0.0.1', 'localhost')}/settings/agents`);
  const out = await run(t, host.base);
  assert.equal(out.code, 0, out.stderr);
  assert.ok(out.stderr.includes('/settings/agents and enter  123 456'), out.stderr);
  assert.equal(readHosts(out.file).hosts[host.base]?.token?.value, TOKEN);
  hidden(out);
});

test('LOOPBACK NAMES ARE ONE HOST ONLY FOR THIS MACHINE: never for a remote host, another port or another scheme', () => {
  assert.equal(sameMachine('http://localhost:5993', new URL('http://127.0.0.1:5993')), true);
  assert.equal(sameMachine('http://127.0.0.1:5993', new URL('http://localhost:5993')), true);
  assert.equal(sameMachine('http://[::1]:5993', new URL('http://localhost:5993')), true);
  assert.equal(sameMachine('https://localhost', new URL('https://studio.example')), false);
  assert.equal(sameMachine('http://localhost:5993', new URL('https://studio.example:5993')), false);
  assert.equal(sameMachine('http://localhost:5994', new URL('http://127.0.0.1:5993')), false);
  assert.equal(sameMachine('https://localhost:5993', new URL('http://127.0.0.1:5993')), false);
  assert.equal(sameMachine('https://evil.example:5993', new URL('http://127.0.0.1:5993')), false);
  assert.equal(sameMachine('not an address', new URL('http://127.0.0.1:5993')), false);
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
