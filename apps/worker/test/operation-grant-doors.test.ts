/**
 * An operation grant is spent by the one request it was minted for, and a request that was never going to be answered
 * leaves it where it was (the Cloud half).
 *
 * MEASURED BEFORE THIS FILE, through the bundle. `bearerOf` spent the grant as soon as the path named one of the four
 * operations, and asked nothing else first. A `GET /api/export` spent it and was then answered 405 by the router, "export
 * changes the record, so it is a POST.", and the `POST` that followed was 401. A `POST /app/elsewhere/api/export` spent it
 * and was then answered 403 by the slug check, and the same `POST` at the record's own name was 401. Nothing was lost but
 * the approval, which the person had to give again on their phone for a request they never got to make.
 *
 * EACH TEST PRESENTS THE GRANT WRONGLY AND THEN RIGHTLY, and the right one has to export. That is the whole claim: a
 * refusal before the grant is read is the only kind that keeps it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OTHER = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const OWNER = 'ada@example.test';
const SLUG = 'studio';
/* A TEST KEY, MADE HERE AND NEVER A DEPLOYMENT'S. */
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

/** Two records, `studio` and `elsewhere`, and an `export` bearer for `studio` that its owner approved. */
async function granted() {
  const c = await cloud({ KEK });
  const store = (await keyStoreOf(KEK)) ?? assert.fail('no key store');
  const person = await c.provision(REC, SLUG, OWNER, { keys: await recordKeys(store, REC) });
  await c.provision(OTHER, 'elsewhere', 'grace@example.test', { keys: await recordKeys(store, OTHER) });
  const object = c.record(REC);
  const started = (await object.deviceStart({ reach: 'export', label: 'test-box · braindog-cli' }, '203.0.113.7')) as { ok: boolean; value: { user_code: string; device_code: string } };
  assert.ok(started.ok, JSON.stringify(started));
  const owner = { principal: { kind: 'person', id: person, level: 'owner' }, credentialed: true, provedAt: Date.now() };
  const looked = await object.fetch(
    new Request('https://app.example.test/api/deviceLook', {
      method: 'POST',
      headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
      body: JSON.stringify({ user_code: started.value.user_code }),
    }),
  );
  const handle = ((await looked.json()) as { value: { handle: string } }).value.handle;
  const approved = await object.fetch(
    new Request('https://app.example.test/api/deviceApprove', {
      method: 'POST',
      headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
      body: JSON.stringify({ user_code: started.value.user_code, handle }),
    }),
  );
  assert.equal(approved.status, 200, await approved.clone().text());
  const polled = (await object.devicePoll({ device_code: started.value.device_code })) as { ok: boolean; value: { bearer: string } };
  assert.ok(polled.ok && polled.value.bearer, JSON.stringify(polled));
  return { c, bearer: polled.value.bearer };
}

/** A POST that exported: 200 and a signed file. */
async function exported(res: Response): Promise<void> {
  const out = (await res.json()) as { ok: boolean; value?: string[] };
  assert.equal(res.status, 200, `the grant was gone by the time the right request came: ${JSON.stringify(out)}`);
  assert.ok((out.value ?? []).some((l) => l.startsWith('#table dog_sig')), 'the answer is not a file');
}

test('A GET TO /api/export IS REFUSED AND DOES NOT SPEND THE GRANT, so the POST after it exports', async () => {
  const { c, bearer } = await granted();
  const wrong = await c.ask('/api/export', { bearer });
  /* 401 AND NOT THE ROUTER'S 405: the Worker cannot say whether this is a grant without spending it, so it says what
     it says to any bearer the token table does not know. */
  assert.equal(wrong.status, 401, await wrong.clone().text());
  assert.equal(c.events(REC, 'export'), 0, 'a GET exported');
  await exported(await c.ask('/api/export', { method: 'POST', bearer, body: '{}' }));
});

test('A GRANT PRESENTED UNDER ANOTHER RECORD\'S NAME, OR A NAME NOBODY HOLDS, IS REFUSED AND NOT SPENT', async () => {
  const { c, bearer } = await granted();
  for (const slug of ['elsewhere', 'nobody-here']) {
    const wrong = await c.ask(`/${slug}/api/export`, { method: 'POST', bearer, body: '{}' });
    /* 401 AND NOT `heldBy`'s 403, for the reason `bearerOf` gives: a 403 before the secret is checked says which names
       are this record's to anybody holding its id. */
    assert.equal(wrong.status, 401, `/${slug}: ${await wrong.clone().text()}`);
  }
  assert.equal(c.events(REC, 'export'), 0);
  assert.equal(c.events(OTHER, 'export'), 0, 'the other record exported for a bearer it never issued');
  await exported(await c.ask(`/${SLUG}/api/export`, { method: 'POST', bearer, body: '{}' }));
});

test('THE GRANT IS STILL ONE USE: once the right request has spent it, the next is 401', async () => {
  const { c, bearer } = await granted();
  await exported(await c.ask('/api/export', { method: 'POST', bearer, body: '{}' }));
  assert.equal((await c.ask('/api/export', { method: 'POST', bearer, body: '{}' })).status, 401);
});
