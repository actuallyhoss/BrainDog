import { describe, expect, it } from 'vitest';

import { cleanName, firstProjectFields, firstProjectName, formsOnRepeat, nobodysPlace } from './first-project.ts';

describe('the first project formed from a first session', () => {
  it('cleans a repository name into words', () => {
    expect(cleanName('my-app')).toBe('My app');
    expect(cleanName('BrainDog')).toBe('BrainDog');
  });

  it('names it from the repository, else the remote, else the folder', () => {
    expect(firstProjectName({ repo: 'lantern-shop' })).toBe('Lantern shop');
    expect(firstProjectName({ remote: 'git@github.com:sam/kiln-works.git' })).toBe('Kiln works');
    expect(firstProjectName({ cwd: '/Users/sam/Code/tidepool' })).toBe('Tidepool');
  });

  it('forms nothing from home or a scratch folder', () => {
    expect(firstProjectName({ cwd: '/tmp' })).toBeNull();
    expect(firstProjectName({ cwd: '/Users' })).toBeNull();
    expect(firstProjectName({})).toBeNull();
  });

  it('fills lane, about, places and the draft mark, and only fields the list declares', () => {
    const all = firstProjectFields({ cwd: '/Users/sam/Code/tidepool', remote: 'github.com/sam/tidepool', doing: 'Wiring the tide table' }, 'Tidepool', () => true);
    expect(all).toMatchObject({ name: 'Tidepool', lane: 'building', about: 'Wiring the tide table', repos: ['github.com/sam/tidepool'], folders: ['/Users/sam/Code/tidepool'], draft: true });
    const bare = firstProjectFields({ cwd: '/Users/sam/Code/tidepool' }, 'Tidepool', (f) => f === 'name');
    expect(bare).toEqual({ name: 'Tidepool', lane: 'building' });
  });

  it('never forms a project from home, temp, scratch or a worktree folder', () => {
    for (const cwd of ['/Users/sam', '/tmp/play', '/private/tmp/x', '/Users/sam/Code/tidepool/.claude/worktrees/agent-1', '/Users/sam/Code/tidepool-wt', '/Users/sam/Code/wt-react'])
      expect(nobodysPlace({ cwd })).toBe(true);
    expect(nobodysPlace({ cwd: '/Users/sam/Code/tidepool', repo: 'tidepool' })).toBe(false);
  });

  it('forms a later project only from the second session out of the same repository', () => {
    const at = { repo: 'tidepool', cwd: '/Users/sam/Code/tidepool' };
    expect(formsOnRepeat(at, 0)).toBe(false);
    expect(formsOnRepeat(at, 1)).toBe(true);
    expect(formsOnRepeat({ cwd: '/Users/sam/Code/tidepool' }, 3)).toBe(false);
    expect(formsOnRepeat({ ...at, cwd: '/tmp/tidepool' }, 3)).toBe(false);
  });
});
