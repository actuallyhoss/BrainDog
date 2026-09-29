/**
 * Where a row stands on its list's way through its states, as the lead tile's `Segments` draws it (`lead.ts` `stepsOf`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stepsOf } from './lead.ts';

const BILLS = {
  state: 'state',
  done: ['paid', 'written_off'],
  fields: [{ id: 'state', values: ['open', 'part', 'paid', 'written_off'], labels: { open: 'Open', part: 'Part paid', paid: 'Paid', written_off: 'Written off' } }],
};

test('A ROW IS ON THE STEP ITS STATE NAMES, with the steps behind it filled and its own outlined', () => {
  assert.deepEqual(stepsOf(BILLS, 'open'), { total: 3, done: 0, current: true, said: 'Step 1 of 3: open.' });
  assert.deepEqual(stepsOf(BILLS, 'part'), { total: 3, done: 1, current: true, said: 'Step 2 of 3: part paid.' });
});

test('EVERY WAY OF FINISHING IS THE ONE LAST STEP, and a finished row has every cell filled', () => {
  assert.deepEqual(stepsOf(BILLS, 'paid'), { total: 3, done: 3, current: false, said: 'Step 3 of 3: paid.' });
  assert.deepEqual(stepsOf(BILLS, 'written_off'), { total: 3, done: 3, current: false, said: 'Step 3 of 3: written off.' });
});

test('A LIST THAT DECLARES NO FINISHED STATE HAS EVERY STATE AS A STEP', () => {
  const PROJECTS = { state: 'lane', fields: [{ id: 'lane', values: ['building', 'earning', 'parked', 'retired'] }] };
  assert.deepEqual(stepsOf(PROJECTS, 'earning'), { total: 4, done: 1, current: true, said: 'Step 2 of 4: earning.' });
});

test('NO WAY TO DRAW IS NO CHART: no state, one state, or a value the list does not declare', () => {
  assert.equal(stepsOf(undefined, 'open'), null);
  assert.equal(stepsOf(BILLS, ''), null);
  assert.equal(stepsOf(BILLS, 'lost'), null);
  assert.equal(stepsOf({ state: 'state', fields: [{ id: 'state', values: ['only'] }] }, 'only'), null);
  assert.equal(stepsOf({ fields: [{ id: 'state', values: ['a', 'b'] }] }, 'a'), null);
});
