/**
 * A project's row sends you to the project's page (the plan of 20 October, batch 3d): the row's screen asks `boot`'s
 * pages, sends a row with a page of its own there, and keeps a row with none, and any row asked for by its fields.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS } from '../../../../lib/record/held.ts';
import { learnRowPages, ownPageIn, rowPagesOf, rowScreen } from '../../../../lib/record/row-href.ts';
import type { RegisterDecl } from '../../../../lib/record/schema.ts';
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
  const [, , register = '', seq = ''] = url.pathname.replace(/^\/studio/u, '').split('/');
  try {
    await load({ params: { register, seq }, url, parent: async () => ({}), fetch: async () => new Response('{}', { status: 500 }) });
    return null;
  } catch (e) {
    const r = e as { status?: number; location?: string };
    if (typeof r.status !== 'number' || typeof r.location !== 'string') throw e;
    return { status: r.status, location: r.location };
  }
};

test('THE ROUTE SENDS A PROJECT ROW TO ITS PAGE INSIDE THE RECORD, after the shell has said its pages', async () => {
  learnRowPages([
    { slug: 'kiln', about: { register: 'things', seq: 3 } },
    { slug: 'ada-vine', about: { register: 'people', seq: 4 } },
    { slug: 'hsbc-current', about: { register: 'accounts', seq: 2 } },
    { slug: 'review-pr', about: { register: 'skills', seq: 1 } },
    { slug: 'drafting-the-specimen-page-copy', about: { register: 'session', seq: 20 } },
  ]);
  REGISTERS.things = { scopes: {}, fields: [] } as unknown as RegisterDecl;
  REGISTERS.people = { meets: {}, fields: [] } as unknown as RegisterDecl;
  REGISTERS.accounts = { fields: [] } as unknown as RegisterDecl;
  try {
    assert.deepEqual(await loaded('/studio/r/things/3'), { status: 307, location: '/studio/p/kiln' });
    assert.equal(await loaded('/studio/r/things/3?fields=1'), null, 'the fields stay on the row');
    assert.equal(await loaded('/studio/r/tasks/3'), null, 'a row with no page stays');
    assert.equal(await loaded('/studio/r/people/4'), null, 'a person keeps their own screen');
    /* AN ACCOUNT, A BILL OR A SERVICE OPENS ON ITS PAGE TOO (things, not rows), and its fields stay one press away. */
    assert.deepEqual(await loaded('/studio/r/accounts/2'), { status: 307, location: '/studio/p/hsbc-current' });
    assert.equal(await loaded('/studio/r/accounts/2?fields=1'), null, 'Show the data stays on the row');
    assert.equal(await loaded('/studio/r/skills/1'), null, 'a list not yet declared, and whose declaration was refused, stays');
    /* A RUN'S ROW OPENS ON THE RUN'S OWN PAGE, where what it did is read: there is one page for one run. */
    assert.deepEqual(await loaded('/studio/r/session/20'), { status: 307, location: '/studio/p/drafting-the-specimen-page-copy' });
    assert.equal(await loaded('/studio/r/session/20?fields=1'), null, 'its fields stay on the row');
  } finally {
    learnRowPages([]);
    delete REGISTERS.things;
    delete REGISTERS.people;
    delete REGISTERS.accounts;
  }
});
