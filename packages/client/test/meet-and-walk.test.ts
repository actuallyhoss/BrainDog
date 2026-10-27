/**
 * `meet` with the contract's input and answer, and `page` asking a forecast to walk further.
 *
 * `fetch` is a stand-in, as in `writes.test.ts`: what is held is what goes on the wire.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type Met } from '../src/index.ts';

function recording(value: unknown) {
  const seen: { url: URL; method: string; body: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: new URL(String(input)), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify({ ok: true, value }));
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

test('MEET SENDS WHAT IT IS TOLD, an organisation by its keys among it, and reads the row back by name', async () => {
  const answer: Met = { row: { register: 'organisations', id: 'O3', seq: 3, name: 'Chillout' }, created: false, matched_by: 'key', confidence: 1 };
  const net = recording(answer);
  const c = createClient({ base: 'https://braindog.example', fetch: net.fetch });
  const out = await c.meet({ name: 'Chillout', kind: 'organisation', keys: ['bank:GEIDEA*CHILLOUT'], source: 'bank text' });
  assert.deepEqual(net.seen.map((s) => [s.url.pathname, s.method, s.body]), [
    ['/api/meet', 'POST', { name: 'Chillout', kind: 'organisation', keys: ['bank:GEIDEA*CHILLOUT'], source: 'bank text' }],
  ]);
  assert.ok(out.ok);
  assert.equal(out.value.row?.name, 'Chillout');
  assert.equal(out.value.matched_by, 'key');
});

test('PAGE ASKS A LONGER WALK AS TEXT, in days or to the last bill, and asks none when not told to', async () => {
  const net = recording({ blocks: [] });
  const c = createClient({ base: 'https://braindog.example', fetch: net.fetch });
  await c.page('money');
  await c.page('money', { project: 'oxbow' }, { walk: 1825 });
  await c.page('money', undefined, { walk: 'last' });
  const asked = net.seen.map((s) => [s.url.searchParams.get('slug'), s.url.searchParams.get('walk'), s.url.searchParams.get('filter')]);
  assert.deepEqual(asked, [
    ['money', null, null],
    ['money', '1825', '{"project":"oxbow"}'],
    ['money', 'last', null],
  ]);
});
