/**
 * `dateSaid` and `datesIn`: the one way a day is said to a person, and a sentence's days said that way.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dateSaid, datesIn, slugWords } from './format.ts';

const NOW = Date.parse('2026-09-03T12:00:00Z');

test('A DAY IN THE READER\'S YEAR HAS NO YEAR, and one in another year keeps it', () => {
  assert.equal(dateSaid('2026-08-30', NOW), '30 Aug');
  assert.equal(dateSaid('2025-12-31', NOW), '31 Dec 2025');
  assert.equal(dateSaid('2026-09-04T09:00:00.000Z', NOW), '4 Sep');
});

test('A DAY IT CANNOT READ COMES BACK AS IT CAME', () => {
  assert.equal(dateSaid('soon', NOW), 'soon');
  assert.equal(dateSaid('2026-02-30', NOW), '2026-02-30');
});

test('A SENTENCE\'S DAYS ARE SAID AS A PERSON SAYS THEM, and an instant or an id is left alone', () => {
  assert.equal(datesIn('2026-08-28 · mail from halden.example', NOW), '28 Aug · mail from halden.example');
  assert.equal(datesIn('renews 2026-09-10', NOW), 'renews 10 Sep');
  assert.equal(datesIn('at 2026-09-03T09:00:00Z', NOW), 'at 2026-09-03T09:00:00Z');
  assert.equal(datesIn('Invoice 2026-041', NOW), 'Invoice 2026-041');
});

test('A NAME KEPT AS A SLUG IS SAID AS WORDS, and a person\'s own words are left alone', () => {
  assert.equal(slugWords('review-pr'), 'Review PR');
  assert.equal(slugWords('write_release_notes'), 'Write release notes');
  assert.equal(slugWords('Review the PR'), 'Review the PR');
  assert.equal(slugWords('kiln'), 'kiln', 'one word is not a slug, and may be a name');
});
