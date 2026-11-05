/**
 * `braindog keys put` and `braindog keys exec` against a stub host on node:http: a value in from stdin, a value handed
 * to a command's environment, the refusals that come before any request, and nothing secret in anything the CLI
 * writes.
 *
 * THE VALUE AND THE GRANT ARE OBVIOUSLY FAKE, made per run, and long enough that any fragment in a sentence is
 * findable. Most cases run `keys` in process with a fake spawner; the rest start real processes, so what the CLI
 * writes to stdout and stderr is what a terminal or a pipe would get.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hostKey, saveHosts } from '../src/http.ts';
import { machine } from '../src/json.ts';
import { changesHowItRuns, keys, planCommand, quoteForCmd, spawnInherit, variableOf, type KeysIo, type Spawner } from '../src/keys.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const SCOPE = '01JZ8QK3F7R2M9V4XN6TCB5HAE';
const LATER = '2099-01-01T00:00:00.000Z';

const fakeValue = (): string => ['fake-key-for-tests-only-', randomBytes(20).toString('hex')].join('');
const fakeGrant = (): string => ['rec_01TESTTESTTESTTESTTESTTEST.stub-vault-grant-', randomBytes(12).toString('hex')].join('');

type Seen = { path: string; authorization: string | undefined; body: Record<string, unknown> };

/** A stub host holding one key: a deposit keeps it, and a read gives it back. */
async function stub(t: { after: (fn: () => Promise<void>) => void }, held: string) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
    req.on('end', () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      seen.push({ path: req.url ?? '', authorization: req.headers.authorization, body });
      const value =
        req.url === '/api/vault/deposit'
          ? { credential: 'credentials#1', label: body.label, version: 1, rotated: false }
          : { credential: 'credentials#1', label: 'Kiln deploy', value: held };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, value }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

/** A config folder whose hosts file holds one vault grant for the stub. */
function config(t: { after: (fn: () => void) => void }, base: string, grant: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-keys-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = hostKey(base);
  mkdirSync(join(dir, 'braindog'), { recursive: true });
  const file = join(dir, 'braindog', 'hosts.json');
  saveHosts(file, { default: key, hosts: { [key]: { vault: { [SCOPE]: { value: grant, expires: LATER } } } } });
  return { dir, file };
}

type Started = { command: string; args: string[]; vars: Record<string, string | undefined> };

/** An in-process `KeysIo` whose spawner records what it was asked to start, and ends with `code`. */
function io(file: string, o: { stdin?: string | null; code?: number; spawn?: Spawner; env?: Record<string, string | undefined> } = {}) {
  const said: string[] = [];
  const started: Started[] = [];
  const shape: KeysIo = {
    file,
    env: o.env ?? {},
    stdin: () => (o.stdin === undefined ? null : o.stdin),
    say: (line) => void said.push(line),
    headers: async () => ({}),
    spawn:
      o.spawn ??
      (async (command, args, vars) => {
        started.push({ command, args, vars: { ...vars } });
        return o.code ?? 0;
      }),
  };
  return { io: shape, said, started };
}

const nowhere = (texts: string[], secrets: string[]) => {
  for (const text of texts) for (const secret of secrets) assert.ok(!text.includes(secret), 'a secret reached a sentence');
};

test('PUT READS THE VALUE FROM STDIN, sends it once under the vault grant, and says neither', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { file } = config(t, host.base, grant);
  const run = io(file, { stdin: `${value}\n` });

  assert.equal(await keys(['put', 'Kiln deploy', '--opens', 'Deploys kiln.example'], run.io), 0, run.said.join('\n'));
  assert.equal(host.seen.length, 1);
  assert.equal(host.seen[0]?.path, '/api/vault/deposit');
  assert.equal(host.seen[0]?.authorization, `Bearer ${grant}`);
  assert.deepEqual(host.seen[0]?.body, { label: 'Kiln deploy', opens: 'Deploys kiln.example', value });
  assert.deepEqual(run.started, []);
  assert.match(run.said.join('\n'), /^deposited credentials#1 on .+ · version 1$/);
  nowhere(run.said, [value, grant]);
});

test('PUT --json ANSWERS WITH THE ROW IT BECAME AND NEITHER THE VALUE NOR THE GRANT', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { file } = config(t, host.base, grant);
  /* The whole document, not a field of it: a leak this test is looking for would arrive in a key
     nobody thought to assert on. */
  const m = machine(() => {});
  const run = io(file, { stdin: `${value}\n` });
  const shape: KeysIo = { ...run.io, say: (l) => void (run.said.push(l), m.say(l)), answer: m.answer };

  assert.equal(await keys(['put', 'Kiln deploy'], shape), 0, run.said.join('\n'));
  const doc = m.envelope(0) as { ok: true; value: Record<string, unknown> };
  assert.deepEqual(doc, { ok: true, value: { credential: 'credentials#1', host: host.base, version: 1, rotated: false } });
  nowhere([JSON.stringify(doc), ...run.said], [value, grant]);
});

test('PUT WITH NOTHING PIPED IN, OR AN EMPTY PIPE, SENDS NOTHING', async (t) => {
  const host = await stub(t, fakeValue());
  const { file } = config(t, host.base, fakeGrant());
  for (const stdin of [null, '', '\n']) {
    const run = io(file, { stdin });
    assert.equal(await keys(['put', 'Kiln deploy'], run.io), 1);
    assert.equal(run.said.length, 1);
  }
  assert.deepEqual(host.seen, []);
});

test('PUT AT A TERMINAL ASKS FOR THE VALUE WITH ECHO OFF, sends what was typed once, and says nothing of it; stopped, it sends nothing', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { file } = config(t, host.base, grant);
  const asked: string[] = [];
  const run = io(file, { stdin: null });
  const typed: KeysIo = { ...run.io, secret: async (question) => (asked.push(question), value) };
  assert.equal(await keys(['put', 'Kiln deploy'], typed), 0, run.said.join('\n'));
  assert.equal(asked.length, 1);
  assert.ok(!asked[0]!.includes('Kiln deploy'), 'the question named the label');
  assert.deepEqual(host.seen[0]?.body, { label: 'Kiln deploy', value });
  nowhere([...asked, ...run.said], [value, grant]);

  /* CTRL+C AT THE QUESTION, OR ENTER ON NOTHING, SENDS NOTHING. */
  for (const answer of [null, '']) {
    const stopped = io(file, { stdin: null });
    assert.equal(await keys(['put', 'Kiln deploy'], { ...stopped.io, secret: async () => answer }), 1);
    assert.equal(stopped.said.length, 1);
  }
  assert.equal(host.seen.length, 1);

  /* A PIPE IS READ AS IT ALWAYS WAS, AND NOTHING IS ASKED. */
  const piped = io(file, { stdin: `${value}\n` });
  assert.equal(await keys(['put', 'Kiln deploy'], { ...piped.io, secret: async () => assert.fail('asked with a pipe') }), 0, piped.said.join('\n'));
});

test('EXEC HANDS THE VALUE TO THE COMMAND UNDER ONE VARIABLE, exits with its code, and says nothing of it', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { file } = config(t, host.base, grant);
  const env = { BRAINDOG_KEEP: 'kept' };
  const run = io(file, { code: 5, env });

  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'deploy', '--to', 'kiln.example'], run.io), 5, run.said.join('\n'));
  assert.deepEqual(host.seen.map((s) => [s.path, s.authorization, s.body]), [['/api/vault/open', `Bearer ${grant}`, { label: 'Kiln deploy' }]]);
  assert.equal(run.started.length, 1);
  assert.equal(run.started[0]?.command, 'deploy');
  assert.deepEqual(run.started[0]?.args, ['--to', 'kiln.example']);
  assert.deepEqual(Object.keys(run.started[0]?.vars ?? {}).sort(), ['BRAINDOG_KEEP', 'KILN_DEPLOY']);
  assert.ok(run.started[0]?.vars.KILN_DEPLOY === value, 'the command did not get the key');
  assert.deepEqual(env, { BRAINDOG_KEEP: 'kept' }, 'the environment of this process changed');
  assert.deepEqual(run.said, []);

  /* A spoken id is sent as the credential it names, and --as names the variable. Flags after -- are the command's. */
  const spoken = io(file);
  assert.equal(await keys(['exec', 'credentials#1', '--as', 'KILN_TOKEN', '--', 'deploy', '--as', 'x'], spoken.io), 0);
  assert.deepEqual(host.seen[1]?.body, { credential: 'credentials#1' });
  assert.deepEqual(Object.keys(spoken.started[0]?.vars ?? {}), ['KILN_TOKEN']);
  assert.deepEqual(spoken.started[0]?.args, ['--as', 'x']);
  nowhere([...run.said, ...spoken.said], [value, grant]);
});

test('A NAME IS MADE FROM THE LABEL: upper case, other runs to an underscore, no leading digits or underscores', () => {
  assert.equal(variableOf('Kiln deploy'), 'KILN_DEPLOY');
  assert.equal(variableOf('credentials#12'), 'CREDENTIALS_12');
  assert.equal(variableOf('3 stripe-live key'), 'STRIPE_LIVE_KEY');
  assert.equal(variableOf('__42__'), '');
  assert.equal(variableOf('#!'), '');
});

test('EXEC IS REFUSED IN ONE SENTENCE, BEFORE ANY REQUEST, with no command, a bad --as, or no name to make', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());

  const cases: [string[], RegExp][] = [
    [['exec', 'Kiln deploy'], /no command was given/],
    [['exec', 'Kiln deploy', '--'], /no command was given/],
    [['exec', 'Kiln deploy', '--as', 'kiln_token', '--', 'deploy'], /^--as takes an environment variable name/],
    [['exec', 'Kiln deploy', '--as', '1KILN', '--', 'deploy'], /^--as takes an environment variable name/],
    [['exec', 'Kiln deploy', '--as', 'KILN-TOKEN', '--', 'deploy'], /^--as takes an environment variable name/],
    [['exec', 'Kiln deploy', '--as', value, '--', 'deploy'], /^--as takes an environment variable name/],
    [['exec', '1234', '--', 'deploy'], /name one with --as/],
    [['exec', '--', 'deploy'], /^braindog keys exec takes one label/],
    [['exec', 'Kiln deploy', value, '--', 'deploy'], /^braindog keys exec takes one label/],
    [['exec', 'Kiln deploy', '--show', '--', 'deploy'], /^braindog keys exec takes one label/],
    [['get', 'Kiln deploy'], /^braindog keys takes put <label>/],
  ];
  for (const [args, said] of cases) {
    const run = io(file);
    assert.equal(await keys(args, run.io), 1, args.join(' '));
    assert.equal(run.said.length, 1, args.join(' '));
    assert.match(run.said[0] ?? '', said, args.join(' '));
    assert.deepEqual(run.started, []);
    nowhere(run.said, [value]);
  }
  assert.deepEqual(host.seen, []);
});

test('A COMMAND THAT DID NOT START IS ONE SENTENCE, and not the error that could quote it', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());
  const run = io(file, { spawn: () => Promise.reject(new Error(`spawn failed with ${value}`)) });
  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'no-such-command'], run.io), 1);
  assert.deepEqual(run.said, ['The command after -- did not start.']);
});

test('A VALUE PASSED AS AN ARGUMENT IS NEVER SENT, AND NEVER REPEATED', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());
  const run = io(file, { stdin: 'ignored' });
  assert.equal(await keys(['put', 'Kiln deploy', value], run.io), 1);
  assert.equal(await keys(['put', 'Kiln deploy', `--value=${value}`], run.io), 1);
  assert.deepEqual(host.seen, []);
  nowhere(run.said, [value]);
});

/** A `node -e` script that exits 0 when the variable is there at this length, and 9 otherwise. It prints nothing. */
const checks = (name: string, length: number) => `const v = process.env.${name}; process.exit(typeof v === 'string' && v.length === ${length} ? 0 : 9);`;

test('THE REAL SPAWNER STARTS A REAL CHILD with the variable set, and the CLI says nothing', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { file } = config(t, host.base, grant);
  const run = io(file, { spawn: spawnInherit, env: { ...process.env } });

  assert.equal(await keys(['exec', 'Kiln deploy', '--', process.execPath, '-e', checks('KILN_DEPLOY', value.length)], run.io), 0, run.said.join('\n'));
  assert.equal(await keys(['exec', 'Kiln deploy', '--as', 'OTHER', '--', process.execPath, '-e', checks('KILN_DEPLOY', value.length)], run.io), 9);
  assert.deepEqual(run.said, []);
  assert.equal(process.env.KILN_DEPLOY, undefined);
});

/** The real command, with this test's config folder and what it pipes in. */
async function command(dir: string, args: string[], stdin: string) {
  const env: Record<string, string | undefined> = { ...process.env, XDG_CONFIG_HOME: dir, APPDATA: dir };
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_HOST;
  const child = spawn(process.execPath, [MAIN, 'keys', ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  child.stdin.end(stdin);
  const code = await new Promise<number | null>((done) => child.on('close', done));
  return { code, stdout, stderr };
}

test('AS A PROCESS: put prints nothing secret, and exec hands the key to a node child and writes nothing at all', async (t) => {
  const value = fakeValue();
  const grant = fakeGrant();
  const host = await stub(t, value);
  const { dir } = config(t, host.base, grant);

  const put = await command(dir, ['put', 'Kiln deploy', '--opens', 'Deploys kiln.example'], `${value}\n`);
  assert.equal(put.code, 0, put.stderr);
  assert.equal(put.stdout, '');
  assert.equal(host.seen[0]?.body.value, value);
  for (const secret of [value, grant]) assert.ok(!put.stderr.includes(secret), 'a secret reached stderr');

  const exec = await command(dir, ['exec', 'Kiln deploy', '--', process.execPath, '-e', checks('KILN_DEPLOY', value.length)], '');
  assert.equal(exec.code, 0, exec.stderr);
  assert.equal(exec.stdout, '');
  assert.equal(exec.stderr, '');

  const failing = await command(dir, ['exec', 'Kiln deploy', '--', process.execPath, '-e', 'process.exit(5)'], '');
  assert.equal(failing.code, 5, failing.stderr);
  for (const text of [exec.stdout, exec.stderr, failing.stdout, failing.stderr]) for (const secret of [value, grant]) assert.ok(!text.includes(secret), 'a secret was written');
});

/* ── names that change the command, and Windows batch files ───────────── */

const CHANGES = 'That variable name changes how a command runs, so a key is never put in it; name another with --as.';
const BATCH = 'The command after -- is a Windows batch file, and cmd.exe cannot be handed its arguments safely here, so run the program it starts directly.';

test('A KEY IS NEVER PUT WHERE IT CHANGES HOW THE COMMAND RUNS: a named variable, a prefix, or a name made from a label is one sentence before any request', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());
  const named = ['PATH', 'PATHEXT', 'NODE_OPTIONS', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'PYTHONPATH', 'PYTHONSTARTUP', 'RUBYOPT', 'PERL5OPT', 'BASH_ENV', 'ENV', 'COMSPEC', 'SHELL', 'HOME', 'USERPROFILE'];
  const prefixed = ['NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'LD_AUDIT', 'DYLD_FRAMEWORK_PATH'];
  const labels = ['node options', 'Path', 'ld-preload', 'home', 'dyld fallback library path'];
  const cases = [...[...named, ...prefixed].map((name) => ['exec', 'Kiln deploy', '--as', name, '--', 'deploy']), ...labels.map((label) => ['exec', label, '--', 'deploy'])];
  for (const args of cases) {
    const run = io(file);
    assert.equal(await keys(args, run.io), 1, args.join(' '));
    assert.deepEqual(run.said, [CHANGES], args.join(' '));
    assert.deepEqual(run.started, []);
  }
  assert.deepEqual(host.seen, []);
  for (const name of [...named, ...prefixed]) assert.equal(changesHowItRuns(name), true, name);

  /* A name that only contains one of them hands the key over. */
  for (const name of ['NODE', 'PATH_TO_KILN', 'HOMEPAGE_TOKEN', 'MY_NODE_OPTIONS', 'LDAP_TOKEN', 'SHELLY_KEY']) {
    const run = io(file);
    assert.equal(await keys(['exec', 'Kiln deploy', '--as', name, '--', 'deploy'], run.io), 0, name);
    assert.ok(run.started[0]?.vars[name] === value, name);
  }
});

/** One reading of a line by cmd.exe outside quotes: `^x` is `x`, and any other special character is kept and reported. */
function cmdReads(line: string): { out: string; bare: string } {
  let out = '';
  let bare = '';
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (c === '^') {
      out += line.charAt(++i);
      continue;
    }
    if ('&|<>()"%!'.includes(c)) bare += c;
    out += c;
  }
  return { out, bare };
}

/** One argument as the C runtime reads it: backslashes count only before a quote, and an unescaped quote toggles. */
function runtimeReads(token: string): string {
  let out = '';
  let quoted = false;
  for (let i = 0; i < token.length; ) {
    let slashes = 0;
    while (token.charAt(i) === '\\') {
      slashes++;
      i++;
    }
    if (token.charAt(i) === '"') {
      out += '\\'.repeat(Math.floor(slashes / 2));
      if (slashes % 2 === 1) out += '"';
      else quoted = !quoted;
    } else {
      out += '\\'.repeat(slashes) + token.charAt(i);
    }
    i++;
  }
  assert.equal(quoted, false, 'the quotes are balanced');
  return out;
}

const TRICKY = ['a & echo injected', 'b | whoami', 'c ^ d', 'e " f', '%KILN_DEPLOY%', '100%', '!PATH!', 'g\\', 'h\\"i', '', '(x)', '<in >out', 'semi;colon,comma', 'tab\tx', '"&"', '^"|"^', 'two\\\\'];

test('AN ARGUMENT IS ESCAPED FOR cmd.exe so no special character is left bare in either reading, and the program reads it back as written', () => {
  for (const arg of TRICKY) {
    const once = cmdReads(quoteForCmd(arg, true));
    const twice = cmdReads(once.out);
    assert.equal(once.bare + twice.bare, '', arg);
    assert.equal(runtimeReads(twice.out), arg);
    const single = cmdReads(quoteForCmd(arg, false));
    assert.equal(single.bare, '', arg);
    assert.equal(runtimeReads(single.out), arg);
  }
  assert.equal(quoteForCmd('a&b', false), '^"a^&b^"');
  assert.equal(quoteForCmd('a&b', true), '^^^"a^^^&b^^^"');
});

test('ON WINDOWS A COMMAND IS FOUND THROUGH PATH AND PATHEXT, a batch file starts through cmd.exe, and the key is never on its command line', async (t) => {
  const files = new Set(['c:\\tools\\pnpm.cmd', 'c:\\bin\\node.exe', 'c:\\both\\kiln.exe', 'c:\\both\\kiln.cmd', 'c:\\x y\\run.bat']);
  const isFile = (path: string) => files.has(path.toLowerCase());
  const env = { Path: 'C:\\bin;"C:\\tools";C:\\both', PATHEXT: '.COM;.EXE;.BAT;.CMD;.JS', SystemRoot: 'D:\\Win' };
  const win = { platform: 'win32', isFile };
  const shell = 'D:\\Win\\System32\\cmd.exe';

  assert.deepEqual(planCommand('pnpm', ['install'], env, { platform: 'linux', isFile }), { command: 'pnpm', args: ['install'], verbatim: false });
  assert.deepEqual(planCommand('node', ['-v'], env, win), { command: 'C:\\bin\\node.exe', args: ['-v'], verbatim: false });
  assert.deepEqual(planCommand('kiln', [], env, win), { command: 'C:\\both\\kiln.exe', args: [], verbatim: false }, 'PATHEXT order');
  assert.deepEqual(planCommand('pnpm', ['a&b', '%PATH%'], env, win), {
    command: shell,
    args: ['/d', '/v:off', '/s', '/c', `"C:\\tools\\pnpm.cmd ${quoteForCmd('a&b', true)} ${quoteForCmd('%PATH%', true)}"`],
    verbatim: true,
  });
  assert.deepEqual(planCommand('C:\\x y\\run.bat', [], env, win), { command: shell, args: ['/d', '/v:off', '/s', '/c', '"C:\\x^ y\\run.bat"'], verbatim: true });
  assert.deepEqual(planCommand('nowhere', ['x'], env, win), { command: 'nowhere', args: ['x'], verbatim: false });
  assert.equal(planCommand('pnpm', ['one\ntwo'], env, win), BATCH);
  assert.equal(planCommand('pnpm', ['x'], { ...env, 'ODD^': '1' }, win), BATCH);
  assert.deepEqual(planCommand('node', ['one\ntwo'], env, win), { command: 'C:\\bin\\node.exe', args: ['one\ntwo'], verbatim: false }, 'a program is not refused');

  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());
  const started: { command: string; args: string[]; verbatim: boolean | undefined; vars: Record<string, string | undefined> }[] = [];
  const run = io(file, {
    env,
    spawn: async (command, args, vars, verbatim) => {
      started.push({ command, args, verbatim, vars: { ...vars } });
      return 0;
    },
  });
  run.io.platform = 'win32';
  run.io.isFile = isFile;
  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'pnpm', 'deploy', '%KILN_DEPLOY%'], run.io), 0, run.said.join('\n'));
  assert.equal(started[0]?.command, shell);
  assert.equal(started[0]?.verbatim, true);
  assert.ok(started[0]?.vars.KILN_DEPLOY === value, 'the command did not get the key');
  assert.ok(!(started[0]?.args ?? []).join(' ').includes(value), 'the key was on a command line');

  const refused = io(file, { env });
  refused.io.platform = 'win32';
  refused.io.isFile = isFile;
  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'pnpm', 'one\ntwo'], refused.io), 1);
  assert.deepEqual(refused.said, [BATCH]);
  assert.equal(host.seen.length, 1, 'the refusal came before any request');
});

test('ON A REAL WINDOWS MACHINE a .cmd found on PATH starts, every argument arrives as written, and none starts a second command', { skip: process.platform !== 'win32' && 'Windows only' }, async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { dir, file } = config(t, host.base, fakeGrant());
  const bin = join(dir, 'a & b (x86) 100%');
  mkdirSync(bin);
  const out = join(dir, 'argv.json');
  const marker = join(dir, 'injected.txt');
  writeFileSync(
    join(bin, 'argv.mjs'),
    "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.BRAINDOG_TEST_OUT, JSON.stringify({ args: process.argv.slice(2), length: (process.env.KILN_DEPLOY ?? '').length }));\n",
  );
  /* npm's shape, and cmd-shim's, whose `%*` is inside a parenthesised block. */
  writeFileSync(join(bin, 'kiln-npm.cmd'), ['@ECHO off', 'SETLOCAL', `"${process.execPath}" "%~dp0\\argv.mjs" %*`, ''].join('\r\n'));
  writeFileSync(join(bin, 'kiln-shim.cmd'), ['@SETLOCAL', `@IF EXIST "${process.execPath}" (`, `  "${process.execPath}" "%~dp0\\argv.mjs" %*`, ') ELSE (', '  node "%~dp0\\argv.mjs" %*', ')', ''].join('\r\n'));

  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const env = { ...process.env, [pathKey]: `${bin};${process.env[pathKey] ?? ''}`, BRAINDOG_TEST_OUT: out };
  /* The shapes that break out of a naive quote, or of escaping done once: each one wrote the marker through both, and
     through this command's twice-escaped line wrote nothing and arrived as written. The marker's path is left
     unquoted, because a quote after the break is what kept the first versions of these from injecting anything. */
  const injections = [`z" & echo injected> ${marker} & rem "`, `" & echo injected> ${marker} & rem "`, `^" & echo injected> ${marker} & rem ^"`, `\\" & echo injected> ${marker} & rem "`, `" | echo injected> ${marker} | rem "`];
  const args = [...TRICKY, ...injections, `x & echo injected> "${marker}"`, `< "${marker}" > "${marker}"`];
  for (const shim of ['kiln-npm', 'kiln-shim']) {
    rmSync(out, { force: true });
    const run = io(file, { spawn: spawnInherit, env });
    assert.equal(await keys(['exec', 'Kiln deploy', '--', shim, ...args], run.io), 0, `${shim}: ${run.said.join('\n')}`);
    const got = JSON.parse(readFileSync(out, 'utf8')) as { args: string[]; length: number };
    assert.deepEqual(got.args, args, shim);
    assert.equal(got.length, value.length, `${shim}: the command did not get the key`);
    assert.equal(existsSync(marker), false, `${shim}: an argument started a second command`);
    assert.deepEqual(run.said, []);
  }
});

test('EXEC HANDS ON THE ONE KEY AND NOT THE WAY INTO THE RECORD: a login or a job bearer in this shell stays here', async (t) => {
  const value = fakeValue();
  const host = await stub(t, value);
  const { file } = config(t, host.base, fakeGrant());
  const env = { PLAIN: 'kept', BRAINDOG_TOKEN: 'a-login-in-this-shell', BRAINDOG_JOB_BEARER: 'a-job-bearer-in-this-shell' };
  const run = io(file, { env });
  assert.equal(await keys(['exec', 'Kiln deploy', '--', 'deploy'], run.io), 0, run.said.join('\n'));
  const vars = run.started[0]?.vars ?? {};
  assert.equal(vars.KILN_DEPLOY, value);
  assert.equal(vars.PLAIN, 'kept');
  assert.equal(vars.BRAINDOG_TOKEN, undefined);
  assert.equal(vars.BRAINDOG_JOB_BEARER, undefined);
});
