/**
 * Home's one line: the model's when it is today's, the rules' otherwise, and the red phrase only where the model says
 * the rules' words.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cutLine, homeLineOf, modelLineOf, phraseAt, recordDay } from './home-line.ts';

/* JUST AFTER MIDNIGHT IN UTC, where the record dates its lines, whatever the reader's own zone says. */
const NOW = Date.parse('2026-10-02T00:30:00Z');

test('A LINE IS TODAY`S ON THE RECORD`S DAY, and one sent as words is the record`s to vouch for', () => {
  assert.equal(recordDay(NOW), '2026-10-02');
  assert.equal(modelLineOf({ text: ' Calm day. ', day: '2026-10-02', basis: 'b' }, NOW), 'Calm day.');
  assert.equal(modelLineOf({ text: 'Calm day.', day: '2026-10-01', basis: 'b' }, NOW), null);
  assert.equal(modelLineOf('Calm day.', NOW), 'Calm day.');
  for (const raw of [undefined, null, '', ' ', 3, [], { day: '2026-10-02' }, { text: 'x' }]) assert.equal(modelLineOf(raw, NOW), null);
});

test('THE RULES` PHRASE IS FOUND WORD FOR WORD, case aside, a count spelled or in digits, and never inside a longer word', () => {
  assert.deepEqual(phraseAt('Oxbow first; four things need you.', 'Four things need you'), [13, 33]);
  assert.deepEqual(phraseAt('Oxbow first; 4 things need you.', 'Four things need you'), [13, 30]);
  assert.deepEqual(phraseAt('Of these, two are 3 days late.', 'three days late'), [18, 29]);
  assert.deepEqual(phraseAt('Of these, two are late.', 'two are late'), [10, 22]);
  assert.equal(phraseAt('Twenty-two are late.', 'two are late'), null);
  assert.equal(phraseAt('Of these, two are lately fine.', 'two are late'), null);
  assert.equal(phraseAt('Of these, two were late.', 'two are late'), null);
  assert.equal(phraseAt('Anything (at all).', ''), null);
  assert.deepEqual(phraseAt('Costs (GBP 4).', '(GBP 4)'), [6, 13]);
});

test('THE MODEL`S LINE CARRIES THE RED IN ITS OWN CASE, and with nothing fresh the rules` line is handed back whole', () => {
  const rules = { text: 'Four things need you, and two agents are working.', needs: 'Four things need you' };
  const said = homeLineOf(rules, { text: 'Oxbow leads: four things need you before noon.', day: '2026-10-02', basis: 'b' }, NOW);
  assert.deepEqual(said, { text: 'Oxbow leads: four things need you before noon.', needs: 'four things need you', by: 'slash' });
  assert.deepEqual(cutLine(said), { before: 'Oxbow leads: ', needs: 'four things need you', after: ' before noon.' });
  assert.deepEqual(homeLineOf(rules, undefined, NOW), { ...rules, by: 'rules' });
  /* A CALM MORNING HAS NO RED PHRASE, so the model's line has none either. */
  assert.equal(homeLineOf({ text: 'Nothing needs you, and no agent is working.', needs: '' }, 'Nothing needs you today.', NOW).needs, '');
  assert.deepEqual(cutLine({ text: 'Calm.', needs: '' }), { before: 'Calm.', needs: '', after: '' });
  /* CUT WHERE IT WAS FOUND, as whole words, and never from inside a longer word earlier in the line. */
  const twice = homeLineOf({ text: 'Two are late.', needs: 'two are late' }, 'Twenty-two are late in all; two are late today.', NOW);
  assert.deepEqual(cutLine(twice), { before: 'Twenty-two are late in all; ', needs: 'two are late', after: ' today.' });
});
