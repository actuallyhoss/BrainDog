/**
 * Who else changed a row on a page (`byline.ts`): the record's `changes` gathered by the row each is about, new to the
 * reader until they leave the page or open the row, and what they have seen kept in the browser's storage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bylinesIn, changedLine, keepSeen, seenOn, type Byline, type Seen, type Store } from './byline.ts';

const now = Date.parse('2026-10-06T12:00:00Z');
const hoursAgo = (h: number): string => new Date(now - h * 3_600_000).toISOString();
const names = new Map([['p_owner', 'Mara']]);
const none: Seen = { page: 0, rows: {} };

const tasks = {
  register: 'tasks',
  entries: [{ seq: 1 }, { seq: 2 }, { seq: 3 }],
  changes: [
    { by: 'agent', who: 'S42', agent: 'claude', for: 'p_owner', at: hoursAgo(2), batch: 'b_1', run: 'S42' },
    { by: 'you', who: 'p_owner', at: hoursAgo(1) },
    null,
  ],
};

test('A ROW AN AGENT CHANGED CARRIES ITS BYLINE BY NAME, and a row the reader changed carries none', () => {
  const lines = bylinesIn([tasks], none, 'p_other', names, now);
  assert.deepEqual([...lines.keys()], ['tasks#1']);
  const one = lines.get('tasks#1');
  assert.equal(one?.said, 'Claude for Mara · 2h ago');
  assert.equal(one?.batch, 'b_1', 'its Undo puts back that batch');
  assert.equal(one?.run, 'S42', 'the run is a handle beside the name, never the name');
  assert.equal(one?.unseen, false, 'no mark is no claim: nothing is called new without one');
});

test('A PLAIN LOAD TINTS NO ROW: a page with no mark on this device is seen as it opens, and only a later change is new', () => {
  const held = new Map<string, string>();
  const store: Store = { getItem: (k) => held.get(k) ?? null, setItem: (k, v) => void held.set(k, v) };
  /* A LEDGER AN IMPORT WROTE THIS WEEK, every change newer than the read mark only Home moves, so the record calls each
     `unseen`. Opened on a device with no mark for the page: 261 rows, none of them new. */
  const ledger = {
    register: 'transactions',
    entries: Array.from({ length: 261 }, (_, i) => ({ seq: i + 1 })),
    changes: Array.from({ length: 261 }, (_, i) => ({ by: 'agent', who: 'S7', agent: 'claude', at: hoursAgo(1 + (i % 100)), batch: `b_${i}`, unseen: true })),
  };
  const first = seenOn('money', store, now);
  assert.equal(first.page, now, 'the first visit starts the mark at the moment it opens');
  const drawn = bylinesIn([ledger], first, null, names, now);
  assert.equal(drawn.size, 261, 'every row still carries its byline, for the panel and its Undo');
  assert.equal([...drawn.values()].filter((b) => b.unseen).length, 0, 'and none of them is tinted');

  /* A ROW THAT ARRIVES AFTER THE PAGE WAS OPENED is new, on that same first visit. */
  const after = new Date(now + 60_000).toISOString();
  const arrived = { ...ledger, entries: [{ seq: 262 }, ...ledger.entries], changes: [{ by: 'agent', who: 'S7', agent: 'claude', at: after, batch: 'b_new', unseen: true }, ...ledger.changes] };
  const later = bylinesIn([arrived], first, null, names, now + 120_000);
  assert.deepEqual([...later].filter(([, b]) => b.unseen).map(([k]) => k), ['transactions#262']);

  /* LEFT AND COME BACK TO: what changed before the page was left is seen, whatever the record still says. */
  const left: Seen = { page: now - 30 * 60_000, rows: {} };
  const back = bylinesIn([{ ...ledger, changes: [{ ...ledger.changes[0]!, at: hoursAgo(0.25) }, ...ledger.changes.slice(1)] }], left, null, names, now);
  assert.deepEqual([...back].filter(([, b]) => b.unseen).map(([k]) => k), ['transactions#1'], 'only the change since');

  /* AND THE RECORD'S WORD TAKES A TINT AWAY: read on Home on another device, it is not new here either. */
  const read = { register: 'tasks', entries: [{ seq: 9 }], changes: [{ by: 'agent', who: 'S7', agent: 'claude', at: hoursAgo(0.25), unseen: false }] };
  assert.equal(bylinesIn([read], left, null, names, now).get('tasks#9')?.unseen, false);

  /* A MARK KEPT BY A ROW OPENED BEFORE THE PAGE WAS EVER LEFT (`page: 0`) is no page mark either. */
  held.set('braindog.seen.old', JSON.stringify({ page: 0, rows: { 'tasks#1': 7 } }));
  assert.deepEqual(seenOn('old', store, now), { page: now, rows: { 'tasks#1': 7 } });
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
  assert.deepEqual(seenOn('money', store, now), { page: now, rows: {} }, 'another page starts its own mark as it opens');

  const rows = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`tasks#${i}`, i]));
  keepSeen('work', { page: 1, rows }, store);
  const kept = seenOn('work', store).rows;
  assert.equal(Object.keys(kept).length, 200);
  assert.equal(kept['tasks#249'], 249, 'the newest are the ones kept');

  held.set('braindog.seen.odd', '{not json');
  assert.deepEqual(seenOn('odd', store, now), { page: now, rows: {} });
  const refusing: Store = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.deepEqual(seenOn('work', refusing, now), { page: now, rows: {} });
  assert.doesNotThrow(() => keepSeen('work', { page: 1, rows: {} }, refusing));
  assert.deepEqual(seenOn('work', null, now), { page: now, rows: {} });
});

/* ── the line at the foot of the board ────────────────────── */

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
