/**
 * The write behind "Private to me": it names the row and the way, says the record's own sentence when it refuses, and
 * says one calm line when nothing answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { keepPrivate } from './privacy-write.ts';

const said = (body: unknown): ((url: string, init?: RequestInit) => Promise<Response>) => async () => new Response(JSON.stringify(body));

test('A PRESS SENDS THE ROW AND THE WAY, AND A GOOD ANSWER SAYS WHICH WAY IT WENT', async () => {
  let sent: { url: string; body: unknown } | null = null;
  const out = await keepPrivate('', 'jotter#4', true, async (url, init) => {
    sent = { url, body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ ok: true, value: { id: 'x', private: true } }));
  });
  assert.deepEqual(out, { ok: true, private: true });
  assert.deepEqual(sent, { url: '/api/makePrivate', body: { ref: 'jotter#4', on: true } });
});

test("A REFUSAL IS THE RECORD'S OWN SENTENCE", async () => {
  const out = await keepPrivate('', 'jotter#4', false, said({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the person who made a row can keep it private or share it again.' } }));
  assert.deepEqual(out, { ok: false, fix: 'Only the person who made a row can keep it private or share it again.' });
});

test('NO ANSWER AT ALL IS ONE CALM LINE', async () => {
  const out = await keepPrivate('', 'jotter#4', true, async () => {
    throw new Error('offline');
  });
  assert.deepEqual(out, { ok: false, fix: copy.rowPrivateNotDone });
});
