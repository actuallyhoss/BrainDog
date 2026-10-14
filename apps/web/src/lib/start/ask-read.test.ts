/**
 * The reading before there is an account (`readAsks` in `ask.ts`): the host's own door, the five keys it takes and no
 * other, and every way of not getting a reading answered as a result the page's rules then read instead.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readAsks } from './ask.ts';

const ASK = {
  said: 'I rent out six flats near the river and keep the repairs in a notebook',
  offer: { usecases: [{ id: 'student', title: 'Student', summary: 'Courses and deadlines.' }], modules: [] },
  today: '2026-10-14',
  zone: 'Europe/Lisbon',
  locale: 'en-GB',
  turnstile: 'token-once',
};

const answering = (status: number, body: unknown) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { sent, send };
};

test('A READING COMES BACK AS IT CAME, from a JSON post to the host that carries the five keys and never the offer', async () => {
  const reading = { name: 'Ines', summary: 'Six flats to let.', usecase: 'landlord', also: [], modules: [], currency: null, heard: [{ phrase: 'six flats', became: 'Landlord' }], names: [], rows: [], draft: null, by: 'model' };
  const { sent, send } = answering(200, { ok: true, value: reading });
  const out = await readAsks('https://braindog.example', send).setup(ASK);
  assert.deepEqual(out, { ok: true, value: reading });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, 'https://braindog.example/auth/signup/read');
  assert.equal(sent[0]?.init.method, 'POST');
  const body = JSON.parse(String(sent[0]?.init.body)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ['locale', 'said', 'today', 'turnstile', 'zone'], 'the door refuses any other key by name');
  assert.equal(body.said, ASK.said);
  assert.equal(body.turnstile, 'token-once');
});

test('A DOOR SWITCHED OFF ANSWERS 501, with its body or bare, and the page reads it as the rules reading', async () => {
  const off = await readAsks('', answering(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Simple rules read this here.' } }).send).setup(ASK);
  assert.deepEqual(off, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Simple rules read this here.' } });

  const bare = await readAsks('', answering(501, '').send).setup(ASK);
  assert.equal(!bare.ok && bare.refusal.code, 'NOT_IN_THIS_BUILD');
});

test('A MODEL THAT DOES NOT ANSWER IN TIME IS LET GO as UNREACHABLE, and its own refusal keeps its code', async () => {
  const never = ((_url: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
  const slow = await readAsks('', never, 10).setup(ASK);
  assert.equal(!slow.ok && slow.refusal.code, 'UNREACHABLE');

  const spent = await readAsks('', answering(429, { ok: false, refusal: { code: 'SLASH_BUDGET_SPENT', fix: 'No more reads today.' } }).send).setup(ASK);
  assert.equal(!spent.ok && spent.refusal.code, 'SLASH_BUDGET_SPENT');
});
