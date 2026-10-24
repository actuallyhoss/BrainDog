/**
 * ENG-B14 job 2: one recommender and one queue (`loop/scope/area-engine-b.md`, decision 5).
 *
 * WHAT THE OWNER'S RECORD SHOWED: "4 suggested" in the rail, seven on the Slash page, two of them for things that already
 * had a page, and offers unanswered for five days. These hold the rules that end it: no navigation shape is offered (C11), a
 * thing with a page as drawn is never offered one, three arrangement offers wait at most and each says the day it lapses,
 * and an offer turned down stays down until what it rested on moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { answeredAlready, basisMoved, LAPSE_DAYS, queueOf, recommend, WAITING_MOST } from '../src/design-agent.ts';
import type { DesignSignals, GrowingList, Held } from '../src/design-agent.ts';
import { signatureOf } from '../src/emergent.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const DAY = 86_400_000;
const LAPSES = '2026-10-28';

const grew = (id: string, name: string, added30: number): GrowingList => ({ id, name, rows: added30 + 4, added30, addedDays30: 6 });
/** Five lists that grew, the busiest last, so the rank is not the order they were handed in. */
const FIVE = [grew('walks', 'Walks', 6), grew('meals', 'Meals', 9), grew('reads', 'Reads', 12), grew('calls', 'Calls', 20), grew('trips', 'Trips', 31)];
const base = (over: Partial<DesignSignals> = {}): DesignSignals => ({ nowMs: NOW, pages: [], ...over });
const oneSentence = (why: string): boolean => /^[A-Z][^.!?]*\.$/u.test(why) && !why.includes('\u2014');

test('NO NAVIGATION SHAPE IS OFFERED: one sidebar and one bar for everyone, so the first offer is a page', () => {
  const offers = recommend(
    base({
      pages: [{ slug: 'home-notes', title: 'Home notes', lists: [] }],
      lists: FIVE,
    }),
  );
  assert.ok(!offers.some((o) => o.key.startsWith('shape:') || (o.change.kind as string) === 'shape'));
  const first = offers[0]!;
  assert.equal(first.key, 'page:trips');
  assert.equal(first.class, 'arrange');
  assert.ok(oneSentence(first.why), first.why);
  assert.equal(first.lapses, LAPSES);
  for (const o of offers) assert.ok(oneSentence(o.why), o.why);
  /* A caller still handing the old navigation signals is offered no shape for them. */
  const old = recommend({ ...base({ lists: FIVE }), nav: { entries: 1, sections: 1, arranged: false } } as DesignSignals);
  assert.ok(!old.some((o) => o.key.startsWith('shape:')));
});

test('a thing that has a page as drawn, a page made from a template included, is never offered one', () => {
  const named = [
    { list: 'ventures', listName: 'Ventures', seq: 3, name: 'Harbour', met: 9, linked: 4 },
    { list: 'ventures', listName: 'Ventures', seq: 4, name: 'Lantern', met: 7, linked: 0 },
    { list: 'ventures', listName: 'Ventures', seq: 5, name: 'Quarry', met: 6, linked: 0 },
    { list: 'ventures', listName: 'Ventures', seq: 6, name: 'Tideway', met: 5, linked: 0 },
    { list: 'ventures', listName: 'Ventures', seq: 7, name: 'Seldom', met: 2, linked: 1 },
  ];
  const offers = recommend(
    base({
      named,
      pages: [
        /* Made per row from a template: its title is the template's and its address is the row's own. */
        { slug: 'ventures/3', title: 'Venture', lists: ['ventures'], row: { list: 'ventures', seq: 3 } },
        /* Written by hand, under the name. */
        { slug: 'lantern-plan', title: 'lantern', lists: [] },
        /* Written by hand, at the address the name makes. */
        { slug: 'quarry', title: 'Stone', lists: [] },
      ],
    }),
  );
  assert.deepEqual(offers.map((o) => o.key), ['page:ventures#6']);
  assert.equal(offers[0]!.title, 'A page for Tideway');
  assert.deepEqual(offers[0]!.change, { kind: 'page', list: 'ventures', seq: 6 });
});

test('a list that grows is offered a page only while no page draws it whole', () => {
  const offers = recommend(
    base({
      lists: [...FIVE, { id: 'slow', name: 'Slow', rows: 40, added30: 4, addedDays30: 4 }, { id: 'burst', name: 'Burst', rows: 40, added30: 30, addedDays30: 1 }],
      pages: [
        { slug: 'trips', title: 'Trips', lists: ['trips'] },
        { slug: 'calls/2', title: 'Call', lists: ['calls'], row: { list: 'calls', seq: 2 } },
      ],
    }),
  );
  assert.deepEqual(offers.map((o) => o.key), ['page:calls', 'page:reads', 'page:meals', 'page:walks']);
  /* The same signature the pen and Slash make, so a dismissal held today holds here. */
  assert.equal(offers[0]!.key, signatureOf('page', 'calls'));
});

test('five lists that grew give three arrangement offers at most, each with the day it lapses', () => {
  const offers = recommend(base({ lists: FIVE }));
  assert.equal(offers.length, 5);
  const { waiting, displaced, lapsed, fresh } = queueOf(offers, [], [], NOW);
  assert.equal(WAITING_MOST, 3);
  assert.deepEqual(waiting.map((o) => o.key), ['page:trips', 'page:calls', 'page:reads']);
  assert.deepEqual(fresh.map((o) => o.key), ['page:trips', 'page:calls', 'page:reads']);
  assert.deepEqual([displaced, lapsed], [[], []]);
  assert.equal(LAPSE_DAYS, 14);
  for (const o of waiting) assert.equal(o.lapses, LAPSES);
});

test('a fourth is kept only when it outranks the weakest, which is answered as displaced', () => {
  const offers = recommend(base({ lists: FIVE }));
  const byKey = (key: string): Held => offers.find((o) => o.key === key)!;
  /* Three wait already, filed four days ago: the three weakest of the five. */
  const open: Held[] = ['page:reads', 'page:meals', 'page:walks'].map((k) => ({ ...byKey(k), lapses: '2026-10-24' }));
  const q = queueOf(offers, open, [], NOW);
  assert.deepEqual(q.waiting.map((o) => o.key), ['page:trips', 'page:calls', 'page:reads']);
  assert.deepEqual(q.displaced.map((o) => o.key), ['page:meals', 'page:walks']);
  assert.deepEqual(q.fresh.map((o) => o.key), ['page:trips', 'page:calls']);
  /* One that waited keeps the day it was given: waiting does not push the day out. */
  assert.equal(q.waiting.find((o) => o.key === 'page:reads')!.lapses, '2026-10-24');

  /* A fourth no stronger than the weakest is not kept, and nothing is displaced for it. */
  const strong: Held[] = ['page:trips', 'page:calls', 'page:reads'].map(byKey);
  const tie = { ...offers.find((o) => o.key === 'page:meals')!, rank: byKey('page:reads').rank };
  const held = queueOf([tie], strong, [], NOW);
  assert.deepEqual(held.waiting.map((o) => o.key), ['page:trips', 'page:calls', 'page:reads']);
  assert.deepEqual([held.displaced, held.fresh], [[], []]);
});

test('an offer past its day is answered as lapsed, and is not made again on the same basis', () => {
  const offers = recommend(base({ lists: FIVE }));
  const trips = offers.find((o) => o.key === 'page:trips')!;
  const open: Held[] = [{ ...trips, lapses: '2026-10-13' }];
  const q = queueOf(offers, open, [], NOW);
  assert.deepEqual(q.lapsed.map((o) => o.key), ['page:trips']);
  assert.ok(!q.waiting.some((o) => o.key === 'page:trips'));
  assert.deepEqual(q.waiting.map((o) => o.key), ['page:calls', 'page:reads', 'page:meals']);
  /* On its last day it still waits. */
  assert.deepEqual(queueOf(offers, [{ ...trips, lapses: '2026-10-14' }], [], NOW).lapsed, []);
});

test('a dismissed key does not return until its basis moves', () => {
  const before = recommend(base({ lists: FIVE })).find((o) => o.key === 'page:trips')!;
  const dismissed = [{ key: before.key, basis: before.basis }];
  /* The list grows again, as the scope's own check does: it does not return. */
  const more = FIVE.map((l) => (l.id === 'trips' ? { ...l, rows: l.rows + 25, added30: 55 } : l));
  const again = queueOf(recommend(base({ lists: more, nowMs: NOW + 3 * DAY })), [], dismissed, NOW + 3 * DAY);
  assert.ok(!again.waiting.some((o) => o.key === 'page:trips'));
  assert.equal(again.waiting.length, 3);
  /* Ten times what it was is a different list, and the offer is made once more. */
  const far = FIVE.map((l) => (l.id === 'trips' ? { ...l, rows: l.rows * 10, added30: 60 } : l));
  const moved = queueOf(recommend(base({ lists: far })), [], dismissed, NOW);
  assert.equal(moved.waiting[0]!.key, 'page:trips');
  assert.equal(basisMoved('grows@35', 'grows@349'), false);
  assert.equal(basisMoved('grows@35', 'grows@350'), true);
  assert.equal(basisMoved('one-page', 'one-page'), false);
  assert.equal(basisMoved('one-page', 'nothing-placed'), true);
});

test('offers come in the order pages, blocks and columns, then icons', () => {
  const walks = { slug: 'walks', title: 'Walks', lists: ['walks'], placed: true };
  const offers = recommend(
    base({
      glyphs: ['walk', 'home', 'meal'],
      pages: [walks],
      earned: [
        { kind: 'column', page: 'log', pageTitle: 'Log', list: 'walks', listName: 'Walks', what: 'miles', at: 0, label: 'Miles', rows: 900, filled: 880 },
        /* Filled on too few to be worth a column. */
        { kind: 'column', page: 'shoes', pageTitle: 'Shoes', list: 'walks', listName: 'Walks', what: 'shoes', at: 0, label: 'Shoes', rows: 900, filled: 100 },
        /* One a page, its strongest: the block is kept and this column on the same page waits. */
        { kind: 'column', page: 'walks', pageTitle: 'Walks', list: 'walks', listName: 'Walks', what: 'weather', at: 0, label: 'Weather', rows: 900, filled: 900 },
        { kind: 'block', page: 'walks', pageTitle: 'Walks', list: 'walks', listName: 'Walks', what: 'calendar', label: 'calendar', rows: 900 },
      ],
      named: [{ list: 'ventures', listName: 'Ventures', seq: 6, name: 'Tideway', met: 5, linked: 0 }],
      lists: [grew('meals', 'Meals', 400)],
    }),
  );
  assert.deepEqual(offers.map((o) => o.key), ['page:meals', 'page:ventures#6', 'block:walks:calendar:walks', 'column:log:0:miles', 'icon:walks']);
  assert.deepEqual([...offers].sort((a, b) => b.rank - a.rank), offers);
  assert.equal(offers[2]!.key, signatureOf('block', 'walks:calendar:walks'));
  assert.equal(offers[3]!.key, signatureOf('column', 'log:0:miles'));
  assert.equal(offers[3]!.why, 'Miles is filled on 97% of the 900 entries in Walks, and the table on Log does not show it.');
  assert.deepEqual(offers[4]!.change, { kind: 'icon', page: 'walks', glyph: 'walk' });
  for (const o of offers) assert.ok(oneSentence(o.why), o.why);
  /* The queue keeps that order, and the three it keeps are the first three. */
  assert.deepEqual(queueOf(offers, [], [], NOW).waiting.map((o) => o.key), ['page:meals', 'page:ventures#6', 'block:walks:calendar:walks']);
  /* No glyph names handed, no icon offered. */
  assert.ok(!recommend(base({ pages: [walks] })).some((o) => o.key.startsWith('icon:')));
});

test('who is who is a class of its own, with its own three', () => {
  const offers = recommend(base({ lists: FIVE }));
  const who: Held[] = [1, 2, 3, 4].map((n) => ({ key: `who:${n}`, class: 'who', rank: n, basis: 'same-name', lapses: LAPSES }));
  const q = queueOf(offers, who, [], NOW);
  assert.deepEqual(q.waiting.map((o) => `${o.class} ${o.key}`), ['arrange page:trips', 'arrange page:calls', 'arrange page:reads', 'who who:4', 'who who:3', 'who who:2']);
  assert.deepEqual(q.displaced.map((o) => o.key), ['who:1']);
});

test('an open offer for a thing that has since got a page is named, with why', () => {
  const offers = recommend(base({ lists: FIVE, named: [{ list: 'ventures', listName: 'Ventures', seq: 3, name: 'Harbour', met: 9, linked: 0 }] }));
  const now = base({
    pages: [
      { slug: 'trips', title: 'Trips', lists: ['trips'] },
      { slug: 'ventures/3', title: 'Venture', lists: ['ventures'], row: { list: 'ventures', seq: 3 } },
    ],
    lists: FIVE,
    named: [{ list: 'ventures', listName: 'Ventures', seq: 3, name: 'Harbour', met: 9, linked: 0 }],
  });
  assert.deepEqual(answeredAlready(offers, now), [
    { key: 'page:trips', reason: 'already has a page' },
    { key: 'page:ventures#3', reason: 'already has a page' },
  ]);
});

test('it reads what it is handed: the same signals answer the same offers, and nothing is changed', () => {
  const signals = base({ lists: FIVE });
  const frozen = JSON.stringify(signals);
  assert.deepEqual(recommend(signals), recommend(signals));
  assert.equal(JSON.stringify(signals), frozen);
});

test('the recommender is pure: it imports nothing, the record and the kernel included', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../src/design-agent.ts', import.meta.url), 'utf8');
  assert.deepEqual(text.match(/^\s*import\s.*$/gmu), null);
  assert.ok(!/\bDate\.now\b|\bnew Date\(\)/u.test(text));
});
