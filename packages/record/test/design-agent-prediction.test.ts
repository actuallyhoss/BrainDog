/**
 * ENG-B17 job 2: an arrangement offer carries a prediction where a measure exists, and none where it does not.
 *
 * THE MEASURE IS THE FIGURE THE OFFER RESTS ON. A list that grew by N in thirty days is offered a page, and the page is
 * graded on the same count read again thirty days after it is accepted (`events.<list>` `{ count: made }`), the target
 * one past what it was. An offer over somebody met, a block, a column, the shape or an icon rests on nothing the kernel
 * reads again, so it carries none. A miss files nothing by itself: `on_miss` is always `none`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { predictionOf, PREDICTION_WINDOW, queueOf, recommend } from '../src/design-agent.ts';
import type { DesignSignals, GrowingList } from '../src/design-agent.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const grew = (id: string, name: string, added30: number): GrowingList => ({ id, name, rows: added30 + 4, added30, addedDays30: 6 });
const base = (over: Partial<DesignSignals> = {}): DesignSignals => ({ nowMs: NOW, pages: [], ...over });

test('A PAGE OFFERED OVER A GROWING LIST CARRIES A PREDICTION on that same count', () => {
  const [offer] = recommend(base({ lists: [grew('walks', 'Walks', 12)] }));
  assert.equal(offer!.key, 'page:walks');
  assert.deepEqual(offer!.prediction, {
    claim: 'More is added to Walks in the thirty days after it has a page than the 12 in the thirty before.',
    measure: { source: 'events.walks', value: { count: 'made' } },
    target: { gte: 13 },
    window: PREDICTION_WINDOW,
    unit: 'count',
    on_miss: 'none',
  });
  assert.equal(PREDICTION_WINDOW, '30d');
  assert.ok(!offer!.prediction!.claim.includes('—'), 'no em dash in a claim a person reads');
});

test('AN OFFER OVER NOTHING THE KERNEL COUNTS CARRIES NONE: somebody met, a block, a column, the shape, an icon', () => {
  const offers = recommend(
    base({
      nav: { entries: 1, sections: 1, arranged: false },
      pages: [{ slug: 'trips', title: 'Trips', lists: ['trips'], placed: true }],
      named: [{ list: 'people', listName: 'People', seq: 4, name: 'Marta Quill', met: 7, linked: 0 }],
      earned: [
        { kind: 'block', page: 'trips', pageTitle: 'Trips', list: 'trips', listName: 'Trips', what: 'timeline', label: 'timeline', rows: 9 },
        { kind: 'column', page: 'trips', pageTitle: 'Trips', list: 'trips', listName: 'Trips', what: 'cost', label: 'Cost', rows: 30, filled: 30 },
      ],
      glyphs: ['trip'],
    }),
  );
  assert.deepEqual(offers.map((o) => o.change.kind).sort(), ['block', 'icon', 'page', 'shape']);
  for (const o of offers) assert.equal(o.prediction, undefined, `${o.key} rests on nothing to grade`);
});

test('A LIST ID THE KERNEL WOULD NOT READ IS OFFERED A PAGE, UNGRADED, never graded on an invented figure', () => {
  const [offer] = recommend(base({ lists: [grew('Field Notes', 'Field notes', 8)] }));
  assert.equal(offer!.key, 'page:Field Notes');
  assert.equal(offer!.prediction, undefined);
  assert.equal(predictionOf({ id: 'notes', name: 'Notes', added30: 2.5 }), null);
  assert.deepEqual(predictionOf({ id: 'notes', name: 'Notes', added30: 0 })!.target, { gte: 1 }, 'a list that added none predicts one');
});

test('THE PREDICTION RIDES THE QUEUE: an offer that waits keeps it, and one offered again carries today’s', () => {
  const offers = recommend(base({ lists: [grew('walks', 'Walks', 12)] }));
  const fresh = queueOf(offers, [], [], NOW);
  assert.deepEqual((fresh.fresh[0] as { prediction?: unknown }).prediction, offers[0]!.prediction);
  const held = { key: 'page:walks', class: 'arrange' as const, rank: 1, basis: 'grows@10', lapses: '2026-10-20' };
  const again = recommend(base({ lists: [grew('walks', 'Walks', 15)] }));
  const kept = queueOf(again, [held], [], NOW).waiting[0] as { lapses: string; prediction?: { target: unknown } };
  assert.equal(kept.lapses, '2026-10-20', 'waiting does not push its day out');
  assert.deepEqual(kept.prediction?.target, { gte: 16 });
});
