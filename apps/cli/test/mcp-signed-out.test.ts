/**
 * `braindog mcp` on a machine with no login: the server starts, and every call says how to sign in.
 *
 * MEASURED BEFORE THIS, with Claude Code 2.1.280: with no host set,
 * or a login past its expiry, `target` threw before the server started, the process exited 1 before `initialize`, and
 * `/mcp` showed `braindog failed`. The model then had no BrainDog tool at all and nothing to tell the person, and a
 * session open since before the lapse was not helped by the start hook's one line either. So the server now answers
 * the handshake and refuses each call, as `UNREACHABLE` already does for a host that is down, with the command that
 * signs this machine in written out whole: `braindog` may be on no PATH, and a checkout runs `node apps\cli\src\main.ts`.
 *
 * NO REAL PROFILE AND NO REAL HOSTS FILE IS READ: the config folder is a scratch one, and every `BRAINDOG_` variable
 * of the machine running the test is taken out.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOOLS } from '@braindog/mcp';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
/* The path as the server entry `install` writes names it, which is the file the person's session already runs. */
const SIGN_IN = `node "${MAIN.replaceAll('\\', '/')}" login`;
const TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-bearer-never-printed-9e2a';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-mcp-signed-out-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

type Reply = {
  id: number;
  result?: { isError?: boolean; content: { text: string }[]; structuredContent?: { code?: string; fix?: string }; protocolVersion?: string; tools?: unknown[] };
  error?: unknown;
};

/**
 * The server, sent every line at once with its input then closed, and what it said on each stream.
 *
 * ALL AT ONCE AND THEN END OF INPUT, because the failure this file is about is a server that is gone before the first
 * line is read: a test that waited for each reply would hang on it rather than fail.
 */
function serve(config: string, lines: object[]): Promise<{ code: number | null; replies: Reply[]; err: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config, APPDATA: config };
  for (const name of Object.keys(env)) if (name.startsWith('BRAINDOG_')) delete env[name];
  const child = spawn(process.execPath, ['--experimental-strip-types', MAIN, 'mcp', '--agent', 'claude'], { env, cwd: scratch });
  let out = '';
  let err = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
  child.stdin.on('error', () => {});
  child.stdin.end(lines.map((l) => `${JSON.stringify({ jsonrpc: '2.0', ...l })}\n`).join(''));
  const timer = setTimeout(() => child.kill(), 15_000);
  return new Promise((done) =>
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, replies: out.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Reply), err });
    }),
  );
}

const HELLO = { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } };
const LIST = { id: 2, method: 'tools/list' };
/* Enough to reach a method for the four tools an agent calls first; what the rest are called with is below. */
const FIRST: [string, Record<string, unknown>][] = [
  ['context', {}],
  ['list', { register: 'tasks' }],
  ['get', { spoken: 'tasks#1' }],
  ['search', { q: 'rent' }],
];

async function run(config: string) {
  const calls = [...FIRST, ...TOOLS.map((t): [string, Record<string, unknown>] => [t.name, {}])];
  const ran = await serve(config, [HELLO, LIST, ...calls.map(([name, args], i) => ({ id: 10 + i, method: 'tools/call', params: { name, arguments: args } }))]);
  const by = new Map(ran.replies.map((r) => [r.id, r]));
  return { ...ran, by, calls };
}

/** The refusal whole, which is `structuredContent`, and the text a model reads first, which says its fix too. */
const refusal = (reply: Reply | undefined) => ({ ...reply?.result?.structuredContent, text: reply?.result?.content[0]?.text ?? '' });

test('with no host at all, the server answers the handshake and every call says how to sign in', async () => {
  const config = join(scratch, 'empty');
  mkdirSync(config, { recursive: true });
  const { code, by, calls, err } = await run(config);

  assert.equal(by.get(1)?.result?.protocolVersion, '2025-06-18', `initialize was not answered. stderr: ${err}`);
  assert.equal(by.get(2)?.result?.tools?.length, TOOLS.length, 'tools/list did not list every tool');
  for (const [i, [name]] of calls.entries()) {
    const reply = by.get(10 + i);
    assert.equal(reply?.result?.isError, true, `${name} was not refused: ${JSON.stringify(reply)}`);
  }
  for (const [i, [name]] of FIRST.entries()) {
    const said = refusal(by.get(10 + i));
    assert.equal(said.code, 'UNAUTHORIZED', name);
    assert.ok(said.fix?.includes(`${SIGN_IN} https://app.brain.dog/<slug>`), `${name}: ${said.fix}`);
    assert.ok(said.text.includes(`${SIGN_IN} https://app.brain.dog/<slug>`), `${name}: the text says ${said.text}`);
  }
  /* ONE LINE ON STDERR, the reason, for whoever reads the server's log. */
  assert.match(err.trim(), /^No BrainDog host is set\./);
  assert.equal(err.trimEnd().split('\n').length, 1, err);
  /* Exit 1 at the end of input: the record was never reached, which is what `48 §4.4` spends 1 on. */
  assert.equal(code, 1);
});

test('with a login past its expiry, every call names the host, the day it lapsed, and the command for that host', async () => {
  const config = join(scratch, 'expired');
  mkdirSync(join(config, 'braindog'), { recursive: true });
  writeFileSync(
    join(config, 'braindog', 'hosts.json'),
    JSON.stringify({ default: 'https://a.example', hosts: { 'https://a.example': { token: { value: TOKEN, expires: '2020-01-01T00:00:00Z', label: 'test' } } } }),
  );
  const { by, err, replies } = await run(config);

  assert.equal(by.get(1)?.result?.protocolVersion, '2025-06-18', `initialize was not answered. stderr: ${err}`);
  for (const [i, [name]] of FIRST.entries()) {
    const said = refusal(by.get(10 + i));
    assert.equal(said.code, 'UNAUTHORIZED', name);
    assert.ok(said.fix?.includes('2020-01-01'), `${name}: ${said.fix}`);
    assert.ok(said.fix?.includes(`${SIGN_IN} https://a.example`), `${name}: ${said.fix}`);
    assert.ok(said.text.includes(`${SIGN_IN} https://a.example`), `${name}: the text says ${said.text}`);
  }
  assert.ok(!JSON.stringify(replies).includes(TOKEN) && !err.includes(TOKEN), 'the expired token was printed');
});

test('a refused BRAINDOG_TOKEN is named as the one refused, since a new login would change nothing', async () => {
  const { endedFix, tokenFromEnv } = await import('../src/bridge.ts');
  const host = 'https://app.brain.dog/acme';
  assert.equal(tokenFromEnv({ BRAINDOG_TOKEN: 'abc' }, 'abc'), true);
  assert.equal(tokenFromEnv({ BRAINDOG_TOKEN: 'abc' }, 'from-the-file'), false);
  assert.equal(tokenFromEnv({}, 'from-the-file'), false);
  assert.equal(tokenFromEnv({ BRAINDOG_TOKEN: '' }, undefined), false);
  const fromEnv = endedFix(host, true);
  assert.match(fromEnv, /BRAINDOG_TOKEN/u);
  assert.match(fromEnv, /unset it/u);
  assert.doesNotMatch(fromEnv, /abc/u);
  assert.match(endedFix(host), /^The login to https:\/\/app\.brain\.dog\/acme ended/u);
});
