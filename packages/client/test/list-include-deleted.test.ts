/**
 * `client.list` TAKES `includeDeleted`, AND A DELETED ROW IT LISTS SAYS IT IS DELETED (backlog IMP-1, wave fifty-three).
 *
 * The client's `list` declared `register`, `where`, `limit`, `cursor` and `order`, so asking it for deleted rows was a
 * type error, and it sends a read as a GET, where an argument the host's table did not declare arrived as the text
 * "true" and the kernel answered live rows only. The CLI's import worked round both by sending its own POST
 * (`apps/cli/src/import.ts`, `listWithDeleted`). This is the declared door that replaces it.
 *
 * THE ROW CARRIES ITS MARKER, AND THAT IS THE HALF A CALLER ACTS ON. Audit fifty-two's findings 2 and 7 were about a
 * deleted row that came back looking live (a ref named and then refused, a `log` answer that dropped `deleted_at`); a
 * list that hands a deleted row back without `deleted_at` would be the same defect on a third door. The import keys on
 * it to leave a row he threw away alone.
 *
 * NOT A STAND-IN FETCH. `writes.test.ts` records requests against a fake, which proves the verb and nothing about the
 * answer. Here the fetch is `serveApi` over a real record, as `packages/host/test/boundary.test.ts` drives the client,
 * so the query string the client writes is the one the host's table decodes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '@braindog/host';

import { createClient } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

type Row = { seq: number; version: number; fields: { what: string }; deleted_at: string | null };

async function wired() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  const handlers = handlersFor(api);
  const sent: { method: string; path: string }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({ method: init?.method ?? 'GET', path: `${url.pathname}${url.search}` });
    return serveApi(new Request(url, init), handlers, owner);
  }) as typeof globalThis.fetch;
  return { sql, sent, client: createClient({ base: 'https://braindog.example', fetch }) };
}

test('a deleted row listed with includeDeleted comes back carrying deleted_at, and a plain list leaves it out', async () => {
  const { sql, sent, client } = await wired();
  const kept = await client.create({ register: 'obligations', fields: { what: 'Invoice 41' } });
  const gone = await client.create({ register: 'obligations', fields: { what: 'Invoice 42' } });
  assert.ok(kept.ok && gone.ok);
  const row = gone.value as Row;
  // DELETED THROUGH THE CLIENT TOO, through the record's own update. `true` and not a time, because the record stamps
  // `deleted_at` with its own clock whatever it is sent: a sent 08:00 came back as the clock's 09:00 when this was run.
  const deleted = await client.update({ register: 'obligations', seq: row.seq, patch: { deleted_at: true }, version: row.version });
  assert.ok(deleted.ok, JSON.stringify(deleted));

  sent.length = 0;
  const all = await client.list({ register: 'obligations', includeDeleted: true });
  assert.ok(all.ok, JSON.stringify(all));
  // A READ, SO A GET, and the argument is in the address where the host's table decodes it.
  assert.deepEqual(sent, [{ method: 'GET', path: '/api/list?register=obligations&includeDeleted=true' }]);
  const rows = all.value.rows as Row[];
  assert.deepEqual(rows.map((r) => r.fields.what).sort(), ['Invoice 41', 'Invoice 42']);
  assert.equal(rows.find((r) => r.fields.what === 'Invoice 42')?.deleted_at, new Date(NOW).toISOString());
  assert.equal(rows.find((r) => r.fields.what === 'Invoice 41')?.deleted_at, null);

  const live = await client.list({ register: 'obligations' });
  assert.ok(live.ok);
  assert.deepEqual((live.value.rows as Row[]).map((r) => r.fields.what), ['Invoice 41']);
  sql.close();
});
