/**
 * A person proves a phone rings: `pushTest` (`src/methods/push-test.ts`, REC-A15). One `notify.push` per subscription
 * the caller holds and none of anybody else's, a sentence when there are none, a token refused, and a second press
 * inside a minute held with the seconds left.
 *
 * THE METHOD AS THE RECORD SERVES IT once `methods/index.ts` joins it; until then the file's own `methods`, handed the
 * record's kernel and storage and a guard that lets everybody in, so the person check here is the method's own.
 * Invented names throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, PUSH_TEST_EVERY_MS, TEST_PUSH } from '../src/methods/push-test.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_ada', level: 'owner' } };
const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'read' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_ada', level: 'owner' } };

/* A real P-256 point, uncompressed (65 bytes, leading 0x04), and a 16-byte secret, as `PushSubscription.toJSON()` gives. */
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const PHONE = 'https://fcm.googleapis.com/fcm/send/ada-phone-7f3a';
const LAPTOP = 'https://updates.push.services.mozilla.com/wpush/v2/ada-laptop-91c2';
const BO_PHONE = 'https://fcm.googleapis.com/fcm/send/bo-phone-4d10';

const refusalOf = (out: object) => ('refusal' in out ? (out.refusal as { code: string; at?: string; fix: string; retry_after?: number }) : null);

async function record() {
  const sql = openSqlite();
  let now = Date.UTC(2026, 9, 15, 9);
  const clock = { now: () => now };
  const api = await createRecordApi({ sql, clock });
  let rang = 0;
  const own = methods({ kernel: api.kernel, sql, guard: () => null, no, tail: async <T,>(out: T) => (rang++, out), clock } as never);
  const queued = () =>
    sql
      .all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'notify.push' ORDER BY created, id")
      .map((r) => JSON.parse(r.payload) as { sub: { id: string }; test?: boolean; title?: string; body?: string });
  const subsOf = (person: string) => sql.all<{ id: string }>('SELECT id FROM push_sub WHERE person_id = ? ORDER BY id', person).map((r) => r.id);
  return { api, sql, own, queued, subsOf, rang: () => rang, later: (ms: number) => void (now += ms) };
}

test('TWO SUBSCRIPTIONS QUEUE TWO PUSHES, each naming one of hers by id, and none of anybody else', async () => {
  const r = await record();
  for (const endpoint of [PHONE, LAPTOP]) assert.ok((await r.api.subscribePush({ endpoint, keys: KEYS }, ada)).ok);
  assert.ok((await r.api.subscribePush({ endpoint: BO_PHONE, keys: KEYS }, bo)).ok);

  const out = await r.own.pushTest(undefined, ada);
  if (!out.ok) return assert.fail(JSON.stringify(out));
  assert.equal(out.value.devices, 2);
  assert.equal(out.value.line, 'Sent to 2 devices. It should arrive within a minute.');
  assert.equal(r.rang(), 1, 'the doorbell was not rung, so the Worker would wait for the next write');

  const jobs = r.queued();
  assert.deepEqual(jobs.map((j) => j.sub.id).sort(), r.subsOf('p_ada'));
  assert.ok(!jobs.some((j) => r.subsOf('p_bo').includes(j.sub.id)), "Bo's phone was rung by Ada's press");
  for (const j of jobs) {
    assert.equal(j.test, true);
    assert.equal(j.title, TEST_PUSH.title);
    /* NOTHING OF THE RECORD: no endpoint, no person, nothing past the id and the fixed words. */
    assert.deepEqual(Object.keys(j).sort(), ['body', 'sub', 'test', 'title']);
    assert.ok(!JSON.stringify(j).includes('ada-phone'), 'an endpoint went into the outbox');
  }
  r.sql.close();
});

test('NO SUBSCRIPTION ANSWERS 0 WITH A SENTENCE, and queues nothing', async () => {
  const r = await record();
  const out = await r.own.pushTest({}, ada);
  if (!out.ok) return assert.fail(JSON.stringify(out));
  assert.equal(out.value.devices, 0);
  assert.match(out.value.line, /No device of yours has notifications turned on/);
  assert.deepEqual(r.queued(), []);
  r.sql.close();
});

test('A TOKEN IS REFUSED, and so is a call that sends anything', async () => {
  const r = await record();
  assert.ok((await r.api.subscribePush({ endpoint: PHONE, keys: KEYS }, ada)).ok);
  assert.equal(refusalOf(await r.own.pushTest(undefined, agent))?.code, 'FORBIDDEN');
  assert.equal(refusalOf(await r.own.pushTest({ to: 'p_bo' }, ada))?.at, 'to');
  assert.deepEqual(r.queued(), []);
  r.sql.close();
});

test('A SECOND PRESS INSIDE A MINUTE IS HELD, says when the next may go, and goes once the minute is up', async () => {
  const r = await record();
  assert.ok((await r.api.subscribePush({ endpoint: PHONE, keys: KEYS }, ada)).ok);
  assert.ok((await r.own.pushTest(undefined, ada)).ok);

  r.later(20_000);
  const held = refusalOf(await r.own.pushTest(undefined, ada));
  assert.equal(held?.code, 'RATE_LIMITED');
  assert.equal(held?.retry_after, 40);
  assert.match(held?.fix ?? '', /The next one can go in 40 seconds\./);
  assert.equal(r.queued().length, 1, 'a held press queued a push');

  /* ANOTHER PERSON'S MINUTE IS THEIR OWN. */
  assert.ok((await r.api.subscribePush({ endpoint: BO_PHONE, keys: KEYS }, bo)).ok);
  assert.ok((await r.own.pushTest(undefined, bo)).ok);

  r.later(PUSH_TEST_EVERY_MS - 20_000);
  const again = await r.own.pushTest(undefined, ada);
  assert.ok(again.ok && again.value.devices === 1, JSON.stringify(again));
  assert.equal(r.queued().length, 3);
  r.sql.close();
});
