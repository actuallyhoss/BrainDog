/**
 * Where the token comes from, where it goes, and where it never goes.
 *
 * THE HOSTS FILE IS THE ONLY PLACE ON DISK A LOGIN LIVES, so its mode and its atomic write are
 * asserted here rather than trusted. The request half runs against a stub on node:http, because a
 * deadline and a redirect are properties of a real socket.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BUDGET_MS, budgetOf, clientFor, hostKey, hostsPath, readHosts, sameHost, saveHosts, target, type HostsFile } from '../src/http.ts';
import { normaliseRemote, sessionHeaders, type Position } from '../src/position.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-bearer-never-printed-4c1d';
const LATER = '2099-01-01T00:00:00.000Z';

const scratch = (t: { after: (fn: () => void) => void }) => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-hosts-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'braindog', 'hosts.json');
};

const listen = async (server: Server, t: { after: (fn: () => Promise<void>) => void }) => {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

/* ── the hosts file ────────────────────────────────────────────────────── */

test('the hosts file is XDG first, then APPDATA on Windows, then ~/.config', () => {
  assert.equal(hostsPath({ XDG_CONFIG_HOME: '/xdg', APPDATA: '/appdata' }, 'win32'), join('/xdg', 'braindog', 'hosts.json'));
  assert.equal(hostsPath({ APPDATA: '/appdata' }, 'win32'), join('/appdata', 'braindog', 'hosts.json'));
  assert.equal(hostsPath({ APPDATA: '/appdata' }, 'linux'), join(homedir(), '.config', 'braindog', 'hosts.json'));
});

test('THE HOSTS FILE IS WRITTEN WHOLE, over whatever a killed run left behind', (t) => {
  const file = scratch(t);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, 'half a file', { mode: 0o644 });

  const hosts: HostsFile = { default: 'https://app.brain.dog', hosts: { 'https://app.brain.dog': { token: { value: TOKEN, expires: LATER, label: 'test' } } } };
  saveHosts(file, hosts);
  assert.deepEqual(readHosts(file), hosts);
  assert.equal(existsSync(`${file}.tmp`), false, 'the half-written file was left beside the whole one');
});

test(
  'THE HOSTS FILE IS 0600, and so is a leftover it replaces',
  { skip: process.platform === 'win32' ? 'Windows has no file mode; the file takes the profile ACL' : false },
  (t) => {
    const file = scratch(t);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, 'half a file', { mode: 0o644 });
    saveHosts(file, { hosts: {} });
    assert.equal(statSync(file).mode & 0o777, 0o600);

    const fresh = scratch(t);
    saveHosts(fresh, { hosts: {} });
    assert.equal(statSync(fresh).mode & 0o777, 0o600);
    assert.equal(statSync(dirname(fresh)).mode & 0o777, 0o700, 'the folder that holds it is open to others');
  },
);

test('A HOSTS FILE THAT IS NOT JSON is refused without quoting it, because it holds a token', (t) => {
  const file = scratch(t);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `{"hosts":{"https://app.brain.dog":{"token":{"value":"${TOKEN}"`);
  assert.throws(
    () => readHosts(file),
    (e: Error) => /is not valid JSON/.test(e.message) && !e.message.includes(TOKEN) && !e.message.includes('stub-bearer'),
  );
});

/* ── which host, which token ───────────────────────────────────────────── */

test('the host is --host, then BRAINDOG_HOST, then the default; the token is BRAINDOG_TOKEN, then the file', (t) => {
  const file = scratch(t);
  saveHosts(file, {
    default: 'a.example',
    hosts: {
      'https://a.example/': { token: { value: 'token-a', expires: LATER, label: 'a' } },
      'https://b.example': { token: { value: 'token-b', expires: LATER, label: 'b' } },
    },
  });
  assert.deepEqual(target(undefined, {}, file), { key: 'https://a.example', base: 'https://a.example', token: 'token-a' });
  assert.deepEqual(target(undefined, { BRAINDOG_HOST: 'b.example' }, file), { key: 'https://b.example', base: 'https://b.example', token: 'token-b' });
  assert.equal(target('a.example', { BRAINDOG_HOST: 'b.example' }, file).token, 'token-a');
  assert.equal(target(undefined, { BRAINDOG_TOKEN: 'from-env' }, file).token, 'from-env');
  /* A host the file does not know is still a host, and a self-host with no token answers its own machine. */
  assert.deepEqual(target('http://127.0.0.1:8080', {}, file), { key: 'http://127.0.0.1:8080', base: 'http://127.0.0.1:8080' });
  /* With both from the environment the file is never opened, so a broken one does not matter. */
  assert.equal(target(undefined, { BRAINDOG_HOST: 'a.example', BRAINDOG_TOKEN: 'x' }, join(file, 'not-a-file')).token, 'x');
  /* The slug stays in the key and leaves the address: the token says which record. */
  assert.deepEqual(target('https://app.brain.dog/acme', { BRAINDOG_TOKEN: 'x' }, file), { key: 'https://app.brain.dog/acme', base: 'https://app.brain.dog', token: 'x' });
});

test('THE APP\'S OLD ADDRESS FOR A RECORD, /app/<slug>, IS THE SAME HOST AS /<slug>', (t) => {
  /* `app` is a reserved slug (`packages/record/src/directory.ts`), so a first
     segment of `app` is never a record and always the app's old prefix. Only that whole segment goes: `/apple` is a slug. */
  assert.equal(hostKey('https://app.brain.dog/app/acme'), 'https://app.brain.dog/acme');
  assert.equal(hostKey('app.brain.dog/app/acme/'), 'https://app.brain.dog/acme');
  assert.equal(hostKey('https://app.brain.dog/app'), 'https://app.brain.dog');
  assert.equal(hostKey('https://app.brain.dog/app/'), 'https://app.brain.dog');
  assert.equal(hostKey('https://app.brain.dog/apple'), 'https://app.brain.dog/apple');
  assert.equal(hostKey('https://app.brain.dog/acme'), 'https://app.brain.dog/acme', 'the address the app prints now changes nothing');
  assert.equal(hostKey('https://record.example/app/acme'), 'https://record.example/acme', 'a self-host reads the prefix the same way');

  /* The token a login kept under `/acme` is the one a command pointed at `/app/acme` sends, and the slug never reaches the address. */
  const file = scratch(t);
  saveHosts(file, { hosts: { 'https://app.brain.dog/acme': { token: { value: TOKEN, expires: LATER, label: 'a' } } } });
  assert.deepEqual(target('https://app.brain.dog/app/acme', {}, file), { key: 'https://app.brain.dog/acme', base: 'https://app.brain.dog', token: TOKEN });
});

test('BRAIN.DOG IS THE SITE NOW, SO A RECORD WRITTEN THERE IS THE SAME RECORD ON app.brain.dog', (t) => {
  /* A hosts file written when the app was `brain.dog/<slug>` keeps working: the key moves to the app's name, and the
     login kept under the old spelling is the one `target` finds, so nobody has to edit the file. */
  assert.equal(hostKey('https://brain.dog/acme'), 'https://app.brain.dog/acme');
  assert.equal(hostKey('brain.dog/app/acme/'), 'https://app.brain.dog/acme');
  assert.equal(hostKey('https://brain.dog'), 'https://app.brain.dog');
  assert.equal(hostKey('https://alpha.brain.dog/acme'), 'https://app.alpha.brain.dog/acme');
  assert.equal(hostKey('https://notbrain.dog/acme'), 'https://notbrain.dog/acme', 'only the two names the site holds move');
  const file = scratch(t);
  saveHosts(file, { default: 'https://brain.dog/acme', hosts: { 'https://brain.dog/acme': { token: { value: TOKEN, expires: LATER, label: 'a' } } } });
  assert.deepEqual(target(undefined, {}, file), { key: 'https://app.brain.dog/acme', base: 'https://app.brain.dog', token: TOKEN });
  assert.ok(sameHost('https://brain.dog/acme', 'https://app.brain.dog/acme'));
  assert.ok(sameHost('https://app.brain.dog/app/acme', 'https://app.brain.dog/acme'));
});

test('THE EXAMPLE IN A REFUSAL IS THE ADDRESS THE APP LIVES AT NOW, app.brain.dog/<slug>', () => {
  assert.throws(() => hostKey('not a host'), { message: 'The BrainDog host is not an address. Write it as https://app.brain.dog/<slug>.' });
  assert.throws(() => hostKey('ftp://a.example'), { message: 'The BrainDog host is not an https address. Write it as https://app.brain.dog/<slug>.' });
});

test('nothing to reach is one sentence, and none of them carries a token', (t) => {
  const file = scratch(t);
  saveHosts(file, { default: 'https://a.example', hosts: { 'https://a.example': { token: { value: TOKEN, expires: '2020-01-01T00:00:00Z', label: 'a' } } } });
  const says = (fn: () => unknown, pattern: RegExp) =>
    assert.throws(fn, (e: Error) => pattern.test(e.message) && !e.message.includes('stub-bearer') && !e.message.includes('hunter2'));

  says(() => target(undefined, {}, file), /^The login to https:\/\/a\.example expired on 2020-01-01\. Run braindog login https:\/\/a\.example\.$/);
  says(() => target(undefined, {}, join(file, '..', 'none.json')), /^No BrainDog host is set/);
  says(() => target('http://a.example', { BRAINDOG_TOKEN: TOKEN }, file), /is http, not https\. BrainDog sends a token only over https, except to this machine\.$/);
  says(() => target('https://me:hunter2@a.example', {}, file), /carries a name or a password/);
  says(() => hostKey('ftp://a.example'), /not an https address/);
});

test('a budget comes from BRAINDOG_TIMEOUT_MS when it is a whole number of milliseconds', () => {
  assert.equal(budgetOf({}), BUDGET_MS);
  assert.equal(BUDGET_MS, 20_000);
  assert.equal(budgetOf({ BRAINDOG_TIMEOUT_MS: '400' }), 400);
  for (const junk of ['0', '-5', '1.5', 'soon', '']) assert.equal(budgetOf({ BRAINDOG_TIMEOUT_MS: junk }), BUDGET_MS, junk);
});

/* ── the request ───────────────────────────────────────────────────────── */

test('A REQUEST CARRIES THE BEARER AND THE SESSION HEADERS, and gives up at its deadline', async (t) => {
  const seen: IncomingHttpHeaders[] = [];
  const base = await listen(
    createServer((req, res) => {
      seen.push(req.headers);
      if (req.url?.startsWith('/api/version')) return; // never answers
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, value: { registers: [], now: '2026-09-11T00:00:00Z' } }));
    }),
    t,
  );
  const to = { key: base, base, token: TOKEN };

  const boot = await clientFor(to, async () => ({ 'x-braindog-agent': 'claude' }), AbortSignal.timeout(2_000)).call('boot');
  assert.equal(boot.ok, true);
  assert.equal(seen[0]?.authorization, `Bearer ${TOKEN}`);
  assert.equal(seen[0]?.['x-braindog-agent'], 'claude');

  const started = Date.now();
  const late = await clientFor(to, async () => ({}), AbortSignal.timeout(250)).call('version');
  assert.ok(Date.now() - started < 1_500, 'the deadline did not stop the request');
  assert.equal(!late.ok && 'refusal' in late && late.refusal.code, 'UNREACHABLE');
  assert.ok(!JSON.stringify(late).includes('stub-bearer'), 'the refusal carries the token');
});

test('A REDIRECT IS NOT FOLLOWED, so the bearer never goes where nobody chose', async (t) => {
  const elsewhere: IncomingHttpHeaders[] = [];
  const other = await listen(
    createServer((req, res) => {
      elsewhere.push(req.headers);
      res.end('{}');
    }),
    t,
  );
  const base = await listen(
    createServer((_req, res) => {
      res.writeHead(307, { location: `${other}/api/boot` });
      res.end();
    }),
    t,
  );
  const r = await clientFor({ key: base, base, token: TOKEN }, async () => ({}), AbortSignal.timeout(2_000)).call('boot');
  assert.equal(!r.ok && 'refusal' in r && r.refusal.code, 'UNREACHABLE');
  assert.equal(elsewhere.length, 0, 'the redirect was followed');
});

/* ── the session headers ───────────────────────────────────────────────── */

test('a remote is compared without its scheme, its user, a password or .git', () => {
  const cases: [string, string | null][] = [
    ['git@github.com:Acme/braindog.git', 'github.com/Acme/braindog'],
    ['https://github.com/Acme/braindog.git', 'github.com/Acme/braindog'],
    ['https://name:not-a-password@GitHub.com/Acme/braindog/', 'github.com/Acme/braindog'],
    ['ssh://git@github.com:22/Acme/braindog.git', 'github.com:22/Acme/braindog'],
    ['C:\\repos\\braindog', null],
    ['/srv/git/braindog.git', null],
  ];
  for (const [from, to] of cases) assert.equal(normaliseRemote(from), to, from);
});

test('A HEADER OUTSIDE ITS GRAMMAR IS DROPPED rather than sent broken', () => {
  const p: Position = {
    cwd: 'C:\\Repos\\braindog',
    repo: 'braindog',
    remote: 'github.com/Acme/braindog',
    host: 'STUDIO-PC',
    branch: 'master',
    head: 'aee9762',
  };
  assert.deepEqual(sessionHeaders(p, 'claude'), {
    'x-braindog-host': 'STUDIO-PC',
    'x-braindog-repo': 'braindog',
    'x-braindog-remote': 'github.com/Acme/braindog',
    'x-braindog-cwd': 'C:\\Repos\\braindog',
    'x-braindog-agent': 'claude',
    'x-braindog-cli': 'dev+0000000',
  });
  /* A folder in another script would make fetch throw on every call; a repo is a name, never a path. */
  assert.deepEqual(sessionHeaders({ ...p, cwd: 'C:\\Users\\Zoë', repo: 'a..b', host: 'my laptop', remote: null }), { 'x-braindog-cli': 'dev+0000000' });
});
