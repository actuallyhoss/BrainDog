/**
 * THE INBOX'S `repeats` REACHES THE KERNEL BY EITHER VERB (check:inbox-repeats, batch 40).
 *
 * The web's "Held as repeats" asks `GET /api/inbox?state=skipped&repeats=true`. The route table named `state`, `cursor`
 * and `limit` and not `repeats`, so the four letters "true" reached the record as text, the record refused them with
 * VALUE_MALFORMED at `repeats`, and the Inbox read the refusal as no repeats: the tile was always empty in production.
 * The builder's test missed it because its fake record read the query string itself.
 *
 * THE HOST HERE IS A REAL RECORD BEHIND `serveApi`, over a kernel that ingested a real second charge and a page of rule
 * skips after it, so a filter that did not reach the kernel would page the rule skips and miss the repeat.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { CARD, NOW, record, text, used } from '../../kernel/test/ingest-tail-kit.ts';
import { fixedClock } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Line = { id: string; repeats?: string };
type Answer = { ok: boolean; value?: { arrivals: Line[] }; refusal?: { code: string; at?: string } };

const DECLINED = { when: { field: 'body', contains: 'declined' }, reason: 'A declined charge moved no money.' };

async function host() {
  const r = await record(CARD({ dedupe: ['amount', 'account'], skip: [DECLINED] }));
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const first = text(r.k, used('1234', 'Corner Shop', '120.00', '07/10/2026'));
  const again = text(r.k, used('1234', 'Corner Shop', '120.00', '08/10/2026'));
  assert.equal(again.state, 'skipped');
  for (const n of [1, 2, 3, 4]) assert.equal(text(r.k, `${used('1234', 'Corner Shop', `${n}.00`, '09/10/2026')} It was declined.`).state, 'skipped');
  const api = await createRecordApi({ sql: r.sql, clock: fixedClock(NOW + 60 * 60_000) });
  const handlers = handlersFor(api);
  const call = async (path: string, body?: unknown) => {
    const request = body === undefined ? new Request(`https://x/api/${path}`) : new Request(`https://x/api/${path}`, { method: 'POST', body: JSON.stringify(body) });
    const res = await serveApi(request, handlers, owner);
    return { status: res.status, body: (await res.json()) as Answer };
  };
  return { sql: r.sql, call, first: first.wrote[0]!, again: again.raw };
}

test('the route table names repeats on inbox, as a structured argument', () => {
  assert.equal(ROUTES.find((r) => r.name === 'inbox')?.takes?.repeats, 'json');
});

test('A GET FOR REPEATS ALONE PAGES PAST THE RULE SKIPS to the second charge, carrying the row it repeats', async () => {
  const { call, sql, first, again } = await host();
  /* THE CASE IS THE ONE THAT HID IT: two skipped arrivals, newest first, are both rule skips. */
  const unmarked = await call('inbox?state=skipped&limit=2');
  assert.equal(unmarked.status, 200, JSON.stringify(unmarked.body));
  assert.ok(!unmarked.body.value?.arrivals.some((a) => a.id === again));
  const out = await call('inbox?state=skipped&repeats=true&limit=2');
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(out.body.value?.arrivals.map((a) => [a.id, a.repeats]), [[again, first]]);
  sql.close();
});

test('A POST SAYS THE SAME, and a repeats that is not true or false is refused at the argument', async () => {
  const { call, sql, again } = await host();
  const out = await call('inbox', { state: 'skipped', repeats: true, limit: 2 });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(out.body.value?.arrivals.map((a) => a.id), [again]);
  const bad = await call('inbox?state=skipped&repeats=1');
  assert.equal(bad.status, 422, JSON.stringify(bad.body));
  assert.equal(bad.body.refusal?.at, 'repeats');
  sql.close();
});
