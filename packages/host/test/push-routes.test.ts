/**
 * The host's table routes `subscribePush` and `unsubscribePush`, as POSTs, to the record. Brief W58-2.
 *
 * A METHOD THE RECORD HAS AND THE TABLE LACKS IS `ROUTE_UNKNOWN` TO EVERY CLIENT, so the two rows W58-2 added to `ROUTES`
 * are held here, and so is the POST: each keeps or removes a `push_sub` row. Written by the W58-2 agent and run from its
 * scratchpad, because this directory was outside its list, and moved here with relative imports when the two halves of
 * push were joined.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_ada', level: 'owner' } };

const PHONE = 'https://fcm.googleapis.com/fcm/send/ada-phone-7f3a';
/* A real P-256 point, uncompressed (65 bytes, leading 0x04), and a 16-byte secret, as `PushSubscription.toJSON()` gives. */
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)) });
  const held = (person: string) =>
    sql.all<{ endpoint: string }>('SELECT endpoint FROM push_sub WHERE person_id = ? ORDER BY id', person).map((r) => r.endpoint);
  return { api, sql, held };
}

test('THE HOST ROUTES BOTH, as POSTs', async () => {
  const { api, sql, held } = await record();
  const handlers = handlersFor(api);
  const post = (name: string, body: unknown) =>
    serveApi(new Request(`https://record.test/api/${name}`, { method: 'POST', body: JSON.stringify(body) }), handlers, ada);
  const res = await post('subscribePush', { endpoint: PHONE, keys: KEYS });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(held('p_ada'), [PHONE]);
  assert.equal((await serveApi(new Request('https://record.test/api/unsubscribePush'), handlers, ada)).status, 405, 'a GET unsubscribed');
  assert.equal((await post('unsubscribePush', { endpoint: PHONE })).status, 200);
  assert.deepEqual(held('p_ada'), []);
  sql.close();
});
