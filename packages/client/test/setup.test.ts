/**
 * `setup`, the first run as one call (USE-B04): a POST of the body as handed, answered `{ done, failed }`. A host with
 * no such call is the one answer that throws, so the page that falls back for a release catches that and nothing else.
 *
 * `fetch` is a stand-in; `packages/host/test/setup-route.test.ts` is where the route meets a record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NO_SUCH_CALL, NoSuchCall, createClient, isNoSuchCall } from '../src/index.ts';

function host(status: number, answer: unknown) {
  const seen: { path: string; method: string; body: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      path: new URL(String(input)).pathname,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(answer), { status });
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}
const client = (net: ReturnType<typeof host>) => createClient({ base: 'https://braindog.example', fetch: net.fetch });

test('setup is one POST of the body as handed, and answers what was done and what was not', async () => {
  const value = { done: ['work', 'people', 'me'], failed: [{ part: 'money', why: 'Money needs a currency first.' }] };
  const net = host(200, { ok: true, value });
  const body = { usecase: 'founder', packs: ['work', 'people', 'money'], me: { name: 'Sam', email: 'sam@example.com' }, names: { tasks: 'jobs' } };
  const out = await client(net).setup(body);
  assert.deepEqual(out, { ok: true, value });
  assert.deepEqual(net.seen, [{ path: '/api/setup', method: 'POST', body }]);
});

test('a file goes in again, a part at a time, each its own POST', async () => {
  const net = host(200, { ok: true, value: { done: ['rows'], failed: [] } });
  const c = client(net);
  await c.setup({ again: true, rows: [{ list: 'tasks', values: { title: 'One' } }] });
  await c.setup({ again: true, rows: [{ list: 'tasks', values: { title: 'Two' } }] });
  assert.deepEqual(net.seen.map((s) => [s.method, (s.body as { again: boolean }).again]), [['POST', true], ['POST', true]]);
});

test('a refusal from the record is a value, as every other answer is', async () => {
  const refusal = { code: 'LEVEL_REQUIRED', fix: 'Only an owner sets this record up.', at: 'principal' };
  const out = await client(host(403, { ok: false, refusal })).setup({ me: { name: 'Sam' } });
  assert.equal(out.ok, false);
  assert.equal(!out.ok && 'refusal' in out && out.refusal.code, 'LEVEL_REQUIRED');
});

test('a record that says a part of it is not in this build has answered: that is a value, and nothing falls back', async () => {
  const refusal = { code: 'NOT_IN_THIS_BUILD', fix: 'This deployment does not keep backups you can take from the app yet.', at: 'host' };
  const out = await client(host(501, { ok: false, refusal })).setup({ me: { name: 'Sam' } });
  assert.equal(!out.ok && 'refusal' in out && out.refusal.code, 'NOT_IN_THIS_BUILD');
});

for (const [what, status, code, at] of [
  ['an older host, with no such route', 404, 'ROUTE_UNKNOWN', undefined],
  ['a host over a record without the method', 501, 'NOT_IN_THIS_BUILD', 'setup'],
] as const)
  test(`${what}: setup throws NO_SUCH_CALL, which a caller can tell from anything else`, async () => {
    const refusal = { code, fix: 'There is no method called setup.', ...(at ? { at } : {}) };
    let caught: unknown;
    try {
      await client(host(status, { ok: false, refusal })).setup({ me: { name: 'Sam' } });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof NoSuchCall, `it answered instead of throwing: ${String(caught)}`);
    assert.equal(caught.name, NO_SUCH_CALL);
    assert.equal(caught.code, 'NO_SUCH_CALL');
    assert.equal(caught.call, 'setup');
    assert.equal(caught.refusal.code, code);
    assert.ok(isNoSuchCall(caught));
    assert.equal(isNoSuchCall(new Error('offline')), false);
    assert.doesNotMatch(caught.message, /—/u);
  });

test('a host nobody can reach is not NO_SUCH_CALL: nothing falls back on a dropped connection', async () => {
  const fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof globalThis.fetch;
  const out = await createClient({ base: 'https://braindog.example', fetch }).setup({ me: { name: 'Sam' } });
  assert.equal(out.ok, false);
});
