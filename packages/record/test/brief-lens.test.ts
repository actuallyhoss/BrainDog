/**
 * A kept brief is shown only through the lens it was written through (sharing plan T16, `briefLensOf`): a reader whose
 * facts happen to equal the whole record's is still answered the rules, since what a model wrote was written for
 * whoever reads it all. A brief kept before lenses was gathered whole and stands for the whole record's readers alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { BriefFact } from '../src/briefing.ts';
import { WHOLE_LENS, briefLensOf, briefTick, keptBrief, type KeptBrief } from '../src/brief-write.ts';
import { WRITTEN_KEPT, writtenOf, writtenShown, writtenTick } from '../src/written-brief.ts';

const NOW = Date.UTC(2026, 9, 22, 9);

const FACTS: BriefFact[] = [
  { h: 'f1', kind: 'late', title: 'Water bill', figures: { days: '3' }, row: 'bills#4', cause: null, rank: 4 },
];

const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const sam = { principal: { kind: 'person', id: 'p_sam', level: null }, registers: ['bills'], levels: { bills: 'read' }, wheres: { bills: { field: 'thing', is: 'kiln' } } };
const hidden = { principal: { kind: 'person', id: 'p_pri', level: 'read' }, hides: { bills: ['amount'] } };
const across = (ctx: never): boolean => (ctx as { registers?: unknown }).registers === undefined;

test('THE WHOLE RECORD\'S READER IS ONE LENS, AND A NARROWED OR AMOUNT-HIDING READER EACH THEIR OWN', () => {
  assert.equal(briefLensOf(owner, across), WHOLE_LENS);
  assert.notEqual(briefLensOf(sam, across), WHOLE_LENS);
  assert.notEqual(briefLensOf(hidden, across), WHOLE_LENS, 'hidden fields read across are still a lens of their own');
  assert.notEqual(briefLensOf(sam, across), briefLensOf({ ...sam, principal: { ...sam.principal, id: 'p_lee' } }, across));
});

test('A WRITTEN BRIEF KEPT FOR THE WHOLE RECORD IS NOT SHOWN TO SAM, WHOSE FACTS MATCH', async () => {
  const store = new Map<string, unknown>();
  const ask = async () => ({ raw: { sentences: ['Water bill is {{f1.days}} days late.'] } });
  const tick = (now: number) =>
    writtenTick({ version: 1, facts: () => FACTS, now, zone: 'UTC', read: (k) => store.get(k), write: (k, v) => void store.set(k, v), ask: ask as never });
  await tick(NOW);
  await tick(NOW + 120_000);
  assert.ok(writtenOf({ sentences: ['Water bill is {{f1.days}} days late.'] }, FACTS).sentences.length > 0, 'the stand-in answer is not one the brief keeps');
  const kept = store.get(WRITTEN_KEPT);
  assert.ok(kept, 'the brief was not kept');
  assert.ok(writtenShown(kept, FACTS, briefLensOf(owner, across)), 'the owner is not shown the brief');
  assert.equal(writtenShown(kept, FACTS, briefLensOf(sam, across)), null, 'Sam was shown a brief written for the whole record');
  /* ONE KEPT BEFORE LENSES SAYS NONE, and stands for the whole record's readers alone. */
  const { lens: _lens, ...old } = kept as { lens?: string };
  assert.ok(writtenShown(old, FACTS));
  assert.equal(writtenShown(old, FACTS, briefLensOf(sam, across)), null);
});

test('THE RULES\' KEPT CARDS ARE KEYED THE SAME WAY', async () => {
  const store = new Map<string, unknown>();
  const out = await briefTick({
    facts: FACTS,
    now: NOW,
    zone: 'UTC',
    read: (k) => store.get(k),
    write: (k, v) => void store.set(k, v),
    ask: async () => ({ raw: { cards: [{ h: 'f1', line: 'Water bill is {{days}} days late.' }] } }),
  });
  const kept = out.kept as KeptBrief;
  assert.equal(kept.lens, WHOLE_LENS);
  assert.ok(keptBrief(kept, FACTS, briefLensOf(owner, across)));
  assert.equal(keptBrief(kept, FACTS, briefLensOf(sam, across)), null);
});
