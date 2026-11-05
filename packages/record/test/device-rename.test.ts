/**
 * The owner renames one machine by its handle (`renameDevice`, `methods/device-rename.ts`): the grant and the list read
 * the new name. The kernel's own tests hold the name's rules (`kernel/test/device-client.test.ts`); what is new here is
 * who may, and that a call naming no machine is refused at `id`. Invented names throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 9, 14, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true, provedAt: NOW };

async function machine() {
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => NOW } });
  const made = await api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  const started = await api.deviceStart({ reach: 'login', label: 'test-laptop · braindog-cli' }, '203.0.113.7');
  if (!started.ok) return assert.fail(JSON.stringify(started));
  const looked = await api.deviceLook({ user_code: started.value.user_code }, owner);
  if (!looked.ok) return assert.fail(JSON.stringify(looked));
  const approved = await api.deviceApprove({ user_code: started.value.user_code, handle: looked.value.handle }, owner);
  if (!approved.ok) return assert.fail(JSON.stringify(approved));
  return { api, handle: approved.value.handle };
}

const refusalOf = (out: object) => ('refusal' in out ? (out.refusal as { code: string; at?: string }) : null);

test('THE OWNER RENAMES A MACHINE BY ITS HANDLE, and the list reads the new name', async () => {
  const { api, handle } = await machine();
  const out = await api.renameDevice({ id: handle, label: '  Desk  ' }, owner);
  if (!out.ok) return assert.fail(JSON.stringify(out));
  assert.equal(out.value.handle, handle);
  const listed = await api.listDevices(owner);
  if (!listed.ok) return assert.fail(JSON.stringify(listed));
  assert.ok(listed.value.find((d) => d.handle === handle)?.label?.startsWith('Desk'), JSON.stringify(listed.value));
});

test('A TOKEN, A PERSON BELOW OWNER AND A CALL NAMING NO MACHINE ARE REFUSED', async () => {
  const { api, handle } = await machine();
  const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'owner' } };
  const member: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'write' }, credentialed: true, provedAt: NOW };
  assert.ok(refusalOf(await api.renameDevice({ id: handle, label: 'Desk' }, agent)));
  assert.ok(refusalOf(await api.renameDevice({ id: handle, label: 'Desk' }, member)));
  assert.equal(refusalOf(await api.renameDevice({ label: 'Desk' }, owner))?.at, 'id');
  assert.equal(refusalOf(await api.renameDevice({ id: '', label: 'Desk' }, owner))?.at, 'id');
  assert.equal(refusalOf(await api.renameDevice({ id: handle, label: '   ' }, owner))?.at, 'label');
});
