/**
 * A record whose object is overloaded, reached through the Worker's real doors.
 *
 * MEASURED ON 23 OCT: a page load beside a heavy agent call filled the owner's object's queue, and eighty requests in
 * two seconds were each answered 500 `INTERNAL` "could not be answered ... Quote that to whoever runs it", each with
 * an alert. A full queue is load, not a fault: 503 with `Retry-After`, so the client asks again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const OWNER = 'ada@example.test';

/** Every call into the object rejects as the platform rejects one past a full queue. */
const full = new Proxy(
  {},
  {
    get: () => () =>
      Promise.reject(Object.assign(new Error('Durable Object is overloaded. Requests queued for too long.'), { overloaded: true, retryable: true })),
  },
);

test('AN OVERLOADED RECORD IS A 503 WITH RETRY-AFTER, never a crash to quote', async () => {
  const c = await cloud();
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  (c.env['RECORD'] as { get: (id: string) => unknown }).get = () => full;
  const errors: string[] = [];
  const was = console.error;
  console.error = (line: string) => void errors.push(String(line));
  try {
    for (const path of ['/app/studio/api/schemas?every=true', '/api/boot']) {
      const res = await c.ask(path, { cookie });
      assert.equal(res.status, 503, path);
      assert.equal(res.headers.get('retry-after'), '1', path);
      const body = (await res.json()) as { ok: boolean; refusal: { code: string; fix: string } };
      assert.equal(body.refusal.code, 'RECORD_UNAVAILABLE');
      assert.doesNotMatch(body.refusal.fix, /Quote that/u);
    }
    /* THE DOOR THE OWNER MET IT AT: Slash's read. */
    const slash = await c.ask('/app/studio/api/slash/read', { method: 'POST', cookie, body: JSON.stringify({ q: 'what is late' }) });
    assert.equal(slash.status, 503, await slash.clone().text());
    assert.equal(slash.headers.get('retry-after'), '1');
  } finally {
    console.error = was;
  }
  assert.deepEqual(errors.filter((l) => l.includes('"op":"crash"')), [], 'an overload was logged as a crash');
});
