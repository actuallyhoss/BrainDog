/**
 * `apps/cli/scripts/restore-drill.mjs`: a sealed nightly copy opened with an identity file, verified, restored into a
 * throwaway record and counted against its own manifest.
 *
 * THE COPY IS THE ONE THE CLOUD WRITES, NOT A FIXTURE STRING. A record is built over `node:sqlite` and signed, dumped by
 * the Worker's own `dumpOf`, and put by the Worker's own `r2Snapshots(...).take` into a bucket that is a Map, sealed to
 * a recipient made for this test. The bytes the drill opens are the bytes R2 would hold under `latest.brainl.age`, so a
 * sealer and a reader that disagree about the age format show up here as a copy that will not open.
 *
 * THE IDENTITY IS WRITTEN THE WAY `age-keygen` WRITES ONE: two comment lines and an `AGE-SECRET-KEY-1` line. Nothing in
 * this file is a real identity; each test makes its own pair and throws it away.
 *
 * THE SCRIPT RUNS AS A CHILD PROCESS, with the OS temp directory pointed at this test's scratch folder, because the
 * promise that matters most is about what it leaves behind: no plaintext and no restored record once it has exited.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openRecord } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { testSigner } from '../../../packages/kernel/test/signer.ts';
import { dumpOf, r2Snapshots, type Blobs } from '../../worker/src/snapshots.ts';
import { directoryCopies } from '../../worker/src/directory-copy.ts';
import { bech32, identity } from '../../worker/test/age-open.ts';
import { createDirectory } from '../../../packages/record/src/directory.ts';

const DRILL = fileURLToPath(new URL('../scripts/restore-drill.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAO';
const NOW = Date.UTC(2026, 8, 23, 3, 17);
const AT = new Date(NOW).toISOString();

const register = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
});

type Ran = { code: number | null; stdout: string; stderr: string };

/**
 * The drill as he runs it, with the temp directory it may write to pointed at `temp`.
 *
 * WITHOUT THE ROUND TRIP UNLESS A TEST ASKS FOR IT. The trip is a minute of real commands per copy and has its own
 * tests (`drill-trip.test.ts`); here one test runs it whole, and the rest test what the drill does around it.
 */
const drill = (args: string[], temp: string, o: { env?: NodeJS.ProcessEnv; trip?: true } = {}): Promise<Ran> =>
  new Promise((done) => {
    const env: NodeJS.ProcessEnv = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, ...o.env };
    delete env.PROVISION_KEY;
    if (o.env?.PROVISION_KEY !== undefined) env.PROVISION_KEY = o.env.PROVISION_KEY;
    const child = spawn(process.execPath, [DRILL, ...args, ...(o.trip ? [] : ['--no-round-trip'])], { env, cwd: temp, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });

/** A bucket holding what `put` was handed, as bytes, which is what R2 keeps. */
function bucket(): Blobs & { held: Map<string, Uint8Array>; meta: Map<string, Record<string, string>> } {
  const held = new Map<string, Uint8Array>();
  const meta = new Map<string, Record<string, string>>();
  return {
    held,
    meta,
    put(key, value, options) {
      held.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value));
      meta.set(key, options?.customMetadata ?? {});
      return Promise.resolve(null);
    },
    get(key) {
      const bytes = held.get(key);
      return Promise.resolve(bytes ? { size: bytes.length, text: () => Promise.resolve(new TextDecoder().decode(bytes)) } : null);
    },
    list(o) {
      const objects = [...held].filter(([k]) => k.startsWith(o?.prefix ?? '')).map(([key, b]) => ({ key, size: b.length }));
      return Promise.resolve({ objects, truncated: false });
    },
    delete(keys) {
      for (const k of [keys].flat()) held.delete(k);
      return Promise.resolve();
    },
  };
}

/**
 * A night's sealed copy of a record with two lists, the identity file that opens it, and the folders the drill runs in.
 *
 * `temp` IS THE ONLY FOLDER THE DRILL MAY WRITE TO, and each test asserts it is empty after, which is the proof that
 * the plaintext and the restored record are gone.
 */
type Member = { id: string; email: string; level: 'owner' | 'write'; suspended?: true };
const ADA: Member = { id: OWNER, email: 'ada@example.com', level: 'owner' };

async function night(t: { after: (f: () => void) => void }, shape: { drift?: boolean; people?: Member[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-drill-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const temp = join(dir, 'temp');
  mkdirSync(temp);

  const signer = testSigner();
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: signer });
  sql.exec(
    'INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, ?, ?, ?, ?, 1, ?)',
    REC,
    'the-studio',
    'The Studio',
    'en',
    'UTC',
    AT,
  );
  /* THE RECORD HAS PEOPLE, because a copy with nobody on it is a record `init --from` refuses, and the drill now
     restores the way a host does. */
  for (const p of shape.people ?? [ADA]) {
    sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, ?)', p.id, p.email, p.email.split('@')[0]!, p.suspended ? AT : null);
    sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', ?)", p.id, p.level);
  }
  assert.ok((await k.install([register('things', 'Things'), register('tools', 'Tools')])).ok);
  for (const name of ['Kiln', 'Wheel']) assert.ok(k.create('things', { name }, { actor: OWNER }).ok);
  for (const name of ['Rib', 'Wire', 'Sponge']) assert.ok(k.create('tools', { name }, { actor: OWNER }).ok);
  /* A SEARCH INDEX OUT OF STEP WITH ITS ROWS, for the one test that needs a copy which verifies and does not restore whole. */
  if (shape.drift) sql.exec('DELETE FROM entry_fts WHERE rowid = (SELECT min(rowid) FROM entry_fts)');

  const id = identity();
  const blobs = bucket();
  await r2Snapshots(blobs, { recipient: id.recipient }).take(REC, await dumpOf({ kernel: k }, AT, 'bookmark-drill'));
  sql.close();
  const sealed = blobs.held.get(`${REC}/snapshots/latest.brainl.age`) ?? assert.fail('the night put no latest copy');
  const rows = Number(blobs.meta.get(`${REC}/snapshots/latest.brainl.age`)?.rows);

  const copy = join(dir, 'latest.brainl.age');
  writeFileSync(copy, sealed);
  const scalar = Buffer.from(id.priv.export({ format: 'jwk' }).d ?? '', 'base64url');
  const secret = bech32('age-secret-key-', scalar).toUpperCase();
  const key = join(dir, 'backup.key');
  writeFileSync(key, `# created: ${AT}\n# public key: ${id.recipient}\n${secret}\n`);
  return { dir, temp, copy, key, secret, recipient: id.recipient, sealed, rows, publicKey: Buffer.from(await signer.publicKey).toString('base64url') };
}

const leftIn = (temp: string): string[] => readdirSync(temp);

test('A SEALED NIGHT OPENS, VERIFIES AND RESTORES: every table matches the manifest, each list is counted, and nothing is left in temp', async (t) => {
  const n = await night(t);
  const out = await drill([n.copy, '--identity', n.key], n.temp);
  assert.equal(out.code, 0, `${out.stdout}\n${out.stderr}`);

  assert.match(out.stdout, new RegExp(`recipient is ${n.recipient}`));
  assert.doesNotMatch(out.stdout, /migration:/, 'the ledger of one build is the same ledger, whatever instants its rows carry');
  assert.match(out.stdout, /✓ manifest hashes match/, 'braindog verify ran and printed its block');
  assert.match(out.stdout, /things\s+2\s+2\s+✓/);
  assert.match(out.stdout, /tools\s+3\s+3\s+✓/);
  assert.match(out.stdout, /entry\s+5\s+5\s+✓/);
  assert.match(out.stdout, new RegExp(`PASS ${REC}`));
  /* THE LINE'S ROWS ARE THE NIGHT'S METADATA `rows`, the number Settings shows beside the copy, so the log and the app agree. */
  assert.ok(n.rows > 0);
  assert.match(out.stdout, new RegExp(`drill ${REC} · ${n.rows} rows · ${n.sealed.length} bytes · restore \\d\\d:\\d\\d`));

  assert.doesNotMatch(out.stdout + out.stderr, new RegExp(n.secret), 'the identity is never printed');
  assert.deepEqual(leftIn(n.temp), [], 'the plaintext and the throwaway record are removed');
  assert.deepEqual(new Uint8Array(readFileSync(n.copy)), n.sealed, 'the copy he fetched is not touched');
});

test('--key PINS THE SIGNATURE THROUGH braindog verify: the record’s own key passes, a stranger’s refuses and nothing is restored', async (t) => {
  const n = await night(t);
  const pinned = await drill([n.copy, '--identity', n.key, '--key', n.publicKey], n.temp);
  assert.equal(pinned.code, 0, `${pinned.stdout}\n${pinned.stderr}`);
  assert.match(pinned.stdout, /pinned/);

  const stranger = Buffer.from(await testSigner().publicKey).toString('base64url');
  const refused = await drill([n.copy, '--identity', n.key, '--key', stranger], n.temp);
  assert.equal(refused.code, 1);
  assert.match(refused.stdout, /FAIL/);
  assert.doesNotMatch(refused.stdout, /restored into/);
  assert.deepEqual(leftIn(n.temp), []);
});

test('ANOTHER IDENTITY IS REFUSED IN ONE SENTENCE NAMING THE RECIPIENT, and nothing is written', async (t) => {
  const n = await night(t);
  const other = identity();
  const scalar = Buffer.from(other.priv.export({ format: 'jwk' }).d ?? '', 'base64url');
  const wrong = join(n.dir, 'other.key');
  writeFileSync(wrong, `${bech32('age-secret-key-', scalar).toUpperCase()}\n`);

  const out = await drill([n.copy, '--identity', wrong], n.temp);
  assert.equal(out.code, 1);
  assert.match(out.stderr, /not sealed to/);
  assert.match(out.stderr, new RegExp(other.recipient));
  assert.deepEqual(leftIn(n.temp), []);
});

test('A COPY DAMAGED IN TRANSIT DOES NOT OPEN, rather than restoring bytes nobody sealed', async (t) => {
  const n = await night(t);
  const bent = new Uint8Array(n.sealed);
  bent[bent.length - 40] = (bent[bent.length - 40] ?? 0) ^ 1;
  writeFileSync(n.copy, bent);

  const out = await drill([n.copy, '--identity', n.key], n.temp);
  assert.equal(out.code, 1);
  assert.match(out.stderr, /damaged/);
  assert.deepEqual(leftIn(n.temp), []);
});

/* THE COMPARISON IS THE DRILL'S WHOLE VERDICT, and until this test nothing made it say FAIL: with `same` forced true and
   the list count ignored, the five tests above all stayed green (measured). The copy here is signed and
   verifies, and does not come back as it was: one `entry_fts` row was dropped from the source before the night, and the
   restore writes the index again from `entry`, so the copy's manifest says 4 and the restored record exports 5. A
   first try with a `person` row and no `record` row did not diverge, because the importer looks for the `record`
   table's header and an empty table still carries one. */
test('A COPY THAT VERIFIES BUT DOES NOT COME BACK WHOLE IS A FAIL, naming the table, and nothing is left in temp', async (t) => {
  const n = await night(t, { drift: true });
  const out = await drill([n.copy, '--identity', n.key], n.temp);
  assert.equal(out.code, 1, `${out.stdout}\n${out.stderr}`);
  assert.match(out.stdout, /manifest hashes match/, 'braindog verify passed it, so the FAIL is the comparison and not the check');
  assert.match(out.stdout, /entry_fts\s+4\s+5\s+✗/);
  assert.match(out.stdout, /^FAIL .* 1 of the copy's tables, lists, people and round trip steps did not come back/m);
  assert.doesNotMatch(out.stdout, /^PASS/m);
  assert.deepEqual(leftIn(n.temp), []);
});

/* THE DRILL USED TO RESTORE WITH `openRecord(...).import(lines)`, which is neither the Cloud's restore nor `init --from`,
   and it never asked whether anybody could open what it restored. Run on a copy holding a
   suspended first owner and two more people, it printed PASS while `init --from` turned the same file into a record none
   of the three could open. These two copies are that shape: the first must restore for everyone it names, person by
   person, and the second, whose only owner is suspended, is a record nobody could open and must be a FAIL. */
test('EVERY MEMBER OF THE COPY CAN OPEN WHAT init --from RESTORES, and the drill says so person by person', async (t) => {
  const people: Member[] = [
    { id: 'p_01JZ8QK3F7R2M9V4XN6TCB5HA0', email: 'ada@example.com', level: 'owner', suspended: true },
    { id: 'p_01JZ8QK3F7R2M9V4XN6TCB5HA1', email: 'bea@example.com', level: 'owner' },
    { id: 'p_01JZ8QK3F7R2M9V4XN6TCB5HA2', email: 'cal@example.com', level: 'write' },
  ];
  const n = await night(t, { people });
  const out = await drill([n.copy, '--identity', n.key], n.temp);
  assert.equal(out.code, 0, `${out.stdout}\n${out.stderr}`);
  assert.match(out.stdout, /braindog init drill --from/, 'the restore is not the one a host runs');
  assert.match(out.stdout, /bea@example\.com\s+owner\s+owner\s+✓/);
  assert.match(out.stdout, /cal@example\.com\s+write\s+write\s+✓/);
  assert.match(out.stdout, /ada@example\.com\s+owner\s+suspended/);
  assert.match(out.stdout, new RegExp(`PASS ${REC}`));
  assert.deepEqual(leftIn(n.temp), []);
});

test('A COPY WHOSE ONLY OWNER IS SUSPENDED RESTORES INTO A RECORD NOBODY CAN OPEN, AND THAT IS A FAIL', async (t) => {
  const n = await night(t, { people: [{ ...ADA, suspended: true }] });
  const out = await drill([n.copy, '--identity', n.key], n.temp);
  assert.equal(out.code, 1, `${out.stdout}\n${out.stderr}`);
  assert.match(out.stdout, /manifest hashes match/, 'braindog verify passed it, so the FAIL is the restore and not the check');
  assert.match(out.stdout, /^FAIL /m);
  assert.doesNotMatch(out.stdout, /^PASS/m);
  assert.deepEqual(leftIn(n.temp), []);
});

test('AN IDENTITY INSIDE THE REPOSITORY IS REFUSED BEFORE IT IS READ, and a sealed copy with no identity is refused', async (t) => {
  const n = await night(t);
  const inRepo = await drill([n.copy, '--identity', join(REPO, 'backup.key')], n.temp);
  assert.equal(inRepo.code, 1);
  assert.match(inRepo.stderr, /inside the repository/);
  const dotted = await drill([n.copy, '--identity', join(REPO, '..backup.key')], n.temp);
  assert.match(dotted.stderr, /inside the repository/, 'a name that starts with two dots is still inside');

  const none = await drill([n.copy], n.temp);
  assert.equal(none.code, 1);
  assert.match(none.stderr, /--identity/);
  assert.deepEqual(leftIn(n.temp), []);
});

// ─── fetched as the operator (LCH-C04 job 1) ──────────────────────────────────────────────────────────────────────

/**
 * A wrangler that reads from a folder: `r2 object get <bucket>/<key> --remote --file <dest>` copies `<r2>/<bucket>/<key>`
 * to `dest`, or exits 1 as wrangler does for a key the bucket does not hold. Every call is a line in `log`.
 */
function fakeWrangler(dir: string) {
  const r2 = join(dir, 'r2');
  const log = join(dir, 'wrangler.log');
  const bin = join(dir, 'wrangler.mjs');
  writeFileSync(
    bin,
    `import { appendFileSync, copyFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd(), key: 'PROVISION_KEY' in process.env }) + '\\n');
const src = ${JSON.stringify(r2)} + '/' + args[3];
if (args.slice(0, 3).join(' ') !== 'r2 object get' || !existsSync(src)) { console.error('The specified key does not exist.'); process.exit(1); }
copyFileSync(src, args[args.indexOf('--file') + 1]);
`,
  );
  const hold = (key: string, bytes: Uint8Array) => {
    const at = join(r2, 'braindog-blobs', key);
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, bytes);
  };
  const calls = (): { args: string[]; cwd: string; key: boolean }[] => {
    try {
      return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  };
  return { env: { BRAINDOG_WRANGLER: bin }, hold, calls };
}

test('--record FETCHES THE NIGHT WITH wrangler AS THE OPERATOR, opens it with --identity-cmd, and leaves nothing in temp', async (t) => {
  const n = await night(t);
  const w = fakeWrangler(n.dir);
  w.hold(`${REC}/snapshots/latest.brainl.age`, n.sealed);
  /* THE OPERATOR KEY STAYS WITH THE DRILL: the identity command refuses to print the identity when it can see the key. */
  const guarded = `test -z "$PROVISION_KEY" && cat '${n.key}'`;
  const out = await drill(['--record', REC, '--identity-cmd', guarded], n.temp, { env: { ...w.env, PROVISION_KEY: 'operator-key-for-test' } });
  assert.equal(out.code, 0, `${out.stdout}\n${out.stderr}`);
  const [call] = w.calls();
  assert.equal(call?.key, false, 'wrangler never sees the operator key');
  assert.deepEqual(call?.args.slice(0, 5), ['r2', 'object', 'get', `braindog-blobs/${REC}/snapshots/latest.brainl.age`, '--remote']);
  assert.match(call?.cwd ?? '', /apps[/\\]worker$/, 'wrangler runs where the Worker project names its account');
  assert.match(out.stdout, new RegExp(`recipient is ${n.recipient}`));
  assert.match(out.stdout, new RegExp(`PASS ${REC}`));
  assert.doesNotMatch(out.stdout + out.stderr, new RegExp(n.secret), 'what the command printed is never shown');
  assert.deepEqual(leftIn(n.temp), [], 'the fetched copy goes with the plaintext');
});

test('A NIGHT THE BUCKET DOES NOT HOLD IS A FAIL FOR THAT RECORD, and the other record still runs', async (t) => {
  const n = await night(t);
  const w = fakeWrangler(n.dir);
  w.hold(`${REC}/snapshots/latest.brainl.age`, n.sealed);
  const missing = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
  const out = await drill(['--record', missing, '--record', REC, '--identity', n.key, '--bucket', 'braindog-blobs'], n.temp, { env: w.env });
  assert.equal(out.code, 1, `${out.stdout}\n${out.stderr}`);
  assert.match(out.stderr, /wrangler did not fetch/);
  assert.match(out.stdout, new RegExp(`FAIL ${missing} · its night's copy was not fetched`));
  assert.match(out.stdout, new RegExp(`PASS ${REC}`));
  assert.match(out.stdout, /^FAIL · 1 of 2 copies did not come back/m);
  assert.deepEqual(leftIn(n.temp), []);
});

test('--identity-cmd THAT FAILS IS ONE SENTENCE WITH ITS EXIT CODE, and nothing it printed is said', async (t) => {
  const n = await night(t);
  const out = await drill([n.copy, '--identity-cmd', 'echo the-item-asked-for >&2; exit 3'], n.temp);
  assert.equal(out.code, 1);
  assert.match(out.stderr, /The identity command exited 3/);
  assert.doesNotMatch(out.stdout + out.stderr, /the-item-asked-for/);
  const both = await drill([n.copy, '--identity', n.key, '--identity-cmd', `cat '${n.key}'`], n.temp);
  assert.match(both.stderr, /not both/);
  assert.deepEqual(leftIn(n.temp), []);
});

/**
 * The Directory's night as the Worker puts it: a Directory over `node:sqlite` with two records provisioned, dumped by its
 * own `dump`, and sealed and put by the Worker's own `directoryCopies(...).take`, to the recipient `n` was sealed to.
 */
async function directoryNight(n: { recipient: string }, shape: { suspend?: string } = {}) {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(NOW));
  for (const [slug, email] of [
    ['the-studio', 'ada@example.com'],
    ['the-shop', 'bea@example.com'],
  ] as const)
  {
    assert.ok(d.person$(email).ok);
    const made = d.provision({ slug, email });
    assert.ok(made.ok, JSON.stringify(made));
  }
  if (shape.suspend) sql.exec('UPDATE dir_person SET suspended_at = ? WHERE email = ?', AT, shape.suspend);
  const blobs = bucket();
  await directoryCopies(blobs, { recipient: n.recipient }).take(d.dump(), AT);
  return blobs.held.get('directory/snapshots/latest.dirl.age') ?? assert.fail('the night put no Directory copy');
}

test('--directory LOADS THE NIGHT INTO AN EMPTY DIRECTORY and finds every open record with an owner who can sign in', async (t) => {
  const n = await night(t);
  const w = fakeWrangler(n.dir);
  w.hold('directory/snapshots/latest.dirl.age', await directoryNight(n));
  const out = await drill(['--directory', '--identity', n.key], n.temp, { env: w.env });
  assert.equal(out.code, 0, `${out.stdout}\n${out.stderr}`);
  assert.equal(w.calls()[0]?.args[3], 'braindog-blobs/directory/snapshots/latest.dirl.age');
  assert.match(out.stdout, /loaded\s+\d+ tables and \d+ rows into an empty Directory/);
  assert.match(out.stdout, /^PASS the Directory · 2 open records, each with an owner who can sign in · 2 people · 0 passkeys/m);
  assert.deepEqual(leftIn(n.temp), [], 'the Directory was never a file, and its sealed copy is gone');
});

test('A DIRECTORY WHOSE RECORD HAS ONLY A SUSPENDED OWNER IS A FAIL NAMING THE RECORD BY ITS NAME', async (t) => {
  const n = await night(t);
  const w = fakeWrangler(n.dir);
  w.hold('directory/snapshots/latest.dirl.age', await directoryNight(n, { suspend: 'bea@example.com' }));
  const out = await drill(['--directory', '--identity', n.key], n.temp, { env: w.env });
  assert.equal(out.code, 1, `${out.stdout}\n${out.stderr}`);
  assert.match(out.stdout, /the-shop\s+✗ its owner is suspended/);
  assert.doesNotMatch(out.stdout, /the-studio\s+✗/);
  assert.match(out.stdout, /^FAIL the Directory · 1 of 2 open records have no owner who can sign in/m);
  assert.doesNotMatch(out.stdout, /rec_/, 'a record is named by its name, never its id');
  assert.deepEqual(leftIn(n.temp), []);
});

/** A door on this machine that answers `status` and keeps what it was sent. */
async function door(t: { after: (f: () => void) => void }, status: number) {
  const got: { auth: string | undefined; path: string | undefined; body: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    let text = '';
    req.on('data', (c) => (text += String(c)));
    req.on('end', () => {
      got.push({ auth: req.headers.authorization, path: req.url, body: JSON.parse(text || '{}') });
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: status === 200 }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  const address = server.address();
  return { origin: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`, got };
}

test('--report POSTS THE COUNTS TO /account/ops/drill WITH THE OPERATOR KEY, and says "not sent" with no key or no door', async (t) => {
  const n = await night(t);
  const open = await door(t, 200);
  const sent = await drill([n.copy, '--identity', n.key, '--report', open.origin], n.temp, { env: { PROVISION_KEY: 'operator-key-for-test' } });
  assert.equal(sent.code, 0, `${sent.stdout}\n${sent.stderr}`);
  assert.match(sent.stdout, /^report sent to 127\.0\.0\.1:\d+$/m);
  assert.doesNotMatch(sent.stdout + sent.stderr, /operator-key-for-test/, 'the key is sent, never printed');
  const [one] = open.got;
  assert.equal(one?.path, '/account/ops/drill');
  assert.equal(one?.auth, 'Bearer operator-key-for-test');
  assert.deepEqual(Object.keys(one?.body ?? {}).sort(), ['at', 'copies', 'lists', 'pass', 'people', 'records', 'rows']);
  assert.equal(one?.body['pass'], true);
  assert.equal(one?.body['rows'], n.rows);
  assert.equal(one?.body['lists'], 2);
  assert.equal(one?.body['people'], 1);
  assert.doesNotMatch(JSON.stringify(one?.body), /rec_|@/, 'counts only: no id and no address leaves the machine');

  const none = await drill([n.copy, '--identity', n.key, '--report', open.origin], n.temp);
  assert.match(none.stdout, /^report not sent: no key$/m);
  assert.equal(open.got.length, 1, 'no key, no request');

  const missing = await door(t, 404);
  const shut = await drill([n.copy, '--identity', n.key, '--report', missing.origin], n.temp, { env: { PROVISION_KEY: 'operator-key-for-test' } });
  assert.match(shut.stdout, /^report not sent: no door$/m);

  const plain = await drill([n.copy, '--identity', n.key, '--report', 'http://example.com'], n.temp, { env: { PROVISION_KEY: 'operator-key-for-test' } });
  assert.equal(plain.code, 1);
  assert.match(plain.stderr, /not one the key may go to/, 'the key never goes over plain http off this machine');
  assert.deepEqual(leftIn(n.temp), []);
});

test('--print-timer PRINTS A MONTHLY launchd FILE FOR THE SAME ARGUMENTS and installs nothing', async (t) => {
  const n = await night(t);
  const out = await drill(['--print-timer', '--record', REC, '--directory', '--identity-cmd', 'security find-generic-password -s age -w', '--report', 'https://app.brain.dog'], n.temp);
  assert.equal(out.code, 0, out.stderr);
  assert.match(out.stdout, /^<\?xml/);
  assert.match(out.stdout, /<key>StartCalendarInterval<\/key>\s*<dict><key>Day<\/key><integer>1<\/integer>/);
  assert.match(out.stdout, /restore-drill\.mjs<\/string>/);
  for (const arg of ['--record', REC, '--directory', '--identity-cmd', 'security find-generic-password -s age -w', '--report', 'https://app.brain.dog'])
    assert.ok(out.stdout.includes(`<string>${arg}</string>`), `the timer runs with ${arg}`);
  assert.doesNotMatch(out.stdout, /--print-timer/, 'the timer runs the drill, not the printer');
  assert.doesNotMatch(out.stdout, /PROVISION_KEY/, 'no secret is written into the file');
  assert.deepEqual(leftIn(n.temp), []);

  const file = await drill(['--print-timer', n.copy, '--identity', n.key], n.temp);
  assert.equal(file.code, 1);
  assert.match(file.stderr, /takes --record and --directory, and no file/);
});

/* THE ONE RUN WITH THE ROUND TRIP. The verdict is the trip's as well as the count's: PASS only when every step is
   green, FAIL naming how many are red. MEASURED HERE: a copy the Cloud writes restores with no signing key this host
   can open ("the copy carries no keys"), so `braindog export` on the restored record exits 1 with "This file carries
   no signature" and the trip stops at its first step. So the drill is a FAIL on a healthy night today, said as one red
   step, and the whole PASS waits below on a `drill-trip.mjs` change and the kernel's `import` event. */
test('THE ROUND TRIP RUNS ON THE RESTORED RECORD, each step a line, and a red step makes the drill a FAIL', async (t) => {
  const n = await night(t);
  const out = await drill([n.copy, '--identity', n.key], n.temp, { trip: true });
  assert.match(out.stdout, /^ {2}round trip$/m, out.stdout);
  const trip = out.stdout.slice(out.stdout.indexOf('\n  round trip\n'));
  const steps = [...trip.matchAll(/^ {4}([✓✗]) ([^:]+):/gmu)].map((m) => ({ ok: m[1] === '✓', name: m[2] }));
  assert.ok(steps.length >= 1 && steps.length <= 12, out.stdout);
  assert.equal(steps[0]?.name, 'the same bytes twice', out.stdout);
  const red = steps.filter((s) => !s.ok).length;
  assert.equal(out.code, red === 0 ? 0 : 1, out.stdout);
  if (red === 0) assert.match(out.stdout, new RegExp(`round trip ${steps.length} steps$`, 'm'));
  else assert.match(out.stdout, new RegExp(`round trip ${red} of ${steps.length} steps red$`, 'm'));
  assert.match(out.stdout, red === 0 ? new RegExp(`^PASS ${REC}`, 'm') : new RegExp(`^FAIL ${REC}`, 'm'));
  assert.deepEqual(leftIn(n.temp), [], 'the trip and the drill leave nothing behind');
});

test('A HEALTHY COPY PASSES THE WHOLE DRILL, round trip and all', async (t) => {
  const n = await night(t);
  const out = await drill([n.copy, '--identity', n.key], n.temp, { trip: true });
  assert.equal(out.code, 0, out.stdout);
  assert.match(out.stdout, new RegExp(`^PASS ${REC}`, 'm'));
});
