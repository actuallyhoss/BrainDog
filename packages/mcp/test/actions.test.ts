/**
 * `braindog:actions`, the scheduled actions as a resource (`10-MCP` §6).
 *
 * A READ, SO A RESOURCE AND NOT A TOOL, which is a claim about the name and not about the count. It relays the
 * record's list, where a key is
 * its label, and it is listed only where the surface answers it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools, TOOLS, ttlOf } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const ORIGIN = 'https://api.example.test';

test('ON A REAL RECORD, braindog:actions IS LISTED AND ANSWERS EACH ACTION WITH ITS KEY BY LABEL ONLY', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 15, 12)) });
  const sealed = new Uint8Array([0xbd, 0xfa, 0x4e, 0x01, 0x02, 0x03]);
  assert.ok(
    api.kernel.bindGrant(
      { label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: sealed, nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
      'p_1',
    ).ok,
  );
  assert.ok(
    (
      await api.kernel.install([
        { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
        {
          id: 'ingest.balance',
          kind: 'ingest',
          body: { ingest: 'balance', channel: 'poll', url: `${ORIGIN}/v1/balance`, every: '1h', grant: 'example read', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never,
        },
      ])
    ).ok,
  );
  const mcp = tools(api);

  const listed = (await mcp.resources(owner)).find((r) => r.uri === 'braindog:actions');
  assert.ok(listed, 'braindog:actions is not listed');
  assert.equal(listed.ttlMs, 60_000);
  assert.equal(ttlOf('braindog:actions'), 60_000);

  const read = await mcp.read('braindog:actions', owner);
  assert.ok(read.ok);
  const rows = read.value as { ingest: string; channel: string; host: string | null; key: string | null }[];
  assert.deepEqual(rows.map((r) => [r.ingest, r.channel, r.host, r.key]), [['balance', 'poll', 'api.example.test', 'example read']]);
  const said = JSON.stringify(read.value);
  assert.doesNotMatch(said, /ciphertext|nonce|wrapped|kek_/);
  assert.doesNotMatch(said, /189,250,78/, 'the sealed bytes came back');

  assert.ok(
    !TOOLS.some((t) => t.name === 'actions'),
    'actions became a tool',
  );
  assert.equal((await mcp.read('braindog:actions/balance', owner)).ok, false);
  sql.close();
});

test('A SURFACE WITH NO actions DOES NOT LIST IT, and reading it says what to do instead', async () => {
  const { actions: _actions, ...older } = stub().surface;
  const mcp = tools(older);
  assert.equal((await mcp.resources({ who: 'agent' })).some((r) => r.uri === 'braindog:actions'), false);
  const read = await mcp.read('braindog:actions', { who: 'agent' });
  assert.equal(!read.ok && 'refusal' in read ? read.refusal.code : '', 'NOT_IN_THIS_BUILD');

  const { surface, calls } = stub();
  assert.ok((await tools(surface).resources({ who: 'agent' })).some((r) => r.uri === 'braindog:actions'));
  assert.ok(calls.some((c) => c.method === 'actions'));
});
