import { test } from 'node:test';
import assert from 'node:assert/strict';

import { briefFromNote } from './brief.ts';

const IMPORTED = [
  'Fan pages that pay their makers.',
  'Status in Old Tool: live. Kind: work.',
  '',
  '```chips',
  'dollar | {{revenue.monthly}} | Monthly | good',
  'users | 12 | Fans | info',
  '```',
  '',
  '# Encore',
  '',
  '## Notes',
  'Launch is set for spring. Mateo leads the build.',
  '',
  '## Blockers',
  '- Waiting on the app store review.',
].join('\n');

test('THE IMPORTED SHAPE LEAVES ONLY ITS REAL FIRST SENTENCES', () => {
  assert.deepEqual(briefFromNote(IMPORTED, 'Encore'), ['Fan pages that pay their makers.', 'Launch is set for spring.']);
});

test('A NOTE THAT IS ONLY LEFTOVERS GIVES NOTHING', () => {
  const only = 'Status in Old Tool: researched. Kind: idea.\n```chips\nstar | {{portfoli.x}} | Score | info\n```\n# Idea\n## Plan';
  assert.deepEqual(briefFromNote(only, 'Idea'), []);
  assert.deepEqual(briefFromNote('', 'x'), []);
});

test('A LINE WITH AN UNFILLED SLOT, A TAG OR AN ID IS DROPPED, A PLAIN ONE KEPT', () => {
  assert.deepEqual(briefFromNote('Earns {{revenue.monthly}} a month.\nTagged oldtool:project:encore.\nSee kiln#12.\nA quiet shop.', ''), ['A quiet shop.']);
});

test('MARKDOWN MARKS GO, THE NAME ALONE ON A LINE GOES, AN UNCLOSED FENCE DROPS ITS REST', () => {
  assert.deepEqual(briefFromNote('Encore\n- **Bold** plan with [a link](http://x).\n```chips\nnever shown', 'encore'), ['Bold plan with a link.']);
});
