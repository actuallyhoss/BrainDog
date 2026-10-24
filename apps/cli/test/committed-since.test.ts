/**
 * Whether a session has committed since it started (scope B31), which the bridge writes into the inbox so the Stop hook
 * asks once for learnings: HEAD in the session's folder against the commit its start hook kept.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { committedSince } from '../src/bridge.ts';
import { sessionPath, writeSession } from '../src/hooks.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-committed-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Sam', '-c', 'user.email=sam@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();

test('HEAD MOVED SINCE THE START HOOK KEPT IT IS A COMMIT; the same HEAD, no kept commit or no file is none', async () => {
  const cwd = join(scratch, 'kiln');
  execFileSync('git', ['init', '-q', cwd]);
  writeFileSync(join(cwd, 'a.txt'), 'a\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'First');
  const start = git(cwd, 'rev-parse', 'HEAD');
  const env = { XDG_CONFIG_HOME: join(scratch, 'config') };
  assert.equal(await committedSince(env, cwd, 'claude-1'), false, 'no session file');
  writeSession(sessionPath(env, cwd, 'claude-1'), { host: 'h', spoken: 'S7', client_id: 'claude-1', head_at_start: start, at: '2026-10-24T00:00:00Z' });
  assert.equal(await committedSince(env, cwd, 'claude-1'), false, 'nothing committed yet');
  writeFileSync(join(cwd, 'b.txt'), 'b\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'Second');
  assert.equal(await committedSince(env, cwd, 'claude-1'), true);
  writeSession(sessionPath(env, cwd, 'claude-2'), { host: 'h', spoken: 'S8', client_id: 'claude-2', head_at_start: null, at: '2026-10-24T00:00:00Z' });
  assert.equal(await committedSince(env, cwd, 'claude-2'), false, 'a start with no commit kept says nothing');
});
