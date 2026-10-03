/**
 * What a call says about who makes it: the host session it runs in, the agent, and the client's own name and version,
 * read from the environment a caller hands over and the hello its client sent.
 *
 * PURE, SO NO HOST. The hooks test drives the same headers through a real socket, from the start hook, a command and
 * the MCP server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hostSessionOf, sessionHeaders, type Position } from '../src/position.ts';
import { helloOf } from '../src/stdio.ts';

const AT: Position = { cwd: '/Users/ada/kiln', repo: 'kiln', remote: 'github.com/ada/kiln', host: 'box', branch: 'main', head: 'abc1234' };
const WHERE = { 'x-braindog-host': 'box', 'x-braindog-repo': 'kiln', 'x-braindog-remote': 'github.com/ada/kiln', 'x-braindog-cwd': '/Users/ada/kiln' };

test('THE HOST SESSION IS THE ONE ITS ENVIRONMENT NAMES, CLAUDE_SESSION_ID first, and nothing that is not an id', () => {
  assert.equal(hostSessionOf({}), null);
  assert.equal(hostSessionOf({ CLAUDE_CODE_SESSION_ID: '044b77b1-6eaa-4d42-84c3-1a7bb0164b31' }), '044b77b1-6eaa-4d42-84c3-1a7bb0164b31');
  assert.equal(hostSessionOf({ CLAUDE_SESSION_ID: 'from-the-hook', CLAUDE_CODE_SESSION_ID: 'from-the-shell' }), 'from-the-hook');
  assert.equal(hostSessionOf({ CLAUDE_SESSION_ID: 'has space', CLAUDE_CODE_SESSION_ID: 'from-the-shell' }), 'from-the-shell');
  assert.equal(hostSessionOf({ CLAUDE_CODE_SESSION_ID: 'x'.repeat(129) }), null);
});

test('ONE RUN PER HOST SESSION: the run’s own id when the caller names it, else the host session’s, and Claude inside Claude Code', () => {
  const env = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'claude-run-mine' };
  assert.deepEqual(sessionHeaders(AT, undefined, undefined, { env }), { ...WHERE, 'x-braindog-client': 'claude-run-mine', 'x-braindog-agent': 'claude' });
  /* What the hook was told wins over what the environment says, and an agent named wins over CLAUDECODE. */
  assert.deepEqual(sessionHeaders(AT, 'codex', { spoken: 'S7', client_id: 'hook-said' }, { env }), {
    ...WHERE,
    'x-braindog-session': 'S7',
    'x-braindog-client': 'hook-said',
    'x-braindog-agent': 'codex',
  });
  /* No environment handed over is none read: this process's own is never looked at. */
  assert.deepEqual(sessionHeaders(AT), WHERE);
  assert.deepEqual(sessionHeaders(AT, undefined, undefined, { env: { CLAUDECODE: '' } }), WHERE);
});

test('THE CLIENT’S OWN NAME AND VERSION travel as headers, trimmed, and one outside its grammar is dropped', () => {
  assert.deepEqual(sessionHeaders(AT, 'claude', undefined, { client: { name: ' claude-code ', version: '2.1.287' } }), {
    ...WHERE,
    'x-braindog-agent': 'claude',
    'x-braindog-client-name': 'claude-code',
    'x-braindog-client-version': '2.1.287',
  });
  /* A header value must be Latin-1 for fetch to send it at all, so a name in another script, or too long, is left out. */
  const said = sessionHeaders(AT, undefined, undefined, { client: { name: 'Zoë’s client', version: 'v'.repeat(65) } });
  assert.equal(said['x-braindog-client-name'], undefined);
  assert.equal(said['x-braindog-client-version'], undefined);
  assert.deepEqual(sessionHeaders(AT, undefined, undefined, { client: {} }), WHERE);
});

test('A HELLO IS initialize WITH clientInfo, read for its strings and nothing else', () => {
  const hello = (params: unknown) => helloOf({ jsonrpc: '2.0', id: 1, method: 'initialize', params });
  assert.deepEqual(hello({ protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code', version: '2.1.287' } }), { name: 'claude-code', version: '2.1.287' });
  assert.deepEqual(hello({ clientInfo: { name: 'cursor', version: 3 } }), { name: 'cursor' });
  assert.equal(hello({ protocolVersion: '2025-06-18' }), null);
  assert.equal(helloOf({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { clientInfo: { name: 'not a hello' } } }), null);
  assert.equal(helloOf('initialize'), null);
});
