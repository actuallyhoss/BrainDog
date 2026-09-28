import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS as SEED } from '@braindog/seed';

import type { Fields, RegisterDecl } from '../record/schema.ts';
import { addDays, bandOf, bandTitle, byDue, dueSaid, inProject, matches, nextMonday, shapeOf, weekdayOf } from './board.ts';

const TASKS = SEED.tasks as unknown as RegisterDecl;
const shape = shapeOf(TASKS);
const TODAY = '2026-09-29';

test("the founder record's tasks list says every part the screen draws", () => {
  assert.equal(shape.title, 'what');
  assert.equal(shape.state, 'state');
  assert.equal(shape.tickTo, 'done');
  assert.equal(shape.reopenTo, 'open');
  assert.equal(shape.fresh, 'open');
  assert.equal(shape.later, 'backlog');
  assert.deepEqual(shape.waiting, ['review', 'blocked']);
  assert.deepEqual(shape.project, { field: 'thing', to: 'things' });
  assert.equal(shape.due, 'by');
  assert.equal(shape.finished, 'done_on');
  assert.equal(shape.priority?.field, 'priority');
  assert.deepEqual(shape.owner, { field: 'owner', to: 'people' });
  assert.equal(shape.agent, 'agent');
  assert.equal(shape.said.backlog, 'Later');
  assert.equal(shape.said.review, 'To check');
  assert.equal(shape.said.doing, 'Doing');
});

test('a list with only a title and a state still draws, and every part it lacks is absent', () => {
  const bare = shapeOf({
    id: 'homework',
    name: 'Homework',
    one: 'piece',
    title: 'name',
    mobile: ['name', 'state', 'name'],
    state: 'state',
    done: ['handed_in'],
    fields: [
      { id: 'name', type: 'text' },
      { id: 'state', type: 'enum', values: ['to_do', 'handed_in'] },
    ],
  });
  assert.equal(bare.tickTo, 'handed_in');
  assert.equal(bare.fresh, 'to_do');
  assert.equal(bare.project, null);
  assert.equal(bare.due, null);
  assert.equal(bare.priority, null);
  assert.equal(bare.agent, null);
  assert.equal(bare.later, null);
  assert.equal(bandOf({ name: 'Essay', state: 'to_do' }, bare, TODAY), 'open');
  assert.equal(bandOf({ name: 'Essay', state: 'handed_in' }, bare, TODAY), 'done');
});

const band = (f: Fields) => bandOf(f, shape, TODAY);

test('a task is in the first band whose rule takes it, and in one band only', () => {
  assert.equal(band({ state: 'done', by: '2026-01-01' }), 'done');
  assert.equal(band({ state: 'dropped' }), 'done');
  assert.equal(band({ state: 'backlog', by: '2026-09-01' }), 'later', 'later wins over a passed day');
  assert.equal(band({ state: 'open', by: '2026-09-25', agent: 'claude' }), 'overdue', 'late whoever holds it');
  assert.equal(band({ state: 'open', by: TODAY }), 'today');
  assert.equal(band({ state: 'review', by: '2026-10-02' }), 'waiting');
  assert.equal(band({ state: 'blocked' }), 'waiting');
  assert.equal(band({ state: 'doing', agent: 'codex' }), 'agent');
  assert.equal(band({ state: 'open', priority: 'urgent' }), 'top');
  assert.equal(band({ state: 'open', priority: 'high' }), 'second');
  assert.equal(band({ state: 'open', priority: 'normal' }), 'open');
  assert.equal(band({ state: 'open' }), 'open', 'no priority is the ordinary case');
  assert.equal(band({ state: 'open', priority: 'low' }), 'low');
});

test("the bands are called by the list's own words", () => {
  assert.equal(bandTitle('top', shape), 'Urgent');
  assert.equal(bandTitle('second', shape), 'High');
  assert.equal(bandTitle('low', shape), 'Low');
  assert.equal(bandTitle('later', shape), 'Later');
  assert.equal(bandTitle('changed', shape), 'Just changed');
  assert.equal(bandTitle('done', shape), 'Done recently');
});

test('inside a band the soonest due comes first, a task with no day after, then the newest', () => {
  const rows = [
    { seq: 1, fields: { by: null } },
    { seq: 2, fields: { by: '2026-10-05' } },
    { seq: 3, fields: { by: '2026-10-01' } },
    { seq: 4, fields: {} },
  ];
  assert.deepEqual(rows.sort(byDue(shape)).map((r) => r.seq), [3, 2, 4, 1]);
});

test('the project filter: every task, the unfiled ones, or one project', () => {
  assert.equal(inProject({ thing: 2 }, shape, ''), true);
  assert.equal(inProject({ thing: 2 }, shape, '2'), true);
  assert.equal(inProject({ thing: 2 }, shape, '3'), false);
  assert.equal(inProject({ thing: null }, shape, 'none'), true);
  assert.equal(inProject({ thing: 2 }, shape, 'none'), false);
});

test('the search box reads the words, the note, the names drawn, and #number', () => {
  const t = { seq: 12, fields: { what: 'Chase Halden', note: 'the September invoice' } };
  const named = () => 'Kiln';
  assert.equal(matches(t, shape, 'halden', named), true);
  assert.equal(matches(t, shape, 'september chase', named), true);
  assert.equal(matches(t, shape, 'kiln', named), true);
  assert.equal(matches(t, shape, '#12', named), true);
  assert.equal(matches(t, shape, '#1', named), false);
  assert.equal(matches(t, shape, 'rent', named), false);
});

test('days are counted on the calendar and said the way a person says them', () => {
  assert.equal(addDays('2026-09-29', 3), '2026-10-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekdayOf('2026-09-29'), 2, 'a Tuesday');
  assert.equal(nextMonday('2026-09-29'), '2026-10-05');
  assert.equal(nextMonday('2026-10-05'), '2026-10-12', 'on a Monday, next week is the one after');
  assert.equal(dueSaid('2026-09-29', TODAY), 'Today');
  assert.equal(dueSaid('2026-09-30', TODAY), 'Tomorrow');
  assert.equal(dueSaid('2026-09-28', TODAY), 'Yesterday');
  assert.equal(dueSaid('2026-09-25', TODAY), '4 days late');
  assert.equal(dueSaid('2026-10-02', TODAY), 'Fri');
  assert.equal(dueSaid('2026-10-14', TODAY), '14 Oct');
  assert.equal(dueSaid('2027-02-01', TODAY), '1 Feb 2027');
});
