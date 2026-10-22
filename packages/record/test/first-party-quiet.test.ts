/**
 * BrainDog's own updates reach a record on their own: from the host's tick, a first-party module this
 * build ships newer than the record holds goes in when its plan loses nothing, once a deploy and once a day, whether
 * Slash is on or not, and what happened is kept in names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_PARTY_VERSIONS, firstPartyDocument } from '@braindog/seed/packs';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record holding Portfolio at an older version than this build ships, put in as an owner installs one. */
async function record(now: { at: number }) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now.at } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const doc = { ...firstPartyDocument('portfolio', { holds: [], seeds: [] })!, version: '1.0.0' };
  delete (doc as { seeds?: unknown }).seeds;
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc, source: { kind: 'local' } }, owner));
  value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash }, owner));
  return { api, sql };
}

const held = (api: Awaited<ReturnType<typeof createRecordApi>>, id: string) => api.kernel.packStates().find((p) => p.id === id)?.version;

test('A NEWER FIRST-PARTY MODULE THAT LOSES NOTHING GOES IN ON THE TICK, said in names, and once a day', async () => {
  const now = { at: Date.UTC(2026, 9, 6, 3) };
  const { api, sql } = await record(now);
  assert.equal(held(api, 'portfolio'), '1.0.0');
  /* SLASH OFF CHANGES NOTHING: keeping the record's own modules current is not Slash's look. */
  api.kernel.setPref('slash', 'slash.daily', false);
  await api.slashTick();
  assert.equal(held(api, 'portfolio'), FIRST_PARTY_VERSIONS.portfolio);
  const kept = api.kernel.prefsOf('braindog:updates')['first-party'] as { steps: string[]; day: string };
  assert.deepEqual(kept.steps, [`Portfolio was updated to ${FIRST_PARTY_VERSIONS.portfolio}.`]);
  assert.equal(kept.day, '2026-10-06');
  /* ONCE A DAY WHILE THE BUILD IS THE SAME: the same day's tick does not plan again, the next day's does. */
  api.kernel.setPref('braindog:updates', 'first-party', { ...kept, steps: ['kept'] });
  await api.slashTick();
  assert.deepEqual((api.kernel.prefsOf('braindog:updates')['first-party'] as { steps: string[] }).steps, ['kept']);
  now.at += 86_400_000;
  await api.slashTick();
  assert.deepEqual((api.kernel.prefsOf('braindog:updates')['first-party'] as { steps: string[] }).steps, []);
  sql.close();
});
