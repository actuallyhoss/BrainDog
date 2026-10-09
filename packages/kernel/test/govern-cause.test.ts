/**
 * `propose` asks once, and its opener may take it back (AGT-C07).
 *
 * WHAT WAS MEASURED BEFORE THIS. A proposal was inserted as it came, with no look at what was open: "Needs you 7" on the
 * owner's record showed one question twice, word for word, and SG69 asked to set values its rows already held. An
 * agent could not take a question back; only the ladder withdrew one of its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { NOTHING_TO_DECIDE, listGovernance, type Filed } from '../src/govern.ts';
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
const CLAUDE = run('t_1', 'claude-1');
const CODEX = run('t_2', 'codex-1');
const CLAUDE_AGAIN = run('t_1', 'claude-2');

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
  for (const name of ['Ship', 'Test', 'Write up']) value(k.create('tasks', { name }, { actor: 'p_owner' }));
  return { k, sql };
}

const done = (...at: string[]) => ({
  question: 'Mark these done?',
  body_kind: 'rowset' as const,
  body: { register: 'tasks', rows: at.map((a) => ({ at: a, version: 1, patch: { state: 'done' } })) },
});
const open = (sql: NodeSql) => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.id);

test('TWO AGENTS PROPOSE ONE CHANGE: one question, two answers with one id, and the second files nothing', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  assert.equal(first.joined, undefined);
  const second = value<Filed>(k.propose({ ...done('tasks#1'), question: 'Close the ship task?' }, CODEX));
  assert.deepEqual({ ...second }, { id: first.id, joined: true });
  assert.deepEqual(open(sql), [first.id]);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'suggest'")?.n, 1);
  assert.match(sql.one<{ cause: string }>('SELECT cause FROM suggestion WHERE id = ?', first.id)!.cause, /^rowset#tasks#/);
});

test('A CAUSE THE FILER SETS IS THE KEY, whatever the body says, and a malformed one is refused at cause', async () => {
  const { k } = await record();
  const ask = (question: string) => ({ question, body_kind: 'options' as const, body: { options: [{ id: 'a', label: 'A', because: 'a' }, { id: 'b', label: 'B', because: 'b' }] } });
  const first = value<Filed>(k.propose({ ...ask('Which first?'), cause: 'release-order' }, CLAUDE));
  assert.deepEqual({ ...value<Filed>(k.propose({ ...ask('What order do we release in?'), cause: 'release-order' }, CODEX)) }, { id: first.id, joined: true });
  /* Without one, the words are folded and must match. */
  assert.equal(value<Filed>(k.propose(ask('Which LAST?'), CODEX)).joined, undefined);
  assert.equal(value<Filed>(k.propose(ask('which last'), CLAUDE)).joined, true);
  assert.equal(refusal(k.propose({ ...ask('Which first?'), cause: 'two words' }, CLAUDE)).at, 'cause');
});

test('A ROWSET NAMING ROWS THE OPEN ONE LACKS ADDS THEM TO IT, and one asking something different of a row stays apart', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  const wider = value<Filed>(k.propose(done('tasks#1', 'tasks#2'), CODEX));
  assert.deepEqual({ ...wider }, { id: first.id, joined: true, widened: 1 });
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', first.id)!.body) as { rows: { at: string }[] };
  assert.deepEqual(body.rows.map((r) => r.at), ['tasks#1', 'tasks#2']);
  assert.equal(sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'note'", `suggestion:${first.id}`)?.note, 'Asked the same of one more thing, and added it to this question.');
  /* The widened question is now exactly what was asked, so asking it again joins it. */
  assert.deepEqual({ ...value<Filed>(k.propose(done('tasks#2', 'tasks#1'), CLAUDE)) }, { id: first.id, joined: true });

  /* No row in common, or a row asked something else, is another question. */
  assert.equal(value<Filed>(k.propose(done('tasks#3'), CLAUDE)).joined, undefined);
  const other = { question: 'Reopen them?', body_kind: 'rowset' as const, body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { state: 'done', name: 'Shipped' } }, { at: 'tasks#2', version: 1, patch: { state: 'done' } }] } };
  assert.equal(value<Filed>(k.propose(other, CODEX)).joined, undefined);
  assert.equal(open(sql).length, 3);
});

test('A ROWSET THAT CHANGES NOTHING IS REFUSED in one sentence, and nothing is filed', async () => {
  const { k, sql } = await record();
  const out = refusal(k.propose({ question: 'Keep it open?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { state: 'open', name: 'Ship' } }] } }, CLAUDE));
  assert.deepEqual([out.code, out.fix], ['ALREADY_KNOWN', NOTHING_TO_DECIDE]);
  assert.equal(NOTHING_TO_DECIDE, 'Everything this asks for is already so. Nothing to decide.');
  assert.deepEqual(open(sql), []);
});

test('THE OPENER WITHDRAWS ITS QUESTION, or a later run of its key, and nobody else, and only while it is open', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  assert.equal(refusal(k.withdraw(CODEX, { id: first.id })).code, 'FORBIDDEN');
  assert.deepEqual({ ...value<{ id: string; state: string }>(k.withdraw(CLAUDE, { id: first.id })) }, { id: first.id, state: 'withdrawn' });
  const row = sql.one<{ status: string; resolved_as: string }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', first.id);
  assert.deepEqual({ ...row }, { status: 'resolved', resolved_as: 'withdrawn' });
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM decision')?.n, 0);
  assert.equal(refusal(k.withdraw(CLAUDE, { id: first.id })).code, 'TRANSITION_ILLEGAL');

  /* Asked again once it is withdrawn, it is a new question, and a later run of the same key may take that back too. */
  const again = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  assert.notEqual(again.id, first.id);
  assert.equal(value<{ state: string }>(k.withdraw(CLAUDE_AGAIN, { id: again.id })).state, 'withdrawn');
  /* An earlier run of the key may not take back a later run's question. */
  const later = value<Filed>(k.propose(done('tasks#2'), CLAUDE_AGAIN));
  assert.equal(refusal(k.withdraw(CLAUDE, { id: later.id })).code, 'FORBIDDEN');
  assert.equal(refusal(k.withdraw(CLAUDE, { id: 'SG999' })).code, 'OUT_OF_BOUNDS');
});

test('THE QUEUE AND THE ANSWER CARRY THE CAUSE', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose({ ...done('tasks#1'), cause: 'ship-it' }, CLAUDE));
  const listed = value<Record<string, unknown>[]>(listGovernance({ sql, nowMs: NOW }, 'suggestion'));
  assert.deepEqual(listed.map((q) => [q.id, q.cause]), [[first.id, 'ship-it']]);
  value(k.decide(first.id, { decide: { option: 'accept', reason: 'It shipped.' } }, 'p_owner'));
  const decisions = value<Record<string, unknown>[]>(listGovernance({ sql, nowMs: NOW }, 'decision'));
  assert.equal(decisions[0]?.cause, 'ship-it');
  /* Answered, the cause is free: the same ask is a new question. */
  assert.notEqual(value<Filed>(k.propose({ ...done('tasks#2'), cause: 'ship-it' }, CODEX)).id, first.id);
});
