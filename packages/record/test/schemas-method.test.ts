/**
 * `schemas`: several lists' declarations in one read (`src/methods/schemas.ts`), each held exactly as `schema` holds it.
 *
 * THE RULE THIS HOLDS: nobody is answered a list here that `schema` would refuse them, and every list they are answered
 * is what `schema` answers for it, the installed kinds included. One read in place of one a list, and nothing wider.
 *
 * Through the real record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { SCHEMAS_MOST, type SchemasAnswer } from '../src/methods/schemas.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 21, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};
const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'projects', type: 'list', of: 'ref', to: 'things' }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** Somebody who reads Projects and nothing else. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things'] };
/** Somebody who may only add, and read nothing. */
const adder: CallContext = { principal: { kind: 'person', id: 'p_4', level: 'append' } };
/** An agent on a key that reads. */
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } };

type Api = Awaited<ReturnType<typeof createRecordApi>>;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (out: Result<unknown>): Refusal => {
  assert.equal(out.ok, false);
  return (out as { refusal: Refusal }).refusal;
};

const schemas = (api: Api, args: unknown, ctx: CallContext): Promise<Result<SchemasAnswer>> => {
  const method = (api as unknown as { schemas?: (a: unknown, c: CallContext) => Promise<Result<SchemasAnswer>> }).schemas;
  assert.equal(typeof method, 'function', 'schemas is not registered in methods/index.ts');
  return method!(args, ctx);
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, PEOPLE] as never));
  return { api, sql };
}

test('EVERY LIST ASKED IS WHAT schema ANSWERS FOR IT, the installed kinds said once beside them', async () => {
  const { api, sql } = await record();
  for (const ctx of [owner, agent]) {
    const out = value<SchemasAnswer>(await schemas(api, { registers: ['things', 'people'] }, ctx));
    assert.deepEqual(Object.keys(out.lists).sort(), ['people', 'things']);
    assert.deepEqual(out.refused, {});
    for (const id of ['things', 'people']) {
      const one = value<Record<string, unknown>>(await api.schema({ register: id }, ctx));
      assert.deepEqual({ ...out.lists[id], blocks: out.blocks }, one, `${id} is answered as schema answers it`);
    }
  }
  sql.close();
});

test('A LIST THE CALLER MAY NOT READ IS REFUSED AS schema REFUSES IT, and nothing of it is said', async () => {
  const { api, sql } = await record();
  const out = value<SchemasAnswer>(await schemas(api, { registers: ['things', 'people'] }, shut));
  assert.deepEqual(Object.keys(out.lists), ['things']);
  assert.deepEqual(out.refused.people, refusal(await api.schema({ register: 'people' }, shut)));
  assert.doesNotMatch(JSON.stringify(out.refused), /projects/u, 'nothing of the closed list leaks');
  sql.close();
});

test('NOBODY WHO MAY NOT READ IS ANSWERED ANY LIST, as schema answers them none', async () => {
  const { api, sql } = await record();
  const said = await schemas(api, { registers: ['things', 'people'] }, adder);
  for (const id of ['things', 'people']) {
    const one = await api.schema({ register: id }, adder);
    assert.equal(one.ok, false, `schema answers an adder ${id}`);
    if (said.ok) assert.equal(said.value.lists[id], undefined, `schemas answers an adder ${id}`);
  }
  sql.close();
});

test('A LIST THAT IS NOT THERE SAYS SO, and names no other list', async () => {
  const { api, sql } = await record();
  const out = value<SchemasAnswer>(await schemas(api, { registers: ['things', 'nowhere'] }, owner));
  assert.equal(out.refused.nowhere?.code, 'REGISTER_UNKNOWN');
  assert.equal(out.refused.nowhere?.allowed, undefined);
  assert.deepEqual(Object.keys(out.lists), ['things']);
  sql.close();
});

test('WHAT IS ASKED FOR IS A LIST OF NAMES, at most a hundred, each once', async () => {
  const { api, sql } = await record();
  for (const args of [{}, { registers: [] }, { registers: 'things' }, { registers: [7] }, { registers: [''] }, null]) {
    const r = refusal(await schemas(api, args, owner));
    assert.equal(r.at, 'registers', JSON.stringify(args));
  }
  const many = Array.from({ length: SCHEMAS_MOST + 1 }, (_, i) => `list${i}`);
  assert.equal(refusal(await schemas(api, { registers: many }, owner)).code, 'OUT_OF_BOUNDS');
  const twice = value<SchemasAnswer>(await schemas(api, { registers: ['things', 'things'] }, owner));
  assert.deepEqual(Object.keys(twice.lists), ['things']);
  sql.close();
});

test('EVERY LIST THE CALLER READS, asked as true, is the lists boot names them, and nothing of the others', async () => {
  const { api, sql } = await record();
  for (const ctx of [owner, shut, agent]) {
    const out = value<SchemasAnswer>(await schemas(api, { every: true }, ctx));
    const booted = value<{ registers: { id: string }[] }>(await api.boot(ctx));
    assert.deepEqual(Object.keys(out.lists).sort(), booted.registers.map((r) => r.id).sort(), 'the same lists boot names');
    assert.deepEqual(out.refused, {}, 'a list held from them is not named');
    for (const id of Object.keys(out.lists)) assert.deepEqual({ ...out.lists[id], blocks: out.blocks }, value(await api.schema({ register: id }, ctx)));
  }
  assert.ok(!Object.keys(value<SchemasAnswer>(await schemas(api, { every: true }, shut)).lists).includes('people'));
  const none = await schemas(api, { every: true }, adder);
  if (none.ok) assert.deepEqual(Object.keys(none.value.lists), []);
  for (const args of [{ every: 'yes' }, { every: false }, { every: true, registers: ['things'] }]) assert.equal(refusal(await schemas(api, args, owner)).at, 'every');
  sql.close();
});

test('IT WRITES NOTHING', async () => {
  const { api, sql } = await record();
  const count = () => sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  const before = count();
  value(await schemas(api, { registers: ['things', 'people'] }, owner));
  assert.equal(count(), before);
  sql.close();
});
