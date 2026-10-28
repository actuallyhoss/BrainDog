import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TOPIC_MAX, cleanName, firstProjectFields, firstProjectName, formsOnRepeat, nobodysPlace, noPlace, topicName } from './first-project.ts';

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

  it('forms a later project from a new repository at once, and from a bare folder on its second session', () => {
    const at = { repo: 'tidepool', cwd: '/Users/sam/Code/tidepool' };
    assert.equal(formsOnRepeat(at, 0), true);
    assert.equal(formsOnRepeat({ cwd: '/Users/sam/Code/tidepool' }, 0), false);
    assert.equal(formsOnRepeat({ cwd: '/Users/sam/Code/tidepool' }, 1), true);
    assert.equal(formsOnRepeat({ ...at, cwd: '/tmp/tidepool' }, 3), false);
  });
});

describe('the first project of an agent with no folder, named by its topic', () => {
  it('names it from the topic when the session says nothing of where it is', () => {
    assert.equal(firstProjectName({ topic: 'kiln works' }), 'Kiln works');
    assert.equal(firstProjectName({ topic: '  BrainDog  ' }), 'BrainDog');
    assert.equal(firstProjectName({ topic: '"Tidepool."' }), 'Tidepool');
  });

  it('never names it from the topic when the session says where it is', () => {
    assert.equal(firstProjectName({ repo: 'lantern-shop', topic: 'Kiln works' }), 'Lantern shop');
    /* A FOLDER THAT NAMES NOTHING IS STILL A PLACE: the topic is for an agent with none. */
    assert.equal(firstProjectName({ cwd: '/tmp', topic: 'Kiln works' }), null);
  });

  it('tells a session with no repository, remote or folder', () => {
    assert.equal(noPlace({}), true);
    assert.equal(noPlace({ repo: ' ', cwd: '' }), true);
    assert.equal(noPlace({ cwd: '/Users/sam/Code/tidepool' }), false);
    assert.equal(noPlace({ remote: 'github.com/sam/tidepool' }), false);
  });

  it('makes no name of an answer that names nothing, or of a sentence', () => {
    for (const vague of ['', '   ', 'nothing', 'General', 'help', 'n/a', 'misc', 'stuff'])
      assert.equal(topicName(vague), null, vague);
    assert.equal(topicName(undefined), null);
    assert.equal(topicName('x'.repeat(TOPIC_MAX + 1)), null);
    assert.equal(topicName('x'.repeat(TOPIC_MAX)), `X${'x'.repeat(TOPIC_MAX - 1)}`);
  });

  it('fills a topic project with no places, only the draft mark and what the agent is doing', () => {
    const fields = firstProjectFields({ topic: 'Kiln works', doing: 'Drafting the launch post' }, 'Kiln works', () => true);
    assert.deepEqual(fields, { name: 'Kiln works', lane: 'building', about: 'Drafting the launch post', draft: true });
  });
});
