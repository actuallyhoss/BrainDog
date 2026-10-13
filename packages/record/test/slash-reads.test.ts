/**
 * `slashReads`, the one switch for Slash's background reading (ENG-A09).
 *
 * WHY THIS FILE EXISTS. The consent rule says background reading is on until the owner says otherwise and has one switch.
 * Asserted here: it is on by default, an owner in a browser turns it off and on, no argument reads it without changing
 * it, a member and a token are refused, it is not the daily look's switch, and the answer holds no id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const MEMBER: CallContext = { principal: { kind: 'person', id: 'p_member', level: 'write' } };
const AGENT: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };
const T0 = Date.UTC(2026, 9, 13, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const studio = async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(T0) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  return api;
};

test('ON UNTIL THE OWNER SAYS OTHERWISE, and no argument reads it without writing a pref', async () => {
  const api = await studio();
  assert.deepEqual(await api.slashReads(undefined, OWNER), { ok: true, value: { on: true } });
  assert.deepEqual(await api.slashReads({}, OWNER), { ok: true, value: { on: true } });
  assert.equal('slash.reads' in api.kernel.prefsOf('slash'), false);
});

test('AN OWNER IN A BROWSER TURNS IT OFF AND ON, kept as false for off and nothing for on', async () => {
  const api = await studio();
  assert.deepEqual(await api.slashReads({ on: false }, OWNER), { ok: true, value: { on: false } });
  assert.equal(api.kernel.prefsOf('slash')['slash.reads'], false);
  assert.deepEqual(await api.slashReads(undefined, OWNER), { ok: true, value: { on: false } });
  assert.deepEqual(await api.slashReads({ on: true }, OWNER), { ok: true, value: { on: true } });
  assert.notEqual(api.kernel.prefsOf('slash')['slash.reads'], false);
  assert.deepEqual(await api.slashReads(undefined, OWNER), { ok: true, value: { on: true } });
});

test('A MEMBER AND A TOKEN ARE REFUSED, to read it or to set it, and nothing is written', async () => {
  const api = await studio();
  for (const who of [MEMBER, AGENT]) {
    assert.equal((await api.slashReads({ on: false }, who) as Out).ok, false);
    assert.equal((await api.slashReads(undefined, who) as Out).ok, false);
  }
  assert.equal((await api.slashReads({ on: false }, AGENT) as Out).refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.deepEqual(await api.slashReads(undefined, OWNER), { ok: true, value: { on: true } });
});

test('ANYTHING BUT true OR false IS REFUSED BY NAME, and so is a key the call does not take', async () => {
  const api = await studio();
  const word = await api.slashReads({ on: 'no' }, OWNER) as Out;
  assert.equal(word.refusal?.code, 'VALUE_MALFORMED');
  assert.equal(word.refusal?.at, 'on');
  const extra = await api.slashReads({ on: false, daily: false } as never, OWNER) as Out;
  assert.equal(extra.refusal?.code, 'FIELD_UNKNOWN');
  assert.equal(extra.refusal?.at, 'daily');
  assert.deepEqual(await api.slashReads(undefined, OWNER), { ok: true, value: { on: true } });
});

test("IT IS NOT THE DAILY LOOK'S SWITCH: each keeps its own pref", async () => {
  const api = await studio();
  assert.ok((await api.slashReads({ on: false }, OWNER) as Out).ok);
  assert.equal(((await api.slashDaily({ on: true }, OWNER) as Out).value as { on: boolean }).on, true);
  assert.deepEqual(await api.slashReads(undefined, OWNER), { ok: true, value: { on: false } });
  assert.ok((await api.slashDaily({ on: false }, OWNER) as Out).ok);
  assert.ok((await api.slashReads({ on: true }, OWNER) as Out).ok);
  assert.equal(api.kernel.prefsOf('slash')['slash.daily'], false);
});

test('THE ANSWER NAMES NO ID: one word, on, and nothing of who asked or which record', async () => {
  const api = await studio();
  const out = await api.slashReads({ on: false }, OWNER) as Out;
  assert.deepEqual(Object.keys(out.value as object), ['on']);
  assert.doesNotMatch(JSON.stringify(out), /p_owner|rec_|01JZ8QK3F7R2M9V4XN6TCB5HAD/);
});
