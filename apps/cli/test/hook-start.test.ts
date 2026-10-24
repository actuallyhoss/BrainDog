/**
 * What the start hook reads without a process, held to what git says.
 *
 * `headOnDisk` answers what `git rev-parse HEAD` answers, from git's files, in every shape a repository on his Mac
 * takes: a branch, packed refs, a detached HEAD, a worktree, and an unborn branch (none, so git is asked).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { childHeads, headOnDisk } from '../src/people.ts';

const gitIn = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true }).trim();

function repository(dir: string): (message: string) => string {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '--quiet', '-b', 'main');
  gitIn(dir, 'config', 'user.name', 'Owner');
  gitIn(dir, 'config', 'user.email', 'owner@example.com');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  return (message) => {
    gitIn(dir, 'commit', '--quiet', '--allow-empty', '-m', message);
    return gitIn(dir, 'rev-parse', 'HEAD');
  };
}

test('A HEAD READ FROM GIT’S FILES IS THE ONE GIT SAYS: a branch, packed refs, detached, a worktree, and none when unborn', (t) => {
  const top = mkdtempSync(join(tmpdir(), 'braindog-head-'));
  t.after(() => rmSync(top, { recursive: true, force: true }));

  const branch = join(top, 'branch');
  const commit = repository(branch);
  commit('one');
  const two = commit('two');
  assert.equal(headOnDisk(branch), two);

  const packed = join(top, 'packed');
  const inPacked = repository(packed);
  const sha = inPacked('one');
  gitIn(packed, 'pack-refs', '--all');
  assert.equal(headOnDisk(packed), sha);
  assert.equal(headOnDisk(packed), gitIn(packed, 'rev-parse', 'HEAD'));

  const detached = join(top, 'detached');
  const inDetached = repository(detached);
  const first = inDetached('one');
  inDetached('two');
  gitIn(detached, 'checkout', '--quiet', first);
  assert.equal(headOnDisk(detached), first);

  const tree = join(top, 'tree');
  gitIn(branch, 'worktree', 'add', '--quiet', '-b', 'side', tree);
  assert.equal(headOnDisk(tree), gitIn(tree, 'rev-parse', 'HEAD'));
  gitIn(tree, 'commit', '--quiet', '--allow-empty', '-m', 'on the side');
  assert.equal(headOnDisk(tree), gitIn(tree, 'rev-parse', 'HEAD'));
  assert.notEqual(headOnDisk(tree), headOnDisk(branch));

  const unborn = join(top, 'unborn');
  repository(unborn);
  assert.equal(headOnDisk(unborn), null);
  assert.equal(headOnDisk(join(top, 'nothing')), null);

  /* THE FOLDER OF REPOSITORIES the start hook keeps: every HEAD git has, and nothing for the unborn one. */
  return childHeads(top).then((heads) =>
    assert.deepEqual(heads, {
      branch: gitIn(branch, 'rev-parse', 'HEAD'),
      detached: first,
      packed: sha,
      tree: gitIn(tree, 'rev-parse', 'HEAD'),
    }),
  );
});
