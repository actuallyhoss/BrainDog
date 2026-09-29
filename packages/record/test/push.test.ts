/**
 * A phone asks to be told: `subscribePush` and `unsubscribePush`, each person's own.
 *
 * The kernel's half is `packages/kernel/test/push.test.ts`, and the host's routing of these two is
 * `packages/host/test/push-routes.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_ada', level: 'owner' } };
const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'read' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_ada', level: 'owner' } };

const PHONE = 'https://fcm.googleapis.com/fcm/send/ada-phone-7f3a';
/* A real P-256 point, uncompressed (65 bytes, leading 0x04), and a 16-byte secret, as `PushSubscription.toJSON()` gives. */
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string; at?: string } }).refusal.code);

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)) });
  const held = (person: string) =>
    sql.all<{ endpoint: string }>('SELECT endpoint FROM push_sub WHERE person_id = ? ORDER BY id', person).map((r) => r.endpoint);
  return { api, sql, held };
}

test('A SUBSCRIPTION IS KEPT FOR THE PERSON WHO MADE IT, and nobody else can take it away', async () => {
  const { api, sql, held } = await record();
  const made = await api.subscribePush({ endpoint: PHONE, expirationTime: null, keys: KEYS }, ada);
  assert.ok(made.ok, JSON.stringify(made));
  assert.deepEqual(held('p_ada'), [PHONE]);
  assert.deepEqual(held('p_bo'), [], "Ada's phone was kept for Bo");

  /* THE SAME PHONE ASKING AGAIN IS ONE ROW, with the keys it sent this time. */
  assert.equal(code(await api.subscribePush({ endpoint: PHONE, keys: { ...KEYS, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } }, ada)), 'ok');
  assert.deepEqual(held('p_ada'), [PHONE]);
  assert.equal(sql.one<{ auth: string }>('SELECT auth FROM push_sub')?.auth, 'AAAAAAAAAAAAAAAAAAAAAA');

  /* Bo naming Ada's endpoint takes nothing of hers: removed is false, and her row is still there. */
  const theirs = await api.unsubscribePush({ endpoint: PHONE }, bo);
  assert.ok(theirs.ok && theirs.value.removed === false, JSON.stringify(theirs));
  assert.deepEqual(held('p_ada'), [PHONE]);

  const mine = await api.unsubscribePush({ endpoint: PHONE }, ada);
  assert.ok(mine.ok && mine.value.removed === true, JSON.stringify(mine));
  assert.deepEqual(held('p_ada'), []);
  sql.close();
});

test('A TOKEN, AN ADDRESS THAT IS NOT https AND KEYS OF THE WRONG LENGTH ARE REFUSED, and nothing is kept', async () => {
  const { api, sql, held } = await record();
  assert.equal(code(await api.subscribePush({ endpoint: PHONE, keys: KEYS }, agent)), 'FORBIDDEN');
  assert.equal(code(await api.unsubscribePush({ endpoint: PHONE }, agent)), 'FORBIDDEN');
  assert.equal(code(await api.subscribePush({ endpoint: 'http://push.example/x', keys: KEYS }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.subscribePush({ endpoint: 'https://user:pw@push.example/x', keys: KEYS }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.subscribePush({ endpoint: 'not a url', keys: KEYS }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.subscribePush({ endpoint: PHONE, keys: { ...KEYS, p256dh: 'tBHItJI5svbpez7KI4CCXg' } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.subscribePush({ endpoint: PHONE, keys: { ...KEYS, auth: 'not base64url!' } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.subscribePush({ endpoint: PHONE }, ada)), 'REQUIRED_MISSING');
  assert.equal(code(await api.subscribePush({ endpoint: PHONE, keys: KEYS, extra: 1 }, ada)), 'FIELD_UNKNOWN');
  assert.equal(code(await api.subscribePush(undefined, ada)), 'REQUIRED_MISSING');
  assert.deepEqual(held('p_ada'), []);
  /* A reader may ask to be told: it is their own phone, and it changes nothing anybody else sees. */
  assert.equal(code(await api.subscribePush({ endpoint: PHONE, keys: KEYS }, bo)), 'ok');
  sql.close();
});

test('ONE PERSON KEEPS THEIR NEWEST TEN, so a browser that rotates its endpoint cannot grow the table without end', async () => {
  const { api, sql, held } = await record();
  for (let i = 0; i < 12; i++) assert.equal(code(await api.subscribePush({ endpoint: `${PHONE}-${i}`, keys: KEYS }, ada)), 'ok');
  assert.deepEqual(held('p_ada'), Array.from({ length: 10 }, (_, i) => `${PHONE}-${i + 2}`));
  sql.close();
});
