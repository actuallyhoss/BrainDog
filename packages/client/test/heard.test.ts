/**
 * `client.heard` LEAVES ONE MARK ON THE AGENT DOOR, as a POST to the record method `heard`, with the mark's
 * own keys and nothing else.
 *
 * WHY THE KEYS MATTER. The record refuses any key a mark does not have (`packages/record/src/methods/door.ts`), so a
 * client that sent `null` for an absent time, or carried a caller's stray field through, would turn every mark from
 * the command line into a refusal nobody reads, and the signs would count nothing: the same silence as the week no
 * client was given the tool list.
 *
 * A STAND-IN FETCH, ON PURPOSE. What is under test is the request this client writes: the verb, the path and the body.
 * What the record keeps of it is `packages/record/test/door.test.ts`'s.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type Heard } from '../src/index.ts';

type Sent = { method: string; path: string; body: unknown; headers: Headers };

function recording(answer: unknown = { ok: true, value: { marked: true } }, status = 200) {
  const sent: Sent[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({ method: init?.method ?? 'GET', path: `${url.pathname}${url.search}`, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { sent, client: createClient({ base: 'https://braindog.example/', token: 'rec_01TEST.secret', fetch }) };
}

test('A MARK IS A POST TO heard WITH ITS OWN KEYS, and the bearer the client holds', async () => {
  const { sent, client } = recording();
  const out = await client.heard({ kind: 'hook', ms: 412, build: '2026.10.09+1a2b3c4' });
  assert.deepEqual(out, { ok: true, value: { marked: true } });
  assert.equal(sent.length, 1);
  assert.deepEqual({ method: sent[0]!.method, path: sent[0]!.path, body: sent[0]!.body }, {
    method: 'POST',
    path: '/api/heard',
    body: { kind: 'hook', ms: 412, build: '2026.10.09+1a2b3c4' },
  });
  assert.equal(sent[0]!.headers.get('authorization'), 'Bearer rec_01TEST.secret');
  assert.equal(sent[0]!.headers.get('content-type'), 'application/json');
});

test('AN ABSENT KEY IS NOT SENT, and a key no mark has is dropped rather than refused by the record', async () => {
  const { sent, client } = recording();
  await client.heard({ kind: 'listed', n: 16, ms: undefined, build: undefined, client: 'claude-code 2.1.4' });
  /* A caller holding a wider object than a mark, as a spread of a session file would be. */
  await client.heard({ kind: 'called', n: 3, run: 'S7', token: 'x' } as unknown as Heard);
  assert.deepEqual(
    sent.map((s) => s.body),
    [
      { kind: 'listed', n: 16, client: 'claude-code 2.1.4' },
      { kind: 'called', n: 3 },
    ],
  );
});

test('A HOST WITHOUT heard ANSWERS ITS REFUSAL AS A VALUE, so a command on an older record carries on', async () => {
  const { client } = recording({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This record cannot do that yet.' } }, 501);
  const out = await client.heard({ kind: 'hello', build: 'dev+0000000' });
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { code: string } }).refusal.code, 'NOT_IN_THIS_BUILD');
});
