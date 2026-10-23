/**
 * A record too busy to take a request (the Worker's 503 `RECORD_UNAVAILABLE`, its object's queue full) is asked again by
 * a read, twice at most, and never by a write; a failed schemas wave is never fanned out into one ask a list; Slash's
 * read says it is waiting. Measured on 23 Oct: one failed `schemas` became 28 `schema` asks into the same full queue.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { batchSchemas, busy, busyWaits, createClient, forgetSchemas } from '../src/index.ts';

const BUSY = { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'BrainDog is busy for a moment. Try again in a few seconds.', at: 'record', retry_after: 1 } };

/** A host that answers 503 busy `fails` times, then answers. */
function host(fails: number) {
  const asked: string[] = [];
  let left = fails;
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    asked.push(url.pathname.replace(/^\/api\//, ''));
    if (left > 0) {
      left -= 1;
      return Response.json(BUSY, { status: 503, headers: { 'retry-after': '1' } });
    }
    if (url.pathname === '/api/slash/read') return Response.json({ ok: true, value: { rows: [] } });
    return Response.json({ ok: true, value: { rows: [], next: null } });
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

const quick = async (fn: () => Promise<void>) => {
  forgetSchemas();
  busyWaits(() => 0);
  try {
    await fn();
  } finally {
    busyWaits(null);
    forgetSchemas();
  }
};

test('A READ ANSWERED 503 IS ASKED AGAIN, and lands on the try after', () =>
  quick(async () => {
    const h = host(2);
    const out = await createClient({ base: 'https://a.example', fetch: h.fetch }).list({ register: 'tasks' });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(h.asked, ['list', 'list', 'list']);
  }));

test('A READ STILL BUSY AFTER TWO MORE TRIES IS THE BUSY REFUSAL, never a crash to quote', () =>
  quick(async () => {
    const h = host(5);
    const out = await createClient({ base: 'https://a.example', fetch: h.fetch }).list({ register: 'tasks' });
    assert.equal(h.asked.length, 3);
    assert.equal(busy(out as Result<unknown>), true);
  }));

test('A WRITE ANSWERED 503 IS NOT SENT AGAIN, since it may have landed', () =>
  quick(async () => {
    const h = host(1);
    const out = await createClient({ base: 'https://a.example', fetch: h.fetch }).call('update', { register: 'tasks', seq: 1, values: { name: 'x' } });
    assert.equal(out.ok, false);
    assert.deepEqual(h.asked, ['update']);
  }));

test('SLASH\'S READ ASKS AGAIN WHILE BUSY, and tells the screen it is waiting', () =>
  quick(async () => {
    const h = host(1);
    let told = 0;
    const out = await createClient({ base: 'https://a.example', fetch: h.fetch }).slashRead('what is late', { busy: () => (told += 1) });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(told, 1);
    assert.deepEqual(h.asked, ['slash/read', 'slash/read']);
  }));

test('A SCHEMAS WAVE THE HOST COULD NOT ANSWER IS THAT ANSWER FOR EVERY LIST, and no list is asked by itself', () =>
  quick(async () => {
    batchSchemas(true);
    try {
      const asked: string[] = [];
      const fetch = (async (input: string | URL | Request) => {
        asked.push(new URL(String(input)).pathname.replace(/^\/api\//, ''));
        return Response.json({ ok: false, refusal: { code: 'INTERNAL', fix: 'crashed' } }, { status: 500 });
      }) as typeof globalThis.fetch;
      const c = createClient({ base: 'https://a.example', fetch });
      const outs = await Promise.all(['tasks', 'people', 'money'].map((r) => c.schema(r)));
      assert.ok(outs.every((o) => !o.ok));
      assert.deepEqual(asked, ['schemas']);
    } finally {
      batchSchemas(false);
    }
  }));
