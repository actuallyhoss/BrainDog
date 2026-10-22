/**
 * The bridge's pulse, the inbox file it keeps, and the opt-in channel (agents and MCP plan §2.3 C and D, §4.4; W2-D).
 *
 * WHAT IS HELD: once the app has said hello the bridge pulses `/api/pulse` as the session, with what the hooks showed
 * since and how, and writes the answer to the session's inbox file and its flags; while the run is stopped it pulses
 * faster; a host that never will answer a pulse stops it; a session with no host session id is never pulsed; and the
 * input closing stops it. With the channel on, the handshake asks for a revision Claude Code delivers a channel on,
 * the capability is declared, `server/discover` is declined, and each new instruction goes out once as
 * `notifications/claude/channel`, then is reported seen by channel. With it off, none of that.
 *
 * THE HOST IS A STAND-IN FETCH, because what is tested is what the bridge sends and writes; `pulse` itself is the
 * record's, tested in `packages/record/test/presence.test.ts`.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';

import { openKeyStore, recordKeys } from '../../selfhost/src/keys.ts';
import { start } from '../../selfhost/src/server.ts';
import { CHANNEL_CAPABILITY, CHANNEL_METHOD, CHANNEL_REVISION, channelHello, channelOn, serveBridge } from '../src/bridge.ts';
import { hookStart, readSession, sessionPath } from '../src/hooks.ts';
import { flagsPath, inboxPath, readInbox, runHook, statePath, writeState } from '../src/inbox-file.ts';
import type { Target } from '../src/http.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-bridge-pulse-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const TARGET: Target = { key: 'https://brain.example/acme', base: 'https://brain.example', token: 'bd_pulse_test_token_never_printed' };
const STOP_LINE = 'Mara stopped this run in BrainDog (IN7): "Wait". Reply with instructions, then end.';

type Sent = { path: string; body: Record<string, unknown>; headers: Headers };
type Pulse = { run: string | null; stamp: string | null; changed: boolean; pending: unknown[]; stop: unknown; lines: string[] };

/** A host that answers the handshake, `whoami` and each pulse with what `pulses` says next, and keeps what was sent. */
function host(pulses: (sent: Sent, count: number) => Pulse | { refusal: string }, enforce?: { hooks?: boolean; channel?: boolean }) {
  const sent: Sent[] = [];
  let count = 0;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const one: Sent = { path, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>, headers: new Headers(init?.headers) };
    sent.push(one);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'braindog-build': 'b1' } });
    if (path === '/mcp') {
      const m = one.body as { id?: number; method?: string; params?: { protocolVersion?: string } };
      if (m.method === 'initialize')
        return json({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'braindog', version: 'b1' } } });
      return m.id === undefined ? new Response(null, { status: 202 }) : json({ jsonrpc: '2.0', id: m.id, result: {} });
    }
    if (path === '/api/whoami') return json({ ok: true, value: { effective: enforce === undefined ? {} : { enforce } } });
    if (path === '/api/pulse') {
      const said = pulses(one, ++count);
      return json('refusal' in said ? { ok: false, refusal: { code: said.refusal, fix: 'no' } } : { ok: true, value: said });
    }
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'no' } });
  }) as typeof globalThis.fetch;
  return { sent, fetch, pulses: () => sent.filter((s) => s.path === '/api/pulse') };
}

/** A bridge over two pipes for one session, its environment and home in their own folders. */
function open(fetch: typeof globalThis.fetch, more: { channel?: boolean; client?: string | null; pulseMs?: number; heldMs?: number; session?: string } = {}) {
  const env = { XDG_CONFIG_HOME: join(scratch, `config${String(n)}`) };
  const home = join(scratch, `home${String(n++)}`);
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: Record<string, unknown>[] = [];
  createInterface({ input: output }).on('line', (line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  const client = more.client === undefined ? 'sess-1' : more.client;
  const hints = async () => ({ 'x-braindog-host': 'kiln-mbp', 'x-braindog-agent': 'claude', ...(client === null ? {} : { 'x-braindog-client': client }) });
  const done = serveBridge(
    { input, output, home, env, fetch, pulseMs: more.pulseMs ?? 40, heldMs: more.heldMs ?? 10, channel: more.channel ?? false, endGraceMs: 0, say: () => undefined, session: more.session },
    TARGET,
    hints,
  );
  const hello = (protocolVersion = '2025-06-18') => input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion, capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.304' } } })}\n`);
  return { env, input, lines, done, hello };
}

const until = async (ok: () => boolean, ms = 3_000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

const told = (id: string, kind = 'tell') => ({ id, kind, said: `Do ${id}`, at: '2026-10-21T11:59:00Z', to: 'run', line: `Mara said in BrainDog (${id}): "Do ${id}". Take it with instructions take ${id}.` });

test('THE PULSE WRITES THE INBOX FILE, says what the hooks showed once and how, and goes faster while the run is stopped', async () => {
  const stopped = { kind: 'stop', id: 'IN7', said: 'Wait' };
  const h = host((_s, i) =>
    i === 1
      ? { run: 'S883', stamp: 'v41', changed: true, pending: [told('IN4')], stop: null, lines: [told('IN4').line] }
      : { run: 'S883', stamp: 'v42', changed: i === 2, pending: [told('IN4'), told('IN7', 'stop')], stop: stopped, lines: i === 2 ? [STOP_LINE] : [] },
  );
  const b = open(h.fetch, { pulseMs: 40, heldMs: 10 });
  writeState(statePath(b.env, 'sess-1'), { shown: { IN3: 'prompt', IN2: 'start' }, said_stop: null, redirected: [], blocked: [] });
  b.hello();
  await until(() => h.pulses().length >= 1);
  assert.equal(h.sent.filter((s) => s.path === '/api/pulse' || s.path === '/api/whoami').length >= 1, true);
  /* BEFORE THE HELLO, NO PULSE: the first is an interval after it. */
  const first = h.pulses()[0]!;
  assert.equal(first.headers.get('authorization'), `Bearer ${TARGET.token}`);
  assert.equal(first.headers.get('x-braindog-client'), 'sess-1');
  /* ONE PULSE PER WAY SHOWN, the first carrying the stamp the file had (none yet). */
  const ways = h.pulses().slice(0, 2).map((p) => p.body);
  await until(() => h.pulses().length >= 4);
  assert.deepEqual(
    h.pulses().slice(0, 2).map((p) => p.body).sort((a, b) => String(a.how).localeCompare(String(b.how))),
    [{ shown: ['IN3'], how: 'prompt' }, { shown: ['IN2'], how: 'start' }].sort((a, b) => a.how.localeCompare(b.how)),
    JSON.stringify(ways),
  );
  /* SAID ONCE: the next pulse sends the stamp and nothing shown. */
  const later = h.pulses().at(-1)!.body;
  assert.equal(later.shown, undefined);
  assert.equal(later.stamp, 'v42');

  const file = readInbox(inboxPath(b.env, 'sess-1'))!;
  assert.deepEqual([file.run, file.host, file.stop?.id, file.stop_line, file.hooks], ['S883', TARGET.key, 'IN7', STOP_LINE, true]);
  assert.deepEqual(file.pending.map((t) => t.id), ['IN4', 'IN7']);
  assert.deepEqual([...file.reported].sort(), ['IN2', 'IN3']);
  assert.match(readFileSync(flagsPath(b.env, 'sess-1'), 'utf8'), /\btool\b/u);
  /* STOPPED, IT PULSES EVERY TEN MILLISECONDS HERE rather than forty: several more in a short wait. */
  const at = h.pulses().length;
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(h.pulses().length - at >= 4, `${String(h.pulses().length - at)} pulses in 120 ms while stopped`);
  b.input.end();
  await b.done;
  const closed = h.pulses().length;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(h.pulses().length, closed, 'it pulsed after the input closed');
  assert.ok(!JSON.stringify(readFileSync(inboxPath(b.env, 'sess-1'), 'utf8')).includes(TARGET.token!), 'the bearer was written');
});

test('A HOST THAT WILL NEVER ANSWER A PULSE STOPS IT, and a session with no host session id is never pulsed', async () => {
  const old = host(() => ({ refusal: 'ROUTE_UNKNOWN' }));
  const a = open(old.fetch, { pulseMs: 10 });
  a.hello();
  await until(() => old.pulses().length >= 1);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(old.pulses().length, 1, 'it kept pulsing a host with no pulse');
  a.input.end();
  await a.done;

  const nobody = host(() => ({ run: 'S1', stamp: 'v1', changed: false, pending: [], stop: null, lines: [] }));
  const b = open(nobody.fetch, { pulseMs: 10, client: null });
  b.hello();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(nobody.pulses().length, 0);
  b.input.end();
  await b.done;

  /* NO RUN YET: nothing is written, and the pulse goes on. */
  const none = host(() => ({ run: null, stamp: null, changed: false, pending: [], stop: null, lines: [] }));
  const c = open(none.fetch, { pulseMs: 10 });
  c.hello();
  await until(() => none.pulses().length >= 3);
  assert.equal(existsSync(inboxPath(c.env, 'sess-1')), false);
  c.input.end();
  await c.done;
});

test('A CLIENT THAT SAYS HELLO WITH server/discover IS PULSED TOO: the 2026-07-28 revision never sends initialize', async () => {
  const h = host(() => ({ run: 'S883', stamp: 'v41', changed: true, pending: [told('IN4')], stop: null, lines: [told('IN4').line] }));
  const b = open(h.fetch, { pulseMs: 10 });
  /* AS CLAUDE CODE 2.1.304 STARTS: discover, and then straight to the tools. */
  b.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} })}\n`);
  await until(() => h.pulses().length >= 1);
  await until(() => existsSync(inboxPath(b.env, 'sess-1')));
  assert.deepEqual(readInbox(inboxPath(b.env, 'sess-1'))?.pending.map((t) => t.id), ['IN4']);
  b.input.end();
  await b.done;
});

test('THE CHANNEL, ON: the older revision asked for, the capability declared, discover declined, each instruction pushed once', async () => {
  const h = host(() => ({ run: 'S883', stamp: 'v41', changed: true, pending: [told('IN4')], stop: null, lines: [told('IN4').line] }), { channel: true });
  const b = open(h.fetch, { channel: true, pulseMs: 20 });
  b.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'server/discover', params: {} })}\n`);
  b.hello('2026-07-28');
  await until(() => b.lines.some((l) => l.method === CHANNEL_METHOD));
  const discover = b.lines.find((l) => l.id === 0) as { error?: { code: number } };
  assert.equal(discover.error?.code, -32601);
  const asked = h.sent.find((s) => s.path === '/mcp' && s.body.method === 'initialize')!;
  assert.equal((asked.body.params as { protocolVersion: string }).protocolVersion, CHANNEL_REVISION);
  const hello = b.lines.find((l) => l.id === 1) as { result: { capabilities: { experimental?: Record<string, unknown>; tools: { listChanged: boolean } } } };
  assert.deepEqual(hello.result.capabilities.experimental, { [CHANNEL_CAPABILITY]: {} });
  assert.equal(hello.result.capabilities.tools.listChanged, true);
  const pushed = b.lines.filter((l) => l.method === CHANNEL_METHOD);
  assert.deepEqual(pushed[0]!.params, { content: told('IN4').line, meta: { instruction: 'IN4', kind: 'tell' } });
  await until(() => h.pulses().some((p) => p.body.how === 'channel'));
  assert.deepEqual(h.pulses().find((p) => p.body.how === 'channel')!.body.shown, ['IN4']);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(b.lines.filter((l) => l.method === CHANNEL_METHOD).length, 1, 'pushed twice');
  b.input.end();
  await b.done;
});

test('THE CHANNEL, OFF BY DEFAULT OR IN HIS SETTINGS: no capability, the revision the app asked for, nothing pushed', async () => {
  assert.equal(channelOn({}), false);
  assert.equal(channelOn({ BRAINDOG_CHANNEL: '1' }), true);
  assert.equal(channelOn({ BRAINDOG_CHANNEL: 'off' }), false);
  assert.deepEqual(channelHello({ method: 'initialize', params: { protocolVersion: '2025-06-18' } }), { method: 'initialize', params: { protocolVersion: '2025-06-18' } });

  const h = host(() => ({ run: 'S883', stamp: 'v41', changed: true, pending: [told('IN4')], stop: null, lines: [] }));
  const b = open(h.fetch, { channel: false, pulseMs: 10 });
  b.hello('2026-07-28');
  await until(() => h.pulses().length >= 2);
  assert.equal((h.sent.find((s) => s.body.method === 'initialize')!.body.params as { protocolVersion: string }).protocolVersion, '2026-07-28');
  const hello = b.lines.find((l) => l.id === 1) as { result: { capabilities: Record<string, unknown> } };
  assert.equal(hello.result.capabilities.experimental, undefined);
  assert.equal(b.lines.filter((l) => l.method === CHANNEL_METHOD).length, 0);
  b.input.end();
  await b.done;

  /* ON BY THE ENVIRONMENT, OFF IN HIS SETTINGS (when the record says): declared, and nothing pushed. */
  const off = host(() => ({ run: 'S883', stamp: 'v41', changed: true, pending: [told('IN4')], stop: null, lines: [] }), { channel: false, hooks: false });
  const c = open(off.fetch, { channel: true, pulseMs: 10 });
  c.hello();
  await until(() => off.pulses().length >= 3);
  assert.equal(c.lines.filter((l) => l.method === CHANNEL_METHOD).length, 0);
  /* AND THE STOP SWITCH OFF IN HIS SETTINGS reaches the file, so the tool hook lets every call go on. */
  assert.equal(readInbox(inboxPath(c.env, 'sess-1'))!.hooks, false);
  c.input.end();
  await c.done;
});

/* ── through a real self-host, start to stop ───────────────────────────── */

test('THROUGH A REAL SELF-HOST: an instruction reaches the next prompt and is seen by it, and a stop denies the next Bash call', async (t) => {
  const dir = mkdtempSync(join(scratch, 'e2e-'));
  const serverKey = randomBytes(32).toString('base64url');
  const store = await openKeyStore(join(dir, 'kek.key'));
  const running = await start({ file: join(dir, 'record.brain'), directory: join(dir, 'directory.sqlite'), port: 0, host: '127.0.0.1', token: serverKey, sessionKey: new Uint8Array(randomBytes(32)), keys: store, pollMs: 0 });
  t.after(() => running.close());
  const person = running.directory.person$('mara@example.com', 'Mara');
  assert.ok(person.ok);
  const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
  assert.ok((await running.api.createRecord({ id: REC, slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'mara@example.com', name: 'Mara' }, keys: await recordKeys(store, REC) })).ok);
  const minted = await running.api.kernel.createToken(person.value.id, { scope: 'write', label: 'Mac · Claude Code' });
  assert.ok(minted.ok, JSON.stringify(minted));
  const base = `http://127.0.0.1:${String((running.server.address() as { port: number }).port)}`;
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: minted.value.bearer, BRAINDOG_TIMEOUT_MS: '4000' };
  const cwd = join(dir, 'work');
  mkdirSync(cwd, { recursive: true });
  const owner = { principal: { kind: 'person' as const, id: person.value.id, level: 'owner' as const } };

  /* THE START HOOK ATTACHES THE RUN AND SEEDS THE FILE. */
  const written: string[] = [];
  const startIo = (source: string) => ({ env, cwd, home: dir, device: 'Mac', build: 'dev+0000000', stdin: JSON.stringify({ session_id: 'e2e-sess', cwd, hook_event_name: 'SessionStart', source }), write: (s: string) => void written.push(s) });
  await hookStart(startIo('startup'));
  const run = readSession(sessionPath(env, cwd, 'e2e-sess'))!.spoken;
  assert.match(run, /^S\d+$/u);
  assert.ok(existsSync(inboxPath(env, 'e2e-sess')), 'the start hook did not seed the file');

  const tell = await running.api.instruct({ said: 'Merge wave 1, then stop', kind: 'tell', to_run: run }, owner);
  assert.ok(tell.ok, JSON.stringify(tell));
  const id = tell.value.id;

  const input = new PassThrough();
  const output = new PassThrough();
  const hints = async () => ({ 'x-braindog-client': 'e2e-sess', 'x-braindog-session': run, 'x-braindog-agent': 'claude', 'x-braindog-host': 'mac' });
  const done = serveBridge({ input, output, home: dir, env, pulseMs: 40, heldMs: 20, channel: false, endGraceMs: 0, say: () => undefined }, { key: base, base, token: minted.value.bearer }, hints);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.304' } } })}\n`);
  await until(() => readInbox(inboxPath(env, 'e2e-sess'))?.pending.some((p) => p.id === id) === true, 8_000);

  /* THE NEXT PROMPT IS TOLD, in his voice; the pulse after it says it was seen there. */
  const prompt = JSON.stringify({ session_id: 'e2e-sess', cwd, hook_event_name: 'UserPromptSubmit', prompt: 'go on' });
  const said = JSON.parse(runHook('prompt', prompt, env)) as { hookSpecificOutput: { additionalContext: string } };
  assert.match(said.hookSpecificOutput.additionalContext, new RegExp(`^Mara said in BrainDog \\(${id}\\): "Merge wave 1, then stop"\\.`, 'u'));
  await until(() => running.api.kernel.instruction(id)?.seen_how === 'prompt', 8_000);

  /* HE PRESSES STOP: within a pulse the file says so, and the next Bash call is denied while BrainDog's still runs. */
  const stop = await running.api.instruct({ said: 'Hold everything', kind: 'stop', to_run: run }, owner);
  assert.ok(stop.ok, JSON.stringify(stop));
  await until(() => readInbox(inboxPath(env, 'e2e-sess'))?.stop !== null && readInbox(inboxPath(env, 'e2e-sess'))?.stop !== undefined, 8_000);
  const bash = JSON.stringify({ session_id: 'e2e-sess', cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' }, tool_use_id: 't1' });
  const denied = JSON.parse(runHook('tool', bash, env)) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, /^Mara stopped this run in BrainDog \(IN\d+\): "Hold everything"\. Reply with instructions, then end\./u);
  assert.equal(runHook('tool', bash.replace('"Bash"', '"mcp__braindog__instructions"'), env), '');

  /* AFTER A COMPACTION the start hook says the stop and the open instruction again. */
  written.length = 0;
  await hookStart(startIo('compact'));
  assert.match(written.join('\n'), /stopped this run in BrainDog/u);
  input.end();
  await done;
});

test('A TOOL CALL GOES AFTER THE PULSE THAT SAYS HOW THE HOOKS SHOWED AN INSTRUCTION, so the record keeps "on its prompt"', async () => {
  const h = host(() => ({ run: 'S883', stamp: 'v41', changed: false, pending: [told('IN4')], stop: null, lines: [] }));
  /* A PULSE A MINUTE AWAY, so the only pulse in this test is the one a tool call sends first. */
  const b = open(h.fetch, { pulseMs: 60_000 });
  b.hello();
  await until(() => b.lines.length >= 1);
  /* THE PROMPT HOOK SHOWED IN4, and the record has not heard: the run's own call must not get there first. */
  writeState(statePath(b.env, 'sess-1'), { shown: { IN4: 'prompt' }, said_stop: null, redirected: [], blocked: [] });
  b.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'instructions', arguments: { take: 'IN4' } } })}\n`);
  await until(() => b.lines.some((l) => l.id === 2));
  const order = h.sent.filter((s) => s.path === '/api/pulse' || (s.path === '/mcp' && s.body.method === 'tools/call')).map((s) => (s.path === '/api/pulse' ? 'pulse' : 'call'));
  assert.deepEqual(order, ['pulse', 'call']);
  assert.deepEqual(h.pulses()[0]!.body, { shown: ['IN4'], how: 'prompt' });
  assert.deepEqual(readInbox(inboxPath(b.env, 'sess-1'))?.reported, ['IN4']);

  /* REPORTED ONCE: the next call goes straight to the host. */
  b.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'context', arguments: {} } })}\n`);
  await until(() => b.lines.some((l) => l.id === 3));
  assert.equal(h.pulses().length, 1);
  b.input.end();
  await b.done;
});

test('A CODEX SESSION, WHICH SAYS NO SESSION ID, IS PULSED AND ITS FILE NAMED BY THE CODEX PROCESS', async () => {
  const h = host(() => ({ run: 'S900', stamp: 'v1', changed: true, pending: [told('IN9')], stop: null, lines: [told('IN9').line] }));
  const b = open(h.fetch, { pulseMs: 10, client: null, session: 'codex-4242' });
  b.hello();
  await until(() => existsSync(inboxPath(b.env, 'codex-4242')));
  /* THE RECORD FINDS THE RUN AS IT FINDS EVERY CODEX CALL: no session id is sent, and none is made up. */
  assert.equal(h.pulses()[0]!.headers.get('x-braindog-client'), null);
  assert.deepEqual(readInbox(inboxPath(b.env, 'codex-4242'))?.pending.map((t) => t.id), ['IN9']);
  b.input.end();
  await b.done;
});
