/**
 * The record switcher's rows: `/account/records` read as the host's envelope, with a 401 read as
 * "sign in again" and nothing recognisable read as `UNREACHABLE`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readRecordsForSwitcher, type Fetch, type SwitcherRow } from './switcher.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (() => Response) | null): { io: Fetch; sent: { url: string; init?: RequestInit | undefined }[] } {
  const sent: { url: string; init?: RequestInit | undefined }[] = [];
  const io: Fetch = async (url, init) => {
    sent.push({ url, init });
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  };
  return { io, sent };
}

test('every open record the person can reach, exactly as the host answered it', async () => {
  const rows: SwitcherRow[] = [
    { slug: 'the-studio', name: 'The Studio', level: 'owner' },
    { slug: 'kiln', name: 'Kiln', level: 'write' },
  ];
  const { io, sent } = host(() => json(200, { ok: true, value: rows }));
  const out = await readRecordsForSwitcher(io, 'https://app.brain.dog');
  assert.deepEqual(out, { ok: true, value: rows });
  assert.equal(sent[0]?.url, 'https://app.brain.dog/account/records');
  assert.equal(sent[0]?.init?.credentials, 'same-origin');
});

test('a 401 is read as sign in again, never a record refusal, whatever the body says', async () => {
  const { io } = host(() => json(401, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'something else entirely' } }));
  const out = await readRecordsForSwitcher(io);
  assert.deepEqual(out, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again to see the records you can reach.' } });
});

test('nothing listening, or a page that is not an envelope, is UNREACHABLE and never thrown', async () => {
  const none = await readRecordsForSwitcher(host(null).io);
  assert.equal(none.ok, false);
  assert.equal(!none.ok && none.refusal.code, 'UNREACHABLE');

  const notAnEnvelope = await readRecordsForSwitcher(host(() => new Response('<!doctype html>', { status: 200 })).io);
  assert.equal(notAnEnvelope.ok, false);
  assert.equal(!notAnEnvelope.ok && notAnEnvelope.refusal.code, 'UNREACHABLE');
});

test('any other refusal is passed through as the host said it', async () => {
  const { io } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Records are the account holder’s.' } }));
  const out = await readRecordsForSwitcher(io);
  assert.deepEqual(out, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Records are the account holder’s.' } });
});
