import { createRecordApi, type CallContext, type Level, type Scope } from '../../record/src/index.ts';
import { openSqlite, fixedClock } from '../test/sqlite.ts';

export const NOW = Date.UTC(2026, 8, 5, 12);

export const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations', name: 'Obligations', title: 'what', state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};
export const NOTES = {
  id: 'register.notes', kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

export const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

export async function record(now = NOW) {
  const sql = openSqlite();
  const clock = fixedClock(now);
  const api = await createRecordApi({ sql, clock });
  const out = await api.kernel.install([OBLIGATIONS, NOTES]);
  if (!out.ok) throw new Error('install failed');
  return { api, sql, clock };
}

export async function studio(now = NOW) {
  const made = await record(now);
  const r = made.api.kernel.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com' } } as never);
  if (!r.ok) throw new Error('createRecord failed: ' + JSON.stringify(r));
  return made;
}

export const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
export const person = (level: Level, id = 'p_2'): CallContext => ({ principal: { kind: 'person', id, level } });
export const token = (scope: Scope, level: Level = 'owner'): CallContext => ({ principal: { kind: 'token', id: 't_1', scope, person: 'p_1', level } });
export const J = (x: unknown) => JSON.stringify(x, null, 0);
