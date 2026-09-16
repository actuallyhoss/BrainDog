/**
 * A refusal names the problem the caller actually has.
 *
 * Each case here used to answer with a sentence about a value nobody sent ("no register called
 * undefined", "no row contacts#undefined"), a problem the caller did not have ("a token cannot change
 * what this record is", said to a read), or no refusal at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REFUSAL_CODES, type Snapshots } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const CONTACTS = {
  id: 'register.contacts',
  kind: 'register' as const,
  body: { id: 'contacts', name: 'Contacts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_1', level: 'owner' } };

const port: Snapshots = {
  async take(label) {
    return { id: `2026-09-16T12-00-00Z-${label}`, at: '2026-09-16T12:00:00.000Z', bytes: 1 };
  },
  async list() {
    return [];
  },
  async restore() {},
  async prune() {},
};

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 16, 12)), snapshots: port });
  assert.ok((await api.kernel.install([CONTACTS])).ok);
  return api as unknown as Record<string, (...a: unknown[]) => Promise<{ ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } }>>;
}

const refused = (r: { ok: boolean; refusal?: { code: string; fix: string; at?: string } }) => {
  assert.equal(r.ok, false, 'the call went through');
  const said = r.refusal!;
  assert.ok((REFUSAL_CODES as readonly string[]).includes(said.code), `${said.code} is outside 30 §6`);
  assert.doesNotMatch(said.fix, /undefined|—/);
  return said;
};

test('A CALL WITH NO REGISTER SAYS TO NAME ONE, not that there is no register called undefined', async () => {
  const api = await record();
  for (const said of [
    refused(await api.create!({ fields: { name: 'Ada' } }, owner)),
    refused(await api.list!({}, owner)),
    refused(await api.update!({ seq: 1, patch: { name: 'Ada' } }, owner)),
  ]) {
    assert.equal(said.code, 'REQUIRED_MISSING');
    assert.equal(said.at, 'register');
  }
});

test('AN UPDATE WITH NO ROW NUMBER SAYS TO NAME ONE, not that there is no row contacts#undefined', async () => {
  const api = await record();
  const said = refused(await api.update!({ register: 'contacts', patch: { name: 'Ada' } }, owner));
  assert.equal(said.code, 'REQUIRED_MISSING');
  assert.equal(said.at, 'seq');
  assert.equal(refused(await api.update!({ register: 'contacts', seq: 'three', patch: {} }, owner)).code, 'VALUE_MALFORMED');
});

test('A GET THAT NAMES NOTHING IS REFUSED, where it answered null and, with no arguments, threw', async () => {
  const api = await record();
  assert.equal(refused(await api.get!({}, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refused(await api.get!(undefined, owner)).code, 'REQUIRED_MISSING');
});

test('A TOKEN LISTING THE COPIES IS TOLD IT CANNOT LIST THEM, not that it cannot change the record', async () => {
  const api = await record();
  const said = refused(await api.snapshots!(token));
  assert.equal(said.code, 'NEEDS_BROWSER_SESSION');
  assert.doesNotMatch(said.fix, /change/);
  assert.match(said.fix, /list the copies/);
});

test('A RESTORE GIVEN AN OBJECT FOR A BOOKMARK SAYS IT IS NOT A STRING, not "which copy?"', async () => {
  const api = await record();
  const said = refused(await api.restore!({ bookmark: { id: 'x' } }, owner));
  assert.equal(said.code, 'VALUE_MALFORMED');
  assert.equal(said.at, 'bookmark');
  assert.equal(refused(await api.restore!({}, owner)).code, 'REQUIRED_MISSING');
});

test('A LIST LIMIT BELOW ONE IS REFUSED, where 0 read as fifty rows and -3 as one', async () => {
  const api = await record();
  for (const limit of [0, -3, '0']) {
    const said = refused(await api.list!({ register: 'contacts', limit }, owner));
    assert.equal(said.code, 'OUT_OF_BOUNDS');
    assert.equal(said.at, 'limit');
  }
  assert.ok((await api.list!({ register: 'contacts', limit: 5000 }, owner)).ok, 'above 500 is capped, not refused');
});

test('A CREATE CARRYING deleted_at IS REFUSED, because a row does not arrive deleted', async () => {
  const api = await record();
  const said = refused(await api.create!({ register: 'contacts', fields: { name: 'Ada', deleted_at: '2026-01-01T00:00:00.000Z' } }, owner));
  assert.equal(said.at, 'deleted_at');
  assert.equal(((await api.list!({ register: 'contacts' }, owner)).value as { rows: unknown[] }).rows.length, 0);
});
