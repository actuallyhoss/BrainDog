/**
 * Profiles: each setup a person's agents run under (the app, the account it signs in as, how it is paid for, the
 * projects it serves) and every machine it is on, with what no longer matches there.
 *
 * BOTH LISTS ARE PERSONAL (`personal: true`), so only the owner's own session and his own keys read or write them: an
 * Admin, a grant naming them, a share, a link and a child key are all refused. The lists play the agents' part
 * `profiles` by declaring it, and Tools and Skills each gain a Profiles field (left empty, every profile gets it), with
 * `plugin` laid on Tools' kinds.
 *
 * Installed here as it ships, after Projects, People and Agents, through the add-on door a person presses, on a fixed
 * clock that the tests move to let a day pass. Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { agentLists, createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { agentsPackDocument, firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 9, 21, 9);
const DAY = 86_400_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): Refusal => {
  const x = r as Out;
  assert.ok(!x.ok && x.refusal, `expected a refusal, and the call answered ${String(JSON.stringify(x.value)).slice(0, 200)}`);
  return x.refusal!;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[] };
type Clock = ReturnType<typeof fixedClock>;
type Row = { id: string; seq: number; fields: Record<string, unknown>; state?: string | null };
type Field = { id: string; type: string; of?: string; to?: string; values?: string[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const file = (): Record<string, unknown> => JSON.parse(readFileSync(new URL('./profiles.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** A record with Projects, People and Agents, and this add-on when `withPack` says so. */
async function record(withPack = true): Promise<{ api: Api; sql: NodeSql; clock: Clock }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  said(await api.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF', slug: 'the-bench', name: 'The Bench', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'rowan@example.test', name: 'Rowan' } }));
  for (const id of ['portfolio', 'people']) await put(api, firstPartyDocument(id, { seeds: [] }));
  await put(api, agentsPackDocument());
  if (withPack) await put(api, file());
  return { api, sql, clock };
}

const fieldsOf = (api: Api, list: string): Field[] => ((api.kernel.register(list) as { fields?: Field[] } | undefined)?.fields ?? []) as Field[];
const rows = async (api: Api, register: string, ctx: CallContext = owner): Promise<Row[]> => said<{ rows: Row[] }>(await api.list({ register, limit: 100 } as never, ctx)).rows;
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** A machine's place for one profile, as the command line on that machine writes it. */
async function place(api: Api, profile: string, fields: Record<string, unknown>): Promise<Row> {
  return said<Row>(await api.create({ register: 'profile_places', fields: { copy_of: profile, ...fields } } as never, owner));
}

test('BEFORE THE ADD-ON: no profiles, no places, and Tools and Skills have no Profiles field', async () => {
  const { api, sql } = await record(false);
  for (const list of ['profiles', 'profile_places']) assert.equal(api.kernel.register(list), undefined, list);
  assert.equal(agentLists(api.kernel.registers()).profiles, undefined);
  for (const list of ['tools', 'skills']) assert.ok(!fieldsOf(api, list).some((f) => f.id === 'profiles'), list);
  assert.ok(!fieldsOf(api, 'tools').find((f) => f.id === 'kind')!.values!.includes('plugin'));
  sql.close();
});

test('THE FILE: profiles 1.0.0 on Agents 1.13, two personal lists, one figure, two automations and a page', () => {
  const doc = file() as { pack: string; version: string; requires: { packs: unknown }; declarations: Record<string, unknown>[]; seeds: unknown[] };
  assert.deepEqual([doc.pack, doc.version], ['profiles', '1.0.0']);
  assert.deepEqual(doc.requires.packs, { agents: '^1.13.0' });
  const lists = doc.declarations.filter((d) => d.register !== undefined && d.rule === undefined);
  assert.deepEqual(lists.map((d) => [d.register, d.personal]), [['profiles', true], ['profile_places', true]]);
  assert.deepEqual(doc.declarations.filter((d) => d.rule !== undefined).map((d) => d.rule), ['profile-drifted', 'place-quiet']);
  assert.ok(doc.seeds.length <= 2, 'at most two example profiles');
  assert.ok(!JSON.stringify(doc).includes('—'), 'no long dash in anything a person reads');
});

test('INSTALLED AS IT SHIPS: both lists personal, Profiles plays its part, and Tools and Skills gain a Profiles field', async () => {
  const { api, sql } = await record();
  assert.deepEqual([...api.kernel.personalLists()].sort(), ['profile_places', 'profiles']);
  assert.equal(agentLists(api.kernel.registers()).profiles, 'profiles');
  for (const list of ['tools', 'skills']) {
    const f = fieldsOf(api, list).find((x) => x.id === 'profiles');
    assert.ok(f, `${list} has no Profiles field`);
    assert.deepEqual([f.type, f.of, f.to], ['list', 'ref', 'profiles'], list);
  }
  assert.ok(fieldsOf(api, 'tools').find((f) => f.id === 'kind')!.values!.includes('plugin'));

  /* THE TWO EXAMPLE PROFILES, MARKED AS EXAMPLES. */
  const profiles = await rows(api, 'profiles');
  assert.deepEqual(profiles.map((r) => r.fields.name).sort(), ['Everyday', 'Second account']);
  assert.ok(profiles.every((r) => (r.fields.tags as string[] | undefined)?.includes('example')));

  /* A PLUGIN GIVEN TO ONE PROFILE, AND A TOOL LEFT FOR EVERY PROFILE. */
  const everyday = profiles.find((r) => r.fields.name === 'Everyday')!;
  const plugin = said<Row>(await api.create({ register: 'tools', fields: { name: 'Review helper', kind: 'plugin', profiles: [everyday.id] } } as never, owner));
  assert.deepEqual(plugin.fields.profiles, [everyday.id]);
  sql.close();
});

test('ONLY THE OWNER READS THEM: an Admin is refused both lists and the page, and still reads Tools', async () => {
  const { api, sql } = await record();
  const everyday = (await rows(api, 'profiles')).find((r) => r.fields.name === 'Everyday')!;
  /* OUT OF STEP FOR THREE DAYS WHEN IT IS WRITTEN, so the question about it is opened at once. */
  await place(api, everyday.id, { host: 'bench-laptop', drift: ['review-helper'], since: day(NOW - 3 * DAY), heard: new Date(NOW).toISOString() });
  said(await api.invite({ person: 'p_2', name: 'Sasha', level: 'decide' }, owner));
  const held = api.kernel.access('p_2')!;
  const admin: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, ...(held.registers === null ? {} : { registers: held.registers }), levels: held.levels };
  for (const register of ['profiles', 'profile_places']) {
    const no = refused(await api.list({ register } as never, admin));
    assert.equal(no.code, 'FORBIDDEN');
    assert.match(no.fix, /is personal/u);
  }
  said(await api.list({ register: 'tools' } as never, admin));
  const rail = said<{ registers: { id: string }[] }>(await api.boot(admin)).registers.map((r) => r.id);
  assert.ok(rail.includes('tools') && !rail.includes('profiles') && !rail.includes('profile_places'), rail.join(', '));
  const page = JSON.stringify(await api.page({ slug: 'profiles' } as never, admin));
  for (const word of ['Everyday', 'bench-laptop']) assert.ok(!page.includes(word), `the page showed ${word} to an Admin`);
  /* NOR IS SHE ASKED THE QUESTION ABOUT IT, which names the machine, while the owner is. */
  const open = async (ctx: CallContext) => JSON.stringify(said(await api.governance({ status: 'open' } as never, ctx)));
  assert.ok((await open(owner)).includes('bench-laptop'), 'the owner is not asked about the machine');
  assert.ok(!(await open(admin)).includes('bench-laptop'), 'an Admin is asked about the owner\'s machine');
  /* AND NO INVITATION NAMES THEM. */
  assert.equal(refused(await api.invite({ person: 'p_3', name: 'Kit', level: 'read', registers: { profiles: 'read' } }, owner)).code, 'FORBIDDEN');
  sql.close();
});

test('THE PAGE: a card for each profile, and each machine under the profile it carries, with what is out of step', async () => {
  const { api, sql } = await record();
  const everyday = (await rows(api, 'profiles')).find((r) => r.fields.name === 'Everyday')!;
  await place(api, everyday.id, { host: 'bench-laptop', drift: ['review-helper', 'rules file'], since: day(NOW), heard: new Date(NOW).toISOString() });
  await place(api, everyday.id, { host: 'studio-tower', heard: new Date(NOW).toISOString() });
  const page = said<{ blocks: { kind: string; heading?: string; rows?: Row[]; refusals?: unknown[]; readings?: { value: number }[] }[] }>(await api.page({ slug: 'profiles' } as never, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading ?? b.kind} was refused`);
  const cards = page.blocks.filter((b) => b.kind === 'cards');
  assert.deepEqual(cards.map((b) => b.heading), ['Profiles', 'Where each one is set up']);
  assert.equal(cards[0]!.rows!.length, 2);
  assert.deepEqual(cards[1]!.rows!.map((r) => r.fields.host).sort(), ['bench-laptop', 'studio-tower']);
  assert.equal(said<{ value: number }>(await api.metric({ metric: 'profiles-out-of-step' } as never, owner)).value, 1, 'one machine is out of step');
  sql.close();
});

test('A MACHINE OUT OF STEP FOR TWO DAYS IS ASKED ABOUT ONCE, and one quiet for fourteen days is marked not heard from', async () => {
  const { api, sql, clock } = await record();
  const everyday = (await rows(api, 'profiles')).find((r) => r.fields.name === 'Everyday')!;
  const now = () => new Date(clock.now()).toISOString();
  const drifted = await place(api, everyday.id, { host: 'bench-laptop', drift: ['review-helper'], since: day(NOW), heard: now() });
  const quiet = await place(api, everyday.id, { host: 'old-tower', heard: now() });
  /* WHAT EACH QUESTION ASKS IS THE LINE THAT OPENED IT (`questionOf` in the kernel's `govern.ts`). */
  const asked = () =>
    sql
      .all<{ q: string }>(
        "SELECT coalesce(e.to_v, e.note) AS q FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest' AND e.field IS NULL WHERE s.opened_by = 'rule:profile-drifted' ORDER BY e.rowid",
      )
      .map((r) => r.q);
  assert.deepEqual(asked(), [], 'a machine out of step today is not asked about yet');

  /* A DAY ON, NOT YET; TWO DAYS ON, WITH NOTHING WRITTEN, THE HOURLY SWEEP ASKS ONCE, AND THE NEXT HOUR ASKS NOTHING MORE. */
  clock.advance(DAY);
  api.kernel.purge();
  assert.deepEqual(asked(), [], 'one day out of step is not two');
  clock.advance(DAY);
  api.kernel.purge();
  assert.deepEqual(asked(), ['bench-laptop has been out of step with its profile for two days. Apply the profile there again?']);
  clock.advance(60 * 60_000);
  said(await api.update({ register: 'profile_places', seq: drifted.seq, patch: { heard: now() } } as never, owner));
  api.kernel.purge();
  assert.equal(asked().length, 1, 'the same drift was asked about twice');
  assert.equal(said<Row>(await api.get({ register: 'profile_places', seq: quiet.seq } as never, owner)).fields.state, 'live', 'two quiet days is not fourteen');

  /* FIFTEEN DAYS ON, THE MACHINE NOT HEARD FROM SINCE IS MARKED SO, AND THE ONE STILL REPORTING IS NOT. */
  clock.advance(13 * DAY);
  said(await api.update({ register: 'profile_places', seq: drifted.seq, patch: { heard: now() } } as never, owner));
  api.kernel.purge();
  const state = async (seq: number) => said<Row>(await api.get({ register: 'profile_places', seq } as never, owner)).fields.state;
  assert.equal(await state(quiet.seq), 'stale');
  assert.equal(await state(drifted.seq), 'live');
  sql.close();
});
