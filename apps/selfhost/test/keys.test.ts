/**
 * The KEK, and the three keys a record is created with.
 *
 * WHAT IS ASSERTED HERE IS THAT A WRAPPING CANNOT BE MOVED. Every other property of this file —
 * the file mode, the length check, the fingerprint — is a precaution. The binding is the mechanism:
 * `12 §6` wraps under `utf8(record_id) ‖ 0x1F ‖ utf8(purpose)` so that a `connector` blob lifted into
 * the `signing` row does not open, and a blob copied out of another record does not open at all.
 * Both of those are a single SQL statement away for anybody with the file, and neither is visible
 * from reading the code — an AAD that is computed and not checked looks exactly like one that is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { aad, openKeyStore, recordKeys, unwrap, wrap } from '../src/keys.ts';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'braindog-kek-'));

test('THE KEY FILE IS MADE ONCE and read back the same', async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    const first = await openKeyStore(file);
    const bytes = readFileSync(file);
    assert.equal(bytes.length, 32, '49 §4.4: 32 random bytes');

    /* THE SECOND OPEN DOES NOT REPLACE IT, AND THIS IS THE FAST PATH RATHER THAN THE RACE. It said
       "`wx` is the whole of the race protection" and asserted a property about two processes with
       one process, sequentially: the second `openKeyStore` finds `existsSync` true and never enters
       `mint` at all, so it passed while `mint` was overwriting the winner's key in the case it
       claimed to cover. What it does check is worth keeping and is a smaller thing: an open of a
       key file that is already there reads it rather than minting over it. The property in the
       sentence above needs more than one process, and has its own test at the foot of this file. */
    const second = await openKeyStore(file);
    assert.deepEqual(readFileSync(file), bytes, 'the key file was rewritten');
    assert.equal((await first.current()).kekId, (await second.current()).kekId);

    /* AND THE FINGERPRINT IS OF THE KEY, not of the path or the moment. 34 §5: 18 hex. */
    assert.match((await first.current()).kekId, /^[0-9a-f]{18}$/);

    /* 0600 ON THE FILE ITSELF, which `49 §9`'s gate table requires and nothing asserted. The mode
       is what makes every other property of this file worth having. */
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A KEY FILE FIXTURE, WITH ITS OWN MODE, AND THE MODE IS THE WHOLE POINT OF THE HELPER.
 *
 * `openKeyStore` checks in this order: is it a regular file, are the permission bits 0600, is it 32
 * bytes. It SKIPS the mode check on Windows, because the bit is advisory there and the ACL is the
 * real permission (`49 §4.4`).
 *
 * So a fixture written with no mode arrives 0644 under a default umask, and on Linux the MODE
 * refusal fires before the length refusal the test is about — while on Windows the same test passes,
 * because the check it trips over is not run. Two tests in this file were written that way and both
 * were green here for months; CI found them on Linux, one per run, because the first one it hit
 * stopped the file.
 *
 * A fixture that leaves a permission to the umask asserts a different thing on each host, and the
 * host it is never run on is the one both deployments use. There is one way to write a key file in
 * this file now, and it carries the mode.
 */
const writeKey = (file: string, contents: string | Uint8Array): void =>
  writeFileSync(file, contents, { mode: 0o600 });

test('A FILE THAT IS NOT A KEY IS A SENTENCE, not a silent short key', async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    writeKey(file, 'hunter2');
    await assert.rejects(() => openKeyStore(file), /is 7 bytes and a key is 32/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A WRAPPING IS BOUND TO ITS RECORD AND ITS PURPOSE', async () => {
  const dir = scratch();
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const plain = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const sealed = await wrap(store, 'rec_A', 'connector', plain);

    assert.equal(sealed.wrapped_by, 'kek');
    assert.equal(sealed.nonce.length, 12);
    assert.deepEqual([...(await unwrap(store, 'rec_A', 'connector', sealed))!], [...plain]);

    /* THE THREE WAYS A BLOB CAN BE MOVED, and none of them opens. A row copied between purposes, a
       row copied between records, and a `kek_id` the store does not hold — 49 §6's WRONG_KEY. */
    assert.equal(await unwrap(store, 'rec_A', 'signing', sealed), null, 'a connector key opened as signing');
    assert.equal(await unwrap(store, 'rec_B', 'connector', sealed), null, 'a key opened under another record');
    assert.equal(
      await unwrap(store, 'rec_A', 'connector', { ...sealed, kek_id: 'ffffffffffffffffff' }),
      null,
      'a kek_id the store cannot answer opened anyway',
    );

    /* AND A FLIPPED BYTE IS A REFUSAL RATHER THAN GARBAGE. GCM authenticates; this is what makes
       "the file was tampered with" and "the key is wrong" the same answer to the caller. */
    const bent = new Uint8Array(sealed.wrapped);
    bent[0] = (bent[0]! ^ 0xff) & 0xff;
    assert.equal(await unwrap(store, 'rec_A', 'connector', { ...sealed, wrapped: bent }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE NONCE IS FRESH EVERY TIME, which is the one way to use GCM wrongly', async () => {
  const dir = scratch();
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const plain = new Uint8Array(32);
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) seen.add((await wrap(store, 'rec_A', 'record', plain)).nonce.join(','));
    assert.equal(seen.size, 32, 'a nonce repeated under one key leaks the plaintexts and the auth key');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE AAD IS THE BYTES THE SPEC NAMES', () => {
  const bytes = aad('rec_01', 'signing');
  const want = [...new TextEncoder().encode('rec_01'), 0x1f, ...new TextEncoder().encode('signing')];
  assert.deepEqual([...bytes], want);
  /* 0x1F IS WHY `rec_Ab` + `record` AND `rec_A` + `brecord` ARE DIFFERENT. A separator no identifier
     contains is the difference between a binding and a concatenation two pairs can collide on. */
  assert.notDeepEqual([...aad('rec_Ab', 'record')], [...aad('rec_A', 'record')]);
});

test('A RECORD IS CREATED WITH THREE KEYS, all openable, none the same', async () => {
  const dir = scratch();
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const keys = await recordKeys(store, 'rec_A');

    assert.deepEqual(Object.keys(keys).sort(), ['connector', 'record', 'signing'], '30 §1: three rows');

    for (const purpose of ['record', 'connector', 'signing'] as const) {
      const open = await unwrap(store, 'rec_A', purpose, keys[purpose]);
      assert.ok(open, `${purpose} does not open under the key that wrapped it`);
      assert.ok(open.length >= 32, `${purpose} is ${open.length} bytes`);
    }

    /* THE TWO DEKS ARE RANDOM AND DISTINCT. One key used for both would mean a leaked connector
       secret opened every entry in the record. */
    const a = await unwrap(store, 'rec_A', 'record', keys.record);
    const b = await unwrap(store, 'rec_A', 'connector', keys.connector);
    assert.equal(a!.length, 32);
    assert.notDeepEqual([...a!], [...b!], 'the record and connector DEKs are the same bytes');

    /* AND THE SIGNING KEY IS A REAL PKCS#8 Ed25519 PRIVATE KEY, which is only provable by using it.
       A 32-byte blob in that row is the failure this catches: it is the right length for a DEK, and
       `braindog verify` would be the first thing to find out. */
    const pkcs8 = await unwrap(store, 'rec_A', 'signing', keys.signing);
    const priv = await crypto.subtle.importKey('pkcs8', pkcs8!, { name: 'Ed25519' }, false, ['sign']);
    const msg = new TextEncoder().encode('the signed bytes');
    const sig = await crypto.subtle.sign('Ed25519', priv, msg);
    assert.equal(sig.byteLength, 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TWO RECORDS MADE UNDER ONE KEK DO NOT SHARE A KEY', async () => {
  const dir = scratch();
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const one = await recordKeys(store, 'rec_A');
    const two = await recordKeys(store, 'rec_B');

    const a = await unwrap(store, 'rec_A', 'record', one.record);
    const b = await unwrap(store, 'rec_B', 'record', two.record);
    assert.notDeepEqual([...a!], [...b!], 'two records were given the same DEK');

    /* AND NEITHER OPENS AS THE OTHER, which is the property a shared self-host rests on: one
       operator holds one KEK and every record on it is still sealed from every other. */
    assert.equal(await unwrap(store, 'rec_A', 'record', two.record), null);
    assert.equal(await unwrap(store, 'rec_B', 'record', one.record), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A KEY ANYBODY IN YOUR GROUP CAN READ IS A REFUSAL, and it names the mode', { skip: process.platform === 'win32' }, async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    await openKeyStore(file);
    chmodSync(file, 0o644);
    /* `49 §9`'s gate table has a row for this and nothing exercised it. CI is Linux, so the branch
       runs on every build — delete its body and the suite stayed green, which is the shape of every
       defect this repository keeps finding. */
    await assert.rejects(() => openKeyStore(file), /mode 644/);

    chmodSync(file, 0o604);
    await assert.rejects(() => openKeyStore(file), /mode 604/, 'world-readable passed');

    chmodSync(file, 0o600);
    assert.ok(await openKeyStore(file), '0600 was refused');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AND ON WINDOWS THE SKIPPED CHECK IS SAID OUT LOUD', { skip: process.platform !== 'win32' }, async () => {
  const dir = scratch();
  try {
    const said: string[] = [];
    await openKeyStore(join(dir, 'kek'), (line) => said.push(line));
    /* `49 §4.4`: on Windows the bit is advisory and the ACL is the real permission, so the check is
       skipped AND LOGGED ONCE. It was skipped, and a comment claimed it was said. */
    assert.ok(
      said.some((l) => /not checked on Windows/.test(l)),
      `nothing was said about the skipped check: ${said.join(' / ') || '(silence)'}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A PATH THAT IS NOT A FILE IS A SENTENCE, not a process that never returns', async () => {
  const dir = scratch();
  try {
    /* `readFileSync` on a FIFO blocks for ever: `init` hangs with no output, no timeout and nothing
       to act on, which is the one outcome worse than a refusal. A directory is the reachable case on
       every platform and takes the same branch. */
    mkdirSync(join(dir, 'kek'));
    await assert.rejects(() => openKeyStore(join(dir, 'kek')), /not a regular file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A HALF-WRITTEN KEY FILE IS NEVER LEFT BEHIND', async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    await openKeyStore(file);
    /* `wx` makes the file EXIST before the bytes are in it, so a process killed in that gap left an
       empty file `wx` would never rewrite — and every later boot refused "is 0 bytes" on a host
       where nothing had been created yet. Write-then-rename closes it: what carries the name always
       carries the key, and the temp file it was written to is gone. */
    assert.equal(readFileSync(file).length, 32);
    assert.deepEqual(readdirSync(dir), ['kek'], 'a temp file was left in the data directory');

    /* AND THE OLD FAILURE IS STILL A SENTENCE if somebody has one on disk from before.

       `writeKey`, not `writeFileSync` — see the helper's own note. This one and the seven-byte
       case above are the two that were green on Windows and red on Linux. */
    const empty = join(dir, 'empty');
    writeKey(empty, '');
    await assert.rejects(() => openKeyStore(empty), /is 0 bytes and a key is 32/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── the race, with real processes ───────────────────────────────────────── */

/**
 * HOW MANY PROCESSES, AND WHY IT IS NOT TWO. Two `node` startups on a busy machine can miss each
 * other entirely, and a race test that misses is a test that passes for the wrong reason. Eight on
 * one deadline overlapped in every round measured, and every round found the defect.
 */
const RACERS = 8;

/**
 * A PROCESS THAT OPENS THE KEY STORE AND SAYS WHICH KEY IT GOT.
 *
 * IT SPINS ON THE DEADLINE RATHER THAN SLEEPING TO IT. A `setTimeout` wakes each process on its own
 * timer tick, and eight ticks arrive spread over milliseconds, which is the one thing this test
 * must not do. The busy loop costs a few hundred milliseconds of one core each and buys arrival
 * inside the same microsecond.
 *
 * IT PRINTS THE FINGERPRINT AND NEVER THE KEY. `kekId` is the first 18 hex of SHA-256 over the root
 * bytes, which is what the record already stores in `vault_key.kek_id`; the bytes themselves do not
 * leave the process that made them.
 *
 * AND IT REPORTS WHEN IT WAS READY, so the test can tell a race it ran from a race it missed. Eight
 * processes that arrive one after another all agree about the key no matter what `mint` does, and
 * that agreement would be this test passing while proving nothing.
 */
const OPENER = `
const [mod, file, at] = process.argv.slice(2);
const { openKeyStore } = await import(mod);
const ready = Date.now();
while (Date.now() < Number(at)) {}
try {
  const { kekId } = await (await openKeyStore(file)).current();
  process.stdout.write(JSON.stringify({ ready, kekId }));
} catch (e) {
  process.stdout.write(JSON.stringify({ ready, error: String((e && e.message) || e) }));
}
`;

type Ran = { code: number | null; said: { ready: number; kekId?: string; error?: string } };

const race = (runner: string, mod: string, file: string, at: number): Promise<Ran> =>
  new Promise((done) => {
    const kid = spawn(process.execPath, [runner, mod, file, String(at)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    kid.stdout.on('data', (d) => (out += String(d)));
    kid.stderr.on('data', (d) => (err += String(d)));
    kid.on('close', (code) => {
      let said: Ran['said'];
      try {
        said = JSON.parse(out) as Ran['said'];
      } catch {
        /* A process that died before it could answer answers here instead, so one assertion below
           covers "it refused" and "it crashed" rather than the second reaching a `JSON.parse`. */
        said = { ready: 0, error: err.split('\n').slice(0, 3).join(' ').trim() || `exit ${code} with no answer` };
      }
      done({ code, said });
    });
  });

/**
 * THE TEST THE COMMENT AT THE HEAD OF THIS FILE WAS ALWAYS ABOUT.
 *
 * `12 §6.1` NEEDS "THE DATA IS GONE" AND "THE KEY CHANGED" TO BE DIFFERENT ANSWERS, and the second
 * one is what a first-run race produces if `mint` lets the loser land its key: every row the winner
 * wrapped stops opening, `signerFor` returns `null`, and exports go out unsigned with nothing said.
 * So the property is about concurrency and cannot be asserted with one process. This spawns eight
 * against one empty directory on a shared deadline and asks the only three questions that matter:
 * did they all get in, did they all get the SAME key, and is that key the one on disk.
 *
 * WHAT IT FOUND. Against the write-then-rename `mint` this replaced, twelve rounds out of twelve
 * failed on this machine: one to six processes per round died with `EPERM` out of `renameSync`, and
 * up to three DIFFERENT keys came back from the ones that lived, because a rename that lands after
 * somebody has read theirs replaces what they read. On POSIX the `EPERM` half becomes a silent
 * replacement instead, which is the worse of the two.
 *
 * WHAT IT DOES NOT COVER. It cannot prove the absence of a window, only that eight processes
 * hitting one did not find it; and the interleaving is the operating system's to choose, so a
 * machine that serialises the eight would pass without racing. That is what the readiness check
 * below is for: it fails loudly rather than passing quietly when the race did not happen.
 */
test('EIGHT PROCESSES MINTING AT ONCE ALL END UP WITH THE SAME KEY', async () => {
  const dir = scratch();
  try {
    /* THE KEY GOES IN ITS OWN DIRECTORY so the litter check below is about `mint` and not about the
       runner this test had to write somewhere. */
    const data = join(dir, 'data');
    mkdirSync(data);
    const file = join(data, 'kek');
    const runner = join(dir, 'open.mjs');
    writeFileSync(runner, OPENER);
    const mod = new URL('../src/keys.ts', import.meta.url).href;

    const at = Date.now() + 5000;
    /* 5000, NOT 1500: eight Node processes each loading TypeScript can take longer than 1500 ms to start on a machine
       running the whole workspace, and this test failed under that load while passing alone. */
    const ran = await Promise.all(Array.from({ length: RACERS }, () => race(runner, mod, file, at)));

    /* THE RACE HAPPENED. Every process reached the spin loop before the deadline, so all eight were
       inside `openKeyStore` together. If this is what fails, the machine is slower than the 5000 ms
       allowed and the test proved nothing yet; raise the deadline rather than deleting the check. */
    const late = ran.filter((r) => r.said.ready === 0 || r.said.ready > at);
    assert.equal(late.length, 0, `${late.length} of ${RACERS} processes started after the deadline, so nothing raced`);

    const broke = ran.filter((r) => r.said.error !== undefined || r.code !== 0);
    assert.equal(
      broke.length,
      0,
      `${broke.length} of ${RACERS} died inside openKeyStore: ${broke.map((r) => r.said.error ?? `exit ${r.code}`).join(' | ')}`,
    );

    /* AND THEY AGREE. One key, held by all eight, or every row one of them wrapped is a row nothing
       can open and the operator is told the data is gone. */
    const agreed = new Set(ran.map((r) => r.said.kekId));
    assert.equal(agreed.size, 1, `${RACERS} processes minted ${agreed.size} different keys: ${[...agreed].join(', ')}`);

    /* THE KEY THEY AGREED ON IS THE ONE ON DISK. Eight processes could agree on a key that a ninth
       does not find, which is the same outage arriving on the next boot instead of this one. */
    const onDisk = (await (await openKeyStore(file)).current()).kekId;
    assert.equal(onDisk, ran[0]?.said.kekId, 'they agreed on a key that is not the one in the file');

    /* AND NOBODY LEFT A SECOND COPY OF THE ROOT KEY BEHIND. `link` publishes the temp file under the
       real name rather than moving it, so the winner has one to remove too. */
    assert.deepEqual(readdirSync(data), ['kek'], 'a temp file was left in the data directory');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
