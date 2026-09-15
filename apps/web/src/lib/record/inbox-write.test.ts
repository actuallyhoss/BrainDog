/**
 * The Inbox's writes against the record: a filed arrival names the row it became, an archived one says so, a refusal is
 * the record's own sentence, and no record is a calm sentence rather than the socket's error.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { archiveArrival, fileArrival, type Fetch } from './inbox-write.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (() => Response) | null): { io: Fetch; sent: { url: string; init: RequestInit | undefined }[] } {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const io: Fetch = async (url, init) => {
    sent.push({ url, init });
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  };
  return { io, sent };
}

test('filing sends the arrival and the list, with the session, and answers with the row it became', async () => {
  const { io, sent } = host(() =>
    json(200, { ok: true, value: { id: 'raw_7', state: 'matched', already: false, entry: { register: 'obligations', seq: 12, fields: {} } } }),
  );
  const out = await fileArrival(BASE, 'raw_7', 'obligations', io);
  assert.deepEqual(out, { from: 'written', state: 'matched', row: 'obligations#12' });
  assert.equal(sent[0]!.url, `${BASE}/api/fileArrival`);
  assert.equal(sent[0]!.init?.method, 'POST');
  assert.equal(sent[0]!.init?.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)), { id: 'raw_7', register: 'obligations' });
});

test('archiving sends the arrival alone and answers with its new state', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { id: 'raw_3', state: 'ignored', already: true, entry: null } }));
  assert.deepEqual(await archiveArrival(BASE, 'raw_3', io), { from: 'written', state: 'ignored', row: null });
  assert.equal(sent[0]!.url, `${BASE}/api/archiveArrival`);
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)), { id: 'raw_3' });
});

test("a refusal is the record's own sentence", async () => {
  const fix = 'This arrival has already left the inbox, as matched. Nothing was changed.';
  const { io } = host(() => json(422, { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix, at: 'id' } }));
  assert.deepEqual(await archiveArrival(BASE, 'raw_3', io), { from: 'refused', fix });

  const signedOut = host(() => new Response(null, { status: 401 }));
  assert.deepEqual(await fileArrival(BASE, 'raw_3', 'obligations', signedOut.io), { from: 'refused', fix: copy.signInAgain });
});

test('no record, or an answer that is not the record, is a calm sentence and never the error text', async () => {
  assert.deepEqual(await fileArrival(BASE, 'raw_3', 'obligations', host(null).io), { from: 'unreachable', fix: copy.recordNotReached });
  const page = host(() => new Response('<html>Not found</html>', { status: 404, headers: { 'content-type': 'text/html' } }));
  assert.deepEqual(await archiveArrival(BASE, 'raw_3', page.io), { from: 'unreachable', fix: copy.recordNotReached });
});
