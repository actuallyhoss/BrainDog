/**
 * What an Admin may give: only what they read whole themselves, never to themselves, and never Keys, People or a list
 * kept for owners, by invitation or by share. An owner is held to none of it.
 *
 * Found by the teams review (1 Nov): `invite({ person: <self>, registers: { session: 'decide' } })` let an Admin read
 * the runs the record keeps from everybody but an owner, and a share could end a deny the owner had set on them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 10, 1, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_own', level: 'owner' }, credentialed: true };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as Out;
  assert.ok(!x.ok && x.refusal, `expected a refusal, and the call answered ${JSON.stringify(x.value)}`);
  return x.refusal!;
};

const list = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }], ...extra } as never,
});

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-desk', name: 'The Desk', tz: 'UTC', locale: 'en', owner: { id: 'p_own' } }));
  value(await api.kernel.install([list('notes', 'Notes'), list('payroll', 'Payroll', { owner_only: true })]));
  value(await api.invite({ person: 'p_adm', name: 'Ada', level: 'decide' }, owner));
  value(await api.invite({ person: 'p_bea', name: 'Bea', level: 'read' }, owner));
  const as = (person: string): CallContext => {
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, ...(held.registers === null ? {} : { registers: held.registers }), levels: held.levels, credentialed: true };
  };
  return { sql, api, as };
}

test('AN ADMIN NEVER CHANGES WHAT THEY HOLD THEMSELVES, by invitation or by share', async () => {
  const { api, as } = await record();
  const ada = as('p_adm');
  assert.equal(refusal(await api.invite({ person: 'p_adm', level: 'decide', registers: { notes: 'write' } }, ada)).at, 'person');
  assert.equal(refusal(await api.share({ share: { who: { kind: 'person', id: 'p_adm' }, what: { lists: ['notes'] }, can: 'view' } }, ada)).at, 'who');
});

test('AN ADMIN GIVES NOBODY A LIST KEPT FOR OWNERS, and an owner still does', async () => {
  const { api, as } = await record();
  const ada = as('p_adm');
  assert.equal(refusal(await api.invite({ person: 'p_bea', registers: { payroll: 'read' } }, ada)).at, 'registers');
  value(await api.invite({ person: 'p_bea', registers: { notes: 'write' } }, ada));
  value(await api.invite({ person: 'p_bea', registers: { payroll: 'read' } }, owner));
});

test('AN ADMIN HELD FROM A LIST GIVES NOBODY ALL OF THE BRAINDOG', async () => {
  const { api, sql, as } = await record();
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_adm', 'notes', 'read')");
  sql.exec("UPDATE member SET level = 'decide' WHERE person_id = 'p_adm' AND register = '*'");
  const held = { ...as('p_adm'), wheres: { notes: { field: 'what', is: 'Mine' } } } as CallContext;
  assert.equal(refusal(await api.invite({ person: 'p_bea', level: 'write' }, held)).at, 'level');
});
