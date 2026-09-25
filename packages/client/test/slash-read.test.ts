/**
 * `slashRead`: the one call the palette makes to Slash, at `POST /api/slash/read`, and what it hands back.
 *
 * NOT A METHOD, AND THE TEST IS WHERE THAT SHOWS. `packages/host/test/slash-ask.test.ts` keeps the ask out of `ROUTES`, so
 * `call('slashRead')` would be `ROUTE_UNKNOWN` on both hosts. What these tests pin is that the client goes to the door's own
 * path, with a JSON body carrying `question` and nothing else, and never with a bearer: the door answers every
 * `authorization` header 403 `NEEDS_BROWSER_SESSION`, so a client that sent the one it held would never be answered at all.
 *
 * THE THREE ANSWERS ARE THE ONES A PERSON WILL SEE. A Reading when a model is behind Slash, 501 `NOT_IN_THIS_BUILD` on a
 * host with none (`serveSlash`'s checks 5 and 9), and 422 `SLASH_BUDGET_SPENT` when tier `a` has asked its `ask_cap` for the
 * month, which reaches here as a 422 because the code is not in `httpStatus`'s own list. Each body is the one the door
 * writes, copied rather than invented, so a change to the door's words is a change somebody has to make here too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type Reading } from '../src/index.ts';

type Sent = { url: string; init: RequestInit };

/** A client whose whole network is one canned answer, which also keeps what was asked of it. */
const answering = (status: number, body: unknown, token?: string) => {
  const sent: Sent[] = [];
  const client = createClient({
    base: 'https://braindog.example',
    ...(token === undefined ? {} : { token }),
    fetch: (async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as typeof globalThis.fetch,
  });
  return { client, sent };
};

/** A Reading as the engine builds it (`packages/slash/src/types.ts`), with the fold ending on the vault as it always does. */
const READING: Reading = {
  ask_id: '01M33H56ZCMM62YT38ARN8JRM8',
  predicate: { field: 'state', is: 'open' },
  q: null,
  read: [
    { register: 'tasks', rows: 2, predicate: '{"field":"state","is":"open"}' },
    { register: 'grant', rows: 0, predicate: 'refused' },
  ],
  rows: [{ id: 'r_1', register: 'tasks', seq: 1, spoken: 'tasks#1', summary: 'Invoice Acme', fields: { what: 'Invoice Acme' } }],
};

test("A READING COMES BACK AS THE DOOR SENT IT, from the door's own path and with no bearer even where the client holds one", async () => {
  const { client, sent } = answering(200, { ok: true, value: READING }, 'rec_x.a-token-this-door-refuses');
  const out = await client.slashRead('Which tasks are open?');
  assert.deepEqual(out, { ok: true, value: READING });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, 'https://braindog.example/api/slash/read');
  assert.equal(sent[0]!.init.method, 'POST');
  const headers = new Headers(sent[0]!.init.headers);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('authorization'), null, 'a bearer went to a door that refuses every bearer');
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), { question: 'Which tasks are open?' });
});

test('A HOST WITH NO MODEL SAYS SO, and the client passes its sentence on rather than one of its own', async () => {
  const refusal = { code: 'NOT_IN_THIS_BUILD', fix: 'No model is configured behind Slash on this host, so it cannot read the record for you.' };
  const out = await answering(501, { ok: false, refusal }).client.slashRead('Which tasks are open?');
  assert.deepEqual(out, { ok: false, refusal });
});

test("A SPENT MONTH IS A 422 WITH THE ENGINE'S OWN CODE, which the palette has to be able to tell from a malformed ask", async () => {
  const refusal = { code: 'SLASH_BUDGET_SPENT', fix: 'Slash is out of asks until 2026-10-01. Add your own key, or wait.' };
  const out = await answering(422, { ok: false, refusal }).client.slashRead('Which tasks are open?');
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && 'refusal' in out ? out.refusal.code : null, 'SLASH_BUDGET_SPENT');
});

test('AND A HOP THAT ANSWERS SOMETHING ELSE IS UNREACHABLE, through the same check every other call goes through', async () => {
  const out = await answering(200, { ok: true }).client.slashRead('Which tasks are open?');
  assert.equal(out.ok === false && 'refusal' in out ? out.refusal.code : null, 'UNREACHABLE');
});
