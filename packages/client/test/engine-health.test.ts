/**
 * `client.engineHealth` ASKS THE RECORD WHETHER THE ENGINE'S MODEL ANSWERS (ENG-A02), as a read of the method
 * `engineHealth`, and hands back the record's answer: the state from the engine's own ledger and the one sentence a
 * person reads about it, or `null` from a host that hands the record no engine.
 *
 * WHY. Settings said "All healthy" on the day a model job died, and the status door named the model and nothing about
 * answers. A read token, the command line and the daily vital sign read this method, so its verb and its shape are
 * what keep them from saying healthy again over an engine that does not answer.
 *
 * A STAND-IN FETCH: the request and the shape handed back. The record's half is `packages/record/test/engine.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type EngineHealth } from '../src/index.ts';

function answering(value: unknown) {
  const sent: { method: string; path: string }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({ method: init?.method ?? 'GET', path: `${url.pathname}${url.search}` });
    return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { sent, client: createClient({ base: 'https://braindog.example', token: 'rec_01TEST.read', fetch }) };
}

test('A READ, a GET of engineHealth with nothing in the query, so a read token may ask it', async () => {
  const down: EngineHealth = {
    health: { state: 'not_answering', last_ok: '2026-10-05T21:14:00Z', since: '2026-10-06T03:00:00Z' },
    said: { text: 'Slash’s model has not answered since 6 October. That is ours to fix. Until it is back, BrainDog works from its rules.', whose: 'ours' },
  };
  const { sent, client } = answering(down);
  const out = await client.engineHealth();
  assert.deepEqual(sent, [{ method: 'GET', path: '/api/engineHealth' }]);
  assert.ok(out.ok);
  assert.deepEqual(out.value, down);
  /* What a reader acts on: the state, and whose it is to fix, without parsing the sentence. */
  assert.equal(out.value?.health.state, 'not_answering');
  assert.equal(out.value?.said.whose, 'ours');
});

test('A HOST THAT HANDS NO ENGINE ANSWERS null, which a reader takes as no engine rather than a healthy one', async () => {
  const { client } = answering(null);
  const out = await client.engineHealth();
  assert.ok(out.ok);
  assert.equal(out.value, null);
});
