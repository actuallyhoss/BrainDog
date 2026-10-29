/**
 * `braindog logout [<host>]`: what it takes out of the hosts file, what it leaves, and what it refuses.
 *
 * EVERY TOKEN AND GRANT HERE IS OBVIOUSLY FAKE and long enough that any fragment of one in stdout or stderr is
 * findable. `hidden` runs on every path, the successes included, because the command that removes a token is the
 * one most likely to print it while saying what it removed.
 *
 * THE FILE IS READ BACK AND COMPARED WHOLE. A logout is judged by what is left, not by what it said it did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logout } from '../src/logout.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

const HOST = 'https://app.example';
const OTHER = 'https://other.example';
const LATER = '2099-01-01T00:00:00.000Z';

const TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-login-token-never-printed-7b3e';
const RUNNER = 'rec_01TESTTESTTESTTESTTESTTEST.stub-runner-token-never-printed-2f91';
const GRANT_A = 'rec_01TESTTESTTESTTESTTESTTEST.stub-grant-one-never-printed-4d17';
const GRANT_B = 'rec_01TESTTESTTESTTESTTESTTEST.stub-grant-two-never-printed-8a52';
const GRANT_C = 'rec_01TESTTESTTESTTESTTESTTEST.stub-grant-three-never-printed-c096';
const OTHER_TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-other-token-never-printed-1e64';

/** The scopes are keys of the vault map, and no sentence names one. */
const SCOPES = ['things#3', 'people#7', '*'];

const LABEL = 'a-test-machine · braindog-cli';
const held = (value: string) => ({ value, expires: LATER, label: LABEL });
const grant = (value: string) => ({ value, expires: LATER });

/** Nothing this test wrote reaches a terminal. Fragments too, because a truncated token is still a token. */
const hidden = (out: { stdout: string; stderr: string }) => {
  for (const kept of [TOKEN, RUNNER, GRANT_A, GRANT_B, GRANT_C, OTHER_TOKEN]) {
    for (const fragment of [kept, kept.split('.')[1]!]) {
      assert.ok(!out.stdout.includes(fragment), 'a token reached stdout');
      assert.ok(!out.stderr.includes(fragment), 'a token reached stderr');
    }
  }
  for (const scope of SCOPES) {
    if (scope === '*') continue;
    assert.ok(!out.stdout.includes(scope), 'a vault scope reached stdout');
    assert.ok(!out.stderr.includes(scope), 'a vault scope reached stderr');
  }
  assert.ok(!out.stdout.includes(LABEL), 'a label reached stdout');
  assert.ok(!out.stderr.includes(LABEL), 'a label reached stderr');
};

/** A config folder of this test's own, with a hosts file of the given shape, or none when it is `undefined`. */
function config(t: { after: (fn: () => void) => void }, shape: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-logout-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'braindog'), { recursive: true });
  const file = join(dir, 'braindog', 'hosts.json');
  if (shape !== undefined) writeFileSync(file, typeof shape === 'string' ? shape : `${JSON.stringify(shape, null, 2)}\n`, { mode: 0o600 });
  return { dir, file };
}

/** In process, with a fake Io, so the lines and the exit code are this test's alone. */
async function call(args: string[], file: string, env: Record<string, string | undefined> = {}) {
  const lines: string[] = [];
  const code = await logout(args, { file, env, say: (line) => lines.push(line) });
  return { code, lines, stdout: '', stderr: lines.join('\n') };
}

/** As a real process, so what a terminal would show is what is asserted. */
async function run(dir: string, args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, XDG_CONFIG_HOME: dir, APPDATA: dir };
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_HOST;
  const child = spawn(process.execPath, [MAIN, 'logout', ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  const code = await new Promise<number | null>((done) => child.on('close', done));
  return { code, stdout, stderr };
}

const readBack = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

test('A TOKEN IS REMOVED AND THE ENTRY GOES WITH IT', async (t) => {
  const { file } = config(t, { default: HOST, hosts: { [HOST]: { token: held(TOKEN) } } });

  const out = await call([HOST], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, [`signed out of ${HOST} · a token removed · no default host is set now`]);
  hidden(out);
  assert.deepEqual(readBack(file), { hosts: {} });
});

test('A TOKEN, A RUNNER TOKEN AND THREE VAULT GRANTS ALL GO, AND NO SCOPE IS NAMED', async (t) => {
  const { file } = config(t, {
    default: HOST,
    hosts: {
      [HOST]: {
        token: held(TOKEN),
        runner: held(RUNNER),
        vault: { [SCOPES[0]!]: grant(GRANT_A), [SCOPES[1]!]: grant(GRANT_B), [SCOPES[2]!]: grant(GRANT_C) },
      },
    },
  });

  const out = await call([HOST], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, [`signed out of ${HOST} · a token, a runner token and 3 keychain access removed · no default host is set now`]);
  hidden(out);
  assert.deepEqual(readBack(file), { hosts: {} });
});

test('THE DEFAULT IS CLEARED ONLY WHEN IT NAMED THIS HOST, AND A SECOND HOST IS UNTOUCHED', async (t) => {
  const shape = {
    default: OTHER,
    hosts: { [HOST]: { token: held(TOKEN) }, [OTHER]: { token: held(OTHER_TOKEN), vault: { [SCOPES[0]!]: grant(GRANT_A) } } },
  };
  const { file } = config(t, shape);

  const out = await call([HOST], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, [`signed out of ${HOST} · a token removed`], 'it said the default changed when it did not');
  hidden(out);
  assert.deepEqual(readBack(file), {
    default: OTHER,
    hosts: { [OTHER]: { token: held(OTHER_TOKEN), vault: { [SCOPES[0]!]: grant(GRANT_A) } } },
  });
});

test('A HAND-WRITTEN KEY WITH A TRAILING SLASH IS THE SAME HOST, SO IT IS REMOVED TOO', async (t) => {
  /* `target()` reaches this entry through `sameHost`, so a logout that left it would not have logged out. */
  const { file } = config(t, {
    default: `${HOST}/`,
    hosts: { [`${HOST}/`]: { token: held(TOKEN) }, [OTHER]: { token: held(OTHER_TOKEN) } },
  });

  const out = await call([HOST], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, [`signed out of ${HOST} · a token removed · no default host is set now`]);
  hidden(out);
  assert.deepEqual(readBack(file), { hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
});

test('A BARE NAME NAMES THE SAME HOST AS ITS https ADDRESS', async (t) => {
  const { file } = config(t, { default: HOST, hosts: { [HOST]: { token: held(TOKEN) } } });

  const out = await call(['app.example'], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, [`signed out of ${HOST} · a token removed · no default host is set now`]);
  hidden(out);
  assert.deepEqual(readBack(file), { hosts: {} });
});

test('AN OLD ADDRESS, brain.dog/app/<slug>, IS THE SAME HOST AS THE KEY A LOGIN KEPT', async (t) => {
  /* The connect screen printed `/app/<slug>` until the app moved to the root, a login keeps `/<slug>`, and one kept on
     `brain.dog` is the record on `app.brain.dog` now,
     so a logout typed from the screen that left the entry behind would say "nothing to remove" over a live bearer. */
  const kept = 'https://brain.dog/acme';
  const { file } = config(t, { default: kept, hosts: { [kept]: { token: held(TOKEN) }, [OTHER]: { token: held(OTHER_TOKEN) } } });

  const out = await call(['https://brain.dog/app/acme/'], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, ['signed out of https://app.brain.dog/acme · a token removed · no default host is set now']);
  hidden(out);
  assert.deepEqual(readBack(file), { hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
});

test('NO HOST NAMED ANYWHERE IS REFUSED, AND THE FILE IS UNCHANGED', async (t) => {
  const shape = { hosts: { [HOST]: { token: held(TOKEN) } } };
  const { file } = config(t, shape);
  const before = readFileSync(file, 'utf8');

  const out = await call([], file);

  assert.equal(out.code, 1);
  assert.deepEqual(out.lines, ['No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or name one as braindog logout <host>.']);
  hidden(out);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('WITH NO ARGUMENT IT TAKES THE DEFAULT, THEN BRAINDOG_HOST, THEN --host', async (t) => {
  const byDefault = config(t, { default: HOST, hosts: { [HOST]: { token: held(TOKEN) } } });
  const fromDefault = await call([], byDefault.file);
  assert.equal(fromDefault.code, 0, fromDefault.stderr);
  assert.deepEqual(readBack(byDefault.file), { hosts: {} });
  hidden(fromDefault);

  /* BRAINDOG_HOST beats the file's default. */
  const byEnv = config(t, { default: OTHER, hosts: { [HOST]: { token: held(TOKEN) }, [OTHER]: { token: held(OTHER_TOKEN) } } });
  const fromEnv = await call([], byEnv.file, { BRAINDOG_HOST: HOST });
  assert.equal(fromEnv.code, 0, fromEnv.stderr);
  assert.deepEqual(fromEnv.lines, [`signed out of ${HOST} · a token removed`]);
  assert.deepEqual(readBack(byEnv.file), { default: OTHER, hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
  hidden(fromEnv);

  /* --host beats BRAINDOG_HOST. */
  const byFlag = config(t, { default: OTHER, hosts: { [HOST]: { token: held(TOKEN) }, [OTHER]: { token: held(OTHER_TOKEN) } } });
  const fromFlag = await call(['--host', HOST], byFlag.file, { BRAINDOG_HOST: OTHER });
  assert.equal(fromFlag.code, 0, fromFlag.stderr);
  assert.deepEqual(readBack(byFlag.file), { default: OTHER, hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
  hidden(fromFlag);
});

test('AN ARGUMENT AND A --host THAT DISAGREE ARE REFUSED RATHER THAN ONE OF THEM PICKED', async (t) => {
  const shape = { default: HOST, hosts: { [HOST]: { token: held(TOKEN) }, [OTHER]: { token: held(OTHER_TOKEN) } } };
  const { file } = config(t, shape);
  const before = readFileSync(file, 'utf8');

  const out = await call([HOST, '--host', OTHER], file);

  assert.equal(out.code, 1);
  assert.deepEqual(out.lines, ['braindog logout was given one host as an argument and a different one as --host. Name one of them.']);
  hidden(out);
  assert.equal(readFileSync(file, 'utf8'), before);

  /* The same host written two ways is not a disagreement. */
  const agreeing = await call([`${HOST}/`, '--host', HOST], file);
  assert.equal(agreeing.code, 0, agreeing.stderr);
  assert.deepEqual(readBack(file), { hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
  hidden(agreeing);
});

test('A HOST WITH NOTHING IN THE FILE IS 0, AND THE FILE IS NOT REWRITTEN', async (t) => {
  const shape = { default: OTHER, hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } };
  const { file } = config(t, shape);
  const before = readFileSync(file, 'utf8');

  const out = await call([HOST], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, [`No login to ${HOST} is kept on this machine, so there was nothing to remove.`]);
  hidden(out);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('NO HOSTS FILE AT ALL IS 0, AND NONE IS CREATED', async (t) => {
  const { file } = config(t, undefined);

  const out = await call([HOST], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, [`No login to ${HOST} is kept on this machine, so there was nothing to remove.`]);
  assert.equal(existsSync(file), false, 'a logout made a hosts file');
});

test('A DEFAULT NAMING A HOST WITH NO ENTRY IS STILL CLEARED', async (t) => {
  const { file } = config(t, { default: HOST, hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });

  const out = await call([HOST], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(out.lines, [`signed out of ${HOST} · no token was kept for it · no default host is set now`]);
  hidden(out);
  assert.deepEqual(readBack(file), { hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
});

test('AN UNPARSEABLE HOSTS FILE IS THE READ’S OWN SENTENCE, AND NOTHING IS WRITTEN', async (t) => {
  const broken = `{ "default": "${HOST}", "hosts": { "${HOST}": { "token": { "value": "${TOKEN}"`;
  const { file } = config(t, broken);

  const out = await call([HOST], file);

  assert.equal(out.code, 1);
  assert.deepEqual(out.lines, [`${file} is not valid JSON. Correct it by hand, or delete it and sign in again.`]);
  hidden(out);
  assert.equal(readFileSync(file, 'utf8'), broken);
});

test('A FILE WITH NO hosts MAP IS REFUSED BY THE SAME READ, AND NOTHING IS WRITTEN', async (t) => {
  const shape = { default: HOST };
  const { file } = config(t, shape);
  const before = readFileSync(file, 'utf8');

  const out = await call([HOST], file);

  assert.equal(out.code, 1);
  assert.deepEqual(out.lines, [`${file} has no hosts map, so it is not a BrainDog hosts file.`]);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('AN ADDRESS THAT IS NOT ONE IS REFUSED WITHOUT BEING ECHOED', async (t) => {
  const shape = { hosts: { [HOST]: { token: held(TOKEN) } } };
  const { file } = config(t, shape);
  const before = readFileSync(file, 'utf8');

  const out = await call(['not a host'], file);

  assert.equal(out.code, 1);
  assert.deepEqual(out.lines, ['The BrainDog host is not an address. Write it as https://app.brain.dog/<slug>.']);
  assert.ok(!out.stderr.includes('not a host'), 'it echoed what was typed');
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('A FLAG IT DOES NOT TAKE IS ONE SENTENCE THAT DOES NOT ECHO WHAT WAS TYPED', async (t) => {
  const shape = { hosts: { [HOST]: { token: held(TOKEN) } } };
  const { file } = config(t, shape);
  const before = readFileSync(file, 'utf8');

  const out = await call(['--all'], file);

  assert.equal(out.code, 1);
  assert.deepEqual(out.lines, ['braindog logout takes one host, as in braindog logout https://app.brain.dog/<slug>, or --host <host>, and nothing else.']);
  assert.ok(!out.stderr.includes('--all'), 'it echoed what was typed');
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('TWO HOSTS AS ARGUMENTS ARE REFUSED', async (t) => {
  const shape = { hosts: { [HOST]: { token: held(TOKEN) } } };
  const { file } = config(t, shape);
  const before = readFileSync(file, 'utf8');

  const out = await call([HOST, OTHER], file);

  assert.equal(out.code, 1);
  assert.deepEqual(out.lines, ['braindog logout takes one host, as in braindog logout https://app.brain.dog/<slug>, or --host <host>, and nothing else.']);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('A SESSION FILE LEFT BESIDE THE HOSTS FILE IS NOT TOUCHED', async (t) => {
  const { dir, file } = config(t, { default: HOST, hosts: { [HOST]: { token: held(TOKEN) } } });
  const sessions = join(dir, 'braindog', 'sessions');
  mkdirSync(sessions, { recursive: true });
  const session = join(sessions, 'abcdef123456.json');
  /* It names a run on the host being signed out of. Every reader guards on `held.host === to.key`, so it is inert. */
  const kept = `${JSON.stringify({ host: HOST, spoken: 'S7', head_at_start: null, at: LATER }, null, 2)}\n`;
  writeFileSync(session, kept);

  const out = await call([HOST], file);

  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(readBack(file), { hosts: {} });
  assert.equal(existsSync(session), true, 'a logout deleted a session file');
  assert.equal(readFileSync(session, 'utf8'), kept);
});

test(
  'the hosts file is still written 0600',
  { skip: process.platform === 'win32' ? 'Windows keeps no POSIX mode on a file, so 0600 cannot be checked here' : false },
  async (t) => {
    const { file } = config(t, { default: HOST, hosts: { [HOST]: { token: held(TOKEN) }, [OTHER]: { token: held(OTHER_TOKEN) } } });
    chmodSync(file, 0o644);

    const out = await call([HOST], file);

    assert.equal(out.code, 0, out.stderr);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  },
);

test('AS A REAL PROCESS: one line on stderr, nothing on stdout, and the token gone from the file', async (t) => {
  const { dir, file } = config(t, {
    default: HOST,
    hosts: { [HOST]: { token: held(TOKEN), vault: { [SCOPES[0]!]: grant(GRANT_A) } }, [OTHER]: { token: held(OTHER_TOKEN) } },
  });

  const out = await run(dir, [HOST]);

  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stdout, '');
  assert.equal(out.stderr, `signed out of ${HOST} · a token and a keychain access removed · no default host is set now\n`);
  hidden(out);
  assert.deepEqual(readBack(file), { hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
});

test('AS A REAL PROCESS: no host named anywhere is one sentence and exit 1', async (t) => {
  const { dir, file } = config(t, { hosts: { [HOST]: { token: held(TOKEN) } } });
  const before = readFileSync(file, 'utf8');

  const out = await run(dir, []);

  assert.equal(out.code, 1);
  assert.equal(out.stdout, '');
  assert.equal(out.stderr, 'No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or name one as braindog logout <host>.\n');
  hidden(out);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('A SCRATCH FILE A KILLED LOGIN LEFT BEHIND DOES NOT SURVIVE A LOGOUT', async (t) => {
  /* `saveHosts` writes `hosts.json.tmp` and renames it into place, so a run killed between those
     two steps leaves a WHOLE hosts document beside the real one, tokens and all, at 0600. Every
     path through this command that writes consumes it on the way past. The nothing-to-remove path
     returns before the write, and it is the one that says out loud that nothing was left: a
     logout that finishes with a live bearer on the disk while saying there is none is the exact
     shape of failure this command exists to prevent. */
  const { file } = config(t, { hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
  const part = `${file}.tmp`;
  writeFileSync(part, `${JSON.stringify({ hosts: { [HOST]: { token: held(TOKEN) } } }, null, 2)}\n`, { mode: 0o600 });
  assert.ok(existsSync(part), 'the fixture did not leave one');

  const out = await call([HOST], file);

  assert.equal(out.code, 0);
  assert.equal(out.lines.at(-1), `No login to ${HOST} is kept on this machine, so there was nothing to remove.`);
  assert.equal(existsSync(part), false, 'the scratch file outlived the logout that reported nothing to remove');
  hidden(out);

  /* AND THE REAL FILE IS UNTOUCHED, because the other host's login was not what was asked about. */
  assert.deepEqual(readBack(file), { hosts: { [OTHER]: { token: held(OTHER_TOKEN) } } });
});

test('AND A LOGOUT THAT DOES REMOVE SOMETHING CONSUMES IT TOO, which is the path that always did', async (t) => {
  const { file } = config(t, { hosts: { [HOST]: { token: held(TOKEN) } } });
  const part = `${file}.tmp`;
  writeFileSync(part, 'left behind by a killed login\n', { mode: 0o600 });

  const out = await call([HOST], file);

  assert.equal(out.code, 0);
  assert.equal(existsSync(part), false);
  hidden(out);
});
