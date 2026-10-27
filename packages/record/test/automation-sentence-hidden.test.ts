/**
 * A sentence about a list is held to the fields its caller may read: a field a share hides is not one they can name,
 * so "where salary is 95000" never reads a hidden value back as the rows it would have run on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
const UNTIL = new Date(Date.UTC(2026, 11, 1, 12)).toISOString();
const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW } as CallContext;
const STAFF = {
  id: 'register.staff',
  kind: 'register' as const,
  body: { id: 'staff', name: 'Staff', one: 'person', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'salary', type: 'int' }] } as never,
};

test('A FIELD A SHARE HIDES CANNOT BE NAMED IN A SENTENCE, and the look reads nothing through it', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG', slug: 'the-yard', name: 'The Yard', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await api.kernel.install([STAFF])).ok);
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_r', 'r@example.test', 'Rea', NULL)");
  for (const [name, salary] of [['Ann', 41000], ['Bo', 95000]] as const) assert.ok(((await api.create({ register: 'staff', fields: { name, salary } }, owner)) as { ok: boolean }).ok);
  const shared = (await api.share({ share: { who: { kind: 'person', id: 'p_r' }, what: { lists: ['staff'] }, can: 'view', hide: { staff: ['salary'] }, when: { until: UNTIL } } } as never, owner)) as { ok: boolean };
  assert.ok(shared.ok, JSON.stringify(shared));
  const held = api.kernel.access('p_r')!;
  const rea = {
    principal: { kind: 'person', id: 'p_r', level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    levels: held.levels,
    ...(held.wheres ? { wheres: held.wheres } : {}),
    ...(held.hides ? { hides: held.hides } : {}),
    ...(held.grant ? { grant: held.grant } : {}),
    credentialed: true,
    provedAt: NOW,
  } as CallContext;
  assert.deepEqual(held.hides, { staff: ['salary'] });

  const r = (await api.automationSentence({ sentence: 'When a person is added where salary is 95000, tell me' }, rea)) as {
    ok: boolean;
    value?: { looked?: { line?: string } | null };
  };
  assert.ok(!JSON.stringify(r).includes('Bo'), JSON.stringify(r));
  /* THE OWNER STILL READS IT WHOLE. */
  const mine = (await api.automationSentence({ sentence: 'When a person is added where salary is 95000, tell me' }, owner)) as { ok: boolean; value?: { looked?: { line?: string } | null } };
  assert.ok(mine.ok && (mine.value?.looked?.line ?? '').includes('Bo'), JSON.stringify(mine));
  sql.close();
});
