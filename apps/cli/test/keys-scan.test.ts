/**
 * `braindog keys scan`: every key lying in a repository's files, by name and file, never a value. Each test builds its
 * own invented repository under the test's temporary folder, with invented names and fresh fake values, and checks the
 * values appear nowhere in what the scan prints, says or answers. No real `.env`, `.dev.vars` or `.secrets` on this
 * machine is opened.
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
import { FOLDER_LIMIT, findKeys } from '../src/keys-scan.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const BASE = 'http://127.0.0.1:5998';
const LATER = '2099-01-01T00:00:00.000Z';

const fakeValue = (): string => ['fake-key-for-tests-only-', randomBytes(16).toString('hex')].join('');

/** An invented repository: a `.env`, a `.env.local`, a `.secrets` file and a `.pem`, and three places that are not keys. */
function repository(t: { after: (fn: () => void) => void }) {
  const top = mkdtempSync(join(tmpdir(), 'braindog-keys-scan-'));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  const repo = join(top, PROJECTS[1].toLowerCase());
  const values = Array.from({ length: 7 }, fakeValue);
  mkdirSync(join(repo, 'apps', 'site'), { recursive: true });
  mkdirSync(join(repo, '.secrets'));
  mkdirSync(join(repo, 'node_modules', 'some-package'), { recursive: true });
  mkdirSync(join(repo, 'certs'));
  writeFileSync(join(repo, '.env'), `# invented\nQUIETCART_API_KEY=${values[0]!}\nOXBOW_WEBHOOK_SECRET="${values[1]!}"\n`);
  writeFileSync(join(repo, 'apps', 'site', '.env.local'), `BRIGHTWELL_TOKEN=${values[2]!}\n`);
  writeFileSync(join(repo, '.secrets', 'lanternfish-deploy'), `${values[3]!}\n`);
  writeFileSync(join(repo, 'certs', 'copperleaf.pem'), `-----BEGIN INVENTED TEST KEY-----\n${values[4]!}\n-----END INVENTED TEST KEY-----\n`);
  writeFileSync(join(repo, '.env.example'), `EXAMPLE_ONLY=${values[5]!}\n`);
  writeFileSync(join(repo, 'node_modules', 'some-package', '.env'), `VENDORED_KEY=${values[6]!}\n`);
  writeFileSync(join(repo, 'README.md'), 'An invented repository for a test.\n');
  return { top, repo, values };
}

/** An in-process `KeysIo` whose door is a stub that keeps every deposit, and whose terminal says yes. */
function io(cwd: string, file: string) {
  const said: string[] = [];
  const printed: string[] = [];
  const answered: unknown[] = [];
  const sent: Record<string, unknown>[] = [];
  const shape: KeysIo = {
    file,
    env: {},
    stdin: () => null,
    say: (line) => void said.push(line),
    out: (line) => void printed.push(line),
    answer: (a) => void answered.push(a),
    headers: async () => ({}),
    spawn: async () => 0,
    cwd,
    confirm: async () => true,
    fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true, value: { credential: `credentials#${String(sent.length)}`, version: 1, rotated: false } }), { status: 200 });
    }) as typeof globalThis.fetch,
  };
  return { io: shape, said, printed, answered, sent };
}

const nowhere = (texts: string[], values: string[]) => {
  for (const text of texts) for (const v of values) for (const piece of [v, v.slice(-12)]) assert.ok(!text.includes(piece), 'a value, or a part of one, was printed');
};

test('FINDS .env, .env.local, a .secrets file and a .pem, and skips .env.example and node_modules', (t) => {
  const { repo } = repository(t);
  const found = findKeys(repo);
  assert.deepEqual(
    found.keys.map((k) => k.name).sort(),
    ['BRIGHTWELL_TOKEN', 'OXBOW_WEBHOOK_SECRET', 'QUIETCART_API_KEY', 'copperleaf.pem', 'lanternfish-deploy'],
  );
  assert.ok(!found.keys.some((k) => k.name === 'EXAMPLE_ONLY' || k.name === 'VENDORED_KEY'));
  assert.equal(found.keys.find((k) => k.name === 'lanternfish-deploy')?.from, join(repo, '.secrets'), 'a .secrets file is sealed with its folder');
  assert.deepEqual(found.passed, []);
});

test('PRINTS NAMES AND PATHS AND NEVER A VALUE, with the command that seals each place, and sends nothing', async (t) => {
  const { top, repo, values } = repository(t);
  const run = io(top, join(top, 'hosts.json'));
  assert.equal(await keys(['scan', repo, '--project', PROJECTS[1]], run.io), 0, run.said.join('\n'));
  assert.equal(run.sent.length, 0);
  assert.ok(run.printed.includes('QUIETCART_API_KEY · .env'));
  assert.ok(run.printed.includes('BRIGHTWELL_TOKEN · apps/site/.env.local'));
  assert.ok(run.printed.includes('lanternfish-deploy · .secrets/lanternfish-deploy'));
  assert.ok(run.printed.includes('copperleaf.pem · certs/copperleaf.pem'));
  const repoName = PROJECTS[1].toLowerCase();
  assert.ok(run.printed.includes(`  braindog keys put --from ${repoName}/.secrets --project ${PROJECTS[1]}`), run.printed.join('\n'));
  assert.ok(run.printed.includes(`  braindog keys put --from ${repoName}/.env --project ${PROJECTS[1]}`));
  assert.ok(run.said.includes('5 keys lie in 4 files. These seal them, asking you about each key first:'));
  nowhere([...run.printed, ...run.said, JSON.stringify(run.answered)], values);
});

test('--deposit RUNS put --from FOR EACH PLACE, and the door is called once a key', async (t) => {
  const { top, repo, values } = repository(t);
  const file = join(top, 'hosts.json');
  saveHosts(file, { default: hostKey(BASE), hosts: { [hostKey(BASE)]: { token: { value: `stub-login-${randomBytes(8).toString('hex')}`, expires: LATER, label: 'studio-desktop' } } } });
  const run = io(repo, file);
  assert.equal(await keys(['scan', '--deposit'], run.io), 0, run.said.join('\n'));
  assert.deepEqual(run.sent.map((s) => s.label).sort(), ['BRIGHTWELL_TOKEN', 'OXBOW_WEBHOOK_SECRET', 'QUIETCART_API_KEY', 'copperleaf.pem', 'lanternfish-deploy']);
  assert.equal(run.sent.find((s) => s.label === 'OXBOW_WEBHOOK_SECRET')?.value, values[1], 'the quotes are off what is sealed');
  assert.ok(run.said.includes('Every key in .secrets is sealed. The folder is yours to delete.'));
  assert.equal(run.answered.length, 1, 'the scan answers once, and the put --from it runs does not');
  nowhere([...run.printed, ...run.said, JSON.stringify(run.answered)], values);
});

test('--deposit STILL ASKS ABOUT EACH KEY: a no is not sent, and with no terminal nothing is', async (t) => {
  const { top, repo, values } = repository(t);
  const file = join(top, 'hosts.json');
  saveHosts(file, { default: hostKey(BASE), hosts: { [hostKey(BASE)]: { token: { value: `stub-login-${randomBytes(8).toString('hex')}`, expires: LATER, label: 'studio-desktop' } } } });

  const asked: string[] = [];
  const picky = io(repo, file);
  picky.io.confirm = async (question) => {
    asked.push(question);
    return !question.includes('QUIETCART_API_KEY');
  };
  await keys(['scan', '--deposit'], picky.io);
  assert.equal(asked.length, 5, 'one question a key');
  assert.deepEqual(picky.sent.map((s) => s.label).sort(), ['BRIGHTWELL_TOKEN', 'OXBOW_WEBHOOK_SECRET', 'copperleaf.pem', 'lanternfish-deploy']);

  const away = io(repo, file);
  away.io.confirm = undefined;
  assert.equal(await keys(['scan', '--deposit'], away.io), 1);
  assert.equal(away.sent.length, 0, 'no terminal, nothing sent');
  nowhere([...picky.printed, ...picky.said, ...asked, ...away.printed, ...away.said], values);
});

test('A FOLDER OVER 5,000 FILES DEEP IS PASSED OVER and named, and the folder around it is still read', (t) => {
  const { repo } = repository(t);
  const big = join(repo, 'generated', 'inner');
  mkdirSync(join(big, 'deeper'), { recursive: true });
  for (let i = 0; i < FOLDER_LIMIT; i++) writeFileSync(join(big, 'deeper', `f${String(i)}`), '');
  /* 5,000 below `deeper` is not over; one more beside it puts `inner` over, and `deeper` is said as part of it. */
  writeFileSync(join(big, '.env'), 'PASSED_BY_SIZE=x\n');
  writeFileSync(join(repo, 'generated', '.env'), 'BESIDE_IT=x\n');
  const found = findKeys(repo);
  assert.deepEqual(found.passed, [big]);
  assert.ok(!found.keys.some((k) => k.name === 'PASSED_BY_SIZE'));
  assert.ok(found.keys.some((k) => k.name === 'BESIDE_IT'));
});

test('AS A PROCESS: the scan prints names and paths on stdout, and nothing of a value anywhere', async (t) => {
  const { top, repo, values } = repository(t);
  const env: Record<string, string | undefined> = { ...process.env, XDG_CONFIG_HOME: top, APPDATA: top };
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_HOST;
  const child = spawn(process.execPath, [MAIN, 'keys', 'scan'], { env, cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  child.stdin.end('');
  const code = await new Promise<number | null>((done) => child.on('close', done));
  assert.equal(code, 0, stderr);
  assert.match(stdout, /QUIETCART_API_KEY · \.env/);
  assert.match(stdout, /braindog keys put --from \.secrets --project copperleaf/);
  nowhere([stdout, stderr], values);
});
