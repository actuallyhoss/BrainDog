/**
 * BrainDog's own updates hold to what the person did (research-audit-21 items 5 and 6): a declaration the person took
 * off is never laid again unasked, since the tick reads what was taken off from the declaration log; and an update the
 * owner said no to is remembered for that version, so it is neither asked again nor put in on a later night; and a
 * carry that throws after an update went in is said, and the night goes on (item 7). THE AGENTS PACK AND A USE CASE ARE
 * HELD TO THE SAME (`loop/research-audit-30.md`, Medium 3): the tick lends `remembers`, so one that would lose something
 * is asked about once, and a no is kept for its version as it is for the five modules.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_PARTY_VERSIONS, firstPartyDocument } from '@braindog/seed/packs';
import { shippedVersion } from '@braindog/seed/packs/quiet';
import { modulesFor, useCase } from '@braindog/seed/usecases';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';
import { seedCatalogue } from '../../seed/src/usecases/catalogue.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record holding Portfolio at 1.0.0, put in as an owner installs one, with its rule then taken off by the owner. */
async function record(now: { at: number }) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now.at } as never, catalogue: seedCatalogue() });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const doc = { ...firstPartyDocument('portfolio', { holds: [], seeds: [] })!, version: '1.0.0' };
  delete (doc as { seeds?: unknown }).seeds;
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc, source: { kind: 'local' } }, owner));
  value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash }, owner));
  value(await api.retireDeclaration({ id: 'rule.project-past-aim' }, owner));
  return { api, sql };
}

const held = (api: Awaited<ReturnType<typeof createRecordApi>>) => api.kernel.packStates().find((p) => p.id === 'portfolio')?.version;
const live = (sql: ReturnType<typeof openSqlite>, id: string) => sql.one("SELECT 1 AS y FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0", id) !== undefined;
const asked = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ id: string; status: string }>("SELECT id, status FROM suggestion WHERE body_kind = 'pack' AND opened_by = 'system' ORDER BY rowid");

test('WHAT THE OWNER TOOK OFF IS ASKED ABOUT, NEVER LAID AGAIN UNASKED, and a no holds for that version', async () => {
  const now = { at: Date.UTC(2026, 9, 6, 3) };
  const { api, sql } = await record(now);
  await api.slashTick();
  /* NOT PUT IN: the newer Portfolio would bring back the rule he took off, so it is one question instead. */
  assert.equal(held(api), '1.0.0');
  assert.equal(live(sql, 'rule.project-past-aim'), false);
  const first = asked(sql);
  assert.equal(first.length, 1, JSON.stringify(api.kernel.prefsOf('braindog:updates')));
  assert.match(api.kernel.question(first[0]!.id) ?? '', /which you took off/u);
  /* HE SAYS NO. */
  value(await api.decide({ id: first[0]!.id, decide: { option: 'reject', reason: 'I took that off on purpose.' } }, owner));
  assert.deepEqual(api.kernel.prefsOf('braindog:updates').declined, { portfolio: FIRST_PARTY_VERSIONS.portfolio });
  /* THE NEXT NIGHT ASKS NOTHING AND PUTS NOTHING IN. */
  now.at += 86_400_000;
  await api.slashTick();
  assert.equal(asked(sql).length, 1);
  assert.equal(held(api), '1.0.0');
  sql.close();
});

test('A CARRY THAT THROWS AFTER AN UPDATE WENT IN IS SAID, AND THE NIGHT GOES ON (research-audit-21 item 7)', async () => {
  const now = { at: Date.UTC(2026, 9, 6, 3) };
  const sql = openSqlite();
  const catalogue = seedCatalogue().map((e) =>
    e.id === 'portfolio'
      ? {
          ...e,
          carry: () => {
            throw new Error('carry broke');
          },
        }
      : e,
  );
  const api = await createRecordApi({ sql, clock: { now: () => now.at } as never, catalogue: catalogue as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const doc = { ...firstPartyDocument('portfolio', { holds: [], seeds: [] })!, version: '1.0.0' };
  delete (doc as { seeds?: unknown }).seeds;
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc, source: { kind: 'local' } }, owner));
  value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash }, owner));
  await api.slashTick();
  assert.equal(held(api), FIRST_PARTY_VERSIONS.portfolio);
  const steps = (api.kernel.prefsOf('braindog:updates')['first-party'] as { steps: string[] }).steps;
  assert.deepEqual(steps, [`Portfolio was updated to ${FIRST_PARTY_VERSIONS.portfolio}.`, 'Portfolio was updated, and moving what it kept from before stopped partway.']);
  sql.close();
});

/**
 * THE AGENTS PACK AND A USE CASE, EACH ON A RECORD THAT HOLDS IT AT AN OLDER VERSION with one of its pages taken off by
 * the owner. Each document is the one the host offers (`seedCatalogue`), which is what a yes would install, under an
 * older version; the newer one would lay the page again, which is asked about and never done unasked.
 */
const NOT_THE_FIVE: { pack: string; before: readonly string[]; off: string }[] = [
  { pack: 'agents', before: ['portfolio'], off: 'page.skill' },
  { pack: 'usecase-founder', before: modulesFor(useCase('founder')!, ['people']).filter((m) => m !== 'agents'), off: 'page.dashboard' },
];

for (const { pack, before, off } of NOT_THE_FIVE)
  test(`AN UPDATE TO ${pack} THAT WOULD BRING BACK WHAT THE OWNER TOOK OFF is asked once, and a no holds for that version`, async () => {
    const now = { at: Date.UTC(2026, 9, 6, 3) };
    const sql = openSqlite();
    const catalogue = seedCatalogue();
    const api = await createRecordApi({ sql, clock: { now: () => now.at } as never, catalogue });
    assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
    const put = async (id: string, version?: string): Promise<void> => {
      const offered = catalogue.find((e) => e.id === id)!.doc({ holds: [...api.kernel.registers()].map(([list]) => list), usecase: pack.replace(/^usecase-/u, '') })!;
      const doc = version === undefined ? offered : { ...offered, version };
      const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc, source: { kind: 'local' } }, owner));
      value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash }, owner));
    };
    for (const id of before) await put(id);
    await put(pack, '1.0.0');
    value(await api.retireDeclaration({ id: off }, owner));
    const version = (): string | null | undefined => api.kernel.packStates().find((p) => p.id === pack)?.version;
    const to = shippedVersion(pack)!;
    assert.notEqual(to, '1.0.0');

    await api.slashTick();
    /* NOT PUT IN, AND NOT LEFT WAITING TO BE UPDATED BY HAND: one question, kept with the version it asks about. */
    assert.equal(version(), '1.0.0');
    assert.equal(live(sql, off), false);
    const first = asked(sql);
    assert.equal(first.length, 1, JSON.stringify(api.kernel.prefsOf('braindog:updates')));
    assert.match(api.kernel.question(first[0]!.id) ?? '', /which you took off/u);
    assert.deepEqual(api.kernel.prefsOf('braindog:updates:asked')[first[0]!.id], { pack, version: to });
    /* THE BUILD THE TICK RAN WITH IS SAID WITH THIS PACK'S VERSION IN IT, so a build that moves only this one runs at once. */
    const ran = JSON.parse((api.kernel.prefsOf('braindog:updates')['first-party'] as { versions: string }).versions) as [string, string][];
    assert.deepEqual(ran.find(([id]) => id === pack), [pack, to]);
    assert.deepEqual(ran.map(([id]) => id), ran.map(([id]) => id).sort());
    /* THE NEXT NIGHT, STILL OPEN, IT IS NOT ASKED A SECOND TIME. */
    now.at += 86_400_000;
    await api.slashTick();
    assert.equal(asked(sql).length, 1);
    /* THE OWNER SAYS NO, and it is kept for that version. */
    value(await api.decide({ id: first[0]!.id, decide: { option: 'reject', reason: 'I took that off on purpose.' } }, owner));
    assert.deepEqual(api.kernel.prefsOf('braindog:updates').declined, { [pack]: to });
    /* THE NIGHT AFTER ASKS NOTHING AND PUTS NOTHING IN. */
    now.at += 86_400_000;
    await api.slashTick();
    assert.equal(asked(sql).length, 1);
    assert.equal(version(), '1.0.0');
    assert.equal(live(sql, off), false);
    sql.close();
  });
