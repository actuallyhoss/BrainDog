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
