/**
 * The Inbox's read against the record: a live page, no list from a host that has no such read, and the record's own
 * sentence for anything else, including the two answers that used to draw the sample.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Fetch } from './boot-live.ts';
import { INBOX } from './fixtures/sample.ts';
import { INBOX_PAGE, itemOf, readInbox } from './inbox-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: ((url: URL) => Response) | null): { io: Fetch; sent: URL[] } {
  const sent: URL[] = [];
  const io = (async (url: string | URL | Request) => {
    sent.push(new URL(String(url)));
    if (!answer) throw new TypeError('fetch failed');
    return answer(new URL(String(url)));
  }) as Fetch;
  return { io, sent };
}

const arrival = (over: Record<string, unknown>) => ({
  rowid: 1,
  id: 'raw_1',
  ts: '2026-09-15T09:00:00.000Z',
  channel: 'email',
  from: 'billing@fenwick.example',
  to: '',
  subject: 'Your invoice',
  body: 'Total GBP 58.00',
  state: 'untriaged',
  reason: null,
  ...over,
});

test("a live inbox is the record's page and nothing of the sample", async () => {
  const { io, sent } = host(() =>
    json(200, { ok: true, value: { arrivals: [arrival({ rowid: 7, id: 'raw_7' }), arrival({ rowid: 3, id: 'raw_3', subject: 'RE: Invoice 41' })], cursor: 3 } }),
  );
  const out = await readInbox(BASE, io);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(out.items.map((i) => [i.id, i.subject, i.from]), [
    ['raw_7', 'Your invoice', 'billing@fenwick.example'],
    ['raw_3', 'RE: Invoice 41', 'billing@fenwick.example'],
  ]);
  assert.equal(out.cursor, 3);
  const sample = new Set(INBOX.map((i) => i.id));
  assert.ok(out.items.every((i) => !sample.has(i.id)), 'a sample row was mixed into a live answer');
  assert.equal(sent[0]!.pathname, '/api/inbox');
  assert.equal(sent[0]!.searchParams.get('limit'), String(INBOX_PAGE));
  assert.equal(sent[0]!.searchParams.get('cursor'), null);

  await readInbox(BASE, io, 3);
  assert.equal(sent[1]!.searchParams.get('cursor'), '3', 'the page below is asked for by the cursor the page above gave');
});

/* NO RECORD IS A REFUSAL NOW, NOT THE SAMPLE. These three drew the studio's nine arrivals, with a rule
   offer under each and two buttons that could only say nothing was saved. */
test('no record here is a refusal: nothing answering, a sign-in wall, and a 404 that is not JSON', async () => {
  assert.deepEqual(await readInbox(BASE, host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in.' } })).io), { from: 'refused', fix: 'Sign in.' });
  for (const answer of [null, () => new Response('<h1>Not found</h1>', { status: 404, headers: { 'content-type': 'text/html' } })]) {
    const out = await readInbox(BASE, host(answer).io);
    assert.equal(out.from, 'refused');
    assert.ok(out.from === 'refused' && out.fix.trim() !== '', 'a refusal with no sentence says nothing to the reader');
  }
});

test('the Inbox screen draws the record or its refusal, and no control that cannot write', () => {
  /* The code, not its comments: "A GLASS CIRCLE NOW" over a button's style (178922ed2) is not the sample's clock. */
  const page = readFileSync(new URL('../../routes/inbox/+page.svelte', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/gu, '');
  /* THE SAMPLE'S ARRIVALS, ITS CLOCK AND ITS SOURCES were the screen's fallback. */
  assert.doesNotMatch(page, /INBOX as SAMPLE|\bSOURCES\b|\bNOW\b|from === 'sample'/u, 'the Inbox reads the sample again');
  /* A RULE OFFER HAS NO WRITE ON THE RECORD, so it is not drawn rather than drawn to toast that nothing was saved. */
  assert.doesNotMatch(page, /notWritten|copy\.makeRule|copy\.notThisOne/u, 'a control with no write is drawn again');
});

test('a host with no inbox read draws no list, and any other refusal is the record sentence', async () => {
  const older = host(() => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called inbox.' } }));
  assert.deepEqual(await readInbox(BASE, older.io), { from: 'unrouted' });
  const token = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This needs owner, and no token reaches it. A person has to do it, signed in.' } }));
  assert.deepEqual(await readInbox(BASE, token.io), { from: 'refused', fix: 'This needs owner, and no token reaches it. A person has to do it, signed in.' });
});

test('an arrival with no sender or subject is named by its channel and the first line it said', () => {
  const hook = itemOf(arrival({ channel: 'webhook', from: '', subject: '', body: 'order.paid 4417\n{"amount": 5800}' }) as never);
  assert.equal(hook.from, 'webhook');
  assert.equal(hook.subject, 'order.paid 4417');
  const blank = itemOf(arrival({ channel: 'paste', from: '', subject: '', body: null }) as never);
  assert.equal(blank.subject, 'paste');
  assert.equal(blank.body, '');
});
