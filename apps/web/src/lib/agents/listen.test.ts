/**
 * The connect sheet's one ask (`listen.ts`): the newest runs read every time, the keys read only when a key was just
 * made, and no answer at all when the record refuses the runs. Settings, Agents and Today's first step hand the sheet
 * this same ask, so the two screens hear an agent's first call the same way.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LISTEN_RUNS, listenFor, type ListenClient } from './listen.ts';

type Call = { method: string; args?: unknown };

/** A record that answers the two reads, or refuses the ones named in `refuse`, and keeps what it was asked. */
function fakeRecord(refuse: ReadonlySet<string> = new Set()) {
  const calls: Call[] = [];
  const rows = [{ seq: 47, fields: { agent: 'Claude Code', host: 'MacBook', last_seen: '2026-10-14T12:00:00Z' } }];
  const keys = [{ id: 'k1', label: 'Nightly import', last_used_at: null }];
  const no = { ok: false, code: 'FORBIDDEN', fix: 'Only the owner can do this.' };
  const client = {
    list: async (args: unknown) => {
      calls.push({ method: 'list', args });
      return refuse.has('list') ? no : { ok: true, value: { rows } };
    },
    listTokens: async () => {
      calls.push({ method: 'listTokens' });
      return refuse.has('listTokens') ? no : { ok: true, value: keys };
    },
  } as unknown as ListenClient;
  return { client, calls, rows, keys };
}

test('the newest runs are read, newest first, and the keys are not asked for when no key was made', async () => {
  const r = fakeRecord();
  const said = await listenFor(r.client)(false);
  assert.deepEqual(said, { rows: r.rows, keys: [] });
  assert.deepEqual(r.calls, [
    { method: 'list', args: { register: 'session', limit: LISTEN_RUNS, order: [{ field: 'last_seen', dir: 'desc' }] } },
  ]);
});

test('the keys are read only when asked for, after the runs', async () => {
  const r = fakeRecord();
  const said = await listenFor(r.client)(true);
  assert.deepEqual(said, { rows: r.rows, keys: r.keys });
  assert.deepEqual(r.calls.map((c) => c.method), ['list', 'listTokens']);
});

test('no answer when the record refuses the runs, and the keys are not asked for then', async () => {
  const r = fakeRecord(new Set(['list']));
  assert.equal(await listenFor(r.client)(true), null);
  assert.deepEqual(r.calls.map((c) => c.method), ['list']);
});

test('keys the record refuses leave the runs standing, with no keys', async () => {
  const r = fakeRecord(new Set(['listTokens']));
  assert.deepEqual(await listenFor(r.client)(true), { rows: r.rows, keys: [] });
});

test('each ask asks again: nothing is kept between two', async () => {
  const r = fakeRecord();
  const listen = listenFor(r.client);
  await listen(false);
  await listen(false);
  assert.equal(r.calls.length, 2);
});
