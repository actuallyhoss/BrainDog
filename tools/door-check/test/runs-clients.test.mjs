/**
 * Codex and Cursor on runs (AGT-C01 job c), held without a model and without the network.
 *
 * THE SCENARIO AGAINST A LOCAL RECORD: the self-host's own server on a socket of this machine, and a fake client that
 * sends what `braindog mcp --agent <kind>` sends for a real one (`apps/cli/src/position.ts`, `sessionHeaders`): the kind,
 * the app's name from its hello, the machine and the folder, and no session id. So each line is the record's own answer,
 * and a client that breaks a rule fails its line. The 45 quiet minutes are made by ageing the run on the local record.
 * THE TWO APPS' OUTPUT, read from lines written here. And both checks through `run.mjs` with no key: "not run", exit 0.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { start } from '../../../apps/selfhost/src/server.ts';
import { poster, projectFor, reader, tool } from '../runs-claude-code.check.mjs';
import { clientRuns, notRunFor, readCodex } from '../runs-codex.check.mjs';
import { readCursor } from '../runs-cursor.check.mjs';

const RUN = join(dirname(fileURLToPath(import.meta.url)), '..', 'run.mjs');
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const FOLDER = '/Users/someone/work/scratch';
const PROJECTS = {
  id: 'register.projects',
  kind: 'register',
  body: { id: 'projects', name: 'Projects', title: 'name', scopes: { folders: 'folders' }, fields: [{ id: 'name', type: 'text', required: true, search: true }, { id: 'folders', type: 'list', of: 'text' }] },
};

/** A fresh local record with projects, a key of its owner's trusted to add and note them, and a way to age a run. */
async function local() {
  const dir = mkdtempSync(join(tmpdir(), 'door-clients-'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: randomBytes(32).toString('base64url'),
    sessionKey: new Uint8Array(randomBytes(32)),
    pollMs: 0,
  });
  const origin = `http://127.0.0.1:${running.server.address().port}`;
  const owner = running.directory.person$('ada@example.com', 'Ada').value.id;
  assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: owner, email: 'ada@example.com', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  assert.ok((await running.api.kernel.install([PROJECTS])).ok);
  const out = await running.api.createToken({ scope: 'write' }, { principal: { kind: 'person', id: owner, level: 'owner' } });
  assert.ok(out.ok, 'the key was not minted');
  for (const kind of ['projects:add', 'projects:edit'])
    running.sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, ?, 'tell', 0, ?)", out.value.id, kind, new Date().toISOString());
  return {
    origin,
    bearer: out.value.bearer,
    /** The run `S<n>` last heard from 46 minutes ago, as a run nobody used for that long reads. */
    age: async (spoken) => {
      const quiet = new Date(Date.now() - 46 * 60_000).toISOString();
      running.sql.exec("UPDATE entry SET fields = json_set(fields, '$.last_seen', ?) WHERE register = 'session' AND seq = ?", quiet, Number(spoken.slice(1)));
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A fake client: each session one `log` to `/mcp`, with the headers the command's bridge sends for `--agent <kind>`.
 * `breaks` names the rule it breaks: `kind`, an app that says nothing of what it is; `again`, a session id of its own
 * every time, so no session is found again.
 */
function fakeClient(origin, bearer, { kind, name, version, breaks = '' }) {
  let n = 0;
  return {
    write: async (spoken, note) => {
      n += 1;
      const headers = { 'content-type': 'application/json', accept: 'application/json', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${bearer}` };
      Object.assign(headers, { 'x-braindog-host': 'studio-mac', 'x-braindog-cwd': FOLDER, 'x-braindog-cli': 'dev+0000000' });
      if (breaks !== 'kind') Object.assign(headers, { 'x-braindog-agent': kind, 'x-braindog-client-name': name, 'x-braindog-client-version': version });
      if (breaks === 'again') headers['x-braindog-client'] = `fresh-${n}-${Date.now().toString(36)}`;
      const res = await fetch(`${origin}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: n, method: 'tools/call', params: { name: 'log', arguments: { spoken, note } } }) });
      const wire = await res.json();
      return { version, failed: wire.result?.isError ? 'the record refused the log' : '' };
    },
  };
}

/** The scenario for one app on a fresh local record, its lines by step. */
async function scenario({ kind = 'codex', called = 'Codex', name = 'codex-mcp-client', version = '0.162.0', breaks = '', aged = true } = {}) {
  const rec = await local();
  try {
    const r = reader((tool_, args, at) => tool(rec.origin, rec.bearer, tool_, args, { session: at }), poster(rec.origin, rec.bearer));
    const project = await projectFor(r, FOLDER, 'Scratch', 'door-check-maker');
    const client = fakeClient(rec.origin, rec.bearer, { kind, name, version, breaks });
    const rows = await clientRuns({ client, r, project, kind, called, app: kind, version, age: aged ? rec.age : undefined });
    return Object.fromEntries(rows.map((row) => [row.saw.split(':')[0], row]));
  } finally {
    await rec.close();
  }
}

/* ── the scenario on a local record ─────────────────────────────────────────── */

test('Codex on runs: a run opens at the first write, reads as Codex, is found again, and a new one opens after 45 minutes', async () => {
  const lines = await scenario();
  for (const step of ['first write', 'agent', 'found again', 'after 45 minutes']) assert.equal(lines[step]?.ok, true, `${step}: ${lines[step]?.saw}`);
  assert.match(lines['first write'].saw, /^first write: S\d+ opened and signed it$/);
  assert.match(lines.agent.saw, /reads as "codex", called "Codex/);
  assert.match(lines['found again'].saw, /the second session's write is signed by S\d+$/);
  assert.match(lines['after 45 minutes'].saw, /a new run, S\d+, signs the write$/);
  for (const row of Object.values(lines)) assert.deepEqual([row.app, row.version], ['codex', '0.162.0']);
});

test('Cursor on runs: the same lines hold, and the run reads as Cursor', async () => {
  const lines = await scenario({ kind: 'cursor', called: 'Cursor', name: 'cursor-agent', version: '2026.10.01-e373342' });
  for (const step of ['first write', 'agent', 'found again', 'after 45 minutes']) assert.equal(lines[step]?.ok, true, `${step}: ${lines[step]?.saw}`);
  assert.match(lines.agent.saw, /reads as "cursor", called "Cursor/);
});

test('an app that says nothing of what it is reads as "other", and its agent line fails by itself', async () => {
  const lines = await scenario({ breaks: 'kind' });
  assert.equal(lines.agent.ok, false);
  assert.match(lines.agent.saw, /reads as "other", not "codex"/);
  assert.equal(lines['first write'].ok, true, lines['first write'].saw);
});

test('a client that is a new session every time is never found again, and that line fails by itself', async () => {
  const lines = await scenario({ breaks: 'again' });
  assert.equal(lines['found again'].ok, false);
  assert.match(lines['found again'].saw, /the second session opened S\d+/);
  assert.equal(lines.agent.ok, true, lines.agent.saw);
});

test('on a real record the 45 minutes cannot pass in a night, and that line says so as "not run"', async () => {
  const lines = await scenario({ aged: false });
  assert.equal(lines['after 45 minutes'].ok, null);
  assert.match(lines['after 45 minutes'].saw, /twenty minutes/);
  assert.equal(lines['found again'].ok, true);
});

test('a project the key may only ask for reads "not run" with the reason, never a failure', async () => {
  const r = { get: async () => ({}), history: async () => [] };
  const rows = await clientRuns({ client: {}, r, project: { refused: 'the key asks before it adds a project', asked: true }, kind: 'codex', called: 'Codex', app: 'codex' });
  assert.deepEqual(rows.map((x) => x.ok), [null]);
});

/* ── what each app printed, read ─────────────────────────────────────────────── */

test('Codex: its MCP calls, by server and tool, and the error a turn failed with', () => {
  const out = [
    { type: 'thread.started', thread_id: 't1' },
    { type: 'item.completed', item: { type: 'mcp_tool_call', server: 'braindog', tool: 'context', status: 'completed' } },
    { type: 'item.completed', item: { type: 'mcp_tool_call', server: 'braindog', tool: 'log', status: 'failed', error: { message: 'refused' } } },
    { type: 'turn.failed', error: { message: 'stream disconnected' } },
  ]
    .map((e) => JSON.stringify(e))
    .join('\n');
  const s = readCodex(`noise\n${out}\n`);
  assert.deepEqual(s.calls, [
    { server: 'braindog', tool: 'context', ok: true },
    { server: 'braindog', tool: 'log', ok: false },
  ]);
  assert.equal(s.error, 'stream disconnected');
});

test('Cursor: a completed call to braindog log is read, whatever wraps it, and an error result is said', () => {
  const done = { type: 'tool_call', subtype: 'completed', session_id: 's1', tool_call: { mcpToolCall: { args: { providerIdentifier: 'braindog', toolName: 'log' }, result: { success: {} } } } };
  const other = { type: 'tool_call', subtype: 'completed', tool_call: { readToolCall: { args: { path: 'README.md' } } } };
  const s = readCursor([done, other, { type: 'result', is_error: true, result: 'no key' }].map((e) => JSON.stringify(e)).join('\n'));
  assert.deepEqual(s.calls, [
    { log: true, ok: true },
    { log: false, ok: true },
  ]);
  assert.equal(s.session, 's1');
  assert.equal(s.error, 'no key');
});

/* ── through run.mjs with no key ────────────────────────────────────────────── */

/** `run.mjs` on one check against production's name, with no key but those given. Nothing is reached: each stops first. */
function runner(only, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'door-report-'));
  const env = { ...process.env };
  for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'CURSOR_API_KEY', 'DOOR_TOKEN', 'DOOR_TOKEN_2', 'GITHUB_ACTIONS', 'CI']) delete env[name];
  const got = spawnSync(process.execPath, [RUN, '--host', 'https://brain.dog', '--record', 'fresh', '--only', only, '--report', join(dir, 'report.json')], { env: { ...env, ...extra }, encoding: 'utf8' });
  const rows = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).rows;
  rmSync(dir, { recursive: true, force: true });
  return { code: got.status, out: got.stdout, rows };
}

for (const [only, app, key] of [
  ['runs-codex', 'codex', 'OPENAI_API_KEY'],
  ['runs-cursor', 'cursor', 'CURSOR_API_KEY'],
]) {
  test(`${only} with no key reads "not run: no key", one line, and exits 0`, () => {
    const r = runner(only);
    assert.equal(r.code, 0);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].ok, null);
    assert.match(r.out.trim(), new RegExp(`^warn\\s+${app} \\S+: not run: no key$`));
  });

  test(`${only} in CI with its key and no key for the record reads "not run", never green`, () => {
    const r = runner(only, { [key]: 'not-a-real-key-for-tests', CI: 'true' });
    assert.equal(r.code, 0);
    assert.equal(r.rows[0].ok, null);
    assert.match(r.rows[0].saw, /no key for the record, and no one here to approve six digits/);
  });
}

test('the reasons a client check is not run, in order', () => {
  assert.equal(notRunFor('OPENAI_API_KEY', { record: 'fresh', env: {} }), 'no key');
  assert.equal(notRunFor('OPENAI_API_KEY', { record: '', env: { OPENAI_API_KEY: 'k' } }), 'no record, pass --record');
  assert.equal(notRunFor('OPENAI_API_KEY', { record: 'fresh', env: { OPENAI_API_KEY: 'k', CI: 'true', DOOR_TOKEN: 't' } }), null);
});
