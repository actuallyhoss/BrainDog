/**
 * `braindog keys put --from <file or folder>`: a whole file or folder of keys sealed in one command, each asked about
 * first, names printed and never a value. Every value here is invented, made fresh for the test, and checked to appear
 * nowhere in what the command says, prints, asks or answers. No real `.env` on this machine is opened: every file is
 * written by the test under its own temporary folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECTS } from '../../../fixtures/names.ts';
import { hostKey, saveHosts } from '../src/http.ts';
import { keys, type KeysIo } from '../src/keys.ts';
import { linesOf, nameSays } from '../src/keys-many.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const BASE = 'http://127.0.0.1:5999';
const SCOPE = 'things#4';
const LATER = '2099-01-01T00:00:00.000Z';

const fakeValue = (): string => ['fake-key-for-tests-only-', randomBytes(16).toString('hex')].join('');
const fakeBearer = (): string => ['stub-bearer-for-tests-', randomBytes(12).toString('hex')].join('');

/** Names made from the invented projects, as a person's keys would be named. */
const [ONE, TWO, THREE] = PROJECTS.slice(0, 3).map((p) => `${p.toUpperCase().replace(/[^A-Z]+/g, '_')}_TOKEN`) as [string, string, string];

/** A folder for one test, removed after it. */
function folder(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-keys-many-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A hosts file holding a login, and a vault grant for `SCOPE` when `grant` is set. */
function hosts(dir: string, o: { grant?: boolean } = {}): { file: string; grant: string; secrets: string[] } {
  const login = fakeBearer();
  const grant = fakeBearer();
  const file = join(dir, 'hosts.json');
  const key = hostKey(BASE);
  saveHosts(file, { default: key, hosts: { [key]: { token: { value: login, expires: LATER, label: 'studio-desktop' }, ...(o.grant ? { vault: { [SCOPE]: { value: grant, expires: LATER } } } : {}) } } });
  return { file, grant, secrets: [login, grant] };
}

type Sent = { url: string; authorization: string; body: Record<string, unknown> };

/**
 * An in-process `KeysIo` over a stub deposit door. A label in `held` is one the record holds already: under the login
 * the door refuses it as the record does, and under a grant it rotates it.
 */
function io(file: string, o: { held?: string[]; answers?: (boolean | null)[]; confirm?: false; cwd?: string; grant?: string } = {}) {
  const said: string[] = [];
  const asked: string[] = [];
  const answered: unknown[] = [];
  const sent: Sent[] = [];
  const answers = [...(o.answers ?? [])];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const authorization = headers.get('authorization') ?? '';
    sent.push({ url: String(input), authorization, body });
    const held = (o.held ?? []).includes(String(body.label));
    const granted = o.grant !== undefined && authorization === `Bearer ${o.grant}`;
    return held && !granted
      ? new Response(JSON.stringify({ ok: false, refusal: { code: 'FORBIDDEN', fix: "Replacing a key's value needs a vault grant for its project.", at: 'label' } }), { status: 403 })
      : new Response(JSON.stringify({ ok: true, value: { credential: `credentials#${String(sent.length)}`, version: held ? 2 : 1, rotated: held } }), { status: 200 });
  }) as typeof globalThis.fetch;
  const shape: KeysIo = {
    file,
    env: {},
    stdin: () => null,
    say: (line) => void said.push(line),
    out: (line) => void said.push(line),
    answer: (a) => void answered.push(a),
    headers: async () => ({}),
    spawn: async () => 0,
    fetch,
    cwd: o.cwd,
    ...(o.confirm === false
      ? {}
      : {
          confirm: async (question: string) => {
            asked.push(question);
            return answers.length > 0 ? answers.shift()! : true;
          },
        }),
  };
  return { io: shape, said, asked, answered, sent };
}

/** No planted value, and no bearer, in anything the command said, asked or answered. */
function nowhere(run: { said: string[]; asked: string[]; answered: unknown[] }, secrets: string[]) {
  const texts = [...run.said, ...run.asked, JSON.stringify(run.answered)];
  for (const text of texts) for (const secret of secrets) assert.ok(!text.includes(secret), 'a value reached what the command said');
}

test('A FILE OF THREE: each asked about, sent once, quotes and comments taken off, names said and no value', async (t) => {
  const dir = folder(t);
  const h = hosts(dir);
  const [a, b, c] = [fakeValue(), fakeValue(), fakeValue()];
  writeFileSync(join(dir, '.env'), `# invented keys for a test\n\nexport ${ONE}=${a}\n${TWO}="${b}"\n${THREE}='${c}' \n`);
  const run = io(h.file, { cwd: dir });

  assert.equal(await keys(['put', '--from', '.env'], run.io), 0, run.said.join('\n'));
  assert.deepEqual(run.sent.map((s) => [s.url, s.body.label, s.body.value]), [
    [`${BASE}/api/vault/deposit`, ONE, a],
    [`${BASE}/api/vault/deposit`, TWO, b],
    [`${BASE}/api/vault/deposit`, THREE, c],
  ]);
  assert.equal(run.sent[0]?.body.opens, ONE.toLowerCase().replace(/_/g, ' '), 'a new key says what it opens');
  assert.deepEqual(run.asked, [`Seal ${ONE}?`, `Seal ${TWO}?`, `Seal ${THREE}?`]);
  assert.ok(run.said.includes(`${ONE}: sealed.`));
  assert.ok(run.said.includes('3 sealed, 0 skipped, 0 refused.'));
  assert.ok(run.said.includes('Every key in .env is sealed. The file is yours to delete.'));
  nowhere(run, [a, b, c, ...h.secrets]);
});

test('A FOLDER OF THREE: one key a file, named by the file, and the line that says the folder is his to delete', async (t) => {
  const dir = folder(t);
  const h = hosts(dir);
  const keysDir = join(dir, 'old-keys');
  mkdirSync(keysDir);
  const [a, b, c] = [fakeValue(), fakeValue(), fakeValue()];
  writeFileSync(join(keysDir, ONE), `${a}\n`);
  writeFileSync(join(keysDir, 'copperleaf-deploy.txt'), b);
  writeFileSync(join(keysDir, 'id_ed25519'), `-----BEGIN INVENTED TEST KEY-----\n${c}\n-----END INVENTED TEST KEY-----\n`);
  writeFileSync(join(keysDir, '.DS_Store'), 'not a key');
  const run = io(h.file, { cwd: dir });

  assert.equal(await keys(['put', '--from', 'old-keys'], run.io), 0, run.said.join('\n'));
  assert.deepEqual(run.sent.map((s) => s.body.label), ['copperleaf-deploy', 'id_ed25519', ONE].sort((x, y) => String(x).localeCompare(String(y))));
  const byLabel = new Map(run.sent.map((s) => [s.body.label, s.body]));
  assert.equal(byLabel.get(ONE)?.value, a, 'one trailing line break is not part of a key');
  assert.equal(byLabel.get('copperleaf-deploy')?.value, b);
  assert.equal(byLabel.get('id_ed25519')?.kind, 'ssh_key');
  assert.ok(String(byLabel.get('id_ed25519')?.value).includes(c));
  assert.ok(run.said.includes('3 sealed, 0 skipped, 0 refused.'));
  assert.ok(run.said.includes('Every key in old-keys is sealed. The folder is yours to delete.'));
  nowhere(run, [a, b, c, ...h.secrets]);
});

test('A HELD NAME IS SKIPPED AND COUNTED under the login, and replaced under the vault grant for its project', async (t) => {
  const dir = folder(t);
  const h = hosts(dir);
  const [a, b] = [fakeValue(), fakeValue()];
  writeFileSync(join(dir, '.env.local'), `${ONE}=${a}\n${TWO}=${b}\n`);

  /* No vault grant is kept, so the login carries each key, and the door refuses the one already held. */
  const login = io(h.file, { cwd: dir, held: [TWO] });
  assert.equal(await keys(['put', '--from', '.env.local'], login.io), 0, login.said.join('\n'));
  assert.equal(login.sent.length, 2, 'one request a key');
  assert.ok(login.said.includes(`${TWO}: skipped, your BrainDog already holds it.`));
  assert.ok(login.said.includes('1 sealed, 1 skipped, 0 refused.'));
  assert.ok(login.said.includes('Every key in .env.local is sealed. The file is yours to delete.'), 'a key held already is a key in the vault');

  const h2 = hosts(dir, { grant: true });
  const granted = io(h2.file, { cwd: dir, held: [TWO], grant: h2.grant });
  assert.equal(await keys(['put', '--from', '.env.local', '--project', SCOPE], granted.io), 0, granted.said.join('\n'));
  assert.ok(granted.sent.every((s) => s.authorization === `Bearer ${h2.grant}`), 'the project named is its grant, never the login');
  assert.ok(granted.said.includes(`${TWO}: sealed, in place of the value it held.`));
  assert.ok(granted.said.includes('2 sealed, 0 skipped, 0 refused.'));
  nowhere(login, [a, b, ...h.secrets]);
  nowhere(granted, [a, b, ...h2.secrets]);
});

test('A PROJECT NAMED WITH NO GRANT KEPT for it sends nothing, and never falls back to the login', async (t) => {
  const dir = folder(t);
  const h = hosts(dir);
  const a = fakeValue();
  writeFileSync(join(dir, '.env'), `${ONE}=${a}\n`);
  const run = io(h.file, { cwd: dir });
  /* The record is asked for the project by name; this stub answers no list, so nothing is found. */
  assert.equal(await keys(['put', '--from', '.env', '--project', PROJECTS[0]], run.io), 1);
  assert.ok(run.sent.every((s) => !s.url.endsWith('/api/vault/deposit')), 'nothing was deposited');
  assert.ok(run.said.some((l) => l.startsWith('No keychain access for that project is kept here')), run.said.join('\n'));
  nowhere(run, [a, ...h.secrets]);
});

test('DRY RUN SENDS NOTHING and asks nothing, and says what each key would do', async (t) => {
  const dir = folder(t);
  const h = hosts(dir);
  const [a, b, c] = [fakeValue(), fakeValue(), fakeValue()];
  writeFileSync(join(dir, '.env'), `${ONE}=${a}\n${TWO}=${b}\n${THREE}=${c}\n`);
  const run = io(h.file, { cwd: dir });

  assert.equal(await keys(['put', '--from', join(dir, '.env'), '--dry-run'], run.io), 0, run.said.join('\n'));
  assert.equal(run.sent.length, 0);
  assert.equal(run.asked.length, 0);
  assert.ok(run.said.includes(`${ONE}: would be sealed.`));
  assert.ok(run.said.includes('Nothing was sent: 3 keys would be sealed, 0 skipped, 0 refused.'));
  assert.ok(!run.said.some((l) => l.startsWith('Every key')), 'a dry run seals nothing');
  nowhere(run, [a, b, c, ...h.secrets]);
});

test('EACH KEY IS HIS: a no is skipped and keeps the folder line back, and with no terminal nothing is sent', async (t) => {
  const dir = folder(t);
  const h = hosts(dir);
  const [a, b] = [fakeValue(), fakeValue()];
  writeFileSync(join(dir, '.env'), `${ONE}=${a}\n${TWO}=${b}\n`);

  const declined = io(h.file, { cwd: dir, answers: [false, true] });
  assert.equal(await keys(['put', '--from', '.env'], declined.io), 0);
  assert.deepEqual(declined.sent.map((s) => s.body.label), [TWO]);
  assert.ok(declined.said.includes(`${ONE}: skipped, you said no.`));
  assert.ok(!declined.said.some((l) => l.startsWith('Every key')));

  const away = io(h.file, { cwd: dir, answers: [null] });
  assert.equal(await keys(['put', '--from', '.env'], away.io), 1);
  assert.equal(away.sent.length, 0);
  const none = io(h.file, { cwd: dir, confirm: false });
  assert.equal(await keys(['put', '--from', '.env'], none.io), 1);
  assert.equal(none.sent.length, 0);
  nowhere(declined, [a, b, ...h.secrets]);
  nowhere(away, [a, b, ...h.secrets]);
});

test('THE READER: a value over several lines, a name shaped like a key, a name twice, and lines that are not keys', () => {
  const [a, b, c] = [fakeValue(), fakeValue(), fakeValue()];
  const shaped = `sk_live_${randomBytes(12).toString('hex')}`;
  const read = linesOf(`${ONE}="first\n${a}\nlast"\n${shaped}=${b}\n${TWO}=${c} # a note\n${TWO}=again\nnot a key line\n${THREE}=\n`, '.env');
  assert.deepEqual(read.found.map((f) => f.name), [ONE, TWO]);
  assert.equal(read.found[0]?.value, `first\n${a}\nlast`);
  assert.equal(read.found[1]?.value, c);
  assert.deepEqual(read.unsent.map((u) => u.name), ['A name shaped like a key', TWO, THREE]);
  assert.equal(read.unread, 1);
  for (const u of read.unsent) for (const secret of [a, b, c, shaped]) assert.ok(!`${u.name} ${u.why}`.includes(secret));
  assert.equal(nameSays('AKIAIOSFODNN7EXAMPLE'), false, 'an access key id is not a name');
  assert.equal(nameSays('NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD'), true);
});

/** The real command, with this test's own config folder and nothing on a terminal. */
async function command(dir: string, args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, XDG_CONFIG_HOME: dir, APPDATA: dir, BRAINDOG_HOST: BASE };
  delete env.BRAINDOG_TOKEN;
  const child = spawn(process.execPath, [MAIN, 'keys', ...args], { env, cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  child.stdin.end('');
  const code = await new Promise<number | null>((done) => child.on('close', done));
  return { code, stdout, stderr };
}

test('AS A PROCESS: a dry run names the keys, and with no terminal to ask at nothing is sent', async (t) => {
  const dir = folder(t);
  mkdirSync(join(dir, 'braindog'), { recursive: true });
  hosts(join(dir, 'braindog'));
  const [a, b] = [fakeValue(), fakeValue()];
  writeFileSync(join(dir, '.env'), `${ONE}=${a}\n${TWO}=${b}\n`);

  const dry = await command(dir, ['put', '--from', '.env', '--dry-run']);
  assert.equal(dry.code, 0, dry.stderr);
  assert.match(dry.stderr, new RegExp(`${ONE}: would be sealed`));
  const real = await command(dir, ['put', '--from', '.env']);
  assert.equal(real.code, 1, real.stderr);
  assert.match(real.stderr, /no terminal here, so nothing more was sent/);
  for (const text of [dry.stdout, dry.stderr, real.stdout, real.stderr]) for (const secret of [a, b]) assert.ok(!text.includes(secret), 'a value was written');
});
