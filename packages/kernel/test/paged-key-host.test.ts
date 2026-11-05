/**
 * A connector's key goes only to the host its keychain entry opens, as every other send's does.
 *
 * `sendAction` holds a `call`, a `poll` and a one-request `pull` to `opens`, and a script has `keyRefused`. A connector
 * that pages goes to `runPull` through the `Http` port and neither was on its path. Measured before the fix: a
 * declaration naming a key whose entry opens `api.acme.test` with `base: https://collector.example` was handed the sealed
 * key and its data key, and the runner sent the bearer to the collector.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type GrantRow, type Paged } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 10, 5, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

const CHARGES: Declaration = {
  id: 'register.charges',
  kind: 'register',
  body: { id: 'charges', name: 'Charges', title: 'ref', fields: [{ id: 'ref', type: 'text', required: true }] } as never,
};

const connector = (grant: string, base: string): Declaration => ({
  id: 'ingest.acme',
  kind: 'ingest',
  body: {
    ingest: 'acme',
    channel: 'pull',
    every: '1h',
    grant,
    map: { ref: { path: 'id', type: 'text' } },
    fetch: { base, path: '/v1/charges', auth: { kind: 'none' }, schedule: { every: '1h' }, page: { kind: 'page_number', param: 'page' }, read: { rows: 'data' } },
    writes: { register: 'charges' },
    dedupe: ['ref'],
  } as never,
});

async function ran(opens: string, base: string) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(
    k.createRecord({
      id: ID,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', name: 'Ada' },
      keys: { record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' }, connector: { wrapped: b(70), nonce: b(60), kek_id: 'kek_2f' } },
    }).ok,
  );
  const made = k.bindGrant({ label: 'acme key', opens, kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f', sealed_under: 'connector' } as never, 'p_1');
  assert.ok(made.ok, fixOf(made));
  const key = (made.value as GrantRow).id;
  const out = await k.install([CHARGES, connector(key, base)]);
  assert.ok(out.ok, fixOf(out as Result<unknown>));
  const seen: Paged[] = [];
  const run = await k.runActions(async () => assert.fail('a connector is not one request'), {
    page: async (p) => {
      seen.push(p);
      k.ackOutbox({ id: p.job.id, state: 'done', leasedUntil: p.job.leasedUntil });
      return { outcome: 'ok', requests: 1, bytes: 1, ms: 1, failures: 0, status: 200, say: 'read' };
    },
  });
  return { sql, k, seen, run };
}

test('A KEY THAT OPENS ANOTHER HOST IS NOT UNSEALED FOR A CONNECTOR: nothing reaches the runner, and the connector pauses saying why', async () => {
  const { sql, seen, run } = await ran('api.acme.test', 'https://collector.example');
  assert.deepEqual(seen, [], 'the runner was handed the key to send to the wrong host');
  assert.equal(run.usage[0]?.outcome, 'paused', JSON.stringify(run));
  assert.equal(sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'pull' AND key = 'acme'")?.state, 'paused');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind = 'grant.read'")?.n, 0, 'the key was opened');
  sql.close();
});

test('THE HOST IT OPENS GETS IT, and the same host at a trailing dot or in capitals is the same host', async () => {
  for (const opens of ['api.acme.test', 'https://API.acme.test/v1', 'api.acme.test.']) {
    const { sql, seen } = await ran(opens, 'https://api.acme.test');
    assert.equal(seen.length, 1, `refused for ${opens}`);
    assert.ok(seen[0]!.paged.grant, 'no key came with it');
    sql.close();
  }
});

test('AN ENTRY THAT NAMES NO HOST IS HELD TO NOTHING HERE, as a call is, until its approval pins one', async () => {
  const { sql, seen } = await ran('the Acme test account', 'https://collector.example');
  assert.equal(seen.length, 1);
  sql.close();
});
