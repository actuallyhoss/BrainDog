/**
 * Sharing on as data (the manage rung): which of the caller's shares can be passed on, what is asked for when one list
 * is picked out of it, who it can go to, and the sentence said before the record answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listsOffered, onwardOf, onwardPeople, onwardReady, onwardSentence, onwardShare, onwardStart, onwardTarget, type OnwardPick } from './onward.ts';
import type { MyShare } from './sharing.ts';

const NOW = Date.UTC(2026, 9, 20, 12);

const mine = (over: Partial<MyShare>): MyShare => ({
  id: 'sh_1',
  sentence: 'You can manage everything in Kiln until 19 Nov.',
  can: 'manage',
  until: '2026-11-19T23:59:59.000Z',
  onward: true,
  live: true,
  by: 'Ada',
  welcome: '',
  ...over,
});

const KILN = mine({ what: { project: 'e_kiln' }, subject: 'Kiln', lists: [{ id: 'tasks', name: 'Tasks' }], to: [{ id: 'p_sam', name: 'Sam' }, { id: 'p_me', name: 'Me' }] });
const SAM = { id: 'p_sam', name: 'Sam' };

test('ONLY A LIVE SHARE THAT MAY BE SHARED ON IS OFFERED', () => {
  const rows = [KILN, mine({ id: 'sh_2', onward: false }), mine({ id: 'sh_3', live: false })];
  assert.deepEqual(
    onwardOf(rows).map((m) => m.id),
    ['sh_1'],
  );
});

test('ONE LIST PICKED OUT IS ASKED FOR INSIDE THE SAME PROJECT, or alone; rows and conditions go on whole', () => {
  assert.equal(onwardTarget({ project: 'e_kiln' }, null), undefined, 'all of it is the parent itself');
  assert.deepEqual(onwardTarget({ project: 'e_kiln' }, 'tasks'), { project: 'e_kiln', lists: ['tasks'] });
  assert.deepEqual(onwardTarget({ lists: ['tasks', 'money'] }, 'tasks'), { lists: ['tasks'] });
  assert.deepEqual(onwardTarget({ record: true }, 'tasks'), { lists: ['tasks'] });
  assert.equal(onwardTarget({ list: 'tasks', rows: ['e_1'] }, 'tasks'), undefined);
  assert.equal(onwardTarget({ list: 'tasks', where: { field: 'stage', is: 'Review' } }, 'tasks'), undefined);
  assert.equal(onwardTarget(null, 'tasks'), undefined, 'a record that does not send the target is shared on whole');

  assert.deepEqual(listsOffered(KILN), [{ id: 'tasks', name: 'Tasks' }]);
  assert.deepEqual(listsOffered(mine({ what: { list: 'tasks', rows: ['e_1'] }, lists: [{ id: 'tasks', name: 'Tasks' }] })), [], 'rows are not split');
  assert.deepEqual(listsOffered(mine({ lists: [{ id: 'tasks', name: 'Tasks' }] })), [], 'no target, nothing to split');
});

test('THE SENTENCE: Sam can edit tasks in Kiln until his own share ends, and says it ends when yours does', () => {
  const p: OnwardPick = { ...onwardStart('sh_1'), to: SAM, can: 'edit', list: 'tasks' };
  assert.deepEqual(onwardShare(KILN, p), {
    effect: 'allow',
    who: { kind: 'person', id: 'p_sam' },
    what: { project: 'e_kiln', lists: ['tasks'] },
    can: 'edit',
    when: { until: '2026-11-19T23:59:59.000Z' },
  });
  assert.equal(onwardSentence(KILN, p, NOW), 'Sam can edit tasks in Kiln until 19 Nov. Ends when yours does.');
  assert.equal(onwardSentence(KILN, { ...p, list: null, can: 'comment' }, NOW), 'Sam can comment on everything in Kiln until 19 Nov. Ends when yours does.');
  assert.equal(onwardSentence(KILN, { ...p, to: null }, NOW), '', 'nothing is said with nobody picked');
});

test('FROM A RECORD THAT SENDS NO TARGET, the sentence names the share by its subject, or by what they manage', () => {
  const p: OnwardPick = { ...onwardStart('sh_1'), to: SAM, can: 'comment' };
  assert.equal(onwardShare(mine({}), p), null);
  assert.equal(onwardSentence(mine({ subject: 'Kiln' }), p, NOW), 'Sam can comment on Kiln. Ends when yours does.');
  assert.equal(onwardSentence(mine({}), { ...p, can: 'view' }, NOW), 'Sam can view what you manage. Ends when yours does.');
});

test('WHO IT GOES TO: the record\'s own list for the share, else who the caller can list, never the caller, by name', () => {
  assert.deepEqual(onwardPeople(KILN, [], 'p_me'), [SAM]);
  assert.deepEqual(
    onwardPeople(mine({}), [{ id: 'p_zed', name: 'Zed' }, { id: 'p_ana', name: 'Ana' }, { id: 'p_me', name: 'Me' }, { id: 'p_x', name: ' ' }], 'p_me'),
    [{ id: 'p_ana', name: 'Ana' }, { id: 'p_zed', name: 'Zed' }],
  );
  assert.equal(onwardReady(onwardStart('sh_1'), 'p_me'), false, 'nobody picked');
  assert.equal(onwardReady({ ...onwardStart('sh_1'), to: SAM }, 'p_me'), true);
  assert.equal(onwardReady({ ...onwardStart('sh_1'), to: { id: 'p_me', name: 'Me' } }, 'p_me'), false, 'never to themselves');
});
