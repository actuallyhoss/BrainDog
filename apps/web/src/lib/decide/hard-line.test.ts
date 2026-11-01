/**
 * The red button read "Accept, can’t be undone easily" and
 * wrapped onto two lines on the phone. The button says Accept, and the care is a line of its own under the row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { QueueQuestion } from '@braindog/kernel';
import * as card from './card.ts';

const now = Date.parse('2026-10-06T09:00:00Z');
const ask = (over: Record<string, unknown> = {}): QueueQuestion =>
  ({
    id: 'SG7',
    who: 'agent:claude',
    at: '2026-10-06T07:00:00Z',
    kind: 'options',
    question: 'Tidy the accounts?',
    why: '',
    cost: 'call',
    options: [
      { key: 'accept', label: 'Accept', because: '', recommended: true },
      { key: 'reject', label: 'Reject', because: '', recommended: false },
    ],
    ...over,
  }) as QueueQuestion;

test('a hard answer says its care as a line under the row, and its button says its name', () => {
  const hardSaid = (card as Record<string, unknown>).hardSaid as ((c: unknown, p: string | null, l?: string | null) => string) | undefined;
  assert.equal(typeof hardSaid, 'function', 'no line under the row says the care');
  const hard = card.cardOf(ask({ cost: 'undo' }), { now });
  /* NOT FILLED, SO NAMED (audit 6g, AG11): the hard answer is never the accent, and its line says which it is. */
  assert.equal(card.primaryOf(hard), null);
  assert.equal(hardSaid!(hard, card.primaryOf(hard), card.leadOf(hard)), 'Accepting can’t easily be undone');
  const safe = card.cardOf(ask(), { now });
  assert.equal(hardSaid!(safe, card.primaryOf(safe)), '', 'a safe answer says no care');

  const source = readFileSync(new URL('./DecisionCard.svelte', import.meta.url), 'utf8');
  const row = source.slice(source.indexOf('{#snippet inlineButtons('), source.indexOf('{/snippet}', source.indexOf('{#snippet inlineButtons(')));
  assert.doesNotMatch(row, /\{wayTail\(card, way, primary\)\}/u, 'the care is still said inside the button');
  /* AND SAYS WHY, in words of what the answer does, where there is a why: an answer its asker marked hard and said no
     more of stands as the warning alone, rather than the warning said twice. THE SPACE IS AN EXPRESSION, since a block's
     first whitespace is trimmed and the two sentences ran together. */
  assert.match(source, /<p class="dc-hard" id="\{uid\}-hard" dir="auto"><span class="dc-hard-word">\{hardLine\}\.<\/span>\{#if hardReason\}\{' '\}\{hardReason\}\{\/if\}<\/p>/u);
  assert.ok(card.hardWhy(card.cardOf(ask({ cost: 'undo', money: [{ amount: 1298, currency: 'GBP' }] }), { now })).startsWith('It changes amounts'));
});
