/**
 * A join is written down, and a shared question is not taken back by one of its askers (audit-36-37 #4, #5).
 *
 * WHAT WAS MEASURED BEFORE THIS. Agent B asking what agent A had asked was answered `joined` and nothing was written,
 * so A's `withdraw` closed the one question and B's ask was gone with it. And an options question's cause was its words
 * and option ids alone, so "Approve this?" about two different things was one question, and the second never filed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { type Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);

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
    ],
  } as never,
};

const run = (token: string, client: string): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token }, session: { client_id: client, host: 'h', repo: 'braindog' } });
const A = run('t_1', 'claude-1');
const B = run('t_2', 'codex-1');
const A_AGAIN = run('t_1', 'claude-2');

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};
const refusal = (out: { ok: boolean }) => {
  assert.equal(out.ok, false);
  return (out as unknown as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  for (const t of ['t_1', 't_2']) sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES (?, 'p_owner', ?, 'propose', '2026-10-01T00:00:00.000Z')", t, `h${t}`);
  for (const name of ['Ship', 'Test']) value(k.create('tasks', { name }, { actor: 'p_owner' }));
  return { k, sql };
}

const approve = (more: Record<string, unknown> = {}) => ({
  question: 'Approve this?',
  body_kind: 'options' as const,
  body: { options: [{ id: 'yes', label: 'Yes', because: 'It is ready.' }, { id: 'no', label: 'No', because: 'It is not.' }], ...more },
});
const done = (...at: string[]) => ({
  question: 'Mark these done?',
  body_kind: 'rowset' as const,
  body: { register: 'tasks', rows: at.map((a) => ({ at: a, version: 1, patch: { state: 'done' } })) },
});
const open = (sql: NodeSql) => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.id);
const notes = (sql: NodeSql, id: string) =>
  sql.all<{ actor: string; to_v: string; note: string }>("SELECT actor, to_v, note FROM event WHERE kind = 'note' AND target = ? ORDER BY rowid", `suggestion:${id}`);
const SHARED = 'Another agent asked the same thing, so it stays open for the owner.';

test('B JOINS A’S QUESTION: the join is one note by B, and A’s withdraw is refused, so the question stays open', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(approve(), A));
  assert.deepEqual({ ...value<Filed>(k.propose(approve(), B)) }, { id: first.id, joined: true });
  /* Asked twice by B, written once; the note is plain words and names no id. */
  value<Filed>(k.propose(approve(), B));
  const joined = notes(sql, first.id);
  assert.equal(joined.length, 1);
  assert.equal(joined[0]!.to_v, 'joined');
  assert.notEqual(joined[0]!.actor, sql.one<{ opened_by: string }>('SELECT opened_by FROM suggestion WHERE id = ?', first.id)!.opened_by);
  assert.doesNotMatch(joined[0]!.note, /\brows?\b|SG\d|—/);

  const out = refusal(k.withdraw(A, { id: first.id }));
  assert.deepEqual([out.code, out.fix], ['FORBIDDEN', SHARED]);
  assert.deepEqual(open(sql), [first.id]);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'resolve'")?.n, 0);
  /* A later run of A's key is still A, and is refused for the same reason. */
  assert.equal(refusal(k.withdraw(A_AGAIN, { id: first.id })).fix, SHARED);
});

test('WITH NO JOIN, A WITHDRAWS AS BEFORE, and A asking again or a later run of A joining is not another agent', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(approve(), A));
  assert.equal(value<Filed>(k.propose(approve(), A)).joined, true);
  assert.equal(value<Filed>(k.propose(approve(), A_AGAIN)).joined, true);
  assert.deepEqual(notes(sql, first.id), []);
  assert.equal(value<{ state: string }>(k.withdraw(A, { id: first.id })).state, 'withdrawn');
  assert.deepEqual(open(sql), []);
});

test('A WIDENING IS A JOIN TOO: B adding rows to A’s question keeps it open', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), A));
  assert.equal(value<Filed>(k.propose(done('tasks#1', 'tasks#2'), B)).widened, 1);
  const widened = notes(sql, first.id);
  assert.equal(widened.length, 1);
  assert.equal(widened[0]!.note, 'Asked the same of one more thing, and added it to this question.');
  assert.equal(refusal(k.withdraw(A, { id: first.id })).fix, SHARED);
  assert.deepEqual(open(sql), [first.id]);
});

test('ONE OPTIONS QUESTION ABOUT TWO THINGS, OR TO TWO MEMBERS, IS TWO QUESTIONS, and about the same thing is one', async () => {
  const { k, sql } = await record();
  const two = value<Filed>(k.propose(approve({ about: 'tasks#1' }), A));
  assert.equal(value<Filed>(k.propose(approve({ about: 'tasks#2' }), B)).joined, undefined);
  assert.equal(value<Filed>(k.propose(approve({ to: 'p_wren' }), A)).joined, undefined);
  assert.equal(value<Filed>(k.propose(approve({ to: 'p_sami' }), B)).joined, undefined);
  assert.equal(open(sql).length, 4);
  assert.deepEqual({ ...value<Filed>(k.propose(approve({ about: 'tasks#1' }), B)) }, { id: two.id, joined: true });
  assert.equal(open(sql).length, 4);
});
