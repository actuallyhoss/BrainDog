/**
 * The ladder of trust at the record's door (DIRECTION §37, "staff who earn trust"): an agent's write at Ask, on the
 * floor, or from a run that read text from outside the record is filed as a question instead; a write its rung lets
 * through is written; ten kept in fourteen days offer the next rung; an undo, three declines, a burst or a new app takes
 * it back to Ask.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
      { id: 'cost', type: 'money' },
    ],
  } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** An agent on a write grant the record holds, in one app, as a host hands it over. */
const agent = (app = 'claude-code', client = 'c1'): CallContext => ({
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: client, client: app, host: 'mac', repo: 'braindog' },
});

async function record(at = NOW) {
  const sql = openSqlite();
  const clock = { now: () => at };
  const api = await createRecordApi({ sql, clock: clock as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS, PEOPLE]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  return { api, sql, clock };
}

const rung = (sql: NodeSql, kind: string): string | null =>
  sql.one<{ rung: string; dropped_at: string | null }>('SELECT rung, dropped_at FROM ladder WHERE agent = ? AND kind = ?', 't_claude', kind)?.rung ?? null;
const climb = (sql: NodeSql, kind: string, to = 'tell') =>
  sql.exec("INSERT OR REPLACE INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('t_claude', ?, ?, 0, '2026-10-01T00:00:00.000Z')", kind, to);
const tasks = (sql: NodeSql) => sql.all<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'tasks' AND deleted_at IS NULL")[0]?.n ?? 0;
const open = (sql: NodeSql) => sql.all<{ id: string; opened_by: string; body_kind: string }>("SELECT id, opened_by, body_kind FROM suggestion WHERE status = 'open' ORDER BY rowid");

test('AT ASK AN AGENT\'S WRITE IS FILED AS A QUESTION, said in one line, and nothing is written', async () => {
  const { api, sql } = await record();
  const out = value<Asked>(await api.create({ register: 'tasks', fields: { name: 'Fix the retry' } }, agent()));
  assert.equal(out.asked.question, 'Add Fix the retry to Tasks?');
  assert.match(out.asked.why, /ask until 10 of them have been kept/u);
  assert.equal(tasks(sql), 0);
  assert.equal(open(sql).length, 1);
  /* A PERSON IS NEVER ON THE LADDER. */
  value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Mine' } }, owner));
  assert.equal(tasks(sql), 1);
  sql.close();
});

test('A WRITE THAT WOULD NOT LAND IS REFUSED WITH ITS FIX, never filed as a question that fails when accepted', async () => {
  const { api, sql } = await record();
  const refusal = (r: unknown) => (r as { ok: boolean; refusal?: { code: string; at?: string } }).refusal;
  assert.equal(refusal(await api.create({ register: 'tasks', fields: { state: 'open' } }, agent()))?.at, 'name');
  assert.equal(refusal(await api.create({ register: 'tasks', fields: { name: 'x', nope: 1 } } as never, agent()))?.code, 'FIELD_UNKNOWN');
  const mine = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Mine' } }, owner));
  assert.equal(refusal(await api.update({ register: 'tasks', seq: mine.seq!, patch: { state: 'nah' } }, agent()))?.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(open(sql).length, 0, 'nothing was filed');
  /* AND THE TRY KEEPS NOTHING: no run opened, no row. */
  assert.equal(tasks(sql), 1);
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'session'").length, 0);
  sql.close();
});

test('A RUNG LETS ITS KIND THROUGH AND NO OTHER, and the floor always asks', async () => {
  const { api, sql } = await record();
  climb(sql, 'tasks:add');
  const made = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Ship' } }, agent()));
  assert.equal(made.fields.name, 'Ship');
  assert.equal((made as Entry & { rung?: string }).rung, 'tell', 'the answer says the rung it was written at');
  /* MARKING IT DONE IS ANOTHER KIND, still at Ask. */
  const moved = value<Asked>(await api.update({ register: 'tasks', seq: made.seq!, patch: { state: 'done' } }, agent()));
  assert.equal(moved.asked.question, 'Mark Ship done?');
  climb(sql, 'tasks:move:done');
  assert.equal(value<Entry>(await api.update({ register: 'tasks', seq: made.seq!, patch: { state: 'done' } }, agent())).fields.state, 'done');
  /* MONEY AND A DELETE ARE ON THE FLOOR, whatever the rung. */
  const paid = value<Asked>(await api.create({ register: 'tasks', fields: { name: 'Pay', cost: { amount: 500, currency: 'GBP' } } }, agent()));
  assert.match(paid.asked.why, /amount of money, which always asks/u);
  const gone = value<Asked>(await api.update({ register: 'tasks', seq: made.seq!, patch: { deleted_at: new Date(NOW).toISOString() } }, agent()));
  assert.equal(gone.asked.question, 'Delete Ship from Tasks?');
  assert.equal(tasks(sql), 1);
  sql.close();
});

test('A PROPOSAL ITS RUNG LETS THROUGH IS ACCEPTED BY THE LADDER, with the decision Undo takes back', async () => {
  const { api, sql } = await record();
  climb(sql, 'tasks:add');
  const filed = value<{ id: string; landed?: boolean; decision?: string; undo?: { decision: string }; rung?: string }>(
    await api.propose({ question: 'Add Ship?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: 'Ship' }] } }, agent()),
  );
  assert.equal(filed.landed, true);
  assert.equal(filed.rung, 'tell', 'the answer says the rung it landed at, so the agent says Done and not Asked');
  assert.equal(tasks(sql), 1);
  assert.equal(sql.one<{ decided_by: string }>('SELECT decided_by FROM decision')?.decided_by, 'rule:ladder');
  /* AND UNDO PUTS IT BACK, AND TAKES THE KIND BACK TO ASK. */
  const plan = value<{ hash: string; say: string }>(await api.undo({ decision: filed.undo!.decision, dry: true }, owner));
  const done = value<{ put: number; undone?: unknown }>(await api.undo({ decision: filed.undo!.decision, hash: plan.hash }, owner));
  assert.equal(done.put, 1);
  assert.equal(done.undone, undefined, 'which agent it was stays in the record');
  assert.equal(tasks(sql), 0);
  assert.equal(rung(sql, 'tasks:add'), 'ask');
  sql.close();
});

test('TEN KEPT AS THEY WERE OFFER THE NEXT RUNG ONCE, and yes sets it', async () => {
  const { api, sql } = await record();
  for (let i = 0; i < 10; i += 1) {
    const asked = value<Asked>(await api.create({ register: 'tasks', fields: { name: `Task ${i}` } }, agent()));
    const id = open(sql).find((q) => q.body_kind === 'rowset')!.id;
    assert.ok(asked.asked.id);
    value(await api.decide({ id, decide: { option: 'accept', reason: 'fine' } }, owner));
  }
  const offers = open(sql).filter((q) => q.opened_by === 'rule:ladder');
  assert.equal(offers.length, 1, 'one offer, once');
  const offer = value<{ question: string; body: { options: { id: string; label: string }[] } }>(await api.governance({ register: 'suggestion', id: offers[0]!.id }, owner));
  assert.equal(offer.question, 'Claude Code has made 10 changes like this and you kept them all. Let it add tasks without asking?');
  assert.doesNotMatch(JSON.stringify(offer), /t_claude/u, 'no grant id in what a person reads');
  value(await api.decide({ id: offers[0]!.id, decide: { option: 'yes', reason: '' } }, owner));
  assert.equal(rung(sql, 'tasks:add'), 'tell');
  value<Entry>(await api.create({ register: 'tasks', fields: { name: 'On its own' } }, agent()));
  assert.equal(tasks(sql), 11);
  sql.close();
});

test('THREE DECLINES IN A ROW, A NEW APP, OR A BURST TAKE IT BACK TO ASK', async () => {
  {
    const { api, sql } = await record();
    climb(sql, 'tasks:add');
    for (let i = 0; i < 3; i += 1) {
      const filed = value<{ id: string }>(await api.propose({ question: `Add ${i}?`, body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: `T${i}`, cost: { amount: 1, currency: 'GBP' } }] } }, agent()));
      value(await api.decide({ id: filed.id, resolved_as: 'wont-fix', reason: 'no' }, owner));
    }
    assert.equal(rung(sql, 'tasks:add'), 'ask');
    sql.close();
  }
  {
    const { api, sql } = await record();
    climb(sql, 'tasks:add');
    value<Entry>(await api.create({ register: 'tasks', fields: { name: 'From Claude Code' } }, agent('claude-code', 'c1')));
    const moved = value<Asked>(await api.create({ register: 'tasks', fields: { name: 'From elsewhere' } }, agent('cursor', 'c2')));
    assert.ok(moved.asked);
    assert.equal(rung(sql, 'tasks:add'), 'ask');
    sql.close();
  }
  {
    const { api, sql } = await record();
    climb(sql, 'tasks:add');
    for (let i = 0; i < 41; i += 1) value<Entry>(await api.create({ register: 'tasks', fields: { name: `Burst ${i}` } }, agent()));
    assert.ok(value<Asked>(await api.create({ register: 'tasks', fields: { name: 'One too many' } }, agent())).asked);
    assert.equal(rung(sql, 'tasks:add'), 'ask');
    sql.close();
  }
});

test('A RUN THAT READ WHAT ANOTHER PERSON WROTE ASKS FOR THE REST OF IT, and meets people as untrusted', async () => {
  const { api, sql } = await record();
  climb(sql, 'tasks:add');
  climb(sql, 'people:add');
  value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Before' } }, agent()));
  /* A ROW ANOTHER PERSON MADE IS TEXT THAT IS NOT THE OWNER'S, so reading it marks the run. */
  value(api.kernel.create('tasks', { name: 'Written by Bea' }, { actor: 'p_2' }));
  value(await api.list({ register: 'tasks' }, agent()));
  const after = value<Asked>(await api.create({ register: 'tasks', fields: { name: 'After' } }, agent()));
  assert.match(after.asked.why, /This run read something another person wrote, so its changes ask for the rest of it/u);
  /* AND `meet` FOLLOWS THE SAME RULE: who it meets is said to have arrived in what it read, and is evidence of nothing. */
  value(await api.meet({ name: 'Mallory', email: 'mallory@example.com', source: 'a note' }, agent()));
  const met = sql.one<{ met: string }>("SELECT json_extract(fields, '$.met') AS met FROM entry WHERE register = 'people'")?.met ?? '';
  assert.match(met, /arrived in a note/u);
  sql.close();
});

test('UNDO IS AN OWNER\'S IN A BROWSER, a look and then a press', async () => {
  const { api, sql } = await record();
  climb(sql, 'tasks:add');
  value<Entry>(await api.create({ register: 'tasks', fields: { name: 'One' } }, agent()));
  value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Two' } }, agent()));
  const refused = (await api.undoRun({ run: 'S1', dry: true }, agent())) as { ok: boolean; refusal?: { code: string } };
  assert.equal(refused.ok, false);
  const missing = (await api.undoRun({ run: 'S1' }, owner)) as { ok: boolean; refusal?: { at?: string } };
  assert.equal(missing.refusal?.at, 'hash');
  const plan = value<{ hash: string; steps: unknown[] }>(await api.undoRun({ run: 'S1', dry: true }, owner));
  assert.equal(plan.steps.length, 2);
  value(await api.undoRun({ run: 'S1', hash: plan.hash }, owner));
  assert.equal(tasks(sql), 0);
  assert.equal(rung(sql, 'tasks:add'), 'ask');
  sql.close();
});
