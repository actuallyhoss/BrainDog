/**
 * A pack's settings from the app, and a pack pointing at a list the record does not hold.
 *
 * The kernel's and the declare package's own tests hold the mechanism. What is held here is the door:
 * anyone who can read sees a pack's settings, only an owner in a browser changes them, an argument
 * the call does not take is refused, and a changed setting reaches a declaration through the next
 * plan and install, not before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
const writer: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'write' } };
const token = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' } } as unknown as CallContext;

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

const DOC = (declarations?: unknown[]) => ({
  pack: 'sample-ledger',
  version: '1.0.0',
  summary: 'A made-up ledger for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  config: {
    heading: { type: 'text', default: 'Sample invoices', label: 'Heading' },
    cadence: { type: 'enum', values: ['weekly', 'monthly'], default: 'monthly' },
  },
  declarations: declarations ?? [
    { register: 'samples', name: '{{config:heading}}', title: 'what', fields: [{ id: 'what', type: 'text' }] },
  ],
});

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  return { api, sql };
}

async function installed(doc: unknown = DOC()) {
  const r = await record();
  const planned = value<{ diff: { planHash: string } }>(await r.api.planPack({ doc }, owner));
  value(await r.api.installPack({ doc, planHash: planned.diff.planHash }, owner));
  return r;
}

const nameOf = (api: Awaited<ReturnType<typeof record>>['api']) =>
  JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.samples')!.body).name as string;

test('PLANNING A PACK THAT POINTS AT A LIST NOTHING HOLDS IS REFUSED, and says what to install first', async () => {
  const { api, sql } = await record();
  const doc = DOC([
    { register: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'payee', type: 'ref', to: 'people' }] },
  ]);
  const r = refusal(await api.planPack({ doc }, owner));
  assert.equal(r.code, 'REGISTER_UNRESOLVED');
  assert.equal(r.at, 'register.bills.fields.payee.to');
  assert.ok(r.fix.endsWith('Install people first: it declares people.'), r.fix);
  assert.equal(refusal(await api.installPack({ doc, planHash: '1.not-a-real-hash' }, owner)).code, 'PLAN_STALE');
  sql.close();
});

test('ANYONE WHO CAN READ SEES A PACK’S SETTINGS', async () => {
  const { api, sql } = await installed();
  const read = value<{ values: Record<string, unknown> }>(await api.packConfig({ id: 'sample-ledger' }, reader));
  assert.deepEqual(read.values, { heading: 'Sample invoices', cadence: 'monthly' });
  assert.equal(refusal(await api.packConfig({ id: 'sample-ledger', values: {} } as never, reader)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await api.packConfig({} as never, reader)).code, 'REQUIRED_MISSING');
  sql.close();
});

test('ONLY AN OWNER IN A BROWSER CHANGES THEM', async () => {
  const { api, sql } = await installed();
  const args = { id: 'sample-ledger', values: { cadence: 'weekly' } };
  assert.equal(refusal(await api.setPackConfig(args, token)).code, 'NEEDS_BROWSER_SESSION');
  assert.ok(refusal(await api.setPackConfig(args, writer)).code);
  assert.ok(refusal(await api.setPackConfig(args, reader)).code);
  assert.equal(refusal(await api.setPackConfig({ ...args, reinstall: true } as never, owner)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await api.setPackConfig({ id: 'sample-ledger', values: { cadence: 'hourly' } }, owner)).code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(value<{ values: Record<string, unknown> }>(await api.packConfig({ id: 'sample-ledger' }, owner)).values.cadence, 'monthly');

  const set = value<{ changed: string[] }>(await api.setPackConfig(args, owner));
  assert.deepEqual(set.changed, ['cadence']);
  const event = sql.one<{ actor: string; kind: string }>("SELECT actor, kind FROM event WHERE target = 'pack:sample-ledger' ORDER BY rowid DESC LIMIT 1");
  assert.equal(event?.kind, 'edit');
  assert.ok(event?.actor, 'the event names nobody');
  sql.close();
});

test('A CHANGED SETTING REACHES THE DECLARATION THROUGH THE NEXT PLAN AND INSTALL, and not before', async () => {
  const { api, sql } = await installed();
  assert.equal(nameOf(api), 'Sample invoices');

  value(await api.setPackConfig({ id: 'sample-ledger', values: { heading: 'Renamed samples' } }, owner));
  assert.equal(nameOf(api), 'Sample invoices', 'setting a value reinstalled the declaration');

  const planned = value<{ diff: { planHash: string; changes: { id: string }[] } }>(await api.planPack({ doc: DOC() }, owner));
  assert.deepEqual(planned.diff.changes.map((c) => c.id), ['register.samples']);
  value(await api.installPack({ doc: DOC(), planHash: planned.diff.planHash }, owner));
  assert.equal(nameOf(api), 'Renamed samples');

  /* Disabling and enabling brings back the bodies as they went off, and reads no setting. */
  value(await api.setPackConfig({ id: 'sample-ledger', values: { heading: 'Third name' } }, owner));
  value(await api.disablePack({ id: 'sample-ledger' }, owner));
  value(await api.enablePack({ id: 'sample-ledger' }, owner));
  assert.equal(nameOf(api), 'Renamed samples');
  sql.close();
});

/* A USE CASE AS IT WAS INSTALLED BEFORE `speaks`: its voice as settings, and no way to choose it. */
const OLD_USE_CASE = (id: string, register: string) => ({
  pack: `usecase-${id}`,
  version: '1.0.0',
  summary: 'A use case from before the voice could be chosen.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  config: { voice_home_title: { type: 'text', default: `${id} home`, label: 'Voice: home title' }, shared_version: { type: 'text', label: 'Last shared as' } },
  declarations: [{ register, name: register, title: 'what', fields: [{ id: 'what', type: 'text' }] }],
});

test('a use case installed before speaks existed reads as declaring it, with the one speaking by id set, and can be chosen', async () => {
  const { api, sql } = await installed(OLD_USE_CASE('personal', 'errands'));
  for (const doc of [OLD_USE_CASE('student', 'lessons')]) {
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc }, owner));
    value(await api.installPack({ doc, planHash: planned.diff.planHash }, owner));
  }
  type Config = { config: Record<string, unknown>; values: Record<string, unknown> };
  const personal = value<Config>(await api.packConfig({ id: 'usecase-personal' }, reader));
  const student = value<Config>(await api.packConfig({ id: 'usecase-student' }, reader));
  assert.equal((personal.config.speaks as { type: string }).type, 'bool');
  assert.equal(personal.values.speaks, true, 'the one speaking by id was not set to speak');
  assert.equal(student.values.speaks, null);
  const held = sql.one<{ manifest: string }>("SELECT manifest FROM pack WHERE id = 'usecase-personal'")!;
  assert.equal(Object.hasOwn(JSON.parse(held.manifest).config, 'speaks'), false, 'a read wrote to the record');

  /* SWITCH TO, as the app does it: the one chosen set to speak, the other set not to. */
  value(await api.setPackConfig({ id: 'usecase-student', values: { speaks: true } }, owner));
  value(await api.setPackConfig({ id: 'usecase-personal', values: { speaks: false } }, owner));
  assert.equal(value<Config>(await api.packConfig({ id: 'usecase-student' }, reader)).values.speaks, true);
  assert.equal(value<Config>(await api.packConfig({ id: 'usecase-personal' }, reader)).values.speaks, false);
  assert.equal(value<Config>(await api.packConfig({ id: 'usecase-personal' }, reader)).values.voice_home_title, 'personal home');
});

test('AN UPDATE FROM AN OLDER VERSION CARRIES WHAT IT KEPT TYPED, through the record, for any caller', async () => {
  const { carryForward } = await import('../../seed/src/usecases/links.ts');
  const doc = (version: string) => ({
    pack: 'usecase-personal',
    version,
    summary: 'Goals, and what is logged toward them.',
    author: 'Test Author',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      { register: 'goals', name: 'Goals', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'done', type: 'int' }] },
      { register: 'goal_log', name: 'Log', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'goal', type: 'ref', to: 'goals' }, { id: 'amount', type: 'int' }, { id: 'on', type: 'day' }] },
    ],
  });
  const sql = openSqlite();
  const catalogue = [{ id: 'usecase-personal', kind: 'usecase' as const, title: 'Personal', summary: '', modules: [], doc: () => null, carry: (io: unknown, from: string) => carryForward(io as never, 'personal', from, '2026-09-15') }];
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue });
  const put = async (d: unknown) => {
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: d }, owner));
    value(await api.installPack({ doc: d, planHash: planned.diff.planHash }, owner));
  };
  await put(doc('1.0.0'));
  value(await api.create({ register: 'goals', fields: { what: 'Swim 20 lengths', done: 12 } }, owner));
  type Rows = { rows: { seq: number; fields: Record<string, unknown> }[] };
  assert.equal(value<Rows>(await api.list({ register: 'goal_log' }, owner)).rows.length, 0, 'an install carried something');

  await put(doc('1.2.0'));
  const log = value<Rows>(await api.list({ register: 'goal_log' }, owner)).rows;
  assert.equal(log.length, 1);
  assert.equal(log[0]!.fields.what, 'So far, before the log');
  assert.equal(log[0]!.fields.amount, 12);
  assert.equal(log[0]!.fields.on, '2026-09-15');
  assert.equal(value<Rows>(await api.list({ register: 'goals' }, owner)).rows[0]!.fields.done ?? null, null, 'the typed number was kept and would count twice');

  /* AND ONCE: the same update again moves nothing more. */
  await put({ ...doc('1.2.1') });
  assert.equal(value<Rows>(await api.list({ register: 'goal_log' }, owner)).rows.length, 1);
  sql.close();
});
