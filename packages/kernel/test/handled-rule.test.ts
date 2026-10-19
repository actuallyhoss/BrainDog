/**
 * BrainDog's own arranging happens at once, with a mark and an Undo, and only that (DIRECTION d3).
 *
 * WHAT IS HELD: a question filed by an ingest, a rule or Slash whose every write is an edit, a tag or a move on a row
 * the owner made lands as it is filed, signed `rule:handled`, and one Undo on its decision puts it back. Money, adding a
 * row, deleting, another person's row, an agent's own question, and a record that turned it off all stay open questions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { handledFault, handledOn, HANDLED_PREF, HANDLED_RULE } from '../src/govern.ts';
import type { Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
      { id: 'next_step', type: 'text' },
      { id: 'cost', type: 'money' },
    ],
  } as never,
};

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@studio.test', 'Olu Owner')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_ada', 'ada@studio.test', 'Ada')");
  for (const name of ['Ship', 'Test']) value(k.create('tasks', { name }, { actor: 'p_owner' }));
  value(k.create('tasks', { name: 'Ada task' }, { actor: 'p_ada' }));
  return { k, sql };
}

const ask = (patch: Record<string, unknown>, at = 'tasks#1') => ({
  question: 'Change the next step of Ship?',
  body_kind: 'rowset' as const,
  body: { register: 'tasks', rows: [{ at, version: 1, patch }] },
});

test('AN INGEST\'S EDIT OF THE OWNER\'S ROW LANDS AT ONCE, signed BrainDog\'s rule, and files no open question', async () => {
  const { k, sql } = await record();
  const filed = value<Filed>(k.propose(ask({ next_step: 'Send the build' }), 'ingest:mail'));
  assert.equal(filed.handled, true);
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', filed.id)?.status, 'resolved');
  assert.equal(JSON.parse(sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'tasks' AND seq = 1")!.fields).next_step, 'Send the build');
  assert.equal(sql.one<{ decided_by: string }>('SELECT decided_by FROM decision ORDER BY rowid DESC LIMIT 1')?.decided_by, HANDLED_RULE);
});

test('A MOVE TO DONE BY A RULE OR SLASH LANDS TOO, and one Undo on its decision puts the row back', async () => {
  const { k, sql } = await record();
  const filed = value<Filed>(k.propose({ ...ask({ state: 'done' }, 'tasks#2'), question: 'Mark Test done?' }, 'rule:tidy'));
  assert.equal(filed.handled, true);
  const decision = sql.one<{ id: string }>('SELECT id FROM decision ORDER BY rowid DESC LIMIT 1')!.id;
  const plan = value<{ hash: string; steps: unknown[] }>(k.undoPlan({ decision }));
  assert.equal(plan.steps.length, 1);
  value(k.undoApply({ decision }, plan.hash, 'p_owner'));
  assert.equal(JSON.parse(sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'tasks' AND seq = 2")!.fields).state, 'open');
  assert.equal(value<Filed>(k.propose(ask({ state: 'done' }, 'tasks#2'), 'slash')).handled, true);
});

test('MONEY, A NEW ROW, A DELETE AND ANOTHER PERSON\'S ROW STILL FILE A QUESTION', async () => {
  const { k, sql } = await record();
  const open = (out: Filed) => {
    assert.equal(out.handled, undefined);
    assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', out.id)?.status, 'open');
  };
  open(value<Filed>(k.propose(ask({ cost: { amount: 1200, currency: 'GBP' } }), 'ingest:mail')));
  open(value<Filed>(k.propose({ question: 'Add Plan to Tasks?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: 'Plan' }] } }, 'ingest:mail')));
  open(value<Filed>(k.propose(ask({ deleted_at: '2026-10-20T00:00:00.000Z' }), 'ingest:mail')));
  open(value<Filed>(k.propose(ask({ next_step: 'Call' }, 'tasks#3'), 'ingest:mail')));
});

test('AN AGENT\'S OWN QUESTION IS THE LADDER\'S, AND THE SETTING TURNS IT OFF', async () => {
  const { k, sql } = await record();
  const body = JSON.stringify(ask({ next_step: 'Call' }).body);
  assert.match(handledFault(sql, { body_kind: 'rowset', body, opened_by: 'S42' }) ?? '', /Only what BrainDog files itself/);
  assert.equal(handledFault(sql, { body_kind: 'rowset', body, opened_by: 'ingest:mail' }), null);
  assert.equal(handledOn(sql), true);
  sql.exec('INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, ?, ?, ?)', HANDLED_PREF.holder, HANDLED_PREF.key, 'false', '2026-10-20T00:00:00.000Z');
  assert.equal(handledOn(sql), false);
  const filed = value<Filed>(k.propose(ask({ next_step: 'Call' }), 'ingest:mail'));
  assert.equal(filed.handled, undefined);
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', filed.id)?.status, 'open');
});
