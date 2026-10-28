/**
 * One rule for whether a page is there for its reader: the agent door's list of resources and the
 * record's `pages()` both drop a page whose every block is withheld from the caller, by the kernel's `whollyWithheld`.
 *
 * THE CODES ARE HELD TO THE KERNEL'S, and the answer to one caller on a real record: a member who may only add entries
 * to Tasks is shown neither the page that reads Tasks alone, in either list, and is shown the page that also reads Notes,
 * in both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { WITHHELD_CODES, tools } from '../src/index.ts';
import { WITHHELD_CODES as KERNEL_CODES } from '../../kernel/src/pages.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** A member who may add tasks and read nothing of them, and may read notes. */
const adder: CallContext = { principal: { kind: 'person', id: 'p_2', level: null }, levels: { tasks: 'append', notes: 'read' } };

const register = (id: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name: id, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
});
const page = (slug: string, sources: string[]) => ({
  id: `page.${slug}`,
  kind: 'page' as const,
  body: { page: slug, title: slug, blocks: sources.map((source) => ({ kind: 'table', source })) } as never,
});

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const installed = await api.kernel.install([
    register('tasks'),
    register('notes'),
    page('task-board', ['register.tasks']),
    page('desk', ['register.tasks', 'register.notes']),
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { sql, api };
}

test('THE DOOR WITHHOLDS BY THE KERNEL CODES, the same two and no other', () => {
  assert.deepEqual([...WITHHELD_CODES].sort(), [...KERNEL_CODES].sort());
});

test('A MEMBER WHO MAY ONLY ADD TASKS IS SHOWN THE SAME PAGES BY THE RECORD AND BY THE DOOR', async () => {
  const { sql, api } = await record();
  const slugs = async (ctx: CallContext) => {
    const listed = await api.pages(ctx);
    assert.ok(listed.ok, JSON.stringify(listed));
    const fromRecord = (listed.value as { slug: string }[]).map((p) => p.slug).filter((s) => s === 'task-board' || s === 'desk').sort();
    const fromDoor = (await tools(api).resources(ctx))
      .map((r) => r.uri)
      .filter((u) => u === 'braindog:page/task-board' || u === 'braindog:page/desk')
      .map((u) => u.slice('braindog:page/'.length))
      .sort();
    return { fromRecord, fromDoor };
  };

  const theirs = await slugs(adder);
  assert.deepEqual(theirs.fromDoor, ['desk'], 'the door lists a page whose every block is held from her, or drops one she can read');
  assert.deepEqual(theirs.fromRecord, theirs.fromDoor, 'the record and the door disagree on which pages are there for her');

  const mine = await slugs(owner);
  assert.deepEqual(mine.fromDoor, ['desk', 'task-board']);
  assert.deepEqual(mine.fromRecord, mine.fromDoor);
  sql.close();
});
