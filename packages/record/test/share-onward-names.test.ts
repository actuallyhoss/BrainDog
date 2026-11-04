/**
 * A person who manages one list and shares it on is told nothing of the rest of the record by what she names: not the
 * name of a People row she does not read, and not whether a project she cannot see exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const until = new Date(NOW + 30 * 86_400_000).toISOString();

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
    { id: 'stage', type: 'enum', values: ['Doing', 'Done'] },
  ]),
  reg('things', 'Things', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'repos', type: 'list', of: 'text' },
  ], { scopes: { repos: 'repos' } }),
];

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

type R = { ok: boolean; value?: { id: string; seq: number }; refusal?: { code: string; fix: string; at?: string } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  for (const [id, name] of [['p_lee', 'Lee'], ['p_sam', 'Sam']] as const)
    sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', id, `${name.toLowerCase()}@example.test`, name);
  const parent = (await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'manage', when: { until } } }, owner)) as R;
  assert.ok(parent.ok, JSON.stringify(parent));
  const sam = (await api.share({ share: { who: { kind: 'person', id: 'p_sam' }, what: { lists: ['tasks'] }, can: 'view', when: { until } } }, owner)) as R;
  assert.ok(sam.ok, JSON.stringify(sam));
  const held = api.kernel.access('p_lee')!;
  const lee = { principal: { kind: 'person', id: 'p_lee', level: held.level }, ...(held.registers === null ? {} : { registers: held.registers }), levels: held.levels, credentialed: true, provedAt: NOW } as CallContext;
  return { api, lee, from: parent.value!.id };
}

test('A PEOPLE ROW SHE DOES NOT READ IS NOT NAMED TO A MANAGER OF ANOTHER LIST', async () => {
  const { api, lee, from } = await record();
  const row = (await api.create({ register: 'people', fields: { name: 'Hidden Person' } }, owner)) as R;
  assert.ok(row.ok);
  assert.equal(((await api.list({ register: 'people' }, lee)) as R).refusal?.code, 'FORBIDDEN', 'she reads no People');
  const byHandle = (await api.shareOnward({ from, who: `people#${String(row.value!.seq)}`, can: 'view' }, lee)) as R;
  const byId = (await api.shareOnward({ from, who: row.value!.id, can: 'view' }, lee)) as R;
  const nobody = (await api.shareOnward({ from, who: 'people#99', can: 'view' }, lee)) as R;
  assert.ok(!JSON.stringify(byHandle).includes('Hidden Person'), JSON.stringify(byHandle));
  assert.ok(!JSON.stringify(byId).includes('Hidden Person'), JSON.stringify(byId));
  assert.deepEqual(byHandle.refusal, nobody.refusal, 'a row out of her sight reads as a row that is not there');
});

test('A PROJECT SHE CANNOT SEE ANSWERS AS ONE THAT IS NOT THERE', async () => {
  const { api, lee, from } = await record();
  assert.ok(((await api.create({ register: 'things', fields: { name: 'Hidden Project' } }, owner)) as R).ok);
  const said = (r: R, name: string) => ({ ...r.refusal, fix: r.refusal?.fix.replace(name, 'X') });
  const there = (await api.shareOnward({ from, who: 'p_sam', can: 'view', what: { project: 'Hidden Project' } }, lee)) as R;
  const notThere = (await api.shareOnward({ from, who: 'p_sam', can: 'view', what: { project: 'No Such Project' } }, lee)) as R;
  assert.deepEqual(said(there, 'Hidden Project'), said(notThere, 'No Such Project'));
  const byHandle = (await api.shareOnward({ from, who: 'p_sam', can: 'view', what: { project: 'things#1' } }, lee)) as R;
  const noHandle = (await api.shareOnward({ from, who: 'p_sam', can: 'view', what: { project: 'things#99' } }, lee)) as R;
  assert.deepEqual(said(byHandle, 'things#1'), said(noHandle, 'things#99'));
  const rowThere = (await api.shareOnward({ from, who: 'p_sam', can: 'view', what: { list: 'tasks', rows: ['things#1'] } }, lee)) as R;
  const rowNot = (await api.shareOnward({ from, who: 'p_sam', can: 'view', what: { list: 'tasks', rows: ['things#99'] } }, lee)) as R;
  assert.deepEqual(said(rowThere, 'things#1'), said(rowNot, 'things#99'));
});

test('THE OWNER IS STILL TOLD THE ROW HAS NO ADDRESS', async () => {
  const { api } = await record();
  const row = (await api.create({ register: 'people', fields: { name: 'Hidden Person' } }, owner)) as R;
  const out = (await api.share({ share: { who: { kind: 'person', id: row.value!.id }, what: { lists: ['tasks'] }, can: 'view', when: { until } } }, owner)) as R;
  assert.match(out.refusal?.fix ?? '', /Hidden Person has no address here/u);
});

test('SOMEBODY HERE IS STILL SHARED ON WITH, by id', async () => {
  const { api, lee, from } = await record();
  assert.ok(((await api.shareOnward({ from, who: 'p_sam', can: 'view' }, lee)) as R).ok);
});
