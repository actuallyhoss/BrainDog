/**
 * `braindog mcp` as Claude Code runs it: a child process, JSON-RPC on its stdin and stdout, and a host
 * answering `/api` over a real socket.
 *
 * THE HOST IS A STUB ON node:http, NOT THE SELF-HOST, because apps never import apps (the graph gate).
 * What is under test is the command: its framing, its deadline, its drain, and what it prints. What
 * the record answers is for the self-host's own tests.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INSTRUCTIONS } from '@braindog/mcp/rpc';
import { UNREACHABLE_FIX } from '../src/surface.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-bearer-never-printed-4c1d';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-cli-'));
const children: ChildProcessWithoutNullStreams[] = [];
/** Everything any child wrote on either stream, for the last test, which says none of it holds the token. */
const printed: string[] = [];
after(() => {
  for (const child of children) child.kill();
  rmSync(scratch, { recursive: true, force: true });
});

/* ── a host ────────────────────────────────────────────────────────────── */

type Seen = { method: string; query: URLSearchParams; headers: IncomingHttpHeaders };
const ROWS = { rows: [{ seq: 1, fields: { what: 'Rent' } }], matched: 1, cursor: null };

/** `list` answers at once, after 300 ms for `late`, or never for `hangs`. Everything else is refused. */
async function stubHost(t: { after: (fn: () => Promise<void>) => void }) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const method = url.pathname.replace(/^\/api\//, '');
    seen.push({ method, query: url.searchParams, headers: req.headers });
    const answer = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const register = url.searchParams.get('register');
    if (method !== 'list') return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub answers list, and not ${method}.` } });
    if (register === 'hangs') return;
    if (register === 'late') return void setTimeout(() => answer({ ok: true, value: ROWS }), 300);
    answer({ ok: true, value: ROWS });
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

/* ── a command ─────────────────────────────────────────────────────────── */

/* The JSON-RPC error's number is spelt through Record<'code', number>, as in rpc.ts, so the only `code`
   keys in source are refusal codes. */
type Rpc = { id: number | null; result?: any; error?: { message: string } & Record<'code', number> };

/** The machine's own BrainDog settings stay out: an empty config folder, and no BRAINDOG_ variable. */
function envFor(extra: Record<string, string>, config = join(scratch, 'empty')): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config };
  for (const name of Object.keys(env)) if (name.startsWith('BRAINDOG_')) delete env[name];
  return { ...env, ...extra };
}

function launch(extra: Record<string, string>, options: { args?: string[]; config?: string } = {}) {
  const child = spawn(process.execPath, ['src/main.ts', ...(options.args ?? ['mcp', '--agent', 'claude'])], {
    cwd: APP,
    env: envFor(extra, options.config),
  });
  children.push(child);
  let out = '';
  let err = '';
  let buffer = '';
  const waiting = new Map<number | null, (reply: Rpc) => void>();
  const lines: string[] = [];

  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    out += chunk;
    buffer += chunk;
    let cut: number;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      lines.push(line);
      const reply = JSON.parse(line) as Rpc;
      waiting.get(reply.id)?.(reply);
    }
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
  /* `close` rather than `exit`: it waits for both streams, so nothing written is missed. */
  const closed = new Promise<number | null>((done) => child.on('close', (code) => done(code)));

  let n = 0;
  const expect = (id: number | null) => new Promise<Rpc>((done) => waiting.set(id, done));
  return {
    lines,
    ask(method: string, params?: Record<string, unknown>): Promise<Rpc> {
      const id = ++n;
      const reply = expect(id);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`);
      return reply;
    },
    /** A raw line, and the reply that carries a null id. */
    raw(line: string): Promise<Rpc> {
      const reply = expect(null);
      child.stdin.write(`${line}\n`);
      return reply;
    },
    async end() {
      child.stdin.end();
      const code = await closed;
      printed.push(out, err);
      return { code, out, err };
    },
  };
}

const said = (reply: Rpc) => JSON.parse(reply.result.content[0].text) as Record<string, unknown>;

/* ── the protocol ──────────────────────────────────────────────────────── */

test('initialize and tools/list answer without touching the host, and the list is the fourteen', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  const init = await s.ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'braindog');
  assert.match(init.result.instructions, /^BrainDog is one person's record/);

  const listed = await s.ask('tools/list');
  assert.equal(listed.result.tools.length, 14);
  for (const name of ['record_index', 'context', 'list', 'handoff', 'meet']) assert.ok(listed.result.tools.some((x: { name: string }) => x.name === name), name);

  const { code, err } = await s.end();
  assert.equal(code, 0, err);
  assert.equal(host.seen.length, 0, 'the handshake reached the host, and it must answer when the host is down');
  for (const line of s.lines) assert.equal(JSON.parse(line).jsonrpc, '2.0', `stdout carried something other than the protocol: ${line}`);
});

test('A LIST CALL goes to /api/list with the bearer and the session headers, and comes back as the tool result', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  const reply = await s.ask('tools/call', { name: 'list', arguments: { register: 'obligations', where: { field: 'state', is: 'open' }, limit: 5 } });
  assert.notEqual(reply.result.isError, true, reply.result.content[0].text);
  assert.deepEqual(said(reply), ROWS);

  const hit = host.seen.find((x) => x.method === 'list');
  assert.ok(hit, 'the host was never asked');
  assert.equal(hit.query.get('register'), 'obligations');
  assert.deepEqual(JSON.parse(hit.query.get('where') ?? 'null'), { field: 'state', is: 'open' });
  assert.equal(hit.query.get('limit'), '5');
  assert.equal(hit.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(hit.headers['x-braindog-agent'], 'claude');
  assert.match(String(hit.headers['x-braindog-cwd']), /cli$/);

  assert.equal((await s.end()).code, 0);
});

test('the token comes from the hosts file when the environment has none', async (t) => {
  const host = await stubHost(t);
  const config = join(scratch, 'signed-in');
  mkdirSync(join(config, 'braindog'), { recursive: true });
  writeFileSync(
    join(config, 'braindog', 'hosts.json'),
    JSON.stringify({ default: host.base, hosts: { [host.base]: { token: { value: TOKEN, expires: '2099-01-01T00:00:00Z', label: 'test' } } } }),
  );
  const s = launch({}, { config });
  await s.ask('tools/call', { name: 'list', arguments: { register: 'obligations' } });
  assert.equal(host.seen[0]?.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal((await s.end()).code, 0);
});

test('A LINE THAT IS NOT JSON is a parse error, and the server keeps serving', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const broken = await s.raw('{"jsonrpc":"2.0","id":');
  assert.equal(broken.error?.code, -32700);
  assert.ok((await s.ask('ping')).result);
  assert.equal((await s.end()).code, 0);
});

/* ── when the host does not answer ─────────────────────────────────────── */

test('A HOST THAT DOES NOT ANSWER gets the unreachable sentence once the budget runs out', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN, BRAINDOG_TIMEOUT_MS: '400' });

  const started = Date.now();
  const reply = await s.ask('tools/call', { name: 'list', arguments: { register: 'hangs' } });
  const waited = Date.now() - started;
  assert.ok(waited >= 350, `it gave up after ${waited} ms, before its budget`);
  assert.equal(reply.result.isError, true);
  assert.deepEqual(said(reply), { code: 'UNREACHABLE', fix: UNREACHABLE_FIX });

  /* And while one call waits, the others are not held behind it. */
  const slow = s.ask('tools/call', { name: 'list', arguments: { register: 'hangs' } });
  assert.ok((await s.ask('ping')).result, 'a ping waited behind a hung call');
  await slow;
  assert.equal((await s.end()).code, 0);
});

test('a host with nothing listening gets the same sentence', async () => {
  const closed = createServer();
  await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done));
  const { port } = closed.address() as AddressInfo;
  await new Promise<void>((done) => closed.close(() => done()));

  const s = launch({ BRAINDOG_HOST: `http://127.0.0.1:${port}`, BRAINDOG_TOKEN: TOKEN });
  const reply = await s.ask('tools/call', { name: 'record_index', arguments: {} });
  assert.equal(said(reply).fix, UNREACHABLE_FIX);
  assert.equal((await s.end()).code, 0);
});

/* ── the end of input ──────────────────────────────────────────────────── */

test('WHEN STDIN ENDS, the calls in flight are answered before the process exits', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const late = s.ask('tools/call', { name: 'list', arguments: { register: 'late' } });
  const ping = s.ask('ping');
  const { code, err } = await s.end();
  assert.equal(code, 0, err);
  assert.deepEqual(said(await late), ROWS);
  assert.ok((await ping).result);
});

/* ── when it cannot start ──────────────────────────────────────────────── */

test('A STARTUP FAILURE IS ONE LINE ON STDERR, nothing on stdout, and exit 1', async () => {
  const expired = join(scratch, 'expired');
  mkdirSync(join(expired, 'braindog'), { recursive: true });
  writeFileSync(
    join(expired, 'braindog', 'hosts.json'),
    JSON.stringify({ default: 'https://a.example', hosts: { 'https://a.example': { token: { value: TOKEN, expires: '2020-01-01T00:00:00Z', label: 'test' } } } }),
  );
  const cases: [Record<string, string>, { args?: string[]; config?: string }, RegExp][] = [
    [{}, {}, /^No BrainDog host is set\./],
    [{}, { config: expired }, /^The login to https:\/\/a\.example expired on 2020-01-01\. Run braindog login https:\/\/a\.example\.$/],
    [{ BRAINDOG_HOST: 'http://a.example', BRAINDOG_TOKEN: TOKEN }, {}, /^http:\/\/a\.example is http, not https\./],
    [{ BRAINDOG_HOST: 'https://a.example' }, { args: ['mcp', TOKEN] }, /^braindog mcp takes --agent and --host, and nothing else\./],
    [{ BRAINDOG_HOST: 'https://a.example' }, { args: ['mcp', '--agent', 'robot'] }, /^--agent is one of claude, codex, cursor, other\.$/],
  ];
  for (const [env, options, pattern] of cases) {
    const { code, out, err } = await launch(env, options).end();
    assert.equal(code, 1, err);
    assert.equal(out, '', 'a startup failure wrote to stdout');
    assert.equal(err.trimEnd().split('\n').length, 1, `more than one line: ${err}`);
    assert.match(err.trim(), pattern);
  }
});

/* ── the other commands ────────────────────────────────────────────────── */

test('INIT AND SERVE ARE THE SELF-HOST\'S, spawned with their arguments and their exit code', () => {
  const entry = join(scratch, 'selfhost.mjs');
  writeFileSync(entry, 'process.stderr.write(JSON.stringify(process.argv.slice(2))); process.exit(7);\n');
  for (const args of [['init', 'the-studio', '--owner', 'ada@example.com'], ['serve']]) {
    const r = spawnSync(process.execPath, ['src/main.ts', ...args], { cwd: APP, env: envFor({ BRAINDOG_SELFHOST: entry }), encoding: 'utf8' });
    assert.equal(r.status, 7);
    assert.deepEqual(JSON.parse(r.stderr), args);
    printed.push(r.stdout, r.stderr);
  }

  const missing = spawnSync(process.execPath, ['src/main.ts', 'init', 'x'], {
    cwd: APP,
    env: envFor({ BRAINDOG_SELFHOST: join(scratch, 'nowhere.mjs') }),
    encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^braindog init needs the self-host\. Set BRAINDOG_SELFHOST to its entry file\.$/m);
});

test('a command from a later step says so, and an unknown one is not echoed unless it is a plain word', () => {
  const run = (...args: string[]) => {
    const r = spawnSync(process.execPath, ['src/main.ts', ...args], { cwd: APP, env: envFor({}), encoding: 'utf8' });
    printed.push(r.stdout, r.stderr);
    return r;
  };
  /* `login` is built now (`login.test.ts`), and run here it would reach a real host. */
  const later = run('logout');
  assert.equal(later.status, 1);
  assert.equal(later.stderr.trim(), 'braindog logout is not built yet.');

  const typo = run('mpc');
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /^braindog has no command called mpc\./);

  const pasted = run(TOKEN);
  assert.equal(pasted.status, 1);
  assert.match(pasted.stderr, /^braindog has no such command\./);

  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^braindog login <host> \[--vault <project\|\*>\]\n[\s\S]*^braindog keys put <label>[\s\S]*^braindog keys exec <label[\s\S]*^braindog skills sync \[--host <host>\] \[--dry-run\]\n[\s\S]*^braindog tools scan \[--host <host>\] \[--dry-run\]\n[\s\S]*^braindog tools write \[--scope user\|project\] \[--dry-run\]\n[\s\S]*^braindog mcp /m);
  assert.doesNotMatch(help.stdout, /Not built yet: .*(?:skills|tools)/);

  /* EVERY COMMAND THE SERVER'S INSTRUCTIONS NAME IS ONE THIS HELP LISTS. They told every agent to run
     `braindog key add`, which was never a command, so the one way to deposit a key was a typo. */
  const named = [...INSTRUCTIONS.matchAll(/braindog ([a-z]+(?: [a-z]+)?)/g)].map((m) => m[1]!);
  assert.ok(named.length > 0, 'the instructions name no command, so this proves nothing');
  for (const command of named) assert.match(help.stdout, new RegExp(`^braindog ${command}(?![a-z])`, 'm'), command);
});

/* ── last, over everything above ───────────────────────────────────────── */

test('THE TOKEN WAS NEVER PRINTED, on stdout or stderr, by any run above', () => {
  assert.ok(printed.length > 20, 'the runs above printed nothing, so this proves nothing');
  const all = printed.join('\n');
  assert.equal(all.includes(TOKEN), false, 'the token was printed');
  assert.equal(all.includes('stub-bearer-never-printed'), false, 'the secret half of the token was printed');
});
