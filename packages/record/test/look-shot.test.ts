/**
 * `look.shot`, a person's own on or off beside `look.contrast`: `setPref` keeps it as the other `look.*` keys are kept,
 * and `boot` answers it on `me.prefs`. True or false and nothing else; `null` takes it away; a token is answered as it
 * is for `look.contrast`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, PREF_KEYS, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_ada', level: 'owner' } };
const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'read' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_ada', level: 'owner' } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 13, 12)) });
  return { api, sql };
}

type Api = Awaited<ReturnType<typeof record>>['api'];
const prefsOf = async (api: Api, ctx: CallContext) => {
  const out = await api.boot(ctx);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.me.prefs;
};
const refusal = (r: { ok: boolean }) => (r as unknown as { refusal: { code: string; fix: string } }).refusal;

test('look.shot IS KEPT FOR THE PERSON WHO SET IT: on, off, and null takes it away', async () => {
  const { api, sql } = await record();
  assert.ok(PREF_KEYS.includes('look.shot' as never), 'look.shot is not a key a person may set');

  const on = await api.setPref({ key: 'look.shot', value: true }, ada);
  assert.ok(on.ok, JSON.stringify(on));
  assert.deepEqual(on.value, { key: 'look.shot', value: true });
  assert.deepEqual(await prefsOf(api, ada), { 'look.shot': true });
  assert.deepEqual(await prefsOf(api, bo), {}, "somebody else's screen followed Ada's");

  /* OFF IS A CHOICE, kept as said, not the key gone. */
  const off = await api.setPref({ key: 'look.shot', value: false }, ada);
  assert.ok(off.ok, JSON.stringify(off));
  assert.deepEqual(off.value, { key: 'look.shot', value: false });
  assert.deepEqual(await prefsOf(api, ada), { 'look.shot': false });

  const gone = await api.setPref({ key: 'look.shot', value: null }, ada);
  assert.ok(gone.ok, JSON.stringify(gone));
  assert.deepEqual(await prefsOf(api, ada), {});
  sql.close();
});

test('look.shot TAKES TRUE OR FALSE AND NOTHING ELSE, refused in its own words, and nothing is kept', async () => {
  const { api, sql } = await record();
  await api.setPref({ key: 'look.shot', value: true }, ada);
  for (const value of ['yes', 'true', 1, 0, [], {}]) {
    const said = await api.setPref({ key: 'look.shot', value }, ada);
    assert.ok(!said.ok, `look.shot ${JSON.stringify(value)} was kept`);
    assert.equal(refusal(said).code, 'VALUE_MALFORMED', JSON.stringify(value));
    assert.equal(refusal(said).fix, 'look.shot is true or false, or null to take it away.');
  }
  assert.deepEqual(await prefsOf(api, ada), { 'look.shot': true }, 'a refused value changed what was kept');

  /* ONE MESSAGE WITH THE KEY IN IT: look.contrast is refused in the same words, under its own name. */
  const contrast = await api.setPref({ key: 'look.contrast', value: 'yes' }, ada);
  assert.ok(!contrast.ok);
  assert.equal(refusal(contrast).fix, 'look.contrast is true or false, or null to take it away.');
  sql.close();
});

test('A TOKEN IS ANSWERED FOR look.shot AS IT IS FOR look.contrast', async () => {
  const { api, sql } = await record();
  await api.setPref({ key: 'look.shot', value: true }, ada);
  for (const value of [false, null, 'yes']) {
    const shot = await api.setPref({ key: 'look.shot', value }, agent);
    const contrast = await api.setPref({ key: 'look.contrast', value }, agent);
    assert.equal(shot.ok, contrast.ok, JSON.stringify(value));
    if (!shot.ok && !contrast.ok) {
      assert.equal(refusal(shot).code, refusal(contrast).code, JSON.stringify(value));
      assert.equal(refusal(shot).fix, refusal(contrast).fix, JSON.stringify(value));
    }
  }
  assert.equal(await prefsOf(api, agent), undefined, 'a token was answered a look');
  assert.deepEqual(await prefsOf(api, ada), { 'look.shot': true }, "a token changed its person's look");
  sql.close();
});
