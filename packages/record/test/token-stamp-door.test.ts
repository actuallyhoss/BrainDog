/**
 * Who may say which app a key is for, and which labels are the record's own.
 *
 * THE STAMP IS THE OAUTH DOOR'S WORD AND NOBODY ELSE'S. `createToken` took a caller's `client` as it came, so a CLI holding
 * a `token` grant (or a browser session) minted a key Settings listed as "BrainDog checked that this app is claude.ai".
 * Now only a context the OAuth door built (`door: 'oauth'`) keeps it; anyone else's key is made, unstamped.
 *
 * `job:` IS A JOB'S BEARER, which only `claimJob` makes: a key labelled so by hand dropped out of the agents list, had its
 * runs counted to the job and was revoked when the job ended. It is refused as `report:` is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 30, 9);
const OWNER_ID = 'p_owner';
const STAMP = { id: 'https://claude.ai/oauth/client.json', kind: 'cimd', host: 'claude.ai' } as const;

type Out = { ok: boolean; value?: { id: string }; refusal?: { code: string; at?: string } };

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'orchardline', name: 'Orchardline', tz: 'UTC', locale: 'en', owner: { id: OWNER_ID } }).ok);
  const session: CallContext = { principal: { kind: 'person', id: OWNER_ID, level: 'owner' }, credentialed: true, provedAt: NOW };
  const stampOf = (id: string) => api.kernel.listTokens().find((t) => t.id === id)?.client ?? null;
  return { api, session, stampOf };
}

test('A CALLER’S OWN client IS DROPPED: the key is made, and is not stamped as the app it named', async () => {
  const { api, session, stampOf } = await record();
  for (const ctx of [session, { ...session, operation: 'createToken' }] as CallContext[]) {
    const out = (await api.createToken({ scope: 'write', label: 'laptop', days: 30, client: STAMP } as never, ctx)) as Out;
    assert.ok(out.ok, JSON.stringify(out));
    assert.equal(stampOf(out.value!.id), null, 'a caller stamped its own key as claude.ai');
  }
});

test('THE OAUTH DOOR’S client IS KEPT', async () => {
  const { api, session, stampOf } = await record();
  const out = (await api.createToken({ scope: 'read', label: 'Claude', days: 365, client: STAMP } as never, { ...session, door: 'oauth' })) as Out;
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(stampOf(out.value!.id), STAMP);
});

test('A LABEL THAT BEGINS job: IS REFUSED, by hand and for a person’s own key, as report: is', async () => {
  const { api, session } = await record();
  for (const label of ['job:j_01JZ8QK3F7R2M9V4XN6TCB5HAD', ' job:j_x', 'report:payroll']) {
    const out = (await api.createToken({ scope: 'write', label, days: 30 } as never, session)) as Out;
    assert.equal(out.ok, false, label);
    assert.equal(out.refusal?.at, 'label', label);
  }
  const own = (await api.createOwnToken({ name: 'job:j_x', scope: 'write' }, session)) as Out;
  assert.equal(own.ok, false);
  assert.equal(own.refusal?.at, 'name');
  assert.equal(api.kernel.listTokens().length, 0, 'a refused label left a key behind');
});
