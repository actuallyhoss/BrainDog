/**
 * A question an agent files tells the person, once (AGT-C19 job b).
 *
 * WHAT WAS MEASURED BEFORE THIS. The three levels and the quiet hours were built in `notify`, and nothing ever sent
 * `active`: a question an agent filed reached the person only when they opened Decide. Now a run's new question, the
 * first of its cause, is an active notice, one that cannot wait (`soon`) is time-sensitive, a question joined to an
 * open one or asked by a person sends nothing, and inside the record's quiet hours nothing sounds. It never mails, and
 * a record where no owner turned a phone on is told nothing at all: the notice is off until the record already pushes.
 *
 * OVER THE KERNEL'S OWN `propose`, read off the outbox and the `note` events it leaves, as `wire-queue-drafts.test.ts` reads an
 * urgent rule's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { PEOPLE, PROJECTS } from '../../../fixtures/names.ts';
import { openRecord, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* October in London is an hour ahead of UTC. */
const AFTERNOON = Date.UTC(2026, 9, 14, 13); // 14:00 there
const NIGHT = Date.UTC(2026, 9, 14, 21); // 22:00 there
const MORNING = Date.UTC(2026, 9, 15, 7, 5); // 08:05 there
const OWNER = PEOPLE[0]!;
const PROJECT = PROJECTS[0];
const REPO = 'lanternfish-site';

const register = (body: Record<string, unknown>): Declaration => ({ id: `register.${body.id as string}`, kind: 'register', body: body as never });

const LISTS = [
  register({
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
      { id: 'due', type: 'day', deadline: true },
    ],
  }),
  register({
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  }),
];

const run = (token: string, client: string, app: string): WriteContext => ({
  actor: 'p_1',
  principal: { kind: 'token', token },
  session: { client_id: client, client: app, host: 'h', repo: REPO } as never,
});
const CLAUDE = run('t_1', 'claude-1', 'claude-code');
const CODEX = run('t_2', 'codex-1', 'codex');

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

async function record(at: number): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(at);
  const k = await openRecord(sql, clock, { delivers: ['notify.email', 'notify.push'] });
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'Europe/London', locale: 'en-GB', owner: { id: 'p_1', email: OWNER.email, name: OWNER.name } }));
  value(await k.install(LISTS));
  for (const t of ['t_1', 't_2']) sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES (?, 'p_1', ?, 'propose', ?)", t, `h${t}`, new Date(at).toISOString());
  sql.exec("INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES ('ps_1', 'p_1', 'https://fcm.googleapis.com/fcm/send/p1', 'k', 'a', ?)", new Date(at).toISOString());
  value(k.create('things', { name: PROJECT, repos: [REPO] }, { actor: 'p_1' }));
  const tomorrow = new Date(at + 86_400_000).toISOString().slice(0, 10);
  for (const [name, due] of [['Ship', null], ['Test', null], ['Write up', tomorrow]] as const)
    value(k.create('tasks', { name, ...(due ? { due } : {}) }, { actor: 'p_1' }));
  return { k, sql, clock };
}

const done = (at: string, question = 'Mark this done?') => ({
  question,
  body_kind: 'rowset' as const,
  body: { register: 'tasks', rows: [{ at, version: 1, patch: { state: 'done' } }] },
});

const sounded = (sql: NodeSql) =>
  sql.all<{ kind: string; payload: string }>("SELECT kind, payload FROM outbox WHERE kind IN ('notify.push', 'notify.email') ORDER BY rowid").map((r) => ({ kind: r.kind, payload: JSON.parse(r.payload) as Record<string, unknown> }));
/* THE NOTICES, which are notes about nothing in particular; the note a joining agent leaves on the question is not one. */
const notes = (sql: NodeSql) =>
  sql.all<{ actor: string; field: string | null; note: string }>("SELECT actor, field, note FROM event WHERE kind = 'note' AND target IS NULL ORDER BY rowid").map((r) => ({ ...r }));

const openedBy = (sql: NodeSql, id: string) => sql.one<{ opened_by: string }>('SELECT opened_by FROM suggestion WHERE id = ?', id)!.opened_by;

test("AN AGENT'S FIRST QUESTION OF A CAUSE IS ONE ACTIVE NOTICE, naming its project, and the same cause again sends none", async () => {
  const { k, sql } = await record(AFTERNOON);
  const first = value<{ id: string; joined?: true }>(k.propose(done('tasks#1'), CLAUDE));
  assert.equal(first.joined, undefined);
  const by = openedBy(sql, first.id);
  assert.match(by, /^S\d+$/u, 'the question was not opened by a run');

  /* ONE PUSH TO THE ONE PHONE, and no mail: an active notice is a push that says how many wait, never what. AND WHERE A
     TAP OPENS, SINCE E44 OF 24 OCTOBER: the question itself in Decide, a path and never a word. */
  assert.deepEqual(sounded(sql), [{ kind: 'notify.push', payload: { sub: { id: 'ps_1' }, open: `/decide/${first.id}`, kind: 'needs' } }]);
  assert.deepEqual(notes(sql), [{ actor: `suggestion:${first.id}`, field: null, note: `${PROJECT}'s agent asks you something` }]);
  assert.doesNotMatch(notes(sql)[0]!.note, /S\d|tasks#|\//u, 'the line carries a handle');
  /* THE RUN WROTE NO NOTE, so its history says it asked and nothing more. */
  assert.deepEqual(sql.all<{ kind: string }>('SELECT kind FROM event WHERE actor = ? ORDER BY rowid', by).map((e) => e.kind), ['create', 'suggest']);

  /* THE SAME CAUSE FROM ANOTHER AGENT IS JOINED: nothing new was asked, so nothing is told, not even the note. */
  const second = value<{ id: string; joined?: true }>(k.propose(done('tasks#1', 'Close the ship task?'), CODEX));
  assert.deepEqual({ ...second }, { id: first.id, joined: true });
  assert.equal(notes(sql).length, 1, 'a joined question told the person again');
  assert.equal(sounded(sql).length, 1);
  sql.close();
});

test('A QUESTION THAT CANNOT WAIT IS TIME-SENSITIVE: one push, once for its cause, and never a mail', async () => {
  const { k, sql } = await record(AFTERNOON);
  /* "Write up" is due tomorrow, inside the two days `soon` reaches. */
  const soon = value<{ id: string }>(k.propose(done('tasks#3', 'Mark the write-up done?'), CLAUDE));
  const out = sounded(sql);
  /* ONE NOTICE ON THE CHANNEL THE OWNER CHOSE: the phone they turned on, and no mail beside it. */
  assert.deepEqual(out.map((o) => o.kind), ['notify.push']);
  assert.equal(typeof out[0]!.payload.cause, 'string');
  assert.deepEqual(notes(sql), [{ actor: `suggestion:${soon.id}`, field: 'urgent', note: `${PROJECT}'s agent asks you something` }]);

  /* AND A SECOND AGENT ASKING IT IS JOINED, so it sounds once however many ask. */
  value(k.propose(done('tasks#3', 'Is the write-up finished?'), CODEX));
  assert.equal(sounded(sql).length, 1);
  sql.close();
});

test("A PERSON'S OWN QUESTION TELLS NOBODY: they asked it", async () => {
  const { k, sql } = await record(AFTERNOON);
  value(k.propose(done('tasks#1'), { actor: 'p_1' }));
  value(k.propose(done('tasks#3', 'Mark the write-up done?'), { actor: 'p_1' }));
  assert.deepEqual(sounded(sql), []);
  assert.deepEqual(notes(sql), []);
  sql.close();
});

test("AT 22:00 IN THE RECORD'S OWN ZONE NOTHING SOUNDS: the notice is kept, and the morning's next one rings", async () => {
  const { k, sql, clock } = await record(NIGHT);
  value(k.propose(done('tasks#1'), CLAUDE));
  value(k.propose(done('tasks#3', 'Mark the write-up done?'), CLAUDE));
  assert.deepEqual(sounded(sql), [], 'a question sounded inside quiet hours');
  /* KEPT: both notes are written, and the time-sensitive one is marked so the next digest leads with it (`held`). */
  assert.deepEqual(notes(sql).map((n) => n.field), [null, 'urgent']);

  clock.set(MORNING);
  const morning = value<{ id: string }>(k.propose(done('tasks#2', 'Mark the test task done?'), CLAUDE));
  assert.deepEqual(sounded(sql), [{ kind: 'notify.push', payload: { sub: { id: 'ps_1' }, open: `/decide/${morning.id}`, kind: 'needs' } }]);
  sql.close();
});

test('A RECORD NOBODY SUBSCRIBED A PHONE ON IS TOLD NOTHING: no push, no mail, no note, and the question is filed', async () => {
  const { k, sql } = await record(AFTERNOON);
  sql.exec('DELETE FROM push_sub');
  const filed = value<{ id: string }>(k.propose(done('tasks#1'), CLAUDE));
  const soon = value<{ id: string }>(k.propose(done('tasks#3', 'Mark the write-up done?'), CLAUDE));
  for (const id of [filed.id, soon.id]) assert.ok(sql.one('SELECT 1 AS x FROM suggestion WHERE id = ?', id));
  assert.deepEqual(sounded(sql), []);
  assert.deepEqual(notes(sql), [], 'a record that never turned pushes on was told about a question');
  sql.close();
});
