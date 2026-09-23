/**
 * Web Push end to end on one real record: the interrupt queues a job per phone, the pump leases it, the record hands
 * the endpoint out under the lease, a push service answers, and the answer goes back into the record. `51 §5`, W58.
 *
 * THE TWO HALVES WERE EACH SOUND AND DID NOT MEET. W58-2's kernel named subscriptions by id and W58-3's deliverer read
 * `payload.sub.endpoint`, so every push the kernel queued would have dead-lettered as "a push goes to an https address
 * on a public host"; and the 410 the deliverer acked as `{ gone: true }` was dropped by `makeDeliver` and never reached
 * `ackOutbox`, because `pump` had no way to carry it. What is proved here is the join, against a push service that is a
 * function and a record that is the real kernel over `node:sqlite`.
 *
 * THE VAPID PAIR IS MADE IN MEMORY AND THROWN AWAY, as `vapid.test.ts` says why. No key is written anywhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { b64url } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '@braindog/record';

import { fixedClock, openSqlite, type NodeSql } from '../../../packages/kernel/test/sqlite.ts';
import { delivers, leasedTarget, makeDeliver } from '../src/deliver.ts';
import { pump, type Leasable } from '../src/pump.ts';
import { vapidKeys, type Vapid } from '../src/vapid.ts';
import { bundled } from './bundled-worker.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const HOUR = 3_600_000;
const PHONE = 'https://fcm.googleapis.com/fcm/send/ada-phone-7f3a';
/* A real P-256 point and a 16-byte secret in the shape `PushSubscription.toJSON()` gives, as the record's test uses. */
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const ADA: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const fromB64url = (text: string): Uint8Array =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function throwaway(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const point = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(point), privateKey: d! };
}

/** One owner with one phone subscribed through the record's own door, and a rule that interrupts on every new task. */
async function studio() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, delivers: ['notify.email', 'notify.push'] as never });
  const made = await api.createRecord({
    id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' },
  } as never);
  assert.ok(made.ok, JSON.stringify(made));
  const subscribed = await api.subscribePush({ endpoint: PHONE, expirationTime: null, keys: KEYS }, ADA);
  assert.ok(subscribed.ok, JSON.stringify(subscribed));
  const installed = await api.kernel.install([
    { id: 'register.tasks', kind: 'register', body: { id: 'tasks', name: 'Tasks', one: 'task', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } },
    { id: 'rule.urgent', kind: 'rule', body: { rule: 'urgent', register: 'tasks', on: 'create', once_per: ['row'], then: [{ notify: { say: 'A payment failed', urgent: true } }] } },
  ] as never);
  assert.ok(installed.ok, JSON.stringify(installed));
  const interrupt = (what: string) => assert.ok(api.kernel.create('tasks', { what }, { actor: 'p_1' }).ok);
  return { api, sql, clock, interrupt };
}

/** The record as `pump` reaches it through `Record$`: lease the kinds this deployment delivers, and ack what came back. */
function leasable(kernel: Awaited<ReturnType<typeof studio>>['api']['kernel'], env: { VAPID_PUBLIC?: string; VAPID_PRIVATE?: string }): Leasable {
  return {
    lease: async (n = 10) => kernel.leaseOutbox(delivers(env), n),
    ack: async (done) => {
      const out = kernel.ackOutbox(done);
      assert.ok(out.ok, JSON.stringify(out));
    },
  };
}

type Sent = { endpoint: string; headers: Record<string, string> };

function pushService(status: () => number) {
  const sent: Sent[] = [];
  return { sent, send: async (endpoint: string, headers: Record<string, string>) => (sent.push({ endpoint, headers }), { status: status() }) };
}

const phones = (sql: NodeSql) => sql.all<{ endpoint: string; used_at: string | null }>('SELECT endpoint, used_at FROM push_sub').map((r) => ({ ...r }));
const pushes = (sql: NodeSql) => sql.all<{ state: string }>("SELECT state FROM outbox WHERE kind = 'notify.push' ORDER BY id").map((r) => r.state);

test('AN INTERRUPT REACHES THE PHONE: queued by id, leased, addressed under the lease, signed, sent, and the row marked used', async () => {
  const { api, sql, clock, interrupt } = await studio();
  const pair = await throwaway();
  const vapid = (await vapidKeys(pair.publicKey, pair.privateKey)) as Vapid;
  let status = 201;
  const service = pushService(() => status);
  const deliver = makeDeliver({
    email: async () => {},
    from: 'notify@brain.example',
    push: { vapid, subject: 'mailto:hello@brain.dog', send: service.send, target: leasedTarget(async (args) => api.kernel.pushTarget(args)) },
  });
  const record = leasable(api.kernel, { VAPID_PUBLIC: pair.publicKey, VAPID_PRIVATE: pair.privateKey });

  interrupt('Invoice 41');
  const pass = await pump(record, deliver);
  assert.deepEqual(pass, { sent: 2, failed: 0, unacked: 0 }, 'the push and the email did not both go');

  assert.equal(service.sent.length, 1, 'the phone was not rung once');
  const [{ endpoint, headers }] = service.sent as [Sent];
  assert.equal(endpoint, PHONE);
  /* WHAT THE PUSH SERVICE CHECKS: the token verifies under the `k=` key in the same header. */
  const auth = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(headers['Authorization'] ?? '');
  assert.ok(auth, `not an RFC 8292 header: ${headers['Authorization']}`);
  const pub = await crypto.subtle.importKey('raw', fromB64url(auth[4]!), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(
    await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(auth[3]!), new TextEncoder().encode(`${auth[1]}.${auth[2]}`)),
    'the token does not verify under the key the header carries',
  );
  assert.deepEqual(pushes(sql), ['done']);
  assert.deepEqual(phones(sql), [{ endpoint: PHONE, used_at: new Date(NOW).toISOString() }], 'the record was not told the push went');

  /* AN HOUR ON, THE PHONE HAS BEEN RESET: the service answers 410, and the record forgets it rather than asking eight times. */
  clock.set(NOW + HOUR + 1000);
  status = 410;
  interrupt('Invoice 42');
  const second = await pump(record, deliver);
  assert.equal(second.failed, 0, 'a gone phone was acked as a failure and would walk the ladder');
  assert.equal(service.sent.length, 2);
  assert.deepEqual(phones(sql), [], 'the subscription the push service called gone is still kept');
  assert.deepEqual(pushes(sql), ['done', 'done']);
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'retry'").length, 0, 'a retry was armed for a phone that is gone');

  /* AND THE NEXT INTERRUPT QUEUES NO PUSH AT ALL, because there is nobody left to ring. */
  clock.set(NOW + 2 * HOUR + 2000);
  interrupt('Invoice 43');
  assert.equal(pushes(sql).length, 2);
  sql.close();
});

test('WITHOUT BOTH KEYS NOTHING IS LEASED FOR A PUSH, so the job waits as it always has and no service is asked', async () => {
  const { api, sql, interrupt } = await studio();
  const service = pushService(() => 201);
  const deliver = makeDeliver({ email: async () => {}, from: 'notify@brain.example' });
  const pair = await throwaway();
  interrupt('Invoice 41');
  for (const env of [{}, { VAPID_PUBLIC: pair.publicKey }, { VAPID_PRIVATE: pair.privateKey }]) {
    const pass = await pump(leasable(api.kernel, env), deliver);
    assert.equal(pass.failed, 0, `a push was leased with ${JSON.stringify(Object.keys(env))}`);
  }
  assert.deepEqual(pushes(sql), ['pending']);
  assert.equal(service.sent.length, 0);
  sql.close();
});

test('A PHONE UNSUBSCRIBED BETWEEN THE QUEUE AND THE LEASE IS NOT RUNG, and the job is done rather than dead', async () => {
  const { api, sql, interrupt } = await studio();
  const pair = await throwaway();
  const vapid = (await vapidKeys(pair.publicKey, pair.privateKey)) as Vapid;
  const service = pushService(() => 201);
  const deliver = makeDeliver({
    email: async () => {},
    from: 'notify@brain.example',
    push: { vapid, subject: 'mailto:hello@brain.dog', send: service.send, target: leasedTarget(async (args) => api.kernel.pushTarget(args)) },
  });
  interrupt('Invoice 41');
  const off = await api.unsubscribePush({ endpoint: PHONE }, ADA);
  assert.ok(off.ok && off.value.removed);
  const pass = await pump(leasable(api.kernel, { VAPID_PUBLIC: pair.publicKey, VAPID_PRIVATE: pair.privateKey }), deliver);
  assert.equal(pass.failed, 0);
  assert.equal(service.sent.length, 0, 'a phone that turned push off was rung');
  assert.deepEqual(pushes(sql), ['done']);
  sql.close();
});

test('A PUSH AN OLDER BUILD QUEUED IS NOBODY TO RING, and the day the keys are set it is done rather than a dead letter', async () => {
  /* EVERY RECORD ALREADY HOLDS THESE. Until W58 an urgent notice and a digest's push channel wrote `{ title, url }`
     whether or not a phone or a key existed, and `DELIVERS` never leased them, so they sit `pending`. The kernel reads
     one as nobody to ring (`pushSubOf` in `packages/kernel/src/push.ts`). The deliverer threw on it instead, measured
     here before the fix: `failed: 1`, and eight such throws open a "could not be delivered" item in Decide for each
     one, on the day he sets the keys. */
  const { api, sql } = await studio();
  const pair = await throwaway();
  const vapid = (await vapidKeys(pair.publicKey, pair.privateKey)) as Vapid;
  const service = pushService(() => 201);
  const asked: string[] = [];
  const deliver = makeDeliver({
    email: async () => {},
    from: 'notify@brain.example',
    push: {
      vapid,
      subject: 'mailto:hello@brain.dog',
      send: service.send,
      target: leasedTarget(async (args) => (asked.push(args.outbox), api.kernel.pushTarget(args))),
    },
  });
  api.kernel.outbox('notify.push', { title: 'Payment failed on Invoice 41', url: '/' });
  const pass = await pump(leasable(api.kernel, { VAPID_PUBLIC: pair.publicKey, VAPID_PRIVATE: pair.privateKey }), deliver);
  assert.deepEqual(pass, { sent: 1, failed: 0, unacked: 0 }, 'a push queued by an older build walks the ladder to a dead letter');
  assert.equal(service.sent.length, 0, 'a push naming no subscription was sent somewhere');
  assert.deepEqual(asked, [], 'the record was asked for the address of a push that names no subscription');
  assert.deepEqual(pushes(sql), ['done']);
  sql.close();
});

test('AN ENDPOINT ON A PRIVATE ADDRESS IS NEVER POSTED TO, though the record kept it', async () => {
  /* THE RECORD CHECKS SHAPE AND NOT REACH (`packages/record/src/push.ts`), so `https://169.254.169.254/` is kept, and
     `postable()` here is the only thing between a subscription somebody typed and the platform's metadata service.
     Posting to the stored address unchecked, with `postable()` taken out, left every other test in this file green. */
  const { api, sql, interrupt } = await studio();
  const inside = await api.subscribePush({ endpoint: 'https://169.254.169.254/latest/meta-data', expirationTime: null, keys: KEYS }, ADA);
  assert.ok(inside.ok, 'the record refused an address it was expected to keep');
  const pair = await throwaway();
  const vapid = (await vapidKeys(pair.publicKey, pair.privateKey)) as Vapid;
  const service = pushService(() => 201);
  const deliver = makeDeliver({
    email: async () => {},
    from: 'notify@brain.example',
    push: { vapid, subject: 'mailto:hello@brain.dog', send: service.send, target: leasedTarget(async (args) => api.kernel.pushTarget(args)) },
  });
  interrupt('Invoice 41');
  const pass = await pump(leasable(api.kernel, { VAPID_PUBLIC: pair.publicKey, VAPID_PRIVATE: pair.privateKey }), deliver);
  assert.equal(pass.failed, 1, 'the push to a private address was not refused');
  assert.deepEqual(
    service.sent.map((s) => s.endpoint),
    [PHONE],
    'a push was posted to an address on a private network',
  );
  sql.close();
});

/* ── the key the app subscribes with ─────────────────────────────────────── */

const touched: string[] = [];
const trap = (name: string) =>
  new Proxy({}, { get: (_, key) => { touched.push(`${name}.${String(key)}`); throw new Error(`${name} was reached for the push key`); } });

async function askKey(path: string, vars: Record<string, string>, method = 'GET') {
  const { default: worker } = await bundled();
  const env = { PUBLIC_HOST: 'brain.example.test', RECORD: trap('RECORD'), DIRECTORY: trap('DIRECTORY'), INGRESS: trap('INGRESS'), ASSETS: trap('ASSETS'), ...vars };
  return worker.fetch(new Request(`https://brain.example.test${path}`, { method }), env, { waitUntil: () => {} });
}

test('GET /api/push/key ANSWERS THE PUBLIC KEY ONLY WHEN THE PAIR IS SET AND IS A PAIR, and null otherwise, asking nobody', async () => {
  touched.length = 0;
  const pair = await throwaway();
  const other = await throwaway();
  for (const path of ['/api/push/key', '/app/the-studio/api/push/key']) {
    const keyed = await askKey(path, { VAPID_PUBLIC: pair.publicKey, VAPID_PRIVATE: pair.privateKey });
    assert.equal(keyed.status, 200, await keyed.clone().text());
    assert.deepEqual(await keyed.json(), { key: pair.publicKey }, path);
    /* THE SAME RULE `delivers` HAS, so a toggle is drawn exactly where a push would be sent. A key from a pair that is not
       one would subscribe phones that every push service then refuses, after each browser has already said yes. */
    for (const vars of [{}, { VAPID_PUBLIC: '', VAPID_PRIVATE: '' }, { VAPID_PUBLIC: pair.publicKey }, { VAPID_PUBLIC: pair.publicKey, VAPID_PRIVATE: other.privateKey }]) {
      const none = await askKey(path, vars);
      assert.equal(none.status, 200);
      assert.deepEqual(await none.json(), { key: null }, `${path} with ${JSON.stringify(Object.keys(vars))}`);
    }
  }
  assert.deepEqual(touched, [], 'a record or the Directory was reached for a key that belongs to the deployment');
});
