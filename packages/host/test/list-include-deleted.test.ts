/**
 * A LIST THAT ASKS FOR DELETED ROWS GETS THEM, BY EITHER VERB, AND THE TABLE SAYS SO.
 *
 * `kernel.list` has read `includeDeleted` for as long as rows have been soft-deleted, and the record's `list` handed
 * the kernel every argument it was sent. Nothing between a caller and the kernel NAMED it: `ROUTES` declared `register`,
 * `where`, `limit`, `cursor` and `order`, and an argument the table does not declare reaches the handler as the text it
 * was sent as. Measured against HEAD afb3b1b2 with the record below: `GET /api/list?register=obligations&
 * includeDeleted=true` answered one row, the live one, with status 200 and nothing said, because the kernel reads
 * `=== true` and was handed the four letters "true". The same read as a POST answered both. So the CLI's import sent
 * the POST by hand (`apps/cli/src/import.ts`, `listWithDeleted`), leaning on an argument no type admitted.
 *
 * AND A VALUE THAT IS NOT TRUE OR FALSE IS REFUSED, NOT READ AS FALSE. Once the table decodes `includeDeleted` as JSON,
 * `?includeDeleted=1` arrives as the number 1, which the kernel also does not read as `true`. That is the same silent
 * live-only answer one typo away, so the record refuses it at the argument.
 *
 * THE HOST HERE IS A REAL RECORD BEHIND `serveApi`, as `boundary.test.ts` opens one. A stub handler that parsed the
 * query itself would pass whatever the table said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Row = { seq: number; fields: { what: string }; deleted_at: string | null };
type Answer = { ok: boolean; value?: { rows: Row[] }; refusal?: { code: string; fix: string; at?: string } };

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
};

/**
 * One live row and one deleted, the deleted one through the record's own update. `true` and not a time, because the
 * record stamps `deleted_at` with its own clock whatever it is sent: a sent 08:00 came back as the clock's 09:00.
 */
async function host() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  const kept = await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner);
  const gone = await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, owner);
  assert.ok(kept.ok && gone.ok && !('asked' in gone.value));
  const deleted = await api.update({ register: 'obligations', seq: gone.value.seq!, patch: { deleted_at: true }, version: gone.value.version }, owner);
  assert.ok(deleted.ok, JSON.stringify(deleted));
  const handlers = handlersFor(api);
  const call = async (path: string, body?: unknown) => {
    const request = body === undefined ? new Request(`https://x/api/${path}`) : new Request(`https://x/api/${path}`, { method: 'POST', body: JSON.stringify(body) });
    const res = await serveApi(request, handlers, owner);
    return { status: res.status, body: (await res.json()) as Answer };
  };
  return { sql, call };
}

const said = (a: Answer): string[] => (a.value?.rows ?? []).map((r) => `${r.fields.what}${r.deleted_at ? ' (deleted)' : ''}`).sort();

test('the route table names includeDeleted on list, as a structured argument', () => {
  const list = ROUTES.find((r) => r.name === 'list');
  assert.equal(list?.takes?.includeDeleted, 'json');
});

test('a GET that asks for deleted rows gets them, each carrying when it was deleted', async () => {
  const { call, sql } = await host();
  const out = await call('list?register=obligations&includeDeleted=true');
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(said(out.body), ['Invoice 41', 'Invoice 42 (deleted)']);
  assert.equal(out.body.value?.rows.find((r) => r.fields.what === 'Invoice 42')?.deleted_at, new Date(NOW).toISOString());
  // AND THE DEFAULT IS UNCHANGED. Every screen lists without the argument and must go on seeing live rows alone.
  assert.deepEqual(said((await call('list?register=obligations')).body), ['Invoice 41']);
  assert.deepEqual(said((await call('list?register=obligations&includeDeleted=false')).body), ['Invoice 41']);
  sql.close();
});

test('a POST asks the same way and is answered the same', async () => {
  const { call, sql } = await host();
  assert.deepEqual(said((await call('list', { register: 'obligations', includeDeleted: true })).body), ['Invoice 41', 'Invoice 42 (deleted)']);
  sql.close();
});

test('includeDeleted that is not true or false is refused at the argument, not read as false', async () => {
  const { call, sql } = await host();
  for (const [how, out] of [
    ['?includeDeleted=1', await call('list?register=obligations&includeDeleted=1')],
    ['?includeDeleted="true"', await call(`list?register=obligations&includeDeleted=${encodeURIComponent('"true"')}`)],
    ['a POST of "true"', await call('list', { register: 'obligations', includeDeleted: 'true' })],
  ] as const) {
    assert.equal(out.status, 422, `${how} answered ${out.status}: ${JSON.stringify(out.body)}`);
    assert.equal(out.body.refusal?.code, 'VALUE_MALFORMED', how);
    assert.equal(out.body.refusal?.at, 'includeDeleted', how);
  }
  sql.close();
});
