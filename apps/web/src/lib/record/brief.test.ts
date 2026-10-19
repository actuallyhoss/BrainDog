import { test } from 'node:test';
import assert from 'node:assert/strict';

import { briefFromNote, noteWithoutLeftovers } from './brief.ts';

test('THE FULL NOTE LOSES ITS STATUS LINE AND A HEADING REPEATING THE NAME, AND NOTHING ELSE', () => {
  const full = '# Lanternfish\n\nStatus in Old Tool: live. Kind: work.\n\n```chips\nusers | 12 | Fans | info\n```\n\n## Notes\nLaunch is set for spring.';
  assert.equal(noteWithoutLeftovers(full, 'Lanternfish'), '```chips\nusers | 12 | Fans | info\n```\n\n## Notes\nLaunch is set for spring.');
  assert.equal(noteWithoutLeftovers('# Other name\nBody', 'Lanternfish'), '# Other name\nBody');
  assert.equal(noteWithoutLeftovers('Body\n# Lanternfish\nMore', 'Lanternfish'), 'Body\n# Lanternfish\nMore');
  assert.equal(noteWithoutLeftovers('Status in plans: we are ahead.', 'Lanternfish'), 'Status in plans: we are ahead.');
});

const IMPORTED = [
  'Fan pages that pay their makers.',
  'Status in Old Tool: live. Kind: work.',
  '',
  '```chips',
  'dollar | {{revenue.monthly}} | Monthly | good',
  'users | 12 | Fans | info',
  '```',
  '',
  '# Lanternfish',
  '',
  '## Notes',
  'Launch is set for spring. Mateo leads the build.',
  '',
  '## Blockers',
  '- Waiting on the app store review.',
].join('\n');

test('THE IMPORTED SHAPE LEAVES ONLY ITS REAL FIRST SENTENCES', () => {
  assert.deepEqual(briefFromNote(IMPORTED, 'Lanternfish'), ['Fan pages that pay their makers.', 'Launch is set for spring.']);
});

test('A NOTE THAT IS ONLY LEFTOVERS GIVES NOTHING', () => {
  const only = 'Status in Old Tool: researched. Kind: idea.\n```chips\nstar | {{portfoli.x}} | Score | info\n```\n# Idea\n## Plan';
  assert.deepEqual(briefFromNote(only, 'Idea'), []);
  assert.deepEqual(briefFromNote('', 'x'), []);
});

test('A LINE WITH AN UNFILLED SLOT, A TAG OR AN ID IS DROPPED, A PLAIN ONE KEPT', () => {
  assert.deepEqual(briefFromNote('Earns {{revenue.monthly}} a month.\nTagged oldtool:project:lanternfish.\nSee kiln#12.\nA quiet shop.', ''), ['A quiet shop.']);
});

test('MARKDOWN MARKS GO, THE NAME ALONE ON A LINE GOES, AN UNCLOSED FENCE DROPS ITS REST', () => {
  assert.deepEqual(briefFromNote('Lanternfish\n- **Bold** plan with [a link](http://x).\n```chips\nnever shown', 'lanternfish'), ['Bold plan with a link.']);
});

test('A LINE OF KEY: VALUE PAIRS IS METADATA AND GOES, BOLD OR NOT, WHILE ONE LABEL IN A SENTENCE STAYS', () => {
  const name = 'Lanternfish';
  const bold = `**Status:** building · **Lane:** ship · **Repo:** ${name}-app (v2) · **Domain:** ${name}.example`;
  assert.deepEqual(briefFromNote(`${bold}\n\nA small game about fish.`, name), ['A small game about fish.']);
  assert.deepEqual(briefFromNote(`Status: building | Lane: ship\nA small game about fish.`, name), ['A small game about fish.']);
  assert.deepEqual(briefFromNote('Note: this one is a sentence.', name), ['Note: this one is a sentence.']);
});
