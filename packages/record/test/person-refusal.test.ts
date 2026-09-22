/**
 * What somebody invited to one list is told when they reach for the record itself.
 *
 * `loop/research-invite-landing.md` finding 6 measured nine methods (`inbox`, `packs`, `whoami`, `members`, `spark`,
 * `listGrants`, `actions`, `planPack`, `decide`) answering a one-list colleague with "Name one of those, or ask the
 * owner for a record-wide token." That sentence is right for an agent's token, which is what it was written for. The
 * colleague is a person who signed in from an invitation, holds no token and was never offered one, and it is the
 * sentence on `/inbox`, `/spark`, `/packs` and every `/start` tile. A person is told about their invitation; a token
 * is still told about tokens.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { allows, createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; allowed?: readonly string[] } };

test('A PERSON INVITED TO ONE LIST IS NOT TOLD TO ASK FOR A TOKEN, by `allows` or by the methods finding 6 measured', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)) });
  assert.ok((await api.kernel.install([TASKS])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const invited = (await api.invite({ person: 'p_9', name: 'Wren', registers: { tasks: 'write' } }, owner)) as Out;
  assert.ok(invited.ok, JSON.stringify(invited));
  /* BUILT THE WAY THE HOST BUILDS THEM, from `kernel.access`, so this is the member the probe measured. */
  const held = api.kernel.access('p_9')!;
  assert.equal(held.level, null);
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  const said = allows(wren, 'read');
  assert.equal(said?.code, 'FORBIDDEN');
  assert.doesNotMatch(said!.fix, /token/i, 'a person who never held a token is sent to ask for one');
  assert.match(said!.fix, /tasks/, 'the sentence no longer says which list is theirs');
  assert.deepEqual(said!.allowed, ['tasks']);

  for (const [method, call] of [
    ['inbox', () => api.inbox(undefined, wren)],
    ['packs', () => api.packs(wren)],
    ['members', () => api.members(wren)],
    ['listGrants', () => api.listGrants(wren)],
    ['actions', () => api.actions(wren)],
  ] as const) {
    const out = (await call()) as Out;
    assert.equal(out.ok, false, `${method} answered a one-list colleague`);
    assert.doesNotMatch(out.refusal!.fix, /token/i, `${method} told a person to ask for a token`);
  }

  const stranger = allows({ principal: { kind: 'person', id: 'p_8', level: null }, registers: [] }, 'read');
  assert.doesNotMatch(stranger!.fix, /token/i, 'a person with nothing on the record is sent to ask for a token');
  sql.close();
});

test('and a token held to one list is still told about tokens, because a wider one is what its owner can mint', () => {
  const scoped = allows({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: null }, registers: ['tasks'] }, 'read');
  assert.equal(scoped?.code, 'FORBIDDEN');
  assert.match(scoped!.fix, /ask the owner for a record-wide token\.$/);
  const bare = allows({ principal: { kind: 'token', id: 't_2', scope: 'read', person: 'p_1', level: null }, registers: [] }, 'read');
  assert.match(bare!.fix, /Ask the owner for a token\.$/);
});
