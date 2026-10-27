/**
 * Twenty errors at 13:19:45Z on 24
 * October, `/api/pulse` "Connection closed: this Durable Object instance is no longer active. Reconnect or retry the
 * request." A read or a pulse is asked once more through a new stub; a write is never sent twice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchThroughReset, sayableTwice, wasReset } from '../src/reset-retry.ts';

const RESET = Object.assign(new Error('Connection closed: this Durable Object instance is no longer active. Reconnect or retry the request.'), { retryable: true });

/** Stubs that fail the first call with `first` and answer the rest; `made` counts the stubs. */
function stubs(first: unknown) {
  let made = 0;
  let calls = 0;
  const stub = () => {
    made += 1;
    return {
      fetch: async (r: Request): Promise<Response> => {
        calls += 1;
        if (calls === 1) throw first;
        return new Response(JSON.stringify({ ok: true, value: await r.text() }), { status: 200 });
      },
    };
  };
  return { stub, made: () => made };
}

test('A PULSE CUT BY A RESET IS SENT ONCE MORE, through a new stub, with its body', async () => {
  const s = stubs(RESET);
  const out = await fetchThroughReset(s.stub, new Request('https://brain.dog/api/pulse', { method: 'POST', body: '{"run":"S904"}' }));
  assert.equal(out.status, 200);
  assert.deepEqual(await out.json(), { ok: true, value: '{"run":"S904"}' });
  assert.equal(s.made(), 2, 'the second try went through the stub that closed');
});

test('A WRITE CUT BY A RESET IS NOT SENT TWICE, and an error that is not a reset is not retried', async () => {
  const write = stubs(RESET);
  await assert.rejects(fetchThroughReset(write.stub, new Request('https://brain.dog/api/update', { method: 'POST', body: '{}' })), /no longer active/u);
  assert.equal(write.made(), 1);
  const other = stubs(new Error('boom'));
  await assert.rejects(fetchThroughReset(other.stub, new Request('https://brain.dog/api/boot')), /boom/u);
  assert.equal(other.made(), 1);
});

test('WHAT COUNTS AS A RESET, and what may be said twice', () => {
  assert.equal(wasReset(RESET), true);
  assert.equal(wasReset(new Error('Internal error in Durable Object storage caused object to be reset; reference = x')), true);
  assert.equal(wasReset(Object.assign(new Error('Durable Object is overloaded'), { retryable: true, overloaded: true })), false);
  assert.equal(wasReset('no longer active'), false);
  assert.equal(sayableTwice('POST', '/api/pulse'), true);
  assert.equal(sayableTwice('POST', '/app/kiln/api/pulse'), true);
  assert.equal(sayableTwice('GET', '/api/boot'), true);
  assert.equal(sayableTwice('POST', '/api/propose'), false);
});
