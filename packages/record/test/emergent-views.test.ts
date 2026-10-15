/**
 * A saved view opened often is offered a place in the rail (`emergent-views.ts`, USE-B13 job 2).
 *
 * WHAT IS HELD: five opens in fourteen days offer "Keep Open tasks in the rail?", whose keeping moves only the view's
 * `nav`, to the end of the section that draws Tasks, after every page already there, and which the record takes; four
 * opens offer nothing, nor five spread over more than a fortnight; a record a person first used under fourteen days
 * ago waits, and offers it once the fortnight is past; a dismissed `place:<view>` is never offered again; a page
 * already in the rail, or in none, is no saved view and is not offered; and the offer takes one of the three places
 * shown, so the pen still shows three at most.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '@braindog/kernel';

import { PLACE_OPENS, VIEWS_SECTION, placesWeighed, viewPlacesOffered } from '../src/emergent-views.ts';
import { PEN_SHOWN, penQueued, signatureOf, type PenDeps, type PenItem } from '../src/emergent.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const BORN = Date.parse('2026-09-01T09:00:00Z');

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const list = (id: string, name: string): Declaration =>
  ({
    id: `register.${id}`,
    kind: 'register',
    body: {
      id,
      name,
      title: 'what',
      fields: [
        { id: 'what', label: 'What', type: 'text', required: true },
        { id: 'status', label: 'Status', type: 'enum', values: ['open', 'done'], default: 'open', required: true },
      ],
    },
  }) as unknown as Declaration;

const page = (slug: string, title: string, nav: { section: string; order: number } | null, where?: object): Declaration =>
  ({
    id: `page.${slug}`,
    kind: 'page',
    body: {
      page: slug,
      title,
      ...(nav ? { nav } : {}),
      requires: ['register.tasks'],
      blocks: [{ kind: 'table', span: 12, source: 'register.tasks', ...(where ? { where } : {}), empty: 'Nothing here yet.' }],
    },
  }) as unknown as Declaration;

/** The saved view as the list screen saves one (`rows-write.ts` `viewPage`): a page under Views over one list. */
const VIEW = page('open-tasks', 'Open tasks', { section: VIEWS_SECTION, order: 900 }, { field: 'status', not_in: ['done'] });

/** A record made on `BORN`, its owner's first write that day, holding Tasks drawn on Mine and Later in the rail, and the view. */
async function record(more: readonly Declaration[] = []) {
  const sql = openSqlite();
  const clock = fixedClock(BORN);
  const kernel = await openRecord(sql, clock);
  value(await kernel.install([list('tasks', 'Tasks'), page('mine', 'Mine', { section: 'Tasks', order: 10 }), page('later', 'Later', { section: 'Tasks', order: 30 }), VIEW, ...more]));
  value(kernel.create('tasks', { what: 'Water the ferns' }, { actor: 'p_owner' }));
  /** One open of `slug` on each of `days`. */
  const opens = (days: readonly number[], slug = 'open-tasks'): void => {
    for (const day of days) {
      clock.set(BORN + day * DAY);
      value(kernel.observe([{ kind: 'page.render', subject: slug }]));
    }
  };
  const deps = (day: number, dismissed: readonly string[] = []): PenDeps => {
    const nowMs = BORN + day * DAY;
    clock.set(nowMs);
    return { kernel, reads: () => true, pages: kernel.pages(), dismissed: new Set(dismissed), use: { sql, nowMs } };
  };
  return { kernel, opens, deps };
}

const noIds = (item: PenItem): void => assert.doesNotMatch(`${item.title} ${item.why}`, /—|\brows?\b|ULID|#|register\.|open-tasks/u);

test('FIVE OPENS IN FOURTEEN DAYS OFFER THE VIEW A PLACE, at the end of its list\'s section, and the record takes it', async () => {
  const { kernel, opens, deps } = await record();
  opens([16, 17, 17, 19, 20]);
  const offered = viewPlacesOffered(deps(20));
  assert.equal(offered.length, 1);
  const item = offered[0]!;
  assert.equal(item.id, signatureOf('place', 'open-tasks'));
  assert.equal(item.id, 'place:open-tasks');
  assert.equal(item.register, 'tasks');
  assert.equal(item.title, 'Keep Open tasks in the rail?');
  assert.match(item.why, /^Opened 5 times in two weeks\./u);
  noIds(item);

  /* ONLY THE NAV MOVED: the same page at the same address, after Mine (10) and Later (30), so it pushes in front of neither. */
  assert.equal(item.change.to.id, 'page.open-tasks');
  const { nav, ...rest } = item.change.to.body;
  const { nav: was, ...before } = VIEW.body;
  assert.deepEqual(nav, { section: 'Tasks', order: 40 });
  assert.notDeepEqual(nav, was);
  assert.deepEqual(rest, before, 'something besides the nav moved');

  const [weighed] = placesWeighed(offered);
  assert.equal(weighed?.key, item.id);
  assert.equal(weighed?.change.kind, 'page');

  value(await kernel.install([{ id: item.change.to.id, kind: 'page', body: item.change.to.body } as Declaration]));
  assert.deepEqual(viewPlacesOffered(deps(20)), [], 'a view already kept in the rail was offered its place again');
});

test('FOUR OPENS OFFER NOTHING, nor five spread over more than a fortnight', async () => {
  const { opens, deps } = await record();
  opens([17, 18, 19, 20]);
  assert.deepEqual(viewPlacesOffered(deps(20)), []);
  opens([2]);
  assert.deepEqual(viewPlacesOffered(deps(20)), [], 'an open three weeks ago was counted');
  opens([20]);
  assert.equal(viewPlacesOffered(deps(20)).length, 1, `the control failed: ${PLACE_OPENS} opens in a fortnight were not offered`);
});

test('A YOUNG RECORD WAITS: opened five times in its first ten days it offers nothing, and on day 14 it offers the place', async () => {
  const { opens, deps } = await record();
  opens([5, 6, 7, 8, 9]);
  assert.deepEqual(viewPlacesOffered(deps(10)), [], 'a record ten days old was offered a place');
  assert.deepEqual(penQueued(deps(13)).ranked.filter((i) => i.id.startsWith('place:')), [], 'the pen offered a place on day 13');
  assert.equal(viewPlacesOffered(deps(14)).length, 1, 'the fortnight past, the place was not offered');
});

test('A DISMISSED PLACE IS NEVER OFFERED AGAIN, however often the view is opened after', async () => {
  const { opens, deps } = await record();
  opens([16, 17, 18, 19, 20]);
  assert.deepEqual(viewPlacesOffered(deps(20, ['place:open-tasks'])), []);
  opens([21, 22, 23, 24, 25, 26, 27, 28]);
  assert.deepEqual(penQueued(deps(28, ['place:open-tasks'])).ranked.filter((i) => i.id === 'place:open-tasks'), []);
});

test('A PAGE ALREADY IN THE RAIL, OR IN NONE, IS NO SAVED VIEW AND IS NOT OFFERED', async () => {
  const { opens, deps } = await record([page('loose', 'Loose ends', null)]);
  opens([16, 17, 18, 19, 20], 'mine');
  opens([16, 17, 18, 19, 20], 'loose');
  assert.deepEqual(viewPlacesOffered(deps(20)), []);
});

test('THE PLACE COUNTS TOWARD THE THREE SHOWN: four offers, three shown, the place among them', async () => {
  const others = [list('notes', 'Notes'), list('books', 'Books'), list('trips', 'Trips')];
  const { kernel, opens, deps } = await record(others);
  for (const id of ['notes', 'books', 'trips']) value(kernel.create(id, { what: `First in ${id}` }, { actor: 'p_owner' }));
  opens([16, 17, 18, 19, 20]);
  const pen = penQueued(deps(20));
  assert.equal(pen.ranked.length, 4, `the pen made ${pen.ranked.map((i) => i.id).join(', ')}`);
  assert.equal(pen.waiting.length, PEN_SHOWN);
  assert.ok(pen.waiting.some((i) => i.id === 'place:open-tasks'), 'the place was not among the three shown');
  assert.ok(pen.waiting.every((i) => /^\d{4}-\d{2}-\d{2}$/u.test(i.lapses)), 'an offer shown carries no day it lapses');
});
