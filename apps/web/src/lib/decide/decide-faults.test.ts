/**
 * FOUR FAULTS SEEN ON DECIDE (the look, fault K), each pinned: a heading over nothing, a struck "nothing" with an arrow,
 * a count that read as a rank, and the care of a hard answer said on every card.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { QueueQuestion } from '@braindog/kernel';

import { cardOf, cardWords, fieldChange, hardOf, pressSaid, pressTail, saysChanges, shiftLinesOf, shiftsOf } from './card.ts';
import { queueWords } from '../page/queue-answer.ts';
import { countSentence } from '../../routes/decide/lead.ts';
import { decide as copy } from '../copy/decide.ts';

const now = Date.parse('2026-10-06T09:00:00Z');
const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const ask = (over: Record<string, unknown> = {}): QueueQuestion =>
  ({
    id: 'SG7',
    who: 'agent:claude',
    at: '2026-10-06T07:00:00Z',
    kind: 'rowset',
    question: 'Change the review skill?',
    why: '',
    cost: 'shape',
    options: [],
    ...over,
  }) as QueueQuestion;

test('"WHAT IT CHANGES" IS A HEADING ONLY OVER A LINE; the link to the whole change alone is drawn alone', () => {
  const bare = cardOf(ask(), { now });
  assert.equal(saysChanges(bare), false, 'a card with no line of what it does, no money and no change still said it changes something');
  assert.equal(saysChanges(cardOf(ask({ changes: [{ field: 'due_on', before: 'Monday', after: 'Friday' }] }), { now })), true);
  assert.equal(saysChanges(cardOf(ask({ money: { amount: 1298, currency: 'GBP' } }), { now, home: 'GBP' })), true);
  assert.equal(saysChanges(cardOf(ask({ changes: [{ field: 'keys', before: [], after: null }] }), { now })), false, 'nothing to nothing is no line');

  const card = source('./DecisionCard.svelte');
  assert.match(card, /\{#if changesSaid\}\s*<div class="dc-part dc-part-changes" role="group"[^>]*>\s*<h4 class="dc-h"[^>]*>(?:\{#if card\.list\}\{cardWords\.changesIn\(card\.list\)\}\{:else\})?\{cardWords\.changes\}(?:\{\/if\})?<\/h4>/u, 'the heading is not under the test of a line');
  /* THE LINK IS LEFT OUT WHERE THE CARD ALREADY DRAWS THE WHOLE CHANGE, so it reads `seeLink`. */
  const alone = card.match(/\{:else if seeLink\}([\s\S]*?)\{\/if\}/u)?.[1] ?? '';
  assert.match(alone, /\{queueWords\.seeWhole\}/u, 'the link alone is not drawn');
  assert.doesNotMatch(alone, /cardWords\.changes|dc-h/u, 'the link alone still has the heading over it');
  assert.doesNotMatch(card, /\{#if changesAny\}/u, 'the heading is drawn on the link alone again');
});

test('A VALUE WHERE THERE WAS NONE IS SAID IN WORDS, never a struck "nothing" and an arrow', () => {
  const lines = (over: Record<string, unknown>) => shiftLinesOf(ask(over), 'GBP');
  assert.equal(lines({ changes: [{ field: 'due_on', before: null, after: 'Friday' }] })[0]?.said, 'Set to Friday');
  assert.equal(lines({ before: null, after: 'Weekly' })[0]?.said, 'Adds Weekly', 'with no field named, the value is what is added');
  assert.equal(lines({ changes: [{ field: 'due_on', before: 'Friday', after: '' }] })[0]?.said, 'Removes Friday');
  assert.equal(lines({ changes: [{ label: 'Keys it needs', before: [], after: ['Stripe'] }] })[0]?.said, 'Set to Stripe', 'a list of none is empty');
  assert.equal(lines({ changes: [{ field: 'due_on', before: 'Monday', after: 'Friday' }] })[0]?.said, null, 'a value that replaces another keeps the arrow');
  assert.equal(lines({ changes: [{ field: 'note', before: 'nothing', after: 'Later' }] })[0]?.said, null, 'a field whose text is the word is a value');

  /* BOTH SIDES EMPTY: no line, however the emptiness was sent ("Keys it needs nothing →" on the owner's screen). */
  for (const [before, after] of [[null, ''], [[], null], [undefined, []], ['', '  '], [[], []]] as const)
    assert.deepEqual(lines({ changes: [{ label: 'Keys it needs', before, after }] }), [], `${JSON.stringify(before)} to ${JSON.stringify(after)} drew a line`);
  assert.deepEqual(shiftsOf(ask({ changes: [{ label: 'Keys it needs', before: [], after: [] }] })), []);

  for (const said of [cardWords.setTo('x'), cardWords.adds('x'), cardWords.removes('x'), copy.arrangeSetTo]) assert.doesNotMatch(said, /—|nothing|\b(row|entity|list item)\b/iu);
  const card = cardOf(ask({ changes: [{ field: 'due_on', before: null, after: 'Friday' }] }), { now });
  assert.deepEqual(card.lines, [{ what: 'due on', before: 'nothing', after: 'Friday', said: 'Set to Friday' }]);

  /* THE CARD DRAWS THE PHRASE, and strikes only what is replaced. */
  const drawn = source('./DecisionCard.svelte');
  assert.match(drawn, /\{#if s\.said !== null\}\s*<span class="own-dir">\{s\.said\}<\/span>\s*\{:else\}\s*<span class="dc-before own-dir"/u, 'the struck value is drawn where there was none before');
  assert.doesNotMatch(drawn, /#each card\.shifts/u, 'the card draws the bare before and after again');

  /* THE WHOLE CHANGE, ON ITS OWN PAGE, the same way. */
  assert.equal(fieldChange('empty', 'Friday', 'empty'), 'set');
  assert.equal(fieldChange(null, 'Friday', 'empty'), 'set');
  assert.equal(fieldChange('Monday', 'Friday', 'empty'), 'change');
  assert.equal(fieldChange('Monday', 'empty', 'empty'), 'change');
  assert.equal(fieldChange('empty', 'empty', 'empty'), 'none');
  assert.equal(fieldChange(null, 'empty', 'empty'), 'none');
  const page = source('../../routes/decide/[id]/Arranged.svelte');
  assert.match(page, /fieldChange\(f\.before, f\.after, copy\.arrangeEmpty\)/u);
  assert.match(page, /\{#if how !== 'none'\}\s*<dt>/u, 'a field empty on both sides is still drawn');
  assert.match(page, /\{#if how === 'set'\}\s*<span class="arr-will"><span class="arr-tag">\{copy\.arrangeSetTo\}/u);
});

test('THE LEAD SAYS HOW MANY ARE HARD TO UNDO AS A COUNT, and never that they come first: the queue ranks by the wait before the band', () => {
  assert.match(countSentence(14, 10, undefined)?.text ?? '', / questions wait on you\. Ten of them are hard to undo\.$/u);
  assert.equal(countSentence(5, 2, 'Yes')?.text, 'Five questions wait on you. Two of them are hard to undo.');
  assert.equal(
    countSentence(12, 4, undefined, '', 3, 14)?.text,
    '12 questions wait on you, three of them for over two weeks. Four are hard to undo.',
    '"of them" is said twice in one sentence',
  );
  assert.equal(countSentence(8, 1, undefined)?.text, 'Eight questions wait on you. One of them is hard to undo.');
  assert.equal(countSentence(2, 2, undefined)?.text, 'Two questions wait on you. Both are hard to undo.');
  assert.equal(countSentence(3, 3, undefined)?.text, 'Three questions wait on you. All of them are hard to undo.');
  assert.equal(countSentence(1, 1, undefined)?.text, 'One question waits on you. It is hard to undo.');
  for (let n = 2; n <= 30; n++)
    for (let hard = 0; hard <= n; hard++) assert.doesNotMatch(countSentence(n, hard, undefined)?.text ?? '', /The first \w+ are|—/u, `${hard} of ${n}`);
});

test('THE CARE OF A HARD ANSWER IS SAID ONLY ON THE BAND `undo`, and no button is the deeper red for it', () => {
  for (const cost of ['call', 'shape', 'money', 'reach', '', 'UNDO', 'undoable']) {
    const card = cardOf(ask({ cost }), { now });
    assert.equal(hardOf(card), false, `${cost} read as hard to undo`);
    assert.equal(pressSaid(card, 'Accept'), 'Accept', `${cost} added the care to the button`);
    assert.equal(pressTail(card), '');
  }
  /* A CHANGE THE RECORD KEEPS A PRIOR VERSION OF comes as `shape`: nothing about its kind or its words makes it hard. */
  const wording = cardOf(ask({ cost: 'shape', kind: 'rowset', question: 'Change the review skill?', changes: [{ field: 'body', before: 'Old words', after: 'New words' }] }), { now });
  assert.equal(pressSaid(wording, 'Accept'), 'Accept');
  assert.equal(pressSaid(cardOf(ask({ cost: undefined }), { now }), 'Accept'), 'Accept', 'a question with no band read as hard');

  const hard = cardOf(ask({ cost: 'undo' }), { now });
  assert.equal(pressSaid(hard, 'Accept'), `Accept${queueWords.hardTail}`);
  assert.equal(pressTail(hard), queueWords.hardTail);
  assert.equal(queueWords.hard('Accept'), 'Accept, can’t be undone easily');

  /* THE WORDS ARE SAID THROUGH `card.ts` AND NOWHERE ELSE on the card, so no button says them on its own. */
  const drawn = source('./DecisionCard.svelte');
  assert.doesNotMatch(drawn, /queueWords\.hard(Tail)?\b/u, 'the card says the care without asking the band');
  assert.equal(source('./card.ts').match(/card\.cost === 'undo'/gu)?.length, 2, 'the band is read for the words in one place (`hardOf`), and for one press in `pressOf`');

  /* THE COLOUR: an answering button is the working accent (`--red-fill`) on every card, hard or not. The deeper red is
     for a refusal's words; no button takes it, and none is keyed on the band. */
  const css = source('./form.css');
  const buttons = [...`${css}\n${drawn}`.matchAll(/([^{}]*\.dc-btn[^{}]*)\{([^{}]*)\}/gu)];
  assert.ok(buttons.length > 0, 'the buttons’ rules were not read');
  for (const [, selector, body] of buttons) {
    assert.doesNotMatch(body ?? '', /--red(?![\w-])/u, `${selector?.trim()} paints an answering button the deeper red`);
    assert.doesNotMatch(selector ?? '', /data-cost|data-hard/u, `${selector?.trim()} colours a button by its band`);
  }
});
