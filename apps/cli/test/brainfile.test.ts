/**
 * `braindog export` and `braindog import <file.brainl>` against an in-memory door: the device flow for one operation,
 * the one request its bearer is spent on, the wrapping key a backup names, and the check on both sides of the wire.
 *
 * AT `07ba6dbd` NEITHER COMMAND EXISTED. `braindog export` answered "braindog has no command called export" and
 * `braindog import latest.brainl` answered with the adapter importer's usage, exit 1 (measured, and pinned below
 * through a real process). The door here is a function standing in for `fetch`, so every request the command makes is
 * counted, and "nothing was sent" is a number and not a hope.
 *
 * THE DOOR SPENDS A GRANT AS THE RECORD DOES, on first use (`operationGrant` in `packages/kernel/src/device.ts`), so a
 * command that sent the bearer twice would be refused here as it would be there.
 *
 * THE FILE IS A REAL EXPORT, of a kernel record signed by a key made for this run, as `verify.test.ts` makes one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openRecord } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { testSigner } from '../../../packages/kernel/test/signer.ts';
import { exportFile, importFile, type BrainfileIo } from '../src/brainfile.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OTHER = 'rec_01JZ9ZZZZZZZZZZZZZZZZZZZZZ';
const KEK = 'a1b2c3d4e5f6a7b8c9';
const NOW = Date.UTC(2026, 8, 23, 3, 17);
/** Obviously fake, and long enough that any fragment of it in what the command printed is findable. */
const GRANT = `${REC}.stub-operation-bearer-never-printed-7f3e`;
const POLL_ID = 'stub-poll-id-never-printed-5b1c';
const SERVER_KEY = 'stub-server-key-never-printed-0d9a';
const LOCAL = 'http://127.0.0.1:5870';
const CLOUD = 'https://app.example.test/the-studio';

/** A signed export of a record called "The Studio", with one more row than the empty record has. */
async function exported(id = REC): Promise<string[]> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: testSigner() });
  sql.exec(
    'INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, ?, ?, ?, ?, 1, ?)',
    id,
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

type Seen = { path: string; auth: string | null; body: Record<string, unknown> };

/**
 * The record's doors for a file, in memory: the device routes, and `export` and `import` behind the record's ADMIN
 * gate as the hosts answer it: the server key is the owner, a request with nothing is 401, and an operation bearer is
 * taken once, for the method it was approved for.
 */
function door(lines: string[], opts: { report?: { tables: number; rows: number } } = {}) {
  const seen: Seen[] = [];
  let reach = '';
  let spent = false;
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const handle = (method: string, args: Record<string, unknown>) => {
    if (method === 'export') {
      if (args.redactGrants === false && args.kek_id !== KEK)
        return answer(422, { ok: false, refusal: { code: 'WRONG_KEY', fix: `The sealed bytes are wrapped by ${KEK}. An export carrying them names that key.`, at: 'kek_id' } });
      return answer(200, { ok: true, value: lines });
    }
    if (args.replace !== true) return answer(422, { ok: false, refusal: { code: 'IMPORT_NOT_EMPTY', fix: 'This record already holds rows.' } });
    const file = (args.lines as string[]).find((l) => l.startsWith('[1,"rec_'))?.slice(4, 4 + REC.length);
    if (file !== REC)
      return answer(422, {
        ok: false,
        refusal: { code: 'OUT_OF_BOUNDS', fix: `This file is ${String(file)}, and this BrainDog is ${REC}. A replacing import puts a BrainDog back as itself.`, at: 'record.id' },
      });
    return answer(200, { ok: true, value: opts.report ?? { tables: 25, rows: 9 } });
  };
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get('authorization');
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    seen.push({ path: url.pathname, auth, body });
    if (url.pathname === '/auth/device') {
      reach = String(body.reach);
      return answer(200, { ok: true, value: { device_code: POLL_ID, user_code: '123456', verification_uri: `${url.origin}/settings/agents`, expires_in: 600, interval: 0 } });
    }
    if (url.pathname === '/auth/device/token')
      return answer(200, { ok: true, value: { pending: false, bearer: GRANT, reach, scope: null, expires: '2026-09-23T03:27:00.000Z' } });
    const method = url.pathname.replace(/^\/api\//, '');
    if (auth === `Bearer ${SERVER_KEY}`) return handle(method, body);
    if (auth === `Bearer ${GRANT}`) {
      if (spent || reach !== method) return answer(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'That bearer is not an operation waiting here.', at: 'operation' } });
      spent = true;
      return handle(method, body);
    }
    if (auth === null) return answer(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in first.', at: 'principal' } });
    return answer(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot export this record.', at: 'principal' } });
  }) as typeof globalThis.fetch;
  return { seen, fetch, api: () => seen.filter((s) => s.path.startsWith('/api/')) };
}

/** A folder, the io a command is run with inside it, and everything it printed. */
function rig(t: { after: (f: () => void) => void }, host: string, fetch: typeof globalThis.fetch, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-brainfile-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out: string[] = [];
  const said: string[] = [];
  const answers: unknown[] = [];
  const io: BrainfileIo = {
    env: { BRAINDOG_HOST: host, ...env },
    cwd: dir,
    file: join(dir, 'hosts.json'),
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
    answer: (a) => void answers.push(a),
    fetch,
    label: 'test machine',
  };
  const hidden = () => {
    for (const secret of [GRANT, GRANT.split('.')[1]!, POLL_ID, SERVER_KEY]) {
      assert.ok(!out.join('\n').includes(secret), 'a secret reached stdout');
      assert.ok(!said.join('\n').includes(secret), 'a secret reached stderr');
      assert.ok(!JSON.stringify(answers).includes(secret), 'a secret reached the --json answer');
    }
  };
  return { dir, io, out, said, answers, hidden };
}

test('EXPORT THROUGH THE DEVICE FLOW: reach export, six digits on stderr, the bearer spent on one request that names the key, and a file that checks', async (t) => {
  const d = door(await exported());
  const r = rig(t, LOCAL, d.fetch);
  const code = await exportFile(['--kek', KEK, '-o', 'backup.brainl'], r.io);
  assert.equal(code, 0, r.said.join('\n'));

  /* ON THIS MACHINE THE FIRST ASK CARRIES NOTHING, for an open self-host, and the 401 is what starts the flow. */
  assert.deepEqual(
    d.seen.map((s) => s.path),
    ['/api/export', '/auth/device', '/auth/device/token', '/api/export'],
  );
  assert.equal(d.seen[1]!.body.reach, 'export');
  assert.match(String(d.seen[1]!.body.label), /export/, 'the approver is not told what they are approving');
  assert.ok(r.said.some((l) => l.includes('enter  123 456')), r.said.join('\n'));
  const sent = d.api()[1]!;
  assert.equal(sent.auth, `Bearer ${GRANT}`);
  assert.deepEqual(sent.body, { redactGrants: false, kek_id: KEK }, 'a backup must carry the sealed bytes and name their key');

  const file = join(r.dir, 'backup.brainl');
  assert.ok(readFileSync(file, 'utf8').includes('#table dog_sig '));
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.ok(!existsSync(`${file}.part`));
  assert.ok(r.out.some((l) => l.includes('signature valid')), r.out.join('\n'));
  assert.ok(r.out.includes('wrote backup.brainl'), r.out.join('\n'));
  /* THE GRANT IS NEVER WRITTEN: no hosts file was made, and nothing printed holds it. */
  assert.ok(!existsSync(r.io.file), 'an operation grant was written to the hosts file');
  r.hidden();
});

test('A CLOUD HOST ASKS FOR APPROVAL FIRST, and the hosts file login is never sent to an ADMIN door', async (t) => {
  const d = door(await exported());
  const r = rig(t, CLOUD, d.fetch);
  writeFileSync(r.io.file, JSON.stringify({ default: CLOUD, hosts: { 'https://app.example.test/the-studio': { token: { value: 'rec_x.login-token', expires: '2099-01-01T00:00:00.000Z', label: 'x' } } } }));
  const code = await exportFile(['--kek', KEK], r.io);
  assert.equal(code, 0, r.said.join('\n'));
  assert.deepEqual(
    d.seen.map((s) => s.path),
    ['/auth/device', '/auth/device/token', '/api/export'],
  );
  assert.equal(d.seen[0]!.body.slug, 'the-studio');
  assert.ok(existsSync(join(r.dir, 'the-studio.brainl')), 'the default name is the record slug');
  r.hidden();
});

test('A SELF-HOST SERVER KEY IN BRAINDOG_TOKEN IS THE OWNER: one request and no approval', async (t) => {
  const d = door(await exported());
  const r = rig(t, LOCAL, d.fetch, { BRAINDOG_TOKEN: SERVER_KEY });
  assert.equal(await exportFile(['--kek', KEK], r.io), 0, r.said.join('\n'));
  assert.deepEqual(
    d.seen.map((s) => s.path),
    ['/api/export'],
  );
  r.hidden();
});

test('NO KEY NAMED: the record names the one it holds, the command says what to run, and no file is written', async (t) => {
  const d = door(await exported());
  const r = rig(t, LOCAL, d.fetch, { BRAINDOG_TOKEN: SERVER_KEY });
  const code = await exportFile(['-o', 'backup.brainl'], r.io);
  assert.equal(code, 1);
  assert.deepEqual(d.api()[0]!.body, { redactGrants: false }, 'the default was not the unredacted export');
  assert.ok(r.said.some((l) => l.includes(KEK)), r.said.join('\n'));
  assert.ok(r.said.some((l) => l.includes('--kek') && l.includes('--redact-grants')), r.said.join('\n'));
  assert.ok(!existsSync(join(r.dir, 'backup.brainl')));
});

test('--redact-grants IS A COPY TO SHARE, and it says it cannot put the keys back; with --kek it is refused before anything is sent', async (t) => {
  const d = door(await exported());
  const r = rig(t, LOCAL, d.fetch, { BRAINDOG_TOKEN: SERVER_KEY });
  assert.equal(await exportFile(['--redact-grants', '-o', 'share.brainl'], r.io), 0, r.said.join('\n'));
  assert.deepEqual(d.api()[0]!.body, { redactGrants: true });
  assert.ok(r.out.some((l) => l.includes('copy to share') && l.includes('will not put this BrainDog back')), r.out.join('\n'));

  const before = d.seen.length;
  assert.equal(await exportFile(['--redact-grants', '--kek', KEK], r.io), 1);
  assert.equal(d.seen.length, before, 'a contradiction was sent to the host');
});

test('IMPORT: checked here first, then one request under an import grant that always replaces', async (t) => {
  const lines = await exported();
  const d = door(lines, { report: { tables: 25, rows: 1234 } });
  const r = rig(t, CLOUD, d.fetch);
  writeFileSync(join(r.dir, 'latest.brainl'), `${lines.join('\n')}\n`);
  const code = await importFile(['latest.brainl'], r.io);
  assert.equal(code, 0, r.said.join('\n'));
  assert.equal(d.seen[0]!.body.reach, 'import');
  const sent = d.api()[0]!;
  assert.equal(sent.body.replace, true);
  assert.deepEqual(sent.body.lines, lines, 'the lines sent are not the file');
  assert.ok(r.out.some((l) => l.includes('signature valid')), 'the verify block did not run before the import');
  assert.ok(r.out.includes(`put back ${REC} from latest.brainl: 25 tables, 1,234 rows, in place of what it held`), r.out.join('\n'));
  r.hidden();
});

test('A FILE THAT DOES NOT CHECK NEVER LEAVES: no approval asked, no request made', async (t) => {
  const lines = await exported();
  const d = door(lines);
  const r = rig(t, CLOUD, d.fetch);
  writeFileSync(join(r.dir, 'bad.brainl'), `${lines.map((l) => l.replace('"The Studio"', '"The Forgery"')).join('\n')}\n`);
  assert.equal(await importFile(['bad.brainl'], r.io), 1);
  assert.equal(d.seen.length, 0, 'a file that does not check was sent');
  assert.ok(r.said.some((l) => l.includes('nothing was sent')), r.said.join('\n'));
});

test('ANOTHER RECORD\'S FILE: the record refuses it, and both ids are said', async (t) => {
  const lines = await exported(OTHER);
  const d = door(lines);
  const r = rig(t, LOCAL, d.fetch, { BRAINDOG_TOKEN: SERVER_KEY });
  writeFileSync(join(r.dir, 'theirs.brainl'), `${lines.join('\n')}\n`);
  assert.equal(await importFile(['theirs.brainl'], r.io), 1);
  const all = [...r.out, ...r.said].join('\n');
  assert.ok(all.includes(OTHER) && all.includes(REC), all);
});

test('A HOST THAT DOES NOT ANSWER IS EXIT 3, and says so without the bearer', async (t) => {
  const lines = await exported();
  const r = rig(t, LOCAL, (async () => {
    throw new TypeError(`fetch failed for Bearer ${SERVER_KEY}`);
  }) as typeof globalThis.fetch, { BRAINDOG_TOKEN: SERVER_KEY });
  writeFileSync(join(r.dir, 'latest.brainl'), `${lines.join('\n')}\n`);
  assert.equal(await exportFile(['--kek', KEK], r.io), 3);
  assert.equal(await importFile(['latest.brainl'], r.io), 3);
  assert.ok(r.said.some((l) => l.includes('did not answer')), r.said.join('\n'));
  r.hidden();
});

/* A REPLACING IMPORT WHOSE ANSWER NEVER CAME MAY HAVE HAPPENED. The request carried the whole file, and a socket that
   drops after the record has taken it, or a Ctrl+C while the record is still writing, leaves the record replaced with
   nobody told. Measured before the sentence changed: this said "did not answer, so nothing was put back", which is a
   claim about the far side that the near side cannot make. */
test('AN IMPORT WITH NO ANSWER DOES NOT CLAIM NOTHING WAS PUT BACK', async (t) => {
  const lines = await exported();
  let reached = 0;
  const r = rig(t, LOCAL, (async () => {
    reached += 1;
    throw new TypeError('socket hang up');
  }) as typeof globalThis.fetch, { BRAINDOG_TOKEN: SERVER_KEY });
  writeFileSync(join(r.dir, 'latest.brainl'), `${lines.join('\n')}\n`);
  assert.equal(await importFile(['latest.brainl'], r.io), 3);
  assert.equal(reached, 1);
  const all = r.said.join('\n');
  assert.ok(!all.includes('nothing was put back'), all);
  assert.match(all, /did not answer/);
});

/* ── through the real command ─────────────────────────────────────────── */

type Ran = { code: number | null; stdout: string; stderr: string };

const ran = (args: string[], cwd: string): Promise<Ran> =>
  new Promise((done) => {
    const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: cwd, APPDATA: cwd };
    delete env.BRAINDOG_TOKEN;
    delete env.BRAINDOG_HOST;
    const child = spawn(process.execPath, [MAIN, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => (stdout += String(b)));
    child.stderr.on('data', (b: Buffer) => (stderr += String(b)));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });

test('THE COMMAND KNOWS BOTH WORDS, and import with an adapter and its options is still the importer', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-brainfile-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const bogus = await ran(['export', '--bogus'], dir);
  assert.equal(bogus.code, 1);
  assert.ok(!bogus.stderr.includes('has no command called export'), bogus.stderr);
  assert.match(bogus.stderr, /^braindog export takes /m);

  /* A .brainl REACHES THIS COMMAND AND NOT THE IMPORTER, which answered it with its usage at `07ba6dbd`. No host is set
     in this folder, and that is said before the file is looked for. */
  const noHost = await ran(['import', 'latest.brainl'], dir);
  assert.equal(noHost.code, 1);
  assert.ok(!noHost.stderr.includes('<adapter> <export.json>'), `a .brainl was handed to the adapter importer: ${noHost.stderr}`);
  assert.match(noHost.stderr, /No BrainDog host is set/);

  /* AN ADAPTER IS TOLD FROM A .brainl BY A SECOND WORD OR AN OPTION ONLY IT TAKES (`isAdapterImport`): one word alone is
     a file to put back, as it was before the importer took any adapter. */
  const adapter = await ran(['import', 'tallybook', '--dry-run'], dir);
  assert.equal(adapter.code, 1);
  assert.match(adapter.stderr, /braindog import takes <adapter> <export\.json>/);

  const json = await ran(['export', '--bogus', '--json'], dir);
  assert.equal(json.code, 1);
  assert.equal((JSON.parse(json.stdout) as { ok: boolean }).ok, false, 'export does not answer --json');
});
