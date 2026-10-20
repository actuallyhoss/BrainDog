/**
 * A rowset question an undo puts back in Decide can be answered yes again: each row it updates is read at the version
 * it holds now, when the row holds what it held before the decision. Before this, every reopened rowset was refused as
 * changed since, because the decision's writes and the undo's had both moved its rows on. A row somebody has changed in
 * a way the question never saw keeps its old version, and stays refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 9);
const OWNER = { actor: 'p_owner' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'tags', type: 'list', of: 'text' },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, out.ok ? '' : fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; task: Entry }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  const task = value<Entry>(k.create('tasks', { name: 'Ship the ladder', note: 'by Friday', tags: ['work'] }, OWNER));
  return { k, sql, task };
}

const bodyOf = (sql: NodeSql, id: string) => JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as { rows: { version: number }[] };
const statusOf = (sql: NodeSql, id: string) => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)?.status;

/** Accept `id`, then undo that decision whole. */
function acceptThenUndo(k: Kernel, id: string): void {
  const done = value<{ decision: string }>(k.decide(id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
  const plan = value<{ hash: string }>(k.undoPlan({ decision: done.decision }));
  value(k.undoApply({ decision: done.decision }, plan.hash, 'p_owner'));
}

test('A ROWSET AN UNDO REOPENS CAN BE ACCEPTED AGAIN, its rows read at the versions they hold now', async () => {
  const { k, sql, task } = await record();
  const asked = value<{ id: string }>(
    k.propose({ question: 'Mark the ladder shipped?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: task.version, patch: { state: 'done', tags: ['work', 'shipped'] } }] } }, OWNER),
  );
  acceptThenUndo(k, asked.id);

  const now = k.get(task.id)!;
  assert.equal(now.fields.state, 'open');
  assert.deepEqual(now.fields.tags, ['work']);
  assert.equal(statusOf(sql, asked.id), 'open', 'the undo put the question back in Decide');
  assert.equal(bodyOf(sql, asked.id).rows[0]!.version, now.version, 'read again at the version the row holds now');

  value(k.decide(asked.id, { decide: { option: 'accept', reason: 'yes, again' } }, 'p_owner'));
  assert.equal(k.get(task.id)!.fields.state, 'done');
  assert.deepEqual(k.get(task.id)!.fields.tags, ['work', 'shipped']);
  sql.close();
});

test('A ROW CHANGED IN A WAY THE QUESTION NEVER SAW KEEPS ITS OLD VERSION, and a yes settles it without writing', async () => {
  const { k, sql, task } = await record();
  /* THE NOTE IS ALREADY WHAT THE PATCH ASKS, so the decision leaves it alone; somebody changes it afterwards. */
  const asked = value<{ id: string }>(
    k.propose({ question: 'Mark the ladder shipped?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: task.version, patch: { state: 'done', note: 'by Friday' } }] } }, OWNER),
  );
  const done = value<{ decision: string }>(k.decide(asked.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
  const later = k.get(task.id)!;
  value(k.update('tasks', task.id, { note: 'next week' }, { ...OWNER, version: later.version }));
  const plan = value<{ hash: string }>(k.undoPlan({ decision: done.decision }));
  value(k.undoApply({ decision: done.decision }, plan.hash, 'p_owner'));

  assert.equal(statusOf(sql, asked.id), 'open');
  assert.equal(bodyOf(sql, asked.id).rows[0]!.version, task.version, 'the note moved since, so the question keeps what it read');
  /* SETTLED IN A PLAIN LINE, never refused for a version no read brings back (`rowset-moved.test.ts`). */
  const again = value<{ settled?: string }>(k.decide(asked.id, { decide: { option: 'accept', reason: 'yes, again' } }, 'p_owner'));
  assert.ok(again.settled, 'a yes on a row moved since wrote over it');
  assert.equal(statusOf(sql, asked.id), 'resolved');
  assert.equal(k.get(task.id)!.fields.note, 'next week');
  sql.close();
});

test('A ROW THE DECISION NEVER WROTE IS LEFT AS IT WAS READ, while the one it wrote is read again', async () => {
  const { k, sql, task } = await record();
  const other = value<Entry>(k.create('tasks', { name: 'Glaze the bowls' }, OWNER));
  const asked = value<{ id: string }>(
    k.propose(
      {
        question: 'Close both?',
        body_kind: 'rowset',
        body: {
          register: 'tasks',
          rows: [
            { at: 'tasks#1', version: task.version, patch: { state: 'done' } },
            { at: 'tasks#2', version: other.version, patch: { state: 'done' } },
          ],
        },
      },
      OWNER,
    ),
  );
  /* ONLY THE FIRST IS PICKED, so the second is never written. */
  const done = value<{ decision: string }>(k.decide(asked.id, { decide: { option: 'accept', reason: 'one', rows: [0] } }, 'p_owner'));
  const plan = value<{ hash: string }>(k.undoPlan({ decision: done.decision }));
  value(k.undoApply({ decision: done.decision }, plan.hash, 'p_owner'));
  const rows = bodyOf(sql, asked.id).rows;
  assert.equal(rows[0]!.version, k.get(task.id)!.version);
  assert.equal(rows[1]!.version, other.version);
  sql.close();
});

test('A LIST SOMEBODY ADDED TO AFTER THE UNDO KEEPS ITS OLD VERSION, so a yes never drops what they added', async () => {
  const { k, sql, task } = await record();
  const asked = value<{ id: string }>(
    k.propose({ question: 'Mark the ladder shipped?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: task.version, patch: { tags: ['work', 'shipped'] } }] } }, OWNER),
  );
  const done = value<{ decision: string }>(k.decide(asked.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
  const later = k.get(task.id)!;
  value(k.update('tasks', task.id, { tags: ['work', 'shipped', 'urgent'] }, { ...OWNER, version: later.version }));
  const plan = value<{ hash: string }>(k.undoPlan({ decision: done.decision }));
  value(k.undoApply({ decision: done.decision }, plan.hash, 'p_owner'));

  assert.deepEqual(k.get(task.id)!.fields.tags, ['work', 'urgent'], 'the undo took off only what the decision added');
  assert.equal(bodyOf(sql, asked.id).rows[0]!.version, task.version, 'the list is not what it was before the decision');
  assert.ok(value<{ settled?: string }>(k.decide(asked.id, { decide: { option: 'accept', reason: 'yes, again' } }, 'p_owner')).settled, 'a yes wrote over the list');
  assert.deepEqual(k.get(task.id)!.fields.tags, ['work', 'urgent']);
  sql.close();
});
