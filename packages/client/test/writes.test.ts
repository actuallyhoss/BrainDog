/**
 * The settings writes: each is a POST of exactly the arguments it was handed, because the route table says it writes.
 *
 * `fetch` is a stand-in; `apps/selfhost/test/client.test.ts` is where the client meets a real server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '../src/index.ts';

function recording(value: unknown) {
  const seen: { path: string; method: string; body: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      path: new URL(String(input)).pathname,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify({ ok: true, value }));
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

test('every settings write is a POST of its own arguments, to its own method', async () => {
  const net = recording(null);
  const c = createClient({ base: 'https://braindog.example', fetch: net.fetch });
  await c.invite({ person: 'p_2', level: 'read', registers: { payroll: 'write' }, why: 'bookkeeping' });
  await c.removeMember({ person: 'p_2' });
  await c.createToken({ scope: 'write', label: 'laptop', days: 90 });
  await c.revokeToken({ id: 'tok_1' });
  await c.installPack({ doc: { manifest: {} }, source: { kind: 'local' }, planHash: 'h1', approve: ['line'] });
  await c.uninstallPack({ id: 'work' });
  await c.setPackConfig({ id: 'work', values: { lead_time: null } });
  await c.export({ sections: ['header', 'governance'] });
  assert.deepEqual(net.seen, [
    { path: '/api/invite', method: 'POST', body: { person: 'p_2', level: 'read', registers: { payroll: 'write' }, why: 'bookkeeping' } },
    { path: '/api/removeMember', method: 'POST', body: { person: 'p_2' } },
    { path: '/api/createToken', method: 'POST', body: { scope: 'write', label: 'laptop', days: 90 } },
    { path: '/api/revokeToken', method: 'POST', body: { id: 'tok_1' } },
    { path: '/api/installPack', method: 'POST', body: { doc: { manifest: {} }, source: { kind: 'local' }, planHash: 'h1', approve: ['line'] } },
    { path: '/api/uninstallPack', method: 'POST', body: { id: 'work' } },
    { path: '/api/setPackConfig', method: 'POST', body: { id: 'work', values: { lead_time: null } } },
    { path: '/api/export', method: 'POST', body: { sections: ['header', 'governance'] } },
  ]);
});

test('packConfig is a read, so a GET with the id in the query', async () => {
  const net = recording({ id: 'work', version: null, config: {}, values: {} });
  const out = await createClient({ base: 'https://braindog.example', fetch: net.fetch }).packConfig({ id: 'work' });
  assert.ok(out.ok);
  assert.deepEqual(net.seen, [{ path: '/api/packConfig', method: 'GET', body: undefined }]);
});

test('backups, erasure and deletion: the list is a GET, and every other one a POST of its own arguments', async () => {
  const net = recording(null);
  const c = createClient({ base: 'https://braindog.example', fetch: net.fetch });
  await c.snapshot();
  await c.snapshots();
  await c.restore({ bookmark: '2026-09-16T12-00-00Z-now' });
  await c.erase({ subjects: ['Mara Quill'], personId: 'p_2', basis: 'Article 17 request' });
  await c.deleteRecord({ slug: 'the-studio' });
  assert.deepEqual(net.seen, [
    { path: '/api/snapshot', method: 'POST', body: {} },
    { path: '/api/snapshots', method: 'GET', body: undefined },
    { path: '/api/restore', method: 'POST', body: { bookmark: '2026-09-16T12-00-00Z-now' } },
    { path: '/api/erase', method: 'POST', body: { subjects: ['Mara Quill'], personId: 'p_2', basis: 'Article 17 request' } },
    { path: '/api/deleteRecord', method: 'POST', body: { slug: 'the-studio' } },
  ]);
});

test('a read whose arguments are too long for an address goes as a POST of the same arguments', async () => {
  const net = recording(null);
  const c = createClient({ base: 'https://braindog.example', fetch: net.fetch });
  const doc = { pack: 'big', notes: 'x'.repeat(7000) };
  await c.planPack({ doc });
  await c.planPack({ doc: { pack: 'small' } });
  assert.deepEqual(net.seen, [
    { path: '/api/planPack', method: 'POST', body: { doc } },
    { path: '/api/planPack', method: 'GET', body: undefined },
  ]);
});
