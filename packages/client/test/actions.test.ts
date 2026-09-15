/**
 * `actions()` and `resumeAction(name)`: the verb and the arguments each sends, read from the route table.
 *
 * `fetch` is a stand-in; `apps/selfhost/test/client.test.ts` is where the client meets a real server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type ActionRow } from '../src/index.ts';

function recording(value: unknown) {
  const seen: { url: string; method: string; body: string | undefined }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined });
    return new Response(JSON.stringify({ ok: true, value }));
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

test('actions() IS A GET of /api/actions with nothing in the query, and answers the rows', async () => {
  const row: ActionRow = {
    ingest: 'balance',
    channel: 'poll',
    project: null,
    host: 'api.example.test',
    every: '1h',
    key: 'example read',
    state: 'paused',
    next: null,
    last: { at: '2026-09-15T12:00:00Z', outcome: 'paused', status: 401, note: 'api.example.test refused the key "example read".' },
    month: { runs: 1, requests: 1, bytes: 0, failures: 1, held: 0 },
    days: [{ day: '2026-09-15', runs: 1, requests: 1, bytes: 0, failures: 1 }],
  };
  const net = recording([row]);
  const out = await createClient({ base: 'https://braindog.example/', fetch: net.fetch }).actions();
  assert.ok(out.ok);
  assert.deepEqual(out.value, [row]);
  assert.deepEqual(net.seen, [{ url: 'https://braindog.example/api/actions', method: 'GET', body: undefined }]);
});

test('resumeAction(name) IS A POST of the name, because the route table says it writes', async () => {
  const net = recording({ ingest: 'balance', kind: 'poll' });
  const out = await createClient({ base: 'https://braindog.example', fetch: net.fetch }).resumeAction('balance');
  assert.ok(out.ok);
  assert.deepEqual(out.value, { ingest: 'balance', kind: 'poll' });
  assert.deepEqual(net.seen, [{ url: 'https://braindog.example/api/resumeAction', method: 'POST', body: '{"ingest":"balance"}' }]);
});
