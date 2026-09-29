/**
 * Where a phone can reach this self-host, and what is honestly true at each shape of origin.
 *
 * THE MEASUREMENT THAT PROMPTED THIS FILE. `start({ origin: 'https://192.168.1.50:8443' })` answers
 * `signIn: { ways: [], off: null }` and `/auth/methods` answers `passkey: false`: sign-in is nominally
 * on, there is no way in, and nothing anywhere says why. `relyingParty` refuses an IP literal because
 * WebAuthn binds a credential to a hostname, and the operator who typed the obvious thing for a home
 * network gets a sign-in screen with no buttons on it. That silence is the defect these tests pin.
 *
 * AND THE OTHER MEASUREMENT: `start({ origin: 'https://brain.example.test' })` behind a terminator
 * already works today. `off` is `null`, `/auth/methods` answers `passkey: true`. The recorded blocker
 * said a self-host on the LAN "cannot sign him in from his phone", and the reverse-proxy shape could,
 * untested and undocumented. So the missing capability is narrower than recorded: this process could
 * not terminate TLS itself, and it could not tell anybody which shapes work.
 *
 * THE CERTIFICATE BELOW IS A TEST FIXTURE AND OPENS NOTHING. It is a self-signed P-256 pair made for
 * `brain.home.arpa`, `localhost` and `127.0.0.1`, dated a hundred years out so the suite does not turn
 * red on a calendar. It is trusted by exactly one thing, the `ca` option in the requests in this file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { request } from 'node:https';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { certificateNames, nameChange, originFor, reachLine, reachOf } from '../src/reach.ts';
import { start } from '../src/server.ts';
import { answers, SERVE_DEADLINE_MS, serveUntil } from './serving.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

const CERT = `-----BEGIN CERTIFICATE-----
MIIBuTCCAV+gAwIBAgIUPRaU7TKaFIQDuwKES41/f3pD4UwwCgYIKoZIzj0EAwIw
GjEYMBYGA1UEAwwPYnJhaW4uaG9tZS5hcnBhMCAXDTI2MDkyMDEyNDIxMloYDzIx
MjYwODI3MTI0MjEyWjAaMRgwFgYDVQQDDA9icmFpbi5ob21lLmFycGEwWTATBgcq
hkjOPQIBBggqhkjOPQMBBwNCAAT4v4V9F+CEH2WzuzdMowVwAv/IUbZLVbTKZEVh
cxJx7C7rfwb8x/jSrZz0bfbe44+w7WYCCuUgfyR6K6G73vDho4GAMH4wHQYDVR0O
BBYEFK0NaaRxnB0wc5VQxs9oZ03jgimyMB8GA1UdIwQYMBaAFK0NaaRxnB0wc5VQ
xs9oZ03jgimyMA8GA1UdEwEB/wQFMAMBAf8wKwYDVR0RBCQwIoIPYnJhaW4uaG9t
ZS5hcnBhgglsb2NhbGhvc3SHBH8AAAEwCgYIKoZIzj0EAwIDSAAwRQIgHFHrbI9j
DHg70Lh++vA+6zDEIwS6/awu7bCPGlfZSfwCIQDS78A+RaoTh7ZyzwL2faVhdxiq
CYJrS789eyf6UZ7R0Q==
-----END CERTIFICATE-----
`;

const CERT_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnFiYMMhjg0SpQuM3
HGMimeLzhpHV2k0l/Y9fn9QAEDWhRANCAAT4v4V9F+CEH2WzuzdMowVwAv/IUbZL
VbTKZEVhcxJx7C7rfwb8x/jSrZz0bfbe44+w7WYCCuUgfyR6K6G73vDh
-----END PRIVATE KEY-----
`;

test('a certificate says which hostnames a browser will accept without a warning', () => {
  assert.deepEqual(certificateNames(CERT), ['brain.home.arpa', 'localhost']);
});

test('with no origin configured, the certificate chooses the name, and the port is kept', () => {
  assert.equal(originFor({ names: certificateNames(CERT), port: 8443 }), 'https://brain.home.arpa:8443');
  assert.equal(originFor({ names: certificateNames(CERT), port: 443 }), 'https://brain.home.arpa');
});

test('a configured origin the certificate does not name is refused before anything listens', () => {
  assert.throws(
    () => originFor({ configured: 'https://elsewhere.example', names: certificateNames(CERT), port: 8443 }),
    /elsewhere\.example[\s\S]*brain\.home\.arpa/,
  );
});

test('a configured origin the certificate does name is kept exactly as written', () => {
  assert.equal(originFor({ configured: 'https://brain.home.arpa:8443', names: certificateNames(CERT), port: 8443 }), 'https://brain.home.arpa:8443');
});

test('an address in BRAINDOG_ORIGIN is refused for the passkey, and not as a certificate that does not name it', () => {
  /* THE FIXTURE CARRIES `IP:127.0.0.1` BESIDE ITS TWO NAMES, and `certificateNames` drops IP entries on
     purpose, so the mismatch test can never pass for an address however good the certificate is.
     MEASURED before this was pinned: the refusal read "the certificate names brain.home.arpa, localhost",
     which is false about this certificate and sends the operator off to reissue one that was already
     right. What is actually wrong is the thing `reachLine` has always said about an address. */
  assert.throws(
    () => originFor({ configured: 'https://127.0.0.1:8443', names: certificateNames(CERT), port: 8443 }),
    /is an address and not a hostname/,
  );
});

test('a wildcard certificate covers one label and no more', () => {
  const names = ['*.home.arpa'];
  assert.equal(covered('brain.home.arpa', names), true);
  assert.equal(covered('a.b.home.arpa', names), false);
  assert.equal(covered('home.arpa', names), false);
});

/** The same rule `originFor` applies, reached through the only door that exposes it. */
function covered(host: string, names: readonly string[]): boolean {
  try {
    originFor({ configured: `https://${host}`, names, port: 443 });
    return true;
  } catch {
    return false;
  }
}

test('plain http at a name that is not loopback holds no session, and the line says the three shapes', () => {
  const r = reachOf('http://192.168.1.50:8080');
  assert.equal(r.cookie, null);
  assert.equal(r.passkeys, false);
  assert.equal(r.trouble, 'insecure');
  const line = reachLine(r) ?? assert.fail('an origin that holds no session must say something');
  assert.match(line, /BRAINDOG_TLS_CERT/);
  assert.match(line, /BRAINDOG_ORIGIN/);
  assert.match(line, /BRAINDOG_TRUST_PROXY/);
});

test('https at an address and not a hostname keeps a session and registers no passkey, and says so', () => {
  const r = reachOf('https://192.168.1.50:8443');
  assert.equal(r.cookie, 'secure');
  assert.equal(r.passkeys, false);
  assert.equal(r.trouble, 'no-hostname');
  assert.match(reachLine(r) ?? '', /hostname/);
});

test('https at a hostname is the shape that works, and has nothing to say', () => {
  const r = reachOf('https://brain.home.arpa:8443');
  assert.equal(r.cookie, 'secure');
  assert.equal(r.passkeys, true);
  assert.equal(r.trouble, null);
  assert.equal(reachLine(r), null);
});

test('loopback http still works, because a browser treats it as a secure context', () => {
  const r = reachOf('http://localhost:8080');
  assert.equal(r.cookie, 'local');
  assert.equal(r.passkeys, true);
  assert.equal(r.trouble, null);
});

test('changing the name retires every passkey, and the operator is told once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-reach-'));
  try {
    const file = join(dir, 'served-at');
    assert.equal(nameChange(file, 'https://brain.home.arpa:8443'), null, 'a first boot has nothing to compare against');
    assert.equal(nameChange(file, 'https://brain.home.arpa:9443'), null, 'a different port is the same relying party');
    const said = nameChange(file, 'https://tallybook.example') ?? assert.fail('a changed hostname must be said');
    assert.match(said, /brain\.home\.arpa/);
    assert.match(said, /tallybook\.example/);
    assert.match(said, /passkey/i);
    assert.equal(nameChange(file, 'https://tallybook.example'), null, 'it is said once and not every boot');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the self-host terminates TLS itself, and a phone on the LAN can hold a session there', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-tls-'));
  const token = randomBytes(32).toString('base64url');
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token,
    tls: { cert: CERT, key: CERT_KEY },
    sessionKey: new Uint8Array(randomBytes(32)),
    pollMs: 0,
  });
  try {
    const port = (running.server.address() as { port: number }).port;

    /* THE CERTIFICATE NAMED THE ORIGIN, so nothing had to be configured twice: the name a browser will
       accept and the name a passkey is bound to are the same fact, and it is in the certificate. */
    assert.equal(running.signIn.origin, `https://brain.home.arpa:${port}`);
    assert.equal(running.signIn.off, null);
    assert.deepEqual(running.signIn.ways, ['a passkey']);

    const out = await over(port, '/auth/methods');
    assert.equal(out.status, 200);
    assert.equal((JSON.parse(out.body) as { value: { passkey: boolean } }).value.passkey, true);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * One GET over TLS, verified against the fixture certificate rather than against the machine's store.
 *
 * `fetch` TAKES NO `ca`, and the two ways round that are both worse: `NODE_TLS_REJECT_UNAUTHORIZED=0`
 * turns verification off for every other test in the process, and `NODE_EXTRA_CA_CERTS` has to be set
 * before the process starts. `node:https` takes the certificate per request, which is the narrowest
 * trust this check can be made with, and verifying at all is the point: an unverified handshake would
 * not prove the server presented the certificate it was given.
 */
function over(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', ca: CERT, servername: 'brain.home.arpa', headers: { host: `brain.home.arpa:${port}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => void chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * One write over TLS from a page claiming to be at `origin`, which is what the cross-origin check reads.
 *
 * THE REGISTER DOES NOT HAVE TO EXIST. The origin check happens at the door, before any handler, so an
 * allowed origin fails further in with some other refusal and a refused one never gets there. Asserting
 * on `refusal.at` rather than on the status alone is what keeps the two apart.
 */
function post(port: number, origin: string): Promise<{ status: number; body: string }> {
  const body = JSON.stringify({ register: 'obligations', fields: { what: 'Invoice 41' } });
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/create',
        method: 'POST',
        ca: CERT,
        servername: 'brain.home.arpa',
        headers: { host: `brain.home.arpa:${port}`, origin, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => void chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * The same two decisions through the real process, because they are made out of the environment.
 *
 * `serve` RUNS UNTIL IT IS STOPPED, so it is stopped once it has said what is asserted (`serving.ts`). Its boot
 * lines come after it has opened the record and listened, which under a loaded test run was measured past the
 * five seconds a fixed `spawnSync` timeout gave it, so the wait is for the lines and not for a clock.
 */
test('serve holds a certificate from the environment, and says when the name it is served at has moved', async () => {
  const data = mkdtempSync(join(tmpdir(), 'braindog-serve-tls-'));
  try {
    const certFile = join(data, 'lan.cert');
    const keyFile = join(data, 'lan.key');
    writeFileSync(certFile, CERT);
    writeFileSync(keyFile, CERT_KEY);
    const base = { ...process.env, BRAINDOG_DATA: data, PORT: '0', BRAINDOG_TOKEN: randomBytes(32).toString('base64url'), BRAINDOG_HOST: '127.0.0.1' };

    const made = spawnSync(process.execPath, [MAIN, 'init', 'the-studio', '--owner', 'ada@example.com'], { encoding: 'utf8', env: base });
    assert.equal(made.status, 0, made.stderr);

    /* UNTIL IT ANSWERS, AND NOT ONLY UNTIL THE LINE: the name is recorded just under the line, and the second boot
       below has nothing to compare against unless this one lived long enough to write it (`answers`). */
    const tls = await serveUntil({ ...base, BRAINDOG_TLS_CERT: certFile, BRAINDOG_TLS_KEY: keyFile }, async (said) => {
      const port = /sign in at https:\/\/brain\.home\.arpa:(\d+)\/signin/.exec(said)?.[1];
      return port !== undefined && (await answers(`https://127.0.0.1:${port}/healthz`));
    });
    assert.match(tls.stderr ?? '', /sign in at https:\/\/brain\.home\.arpa:\d+\/signin with a passkey/);
    assert.ok(!(tls.stderr ?? '').includes('the name changed'), 'a first boot claimed the name had changed');

    /* AND NOW THE ORIGIN SOMEBODY TYPES FOR A MACHINE ON A HOME NETWORK. Measured: this second boot
       reports `ways: ['the server key']`, so the line about the ways in is true and says nothing about
       the passkey button that will never appear. The explanation has to be its own line, under the
       true one, or it is only printed in the cases where sign-in is off altogether. It is also a
       different hostname from the run above, so the passkey warning is due in the same output. */
    /* THE MOVE IS THE LAST OF THE LINES ASSERTED, so it is the one waited for. */
    const moved = await serveUntil({ ...base, BRAINDOG_ORIGIN: 'https://192.168.1.50:8443' }, (said) => said.includes('the name changed'));
    assert.match(moved.stderr ?? '', /sign in at https:\/\/192\.168\.1\.50:8443\/signin with the server key/);
    assert.match(moved.stderr ?? '', /is an address and not a hostname/);
    assert.match(moved.stderr ?? '', /the name changed from brain\.home\.arpa to 192\.168\.1\.50/);
    assert.equal(moved.stdout ?? '', '', 'serve wrote to stdout, which belongs to the CLI');
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('a certificate without its key is a refusal, and not a quiet fall back to plain http', () => {
  const data = mkdtempSync(join(tmpdir(), 'braindog-serve-half-'));
  try {
    const certFile = join(data, 'lan.cert');
    writeFileSync(certFile, CERT);
    /* TYPED WIDE SO THE `delete` IS LEGAL, and the `delete` is the point: the runner's own environment
       may already carry a key path, and inheriting one would make this test pass for the wrong reason. */
    const env: Record<string, string | undefined> = { ...process.env, BRAINDOG_DATA: data, PORT: '0', BRAINDOG_TLS_CERT: certFile };
    delete env.BRAINDOG_TLS_KEY;
    const out = spawnSync(process.execPath, [MAIN, 'serve'], { encoding: 'utf8', timeout: SERVE_DEADLINE_MS, env });
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stderr ?? '', /BRAINDOG_TLS_CERT and BRAINDOG_TLS_KEY go together/);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

/**
 * An OpenSSL error code is not a sentence, and these two are the ones an operator actually reaches.
 *
 * MEASURED BEFORE THE CHECK EXISTED, both with a record already in place so nothing else refused first:
 * a certificate file holding anything that is not PEM ended the process with
 * `error:0480006C:PEM routines::no start line`, and a well formed key belonging to some other certificate
 * with `error:05800074:x509 certificate routines::key values mismatch`. Neither names a file, neither
 * names a variable, and neither says the word TLS. The pattern below is the shape of an OpenSSL code
 * rather than either exact string, because the point is that no code of that shape gets out at all.
 */
const OPENSSL = /error:[0-9a-fA-F]{8}:/;

/** A record in a fresh data directory, so a TLS refusal is the first thing `serve` has left to say. */
function started(prefix: string): string {
  const data = mkdtempSync(join(tmpdir(), prefix));
  const made = spawnSync(process.execPath, [MAIN, 'init', 'the-studio', '--owner', 'ada@example.com'], {
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_DATA: data, PORT: '0' },
  });
  assert.equal(made.status, 0, made.stderr);
  return data;
}

test('a certificate file that is not a certificate names the file, and not an OpenSSL error code', () => {
  const data = started('braindog-serve-junk-');
  try {
    const certFile = join(data, 'lan.cert');
    const keyFile = join(data, 'lan.key');
    writeFileSync(certFile, 'this is a note somebody left in the wrong file\n');
    writeFileSync(keyFile, CERT_KEY);
    /* A REFUSAL EXITS BY ITSELF, so the timeout is only a ceiling, and a loaded run must not reach it first. */
    const out = spawnSync(process.execPath, [MAIN, 'serve'], {
      encoding: 'utf8',
      timeout: SERVE_DEADLINE_MS,
      env: { ...process.env, BRAINDOG_DATA: data, PORT: '0', BRAINDOG_HOST: '127.0.0.1', BRAINDOG_TLS_CERT: certFile, BRAINDOG_TLS_KEY: keyFile },
    });
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stderr ?? '', /BRAINDOG_TLS_CERT/);
    assert.ok(!OPENSSL.test(out.stderr ?? ''), `an OpenSSL error code reached the operator: ${out.stderr ?? ''}`);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('a key that belongs to some other certificate names the key, and not an OpenSSL error code', () => {
  const data = started('braindog-serve-pair-');
  try {
    const certFile = join(data, 'lan.cert');
    const keyFile = join(data, 'lan.key');
    writeFileSync(certFile, CERT);
    /* MADE HERE RATHER THAN PINNED AS A FIXTURE, because the only property this key needs is that it is
       well formed and is not the one in `CERT`: a second hard-coded PEM would say nothing the curve does
       not already say, and would be one more private-looking blob in a test file. */
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    writeFileSync(keyFile, other);
    const out = spawnSync(process.execPath, [MAIN, 'serve'], {
      encoding: 'utf8',
      timeout: SERVE_DEADLINE_MS,
      env: { ...process.env, BRAINDOG_DATA: data, PORT: '0', BRAINDOG_HOST: '127.0.0.1', BRAINDOG_TLS_CERT: certFile, BRAINDOG_TLS_KEY: keyFile },
    });
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stderr ?? '', /BRAINDOG_TLS_KEY/);
    assert.ok(!OPENSSL.test(out.stderr ?? ''), `an OpenSSL error code reached the operator: ${out.stderr ?? ''}`);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

/**
 * The name is recorded for a warning, and a warning is never worth the host.
 *
 * MEASURED before `nameChange` caught its own write: with `served-at` unwritable the process printed
 * `braindog · … · http://localhost:59347` and the line about the ways in, having already listened, and
 * then died with `EISDIR: illegal operation on a directory` and exit 1. A directory standing where the
 * file goes is how that is reproduced on this machine; the shape in the field is a file left behind by
 * a boot that ran as another user, which reads and writes exactly as badly.
 *
 * SO IT IS KEPT UNTIL IT ANSWERS A REQUEST, not until the line: the death came just after the line, and a
 * request answered once the line is out is the proof it lived through what follows it (`answers`).
 */
test('a served-at that cannot be written does not take the host down with it', async () => {
  const data = started('braindog-serve-note-');
  try {
    mkdirSync(join(data, 'served-at'));
    const out = await serveUntil({ ...process.env, BRAINDOG_DATA: data, PORT: '0', BRAINDOG_HOST: '127.0.0.1' }, async (said) => {
      const port = /http:\/\/localhost:(\d+)/.exec(said)?.[1];
      return port !== undefined && /^ {2}(loopback only|behind BRAINDOG_TOKEN)/m.test(said) && (await answers(`http://127.0.0.1:${port}/healthz`));
    });
    assert.notEqual(out.status, 1, out.stderr);
    assert.ok(!(out.stderr ?? '').includes('EISDIR'), out.stderr);
    assert.match(out.stderr ?? '', /braindog · /);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

/**
 * The origins open mode answers for follow the socket, because before this they were `http://` always.
 *
 * A TLS SELF-HOST WOULD HAVE REFUSED ITS OWN PAGE. Open mode's cross-origin check compares the `Origin`
 * header against a list built from the loopback names, and a browser on `https://localhost:8443` sends
 * `https://`. Nothing pinned the scheme, so reverting that one expression left every test green while
 * the host refused every write from the page it had just served.
 */
test('open mode over TLS answers for its https loopback page and not for the http one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-tls-open-'));
  const running = await start({ file: join(dir, 'record.brain'), port: 0, host: '127.0.0.1', tls: { cert: CERT, key: CERT_KEY }, pollMs: 0 });
  try {
    const port = (running.server.address() as { port: number }).port;
    const served = await post(port, `https://localhost:${port}`);
    assert.notEqual(refusedAt(served.body), 'origin', 'the page this host served was refused as cross-origin');
    const other = await post(port, `http://localhost:${port}`);
    assert.equal(other.status, 403);
    assert.equal(refusedAt(other.body), 'origin', 'a page on a scheme this host does not serve was allowed to write');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Where a refusal happened, or `undefined` when the answer is not a refusal at all. */
function refusedAt(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { refusal?: { at?: string } }).refusal?.at;
  } catch {
    return undefined;
  }
}
