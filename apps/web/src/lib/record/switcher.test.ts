/**
 * The record switcher's rows: `/account/records` read as the host's envelope, with a 401 read as
 * "sign in again" and nothing recognisable read as `UNREACHABLE`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { levelWord, openRecord, readRecordsForSwitcher, type Fetch, type SwitcherRow } from './switcher.ts';

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

/* ── opening another record ─────────────────────────────────────────── */

test('OPENING ANOTHER RECORD posts its name from this page, and a host that holds one record is not a refusal', async () => {
  const opened = host(() => json(200, { ok: true, value: { person: 'p_1', record: 'rec_2' } }));
  assert.deepEqual(await openRecord(opened.io, 'kiln', 'https://app.brain.dog'), { from: 'opened' });
  assert.equal(opened.sent[0]?.url, 'https://app.brain.dog/auth/switch');
  assert.equal(opened.sent[0]?.init?.method, 'POST');
  assert.equal(opened.sent[0]?.init?.body, JSON.stringify({ slug: 'kiln' }));

  /* The sample on a static host answers with its 404 page, and a host where nobody signs in has no such route. */
  assert.deepEqual(await openRecord(host(() => new Response('<!doctype html>', { status: 404 })).io, 'kiln'), { from: 'absent' });
  assert.deepEqual(await openRecord(host(() => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'x' } })).io, 'kiln'), { from: 'absent' });

  assert.deepEqual(await openRecord(host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'x' } })).io, 'kiln'), { from: 'refused', fix: copy.recordOpenSignIn });
  const fix = 'You are on no open record by that name.';
  assert.deepEqual(await openRecord(host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix, at: 'slug' } })).io, 'kiln'), { from: 'refused', fix });
  assert.deepEqual(await openRecord(host(null).io, 'kiln'), { from: 'refused', fix: copy.recordNotOpened });
});

/* ── the word a row wears ───────────────────────────────────────────── */

test('A ONE-LIST MEMBER\'S ROW wears the word the host sent, where it used to draw an empty level', async () => {
  /* Both hosts answer this shape since `switcherRows` stopped dropping the row (`packages/record/src/directory.ts`). */
  const rows: SwitcherRow[] = [
    { slug: 'the-studio', name: 'The Studio', level: 'owner' },
    { slug: 'kiln', name: 'Kiln', level: 'read' },
    { slug: 'ledger', name: 'Ledger', level: null, lists: ['expenses'], held: 'Some lists' },
  ];
  const out = await readRecordsForSwitcher(host(() => json(200, { ok: true, value: rows })).io);
  assert.ok(out.ok);
  /* An owner's row says nothing, a level says itself, and a row with no level says what the host called it. */
  assert.deepEqual(out.value.map(levelWord), [null, 'read', 'Some lists']);
});
