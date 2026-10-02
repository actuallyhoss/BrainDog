/**
 * The first run's two doors (`ask.ts`): whatever happens on the way, the caller reads a result, and every way of not
 * getting an answer is one the rules then read instead.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slashAsks } from './ask.ts';

const ASK = { said: 'I am a student', offer: { usecases: [], modules: [] }, today: '2026-10-02' };

const answering = (status: number, body: unknown) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { sent, send };
};

test('THE SETUP DOOR IS A JSON POST TO THE RECORD, and its answer comes back as it came', async () => {
  const { sent, send } = answering(200, { ok: true, value: { usecase: 'student' } });
  const out = await slashAsks('https://app.example/r/abc', send).setup(ASK);
  assert.deepEqual(out, { ok: true, value: { usecase: 'student' } });
  assert.equal(sent[0]?.url, 'https://app.example/r/abc/api/slash/setup');
  assert.equal(sent[0]?.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent[0]?.init.body)), ASK);
});

test('A REFUSAL, A DOOR THAT IS NOT THERE, A THROW AND A SILENCE ARE EACH A RESULT', async () => {
  const spent = await slashAsks('', answering(422, { ok: false, refusal: { code: 'SLASH_BUDGET_SPENT', fix: 'Out of asks.' } }).send).setup(ASK);
  assert.deepEqual(spent, { ok: false, refusal: { code: 'SLASH_BUDGET_SPENT', fix: 'Out of asks.' } });

  const missing = await slashAsks('', answering(404, '<html>Not found</html>').send).mapping({ file: 'a.csv', columns: [], sample: [], lists: [] });
  assert.equal(!missing.ok && missing.refusal.code, 'NOT_IN_THIS_BUILD');

  const offline = await slashAsks('', (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch).setup(ASK);
  assert.equal(!offline.ok && offline.refusal.code, 'UNREACHABLE');

  const never = ((_url: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
  const slow = await slashAsks('', never, 10).setup(ASK);
  assert.equal(!slow.ok && slow.refusal.code, 'UNREACHABLE', 'a model that does not answer in time is let go');
});
