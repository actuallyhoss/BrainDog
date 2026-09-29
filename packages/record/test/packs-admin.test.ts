/**
 * Turning a pack off and on from the app: the ADMIN half.
 *
 * The kernel's own test holds the mechanism. What is held here is the door: only an owner in a
 * browser turns a pack, an argument the call does not take is refused, a refusal names what to do,
 * and the rows under a pack are the same rows after the round trip.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const AT = new Date(NOW).toISOString();

/* OWNED BY THEIR BODIES, as the seed installs Portfolio and Work, so neither has a `pack` row. */
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    pack: 'portfolio',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};
const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    pack: 'work',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things', index: true, scope: {} },
    ],
  } as never,
};
/** Declared in the app, so no pack owns it and nothing turns it off with Projects. */
const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'body',
    fields: [
      { id: 'body', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things', index: true, scope: {} },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal!;
};
type State = { id: string; version: string | null; disabled_at: string | null; registers: string[] };

async function record(...batch: (typeof THINGS)[]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install(batch)).ok);
  return { api, sql };
}

test('PACKS LISTS EACH ONE WITH ITS STATE, including the ones the seed owns by their bodies', async () => {
  const { api, sql } = await record(THINGS, TASKS);
  assert.deepEqual(
    value<State[]>(await api.packs(owner)).map((p) => ({ ...p })),
    [
      { id: 'portfolio', version: null, disabled_at: null, registers: ['things'] },
      { id: 'work', version: null, disabled_at: null, registers: ['tasks'] },
    ],
  );
  sql.close();
});

test('THE DEPENDENTS ARE NAMED, THE CASCADE IS A SECOND CALL, AND EVERY ROW COMES BACK THE SAME', async () => {
  const { api, sql } = await record(THINGS, TASKS);
  value(await api.create({ register: 'things', fields: { name: 'Kiln' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Kerning pass' } }, owner));
  const rows = () => sql.all<{ id: string; register: string; version: number; fields: string }>('SELECT id, register, version, fields FROM entry ORDER BY id').map((r) => ({ ...r }));
  const before = rows();

  const alone = refusal(await api.disablePack({ id: 'portfolio' }, owner));
  assert.equal(alone.code, 'PACK_REQUIRED');
  assert.deepEqual(alone.allowed, ['work']);
  assert.ok(value<State[]>(await api.packs(owner)).every((p) => p.disabled_at === null), 'a refused disable turned something off');

  const both = value<{ packs: string[]; changed: boolean }>(await api.disablePack({ id: 'portfolio', alsoDisable: ['work'] }, owner));
  assert.deepEqual(both.packs, ['portfolio', 'work']);
  const off = value<State[]>(await api.packs(owner));
  assert.deepEqual(off.map((p) => [p.id, p.disabled_at, p.registers]), [['portfolio', AT, ['things']], ['work', AT, ['tasks']]], 'off is not absent');
  assert.equal(value<{ changed: boolean }>(await api.disablePack({ id: 'work' }, owner)).changed, false);

  /* A WRITE TO A REGISTER THAT WENT OFF NAMES THE PACK, and so does enabling the dependent first. */
  const write = refusal(await api.create({ register: 'tasks', fields: { what: 'Spacing' } }, owner));
  assert.deepEqual([write.code, write.allowed], ['PACK_DISABLED', ['work']]);
  const edit = refusal(await api.update({ register: 'tasks', seq: 1, patch: { what: 'Spacing' } }, owner));
  assert.deepEqual([edit.code, edit.allowed], ['PACK_DISABLED', ['work']]);
  const early = refusal(await api.enablePack({ id: 'work' }, owner));
  assert.deepEqual([early.code, early.allowed], ['PACK_DISABLED', ['portfolio']]);
  /* A REGISTER NOBODY EVER DECLARED IS STILL JUST UNKNOWN. */
  assert.equal(refusal(await api.create({ register: 'invoices', fields: {} }, owner)).code, 'REGISTER_UNKNOWN');

  value(await api.enablePack({ id: 'portfolio' }, owner));
  value(await api.enablePack({ id: 'work' }, owner));
  assert.ok(value<State[]>(await api.packs(owner)).every((p) => p.disabled_at === null));
  assert.deepEqual(rows(), before, 'a row changed across the round trip');
  value(await api.create({ register: 'tasks', fields: { what: 'Spacing' } }, owner));
  sql.close();
});

test('A TOKEN WITHOUT AN OPERATION GRANT IS REFUSED, AND SO IS A PERSON WHO IS NOT AN OWNER', async () => {
  const { api, sql } = await record(THINGS, TASKS);
  const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' } };
  const writer: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };

  assert.equal(refusal(await api.disablePack({ id: 'work' }, token)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.enablePack({ id: 'work' }, token)).code, 'NEEDS_BROWSER_SESSION');
  refusal(await api.disablePack({ id: 'work' }, writer));
  refusal(await api.enablePack({ id: 'work' }, writer));
  assert.ok(value<State[]>(await api.packs(owner)).every((p) => p.disabled_at === null), 'a refused caller turned a pack off');
  sql.close();
});

test('AN ARGUMENT THE CALL DOES NOT TAKE IS REFUSED, NOT DROPPED', async () => {
  const { api, sql } = await record(THINGS, TASKS);
  const stray = refusal(await api.disablePack({ id: 'work', force: true } as never, owner));
  assert.deepEqual([stray.code, stray.at], ['FIELD_UNKNOWN', 'force']);
  assert.equal(refusal(await api.enablePack({ id: 'work', alsoDisable: [] } as never, owner)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await api.disablePack({} as never, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.enablePack({ id: '' }, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.disablePack({ id: 'portfolio', alsoDisable: 'work' } as never, owner)).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await api.disablePack({ id: 'notebook' }, owner)).code, 'DECLARATION_UNKNOWN');
  sql.close();
});

test('SCOPES_IN_USE WHEN A FIELD NO PACK OWNS STILL POINTS AT THE PROJECTS', async () => {
  const { api, sql } = await record(THINGS, NOTES);
  const refused = refusal(await api.disablePack({ id: 'portfolio' }, owner));
  assert.deepEqual([refused.code, refused.at], ['SCOPES_IN_USE', 'register.notes.project']);
  assert.equal(value<State[]>(await api.packs(owner))[0]?.disabled_at, null);
  sql.close();
});
