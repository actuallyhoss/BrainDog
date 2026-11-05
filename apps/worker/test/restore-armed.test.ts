/**
 * A record armed to go back to a copy, reached through the Worker's real doors.
 *
 * MEASURED BEFORE THIS FILE, through the bundle. A restore answered by the record whose Worker invocation ended before
 * `reopen` left the object armed for good: `/api/boot` with the owner's cookie was 500 `INTERNAL` "This request could
 * not be answered: This record is going back to a copy..." three times running, nothing reset the object, and
 * `restore.pitr` was never written. Only an eviction ended it, and even then the log said nothing. And while a restore
 * was still in flight, every door that checks a credential by RPC first (`access` for a cookie, `operationGrant` for an
 * operation bearer, `signingKey` for a record's key) answered that same 500, where `Record$`'s own comments promise 503
 * `RECORD_UNAVAILABLE` and "starts again in a moment". A client told 500 has no reason to wait and ask again.
 *
 * WHAT THE HARNESS CANNOT SHOW IS THE REWIND ITSELF: the object that starts after `ctx.abort()` holds the rows it held
 * before (`cloud-harness.ts`). What is proved here is that the stranded object is reset, once, by the next request, and
 * that the event lands on the object that came back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';
const SLUG = 'studio';
/* A TEST KEY, MADE HERE AND NEVER A DEPLOYMENT'S. */
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

type Out = { ok: boolean; value?: { id?: string; bookmark?: string; kept?: string }; refusal?: { code: string; fix: string } };

/**
 * A keyed record with a signed-in owner, a copy to go back to, and an `export` operation bearer its owner approved.
 * `call` is the record's own door, which is how `forward` reaches it, with nothing of the Worker after it.
 */
async function ready() {
  const c = await cloud({ KEK });
  const store = (await keyStoreOf(KEK)) ?? assert.fail('no key store');
  const person = await c.provision(REC, SLUG, OWNER, { keys: await recordKeys(store, REC) });
  const cookie = await c.signIn(OWNER);
  const owner = { principal: { kind: 'person', id: person, level: 'owner' }, credentialed: true, provedAt: Date.now() };
  const call = (path: string, body: unknown) =>
    c.record(REC).fetch(
      new Request(`https://app.example.test${path}`, {
        method: 'POST',
        headers: { 'x-braindog-ctx': JSON.stringify(owner), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const started = (await c.record(REC).deviceStart({ reach: 'export', label: 'test-box · braindog-cli' }, '203.0.113.7')) as {
    ok: boolean;
    value: { user_code: string; device_code: string };
  };
  assert.ok(started.ok, JSON.stringify(started));
  const looked = await call('/api/deviceLook', { user_code: started.value.user_code });
  assert.equal(looked.status, 200, await looked.clone().text());
  const approved = await call('/api/deviceApprove', { user_code: started.value.user_code, handle: ((await looked.json()) as { value: { handle: string } }).value.handle });
  assert.equal(approved.status, 200, await approved.clone().text());
  const polled = (await c.record(REC).devicePoll({ device_code: started.value.device_code })) as { ok: boolean; value: { bearer: string } };
  assert.ok(polled.ok && polled.value.bearer, JSON.stringify(polled));
  const took = (await (await call('/api/snapshot', { label: 'now' })).json()) as Out;
  assert.ok(took.ok, JSON.stringify(took));
  return { ...c, cookie, call, bearer: polled.value.bearer, copy: String(took.value?.id) };
}

type Ready = Awaited<ReturnType<typeof ready>>;

/** The three doors that check by RPC before anything reaches the record's `fetch`, as a caller meets each one. */
const DOORS: [string, (c: Ready) => Promise<Response>][] = [
  ['a signed-in owner (access)', (c) => c.ask('/api/boot', { cookie: c.cookie })],
  ['an operation bearer (operationGrant)', (c) => c.ask('/api/export', { method: 'POST', bearer: c.bearer, body: '{}' })],
  ['the record\'s key (signingKey)', (c) => c.ask(`/${SLUG}/.well-known/braindog-key`)],
];

for (const [door, knock] of DOORS)
  test(`A RESTORE WHOSE WORKER NEVER CAME BACK IS FINISHED BY THE NEXT REQUEST, through ${door}, and the rewind is written down`, async () => {
    const c = await ready();
    /* THE WORKER'S CONTINUATION DROPPED: the record answers the restore and nothing calls `reopen` or `restored`, which
       is what a browser leaving the page, a CPU limit or a deploy between the two does to `forward`. */
    const restored = await c.call('/api/restore', { bookmark: c.copy });
    assert.equal(restored.status, 200, await restored.clone().text());
    assert.equal(c.storages.get(REC)?.pitr.armed.length, 1, 'the restore was never armed, so this case never ran');
    assert.deepEqual(c.log, [], 'something reset the object before any request came');

    const res = await knock(c);
    assert.equal(res.status, 200, `the stranded object was not reset by the request that found it: ${await res.clone().text()}`);
    assert.deepEqual(c.log, [`abort ${REC}`], 'the object armed to go back was not reset exactly once');
    assert.equal(c.events(REC, 'restore.pitr'), 1, 'the object came back and the log does not say it was restored');

    /* AND ONCE: the object that came back is armed with nothing, so the next request resets nothing and writes nothing. */
    assert.equal((await c.ask('/api/boot', { cookie: c.cookie })).status, 200);
    assert.deepEqual(c.log, [`abort ${REC}`]);
    assert.equal(c.events(REC, 'restore.pitr'), 1, 'the rewind was written twice');
  });

test('REQUESTS THAT FIND THE SAME STRANDED RECORD TOGETHER RESET IT ONCE AND WRITE THE REWIND ONCE', async () => {
  const c = await ready();
  /* A PAGE LOAD SENDS SEVERAL AT ONCE, and every one of them is told by `stranded` that the object is left behind. Only
     the first `reopen` ends it; the rest reach the object that came back and get `false`. Checked by mutation: with
     `recoverRestore` writing on a `false` as well, every other test in this file stayed green and this one counted 2. */
  const restored = await c.call('/api/restore', { bookmark: c.copy });
  assert.equal(restored.status, 200, await restored.clone().text());
  const answers = await Promise.all(DOORS.map(([, knock]) => knock(c)));
  for (const [i, res] of answers.entries()) assert.equal(res.status, 200, `${DOORS[i]?.[0] ?? ''}: ${await res.clone().text()}`);
  assert.deepEqual(c.log, [`abort ${REC}`], 'the object armed to go back was not reset exactly once');
  assert.equal(c.events(REC, 'restore.pitr'), 1, 'the rewind was written once per request that found it');
});

test('WHILE A RESTORE IS STILL IN FLIGHT EVERY DOOR ANSWERS 503 RECORD_UNAVAILABLE, not 500 INTERNAL, and resets nothing', async () => {
  const c = await ready();
  /* THE GAP A RESTORE LEAVES OPEN: `copies.ts` arms the bookmark and then puts its receipt to R2, and a request that
     arrives inside that put finds the object armed with its restore not yet answered. That object must not be reset,
     since the restore it is running would then fail, and it must say "ask again in a moment" in the words a client
     retries on. */
  const put = c.blobs.put.bind(c.blobs);
  const between: [string, Response][] = [];
  c.blobs.put = async (key, value, options) => {
    if (key.includes('/restore-')) for (const [door, knock] of DOORS) between.push([door, await knock(c)]);
    return put(key, value, options);
  };
  const res = await c.ask('/api/restore', { method: 'POST', cookie: c.cookie, body: JSON.stringify({ bookmark: c.copy }) });
  assert.equal(res.status, 200, await res.clone().text());
  c.blobs.put = put;
  assert.equal(between.length, DOORS.length, 'the receipt was never put, so nothing was sent in the gap');
  for (const [door, answer] of between) {
    const said = (await answer.json()) as Out;
    assert.equal(answer.status, 503, `${door} answered an armed record ${String(answer.status)}: ${JSON.stringify(said)}`);
    assert.equal(said.refusal?.code, 'RECORD_UNAVAILABLE', `${door}: ${JSON.stringify(said)}`);
  }
  /* AND THE RESTORE ITSELF FINISHED AS IT ALWAYS DID: one reset, by the Worker's own second half, and one event. */
  assert.deepEqual(c.log, [`abort ${REC}`]);
  assert.equal(c.events(REC, 'restore.pitr'), 1);
  /* THE GRANT WAS NOT SPENT BY THE 503, so the export it was minted for still runs. */
  const exported = await c.ask('/api/export', { method: 'POST', bearer: c.bearer, body: '{}' });
  assert.equal(exported.status, 200, `the grant was spent by a request answered 503: ${await exported.clone().text()}`);
});
