/**
 * `runByName`: a run said by the agent it is and the app it ran in, and never by its handle (`S42`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { actor, nameWords, runByIn, runByName, saidKind } from './names.ts';
import { agentsTable, feedTable, type FeedRow } from './api.ts';

const ULID = '01M1KJ7RG0TYYA0AX15QPGJJ4Z';

test('a run is the app it ran in: Claude Code, Codex, Cursor', () => {
  assert.equal(runByName({ agent: 'claude', client: 'claude-code', parent: null }), 'Claude Code');
  assert.equal(runByName({ agent: 'codex', client: 'codex', parent: null }), 'Codex');
  assert.equal(runByName({ agent: 'other', client: 'codex', parent: null }), 'Codex');
  assert.equal(runByName({ agent: 'cursor', client: 'cursor-vscode', parent: null }), 'Cursor');
  assert.equal(runByName({ run: 'S42', agent: 'claude', client: 'claude-code', parent: null }), 'Claude Code');
});

test('the app is read whatever it sent after its name: a version, a slash, capitals', () => {
  assert.equal(runByName({ agent: 'claude', client: 'claude-code 2.1.4', parent: null }), 'Claude Code');
  assert.equal(runByName({ agent: 'claude', client: 'Claude-Code/2.1.4', parent: null }), 'Claude Code');
  assert.equal(runByName({ agent: 'codex', client: ' codex-mcp-client ', parent: null }), 'Codex');
});

test('a run whose app is not said is the kind of agent it is', () => {
  assert.equal(runByName({ agent: 'claude', client: null, parent: null }), 'Claude');
  assert.equal(runByName({ agent: 'gemini', client: '', parent: null }), 'Gemini');
  assert.equal(runByName({ agent: 'agent:codex', client: null, parent: null }), 'Codex');
});

test('an app the product has no spelling for is its own name in words', () => {
  assert.equal(runByName({ agent: 'other', client: 'night-shift 0.3', parent: null }), 'Night shift');
  assert.equal(runByName({ agent: 'night_shift', client: null, parent: null }), 'Night shift');
});

test('a run that helps another says so', () => {
  assert.equal(runByName({ agent: 'claude', client: 'claude-code', parent: 'S41' }), 'Claude Code, helping');
  assert.equal(runByName({ agent: 'codex', client: null, parent: 'S7' }), 'Codex, helping');
  assert.equal(runByName({ agent: 'claude', client: 'claude-code', parent: '' }), 'Claude Code');
});

test('null, absent, or a run that is nobody in particular is An agent', () => {
  assert.equal(runByName(null), nameWords.agent);
  assert.equal(runByName(undefined), nameWords.agent);
  assert.equal(runByName(), 'An agent');
  assert.equal(runByName({ agent: 'other', client: null, parent: null }), 'An agent');
  assert.equal(runByName({ agent: '', client: '  ', parent: null }), 'An agent');
  assert.equal(runByName({ agent: 'other', client: null, parent: 'S41' }), 'An agent, helping');
});

test('NEVER THE HANDLE, AN ID OR AN ADDRESS, whatever the run said its app or its kind was', () => {
  const odd = ['S42', 's42', ULID, `agent:${ULID}`, 'bot@kiln.example', 'tools#8', 'https://kiln.example/mcp', '/usr/local/bin/agent', '2.1.4'];
  for (const text of odd) {
    assert.equal(runByName({ run: 'S42', agent: 'other', client: text, parent: null }), 'An agent', `client ${text}`);
    assert.equal(runByName({ run: 'S42', agent: text, client: null, parent: null }), 'An agent', `agent ${text}`);
    assert.equal(runByName({ run: 'S42', agent: 'claude', client: text, parent: null }), 'Claude', `claude in ${text}`);
  }
  for (const by of [{ run: 'S42', agent: 'claude', client: 'claude-code', parent: 'S41' }, { run: 'S42', agent: 'S42', client: 'S42', parent: 'S41' }]) {
    assert.doesNotMatch(runByName(by), /S\d+/u);
  }
});

test('a text that is no run at all is An agent, never a throw', () => {
  for (const by of ['S42', 42, {}, { agent: 7, client: {}, parent: [] }, []]) assert.equal(runByName(by as never), 'An agent');
});

test('actor names a run from its run_by, and says An agent as before without one', () => {
  assert.deepEqual(actor('S42'), { name: 'An agent', kind: 'agent' });
  assert.deepEqual(actor('S42', null, new Map()), { name: 'An agent', kind: 'agent' });
  assert.deepEqual(actor('S42', null, new Map(), null), { name: 'An agent', kind: 'agent' });
  const by = { run: 'S42', agent: 'claude', client: 'claude-code', parent: null };
  assert.deepEqual(actor('S42', null, new Map(), by), { name: 'Claude Code', kind: 'agent' });
  assert.deepEqual(actor(' S42 ', null, new Map(), { ...by, parent: 'S41' }), { name: 'Claude Code, helping', kind: 'agent' });
  assert.equal(saidKind('Claude Code'), 'agent');
  assert.equal(saidKind('Claude Code, helping'), 'agent');
});

test('a run_by is read only for the run it is about, and for no other actor', () => {
  const by = { run: 'S42', agent: 'claude', client: 'claude-code', parent: null };
  assert.deepEqual(actor('S43', null, new Map(), by), { name: 'An agent', kind: 'agent' });
  assert.equal(actor('you', null, new Map(), by).kind, 'you');
  assert.deepEqual(actor('system', null, new Map(), by), { name: nameWords.brainDog, kind: 'system' });
  assert.deepEqual(actor('agent:codex', null, new Map(), by), { name: 'Codex', kind: 'agent' });
  /* A run_by that does not say which run it is about is the caller's word for the line it sits beside. */
  assert.deepEqual(actor('S42', null, new Map(), { agent: 'codex', client: 'codex', parent: null }), { name: 'Codex', kind: 'agent' });
});

test('A FEED LINE A RUN SIGNED SAYS THE APP IT RAN IN, on a feed and on an agents block, and An agent where the record says none', () => {
  const at = '2026-09-16T11:00:00.000Z';
  const row = (who: string, run_by?: FeedRow['run_by']): FeedRow => ({ by: 'agent', who, count: 1, kind: 'edit', target: 'tasks#3', note: null, at, thing: 'Send the deck', ...(run_by === undefined ? {} : { run_by }) });
  const feed = [
    row('S42', { run: 'S42', agent: 'claude', client: 'claude-code 2.1.4', parent: null }),
    row('S43', { run: 'S43', agent: 'claude', client: 'claude-code', parent: 'S42' }),
    row('S44', { run: 'S44', agent: 'other', client: 'codex-mcp-client', parent: null }),
    row('S45', null),
    row('S46'),
    /* ONE ABOUT ANOTHER RUN is not this line's, and an agent signed by its own name keeps it. */
    row('S47', { run: 'S42', agent: 'claude', client: 'claude-code', parent: null }),
    row('agent:claude', { run: 'S42', agent: 'codex', client: 'codex', parent: null }),
  ];
  const want = ['Claude Code', 'Claude Code, helping', 'Codex', 'An agent', 'An agent', 'An agent', 'Claude'];
  assert.deepEqual(feedTable(feed, false, null, Date.parse(at), 'p_me').rows.map((r) => r.cells[1]), want);
  assert.deepEqual(agentsTable(feed, Date.parse(at)).rows.map((r) => r.cells[0]), want);
  for (const r of [...feedTable(feed, false, null, Date.parse(at)).rows, ...agentsTable(feed, Date.parse(at)).rows]) assert.doesNotMatch(r.cells.join(' '), /\bS\d+\b/u);
});

test('a `run_by` off the wire is read only as far as it is one', () => {
  assert.equal(runByIn(null), null);
  assert.equal(runByIn('S42'), null);
  assert.equal(runByIn(['claude']), null);
  assert.deepEqual(runByIn({ run: 'S42', agent: 'claude', client: 7, parent: undefined, more: true }), { run: 'S42', agent: 'claude', client: null, parent: null });
  assert.equal(runByName(runByIn({ client: 'cursor-vscode' })), 'Cursor');
  assert.equal(runByName(runByIn({})), 'An agent');
});
