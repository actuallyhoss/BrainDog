/**
 * What a call says about who makes it: the host session it runs in, the agent, and the client's own name and version,
 * read from the environment a caller hands over and the hello its client sent.
 *
 * PURE, SO NO HOST. The hooks test drives the same headers through a real socket, from the start hook, a command and
 * the MCP server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BUILD, authorsOf, cliBuild, hostSessionOf, positionOf, profileNameOf, repoOf, sessionHeaders, withCommits, type Position } from '../src/position.ts';
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
  assert.deepEqual(sessionHeaders(AT, undefined, undefined, { env }), {
    ...WHERE,
    'x-braindog-client': 'claude-run-mine',
    'x-braindog-agent': 'claude',
    'x-braindog-profile': 'default',
  });
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

test('A PROFILE IS NAMED FROM CLAUDE_CONFIG_DIR: default, .claude-<name>, a ccenv profile, else the folder’s own name', () => {
  const home = '/Users/ada';
  const named = (dir: string | undefined, more: Record<string, string> = {}) => profileNameOf({ ...more, ...(dir === undefined ? {} : { CLAUDE_CONFIG_DIR: dir }) }, home);
  for (const dir of [undefined, '', '  ', '/Users/ada/.claude', '/Users/ada/.claude/']) assert.equal(named(dir), 'default', String(dir));
  assert.equal(named('/Users/ada/.claude-copperleaf'), 'copperleaf');
  assert.equal(named('/Users/ada/.ccenv/profiles/oxbow'), 'oxbow');
  assert.equal(named('/Volumes/work/.ccenv/profiles/lanternfish/'), 'lanternfish');
  assert.equal(named('/opt/ccenv/profiles/lanternfish', { CCENV_HOME: '/opt/ccenv' }), 'lanternfish');
  /* ANY OTHER FOLDER IS ITS OWN NAME, without leading dots, and `.claude` elsewhere is not the default profile. */
  assert.equal(named('/opt/claude-work'), 'claude-work');
  assert.equal(named('/srv/shared/.claude'), 'claude');
  assert.equal(named('/srv/.claude-team'), 'claude-team');
  /* The home is the environment's own when none is handed in. */
  assert.equal(profileNameOf({ HOME: '/home/bo', CLAUDE_CONFIG_DIR: '/home/bo/.claude-team' }), 'team');
  /* A NAME THAT IS NO NAME IS NONE: a space, another script, `..`, or nothing at all. */
  for (const dir of ['/Users/ada/My profile', '/Users/ada/.claude-Zoë', '/Users/ada/.claude-a..b', '/Users/ada/.claude-', '/']) assert.equal(named(dir), null, dir);
});

test('THE PROFILE TRAVELS BY NAME AND NEVER AS A PATH, for Claude Code only, and only from an environment handed over', () => {
  const sent = (agent: 'claude' | 'codex' | undefined, env?: Record<string, string>) => sessionHeaders(AT, agent, undefined, env === undefined ? {} : { env });
  const deep = { CLAUDE_CONFIG_DIR: '/Users/ada/private-clients/quietcart/.ccenv/profiles/copperleaf' };
  assert.equal(sent('claude', deep)['x-braindog-profile'], 'copperleaf');
  assert.equal(sent(undefined, { ...deep, CLAUDECODE: '1' })['x-braindog-profile'], 'copperleaf');
  /* NO PART OF THE FOLDER ABOVE THE NAME IS IN ANY HEADER. */
  for (const value of Object.values(sent('claude', deep))) assert.ok(!value.includes('private-clients') && !value.includes('.ccenv'), value);
  for (const dir of ['/Users/ada/.claude-copperleaf', '/x/y/.claude', '/x/.ccenv/profiles/lanternfish', 'C:\\Users\\ada\\.claude-copperleaf']) {
    const value = sent('claude', { CLAUDE_CONFIG_DIR: dir })['x-braindog-profile'];
    assert.ok(value === undefined || !/[/\\]/u.test(value), `${dir} sent ${String(value)}`);
  }
  /* ANOTHER APP, NO ENVIRONMENT, OR A NAME THAT IS NO NAME: no header at all. */
  assert.equal(sent('codex', deep)['x-braindog-profile'], undefined);
  assert.equal(sent(undefined, deep)['x-braindog-profile'], undefined);
  assert.equal(sent('claude')['x-braindog-profile'], undefined);
  assert.equal(sent('claude', { CLAUDE_CONFIG_DIR: '/Users/ada/Zoë' })['x-braindog-profile'], undefined);
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

test('THE LAST COMMITS RIDE AFTER THE AUTHORS, a hash and its subject each, and one that would not fit is left off', () => {
  assert.equal(withCommits(null, null), null);
  assert.equal(withCommits('Ada <ada@example.com>', 'abc1234 Wire the kerning pass\nnot a commit\ndef5678 Fix a || b'), 'Ada <ada@example.com> || abc1234 Wire the kerning pass || def5678 Fix a | b');
  assert.equal(withCommits(null, 'abc1234 Wire it'), '|| abc1234 Wire it');
  assert.equal(withCommits('Ada <ada@example.com>', `abc1234 ${'x'.repeat(1100)}`), 'Ada <ada@example.com>');
});

test('THE AUTHORS TRAVEL AS A HEADER FROM THE REPOSITORY ITSELF', () => {
  const at: Position = { ...AT, authors: 'Ada Lin <ada@example.com>' };
  assert.equal(sessionHeaders(at, 'claude')['x-braindog-authors'], 'Ada Lin <ada@example.com>');
  assert.equal(sessionHeaders(AT, 'claude')['x-braindog-authors'], undefined);
});

test('A WORKTREE IS THE SAME REPOSITORY: its name from the common directory, and the worktree folder apart', () => {
  /* What `rev-parse --show-toplevel --git-dir --git-common-dir` prints, one a line. */
  assert.deepEqual(repoOf('/w/braindog\n.git\n.git', '/w/braindog'), { top: '/w/braindog', repo: 'braindog', worktree: null });
  assert.deepEqual(repoOf('/w/braindog/.claude/worktrees/agent-1\n/w/braindog/.git/worktrees/agent-1\n/w/braindog/.git', '/w/braindog/.claude/worktrees/agent-1'), {
    top: '/w/braindog/.claude/worktrees/agent-1',
    repo: 'braindog',
    worktree: 'agent-1',
  });
  /* A bare repository's worktree, and a submodule, whose git directory is the common one: its own top folder's name. */
  assert.deepEqual(repoOf('/w/kiln-main\n/w/kiln.git/worktrees/kiln-main\n/w/kiln.git', '/w/kiln-main'), { top: '/w/kiln-main', repo: 'kiln', worktree: 'kiln-main' });
  assert.deepEqual(repoOf('/w/site/vendor/glaze\n/w/site/.git/modules/glaze\n/w/site/.git/modules/glaze', '/w/site/vendor/glaze'), {
    top: '/w/site/vendor/glaze',
    repo: 'glaze',
    worktree: null,
  });
  assert.equal(repoOf(null, '/tmp'), null);
  /* A git too old to say the two directories names the top folder, as before. */
  assert.deepEqual(repoOf('/w/braindog', '/w/braindog'), { top: '/w/braindog', repo: 'braindog', worktree: null });
});

test('POSITION IN A REAL WORKTREE says the main repository and the worktree, and both travel as headers', async (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'braindog-position-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const main = join(dir, 'kiln');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Ada', GIT_AUTHOR_EMAIL: 'ada@example.com', GIT_COMMITTER_NAME: 'Ada', GIT_COMMITTER_EMAIL: 'ada@example.com' };
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, stdio: 'pipe' });
  mkdirSync(main);
  git(main, 'init', '-q');
  git(main, 'commit', '-q', '--allow-empty', '-m', 'first');
  const tree = join(main, '.claude', 'worktrees', 'agent-7');
  git(main, 'worktree', 'add', '-q', '-b', 'kern', tree);

  const inMain = await positionOf(main);
  assert.deepEqual([inMain.repo, inMain.worktree], ['kiln', null]);
  const inTree = await positionOf(tree);
  assert.deepEqual([inTree.repo, inTree.worktree, inTree.branch, inTree.cwd], ['kiln', 'agent-7', 'kern', tree]);
  const headers = sessionHeaders(inTree, 'claude');
  assert.deepEqual([headers['x-braindog-repo'], headers['x-braindog-worktree'], headers['x-braindog-cwd']], ['kiln', 'agent-7', tree]);
  assert.equal(sessionHeaders(inMain, 'claude')['x-braindog-worktree'], undefined);
  /* A folder that is no repository has no worktree either. */
  const outside = await positionOf(dir);
  assert.deepEqual([outside.repo, outside.worktree], [null, null]);
});
