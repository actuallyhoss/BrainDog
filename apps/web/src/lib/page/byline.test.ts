/**
 * Who else changed a row on a page (`byline.ts`): the record's `changes` gathered by the row each is about, new to the
 * reader until they leave the page or open the row, and what they have seen kept in the browser's storage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bylinesIn, changedLine, keepSeen, seenOn, type Byline, type Seen, type Store } from './byline.ts';

const now = Date.parse('2026-10-06T12:00:00Z');
const hoursAgo = (h: number): string => new Date(now - h * 3_600_000).toISOString();
const names = new Map([['p_sam', 'Sam']]);
const none: Seen = { page: 0, rows: {} };

const tasks = {
  register: 'tasks',
  entries: [{ seq: 1 }, { seq: 2 }, { seq: 3 }],
  changes: [
    { by: 'agent', who: 'S42', agent: 'claude', for: 'p_sam', at: hoursAgo(2), batch: 'b_1', run: 'S42' },
    { by: 'you', who: 'p_sam', at: hoursAgo(1) },
    null,
  ],
};

test('A ROW AN AGENT CHANGED CARRIES ITS BYLINE BY NAME, and a row the reader changed carries none', () => {
  const lines = bylinesIn([tasks], none, 'p_other', names, now);
  assert.deepEqual([...lines.keys()], ['tasks#1']);
  const one = lines.get('tasks#1');
  assert.equal(one?.said, 'Claude for Sam · 2h ago');
  assert.equal(one?.batch, 'b_1', 'its Undo puts back that batch');
  assert.equal(one?.run, 'S42', 'the run is a handle beside the name, never the name');
  assert.equal(one?.unseen, true, 'a page never left has seen nothing');
});

test('SEEN ONCE THE PAGE WAS LEFT AFTER IT, OR THE ROW OPENED; a change since is new again', () => {
  const left: Seen = { page: now - 3_600_000, rows: {} };
  assert.equal(bylinesIn([tasks], left, null, names, now).get('tasks#1')?.unseen, false, 'left an hour ago, after the change two hours ago');
  const opened: Seen = { page: now - 5 * 3_600_000, rows: { 'tasks#1': now - 30 * 60_000 } };
  assert.equal(bylinesIn([tasks], opened, null, names, now).get('tasks#1')?.unseen, false, 'the row was opened since');
  const before: Seen = { page: now - 5 * 3_600_000, rows: { 'tasks#1': now - 3 * 3_600_000 } };
  assert.equal(bylinesIn([tasks], before, null, names, now).get('tasks#1')?.unseen, true, 'opened before it changed');
});

test('TWO BLOCKS DRAWING ONE ROW GIVE ITS NEWEST CHANGE, and a block not aligned with its rows gives none', () => {
  const later = { register: 'tasks', entries: [{ seq: 1 }], changes: [{ by: 'rule', who: 'rule:chase-late', at: hoursAgo(1), batch: 'b_2' }] };
  assert.equal(bylinesIn([tasks, later], none, null, names, now).get('tasks#1')?.batch, 'b_2');
  const off = { register: 'tasks', entries: [{ seq: 1 }, { seq: 2 }], changes: [tasks.changes[0]] };
  assert.equal(bylinesIn([off], none, null, names, now).size, 0);
  assert.equal(bylinesIn([{ entries: [{ seq: 1 }], changes: [tasks.changes[0]] }], none, null, names, now).size, 0, 'a block over no list');
});

test('WHAT WAS SEEN IS KEPT PER PAGE, the newest rows only, and a store that refuses keeps nothing and breaks nothing', () => {
  const held = new Map<string, string>();
  const store: Store = { getItem: (k) => held.get(k) ?? null, setItem: (k, v) => void held.set(k, v) };
  keepSeen('work', { page: 5, rows: { 'tasks#1': 7 } }, store);
  assert.deepEqual(seenOn('work', store), { page: 5, rows: { 'tasks#1': 7 } });
  assert.deepEqual(seenOn('money', store), none, 'another page has seen nothing');

  const rows = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`tasks#${i}`, i]));
  keepSeen('work', { page: 1, rows }, store);
  const kept = seenOn('work', store).rows;
  assert.equal(Object.keys(kept).length, 200);
  assert.equal(kept['tasks#249'], 249, 'the newest are the ones kept');

  held.set('braindog.seen.odd', '{not json');
  assert.deepEqual(seenOn('odd', store), none);
  const refusing: Store = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.deepEqual(seenOn('work', refusing), none);
  assert.doesNotThrow(() => keepSeen('work', { page: 1, rows: {} }, refusing));
  assert.deepEqual(seenOn('work', null), none);
});

/* ── the line at the foot of the board (DIRECTION §39) ────────────────────── */

const line = (by: Byline['by'], name: string, h: number): Byline => ({
  by,
  name,
  app: null,
  for: null,
  at: hoursAgo(h),
  batch: null,
  run: null,
  unseen: true,
  said: name,
});

test('THE WEEK’S CHANGES ARE ONE LINE, said by who made them when it is one kind, and nothing when there are none', () => {
  const rules = [1, 2, 3, 4, 5].map((h) => line('rule', `Rule ${h}`, h));
  assert.deepEqual(changedLine(rules, now), { count: 5, text: '5 changes by your rules this week' });
  assert.deepEqual(changedLine([line('agent', 'Claude', 2)], now), { count: 1, text: '1 change by Claude this week' });
  assert.deepEqual(changedLine([line('slash', 'Slash', 2), line('slash', 'Slash', 3)], now), { count: 2, text: '2 changes by Slash this week' });
  assert.equal(changedLine([line('agent', 'Claude', 2), line('agent', 'Cursor', 3)], now)?.text, '2 changes made for you this week');
  assert.equal(changedLine([line('rule', 'Late reply', 2), line('agent', 'Claude', 3)], now)?.text, '2 changes made for you this week');
  assert.equal(changedLine([line('rule', 'Late reply', 24 * 8)], now), null, 'a change older than the week is not this week’s');
  assert.equal(changedLine([], now), null);
});
