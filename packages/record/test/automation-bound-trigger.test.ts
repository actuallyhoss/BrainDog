/**
 * A rule whose maker was moved down reads no more through its trigger than through its steps: the inbox an arrival came
 * from is the owner's, and a figure's value is read over the whole list, so a bound run is handed neither.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
const until = new Date(NOW + 30 * 86_400_000).toISOString();
const reg = (id: string, name: string, title: string, fields: unknown[]) => ({ id: `register.${id}`, kind: 'register' as const, body: { id, name, title, fields } as never });
const LISTS = [
  { id: 'register.things', kind: 'register' as const, body: { id: 'things', name: 'Things', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] } as never },
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'thing', type: 'ref', to: 'things', scope: {} },
    { id: 'hours', type: 'int' },
  ]),
];
const HOURS = { id: 'metric.hours', kind: 'metric' as const, body: { metric: 'hours', name: 'Hours', source: 'register.tasks', value: { sum: 'hours' }, target: { lte: 10 }, window: '30d', compare: 'none', format: 'int' } as never };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

async function yard() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG', slug: 'the-yard', name: 'The Yard', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const lists = await api.kernel.install([...LISTS, HOURS]);
  assert.ok(lists.ok, JSON.stringify(lists));
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_otto', 'otto@example.test', 'Otto', NULL)");
  assert.ok(((await api.invite({ person: 'p_otto', name: 'Otto', level: 'owner' }, owner)) as { ok: boolean }).ok);
  const kiln = api.kernel.create('things', { name: 'Kiln' }, { actor: 'p_1' });
  const mill = api.kernel.create('things', { name: 'Mill' }, { actor: 'p_1' });
  assert.ok(kiln.ok && mill.ok);
  return { sql, api, kiln: kiln.value.id, mill: mill.value.id };
}

async function demote(api: Awaited<ReturnType<typeof createRecordApi>>, sql: ReturnType<typeof openSqlite>, kiln: string) {
  sql.exec("DELETE FROM member WHERE person_id = 'p_otto'");
  const sh = (await api.share({ share: { who: { kind: 'person', id: 'p_otto' }, what: { project: kiln }, can: 'edit', when: { until } } }, owner)) as { ok: boolean };
  assert.ok(sh.ok, JSON.stringify(sh));
  api.kernel.accessChanged();
}

const runsOf = (sql: ReturnType<typeof openSqlite>, rule: string) => sql.all<{ state: string; say: string | null }>('SELECT state, say FROM automation_run WHERE rule = ?', rule);
const tasks = (sql: ReturnType<typeof openSqlite>) => sql.all<{ what: string }>("SELECT json_extract(fields, '$.what') AS what FROM entry WHERE register = 'tasks' AND deleted_at IS NULL ORDER BY rowid").map((r) => r.what);

test('AN ARRIVAL RULE HELD TO ITS MAKER\'S LENS IS NOT HANDED THE OWNER\'S INBOX', async () => {
  const { sql, api, kiln } = await yard();
  const GRAB = { id: 'rule.grab', kind: 'rule' as const, body: { rule: 'grab', on: { arrival: { channel: 'webhook' } }, steps: [{ create: { register: 'tasks', bound: 1, fields: { what: 'got {{trigger.body.msg}}', thing: kiln } } }] } as never };
  assert.ok((await api.kernel.install([GRAB], undefined, { actor: 'p_otto' })).ok);
  await demote(api, sql, kiln);
  assert.ok((api.kernel.arrive({ channel: 'webhook', body: JSON.stringify({ msg: 'OWNER-ONLY-ARRIVAL-TEXT' }), sha256: 'a1', verified: true }) as { ok: boolean }).ok);
  await api.kernel.drain();
  assert.ok(!tasks(sql).some((t) => t.includes('OWNER-ONLY')), JSON.stringify(tasks(sql)));
  assert.ok(runsOf(sql, 'grab').length > 0, 'the rule never ran, so this proves nothing');
  sql.close();
});

test('A FIGURE RULE HELD TO ITS MAKER\'S LENS SEES ITS TRIGGER\'S VALUE WITHHELD, as the figure is', async () => {
  const { sql, api, kiln, mill } = await yard();
  const WATCH = {
    id: 'rule.watch',
    kind: 'rule' as const,
    body: { rule: 'watch', on: { metric: { id: 'hours', crosses: { gte: 10 } } }, steps: [{ create: { register: 'tasks', bound: 1, fields: { what: 'figure={{metric.hours}} trigger={{trigger.value}}', thing: kiln } } }] } as never,
  };
  const put = await api.kernel.install([WATCH], undefined, { actor: 'p_otto' });
  assert.ok(put.ok, JSON.stringify(put));
  await demote(api, sql, kiln);
  api.kernel.purge();
  await api.kernel.drain();
  /* THE OWNER'S MILL WORK, which Otto's share does not reach: 47 hours. */
  assert.ok(api.kernel.create('tasks', { what: 'Mill payroll hours', thing: mill, hours: 47 }, { actor: 'p_1' }).ok);
  api.kernel.purge();
  await api.kernel.drain();
  const made = tasks(sql).filter((t) => t.startsWith('figure='));
  assert.ok(made.length > 0, `the rule never wrote: ${JSON.stringify(runsOf(sql, 'watch'))}`);
  assert.ok(made.every((t) => !t.includes('47')), JSON.stringify(made));
  sql.close();
});
