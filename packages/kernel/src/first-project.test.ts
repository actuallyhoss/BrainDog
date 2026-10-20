import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cleanName, firstProjectFields, firstProjectName, formsOnRepeat, nobodysPlace } from './first-project.ts';

describe('the first project formed from a first session', () => {
  it('cleans a repository name into words', () => {
    assert.equal(cleanName('my-app'), 'My app');
    assert.equal(cleanName('BrainDog'), 'BrainDog');
  });

  it('names it from the repository, else the remote, else the folder', () => {
    assert.equal(firstProjectName({ repo: 'lantern-shop' }), 'Lantern shop');
    assert.equal(firstProjectName({ remote: 'git@github.com:sam/kiln-works.git' }), 'Kiln works');
    assert.equal(firstProjectName({ cwd: '/Users/sam/Code/tidepool' }), 'Tidepool');
  });

  it('forms nothing from home or a scratch folder', () => {
    assert.equal(firstProjectName({ cwd: '/tmp' }), null);
    assert.equal(firstProjectName({ cwd: '/Users' }), null);
    assert.equal(firstProjectName({}), null);
  });

  it('fills lane, about, places and the draft mark, and only fields the list declares', () => {
    const all = firstProjectFields({ cwd: '/Users/sam/Code/tidepool', remote: 'github.com/sam/tidepool', doing: 'Wiring the tide table' }, 'Tidepool', () => true);
    assert.partialDeepStrictEqual(all, { name: 'Tidepool', lane: 'building', about: 'Wiring the tide table', repos: ['github.com/sam/tidepool'], folders: ['/Users/sam/Code/tidepool'], draft: true });
    const bare = firstProjectFields({ cwd: '/Users/sam/Code/tidepool' }, 'Tidepool', (f) => f === 'name');
    assert.deepEqual(bare, { name: 'Tidepool', lane: 'building' });
  });

  it('never forms a project from home, temp, scratch or a worktree folder', () => {
    for (const cwd of ['/Users/sam', '/tmp/play', '/private/tmp/x', '/Users/sam/Code/tidepool/.claude/worktrees/agent-1', '/Users/sam/Code/tidepool-wt', '/Users/sam/Code/wt-react'])
      assert.equal(nobodysPlace({ cwd }), true);
    assert.equal(nobodysPlace({ cwd: '/Users/sam/Code/tidepool', repo: 'tidepool' }), false);
  });

  it('forms a later project only from the second session out of the same repository', () => {
    const at = { repo: 'tidepool', cwd: '/Users/sam/Code/tidepool' };
    assert.equal(formsOnRepeat(at, 0), false);
    assert.equal(formsOnRepeat(at, 1), true);
    assert.equal(formsOnRepeat({ cwd: '/Users/sam/Code/tidepool' }, 3), false);
    assert.equal(formsOnRepeat({ ...at, cwd: '/tmp/tidepool' }, 3), false);
  });
});
