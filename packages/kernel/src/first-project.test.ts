import { describe, expect, it } from 'vitest';

import { cleanName, firstProjectFields, firstProjectName } from './first-project.ts';

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
});
