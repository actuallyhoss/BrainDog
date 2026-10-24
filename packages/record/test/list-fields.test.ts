/**
 * A list read can ask for some fields only (scope 2026-10-24 A10): a walk for each row's name read every note whole.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 24, 9)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAW', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  const body = { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'notes', type: 'text' }] };
  assert.ok((await api.kernel.install([{ id: 'register.things', kind: 'register', body: body as never }])).ok);
  await api.create({ register: 'things', fields: { name: 'Lamp', notes: 'A long note '.repeat(200) } }, owner);
  return { sql, api };
}

test('LIST WITH FIELDS RETURNS ONLY THOSE, and the row keeps its other columns', async () => {
  const { sql, api } = await record();
  const out = await api.list({ register: 'things', fields: ['name'] }, owner);
  assert.ok(out.ok, JSON.stringify(out));
  const row = out.value.rows[0]!;
  assert.deepEqual(row.fields, { name: 'Lamp' });
  assert.equal(row.seq, 1);
  const whole = await api.list({ register: 'things' }, owner);
  assert.ok(whole.ok && typeof whole.value.rows[0]!.fields.notes === 'string', 'without fields, every field came back');
  sql.close();
});

test('FIELDS THAT ARE NOT A LIST OF NAMES ARE REFUSED, naming fields', async () => {
  const { sql, api } = await record();
  for (const bad of [[], 'name', [1]]) {
    const out = await api.list({ register: 'things', fields: bad as never }, owner);
    assert.equal(out.ok, false);
    assert.equal(!out.ok && 'refusal' in out && out.refusal.at, 'fields');
  }
  sql.close();
});
