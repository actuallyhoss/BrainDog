/**
 * A list with a page of its own opens on it: `/r/datapoints` sends a reader to the page that says it is that list's
 * (`opens`), the list's own screen stays one word away, a reader already on the list stays there, and a reading's row
 * says where its chart is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chartIn, learnRowPages, listPageIn, listPagesOf, listScreen } from '../../../lib/record/row-href.ts';
import { latestText } from '../../../lib/record/measures.ts';
import { load } from './+page.ts';

const pages = listPagesOf([
  { slug: 'numbers', about: null, opens: 'datapoints' },
  { slug: 'kiln', about: { register: 'things', seq: 3 } },
  { slug: 'later', about: null, opens: 'datapoints' },
]);
const none = new URLSearchParams();

test('A LIST WITH A PAGE OPENS ON IT, the first page that says so, and a list with none stays', () => {
  assert.equal(listPageIn('datapoints', none, pages), '/p/numbers');
  assert.equal(listPageIn('things', none, pages), null);
  assert.equal(listPageIn('datapoints', new URLSearchParams(listScreen('datapoints').split('?')[1]), pages), null, 'the rows stay one word away');
  assert.equal(listPageIn('datapoints', new URLSearchParams('row=4'), pages), null, 'a row open on the list stays');
});

test('A READING SAYS WHERE ITS CHART IS: the list page searched for its name', () => {
  assert.equal(chartIn('datapoints', 'CPU, bake (A1.Flex)', pages), '/p/numbers?q=CPU%2C%20bake%20(A1.Flex)');
  assert.equal(chartIn('datapoints', '  ', pages), null);
  assert.equal(chartIn('tasks', 'Pay rent', pages), null);
});

const loaded = async (path: string, from: string | null): Promise<string | null> => {
  const url = new URL(`http://localhost${path}`);
  const register = url.pathname.replace(/^\/app\/studio/u, '').split('/')[2] ?? '';
  const was = from === null ? null : new URL(`http://localhost${from}`);
  try {
    await load({ params: { register }, url, parent: async () => ({}), from: was });
    return null;
  } catch (e) {
    const r = e as { status?: number; location?: string };
    if (typeof r.location !== 'string') throw e;
    return r.location;
  }
};

test('THE ROUTE SENDS A VISIT TO THE PAGE, and a move within the list keeps it', async () => {
  learnRowPages([{ slug: 'numbers', about: null, opens: 'datapoints' }]);
  try {
    assert.equal(await loaded('/app/studio/r/datapoints', null), '/app/studio/p/numbers');
    assert.equal(await loaded('/app/studio/r/datapoints', '/app/studio/r/datapoints'), '/app/studio/p/numbers', 'opened fresh, the address is its own');
    assert.equal(await loaded('/app/studio/r/datapoints', '/app/studio/today'), '/app/studio/p/numbers');
    assert.equal(await loaded('/app/studio/r/datapoints', '/app/studio/r/datapoints?rows=1&row=4'), null, 'a sheet closing on the list stays');
    assert.equal(await loaded('/app/studio/r/datapoints?rows=1', null), null);
    assert.equal(await loaded('/app/studio/r/tasks', null), null);
  } finally {
    learnRowPages([]);
  }
});

test('GROUPED READINGS ARE ONE LIST A GROUP, with each kind once and its age, the ones in no group last', () => {
  const text = latestText(
    [
      { measure: 'Rows written', value: 35_000, unit: '', at: '2026-09-28T00:00:00Z', day: '2026-09-28' },
      { measure: 'CPU', group: 'Bake', value: 16.4, unit: '%', at: '2026-09-28T00:00:00Z', day: '2026-09-28' },
    ],
    false,
    [],
    () => '4w ago',
  );
  const fences = text.split('\n\n');
  assert.equal(fences.length, 2);
  assert.match(fences[0]!, /^```spec \| Bake\nCPU \| 16\.4.*% \| 4w ago\n```$/u);
  assert.match(fences[1]!, /^```spec \| Everything else\nRows written \| 35,000 \| 4w ago\n```$/u);
});
