/**
 * A share made onward never reaches past the manager who made it: not through `$me`, which is read for whoever holds a
 * share, and not onto rows the owner keeps from the manager.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();
const until = at(NOW + 30 * DAY);

const reg = (id: string, name: string, title: string, fields: unknown[], more: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields, ...more } as never,
});

const DECLS = [
  reg('people', 'People', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'email', type: 'email', unique: true, index: true },
    { id: 'met', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'people' },
  ], { meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' } }),
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'assignee', type: 'ref', to: 'people' },
    { id: 'stage', type: 'enum', values: ['Doing', 'Review', 'Done'] },
  ]),
  reg('money', 'Money', 'payee', [
    { id: 'payee', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
  ]),
];

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

type R = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as R;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Api = Awaited<ReturnType<typeof createRecordApi>>;

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  for (const [id, name] of [['p_adm', 'Ada'], ['p_pri', 'Priya'], ['p_lee', 'Lee'], ['p_sam', 'Sam']] as const)
    sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', id, `${name.toLowerCase()}@example.test`, name);
  const leeRow = value<{ id: string }>(await api.create({ register: 'people', fields: { name: 'Lee', email: 'lee@example.test' } }, owner));
  const samRow = value<{ id: string }>(await api.create({ register: 'people', fields: { name: 'Sam', email: 'sam@example.test' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Lee task', assignee: leeRow.id, stage: 'Doing' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Sam task', assignee: samRow.id, stage: 'Doing' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Done secret', stage: 'Done' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Open thing', stage: 'Review' } }, owner));
  value(await api.create({ register: 'money', fields: { payee: 'Clay Co', amount: { amount: 12_000, currency: 'GBP' } } }, owner));
  value(await api.invite({ person: 'p_adm', name: 'Ada', level: 'decide' }, owner));
  /* SAM IS ON THE RECORD BY A SHARE OF HIS OWN ON MONEY, which reaches no task. */
  value(await api.share({ share: { who: { kind: 'person', id: 'p_sam' }, what: { lists: ['money'] }, can: 'view', when: { until } } }, owner));
  return { api, sql, clock };
}

const own = (api: Api, person: string): CallContext => {
  const held = api.kernel.access(person);
  assert.ok(held, `${person} holds nothing`);
  return {
    principal: { kind: 'person', id: person, level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    levels: held.levels,
    ...(held.wheres ? { wheres: held.wheres } : {}),
    ...(held.hides ? { hides: held.hides } : {}),
    ...(held.grant ? { grant: held.grant } : {}),
    credentialed: true,
    provedAt: NOW,
  } as CallContext;
};
const titles = async (api: Api, ctx: CallContext) =>
  value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'tasks' }, ctx)).rows.map((r) => r.fields.what as string).sort();

test('A SHARE OF YOUR OWN ROWS BY `$me` IS NOT SHARED ON, since it would reach the other person\'s rows instead', async () => {
  const { api } = await record();
  const parent = value<{ id: string }>(
    await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { list: 'tasks', where: { field: 'assignee', is: '$me' } }, can: 'manage', when: { until } } }, owner),
  );
  const child = (await api.shareOnward({ from: parent.id, who: 'p_sam', can: 'edit' }, own(api, 'p_lee'))) as R;
  assert.equal(child.refusal?.code, 'OUT_OF_BOUNDS', JSON.stringify(child));
});

test('WHAT THE OWNER KEEPS FROM A MANAGER IS NOT SHARED ON by them', async () => {
  const { api } = await record();
  const parent = value<{ id: string }>(await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'manage', when: { until } } }, owner));
  value(await api.share({ share: { effect: 'deny', who: { kind: 'person', id: 'p_lee' }, what: { list: 'tasks', where: { field: 'stage', is: 'Done' } }, can: 'view', when: { until } } }, owner));
  const child = (await api.shareOnward({ from: parent.id, who: 'p_sam', can: 'view' }, own(api, 'p_lee'))) as R;
  assert.equal(child.refusal?.code, 'OUT_OF_BOUNDS', JSON.stringify(child));
  assert.ok(!(await titles(api, own(api, 'p_sam')).catch((): string[] => [])).includes('Done secret'));
});

test('A PLAIN ONWARD SHARE STILL GOES THROUGH', async () => {
  const { api } = await record();
  const parent = value<{ id: string }>(await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'manage', when: { until } } }, owner));
  value(await api.shareOnward({ from: parent.id, who: 'p_sam', can: 'view' }, own(api, 'p_lee')));
});

test('A MANAGER HELD TO LESS TAKES WHAT THEY SHARED ON WITH THEM, and a share that only runs longer leaves it', async () => {
  const { api } = await record();
  const lee = { who: { kind: 'person' as const, id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'manage' as const, when: { until } };
  const parent = value<{ id: string }>(await api.share({ share: lee }, owner));
  value(await api.shareOnward({ from: parent.id, who: 'p_sam', can: 'edit' }, own(api, 'p_lee')));
  assert.ok((await titles(api, own(api, 'p_sam'))).includes('Done secret'), 'the onward share never reached the tasks, so this case proves nothing');

  /* RUNNING LONGER IS NOT LESS: the onward share stays. */
  value(await api.share({ id: parent.id, share: { ...lee, when: { until: at(NOW + 60 * DAY) } } } as never, owner));
  assert.ok((await titles(api, own(api, 'p_sam'))).includes('Done secret'), 'a share made to run longer ended what was shared on from it');

  /* HELD TO VIEWING THE TASKS IN REVIEW, the manager can hand on nothing, and what they did hand on goes. */
  value(await api.share({ id: parent.id, share: { ...lee, what: { list: 'tasks', where: { field: 'stage', is: 'Review' } }, can: 'view' } } as never, owner));
  assert.deepEqual(await titles(api, own(api, 'p_lee')), ['Open thing']);
  assert.ok(!(await titles(api, own(api, 'p_sam')).catch((): string[] => [])).includes('Done secret'), 'the onward share kept its old reach');
});
