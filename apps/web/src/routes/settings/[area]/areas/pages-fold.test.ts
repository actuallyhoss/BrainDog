/**
 * Settings > Navigation's fold and order.
 *
 * "1047 more pages" stood under Add a page: every run's, person's and project's own page counted as one more page to
 * add. The fold says the kinds now, and no count of pages a row made. And Needs you was ninth, under Activity, where
 * the bar draws it second.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideSecond, foldSaid } from './pages-fold.ts';

const LISTS = [
  { id: 'kilns', name: 'Kilns', count: 34 },
  { id: 'potters', name: 'Potters', count: 12 },
  { id: 'firings', name: 'Firing logs', count: 910 },
];

test('the pages rows made are said by kind, never as a four-figure count', () => {
  const folded = [
    ...Array.from({ length: 30 }, () => ({ row: true, register: 'kilns' })),
    ...Array.from({ length: 8 }, () => ({ row: true, register: 'potters' })),
    ...Array.from({ length: 910 }, () => ({ row: true, register: 'firings' })),
  ];
  const said = foldSaid(folded, LISTS);
  assert.equal(said, 'Pages of every firing log, 30 kilns and 8 potters');
  assert.doesNotMatch(said, /\d{4}/u);
});

test('pages somebody wrote past the fold are counted, and the rows after them by kind', () => {
  assert.equal(foldSaid([{ row: false, register: null }, { row: false, register: null }], LISTS), '2 more pages');
  assert.equal(foldSaid([{ row: false, register: null }, { row: true, register: 'potters' }], LISTS), '1 more page, and pages of 1 potter');
  /* A ROW'S PAGE WHOSE LIST THE RECORD DOES NOT NAME is one of "other pages". */
  assert.equal(foldSaid([{ row: true, register: null }, { row: true, register: 'gone' }], LISTS), 'Pages of 2 other rows');
  assert.equal(foldSaid([], LISTS), '');
});

test('Needs you comes second, after Today, as the bar draws it', () => {
  const main = [{ key: 'today' }, { key: 'work' }, { key: 'money' }, { key: 'activity' }, { key: 'decide' }, { key: 'people' }];
  assert.deepEqual(decideSecond(main).map((i) => i.key), ['today', 'decide', 'work', 'money', 'activity', 'people']);
  assert.deepEqual(decideSecond(main.filter((i) => i.key !== 'decide')).map((i) => i.key), ['today', 'work', 'money', 'activity', 'people']);
});
