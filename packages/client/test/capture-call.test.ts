/**
 * `capture({ rows, op_id })`, `pagesCensus()` and `checkPaths({ document })`: the verb, the address and the body each
 * sends, read from the route table, and the answer handed back as it came.
 *
 * `fetch` is a stand-in; `packages/host/test/capture-route.test.ts` and `census-routes.test.ts` are where the routes
 * meet a real record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '../src/index.ts';

function recording(value: unknown) {
  const seen: { url: string; method: string; body: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify({ ok: true, value }));
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

test('capture() IS A POST of /api/capture carrying the rows and the op_id, and answers the batch and what it made', async () => {
  const answer = { batch: 'b1', made: [{ register: 'tasks', seq: 1, title: 'A' }] };
  const net = recording(answer);
  const out = await createClient({ base: 'https://braindog.example/', fetch: net.fetch }).capture({
    rows: [{ register: 'tasks', fields: { what: 'A' } }],
    op_id: 'o1',
  });
  assert.ok(out.ok);
  assert.deepEqual(out.value, answer);
  assert.equal(net.seen.length, 1);
  assert.equal(net.seen[0]!.url, 'https://braindog.example/api/capture');
  assert.equal(net.seen[0]!.method, 'POST');
  assert.deepEqual(net.seen[0]!.body, { rows: [{ register: 'tasks', fields: { what: 'A' } }], op_id: 'o1' });
});

test('pagesCensus() IS A GET of /api/pagesCensus with nothing sent', async () => {
  const net = recording({ pages: [], totals: {} });
  const out = await createClient({ base: 'https://braindog.example/', fetch: net.fetch }).pagesCensus();
  assert.ok(out.ok);
  assert.deepEqual(net.seen, [{ url: 'https://braindog.example/api/pagesCensus', method: 'GET', body: undefined }]);
});

test('checkPaths() IS A POST, because a document can be long, and carries the document in the body', async () => {
  const answer = { paths: [{ path: 'name', named: true }, { path: 'nowhere', named: false }] };
  const net = recording(answer);
  const document = `${'A long note. '.repeat(400)}{{name}} and {{nowhere}}`;
  const out = await createClient({ base: 'https://braindog.example/', fetch: net.fetch }).checkPaths({ document });
  assert.ok(out.ok);
  assert.deepEqual(out.value, answer);
  assert.equal(net.seen[0]!.method, 'POST');
  assert.equal(net.seen[0]!.url, 'https://braindog.example/api/checkPaths');
  assert.deepEqual(net.seen[0]!.body, { document });
});
