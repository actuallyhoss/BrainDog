/**
 * `huesWanted` and `giveHues`: the rows of a list that names an accent and hold no hue are counted, and
 * one press gives each a hue of its own, once, in one batch that one Undo takes back.
 *
 * THE METHOD FILE OVER A REAL KERNEL. The rows made "before" are written through the kernel's own `create`, which gives
 * no hue (only the record's `create` does), so they hold nothing there, as an import's rows do. The record's guards are
 * stood in for by ones that refuse as they do: a key held to some lists reads and writes those alone. Undo is the
 * record's own (`api.undo`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';
import type { UndoPlan } from '@braindog/kernel';
import { nextAccentHue } from '@braindog/theme';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type HuesGiven, type HuesWanted } from '../src/methods/hues.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { COMPANIES, PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A colleague who reads Clients and nothing else. */
const clientsOnly: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, registers: ['clients'] };
const token = { principal: { kind: 'token', id: 'tok_1', person: 'p_1', scope: 'write' } } as unknown as CallContext;

const decl = (id: string, body: Record<string, unknown>) => ({ id: `register.${id}`, kind: 'register', body: { id, ...body } }) as never;
const LISTS = [
  decl('projects', {
    name: 'Projects',
    title: 'name',
    identity: { accent: 'hue' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'hue', type: 'int', min: 0, max: 359 },
    ],
  }),
  decl('clients', { name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
];

/** Six projects made before hues were given, and one made since, which holds its own. */
const BEFORE = [...PROJECTS, 'Fernhollow'];

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): Refusal => {
  const x = r as { ok: boolean; refusal?: Refusal };
  assert.equal(x.ok, false, JSON.stringify(r));
  return x.refusal!;
};

async function harness() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(LISTS);
  assert.ok(put.ok, JSON.stringify(put));
  for (const name of BEFORE) assert.ok(api.kernel.create('projects', { name }, { actor: 'p_1' }).ok, name);
  value(await api.create({ register: 'projects', fields: { name: 'Saltgrass', hue: 210 } }, owner));
  for (const name of COMPANIES.slice(0, 2)) assert.ok(api.kernel.create('clients', { name }, { actor: 'p_1' }).ok, name);
  const refuse = (fix: string): Refusal => ({ code: 'FORBIDDEN', fix, at: 'principal' });
  const mayReach = (ctx: CallContext, list?: string): Refusal | null =>
    ctx.registers === undefined || ctx.registers === '*' || (list !== undefined && (ctx.registers as string[]).includes(list)) ? null : refuse('Not one of yours.');
  const deps = {
    kernel: api.kernel,
    sql,
    scoped: () => null,
    guard: (ctx: CallContext, _need: string, list?: string) => mayReach(ctx, list),
    readable: (ctx: CallContext, list: string) => mayReach(ctx, list),
    named: (a: { register?: unknown }) => (typeof a.register === 'string' && a.register !== '' ? null : { code: 'REQUIRED_MISSING', fix: 'Name a list.', at: 'register' }),
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return { sql, api, m: methods(deps) };
}

/** Each project's hue, by name. */
const huesOf = (sql: NodeSql): Record<string, unknown> =>
  Object.fromEntries(
    sql
      .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'projects' AND deleted_at IS NULL ORDER BY seq")
      .map((r) => JSON.parse(r.fields) as { name: string; hue?: unknown })
      .map((f) => [f.name, f.hue ?? null]),
  );

const writes = (sql: NodeSql): number =>
  sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE target LIKE 'entry:%'")!.n;

test('THE READ COUNTS THE ROWS WITH NO HUE, only on a list that names an accent, with five names and a plain sentence', async () => {
  const { sql, m } = await harness();
  const got = value<HuesWanted>(await m.huesWanted({}, owner));
  assert.equal(got.total, 6);
  assert.deepEqual(got.lists.map((l) => [l.list, l.name, l.count]), [['projects', 'Projects', 6]], 'Clients names no accent, so it is not asked');
  assert.deepEqual(got.lists[0]!.names, BEFORE.slice(0, 5), 'up to five, in the order they were made');
  assert.equal(got.lists[0]!.said, '6 in Projects have no colour of their own.');
  assert.doesNotMatch(got.lists[0]!.said, /—|\brows?\b|\bentit(y|ies)\b|#/u);
  assert.deepEqual(value<HuesWanted>(await m.huesWanted({ list: 'clients' }, owner)), { lists: [], total: 0 });
  assert.deepEqual(value<HuesWanted>(await m.huesWanted({}, clientsOnly)), { lists: [], total: 0 }, 'a list she cannot read is never counted to her');
  sql.close();
});

test('ONE PRESS GIVES EACH A HUE ONCE, in one batch, each the theme\'s next over the hues the list holds, and the held one is not touched', async () => {
  const { sql, m } = await harness();
  const before = writes(sql);
  const kept = sql.one<{ version: number }>("SELECT version FROM entry WHERE register = 'projects' AND json_extract(fields, '$.name') = 'Saltgrass'")!.version;
  const got = value<HuesGiven>(await m.giveHues({ list: 'projects' }, owner));
  assert.equal(got.gave, 6);
  assert.deepEqual(got.names, BEFORE);
  assert.ok(got.batch);
  assert.equal(writes(sql) - before, 6, 'one write for each, and none for the one that held a hue');
  const since = sql.all<{ batch: string; actor: string }>("SELECT batch, actor FROM event WHERE target LIKE 'entry:%' ORDER BY rowid DESC LIMIT 6");
  assert.deepEqual([...new Set(since.map((e) => `${e.batch} ${e.actor}`))], [`${got.batch} p_1`], 'one batch, signed by the person');

  const held = [210];
  const expected: Record<string, number> = {};
  for (const name of BEFORE) held.push((expected[name] = nextAccentHue(held)));
  assert.deepEqual(huesOf(sql), { ...expected, Saltgrass: 210 });
  assert.equal(new Set(held).size, held.length, 'no two alike');
  assert.equal(sql.one<{ version: number }>("SELECT version FROM entry WHERE register = 'projects' AND json_extract(fields, '$.name') = 'Saltgrass'")!.version, kept);
  assert.deepEqual(value<HuesWanted>(await m.huesWanted({}, owner)), { lists: [], total: 0 });
  sql.close();
});

test('A SECOND PRESS WRITES NOTHING and answers no batch', async () => {
  const { sql, m } = await harness();
  value(await m.giveHues({ list: 'projects' }, owner));
  const was = huesOf(sql);
  const before = writes(sql);
  assert.deepEqual(value<HuesGiven>(await m.giveHues({ list: 'projects' }, owner)), { list: 'projects', gave: 0, names: [], batch: null });
  assert.equal(writes(sql), before);
  assert.deepEqual(huesOf(sql), was);
  sql.close();
});

test('ONE UNDO OF THE BATCH TAKES EVERY HUE BACK, and they are counted again', async () => {
  const { sql, api, m } = await harness();
  const got = value<HuesGiven>(await m.giveHues({ list: 'projects' }, owner));
  const plan = value<UndoPlan>((await api.undo({ batch: got.batch, dry: true }, owner)) as Result<UndoPlan>);
  assert.equal(plan.steps.length, 6, plan.lines.join(' / '));
  value(await api.undo({ batch: got.batch, hash: plan.hash }, owner));
  const back = huesOf(sql);
  for (const name of BEFORE) assert.equal(back[name], null, name);
  assert.equal(back.Saltgrass, 210);
  assert.equal(value<HuesWanted>(await m.huesWanted({}, owner)).total, 6);
  sql.close();
});

test('A GRANT NARROWED TO SOME ROWS is told of those alone, and its press colours those alone', async () => {
  const { sql, m } = await harness();
  const one = { ...owner, wheres: { projects: { field: 'name', is: BEFORE[1]! } } } as unknown as CallContext;
  const got = value<HuesWanted>(await m.huesWanted({}, one));
  assert.deepEqual([got.total, got.lists[0]!.names], [1, [BEFORE[1]]], 'a row the grant leaves out is not counted or named');
  const gave = value<HuesGiven>(await m.giveHues({ list: 'projects' }, one));
  assert.deepEqual(gave.names, [BEFORE[1]]);
  const hues = huesOf(sql);
  assert.equal(typeof hues[BEFORE[1]!], 'number');
  for (const name of BEFORE.filter((n) => n !== BEFORE[1])) assert.equal(hues[name], null, name);
  assert.equal(value<HuesWanted>(await m.huesWanted({}, owner)).total, 5);
  sql.close();
});

test('A TOKEN IS REFUSED, a list with no accent is refused, and nothing is written', async () => {
  const { sql, m } = await harness();
  const before = writes(sql);
  const t = refusal(await m.giveHues({ list: 'projects' }, token));
  assert.equal(t.code, 'NEEDS_BROWSER_SESSION');
  assert.doesNotMatch(t.fix, /—|\brows?\b/u);
  assert.equal(refusal(await m.giveHues({ list: 'clients' }, owner)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await m.giveHues({ list: 'nowhere' }, owner)).code, 'REGISTER_UNKNOWN');
  assert.equal(refusal(await m.giveHues({}, owner)).at, 'list');
  assert.equal(refusal(await m.giveHues({ list: 'projects' }, clientsOnly)).code, 'FORBIDDEN', 'a list she may not write');
  assert.equal(writes(sql), before);
  sql.close();
});
