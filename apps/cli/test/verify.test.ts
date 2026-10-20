/**
 * `braindog verify <file> [--key <pubkey|url>]`, through a real child process.
 *
 * BEFORE THIS, THE COMMAND DID NOT EXIST: `braindog verify` answered "braindog has no command called verify",
 * exit 1. And it is needed, as measured: a Cloud copy with one row edited, its manifest recomputed and a
 * stranger's signature put on it passes `checkBrainl` and imports. The only thing that tells that file from the real one is the key
 * it was signed by, and the only place a person can say which key that must be is `--key`.
 *
 * EVERY FILE HERE IS MADE HERE. A real export of a kernel record signed by a key generated for this
 * run, the same forgery as that Cloud copy, a SQLite file written by the kernel's own migrations the way the
 * self-host's copies are, and the first line of an age file. No production identity or key is read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { b64url, keyIdOf, openRecord, signBrainl } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { testSigner, type TestSigner } from '../../../packages/kernel/test/signer.ts';
import { verify } from '../src/verify.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 8, 23, 3, 17);

type Ran = { code: number | null; stdout: string; stderr: string };

const ran = (args: string[], cwd: string): Promise<Ran> =>
  new Promise((done) => {
    const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: cwd, APPDATA: cwd };
    delete env.BRAINDOG_TOKEN;
    delete env.BRAINDOG_HOST;
    const child = spawn(process.execPath, [MAIN, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });

/** A folder for this test's files, removed after it. */
const scratch = (t: { after: (f: () => void) => void }): string => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-verify-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** A signed export of a record whose `record` row names "The Studio", as the forged Cloud copy did. */
async function exported(signer: TestSigner): Promise<string[]> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: signer });
  sql.exec(
    'INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, ?, ?, ?, ?, 1, ?)',
    REC,
    'the-studio',
    'The Studio',
    'en',
    'UTC',
    '2026-09-23T03:17:00.000Z',
  );
  const out = (await k.export()) as { ok: boolean; value?: string[] };
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
  return out.value!;
}

/** The forgery: the record's name changed, its manifest row recomputed, and a stranger's signature in place of the old one. */
async function forged(lines: readonly string[]): Promise<string[]> {
  const out = lines.map((l) => (l.startsWith(`[1,"${REC}"`) ? l.replace('"The Studio"', '"The Forgery"') : l));
  const header = out.findIndex((l) => l.startsWith('#table record '));
  const rows = out.slice(header + 1, out.findIndex((l, i) => i > header && l.startsWith('#')));
  const manifest = out.findIndex((l) => l.startsWith('#table dog_manifest '));
  const at = out.findIndex((l, i) => i > manifest && l.startsWith('["record",'));
  out[at] = JSON.stringify(['record', rows.length, createHash('sha256').update(rows.join('\n')).digest('hex')]);
  const sig = out.findIndex((l) => l.startsWith('#table dog_sig '));
  return signBrainl(
    out.filter((_, i) => i !== sig + 1),
    testSigner(),
  );
}

test('VERIFY IS A COMMAND: the real export passes, and its block says the key came from the file', async (t) => {
  const dir = scratch(t);
  const signer = testSigner();
  writeFileSync(join(dir, 'copy.brainl'), `${(await exported(signer)).join('\n')}\n`);

  const out = await ran(['verify', 'copy.brainl'], dir);
  assert.equal(out.code, 0, out.stderr);
  assert.doesNotMatch(out.stderr, /has no command/);
  const id = await keyIdOf(await signer.publicKey);
  assert.match(out.stdout, /✓ dogl/);
  assert.match(out.stdout, /✓ format 1/);
  assert.match(out.stdout, /✓ manifest hashes match/);
  assert.match(out.stdout, new RegExp(`✓ signature valid \\(key ${id} from the file; pass --key to pin\\)`));
  assert.match(out.stdout, new RegExp(`produced 2026-09-05T12:00:00.000Z by ${REC}`));
});

/* A KEY THAT BEGINS WITH `-` IS A KEY, NOT A FLAG. One base64url key in 64 does, and `parseArgs` in strict mode threw on
   `--key -…`, so the owner got the usage line for a real key: CI 35930451270 drew one at random in the forgery test
   below. This one always does, and is the wrong key, so the answer must be the refused signature and never the usage. */
test('A --key THAT BEGINS WITH A DASH IS READ AS THE KEY, and the wrong one refuses the signature rather than the command', async (t) => {
  const dir = scratch(t);
  const signer = testSigner();
  writeFileSync(join(dir, 'copy.brainl'), `${(await exported(signer)).join('\n')}\n`);
  const key = b64url(await signer.publicKey);
  const dashed = `-${key.slice(1, 2) === 'A' ? 'B' : 'A'}${key.slice(2)}`;
  const out = await ran(['verify', 'copy.brainl', '--key', dashed], dir);
  assert.doesNotMatch(`${out.stdout}${out.stderr}`, /takes one file/u, 'a dashed key was read as a flag');
  assert.equal(out.code, 1, out.stdout);
});

test('A FORGERY: IT PASSES UNPINNED, AND --key WITH THE REAL KEY REFUSES IT, exit 1', async (t) => {
  const dir = scratch(t);
  const signer = testSigner();
  const lines = await exported(signer);
  writeFileSync(join(dir, 'copy.brainl'), `${lines.join('\n')}\n`);
  writeFileSync(join(dir, 'forged.brainl'), `${(await forged(lines)).join('\n')}\n`);
  const key = b64url(await signer.publicKey);

  const real = await ran(['verify', 'copy.brainl', '--key', key], dir);
  assert.equal(real.code, 0, real.stderr);
  assert.match(real.stdout, /✓ signature valid, key [0-9a-f]{16} pinned/);

  const unpinned = await ran(['verify', 'forged.brainl'], dir);
  assert.equal(unpinned.code, 0, 'the file vouches for itself, which is all an unpinned check can ask');

  const pinned = await ran(['verify', 'forged.brainl', '--key', key], dir);
  assert.equal(pinned.code, 1, pinned.stdout);
  assert.equal(pinned.stdout, '', 'a refused file printed a block');
  assert.match(pinned.stderr, new RegExp(`the key you named is ${await keyIdOf(await signer.publicKey)}`));
});

test('--json ANSWERS 48 §4.5 Verified, and a refusal is SIGNATURE_INVALID at dog_sig.key_id', async (t) => {
  const dir = scratch(t);
  const signer = testSigner();
  const lines = await exported(signer);
  writeFileSync(join(dir, 'copy.brainl'), `${lines.join('\n')}\n`);
  writeFileSync(join(dir, 'forged.brainl'), `${(await forged(lines)).join('\n')}\n`);
  const key = b64url(await signer.publicKey);

  const good = await ran(['verify', 'copy.brainl', '--key', key, '--json'], dir);
  assert.equal(good.code, 0, good.stderr);
  const doc = JSON.parse(good.stdout) as { ok: true; value: Record<string, unknown> };
  assert.equal(doc.ok, true);
  assert.deepEqual(doc.value, {
    container: 'dogl',
    format: 1,
    /* 27 since migration 42 put `agent_profile` in the governance a file carries. */
    tables: 27,
    rows: (doc.value as { rows: number }).rows,
    manifest: 'ok',
    signature: { valid: true, key_id: await keyIdOf(await signer.publicKey), pinned: true },
    produced: { at: '2026-09-05T12:00:00.000Z', by: REC },
  });

  const bad = await ran(['verify', 'forged.brainl', '--key', key, '--json'], dir);
  assert.equal(bad.code, 1);
  const refused = JSON.parse(bad.stdout) as { ok: false; refusals: { code: string; at?: string }[] };
  assert.equal(refused.refusals[0]?.code, 'SIGNATURE_INVALID');
  assert.equal(refused.refusals[0]?.at, 'dog_sig.key_id');
});

test('--key <url> FETCHES { key_id, public_key } ONCE, and pins to what it answered', async (t) => {
  const dir = scratch(t);
  const signer = testSigner();
  const stranger = testSigner();
  writeFileSync(join(dir, 'copy.brainl'), `${(await exported(signer)).join('\n')}\n`);

  let served = signer;
  let asked = 0;
  const server = createServer((_req, res) => {
    asked += 1;
    void (async () => {
      const raw = await served.publicKey;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ key_id: await keyIdOf(raw), public_key: b64url(raw) }));
    })();
  });
  await new Promise<void>((up) => server.listen(0, '127.0.0.1', up));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/.well-known/braindog-key`;

  const pinned = await ran(['verify', 'copy.brainl', '--key', url], dir);
  assert.equal(pinned.code, 0, pinned.stderr);
  assert.match(pinned.stdout, /pinned/);
  assert.equal(asked, 1);

  served = stranger;
  const other = await ran(['verify', 'copy.brainl', '--key', url], dir);
  assert.equal(other.code, 1, other.stdout);
  assert.match(other.stderr, /the key you named is/);
});

/**
 * A `fetch` that answers as `fetch` does: `redirect: 'follow'` (the default) is followed here and the final answer
 * handed back, `'manual'` hands back the 3xx itself, and `'error'` throws. `hops` maps an address to where it moves.
 */
function redirecting(hops: Record<string, string>, key: string, asked: string[]): typeof fetch {
  const get = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const at = String(input);
    asked.push(at);
    const next = hops[at];
    if (next === undefined)
      return new Response(JSON.stringify({ public_key: key }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (init?.redirect === 'error') throw new TypeError('fetch failed');
    if (init?.redirect === 'manual') return new Response(null, { status: 302, headers: { location: next } });
    return get(next, init);
  };
  return get as typeof fetch;
}

test('A KEY ADDRESS THAT MOVES FROM https TO http IS REFUSED, and the http address is never asked', async (t) => {
  /* WAVE FIFTY-FIVE'S CHECKER: `keyFrom` tested the address typed and then let `fetch` follow wherever it was sent,
     so an https address answering 302 to an http one was read over plain http and pinned. Anybody on the path of
     that second request chooses the key, and the forgery this command exists to refuse is pinned as genuine. */
  const dir = scratch(t);
  const signer = testSigner();
  writeFileSync(join(dir, 'copy.brainl'), `${(await exported(signer)).join('\n')}\n`);
  const asked: string[] = [];
  const said: string[] = [];
  const out: string[] = [];
  const typed = 'https://keys.example.test/.well-known/braindog-key';
  const plain = 'http://keys.example.test/.well-known/braindog-key';

  const code = await verify(['copy.brainl', '--key', typed], {
    cwd: dir,
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
    fetch: redirecting({ [typed]: plain }, b64url(await signer.publicKey), asked),
  });
  assert.equal(code, 1, out.join('\n'));
  assert.deepEqual(out, [], 'a block was printed for a key read over http');
  assert.deepEqual(asked, [typed], 'the http address was asked for the key');
  assert.ok(said.some((l) => l.includes(plain) && l.includes('nothing was checked')), said.join('\n'));
});

test('A KEY ADDRESS THAT MOVES TO ANOTHER https ADDRESS IS STILL READ, and pinned', async (t) => {
  const dir = scratch(t);
  const signer = testSigner();
  writeFileSync(join(dir, 'copy.brainl'), `${(await exported(signer)).join('\n')}\n`);
  const asked: string[] = [];
  const out: string[] = [];
  const typed = 'https://brain.example.test/.well-known/braindog-key';
  const moved = 'https://app.brain.example.test/.well-known/braindog-key';

  const code = await verify(['copy.brainl', '--key', typed], {
    cwd: dir,
    out: (l) => void out.push(l),
    say: () => {},
    fetch: redirecting({ [typed]: moved }, b64url(await signer.publicKey), asked),
  });
  assert.equal(code, 0);
  assert.deepEqual(asked, [typed, moved]);
  assert.ok(out.some((l) => l.includes('pinned')), out.join('\n'));
});

test('A KEY ADDRESS THAT KEEPS MOVING IS GIVEN UP ON, not followed for ever', async (t) => {
  const dir = scratch(t);
  const said: string[] = [];
  const asked: string[] = [];
  const at = (n: number) => `https://keys.example.test/${n}`;
  const hops = Object.fromEntries(Array.from({ length: 50 }, (_, n) => [at(n), at(n + 1)]));
  const code = await verify(['missing.brainl', '--key', at(0)], {
    cwd: dir,
    out: () => {},
    say: (l) => void said.push(l),
    fetch: redirecting(hops, 'unused', asked),
  });
  assert.equal(code, 1);
  assert.ok(asked.length < 10, `followed ${asked.length} moves`);
  assert.ok(said.some((l) => l.includes('nothing was checked')), said.join('\n'));
});

test('A SEALED COPY IS REFUSED NAMING age -d, told by its first bytes and not by a damage sentence', async (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'latest.brainl.age'), 'age-encryption.org/v1\n-> X25519 AAAA\nnot really sealed\n');
  const out = await ran(['verify', 'latest.brainl.age'], dir);
  assert.equal(out.code, 1);
  assert.match(out.stderr, /age -d/);
});

test('A SELF-HOST COPY (application_id 1146046241) WITH NO .sig BESIDE IT IS REFUSED AS UNSIGNED, and any other SQLite file as not a .brain', async (t) => {
  const dir = scratch(t);

  /* THE KERNEL'S OWN MIGRATIONS WRITE THE HEADER, as they do for every self-host record and every
     `VACUUM INTO` copy of one: 1146046241 was read off a real copy. */
  const path = join(dir, '2026-09-23T03-20-00Z-drill.brain');
  const sql = openSqlite(path);
  await openRecord(sql, fixedClock(NOW));
  sql.close();
  const copy = await ran(['verify', '2026-09-23T03-20-00Z-drill.brain'], dir);
  assert.equal(copy.code, 1);
  assert.match(copy.stderr, /self-host copy with no signature beside it/);

  const plain = new DatabaseSync(join(dir, 'plain.brain'));
  plain.exec('CREATE TABLE t (x)');
  plain.close();
  const other = await ran(['verify', 'plain.brain'], dir);
  assert.equal(other.code, 1);
  assert.match(other.stderr, /not a \.brain file/);
  assert.doesNotMatch(other.stderr, /self-host/);
});

test('A --key THAT IS NEITHER A KEY NOR AN ADDRESS IS REFUSED BEFORE THE FILE IS READ', async (t) => {
  const dir = scratch(t);
  const out = await ran(['verify', 'missing.brainl', '--key', 'not-a-key'], dir);
  assert.equal(out.code, 1);
  assert.match(out.stderr, /--key is/);
});

test('THE USAGE LINE NAMES verify', async (t) => {
  const out = await ran(['help'], scratch(t));
  assert.match(out.stdout, /^braindog verify <file> \[--key <pubkey\|url>\]$/m);
});
