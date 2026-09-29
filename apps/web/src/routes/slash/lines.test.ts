/**
 * `/slash`'s sentence and its one figure: every number is one the record answered, and the red is what waits on him.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestionsOf, words as slash, type Reading } from '../../lib/record/slash.ts';
import { sentenceOf, tallyOf, words } from './lines.ts';

const READING: Reading = {
  model: null,
  quiet: null,
  noticed: [],
  drafts: [
    { question: 'Turn off Notes?', body_kind: 'pack', asked: { id: 'SG4', status: 'resolved' } },
    { question: 'Add Watch?', body_kind: 'pack', asked: { id: 'SG3', status: 'open' } },
    { question: 'Give Logbook a page of its own?', body_kind: 'arrange', asked: null },
    { question: 'Pin Kiln to Today?', body_kind: 'arrange', asked: null },
  ],
  waiting: [{ id: 'SG3', question: 'Add Watch?' }],
  cap: 3,
};

test('WHAT WAITS ON DECIDE LEADS THE SENTENCE, and it is the red phrase the sentence holds', () => {
  const s = sentenceOf(slash.byRules, 1);
  assert.equal(s.needs, 'One suggestion waits for you on Decide');
  assert.ok(s.text.startsWith(`${s.needs}. `));
  assert.ok(s.text.endsWith(slash.byRules));
});

test('NOTHING WAITING, NO RED: the sentence is who drafts, and only that', () => {
  assert.deepEqual(sentenceOf(slash.byRules, 0), { text: slash.byRules, needs: undefined });
  assert.equal(sentenceOf('x', 3).needs, '3 suggestions wait for you on Decide');
});

test('THE TILE COUNTS WHERE EACH SUGGESTION STANDS, and leaves out a part with none', () => {
  const t = tallyOf(suggestionsOf(READING), READING.waiting.length, READING.cap);
  assert.ok(t);
  assert.equal(t.total, 4);
  assert.deepEqual(
    t.parts.map((p) => [p.label, p.value, p.tone]),
    [
      [words.partWaiting, 1, 'warn'],
      [words.partNew, 2, 'ink'],
      [words.partAnswered, 1, 'earn'],
    ],
  );
  assert.equal(t.reading, '1 waits for you on Decide, 2 are not asked yet and you answered 1.');
  const none = tallyOf(suggestionsOf({ ...READING, drafts: READING.drafts.slice(2) }), 0, 3);
  assert.deepEqual(
    none?.parts.map((p) => p.label),
    [words.partNew],
  );
});

test('A FULL DECIDE IS SAID, with the record’s own cap, when new ones are held back by it', () => {
  const t = tallyOf(suggestionsOf(READING), 3, 3);
  assert.match(t?.reading ?? '', /Slash keeps at most 3 on Decide at once/u);
  assert.doesNotMatch(tallyOf(suggestionsOf(READING), 1, 3)?.reading ?? '', /at most/u);
});

test('NOTHING SUGGESTED, NO TILE: a number tile is never drawn over nothing', () => {
  assert.equal(tallyOf([], 0, 3), null);
});

test('NO EM DASH in anything this screen adds', () => {
  for (const w of Object.values(words)) {
    const line = typeof w === 'function' ? w(2) : w;
    assert.ok(!line.includes('—'), line);
  }
});
