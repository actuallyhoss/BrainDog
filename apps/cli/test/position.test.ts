/**
 * What a call says about who makes it: the host session it runs in, the agent, and the client's own name and version,
 * read from the environment a caller hands over and the hello its client sent.
 *
 * PURE, SO NO HOST. The hooks test drives the same headers through a real socket, from the start hook, a command and
 * the MCP server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUILD, authorsOf, cliBuild, hostSessionOf, sessionHeaders, type Position } from '../src/position.ts';
import { helloOf } from '../src/stdio.ts';

const AT: Position = { cwd: '/Users/ada/kiln', repo: 'kiln', remote: 'github.com/ada/kiln', host: 'box', branch: 'main', head: 'abc1234' };
/* Run from a checkout, so the command's build is the one with no bundle, and every call says it. */
const WHERE = { 'x-braindog-host': 'box', 'x-braindog-repo': 'kiln', 'x-braindog-remote': 'github.com/ada/kiln', 'x-braindog-cwd': '/Users/ada/kiln', 'x-braindog-cli': 'dev+0000000' };

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

test('EVERY CALL SAYS THE COMMAND’S BUILD as x-braindog-cli, and a build outside the bundler’s grammar is not sent', () => {
  assert.equal(cliBuild(), 'dev+0000000');
  assert.equal(sessionHeaders(AT)['x-braindog-cli'], 'dev+0000000');
  assert.equal(sessionHeaders(AT, 'claude', undefined, { build: '2026.10.09+1a2b3c4' })['x-braindog-cli'], '2026.10.09+1a2b3c4');
  for (const build of ['2026.10.09+1a2b3c4', '2026.10.09+' + 'a'.repeat(40), 'dev+0000000']) assert.ok(BUILD.test(build), build);
  /* A version a person typed, a branch name and a header break are never a build, so none leaves the machine. */
  for (const build of ['1.2.3', '2026.10.09', '2026.10.09+main', '2026.10.09+1A2B3C4', 'dev+0000000\r\nx: y', '2026.10.09+' + 'a'.repeat(41)]) {
    assert.ok(!BUILD.test(build), build);
    assert.equal(sessionHeaders(AT, undefined, undefined, { build })['x-braindog-cli'], undefined, build);
  }
});

test('A HELLO IS initialize WITH clientInfo, read for its strings and nothing else', () => {
  const hello = (params: unknown) => helloOf({ jsonrpc: '2.0', id: 1, method: 'initialize', params });
  assert.deepEqual(hello({ protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code', version: '2.1.287' } }), { name: 'claude-code', version: '2.1.287' });
  assert.deepEqual(hello({ clientInfo: { name: 'cursor', version: 3 } }), { name: 'cursor' });
  assert.equal(hello({ protocolVersion: '2025-06-18' }), null);
  assert.equal(helloOf({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { clientInfo: { name: 'not a hello' } } }), null);
  assert.equal(helloOf('initialize'), null);
});

test('THE AUTHORS OF RECENT COMMITS ARE READ ONCE EACH, newest first, with a real address', () => {
  assert.equal(authorsOf(null), null);
  assert.equal(authorsOf('Ada Lin <ada@example.com>\nBo <bo@kiln.example>\nada lin <ADA@example.com>'), 'Ada Lin <ada@example.com>, Bo <bo@kiln.example>');
  assert.equal(authorsOf('Dee <>\nNo address'), null);
  assert.equal(authorsOf(Array.from({ length: 9 }, (_, i) => `P${i} <p${i}@x.example>`).join('\n'))?.split(', ').length, 5);
});

test('THE AUTHORS TRAVEL AS A HEADER FROM THE REPOSITORY ITSELF', () => {
  const at: Position = { ...AT, authors: 'Ada Lin <ada@example.com>' };
  assert.equal(sessionHeaders(at, 'claude')['x-braindog-authors'], 'Ada Lin <ada@example.com>');
  assert.equal(sessionHeaders(AT, 'claude')['x-braindog-authors'], undefined);
});
