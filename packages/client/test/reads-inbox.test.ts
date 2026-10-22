/**
 * What batch 88 added, through the client: `inbox` asked for a digest or for one arrival (AGT-B13 job 5), typed by what
 * it is asked.
 *
 * NOT A STAND-IN FETCH, as `reads-learnings.test.ts` is not: `serveApi` over a real record, so what the client sends is what the
 * host decodes. That is the whole point here: `digest: true` goes out in a query string, and the record takes `true`
 * and never its word, so the route table must say it is structured.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '@braindog/host';

import type { Result } from '@braindog/ports';

import { createClient, type InboxDigest, type InboxLine, type InboxPage } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

async function wired() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const ids: string[] = [];
  for (const [n, body] of ['A short one.', 'x'.repeat(400)].entries()) {
    const out = api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK', Subject: `Text ${n + 1}` }, body, sha256: `d${n + 1}` });
    assert.ok(out.ok, JSON.stringify(out));
    ids.push(out.value.raw);
  }
  const handlers = handlersFor(api);
  const sent: string[] = [];
  const client = createClient({
    base: 'https://x',
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const req = new Request(new URL(String(input)), init);
      sent.push(`${req.method} ${new URL(req.url).pathname}${new URL(req.url).search}`);
      return serveApi(req, handlers, owner);
    }) as typeof globalThis.fetch,
  });
  return { sql, client, sent, long: ids[1]! };
}

test('`inbox({ digest: true })` ANSWERS EVERY STATE AT ONCE, sent as a GET the host decodes, with a long body cut and marked', async () => {
  const { sql, client, sent } = await wired();
  /* TYPED BY WHAT IS ASKED: each line below fails to compile if the answer is the page's. */
  const out: Result<InboxDigest> = await client.inbox({ digest: true });
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(sent, ['GET /api/inbox?digest=true']);
  assert.deepEqual(Object.keys(out.value.counts).sort(), ['ignored', 'matched', 'proposed', 'review', 'skipped', 'untriaged']);
  assert.equal(out.value.counts.untriaged, 2);
  const [long, short] = out.value.states.untriaged;
  assert.deepEqual([long!.body?.length, long!.cut], [180, true]);
  assert.deepEqual([short!.body, short!.cut], ['A short one.', undefined]);
  sql.close();
});

test('`inbox({ id })` ANSWERS THAT ONE ARRIVAL WHOLE, and a page is still a page', async () => {
  const { sql, client, long } = await wired();
  const one: Result<InboxLine> = await client.inbox({ id: long });
  assert.ok(one.ok, JSON.stringify(one));
  assert.deepEqual([one.value.id, one.value.body?.length], [long, 400]);
  const page: Result<InboxPage> = await client.inbox();
  assert.ok(page.ok, JSON.stringify(page));
  assert.equal(page.value.arrivals.length, 2);
  const paged: Result<InboxPage> = await client.inbox({ state: 'all', limit: 1 });
  assert.ok(paged.ok && paged.value.arrivals.length === 1);
  /* AN ID THAT IS NO ARRIVAL IS THE RECORD'S REFUSAL, by a code the registry holds. */
  const none = await client.inbox({ id: 'raw_nothing' });
  assert.ok(!none.ok && 'refusal' in none);
  assert.equal(none.refusal.code, 'OUT_OF_BOUNDS');
  sql.close();
});
