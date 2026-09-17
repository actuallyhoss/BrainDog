/**
 * A rail that follows a person: `setPref` keeps their nav order and the pages they hid, and `boot` answers them.
 *
 * PER PERSON, so a second device and a second person each see their own. A token has no rail, and a key outside the
 * closed list, or a value that is not a list of addresses, is refused before anything is kept.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_ada', level: 'owner' } };
const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'read' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_ada', level: 'owner' } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)) });
  return { api, sql };
}

const prefsOf = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext) => {
  const out = await api.boot(ctx);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.me.prefs;
};

test('A HIDDEN PAGE IS KEPT FOR THE PERSON WHO HID IT, and boot answers it to them and nobody else', async () => {
  const { api, sql } = await record();
  assert.deepEqual(await prefsOf(api, ada), {});

  const hid = await api.setPref({ key: 'nav.hidden', value: ['/p/money', '/p/money', '/p/kiln'] }, ada);
  assert.ok(hid.ok, JSON.stringify(hid));
  assert.deepEqual(hid.value, { key: 'nav.hidden', value: ['/p/money', '/p/kiln'] }, 'an address named twice was kept twice');
  await api.setPref({ key: 'nav.order', value: ['/p/kiln', '/p/money'] }, ada);

  assert.deepEqual(await prefsOf(api, ada), { 'nav.hidden': ['/p/money', '/p/kiln'], 'nav.order': ['/p/kiln', '/p/money'] });
  assert.deepEqual(await prefsOf(api, bo), {}, "somebody else's rail followed Ada's");
  assert.equal(await prefsOf(api, agent), undefined, 'a token was answered a rail');

  /* Shown again: the list without it, and null takes the key away. */
  await api.setPref({ key: 'nav.hidden', value: ['/p/kiln'] }, ada);
  assert.deepEqual((await prefsOf(api, ada))?.['nav.hidden'], ['/p/kiln']);
  await api.setPref({ key: 'nav.hidden', value: null }, ada);
  assert.deepEqual(await prefsOf(api, ada), { 'nav.order': ['/p/kiln', '/p/money'] });
  sql.close();
});

test('A TOKEN, A KEY OUTSIDE THE LIST AND A VALUE THAT IS NOT ADDRESSES ARE REFUSED, and nothing is kept', async () => {
  const { api, sql } = await record();
  const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string } }).refusal.code);
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: ['/p/money'] }, agent)), 'FORBIDDEN');
  assert.equal(code(await api.setPref({ key: 'theme', value: ['/p/money'] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: 'money' }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: ['money'] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: Array.from({ length: 501 }, (_, i) => `/p/${i}`) }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: [], extra: 1 } as never, ada)), 'FIELD_UNKNOWN');
  assert.deepEqual(await prefsOf(api, ada), {});
  /* A reader may arrange their own rail: it changes nothing anybody else sees. */
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: ['/p/money'] }, bo)), 'ok');
  sql.close();
});
