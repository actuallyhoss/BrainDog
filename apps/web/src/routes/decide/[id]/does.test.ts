/**
 * THE LINE ON THE FOLDED "WHAT ACCEPTING DOES" TILE: the first part of what accepting does that the question has, in the
 * words the queue already said it in, so a person who never opens the tile still reads what a yes changes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copy } from '../../../lib/copy.ts';
import { installWords } from '../../../lib/record/actions.ts';
import { doesLine, type Does } from './does.ts';
import { words as pickWords } from './picked.ts';
import { words } from '../words.ts';

const none: Does = { story: null, appears: [], picks: null, updates: null, calls: 0 };

test('an arrangement says its lead and its summary first, whatever else it does', () => {
  assert.equal(doesLine({ ...none, story: { lead: 'Sets up Money', summary: '2 pages' }, updates: { n: 3, list: 'Tasks' } }), copy.arrangeLeadSummary('Sets up Money', '2 pages'));
  assert.equal(doesLine({ ...none, story: { lead: 'Sets up Money', summary: '' } }), 'Sets up Money');
});

test('then what it puts in place, then the rows it adds or changes, then what it calls', () => {
  assert.equal(doesLine({ ...none, appears: [{ kind: 'Page', title: 'Kiln' }] }), 'Page: Kiln');
  assert.equal(doesLine({ ...none, appears: [{ kind: 'Page', title: 'Kiln' }, { kind: 'List', title: 'Glazes' }] }), words.andMore('Page: Kiln', 1));
  assert.equal(doesLine({ ...none, picks: { on: 2, of: 3 }, updates: { n: 1, list: 'Tasks' } }), pickWords.some(2, 3));
  assert.equal(doesLine({ ...none, updates: { n: 3, list: 'Tasks' } }), `${copy.decideRows(3, 'Tasks')}.`);
  assert.equal(doesLine({ ...none, calls: 2 }), `${installWords.heading}.`);
});

test('a question that changes nothing it can name says what the fold holds then: why it is asked and what it costs', () => {
  assert.equal(doesLine(none), words.doesOpen);
  assert.equal(doesLine({ ...none, updates: { n: 0, list: 'Tasks' } }), words.doesOpen);
});

test('the line names the person’s own things, never the system’s', () => {
  for (const d of [none, { ...none, updates: { n: 1, list: 'Tasks' } }, { ...none, picks: { on: 1, of: 2 } }])
    assert.doesNotMatch(doesLine(d), /\b(row|rows|entity|register|list item)\b/iu);
});
