/**
 * A question the person answered is answered from memory when it is asked again (AGT-C08 job 1).
 *
 * WHAT WAS MEASURED BEFORE THIS. A decline closed the question and kept no key to find it by: an agent that proposed again
 * what the owner had said no to the day before filed a new question, and Decide's count went up for an ask he had
 * already answered. Now the newest answer to the same cause is the reply, with the day and his reason, and nothing is
 * filed unless the agent says what changed in `again`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { recheck } from '../src/cause.ts';
import { rememberedLine, type Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 9);
const AT = new Date(NOW).toISOString();

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

const done = (at: string) => ({ question: 'Mark this done?', body_kind: 'rowset' as const, body: { register: 'tasks', rows: [{ at, version: 1, patch: { state: 'done' } }] } });
const asked = (sql: NodeSql) => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'suggest'")!.n;
const open = (sql: NodeSql) => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.id);

test('DECLINED, THEN PROPOSED AGAIN: answered with the day and the reason, and nothing is filed', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  value(k.decide(first.id, { resolved_as: 'wont-fix', reason: 'Not until the release is out.' }, 'p_owner'));

  /* Another agent, the same ask: the cause is the same, so the answer is his. */
  const again = value<Filed>(k.propose(done('tasks#1'), CODEX));
  assert.deepEqual(again, { id: first.id, answered: { said: 'No', reason: 'Not until the release is out.', at: AT } });
  assert.equal(asked(sql), 1);
  assert.deepEqual(open(sql), []);

  const line = rememberedLine(again.answered!);
  assert.equal(line, 'This was declined on 8 October 2026. The reason: Not until the release is out. Nothing was filed. If something has changed, propose it again and say what in again.');
  assert.doesNotMatch(line, /SG\d|—/u);
});

test('WITH `again` IT IS FILED, and the sentence of what changed is kept under the new question', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  value(k.decide(first.id, { resolved_as: 'incorrect', reason: 'It is not shipped.' }, 'p_owner'));

  const back = value<Filed>(k.propose({ ...done('tasks#1'), again: 'The release went out this morning.' }, CLAUDE));
  assert.notEqual(back.id, first.id);
  assert.equal(back.answered, undefined);
  assert.deepEqual(open(sql), [back.id]);
  const note = sql.one<{ to_v: string; note: string }>("SELECT to_v, note FROM event WHERE kind = 'note' AND target = ?", `suggestion:${back.id}`);
  assert.deepEqual({ ...note }, { to_v: 'again', note: 'The release went out this morning.' });
  /* And the question is still its question, not the note. */
  assert.equal(k.question(back.id), 'Mark this done?');

  /* Asked a third time while that one is open, it is joined, never answered from the older no. */
  assert.deepEqual({ ...value<Filed>(k.propose(done('tasks#1'), CODEX)) }, { id: back.id, joined: true });
});

test('A NO PRESSED AS reject IS REMEMBERED TOO, with the reason on its decision', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#2'), CLAUDE));
  value(k.decide(first.id, { decide: { option: 'reject', reason: 'Testing is ongoing.' } }, 'p_owner'));
  const again = value<Filed>(k.propose(done('tasks#2'), CLAUDE));
  assert.deepEqual(again.answered, { said: 'No', reason: 'Testing is ongoing.', at: AT });
  assert.equal(asked(sql), 1);
});

test('A NO WITH NO REASON says none was given, and never quotes words the record wrote', async () => {
  const { k } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  value(k.decide(first.id, { resolved_as: 'wont-fix' }, 'p_owner'));
  const again = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  assert.equal(again.answered?.reason, 'No reason was given.');
  assert.match(rememberedLine(again.answered!), /declined on 8 October 2026\. No reason was given\. Nothing was filed/u);
});

test('AN OPTIONS QUESTION IS ANSWERED WITH THE OPTION HE PICKED', async () => {
  const { k, sql } = await record();
  const ask = {
    question: 'Which do we ship first?',
    body_kind: 'options' as const,
    body: { options: [{ id: 'web', label: 'The web app', because: 'Most people use it.' }, { id: 'cli', label: 'The command line', because: 'Agents use it.' }] },
  };
  const first = value<Filed>(k.propose(ask, CLAUDE));
  value(k.decide(first.id, { decide: { option: 'cli', reason: 'Agents come first this month.' } }, 'p_owner'));
  const again = value<Filed>(k.propose(ask, CODEX));
  assert.deepEqual(again.answered, { said: 'The command line', reason: 'Agents come first this month.', at: AT });
  assert.match(rememberedLine(again.answered!), /^This was answered "The command line" on 8 October 2026\. The reason: Agents come first this month\./u);
  assert.equal(asked(sql), 1);
});

test('AN ACCEPT IS NO MEMORY: rows moved back by hand are asked again', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  value(k.decide(first.id, { decide: { option: 'accept', reason: 'It shipped.' } }, 'p_owner'));
  value(k.update('tasks', 'tasks#1', { state: 'open' }, { actor: 'p_owner' }));
  const again = value<Filed>(k.propose({ ...done('tasks#1'), body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 3, patch: { state: 'done' } }] } }, CLAUDE));
  assert.equal(again.answered, undefined);
  assert.notEqual(again.id, first.id);
  assert.equal(asked(sql), 2);
});

test('A QUESTION TAKEN BACK IS NOT AN ANSWER, and `again` on a cause nobody answered writes no note', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  value(k.withdraw(CLAUDE, { id: first.id }));
  const again = value<Filed>(k.propose({ ...done('tasks#1'), again: 'Asking once more.' }, CLAUDE));
  assert.equal(again.answered, undefined);
  assert.notEqual(again.id, first.id);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'note' AND to_v = 'again'")!.n, 0);
});

test('`again` IS ONE SENTENCE: blank or too long is refused at again, and nothing is filed', async () => {
  const { k, sql } = await record();
  assert.equal(refusal(k.propose({ ...done('tasks#1'), again: '  ' }, CLAUDE)).at, 'again');
  assert.equal(refusal(k.propose({ ...done('tasks#1'), again: 'x'.repeat(281) }, CLAUDE)).at, 'again');
  assert.equal(asked(sql), 0);
});

test('AN ANSWER SET ASIDE STAYS ASIDE: the newest question with the cause decides, and one closed as moot leaves no memory', async () => {
  const { k, sql } = await record();
  const first = value<Filed>(k.propose(done('tasks#1'), CLAUDE));
  value(k.decide(first.id, { resolved_as: 'wont-fix', reason: 'Not until the release is out.' }, 'p_owner'));
  const back = value<Filed>(k.propose({ ...done('tasks#1'), again: 'The release went out.' }, CLAUDE));
  /* He then marks it done himself, so the question asked again is moot, and later opens it once more. */
  value(k.update('tasks', 'tasks#1', { state: 'done' }, { actor: 'p_owner' }));
  assert.deepEqual(recheck(sql, NOW).closed, [back.id]);
  value(k.update('tasks', 'tasks#1', { state: 'open' }, { actor: 'p_owner' }));
  const third = value<Filed>(k.propose({ ...done('tasks#1'), body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 3, patch: { state: 'done' } }] } }, CLAUDE));
  assert.equal(third.answered, undefined, 'the no he set aside came back');
  assert.notEqual(third.id, back.id);
});

test('THE SAME CAUSE ASKING SOMETHING ELSE IS ASKED: memory holds only for what the answered question reached', async () => {
  const { k, sql } = await record();
  const ask = (at: string) => ({ ...done(at), cause: 'tasks.finish' });
  const first = value<Filed>(k.propose(ask('tasks#1'), CLAUDE));
  value(k.decide(first.id, { resolved_as: 'wont-fix', reason: 'Not yet.' }, 'p_owner'));
  /* The same entry is remembered; another entry under the same cause is a new ask. */
  assert.equal(value<Filed>(k.propose(ask('tasks#1'), CLAUDE)).answered?.said, 'No');
  const other = value<Filed>(k.propose(ask('tasks#2'), CLAUDE));
  assert.equal(other.answered, undefined);
  assert.deepEqual(open(sql), [other.id]);
});
