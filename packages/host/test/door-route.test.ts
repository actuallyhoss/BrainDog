/**
 * `heard` and `doorSigns`, the agent door's own signs (AGT-B01): `heard` routed as one DATA write, a POST whose body is
 * the mark; `doorSigns` as one READ+ read taking how many days back. Each is handed to the record method of its name, and
 * a record built before either answers `NOT_IN_THIS_BUILD`, never a 500.
 *
 * THE GROUPS ARE WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): DATA grows by `heard` and READ+ by `doorSigns`,
 * and nothing else grows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c-1', agent: 'claude' },
};
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

const call = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, path: string, body?: unknown) => {
  const init = body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) };
  const res = await serveApi(new Request(`https://x/api/${path}`, init), handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 9, 12)) });
  return { sql, api };
};

test('HEARD IS ONE DATA WRITE AND DOORSIGNS ONE READ+ READ, each routed once from routes/, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'heard' || r.name === 'doorSigns');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['heard', 'DATA', true], ['doorSigns', 'READ+', false]]);
  for (const name of ['heard', 'doorSigns']) assert.equal(EXTRA_ROUTES.filter((r) => r.name === name).length, 1, `${name} written twice`);
  assert.deepEqual(rows[0]!.takes, {});
  assert.deepEqual(rows[1]!.takes, { days: 'integer' });
  assert.match(rows[1]!.what, /changes nothing/u);
  assert.match(rows[0]!.what, /opens no run/u);
  for (const r of rows) assert.doesNotMatch(r.what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b/u, `${r.name} names things as a person does`);
  /* And `signs` is PRF-A01's: this unit names no verb of its own by it. */
  assert.equal(ROUTES.filter((r) => r.name === 'signs').length, 1);
});

test('THE ROUTES COUNT BY GROUP: DATA grows by one, READ+ by one, and nothing a browser alone reaches grows', () => {
  const by = (names: readonly { group: string }[]) => names.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'heard' && r.name !== 'doorSigns'));
  assert.equal(all.DATA, (without.DATA ?? 0) + 1);
  assert.equal(all['READ+'], (without['READ+'] ?? 0) + 1);
  for (const group of ['VAULT', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('EACH REACHES THE RECORD METHOD OF ITS NAME: the mark as sent, days as a whole number', async () => {
  const { sql, api } = await fresh();
  const asked: [string, unknown][] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      heard: async (args: unknown) => (asked.push(['heard', args]), ok({ marked: true })),
      doorSigns: async (args: unknown) => (asked.push(['doorSigns', { ...(args as object) }]), ok({ said: 'x' })),
    }),
  );
  assert.equal((await call(handlers, agent, 'heard', { kind: 'called', n: 3 })).status, 200);
  assert.equal((await call(handlers, agent, 'doorSigns?days=3')).status, 200);
  assert.deepEqual(asked, [['heard', { kind: 'called', n: 3 }], ['doorSigns', { days: 3 }]]);
  /* A write is a POST: a GET of heard is refused before the record is asked. */
  assert.equal((await call(handlers, agent, 'heard')).status, 405);
  assert.equal(asked.length, 2);
  sql.close();
});

test('THROUGH THE REAL RECORD: an agent’s marks move the owner’s signs from 0 to 1, and a stray key is refused', async () => {
  const { sql, api } = await fresh();
  const handlers = handlersFor(api);
  const said = async () => ((await call(handlers, owner, 'doorSigns')).body.value as { said: string }).said;
  assert.equal(await said(), 'Sessions that connected in the last 7 days: 0. Given the tools: 0. Made a call: 0.');
  for (const mark of [{ kind: 'hello', build: '0.9.2' }, { kind: 'listed', n: 16 }, { kind: 'called' }])
    assert.equal((await api.doorHeard(mark, agent)).ok, true);
  assert.equal((await call(handlers, agent, 'heard', { kind: 'called' })).body.refusal?.code, 'FORBIDDEN');
  assert.equal(await said(), 'Sessions that connected in the last 7 days: 1. Given the tools: 1. Made a call: 1.');
  const stray = await call(handlers, agent, 'heard', { kind: 'called', count: 2 });
  assert.equal(stray.body.refusal?.code, 'FIELD_UNKNOWN');
  assert.doesNotMatch(stray.body.refusal?.fix ?? '', /—/u);
  const narrow = await call(handlers, { ...agent, registers: ['tasks'] }, 'doorSigns');
  assert.equal(narrow.body.refusal?.code, 'FORBIDDEN');
  sql.close();
});

test('A RECORD WITHOUT THEM ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { heard: undefined, doorSigns: undefined });
  for (const [path, body] of [['doorSigns', undefined], ['heard', { kind: 'hello' }]] as const) {
    const out = await call(handlersFor(older as never), agent, path, body);
    assert.equal(out.status, 501, path);
    assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  }
  sql.close();
});
