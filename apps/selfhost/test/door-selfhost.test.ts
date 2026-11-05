/**
 * The self-host's door audit of 30 October (loop/audit-2026-10-31c, D2, D15, D16, D40, D41): a backup's secret never
 * reaches the image, the server's two settings have names of their own, a missing app is said, the address follows the
 * published port, and loopback is both loopbacks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { APP_ROOT, bakedSaid, bakedSecrets, secretFile } from '../src/baked.ts';
import { listenOf, openWide, originOf, serverKeyOf } from '../src/how.ts';
import { start } from '../src/server.ts';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'braindog-door-'));

test('A BACKUP, A KEY FILE, A TOKEN OR A .env IN THE IMAGE TREE IS FOUND, and nothing installed or kept is', () => {
  const root = scratch();
  try {
    for (const [path, body] of [
      ['backups/braindog-20261030T101010Z/home/inbound.token', 't'],
      ['apps/x/kek', 'k'],
      ['.env', 'BRAINDOG_SERVER_KEY=x'],
      ['apps/x/record.brain', ''],
      ['apps/x/ok.ts', ''],
      ['node_modules/pkg/kek', 'installed, never walked'],
      ['data/home/record.brain', 'this process own data'],
    ] as const) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), body);
    }
    const found = bakedSecrets(root, [join(root, 'data')]);
    assert.deepEqual([...found].sort(), ['.env', 'apps/x/kek', 'apps/x/record.brain', 'backups/'].sort());
    const said = bakedSaid(found);
    assert.ok(said.includes('backups/') && said.includes('docker image rm'), said);
    for (const name of ['inbound.token', 'kek.prev', 'claim-link', '.env.local', 'directory.sqlite', 'directory.sqlite-wal', 'x.brainl.age', 'key.pem'])
      assert.ok(secretFile(name), name);
    for (const name of ['selfhost.env.example', 'main.ts', 'index.html', 'keys.ts']) assert.ok(!secretFile(name), name);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('THIS REPOSITORY, AS THE IMAGE COPIES IT, HOLDS NONE: .dockerignore keeps out every name the check looks for', () => {
  /* EVERY PATTERN THE CHECK READS AS A SECRET HAS A LINE IN .dockerignore, so a correct build never trips it. */
  const ignore = readFileSync(join(APP_ROOT, '.dockerignore'), 'utf8');
  for (const line of ['**/backups', '**/inbound.token', '**/claim-link', '**/kek', '**/.env', '**/.env.*', '**/*.sqlite', '**/*.brain', '**/*.pem'])
    assert.ok(ignore.split('\n').includes(line), `.dockerignore has no ${line}`);
  /* AND THE DOCKERFILE RUNS THE CHECK BEFORE THE INSTALL, and marks the image so the start runs it too. */
  const dockerfile = readFileSync(join(APP_ROOT, 'apps/selfhost/Dockerfile'), 'utf8');
  assert.ok(dockerfile.indexOf('RUN node apps/selfhost/src/baked.ts') < dockerfile.indexOf('RUN pnpm install'), dockerfile);
  assert.match(dockerfile, /BRAINDOG_IMAGE=1/);
});

test('THE SERVER KEY AND THE INTERFACE HAVE NAMES OF THEIR OWN, and the old ones still work where they cannot mean the CLI', () => {
  assert.deepEqual(serverKeyOf({ BRAINDOG_SERVER_KEY: 'new', BRAINDOG_TOKEN: 'old' }), { value: 'new', name: 'BRAINDOG_SERVER_KEY' });
  assert.deepEqual(serverKeyOf({ BRAINDOG_TOKEN: 'old' }), { value: 'old', name: 'BRAINDOG_TOKEN' });
  assert.deepEqual(serverKeyOf({}), { value: undefined, name: 'BRAINDOG_TOKEN' });
  assert.equal(listenOf({ BRAINDOG_LISTEN: '127.0.0.1', BRAINDOG_HOST: '0.0.0.0' }), '127.0.0.1');
  assert.equal(listenOf({ BRAINDOG_HOST: '0.0.0.0' }), '0.0.0.0');
  /* THE COMMAND LINE'S BRAINDOG_HOST IS AN ADDRESS, and never an interface to bind. */
  assert.equal(listenOf({ BRAINDOG_HOST: 'http://localhost:8080/home' }), undefined);
  assert.equal(listenOf({}), undefined);
});

test('IN THE IMAGE THE ADDRESS FOLLOWS BRAINDOG_PORT, and BRAINDOG_ORIGIN and a certificate still win', () => {
  assert.equal(originOf({ BRAINDOG_IMAGE: '1', BRAINDOG_PORT: '9090' }, 8080, false), 'http://localhost:9090');
  assert.equal(originOf({ BRAINDOG_IMAGE: '1', BRAINDOG_PORT: '127.0.0.1:9090' }, 8080, false), 'http://localhost:9090');
  assert.equal(originOf({ BRAINDOG_IMAGE: '1', BRAINDOG_PORT: '8080' }, 8080, false), undefined);
  assert.equal(originOf({ BRAINDOG_IMAGE: '1', BRAINDOG_PORT: '9090', BRAINDOG_ORIGIN: 'https://b.example' }, 8080, false), 'https://b.example');
  assert.equal(originOf({ BRAINDOG_IMAGE: '1', BRAINDOG_PORT: '9090' }, 8080, true), undefined);
  assert.equal(originOf({ BRAINDOG_PORT: '9090' }, 8080, false), undefined, 'outside the image nothing publishes that port');
});

test('WITH NO APP BUILT, A BROWSER AT / GETS A PAGE SAYING SO, and a script still gets the JSON 404', async () => {
  const dir = scratch();
  const running = await start({ file: join(dir, 'r.sqlite'), port: 0, token: 'a-server-key-for-this-test-only' });
  try {
    const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 503);
    assert.match(page.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(await page.text(), /pnpm --filter @braindog\/web build/);
    const signin = await fetch(`${base}/signin`, { headers: { accept: 'text/html' } });
    assert.equal(signin.status, 503);
    const script = await fetch(`${base}/nowhere`);
    assert.equal(script.status, 404);
    assert.equal(((await script.json()) as { refusal: { code: string } }).refusal.code, 'ROUTE_UNKNOWN');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A WRONG METHOD ON /mcp IS 405 WITH Allow AND A SENTENCE, the code every door uses', async () => {
  const dir = scratch();
  const running = await start({ file: join(dir, 'r.sqlite'), port: 0, token: 'a-server-key-for-this-test-only' });
  try {
    const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
    for (const method of ['GET', 'DELETE']) {
      const got = await fetch(`${base}/mcp`, { method });
      assert.equal(got.status, 405, method);
      assert.equal(got.headers.get('allow'), 'POST');
      assert.equal(((await got.json()) as { refusal: { code: string } }).refusal.code, 'ROUTE_UNKNOWN');
    }
    const write = await fetch(`${base}/api/create`, { headers: { authorization: 'Bearer a-server-key-for-this-test-only' } });
    assert.equal(write.status, 405);
    assert.equal(((await write.json()) as { refusal: { code: string } }).refusal.code, 'ROUTE_UNKNOWN');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A HOST WITH A SERVER KEY ANSWERS ON IPv6 TOO, and an open one on both loopbacks', async (t) => {
  const dir = scratch();
  try {
    for (const token of ['a-server-key-for-this-test-only', undefined]) {
      const running = await start({ file: join(dir, `${token ? 'keyed' : 'open'}.sqlite`), port: 0, ...(token ? { token } : {}) });
      try {
        const port = (running.server.address() as { port: number }).port;
        assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
        let six: Response | null = null;
        try {
          six = await fetch(`http://[::1]:${port}/healthz`);
        } catch {
          t.diagnostic('this machine has no IPv6 loopback, so only IPv4 was asked');
        }
        if (six) assert.equal(six.status, 200, token ? 'keyed' : 'open');
      } finally {
        await running.close();
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('NO KEY PAST LOOPBACK IS REFUSED AT START: anybody on the network would send Host: localhost and be the owner', () => {
  for (const wide of ['0.0.0.0', '::', '[::]', '192.168.1.20', 'box.local']) assert.equal(openWide(undefined, wide), true, wide);
  assert.equal(openWide('   ', '0.0.0.0'), true, 'a blank key is no key');
  for (const near of [undefined, '127.0.0.1', '::1', '[::1]', 'localhost', 'LOCALHOST']) assert.equal(openWide(undefined, near), false, String(near));
  assert.equal(openWide('a-real-key', '0.0.0.0'), false, 'a key is what makes a wide bind fine');
});
