/**
 * The card an ask on `/slash` draws where he asked: one card, from the palette's own `filedCard`, saying
 * both names once answered; none for a reading; and, left unanswered, the filing that already waits on Decide.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { SlashProposal } from '@braindog/client';

import { answeredLine, cardOf } from '../../lib/decide/card.ts';
import { drawProposal } from '../../lib/palette/slash.ts';
import { cardInPlace, enterOn, leftUnanswered, words } from './in-place.ts';

const NOW = Date.parse('2026-10-14T09:00:00Z');

const CHANGE: SlashProposal = {
  text: 'A page for {{ref:tasks#1}} would hold what is late.',
  citations: ['tasks#1'],
  verbs: ['decide', 'defer', 'dismiss'],
  body_kind: 'rowset',
  body: { register: 'tasks', rows: [{ title: 'Chase Acme' }] },
  model: 'glm-5.3',
  filed: 'SG21',
  read: [],
};

const READ_ONLY: SlashProposal = { ...CHANGE, body_kind: 'query', verbs: ['edit', 'save', 'open'], filed: null };

test('AN ANSWER THAT PROPOSES A CHANGE GIVES ONE CARD, the palette’s own, and it says both names once answered', () => {
  const inPlace = cardInPlace(CHANGE, '  make me a page for what is late ', NOW);
  assert.ok(inPlace, 'a filed change draws its card where he asked');
  assert.equal(inPlace.answered, false);
  assert.equal(inPlace.decide, '/decide/SG21');
  assert.equal(inPlace.question.question, 'make me a page for what is late', 'the card asks what he asked');
  /* ONE DRAW FUNCTION: the palette's card for the same answer is this card, field for field. */
  assert.deepEqual(inPlace.question, drawProposal(CHANGE, 'make me a page for what is late', NOW).card);

  const card = cardOf(inPlace.question, { me: null, names: new Map(), now: NOW });
  assert.equal(card.slash, true, 'Slash suggested it');
  const accept = card.ways.find((w) => w.key === card.enter);
  assert.ok(accept, 'Enter has an answer to give on a change that moves no money');
  assert.equal(answeredLine(card, accept, 'Mara', 'just now'), 'Slash suggested · Mara accepted');
});

test('A READING CHANGES NOTHING, so there is no card, and neither is there without the ask', () => {
  assert.equal(cardInPlace(READ_ONLY, 'what is late?', NOW), null);
  assert.equal(cardInPlace(CHANGE, '   ', NOW), null);
  assert.equal(cardInPlace({ ...CHANGE, body_kind: 'options', body: { options: [] } }, 'which plan?', NOW), null, 'options with none to choose');
});

test('LEFT UNANSWERED, IT WAITS ON DECIDE, where the record filed it; answered, it leaves nothing', () => {
  const inPlace = cardInPlace(CHANGE, 'make me a page for what is late', NOW);
  assert.ok(inPlace);
  assert.deepEqual(leftUnanswered(inPlace), { id: 'SG21', decide: '/decide/SG21', said: words.waits });
  assert.equal(leftUnanswered({ ...inPlace, answered: true }), null, 'held for its Undo or sent, nothing is left');
  assert.equal(leftUnanswered(null), null, 'a reading left nothing to wait');
  for (const s of Object.values(words)) assert.doesNotMatch(s, /—|SG\d|\brow\b/u);
});

test('ENTER IN THE ASK FIELD ACCEPTS THE CARD while the field still holds its question, and asks anew otherwise', () => {
  const inPlace = cardInPlace(CHANGE, 'make me a page for what is late', NOW);
  assert.equal(enterOn(inPlace, 'make me a page for what is late ', 'make me a page for what is late'), 'accept');
  assert.equal(enterOn(inPlace, 'what is late?', 'make me a page for what is late'), 'ask');
  assert.equal(enterOn(inPlace && { ...inPlace, answered: true }, 'make me a page for what is late', 'make me a page for what is late'), 'ask');
  assert.equal(enterOn(null, 'anything', 'anything'), 'ask');
});
