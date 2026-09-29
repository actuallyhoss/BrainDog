/**
 * The Worker's `boot` says `host: 'cloud'`, through `Record$` as it ships.
 *
 * WHY THE HOST SAYS IT AND THE CLIENT DOES NOT GUESS. Billing told the Cloud from a self-host by whether
 * `/api/inbound/mint` answered 404, because `boot` named the record and the
 * caller and nothing about the host. `packages/record` now copies `Build.host` onto `boot`, and leaves the key out when
 * the host names none, so a Worker that forgot to name itself would answer a `boot` with no `host` and every reader
 * would fall back to the guess. This holds the Worker to naming itself.
 *
 * DRIVEN THROUGH THE OBJECT AND NOT READ AS TEXT, because the value is only worth anything as it reaches the answer:
 * `src/index.ts` is bundled by `bundled-worker.ts` and the record runs over `objectStorage()`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled, objectStorage } from './bundled-worker.ts';

const ORIGIN = 'https://app.example.test';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

test('THE WORKER\'S boot SAYS host cloud, so a client reads the host rather than inferring it from a 404', async () => {
  const { Record$ } = await bundled();
  const env: Record<string, unknown> = { PUBLIC_HOST: 'app.example.test', INGRESS: { send: async () => {} } };
  const state = { storage: objectStorage(), id: { toString: () => REC }, blockConcurrencyWhile: (f: () => unknown) => f(), waitUntil: () => {} };
  const object = new Record$(state, env);
  const made = await object.create({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.test', name: 'Ada' } });
  assert.equal(made, null, `the record was not made: ${JSON.stringify(made)}`);

  const owner = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
  const res = await object.fetch(
    new Request(`${ORIGIN}/api/boot`, { headers: { 'sec-fetch-site': 'same-origin', 'x-braindog-ctx': JSON.stringify(owner) } }),
  );
  const body = (await res.json()) as { ok: boolean; value?: { host?: unknown }; refusal?: unknown };
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.ok, JSON.stringify(body));
  assert.equal(body.value?.host, 'cloud', `boot names no host, or the wrong one: ${JSON.stringify(body.value?.host)}`);
});
