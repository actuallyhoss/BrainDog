/**
 * AUDIT Z28 (today-390-light.png, decide-390-light.png): the red button read "Accept, can’t be undone easily" and
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

test('a hard answer says its care as a line under the row, and its button says its name (audit Z28)', () => {
  const hardSaid = (card as Record<string, unknown>).hardSaid as ((c: unknown, p: string | null) => string) | undefined;
  assert.equal(typeof hardSaid, 'function', 'no line under the row says the care');
  const hard = card.cardOf(ask({ cost: 'undo' }), { now });
  assert.equal(hardSaid!(hard, card.primaryOf(hard)), 'Can’t be undone easily');
  const safe = card.cardOf(ask(), { now });
  assert.equal(hardSaid!(safe, card.primaryOf(safe)), '', 'a safe answer says no care');

  const source = readFileSync(new URL('./DecisionCard.svelte', import.meta.url), 'utf8');
  const row = source.slice(source.indexOf('{#snippet inlineButtons('), source.indexOf('{/snippet}', source.indexOf('{#snippet inlineButtons(')));
  assert.doesNotMatch(row, /\{wayTail\(card, way, primary\)\}/u, 'the care is still said inside the button');
  assert.match(source, /<p class="dc-hard" id="\{uid\}-hard" dir="auto">\{hardLine\}<\/p>/u);
});
