/**
 * The two checks of AGT-C01 (`runs-claude-code`, `manners`), held without a model and without the network.
 *
 * THE RUNS SCENARIO AGAINST A LOCAL RECORD: the self-host's own server on a socket of this machine, with a fake Claude
 * Code that sends what the hooks send (`apps/cli/src/hooks.ts`) on the ids the hook-events table measured
 * (`docs/48-SPEC-CLI.md`). So each line is the record's real answer, and a client that breaks a rule fails its line.
 * THE MANNERS COUNT from streams written here. And both checks through `run.mjs` with no key: "not run", never green.
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
import { mannersOf, tally } from '../manners.check.mjs';
import { answerOf, poster, projectFor, readStream, reader, runsScenario, tool } from '../runs-claude-code.check.mjs';

const RUN = join(dirname(fileURLToPath(import.meta.url)), '..', 'run.mjs');
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const VERSION = '2.1.295';
const FOLDER = '/Users/someone/work/scratch';

/** The one register the record places runs by: projects, with the folders they cover. */
const PROJECTS = {
  id: 'register.projects',
  kind: 'register',
  body: { id: 'projects', name: 'Projects', title: 'name', scopes: { folders: 'folders' }, fields: [{ id: 'name', type: 'text', required: true, search: true }, { id: 'folders', type: 'list', of: 'text' }] },
};

/** A fresh local record with projects, and keys minted for it as its owner. */
async function local() {
  const dir = mkdtempSync(join(tmpdir(), 'door-runs-'));
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
  const person = running.directory.person$('ada@example.com', 'Ada');
  const owner = person.value.id;
  assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: owner, email: 'ada@example.com', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  assert.ok((await running.api.kernel.install([PROJECTS])).ok);
  return {
    origin,
    /** A key of the owner's; `trusted` the kinds it writes without asking, as `seedLadder` keeps them. */
    async mint(trusted = []) {
      const out = await running.api.createToken({ scope: 'write' }, { principal: { kind: 'person', id: owner, level: 'owner' } });
      assert.ok(out.ok, 'the key was not minted');
      for (const kind of trusted)
        running.sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, ?, 'tell', 0, ?)", out.value.id, kind, new Date().toISOString());
      return out.value.bearer;
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** The record as the check reads it, through one key. */
const readerOf = (origin, bearer) => reader((name, args, session) => tool(origin, bearer, name, args, { session }), poster(origin, bearer));

/**
 * A fake Claude Code on one key: each step what its hooks send, on the ids the table measured. `start` opens, a
 * `claude -p` ends its session, a resume comes back on its own id, a clear on a new one. `breaks` names the one rule it
 * breaks, for the lines that must then fail.
 */
function fakeClaude(origin, bearer, { breaks = '' } = {}) {
  let n = 0;
  const fresh = () => `fake-${Date.now().toString(36)}-${++n}`;
  const send = async (method, id, body, spoken) => {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, 'x-braindog-client': id };
    Object.assign(headers, { 'x-braindog-cwd': FOLDER, 'x-braindog-agent': 'claude', 'x-braindog-client-name': 'Claude Code', 'x-braindog-client-version': VERSION, 'x-braindog-host': 'studio-mac' });
    if (spoken) headers['x-braindog-session'] = spoken;
    const res = await fetch(`${origin}/api/${method}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const wire = await res.json();
    assert.ok(wire.ok, `${method} was refused: ${JSON.stringify(wire.refusal)}`);
    return wire.value;
  };
  /* THE START HOOK, then the end hook a `claude -p` runs as it stops. */
  const session = async (id, source, work) => {
    await send('attach', id, { source, client_id: id });
    if (work) await work();
    await send('end', id, {});
    return { id, version: VERSION };
  };
  return {
    start: () => session(fresh(), 'startup'),
    /* `own` LOGS ON THE RUN ITSELF, the note landing in the run's history rather than on the row it is about. */
    write: (id, spoken, note) => session(id, 'resume', async () => assert.ok(answerOf(await mcpLog(origin, bearer, id, breaks === 'own' ? undefined : spoken, note)).value)),
    /* PRECOMPACT ALONE WAS MEASURED, and it sends the record nothing: the session goes on under its id. */
    compact: async (id) => (breaks === 'compact' ? { id: null, version: '', failed: 'No conversation found with session ID' } : { id, version: VERSION }),
    resume: (id) => session(breaks === 'resume' ? fresh() : id, breaks === 'resume' ? 'startup' : 'resume'),
    clear: async (id) => {
      await send('end', id, {});
      return session(fresh(), 'clear');
    },
    second: undefined,
  };
}

/** A `log` as the model calls it, as its session, answered as `/mcp` answers it. */
async function mcpLog(origin, bearer, id, spoken, note) {
  const res = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'log', arguments: { spoken, note }, _meta: { session: { client_id: id } } } }),
  });
  return res.json();
}

/** The scenario on a fresh local record: the first key trusted to add and note projects, unless `ask`. */
async function scenario({ ask = false, second = true, breaks = '' } = {}) {
  const rec = await local();
  try {
    const one = await rec.mint(ask ? [] : ['projects:add', 'projects:edit']);
    const r = readerOf(rec.origin, one);
    const client = fakeClaude(rec.origin, one, { breaks });
    let r2 = null;
    if (second) {
      const two = await rec.mint();
      r2 = readerOf(rec.origin, two);
      const other = fakeClaude(rec.origin, two);
      client.second = other.start;
    }
    const project = await projectFor(r, FOLDER, 'Scratch', 'door-check-maker');
    const rows = await runsScenario({ client, r, r2, folder: FOLDER, project, word: 'doorquokkas', why2: 'no second key for the record' });
    return Object.fromEntries(rows.map((row) => [row.saw.split(':')[0], row]));
  } finally {
    await rec.close();
  }
}

test('Claude Code on runs: every line holds on a local record, and the 120-run line says it is off', async () => {
  const lines = await scenario();
  for (const step of ['start', 'write', 'compact', 'resume', 'clear', 'second sign-in', 'list, get, update'])
    assert.equal(lines[step]?.ok, true, `${step}: ${lines[step]?.saw}`);
  assert.match(lines.start.saw, /^start: opened S\d+, "Claude Code in Scratch", app version 2\.1\.295, in Scratch$/);
  assert.match(lines.write.saw, /signed by S\d+, last seen moved .*, the run's own history gained no line/);
  assert.match(lines.clear.saw, /1 run of its own opened, as the table measured a new id/);
  assert.match(lines['second sign-in'].saw, /its own run, S\d+, naming S\d+ refused/);
  const off = lines[`list of 120 runs`];
  assert.equal(off.ok, null);
  assert.match(off.saw, /off until part B's read fix/);
  for (const row of Object.values(lines)) assert.equal(row.version, '2.1.295');
});

test('a resume that comes back under a new id fails its line, by itself', async () => {
  const lines = await scenario({ breaks: 'resume' });
  assert.equal(lines.resume.ok, false);
  assert.match(lines.resume.saw, /a new id, where the table measured the same/);
  assert.equal(lines.start.ok, true);
});

test('a compaction that never ran, printing nothing and exiting with an error, fails its line', async () => {
  const lines = await scenario({ breaks: 'compact' });
  assert.equal(lines.compact.ok, false);
  assert.match(lines.compact.saw, /^compact: Claude Code did not compact: No conversation found/);
  assert.equal(lines.resume.ok, true, lines.resume.saw);
});

test('a key that asks before it adds a project: placing and the write read "not run" with the reason', async () => {
  const lines = await scenario({ ask: true });
  assert.equal(lines.start.ok, true, lines.start.saw);
  assert.match(lines.start.saw, /in no project yet$/);
  assert.equal(lines.placed.ok, null);
  assert.match(lines.placed.saw, /asks before it adds a project/);
  assert.equal(lines.write.ok, null);
});

test('with no second sign-in, that line alone reads "not run" and says why', async () => {
  const lines = await scenario({ second: false });
  assert.equal(lines['second sign-in'].ok, null);
  assert.equal(lines['second sign-in'].saw, 'second sign-in: no second key for the record');
  assert.equal(lines.start.ok, true);
});

test('a write that lands on the run itself, not on the row, fails its line', async () => {
  const lines = await scenario({ breaks: 'own' });
  assert.equal(lines.write.ok, false);
  assert.match(lines.write.saw, /no line on Scratch signed by S\d+.*the run's own history gained 1 line/);
});

/** A stream as `claude -p --output-format stream-json --verbose` prints it, from the calls given as [name, input, ok]. */
function stream(calls, { id = 'sess-1', said = [] } = {}) {
  const lines = [{ type: 'system', subtype: 'init', session_id: id, claude_code_version: '2.1.295', tools: [] }];
  for (const text of said) lines.push({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  calls.forEach(([name, input, ok = true], i) => {
    lines.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `t${i}`, name, input }] } });
    lines.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${i}`, is_error: !ok, content: 'x' }] } });
  });
  lines.push({ type: 'result', session_id: id });
  return `${lines.map((l) => JSON.stringify(l)).join('\n')}\nnot an event\n`;
}

test('a stream is read for its id, its version, each call in order and whether it was refused', () => {
  const s = readStream(stream([['mcp__braindog__context', {}], ['Edit', { file_path: 'a' }, false]], { said: ['Looking.'] }));
  assert.equal(s.id, 'sess-1');
  assert.equal(s.version, '2.1.295');
  assert.deepEqual(s.calls.map((c) => [c.name, c.ok]), [['mcp__braindog__context', true], ['Edit', false]]);
  assert.deepEqual(s.said.map((x) => x.text), ['Looking.']);
  assert.equal(readStream('nothing printed').id, null);
});

test('a tools/call answer: the record\'s JSON, a refusal in its words, an error thrown', () => {
  assert.deepEqual(answerOf({ result: { structuredContent: { spoken: 'S1' } } }), { value: { spoken: 'S1' } });
  assert.deepEqual(answerOf({ result: { content: [{ type: 'text', text: '{"rows":[]}' }] } }), { value: { rows: [] } });
  assert.deepEqual(answerOf({ result: { isError: true, content: [{ type: 'text', text: 'S1 is a run another key opened' }] } }), { refused: 'S1 is a run another key opened' });
  assert.throws(() => answerOf({ error: { message: 'no such tool' } }, 'log'), /refused log: no such tool/);
});

const HANDOFF = 'mcp__braindog__handoff';

test('manners: doing before the first change and next after the last counts; either missing does not', () => {
  const good = readStream(stream([[HANDOFF, { doing: 'Add the sum function' }], ['Read', {}], ['Edit', {}], [HANDOFF, { next: 'Write a test for add' }]]));
  assert.deepEqual(mannersOf(good), { early: true, next: true, calls: 4 });
  /* SAID LATE: after it changed a file. */
  assert.equal(mannersOf(readStream(stream([['Edit', {}], [HANDOFF, { doing: 'Fix it' }], [HANDOFF, { next: 'Ship' }]]))).early, false);
  /* A NEXT STEP LEFT BEFORE ITS LAST CHANGE is not the one it stopped on. */
  assert.equal(mannersOf(readStream(stream([[HANDOFF, { doing: 'Fix it' }], [HANDOFF, { next: 'Ship' }], ['Write', {}]]))).next, false);
  /* A REFUSED HANDOFF SAID NOTHING, and a refused edit changed nothing. */
  assert.equal(mannersOf(readStream(stream([[HANDOFF, { doing: 'Fix it' }, false], ['Edit', {}]]))).early, false);
  assert.deepEqual(mannersOf(readStream(stream([[HANDOFF, { doing: 'Fix it' }], ['Edit', {}, false], [HANDOFF, { next: 'Retry the edit' }]]))), { early: true, next: true, calls: 3 });
  /* NO FILE CHANGED: doing within the first three calls. */
  assert.equal(mannersOf(readStream(stream([['Read', {}], ['Grep', {}], ['Glob', {}], [HANDOFF, { doing: 'Look' }]]))).early, false);
  assert.equal(mannersOf(readStream(stream([['Read', {}], [HANDOFF, { doing: 'Look' }], [HANDOFF, { next: ' ' }]]))).next, false);
});

test('the night\'s number is said whether it passes or not, and the bar is eight of ten', () => {
  const both = { early: true, next: true, calls: 4 };
  const half = { early: true, next: false, calls: 3 };
  const pass = tally([...Array(8).fill(both), half, null], '2.1.295');
  assert.equal(pass.ok, true);
  assert.equal(pass.saw, 'manners: 8 of 10 said what they were doing early and left a next step, and the bar is 8; 9 said it early, 8 left a next step; 1 never started, counted as missing both');
  const under = tally([...Array(7).fill(both), half, half, half]);
  assert.equal(under.ok, false);
  assert.match(under.saw, /^manners: 7 of 10 said what they were doing early/);
});

/** `run.mjs` on one check, with what the environment is given, its key-shaped names cleared first. */
function runner(only, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'door-report-'));
  const env = { ...process.env };
  for (const name of ['ANTHROPIC_API_KEY', 'DOOR_TOKEN', 'DOOR_TOKEN_2', 'GITHUB_ACTIONS', 'CI']) delete env[name];
  const got = spawnSync(process.execPath, [RUN, '--host', 'https://example.test', '--record', 'fresh', '--only', only, '--report', join(dir, 'report.json')], { env: { ...env, ...extra }, encoding: 'utf8' });
  const rows = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).rows;
  rmSync(dir, { recursive: true, force: true });
  return { code: got.status, out: got.stdout, rows };
}

for (const only of ['runs-claude-code', 'manners']) {
  test(`${only} with no model key reads "not run", one line, and exits 0`, () => {
    const r = runner(only);
    assert.equal(r.code, 0);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].ok, null);
    assert.match(r.out.trim(), new RegExp(`^warn\\s+claude-code 2\\.1\\.\\d+: not run: no key for the model, for the ${only === 'manners' ? 'manners count' : 'runs scenario'}$`));
  });

  test(`${only} in CI with a model key and no key for the record reads "not run", never green`, () => {
    const r = runner(only, { ANTHROPIC_API_KEY: 'not-a-real-key-for-tests', CI: 'true' });
    assert.equal(r.code, 0);
    assert.equal(r.rows[0].ok, null);
    assert.match(r.rows[0].saw, /no key for the record, and no one here to approve six digits/);
  });
}
