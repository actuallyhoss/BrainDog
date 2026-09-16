/**
 * `GET /api/snapshots/<id>` on the Worker answers what the other snapshot methods answer: not in this build.
 *
 * `src/index.ts` imports `cloudflare:workers` and cannot be loaded by `node --test`, so the decision is in `route.ts`
 * and the one line that calls it is read as text, as `build.test.ts` does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { httpStatus } from '@braindog/host';
import { createRecordApi, type CallContext } from '@braindog/record';

import { copyAsked, copyRefusal } from '../src/route.ts';
import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

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

test('the record\'s object asks it before the method router, which would answer ROUTE_UNKNOWN', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  const at = src.indexOf('copyAsked(request.method');
  assert.ok(at > 0, 'the object does not answer the copy door');
  assert.ok(at < src.indexOf('return serveApi(request, handlersFor(api), ctx);'), 'the method router answers the copy door first');
});
