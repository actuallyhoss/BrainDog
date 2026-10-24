/**
 * A version that moved over some lists drops only what the tab kept over them (scope 2026-10-24 A15): a write to tasks
 * asks again what was read over tasks, and what was read over other lists stays kept. A read over anything but one list
 * (a page), and every read when the record cannot say what moved, is asked again, as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, forgetSchemas, keepReads } from '../src/index.ts';

function host() {
  const state = { version: 4, moved: null as string[] | null, sinces: [] as (string | null)[] };
  const asked: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const name = url.pathname.replace(/^\/api\//, '');
    if (name === 'version') {
      state.sinces.push(url.searchParams.get('since'));
      const since = url.searchParams.get('since');
      return Response.json({ ok: true, value: { version: state.version, ...(since === null ? {} : { moved: state.moved }) } });
    }
    asked.push(`${name}:${url.searchParams.get('register') ?? url.searchParams.get('slug') ?? ''}`);
    if (name === 'page') return Response.json({ ok: true, value: { slug: url.searchParams.get('slug'), blocks: [{ kind: 'table', rows: [] }] } });
    return Response.json({ ok: true, value: { rows: [{ n: asked.length }] } });
  }) as typeof globalThis.fetch;
  return { fetch, asked, state };
}

const kept = async (fn: () => Promise<void>) => {
  forgetSchemas();
  keepReads(true);
  try {
    await fn();
  } finally {
    keepReads(false);
    forgetSchemas();
  }
};

test('A WRITE TO TASKS ASKS AGAIN ONLY WHAT WAS READ OVER TASKS, and a page over anything is asked again', () =>
  kept(async () => {
    const h = host();
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    await c.version();
    await Promise.all([c.list({ register: 'tasks' }), c.list({ register: 'notes' }), c.get('notes', 1), c.page('money')]);
    h.asked.length = 0;
    h.state.version = 9;
    h.state.moved = ['tasks'];
    await c.version();
    assert.equal(h.state.sinces.at(-1), '4', 'the version heard last was not asked about');
    await Promise.all([c.list({ register: 'tasks' }), c.list({ register: 'notes' }), c.get('notes', 1), c.page('money')]);
    assert.deepEqual(h.asked.sort(), ['list:tasks', 'page:money']);
  }));

test('WHEN THE RECORD CANNOT SAY WHAT MOVED, everything kept is asked again', () =>
  kept(async () => {
    const h = host();
    const c = createClient({ base: 'https://a.example', fetch: h.fetch });
    await c.version();
    await c.list({ register: 'notes' });
    h.asked.length = 0;
    h.state.version = 9;
    h.state.moved = null;
    await c.version();
    await c.list({ register: 'notes' });
    assert.deepEqual(h.asked, ['list:notes']);
  }));

test('OFF, the version is asked about nothing', async () => {
  forgetSchemas();
  const h = host();
  const c = createClient({ base: 'https://a.example', fetch: h.fetch });
  await c.version();
  await c.version();
  assert.deepEqual(h.state.sinces, [null, null]);
});
