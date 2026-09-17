/**
 * Moving Team 1.x tickets onto Work's tasks (`usecases/team.ts` `moveTickets`) copies every ticket, even when two tickets
 * share a title or a task already has one, and a second run still copies nothing twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moveTickets, type TicketIo } from '../src/usecases/team.ts';

type Row = { seq: number | null; fields: Record<string, unknown> };

function memory(lists: Record<string, Row[]>): TicketIo & { lists: Record<string, Row[]> } {
  let seq = 100;
  return {
    lists,
    rows: async (register) => lists[register] ?? [],
    create: async (register, fields) => {
      (lists[register] ??= []).push({ seq: ++seq, fields: { ...fields } });
      return true;
    },
  };
}

test('two tickets with one title both become tasks, and a second run copies neither again', async () => {
  const io = memory({
    tickets: [
      { seq: 1, fields: { what: 'Fix login bug', state: 'open', priority: 'low', owner: 'people#1' } },
      { seq: 2, fields: { what: 'Fix login bug', state: 'in_review', priority: 'urgent', owner: 'people#2', points: 3 } },
    ],
    tasks: [],
  });
  assert.equal(await moveTickets(io), 2);
  const tasks = io.lists.tasks ?? [];
  assert.deepEqual(
    tasks.map((t) => [t.fields.what, t.fields.state, t.fields.priority, t.fields.owner]),
    [
      ['Fix login bug', 'open', 'low', 'people#1'],
      ['Fix login bug', 'review', 'urgent', 'people#2'],
    ],
  );
  assert.equal(await moveTickets(io), 0);
  assert.equal(io.lists.tasks?.length, 2);
});

test('a task somebody typed with the same title as a ticket does not stand in for the ticket', async () => {
  const io = memory({
    tickets: [{ seq: 1, fields: { what: 'Fix login bug', state: 'open', priority: 'urgent', note: 'Seen on Safari' } }],
    tasks: [{ seq: 7, fields: { what: 'Fix login bug', state: 'done' } }],
  });
  assert.equal(await moveTickets(io), 1);
  const copied = (io.lists.tasks ?? []).filter((t) => t.fields.note === 'Seen on Safari');
  assert.equal(copied.length, 1);
  assert.equal(copied[0]?.fields.priority, 'urgent');
});
