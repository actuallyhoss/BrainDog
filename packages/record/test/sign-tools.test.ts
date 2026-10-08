/**
 * `tools-listed` (PRF-A05 job 3): the sessions the agent door was given the tool list against the sessions that said
 * hello, from the kernel's `doorMarks` and the marks themselves, filed through `signRead`. Marks are left through the
 * kernel's own `heard`, as the door leaves them.
 *
 * None on a week nobody connected and on a build with no marks; green when every session was sent the list; red when the
 * newest session of a client waited past ten minutes with none, and red on the 9-in-10 line, said in the client's name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { clientName, fileRecordSigns, readToolsSign, type RecordSignsKernel } from '../src/signs.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 3 * 24 * 60 * MIN);
  const api = await createRecordApi({ sql, clock });
  /** One session at the door, `minsAgo` before NOW: it says hello, and is given the list when `listed`. */
  const session = (run: string, minsAgo: number, listed: boolean, client = 'claude-code') => {
    clock.set(NOW - minsAgo * MIN);
    assert.ok(api.kernel.heard({ actor: run } as never, { kind: 'hello', client, build: '0.9.1' }).ok);
    if (listed) assert.ok(api.kernel.heard({ actor: run } as never, { kind: 'listed', n: 16 }).ok);
  };
  const tools = () => {
    clock.set(NOW);
    const all = api.kernel.signs();
    assert.ok(all.ok);
    return all.value.signs.find((s) => s.sign === 'tools-listed')!;
  };
  const deps = { sql, briefing: () => null };
  return { sql, clock, api, session, tools, deps };
}

const NO_ID = /\b[0-9A-HJKMNP-TV-Z]{26}\b|\bS\d+\b|token:|run-\w/u;

test('NONE: a week nobody connected, and a build that keeps no marks, are nothing to judge by', async () => {
  const { sql, api, tools, deps } = await record();
  assert.equal(tools().state, 'none', 'unfiled');
  await fileRecordSigns(api.kernel, deps, NOW);
  const s = tools();
  assert.equal(s.state, 'none');
  assert.equal(s.said, 'No agent connected this week.');
  const older: RecordSignsKernel = { signRead: api.kernel.signRead };
  assert.equal(readToolsSign(older, sql, NOW).state, 'none');
});

test('GREEN: every session that said hello was given the tool list, and one still inside its ten minutes waits', async () => {
  const { api, session, tools, deps } = await record();
  for (const [run, mins] of [['run-a', 3000], ['run-b', 1500], ['run-c', 600], ['run-d', 90]] as const) session(run, mins, true);
  session('run-e', 5, false);
  await fileRecordSigns(api.kernel, deps, NOW);
  const s = tools();
  assert.equal(s.state, 'green', s.said);
  assert.equal(s.value, 4);
  assert.equal(s.said, 'Agents connected 5 times this week and were given the tool list 4 times of 5.');
  assert.deepEqual(s.facts, ['Claude Code connected 5 times and was given the tool list 4 times of 5.']);
  assert.doesNotMatch([s.said, ...s.facts].join(' '), NO_ID);
});

test('RED: the newest session of a client connected twenty minutes ago and was never given the list', async () => {
  const { api, session, tools, deps } = await record();
  for (const [run, mins] of [['run-a', 3000], ['run-b', 1500], ['run-c', 600]] as const) session(run, mins, true);
  session('run-d', 20, false, 'codex-mcp-client');
  await fileRecordSigns(api.kernel, deps, NOW);
  const s = tools();
  assert.equal(s.state, 'red');
  assert.equal(s.said, 'The newest Codex session connected 20 minutes ago and was not given the tool list.');
  assert.ok(s.facts.includes('Claude Code connected 3 times and was given the tool list every time.'), s.facts.join(' | '));
  assert.doesNotMatch([s.said, ...s.facts].join(' '), NO_ID);
});

test('RED ON THE LINE: given the list 1 time in 6, said in the client’s name, while 9 of 10 is green', async () => {
  const { api, session, tools, deps } = await record();
  for (const [run, mins] of [['run-a', 5000], ['run-b', 4000], ['run-c', 3000], ['run-d', 2000], ['run-e', 1000]] as const) session(run, mins, false);
  session('run-f', 60, true);
  await fileRecordSigns(api.kernel, deps, NOW);
  const s = tools();
  assert.equal(s.state, 'red');
  assert.equal(s.said, 'Claude Code connected 6 times this week and was given the tool list 1 time.');
  assert.equal(s.value, 1);

  const nine = await record();
  for (let i = 0; i < 9; i++) nine.session(`run-${i}`, 3000 - i * 100, true);
  nine.session('run-x', 4000, false);
  assert.equal(readToolsSign(nine.api.kernel, nine.sql, NOW).state, 'green', '9 of 10 is on the line, not under it');
  nine.session('run-y', 4100, false);
  assert.equal(readToolsSign(nine.api.kernel, nine.sql, NOW).state, 'red', '9 of 11 is under it');
});

test('A CLIENT IS SAID BY ITS NAME', () => {
  assert.equal(clientName('claude-code'), 'Claude Code');
  assert.equal(clientName('codex-mcp-client'), 'Codex');
  assert.equal(clientName('my-own_agent'), 'My own agent');
  assert.equal(clientName(null), 'An agent');
});

test('NONE, NOT GREEN: every session still inside its ten minutes, and a list sent with no hello heard', async () => {
  const { sql, api, session } = await record();
  session('run-a', 4, false);
  const soon = readToolsSign(api.kernel, sql, NOW);
  assert.equal(soon.state, 'none', soon.said);
  assert.equal(soon.said, 'The one agent that connected this week did so in the last ten minutes, so it is too soon to tell.');

  const bare = await record();
  bare.clock.set(NOW - 60 * MIN);
  assert.ok(bare.api.kernel.heard({ actor: 'run-q' } as never, { kind: 'listed', n: 16 }).ok);
  const listedOnly = readToolsSign(bare.api.kernel, bare.sql, NOW);
  assert.equal(listedOnly.state, 'none', listedOnly.said);
  assert.equal(listedOnly.said, 'No agent connected this week.');
});
