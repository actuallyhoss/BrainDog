import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PAGES } from '@braindog/seed';

import { filterOf } from '../page/filters.ts';
import { TASKS } from './list.ts';
import { CLASSIC, WORK_PAGE, workView } from './page.ts';

const q = (s: string) => new URLSearchParams(s);

test('/?work draws the declared page on a record that holds it', () => {
  assert.equal(workView(q('work'), ['money', WORK_PAGE]), 'page');
  /* A FILTER OR THE SOURCE IN THE ADDRESS IS STILL THE PAGE, narrowed or shown as it is built. */
  assert.equal(workView(q('work&f.thing=12'), [WORK_PAGE]), 'page');
  assert.equal(workView(q('work&src=1'), [WORK_PAGE]), 'page');
});

test('/?work&classic draws the screen as it was, and so does a record with tasks and no Work page', () => {
  assert.equal(workView(q(`work&${CLASSIC}`), [WORK_PAGE]), 'classic');
  assert.equal(workView(q('work'), ['money']), 'classic');
  assert.equal(workView(q('work'), []), 'classic');
  /* A PAGE CALLED SOMETHING LIKE IT IS NOT IT. */
  assert.equal(workView(q('work'), ['work-board']), 'classic');
});

/* WHAT WORK HANDS THE ONE READER, read off the work module's own declaration: the keys it keeps are the page's (`n` goes
   to a capture line, `x e m Delete` act on a task a block draws), so the page must hold both. */
const work = PAGES[WORK_PAGE] as unknown as {
  page: string;
  blocks: { kind: string; lead?: boolean; register?: string; source?: string; fold?: boolean }[];
  filters?: { field: string }[];
};

test('the project strip narrows by the field the page declares, `thing`, which the address carries as f.thing', () => {
  /* A TASK KEEPS ITS PROJECT IN `thing` (labelled Project). There is no `project` field, and the kernel refuses a filter
     on a field no required list has, so `?f.project=` would narrow nothing. */
  assert.deepEqual(work.filters?.map((f) => f.field), ['thing']);
  assert.deepEqual(filterOf(q('work&f.thing=12')), { thing: '12' });
});

test('the Work page opens on its line, then the capture line over the tasks', () => {
  assert.ok(work, 'the work module declares page.work');
  assert.equal(work.page, WORK_PAGE);
  /* ONE LEAD LINE A STATE (work 1.13.0): the late task named when there is one, the counts when there is not, each
     behind its own `when:`, so the page still opens on one line and then the capture. */
  const lines = work.blocks.findIndex((b) => !(b.kind === 'note' && b.lead === true));
  assert.ok(lines >= 1, 'the page opens on its line');
  for (const b of work.blocks.slice(0, lines)) assert.ok((b as { when?: unknown }).when, 'two lead lines with no when: would both draw');
  assert.equal(work.blocks[lines]?.kind, 'capture');
  assert.equal(work.blocks[lines]?.register, TASKS);
});

test('every list the Work page draws is the tasks, so each task it shows opens in the panel and takes the keys', () => {
  const lists = work.blocks.filter((b) => b.kind === 'todo');
  assert.ok(lists.length > 0);
  for (const b of lists) assert.equal(b.source, `register.${TASKS}`);
});

test('what the screen cut is not declared: no tier chart, and what is further off is folded shut', () => {
  assert.equal(
    work.blocks.some((b) => b.kind === 'waffle' || b.kind === 'chart'),
    false,
  );
  assert.ok(work.blocks.some((b) => b.kind === 'section' && b.fold === true));
});
