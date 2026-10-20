/**
 * The start work from the MCP server (`session-start.ts`): once a day for a machine, a folder and an app, after the
 * first `initialize` is answered, its lines on stderr and never on the protocol's stdout; and the start hook still
 * doing it at every start, as before.
 *
 * THE HOST IS A STUB ON node:http, as `hooks.test.ts` and `skills.test.ts` build theirs. Every folder is a temporary one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { hookStart } from '../src/hooks.ts';
import type { Target } from '../src/http.ts';
import type { Agent, Position } from '../src/position.ts';
import { afterHello, dayOf, markStarted, startedPath, startedToday, startFromServer, startTag, startTagPath, startWork, START_WORK_MS } from '../src/session-start.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-start-work-only-7b3e'].join('.');
const MACHINE = 'test-machine';
const NOON = Date.parse('2026-10-14T12:00:00');

type After = { after: (fn: () => void | Promise<void>) => void };
type Seen = { method: string; headers: IncomingHttpHeaders };

const SKILL = { name: 'kiln-release', trigger: 'When a kiln build ships', body: '# Release\n\nTag it, then push.\n' };
const CONTEXT = {
  session: { spoken: 'S9', state: 'active' },
  project: null,
  ambiguous: [],
  handoff: null,
  live: { same_repo: [], elsewhere: [] },
  waiting: [],
  people: [],
  faded: 0,
  next: 'Start with the task in front of you.',
  registers: [{ id: 'skills', name: 'Skills', rows: [], inherited: [{ spoken: 'skills#1', version: 1, scope: 'global', state: 'active', name: SKILL.name, trigger: SKILL.trigger, rev: 1 }], truncated: false }],
};

/** A record with one skill everywhere: `context`, `attach` and `get` on `/api`, and `initialize` on `/mcp`. */
async function stubHost(t: After) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (url.pathname === '/mcp') {
        seen.push({ method: `mcp:${String(body.method)}`, headers: req.headers });
        if (body.method === 'initialize')
          return answer({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'braindog', version: '0.0.0' } } });
        res.writeHead(202);
        return res.end();
      }
      const method = url.pathname.replace(/^\/api\//, '');
      seen.push({ method, headers: req.headers });
      if (method === 'context') return answer({ ok: true, value: CONTEXT });
      if (method === 'attach') return answer({ ok: true, value: { session: { id: 'e_9', seq: 9, state: 'active', version: 1, fields: {} }, spoken: 'S9', resumed: false, project: null, context: CONTEXT } });
      if (method === 'get')
        return answer({ ok: true, value: { id: 'e_1', register: 'skills', seq: 1, state: 'active', version: 1, fields: { kind: 'skill', rev: 1, managed: true, ...SKILL } } });
      if (method === 'heard') return answer({ ok: true, value: { marked: true } });
      answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
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
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

/** A home folder, a Claude config folder under it, and a work folder per name. */
function place(t: After) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-start-work-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  const configDir = join(home, '.claude');
  mkdirSync(home, { recursive: true });
  const folder = (name: string) => {
    const at = join(dir, name);
    mkdirSync(at, { recursive: true });
    return at;
  };
  const skillFile = join(configDir, 'skills', SKILL.name, 'SKILL.md');
  return { dir, home, configDir, folder, skillFile };
}

const positionAt = (cwd: string): Position => ({ cwd, repo: null, remote: null, host: MACHINE, branch: null, head: null });

/* ── once a day ────────────────────────────────────────────────────────── */

test('STARTED TODAY is kept per machine, folder and app, for the day it was marked, in a file holding no key', (t) => {
  const p = place(t);
  const kiln = p.folder('kiln');
  const atlas = p.folder('atlas');
  assert.equal(startedToday(p.home, MACHINE, kiln, 'codex', NOON), false, 'nothing is marked on a fresh machine');

  markStarted(p.home, MACHINE, kiln, 'codex', NOON);
  assert.equal(startedToday(p.home, MACHINE, kiln, 'codex', NOON + 3_600_000), true, 'the same day, the same three');
  assert.equal(startedToday(p.home, MACHINE, `${kiln}/`, 'codex', NOON), true, 'the folder is compared as a resolved path');
  assert.equal(startedToday(p.home, MACHINE, atlas, 'codex', NOON), false, 'another folder');
  assert.equal(startedToday(p.home, MACHINE, kiln, 'cursor', NOON), false, 'another app');
  assert.equal(startedToday(p.home, 'other-machine', kiln, 'codex', NOON), false, 'another machine');
  assert.equal(startedToday(p.home, MACHINE, kiln, 'codex', NOON + 86_400_000), false, 'the next day');

  markStarted(p.home, MACHINE, atlas, 'cursor', NOON);
  markStarted(p.home, MACHINE, kiln, 'codex', NOON + 86_400_000);
  const file = JSON.parse(readFileSync(startedPath(p.home), 'utf8')) as { started: { day: string }[] };
  assert.deepEqual(
    file.started.map((s) => s.day),
    [dayOf(NOON + 86_400_000)],
    "only the day's own starts are kept, so the file stays a few lines",
  );
  assert.deepEqual(readdirSync(join(p.home, '.braindog')), ['started.json'], 'written beside and renamed over, with nothing left beside it');
  assert.equal(readFileSync(startedPath(p.home), 'utf8').includes('stub-bearer'), false);
});

test('A FILE THAT IS NOT ONE THIS COMMAND WROTE reads as nothing started, and is written over at the next mark', (t) => {
  const p = place(t);
  const kiln = p.folder('kiln');
  mkdirSync(join(p.home, '.braindog'), { recursive: true });
  for (const text of ['not json', '[]', '{"started": [{"machine": 1}]}']) {
    rmSync(startedPath(p.home), { force: true });
    writeFileSync(startedPath(p.home), text);
    assert.equal(startedToday(p.home, MACHINE, kiln, 'codex', NOON), false, text);
  }
  markStarted(p.home, MACHINE, kiln, 'codex', NOON);
  assert.equal(startedToday(p.home, MACHINE, kiln, 'codex', NOON), true);
});

/* ── from the MCP server ───────────────────────────────────────────────── */

/** `startFromServer` as `mcp()` calls it, with what it said kept and the clock at `now`. */
function fromServer(p: ReturnType<typeof place>, base: string, cwd: string, agent: Agent | undefined, now = NOON) {
  const said: string[] = [];
  const to: Target = { key: base, base, token: TOKEN };
  const env = { XDG_CONFIG_HOME: join(p.dir, 'config'), CLAUDE_CONFIG_DIR: p.configDir };
  const outcome = startFromServer({
    io: { env, home: p.home },
    to,
    where: Promise.resolve(positionAt(cwd)),
    agent,
    headers: async () => ({ 'x-braindog-cwd': cwd, 'x-braindog-host': MACHINE, ...(agent === undefined ? {} : { 'x-braindog-agent': agent }) }),
    ms: 8_000,
    say: (l) => void said.push(l),
    now: () => now,
  });
  return { outcome, said };
}

test('THE SERVER DOES THE START WORK ONCE A DAY for a machine, a folder and an app: a second start that day does nothing', async (t) => {
  const p = place(t);
  const h = await stubHost(t);
  const kiln = p.folder('kiln');

  const first = fromServer(p, h.base, kiln, 'codex');
  assert.equal(await first.outcome, 'ran');
  assert.ok(existsSync(p.skillFile), "the record's skill is on disk");
  assert.deepEqual(first.said, ['BrainDog at the start of this session: skills sync: 1 change.']);
  assert.deepEqual(h.seen.map((s) => s.method), ['context', 'get']);
  /* The same run as the session's: every request carries the headers the server sends with its own. */
  for (const s of h.seen) {
    assert.equal(s.headers['x-braindog-cwd'], kiln);
    assert.equal(s.headers['x-braindog-agent'], 'codex');
    assert.equal(s.headers.authorization, `Bearer ${TOKEN}`);
  }
  assert.equal(startedToday(p.home, MACHINE, kiln, 'codex', NOON), true);

  rmSync(p.skillFile);
  const again = fromServer(p, h.base, kiln, 'codex', NOON + 3_600_000);
  assert.equal(await again.outcome, 'already');
  assert.deepEqual(again.said, [], 'nothing is said');
  assert.equal(h.seen.length, 2, 'no request at all');
  assert.equal(existsSync(p.skillFile), false, 'and nothing is written');
});

test('ANOTHER FOLDER, ANOTHER APP OR THE NEXT DAY runs the start work again', async (t) => {
  const p = place(t);
  const h = await stubHost(t);
  const kiln = p.folder('kiln');
  const atlas = p.folder('atlas');
  assert.equal(await fromServer(p, h.base, kiln, 'codex').outcome, 'ran');
  assert.equal(await fromServer(p, h.base, atlas, 'codex').outcome, 'ran', 'another folder');
  assert.equal(await fromServer(p, h.base, kiln, 'cursor').outcome, 'ran', 'another app');
  assert.equal(await fromServer(p, h.base, kiln, undefined).outcome, 'ran', 'an app with no --agent is other');
  assert.equal(await fromServer(p, h.base, kiln, 'other').outcome, 'already', 'other, named or not, is one app');
  assert.equal(await fromServer(p, h.base, kiln, 'codex', NOON + 86_400_000).outcome, 'ran', 'the next day');
  assert.equal(h.seen.filter((s) => s.method === 'context').length, 5);
});

test("CLAUDE CODE'S SERVER LEAVES THE WORK TO ITS START HOOK, which does it at every start", async (t) => {
  const p = place(t);
  const h = await stubHost(t);
  const kiln = p.folder('kiln');
  assert.equal(await fromServer(p, h.base, kiln, 'claude').outcome, 'hooked');
  assert.equal(h.seen.length, 0);
  assert.equal(existsSync(startedPath(p.home)), false);
});

test('A HOST THAT IS AWAY is one line, marks nothing, and leaves the work to the next start', async (t) => {
  const p = place(t);
  const closed = createServer();
  await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done));
  const port = (closed.address() as AddressInfo).port;
  await new Promise<void>((done) => closed.close(() => done()));
  const kiln = p.folder('kiln');
  const gone = fromServer(p, `http://127.0.0.1:${String(port)}`, kiln, 'codex');
  assert.equal(await gone.outcome, 'away');
  assert.equal(gone.said.length, 1);
  assert.match(gone.said[0] ?? '', /^BrainDog did not answer within 8 seconds, so the start work waits for the next session\.$/);
  assert.equal(startedToday(p.home, MACHINE, kiln, 'codex', NOON), false);

  const h = await stubHost(t);
  assert.equal(await fromServer(p, h.base, kiln, 'codex').outcome, 'ran', 'the next start, with the host back');
});

test('A FAILURE NEVER THROWS: it is one fixed line, and quotes nothing', async (t) => {
  const p = place(t);
  const said: string[] = [];
  const outcome = await startFromServer({
    io: { env: {}, home: p.home },
    to: { key: 'x', base: 'http://127.0.0.1:1', token: TOKEN },
    where: Promise.reject(new Error(`a git error quoting ${TOKEN}`)),
    agent: 'cursor',
    headers: async () => ({}),
    ms: 8_000,
    say: (l) => void said.push(l),
  });
  assert.equal(outcome, 'failed');
  assert.deepEqual(said, ['BrainDog could not do the start work for this session, and the server goes on.']);
  assert.ok(START_WORK_MS < 8_000);
});

/* ── the start hook, as before ─────────────────────────────────────────── */

test('THE START HOOK DOES THE WORK WHENEVER WHAT IT READS MOVED, whatever the server marked for the day', async (t) => {
  const p = place(t);
  const h = await stubHost(t);
  const kiln = p.folder('kiln');
  const env = { XDG_CONFIG_HOME: join(p.dir, 'config'), BRAINDOG_HOST: h.base, BRAINDOG_TOKEN: TOKEN, CLAUDE_CONFIG_DIR: p.configDir };
  markStarted(p.home, MACHINE, kiln, 'claude', Date.now());
  markStarted(p.home, MACHINE, kiln, 'codex', Date.now());
  const written: string[] = [];
  const hook = (id: string) => hookStart({ env, stdin: JSON.stringify({ cwd: kiln, session_id: id, source: 'startup' }), cwd: kiln, home: p.home, device: 'MacBook', write: (text) => void written.push(text) });

  for (const id of ['claude-run-1', 'claude-run-2']) {
    rmSync(p.skillFile, { force: true });
    rmSync(join(p.home, '.braindog', 'skills-lock.json'), { force: true });
    await hook(id);
    assert.ok(existsSync(p.skillFile), `${id} synced`);
  }
  assert.equal(written.length, 2);
  /* The stub sends no card (the record draws it, AGT-B07), so each start prints the one line; the sync is the file above. */
  for (const card of written) assert.equal(card.trimEnd(), 'Connected to BrainDog. Call context.', card);
  assert.deepEqual(h.seen.map((s) => s.method).filter((m) => m !== 'heard'), ['attach', 'get', 'attach', 'get']);
});

/* ── behind a tag ──────────────────────────────────────────────────────── */

test('NOTHING MOVED, NOTHING ASKED: a start where the rows and the files are as the work last left them is the attach alone', async (t) => {
  const p = place(t);
  const h = await stubHost(t);
  const kiln = p.folder('kiln');
  const env = { XDG_CONFIG_HOME: join(p.dir, 'config'), BRAINDOG_HOST: h.base, BRAINDOG_TOKEN: TOKEN, CLAUDE_CONFIG_DIR: p.configDir };
  const hook = (id: string) => hookStart({ env, stdin: JSON.stringify({ cwd: kiln, session_id: id, source: 'startup' }), cwd: kiln, home: p.home, device: 'MacBook', write: () => undefined });
  const asked = () => h.seen.map((s) => s.method).filter((m) => m !== 'heard');

  await hook('claude-run-1');
  assert.ok(existsSync(p.skillFile));
  await hook('claude-run-2');
  await hook('claude-run-3');
  assert.deepEqual(asked(), ['attach', 'get', 'attach', 'attach'], 'a start where nothing moved still synced');
  const kept = readFileSync(startTagPath(p.home), 'utf8');
  assert.ok(!kept.includes(TOKEN) && !kept.includes(kiln) && !kept.includes(SKILL.name), 'the tag file holds more than hashes');

  /* THE MACHINE MOVED: the skill's file was taken away, so the next start syncs it back, and the one after is quiet. */
  rmSync(p.skillFile);
  await hook('claude-run-4');
  assert.ok(existsSync(p.skillFile));
  await hook('claude-run-5');
  assert.deepEqual(asked().slice(4), ['attach', 'get', 'attach']);

  /* THE RECORD MOVED: a new revision of the skill in the attach's context is a start that syncs. */
  const row = CONTEXT.registers[0]!.inherited[0]!;
  Object.assign(row, { version: 2, rev: 2 });
  t.after(() => void Object.assign(row, { version: 1, rev: 1 }));
  await hook('claude-run-6');
  assert.deepEqual(asked().slice(7), ['attach', 'get']);
});

test('A TAG IS THE RECORD’S ROWS AND THE MACHINE’S FILES: a cut-short list has none, and a version or a project moves it', (t) => {
  const p = place(t);
  const kiln = p.folder('kiln');
  const place1 = { host: 'https://brain.dog/acme', machine: MACHINE, folder: kiln, configDir: p.configDir };
  const context = (o: { version?: number; truncated?: boolean; project?: string } = {}) =>
    ({
      ...CONTEXT,
      project: o.project === undefined ? null : { spoken: o.project, name: 'Kiln', mark: null, hue: null, how: 'folder' },
      registers: [{ ...CONTEXT.registers[0]!, truncated: o.truncated ?? false, inherited: [{ ...CONTEXT.registers[0]!.inherited[0]!, version: o.version ?? 1 }] }],
    }) as never;
  const env = { XDG_CONFIG_HOME: join(p.dir, 'config') };
  const tag = (c: never) => startTag(env, p.home, place1, null, kiln, c);
  assert.match(tag(context()) ?? '', /^[0-9a-f]{32}$/);
  assert.equal(tag(context()), tag(context()), 'the same rows and files are the same tag');
  assert.notEqual(tag(context({ version: 2 })), tag(context()));
  assert.notEqual(tag(context({ project: 'things#4' })), tag(context()));
  assert.equal(tag(context({ truncated: true })), null, 'a list the context cut short was tagged');
  assert.notEqual(startTag(env, p.home, { ...place1, host: 'https://brain.dog/other' }, null, kiln, context()), tag(context()));
  /* A skill file on this machine moved. */
  mkdirSync(dirname(p.skillFile), { recursive: true });
  const before = tag(context());
  writeFileSync(p.skillFile, '# Release\n');
  assert.notEqual(tag(context()), before);
});

test("A HOOK THAT RAN OUT OF TIME LEAVES THE WORK OWED, and Claude Code's server does it once the hook's time is over", async (t) => {
  const p = place(t);
  const h = await stubHost(t);
  const kiln = p.folder('kiln');
  const env = { XDG_CONFIG_HOME: join(p.dir, 'config'), CLAUDE_CONFIG_DIR: p.configDir };
  const to: Target = { key: h.base, base: h.base, token: TOKEN };
  /* No time left: the hook's attach took all of it, so neither step ran. */
  assert.deepEqual(await startWork({ env, home: p.home }, to, positionAt(kiln), CONTEXT as never, {}, Date.now()), []);
  assert.equal(existsSync(p.skillFile), false);
  assert.equal(h.seen.length, 0);

  const waited: number[] = [];
  const server = () =>
    startFromServer({
      io: { env, home: p.home },
      to,
      where: Promise.resolve(positionAt(kiln)),
      agent: 'claude',
      headers: async () => ({ 'x-braindog-client': 'claude-run-1' }),
      ms: 8_000,
      say: () => undefined,
      wait: async (ms) => void waited.push(ms),
    });
  assert.equal(await server(), 'ran');
  assert.deepEqual(waited, [8_000], 'the server did not wait out the hook first');
  assert.ok(existsSync(p.skillFile), 'the owed sync did not run');
  assert.deepEqual(h.seen.map((s) => s.method), ['context', 'get']);
  assert.equal(h.seen[0]!.headers['x-braindog-client'], 'claude-run-1', 'the work was not the session’s own run');
  /* PAID: the next server of the window has nothing owed, and asks nothing. */
  assert.equal(await server(), 'hooked');
  assert.equal(h.seen.length, 2);
});

/* ── after the first initialize ────────────────────────────────────────── */

/** A stand-in for stdout: what was written, and each write's callback called on the next turn, as a pipe's is. */
function sink() {
  const out: string[] = [];
  return {
    out,
    write: (chunk: Uint8Array, cb: (err?: Error | null) => void) => {
      out.push(Buffer.from(chunk).toString('utf8'));
      setImmediate(() => cb());
      return true;
    },
  };
}
const write = (w: Writable, text: string) => new Promise<void>((done) => w.write(text, () => done()));
const turn = () => new Promise<void>((done) => setImmediate(done));

test('AFTER HELLO passes every byte on, and calls back once, only after the first initialize answer was handed on', async () => {
  const s = sink();
  let called = 0;
  const w = afterHello(s, () => void called++);
  await write(w, `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })}\n`);
  await write(w, `${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'protocolVersion' }] } })}\n`);
  await turn();
  assert.equal(called, 0, 'no other reply, even one that says the word');
  const hello = `${JSON.stringify({ jsonrpc: '2.0', id: 0, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'braindog' } } })}\n`;
  /* Split across two writes, as a stream may hand it. */
  await write(w, hello.slice(0, 20));
  await turn();
  assert.equal(called, 0, 'half a line is no answer yet');
  await write(w, hello.slice(20));
  await turn();
  assert.equal(called, 1);
  await write(w, hello);
  await turn();
  assert.equal(called, 1, 'once');
  assert.equal(s.out.join(''), [s.out[0], s.out[1], hello, hello].join(''), 'byte for byte');
});

/* ── the server itself ─────────────────────────────────────────────────── */

/**
 * `braindog mcp --agent <app>` in a child process, in `cwd`, with the home folder at `home`: the hello written, and
 * input held open until the start work has said its line on stderr (or eight seconds pass), then ended.
 */
function serve(agent: string, cwd: string, env: NodeJS.ProcessEnv, waitFor: RegExp | null) {
  const child = spawn(process.execPath, [join(APP, 'src', 'main.ts'), 'mcp', '--agent', agent], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
  child.stderr.on('data', (c: Buffer) => {
    stderr += c.toString('utf8');
    if (waitFor !== null && waitFor.test(stderr)) child.stdin.end();
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex-mcp-client', version: '0.50.0' } } })}\n`);
  /* With nothing to wait for, the answer to the hello is enough, and a second later the input ends. */
  const end = setTimeout(() => child.stdin.end(), waitFor === null ? 1_500 : 8_000);
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done) => {
    const kill = setTimeout(() => child.kill(), 30_000);
    child.on('close', (code) => {
      clearTimeout(kill);
      clearTimeout(end);
      done({ code, stdout, stderr });
    });
  });
}

function envFor(p: ReturnType<typeof place>, base: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: p.home, USERPROFILE: p.home, XDG_CONFIG_HOME: join(p.dir, 'config') };
  for (const name of Object.keys(env))
    if (name.startsWith('BRAINDOG_') || name.startsWith('CLAUDE_CODE_') || ['CLAUDECODE', 'CLAUDE_SESSION_ID', 'CLAUDE_PID', 'CLAUDE_CONFIG_DIR'].includes(name)) delete env[name];
  return { ...env, BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN };
}

test('BRAINDOG MCP --AGENT CODEX does the start work after its hello is answered, on stderr, and nothing of it reaches stdout', async (t) => {
  const p = place(t);
  const h = await stubHost(t);
  const kiln = p.folder('kiln');
  const env = envFor(p, h.base);

  const first = await serve('codex', kiln, env, /BrainDog at the start of this session/);
  assert.equal(first.code, 0, first.stderr);
  /* The protocol's stdout holds the one answer to the hello, and nothing else. */
  const lines = first.stdout.split('\n').filter((l) => l !== '');
  assert.equal(lines.length, 1, first.stdout);
  const reply = JSON.parse(lines[0] ?? '') as { id: number; result: { protocolVersion: string } };
  assert.equal(reply.id, 0);
  assert.equal(reply.result.protocolVersion, '2025-06-18');
  assert.match(first.stderr, /^BrainDog at the start of this session: skills sync: 1 change\.$/m);
  assert.ok(existsSync(p.skillFile), "the record's skill is on disk");
  /* The hello first, and the work's own requests after it, with the app's name. */
  const methods = h.seen.map((s) => s.method);
  assert.deepEqual(methods.slice(0, 3), ['mcp:initialize', 'context', 'get'], methods.join(' '));
  assert.equal(h.seen[1]?.headers['x-braindog-agent'], 'codex');
  assert.ok(existsSync(startedPath(p.home)));

  const again = await serve('codex', kiln, env, null);
  assert.equal(again.code, 0, again.stderr);
  assert.equal(again.stderr.includes('BrainDog at the start of this session'), false, 'the same day, nothing more');
  assert.equal(h.seen.filter((s) => s.method === 'context').length, 1);

  const cursor = await serve('cursor', kiln, env, /BrainDog at the start of this session/);
  assert.equal(cursor.code, 0, cursor.stderr);
  assert.equal(h.seen.filter((s) => s.method === 'context').length, 2, 'another app runs it again');

  for (const text of [first.stdout, first.stderr, again.stdout, again.stderr, cursor.stdout, cursor.stderr]) assert.equal(text.includes('stub-bearer'), false);
});

test('SIGNED OUT, THE SERVER DOES NO START WORK', async (t) => {
  const p = place(t);
  const kiln = p.folder('kiln');
  const env = envFor(p, 'http://127.0.0.1:1');
  delete env.BRAINDOG_HOST;
  delete env.BRAINDOG_TOKEN;
  const out = await serve('codex', kiln, env, null);
  assert.equal(/start work|at the start of this session/.test(out.stderr), false, out.stderr);
  assert.equal(existsSync(startedPath(p.home)), false);
});
