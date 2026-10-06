/**
 * The gate's half of the ladder of trust (DIRECTION §37): every question says what kind of change it is, a decision is
 * written in one batch so it can be undone as one, and the ladder may accept an agent's proposal of kinds it has earned.
 *
 * WHAT WAS MEASURED BEFORE THIS. A suggestion kept no kind, so "the share accepted unchanged, by kind" could not be
 * asked without reading every body again. The `decide` event carried no batch: an accepted rowset's rows wore one and
 * the decision that wrote them did not, so a row could not say who accepted it and a decision could not be put back as
 * one. And nothing but a person or the additive rule could answer a question, so an agent the owner trusted to mark
 * tasks done still asked him every time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { LADDER_RULE } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 9);

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
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};
const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }] } as never,
};

const AGENT: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client_id: 'cc-1', host: 'h', repo: 'braindog' } };

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

async function record(scope = 'write'): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS, BILLS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_1', 'p_owner', 'h', ?, '2026-10-01T00:00:00.000Z')", scope);
  value(k.create('tasks', { name: 'Ship the ladder' }, AGENT));
  return { k, sql };
}

const kindOf = (sql: NodeSql, id: string) => sql.one<{ kind: string | null }>('SELECT kind FROM suggestion WHERE id = ?', id)?.kind;
const markDone = { question: 'Mark the ladder shipped?', body_kind: 'rowset' as const, body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { state: 'done' } }] } };

test('A QUESTION IS STAMPED WITH THE KIND OF CHANGE IT IS, worked out from its body and never taken from its proposer', async () => {
  const { k, sql } = await record();
  const add = value<{ id: string }>(k.propose({ question: 'Add two tasks?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: 'a' }, { name: 'b' }], kind: 'call' } }, AGENT));
  assert.equal(kindOf(sql, add.id), 'tasks:add');
  assert.equal(kindOf(sql, value<{ id: string }>(k.propose(markDone, AGENT)).id), 'tasks:move:done');
  const call = value<{ id: string }>(k.propose({ question: 'Which first?', body_kind: 'options', body: { options: [{ id: 'a', label: 'A', because: 'a' }, { id: 'b', label: 'B', because: 'b' }] } }, 'p_owner'));
  assert.equal(kindOf(sql, call.id), 'call');
  /* SEVERAL KINDS ARE A LIST, the dearest first. */
  const mixed = value<{ id: string }>(
    k.propose({ question: 'Add one and close one?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: 'c' }, { at: 'tasks#1', version: 1, patch: { state: 'done' } }] } }, AGENT),
  );
  assert.equal(kindOf(sql, mixed.id), '["tasks:move:done","tasks:add"]');
  const rent = value<{ id: string }>(
    k.propose({ question: 'Log rent?', body_kind: 'rowset', body: { register: 'bills', rows: [{ what: 'Rent', amount: { amount: 120000, currency: 'GBP' } }] } }, AGENT),
  );
  assert.equal(kindOf(sql, rent.id), 'bills:add');
  const pack = value<{ id: string }>(k.propose({ question: 'Turn on Money?', body_kind: 'pack', body: { enable: 'money' } }, 'p_owner'));
  assert.equal(kindOf(sql, pack.id), 'addons');
});

test('A DECISION IS ONE BATCH: its rows, its decide and its resolve all wear it, so it is undone as one', async () => {
  const { k, sql } = await record();
  const asked = value<{ id: string }>(k.propose({ question: 'Add two tasks?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: 'a' }, { name: 'b' }] } }, AGENT));
  const done = value<{ decision: string; batch?: string; wrote: string[] }>(k.decide(asked.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));
  assert.ok(done.batch, 'the decision answered no batch');
  const lines = sql.all<{ kind: string; target: string }>('SELECT kind, target FROM event WHERE batch = ? ORDER BY rowid', done.batch);
  assert.deepEqual(
    lines.map((l) => l.kind),
    ['create', 'create', 'decide', 'resolve'],
  );
  assert.equal(lines[2]?.target, `decision:${done.decision}`);
  /* AND A NO IS A DECISION TOO, with a batch of its own and nothing else in it. */
  const other = value<{ id: string }>(k.propose(markDone, AGENT));
  const no = value<{ batch?: string }>(k.decide(other.id, { decide: { option: 'reject', reason: 'not yet' } }, 'p_owner'));
  assert.deepEqual(
    sql.all<{ kind: string }>('SELECT kind FROM event WHERE batch = ? ORDER BY rowid', no.batch!).map((l) => l.kind),
    ['decide', 'resolve'],
  );
});

test('THE LADDER ACCEPTS AN AGENT’S PROPOSAL OF A KIND IT HAS EARNED, signed by the ladder, the rows by its run', async () => {
  const { k, sql } = await record();
  const asked = value<{ id: string }>(k.propose(markDone, AGENT));
  /* NO RUNG YET: it asks. */
  const early = k.decide(asked.id, { rule: 'ladder' }, 'p_owner');
  assert.equal(early.ok, false);
  assert.match(fixOf(early as never), /tasks:move:done, which still asks/);

  sql.exec("INSERT INTO ladder (agent, kind, rung, since) VALUES ('t_1', 'tasks:move:done', 'tell', ?)", new Date(NOW).toISOString());
  const done = value<{ decision: string; batch?: string }>(k.decide(asked.id, { rule: 'ladder' }, 'p_owner'));
  assert.equal(sql.one<{ by: string }>('SELECT decided_by AS by FROM decision WHERE id = ?', done.decision)?.by, LADDER_RULE);
  assert.equal(k.get('tasks#1')?.fields.state, 'done');
  /* THE MOVE IS THE AGENT'S, so its byline and Undo this run find it. */
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'state' AND batch = ?", done.batch!)?.actor, 'S1');
});

test('THE LADDER NEVER LIFTS THE FLOOR, a dropped rung, a grant that may only suggest, or a choice', async () => {
  const { k, sql } = await record();
  const at = new Date(NOW).toISOString();
  sql.exec("INSERT INTO ladder (agent, kind, rung, since) VALUES ('t_1', 'bills:add', 'quiet', ?)", at);
  const rent = value<{ id: string }>(k.propose({ question: 'Log rent?', body_kind: 'rowset', body: { register: 'bills', rows: [{ what: 'Rent', amount: { amount: 120000, currency: 'GBP' } }] } }, AGENT));
  assert.match(fixOf(k.decide(rent.id, { rule: 'ladder' }, 'p_owner') as never), /bills:add, which always asks \(money\)/);
  /* WITH NO AMOUNT IT IS NOT MONEY, and the rung carries it. */
  const note = value<{ id: string }>(k.propose({ question: 'Log a bill to price later?', body_kind: 'rowset', body: { register: 'bills', rows: [{ what: 'Rent' }] } }, AGENT));
  value(k.decide(note.id, { rule: 'ladder' }, 'p_owner'));

  sql.exec("INSERT INTO ladder (agent, kind, rung, since, dropped_at) VALUES ('t_1', 'tasks:move:done', 'tell', ?, ?)", at, at);
  const dropped = value<{ id: string }>(k.propose(markDone, AGENT));
  assert.equal(k.decide(dropped.id, { rule: 'ladder' }, 'p_owner').ok, false, 'a dropped rung still answered');

  sql.exec("UPDATE ladder SET dropped_at = NULL WHERE kind = 'tasks:move:done'");
  sql.exec("UPDATE token SET scope = 'propose' WHERE id = 't_1'");
  assert.match(fixOf(k.decide(dropped.id, { rule: 'ladder' }, 'p_owner') as never), /may only suggest/);
  sql.exec("UPDATE token SET scope = 'write' WHERE id = 't_1'");

  const choice = value<{ id: string }>(k.propose({ question: 'Which first?', body_kind: 'options', body: { options: [{ id: 'a', label: 'A', because: 'a' }, { id: 'b', label: 'B', because: 'b' }] } }, AGENT));
  assert.match(fixOf(k.decide(choice.id, { rule: 'ladder' }, 'p_owner') as never), /never answered by the ladder/);
  /* A PERSON'S OWN QUESTION IS NOBODY'S TO CLIMB. */
  const own = value<{ id: string }>(k.propose(markDone, 'p_owner'));
  assert.match(fixOf(k.decide(own.id, { rule: 'ladder' }, 'p_owner') as never), /Only an agent/);
  /* AND THE QUESTIONS REFUSED ARE STILL OPEN, with nothing decided. */
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', rent.id)?.status, 'open');
  assert.equal(k.get('tasks#1')?.fields.state, 'open');
  value(k.decide(dropped.id, { rule: 'ladder' }, 'p_owner'));
  assert.equal(k.get('tasks#1')?.fields.state, 'done');
});

test('THE LADDER ASKS AGAIN ONCE THE GRANT HAS RUN OUT, and holds a move only a decision makes', async () => {
  const { k, sql } = await record();
  const at = new Date(NOW).toISOString();
  sql.exec("INSERT INTO ladder (agent, kind, rung, since) VALUES ('t_1', 'tasks:move:done', 'tell', ?)", at);
  const asked = value<{ id: string }>(k.propose(markDone, AGENT));
  sql.exec("UPDATE token SET expires_at = '2026-10-05T00:00:00.000Z' WHERE id = 't_1'");
  assert.match(fixOf(k.decide(asked.id, { rule: 'ladder' }, 'p_owner') as never), /grant it was filed under has ended/);
  sql.exec('UPDATE token SET expires_at = NULL WHERE id = \'t_1\'');

  /* A WAY INTO A STATE DECLARED `by: 'decide'` IS A PERSON'S, whatever rung the move stands on. */
  value(
    await k.install([
      {
        ...TASKS,
        body: {
          ...(TASKS.body as object),
          fields: [
            { id: 'name', type: 'text', required: true },
            { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open', transitions: { open: { to: ['done'], by: 'decide' }, done: { to: ['open'] } } },
          ],
        } as never,
      },
    ]),
  );
  assert.match(fixOf(k.decide(asked.id, { rule: 'ladder' }, 'p_owner') as never), /state changes only when a person accepts it/);
  assert.equal(k.get('tasks#1')?.fields.state, 'open');
});

test('SLASH CLIMBS TOO, and the rows of a question it filed are signed by the ladder, never by a model', async () => {
  const { k, sql } = await record();
  sql.exec("INSERT INTO ladder (agent, kind, rung, since) VALUES ('slash', 'tasks:move:done', 'tell', ?)", new Date(NOW).toISOString());
  const asked = value<{ id: string }>(k.propose(markDone, 'slash'));
  const done = value<{ batch?: string }>(k.decide(asked.id, { rule: 'ladder' }, 'p_owner'));
  assert.equal(k.get('tasks#1')?.fields.state, 'done');
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'state' AND batch = ?", done.batch!)?.actor, LADDER_RULE);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE actor = 'slash' AND kind NOT IN ('suggest','propose','predict')")?.n, 0);
});
