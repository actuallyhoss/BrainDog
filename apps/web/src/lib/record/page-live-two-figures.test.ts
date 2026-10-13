/**
 * A progress over two figures by one word: a track a part, what the first figure counted against the second.
 *
 * Money's Instalments tile reads the parts paid by plan and the parts in all by plan
 * (`packages/seed/src/modules/money/pages/parts/instalments.ts`), and the page draws "2 of 6" a plan from them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';

const now = Date.UTC(2026, 9, 13, 12);

type Group = { key: string; value: number | null; label?: string };

const counted = (groups: Group[] | undefined) => ({ value: null, unit: null, rows: 3, held: 3, met: null, refusals: [], ...(groups ? { groups } : {}) });

/** The tile as the record answers it: two cells, a reading each, no rows. */
const tile = (paid: Group[] | undefined, total: Group[] | undefined, more: Record<string, unknown> = {}) =>
  blockOf(
    {
      kind: 'progress',
      heading: 'Instalments',
      icon: 'credit-card',
      span: 12,
      empty: 'Nothing is being paid in parts.',
      cells: [
        { metric: 'installments-paid-by-plan', label: 'Paid' },
        { metric: 'installments-total-by-plan', label: 'Parts' },
      ],
      readings: [
        { metric: 'installments-paid-by-plan', label: 'Paid', reading: counted(paid) },
        { metric: 'installments-total-by-plan', label: 'Parts', reading: counted(total) },
      ],
      rows: [],
      matched: 0,
      refusals: [],
      ...more,
    } as never,
    new Map(),
    now,
  );

/** The tracks the renderer was handed, each as its cells. */
const tracks = (block: ReturnType<typeof blockOf>) =>
  toSegments(block).flatMap((s) => (s.type === 'block' && s.kind === 'progress' ? (s.rows as { cells: string[] }[]).map((r) => r.cells.map((c) => c.trim())) : []));

test('each plan is a track: the parts paid against the parts in all', () => {
  const block = tile(
    [{ key: 'Flat', value: 2 }],
    [
      { key: 'Flat', value: 6 },
      { key: 'Car', value: 4 },
    ],
  );
  assert.deepEqual(block.authored, [{ cells: ['Flat', '2', '6'] }, { cells: ['Car', '0', '4'] }], 'a plan with nothing paid reads nought of its parts');
  assert.equal(block.metrics, undefined, 'no tile is drawn in place of the tracks');
  assert.deepEqual(tracks(block), [
    ['Flat', '2', '6'],
    ['Car', '0', '4'],
  ]);
  assert.equal(block.shown, 2);
  assert.equal(block.total, 2);
});

test('a plan named with a bar is one cell, and six tracks at most are drawn', () => {
  const total = ['A | B', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => ({ key, value: 3 }));
  const block = tile([{ key: 'A | B', value: 1 }], total);
  const drawn = tracks(block);
  assert.equal(drawn.length, 6);
  assert.deepEqual(drawn[0], ['A | B', '1', '3']);
  assert.equal(block.shown, 6);
  assert.equal(block.total, 7, 'the count of every plan is kept beside the six drawn');
});

test('a paid count for a plan the second figure does not hold draws no track', () => {
  const block = tile([{ key: 'Gone', value: 1 }], [{ key: 'Flat', value: 6 }]);
  assert.deepEqual(tracks(block), [['Flat', '0', '6']]);
});

test('a figure that came with no parts is still said as the tiles, never as an empty track', () => {
  const block = tile(undefined, [{ key: 'Flat', value: 6 }]);
  assert.equal(block.authored, undefined);
  assert.equal(block.metrics?.length, 2);
  const refused = tile([{ key: 'Flat', value: 2 }], [{ key: 'Flat', value: 6 }], { readings: [{ metric: 'installments-paid-by-plan', reading: null }, { metric: 'installments-total-by-plan', reading: counted([{ key: 'Flat', value: 6 }]) }] });
  assert.equal(refused.authored, undefined);
});

test('a progress over one figure, or a stat over two by a word, is read as before', () => {
  const stat = tile([{ key: 'Flat', value: 2 }], [{ key: 'Flat', value: 6 }], { kind: 'stat' });
  assert.equal(stat.authored, undefined);
  assert.equal(stat.metrics?.length, 2);
});

test('no plan at all draws nothing to throw on', () => {
  const block = tile([], []);
  assert.deepEqual(block.authored, []);
  assert.doesNotThrow(() => toSegments(block));
  assert.deepEqual(tracks(block), []);
});
