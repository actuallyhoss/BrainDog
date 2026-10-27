/**
 * A table's rows in groups on a live page: a table block whose rows carry their group (`PageRow.group`,
 * `{ value, name }`) answers the drawn block the same `groups` a card block gets, aligned with the rows, and each drawn
 * row says its group by name, which the table draws its headings from.
 *
 * THE ROWS CARRY `group` IN THIS FILE'S OWN FIXTURE. The kernel's read that groups a table by its state or a choice was
 * being built beside this in the same batch, so these rows stand for what it answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { blockOf } from './page-live.ts';

const AT = Date.parse('2026-10-14T12:00:00.000Z');

type Group = { value: string; name: string };
const task = (seq: number, title: string, group?: Group) => ({
  register: 'tasks',
  seq,
  fields: { title },
  version: 1,
  created: '2026-10-13T09:00:00.000Z',
  by: 'p_owner',
  ...(group ? { group } : {}),
});

const OPEN = { value: 'open', name: 'Open' };
const DOING = { value: 'doing', name: 'Doing' };
const DONE = { value: 'done', name: 'Done' };

const answered = (kind: string, rows: ReturnType<typeof task>[]) => ({
  kind,
  source: 'register.tasks',
  columns: [{ field: 'title', label: 'Task' }],
  rows,
  matched: rows.length,
  refusals: [],
});

const named = (rows: readonly object[]) => rows.map((r) => (r as { group?: unknown }).group ?? null);

test('A TABLE WHOSE ROWS SAY THEIR GROUP answers groups aligned with its rows, the groups in the order first seen', () => {
  const rows = [task(1, 'Send the renewal', OPEN), task(2, 'Book the venue', DOING), task(3, 'Pay the deposit', OPEN), task(4, 'File the return', DONE), task(5, 'Call the bank', DOING)];
  const block = blockOf(answered('table', rows) as never, new Map(), AT);
  assert.equal(block.cannot, undefined);
  assert.deepEqual(block.groups, ['Open', 'Doing', 'Open', 'Done', 'Doing']);
  assert.deepEqual([...new Set(block.groups)], ['Open', 'Doing', 'Done'], 'three groups, in the order their first rows stand');
  assert.deepEqual(named(block.rows), ['Open', 'Doing', 'Open', 'Done', 'Doing'], 'each drawn row says its group, so a slice of them keeps it');
  assert.deepEqual(block.rows.map((r) => r.cells[0]), ['Send the renewal', 'Book the venue', 'Pay the deposit', 'File the return', 'Call the bank'], 'the rows stay in the order the record read them');
});

test('A ROW IN NO GROUP IS UNTOUCHED: no name on it, and a group that points at nothing is no group', () => {
  const rows = [task(1, 'Send the renewal', OPEN), task(2, 'Loose one'), task(3, 'Nothing set', { value: '', name: 'No state' })];
  const block = blockOf(answered('table', rows) as never, new Map(), AT);
  assert.deepEqual(block.groups, ['Open', null, null]);
  assert.deepEqual(named(block.rows), ['Open', null, null]);
});

test('A TABLE WHOSE ROWS SAY NO GROUP is drawn exactly as it was: no groups, and nothing put on a row', () => {
  const rows = [task(1, 'Send the renewal'), task(2, 'Book the venue')];
  const block = blockOf(answered('table', rows) as never, new Map(), AT);
  assert.equal(block.groups, undefined);
  assert.deepEqual(named(block.rows), [null, null]);
  assert.ok(block.rows.every((r) => !('group' in r)));
});

test('A CARD BLOCK IS UNCHANGED: its groups as before, and nothing put on its rows', () => {
  const rows = [task(1, 'Send the renewal', OPEN), task(2, 'Book the venue', DOING), task(3, 'Loose one')];
  const block = blockOf(answered('cards', rows) as never, new Map(), AT);
  assert.deepEqual(block.groups, ['Open', 'Doing', null]);
  assert.ok(block.rows.every((r) => !('group' in r)), 'a card is grouped by `blocks.ts`, from `groups`, not from its row');
});
