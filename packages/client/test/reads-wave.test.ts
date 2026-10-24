/**
 * Reads asked together are sent together (`batchReads`, `reads`): each asker is answered as its read alone would be, the
 * version poll never waits on a wave, a host without `reads` is asked one read a call from then on, one not reached is
 * asked one read a call now (the service worker's copy answers those offline), and a busy record is every read's answer,
 * never fanned out into the requests the wave saved (scope 2026-10-24 A12).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { batchReads, busyWaits, createClient, forgetSchemas } from '../src/index.ts';

const BUSY = { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'BrainDog is busy for a moment.', at: 'record', retry_after: 1 } };

type Mode = 'reads' | 'old' | 'busy' | 'down';

/** A host that answers each read by its list's name and `reads` as the record would, or as an older or failing one. */
function host(mode: Mode) {
  const asked: string[] = [];
  const one = (method: string, args: Record<string, unknown>) =>
    method === 'list' && args['register'] === 'nowhere'
      ? { status: 404, body: { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no list called nowhere.' } } }
      : { status: 200, body: { ok: true, value: { method, register: args['register'] ?? null, rows: [] } } };
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const name = url.pathname.replace(/^\/api\//, '');
    if (name === 'reads') {
      const calls = (JSON.parse(String(init?.body)) as { calls: { method: string; args: Record<string, unknown>; at?: string }[] }).calls;
      asked.push(`reads(${calls.map((c) => `${c.method}:${c.args['register'] ?? ''}`).join(',')})`);
      if (mode === 'old') return Response.json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called reads.' } }, { status: 404 });
      if (mode === 'busy') return Response.json(BUSY, { status: 503, headers: { 'retry-after': '1' } });
      if (mode === 'down') throw new TypeError('Failed to fetch');
      for (const c of calls) assert.equal(typeof c.at, 'string', 'a read sent in a wave carries the address it would have had');
      return Response.json({ ok: true, value: { answers: calls.map((c) => one(c.method, c.args)) } });
    }
    asked.push(`${name}:${url.searchParams.get('register') ?? ''}`);
    if (name === 'version') return Response.json({ ok: true, value: 7 });
    const got = one(name, Object.fromEntries(url.searchParams));
    return Response.json(got.body, { status: got.status });
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

const waved = async (fn: () => Promise<void>) => {
  forgetSchemas();
  busyWaits(() => 0);
  batchReads(true);
  try {
    await fn();
  } finally {
    batchReads(false);
    busyWaits(null);
    forgetSchemas();
  }
};

test('READS ASKED TOGETHER GO AS ONE, each answered as it would be alone, a refusal included', () =>
  waved(async () => {
    const h = host('reads');
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    const [tasks, nowhere, things] = await Promise.all([c.list({ register: 'tasks' }), c.list({ register: 'nowhere' }), c.list({ register: 'things' })]);
    assert.deepEqual(h.asked, ['reads(list:tasks,list:nowhere,list:things)']);
    assert.equal(tasks.ok && (tasks.value as unknown as { register: string }).register, 'tasks');
    assert.equal(things.ok && (things.value as unknown as { register: string }).register, 'things');
    assert.equal(!nowhere.ok && 'refusal' in nowhere && nowhere.refusal.code, 'REGISTER_UNKNOWN');
  }));

test('ONE READ BY ITSELF GOES AS IT ALWAYS DID, and the version poll never waits on a wave', () =>
  waved(async () => {
    const h = host('reads');
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    await c.list({ register: 'tasks' });
    await Promise.all([c.version(), c.list({ register: 'tasks', limit: 5 }), c.list({ register: 'things' })]);
    assert.deepEqual(h.asked, ['list:tasks', 'version:', 'reads(list:tasks,list:things)']);
  }));

test('OFF, every read is its own request', async () => {
  forgetSchemas();
  const h = host('reads');
  const c = createClient({ base: 'https://a.example', fetch: h.fetch });
  await Promise.all([c.list({ register: 'tasks' }), c.list({ register: 'things' })]);
  assert.deepEqual(h.asked.sort(), ['list:tasks', 'list:things']);
});

test('A HOST WITHOUT reads IS ASKED ONE READ A CALL, now and from then on', () =>
  waved(async () => {
    const h = host('old');
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    const both = await Promise.all([c.list({ register: 'tasks' }), c.list({ register: 'things' })]);
    assert.ok(both.every((r) => r.ok));
    await Promise.all([c.list({ register: 'tasks', limit: 2 }), c.list({ register: 'things', limit: 2 })]);
    assert.deepEqual(h.asked, ['reads(list:tasks,list:things)', 'list:tasks', 'list:things', 'list:tasks', 'list:things']);
  }));

test('A BUSY RECORD IS EVERY READ’S ANSWER, never fanned out into one request a read', () =>
  waved(async () => {
    const h = host('busy');
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    const both = await Promise.all([c.list({ register: 'tasks' }), c.list({ register: 'things' })]);
    assert.ok(both.every((r) => !r.ok && 'refusal' in r && r.refusal.code === 'RECORD_UNAVAILABLE'));
    assert.ok(h.asked.every((a) => a.startsWith('reads(')), h.asked.join(' '));
  }));

test('ONE NOT REACHED IS ASKED ONE READ A CALL NOW, which the copy answers offline', () =>
  waved(async () => {
    const h = host('down');
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    await Promise.all([c.list({ register: 'tasks' }), c.list({ register: 'things' })]);
    assert.deepEqual(h.asked, ['reads(list:tasks,list:things)', 'list:tasks', 'list:things']);
  }));
