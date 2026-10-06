/**
 * `understand` through the client: a POST to the route of its name with `dry` in the body, answered as the record
 * answers it, and a record without the method answers `NOT_IN_THIS_BUILD` as a refusal the screen can say.
 *
 * NOT A STAND-IN FETCH: `serveApi` over a real record, as `runs-read.test.ts` drives it, so the body the client writes
 * is the one the host decodes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';
import { ROUTES, handlersFor, serveApi } from '@braindog/host';

import { createClient } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** One dry slice, as the record answers it. */
const SLICE = {
  dry: true,
  kinds: [{ kind: 'payments', looked: 40, linked: 3, refused: 0, organisations: 1 }],
  writes: ['Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios', 'Add Lowry St Studios to Organisations'],
  more: 1,
  questions: ['Which project is Fly for?'],
  asks: { 'service-project': 1 },
  done: false,
};

async function wired(understand?: (args: unknown) => Promise<unknown>) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 6)) });
  const handlers = handlersFor(Object.assign(Object.create(api) as typeof api, { understand }) as never);
  const sent: { method: string; path: string; body: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({ method: init?.method ?? 'GET', path: url.pathname, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    return serveApi(new Request(url, init), handlers, owner);
  }) as typeof globalThis.fetch;
  return { sql, sent, client: createClient({ base: 'https://braindog.example', fetch }) };
}

test('UNDERSTAND IS SENT AS THE WRITE ITS ROUTE IS, with dry in the body, and answers what the record said', async () => {
  assert.equal(ROUTES.find((r) => r.name === 'understand')?.writes, true);
  const heard: unknown[] = [];
  const { sql, sent, client } = await wired(async (args) => (heard.push({ ...(args as object) }), ok(SLICE)));
  const out = await client.understand({ dry: true });
  assert.ok(out.ok);
  assert.deepEqual(out.value, SLICE);
  await client.understand();
  assert.deepEqual(sent.map((s) => [s.method, s.path, s.body]), [
    ['POST', '/api/understand', { dry: true }],
    ['POST', '/api/understand', {}],
  ]);
  assert.deepEqual(heard, [{ dry: true }, {}]);
  sql.close();
});

test('A RECORD WITHOUT IT IS A REFUSAL WITH A SENTENCE, not a thrown error', async () => {
  const { sql, client } = await wired();
  const out = await client.understand({ dry: true });
  assert.equal(out.ok, false);
  assert.equal(!out.ok && 'refusal' in out ? out.refusal.code : null, 'NOT_IN_THIS_BUILD');
  sql.close();
});
