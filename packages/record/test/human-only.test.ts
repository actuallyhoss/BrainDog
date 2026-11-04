/**
 * Somebody the owner deleted is his to bring back: an agent's token is refused when it meets them by the same address
 * or creates them again, and nothing is written. The owner at his own keyboard may.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' },
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };
const agent = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' }, credentialed: true } as unknown as CallContext;

test('AN AGENT IS REFUSED SOMEBODY THE OWNER DELETED, in its own code, and nothing is written', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([PEOPLE])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const row = (await api.create({ register: 'people', fields: { name: 'Sam', email: 'sam@example.test' } }, owner)) as { ok: boolean; value: { id: string; version: number } };
  assert.ok(row.ok);
  const gone = await api.update({ register: 'people', seq: 1, patch: { deleted_at: true }, version: row.value.version } as never, owner);
  assert.ok((gone as { ok: boolean }).ok, JSON.stringify(gone));
  const count = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'people' AND deleted_at IS NULL")!.n;
  assert.equal(count(), 0);
  const met = (await api.meet({ kind: 'person', name: 'Sam', email: 'sam@example.test', source: 'a test' } as never, agent)) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(met.refusal?.code, 'HUMAN_ONLY', JSON.stringify(met));
  assert.equal(met.refusal?.at, 'email');
  assert.equal(count(), 0);
});
