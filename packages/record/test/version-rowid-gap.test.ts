/**
 * `version()` answers a caller who is not handed rowids a number that moves when a line they may read is written, and
 * that says nothing about how many lines they may not read were written in between.
 *
 * `loop/research-batch-twenty-four-audit.md` finding 2. `99caef53` took the rowid out of `recentHistory` and `whatsNew`
 * for everybody `holdsRowids` refuses, and `version()` went on answering `MAX(event.rowid)` behind `guard(ctx, 'read')`.
 * The audit's probe read Rae, a colleague at `read`, go from 4 to 9 across three invitations and two Diary rows, and Mo,
 * at `read` with Diary held to `append`, go from 9 to 14 across the same: the gap of 5 counted three invitations Rae is
 * shown none of, and the two Diary writes `lineOf` hides from Mo. The host lists `version` as the polling fallback's
 * own call, so a client that polls hands the count out without being asked for it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
type Page = { events: { id: string; register: string | null }[] };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

async function studio() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)) });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.invite({ person: 'p_7', name: 'Rae', level: 'read' } as never, owner));
  value(await api.invite({ person: 'p_8', name: 'Mo', level: 'read', registers: { diary: 'append' } } as never, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  /* BUILT THE WAY THE HOST BUILDS A MEMBER, from `kernel.access`, so the grant shape is the one a real sign-in carries. */
  const as = (person: string): CallContext => {
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  };
  const at = async (ctx: CallContext): Promise<number> => value<{ version: number }>(await api.version(ctx)).version;
  const newest = async (ctx: CallContext): Promise<string | undefined> => value<Page>(await api.recentHistory({ limit: 1 } as never, ctx)).events[0]?.id;
  const rowids = (): Set<number> => new Set(sql.all<{ rowid: number }>('SELECT rowid FROM event').map((e) => Number(e.rowid)));
  return { sql, api, rae: as('p_7'), mo: as('p_8'), at, newest, rowids };
}

test('(1) THE OWNER\'S INVITATIONS DO NOT MOVE A COLLEAGUE\'S VERSION, and a line she reads does', async () => {
  const { sql, api, rae, at, newest, rowids } = await studio();
  const before = await at(rae);
  const sawBefore = await newest(rae);
  for (let i = 0; i < 3; i++) value(await api.invite({ person: `p_${20 + i}`, name: `Guest ${i}`, level: 'read' } as never, owner));
  assert.equal(await newest(rae), sawBefore, 'the invitations are lines she is shown, so this test measures nothing');
  const after = await at(rae);
  assert.equal(after, before, `three invitations she is shown none of moved her version from ${before} to ${after}`);

  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, owner));
  const moved = await at(rae);
  assert.notEqual(moved, after, 'a line she reads did not move her version, so a poll would miss it');
  assert.ok(!rowids().has(moved), `her version ${moved} is an event's rowid, so two of them subtract to a count`);
  sql.close();
});

test('(2) DIARY WRITES DO NOT MOVE THE VERSION OF A MEMBER WHO MAY ONLY APPEND TO THE DIARY', async () => {
  const { sql, api, mo, at, newest, rowids } = await studio();
  const before = await at(mo);
  const sawBefore = await newest(mo);
  for (let i = 0; i < 2; i++) value(await api.create({ register: 'diary', fields: { body: `Dinner ${i}` } }, owner));
  assert.equal(await newest(mo), sawBefore, 'the Diary rows are lines she is shown, so this test measures nothing');
  const after = await at(mo);
  assert.equal(after, before, `two Diary writes she may not read moved her version from ${before} to ${after}`);

  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, owner));
  const moved = await at(mo);
  assert.notEqual(moved, after, 'a line she reads did not move her version');
  assert.ok(!rowids().has(moved), `her version ${moved} is an event's rowid`);
  sql.close();
});

test('(3) THE OWNER, WHO IS SHOWN EVERY LINE, KEEPS MAX(event.rowid)', async () => {
  const { sql, api, at } = await studio();
  value(await api.invite({ person: 'p_30', name: 'Guest', level: 'read' } as never, owner));
  assert.equal(await at(owner), api.kernel.version());
  sql.close();
});
