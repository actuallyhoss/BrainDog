/**
 * One count of what needs you: the rail's badge, the phone tab's badge and Today's sentence all ask `needYouCount`,
 * and the sentence says the badge's number, not a bigger one made of the tasks beside it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { needYouCount, sentenceOf } from './today-tiles.ts';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the badge and the sentence say the same number on the seed morning', () => {
  /* The seed's morning: eight questions open and seven things late. */
  const waits = { questions: 8 };
  assert.equal(needYouCount(waits, 3), 8, 'boot says the count');
  assert.equal(needYouCount(null, 3), 3, 'a host older than the field says what it was handed');
  const late = ['2026-07-03', '2026-08-01', '2026-08-20', '2026-09-01', '2026-09-10', '2026-09-20', '2026-09-30'];
  const said = sentenceOf(needYouCount(waits, 0) + late.length, late, 2, '2026-10-20', late.length);
  assert.match(said.text, /Eight more need you\./u);
  assert.doesNotMatch(said.text, /Twelve/u);
});

test('the rail, the tab and Today all read the one function', () => {
  /* The rail and the phone tab both take `open` from the shell. */
  assert.match(read('../../routes/+layout.svelte'), /const open = \$derived\(needYouCount\(/u);
  assert.match(read('./Today.svelte'), /needYouCount\(waits, t\.open\)/u);
  assert.match(read('./Today.svelte'), /sentenceOf\(needYou \+ lateDays\.length/u);
});
