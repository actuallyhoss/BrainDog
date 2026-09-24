/**
 * A record made when every first-party pack was 1.0.0, against this host's catalogue: only the packs that changed since
 * are offered as updates, and taking them keeps every row the record holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createRecordApi, type CallContext } from '@braindog/record';
import { FIRST_PARTY, FIRST_PARTY_VERSIONS } from '@braindog/seed';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't', scope: 'propose', person: 'p_1', level: 'owner' } };

const OLD = JSON.parse(readFileSync(new URL('../../../packages/seed/test/fixtures/first-party-1.0.0.json', import.meta.url), 'utf8')) as Record<string, Record<string, unknown>>;

const said = <T>(r: unknown): T => {
  assert.ok((r as { ok: boolean }).ok, JSON.stringify(r));
  return (r as { value: T }).value;
};

test('A RECORD MADE AT 1.0.0 IS OFFERED ONLY THE PACKS THAT CHANGED, and updating keeps every row', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)), catalogue: seedCatalogue() });
  const k = api.kernel;

  for (const id of FIRST_PARTY) {
    const planned = said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc: OLD[id], source: { kind: 'local' } } as never, owner));
    said(await api.installPack({ doc: OLD[id], source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  }

  const as = { actor: 'p_1' };
  const kiln = said<{ id: string }>(k.create('things', { name: 'Kiln', lane: 'earning' }, as));
  const priya = said<{ id: string }>(k.create('people', { name: 'Priya' }, as));
  said(k.create('obligations', { what: 'Invoice 41', direction: 'owed_to_me', amount: { amount: 120_00, currency: 'GBP' }, due: '2026-09-30', state: 'open' }, as));
  const thread = said<{ id: string }>(k.create('tracks', { name: 'Specimen page', state: 'open', thing: kiln.id }, as));
  said(k.create('updates', { body: 'Half done.', health: 'on_track', track: thread.id, by: 'you', at: '2026-09-16T10:00:00Z' }, as));
  said(k.create('tasks', { what: 'Draft the copy', state: 'open', thing: kiln.id, track: thread.id }, as));
  said(k.create('tasks', { what: 'Set the grid', state: 'done', thing: kiln.id }, as));
  said(k.create('tasks', { what: 'Old idea', state: 'dropped' }, as));
  void priya;
  /* An agent's run is a row too, and proposing writes one: the lists compared are the packs'. */
  const lists = () => Object.fromEntries(Object.entries(k.census()).filter(([list]) => list !== 'session'));
  const before = lists();

  /* WHAT IS OFFERED: exactly the packs whose version went up. */
  const changed = FIRST_PARTY.filter((id) => FIRST_PARTY_VERSIONS[id] !== '1.0.0');
  assert.deepEqual([...changed].sort(), ['estate', 'money-core', 'people', 'portfolio', 'work']);
  const read = said<{ updates?: { id: string; from: string; to: string }[] }>(await api.arrangement({}, agent));
  assert.deepEqual(
    [...(read.updates ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    changed.sort().map((id) => ({ id, from: '1.0.0', to: FIRST_PARTY_VERSIONS[id] })),
  );

  /* TAKING THE UPDATES, as the owner accepts them. */
  for (const id of changed) {
    /* A PACK UPDATED ALREADY, as the module under one updated before it, is not asked for again. */
    if (said<{ packs: { id: string; version?: string }[] }>(await api.arrangement({}, agent)).packs.find((p) => p.id === id)?.version === FIRST_PARTY_VERSIONS[id]) continue;
    const filed = said<{ id: string }>(await api.propose({ question: `Update ${id}?`, body_kind: 'pack', body: { install: id } } as never, agent));
    said(await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  }
  const packs = said<{ packs: { id: string; version?: string }[]; updates?: unknown }>(await api.arrangement({}, agent));
  for (const id of FIRST_PARTY) assert.equal(packs.packs.find((p) => p.id === id)?.version, FIRST_PARTY_VERSIONS[id], id);
  assert.equal(packs.updates, undefined, 'nothing is offered once the updates are in');

  /* A PACK ALREADY AT ITS VERSION HAS NOTHING TO UPDATE, and asking says so. This was asked before the updates of a
     pack still at 1.0.0, People, until People 2.0.0 (M3 B9) left no first-party pack at 1.0.0; asked after them it is
     the same question of a pack with nothing new. */
  const same = await api.propose({ question: 'Update People?', body_kind: 'pack', body: { install: 'people' } } as never, agent);
  assert.equal((same as { ok: boolean }).ok, false);


  /* EVERY ROW IS STILL THERE, and the new fields are there to fill. */
  assert.deepEqual(lists(), before);
  const done = said<{ rows: { fields: Record<string, unknown> }[] }>(k.list({ register: 'tasks', limit: 50 })).rows;
  assert.deepEqual(done.map((r) => r.fields.what).sort(), ['Draft the copy', 'Old idea', 'Set the grid']);
  const moved = said<{ fields: Record<string, unknown> }>(k.update('tasks', 'tasks#1', { state: 'done', priority: 'high' }, as));
  assert.equal(typeof moved.fields.done_on, 'string', 'a task moved to done after the update is dated');
  sql.close();
});
