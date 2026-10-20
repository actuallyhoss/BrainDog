/**
 * A project's row sends you to the project's page (the plan of 20 October, batch 3d): the row's screen asks `boot`'s
 * pages, sends a row with a page of its own there, and keeps a row with none, and any row asked for by its fields.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { learnRowPages, ownPageIn, rowPagesOf, rowScreen } from '../../../../lib/record/row-href.ts';
import { load } from './+page.ts';

const pages = rowPagesOf([
  { slug: 'kiln', about: { register: 'things', seq: 3 } },
  { slug: 'work', about: null },
]);
const none = new URLSearchParams();

test('A ROW WITH A PAGE OF ITS OWN OPENS ON THE PAGE, and one without stays on its screen', () => {
  assert.equal(ownPageIn('things', 3, none, pages), '/p/kiln');
  assert.equal(ownPageIn('things', 4, none, pages), null);
  assert.equal(ownPageIn('tasks', 3, none, pages), null);
  assert.equal(ownPageIn('things', Number.NaN, none, pages), null);
});

test('THE ROW ASKED FOR BY ITS FIELDS STAYS ON ITS SCREEN, which is where the page and a hole send it', () => {
  assert.equal(rowScreen('things', 3), '/r/things/3?fields=1');
  assert.equal(ownPageIn('things', 3, new URL(`http://x${rowScreen('things', 3)}`).searchParams, pages), null);
});

const loaded = async (path: string): Promise<{ status: number; location: string } | null> => {
  const url = new URL(`http://localhost${path}`);
  const [, , register = '', seq = ''] = url.pathname.replace(/^\/app\/studio/u, '').split('/');
  try {
    await load({ params: { register, seq }, url, parent: async () => ({}) });
    return null;
  } catch (e) {
    const r = e as { status?: number; location?: string };
    if (typeof r.status !== 'number' || typeof r.location !== 'string') throw e;
    return { status: r.status, location: r.location };
  }
};

test('THE ROUTE SENDS A PROJECT ROW TO ITS PAGE INSIDE THE RECORD, after the shell has said its pages', async () => {
  learnRowPages([{ slug: 'kiln', about: { register: 'things', seq: 3 } }]);
  try {
    assert.deepEqual(await loaded('/app/studio/r/things/3'), { status: 307, location: '/app/studio/p/kiln' });
    assert.equal(await loaded('/app/studio/r/things/3?fields=1'), null, 'the fields stay on the row');
    assert.equal(await loaded('/app/studio/r/tasks/3'), null, 'a row with no page stays');
  } finally {
    learnRowPages([]);
  }
});
