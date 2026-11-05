/**
 * The shape door, `POST /api/shape`: a shape grant's bearer takes a scrambled copy, and nothing else does.
 *
 * OVER A REAL RECORD. The door is handed the record's own `shapeExport` from `methods/shape.ts`, as a host wires it,
 * and the grant is asked for, approved and exchanged through the record's device methods, so a pass here is the door,
 * the grant check and the scrambler together.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isShape } from '@braindog/kernel';

import { serveShape, servesShape, type ShapeDoor } from '../src/shape.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { methods } from '../../record/src/methods/shape.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const AT = 'https://studio.example/api/shape';

async function host() {
  const now = Date.UTC(2026, 9, 9, 12);
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => now } });
  const made = await api.createRecord({ id: REC, slug: 'the-studio', name: 'Marrowgate Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true, provedAt: now };

  const grant = async (reach: string): Promise<string> => {
    const started = await api.deviceStart({ reach, label: `studio mac · ${reach}` }, '203.0.113.7');
    if (!started.ok) return assert.fail(JSON.stringify(started));
    const looked = await api.deviceLook({ user_code: started.value.user_code }, owner);
    if (!looked.ok) return assert.fail(JSON.stringify(looked));
    assert.ok((await api.deviceApprove({ user_code: started.value.user_code, handle: looked.value.handle }, owner)).ok);
    const polled = await api.devicePoll({ device_code: started.value.device_code });
    if (!polled.ok || polled.value.pending) return assert.fail(JSON.stringify(polled));
    return polled.value.bearer;
  };

  const shape = methods({ kernel: api.kernel, clock: { now: () => now } });
  const asked: string[] = [];
  const door: ShapeDoor = {
    copy: (bearer) => {
      asked.push(bearer);
      return shape.shapeExport(bearer);
    },
  };
  return { grant, door, asked };
}

const post = (headers: Record<string, string>, init: RequestInit = {}, url = AT): Request => new Request(url, { method: 'POST', headers, ...init });
const body = async (res: Response) => (await res.json()) as { ok: boolean; value?: string[]; refusal?: { code: string; fix: string; at?: string } };

test('THE DOOR IS /api/shape AND NO OTHER PATH', () => {
  assert.ok(servesShape('/api/shape'));
  assert.ok(servesShape('//api//shape/'));
  for (const path of ['/api/shapes', '/api/shape/x', '/api/export', '/app/shape']) assert.equal(servesShape(path), false, path);
});

test("A SHAPE GRANT'S BEARER, FROM A TERMINAL, TAKES THE COPY, and it says it is a shape and holds no word of the record", async () => {
  const h = await host();
  const res = await serveShape(post({ authorization: `Bearer ${await h.grant('shape')}` }), h.door);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const out = await body(res);
  assert.ok(out.ok && Array.isArray(out.value), JSON.stringify(out).slice(0, 300));
  assert.ok(isShape(out.value!), 'the copy is not marked as a shape');
  const text = out.value!.join('\n').toLowerCase();
  for (const word of ['marrowgate', 'ada@example.com', 'the-studio']) assert.ok(!text.includes(word), `the copy holds ${word}`);
});

test('A LOGIN, A GRANT NOBODY MADE OR JUNK IS REFUSED BY THE RECORD, in the one sentence', async () => {
  const h = await host();
  for (const bearer of [await h.grant('login'), `${REC}.not-a-secret-anyone-made`, 'junk']) {
    const res = await serveShape(post({ authorization: `Bearer ${bearer}` }), h.door);
    assert.equal(res.status, 403, bearer.slice(0, 12));
    assert.deepEqual((await body(res)).refusal, { code: 'FORBIDDEN', fix: 'That shape grant is not known here.', at: 'shape' });
  }
});

test('A PAGE, A GET, NO BEARER, A SESSION COOKIE OR ANOTHER PATH NEVER REACHES THE RECORD', async () => {
  const h = await host();
  const bearer = await h.grant('shape');

  const page = await serveShape(post({ authorization: `Bearer ${bearer}`, origin: 'https://studio.example' }), h.door);
  assert.equal(page.status, 403);
  assert.equal((await body(page)).refusal?.at, 'origin');

  const get = await serveShape(new Request(AT, { headers: { authorization: `Bearer ${bearer}` } }), h.door);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');

  const none = await serveShape(post({}), h.door);
  assert.equal(none.status, 401);
  assert.equal(none.headers.get('www-authenticate'), 'Bearer');

  /* A SIGNED-IN BROWSER'S COOKIE IS NOT A BEARER: alone it is the 401, and with the page's Origin it is the 403. */
  for (const name of ['__Host-bd_s', 'bd_s']) {
    assert.equal((await serveShape(post({ cookie: `${name}=a-session-the-door-never-reads` }), h.door)).status, 401, name);
    assert.equal((await serveShape(post({ cookie: `${name}=a-session-the-door-never-reads`, origin: 'https://studio.example' }), h.door)).status, 403, name);
  }

  const elsewhere = await serveShape(post({ authorization: `Bearer ${bearer}` }, {}, 'https://studio.example/api/export'), h.door);
  assert.equal(elsewhere.status, 404);

  assert.deepEqual(h.asked, [], 'a refused request reached the record');
});
