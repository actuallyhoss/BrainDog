/**
 * `GET /api/snapshots/<id>` on the Worker: the self-host's download door, which the Cloud answers with a sentence.
 *
 * IT SAID "NOT IN THIS BUILD" UNTIL THE WORKER KEPT COPIES, and then it would have said something false. At 07ba6dbd the
 * door answered the list's own refusal, 501 `NOT_IN_THIS_BUILD`, because the record had no `Snapshots` port. Once
 * `Record$` hands it `copies.ts`, the list answers, and `copyRefusal` as it was then answered every id, a copy the
 * list had just shown included, "is not one of the copies this record keeps". A copy the Cloud holds is sealed to the
 * operator's backup identity (`12 §8`) and no Worker can open it, so the door says that, names what to do instead, and
 * keeps `OUT_OF_BOUNDS` for an id that really is not there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { httpStatus } from '@braindog/host';
import { createRecordApi, type CallContext } from '@braindog/record';

import { copyAsked, copyRefusal } from '../src/route.ts';
import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { cloud } from './cloud-harness.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

test('THE PATH, AND ONLY FOR A GET', () => {
  assert.equal(copyAsked('GET', '/api/snapshots/2026-09-16T12-00-00Z-now'), '2026-09-16T12-00-00Z-now');
  assert.equal(copyAsked('GET', '//api//snapshots//x/'), 'x');
  for (const [method, path] of [['POST', '/api/snapshots/x'], ['GET', '/api/snapshots'], ['GET', '/api/snapshots/x/y'], ['GET', '/api/snapshot/x']] as const)
    assert.equal(copyAsked(method, path), null, `${method} ${path}`);
});

test('A RECORD WITH NO COPIES ANSWERS THE DOOR WITH THE LIST\'S OWN REFUSAL, 501 NOT_IN_THIS_BUILD', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 16, 12)) });
  const listed = await api.snapshots(owner);
  const out = await copyRefusal('2026-09-16T12-00-00Z-now', () => api.snapshots(owner));
  assert.equal(out.ok, false);
  assert.deepEqual(out, listed);
  assert.equal(out.ok === false && 'refusal' in out ? out.refusal.code : '', 'NOT_IN_THIS_BUILD');
  assert.equal(httpStatus(out), 501);
});

test('ON THE CLOUD, A COPY THE LIST SHOWS IS SAID TO BE SEALED, AND AN ID IT DOES NOT SHOW IS NOT ONE OF ITS COPIES', async () => {
  const c = await cloud();
  const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
  await c.provision(REC, 'studio', 'ada@example.test');
  const cookie = await c.signIn('ada@example.test');
  const took = (await (await c.ask('/api/snapshot', { method: 'POST', cookie, body: JSON.stringify({ label: 'now' }) })).json()) as { ok: boolean; value?: { id: string } };
  assert.ok(took.ok, `the Worker keeps no copies: ${JSON.stringify(took)}`);
  const id = took.value?.id ?? '';

  const held = await c.ask(`/api/snapshots/${id}`, { cookie });
  const said = (await held.json()) as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(held.status, 501, JSON.stringify(said));
  assert.match(said.refusal?.fix ?? '', new RegExp(`^${id} is kept sealed`), 'a copy the list shows is answered as absent, or as a build with no copies');
  assert.match(said.refusal?.fix ?? '', /restore/i);

  const absent = (await (await c.ask('/api/snapshots/now-1999-01-01', { cookie })).json()) as { refusal?: { code: string } };
  assert.equal(absent.refusal?.code, 'OUT_OF_BOUNDS');
});

test('the record\'s object asks it before the method router, which would answer ROUTE_UNKNOWN', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  const at = src.indexOf('copyAsked(request.method');
  assert.ok(at > 0, 'the object does not answer the copy door');
  assert.ok(at < src.indexOf('return serveApi(request, handlers, ctx);'), 'the method router answers the copy door first');
});
