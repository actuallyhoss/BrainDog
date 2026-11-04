/**
 * A NOTE'S `{{ref:tasks#3}}` COMES WITH ITS ROW'S NAME (polish-j PJ4), for the rows the reader may see. The tab drew "#3"
 * until it had read the row's list; the record now sends `ref_names` with the note, and never the name of a row on a list
 * the reader is not invited to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({ id: `register.${id}`, kind: 'register' as const, body: { id, name, title, fields } as never });

const DECLS = [
  reg('tasks', 'Tasks', 'what', [{ id: 'what', type: 'text', required: true }]),
  reg('payroll', 'Payroll', 'who', [{ id: 'who', type: 'text', required: true }]),
  {
    id: 'page.notes',
    kind: 'page',
    body: { page: 'notes', title: 'Notes', requires: ['register.tasks'], blocks: [{ kind: 'note', body: 'Tracked as {{ref:tasks#1}}, and paid through {{ref:payroll#1}}.' }] },
  } as never,
];

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install(DECLS)).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.create({ register: 'tasks', fields: { what: 'Turn auto-renew back on' } }, owner));
  value(await api.create({ register: 'payroll', fields: { who: 'Sam Secret' } }, owner));
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { tasks: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { api, wren };
}

type Note = { kind: string; ref_names?: Record<string, string> };

test("the owner's note carries the name of every row its refs point at that is there", async () => {
  const { api } = await record();
  const note = value<{ blocks: Note[] }>(await api.page({ slug: 'notes' }, owner)).blocks[0]!;
  assert.deepEqual(note.ref_names, { 'tasks#1': 'Turn auto-renew back on', 'payroll#1': 'Sam Secret' });
});

test('a member is sent the names of the rows she may read and no other', async () => {
  const { api, wren } = await record();
  const note = value<{ blocks: Note[] }>(await api.page({ slug: 'notes' }, wren)).blocks[0]!;
  assert.deepEqual(note.ref_names, { 'tasks#1': 'Turn auto-renew back on' });
  assert.equal(JSON.stringify(note).includes('Sam Secret'), false);
});
