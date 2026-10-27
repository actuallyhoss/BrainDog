/**
 * The instructions door check, held apart from Claude Code: its four lines read off a seed host with a stand-in session
 * that does what the hooks and a good agent do, each line failing by itself when its part does not happen; the paths a
 * client with no hooks gets; and the reasons it is not run.
 *
 * THE SEED HOST IS REAL (`seed-host.mjs`, in this process), so every line is the record's answer. The stand-in plays
 * the pulse (it writes the inbox file the bridge would) and the model (it calls the record's tools as the run).
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { NO_HOOKS, asSession, instructionsScenario, notRun, pathsScenario, sessionFiles } from '../instructions.check.mjs';
import { poster, tool } from '../runs-claude-code.check.mjs';
import { startSeedHost } from '../seed-host.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'door-instructions-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;

const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
};

/**
 * A seed host, its owner, an agent's key, and a stand-in session. `skip` names a part the stand-in leaves undone:
 * `pulse` (the inbox never gets the instruction), `act` (the run does nothing with it), `deny` (the tool runs), `end`.
 */
async function rig(skip = new Set()) {
  const host = await startSeedHost();
  const owner = poster(host.base, host.key);
  const made = await owner('createToken', { scope: 'write', label: 'Door check agent' });
  assert.equal(made.ok, true, JSON.stringify(made.refusal));
  const bearer = made.value.bearer;
  const id = `fake-${String(n++)}`;
  const config = join(scratch, id);
  const files = sessionFiles(config, id);
  const hints = { client_id: id, agent: 'claude', client: 'claude-code', host: 'door-test' };
  const as = (name, args) => asSession(host.base, bearer, hints, name, args);

  /* THE PULSE: what the bridge writes once the record has something for the run. */
  const pulse = async () => {
    if (skip.has('pulse')) return;
    const got = await as('instructions', {});
    const ids = [...got.text.matchAll(/\((IN[1-9]\d*)\)/gu)].map((m) => m[1]);
    const stop = /stopped this run/u.test(got.text) ? { kind: 'stop', id: ids.at(-1), said: '' } : null;
    writeJson(files.inbox, { v: 1, run: null, pending: ids.map((i) => ({ id: i })), stop });
  };
  const told = async (method, body) => {
    const got = await owner(method, body);
    if (method === 'instruct' && got.ok) await pulse();
    return got;
  };

  let turns = 0;
  const session = {
    id,
    version: '9.9.9',
    async prompt(_text, { onCall } = {}) {
      turns += 1;
      if (turns === 1) {
        /* WHAT THE START HOOK SENDS, which opens the run. */
        const opened = await poster(host.base, bearer)('attach', { source: 'startup', client_id: id, doing: 'Door test' });
        assert.equal(opened.ok, true, JSON.stringify(opened.refusal));
        await as('context', {});
        return { calls: [], said: ['S1'] };
      }
      if (turns === 2) {
        if (skip.has('act')) return { calls: [], said: ['done'] };
        writeJson(files.state, { shown: { IN1: 'prompt' } });
        const word = (await as('instructions', {})).text.match(/Door check (door[a-z]+)/u)?.[1] ?? '';
        await as('create', { register: 'learnings', fields: { lesson: `Door check ${word}`, because: 'The door check asked for it.', kind: 'fact' } });
        await as('instructions', { reply: 'IN1', said: 'Added it.', state: 'done' });
        return { calls: [{ name: 'mcp__braindog__instructions', ok: true }, { name: 'mcp__braindog__create', ok: true }], said: ['done'] };
      }
      const first = { name: 'Bash', ok: true, text: '' };
      onCall?.(first);
      await new Promise((r) => setTimeout(r, 300));
      const second = skip.has('deny') ? { name: 'Bash', ok: true, text: 'door-check' } : { name: 'Bash', ok: false, text: 'The owner stopped this run in BrainDog (IN2): "Stop". Reply with instructions, then end.' };
      return { calls: [first, second], said: ['done'] };
    },
    async close() {
      /* WHAT THE END HOOK SENDS: the session's id in its header, and nothing in the body it does not take. */
      if (skip.has('end')) return;
      const res = await fetch(`${host.base}/api/end`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, 'x-braindog-client': id }, body: '{}' });
      assert.equal((await res.json()).ok, true);
    },
  };
  const ask = (name, args) => tool(host.base, bearer, name, args, { session: { client_id: id } });
  return { host, session, owner: told, ask, files, as };
}

const sawOf = (rows) => Object.fromEntries(rows.map((r) => [r.saw.split(':')[0], r]));

test('every line holds when the hooks and the run do their part: seen on the prompt, the reply with its receipts, the stop, the end', async () => {
  const r = await rig();
  try {
    const rows = await instructionsScenario({ ...r, word: 'doorabcdefgh', pulseMs: 3_000, endMs: 3_000 });
    const by = sawOf(rows);
    assert.deepEqual(Object.keys(by), ['prompt', 'reply', 'stop', 'end'], JSON.stringify(rows));
    for (const row of rows) assert.equal(row.ok, true, row.saw);
    assert.match(by.reply.saw, /IN1 reads done/u);
    assert.match(by.reply.saw, /1 change: Door check doorabcdefgh/u);
  } finally {
    await r.host.close();
  }
});

test('an instruction the pulse never writes fails the prompt line, and a tool that runs after a stop fails the stop line', async () => {
  const r = await rig(new Set(['pulse', 'deny']));
  try {
    const by = sawOf(await instructionsScenario({ ...r, word: 'doorabcdefgh', pulseMs: 500, endMs: 3_000 }));
    assert.equal(by.prompt.ok, false);
    assert.match(by.prompt.saw, /never reached the inbox file/u);
    assert.equal(by.stop.ok, false);
    assert.equal(by.end.ok, true, by.end.saw);
  } finally {
    await r.host.close();
  }
});

test('a run that does nothing with it fails the reply, and one never ended fails the end', async () => {
  const r = await rig(new Set(['act', 'end']));
  try {
    const by = sawOf(await instructionsScenario({ ...r, word: 'doorabcdefgh', pulseMs: 3_000, endMs: 500, replyMs: 500 }));
    assert.equal(by.reply.ok, false);
    assert.match(by.reply.saw, /no receipts/u);
    assert.equal(by.end.ok, false);
  } finally {
    await r.host.close();
  }
});

test('a client with no hooks: what waits is said at its start, listed when asked, and carried on its next answer', async () => {
  const r = await rig();
  try {
    const owner = poster(r.host.base, r.host.key);
    const made = await owner('createToken', { scope: 'write', label: 'Door check codex' });
    const rows = await pathsScenario({ call: (s, name, args) => asSession(r.host.base, made.value.bearer, s, name, args), owner, word: 'doorpaths' });
    assert.deepEqual(rows.map((x) => [x.app, x.saw.split(':')[0], x.ok]), [
      [NO_HOOKS, 'A, start', true],
      [NO_HOOKS, 'F, asked', true],
      [NO_HOOKS, 'B, any answer', true],
    ], JSON.stringify(rows));
  } finally {
    await r.host.close();
  }
});

test('never on app.brain.dog, and not without the seed key or a model, each said', () => {
  assert.match(notRun({ host: 'https://app.brain.dog', env: { DOOR_SEED_KEY: 'x', ANTHROPIC_API_KEY: 'y' } }), /only he tells a run on app\.brain\.dog/u);
  assert.match(notRun({ host: 'http://localhost:1', env: { ANTHROPIC_API_KEY: 'y' } }), /DOOR_SEED_KEY/u);
  assert.match(notRun({ host: 'http://localhost:1', env: { DOOR_SEED_KEY: 'x' } }), /DOOR_CLAUDE_PROFILE/u);
  assert.equal(notRun({ host: 'http://localhost:1', env: { DOOR_SEED_KEY: 'x', DOOR_CLAUDE_PROFILE: '/p' } }), null);
});
