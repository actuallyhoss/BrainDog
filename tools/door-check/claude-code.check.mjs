/**
 * CLAUDE CODE THROUGH THE DOOR, AS A STRANGER OPENS IT (AGT-A01, `loop/scope/area-agents-a.md`).
 *
 * (a) The command is installed by the public script from the host, into the fresh home `run.mjs` made. (b) `braindog
 * setup <the record's address>` signs in, writes the hooks and registers the MCP server, exactly as a person's first
 * day does. (c) Claude Code, at the version `versions/claude-code.json` pins, is started with `-p` and stream-json and
 * allowed one tool. (d) Its first event must say the server `braindog` is connected and carry every name the host's
 * own `tools/list` answers, with the `mcp__braindog__` prefix. (e) `context` must answer without an error and name a
 * session. (f) The instructions the installed command hands a session must equal the host's current text, read by one
 * plain `initialize` to the host's `/mcp`.
 *
 * A SECOND ROW RUNS THE NEWEST RELEASE, unpinned, with the same profile. It warns and never fails the night: a new
 * release that breaks the door is news to act on, and the pin moves only by hand after a passing night.
 *
 * WHAT IT NEEDS FROM OUTSIDE, AND NEVER WRITES DOWN. `ANTHROPIC_API_KEY` for Claude Code: without it the row reads
 * "not run: no key" and the night exits 0 with that warning (DIRECTION 42 over the brief's exit 1). A sign-in for the
 * record: `DOOR_TOKEN`, a key for that record which a harness or a person made, handed to the command as
 * `BRAINDOG_TOKEN` in its environment and to nothing else; without one, `setup` prints six digits and waits for a
 * person to approve them in the app, which in CI nobody can, so CI without one reads "not run" as well.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PIN = JSON.parse(readFileSync(join(HERE, 'versions', 'claude-code.json'), 'utf8'));
const APP = PIN.app;
const PREFIX = 'mcp__braindog__';
const CONTEXT = `${PREFIX}context`;
/** The revision the plain `initialize` asks for. The instructions are the same for every caller and every revision. */
const REVISION = '2025-06-18';
/** How long `setup` may wait, which is mostly a person approving six digits. */
const SETUP_MS = 10 * 60_000;
const SESSION_MS = 4 * 60_000;
const INSTALL_MS = 5 * 60_000;
/** The most of a child's output kept, for its last line in a failure. */
const KEPT = 200_000;

const lastLine = (s) =>
  String(s)
    .trim()
    .split('\n')
    .filter((l) => l.trim() !== '')
    .pop() ?? '';

/**
 * One child, its output kept and optionally echoed. Resolves with its exit code, never rejects: a command that could
 * not start answers 127 with the reason as its error output.
 */
function run(cmd, args, { env, cwd, signal, ms, input, echo = false }) {
  return new Promise((done) => {
    let out = '';
    let err = '';
    const child = spawn(cmd, args, { env, cwd, signal, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), ms);
    child.stdout.on('data', (b) => {
      if (out.length < KEPT) out += b;
    });
    child.stderr.on('data', (b) => {
      if (err.length < KEPT) err += b;
      /* THE SIX DIGITS ARE ON STDERR, and a person has to read them to approve the sign-in. */
      if (echo) process.stderr.write(b);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      done({ code: 127, out, err: err + e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code: code ?? 1, out, err });
    });
    child.stdin.end(input ?? '');
  });
}

/**
 * The environment every child gets: this machine's own BrainDog and Claude Code settings left out, so nothing reaches
 * the record or the profile of whoever runs the check, and the fresh home in their place.
 */
function envOf(home, address, extraPath) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('BRAINDOG_') || name.startsWith('CLAUDE') || name === 'XDG_CONFIG_HOME' || name === 'DOOR_TOKEN') continue;
    env[name] = value;
  }
  env.HOME = home;
  env.CLAUDE_CONFIG_DIR = join(home, '.claude');
  env.XDG_CONFIG_HOME = join(home, '.config');
  env.PATH = [join(home, '.braindog', 'bin'), ...extraPath, process.env.PATH ?? ''].join(':');
  /* A KEY FOR THE RECORD TRAVELS IN THE ENVIRONMENT ONLY, and `BRAINDOG_HOST` with it, because a login held this way
     writes no hosts file and so names no default host for the MCP server and the hooks to reach. */
  if (process.env.DOOR_TOKEN) {
    env.BRAINDOG_TOKEN = process.env.DOOR_TOKEN;
    env.BRAINDOG_HOST = address;
  }
  return env;
}

/**
 * The same environment with no key in it, for the install script and npm. NEITHER NEEDS A KEY, and the script comes
 * from whatever host the run was handed, so a key in its environment would be handed to that host.
 */
function keyless(env) {
  const { ANTHROPIC_API_KEY: _model, BRAINDOG_TOKEN: _record, BRAINDOG_HOST: _host, ...rest } = env;
  return rest;
}

/** Claude Code at one version, installed under the home, and the folder its `claude` is in. */
async function installClaude(version, home, env, signal) {
  const prefix = join(home, `claude-${version}`);
  const got = await run('npm', ['install', '--prefix', prefix, '--no-save', '--no-audit', '--no-fund', `${PIN.package}@${version}`], { env, cwd: home, signal, ms: INSTALL_MS });
  const bin = join(prefix, 'node_modules', '.bin');
  if (got.code !== 0 || !existsSync(join(bin, 'claude'))) throw new Error(`Claude Code ${version} did not install: ${lastLine(got.err || got.out)}`);
  return bin;
}

/** The record's `/mcp` asked one JSON-RPC question plainly, answered in JSON or as one event of a stream. */
async function ask(host, token, method, params, signal) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': REVISION };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${host}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal, redirect: 'error' });
  const text = await res.text();
  if (!res.ok) throw new Error(`the host's /mcp answered ${method} with ${res.status}: ${lastLine(text).slice(0, 160)}`);
  const body = res.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .pop()
    : text;
  const parsed = JSON.parse(body ?? 'null');
  if (!parsed || parsed.error) throw new Error(`the host's /mcp refused ${method}: ${parsed?.error?.message ?? 'no answer'}`);
  return parsed.result;
}

/** Every tool name the host lists, page by page. */
async function hostTools(host, token, signal) {
  const names = [];
  const seen = new Set();
  let cursor;
  do {
    /* A cursor answered twice would page forever, so the second time ends the list. */
    if (cursor) seen.add(cursor);
    const page = await ask(host, token, 'tools/list', cursor ? { cursor } : {}, signal);
    for (const t of page?.tools ?? []) names.push(t.name);
    cursor = page?.nextCursor;
  } while (cursor && !seen.has(cursor));
  return names;
}

/**
 * The instructions the installed command hands a session: one `initialize` to the very entry `setup` registered, as
 * Claude Code starts it. The command answers it and exits when its input closes.
 */
async function handedInstructions(home, env, signal) {
  /* CLAUDE CODE KEEPS A NAMED PROFILE'S SERVERS INSIDE ITS FOLDER, and `braindog setup` reads `~/.claude` as the
     default profile, whose file is beside it (`apps/cli/src/install.ts`, `serversFileOf`), so either may hold it. */
  const entry = [join(home, '.claude', '.claude.json'), join(home, '.claude.json')]
    .filter((f) => existsSync(f))
    .map((f) => JSON.parse(readFileSync(f, 'utf8'))?.mcpServers?.braindog)
    .find(Boolean);
  if (!entry?.command) throw new Error('setup registered no braindog server in the profile');
  const hello = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: REVISION, capabilities: {}, clientInfo: { name: 'braindog-door-check', version: '1.0.0' } } };
  const got = await run(entry.command, entry.args ?? [], { env: { ...env, ...(entry.env ?? {}) }, cwd: home, signal, ms: 60_000, input: `${JSON.stringify(hello)}\n` });
  for (const line of got.out.split('\n')) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1) return msg.result?.instructions ?? '';
    } catch {
      /* not a message */
    }
  }
  throw new Error(`the installed command answered no initialize: ${lastLine(got.err)}`);
}

/**
 * What one session printed, read as Claude Code's stream-json: the first event, the server's status in it, the names
 * it carries, and the answer to the one `context` call.
 */
export function readSession(out) {
  const events = [];
  for (const line of out.split('\n')) {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* a line that is not an event */
    }
  }
  const first = events.find((e) => e.type === 'system' && e.subtype === 'init') ?? null;
  const server = first?.mcp_servers?.find((s) => s.name === 'braindog');
  const names = (first?.tools ?? []).filter((t) => typeof t === 'string' && t.startsWith(PREFIX));
  const calls = new Set();
  for (const e of events)
    if (e.type === 'assistant') for (const c of e.message?.content ?? []) if (c.type === 'tool_use' && c.name === CONTEXT) calls.add(c.id);
  let answer = null;
  for (const e of events)
    if (e.type === 'user')
      for (const c of e.message?.content ?? [])
        if (c.type === 'tool_result' && calls.has(c.tool_use_id) && answer === null) {
          const text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((p) => p.text ?? '').join('\n');
          answer = { error: c.is_error === true, text };
        }
  return { first, status: server?.status ?? 'missing', names, called: calls.size > 0, answer };
}

/** One session at one Claude Code, judged against the host's names and instructions. */
async function judge(bin, version, env, home, signal, expected, instructions) {
  const args = PIN.start.slice(1);
  const got = await run(join(bin, 'claude'), args, { env, cwd: home, signal, ms: SESSION_MS });
  const s = readSession(got.out);
  const row = { app: APP, version, first: s.first };
  if (!s.first) return { ...row, ok: false, saw: `no first event: ${lastLine(got.err || got.out) || `exit ${got.code}`}` };
  if (s.status !== 'connected') return { ...row, ok: false, saw: `braindog ${s.status}, ${s.names.length} tools` };
  const saw = [`connected, ${s.names.length} tools`];
  let ok = true;
  const missing = expected.filter((n) => !s.names.includes(`${PREFIX}${n}`));
  if (expected.length === 0 || missing.length > 0) {
    ok = false;
    saw.push(expected.length === 0 ? 'the host listed no tools' : `missing ${missing.join(', ')}`);
  }
  if (!s.called) {
    ok = false;
    saw.push('context never called');
  } else if (!s.answer || s.answer.error) {
    ok = false;
    saw.push(`context failed: ${lastLine(s.answer?.text ?? 'no answer').slice(0, 120)}`);
  } else if (!/\brun \S/.test(s.answer.text) || /\bno run yet\b/.test(s.answer.text)) {
    ok = false;
    saw.push('context named no session');
  } else saw.push('context ok');
  /* TWO EMPTY TEXTS ARE EQUAL AND SAY NOTHING, so a host that hands no instructions fails rather than agrees. */
  if (instructions.host === '') {
    ok = false;
    saw.push('the host handed no instructions');
  } else if (instructions.handed === instructions.host) saw.push('instructions current');
  else {
    ok = false;
    saw.push(`instructions differ from the host's (${instructions.handed.length} and ${instructions.host.length} characters)`);
  }
  return { ...row, ok, saw: saw.join(', ') };
}

const versionOf = async (bin, env, signal) => (await run(join(bin, 'claude'), ['--version'], { env, signal, ms: 30_000 })).out.trim().split(/\s+/)[0] || '';

/**
 * The check, with the record's bearer cut out of every row and every failure. `run.mjs` withholds what its own
 * environment holds; the bearer a six-digit sign-in left is only in the fresh home's hosts file, so it is cut here.
 */
export default async function claudeCode(ctx) {
  const cut = (s) => {
    const token = tokenIn(ctx.home);
    return token && token.length >= 8 ? String(s).split(token).join('[withheld]') : String(s);
  };
  try {
    const rows = await door(ctx);
    return JSON.parse(cut(JSON.stringify(rows)));
  } catch (error) {
    throw new Error(cut(error instanceof Error ? error.message : error));
  }
}

async function door({ host, record, home, signal }) {
  const pinned = { app: APP, version: PIN.pinned };
  if (!process.env.ANTHROPIC_API_KEY) return { ...pinned, ok: null, saw: 'no key' };
  if (!record) return { ...pinned, ok: null, saw: 'no record, pass --record' };
  if (process.env.CI && !process.env.DOOR_TOKEN) return { ...pinned, ok: null, saw: 'no key for the record, and no one here to approve six digits' };
  const address = /^https?:\/\//.test(record) ? record.replace(/\/+$/, '') : `${host}/app/${record}`;

  /* (a) THE COMMAND, AS A STRANGER INSTALLS IT, then Claude Code at its pin, which `setup` needs on the PATH. */
  const plain = keyless(envOf(home, address, []));
  const install = await run('sh', ['-c', 'curl -fsSL "$DOOR_INSTALL" | sh'], { env: { ...plain, DOOR_INSTALL: `${host}/cli/install.sh` }, cwd: home, signal, ms: INSTALL_MS });
  if (install.code !== 0 || !existsSync(join(home, '.braindog', 'bin', 'braindog'))) return { ...pinned, ok: false, saw: `install failed: ${lastLine(install.err || install.out)}` };
  const bin = await installClaude(PIN.pinned, home, plain, signal);
  const env = envOf(home, address, [bin]);
  pinned.version = (await versionOf(bin, env, signal)) || PIN.pinned;

  /* (b) SETUP, with its six digits on this terminal when no key was handed in. */
  const setup = await run('braindog', ['setup', address], { env, cwd: home, signal, ms: SETUP_MS, echo: true });
  if (setup.code !== 0) return { ...pinned, ok: false, saw: `setup failed: ${lastLine(setup.err || setup.out)}` };

  /* (d) and (f): what the host says today, read plainly, with the bearer the sign-in left. */
  const token = process.env.DOOR_TOKEN || tokenIn(home);
  const origin = new URL(address).origin;
  const hello = await ask(origin, token, 'initialize', { protocolVersion: REVISION, capabilities: {}, clientInfo: { name: 'braindog-door-check', version: '1.0.0' } }, signal);
  const expected = await hostTools(origin, token, signal);
  const instructions = { host: hello?.instructions ?? '', handed: await handedInstructions(home, env, signal) };

  /* (c) and (e): the pinned session, then the newest release beside it as a warning. */
  const rows = [await judge(bin, pinned.version, env, home, signal, expected, instructions)];
  rows.push(await newest(pinned.version, home, address, signal, expected, instructions));
  return rows;
}

/** The bearer `braindog login` kept in the fresh home's hosts file: read to ask the host, written nowhere. */
function tokenIn(home) {
  const file = join(home, '.config', 'braindog', 'hosts.json');
  if (!existsSync(file)) return undefined;
  try {
    const hosts = JSON.parse(readFileSync(file, 'utf8'));
    const entry = (hosts.default && hosts.hosts?.[hosts.default]) || Object.values(hosts.hosts ?? {})[0];
    return typeof entry?.token?.value === 'string' ? entry.token.value : undefined;
  } catch {
    return undefined;
  }
}

/** The newest release's row: never a failure of the night, only a warning. */
async function newest(pinnedVersion, home, address, signal, expected, instructions) {
  const row = { app: APP, warn: true };
  try {
    const plain = keyless(envOf(home, address, []));
    const latest = (await run('npm', ['view', PIN.package, 'version'], { env: plain, cwd: home, signal, ms: 60_000 })).out.trim();
    if (!latest) return { ...row, version: 'newest', ok: false, saw: 'the registry named no newest release' };
    if (latest === pinnedVersion) return { ...row, version: latest, ok: true, saw: 'the newest release is the pin' };
    const bin = await installClaude(latest, home, plain, signal);
    return { ...(await judge(bin, latest, envOf(home, address, [bin]), home, signal, expected, instructions)), warn: true };
  } catch (error) {
    return { ...row, version: 'newest', ok: false, saw: error instanceof Error ? error.message : String(error) };
  }
}
