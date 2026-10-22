/**
 * `kernel.page` takes its reader: the look is laid over the blocks as this caller is shown them, so a
 * member held from a list is never led by it, and a caller that names no reader reads the page as the record does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type BlockResult, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER = { actor: 'p_1' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    state: 'state',
    done: ['done'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'by', type: 'day', deadline: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

const DESK: Declaration = {
  id: 'page.desk',
  kind: 'page',
  body: {
    page: 'desk',
    title: 'Desk',
    requires: ['register.tasks'],
    blocks: [
      { kind: 'note', lead: true, body: 'Your desk.' },
      { kind: 'table', source: 'register.tasks', heading: 'Now', where: 'state is open', columns: [{ field: 'what' }, { field: 'by' }] },
    ],
  } as never,
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([TASKS, DESK]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('tasks', { what: 'Pay HSBC', by: '2026-10-03' }, OWNER).ok);
  return k;
}

/** A member's hold over the tasks list, as the record's `heldBlock` holds it. */
const held = (b: BlockResult): BlockResult =>
  b.source === 'register.tasks' ? { ...b, rows: [], matched: 0, refusals: [{ code: 'FORBIDDEN', fix: 'You may not open this list.' }] } : b;

test('A PAGE READ FOR A READER IS LAID FOR WHAT THEY ARE SHOWN, and one read for nobody is the record’s', async () => {
  const k = await record();
  const whole = k.page('desk');
  assert.ok(whole.ok, JSON.stringify(whole));
  assert.equal(whole.value.look?.next?.row, 'tasks#1', 'the owner is led to the late task');

  const member = k.page('desk', undefined, { reader: { hold: held, seen: null } });
  assert.ok(member.ok, JSON.stringify(member));
  assert.equal(member.value.look?.next, undefined, 'a list she may not open names no row to her');
  const now = member.value.blocks.find((b) => b.heading === 'Now');
  assert.deepEqual(now?.refusals.map((r) => r.code), ['FORBIDDEN']);
  assert.deepEqual(now?.rows, []);
  assert.ok(!JSON.stringify(member.value.look ?? {}).includes('HSBC'));
});
