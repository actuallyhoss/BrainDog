/**
 * Spark on the Worker (`src/spark.ts`): the person's own key from the vault, through the same port as the self-host, and the
 * daily look. The endpoint is a test double and every key an obviously fake value; nothing leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { sparkLook, workerSparkModel } from '../src/spark.ts';

const URL_ = 'https://gateway.example.test/v1/chat/completions';
const FAKE_KEK = '0'.repeat(64);
const FAKE_PERSON_KEY = 'fake-person-key-for-tests-only';

const net = () => {
  const sent: RequestInit[] = [];
  return { sent, send: async (_u: URL, init: RequestInit) => (sent.push(init), new Response('{"drafts":[]}', { status: 200 })) };
};

test('NO ENDPOINT OR NO KEK, NO MODEL: a hosted record says spark: false and the rules draft', () => {
  const api = () => ({ kernel: { grants: () => [] } }) as never;
  assert.equal(workerSparkModel({}, api), undefined);
  assert.equal(workerSparkModel({ SPARK_ENDPOINT: URL_ }, api), undefined, 'a model was built with no way to open a key');
  assert.equal(workerSparkModel({ SPARK_ENDPOINT: '', KEK: FAKE_KEK }, api), undefined);
});

test("THE PERSON'S OWN KEY, labelled spark in the vault, is opened on each call and sent only as the call's authorization", async () => {
  const opened: string[] = [];
  let grants = [
    { id: 'g_old', label: 'spark', revoked_at: '2026-09-01T00:00:00.000Z' },
    { id: 'g_other', label: 'example read', revoked_at: null },
  ];
  const api = () => ({ kernel: { grants: () => grants } }) as never;
  const wire = net();
  const model = workerSparkModel({ SPARK_ENDPOINT: URL_, SPARK_MODEL: 'small', KEK: FAKE_KEK }, api, {
    send: wire.send,
    open: () => async (grant) => (opened.push(grant.id), FAKE_PERSON_KEY),
  });
  assert.ok(model);

  /* NO LIVE SPARK KEY YET: called with none, and nothing opened. An operator key is never read here, even when set. */
  await model.draft({} as never);
  assert.deepEqual(opened, []);
  assert.equal((wire.sent[0]!.headers as Record<string, string>).authorization, undefined);

  /* A KEY PUT IN AFTER BOOT COUNTS ON THE NEXT CALL. */
  grants = [...grants, { id: 'g_new', label: 'spark', revoked_at: null }];
  await model.draft({ usage: {} } as never);
  assert.deepEqual(opened, ['g_new']);
  assert.equal((wire.sent[1]!.headers as Record<string, string>).authorization, `Bearer ${FAKE_PERSON_KEY}`);
  const body = String(wire.sent[1]!.body);
  assert.ok(!body.includes(FAKE_PERSON_KEY), 'the key went into what the model reads');
  assert.equal((JSON.parse(body) as { model: string }).model, 'small');

  const env = { SPARK_ENDPOINT: URL_, KEK: FAKE_KEK, SPARK_KEY: 'fake-operator-key' } as never;
  const hosted = workerSparkModel(env, api, { send: wire.send, open: () => async () => FAKE_PERSON_KEY });
  await hosted!.draft({} as never);
  assert.equal((wire.sent[2]!.headers as Record<string, string>).authorization, `Bearer ${FAKE_PERSON_KEY}`, 'an operator key was used on a hosted record');
});

test('THE DAILY LOOK runs once a day on a real record and never throws out of an alarm', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 17, 12));
  const api = await createRecordApi({ sql, clock });
  await sparkLook(api);
  assert.equal(api.kernel.prefsOf('spark')['spark.last'], '2026-09-17');
  assert.deepEqual(await api.sparkTick(), { ran: false, why: 'today' });
  await sparkLook({ sparkTick: async () => { throw new Error('offline'); } } as never);
  sql.close();
});
