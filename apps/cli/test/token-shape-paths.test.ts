/**
 * A folder's hex name is not a key. A checkout kept at `.claude/worktrees/agent-<hex>` has the shape of a token in one
 * path segment, and a real token is still caught whether it stands alone, in a URL, after `=`, or inside a path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { holdsTokenShape } from '../src/install.ts';

test('a worktree-style path is not a key', () => {
  assert.equal(holdsTokenShape('/Users/someone/Developer/braindog/.claude/worktrees/agent-a335206d9257debd9/apps/cli/hooks/start.mjs'), false);
  assert.equal(holdsTokenShape('~/Developer/x/agent-a335206d9257debd9/run.ts'), false);
});

test('a real token is still caught, alone, in a URL, after = and inside a path', () => {
  const token = 'tq7Rw2xT9kLm4Pz8Vb3N';
  assert.equal(holdsTokenShape(token), true);
  assert.equal(holdsTokenShape(`sk-${token}`), true);
  assert.equal(holdsTokenShape(`https://host.example/mcp/${token}`), true);
  assert.equal(holdsTokenShape(`KEY=${token}`), true);
  assert.equal(holdsTokenShape(`/srv/app?key=${token}`), true);
  assert.equal(holdsTokenShape(`/home/me/sk-${token}/run.ts`), true);
  assert.equal(holdsTokenShape(`/home/me/${'a1B2'.repeat(8)}/run.ts`), true);
});
