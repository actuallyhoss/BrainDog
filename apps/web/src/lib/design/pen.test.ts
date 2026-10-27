/**
 * The holding pen's one count: the record is the one recommender, so the browser counts what the record sent
 * and adds nothing of its own. The navigation shape is never offered: one sidebar and one bar for everyone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayOf, penCount, penOf, waiting, type PenItem } from './pen.ts';
import * as pen from './pen.ts';

const item = (id: string, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  kind: 'page',
  register: 'garden-beds',
  title,
  why: `${title} has grown.`,
  change: { to: { id: `page.${id}`, kind: 'page', body: { title } } },
  ...extra,
});

const four: PenItem[] = penOf([
  item('page:garden-beds', 'Garden beds', { lapses: '2026-10-27' }),
  item('page:seed-swaps', 'Seed swaps', { lapses: '2026-10-28' }),
  item('week:garden-beds', 'Garden beds this week'),
  item('page:tool-shed', 'Tool shed', { lapses: '2026-11-02' }),
]);
const none = (): boolean => false;

test('FOUR RECORD OFFERS COUNT AS THE RECORD SENDS THEM, in its order', () => {
  assert.equal(four.length, 4);
  assert.equal(penCount(four, none), 4);
  const list = waiting(four, none);
  assert.equal(list.length, penCount(four, none), 'the list and its number differ');
  assert.deepEqual(
    list.map((o) => o.item.title),
    ['Garden beds', 'Seed swaps', 'Garden beds this week', 'Tool shed'],
  );
});

test('A DISMISSED OFFER IS NOT COUNTED, nor is the same offer sent twice', () => {
  const gone = (id: string) => id === 'page:seed-swaps';
  assert.equal(penCount(four, gone), 3);
  assert.equal(penCount([...four, four[0]!], none), 4);
});

test('NO SHAPE OFFER ON ANY WIDTH: the browser makes none, and one a host still sends is left out', () => {
  assert.equal('shapeOffer' in pen, false);
  const theirs = penOf([{ ...item('shape:bar', 'Try the top bar'), kind: 'shape' }, item('shape:rail', 'Try the rail')]);
  assert.equal(penCount([...four, ...theirs], none), 4);
  assert.ok(waiting([...four, ...theirs], none).every((o) => !o.item.id.startsWith('shape:') && o.item.kind !== 'shape'));
});

test('NEVER MORE THAN THE RECORD SENT', () => {
  for (let n = 0; n <= 6; n += 1) {
    const sent = penOf(Array.from({ length: n }, (_, i) => item(`page:bed-${i}`, `Bed ${i}`)));
    assert.equal(penCount(sent, none), sent.length);
  }
});

test('NO ICON OFFER IS MADE BY THE BROWSER: nothing to make one with, and nothing added to the count', () => {
  assert.equal('iconOffers' in pen, false);
  assert.equal('glyphFor' in pen, false);
  assert.ok(waiting(four, none).every((o) => o.from === 'change' && o.item.kind !== 'icon'));
});

test('LAPSES IS READ AS A REAL DAY, and anything else is left off rather than drawn wrong', () => {
  assert.equal(four[0]!.lapses, '2026-10-27');
  assert.equal(four[2]!.lapses, undefined);
  const odd = penOf([
    item('page:a', 'Allotment', { lapses: '2026-02-31' }),
    item('page:b', 'Beehives', { lapses: 'next week' }),
    item('page:c', 'Compost', { lapses: 20261027 }),
    item('page:d', 'Dahlias', { lapses: '2026-10-27T00:00:00Z' }),
  ]);
  assert.equal(odd.length, 4, 'an offer with a bad day was dropped instead of drawn without one');
  assert.ok(odd.every((p) => p.lapses === undefined));
  assert.equal(dayOf('2028-02-29'), '2028-02-29');
  assert.equal(dayOf('2027-02-29'), undefined);
  assert.equal(dayOf('+002026-10-27'), undefined);
});

test('AN OFFER boot SAYS IS drafted HAS ITS DECLARATION AS ITS DRAFT, sent once', () => {
  const [one] = penOf([item('week:garden-beds', 'Garden beds this week', { drafted: true, list: 'garden-beds' })]);
  assert.deepEqual(one?.draft, one?.change.to);
  const [plain] = penOf([item('page:tool-shed', 'Tool shed')]);
  assert.equal(plain?.draft, undefined);
});
