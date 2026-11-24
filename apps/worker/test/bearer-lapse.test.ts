/**
 * A bearer on a record whose billing has lapsed, through the Worker: what `bearerOf`'s lapse (`session.ts`, `lapseOf` and
 * the `/mcp` branch) answers today, so a door that moves into the record has to answer the same.
 *
 * THE LAPSE IS THE DIRECTORY'S ROW (`dir_billing`, state `lapsed`), written here the way the webhook writes it, and read by
 * the Worker as it reads it for every bearer (`bearerDeps`' `lapsed`). The Worker keeps that answer for a minute
 * (`directoryKept`), so the row is written before the first bearer call and the kept answers are cleared after it.
 *
 * WHAT IS PINNED, ON `/api`: a write is 403 in the lapse's sentence at `billing` and the record is never asked; a read is
 * answered at `read` whatever the token's scope and the person's level; a token's export is a write like any other and is
 * refused; and an operation grant approved for `export` (how `braindog export` takes it) exports whole. ON `/mcp`: a write
 * tool is the same 403 and the record is never asked, while a read tool and the listing are answered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { LAPSED_FIX } from '../src/lapse.ts';
import { cloud, ORIGIN } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';
const SLUG = 'studio';
/* A TEST KEY, MADE HERE AND NEVER A DEPLOYMENT'S. */
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const LAPSED = { code: 'FORBIDDEN', fix: LAPSED_FIX, at: 'billing' };

type Out = { ok: boolean; value?: any; refusal?: { code: string; fix: string; at?: string } };

/**
 * A record its owner pays for, with a write key and an `export` grant handed out while it was paid for, and then lapsed.
 * `asked` counts the record object's `fetch`, where every method runs, so a refusal at the door is seen to ask nothing.
 */
async function lapsed() {
  const c = await cloud({ KEK });
  const store = (await keyStoreOf(KEK)) ?? assert.fail('no key store');
  const person = await c.provision(REC, SLUG, OWNER, { keys: await recordKeys(store, REC) });
  const cookie = await c.signIn(OWNER);
  const minted = (await (await c.ask('/api/createToken', { method: 'POST', cookie, body: JSON.stringify({ scope: 'write', label: 'agent' }) })).json()) as Out;
  assert.ok(minted.ok, JSON.stringify(minted));
  const bearer = minted.value.bearer as string;

  /* THE GRANT BEFORE THE LAPSE: approving it is a write, which a lapsed record refuses the owner's session too. */
  const object = c.record(REC) as any;
  const started = await object.deviceStart({ reach: 'export', label: 'test-box · braindog-cli' }, '203.0.113.7');
  const looked = (await (await c.ask('/api/deviceLook', { method: 'POST', cookie, body: JSON.stringify({ user_code: started.value.user_code }) })).json()) as Out;
  assert.ok(looked.ok, JSON.stringify(looked));
  const approved = await c.ask('/api/deviceApprove', { method: 'POST', cookie, body: JSON.stringify({ user_code: started.value.user_code, handle: looked.value.handle }) });
  assert.equal(approved.status, 200, await approved.clone().text());
  const polled = (await object.devicePoll({ device_code: started.value.device_code })) as Out;
  assert.ok(polled.ok, JSON.stringify(polled));

  /* THE LAPSE, AS A VERIFIED STRIPE EVENT LEAVES IT, and nothing the Worker kept from before it. */
  const set = (c.directory as any).billing({ op: 'set', row: { record: REC, person, customer: 'cus_1', state: 'lapsed' } }) as Out;
  assert.ok(set.ok, JSON.stringify(set));
  assert.equal(await (c.directory as any).billing({ op: 'lapsed', record: REC }), true);
  (c.bundle as any).directoryKept.clear();

  const through = object.fetch.bind(object);
  const seen = { asked: 0 };
  object.fetch = (request: Request) => {
    seen.asked += 1;
    return through(request);
  };
  return { c, person, bearer, grant: polled.value.bearer as string, seen };
}

/** One JSON-RPC message to `/mcp`, as an agent sends it: a POST of JSON with its bearer and no `Origin`. */
const mcp = (c: Awaited<ReturnType<typeof cloud>>, bearer: string, message: object) =>
  c.bundle.default.fetch(
    new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...message }) }),
    c.env,
    { waitUntil: () => {} },
  );

test('ON A LAPSED RECORD A BEARER’S /api WRITE IS 403 IN THE LAPSE’S SENTENCE, AT billing, AND THE RECORD IS NOT ASKED', async () => {
  const { c, bearer, seen } = await lapsed();
  const res = await c.ask('/api/create', { method: 'POST', bearer, body: JSON.stringify({ register: 'tasks', fields: { title: 'After the lapse' } }) });
  const out = (await res.json()) as Out;
  assert.equal(res.status, 403, JSON.stringify(out));
  assert.deepEqual(out, { ok: false, refusal: LAPSED });
  assert.equal(seen.asked, 0, 'the record was asked to answer a write the lapse refuses');

  /* THE LAPSE IS READ AFTER THE SECRET (`lapseOf`), so a bearer nobody issued is the 401 it is on a paid record. */
  const forged = await c.ask('/api/create', { method: 'POST', bearer: `${REC}.${'f'.repeat(43)}`, body: JSON.stringify({ register: 'tasks', fields: { title: 'Forged' } }) });
  const text = await forged.text();
  assert.equal(forged.status, 401, text);
  assert.deepEqual(JSON.parse(text), { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'unauthorized' } });
});

test('AND ITS READS ARE ANSWERED AT read: a write key held by the owner says scope read and level read', async () => {
  const { c, person, bearer, seen } = await lapsed();
  const res = await c.ask('/api/whoami', { bearer });
  const out = (await res.json()) as Out;
  assert.equal(res.status, 200, JSON.stringify(out));
  assert.equal(seen.asked, 1);
  assert.deepEqual([out.value?.kind, out.value?.person, out.value?.scope, out.value?.level], ['token', person, 'read', 'read']);
});

test('A TOKEN’S EXPORT ON A LAPSED RECORD IS A WRITE AND IS REFUSED, AND THE OWNER’S export GRANT EXPORTS WHOLE', async () => {
  const { c, bearer, grant, seen } = await lapsed();
  /* AN EXPORT IS AN OWNER'S METHOD, so a token on a lapsed record is answered as any other write (`mayWrite`). */
  const refused = await c.ask('/api/export', { method: 'POST', bearer, body: '{}' });
  const said = (await refused.json()) as Out;
  assert.equal(refused.status, 403, JSON.stringify(said));
  assert.deepEqual(said, { ok: false, refusal: LAPSED });
  assert.equal(seen.asked, 0);

  /* THE GRANT'S CONTEXT GOES ON UNCAPPED (`underLapse`): held to `read`, the record would refuse its owner's method. */
  const exported = await c.ask('/api/export', { method: 'POST', bearer: grant, body: '{}' });
  const out = (await exported.json()) as { ok: boolean; value?: string[] };
  assert.equal(exported.status, 200, JSON.stringify(out));
  assert.ok((out.value ?? []).some((l) => l.startsWith('#table dog_sig')), 'the answer is not a file');
  assert.equal(seen.asked, 1);
});

test('ON /mcp A WRITE TOOL IS THE SAME 403 AND THE RECORD IS NOT ASKED, while a read tool and the listing are answered', async () => {
  const { c, person, bearer, seen } = await lapsed();
  const write = await mcp(c, bearer, { method: 'tools/call', params: { name: 'create', arguments: { register: 'tasks', fields: { title: 'After the lapse' } } } });
  const said = (await write.json()) as Out;
  assert.equal(write.status, 403, JSON.stringify(said));
  /* THE /api SHAPE AND NOT JSON-RPC'S: the door answers it before the record reads the message (`agent` in `index.ts`). */
  assert.deepEqual(said, { ok: false, refusal: LAPSED });
  assert.equal(seen.asked, 0, 'the record was asked to answer a write tool the lapse refuses');

  /* THE LISTING IS ANSWERED UNDER THE CAPPED CONTEXT, so a write key on a lapsed record is offered the read tools only. */
  const listed = await mcp(c, bearer, { method: 'tools/list' });
  const tools = (await listed.json()) as { result?: { tools?: { name: string; annotations?: { readOnlyHint?: boolean } }[] }; error?: unknown };
  assert.equal(listed.status, 200, JSON.stringify(tools));
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  assert.ok(names.includes('record_index') && names.includes('list'), names.join(' '));
  assert.ok(!names.includes('create'), `a write tool was offered on a lapsed record: ${names.join(' ')}`);
  assert.ok((tools.result?.tools ?? []).every((t) => t.annotations?.readOnlyHint === true), names.join(' '));

  const read = await mcp(c, bearer, { method: 'tools/call', params: { name: 'record_index', arguments: {} } });
  const answer = (await read.json()) as { result?: { isError?: boolean }; error?: unknown };
  assert.equal(read.status, 200, JSON.stringify(answer));
  assert.equal(answer.error, undefined, JSON.stringify(answer));
  assert.notEqual(answer.result?.isError, true, JSON.stringify(answer));
  assert.equal(seen.asked, 2);

  /* AND THE SAME KEY ON THE RECORD PAID FOR AGAIN IS OFFERED THE WRITES, so the listing above is the cap and not the key. */
  const paid = (c.directory as any).billing({ op: 'set', row: { record: REC, person, customer: 'cus_1', state: 'active' } }) as Out;
  assert.ok(paid.ok, JSON.stringify(paid));
  (c.bundle as any).directoryKept.clear();
  const again = (await (await mcp(c, bearer, { method: 'tools/list' })).json()) as { result?: { tools?: { name: string }[] } };
  assert.ok((again.result?.tools ?? []).some((t) => t.name === 'create'), JSON.stringify(again));
});
