/**
 * A plan handed to an owner who does not read every list carries no count of the events that list hides from him.
 *
 * `83875130` keyed `version()` to what the caller can see, because `MAX(event.rowid)` handed to anybody `holdsRowids`
 * refuses is a count of the lines they are not shown. `installedState()` went on carrying `kernel.version()` into every
 * plan, and `declare`'s `plan` writes it in the clear as the integer half of `planHash` (`<record_version>.<sha256>`).
 * `planPack` is `admin`, which asks for an owner in a browser and nothing about lists, so an owner another owner has held
 * to `append` on Diary (`members.ts`, `reader-rowid-gap.test.ts` (3)) reached it. Measured at HEAD before the change: his
 * `planHash` led with 4, the owner wrote two Diary rows he may not read, and his next plan led with 6.
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

const DOC = {
  pack: 'sample-ledger',
  version: '1.0.0',
  summary: 'A made-up ledger for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'samples', name: 'Samples', title: 'what', fields: [{ id: 'what', type: 'text' }] }],
};

const kit: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

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
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_2' } }).ok,
  );
  /* A SECOND OWNER, HELD TO append ON DIARY BY THE FIRST, which is the shape `reader-rowid-gap.test.ts` (3) builds. */
  value(await api.invite({ person: 'p_1', name: 'Hal', level: 'owner', registers: { diary: 'append' } } as never, kit));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, kit));
  const held = api.kernel.access('p_1')!;
  assert.equal(held.level, 'owner', 'he is still an owner, so admin lets him plan');
  const hal: CallContext = { principal: { kind: 'person', id: 'p_1', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const planned = async (ctx: CallContext): Promise<string> => value<{ diff: { planHash: string } }>(await api.planPack({ doc: DOC }, ctx)).diff.planHash;
  const lead = (hash: string): number => Number(hash.slice(0, hash.indexOf('.')));
  const rowids = (): Set<number> => new Set(sql.all<{ rowid: number }>('SELECT rowid FROM event').map((e) => Number(e.rowid)));
  return { sql, api, hal, planned, lead, rowids };
}

test('(1) DIARY WRITES DO NOT MOVE THE PLAN OF AN OWNER HELD TO append ON THE DIARY', async () => {
  const { sql, api, hal, planned, lead, rowids } = await studio();
  const before = await planned(hal);
  for (let i = 0; i < 2; i++) value(await api.create({ register: 'diary', fields: { body: `Dinner ${i}` } }, kit));
  const after = await planned(hal);
  assert.equal(after, before, `two Diary writes he may not read moved his plan from ${before} to ${after}`);
  assert.ok(!rowids().has(lead(after)), `his plan leads with ${lead(after)}, an event's rowid, so two of them subtract to a count`);
  sql.close();
});

test('(2) HIS PLAN STILL INSTALLS, a line he reads written between them moves nothing the plan says (`samePlan`), and a plan that says something else is stale', async () => {
  const { sql, api, hal, planned } = await studio();
  const read = await planned(hal);
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, kit));
  /* WHAT WAS READ IS WHAT GOES IN, whatever the record wrote since: only a plan that says something else is sent back (a0e31b1f0). */
  const other = `${read.slice(0, read.indexOf('.'))}.${'0'.repeat(64)}`;
  const refused = (await api.installPack({ doc: DOC, planHash: other }, hal)) as Out;
  assert.equal(refused.ok, false, 'a plan that says something else went in');
  assert.equal(refused.refusal?.code, 'PLAN_STALE');
  value(await api.installPack({ doc: DOC, planHash: read }, hal));
  sql.close();
});

test('(3) THE OWNER WHO READS EVERY LIST KEEPS MAX(event.rowid) AT THE HEAD OF HIS PLAN', async () => {
  const { sql, api, planned, lead } = await studio();
  assert.equal(lead(await planned(kit)), api.kernel.version());
  sql.close();
});
