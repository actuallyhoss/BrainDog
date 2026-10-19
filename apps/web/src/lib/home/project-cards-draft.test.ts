/**
 * A project the record formed from the agent's first session is a draft card that leads the desk, and can be taken
 * back without a question only while it is fresh.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FRESH_DRAFT_MS, cardsOf, takenBackFree, type CardDecl } from './project-cards.ts';

const decl: CardDecl = { id: 'ventures', title: 'name', state: 'lane', scopes: {}, fields: [{ id: 'name', type: 'text' }] };

test('a draft leads the desk before an earning project', () => {
  const { cards } = cardsOf(decl, [
    { seq: 1, fields: { name: 'Old', lane: 'earning' } },
    { seq: 2, fields: { name: 'Tidepool', lane: 'building', draft: true }, created_at: '2026-10-20T10:00:00.000Z' },
  ]);
  assert.deepEqual(cards.map((c) => [c.name, c.draft, c.seq]), [['Tidepool', true, 2], ['Old', false, 1]]);
});

test('a kept project is no draft', () => {
  const { cards } = cardsOf(decl, [{ seq: 1, fields: { name: 'Tidepool', lane: 'building', draft: false } }]);
  assert.equal(cards[0]!.draft, false);
});

test('only a fresh draft is taken back without a question', () => {
  const made = '2026-10-20T10:00:00.000Z';
  const at = Date.parse(made);
  assert.equal(takenBackFree({ draft: true, made }, at + 60_000), true);
  assert.equal(takenBackFree({ draft: true, made }, at + FRESH_DRAFT_MS + 1), false);
  assert.equal(takenBackFree({ draft: false, made }, at + 1000), false);
  assert.equal(takenBackFree({ draft: true, made: null }, at), false);
});
