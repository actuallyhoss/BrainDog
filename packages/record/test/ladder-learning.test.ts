/**
 * Capturing a learning needs nobody (D0.175, AGT-C14 Build 1): an agent at the lowest rung adds a learning where its
 * run is, and confirms one, with no question filed. What stays a question: a run that read text from outside the
 * record, a learning anywhere but where the run is, a move of where one applies, any other change to one, and every
 * write to any other list.
 *
 * THE LIST HERE IS CALLED `lessons`, because the ladder reads what a list declares and never its name: a day the record
 * fades rows by (`confirmed_on`), and where a row applies.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { ladder, type Caller } from '../src/ladder.ts';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Things',
    title: 'name',
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
    ],
  } as never,
};

const LESSONS = {
  id: 'register.lessons',
  kind: 'register' as const,
  body: {
    id: 'lessons',
    name: 'Lessons',
    title: 'lesson',
    state: 'state',
    fields: [
      { id: 'lesson', type: 'text', required: true },
      { id: 'because', type: 'text' },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
      { id: 'confirmed_on', type: 'day' },
      { id: 'state', type: 'enum', values: ['active', 'superseded'], default: 'active' },
    ],
  } as never,
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** An agent on a write grant, in Kiln's repository unless it says another. */
const agent = (repo = 'kiln', client = 'c1'): CallContext => ({
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: client, client: 'claude-code', host: 'mac', repo },
});

async function record() {
  const sql = openSqlite();
  const clock = { now: () => NOW };
  const api = await createRecordApi({ sql, clock: clock as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([THINGS, LESSONS, TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const kiln = value<Entry>(await api.create({ register: 'things', fields: { name: 'Kiln', repos: ['kiln'] } }, owner));
  const glaze = value<Entry>(await api.create({ register: 'things', fields: { name: 'Glaze', repos: ['glaze'] } }, owner));
  return { api, sql, kiln, glaze };
}

const lessons = (sql: NodeSql): ({ id: string } & Record<string, unknown>)[] =>
  sql
    .all<{ id: string; fields: string }>("SELECT id, fields FROM entry WHERE register = 'lessons' AND deleted_at IS NULL ORDER BY rowid")
    .map((r) => ({ ...(JSON.parse(r.fields) as Record<string, unknown>), id: r.id }));
const open = (sql: NodeSql) => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid");
const offered = (sql: NodeSql) => sql.all("SELECT 1 FROM pref WHERE person_id = 'ladder:offers'").length;

const LESSON = { lesson: 'Run the tests on Node 24', because: 'Node 26 broke the SQLite tests and a whole run was lost to it.' };

test('AT THE LOWEST RUNG AN AGENT ADDS A LEARNING WHERE ITS RUN IS, and no question is filed', async () => {
  const { api, sql, kiln } = await record();
  const made = value<Entry & { rung?: string }>(await api.create({ register: 'lessons', fields: LESSON }, agent()));
  assert.equal(made.fields.lesson, LESSON.lesson);
  assert.equal(made.fields.project, kiln.id, 'it applies where the run is');
  assert.equal(made.rung, 'tell', 'the answer says it was written, so the agent says Done and not Asked');
  assert.equal(open(sql).length, 0);
  /* NAMING THE RUN'S OWN PROJECT IS THE SAME WRITE. */
  const named = value<Entry>(await api.create({ register: 'lessons', fields: { ...LESSON, lesson: 'Name the project', project: `things#${String(kiln.seq)}` } }, agent()));
  assert.equal(named.fields.project, kiln.id);
  assert.equal(lessons(sql).length, 2);
  assert.equal(open(sql).length, 0);
  sql.close();
});

test('A RUN IN NO PROJECT ADDS ONE THAT APPLIES EVERYWHERE, which is where it is', async () => {
  const { api, sql } = await record();
  const made = value<Entry>(await api.create({ register: 'lessons', fields: LESSON }, agent('scratch')));
  assert.equal(made.fields.project, undefined);
  assert.equal(open(sql).length, 0);
  sql.close();
});

test('SETTING THE DAY IT WAS LAST CONFIRMED PASSES, on one a person made too', async () => {
  const { api, sql } = await record();
  const his = value<Entry>(await api.create({ register: 'lessons', fields: LESSON }, owner));
  const out = value<Entry>(await api.update({ register: 'lessons', seq: his.seq!, patch: { confirmed_on: '2026-10-06' } }, agent()));
  assert.equal(out.fields.confirmed_on, '2026-10-06');
  assert.equal(open(sql).length, 0);
  /* SENT BACK WHOLE WITH THE DAY MOVED IS THE SAME CHANGE: what did not change is not read as an edit. */
  value<Entry>(await api.update({ register: 'lessons', seq: his.seq!, patch: { lesson: LESSON.lesson, because: LESSON.because, confirmed_on: '2026-10-07' } }, agent()));
  assert.equal(open(sql).length, 0);
  /* A DAY FAR AHEAD WOULD KEEP IT FROM EVER FADING, and asks. */
  const ahead = value<Asked>(await api.update({ register: 'lessons', seq: his.seq!, patch: { confirmed_on: '2031-01-01' } }, agent()));
  assert.match(ahead.asked.why, /ask until 10 of them have been kept/u);
  /* AND ANY OTHER CHANGE TO ONE STILL ASKS, beside the day or alone. */
  value<Asked>(await api.update({ register: 'lessons', seq: his.seq!, patch: { lesson: 'Something else entirely', confirmed_on: '2026-10-06' } }, agent()));
  value<Asked>(await api.update({ register: 'lessons', seq: his.seq!, patch: { state: 'superseded' } }, agent()));
  assert.equal(lessons(sql)[0]?.lesson, LESSON.lesson);
  assert.equal(lessons(sql)[0]?.state, 'active');
  assert.equal(open(sql).length, 3);
  sql.close();
});

test('A RUN THAT READ TEXT FROM OUTSIDE THE RECORD STILL ASKS, because a learning is an instruction a later run follows', async () => {
  const { api, sql } = await record();
  const his = value<Entry>(await api.create({ register: 'lessons', fields: LESSON }, owner));
  value(api.kernel.create('lessons', { lesson: 'Written by Bea' }, { actor: 'p_2' }));
  value(await api.list({ register: 'lessons' }, agent()));
  const add = value<Asked>(await api.create({ register: 'lessons', fields: { ...LESSON, lesson: 'After reading her' } }, agent()));
  assert.match(add.asked.why, /This run read something another person wrote, so its changes ask for the rest of it/u);
  const confirm = value<Asked>(await api.update({ register: 'lessons', seq: his.seq!, patch: { confirmed_on: '2026-10-06' } }, agent()));
  assert.match(confirm.asked.why, /This run read/u);
  assert.equal(lessons(sql).length, 2);
  sql.close();
});

test('A LEARNING ANYWHERE BUT WHERE ITS RUN IS STILL ASKS', async () => {
  const { api, sql, kiln, glaze } = await record();
  /* A RUN IN NO PROJECT NAMING ONE: the kernel lets an agent narrow, and the ladder still asks, since it is not its run's. */
  const narrowed = value<Asked>(await api.create({ register: 'lessons', fields: { ...LESSON, project: `things#${String(kiln.seq)}` } }, agent('scratch', 'c2')));
  assert.match(narrowed.asked.why, /ask until 10 of them have been kept/u);
  assert.equal(lessons(sql).length, 0);
  /* A RUN IN KILN NAMING GLAZE, at the gate: no write. (At the door the kernel refuses it before it is asked.) */
  value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Open the run' } }, owner));
  value<Entry>(await api.create({ register: 'lessons', fields: LESSON }, agent()));
  const run = sql.one<{ seq: number }>("SELECT seq FROM entry WHERE register = 'session' ORDER BY rowid DESC LIMIT 1")!.seq;
  const trust = ladder({ sql, kernel: api.kernel, now: () => NOW });
  const caller: Caller = { token: 't_claude', scope: 'write', person: 'p_1', run: `S${String(run)}`, app: 'claude-code' };
  assert.equal(trust.gate(caller, 'lessons', 'create', { ...LESSON, project: glaze.id }, null).write, false);
  assert.equal(trust.gate(caller, 'lessons', 'create', { ...LESSON, project: `things#${String(glaze.seq)}` }, null).write, false);
  assert.equal(trust.gate(caller, 'lessons', 'create', { ...LESSON, project: null }, null).write, false, 'everywhere is wider than its run');
  assert.equal(trust.gate(caller, 'lessons', 'create', { ...LESSON, project: kiln.id }, null).write, true);
  assert.equal(trust.gate(caller, 'lessons', 'create', LESSON, null).write, true);
  /* BEFORE ITS FIRST WRITE A RUN HAS NO PLACE THE LADDER CAN READ, so only the one that names none passes. */
  const early = { ...caller, run: null };
  assert.equal(trust.gate(early, 'lessons', 'create', { ...LESSON, project: kiln.id }, null).write, false);
  assert.equal(trust.gate(early, 'lessons', 'create', LESSON, null).write, true);
  sql.close();
});

test('WIDENING WHERE A LEARNING APPLIES STAYS A PROPOSAL', async () => {
  const { api, sql, kiln, glaze } = await record();
  const made = value<Entry>(await api.create({ register: 'lessons', fields: LESSON }, agent()));
  const trust = ladder({ sql, kernel: api.kernel, now: () => NOW });
  const caller: Caller = { token: 't_claude', scope: 'write', person: 'p_1', run: 'S1', app: 'claude-code' };
  assert.equal(trust.gate(caller, 'lessons', 'update', { project: glaze.id }, made.id).write, false);
  assert.equal(trust.gate(caller, 'lessons', 'update', { project: null }, made.id).write, false);
  /* BESIDE THE DAY TOO: a confirm that also moves it is a move. */
  assert.equal(trust.gate(caller, 'lessons', 'update', { project: glaze.id, confirmed_on: '2026-10-06' }, made.id).write, false);
  /* AND AT THE DOOR NOTHING MOVES: the kernel says to propose it. */
  const out = (await api.update({ register: 'lessons', seq: made.seq!, patch: { project: `things#${String(glaze.seq)}` } }, agent())) as { ok: boolean; refusal?: { fix: string } };
  assert.equal(out.ok, false);
  assert.match(out.refusal?.fix ?? '', /Propose the move/u);
  assert.equal(lessons(sql)[0]?.project, kiln.id);
  sql.close();
});

test('A WRITE TO ANY OTHER LIST IS UNCHANGED, and a learning captured climbs nothing', async () => {
  const { api, sql } = await record();
  const asked = value<Asked>(await api.create({ register: 'tasks', fields: { name: 'Fix the retry' } }, agent()));
  assert.equal(asked.asked.question, 'Add Fix the retry to Tasks?');
  assert.match(asked.asked.why, /ask until 10 of them have been kept/u);
  assert.equal(open(sql).length, 1);
  /* ELEVEN CAPTURED OFFER NO RUNG: nothing asked, so there is nothing to stop asking about. */
  for (let i = 0; i < 11; i++) value<Entry>(await api.create({ register: 'lessons', fields: { ...LESSON, lesson: `Lesson number ${String(i)}` } }, agent()));
  assert.equal(lessons(sql).length, 11);
  assert.equal(open(sql).length, 1);
  assert.equal(offered(sql), 0);
  assert.equal(sql.all("SELECT 1 FROM ladder WHERE agent = 't_claude' AND kind LIKE 'lessons:%'").length, 0);
  /* A DELETE OF ONE IS ON THE FLOOR, as everywhere. */
  const row = lessons(sql)[0]!;
  const seq = sql.one<{ seq: number }>('SELECT seq FROM entry WHERE id = ?', row.id)!.seq;
  const gone = value<Asked>(await api.update({ register: 'lessons', seq, patch: { deleted_at: new Date(NOW).toISOString() } }, agent()));
  assert.match(gone.asked.why, /always asks/u);
  sql.close();
});

test('ONE ANOTHER PERSON MADE IS ON THE FLOOR, confirm and all', async () => {
  const { api, sql } = await record();
  const hers = value<Entry>(api.kernel.create('lessons', { lesson: 'Written by Bea' }, { actor: 'p_2' }));
  const trust = ladder({ sql, kernel: api.kernel, now: () => NOW });
  const caller: Caller = { token: 't_claude', scope: 'write', person: 'p_1', run: null, app: null };
  const out = trust.gate(caller, 'lessons', 'update', { confirmed_on: '2026-10-06' }, hers.id);
  assert.equal(out.write, false);
  assert.match(out.write ? '' : out.why, /always asks/u);
  sql.close();
});
