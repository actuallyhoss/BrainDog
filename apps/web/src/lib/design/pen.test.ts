/**
 * The holding pen's one count (ENG-B14): the record is the one recommender, so the browser counts what the record sent,
 * adds only its own navigation shape, and that only when the record sent no shape of its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayOf, penCount, penOf, shapeOffer, waiting, type PenItem } from './pen.ts';
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
const shape = shapeOffer({ shape: 'rail', reason: 'You have 9 entries.' }, 'Try the rail');
const none = (): boolean => false;

test('FOUR RECORD OFFERS AND A SHAPE COUNT AS THE RECORD SENDS THEM, plus the shape once', () => {
  assert.equal(four.length, 4);
  assert.equal(penCount(four, null, none), 4);
  assert.equal(penCount(four, shape, none), 5);
  const list = waiting(shape, four, none);
  assert.equal(list.length, penCount(four, shape, none), 'the list and its number differ');
  assert.equal(list[0]!.from, 'shape');
  assert.deepEqual(
    list.slice(1).map((o) => (o.from === 'change' ? o.item.title : '')),
    ['Garden beds', 'Seed swaps', 'Garden beds this week', 'Tool shed'],
  );
});

test('A DISMISSED OFFER IS NOT COUNTED, nor is the same offer sent twice', () => {
  const gone = (id: string) => id === 'page:seed-swaps' || id === shape.id;
  assert.equal(penCount(four, shape, gone), 3);
  assert.equal(penCount([...four, four[0]!], null, none), 4);
});

test("THE RECORD'S OWN SHAPE STANDS IN FOR THE BROWSER'S, so one shape is offered, never two", () => {
  const theirs = penOf([{ ...item('shape:bar', 'Try the top bar'), kind: 'shape' }]);
  assert.equal(penCount([...four, ...theirs], shape, none), 5);
  assert.ok(waiting(shape, [...four, ...theirs], none).every((o) => o.from === 'change'));
});

test('NEVER MORE THAN THE RECORD SENT AND ONE', () => {
  for (let n = 0; n <= 6; n += 1) {
    const sent = penOf(Array.from({ length: n }, (_, i) => item(`page:bed-${i}`, `Bed ${i}`)));
    assert.ok(penCount(sent, shape, none) <= sent.length + 1);
    assert.equal(penCount(sent, null, none), sent.length);
  }
});

test('NO ICON OFFER IS MADE BY THE BROWSER: nothing to make one with, and nothing added to the count', () => {
  assert.equal('iconOffers' in pen, false);
  assert.equal('glyphFor' in pen, false);
  assert.ok(waiting(null, four, none).every((o) => o.from === 'change' && o.item.kind !== 'icon'));
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
